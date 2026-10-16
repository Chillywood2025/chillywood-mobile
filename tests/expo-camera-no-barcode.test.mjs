import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const patch = require("../plugins/withExpoCameraNoBarcode.js").__test;
const specification = require("../plugins/expo-camera-no-barcode/patches.json");
const ts = require("typescript");
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const sdkRoot = path.dirname(require.resolve("expo-camera/package.json"));
const java = "android/src/main/java/expo/modules/camera/";
const original = new Map(patch.PATCHES.map(({ path: name }) => [
  name, patch.transformSource(name, fs.readFileSync(path.join(sdkRoot, name), "utf8"), true),
]));
const transformed = new Map([...original].map(([name, source]) => [name, patch.transformSource(name, source)]));

function fixture(t, version = patch.SDK_VERSION) {
  // Disposable generated test data, never a source checkout or retained proof.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "expo-camera-no-barcode-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sdk = path.join(root, "node_modules/expo-camera");
  fs.mkdirSync(sdk, { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    name: "camera-source-build-fixture",
    expo: { autolinking: { android: { buildFromSource: ["^expo-camera$"] } } },
  }));
  fs.writeFileSync(path.join(sdk, "package.json"), JSON.stringify({ name: "expo-camera", version }));
  for (const [name, source] of original) {
    const filename = path.join(sdk, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, source);
  }
  return { root, sdk };
}

// Independent brace-aware extraction keeps comments and strings in the body
// comparison, but excludes their braces from matching Kotlin/DSL boundaries.
function body(source, marker) {
  const at = source.indexOf(marker);
  assert.notEqual(at, -1, marker);
  const start = source.indexOf("{", at);
  let depth = 0;
  let mode = "code";
  for (let index = start; index < source.length; index += 1) {
    const ch = source[index];
    const next = source[index + 1];
    if (mode === "line") { if (ch === "\n") mode = "code"; continue; }
    if (mode === "comment") { if (ch === "*" && next === "/") { mode = "code"; index += 1; } continue; }
    if (mode === "string" || mode === "char") {
      if (ch === "\\") { index += 1; continue; }
      if (ch === (mode === "string" ? '"' : "'")) mode = "code";
      continue;
    }
    if (ch === "/" && next === "/") { mode = "line"; index += 1; continue; }
    if (ch === "/" && next === "*") { mode = "comment"; index += 1; continue; }
    if (ch === '"') { mode = "string"; continue; }
    if (ch === "'") { mode = "char"; continue; }
    if (ch === "{") depth += 1;
    if (ch === "}" && --depth === 0) return source.slice(at, index + 1);
  }
  assert.fail(`Unterminated body: ${marker}`);
}

test("all ten pinned native transformations are exact, idempotent and reversible", () => {
  assert.equal(patch.SDK_VERSION, "17.0.10");
  const locked = require("../package-lock.json").packages["node_modules/expo-camera"];
  assert.equal(specification.upstreamTarball, locked.resolved);
  assert.equal(specification.upstreamIntegrity, locked.integrity);
  assert.equal(specification.upstreamTarballSha256, "0f64d0221b88be7e75e72237fac5b043f903e11dd371e8608204316f48ce152c");
  assert.equal(patch.PATCHES.length, 10);
  assert.equal(new Set(patch.PATCHES.map(({ path: name }) => name)).size, 10);
  for (const spec of patch.PATCHES) {
    const before = original.get(spec.path);
    const after = transformed.get(spec.path);
    assert.equal(patch.digest(before), spec.originalSha256, spec.path);
    assert.equal(patch.digest(after), spec.patchedSha256, spec.path);
    assert.equal(patch.transformSource(spec.path, after), after);
    assert.equal(patch.transformSource(spec.path, after, true), before);
    assert.equal(patch.transformSource(spec.path, before, true), before);
  }
  assert.match(fs.readFileSync(path.join(projectRoot, "app.config.ts"), "utf8"), /\.\/plugins\/withExpoCameraNoBarcode/u);
});

test("prebuild applies all files and repeated runs preserve the same bytes", (t) => {
  const { root, sdk } = fixture(t);
  const first = patch.applyNoBarcodePatch(root);
  assert.deepEqual(patch.applyNoBarcodePatch(root), first);
  assert.equal(first.files.length, 10);
  for (const [name, source] of transformed) assert.equal(fs.readFileSync(path.join(sdk, name), "utf8"), source);
});

