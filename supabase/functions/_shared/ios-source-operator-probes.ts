import { IOS_QA_RELEASE_EXPECTATION, sanitizeAutonomousReadback } from "./ios-autonomous-operator-policy.mjs";
import type { ScopedOperatorHandler } from "./scoped-operator.ts";

const nowWindow = () => {
  const end = new Date();
  return { start: new Date(end.getTime() - 30 * 60 * 1000).toISOString(), end: end.toISOString() };
};
const present = (name: string) => Boolean(String(Deno.env.get(name) ?? "").trim());
const safeIdentity = (release: Record<string, unknown> | null | undefined) => ({
  platform: "ios",
  bundle_identifier: release?.bundle_identifier ?? IOS_QA_RELEASE_EXPECTATION.bundleIdentifier,
  app_version: release?.app_version ?? IOS_QA_RELEASE_EXPECTATION.appVersion,
  native_build: release?.native_build ?? IOS_QA_RELEASE_EXPECTATION.nativeBuild,
  runtime_version: release?.runtime_version ?? null,
  channel: release?.channel ?? null,
  update_id: release?.update_id ?? null,
  distribution_source: release?.distribution_source ?? "unknown",
  provider_environment: "production",
});
const latestRelease = async (client: any) => {
  const result = await client.from("release_health_snapshots")
    .select("bundle_identifier,app_version,native_build,runtime_version,channel,update_id,distribution_source,readback_complete,created_at")
    .eq("platform", "ios").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw result.error;
  return result.data as Record<string, unknown> | null;
};
const capability = async (client: any, input: Record<string, unknown>) => {
  const { error } = await client.from("autonomous_provider_readback_capabilities").insert({
    platform: "ios",
    provider_environment: "production",
    money_moved: false,
    user_rights_changed: false,
    high_risk_executed: false,
    ...input,
    metadata: sanitizeAutonomousReadback(input.metadata ?? {}),
  });
  if (error) throw error;
};

