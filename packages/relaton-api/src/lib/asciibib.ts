// Path-style AsciiBib serialization of a Relaton record, per
// relaton.org/specs/asciibib: each bibliographic item is a [%bibitem]
// subclause whose body is a flat definition list of dot-delimited key
// paths. Array elements are introduced by a blank parent entry; arrays of
// scalars repeat the key. Leaf values with sibling attributes use the
// `content` convention at the call site (the record is plain data).

type Scalar = string | number | boolean;
export type AsciibibNode = Scalar | null | undefined | AsciibibNode[] | { [key: string]: AsciibibNode };
type Node = AsciibibNode;

function isScalar(v: Node): v is Scalar {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

function flatten(value: Node, path: string, out: string[]): void {
  if (value === null || value === undefined) return;

  if (isScalar(value)) {
    const s = String(value);
    if (s === "") return;
    out.push(`${path}:: ${s}`);
    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return;
    if (value.every(isScalar)) {
      for (const item of value) {
        const s = String(item);
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
  const slug = docid.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.toUpperCase();
}

export function toAsciiBib(record: Node, anchor: string): string {
  const lines: string[] = [`[[${anchor}]]`, "[%bibitem]", "== {blank}"];
  flatten(record, "", lines);
  return lines.join("\n");
}
