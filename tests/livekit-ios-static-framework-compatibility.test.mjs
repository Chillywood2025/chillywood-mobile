import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const patch = require("../plugins/withLiveKitIosStaticFrameworkCompatibility.js").__test;
const podfile = "target 'Chillywood' do\n  post_install do |installer|\n    react_native_post_install(installer)\n  end\nend\n";

test("static-framework compatibility is exact-target scoped and generation is idempotent", () => {
  const once = patch.addLiveKitCompatibilityBlock(podfile);
  assert.equal(patch.addLiveKitCompatibilityBlock(once), once);
  assert.match(once, /react_native_post_install\(installer\)/u);
  const targets = once.match(/next unless \[([\s\S]*?)\]\.include\?\(target\.name\)/u)[1];
  assert.deepEqual([...targets.matchAll(/'([^']+)'/gu)].map(match => match[1]), [
    "livekit-react-native-webrtc", "livekit_react_native_webrtc", "livekit-react-native", "livekit_react_native", "ChillywoodCameraEffects",
  ]);
  assert.doesNotMatch(once, /CLANG_ENABLE_MODULES|GCC_WARN_INHIBIT_ALL_WARNINGS/u);
});

test("compatibility generation rejects malformed or unsupported Podfile hooks", () => {
  assert.throws(() => patch.addLiveKitCompatibilityBlock("target 'Chillywood' do\nend\n"), /missing its post_install/u);
  assert.throws(() => patch.addLiveKitCompatibilityBlock(`${podfile}${patch.START_MARKER}\n`), /missing its end marker/u);
  assert.throws(() => patch.addLiveKitCompatibilityBlock("  post_install do |installer|\n"), /unable to locate/u);
});

test("native compile validates effective CocoaPods settings before the unchanged full compile", () => {
  const runner = fs.readFileSync(new URL("../scripts/compile-native-camera-effects.mjs", import.meta.url), "utf8");
  const validation = runner.indexOf('"verify-livekit-ios-compatibility.rb"');
  assert(validation > runner.indexOf('run("pod", ["install"]'));
  assert(validation < runner.indexOf('run("xcodebuild", ["-project"'));
  assert.match(runner, /"-showBuildSettings", "-json"/u);
  assert.match(runner, /"-target", "ChillywoodCameraEffects"/u);
});
