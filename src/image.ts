import { readFileSync } from "node:fs";
import { extname } from "node:path";

import {
  cacheKey,
  defaultCacheDir,
  readCacheEntry,
  writeCacheEntry,
} from "./cache.ts";
import { QrgenError } from "./errors.ts";
import { expandHome } from "./paths.ts";

const MIME: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export interface ResolvedImage {
  /** A `data:` URI qr-code-styling can embed. */
  image: string;
  /** Raster images need node-canvas to be sized; SVGs do not. */
  isRaster: boolean;
}

const ICON_TARGET_PX = 1024;

/**
 * Normalize a logo SVG's intrinsic size to a large value (preserving aspect).
 * node-canvas rasterizes an SVG at its width/height, so a 24×24 icon (Simple
 * Icons) would upscale to a blur; forcing ~1024px keeps it crisp in the PNG.
 * Also required because jsdom cannot size a viewBox-only SVG at all.
 */
function normalizeSvgSize(svg: string, target = ICON_TARGET_PX): string {
  const tag = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!tag) return svg;
  const vb = tag.match(
    /viewBox\s*=\s*["']\s*[\d.eE+-]+\s+[\d.eE+-]+\s+([\d.eE+-]+)\s+([\d.eE+-]+)/i,
  );
  let w = vb ? Number(vb[1]) : Number(tag.match(/\bwidth\s*=\s*"([\d.]+)/i)?.[1]);
  let h = vb ? Number(vb[2]) : Number(tag.match(/\bheight\s*=\s*"([\d.]+)/i)?.[1]);
  if (!w || !h) return svg;
  const scale = target / Math.max(w, h);
  const nw = Math.round(w * scale);
  const nh = Math.round(h * scale);

  let newTag = tag;
  newTag = /\bwidth\s*=/i.test(newTag)
    ? newTag.replace(/\bwidth\s*=\s*"[^"]*"/i, `width="${nw}"`)
    : newTag.replace(/<svg\b/i, `<svg width="${nw}"`);
  newTag = /\bheight\s*=/i.test(newTag)
    ? newTag.replace(/\bheight\s*=\s*"[^"]*"/i, `height="${nh}"`)
    : newTag.replace(/<svg\b/i, `<svg height="${nh}"`);
  return svg.replace(tag, newTag);
}

function toDataUri(mime: string, bytes: Buffer): ResolvedImage {
  if (mime === "image/svg+xml") {
    const svg = normalizeSvgSize(bytes.toString("utf8"));
    return {
      image: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      isRaster: false,
    };
  }
  return {
    image: `data:${mime};base64,${bytes.toString("base64")}`,
    isRaster: true,
  };
}

/**
 * Does the body look like an image? The header is not enough — svgrepo and
 * brandfetch answer HTTP 200 with an HTML gate, which must never be cached or
 * embedded. Trust an `image/*` MIME, else sniff the leading magic bytes.
 */
function looksLikeImage(mime: string, bytes: Buffer): boolean {
  if (mime.startsWith("image/")) return true;
  const head = bytes.subarray(0, 12);
  const text = head.toString("utf8").trimStart().toLowerCase();
  if (text.startsWith("<svg") || text.startsWith("<?xml")) return true;
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47)
    return true; // PNG
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true; // JPEG
  if (head.subarray(0, 4).toString("ascii") === "GIF8") return true; // GIF
  if (
    head.subarray(0, 4).toString("ascii") === "RIFF" &&
    head.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return true; // WEBP
  return false;
}

export interface FetchAssetOptions {
  /** Cache directory override (defaults to `~/.qrgen/cache`); injected in tests. */
  cacheDir?: string;
}

/**
 * Fetch a remote asset through the on-disk cache: each URL downloads once, then
 * serves from `~/.qrgen/cache`. Only 2xx image responses are cached — a non-2xx
 * or a non-image body throws `QrgenError` and leaves the cache untouched.
 */
export async function fetchAsset(
  url: string,
  opts: FetchAssetOptions = {},
): Promise<{ bytes: Buffer; mime: string }> {
  const dir = opts.cacheDir ?? defaultCacheDir();
  const key = cacheKey(url);
  const hit = readCacheEntry(key, dir);
  if (hit) return hit;

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new QrgenError(
      `Could not fetch logo ${url}: ${(err as Error).message}`,
    );
  }
  if (!res.ok) {
    throw new QrgenError(`Could not fetch logo ${url}: HTTP ${res.status}`);
  }
  const headerType = (res.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim();
  const ext = extname(new URL(url).pathname).toLowerCase();
  const mime = headerType || MIME[ext] || "";
  if (!mime) {
    throw new QrgenError(`Could not determine logo type for ${url}.`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!looksLikeImage(mime, bytes)) {
    throw new QrgenError(
      `Could not fetch logo ${url}: response was not an image.`,
    );
  }
  writeCacheEntry(key, { bytes, mime }, dir);
  return { bytes, mime };
}

/**
 * Turn a profile `image` (file path, `data:` URI, or http(s) URL) into a
 * self-contained `data:` URI. Local files are read and remote URLs are fetched
 * (through the disk cache) and inlined — qr-code-styling cannot load either
 * directly in Node.
 */
export async function resolveImage(
  image: string,
  opts: FetchAssetOptions = {},
): Promise<ResolvedImage> {
  if (image.startsWith("data:")) {
    return { image, isRaster: !image.startsWith("data:image/svg+xml") };
  }

  if (image.startsWith("http://") || image.startsWith("https://")) {
    const { bytes, mime } = await fetchAsset(image, opts);
    return toDataUri(mime, bytes);
  }

  const path = expandHome(image);
  const ext = extname(path).toLowerCase();
  const mime = MIME[ext];
  if (!mime) {
    throw new QrgenError(
      `Unsupported logo type '${ext || "(none)"}' for ${path}. ` +
        `Use svg, png, jpg, webp, or gif.`,
    );
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new QrgenError(`Logo not found: ${path}`);
  }
  return toDataUri(mime, bytes);
}
