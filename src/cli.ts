#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Command, CommanderError } from "commander";

import { ensureProfilesDir } from "./bootstrap.ts";
import { QrgenError } from "./errors.ts";
import { deriveStem } from "./naming.ts";
import { loadProfile, PROFILES_DIR, type Profile } from "./profiles.ts";
import { renderPng, renderSvg } from "./render.ts";

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

export function resolveOutputDir(
  flag: string | undefined,
  profile: Profile,
): string {
  return expandHome(flag || profile.output || "./output/");
}

export interface GenerateOptions {
  profile: string;
  url: string;
  output?: string;
  png?: boolean;
  size?: number;
  profilesDir?: string;
  interactive?: boolean;
}

export async function generate(opts: GenerateOptions): Promise<string[]> {
  const profilesDir = opts.profilesDir ?? PROFILES_DIR;
  await ensureProfilesDir(profilesDir, {
    interactive: opts.interactive ?? Boolean(process.stdin.isTTY),
  });

  const profile = loadProfile(opts.profile, profilesDir);
  const stem = deriveStem(opts.url, opts.profile);
  const dir = resolveOutputDir(opts.output, profile);
  mkdirSync(dir, { recursive: true });

  const written: string[] = [];
  const svgPath = join(dir, `${stem}.svg`);
  writeFileSync(svgPath, await renderSvg(profile, opts.url, opts.size));
  written.push(svgPath);

  if (opts.png) {
    const pngPath = join(dir, `${stem}.png`);
    writeFileSync(pngPath, await renderPng(profile, opts.url, opts.size));
    written.push(pngPath);
  }
  return written;
}

export async function run(argv: string[]): Promise<number> {
  const program = new Command();
  program
    .name("qrgen")
    .description("Render a styled SVG (and optional PNG) QR code from a profile.")
    .argument("<profile>", "profile name (~/.qrgen/profiles/<profile>.json)")
    .argument("<url>", "URL to encode")
    .option("-o, --output <dir>", "output directory (overrides the profile)")
    .option("--png", "also write a PNG next to the SVG")
    .option("--size <px>", "image size in pixels", (v) => Number.parseInt(v, 10))
    .allowExcessArguments(false)
    .exitOverride();

  let profile: string;
  let url: string;
  let opts: { output?: string; png?: boolean; size?: number };
  try {
    program.parse(argv, { from: "user" });
    [profile, url] = program.args as [string, string];
    opts = program.opts();
  } catch (err) {
    // Usage/help/version already written by commander.
    return err instanceof CommanderError ? err.exitCode : 2;
  }

  try {
    const written = await generate({
      profile,
      url,
      output: opts.output,
      png: opts.png,
      size: opts.size,
    });
    for (const p of written) process.stdout.write(`${p}\n`);
    return 0;
  } catch (err) {
    if (err instanceof QrgenError) {
      process.stderr.write(`error: ${err.message}\n`);
      return 2;
    }
    throw err;
  }
}

export async function main(): Promise<void> {
  process.exit(await run(process.argv.slice(2)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
