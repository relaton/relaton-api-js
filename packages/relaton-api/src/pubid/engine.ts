// The @pubid/pubid grammar engines the worker can run at request time
// (relaton-api-js#176). Every flavor here parses on the pure-TS parslet
// engine (dist/grammar/engine.js) - no filesystem access - so each deep
// import bundles into the worker. Deep imports only: the package root and
// the flavor barrel drag node:fs (the corpus loader, the parg runtime).
//
// nist and ieee run the PARG wasm engine through pubid's worker entries
// (0.1.70): the wasm compiles at deploy (CompiledWasm rule over the
// vendored parsanol build, MIT, Ribose) and initializes lazily on the
// first parse of those flavors; oiml's worker engine is pure TS.
//
// This module never parses an identifier itself: it only routes the
// input to the flavor grammars and reads the model the grammar returns.
import { amcaGrammarImplementation } from "@pubid/pubid/dist/flavors/amca/index.js";
import { apiGrammarImplementation } from "@pubid/pubid/dist/flavors/api/index.js";
import { ashraeGrammarImplementation } from "@pubid/pubid/dist/flavors/ashrae/index.js";
import { asmeGrammarImplementation } from "@pubid/pubid/dist/flavors/asme/index.js";
import { astmGrammarImplementation } from "@pubid/pubid/dist/flavors/astm/index.js";
import { bipmGrammarImplementation } from "@pubid/pubid/dist/flavors/bipm/index.js";
import { cieGrammarImplementation } from "@pubid/pubid/dist/flavors/cie/index.js";
import { eascGrammarImplementation } from "@pubid/pubid/dist/flavors/easc/index.js";
import { ecmaGrammarImplementation } from "@pubid/pubid/dist/flavors/ecma/index.js";
import { gbGrammarImplementation } from "@pubid/pubid/dist/flavors/gb/index.js";
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
import { nistWorkerGrammarImplementation } from "@pubid/pubid/dist/flavors/nist/worker.js";
import { ieeeWorkerGrammarImplementation } from "@pubid/pubid/dist/flavors/ieee/worker.js";
import { oimlWorkerGrammarImplementation } from "@pubid/pubid/dist/flavors/oiml/worker.js";
import { initWorkerEngine } from "@pubid/pubid/dist/parg/worker.js";
import { wrappedDocument } from "@pubid/pubid/dist/model/identifier.js";
import { normKey } from "./keys.ts";
// The vendored parsanol wasm (node_modules/parsanol/vendor, MIT): the
// CompiledWasm rule compiles it at deploy; the module initializes the
// shared parg engine on first use.
import parsanolWasm from "./parsanol_bg.wasm";

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
  ["bipm", bipmGrammarImplementation],
  ["jcgm", jcgmGrammarImplementation], ["jis", jisGrammarImplementation],
  ["ogc", ogcGrammarImplementation],
  ["w3c", w3cGrammarImplementation], ["oasis", oasisGrammarImplementation],
  ["tgpp", tgppGrammarImplementation], ["ecma", ecmaGrammarImplementation],
  ["iana", ianaGrammarImplementation], ["cie", cieGrammarImplementation], ["gb", gbGrammarImplementation],
  ["easc", eascGrammarImplementation], ["iala", ialaGrammarImplementation],
  ["iho", ihoGrammarImplementation], ["plateau", plateauGrammarImplementation],
  ["un", unGrammarImplementation], ["xsf", xsfGrammarImplementation],
  ["amca", amcaGrammarImplementation],
  ["api", apiGrammarImplementation],
  ["ashrae", ashraeGrammarImplementation], ["asme", asmeGrammarImplementation],
  ["astm", astmGrammarImplementation],
  ["idf", idfGrammarImplementation], ["isbn", isbnGrammarImplementation],
  ["omg", omgGrammarImplementation],
  ["oiml", () => oimlWorkerGrammarImplementation()],
];

