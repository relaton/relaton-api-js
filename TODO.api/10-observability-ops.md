# 10 — Observability and operations

Goal: production visibility and boring, documented ops.

## Tasks

- [ ] Workers Analytics Engine: queries/s, cache hit ratio (edge vs D1),
      p50/p95 latency per route; simple dashboard link in README.
- [ ] Structured logs (wrangler tail JSON) with key/flavor fields; alert on
      R2-miss rate (should be ~0 after ingest).
- [ ] Rate limiting: Cloudflare WAF rule or Workers rate-limit binding,
      generous public defaults; documented.
- [ ] Runbooks: rollback (delete Workers route id 823ce284…), re-ingest a
      flavor (post_chunks markers), rotate ADMIN_TOKEN (wrangler secret +
      gh secret), D1 backup/export schedule.
- [ ] Status page section in README: /v3/flavors as the public health
      signal (index versions + counts).

## Acceptance

- Cache-hit ratio visible and >80% steady-state; on-call actions are
  copy-paste from the runbook.
