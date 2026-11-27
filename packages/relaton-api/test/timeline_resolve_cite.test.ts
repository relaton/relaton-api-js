import { beforeAll, describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import schemaSql from "../migrations/0001_init.sql?raw";
import storageV2Sql from "../migrations/0007_storage_v2.sql?raw";
import searchV2Sql from "../migrations/0009_documents_search.sql?raw";
import dropV1Sql from "../migrations/0010_drop_v1_tables.sql?raw";
import trigramSql from "../migrations/0013_documents_search_trigram.sql?raw";
import { splitSqlStatements } from "./split-sql";
import { buildTimeline, classifyRelation, type TimelineNode } from "../src/lib/timeline";
import { dedupeCandidates } from "../src/lib/resolve";
import { parseId } from "../src/pubid/engine";

// The wave-1 surfaces (epic relaton/relaton-api-js#175): #176 resolve,
// #177 cite, #178 timeline. Seeding follows search2.test.ts — two docs
// where ISO 9000 amends ISO 9001, so the timeline has one out-edge from
// the amender and one in-edge from the amended. The seed posts through an
// explicit Request object.

const DOC = (key: string, year: string, title: string, docid = key, relation?: unknown[]) => ({
  doctype: "standard",
  docidentifier: [{ content: docid, type: "ISO", primary: true }],
  title: [{ content: title, type: "main", language: "en" }],
  date: [{ type: "published", on: `${year}-01-01` }],
  ...(relation ? { relation } : {}),
});

function adminToken(): string {
  return (env as unknown as { ADMIN_TOKEN?: string }).ADMIN_TOKEN ?? "";
}

async function seed(): Promise<Response> {
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken()}`,
    },
    body: JSON.stringify({
      flavor: "iso",
      repo: "relaton/relaton-data-iso",
      final: true,
      relatonVersion: "3.1.14",
      rows: [
        {
          key: "ISO 9000",
          file: "data/iso-9000.yaml",
          data: DOC("ISO 9000", "2015", "Quality management - Vocabulary", "ISO 9000:2015", [
            { type: "amends", bibitem: { docidentifier: [{ content: "ISO 9001:2015", type: "ISO" }] } },
          ]),
          keys: ["ISO9000"],
        },
        {
          key: "ISO 9001",
          file: "data/iso-9001.yaml",
          data: DOC("ISO 9001", "2015", "Quality management systems - Requirements", "ISO 9001:2015"),
          keys: ["ISO9001"],
        },
      ],
      blobs: {},
    }),
  };
  return SELF.fetch(new Request("http://localhost/admin/ingest-v2/iso", init));
}

beforeAll(async () => {
  for (const sql of [schemaSql, storageV2Sql, searchV2Sql, dropV1Sql, trigramSql]) {
    await env.DB.batch(splitSqlStatements(sql).map((s) => env.DB.prepare(s)));
  }
  const res = await seed();
  if (res.status !== 200) console.log("SEED FAILED:", res.status, await res.text());
  expect(res.status).toBe(200);
});

// --- pure helpers ---------------------------------------------------------

describe("timeline classification", () => {
  it("maps the stored relation families", () => {
    expect(classifyRelation("amends")).toBe("amendment");
    expect(classifyRelation("supersededBy")).toBe("supersession");
    expect(classifyRelation("hasInstance")).toBe("instance");
  });

  it("passes unknown relation types through, never drops them", () => {
    expect(classifyRelation("inFormatOf")).toBe("inFormatOf");
  });
});

describe("buildTimeline", () => {
  const nodes = new Map([
    ["ISO 9001:2015", { key: "ISO 9001", docid: "ISO 9001:2015", year: 2015, title: "Requirements" }],
  ]);

  it("pins the publication first, then date-orders the edges", () => {
    const events = buildTimeline(
      { key: "ISO 9000", docid: "ISO 9000:2015", year: 2015, title: "Vocabulary" },
      [{ type: "amends", target: "ISO 9001:2015" }],
      [{ type: "updatedBy", document: "ISO 19011:2018" }],
      new Map<string, TimelineNode>([
        ...nodes,
        ["ISO 19011:2018", { key: "ISO 19011", docid: "ISO 19011:2018", year: 2018, title: null }],
      ]),
    );
    expect(events[0]).toMatchObject({ type: "published", direction: "self" });
    expect(events[1]!).toMatchObject({ type: "amendment", direction: "out", key: "ISO 9001", year: 2015 });
    expect(events[2]!).toMatchObject({ type: "update", direction: "in", key: "ISO 19011", year: 2018 });
  });

  it("keeps undated events after dated ones", () => {
    const events = buildTimeline(
      { key: "X", docid: "X", year: 2020, title: null },
      [{ type: "amends", target: "UNDATED-1" }],
      [],
      new Map([["UNDATED-1", { key: "UNDATED-1", docid: "UNDATED-1", year: null, title: null }]]),
    );
    expect(events.at(-1)?.year).toBeNull();
  });
});

describe("resolve ranking", () => {
  it("keeps one candidate per key at its best tier", () => {
    const deduped = dedupeCandidates([
      { key: "A", flavor: "iso", docid: "", title: null, match: "fuzzy" },
      { key: "A", flavor: "iso", docid: "", title: null, match: "exact" },
      { key: "B", flavor: "iso", docid: "", title: null, match: "substring" },
    ]);
    expect(deduped.map((d) => [d.key, d.match])).toEqual([["A", "exact"], ["B", "substring"]]);
  });

  it("parses ISO identifiers through the worker @pubid/pubid grammar", () => {
    const parsed = parseId("ISO 10303-214:2010");
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && String(parsed.id.toHash().number)).toContain("10303");
  });

  it("answers parse_ok false without throwing on noise", () => {
    expect(parseId("not an identifier at all !!!").ok).toBe(false);
  });
});

// --- endpoints -------------------------------------------------------------

describe("GET /v3/documents/{key}/timeline", () => {
  it("returns the publication and the classified relation events", async () => {
    const res = await SELF.fetch(`http://localhost/v3/documents/${encodeURIComponent("ISO 9000")}/timeline`);
    expect(res.status).toBe(200);
    const body = await res.json() as { root: { key: string }; events: { type: string; direction: string; key?: string }[] };
    expect(body.root.key).toBe("ISO 9000");
    expect(body.events[0]).toMatchObject({ type: "published", direction: "self" });
    expect(body.events.some((e) => e.type === "amendment" && e.direction === "out" && e.key === "ISO 9001")).toBe(true);
  });

  it("surfaces the in-direction edge from the amended side", async () => {
    const res = await SELF.fetch(`http://localhost/v3/documents/${encodeURIComponent("ISO 9001")}/timeline`);
    expect(res.status).toBe(200);
    const body = await res.json() as { events: { type: string; direction: string; key?: string }[] };
    expect(body.events.some((e) => e.type === "amendment" && e.direction === "in" && e.key === "ISO 9000")).toBe(true);
  });

  it("answers problem+json 404 for an unknown key", async () => {
    const res = await SELF.fetch("http://localhost/v3/documents/NOPE-999/timeline");
    expect(res.status).toBe(404);
  });
});

