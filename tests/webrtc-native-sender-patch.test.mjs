import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { computeAndroidNativeCompatibility } from "../scripts/android-native-compatibility.mjs";

const require = createRequire(import.meta.url);
const { definitions, digest, transformSource, applyAcknowledgmentPatch, SDK_VERSION } =
  require("../plugins/withWebRtcSenderAcknowledgment.js").__test;

test("Expo installs the sender patch and Android compatibility includes its exact source", () => {
  const plugin = "./plugins/withWebRtcSenderAcknowledgment";
  assert.ok(fs.readFileSync("app.config.ts", "utf8").includes(`"${plugin}"`));
  const compatibility = computeAndroidNativeCompatibility();
  assert.ok(compatibility.input.androidPlugins.includes(plugin));
  assert.equal(compatibility.input.localPluginEvidence.find((entry) => entry.path === `${plugin.slice(2)}.js`)?.sha256,
    digest(fs.readFileSync(`${plugin}.js`)));
});

for (const platform of ["android", "ios"]) {
  const definition = definitions[platform];
  const installed = fs.readFileSync(path.join("node_modules/@livekit/react-native-webrtc", definition.relativePath), "utf8");
  const original = transformSource(platform, installed, true);
  test(`${platform} native sender patch is exact, reversible for tests, and idempotent`, () => {
    const patched = transformSource(platform, original);
    assert.equal(digest(original), definition.originalSha256);
    assert.equal(digest(patched), definition.patchedSha256);
    assert.equal(transformSource(platform, patched), patched);
    assert.equal(transformSource(platform, patched, true), original);
    assert.equal(transformSource(platform, original, true), original);
    const start = platform === "android" ? "    public void senderReplaceTrack(" : "RCT_EXPORT_METHOD(senderReplaceTrack";
    const end = platform === "android" ? "    public void transceiverSetDirection(" : "RCT_EXPORT_METHOD(senderSetParameters";
    assert.equal(patched.slice(0, patched.indexOf(start)), original.slice(0, original.indexOf(start)));
    assert.equal(patched.slice(patched.indexOf(end)), original.slice(original.indexOf(end)));
  });
  test(`${platform} native sender patch rejects unknown and partially modified source`, () => {
    assert.throws(() => transformSource(platform, `${original}\n`), /unreviewed/u);
    const [before, after] = definition.changes[0];
    const partiallyChanged = original.replace(before, `${after}\n`);
    assert.throws(() => transformSource(platform, partiallyChanged), /unreviewed/u);
  });
  test(`${platform} Expo generation checks package version before mutating native source`, t => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "chilly-native-sender-version-"));
    t.after(() => fs.rmSync(project, { recursive: true, force: true }));
    const sdk = path.join(project, "node_modules/@livekit/react-native-webrtc");
    const target = path.join(sdk, definition.relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, original);
    fs.writeFileSync(path.join(sdk, "package.json"), JSON.stringify({ name: "@livekit/react-native-webrtc", version: "unreviewed" }));
    assert.throws(() => applyAcknowledgmentPatch(project, platform), /review required for SDK version/u);
    assert.equal(fs.readFileSync(target, "utf8"), original);
    fs.writeFileSync(path.join(sdk, "package.json"), JSON.stringify({ name: "@livekit/react-native-webrtc", version: SDK_VERSION }));
    const receipt = applyAcknowledgmentPatch(project, platform);
    assert.equal(receipt.sha256, definition.patchedSha256);
    assert.equal(digest(fs.readFileSync(target)), definition.patchedSha256);
  });
}
