import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { compileEnvironment, verifyLock, verifyAutolink, verifyConfig, verifyPodLock, verifyPolicyReport, androidTasks, collectArtifacts, nativeSources, sourceFiles } from "../scripts/compile-native.mjs";
const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const { qualificationConfig } = require("../config.js");

test("compile environment drops provider credentials, descriptors and inherited build injection", () => {
  const env = compileEnvironment({ PATH: "/tools", HOME: "/home/fixture", JAVA_HOME: "/java", ANDROID_HOME: "/android", SCQ_NATIVE_DESCRIPTOR: "private",
    SCQ_PLATFORM: "ios", EXPO_TOKEN: "private", NODE_OPTIONS: "--require=unreviewed", JAVA_TOOL_OPTIONS: "unreviewed", npm_config_registry: "https://unreviewed.invalid", GITHUB_TOKEN: "private" }, "/tmp/fixture");
  assert.equal(env.PATH, "/tools"); assert.equal(env.JAVA_HOME, "/java"); assert.equal(env.ANDROID_HOME, "/android");
  for (const key of ["SCQ_NATIVE_DESCRIPTOR", "SCQ_PLATFORM", "EXPO_TOKEN", "NODE_OPTIONS", "JAVA_TOOL_OPTIONS", "GITHUB_TOKEN"]) assert.equal(env[key], undefined);
  assert.equal(env.npm_config_registry, "https://registry.npmjs.org"); assert.equal(env.EXPO_NO_DOTENV, "1"); assert.equal(env.npm_config_ignore_scripts, "true");
  assert.equal(env.npm_config_userconfig, "/tmp/fixture/empty-user.npmrc"); assert.equal(env.GIT_CONFIG_GLOBAL, "/dev/null");
});

test("locked standalone dependency closure rejects another SDK, private registry or unpinned runtime", () => {
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")); verifyLock(lock);
  for (const change of [v => { v.packages[""].dependencies.expo = "^54.0.0"; }, v => { v.packages["node_modules/react-native-purchases"] = {}; },
    v => { v.packages["node_modules/expo"].resolved = "https://private.invalid/expo.tgz"; }, v => { v.packages["node_modules/expo"].integrity = ""; },
    v => { v.packages["node_modules/chillywood-qualification-native"].resolved = "../main-provider-module"; }]) {
    const altered = structuredClone(lock); change(altered); assert.throws(() => verifyLock(altered));
  }
  const actualFormat = "PODS:\n  - ExpoModulesCore (3.0.30):\n    - hermes-engine\n  - RevenueCat (5.96.1)\n";
  verifyPodLock(actualFormat); assert.throws(() => verifyPodLock(actualFormat.replace("5.96.1", "5.95.0")));
});

test("actual source autolink rejects aliases, duplicates, prebuilt substitution and main-app bridges", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "scq-autolink-"));
  try {
    for (const platform of ["android", "ios"]) {
      const source = path.join(temporary, "modules/qualification-native", platform); fs.mkdirSync(source, { recursive: true });
      const own = platform === "android" ? { packageName: "chillywood-qualification-native", projects: [{ name: "chillywood-qualification-native", sourceDir: source, modules: ["expo.modules.chillywoodqualification.ChillywoodQualificationModule"] }] }
        : { packageName: "chillywood-qualification-native", debugOnly: false, pods: [{ podName: "ChillywoodQualification", podspecDir: source }], modules: ["ChillywoodQualificationModule"] };
      verifyAutolink({ modules: [own] }, temporary, platform);
      assert.throws(() => verifyAutolink({ modules: [own, own] }, temporary, platform));
      assert.throws(() => verifyAutolink({ modules: [own, { packageName: "chillywood-test-store-admission" }] }, temporary, platform));
      const bad = structuredClone(own); if (platform === "android") bad.projects[0].publication = {}; else bad.debugOnly = true;
      assert.throws(() => verifyAutolink({ modules: [bad] }, temporary, platform));
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test("both generated profiles require empty provider configuration and isolated identity with OTA disabled", () => {
  for (const platform of ["ios", "android"]) {
    const config = qualificationConfig({ SCQ_PLATFORM: platform }); verifyConfig(config, platform);
    const loaded = structuredClone(config); delete loaded.plugins; verifyConfig(loaded, platform, { expoLoaded: true });
    assert.throws(() => verifyConfig(loaded, platform));
    for (const mutate of [v => { v.ios.infoPlist.SCQQualificationConfiguration = { publicSdkKey: "unexpected" }; }, v => { v.android.package = "com.chillywood.mobile"; },
      v => { v.updates.enabled = true; }, v => { v.extra.economicProjectionAllowed = true; }, v => { v.plugins[0][1].nativeConfig = {}; }]) {
      const altered = structuredClone(config); mutate(altered); assert.throws(() => verifyConfig(altered, platform));
    }
  }
});

test("compile proof requires every Android Debug/Release and actual iOS module artifact", () => {
  assert.equal(nativeSources.length, 6); assert(sourceFiles.includes("scripts/compile-native.mjs"));
  assert.deepEqual(androidTasks(), [":chillywood-qualification-native:compileDebugKotlin", ":chillywood-qualification-native:compileDebugJavaWithJavac",
    ":chillywood-qualification-native:compileReleaseKotlin", ":chillywood-qualification-native:compileReleaseJavaWithJavac"]);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "scq-artifacts-")), project = path.join(temporary, "project");
  const paths = [];
  for (const variant of ["debug", "release"]) {
    for (const name of ["ChillywoodQualificationModule", "QualificationContract"]) paths.push(`project/modules/qualification-native/android/build/tmp/kotlin-classes/${variant}/expo/modules/chillywoodqualification/${name}.class`);
    paths.push(`project/modules/qualification-native/android/build/intermediates/javac/${variant}/compile${variant[0].toUpperCase() + variant.slice(1)}JavaWithJavac/classes/expo/modules/chillywoodqualification/QualificationPolicy.class`);
  }
  for (const name of ["ChillywoodQualificationModule", "QualificationContract", "QualificationPolicy"]) paths.push(`ios-objects/Pods.build/Debug-iphonesimulator/ChillywoodQualification.build/Objects-normal/${process.arch === "arm64" ? "arm64" : "x86_64"}/${name}.o`);
  paths.push("ios-products/Debug-iphonesimulator/ChillywoodQualification/libChillywoodQualification.a");
  try {
    assert.throws(() => collectArtifacts(project, temporary));
    for (const relative of paths) { const file = path.join(temporary, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "fixture artifact, not actual compile evidence"); }
    assert.equal(Object.keys(collectArtifacts(project, temporary)).length, 10);
    for (const relative of paths) { const file = path.join(temporary, relative); fs.unlinkSync(file); assert.throws(() => collectArtifacts(project, temporary)); fs.writeFileSync(file, "fixture"); }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test("native policy proof rejects skipped/partial reports and CLI cannot select a configured or skipped compile", () => {
  const output = "ok 1 - compiled Java durable policy fixture\nok 2 - compiled Swift debug fixture\nok 3 - compiled Swift release fixture\n# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
  assert.equal(verifyPolicyReport(output).nativeExecutables, 3);
  for (const bad of [output.replace("# skipped 0", "# skipped 1"), output.replace("# pass 3", "# pass 2"), output.replace("ok 3 -", "not ok 3 -"), output + output]) assert.throws(() => verifyPolicyReport(bad));
  const rejected = spawnSync(process.execPath, [path.join(root, "scripts/compile-native.mjs"), "--generate-only"], { encoding: "utf8", env: { PATH: process.env.PATH }, timeout: 10000 });
  assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /No flags or configured-build override/u);
});
