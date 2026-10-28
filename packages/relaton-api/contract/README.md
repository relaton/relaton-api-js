# Contract fixtures (TODO.api/12)

One executable contract, dependency-free: `run.mjs` replays
`fixtures.json` against a base URL and exits non-zero on drift.

```sh
npm run test:contract                                    # against production
RELATON_API_BASE_URL=http://127.0.0.1:8787 npm run test:contract
node packages/relaton-api/contract/run.mjs "3GPP"        # one fixture by name substring
```

Assertions pin the stable contract surface only: status, content-type,
and pinned identifiers. Titles, dates and counts drift with the datasets
and must not be pinned here. `run.mjs` is plain node with no imports
beyond `node:`, so the Ruby gem's CI can execute the same file against
its own implementation.

`.github/workflows/contract.yml` runs the set daily against production
and is `workflow_call`-able, so the deployment repo's post-deploy smoke
can invoke it with its own `base_url`.
