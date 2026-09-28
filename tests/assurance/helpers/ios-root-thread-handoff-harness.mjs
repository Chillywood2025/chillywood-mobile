import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

// Reuse the exercised fixture for the complete production JS native facade and
// production root bridge. Do not import the test module (which registers its
// tests), copy a fake claim issuer, or replace production readiness/routing.
// The controlled OS module and captured router destination remain explicit
// boundaries; mounting that destination is not proof of Expo/native navigation.
const fixtureFile = path.resolve("tests/assurance/ios-native-call-bridge-mounted.test.mjs");
const fixture = fs.readFileSync(fixtureFile, "utf8");
const firstTest = fixture.indexOf('\ntest("');
assert.ok(firstTest > 0);
const prefix = fixture.slice(0, firstTest);
assert.ok(prefix.includes("async function mount(t,"));
assert.ok(prefix.includes("provenance.createIosCallKitAnswerRouteHandler"));
const module = { exports: {} };
const compiled = ts.transpileModule(`${prefix}\nexports.mountIosRoot = mount; exports.nativeIds = ids; exports.makeNativeEvent = nativeEvent;`, {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(compiled, {
  require: createRequire(fixtureFile), module, exports: module.exports, globalThis,
  console, process, URL, setTimeout, clearTimeout, queueMicrotask,
}, { filename: fixtureFile });

export const { mountIosRoot, nativeIds, makeNativeEvent } = module.exports;
