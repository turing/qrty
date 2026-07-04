import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
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

test("ensure is a no-op when the directory exists", async () => {
  const dir = join(tmp(), "profiles");
  mkdirSync(dir);
  await ensureProfilesDir(dir, {
    interactive: true,
    confirm: () => {
      throw new Error("confirm must not be called when dir exists");
    },
    stream: nullStream,
  });
});

test("non-interactive missing dir throws instead of hanging", async () => {
  const dir = join(tmp(), "profiles");
  await assert.rejects(
    () => ensureProfilesDir(dir, { interactive: false, stream: nullStream }),
    /No profiles directory/,
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
