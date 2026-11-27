// The @pubid/pubid grammar engines the worker can run at request time
// (relaton-api-js#176). Every flavor here parses on the pure-TS parslet
// engine (dist/grammar/engine.js) - no filesystem access - so each deep
// import bundles into the worker. Deep imports only: the package root and
// the flavor barrel drag node:fs (the corpus loader, the parg runtime).
//
// Three flavors have no worker engine: nist and ieee run the PARG wasm
// runtime, which reads its artifacts with node:fs at import time; oiml
// ships no flavor index outside the barrel. Ids of those flavors answer
// `engine_unavailable` until pubid-ts ships a worker-safe entry.
//
// This module never parses an identifier itself: it only routes the
// input to the flavor grammars and reads the model the grammar returns.
import { amcaGrammarImplementation } from "@pubid/pubid/dist/flavors/amca/index.js";
import { ansiGrammarImplementation } from "@pubid/pubid/dist/flavors/ansi/index.js";
import { apiGrammarImplementation } from "@pubid/pubid/dist/flavors/api/index.js";
import { ashraeGrammarImplementation } from "@pubid/pubid/dist/flavors/ashrae/index.js";
import { asmeGrammarImplementation } from "@pubid/pubid/dist/flavors/asme/index.js";
import { astmGrammarImplementation } from "@pubid/pubid/dist/flavors/astm/index.js";
import { bipmGrammarImplementation } from "@pubid/pubid/dist/flavors/bipm/index.js";
import { bsiGrammarImplementation } from "@pubid/pubid/dist/flavors/bsi/index.js";
import { calconnectGrammarImplementation } from "@pubid/pubid/dist/flavors/calconnect/index.js";
import { cenCenelecGrammarImplementation } from "@pubid/pubid/dist/flavors/cen_cenelec/index.js";
import { cieGrammarImplementation } from "@pubid/pubid/dist/flavors/cie/index.js";
import { csaGrammarImplementation } from "@pubid/pubid/dist/flavors/csa/index.js";
import { doiGrammarImplementation } from "@pubid/pubid/dist/flavors/doi/index.js";
import { eascGrammarImplementation } from "@pubid/pubid/dist/flavors/easc/index.js";
import { ecmaGrammarImplementation } from "@pubid/pubid/dist/flavors/ecma/index.js";
import { etsiGrammarImplementation } from "@pubid/pubid/dist/flavors/etsi/index.js";
import { evsGrammarImplementation } from "@pubid/pubid/dist/flavors/evs/index.js";
import { gbGrammarImplementation } from "@pubid/pubid/dist/flavors/gb/index.js";
import { gostGrammarImplementation } from "@pubid/pubid/dist/flavors/gost/index.js";
import { ialaGrammarImplementation } from "@pubid/pubid/dist/flavors/iala/index.js";
import { ianaGrammarImplementation } from "@pubid/pubid/dist/flavors/iana/index.js";
import { idfGrammarImplementation } from "@pubid/pubid/dist/flavors/idf/index.js";
import { iecGrammarImplementation } from "@pubid/pubid/dist/flavors/iec/index.js";
import { ietfGrammarImplementation } from "@pubid/pubid/dist/flavors/ietf/index.js";
import { ihoGrammarImplementation } from "@pubid/pubid/dist/flavors/iho/index.js";
import { isbnGrammarImplementation } from "@pubid/pubid/dist/flavors/isbn/index.js";
import { isoGrammarImplementation } from "@pubid/pubid/dist/flavors/iso/index.js";
import { ituGrammarImplementation } from "@pubid/pubid/dist/flavors/itu/index.js";
import { jcgmGrammarImplementation } from "@pubid/pubid/dist/flavors/jcgm/index.js";
import { jisGrammarImplementation } from "@pubid/pubid/dist/flavors/jis/index.js";
import { oasisGrammarImplementation } from "@pubid/pubid/dist/flavors/oasis/index.js";
import { ogcGrammarImplementation } from "@pubid/pubid/dist/flavors/ogc/index.js";
import { omgGrammarImplementation } from "@pubid/pubid/dist/flavors/omg/index.js";
import { plateauGrammarImplementation } from "@pubid/pubid/dist/flavors/plateau/index.js";
import { tgppGrammarImplementation } from "@pubid/pubid/dist/flavors/tgpp/index.js";
import { unGrammarImplementation } from "@pubid/pubid/dist/flavors/un/index.js";
import { w3cGrammarImplementation } from "@pubid/pubid/dist/flavors/w3c/index.js";
import { xsfGrammarImplementation } from "@pubid/pubid/dist/flavors/xsf/index.js";
import { wrappedDocument } from "@pubid/pubid/dist/model/identifier.js";
import { normKey } from "./keys.ts";

