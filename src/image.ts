import { readFileSync } from "node:fs";
import { extname } from "node:path";

import {
  cacheKey,
  defaultCacheDir,
  readCacheEntry,
  trimCache,
  writeCacheEntry,
} from "./cache.ts";
import { QrtyError } from "./errors.ts";
import { fetchOrThrow } from "./fetch.ts";
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

/**
 * Decode the SVG text from a `data:image/svg+xml` URI — base64 (`;base64,`) or
 * utf8/percent-encoded — or `null` if the URI is malformed. Only called for URIs
 * already known to start with `data:image/svg+xml`.
 */
function decodeSvgDataUri(uri: string): string | null {
  const m = uri.match(/^data:image\/svg\+xml([^,]*),([\s\S]*)$/i);
  if (!m) return null;
  try {
    return /;base64/i.test(m[1])
      ? Buffer.from(m[2], "base64").toString("utf8")
      : decodeURIComponent(m[2]);
  } catch {
    return null;
  }
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
 * Sniff a body's leading magic bytes and return the canonical image MIME, or
 * `null` if it is not a recognized image. The header alone is not enough —
 * svgrepo and brandfetch answer HTTP 200 with an HTML gate (rejected here), and
 * some hosts serve a real image under `application/octet-stream` or `text/plain`
 * (corrected here). Covers svg/`<?xml`, PNG, JPEG, GIF, and RIFF…WEBP.
 */
function sniffImageMime(bytes: Buffer): string | null {
  const head = bytes.subarray(0, 12);
  const text = head.toString("utf8").trimStart().toLowerCase();
  if (text.startsWith("<svg") || text.startsWith("<?xml")) return "image/svg+xml";
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47)
    return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (
    head.subarray(0, 4).toString("ascii") === "RIFF" &&
    head.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  return null;
}

export interface FetchAssetOptions {
  /** Cache directory override (defaults to `~/.qrty/cache`); injected in tests. */
  cacheDir?: string;
  /** Cache-size ceiling in bytes (defaults to trimCache's DEFAULT_MAX_CACHE_BYTES); injected in tests. */
  maxCacheBytes?: number;
}

/**
 * Fetch a remote asset through the on-disk cache: each URL downloads once, then
 * serves from `~/.qrty/cache`. Only 2xx image responses are cached — a non-2xx
 * or a non-image body throws `QrtyError` and leaves the cache untouched.
 */
export async function fetchAsset(
  url: string,
  opts: FetchAssetOptions = {},
): Promise<{ bytes: Buffer; mime: string }> {
  const dir = opts.cacheDir ?? defaultCacheDir();
  const key = cacheKey(url);
  const hit = readCacheEntry(key, dir);
  if (hit) return hit;

  const { bytes, contentType } = await fetchOrThrow(url, `logo ${url}`);
  const headerType = contentType.split(";")[0].trim();
  const ext = extname(new URL(url).pathname).toLowerCase();
  const headerMime = headerType || MIME[ext] || "";

  // Trust an explicit `image/*` header; otherwise let the body's magic bytes
  // decide, so a real image served under `application/octet-stream` or
  // `text/plain` gets its canonical MIME instead of the wrong header value.
  let mime: string;
  if (headerMime.startsWith("image/")) {
    mime = headerMime;
  } else {
    const sniffed = sniffImageMime(bytes);
    if (!sniffed) {
      throw new QrtyError(
        `Could not fetch logo ${url}: response was not an image.`,
      );
    }
    mime = sniffed;
  }

  writeCacheEntry(key, { bytes, mime }, dir);
  trimCache(dir, opts.maxCacheBytes);
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
    if (image.startsWith("data:image/svg+xml")) {
      const svg = decodeSvgDataUri(image);
      if (svg !== null) return toDataUri("image/svg+xml", Buffer.from(svg, "utf8"));
      // malformed → fall through to verbatim passthrough
    }
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
    throw new QrtyError(
      `Unsupported logo type '${ext || "(none)"}' for ${path}. ` +
        `Use svg, png, jpg, webp, or gif.`,
    );
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new QrtyError(`Logo not found: ${path}`);
  }
  return toDataUri(mime, bytes);
}
