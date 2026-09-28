// The record page: a human-readable overview first, then the serializations.
// The overview renders the record (converted to the Relaton YAML shape by
// lib/bibdata) with field labels linking to the model documentation on
// relaton.org so users learn what each field means in place.

import { escapeHtml } from "./chrome";
import { fromXml, toXml, toAsciiBib, slugAnchor, toYaml, toIso690 } from "relaton";
import { highlightXml, highlightYaml } from "../../lib/highlight";

// Field → relaton.org model documentation page
const FIELD_DOCS: Record<string, string> = {
  title: "/model/title",
  docid: "/model/identifiers",
  date: "/model/production",
  contributor: "/model/contributor",
  relation: "/model/relations",
  edition: "/model/edition",
  series: "/model/series",
  type: "/model/bibtype",
  link: "/model/location",
  abstract: "/model/additional-info",
  keyword: "/model/additional-info",
  copyright: "/model/additional-info",
  status: "/model/production",
  language: "/model/serializations",
  script: "/model/serializations",
};

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function contentOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null) {
    const c = (value as Record<string, unknown>).content;
    if (typeof c === "string") return c;
    if (typeof c === "number") return String(c);
  }
  return "";
}

function fieldLabel(field: string, text: string): string {
  const href = FIELD_DOCS[field];
  const label = escapeHtml(text);
  return href
    ? `<a class="ov-label" href="https://www.relaton.org${href}" target="_blank" rel="noopener" title="What does this field mean?">${label} ↗</a>`
    : `<span class="ov-label">${label}</span>`;
}

function section(field: string, title: string, rowsHtml: string): string {
  if (!rowsHtml.trim()) return "";
  return `<section class="ov-section">
<h3>${fieldLabel(field, title)}</h3>
${rowsHtml}
</section>`;
}

