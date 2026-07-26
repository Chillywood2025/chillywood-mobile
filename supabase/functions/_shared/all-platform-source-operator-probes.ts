import { sanitizeAutonomousReadback } from "./ios-autonomous-operator-policy.mjs";
import type { ScopedOperatorHandler } from "./scoped-operator.ts";

type JsonObject = Record<string, unknown>;
const nowWindow = () => {
  const end = new Date();
  return { start: new Date(end.getTime() - 30 * 60 * 1000).toISOString(), end: end.toISOString() };
};
const present = (name: string) => Boolean(String(Deno.env.get(name) ?? "").trim());
const latestRelease = async (client: any, platform: "ios" | "android") => {
  const { data, error } = await client.from("release_health_snapshots")
    .select("platform,bundle_identifier,app_version,native_build,runtime_version,channel,update_id,distribution_source,readback_complete,created_at")
    .eq("platform", platform).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as JsonObject | null;
};
const observedIdentity = (release: JsonObject | null, platform: string) => {
  const complete = release?.readback_complete === true;
  return {
    platform,
    bundle_identifier: complete ? release?.bundle_identifier ?? null : null,
    app_version: complete ? release?.app_version ?? null : null,
    native_build: complete ? release?.native_build ?? null : null,
    runtime_version: complete ? release?.runtime_version ?? null : null,
    channel: complete ? release?.channel ?? null : null,
    update_id: complete ? release?.update_id ?? null : null,
    distribution_source: complete ? release?.distribution_source ?? null : null,
    provider_environment: null,
  };
};
const countRows = async (client: any, table: string, filter?: (query: any) => any) => {
  let query = client.from(table).select("id", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  return { count: Number(count ?? 0), complete: !error, error: error ? String(error.code ?? "query_failed") : null };
};

export const runSharedSecurityProbe: ScopedOperatorHandler = async ({ client }) => {
  const window = nowWindow();
  const [owners, pendingApprovals] = await Promise.all([
    countRows(client, "platform_role_memberships", (query) => query.in("role", ["owner", "super_admin"]).eq("status", "active")),
    countRows(client, "autonomous_approval_requests", (query) => query.eq("status", "pending")),
  ]);
  const complete = owners.complete && pendingApprovals.complete;
  const healthState = complete && owners.count > 0 ? "healthy" : complete ? "critical" : "unknown";
  const { error } = await client.from("security_health_snapshots").insert({
    system_id: "security_owner_operator", platform: "shared", health_state: healthState,
    critical_finding_count: complete && owners.count === 0 ? 1 : 0, warning_count: complete ? 0 : 1,
    environment_mode: "production", user_rights_changed: false, money_moved: false,
    data_source: "platform_role_memberships+autonomous_approval_requests", readback_complete: complete,
    window_start: window.start, window_end: window.end,
    metadata: sanitizeAutonomousReadback({ activeOwnerAuthorityCount: owners.count, pendingApprovalCount: pendingApprovals.count, ownerAuthorityMutated: false, rlsMutated: false }),
  });
  if (error) throw error;
  return { readbackComplete: complete, platform: "shared", source: "platform_role_memberships+autonomous_approval_requests", dataWindow: window, healthState, reasons: complete ? [] : [owners.error, pendingApprovals.error].filter(Boolean), moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};

export const runAndroidSecurityProbe: ScopedOperatorHandler = async ({ client }) => {
  const window = nowWindow();
  const release = await latestRelease(client, "android");
  const identity = observedIdentity(release, "android");
  const presence = {
    fcmCredential: present("FIREBASE_SERVICE_ACCOUNT_PATH") || present("GOOGLE_APPLICATION_CREDENTIALS"),
    playCredential: present("GOOGLE_PLAY_SERVICE_ACCOUNT_PATH") || present("GOOGLE_APPLICATION_CREDENTIALS"),
    signingReadback: false,
  };
  const complete = release?.readback_complete === true && presence.fcmCredential && presence.playCredential && presence.signingReadback;
  const { error } = await client.from("security_health_snapshots").insert({
    system_id: "security_owner_operator", health_state: complete ? "healthy" : "unknown",
    critical_finding_count: 0, warning_count: complete ? 0 : 1, environment_mode: "production",
    user_rights_changed: false, money_moved: false, ...identity,
    data_source: "android_release_snapshot+credential_presence_by_name", readback_complete: complete,
    window_start: window.start, window_end: window.end,
    metadata: sanitizeAutonomousReadback({ presence: Object.fromEntries(Object.entries(presence).map(([key, value]) => [key, value ? "PRESENT" : "MISSING"])), credentialValuesReturned: false, credentialMutated: false }),
  });
  if (error) throw error;
  return { readbackComplete: complete, platform: "android", source: "android_release_snapshot+credential_presence_by_name", dataWindow: window, healthState: complete ? "healthy" : "unknown", reasons: complete ? [] : ["android_signing_or_provider_readback_unavailable"], moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};

export const runSharedRecoveryProbe: ScopedOperatorHandler = async ({ client }) => {
  const window = nowWindow();
  const { data, error: rpcError } = await client.rpc("get_ios_autonomous_recovery_readback");
  const readback = data && typeof data === "object" ? data as JsonObject : {};
  const complete = !rpcError && readback.readbackComplete === true;
  const { error } = await client.from("backup_health_snapshots").insert({
    system_id: "platform_recovery_operator", platform: "shared", health_state: complete ? "healthy" : "unknown",
    environment_mode: "production", flag_type: "shared_migration_function_timer_recovery_readiness",
    severity: complete ? "info" : "warning", user_rights_changed: false, money_moved: false, high_risk_executed: false,
    data_source: "migration_function_retry_scheduler_readback", readback_complete: complete,
    window_start: window.start, window_end: window.end,
    metadata: sanitizeAutonomousReadback({ ...readback, restoreExecuted: false, destructiveMutationExecuted: false }),
  });
  if (error) throw error;
  return { readbackComplete: complete, platform: "shared", source: "migration_function_retry_scheduler_readback", dataWindow: window, healthState: complete ? "healthy" : "unknown", reasons: rpcError ? ["shared_recovery_readback_unavailable"] : [], moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};

export const runAndroidRecoveryProbe: ScopedOperatorHandler = async ({ client }) => {
  const window = nowWindow();
  const release = await latestRelease(client, "android");
  const identity = observedIdentity(release, "android");
  const complete = release?.readback_complete === true;
  const { error } = await client.from("backup_health_snapshots").insert({
    system_id: "platform_recovery_operator", health_state: complete ? "healthy" : "blocked",
    environment_mode: "production", flag_type: "android_release_package_fcm_eas_recovery_readiness",
    severity: complete ? "info" : "warning", user_rights_changed: false, money_moved: false, high_risk_executed: false,
    ...identity, data_source: "android_release_snapshot+credential_presence_by_name", readback_complete: complete,
    window_start: window.start, window_end: window.end,
    metadata: sanitizeAutonomousReadback({ expectedIdentity: { packageIdentifier: "com.chillywood.mobile", channel: "production", runtimeVersion: "1.0.0" }, variablePresence: { eas: present("EXPO_TOKEN") ? "PRESENT" : "MISSING", fcm: present("FIREBASE_SERVICE_ACCOUNT_PATH") || present("GOOGLE_APPLICATION_CREDENTIALS") ? "PRESENT" : "MISSING" }, valuesReturned: false, restoreExecuted: false }),
  });
  if (error) throw error;
  return { readbackComplete: complete, platform: "android", source: "android_release_snapshot+credential_presence_by_name", dataWindow: window, healthState: complete ? "healthy" : "blocked", reasons: complete ? [] : ["android_release_readback_unavailable"], moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};

export const runSharedPrivacyProbe: ScopedOperatorHandler = async ({ client }) => {
  const window = nowWindow();
  const requests = await countRows(client, "privacy_request_findings", (query) => query.eq("flag_type", "privacy_request_status"));
  const holds = await countRows(client, "retention_hold_findings");
  const complete = requests.complete && holds.complete;
  const { error } = await client.from("privacy_operator_events").insert({
    system_id: "privacy_compliance_operator", actor_type: "operator", actor_id: "privacy_compliance_operator",
    action_id: "watch_once", result: complete ? "healthy" : "unknown", environment_mode: "production", platform: "shared",
    user_rights_changed: false, money_moved: false, high_risk_executed: false,
    metadata: sanitizeAutonomousReadback({ source: "privacy_request_findings+retention_hold_findings", readbackComplete: complete, privacyRequestFindingCount: requests.count, retentionHoldFindingCount: holds.count, legalHoldChanged: false, rawExportCreated: false }),
  });
  if (error) throw error;
  return { readbackComplete: complete, platform: "shared", source: "privacy_request_findings+retention_hold_findings", dataWindow: window, healthState: complete ? "healthy" : "unknown", reasons: complete ? [] : ["shared_privacy_readback_unavailable"], moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};

export const runAndroidPrivacyProbe: ScopedOperatorHandler = async ({ client }) => {
  const window = nowWindow();
  const sourceContract = { dataSafetySourceReviewed: true, permissionsSourceReviewed: true, ownerAttestationPending: true };
  const { error } = await client.from("privacy_operator_events").insert({
    system_id: "privacy_compliance_operator", actor_type: "operator", actor_id: "privacy_compliance_operator",
    action_id: "watch_once", result: "owner_attestation_pending", environment_mode: "production", platform: "android",
    user_rights_changed: false, money_moved: false, high_risk_executed: false,
    metadata: sanitizeAutonomousReadback({ source: "compiled_android_privacy_contract+owner_attestation_registry", readbackComplete: false, ...sourceContract }),
  });
  if (error) throw error;
  return { readbackComplete: false, platform: "android", source: "compiled_android_privacy_contract+owner_attestation_registry", dataWindow: window, healthState: "blocked", reasons: ["owner_attestation_pending"], moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};

export const runSharedSupportProbe: ScopedOperatorHandler = async ({ client }) => {
  const window = nowWindow();
  const tickets = await countRows(client, "support_ticket_findings");
  const reports = await countRows(client, "user_report_clusters", (query) => query.in("cluster_status", ["open", "threshold_met", "review_required"]));
  const complete = tickets.complete && reports.complete;
  const { error } = await client.from("support_health_snapshots").insert({
    system_id: "support_success_operator", platform: "shared", health_state: complete ? "healthy" : "unknown",
    environment_mode: "production", flag_type: "shared_ticket_sla_and_report_router_health", severity: complete ? "info" : "review",
    user_rights_changed: false, money_moved: false, high_risk_executed: false,
    data_source: "support_ticket_findings+user_report_clusters", readback_complete: complete,
    window_start: window.start, window_end: window.end,
    metadata: sanitizeAutonomousReadback({ ticketFindingCount: tickets.count, openReportClusterCount: reports.count, refundIssued: false, grantCreated: false, accountChanged: false }),
  });
  if (error) throw error;
  return { readbackComplete: complete, platform: "shared", source: "support_ticket_findings+user_report_clusters", dataWindow: window, healthState: complete ? "healthy" : "unknown", reasons: complete ? [] : ["support_or_report_router_readback_unavailable"], moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};

export const runAndroidSupportProbe: ScopedOperatorHandler = async ({ client }) => {
  const window = nowWindow();
  const release = await latestRelease(client, "android");
  const identity = observedIdentity(release, "android");
  const findings = await countRows(client, "support_ticket_findings", (query) => query.eq("platform", "android"));
  const complete = release?.readback_complete === true && findings.complete;
  const { error } = await client.from("support_health_snapshots").insert({
    system_id: "support_success_operator", health_state: complete ? "healthy" : "unknown",
    environment_mode: "production", flag_type: "android_build_scoped_support_health", severity: complete ? "info" : "review",
    user_rights_changed: false, money_moved: false, high_risk_executed: false, ...identity,
    data_source: "android_release_identity+sanitized_support_findings", readback_complete: complete,
    window_start: window.start, window_end: window.end,
    metadata: sanitizeAutonomousReadback({ findingCount: findings.count, refundIssued: false, grantCreated: false, accountChanged: false }),
  });
  if (error) throw error;
  return { readbackComplete: complete, platform: "android", source: "android_release_identity+sanitized_support_findings", dataWindow: window, healthState: complete ? "healthy" : "unknown", reasons: complete ? [] : ["android_release_or_support_readback_unavailable"], moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};
