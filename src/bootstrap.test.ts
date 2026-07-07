import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureProfilesDir, installStarterProfiles } from "./bootstrap.ts";
import { QrtyError } from "./errors.ts";

const DATA_REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

const nullStream = { write: (_: string): void => {} };

function home(): string {
  return mkdtempSync(join(tmpdir(), "qrgen-"));
}
function defaultDirIn(h: string): string {
  return join(h, "profiles", "default");
}

test("installStarterProfiles seeds default/, schema, logo, and creates user/", () => {
  const h = home();
  const dd = defaultDirIn(h);
  const installed = installStarterProfiles(dd);
  assert.ok(installed.includes("black.json"));
  assert.ok(existsSync(join(dd, "black.json")));
  assert.ok(existsSync(join(h, "profiles", "profile.schema.json")));
  assert.ok(existsSync(join(h, "assets", "default", "qrgen-sample.jpeg")));
  assert.ok(existsSync(join(h, "profiles", "user")));
});

test("ensure is a no-op when default profiles exist", async () => {
  const dd = defaultDirIn(home());
  mkdirSync(dd, { recursive: true });
  writeFileSync(join(dd, "x.json"), "{}");
  await ensureProfilesDir(dd, {
    interactive: true,
    confirm: () => {
      throw new Error("confirm must not be called when profiles exist");
    },
    stream: nullStream,
  });
});

test("non-interactive with no defaults throws instead of hanging", async () => {
  const dd = defaultDirIn(home());
  await assert.rejects(
    () => ensureProfilesDir(dd, { interactive: false, stream: nullStream }),
    /No profiles found/,
  );
});

test("interactive yes seeds the defaults", async () => {
  const dd = defaultDirIn(home());
  await ensureProfilesDir(dd, {
    interactive: true,
    confirm: () => true,
    stream: nullStream,
  });
  assert.ok(existsSync(join(dd, "black.json")));
});

test("interactive no throws and seeds nothing", async () => {
  const dd = defaultDirIn(home());
  await assert.rejects(
    () =>
      ensureProfilesDir(dd, {
        interactive: true,
        confirm: () => false,
        stream: nullStream,
      }),
    QrtyError,
  );
  assert.ok(!existsSync(join(dd, "black.json")));
});

test("legacy flat profiles migrate into user/ before seeding", async () => {
  const h = home();
  const root = join(h, "profiles");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "seal.json"), "{}"); // pre-split flat profile
  const dd = join(root, "default");
  await ensureProfilesDir(dd, {
    interactive: true,
    confirm: () => true,
    stream: nullStream,
  });
  assert.ok(existsSync(join(root, "user", "seal.json")), "seal moved to user/");
  assert.ok(!existsSync(join(root, "seal.json")), "flat copy removed");
  assert.ok(existsSync(join(dd, "black.json")), "defaults seeded");
});

test("unedited bundled-name flat profiles are discarded, not pinned", async () => {
  const h = home();
  const root = join(h, "profiles");
  mkdirSync(root, { recursive: true });
  // an exact copy of the bundled default (unedited)
  writeFileSync(
    join(root, "black.json"),
    readFileSync(join(DATA_REPO, "profiles", "black.json")),
  );
  const dd = join(root, "default");
  await ensureProfilesDir(dd, {
    interactive: true,
    confirm: () => true,
    stream: nullStream,
  });
  assert.ok(
    !existsSync(join(root, "user", "black.json")),
    "unedited default must not be pinned in user/",
  );
  assert.ok(existsSync(join(dd, "black.json")), "fresh default present");
});
