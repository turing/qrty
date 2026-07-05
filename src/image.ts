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

/**
 * Node/jsdom sizes an SVG from its intrinsic width/height; many icons ship only
 * a viewBox, which makes qr-code-styling fail to load them. Inject width/height
 * from the viewBox when they are missing.
 */
function ensureSvgDimensions(svg: string): string {
  const tag = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!tag) return svg;
  if (/\bwidth\s*=/i.test(tag) && /\bheight\s*=/i.test(tag)) return svg;
  const vb = tag.match(
    /viewBox\s*=\s*["']\s*[\d.eE+-]+\s+[\d.eE+-]+\s+([\d.eE+-]+)\s+([\d.eE+-]+)/i,
  );
  if (!vb) return svg;
  return svg.replace(tag, tag.replace(/<svg\b/i, `<svg width="${vb[1]}" height="${vb[2]}"`));
}

function toDataUri(mime: string, bytes: Buffer): ResolvedImage {
  if (mime === "image/svg+xml") {
    const svg = ensureSvgDimensions(bytes.toString("utf8"));
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
