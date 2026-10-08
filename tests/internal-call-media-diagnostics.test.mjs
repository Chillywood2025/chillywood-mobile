import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

import {
  createInternalCallMediaDiagnosticReporter,
  isInternalCallMediaDiagnosticsEnabled,
} from "../_lib/internalCallMediaDiagnosticPolicy.mjs";
import * as policy from "../_lib/internalCallMediaDiagnosticPolicy.mjs";

const internal = { enabled: true, platform: "android", channel: "android-internal-v2" };
const parsed = line => JSON.parse(line.replace(/^\[CH_CALL_MEDIA\] /u, ""));
const recorder = (context = internal) => {
  const lines = [];
  const report = createInternalCallMediaDiagnosticReporter({ readContext: () => context, emit: line => lines.push(line), now: () => 123.9 });
  return { lines, report };
};

test("internal media receipts require the explicit boolean and the exact signed channel for this platform", () => {
  for (const platform of ["android", "ios"]) {
    assert.equal(isInternalCallMediaDiagnosticsEnabled({ enabled: true, platform, channel: `${platform}-internal-v2` }), true);
    for (const enabled of [false, undefined, null, "true", 1]) {
      assert.equal(isInternalCallMediaDiagnosticsEnabled({ enabled, platform, channel: `${platform}-internal-v2` }), false);
    }
    for (const channel of [undefined, null, "", "production-v2", "preview", "development", `${platform}-internal-v2 `,
      platform === "android" ? "ios-internal-v2" : "android-internal-v2"]) {
      assert.equal(isInternalCallMediaDiagnosticsEnabled({ enabled: true, platform, channel }), false);
    }
  }
  for (const platform of ["web", "macos", undefined, "android "]) {
    assert.equal(isInternalCallMediaDiagnosticsEnabled({ ...internal, platform }), false);
  }
});

test("disabled receipts do not inspect native stream or diagnostic input", () => {
  const hostile = new Proxy({}, { get() { throw Error("input must not be read"); } });
  const { lines, report } = recorder({ ...internal, enabled: false });
  assert.doesNotThrow(() => report("capture_received", hostile));
  assert.equal(lines.length, 0);
});

test("allowlisted receipt retains useful state without identifiers, media contents or arbitrary text", () => {
  const privateMarker = "PRIVATE-ROOM-USER-DEVICE-TOKEN-URL-CONSTRAINT-STACK";
  const { lines, report } = recorder();
  report("capture_received", {
    requestedCamera: true, requestedMic: true, wantsCamera: true, wantsMic: true,
    canUseCamera: true, canUseMic: true, appState: "active", cameraPermission: "granted", micPermission: "granted",
    roomId: privateMarker, accountId: privateMarker, channel: privateMarker, seq: privateMarker,
    call_hash: privateMarker, error: { name: privateMarker, message: privateMarker },
    stream: { id: privateMarker, getAudioTracks: () => [{ id: privateMarker }], getVideoTracks: () => [] },
  });
  assert.deepEqual(parsed(lines[0]), {
    version: 1, phase: "capture_received", seq: 1, call_hash: "none", platform: "android", uptime_ms: 123,
    requestedCamera: true, requestedMic: true, wantsCamera: true, wantsMic: true, canUseCamera: true, canUseMic: true,
    appState: "active", cameraPermission: "granted", micPermission: "granted", streamPresent: true, audioTracks: 1, videoTracks: 0,
  });
  assert.equal(lines[0].includes(privateMarker), false);
});

