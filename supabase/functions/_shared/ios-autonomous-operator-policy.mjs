import { IOS_QA_RELEASE_MANIFEST } from "./release-manifest-contract.generated.mjs";

export const AUTONOMOUS_PLATFORMS = Object.freeze(["shared", "ios", "android", "web", "unknown"]);
export const IOS_QA_RELEASE_EXPECTATION = IOS_QA_RELEASE_MANIFEST;

const SECRET_KEY = /(secret|token|password|credential|authorization|api[_-]?key|service[_-]?role|private[_-]?key|signed[_-]?url|receipt|session[_-]?cookie|p12|p8)/i;
const SAFE_AGGREGATE_KEY = /^(activeTokenCount|revokedTokenCount|invalidTokenCount)$/;
const LONG_CREDENTIAL = /[A-Za-z0-9._~+/=-]{48,}/g;
const LONG_CREDENTIAL_TEST = /[A-Za-z0-9._~+/=-]{48,}/;

export const normalizeAutonomousPlatform = (value) => {
  const normalized = String(value ?? "unknown").trim().toLowerCase();
  return AUTONOMOUS_PLATFORMS.includes(normalized) ? normalized : "unknown";
};

export const sanitizeAutonomousReadback = (value, depth = 0) => {
  if (depth > 8) return "[redacted-depth]";
  if (Array.isArray(value)) return value.slice(0, 200).map((entry) => sanitizeAutonomousReadback(entry, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_KEY.test(key) || SAFE_AGGREGATE_KEY.test(key))
        .slice(0, 200)
        .map(([key, entry]) => [key, sanitizeAutonomousReadback(entry, depth + 1)]),
    );
  }
  if (typeof value === "string") {
    return value.replace(LONG_CREDENTIAL, "[redacted]").slice(0, 500);
  }
  return value;
};

export const containsForbiddenAutonomousEvidence = (value) => {
  if (Array.isArray(value)) return value.some(containsForbiddenAutonomousEvidence);
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, entry]) => (
      (SECRET_KEY.test(key) && !SAFE_AGGREGATE_KEY.test(key)) || containsForbiddenAutonomousEvidence(entry)
    ));
  }
  return typeof value === "string" && LONG_CREDENTIAL_TEST.test(value);
};

export const matchesIosBinaryAttestation = (attestation, appStoreConnect, expected = IOS_QA_RELEASE_EXPECTATION) => {
  if (appStoreConnect?.readbackComplete !== true || !attestation) return false;
  return [
    [attestation.platform, expected.platform],
    [attestation.bundle_identifier, expected.bundleIdentifier],
    [attestation.app_version, expected.appVersion],
    [attestation.native_build, expected.nativeBuild],
    [attestation.runtime_version, expected.runtimeVersion],
    [attestation.channel, expected.channel],
    [attestation.distribution_source, expected.distributionSource],
    [attestation.source_commit, expected.sourceCommit],
    [attestation.binary_sha256, expected.binarySha256],
    [attestation.app_store_connect_build_id, expected.appStoreConnectBuildId],
    [appStoreConnect.bundleIdentifier, attestation.bundle_identifier],
    [appStoreConnect.attestedAppVersion, attestation.app_version],
    [appStoreConnect.attestedNativeBuild, attestation.native_build],
    [appStoreConnect.attestedBuildId, attestation.app_store_connect_build_id],
  ].every(([actual, required]) => String(actual ?? "") === String(required ?? ""));
};

const asCount = (value) => Math.max(0, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0);

