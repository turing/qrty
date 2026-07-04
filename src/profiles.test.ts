import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadProfile } from "./profiles.ts";
import { QrgenError } from "./errors.ts";

const VALID = {
  dots: { type: "rounded", color: "#000000" },
  cornersSquare: { type: "extra-rounded", color: "#000000" },
  cornersDot: { type: "dot", color: "#000000" },
  background: { color: "#FFFFFF" },
  output: "./output/",
};

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "qrgen-"));
}

function write(dir: string, name: string, data: unknown): void {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  writeFileSync(join(dir, `${name}.json`), body);
}

test("loads a valid profile", () => {
  const d = tmp();
  write(d, "white", VALID);
  assert.equal(loadProfile("white", d).dots.type, "rounded");
});

test("missing file throws", () => {
  assert.throws(() => loadProfile("nope", tmp()), /Profile not found/);
});

test("malformed json throws", () => {
  const d = tmp();
  write(d, "bad", "{not json");
  assert.throws(() => loadProfile("bad", d), /Malformed/);
});

test("unknown dot type rejected", () => {
  const d = tmp();
  write(d, "weird", { ...VALID, dots: { type: "hexagon", color: "#000000" } });
  assert.throws(() => loadProfile("weird", d), QrgenError);
});

test("missing dots rejected", () => {
  const d = tmp();
  write(d, "nodots", { background: { color: "#FFFFFF" } });
  assert.throws(() => loadProfile("nodots", d), QrgenError);
});

test("unknown extra property rejected", () => {
  const d = tmp();
  write(d, "extra", { ...VALID, bogus: 1 });
  assert.throws(() => loadProfile("extra", d), QrgenError);
});

test("background equal to a foreground color rejected as unreadable", () => {
  const d = tmp();
  write(d, "invisible", { ...VALID, background: { color: "#000000" } });
  assert.throws(() => loadProfile("invisible", d), /unreadable/i);
});

test("contrast check is case-insensitive", () => {
  const d = tmp();
  write(d, "invisible2", {
    dots: { type: "rounded", color: "#abcdef" },
    background: { color: "#ABCDEF" },
  });
  assert.throws(() => loadProfile("invisible2", d), /unreadable/i);
});

test("white dots with omitted background rejected (effective white)", () => {
  const d = tmp();
  write(d, "whiteonwhite", { dots: { type: "rounded", color: "#FFFFFF" } });
  assert.throws(() => loadProfile("whiteonwhite", d), /unreadable/i);
});

test("transparent background never conflicts with a foreground", () => {
  const d = tmp();
  write(d, "clear", {
    dots: { type: "rounded", color: "#000000" },
    background: { color: "transparent" },
  });
  assert.equal(loadProfile("clear", d).background?.color, "transparent");
});
