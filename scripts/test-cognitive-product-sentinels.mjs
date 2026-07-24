import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const migration = read(
  "supabase/migrations/20260723203512_cognitive_two_party_activation_handoff.sql",
);
const dbTest = read("supabase/tests/cognitive_two_party_activation_handoff_test.sql");
const constitution = JSON.parse(
  read("config/intelligence/product-experience-constitution.json"),
);
const runnerConfig = JSON.parse(
  read("config/intelligence/sentinel-installed-runner.config.json"),
);
const baselineOptions = JSON.parse(
  read("config/intelligence/product-experience-baseline-options-v1.json"),
);
const baselineOptionsDoc = read(
  "docs/intelligence/CHILLYWOOD_PRODUCT_EXPERIENCE_BASELINE_OPTIONS_V1.md",
);
const readinessRunner = read("scripts/sentinel-runtime-readiness.mjs");
const canaryRunner = read("scripts/product-experience-canary-runner.mjs");
const packageJson = read("package.json");
const readinessReport = read("docs/intelligence/SENTINEL_RUNTIME_READINESS.md");

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
};
const canonicalSelectionHash = (option) =>
  crypto.createHash("sha256")
    .update(JSON.stringify(canonicalize({
      schemaVersion: baselineOptions.schemaVersion,
      optionsVersion: baselineOptions.optionsVersion,
      scope: baselineOptions.scope,
      commonRequirements: baselineOptions.commonRequirements,
      selectedOption: option,
    })))
    .digest("hex");
const contains = (needle, message) => assert(migration.includes(needle), message);

