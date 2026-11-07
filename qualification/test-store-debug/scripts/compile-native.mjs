import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const applicationId = "com.chillywood.qualification.teststore";
const moduleRoot = "modules/qualification-native";
const androidSources = ["ChillywoodQualificationModule.kt", "QualificationContract.kt", "QualificationPolicy.java"];
const iosSources = ["ChillywoodQualificationModule.swift", "QualificationContract.swift", "QualificationPolicy.swift"];
export const nativeSources = [...androidSources.map(name => `${moduleRoot}/android/src/main/java/expo/modules/chillywoodqualification/${name}`),
  ...iosSources.map(name => `${moduleRoot}/ios/${name}`)];
export const sourceFiles = ["App.js", "index.js", "native.js", "app.config.js", "config.js", "package.json", "package-lock.json", "README.md",
  "plugins/withQualification.js", `${moduleRoot}/index.js`, `${moduleRoot}/package.json`, `${moduleRoot}/expo-module.config.json`,
  `${moduleRoot}/android/build.gradle`, `${moduleRoot}/ios/ChillywoodQualification.podspec`, ...nativeSources,
  "scripts/compile-native.mjs", "tests/client.test.mjs", "tests/mounted.test.mjs", "tests/policy.native.mjs", "tests/compile-contract.test.mjs"];
const sha = value => createHash("sha256").update(value).digest("hex");
const hash = file => sha(fs.readFileSync(file));
const exists = file => fs.existsSync(file) && fs.statSync(file).isFile();

export function compileEnvironment(inherited, scratch) {
  const result = Object.fromEntries(["PATH", "HOME", "JAVA_HOME", "ANDROID_HOME", "ANDROID_SDK_ROOT", "DEVELOPER_DIR", "LANG", "LC_ALL", "GEM_HOME", "GEM_PATH"]
    .filter(key => typeof inherited[key] === "string" && inherited[key]).map(key => [key, inherited[key]]));
  return { ...result, CI: "1", EXPO_NO_DOTENV: "1", EXPO_NO_CLIENT_ENV_VARS: "1", EXPO_NO_TELEMETRY: "1", COCOAPODS_DISABLE_STATS: "true",
    GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", TMPDIR: scratch, TMP: scratch, TEMP: scratch,
    npm_config_userconfig: path.join(scratch, "empty-user.npmrc"), npm_config_globalconfig: path.join(scratch, "empty-global.npmrc"),
    npm_config_registry: "https://registry.npmjs.org", npm_config_ignore_scripts: "true" };
}

export function verifyLock(lock) {
  const expected = { expo: "54.0.37", "expo-modules-core": "3.0.30", react: "19.1.0", "react-native": "0.81.5", "chillywood-qualification-native": "file:modules/qualification-native" };
  assert.equal(lock.lockfileVersion, 3); assert.deepEqual(lock.packages?.[""]?.dependencies, expected);
  for (const [name, item] of Object.entries(lock.packages)) {
    assert(!/react-native-purchases|supabase|chillywood-test-store-admission/u.test(name), "Main-app economic or identity integrations are forbidden");
    if (!item.resolved) continue;
    if (item.link) assert.equal(item.resolved, "modules/qualification-native");
    else { const url = new URL(item.resolved); assert.equal(url.protocol, "https:"); assert.equal(url.hostname, "registry.npmjs.org"); assert(!url.username && !url.password); assert.match(item.integrity, /^sha512-/u); }
  }
}

