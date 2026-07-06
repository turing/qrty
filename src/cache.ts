import { createHash } from "node:crypto";
import {
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { qrgenHome } from "./paths.ts";
import { atomicWrite } from "./fs.ts";

/** Where remote assets are cached (created on first write). */
export function defaultCacheDir(): string {
  return join(qrgenHome(), "cache");
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

/** Store an asset atomically: unique temp file → rename, plus a `<key>.type` sidecar. */
export function writeCacheEntry(key: string, entry: CacheEntry, dir: string): void {
  atomicWrite(join(dir, key), entry.bytes);
  writeFileSync(join(dir, `${key}.type`), `${entry.mime}\n`);
}

export const DEFAULT_MAX_CACHE_BYTES = 256 * 1024 * 1024; // 256 MiB backstop

/**
 * Evict oldest entries (by body mtime) until the cache dir's total size is within
 * `maxBytes`. Each entry is a `<key>` body plus its `<key>.type` sidecar, removed
 * together. `.tmp` files (transient write temps, and orphans left by a write that
 * failed mid-rename, e.g. ENOSPC) are ignored entirely — never counted toward the
 * total and never evicted — so orphan cruft can never force real entries out;
 * `clearCache` sweeps them. No-op when the dir is missing or already under the
 * ceiling; best-effort (never throws on a vanished file). Ordering is by body
 * mtime; on a coarse-resolution filesystem two same-tick writes tie and fall back
 * to `readdir` order — acceptable, since eviction is a rare backstop event.
 */
export function trimCache(dir: string, maxBytes: number = DEFAULT_MAX_CACHE_BYTES): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  let total = 0;
  const size = new Map<string, number>();
  const bodies: { key: string; mtimeMs: number }[] = [];
  for (const name of names) {
    if (name.endsWith(".tmp")) continue; // transient temp; ignore for the ceiling
    let st;
    try {
      st = statSync(join(dir, name));
    } catch {
      continue;
    }
    total += st.size;
    size.set(name, st.size);
    if (!name.endsWith(".type")) {
      bodies.push({ key: name, mtimeMs: st.mtimeMs });
    }
  }
  if (total <= maxBytes) return;
  bodies.sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first
  for (const { key } of bodies) {
    if (total <= maxBytes) break;
    for (const f of [key, `${key}.type`]) {
      try {
        rmSync(join(dir, f));
        total -= size.get(f) ?? 0;
      } catch {
        // already gone
      }
    }
  }
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