export const classifyNotificationAutonomy = (input) => {
  const readbackComplete = input?.readbackComplete === true;
  const deliveryRail = input?.deliveryRail !== false;
  const providerConfigured = input?.providerConfigured === true;
  const rolloutEnabled = input?.rolloutEnabled === true;
  const activeTokens = asCount(input?.activeTokenCount);
  const revokedTokens = asCount(input?.revokedTokenCount);
  const attempts = asCount(input?.attemptCount);
  const successes = asCount(input?.successfulAttemptCount);
  const failures = asCount(input?.failedAttemptCount);
  const invalidTokens = asCount(input?.invalidTokenCount);
  const retryBacklog = asCount(input?.retryBacklog);
  const capped = asCount(input?.cappedAttemptCount);
  const unresolvedCritical = asCount(input?.unresolvedCriticalCount);
  const failureRate = attempts > 0 ? failures / attempts : 0;

  let healthState = "backend_readback_complete";
  let finding = null;
  if (!readbackComplete) {
    healthState = "unknown";
    finding = "provider_readback_unavailable";
  } else if (capped > 0 || unresolvedCritical > 0) {
    healthState = "critical";
    finding = "terminal_retry_capped";
  } else if (retryBacklog > 20 || failureRate >= 0.2) {
    healthState = "degraded";
    finding = "delivery_failure_rate_high";
  } else if (invalidTokens > 0 || failures > 0 || retryBacklog > 0) {
    healthState = "degraded";
    finding = invalidTokens > 0 ? "invalid_token_evidence" : "delivery_recovery_pending";
  } else if (deliveryRail && !providerConfigured) {
    healthState = "unknown";
    finding = "provider_configuration_unavailable";
  } else if (deliveryRail && !rolloutEnabled) {
    healthState = "rollout_disabled";
  } else if (deliveryRail && activeTokens === 0) {
    healthState = "no_active_install";
  } else if (deliveryRail && attempts === 0) {
    healthState = "idle_no_delivery_evidence";
  } else if (deliveryRail && successes > 0 && failures === 0) {
    healthState = "delivery_evidence_healthy";
  } else if (deliveryRail && providerConfigured) {
    healthState = "configured_ready";
  } else if (!deliveryRail) {
    healthState = "healthy";
  }

  return {
    healthState,
    finding,
    readbackComplete,
    backendState: readbackComplete ? "backend_readback_complete" : "unknown",
    configurationState: !readbackComplete ? "unknown" : providerConfigured ? "configured_ready" : "unknown",
    deliveryEvidenceState: !deliveryRail ? "not_applicable" : successes > 0 && failures === 0 ? "delivery_evidence_healthy" : attempts === 0 ? "idle_no_delivery_evidence" : failures > 0 ? "degraded" : "configured_ready",
    rolloutEnabled,
    providerConfigured,
    activeTokenCount: activeTokens,
    revokedTokenCount: revokedTokens,
    attemptCount: attempts,
    successfulAttemptCount: successes,
    failedAttemptCount: failures,
    invalidTokenCount: invalidTokens,
    retryBacklog,
    cappedAttemptCount: capped,
    failureRate,
    moneyMoved: false,
    userRightsChanged: false,
    highRiskExecuted: false,
  };
};

export const classifyIosReleaseAutonomy = (input, expected = IOS_QA_RELEASE_EXPECTATION) => {
  const easAvailable = input?.eas?.readbackComplete === true;
  const ascAvailable = input?.appStoreConnect?.readbackComplete === true;
  const binaryIdentityComplete = input?.binaryIdentityComplete === undefined
    ? ascAvailable
    : input.binaryIdentityComplete === true;
  const channelReadbackComplete = input?.channelReadbackComplete === undefined
    ? easAvailable
    : input.channelReadbackComplete === true;
  const reasons = [];
  if (!easAvailable) reasons.push("eas_provider_readback_unavailable");
  if (!ascAvailable) reasons.push("app_store_connect_provider_readback_unavailable");

  const actual = input?.release ?? {};
  const mismatchFields = [
    ...(binaryIdentityComplete ? [
      ["bundleIdentifier", expected.bundleIdentifier],
      ["appVersion", expected.appVersion],
      ["nativeBuild", expected.nativeBuild],
      ["distributionSource", expected.distributionSource],
      ["sourceCommit", expected.sourceCommit],
    ] : []),
    ...(channelReadbackComplete ? [
      ["channel", expected.channel],
      ["runtimeVersion", expected.runtimeVersion],
    ] : []),
  ].filter(([field, expectedValue]) => String(actual?.[field] ?? "") !== String(expectedValue));
  reasons.push(...mismatchFields.map(([field]) => `${field}_mismatch`));

  if (Number(input?.appStoreConnect?.externalGroupCount ?? 0) > 0) reasons.push("external_testflight_enabled");
  if (input?.appStoreConnect?.publicSubmissionPresent === true) reasons.push("public_submission_present");
  if (input?.appStoreConnect?.publicReleasePresent === true) reasons.push("public_release_present");
  if (input?.release?.emergencyLaunch === true) reasons.push("emergency_launch");
  if (input?.release?.embeddedLaunch === true) reasons.push("embedded_launch");
  if (channelReadbackComplete && !input?.release?.rollbackTargetAvailable) reasons.push("rollback_target_missing");
  if (binaryIdentityComplete && input?.release?.sourceChangedAfterBuild === true) reasons.push("source_changed_after_build");

  const providerBlocked = !easAvailable || !ascAvailable;
  const critical = reasons.some((reason) => ["external_testflight_enabled", "public_submission_present", "public_release_present"].includes(reason));
  const healthState = critical ? "critical" : reasons.length ? (providerBlocked ? "blocked" : "degraded") : "healthy";
  return {
    healthState,
    reasons,
    readbackComplete: easAvailable && ascAvailable,
    providerReadbackUnavailable: providerBlocked,
    moneyMoved: false,
    userRightsChanged: false,
    highRiskExecuted: false,
    releaseActionExecuted: false,
  };
};

