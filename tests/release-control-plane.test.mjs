import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  IOS_DELIVERY_STATES,
  RELEASE_DEFECT_DISPOSITIONS,
  createOtaPublicationPlan,
  createResumableDeliveryReceipt,
  reconstructPhysicalAutomation,
  reconcileExactArtifactDeliveryState,
  validateOtaPublicationPlan,
  validatePublishedUpdateReadback,
} from "../scripts/release-control-plane-lib.mjs";
import {
  CONTROL_PLANE_LIFECYCLE_CONTRACT,
  evaluateLifecycleAuthority,
  fixedPointAcceptsAdvancement,
  transitionLifecycle,
} from "../scripts/assurance/control-plane-lifecycle.mjs";

const sha = (character) => character.repeat(40);
const digest = (character) => character.repeat(64);
const binary = (platform) => ({
  artifactSha256: digest("c"),
  nativeCapabilities: platform === "ios" ? ["ios-native-calls"] : [],
  platform,
  revoked: false,
  runtimeVersion: `1.0.0-${platform}-production-v2`,
  sourceSha: sha("a"),
  sourceTree: sha("b"),
  valid: true,
});
const plan = (platform) => createOtaPublicationPlan({
  platform,
  sourceSha: sha("a"),
  sourceTree: sha("b"),
  runtimeVersion: `1.0.0-${platform}-production-v2`,
  signedBinary: binary(platform),
});
const artifact = { artifactId: "artifact-1", sha256: digest("d"), sourceSha: sha("e"), sourceTree: sha("f"), buildNumber: "42", valid: true, revoked: false };
const ref = (state, extra = {}) => ({ artifactId: artifact.artifactId, artifactSha256: artifact.sha256, state, ...extra });
const delivery = (extra = {}) => ({ artifact, ...extra });
const policy = JSON.parse(fs.readFileSync(new URL("../config/assurance/control-plane-lifecycle-v2.json", import.meta.url), "utf8"));

test("exact Android and iOS OTA provenance passes", () => {
  assert.deepEqual(validateOtaPublicationPlan(plan("android")).findings, []);
  assert.deepEqual(validateOtaPublicationPlan(plan("ios")).findings, []);
});

for (const [name, mutate, finding] of [
  ["wrong platform", (value) => ({ ...value, platform: "windows" }), "OTA_PLATFORM_INVALID"],
  ["wrong channel", (value) => ({ ...value, channel: "ios-internal-v2" }), "OTA_CHANNEL_PLATFORM_MISMATCH"],
  ["wrong runtime", (value) => ({ ...value, runtimeVersion: "1.0.0-ios-production-v2" }), "OTA_RUNTIME_PLATFORM_MISMATCH"],
  ["stale source", (value) => ({ ...value, source: { ...value.source, protectedMain: false } }), "OTA_SOURCE_NOT_EXACT_PROTECTED_MAIN"],
  ["wrong binary platform", (value) => ({ ...value, signedBinary: { ...value.signedBinary, platform: "ios" } }), "OTA_BINARY_PLATFORM_MISMATCH"],
  ["incompatible binary", (value) => ({ ...value, signedBinary: { ...value.signedBinary, runtimeVersion: "old" } }), "OTA_BINARY_RUNTIME_INCOMPATIBLE"],
  ["invalid artifact digest", (value) => ({ ...value, signedBinary: { ...value.signedBinary, artifactSha256: "bad" } }), "OTA_BINARY_DIGEST_INVALID"],
  ["non-app-owned activation", (value) => ({ ...value, activation: "AUTOMATIC" }), "OTA_ACTIVATION_POLICY_INVALID"],
]) test(`OTA rejects ${name}`, () => assert.ok(validateOtaPublicationPlan(mutate(plan("android"))).findings.includes(finding)));

test("iOS compiled capability is required and cannot transfer to Android", () => {
  const ios = plan("ios");
  assert.ok(validateOtaPublicationPlan({ ...ios, signedBinary: { ...ios.signedBinary, nativeCapabilities: [] } }).findings.includes("OTA_NATIVE_CAPABILITY_MISMATCH"));
  const android = plan("android");
  const mutated = { ...android, requiredNativeCapabilities: ["ios-native-calls"] };
  mutated.planHash = "0".repeat(64);
  assert.ok(validateOtaPublicationPlan(mutated).findings.includes("OTA_CROSS_PLATFORM_CAPABILITY"));
});

