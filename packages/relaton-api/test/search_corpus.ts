import { SELF, env } from "cloudflare:test";
import schemaSql from "../migrations/0001_init.sql?raw";
import storageV2Sql from "../migrations/0007_storage_v2.sql?raw";
import searchV2Sql from "../migrations/0009_documents_search.sql?raw";
import dropV1Sql from "../migrations/0010_drop_v1_tables.sql?raw";
import trigramSql from "../migrations/0013_documents_search_trigram.sql?raw";
import { recordText, type SemanticEnv } from "../src/lib/semantic";
import { splitSqlStatements } from "./split-sql";

// The shared corpus for the /v3/search route specs and the rank-contract
// evaluation set (issue #179): two flavors, editions of one standard, and
// records that only a meaning-level lane can connect to a query.
interface Doc {
  key: string;
  type: string;
  year: string;
  title: string;
  abstract?: string;
  doctype?: string;
  stage?: string;
}

export const CORPUS: Record<string, Doc[]> = {
  iso: [
    { key: "ISO 9001:2015", type: "ISO", year: "2015", title: "Quality management systems — Requirements", stage: "60.60" },
    { key: "ISO 9001:2008", type: "ISO", year: "2008", title: "Quality management systems — Requirements", stage: "95.99" },
    { key: "ISO 9000:2015", type: "ISO", year: "2015", title: "Quality management systems — Fundamentals and vocabulary", stage: "60.60" },
    { key: "ISO/IEC 27001:2022", type: "ISO", year: "2022", title: "Information security, cybersecurity and privacy protection — Information security management systems — Requirements", stage: "60.60" },
    { key: "ISO 19115-1:2014", type: "ISO", year: "2014", title: "Geographic information — Metadata — Part 1: Fundamentals", stage: "60.60" },
    { key: "ISO/IEC 18033-3:2010", type: "ISO", year: "2010", title: "Information technology — Security techniques — Block ciphers", stage: "60.60" },
    { key: "ISO/TR 10013:2021", type: "ISO", year: "2021", title: "Quality management systems — Guidance for documented information", doctype: "technical-report", stage: "60.60" },
  ],
  ietf: [
    { key: "RFC 8446", type: "IETF", year: "2018", title: "The Transport Layer Security (TLS) Protocol Version 1.3", abstract: "This document specifies version 1.3 of the TLS protocol, which allows client/server applications to communicate privately." },
    { key: "RFC 5246", type: "IETF", year: "2008", title: "The Transport Layer Security (TLS) Protocol Version 1.2" },
    { key: "RFC 9110", type: "IETF", year: "2022", title: "HTTP Semantics" },
  ],
};

const slug = (key: string) => key.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function recordOf(d: Doc): Record<string, unknown> {
  return {
    doctype: d.doctype ?? "standard",
    docidentifier: [{ content: d.key, type: d.type, primary: true }],
    title: [{ content: d.title, type: "main", language: ["en"] }],
    date: [{ type: "published", on: `${d.year}-01-01` }],
    ...(d.abstract ? { abstract: d.abstract } : {}),
    ...(d.stage ? { status: { stage: d.stage } } : {}),
  };
}

export function auth(init: RequestInit = {}): RequestInit {
  const token = (env as unknown as { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
  return {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
  };
}

export async function seedCorpus(): Promise<void> {
  for (const sql of [schemaSql, storageV2Sql, searchV2Sql, dropV1Sql, trigramSql]) {
    const statements = splitSqlStatements(sql);
    await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
  }
  for (const [flavor, docs] of Object.entries(CORPUS)) {
    const res = await SELF.fetch(`http://localhost/admin/ingest-v2/${flavor}`, auth({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flavor,
        repo: `relaton/relaton-data-${flavor}`,
        final: true,
        rows: docs.map((d) => ({
          key: d.key,
          file: `data/${slug(d.key)}.yaml`,
          data: recordOf(d),
          keys: [d.key.replace(/\s+/g, "")],
        })),
        blobs: {},
      }),
    }));
    if (!res.ok) throw new Error(`seed ${flavor}: ${res.status} ${await res.text()}`);
    await res.text();
  }
}

// A deterministic stand-in for Workers AI + Vectorize. Tokens map through a
// small concept table first, so records and queries that share a meaning
// (encryption ~ cipher) land near each other without sharing a word — the
// one thing only the semantic lane can do.
const CONCEPTS: Record<string, string> = {
  encryption: "crypto", cipher: "crypto", ciphers: "crypto", cryptography: "crypto",
  tls: "transport-security", ssl: "transport-security", https: "transport-security",
  qms: "quality", quality: "quality",
  geospatial: "geo", geographic: "geo",
};
const DIMS = 64;

function embedOne(text: string): number[] {
  const v = new Array<number>(DIMS).fill(0);
  for (const raw of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const token = CONCEPTS[raw] ?? raw;
    let h = 2166136261;
    for (const ch of token) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    v[h % DIMS]! += CONCEPTS[raw] ? 3 : 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export async function stubSemanticEnv(): Promise<SemanticEnv & { queries: number }> {
  const { results } = await env.DB.prepare(
    "SELECT key, flavor, docid, title, abstract FROM documents_search",
  ).all<{ key: string; flavor: string; docid: string | null; title: string | null; abstract: string | null }>();
  const index = (results ?? []).map((r) => ({
    key: r.key, flavor: r.flavor, values: embedOne(recordText(r.docid, r.title, r.abstract)),
  }));
  const stub = {
    queries: 0,
    AI: {
      run: async (_model: string, input: { text: string[] }) => ({ shape: [input.text.length, DIMS], data: input.text.map(embedOne) }),
    } as unknown as Ai,
    VECTORIZE: {
      query: async (vector: number[], opts: { topK?: number }) => {
        stub.queries += 1;
        const scored = index
          .map((d) => ({ id: d.key, score: d.values.reduce((s, x, i) => s + x * vector[i]!, 0), metadata: { key: d.key, flavor: d.flavor } }))
          .filter((m) => m.score > 0.2)
          .sort((a, b) => b.score - a.score)
          .slice(0, opts.topK ?? 10);
        return { matches: scored, count: scored.length };
      },
    } as unknown as VectorizeIndex,
  };
  return stub;
}
