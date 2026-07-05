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
  /** A value qr-code-styling accepts as `image` (data URI or URL). */
  image: string;
  /** Raster images need node-canvas to be sized; SVGs do not. */
  isRaster: boolean;
}

/**
 * Turn a profile `image` (file path, data URI, or http URL) into something
 * qr-code-styling can embed, inlining local files as self-contained data URIs.
 */
export function resolveImage(image: string): ResolvedImage {
  if (image.startsWith("data:")) {
    return { image, isRaster: !image.startsWith("data:image/svg+xml") };
  }
  if (image.startsWith("http://") || image.startsWith("https://")) {
    return { image, isRaster: !image.toLowerCase().endsWith(".svg") };
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
  return {
    image: `data:${mime};base64,${bytes.toString("base64")}`,
    isRaster: ext !== ".svg",
  };
}
