import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { parse } from "yaml";
import { computeValidationPlan } from "../../scripts/ci/required-validation.mjs";
import { requireTestStoreV3Sources, parseTestStoreV3NativePolicyReport, prepareExpoCryptoSourceCompile, prebuildBeforeExpoCryptoSourceCompile, withNormalPrebuildPackageForChecks,
  resolveExpoCryptoSourceProject, expoCryptoCompileTasks, verifyExpoCryptoRuntimeGraph,
  collectPaidVideoAndroidArtifacts, collectPaidVideoIosArtifacts } from "../../scripts/ci/paid-video-native-closure.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const write = (root, name, content) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; };
const fixture = t => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "paid-video-native-ci-")); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; };

test("V3 requires every coexisting native bridge and exact regular source files", t => {
  const temporary = fixture(t), moduleRoot = path.join(temporary, "modules/chillywood-test-store-admission");
  fs.cpSync(path.join(root, "modules/chillywood-test-store-admission"), moduleRoot, { recursive: true });
  for (const platform of ["android", "ios"]) {
    const sourceDir = path.join(moduleRoot, platform), prefix = platform === "android" ? "expo.modules.chillywoodteststore." : "";
    const classes = ["ChillywoodTestStoreAdmissionModule", "ChillywoodTestStoreV2Module", "ChillywoodTestStoreV3Module"].map(name => prefix + name);
    const module = { packageName: "chillywood-test-store-admission", ...(platform === "android"
      ? { projects: [{ modules: classes }] } : { modules: classes }) };
    const resolution = { modules: [module] }, project = { sourceDir };
    assert.equal(requireTestStoreV3Sources(resolution, temporary, platform, project).length, 3);
    for (let i = 0; i < classes.length; i++) {
      const removed = classes.splice(i, 1)[0]; assert.throws(() => requireTestStoreV3Sources(resolution, temporary, platform, project)); classes.splice(i, 0, removed);
    }
    classes.push(classes[2]); assert.throws(() => requireTestStoreV3Sources(resolution, temporary, platform, project)); classes.pop();
    assert.throws(() => requireTestStoreV3Sources({ modules: [module, module] }, temporary, platform, project));
    assert.throws(() => requireTestStoreV3Sources(resolution, temporary, platform, { sourceDir: root }));
    const name = platform === "android" ? "src/main/java/expo/modules/chillywoodteststore/TestStoreV3Contract.kt" : "TestStoreV3Contract.swift";
    fs.unlinkSync(path.join(sourceDir, name)); assert.throws(() => requireTestStoreV3Sources(resolution, temporary, platform, project));
  }
});

const completeReport = "ok 10 - compiled v3 ownership retires after any uncertain persistence and preserves original asset identity\n# tests 10\n# pass 10\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
test("portable-only, skipped, duplicated and failed V3 lifecycle reports cannot pass", () => {
  assert.deepEqual(parseTestStoreV3NativePolicyReport(completeReport), { groups: 10, nativeExecutables: 3, failures: 0, skipped: 0, providerSdkInvoked: false });
  for (const invalid of [completeReport.replace("# tests 10", "# tests 9"), completeReport.replace("# pass 10", "# pass 9"),
    completeReport.replace("# skipped 0", "# skipped 1"), completeReport.replace("# fail 0", "# fail 1"),
    completeReport.replace("# cancelled 0", "# cancelled 1"), completeReport.replace("# todo 0", "# todo 1"),
    completeReport.replace("ok 10 -", "not ok 10 -"), completeReport + completeReport]) assert.throws(() => parseTestStoreV3NativePolicyReport(invalid));
});

function cryptoFixture(t) {
  const temporary = fixture(t), version = "15.0.9";
  const pkg = { dependencies: { "expo-crypto": version }, expo: { autolinking: { android: { buildFromSource: ["^expo-camera$", "^expo-image-picker$"] } } } };
  const pin = { version, resolved: `https://registry.npmjs.org/expo-crypto/-/expo-crypto-${version}.tgz`, integrity: "sha512-Zml4dHVyZQ==" };
  const lock = { packages: { "": { dependencies: { "expo-crypto": version } }, "node_modules/expo-crypto": pin } };
  write(temporary, "package.json", JSON.stringify(pkg)); write(temporary, "package-lock.json", JSON.stringify(lock));
  write(temporary, "node_modules/expo-crypto/package.json", JSON.stringify({ name: "expo-crypto", version }));
  write(temporary, "node_modules/expo-crypto/android/src/main/java/expo/modules/crypto/CryptoModule.kt", "// fixture source\n");
  write(temporary, "node_modules/expo-crypto/ios/CryptoModule.swift", "// fixture source\n");
  return { temporary, pkg, lock };
}

