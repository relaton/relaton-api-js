import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppEnv } from "../env";

// The lutaml cloud store contract (spike distilled from this API and
// generalized; see TODO.relaton-cloud-store item 3):
//
//   GET /collections                          → { collections: [...] }
//   GET /collections/{c}/manifest             → Manifest JSON
//   GET /collections/{c}/entries/{key}        → record bytes (404 = definitive)
//
// A collection is one relaton flavor. Entry keys are the documents' primary
// docidentifiers, exactly as listed in the manifest — clients never guess a
// mapping between the listing and the fetch paths.

interface FlavorRow {
  flavor: string;
  doc_count: number;
  last_modified: string | null;
  ingested_at: string;
}

interface EntryRow {
  docid: string | null;
  r2_key: string;
}

const collectionsRoute = createRoute({
  method: "get",
  path: "/collections",
  responses: {
    200: {
      description: "Collections published by this store",
      content: {
        "application/json": {
          schema: z.object({
            collections: z.array(z.object({ name: z.string(), count: z.number() })),
          }),
        },
      },
    },
  },
});

const manifestRoute = createRoute({
  method: "get",
  path: "/collections/{collection}/manifest",
  request: {
    params: z.object({ collection: z.string().min(1) }),
  },
  responses: {
    200: { description: "The collection manifest", content: { "application/json": { schema: z.any() } } },
    404: { description: "Unknown collection", content: { "text/plain": { schema: z.string() } } },
  },
});

const entryRoute = createRoute({
  method: "get",
  path: "/collections/{collection}/entries/{key}",
  request: {
    params: z.object({ collection: z.string().min(1), key: z.string().min(1) }),
  },
  responses: {
    200: { description: "The record bytes", content: { "text/plain": { schema: z.string() } } },
    404: { description: "No such entry (definitive)", content: { "text/plain": { schema: z.string() } } },
  },
});

function contentTypeFor(key: string): string {
  if (key.endsWith(".json")) return "application/json";
  if (key.endsWith(".xml")) return "text/xml";
  return "application/yaml";
}

export const cloudStoreRoutes = new OpenAPIHono<AppEnv>();

cloudStoreRoutes.openapi(collectionsRoute, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT flavor, doc_count FROM flavors ORDER BY flavor",
  ).all<FlavorRow>();

  return c.json({
    collections: (results ?? []).map((f) => ({ name: f.flavor, count: f.doc_count })),
  });
});

cloudStoreRoutes.openapi(manifestRoute, async (c) => {
  const collection = c.req.param("collection");
  const flavor = await c.env.DB.prepare(
    "SELECT flavor, doc_count, last_modified, ingested_at FROM flavors WHERE flavor = ?",
  ).bind(collection).first<FlavorRow>();

  if (!flavor) {
    return c.text(`unknown collection: ${collection}`, 404);
  }

  const { results } = await c.env.DB.prepare(
    "SELECT r2_key, docid FROM documents WHERE flavor = ? ORDER BY r2_key",
  ).bind(collection).all<EntryRow>();

  const generated = flavor.last_modified ?? flavor.ingested_at;
  const manifest = {
    version: 1,
    generated,
    count: results?.length ?? 0,
    shards: 0,
    entries: (results ?? []).map((d) => ({
      key: d.r2_key.slice(collection.length + 1),
      metadata: d.docid ? { docid: d.docid } : {},
    })),
  };
  const etag = `"${collection}-v1-${generated}-${manifest.count}"`;

  return c.json(manifest, 200, { etag, "cache-control": "public, max-age=3600" });
});

cloudStoreRoutes.openapi(entryRoute, async (c) => {
  const collection = c.req.param("collection");
  const key = c.req.param("key");
  const row = await c.env.DB.prepare(
    "SELECT docid, r2_key FROM documents WHERE flavor = ? AND r2_key = ?",
  ).bind(collection, `${collection}/${key}`).first<EntryRow>();

  if (!row) {
    return c.text(`no such entry: ${key}`, 404);
  }

  const obj = await c.env.BUCKET.get(row.r2_key);
  if (!obj) {
    console.error(`cloud store: R2 miss for ${row.r2_key} (collection=${collection}, key=${key})`);
    return c.text(`no such entry: ${key}`, 404);
  }

  const body = await obj.text();
  return c.text(body, 200, {
    "content-type": contentTypeFor(row.r2_key),
    etag: `"${collection}/${key}"`,
  });
});
