import type { AppEnv } from "../env";
import { findDocument } from "../lib/lookup";

// Browsable web UI for the lutaml cloud store. Every page is server-rendered
// HTML served by the same routes that answer JSON to API clients — the
// content type follows the request's Accept header, never a different URL.
// Branding matches relaton.org (Outfit, #1F6CF1).

interface FlavorRow {
  flavor: string;
  doc_count: number;
  last_modified: string | null;
  ingested_at: string;
}

interface EntryRow {
  r2_key: string;
  docid: string | null;
}

const PAGE_SIZE = 50;

export function wantsHtml(accept: string | undefined): boolean {
  return (accept ?? "").includes("text/html");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="icon" type="image/svg+xml" href="https://relaton.org/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<meta name="theme-color" content="#1F6CF1">
<style>
  :root {
    --bg: #ffffff; --bg-soft: #f8fafb; --bg-mute: #f1f4f7;
    --fg: #1C2126; --fg-2: #3D4854; --muted: #64748B; --border: #E2E8F0;
    --accent: #1F6CF1; --accent-soft: rgba(31, 108, 241, 0.1);
    --code-bg: #f6f8fa; --aqua: #008A64;
    --font: 'Outfit', ui-sans-serif, system-ui, -apple-system, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0B0F13; --bg-soft: #111820; --bg-mute: #171F28;
      --fg: #E8ECF0; --fg-2: #A0AEBE; --muted: #5F7082; --border: #1E2A36;
      --accent: #4D88F3; --accent-soft: rgba(31, 108, 241, 0.15);
      --code-bg: #10151b; --aqua: #21C197;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 16px/1.6 var(--font);
    -webkit-font-smoothing: antialiased;
  }
  .site-header {
    position: sticky; top: 0; z-index: 10;
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(16px) saturate(180%);
    border-bottom: 1px solid var(--border);
  }
  .site-header nav {
    max-width: 1088px; margin: 0 auto; padding: 0 24px;
    height: 55px; display: flex; align-items: center; justify-content: space-between;
  }
  .brand {
    display: flex; align-items: center; gap: 8px; text-decoration: none;
    color: var(--fg); font-weight: 700; font-size: 18px; letter-spacing: -0.02em;
  }
  .brand:hover { color: var(--accent); }
  .brand svg { display: block; }
  .site-header .links { display: flex; gap: 18px; font-size: 14px; font-weight: 500; }
  .site-header .links a { color: var(--fg-2); text-decoration: none; }
  .site-header .links a:hover { color: var(--fg); }
  main { max-width: 1088px; margin: 0 auto; padding: 40px 24px 64px; }
  h1 { font-size: 30px; letter-spacing: -0.02em; margin: 0 0 6px; font-weight: 700; }
  h1 a { color: inherit; text-decoration: none; }
  .sub { color: var(--muted); margin: 0 0 28px; }
  .sub a, .meta a, footer a { color: var(--accent); }
  table { width: 100%; border-collapse: collapse; font-size: 15px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-size: 13px; font-weight: 600; }
  td a { color: var(--accent); text-decoration: none; font-family: var(--mono); font-size: 14px; }
  td a:hover { text-decoration: underline; }
  .num { text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
  .toolbar { display: flex; gap: 8px; margin: 0 0 16px; flex-wrap: wrap; }
  .toolbar input {
    flex: 1; min-width: 220px; padding: 10px 12px; font-size: 15px; font-family: var(--mono);
    border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--fg);
  }
  .toolbar button, .pager a, .pager span {
    padding: 10px 16px; font-size: 14px; border-radius: 8px;
    border: 1px solid var(--border); background: var(--bg); color: var(--fg); text-decoration: none;
  }
  .toolbar button { background: var(--accent); border-color: var(--accent); color: #fff; cursor: pointer; }
  .pager { display: flex; gap: 8px; margin-top: 18px; align-items: center; }
  .pager .info { color: var(--muted); font-size: 13px; margin-right: auto; }
  .tabs { display: flex; gap: 2px; margin: 0 0 0; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .tab-btn {
    padding: 10px 16px; font-size: 14px; font-weight: 500; font-family: var(--font);
    border: none; background: none; color: var(--muted); cursor: pointer;
    border-bottom: 2px solid transparent; margin-bottom: -1px;
  }
  .tab-btn:hover { color: var(--fg); }
  .tab-btn[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
  .tab-btn code { font-family: var(--mono); font-size: 13px; }
  pre {
    background: var(--code-bg); border: 1px solid var(--border); border-radius: 0 0 8px 8px;
    border-top: none; margin: 0;
    padding: 16px 18px; overflow-x: auto; font-size: 13px; line-height: 1.55;
    font-family: var(--mono);
    white-space: pre-wrap; word-break: break-word;
  }
  .meta { color: var(--muted); font-size: 13px; margin: 0 0 18px; }
  footer { margin-top: 48px; color: var(--muted); font-size: 13px;
           border-top: 1px solid var(--border); padding-top: 16px; }
  @media (max-width: 720px) {
    .site-header .links { display: none; }
  }
</style>
</head>
<body>
<header class="site-header">
<nav>
  <a class="brand" href="/" title="Relaton cloud database">
    <svg width="26" height="26" viewBox="0 0 351.24 351.66" fill="none" aria-hidden="true">
      <path d="M276.31,242.07c-4.44,2.78-8.88,5.54-13.31,8.32c-24.96,15.62-49.91,31.25-74.9,46.83c-1.09,0.68-1.35,1.28-1.16,2.53c2.26,15.33-2.14,28.54-13.12,39.42c-7.38,7.31-16.42,11.41-26.79,12.32c-23.06,2.02-43.31-12.81-48.04-35.45c-2.97-14.23,0.47-27.08,9.77-38.3c0.63-0.76,0.68-1.2,0.16-2.03c-18.27-29.23-36.52-58.47-54.74-87.73c-0.45-0.72-0.9-0.94-1.73-0.8c-23.2,4.18-46.18-10.87-51.44-34.68c-5.32-24.06,10.58-48.68,34.73-53.38c14.55-2.83,27.47,0.68,38.74,10.3c0.09,0.08,0.19,0.14,0.4,0.3c0.32-0.2,0.69-0.41,1.05-0.64c29.19-18.27,58.38-36.55,87.58-54.81c0.71-0.45,0.96-0.87,0.81-1.72c-4.21-23.05,10.72-45.91,33.47-51.3c25.01-5.92,49.57,9.64,54.55,34.86c2.76,13.98-0.61,26.61-9.66,37.68c-0.33,0.4-0.67,0.79-1.03,1.22c3.53,5.65,7.04,11.27,10.54,16.89c14.9,23.89,29.8,47.78,44.69,71.69c0.5,0.8,0.96,1.17,1.98,0.98c21.29-3.76,42.25,8.46,49.67,28.91c9.37,25.82-6.6,54.21-33.54,59.31c-14.16,2.68-26.86-0.8-37.92-10.08C276.84,242.51,276.6,242.31,276.31,242.07z" fill="currentColor" opacity="0.9"/>
    </svg>
    Relaton cloud database
  </a>
  <div class="links">
    <a href="https://relaton.org/">relaton.org</a>
    <a href="/docs">API reference</a>
    <a href="/graphql">GraphQL</a>
    <a href="https://github.com/relaton" rel="noopener">GitHub</a>
  </div>
</nav>
</header>
<main>
${body}
<footer>Served by a Cloudflare Worker over D1 + R2 · contract: the lutaml cloud store API ·
an open source project by <a href="https://www.ribose.com" rel="noopener">Ribose</a></footer>
</main>
</body>
</html>`;
}

/** Browsable list of collections. */
export async function renderCollections(db: D1Database): Promise<string> {
  const { results } = await db.prepare(
    "SELECT flavor, doc_count, last_modified FROM flavors ORDER BY flavor",
  ).all<FlavorRow>();

  const rows = (results ?? [])
    .map((f) => {
      const updated = f.last_modified ?? "";
      return `<tr><td><a href="/collections/${escapeHtml(f.flavor)}">${escapeHtml(f.flavor)}</a></td>` +
        `<td class="num">${f.doc_count.toLocaleString("en-US")}</td>` +
        `<td class="num">${escapeHtml(updated.slice(0, 10))}</td></tr>`;
    })
    .join("\n");

  return layout(
    "Collections — Relaton cloud database",
    `<h1>Collections</h1>
<p class="sub">${(results ?? []).length.toLocaleString("en-US")} collections ·
each is a lutaml data repository: <code>manifest</code> lists its records,
<code>entries/{key}</code> serves one.</p>
<table>
<thead><tr><th>Collection</th><th class="num">Records</th><th class="num">Updated</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`,
  );
}

/** Browsable, searchable, paginated view of one collection's records. */
export async function renderCollectionPage(
  db: D1Database,
  collection: string,
  query: string,
  page: number,
): Promise<string | null> {
  const flavor = await db.prepare(
    "SELECT flavor, doc_count, last_modified, ingested_at FROM flavors WHERE flavor = ?",
  ).bind(collection).first<FlavorRow>();
  if (!flavor) return null;

  const like = `%${query}%`;
  const where = query
    ? "WHERE flavor = ? AND (docid LIKE ? OR r2_key LIKE ?)"
    : "WHERE flavor = ?";
  const bind = query ? [collection, like, like] : [collection];

  // The page constants interpolate (integers, internal); the ? binds stay
  // positional — mixing ?n placeholders with ? binds confuses D1.
  const limit = PAGE_SIZE + 1;
  const offset = page * PAGE_SIZE;
  const { results } = await db.prepare(
    `SELECT r2_key, docid FROM documents ${where} ORDER BY r2_key LIMIT ${limit} OFFSET ${offset}`,
  ).bind(...bind).all<EntryRow>();

  const rows = results ?? [];
  const hasNext = rows.length > PAGE_SIZE;
  const visible = rows.slice(0, PAGE_SIZE);

  const body = visible.map((d) => {
    const key = d.r2_key.slice(collection.length + 1);
    const label = d.docid ?? key;
    return `<tr><td><a href="/collections/${escapeHtml(collection)}/entries/${encodeURIComponent(key)}">${escapeHtml(label)}</a></td>` +
      `<td><a href="/collections/${escapeHtml(collection)}/entries/${encodeURIComponent(key)}?raw=1"><code>${escapeHtml(key)}</code></a></td></tr>`;
  }).join("\n");

  const q = query ? `&q=${encodeURIComponent(query)}` : "";
  const pager = [
    page > 0
      ? `<a href="/collections/${escapeHtml(collection)}?page=${page - 1}${q}">&larr; Newer</a>`
      : "<span></span>",
    `<span class="info">page ${page + 1} · showing ${visible.length} of ` +
    `${(flavor.doc_count ?? 0).toLocaleString("en-US")} records</span>`,
    hasNext
      ? `<a href="/collections/${escapeHtml(collection)}?page=${page + 1}${q}">Older &rarr;</a>`
      : "<span></span>",
  ].join("\n");

  return layout(
    `${collection} — Relaton cloud database`,
    `<h1>${escapeHtml(collection)}</h1>
<p class="meta">${(flavor.doc_count ?? 0).toLocaleString("en-US")} records ·
generated ${escapeHtml((flavor.last_modified ?? flavor.ingested_at).slice(0, 10))} ·
<a href="/collections/${escapeHtml(collection)}/manifest">manifest.json</a></p>
<form class="toolbar" method="get" action="/collections/${escapeHtml(collection)}">
<input name="q" value="${escapeHtml(query)}" placeholder="Filter by docid or key…" aria-label="Filter records">
<input type="hidden" name="page" value="0">
<button type="submit">Filter</button>
</form>
<table>
<thead><tr><th>Document</th><th>Storage key</th></tr></thead>
<tbody>
${body}
</tbody>
</table>
<div class="pager">${pager}</div>`,
  );
}

/**
 * A single record, framed for a browser: the source bytes plus a tab showing
 * the formatted Relaton XML (bibdata) for the same document, resolved through
 * the same lookup path as /api/v1/document. Raw bytes stay one click away.
 */
export async function renderEntry(
  db: D1Database,
  collection: string,
  key: string,
  rawRequested: boolean,
  fetchObject: (r2Key: string) => Promise<{ text(): Promise<string> } | null>,
): Promise<{ html: string } | { body: string; contentType: string } | null> {
  const row = await db.prepare(
    "SELECT docid, r2_key FROM documents WHERE flavor = ? AND r2_key = ?",
  ).bind(collection, `${collection}/${key}`).first<EntryRow>();
  if (!row) return null;

  const obj = await fetchObject(row.r2_key);
  if (!obj) return null;
  const body = await obj.text();

  if (rawRequested) {
    const contentType = key.endsWith(".json")
      ? "application/json"
      : key.endsWith(".xml") ? "text/xml" : "application/yaml";
    return { body, contentType };
  }

  const docid = row.docid ?? key;
  const entryPath = `/collections/${escapeHtml(collection)}/entries/${encodeURIComponent(key)}`;

  // The formatted XML view comes from the documents index (what
  // /api/v1/document serves), not from re-serializing the source bytes.
  let xml: string | null = null;
  if (row.docid) {
    const doc = await findDocument(db, { code: row.docid }).catch(() => null);
    if (doc && doc.r2_key !== row.r2_key) {
      const xmlObj = await fetchObject(doc.r2_key).catch(() => null);
      if (xmlObj) xml = await xmlObj.text();
    }
  }

  const isXmlSource = key.endsWith(".xml");
  const sourceLabel = isXmlSource ? "XML source" : "YAML source";
  const tabs = xml !== null
    ? `<div class="tabs" role="tablist">
<button class="tab-btn" id="tab-btn-source" role="tab" aria-selected="true" aria-controls="pane-source" data-pane="pane-source">${sourceLabel}</button>
<button class="tab-btn" id="tab-btn-xml" role="tab" aria-selected="false" aria-controls="pane-xml" data-pane="pane-xml">Relaton XML <code>bibdata</code></button>
</div>`
    : "";

  const sourcePane = xml !== null
    ? `<pre id="pane-source" role="tabpanel" aria-labelledby="tab-btn-source">${escapeHtml(body)}</pre>`
    : `<div class="tabs"><button class="tab-btn" aria-selected="true">${sourceLabel}</button></div>` +
      `<pre>${escapeHtml(body)}</pre>`;
  const xmlPane = xml !== null
    ? `<pre id="pane-xml" role="tabpanel" aria-labelledby="tab-btn-xml" hidden>${escapeHtml(xml)}</pre>`
    : "";

  const tabScript = xml !== null
    ? `<script>
document.querySelectorAll('.tab-btn[data-pane]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.tab-btn[data-pane]').forEach(function (b) {
      b.setAttribute('aria-selected', String(b === btn));
    });
    document.querySelectorAll('[role="tabpanel"]').forEach(function (p) {
      p.hidden = p.id !== btn.dataset.pane;
    });
  });
});
</script>`
    : "";

  return {
    html: layout(
      `${docid} — Relaton cloud database`,
      `<h1>${escapeHtml(docid)}</h1>
<p class="meta">${escapeHtml(collection)} · key <code>${escapeHtml(key)}</code> ·
<a href="${entryPath}?raw=1">raw bytes</a> ·
<a href="/collections/${escapeHtml(collection)}">back to ${escapeHtml(collection)}</a> ·
XML also at <a href="/api/v1/document?code=${encodeURIComponent(docid)}">/api/v1/document</a></p>
${tabs}
${sourcePane}
${xmlPane}
${tabScript}`,
    ),
  };
}

export type { AppEnv };
