import {
  collectPages,
  getJobPollUrl,
  pollJob,
  startBulkJob,
} from './lib/api.js';
import {
  getFullscreenAppUrl,
  isLibraryEmbed,
} from './lib/context-mode.js';
import { displayPath, normalizeFolderPath } from './lib/paths.js';

const SDK_URL = 'https://da.live/nx/utils/sdk.js';
const SDK_TIMEOUT_MS = 8000;

/** @type {PageEntry[]} */
let pages = [];
/** @type {Set<string>} */
const selected = new Set();

/**
 * @typedef {{ helixPath: string, sourcePath: string, name: string }} PageEntry
 */

/**
 * @returns {Promise<{
 *   context: Record<string, string>,
 *   token?: string,
 *   actions: Record<string, unknown>,
 * }>}
 */
async function initSdk() {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('DA SDK not available')), SDK_TIMEOUT_MS);
  });

  try {
    const mod = await import(SDK_URL);
    const sdk = await Promise.race([mod.default, timeout]);
    const { context = {}, token, actions = {} } = sdk;
    return {
      context,
      token,
      actions,
    };
  } catch {
    const params = new URLSearchParams(window.location.search);
    const org = params.get('org') || 'local-org';
    const repo = params.get('repo') || 'local-repo';
    const ref = params.get('ref') || 'main';
    const path = params.get('path') || '';
    return {
      context: {
        org, repo, ref, path,
      },
      actions: { daFetch: fetch },
    };
  }
}

/**
 * @param {Record<string, string>} context
 * @returns {{ org: string, site: string, ref: string, folderPath: string }}
 */
