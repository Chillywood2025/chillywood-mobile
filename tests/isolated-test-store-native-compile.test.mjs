import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { testStoreAdmissionCompileTasks, resolveTestStoreAdmissionProject, verifyTestStoreAdmissionRuntimeGraph,
  requireTestStoreAdmissionPodTarget, parseTestStoreNativePolicyReport } from "../scripts/compile-native-camera-effects.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-store-compile-"));
  const moduleRoot = path.join(root, "modules/chillywood-test-store-admission");
  fs.cpSync(new URL("../modules/chillywood-test-store-admission/", import.meta.url), moduleRoot, { recursive: true });
  const android = { modules: [{ packageName: "chillywood-test-store-admission", projects: [{
    name: "chillywood-test-store-admission", sourceDir: path.join(moduleRoot, "android"),
    modules: ["expo.modules.chillywoodteststore.ChillywoodTestStoreAdmissionModule"],
  }] }] };
  const ios = { modules: [{ packageName: "chillywood-test-store-admission", debugOnly: false,
    pods: [{ podName: "ChillywoodTestStoreAdmission", podspecDir: path.join(moduleRoot, "ios") }],
    modules: ["ChillywoodTestStoreAdmissionModule"],
  }] };
  return { root, android, ios, remove: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("admission compilation requests both languages in Debug and Release", () => {
  assert.deepEqual(testStoreAdmissionCompileTasks(), [
    ":chillywood-test-store-admission:compileDebugKotlin", ":chillywood-test-store-admission:compileDebugJavaWithJavac",
    ":chillywood-test-store-admission:compileReleaseKotlin", ":chillywood-test-store-admission:compileReleaseJavaWithJavac",
  ]);
});

test("Android admission requires singular real autolinked source and both bridge/policy files", () => {
  const f = fixture();
  try {
    assert.deepEqual(resolveTestStoreAdmissionProject(f.android, f.root, "android"), {
      name: "chillywood-test-store-admission", sourceDir: path.join(f.root, "modules/chillywood-test-store-admission/android"),
    });
    for (const mutate of [r => { r.modules = []; }, r => { r.modules.push(r.modules[0]); },
      r => { r.modules[0].projects.push(r.modules[0].projects[0]); }, r => { r.modules[0].projects[0].sourceDir = "/shared/android"; },
      r => { r.modules[0].projects[0].modules = []; }, r => { r.modules[0].projects[0].publication = { groupId: "prebuilt" }; }]) {
      const r = structuredClone(f.android); mutate(r); assert.throws(() => resolveTestStoreAdmissionProject(r, f.root, "android"));
    }
    fs.unlinkSync(path.join(f.root, "modules/chillywood-test-store-admission/android/src/main/java/expo/modules/chillywoodteststore/TestStoreAdmissionPolicy.java"));
    assert.throws(() => resolveTestStoreAdmissionProject(f.android, f.root, "android"));
  } finally { f.remove(); }
});

test("Apple admission requires the real pod, Swift bridge and Release-visible module", () => {
  const f = fixture();
  try {
    assert.deepEqual(resolveTestStoreAdmissionProject(f.ios, f.root, "ios"), {
      name: "ChillywoodTestStoreAdmission", sourceDir: path.join(f.root, "modules/chillywood-test-store-admission/ios"),
    });
    for (const mutate of [r => { r.modules = []; }, r => { r.modules[0].debugOnly = true; },
      r => { r.modules[0].modules = []; }, r => { r.modules[0].pods.push(r.modules[0].pods[0]); },
      r => { r.modules[0].pods[0].podName = "OtherPod"; }, r => { r.modules[0].pods[0].podspecDir = "/shared/ios"; }]) {
      const r = structuredClone(f.ios); mutate(r); assert.throws(() => resolveTestStoreAdmissionProject(r, f.root, "ios"));
    }
    fs.unlinkSync(path.join(f.root, "modules/chillywood-test-store-admission/ios/ChillywoodTestStoreAdmissionModule.swift"));
    assert.throws(() => resolveTestStoreAdmissionProject(f.ios, f.root, "ios"));
    assert.throws(() => resolveTestStoreAdmissionProject(f.ios, f.root, "web"));
  } finally { f.remove(); }
});

test("runtime and Pods evidence reject absent, duplicate or substituted native admission", () => {
  const component = { kind: "project", buildPath: ":", projectPath: ":chillywood-test-store-admission" };
  verifyTestStoreAdmissionRuntimeGraph({ components: [component] });
  for (const components of [[], [component, component], [{ ...component, buildPath: ":included" }],
    [{ ...component, kind: "module" }]]) assert.throws(() => verifyTestStoreAdmissionRuntimeGraph({ components }));
  assert.equal(requireTestStoreAdmissionPodTarget({ project: { targets: ["Other", "ChillywoodTestStoreAdmission"] } }), "ChillywoodTestStoreAdmission");
  for (const list of [{}, { project: { targets: [] } }, { project: { targets: ["ChillywoodTestStoreAdmission", "ChillywoodTestStoreAdmission"] } },
    { workspace: { targets: ["ChillywoodTestStoreAdmission"] } }]) assert.throws(() => requireTestStoreAdmissionPodTarget(list));
});

const report = "ok 8 - compiled Java and Swift admission rejects Release before callback and latches configuration/UID for process lifetime\n"
  + "# tests 8\n# pass 8\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
test("macOS native policy evidence must include the compiled group with no skip or missing cases", () => {
  assert.deepEqual(parseTestStoreNativePolicyReport(report), { groups: 8, nativeProcessScenarios: 10, failures: 0, skipped: 0, providerSdkInvoked: false });
  for (const changed of [report.replace("# tests 8", "# tests 7"), report.replace("# skipped 0", "# skipped 1"),
    report.replace("# fail 0", "# fail 1"), report.replace("# cancelled 0", "# cancelled 1"),
    report.replace("# todo 0", "# todo 1"), report.replace("ok 8 - compiled", "not ok 8 - compiled"), report + report,
    report.replace("# pass 8\n", "")]) assert.throws(() => parseTestStoreNativePolicyReport(changed));
});

test("existing macOS lane executes actual admission targets and native policies without optional gates", () => {
  const source = fs.readFileSync(new URL("../scripts/compile-native-camera-effects.mjs", import.meta.url), "utf8");
  assert.match(source, /\.\.\.testStoreAdmissionCompileTasks\(\)/u);
  assert.match(source, /const admissionProject = resolveTestStoreAdmissionProject\(resolution, project, platform\)/u);
  assert.match(source, /CHILLYWOOD_TEST_STORE_ADMISSION_SOURCE_PROJECT: JSON\.stringify\(admissionProject\)/u);
  assert.match(source, /parseGradleRecord\(output, "TEST_STORE_ADMISSION_SOURCE_PROJECT"\), admissionProject/u);
  assert.match(source, /verifyTestStoreAdmissionRuntimeGraph\(graph\)/u);
  assert.match(source, /requireTestStoreAdmissionPodTarget\(JSON\.parse\(run\("xcodebuild"/u);
  assert.match(source, /"-target", admissionTarget, "-configuration", "Debug"/u);
  assert.match(source, /receipts\.ios\.compiledTargets\.push\(admissionTarget\)/u);
  assert.match(source, /ISOLATED_TEST_STORE_NATIVE_POLICY: "1", TEST_STORE_JAVA_HOME: env\.JAVA_HOME/u);
  assert.match(source, /receipt\.testStoreNativePolicy = parseTestStoreNativePolicyReport\(run/u);
  const workflow = fs.readFileSync(new URL("../.github/workflows/required-validation.yml", import.meta.url), "utf8");
  const lane = workflow.slice(workflow.indexOf("  native-sdk:"), workflow.indexOf("  native-release:"));
  assert.match(lane, /runs-on: macos-15/u);
  assert.match(lane, /node scripts\/compile-native-camera-effects\.mjs --android --ios/u);
  assert.doesNotMatch(lane, /continue-on-error/u);
});
