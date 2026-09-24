import crypto from "node:crypto";

const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PLATFORMS = new Set(["android", "ios"]);
const ACTIVE_SUBMISSIONS = new Set(["QUEUED", "WORKER_ASSIGNED", "UPLOADING"]);
const SECRET_KEYS = /token|secret|credential|password|signedurl|deviceid|udid|private/i;

const stableValue = (value) => Array.isArray(value)
  ? value.map(stableValue)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
    : value;

export const stableReleaseJson = (value) => JSON.stringify(stableValue(value));
export const releaseHash = (value) => crypto.createHash("sha256")
  .update(typeof value === "string" ? value : stableReleaseJson(value))
  .digest("hex");

export const IOS_DELIVERY_STATES = Object.freeze([
  "SIGNED_ARTIFACT_READY",
  "SUBMISSION_CREATED",
  "EAS_SUBMIT_QUEUED",
  "SUBMISSION_WORKER_ASSIGNED",
  "APPLE_UPLOAD_ACCEPTED",
  "APPLE_PROCESSING",
  "TESTFLIGHT_INTERNAL_AVAILABLE",
  "INSTALLED",
  "DELIVERY_BLOCKED",
]);

export const IOS_RETRY_DECISIONS = Object.freeze([
  "SAFE_TO_CREATE_SUBMISSION",
  "EXISTING_SUBMISSION_ACTIVE",
  "APPLE_ALREADY_RECEIVED",
  "APPLE_PROCESSING",
  "TESTFLIGHT_AVAILABLE",
  "AMBIGUOUS_FAIL_CLOSED",
  "ARTIFACT_INVALID_REBUILD_REQUIRED",
]);

export const RELEASE_DEFECT_DISPOSITIONS = Object.freeze({
  "RDA-CP-P1-OTA-PLATFORM-PROVENANCE-001": "RESOLVED_BY_THIS_TASK",
  "RDA-CP-P1-IOS-DELIVERY-BOUNDARY-002": "RESOLVED_BY_THIS_TASK",
  "RDA-CP-P1-IOS-DUPLICATE-SUBMISSION-003": "RESOLVED_BY_THIS_TASK",
  "RDA-CP-P1-PHYSICAL-AUTOMATION-RESTART-004": "RESOLVED_BY_THIS_TASK",
  "RDA-CP-P1-CURRENT-TRUTH-AUTHORITY-DRIFT-005": "RESOLVED_BY_489",
  "RDA-CP-P1-PROTECTED-MAIN-MERGE-MODEL-006": "RESOLVED_BY_489",
});

