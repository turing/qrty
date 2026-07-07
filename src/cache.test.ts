import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { clearCache, cacheKey, trimCache } from "./cache.ts";
import { fetchAsset } from "./image.ts";
import { QrtyError } from "./errors.ts";

function tmpCacheDir(): string {
  return mkdtempSync(join(tmpdir(), "qrty-cache-"));
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
      QrtyError,
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

test("concurrent fetchAsset writes leave the cached body intact and no tmp", async () => {
  const cacheDir = tmpCacheDir();
  const orig = globalThis.fetch;
  const body = "<svg xmlns='http://www.w3.org/2000/svg'/>";
  globalThis.fetch = (async () =>
    new Response(body, {
      headers: { "content-type": "image/svg+xml" },
    })) as typeof fetch;
  try {
    const url = "https://example.com/icon.svg";
    const results = await Promise.all(
      Array.from({ length: 8 }, () => fetchAsset(url, { cacheDir })),
    );
    for (const r of results) {
      assert.equal(r.bytes.toString("utf8"), body);
    }
    const key = cacheKey(url);
    const cached = readFileSync(join(cacheDir, key), "utf8");
    assert.equal(cached, body, "promoted cache body must be byte-for-byte the response");
    assert.deepEqual(
      readdirSync(cacheDir).filter((n) => n.endsWith(".tmp")),
      [],
      "no leftover temp files after concurrent writes",
    );
  } finally {
    globalThis.fetch = orig;
  }
});

test("trimCache evicts oldest entries (body + sidecar) until under the ceiling", () => {
  const dir = mkdtempSync(join(tmpdir(), "qrty-trim-"));
  const keys = ["aaa", "bbb", "ccc"]; // will set aaa oldest → ccc newest
  keys.forEach((k, i) => {
    writeFileSync(join(dir, k), Buffer.alloc(100));      // 100-byte body
    writeFileSync(join(dir, `${k}.type`), "image/png\n"); // 10-byte sidecar
    const t = new Date((i + 1) * 100000);
    utimesSync(join(dir, k), t, t);
    utimesSync(join(dir, `${k}.type`), t, t);
  });
  // total = 3 * 110 = 330; ceiling 250 forces evicting the single oldest (aaa)
  trimCache(dir, 250);
  assert.equal(existsSync(join(dir, "aaa")), false);
  assert.equal(existsSync(join(dir, "aaa.type")), false);
  assert.equal(existsSync(join(dir, "bbb")), true);
  assert.equal(existsSync(join(dir, "ccc")), true);
});

test("trimCache is a no-op under the ceiling and on a missing dir", () => {
  const dir = mkdtempSync(join(tmpdir(), "qrty-trim-"));
  writeFileSync(join(dir, "k"), Buffer.alloc(10));
  writeFileSync(join(dir, "k.type"), "image/png\n");
  trimCache(dir, 1_000_000);
  assert.equal(existsSync(join(dir, "k")), true);
  assert.doesNotThrow(() => trimCache(join(dir, "nope"), 10)); // missing dir
});

test("trimCache sweeps an orphan .type sidecar (no matching body)", () => {
  const dir = mkdtempSync(join(tmpdir(), "qrty-trim-"));
  writeFileSync(join(dir, "deadkey.type"), "image/png\n"); // orphan — no body
  writeFileSync(join(dir, "live"), Buffer.alloc(10));
  writeFileSync(join(dir, "live.type"), "image/png\n");
  trimCache(dir, 1_000_000); // under the ceiling; orphan still swept
  assert.equal(existsSync(join(dir, "deadkey.type")), false);
  assert.equal(existsSync(join(dir, "live")), true);
  assert.equal(existsSync(join(dir, "live.type")), true);
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
