import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { dump as dumpYaml } from "js-yaml";
import type { AppEnv } from "../env";
import { getDocument, getDocumentByDocid, getDocumentByLookupKey, pageSummaries, searchDocumentPages, type StorageV2Doc } from "../lib/storage2";
// Deep path: self-contained and extension-free, loadable under plain node
// as well as the bundler (same import discipline produce.ts uses).
import { normKey } from "../pubid/keys.ts";
import { parse } from "../pubid/index.ts";
import { parseComponents, dedupeCandidates, getDocumentBySlug, identifierCandidates, type ResolveCandidate } from "../lib/resolve";
import { buildTimeline, type TimelineNode } from "../lib/timeline";
import { RANK_CONTRACT } from "../lib/rank";
import { rankedSearch } from "../lib/search2";
import { logEvent } from "../lib/obs";
import { CITE_STYLES, isCiteStyle, renderCitation } from "../lib/cite";
import { MAX_REFERENCES, reportMarkdown, splitReferences, validateReferences } from "../lib/validate";

// API v3 (TODO.api/03): the modern surface over the storage v2 loader —
// content negotiation, RFC 9457 problem+json errors, strong ETags with
// immutable caching, cursor pagination with Link headers. The document
// route caches whole responses in the Workers edge cache (caches.default)
// under a version-stamped key — the row's indexed_at is the key version,
// so a re-ingest that touches a document serves a fresh entry while every
// untouched document keeps its cache hit. No purge step exists: orphaned
// entries simply age out.
//
// R2 blob convention: the same key the v1 ingest wrote —
// `<flavor>/<file without .yaml>` holding bibdata XML.

const JSON_TYPE = "application/json";
const XML_TYPE = "application/relaton+xml";
const YAML_TYPE = "application/yaml";

const IMMUTABLE = "public, max-age=31536000, immutable";

function problem(c: any, status: number, title: string, detail?: string) {
  return c.json({ type: "about:blank", title, status, ...(detail ? { detail } : {}) }, status as 400, {
    "content-type": "application/problem+json",
  });
}

function negotiate(accept: string | undefined, format: string | undefined): string {
  if (format === "xml" || format === "yaml" || format === "json") {
    return { xml: XML_TYPE, yaml: YAML_TYPE, json: JSON_TYPE }[format];
  }
  const offered = (accept ?? "").split(",").map((t) => t.split(";")[0]!.trim().toLowerCase());
  if (offered.includes(XML_TYPE)) return XML_TYPE;
  if (offered.includes(YAML_TYPE)) return YAML_TYPE;
  return JSON_TYPE;
}

function blobKeyOf(flavor: string, file: string): string {
  return `${flavor}/${file.replace(/\.ya?ml$/, "")}`;
}

async function etagOf(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return `"${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}"`;
}

function ifNoneMatchSatisfied(header: string | undefined, etag: string): boolean {
  return (header ?? "").split(",").map((t) => t.trim()).includes(etag);
}

function yamlOf(data: Record<string, unknown>): string {
  return dumpYaml(data, { lineWidth: -1 });
}

// The pubid-scheme slug form (relaton#441): "/"-joined segments parse back
// to the identifier structurally (engine-free), and the identifier's
// canonical render runs the standard resolution chain. A slug of an
// unregistered flavor (nist, ieee — see slug_registry) answers null like
// any other miss. The resolver lives in lib/resolve (getDocumentBySlug).

const keyRoute = createRoute({
  method: "get",
  path: "/v3/documents/{key}",
  request: {
    params: z.object({ key: z.string().min(1) }),
    query: z.object({ format: z.enum(["json", "xml", "yaml"]).optional() }),
  },
  responses: {
    200: { description: "The document in the negotiated representation", content: { "*/*": { schema: z.any() } } },
    304: { description: "Not modified (ETag match)" },
    404: { description: "Unknown key", content: { "application/problem+json": { schema: z.any() } } },
    406: { description: "XML requested but no bibdata XML is stored", content: { "application/problem+json": { schema: z.any() } } },
  },
});

const collectionRoute = createRoute({
  method: "get",
  path: "/v3/documents",
  request: {
    query: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      flavor: z.string().optional(),
      year: z.coerce.number().int().optional(),
      doctype: z.string().optional(),
      status: z.string().optional(),
      q: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "A page of documents, key-ordered, with a Link header when more remain",
      content: { "application/json": { schema: z.any() } },
    },
  },
});

