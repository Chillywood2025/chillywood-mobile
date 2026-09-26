#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

test("xcode uses the patched uuid line without changing native identifier generation", () => {
  const rootManifest = readJson("package.json");
  const rootLock = readJson("package-lock.json");
  const xcodeSource = fs.readFileSync("node_modules/xcode/lib/pbxProject.js", "utf8");

  assert.equal(rootManifest.overrides["xcode@3.0.1"].uuid, "11.1.1");
  assert.equal(rootLock.packages["node_modules/xcode"].version, "3.0.1");
  assert.equal(rootLock.packages["node_modules/uuid"].version, "11.1.1");
  assert.match(xcodeSource, /uuid\.v4\(\)/u);
  assert.doesNotMatch(xcodeSource, /uuid\.v(?:3|5|6)\(/u);
  assert.doesNotThrow(() => require("xcode"));

  const project = require("xcode").project("/nonexistent/project.pbxproj");
  project.hash = { project: { objects: {} } };
  const identifiers = Array.from({ length: 256 }, () => project.generateUuid());

  assert.equal(new Set(identifiers).size, identifiers.length);
  for (const identifier of identifiers) {
    assert.match(identifier, /^[0-9A-F]{24}$/u);
  }

  const xcodeRequire = createRequire(require.resolve("xcode/package.json"));
  const uuid = xcodeRequire("uuid");
  assert.equal(xcodeRequire("uuid/package.json").version, "11.1.1");
  assert.equal(typeof uuid.v4, "function");
  assert.throws(() => uuid.v3("name", uuid.v3.DNS, new Uint8Array(1), 0), RangeError);
  assert.throws(() => uuid.v5("name", uuid.v5.DNS, new Uint8Array(1), 0), RangeError);
  assert.throws(() => uuid.v6({}, new Uint8Array(1), 0), RangeError);
});

test("the supported router query contract retains bounded auth-link behavior", () => {
  const queryString = require("query-string");
  const query = "name=Chi%27llywood&unicode=%E4%BD%A0%E5%A5%BD&tag=one&tag=two&malformed=%E0%A4%A&space=a+b";
  const parsed = queryString.parse(query);

  assert.equal(parsed.name, "Chi'llywood");
  assert.equal(parsed.unicode, "你好");
  assert.deepEqual(parsed.tag, ["one", "two"]);
  assert.equal(parsed.malformed, "%E0%A4%A");
  assert.equal(parsed.space, "a b");
  assert.equal(
    queryString.stringify({ code: "a+b/c=", type: "recovery", tag: ["one", "two"] }, { sort: false }),
    "code=a%2Bb%2Fc%3D&type=recovery&tag=one&tag=two",
  );

  const parserPath = require.resolve("expo-router/build/fork/getStateFromPath-forks");
  const probe = [
    `const assert = require("node:assert/strict");`,
    `const { parseQueryParams } = require(${JSON.stringify(parserPath)});`,
    `const query = ${JSON.stringify(query)};`,
    `const parsed = parseQueryParams("/auth-callback?" + query, { params: {} }, undefined, "");`,
    `assert.equal(parsed.name, "Chi'llywood");`,
    `assert.equal(parsed.unicode, "你好");`,
    `assert.deepEqual(parsed.tag, ["one", "two"]);`,
    `assert.equal(parsed.space, "a b");`,
    `const adversarial = parseQueryParams("/auth-callback?code=" + "%ab".repeat(5000), { params: {} }, undefined, "");`,
    `assert.equal(typeof adversarial.code, "string");`,
  ].join("\n");
  const result = spawnSync(process.execPath, ["-e", probe], {
    encoding: "utf8",
    timeout: 1_000,
  });

  assert.equal(result.error?.code, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
});
