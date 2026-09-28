import type { AppEnv } from "../env";
import { layout, escapeHtml } from "./ui/chrome";
import { slugAnchor } from "../lib/asciibib";

// Citation-formatter-style builder for a Relaton bibliographic record:
// fill in the fields, get live Relaton YAML / Relaton XML (bibdata) / JSON /
// AsciiBib output to copy — the AsciiBib form pastes straight into a
// Metanorma [bibliography] section. All generation is client-side.

const TYPES = [
  "standard", "article", "book", "report", "techreport", "website",
  "software", "dataset", "presentation", "proceedings", "thesis",
  "patent", "manual", "electronic resource", "map", "misc",
];

const DATE_TYPES = ["published", "issued", "created", "updated", "accessed", "circulated"];
const ROLES = ["publisher", "author", "editor", "distributor"];

function optionList(values: string[], selected: string): string {
  return values.map((v) =>
    `<option value="${escapeHtml(v)}"${v === selected ? " selected" : ""}>${escapeHtml(v)}</option>`,
  ).join("");
}

const CSS = `
  .builder { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 32px; align-items: start; }
  @media (max-width: 980px) { .builder { grid-template-columns: minmax(0, 1fr); } }
  fieldset { border: 1px solid var(--border); border-radius: 12px; margin: 0 0 18px; padding: 14px 16px 16px; }
  legend { font-weight: 600; font-size: 14px; padding: 0 6px; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
  .fields .wide { grid-column: 1 / -1; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 500; color: var(--fg-2); }
  input, select, textarea {
    font: 14px/1.5 var(--font); padding: 8px 10px; border: 1px solid var(--border);
    border-radius: 8px; background: var(--bg); color: var(--fg); width: 100%;
  }
  textarea { font-family: var(--mono); font-size: 13px; resize: vertical; }
  input:focus, select:focus, textarea:focus { outline: 2px solid var(--accent-soft); border-color: var(--accent); }
  .row-list { display: flex; flex-direction: column; gap: 10px; }
  .row { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; align-items: end; }
  .row .full { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; }
  .btn-sm {
    font: 13px var(--font); padding: 8px 12px; border: 1px dashed var(--border);
    border-radius: 8px; background: none; color: var(--muted); cursor: pointer; align-self: end;
  }
  .btn-sm:hover { color: var(--accent); border-color: var(--accent); }
  .remove-row { font-size: 16px; line-height: 1; padding: 10px 12px; }
  .presets { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 18px; }
  .preset {
    font: 13px var(--font); padding: 7px 14px; border: 1px solid var(--border);
    border-radius: 999px; background: var(--bg-soft); color: var(--fg-2); cursor: pointer;
  }
  .preset:hover { border-color: var(--accent); color: var(--accent); }
  .output { position: sticky; top: 87px; }
  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .tab-btn {
    padding: 10px 16px; font-size: 14px; font-weight: 500; font-family: var(--font);
    border: none; background: none; color: var(--muted); cursor: pointer;
    border-bottom: 2px solid transparent; margin-bottom: -1px;
  }
  .tab-btn:hover { color: var(--fg); }
  .tab-btn[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
  .output pre { border-radius: 0 0 8px 8px; border-top: none; max-height: 480px; overflow: auto; }
  .output-bar { display: flex; justify-content: flex-end; gap: 8px; padding: 6px 10px; align-items: center;
                background: var(--bg-soft); border: 1px solid var(--border); border-bottom: none; border-radius: 8px 8px 0 0; }
  .copy-btn { font: 13px var(--font); padding: 5px 14px; border: 1px solid var(--border); border-radius: 6px;
              background: var(--bg); color: var(--fg-2); cursor: pointer; }
  .copy-btn:hover { color: var(--accent); border-color: var(--accent); }
  .copy-btn.copied { color: var(--success); border-color: var(--success); }
  .hint { font-size: 13px; color: var(--muted); margin: 10px 0 0; }
  .hint code { background: var(--bg-mute); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
`;


