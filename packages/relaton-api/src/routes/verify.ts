import { layout, escapeHtml } from "./ui/chrome";
import { renderRecordPage, RECORD_CSS } from "./ui/record";
import { parseItem, toYaml, toXml, toJson, toAsciiBib, slugAnchor, type RelatonItem } from "relaton";

// Hosted `relaton fetch` for identifiers that resolve live: DOIs via
// CrossRef, ISBNs via OpenLibrary. The fetched metadata is mapped to a
// Relaton item, validated by relaton-ts, and rendered with the full record
// page machinery (overview, serializations, Metanorma AsciiBib CTA).

export type VerifyKind = "doi" | "isbn" | "unknown";

export function detectKind(code: string): VerifyKind {
  const c = code.trim();
  if (/^10\.\d{4,9}\/\S+$/i.test(c)) return "doi";
  const digits = c.replace(/[-\s]/g, "");
  if (/^(97[89]\d{10}|\d{9}[\dX])$/i.test(digits)) return "isbn";
  return "unknown";
}

interface CrossRefMessage {
  DOI?: string;
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  publisher?: string;
  published?: { "date-parts"?: number[][] };
  type?: string;
  URL?: string;
  abstract?: string;
}

interface OpenLibraryDoc {
  title?: string;
  full_title?: string;
  publishers?: string[];
  publish_date?: string;
  key?: string;
  authors?: { key: string }[];
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Relaton-API/3.0 (https://api.relaton.org; relaton@ribose.com)" },
  });
  if (!res.ok) return null;
  return res.json();
}

function crossrefTypeToRelaton(t: string | undefined): string {
  switch (t) {
    case "book": case "monograph": case "edited_book": return "book";
    case "journal-article": case "proceedings-article": case "posted-content": return "article";
    case "report": case "report-component": return "techreport";
    case "dataset": return "dataset";
    case "software": return "software";
    default: return "misc";
  }
}

export interface VerifyOutcome {
  kind: VerifyKind;
  ok: boolean;
  error?: string;
  docid?: string;
  item?: RelatonItem;
}

