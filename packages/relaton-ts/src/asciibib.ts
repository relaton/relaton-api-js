// Path-style AsciiBib serialization of a Relaton item, per
// relaton.org/specs/asciibib: a [%bibitem] subclause whose body is a flat
// definition list of dot-delimited key paths. Array elements are introduced
// by a blank parent entry; arrays of scalars repeat the key; leaf values
// with sibling attributes use the `content` convention (the item already
// follows it).

import type { RelatonItem } from "./index";

type Scalar = string | number | boolean;
type Node = Scalar | null | undefined | Node[] | { [key: string]: Node };

function flatten(value: Node, path: string, out: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value !== "object") {
    const s = String(value);
    if (s !== "") out.push(`${path}:: ${s}`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== "object" || v === null)) {
      for (const v of value) {
        const s = String(v);
        if (s !== "") out.push(`${path}:: ${s}`);
      }
      return;
    }
    for (const item of value) {
      out.push(`${path}::`);
      flatten(item, path, out);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    flatten(child, path ? `${path}.${key}` : key, out);
  }
}

export function slugAnchor(docid: string): string {
  return docid.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase();
}

export function toAsciiBib(item: RelatonItem, anchor: string): string {
  const lines = [`[[${anchor}]]`, "[%bibitem]", "== {blank}"];
  flatten(item as unknown as Node, "", lines);
  return lines.join("\n");
}
