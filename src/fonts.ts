import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import subsetFont from "subset-font";

import { QrgenError } from "./errors.ts";
import { qrgenHome } from "./paths.ts";
import { fetchOrThrow } from "./fetch.ts";
import { atomicWrite } from "./fs.ts";

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
export async function ensureFontFile(
  name: string,
  opts: { cacheDir?: string } = {},
): Promise<string> {
  const f = def(name);
  const dir = opts.cacheDir ?? CACHE;
  const path = join(dir, f.file);
  if (existsSync(path)) return path;
  const { bytes } = await fetchOrThrow(f.url, `font ${name}`);
  // Sweep any stale temp orphaned by a crashed prior write (atomicWrite writes
  // `<file>.<pid>.<rand>.tmp` then renames); this dir has no other cleaner.
  try {
    for (const n of readdirSync(dir)) {
      if (n.startsWith(`${f.file}.`) && n.endsWith(".tmp")) rmSync(join(dir, n));
    }
  } catch {
    // dir absent — atomicWrite will create it; nothing to sweep
  }
  atomicWrite(path, bytes);
  return path;
}

