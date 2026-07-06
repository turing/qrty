import { existsSync } from "node:fs";
import { createRequire } from "node:module";

import { JSDOM } from "jsdom";
import type { Options } from "qr-code-styling";

import { QrgenError } from "./errors.ts";
import { resolveAutoIconUrl } from "./icons.ts";
import { resolveImage } from "./image.ts";
import type { Profile } from "./profiles.ts";
import { recolorStrategy, recolorSvgDataUri, simpleIconsRecolorUrl } from "./recolor.ts";

// qr-code-styling is CJS with an ESM .d.ts whose default export TypeScript
// mis-resolves under NodeNext. Load the class via require and describe the
// slice of its surface we use.
type FileExt = "svg" | "png" | "jpeg" | "webp";
interface QRInstance {
  getRawData(ext: FileExt): Promise<Buffer | Blob | null>;
}
interface QRCtor {
  new (options: Partial<Options>): QRInstance;
}
// qr-code-styling builds its matrix from `data`; for --restyle we inject a
// pre-extracted matrix by replacing `_qr` (whose consumed surface is only
// getModuleCount()/isDark()) and re-running `_setupSvg()`. These members are
// internal but typed in the package's .d.ts; pinned by the qr-code-styling version.
interface QRInjectable extends QRInstance {
  _qr?: { getModuleCount(): number; isDark(row: number, col: number): boolean };
  _svg?: unknown;
  _svgDrawingPromise?: Promise<void>;
  _setupSvg(): void;
}
const require = createRequire(import.meta.url);
const QRCodeStyling = require("qr-code-styling") as QRCtor;

export const DEFAULT_SIZE = 1024;

type Backend = "svg" | "canvas";

export function requireCanvas(): unknown {
  try {
    return require("canvas");
  } catch {
    throw new QrgenError(
      "PNG output and raster logos need the 'canvas' package. Install it " +
        "(npm install canvas) and approve its build script.",
    );
  }
}

async function toOptions(
  profile: Profile,
  url: string,
  size: number | undefined,
  type: Backend,
): Promise<Partial<Options>> {
  const px = size ?? profile.size ?? DEFAULT_SIZE;
  const options: Record<string, unknown> = {
    jsdom: JSDOM,
    type,
    data: url,
    width: px,
    height: px,
    margin: profile.margin ?? 0,
    shape: profile.shape ?? "square",
    qrOptions: { errorCorrectionLevel: profile.errorCorrectionLevel ?? "Q" },
    dotsOptions: profile.dots,
  };
  // Include optional blocks only when present — qr-code-styling reads into
  // them, so passing `undefined` overrides its defaults and crashes.
  if (profile.cornersSquare) options.cornersSquareOptions = profile.cornersSquare;
  if (profile.cornersDot) options.cornersDotOptions = profile.cornersDot;
  if (profile.background) options.backgroundOptions = profile.background;

  let needsCanvas = type === "canvas"; // PNG output always needs canvas
  // Explicit image wins; otherwise autoIcon detects one from the URL.
  const imageSource =
    profile.image ?? (profile.autoIcon ? resolveAutoIconUrl(url) : null);
  if (imageSource) {
    // recolorIcon paints the logo the QR's foreground color.
    const recolor = profile.recolorIcon
      ? profile.dots.color ??
        profile.cornersSquare?.color ??
        profile.labelColor ??
        "#000000"
      : null;
    const strategy = recolorStrategy(imageSource);
    const src =
      recolor && strategy === "url-suffix"
        ? simpleIconsRecolorUrl(imageSource, recolor)
        : imageSource;

    const { image, isRaster } = await resolveImage(src);
    // Simple Icons recolor via the URL above; other SVGs via our filter.
    options.image =
      recolor && !isRaster && strategy === "svg-filter"
        ? recolorSvgDataUri(image, recolor)
        : image;
    if (profile.imageOptions) options.imageOptions = profile.imageOptions;
    if (isRaster) needsCanvas = true; // raster logos must be sized via canvas
  }
  if (needsCanvas) options.nodeCanvas = requireCanvas();

  return options as unknown as Partial<Options>;
}

export async function renderSvg(
  profile: Profile,
  url: string,
  size?: number,
): Promise<Buffer> {
  const qr = new QRCodeStyling(await toOptions(profile, url, size, "svg"));
  return (await qr.getRawData("svg")) as Buffer;
}

export async function renderPng(
  profile: Profile,
  url: string,
  size?: number,
): Promise<Buffer> {
  const qr = new QRCodeStyling(await toOptions(profile, url, size, "canvas"));
  return (await qr.getRawData("png")) as Buffer;
}

/**
 * Render an already-known module matrix in the profile's style (for `--restyle`),
 * reusing qr-code-styling's full renderer. The three finder patterns are drawn as
 * the profile's styled corners; every other dark module is a styled dot — so an
 * artistic pattern is reproduced exactly, with real dot/gradient styling. Returns
 * the SVG string (PNG goes through `svgToPng`).
 */
