import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

/** A unique temp path next to `path` (pid + random), always ending in `.tmp`. */
export function uniqueTmpPath(path: string): string {
  return `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
}

/** Write `bytes` to `path` atomically: unique temp file → rename. Creates parent dirs. */
export function atomicWrite(path: string, bytes: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = uniqueTmpPath(path);
  writeFileSync(tmp, bytes);
  renameSync(tmp, path);
}
