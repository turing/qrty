import { test } from "node:test";
import assert from "node:assert/strict";

import { LABEL_FONTS, fontFamily, fontImportCss } from "./fonts.ts";
import { QrgenError } from "./errors.ts";

test("allows exactly Open Sans, Roboto, Montserrat", () => {
  assert.deepEqual(LABEL_FONTS, ["Open Sans", "Roboto", "Montserrat"]);
});

test("fontImportCss references Google Fonts with the family name", () => {
  assert.match(
    fontImportCss("Open Sans"),
    /@import url\('https:\/\/fonts\.googleapis\.com\/css2\?family=Open\+Sans/,
  );
});

test("fontFamily returns the CSS family", () => {
  assert.equal(fontFamily("Montserrat"), "Montserrat");
});

test("an unknown font throws", () => {
  assert.throws(() => fontFamily("Comic Sans"), QrgenError);
});