function resolveSiteContext(context) {
  const params = new URLSearchParams(window.location.search);
  const org = context.org || context.owner || '';
  const site = context.repo || context.site || '';
  const ref = context.ref || params.get('ref') || 'main';
  const folderPath = normalizeFolderPath(
    context.path
    || context.pathname
    || context.folder
    || params.get('path')
    || '',
  );
  return {
    org, site, ref, folderPath,
  };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function render(root, state) {
  const {
    org,
    site,
    ref,
    folderPath,
    loading,
    error,
    status,
    statusType,
    jobDetail,
    libraryEmbed,
    fullscreenAppUrl,
  } = state;

  root.replaceChildren();

  if (libraryEmbed) {
    const banner = el('section', 'bulk-pp-panel bulk-pp-library-banner');
    banner.append(el('h2', null, 'Open from site root or any folder'));
    banner.append(
      el('p', null, 'The Library panel only appears while editing a single document. '
        + 'To bulk preview or publish from the org root or document tree, use the fullscreen Apps entry.'),
    );
    const openBtn = el('button', 'bulk-pp-open-app', 'Open fullscreen app');
    openBtn.type = 'button';
    openBtn.addEventListener('click', () => state.onOpenFullscreen());
    banner.append(openBtn);
    const link = document.createElement('a');
    link.href = fullscreenAppUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'bulk-pp-apps-link';
    link.textContent = 'Or open Apps page';
    banner.append(link);
    root.append(banner);
  }

  const header = el('header', 'bulk-pp-header');
  header.append(
    el('h1', null, 'Bulk Preview & Publish'),
    el('p', null, `Site: ${org} / ${site} · branch: ${ref}`),
  );
  root.append(header);

  const browse = el('section', 'bulk-pp-panel');
  browse.append(el('h2', null, 'Content path'));
  const row = el('div', 'bulk-pp-row');

  const pathField = el('div', 'bulk-pp-field');
  pathField.append(el('label', null, 'Folder path'));
  const pathInput = document.createElement('input');
  pathInput.type = 'text';
  pathInput.placeholder = '/ (site root)';
  pathInput.value = folderPath;
  pathInput.id = 'bulk-pp-path';
  pathField.append(pathInput);
  row.append(pathField);

  const depthField = el('div', 'bulk-pp-field');
  depthField.append(el('label', null, 'Subfolder depth'));
  const depthSelect = document.createElement('select');
  depthSelect.id = 'bulk-pp-depth';
  [
    ['0', 'This folder only'],
    ['1', '1 level down'],
    ['2', '2 levels down'],
    ['3', '3 levels down'],
    ['-1', 'All subfolders'],
  ].forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === String(state.maxDepth)) opt.selected = true;
    depthSelect.append(opt);
  });
  depthField.append(depthSelect);
  row.append(depthField);

  const loadBtn = el('button', 'bulk-pp-btn bulk-pp-btn-primary', 'Load pages');
  loadBtn.type = 'button';
  loadBtn.disabled = loading;
  row.append(loadBtn);
  browse.append(row);
  root.append(browse);

  const listPanel = el('section', 'bulk-pp-panel');
  listPanel.append(el('h2', null, 'Pages'));

  const topActions = el('div', 'bulk-pp-actions-top');
  const selectAllBtn = el('button', 'bulk-pp-btn', 'Select all');
  const selectNoneBtn = el('button', 'bulk-pp-btn', 'Select none');
  selectAllBtn.type = 'button';
  selectNoneBtn.type = 'button';
  topActions.append(selectAllBtn, selectNoneBtn);
  listPanel.append(topActions);

  const listWrap = el('div', 'bulk-pp-list-wrap');
  const list = el('ul', 'bulk-pp-list');

  if (loading) {
    list.append(el('li', null, 'Loading pages…'));
  } else if (error) {
    list.append(el('li', null, error));
  } else if (pages.length === 0) {
    list.append(el('li', null, 'No pages found. Adjust the path or depth and click Load pages.'));
  } else {
    pages.forEach((page) => {
      const li = el('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = page.helixPath;
      cb.checked = selected.has(page.helixPath);
      cb.id = `page-${page.helixPath.replace(/\W/g, '_')}`;
      const label = document.createElement('label');
      label.htmlFor = cb.id;
      label.textContent = displayPath(page.helixPath);
      li.append(cb, label);
      list.append(li);
    });
  }

  listWrap.append(list);
  listPanel.append(listWrap);
  listPanel.append(
    el('p', 'bulk-pp-meta', `${selected.size} of ${pages.length} selected`),
  );
  root.append(listPanel);

  const runPanel = el('section', 'bulk-pp-panel');
  runPanel.append(el('h2', null, 'Actions'));

  const options = el('div', 'bulk-pp-options');
  const forceLabel = document.createElement('label');
  const forceCb = document.createElement('input');
  forceCb.type = 'checkbox';
  forceCb.id = 'bulk-pp-force';
  forceLabel.append(forceCb, document.createTextNode('Force update (republish even if unchanged)'));
  options.append(forceLabel);
  runPanel.append(options);

  const runRow = el('div', 'bulk-pp-row');
  const previewBtn = el('button', 'bulk-pp-btn bulk-pp-btn-primary', 'Preview selected');
  const publishBtn = el('button', 'bulk-pp-btn bulk-pp-btn-danger', 'Publish selected');
  previewBtn.type = 'button';
  publishBtn.type = 'button';
  previewBtn.disabled = loading || selected.size === 0;
  publishBtn.disabled = loading || selected.size === 0;
  runRow.append(previewBtn, publishBtn);
  runPanel.append(runRow);
  root.append(runPanel);

  if (status) {
    const statusEl = el('div', `bulk-pp-status bulk-pp-status-${statusType || 'info'}`);
    const title = el('strong', null, status);
    statusEl.append(title);
    if (jobDetail) {
      const pre = el('pre', 'bulk-pp-error-detail', jobDetail);
      statusEl.append(pre);
    }
    root.append(statusEl);
  }

  pathInput.addEventListener('change', () => {
    state.folderPath = normalizeFolderPath(pathInput.value);
  });

  loadBtn.addEventListener('click', () => state.onLoad());
  selectAllBtn.addEventListener('click', () => state.onSelectAll(true));
  selectNoneBtn.addEventListener('click', () => state.onSelectAll(false));

  list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const { checked, value } = /** @type {HTMLInputElement} */ (e.target);
      if (checked) selected.add(value);
      else selected.delete(value);
      state.onSelectionChange();
    });
  });

  previewBtn.addEventListener('click', () => state.onRun('preview'));
  publishBtn.addEventListener('click', () => state.onRun('live'));
}

