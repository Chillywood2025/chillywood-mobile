import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { runAndroidReleaseContract } from "./webrtc-native-release-contract.mjs";

const require = createRequire(import.meta.url);
const { definitions, digest, transformSource, applyAcknowledgmentPatch, SDK_VERSION } =
  require("../plugins/withWebRtcSenderAcknowledgment.js").__test;
const root = process.cwd();
const options = new Set(process.argv.slice(2));
assert([...options].every(value => ["--android", "--ios", "--check-source"].includes(value)), "Unknown sender-contract option");
const platforms = options.has("--android") || options.has("--ios")
  ? ["android", "ios"].filter(platform => options.has(`--${platform}`)) : ["android", "ios"];
const out = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-webrtc-sender-"));
const execute = (command, args, expectedPass = true) => {
  const result = spawnSync(command, args, { cwd: out, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.error, undefined, result.error?.message);
  if (expectedPass) assert.equal(result.status, 0, `${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result;
};
const sourceMethod = (platform, source) => {
  const from = platform === "android" ? "    @ReactMethod\n    public void senderReplaceTrack(" : "RCT_EXPORT_METHOD(senderReplaceTrack";
  const until = platform === "android" ? "    @ReactMethod\n    public void transceiverSetDirection(" : "RCT_EXPORT_METHOD(senderSetParameters";
  assert.equal(source.split(from).length, 2, "Pinned method declaration must occur exactly once");
  const start = source.indexOf(from), end = source.indexOf(until, start);
  assert(end > start, "Pinned method end must be present");
  return source.slice(start, end);
};

try {
  for (const platform of platforms) {
    const definition = definitions[platform];
    const installed = fs.readFileSync(path.join(root, "node_modules/@livekit/react-native-webrtc", definition.relativePath), "utf8");
    const original = transformSource(platform, installed, true);
    const generatedProject = path.join(out, platform, "project");
    const generatedPackage = path.join(generatedProject, "node_modules/@livekit/react-native-webrtc");
    fs.mkdirSync(path.dirname(path.join(generatedPackage, definition.relativePath)), { recursive: true });
    fs.writeFileSync(path.join(generatedPackage, "package.json"), JSON.stringify({ name: "@livekit/react-native-webrtc", version: SDK_VERSION }));
    fs.writeFileSync(path.join(generatedPackage, definition.relativePath), original);
    // Exercise the exact plugin function used by Expo's dangerous mod in an
    // isolated package. It changes only the pinned bridge source file.
    const receipt = applyAcknowledgmentPatch(generatedProject, platform);
    const patched = fs.readFileSync(path.join(generatedPackage, definition.relativePath), "utf8");
    assert.equal(receipt.sha256, definition.patchedSha256);
    assert.equal(digest(original), definition.originalSha256);
    assert.equal(digest(patched), definition.patchedSha256);
    assert.deepEqual(applyAcknowledgmentPatch(generatedProject, platform), receipt, "Expo prebuild patch is idempotent");
    const extension = platform === "android" ? "java" : "m";
    const template = fs.readFileSync(path.join(root, `tools/webrtc-native-sender-harness/SenderContract.${extension}`), "utf8");
    assert.equal(template.split("// __ACTUAL_SDK_SENDER_METHOD__").length, 2);
    for (const [label, source] of [["original", original], ["patched", patched]]) {
      const directory = path.join(out, platform, label);
      fs.mkdirSync(directory, { recursive: true });
      const filename = path.join(directory, `SenderContract.${extension}`);
      fs.writeFileSync(filename, template.replace("// __ACTUAL_SDK_SENDER_METHOD__", sourceMethod(platform, source)));
      if (options.has("--check-source")) continue;
      let result;
      if (platform === "android") {
        const javac = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin/javac") : "javac";
        const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin/java") : "java";
        if (label === "original") {
          const version = execute(javac, ["-version"]);
          process.stdout.write(version.stdout || version.stderr);
        }
        execute(javac, ["-encoding", "UTF-8", "-d", directory, filename]);
        result = execute(java, ["-cp", directory, "SenderContract"], false);
      } else {
        assert.equal(process.platform, "darwin", "Objective-C native method execution requires macOS Foundation/Clang");
        if (label === "original") process.stdout.write(execute("xcrun", ["--sdk", "macosx", "clang", "--version"]).stdout);
        const executable = path.join(directory, "sender-contract");
        execute("xcrun", ["--sdk", "macosx", "clang", "-fobjc-arc", "-fblocks", "-Werror", "-framework", "Foundation", filename, "-o", executable]);
        result = execute(executable, [], false);
      }
      if (label === "original") {
        assert.notEqual(result.status, 0, "The installed uncorrected native method must fail the same acknowledgment contract");
        assert.match(result.stderr, /NATIVE_SENDER_FALSE_ACK/u);
      } else {
        assert.equal(result.status, 0, `Patched ${platform} method failed:\n${result.stdout}\n${result.stderr}`);
        assert.match(result.stdout, /0 failures/u);
      }
      process.stdout.write(`${platform} ${label}: ${result.stdout.trim()}\n`);
    }
    if (platform === "android") {
      runAndroidReleaseContract({ root, out, execute, checkSource: options.has("--check-source"), original, patched });
    }
    console.log(`${platform} generated-source SHA-256: ${definition.patchedSha256}`);
  }
  console.log(options.has("--check-source")
    ? "Native source generation/hash/idempotence verified; compilation and execution NOT RUN."
    : "Actual SDK Java/Objective-C method contracts compiled and executed. RTC/JNI edges are controlled; no app binary, device, capture or RTP proof is claimed.");
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
