// Citation validation (epic #175, issue #182): every standard reference in
// a draft, checked against the Index.
//
//   parsed     — is it a well-formed identifier? (the pubid parse)
//   resolved   — does the Index hold it? (the resolve identity lanes only;
//                a fuzzy hit is a suggestion, never a resolution)
//   current    — does a newer edition of the same document exist?
//   superseded — does a stored relation say it was replaced?
//   cited      — is the form the record's own identifier?
//
// Discovery, never authority (relaton#535, decision D1): an undated
// reference is a warning. It never resolves to an edition — its editions
// come back as `alternatives` only, and no edition check runs on it.
// Identifier work goes through the pubid path (parse, deriveKeys) and the
// resolve lanes — there is no identifier regex here. The only text
// handling is the line split and the list-marker strip of a bibliography.
import { getDocumentBySlug, type ResolveTier } from "./resolve";
import { parseId } from "../pubid/engine";
import { getDocument, getDocumentByDocid, getDocumentByLookupKey, type StorageV2Doc } from "./storage2";
import { deriveKeys, normalizeCode, normKey } from "../pubid/keys.ts";
import { renderCitation, type CiteStyle } from "./cite";

/** References per request. Each costs about 5–8 D1 queries (identity lanes
 * stop at the first hit), which keeps a full request far under the D1
 * per-invocation query limit. */
export const MAX_REFERENCES = 50;
const CONCURRENCY = 10;
const MAX_ALTERNATIVES = 10;

export type Verdict = "ok" | "warning" | "error";

export interface SupersessionEdge {
  relation: string;
  direction: "out" | "in";
  /** The replacing record's key, when the Index holds it on that edge. */
  key: string | null;
  docid: string;
}

export interface ValidationResult {
  input: string;
  reference: string;
  verdict: Verdict;
  checks: {
    parsed: { ok: boolean; canonical: string | null };
    resolved: { ok: boolean; key: string | null; docid: string | null; flavor: string | null; tier: ResolveTier | null; alternatives: string[] };
    dated: boolean | null;
    current: { ok: boolean | null; latest: { key: string; docid: string | null; year: number } | null };
    superseded: { ok: boolean | null; by: SupersessionEdge[] };
    cited: { ok: boolean | null; expected: string | null };
  };
  citation?: string;
  messages: string[];
}

export interface ValidationReport {
  summary: { total: number; ok: number; warning: number; error: number };
  results: ValidationResult[];
}

// Relations that say "this record was replaced": the replaced record's own
// edge (out) or the replacing record's edge (in). The types are the
// supersession / obsolescence classes of lib/timeline.
const REPLACED_BY_OUT = new Set(["supersededBy", "obsoletedBy"]);
const REPLACES_IN = new Set(["supersedes", "obsoletes", "supplants"]);

const LIST_MARKER = /^\s*(?:\[\d+\]|\(\d+\)|\d+[.)](?=\s|$)|[-*•](?=\s|$))\s*/u;

/** The identifier part of one bibliography line: the list marker goes,
 * and the text after the first comma (the title) goes. The parser and the
 * resolve lanes judge what is left. */
export function referenceId(line: string): string {
  const body = line.replace(LIST_MARKER, "");
  const comma = body.indexOf(",");
  return (comma === -1 ? body : body.slice(0, comma)).trim();
}

/** One reference per non-empty line. */
export function splitReferences(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
}

/** The resolve identity lanes in tier order (the same chain as
 * `identifierCandidates`), stopping at the first hit: validation needs the
 * one record a dated reference names, not every lane's answer. */
async function resolveIdentity(
  db: D1Database,
  q: string,
): Promise<{ doc: StorageV2Doc; tier: ResolveTier } | null> {
  const lanes: [ResolveTier, () => Promise<StorageV2Doc | null>][] = [
    ["exact", () => getDocument(db, q)],
    ["lookup", () => getDocumentByLookupKey(db, normKey(q))],
    ["lookup", () => getDocumentByLookupKey(db, normKey(q).replace(/-/g, ""))],
    ["slug", () => getDocumentBySlug(db, q)],
    ["docid", () => getDocumentByDocid(db, q)],
  ];
  for (const [tier, lane] of lanes) {
    const doc = await lane();
    if (doc) return { doc, tier };
  }
  return null;
}

function emptyResult(input: string, reference: string): ValidationResult {
  return {
    input,
    reference,
    verdict: "ok",
    checks: {
      parsed: { ok: false, canonical: null },
      resolved: { ok: false, key: null, docid: null, flavor: null, tier: null, alternatives: [] },
      dated: null,
      current: { ok: null, latest: null },
      superseded: { ok: null, by: [] },
      cited: { ok: null, expected: null },
    },
    messages: [],
  };
}

