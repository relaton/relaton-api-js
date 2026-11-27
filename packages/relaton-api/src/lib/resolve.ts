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
