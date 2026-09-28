// The record page: a human-readable overview first, then the serializations.
// The overview renders the record (converted to the Relaton YAML shape by
// lib/bibdata) with field labels linking to the model documentation on
// relaton.org so users learn what each field means in place.

import { escapeHtml } from "./chrome";
import { fromXml, toXml, toAsciiBib, slugAnchor, toYaml, toIso690, toChicago, toApa } from "relaton";
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
  // The record reads as a catalogue card: a language-neutral call number
  // heads it, and every field — title languages included — is an equally
  // weighted, labeled row. Standards are multilingual by institution;
  // no language is a "translation" of another.
  const type = typeof record.type === "string" ? record.type : "";

  // Each publisher speaks its own status vocabulary (ISO stage codes, RFC
  // states, BSI current/withdrawn, ...). Codes known to be opaque get a
  // reader-friendly form; every other value renders verbatim.
  const STATUS_WORDS: Record<string, string> = {
    "60.60": "Published", "60.00": "Published", "50.00": "Final draft",
    "50.20": "Final draft", "40.00": "Draft", "40.20": "Draft",
    "90.92": "Withdrawn", "90.93": "Withdrawn", "95.99": "Withdrawn",
    "90.60": "Under review", "60.98": "Cancelled",
  };

  const LANG_NAMES: Record<string, string> = {
    en: "English", fr: "French", de: "German", es: "Spanish", it: "Italian",
    zh: "Chinese", ja: "Japanese", ko: "Korean", ru: "Russian", ar: "Arabic",
    pt: "Portuguese", nl: "Dutch", sv: "Swedish", no: "Norwegian", da: "Danish",
    fi: "Finnish", pl: "Polish", cs: "Czech", tr: "Turkish", hu: "Hungarian",
    el: "Greek", he: "Hebrew", th: "Thai", vi: "Vietnamese", uk: "Ukrainian",
    ro: "Romanian", bg: "Bulgarian", hr: "Croatian", sk: "Slovak", sl: "Slovenian",
    et: "Estonian", lv: "Latvian", lt: "Lithuanian", sr: "Serbian", id: "Indonesian",
    ms: "Malay", fa: "Persian", hi: "Hindi", bn: "Bengali", la: "Latin",
  };
  const langName = (code: string): string =>
    LANG_NAMES[code.toLowerCase()] ?? (code ? code.toUpperCase() : "");

  const docids = asArray(record.docidentifier as unknown[]);
  const headingDocid = (() => {
    const pick = docids.find((d) =>
      typeof d === "object" && d !== null && (d as Record<string, unknown>).primary === true);
    const first = (pick ?? docids[0]) as Record<string, unknown> | undefined;
    return first ? (contentOf(first) || (typeof first === "string" ? first : "")) : "";
  })();

  // Identifiers: labeled rows keyed by the identifier type; DOIs resolve.
  const identifierRows = docids.map((d) => {
    const obj = (typeof d === "object" && d !== null ? d : {}) as Record<string, unknown>;
    const id = contentOf(obj) || (typeof d === "string" ? d : "");
    if (!id) return "";
    const rawIdType = typeof obj.type === "string" ? obj.type : "";
    const ID_TYPE_LABELS: Record<string, string> = {
      "iso-undated": "ISO (undated)", "iso-reference": "ISO (reference)",
      "iso-tc": "ISO (TC)", ISSN: "ISSN", ISBN: "ISBN", URN: "URN", DOI: "DOI",
    };
    const idType = ID_TYPE_LABELS[rawIdType] ?? rawIdType;
    const isDoi = idType === "DOI" || /^10\.\d+\//.test(id);
    const value = isDoi
      ? `<a href="https://doi.org/${encodeURIComponent(id)}" target="_blank" rel="noopener">${escapeHtml(id)} ↗</a>`
      : `<code>${escapeHtml(id)}</code>`;
    const primary = obj.primary === true ? ` <span class="row-note">primary</span>` : "";
    return `<div class="ov-row"><span class="ov-key">${escapeHtml(idType || "Identifier")}</span><span class="ov-value">${value}${primary}</span></div>`;
  }).join("");

  // Record facts as labeled fields — never as tags.
  const facts: [string, string][] = [];
  if (type) facts.push(["Type", type.replace(/(^|[\s_-])(\p{L})/gu, (m, s, c) => s + c.toUpperCase())]);
  {
    const status = record.status as Record<string, unknown> | undefined;
    if (typeof status === "object" && status !== null) {
      const stage = contentOf(status.stage);
      const substage = contentOf(status.substage);
      const code = stage && substage ? `${stage}.${substage}` : stage || substage;
      if (code) facts.push(["Status", STATUS_WORDS[code] ?? code]);
    }
  }
  const edition = contentOf(record.edition);
  if (edition) facts.push(["Edition", edition]);
  const langList = asArray(record.language).map(String).map(langName).filter(Boolean).join(", ");
  if (langList) facts.push(["Languages", langList]);
  const factRows = facts
    .map(([k, v]) => `<div class="ov-row"><span class="ov-key">${escapeHtml(k)}</span><span class="ov-value">${escapeHtml(v)}</span></div>`)
    .join("");

  // Titles: one composed title per language, rendered as parallel,
  // first-class rows. Model type tags stay internal.
  type TitleSlots = { intro: string; main: string; part: string; composite: string };
  const titlesByLang = new Map<string, TitleSlots>();
  for (const t of asArray(record.title as unknown[])) {
    const obj = (typeof t === "object" && t !== null ? t : {}) as Record<string, unknown>;
    const text = contentOf(t);
    if (!text) continue;
    const lang = typeof obj.language === "string" ? obj.language.toLowerCase() : "";
    const slot = titlesByLang.get(lang) ?? { intro: "", main: "", part: "", composite: "" };
    if (obj.type === "title-intro") slot.intro ||= text;
    else if (obj.type === "title-part") slot.part ||= text;
    else if (obj.type === "main") slot.composite ||= text;
    else slot.main ||= text;
    titlesByLang.set(lang, slot);
  }
  const composedOf = (s: TitleSlots): string => {
    const base = [s.intro, s.main].filter(Boolean).join(" — ") || s.composite;
    return [base, s.part].filter(Boolean).join(" — ");
  };
  const langs = [...titlesByLang.keys()];
  const headingLang = langs.includes("en") ? "en" : langs[0] ?? "";
  const headingTitle = titlesByLang.has(headingLang) ? composedOf(titlesByLang.get(headingLang)!) : "";
  const otherTitleRows = langs
    .filter((l) => l !== headingLang)
    .map((l) => {
      const title = composedOf(titlesByLang.get(l)!);
      if (!title || title === headingTitle) return "";
      return `<div class="title-row"><span class="title-lang">${escapeHtml(langName(l))}</span><span class="title-text">${escapeHtml(title)}</span></div>`;
    })
    .join("");

  const dates = asArray(record.date as unknown[]).map((d) => {
    const obj = (typeof d === "object" && d !== null ? d : {}) as Record<string, unknown>;
    const DATE_LABELS: Record<string, string> = {
      published: "Published", issued: "Published", created: "Created", updated: "Updated",
      obsoleted: "Obsoleted", confirmed: "Confirmed", corrected: "Corrected",
      amended: "Amended", accessed: "Accessed", implemented: "Implemented",
      transmitted: "Transmitted", circulated: "Circulated", adapted: "Adapted",
      announced: "Announced", "vote-started": "Vote started", "vote-ended": "Vote ended",
      "stable-until": "Stable until", copied: "Copied", unchanged: "Unchanged",
    };
    const typeAttr = typeof obj.type === "string"
      ? (DATE_LABELS[obj.type] ?? obj.type.replace(/^./, (c) => c.toUpperCase()))
      : "Date";
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
    const rawRole = Array.isArray(role) ? contentOf(role[0]) : contentOf(role);
    const ROLE_LABELS: Record<string, string> = {
      publisher: "Published by", author: "Written by", performer: "Performed by",
      editor: "Edited by", translator: "Translated by", distributor: "Distributed by",
    };
    const roleLabel = ROLE_LABELS[rawRole] ?? rawRole.replace(/^./, (c) => c.toUpperCase());
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
    return `<div class="ov-row"><span class="ov-key">${escapeHtml(roleLabel || "Contributor")}</span><span>${escapeHtml(name)}</span></div>`;
  });
  const seenContrib = new Set<string>();
  const contributorsHtml = contributors.filter((row) => {
    const key = row.replace(/<[^>]+>/g, "");
    if (seenContrib.has(key)) return false;
    seenContrib.add(key);
    return true;
  }).join("");

  const links = asArray(record.source as unknown[]).map((l) => {
    const obj = (typeof l === "object" && l !== null ? l : {}) as Record<string, unknown>;
    const url = contentOf(l);
    const SOURCE_LABELS: Record<string, string> = {
      src: "Source", obp: "Online browsing", rss: "RSS feed", doi: "DOI",
      git: "Repository", email: "Email", uri: "URI", issn: "ISSN", isbn: "ISBN",
    };
    if (!url || !/^https?:\/\//.test(url)) return "";
    const sourceType = typeof obj.type === "string" ? obj.type : "";
    const label = SOURCE_LABELS[sourceType] ?? "Link";
    const host = new URL(url).host.replace(/^www\./, "");
    return `<div class="ov-row"><span class="ov-key">${escapeHtml(label)}</span><span><a href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${escapeHtml(url)}">${escapeHtml(host)}</a></span></div>`;
  }).join("");

  const abstracts = asArray(record.abstract as unknown[]).map((a) => {
    const text = contentOf(a);
    if (!text) return "";
    // NOTE entries render as separate lines (they are list items in the source)
    const html = text
      .split(/(?=NOTE\s+\d)/g)
      .map((seg) => seg.trim())
      .filter(Boolean)
      .map((seg) => `<p>${escapeHtml(seg)}</p>`)
      .join("");
    return html || `<p>${escapeHtml(text)}</p>`;
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
${headingDocid ? `<p class="doc-number"><code>${escapeHtml(headingDocid)}</code></p>` : ""}
${headingTitle ? `<h1 class="doc-h1">${escapeHtml(headingTitle)}</h1>` : ""}
${otherTitleRows ? `<div class="title-parallel">${otherTitleRows}</div>` : ""}
${(factRows || identifierRows || dates) ? `<section class="ov-section"><h3>General information</h3>${factRows}${identifierRows}${dates}</section>` : ""}
${familyQuery ? `<div class="ov-series"><a class="series-link" href="/collections/${escapeHtml(collection)}?q=${encodeURIComponent(familyQuery)}">other documents in the ${escapeHtml(familyQuery)} series ↗</a></div>` : ""}
${section("contributor", "Contributors", contributorsHtml)}
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

  const entryPath = `/collections/${escapeHtml(collection)}/entries/${encodeURIComponent(key.replace(/^data\//, ""))}`;
  const citeStyles = [
    { label: "ISO 690", text: item ? toIso690(item) : "" },
    { label: "Chicago", text: item ? toChicago(item) : "" },
    { label: "APA 7th", text: item ? toApa(item) : "" },
  ].filter((s) => s.text);
  const primaryDocid = (() => {
    const docids = Array.isArray(record?.docidentifier) ? record?.docidentifier : record?.docidentifier ? [record.docidentifier] : [];
    const first = docids[0] as Record<string, unknown> | undefined;
    return typeof first?.content === "string" ? first.content : docid;
  })();
  const fetchEntry = `* [[[${anchor},${primaryDocid}]]]`;
  const citePanel = `
${citeStyles.length ? `<div class="cite-styles">${citeStyles.map((s) => `
<div class="cite-style-row">
<span class="cite-style-label">${escapeHtml(s.label)}</span>
<span class="cite-style-text">${escapeHtml(s.text)}</span>
<button type="button" class="copy-btn" data-copy-text="${escapeHtml(s.text)}">Copy</button>
</div>`).join("")}</div>` : ""}
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
  .doc-number { margin: 0; font-size: 14px; }
  .doc-number code {
    font-family: var(--mono); font-size: 19px; font-weight: 600; letter-spacing: 0.01em;
    background: none; color: var(--fg); padding: 0; border: 0;
  }
  .doc-h1 { font-size: 26px; font-weight: 700; line-height: 1.25; margin: 2px 0 8px; letter-spacing: -0.01em; }
  .row-note { font-size: 11px; color: var(--muted); margin-left: 8px; }
  .ov-value code { font-family: var(--mono); font-size: 13.5px; background: var(--bg-soft); padding: 1px 6px; border-radius: 4px; }
  .title-parallel { border-left: 1px solid var(--border); }
  .title-row {
    display: grid; grid-template-columns: 108px 1fr; gap: 14px; align-items: baseline;
    padding: 8px 0 8px 14px; position: relative;
  }
  .title-row + .title-row { border-top: 1px dashed var(--border); }
  .title-lang {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted);
  }
  .title-text { font-size: 17.5px; line-height: 1.4; font-weight: 500; }
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
  .cite-styles { display: flex; flex-direction: column; gap: 6px; margin: 0 0 10px; }
  .cite-style-row { display: grid; grid-template-columns: 90px 1fr auto; gap: 10px; align-items: baseline; }
  .cite-style-label { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .cite-style-text { font-size: 14px; }
  .tok-tag { color: var(--accent); }
  .tok-attr { color: var(--aqua); }
  .tok-str { color: #b7791f; }
  .dark .tok-str { color: #d69e2e; }
  .tok-com { color: var(--muted); font-style: italic; }
  .tok-key { color: var(--accent); }
  .tok-val { color: inherit; }
  #pane-overview { background: none; border: none; padding: 0; white-space: normal; }
`;
