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

export { expandHome };

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
  if (argv[0] === "icons") {
    for (const { match, url } of listSelections()) {
      process.stdout.write(`${match.padEnd(24)} ${url}\n`);
    }
    return 0;
  }

  if (argv[0] === "cache") {
    const sub = argv[1];
    if (sub === "path") {
      process.stdout.write(`${defaultCacheDir()}\n`);
      return 0;
    }
    if (sub === "clear") {
      const { entries, bytes } = clearCache(defaultCacheDir());
      process.stdout.write(
        `Cleared ${entries} cached asset(s), freed ${bytes} bytes.\n`,
      );
      return 0;
    }
    process.stderr.write(
      `error: unknown cache subcommand '${sub ?? ""}'. Use 'path' or 'clear'.\n`,
    );
    return 2;
  }

  const program = new Command();
  program
    .name("qrgen")
    .description("Render a styled SVG (and optional PNG) QR code from a profile.")
    .argument("<profile>", "profile name (~/.qrgen/profiles/<profile>.json)")
    .argument("<url>", "URL to encode")
    .option("-o, --output <dir>", "output directory (overrides the profile)")
    .option("--png", "also write a PNG next to the SVG")
    .option("--size <px>", "image size in pixels", (v) => Number.parseInt(v, 10))
    .option("--label <text>", "caption below the QR (color set by the profile)")
    .allowExcessArguments(false)
    .exitOverride();

  let profile: string;
  let url: string;
  let opts: {
    output?: string;
    png?: boolean;
    size?: number;
    label?: string;
  };
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
      label: opts.label,
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