for (const switchKey of [
  "cognitive_livekit_experience_sentinel_enabled",
  "cognitive_visual_experience_sentinel_enabled",
  "cognitive_installed_journey_sentinel_enabled",
]) {
  contains(switchKey, `missing sentinel switch: ${switchKey}`);
}
for (const tableName of [
  "product_experience_baseline_versions",
  "product_experience_sentinel_runs",
  "product_quality_findings",
]) {
  contains(`create table public.${tableName}`, `missing sentinel table: ${tableName}`);
}
contains(
  "create function public.product_experience_record_sentinel_run",
  "missing service-only sentinel run RPC",
);
contains(
  "create function public.product_quality_record_finding",
  "missing service-only product finding RPC",
);
contains(
  "p_service_identity <> p_sentinel_key",
  "sentinel run RPC does not bind service identity to sentinel key",
);
contains(
  "public.governance_task_writes_allowed",
  "sentinel RPCs do not check emergency/task liveness",
);
contains(
  "p_result_status in ('passed','finding_created')",
  "sentinel RPC does not bind pass/finding status to installed proof",
);
contains(
  "tokenRequested','tokenReturned','websocketConnected'",
  "LiveKit sentinel RPC does not require staged LiveKit evidence",
);
contains(
  "'tokenIssuedElapsedMs','roomConnectElapsedMs'",
  "LiveKit sentinel RPC does not require bounded timing evidence",
);
contains(
  "(p_metric_manifest->>'tokenIssuedElapsedMs')::numeric between 0 and 3000",
  "LiveKit sentinel RPC does not enforce the token issuance deadline",
);
contains(
  "(p_metric_manifest->>'roomConnectElapsedMs')::numeric between 0 and 12000",
  "LiveKit sentinel RPC does not enforce the room connection deadline",
);
contains(
  "(p_metric_manifest->>'uiStateResolutionElapsedMs')::numeric between 0 and 15000",
  "LiveKit sentinel RPC does not enforce the installed UI resolution deadline",
);
contains(
  "(p_metric_manifest->>'firstRemoteMediaElapsedMs')::numeric between 0 and 20000",
  "LiveKit sentinel RPC does not enforce the remote media deadline",
);
contains(
  "(p_metric_manifest->>'tokenIssuedElapsedMs')::numeric not between 0 and 600000",
  "LiveKit sentinel findings do not cap persisted timing evidence",
);
contains(
  "jsonb_typeof(p_metric_manifest->'tokenReturned') <> 'boolean'",
  "LiveKit sentinel evidence does not enforce boolean metric types",
);
contains(
  "'baselineState','baselineComparisonHash'",
  "visual sentinel evidence does not require baseline state and comparison hash",
);
contains(
  "(p_metric_manifest->>'cardViewportWidthRatio')::numeric not between 0 and 2",
  "visual sentinel evidence does not bound card viewport ratio",
);
contains(
  "(p_metric_manifest->>'densityScore')::numeric not between 0 and 1",
  "visual sentinel evidence does not bound density score",
);
contains(
  "(p_metric_manifest->>'baselineState') not in",
  "visual sentinel evidence does not validate baseline state",
);
contains(
  "p_result_status = 'passed'",
  "visual sentinel pass does not require an approved baseline state",
);
contains(
  "p_physical_proof_status <> run_value.physical_proof_status",
  "product finding RPC does not bind proof status to the referenced sentinel run",
);
contains(
  "'expectedState','observedState','maxDurationMs','elapsedDurationMs'",
  "installed journey sentinel does not require bounded state and duration evidence",
);
contains(
  "(p_metric_manifest->>'resultState') not in",
  "installed journey sentinel does not validate result state values",
);
contains(
  "(p_metric_manifest->>'maxDurationMs')::integer not between 1 and 10000",
  "installed journey sentinel does not cap caller-supplied per-step duration",
);
contains(
  "(p_metric_manifest->>'screenshotEvidenceHash') !~ '^[a-f0-9]{64}$'",
  "installed journey sentinel does not validate screenshot proof hashes",
);
contains(
  "(p_metric_manifest->>'sourceRuntimeHash') !~ '^[a-f0-9]{64}$'",
  "installed journey sentinel does not validate source runtime hashes",
);
contains(
  "(p_metric_manifest->>'journeyStepCount')::integer not between 1 and 256",
  "installed journey sentinel does not bound journey step counts",
);
contains(
  "not run_value.evidence_manifest_hash = any(p_evidence_hashes)",
  "product finding RPC does not require the referenced sentinel evidence hash",
);
contains(
  "run_value.result_status not in ('finding_created','failed')",
  "product finding RPC allows passed sentinel runs to create governance findings",
);
contains(
  "run_value.sentinel_key <> 'visual_product_experience_sentinel'",
  "product finding RPC does not bind design-baseline findings to visual sentinel runs",
);
assert(
  dbTest.includes("installed journey sentinel rejects missing expected/observed state and duration evidence"),
  "database suite does not reject incomplete installed-journey evidence",
);
assert(
  dbTest.includes("LiveKit sentinel pass rejects missing bounded timing evidence"),
  "database suite does not reject LiveKit passes without bounded timing proof",
);
assert(
  dbTest.includes("LiveKit sentinel pass rejects constitution deadline violations"),
  "database suite does not reject LiveKit passes that violate timing deadlines",
);
assert(
  dbTest.includes("LiveKit sentinel finding rejects unbounded timing evidence"),
  "database suite does not reject LiveKit findings with unbounded timing evidence",
);
assert(
  dbTest.includes("visual sentinel rejects unbounded metric, hash, and aspect-ratio evidence"),
  "database suite does not reject malformed visual metric evidence",
);
assert(
  dbTest.includes("visual sentinel accepts bounded baseline-review finding evidence"),
  "database suite does not accept bounded visual baseline-review evidence",
);
assert(
  dbTest.includes("installed journey sentinel pass rejects caller-overstated timing limits"),
  "database suite does not reject installed-journey passes with overstated duration limits",
);
assert(
  dbTest.includes("installed journey sentinel rejects malformed hashes and impossible step counts"),
  "database suite does not reject malformed installed-journey hashes and step counts",
);
assert(
  dbTest.includes("installed journey sentinel accepts bounded expected/observed state evidence"),
  "database suite does not accept complete installed-journey evidence",
);
assert(
  dbTest.includes("product triage rejects passed visual run as a governance finding"),
  "database suite does not reject findings from passed sentinel runs",
);
assert(
  dbTest.includes("expired sentinel evidence receives controlled retention tombstone"),
  "database suite does not prove expired sentinel evidence can be tombstoned",
);
assert(
  dbTest.includes("retention tombstone records immutable erasure event"),
  "database suite does not prove retention tombstone audit events",
);
assert(
  migration.includes("product_experience_sentinel_runs_retention_idx") &&
    migration.includes("product_quality_findings_retention_idx"),
  "sentinel and finding evidence lack retention indexes",
);
assert(
  migration.includes("product_experience_erase_expired_evidence") &&
    migration.includes("product_experience_evidence_mutation_guard"),
  "sentinel and finding evidence lack controlled retention tombstoning",
);
contains(
  "entered_collective_governance",
  "product findings do not enter collective governance",
);
contains(
  "new_binary_or_ota_required",
  "sentinel evidence does not preserve new-binary/OTA blocker status",
);
assert(
  constitution.status === "needs_product_baseline_review",
  "constitution must not silently approve the current visual baseline",
);
assert(
  constitution.ownerApprovalVersion === "not_approved_yet",
  "constitution must not fabricate Owner baseline approval",
);
const expectedBaselineSelectionHashes = {
  A: "29b2c09ded4add3fba577e1195d3da20d0e1015ba81e88f73b1319593f0c27c9",
  B: "9e891de1b46cd19405b43178dbd34ed0ea1d96b4eebcc7b404f4f3d9f6ba3dc5",
  C: "0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184",
};
assert(
  baselineOptions.status === "owner_selection_required",
  "baseline alternatives must remain pending exact Owner selection",
);
assert(
  baselineOptions.options.length === 3,
  "baseline alternatives must contain exactly A, B, and C",
);
for (const option of baselineOptions.options) {
  const expectedHash = expectedBaselineSelectionHashes[option.option];
  assert(!!expectedHash, `unexpected baseline option: ${option.option}`);
  if (!expectedHash) continue;
  assert(
    canonicalSelectionHash(option) === expectedHash,
    `canonical baseline selection hash changed for option ${option.option}`,
  );
  assert(
    baselineOptionsDoc.includes(expectedHash),
    `baseline Owner approval request omits option ${option.option} hash`,
  );
}
for (const section of [
  "mobileFirstPrinciples",
  "streamingContentDensity",
  "routeCompletionExpectations",
  "loadingStateDeadlines",
  "cardMetrics",
  "breakpoints",
  "screenshotProvenance",
]) {
  assert(section in constitution, `missing constitution section: ${section}`);
}
assert(
  runnerConfig.newBinaryOrOtaRequiredStatus === "NEW_BINARY_OR_OTA_REQUIRED",
  "sentinel runner config must preserve the exact new binary/OTA blocker label",
);
for (const scriptName of [
  "sentinel:readiness-inventory",
  "sentinel:canary:self-test",
  "sentinel:canary:livekit",
  "sentinel:canary:visual",
  "sentinel:canary:journey",
]) {
  assert(packageJson.includes(scriptName), `missing package script: ${scriptName}`);
}
for (const phrase of [
  "storeRawTesterIdentities",
  "storeRawDeviceIds",
  "storeRawLogs",
  "storeRawScreenshots",
  "mayBuild",
  "mayPublishOta",
  "mayDeploy",
  "mayChangeProviderProducts",
  "livekit_experience",
  "visual_experience_metrics",
  "installed_journey",
]) {
  assert(
    JSON.stringify(runnerConfig).includes(phrase),
    `sentinel runner config missing: ${phrase}`,
  );
}
for (const phrase of [
  "rawLogsCaptured: false",
  "rawScreenshotsCaptured: false",
  "NEW_BINARY_OR_OTA_REQUIRED",
  "NO_ARTIFACT_CHANGE_REQUIRED",
  "INTERNAL_QA_OTA_REQUIRED",
  "INTERNAL_QA_BINARY_REQUIRED",
  "noArtifactInstalledCanarySubset",
  "const liveKitEligibleForVerification = hasInstalledTarget",
  "release-diagnostics-runtime-version",
  "emitLiveKitRenderTelemetryEvent",
  "--prerequisite-availability=",
  "availability_input_mode_must_be_0600",
  "availability_input_must_be_outside_git",
  "availability_input_lifetime_exceeds_six_hours",
  "sanitized_operator_availability_input_valid",
  "attested_unverified",
  "ready_with_attestation",
  "passStateGrantedByAvailabilityInput: false",
  "hashId(serial)",
  "dumpsys",
  "simctl",
]) {
  assert(readinessRunner.includes(phrase), `readiness runner missing: ${phrase}`);
}
for (const phrase of [
  "sanitized_installed_evidence_required",
  "NEW_BINARY_OR_OTA_REQUIRED",
  "classifyLiveKit",
  "classifyVisual",
  "classifyJourney",
  "unsanitized_sensitive_key",
  "unsanitized_jwt_value",
]) {
  assert(canaryRunner.includes(phrase), `canary runner missing: ${phrase}`);
}
for (const phrase of [
  "Android internal build",
  "NO_ARTIFACT_CHANGE_REQUIRED",
  "iOS internal/simulator build",
  "INTERNAL_QA_BINARY_REQUIRED",
  "Synthetic account availability",
  "LiveKit participant availability",
  "Provider/backend telemetry availability",
  "No build, OTA publish, deployment",
]) {
  assert(readinessReport.includes(phrase), `readiness report missing: ${phrase}`);
}

