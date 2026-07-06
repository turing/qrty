import { test } from "node:test";
import assert from "node:assert/strict";

import { renderStyledMatrix } from "./matrix-render.ts";
import type { Profile } from "./profiles.ts";

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

/** 21x21 matrix: three real finders + one isolated data module at (10,10). */
function makeMatrix(n = 21): boolean[][] {
  const m: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
  const place = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) m[r0 + r][c0 + c] = FINDER[r][c] === 1;
    }
  };
  place(0, 0);
  place(0, n - 7);
  place(n - 7, 0);
  m[10][10] = true;
  return m;
}

const BASE: Profile = {
  dots: { type: "square", color: "#111111" },
  background: { color: "#ffffff" },
};

test("root svg carries explicit width/height equal to profile size", () => {
  const svg = renderStyledMatrix(makeMatrix(), { ...BASE, size: 500 });
  const [openTag] = svg.match(/<svg[^>]*>/) ?? [""];
  assert.match(openTag, /\bwidth="500"/);
  assert.match(openTag, /\bheight="500"/);
});

test("renders a full-canvas background rect in the background color", () => {
  const svg = renderStyledMatrix(makeMatrix(), { ...BASE, size: 300, background: { color: "#ABCDEF" } });
  assert.match(svg, /<rect x="0" y="0" width="300" height="300" fill="#ABCDEF"\s*\/>/);
});

test("dots type 'dots' renders a data module as a circle", () => {
  const svg = renderStyledMatrix(makeMatrix(), { ...BASE, dots: { type: "dots", color: "#111111" } });
  assert.match(svg, /<circle[^>]*fill="#111111"/);
});

test("dots type 'square' renders a data module as a rect with no rx", () => {
  const svg = renderStyledMatrix(makeMatrix(), { ...BASE, dots: { type: "square", color: "#111111" } });
  const rectsForDots = [...svg.matchAll(/<rect[^>]*fill="#111111"[^>]*\/>/g)].map((m) => m[0]);
  assert.ok(rectsForDots.length > 0, "expected at least one data-module rect");
  for (const r of rectsForDots) assert.doesNotMatch(r, /\brx=/);
});

test("finder corners use cornersSquare/cornersDot colors distinct from the dots color", () => {
  const profile: Profile = {
    dots: { type: "square", color: "#111111" },
    cornersSquare: { type: "square", color: "#222222" },
    cornersDot: { type: "dot", color: "#333333" },
    background: { color: "#ffffff" },
  };
  const svg = renderStyledMatrix(makeMatrix(), profile);
  assert.match(svg, /fill="#222222"/);
  assert.match(svg, /fill="#333333"/);
  assert.match(svg, /<circle[^>]*fill="#333333"/, "cornersDot 'dot' type should render a circle");
});

test("a gradient dots profile yields exactly one shared userSpaceOnUse linearGradient", () => {
  const profile: Profile = {
    dots: {
      type: "square",
      gradient: {
        type: "linear",
        rotation: Math.PI / 4,
        colorStops: [
          { offset: 0, color: "#000000" },
          { offset: 1, color: "#ffffff" },
        ],
      },
    },
    background: { color: "#ffffff" },
  };
  const svg = renderStyledMatrix(makeMatrix(), profile);
  const gradients = [...svg.matchAll(/<linearGradient[^>]*gradientUnits="userSpaceOnUse"[^>]*>/g)];
  assert.equal(gradients.length, 1, "exactly one shared gradient, never one-per-cell");
  assert.match(svg, /fill="url\(#[^)]+\)"/);
});
