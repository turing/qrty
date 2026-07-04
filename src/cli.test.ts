import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { generate, resolveOutputDir, expandHome } from "./cli.ts";
import { installStarterProfiles } from "./bootstrap.ts";
import type { Profile } from "./profiles.ts";

function seededProfiles(): string {
  const home = mkdtempSync(join(tmpdir(), "qrgen-"));
  const dir = join(home, "profiles");
  installStarterProfiles(dir);
  return dir;
}

function outDir(): string {
  return mkdtempSync(join(tmpdir(), "qrgen-out-"));
}

test("resolveOutputDir precedence: flag > profile > default", () => {
  const p = { output: "./prof" } as Profile;
  assert.equal(resolveOutputDir("/flag", p), "/flag");
  assert.equal(resolveOutputDir(undefined, p), "./prof");
  assert.equal(resolveOutputDir(undefined, {} as Profile), "./output/");
});

test("expandHome expands a leading ~", () => {
  assert.ok(!expandHome("~/x").startsWith("~"));
  assert.equal(expandHome("./rel"), "./rel");
});

test("generate writes <label>-<profile>-<hash>-qr.svg only by default", async () => {
  const profilesDir = seededProfiles();
  const out = outDir();
  const written = await generate({
    profile: "black",
    url: "https://youtube.com",
    output: out,
    profilesDir,
    interactive: false,
  });
  assert.equal(written.length, 1);
  const files = readdirSync(out);
  assert.deepEqual(files.map((f) => f.replace(/\.svg$/, "")).length, 1);
  assert.match(files[0], /^youtube-black-[0-9a-f]{12}-qr\.svg$/);
});

test("returns a fully-qualified absolute path", async () => {
  const profilesDir = seededProfiles();
  const out = outDir();
  const [svg] = await generate({
    profile: "black",
    url: "https://youtube.com",
    output: out,
    profilesDir,
    interactive: false,
  });
  assert.ok(isAbsolute(svg), `expected absolute path, got ${svg}`);
  assert.ok(existsSync(svg));
});

test("a relative output dir is resolved to an absolute path", async () => {
  const profilesDir = seededProfiles();
  const cwd = mkdtempSync(join(tmpdir(), "qrgen-cwd-"));
  const prev = process.cwd();
  try {
    process.chdir(cwd);
    const [svg] = await generate({
      profile: "white",
      url: "https://x.com",
      output: "out",
      profilesDir,
      interactive: false,
    });
    assert.ok(isAbsolute(svg), `expected absolute path, got ${svg}`);
    assert.ok(existsSync(svg));
  } finally {
    process.chdir(prev);
  }
});

test("generate --png writes both svg and png", async () => {
  const profilesDir = seededProfiles();
  const out = outDir();
  await generate({
    profile: "white",
    url: "https://youtube.com",
    output: out,
    png: true,
    profilesDir,
    interactive: false,
  });
  const files = readdirSync(out);
  assert.equal(files.length, 2);
  assert.ok(files.some((f) => f.endsWith(".png")));
  assert.ok(files.some((f) => f.endsWith(".svg")));
});
