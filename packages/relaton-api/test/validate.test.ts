import { beforeAll, describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import schemaSql from "../migrations/0001_init.sql?raw";
import storageV2Sql from "../migrations/0007_storage_v2.sql?raw";
import searchV2Sql from "../migrations/0009_documents_search.sql?raw";
import dropV1Sql from "../migrations/0010_drop_v1_tables.sql?raw";
import trigramSql from "../migrations/0013_documents_search_trigram.sql?raw";
import relTargetSql from "../migrations/0014_relations_target_index.sql?raw";
import { splitSqlStatements } from "./split-sql";
import { MAX_REFERENCES, referenceId, splitReferences } from "../src/lib/validate";

// Citation validation (epic #175, issue #182). The seed holds two ISO 9001
// editions (2015 obsoletes 2008, an in-edge for the 2008 record) and an
// ISO 14001:2004 record that names its successor itself (an out-edge to a
// record the index does not hold).

const DOC = (year: string, title: string, docid: string, relation?: unknown[]) => ({
  doctype: "standard",
  docidentifier: [{ content: docid, type: "ISO", primary: true }],
  title: [{ content: title, type: "main", language: "en" }],
  date: [{ type: "published", on: `${year}-01-01` }],
  ...(relation ? { relation } : {}),
});

const rel = (type: string, docid: string) => ({
  type,
  bibitem: { docidentifier: [{ content: docid, type: "ISO" }] },
});

function adminToken(): string {
  return (env as unknown as { ADMIN_TOKEN?: string }).ADMIN_TOKEN ?? "";
}

async function seed(): Promise<Response> {
  const row = (key: string, year: string, title: string, relation?: unknown[]) => ({
    key,
    file: `data/${key.toLowerCase().replace(/[ :]/g, "-")}.yaml`,
    data: DOC(year, title, key, relation),
    keys: [key.replace(/\s+/g, "").toUpperCase()],
  });
  return SELF.fetch(new Request("http://localhost/admin/ingest-v2/iso", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken()}` },
    body: JSON.stringify({
      flavor: "iso",
      repo: "relaton/relaton-data-iso",
      final: true,
      relatonVersion: "3.1.14",
      rows: [
        row("ISO 9001:2008", "2008", "Quality management systems - Requirements"),
        row("ISO 9001:2015", "2015", "Quality management systems - Requirements", [rel("obsoletes", "ISO 9001:2008")]),
        row("ISO 14001:2004", "2004", "Environmental management systems", [rel("supersededBy", "ISO 14001:2015")]),
      ],
      blobs: {},
    }),
  }));
}

beforeAll(async () => {
  for (const sql of [schemaSql, storageV2Sql, searchV2Sql, dropV1Sql, trigramSql, relTargetSql]) {
    await env.DB.batch(splitSqlStatements(sql).map((s) => env.DB.prepare(s)));
  }
  const res = await seed();
  if (res.status !== 200) console.log("SEED FAILED:", res.status, await res.text());
  expect(res.status).toBe(200);
});

function validate(body: unknown, query = ""): Promise<Response> {
  return SELF.fetch(new Request(`http://localhost/v3/validate${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function one(reference: string, extra: Record<string, unknown> = {}) {
  const res = await validate({ references: [reference], ...extra });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { results: any[] };
  return body.results[0];
}

// --- pure helpers ---------------------------------------------------------

describe("reference splitting", () => {
  it("strips list markers and keeps the text before the first comma", () => {
    expect(referenceId("[1] ISO 9001:2015, Quality management systems")).toBe("ISO 9001:2015");
    expect(referenceId("  - ISO 9001:2015")).toBe("ISO 9001:2015");
    expect(referenceId("* ISO 9001:2015")).toBe("ISO 9001:2015");
    expect(referenceId("12. ISO 9001:2015, Title")).toBe("ISO 9001:2015");
    expect(referenceId("(3) ISO 9001:2015")).toBe("ISO 9001:2015");
    expect(referenceId("ISO 9001:2015")).toBe("ISO 9001:2015");
  });

  it("gives one reference per non-empty line", () => {
    expect(splitReferences("ISO 9001:2015\n\n  \r\n[2] ISO 14001:2004, Env\n")).toEqual([
      "ISO 9001:2015",
      "[2] ISO 14001:2004, Env",
    ]);
  });
});

// --- POST /v3/validate ----------------------------------------------------

describe("POST /v3/validate", () => {
  it("passes a current, correctly cited edition", async () => {
    const r = await one("ISO 9001:2015");
    expect(r.verdict).toBe("ok");
    expect(r.reference).toBe("ISO 9001:2015");
    expect(r.checks.parsed.ok).toBe(true);
    expect(r.checks.resolved).toMatchObject({ ok: true, key: "ISO 9001:2015", flavor: "iso" });
    expect(r.checks.dated).toBe(true);
    expect(r.checks.current.ok).toBe(true);
    expect(r.checks.superseded.ok).toBe(true);
    expect(r.checks.cited.ok).toBe(true);
    expect(r.citation).toBeUndefined();
  });

  it("fails an edition that a newer one obsoletes (in-edge)", async () => {
    const r = await one("ISO 9001:2008");
    expect(r.verdict).toBe("error");
    expect(r.checks.current.ok).toBe(false);
    expect(r.checks.current.latest).toMatchObject({ key: "ISO 9001:2015", year: 2015 });
    expect(r.checks.superseded.ok).toBe(false);
    expect(r.checks.superseded.by).toEqual([
      { relation: "obsoletes", direction: "in", key: "ISO 9001:2015", docid: "ISO 9001:2015" },
    ]);
  });

  it("fails an edition whose record names its successor (out-edge)", async () => {
    const r = await one("ISO 14001:2004");
    expect(r.verdict).toBe("error");
    expect(r.checks.current.ok).toBe(true);
    expect(r.checks.superseded.by).toEqual([
      { relation: "supersededBy", direction: "out", key: null, docid: "ISO 14001:2015" },
    ]);
  });

  it("fails an identifier the index does not hold", async () => {
    const r = await one("ISO 99999:2020");
    expect(r.verdict).toBe("error");
    expect(r.checks.parsed.ok).toBe(true);
    expect(r.checks.resolved.ok).toBe(false);
    expect(r.messages.join(" ")).toMatch(/not found/i);
  });

  it("fails a string that neither parses nor resolves", async () => {
    const r = await one("Some random words");
    expect(r.verdict).toBe("error");
    expect(r.checks.parsed.ok).toBe(false);
    expect(r.checks.resolved.ok).toBe(false);
  });

  it("warns on an undated reference and does not pick an edition", async () => {
    const r = await one("ISO 9001");
    expect(r.verdict).toBe("warning");
    expect(r.checks.dated).toBe(false);
    expect(r.checks.resolved).toMatchObject({ ok: false, key: null, alternatives: ["ISO 9001:2015", "ISO 9001:2008"] });
    expect(r.checks.current.ok).toBeNull();
    expect(r.checks.superseded.ok).toBeNull();
    expect(r.checks.cited.ok).toBeNull();
    expect(r.messages.join(" ")).toMatch(/undated/i);
  });

  it("does not render a citation for an undated reference", async () => {
    const r = await one("ISO 9001", { style: "bibtex" });
    expect(r.citation).toBeUndefined();
  });

  it("fails an undated reference with no edition in the Index", async () => {
    const r = await one("ISO 99999");
    expect(r.verdict).toBe("error");
    expect(r.checks.dated).toBe(false);
    expect(r.checks.resolved.alternatives).toEqual([]);
  });

  it("fails a line that is only a list marker", async () => {
    const r = await one("[4]");
    expect(r.verdict).toBe("error");
    expect(r.reference).toBe("");
  });

  it("falls back to text when the references list is empty", async () => {
    const res = await validate({ references: [], text: "ISO 9001:2015" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: { total: number } };
    expect(body.summary.total).toBe(1);
  });

  it("warns when the form differs from the record's identifier", async () => {
    const r = await one("iso 9001:2015");
    expect(r.verdict).toBe("warning");
    expect(r.checks.resolved.key).toBe("ISO 9001:2015");
    expect(r.checks.cited).toEqual({ ok: false, expected: "ISO 9001:2015" });
  });

  it("renders the citation in the requested style", async () => {
    const r = await one("ISO 9001:2015", { style: "bibtex" });
    expect(r.citation).toMatch(/^@/);
    expect(r.citation).toContain("9001");
  });

  it("splits a text body and counts verdicts in the summary", async () => {
    const res = await validate({ text: "[1] ISO 9001:2015, Quality\n[2] ISO 9001:2008, Quality\n\n[3] ISO 9001" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: Record<string, number>; results: any[] };
    expect(body.results.map((r) => r.input)).toEqual([
      "[1] ISO 9001:2015, Quality",
      "[2] ISO 9001:2008, Quality",
      "[3] ISO 9001",
    ]);
    expect(body.summary).toEqual({ total: 3, ok: 1, warning: 1, error: 1 });
  });

  it("returns a markdown report on format=markdown", async () => {
    const res = await validate({ references: ["ISO 9001:2008"] }, "?format=markdown");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/markdown/);
    const text = await res.text();
    expect(text).toContain("| ISO 9001:2008 |");
    expect(text).toContain("error");
  });

  it("rejects a body without references or text", async () => {
    const res = await validate({});
    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toMatch(/problem\+json/);
  });

  it("rejects an unknown style", async () => {
    const res = await validate({ references: ["ISO 9001:2015"], style: "harvard" });
    expect(res.status).toBe(422);
  });

  it("rejects more than the reference limit", async () => {
    const references = Array.from({ length: MAX_REFERENCES + 1 }, () => "ISO 9001:2015");
    const res = await validate({ references });
    expect(res.status).toBe(422);
  });
});
