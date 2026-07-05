import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderSvg, renderPng } from "./render.ts";
import type { Profile } from "./profiles.ts";

const P: Profile = {
  dots: { type: "rounded", color: "#000000" },
  cornersSquare: { type: "extra-rounded", color: "#000000" },
  cornersDot: { type: "dot", color: "#000000" },
  background: { color: "#FFFFFF" },
};

const CANVAS = await import("canvas").then(() => true).catch(() => false);

test("renders an svg buffer", async () => {
  const svg = (await renderSvg(P, "https://youtube.com")).toString("utf8");
  assert.match(svg, /<svg/);
  assert.match(svg, /<\/svg>/);
});

test("svg reflects the background color", async () => {
  const svg = (
    await renderSvg({ ...P, background: { color: "#123456" } }, "https://x.com")
  ).toString("utf8");
  assert.match(svg, /#123456/i);
});

test("embeds an svg logo without needing canvas", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qrgen-logo-"));
  const logo = join(dir, "logo.svg");
  writeFileSync(
    logo,
    "<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'>" +
      "<circle cx='20' cy='20' r='18' fill='#c00'/></svg>",
  );
  const svg = (
    await renderSvg(
      { ...P, image: logo, imageOptions: { imageSize: 0.3, hideBackgroundDots: true } },
      "https://x.com",
    )
  ).toString("utf8");
  assert.match(svg, /<image /);
});

test("renders png bytes", { skip: !CANVAS }, async () => {
  const png = await renderPng(P, "https://youtube.com");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});