function renderOverview(record: Record<string, unknown>, familyQuery: string, collection: string): string {
  const type = typeof record.type === "string" ? record.type : "";
  const chips: string[] = [];
  if (type) chips.push(`<span class="chip chip-type">${escapeHtml(type)}</span>`);

  const status = record.status as Record<string, unknown> | undefined;
  if (typeof status === "object" && status !== null) {
    const stage = contentOf(status.stage);
    const substage = contentOf(status.substage);
    const label = stage && substage ? `${stage}.${substage}` : stage || substage;
    if (label) chips.push(`<span class="chip chip-status">status ${escapeHtml(label)}</span>`);
  }
  const edition = contentOf(record.edition);
  if (edition) chips.push(`<span class="chip">edition ${escapeHtml(edition)}</span>`);
  for (const lang of asArray(record.language).slice(0, 3)) {
    chips.push(`<span class="chip">${escapeHtml(String(lang))}</span>`);
  }

  const identifiers = asArray(record.docidentifier as unknown[]).map((d) => {
    const obj = (typeof d === "object" && d !== null ? d : { id: String(d) }) as Record<string, unknown>;
    const id = contentOf(obj.content) || (typeof d === "string" ? d : "");
    if (!id) return "";
    const typeAttr = typeof obj.type === "string" ? escapeHtml(String(obj.type)) : "";
    const primary = obj.primary === true ? " primary" : "";
    const isDoi = typeAttr === "DOI" || /^10\.\d+\//.test(id);
    const inner = isDoi
      ? `<a href="https://doi.org/${encodeURIComponent(id)}" target="_blank" rel="noopener">${escapeHtml(id)} ↗</a>`
      : escapeHtml(id);
    return `<span class="docid-badge${primary}">${inner}${typeAttr ? ` <small>${typeAttr}</small>` : ""}</span>`;
  }).join("");
  const titles = asArray(record.title as unknown[]).map((t) => {
    const obj = (typeof t === "object" && t !== null ? t : {}) as Record<string, unknown>;
    const text = contentOf(t);
    if (!text) return "";
    const notes = [
      typeof obj.language === "string" ? escapeHtml(obj.language) : "",
      obj.type === "main" ? "" : typeof obj.type === "string" ? escapeHtml(obj.type) : "",
    ].filter(Boolean).join(" · ");
    return `<div class="ov-title">${escapeHtml(text)}${notes ? ` <small>${notes}</small>` : ""}</div>`;
  }).join("");

  const dates = asArray(record.date as unknown[]).map((d) => {
    const obj = (typeof d === "object" && d !== null ? d : {}) as Record<string, unknown>;
    const typeAttr = typeof obj.type === "string" ? escapeHtml(obj.type) : "date";
    const value = contentOf(obj.at);
    const from = contentOf(obj.from);
    const to = contentOf(obj.to);
    const when = value || (from && to ? `${from} – ${to}` : from || to);
    if (!when) return "";
    return `<div class="ov-row"><span class="ov-key">${typeAttr}</span><span>${escapeHtml(when)}</span></div>`;
  }).join("");

  const contributors = asArray(record.contributor as unknown[]).map((c) => {
    const obj = (typeof c === "object" && c !== null ? c : {}) as Record<string, unknown>;
    const role = obj.role;
    const roleLabel = Array.isArray(role) ? contentOf(role[0]) : contentOf(role);
    const org = obj.organization as Record<string, unknown> | undefined;
    const person = obj.person as Record<string, unknown> | undefined;
    let name = "";
    if (typeof org === "object" && org !== null) {
      name = contentOf(org.name) || contentOf(org.abbreviation);
      const abbr = contentOf(org.abbreviation);
      if (abbr && name !== abbr) name = `${name} (${abbr})`;
    } else if (typeof person === "object" && person !== null) {
      const personName = person.name as Record<string, unknown> | undefined;
      name = contentOf(personName?.completename) ||
        [contentOf(personName?.given), contentOf(personName?.surname)].filter(Boolean).join(" ");
    }
    if (!name) return "";
    return `<div class="ov-row"><span class="ov-key">${escapeHtml(roleLabel || "contributor")}</span><span>${escapeHtml(name)}</span></div>`;
  }).join("");

  const links = asArray(record.source as unknown[]).map((l) => {
    const obj = (typeof l === "object" && l !== null ? l : {}) as Record<string, unknown>;
    const url = contentOf(l);
    if (!url || !/^https?:\/\//.test(url)) return "";
    const typeAttr = typeof obj.type === "string" ? ` <small>${escapeHtml(obj.type)}</small>` : "";
    return `<div class="ov-row"><span><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url.length > 72 ? url.slice(0, 72) + "…" : url)}</a>${typeAttr}</div>`;
  }).join("");

  const abstracts = asArray(record.abstract as unknown[]).map((a) => {
    const text = contentOf(a);
    return text ? `<p>${escapeHtml(text)}</p>` : "";
  }).join("");

  const keywords = asArray(record.keyword as unknown[]).map((k) => {
    const obj = (typeof k === "object" && k !== null ? k : {}) as Record<string, unknown>;
    const vocab = obj.vocab as Record<string, unknown> | undefined;
    const text = typeof k === "string" ? k : contentOf(vocab);
    return text ? `<span class="chip">${escapeHtml(text)}</span>` : "";
  }).join("");

  const relations = asArray(record.relation as unknown[]).map((r) => {
    const obj = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
    const typeAttr = typeof obj.type === "string" ? escapeHtml(obj.type) : "relation";
    const bibitem = obj.bibitem as Record<string, unknown> | undefined;
    const relatedDocid = asArray(bibitem?.docidentifier as unknown[])
      .map((d) => contentOf(typeof d === "object" && d !== null ? (d as Record<string, unknown>).content : d))
      .find(Boolean);
    const ref = contentOf(bibitem?.formattedref) || relatedDocid ||
      contentOf(Array.isArray(bibitem?.title) ? bibitem.title[0] : bibitem?.title);
    if (!ref) return "";
    const target = relatedDocid
      ? `<a href="/search?q=${encodeURIComponent(relatedDocid)}" title="Open this document">${escapeHtml(ref)} ↗</a>`
      : escapeHtml(ref);
    return `<div class="ov-row"><span class="ov-key">${typeAttr}</span><span>${target}</span></div>`;
  }).join("");

  const series = asArray(record.series as unknown[]).map((s) => {
    const obj = (typeof s === "object" && s !== null ? s : {}) as Record<string, unknown>;
    const titleText = contentOf(obj.title);
    const number = contentOf(obj.number);
    const part = contentOf(obj.partnumber);
    const text = [titleText, number ? `no. ${escapeHtml(number)}` : "", part ? `part ${escapeHtml(part)}` : ""].filter(Boolean).join(" · ");
    if (!text) return "";
    const siblings = familyQuery
      ? `<a class="series-link" href="/collections/${escapeHtml(collection)}?q=${encodeURIComponent(familyQuery)}">other documents in this series ↗</a>`
      : "";
    return `<div class="ov-row"><span>${escapeHtml(text)}</span>${siblings}</div>`;
  }).join("");

  const copyright = record.copyright as Record<string, unknown> | undefined;
  let copyrightHtml = "";
  if (typeof copyright === "object" && copyright !== null) {
    const owner = copyright.owner as Record<string, unknown> | undefined;
    const ownerOrg = owner?.organization as Record<string, unknown> | undefined;
    const ownerName = contentOf(ownerOrg?.name) || contentOf(owner?.name);
    const from = contentOf(copyright.from);
    const to = contentOf(copyright.to);
    const text = [ownerName, from && to ? `${from}–${to}` : from].filter(Boolean).join(" · ");
    if (text) {
      copyrightHtml = `<div class="ov-row">${escapeHtml(text)}</div>`;
    }
  }

  return `
<div class="ov-chips">${chips.join("")}</div>
${identifiers ? `<div class="ov-docids">${identifiers}</div>` : ""}
${familyQuery ? `<div class="ov-series"><a class="series-link" href="/collections/${escapeHtml(collection)}?q=${encodeURIComponent(familyQuery)}">other documents in the ${escapeHtml(familyQuery)} series ↗</a></div>` : ""}
${titles}
${section("date", "Publication", dates + (edition ? `<div class="ov-row"><span class="ov-key">edition</span><span>${escapeHtml(edition)}</span></div>` : ""))}
${section("contributor", "Contributors", contributors)}
${section("link", "Links", links)}
${abstracts ? `<section class="ov-section"><h3>${fieldLabel("abstract", "Abstract")}</h3>${abstracts}</section>` : ""}
${keywords ? `<section class="ov-section"><h3>${fieldLabel("keyword", "Keywords")}</h3><div class="ov-chips">${keywords}</div></section>` : ""}
${section("relation", "Relations", relations)}
${section("series", "Series", series)}
${section("copyright", "Copyright", copyrightHtml)}
`;
}

/**
 * Series family for "other documents in this series": the primary docid
 * minus its year and trailing part/edition segment (ISO 19115-3:2023 →
 * "ISO 19115"; S-100 → "S" within the iho collection).
 */
function primaryDocidText(record: Record<string, unknown> | null, fallback: string): string {
  if (record && Array.isArray(record.docidentifier)) {
    for (const d of record.docidentifier as unknown[]) {
      const obj = (typeof d === "object" && d !== null ? d : {}) as Record<string, unknown>;
      if (obj.primary === true) {
        const c = contentOf(obj.content);
        if (c) return c;
      }
    }
    const first = (record.docidentifier as unknown[])[0];
    const c0 = contentOf(first);
    if (c0) return c0;
  }
  return fallback;
}

function familyQueryOf(record: Record<string, unknown> | null, fallbackDocid: string): string {
  const docid = primaryDocidText(record, fallbackDocid);
  return (
    docid.replace(/:[-–]?\d{4}(?=[^-]*$)/, "").replace(/[-–][\d.]+$/, "").trim() || docid
  );
}

export interface RecordPageInput {
  collection: string;
  key: string;
  docid: string;
  body: string;
}

export function renderRecordPage({ collection, key, docid, body }: RecordPageInput): string {
  const isXml = body.trimStart().startsWith("<");
  const parsed = isXml ? fromXml(body) : null;
  const item = parsed?.ok ? parsed.item : null;
  const record = item as unknown as Record<string, unknown> | null;

  const anchor = slugAnchor(docid);
  const yamlText = item ? toYaml(item) : null;
  const asciibib = item ? toAsciiBib(item, anchor) : null;

  const entryPath = `/collections/${escapeHtml(collection)}/entries/${encodeURIComponent(key)}`;
  const iso690 = item ? toIso690(item) : "";
  const primaryDocid = (() => {
    const docids = Array.isArray(record?.docidentifier) ? record?.docidentifier : record?.docidentifier ? [record.docidentifier] : [];
    const first = docids[0] as Record<string, unknown> | undefined;
    return typeof first?.content === "string" ? first.content : docid;
  })();
  const fetchEntry = `* [[[${anchor},${primaryDocid}]]]`;
  const citePanel = `
${iso690 ? `<p class="iso690-citation">${escapeHtml(iso690)}</p>` : ""}
<div class="cite-panel">
<span class="cite-anchor" title="Citation anchor (derived from the identifier)"><code>${escapeHtml(anchor)}</code></span>
<button type="button" class="copy-btn" data-copy-text="&lt;&lt;${escapeHtml(anchor)}&gt;&gt;">Copy <code>&lt;&lt;${escapeHtml(anchor)}&gt;&gt;</code></button>
<button type="button" class="copy-btn" data-copy-text="cite:[${escapeHtml(anchor)}]">Copy <code>cite:[${escapeHtml(anchor)}]</code></button>
<button type="button" class="copy-btn" data-copy-text="${escapeHtml(fetchEntry)}" title="One-line entry: Metanorma fetches the full record by this identifier at build time">Copy fetch entry</button>
${asciibib ? `
<button type="button" class="mn-cta" data-copy-asciibib title="Copy the AsciiBib representation">
  <img class="mn-icon mn-light-bg" src="/assets/metanorma-icon-light-bg.svg" alt="Metanorma">
  <img class="mn-icon mn-dark-bg" src="/assets/metanorma-icon-dark-bg.svg" alt="Metanorma">
  <span class="mn-cta-text"><strong>Working with Metanorma?</strong>
  Click to obtain the AsciiBib representation</span>
</button>` : ""}
</div>
<p class="cite-hint">Paste the AsciiBib block under a <code>[bibliography]</code> heading in your Metanorma
document, then cite with <code>&lt;&lt;${escapeHtml(anchor)}&gt;&gt;</code> or <code>cite:[${escapeHtml(anchor)}]</code>.
Fields are explained on <a href="https://www.relaton.org/model/" target="_blank" rel="noopener">relaton.org/model</a>.</p>`;

  const tabs: string[] = [];
  const panes: string[] = [];
  const addTab = (id: string, label: string, contentHtml: string) => {
    const first = tabs.length === 0;
    tabs.push(`<button class="tab-btn" id="tab-btn-${id}" role="tab" aria-selected="${first}" aria-controls="pane-${id}" data-pane="pane-${id}">${label}</button>`);
    panes.push(`<pre id="pane-${id}" role="tabpanel" aria-labelledby="tab-btn-${id}"${first ? "" : " hidden"}>${contentHtml}</pre>`);
  };

  if (record) addTab("overview", "Overview", renderOverview(record, familyQueryOf(record, key), collection));
  if (yamlText) addTab("yaml", "Relaton YAML", highlightYaml(yamlText));
  addTab("xml", isXml ? "Relaton XML" : "Source", highlightXml(body));
  if (asciibib) addTab("asciibib", "AsciiBib", escapeHtml(asciibib));

  return `
<p class="meta">${escapeHtml(collection)} · key <code>${escapeHtml(key)}</code> ·
<a href="${entryPath}?raw=1">raw bytes</a> ·
<a href="/api/v1/document?code=${encodeURIComponent(docid)}">/api/v1/document</a> ·
<a href="/collections/${escapeHtml(collection)}">back to ${escapeHtml(collection)}</a></p>
${citePanel}
<div class="tabs" role="tablist">
${tabs.join("\n")}
</div>
<div class="panes">
${panes.join("\n")}
</div>
<script>
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
document.querySelectorAll('[data-copy-text]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var text = btn.getAttribute('data-copy-text');
    var ta = document.createElement('textarea');
    ta.value = text;
    document.documentElement.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
    btn.classList.add('copied');
    setTimeout(function () { btn.classList.remove('copied'); }, 1500);
  });
});
var asciibibBtn = document.querySelector('[data-copy-asciibib]');
if (asciibibBtn) asciibibBtn.addEventListener('click', function () {
  var pane = document.getElementById('pane-asciibib');
  var text = pane ? pane.textContent : '';
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
  asciibibBtn.classList.add('copied');
  setTimeout(function () { asciibibBtn.classList.remove('copied'); }, 1500);
});
</script>`;
}

export const RECORD_CSS = `
  .ov-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
  .ov-chips .chip { background: var(--bg-mute); border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; font-size: 12.5px; color: var(--fg-2); }
  .chip-type { color: var(--accent); border-color: var(--accent-soft); }
  .chip-status { color: var(--aqua); border-color: rgba(0,138,100,0.3); }
  .ov-docids { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; }
  .docid-badge {
    display: inline-flex; align-items: baseline; gap: 6px; font-family: var(--mono); font-size: 14px;
    background: var(--accent-soft); color: var(--accent); border-radius: 6px; padding: 4px 10px;
  }
  .docid-badge.primary { outline: 1px solid var(--accent-soft); }
  .docid-badge a { color: inherit; }
  .docid-badge small { color: var(--muted); font-size: 11px; }
  .ov-title { font-size: 17px; line-height: 1.5; margin: 2px 0; }
  .ov-title small { color: var(--muted); font-size: 12px; margin-left: 6px; }
  .ov-section { margin: 22px 0; }
  .ov-section h3 {
    font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--muted); margin: 0 0 8px; border-bottom: 1px solid var(--border); padding-bottom: 6px;
  }
  .ov-label { color: var(--muted); text-decoration: none; }
  .ov-label:hover { color: var(--accent); }
  .ov-row { display: flex; gap: 12px; padding: 3px 0; font-size: 14.5px; }
  .ov-key { min-width: 96px; color: var(--muted); font-size: 13px; padding-top: 2px; }
  .ov-section p { font-size: 14.5px; line-height: 1.65; margin: 0 0 10px; }
  .series-link { font-size: 12.5px; }
  .cite-panel { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 4px 0 6px; }
  .cite-anchor code { background: var(--accent-soft); color: var(--accent); padding: 6px 10px; border-radius: 6px; }
  .copy-btn { font: 13px var(--font); padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px;
              background: var(--bg); color: var(--fg-2); cursor: pointer; }
  .copy-btn code { font-size: 12px; }
  .copy-btn:hover { color: var(--accent); border-color: var(--accent); }
  .copy-btn.copied { color: var(--success); border-color: var(--success); }
  .mn-cta {
    display: inline-flex; align-items: center; gap: 10px; text-align: left;
    padding: 8px 16px 8px 10px; border: 1px solid rgba(114, 94, 219, 0.45); border-radius: 10px;
    background: rgba(124, 96, 230, 0.08); cursor: pointer;
    font: 13px/1.45 var(--font); color: var(--fg-2);
    transition: border-color 0.15s, background 0.15s;
  }
  .mn-cta:hover { border-color: #725edb; background: rgba(124, 96, 230, 0.14); }
  .mn-cta strong { color: var(--fg); }
  .mn-icon { width: 26px; height: 26px; display: block; }
  .mn-cta .mn-light-bg { display: none; }
  html.dark .mn-cta .mn-light-bg { display: block; }
  html.dark .mn-cta .mn-dark-bg { display: none; }
  .mn-cta.copied { border-color: var(--success); }
  .mn-cta.copied .mn-cta-text strong { color: var(--success); }
  .cite-hint { color: var(--muted); font-size: 13px; margin: 0 0 20px; }
  .iso690-citation {
    font-size: 15.5px; line-height: 1.6; color: var(--fg); margin: 0 0 14px;
    padding: 12px 16px; border-left: 3px solid var(--accent); background: var(--bg-soft);
    border-radius: 0 8px 8px 0;
  }
  .tok-tag { color: var(--accent); }
  .tok-attr { color: var(--aqua); }
  .tok-str { color: #b7791f; }
  .dark .tok-str { color: #d69e2e; }
  .tok-com { color: var(--muted); font-style: italic; }
  .tok-key { color: var(--accent); }
  .tok-val { color: inherit; }
  #pane-overview { background: none; border: none; padding: 0; white-space: normal; }
`;
