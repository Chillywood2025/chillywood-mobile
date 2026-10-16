import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ARTIFACTS } from "./test-local-camera-inference-offline.mjs";
import { assertLocalCameraProviderClosure } from "./camera-provider-closure.mjs";

const ANDROID_VARIANTS = Object.freeze(["debug", "release"]);
const variantTitle = variant => variant[0].toUpperCase() + variant.slice(1);

export function resolveAndroidProfileEnvironment(eas) {
  const profile = eas?.build?.["android-internal-v2"];
  assert(profile && !profile.extends, "Reviewed Android profile must be explicit; inherited environment requires review");
  const expected = { CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM: "android", CHILLYWOOD_INTERNAL_CALL_MEDIA_DIAGNOSTICS: "true" };
  // A rejected future profile may contain credentials. Do not attach its
  // values to an AssertionError or include them in diagnostic output.
  assert(profile.env && Object.keys(profile.env).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, value]) => profile.env[key] === value),
    "Use only the reviewed literal Android profile environment; never import provider credentials");
  return { EAS_BUILD_PROFILE: "android-internal-v2", ...profile.env };
}

export function androidNativeCompileTasks(cameraProjects) {
  return [...ANDROID_VARIANTS.flatMap(variant => cameraProjects.map(({ name }) => `:${name}:compile${variantTitle(variant)}Kotlin`)),
    ":expo-dev-launcher:compileDebugKotlin", ":chillywood-camera-effects:cameraEffectsCompileClasspath",
    ...ANDROID_VARIANTS.map(variant => `:app:cameraEffects${variantTitle(variant)}RuntimeClosure`)];
}

// These records come from the real Gradle task, never a dependency text grep or
// a synthetic fixture. Missing/duplicate output must fail rather than narrow
// the closure that gets reviewed.
export function parseGradleRecord(output, name) {
  const prefix = `CHILLYWOOD_CAMERA_${name}=`;
  const records = output.split(/\r?\n/u).filter(line => line.startsWith(prefix));
  assert.equal(records.length, 1, `Exactly one actual Gradle ${name} record is required`);
  return JSON.parse(records[0].slice(prefix.length));
}

export function parseAndroidRuntimeRecords(output) {
  return Object.fromEntries(ANDROID_VARIANTS.map(variant => {
    const record = parseGradleRecord(output, `${variant.toUpperCase()}_RUNTIME_CLOSURE`);
    assert.equal(record.variant, variant, "Runtime evidence must match its independently requested variant");
    assert.equal(record.profile, "android-internal-v2", "Runtime evidence must use the selected internal profile");
    assert.equal(record.platform, "android", "Runtime evidence must be Android");
    assert.equal(record.graph?.configuration, `${variant}RuntimeClasspath`, "Runtime graph must match its variant");
    assert.equal(record.manifestTaskPath, `:app:process${variantTitle(variant)}MainManifest`, "Manifest task must match its variant");
    assert(Array.isArray(record.manifests) && record.manifests.length > 0, "Both variants require actual merged manifests");
    return [variant, record];
  }));
}

export function readAndroidVariantManifests(records, generated) {
  assert.deepEqual(Object.keys(records).sort(), [...ANDROID_VARIANTS].sort(), "Both variant records are mandatory");
  const seen = new Set();
  return Object.fromEntries(ANDROID_VARIANTS.map(variant => {
    // Pinned AGP's process*MainManifest output, not a manifest from another
    // variant or a source fixture. realpath also rejects cross-variant aliases.
    const expectedDirectory = path.join(fs.realpathSync(generated), "app/build/intermediates/merged_manifest",
      variant, `process${variantTitle(variant)}MainManifest`);
    const sources = [];
    const receipts = [];
    for (const manifest of records[variant].manifests) {
      assert(typeof manifest === "string" && path.isAbsolute(manifest), "Manifest output must be an absolute path");
      const actual = fs.realpathSync(manifest);
      assert.equal(path.dirname(actual), expectedDirectory, "Manifest must belong to this variant's actual task output");
      assert.equal(path.basename(actual), "AndroidManifest.xml");
      assert(!seen.has(actual), "Each variant must supply distinct actual manifest outputs");
      seen.add(actual);
      const xml = fs.readFileSync(actual, "utf8");
      assert.match(xml, /<manifest\b/u, "Actual manifest task output must contain a manifest");
      sources.push(xml);
      receipts.push({ path: path.relative(generated, actual), sha256: createHash("sha256").update(xml).digest("hex") });
    }
    assert(sources.length > 0, "Each variant requires a merged manifest");
    return [variant, { sources, receipts }];
  }));
}

