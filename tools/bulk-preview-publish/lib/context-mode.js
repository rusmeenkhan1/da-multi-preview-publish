/**
 * Build the DA fullscreen app URL for this tool.
 * @param {string} org
 * @param {string} site
 * @param {string} [ref]
 * @param {string} [folderPath]
 * @returns {string}
 */
export function getFullscreenAppUrl(org, site, ref, folderPath) {
  const params = new URLSearchParams();
  if (ref && ref !== 'main') params.set('ref', ref);
  if (folderPath) params.set('path', folderPath);
  const qs = params.toString();
  const base = `https://da.live/app/${org}/${site}/tools/bulk-preview-publish`;
  return qs ? `${base}?${qs}` : base;
}

/**
 * True when running as the DA fullscreen app shell (not library side panel).
 * @returns {boolean}
 */
export function isFullscreenAppShell() {
  const { href } = window.location;
  if (href.includes('da.live/app/')) return true;
  if (window === window.top && href.includes('/tools/bulk-preview-publish')) return true;
  return false;
}

/**
 * True when embedded in the library / document editor (side panel).
 * @param {Record<string, string>} context
 * @returns {boolean}
 */
export function isLibraryEmbed(context) {
  if (context.experience === 'dialog') return true;
  if (isFullscreenAppShell()) return false;

  try {
    const parentHref = window.parent.location.href;
    if (parentHref.includes('/edit') || parentHref.includes('#/')) return true;
  } catch {
    // cross-origin parent — common in DA iframe
  }

  // Library palette is a small iframe beside the editor
  if (window.innerWidth < 720 || window.innerHeight < 520) return true;

  return window.self !== window.top;
}