const flavorsRoute = createRoute({
  method: "get",
  path: "/v3/flavors",
  responses: {
    200: {
      description: "Per-flavor coverage",
      content: { "application/json": { schema: z.any() } },
    },
  },
});

const versionRoute = createRoute({
  method: "get",
  path: "/v3/version",
  responses: {
    200: { description: "Release and model versions", content: { "application/json": { schema: z.any() } } },
  },
});

const graphRoute = createRoute({
  method: "get",
  path: "/v3/documents/{key}/graph",
  request: {
    params: z.object({ key: z.string().min(1) }),
    query: z.object({
      depth: z.coerce.number().int().min(1).max(4).optional(),
      types: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "The relation graph around the document: nodes (resolved documents and external targets) and typed edges", content: { "application/json": { schema: z.any() } } },
    404: { description: "Unknown key", content: { "application/problem+json": { schema: z.any() } } },
  },
});

const chainRoute = createRoute({
  method: "get",
  path: "/v3/citations/{key}/chain",
  request: {
    params: z.object({ key: z.string().min(1) }),
  },
  responses: {
    200: { description: "The edition chain: the document, its ancestors and its descendants along the structural relation types, date-ordered", content: { "application/json": { schema: z.any() } } },
    404: { description: "Unknown key", content: { "application/problem+json": { schema: z.any() } } },
  },
});

const facetsRoute = createRoute({
  method: "get",
  path: "/v3/documents/facets",
  request: {
    query: z.object({
      q: z.string().optional(),
      flavor: z.string().optional(),
      year: z.coerce.number().int().optional(),
      doctype: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "Per-field value counts for the current query — the drill-down filters", content: { "application/json": { schema: z.any() } } },
  },
});

export const v3Routes = new OpenAPIHono<AppEnv>();

function decodeCursor(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return undefined as unknown as string;
  }
}

function encodeCursor(key: string): string {
  return btoa(key).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

v3Routes.openapi(facetsRoute, async (c) => {
  const q = c.req.valid("query");
  const conditions: string[] = [];
  const binds: (string | number)[] = [];
  const bind = (v: string | number): string => `?${binds.push(v)}`;
  if (q.flavor) conditions.push(`flavor = ${bind(q.flavor)}`);
  if (q.year) conditions.push(`year = ${bind(q.year)}`);
  if (q.doctype) conditions.push(`doctype = ${bind(q.doctype)}`);
  if (q.q) conditions.push(`(title LIKE ${bind(`%${q.q}%`)} OR docid LIKE ${bind(`%${q.q}%`)})`);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const withWhere = conditions.length ? `${where} AND` : "WHERE";
  const facetOf = async (column: string) =>
    (await c.env.DB.prepare(
      `SELECT ${column} AS value, COUNT(*) AS n FROM documents_search ${withWhere} ${column} IS NOT NULL GROUP BY ${column} ORDER BY n DESC LIMIT 15`,
    ).bind(...binds).all<{ value: string | number; n: number }>()).results ?? [];
  const [publisher, doctype, flavor, years] = await Promise.all([
    facetOf("publisher"),
    facetOf("doctype"),
    facetOf("flavor"),
    facetOf("year"),
  ]);
  return c.json({
    facets: { publisher, doctype, flavor, year: years },
  });
});

v3Routes.openapi(keyRoute, async (c) => {
  const { key } = c.req.valid("param");
  const { format } = c.req.valid("query");
  // Exact key first; then the normalized lookup token (doc_keys carries
  // the dataset's normKey forms), then the hyphen-stripped form — "rfc 8446"
  // and "RFC-8446" resolve like "RFC 8446" does (site issue #26). Last, the
  // pubid-scheme slug form (relaton#441): "/"-joined segments parse back to
  // the identifier structurally, and the identifier's canonical render runs
  // the same resolution chain. The slug parse is engine-free (pure schema
  // decode), so it is worker-safe; anything that is not a canonical slug
  // raises and answers null like any other miss.
  const keyText = decodeURIComponent(key);
  const doc = (await getDocument(c.env.DB, keyText))
    ?? (await getDocumentByLookupKey(c.env.DB, normKey(keyText)))
    ?? (await getDocumentByLookupKey(c.env.DB, normKey(keyText).replace(/-/g, "")))
    ?? (await getDocumentByDocid(c.env.DB, keyText))
    ?? (await getDocumentBySlug(c.env.DB, keyText));
  if (!doc) return problem(c, 404, "Not Found", `unknown key ${keyText}`);

  const type = negotiate(c.req.header("Accept"), format);

  // Edge cache (TODO.api/03): keyed on the resolved canonical key, the
  // row's indexed_at (the key version) and the negotiated representation —
  // query-string spellings of the same document share one entry. A cache
  // hit skips the R2 read, the YAML serialization and the ETag hashing.
  // caches.default is a Cloudflare extension absent from the DOM lib types
  // (same cast as the cloud store entry pages).
  const edge = (caches as unknown as { default: Cache }).default;
  const cacheKeyOf = (doc_: StorageV2Doc, type_: string): Request => {
    // Canonical path, not the request's: every spelling of the key that
    // resolves to this document shares one entry.
    const url = new URL(c.req.url);
    url.pathname = `/v3/documents/${encodeURIComponent(doc_.key)}`;
    url.search = "";
    url.searchParams.set("v", doc_.indexedAt);
    url.searchParams.set("f", type_);
    return new Request(url.toString(), { method: "GET" });
  };

  if (c.req.method === "GET" || c.req.method === "HEAD") {
    try {
      const hit = await edge.match(cacheKeyOf(doc, type));
      if (hit) {
        const etag = hit.headers.get("ETag")!;
        const caching = { ETag: etag, "Cache-Control": IMMUTABLE, "X-Relaton-Cache": "hit" };
        if (ifNoneMatchSatisfied(c.req.header("If-None-Match"), etag)) return c.body(null, 304, caching);
        if (c.req.method === "HEAD") return c.body(null, 200, caching);
        const served = new Response(hit.body, hit);
        served.headers.set("X-Relaton-Cache", "hit");
        return served;
      }
    } catch { /* cache unavailable in this runtime — build normally */ }
  }

  let body: string;
  if (type === XML_TYPE) {
    const obj = await c.env.BUCKET.get(blobKeyOf(doc.flavor, doc.file));
    if (!obj) {
      return problem(c, 406, "Not Acceptable", `no bibdata XML stored for ${doc.key}`);
    }
    body = await obj.text();
  } else if (type === YAML_TYPE) {
    body = yamlOf(doc.data);
  } else {
    body = JSON.stringify(doc.data);
  }

  const etag = await etagOf(body);
  const caching = { ETag: etag, "Cache-Control": IMMUTABLE, "X-Relaton-Cache": "miss" };
  if (ifNoneMatchSatisfied(c.req.header("If-None-Match"), etag)) {
    return c.body(null, 304, caching);
  }
  if (c.req.method === "HEAD") {
    // Cache the body-ful entry so later GETs and HEADs hit; answer headers only.
    try {
      c.executionCtx.waitUntil(edge.put(cacheKeyOf(doc, type), new Response(body, {
        headers: { "Content-Type": type, ETag: etag, "Cache-Control": IMMUTABLE },
      })));
    } catch { /* no execution context — skip caching */ }
    return c.body(null, 200, caching);
  }
  const served = c.body(body, 200, { "Content-Type": type, ...caching });
  try {
    c.executionCtx.waitUntil(edge.put(cacheKeyOf(doc, type), new Response(body, {
      headers: served.headers,
    })));
  } catch { /* no execution context — skip caching */ }
  return served;
});

v3Routes.openapi(collectionRoute, async (c) => {
  const q = c.req.valid("query");
  const limit = q.limit ?? 25;
  const cursor = decodeCursor(q.cursor);
  if (cursor === (undefined as unknown as string)) {
    return problem(c, 422, "Unprocessable Content", "cursor is not a valid token");
  }

  const rows = await searchDocumentPages(c.env.DB, {
    cursor, limit,
    flavor: q.flavor, year: q.year ?? null, doctype: q.doctype,
    status: q.status, q: q.q,
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const { titleOf, primaryOf } = await pageSummaries(c.env.DB, page.map((r) => r.key));

  const items = page.map((r) => ({
    key: r.key,
    flavor: r.flavor,
    docid: primaryOf.get(r.key) ?? null,
    title: titleOf.get(r.key) ?? null,
    api: `/v3/documents/${encodeURIComponent(r.key)}`,
  }));

  // The identifier-grade fuzzy lane (#165): identifier queries are short,
  // structured, and typo-prone. When the LIKE lanes come back sparse, the
  // trigram index serves indexed substring/ranked hits (with match
  // highlights) deduped below the exact hits, so it never pollutes them.
  let fuzzy: { key: string; flavor: string; docid: string; title: string | null; highlight: string }[] = [];
  if (q.q && q.q.length >= 3 && items.length < limit) {
    // Phrase-quoted (wave-1 follow-up): a bare `ISO 9001:2015` reads as an
    // FTS5 column filter and 500s the lane — the resolve endpoint already
    // quotes its MATCH input for the same reason.
    const phrase = `"${q.q.replaceAll('"', '""')}"`;
    const matches = await c.env.DB.prepare(
      `SELECT s.key, s.flavor, s.docid, s.title,
              snippet(documents_search_trigram, -1, '<mark>', '</mark>', '…', 12) AS highlight
       FROM documents_search_trigram t
       JOIN documents_search s ON s.rowid = t.rowid
       WHERE documents_search_trigram MATCH ?
       ORDER BY rank LIMIT ?`,
    ).bind(phrase, limit * 2).all<{
      key: string; flavor: string; docid: string; title: string; highlight: string;
    }>();
    const seen = new Set(items.map((i) => i.key));
    fuzzy = (matches.results ?? [])
      .filter((m) => !seen.has(m.key))
      .slice(0, limit)
      .map((m) => ({ key: m.key, flavor: m.flavor, docid: m.docid, title: m.title, highlight: m.highlight }));
  }

  const headers: Record<string, string> = {};
  if (hasMore && page.length) {
    const next = new URL(c.req.url);
    next.searchParams.set("cursor", encodeCursor(page[page.length - 1]!.key));
    next.searchParams.set("limit", String(limit));
    headers.Link = `<${next.pathname}${next.search}>; rel="next"`;
  }
  return c.json(
    { items, fuzzy_hits: fuzzy, next_cursor: hasMore ? encodeCursor(page[page.length - 1]!.key) : null },
    200,
    headers,
  );
});

v3Routes.openapi(flavorsRoute, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT flavor, repo, last_modified, indexed_at, doc_count FROM flavors_v2 ORDER BY flavor",
  ).all();
  return c.json({ flavors: results ?? [] });
});

v3Routes.openapi(versionRoute, async (c) => {
  const release = c.env.API_VERSION ?? "dev";
  const relaton = (await c.env.DB.prepare(`SELECT value FROM meta WHERE key = 'relaton_version'`).first<{ value: string }>())?.value ?? "data-repos";
  return c.json({ release, relaton });
});


// --- citation graph ----------------------------------------------------

// The structural relation types that carry edition semantics. The cites
// family is noise for a graph walk.
const STRUCTURAL_TYPES = ["amends", "updates", "corrigends", "adoptedFrom", "derivedFrom"];

type GraphNode = { key: string; flavor: string; docid: string; title: string | null; year: number | null };
type GraphEdge = { from: string; type: string; to: string; external?: boolean };

async function resolveDocids(db: D1Database, keys: string[], docids: string[]): Promise<Map<string, GraphNode>> {
  const out = new Map<string, GraphNode>();
  const keyList = keys.filter((k) => k.length > 0);
  const docidList = docids.filter((d) => d.length > 0);
  if (!keyList.length && !docidList.length) return out;
  const keyBind = keyList.map(() => "?").join(",");
  const docidBind = docidList.map(() => "?").join(",");
  const where = [
    ...keyList.map(() => "key = ?"),
    ...docidList.map(() => "docid = ?"),
  ].join(" OR ");
  const binds = [...keyList, ...docidList];
  const res = await db.prepare(`SELECT key, flavor, docid, title, year FROM documents_search WHERE ${where}`).bind(...binds).all<{
    key: string; flavor: string; docid: string; title: string; year: number | null;
  }>();
  for (const r of res.results ?? []) {
    out.set(r.key, { key: r.key, flavor: r.flavor, docid: r.docid ?? "", title: r.title, year: r.year });
    if (r.docid) out.set(r.docid, out.get(r.key)!);
  }
  return out;
}

async function walkGraph(
  db: D1Database,
  rootKey: string,
  rootDocid: string,
  depth: number,
  types: string[] | null,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; externals: string[] }> {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const externals = new Set<string>();
  const visited = new Set<string>([rootKey]);
  let frontier: { key: string; docid: string }[] = [{ key: rootKey, docid: rootDocid }];

  for (let level = 0; level < depth && frontier.length; level++) {
    const statements = frontier.map((f) => {
      const stmts = [
        db.prepare("SELECT type, target FROM relations WHERE document = ?").bind(f.key),
      ];
      if (f.docid) stmts.push(db.prepare("SELECT document, type FROM relations WHERE target = ?").bind(f.docid));
      return stmts;
    }).flat();
    const results = await db.batch(statements);

    const nextKeys: string[] = [];
    const nextDocids: string[] = [];
    frontier.forEach((f, i) => {
      const out = results[i * 2]?.results as { type: string; target: string }[] | undefined;
      const inc = results[i * 2 + 1]?.results as { document: string; type: string }[] | undefined;
      for (const r of out ?? []) {
        if (types && !types.includes(r.type)) continue;
        if (!r.target) continue;
        const edgeKey = `${f.key}|${r.type}|${r.target}`;
        if (!edges.has(edgeKey)) edges.set(edgeKey, { from: f.key, type: r.type, to: r.target });
        nextKeys.push(r.target);
        nextDocids.push(r.target);
      }
      for (const r of inc ?? []) {
        if (types && !types.includes(r.type)) continue;
        const edgeKey = `${r.document}|${r.type}|${f.key}`;
        if (!edges.has(edgeKey)) edges.set(edgeKey, { from: r.document, type: r.type, to: f.key });
        nextKeys.push(r.document);
      }
    });

    const fresh = nextKeys.filter((k) => !visited.has(k));
    const resolved = await resolveDocids(db, [...new Set([...fresh, ...nextDocids])], [...new Set(nextDocids)]);
    for (const [anchor, node] of resolved) {
      if (!nodes.has(anchor)) nodes.set(anchor, node);
      if (!nodes.has(node.key)) nodes.set(node.key, node);
    }
    frontier = [];
    for (const k of fresh) {
      const node = resolved.get(k) ?? resolved.get([...resolved.keys()].find((a) => resolved.get(a)!.key === k) ?? "");
      if (!node) {
        // a target that resolves to no stored document: an external reference
        externals.add(k);
        continue;
      }
      if (visited.has(node.key)) continue;
      visited.add(node.key);
      frontier.push({ key: node.key, docid: node.docid });
    }
  }
  return { nodes: [...nodes.values()].filter((n, i, all) => all.findIndex((m) => m.key === n.key) === i), edges: [...edges.values()], externals: [...externals] };
}

v3Routes.openapi(graphRoute, async (c) => {
  const { key } = c.req.valid("param");
  const { depth, types } = c.req.valid("query");
  const keyText = decodeURIComponent(key);
  const doc = (await getDocument(c.env.DB, keyText))
    ?? (await getDocumentByLookupKey(c.env.DB, normKey(keyText)))
    ?? (await getDocumentByDocid(c.env.DB, keyText));
  if (!doc) return problem(c, 404, "Not Found", `unknown key ${keyText}`);

  const docid = (await c.env.DB.prepare(
    "SELECT docid FROM documents_search WHERE key = ?",
  ).bind(doc.key).first<{ docid: string }>())?.docid ?? "";

  const typeList = types ? types.split(",").map((t) => t.trim()).filter(Boolean) : null;
  const graph = await walkGraph(c.env.DB, doc.key, docid, depth ?? 2, typeList);
  return c.json({
    root: { key: doc.key, flavor: doc.flavor },
    depth: depth ?? 2,
    nodes: graph.nodes,
    edges: graph.edges,
    external: graph.externals,
  });
});

v3Routes.openapi(chainRoute, async (c) => {
  const { key } = c.req.valid("param");
  const keyText = decodeURIComponent(key);
  const doc = (await getDocument(c.env.DB, keyText))
    ?? (await getDocumentByLookupKey(c.env.DB, normKey(keyText)))
    ?? (await getDocumentByDocid(c.env.DB, keyText));
  if (!doc) return problem(c, 404, "Not Found", `unknown key ${keyText}`);

  const docid = (await c.env.DB.prepare(
    "SELECT docid FROM documents_search WHERE key = ?",
  ).bind(doc.key).first<{ docid: string }>())?.docid ?? "";

  const graph = await walkGraph(c.env.DB, doc.key, docid, 4, ["amends", "updates", "corrigends"]);
  const seen = new Set<string>();
  const chain = [
    { key: doc.key, docid, year: null },
    ...graph.nodes
      .filter((n) => !seen.has(n.key) && seen.add(n.key))
      .map((n) => ({ key: n.key, docid: n.docid, year: n.year })),
  ].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
  return c.json({ root: { key: doc.key }, chain });
});

// --- ranked search (epic #175, issue #179) -------------------------------
// Hybrid retrieval under the published rank contract
// (docs/search-rank-contract.md, lib/rank): the identifier pin, then a
// weighted reciprocal-rank fusion of the keyword (FTS5 bm25), trigram and
// semantic (Vectorize) lanes. /v3/documents stays the key-ordered listing;
// this is the relevance-ordered surface. Each item carries its rank per
// lane, so the order explains itself.

const searchRoute = createRoute({
  method: "get",
  path: "/v3/search",
  request: {
    query: z.object({
      q: z.string().min(1),
      flavor: z.string().optional(),
      doctype: z.string().optional(),
      status: z.string().optional(),
      year: z.coerce.number().int().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
      semantic: z.enum(["0", "1", "false", "true"]).optional(),
    }),
  },
  responses: {
    200: {
      description: `Relevance-ranked documents under rank contract ${RANK_CONTRACT.version}, with per-lane ranks, a Link header while the ranked window has more`,
      content: { "application/json": { schema: z.any() } },
    },
    422: { description: "Blank query or malformed cursor", content: { "application/problem+json": { schema: z.any() } } },
  },
});

// The cursor is an offset inside the ranked window, tagged with the
// contract version: a cursor minted under another contract is refused
// rather than paging a differently-ordered list.
function encodeSearchCursor(offset: number): string {
  return encodeCursor(`${RANK_CONTRACT.version}:${offset}`);
}

function decodeSearchCursor(raw: string | undefined): number | null | undefined {
  if (!raw) return 0;
  const text = decodeCursor(raw);
  const m = typeof text === "string" ? /^(\d+\.\d+\.\d+):(\d+)$/.exec(text) : null;
  if (!m || m[1] !== RANK_CONTRACT.version) return undefined;
  const offset = Number(m[2]);
  return offset < RANK_CONTRACT.window ? offset : null;
}

v3Routes.openapi(searchRoute, async (c) => {
  const q = c.req.valid("query");
  const text = q.q.trim();
  if (!text) return problem(c, 422, "Unprocessable Content", "q is required");
  const offset = decodeSearchCursor(q.cursor);
  if (offset === undefined) {
    return problem(c, 422, "Unprocessable Content", "cursor is not a valid token for this rank contract");
  }
  const limit = q.limit ?? 25;
  const bindings = c.env as unknown as { AI?: Ai; VECTORIZE?: VectorizeIndex };
  const semanticEnv = bindings.AI && bindings.VECTORIZE ? { AI: bindings.AI, VECTORIZE: bindings.VECTORIZE } : undefined;

  const result = offset === null
    ? { items: [], semantic: false, nextOffset: null, facets: {} }
    : await rankedSearch(c.env.DB, semanticEnv, {
      q: text, flavor: q.flavor, doctype: q.doctype, status: q.status, year: q.year ?? null,
      semantic: q.semantic === undefined ? true : q.semantic === "1" || q.semantic === "true",
      limit, offset,
    });

  const nextCursor = result.nextOffset === null ? null : encodeSearchCursor(result.nextOffset);
  const headers: Record<string, string> = {};
  if (nextCursor) {
    const next = new URL(c.req.url);
    next.searchParams.set("cursor", nextCursor);
    next.searchParams.set("limit", String(limit));
    headers.Link = `<${next.pathname}${next.search}>; rel="next"`;
  }
  return c.json({
    rank_contract: RANK_CONTRACT.version,
    q: text,
    semantic: result.semantic,
    items: result.items.map((h) => ({ ...h, api: `/v3/documents/${encodeURIComponent(h.key)}` })),
    facets: result.facets,
    next_cursor: nextCursor,
  }, 200, headers);
});

// --- resolve (epic #175, issue #176) -------------------------------------
// Any identifier string → parsed components + ranked canonical candidates.
// Discovery, never authority (relaton#535): the candidates are pointers
// into the index at their best resolution tier, not bibliographic answers.
// A grammar miss is recorded for the pubid-grammar backlog — every
// unparseable query here is a consumer-side grammar-round candidate
// (the relaton#604 loop, closed from the front).

const resolveRoute = createRoute({
  method: "get",
  path: "/v3/resolve",
  request: {
    query: z.object({
      q: z.string().min(1),
      flavor: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "Parsed components and ranked candidates", content: { "application/json": { schema: z.any() } } },
    422: { description: "Missing query", content: { "application/problem+json": { schema: z.any() } } },
  },
});

v3Routes.openapi(resolveRoute, async (c) => {
  const { q, flavor } = c.req.valid("query");
  const trimmed = q.trim();
  if (!trimmed) return problem(c, 422, "Unprocessable Content", "q is required");

  const { ok, parsed } = parseComponents(trimmed, flavor);
  const cands: ResolveCandidate[] = (await identifierCandidates(c.env.DB, trimmed))
    .map((d) => ({ key: d.key, flavor: d.flavor, docid: "", title: null, match: d.tier }));

  // The lanes that read the search projection directly: docid substring,
  // then the trigram lane when the exact lanes came up sparse.
  const like = await c.env.DB.prepare(
    "SELECT key, flavor FROM documents_search WHERE docid LIKE ? LIMIT 10",
  ).bind(`%${trimmed}%`).all<{ key: string; flavor: string }>();
  for (const r of like.results ?? []) cands.push({ key: r.key, flavor: r.flavor, docid: "", title: null, match: "substring" });
  if (cands.length < 5 && trimmed.length >= 3) {
    // Phrase-quoted: FTS5 reads a bare `ISO 9001:2015` as a column filter
    // and 500s. The collection route's fuzzy lane carries the same latent
    // crash for colon'd queries — flagged for its own fix.
    const phrase = `"${trimmed.replaceAll('"', '""')}"`;
    const fuzzy = await c.env.DB.prepare(
      `SELECT s.key, s.flavor FROM documents_search_trigram t
       JOIN documents_search s ON s.rowid = t.rowid
       WHERE documents_search_trigram MATCH ? ORDER BY rank LIMIT 10`,
    ).bind(phrase).all<{ key: string; flavor: string }>();
    for (const r of fuzzy.results ?? []) cands.push({ key: r.key, flavor: r.flavor, docid: "", title: null, match: "fuzzy" });
  }

  const deduped = dedupeCandidates(cands);
  const { titleOf, primaryOf } = await pageSummaries(c.env.DB, deduped.map((d) => d.key));
  for (const d of deduped) {
    d.title = titleOf.get(d.key) ?? null;
    d.docid = primaryOf.get(d.key) ?? "";
  }

  if (!ok) {
    // Grammar-miss telemetry: the consumer-side feed into the pubid-grammar
    // rounds. Fail-soft like every observability write.
    logEvent("resolve_grammar_miss", { q: trimmed, flavor: flavor ?? null });
    try {
      (c.env as { AE?: AnalyticsEngineDataset }).AE?.writeDataPoint({
        indexes: ["resolve_miss"],
        blobs: [trimmed, flavor ?? ""],
        doubles: [1],
      });
    } catch { /* AE absent — the structured log carries the signal */ }
  }

  return c.json({
    input: trimmed,
    flavor: flavor ?? null,
    parse_ok: ok,
    parsed: parsed ?? null,
    candidates: deduped,
  });
});

// --- timeline (epic #175, issue #178) -------------------------------------
// The edition / amendment / supersedence history, derived from the stored
// relation edges — no new data model, no ingest change. Classification and
// ordering live in lib/timeline; this handler only resolves the documents
// at both ends of every edge.

const timelineRoute = createRoute({
  method: "get",
  path: "/v3/documents/{key}/timeline",
  request: {
    params: z.object({ key: z.string().min(1) }),
  },
  responses: {
    200: { description: "Ordered events: the publication plus every stored relation edge around the document, date-ordered", content: { "application/json": { schema: z.any() } } },
    404: { description: "Unknown key", content: { "application/problem+json": { schema: z.any() } } },
  },
});

v3Routes.openapi(timelineRoute, async (c) => {
  const { key } = c.req.valid("param");
  const keyText = decodeURIComponent(key);
  const doc = (await getDocument(c.env.DB, keyText))
    ?? (await getDocumentByLookupKey(c.env.DB, normKey(keyText)))
    ?? (await getDocumentByDocid(c.env.DB, keyText));
  if (!doc) return problem(c, 404, "Not Found", `unknown key ${keyText}`);

  const row = await c.env.DB.prepare(
    "SELECT docid, year, title FROM documents_search WHERE key = ?",
  ).bind(doc.key).first<{ docid: string; year: number | null; title: string | null }>();
  const docid = row?.docid ?? "";

  const [out, inc] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT type, target FROM relations WHERE document = ?").bind(doc.key),
    c.env.DB.prepare("SELECT document, type FROM relations WHERE target = ?").bind(docid),
  ]);
  const outRel = (out?.results ?? []) as { type: string; target: string }[];
  const incRel = (inc?.results ?? []) as { document: string; type: string }[];

  const nodes = await resolveDocids(
    c.env.DB,
    [...outRel.map((r) => r.target), ...incRel.map((r) => r.document)],
    [...outRel.map((r) => r.target), ...incRel.map((r) => r.document)],
  );
  const rootNode: TimelineNode = {
    key: doc.key,
    docid,
    year: row?.year ?? null,
    title: row?.title ?? null,
  };
  const events = buildTimeline(rootNode, outRel, incRel, nodes);
  return c.json({ root: { key: doc.key }, count: events.length, events });
});

// --- cite (epic #175, issue #177) ------------------------------------------
// Any record (by key or inline) + style → the correct citation string.
// The rendering lives entirely in the relaton-ts renderers — the worker
// adds no rendering logic of its own (the parity laws live there).

const citeRoute = createRoute({
  method: "post",
  path: "/v3/cite",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            key: z.string().optional(),
            record: z.any().optional(),
            style: z.string().optional(),
            lang: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "The formatted citation", content: { "application/json": { schema: z.any() } } },
    404: { description: "Unknown key", content: { "application/problem+json": { schema: z.any() } } },
    422: { description: "Provide key or record; unknown style", content: { "application/problem+json": { schema: z.any() } } },
  },
});

