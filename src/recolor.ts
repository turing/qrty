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

/**
 * Recolor an `image/svg+xml` data URI; other data URIs pass through unchanged.
 * `resolveImage` normalizes any well-formed SVG data URI to base64, so the
 * non-base64 branch here only fires for a malformed data URI that fell through
 * unchanged from `resolveImage` (a pre-existing, unrecolored passthrough).
 */
export function recolorSvgDataUri(dataUri: string, color: string): string {
  const m = dataUri.match(/^data:image\/svg\+xml;base64,(.*)$/);
  if (!m) return dataUri;
  const svg = Buffer.from(m[1], "base64").toString("utf8");
  const recolored = recolorSvg(svg, color);
  return `data:image/svg+xml;base64,${Buffer.from(recolored, "utf8").toString("base64")}`;
}

export type RecolorStrategy = "url-suffix" | "svg-filter";

/**
 * How a logo source recolors to the QR's foreground. Simple Icons' CDN recolors
 * via a `/<hex>` URL suffix; every other SVG source is recolored by the
 * fill/stroke filter after fetch. Host-derived, so it also governs a profile
 * `image` that points at the Simple Icons CDN — not just auto-icons. Non-URL
 * sources (`data:`, file paths) are `"svg-filter"`.
 */
export function recolorStrategy(source: string): RecolorStrategy {
  return source.startsWith("https://cdn.simpleicons.org/") ? "url-suffix" : "svg-filter";
}

/** Simple Icons CDN recolor URL: append the hex (no leading `#`) to the icon path. */
export function simpleIconsRecolorUrl(url: string, color: string): string {
  return `${url.replace(/\/+$/, "")}/${color.replace(/^#/, "")}`;
}
