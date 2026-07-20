import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

import {
  IMAGE_MANIPULATOR_NATIVE_MODULE_NAME,
  IMAGE_MANIPULATOR_UNAVAILABLE_MESSAGE,
  createIdempotentCleanup,
  createImageManipulatorRuntimeLoader,
  resolveImageManipulatorRuntime,
  runImageManipulatorConversion,
} from "../_lib/imageManipulatorNativeBoundary.mjs";

const repoRoot = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

assert.equal(IMAGE_MANIPULATOR_NATIVE_MODULE_NAME, "ExpoImageManipulator");
assert.match(IMAGE_MANIPULATOR_UNAVAILABLE_MESSAGE, /JPEG or PNG/u);

let absentLoaderCalls = 0;
const absentResolution = await resolveImageManipulatorRuntime({
  nativeModuleAvailable: false,
  loadRuntime: async () => {
    absentLoaderCalls += 1;
    throw new Error("must_not_load");
  },
});
assert.deepEqual(absentResolution, {
  available: false,
  reason: "native_module_unavailable",
  runtime: null,
});
assert.equal(absentLoaderCalls, 0, "an absent native module must prevent package evaluation");

const fakeRuntime = { ImageManipulator: { manipulate() {} }, SaveFormat: { JPEG: "jpeg" } };
let availableLoaderCalls = 0;
const availableResolution = await resolveImageManipulatorRuntime({
  nativeModuleAvailable: true,
  loadRuntime: async () => {
    availableLoaderCalls += 1;
    return fakeRuntime;
  },
  validateRuntime: (runtime) => typeof runtime?.ImageManipulator?.manipulate === "function",
});
assert.equal(availableResolution.available, true);
assert.equal(availableResolution.runtime, fakeRuntime);
assert.equal(availableLoaderCalls, 1);

let memoizedLoaderCalls = 0;
const memoizedLoader = createImageManipulatorRuntimeLoader({
  isNativeModuleAvailable: () => true,
  loadRuntime: async () => {
    memoizedLoaderCalls += 1;
    return fakeRuntime;
  },
  validateRuntime: (runtime) => typeof runtime?.ImageManipulator?.manipulate === "function",
});
const [memoizedFirst, memoizedSecond] = await Promise.all([memoizedLoader(), memoizedLoader()]);
assert.equal(memoizedFirst.available, true);
assert.equal(memoizedSecond.runtime, fakeRuntime);
assert.equal(memoizedLoaderCalls, 1, "a present native package must be evaluated exactly once");

let contextReleaseCount = 0;
let renderReleaseCount = 0;
const conversionRuntime = {
  ImageManipulator: {
    manipulate: () => ({
      release: () => { contextReleaseCount += 1; },
      renderAsync: async () => ({
        release: () => { renderReleaseCount += 1; },
        saveAsync: async () => ({ uri: "cache://normalized.jpg" }),
      }),
    }),
  },
};
const converted = await runImageManipulatorConversion({
  runtime: conversionRuntime,
  sourceUri: "fixture://photo.heic",
  compress: 0.92,
  format: "jpeg",
  withTimeout: async (promise) => await promise,
});
assert.equal(converted.uri, "cache://normalized.jpg");
assert.equal(contextReleaseCount, 1, "native context must release after success");
assert.equal(renderReleaseCount, 1, "render result must release after success");

let errorContextReleaseCount = 0;
await assert.rejects(runImageManipulatorConversion({
  runtime: {
    ImageManipulator: {
      manipulate: () => ({
        release: () => { errorContextReleaseCount += 1; },
        renderAsync: async () => { throw new Error("fixture_decode_failed"); },
      }),
    },
  },
  sourceUri: "fixture://corrupt.heic",
  compress: 0.92,
  format: "jpeg",
  withTimeout: async (promise) => await promise,
}), /fixture_decode_failed/u);
assert.equal(errorContextReleaseCount, 1, "native context must release after conversion error");

