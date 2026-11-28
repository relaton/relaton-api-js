import { beforeAll, describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { RANK_CONTRACT } from "../src/lib/rank";
import { rankedSearch } from "../src/lib/search2";
import { auth, seedCorpus, stubSemanticEnv } from "./search_corpus";

// GET /v3/search (issue #179): the ranked endpoint under the published
// rank contract. The worker test config has no AI/Vectorize bindings, so
// the route runs keyword-only here; the hybrid path is driven through
// rankedSearch with a deterministic stub.
interface Hit {
  key: string;
  flavor: string;
  docid: string | null;
  title: string | null;
  year: number | null;
  score: number;
  pinned: boolean;
  lanes: Record<string, number | string>;
  highlight?: string;
  api: string;
}
interface Body {
  rank_contract: string;
  semantic: boolean;
  items: Hit[];
  facets: Record<string, { value: string; count: number }[]>;
  next_cursor: string | null;
}

async function search(qs: string): Promise<{ status: number; body: Body; headers: Headers }> {
  const res = await SELF.fetch(`http://localhost/v3/search?${qs}`);
  const body = await res.json<Body>();
  return { status: res.status, body, headers: res.headers };
}

const keys = (b: Body) => b.items.map((i) => i.key);

beforeAll(seedCorpus);

describe("GET /v3/search", () => {
  it("stamps the rank contract version and reports keyword-only mode", async () => {
    const { status, body, headers } = await search("q=quality");
    expect(status).toBe(200);
    expect(headers.get("content-type")).toContain("application/json");
    expect(body.rank_contract).toBe(RANK_CONTRACT.version);
    expect(body.semantic).toBe(false);
    expect(body.items[0]!.api).toBe(`/v3/documents/${encodeURIComponent(body.items[0]!.key)}`);
  });

  it("pins the identifier hit first, colon form included", async () => {
    const { status, body } = await search(`q=${encodeURIComponent("ISO 9001:2015")}`);
    expect(status).toBe(200);
    expect(body.items[0]!.key).toBe("ISO 9001:2015");
    expect(body.items[0]!.pinned).toBe(true);
    expect(body.items[0]!.lanes.identifier).toBe("exact");
  });

  it("ranks keyword matches and records the lanes", async () => {
    const { body } = await search(`q=${encodeURIComponent("quality management")}`);
    expect(keys(body)).toEqual(expect.arrayContaining(["ISO 9001:2015", "ISO 9001:2008", "ISO 9000:2015", "ISO/TR 10013:2021"]));
    for (const hit of body.items) {
      expect(hit.lanes.keyword).toBeGreaterThan(0);
      expect(hit.score).toBeGreaterThan(0);
    }
    const scores = body.items.filter((h) => !h.pinned).map((h) => h.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("serves a trigram hit with a match highlight for a partial identifier", async () => {
    const { body } = await search(`q=${encodeURIComponent("9001:20")}`);
    const hit = body.items.find((h) => h.key === "ISO 9001:2015");
    expect(hit).toBeDefined();
    expect(hit!.lanes.trigram).toBeGreaterThan(0);
    expect(hit!.highlight).toContain("<mark>");
  });

  it("applies flavor, doctype, status and year filters to every lane", async () => {
    expect(new Set((await search("q=security&flavor=ietf")).body.items.map((h) => h.flavor))).toEqual(new Set(["ietf"]));
    expect(keys((await search("q=quality&doctype=technical-report")).body)).toEqual(["ISO/TR 10013:2021"]);
    expect(keys((await search("q=quality&status=95.99")).body)).toEqual(["ISO 9001:2008"]);
    expect(keys((await search("q=quality&year=2015")).body).sort()).toEqual(["ISO 9000:2015", "ISO 9001:2015"]);
    // The identifier pin obeys the filters too.
    expect(keys((await search(`q=${encodeURIComponent("ISO 9001:2015")}&flavor=ietf`)).body)).toEqual([]);
  });

  it("pages through the ranked window with an opaque cursor", async () => {
    const full = keys((await search("q=quality&limit=25")).body);
    expect(full.length).toBeGreaterThanOrEqual(4);
    const first = await search("q=quality&limit=2");
    expect(keys(first.body)).toEqual(full.slice(0, 2));
    expect(first.body.next_cursor).toBeTruthy();
    expect(first.headers.get("link")).toContain('rel="next"');
    const second = await search(`q=quality&limit=2&cursor=${first.body.next_cursor}`);
    expect(keys(second.body)).toEqual(full.slice(2, 4));
    const last = await search(`q=quality&limit=25&cursor=${first.body.next_cursor}`);
    expect(last.body.next_cursor).toBeNull();
  });

  it("returns facets over the keyword match", async () => {
    const { body } = await search("q=protocol");
    expect(body.facets.flavor).toEqual([{ value: "ietf", count: 2 }]);
    // Facets ignore the filters, so a client sees what each filter leaves.
    const filtered = await search("q=protocol&flavor=iso");
    expect(filtered.body.items).toEqual([]);
    expect(filtered.body.facets).toEqual(body.facets);
  });

  it("takes the trigram highlight from display columns, never the normalized key", async () => {
    const { body } = await search("q=iso9001");
    expect(body.items.some((h) => h.lanes.trigram)).toBe(true);
    for (const hit of body.items) expect((hit.highlight ?? "").toLowerCase()).not.toContain("<mark>iso9001");
  });

  it("rejects a blank query and a malformed cursor with problem+json", async () => {
    const blank = await SELF.fetch("http://localhost/v3/search?q=%20%20");
    expect(blank.status).toBe(422);
    expect(blank.headers.get("content-type")).toContain("application/problem+json");
    await blank.text();
    const bad = await SELF.fetch("http://localhost/v3/search?q=quality&cursor=!!!");
    expect(bad.status).toBe(422);
    await bad.text();
    // A well-formed cursor minted under another contract version would page
    // a differently-ordered list.
    const foreign = btoa("0.9.0:2").replace(/=+$/, "");
    const stale = await SELF.fetch(`http://localhost/v3/search?q=quality&cursor=${foreign}`);
    expect(stale.status).toBe(422);
    await stale.text();
  });

  it("is listed in the OpenAPI document", async () => {
    const res = await SELF.fetch("http://localhost/openapi.json");
    const doc = await res.json<{ paths: Record<string, unknown> }>();
    expect(doc.paths["/v3/search"]).toBeDefined();
  });
});

describe("embedding freshness", () => {
  const ingest = (title: string, extra: Record<string, unknown> = {}, docid = "XEP 0001") => SELF.fetch("http://localhost/admin/ingest-v2/xsf", auth({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      flavor: "xsf", repo: "relaton/relaton-data-xsf", final: true, blobs: {},
      rows: [{
        key: "XEP 0001", file: "data/xep-0001.yaml", keys: ["XEP0001"],
        data: { docidentifier: [{ content: docid, type: "XSF", primary: true }], title: [{ content: title, type: "main", language: ["en"] }], ...extra },
      }],
    }),
  })).then((r) => r.text());
  const embeddedAt = () => env.DB.prepare("SELECT embedded_at FROM documents_search WHERE key = 'XEP 0001'")
    .first<{ embedded_at: string | null }>().then((r) => r?.embedded_at ?? null);

  it("keeps embedded_at on an unchanged re-ingest and clears it when the embedded text changes", async () => {
    await ingest("Jabber roster notes");
    await env.DB.prepare("UPDATE documents_search SET embedded_at = '2026-11-01T00:00:00Z' WHERE key = 'XEP 0001'").run();
    await ingest("Jabber roster notes");
    expect(await embeddedAt()).toBe("2026-11-01T00:00:00Z");
    await ingest("Jabber roster notes, revised");
    expect(await embeddedAt()).toBeNull();
  });

  it("clears embedded_at when the abstract or the docid changes", async () => {
    const stamp = () => env.DB.prepare("UPDATE documents_search SET embedded_at = '2026-11-01T00:00:00Z' WHERE key = 'XEP 0001'").run();
    await ingest("Jabber roster notes, revised");
    await stamp();
    await ingest("Jabber roster notes, revised", { abstract: "Roster handling." });
    expect(await embeddedAt()).toBeNull();
    await stamp();
    await ingest("Jabber roster notes, revised", { abstract: "Roster handling." }, "XEP-0001");
    expect(await embeddedAt()).toBeNull();
  });

  it("clears embedded_at when /admin/build-search rewrites the embedded text", async () => {
    await env.DB.prepare("UPDATE documents_search SET embedded_at = '2026-11-01T00:00:00Z', title = 'stale title' WHERE key = 'XEP 0001'").run();
    const res = await SELF.fetch("http://localhost/admin/build-search?limit=200", auth({ method: "POST" }));
    expect(res.status).toBe(200);
    await res.text();
    expect(await embeddedAt()).toBeNull();
  });

  it("reports embedding coverage per flavor behind the admin token", async () => {
    const denied = await SELF.fetch("http://localhost/admin/embed-coverage");
    expect(denied.status).toBe(403);
    await denied.text();
    await env.DB.prepare("UPDATE documents_search SET embedded_at = '2026-11-01T00:00:00Z' WHERE key = 'RFC 8446'").run();
    const res = await SELF.fetch("http://localhost/admin/embed-coverage", auth());
    expect(res.status).toBe(200);
    const body = await res.json<{ total: number; embedded: number; flavors: { flavor: string; total: number; embedded: number }[] }>();
    expect(body.flavors.find((f) => f.flavor === "ietf")).toEqual({ flavor: "ietf", total: 3, embedded: 1 });
    expect(body.flavors.find((f) => f.flavor === "iso")).toEqual({ flavor: "iso", total: 7, embedded: 0 });
    expect(body.total).toBeGreaterThanOrEqual(10);
  });
});

describe("rankedSearch hybrid mode", () => {
  it("adds semantic-only neighbours and marks the semantic lane", async () => {
    const stub = await stubSemanticEnv();
    const res = await rankedSearch(env.DB, stub, { q: "encryption", limit: 10, offset: 0 });
    expect(res.semantic).toBe(true);
    const hit = res.items.find((h) => h.key === "ISO/IEC 18033-3:2010");
    expect(hit?.lanes.semantic).toBeGreaterThan(0);
  });

  it("filters semantic neighbours like the other lanes", async () => {
    const stub = await stubSemanticEnv();
    const res = await rankedSearch(env.DB, stub, { q: "encryption", flavor: "ietf", limit: 10, offset: 0 });
    expect(res.items.every((h) => h.flavor === "ietf")).toBe(true);
  });

  it("skips the semantic lane when asked to", async () => {
    const stub = await stubSemanticEnv();
    const res = await rankedSearch(env.DB, stub, { q: "encryption", limit: 10, offset: 0, semantic: false });
    expect(res.semantic).toBe(false);
    expect(stub.queries).toBe(0);
  });

  it("degrades to the other lanes when the vector query throws", async () => {
    const broken = {
      AI: { run: async () => { throw new Error("AI down"); } } as unknown as Ai,
      VECTORIZE: {} as VectorizeIndex,
    };
    const res = await rankedSearch(env.DB, broken, { q: "quality", limit: 10, offset: 0 });
    expect(res.semantic).toBe(false);
    expect(res.items.length).toBeGreaterThan(0);
  });
});
