import { Hono } from "hono";
import type { AppEnv } from "../env";

interface IngestDocid {
  norm: string;
  raw: string;
  type: string | null;
}

interface IngestRow {
  abstract?: string | null;
  file_path: string;
  r2_key: string;
  docid: string | null;
  norm: string;
  undated_norm: string;
  allparts_norm: string;
  year: number | null;
  published: string | null;
  title_en: string | null;
  doctype: string | null;
  status: string | null;
  docids: IngestDocid[];
}

interface IngestChunk {
  flavor: string;
  repo: string;
  final?: boolean;
  lastModified?: string | null;
  relatonVersion?: string;
  rows: IngestRow[];
  blobs: Record<string, string>;
}

function fixedTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function tokenMatches(header: string | undefined, token: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  return fixedTimeEqual(new TextEncoder().encode(header.slice(7)), new TextEncoder().encode(token));
}

export const adminRoutes = new Hono<AppEnv>();

/**
 * Backfills the abstract column for already-ingested documents by reading
 * each record from R2 and extracting the abstract. Paged: pass ?cursor=
 * (last document id) to continue; repeats until the flavor is walked.
 */
adminRoutes.post("/admin/backfill-abstracts/:flavor", async (c) => {
  if (!c.env.ADMIN_TOKEN || !tokenMatches(c.req.header("Authorization"), c.env.ADMIN_TOKEN)) {
    return c.text("Forbidden.", 403);
  }
  const flavor = c.req.param("flavor").replace(/[^a-z0-9-]/gi, "");
  const limit = Math.min(500, Number(c.req.query("limit") ?? "200") || 200);
  const cursor = Number(c.req.query("cursor") ?? "0") || 0;

  const { results } = await c.env.DB.prepare(
    `SELECT id, r2_key FROM documents
     WHERE flavor = ?1 AND id > ?2 AND abstract IS NULL ORDER BY id LIMIT ?3`,
  ).bind(flavor, cursor, limit).all<{ id: number; r2_key: string }>();

  let done = 0;
  let lastId = cursor;
  for (const row of results ?? []) {
    lastId = row.id;
    const obj = await c.env.BUCKET.get(row.r2_key);
    if (!obj) continue;
    const body = await obj.text();
    let abstract: string | null = null;
    if (body.trimStart().startsWith("<")) {
      const m = body.match(/<abstract[^>]*>([\s\S]*?)<\/abstract>/);
      if (m?.[1]) abstract = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 4000) || null;
    }
    if (abstract) {
      await c.env.DB.prepare("UPDATE documents SET abstract = ?1 WHERE id = ?2")
        .bind(abstract, row.id).run();
      done += 1;
    }
  }

  return c.json({
    flavor, scanned: results?.length ?? 0, updated: done, lastId,
    nextCursor: (results?.length ?? 0) === limit ? lastId : null,
  });
});

adminRoutes.post("/admin/backfill-status/:flavor", async (c) => {
  if (!c.env.ADMIN_TOKEN || !tokenMatches(c.req.header("Authorization"), c.env.ADMIN_TOKEN)) {
    return c.text("Forbidden.", 403);
  }
  const flavor = c.req.param("flavor").replace(/[^a-z0-9-]/gi, "");
  const limit = Math.min(500, Number(c.req.query("limit") ?? "200") || 200);
  const cursor = Number(c.req.query("cursor") ?? "0") || 0;

  const { results } = await c.env.DB.prepare(
    `SELECT id, r2_key FROM documents
     WHERE flavor = ?1 AND id > ?2 AND status IS NULL ORDER BY id LIMIT ?3`,
  ).bind(flavor, cursor, limit).all<{ id: number; r2_key: string }>();

  let done = 0;
  let lastId = cursor;
  for (const row of results ?? []) {
    lastId = row.id;
    const obj = await c.env.BUCKET.get(row.r2_key);
    if (!obj) continue;
    const body = await obj.text();
    let status: string | null = null;
    if (body.trimStart().startsWith("<")) {
      const m = body.match(/<status[^>]*>([\s\S]*?)<\/status>/);
      if (m?.[1]) {
        const stage = m[1].match(/<stage[^>]*>([^<]+)<\/stage>/)?.[1]?.trim();
        const substage = m[1].match(/<substage[^>]*>([^<]+)<\/substage>/)?.[1]?.trim();
        status = stage && substage ? `${stage}.${substage}` : stage ??
          (m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || null);
      }
    }
    if (status) {
      await c.env.DB.prepare("UPDATE documents SET status = ?1 WHERE id = ?2")
        .bind(status.slice(0, 32), row.id).run();
      done += 1;
    }
  }

  return c.json({
    flavor, scanned: results?.length ?? 0, updated: done, lastId,
    nextCursor: (results?.length ?? 0) === limit ? lastId : null,
  });
});

