import { describe, expect, it } from "vitest";
import { toAsciiBib, slugAnchor } from "../src/lib/asciibib";

describe("slugAnchor", () => {
  it("slugifies docids into uppercase anchors", () => {
    expect(slugAnchor("ISO 8601-1:2019")).toBe("ISO-8601-1-2019");
    expect(slugAnchor("RFC 8446")).toBe("RFC-8446");
    expect(slugAnchor("itu-t g.989.2")).toBe("ITU-T-G-989-2");
  });
});

describe("toAsciiBib", () => {
  it("emits the [%bibitem] wrapper with the anchor", () => {
    const out = toAsciiBib({ type: "standard" }, "ISO-1");
    expect(out).toBe("[[ISO-1]]\n[%bibitem]\n== {blank}\ntype:: standard");
  });

  it("flattens nested objects into dot paths", () => {
    const out = toAsciiBib(
      { docid: { type: "ISO", id: "19115-1" }, fetched: "2019-06-30" },
      "X",
    );
    expect(out).toContain("docid.type:: ISO");
    expect(out).toContain("docid.id:: 19115-1");
    expect(out).toContain("fetched:: 2019-06-30");
  });

  it("emits arrays of objects with blank parent markers between elements", () => {
    const out = toAsciiBib(
      {
        docid: [
          { type: "ISO", id: "19115-1" },
          { type: "ISO", id: "TC211" },
        ],
      },
      "X",
    );
    const lines = out.split("\n");
    expect(lines).toContain("docid::");
    expect(lines.filter((l) => l === "docid::")).toHaveLength(2);
    expect(out).toContain("docid.type:: ISO");
    expect(out).toContain("docid.id:: 19115-1");
    expect(out).toContain("docid.id:: TC211");
    // element attributes must not interleave across the blank markers
    expect(lines.indexOf("docid.id:: 19115-1")).toBeLessThan(lines.lastIndexOf("docid::"));
    expect(lines.indexOf("docid.id:: TC211")).toBeGreaterThan(lines.lastIndexOf("docid::"));
  });

  it("emits arrays of scalars as repeated keys", () => {
    const out = toAsciiBib({ language: ["en", "fr"], keyword: "Keyword" }, "X");
    expect(out).toContain("language:: en");
    expect(out).toContain("language:: fr");
    expect(out).toContain("keyword:: Keyword");
  });

  it("uses the content convention for values with sibling attributes (plain data in, content key out)", () => {
    const out = toAsciiBib(
      { title: { type: "main", content: "Geographic information" } },
      "X",
    );
    expect(out).toContain("title.type:: main");
    expect(out).toContain("title.content:: Geographic information");
  });

  it("handles deeply nested contributor structures without depth limits", () => {
    const out = toAsciiBib(
      {
        contributor: [
          {
            person: { name: { completename: { content: "A. Bierman", language: "en" } } },
            role: "author",
          },
        ],
      },
      "X",
    );
    expect(out).toContain("contributor::");
    expect(out).toContain("contributor.person.name.completename.content:: A. Bierman");
    expect(out).toContain("contributor.person.name.completename.language:: en");
    expect(out).toContain("contributor.role:: author");
  });

  it("skips null, undefined, and empty-string values", () => {
    const out = toAsciiBib({ edition: "", note: null, type: "standard" }, "X");
    expect(out).not.toContain("edition");
    expect(out).not.toContain("note");
    expect(out).toContain("type:: standard");
  });

  it("renders the spec's path-style example record faithfully", () => {
    const record = {
      id: "ISO/TC211",
      fetched: "2019-06-30",
      title: [{ type: "main", content: "Geographic information" }],
      type: "standard",
      docid: { type: "ISO", id: "ISO19115-1" },
      edition: "1",
      language: ["en", "fr"],
      date: [{ type: "issued", value: "2014" }],
      copyright: {
        owner: { name: "International Organization for Standardization", abbreviation: "ISO" },
        from: "2014",
        to: "2020",
      },
      link: [{ type: "src", content: "https://www.iso.org/standard/53798.html" }],
      contributor: [
        {
          organization: { name: "International Organization for Standardization" },
          role: { type: "publisher" },
        },
      ],
      keyword: ["Keyword", "Key Word"],
    };
    const out = toAsciiBib(record, "ISO-19115-1");
    expect(out).toContain("[[ISO-19115-1]]");
    expect(out).toContain("[%bibitem]");
    expect(out).toContain("== {blank}");
    expect(out).toContain("docid.type:: ISO");
    expect(out).toContain("docid.id:: ISO19115-1");
    expect(out).toContain("date::");
    expect(out).toContain("date.type:: issued");
    expect(out).toContain("date.value:: 2014");
    expect(out).toContain("copyright.owner.name:: International Organization for Standardization");
    expect(out).toContain("link.type:: src");
    expect(out).toContain("contributor.role.type:: publisher");
    expect(out).toContain("keyword:: Key Word");
  });
});