export function verifyRuntimeAars(artifacts) {
  assert(Array.isArray(artifacts) && artifacts.length > 0, "Resolved app runtime artifacts must not be empty");
  for (const artifact of artifacts) {
    assert.equal(typeof artifact.coordinate, "string");
    assert.equal(typeof artifact.file, "string");
    assert(path.isAbsolute(artifact.file), "Gradle artifact paths must be absolute");
    assert(!artifact.coordinate.startsWith("host.exp.exponent:expo.modules.camera:"),
      "Expo Camera must use patched source, never the prebuilt runtime publication");
    assert(ARTIFACTS.some(pin => artifact.coordinate.startsWith(`com.google.ai.edge.litert:${pin.name}:`)),
      "Pinned AAR view must contain only the two reviewed runtime modules");
  }
  return ARTIFACTS.map(pin => {
    const coordinate = `com.google.ai.edge.litert:${pin.name}:1.4.1`;
    const matches = artifacts.filter(artifact => artifact.coordinate.startsWith(`com.google.ai.edge.litert:${pin.name}:`));
    assert.equal(matches.length, 1, `Exactly one resolved ${pin.name} AAR is required`);
    const artifact = matches[0];
    assert.equal(artifact.coordinate, coordinate, "Resolved LiteRT version must match the reviewed runtime");
    assert.equal(artifact.type, "aar", "Validate original AAR bytes, not a transformed classes.jar");
    assert.equal(path.extname(artifact.file), ".aar");
    const sha256 = createHash("sha256").update(fs.readFileSync(artifact.file)).digest("hex");
    assert.equal(sha256, pin.sha256, `Resolved ${coordinate} AAR bytes differ from the reviewed runtime`);
    return { coordinate, sha256 };
  });
}

export function verifyRuntimeGraph(graph, runtimePins, manifests, variant = "debug") {
  assert(ANDROID_VARIANTS.includes(variant), "Only independently requested Debug and Release variants are valid");
  assert.equal(graph?.configuration, `${variant}RuntimeClasspath`, "Inspect this variant's actual app runtime graph");
  assert.equal(graph.rootProjectPath, ":app", "Runtime graph must belong to the application");
  assert.equal(graph.rootBuildPath, ":", "Runtime graph must belong to the main generated build");
  assert.deepEqual(graph.unresolved, [], "Every app runtime dependency must resolve, including non-camera dependencies");
  assert(Array.isArray(graph.components) && graph.components.length > 0, "Complete app runtime components are required");
  const identities = new Set();
  for (const component of graph.components) {
    assert(["module", "project"].includes(component.kind), "Unexpected runtime component identity");
    for (const key of ["group", "name", "version"]) assert.equal(typeof component[key], "string");
    assert(component.name && component.version, "Runtime component identity must be complete");
    let identity;
    if (component.kind === "project") {
      assert(typeof component.buildPath === "string" && component.buildPath.startsWith(":"));
      assert(typeof component.projectPath === "string" && component.projectPath.startsWith(":"));
      identity = `project:${component.buildPath}:${component.projectPath}`;
    } else {
      assert(component.group, "External runtime component group is required");
      identity = `module:${component.group}:${component.name}:${component.version}`;
    }
    assert(!identities.has(identity), "Duplicate resolved runtime component");
    identities.add(identity);
    assert(component.group !== "host.exp.exponent" || component.name !== "expo.modules.camera",
      "Expo Camera must use patched source, never the prebuilt runtime publication");
  }
  for (const projectPath of [":app", ":chillywood-camera-effects", ":expo-camera"]) {
    assert.equal(graph.components.filter(component => component.kind === "project"
      && component.buildPath === graph.rootBuildPath && component.projectPath === projectPath).length, 1,
    `Exactly one main-build ${projectPath} source project must enter the actual app runtime graph`);
  }
  assert.equal(runtimePins.length, ARTIFACTS.length, "Both verified original AARs are required");
  for (const pin of ARTIFACTS) {
    const coordinate = `com.google.ai.edge.litert:${pin.name}:1.4.1`;
    const matches = graph.components.filter(component => component.group === "com.google.ai.edge.litert" && component.name === pin.name);
    assert.equal(matches.length, 1, `Exactly one graph-selected ${pin.name} runtime is required`);
    assert.equal(matches[0].kind, "module", "Reviewed LiteRT must be the external AAR, not a project substitution");
    assert.equal(matches[0].version, "1.4.1", "Graph-selected LiteRT must match the verified AAR version");
    assert.deepEqual(runtimePins.filter(artifact => artifact.coordinate === coordinate), [{ coordinate, sha256: pin.sha256 }],
      "Graph-selected LiteRT must match the verified original AAR bytes");
  }
  // This is the entire graph, including projects and dependencies whose
  // artifacts are JARs. The filtered AAR view is only the byte proof for pins.
  assertLocalCameraProviderClosure(graph.components.map(component => ({ ...component,
    sha256: runtimePins.find(pin => pin.coordinate === `${component.group}:${component.name}:${component.version}`)?.sha256,
  })), manifests, { coordinate: runtimePins[0].coordinate, sha256: runtimePins[0].sha256,
    apiCoordinate: runtimePins[1].coordinate, apiSha256: runtimePins[1].sha256 });
}

