/**
 * Types of the lutaml cloud store contract (SSOT: the Manifest schema is
 * defined in TODO.relaton-cloud-store/fixtures/manifest.json and mirrored by
 * lutaml-store's Ruby `Lutaml::Store::Manifest`).
 */

export interface ManifestEntry {
  key: string;
  location?: string;
  digest?: string;
  shard?: number;
  metadata?: Record<string, unknown>;
}

export interface Manifest {
  version: number;
  generated: string;
  count: number;
  shards: number;
  entries: ManifestEntry[];
}

export interface CollectionInfo {
  name: string;
  count: number;
}

/** Definitive: the repository does not have this key. */
export interface NotFound {
  ok: false;
  reason: "not_found";
}

/** Non-definitive: transport failure or server error — retryable. */
export interface BackendFailure {
  ok: false;
  reason: "backend";
  detail?: string;
}

export type ReadResult = { ok: true; body: string } | NotFound | BackendFailure;
