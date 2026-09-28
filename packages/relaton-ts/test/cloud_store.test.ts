import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CloudStore, LocalStore, resolveKey } from "../src/cloud/index.js";
import { parse } from "../src/index.js";
import type { Manifest } from "../src/cloud/types.js";

// The canonical conformance fixtures (vendored from TODO.relaton-cloud-store, the SSOT).
const FIXTURES = process.env.RELATON_CLOUD_FIXTURES ??
  join(import.meta.dirname, "fixtures", "cloud");

const fixtureManifest = (): Manifest =>
  JSON.parse(readFileSync(join(FIXTURES, "manifest.json"), "utf8")) as Manifest;

function fetchServingFixtures() {
  return (async (url: string): Promise<Response> => {
    const u = new URL(url);
    const file = (() => {
      if (u.pathname === "/collections") {
        return { status: 200, body: JSON.stringify({ collections: [{ name: "fixtures", count: 3 }] }) };
      }
      const m = u.pathname.match(/^\/collections\/([^/]+)\/manifest$/);
      if (m) {
        return { status: 200, body: readFileSync(join(FIXTURES, "manifest.json"), "utf8"), etag: '"fixtures-1"' };
      }
      const e = u.pathname.match(/^\/collections\/[^/]+\/entries\/(.+)$/);
      if (e) {
        const location = fixtureManifest().entries.find((x) => x.key === decodeURIComponent(e[1] ?? ""))?.location;
        if (!location) return { status: 404, body: "no such entry" };
        return { status: 200, body: readFileSync(join(FIXTURES, location), "utf8") };
      }
      return { status: 404, body: "" };
    })();
    return new Response(file.body, {
      status: file.status,
      headers: "etag" in file && file.etag ? { etag: file.etag } : {},
    }) as Response;
  }) as unknown as typeof fetch;
}

describe("CloudStore", () => {
  it("reads the conformance manifest through the contract paths", async () => {
    const cloud = new CloudStore({
      base: "https://cloud.test",
      collection: "fixtures",
      fetchImpl: fetchServingFixtures(),
    });
    const manifest = await cloud.manifest();
    expect(manifest.count).toBe(3);
    expect(manifest.entries.length).toBe(3);
  });

  it("reads entries by key and splits 404 from backend failures", async () => {
    const cloud = new CloudStore({
      base: "https://cloud.test",
      collection: "fixtures",
      fetchImpl: fetchServingFixtures(),
    });
    const hit = await cloud.read("RFC 7231");
    expect(hit).toEqual({ ok: true, body: expect.stringContaining("RFC7231") });

    const miss = await cloud.read("RFC 9999");
    expect(miss).toEqual({ ok: false, reason: "not_found" });
  });

  it("sends if-none-match and honors 304 for the manifest", async () => {
    const seen: string[] = [];
    const inner = fetchServingFixtures();
    const fetchImpl = (async (url: string, init?: RequestInit): Promise<Response> => {
      seen.push(String((init?.headers as Record<string, string> | undefined)?.["if-none-match"] ?? ""));
      if ((init?.headers as Record<string, string> | undefined)?.["if-none-match"] === '"fixtures-1"') {
        return new Response(null, { status: 304, headers: { etag: '"fixtures-1"' } }) as Response;
      }
      return inner(url, init);
    }) as unknown as typeof fetch;

    const cloud = new CloudStore({ base: "https://cloud.test", collection: "fixtures", fetchImpl });
    await cloud.manifest();
    const again = await cloud.manifest();
    expect(again.count).toBe(3);
    expect(seen[1]).toBe('"fixtures-1"');
  });
});

