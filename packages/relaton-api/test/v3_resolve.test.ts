import { beforeAll, describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import schemaSql from "../migrations/0001_init.sql?raw";
import storageV2Sql from "../migrations/0007_storage_v2.sql?raw";
import searchV2Sql from "../migrations/0009_documents_search.sql?raw";
import dropV1Sql from "../migrations/0010_drop_v1_tables.sql?raw";
import trigramSql from "../migrations/0013_documents_search_trigram.sql?raw";
import { splitSqlStatements } from "./split-sql";
import { parseId } from "../src/pubid/engine";
import { recordGrammarMiss } from "../src/lib/obs";
import type { Env } from "../src/env";

// GET /v3/resolve (relaton-api-js#176): an id string -> the @pubid/pubid
// grammar parse + candidate keys confirmed by the engine's subset match.
// Discovery, never authority.
const DOC = (id: string, type: string, year: string, title: string) => ({
  doctype: "standard",
  docidentifier: [{ content: id, type, primary: true }],
  title: [{ content: title, type: "main", language: ["en"] }],
  date: [{ type: "published", on: `${year}-01-01` }],
});

function auth(init: RequestInit = {}): RequestInit {
  const token = (env as unknown as { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
  return {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
  };
}

async function ingest(flavor: string, rows: { key: string; type: string; year: string; title: string }[]) {
  const res = await SELF.fetch(`http://localhost/admin/ingest-v2/${flavor}`, auth({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      flavor,
      repo: `relaton/relaton-data-${flavor}`,
      final: true,
      relatonVersion: "3.0.4",
      rows: rows.map((r) => ({
        key: r.key,
        file: `data/${r.key.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.yaml`,
        data: DOC(r.key, r.type, r.year, r.title),
        keys: [r.key.toUpperCase().replace(/\s+/g, "")],
      })),
      blobs: {},
    }),
  }));
  expect(res.status).toBe(200);
  await res.text();
}

beforeAll(async () => {
  for (const sql of [schemaSql, storageV2Sql, searchV2Sql, dropV1Sql, trigramSql]) {
    const statements = splitSqlStatements(sql);
    await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
  }
  await ingest("iso", [
    { key: "ISO 9001:2015", type: "ISO", year: "2015", title: "Quality management systems" },
    { key: "ISO 9001:2008", type: "ISO", year: "2008", title: "Quality management systems" },
    { key: "ISO 19115-1:2014", type: "ISO", year: "2014", title: "Geographic information — Metadata" },
    { key: "ISO 19115-1:2014/Amd 1:2018", type: "ISO", year: "2018", title: "Geographic information — Metadata — Amendment 1" },
    { key: "ISO 14001:2015", type: "ISO", year: "2015", title: "Environmental management systems" },
    { key: "ISO 9001-1:2016", type: "ISO", year: "2016", title: "A part of the quality family" },
  ]);
  await ingest("ietf", [
    { key: "RFC 8446", type: "IETF", year: "2018", title: "The Transport Layer Security (TLS) Protocol Version 1.3" },
    { key: "RFC 1", type: "IETF", year: "1969", title: "Host Software" },
    { key: "RFC 1149", type: "IETF", year: "1990", title: "IP over Avian Carriers" },
  ]);
  await ingest("ieee", [
    { key: "IEEE 802.11-2020", type: "IEEE", year: "2020", title: "Quality management systems for wireless LAN" },
  ]);
  await ingest("bsi", [
    { key: "BS EN ISO 9001:2015", type: "BSI", year: "2015", title: "Quality management systems. Requirements" },
  ]);
  await ingest("nist", [
    { key: "NIST SP 800-53r5", type: "NIST", year: "2020", title: "Security and Privacy Controls" },
  ]);
  // Engine-fed components for most ISO rows; ISO 14001:2015 is left
  // without them so the norm lane is exercised.
  const res = await SELF.fetch("http://localhost/admin/set-components", auth({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      components: [
        { key: "ISO 9001:2015", publisher: "ISO", number: "9001", part: null },
        { key: "ISO 9001:2008", publisher: "ISO", number: "9001", part: null },
        { key: "ISO 19115-1:2014", publisher: "ISO", number: "19115", part: "1" },
        { key: "ISO 19115-1:2014/Amd 1:2018", publisher: "ISO", number: "1", part: null },
        { key: "ISO 9001-1:2016", publisher: "ISO", number: "9001", part: "1" },
      ],
    }),
  }));
  expect(res.status).toBe(200);
  await res.text();
});