async function validateOne(
  db: D1Database,
  input: string,
  opts: { style?: CiteStyle; lang?: string },
): Promise<ValidationResult> {
  const reference = referenceId(input);
  const result = emptyResult(input, reference);
  const { checks, messages } = result;
  const warn = (m: string) => { messages.push(m); if (result.verdict === "ok") result.verdict = "warning"; };
  const fail = (m: string) => { messages.push(m); result.verdict = "error"; };

  if (!reference) {
    fail("empty reference");
    return result;
  }

  // relaton-api-js#187: the engine parse (nist/ieee now included) replaces
  // the node-side shim parseComponents.
  const parse = await parseId(reference);
  let canonical: string | null = null;
  let year: unknown = null;
  if (parse.ok) {
    canonical = (() => { try { return parse.id.toHuman(); } catch { return null; } })();
    year = parse.id.toHash?.().year ?? null;
  }
  checks.parsed = { ok: parse.ok, canonical };
  checks.dated = parse.ok ? year != null : null;

  // Undated: list the editions the Index holds (newest first) and stop.
  if (checks.dated === false) {
    const { results } = await db
      .prepare("SELECT key FROM documents_search WHERE undated_norm = ? ORDER BY year DESC LIMIT ?")
      .bind(deriveKeys(reference).undated, MAX_ALTERNATIVES)
      .all<{ key: string }>();
    checks.resolved.alternatives = (results ?? []).map((r) => r.key);
    if (checks.resolved.alternatives.length) {
      warn("undated reference: cite a dated edition (the API does not pick one; see alternatives)");
    } else {
      fail("undated reference, and no edition of it is in the Index");
    }
    return result;
  }

  const hit = await resolveIdentity(db, reference);
  if (!hit) {
    fail(parse.ok ? "not found in the Index" : "not a recognized identifier, and not found in the Index");
    return result;
  }
  const { doc, tier } = hit;
  checks.resolved = { ok: true, key: doc.key, docid: null, flavor: doc.flavor, tier, alternatives: [] };
  if (!parse.ok) messages.push("no pubid grammar parsed this form; it resolved by its identifier");

  const row = await db
    .prepare("SELECT docid, year, undated_norm FROM documents_search WHERE key = ?")
    .bind(doc.key)
    .first<{ docid: string | null; year: number | null; undated_norm: string }>();
  const docid = row?.docid ?? null;
  checks.resolved.docid = docid;

  // cited: the record's primary identifier, in its own form.
  if (docid) {
    const ok = normalizeCode(reference) === normalizeCode(docid);
    checks.cited = { ok, expected: docid };
    if (!ok) warn(`cite the identifier as "${docid}"`);
  }

  // current + superseded, in one round trip: a newer edition of the same
  // undated document, and the stored relation edges in both directions.
  // An in-edge names this record by its docid (or its key).
  const statements = [
    db.prepare("SELECT type, target FROM relations WHERE document = ?").bind(doc.key),
    db.prepare(
      `SELECT r.document, r.type, s.docid FROM relations r
       LEFT JOIN documents_search s ON s.key = r.document WHERE r.target IN (?, ?)`,
    ).bind(docid ?? doc.key, doc.key),
  ];
  if (row && row.year != null) {
    statements.push(db.prepare(
      "SELECT key, docid, year FROM documents_search WHERE undated_norm = ? AND year > ? ORDER BY year DESC LIMIT 1",
    ).bind(row.undated_norm, row.year));
  }
  const [out, inc, newerRes] = await db.batch(statements);

  const newer = (newerRes?.results?.[0] ?? null) as { key: string; docid: string | null; year: number } | null;
  if (newerRes) {
    checks.current = { ok: !newer, latest: newer };
    if (newer) warn(`a newer edition exists: ${newer.docid ?? newer.key} (${newer.year})`);
  }

  const by: SupersessionEdge[] = [];
  for (const r of (out?.results ?? []) as { type: string; target: string }[]) {
    if (REPLACED_BY_OUT.has(r.type)) by.push({ relation: r.type, direction: "out", key: null, docid: r.target });
  }
  for (const r of (inc?.results ?? []) as { document: string; type: string; docid: string | null }[]) {
    if (!REPLACES_IN.has(r.type) || r.document === doc.key) continue;
    by.push({ relation: r.type, direction: "in", key: r.document, docid: r.docid ?? r.document });
  }
  checks.superseded = { ok: by.length === 0, by };
  if (by.length) fail(`superseded by ${[...new Set(by.map((e) => e.docid))].join(", ")}`);

  if (opts.style) result.citation = renderCitation(doc.data, opts.style, opts.lang);
  return result;
}

export async function validateReferences(
  db: D1Database,
  references: string[],
  opts: { style?: CiteStyle; lang?: string } = {},
): Promise<ValidationReport> {
  const results: ValidationResult[] = [];
  for (let i = 0; i < references.length; i += CONCURRENCY) {
    const chunk = references.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(chunk.map((r) => validateOne(db, r, opts)))));
  }
  const count = (v: Verdict) => results.filter((r) => r.verdict === v).length;
  return {
    summary: { total: results.length, ok: count("ok"), warning: count("warning"), error: count("error") },
    results,
  };
}

const cell = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/\s+/g, " ");

/** The human-readable report: one table row per reference. */
export function reportMarkdown(report: ValidationReport): string {
  const { total, ok, warning, error } = report.summary;
  const lines = [
    "# Citation validation",
    "",
    `${total} references: ${ok} ok, ${warning} warning, ${error} error.`,
    "",
    "| # | Reference | Verdict | Record | Notes |",
    "|---|---|---|---|---|",
  ];
  report.results.forEach((r, i) => {
    const record = r.checks.resolved.docid ?? r.checks.resolved.key ?? "";
    lines.push(`| ${i + 1} | ${cell(r.reference)} | ${r.verdict} | ${cell(record)} | ${cell(r.messages.join("; "))} |`);
  });
  return lines.join("\n") + "\n";
}
