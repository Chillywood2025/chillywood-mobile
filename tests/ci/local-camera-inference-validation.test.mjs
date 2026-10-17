import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { ARTIFACTS, MODELS, parseInferenceResult, parseRejectedNoOpResult, snapshotBuildInputs,
  verifySource, withoutNativeCall } from "../../scripts/test-local-camera-inference-offline.mjs";
import { computeValidationPlan, expectedJobs } from "../../scripts/ci/required-validation.mjs";

const readWorkflow = file => parse(fs.readFileSync(`.github/workflows/${file}`, "utf8"));
const proofNonce = "1234567890abcdef1234567890abcdef";
const parseReceipt = value => parseInferenceResult(value, proofNonce);
const validReceipt = () => ({
  proofNonce,
  variant: "production",
  scope: "isolated-android-x86_64-production-adapter-inference",
  runtime: "standalone-litert-1.4.1-application-only-xnnpack",
  faceSha256: MODELS[0].sha256,
  maskSha256: MODELS[1].sha256,
  checks: 2_219_042,
  faceInvocations: 8,
  maskInvocations: 16,
  outputSentinelChecks: 1_170_432,
  outputSentinelsOverwritten: true,
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
  assert.deepEqual(parseReceipt(output(valid)), valid);
  for (const key of Object.keys(valid)) {
    const missing = { ...valid };
    delete missing[key];
    assert.throws(() => parseReceipt(output(missing)), assert.AssertionError, key);
  }
  for (const [key, wrong] of Object.entries({
    proofNonce: "0".repeat(32), variant: "face-no-op", outputSentinelChecks: 0, outputSentinelsOverwritten: false,
    scope: "host-mock", runtime: "play-services", faceSha256: "0".repeat(64), maskSha256: "0".repeat(64),
    checks: 12, faceInvocations: 0, maskInvocations: 0, customOpWithoutXnnpackRejected: false,
    corruptModelsRejected: false, internetPermission: true, syntheticInputsOnly: false,
    physicalDeviceEvidence: true, visualSubjectQualityEvidence: true,
  })) assert.throws(() => parseReceipt(output({ ...valid, [key]: wrong })), assert.AssertionError, key);
  for (const invalid of ["", output(valid).replace("INSTRUMENTATION_CODE: -1", "INSTRUMENTATION_CODE: 0"),
    output(valid) + output(valid), output(valid) + "CHILLYWOOD_LOCAL_INFERENCE_FAIL custom op",
    output(valid) + "INSTRUMENTATION_FAILED", output(valid) + "INSTRUMENTATION_ABORTED",
    output(valid) + "INSTRUMENTATION_CODE: 0"]) {
    assert.throws(() => parseReceipt(invalid), assert.AssertionError);
  }
});