export async function renderRestyleSvg(
  profile: Profile,
  matrix: boolean[][],
  size?: number,
): Promise<string> {
  const px = size ?? profile.size ?? DEFAULT_SIZE;
  const n = matrix.length;
  const options: Record<string, unknown> = {
    jsdom: JSDOM,
    type: "svg",
    data: "0", // placeholder; replaced by the injected matrix below
    width: px,
    height: px,
    margin: profile.margin ?? 0,
    shape: profile.shape ?? "square",
    qrOptions: { errorCorrectionLevel: profile.errorCorrectionLevel ?? "Q" },
    dotsOptions: profile.dots,
  };
  if (profile.cornersSquare) options.cornersSquareOptions = profile.cornersSquare;
  if (profile.cornersDot) options.cornersDotOptions = profile.cornersDot;
  if (profile.background) options.backgroundOptions = profile.background;

  const qr = new QRCodeStyling(
    options as unknown as Partial<Options>,
  ) as unknown as QRInjectable;
  await qr.getRawData("svg"); // initial draw from the placeholder data
  qr._qr = { getModuleCount: () => n, isDark: (r, c) => Boolean(matrix[r]?.[c]) };
  qr._svg = undefined;
  qr._setupSvg();
  await qr._svgDrawingPromise;
  return ((await qr.getRawData("svg")) as Buffer).toString("utf8");
}

interface CanvasCtx {
  fillStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(img: unknown, x: number, y: number): void;
  drawImage(img: unknown, x: number, y: number, w: number, h: number): void;
  measureText(s: string): { width: number };
  fillText(s: string, x: number, y: number): void;
}
interface CanvasLike {
  getContext(t: "2d"): CanvasCtx;
  toBuffer(m: "image/png"): Buffer;
}
interface CanvasModule {
  loadImage(src: Buffer): Promise<{ width: number; height: number }>;
  createCanvas(w: number, h: number): CanvasLike;
  registerFont(path: string, opts: { family: string }): void;
}

/**
 * Rasterize an SVG string to a `px`x`px` PNG. Used by the --restyle path,
 * which has no qr-code-styling instance to rasterize through.
 */
export async function svgToPng(svg: string, px: number): Promise<Buffer> {
  const canvas = requireCanvas() as CanvasModule;
  const img = await canvas.loadImage(Buffer.from(svg));
  const c = canvas.createCanvas(px, px);
  c.getContext("2d").drawImage(img, 0, 0, px, px);
  return c.toBuffer("image/png");
}

// node-canvas ships no fonts; register a system one once, else text is tofu.
let labelFont: string | null = null;
let fontRegistered = false;
function ensureLabelFont(canvas: CanvasModule): string {
  if (fontRegistered) return labelFont ?? "sans-serif";
  fontRegistered = true;
  const candidates: [string, string][] = [
    ["/System/Library/Fonts/Supplemental/Arial.ttf", "Arial"],
    ["/System/Library/Fonts/Helvetica.ttc", "Helvetica"],
    ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVu Sans"],
  ];
  for (const [path, family] of candidates) {
    if (!existsSync(path)) continue;
    try {
      canvas.registerFont(path, { family });
      labelFont = family;
      break;
    } catch {
      /* try the next candidate */
    }
  }
  return labelFont ?? "sans-serif";
}

/**
 * Draw a width-constrained caption below a QR PNG (native canvas text, so it
 * matches the SVG label but renders crisply). Mirrors label.ts's geometry.
 */
export async function labelPng(
  qrPng: Buffer,
  opts: {
    text: string;
    color: string;
    background?: string;
    font?: { path: string; family: string };
  },
): Promise<Buffer> {
  const canvas = requireCanvas() as CanvasModule;
  let family: string;
  if (opts.font) {
    canvas.registerFont(opts.font.path, { family: opts.font.family });
    family = opts.font.family;
  } else {
    family = ensureLabelFont(canvas);
  }
  const img = await canvas.loadImage(qrPng);
  const w = img.width;
  const h = img.height;
  const stripH = Math.round(w * 0.14);
  const c = canvas.createCanvas(w, h + stripH);
  const ctx = c.getContext("2d");

  if (opts.background && opts.background !== "transparent") {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, w, h + stripH);
  }
  ctx.drawImage(img, 0, 0);

  const pad = w * 0.06;
  let fontSize = Math.min(
    stripH * 0.62,
    (w - 2 * pad) / (0.56 * Math.max(opts.text.length, 1)),
  );
  ctx.fillStyle = opts.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${fontSize}px ${family}`;
  while (ctx.measureText(opts.text).width > w - 2 * pad && fontSize > 6) {
    fontSize -= 1;
    ctx.font = `${fontSize}px ${family}`;
  }
  ctx.fillText(opts.text, w / 2, h + stripH * 0.5);
  return c.toBuffer("image/png");
}