async function main() {
  const app = document.getElementById('app');
  if (!app) return;

  const { context, actions } = await initSdk();
  const { daFetch: sdkFetch, setHref } = actions;
  const daFetch = typeof sdkFetch === 'function' ? sdkFetch : fetch;
  const ctx = resolveSiteContext(context);
  const libraryEmbed = isLibraryEmbed(context);
  const fullscreenAppUrl = getFullscreenAppUrl(
    ctx.org,
    ctx.site,
    ctx.ref,
    ctx.folderPath,
  );

  /** @type {Record<string, unknown>} */
  const state = {
    org: ctx.org,
    site: ctx.site,
    ref: ctx.ref,
    folderPath: ctx.folderPath,
    libraryEmbed,
    fullscreenAppUrl,
    maxDepth: 0,
    loading: false,
    error: null,
    status: null,
    statusType: 'info',
    jobDetail: null,

    onOpenFullscreen() {
      if (typeof setHref === 'function') {
        setHref(fullscreenAppUrl);
        return;
      }
      window.open(fullscreenAppUrl, '_blank', 'noopener');
    },

    async onLoad() {
      const pathInput = document.getElementById('bulk-pp-path');
      const depthSelect = document.getElementById('bulk-pp-depth');
      state.folderPath = normalizeFolderPath(
        pathInput instanceof HTMLInputElement ? pathInput.value : state.folderPath,
      );
      state.maxDepth = depthSelect instanceof HTMLSelectElement
        ? Number(depthSelect.value)
        : 0;

      if (!state.org || !state.site) {
        state.error = 'Missing org or site in DA context. Open this app from Document Authoring.';
        state.loading = false;
        render(app, state);
        return;
      }

      state.loading = true;
      state.error = null;
      state.status = 'Loading pages…';
      state.statusType = 'info';
      render(app, state);

      try {
        pages = await collectPages(
          daFetch,
          state.org,
          state.site,
          state.folderPath,
          state.maxDepth,
        );
        selected.clear();
        pages.forEach((p) => selected.add(p.helixPath));
        state.error = null;
        state.status = `Loaded ${pages.length} page(s).`;
        state.statusType = 'success';
      } catch (err) {
        pages = [];
        selected.clear();
        state.error = err.message || 'Failed to load pages.';
        state.status = null;
      } finally {
        state.loading = false;
        render(app, state);
      }
    },

    onSelectAll(checked) {
      if (checked) pages.forEach((p) => selected.add(p.helixPath));
      else selected.clear();
      state.onSelectionChange();
    },

    onSelectionChange() {
      state.status = `${selected.size} of ${pages.length} selected.`;
      state.statusType = 'info';
      render(app, state);
    },

    async onRun(topic) {
      const paths = [...selected];
      if (paths.length === 0) return;

      const forceEl = document.getElementById('bulk-pp-force');
      const forceUpdate = forceEl instanceof HTMLInputElement && forceEl.checked;

      if (topic === 'live') {
        // eslint-disable-next-line no-alert -- publish requires explicit author confirmation
        if (!window.confirm(
          `Publish ${paths.length} page(s) to LIVE?\n\nThis updates the production site.`,
        )) return;
      }

      state.loading = true;
      state.status = topic === 'live'
        ? `Starting bulk publish for ${paths.length} page(s)…`
        : `Starting bulk preview for ${paths.length} page(s)…`;
      state.statusType = 'info';
      state.jobDetail = null;
      render(app, state);

      try {
        const bulkResp = await startBulkJob(
          daFetch,
          state.org,
          state.site,
          state.ref,
          topic,
          paths,
          { forceUpdate },
        );

        const jobUrl = getJobPollUrl(bulkResp, state.org, state.site, state.ref, topic);
        if (!jobUrl) {
          state.status = topic === 'live'
            ? `Bulk publish scheduled (${paths.length} paths).`
            : `Bulk preview scheduled (${paths.length} paths).`;
          state.statusType = 'success';
          state.jobDetail = JSON.stringify(bulkResp, null, 2);
          return;
        }

        state.status = 'Job running…';
        const finalJob = await pollJob(daFetch, jobUrl, (job) => {
          const progress = job.progress || job.job?.progress;
          if (progress && typeof progress === 'object') {
            const {
              total, processed, failed,
            } = /** @type {{ total?: number, processed?: number, failed?: number }} */ (
              progress
            );
            state.status = `Job: ${job.state || 'running'} — ${processed ?? 0}/${total ?? '?'} processed (${failed ?? 0} failed)`;
            render(app, state);
          }
        });

        const finalState = finalJob?.state || 'unknown';
        state.status = topic === 'live'
          ? `Bulk publish finished: ${finalState}`
          : `Bulk preview finished: ${finalState}`;
        state.statusType = finalState === 'succeeded' ? 'success' : 'error';
        state.jobDetail = JSON.stringify(finalJob, null, 2);
      } catch (err) {
        state.status = err.message || 'Operation failed.';
        state.statusType = 'error';
        if (err.data) state.jobDetail = JSON.stringify(err.data, null, 2);
      } finally {
        state.loading = false;
        render(app, state);
      }
    },
  };

  if (!ctx.org || !ctx.site) {
    state.error = 'Open from DA (da.live) so org and site are provided, or use ?org=&repo=&ref= for local UI testing.';
    render(app, state);
    return;
  }

  state.status = 'Set a folder path and click Load pages.';
  render(app, state);
  await state.onLoad();
}

main();
