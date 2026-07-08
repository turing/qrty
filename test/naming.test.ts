import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { deriveStem, labelFor } from "../src/naming.ts";

const h = (u: string): string =>
  createHash("sha256").update(u).digest("hex").slice(0, 12);

test("domain label strips www and tld", () => {
  assert.equal(labelFor("https://www.youtube.com/watch?v=abc"), "youtube");
});

test("multipart tld", () => {
  assert.equal(labelFor("http://bbc.co.uk/news"), "bbc");
});

test("subdomains reduce to registrable label", () => {
  assert.equal(labelFor("https://foo.bar.example.com"), "example");
});

test("bare domain without scheme", () => {
  assert.equal(labelFor("youtube.com"), "youtube");
});

test("ipv4 label verbatim", () => {
  assert.equal(labelFor("http://192.168.1.1/x"), "192.168.1.1");
});

test("ipv6 unsafe chars collapse", () => {
  assert.equal(labelFor("http://[::1]:8080/"), "--1");
});

test("unresolvable falls back to qr", () => {
  assert.equal(labelFor("not a url at all"), "qr");
});

test("stem includes profile and hash", () => {
  const url = "https://youtube.com";
  assert.equal(deriveStem(url, "black"), `youtube-black-${h(url)}-qr`);
});

test("profile disambiguates same url", () => {
  const url = "https://youtube.com";
  assert.notEqual(deriveStem(url, "black"), deriveStem(url, "ghost"));
});
