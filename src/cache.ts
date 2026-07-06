import { createHash, randomBytes } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Where remote assets are cached (created on first write). */
export function defaultCacheDir(): string {
  return join(homedir(), ".qrgen", "cache");
}

/** Cache key for a URL: sha256 of the exact fetched URL (query + suffix). */
export function cacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

export interface CacheEntry {
  bytes: Buffer;
  mime: string;
}

/**
 * Read a cached asset, or `undefined` if absent or unreadable (a corrupt or
 * partial entry falls back to a re-fetch rather than poisoning the caller).
 */
export function readCacheEntry(key: string, dir: string): CacheEntry | undefined {
  try {
    const bytes = readFileSync(join(dir, key));
    const mime = readFileSync(join(dir, `${key}.type`), "utf8").trim();
    if (!mime) return undefined;
    return { bytes, mime };
  } catch {
    return undefined;
  }
}

/**
 * Temp filename for an in-progress write of `key`. UNIQUE per call (pid + random
 * suffix) so two concurrent in-process writers of the same URL never share a
 * temp file — neither can rename a file the other is mid-write on. Still ends in
 * `.tmp`, so `clearCache` sweeps abandoned temps.
 */
export function tempName(key: string): string {
  return `${key}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
}

/** Store an asset atomically: unique temp file → rename, plus a `<key>.type` sidecar. */
export function writeCacheEntry(key: string, entry: CacheEntry, dir: string): void {
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, tempName(key));
  writeFileSync(tmp, entry.bytes);
  renameSync(tmp, join(dir, key));
  writeFileSync(join(dir, `${key}.type`), `${entry.mime}\n`);
}

export interface ClearResult {
  /** Cached assets removed (bodies, not `.type` sidecars). */
  entries: number;
  /** Total bytes freed across every removed file. */
  bytes: number;
}

/** Delete the cache contents; report assets removed and bytes freed. */
export function clearCache(dir: string): ClearResult {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return { entries: 0, bytes: 0 };
  }
  let entries = 0;
  let bytes = 0;
  for (const name of names) {
    const p = join(dir, name);
    try {
      bytes += statSync(p).size;
      if (!name.endsWith(".type") && !name.endsWith(".tmp")) entries++;
      rmSync(p);
    } catch {
      // A file that vanished or won't stat is already effectively gone.
    }
  }
  return { entries, bytes };
}