export function verifyAutolink(resolution, project, platform) {
  assert(["ios", "android"].includes(platform));
  const own = resolution?.modules?.filter(row => row.packageName === "chillywood-qualification-native") ?? [];
  assert.equal(own.length, 1, "Exactly one standalone source module must autolink");
  assert(!resolution.modules.some(row => /test-store-admission|purchases|supabase/u.test(row.packageName)), "Main-app provider bridge may not autolink");
  const expected = fs.realpathSync(path.join(project, moduleRoot, platform === "ios" ? "ios" : "android"));
  if (platform === "android") {
    assert.equal(own[0].projects?.length, 1); const row = own[0].projects[0];
    assert.equal(row.name, "chillywood-qualification-native"); assert(!row.publication);
    assert.equal(fs.realpathSync(row.sourceDir), expected);
    assert.deepEqual(row.modules, ["expo.modules.chillywoodqualification.ChillywoodQualificationModule"]);
  } else {
    assert.equal(own[0].debugOnly, false, "Release must retain its native denial gate");
    assert.deepEqual(own[0].modules, ["ChillywoodQualificationModule"]); assert.equal(own[0].pods?.length, 1);
    assert.equal(own[0].pods[0].podName, "ChillywoodQualification"); assert.equal(fs.realpathSync(own[0].pods[0].podspecDir), expected);
  }
}

export function verifyConfig(config, platform, { expoLoaded = false } = {}) {
  assert(["ios", "android"].includes(platform));
  assert.equal(config.ios?.bundleIdentifier, applicationId); assert.equal(config.android?.package, applicationId);
  assert.equal(config.updates?.enabled, false); assert.equal(config.android?.allowBackup, false);
  assert.deepEqual(config.ios?.infoPlist?.SCQQualificationConfiguration, {});
  assert.deepEqual(config.ios?.associatedDomains, []);
  assert.equal(config.ios?.runtimeVersion, "scq-v1-ios"); assert.equal(config.android?.runtimeVersion, "scq-v1-android");
  assert.deepEqual(config.extra, { qualificationOnly: true, economicProjectionAllowed: false });
  if (expoLoaded) assert.equal(config.plugins, undefined, "Expo removes plugins after resolving the dynamic config");
  else { assert.equal(config.plugins?.length, 1); assert.deepEqual(config.plugins[0], ["./plugins/withQualification", { nativeConfig: null }]); }
}

export function verifyPodLock(lock) {
  assert.match(lock, /^  - RevenueCat \(5\.96\.1\):?$/mu);
  assert.match(lock, /^  - ExpoModulesCore \(3\.0\.30\):?$/mu);
}

