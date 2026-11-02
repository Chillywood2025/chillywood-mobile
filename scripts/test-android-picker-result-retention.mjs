import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const patch = require("../plugins/withExpoImagePickerAndroidResultRetention.js").__test;
const root = fileURLToPath(new URL("..", import.meta.url));
const suites = [
  { pkg: "expo-modules-core", name: "expo.modules.kotlin.activityresult.PickerActivityResultRetentionTest", file: "PickerActivityResultRetentionTest.kt", count: 10 },
  { pkg: "expo-image-picker", name: "expo.modules.imagepicker.contracts.ImagePickerContractRetentionTest", file: "ImagePickerContractRetentionTest.kt", count: 4 },
];

export function readSuite(xml, suite) {
  const tag = xml.match(/<testsuite\b[^>]*>/u)?.[0];
  assert(tag, "JUnit report must exist; compiler failures are not test evidence");
  const number = key => Number(tag.match(new RegExp(`\\b${key}="(\\d+)"`, "u"))?.[1]);
  assert.equal(number("tests"), suite.count, "All expected actual-SDK tests must execute");
  assert.equal(number("skipped"), 0, "No native lifecycle test may be skipped");
  assert.equal(number("errors"), 0, "Setup/runtime errors are not expected-negative evidence");
  return number("failures");
}

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, "Exact mutation anchor required");
  return source.replace(before, after);
}

export function runAndroidPickerResultRetention(project) {
  const canonical = fs.realpathSync(project);
  const allowed = fs.realpathSync(path.join(root, "artifacts/native-camera-compile"));
  const relative = path.relative(allowed, canonical);
  assert.match(relative, /^run-[^/\\]+[/\\]project$/u, "Only the disposable native compile project may be mutated");
  const generated = path.join(canonical, "android");
  assert(fs.existsSync(path.join(generated, "gradlew")), "Actual Expo-generated Gradle project required");
  patch.applyRetentionPatch(canonical);
  for (const suite of suites) {
    const target = path.join(canonical, "node_modules", suite.pkg, "android/src/test/java", ...suite.name.split(".").slice(0, -1), suite.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, "tests/native/android-picker", suite.file), target);
  }
  const init = path.join(path.dirname(canonical), "picker-registry-tests.gradle");
  fs.writeFileSync(init, `allprojects { p ->
  if (p.name == 'expo-image-picker') {
    p.afterEvaluate {
      // Test-only versions already pinned by the locked Expo core package.
      p.dependencies.add('testImplementation', 'junit:junit:4.13.2')
      p.dependencies.add('testImplementation', 'org.robolectric:robolectric:4.11.1')
    }
  }
}\n`);
  const runSuite = (suite, expectedFailure = false) => {
    const report = path.join(canonical, "node_modules", suite.pkg, "android/build/test-results/testDebugUnitTest", `TEST-${suite.name}.xml`);
    fs.rmSync(report, { force: true });
    const result = spawnSync("./gradlew", [`:${suite.pkg}:testDebugUnitTest`, "--tests", suite.name, "--init-script", init,
      "--no-daemon", "--console=plain", "--no-build-cache"], { cwd: generated, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, CI: "1" } });
    // Preserve no raw output/provider data as evidence. Missing XML, compile
    // failures, no-tests and skipped suites fail closed, never pass a mutant.
    assert(fs.existsSync(report), `Actual ${suite.name} JUnit report missing (Gradle status ${result.status}); native test did not execute`);
    const xml = fs.readFileSync(report, "utf8");
    const failures = readSuite(xml, suite);
    if (expectedFailure) {
      assert.notEqual(result.status, 0, "A broken production implementation must fail");
      assert(failures > 0, "Negative control must fail assertions in the actual tests");
      assert.match(xml, /<failure\b[^>]*\btype="(?:java\.lang\.AssertionError|org\.junit\.ComparisonFailure)"/u,
        "A mutation must be rejected by test assertions, not unrelated runtime failures");
    } else {
      assert.equal(result.status, 0, `Actual ${suite.name} native tests failed`);
      assert.equal(failures, 0, "Every native lifecycle assertion must pass");
    }
  };
  for (const suite of suites) runSuite(suite);
  const registry = path.join(canonical, "node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/activityresult/AppContextActivityResultRegistry.kt");
  const baseline = fs.readFileSync(registry, "utf8");
  const mutants = [
    ["original-destroy-callback-loss", "callbacksAndContract?.retainCallbackOnHostDestroy == true &&", "callbacksAndContract?.retainCallbackOnHostDestroy == true && false &&"],
    ["missing-exact-key-cleanup", "          releaseRetainedCallback(key)", "          Unit // deliberately broken cleanup"],
    ["unsafe-process-owner-replay", "keyToCallbacksAndContract[key]?.retainCallbackOnHostDestroy == true", "false // deliberately persist owner-bound request"],
  ];
  try {
    for (const [name, before, after] of mutants) {
      fs.writeFileSync(registry, replaceOnce(baseline, before, after));
      runSuite(suites[0], true);
      console.error(`Android picker production-registry negative control rejected: ${name}`);
    }
  } finally { fs.writeFileSync(registry, baseline); }
  // Final clean sources must pass again after all mutation controls.
  for (const suite of suites) runSuite(suite);
  return { productionRegistryTests: suites[0].count, productionContractTests: suites[1].count,
    negativeControls: mutants.map(([name]) => name), physicalDeviceTested: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, "Usage: node scripts/test-android-picker-result-retention.mjs <disposable-native-project>");
  console.log(JSON.stringify(runAndroidPickerResultRetention(process.argv[2])));
}
