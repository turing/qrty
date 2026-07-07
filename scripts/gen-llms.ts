#!/usr/bin/env node
// Generate llms.txt — a condensed, link-free digest of README.md for use as
// LLM project context. Run with `npm run llms`.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { condenseReadme } from "../src/llms.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const readme = readFileSync(join(root, "README.md"), "utf8");

const out = condenseReadme(readme, { name: pkg.name, description: pkg.description });
writeFileSync(join(root, "llms.txt"), out);
console.log(`Wrote llms.txt (${out.length} bytes)`);
