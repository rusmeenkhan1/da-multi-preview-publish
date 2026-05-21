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
export function isFolderEntry(item) {
  if (!item?.name) return false;
  const { name } = item;
  if (name.endsWith('/')) return true;
  const type = item['content-type'] || '';
  return type === 'application/folder' || type.includes('folder');
}

/**
 * @param {{ name: string, ext?: string }} item
 * @returns {boolean}
 */
export function isHtmlPage(item) {
  const { name = '' } = item;
  if (isFolderEntry(item)) return false;
  if (item.ext === 'html') return true;
  return name.endsWith('.html');
}

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