test("both normal prebuilds precede the disposable Crypto override and preserve the real picker guard", t => {
  const { temporary } = cryptoFixture(t), order = [];
  const picker = createRequire(import.meta.url)(path.join(root, "plugins/withExpoImagePickerAndroidResultRetention.js")).__test;
  const receipt = prebuildBeforeExpoCryptoSourceCompile(temporary, ["android", "ios"], platform => {
    // Use the actual product guard; a copied/reimplemented permissive guard
    // would miss the exact regression that stopped the real Expo prebuild.
    picker.assertSourceBuildConfigured(temporary); order.push(platform);
    fs.mkdirSync(path.join(temporary, platform));
  });
  assert.deepEqual(order, ["android", "ios"]); assert.equal(receipt.overrideAppliedAfterAllPrebuilds, true);
  assert.deepEqual(receipt.prebuilds.map(value => value.platform), order);
  assert.equal(receipt.prebuilds[1].packageAfterSha256, receipt.packageSourceSha256);
  assert.throws(() => picker.assertSourceBuildConfigured(temporary), /reviewed Android buildFromSource patterns required/u,
    "The compiler override must remain inadmissible to normal product prebuild");
  let called = false;
  assert.throws(() => prebuildBeforeExpoCryptoSourceCompile(temporary, ["ios"], () => { called = true; }), /normal package/u);
  assert.equal(called, false);
  const source = fs.readFileSync(path.join(root, "scripts/compile-native-camera-effects.mjs"), "utf8");
  const prepare = source.indexOf("receipt.expoCryptoSourceCompile = prebuildBeforeExpoCryptoSourceCompile(project, platforms,");
  const resolve = source.indexOf("const resolution = JSON.parse(run(", prepare);
  assert(prepare >= 0 && resolve > prepare, "Actual runner must freshly resolve autolinking after normal prebuilds and override");
});

test("failed, incomplete or config-mutating prebuild cannot reach the Crypto source override", t => {
  for (const mode of ["failed", "missing-directory", "changed-patterns"]) {
    const { temporary } = cryptoFixture(t);
    assert.throws(() => prebuildBeforeExpoCryptoSourceCompile(temporary, ["android", "ios"], platform => {
      if (mode === "failed") throw Error("actual prebuild failed");
      if (mode === "missing-directory") return;
      const pkg = JSON.parse(fs.readFileSync(path.join(temporary, "package.json")));
      pkg.expo.autolinking.android.buildFromSource.push("^unreviewed$");
      write(temporary, "package.json", JSON.stringify(pkg)); fs.mkdirSync(path.join(temporary, platform));
    }));
    assert(!JSON.parse(fs.readFileSync(path.join(temporary, "package.json"))).expo.autolinking.android.buildFromSource.includes("^expo-crypto$"));
  }
});

test("postcompile picker checks use the exact normal package and restore compiler bytes on failure", t => {
  const { temporary } = cryptoFixture(t), filename = path.join(temporary, "package.json"), normal = fs.readFileSync(filename);
  const picker = createRequire(import.meta.url)(path.join(root, "plugins/withExpoImagePickerAndroidResultRetention.js")).__test;
  const receipt = prepareExpoCryptoSourceCompile(temporary), compiled = fs.readFileSync(filename);
  assert.equal(withNormalPrebuildPackageForChecks(temporary, normal, receipt, () => { picker.assertSourceBuildConfigured(temporary); return "passed"; }), "passed");
  assert.deepEqual(fs.readFileSync(filename), compiled);
  assert.throws(() => withNormalPrebuildPackageForChecks(temporary, normal, receipt, () => { picker.assertSourceBuildConfigured(temporary); throw Error("actual check failed"); }), /actual check failed/u);
  assert.deepEqual(fs.readFileSync(filename), compiled);
  let called = false;
  assert.throws(() => withNormalPrebuildPackageForChecks(temporary, Buffer.from("wrong package"), receipt, () => { called = true; }));
  assert.equal(called, false);
  assert.throws(() => withNormalPrebuildPackageForChecks(temporary, normal, receipt, () => { fs.writeFileSync(filename, "changed"); }), /must not change/u);
  assert.deepEqual(fs.readFileSync(filename), compiled);
  assert.throws(() => withNormalPrebuildPackageForChecks(temporary, normal, receipt, () => { fs.unlinkSync(filename); }), /ENOENT/u);
  assert.deepEqual(fs.readFileSync(filename), compiled);
  assert.throws(() => picker.assertSourceBuildConfigured(temporary), /reviewed Android buildFromSource patterns required/u);
});

