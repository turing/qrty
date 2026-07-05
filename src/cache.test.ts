import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { clearCache } from "./cache.ts";
import { fetchAsset } from "./image.ts";
import { QrgenError } from "./errors.ts";

function tmpCacheDir(): string {
  return mkdtempSync(join(tmpdir(), "qrgen-cache-"));
}

function svgResponse(): Response {
  return new Response("<svg xmlns='http://www.w3.org/2000/svg'/>", {
    headers: { "content-type": "image/svg+xml" },
  });
}

test("fetchAsset downloads once, then serves from cache", async () => {
  const cacheDir = tmpCacheDir();
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return svgResponse();
  }) as typeof fetch;
  try {
    const a = await fetchAsset("https://example.com/icon.svg", { cacheDir });
    const b = await fetchAsset("https://example.com/icon.svg", { cacheDir });
    assert.equal(calls, 1);
    assert.equal(a.mime, "image/svg+xml");
    assert.deepEqual(a.bytes, b.bytes);
  } finally {
    globalThis.fetch = orig;
  }
});

test("fetchAsset serves a cached asset offline", async () => {
  const cacheDir = tmpCacheDir();
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => svgResponse()) as typeof fetch;
  try {
    await fetchAsset("https://example.com/icon.svg", { cacheDir });
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const r = await fetchAsset("https://example.com/icon.svg", { cacheDir });
    assert.equal(r.mime, "image/svg+xml");
  } finally {
    globalThis.fetch = orig;
  }
});

test("fetchAsset rejects an HTML gate served with HTTP 200 and caches nothing", async () => {
  const cacheDir = tmpCacheDir();
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("<!DOCTYPE html><html><body>gate</body></html>", {
      headers: { "content-type": "text/html" },
    })) as typeof fetch;
  try {
    await assert.rejects(
      () => fetchAsset("https://svgrepo.example/gate.svg", { cacheDir }),
      QrgenError,
    );
    assert.deepEqual(readdirSync(cacheDir), []);
  } finally {
    globalThis.fetch = orig;
  }
});

test("fetchAsset rejects a non-2xx response and caches nothing", async () => {
  const cacheDir = tmpCacheDir();
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("nope", { status: 404 })) as typeof fetch;
  try {
    await assert.rejects(
      () => fetchAsset("https://example.com/missing.svg", { cacheDir }),
      /Could not fetch/,
    );
    assert.deepEqual(readdirSync(cacheDir), []);
  } finally {
    globalThis.fetch = orig;
  }
});

test("clearCache empties the directory and reports what it freed", async () => {
  const cacheDir = tmpCacheDir();
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => svgResponse()) as typeof fetch;
  try {
    await fetchAsset("https://example.com/icon.svg", { cacheDir });
  } finally {
    globalThis.fetch = orig;
  }
  const cleared = clearCache(cacheDir);
  assert.equal(cleared.entries, 1);
  assert.ok(cleared.bytes > 0);
  assert.deepEqual(readdirSync(cacheDir), []);
});