const CONTRIB_ROW = `<div class="row" data-contrib-row>
  <label>Kind
    <select data-contrib-kind onchange="var r=this.closest('.row'); r.querySelector('[data-contrib-org-field]').hidden=this.value!=='organization'; r.querySelector('[data-contrib-person-field]').hidden=this.value!=='person';">
      <option value="organization">Organization</option>
      <option value="person">Person</option>
    </select>
  </label>
  <label>Role
    <select data-contrib-role>
      ${optionList(ROLES, "publisher")}
    </select>
  </label>
  <div class="full"></div>
  <div class="wide" data-contrib-org-field><label class="wide">Organization name <input data-contrib-org placeholder="International Organization for Standardization"></label></div>
  <div class="wide" data-contrib-org-field><label>Abbreviation <input data-contrib-abbr placeholder="ISO"></label></div>
  <div class="wide" data-contrib-person-field hidden><label class="wide">Person name <input data-contrib-person placeholder="A. Bierman"></label></div>
  <button type="button" class="btn-sm remove-row" data-remove-row aria-label="Remove contributor">×</button>
</div>`;

const DATE_ROW = `<div class="row" data-date-row>
  <label>Date type
    <select data-date-type>${optionList(DATE_TYPES, "published")}</select>
  </label>
  <div></div>
  <label>Value <input data-date-value placeholder="2019-02 or 2019"></label>
  <button type="button" class="btn-sm remove-row" data-remove-row aria-label="Remove date">×</button>
</div>`;

const PRESETS: Record<string, {
  label: string;
  fields: Record<string, string>;
  primary?: boolean;
  contributors: { kind: string; role: string; org?: string; person?: string }[];
  dates: { type: string; value: string }[];
}> = {
  iso: {
    label: "ISO standard",
    fields: {
      "f-type": "standard",
      "f-docid": "ISO 8601-1:2019",
      "f-docid-type": "ISO",
      "f-title": "Date and time — Representations for information interchange — Part 1: Basic rules",
      "f-edition": "1",
      "f-uri": "https://www.iso.org/standard/70907.html",
      "f-uri-type": "src",
      "f-language": "en",
      "f-script": "Latn",
      "f-keywords": "date, time, interchange",
    },
    primary: true,
    contributors: [
      { kind: "organization", role: "publisher", org: "International Organization for Standardization" },
      { kind: "person", role: "author", person: "A. Bierman" },
    ],
    dates: [{ type: "published", value: "2019-02" }],
  },
  rfc: {
    label: "RFC / IETF",
    fields: {
      "f-type": "standard",
      "f-docid": "RFC 8446",
      "f-docid-type": "IETF",
      "f-title": "The Transport Layer Security (TLS) Protocol Version 1.3",
      "f-uri": "https://www.rfc-editor.org/info/rfc8446",
      "f-uri-type": "src",
      "f-language": "en",
      "f-script": "Latn",
      "f-abstract": "This document specifies version 1.3 of the Transport Layer Security (TLS) protocol.",
    },
    primary: true,
    contributors: [
      { kind: "organization", role: "publisher", org: "Internet Engineering Task Force" },
      { kind: "person", role: "author", person: "E. Rescorla" },
    ],
    dates: [{ type: "published", value: "2018-08" }],
  },
  article: {
    label: "Journal article",
    fields: {
      "f-type": "article",
      "f-docid": "doi:10.1000/xyz123",
      "f-docid-type": "DOI",
      "f-title": "A study of things",
      "f-uri": "https://example.org/article",
      "f-uri-type": "src",
      "f-language": "en",
      "f-script": "Latn",
      "f-keywords": "study, things",
    },
    contributors: [
      { kind: "person", role: "author", person: "A. Author" },
      { kind: "organization", role: "publisher", org: "Example Journal" },
    ],
    dates: [{ type: "published", value: "2024-06" }],
  },
};

