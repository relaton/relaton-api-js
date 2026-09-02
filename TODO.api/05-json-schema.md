# 05 — Relaton JSON Schema (published contract for the JSON serialization)

Goal: a versioned JSON Schema for the API's JSON serialization, derived from
relaton-models, so consumers (SDOs, the site, CI) can validate responses.

## Tasks

- [ ] Generate `$id`-versioned JSON Schema from the model (Ruby models or
      relaton-py pydantic export → JSON Schema; pick the authoritative source
      with the maintainers, note in relaton#109).
- [ ] Ship schema at `/schema/relaton-{version}.json`; reference from
      OpenAPI 3.1 components.
- [ ] Validate v3 JSON responses against the schema in the API's own test
      suite and in the dataset repos' CI (crawler output validated before
      commit).

## Acceptance

- A consumer can `curl /v3/documents/rfc-8446 | validate relaton-1.5.json`.
- Ingest pipeline rejects schema-invalid documents before they reach D1.
