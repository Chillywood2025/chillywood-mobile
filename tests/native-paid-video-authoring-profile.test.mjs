import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
import ts from "typescript";

function fixture({ applicationId = "com.chillywood.mobile", platform = "android", v1 = false, v2 = false, v3 = false, build = null } = {}) {
  const bindings = {
    "expo-application": { applicationId }, "react-native": { Platform: { OS: platform } },
    "./isolatedTestStoreBuild": { isIsolatedTestStoreFlavor: () => v1 },
    "./isolatedTestStoreV2Build": { isIsolatedTestStoreV2Flavor: () => v2 },
    "./isolatedTestStoreV3Build": { isIsolatedTestStoreV3Flavor: () => v3, readIsolatedTestStoreV3Build: () => build },
  };
  const scope = { exports: {}, require: name => { assert.ok(name in bindings); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../_lib/paidVideoAuthoringProfile.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, scope);
  return scope.exports;
}
test("normal iOS and Android select public native authoring metadata without V3 or purchase authorization", () => {
  for (const platform of ["ios", "android"]) {
    const api = fixture({ platform }), profile = api.readPaidVideoAuthoringProfile();
    assert.equal(profile.mode, "native");
    assert.equal(profile.configId, createHash("sha256").update("native-paid-video-authoring-v1").digest("hex"));
    assert.deepEqual(Object.keys(profile).sort(), ["configId", "mode"]);
  }
});
test("unsupported and mixed native identities fail closed; V3 still needs its own actual build observation", () => {
  for (const input of [{ applicationId: null }, { applicationId: "com.chillywood.mobile.teststoredebug" }, { platform: "web" },
    { v1: true }, { v2: true }, { v3: true }, { v1: true, v3: true, build: { configId: "a".repeat(64) } }]) {
    assert.equal(fixture(input).readPaidVideoAuthoringProfile(), null);
  }
  const profile = fixture({ applicationId: "com.chillywood.mobile.teststoredebugv3", v3: true, build: { configId: "a".repeat(64) } }).readPaidVideoAuthoringProfile();
  assert.equal(profile.mode, "test_store_v3"); assert.equal(profile.configId, "a".repeat(64));
});
test("the ordinary sandbox route selects the working V2 Studio rather than the missing V1 endpoint", () => {
  for (const platform of ["ios", "android"]) {
    const Studio = () => null;
    const bindings = {
      react: { createElement: (type, props) => ({ type, props }) },
      "react-native": { StyleSheet: { create: value => value, absoluteFillObject: {} } },
      "../../_lib/paidVideoAuthoringProfile": fixture({ platform }),
      "../../_lib/isolatedTestStoreV3Build": { isIsolatedTestStoreV3Flavor: () => false },
      "./isolated-paid-video-v2-screens": { IsolatedPaidVideoV2Screen: Studio },
    };
    const scope = { exports: {}, require: name => bindings[name] ?? {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../components/monetization/isolated-paid-video-screens.tsx", import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText, scope);
    const result = scope.exports.IsolatedPaidVideoScreen({ page: "studio" });
    assert.equal(result.type, Studio); assert.equal(result.props.page, "studio");
  }
});
