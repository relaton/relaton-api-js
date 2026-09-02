# 01 — IETF unified dataset (relaton/relaton#109 execution)

Goal: `relaton/relaton-data-ietf` becomes THE single repo for all IETF
streams in Relaton YAML, publishing one directly-importable index. Executes
https://github.com/relaton/relaton/issues/109 without waiting for the
gem-side `Relaton::Index` extension.

## Status (2026-08-17): unified branch built — 177,559 entries
(rfcs+rfcsubseries+ids+misc), RFC↔STD cross-refs verified, index 90MB
YAML / 7MB zip; push in flight. Remaining: API-side import switch.

## Tasks

- [x] Measure working-tree sizes of relaton-data-{rfcs,rfcsubseries,ids}
      tarballs. Decide full-copy vs index-only if the unified working tree
      would exceed ~2GB (report numbers; fallback documented in 00).
- [x] Branch `unified` in relaton-data-ietf (fresh clone).
- [x] Populate streams: `data/{rfcs,rfcsubseries,ids}/` copied verbatim from
      the type repos (v1.5.6 YAML, no conversion).
- [x] Bootstrap `data/misc/`: one-time upgrade of
      ietf-tools/relaton-data-misc (v1.2.3 → v1.5.6) via
      `Bib::HashParserV1` → `ItemData` → `to_yaml` (machinery exists in
      api workers `tools/build_ingest.rb`).
- [x] `tools/build_index.rb` in-repo: emits `index.yaml` + `index.zip` with
      the #109 entry schema (pubid-canonical id, docids[] variants incl.
      STD/BCP/FYI cross-injection from rfcsubseries, DOI variants, title,
      year, published, doctype, status, file). Ruby, gems from
      `relaton/relaton#main` + `pubid/pubid#main`.
- [x] `.github/workflows/aggregate.yml`: daily cron, lags source crawls —
      fast-forward stream subdirs, rebuild index, commit. Replaces legacy
      bibxml `crawler.yml`; drop `keep-alive.yml`.
- [x] Tag `bibxml-final` on master; PR `unified` → master (deletes
      `data/*.xml`; history retains blobs). README documents structure.
- [ ] Comment on relaton#109 linking the PR as the working reference.
- [ ] API: switch ietf ingest to index import (rows from entries; YAML→XML
      for R2 unchanged); delete `ietf_xml_meta` + `.xml` branch + variant
      surgery.

## Acceptance

- `index.zip` + `docids[]` sufficient for the API to answer every ietf query
  it can today, with API-side ietf derivation code deleted.
- `RFC 8446`, `RFC 3986`, `STD 66` resolve (3986/STD 66 → same record).
- Type repos, dataset names, bibxml-service, v2 gem: untouched.
