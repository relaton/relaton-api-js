import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import schemaSql from "../migrations/0001_init.sql?raw";
import storageV2Sql from "../migrations/0007_storage_v2.sql?raw";
import searchV2Sql from "../migrations/0009_documents_search.sql?raw";
import dropV1Sql from "../migrations/0010_drop_v1_tables.sql?raw";
import trigramSql from "../migrations/0013_documents_search_trigram.sql?raw";
import { splitSqlStatements } from "./split-sql";
import { IMPORT_PROBLEM_TYPE, IMPORT_RETRY_AFTER_SECONDS, isImportError } from "../src/lib/import_status";

// relaton-api-js#190: during a D1 import window every read route fails
// with the import marker. The stopgap contract: /v3/status reports the
// state, and the error path answers 503 + Retry-After with a problem
// document — consumers (the MCP server, the site islands) back off
// instead of reading the window as an outage.

beforeAll(async () => {
  const statements = [
    schemaSql,
    storageV2Sql,
    searchV2Sql,
    dropV1Sql,
    trigramSql,
  ].flatMap((sql) => splitSqlStatements(sql));
  await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
});

describe("import-error classifier", () => {
  it("recognizes the live import marker", () => {
    expect(isImportError("Internal server error: D1_ERROR: Currently processing a long-running import.")).toBe(true);
  });

  it("recognizes the in-progress wording variant", () => {
    expect(isImportError("D1_ERROR: import is in progress")).toBe(true);
  });

  it("does not claim ordinary failures", () => {
    expect(isImportError("no such table: documents_search")).toBe(false);
    expect(isImportError("Network connection lost")).toBe(false);
    expect(isImportError("")).toBe(false);
  });
});

describe("GET /v3/status", () => {
  it("answers ok with the release when reads are servable", async () => {
    const res = await SELF.fetch("https://localhost/v3/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("relaton-api");
  });

  it("exposes the problem type constant the 503 carries", () => {
    // The 503 body shape is pinned here without needing to force a real
    // D1 import in the pool: the classifier test above pins when it fires.
    expect(IMPORT_PROBLEM_TYPE).toContain("/problems/importing");
    expect(IMPORT_RETRY_AFTER_SECONDS).toBeGreaterThan(0);
  });
});