test("Crypto source override is confined to the disposable package and rejects lock or installation drift", t => {
  const { temporary, lock } = cryptoFixture(t), originalLock = fs.readFileSync(path.join(temporary, "package-lock.json"));
  const receipt = prepareExpoCryptoSourceCompile(temporary);
  assert.equal(receipt.version, "15.0.9"); assert.equal(receipt.signedArtifactEquivalent, false);
  assert.equal(receipt.sourceFiles.length, 2);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(temporary, "package.json"))).expo.autolinking.android.buildFromSource,
    ["^expo-camera$", "^expo-image-picker$", "^expo-crypto$"]);
  assert.deepEqual(fs.readFileSync(path.join(temporary, "package-lock.json")), originalLock);
  lock.packages["node_modules/expo-crypto"].version = "15.0.10";
  write(temporary, "package-lock.json", JSON.stringify(lock)); assert.throws(() => prepareExpoCryptoSourceCompile(temporary));
  write(temporary, "package-lock.json", originalLock);
  write(temporary, "node_modules/expo-crypto/package.json", JSON.stringify({ name: "expo-crypto", version: "15.0.8" }));
  assert.throws(() => prepareExpoCryptoSourceCompile(temporary));
  write(temporary, "node_modules/expo-crypto/package.json", JSON.stringify({ name: "expo-crypto", version: "15.0.9" }));
  write(temporary, "node_modules/expo-crypto/android/build/stale.class", "old artifact");
  assert.throws(() => prepareExpoCryptoSourceCompile(temporary), /stale Android compile outputs/u);
});

test("actual Crypto source resolution and both runtime variants reject prebuilt, duplicate or foreign projects", t => {
  const { temporary } = cryptoFixture(t);
  const android = { modules: [{ packageName: "expo-crypto", packageVersion: "15.0.9", projects: [{ name: "expo-crypto",
    sourceDir: path.join(temporary, "node_modules/expo-crypto/android"), modules: ["expo.modules.crypto.CryptoModule"], publication: {} }] }],
  configuration: { buildFromSource: ["^expo-crypto$"] } };
  const ios = { modules: [{ packageName: "expo-crypto", packageVersion: "15.0.9", modules: ["CryptoModule"],
    pods: [{ podName: "ExpoCrypto", podspecDir: path.join(temporary, "node_modules/expo-crypto/ios") }] }] };
  assert.equal(resolveExpoCryptoSourceProject(android, temporary, "android").name, "expo-crypto");
  assert.equal(resolveExpoCryptoSourceProject(ios, temporary, "ios").name, "ExpoCrypto");
  for (const change of [v => { v.configuration.buildFromSource = []; }, v => { v.modules[0].packageVersion = "15.0.8"; },
    v => { v.modules.push(v.modules[0]); }, v => { v.modules[0].projects[0].sourceDir = root; },
    v => { v.modules[0].projects[0].modules = []; }]) {
    const changed = structuredClone(android); change(changed); assert.throws(() => resolveExpoCryptoSourceProject(changed, temporary, "android"));
  }
  assert.deepEqual(expoCryptoCompileTasks(), [":expo-crypto:compileDebugKotlin", ":expo-crypto:compileReleaseKotlin"]);
  const project = { kind: "project", buildPath: ":", projectPath: ":expo-crypto" };
  verifyExpoCryptoRuntimeGraph({ components: [project] });
  for (const components of [[], [project, project], [{ ...project, buildPath: ":included" }],
    [project, { kind: "module", group: "host.exp.exponent", name: "expo.modules.crypto" }]]) assert.throws(() => verifyExpoCryptoRuntimeGraph({ components }));
});

