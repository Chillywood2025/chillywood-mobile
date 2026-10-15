import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

// Credential-free native validation only. Never builds/signs the app, publishes
// an OTA, calls EAS, submits to a store, or accepts SDK license prompts.
const options = new Set(process.argv.slice(2));
assert([...options].every(value => ["--android", "--ios", "--generate-only"].includes(value)), "Unknown compile option");
const platforms = options.has("--android") || options.has("--ios")
  ? ["android", "ios"].filter(value => options.has(`--${value}`)) : ["android", "ios"];
const generateOnly = options.has("--generate-only");
if (platforms.includes("ios") && !generateOnly) assert.equal(process.platform, "darwin", "Apple module compilation requires macOS and Xcode");
const root = process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-camera-compile-"));
const project = path.join(temporary, "project");
const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TEMP", "JAVA_HOME", "ANDROID_HOME", "ANDROID_SDK_ROOT",
  "DEVELOPER_DIR", "LANG", "LC_ALL", "GEM_HOME", "GEM_PATH"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { CI: "1", EXPO_NO_DOTENV: "1", EXPO_NO_CLIENT_ENV_VARS: "1", EXPO_NO_TELEMETRY: "1",
  GIT_TERMINAL_PROMPT: "0", COCOAPODS_DISABLE_STATS: "true",
  EXPO_PUBLIC_SUPABASE_URL: "https://ci.invalid", EXPO_PUBLIC_SUPABASE_ANON_KEY: "ci-placeholder-not-a-secret",
  EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST: "ci@example.invalid", EXPO_PUBLIC_BETA_ENVIRONMENT: "closed-beta" });

function run(command, args, cwd = project, extraEnv = {}) {
  const result = spawnSync(command, args, { cwd, env: { ...env, ...extraEnv }, encoding: "utf8",
    timeout: 35 * 60_000, maxBuffer: 64 * 1024 * 1024 });
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

try {
  fs.mkdirSync(project);
  // Config plugins patch pinned node_modules in place. Use real private copies,
  // not symlinks/hardlinks into the checkout or another worker's dependencies.
  for (const relative of ["app.json", "app.config.ts", "package.json", "package-lock.json", "tsconfig.json",
    "expo-env.d.ts", "react-native.config.js", "metro.config.js", "assets", "config", "plugins", "modules", "node_modules"]) {
    const source = path.join(root, relative);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(project, relative), { recursive: true });
  }
  // Firebase's Expo plugin requires config files even for a camera-library
  // compile. These explicit nonfunctional fixtures are ONLY in the disposable
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
  console.log(`Camera module source SHA-256: ${sourceHash.digest("hex")}`);
  const receipts = {};
  for (const platform of platforms) {
    console.log(`Generating isolated ${platform} project with the actual Expo plugins`);
    const platformEnv = { CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM: platform, EAS_BUILD_PROFILE: `${platform}-internal-v2` };
    const resolution = JSON.parse(run(process.execPath, ["node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js",
      "resolve", "--platform", platform === "ios" ? "apple" : "android", "--json"], project, platformEnv));
    assert(resolution.modules.some(module => module.packageName === "chillywood-camera-effects"), `${platform}: real module must autolink`);
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
      const initScript = path.join(temporary, "camera-classpath.gradle");
      fs.writeFileSync(initScript, `allprojects { p ->
  p.afterEvaluate {
    if (p.name == 'chillywood-camera-effects') {
      p.tasks.register('cameraEffectsCompileClasspath') {
        dependsOn p.tasks.named('compileDebugJavaWithJavac')
        doLast {
          def compiler = p.tasks.named('compileDebugJavaWithJavac').get()
          def jars = compiler.classpath.files + p.android.bootClasspath
          println('CHILLYWOOD_CAMERA_CLASSPATH=' + jars.collect { it.absolutePath }.join(File.pathSeparator))
        }
      }
    }
  }
}`);
      const output = run("./gradlew", [":chillywood-camera-effects:compileDebugKotlin",
        ":chillywood-camera-effects:cameraEffectsCompileClasspath", "--init-script", initScript,
        "--no-daemon", "--console=plain"], generated, platformEnv);
      const classpath = output.split(/\r?\n/).find(line => line.startsWith("CHILLYWOOD_CAMERA_CLASSPATH="))?.split("=").slice(1).join("=");
      assert(classpath, "Use the actual resolved Gradle API classpath for ownership contracts");
      console.log(run("bash", ["modules/chillywood-camera-effects/android/run-capture-contract-tests.sh"], project,
        { ...platformEnv, CAMERA_EFFECTS_TEST_CLASSPATH: classpath }).trim());
    } else {
      run("xcrun", ["--sdk", "iphonesimulator", "--show-sdk-path"]);
      run("pod", ["install"], generated, platformEnv);
      assert(fs.existsSync(path.join(generated, "Pods/Pods.xcodeproj")), "CocoaPods native project must exist");
      console.log(run("ruby", [path.join(root, "scripts", "verify-livekit-ios-compatibility.rb"),
        path.join(generated, "Podfile"), path.join(generated, "Pods/Pods.xcodeproj")], generated, platformEnv).trim());
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
        `SYMROOT=${path.join(temporary, "ios-build")}`, "build"], generated, platformEnv);
    }
    receipts[platform].compiled = true;
    console.log(`${platform}: complete camera module and native dependency compile passed (unsigned, no app/device run)`);
  }
  console.log(JSON.stringify({ scope: "camera-module-native-compile", receipts, physicalEvidence: false }));
  if (generateOnly) console.log("Generated-source checks only; native compilation NOT RUN.");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
