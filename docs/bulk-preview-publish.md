# Bulk Preview & Publish (DA app)

Fullscreen Document Authoring app for selecting multiple pages and running bulk preview or publish jobs.

## Library vs fullscreen (important)

| Registration | Where it appears | From org / site root? |
|--------------|------------------|------------------------|
| **Library** tab with `experience: dialog` | Side panel while **editing one document** | No |
| **Apps** tab with `https://da.live/app/...` path | [DA Apps](https://da.live/apps) for your org/site | **Yes** |

This tool is meant to be a **fullscreen app**. If you only added it under the **library** config tab (or with `experience: dialog`), authors will only see it inside a document — not when browsing the org root or folder tree.

### Fix: register on the Apps sheet

1. Open site config: `https://da.live/config#/{org}/{site}/`
2. Add or edit the **`apps`** sheet tab (not the library blocks/templates tab).
3. Add a row like:

| title | description | image | path | ref |
|-------|-------------|-------|------|-----|
| Bulk preview & publish | Select pages and preview or publish in bulk | *(optional icon URL)* | `https://da.live/app/{org}/{site}/tools/bulk-preview-publish` | |

4. Save and publish the config sheet if your workflow requires it.

5. Open from the **Apps** gallery (available without opening a document):

   `https://da.live/apps#/{org}/{site}`

   Or use the direct app URL:

   `https://da.live/app/{org}/{site}/tools/bulk-preview-publish`

### Optional: keep a library shortcut

You may keep a library row that points to the same `da.live/app/...` URL **without** `experience: dialog`, if your team wants a link from the library while editing. Bulk work from the **site root** still requires opening the app from **Apps** or the direct URL above.

### Remove wrong registration

If the tool was added like the Rollout example (`experience: dialog` + `.html` in the **library** tab), remove that row or change it to the fullscreen app path on the **apps** tab instead.

## Files (isolated under `tools/`)

- `tools/bulk-preview-publish.html` — app entry
- `tools/bulk-preview-publish/` — UI, styles, and API helpers

Site blocks, `scripts/`, and `styles/` are unchanged.

## Local development

1. `aem up` (or `npx @adobe/aem-cli up`)
2. Open in DA with local code:

   `https://da.live/app/{org}/{site}/tools/bulk-preview-publish?ref=local`

3. Standalone UI shell (no DA token):

   `http://localhost:3000/tools/bulk-preview-publish.html?org=YOUR_ORG&repo=YOUR_REPO&ref=main`

## Usage (fullscreen app)

1. Set the **folder path** (`/` = site root in DA source; e.g. `/docs` for a subfolder).
2. Choose **subfolder depth** (0 = this folder only; “All subfolders” = full tree).
3. Click **Load pages** — DA documents are listed (`index`, `nav`, `footer`, etc.) with checkboxes (all selected by default).
4. Use **Select all** / **Select none** or pick individual pages.
5. **Preview selected** — Helix bulk preview job (`.aem.page`).
6. **Publish selected** — Helix bulk publish job (`.aem.live`); requires confirmation.

Optional: **Force update** republishes even when content is unchanged.

When opened from the library panel, the UI shows **Open fullscreen app** so authors can jump to the Apps experience.

## APIs used

- `GET https://admin.da.live/list/{org}/{repo}/{path}` — list folders and pages (DA Browse API)
- `GET https://admin.da.live/source/{org}/{repo}/{path}/` — fallback directory listing
- `POST https://admin.hlx.page/preview/{org}/{site}/{ref}/*` — bulk preview
- `POST https://admin.hlx.page/live/{org}/{site}/{ref}/*` — bulk publish
- Job status URL from bulk response `links.self`

Authentication uses the [DA App SDK](https://docs.da.live/developers/guides/developing-apps-and-plugins) (`daFetch` + IMS token).

## Example apps config (multi-sheet JSON fragment)

Add an `apps` sheet to your `.da/config` multi-sheet config:

```json
"apps": {
  "total": 1,
  "data": [
    {
      "title": "Bulk preview & publish",
      "description": "Select multiple pages and preview or publish in bulk",
      "image": "",
      "path": "https://da.live/app/YOUR_ORG/YOUR_SITE/tools/bulk-preview-publish",
      "ref": ""
    }
  ]
}
```

Replace `YOUR_ORG` and `YOUR_SITE` with your DA org and site (repo) ids.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| App card shows `undefined` | Missing `description` in apps sheet | Fill the description column in config |
| **0 pages** at site root | Wrong list API (`/source/` vs DA Browse `/list/`) or old build | Deploy latest `main`; uses `admin.da.live/list/{org}/{site}` |
| Tool only in Library, not at root | Registered as library plugin | Use **apps** sheet + open via **Apps → Go** |
| Listing fails silently | Wrong path or no permission | Check status message; verify folder path |
| 404 on `.../source/.../tools/bulk-preview-publish/` | DA passed app URL as `context.path` | Leave folder path empty (content root); latest build ignores `tools/` paths |
