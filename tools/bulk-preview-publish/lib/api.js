import {
  DA_ADMIN,
  HLX_ADMIN,
  dedupePaths,
  getEntryName,
  isFolderEntry,
  isPageDocument,
  joinPath,
  normalizeFolderPath,
  toHelixPath,
} from './paths.js';

/**
 * @param {Response} resp
 * @returns {Promise<unknown>}
 */
async function parseJson(resp) {
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {unknown} data
 * @returns {Array<Record<string, unknown>>}
 */
function normalizeListing(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const obj = /** @type {{ items?: unknown[] }} */ (data);
    if (Array.isArray(obj.items)) return obj.items;
  }
  return [];
}

/**
 * Normalize DA list API items (same shape as da.live nx2 hlx6ToDaList).
 * @param {string} org
 * @param {string} repo
 * @param {string} folderPath
 * @param {unknown} raw
 * @returns {Record<string, unknown>[]}
 */
function normalizeListItems(org, repo, folderPath, raw) {
  const parentPath = `/${org}/${repo}${folderPath ? `/${folderPath}` : ''}`;
  return normalizeListing(raw).map((entry) => {
    const item = /** @type {Record<string, unknown>} */ (entry);
    const rawName = String(item.name || '');
    const isFolder = rawName.endsWith('/')
      || String(item['content-type'] || item.contentType || '').includes('folder');
    let name = rawName.replace(/\/$/, '');
    let ext = String(item.ext || '').toLowerCase();

    if (!ext && name.includes('.')) {
      const parts = name.split('.');
      if (parts.length > 1) {
        ext = parts.pop().toLowerCase();
        name = parts.join('.');
      }
    }

    const contentType = item.contentType || item['content-type'] || '';
    const path = item.path || (isFolder ? `${parentPath}/${name}/` : `${parentPath}/${name}`);

    return {
      ...item,
      name: isFolder ? `${name}/` : name,
      path,
      ext,
      contentType,
      'content-type': contentType,
      isFolder,
    };
  });
}

/**
 * Fetch paginated JSON from a DA admin URL.
 * @param {Function} daFetch
 * @param {string} url
 * @returns {Promise<unknown[]>}
 */
async function fetchPaginated(daFetch, url) {
  /** @type {unknown[]} */
  const all = [];
  let continuationToken = null;

  /* eslint-disable no-await-in-loop -- paginated listing */
  do {
    const opts = continuationToken
      ? { method: 'GET', headers: { 'da-continuation-token': continuationToken } }
      : { method: 'GET' };
    const resp = await daFetch(url, opts);

    if (resp.status === 404) return all;
    if (!resp.ok) {
      const err = new Error(`Could not list folder (${resp.status})`);
      err.status = resp.status;
      throw err;
    }

    const data = await parseJson(resp);
    all.push(...normalizeListing(data));
    continuationToken = resp.headers.get('da-continuation-token')
      || resp.headers.get('x-da-continuation-token');
  } while (continuationToken);
  /* eslint-enable no-await-in-loop */

  return all;
}

/**
 * List folder contents. DA Browse uses /list/; /source/ is for file bodies.
 * @param {Function} daFetch
 * @param {string} org
 * @param {string} repo
 * @param {string} folderPath
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function listFolder(daFetch, org, repo, folderPath) {
  const normalized = normalizeFolderPath(folderPath);
  const listPath = normalized ? `/${normalized}` : '';
  const listUrl = `${DA_ADMIN}/list/${org}/${repo}${listPath}`;

  const raw = await fetchPaginated(daFetch, listUrl);
  if (raw.length > 0) {
    return normalizeListItems(org, repo, normalized, raw);
  }

  // HLX6 sites may use source directory listing; skip for invalid/app paths
  const suffix = normalized ? `${normalized}/` : '';
  if (!suffix || suffix.includes('tools/')) {
    return [];
  }

  const sourceUrl = `${DA_ADMIN}/source/${org}/${repo}/${suffix}`;
  const sourceRaw = await fetchPaginated(daFetch, sourceUrl);
  return normalizeListItems(org, repo, normalized, sourceRaw);
}

/**
 * @typedef {{ helixPath: string, sourcePath: string, name: string }} PageEntry
 */

/**
 * Collect HTML pages under a folder up to maxDepth.
 * maxDepth 0 = this folder only; -1 = unlimited.
 * @param {Function} daFetch
 * @param {string} org
 * @param {string} repo
 * @param {string} rootPath
 * @param {number} maxDepth
 * @returns {Promise<PageEntry[]>}
 */
