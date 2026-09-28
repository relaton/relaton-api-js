import type { AppEnv } from "../env";
import { layout, escapeHtml } from "./ui/chrome";
import { searchDocuments, type SearchParams, type SearchResult } from "../lib/search";

// Global pubid/keyword search across every flavor, with facets, sorting,
// and pagination. Server-rendered; API clients get the same engine at
// /api/v1/search.

const CSS = `
  .search-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 28px; align-items: start; }
  @media (max-width: 900px) { .search-layout { grid-template-columns: minmax(0, 1fr); } }
  .search-bar { display: flex; gap: 8px; margin: 0 0 18px; }
  .search-bar input[name=q] {
    flex: 1; padding: 10px 14px; font-size: 15px; font-family: var(--mono);
    border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--fg);
  }
  .search-bar select { padding: 10px; font: 14px var(--font); border: 1px solid var(--border);
    border-radius: 8px; background: var(--bg); color: var(--fg); }
  .search-bar button { padding: 10px 18px; font: 14px var(--font); border: none; border-radius: 8px;
    background: var(--accent); color: #fff; cursor: pointer; }
  .facets h3 { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--muted); margin: 18px 0 6px; }
  .facet-link { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 13.5px;
    color: var(--fg-2); text-decoration: none; border-radius: 6px; }
  .facet-link:hover { background: var(--bg-mute); color: var(--fg); }
  .facet-link.on { background: var(--accent-soft); color: var(--accent); }
  .facet-link .n { color: var(--muted); font-variant-numeric: tabular-nums; }
  .results-info { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
  .result { border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; margin-bottom: 10px; }
  .result-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
  .result-docid { font-family: var(--mono); font-size: 15px; font-weight: 600; color: var(--accent); text-decoration: none; }
  .result-docid:hover { text-decoration: underline; }
  .result-chip { background: var(--bg-mute); border: 1px solid var(--border); border-radius: 999px;
    padding: 1px 9px; font-size: 11.5px; color: var(--fg-2); }
  .result-title { margin: 5px 0 0; font-size: 14px; color: var(--fg-2); }
  .pager { display: flex; gap: 8px; margin-top: 16px; align-items: center; }
  .pager a, .pager span { padding: 8px 14px; font-size: 13px; border: 1px solid var(--border);
    border-radius: 8px; text-decoration: none; color: var(--fg); background: var(--bg); }
  .pager .info { margin-right: auto; color: var(--muted); border: none; background: none; }
  .empty { color: var(--muted); padding: 32px 0; text-align: center; }
`;

function facetHref(current: URLSearchParams, dimension: string, value: string): string {
  const params = new URLSearchParams(current);
  params.set(dimension, value);
  params.delete("page");
  return `/search?${params.toString()}`;
}

function clearHref(current: URLSearchParams, dimension: string): string {
  const params = new URLSearchParams(current);
  params.delete(dimension);
  params.delete("page");
  return `/search?${params.toString()}`;
}

function pageHref(current: URLSearchParams, page: number): string {
  const params = new URLSearchParams(current);
  if (page > 0) params.set("page", String(page)); else params.delete("page");
  return `/search?${params.toString()}`;
}

function parseParams(url: URL): SearchParams {
  const num = (name: string): number | null => {
    const v = url.searchParams.get(name);
    return v && /^\d+$/.test(v) ? Number(v) : null;
  };
  const sortRaw = url.searchParams.get("sort") ?? "relevance";
  const sort = (["relevance", "year_desc", "year_asc", "docid"] as const).includes(sortRaw as never)
    ? (sortRaw as SearchParams["sort"])
    : "relevance";
  return {
    q: url.searchParams.get("q")?.trim() || undefined,
    flavor: url.searchParams.get("flavor") || undefined,
    doctype: url.searchParams.get("doctype") || undefined,
    status: url.searchParams.get("status") || undefined,
    yearFrom: num("yearFrom"),
    yearTo: num("yearTo"),
    sort,
    page: num("page") ?? 0,
    size: num("size") ?? 25,
  };
}

function renderFacet(
  params: URLSearchParams,
  dimension: string,
  selected: string | undefined,
  counts: { value: string; count: number }[] | undefined,
): string {
  if (!counts?.length) return "";
  const links = counts.map((f) => {
    const on = selected === f.value;
    return `<a class="facet-link${on ? " on" : ""}" href="${on ? clearHref(params, dimension) : facetHref(params, dimension, escapeHtml(f.value))}">
      <span>${escapeHtml(f.value)}${on ? " ✕" : ""}</span><span class="n">${f.count.toLocaleString("en-US")}</span></a>`;
  }).join("");
  return `<h3>${dimension}</h3>${links}`;
}

