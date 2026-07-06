import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { generate, resolveOutputDir, expandHome, run } from "./cli.ts";
import { installStarterProfiles } from "./bootstrap.ts";
import { defaultCacheDir } from "./cache.ts";
import type { Profile } from "./profiles.ts";

async function captureRun(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  let out = "";
  let err = "";
  process.stdout.write = ((s: string) => ((out += s), true)) as typeof process.stdout.write;
  process.stderr.write = ((s: string) => ((err += s), true)) as typeof process.stderr.write;
  try {
    const code = await run(argv);
    return { code, out, err };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

function seededProfiles(): { defaultDir: string; searchDirs: string[] } {
  const home = mkdtempSync(join(tmpdir(), "qrgen-"));
  const defaultDir = join(home, "profiles", "default");
  installStarterProfiles(defaultDir);
  return { defaultDir, searchDirs: [join(home, "profiles", "user"), defaultDir] };
}

function outDir(): string {
  return mkdtempSync(join(tmpdir(), "qrgen-out-"));
}

test("run 'cache path' prints the cache directory", async () => {
  const { code, out } = await captureRun(["cache", "path"]);
  assert.equal(code, 0);
  assert.equal(out.trim(), defaultCacheDir());
});

test("run 'cache' with an unknown subcommand errors", async () => {
  const { code, err } = await captureRun(["cache", "bogus"]);
  assert.equal(code, 2);
  assert.match(err, /cache/);
});

test("run 'icons' lists selections", async () => {
  const { code, out } = await captureRun(["icons"]);
  assert.equal(code, 0);
  assert.match(out, /youtube/);
});

test("--help lists the icons and cache subcommands", async () => {
  const { code, out } = await captureRun(["--help"]);
  assert.equal(code, 0);
  assert.match(out, /\bicons\b/);
  assert.match(out, /\bcache\b/);
});

test("'icons --help' prints help, not the selection list", async () => {
  const { code, out } = await captureRun(["icons", "--help"]);
  assert.equal(code, 0);
  assert.match(out, /Usage: qrgen icons/);
  assert.doesNotMatch(out, /simpleicons\.org/); // not the icon list
});

test("run 'cache clear' reports what it freed", async () => {
  const { code, out } = await captureRun(["cache", "clear"]);
  assert.equal(code, 0);
  assert.match(out, /Cleared \d+ cached asset\(s\), freed \d+ bytes\./);
});

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
  const { defaultDir, searchDirs } = seededProfiles();
  const out = outDir();
  const written = await generate({
    profile: "black",
    url: "https://youtube.com",
    output: out,
    defaultDir,
    searchDirs,
    interactive: false,
  });
  assert.equal(written.length, 1);
  const files = readdirSync(out);
  assert.deepEqual(files.map((f) => f.replace(/\.svg$/, "")).length, 1);
  assert.match(files[0], /^youtube-black-[0-9a-f]{12}-qr\.svg$/);
});

test("returns a fully-qualified absolute path", async () => {
  const { defaultDir, searchDirs } = seededProfiles();
  const out = outDir();
  const [svg] = await generate({
    profile: "black",
    url: "https://youtube.com",
    output: out,
    defaultDir,
    searchDirs,
    interactive: false,
  });
  assert.ok(isAbsolute(svg), `expected absolute path, got ${svg}`);
  assert.ok(existsSync(svg));
});

test("a relative output dir is resolved to an absolute path", async () => {
  const { defaultDir, searchDirs } = seededProfiles();
  const cwd = mkdtempSync(join(tmpdir(), "qrgen-cwd-"));
  const prev = process.cwd();
  try {
    process.chdir(cwd);
    const [svg] = await generate({
      profile: "white",
      url: "https://x.com",
      output: "out",
      defaultDir,
      searchDirs,
      interactive: false,
    });
    assert.ok(isAbsolute(svg), `expected absolute path, got ${svg}`);
    assert.ok(existsSync(svg));
  } finally {
    process.chdir(prev);
  }
});

test("generate --png writes both svg and png", async () => {
  const { defaultDir, searchDirs } = seededProfiles();
  const out = outDir();
  await generate({
    profile: "white",
    url: "https://youtube.com",
    output: out,
    png: true,
    defaultDir,
    searchDirs,
    interactive: false,
  });
  const files = readdirSync(out);
  assert.equal(files.length, 2);
  assert.ok(files.some((f) => f.endsWith(".png")));
  assert.ok(files.some((f) => f.endsWith(".svg")));
});