// The parg-backed flavors: their engines come from the wasm runtime, so
// `engineFor` awaits the shared lazy init before the first parse. oiml's
// worker engine is pure TS and rides the sync factories above.
const PARG_FACTORIES: [string, () => Promise<unknown>][] = [
  ["nist", () => nistWorkerGrammarImplementation(parsanolWasm as unknown as never)],
  ["ieee", () => ieeeWorkerGrammarImplementation({ wasm: parsanolWasm as unknown as never })],
];

let pargEngines: Map<string, Promise<unknown>> | null = null;
function pargEngineFor(flavor: string): Promise<unknown> | null {
  if (!PARG_FACTORIES.some(([f]) => f === flavor)) return null;
  if (!pargEngines) pargEngines = new Map();
  let p = pargEngines.get(flavor);
  if (!p) {
    // One shared wasm init; the worker entries memoize per isolate after it.
    p = initWorkerEngine(parsanolWasm as unknown as never).then(() => {
      const make = PARG_FACTORIES.find(([f]) => f === flavor)![1];
      return make();
    });
    pargEngines.set(flavor, p);
  }
  return p;
}

// The flavors /v3/resolve accepts as a `flavor` hint.
export const RESOLVE_FLAVORS: ReadonlySet<string> = new Set([
  ...FACTORIES.map(([f]) => f),
  ...PARG_FACTORIES.map(([f]) => f),
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
// The sync slice for hot paths (page summaries): the pure-TS grammar map
// only. Flavors without a sync engine answer no-grammar here — their
// canonical keys come from ingest, not request-time parsing.
export function parseIdSync(input: string, flavor?: string | null): ParseResult {
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
    const r = accepted(f, impl);
    if (r) return r;
  }
  return fallback ? { ok: true, ...(fallback as { flavor: string; id: PubidId }) } : { ok: false, reason: "no_grammar" };

  function accepted(f: string, impl: GrammarImpl): { ok: true; flavor: string; id: PubidId } | null {
    const id = tryParse(impl, input) as PubidId | null;
    if (!id) return null;
    const key = renderKey(id);
    if (key === null) return null;
    if (key === inputKey) return { ok: true, flavor: f, id };
    if (!fallback && lead.length >= 2 && key.startsWith(lead)) fallback = { flavor: f, id };
    return null;
  }
}

export async function parseId(input: string, flavor?: string | null): Promise<ParseResult> {
  const all = engines();
  if (flavor) {
    const parg = pargEngineFor(flavor);
    const impl = (parg ? ((await parg) as GrammarImpl | undefined) : all.get(flavor));
    const id = impl ? tryParse(impl, input) : null;
    return id ? { ok: true, flavor, id } : { ok: false, reason: "no_grammar" };
  }
  const inputKey = normKey(input);
  const lead = leadingToken(inputKey);
  let fallback: { flavor: string; id: PubidId } | null = null;
  // A grammar's parse is accepted only when its own render agrees with the
  // input (pass 1 exact, pass 2 publisher-prefix); a near miss is held as
  // the fallback answer.
  const accepted = (f: string, impl: GrammarImpl): { ok: true; flavor: string; id: PubidId } | null => {
    const id = tryParse(impl, input) as PubidId | null;
    if (!id) return null;
    const key = renderKey(id);
    if (key === null) return null;
    if (key === inputKey) return { ok: true, flavor: f, id };
    if (!fallback && lead.length >= 2 && key.startsWith(lead)) fallback = { flavor: f, id };
    return null;
  };
  // The pure-TS grammars first (no wasm cost on the common ids); the parg
  // flavors run only when none of them claimed the input.
  for (const [f, impl] of all) {
    const r = accepted(f, impl);
    if (r) return r;
  }
  for (const [f] of PARG_FACTORIES) {
    const impl = (await pargEngineFor(f)) as GrammarImpl | undefined;
    if (!impl) continue;
    const r = accepted(f, impl);
    if (r) return r;
  }
  return fallback ? { ok: true, ...(fallback as { flavor: string; id: PubidId }) } : { ok: false, reason: "no_grammar" };
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
