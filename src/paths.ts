import { homedir } from "node:os";
import { join } from "node:path";

/** Expand a leading `~` / `~/` to the user's home directory. */
export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

/** The qrgen config/cache root: `~/.qrgen`. */
export function qrgenHome(): string {
  return join(homedir(), ".qrgen");
}