export function validateOtaPublicationPlan(plan) {
  const findings = [];
  const platform = plan?.platform;
  if (!PLATFORMS.has(platform)) findings.push("OTA_PLATFORM_INVALID");
  if (plan?.environment !== "production") findings.push("OTA_ENVIRONMENT_INVALID");
  if (plan?.channel !== `${platform}-internal-v2`) findings.push("OTA_CHANNEL_PLATFORM_MISMATCH");
  if (!SHA40.test(plan?.source?.sha ?? "")) findings.push("OTA_SOURCE_SHA_INVALID");
  if (!SHA40.test(plan?.source?.tree ?? "")) findings.push("OTA_SOURCE_TREE_INVALID");
  if (plan?.source?.clean !== true || plan?.source?.protectedMain !== true) findings.push("OTA_SOURCE_NOT_EXACT_PROTECTED_MAIN");
  if (plan?.activation !== "APP_OWNED") findings.push("OTA_ACTIVATION_POLICY_INVALID");
  const expectedRuntime = platform === "ios" ? "1.0.0-ios-production-v2" : "1.0.0-android-production-v2";
  if (plan?.runtimeVersion !== expectedRuntime) findings.push("OTA_RUNTIME_PLATFORM_MISMATCH");
  const binary = plan?.signedBinary;
  if (!binary || binary.platform !== platform) findings.push("OTA_BINARY_PLATFORM_MISMATCH");
  if (binary?.runtimeVersion !== plan?.runtimeVersion) findings.push("OTA_BINARY_RUNTIME_INCOMPATIBLE");
  if (!SHA256.test(binary?.artifactSha256 ?? "")) findings.push("OTA_BINARY_DIGEST_INVALID");
  if (!SHA40.test(binary?.sourceSha ?? "") || !SHA40.test(binary?.sourceTree ?? "")) findings.push("OTA_BINARY_SOURCE_INVALID");
  if (binary?.revoked === true || binary?.valid !== true) findings.push("OTA_BINARY_INVALID");
  const required = [...new Set(plan?.requiredNativeCapabilities ?? [])].sort();
  const provided = new Set(binary?.nativeCapabilities ?? []);
  if (required.some((capability) => !provided.has(capability))) findings.push("OTA_NATIVE_CAPABILITY_MISMATCH");
  if (platform === "android" && required.includes("ios-native-calls")) findings.push("OTA_CROSS_PLATFORM_CAPABILITY");
  const expectedPlanHash = releaseHash({
    schemaVersion: 1,
    platform,
    environment: plan?.environment,
    channel: plan?.channel,
    runtimeVersion: plan?.runtimeVersion,
    activation: plan?.activation,
    source: plan?.source,
    signedBinary: binary,
    requiredNativeCapabilities: required,
  });
  if (plan?.planHash !== expectedPlanHash) findings.push("OTA_PLAN_HASH_INVALID");
  return { ok: findings.length === 0, findings: [...new Set(findings)].sort(), planHash: expectedPlanHash };
}

export function createOtaPublicationPlan({ platform, sourceSha, sourceTree, runtimeVersion, signedBinary, clean = true, protectedMain = true }) {
  const plan = {
    schemaVersion: 1,
    platform,
    environment: "production",
    channel: `${platform}-internal-v2`,
    runtimeVersion,
    activation: "APP_OWNED",
    source: { sha: sourceSha, tree: sourceTree, clean, protectedMain },
    signedBinary,
    requiredNativeCapabilities: platform === "ios" ? ["ios-native-calls"] : [],
  };
  plan.planHash = releaseHash(plan);
  return plan;
}

export function validatePublishedUpdateReadback(readback, plan) {
  const updates = Array.isArray(readback) ? readback : readback?.updates;
  const findings = [];
  if (!Array.isArray(updates) || updates.length !== 1) return { ok: false, findings: ["OTA_UPDATE_CARDINALITY_INVALID"] };
  const update = updates[0];
  const group = update?.group ?? update?.groupId ?? update?.updateGroup;
  const branch = update?.branchName ?? update?.branch;
  if (typeof update?.id !== "string" || update.id.length < 8) findings.push("OTA_UPDATE_ID_INVALID");
  if (typeof group !== "string" || group.length < 8) findings.push("OTA_UPDATE_GROUP_INVALID");
  if (update?.platform !== plan?.platform) findings.push("OTA_UPDATE_PLATFORM_MISMATCH");
  if (update?.runtimeVersion !== plan?.runtimeVersion) findings.push("OTA_UPDATE_RUNTIME_MISMATCH");
  if (branch !== plan?.channel) findings.push("OTA_UPDATE_CHANNEL_MISMATCH");
  const marker = `source:${plan?.source?.sha} tree:${plan?.source?.tree} plan:${plan?.planHash}`;
  if (typeof update?.message !== "string" || !update.message.includes(marker)) findings.push("OTA_UPDATE_SOURCE_BINDING_MISSING");
  return {
    ok: findings.length === 0,
    findings: [...new Set(findings)].sort(),
    receipt: findings.length ? null : { updateId: update.id, updateGroup: group, platform: update.platform, runtimeVersion: update.runtimeVersion, channel: branch, sourceSha: plan.source.sha, sourceTree: plan.source.tree, planHash: plan.planHash },
  };
}

