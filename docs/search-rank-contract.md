# Search rank contract — v1.0.0

`GET /v3/search` (issue #179, epic #175) returns documents in an order this
document defines. The constants live in one module,
`packages/relaton-api/src/lib/rank.ts` (`RANK_CONTRACT`). Every response
carries the version as `rank_contract`.

`GET /v3/documents` is not ranked. It stays the key-ordered listing for
walks and exports. Use `/v3/search` when the order must mean relevance.

## Request

| Parameter | Meaning |
|---|---|
| `q` (required) | Free text or an identifier. A blank `q` is a 422. |
| `flavor`, `doctype`, `status`, `year` | Exact filters. They apply to every lane, the identifier pin included. |
| `limit` | 1–100, default 25. |
| `cursor` | The opaque `next_cursor` of the previous page. |
| `semantic` | `0`/`false` turns the semantic lane off. Default on. |

## The order

1. **Identifier pin.** When `q` names a document through the pubid resolve
   chain, that document goes first. The tiers, best first: `exact` (the
   canonical key), `lookup` (the normalized pubid lookup keys), `slug` (a
   pubid slug such as `iso/9001/2015`), `docid` (the docid index). Pinned
   hits sort by tier. All identifier matching goes through the pubid key
   functions; no comparison is hand-rolled.
2. **Fused body.** Three lanes each give up to `depth` = 100 keys, best
   first. Each key scores the sum of `weight / (k + rank)` over the lanes
   that hold it (weighted reciprocal-rank fusion), with `k` = 60 and a
   1-based `rank` after the filters:

   | Lane | Source | Lane order | Weight |
   |---|---|---|---|
   | `keyword` | FTS5 `documents_search_fts` (docid, title, abstract), prefix-AND tokens | `bm25()` | 1.0 |
   | `trigram` | FTS5 trigram `documents_search_trigram` (docid, title, norm), phrase-quoted, `q` of 3+ characters | FTS5 `rank` | 0.6 |
   | `semantic` | Vectorize `relaton-records`, BGE base embeddings of docid + title + abstract | cosine | 0.8 |

   Only ranks fuse. Raw scores never do, because bm25, trigram rank and
   cosine are on different scales.

   The keyword and trigram lanes apply the filters inside their queries.
   The semantic lane cannot: Vectorize returns its top 100 for the whole
   census, and the filters then remove the neighbours that do not match.
   With a narrow filter, the semantic lane can therefore add few or no
   hits.
3. **Tie-breaks.** Fused score desc, then year desc (no year goes last),
   then key asc. The order is total, so a page is stable while the data
   does not change.
4. **Window.** The fused list stops at `window` = 200. `next_cursor` is
   `null` at the end of the window. Narrow the query or add filters to
   reach a document past it.

## Response

```json
{
  "rank_contract": "1.0.0",
  "q": "quality management",
  "semantic": true,
  "items": [
    {
      "key": "ISO 9001:2015", "flavor": "iso", "docid": "ISO 9001:2015",
      "title": "Quality management systems — Requirements", "year": 2015,
      "score": 0.038573, "pinned": false,
      "lanes": { "keyword": 1, "trigram": 2, "semantic": 4 },
      "highlight": "<mark>Quality management</mark> systems — Requirements",
      "api": "/v3/documents/ISO%209001%3A2015"
    }
  ],
  "facets": { "flavor": [{ "value": "iso", "count": 4 }], "doctype": [], "status": [] },
  "next_cursor": "…"
}
```

- `lanes` gives the rank of the item in each lane that holds it, and the
  identifier tier when it is pinned. It explains the position of the item.
- `highlight` comes from the trigram lane, when that lane matched.
- `semantic` is `true` only when the semantic lane ran and answered. Without
  the AI and Vectorize bindings, or when they fail, the other lanes answer
  alone. This is never an error.
- `facets` count the keyword match without the filters (the usual facet
  rule), so a client can show what each filter would leave.
- A `Link: rel="next"` header repeats `next_cursor`.

## Cursors

A cursor is an offset inside the window, tagged with the contract version.
A cursor from another contract version is a 422, because it would page a
list in a different order.

## Embedding coverage

The semantic lane reaches only records with a current vector.

- `POST /admin/embed-search` (the `embed-search.yml` workflow) embeds the
  rows of `documents_search` where `embedded_at` is null.
- An ingest (or an `/admin/build-search` rebuild) that changes the docid,
  title or abstract of a record clears its `embedded_at`, so the next walk
  refreshes the vector. An unchanged re-ingest keeps it.
- `GET /admin/embed-coverage` (admin token) reports `{total, embedded}` per
  flavor.

## Evaluation

`packages/relaton-api/test/fixtures/search-eval.json` lists queries with
the keys that must be in the top `k`. `test/search_eval.test.ts` runs every
case on a seeded corpus in PR CI, keyword-only and hybrid. The hybrid run
uses a deterministic stub for the embeddings, so it needs no credentials.
Cases with `keyword_misses` prove that the semantic lane adds recall. The
evaluation set records the contract version, and the test fails when the
two differ.

The live contract suite (`contract/fixtures.json`) checks the deployed
route: status, content type and the `rank_contract` field.

## Changing the contract

Change `RANK_CONTRACT`, this document and the evaluation set in one PR, and
bump the version:

- **patch**: a tie-break, depth or window change;
- **minor**: a weight or `k` change;
- **major**: a lane added or removed, or a change to the pin rule.

A weight change must keep every evaluation case green. Add a case for the
query that motivated the change.
