import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppEnv } from "../env";
import { renderCollections, renderEntry, wantsHtml, findEntryRow } from "./cloudstore_ui";
import { renderNotFound } from "./ui/chrome";
import { renderSearchPage } from "./search";

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
      description: "Collections published by this store (HTML for browsers, JSON for clients)",
      content: {
        "application/json": {
          schema: z.object({
            collections: z.array(z.object({ name: z.string(), count: z.number() })),
          }),
        },
        "text/html": { schema: z.string() },
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
    200: {
      description: "The record bytes (raw for clients, framed page for browsers)",
      content: {
        "text/plain": { schema: z.string() },
        "text/html": { schema: z.string() },
      },
    },
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
  // Browsers get the browsable index; API clients keep the JSON contract.
  if (wantsHtml(c.req.header("Accept"))) {
    return c.html(await renderCollections(c.env.DB), 200, {
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
    });
  }

  const { results } = await c.env.DB.prepare(
    "SELECT flavor, doc_count FROM flavors ORDER BY flavor",
  ).all<FlavorRow>();

  return c.json({
    collections: (results ?? []).map((f) => ({ name: f.flavor, count: f.doc_count })),
  });
});

// Browsable collection page: the shared search engine scoped to one flavor.
cloudStoreRoutes.get("/collections/:collection", async (c) => {
  const collection = c.req.param("collection");
  const flavor = await c.env.DB.prepare(
    "SELECT flavor FROM flavors WHERE flavor = ?",
  ).bind(collection).first();
  if (!flavor) {
    if (wantsHtml(c.req.header("Accept"))) {
      return c.html(renderNotFound({
        heading: "No such collection",
        detail: `${collection} is not one of the indexed collections.`,
        actions: [
          { label: "Browse the collections", href: "/collections" },
          { label: "Search everything", href: "/search" },
        ],
      }), 404, { "cache-control": "no-store" });
    }
    return c.text(`unknown collection: ${collection}`, 404);
  }
  const html = await renderSearchPage(c.env, c.env.DB, new URL(c.req.url), {
    scopeFlavor: collection,
    title: collection,
    activeNav: "collections",
  });
  return c.html(html, 200, {
    "cache-control": "public, max-age=60, stale-while-revalidate=3600",
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

  // Browsers get a framed record page (?raw=1 links the bytes); API
  // clients keep the raw response.
  if (wantsHtml(c.req.header("Accept")) && !c.req.query("raw")) {
    // Record pages are the heaviest HTML on the site (R2 fetch + parse +
    // full render), so the edge caches them for the freshness window.
    // The variant marker keeps the cache key distinct from the raw bytes.
    const variantUrl = new URL(c.req.url);
    variantUrl.searchParams.set("v", "html");
    // caches.default is a Cloudflare extension absent from the DOM lib types.
    const edge = (caches as unknown as { default: Cache }).default;
    try {
      const hit = await edge.match(new Request(variantUrl, { method: "GET" }));
      if (hit) return hit;
    } catch { /* cache unavailable in this runtime — render normally */ }

    const page = await renderEntry(
      c.env.DB, collection, key, false,
      (r2Key) => c.env.BUCKET.get(r2Key),
    );
    if (!page) {
      const bare = key.replace(/^data\//, "");
      return c.html(renderNotFound({
        heading: "No such record",
        detail: `${collection} has no entry ${bare}. Records appear here when the dataset is ingested.`,
        actions: [
          { label: `Search for ${bare}`, href: `/search?q=${encodeURIComponent(bare)}` },
          { label: `Browse ${collection}`, href: `/collections/${encodeURIComponent(collection)}` },
          { label: "All collections", href: "/collections" },
        ],
      }), 404, { "cache-control": "no-store" });
    }
    if ("html" in page) {
      // Record pages change only on ingest; a five-minute freshness window
      // with background revalidation keeps repeat visits instant.
      const res = c.html(page.html, 200, {
        "cache-control": "public, max-age=300, stale-while-revalidate=86400",
      });
      try {
        c.executionCtx.waitUntil(edge.put(new Request(variantUrl, { method: "GET" }), res.clone()));
      } catch { /* same as above */ }
      return res;
    }
    return c.text(page.body, 200, {
      "content-type": page.contentType,
      etag: `"${collection}/${key}"`,
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
    });
  }

  const row = await findEntryRow(c.env.DB, collection, key);
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
    "cache-control": "public, max-age=300, stale-while-revalidate=86400",
  });
});