export function redactNativeDiagnostics(value, localPaths) {
  return localPaths.filter(Boolean).sort((a, b) => b.length - a.length)
    .reduce((output, localPath) => output.replaceAll(localPath, "<local-path>"), String(value))
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gu, "$1<redacted>@")
    .replace(/(https?:\/\/[^\s?]+)\?[^\s]+/gu, "$1?<redacted>")
    .replace(/"(authorization|password|token|secret|api[_-]?key)"(\s*:\s*)"(?:\\.|[^"\\])*"/giu, '"$1"$2"<redacted>"')
    .replace(/'(authorization|password|token|secret|api[_-]?key)'(\s*:\s*)'(?:\\.|[^'\\])*'/giu, "'$1'$2'<redacted>'")
    .replace(/\b(authorization|password|token|secret|api[_-]?key)(\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/giu, "$1$2<redacted>")
    .replace(/\b(authorization)(\s*[:=]\s*)(?:Bearer|Basic)\s+[^\s,;]+/giu, "$1$2<redacted>")
    .replace(/\b(authorization|password|token|secret|api[_-]?key)(\s*[:=]\s*)[^\s,;]+/giu, "$1$2<redacted>");
}

export function resolveAndroidCameraProjects(resolution, projectRoot) {
  assert(Array.isArray(resolution?.modules), "Actual Android autolinking resolution is required");
  return [
    ["chillywood-camera-effects", "expo.modules.chillywoodcameraeffects.ChillywoodCameraEffectsModule"],
    ["expo-camera", "expo.modules.camera.CameraViewModule"],
  ].map(([packageName, moduleClass]) => {
    const modules = resolution.modules.filter(module => module.packageName === packageName);
    assert.equal(modules.length, 1, `Exactly one autolinked ${packageName} package is required`);
    const projects = modules[0].projects?.filter(project => project.modules?.includes(moduleClass)) ?? [];
    assert.equal(projects.length, 1, `Exactly one ${packageName} source project must provide ${moduleClass}`);
    const project = projects[0];
    assert.equal(project.name, packageName, "Reviewed camera Gradle project identity changed");
    assert.equal(typeof project.sourceDir, "string");
    assert(path.isAbsolute(project.sourceDir), "Camera source directory must be absolute");
    const relative = path.relative(projectRoot, project.sourceDir);
    assert(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
      "Camera source project must belong to this isolated input copy");
    if (project.publication) {
      const patterns = resolution.configuration?.buildFromSource;
      // SDK 54 otherwise links the unpatched prebuilt Maven AAR and excludes
      // :expo-camera entirely. Match Kotlin Regex.matches semantics, not a
      // partial substring test or a validation-only settings override.
      assert(Array.isArray(patterns) && patterns.some(pattern => typeof pattern === "string"
        && new RegExp(`^(?:${pattern})$`, "u").test(project.name)),
      `${packageName} must be forced to build from source by the actual app autolinking configuration`);
    }
    return { name: project.name, sourceDir: project.sourceDir };
  });
}

export function resolveAndroidDevLauncherProject(resolution, projectRoot) {
  const modules = resolution?.modules?.filter(module => module.packageName === "expo-dev-launcher") ?? [];
  assert.equal(modules.length, 1, "Exactly one autolinked development launcher is required");
  assert.equal(modules[0].projects?.length, 1, "Exactly one development launcher source project is required");
  const project = modules[0].projects[0];
  assert.equal(project.name, "expo-dev-launcher");
  assert.equal(project.sourceDir, path.join(projectRoot, "node_modules/expo-dev-launcher/android"),
    "Development launcher must use this isolated patched package");
  assert(!project.publication, "Patched development launcher must be compiled from source");
  return { name: project.name, sourceDir: project.sourceDir };
}

export const COCOAPODS_RUNTIME_PROBE = `require 'rbconfig'
require 'json'
at_exit do
  require 'xcodeproj'
  puts 'CHILLYWOOD_COCOAPODS_RUBY=' + JSON.generate({
    ruby: RbConfig.ruby, rubyVersion: RUBY_VERSION,
    gemHome: Gem.dir, gemPath: Gem.path,
    xcodeprojVersion: Xcodeproj::VERSION
  })
end
`;