const SCRIPT = `
var TABS = ["yaml", "xml", "json", "asciibib"];

function el(id) { return document.getElementById(id); }
function val(id) { return (el(id).value || "").trim(); }

function yamlScalar(v) {
  var s = String(v);
  if (s === "") return '""';
  if (/^(true|false|null|~|-?\\d+(\\.\\d+)?)$/.test(s) || /[:#\\[\\]{}&*!|>'"%@\`/.test(s) || /^\\s|\\s$/.test(s)) {
    return '"' + s.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\\\"') + '"';
  }
  return s;
}

function toYaml(value, indent) {
  var pad = new Array(indent + 1).join(" ");
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value.map(function (item) {
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        var inner = toYaml(item, indent + 2).split("\\n").map(function (l, i) { return i === 0 ? l : l; });
        return pad + "- " + inner.join("\\n").replace(/^\\s+/, "");
      }
      return pad + "- " + yamlScalar(item);
    }).join("\\n");
  }
  if (value !== null && typeof value === "object") {
    var keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    return keys.map(function (k) {
      var v = value[k];
      if (v !== null && typeof v === "object" && ((Array.isArray(v) && v.length) || (!Array.isArray(v) && Object.keys(v).length))) {
        return pad + k + ":\\n" + toYaml(v, indent + 2);
      }
      return pad + k + ": " + (v === null || v === undefined ? "" : (typeof v === "object" ? toYaml(v, indent) : yamlScalar(v)));
    }).join("\\n");
  }
  return pad + yamlScalar(value);
}

function xmlEsc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toXml(rec, anchor) {
  var out = [];
  out.push('<bibdata type="' + xmlEsc(rec.type || "standard") + '">');
  (rec.title || []).forEach(function (t) {
    var attrs = ' format="text/plain"';
    if (t.language) attrs += ' language="' + xmlEsc(t.language) + '"';
    if (t.script) attrs += ' script="' + xmlEsc(t.script) + '"';
    out.push("  <title" + attrs + ">" + xmlEsc(t.content) + "</title>");
  });
  (rec.link || []).forEach(function (l) {
    out.push('  <uri type="' + xmlEsc(l.type || "src") + '">' + xmlEsc(l.content) + "</uri>");
  });
  (rec.docid || []).forEach(function (d) {
    var attrs = d.type ? ' type="' + xmlEsc(d.type) + '"' : "";
    if (d.primary) attrs += ' primary="true"';
    out.push("  <docidentifier" + attrs + ">" + xmlEsc(d.id) + "</docidentifier>");
  });
  (rec.date || []).forEach(function (d) {
    out.push('  <date type="' + xmlEsc(d.type) + '">');
    if (d.value) out.push("    <on>" + xmlEsc(d.value) + "</on>");
    if (d.from) out.push("    <from>" + xmlEsc(d.from) + "</from>");
    if (d.to) out.push("    <to>" + xmlEsc(d.to) + "</to>");
    out.push("  </date>");
  });
  (rec.contributor || []).forEach(function (c) {
    out.push("  <contributor>");
    out.push('    <role type="' + xmlEsc(c.role.type) + '"/>');
    if (c.organization) {
      out.push("    <organization>");
      out.push("      <name>" + xmlEsc(c.organization.name) + "</name>");
      if (c.organization.abbreviation) out.push("      <abbreviation>" + xmlEsc(c.organization.abbreviation) + "</abbreviation>");
      out.push("    </organization>");
    } else if (c.person) {
      out.push("    <person>");
      out.push("      <name>");
      var lang = c.person.name.completename.language ? ' language="' + xmlEsc(c.person.name.completename.language) + '"' : "";
      out.push("        <completename" + lang + ">" + xmlEsc(c.person.name.completename.content) + "</completename>");
      out.push("      </name>");
      out.push("    </person>");
    }
    out.push("  </contributor>");
  });
  if (rec.edition) out.push("  <edition>" + xmlEsc(rec.edition) + "</edition>");
  (rec.language || []).forEach(function (l) { out.push("  <language>" + xmlEsc(l) + "</language>"); });
  (rec.script || []).forEach(function (s) { out.push("  <script>" + xmlEsc(s) + "</script>"); });
  (rec.abstract || []).forEach(function (a) { out.push("  <abstract>" + xmlEsc(a.content) + "</abstract>"); });
  (rec.keyword || []).forEach(function (k) { out.push("  <keyword>" + xmlEsc(k) + "</keyword>"); });
  out.push("</bibdata>");
  return out.join("\\n");
}

function flattenAsciibib(value, path, out) {
  if (value === null || value === undefined) return;
  if (typeof value !== "object") {
    var s = String(value);
    if (s !== "") out.push(path + ":: " + s);
    return;
  }
  if (Array.isArray(value)) {
    if (value.every(function (v) { return typeof v !== "object" || v === null; })) {
      value.forEach(function (v) {
        var s2 = String(v);
        if (s2 !== "") out.push(path + ":: " + s2);
      });
      return;
    }
    value.forEach(function (item) {
      out.push(path + "::");
      flattenAsciibib(item, path, out);
    });
    return;
  }
  Object.keys(value).forEach(function (key) {
    flattenAsciibib(value[key], path ? path + "." + key : key, out);
  });
}

function toAsciiBib(rec, anchor) {
  var lines = ["[[" + anchor + "]]", "[%bibitem]", "== {blank}"];
  flattenAsciibib(rec, "", lines);
  return lines.join("\\n");
}

function readContributors() {
  var rows = document.querySelectorAll("[data-contrib-row]");
  var list = [];
  rows.forEach(function (row) {
    var kind = row.querySelector("[data-contrib-kind]").value;
    var role = row.querySelector("[data-contrib-role]").value;
    var c = { role: { type: role } };
    if (kind === "organization") {
      var name = row.querySelector("[data-contrib-org]").value.trim();
      if (!name) return;
      c.organization = { name: name };
      var abbr = row.querySelector("[data-contrib-abbr]").value.trim();
      if (abbr) c.organization.abbreviation = abbr;
    } else {
      var person = row.querySelector("[data-contrib-person]").value.trim();
      if (!person) return;
      c.person = { name: { completename: { content: person } } };
    }
    list.push(c);
  });
  return list;
}

function readDates() {
  var rows = document.querySelectorAll("[data-date-row]");
  var list = [];
  rows.forEach(function (row) {
    var type = row.querySelector("[data-date-type]").value;
    var value = row.querySelector("[data-date-value]").value.trim();
    if (value) list.push({ type: type, value: value });
  });
  return list;
}

function splitList(s) {
  return s.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
}

function readRecord() {
  var rec = {};
  var docid = val("f-docid");
  if (docid) {
    var d = { id: docid };
    var dtype = val("f-docid-type");
    if (dtype) d.type = dtype;
    if (el("f-docid-primary").checked) d.primary = true;
    rec.docid = [d];
  }
  var type = val("f-type");
  if (type) rec.type = type;
  var title = val("f-title");
  if (title) {
    var t = { type: val("f-title-type") || "main", content: title };
    var lang = val("f-language") || "en";
    if (lang) t.language = lang;
    var script = val("f-script") || "Latn";
    if (script) t.script = script;
    rec.title = [t];
  }
  var contributors = readContributors();
  if (contributors.length) rec.contributor = contributors;
  var dates = readDates();
  if (dates.length) rec.date = dates;
  var edition = val("f-edition");
  if (edition) rec.edition = edition;
  var lang = val("f-language");
  if (lang) rec.language = [lang];
  var script = val("f-script");
  if (script) rec.script = [script];
  var uri = val("f-uri");
  if (uri) rec.link = [{ type: val("f-uri-type") || "src", content: uri }];
  var abstract = val("f-abstract");
  if (abstract) rec.abstract = [{ content: abstract }];
  var keywords = splitList(val("f-keywords"));
  if (keywords.length) rec.keyword = keywords;
  return rec;
}

function currentAnchor(rec) {
  var manual = val("f-anchor");
  if (manual) return manual;
  var d = (rec.docid && rec.docid[0] && rec.docid[0].id) || "";
  return d ? d.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase() : "";
}

function render() {
  var rec = readRecord();
  var anchor = currentAnchor(rec);
  var empty = Object.keys(rec).length === 0;
  el("out-yaml").textContent = empty ? "# Fill in the form…" : toYaml(rec, 0);
  el("out-xml").textContent = empty ? "<!-- Fill in the form… -->" : toXml(rec, anchor);
  el("out-json").textContent = empty ? "// Fill in the form…" : JSON.stringify(rec, null, 2);
  var bib = toAsciiBib(rec, anchor);
  el("out-asciibib").textContent = empty ? "// Fill in the form…" : bib;
  el("cite-hint").innerHTML = anchor
    ? "Cite in Metanorma with <code>&lt;&lt;" + anchor + "&gt;&gt;</code> or <code>cite:[" + anchor + "]</code> — paste the block under a <code>[bibliography]</code> heading."
    : "";
}

var TEMPLATE_CONTRIB = ${JSON.stringify(CONTRIB_ROW)};
var TEMPLATE_DATE = ${JSON.stringify(DATE_ROW)};

function wireCopy() {
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var pane = el("out-" + btn.dataset.copy);
      navigator.clipboard.writeText(pane.textContent).then(function () {
        btn.textContent = "Copied!";
        btn.classList.add("copied");
        setTimeout(function () { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1500);
      });
    });
  });
}

function wireTabs() {
  document.querySelectorAll("[data-pane-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("[data-pane-tab]").forEach(function (b) {
        b.setAttribute("aria-selected", String(b === btn));
      });
      document.querySelectorAll("[data-pane]").forEach(function (p) {
        p.hidden = p.id !== "pane-" + btn.dataset.paneTab;
      });
    });
  });
}

function wireRows() {
  el("add-contrib").addEventListener("click", function () {
    el("contrib-list").insertAdjacentHTML("beforeend", TEMPLATE_CONTRIB);
    bindRowRemoval();
    render();
  });
  el("add-date").addEventListener("click", function () {
    el("date-list").insertAdjacentHTML("beforeend", TEMPLATE_DATE);
    bindRowRemoval();
    render();
  });
  bindRowRemoval();
}

function bindRowRemoval() {
  document.querySelectorAll("[data-remove-row]").forEach(function (btn) {
    if (btn.wired) return;
    btn.wired = true;
    btn.addEventListener("click", function () {
      btn.closest("[data-contrib-row], [data-date-row]").remove();
      render();
    });
  });
}

var PRESETS = ${JSON.stringify(PRESETS)};

function applyPreset(name) {
  var p = PRESETS[name];
  if (!p) return;
  el("contrib-list").innerHTML = "";
  el("date-list").innerHTML = "";
  Object.keys(p.fields).forEach(function (id) { el(id).value = p.fields[id]; });
  el("f-docid-primary").checked = !!p.primary;
  p.contributors.forEach(function (c) {
    el("contrib-list").insertAdjacentHTML("beforeend", TEMPLATE_CONTRIB);
    var row = el("contrib-list").lastElementChild;
    row.querySelector("[data-contrib-kind]").value = c.kind;
    row.querySelector("[data-contrib-role]").value = c.role;
    if (c.kind === "organization") row.querySelector("[data-contrib-org]").value = c.org || "";
    else row.querySelector("[data-contrib-person]").value = c.person || "";
  });
  p.dates.forEach(function (d) {
    el("date-list").insertAdjacentHTML("beforeend", TEMPLATE_DATE);
    var row = el("date-list").lastElementChild;
    row.querySelector("[data-date-type]").value = d.type;
    row.querySelector("[data-date-value]").value = d.value;
  });
  var selects = document.querySelectorAll("select");
  selects.forEach(function () {});
  render();
}

document.querySelectorAll("[data-preset]").forEach(function (btn) {
  btn.addEventListener("click", function () { applyPreset(btn.dataset.preset); });
});

document.querySelectorAll("input, select, textarea").forEach(function (input) {
  input.addEventListener("input", render);
  input.addEventListener("change", render);
});

wireCopy();
wireTabs();
wireRows();
render();
`;

