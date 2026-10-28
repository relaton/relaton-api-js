# 06 — Index contract across ALL relaton-data-* flavors

Status (2026-10-29): advanced — the ingest imports dataset keys
(relaton-api-js#88: fetcher-committed alias rows from the checkout's
committed index, indexed as `dataset` docids) and the ingest's
per-flavor string hacks are gone (relaton-api-js#87: bare variants are
structural pubid round-trips; the generator derives canonical and
further-docid alias rows — relaton/relaton#395). Remaining: the query
side (`lookup.ts` canonicalize) and retiring the derived-canonical pass
once every flavor's Pages index regenerates with alias rows.

Goal: every relaton-data-* repo ships the #109-style index (canonical id,
docid variants incl. cross-refs, title/year/doctype/status, file). The API's
per-flavor derivation code dies flavor by flavor.

## Tasks

- [ ] Extract the ietf `tools/build_index.rb` (from 01) into the relaton
      monorepo as the general `Relaton::Index` v2 generator — one PR to
      relaton/relaton closing the loop with #109 (maintainer: @andrew2net).
- [ ] Umbrella issue on relaton/relaton listing per-flavor rollout:
      iso, ieee, w3c, 3gpp, gost, bipm, iho, oiml, easc, iala, …
- [ ] Per flavor: add index generation to its crawler workflow, backfill
      `index.yaml/zip`, then delete the API-side derivation for that flavor
      (pubid_canonicals, bare-3gpp hack, gost variants, …).
- [ ] Special cases to encode in the index (not the API): 3GPP
      release-suffixed ids → bare variant keys; STD/BCP/FYI cross-refs;
      copublisher orders (ISO/IEC ↔ IEC).

## Acceptance

- `src/lib/normalize.ts` and every flavor special-case in the ingest builder
      are deleted; the Worker imports keys only.
- Each flavor's index regenerates in its own repo's CI on crawl.
