import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { loadProfile, type Profile } from "./profiles.ts";
import { renderSvg } from "./render.ts";
import { DOT_TYPES } from "./styles.ts";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const BUNDLED = join(DATA, "profiles");

// Profiles with a URL/remote image are rendered against this inline SVG so the
// test stays offline and canvas-free.
const OFFLINE_IMAGE =
  "data:image/svg+xml;base64," +
  Buffer.from(
    "<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'>" +
      "<rect width='40' height='40' fill='#000000'/></svg>",
  ).toString("base64");

const names = readdirSync(BUNDLED)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -5))
  .sort();

// Loading validates each against the schema AND runs the contrast check,
// so this throws if any bundled profile is invalid or unreadable.
const profiles: Profile[] = names.map((n) => loadProfile(n, BUNDLED));

test("ships a reasonable number of profiles", () => {
  assert.ok(names.length > 0 && names.length <= 20);
});

test("black and white are shipped", () => {
  assert.ok(names.includes("black"));
  assert.ok(names.includes("white"));
});

test("every profile loads, validates, and passes contrast", () => {
  assert.equal(profiles.length, names.length);
});

test("the set covers every dot type", () => {
  const used = new Set(profiles.map((p) => p.dots.type));
  for (const t of DOT_TYPES) {
    assert.ok(used.has(t), `no bundled profile uses dot type "${t}"`);
  }
});

test("a gradient profile is shipped", () => {
  assert.ok(profiles.some((p) => p.dots.gradient));
});

test("a radial gradient is exercised", () => {
  const anyRadial = profiles.some((p) =>
    [p.dots.gradient, p.cornersSquare?.gradient, p.cornersDot?.gradient, p.background?.gradient]
      .some((g) => g?.type === "radial"),
  );
  assert.ok(anyRadial);
});

test("a corner (finder) gradient is exercised", () => {
  assert.ok(profiles.some((p) => p.cornersSquare?.gradient || p.cornersDot?.gradient));
});

test("a background gradient is exercised", () => {
  assert.ok(profiles.some((p) => p.background?.gradient));
});

test("a circle-shaped code is exercised", () => {
  assert.ok(profiles.some((p) => p.shape === "circle"));
});

test("quiet-zone margin varies across profiles", () => {
  const margins = new Set(profiles.map((p) => p.margin ?? 0));
  assert.ok(margins.size >= 2, "expected at least two distinct margin values");
});

test("a transparent profile is shipped", () => {
  assert.ok(profiles.some((p) => p.background?.color === "transparent"));
});

test("a logo profile is shipped and embeds an image", async () => {
  const withImage = profiles.find((p) => p.image);
  assert.ok(withImage, "expected a bundled profile with an image");
  const svg = (
    await renderSvg({ ...withImage, image: OFFLINE_IMAGE }, "https://x.com")
  ).toString("utf8");
  assert.match(svg, /<image /);
});

test("every profile renders to valid svg", async () => {
  for (const [i, p] of profiles.entries()) {
    // The sample profile's image is a remote URL; render offline here.
    const prof = p.image ? { ...p, image: OFFLINE_IMAGE } : p;
    const svg = (await renderSvg(prof, "https://example.com/path")).toString("utf8");
    assert.match(svg, /<svg/, `${names[i]} failed to render`);
  }
});
