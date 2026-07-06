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

test("fetchOrThrow blocks the cloud-metadata host without fetching", async () => {
  const orig = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response("secret"); }) as typeof fetch;
  try {
    await assert.rejects(
      () => fetchOrThrow("http://169.254.169.254/latest/meta-data/", "logo x"),
      /blocked host 169\.254\.169\.254/);
    assert.equal(called, false);
  } finally { globalThis.fetch = orig; }
});

test("fetchOrThrow blocks the IPv6 metadata host (brackets stripped)", async () => {
  const orig = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response("secret"); }) as typeof fetch;
  try {
    await assert.rejects(
      () => fetchOrThrow("http://[fd00:ec2::254]/latest/", "logo x"),
      /blocked host fd00:ec2::254/);
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

test("fetchOrThrow rejects a body over the byte cap", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => new Response("0123456789")) as typeof fetch;
  try {
    await assert.rejects(
      () => fetchOrThrow("https://x/a", "logo https://x/a", { maxBytes: 5 }),
      /response exceeds 5 bytes/);
  } finally { globalThis.fetch = orig; }
});

test("fetchOrThrow blocks a redirect whose final host is a metadata host", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => {
    const res = new Response("secret", { headers: { "content-type": "text/plain" } });
    Object.defineProperty(res, "url", { value: "http://169.254.169.254/latest/" });
    return res;
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => fetchOrThrow("https://benign.example/icon.svg", "logo x"),
      /blocked host 169\.254\.169\.254 \(redirect\)/);
  } finally { globalThis.fetch = orig; }
});