async function resolveDoi(doi: string): Promise<VerifyOutcome> {
  const data = await fetchJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`) as
    | { message?: CrossRefMessage }
    | null;
  const msg = data?.message;
  if (!msg?.DOI) {
    return { kind: "doi", ok: false, error: `CrossRef has no record for DOI ${doi}` };
  }
  const parts = msg.published?.["date-parts"]?.[0];
  const at = parts ? parts.slice(0, 3).map((p) => String(p).padStart(2, "0")).join("-").replace(/-00/g, "") : undefined;

  const contributors: Record<string, unknown>[] = (msg.author ?? []).map((a): Record<string, unknown> => ({
    role: [{ type: "author" }],
    person: {
      name: {
        completename: {
          content: a.name ?? [a.given, a.family].filter(Boolean).join(" "),
        },
      },
    },
  }));
  if (msg.publisher) {
    contributors.push({
      role: [{ type: "publisher" }],
      organization: { name: [{ content: msg.publisher }] },
    });
  }

  const item = {
    type: crossrefTypeToRelaton(msg.type),
    docidentifier: [
      { content: msg.DOI, type: "DOI", primary: true },
    ],
    title: msg.title?.length
      ? [{ type: "main", content: msg.title[0] ?? "" }]
      : undefined,
    date: at ? [{ type: "published", at }] : undefined,
    contributor: contributors.length ? contributors : undefined,
    source: msg.URL ? [{ type: "src", content: msg.URL }] : undefined,
    abstract: msg.abstract ? [{ content: msg.abstract.replace(/<[^>]+>/g, "") }] : undefined,
  };

  const parsed = parseItem(item);
  if (!parsed.ok) {
    return { kind: "doi", ok: false, error: parsed.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "), docid: msg.DOI };
  }
  return { kind: "doi", ok: true, docid: msg.DOI, item: parsed.item };
}

async function resolveIsbn(isbn: string): Promise<VerifyOutcome> {
  const digits = isbn.replace(/[-\s]/g, "");
  const doc = await fetchJson(`https://openlibrary.org/isbn/${encodeURIComponent(digits)}.json`) as OpenLibraryDoc | null;
  if (!doc?.title) {
    return { kind: "isbn", ok: false, error: `OpenLibrary has no record for ISBN ${isbn}` };
  }
  const item = {
    type: "book",
    docidentifier: [{ content: isbn, type: "ISBN", primary: true }],
    title: [{ type: "main", content: doc.full_title ?? doc.title }],
    date: doc.publish_date ? [{ type: "published", at: doc.publish_date.match(/\d{4}/)?.[0] }] : undefined,
    contributor: doc.publishers?.length
      ? [{ role: [{ type: "publisher" }], organization: { name: [{ content: doc.publishers[0] ?? "" }] } }]
      : undefined,
    source: [{ type: "src", content: `https://openlibrary.org/isbn/${digits}` }],
  };
  const parsed = parseItem(item);
  if (!parsed.ok) {
    return { kind: "isbn", ok: false, error: parsed.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") };
  }
  return { kind: "isbn", ok: true, docid: isbn, item: parsed.item };
}

export async function verifyCode(code: string): Promise<VerifyOutcome> {
  const kind = detectKind(code);
  try {
    if (kind === "doi") return await resolveDoi(code);
    if (kind === "isbn") return await resolveIsbn(code);
    return {
      kind: "unknown",
      ok: false,
      error: "Enter a DOI (10.xxxx/suffix) or an ISBN-10/13 — or search the indexed database instead.",
    };
  } catch (e) {
    return { kind, ok: false, error: `Resolution failed: ${String(e)}` };
  }
}

const CSS = `
  .verify-form { display: flex; gap: 8px; max-width: 640px; margin: 0 0 24px; }
  .verify-form input {
    flex: 1; padding: 10px 14px; font-size: 15px; font-family: var(--mono);
    border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--fg);
  }
  .verify-form button { padding: 10px 18px; font: 14px var(--font); border: none; border-radius: 8px;
    background: var(--accent); color: #fff; cursor: pointer; }
  .verify-error { color: #c53030; font-size: 14px; }
  .dark .verify-error { color: #fc8181; }
  .verify-ok { color: var(--success); font-weight: 600; font-size: 14px; margin-bottom: 12px; }
`;

export async function renderVerifyPage(code: string | undefined): Promise<string> {
  let resultHtml = "";
  let head = "";
  if (code) {
    const outcome = await verifyCode(code);
    if (outcome.ok && outcome.item && outcome.docid) {
      head = `<p class="verify-ok">Resolved via ${outcome.kind === "doi" ? "CrossRef" : "OpenLibrary"} — validated Relaton record below.</p>`;
      resultHtml = renderRecordPage({
        collection: "verify",
        key: outcome.docid,
        docid: outcome.docid,
        body: toXml(outcome.item),
      }).body;
    } else {
      head = `<p class="verify-error">${escapeHtml(outcome.error ?? "Could not resolve the identifier.")}</p>`;
    }
  }

  const body = `
<h1>Verify a DOI or ISBN</h1>
<p class="sub">Paste a DOI or ISBN to resolve it live (CrossRef / OpenLibrary — the same sources
<code>relaton fetch</code> uses) and get a validated Relaton record with every serialization.</p>
<form class="verify-form" method="get" action="/verify">
  <input name="code" value="${escapeHtml(code ?? "")}" placeholder="10.17487/RFC8446 or 978-0-12-374750-3" aria-label="DOI or ISBN">
  <button type="submit">Verify</button>
</form>
${head}
${resultHtml}`;

  return layout({
    title: "Verify — Relaton API",
    activeNav: "verify",
    css: CSS + RECORD_CSS,
    body,
  });
}

