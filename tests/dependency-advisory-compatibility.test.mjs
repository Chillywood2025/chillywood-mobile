#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));

test("patched advisory leaves are resolved independently in all three package trees", () => {
  const rootLock = readJson("package-lock.json");
  assert.equal(rootLock.packages["node_modules/@humanfs/node"].version, "0.16.8");
  assert.equal(rootLock.packages["node_modules/postcss"].version, "8.5.23");

  const alertLock = readJson("ops/alert-automation/package-lock.json");
  assert.equal(alertLock.packages["node_modules/nanoid"].version, "3.3.18");
  assert.equal(alertLock.packages["node_modules/postcss"].version, "8.5.23");
  assert.equal(alertLock.packages["node_modules/vitest"].version, "4.1.11");
  assert.equal(alertLock.packages["node_modules/@vitest/mocker"].version, "4.1.11");

  const isolatedLock = readJson("isolated-runtime/cloudflare/package-lock.json");
  assert.equal(isolatedLock.packages["node_modules/wrangler"].version, "4.141.0");
  assert.equal(isolatedLock.packages["node_modules/sharp"].version, "0.35.4");
  assert.equal(isolatedLock.packages["node_modules/undici"].version, "7.29.0");
});

test("the retained uuid 7 xcode consumer is confined to advisory-unaffected v4 generation", () => {
  const xcodeSource = fs.readFileSync("node_modules/xcode/lib/pbxProject.js", "utf8");
  assert.match(xcodeSource, /uuid\.v4\(\)/u);
  assert.doesNotMatch(xcodeSource, /uuid\.v(?:3|5|6)\(/u);
  assert.doesNotThrow(() => require("xcode"));
});
