// bibdata XML ↔ Relaton item. The conversions follow the model's own
// serialization rules: XML attributes become sibling keys, element text
// becomes `content`, repeated elements become arrays, and the vocabulary
// differs in a few places (uri ↔ source, on ↔ at, @schema-version ↔
// schema_version). Unknown XML elements are dropped so the result validates
// against the strict zod schemas.

import { XMLParser } from "fast-xml-parser";
import { parseItem, type ParseResult, type RelatonItem } from "./index";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

const RENAMES: Record<string, string> = {
  uri: "source",
  on: "at",
  "schema-version": "schema_version",
};

// Top-level keys of the BibItem/IetfItem schemas (strict mode rejects others).
const ITEM_KEYS = new Set([
  "id", "schema_version", "fetched", "type", "formattedref", "title", "source",
  "docidentifier", "docnumber", "date", "contributor", "edition", "version",
  "note", "language", "locale", "script", "abstract", "status", "copyright",
  "relation", "series", "medium", "place", "price", "extent", "size",
  "accesslocation", "license", "classification", "keyword", "validity",
  "depiction", "ext",
]);

function textOf(node: Record<string, unknown>): string {
  const text = node["#text"];
  if (typeof text === "string") return text.trim();
  if (typeof text === "number") return String(text);
  return "";
}

function attrsOf(node: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (!key.startsWith("@_")) continue;
    const name = RENAMES[key.slice(2)] ?? key.slice(2);
    out[name] = value === "true" ? true : value === "false" ? false : value;
  }
  return out;
}

interface Child {
  name: string;
  node: unknown;
}

function childrenOf(node: Record<string, unknown>): Child[] {
  const out: Child[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "#text" || key.startsWith("@_")) continue;
    const name = RENAMES[key] ?? key;
    for (const item of Array.isArray(value) ? value : [value]) {
      // Text-only child elements (<from>2019</from>) parse to scalars —
      // keep them; convert() passes scalars through as the child value.
      out.push({ name, node: item });
    }
  }
  return out;
}

// Schema fields that are always arrays, even with a single element.
// Context-sensitive shapes (top-level `place` is an array but `series.place`
// is an object; `validity` is an object) are left to the coercion loop.
const ALWAYS_ARRAY = new Set([
  "title", "source", "docidentifier", "date", "contributor", "role",
  "version", "note", "language", "locale", "script", "abstract",
  "copyright", "relation", "series", "price", "extent",
  "accesslocation", "license", "classification", "keyword", "depiction",
  "name", "subdivision", "description", "address", "phone", "email",
  "uri", "identifier", "taxon", "vocabid", "affiliation", "citation",
]);

function convert(node: unknown, name: string): unknown {
  if (typeof node !== "object" || node === null) return node;
  const record = node as Record<string, unknown>;
  const attrs = attrsOf(record);
  const children = childrenOf(record);
  const text = textOf(record);

  if (children.length === 0) {
    if (Object.keys(attrs).length === 0) return text;
    if (text !== "") attrs.content = text;
    return attrs;
  }

  const out: Record<string, unknown> = { ...attrs };
  if (text !== "") out.content = text;
  const byName = new Map<string, unknown[]>();
  for (const child of children) {
    const list = byName.get(child.name) ?? [];
    const converted = convert(child.node, child.name);
    if (converted === "" && !ALWAYS_ARRAY.has(child.name)) continue;
    list.push(converted);
    byName.set(child.name, list);
  }
  for (const [key, list] of byName) {
    out[key] = list.length === 1 && !ALWAYS_ARRAY.has(key) ? list[0] : list;
  }
  return out;
}


function getPath(root: Record<string, unknown>, path: (string | number)[]): { parent: Record<string, unknown> | unknown[]; key: string | number } | null {
  let parent: unknown = root;
  for (const seg of path.slice(0, -1)) {
    if (parent === null || parent === undefined) return null;
    parent = (parent as Record<string, unknown>)[seg as string];
  }
  if (parent === null || parent === undefined) return null;
  const key = path[path.length - 1] as string | number;
  if (key === undefined) return null;
  return { parent: parent as Record<string, unknown>, key };
}

/**
 * Repeatedly revalidates against the strict schemas, applying exactly the
 * fix each zod error asks for (wrap into array / object, drop unknown
 * keys). Real-world records vary in shape more than any static key map
 * can predict; this converges in a few rounds.
 */
function coerceToSchema(doc: Record<string, unknown>): ParseResult<RelatonItem> {
  let current: Record<string, unknown> = doc;
  for (let round = 0; round < 12; round++) {
    const result = parseItem(current);
    if (result.ok) return result;
    let changed = false;
    for (const err of result.errors) {
      const at = getPath(current, err.path);
      if (!at) continue;
      const { parent, key } = at;
      const container = parent as Record<string, unknown>;
      const value = container[key as string];
      if (err.message.includes("Expected array")) {
        if (!Array.isArray(value)) {
          container[key as string] = [value];
          changed = true;
        }
      } else if (err.message.includes("Expected object, received array")) {
        if (Array.isArray(value) && value.length === 1) {
          container[key as string] = value[0];
          changed = true;
        }
      } else if (err.message.includes("Expected object, received string")) {
        if (typeof value === "string" && value !== "") {
          container[key as string] = { content: value };
          changed = true;
        } else if (value === "") {
          container[key as string] = {};
          changed = true;
        }
      } else if (err.message.includes("Unrecognized key")) {
        // The error path points at the object HOLDING the bad key.
        const match = err.message.match(/'([^']+)'/);
        if (match?.[1] && typeof value === "object" && value !== null) {
          delete (value as Record<string, unknown>)[match[1]];
          changed = true;
        }
      }
    }
    if (!changed) return result;
  }
  return parseItem(current);
}

