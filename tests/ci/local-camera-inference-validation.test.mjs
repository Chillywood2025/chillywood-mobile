import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { ARTIFACTS, MODELS, parseInferenceResult, verifySource } from "../../scripts/test-local-camera-inference-offline.mjs";
import { computeValidationPlan, expectedJobs } from "../../scripts/ci/required-validation.mjs";

const readWorkflow = file => parse(fs.readFileSync(`.github/workflows/${file}`, "utf8"));
const validReceipt = () => ({
  scope: "isolated-android-x86_64-production-adapter-inference",
  runtime: "standalone-litert-1.4.1-application-only-xnnpack",
  faceSha256: MODELS[0].sha256,
  maskSha256: MODELS[1].sha256,
  checks: 1_048_600,
  faceInvocations: 8,
  maskInvocations: 16,
  customOpWithoutXnnpackRejected: true,
  corruptModelsRejected: true,
  internetPermission: false,
  syntheticInputsOnly: true,
  physicalDeviceEvidence: false,
  visualSubjectQualityEvidence: false,
});
const output = receipt => `INSTRUMENTATION_RESULT: stream=\nCHILLYWOOD_LOCAL_INFERENCE_PASS ${JSON.stringify(receipt)}\nINSTRUMENTATION_CODE: -1\n`;

test("offline source gate verifies exact production assets, license inventory and app-only runtime", () => {
  const receipt = verifySource();
  assert.equal(receipt.inferenceExecuted, false, "source checks must not claim native execution");
  assert.equal(receipt.physicalDeviceEvidence, false);
  assert.deepEqual(receipt.sourceFiles.map(file => file.file), ["LocalCameraInference.java", "LocalInferenceMath.java", "EffectMath.java"]);
  assert.equal(receipt.artifacts.length, 2);
  assert.equal(receipt.models.length, 2);
  for (const entry of [...receipt.sourceFiles, ...ARTIFACTS, ...MODELS]) assert.match(entry.sha256, /^[0-9a-f]{64}$/u);
});

test("receipt parser requires native execution, exact pins and all fail-closed controls", () => {
  // These are parser fixtures only; their success is never native inference proof.
  const valid = validReceipt();
  assert.deepEqual(parseInferenceResult(output(valid)), valid);
  for (const key of Object.keys(valid)) {
    const missing = { ...valid };
    delete missing[key];
    assert.throws(() => parseInferenceResult(output(missing)), assert.AssertionError, key);
  }
  for (const [key, wrong] of Object.entries({
    scope: "host-mock", runtime: "play-services", faceSha256: "0".repeat(64), maskSha256: "0".repeat(64),
    checks: 12, faceInvocations: 0, maskInvocations: 0, customOpWithoutXnnpackRejected: false,
    corruptModelsRejected: false, internetPermission: true, syntheticInputsOnly: false,
    physicalDeviceEvidence: true, visualSubjectQualityEvidence: true,
  })) assert.throws(() => parseInferenceResult(output({ ...valid, [key]: wrong })), assert.AssertionError, key);
  for (const invalid of ["", output(valid).replace("INSTRUMENTATION_CODE: -1", "INSTRUMENTATION_CODE: 0"),
    output(valid) + output(valid), output(valid) + "CHILLYWOOD_LOCAL_INFERENCE_FAIL custom op",
    output(valid) + "INSTRUMENTATION_FAILED", output(valid) + "INSTRUMENTATION_ABORTED"]) {
    assert.throws(() => parseInferenceResult(invalid), assert.AssertionError);
  }
});