test("published update readback binds group, update, platform, runtime, channel, and source", () => {
  const expected = plan("android");
  const message = `internal proof [source:${expected.source.sha} tree:${expected.source.tree} plan:${expected.planHash}]`;
  const readback = [{ id: "update-123", group: "group-123", platform: "android", runtimeVersion: expected.runtimeVersion, branchName: expected.channel, message }];
  assert.equal(validatePublishedUpdateReadback(readback, expected).ok, true);
  for (const mutation of [
    [{ ...readback[0], platform: "ios" }],
    [{ ...readback[0], runtimeVersion: "wrong" }],
    [{ ...readback[0], branchName: "ios-internal-v2" }],
    [{ ...readback[0], message: "unbound" }],
    [{ ...readback[0], group: "" }],
  ]) assert.equal(validatePublishedUpdateReadback(mutation, expected).ok, false);
});

test("delivery states remain distinct", () => {
  assert.ok(["SIGNED_ARTIFACT_READY", "SUBMISSION_CREATED", "EAS_SUBMIT_QUEUED", "SUBMISSION_WORKER_ASSIGNED", "APPLE_UPLOAD_ACCEPTED", "APPLE_PROCESSING", "TESTFLIGHT_INTERNAL_AVAILABLE", "INSTALLED"].every((state) => IOS_DELIVERY_STATES.includes(state)));
  assert.equal(reconcileExactArtifactDeliveryState(delivery()).state, "SIGNED_ARTIFACT_READY");
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ submission: ref("CREATED", { submissionId: "s1" }) })).state, "SUBMISSION_CREATED");
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ submission: ref("QUEUED", { submissionId: "s1" }) })).state, "EAS_SUBMIT_QUEUED");
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ submission: ref("WORKER_ASSIGNED", { submissionId: "s1" }) })).state, "SUBMISSION_WORKER_ASSIGNED");
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ apple: ref("RECEIVED", { buildId: "b1" }) })).state, "APPLE_UPLOAD_ACCEPTED");
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ apple: ref("PROCESSING", { buildId: "b1" }) })).state, "APPLE_PROCESSING");
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ testflight: ref("INTERNAL_AVAILABLE") })).state, "TESTFLIGHT_INTERNAL_AVAILABLE");
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ installation: ref("INSTALLED") })).state, "INSTALLED");
});

test("active or Apple-received delivery prevents duplicates", () => {
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ submission: ref("UPLOADING", { submissionId: "s1" }) })).decision, "EXISTING_SUBMISSION_ACTIVE");
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ apple: ref("RECEIVED", { buildId: "b1" }) })).decision, "APPLE_ALREADY_RECEIVED");
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ apple: ref("PROCESSING", { buildId: "b1" }) })).decision, "APPLE_PROCESSING");
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ testflight: ref("INTERNAL_AVAILABLE") })).decision, "TESTFLIGHT_AVAILABLE");
});

test("ambiguous, stale, and mismatched provider observations fail closed", () => {
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ submission: ref("FINISHED", { submissionId: "s1" }) })).decision, "AMBIGUOUS_FAIL_CLOSED");
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ submission: ref("FAILED", { submissionId: "s1" }) })).decision, "AMBIGUOUS_FAIL_CLOSED");
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ apple: { ...ref("PROCESSING"), artifactSha256: digest("9") } })).decision, "AMBIGUOUS_FAIL_CLOSED");
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ submission: ref("UNKNOWN") })).decision, "AMBIGUOUS_FAIL_CLOSED");
});

test("proved transfer failure reuses the valid artifact without rebuild", () => {
  const result = reconcileExactArtifactDeliveryState(delivery({ submission: ref("FAILED", { submissionId: "s1" }), failureBoundary: { proved: true, kind: "NETWORK_TRANSFER" } }));
  assert.equal(result.decision, "SAFE_TO_CREATE_SUBMISSION");
  assert.equal(result.state, "SIGNED_ARTIFACT_READY");
});

test("invalid artifact requires rebuild and cannot inherit delivery state", () => {
  assert.equal(reconcileExactArtifactDeliveryState({ artifact: { ...artifact, valid: false } }).decision, "ARTIFACT_INVALID_REBUILD_REQUIRED");
  assert.equal(reconcileExactArtifactDeliveryState(delivery({ submission: { ...ref("QUEUED"), artifactId: "other" } })).ok, false);
});

