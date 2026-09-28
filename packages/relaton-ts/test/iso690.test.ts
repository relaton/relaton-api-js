import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fromXml } from "../src/xml";
import { toIso690 } from "../src/iso690";
import { parseItem } from "../src/index";

const fixture = readFileSync(new URL("./fixtures/bibdata-iho-b10.xml", import.meta.url), "utf8");

describe("toIso690", () => {
  it("renders a standard: docid, title, publisher, year", () => {
    const parsed = fromXml(fixture);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const s = toIso690(parsed.item);
    expect(s).toMatch(/^B-10, /);
    expect(s).toContain("The History of GEBCO");
    expect(s).toContain("International Hydrographic Organization");
    expect(s).toMatch(/2003\.$/);
  });

  it("renders a book with person authors in FAMILY, Initials form", () => {
    const parsed = parseItem({
      type: "book",
      docidentifier: [{ content: "978-0-14-143951-8", type: "ISBN" }],
      title: [{ type: "main", content: "Pride and Prejudice" }],
      contributor: [
        { role: [{ type: "author" }], person: { name: { completename: { content: "Jane Austen" } } } },
        { role: [{ type: "publisher" }], organization: { name: [{ content: "Penguin" }] } },
      ],
      date: [{ type: "published", at: "2002" }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const s = toIso690(parsed.item);
    expect(s.startsWith("AUSTEN, J.")).toBe(true);
    expect(s).toContain("Pride and Prejudice.");
    expect(s).toContain("Penguin, 2002.");
  });

  it("renders a website entry with url and year", () => {
    const parsed = parseItem({
      type: "website",
      title: [{ type: "main", content: "INSPIRE registry" }],
      contributor: [{ role: [{ type: "publisher" }], organization: { name: [{ content: "European Commission" }] } }],
      source: [{ type: "src", content: "https://inspire.ec.europa.eu/registry" }],
      date: [{ type: "published", at: "2020" }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const s = toIso690(parsed.item);
    expect(s).toContain("INSPIRE registry [website].");
    expect(s).toContain("https://inspire.ec.europa.eu/registry (2020).");
  });

  it("appends title-part after the main title", () => {
    const parsed = parseItem({
      type: "standard",
      docidentifier: [{ content: "ISO 19115-3:2023", type: "ISO", primary: true }],
      title: [
        { type: "main", content: "Geographic information — Metadata" },
        { type: "title-part", content: "Part 3: XML schema implementation for fundamental concepts" },
      ],
      contributor: [{ role: [{ type: "publisher" }], organization: { name: [{ content: "ISO" }] } }],
      date: [{ type: "published", at: "2023-08" }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const s = toIso690(parsed.item);
    expect(s).toContain("ISO 19115-3:2023, Geographic information — Metadata — Part 3: XML schema implementation for fundamental concepts.");
    expect(s).toContain("ISO, 2023.");
  });
});