function assertRequiredLane(source, reusable) {
  const native = source.jobs["native-inference"];
  assert.equal(native.if, "needs.plan.outputs.nativeRelease == 'true'");
  assert.equal(native.needs, "plan");
  assert.equal(native.uses, "./.github/workflows/local-camera-inference.yml");
  assert.equal(native.secrets, undefined);
  assert.deepEqual(native.permissions, { contents: "read" });
  assert.equal(native["continue-on-error"], undefined);
  assert.deepEqual(source.jobs["native-sdk"].needs, ["plan", "native-inference"]);
  assert.deepEqual(source.jobs["native-release"].needs, ["plan", "native-sdk"]);
  assert(source.jobs.result.needs.includes("native-inference"));
  assert(Object.hasOwn(reusable.on, "workflow_call"));
  assert.deepEqual(reusable.permissions, { contents: "read" });
  const job = reusable.jobs["offline-inference"];
  assert.equal(job["runs-on"], "ubuntu-24.04");
  assert.equal(job.if, undefined);
  assert.equal(job["continue-on-error"], undefined);
  assert.equal(job["timeout-minutes"], 60);
  assert.equal(job.defaults.run.shell, "bash --noprofile --norc -eo pipefail {0}");
  const compile = 'JAVA_HOME="$JAVA_HOME_17_X64" node scripts/compile-native-camera-effects.mjs --android';
  const execute = 'JAVA_HOME="$JAVA_HOME_17_X64" node scripts/test-local-camera-inference-offline.mjs --emulator';
  for (const command of [compile, execute]) {
    const steps = job.steps.filter(step => step.run === command);
    assert.equal(steps.length, 1, `Exact mandatory command required: ${command}`);
    assert.equal(steps[0].if, undefined);
    assert.equal(steps[0]["continue-on-error"], undefined);
  }
  assert(job.steps.findIndex(step => step.run === compile) < job.steps.findIndex(step => step.run === execute));
  const commands = job.steps.map(step => step.run ?? "").join("\n");
  assert.match(commands, /node scripts\/test-local-camera-inference-offline\.mjs --source-check/u);
  assert.match(commands, /system-images;android-35;default;x86_64/u);
  assert.doesNotMatch(commands, /google_apis|google_apis_playstore|--licenses|\byes\s*\||\bsudo\b|\|\|\s*true|continue-on-error/u);
}

test("exact-model inference and full native compile are mandatory in the required native chain", () => {
  const source = readWorkflow("required-validation.yml");
  const reusable = readWorkflow("local-camera-inference.yml");
  assertRequiredLane(source, reusable);
  for (const mode of ["skip-job", "skip-inference", "ignore-failure", "remove-inference", "remove-compile",
    "duplicate", "break-dependency", "remove-summary", "replace-with-source-only"]) {
    const changed = structuredClone(source);
    const lane = structuredClone(reusable);
    const job = lane.jobs["offline-inference"];
    const inference = job.steps.find(step => step.run?.endsWith("--emulator"));
    if (mode === "skip-job") job.if = "false";
    if (mode === "skip-inference") inference.if = "false";
    if (mode === "ignore-failure") inference["continue-on-error"] = true;
    if (mode === "remove-inference") job.steps = job.steps.filter(step => step !== inference);
    if (mode === "remove-compile") job.steps = job.steps.filter(step => !step.run?.includes("compile-native-camera-effects"));
    if (mode === "duplicate") job.steps.push(structuredClone(inference));
    if (mode === "break-dependency") changed.jobs["native-sdk"].needs = ["plan"];
    if (mode === "remove-summary") changed.jobs.result.needs = changed.jobs.result.needs.filter(name => name !== "native-inference");
    if (mode === "replace-with-source-only") inference.run = inference.run.replace("--emulator", "--source-check");
    assert.throws(() => assertRequiredLane(changed, lane), assert.AssertionError, mode);
  }
});

test("all inference, provider closure, model and plugin edits select the required native lane", () => {
  for (const file of [
    "scripts/camera-provider-closure.mjs", "scripts/compile-native-camera-effects.mjs",
    "scripts/test-local-camera-inference-offline.mjs", "plugins/withExpoCameraNoBarcode.js",
    "plugins/expo-camera-no-barcode/manifest.json", "tools/local-camera-inference-harness/AndroidManifest.xml",
    "tools/local-camera-inference-harness/OfflineInferenceInstrumentation.java",
    "modules/chillywood-camera-effects/android/src/main/java/expo/modules/chillywoodcameraeffects/LocalCameraInference.java",
    "modules/chillywood-camera-effects/android/src/main/assets/chillywood_models/selfie_segmenter.tflite",
    "modules/chillywood-camera-effects/third-party/models.json", "tests/local-camera-inference.test.mjs",
    "tests/camera-provider-closure.test.mjs", "tests/expo-camera-no-barcode.test.mjs",
    "tests/ci/local-camera-inference-validation.test.mjs", ".github/workflows/local-camera-inference.yml",
  ]) {
    const plan = computeValidationPlan([file]);
    assert.equal(plan.categories.nativeRelease, true, file);
    assert(expectedJobs(plan).includes("Validation / Native and Release"), file);
  }
});
