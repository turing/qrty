import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { loadProfile, type Profile } from "./profiles.ts";
import { renderSvg } from "./render.ts";
import { DOT_TYPES } from "./styles.ts";

const BUNDLED = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "profiles",
);

const names = readdirSync(BUNDLED)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -5))
  .sort();

// Loading validates each against the schema AND runs the contrast check,
// so this throws if any bundled profile is invalid or unreadable.
const profiles: Profile[] = names.map((n) => loadProfile(n, BUNDLED));

test("ships between 1 and 10 profiles", () => {
  assert.ok(names.length > 0 && names.length <= 10);
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

test("a transparent profile is shipped", () => {
  assert.ok(profiles.some((p) => p.background?.color === "transparent"));
});

test("every profile renders to valid svg", async () => {
  for (const [i, p] of profiles.entries()) {
    const svg = (await renderSvg(p, "https://example.com/path")).toString("utf8");
    assert.match(svg, /<svg/, `${names[i]} failed to render`);
  }
});
