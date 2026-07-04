import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { QrgenError } from "./errors.ts";
import { PROFILES_DIR } from "./profiles.ts";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

/**
 * Copy the bundled starter profiles into `profilesDir` and the JSON schema into
 * its parent (so each profile's `"$schema": "../profile.schema.json"` resolves).
 * Returns the installed profile file names.
 */
export function installStarterProfiles(profilesDir: string): string[] {
  mkdirSync(profilesDir, { recursive: true });
  const source = join(DATA, "profiles");
  const installed = readdirSync(source).filter((f) => f.endsWith(".json"));
  for (const file of installed) {
    copyFileSync(join(source, file), join(profilesDir, file));
  }
  copyFileSync(
    join(DATA, "profile.schema.json"),
    join(dirname(profilesDir), "profile.schema.json"),
  );
  return installed.sort();
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

/**
 * Ensure the profiles directory exists, offering to create it on first run.
 * No-op if present. Interactive: prompt (default yes) then seed. Non-interactive:
 * throw with guidance rather than hang. Throws if the user declines.
 */
export async function ensureProfilesDir(
  profilesDir: string = PROFILES_DIR,
  opts: EnsureOptions = { interactive: process.stdin.isTTY ?? false },
): Promise<void> {
  if (existsSync(profilesDir)) return;

  if (!opts.interactive) {
    throw new QrgenError(
      `No profiles directory at ${profilesDir}. Run qrgen in a terminal once ` +
        `to create it, or create the directory and add a <profile>.json.`,
    );
  }

  const confirm = opts.confirm ?? defaultConfirm;
  const ok = await confirm(
    `No profiles directory at ${profilesDir}. ` +
      `Create it and install the starter profiles? [Y/n] `,
  );
  if (!ok) {
    throw new QrgenError(
      `No profiles directory at ${profilesDir}; nothing to do.`,
    );
  }

  const installed = installStarterProfiles(profilesDir);
  const stream = opts.stream ?? process.stderr;
  stream.write(`Created ${profilesDir}\n`);
  for (const file of installed) {
    stream.write(`  installed profile: ${file}\n`);
  }
}
