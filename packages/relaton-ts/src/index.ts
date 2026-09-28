import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import * as Bib from "./generated/bib_item.js";
import * as Ietf from "./generated/ietf_item.js";

export { Bib, Ietf };

export type BibItem = Bib.BibItem;
export type IetfItem = Ietf.IetfItem;

export type RelatonItem = BibItem | IetfItem;

export type ParseResult<T> =
  | { ok: true; item: T }
  | { ok: false; errors: { path: (string | number)[]; message: string }[] };

function fail(result: { error: { issues: { path: (string | number)[]; message: string }[] } }): ParseResult<never> {
  return {
    ok: false,
    errors: result.error.issues.map((i) => ({ path: i.path, message: i.message })),
  };
}

/** Parses an already-decoded document (plain object) as a Relaton item. */
export function parseItem(doc: unknown): ParseResult<RelatonItem> {
  const flavor = flavorOf(doc);
  const schema = flavor === "ietf" ? Ietf.IetfItem : Bib.BibItem;
  const result = schema.safeParse(doc);
  return result.success ? { ok: true, item: result.data } : fail(result);
}

/**
 * Parses a Relaton v3 document from YAML or JSON text. The flavor is sniffed
 * from `ext.flavor` (defaulting to the generic bibliographic model), so IETF
 * records validate against the IETF flavor schema.
 */
export function parse(text: string): ParseResult<RelatonItem> {
  let doc: unknown;
  try {
    doc = text.trimStart().startsWith("{") ? JSON.parse(text) : parseYaml(text);
  } catch (e) {
    return { ok: false, errors: [{ path: [], message: String(e) }] };
  }
  return parseItem(doc);
}

function flavorOf(doc: unknown): string | undefined {
  if (doc && typeof doc === "object" && "ext" in doc) {
    const ext = (doc as { ext?: { flavor?: unknown } }).ext;
    if (ext && typeof ext === "object" && typeof ext.flavor === "string") {
      return ext.flavor;
    }
  }
  return undefined;
}

/** Serializes a parsed item back to JSON text (key order follows the input). */
export function toJson(item: RelatonItem): string {
  return JSON.stringify(item);
}

/** Serializes a parsed item back to YAML. */
export function toYaml(item: RelatonItem): string {
  return stringifyYaml(item);
}

export { fromXml, toXml, detectXml } from "./xml.js";
export { toAsciiBib, slugAnchor } from "./asciibib.js";