export function parseCocoaPodsRubyContext(output) {
  const prefix = "CHILLYWOOD_COCOAPODS_RUBY=";
  const records = output.split(/\r?\n/u).filter(line => line.startsWith(prefix));
  assert.equal(records.length, 1, "Existing CocoaPods must report exactly one usable Ruby context");
  const context = JSON.parse(records[0].slice(prefix.length));
  for (const key of ["ruby", "gemHome"]) {
    assert(typeof context[key] === "string" && path.isAbsolute(context[key]), `CocoaPods ${key} must be absolute`);
  }
  assert(Array.isArray(context.gemPath) && context.gemPath.length > 0
    && context.gemPath.every(value => typeof value === "string" && path.isAbsolute(value)), "CocoaPods gem paths required");
  for (const key of ["rubyVersion", "xcodeprojVersion"]) assert.match(context[key], /^\d+(?:\.\d+)+/u);
  return context;
}

// Credential-free native validation only. Never builds/signs the app, publishes
// an OTA, calls EAS, submits to a store, or accepts SDK license prompts.
async function main() {
const options = new Set(process.argv.slice(2));
assert([...options].every(value => ["--android", "--ios", "--generate-only"].includes(value)), "Unknown compile option");
const platforms = options.has("--android") || options.has("--ios")
  ? ["android", "ios"].filter(value => options.has(`--${value}`)) : ["android", "ios"];
const generateOnly = options.has("--generate-only");
if (platforms.includes("ios") && !generateOnly) assert.equal(process.platform, "darwin", "Apple module compilation requires macOS and Xcode");
const root = process.cwd();
// Keep source and receipts in the ignored, persistent worktree. A delayed
// approval or failed compile must not destroy the only generated-source copy.
const runs = path.join(root, "artifacts/native-camera-compile");
fs.mkdirSync(runs, { recursive: true });
const workspace = fs.mkdtempSync(path.join(runs, "run-"));
const project = path.join(workspace, "project");
const scratch = path.join(workspace, "scratch");
fs.mkdirSync(scratch);
const receipts = {};
const receipt = { scope: "camera-module-native-compile", status: "running", generatedOnly: generateOnly,
  runnerSourceSha256: createHash("sha256").update(fs.readFileSync(fileURLToPath(import.meta.url))).digest("hex"),
  receipts, physicalEvidence: false, inferenceExecuted: false, commands: [] };
const saveReceipt = () => fs.writeFileSync(path.join(workspace, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
saveReceipt();
console.log(`Persistent validation workspace: ${path.relative(root, workspace)}`);
const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TEMP", "JAVA_HOME", "ANDROID_HOME", "ANDROID_SDK_ROOT",
  "DEVELOPER_DIR", "LANG", "LC_ALL", "GEM_HOME", "GEM_PATH"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { CI: "1", EXPO_NO_DOTENV: "1", EXPO_NO_CLIENT_ENV_VARS: "1", EXPO_NO_TELEMETRY: "1",
  GIT_TERMINAL_PROMPT: "0", COCOAPODS_DISABLE_STATS: "true",
  TMPDIR: scratch, TMP: scratch, TEMP: scratch,
  EXPO_PUBLIC_SUPABASE_URL: "https://ci.invalid", EXPO_PUBLIC_SUPABASE_ANON_KEY: "ci-placeholder-not-a-secret",
  EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST: "ci@example.invalid", EXPO_PUBLIC_BETA_ENVIRONMENT: "closed-beta" });
const redact = value => redactNativeDiagnostics(value,
  [workspace, root, env.HOME, env.ANDROID_HOME, env.ANDROID_SDK_ROOT, env.JAVA_HOME]);

function run(command, args, cwd = project, extraEnv = {}) {
  const commandReceipt = { command: path.basename(command),
    // Keep public task/flag names, redact host-specific paths from receipts.
    args: args.map(redact),
    passed: false };
  receipt.commands.push(commandReceipt);
  saveReceipt();
  const result = spawnSync(command, args, { cwd, env: { ...env, ...extraEnv }, encoding: "utf8",
    timeout: 35 * 60_000, maxBuffer: 64 * 1024 * 1024 });
  commandReceipt.exitCode = result.status;
  commandReceipt.passed = !result.error && result.status === 0;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  commandReceipt.outputSha256 = createHash("sha256").update(output).digest("hex");
  const diagnostics = redact(output);
  commandReceipt.diagnostics = `command-${String(receipt.commands.length).padStart(2, "0")}.log`;
  commandReceipt.diagnosticsSha256 = createHash("sha256").update(diagnostics).digest("hex");
  fs.writeFileSync(path.join(workspace, commandReceipt.diagnostics), diagnostics);
  saveReceipt();
  if (result.error || result.status !== 0) {
    // Inputs are this clean source copy and public dependencies, with no provider
    // credentials in the child environment. Limit CI diagnostics to the tail.
    // Retain the redacted full output so the first failure remains reviewable.
    process.stderr.write(diagnostics.slice(-24_000));
    throw new Error(`${path.basename(command)} failed (${result.error?.message ?? result.status})`);
  }
  return result.stdout;
}

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : [filename];
  });
}