const artifactValid = (artifact) => artifact?.valid === true
  && artifact?.revoked !== true
  && SHA256.test(artifact?.sha256 ?? "")
  && SHA40.test(artifact?.sourceSha ?? "")
  && SHA40.test(artifact?.sourceTree ?? "")
  && typeof artifact?.artifactId === "string" && artifact.artifactId.length > 0;

const exactArtifactReference = (reference, artifact) => reference == null
  || reference?.artifactId === artifact.artifactId && reference?.artifactSha256 === artifact.sha256;

export function reconcileExactArtifactDeliveryState(snapshot) {
  const artifact = snapshot?.artifact;
  if (!artifactValid(artifact)) {
    return { ok: true, state: "DELIVERY_BLOCKED", decision: "ARTIFACT_INVALID_REBUILD_REQUIRED", findings: ["ARTIFACT_IDENTITY_INVALID"] };
  }
  const references = [snapshot?.submission, snapshot?.apple, snapshot?.testflight, snapshot?.installation].filter(Boolean);
  if (references.some((reference) => !exactArtifactReference(reference, artifact))) {
    return { ok: false, state: "DELIVERY_BLOCKED", decision: "AMBIGUOUS_FAIL_CLOSED", findings: ["ARTIFACT_PROVIDER_IDENTITY_MISMATCH"] };
  }
  const submission = snapshot?.submission;
  const apple = snapshot?.apple;
  const testflight = snapshot?.testflight;
  const installation = snapshot?.installation;
  if (installation?.state === "INSTALLED") return { ok: true, state: "INSTALLED", decision: "TESTFLIGHT_AVAILABLE", findings: [] };
  if (testflight?.state === "INTERNAL_AVAILABLE") return { ok: true, state: "TESTFLIGHT_INTERNAL_AVAILABLE", decision: "TESTFLIGHT_AVAILABLE", findings: [] };
  if (apple?.state === "PROCESSING") return { ok: true, state: "APPLE_PROCESSING", decision: "APPLE_PROCESSING", findings: [] };
  if (apple?.state === "VALID") return { ok: true, state: "APPLE_UPLOAD_ACCEPTED", decision: "APPLE_ALREADY_RECEIVED", findings: [] };
  if (apple?.state === "RECEIVED") return { ok: true, state: "APPLE_UPLOAD_ACCEPTED", decision: "APPLE_ALREADY_RECEIVED", findings: [] };
  if (apple?.state === "REJECTED") return { ok: true, state: "DELIVERY_BLOCKED", decision: "ARTIFACT_INVALID_REBUILD_REQUIRED", findings: ["APPLE_REJECTED_ARTIFACT"] };
  if (submission && ACTIVE_SUBMISSIONS.has(submission.state)) {
    return { ok: true, state: submission.state === "QUEUED" ? "EAS_SUBMIT_QUEUED" : "SUBMISSION_WORKER_ASSIGNED", decision: "EXISTING_SUBMISSION_ACTIVE", findings: [] };
  }
  if (submission?.state === "FINISHED") {
    return { ok: false, state: "DELIVERY_BLOCKED", decision: "AMBIGUOUS_FAIL_CLOSED", findings: ["EAS_FINISHED_APPLE_RECEIPT_UNVERIFIED"] };
  }
  if (submission?.state === "FAILED" && snapshot?.failureBoundary?.proved !== true) {
    return { ok: false, state: "DELIVERY_BLOCKED", decision: "AMBIGUOUS_FAIL_CLOSED", findings: ["SUBMISSION_FAILURE_BOUNDARY_UNPROVEN"] };
  }
  if (submission && !["CREATED", "FAILED"].includes(submission.state)) {
    return { ok: false, state: "DELIVERY_BLOCKED", decision: "AMBIGUOUS_FAIL_CLOSED", findings: ["SUBMISSION_STATE_UNKNOWN"] };
  }
  return {
    ok: true,
    state: submission?.state === "CREATED" ? "SUBMISSION_CREATED" : "SIGNED_ARTIFACT_READY",
    decision: "SAFE_TO_CREATE_SUBMISSION",
    findings: [],
  };
}