type Candidate = { key: string; docid: string | null; title: string | null; flavor: string; year: number | null; match: string; score: number };
type Resolved = {
  input: string;
  parse_ok: boolean;
  flavor: string | null;
  parsed: Record<string, unknown> | null;
  canonical: string | null;
  reason: string | null;
  candidates: Candidate[];
};

async function resolve(qs: string): Promise<{ status: number; body: Resolved; type: string | null }> {
  const res = await SELF.fetch(`http://localhost/v3/resolve?${qs}`);
  return { status: res.status, type: res.headers.get("content-type"), body: await res.json<Resolved>() };
}

describe("parseId (worker-side @pubid/pubid grammars)", { timeout: 120_000 }, () => {
  it("parses iso, itu and ietf ids in workerd", async () => {
    for (const [q, flavor] of [["ISO 9001:2015", "iso"], ["ITU-T X.509", "itu"], ["RFC 8446", "ietf"]] as const) {
      const r = await parseId(q);
      expect(r.ok, q).toBe(true);
      if (r.ok) expect(r.flavor).toBe(flavor);
    }
  });

  it("reports a failed parse without throwing", async () => {
    expect(await parseId("zzz nonsense")).toMatchObject({ ok: false, reason: "no_grammar" });
  });

  // relaton-api-js#187: the parg flavors run on the wasm worker entries.
  it("parses the nist flavor through the lazy parg engine", async () => {
    const r = await parseId("NIST SP 800-53r5", "nist");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.flavor).toBe("nist");
  });

  it("parses an ieee id through the lazy parg engine", async () => {
    const r = await parseId("IEEE 802.3", "ieee");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.flavor).toBe("ieee");
  });

  it("parses an oiml id with the pure-TS worker engine", async () => {
    const r = await parseId("OIML V 002", "oiml");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.flavor).toBe("oiml");
  });
});

describe("recordGrammarMiss", () => {
  it("writes one grammar_miss datapoint with the input, reason and hint", () => {
    const points: AnalyticsEngineDataPoint[] = [];
    const fake = { AE: { writeDataPoint: (p: AnalyticsEngineDataPoint) => points.push(p) } } as unknown as Env;
    recordGrammarMiss(fake, "x".repeat(400), "no_grammar", "iso");
    expect(points).toHaveLength(1);
    expect(points[0]!.indexes).toEqual(["grammar_miss"]);
    expect(points[0]!.blobs).toEqual(["x".repeat(256), "no_grammar", "iso"]);
    expect(points[0]!.doubles).toEqual([1]);
  });

  it("is a no-op without the binding", () => {
    expect(() => recordGrammarMiss({} as Env, "q", "no_grammar", null)).not.toThrow();
  });
});

