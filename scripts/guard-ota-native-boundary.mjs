import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("config/release/android-production.json"));
const normalization = read("_lib/imageUploadNormalization.ts");

assert.equal(manifest.platform, "android");
assert.equal(manifest.nativeBuildSource, "eas_provider_readback");
assert.match(manifest.expectedBinarySourceCommit, /^[a-f0-9]{40}$/u);
assert.match(manifest.nativeBuildId, /^[a-f0-9-]{36}$/u);

const deferred = manifest.otaNativeCompatibility?.optionalDeferredPackages ?? [];
const imageManipulator = deferred.find((entry) => entry.package === "expo-image-manipulator");
assert.ok(imageManipulator, "Android build 80 must declare expo-image-manipulator as an optional deferred package");
assert.equal(imageManipulator.source, "_lib/imageUploadNormalization.ts");

assert.doesNotMatch(
  normalization,
  /^import\s+[^;]+from\s+["']expo-image-manipulator["'];/mu,
  "an OTA for Android build 80 must not load ExpoImageManipulator during application startup",
);
assert.match(
  normalization,
  /await import\(["']expo-image-manipulator["']\)/u,
  "ExpoImageManipulator must remain deferred until HEIC/HEIF conversion is requested",
);

const passthroughIndex = normalization.indexOf("if (!isHeicOrHeifImage(file))");
const nativeImportIndex = normalization.indexOf("await loadImageManipulator()");
assert.ok(passthroughIndex >= 0 && nativeImportIndex > passthroughIndex, "ordinary images must return before the native module is loaded");
assert.match(normalization, /catch\s*\{[\s\S]*Choose another photo or try again\./u);

console.log("OTA native boundary guard passed: Android build 80 cannot eagerly load its absent image-manipulator module.");
