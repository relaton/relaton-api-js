// Resolve (epic #175, issue #176): turn any identifier string into parsed
// components plus ranked canonical candidates. Discovery, never authority —
// the candidates are ranked pointers into the index (API-tier semantics,
// relaton#535), not answers about bibliographic completeness.
//
// The parse runs on the node-side pubid shim (src/pubid — the same engine
// the search lanes use); the candidate tiers reuse the document resolution
// chain the /v3/documents/{key} route established, then the substring and
// trigram lanes from the collection search. Grammar misses are telemetry
// for the pubid-grammar backlog: every unparseable query is a grammar
// round candidate (relaton#604, consumer side).
import type { Identifier } from "../pubid/types.ts";
import { getDocument, getDocumentByDocid, getDocumentByLookupKey, type StorageV2Doc } from "./storage2";
// Deep path: self-contained and extension-free (same import discipline
// produce.ts uses).
import { normKey } from "../pubid/keys.ts";
// The pubid-scheme slug resolver: the flavor-type registrations (worker-safe
// set) and the fs-free pubid-urn module. Deep import: the package root drags
// the corpus loader, which statically imports node:fs.
import { fromSlug } from "@pubid/pubid/dist/pubid-urn/index.js";
import "./slug_registry";

export type ResolveTier = "exact" | "lookup" | "slug" | "docid" | "substring" | "fuzzy";

export interface ResolveCandidate {
  key: string;
  flavor: string;
  docid: string;
  title: string | null;
  match: ResolveTier;
}

export interface ParsedComponents {
  ok: boolean;
  parsed: Identifier | null;
}

export function parseComponents(q: string, flavor?: string): ParsedComponents {
  if (!q.trim()) return { ok: false, parsed: null };
  try {
    const parsed = parse(q, flavor);
    return parsed ? { ok: true, parsed } : { ok: false, parsed: null };
  } catch {
    return { ok: false, parsed: null };
  }
}

// The tier order is the ranking: an identifier can hit several lanes
// (the exact key and the docid index answer for the same document), and
// the candidate list keeps one entry per document at its best tier.
const TIER_ORDER: ResolveTier[] = ["exact", "lookup", "slug", "docid", "substring", "fuzzy"];

export function dedupeCandidates(candidates: ResolveCandidate[]): ResolveCandidate[] {
  const best = new Map<string, ResolveCandidate>();
  for (const c of candidates) {
    const seen = best.get(c.key);
    if (!seen || TIER_ORDER.indexOf(c.match) < TIER_ORDER.indexOf(seen.match)) {
      best.set(c.key, c);
    }
  }
  return [...best.values()].sort(
    (a, b) => TIER_ORDER.indexOf(a.match) - TIER_ORDER.indexOf(b.match) || a.key.localeCompare(b.key),
  );
}

import { parse } from "../pubid/index.ts";

/** A pubid slug (`iso/9001/2015`) → the document it names, through the
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
 * keys, pubid slug, docid index), shared by /v3/resolve and the identifier
 * pin of /v3/search. Every match goes through the pubid key functions —
 * never a hand-rolled comparison. */
export async function identifierCandidates(
  db: D1Database,
  q: string,
): Promise<{ key: string; flavor: string; tier: ResolveTier }[]> {
  const out: { key: string; flavor: string; tier: ResolveTier }[] = [];
  const gather = async (tier: ResolveTier, fn: Promise<StorageV2Doc | null>) => {
    const d = await fn;
    if (d) out.push({ key: d.key, flavor: d.flavor, tier });
  };
  await gather("exact", getDocument(db, q));
  await gather("lookup", getDocumentByLookupKey(db, normKey(q)));
  await gather("lookup", getDocumentByLookupKey(db, normKey(q).replace(/-/g, "")));
  await gather("slug", getDocumentBySlug(db, q));
  await gather("docid", getDocumentByDocid(db, q));
  return out;
}