function assertIsolatedLinks(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const relative = path.relative(project, fs.realpathSync(filename));
      assert(!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative),
        "Validation inputs may not link outside the isolated project");
    } else if (entry.isDirectory()) assertIsolatedLinks(filename);
  }
}

try {
  fs.mkdirSync(project);
  // Config plugins patch pinned node_modules in place. Use real private copies,
  // not symlinks/hardlinks into the checkout or another worker's dependencies.
  for (const relative of ["app.json", "app.config.ts", "eas.json", "package.json", "package-lock.json", "tsconfig.json",
    "expo-env.d.ts", "react-native.config.js", "metro.config.js", "assets", "config", "plugins", "modules", "node_modules"]) {
    const source = path.join(root, relative);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(project, relative), { recursive: true, verbatimSymlinks: true });
  }
  assertIsolatedLinks(project);
  // Firebase's Expo plugin requires config files even for a camera-library
  // compile. These explicit nonfunctional fixtures are ONLY in the isolated
  // project; no app is launched and no Firebase account or credentials are used.
  fs.writeFileSync(path.join(project, "google-services.json"), JSON.stringify({
    project_info: { project_number: "000000000000", project_id: "chillywood-ci-compile", storage_bucket: "ci.invalid" },
    client: [{ client_info: { mobilesdk_app_id: "1:000000000000:android:0000000000000000000000",
      android_client_info: { package_name: "com.chillywood.mobile" } },
      api_key: [{ current_key: "ci-placeholder-not-an-api-key" }], services: {} }], configuration_version: "1",
  }));
  fs.writeFileSync(path.join(project, "GoogleService-Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>API_KEY</key><string>ci-placeholder-not-an-api-key</string>
<key>GCM_SENDER_ID</key><string>000000000000</string><key>PLIST_VERSION</key><string>1</string>
<key>BUNDLE_ID</key><string>com.chillywood.mobile</string><key>PROJECT_ID</key><string>chillywood-ci-compile</string>
<key>GOOGLE_APP_ID</key><string>1:000000000000:ios:0000000000000000000000</string></dict></plist>`);
  const moduleConfig = JSON.parse(fs.readFileSync(path.join(project, "modules/chillywood-camera-effects/expo-module.config.json")));
  assert.equal(moduleConfig.android.modules[0], "expo.modules.chillywoodcameraeffects.ChillywoodCameraEffectsModule");
  assert.deepEqual(moduleConfig.apple.modules, ["ChillywoodCameraEffectsModule"]);
  const sourceHash = createHash("sha256");
  for (const file of files(path.join(project, "modules/chillywood-camera-effects")).sort()) {
    sourceHash.update(path.relative(project, file)); sourceHash.update(fs.readFileSync(file));
  }
  receipt.cameraModuleSourceSha256 = sourceHash.digest("hex");
  console.log(`Camera module source SHA-256: ${receipt.cameraModuleSourceSha256}`);
  saveReceipt();
  for (const platform of platforms) {
    console.log(`Generating isolated ${platform} project with the actual Expo plugins`);
    const easSource = platform === "android" ? fs.readFileSync(path.join(project, "eas.json"), "utf8") : undefined;
    const platformEnv = platform === "android" ? resolveAndroidProfileEnvironment(JSON.parse(easSource))
      : { CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM: platform, EAS_BUILD_PROFILE: `${platform}-internal-v2` };
    const resolution = JSON.parse(run(process.execPath, ["node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js",
      "resolve", "--platform", platform === "ios" ? "apple" : "android", "--json"], project, platformEnv));
    assert(resolution.modules.some(module => module.packageName === "chillywood-camera-effects"), `${platform}: real module must autolink`);
    const cameraProjects = platform === "android" ? resolveAndroidCameraProjects(resolution, project) : undefined;
    const devLauncherProject = platform === "android" ? resolveAndroidDevLauncherProject(resolution, project) : undefined;
    run(process.execPath, ["node_modules/expo/bin/cli", "prebuild", "--platform", platform, "--no-install"], project, platformEnv);
    const generated = path.join(project, platform);
    assert(fs.existsSync(generated), `Expo must generate ${platform} sources`);
    const digest = createHash("sha256");
    for (const file of files(generated).sort()) { digest.update(path.relative(generated, file)); digest.update(fs.readFileSync(file)); }
    receipts[platform] = { generatedSourceSha256: digest.digest("hex"), compiled: false };
    if (platform === "android") {
      receipts.android.profile = { name: platformEnv.EAS_BUILD_PROFILE, literalEnvironment: platformEnv,
        easConfigSha256: createHash("sha256").update(easSource).digest("hex"),
        backendConfiguration: "nonfunctional local fixtures; remote EAS environment not loaded", signedArtifactEquivalent: false };
      const ownership = createRequire(import.meta.url)(path.join(project, "plugins/withWebRtcCameraEffectOwnership.js")).__test;
      const dependency = fs.readFileSync(path.join(project, "node_modules/@livekit/react-native-webrtc", ownership.RELATIVE_PATH), "utf8");
      const nativeDependencySha256 = ownership.digest(dependency);
      assert.equal(nativeDependencySha256, ownership.PATCHED_SHA256, "Actual prebuild must apply empty-chain ownership protection");
      receipts.android.nativeDependencySha256 = nativeDependencySha256;
      console.log(`Android WebRTC camera ownership source SHA-256: ${nativeDependencySha256}`);
    }
    if (generateOnly) continue;
    if (platform === "android") {
      assert(env.ANDROID_HOME || env.ANDROID_SDK_ROOT, "Android SDK must be supplied by the runner; no automatic license acceptance");
      const initScript = path.join(workspace, "camera-classpath.gradle");
      fs.writeFileSync(initScript, `import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import org.gradle.api.artifacts.component.ModuleComponentIdentifier
import org.gradle.api.artifacts.component.ProjectComponentIdentifier
import org.gradle.api.artifacts.result.UnresolvedDependencyResult
import org.gradle.api.artifacts.type.ArtifactTypeDefinition
def expectedCameraProjects = new JsonSlurper().parseText(System.getenv('CHILLYWOOD_CAMERA_SOURCE_PROJECTS'))
def expectedDevLauncher = new JsonSlurper().parseText(System.getenv('CHILLYWOOD_CAMERA_DEV_LAUNCHER_PROJECT'))
def expectedCameraRoot = new File(System.getenv('CHILLYWOOD_CAMERA_GRADLE_ROOT')).canonicalFile
gradle.projectsEvaluated {
  // Init scripts also run for included Expo/React Native plugin builds.
  // Only the generated application build may emit the required proof marker.
  if (gradle.rootProject.projectDir.canonicalFile != expectedCameraRoot) return
  if (System.getenv('EAS_BUILD_PROFILE') != 'android-internal-v2' ||
      System.getenv('CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM') != 'android' ||
      System.getenv('CHILLYWOOD_INTERNAL_CALL_MEDIA_DIAGNOSTICS') != 'true') {
    throw new GradleException('Reviewed Android internal profile environment required')
  }
  expectedCameraProjects.each { expected ->
    def actual = gradle.rootProject.findProject(':' + expected.name)
    if (actual == null) throw new GradleException('Required camera source project missing: ' + expected.name)
    if (actual.projectDir.canonicalFile != new File(expected.sourceDir).canonicalFile) {
      throw new GradleException('Camera source project directory differs from autolinking: ' + expected.name)
    }
    ['Debug', 'Release'].each { variant ->
      if (actual.tasks.findByName('compile' + variant + 'Kotlin') == null) {
        throw new GradleException('Required camera Kotlin compile task missing: ' + expected.name + ':' + variant)
      }
    }
  }
  println('CHILLYWOOD_CAMERA_SOURCE_PROJECTS=' + JsonOutput.toJson(expectedCameraProjects))
  def launcher = gradle.rootProject.findProject(':' + expectedDevLauncher.name)
  if (launcher == null || launcher.projectDir.canonicalFile != new File(expectedDevLauncher.sourceDir).canonicalFile ||
      launcher.tasks.findByName('compileDebugKotlin') == null) {
    throw new GradleException('Patched development launcher source compile target is required')
  }
  println('CHILLYWOOD_CAMERA_DEV_LAUNCHER_SOURCE_PROJECT=' + JsonOutput.toJson(expectedDevLauncher))
}
allprojects { p ->
  if (p.rootProject.projectDir.canonicalFile != expectedCameraRoot) return
  p.afterEvaluate {
    if (p.name == 'chillywood-camera-effects') {
      p.tasks.register('cameraEffectsCompileClasspath') {
        dependsOn p.tasks.named('compileDebugJavaWithJavac')
        doLast {
          def compiler = p.tasks.named('compileDebugJavaWithJavac').get()
          def jars = compiler.classpath.files + p.android.bootClasspath
          println('CHILLYWOOD_CAMERA_CLASSPATH=' + JsonOutput.toJson(jars.collect { it.absolutePath }.unique().sort()))
        }
      }
    }
    if (p.path == ':app') {
      ['Debug', 'Release'].each { variant ->
      def variantName = variant.toLowerCase()
      def manifestTask = p.tasks.named('process' + variant + 'MainManifest')
      p.tasks.register('cameraEffects' + variant + 'RuntimeClosure') {
        dependsOn manifestTask
        doLast {
          def runtime = p.configurations.getByName(variantName + 'RuntimeClasspath')
          def graph = runtime.incoming.resolutionResult
          def unresolved = graph.allDependencies.findAll { it instanceof UnresolvedDependencyResult }
          if (!unresolved.isEmpty()) throw new GradleException('Unresolved app runtime dependencies: ' + unresolved.collect { it.attempted.displayName }.sort())
          def components = graph.allComponents.collect { component ->
            def id = component.id
            def version = component.moduleVersion
            if (version == null) throw new GradleException('Runtime component has no module identity: ' + id.displayName)
            def record = [group: version.group, name: version.name, version: version.version]
            if (id instanceof ModuleComponentIdentifier) {
              record.kind = 'module'
            } else if (id instanceof ProjectComponentIdentifier) {
              record.kind = 'project'
              record.buildPath = id.build.buildPath
              record.projectPath = id.projectPath
            } else {
              throw new GradleException('Unexpected runtime component identity: ' + id.displayName)
            }
            record
          }.sort { a, b -> a.kind <=> b.kind ?: a.group <=> b.group ?: a.name <=> b.name ?: a.version <=> b.version }
          def graphRecord = [
            configuration: runtime.name, rootProjectPath: graph.root.id.projectPath, rootBuildPath: graph.root.id.build.buildPath,
            components: components, unresolved: []]
          // Graph inspection above is unfiltered. Only original LiteRT AAR byte
          // inspection needs this view; do not select ambiguous AGP project
          // artifact variants, reselect variants or tolerate missing artifacts.
          def artifacts = runtime.incoming.artifactView {
            lenient = false
            attributes { attribute(ArtifactTypeDefinition.ARTIFACT_TYPE_ATTRIBUTE, 'aar') }
            componentFilter { id -> id instanceof ModuleComponentIdentifier &&
              id.group == 'com.google.ai.edge.litert' && id.module in ['litert', 'litert-api'] }
          }.artifacts.artifacts.collect { artifact ->
            def id = artifact.id.componentIdentifier
            [coordinate: id.group + ':' + id.module + ':' + id.version,
              type: artifact.variant.attributes.getAttribute(ArtifactTypeDefinition.ARTIFACT_TYPE_ATTRIBUTE),
              file: artifact.file.absolutePath]
          }.sort { a, b -> a.coordinate <=> b.coordinate ?: a.file <=> b.file }
          def manifests = manifestTask.get().outputs.files.asFileTree.files.findAll {
            it.name == 'AndroidManifest.xml'
          }.collect { it.absolutePath }.unique().sort()
          if (manifests.isEmpty()) throw new GradleException('Actual merged app manifest not found in manifest task outputs')
          println('CHILLYWOOD_CAMERA_' + variant.toUpperCase() + '_RUNTIME_CLOSURE=' + JsonOutput.toJson([
            variant: variantName, profile: System.getenv('EAS_BUILD_PROFILE'),
            platform: System.getenv('CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM'),
            graph: graphRecord, artifacts: artifacts, manifestTaskPath: manifestTask.get().path, manifests: manifests]))
        }
      }
      }
    }
  }
}`);
      const output = run("./gradlew", [...androidNativeCompileTasks(cameraProjects), "--init-script", initScript,
        "--no-daemon", "--console=plain"], generated,
      { ...platformEnv, CHILLYWOOD_CAMERA_SOURCE_PROJECTS: JSON.stringify(cameraProjects),
        CHILLYWOOD_CAMERA_DEV_LAUNCHER_PROJECT: JSON.stringify(devLauncherProject),
        CHILLYWOOD_CAMERA_GRADLE_ROOT: fs.realpathSync(generated) });
      assert.deepEqual(parseGradleRecord(output, "SOURCE_PROJECTS"), cameraProjects,
        "Both actual camera Gradle source projects must match autolinking");
      receipts.android.sourceProjects = cameraProjects.map(({ name, sourceDir }) => ({ name, sourceDir: path.relative(project, sourceDir) }));
      assert.deepEqual(parseGradleRecord(output, "DEV_LAUNCHER_SOURCE_PROJECT"), devLauncherProject,
        "Compiled development launcher must match the actual patched autolinked source");
      receipts.android.devLauncherSourceProject = { name: devLauncherProject.name, sourceDir: path.relative(project, devLauncherProject.sourceDir) };
      const jars = parseGradleRecord(output, "CLASSPATH");
      assert(Array.isArray(jars) && jars.length > 0, "Use the actual resolved Gradle API classpath for ownership contracts");
      for (const jar of jars) assert(typeof jar === "string" && path.isAbsolute(jar) && fs.existsSync(jar), "Gradle classpath input must exist");
      const classpath = jars.join(path.delimiter);
      const records = parseAndroidRuntimeRecords(output);
      const manifests = readAndroidVariantManifests(records, generated);
      receipts.android.runtimeClosures = {};
      for (const variant of ANDROID_VARIANTS) {
        const { graph, artifacts } = records[variant];
        const runtimePins = verifyRuntimeAars(artifacts);
        verifyRuntimeGraph(graph, runtimePins, manifests[variant].sources, variant);
        receipts.android.runtimeClosures[variant] = { scope: `app-${variant}-runtime-and-merged-manifest`,
          profile: records[variant].profile, runtimePins, graph,
          pinnedAarArtifacts: artifacts.map(({ coordinate, type }) => ({ coordinate, type })), manifests: manifests[variant].receipts };
        saveReceipt();
      }
      assert.deepEqual(Object.keys(receipts.android.runtimeClosures), ANDROID_VARIANTS, "Both runtime closures must pass");
      console.log(run("bash", ["modules/chillywood-camera-effects/android/run-capture-contract-tests.sh"], project,
        { ...platformEnv, CAMERA_EFFECTS_TEST_CLASSPATH: classpath }).trim());
      console.log(run("bash", ["modules/chillywood-camera-effects/android/run-local-inference-math-tests.sh"], project, platformEnv).trim());
      console.log(run("bash", ["modules/chillywood-camera-effects/android/run-math-tests.sh"], project, platformEnv).trim());
      receipts.android.realJarContracts = true;
      receipts.android.mathAndMutationControls = true;
    } else {
      run("xcrun", ["--sdk", "iphonesimulator", "--show-sdk-path"]);
      run("pod", ["install"], generated, platformEnv);
      assert(fs.existsSync(path.join(generated, "Pods/Pods.xcodeproj")), "CocoaPods native project must exist");
      // Ask the installed pod executable itself for its Ruby/gem context. This
      // survives Homebrew wrappers which set GEM_HOME before launching Ruby;
      // plain `ruby` on PATH need not have CocoaPods' xcodeproj gem available.
      fs.writeFileSync(path.join(generated, ".chillywood-cocoapods-runtime-probe.rb"), COCOAPODS_RUNTIME_PROBE);
      const podRuby = parseCocoaPodsRubyContext(run("pod", ["--version"], generated,
        { ...platformEnv, RUBYOPT: "-r./.chillywood-cocoapods-runtime-probe.rb" }));
      assert(fs.existsSync(podRuby.ruby), "CocoaPods Ruby interpreter must already exist");
      receipts.ios.cocoaPodsRuntime = { rubyVersion: podRuby.rubyVersion, xcodeprojVersion: podRuby.xcodeprojVersion };
      console.log(run(podRuby.ruby, [path.join(root, "scripts", "verify-livekit-ios-compatibility.rb"),
        path.join(generated, "Podfile"), path.join(generated, "Pods/Pods.xcodeproj")], generated,
      { ...platformEnv, GEM_HOME: podRuby.gemHome, GEM_PATH: podRuby.gemPath.join(path.delimiter) }).trim());
      const settings = JSON.parse(run("xcodebuild", ["-project", "Pods/Pods.xcodeproj", "-target", "ChillywoodCameraEffects",
        "-configuration", "Debug", "-sdk", "iphonesimulator", "-showBuildSettings", "-json"], generated, platformEnv))
        .find(value => value.target === "ChillywoodCameraEffects")?.buildSettings;
      assert.equal(settings?.CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES, "YES");
      assert.match(settings.OTHER_CFLAGS, /-Wno-non-modular-include-in-framework-module/u);
      assert.equal(settings.CLANG_ENABLE_MODULES, "YES", "Actual compile must retain Clang modules");
      assert.notEqual(settings.GCC_WARN_INHIBIT_ALL_WARNINGS, "YES");
      console.log("iOS: effective Simulator importer settings verified; unrelated diagnostics remain enabled");
      run("xcodebuild", ["-project", "Pods/Pods.xcodeproj", "-target", "ChillywoodCameraEffects", "-configuration", "Debug",
        "-sdk", "iphonesimulator", "-arch", process.arch === "arm64" ? "arm64" : "x86_64",
        "ONLY_ACTIVE_ARCH=YES", "CODE_SIGNING_ALLOWED=NO", "CODE_SIGNING_REQUIRED=NO",
        `SYMROOT=${path.join(workspace, "ios-build")}`, "build"], generated, platformEnv);
    }
    receipts[platform].compiled = true;
    saveReceipt();
    console.log(`${platform}: complete camera module and native dependency compile passed (unsigned, no app/device run)`);
  }
  receipt.status = generateOnly ? "generated-only" : "passed";
  saveReceipt();
  console.log(JSON.stringify(receipt));
  if (generateOnly) console.log("Generated-source checks only; native compilation NOT RUN.");
} catch (error) {
  receipt.status = "failed";
  // Do not persist provider output, personal paths, or an unbounded exception.
  receipt.failure = { name: error.name, message: redact(error.message).slice(0, 1000) };
  saveReceipt();
  throw error;
}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
