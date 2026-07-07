import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractMatrix } from "./qr-extract.ts";
import { QrtyError } from "./errors.ts";

const require = createRequire(import.meta.url);

interface CanvasCtx2D {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
}
interface CanvasLike {
  getContext(t: "2d"): CanvasCtx2D;
  toBuffer(m: "image/png"): Buffer;
}
interface CanvasModule {
  createCanvas(w: number, h: number): CanvasLike;
}

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

function placeFinder(m: boolean[][], r0: number, c0: number): void {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      m[r0 + r][c0 + c] = FINDER[r][c] === 1;
    }
  }
}

/** A 21x21 matrix with valid finders + timing, plus a few sparse data cells. */
function buildMatrix(): boolean[][] {
  const n = 21;
  const m: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
  placeFinder(m, 0, 0);
  placeFinder(m, 0, n - 7);
  placeFinder(m, n - 7, 0);
  for (let i = 8; i <= n - 9; i++) {
    const dark = (i - 8) % 2 === 0; // starts dark
    m[6][i] = dark;
    m[i][6] = dark;
  }
  // Sparse arbitrary data cells, clear of finder/timing regions.
  m[9][9] = true;
  m[10][12] = true;
  m[13][9] = true;
  return m;
}

function tmpPngPath(name: string): string {
  return join(mkdtempSync(join(tmpdir(), "qrty-extract-")), name);
}

/** Renders a module matrix to a PNG: white background, dark rects per module,
 * quiet-zone border of `quietModules`, at `pxPerModule` (may be non-integer). */
function renderMatrixToPng(
  matrix: boolean[][],
  pxPerModule: number,
  quietModules: number,
  file: string,
): void {
  const canvas = require("canvas") as CanvasModule;
  const n = matrix.length;
  const totalModules = n + 2 * quietModules;
  const sizePx = Math.round(totalModules * pxPerModule);
  const c = canvas.createCanvas(sizePx, sizePx);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sizePx, sizePx);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      if (!matrix[r][col]) continue;
      const x = (quietModules + col) * pxPerModule;
      const y = (quietModules + r) * pxPerModule;
      ctx.fillRect(x, y, pxPerModule, pxPerModule);
    }
  }
  writeFileSync(file, c.toBuffer("image/png"));
}

test("extractMatrix round-trips a known matrix at integer px/module", () => {
  const matrix = buildMatrix();
  const file = tmpPngPath("integer.png");
  renderMatrixToPng(matrix, 10, 4, file);
  assert.deepEqual(extractMatrix(file), matrix);
});

test("extractMatrix round-trips a known matrix at non-integer px/module", () => {
  const matrix = buildMatrix();
  const file = tmpPngPath("non-integer.png");
  renderMatrixToPng(matrix, 8.3, 3, file);
  assert.deepEqual(extractMatrix(file), matrix);
});

test("extractMatrix throws QrtyError on a blank image", () => {
  const canvas = require("canvas") as CanvasModule;
  const c = canvas.createCanvas(200, 200);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 200, 200);
  const file = tmpPngPath("blank.png");
  writeFileSync(file, c.toBuffer("image/png"));
  assert.throws(() => extractMatrix(file), QrtyError);
});

test("extractMatrix throws QrtyError on garbage (no coherent grid)", () => {
  const canvas = require("canvas") as CanvasModule;
  const c = canvas.createCanvas(50, 50);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 50, 50);
  ctx.fillStyle = "#000000";
  // A single small dark blob: not a valid finder/timing grid at any candidate N.
  ctx.fillRect(10, 10, 5, 5);
  const file = tmpPngPath("garbage.png");
  writeFileSync(file, c.toBuffer("image/png"));
  assert.throws(() => extractMatrix(file), QrtyError);
});

test("extractMatrix throws QrtyError on a corrupt (non-image) file", () => {
  const file = tmpPngPath("corrupt.png");
  writeFileSync(file, Buffer.from("this is not a decodable image")); // exists, not an image
  assert.throws(() => extractMatrix(file), QrtyError);
});