const fixtureHash = (seed) => crypto.createHash("sha256").update(seed).digest("hex");
const availabilityDir = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-sentinel-availability-"));
fs.chmodSync(availabilityDir, 0o700);
const runReadiness = (availabilityPath) => {
  const result = spawnSync(process.execPath, [
    path.join(root, "scripts/sentinel-runtime-readiness.mjs"),
    `--prerequisite-availability=${availabilityPath}`,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });
  if (result.status !== 0) return { result, report: null };
  try {
    return { result, report: JSON.parse(result.stdout) };
  } catch {
    return { result, report: null };
  }
};

try {
  const issuedAt = new Date(Date.now() - 60_000).toISOString();
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const validFixture = {
    schemaVersion: 1,
    operatorProvided: true,
    inputEvidenceHash: fixtureHash("operator-availability-input"),
    issuedAt,
    expiresAt,
    syntheticAccountAvailability: {
      available: true,
      count: 2,
      labels: [...runnerConfig.approvedSyntheticFixtureContract.requiredLabels],
      evidenceHash: fixtureHash("synthetic-account-set"),
    },
    liveKitParticipantAvailability: {
      available: true,
      count: 2,
      labels: ["installed_app", "headless_sdk"],
      evidenceHash: fixtureHash("livekit-participant-set"),
    },
    providerBackendTelemetryAvailability: {
      availableReadOnly: true,
      providerFamily: "provider_family",
      backendFamily: "backend_family",
      evidenceHash: fixtureHash("read-only-telemetry"),
    },
  };
  const validPath = path.join(availabilityDir, "valid.json");
  fs.writeFileSync(validPath, `${JSON.stringify(validFixture)}\n`, { mode: 0o600 });
  const validRun = runReadiness(validPath);
  assert(validRun.result.status === 0, "valid prerequisite availability inventory did not exit zero");
  assert(validRun.report?.prerequisiteAvailabilityInput?.status === "attested_unverified", "valid availability input claimed authenticated verification");
  assert(validRun.report?.canaryReadiness?.syntheticAccountAvailability?.status === "attested_unverified", "synthetic availability claimed PASS");
  assert(validRun.report?.canaryReadiness?.liveKitParticipantAvailability?.status === "attested_unverified", "LiveKit participant availability claimed PASS");
  assert(validRun.report?.canaryReadiness?.providerBackendReadOnlyTelemetryAvailability?.status === "attested_unverified", "telemetry availability claimed PASS");
  const installedTargetAvailable = validRun.report?.android?.artifactDecision === "NO_ARTIFACT_CHANGE_REQUIRED"
    || validRun.report?.ios?.artifactDecision === "NO_ARTIFACT_CHANGE_REQUIRED";
  if (installedTargetAvailable) {
    assert(validRun.report?.canaryReadiness?.livekitExperienceCanary?.status === "ready_with_attestation", "availability input exceeded bounded LiveKit readiness");
    assert(validRun.report?.canaryReadiness?.noArtifactInstalledCanarySubset?.eligibleForIndependentVerification?.length === 3, "availability input did not expose the bounded independent-verification subset");
    assert(validRun.report?.canaryReadiness?.noArtifactInstalledCanarySubset?.passStateGrantedByAvailabilityInput === false, "availability input granted a canary PASS");
  } else {
    assert(validRun.report?.canaryReadiness?.livekitExperienceCanary?.status === "blocked", "availability input bypassed the installed-target requirement");
    assert(validRun.report?.canaryReadiness?.noArtifactInstalledCanarySubset?.eligibleForIndependentVerification?.length === 0, "availability input invented an installed-target canary subset");
  }
  const validReportText = JSON.stringify(validRun.report);
  assert(!validReportText.includes(validPath), "readiness report exposed the availability-input path");
  assert(!validReportText.includes(validFixture.inputEvidenceHash), "readiness report exposed the operator input evidence hash");
  assert(!validReportText.includes(validFixture.syntheticAccountAvailability.evidenceHash), "readiness report exposed a prerequisite evidence hash");

  const wrongModePath = path.join(availabilityDir, "wrong-mode.json");
  fs.writeFileSync(wrongModePath, `${JSON.stringify(validFixture)}\n`, { mode: 0o600 });
  fs.chmodSync(wrongModePath, 0o644);
  const wrongModeRun = runReadiness(wrongModePath);
  assert(wrongModeRun.result.status === 0, "wrong-mode prerequisite inventory did not fail closed cleanly");
  assert(wrongModeRun.report?.prerequisiteAvailabilityInput?.status === "invalid", "wrong-mode availability input was not rejected");
  assert(wrongModeRun.report?.prerequisiteAvailabilityInput?.reason === "availability_input_mode_must_be_0600", "wrong-mode rejection reason changed");
  assert(wrongModeRun.report?.canaryReadiness?.syntheticAccountAvailability?.status === "blocked", "wrong-mode input enabled synthetic accounts");
  assert(wrongModeRun.report?.canaryReadiness?.liveKitParticipantAvailability?.status === "blocked", "wrong-mode input enabled LiveKit participants");
  assert(wrongModeRun.report?.canaryReadiness?.providerBackendReadOnlyTelemetryAvailability?.status === "blocked", "wrong-mode input enabled telemetry");

  const unknownFieldPath = path.join(availabilityDir, "unknown-field.json");
  fs.writeFileSync(unknownFieldPath, `${JSON.stringify({
    ...validFixture,
    unexpectedField: "rejected",
  })}\n`, { mode: 0o600 });
  const unknownFieldRun = runReadiness(unknownFieldPath);
  assert(unknownFieldRun.result.status === 0, "unknown-field prerequisite inventory did not fail closed cleanly");
  assert(unknownFieldRun.report?.prerequisiteAvailabilityInput?.status === "invalid", "unknown-field availability input was not rejected");
  assert(unknownFieldRun.report?.prerequisiteAvailabilityInput?.reason === "availability_input_top_level_schema_invalid", "unknown-field rejection reason changed");
  assert(unknownFieldRun.report?.canaryReadiness?.syntheticAccountAvailability?.status === "blocked", "unknown-field input enabled synthetic accounts");
  assert(!JSON.stringify(unknownFieldRun.report).includes("rejected"), "invalid prerequisite content was reflected in the report");

  const expiredPath = path.join(availabilityDir, "expired.json");
  fs.writeFileSync(expiredPath, `${JSON.stringify({
    ...validFixture,
    issuedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    expiresAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  })}\n`, { mode: 0o600 });
  const expiredRun = runReadiness(expiredPath);
  assert(expiredRun.result.status === 0, "expired prerequisite inventory did not fail closed cleanly");
  assert(expiredRun.report?.prerequisiteAvailabilityInput?.status === "expired", "expired availability input was not rejected");
  assert(expiredRun.report?.canaryReadiness?.liveKitParticipantAvailability?.status === "blocked", "expired input enabled LiveKit participants");
} finally {
  fs.rmSync(availabilityDir, { recursive: true, force: true });
}

