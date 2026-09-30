// Collections are datasets (one relaton-data-* repository); publishers
// are the standards bodies behind them. Several collections share one
// publisher (ITU: itu, itu-r; IETF: ietf, rfcs, rfcsubseries), so logos
// and grouping resolve through this mapping. Collections without an
// entry are their own publisher.

export interface Publisher {
  name: string;
  /** Logo key under https://www.relaton.org/logos/ */
  logo: string;
}

export const PUBLISHERS: Record<string, Publisher> = {
  itu: { name: "International Telecommunication Union", logo: "itu" },
  "itu-r": { name: "International Telecommunication Union", logo: "itu" },
  ietf: { name: "Internet Engineering Task Force", logo: "ietf" },
  rfcs: { name: "Internet Engineering Task Force", logo: "ietf" },
  rfcsubseries: { name: "Internet Engineering Task Force", logo: "ietf" },
};

const PNG_LOGOS = new Set(["omg", "cenelec"]);

export function publisherOf(collection: string): Publisher {
  return PUBLISHERS[collection] ?? { name: collection, logo: collection };
}

export function logoUrl(collection: string): string | null {
  const { logo } = publisherOf(collection);
  if (!/^[a-z0-9-]+$/.test(logo)) return null;
  const ext = PNG_LOGOS.has(logo) ? "png" : "svg";
  return `https://www.relaton.org/logos/${logo}-logo.${ext}`;
}
