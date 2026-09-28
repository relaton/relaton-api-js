# relaton-ts

TypeScript implementation of the Relaton bibliographic model (parse, validate
and serialize Relaton v3 documents).

**The lutaml-model definitions in [relaton/relaton](https://github.com/relaton/relaton)
are the single source of truth.** Nothing in `src/generated/` is hand-written:
a Ruby exporter reads the model classes through lutaml-model's JSON Schema
generator, and a TypeScript codegen turns that schema into zod schemas plus
structural interfaces. Runtime behavior is pinned by golden corpus fixtures.

```
relaton/relaton (lutaml-model classes, pinned by tools/Gemfile ref)
  └─ tools/export_schema.rb   → schema/*.schema.json (committed artifact)
       └─ tools/codegen.ts    → src/generated/*.ts (zod + interfaces)
            └─ src/index.ts   → parse / toYaml / toJson, flavor sniffing
                 └─ test/     → golden fixtures from relaton-data-ietf
```

## Commands

```sh
npm install
npm run export:schema   # Ruby: regenerate schema/*.schema.json from relaton/relaton
npm run generate        # regenerate src/generated/*.ts from the schema
npm test                # vitest: fixtures + validation behavior
npm run build           # tsc → dist/
```

## Schema export

`tools/export_schema.rb` pins `relaton` to a full commit sha; bump the pin
deliberately when upstream models move and rerun the export. The manifest
(`schema/manifest.json`) records which ref produced the committed schemas.

Four lutaml-model bugs are worked around at export time —
[lutaml/lutaml-model#863](https://github.com/lutaml/lutaml-model/issues/863)
(recursive models), [#864](https://github.com/lutaml/lutaml-model/issues/864)
(nested choices), [#865](https://github.com/lutaml/lutaml-model/issues/865)
(non-discriminating `oneOf`) and
[#866](https://github.com/lutaml/lutaml-model/issues/866) (`Schema.to_json`
arity). Drop each patch from the exporter when the upstream fix ships.

## Data contract

Documents follow the Relaton v3 shape (`schema_version`, `docidentifier[]`,
string dates — `"1969-04"`, never YAML timestamp objects). IETF records are
detected via `ext.flavor: ietf` and validated against the IETF flavor schema
(`ext.stream`, `ext.doctype`, …); everything else validates against the
generic `Relaton::Bib::Item` model.