test("receipt rejects unknown phases and fields, caps counts, and never serializes raw errors", () => {
  const { lines, report } = recorder();
  report("private-phase", {});
  assert.equal(lines.length, 0);
  report("capture_failed", { error: { name: "NotReadableError", code: "private", message: "private", stack: "private" },
    appState: "private", cameraPermission: "private", wantsCamera: "private" });
  assert.deepEqual(parsed(lines[0]), {
    version: 1, phase: "capture_failed", seq: 1, call_hash: "none", platform: "android", uptime_ms: 123, errorName: "NotReadableError",
  });
  report("capture_failed", { error: { name: "private" } });
  assert.equal(parsed(lines[1]).errorName, "other");
  report("capture_received", { stream: { getAudioTracks: () => Array(20), getVideoTracks: () => ({ length: 2 }) } });
  assert.equal(parsed(lines[2]).audioTracks, 4);
  assert.equal(Object.hasOwn(parsed(lines[2]), "videoTracks"), false, "invalid observation cannot be reported as zero");
  report("capture_received", { stream: null });
  assert.equal(parsed(lines[3]).streamPresent, false);
  assert.equal(parsed(lines[3]).audioTracks, 0);
  assert.equal(parsed(lines[3]).videoTracks, 0);
});

test("sequence is session-wide and monotonic clock receipts cannot regress", () => {
  const times = [20.5, 10.2, NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1];
  const lines = [];
  const report = createInternalCallMediaDiagnosticReporter({ readContext: () => internal, emit: line => lines.push(line), now: () => times.shift() });
  for (let i = 0; i < 6; i += 1) report("initial_intent", {});
  assert.deepEqual(lines.map(line => parsed(line).seq), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(lines.slice(0, 2).map(line => parsed(line).uptime_ms), [20, 20]);
  assert.ok(lines.slice(2).every(line => !Object.hasOwn(parsed(line), "uptime_ms")));
});

test("hostile getters and failing clocks, context readers or log sinks cannot escape", () => {
  const hostile = new Proxy({}, { get() { throw Error("private getter failure"); } });
  const { lines, report } = recorder();
  assert.doesNotThrow(() => report("capture_failed", hostile));
  assert.doesNotThrow(() => report("capture_received", { stream: hostile }));
  assert.equal(parsed(lines[1]).streamPresent, true);
  assert.equal(Object.hasOwn(parsed(lines[1]), "videoTracks"), false);
  for (const throwing of ["readContext", "emit", "now"]) {
    const options = { readContext: () => internal, emit() {}, now: () => 1 };
    options[throwing] = () => { throw Error("private boundary failure"); };
    assert.doesNotThrow(() => createInternalCallMediaDiagnosticReporter(options)("capture_failed", hostile));
  }
});

test("mutable context getters are snapshotted before validation and cannot replace an allowed platform with private text", () => {
  const lines = [];
  let platformReads = 0;
  const context = { ...internal, get platform() { return ++platformReads === 1 ? "android" : "private-platform"; } };
  const report = createInternalCallMediaDiagnosticReporter({ readContext: () => context, emit: line => lines.push(line), now: () => 1 });
  report("capture_requested", {});
  assert.equal(platformReads, 1);
  assert.equal(parsed(lines[0]).platform, "android");
  assert.equal(lines[0].includes("private"), false);
});

test("actual runtime adapter uses Updates.channel rather than an Expo extra or environment channel label", () => {
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  const source = fs.readFileSync("_lib/internalCallMediaDiagnostics.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  for (const nativeChannel of [null, "production-v2", "ios-internal-v2", "android-internal-v2"]) {
    const lines = [];
    const module = { exports: {} };
    const mocks = {
      "expo-constants": { __esModule: true, default: { expoConfig: { extra: { runtime: { internalCallMediaDiagnosticsEnabled: true }, channel: "android-internal-v2" } } } },
      "expo-updates": { channel: nativeChannel },
      "react-native": { Platform: { OS: "android" } },
      "./internalCallMediaDiagnosticPolicy.mjs": policy,
    };
    vm.runInNewContext(compiled, { module, exports: module.exports, require: name => {
      assert.ok(Object.hasOwn(mocks, name)); return mocks[name];
    }, console: { info: line => lines.push(line) }, performance: { now: () => 10 } });
    module.exports.reportInternalCallMediaDiagnostic("capture_requested", { wantsCamera: true });
    assert.equal(lines.length, nativeChannel === "android-internal-v2" ? 1 : 0);
  }
});
