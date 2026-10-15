import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const patch = require("../plugins/withWebRtcCameraEffectOwnership.js").__test;
const sdkPath = path.dirname(require.resolve("@livekit/react-native-webrtc/package.json"));
const source = fs.readFileSync(path.join(sdkPath, patch.RELATIVE_PATH), "utf8");

test("camera ownership patch is exact, idempotent and reversible for the pinned SDK", () => {
  const original = patch.transformSource(source, true);
  const transformed = patch.transformSource(original);
  assert.equal(patch.digest(original), patch.ORIGINAL_SHA256);
  assert.equal(patch.digest(transformed), patch.PATCHED_SHA256);
  assert.equal(patch.transformSource(transformed), transformed);
  assert.equal(patch.transformSource(transformed, true), original);
  assert.match(transformed, /if \(videoFrameProcessors\.isEmpty\(\)\)/u);
  assert.match(fs.readFileSync(new URL("../app.config.ts", import.meta.url), "utf8"), /\.\/plugins\/withWebRtcCameraEffectOwnership/u);
});

test("camera ownership patch rejects native source drift instead of silently applying", () => {
  assert.throws(() => patch.transformSource(`${source}\n// unexpected source\n`), /unreviewed native source digest/u);
});

test("camera ownership prebuild rejects an unreviewed SDK version", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "camera-ownership-sdk-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sdk = path.join(root, "node_modules/@livekit/react-native-webrtc");
  fs.mkdirSync(sdk, { recursive: true });
  fs.writeFileSync(path.join(sdk, "package.json"), JSON.stringify({ name: "@livekit/react-native-webrtc", version: "999.0.0" }));
  assert.throws(() => patch.applyOwnershipPatch(root), /review required for SDK version/u);
});
