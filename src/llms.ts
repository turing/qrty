export interface LlmsMeta {
  name: string;
  description: string;
}

/**
 * Condense a README into an `llms.txt`-style digest: an injected title +
 * one-line summary, then the README body with HTML comments, badges, and
 * standalone images stripped and blank runs collapsed. The result is a compact,
 * link-free document for feeding an LLM as project context.
 */
export function condenseReadme(readme: string, meta: LlmsMeta): string {
  const body = readme
    .replace(/<!--[\s\S]*?-->/g, "") // HTML comments
    .replace(/^\s*\[?!\[[^\]]*\]\([^)]*\)(?:\]\([^)]*\))?\s*$/gm, "") // badge / image lines
    .replace(/^#\s+.*$/m, "") // the README's own H1 (avoid a duplicate title)
    .replace(/\n{3,}/g, "\n\n") // collapse blank runs
    .trim();
  return `# ${meta.name}\n\n> ${meta.description}\n\n${body}\n`;
}
