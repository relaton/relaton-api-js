// GET /v3/resolve (epic #175, issue #176): an identifier string -> the
// pubid parse and the candidate records it names. Discovery, never
// authority (relaton#535): candidates are ranked pointers into the index.
//
// Two families of lanes, merged at each document's best tier:
//   - identity lanes (from the wave-1 resolver, #185): the stored key, the
//     lookup keys, the pubid slug and the primary docid - cheap index
//     lookups that answer for any flavor, the PARG ones included;
//   - engine lanes: the input is parsed by a worker @pubid/pubid grammar
//     (pubid/engine.ts), D1 prefilters over narrow index lanes, and each
//     row is parsed by the same grammar and kept only when exactMatch /
//     subsetMatch accepts it. Nothing here compares identifiers by hand.
// Only when both come up empty do the text lanes run: the docid substring
// and the trigram phrase.
//
// Cost: a warm grammar parse is a few ms of CPU, so the rows parsed per
// request are capped (confirmMax) and cached per isolate - the lanes put
// the likeliest rows first, so the cap trims the tail, never the exact
// record.
import { exactMatch, subsetMatch } from "@pubid/pubid/dist/model/subset-match.js";
import { normKey } from "../pubid/keys.ts";
import {
  componentsOf,
  parseId,
  parseIdSync,
  rootDocument,
  undatedHuman,
  type ParseReason,
  type PubidId,
} from "../pubid/engine";
import { getDocument, getDocumentByDocid, getDocumentByLookupKey, type StorageV2Doc } from "./storage2";
// The pubid-scheme slug resolver: the flavor-type registrations (worker-safe
// set) and the fs-free pubid-urn module. Deep import: the package root drags
// the corpus loader, which statically imports node:fs.
import { fromSlug } from "@pubid/pubid/dist/pubid-urn/index.js";
import "./slug_registry";
import type { ResolveCandidate, ResolveResponse as ResolveResult } from "../routes/resolve_schema";

export type { ResolveCandidate, ResolveResponse as ResolveResult } from "../routes/resolve_schema";
export type MatchTier = ResolveCandidate["match"];
/** The tier names the search rank contract and validate use (lib/rank). */
export type ResolveTier = MatchTier;

interface Row {
  key: string;
  flavor: string;
  docid: string | null;
  title: string | null;
  year: number | null;
}

// The tier order is the ranking. Each tier has a base score; within a
// tier each later candidate steps down a little, never crossing tiers.
export const TIER_ORDER: MatchTier[] = [
  "exact", "lookup", "slug", "docid", "dated", "undated", "subset", "supplement", "substring", "fuzzy",
];
const TIER_BASE: Record<MatchTier, number> = {
  exact: 1, lookup: 0.95, slug: 0.95, docid: 0.95,
  dated: 0.9, undated: 0.8, subset: 0.75, supplement: 0.7,
  substring: 0.6, fuzzy: 0.5,
};
const STEP = 0.01;
const FUZZY_STEP = 0.02;
const LANE_LIMIT = 25;
const MIN_FUZZY = 4;
// Rows parsed per request: about 6 ms of CPU each for the iso grammar.
function confirmMax(limit: number): number {
  return Math.min(30, Math.max(12, limit * 2));
}

// Row parses repeat across requests (popular documents, their editions),
// so the isolate keeps a small LRU of docid -> parse. A Map keeps
// insertion order: re-inserting on a hit moves the entry to the end.
const PARSE_CACHE_MAX = 2000;
const parseCache = new Map<string, PubidId | null>();
function parseRow(docid: string, flavor: string): PubidId | null {
  const key = `${flavor}\u0000${docid}`;
  if (parseCache.has(key)) {
    const hit = parseCache.get(key)!;
    parseCache.delete(key);
    parseCache.set(key, hit);
    return hit;
  }
  const parsed = parseIdSync(docid, flavor);
  const id = parsed.ok ? parsed.id : null;
  parseCache.set(key, id);
  if (parseCache.size > PARSE_CACHE_MAX) parseCache.delete(parseCache.keys().next().value!);
  return id;
}

function stepped(base: number, i: number, step: number): number {
  return Math.round(Math.max(base - step * i, base - 0.04) * 1000) / 1000;
}

const COLS = "key, flavor, docid, title, year";
const ORDER = `ORDER BY year DESC, key ASC LIMIT ${LANE_LIMIT}`;

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

// One document per key at its best tier, ranked by tier then key.
export function dedupeCandidates<T extends { key: string; match: MatchTier }>(candidates: T[]): T[] {
  const best = new Map<string, T>();
  for (const c of candidates) {
    const seen = best.get(c.key);
    if (!seen || TIER_ORDER.indexOf(c.match) < TIER_ORDER.indexOf(seen.match)) best.set(c.key, c);
  }
  return [...best.values()].sort(
    (a, b) => TIER_ORDER.indexOf(a.match) - TIER_ORDER.indexOf(b.match) || a.key.localeCompare(b.key),
  );
}

// --- identity lanes ---------------------------------------------------------

