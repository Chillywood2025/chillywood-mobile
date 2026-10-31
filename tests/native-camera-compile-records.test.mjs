import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { inspect } from "node:util";
import { parseGradleRecord, parseAndroidRuntimeRecords, readAndroidVariantManifests,
  verifyRuntimeAars, verifyRuntimeGraph, redactNativeDiagnostics, resolveAndroidCameraProjects,
  resolveAndroidDevLauncherProject, resolveAndroidProfileEnvironment, androidNativeCompileTasks,
  parseCocoaPodsRubyContext, COCOAPODS_RUNTIME_PROBE, googleExternalLinkCompileTasks,
  verifyGoogleBillingRuntimeGraph } from "../scripts/compile-native-camera-effects.mjs";
import { ARTIFACTS } from "../scripts/test-local-camera-inference-offline.mjs";

test("external link bridge requires both Kotlin and Java variants and shared Billing/RevenueCat closure", () => {
  assert.deepEqual(googleExternalLinkCompileTasks(), [
    ":chillywood-external-content-links:compileDebugKotlin",
    ":chillywood-external-content-links:compileDebugJavaWithJavac",
    ":chillywood-external-content-links:compileReleaseKotlin",
    ":chillywood-external-content-links:compileReleaseJavaWithJavac",
  ]);
  const components = [
    { kind: "module", group: "com.android.billingclient", name: "billing", version: "8.2.1" },
    { kind: "module", group: "com.revenuecat.purchases", name: "purchases", version: "9.28.1" },
    { kind: "project", projectPath: ":chillywood-external-content-links" },
  ];
  verifyGoogleBillingRuntimeGraph({ components });
  for (let missing = 0; missing < components.length; missing++) {
    assert.throws(() => verifyGoogleBillingRuntimeGraph({ components: components.filter((_, i) => i !== missing) }));
  }
  assert.throws(() => verifyGoogleBillingRuntimeGraph({ components: [{ ...components[0], version: "8.0.0" }, ...components.slice(1)] }));
  assert.throws(() => verifyGoogleBillingRuntimeGraph({ components: [...components, components[0]] }));
});

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
  assert.throws(() => verifyRuntimeAars([runtime, api,
    { coordinate: "unrelated:artifact:1.0", type: "aar", file: "/cache/unrelated.aar" },
  ]), /only the two reviewed runtime modules/u);
});

const runtimePins = ARTIFACTS.map(({ name, sha256 }) => ({ coordinate: `com.google.ai.edge.litert:${name}:1.4.1`, sha256 }));
const manifest = '<manifest package="com.chillywood.mobile"><application /></manifest>';
const runtimeGraph = (variant = "debug") => ({
  configuration: `${variant}RuntimeClasspath`, rootProjectPath: ":app", rootBuildPath: ":", unresolved: [],
  components: [
    ...["app", "chillywood-camera-effects", "expo-camera"].map(name => ({ kind: "project", group: "app-source", name,
      version: "unspecified", buildPath: ":", projectPath: `:${name}` })),
    ...ARTIFACTS.map(({ name }) => ({ kind: "module", group: "com.google.ai.edge.litert", name, version: "1.4.1" })),
    { kind: "module", group: "com.google.firebase", name: "firebase-datatransport", version: "19.0.0" },
  ],
});

const variantRecord = variant => ({ variant, profile: "android-internal-v2", platform: "android", graph: runtimeGraph(variant),
  artifacts: [], manifestTaskPath: `:app:process${variant[0].toUpperCase() + variant.slice(1)}MainManifest`,
  manifests: [`/generated/app/build/intermediates/merged_manifest/${variant}/process${variant[0].toUpperCase() + variant.slice(1)}MainManifest/AndroidManifest.xml`] });
const recordLine = (variant, record = variantRecord(variant)) => `CHILLYWOOD_CAMERA_${variant.toUpperCase()}_RUNTIME_CLOSURE=${JSON.stringify(record)}\n`;

