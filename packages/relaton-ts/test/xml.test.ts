import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fromXml, toXml } from "../src/xml";
import { toAsciiBib, slugAnchor } from "../src/asciibib";
import { toYaml, parse } from "../src/index";

const fixture = readFileSync(new URL("./fixtures/bibdata-iho-b10.xml", import.meta.url), "utf8");

describe("fromXml", () => {
  it("parses a real bibdata record into a validated item", () => {
    const result = fromXml(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.item as Record<string, unknown>;
    expect(item.type).toBe("standard");
    const docids = item.docidentifier as Record<string, unknown>[];
    expect(docids[0]?.content).toBe("B-10");
    expect(docids[0]?.type).toBe("IHO");
    expect(docids[0]?.primary).toBe(true);
    const titles = item.title as Record<string, unknown>[];
    expect(titles.length).toBeGreaterThanOrEqual(2);
    expect(titles[0]?.content).toContain("GEBCO");
    expect(titles[1]?.language).toBe("fr");
  });

  it("maps the XML vocabulary to the item vocabulary (uri→source, on→at)", () => {
    const result = fromXml(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.item as Record<string, unknown>;
    const source = item.source as Record<string, unknown>[];
    expect(source.length).toBeGreaterThan(0);
    expect(source[0]?.content).toMatch(/^https?:\/\//);
    const dates = item.date as Record<string, unknown>[];
    expect(dates[0]?.type).toBe("published");
    expect(typeof (dates[0]?.at ?? dates[0]?.from)).toBe("string");
  });

  it("round-trips through toXml back into an equal item", () => {
    const first = fromXml(fixture);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const regenerated = toXml(first.item);
    const second = fromXml(regenerated);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // Empty objects are coercion artifacts of empty XML elements; they
    // carry no data and do not survive regeneration.
    const prune = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(prune).filter((x) => x !== undefined);
      if (typeof v === "object" && v !== null) {
        const out: Record<string, unknown> = {};
        for (const [k, c] of Object.entries(v)) {
          const p = prune(c);
          if (p !== undefined && !(typeof p === "object" && p !== null && Object.keys(p).length === 0)) out[k] = p;
        }
        return Object.keys(out).length ? out : undefined;
      }
      return v;
    };
    expect(prune(JSON.parse(JSON.stringify(second.item)))).toEqual(prune(JSON.parse(JSON.stringify(first.item))));
  });
});

describe("toYaml on an XML-sourced item", () => {
  it("produces YAML that reparses to the same item", () => {
    const result = fromXml(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const yamlText = toYaml(result.item);
    const reparsed = parse(yamlText);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(JSON.parse(JSON.stringify(reparsed.item))).toEqual(JSON.parse(JSON.stringify(result.item)));
  });
});

describe("toAsciiBib on an XML-sourced item", () => {
  it("emits the [%bibitem] wrapper, dotted paths, and array markers", () => {
    const result = fromXml(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bib = toAsciiBib(result.item, "IHO-B-10");
    expect(bib.startsWith("[[IHO-B-10]]\n[%bibitem]\n== {blank}")).toBe(true);
    expect(bib).toContain("docidentifier::");
    expect(bib).toContain("docidentifier.content:: B-10");
    expect(bib).toContain("docidentifier.type:: IHO");
    expect(bib).toContain("docidentifier.primary:: true");
    expect(bib).toContain("title::");
    expect(bib).toContain("source.type::");
    expect(bib).toContain("date.type:: published");
    expect(bib).toContain("type:: standard");
  });

  it("slugifies anchors", () => {
    expect(slugAnchor("ISO 8601-1:2019")).toBe("ISO-8601-1-2019");
  });
});
