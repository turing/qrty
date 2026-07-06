import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LABEL_FONTS, fontFamily, ensureFontFile } from "./fonts.ts";
import { QrgenError } from "./errors.ts";

test("allows exactly Open Sans, Roboto, Montserrat", () => {
  assert.deepEqual(LABEL_FONTS, ["Open Sans", "Roboto", "Montserrat"]);
});

test("fontFamily returns the CSS family", () => {
  assert.equal(fontFamily("Montserrat"), "Montserrat");
});

test("an unknown font throws", () => {
  assert.throws(() => fontFamily("Comic Sans"), QrgenError);
});

test("ensureFontFile downloads once, then serves the cached file", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "qrgen-font-"));
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response("TTFDATA", { status: 200 });
  }) as typeof fetch;
  try {
    const p1 = await ensureFontFile("Roboto", { cacheDir });
    const p2 = await ensureFontFile("Roboto", { cacheDir });
    assert.equal(calls, 1);
    assert.equal(p1, join(cacheDir, "Roboto.ttf"));
    assert.equal(readFileSync(p1, "utf8"), "TTFDATA");
    assert.equal(p1, p2);
  } finally {
    globalThis.fetch = orig;
  }
});

test("ensureFontFile rejects a non-2xx and writes nothing", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "qrgen-font-"));
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => new Response("no", { status: 500 })) as typeof fetch;
  try {
    await assert.rejects(
      () => ensureFontFile("Roboto", { cacheDir }),
      /Could not fetch font Roboto: HTTP 500/,
    );
    assert.equal(existsSync(join(cacheDir, "Roboto.ttf")), false);
  } finally {
    globalThis.fetch = orig;
  }
});

test("ensureFontFile sweeps a stale .tmp from a crashed prior write", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "qrgen-font-"));
  writeFileSync(join(cacheDir, "Roboto.ttf.999.deadbeef.tmp"), "junk"); // stale orphan
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => new Response("TTFDATA", { status: 200 })) as typeof fetch;
  try {
    const p = await ensureFontFile("Roboto", { cacheDir });
    assert.equal(existsSync(join(cacheDir, "Roboto.ttf.999.deadbeef.tmp")), false); // swept
    assert.equal(existsSync(p), true);
  } finally {
    globalThis.fetch = orig;
  }
});