test("production Android autolinking resolves the exact patched Expo Camera source project", () => {
  assert.doesNotThrow(() => patch.assertSourceBuildConfigured(projectRoot));
  const autolinkingRoot = path.dirname(require.resolve("expo-modules-autolinking/package.json"));
  const cli = path.join(autolinkingRoot, "bin/expo-modules-autolinking.js");
  const resolved = JSON.parse(execFileSync(process.execPath, [cli, "resolve", "--platform", "android", "--json", "--project-root", projectRoot], {
    cwd: projectRoot, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  }));
  assert.deepEqual(resolved.configuration.buildFromSource, ["^expo-camera$"]);
  const cameras = resolved.modules.filter(({ packageName }) => packageName === "expo-camera");
  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].packageVersion, patch.SDK_VERSION);
  assert.equal(cameras[0].projects.length, 1);
  const camera = cameras[0].projects[0];
  assert.equal(camera.name, "expo-camera");
  assert.equal(fs.realpathSync(camera.sourceDir), fs.realpathSync(path.join(sdkRoot, "android")));
  assert.equal(camera.publication.version, patch.SDK_VERSION, "published AAR exists, so source opt-out is necessary");
  const pattern = new RegExp(resolved.configuration.buildFromSource[0]);
  assert.equal(pattern.test(camera.name), true);
  for (const unrelated of ["expo-camera-extra", "other-expo-camera", "expo-camera2", "expo"]) assert.equal(pattern.test(unrelated), false);

  // Verify the installed Gradle implementation consumes this as a regex over
  // project.name and short-circuits publication selection. The separate native
  // compile gate must still prove the real Gradle source project is present.
  const kotlinRoot = path.join(autolinkingRoot, "android/expo-gradle-plugin");
  const configuration = fs.readFileSync(path.join(kotlinRoot, "expo-autolinking-plugin-shared/src/main/kotlin/expo/modules/plugin/configuration/ExpoAutolinkingConfig.kt"), "utf8");
  const settings = fs.readFileSync(path.join(kotlinRoot, "expo-autolinking-settings-plugin/src/main/kotlin/expo/modules/plugin/SettingsManager.kt"), "utf8");
  assert.match(configuration, /buildFromSource\.map\s*\{\s*it\.toRegex\(\)\s*\}/u);
  assert.match(settings, /config\.configuration\.buildFromSourceRegex\.any\s*\{\s*it\.matches\(project\.name\)\s*\}/u);
  assert.match(settings, /shouldUsePublication\s*=\s*!forceBuildFromSource\s*&&\s*evaluateShouldUsePublicationScript\(project\)/u);
});

test("missing, misplaced and wrong source-build pins fail before any source writes", (t) => {
  const { root, sdk } = fixture(t);
  for (const expo of [
    undefined,
    {},
    { autolinking: { buildFromSource: ["^expo-camera$"] } },
    { autolinking: { ios: { buildFromSource: ["^expo-camera$"] } } },
    ...[undefined, [], "^expo-camera$", ["expo-camera"], ["^expo_camera$"], ["^expo-camera.*$"], [".*"], ["^expo-camera$", ".*"]]
      .map(buildFromSource => ({ autolinking: { android: { buildFromSource } } })),
  ]) {
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "camera-source-build-fixture", expo }));
    assert.throws(() => patch.applyNoBarcodePatch(root), /expo\.autolinking\.android\.buildFromSource must be/u);
    for (const [name, source] of original) assert.equal(fs.readFileSync(path.join(sdk, name), "utf8"), source, name);
  }
});

test("version drift and an unknown source path fail closed", (t) => {
  const { root, sdk } = fixture(t, "17.0.11");
  assert.throws(() => patch.applyNoBarcodePatch(root), /review required for SDK version/u);
  for (const [name, source] of original) assert.equal(fs.readFileSync(path.join(sdk, name), "utf8"), source);
  assert.throws(() => patch.transformSource("unreviewed.kt", ""), /unknown native source/u);
});

for (const state of ["original", "patched"]) {
  test(`${state} source tampering in any file fails before any file is written`, (t) => {
    const { root, sdk } = fixture(t);
    const baseline = state === "original" ? original : transformed;
    for (const target of patch.PATCHES) {
      for (const [name, source] of baseline) fs.writeFileSync(path.join(sdk, name), source);
      const altered = `${baseline.get(target.path)}\n// unexpected source\n`;
      fs.writeFileSync(path.join(sdk, target.path), altered);
      assert.throws(() => patch.applyNoBarcodePatch(root), /unreviewed native source digest/u);
      for (const [name, source] of baseline) {
        assert.equal(fs.readFileSync(path.join(sdk, name), "utf8"), name === target.path ? altered : source, name);
      }
    }
  });
}