export async function collectPages(daFetch, org, repo, rootPath, maxDepth) {
  const unlimited = maxDepth < 0;
  /** @type {PageEntry[]} */
  const pages = [];

  /**
   * @param {string} folder
   * @param {number} depth
   */
  async function walk(folder, depth) {
    const entries = await listFolder(daFetch, org, repo, folder);
    const subfolders = [];

    entries.forEach((entry) => {
      const name = getEntryName(entry);
      if (isFolderEntry(entry)) {
        const folderName = String(entry.name || name).replace(/\/$/, '');
        if (folderName) subfolders.push(joinPath(folder, folderName));
        return;
      }
      if (isPageDocument(entry)) {
        pages.push({
          name,
          sourcePath: joinPath(folder, name),
          helixPath: toHelixPath(folder, name),
        });
      }
    });

    if (!unlimited && depth >= maxDepth) return;

    await Promise.all(subfolders.map((sub) => walk(sub, depth + 1)));
  }

  await walk(normalizeFolderPath(rootPath), 0);
  const byPath = new Map();
  pages.forEach((p) => byPath.set(p.helixPath, p));
  return [...byPath.values()].sort((a, b) => a.helixPath.localeCompare(b.helixPath));
}

/**
 * @param {Function} daFetch
 * @param {string} org
 * @param {string} site
 * @param {string} ref
 * @param {'preview'|'live'} topic
 * @param {string[]} paths
 * @param {{ forceUpdate?: boolean }} options
 * @returns {Promise<Record<string, unknown>>}
 */
export async function startBulkJob(daFetch, org, site, ref, topic, paths, options = {}) {
  const unique = dedupePaths(paths);
  if (unique.length === 0) {
    throw new Error('No pages selected.');
  }

  const route = topic === 'live' ? 'live' : 'preview';
  const url = `${HLX_ADMIN}/${route}/${org}/${site}/${ref}/*`;
  const body = {
    paths: unique,
    forceUpdate: Boolean(options.forceUpdate),
    forceAsync: unique.length > 5,
  };

  const resp = await daFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await parseJson(resp);
  if (!resp.ok && resp.status !== 202) {
    const message = data?.message || data?.error || `Bulk ${topic} failed (${resp.status})`;
    const err = new Error(message);
    err.status = resp.status;
    err.data = data;
    throw err;
  }

  return data || { status: resp.status };
}

/**
 * Poll job until terminal state.
 * @param {Function} daFetch
 * @param {string} jobUrl
 * @param {(job: Record<string, unknown>) => void} [onProgress]
 * @returns {Promise<Record<string, unknown>>}
 */
async function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

export async function pollJob(daFetch, jobUrl, onProgress) {
  const terminal = new Set(['stopped', 'succeeded', 'failed', 'cancelled']);
  let last = null;
  let i = 0;

  /* eslint-disable no-await-in-loop -- job polling is intentionally sequential */
  while (i < 120) {
    i += 1;
    const resp = await daFetch(jobUrl, { method: 'GET' });
    const data = await parseJson(resp);
    if (data) {
      last = data;
      if (onProgress) onProgress(data);
      const state = data.state || data.job?.state;
      if (state && terminal.has(String(state))) return data;
    }
    await sleep(2000);
  }
  /* eslint-enable no-await-in-loop */

  return last || { state: 'timeout' };
}

/**
 * Map Helix job result to UI status (stopped with 0 failed = success).
 * @param {Record<string, unknown>} job
 * @returns {{ statusType: 'success'|'error'|'info', message: string }}
 */
export function resolveJobOutcome(job) {
  const state = String(job?.state || 'unknown');
  const progress = job?.progress || job?.job?.progress || {};

  const failed = Number(progress.failed ?? 0);
  const success = Number(progress.success ?? 0);
  const processed = Number(progress.processed ?? 0);
  const total = Number(progress.total ?? 0);
  const completed = success || processed || total;

  if (state === 'failed' || failed > 0) {
    return {
      statusType: 'error',
      message: `finished with ${failed} failed`,
    };
  }

  if (state === 'succeeded' || (failed === 0 && completed > 0)) {
    const count = success || processed || total;
    return {
      statusType: 'success',
      message: `completed successfully${count ? ` (${count} page${count === 1 ? '' : 's'})` : ''}`,
    };
  }

  if (state === 'cancelled') {
    return { statusType: 'info', message: 'was cancelled' };
  }

  if (state === 'timeout') {
    return { statusType: 'info', message: 'timed out — check job status in DA' };
  }

  return { statusType: 'info', message: `finished (${state})` };
}

/**
 * Resolve job self link from bulk response.
 * @param {Record<string, unknown>} bulkResponse
 * @param {string} org
 * @param {string} site
 * @param {string} ref
 * @param {'preview'|'live'} topic
 * @returns {string|null}
 */
export function getJobPollUrl(bulkResponse, org, site, ref, topic) {
  const { links, job } = bulkResponse || {};
  if (links && typeof links === 'object') {
    const { self } = /** @type {{ self?: string }} */ (links);
    if (self) return self;
  }

  if (job && typeof job === 'object') {
    const { name } = /** @type {{ name?: string }} */ (job);
    if (name) return `${HLX_ADMIN}/job/${org}/${site}/${ref}/${topic}/${name}`;
  }

  return null;
}
