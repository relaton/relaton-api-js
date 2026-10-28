# 08 — Repo decomposition: implementation libraries + deployment config

Goal (rev 2, supersedes the single-hub plan): three repos, one contract.
Production never changes worker/route during the migration.

## Tasks

- [ ] `relaton/relaton-api-js`: rename of api.relaton.org-workers once 07
      ships a stable alpha; PRs #1/#2 land here; publishes @relaton/api.
- [x] `relaton/relaton-api-ruby`: created (2026-10-28); founding history is
      `git subtree split -P lib` of relaton/api.relaton.org@master (107
      Lambda-era commits), with the v3-subset Rack implementation over
      dataset directories stacked on top as the working tree (lib/relaton/
      api{,.rb} namespace per 11-ruby-gem.md; spec/, examples/config.ru,
      gemspec included).
- [ ] `relaton/api.relaton.org` → pure deployment repo (branch
      `deployment-only`): tag `legacy-lambda-final` first; new tree =
      relaton-api.yaml + worker/ entry + ruby/config.ru + workflows + this
      TODO tree + README (from PR #3 content).
- [ ] Deploy the SAME worker name + route from the new repo (zero-downtime
      cutover; rollback = re-deploy previous ref).
- [ ] Re-set GH secrets/variables in the deployment repo
      (CLOUDFLARE_*, RELATON_GEM, PUBID_GEM).
- [ ] PR #4 (this tree) merges into the deployment repo.

## Acceptance

- `api.relaton.org` repo diff = config only; implementation PRs live in the
  two library repos.
- `git log` in relaton-api-ruby reaches the original Lambda-era commits.
