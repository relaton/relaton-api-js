// Citation rendering shared by POST /v3/cite (#177) and POST /v3/validate
// (#182). The rendering lives entirely in the relaton-ts renderers — the
// worker adds no rendering logic of its own (the parity laws live there).
import { toIso690 } from "relaton/dist/iso690.js";
import { toBibtex } from "relaton/dist/bibtex.js";
import { toRis } from "relaton/dist/ris.js";
import { toCslJson } from "relaton/dist/csl.js";

export const CITE_STYLES = ["iso690", "chicago", "apa", "mla", "bibtex", "ris", "csl-json"] as const;
export type CiteStyle = (typeof CITE_STYLES)[number];

export function isCiteStyle(style: string): style is CiteStyle {
  return (CITE_STYLES as readonly string[]).includes(style);
}

export function renderCitation(data: Record<string, unknown>, style: CiteStyle, lang?: string): string {
  const item = data as never;
  switch (style) {
    case "bibtex": return toBibtex(item);
    case "ris": return toRis(item);
    case "csl-json": return toCslJson(item);
    default: {
      const opts: { lang?: string; style?: string } = {};
      if (lang) opts.lang = lang;
      if (style !== "iso690") opts.style = style;
      return toIso690(item, opts);
    }
  }
}
