import { readFileSync } from "node:fs";
import { extname } from "node:path";

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
 * Turn a profile `image` (file path, `data:` URI, or http(s) URL) into a
 * self-contained `data:` URI. Local files are read and remote URLs are fetched
 * and inlined — qr-code-styling cannot load either directly in Node.
 */
export async function resolveImage(image: string): Promise<ResolvedImage> {
  if (image.startsWith("data:")) {
    return { image, isRaster: !image.startsWith("data:image/svg+xml") };
  }

  if (image.startsWith("http://") || image.startsWith("https://")) {
    let res: Response;
    try {
      res = await fetch(image);
    } catch (err) {
      throw new QrgenError(
        `Could not fetch logo ${image}: ${(err as Error).message}`,
      );
    }
    if (!res.ok) {
      throw new QrgenError(`Could not fetch logo ${image}: HTTP ${res.status}`);
    }
    const headerType = (res.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim();
    const ext = extname(new URL(image).pathname).toLowerCase();
    const mime = headerType || MIME[ext] || "";
    if (!mime) {
      throw new QrgenError(`Could not determine logo type for ${image}.`);
    }
    return toDataUri(mime, Buffer.from(await res.arrayBuffer()));
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
