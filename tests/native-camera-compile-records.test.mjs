import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseGradleRecord, verifyRuntimeAars, resolveAndroidCameraProjects,
  parseCocoaPodsRubyContext, COCOAPODS_RUNTIME_PROBE } from "../scripts/compile-native-camera-effects.mjs";

test("Gradle closure records must be present, singular and valid JSON", () => {
  const artifacts = [{ coordinate: "com.google.ai.edge.litert:litert:1.4.1", type: "aar", file: "/cache/litert.aar" }];
  const record = `CHILLYWOOD_CAMERA_RUNTIME_ARTIFACTS=${JSON.stringify(artifacts)}\r\n`;
  assert.deepEqual(parseGradleRecord(`Gradle progress\n${record}BUILD SUCCESSFUL\n`, "RUNTIME_ARTIFACTS"), artifacts);
  for (const output of ["BUILD SUCCESSFUL", record + record, "CHILLYWOOD_CAMERA_RUNTIME_ARTIFACTS=not-json\n"]) {
    assert.throws(() => parseGradleRecord(output, "RUNTIME_ARTIFACTS"));
  }
  assert.throws(() => parseGradleRecord(record, "MERGED_MANIFESTS"));
});

test("included Gradle builds cannot emit or satisfy the main app source-project marker", () => {
  const source = fs.readFileSync(new URL("../scripts/compile-native-camera-effects.mjs", import.meta.url), "utf8");
  assert.match(source, /expectedCameraRoot = new File\(System\.getenv\('CHILLYWOOD_CAMERA_GRADLE_ROOT'\)\)\.canonicalFile/u);
  const evaluated = source.slice(source.indexOf("gradle.projectsEvaluated {"), source.indexOf("allprojects { p ->"));
  const scopeGuard = "if (gradle.rootProject.projectDir.canonicalFile != expectedCameraRoot) return";
  assert(evaluated.indexOf(scopeGuard) >= 0 && evaluated.indexOf(scopeGuard) < evaluated.indexOf("expectedCameraProjects.each"));
  assert.match(source, /allprojects \{ p ->\s*if \(p\.rootProject\.projectDir\.canonicalFile != expectedCameraRoot\) return/u);
  assert.match(source, /CHILLYWOOD_CAMERA_GRADLE_ROOT: fs\.realpathSync\(generated\)/u);
  const marker = 'CHILLYWOOD_CAMERA_SOURCE_PROJECTS=[{"name":"expo-camera","sourceDir":"/main/project/node_modules/expo-camera/android"}]\n';
  assert.throws(() => parseGradleRecord("included build completed\n", "SOURCE_PROJECTS"));
  assert.throws(() => parseGradleRecord(marker + marker, "SOURCE_PROJECTS"));
});

test("resolved runtime byte guard rejects missing, duplicate, version-shifted or transformed LiteRT", () => {
  const runtime = { coordinate: "com.google.ai.edge.litert:litert:1.4.1", type: "aar", file: "/cache/litert.aar" };
  const api = { coordinate: "com.google.ai.edge.litert:litert-api:1.4.1", type: "aar", file: "/cache/litert-api.aar" };
  assert.throws(() => verifyRuntimeAars([]), /must not be empty/u);
  assert.throws(() => verifyRuntimeAars([api]), /Exactly one resolved litert/u);
  assert.throws(() => verifyRuntimeAars([runtime, runtime, api]), /Exactly one resolved litert/u);
  assert.throws(() => verifyRuntimeAars([{ ...runtime, coordinate: "com.google.ai.edge.litert:litert:1.4.2" }, api]), /version must match/u);
  assert.throws(() => verifyRuntimeAars([{ ...runtime, type: "jar" }, api]), /original AAR bytes/u);
  assert.throws(() => verifyRuntimeAars([{ ...runtime, file: "relative/litert.aar" }, api]), /must be absolute/u);
  assert.throws(() => verifyRuntimeAars([runtime, api,
    { coordinate: "host.exp.exponent:expo.modules.camera:17.0.10", type: "aar", file: "/cache/expo-camera.aar" },
  ]), /never the prebuilt runtime publication/u);
});

const projectRoot = "/validation/project with spaces";
const resolution = () => ({
  configuration: { buildFromSource: ["^expo-camera$"] },
  modules: [
    { packageName: "expo-camera", projects: [{ name: "expo-camera", sourceDir: `${projectRoot}/node_modules/expo-camera/android`,
      modules: ["expo.modules.camera.CameraViewModule"], publication: { groupId: "host.exp.exponent", artifactId: "expo.modules.camera", version: "17.0.10" } }] },
    { packageName: "chillywood-camera-effects", projects: [{ name: "chillywood-camera-effects", sourceDir: `${projectRoot}/modules/chillywood-camera-effects/android`,
      modules: ["expo.modules.chillywoodcameraeffects.ChillywoodCameraEffectsModule"] }] },
  ],
});

test("both exact source compile targets are derived from actual autolinking, never the prebuilt Expo publication", () => {
  const projects = resolveAndroidCameraProjects(resolution(), projectRoot);
  assert.deepEqual(projects.map(({ name }) => `:${name}:compileDebugKotlin`), [
    ":chillywood-camera-effects:compileDebugKotlin", ":expo-camera:compileDebugKotlin",
  ]);
  for (const mutation of ["missing-config", "nonmatching-force", "missing-module", "duplicate-module", "wrong-class", "renamed-project", "outside-copy"]) {
    const changed = resolution();
    if (mutation === "missing-config") delete changed.configuration;
    if (mutation === "nonmatching-force") changed.configuration.buildFromSource = ["expo"];
    if (mutation === "missing-module") changed.modules.pop();
    if (mutation === "duplicate-module") changed.modules.push(changed.modules[0]);
    if (mutation === "wrong-class") changed.modules[0].projects[0].modules = ["DifferentModule"];
    if (mutation === "renamed-project") changed.modules[0].projects[0].name = "different-camera";
    if (mutation === "outside-copy") changed.modules[0].projects[0].sourceDir = "/other/checkout/node_modules/expo-camera/android";
    assert.throws(() => resolveAndroidCameraProjects(changed, projectRoot), assert.AssertionError, mutation);
  }
});

test("CocoaPods Ruby context is singular, complete and comes with a loadable xcodeproj version", () => {
  const context = { ruby: "/installed/ruby/bin/ruby", rubyVersion: "3.4.1", gemHome: "/installed/pod/gems",
    gemPath: ["/installed/pod/gems", "/installed/ruby/gems"], xcodeprojVersion: "1.28.1" };
  const output = `1.17.0\nCHILLYWOOD_COCOAPODS_RUBY=${JSON.stringify(context)}\n`;
  assert.deepEqual(parseCocoaPodsRubyContext(output), context);
  assert.throws(() => parseCocoaPodsRubyContext("1.17.0\n"));
  assert.throws(() => parseCocoaPodsRubyContext(output + output));
  for (const key of Object.keys(context)) {
    const changed = { ...context };
    delete changed[key];
    assert.throws(() => parseCocoaPodsRubyContext(`CHILLYWOOD_COCOAPODS_RUBY=${JSON.stringify(changed)}`), undefined, key);
  }
  assert.throws(() => parseCocoaPodsRubyContext(`CHILLYWOOD_COCOAPODS_RUBY=${JSON.stringify({ ...context, ruby: "ruby" })}`));
  assert.match(COCOAPODS_RUNTIME_PROBE, /require 'xcodeproj'/u);
  assert.match(COCOAPODS_RUNTIME_PROBE, /ruby: RbConfig\.ruby/u);
  assert.match(COCOAPODS_RUNTIME_PROBE, /gemHome: Gem\.dir, gemPath: Gem\.path/u);
});

test("an AAR at the expected coordinate still fails when its actual bytes changed", () => {
  const directory = path.resolve("artifacts/native-camera-compile-unit-fixtures");
  fs.mkdirSync(directory, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(directory, "run-"));
  const filename = path.join(fixture, "litert.aar");
  try {
    fs.writeFileSync(filename, "corrupt runtime bytes");
    assert.throws(() => verifyRuntimeAars([
      { coordinate: "com.google.ai.edge.litert:litert:1.4.1", type: "aar", file: filename },
      { coordinate: "com.google.ai.edge.litert:litert-api:1.4.1", type: "aar", file: path.join(fixture, "litert-api.aar") },
    ]), /AAR bytes differ/u);
  } finally {
    // Only this test's corrupt fixture is removed; generated native sources and
    // validation receipts are retained by the actual compile runner.
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
