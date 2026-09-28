// ISO 690:2021 formatted citation rendering for a Relaton item — the human
// citation string, as produced by the ecosystem's renderer conventions
// (relaton-render). Component order per resource type; person names in
// FAMILY, Initials form; undated records omit the year.

import type { RelatonItem } from "./index";

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function contentOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(contentOf).find(Boolean) ?? "";
  if (typeof v === "object" && v !== null) {
    const c = (v as Record<string, unknown>).content;
    if (typeof c === "string") return c;
  }
  return "";
}

/** Join citation segments, never producing doubled periods. */
function segs(...parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.endsWith(".") ? p : p.replace(/\.$/, "") + "."))
    .join(" ");
}

interface Rec {
  type?: string;
  docidentifier?: { content?: string; type?: string; primary?: boolean }[];
  title?: { content?: string; type?: string }[];
  date?: { type?: string; at?: string; from?: string }[];
  contributor?: {
    role?: { type?: string }[];
    person?: { name?: { completename?: unknown; given?: unknown; surname?: unknown } };
    organization?: { name?: unknown; abbreviation?: unknown };
  }[];
  edition?: unknown;
  source?: { content?: string; type?: string }[];
  extent?: unknown;
}

function iso690Person(name: { completename?: unknown; given?: unknown; surname?: unknown }): string {
  const complete = contentOf(name.completename);
  const given = contentOf(name.given);
  const surname = contentOf(name.surname);
  if (surname) {
    const initials = given.split(/\s+/).filter(Boolean)
      .map((w) => `${w[0]?.toUpperCase()}.`).join(" ");
    return initials ? `${surname.toUpperCase()}, ${initials}` : surname.toUpperCase();
  }
  if (complete) {
    const parts = complete.trim().split(/\s+/);
    if (parts.length >= 2) {
      const family = parts[parts.length - 1] ?? "";
      const initials = parts.slice(0, -1).map((w) => `${w[0]?.toUpperCase()}.`).join(" ");
      return `${family.toUpperCase()}${initials ? ", " + initials : ""}`;
    }
    return complete.toUpperCase();
  }
  return "";
}

function primaryDocid(rec: Rec): string {
  const docids = rec.docidentifier ?? [];
  const primary = docids.find((d) => d.primary) ?? docids[0];
  return contentOf(primary) || "";
}

function mainTitle(rec: Rec): { main?: string; part?: string } {
  let main: string | undefined;
  let part: string | undefined;
  for (const t of rec.title ?? []) {
    const content = contentOf(t);
    if (!content) continue;
    // One title-part renders — the record's citation language; the first
    // (document order) wins over translations.
    if (t.type === "title-part") part = part ?? content;
    else main = main ?? content;
  }
  return { main, part };
}

function yearOf(rec: Rec): string {
  const dates = rec.date ?? [];
  const published = dates.find((d) => d.type === "published" || d.type === "issued") ?? dates[0];
  const raw = published?.at ?? published?.from ?? "";
  return raw.match(/\d{4}/)?.[0] ?? "";
}

function originatorsOf(rec: Rec, roles: string[]): string {
  const names: string[] = [];
  for (const c of rec.contributor ?? []) {
    const roleTypes = asArray(c.role).map((r) => r?.type ?? "");
    if (!roles.some((r) => roleTypes.includes(r))) continue;
    if (c.person) {
      const n = iso690Person(c.person.name ?? {});
      if (n) names.push(n);
    } else if (c.organization) {
      const n = contentOf(c.organization.name) || contentOf(c.organization.abbreviation);
      if (n) names.push(n);
    }
  }
  return names.join(" ; ");
}

/** Renders the ISO 690 citation string for a Relaton item. */
export function toIso690(item: RelatonItem): string {
  const rec = item as unknown as Rec;
  const type = rec.type ?? "";
  const docid = primaryDocid(rec);
  const { main, part } = mainTitle(rec);
  const fullTitle = [main, part].filter(Boolean).join(" — ");
  const year = yearOf(rec);
  const edition = contentOf(rec.edition);

  // Standards: identifier leads; the publisher organization closes.
  if (type === "standard" || (!type && docid)) {
    const bits: string[] = [];
    if (docid) bits.push(docid);
    if (fullTitle) bits.push(fullTitle);
    const publisher = originatorsOf(rec, ["publisher"]) || "ISO";
    return segs(
      bits.length ? bits.join(", ") : "",
      edition ? `Edition ${edition}` : "",
      year ? `${publisher}, ${year}` : "",
    );
  }

  const authors = originatorsOf(rec, ["author", "performer"]);
  const publisher = originatorsOf(rec, ["publisher"]);

  if (type === "website" || type === "webresource") {
    const url = (rec.source ?? []).map((s) => s.content ?? "").find(Boolean) ?? "";
    const org = authors || publisher;
    return segs(
      org,
      fullTitle ? `${fullTitle} [website]` : "",
      url ? `${url}${year ? ` (${year})` : ""}` : "",
    );
  }

  if (type === "article" || type === "inbook" || type === "incollection" || type === "inproceedings") {
    return segs(
      authors || docid,
      fullTitle,
      publisher && year ? `${publisher}, ${year}` : year,
    );
  }

  // Books, reports, and everything else: authors, title, edition, publisher, year.
  return segs(
    authors || docid,
    fullTitle,
    edition ? `Edition ${edition}` : "",
    publisher && year ? `${publisher}, ${year}` : year,
  );
}
