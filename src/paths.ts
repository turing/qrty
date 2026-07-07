import { homedir } from "node:os";
import { join } from "node:path";

/** Expand a leading `~` / `~/` to the user's home directory. */
export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

/** The qrty config/cache root: `~/.qrty`. */
export function qrtyHome(): string {
  return join(homedir(), ".qrty");
}
