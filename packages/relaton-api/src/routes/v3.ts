import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { dump as dumpYaml } from "js-yaml";
import type { AppEnv } from "../env";
import { getDocument, getDocumentByDocid, getDocumentByLookupKey, pageSummaries, searchDocumentPages, type StorageV2Doc } from "../lib/storage2";
// Deep path: self-contained and extension-free, loadable under plain node
// as well as the bundler (same import discipline produce.ts uses).
import { normKey } from "../pubid/keys.ts";
// The pubid-scheme slug resolver: the flavor-type registrations (worker-safe
// set) and the fs-free pubid-urn module. Deep import: the package root drags
// the corpus loader, which statically imports node:fs.
import { fromSlug } from "@pubid/pubid/dist/pubid-urn/index.js";
import "../lib/slug_registry";

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
// any other miss.
async function getDocumentBySlug(db: D1Database, keyText: string): Promise<StorageV2Doc | null> {
  if (!keyText.includes("/")) return null;
  let render: string;
  try {
    render = fromSlug(keyText).render();
  } catch {
    return null;
  }
  return (await getDocument(db, render))
    ?? (await getDocumentByLookupKey(db, normKey(render)))
    ?? (await getDocumentByLookupKey(db, normKey(render).replace(/-/g, "")))
    ?? (await getDocumentByDocid(db, render));
}

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

  const headers: Record<string, string> = {};
  if (hasMore && page.length) {
    const next = new URL(c.req.url);
    next.searchParams.set("cursor", encodeCursor(page[page.length - 1]!.key));
    next.searchParams.set("limit", String(limit));
    headers.Link = `<${next.pathname}${next.search}>; rel="next"`;
  }
  return c.json({ items, next_cursor: hasMore ? encodeCursor(page[page.length - 1]!.key) : null }, 200, headers);
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