export const classifyIosObservabilityAutonomy = (input) => {
  const availableSources = Object.values(input?.providers ?? {}).filter((provider) => provider?.readbackComplete === true).length;
  const requiredSources = Object.keys(input?.providers ?? {}).length;
  const missingCapabilities = Object.entries(input?.providers ?? {})
    .filter(([, provider]) => provider?.readbackComplete !== true)
    .map(([name]) => name);
  const nativeCrashes = asCount(input?.nativeCrashCount);
  const jsFatals = asCount(input?.jsFatalCount);
  const startupFailures = asCount(input?.startupFailureCount);
  const performanceRegressions = asCount(input?.performanceRegressionCount);
  const analyticsFailures = asCount(input?.analyticsDeliveryFailureCount);
  const backendErrorRate = Math.max(0, Number(input?.backendErrorRatePercent ?? 0));
  const runtimeMismatch = input?.runtimeMismatch === true || input?.channelMismatch === true || input?.updateMismatch === true;

  const findings = [];
  if (nativeCrashes > 0) findings.push("native_crash_cluster");
  if (jsFatals > 0) findings.push("javascript_fatal_cluster");
  if (startupFailures > 0) findings.push("startup_failure");
  if (performanceRegressions > 0) findings.push("performance_regression");
  if (analyticsFailures > 0) findings.push("analytics_delivery_failure");
  if (backendErrorRate >= 5) findings.push("backend_error_rate_spike");
  if (runtimeMismatch) findings.push("runtime_channel_update_mismatch");
  if (input?.embeddedLaunch === true) findings.push("embedded_launch");
  if (input?.emergencyLaunch === true) findings.push("emergency_launch");
  findings.push(...missingCapabilities.map((name) => `${name}_provider_unavailable`));

  const critical = nativeCrashes > 0 || startupFailures > 0 || input?.emergencyLaunch === true;
  const readbackComplete = requiredSources > 0 && availableSources === requiredSources;
  const healthState = critical ? "critical" : findings.length ? (availableSources === 0 ? "unknown" : "degraded") : readbackComplete ? "healthy" : "unknown";
  return {
    healthState,
    findings,
    missingCapabilities,
    readbackComplete,
    moneyMoved: false,
    userRightsChanged: false,
    highRiskExecuted: false,
  };
};

export const IOS_PHYSICAL_PROOF_BLOCKERS = Object.freeze([
  "ios_universal_link_proof_pending",
  "ios_push_proof_pending",
  "ios_voip_proof_pending",
  "ios_storekit_proof_pending",
]);

export const classifyIosInstalledQaReadiness = (input, expected = IOS_QA_RELEASE_EXPECTATION) => {
  const release = input?.release ?? {};
  const blockers = [];
  const providerReadbackComplete = input?.providerReadbackComplete === true;
  if (!providerReadbackComplete) {
    blockers.push("ios_provider_readback_blocked");
  } else {
    if (release?.internalBuildAvailable !== true) blockers.push("ios_testflight_build_unavailable");
    if (String(release?.runtimeVersion ?? "") !== expected.runtimeVersion) blockers.push("ios_runtime_mismatch");
    if (String(release?.channel ?? "") !== expected.channel) blockers.push("ios_channel_mismatch");
    if (String(release?.sourceCommit ?? "") !== expected.sourceCommit) blockers.push("ios_source_commit_mismatch");
    if (String(release?.bundleIdentifier ?? "") !== expected.bundleIdentifier || String(release?.nativeBuild ?? "") !== expected.nativeBuild) blockers.push("ios_native_capability_missing");
    if (release?.externalGroupCount > 0 || release?.publicSubmissionPresent === true) blockers.push("ios_provider_readback_blocked");
  }

  const flags = input?.clientCapabilities ?? {};
  if (!["nativeCallsBuildEnabled", "nativeCallsRuntimeEnabled", "ordinaryPushEnabled", "revenueCatAppStoreEnabled"].every((key) => flags[key] === true)) {
    blockers.push("ios_native_capability_missing");
  }

  if (input?.physicalEvidenceAvailable !== true) blockers.push("ios_physical_proof_required", ...IOS_PHYSICAL_PROOF_BLOCKERS);
  if (Number(input?.availablePhysicalDeviceCount ?? 0) < 2) blockers.push("ios_second_device_required");

  const uniqueBlockers = [...new Set(blockers)];
  let readinessState = "source_ready";
  if (uniqueBlockers.includes("ios_testflight_build_unavailable")) readinessState = "blocked";
  else if (uniqueBlockers.some((blocker) => ["ios_runtime_mismatch", "ios_channel_mismatch", "ios_source_commit_mismatch", "ios_native_capability_missing"].includes(blocker))) readinessState = "failed";
  else if (uniqueBlockers.includes("ios_provider_readback_blocked")) readinessState = "blocked";
  else if (uniqueBlockers.includes("ios_physical_proof_required")) readinessState = "physical_proof_required";
  else if (uniqueBlockers.includes("ios_second_device_required")) readinessState = "second_device_required";
  else if (release?.internalBuildAvailable === true) readinessState = "internal_build_ready";

  return {
    readinessState,
    blockers: uniqueBlockers,
    sourceReady: !uniqueBlockers.some((blocker) => ["ios_runtime_mismatch", "ios_channel_mismatch", "ios_source_commit_mismatch", "ios_native_capability_missing"].includes(blocker)),
    fakePhysicalProof: false,
    moneyMoved: false,
    userRightsChanged: false,
    highRiskExecuted: false,
  };
};
