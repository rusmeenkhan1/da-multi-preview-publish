# Bulk Preview & Publish (DA app)

Fullscreen Document Authoring app for selecting multiple pages and running bulk preview or publish jobs.

## Files (isolated under `tools/`)

- `tools/bulk-preview-publish.html` — app entry
- `tools/bulk-preview-publish/` — UI, styles, and API helpers

No site blocks, `scripts/`, or `styles/` were changed.

## Open in DA

1. Register in the site **apps** config sheet at `https://da.live/config#/{org}/{site}/`:

   | title | description | path |
   |-------|-------------|------|
   | Bulk preview & publish | Select pages and preview or publish in bulk | `https://da.live/app/{org}/{site}/tools/bulk-preview-publish` |

2. Open from **Apps** or directly:

   `https://da.live/app/{org}/{site}/tools/bulk-preview-publish`

3. Local development with AEM CLI (`aem up`):

   `https://da.live/app/{org}/{site}/tools/bulk-preview-publish?ref=local`

## Usage

1. Set the **folder path** (empty = site root in DA source).
2. Choose **subfolder depth** (0 = this folder only; “All subfolders” = full tree).
3. Click **Load pages** — HTML documents are listed with checkboxes (all selected by default).
4. Use **Select all** / **Select none** or pick individual pages.
5. **Preview selected** — Helix bulk preview job (`.aem.page`).
6. **Publish selected** — Helix bulk publish job (`.aem.live`); requires confirmation.

Optional: **Force update** republishes even when content is unchanged.

## APIs used

- `GET https://admin.da.live/source/{org}/{repo}/{path}/` — list folders and pages
- `POST https://admin.hlx.page/preview/{org}/{site}/{ref}/*` — bulk preview
- `POST https://admin.hlx.page/live/{org}/{site}/{ref}/*` — bulk publish
- Job status URL from bulk response `links.self`

Authentication is handled by the [DA App SDK](https://docs.da.live/developers/guides/developing-apps-and-plugins) (`daFetch` + IMS token).

## Local UI-only test

Without DA iframe, open:

`http://localhost:3000/tools/bulk-preview-publish.html?org=YOUR_ORG&repo=YOUR_REPO&ref=main`

Listing and bulk jobs require opening from DA with a valid token.