describe("GET /v3/resolve", () => {
  it("resolves a dated identifier to its canonical candidate", async () => {
    const res = await SELF.fetch("http://localhost/v3/resolve?q=" + encodeURIComponent("ISO 9001:2015"));
    expect(res.status).toBe(200);
    const body = await res.json() as { parse_ok: boolean; candidates: { key: string; match: string }[] };
    expect(body.parse_ok).toBe(true);
    expect(body.candidates.some((c) => c.key === "ISO 9001")).toBe(true);
  });

  it("accepts a grammar miss with parse_ok false and still answers candidates", async () => {
    const res = await SELF.fetch("http://localhost/v3/resolve?q=9001");
    expect(res.status).toBe(200);
    const body = await res.json() as { parse_ok: boolean; candidates: unknown[] };
    expect(body.parse_ok).toBe(false);
    expect(Array.isArray(body.candidates)).toBe(true);
  });

  it("rejects a missing query", async () => {
    const res = await SELF.fetch("http://localhost/v3/resolve");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("POST /v3/cite", () => {
  it("renders ISO 690 from a key", async () => {
    const res = await SELF.fetch("http://localhost/v3/cite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "ISO 9001:2015", style: "iso690" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { citation: string; style: string };
    expect(body.style).toBe("iso690");
    expect(body.citation.length).toBeGreaterThan(0);
    expect(body.citation).toContain("ISO 9001");
  });

  it("renders BibTeX from an inline record", async () => {
    const res = await SELF.fetch("http://localhost/v3/cite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        record: DOC("ISO 9001", "2015", "Quality management systems - Requirements", "ISO 9001:2015"),
        style: "bibtex",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { citation: string };
    expect(body.citation).toContain("@");
  });

  it("rejects an unsupported style", async () => {
    const res = await SELF.fetch("http://localhost/v3/cite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "ISO 9001:2015", style: "turabian" }),
    });
    expect(res.status).toBe(422);
  });

  it("rejects a request with neither key nor record", async () => {
    const res = await SELF.fetch("http://localhost/v3/cite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style: "iso690" }),
    });
    expect(res.status).toBe(422);
  });
});
