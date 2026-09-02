import { canonicalize, yearOf } from "pubid-ts";
import { allPartsKey, lastPublisherKey, normKey, undatedKey } from "pubid-ts";

export interface DocumentRow {
  id: number;
  flavor: string;
  file_path: string;
  kind: string;
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
}

export interface LookupOptions {
  code: string;
  year?: number | null;
  allParts?: boolean | null;
}

function queryKeys(code: string): string[] {
  const keys = [normKey(code)];
  const canon = canonicalize(code);
  if (canon) {
    const canonKey = normKey(canon);
    if (!keys.includes(canonKey)) keys.push(canonKey);
  }
  return keys.flatMap((k) => [k, lastPublisherKey(k)])
    .filter((k, i, all) => k.length > 2 && all.indexOf(k) === i);
}

export async function findDocument(
  db: D1Database,
  opts: LookupOptions,
): Promise<DocumentRow | null> {
  const keys = queryKeys(opts.code);
  if (!keys.length) return null;

  const parsedYear = Number(yearOf(opts.code));

  for (const k of keys) {
    const row = await matchByNorm(db, k, opts, Number.isFinite(parsedYear) ? parsedYear : null);
    if (row) return row;
  }

  for (const k of keys) {
    const row = await db
      .prepare(
        `SELECT d.* FROM documents AS d JOIN docids AS i ON i.document_id = d.id
         WHERE i.norm = ?1 ORDER BY d.year DESC, d.id ASC LIMIT 1`,
      )
      .bind(k)
      .first<DocumentRow>();
    if (row) return row;
  }

  return null;
}

async function matchByNorm(
  db: D1Database,
  k: string,
  opts: LookupOptions,
  parsedYear: number | null,
): Promise<DocumentRow | null> {
  const embeddedYear = k.match(/:(\d{4})/)?.[1] ?? (parsedYear ? String(parsedYear) : undefined);
  const year = embeddedYear ? Number(embeddedYear) : (opts.year ?? null);

  if (year) {
    const r = await db
      .prepare(
        `SELECT * FROM documents AS d WHERE d.undated_norm = ?1 AND (d.year = ?2 OR d.norm = ?3)
         ORDER BY d.year DESC, d.id ASC LIMIT 1`,
      )
      .bind(undatedKey(k), year, k)
      .first<DocumentRow>();
    if (r) return r;
  }

  return db
    .prepare(
      `SELECT * FROM documents AS d WHERE d.undated_norm = ?1
       ORDER BY d.year DESC, d.id ASC LIMIT 1`,
    )
    .bind(undatedKey(k))
    .first<DocumentRow>();
}

export interface FamilyMember {
  docid: string;
  year: number | null;
}

export interface FamilyAggregate {
  docid: string;
  flavor: string;
  title: string | null;
  members: FamilyMember[];
}

// "All parts" is an aggregate citation over a multipart family — not a
// stored document. Members are the latest edition of each part sharing
// the family base key.
export async function findFamily(
  db: D1Database,
  code: string,
): Promise<FamilyAggregate | null> {
  const k = normKey(code);
  if (!k) return null;
  const familyKey = allPartsKey(undatedKey(k));
  if (!familyKey) return null;

  const { results } = await db
    .prepare(
      `SELECT docid, norm, undated_norm, year, title_en, flavor FROM documents
       WHERE allparts_norm = ?1 ORDER BY year DESC, docid ASC`,
    )
    .bind(familyKey)
    .all<DocumentRow>();
  const rows = results ?? [];
  if (!rows.length) return null;

  const latestByPart = new Map<string, DocumentRow>();
  for (const row of rows) {
    if (!latestByPart.has(row.undated_norm)) latestByPart.set(row.undated_norm, row);
  }
  const members = [...latestByPart.values()].map((r) => ({ docid: r.docid ?? "", year: r.year }));

  const anchor = rows[0]!;
  const base = (anchor.docid ?? "")
    .replace(/:(?:19|20)\d{2}(?=[^-]*$)/, "")
    .replace(/-\d+[A-Za-z]?$/, "");

  return {
    docid: `${base} (all parts)`,
    flavor: anchor.flavor,
    title: anchor.title_en,
    members,
  };
}
