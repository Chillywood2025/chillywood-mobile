import {
  ANDROID_PRODUCTION_RELEASE_MANIFEST,
  IOS_QA_RELEASE_MANIFEST,
} from "../_shared/release-manifest-contract.generated.mjs";
import { classifyIosReleaseAutonomy, sanitizeAutonomousReadback } from "../_shared/ios-autonomous-operator-policy.mjs";
import type { ScopedOperatorHandler } from "../_shared/scoped-operator.ts";

type JsonObject = Record<string, unknown>;
const toObject = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const text = (value: unknown) => String(value ?? "").trim();
const providerRoot = (payload: JsonObject) => toObject(payload.provider_readback ?? payload.providerReadback);
const platformReadback = (payload: JsonObject, platform: "ios" | "android") => {
  const root = providerRoot(payload);
  const nested = toObject(root[platform]);
  return Object.keys(nested).length ? nested : root;
};
const observed = (complete: boolean, value: unknown) => complete && value !== undefined && value !== null && text(value) ? value : null;

const insertCapability = async (client: any, row: JsonObject) => {
  const { error } = await client.from("autonomous_provider_readback_capabilities").insert({
    money_moved: false, user_rights_changed: false, high_risk_executed: false,
    metadata: sanitizeAutonomousReadback(row.metadata ?? {}), ...row,
  });
  if (error) throw error;
};

