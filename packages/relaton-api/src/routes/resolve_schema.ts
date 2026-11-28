// Wire schema of GET /v3/resolve (relaton-api-js#176). The OpenAPI
// document is generated from these schemas, and the exported types are
// inferred from them - one source for the spec and the TS consumers.
import { z } from "@hono/zod-openapi";

export const ResolveQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).openapi({ description: "Any identifier string, e.g. `ISO 9001`, `ISO/IEC 27001:2022/Amd 1:2024`, `RFC 8446`", example: "ISO 9001" }),
  flavor: z.string().optional().openapi({ description: "Parse with this pubid flavor's grammar only (e.g. `iso`, `ietf`)" }),
  limit: z.coerce.number().int().min(1).max(50).optional().openapi({ description: "Maximum candidates (default 10)" }),
});

export const ResolveCandidateSchema = z.object({
  key: z.string().openapi({ description: "Record key; GET /v3/documents/{key} serves it" }),
  docid: z.string().nullable().openapi({ description: "The record's primary identifier" }),
  title: z.string().nullable(),
  flavor: z.string(),
  year: z.number().int().nullable(),
  match: z.enum(["exact", "lookup", "slug", "docid", "dated", "undated", "subset", "supplement", "substring", "fuzzy"]).openapi({
    description: "exact: the record key, or the same identifier by the pubid model; lookup: a normalized lookup key (`RFC-8446`, `RFC8446`); slug: the pubid-scheme slug form; docid: the record's primary identifier string; dated: a dated query's subset match; undated: an edition of an undated query; subset: a subset match that adds a part or a copublisher (e.g. `ISO 9001-1` for `ISO 9001`); supplement: an amendment/corrigendum of a match; substring: the identifier contains the input; fuzzy: trigram text match only. One candidate per record, at its best tier.",
  }),
  score: z.number().min(0).max(1).openapi({ description: "Rank score: exact 1.0 > lookup/slug/docid 0.95 > dated 0.9 > undated 0.8 > subset 0.75 > supplement 0.7 > substring 0.6 > fuzzy <= 0.5" }),
}).openapi("ResolveCandidate");

export const ResolveResponseSchema = z.object({
  input: z.string(),
  parse_ok: z.boolean().openapi({ description: "Whether a @pubid/pubid grammar parsed the input" }),
  flavor: z.string().nullable().openapi({ description: "The pubid flavor whose grammar parsed the input (the `flavor` hint when nothing parsed)" }),
  parsed: z.record(z.string(), z.unknown()).nullable().openapi({ description: "The pubid model hash of the parsed identifier" }),
  canonical: z.string().nullable().openapi({ description: "The pubid model's human render of the parsed identifier" }),
  reason: z.enum(["no_grammar", "engine_unavailable"]).nullable().openapi({
    description: "Why the parse failed: no worker grammar reads the input, or the flavor's engine (nist, ieee, oiml) cannot run in the worker",
  }),
  candidates: z.array(ResolveCandidateSchema).openapi({ description: "Ranked candidates - discovery aids, never an authoritative answer" }),
}).openapi("ResolveResponse");

export type ResolveQuery = z.infer<typeof ResolveQuerySchema>;
export type ResolveCandidate = z.infer<typeof ResolveCandidateSchema>;
export type ResolveResponse = z.infer<typeof ResolveResponseSchema>;
