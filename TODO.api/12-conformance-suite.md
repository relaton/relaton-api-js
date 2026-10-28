# 12 — Shared conformance suite (the contract, executable)

Status (2026-10-29): first slice shipped (relaton-api-js#90) —
`packages/relaton-api/contract/fixtures.json` pins the stable surface
across the plan's edge cases (RFC↔STD, bare 3GPP, iana dataset alias,
copublished ISO/IEC undated, ETSI bare form, Cyrillic GOST, component
filters, 404 shape), `run.mjs` is a dependency-free node runner the Ruby
gem's CI executes unchanged, and the `contract` workflow runs a daily
production drift alarm plus a `workflow_call` smoke for the deployment
repo; relaton-api-ruby's CI already replays the same set. Remaining:
pin suites to released contract versions, and a wrangler-dev target.

Goal: one executable contract both implementations must pass; drift caught
in CI, not by users.

## Artifacts (published from relaton-api-js)

- `@relaton/api/contract`: OpenAPI 3.1 spec (generated from routes),
  JSON Schema for the Relaton JSON serialization (05), and a fixture set
  (keys, expected JSON, expected XML) sampled across flavors.

## Tasks

- [ ] Extract fixtures: keys per flavor incl. edge cases (RFC↔STD,
  3GPP bare release, copublisher orders, Cyrillic, undated/latest).
- [ ] Contract runner (plain node script, no framework): given a base URL,
  run all fixtures, verify status/headers/body-shape, exit non-zero on
  drift. Reusable by the gem's CI.
- [ ] Wire into: relaton-api-js CI (against wrangler dev), relaton-api-ruby
  CI (against rackup), deployment repo smoke (against production).
- [ ] Version pinning: suites run against the released contract version.

## Acceptance

A breaking change in either implementation fails its own CI before release;
both implementations pass the same fixture set at the same contract version.