export const runIosSecuritySourceProbe: ScopedOperatorHandler = async ({ client }) => {
  const window = nowWindow();
  const release = await latestRelease(client);
  const identity = safeIdentity(release);
  const presence = {
    apnsCredential: present("APNS_KEY_ID") || present("APNS_KEY_PATH") || present("APNS_PRIVATE_KEY"),
    appStoreCredential: present("APP_STORE_CONNECT_KEY_ID") && present("APP_STORE_CONNECT_ISSUER_ID"),
    teamIdentifier: present("APPLE_TEAM_ID") || present("IOS_TEAM_ID"),
  };
  const providerReadbackComplete = false;
  for (const [provider, available] of Object.entries({ apns: presence.apnsCredential, app_store_connect: presence.appStoreCredential, apple_signing: false })) {
    await capability(client, {
      system_id: "security_owner_operator", provider, capability: "credential_or_signing_status_by_name",
      capability_state: available ? "available" : "unavailable", readback_complete: provider === "apple_signing" ? false : available,
      missing_capability: available ? null : `${provider}_readback_unavailable`, data_source: "edge_secret_presence_by_name+read_only_provider_status", ...identity,
      window_start: window.start, window_end: window.end,
      metadata: { presenceState: available ? "PRESENT" : "MISSING", valuesReturned: false, credentialMutated: false },
    });
  }
  const { error } = await client.from("security_health_snapshots").insert({
    system_id: "security_owner_operator", health_state: "unknown", critical_finding_count: 0, warning_count: 1,
    environment_mode: "production", user_rights_changed: false, money_moved: false,
    ...identity, data_source: "credential_presence_names+release_identity", readback_complete: providerReadbackComplete,
    window_start: window.start, window_end: window.end,
    metadata: sanitizeAutonomousReadback({ presence, signingCertificateStatus: "provider_readback_unavailable", provisioningProfileStatus: "provider_readback_unavailable", bundleTeamMismatch: "unknown", credentialMutated: false }),
  });
  if (error) throw error;
  return { readbackComplete: false, platform: "ios", source: "credential_presence_names+release_identity", dataWindow: window, healthState: "unknown", missingCapabilities: ["signing_certificate_status", "provisioning_profile_status"], moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};

export const runIosPrivacySourceProbe: ScopedOperatorHandler = async ({ client }) => {
  const window = nowWindow();
  const release = await latestRelease(client);
  const identity = safeIdentity(release);
  const sourceContract = {
    privacyManifestSourceHashSha256: "1b8a6364af132c8312c9283edaf152559dc40cab9da5c2d5e518f461be06800f",
    generatedManifestSourceConfigured: true,
    tracking: false,
    trackingDomainsEmpty: true,
    purposeStringsComplete: true,
    accountDeletionRoutePresent: true,
    ugcReportBlockSupportSourceReady: true,
    appStorePrivacyWorksheetReadback: "owner_attestation_pending",
  };
  await capability(client, {
    system_id: "privacy_compliance_operator", provider: "ios_source", capability: "privacy_manifest_and_purpose_strings",
    capability_state: "available", readback_complete: true, data_source: "compiled_repository_privacy_contract", ...identity,
    window_start: window.start, window_end: window.end, metadata: sourceContract,
  });
  await capability(client, {
    system_id: "privacy_compliance_operator", provider: "app_store_connect", capability: "privacy_worksheet_owner_attestation",
    capability_state: "blocked", readback_complete: false, missing_capability: "owner_attestation_pending", data_source: "owner_attestation_registry", ...identity,
    window_start: window.start, window_end: window.end, metadata: { legalAnswersSubmitted: false },
  });
  const { error } = await client.from("privacy_request_findings").insert({
    system_id: "privacy_compliance_operator", health_state: "blocked", environment_mode: "production", flag_type: "ios_privacy_source_readiness",
    severity: "review", target_type: "ios_bundle", target_id: IOS_QA_RELEASE_EXPECTATION.bundleIdentifier,
    user_rights_changed: false, money_moved: false, high_risk_executed: false,
    ...identity, data_source: "compiled_repository_privacy_contract+owner_attestation_registry", readback_complete: false,
    window_start: window.start, window_end: window.end, metadata: sanitizeAutonomousReadback(sourceContract),
  });
  if (error) throw error;
  return { readbackComplete: false, platform: "ios", source: "compiled_repository_privacy_contract+owner_attestation_registry", dataWindow: window, healthState: "blocked", sourceContractReady: true, ownerAttestationPending: true, moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};

export const runIosRecoverySourceProbe: ScopedOperatorHandler = async ({ client }) => {
  const window = nowWindow();
  const release = await latestRelease(client);
  const { data: recovery, error: recoveryError } = await client.rpc("get_ios_autonomous_recovery_readback");
  if (recoveryError) throw recoveryError;
  const readback = recovery && typeof recovery === "object" ? recovery as Record<string, unknown> : {};
  const expectedIdentity = release?.runtime_version === IOS_QA_RELEASE_EXPECTATION.runtimeVersion && release?.channel === IOS_QA_RELEASE_EXPECTATION.channel;
  const complete = readback.readbackComplete === true && expectedIdentity;
  const identity = safeIdentity(release);
  const { error } = await client.from("backup_health_snapshots").insert({
    system_id: "platform_recovery_operator", health_state: complete ? "healthy" : "blocked", environment_mode: "production",
    flag_type: "ios_release_and_retry_recovery_readiness", severity: complete ? "info" : "warning", target_type: "ios_release", target_id: "com.chillywood.mobile:8",
    user_rights_changed: false, money_moved: false, high_risk_executed: false,
    ...identity, data_source: "database_migration_function_retry_and_release_readback", readback_complete: complete,
    window_start: window.start, window_end: window.end,
    metadata: sanitizeAutonomousReadback({ ...readback, releaseIdentityMatches: expectedIdentity, variablePresence: { eas: present("EXPO_TOKEN"), apns: present("APNS_KEY_ID") || present("APNS_PRIVATE_KEY"), revenueCatPublicKey: present("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY") }, valuesReturned: false, restoreExecuted: false, secretRotated: false }),
  });
  if (error) throw error;
  return { readbackComplete: complete, platform: "ios", source: "database_migration_function_retry_and_release_readback", dataWindow: window, healthState: complete ? "healthy" : "blocked", readback: sanitizeAutonomousReadback(readback), restoreExecuted: false, moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};

export const runIosSupportSourceProbe: ScopedOperatorHandler = async ({ client }) => {
  const window = nowWindow();
  const release = await latestRelease(client);
  const identity = safeIdentity(release);
  const { count, error: countError } = await client.from("support_ticket_findings").select("id", { count: "exact", head: true }).eq("platform", "ios");
  if (countError) throw countError;
  const complete = release?.readback_complete === true;
  const { error } = await client.from("support_health_snapshots").insert({
    system_id: "support_success_operator", health_state: complete ? "healthy" : "unknown", environment_mode: "production",
    flag_type: "ios_build_scoped_support_health", severity: complete ? "info" : "review", target_type: "ios_build", target_id: "com.chillywood.mobile:8",
    user_rights_changed: false, money_moved: false, high_risk_executed: false,
    ...identity, data_source: "release_identity+sanitized_support_findings", readback_complete: complete,
    window_start: window.start, window_end: window.end,
    metadata: sanitizeAutonomousReadback({ iosFindingCount: Number(count ?? 0), refundIssued: false, grantCreated: false, accountChanged: false, legalCommitmentMade: false }),
  });
  if (error) throw error;
  return { readbackComplete: complete, platform: "ios", source: "release_identity+sanitized_support_findings", dataWindow: window, healthState: complete ? "healthy" : "unknown", iosFindingCount: Number(count ?? 0), moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};