test("missing final source and corrupt transformation both fail before earlier writes", (t) => {
  const { root, sdk } = fixture(t);
  const last = patch.PATCHES.at(-1);
  fs.unlinkSync(path.join(sdk, last.path));
  assert.throws(() => patch.applyNoBarcodePatch(root), /ENOENT/u);
  for (const [name, source] of original) {
    if (name !== last.path) assert.equal(fs.readFileSync(path.join(sdk, name), "utf8"), source);
  }
  fs.writeFileSync(path.join(sdk, last.path), original.get(last.path));
  const change = last.changes.at(-1);
  const saved = change.after;
  try {
    change.after += "// invalid transformation\n";
    assert.throws(() => patch.applyNoBarcodePatch(root), /generated source digest mismatch/u);
    for (const [name, source] of original) assert.equal(fs.readFileSync(path.join(sdk, name), "utf8"), source);
  } finally { change.after = saved; }
});

test("scanner SDKs, model-download metadata, implementation and analysis binding are removed", () => {
  const all = [...transformed.values()].join("\n");
  assert.doesNotMatch(all, /com\.google\.(?:mlkit|android\.gms)|camera-mlkit-vision|barcode_ui|ImageAnalysis|createImageAnalyzer|setAnalyzer|BarcodeScanning\.getClient|GmsBarcodeScanning|class MLKitBarCodeScanner|class BarcodeAnalyzer/u);
  const gradle = transformed.get("android/build.gradle");
  for (const library of ["camera-core", "camera-camera2", "camera-lifecycle", "camera-video", "camera-view", "camera-extensions"]) assert.ok(gradle.includes(library), library);
  const manifest = transformed.get("android/src/main/AndroidManifest.xml");
  assert.match(manifest, /android\.permission\.CAMERA/u);
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/u);
  assert.doesNotMatch(manifest, /<application|<provider|<meta-data/u);
});

test("provider reintroduction is a failing control even when the package version remains pinned", (t) => {
  const { root, sdk } = fixture(t);
  for (const [name, addition] of [
    ["android/build.gradle", '\nimplementation "com.google.mlkit:barcode-scanning:17.3.0"\n'],
    ["android/src/main/AndroidManifest.xml", '\n<provider android:name="com.google.mlkit.common.internal.MlKitInitProvider" />\n'],
    [`${java}analyzers/BarcodeAnalyzer.kt`, '\nimport com.google.mlkit.vision.barcode.BarcodeScanning\n'],
  ]) {
    for (const [filename, source] of transformed) fs.writeFileSync(path.join(sdk, filename), source);
    fs.appendFileSync(path.join(sdk, name), addition);
    assert.throws(() => patch.applyNoBarcodePatch(root), /unreviewed native source digest/u);
    for (const [filename, source] of transformed) {
      assert.equal(fs.readFileSync(path.join(sdk, filename), "utf8"), filename === name ? source + addition : source);
    }
  }
});