const classifyLiveKit = (metrics) => {
  if (
    metrics.backendTokenState === "healthy" &&
    metrics.roomConnected === true &&
    metrics.uiState === "connecting" &&
    metrics.firstRemoteMediaMs === null
  ) {
    return {
      reproductionState: "likely_defect",
      suspectedLayer: "installed_ui_state",
    };
  }
  return { reproductionState: "unproven_hypothesis", suspectedLayer: "unknown" };
};

const classifyVisual = (metrics) => {
  const max = constitution.cardMetrics.maximumCardViewportWidthRatio.phone;
  if (metrics.cardViewportWidthRatio > max) {
    return {
      reproductionState: constitution.status === "needs_product_baseline_review"
        ? "design_baseline_missing"
        : "likely_defect",
      suspectedLayer: "layout_density",
    };
  }
  return { reproductionState: "false_positive", suspectedLayer: "unknown" };
};

const classifyJourney = (metrics) => {
  const maxMs = constitution.loadingStateDeadlines.defaultRouteResolutionMs;
  if (metrics.loadingStateMs > maxMs && metrics.resultState !== "success") {
    return {
      reproductionState: "likely_defect",
      suspectedLayer: "loading_state",
    };
  }
  return { reproductionState: "false_positive", suspectedLayer: "unknown" };
};

assert(
  classifyLiveKit({
    backendTokenState: "healthy",
    roomConnected: true,
    uiState: "connecting",
    firstRemoteMediaMs: null,
  }).suspectedLayer === "installed_ui_state",
  "LiveKit fixture does not distinguish backend health from installed UI state",
);
assert(
  classifyVisual({ cardViewportWidthRatio: 0.94 }).reproductionState ===
    "design_baseline_missing",
  "visual fixture does not require baseline review before redesign authority",
);
assert(
  classifyJourney({ loadingStateMs: 20000, resultState: "loading" }).suspectedLayer ===
    "loading_state",
  "journey fixture does not classify unresolved loading states",
);

if (failures.length > 0) {
  console.error("cognitive product sentinel contract failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("cognitive product sentinel contract passed");
