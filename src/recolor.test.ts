import { test } from "node:test";
import assert from "node:assert/strict";

import {
  recolorSvg,
  recolorSvgDataUri,
  recolorStrategy,
  simpleIconsRecolorUrl,
} from "./recolor.ts";

test("rewrites fill and stroke to the color, preserving none", () => {
  const svg =
    '<svg><path fill="#ff0000" stroke="#00ff00"/><rect fill="none"/>' +
    '<circle stroke="none"/></svg>';
  const out = recolorSvg(svg, "#FFFFFF");
  assert.match(out, /fill="#FFFFFF"/);
  assert.match(out, /stroke="#FFFFFF"/);
  assert.match(out, /fill="none"/);
  assert.match(out, /stroke="none"/);
  assert.doesNotMatch(out, /#ff0000/i);
});

test("rewrites inline style fill/stroke", () => {
  const out = recolorSvg(
    '<svg><path style="fill:#123456;stroke:#654321"/></svg>',
    "#000000",
  );
  assert.match(out, /fill:#000000/);
  assert.match(out, /stroke:#000000/);
});

test("adds a root fill so default-fill elements inherit the color", () => {
  const out = recolorSvg('<svg viewBox="0 0 10 10"><path d="M0 0h10z"/></svg>', "#abcdef");
  assert.match(out, /<svg[^>]*fill="#abcdef"/);
});

test("recolorSvgDataUri recolors svg data URIs and passes others through", () => {
  const b64 = Buffer.from('<svg><path fill="#f00"/></svg>').toString("base64");
  const out = recolorSvgDataUri(`data:image/svg+xml;base64,${b64}`, "#FFFFFF");
  const decoded = Buffer.from(out.split(",")[1], "base64").toString("utf8");
  assert.match(decoded, /fill="#FFFFFF"/);

  const png = "data:image/png;base64,AAAA";
  assert.equal(recolorSvgDataUri(png, "#FFFFFF"), png);
});

test("recolorStrategy is url-suffix only for the Simple Icons CDN", () => {
  assert.equal(recolorStrategy("https://cdn.simpleicons.org/github"), "url-suffix");
  assert.equal(recolorStrategy("https://cdn.simpleicons.org/github/"), "url-suffix");
  assert.equal(recolorStrategy("https://api-img.icons8.com/?id=x"), "svg-filter");
  assert.equal(recolorStrategy("https://uxwing.com/foo.svg"), "svg-filter");
  assert.equal(recolorStrategy("data:image/svg+xml;base64,AAAA"), "svg-filter");
  assert.equal(recolorStrategy("~/logo.svg"), "svg-filter");
});

test("simpleIconsRecolorUrl appends the hex without '#', trimming a trailing slash", () => {
  assert.equal(simpleIconsRecolorUrl("https://cdn.simpleicons.org/github", "#FFFFFF"),
    "https://cdn.simpleicons.org/github/FFFFFF");
  assert.equal(simpleIconsRecolorUrl("https://cdn.simpleicons.org/github/", "#0a0a0a"),
    "https://cdn.simpleicons.org/github/0a0a0a");
  assert.equal(simpleIconsRecolorUrl("https://cdn.simpleicons.org/x", "abcdef"),
    "https://cdn.simpleicons.org/x/abcdef");
});
