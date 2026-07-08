import { test } from "node:test";
import assert from "node:assert/strict";

import { addLabel } from "../src/label.ts";

const SVG = (w = 300, h = 300) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect/></svg>`;

test("expands height and viewBox and appends centered text", () => {
  const out = addLabel(SVG(), { text: "example.com", color: "#123456" });
  const h = Number(out.match(/height="([\d.]+)"/)![1]);
  assert.ok(h > 300);
  assert.match(out, new RegExp(`viewBox="0 0 300 ${h}"`));
  assert.match(out, /<text[^>]*text-anchor="middle"[^>]*fill="#123456"[^>]*>example\.com<\/text>/);
});

test("escapes XML in the label text", () => {
  const out = addLabel(SVG(100, 100), { text: "a&b<c>\"'", color: "#000000" });
  assert.match(out, /a&amp;b&lt;c&gt;&quot;&apos;/);
});

test("adds a background strip only for a solid background", () => {
  const solid = addLabel(SVG(100, 100), { text: "x", color: "#000", background: "#FFFFFF" });
  assert.match(solid, /<rect x="0" y="100"[^>]*fill="#FFFFFF"/);
  const clear = addLabel(SVG(100, 100), { text: "x", color: "#000", background: "transparent" });
  assert.doesNotMatch(clear, /<rect x="0" y="100"/);
});

test("shorter text is not stretched past a max font size", () => {
  const out = addLabel(SVG(), { text: "hi", color: "#000" });
  const fs = Number(out.match(/font-size="([\d.]+)"/)![1]);
  assert.ok(fs <= 300 * 0.14 * 0.62 + 0.01);
});
