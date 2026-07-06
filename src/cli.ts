#!/usr/bin/env node
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command, CommanderError } from "commander";

import { ensureProfilesDir } from "./bootstrap.ts";
import { clearCache, defaultCacheDir } from "./cache.ts";
import { QrgenError } from "./errors.ts";
import { ensureFontFile, fontFaceCss, fontFamily } from "./fonts.ts";
import { listSelections } from "./icons.ts";
import { addLabel } from "./label.ts";
import { deriveStem } from "./naming.ts";
import { expandHome } from "./paths.ts";
import {
  DEFAULT_DIR,
  SEARCH_DIRS,
  loadProfile,
  type Profile,
} from "./profiles.ts";
import { labelPng, renderPng, renderSvg } from "./render.ts";

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
  /** Caption below the QR; color comes from the profile's labelColor. */
  label?: string;
  /** Where to seed starters (defaults to ~/.qrgen/profiles/default). */
  defaultDir?: string;
  /** Profile lookup order (defaults to [user, default]). */
  searchDirs?: string[];
  interactive?: boolean;
}

export async function generate(opts: GenerateOptions): Promise<string[]> {
  await ensureProfilesDir(opts.defaultDir ?? DEFAULT_DIR, {
    interactive: opts.interactive ?? Boolean(process.stdin.isTTY),
  });

  const profile = loadProfile(opts.profile, opts.searchDirs ?? SEARCH_DIRS);
  const stem = deriveStem(opts.url, opts.profile);
  const dir = resolveOutputDir(opts.output, profile);
  mkdirSync(dir, { recursive: true });

  const labelColor =
    profile.labelColor ?? profile.dots.color ?? "#000000";
  const labelBg = profile.background?.color;

  let svg = (await renderSvg(profile, opts.url, opts.size)).toString("utf8");
  if (opts.label) {
    const font = profile.labelFont
      ? {
          family: fontFamily(profile.labelFont),
          css: await fontFaceCss(profile.labelFont, opts.label),
        }
      : undefined;
    svg = addLabel(svg, {
      text: opts.label,
      color: labelColor,
      background: labelBg,
      font,
    });
  }

  const written: string[] = [];
  const svgPath = join(dir, `${stem}.svg`);
  writeFileSync(svgPath, svg);
  written.push(resolve(svgPath));

  if (opts.png) {
    let png = await renderPng(profile, opts.url, opts.size);
    if (opts.label) {
      const font = profile.labelFont
        ? {
            path: await ensureFontFile(profile.labelFont),
            family: fontFamily(profile.labelFont),
          }
        : undefined;
      png = await labelPng(png, {
        text: opts.label,
        color: labelColor,
        background: labelBg,
        font,
      });
    }
    const pngPath = join(dir, `${stem}.png`);
    writeFileSync(pngPath, png);
    written.push(resolve(pngPath));
  }
  return written;
}

export async function run(argv: string[]): Promise<number> {
  const program = new Command();
  program
    .name("qrgen")
    .description("Render a styled SVG (and optional PNG) QR code from a profile.")
    .exitOverride()
    .allowExcessArguments(false);

  program
    .argument("<profile>", "profile name (~/.qrgen/profiles/<profile>.json)")
    .argument("<url>", "URL to encode")
    .option("-o, --output <dir>", "output directory (overrides the profile)")
    .option("--png", "also write a PNG next to the SVG")
    .option("--size <px>", "image size in pixels", (v) => Number.parseInt(v, 10))
    .option("--label <text>", "caption below the QR (color set by the profile)")
    .action(
      async (
        profile: string,
        url: string,
        opts: { output?: string; png?: boolean; size?: number; label?: string },
      ) => {
        // A QrgenError (or anything else) thrown here surfaces as a parseAsync
        // rejection and is classified in the single catch below.
        const written = await generate({
          profile,
          url,
          output: opts.output,
          png: opts.png,
          size: opts.size,
          label: opts.label,
        });
        for (const p of written) process.stdout.write(`${p}\n`);
      },
    );

  program
    .command("icons")
    .description("list every auto-icon selection (keyword -> url)")
    .action(() => {
      for (const { match, url } of listSelections()) {
        process.stdout.write(`${match.padEnd(24)} ${url}\n`);
      }
    });

  program
    .command("cache")
    .argument("<action>", "path | clear")
    .description("manage the remote-asset cache (path | clear)")
    .action((action: string) => {
      if (action === "path") {
        process.stdout.write(`${defaultCacheDir()}\n`);
        return;
      }
      if (action === "clear") {
        const { entries, bytes } = clearCache(defaultCacheDir());
        process.stdout.write(
          `Cleared ${entries} cached asset(s), freed ${bytes} bytes.\n`,
        );
        return;
      }
      throw new QrgenError(
        `unknown cache subcommand '${action}'. Use 'path' or 'clear'.`,
      );
    });

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (err) {
    // Usage/help/version already written by commander.
    if (err instanceof CommanderError) return err.exitCode;
    if (err instanceof QrgenError) {
      process.stderr.write(`error: ${err.message}\n`);
      return 2;
    }
    throw err; // unexpected — propagate exactly as before
  }
  return 0;
}

export async function main(): Promise<void> {
  process.exit(await run(process.argv.slice(2)));
}

// Run when invoked as the bin, not when imported by tests. Compare *real*
// paths so a symlinked bin (npm link / global install) still matches.
function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  void main();
}
