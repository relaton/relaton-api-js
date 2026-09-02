# 09 — relaton.org site integration with v3

Goal: the site's API page and demos consume v3 + GraphQL as first-class.

## Tasks

- [ ] `<ApiDemo />`: fetch `/v3/documents/{key}`, render structured JSON
      (titles/languages), format switcher (JSON/XML/YAML), 410-handling for
      old /api/v1 links.
- [ ] API page (PR #99 successor): v3 examples, GraphQL cross-flavor demo
      (drop-in query widget against /graphql), coverage from /v3/flavors.
- [ ] Flavors pages link "Query this flavor via the API" per flavor
      (`/v3/documents?flavor=iso`).
- [ ] Keep verified example codes (update list from live /v3 responses).

## Acceptance

- Site demos work against production v3 only; no /api/v1 references remain.
