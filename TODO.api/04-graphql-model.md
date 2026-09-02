# 04 — GraphQL mirroring the Relaton model

Goal: the GraphQL schema mirrors relaton-models (the relaton-py
`BibliographicItem` shape used by bibxml.ietf.org is the reference), not a
flattened convenience schema.

## Schema core (model-faithful)

```graphql
type BibliographicItem {
  key: ID!
  flavor: String!
  docids: [DocID!]!
  titles: [LocalizedString!]!      # all languages/types
  dates: [BibliographicDate!]!
  contributors: [Contributor!]!    # org/person, roles, affiliations
  relations: [Relation!]!          # includes / partOf / updates ...
  series: [Series!]!
  editions: [String!]
  languages: [String!]! scripts: [String!]!
  classifications: [Classification!]!   # ICS etc.
  status: DocumentStatus doctype: String
  xml: String   # bibdata XML (R2) — opt-in field
}
type Query {
  document(key: ID!): BibliographicItem
  documents(key: String, title: String, flavor: String, year: Int,
            doctype: String, status: String, contributor: String,
            relation: RelationFilter, after: String, first: Int = 20):
            DocumentConnection!
  flavors: [Flavor!]!  version: Version!
}
```

## Tasks

- [ ] Resolvers read `documents.data` (storage v2); filters hit projection
      tables via the same SQL the REST search uses.
- [ ] Cross-repo relation traversal (`relation: { type: includes, target:
      "iso:19115" }`).
- [ ] Replace current flat schema; keep GraphiQL playground.
- [ ] Persisted queries for relaton.org's explorer (later; P5).

## Acceptance

- Round-trip: any `data` JSON field reachable via GraphQL without loss.
- Cross-flavor queries (title search across all flavors) unchanged in power,
  richer in output.
