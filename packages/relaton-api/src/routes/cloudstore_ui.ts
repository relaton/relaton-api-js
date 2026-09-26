import type { AppEnv } from "../env";

// Browsable web UI for the lutaml cloud store. Every page is server-rendered
// HTML served by the same routes that answer JSON to API clients — the
// content type follows the request's Accept header, never a different URL.

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
<style>
  :root {
    --bg: #ffffff; --fg: #111318; --muted: #5c6470; --border: #e3e6ea;
    --accent: #0443c9; --code-bg: #f4f5f7;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #101216; --fg: #e8eaee; --muted: #9aa2ad; --border: #2a2f37;
            --accent: #7ea2ff; --code-bg: #181b20; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 16px/1.6 ui-sans-serif, system-ui, "Helvetica Neue", Arial, sans-serif;
  }
  main { max-width: 960px; margin: 0 auto; padding: 40px 24px 64px; }
  h1 { font-size: 30px; letter-spacing: -0.02em; margin: 0 0 6px; }
  h1 a { color: inherit; text-decoration: none; }
  .sub { color: var(--muted); margin: 0 0 28px; }
  .sub a { color: var(--accent); }
  table { width: 100%; border-collapse: collapse; font-size: 15px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-size: 13px; font-weight: 600; }
  td a { color: var(--accent); text-decoration: none;
         font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  td a:hover { text-decoration: underline; }
  .num { text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
  .toolbar { display: flex; gap: 8px; margin: 0 0 16px; flex-wrap: wrap; }
  .toolbar input {
    flex: 1; min-width: 220px; padding: 10px 12px; font-size: 15px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--fg);
  }
  .toolbar button, .pager a, .pager span {
    padding: 10px 16px; font-size: 14px; border-radius: 8px;
    border: 1px solid var(--border); background: var(--bg); color: var(--fg); text-decoration: none;
  }
  .toolbar button { background: var(--accent); border-color: var(--accent); color: #fff; cursor: pointer; }
  .pager { display: flex; gap: 8px; margin-top: 18px; align-items: center; }
  .pager .info { color: var(--muted); font-size: 13px; margin-right: auto; }
  pre {
    background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 14px 16px; overflow-x: auto; font-size: 13px; line-height: 1.5;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: pre-wrap; word-break: break-word;
  }
  .meta { color: var(--muted); font-size: 13px; margin: 0 0 18px; }
  footer { margin-top: 48px; color: var(--muted); font-size: 13px;
           border-top: 1px solid var(--border); padding-top: 16px; }
  footer a { color: var(--accent); }
</style>
</head>
<body>
<main>
<h1><a href="/">Relaton cloud database</a></h1>
<p class="sub">Browsable view of the <a href="https://github.com/relaton" rel="noopener">relaton-data-*</a>
corpus · API clients: the same URLs answer <a href="/collections">JSON</a> ·
<a href="/docs">OpenAPI reference</a></p>
${body}
<footer>Served by a Cloudflare Worker over D1 + R2 · contract: the lutaml cloud store API</footer>
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

/** A single record, framed for a browser. Raw bytes stay one click away. */
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
  return {
    html: layout(
      `${docid} — Relaton cloud database`,
      `<h1>${escapeHtml(docid)}</h1>
<p class="meta">${escapeHtml(collection)} · key <code>${escapeHtml(key)}</code> ·
<a href="/collections/${escapeHtml(collection)}/entries/${encodeURIComponent(key)}?raw=1">raw bytes</a> ·
<a href="/collections/${escapeHtml(collection)}">back to ${escapeHtml(collection)}</a></p>
<pre>${escapeHtml(body)}</pre>`,
    ),
  };
}

export type { AppEnv };