export function detectXml(text: string): boolean {
  return text.trimStart().startsWith("<");
}

/** Parses a bibdata XML document into a validated Relaton item. */
export function fromXml(xml: string): ParseResult<RelatonItem> {
  try {
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const bibdata = parsed["bibdata"];
    if (typeof bibdata !== "object" || bibdata === null) {
      return { ok: false, errors: [{ path: [], message: "no <bibdata> root element" }] };
    }
    const node = bibdata as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    const attrs = attrsOf(node);
    for (const key of ["type", "schema_version"]) {
      if (typeof attrs[key] === "string") out[key] = attrs[key];
    }

    const byName = new Map<string, unknown[]>();
    for (const child of childrenOf(node)) {
      if (!ITEM_KEYS.has(child.name)) continue;
      const list = byName.get(child.name) ?? [];
      const converted = convert(child.node, child.name);
      if (converted === "" && !ALWAYS_ARRAY.has(child.name)) continue;
      list.push(converted);
      byName.set(child.name, list);
    }
    for (const [key, list] of byName) {
      out[key] = list.length === 1 && !ALWAYS_ARRAY.has(key) ? list[0] : list;
    }

    return coerceToSchema(out);
  } catch (e) {
    return { ok: false, errors: [{ path: [], message: String(e) }] };
  }
}

function xmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// item key → XML element name (inverse of RENAMES)
const TO_XML_NAMES: Record<string, string> = {
  source: "uri",
  at: "on",
  schema_version: "schema-version",
};

const ATTR_KEYS = new Set(["language", "locale", "script", "format", "type", "scope", "primary"]);

function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

interface XmlLine {
  name: string;
  attrs: string;
  text?: string;
  children?: XmlLine[];
}

function toLines(name: string, value: unknown): XmlLine | null {
  if (value === null || value === undefined || value === "") return null;
  if (isScalar(value)) {
    return { name, attrs: "", text: String(value) };
  }
  if (Array.isArray(value)) {
    throw new Error(`array reached without a plural context: ${name}`);
  }
  const obj = value as Record<string, unknown>;
  const line: XmlLine = { name, attrs: "" };
  for (const [key, attrValue] of Object.entries(obj)) {
    if (!ATTR_KEYS.has(key)) continue;
    if (attrValue === null || attrValue === undefined) continue;
    if (key === "primary") {
      if (attrValue === true) line.attrs += ' primary="true"';
    } else if (typeof attrValue === "string" && attrValue !== "") {
      line.attrs += ` ${key}="${xmlEsc(attrValue)}"`;
    }
  }
  const children: XmlLine[] = [];
  for (const [key, childValue] of Object.entries(obj)) {
    if (ATTR_KEYS.has(key) || key === "content") continue;
    const childName = TO_XML_NAMES[key] ?? key;
    if (childValue === null || childValue === undefined) continue;
    if (Array.isArray(childValue)) {
      for (const entry of childValue) {
        const child = toLines(childName, entry);
        if (child) children.push(child);
      }
    } else if (key === "keyword" && typeof childValue === "object" && childValue !== null) {
      // keyword: [{vocab: {content}}] → <keyword>text</keyword>
      const kw = childValue as Record<string, unknown>;
      const vocab = kw.vocab as Record<string, unknown> | undefined;
      const text = typeof vocab?.content === "string" ? vocab.content : "";
      if (text) children.push({ name: childName, attrs: "", text });
    } else {
      const child = toLines(childName, childValue);
      if (child) children.push(child);
    }
  }
  // `content` is the element's text, never a child element.
  if (typeof obj.content === "string" && obj.content !== "") line.text = obj.content;
  else if (typeof obj.content === "number") line.text = String(obj.content);
  if (children.length > 0) line.children = children;
  return line;
}

function renderLines(lines: XmlLine[], indent: string, out: string[]): void {
  for (const line of lines) {
    const open = `<${line.name}${line.attrs}>`;
    if (line.children) {
      out.push(`${indent}${open}`);
      renderLines(line.children, `${indent}  `, out);
      out.push(`${indent}</${line.name}>`);
    } else if (line.text !== undefined) {
      out.push(`${indent}${open}${xmlEsc(line.text)}</${line.name}>`);
    } else {
      out.push(`${indent}<${line.name}${line.attrs}/>`);
    }
  }
}

/** Serializes a Relaton item to bibdata XML. */
export function toXml(item: RelatonItem): string {
  const rec = item as unknown as Record<string, unknown>;
  const children: XmlLine[] = [];
  let rootAttrs = "";
  if (typeof rec.type === "string") rootAttrs += ` type="${xmlEsc(rec.type)}"`;
  if (typeof rec.schema_version === "string") rootAttrs += ` schema-version="${xmlEsc(rec.schema_version)}"`;

  for (const [key, value] of Object.entries(rec)) {
    if (key === "type" || key === "schema_version") continue;
    const childName = TO_XML_NAMES[key] ?? key;
    if (value === null || value === undefined) continue;
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      const child = toLines(childName, entry);
      if (child) children.push(child);
    }
  }

  const out: string[] = [];
  // Fast-path self-closing role elements: <role type="author"/>
  renderLines(children, "  ", out);
  return `<bibdata${rootAttrs}>\n${out.join("\n")}\n</bibdata>`;
}
