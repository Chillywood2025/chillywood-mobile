import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPickerFixture, patch } from "./helpers/ios-picker-fixture.mjs";

const fixture = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ios-picker-patch-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return createPickerFixture(process.cwd(), root);
};

test("iOS picker patch is wired, lock-pinned, reversible and idempotent", (t) => {
  assert.match(fs.readFileSync("app.config.ts", "utf8"), /"\.\/plugins\/withIosPickerDismissal"/u);
  const lock = JSON.parse(fs.readFileSync("package-lock.json"));
  for (const sdk of patch.specification.packages) {
    assert.equal(lock.packages[`node_modules/${sdk.name}`].version, sdk.version);
    assert.equal(lock.packages[`node_modules/${sdk.name}`].integrity, sdk.integrity);
    for (const file of sdk.files) {
      const installed = fs.readFileSync(path.join("node_modules", sdk.name, file.path), "utf8");
      const original = patch.transformSource(file, installed, true);
      const patched = patch.transformSource(file, original);
      assert.equal(patch.digest(original), file.originalSha256);
      assert.equal(patch.digest(patched), file.patchedSha256);
      assert.equal(patch.transformSource(file, patched), patched);
      assert.equal(patch.transformSource(file, patched, true), original);
      assert.throws(() => patch.transformSource(file, original + "\n"), /unreviewed/u);
      if (file.path.endsWith(".podspec")) {
        assert.match(patched, /s\.source_files = "\*\*\/\*\.\{h,m,swift\}"/u);
        assert.doesNotMatch(patched, /s\.vendored_frameworks/u);
      }
    }
  }
  const root = fixture(t);
  const receipt = patch.applyDismissalPatch(root);
  assert.equal(receipt.length, 6);
  for (const file of receipt) assert.equal(patch.digest(fs.readFileSync(path.join(root, file.path))), file.sha256);
  assert.deepEqual(patch.applyDismissalPatch(root), receipt);
});

for (const fault of ["lock", "version", "source", "helper"]) {
  test(`both SDKs are validated before any mutation (${fault})`, (t) => {
    const root = fixture(t);
    const target = path.join(root, "node_modules/expo-document-picker");
    if (fault === "lock") fs.writeFileSync(path.join(root, "package-lock.json"), "{}");
    if (fault === "version") fs.writeFileSync(path.join(target, "package.json"), JSON.stringify({ name: "expo-document-picker", version: "14.0.9" }));
    if (fault === "source") fs.appendFileSync(path.join(target, "ios/DocumentPickingDelegate.swift"), "\n");
    if (fault === "helper") fs.writeFileSync(path.join(target, patch.specification.helper.path), "unreviewed");
    assert.throws(() => patch.applyDismissalPatch(root), /review|locked/u);
    for (const file of patch.specification.packages[0].files) {
      assert.equal(patch.digest(fs.readFileSync(path.join(root, "node_modules/expo-image-picker", file.path))), file.originalSha256);
    }
    assert.equal(fs.existsSync(path.join(root, "node_modules/expo-image-picker", patch.specification.helper.path)), false);
  });
}

test("never mutates shared/symlinked dependencies outside the project", (t) => {
  const shared = fixture(t), project = fixture(t);
  const sdkPath = path.join(project, "node_modules/expo-document-picker");
  fs.rmSync(sdkPath, { recursive: true });
  fs.symlinkSync(path.join(shared, "node_modules/expo-document-picker"), sdkPath, "dir");
  assert.throws(() => patch.applyDismissalPatch(project), /escapes/u);
  assert.equal(fs.existsSync(path.join(shared, "node_modules/expo-document-picker", patch.specification.helper.path)), false);
});

test("source patch does not change permissions, import/transcoding or module promises", () => {
  for (const sdk of patch.specification.packages) {
    assert.deepEqual(sdk.files.map(file => file.path), sdk.name === "expo-image-picker"
      ? ["ios/ImagePickerHandler.swift", "ios/ExpoImagePicker.podspec"]
      : ["ios/DocumentPickingDelegate.swift", "ios/ExpoDocumentPicker.podspec"]);
  }
  assert.doesNotMatch(patch.helperSource(), /asyncAfter|sleep\(|Timer|requestAuthorization|PHPhotoLibrary/u);
  assert.equal(patch.digest(patch.helperSource()), patch.specification.helper.sha256);
  const workflow = fs.readFileSync(".github/workflows/required-validation.yml", "utf8");
  assert.match(workflow, /node scripts\/test-ios-picker-dismissal\.mjs/u);
  const compiler = fs.readFileSync("scripts/compile-native-camera-effects.mjs", "utf8");
  assert.match(compiler, /for \(const target of \["ChillywoodCameraEffects", "ExpoImagePicker", "ExpoDocumentPicker"\]\)/u);
  assert.match(compiler, /"-target", target/u);
  assert.match(compiler, /assert\.equal\(sha256, file\.sha256/u);
});
