import type { AppEnv } from "../env";
import { layout, escapeHtml } from "./ui/chrome";
import { toAsciiBib, slugAnchor, type AsciibibNode } from "../lib/asciibib";
import { load as yamlLoad } from "js-yaml";

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

const CSS = `
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
  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .tab-btn {
    padding: 10px 16px; font-size: 14px; font-weight: 500; font-family: var(--font);
    border: none; background: none; color: var(--muted); cursor: pointer;
    border-bottom: 2px solid transparent; margin-bottom: -1px;
  }
  .tab-btn:hover { color: var(--fg); }
  .tab-btn[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
  .tab-btn code { font-family: var(--mono); font-size: 13px; }
  .panes > pre { border-radius: 0 0 8px 8px; border-top: none; }
`;

export function wantsHtml(accept: string | undefined): boolean {
  return (accept ?? "").includes("text/html");
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

  return layout({
    title: "Collections — Relaton API",
    activeNav: "collections",
    css: CSS,
    body: `<h1>Collections</h1>
<p class="sub">${(results ?? []).length.toLocaleString("en-US")} collections ·
each is a lutaml data repository: <code>manifest</code> lists its records,
<code>entries/{key}</code> serves one.</p>
<table>
<thead><tr><th>Collection</th><th class="num">Records</th><th class="num">Updated</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`,
  });
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

  return layout({
    title: `${collection} — Relaton API`,
    activeNav: "collections",
    css: CSS,
    body: `<h1>${escapeHtml(collection)}</h1>
<p class="meta">${(flavor.doc_count ?? 0).toLocaleString("en-US")} records ·
generated ${escapeHtml((flavor.last_modified ?? flavor.ingested_at).slice(0, 10))} ·
<a href="/collections/${escapeHtml(collection)}/manifest">manifest.json</a> ·
<a href="/create">create a custom record</a></p>
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
  });
}

/**
 * A single record, framed for a browser: tabs for the source bytes, the
 * formatted Relaton XML (bibdata) resolved through the same lookup path as
 * /api/v1/document, and an AsciiBib rendering to paste into Metanorma.
 * Raw bytes stay one click away.
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
    const doc = await findDocumentQuietly(db, row.docid);
    if (doc && doc.r2_key !== row.r2_key) {
      const xmlObj = await fetchObject(doc.r2_key).catch(() => null);
      if (xmlObj) xml = await xmlObj.text();
    }
  }

  const isXmlSource = key.endsWith(".xml");
  const sourceLabel = isXmlSource ? "XML source" : "YAML source";
  const asciibib = isXmlSource ? null : yamlToAsciiBibQuietly(body, slugAnchor(docid));

  const tabs: string[] = [];
  const panes: string[] = [];
  const addTab = (id: string, label: string, content: string) => {
    const first = tabs.length === 0;
    tabs.push(`<button class="tab-btn" id="tab-btn-${id}" role="tab" aria-selected="${first}" aria-controls="pane-${id}" data-pane="pane-${id}">${label}</button>`);
    panes.push(`<pre id="pane-${id}" role="tabpanel" aria-labelledby="tab-btn-${id}"${first ? "" : " hidden"}>${escapeHtml(content)}</pre>`);
  };

  addTab("source", sourceLabel, body);
  if (xml !== null) addTab("xml", "Relaton XML <code>bibdata</code>", xml);
  if (asciibib !== null) addTab("asciibib", "AsciiBib", asciibib);

  const extraTabs = tabs.length > 1
    ? `<div class="tabs" role="tablist">${tabs.join("\n")}</div>`
    : `<div class="tabs"><button class="tab-btn" aria-selected="true">${sourceLabel}</button></div>`;

  const tabScript = tabs.length > 1
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
    html: layout({
      title: `${docid} — Relaton API`,
      activeNav: "collections",
      css: CSS,
      body: `<h1>${escapeHtml(docid)}</h1>
<p class="meta">${escapeHtml(collection)} · key <code>${escapeHtml(key)}</code> ·
<a href="${entryPath}?raw=1">raw bytes</a> ·
<a href="/collections/${escapeHtml(collection)}">back to ${escapeHtml(collection)}</a> ·
XML also at <a href="/api/v1/document?code=${encodeURIComponent(docid)}">/api/v1/document</a> ·
paste the AsciiBib tab into Metanorma</p>
${extraTabs}
<div class="panes">
${panes.join("\n")}
</div>
${tabScript}`,
    }),
  };
}

async function findDocumentQuietly(db: D1Database, code: string) {
  try {
    const { findDocument } = await import("../lib/lookup");
    return await findDocument(db, { code });
  } catch {
    return null;
  }
}

function yamlToAsciiBibQuietly(source: string, anchor: string): string | null {
  try {
    const parsed = yamlLoad(source);
    if (parsed === null || typeof parsed !== "object") return null;
    return toAsciiBib(parsed as Record<string, AsciibibNode>, anchor);
  } catch {
    return null;
  }
}

export type { AppEnv };
