// Timeline (epic #175, issue #178): the edition/amendment/supersedence
// history of a document, derived entirely from the stored relation edges —
// no new data model, no ingest change. Each edge becomes a classified
// event; the root document opens the timeline as its own publication.
//
// Classification is a closed map over the relation types the datasets
// actually store (the graph walk's structural set plus the edition,
// instance and containment families the Phase-0 baseline showed). Unknown
// relation types pass through with their stored name — an event is never
// dropped for having an unmapped type.
export interface TimelineNode {
  key: string;
  docid: string;
  year: number | null;
  title: string | null;
}

export interface TimelineEvent {
  type: string;
  relation: string;
  direction: "self" | "out" | "in";
  key: string;
  docid: string | null;
  year: number | null;
  title: string | null;
}

const EVENT_CLASS: Record<string, string> = {
  amends: "amendment",
  amendedBy: "amendment",
  corrigends: "corrigendum",
  corrigendumBy: "corrigendum",
  updates: "update",
  updatedBy: "update",
  supersedes: "supersession",
  supersededBy: "supersession",
  supplants: "supersession",
  obsoletes: "obsolescence",
  obsoletedBy: "obsolescence",
  adoptedFrom: "adoption",
  adoptedAs: "adoption",
  editionOf: "edition",
  hasEdition: "edition",
  instanceOf: "instance",
  hasInstance: "instance",
  includes: "includes",
  includedBy: "includes",
  partOf: "part-of",
  hasPart: "part-of",
};

export function classifyRelation(relation: string): string {
  return EVENT_CLASS[relation] ?? relation;
}

export function buildTimeline(
  root: { key: string; docid: string; year: number | null; title: string | null },
  out: { type: string; target: string }[],
  inc: { document: string; type: string }[],
  nodes: Map<string, TimelineNode>,
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      type: "published",
      relation: "",
      direction: "self",
      key: root.key,
      docid: root.docid || null,
      year: root.year,
      title: root.title,
    },
  ];
  for (const r of out) {
    if (!r.target) continue;
    const node = nodes.get(r.target);
    events.push({
      type: classifyRelation(r.type),
      relation: r.type,
      direction: "out",
      key: node?.key ?? r.target,
      docid: node?.docid ?? r.target,
      year: node?.year ?? null,
      title: node?.title ?? null,
    });
  }
  for (const r of inc) {
    if (!r.document) continue;
    const node = nodes.get(r.document);
    events.push({
      type: classifyRelation(r.type),
      relation: r.type,
      direction: "in",
      key: node?.key ?? r.document,
      docid: node?.docid ?? r.document,
      year: node?.year ?? null,
      title: node?.title ?? null,
    });
  }
  // Date order, root pinned first; the undated trail after the dated one,
  // alphabetical within each group for a stable answer.
  return events.sort((a, b) => {
    if (a.direction === "self") return -1;
    if (b.direction === "self") return 1;
    const ya = a.year ?? 9999;
    const yb = b.year ?? 9999;
    return ya - yb || a.key.localeCompare(b.key);
  });
}