function renderResults(r: SearchResult, collection: string | undefined): string {
  if (r.items.length === 0) {
    return `<p class="empty">No documents match${collection ? ` in ${escapeHtml(collection)}` : ""} — try fewer filters or a shorter query.</p>`;
  }
  return r.items.map((d) => {
    const key = d.r2_key.slice(d.flavor.length + 1);
    const href = `/collections/${escapeHtml(d.flavor)}/entries/${encodeURIComponent(key)}`;
    const chips = [
      `<span class="result-chip">${escapeHtml(d.flavor)}</span>`,
      d.doctype ? `<span class="result-chip">${escapeHtml(d.doctype)}</span>` : "",
      d.year ? `<span class="result-chip">${d.year}</span>` : "",
      d.status ? `<span class="result-chip">${escapeHtml(d.status)}</span>` : "",
    ].filter(Boolean).join("");
    return `<div class="result">
      <div class="result-head">
        <a class="result-docid" href="${href}">${escapeHtml(d.docid ?? key)}</a>
        ${chips}
      </div>
      ${d.title_en ? `<p class="result-title">${escapeHtml(d.title_en)}</p>` : ""}
    </div>`;
  }).join("");
}

function renderPager(r: SearchResult, params: URLSearchParams): string {
  const info = `${(r.total).toLocaleString("en-US")} results · page ${r.page + 1}`;
  return `<div class="pager">
    ${r.hasPrev ? `<a href="${pageHref(params, r.page - 1)}">&larr; Previous</a>` : "<span></span>"}
    <span class="info">${info}</span>
    ${r.hasNext ? `<a href="${pageHref(params, r.page + 1)}">Next &rarr;</a>` : "<span></span>"}
  </div>`;
}

export interface SearchPageOptions {
  scopeFlavor?: string;
  title?: string;
  activeNav?: string;
}

export async function renderSearchPage(db: D1Database, url: URL, opts: SearchPageOptions = {}): Promise<string> {
  const params = parseParams(url);
  const result = await searchDocuments(db, params, { scopeFlavor: opts.scopeFlavor });
  const qs = new URLSearchParams(url.searchParams);
  qs.delete("page");

  const action = opts.scopeFlavor ? `/collections/${escapeHtml(opts.scopeFlavor)}` : "/search";
  const facetHtml = opts.scopeFlavor
    ? renderFacet(qs, "doctype", params.doctype, result.facets.doctype) +
      renderFacet(qs, "status", params.status, result.facets.status)
    : renderFacet(qs, "flavor", params.flavor, result.facets.flavor) +
      renderFacet(qs, "doctype", params.doctype, result.facets.doctype) +
      renderFacet(qs, "status", params.status, result.facets.status);

  const hidden = opts.scopeFlavor ? `<input type="hidden" name="flavor" value="${escapeHtml(opts.scopeFlavor)}">` : "";
  const scopeMeta = opts.scopeFlavor
    ? `<p class="meta"><a href="/collections/${escapeHtml(opts.scopeFlavor)}/manifest">manifest.json</a> ·
<a href="/collections">all collections</a> ·
<a href="/create">create a custom record</a></p>`
    : "";

  const body = `
<h1>${opts.title ?? "Search"}</h1>
${scopeMeta}
<form class="search-bar" method="get" action="${action}">
  <input name="q" value="${escapeHtml(params.q ?? "")}" placeholder="Publication identifier or title — e.g. ISO 19115, TLS, risk assessment…" aria-label="Search">
  <select name="yearFrom" aria-label="Year from">
    <option value="">any year</option>
    ${Array.from({ length: 8 }, (_, i) => 2026 - i * 5).map((y) =>
      `<option value="${y}"${params.yearFrom === y ? " selected" : ""}>${y}+</option>`).join("")}
  </select>
  <select name="sort" aria-label="Sort">
    <option value="relevance"${params.sort === "relevance" ? " selected" : ""}>Relevance</option>
    <option value="year_desc"${params.sort === "year_desc" ? " selected" : ""}>Newest</option>
    <option value="year_asc"${params.sort === "year_asc" ? " selected" : ""}>Oldest</option>
    <option value="docid"${params.sort === "docid" ? " selected" : ""}>Identifier</option>
  </select>
  ${hidden}
  <button type="submit">Search</button>
</form>

<div class="search-layout">
  <aside class="facets">
    ${facetHtml || `<p class="empty" style="padding:8px 0">No facets</p>`}
  </aside>
  <div>
    <p class="results-info">${result.total.toLocaleString("en-US")} documents</p>
    ${renderResults(result, opts.scopeFlavor)}
    ${renderPager(result, qs)}
  </div>
</div>`;

  return layout({
    title: `${opts.title ?? "Search"} — Relaton API`,
    activeNav: opts.activeNav ?? "search",
    css: CSS,
    body,
  });
}

