import { test } from "node:test";
import assert from "node:assert/strict";

import schema from "../data/profile.schema.json" with { type: "json" };
import {
  DOT_TYPES,
  CORNER_SQUARE_TYPES,
  CORNER_DOT_TYPES,
  ERROR_CORRECTION_LEVELS,
} from "../src/styles.ts";

test("dot types match the schema enum", () => {
  assert.deepEqual([...DOT_TYPES], schema.$defs.dotType.enum);
});

test("corner-square types match the schema enum", () => {
  assert.deepEqual([...CORNER_SQUARE_TYPES], schema.$defs.cornerSquareType.enum);
});

test("corner-dot types match the schema enum", () => {
  assert.deepEqual([...CORNER_DOT_TYPES], schema.$defs.cornerDotType.enum);
});

test("error-correction levels match the schema enum", () => {
  assert.deepEqual(
    [...ERROR_CORRECTION_LEVELS],
    schema.properties.errorCorrectionLevel.enum,
  );
});