v3Routes.openapi(citeRoute, async (c) => {
  const { key, record, style: styleRaw, lang } = c.req.valid("json") as {
    key?: string; record?: Record<string, unknown>; style?: string; lang?: string;
  };
  const style = styleRaw ?? "iso690";
  if (!isCiteStyle(style)) {
    return problem(c, 422, "Unprocessable Content", `unsupported style ${style}; expected one of ${CITE_STYLES.join(", ")}`);
  }

  let data: Record<string, unknown> | undefined = record;
  if (!data && key) {
    const keyText = decodeURIComponent(key);
    const doc = (await getDocument(c.env.DB, keyText))
      ?? (await getDocumentByLookupKey(c.env.DB, normKey(keyText)))
      ?? (await getDocumentByDocid(c.env.DB, keyText));
    if (!doc) return problem(c, 404, "Not Found", `unknown key ${keyText}`);
    data = doc.data;
  }
  if (!data) return problem(c, 422, "Unprocessable Content", "provide a key or an inline record");

  const citation = renderCitation(data, style, lang);
  return c.json({ key: key ?? null, style, lang: lang ?? null, citation });
});

// --- validate (epic #175, issue #182) --------------------------------------
// A draft's references (a list, or a bibliography text with one reference
// per line) → one verdict per reference: parsed, resolved, current,
// superseded, correctly cited. The checks live in lib/validate.

