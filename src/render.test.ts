import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderSvg, renderPng, labelPng } from "./render.ts";
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

test("embeds a viewBox-only svg logo by injecting dimensions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qrgen-vb-"));
  const logo = join(dir, "vb.svg");
  writeFileSync(
    logo,
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
      "<rect width='100' height='100' fill='#c00'/></svg>",
  );
  const svg = (
    await renderSvg(
      { ...P, image: logo, imageOptions: { imageSize: 0.3, hideBackgroundDots: true } },
      "https://x.com",
    )
  ).toString("utf8");
  assert.match(svg, /<image /);
});

test("autoIcon embeds a logo matching the url domain", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      "<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'>" +
        "<rect width='40' height='40' fill='#000'/></svg>",
      { headers: { "content-type": "image/svg+xml" } },
    )) as typeof fetch;
  try {
    const profile = {
      dots: { type: "rounded", color: "#000000" },
      background: { color: "#FFFFFF" },
      autoIcon: true,
      imageOptions: { imageSize: 0.3, hideBackgroundDots: true },
    } as Profile;
    const svg = (await renderSvg(profile, "https://youtube.com/watch?v=x")).toString("utf8");
    assert.match(svg, /<image /);
  } finally {
    globalThis.fetch = orig;
  }
});

test("autoIcon with an unknown domain renders no logo", async () => {
  const profile = {
    dots: { type: "rounded", color: "#000000" },
    background: { color: "#FFFFFF" },
    autoIcon: true,
  } as Profile;
  const svg = (await renderSvg(profile, "https://no-brand-xyz.example/")).toString("utf8");
  assert.doesNotMatch(svg, /<image /);
});

test("renders png bytes", { skip: !CANVAS }, async () => {
  const png = await renderPng(P, "https://youtube.com");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});

test("labelPng composites a caption below the png", { skip: !CANVAS }, async () => {
  const png = await renderPng(P, "https://youtube.com");
  const labeled = await labelPng(png, {
    text: "example.com",
    color: "#000000",
    background: "#FFFFFF",
  });
  assert.equal(labeled.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(labeled.length > png.length, "labeled png should be taller/larger");
});