function containsSensitiveKey(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => SECRET_KEYS.test(key) || containsSensitiveKey(nested));
}

export function createResumableDeliveryReceipt(snapshot, result = reconcileExactArtifactDeliveryState(snapshot)) {
  if (containsSensitiveKey(snapshot)) throw new Error("DELIVERY_SNAPSHOT_CONTAINS_SENSITIVE_FIELD");
  const receipt = {
    schemaVersion: 1,
    artifact: {
      artifactId: snapshot.artifact.artifactId,
      sha256: snapshot.artifact.sha256,
      sourceSha: snapshot.artifact.sourceSha,
      sourceTree: snapshot.artifact.sourceTree,
      buildNumber: snapshot.artifact.buildNumber ?? null,
    },
    providerReferences: {
      submissionId: snapshot.submission?.submissionId ?? null,
      appleBuildId: snapshot.apple?.buildId ?? null,
    },
    state: result.state,
    decision: result.decision,
    findings: result.findings,
  };
  return { ...receipt, receiptHash: releaseHash(receipt) };
}

export function reconstructPhysicalAutomation(snapshot) {
  const findings = [];
  if (!PLATFORMS.has(snapshot?.platform)) findings.push("AUTOMATION_PLATFORM_INVALID");
  if (!SHA256.test(snapshot?.app?.identityHash ?? "")) findings.push("AUTOMATION_APP_IDENTITY_INVALID");
  if (!SHA256.test(snapshot?.device?.identityHash ?? "")) findings.push("AUTOMATION_DEVICE_IDENTITY_INVALID");
  if (snapshot?.device?.visible !== true) findings.push("AUTOMATION_DEVICE_NOT_VISIBLE");
  if (snapshot?.device?.trusted !== true || snapshot?.device?.developerAuthorized !== true) {
    return { ok: false, classification: "REAL_OWNER_AUTHORIZATION_REQUIRED", findings: [...new Set([...findings, "DEVICE_TRUST_OR_DEVELOPER_AUTHORIZATION_REQUIRED"])].sort(), restart: [] };
  }
  const restart = [];
  if (snapshot.platform === "android") {
    if (snapshot?.transport?.adb !== "HEALTHY") restart.push("RESTART_ADB_AND_RECONNECT_EXACT_DEVICE");
    if (snapshot?.session?.state !== "HEALTHY") restart.push("RECREATE_UIAUTOMATOR2_SESSION_FOR_EXACT_APP");
  } else {
    if (snapshot?.wda?.state !== "HEALTHY") restart.push("RESTART_WDA_FOR_EXACT_DEVICE");
    if (snapshot?.tunnel?.state !== "HEALTHY") restart.push("RESTART_EXISTING_AUTHORIZED_TUNNEL");
    if (snapshot?.appium?.state !== "HEALTHY") restart.push("RESTART_APPIUM");
    if (snapshot?.session?.state !== "HEALTHY") restart.push("RECREATE_XCUITEST_SESSION_FOR_EXACT_APP");
  }
  if (findings.length) return { ok: false, classification: "AUTOMATION_RECONSTRUCTION_BLOCKED", findings: [...new Set(findings)].sort(), restart };
  return {
    ok: true,
    classification: restart.length ? "NORMAL_RESTART_OR_RECONNECTION" : "AUTOMATION_SESSION_HEALTHY",
    findings: [],
    restart,
    bindingHash: releaseHash({ platform: snapshot.platform, app: snapshot.app.identityHash, device: snapshot.device.identityHash }),
  };
}
