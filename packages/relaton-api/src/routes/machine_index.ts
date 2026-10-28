import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../env";

// The machine-index contract: the same `index/manifest.json` +
// `index/shard-NNNNN.json` shape the relaton-data-* Pages sites publish,
// mirrored into R2 at ingest and served byte-for-byte. A relaton
// `ShardSource` treats this host as just another index host — a base-URL
// swap, no client changes: the manifest carries version/shards/count, a
// query reads exactly one shard keyed by crc32(root number) % shards, a
// missing shard is a definitive not-found, and If-None-Match revalidates
// against the object's ETag the way Pages does.

export const R2_INDEX_PREFIX = "index";
export const SHARD_RX = /^shard-\d{5}\.json$/;

async function serveObject(c: Context<AppEnv>, key: string): Promise<Response> {
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return c.text("Not found.", 404);

  const etag = obj.httpEtag;
  const matches = c.req.header("If-None-Match")?.split(",").map((t) => t.trim());
  if (matches?.includes(etag)) return c.body(null, 304, { ETag: etag });
  return c.body(obj.body, 200, { "Content-Type": "application/json", ETag: etag });
}

function indexKey(flavor: string, name: string): string {
  return `${R2_INDEX_PREFIX}/${flavor}/${name}`;
}

export const machineIndexRoutes = new Hono<AppEnv>();

// Hono answers HEAD with the GET handler, so one registration per path
// covers both the GET and the HEAD/If-None-Match revalidation.
machineIndexRoutes.get("/:flavor/index/manifest.json", (c) =>
  serveObject(c, indexKey(c.req.param("flavor"), "manifest.json")),
);

machineIndexRoutes.get("/:flavor/index/:shardName", async (c) => {
  const name = c.req.param("shardName");
  if (!SHARD_RX.test(name)) return c.text("Not found.", 404);
  return serveObject(c, indexKey(c.req.param("flavor"), name));
});
