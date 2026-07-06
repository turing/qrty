import { test } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";

import { qrgenHome } from "./paths.ts";

test("qrgenHome returns ~/.qrgen", () => {
  assert.equal(qrgenHome(), join(homedir(), ".qrgen"));
});
