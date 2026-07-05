const XML: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML[c] as string);
}

export interface LabelOptions {
  text: string;
  /** Fill for the text — defaults to the QR's base color at the call site. */
  color: string;
  /** Solid background of the QR; the label strip matches it (skipped if transparent). */
  background?: string;
}

/**
 * Add a caption below a qr-code-styling SVG, constrained to the code's width.
 * Expands the height/viewBox by a strip and appends a centered <text>. The font
 * shrinks to fit long text and is capped so short text is not stretched.
 */
export function addLabel(svg: string, opts: LabelOptions): string {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!root) return svg;
  const width = Number(root.match(/\bwidth="([\d.]+)"/)?.[1]);
  const height = Number(root.match(/\bheight="([\d.]+)"/)?.[1]);
  if (!width || !height) return svg;

  const pad = width * 0.06;
  const stripH = Math.round(width * 0.14);
  const maxFont = stripH * 0.62;
  const fitFont = (width - 2 * pad) / (0.56 * Math.max(opts.text.length, 1));
  const fontSize = Math.max(6, Math.min(maxFont, fitFont));
  const newHeight = height + stripH;
  const baselineY = height + stripH * 0.66;

  const newRoot = root
    .replace(/\bheight="[\d.]+"/, `height="${newHeight}"`)
    .replace(/viewBox="0 0 [\d.]+ [\d.]+"/, `viewBox="0 0 ${width} ${newHeight}"`);

  const strip =
    opts.background && opts.background !== "transparent"
      ? `<rect x="0" y="${height}" width="${width}" height="${stripH}" fill="${opts.background}"/>`
      : "";

  const text =
    `<text x="${width / 2}" y="${baselineY.toFixed(2)}" text-anchor="middle" ` +
    `font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" ` +
    `font-size="${fontSize.toFixed(2)}" fill="${opts.color}">` +
    `${escapeXml(opts.text)}</text>`;

  return svg
    .replace(root, newRoot + strip)
    .replace(/<\/svg>\s*$/, text + "</svg>");
}
