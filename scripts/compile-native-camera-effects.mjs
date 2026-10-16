import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ARTIFACTS } from "./test-local-camera-inference-offline.mjs";
import { assertLocalCameraProviderClosure } from "./camera-provider-closure.mjs";

// These records come from the real Gradle task, never a dependency text grep or
// a synthetic fixture. Missing/duplicate output must fail rather than narrow
// the closure that gets reviewed.
export function parseGradleRecord(output, name) {
  const prefix = `CHILLYWOOD_CAMERA_${name}=`;
  const records = output.split(/\r?\n/u).filter(line => line.startsWith(prefix));
  assert.equal(records.length, 1, `Exactly one actual Gradle ${name} record is required`);
  return JSON.parse(records[0].slice(prefix.length));
}

export function verifyRuntimeAars(artifacts) {
  assert(Array.isArray(artifacts) && artifacts.length > 0, "Resolved app runtime artifacts must not be empty");
  for (const artifact of artifacts) {
    assert.equal(typeof artifact.coordinate, "string");
    assert.equal(typeof artifact.file, "string");
    assert(path.isAbsolute(artifact.file), "Gradle artifact paths must be absolute");
    assert(!artifact.coordinate.startsWith("host.exp.exponent:expo.modules.camera:"),
      "Expo Camera must use patched source, never the prebuilt runtime publication");
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
const redact = value => [workspace, root, env.HOME, env.ANDROID_HOME, env.ANDROID_SDK_ROOT, env.JAVA_HOME]
  .filter(Boolean).reduce((text, hostPath) => text.replaceAll(hostPath, "<local-path>"), String(value));

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
  commandReceipt.outputSha256 = createHash("sha256").update(`${result.stdout ?? ""}\n${result.stderr ?? ""}`).digest("hex");
  saveReceipt();
  if (result.error || result.status !== 0) {
    // Inputs are this clean source copy and public dependencies, with no provider
    // credentials in the child environment. Limit CI diagnostics to the tail.
    process.stderr.write(`${result.stdout ?? ""}\n${result.stderr ?? ""}`.slice(-24_000));
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
  for (const relative of ["app.json", "app.config.ts", "package.json", "package-lock.json", "tsconfig.json",
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
    const platformEnv = { CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM: platform, EAS_BUILD_PROFILE: `${platform}-internal-v2` };
    const resolution = JSON.parse(run(process.execPath, ["node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js",
      "resolve", "--platform", platform === "ios" ? "apple" : "android", "--json"], project, platformEnv));
    assert(resolution.modules.some(module => module.packageName === "chillywood-camera-effects"), `${platform}: real module must autolink`);
    const cameraProjects = platform === "android" ? resolveAndroidCameraProjects(resolution, project) : undefined;
    run(process.execPath, ["node_modules/expo/bin/cli", "prebuild", "--platform", platform, "--no-install"], project, platformEnv);
    const generated = path.join(project, platform);
    assert(fs.existsSync(generated), `Expo must generate ${platform} sources`);
    const digest = createHash("sha256");
    for (const file of files(generated).sort()) { digest.update(path.relative(generated, file)); digest.update(fs.readFileSync(file)); }
    receipts[platform] = { generatedSourceSha256: digest.digest("hex"), compiled: false };
    if (platform === "android") {
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
def expectedCameraProjects = new JsonSlurper().parseText(System.getenv('CHILLYWOOD_CAMERA_SOURCE_PROJECTS'))
def expectedCameraRoot = new File(System.getenv('CHILLYWOOD_CAMERA_GRADLE_ROOT')).canonicalFile
gradle.projectsEvaluated {
  // Init scripts also run for included Expo/React Native plugin builds.
  // Only the generated application build may emit the required proof marker.
  if (gradle.rootProject.projectDir.canonicalFile != expectedCameraRoot) return
  expectedCameraProjects.each { expected ->
    def actual = gradle.rootProject.findProject(':' + expected.name)
    if (actual == null) throw new GradleException('Required camera source project missing: ' + expected.name)
    if (actual.projectDir.canonicalFile != new File(expected.sourceDir).canonicalFile) {
      throw new GradleException('Camera source project directory differs from autolinking: ' + expected.name)
    }
    if (actual.tasks.findByName('compileDebugKotlin') == null) {
      throw new GradleException('Required camera Kotlin compile task missing: ' + expected.name)
    }
  }
  println('CHILLYWOOD_CAMERA_SOURCE_PROJECTS=' + JsonOutput.toJson(expectedCameraProjects))
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
      p.tasks.register('cameraEffectsRuntimeClosure') {
        dependsOn p.tasks.named('processDebugMainManifest')
        doLast {
          def artifacts = p.configurations.getByName('debugRuntimeClasspath').resolvedConfiguration.resolvedArtifacts.collect { artifact ->
            def id = artifact.moduleVersion.id
            [coordinate: id.group + ':' + id.name + ':' + id.version, type: artifact.type, file: artifact.file.absolutePath]
          }.sort { a, b -> a.coordinate <=> b.coordinate ?: a.file <=> b.file }
          println('CHILLYWOOD_CAMERA_RUNTIME_ARTIFACTS=' + JsonOutput.toJson(artifacts))
          def manifests = p.tasks.named('processDebugMainManifest').get().outputs.files.asFileTree.files.findAll {
            it.name == 'AndroidManifest.xml'
          }.collect { it.absolutePath }.unique().sort()
          if (manifests.isEmpty()) throw new GradleException('Actual merged app manifest not found in manifest task outputs')
          println('CHILLYWOOD_CAMERA_MERGED_MANIFESTS=' + JsonOutput.toJson(manifests))
        }
      }
    }
  }
}`);
      const output = run("./gradlew", [...cameraProjects.map(({ name }) => `:${name}:compileDebugKotlin`),
        ":chillywood-camera-effects:cameraEffectsCompileClasspath", ":app:cameraEffectsRuntimeClosure", "--init-script", initScript,
        "--no-daemon", "--console=plain"], generated,
      { ...platformEnv, CHILLYWOOD_CAMERA_SOURCE_PROJECTS: JSON.stringify(cameraProjects),
        CHILLYWOOD_CAMERA_GRADLE_ROOT: fs.realpathSync(generated) });
      assert.deepEqual(parseGradleRecord(output, "SOURCE_PROJECTS"), cameraProjects,
        "Both actual camera Gradle source projects must match autolinking");
      receipts.android.sourceProjects = cameraProjects.map(({ name, sourceDir }) => ({ name, sourceDir: path.relative(project, sourceDir) }));
      const jars = parseGradleRecord(output, "CLASSPATH");
      assert(Array.isArray(jars) && jars.length > 0, "Use the actual resolved Gradle API classpath for ownership contracts");
      for (const jar of jars) assert(typeof jar === "string" && path.isAbsolute(jar) && fs.existsSync(jar), "Gradle classpath input must exist");
      const classpath = jars.join(path.delimiter);
      const artifacts = parseGradleRecord(output, "RUNTIME_ARTIFACTS");
      const runtimePins = verifyRuntimeAars(artifacts);
      const manifests = parseGradleRecord(output, "MERGED_MANIFESTS");
      assert(Array.isArray(manifests) && manifests.length > 0, "Actual merged app manifest required");
      const manifestReceipts = [];
      const manifestSources = [];
      for (const manifest of manifests) {
        assert(typeof manifest === "string" && path.isAbsolute(manifest), "Manifest task output must be an absolute path");
        const relative = path.relative(generated, fs.realpathSync(manifest));
        assert(relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), "Manifest must come from this generated project");
        const xml = fs.readFileSync(manifest, "utf8");
        assert.match(xml, /<manifest\b/u, "Actual manifest task output must contain a manifest");
        manifestSources.push(xml);
        manifestReceipts.push({ path: relative, sha256: createHash("sha256").update(xml).digest("hex") });
      }
      assertLocalCameraProviderClosure(artifacts.map(artifact => {
        const [group, name, version, ...extra] = artifact.coordinate.split(":");
        assert.equal(extra.length, 0, "Unexpected resolved Maven coordinate");
        return { group, name, version, sha256: runtimePins.find(pin => pin.coordinate === artifact.coordinate)?.sha256 };
      }), manifestSources, { coordinate: runtimePins[0].coordinate, sha256: runtimePins[0].sha256,
        apiCoordinate: runtimePins[1].coordinate, apiSha256: runtimePins[1].sha256 });
      receipts.android.runtimeClosure = { scope: "app-debug-runtime-and-merged-manifest", runtimePins,
        artifacts: artifacts.map(({ coordinate, type }) => ({ coordinate, type })), manifests: manifestReceipts };
      saveReceipt();
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