test("native instrumentation requests raw completion status and rejects a stream-only receipt", () => {
  const runner = fs.readFileSync("scripts/test-local-camera-inference-offline.mjs", "utf8");
  const requireRawCompletion = source => assert.match(source,
    /run\(binaries\.adb,\s*\["-s",\s*serial,\s*"shell",\s*"am",\s*"instrument",\s*"-w",\s*"-r",/u,
    "Wait for instrumentation and request raw output containing INSTRUMENTATION_CODE");
  requireRawCompletion(runner);
  assert.throws(() => requireRawCompletion(runner.replace('"instrument", "-w", "-r",', '"instrument", "-w",')),
    assert.AssertionError, "the former stream-only invocation must fail the regression gate");
  const receipt = validReceipt();
  const streamOnly = `CHILLYWOOD_LOCAL_INFERENCE_PASS ${JSON.stringify(receipt)}\n`;
  assert.throws(() => parseReceipt(streamOnly), /Instrumentation must finish successfully/u);
  assert.deepEqual(parseReceipt(output(receipt)), receipt);
});

test("no-op native-call controls require a nonce-bound specific rejection and canceled status", () => {
  for (const [variant, errorType, message] of [
    ["face-no-op", "java.lang.AssertionError", "Face output sentinel was not overwritten by native inference"],
    ["mask-no-op", "java.lang.IllegalStateException", "Invalid local person confidence"],
  ]) {
    const receipt = { proofNonce, variant, errorType, message };
    const failed = value => `CHILLYWOOD_LOCAL_INFERENCE_FAIL ${JSON.stringify(value)}\nINSTRUMENTATION_CODE: 0\n`;
    const parseFailure = value => parseRejectedNoOpResult(value, proofNonce, variant);
    assert.deepEqual(parseFailure(failed(receipt)), receipt);
    for (const key of Object.keys(receipt)) {
      const missing = { ...receipt };
      delete missing[key];
      assert.throws(() => parseFailure(failed(missing)), assert.AssertionError, key);
      assert.throws(() => parseFailure(failed({ ...receipt, [key]: "unrelated" })), assert.AssertionError, key);
    }
    for (const invalid of ["", failed(receipt).replace("INSTRUMENTATION_CODE: 0", ""),
      failed(receipt).replace("INSTRUMENTATION_CODE: 0", "INSTRUMENTATION_CODE: -1"),
      failed(receipt) + failed(receipt), failed(receipt) + output(validReceipt()),
      failed(receipt) + "INSTRUMENTATION_FAILED", failed(receipt) + "INSTRUMENTATION_ABORTED",
      failed(receipt) + "INSTRUMENTATION_CODE: -1"]) assert.throws(() => parseFailure(invalid), assert.AssertionError);
  }
});

test("each no-op mutation removes exactly its native call and preserves the other", () => {
  const source = fs.readFileSync("modules/chillywood-camera-effects/android/src/main/java/expo/modules/chillywoodcameraeffects/LocalCameraInference.java", "utf8");
  const faceCall = "interpreter.runForMultipleInputsOutputs(new Object[] {input}, output);";
  const maskCall = "interpreter.run(input, maskValues);";
  for (const [variant, removed, retained] of [["face-no-op", faceCall, maskCall], ["mask-no-op", maskCall, faceCall]]) {
    const mutant = withoutNativeCall(source, variant);
    assert(!mutant.includes(removed));
    assert(mutant.includes(retained));
    assert.equal(mutant.replace(`/* ${variant}: native interpreter call intentionally omitted */`, removed), source);
    assert.throws(() => withoutNativeCall(mutant, variant), assert.AssertionError);
    assert.throws(() => withoutNativeCall(source + removed, variant), assert.AssertionError);
  }
  assert.throws(() => withoutNativeCall(source, "production"), assert.AssertionError);
});

test("receipt hashes and build paths bind an independent snapshot despite later source edits", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "camera-inference-snapshot-test-"));
  try {
    const first = snapshotBuildInputs(path.join(temporary, "first"));
    const expected = verifySource(first);
    const build = snapshotBuildInputs(path.join(temporary, "build"), first);
    fs.writeFileSync(path.join(first.productionRoot, "java/expo/modules/chillywoodcameraeffects/LocalCameraInference.java"), "changed adapter");
    fs.writeFileSync(path.join(first.productionRoot, "assets/chillywood_models/selfie_segmenter.tflite"), "changed model");
    fs.writeFileSync(path.join(first.harnessRoot, "AndroidManifest.xml"), "changed manifest");
    assert.deepEqual(verifySource(build), expected);
    assert.deepEqual(build.harnessFiles, first.harnessFiles);
    assert.notEqual(fs.readFileSync(path.join(build.harnessRoot, "AndroidManifest.xml"), "utf8"), "changed manifest");
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
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
  const verify = "node scripts/test-local-camera-inference-offline.mjs --source-check\n"
    + "node --test tests/ci/local-camera-inference-validation.test.mjs\n";
  for (const command of [verify, compile]) {
    const steps = job.steps.filter(step => step.run === command);
    assert.equal(steps.length, 1, `Exact mandatory command required: ${command}`);
    assert.equal(steps[0].if, undefined);
    assert.equal(steps[0]["continue-on-error"], undefined);
  }
  assert(job.steps.findIndex(step => step.run === verify) < job.steps.findIndex(step => step.run === compile));
  const commands = job.steps.map(step => step.run ?? "").join("\n");
  assert.match(commands, /"platforms;android-35" "build-tools;35\.0\.0"/u);
  assert.doesNotMatch(commands, /--emulator|--serial|system-images;|"emulator"/u);
  assert.doesNotMatch(commands, /google_apis|google_apis_playstore|--licenses|\byes\s*\||\bsudo\b|\|\|\s*true|continue-on-error/u);
}

test("source controls and full native compile remain mandatory without emulator execution", () => {
  const source = readWorkflow("required-validation.yml");
  const reusable = readWorkflow("local-camera-inference.yml");
  assertRequiredLane(source, reusable);
  for (const mode of ["skip-job", "skip-compile", "ignore-compile-failure", "remove-compile",
    "skip-controls", "ignore-control-failure", "remove-controls", "duplicate-compile", "duplicate-controls",
    "break-dependency", "remove-summary", "replace-with-source-only", "restore-emulator", "restore-image"]) {
    const changed = structuredClone(source);
    const lane = structuredClone(reusable);
    const job = lane.jobs["offline-inference"];
    const compile = job.steps.find(step => step.run?.includes("compile-native-camera-effects"));
    const controls = job.steps.find(step => step.run?.includes("--source-check"));
    if (mode === "skip-job") job.if = "false";
    if (mode === "skip-compile") compile.if = "false";
    if (mode === "ignore-compile-failure") compile["continue-on-error"] = true;
    if (mode === "remove-compile") job.steps = job.steps.filter(step => step !== compile);
    if (mode === "skip-controls") controls.if = "false";
    if (mode === "ignore-control-failure") controls["continue-on-error"] = true;
    if (mode === "remove-controls") job.steps = job.steps.filter(step => step !== controls);
    if (mode === "duplicate-compile") job.steps.push(structuredClone(compile));
    if (mode === "duplicate-controls") job.steps.push(structuredClone(controls));
    if (mode === "break-dependency") changed.jobs["native-sdk"].needs = ["plan"];
    if (mode === "remove-summary") changed.jobs.result.needs = changed.jobs.result.needs.filter(name => name !== "native-inference");
    if (mode === "replace-with-source-only") compile.run = "node scripts/test-local-camera-inference-offline.mjs --source-check";
    if (mode === "restore-emulator") job.steps.push({ run: "node scripts/test-local-camera-inference-offline.mjs --emulator" });
    if (mode === "restore-image") job.steps.push({ run: 'sdkmanager --install "system-images;android-35;default;x86_64"' });
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
    "tests/native-camera-compile-records.test.mjs", "tests/release-native-source.test.mjs",
    "tests/livekit-ios-static-framework-compatibility.test.mjs",
    "tests/ci/local-camera-inference-validation.test.mjs", ".github/workflows/local-camera-inference.yml",
  ]) {
    const plan = computeValidationPlan([file]);
    assert.equal(plan.categories.nativeRelease, true, file);
    assert(expectedJobs(plan).includes("Validation / Native and Release"), file);
  }
});
