import { createHash } from "node:crypto";
import { parse } from "tldts";

const UNSAFE = /[^A-Za-z0-9.]/g;

/**
 * Filename label for a URL: the registrable domain's main label
 * (youtube.com -> "youtube", bbc.co.uk -> "bbc"), or the host IP, or "qr".
 */
export function labelFor(url: string): string {
  const { hostname, domainWithoutSuffix, isIp } = parse(url);
  if (isIp && hostname) {
    return hostname.replace(UNSAFE, "-");
  }
  if (domainWithoutSuffix) {
    return domainWithoutSuffix.replace(UNSAFE, "-");
  }
  return "qr";
}

/** `<label>-<profile>-<hash>-qr`; hash is the first 12 hex of sha256(url). */
export function deriveStem(url: string, profile: string): string {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 12);
  return `${labelFor(url)}-${profile}-${hash}-qr`;
}
