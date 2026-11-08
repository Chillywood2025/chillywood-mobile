import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveTestStoreV2AdmissionProject, parseTestStoreV2NativePolicyReport } from "../scripts/compile-native-camera-effects.mjs";

test("v2 compile admission requires actual coexisting v1/v2 native classes and all source files", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "teststore-v2-ci-"));
  try {
    const module = path.join(temporary, "modules/chillywood-test-store-admission");
    fs.cpSync(new URL("../modules/chillywood-test-store-admission/", import.meta.url), module, { recursive: true });
    for (const platform of ["android", "ios"]) {
      const classes = platform === "android" ? ["expo.modules.chillywoodteststore.ChillywoodTestStoreAdmissionModule", "expo.modules.chillywoodteststore.ChillywoodTestStoreV2Module"]
        : ["ChillywoodTestStoreAdmissionModule", "ChillywoodTestStoreV2Module"];
      const resolution = { modules: [{ packageName: "chillywood-test-store-admission", debugOnly: false,
        ...(platform === "android" ? { projects: [{ name: "chillywood-test-store-admission", sourceDir: path.join(module, "android"), modules: classes }] }
          : { pods: [{ podName: "ChillywoodTestStoreAdmission", podspecDir: path.join(module, "ios") }], modules: classes }) }] };
      assert.ok(resolveTestStoreV2AdmissionProject(resolution, temporary, platform));
      classes.pop(); assert.throws(() => resolveTestStoreV2AdmissionProject(resolution, temporary, platform));
      classes.push(platform === "android" ? "expo.modules.chillywoodteststore.ChillywoodTestStoreV2Module" : "ChillywoodTestStoreV2Module");
      const contractFile = platform === "android" ? "android/src/main/java/expo/modules/chillywoodteststore/TestStoreV2Contract.kt" : "ios/TestStoreV2Contract.swift";
      fs.unlinkSync(path.join(module, contractFile)); assert.throws(() => resolveTestStoreV2AdmissionProject(resolution, temporary, platform));
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

const output = "ok 8 - compiled native lifecycle persists before invocation, retains unknown work and supports only same-owner completed repetition\n# tests 8\n# pass 8\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
test("v2 native policy gate rejects portable-only, skipped, partial or failed execution", () => {
  assert.deepEqual(parseTestStoreV2NativePolicyReport(output), { groups: 8, nativeExecutables: 3, failures: 0, skipped: 0, providerSdkInvoked: false });
  for (const invalid of [output.replace("# tests 8", "# tests 7"), output.replace("# pass 8", "# pass 7"), output.replace("# skipped 0", "# skipped 1"),
    output.replace("# fail 0", "# fail 1"), output.replace("# cancelled 0", "# cancelled 1"), output.replace("# todo 0", "# todo 1"),
    output.replace("ok 8 - compiled", "not ok 8 - compiled"), output + output]) assert.throws(() => parseTestStoreV2NativePolicyReport(invalid));
});

test("required macOS native lane executes v2 compiled policy alongside v1 and binds all six source files", () => {
  const script = fs.readFileSync(new URL("../scripts/compile-native-camera-effects.mjs", import.meta.url), "utf8");
  assert.match(script, /receipt\.testStoreV2NativePolicy = parseTestStoreV2NativePolicyReport\(run/u);
  assert.match(script, /ISOLATED_TEST_STORE_V2_NATIVE_POLICY: "1", TEST_STORE_JAVA_HOME: env\.JAVA_HOME/u);
  assert.match(script, /receipt\.testStoreNativePolicy = parseTestStoreNativePolicyReport/u);
  assert.match(script, /assert\.equal\(v2Sources\.length, 6/u); assert.match(script, /receipt\.testStoreV2AdmissionSourceSha256 = v2Hash\.digest/u);
  assert.match(script, /resolveTestStoreV2AdmissionProject\(resolution, project, platform\), admissionProject/u);
  const workflow = fs.readFileSync(new URL("../.github/workflows/required-validation.yml", import.meta.url), "utf8");
  const lane = workflow.slice(workflow.indexOf("  native-sdk:"), workflow.indexOf("  native-release:"));
  assert.match(lane, /runs-on: macos-15/u); assert.match(lane, /compile-native-camera-effects\.mjs --android --ios/u); assert.doesNotMatch(lane, /continue-on-error/u);
});