export function renderCreatePage(): string {
  const presets = Object.entries(PRESETS)
    .map(([key, p]) => `<button type="button" class="preset" data-preset="${key}">${escapeHtml(p.label)}</button>`)
    .join("");

  const body = `
<h1>Create a Relaton record</h1>
<p class="sub">Fill in the fields like a citation formatter — the Relaton YAML, Relaton XML
(<code>bibdata</code>), JSON, and AsciiBib serializations are generated live.
The AsciiBib output pastes straight into a Metanorma document.</p>

<div class="builder">
  <form onsubmit="return false">
    <div class="presets">
      <span class="hint" style="margin:0 8px 0 0;align-self:center">Load an example:</span>
      ${presets}
    </div>

    <fieldset>
      <legend>Identifier &amp; type</legend>
      <div class="fields">
        <label>Document identifier
          <input id="f-docid" placeholder="ISO 8601-1:2019">
        </label>
        <label>Identifier type
          <input id="f-docid-type" placeholder="ISO, IETF, DOI…">
        </label>
        <label>Type
          <select id="f-type">${optionList(TYPES, "standard")}</select>
        </label>
        <label style="justify-content:flex-end;flex-direction:row;align-items:center;gap:8px">
          <input type="checkbox" id="f-docid-primary" style="width:auto" checked> Primary identifier
        </label>
        <label class="wide">Anchor (citation id — derived from the identifier if blank)
          <input id="f-anchor" placeholder="${escapeHtml(slugAnchor("ISO 8601-1:2019"))}">
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend>Title</legend>
      <div class="fields">
        <label class="wide">Title
          <input id="f-title" placeholder="Date and time — Representations for information interchange">
        </label>
        <label>Title type
          <select id="f-title-type">
            <option value="main" selected>main</option>
            <option value="title-part">title-part</option>
            <option value="subtitle">subtitle</option>
          </select>
        </label>
        <label>Language
          <input id="f-language" value="en">
        </label>
        <label>Script
          <input id="f-script" value="Latn">
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend>Contributors</legend>
      <div class="row-list" id="contrib-list"></div>
      <button type="button" class="btn-sm" id="add-contrib" style="margin-top:10px">+ Add contributor</button>
    </fieldset>

    <fieldset>
      <legend>Dates</legend>
      <div class="row-list" id="date-list"></div>
      <button type="button" class="btn-sm" id="add-date" style="margin-top:10px">+ Add date</button>
    </fieldset>

    <fieldset>
      <legend>Publication details</legend>
      <div class="fields">
        <label>Edition
          <input id="f-edition" placeholder="1">
        </label>
        <label>Link type
          <select id="f-uri-type">
            <option value="src" selected>src</option>
            <option value="doi">doi</option>
            <option value="obp">obp</option>
            <option value="rss">rss</option>
          </select>
        </label>
        <label class="wide">URI
          <input id="f-uri" placeholder="https://…">
        </label>
        <label class="wide">Abstract
          <textarea id="f-abstract" rows="3"></textarea>
        </label>
        <label class="wide">Keywords (comma-separated)
          <input id="f-keywords" placeholder="date, time, interchange">
        </label>
      </div>
    </fieldset>
  </form>

  <div class="output">
    <div class="output-bar"><button type="button" class="copy-btn" data-copy="yaml">Copy</button></div>
    <div class="tabs" role="tablist">
      <button class="tab-btn" data-pane-tab="yaml" role="tab" aria-selected="true">Relaton YAML</button>
      <button class="tab-btn" data-pane-tab="xml" role="tab" aria-selected="false">Relaton XML</button>
      <button class="tab-btn" data-pane-tab="json" role="tab" aria-selected="false">JSON</button>
      <button class="tab-btn" data-pane-tab="asciibib" role="tab" aria-selected="false">AsciiBib</button>
    </div>
    <pre id="pane-yaml" data-pane><code id="out-yaml"></code></pre>
    <pre id="pane-xml" data-pane hidden><code id="out-xml"></code></pre>
    <pre id="pane-json" data-pane hidden><code id="out-json"></code></pre>
    <pre id="pane-asciibib" data-pane hidden><code id="out-asciibib"></code></pre>
    <p class="hint" id="cite-hint"></p>
  </div>
</div>`;

  return layout({ title: "Create a record — Relaton API", body, css: CSS, activeNav: "create" });
}

export type { AppEnv };
