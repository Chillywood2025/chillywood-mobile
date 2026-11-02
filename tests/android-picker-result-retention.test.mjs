import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readSuite } from "../scripts/test-android-picker-result-retention.mjs";

const require = createRequire(import.meta.url);
const patch = require("../plugins/withExpoImagePickerAndroidResultRetention.js").__test;
const root = fileURLToPath(new URL("..", import.meta.url));
const sources = patch.specification.packages.flatMap(pkg => pkg.files.map(file => {
  const source = fs.readFileSync(path.join(path.dirname(require.resolve(`${pkg.name}/package.json`)), file.path), "utf8");
  const original = patch.transformSource(pkg.name, file.path, source, true);
  return { ...file, packageName: pkg.name, version: pkg.version, original, patched: patch.transformSource(pkg.name, file.path, original) };
}));
const source = suffix => sources.find(entry => entry.path.endsWith(suffix)).patched;

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picker-result-retention-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ expo: { autolinking: { android: { buildFromSource: patch.SOURCE_BUILD_PATTERNS } } } }));
  for (const entry of sources) {
    const pkg = path.join(dir, "node_modules", entry.packageName);
    const filename = path.join(pkg, entry.path);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: entry.packageName, version: entry.version }));
    fs.writeFileSync(filename, entry.original);
  }
  return dir;
}

test("all six exact locked source repairs are reversible and idempotent", () => {
  const lock = require("../package-lock.json");
  assert.equal(sources.length, 6);
  assert.deepEqual(patch.specification.packages.map(pkg => [pkg.name, pkg.version]), [["expo-modules-core", "3.0.30"], ["expo-image-picker", "17.0.11"]]);
  for (const pkg of patch.specification.packages) {
    const locked = lock.packages[`node_modules/${pkg.name}`];
    assert.equal(pkg.upstreamTarball, locked.resolved);
    assert.equal(pkg.upstreamIntegrity, locked.integrity);
  }
  for (const entry of sources) {
    assert.equal(patch.digest(entry.original), entry.originalSha256);
    assert.equal(patch.digest(entry.patched), entry.patchedSha256);
    assert.equal(patch.transformSource(entry.packageName, entry.path, entry.patched), entry.patched);
    assert.equal(patch.transformSource(entry.packageName, entry.path, entry.patched, true), entry.original);
    assert.throws(() => patch.transformSource(entry.packageName, entry.path, entry.original + "\n"), /unreviewed/u);
  }
});

test("disposable patch validates every package before writing and reports source hashes", t => {
  const dir = fixture(t);
  const receipts = patch.applyRetentionPatch(dir);
  assert.equal(receipts.length, 6);
  assert.deepEqual(patch.applyRetentionPatch(dir), receipts);
  for (const entry of sources) assert.equal(fs.readFileSync(path.join(dir, "node_modules", entry.packageName, entry.path), "utf8"), entry.patched);
});

test("late wrong version or unexpected predecessor cannot partially patch core", t => {
  for (const mutation of ["version", "source"]) {
    const dir = fixture(t);
    const last = sources.at(-1);
    if (mutation === "version") fs.writeFileSync(path.join(dir, "node_modules/expo-image-picker/package.json"), JSON.stringify({ version: "17.0.12" }));
    else fs.appendFileSync(path.join(dir, "node_modules", last.packageName, last.path), "\n// unreviewed\n");
    assert.throws(() => patch.applyRetentionPatch(dir), /review required|unreviewed/u);
    const first = sources[0];
    assert.equal(fs.readFileSync(path.join(dir, "node_modules", first.packageName, first.path), "utf8"), first.original);
  }
});

test("shared package symlinks cannot mutate another checkout", t => {
  const target = fixture(t);
  const dir = fixture(t);
  fs.rmSync(path.join(dir, "node_modules/expo-image-picker"), { recursive: true });
  fs.symlinkSync(path.join(target, "node_modules/expo-image-picker"), path.join(dir, "node_modules/expo-image-picker"));
  assert.throws(() => patch.applyRetentionPatch(dir), /escapes/u);
  for (const entry of sources) assert.equal(fs.readFileSync(path.join(target, "node_modules", entry.packageName, entry.path), "utf8"), entry.original);
});

test("published ImagePicker AAR, wildcards and misplaced source overrides fail closed", t => {
  patch.assertSourceBuildConfigured(root);
  for (const patterns of [undefined, ["^expo-camera$"], [".*"], ["^expo-camera$", "expo-image-picker"], [...patch.SOURCE_BUILD_PATTERNS, ".*"]]) {
    const dir = fixture(t);
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ expo: { autolinking: { android: { buildFromSource: patterns } } } }));
    assert.throws(() => patch.applyRetentionPatch(dir), /buildFromSource/u);
  }
});

