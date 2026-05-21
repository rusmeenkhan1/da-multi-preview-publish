const DA_ADMIN = 'https://admin.da.live';
const HLX_ADMIN = 'https://admin.hlx.page';

export { DA_ADMIN, HLX_ADMIN };

/**
 * Normalize a DA source folder path (no leading/trailing slashes).
 * @param {string} path
 * @returns {string}
 */
export function normalizeFolderPath(path) {
  if (!path || path === '/') return '';
  return path.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Folder path for the UI input (empty = site root).
 * @param {string} path internal normalized path
 * @returns {string}
 */
export function displayFolderPath(path) {
  const normalized = normalizeFolderPath(path);
  if (!normalized) return '';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

/**
 * DA may pass the app route (tools/bulk-preview-publish) as context.path — not content.
 * @param {string} path
 * @returns {boolean}
 */
export function isAppRoutePath(path) {
  const normalized = normalizeFolderPath(path);
  if (!normalized) return false;
  if (normalized === 'tools' || normalized.startsWith('tools/')) return true;
  return normalized.includes('bulk-preview-publish') && normalized.startsWith('tools');
}

/**
 * Resolve folder path for content listing (never the tool's own /tools/... route).
 * @param  {...string} candidates
 * @returns {string}
 */
export function resolveContentFolderPath(...candidates) {
  const found = candidates.find((p) => p != null && String(p).trim() !== '');
  if (!found) return '';
  const normalized = normalizeFolderPath(String(found));
  if (isAppRoutePath(normalized)) return '';
  return normalized;
}

/**
 * Join folder segments.
 * @param  {...string} parts
 * @returns {string}
 */
export function joinPath(...parts) {
  return parts
    .map((p) => normalizeFolderPath(p))
    .filter(Boolean)
    .join('/');
}

/**
 * @param {{ name: string, 'content-type'?: string, ext?: string }} item
 * @returns {boolean}
 */
/**
 * @param {Record<string, unknown>} item
 * @returns {string}
 */
export function getContentType(item) {
  return String(item.contentType || item['content-type'] || '').toLowerCase();
}

export function isFolderEntry(item) {
  if (item.isFolder || item.folder) return true;
  const name = String(item.name || '');
  const path = String(item.path || '');
  if (name.endsWith('/') || path.endsWith('/')) return true;
  const type = getContentType(item);
  if (type === 'application/folder' || type.includes('folder')) return true;
  return false;
}

/** MIME types that are never bulk preview/publish pages */
const NON_PAGE_CONTENT_TYPES = [
  'application/json',
  'application/pdf',
  'application/folder',
];

/**
 * File extensions that are not HTML pages in DA.
 */
const NON_PAGE_EXTENSIONS = new Set([
  'json', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'pdf', 'mp4', 'webp', 'ico',
]);

/**
 * @param {Record<string, unknown>} item
 * @returns {string}
 */
export function getEntryName(item) {
  const name = String(item.name || '').replace(/\/$/, '');
  if (name) return name;
  const path = String(item.path || '');
  if (!path) return '';
  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
}

/**
 * DA lists pages as documents (e.g. index, nav, footer) — not always *.html names.
 * @param {Record<string, unknown>} item
 * @returns {boolean}
 */
export function isPageDocument(item) {
  if (isFolderEntry(item)) return false;

  const name = getEntryName(item);
  if (!name) return false;

  const contentType = getContentType(item);
  const ext = String(item.ext || '').toLowerCase();

  if (contentType === 'text/html') return true;
  if (ext === 'html') return true;
  if (name.endsWith('.html')) return true;
  if (item.type === 'document' || item.kind === 'document') return true;

  if (ext && NON_PAGE_EXTENSIONS.has(ext)) return false;
  if (NON_PAGE_CONTENT_TYPES.some((t) => contentType === t || contentType.startsWith(`${t};`))) {
    return false;
  }
  if (contentType.startsWith('image/') || contentType.startsWith('video/')) return false;
  if (name.endsWith('.json') || ext === 'json') return false;

  // DA browse: documents without extension in the name (index, nav, footer)
  if (!ext && !contentType) return true;
  if (!ext && contentType && !contentType.includes('json')) return true;

  return false;
}

/** @deprecated Use isPageDocument */
export const isHtmlPage = isPageDocument;

/**
 * DA source path (e.g. drafts/foo/page.html) → Helix bulk path (/drafts/foo/page).
 * @param {string} folderPath
 * @param {string} fileName
 * @returns {string}
 */
export function toHelixPath(folderPath, fileName) {
  const base = joinPath(folderPath, fileName.replace(/\.html$/i, ''));
  return base ? `/${base}` : '/';
}

/**
 * @param {string} helixPath
 * @returns {string} display label
 */
export function displayPath(helixPath) {
  return helixPath || '/';
}

/**
 * @param {string[]} paths
 * @returns {string[]}
 */
export function dedupePaths(paths) {
  return [...new Set(paths.filter(Boolean))];
}
