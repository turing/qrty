import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { QrtyError } from "./errors.ts";
import { DEFAULT_DIR } from "./profiles.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const ASSETS = join(DATA, "assets");

/**
 * Seed the bundled starter profiles into `defaultDir` (…/profiles/default),
 * create the sibling `user/`, and place shared assets: the JSON schema at
 * …/profiles/profile.schema.json (so `"$schema": "../profile.schema.json"`
 * resolves from either default/ or user/) and the bundled sample images under
 * ~/.qrty/assets/default/. Returns the installed profile file names.
 */
export function installStarterProfiles(defaultDir: string): string[] {
  const profilesRoot = dirname(defaultDir); // …/.qrty/profiles
  const qrtyHome = dirname(profilesRoot); // …/.qrty

  mkdirSync(defaultDir, { recursive: true });
  mkdirSync(join(profilesRoot, "user"), { recursive: true });

  const source = join(DATA, "profiles");
  const installed = readdirSync(source).filter((f) => f.endsWith(".json"));
  for (const file of installed) {
    copyFileSync(join(source, file), join(defaultDir, file));
  }
  copyFileSync(
    join(DATA, "profile.schema.json"),
    join(profilesRoot, "profile.schema.json"),
  );
  // Bundled sample assets -> ~/.qrty/assets/default/ (available for your own
  // profiles to reference locally).
  const assetsSrc = join(ASSETS, "default");
  const assetsDst = join(qrtyHome, "assets", "default");
  mkdirSync(assetsDst, { recursive: true });
  for (const file of readdirSync(assetsSrc)) {
    copyFileSync(join(assetsSrc, file), join(assetsDst, file));
  }
  return installed.sort();
}

/**
 * Migrate a pre-split layout — profiles sitting directly in …/profiles/*.json.
 * A flat profile byte-identical to its bundled default is an unedited copy and
 * is discarded (the fresh default/ version replaces it). Edited or custom
 * profiles move into user/ so they survive and override. Runs only when flat
 * profiles exist and no `default/` has been created yet. Returns the names moved
 * to user/.
 */
export function migrateLegacyProfiles(profilesRoot: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(profilesRoot);
  } catch {
    return []; // no profiles root yet
  }
  const flat = entries.filter((f) => f.endsWith(".json"));
  if (flat.length === 0 || entries.includes("default")) return [];

  const userDir = join(profilesRoot, "user");
  mkdirSync(userDir, { recursive: true });
  const bundledDir = join(DATA, "profiles");
  const bundled = new Set(readdirSync(bundledDir));

  const moved: string[] = [];
  for (const file of flat) {
    const src = join(profilesRoot, file);
    const unedited =
      bundled.has(file) &&
      readFileSync(src, "utf8") === readFileSync(join(bundledDir, file), "utf8");
    if (unedited) {
      unlinkSync(src); // identical to the bundled default — discard
      continue;
    }
    const target = join(userDir, file);
    if (existsSync(target)) {
      unlinkSync(src); // keep the existing user profile
    } else {
      renameSync(src, target);
    }
    moved.push(file);
  }
  return moved.sort();
}

async function defaultConfirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return answer === "" || answer === "y" || answer === "yes"; // default: yes
}

export interface EnsureOptions {
  interactive: boolean;
  confirm?: (question: string) => boolean | Promise<boolean>;
  stream?: { write: (s: string) => void };
}

function hasProfiles(dir: string): boolean {
  try {
    return readdirSync(dir).some((f) => f.endsWith(".json"));
  } catch {
    return false; // directory absent
  }
}

/**
 * Ensure the default profiles are present, migrating any legacy flat layout into
 * user/ first, then offering to seed the starters into `defaultDir` if it holds
 * none. No-op once defaults exist. Interactive: prompt (default yes). Non-
 * interactive: throw rather than hang. Throws if declined.
 */
export async function ensureProfilesDir(
  defaultDir: string = DEFAULT_DIR,
  opts: EnsureOptions = { interactive: process.stdin.isTTY ?? false },
): Promise<void> {
  const stream = opts.stream ?? process.stderr;

  const moved = migrateLegacyProfiles(dirname(defaultDir));
  for (const file of moved) {
    stream.write(`  migrated to user/: ${file}\n`);
  }

  if (hasProfiles(defaultDir)) return;

  if (!opts.interactive) {
    throw new QrtyError(
      `No profiles found in ${defaultDir}. Run qrty in a terminal once to ` +
        `seed the starter profiles, or add a <profile>.json.`,
    );
  }

  const confirm = opts.confirm ?? defaultConfirm;
  const ok = await confirm(
    `No profiles found in ${defaultDir}. Install the starter profiles? [Y/n] `,
  );
  if (!ok) {
    throw new QrtyError(`No profiles in ${defaultDir}; nothing to do.`);
  }

  const installed = installStarterProfiles(defaultDir);
  stream.write(`Seeded ${defaultDir}\n`);
  for (const file of installed) {
    stream.write(`  installed profile: ${file}\n`);
  }
}