test("opt-in is a separate generic interface, not an ABI change or class-name heuristic", () => {
  const contract = source("AppContextActivityResultContract.kt");
  const original = sources.find(entry => entry.path.endsWith("AppContextActivityResultContract.kt")).original;
  assert.equal(contract.slice(contract.indexOf("interface AppContextActivityResultContract<")), original.slice(original.indexOf("interface AppContextActivityResultContract<")));
  assert.match(contract, /interface AppContextActivityResultRetention<I : Serializable>/u);
  const registry = source("AppContextActivityResultRegistry.kt");
  assert.match(registry, /contract as\? AppContextActivityResultRetention<I>/u);
  assert.doesNotMatch(registry, /imagepicker|javaClass|class\.name|simpleName/u);
});

test("only Camera and Library no-edit inputs opt in and provider failures settle as Error", () => {
  for (const name of ["Camera", "ImageLibrary"]) {
    const contract = source(`${name}Contract.kt`);
    assert.match(contract, new RegExp(`AppContextActivityResultRetention<${name}ContractOptions>`, "u"));
    assert.match(contract, /shouldRetainCallbackOnHostDestroy[\s\S]*?=\s*!input\.options\.allowsEditing/u);
    assert.match(contract, /if \(input\.options\.allowsEditing\) return parsePickerResult/u);
    assert.match(contract, /catch \(cause: Exception\) \{\s*ImagePickerContractResult\.Error/u);
  }
  assert(!sources.some(entry => /CropImageContract/u.test(entry.path)), "Crop remains unchanged");
  const adapter = fs.readFileSync(path.join(root, "_lib/deviceAttachmentPicker.ts"), "utf8");
  assert.match(adapter, /allowsEditing:\s*false/u, "All shared Expo launches must continue to use no-edit options");
  assert.doesNotMatch(adapter, /allowsEditing:\s*true/u);
  const module = fs.readFileSync(path.join(path.dirname(require.resolve("expo-image-picker/package.json")), "android/src/main/java/expo/modules/imagepicker/ImagePickerModule.kt"), "utf8");
  assert.match(module, /is ImagePickerContractResult\.Error -> throw FailedToPickMediaException\(\)/u);
});

test("retention keeps original owner only until actual result and excludes it from snapshots", () => {
  const registry = source("AppContextActivityResultRegistry.kt");
  assert.match(registry, /retainCallbackOnHostDestroy == true &&\s*callbacksAndContract\.mainCallback != null && launchedKeys\.contains\(key\)/u);
  assert.match(registry, /retainedCallbackKeys\.add\(key\)\s*keyToLifecycleContainers\.remove\(key\)\?\.clearObservers\(\)/u);
  assert.match(registry, /finally \{\s*releaseRetainedCallback\(key\)/u);
  assert.match(registry, /keyToRequestCode\.filterKeys \{ it !in ownerBoundKeys \}/u);
  assert.match(registry, /ownerBoundKeys\.forEach \{ persistableResults\.remove\(it\) \}/u);
  assert.doesNotMatch(registry, /postDelayed|timeout|setTimeout/u);
});

test("full context destruction retains cancellation and confines disposal to main thread", () => {
  const context = source("AppContext.kt");
  assert.match(context, /modulesQueue\.cancel\(ContextDestroyedException\(\)\)/u);
  assert.match(context, /backgroundCoroutineScope\.cancel\(ContextDestroyedException\(\)\)\s*activityResultsManager\.onDestroy\(\)/u);
  assert.match(source("ActivityResultsManager.kt"), /if \(Looper\.myLooper\(\) == Looper\.getMainLooper\(\)\)/u);
  assert.match(source("ActivityResultsManager.kt"), /Handler\(Looper\.getMainLooper\(\)\)\.post \{ registry\.disposeRetainedCallbacks\(\) \}/u);
});

test("JUnit evidence rejects missing, skipped, partial or setup-error suites", () => {
  const suite = { count: 9 };
  const xml = '<testsuite tests="9" skipped="0" failures="0" errors="0"></testsuite>';
  assert.equal(readSuite(xml, suite), 0);
  assert.equal(readSuite(xml.replace('failures="0"', 'failures="2"'), suite), 2);
  for (const bad of ["", xml.replace('tests="9"', 'tests="8"'), xml.replace('skipped="0"', 'skipped="1"'), xml.replace('errors="0"', 'errors="1"')]) {
    assert.throws(() => readSuite(bad, suite));
  }
});