test("resumable receipt is hash-bound, minimal, and rejects sensitive fields", () => {
  const snapshot = delivery({ submission: ref("QUEUED", { submissionId: "s1" }) });
  const receipt = createResumableDeliveryReceipt(snapshot);
  assert.match(receipt.receiptHash, /^[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(receipt).includes("signedUrl"), false);
  assert.throws(() => createResumableDeliveryReceipt({ ...snapshot, accessToken: "not-allowed" }), /SENSITIVE/);
});

const automation = (platform) => ({
  platform,
  app: { identityHash: digest("1") },
  device: { identityHash: digest("2"), visible: true, trusted: true, developerAuthorized: true },
  transport: { adb: "HEALTHY" },
  wda: { state: "HEALTHY" },
  tunnel: { state: "HEALTHY" },
  appium: { state: "HEALTHY" },
  session: { state: "HEALTHY" },
});

test("Android reconstruction restarts only stale ADB/session boundaries", () => {
  const snapshot = automation("android");
  snapshot.transport.adb = "STOPPED";
  snapshot.session.state = "STALE";
  assert.deepEqual(reconstructPhysicalAutomation(snapshot).restart, ["RESTART_ADB_AND_RECONNECT_EXACT_DEVICE", "RECREATE_UIAUTOMATOR2_SESSION_FOR_EXACT_APP"]);
});

test("iOS reconstruction orders WDA, tunnel, Appium, and exact session", () => {
  const snapshot = automation("ios");
  snapshot.wda.state = snapshot.tunnel.state = snapshot.appium.state = snapshot.session.state = "STOPPED";
  assert.deepEqual(reconstructPhysicalAutomation(snapshot).restart, ["RESTART_WDA_FOR_EXACT_DEVICE", "RESTART_EXISTING_AUTHORIZED_TUNNEL", "RESTART_APPIUM", "RECREATE_XCUITEST_SESSION_FOR_EXACT_APP"]);
});

test("genuine trust loss requests Owner action while ordinary restart does not", () => {
  const trustLost = automation("ios");
  trustLost.device.trusted = false;
  assert.equal(reconstructPhysicalAutomation(trustLost).classification, "REAL_OWNER_AUTHORIZATION_REQUIRED");
  const stopped = automation("ios");
  stopped.appium.state = "STOPPED";
  assert.equal(reconstructPhysicalAutomation(stopped).classification, "NORMAL_RESTART_OR_RECONNECTION");
});

test("wrong device/app identity and invisible device cannot become healthy", () => {
  const wrongApp = automation("android");
  wrongApp.app.identityHash = "bad";
  assert.equal(reconstructPhysicalAutomation(wrongApp).ok, false);
  const invisible = automation("ios");
  invisible.device.visible = false;
  assert.equal(reconstructPhysicalAutomation(invisible).ok, false);
});

test("#489 lifecycle closes defects 5 and 6 without duplicate implementation", () => {
  assert.equal(RELEASE_DEFECT_DISPOSITIONS["RDA-CP-P1-CURRENT-TRUTH-AUTHORITY-DRIFT-005"], "RESOLVED_BY_489");
  assert.equal(RELEASE_DEFECT_DISPOSITIONS["RDA-CP-P1-PROTECTED-MAIN-MERGE-MODEL-006"], "RESOLVED_BY_489");
  assert.equal(transitionLifecycle("MERGED_NORMAL_VERIFIED", "TERMINAL_TRUTH").ok, true);
  assert.equal(transitionLifecycle("OWNER_DEFERRED", "TERMINAL_TRUTH").ok, true);
  assert.equal(transitionLifecycle("AUTHORIZED_IMPLEMENTATION", "TERMINAL_TRUTH").ok, false);
  assert.equal(evaluateLifecycleAuthority({ stage: "AUTHORIZED_IMPLEMENTATION", admissionValid: true }).implementation, true);
  assert.equal(evaluateLifecycleAuthority({ stage: "AUTHORIZED_IMPLEMENTATION", admissionValid: false }).implementation, false);
});

test("terminal synchronization reaches one assurance fixed point", () => {
  const base = sha("1");
  const source = sha("2");
  const tree = sha("3");
  const record = {
    mainSha: base,
    activeTaskBinding: null,
    controlPlaneLifecycle: { contractId: CONTROL_PLANE_LIFECYCLE_CONTRACT, currentStage: "TERMINAL_TRUTH" },
    finiteTaskRuntime: { exceptionalTerminalOutcome: { mergeSha: base } },
  };
  const result = fixedPointAcceptsAdvancement({ record, observation: { parents: [base, source], sourceHead: source, tree, sourceTree: tree, changedPaths: ["scripts/assurance/current-truth.mjs"] }, policy, expectedFirstParent: base });
  assert.equal(result.ok, true);
  assert.equal(fixedPointAcceptsAdvancement({ record, observation: { parents: [sha("9"), source], sourceHead: source, tree, sourceTree: tree, changedPaths: ["scripts/assurance/current-truth.mjs"] }, policy, expectedFirstParent: base }).ok, false);
});

test("canonical publisher and controls remain the only governed mutation entry points", () => {
  const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["ota:internal-v2"], "node ./scripts/publish-internal-v2-ota.mjs");
  const publisher = fs.readFileSync(new URL("../scripts/publish-internal-v2-ota.mjs", import.meta.url), "utf8");
  assert.match(publisher, /--binary-receipt/);
  assert.match(publisher, /refs\/heads\/main/);
  assert.match(publisher, /scripts\/verify-internal-v2-ota-config\.mjs/);
  assert.equal(fs.existsSync(path.join(os.tmpdir(), "this-path-must-not-be-created")), false);
});
