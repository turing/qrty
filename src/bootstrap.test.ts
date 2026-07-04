import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ensureProfilesDir, installStarterProfiles } from "./bootstrap.ts";
import { QrgenError } from "./errors.ts";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "qrgen-"));
}

const nullStream = { write: (_: string): void => {} };

test("installStarterProfiles copies profiles and schema to the parent", () => {
  const home = tmp();
  const profilesDir = join(home, "profiles");
  const installed = installStarterProfiles(profilesDir);
  assert.ok(installed.includes("black.json"));
  assert.ok(existsSync(join(profilesDir, "black.json")));
  assert.ok(existsSync(join(home, "profile.schema.json")));
});

test("ensure is a no-op when profiles already exist", async () => {
  const dir = join(tmp(), "profiles");
  mkdirSync(dir);
  writeFileSync(join(dir, "mine.json"), "{}");
  await ensureProfilesDir(dir, {
    interactive: true,
    confirm: () => {
      throw new Error("confirm must not be called when profiles exist");
    },
    stream: nullStream,
  });
});

test("non-interactive missing dir throws instead of hanging", async () => {
  const dir = join(tmp(), "profiles");
  await assert.rejects(
    () => ensureProfilesDir(dir, { interactive: false, stream: nullStream }),
    /No profiles found/,
  );
});

test("present-but-empty dir offers to seed and seeds on yes", async () => {
  const dir = join(tmp(), "profiles");
  mkdirSync(dir); // exists, but holds no .json profiles
  await ensureProfilesDir(dir, {
    interactive: true,
    confirm: () => true,
    stream: nullStream,
  });
  assert.ok(existsSync(join(dir, "black.json")));
});

test("present-but-empty dir throws non-interactively", async () => {
  const dir = join(tmp(), "profiles");
  mkdirSync(dir);
  await assert.rejects(
    () => ensureProfilesDir(dir, { interactive: false, stream: nullStream }),
    /No profiles found/,
  );
});

test("interactive yes creates and seeds", async () => {
  const dir = join(tmp(), "profiles");
  await ensureProfilesDir(dir, {
    interactive: true,
    confirm: () => true,
    stream: nullStream,
  });
  assert.ok(existsSync(join(dir, "black.json")));
});

test("interactive no throws and leaves the directory absent", async () => {
  const dir = join(tmp(), "profiles");
  await assert.rejects(
    () =>
      ensureProfilesDir(dir, {
        interactive: true,
        confirm: () => false,
        stream: nullStream,
      }),
    QrgenError,
  );
  assert.ok(!existsSync(dir));
});