describe("GET /v3/resolve", { timeout: 60_000 }, () => {
  it("resolves a dated id: parse + exact candidate first", async () => {
    const { status, body } = await resolve("q=ISO%209001%3A2015");
    expect(status).toBe(200);
    expect(body.input).toBe("ISO 9001:2015");
    expect(body.parse_ok).toBe(true);
    expect(body.flavor).toBe("iso");
    expect(body.canonical).toBe("ISO 9001:2015");
    expect(body.parsed).toMatchObject({ number: "9001", year: "2015" });
    expect(body.reason).toBeNull();
    expect(body.candidates[0]).toMatchObject({ key: "ISO 9001:2015", match: "exact", score: 1 });
    expect(body.candidates.map((c) => c.key)).not.toContain("ISO 9001:2008");
  });

  it("resolves an undated id to every edition, newest first", async () => {
    const { body } = await resolve("q=ISO%209001");
    expect(body.parse_ok).toBe(true);
    const keys = body.candidates.map((c) => c.key);
    expect(keys.slice(0, 2)).toEqual(["ISO 9001:2015", "ISO 9001:2008"]);
    expect(body.candidates[0]!.match).toBe("undated");
    expect(body.candidates[0]!.score).toBeGreaterThan(body.candidates[1]!.score);
  });

  it("lists supplements of a matched edition below the edition", async () => {
    const { body } = await resolve("q=ISO%2019115-1%3A2014");
    const byKey = Object.fromEntries(body.candidates.map((c) => [c.key, c]));
    expect(body.candidates[0]!.key).toBe("ISO 19115-1:2014");
    expect(byKey["ISO 19115-1:2014"]!.match).toBe("exact");
    expect(byKey["ISO 19115-1:2014/Amd 1:2018"]!.match).toBe("supplement");
    expect(byKey["ISO 19115-1:2014/Amd 1:2018"]!.score).toBeLessThan(byKey["ISO 19115-1:2014"]!.score);
  });

  it("finds a row that has no engine components yet (norm lane)", async () => {
    const { body } = await resolve("q=ISO%2014001");
    expect(body.candidates[0]).toMatchObject({ key: "ISO 14001:2015", match: "undated" });
  });

  it("resolves an RFC (publisher-less model)", async () => {
    const { body } = await resolve("q=RFC%208446");
    expect(body.flavor).toBe("ietf");
    expect(body.candidates[0]).toMatchObject({ key: "RFC 8446", match: "exact" });
  });

  it("answers an unparseable string with fuzzy candidates only", async () => {
    const { status, body } = await resolve("q=Quality%20management");
    expect(status).toBe(200);
    expect(body.parse_ok).toBe(false);
    expect(body.parsed).toBeNull();
    expect(body.reason).toBe("no_grammar");
    expect(body.candidates.length).toBeGreaterThan(0);
    for (const c of body.candidates) {
      expect(c.match).toBe("fuzzy");
      expect(c.score).toBeLessThanOrEqual(0.5);
    }
  });

  it("parses a nist query through the lazy parg engine (#187)", async () => {
    const { body } = await resolve("q=NIST%20SP%20800-53r5&flavor=nist");
    expect(body.parse_ok).toBe(true);
    expect(body.flavor).toBe("nist");
    expect(body.candidates[0]).toMatchObject({ key: "NIST SP 800-53r5", match: "exact" });
  });

  it("parses a bare nist id once the sync grammars decline it", async () => {
    const { body } = await resolve("q=NIST%20SP%20800-53r5");
    expect(body.parse_ok).toBe(true);
    expect(body.flavor).toBe("nist");
  });

  it("ranks a part of the document (subset) below its editions", async () => {
    const { body } = await resolve("q=ISO%209001");
    const part = body.candidates.find((c) => c.key === "ISO 9001-1:2016");
    expect(part?.match).toBe("subset");
    expect(body.candidates.findIndex((c) => c.key === "ISO 9001-1:2016"))
      .toBeGreaterThan(body.candidates.findIndex((c) => c.key === "ISO 9001:2008"));
  });

  it("finds the exact record among many longer numbers (RFC 1 vs RFC 1149)", async () => {
    const { body } = await resolve("q=RFC%201");
    expect(body.candidates[0]).toMatchObject({ key: "RFC 1", match: "exact" });
    expect(body.candidates.map((c) => c.key)).not.toContain("RFC 1149");
  });

  it("accepts the ieee grammar's own parse, still rejecting ASHRAE's", async () => {
    const { body } = await resolve("q=IEEE%20802.11-2020");
    // #187: the ieee grammar parses it; ASHRAE's near parse is still
    // rejected by the render-agreement gate.
    expect(body.parse_ok).toBe(true);
    expect(body.flavor).toBe("ieee");
    expect(body.candidates[0]).toMatchObject({ key: "IEEE 802.11-2020", match: "exact" });
  });

  it("does not parse a single word (IANA grammar reads any word)", async () => {
    for (const q of ["ISO", "Quality"]) {
      const { body } = await resolve(`q=${q}`);
      expect(body.parse_ok, q).toBe(false);
    }
  });

  it("keeps no_grammar when only a title of a no-engine flavor matches", async () => {
    const { body } = await resolve("q=Quality%20management%20systems");
    expect(body.candidates.some((c) => c.flavor === "ieee")).toBe(true);
    expect(body.reason).toBe("no_grammar");
  });

  it("resolves an adoption (BS EN ISO) to its own record", async () => {
    const { body } = await resolve("q=BS%20EN%20ISO%209001%3A2015");
    // The bsi grammar rides the shared central builder, which is
    // node-bound in @pubid/pubid 0.1.70 (worker entries: pubid/pubid-ts
    // — bsi/cen_cenelec/csa/gost/evs track there), so the parse is
    // unavailable; the identity lanes still name the record.
    expect(body.parse_ok).toBe(false);
    expect(body.candidates[0]).toMatchObject({ key: "BS EN ISO 9001:2015", match: "exact" });
  });

  it("parses a lowercase spelling and keeps the lookup lane's candidate (#187)", async () => {
    const { body } = await resolve("q=nist%20sp%20800-53r5");
    // The nist grammar renders the lowercase spelling back normalized, so
    // the parse now succeeds; the candidate tier is unchanged.
    expect(body.parse_ok).toBe(true);
    expect(body.canonical).toBe("NIST SP 800-53r5");
    expect(body.candidates[0]).toMatchObject({ key: "NIST SP 800-53r5", match: "lookup", score: 0.95 });
  });

  it("keeps the substring lane above the trigram lane on a fragment query", async () => {
    const { body } = await resolve("q=SP%20800-5");
    // The nist grammar reads the fragment ("SP 800-5"); the candidate
    // still comes from the docid substring lane.
    expect(body.parse_ok).toBe(true);
    expect(body.candidates[0]).toMatchObject({ key: "NIST SP 800-53r5", match: "substring", score: 0.6 });
  });

  it("keeps one candidate per record at its best tier", async () => {
    const { body } = await resolve("q=RFC%208446");
    expect(body.candidates.filter((c) => c.key === "RFC 8446")).toHaveLength(1);
    expect(body.candidates[0]).toMatchObject({ key: "RFC 8446", match: "exact" });
  });

  it("honours limit", async () => {
    const { body } = await resolve("q=ISO%209001&limit=1");
    expect(body.candidates).toHaveLength(1);
  });

  it("rejects a missing q and an unknown flavor with problem+json", async () => {
    for (const qs of ["", "q=%20%20", "q=ISO%209001&flavor=nope"]) {
      const { status, type } = await resolve(qs);
      expect(status, qs).toBe(400);
      expect(type).toContain("application/problem+json");
    }
  });

  it("is listed in the OpenAPI document with a typed response", async () => {
    const res = await SELF.fetch("http://localhost/openapi.json");
    type Schema = { $ref?: string; properties?: Record<string, unknown> };
    const doc = await res.json<{
      paths: Record<string, { get?: { responses: Record<string, { content: Record<string, { schema: Schema }> }> } }>;
      components?: { schemas?: Record<string, Schema> };
    }>();
    const ref = doc.paths["/v3/resolve"]?.get?.responses["200"]?.content["application/json"]?.schema;
    expect(ref?.$ref).toBe("#/components/schemas/ResolveResponse");
    const schema = doc.components?.schemas?.ResolveResponse;
    expect(schema?.properties).toHaveProperty("candidates");
    expect(schema?.properties).toHaveProperty("parse_ok");
  });
});
