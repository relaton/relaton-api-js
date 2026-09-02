import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppEnv } from "../env";
import { normalizeCode } from "pubid-ts";
import { findDocument, findFamily } from "../lib/lookup";

const QuerySchema = z.object({
  code: z.string().min(1).openapi({ example: "ISO 19115-1" }),
  year: z.string().optional().openapi({ example: "2014" }),
  all_parts: z.enum(["true", "false"]).optional(),
  keep_year: z.enum(["true", "false"]).optional(),
});

const documentRoute = createRoute({
  method: "get",
  path: "/api/v1/document",
  request: { query: QuerySchema },
  responses: {
    200: {
      description: "Relaton XML bibliographic record (bibdata)",
      content: { "text/xml": { schema: z.string() } },
    },
    400: { description: "Missing or invalid code parameter", content: { "text/plain": { schema: z.string() } } },
    404: { description: "Document not found", content: { "text/plain": { schema: z.string() } } },
  },
});

const versionRoute = createRoute({
  method: "get",
  path: "/api/v1/version",
  request: {
    query: z.object({ format: z.enum(["text", "xml", "json"]).optional() }),
  },
  responses: {
    200: {
      description: "API and data versions",
      content: {
        "text/plain": { schema: z.string() },
        "text/xml": { schema: z.string() },
        "application/json": { schema: z.object({ release: z.string(), relaton: z.string() }) },
      },
    },
  },
});

function renderFamilyXml(family: { docid: string; title: string | null; members: { docid: string }[] }): string {
  const esc = escapeXml;
  const idType = family.docid.split(" ")[0] ?? "";
  const relations = family.members
    .map(
      (m) =>
        `  <relation type="includes">\n    <bibitem>\n      <docidentifier type="${esc(idType)}">${esc(m.docid)}</docidentifier>\n    </bibitem>\n  </relation>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<bibdata type="standard" schema-version="v1.5.6">\n  <docidentifier type="${esc(idType)}" primary="true">${esc(family.docid)}</docidentifier>\n${family.title ? `  <title language="en" script="Latn" type="main">${esc(family.title)}</title>\n` : ""}${relations}\n</bibdata>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const restRoutes = new OpenAPIHono<AppEnv>();

restRoutes.openapi(documentRoute, async (c) => {
  const { code, year } = c.req.valid("query");
  const allParts = c.req.valid("query").all_parts === "true";

  const normalized = normalizeCode(code);
  if (!normalized) {
    return c.text("Bad request. Parameter 'code' is required.", 400);
  }

  const lookup = {
    code: normalized,
    year: year && /^\d{4}$/.test(year) ? Number(year) : null,
    allParts,
  };
  if (allParts) {
    const family = await findFamily(c.env.DB, normalized);
    if (family) return c.body(renderFamilyXml(family), 200, { "Content-Type": "text/xml" });
  }
  const row = await findDocument(c.env.DB, lookup);
  if (!row) return c.text("Document not found.", 404);

  const obj = await c.env.BUCKET.get(row.r2_key);
  if (!obj) {
    console.error(`R2 miss for ${row.r2_key} (flavor=${row.flavor}, docid=${row.docid})`);
    return c.text("Document not found.", 404);
  }

  return new Response(obj.body, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
});

restRoutes.openapi(versionRoute, async (c) => {
  const format = c.req.valid("query").format ?? "text";
  const release = c.env.API_VERSION ?? "dev";
  const relaton = (await c.env.DB.prepare(`SELECT value FROM meta WHERE key = 'relaton_version'`).first<{ value: string }>())?.value ?? "data-repos";

  switch (format) {
    case "xml":
      return c.text(`<version><release>${escapeXml(release)}</release><relaton>${escapeXml(relaton)}</relaton></version>`, 200, { "Content-Type": "text/xml" });
    case "json":
      return c.json({ release, relaton });
    default:
      return c.text(`Release: ${release}, Relaton version: ${relaton}`);
  }
});