adminRoutes.post("/admin/populate-fts", async (c) => {
  if (!c.env.ADMIN_TOKEN || !tokenMatches(c.req.header("Authorization"), c.env.ADMIN_TOKEN)) {
    return c.text("Forbidden.", 403);
  }
  const limit = Math.min(10000, Number(c.req.query("limit") ?? "5000") || 5000);
  const cursor = Number(c.req.query("cursor") ?? "0") || 0;

  // One statement re-derives every entry from the content table — the
  // fastest path for a first index build. Falls back to the paged walk
  // below when a runtime cap refuses the statement.
  if (c.req.query("rebuild") === "1") {
    await c.env.DB.prepare("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')").run();
    return c.json({ mode: "rebuild" });
  }

  // Rows whose FTS entry does not exist yet (pre-trigger rows), in id
  // order so the walk is resumable by cursor.
  const { results } = await c.env.DB.prepare(
    `SELECT d.id, d.docid, d.title_en, d.abstract FROM documents d
     WHERE d.id > ?1 AND NOT EXISTS (SELECT 1 FROM documents_fts WHERE documents_fts.rowid = d.id)
     ORDER BY d.id LIMIT ?2`,
  ).bind(cursor, limit).all<{ id: number; docid: string | null; title_en: string | null; abstract: string | null }>();

  for (const row of results ?? []) {
    await c.env.DB.prepare(
      "INSERT INTO documents_fts(rowid, docid, title_en, abstract) VALUES (?1, ?2, ?3, ?4)",
    ).bind(row.id, row.docid, row.title_en, row.abstract).run();
  }

  const lastId = (results ?? []).at(-1)?.id ?? cursor;
  return c.json({
    scanned: results?.length ?? 0, indexed: (results ?? []).length, lastId,
    nextCursor: (results?.length ?? 0) === limit ? lastId : null,
  });
});

adminRoutes.post("/admin/ingest/:flavor", async (c) => {
  if (!c.env.ADMIN_TOKEN || !tokenMatches(c.req.header("Authorization"), c.env.ADMIN_TOKEN)) {
    return c.text("Forbidden.", 403);
  }

  const flavor = c.req.param("flavor").replace(/[^a-z0-9-]/gi, "");
  const chunk = await c.req.json<IngestChunk>();
  if (chunk.flavor !== flavor) return c.text("Flavor mismatch.", 400);

  const stmts: D1PreparedStatement[] = [];
  for (const row of chunk.rows) {
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO documents
           (flavor, file_path, kind, r2_key, docid, norm, undated_norm, allparts_norm,
            year, published, title_en, doctype, status, abstract)
         VALUES (?1, ?2, 'document', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT (flavor, file_path, kind) DO UPDATE SET
           r2_key = excluded.r2_key, docid = excluded.docid, norm = excluded.norm,
           undated_norm = excluded.undated_norm, allparts_norm = excluded.allparts_norm,
           year = excluded.year, published = excluded.published, title_en = excluded.title_en,
           doctype = excluded.doctype, status = excluded.status, abstract = excluded.abstract`,
      ).bind(
        flavor, row.file_path, row.r2_key, row.docid, row.norm, row.undated_norm,
        row.allparts_norm, row.year, row.published, row.title_en, row.doctype, row.status,
        row.abstract ?? null,
      ),
    );
    stmts.push(
      c.env.DB.prepare(
        `DELETE FROM docids WHERE document_id =
           (SELECT id FROM documents WHERE flavor = ?1 AND file_path = ?2 AND kind = 'document')`,
      ).bind(flavor, row.file_path),
    );
    for (const d of row.docids) {
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO docids (norm, raw, type, document_id)
           SELECT ?1, ?2, ?3, id FROM documents WHERE flavor = ?4 AND file_path = ?5 AND kind = 'document'
           ON CONFLICT (norm, document_id) DO NOTHING`,
        ).bind(d.norm, d.raw, d.type, flavor, row.file_path),
      );
    }
  }

  if (chunk.final) {
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO flavors (flavor, repo, last_modified, ingested_at, doc_count)
         VALUES (?1, ?2, ?3, ?4, (SELECT COUNT(*) FROM documents WHERE flavor = ?1))
         ON CONFLICT (flavor) DO UPDATE SET
           repo = excluded.repo, last_modified = excluded.last_modified,
           ingested_at = excluded.ingested_at, doc_count = excluded.doc_count`,
      ).bind(flavor, chunk.repo, chunk.lastModified ?? null, new Date().toISOString()),
    );
    if (chunk.relatonVersion) {
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO meta (key, value) VALUES ('relaton_version', ?1)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        ).bind(chunk.relatonVersion),
      );
    }
  }

  try {
    for (let i = 0; i < stmts.length; i += 90) {
      await c.env.DB.batch(stmts.slice(i, i + 90));
    }
  } catch (e) {
    console.error(`ingest batch failed for flavor ${flavor}: ${String(e)}`);
    return c.text(`Ingest failed: ${String(e)}`, 500);
  }

  await putBlobs(c.env.BUCKET, chunk.blobs);

  return c.json({ ok: true, rows: chunk.rows.length, blobs: Object.keys(chunk.blobs).length });
});

async function putBlobs(bucket: R2Bucket, blobs: Record<string, string>, concurrency = 25): Promise<void> {
  const entries = Object.entries(blobs);
  for (let i = 0; i < entries.length; i += concurrency) {
    await Promise.all(
      entries.slice(i, i + concurrency).map(([key, xml]) =>
        bucket.put(key, xml, { httpMetadata: { contentType: "text/xml; charset=utf-8" } }),
      ),
    );
  }
}