test("both independently bound runtime variants and manifests are mandatory", () => {
  const debug = recordLine("debug");
  const release = recordLine("release");
  assert.deepEqual(Object.keys(parseAndroidRuntimeRecords(debug + release)), ["debug", "release"]);
  for (const output of [debug, release, debug + debug + release, debug + release + release,
    debug + recordLine("release", variantRecord("debug"))]) {
    assert.throws(() => parseAndroidRuntimeRecords(output), assert.AssertionError);
  }
  for (const variant of ["debug", "release"]) {
    for (const mutate of [
      record => { record.profile = "development"; },
      record => { delete record.profile; },
      record => { record.platform = "ios"; },
      record => { record.graph.configuration = variant === "debug" ? "releaseRuntimeClasspath" : "debugRuntimeClasspath"; },
      record => { record.manifestTaskPath = variant === "debug" ? ":app:processReleaseMainManifest" : ":app:processDebugMainManifest"; },
      record => { record.manifests = []; },
    ]) {
      const record = variantRecord(variant);
      mutate(record);
      const output = variant === "debug" ? recordLine(variant, record) + release : debug + recordLine(variant, record);
      assert.throws(() => parseAndroidRuntimeRecords(output), assert.AssertionError);
    }
  }
});

test("Release alone cannot hide forbidden dependencies, metadata, unresolved edges or drifted pins", () => {
  verifyRuntimeGraph(runtimeGraph("debug"), runtimePins, [manifest], "debug");
  verifyRuntimeGraph(runtimeGraph("release"), runtimePins, [manifest], "release");
  assert.throws(() => verifyRuntimeGraph(runtimeGraph("debug"), runtimePins, [manifest], "release"), /this variant/u);
  const graph = runtimeGraph("release");
  graph.components.push({ kind: "module", group: "com.google.mlkit", name: "barcode-scanning", version: "17.3.0" });
  assert.throws(() => verifyRuntimeGraph(graph, runtimePins, [manifest], "release"), /Forbidden camera provider/u);
  assert.throws(() => verifyRuntimeGraph({ ...runtimeGraph("release"), unresolved: ["unresolved-release-edge"] }, runtimePins, [manifest], "release"), /must resolve/u);
  assert.throws(() => verifyRuntimeGraph(runtimeGraph("release"), runtimePins, ['<manifest name="barcode_ui" />'], "release"), /metadata/u);
  const shifted = runtimeGraph("release");
  shifted.components.find(component => component.name === "litert").version = "1.4.2";
  assert.throws(() => verifyRuntimeGraph(shifted, runtimePins, [manifest], "release"), /verified AAR version/u);
});