// The slice of the pubid Identifier model this module reads. The .d.ts
// lags the runtime on render()/fromHash (same note as ingest/produce.ts).
export interface PubidId {
  toHash(): Record<string, unknown>;
  toHuman(): string;
  publisher?: unknown;
  constructor: { fromHash?(h: Record<string, unknown>): PubidId | null };
}

interface GrammarImpl {
  parse(input: string): unknown;
}

// Deterministic try order, common flavors first - the tools/set_components.mjs
// order (the node-side walk that fills the component columns), so the
// worker and the backfill attribute an id to the same grammar.
const FACTORIES: [string, () => unknown][] = [
  ["iso", isoGrammarImplementation], ["iec", iecGrammarImplementation],
  ["ietf", ietfGrammarImplementation], ["itu", ituGrammarImplementation],
  ["bsi", bsiGrammarImplementation], ["bipm", bipmGrammarImplementation],
  ["jcgm", jcgmGrammarImplementation], ["jis", jisGrammarImplementation],
  ["gost", gostGrammarImplementation], ["ogc", ogcGrammarImplementation],
  ["w3c", w3cGrammarImplementation], ["oasis", oasisGrammarImplementation],
  ["tgpp", tgppGrammarImplementation], ["ecma", ecmaGrammarImplementation],
  ["iana", ianaGrammarImplementation], ["etsi", etsiGrammarImplementation],
  ["cie", cieGrammarImplementation], ["gb", gbGrammarImplementation],
  ["easc", eascGrammarImplementation], ["iala", ialaGrammarImplementation],
  ["iho", ihoGrammarImplementation], ["plateau", plateauGrammarImplementation],
  ["un", unGrammarImplementation], ["xsf", xsfGrammarImplementation],
  ["calconnect", calconnectGrammarImplementation], ["amca", amcaGrammarImplementation],
  ["ansi", ansiGrammarImplementation], ["api", apiGrammarImplementation],
  ["ashrae", ashraeGrammarImplementation], ["asme", asmeGrammarImplementation],
  ["astm", astmGrammarImplementation], ["csa", csaGrammarImplementation],
  ["doi", doiGrammarImplementation], ["evs", evsGrammarImplementation],
  ["idf", idfGrammarImplementation], ["isbn", isbnGrammarImplementation],
  ["cen_cenelec", cenCenelecGrammarImplementation], ["omg", omgGrammarImplementation],
];

export const NO_WORKER_ENGINE: ReadonlySet<string> = new Set(["nist", "ieee", "oiml"]);

// The flavors /v3/resolve accepts as a `flavor` hint.
export const RESOLVE_FLAVORS: ReadonlySet<string> = new Set([
  ...FACTORIES.map(([f]) => f),
  ...NO_WORKER_ENGINE,
]);

let impls: Map<string, GrammarImpl> | null = null;
function engines(): Map<string, GrammarImpl> {
  // Built on first use: grammar construction is not free, and most
  // requests never reach a resolve.
  if (!impls) {
    impls = new Map();
    for (const [flavor, make] of FACTORIES) {
      const impl = make() as GrammarImpl | undefined;
      if (impl) impls.set(flavor, impl);
    }
  }
  return impls;
}

export type ParseReason = "no_grammar" | "engine_unavailable";
export type ParseResult =
  | { ok: true; flavor: string; id: PubidId }
  | { ok: false; reason: ParseReason };

function tryParse(impl: GrammarImpl, input: string): PubidId | null {
  try {
    const id = impl.parse(input) as PubidId | null | undefined;
    return id && typeof id.toHash === "function" ? id : null;
  } catch {
    // ParseFailed (or a model error): this grammar does not read the input.
    return null;
  }
}

