import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchOrThrow } from "./fetch.ts";
import { QrgenError } from "./errors.ts";

test("fetchOrThrow returns the response on 2xx", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;
  try {
    const res = await fetchOrThrow("https://x/a", "logo https://x/a");
    assert.equal(res.status, 200);
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
