import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWrite, uniqueTmpPath } from "./fs.ts";

test("uniqueTmpPath is distinct every call, prefixed by the path, .tmp-suffixed", () => {
  const a = uniqueTmpPath("/d/key");
  const b = uniqueTmpPath("/d/key");
  assert.notEqual(a, b);
  assert.ok(a.startsWith("/d/key") && b.startsWith("/d/key"));
  assert.ok(a.endsWith(".tmp") && b.endsWith(".tmp"));
});

test("atomicWrite writes the file and leaves no temp behind", () => {
  const dir = mkdtempSync(join(tmpdir(), "qrty-aw-"));
  atomicWrite(join(dir, "f.bin"), Buffer.from("hello"));
  assert.equal(readFileSync(join(dir, "f.bin"), "utf8"), "hello");
  assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith(".tmp")), []);
});

test("atomicWrite creates missing parent dirs", () => {
  const dir = mkdtempSync(join(tmpdir(), "qrty-aw-"));
  atomicWrite(join(dir, "sub", "f.bin"), Buffer.from("x"));
  assert.equal(readFileSync(join(dir, "sub", "f.bin"), "utf8"), "x");
});
