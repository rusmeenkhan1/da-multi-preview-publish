/**
 * EDS host: {ref}--{site}--{org}
 * @param {string} org
 * @param {string} site
 * @param {string} ref
 * @returns {string}
 */
export function buildSiteHost(org, site, ref) {
  const branch = ref || 'main';
  return `${branch}--${site}--${org}`;
}

/**
 * @param {string} helixPath e.g. /index
 * @returns {string}
 */
function pathForUrl(helixPath) {
  if (!helixPath || helixPath === '/') return '';
  return helixPath.startsWith('/') ? helixPath : `/${helixPath}`;
}

/**
 * @param {string} org
 * @param {string} site
 * @param {string} ref
 * @param {string} helixPath
 * @returns {string}
 */
export function buildPreviewUrl(org, site, ref, helixPath) {
  const host = buildSiteHost(org, site, ref);
  return `https://${host}.aem.page${pathForUrl(helixPath)}`;
}

/**
 * @param {string} org
 * @param {string} site
 * @param {string} ref
 * @param {string} helixPath
 * @returns {string}
 */
export function buildLiveUrl(org, site, ref, helixPath) {
  const host = buildSiteHost(org, site, ref);
  return `https://${host}.aem.live${pathForUrl(helixPath)}`;
}

/**
 * @param {string[]} helixPaths
 * @param {string} org
 * @param {string} site
 * @param {string} ref
 * @param {'preview'|'live'} env
 * @returns {string[]}
 */
export function buildUrlsForPaths(helixPaths, org, site, ref, env) {
  const build = env === 'live' ? buildLiveUrl : buildPreviewUrl;
  return helixPaths.map((p) => build(org, site, ref, p));
}
