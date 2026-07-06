import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchOrThrow } from "./fetch.ts";
import { QrgenError } from "./errors.ts";

test("fetchOrThrow returns bytes and content-type on 2xx", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("hi", { headers: { "content-type": "image/png" } })) as typeof fetch;
  try {
    const r = await fetchOrThrow("https://x/a", "logo https://x/a");
    assert.equal(r.bytes.toString(), "hi");
    assert.equal(r.contentType, "image/png");
  } finally { globalThis.fetch = orig; }
});

test("fetchOrThrow wraps a network error with the label", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("boom"); }) as typeof fetch;
  try {
    await assert.rejects(() => fetchOrThrow("https://x/a", "font Roboto"),
      (e) => e instanceof QrgenError && /Could not fetch font Roboto: boom/.test(e.message));
  } finally { globalThis.fetch = orig; }
});

test("fetchOrThrow rejects a non-2xx with HTTP status", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => new Response("no", { status: 404 })) as typeof fetch;
  try {
    await assert.rejects(() => fetchOrThrow("https://x/a", "logo https://x/a"),
      (e) => e instanceof QrgenError && /Could not fetch logo https:\/\/x\/a: HTTP 404/.test(e.message));
  } finally { globalThis.fetch = orig; }
});

test("fetchOrThrow rejects an unsupported scheme without fetching", async () => {
  const orig = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response("x"); }) as typeof fetch;
  try {
    await assert.rejects(() => fetchOrThrow("ftp://x/a", "logo ftp://x/a"), /unsupported URL scheme/);
    assert.equal(called, false);
  } finally { globalThis.fetch = orig; }
});

test("fetchOrThrow rejects a malformed URL without fetching", async () => {
  const orig = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response("x"); }) as typeof fetch;
  try {
    await assert.rejects(() => fetchOrThrow("http://", "logo http://"), /invalid URL/);
    assert.equal(called, false);
  } finally { globalThis.fetch = orig; }
});

test("fetchOrThrow times out a hung request", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = ((_url: string, init: { signal: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")));
    })) as typeof fetch;
  try {
    await assert.rejects(
      () => fetchOrThrow("https://x/a", "logo https://x/a", { timeoutMs: 20 }),
      /timed out after 20ms/);
  } finally { globalThis.fetch = orig; }
});

test("fetchOrThrow warns past warnBytes but returns the full body (never rejects on size)", async () => {
  const orig = globalThis.fetch;
  const origErr = process.stderr.write;
  let warned = "";
  process.stderr.write = ((s: string) => ((warned += s), true)) as typeof process.stderr.write;
  globalThis.fetch = (async () => new Response("0123456789")) as typeof fetch; // 10 bytes
  try {
    const r = await fetchOrThrow("https://x/a", "logo https://x/a", { warnBytes: 5 });
    assert.equal(r.bytes.toString(), "0123456789"); // full body, not truncated or rejected
    assert.match(warned, /downloading anyway/);
  } finally {
    globalThis.fetch = orig;
    process.stderr.write = origErr;
  }
});
