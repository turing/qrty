import { parse } from "tldts";

import iconMap from "../data/icon-map.json" with { type: "json" };

interface IconEntry {
  url: string;
  match: string[];
}

// keyword (lowercased) -> icon url. First entry wins on duplicate keywords.
const index = new Map<string, string>();
for (const entry of iconMap as IconEntry[]) {
  for (const key of entry.match) {
    const k = key.toLowerCase();
    if (!index.has(k)) index.set(k, entry.url);
  }
}

/**
 * Resolve the encoded data (a URL) to an icon URL, most-specific first:
 * full host → host without `www.` → registrable domain → registrable label.
 * Returns null when nothing matches.
 */
export function resolveAutoIconUrl(data: string): string | null {
  const { hostname, domain, domainWithoutSuffix } = parse(data);
  const candidates: string[] = [];
  if (hostname) {
    candidates.push(hostname);
    if (hostname.startsWith("www.")) candidates.push(hostname.slice(4));
  }
  if (domain) candidates.push(domain);
  if (domainWithoutSuffix) candidates.push(domainWithoutSuffix);

  for (const candidate of candidates) {
    const url = index.get(candidate.toLowerCase());
    if (url) return url;
  }
  return null;
}

/** All supported auto-icon selections (keyword → icon url), sorted. */
export function listSelections(): { match: string; url: string }[] {
  return [...index.entries()]
    .map(([match, url]) => ({ match, url }))
    .sort((a, b) => a.match.localeCompare(b.match));
}
