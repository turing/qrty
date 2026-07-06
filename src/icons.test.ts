import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveAutoIconUrl, listSelections } from "./icons.ts";

test("matches a plain domain to its icon", () => {
  assert.match(resolveAutoIconUrl("https://youtube.com/watch?v=x") ?? "", /youtube/);
});

test("strips www and matches", () => {
  assert.ok(resolveAutoIconUrl("https://www.github.com/x"));
});

test("prefers a specific host over the registrable domain", () => {
  const docs = resolveAutoIconUrl("https://docs.google.com/document/1");
  const plain = resolveAutoIconUrl("https://google.com/search?q=x");
  assert.match(docs ?? "", /googledocs/);
  assert.match(plain ?? "", /simpleicons\.org\/google$/);
  assert.notEqual(docs, plain);
});

test("multipart TLD resolves by registrable domain", () => {
  // rakuten.co.jp -> label 'rakuten'
  assert.ok(resolveAutoIconUrl("https://www.rakuten.co.jp/"));
});

test("unknown domain returns null", () => {
  assert.equal(resolveAutoIconUrl("https://no-such-brand-xyz.example/"), null);
});

test("listSelections returns keyword -> url pairs", () => {
  const list = listSelections();
  assert.ok(list.length > 30);
  assert.ok(list.every((e) => e.match && e.url.startsWith("http")));
});

test("bare-keyword overfit matches are removed", () => {
  assert.equal(resolveAutoIconUrl("https://word.com/"), null);
  assert.equal(resolveAutoIconUrl("https://excel.com/"), null);
  assert.equal(resolveAutoIconUrl("https://powerpoint.com/"), null);
});

test("real office/teams domains still resolve", () => {
  assert.ok(resolveAutoIconUrl("https://office.com/"));
  assert.ok(resolveAutoIconUrl("https://teams.microsoft.com/"));
});

test("non-office.com label no longer matches office", () => {
  assert.equal(resolveAutoIconUrl("https://office.io/"), null);
});
