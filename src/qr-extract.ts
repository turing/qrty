import { QrgenError } from "./errors.ts";
import { requireCanvas } from "./render.ts";

// node-canvas decodes a local file path or Buffer assigned to `Image#src`
// synchronously (only remote http(s) URLs go through its async fetch path),
// so this stays a plain sync function — no `loadImage` (Promise-based) needed.
interface CanvasImage {
  width: number;
  height: number;
  src: string;
}
interface Ctx2D {
  drawImage(img: CanvasImage, x: number, y: number): void;
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
}
interface CanvasLike {
  getContext(t: "2d"): Ctx2D;
}
interface CanvasModule {
  Image: new () => CanvasImage;
  createCanvas(w: number, h: number): CanvasLike;
}

const MIN_UNIT_PX = 3;

// Standard QR finder pattern: dark 7x7 ring, white 5x5 ring, dark 3x3 centre.
const FINDER: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1],
];

function finderMatchesAt(m: boolean[][], r0: number, c0: number): boolean {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      if (m[r0 + r][c0 + c] !== (FINDER[r][c] === 1)) return false;
    }
  }
  return true;
}

function validFinders(m: boolean[][], n: number): boolean {
  return (
    finderMatchesAt(m, 0, 0) &&
    finderMatchesAt(m, 0, n - 7) &&
    finderMatchesAt(m, n - 7, 0)
  );
}

function validTiming(m: boolean[][], n: number): boolean {
  for (let i = 8; i <= n - 9; i++) {
    const expectedDark = (i - 8) % 2 === 0; // strictly alternating, starts dark
    if (m[6][i] !== expectedDark) return false;
    if (m[i][6] !== expectedDark) return false;
  }
  return true;
}

function unreadable(pngPath: string): QrgenError {
  return new QrgenError(
    `Could not read a QR grid from ${pngPath} (need a clean, axis-aligned QR image).`,
  );
}

/** Reads the module grid (true = dark) from a clean, axis-aligned QR PNG. */
export function extractMatrix(pngPath: string): boolean[][] {
  const canvas = requireCanvas() as CanvasModule;
  const img = new canvas.Image();
  img.src = pngPath;
  const { width, height } = img;

  const surface = canvas.createCanvas(width, height);
  const ctx = surface.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);

  const dark = (x: number, y: number): boolean => {
    const xi = Math.min(Math.max(Math.round(x), 0), width - 1);
    const yi = Math.min(Math.max(Math.round(y), 0), height - 1);
    const i = (yi * width + xi) * 4;
    const a = data[i + 3];
    if (a <= 128) return false;
    const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return luminance < 128;
  };

  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!dark(x, y)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw unreadable(pngPath);

  const bboxW = x1 - x0 + 1;
  const bboxH = y1 - y0 + 1;

  for (let v = 1; v <= 40; v++) {
    const n = 17 + 4 * v;
    const unit = bboxW / n;
    if (unit < MIN_UNIT_PX) continue;
    const unitY = bboxH / n;

    const m: boolean[][] = [];
    for (let r = 0; r < n; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < n; c++) {
        row.push(dark(x0 + (c + 0.5) * unit, y0 + (r + 0.5) * unitY));
      }
      m.push(row);
    }
    if (validFinders(m, n) && validTiming(m, n)) return m;
  }
  throw unreadable(pngPath);
}