test("variant manifests must be real, distinct outputs of their own generated tasks", () => {
  const directory = path.resolve("artifacts/native-camera-compile-unit-fixtures");
  fs.mkdirSync(directory, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(directory, "variant-manifests-"));
  const records = Object.fromEntries(["debug", "release"].map(variant => [variant, variantRecord(variant)]));
  try {
    for (const variant of ["debug", "release"]) {
      const filename = records[variant].manifests[0].replace("/generated", fixture);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, manifest);
      records[variant].manifests = [filename];
    }
    const verified = readAndroidVariantManifests(records, fixture);
    assert.equal(verified.debug.receipts[0].sha256, verified.release.receipts[0].sha256,
      "Distinct variants may legitimately generate identical manifest bytes");
    const releaseFile = records.release.manifests[0];
    records.release.manifests = records.debug.manifests;
    assert.throws(() => readAndroidVariantManifests(records, fixture), /this variant/u);
    records.release.manifests = [releaseFile];
    fs.unlinkSync(releaseFile);
    fs.symlinkSync(records.debug.manifests[0], releaseFile);
    assert.throws(() => readAndroidVariantManifests(records, fixture), /this variant/u);
    assert.throws(() => readAndroidVariantManifests({ debug: records.debug }, fixture), /Both variant/u);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("selected Android profile applies only reviewed literal environment settings", () => {
  const env = { CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM: "android", CHILLYWOOD_INTERNAL_CALL_MEDIA_DIAGNOSTICS: "true" };
  const eas = { build: { "android-internal-v2": { env } } };
  assert.deepEqual(resolveAndroidProfileEnvironment(eas), { EAS_BUILD_PROFILE: "android-internal-v2", ...env });
  for (const changed of [{}, { extends: "production", env }, { env: { ...env, EXPO_PUBLIC_SUPABASE_ANON_KEY: "private" } },
    { env: { ...env, CHILLYWOOD_INTERNAL_CALL_MEDIA_DIAGNOSTICS: "false" } }]) {
    assert.throws(() => resolveAndroidProfileEnvironment({ build: { "android-internal-v2": changed } }), assert.AssertionError);
  }
  const syntheticSecret = "synthetic-credential-must-not-enter-diagnostics";
  assert.throws(() => resolveAndroidProfileEnvironment({ build: { "android-internal-v2": {
    env: { ...env, PRIVATE_PROVIDER_TOKEN: syntheticSecret },
  } } }), error => {
    assert(!error.message.includes(syntheticSecret));
    assert(!inspect(error).includes(syntheticSecret));
    return error instanceof assert.AssertionError;
  });
});

test("complete runtime graph rejects providers outside the two-AAR view, including source projects", () => {
  verifyRuntimeGraph(runtimeGraph(), runtimePins, [manifest]);
  const forbidden = [
    ["com.google.mlkit", "barcode-scanning"], ["androidx.camera", "camera-mlkit-vision"],
    ["com.google.android.gms", "play-services-code-scanner"], ["com.google.android.gms", "play-services-tflite-java"],
    ["com.google.mediapipe", "tasks-vision"],
  ];
  for (const kind of ["module", "project"]) {
    for (const [group, name] of forbidden) {
      const graph = runtimeGraph();
      graph.components.push({ kind, group, name, version: "1.0.0", ...(kind === "project"
        ? { buildPath: ":", projectPath: ":forbidden-provider" } : {}) });
      assert.throws(() => verifyRuntimeGraph(graph, runtimePins, [manifest]), /Forbidden camera provider/u, `${kind}:${group}:${name}`);
    }
  }
  const graph = runtimeGraph();
  graph.components.push({ kind: "module", group: "host.exp.exponent", name: "expo.modules.camera", version: "17.0.10" });
  assert.throws(() => verifyRuntimeGraph(graph, runtimePins, [manifest]), /never the prebuilt runtime publication/u);
  assert.throws(() => verifyRuntimeGraph(runtimeGraph(), runtimePins, ['<manifest><application name="barcode_ui" /></manifest>']), /metadata/u);
});

test("runtime graph and pinned AAR evidence fail closed on incompleteness, substitution or mismatched identity", () => {
  const mutations = [
    graph => { graph.configuration = "releaseRuntimeClasspath"; },
    graph => { graph.rootProjectPath = ":expo-camera"; },
    graph => { graph.rootBuildPath = ":included-build"; },
    graph => { graph.unresolved = ["unrelated.group:unresolved-jar:1.0"]; },
    graph => { delete graph.unresolved; },
    graph => { graph.components = []; },
    graph => { graph.components[0].kind = "unknown"; },
    graph => { graph.components.push(graph.components.at(-1)); },
    graph => { graph.components = graph.components.filter(value => value.name !== "litert-api"); },
    graph => { graph.components.find(value => value.name === "litert").version = "1.4.2"; },
    graph => { Object.assign(graph.components.find(value => value.name === "litert"), { kind: "project", buildPath: ":", projectPath: ":litert" }); },
    graph => { graph.components = graph.components.filter(value => value.name !== "expo-camera"); },
    graph => { graph.components = graph.components.filter(value => value.name !== "chillywood-camera-effects"); },
    graph => { graph.components.find(value => value.name === "expo-camera").buildPath = ":included-build"; },
  ];
  for (const mutate of mutations) {
    const graph = runtimeGraph();
    mutate(graph);
    assert.throws(() => verifyRuntimeGraph(graph, runtimePins, [manifest]), assert.AssertionError);
  }
  assert.throws(() => verifyRuntimeGraph(runtimeGraph(), runtimePins.slice(1), [manifest]), /Both verified original AARs/u);
  assert.throws(() => verifyRuntimeGraph(runtimeGraph(), runtimePins.map(pin => ({ ...pin, sha256: "0".repeat(64) })), [manifest]), /original AAR bytes/u);
  assert.throws(() => parseGradleRecord("CHILLYWOOD_CAMERA_RUNTIME_ARTIFACTS=[]\n", "RUNTIME_GRAPH"), /Exactly one/u);
});

test("Gradle queries preserve the full graph while selecting strict original AARs without ambiguous project artifacts", () => {
  const source = fs.readFileSync(new URL("../scripts/compile-native-camera-effects.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /resolvedConfiguration\.resolvedArtifacts/u);
  assert.match(source, /graph\.allDependencies\.findAll \{ it instanceof UnresolvedDependencyResult \}/u);
  assert.match(source, /if \(!unresolved\.isEmpty\(\)\) throw new GradleException/u);
  assert.match(source, /graph\.allComponents\.collect/u);
  assert.match(source, /if \(version == null\) throw new GradleException/u);
  const view = source.slice(source.indexOf("runtime.incoming.artifactView {"), source.indexOf("}.artifacts.artifacts.collect"));
  assert.match(view, /lenient = false/u);
  assert.match(view, /attribute\(ArtifactTypeDefinition\.ARTIFACT_TYPE_ATTRIBUTE, 'aar'\)/u);
  assert.match(view, /id instanceof ModuleComponentIdentifier/u);
  assert.match(view, /id\.group == 'com\.google\.ai\.edge\.litert' && id\.module in \['litert', 'litert-api'\]/u);
  assert.doesNotMatch(view, /id\.version|withVariantReselection/u);
  assert.match(source, /type: artifact\.variant\.attributes\.getAttribute\(ArtifactTypeDefinition\.ARTIFACT_TYPE_ATTRIBUTE\)/u);
});

test("manifest task lookup is deferred until AGP has registered the selected variant tasks", () => {
  const source = fs.readFileSync(new URL("../scripts/compile-native-camera-effects.mjs", import.meta.url), "utf8");
  const app = source.slice(source.indexOf("if (p.path == ':app') {"));
  const registration = app.indexOf("p.tasks.register('cameraEffects' + variant + 'RuntimeClosure')");
  assert(registration > 0);
  assert.doesNotMatch(app.slice(0, registration), /p\.tasks\.named/u,
    "AGP may register process*MainManifest after the current afterEvaluate callback");
  assert.match(app, /dependsOn manifestTaskName\s*doLast \{\s*def manifestTask = p\.tasks\.named\(manifestTaskName\)\.get\(\)/u);
  assert.match(app, /manifestTaskPath: manifestTask\.path/u, "Proof must still bind the actual executed manifest task");
});

test("retained native diagnostics redact host paths, credentials and URL query payloads", () => {
  const output = "Failure in /private/worktree/run/project; HOME=/private; https://user:password@repo.example/artifact?token=abc\nAuthorization: Bearer bearer-secret\napi_key=value\nBUILD FAILED";
  const redacted = redactNativeDiagnostics(output, ["/private", "/private/worktree/run"]);
  assert.match(redacted, /Failure in <local-path>\/project/u);
  assert.match(redacted, /BUILD FAILED/u);
  assert.doesNotMatch(redacted, /\/private|user:password|token=abc|bearer-secret|api_key=value/u);
  for (const credential of ['Authorization: Basic credential-value', '{"token": "credential-value with spaces"}',
    "{'password': 'credential-value with spaces'}", 'api_key = "credential-value with spaces"']) {
    assert.doesNotMatch(redactNativeDiagnostics(credential, []), /credential-value|with spaces/u);
  }
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
  assert.deepEqual(androidNativeCompileTasks(projects), [
    ":chillywood-camera-effects:compileDebugKotlin", ":chillywood-camera-effects:compileDebugJavaWithJavac",
    ":expo-camera:compileDebugKotlin", ":expo-camera:compileDebugJavaWithJavac",
    ":chillywood-camera-effects:compileReleaseKotlin", ":chillywood-camera-effects:compileReleaseJavaWithJavac",
    ":expo-camera:compileReleaseKotlin", ":expo-camera:compileReleaseJavaWithJavac",
    ":expo-dev-launcher:compileDebugKotlin", ":chillywood-camera-effects:cameraEffectsCompileClasspath",
    ":app:cameraEffectsDebugRuntimeClosure", ":app:cameraEffectsReleaseRuntimeClosure",
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

test("development launcher compile target is bound to its actual isolated autolinked source", () => {
  const sourceDir = `${projectRoot}/node_modules/expo-dev-launcher/android`;
  const resolution = { modules: [{ packageName: "expo-dev-launcher", projects: [{ name: "expo-dev-launcher", sourceDir, modules: [] }] }] };
  assert.deepEqual(resolveAndroidDevLauncherProject(resolution, projectRoot), { name: "expo-dev-launcher", sourceDir });
  for (const mutate of [
    value => { value.modules = []; },
    value => { value.modules.push(value.modules[0]); },
    value => { value.modules[0].projects[0].sourceDir = "/another/checkout/expo-dev-launcher/android"; },
    value => { value.modules[0].projects[0].publication = { groupId: "host.exp.exponent" }; },
  ]) {
    const changed = structuredClone(resolution);
    mutate(changed);
    assert.throws(() => resolveAndroidDevLauncherProject(changed, projectRoot), assert.AssertionError);
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
