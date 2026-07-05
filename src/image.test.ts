import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveImage } from "./image.ts";
import { QrgenError } from "./errors.ts";

function tmpFile(name: string, body = "x"): string {
  const p = join(mkdtempSync(join(tmpdir(), "qrgen-img-")), name);
  writeFileSync(p, body);
  return p;
}

test("svg file becomes an svg data URI and is not raster", () => {
  const p = tmpFile("logo.svg", "<svg xmlns='http://www.w3.org/2000/svg'/>");
  const r = resolveImage(p);
  assert.ok(r.image.startsWith("data:image/svg+xml;base64,"));
  assert.equal(r.isRaster, false);
});

test("png file becomes a png data URI and is raster", () => {
  const p = tmpFile("logo.png", "\x89PNG");
  const r = resolveImage(p);
  assert.ok(r.image.startsWith("data:image/png;base64,"));
  assert.equal(r.isRaster, true);
});

test("data URI passes through (svg not raster, png raster)", () => {
  assert.equal(resolveImage("data:image/svg+xml;base64,AAAA").isRaster, false);
  assert.equal(resolveImage("data:image/png;base64,AAAA").isRaster, true);
});

test("missing file throws QrgenError", () => {
  assert.throws(() => resolveImage("/no/such/logo.svg"), QrgenError);
});

test("unsupported extension throws QrgenError", () => {
  const p = tmpFile("logo.bmp", "x");
  assert.throws(() => resolveImage(p), /Unsupported/);
});