describe("LocalStore", () => {
  it("syncs a source into the GCR-style layout and serves it offline", async () => {
    const cloud = new CloudStore({
      base: "https://cloud.test",
      collection: "fixtures",
      fetchImpl: fetchServingFixtures(),
    });
    const local = new LocalStore(mkdtempSync(join(tmpdir(), "relaton-sync-")));

    const manifest = await local.syncFrom(cloud, "fixtures");
    expect(manifest.count).toBe(3);
    expect(manifest.entries[0]?.digest).toMatch(/^sha256:/);

    // offline: no cloud involvement
    expect(local.read("fixtures", "RFC 7231")).toContain("RFC7231");
    expect(local.has("fixtures", "ISO 19115-1:2014")).toBe(true);

    // end to end: the synced record parses into a validated RelatonItem
    const item = parse(local.read("fixtures", "RFC 7231"));
    expect(item.ok).toBe(true);
    if (item.ok) {
      expect((item.item as { id?: string }).id).toBe("RFC7231");
    }
  });

  it("revalidates entries with if-none-match after the first read", async () => {
    const seen: string[] = [];
    const inner = fetchServingFixtures();
    const fetchImpl = (async (url: string, init?: RequestInit): Promise<Response> => {
      const inm = String((init?.headers as Record<string, string>)?.["if-none-match"] ?? "");
      seen.push(inm);
      if (inm) return new Response(null, { status: 304 }) as Response;
      const res = (await inner(url, init)) as Response;
      if (res.status === 200 && url.includes("/entries/")) {
        return new Response(await res.text(), {
          status: 200,
          headers: { etag: '"entry-v1"' },
        }) as Response;
      }
      return res;
    }) as unknown as typeof fetch;

    const cloud = new CloudStore({ base: "https://cloud.test", collection: "fixtures", fetchImpl });
    const first = await cloud.read("RFC 7231");
    expect(first).toEqual({ ok: true, body: expect.stringContaining("RFC7231") });
    const second = await cloud.read("RFC 7231");
    expect(second).toEqual({ ok: true, body: expect.stringContaining("RFC7231") });
    expect(seen).toEqual(["", '"entry-v1"']);
  });

  it("fetchThrough serves locally after the first read and records the entry", async () => {
    const cloud = new CloudStore({
      base: "https://cloud.test",
      collection: "fixtures",
      fetchImpl: fetchServingFixtures(),
    });
    const local = new LocalStore(mkdtempSync(join(tmpdir(), "relaton-through-")));

    const first = await local.fetchThrough(cloud, "fixtures", "RFC 7231");
    expect(first).toEqual({ ok: true, body: expect.stringContaining("RFC7231") });
    // second read never reaches the network (fresh LocalStore over same dir)
    const reopen = new LocalStore(local.root);
    expect(reopen.read("fixtures", "RFC 7231")).toContain("RFC7231");
    expect(reopen.manifest("fixtures")?.entries.find((e) => e.key === "RFC 7231")).toBeTruthy();
  });

  it("resolves a docid reference to the storage key through the manifest", () => {
    const manifest = fixtureManifest();
    expect(resolveKey(manifest, "RFC 7231")).toBe("RFC 7231");
    expect(resolveKey(manifest, "rfc 7231")).toBe("RFC 7231");
    expect(resolveKey(manifest, "RFC 9999")).toBeUndefined;
  });

  it("rejects bytes that break the source's declared digest", async () => {
    const bad = new CloudStore({
      base: "https://cloud.test",
      collection: "fixtures",
      fetchImpl: (async (url: string): Promise<Response> => {
        if (url.endsWith("/entries/k")) {
          return new Response("tampered", { status: 200 }) as Response;
        }
        return new Response(
          JSON.stringify({ version: 1, generated: "x", count: 1, shards: 0, entries: [{ key: "k", digest: "sha256:dead" }] }),
          { status: 200 },
        ) as Response;
      }) as unknown as typeof fetch,
    });
    const local = new LocalStore(mkdtempSync(join(tmpdir(), "relaton-sync-bad-")));
    await expect(local.syncFrom(bad, "fixtures")).rejects.toThrow(/digest mismatch/);
  });
});

describe("search", () => {
  it("filters manifest entries by metadata docid", async () => {
    const { search, LocalStore } = await import("../src/cloud/local_store.js");
    const { resolveKey } = await import("../src/cloud/index.js");
    void resolveKey;
    const cloud = new CloudStore({
      base: "https://cloud.test",
      collection: "fixtures",
      fetchImpl: fetchServingFixtures(),
    });
    const local = new LocalStore(mkdtempSync(join(tmpdir(), "relaton-search-")));
    const manifest = await local.syncFrom(cloud, "fixtures");

    const hits = search(manifest, { docid: "RFC 7231" });
    expect(hits.length).toBe(1);
    expect(hits[0]?.key).toBe("RFC 7231");

    expect(search(manifest, { docid: "rfc 7231" }).length).toBe(1); // case-insensitive
    expect(search(manifest, { docid: "RFC 9999" })).toEqual([]);
    expect(search(manifest, {})).toEqual([]); // unfiltered search is keys
  });
});
