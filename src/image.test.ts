import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cacheKey } from "./cache.ts";
import { fetchAsset, resolveImage } from "./image.ts";
import { QrgenError } from "./errors.ts";

function tmpFile(name: string, body = "x"): string {
  const p = join(mkdtempSync(join(tmpdir(), "qrgen-img-")), name);
  writeFileSync(p, body);
  return p;
}

test("svg file becomes an svg data URI and is not raster", async () => {
  const p = tmpFile("logo.svg", "<svg xmlns='http://www.w3.org/2000/svg'/>");
  const r = await resolveImage(p);
  assert.ok(r.image.startsWith("data:image/svg+xml;base64,"));
  assert.equal(r.isRaster, false);
});

test("jpeg file becomes a jpeg data URI and is raster", async () => {
  const p = tmpFile("logo.jpeg", "\xff\xd8\xff");
  const r = await resolveImage(p);
  assert.ok(r.image.startsWith("data:image/jpeg;base64,"));
  assert.equal(r.isRaster, true);
});

test("data URI passes through (svg not raster, png raster)", async () => {
  assert.equal((await resolveImage("data:image/svg+xml;base64,AAAA")).isRaster, false);
  assert.equal((await resolveImage("data:image/png;base64,AAAA")).isRaster, true);
});

test("http url is fetched and inlined; svg content-type is not raster", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "qrgen-img-cache-"));
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("<svg/>", {
      headers: { "content-type": "image/svg+xml" },
    })) as typeof fetch;
  try {
    const r = await resolveImage("https://example.com/icon.svg", { cacheDir });
    assert.ok(r.image.startsWith("data:image/svg+xml;base64,"));
    assert.equal(r.isRaster, false);
  } finally {
    globalThis.fetch = orig;
  }
});

test("svg body under a non-image content-type is sniffed as svg, not raster", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "qrgen-img-cache-"));
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("<svg xmlns='http://www.w3.org/2000/svg'/>", {
      headers: { "content-type": "application/octet-stream" },
    })) as typeof fetch;
  try {
    const r = await resolveImage("https://example.com/icon.svg", { cacheDir });
    assert.ok(r.image.startsWith("data:image/svg+xml;base64,"));
    assert.equal(r.isRaster, false);
  } finally {
    globalThis.fetch = orig;
  }
});

test("http url failure throws QrgenError", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "qrgen-img-cache-"));
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("nope", { status: 404 })) as typeof fetch;
  try {
    await assert.rejects(
      () => resolveImage("https://example.com/missing.svg", { cacheDir }),
      /Could not fetch/,
    );
  } finally {
    globalThis.fetch = orig;
  }
});

test("missing file throws QrgenError", async () => {
  await assert.rejects(() => resolveImage("/no/such/logo.svg"), QrgenError);
});

test("unsupported extension throws QrgenError", async () => {
  const p = tmpFile("logo.bmp", "x");
  await assert.rejects(() => resolveImage(p), /Unsupported/);
});

test("fetchAsset trims the cache to maxCacheBytes, evicting the oldest", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "qrgen-trim-int-"));
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } })) as typeof fetch;
  try {
    await fetchAsset("https://x/a.svg", { cacheDir, maxCacheBytes: 10_000_000 });
    // backdate everything written so far so entry A is the oldest
    for (const f of readdirSync(cacheDir)) {
      const t = new Date(1000);
      utimesSync(join(cacheDir, f), t, t);
    }
    // each entry ≈ 6-byte body + 14-byte sidecar = 20 bytes; ceiling 25 fits one
    await fetchAsset("https://x/b.svg", { cacheDir, maxCacheBytes: 25 });
    const files = readdirSync(cacheDir);
    assert.equal(files.includes(cacheKey("https://x/a.svg")), false); // A evicted
    assert.equal(files.includes(cacheKey("https://x/b.svg")), true);  // B kept
  } finally {
    globalThis.fetch = orig;
  }
});