test("unsupported scanner calls reject explicitly while the ordinary false prop is accepted", () => {
  const source = transformed.get(`${java}CameraViewModule.kt`);
  for (const api of ["scanFromURLAsync", "launchScanner", "dismissScanner"]) {
    assert.match(body(source, `AsyncFunction("${api}")`), /promise\.reject\(CameraExceptions\.BarcodeScannerUnsupportedException\(\)\)/u);
  }
  assert.match(body(source, 'Property("isModernBarcodeScannerAvailable")'), /\{\s*false\s*\}/u);
  assert.match(body(source, 'Prop("barcodeScannerEnabled")'), /if \(enabled == true\) \{\s*throw CameraExceptions\.BarcodeScannerUnsupportedException/u);
  assert.match(body(source, 'Prop("barcodeScannerSettings")'), /if \(settings != null\) \{\s*throw CameraExceptions\.BarcodeScannerUnsupportedException/u);
});

test("photo plane helper and every ordinary module API body remain byte-identical", () => {
  const helper = `${java}analyzers/BarcodeAnalyzer.kt`;
  const marker = "fun Array<ImageProxy.PlaneProxy>.toByteArray()";
  assert.equal(original.get(helper).slice(original.get(helper).indexOf(marker)), transformed.get(helper).slice(transformed.get(helper).indexOf(marker)));
  const module = `${java}CameraViewModule.kt`;
  for (const match of original.get(module).matchAll(/(?:AsyncFunction|Prop|Property)\("([^"\n]+)"\)/gu)) {
    if (/barcode|scanner|scanFromURL/iu.test(match[1])) continue;
    assert.equal(body(original.get(module), match[0]), body(transformed.get(module), match[0]), match[1]);
  }
  const view = `${java}ExpoCameraView.kt`;
  const excluded = /^(?:onOrientationChanged|createCamera|createImageAnalyzer|setShouldScanBarcodes|setBarcodeScannerSettings|transformBarcodeScannerResultToViewCoordinates|getCornerPointsAndBoundingBox|onBarcodeScanned)$/u;
  for (const match of original.get(view).matchAll(/\bfun ([A-Za-z]+)\(/gu)) {
    if (excluded.test(match[1]) || match[1] === "getPreviewSizeAsArray") continue;
    assert.equal(body(original.get(view), match[0]), body(transformed.get(view), match[0]), match[1]);
  }
  assert.equal(
    body(original.get(view), "fun createCamera()").replace("    imageAnalysisUseCase = createImageAnalyzer()\n", "").replace("        imageAnalysisUseCase?.let {\n          addUseCase(it)\n        }\n", ""),
    body(transformed.get(view), "fun createCamera()"),
  );
  assert.equal(body(original.get(view), "fun onOrientationChanged(").replace("        imageAnalysisUseCase?.targetRotation = rotation\n", ""), body(transformed.get(view), "fun onOrientationChanged("));
});

const scannerNames = /^(?:onBarcodeScanned|onModernBarcodeScanned|barcodeScannerSettings|barcodeScannerEnabled|barcodeTypes|launchScanner|dismissScanner|scanFromURLAsync|scanFromURL|isModernBarcodeScannerAvailable)$/u;
function auditApplication(source, filename) {
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const errors = [];
  function visit(node) {
    if ((ts.isIdentifier(node) || ts.isStringLiteralLike(node)) && scannerNames.test(node.text)) errors.push(`scanner API ${node.text}`);
    if (ts.isStringLiteralLike(node) && node.text.startsWith("expo-camera")) {
      const parent = node.parent;
      if (!ts.isImportDeclaration(parent) || parent.moduleSpecifier !== node || node.text !== "expo-camera") {
        errors.push("non-static camera import");
      } else {
        const clause = parent.importClause;
        const bindings = clause?.namedBindings;
        if (clause?.name || !bindings || !ts.isNamedImports(bindings)) errors.push("unaudited camera import");
        else for (const item of bindings.elements) {
          const imported = (item.propertyName ?? item.name).text;
          if (!["Camera", "CameraView", "useCameraPermissions", "useMicrophonePermissions"].includes(imported)) errors.push(`unaudited camera export ${imported}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return errors;
}

const applicationSourcePath = /^(?:app|components|hooks|lib|_lib|_data|constants|modules)\/.+\.(?:[cm]?js|jsx|tsx?)$/u;

test("the tracked application has no scanner API usage or unaudited camera imports", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: projectRoot, encoding: "utf8" }).split("\0")
    .filter((name) => applicationSourcePath.test(name));
  assert.ok(files.length > 100, "audit must cover the application, not just known camera consumers");
  for (const name of files) assert.deepEqual(auditApplication(fs.readFileSync(path.join(projectRoot, name), "utf8"), name), [], name);
});

test("scanner use in a lib helper cannot escape the tracked-application audit", () => {
  const filename = "lib/camera/scanner.ts";
  const errors = [filename].filter((name) => applicationSourcePath.test(name))
    .flatMap((name) => auditApplication('Camera["launchScanner"]({});', name));
  assert.deepEqual(errors, ["scanner API launchScanner"]);
  assert.deepEqual(auditApplication('export const facing = "front";', filename), []);
});

test("application audit catches aliased scanner imports, computed API names, props and dynamic imports", () => {
  for (const source of [
    'import { scanFromURLAsync as innocent } from "expo-camera";',
    'Camera["launchScanner"]({});',
    '<CameraView onBarcodeScanned={callback} />;',
    '<CameraView {...{ barcodeScannerSettings: {} }} />;',
    'const camera = import("expo-camera");',
    'import * as camera from "expo-camera";',
    'export { Camera } from "expo-camera";',
  ]) assert.ok(auditApplication(source, "negative-control.tsx").length, source);
  assert.deepEqual(auditApplication('import { CameraView as Preview, useCameraPermissions } from "expo-camera"; <Preview facing="front" mute mirror />;', "ordinary.tsx"), []);
});
