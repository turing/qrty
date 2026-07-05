/**
 * Force every fill and stroke in an SVG to a single `color` (preserving `none`),
 * so a multi-color brand icon prints as one flat color. Gradients collapse to
 * the color; elements with no explicit fill inherit it from the root.
 */
export function recolorSvg(svg: string, color: string): string {
  let out = svg
    .replace(/(\bfill\s*=\s*")(?!none")[^"]*(")/gi, `$1${color}$2`)
    .replace(/(\bstroke\s*=\s*")(?!none")[^"]*(")/gi, `$1${color}$2`)
    .replace(/(fill\s*:\s*)(?!none)[^;"'}]+/gi, `$1${color}`)
    .replace(/(stroke\s*:\s*)(?!none)[^;"'}]+/gi, `$1${color}`);
  if (!/<svg[^>]*\bfill\s*=/i.test(out)) {
    out = out.replace(/<svg\b/i, `<svg fill="${color}"`);
  }
  return out;
}

/** Recolor an `image/svg+xml` data URI; other data URIs pass through unchanged. */
export function recolorSvgDataUri(dataUri: string, color: string): string {
  const m = dataUri.match(/^data:image\/svg\+xml;base64,(.*)$/);
  if (!m) return dataUri;
  const svg = Buffer.from(m[1], "base64").toString("utf8");
  const recolored = recolorSvg(svg, color);
  return `data:image/svg+xml;base64,${Buffer.from(recolored, "utf8").toString("base64")}`;
}
