import { test } from "node:test";
import assert from "node:assert/strict";

import { condenseReadme } from "./llms.ts";

const META = { name: "qrty", description: "Test desc." };

test("condenseReadme prepends the name and description header", () => {
  const out = condenseReadme("# qrty\n\nBody text.\n", META);
  assert.ok(out.startsWith("# qrty\n\n> Test desc.\n"));
});

test("condenseReadme drops the README's own H1 title (no duplicate)", () => {
  const out = condenseReadme("# qrty\n\nBody.\n", META);
  assert.equal(out.match(/^# qrty$/gm)?.length, 1);
});

test("condenseReadme strips badge and standalone image lines", () => {
  const md =
    "# qrty\n\n[![CI](https://img.shields.io/x)](https://ci)\n\n" +
    "![logo](logo.png)\n\n## Usage\n\nRun it.\n";
  const out = condenseReadme(md, META);
  assert.doesNotMatch(out, /shields\.io/);
  assert.doesNotMatch(out, /logo\.png/);
  assert.match(out, /## Usage/);
});

test("condenseReadme removes HTML comments", () => {
  const out = condenseReadme("# qrty\n\n<!-- hidden -->\n\nVisible.\n", META);
  assert.doesNotMatch(out, /hidden/);
  assert.match(out, /Visible\./);
});
