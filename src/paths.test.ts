import { test } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";

import { qrtyHome } from "./paths.ts";

test("qrtyHome returns ~/.qrty", () => {
  assert.equal(qrtyHome(), join(homedir(), ".qrty"));
});
