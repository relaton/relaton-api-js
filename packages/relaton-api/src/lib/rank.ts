// The search rank contract (issue #179, docs/search-rank-contract.md):
// what ranks higher in GET /v3/search, and why. Every constant here is
// part of the published contract — a change to one is a contract version
// bump (patch: tie-break or depth tweak; minor: weight change; major: a
// lane added or removed, or the pin rule changed), and the evaluation set
// (test/fixtures/search-eval.json) is pinned to the version.
import type { ResolveTier } from "./resolve";

export type FusedLane = "keyword" | "trigram" | "semantic";

export const RANK_CONTRACT = {
  version: "1.0.0",
  /** RRF damping constant: score += weight / (k + rank), rank 1-based. */
  k: 60,
  /** Per-lane weight in the fusion. Ranks fuse, raw scores never do —
   * bm25, trigram rank and cosine live on different scales. */
  weights: { keyword: 1.0, trigram: 0.6, semantic: 0.8 } as Record<FusedLane, number>,
  /** How many candidates each lane contributes. */
  depth: 100,
  /** The fused list is cut here; paging never goes past it. */
  window: 200,
  /** Identifier tiers that pin a hit above the fused body, best first. */
  pinTiers: ["exact", "lookup", "slug", "docid"] as ResolveTier[],
} as const;

export interface LaneInput {
  /** Identifier hits from the pubid resolve chain, any order. */
  identifier: { key: string; tier: ResolveTier }[];
  /** Each fused lane: keys best-first. */
  keyword: string[];
  trigram: string[];
  semantic: string[];
}

export interface RankedLanes {
  identifier?: ResolveTier;
  keyword?: number;
  trigram?: number;
  semantic?: number;
}

export interface FusedHit {
  key: string;
  year: number | null;
  score: number;
  pinned: boolean;
  lanes: RankedLanes;
}

/** The total order of the contract: pinned hits first (best tier first),
 * then fused score desc, then year desc (nulls last), then key asc. */
export function compareHits(a: FusedHit, b: FusedHit): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.pinned && b.pinned) {
    const t = tierIndex(a.lanes.identifier) - tierIndex(b.lanes.identifier);
    if (t) return t;
  }
  if (a.score !== b.score) return b.score - a.score;
  if (a.year !== b.year) {
    if (a.year === null) return 1;
    if (b.year === null) return -1;
    return b.year - a.year;
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function tierIndex(tier: ResolveTier | undefined): number {
  const i = tier ? RANK_CONTRACT.pinTiers.indexOf(tier) : -1;
  return i < 0 ? RANK_CONTRACT.pinTiers.length : i;
}

/** Fuse the lanes under the contract. Lanes arrive already filtered; a key
 * that appears twice in one lane keeps its first (best) rank. */
export function fuseLanes(
  input: LaneInput,
  opts: { yearOf?: (key: string) => number | null } = {},
): FusedHit[] {
  const hits = new Map<string, FusedHit>();
  const hitOf = (key: string): FusedHit => {
    let h = hits.get(key);
    if (!h) {
      h = { key, year: opts.yearOf?.(key) ?? null, score: 0, pinned: false, lanes: {} };
      hits.set(key, h);
    }
    return h;
  };

  for (const { key, tier } of input.identifier) {
    if (!RANK_CONTRACT.pinTiers.includes(tier)) continue;
    const h = hitOf(key);
    if (tierIndex(tier) < tierIndex(h.lanes.identifier)) h.lanes.identifier = tier;
    h.pinned = true;
  }

  for (const lane of ["keyword", "trigram", "semantic"] as FusedLane[]) {
    const weight = RANK_CONTRACT.weights[lane];
    let rank = 0;
    for (const key of input[lane]) {
      const h = hitOf(key);
      if (h.lanes[lane] !== undefined) continue;
      rank += 1;
      h.lanes[lane] = rank;
      h.score += weight / (RANK_CONTRACT.k + rank);
    }
  }

  return [...hits.values()].sort(compareHits).slice(0, RANK_CONTRACT.window);
}