export function verifyPolicyReport(output) {
  for (const [name, number] of [["tests", 3], ["pass", 3], ["fail", 0], ["cancelled", 0], ["skipped", 0], ["todo", 0]]) {
    const rows = [...output.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gmu"))]; assert.equal(rows.length, 1); assert.equal(Number(rows[0][1]), number);
  }
  assert.match(output, /^ok 1 - compiled Java durable policy /mu);
  assert.match(output, /^ok 2 - compiled Swift debug /mu); assert.match(output, /^ok 3 - compiled Swift release /mu);
  return { groups: 3, nativeExecutables: 3, skipped: 0, failed: 0 };
}

export function androidTasks() {
  return ["Debug", "Release"].flatMap(variant => [`:chillywood-qualification-native:compile${variant}Kotlin`, `:chillywood-qualification-native:compile${variant}JavaWithJavac`]);
}
export function collectArtifacts(project, workspace) {
  const artifacts = {};
  for (const variant of ["debug", "release"]) {
    for (const name of ["ChillywoodQualificationModule", "QualificationContract"]) {
      const relative = `${moduleRoot}/android/build/tmp/kotlin-classes/${variant}/expo/modules/chillywoodqualification/${name}.class`;
      assert(exists(path.join(project, relative)), "Actual Kotlin module/contract artifact required"); artifacts[`project/${relative}`] = hash(path.join(project, relative));
    }
    const relative = `${moduleRoot}/android/build/intermediates/javac/${variant}/compile${variant[0].toUpperCase() + variant.slice(1)}JavaWithJavac/classes/expo/modules/chillywoodqualification/QualificationPolicy.class`;
    assert(exists(path.join(project, relative)), "Actual Java policy artifact required"); artifacts[`project/${relative}`] = hash(path.join(project, relative));
  }
  for (const name of ["ChillywoodQualificationModule", "QualificationContract", "QualificationPolicy"]) {
    const relative = `ios-objects/Pods.build/Debug-iphonesimulator/ChillywoodQualification.build/Objects-normal/${process.arch === "arm64" ? "arm64" : "x86_64"}/${name}.o`;
    assert(exists(path.join(workspace, relative)), "Actual Swift object artifact required"); artifacts[relative] = hash(path.join(workspace, relative));
  }
  const library = "ios-products/Debug-iphonesimulator/ChillywoodQualification/libChillywoodQualification.a";
  assert(exists(path.join(workspace, library)), "Actual compiled Expo module library required"); artifacts[library] = hash(path.join(workspace, library));
  return artifacts;
}

async function stopGroup(pid) {
  if (!pid) return;
  const signal = kind => { try { process.kill(-pid, kind); return true; } catch (error) { if (error.code === "ESRCH") return false; throw error; } };
  if (!signal("SIGTERM")) return;
  const limit = Date.now() + 5000;
  while (Date.now() < limit) { await new Promise(resolve => setTimeout(resolve, 50)); if (!signal(0)) return; }
  signal("SIGKILL");
  for (let i = 0; i < 40; i++) { await new Promise(resolve => setTimeout(resolve, 50)); if (!signal(0)) return; }
  throw new Error("Owned compiler process group did not terminate");
}

export async function main() {
  assert.equal(process.argv.length, 2, "No flags or configured-build override is supported");
  assert.equal(process.platform, "darwin", "Both actual native platforms require macOS with Xcode");
  const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const root = path.resolve(source, "../..");
  const evidence = path.join(root, "artifacts/qualification-native"); fs.mkdirSync(evidence, { recursive: true });
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-scq-ci-"));
  const project = path.join(workspace, "project"), scratch = path.join(workspace, "scratch"); fs.mkdirSync(project); fs.mkdirSync(scratch);
  const env = compileEnvironment(process.env, scratch);
  fs.writeFileSync(env.npm_config_userconfig, ""); fs.writeFileSync(env.npm_config_globalconfig, "");
  const report = { protocol: "test-store-qualification-native-compile-v1", status: "running", startedAt: new Date().toISOString(),
    appIdentity: applicationId, providerConfigurationPresent: false, providerSdkInvoked: false, installed: false, signed: false,
    sourceHashes: {}, commands: [], cleanup: { complete: false } };
  const save = () => fs.writeFileSync(path.join(evidence, "receipt.json"), JSON.stringify(report, null, 2) + "\n");
  const redact = text => [workspace, root, env.HOME, env.JAVA_HOME, env.ANDROID_HOME, env.ANDROID_SDK_ROOT].filter(Boolean)
    .reduce((value, name) => value.replaceAll(name, "<local-path>"), text);
  let currentChild, interrupted = false;
  const signalHandler = () => { interrupted = true; if (currentChild?.pid) void stopGroup(currentChild.pid).catch(() => { /* Finally checks cleanup. */ }); };
  process.on("SIGTERM", signalHandler); process.on("SIGINT", signalHandler);
  async function run(command, args, cwd = project, extraEnv = {}) {
    assert(!interrupted, "Native compilation was interrupted");
    const item = { command: path.basename(command), args: args.map(redact), passed: false }; report.commands.push(item); save();
    console.log(`Qualification native: ${item.command} ${item.args.join(" ")}`);
    const result = await new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, env: { ...env, ...extraEnv }, detached: true, stdio: ["ignore", "pipe", "pipe"] }); currentChild = child;
      let output = "", stdout = "", error = null;
      const append = (data, isStdout) => { output += data.toString(); if (isStdout) stdout += data.toString();
        if (Buffer.byteLength(output) > 64 * 1024 * 1024) { error = "Compiler output exceeded bound"; signalHandler(); } };
      child.stdout.on("data", data => append(data, true)); child.stderr.on("data", data => append(data, false));
      const timeout = setTimeout(() => { error = "Compiler command exceeded 35 minute bound"; signalHandler(); }, 35 * 60_000);
      child.on("error", failure => { error = failure.message; });
      child.on("close", async code => {
        clearTimeout(timeout);
        try { await stopGroup(child.pid); currentChild = null; resolve({ code, output, stdout, error: error ?? (interrupted ? "Native compilation was interrupted" : null) }); } catch (failure) { reject(failure); }
      });
    });
    item.exitCode = result.code; item.outputSha256 = sha(result.output); item.passed = !result.error && result.code === 0;
    const log = redact(result.output); item.log = `command-${String(report.commands.length).padStart(2, "0")}.log`; item.logSha256 = sha(log);
    fs.writeFileSync(path.join(evidence, item.log), log); save();
    if (!item.passed) { process.stderr.write(log.slice(-16000)); throw new Error(result.error ?? `Native command failed (${result.code})`); }
    return result.stdout;
  }
  try {
    assert(env.JAVA_HOME && exists(path.join(env.JAVA_HOME, "bin/javac")), "Runner must supply Java; no toolchain installation is attempted");
    assert(env.ANDROID_HOME || env.ANDROID_SDK_ROOT, "Runner must supply Android SDK; no license prompts are accepted");
    for (const name of sourceFiles) { const from = path.join(source, name); assert(fs.lstatSync(from).isFile(), "Only explicit regular source files may be copied");
      const to = path.join(project, name); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); report.sourceHashes[name] = hash(from); }
    verifyLock(JSON.parse(fs.readFileSync(path.join(project, "package-lock.json"), "utf8")));
    await run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
    const policy = await run(process.execPath, ["--test", "--test-reporter=tap", "tests/policy.native.mjs"], project, { TEST_STORE_JAVA_HOME: env.JAVA_HOME });
    report.nativePolicy = verifyPolicyReport(policy);
    report.autolinkHashes = {}; report.generatedHashes = {};
    for (const platform of ["android", "ios"]) {
      const platformEnv = { SCQ_PLATFORM: platform };
      const configOutput = await run(process.execPath, ["-e", "process.stdout.write(JSON.stringify({raw:require('./config').qualificationConfig(process.env),loaded:require('@expo/config').getConfig(process.cwd(),{skipPlugins:true}).exp}))"], project, platformEnv);
      const configurations = JSON.parse(configOutput); verifyConfig(configurations.raw, platform); verifyConfig(configurations.loaded, platform, { expoLoaded: true });
      const linked = await run(process.execPath, ["node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js", "resolve", "--platform", platform === "ios" ? "apple" : "android", "--json"], project, platformEnv);
      verifyAutolink(JSON.parse(linked), project, platform); report.autolinkHashes[platform] = sha(linked);
      await run(process.execPath, ["node_modules/expo/bin/cli", "prebuild", "--platform", platform, "--no-install"], project, platformEnv);
    }
    const manifestPath = "android/app/src/main/AndroidManifest.xml", manifest = fs.readFileSync(path.join(project, manifestPath), "utf8");
    assert.match(manifest, /android:name="SCQ_QUALIFICATION_CONFIG" android:value="\{\}"/u);
    assert.match(manifest, /android:allowBackup="false"/u); assert.match(manifest, /android:fullBackupContent="false"/u); assert.doesNotMatch(manifest, /android:sharedUserId|SCV[12]/u);
    const gradle = fs.readFileSync(path.join(project, "android/app/build.gradle"), "utf8"); assert(gradle.includes(`applicationId '${applicationId}'`) || gradle.includes(`applicationId "${applicationId}"`));
    const appDirs = fs.readdirSync(path.join(project, "ios")).filter(name => exists(path.join(project, "ios", name, "Info.plist"))); assert.equal(appDirs.length, 1);
    const app = `ios/${appDirs[0]}`;
    const projectFiles = fs.readdirSync(path.join(project, "ios")).filter(name => name.endsWith(".xcodeproj")); assert.equal(projectFiles.length, 1);
    const pbxPath = `ios/${projectFiles[0]}/project.pbxproj`, pbx = fs.readFileSync(path.join(project, pbxPath), "utf8");
    const bundleIds = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;/gu)].map(match => match[1]);
    assert(bundleIds.length >= 2 && bundleIds.every(id => id === applicationId), "Every generated iOS configuration must use the standalone identity");
    const plist = async name => JSON.parse(await run("/usr/bin/plutil", ["-convert", "json", "-o", "-", path.join(project, name)]));
    const info = await plist(`${app}/Info.plist`); assert.deepEqual(info.SCQQualificationConfiguration, {}); assert(!("SCV1TestStoreConfiguration" in info) && !("SCV2TestStoreConfiguration" in info));
    const updates = await plist(`${app}/Supporting/Expo.plist`); assert.equal(updates.EXUpdatesEnabled, false);
    const entitlement = `${app}/${appDirs[0]}.entitlements`; assert.deepEqual(await plist(entitlement), {});
    for (const name of [manifestPath, "android/app/build.gradle", pbxPath, `${app}/Info.plist`, `${app}/Supporting/Expo.plist`, entitlement]) report.generatedHashes[name] = hash(path.join(project, name));
    await run(path.join(project, "android/gradlew"), [...androidTasks(), "--no-daemon", "--max-workers=2", "-Pkotlin.compiler.execution.strategy=in-process"], path.join(project, "android"));
    await run("pod", ["install", "--repo-update"], path.join(project, "ios"));
    const lock = fs.readFileSync(path.join(project, "ios/Podfile.lock"), "utf8"); verifyPodLock(lock);
    report.generatedHashes["ios/Podfile.lock"] = hash(path.join(project, "ios/Podfile.lock"));
    const targets = JSON.parse(await run("xcodebuild", ["-list", "-json", "-project", "Pods/Pods.xcodeproj"], path.join(project, "ios")));
    assert.equal(targets.project.targets.filter(value => value === "ChillywoodQualification").length, 1);
    await run("xcodebuild", ["-project", "Pods/Pods.xcodeproj", "-target", "ChillywoodQualification", "-configuration", "Debug", "-sdk", "iphonesimulator",
      "-arch", process.arch === "arm64" ? "arm64" : "x86_64", "ONLY_ACTIVE_ARCH=YES", "CODE_SIGNING_ALLOWED=NO", "CODE_SIGNING_REQUIRED=NO",
      `SYMROOT=${path.join(workspace, "ios-products")}`, `OBJROOT=${path.join(workspace, "ios-objects")}`, "build"], path.join(project, "ios"));
    report.artifactHashes = collectArtifacts(project, workspace);
    for (const name of nativeSources) assert.equal(hash(path.join(project, name)), report.sourceHashes[name], "Compiled native sources changed during validation");
    report.status = "passed";
  } catch (error) { report.status = "failed"; report.error = redact(String(error?.message ?? error)); throw error; }
  finally {
    try { await stopGroup(currentChild?.pid); currentChild = null; fs.rmSync(workspace, { recursive: true, force: true }); report.cleanup.complete = !fs.existsSync(workspace); }
    catch (error) { report.status = "failed"; report.cleanup.error = redact(String(error?.message ?? error)); }
    process.removeListener("SIGTERM", signalHandler); process.removeListener("SIGINT", signalHandler);
    report.completedAt = new Date().toISOString(); save();
  }
  assert.equal(report.status, "passed"); assert.equal(report.cleanup.complete, true);
  console.log("Standalone qualification native compilation passed; evidence: artifacts/qualification-native/receipt.json");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
