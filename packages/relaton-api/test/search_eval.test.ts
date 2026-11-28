import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import evalSet from "./fixtures/search-eval.json";
import { RANK_CONTRACT } from "../src/lib/rank";
import { rankedSearch } from "../src/lib/search2";
import { seedCorpus, stubSemanticEnv } from "./search_corpus";

// The rank-contract evaluation set (issue #179) in PR CI: every case runs
// against the seeded corpus, keyword-only and hybrid (deterministic stub
// embeddings, no credentials). A rank-contract change that drops an
// expected key out of its top k fails here, before it ships.
interface Case {
  q: string;
  k: number;
  expect: string[];
  mode: "any" | "hybrid";
  keyword_misses?: boolean;
}
const cases = evalSet.cases as Case[];

beforeAll(seedCorpus);

describe("search evaluation set", () => {
  it("is pinned to the current rank contract", () => {
    expect(evalSet.rank_contract).toBe(RANK_CONTRACT.version);
  });

  for (const c of cases) {
    it(`hybrid: "${c.q}" has ${c.expect.join(", ")} in the top ${c.k}`, async () => {
      const res = await rankedSearch(env.DB, await stubSemanticEnv(), { q: c.q, limit: c.k, offset: 0 });
      expect(res.items.map((h) => h.key)).toEqual(expect.arrayContaining(c.expect));
    });

    if (c.mode === "any") {
      it(`keyword-only: "${c.q}" has ${c.expect.join(", ")} in the top ${c.k}`, async () => {
        const res = await rankedSearch(env.DB, undefined, { q: c.q, limit: c.k, offset: 0 });
        expect(res.items.map((h) => h.key)).toEqual(expect.arrayContaining(c.expect));
      });
    } else if (c.keyword_misses) {
      it(`keyword-only: "${c.q}" needs the semantic lane`, async () => {
        const res = await rankedSearch(env.DB, undefined, { q: c.q, limit: c.k, offset: 0 });
        expect(res.items.map((h) => h.key)).not.toEqual(expect.arrayContaining(c.expect));
      });
    }
  }
});
