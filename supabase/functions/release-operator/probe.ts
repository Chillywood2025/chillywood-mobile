import { classifyIosReleaseAutonomy, IOS_QA_RELEASE_EXPECTATION, sanitizeAutonomousReadback } from "../_shared/ios-autonomous-operator-policy.mjs";
import type { ScopedOperatorHandler } from "../_shared/scoped-operator.ts";

type JsonObject = Record<string, unknown>;
const toObject = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};

export const runReleaseAutonomyProbe: ScopedOperatorHandler = async ({ client, payload, metadata }) => {
  const providerReadback = toObject(payload.provider_readback ?? payload.providerReadback);
  const eas = toObject(providerReadback.eas);
  const asc = toObject(providerReadback.appStoreConnect);
  const easComplete = eas.readbackComplete === true;
  const ascComplete = asc.readbackComplete === true;
  const windowEnd = new Date().toISOString();
  const release = {
    platform: "ios",
    bundleIdentifier: asc.bundleIdentifier ?? IOS_QA_RELEASE_EXPECTATION.bundleIdentifier,
    appVersion: eas.appVersion ?? null,
    nativeBuild: eas.nativeBuild ?? asc.latestNativeBuild ?? null,
    channel: eas.channel ?? null,
    runtimeVersion: eas.runtimeVersion ?? null,
    distributionSource: asc.internalGroupAssigned === true ? "testflight_internal" : "unknown",
    sourceCommit: eas.sourceCommit ?? null,
    updateId: eas.updateId ?? null,
    updateGroup: eas.updateGroup ?? null,
    processingStatus: asc.processingState ?? eas.processingStatus ?? null,
    artifactAvailable: eas.artifactAvailable === true,
    rollbackTargetAvailable: eas.rollbackTargetAvailable === true,
    embeddedLaunch: eas.embeddedLaunch === true,
    emergencyLaunch: eas.emergencyLaunch === true,
    sourceChangedAfterBuild: eas.sourceChangedAfterBuild === true,
  };
  const classification = classifyIosReleaseAutonomy({
    eas: { readbackComplete: easComplete },
    appStoreConnect: {
      readbackComplete: ascComplete,
      externalGroupCount: asc.externalGroupCount,
      publicSubmissionPresent: asc.publicSubmissionPresent,
      publicReleasePresent: asc.publicReleasePresent,
    },
    release,
  });

  for (const capability of [
    { provider: "eas", complete: easComplete, name: "build_channel_update_readback", reason: eas.reason },
    { provider: "app_store_connect", complete: ascComplete, name: "build_testflight_release_readback", reason: asc.reason },
  ]) {
    const { error } = await client.from("autonomous_provider_readback_capabilities").insert({
      system_id: "release_ota_operator",
      platform: "ios",
      provider: capability.provider,
      capability: capability.name,
      capability_state: capability.complete ? "available" : "unavailable",
      missing_capability: capability.complete ? null : String(capability.reason ?? "provider_readback_unavailable"),
      readback_complete: capability.complete,
      data_source: "host_read_only_provider_adapter",
      app_version: release.appVersion,
      native_build: release.nativeBuild,
      bundle_identifier: release.bundleIdentifier,
      runtime_version: release.runtimeVersion,
      channel: release.channel,
      update_id: release.updateId,
      distribution_source: release.distributionSource,
      money_moved: false,
      user_rights_changed: false,
      high_risk_executed: false,
      metadata: sanitizeAutonomousReadback({ status: capability.complete ? "readback_complete" : "provider_readback_unavailable" }),
    });
    if (error) throw error;
  }

  const identity = {
    platform: "ios",
    app_version: release.appVersion,
    native_build: release.nativeBuild,
    bundle_identifier: release.bundleIdentifier,
    runtime_version: release.runtimeVersion,
    channel: release.channel,
    update_id: release.updateId,
    distribution_source: release.distributionSource,
    provider_environment: "production",
    data_source: "eas+app_store_connect_host_adapter",
    readback_complete: classification.readbackComplete,
    window_start: null,
    window_end: windowEnd,
    user_rights_changed: false,
    money_moved: false,
  };
  const { error: snapshotError } = await client.from("release_health_snapshots").insert({
    system_id: "release_ota_operator",
    health_state: classification.healthState,
    embedded_launch: release.embeddedLaunch,
    emergency_launch: release.emergencyLaunch,
    environment_mode: "production",
    ...identity,
    metadata: sanitizeAutonomousReadback({
      reasons: classification.reasons,
      expected: IOS_QA_RELEASE_EXPECTATION,
      processingStatus: release.processingStatus,
      artifactAvailable: release.artifactAvailable,
      updateGroup: release.updateGroup,
      internalGroupAssigned: asc.internalGroupAssigned === true,
      externalGroupCount: Number(asc.externalGroupCount ?? 0),
      publicSubmissionPresent: asc.publicSubmissionPresent === true,
      publicReleasePresent: asc.publicReleasePresent === true,
      rollbackTargetAvailable: release.rollbackTargetAvailable,
      sourceCommit: release.sourceCommit,
      releaseActionExecuted: false,
    }),
  });
  if (snapshotError) throw snapshotError;

  const { error: diagnosticError } = await client.from("ota_diagnostics_readback_records").insert({
    system_id: "release_ota_operator",
    embedded_launch: release.embeddedLaunch,
    emergency_launch: release.emergencyLaunch,
    environment_mode: "production",
    ...identity,
    metadata: sanitizeAutonomousReadback({ buildId: eas.buildId ?? null, latestBuildId: asc.latestBuildId ?? null }),
  });
  if (diagnosticError) throw diagnosticError;

  for (const reason of classification.reasons) {
    const critical = ["external_testflight_enabled", "public_submission_present", "public_release_present"].includes(reason);
    const { error } = await client.from("rollout_anomaly_findings").insert({
      system_id: "release_ota_operator",
      anomaly_type: reason,
      severity: critical ? "critical" : "warning",
      environment_mode: "production",
      ...identity,
      metadata: sanitizeAutonomousReadback({ releaseActionExecuted: false }),
    });
    if (error) throw error;
  }

  const { error: rollbackError } = await client.from("rollback_readiness_records").insert({
    system_id: "release_ota_operator",
    readiness_state: release.rollbackTargetAvailable ? "ready" : "blocked",
    rollback_available: release.rollbackTargetAvailable,
    environment_mode: "production",
    ...identity,
    readback_complete: easComplete,
    data_source: "eas_host_adapter",
    metadata: sanitizeAutonomousReadback({ noRollbackExecuted: true }),
  });
  if (rollbackError) throw rollbackError;

  const { error: eventError } = await client.from("release_operator_events").insert({
    system_id: "release_ota_operator",
    actor_type: "operator",
    actor_id: "release_ota_operator",
    action_id: "watch_once",
    result: classification.healthState,
    environment_mode: "production",
    platform: "ios",
    user_rights_changed: false,
    money_moved: false,
    metadata: sanitizeAutonomousReadback({ scheduler: metadata.scheduler, source: metadata.source, readbackComplete: classification.readbackComplete }),
  });
  if (eventError) throw eventError;

  return {
    readbackComplete: classification.readbackComplete,
    platform: "ios",
    source: "eas+app_store_connect_host_adapter",
    dataWindow: { start: null, end: windowEnd },
    healthState: classification.healthState,
    reasons: classification.reasons,
    release: sanitizeAutonomousReadback(release),
    providerReadbackUnavailable: classification.providerReadbackUnavailable,
    releaseActionExecuted: false,
    moneyMoved: false,
    userRightsChanged: false,
    highRiskExecuted: false,
  };
};
