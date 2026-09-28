/**
 * The local side of the uniform experience: a GCR-style package directory —
 * `manifest.json` + `entries/<percent-encoded key>` — written by syncFrom,
 * read back offline, byte-compatible with lutaml-store's Ruby Mirror#pull
 * (conformance fixtures pin the parity).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Manifest, ManifestEntry } from "./types.js";

export function encodeKey(key: string): string {
  return encodeURIComponent(key);
}

function sha256(body: string): string {
  return `sha256:${createHash("sha256").update(body, "utf8").digest("hex")}`;
}

export class LocalStore {
  readonly root: string;

  constructor(root: string) {
    this.root = root.replace(/\/+$/, "");
  }

  collectionDir(collection: string): string {
    return join(this.root, collection);
  }

  entriesDir(collection: string): string {
    return join(this.collectionDir(collection), "entries");
  }

  /**
   * Location of one key: the package manifest's declared location wins,
   * otherwise the single-segment convention `entries/<encoded key>` — the
   * same rule as lutaml-store's Ruby Source::Directory#path_for.
   */
  private entryPath(collection: string, key: string): string {
    const manifest = this.manifest(collection);
    const entry = manifest?.entries.find((e) => e.key === key);
    return join(this.collectionDir(collection), entry?.location ?? `entries/${encodeKey(key)}`);
  }

  /** Reads one entry; throws when absent — the caller decides what that means. */
  read(collection: string, key: string): string {
    return readFileSync(this.entryPath(collection, key), "utf8");
  }

  has(collection: string, key: string): boolean {
    return existsSync(this.entryPath(collection, key));
  }

  /**
   * Read-through: serve from this package, and on a miss fetch one key from
   * the source and store it (appending to the package manifest). The
   * TypeScript counterpart of Repository's read-through with an explicit
   * local package cache.
   */
  async fetchThrough(
    source: { manifest(): Promise<Manifest>; read(key: string): Promise<{ ok: true; body: string } | { ok: false; reason: string }> },
    collection: string,
    key: string,
  ): Promise<{ ok: true; body: string } | { ok: false; reason: string }> {
    const path = this.entryPath(collection, key);
    if (existsSync(path)) return { ok: true, body: readFileSync(path, "utf8") };

    const result = await source.read(key);
    if (!result.ok) return result;

    const digest = sha256(result.body);
    const location = `entries/${encodeKey(key)}`;
    mkdirSync(this.entriesDir(collection), { recursive: true });
    writeFileSync(join(this.collectionDir(collection), location), result.body, "utf8");

    const remote = await source.manifest();
    const declared = remote.entries.find((e) => e.key === key);
    if (declared?.digest && declared.digest !== digest) {
      throw new Error(`digest mismatch for ${key}: manifest declares ${declared.digest}`);
    }
    const entries = this.manifest(collection)?.entries ?? [];
    if (!entries.some((e) => e.key === key)) {
      entries.push({ key, location, digest, metadata: declared?.metadata });
    }
    const local: Manifest = {
      version: remote.version,
      generated: new Date().toISOString(),
      count: entries.length,
      shards: remote.shards,
      entries,
    };
    writeFileSync(
      join(this.collectionDir(collection), "manifest.json"),
      JSON.stringify(local, null, 2),
      "utf8",
    );
    return { ok: true, body: result.body };
  }

  manifest(collection: string): Manifest | null {
    const path = join(this.collectionDir(collection), "manifest.json");
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as Manifest;
  }

  /**
   * Pulls a source into the package. Incremental: entries whose local sha256
   * matches the source are not rewritten; a mismatch against the source's
   * declared digest is a hard error, never silently accepted.
   */
  async syncFrom(
    source: { manifest(): Promise<Manifest>; read(key: string): Promise<{ ok: true; body: string } | { ok: false; reason: string }> },
    collection: string,
    opts: { force?: boolean } = {},
  ): Promise<Manifest> {
    const remote = await source.manifest();
    mkdirSync(this.entriesDir(collection), { recursive: true });

    const entries: ManifestEntry[] = [];
    for (const entry of remote.entries) {
      const result = await source.read(entry.key);
      if (!result.ok) throw new Error(`source lost ${entry.key}: ${result.reason}`);

      const digest = sha256(result.body);
      if (entry.digest && entry.digest !== digest) {
        throw new Error(
          `digest mismatch for ${entry.key}: manifest declares ${entry.digest}, source returned ${digest}`,
        );
      }

      const location = entry.location ?? `entries/${encodeKey(entry.key)}`;
      const path = join(this.collectionDir(collection), location);
      if (opts.force || !existsSync(path) || readFileSync(path, "utf8") !== result.body) {
        writeFileSync(path, result.body, "utf8");
      }
      entries.push({ key: entry.key, location, digest, shard: entry.shard, metadata: entry.metadata });
    }

    const local: Manifest = {
      version: remote.version,
      generated: new Date().toISOString(),
      count: entries.length,
      shards: remote.shards,
      entries,
    };
    writeFileSync(
      join(this.collectionDir(collection), "manifest.json"),
      JSON.stringify(local, null, 2),
      "utf8",
    );
    return local;
  }
}

/**
 * Filters the collection's manifest entries by metadata key/values.
 * All given key/values must match (case-insensitive on strings) — the
 * TypeScript counterpart of lutaml-store's Repository#search.
 */
export function search(
  manifest: Manifest,
  filter: Record<string, string>,
): ManifestEntry[] {
  const keys = Object.keys(filter);
  if (keys.length === 0) return [];
  return manifest.entries.filter((entry) =>
    keys.every((k) => {
      const mv = entry.metadata?.[k];
      return typeof mv === "string"
        ? mv.toLowerCase() === filter[k]?.toLowerCase()
        : mv === filter[k];
    }),
  );
}