test("Android evidence requires all eight emitted V3 and Crypto artifacts including Release", t => {
  const temporary = fixture(t), files = [];
  for (const variant of ["debug", "release"]) {
    const title = variant[0].toUpperCase() + variant.slice(1), prefix = "modules/chillywood-test-store-admission/android/build/";
    for (const name of ["ChillywoodTestStoreV3Module", "TestStoreV3Contract"]) files.push(write(temporary,
      `${prefix}tmp/kotlin-classes/${variant}/expo/modules/chillywoodteststore/${name}.class`, "fixture compiled bytes"));
    files.push(write(temporary, `${prefix}intermediates/javac/${variant}/compile${title}JavaWithJavac/classes/expo/modules/chillywoodteststore/TestStoreV3Policy.class`, "fixture compiled bytes"));
    files.push(write(temporary, `node_modules/expo-crypto/android/build/tmp/kotlin-classes/${variant}/expo/modules/crypto/CryptoModule.class`, "fixture compiled bytes"));
  }
  assert.equal(collectPaidVideoAndroidArtifacts(temporary).length, 8);
  fs.writeFileSync(files.at(-1), ""); assert.throws(() => collectPaidVideoAndroidArtifacts(temporary));
  fs.unlinkSync(files.at(-1)); assert.throws(() => collectPaidVideoAndroidArtifacts(temporary));
});

test("iOS artifact receipts bind actual object and product paths to this isolated workspace", t => {
  const temporary = fixture(t), settings = {};
  for (const [target, names] of Object.entries({ ChillywoodTestStoreAdmission: ["ChillywoodTestStoreV3Module", "TestStoreV3Contract", "TestStoreV3Policy"], ExpoCrypto: ["CryptoModule"] })) {
    settings[target] = { OBJECT_FILE_DIR_normal: path.join(temporary, target, "Objects-normal"), TARGET_BUILD_DIR: path.join(temporary, "products", target), EXECUTABLE_PATH: `${target}.framework/${target}` };
    for (const name of names) write(temporary, `${target}/Objects-normal/arm64/${name}.o`, "fixture compiled bytes");
    write(settings[target].TARGET_BUILD_DIR, settings[target].EXECUTABLE_PATH, "fixture product bytes");
  }
  assert.equal(collectPaidVideoIosArtifacts(temporary, "arm64", settings).length, 6);
  assert.throws(() => collectPaidVideoIosArtifacts(temporary, "x86_64", settings));
  assert.throws(() => collectPaidVideoIosArtifacts(temporary, "arm64", { ...settings, ExpoCrypto: {} }));
  const changed = structuredClone(settings); changed.ExpoCrypto.EXECUTABLE_PATH = path.join(root, "package.json");
  assert.throws(() => collectPaidVideoIosArtifacts(temporary, "arm64", changed));
});

test("hosted V3 lane remains mandatory and preserves compiled evidence without provider configuration", () => {
  const workflow = parse(fs.readFileSync(path.join(root, ".github/workflows/required-validation.yml"), "utf8"));
  const lane = workflow.jobs["native-sdk"], command = 'JAVA_HOME="${JAVA_HOME_17_X64:-$JAVA_HOME}" node scripts/compile-native-camera-effects.mjs --android --ios';
  assert.equal(lane["runs-on"], "macos-15");
  assert.equal(lane.steps.filter(step => step.run === command).length, 1);
  assert.equal(lane.steps.find(step => step.run === command).if, undefined, "Actual compilation cannot have an optional skip condition");
  assert.equal(lane.steps.filter(step => step.run === "node --test tests/ci/paid-video-native-closure.test.mjs").length, 1);
  assert(lane.steps.every(step => !step["continue-on-error"]));
  const artifact = lane.steps.find(step => step.with?.name === "native-sdk-${{ github.run_id }}-${{ github.run_attempt }}");
  assert.equal(artifact.if, "always()"); assert.match(artifact.with.path, /receipt\.json/u); assert.match(artifact.with.path, /command-\*\.log/u);
  assert.equal(artifact.with["if-no-files-found"], "error", "Missing native proof cannot pass silently");
  const script = fs.readFileSync(path.join(root, "scripts/compile-native-camera-effects.mjs"), "utf8");
  for (const required of ["receipt.testStoreV3NativePolicy = parseTestStoreV3NativePolicyReport(run", "ISOLATED_TEST_STORE_V3_NATIVE_POLICY: \"1\"",
    "collectPaidVideoAndroidArtifacts(project)", "collectPaidVideoIosArtifacts(workspace, architecture, paidVideoBuildSettings)",
    "verifyExpoCryptoRuntimeGraph(graph)", "requireTestStoreV3Sources(resolution, project, platform, admissionProject)", "assert.equal(v3Sources.length, 6"]) assert(script.includes(required));
  for (const name of ["scripts/ci/paid-video-native-closure.mjs", "tests/ci/paid-video-native-closure.test.mjs", "tests/isolated-test-store-v3-native.test.mjs"]) {
    assert.equal(computeValidationPlan([name]).categories.nativeRelease, true, name);
  }
});