const validateRoute = createRoute({
  method: "post",
  path: "/v3/validate",
  request: {
    query: z.object({ format: z.enum(["json", "markdown"]).optional() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            references: z.array(z.string()).optional(),
            text: z.string().optional(),
            style: z.string().optional(),
            lang: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "One verdict per reference (parsed, resolved, current, superseded, cited), plus a summary",
      content: {
        "application/json": { schema: z.any() },
        "text/markdown": { schema: z.string() },
      },
    },
    422: { description: "No references; too many references; unknown style", content: { "application/problem+json": { schema: z.any() } } },
  },
});

v3Routes.openapi(validateRoute, async (c) => {
  const { references: list, text, style, lang } = c.req.valid("json") as {
    references?: string[]; text?: string; style?: string; lang?: string;
  };
  const { format } = c.req.valid("query");
  if (style !== undefined && !isCiteStyle(style)) {
    return problem(c, 422, "Unprocessable Content", `unsupported style ${style}; expected one of ${CITE_STYLES.join(", ")}`);
  }
  const references = (list?.length ? list : splitReferences(text ?? ""))
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  if (references.length === 0) {
    return problem(c, 422, "Unprocessable Content", "provide references (a list) or text (one reference per line)");
  }
  if (references.length > MAX_REFERENCES) {
    return problem(c, 422, "Unprocessable Content", `at most ${MAX_REFERENCES} references per request (got ${references.length})`);
  }

  const report = await validateReferences(c.env.DB, references, {
    ...(style ? { style } : {}),
    ...(lang ? { lang } : {}),
  });
  const wantsMarkdown = format === "markdown"
    || (format === undefined && /text\/markdown/i.test(c.req.header("accept") ?? ""));
  if (wantsMarkdown) {
    return c.body(reportMarkdown(report), 200, { "content-type": "text/markdown; charset=utf-8" });
  }
  return c.json(report);
});
