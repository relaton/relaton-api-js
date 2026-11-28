import { describe, expect, it } from "vitest";
import { compareHits, fuseLanes, RANK_CONTRACT } from "../src/lib/rank";

// The rank contract (issue #179, docs/search-rank-contract.md) as a pure
// function: identifier pin, weighted reciprocal-rank fusion, tie-breaks,
// window cap.
const rrf = (weight: number, rank: number) => weight / (RANK_CONTRACT.k + rank);

describe("RANK_CONTRACT", () => {
  it("publishes a semver version and the lane weights", () => {
    expect(RANK_CONTRACT.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(RANK_CONTRACT.weights).toEqual({ keyword: 1.0, trigram: 0.6, semantic: 0.8 });
    expect(RANK_CONTRACT.k).toBe(60);
    expect(RANK_CONTRACT.window).toBe(200);
  });
});

describe("fuseLanes", () => {
  it("sums weighted RRF contributions and records the rank per lane", () => {
    const fused = fuseLanes({
      identifier: [],
      keyword: ["A", "B"],
      trigram: ["B"],
      semantic: ["C", "A"],
    });
    const byKey = new Map(fused.map((h) => [h.key, h]));
    expect(byKey.get("A")!.score).toBeCloseTo(rrf(1.0, 1) + rrf(0.8, 2));
    expect(byKey.get("B")!.score).toBeCloseTo(rrf(1.0, 2) + rrf(0.6, 1));
    expect(byKey.get("C")!.score).toBeCloseTo(rrf(0.8, 1));
    expect(byKey.get("A")!.lanes).toEqual({ keyword: 1, semantic: 2 });
    expect(byKey.get("B")!.lanes).toEqual({ keyword: 2, trigram: 1 });
    expect(fused.map((h) => h.key)).toEqual(["A", "B", "C"]);
  });

  it("pins identifier hits first, in tier order, before any fused score", () => {
    const fused = fuseLanes({
      identifier: [{ key: "Z", tier: "docid" }, { key: "Y", tier: "exact" }],
      keyword: ["A", "B", "Z"],
      trigram: [],
      semantic: [],
    });
    expect(fused.map((h) => h.key)).toEqual(["Y", "Z", "A", "B"]);
    expect(fused[0]!.lanes.identifier).toBe("exact");
    expect(fused[1]!.lanes).toEqual({ identifier: "docid", keyword: 3 });
    expect(fused[0]!.pinned).toBe(true);
    expect(fused[2]!.pinned).toBe(false);
  });

  it("keeps one entry per key at its best identifier tier", () => {
    const fused = fuseLanes({
      identifier: [{ key: "Y", tier: "docid" }, { key: "Y", tier: "lookup" }],
      keyword: [], trigram: [], semantic: [],
    });
    expect(fused).toHaveLength(1);
    expect(fused[0]!.lanes.identifier).toBe("lookup");
  });

  it("breaks score ties by year desc, then key asc", () => {
    const hit = (key: string, year: number | null) => ({ key, year, score: 0.01, pinned: false, lanes: {} });
    const sorted = [hit("D", null), hit("A", 2001), hit("C", 2020), hit("B", 2020)].sort(compareHits);
    expect(sorted.map((h) => h.key)).toEqual(["B", "C", "A", "D"]);
  });

  it("carries the year into each fused hit", () => {
    // v1 weights are pairwise distinct, so exact score ties are rare;
    // compareHits above pins the tie-break order itself.
    const fused = fuseLanes(
      { identifier: [], keyword: ["A"], trigram: [], semantic: [] },
      { yearOf: () => 2020 },
    );
    expect(fused[0]!.year).toBe(2020);
  });

  it("caps the fused list at the window", () => {
    const many = Array.from({ length: 300 }, (_, i) => `K${String(i).padStart(3, "0")}`);
    const fused = fuseLanes({ identifier: [], keyword: many, trigram: [], semantic: [] });
    expect(fused).toHaveLength(RANK_CONTRACT.window);
    expect(fused[0]!.key).toBe("K000");
  });
});