let cleanupCalls = 0;
const cleanup = createIdempotentCleanup(async () => { cleanupCalls += 1; });
await cleanup();
await cleanup();
assert.equal(cleanupCalls, 1, "temporary output cleanup must be idempotent");

const rejectedResolution = await resolveImageManipulatorRuntime({
  nativeModuleAvailable: true,
  loadRuntime: async () => {
    throw new Error("Cannot find native module 'ExpoImageManipulator'");
  },
});
assert.deepEqual(rejectedResolution, {
  available: false,
  reason: "package_load_failed",
  runtime: null,
});

const invalidResolution = await resolveImageManipulatorRuntime({
  nativeModuleAvailable: true,
  loadRuntime: async () => ({}),
  validateRuntime: (runtime) => typeof runtime?.ImageManipulator?.manipulate === "function",
});
assert.deepEqual(invalidResolution, {
  available: false,
  reason: "package_runtime_invalid",
  runtime: null,
});

const policyJavaScript = ts.transpileModule(read("_lib/imageUploadPolicy.ts"), {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const policy = await import(`data:text/javascript;base64,${Buffer.from(policyJavaScript).toString("base64")}`);
for (const fixture of [
  { file: { uri: "file:///photo.jpg", mimeType: "image/jpeg" }, expected: false },
  { file: { uri: "file:///photo.jpeg", mimeType: "image/jpeg" }, expected: false },
  { file: { uri: "file:///photo.png", mimeType: "image/png" }, expected: false },
  { file: { uri: "file:///photo.HEIC" }, expected: true },
  { file: { uri: "file:///photo.heif" }, expected: true },
  { file: { uri: "content://picker/item", mimeType: "image/heic-sequence" }, expected: true },
]) {
  assert.equal(policy.isHeicOrHeifImage(fixture.file), fixture.expected);
}

const normalization = read("_lib/imageUploadNormalization.ts");
assert.doesNotMatch(normalization, /^import\s+[^;]+from\s+["']expo-image-manipulator["'];/mu);
assert.match(normalization, /requireOptionalNativeModule\(IMAGE_MANIPULATOR_NATIVE_MODULE_NAME\)/u);
assert.match(normalization, /await import\(["']expo-image-manipulator["']\)/u);
assert.match(normalization, /createImageManipulatorRuntimeLoader/u);
assert.match(normalization, /createIdempotentCleanup/u);
assert.match(normalization, /reportRuntimeError\(["']image-upload-normalization-capability["']/u);
assert.match(normalization, /if \(!isHeicOrHeifImage\(file\)\)/u);
assert.ok(
  normalization.indexOf("requireOptionalNativeModule(IMAGE_MANIPULATOR_NATIVE_MODULE_NAME)")
    < normalization.indexOf('await import("expo-image-manipulator")'),
  "native availability must be checked before package evaluation",
);

const profileMedia = read("_lib/profileMedia.ts");
const socialAttachments = read("_lib/socialAttachments.ts");
const profilePicker = read("_lib/profileMedia.ts");
const socialPicker = read("_lib/socialAttachmentPicker.ts");
assert.match(profileMedia, /normalizeImageUploadFile\(file\)/u);
assert.match(socialAttachments, /normalizeImageUploadFile\(input\.file\)/u);
assert.match(profilePicker, /if \(result\.canceled\) return null/u, "profile picker cancellation must not start normalization or upload");
assert.match(socialPicker, /if \(result\.canceled\) return null/u, "social picker cancellation must not start normalization or upload");
for (const pathName of [
  "_lib/chat.ts",
  "_lib/profilePosts.ts",
  "_lib/creatorVideoComments.ts",
  "app/watch-party/[partyId].tsx",
  "app/watch-party/live-stage/[partyId].tsx",
]) {
  assert.match(read(pathName), /createSocialAttachmentForSurface/u, `${pathName} must retain the guarded upload path`);
}

console.log("Image upload native-boundary tests passed: absent modules never load, supported runtimes load once, and image surfaces retain the guarded path.");
