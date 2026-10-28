import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

// The fixture bytes a Pages producer would publish: the exact strings the
// API must hand back, unmodified, for relaton's ShardSource to treat this
// host as just another index host.
const MANIFEST = JSON.stringify({
  version: 2,
  index: "index-v2",
  count: 2,
  shards: 16,
  key: "root-number",
  algorithm: "crc32",
  generated: "2026-10-28",
});
const SHARD_5 = JSON.stringify([
  { r: "ISO 1", file: "data/iso-1.yaml", id: { _type: "pubid:iso:international-standard", number: "1" } },
  { r: "ISO 2", file: "data/iso-2.yaml", id: { _type: "pubid:iso:international-standard", number: "2" } },
]);

function b64(s: string): string {
  return btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
}

function makeEnv() {
  const store = new Map<string, { raw: string; etag: string }>();
  const bucket = {
    put: async (key: string, value: Uint8Array) => {
      const raw = new TextDecoder().decode(value);
      let hash = 0;
      for (const byte of value) hash = ((hash * 31) + byte) >>> 0;
      store.set(key, { raw, etag: `"${hash.toString(16)}"` });
    },
    get: async (key: string) => {
      const obj = store.get(key);
      if (!obj) return null;
      return {
        body: obj.raw,
        text: async () => obj.raw,
        httpEtag: obj.etag,
      };
    },
  };
  return { store, env: { BUCKET: bucket, ADMIN_TOKEN: "sekrit", DB: {} } };
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function ingest(app: ReturnType<typeof createApp>, env: never, flavor: string): Promise<Response> {
  return app.request(
    `/admin/ingest/${flavor}/machine-index`,
    {
      method: "POST",
      headers: authHeaders("sekrit"),
      body: JSON.stringify({
        files: [
          { name: "manifest.json", body: b64(MANIFEST) },
          { name: "shard-00005.json", body: b64(SHARD_5) },
        ],
      }),
    },
    env,
  );
}

describe("machine-index contract", () => {
  it("rejects uploads without the admin token", async () => {
    const app = createApp({});
    const { env } = makeEnv();
    const res = await app.request(
      "/admin/ingest/iso/machine-index",
      { method: "POST", headers: authHeaders("wrong"), body: JSON.stringify({ files: [] }) },
      env as never,
    );
    expect(res.status).toBe(403);
  });

  it("rejects uploads with a non-shard, non-manifest name", async () => {
    const app = createApp({});
    const { env } = makeEnv();
    const res = await app.request(
      "/admin/ingest/iso/machine-index",
      {
        method: "POST",
        headers: authHeaders("sekrit"),
        body: JSON.stringify({ files: [{ name: "../evil.json", body: b64("{}") }] }),
      },
      env as never,
    );
    expect(res.status).toBe(400);
  });

  it("serves the manifest and shards byte-for-byte after ingest", async () => {
    const app = createApp({});
    const { env } = makeEnv();
    const up = await ingest(app, env as never, "iso");
    expect(up.status).toBe(200);

    const manifest = await app.request("/iso/index/manifest.json", {}, env as never);
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get("content-type")).toBe("application/json");
    expect(await manifest.text()).toBe(MANIFEST);

    const shard = await app.request("/iso/index/shard-00005.json", {}, env as never);
    expect(shard.status).toBe(200);
    expect(await shard.text()).toBe(SHARD_5);
  });

  it("answers 404 for a shard that was never ingested", async () => {
    const app = createApp({});
    const { env } = makeEnv();
    await ingest(app, env as never, "iso");
    const res = await app.request("/iso/index/shard-00006.json", {}, env as never);
    expect(res.status).toBe(404);
  });

  it("revalidates with If-None-Match and answers 304", async () => {
    const app = createApp({});
    const { env } = makeEnv();
    await ingest(app, env as never, "iso");

    const first = await app.request("/iso/index/manifest.json", {}, env as never);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();

    const revalidated = await app.request(
      "/iso/index/manifest.json",
      { headers: { "If-None-Match": etag! } },
      env as never,
    );
    expect(revalidated.status).toBe(304);
  });

  it("keeps flavors separate", async () => {
    const app = createApp({});
    const { env } = makeEnv();
    await ingest(app, env as never, "iso");
    const res = await app.request("/ietf/index/manifest.json", {}, env as never);
    expect(res.status).toBe(404);
  });

  it("serves a HEAD for the manifest", async () => {
    const app = createApp({});
    const { env } = makeEnv();
    await ingest(app, env as never, "iso");
    const res = await app.request("/iso/index/manifest.json", { method: "HEAD" }, env as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBeTruthy();
  });
});