/** A pubid slug (`iso/9001/2015`) -> the document it names, through the
 * same chain the key route walks for a rendered identifier. */
export async function getDocumentBySlug(db: D1Database, keyText: string): Promise<StorageV2Doc | null> {
  if (!keyText.includes("/")) return null;
  let render: string;
  try {
    render = fromSlug(keyText).render();
  } catch {
    return null;
  }
  return (await getDocument(db, render))
    ?? (await getDocumentByLookupKey(db, normKey(render)))
    ?? (await getDocumentByLookupKey(db, normKey(render).replace(/-/g, "")))
    ?? (await getDocumentByDocid(db, render));
}

/** The identifier tiers of the resolve chain (exact key, normalized lookup
 * keys, pubid slug, docid index), in tier order, shared by /v3/resolve and
 * the identifier pin of /v3/search. The lanes run in parallel. */
export async function identifierCandidates(
  db: D1Database,
  q: string,
): Promise<{ key: string; flavor: string; tier: ResolveTier }[]> {
  const norm = normKey(q);
  const lanes: [ResolveTier, Promise<StorageV2Doc | null>][] = [
    ["exact", getDocument(db, q)],
    ["lookup", getDocumentByLookupKey(db, norm)],
    ["lookup", getDocumentByLookupKey(db, norm.replace(/-/g, ""))],
    ["slug", getDocumentBySlug(db, q)],
    ["docid", getDocumentByDocid(db, q)],
  ];
  const docs = await Promise.all(lanes.map(([, p]) => p));
  return docs.flatMap((d, i) => (d ? [{ key: d.key, flavor: d.flavor, tier: lanes[i]![0] }] : []));
}

async function rowsByKey(db: D1Database, keys: string[]): Promise<Map<string, Row>> {
  if (!keys.length) return new Map();
  const { results } = await db
    .prepare(`SELECT ${COLS} FROM documents_search WHERE key IN (${keys.map((_, i) => `?${i + 1}`).join(",")})`)
    .bind(...keys)
    .all<Row>();
  return new Map((results ?? []).map((r) => [r.key, r]));
}

// --- engine lanes -----------------------------------------------------------

// The prefilter lanes, likeliest first, each on an index:
//   1. norm = the input's render                     (idx_ds_norm)
//   2. undated_norm = its undated render             (idx_ds_undated)
//   3. supplements / editions: a norm range right
//      after the render - `<dated>/…` or `<undated>:…` (idx_ds_norm)
//   4. the engine-fed components of the base document (idx_ds_pubnum)
async function prefilter(db: D1Database, ref: PubidId, refDated: boolean, max: number): Promise<Row[]> {
  const dated = safe(() => normKey(ref.toHuman())) ?? "";
  const undatedRender = safe(() => undatedHuman(ref));
  const undated = undatedRender ? normKey(undatedRender) : "";
  const root = safe(() => componentsOf(rootDocument(ref)));
  const stmts: D1PreparedStatement[] = [];
  if (dated) stmts.push(db.prepare(`SELECT ${COLS} FROM documents_search WHERE norm = ? ${ORDER}`).bind(dated));
  if (undated) stmts.push(db.prepare(`SELECT ${COLS} FROM documents_search WHERE undated_norm = ? ${ORDER}`).bind(undated));
  // "/" + 1 = "0", ":" + 1 = ";": the half-open range is exactly the keys
  // that continue the render with that separator.
  const [base, sep, next] = refDated ? [dated, "/", "0"] : [undated, ":", ";"];
  if (base) {
    stmts.push(db.prepare(`SELECT ${COLS} FROM documents_search WHERE norm >= ? AND norm < ? ${ORDER}`)
      .bind(base + sep, base + next));
  }
  if (root?.publisher && root.number) {
    stmts.push(db.prepare(`SELECT ${COLS} FROM documents_search WHERE publisher = ? AND number = ? ${ORDER}`)
      .bind(root.publisher, root.number));
  }
  if (!stmts.length) return [];
  const lanes = await db.batch<Row>(stmts);
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const lane of lanes) {
    for (const row of lane.results ?? []) {
      if (seen.has(row.key)) continue;
      seen.add(row.key);
      rows.push(row);
      if (rows.length >= max) return rows;
    }
  }
  return rows;
}

function sameIdentity(a: PubidId, b: PubidId): boolean {
  const x = componentsOf(a);
  const y = componentsOf(b);
  return x.publisher === y.publisher && x.part === y.part;
}

function tierOf(ref: PubidId, refDated: boolean, candidate: PubidId): MatchTier | null {
  if (exactMatch(ref, candidate)) return "exact";
  if (subsetMatch(ref as never, candidate)) {
    // An unset field is a wildcard in the subset match, so `ISO 9001`
    // also accepts `ISO 9001-1` and `ISO/IEC 9001`: those rank below the
    // editions of the document itself.
    if (!sameIdentity(ref, candidate)) return "subset";
    return refDated ? "dated" : "undated";
  }
  const root = rootDocument(candidate);
  if (root !== candidate && subsetMatch(ref as never, root)) return "supplement";
  return null;
}

