/**
 * Client for the lutaml cloud store API (api.relaton.org is the reference
 * implementation). The TypeScript counterpart of lutaml-store's
 * Source::Rest: same paths, same explicit 404-vs-backend split, ETag/304
 * revalidation. `fetch` is injectable for tests — nothing is hidden.
 */
import type { CollectionInfo, Manifest, ReadResult } from "./types.js";

export interface CloudStoreOptions {
  base: string;
  collection: string;
  /** Injectable fetch (defaults to globalThis.fetch). */
  fetchImpl?: typeof fetch;
  /** Extra request headers (auth tokens and the like) — explicit only. */
  headers?: Record<string, string>;
}

interface WireResponse {
  status: number;
  body: string;
  etag?: string;
}

export class CloudStore {
  private readonly base: string;
  private readonly collection: string;
  private readonly fetchImpl: typeof fetch;
  private readonly headers: Record<string, string>;

  // Revalidation state (per instance, in memory — like lutaml-store's
  // in-process HttpCache).
  private manifestEtag?: string;
  private manifestBody?: string;
  private entryEtags = new Map<string, string>();
  private entryBodies = new Map<string, string>();

  constructor(opts: CloudStoreOptions) {
    if (!opts.base) throw new Error("CloudStore requires base");
    if (!opts.collection) throw new Error("CloudStore requires collection");
    this.base = opts.base.replace(/\/+$/, "");
    this.collection = opts.collection;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.headers = opts.headers ?? {};
  }

  async collections(): Promise<CollectionInfo[]> {
    const res = await this.wire(`${this.base}/collections`);
    if (res.status !== 200) throw new Error(`GET /collections failed: ${res.status}`);
    return (JSON.parse(res.body) as { collections: CollectionInfo[] }).collections;
  }

  async manifest(): Promise<Manifest> {
    const url = `${this.base}/collections/${encodeURIComponent(this.collection)}/manifest`;
    const headers = { ...this.headers };
    if (this.manifestEtag) headers["if-none-match"] = this.manifestEtag;

    const res = await this.wire(url, headers);
    if (res.status === 304 && this.manifestBody) {
      return JSON.parse(this.manifestBody) as Manifest;
    }
    if (res.status !== 200) {
      throw new Error(`manifest fetch failed: ${res.status} for ${url}`);
    }

    this.manifestEtag = res.etag;
    this.manifestBody = res.body;
    return JSON.parse(res.body) as Manifest;
  }

  /** The record's bytes; the split consumers care about is explicit. */
  async read(key: string): Promise<ReadResult> {
    const url = `${this.base}/collections/${encodeURIComponent(this.collection)}` +
      `/entries/${encodeURIComponent(key)}`;
    const headers = { ...this.headers };
    const etag = this.entryEtags.get(key);
    if (etag) headers["if-none-match"] = etag;

    const res = await this.wire(url, headers);
    if (res.status === 304 && this.entryBodies.has(key)) {
      return { ok: true, body: this.entryBodies.get(key)! };
    }
    if (res.status === 200) {
      if (res.etag) {
        this.entryEtags.set(key, res.etag);
        this.entryBodies.set(key, res.body);
      }
      return { ok: true, body: res.body };
    }
    if (res.status === 404) {
      this.entryEtags.delete(key);
      this.entryBodies.delete(key);
      return { ok: false, reason: "not_found" };
    }
    return { ok: false, reason: "backend", detail: `HTTP ${res.status}` };
  }

  private async wire(url: string, headers: Record<string, string> = {}): Promise<WireResponse> {
    const res = await this.fetchImpl(url, { headers });
    return {
      status: res.status,
      body: await res.text(),
      etag: res.headers.get("etag") ?? undefined,
    };
  }
}

/**
 * Resolves a reference to the collection's storage key. Contract keys are
 * URL-safe storage keys; slash-bearing docids travel in
 * entries[].metadata.docid. Exact storage-key match first, then docid
 * metadata (case-insensitive) — never path-encoding guesswork.
 */
export function resolveKey(manifest: Manifest, ref: string): string | undefined {
  if (manifest.entries.some((e) => e.key === ref)) return ref;
  const found = manifest.entries.find((e) => {
    const docid = e.metadata?.docid;
    return typeof docid === "string" && docid.toLowerCase() === ref.toLowerCase();
  });
  return found?.key;
}
