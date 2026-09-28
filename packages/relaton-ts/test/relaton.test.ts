import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse, parseItem, toYaml } from "../src/index.js";
import type { IetfItem } from "../src/generated/ietf_item.js";
import { parse as parseYaml } from "yaml";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const files = readdirSync(FIXTURES).filter((f) => f.endsWith(".yaml"));

describe("golden corpus fixtures", () => {
  it.each(files)("%s parses and round-trips losslessly", (file) => {
    const text = readFileSync(join(FIXTURES, file), "utf8");
    const source = parseYaml(text);

    const result = parse(text);
    if (!result.ok) {
      throw new Error(
        `parse failed: ${JSON.stringify(result.errors, null, 2).slice(0, 2000)}`,
      );
    }

    // The parsed item carries exactly the source data — no keys dropped,
    // no values rewritten.
    expect(result.item).toEqual(source);

    // And the YAML round-trip preserves the data too.
    const reparsed = parse(toYaml(result.item));
    expect(reparsed.ok).toBe(true);
    expect(reparsed.ok && reparsed.item).toEqual(source);
  });

  it.each(files.filter((f) => f.startsWith("rfc")))(
    "%s parses as the IETF flavor",
    (file) => {
      const text = readFileSync(join(FIXTURES, file), "utf8");
      const result = parse(text);
      expect(result.ok).toBe(true);
      const item = (result.ok && result.item) as IetfItem;
      expect(item.ext?.doctype?.content).toBe("rfc");
    },
  );
});

describe("validation", () => {
  it("rejects an invalid series type", () => {
    const result = parseItem({
      docidentifier: [{ content: "RFC 1", type: "IETF", primary: true }],
      series: [{ type: "stream", title: [{ content: "Legacy" }] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(JSON.stringify(result.errors)).toMatch(/series/i);
    }
  });

  it("rejects an out-of-enum ext.stream", () => {
    const result = parseItem({
      docidentifier: [{ content: "RFC 1", type: "IETF", primary: true }],
      ext: { flavor: "ietf", doctype: { content: "rfc" }, stream: "Foobar" },
    });
    expect(result.ok).toBe(false);
  });

  it("accepts the canonical stream spellings", () => {
    for (const stream of ["IAB", "IETF", "Independent", "IRTF", "Legacy", "Editorial"]) {
      const result = parseItem({
        docidentifier: [{ content: "RFC 1", type: "IETF", primary: true }],
        ext: { flavor: "ietf", doctype: { content: "rfc" }, stream },
      });
      expect(result.ok, stream).toBe(true);
    }
  });

  it("rejects unknown top-level keys", () => {
    const result = parseItem({ docid: [{ id: "RFC 1" }], bogus: true });
    expect(result.ok).toBe(false);
  });

  it("parses recursive relation chains", () => {
    const doc = {
      docidentifier: [{ content: "STD 66", type: "IETF", primary: true }],
      relation: [
        {
          type: "includes",
          bibitem: {
            docidentifier: [{ content: "RFC 3986", type: "IETF", primary: true }],
            relation: [
              {
                type: "includes",
                bibitem: {
                  formattedref: { content: "RFC 1915", format: "text/plain" },
                },
              },
            ],
          },
        },
      ],
    };
    const result = parseItem(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rel = (result.item as { relation?: unknown[] }).relation?.[0] as {
        bibitem?: { relation?: unknown[] };
      };
      const nested = rel.bibitem?.relation?.[0] as { type?: string };
      expect(nested.type).toBe("includes");
    }
  });
});

describe("choice exclusivity", () => {
  // The emitters do not honor choice presence (lutaml/lutaml-model#869),
  // so absent members are fine — but two groups at once is invalid.
  it("accepts a date with no choice member and a type", () => {
    const result = parseItem({
      docidentifier: [{ content: "RFC 1", type: "IETF", primary: true }],
      date: [{ type: "published" }],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a date with at together with from", () => {
    const result = parseItem({
      docidentifier: [{ content: "RFC 1", type: "IETF", primary: true }],
      date: [{ type: "published", at: "1969-04", from: "1969-04" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(JSON.stringify(result.errors)).toMatch(/choice group/);
    }
  });

  it("accepts from together with to (one group, max 2)", () => {
    const result = parseItem({
      docidentifier: [{ content: "RFC 1", type: "IETF", primary: true }],
      date: [{ from: "1969-04", to: "1969-05" }],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a relation carrying locality and locality_stack", () => {
    const result = parseItem({
      docidentifier: [{ content: "RFC 1", type: "IETF", primary: true }],
      relation: [
        {
          type: "includes",
          bibitem: { formattedref: { content: "RFC 2", format: "text/plain" } },
          locality: [{ content: "section" }],
          locality_stack: [{ content: "section" }],
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a relation with neither choice group present", () => {
    const result = parseItem({
      docidentifier: [{ content: "RFC 1", type: "IETF", primary: true }],
      relation: [
        {
          type: "includes",
          bibitem: { formattedref: { content: "RFC 2", format: "text/plain" } },
        },
      ],
    });
    expect(result.ok).toBe(true);
  });
});