function renderKey(id: PubidId): string | null {
  try {
    return normKey(id.toHuman());
  } catch {
    return null;
  }
}

// The input's leading letter run, as normKey spells it: "IEEE", "ISO",
// "RFC". Used only to check a grammar's OUTPUT against the input - the
// identifier itself is never read from it.
function leadingToken(key: string): string {
  return /^[A-Z]+/.exec(key)?.[0] ?? "";
}

// Parse with the flavor's grammar when a flavor is named (the caller's
// assertion, taken as is). Without a flavor, the try order runs, and a
// grammar's parse is accepted only when its own render agrees with the
// input: permissive grammars read foreign ids (ASHRAE reads
// `IEEE 802.11-2020`, IANA reads any single word), and a confident wrong
// parse is worse than a miss.
//   pass 1: the render normalizes back to the input;
//   pass 2: the render starts with the input's publisher spelling
//           (e.g. a `/Amd.1` input whose render is `/Amd 1`).
export function parseId(input: string, flavor?: string | null): ParseResult {
  if (flavor && NO_WORKER_ENGINE.has(flavor)) return { ok: false, reason: "engine_unavailable" };
  const all = engines();
  if (flavor) {
    const impl = all.get(flavor);
    const id = impl ? tryParse(impl, input) : null;
    return id ? { ok: true, flavor, id } : { ok: false, reason: "no_grammar" };
  }
  const inputKey = normKey(input);
  const lead = leadingToken(inputKey);
  let fallback: { flavor: string; id: PubidId } | null = null;
  for (const [f, impl] of all) {
    const id = tryParse(impl, input);
    if (!id) continue;
    const key = renderKey(id);
    if (key === null) continue;
    if (key === inputKey) return { ok: true, flavor: f, id };
    if (!fallback && lead.length >= 2 && key.startsWith(lead)) fallback = { flavor: f, id };
  }
  return fallback ? { ok: true, ...fallback } : { ok: false, reason: "no_grammar" };
}

// The document a supplement or a view record wraps, to the root: the
// amendment's base edition. The model's own wrapper link, not a parse.
export function rootDocument(id: PubidId): PubidId {
  let cur = id;
  for (let i = 0; i < 8; i++) {
    const inner = wrappedDocument(cur as never) as PubidId | undefined;
    if (!inner) break;
    cur = inner;
  }
  return cur;
}

// The model's publisher attribute is a value object per flavor -
// IsoPublisher { publisher, copublisher }, Publisher { body }, or a
// plain string. Same normalization as tools/set_components.mjs, so the
// worker reads the columns that walk writes.
function publisherString(pub: unknown): string | null {
  if (pub == null) return null;
  if (typeof pub === "string") return pub;
  if (Array.isArray(pub)) return pub.map(publisherString).filter(Boolean).join("/") || null;
  if (typeof pub === "object") {
    const o = pub as { publisher?: unknown; copublisher?: unknown; body?: unknown };
    if (typeof o.publisher === "string" && Array.isArray(o.copublisher)) {
      return [o.publisher, ...o.copublisher.map(String)].join("/") || null;
    }
    if (typeof o.body === "string") return o.body;
    return null;
  }
  return String(pub);
}

export interface Components {
  publisher: string | null;
  number: string | null;
  part: string | null;
}

export function componentsOf(id: PubidId): Components {
  const hash = id.toHash();
  const part = hash.part != null
    ? String(hash.part)
    : Array.isArray(hash.parts) && hash.parts.length ? hash.parts.join(String(hash.separator ?? ".")) : null;
  return {
    publisher: publisherString(id.publisher ?? hash.publisher),
    number: hash.number != null ? String(hash.number) : null,
    part,
  };
}

// The model's human render with the edition year removed: the identity
// every edition of the document shares. Built through the model's own
// fromHash, never by string surgery.
export function undatedHuman(id: PubidId): string | null {
  const hash = id.toHash();
  if (hash.year == null) return id.toHuman();
  const { year: _year, ...rest } = hash;
  try {
    const undated = id.constructor.fromHash?.(rest);
    return undated && typeof undated.toHuman === "function" ? undated.toHuman() : null;
  } catch {
    return null;
  }
}