function confirm(ref: PubidId, refDated: boolean, flavor: string, rows: Row[]): { row: Row; match: MatchTier }[] {
  const out: { row: Row; match: MatchTier }[] = [];
  for (const row of rows) {
    if (!row.docid) continue;
    // The row's own id, read by the grammar that read the input. A row
    // of another family is never a subset match of it.
    const id = parseRow(row.docid, flavor);
    if (!id) continue;
    const tier = safe(() => tierOf(ref, refDated, id));
    if (tier) out.push({ row, match: tier });
  }
  return out;
}

// --- text lanes -------------------------------------------------------------

function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// The docid substring lane, then the trigram lane (#165) as a phrase
// query: an id string carries FTS5 syntax characters (":" reads as a
// column filter), so it is matched as one quoted substring. The trigram
// lane skips short inputs - a 3-character phrase matches most of the
// corpus and ranking it costs more than it tells.
async function textLanes(db: D1Database, input: string, limit: number): Promise<{ row: Row; match: MatchTier }[]> {
  const stmts = [
    db.prepare(`SELECT ${COLS} FROM documents_search WHERE docid LIKE ? ESCAPE '\\' LIMIT ?`)
      .bind(`%${likeEscape(input)}%`, limit),
  ];
  if (input.length >= MIN_FUZZY) {
    stmts.push(db.prepare(
      `SELECT s.key, s.flavor, s.docid, s.title, s.year
       FROM documents_search_trigram t
       JOIN documents_search s ON s.rowid = t.rowid
       WHERE documents_search_trigram MATCH ?
       ORDER BY rank LIMIT ?`,
    ).bind(`"${input.replace(/"/g, '""')}"`, limit));
  }
  const [substring, fuzzy] = await db.batch<Row>(stmts);
  return [
    ...(substring?.results ?? []).map((row) => ({ row, match: "substring" as const })),
    ...(fuzzy?.results ?? []).map((row) => ({ row, match: "fuzzy" as const })),
  ];
}

// --- ranking ----------------------------------------------------------------

function rank(hits: { row: Row; match: MatchTier }[], limit: number): ResolveCandidate[] {
  const best = dedupeCandidates(hits.map((h) => ({ key: h.row.key, match: h.match, row: h.row })));
  const byTier = new Map<MatchTier, Row[]>(TIER_ORDER.map((t) => [t, []]));
  for (const b of best) byTier.get(b.match)!.push(b.row);
  const out: ResolveCandidate[] = [];
  for (const tier of TIER_ORDER) {
    const list = byTier.get(tier)!;
    // Text lanes keep their lane order (trigram rank); the others go newest first.
    if (tier !== "substring" && tier !== "fuzzy") {
      list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.key.localeCompare(b.key));
    }
    const step = tier === "fuzzy" ? FUZZY_STEP : STEP;
    list.forEach((row, i) => out.push({
      key: row.key, docid: row.docid, title: row.title, flavor: row.flavor, year: row.year,
      match: tier, score: stepped(TIER_BASE[tier], i, step),
    }));
  }
  return out.slice(0, limit);
}

export async function resolveId(
  db: D1Database,
  input: string,
  opts: { flavor?: string | null; limit: number },
): Promise<ResolveResult> {
  const parsed = await parseId(input, opts.flavor);
  const view = parsed.ok ? safe(() => ({ hash: parsed.id.toHash(), human: parsed.id.toHuman() })) : null;

  const [ids, engineHits] = await Promise.all([
    identifierCandidates(db, input),
    (async () => {
      if (!parsed.ok || !view) return [];
      const refDated = view.hash.year != null;
      const rows = await prefilter(db, parsed.id, refDated, confirmMax(opts.limit));
      return confirm(parsed.id, refDated, parsed.flavor, rows);
    })(),
  ]);

  const known = new Map(engineHits.map((h) => [h.row.key, h.row]));
  const missing = ids.map((i) => i.key).filter((k) => !known.has(k));
  const extra = await rowsByKey(db, [...new Set(missing)]);
  const hits = [
    ...engineHits,
    ...ids.flatMap((i) => {
      const row = known.get(i.key) ?? extra.get(i.key);
      return row ? [{ row, match: i.tier }] : [];
    }),
  ];
  if (!hits.length) hits.push(...await textLanes(db, input, opts.limit));
  const candidates = rank(hits, opts.limit);

  if (!parsed.ok || !view) {
    // engine_unavailable stays in the wire contract (a wasm failure would
    // surface there at runtime) but the grammars themselves cover every
    // flavor since #187, so a miss is a grammar miss.
    const reason: ParseReason = (!parsed.ok && parsed.reason === "engine_unavailable") ? "engine_unavailable" : "no_grammar";
    return { input, parse_ok: false, flavor: opts.flavor ?? null, parsed: null, canonical: null, reason, candidates };
  }
  return {
    input,
    parse_ok: true,
    flavor: parsed.flavor,
    parsed: view.hash,
    canonical: view.human,
    reason: null,
    candidates,
  };
}
