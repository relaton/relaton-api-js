// Shared search engine for /search, /collections/{c}, and /api/v1/search:
// one WHERE-builder over the documents index with pubid-aware matching,
// filters, sorting, pagination, and per-dimension facet counts.

export interface SearchParams {
  q?: string;
  /** Also match the query against record abstracts (LIKE-based). */
  inAbstract?: boolean;
  flavor?: string;
  doctype?: string;
  status?: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  sort?: "relevance" | "year_desc" | "year_asc" | "docid";
  page?: number;
  size?: number;
}

export interface SearchHit {
  flavor: string;
  r2_key: string;
  docid: string | null;
  year: number | null;
  doctype: string | null;
  status: string | null;
  title_en: string | null;
  norm: string;
}

export interface FacetCounts {
  [dimension: string]: { value: string; count: number }[];
}

export interface SearchResult {
  items: SearchHit[];
  total: number;
  page: number;
  size: number;
  hasPrev: boolean;
  hasNext: boolean;
  facets: FacetCounts;
}

const SORTS: Record<string, string> = {
  relevance: "docid IS NULL, docid ASC",
  year_desc: "year DESC, docid ASC",
  year_asc: "year ASC, docid ASC",
  docid: "docid ASC",
};

interface BuiltWhere {
  where: string;
  bind: unknown[];
}

function buildWhere(p: SearchParams, opts: { scopeFlavor?: string } = {}): BuiltWhere {
  const clauses: string[] = [];
  const bind: unknown[] = [];

  if (opts.scopeFlavor) {
    clauses.push("flavor = ?");
    bind.push(opts.scopeFlavor);
  } else if (p.flavor) {
    clauses.push("flavor = ?");
    bind.push(p.flavor);
  }
  if (p.doctype) {
    clauses.push("doctype = ?");
    bind.push(p.doctype);
  }
  if (p.status) {
    clauses.push("status = ?");
    bind.push(p.status);
  }
  if (p.yearFrom != null) {
    clauses.push("year >= ?");
    bind.push(p.yearFrom);
  }
  if (p.yearTo != null) {
    clauses.push("year <= ?");
    bind.push(p.yearTo);
  }
  if (p.q) {
    const like = `%${p.q}%`;
    if (p.inAbstract) {
      clauses.push(
        "(docid LIKE ? OR title_en LIKE ? OR norm LIKE ? OR undated_norm LIKE ? OR abstract LIKE ?)",
      );
      bind.push(like, like, like, like, like);
    } else {
      clauses.push("(docid LIKE ? OR title_en LIKE ? OR norm LIKE ? OR undated_norm LIKE ?)");
      bind.push(like, like, like, like);
    }
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    bind,
  };
}

async function facetFor(
  db: D1Database,
  dimension: string,
  textWhere: BuiltWhere,
): Promise<{ value: string; count: number }[]> {
  const notNull = `${textWhere.where ? textWhere.where + " AND " : "WHERE "}${dimension} IS NOT NULL`;
  const { results } = await db.prepare(
    `SELECT ${dimension} AS value, COUNT(*) AS count FROM documents ${notNull}
     GROUP BY ${dimension} ORDER BY count DESC LIMIT 12`,
  ).bind(...textWhere.bind).all<{ value: string; count: number }>();
  return (results ?? []).map((r) => ({ value: r.value, count: r.count }));
}

export async function searchDocuments(
  db: D1Database,
  params: SearchParams,
  opts: { scopeFlavor?: string } = {},
): Promise<SearchResult> {
  // The abstract column is populated by ingest (migration 0002); a LIKE
  // over it is a scan — tolerate missing column on pre-migration DBs.
  if (params.inAbstract) {
    try {
      await db.prepare("SELECT abstract FROM documents LIMIT 1").first();
    } catch {
      params = { ...params, inAbstract: false };
    }
  }
  const page = Math.max(0, params.page ?? 0);
  const size = Math.min(100, Math.max(10, params.size ?? 25));
  const { where, bind } = buildWhere(params, opts);
  const order = SORTS[params.sort ?? "relevance"] ?? SORTS.relevance;

  const totalRow = await db.prepare(
    `SELECT COUNT(*) AS n FROM documents ${where}`,
  ).bind(...bind).first<{ n: number }>();
  const total = totalRow?.n ?? 0;

  const { results } = await db.prepare(
    `SELECT flavor, r2_key, docid, year, doctype, status, title_en, norm
     FROM documents ${where} ORDER BY ${order} LIMIT ${size + 1} OFFSET ${page * size}`,
  ).bind(...bind).all<SearchHit>();

  const rows = results ?? [];
  const items = rows.slice(0, size);

  // Facets are computed on the text/year-filtered set (independent of the
  // selected facet values) so counts stay meaningful while narrowing.
  const textOnly = buildWhere(
    { q: params.q, yearFrom: params.yearFrom, yearTo: params.yearTo },
    opts,
  );
  const facets: FacetCounts = {};
  if (!opts.scopeFlavor) facets.flavor = await facetFor(db, "flavor", textOnly);
  facets.doctype = await facetFor(db, "doctype", textOnly);
  facets.status = await facetFor(db, "status", textOnly);

  return {
    items,
    total,
    page,
    size,
    hasPrev: page > 0,
    hasNext: rows.length > size,
    facets,
  };
}
