import type { Gradient, Profile } from "./profiles.ts";
import type { CornerDotType, CornerSquareType, DotType } from "./styles.ts";

const DEFAULT_SIZE = 1024;

interface Bbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Anything with an optional solid color and/or gradient (StyleBlock, background). */
type ColorBlock = { color?: string; gradient?: Gradient } | undefined;

function shapeRect(x: number, y: number, size: number, rx: number, fill: string): string {
  const rxAttr = rx > 0 ? ` rx="${rx}"` : "";
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}"${rxAttr} fill="${fill}"/>`;
}

function shapeCircle(x: number, y: number, size: number, fill: string): string {
  const r = size / 2;
  return `<circle cx="${x + r}" cy="${y + r}" r="${r}" fill="${fill}"/>`;
}

/** Shape for a dark data module (outside the finder regions), by dots.type. */
function dataModuleShape(x: number, y: number, unit: number, type: DotType, fill: string): string {
  switch (type) {
    case "square":
      return shapeRect(x, y, unit, 0, fill);
    case "dots":
      return shapeCircle(x, y, unit, fill);
    case "extra-rounded":
      return shapeRect(x, y, unit, unit * 0.5, fill);
    case "rounded":
    case "classy":
    case "classy-rounded":
      // classy/classy-rounded's connected-corner look is not modeled per-cell;
      // documented MVP simplification — render as rounded (see plan Task 2).
      return shapeRect(x, y, unit, unit * 0.35, fill);
  }
}

/** Outer 7x7 finder shape, by cornersSquare.type (falls back from dots.type). */
function cornerSquareShape(x: number, y: number, size: number, type: CornerSquareType, fill: string): string {
  if (type === "dot") return shapeCircle(x, y, size, fill);
  if (type === "extra-rounded") return shapeRect(x, y, size, size * 0.5, fill);
  return shapeRect(x, y, size, 0, fill);
}

/** Inner 3x3 finder shape, by cornersDot.type (falls back from dots.type). */
function cornerDotShape(x: number, y: number, size: number, type: CornerDotType, fill: string): string {
  if (type === "dot") return shapeCircle(x, y, size, fill);
  return shapeRect(x, y, size, 0, fill);
}

/** When cornersSquare/cornersDot are absent, approximate their shape from dots.type. */
function fallbackCornerSquareType(dotType: DotType): CornerSquareType {
  if (dotType === "dots") return "dot";
  if (dotType === "extra-rounded") return "extra-rounded";
  return "square";
}
function fallbackCornerDotType(dotType: DotType): CornerDotType {
  return dotType === "dots" ? "dot" : "square";
}

/**
 * Resolve a color block to a fill: a solid color, or (if a gradient is set
 * instead) a reference to one shared gradient def spanning `bbox` — never a
 * per-cell gradient. Pushes the gradient element into `defs` when needed.
 */
function fillFor(
  block: ColorBlock,
  bbox: Bbox,
  defs: string[],
  nextId: () => string,
  fallbackColor: string,
): string {
  if (block?.color) return block.color;
  if (block?.gradient) {
    const id = nextId();
    defs.push(gradientDef(id, block.gradient, bbox));
    return `url(#${id})`;
  }
  return fallbackColor;
}

function gradientDef(id: string, g: Gradient, bbox: Bbox): string {
  const stops = g.colorStops
    .map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`)
    .join("");
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  if (g.type === "radial") {
    const r = Math.max(bbox.w, bbox.h) / 2;
    return (
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
      `cx="${cx}" cy="${cy}" r="${r}">${stops}</radialGradient>`
    );
  }
  // Endpoints on the center-line through the bbox at `rotation` radians;
  // half-diagonal reach guarantees the line spans the full bbox at any angle.
  const rotation = g.rotation ?? 0;
  const halfLen = Math.sqrt((bbox.w / 2) ** 2 + (bbox.h / 2) ** 2);
  const dx = Math.cos(rotation) * halfLen;
  const dy = Math.sin(rotation) * halfLen;
  const x1 = cx - dx;
  const y1 = cy - dy;
  const x2 = cx + dx;
  const y2 = cy + dy;
  return (
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
    `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`
  );
}

/** Renders an N-module boolean matrix (true = dark) as a styled SVG string. */
export function renderStyledMatrix(matrix: boolean[][], profile: Profile): string {
  const n = matrix.length;
  const px = profile.size ?? DEFAULT_SIZE;
  const margin = profile.margin ?? 4;
  const unit = px / (n + 2 * margin);

  const defs: string[] = [];
  const body: string[] = [];
  let gradSeq = 0;
  const nextId = (): string => `qrgen-grad-${gradSeq++}`;

  const bgColor = profile.background?.color;
  if (bgColor !== "transparent") {
    const fill = fillFor(profile.background, { x: 0, y: 0, w: px, h: px }, defs, nextId, "#ffffff");
    body.push(`<rect x="0" y="0" width="${px}" height="${px}" fill="${fill}"/>`);
  }
  // Solid fallback for the finders' white ring — a gradient background has no
  // single color to use there, so treat it like an omitted background (white).
  const ringFill = bgColor && bgColor !== "transparent" ? bgColor : "#ffffff";

  const moduleBbox: Bbox = { x: margin * unit, y: margin * unit, w: n * unit, h: n * unit };
  const dotsFill = fillFor(profile.dots, moduleBbox, defs, nextId, "#000000");
  // Absent cornersSquare/cornersDot fall back to the *same* dots block — reuse
  // dotsFill rather than re-resolving, so a dots gradient stays a single def.
  const cornersSquareFill = profile.cornersSquare
    ? fillFor(profile.cornersSquare, moduleBbox, defs, nextId, "#000000")
    : dotsFill;
  const cornersDotFill = profile.cornersDot
    ? fillFor(profile.cornersDot, moduleBbox, defs, nextId, "#000000")
    : dotsFill;

  const cornersSquareType = profile.cornersSquare?.type ?? fallbackCornerSquareType(profile.dots.type);
  const cornersDotType = profile.cornersDot?.type ?? fallbackCornerDotType(profile.dots.type);

  const finderOrigins: [number, number][] = [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ];
  const inFinder = (r: number, c: number): boolean =>
    finderOrigins.some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);

  for (const [fr, fc] of finderOrigins) {
    const ox = (margin + fc) * unit;
    const oy = (margin + fr) * unit;
    body.push(cornerSquareShape(ox, oy, unit * 7, cornersSquareType, cornersSquareFill));
    body.push(shapeRect(ox + unit, oy + unit, unit * 5, 0, ringFill));
    body.push(cornerDotShape(ox + unit * 2, oy + unit * 2, unit * 3, cornersDotType, cornersDotFill));
  }

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!matrix[r][c] || inFinder(r, c)) continue;
      const x = (margin + c) * unit;
      const y = (margin + r) * unit;
      body.push(dataModuleShape(x, y, unit, profile.dots.type, dotsFill));
    }
  }

  const defsBlock = defs.length > 0 ? `<defs>${defs.join("")}</defs>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">` +
    `${defsBlock}${body.join("")}</svg>`
  );
}
