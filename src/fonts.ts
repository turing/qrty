import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import subsetFont from "subset-font";

import { QrgenError } from "./errors.ts";
import { qrgenHome } from "./paths.ts";

interface FontDef {
  family: string;
  file: string;
  url: string; // Google Fonts TTF (google/fonts mirror)
}

const FONTS: Record<string, FontDef> = {
  "Open Sans": {
    family: "Open Sans",
    file: "OpenSans.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/opensans/OpenSans%5Bwdth,wght%5D.ttf",
  },
  Roboto: {
    family: "Roboto",
    file: "Roboto.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto%5Bwdth,wght%5D.ttf",
  },
  Montserrat: {
    family: "Montserrat",
    file: "Montserrat.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf",
  },
};

export const LABEL_FONTS = Object.keys(FONTS);

const CACHE = join(qrgenHome(), "fonts");

function def(name: string): FontDef {
  const f = FONTS[name];
  if (!f) {
    throw new QrgenError(
      `Unknown labelFont '${name}'. Use one of: ${LABEL_FONTS.join(", ")}.`,
    );
  }
  return f;
}

export function fontFamily(name: string): string {
  return def(name).family;
}

/**
 * A self-contained `@font-face` for the SVG: the font subset to just `text`'s
 * characters, base64-embedded so the SVG renders the label offline.
 */
export async function fontFaceCss(name: string, text: string): Promise<string> {
  const path = await ensureFontFile(name);
  const subset = await subsetFont(readFileSync(path), text, {
    targetFormat: "truetype",
  });
  const b64 = subset.toString("base64");
  return `@font-face{font-family:'${def(name).family}';src:url(data:font/ttf;base64,${b64})}`;
}

/** Download (once) and cache the TTF; returns its path (for PNG registerFont). */
export async function ensureFontFile(name: string): Promise<string> {
  const f = def(name);
  const path = join(CACHE, f.file);
  if (existsSync(path)) return path;

  let res: Response;
  try {
    res = await fetch(f.url);
  } catch (err) {
    throw new QrgenError(`Could not fetch font ${name}: ${(err as Error).message}`);
  }
  if (!res.ok) {
    throw new QrgenError(`Could not fetch font ${name}: HTTP ${res.status}`);
  }
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

// exported for testing the cache read path
export function readCachedFont(path: string): Buffer {
  return readFileSync(path);
}