export const runSharedReleaseProbe: ScopedOperatorHandler = async ({ client }) => {
  const end = new Date().toISOString();
  const { data: attestations, error } = await client.from("release_binary_attestations")
    .select("platform,attestation_status,verified_at").limit(100);
  const complete = !error;
  const { error: snapshotError } = await client.from("release_health_snapshots").insert({
    system_id: "release_ota_operator", platform: "shared", health_state: complete ? "healthy" : "unknown",
    environment_mode: "production", data_source: "release_manifests+binary_attestation_control_plane",
    readback_complete: complete, window_start: null, window_end: end,
    user_rights_changed: false, money_moved: false,
    metadata: sanitizeAutonomousReadback({ manifestCount: 2, attestationCount: Array.isArray(attestations) ? attestations.length : 0, releaseActionExecuted: false }),
  });
  if (snapshotError) throw snapshotError;
  return { readbackComplete: complete, platform: "shared", source: "release_manifests+binary_attestation_control_plane", dataWindow: { start: null, end }, healthState: complete ? "healthy" : "unknown", reasons: complete ? [] : ["binary_attestation_readback_unavailable"], moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};

export const runIosReleaseAutonomyProbe: ScopedOperatorHandler = async ({ client, payload, metadata }) => {
  const readback = platformReadback(payload, "ios");
  const eas = toObject(readback.eas);
  const asc = toObject(readback.appStoreConnect);
  const easBuildComplete = eas.readbackComplete === true;
  const easChannelComplete = easBuildComplete || eas.channelReadbackComplete === true;
  const ascComplete = asc.readbackComplete === true;
  const windowEnd = new Date().toISOString();

  const { data: attestation, error: attestationError } = await client.from("release_binary_attestations")
    .select("id,platform,bundle_identifier,app_version,native_build,runtime_version,channel,distribution_source,source_commit,binary_sha256,app_store_connect_build_id,attestation_status,verified_at")
    .eq("platform", "ios").eq("binary_sha256", IOS_QA_RELEASE_MANIFEST.binarySha256).limit(1).maybeSingle();
  if (attestationError) throw attestationError;
  const ascBuildId = text(asc.latestBuildId);
  const attestationId = text(attestation?.id);
  const attestationMatchesAsc = ascComplete && Boolean(attestationId) && ascBuildId === text(attestation?.app_store_connect_build_id);
  if (attestationMatchesAsc && attestation?.attestation_status !== "verified") {
    const { error } = await client.from("release_binary_attestations").update({
      attestation_status: "verified", verified_at: windowEnd, verification_source: "app_store_connect_readback+reviewed_local_binary_manifest",
    }).eq("id", attestationId);
    if (error) throw error;
  }
  const binaryIdentityComplete = ascComplete && attestationMatchesAsc;
  const observedIdentity = binaryIdentityComplete ? attestation : null;
  const release = {
    platform: "ios",
    bundleIdentifier: observed(binaryIdentityComplete, observedIdentity?.bundle_identifier ?? asc.bundleIdentifier),
    appVersion: observed(binaryIdentityComplete, observedIdentity?.app_version),
    nativeBuild: observed(binaryIdentityComplete, observedIdentity?.native_build ?? asc.latestNativeBuild),
    channel: observed(easChannelComplete, eas.channel),
    runtimeVersion: observed(easChannelComplete, eas.runtimeVersion),
    distributionSource: observed(binaryIdentityComplete, observedIdentity?.distribution_source),
    sourceCommit: observed(binaryIdentityComplete, observedIdentity?.source_commit),
    updateId: observed(easChannelComplete, eas.updateId),
    updateGroup: observed(easChannelComplete, eas.updateGroup),
    processingStatus: observed(ascComplete, asc.processingState),
    artifactAvailable: easBuildComplete ? eas.artifactAvailable === true : null,
    rollbackTargetAvailable: easChannelComplete ? eas.rollbackTargetAvailable === true : false,
    embeddedLaunch: easBuildComplete ? eas.embeddedLaunch === true : false,
    emergencyLaunch: easBuildComplete ? eas.emergencyLaunch === true : false,
    sourceChangedAfterBuild: easBuildComplete ? eas.sourceChangedAfterBuild === true : false,
  };
  const classification = classifyIosReleaseAutonomy({
    eas: { readbackComplete: easChannelComplete },
    appStoreConnect: { readbackComplete: ascComplete, externalGroupCount: asc.externalGroupCount, publicSubmissionPresent: asc.publicSubmissionPresent, publicReleasePresent: asc.publicReleasePresent },
    binaryIdentityComplete,
    channelReadbackComplete: easChannelComplete,
    release,
  }, IOS_QA_RELEASE_MANIFEST);
  if (!binaryIdentityComplete && !classification.reasons.includes("local_binary_attestation_unverified")) classification.reasons.push("local_binary_attestation_unverified");

  for (const capability of [
    { provider: "eas", complete: easChannelComplete, name: "channel_update_readback", reason: eas.reason },
    { provider: "eas", complete: eas.cloudBuildReadbackComplete === true, name: "cloud_build_inventory_readback", reason: eas.reason },
    { provider: "app_store_connect", complete: ascComplete, name: "build_testflight_release_readback", reason: asc.reason },
    { provider: "local_binary_attestation", complete: binaryIdentityComplete, name: "local_binary_identity", reason: "app_store_attestation_match_required" },
  ]) {
    await insertCapability(client, {
      system_id: "release_ota_operator", platform: "ios", provider: capability.provider, capability: capability.name,
      capability_state: capability.complete ? "available" : "unavailable",
      missing_capability: capability.complete ? null : String(capability.reason ?? "provider_readback_unavailable"),
      readback_complete: capability.complete, data_source: "host_read_only_provider_adapter+release_binary_attestation",
      app_version: release.appVersion, native_build: release.nativeBuild, bundle_identifier: release.bundleIdentifier,
      runtime_version: release.runtimeVersion, channel: release.channel, update_id: release.updateId,
      distribution_source: release.distributionSource, provider_environment: null,
      metadata: { expectedIdentity: IOS_QA_RELEASE_MANIFEST, observedIdentityAvailable: capability.complete },
    });
  }

  const identity = {
    platform: "ios", app_version: release.appVersion, native_build: release.nativeBuild,
    bundle_identifier: release.bundleIdentifier, runtime_version: release.runtimeVersion, channel: release.channel,
    update_id: release.updateId, distribution_source: release.distributionSource, provider_environment: null,
    data_source: "eas+app_store_connect+local_binary_attestation", readback_complete: classification.readbackComplete && binaryIdentityComplete,
    window_start: null, window_end: windowEnd, user_rights_changed: false, money_moved: false,
  };
  const healthState = binaryIdentityComplete ? classification.healthState : classification.healthState === "critical" ? "critical" : "blocked";
  const { error: snapshotError } = await client.from("release_health_snapshots").insert({
    system_id: "release_ota_operator", health_state: healthState, embedded_launch: release.embeddedLaunch,
    emergency_launch: release.emergencyLaunch, environment_mode: "production", ...identity,
    metadata: sanitizeAutonomousReadback({ reasons: classification.reasons, expectedIdentity: IOS_QA_RELEASE_MANIFEST, observedIdentity: release, processingStatus: release.processingStatus, updateGroup: release.updateGroup, internalGroupAssigned: ascComplete ? asc.internalGroupAssigned === true : null, externalGroupCount: ascComplete ? Number(asc.externalGroupCount ?? 0) : null, publicSubmissionPresent: ascComplete ? asc.publicSubmissionPresent === true : null, publicReleasePresent: ascComplete ? asc.publicReleasePresent === true : null, rollbackTargetAvailable: release.rollbackTargetAvailable, releaseActionExecuted: false }),
  });
  if (snapshotError) throw snapshotError;

  const { error: diagnosticError } = await client.from("ota_diagnostics_readback_records").insert({
    system_id: "release_ota_operator", embedded_launch: release.embeddedLaunch, emergency_launch: release.emergencyLaunch,
    environment_mode: "production", ...identity,
    metadata: sanitizeAutonomousReadback({ buildId: observed(easBuildComplete, eas.buildId), appStoreBuildId: observed(ascComplete, asc.latestBuildId), localBuildAbsentFromEasCloudInventory: eas.expectedCloudBuildPresent === false }),
  });
  if (diagnosticError) throw diagnosticError;

  const { error: rollbackError } = await client.from("rollback_readiness_records").insert({
    system_id: "release_ota_operator", readiness_state: release.rollbackTargetAvailable ? "ready" : "blocked",
    rollback_available: release.rollbackTargetAvailable, environment_mode: "production", ...identity,
    readback_complete: easChannelComplete, data_source: "eas_host_adapter", metadata: sanitizeAutonomousReadback({ noRollbackExecuted: true }),
  });
  if (rollbackError) throw rollbackError;

  const { error: eventError } = await client.from("release_operator_events").insert({
    system_id: "release_ota_operator", actor_type: "operator", actor_id: "release_ota_operator",
    action_id: "watch_once", result: healthState, environment_mode: "production", platform: "ios",
    user_rights_changed: false, money_moved: false,
    metadata: sanitizeAutonomousReadback({ scheduler: metadata.scheduler, source: metadata.source, readbackComplete: classification.readbackComplete && binaryIdentityComplete }),
  });
  if (eventError) throw eventError;
  return { readbackComplete: classification.readbackComplete && binaryIdentityComplete, platform: "ios", source: "eas+app_store_connect+local_binary_attestation", dataWindow: { start: null, end: windowEnd }, healthState, reasons: classification.reasons, expectedIdentity: IOS_QA_RELEASE_MANIFEST, observedIdentity: sanitizeAutonomousReadback(release), providerReadbackUnavailable: classification.providerReadbackUnavailable, releaseActionExecuted: false, moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};

export const runAndroidReleaseAutonomyProbe: ScopedOperatorHandler = async ({ client, payload }) => {
  const readback = platformReadback(payload, "android");
  const eas = toObject(readback.eas);
  const play = toObject(readback.googlePlay);
  const easComplete = eas.readbackComplete === true;
  const playComplete = play.readbackComplete === true;
  const complete = easComplete && playComplete;
  const end = new Date().toISOString();
  const release = {
    packageIdentifier: observed(playComplete, play.packageIdentifier),
    appVersion: observed(easComplete || playComplete, eas.appVersion ?? play.appVersion),
    nativeBuild: observed(playComplete, play.nativeBuild),
    channel: observed(easComplete, eas.channel),
    runtimeVersion: observed(easComplete, eas.runtimeVersion),
    distributionSource: observed(playComplete, play.distributionSource),
    sourceCommit: observed(easComplete, eas.sourceCommit),
    updateId: observed(easComplete, eas.updateId),
  };
  const reasons: string[] = [];
  if (!easComplete) reasons.push(String(eas.reason ?? "eas_android_readback_unavailable"));
  if (!playComplete) reasons.push(String(play.reason ?? "google_play_readback_unavailable"));
  if (complete && release.packageIdentifier !== ANDROID_PRODUCTION_RELEASE_MANIFEST.packageIdentifier) reasons.push("package_identifier_mismatch");
  if (complete && release.channel !== ANDROID_PRODUCTION_RELEASE_MANIFEST.channel) reasons.push("channel_mismatch");
  if (complete && release.runtimeVersion !== ANDROID_PRODUCTION_RELEASE_MANIFEST.runtimeVersion) reasons.push("runtime_version_mismatch");
  const healthState = complete ? reasons.length ? "degraded" : "healthy" : "blocked";
  for (const capability of [
    { provider: "eas", complete: easComplete, reason: eas.reason, capability: "android_build_channel_update_readback" },
    { provider: "google_play", complete: playComplete, reason: play.reason, capability: "android_internal_track_readback" },
  ]) await insertCapability(client, {
    system_id: "release_ota_operator", platform: "android", provider: capability.provider, capability: capability.capability,
    capability_state: capability.complete ? "available" : "unavailable", missing_capability: capability.complete ? null : String(capability.reason ?? "provider_readback_unavailable"),
    readback_complete: capability.complete, data_source: "host_read_only_provider_adapter", app_version: release.appVersion,
    native_build: release.nativeBuild, bundle_identifier: release.packageIdentifier, runtime_version: release.runtimeVersion,
    channel: release.channel, update_id: release.updateId, distribution_source: release.distributionSource, provider_environment: null,
    metadata: { expectedIdentity: ANDROID_PRODUCTION_RELEASE_MANIFEST },
  });
  const { error } = await client.from("release_health_snapshots").insert({
    system_id: "release_ota_operator", platform: "android", health_state: healthState, environment_mode: "production",
    bundle_identifier: release.packageIdentifier, app_version: release.appVersion, native_build: release.nativeBuild,
    runtime_version: release.runtimeVersion, channel: release.channel, update_id: release.updateId,
    distribution_source: release.distributionSource, provider_environment: null,
    data_source: "eas+google_play_host_adapter", readback_complete: complete, window_start: null, window_end: end,
    user_rights_changed: false, money_moved: false,
    metadata: sanitizeAutonomousReadback({ reasons, expectedIdentity: ANDROID_PRODUCTION_RELEASE_MANIFEST, observedIdentity: release, externalTestingChanged: false, releaseActionExecuted: false }),
  });
  if (error) throw error;
  return { readbackComplete: complete, platform: "android", source: "eas+google_play_host_adapter", dataWindow: { start: null, end }, healthState, reasons, expectedIdentity: ANDROID_PRODUCTION_RELEASE_MANIFEST, observedIdentity: sanitizeAutonomousReadback(release), releaseActionExecuted: false, moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};

export const runReleaseAutonomyProbe = runIosReleaseAutonomyProbe;
