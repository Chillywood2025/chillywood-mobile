import {
  classifyNotificationAutonomy,
  sanitizeAutonomousReadback,
} from "../_shared/ios-autonomous-operator-policy.mjs";
import type { ScopedOperatorHandler } from "../_shared/scoped-operator.ts";
import { isApnsInvalidVoipTokenReason } from "../_shared/ios-voip-policy.mjs";

type JsonObject = Record<string, unknown>;
type QueryResult = { data: JsonObject[]; complete: boolean; errorCode: string | null };

const queryRows = async (promise: PromiseLike<{ data: unknown; error: { code?: string } | null }>): Promise<QueryResult> => {
  const { data, error } = await promise;
  return {
    data: Array.isArray(data) ? data as JsonObject[] : [],
    complete: !error,
    errorCode: error ? String(error.code ?? "query_failed") : null,
  };
};

const toText = (value: unknown) => String(value ?? "").trim();
export const isInvalidDeliveryTokenError = (value: unknown, provider: string) => {
  const reason = toText(value);
  if (provider === "voip_apns") return isApnsInvalidVoipTokenReason(reason);
  if (provider === "fcm") return /DeviceNotRegistered|Unregistered|UNREGISTERED|SENDER_ID_MISMATCH/i.test(reason);
  return /DeviceNotRegistered|Unregistered/i.test(reason);
};
const providerResponseClass = (statusCode: unknown) => {
  const value = Number(statusCode);
  if (!Number.isFinite(value)) return "none";
  if (value >= 200 && value < 300) return "2xx";
  if (value >= 400 && value < 500) return "4xx";
  if (value >= 500) return "5xx";
  return "other";
};

const rolloutEnabled = (key: string) => toText(Deno.env.get(key)).toLowerCase() === "true";
const configured = (...keys: string[]) => keys.some((key) => Boolean(toText(Deno.env.get(key))));

const insertCapability = async (
  client: any,
  row: JsonObject,
) => {
  const { error } = await client.from("autonomous_provider_readback_capabilities").insert({
    system_id: "notification_delivery_operator",
    platform: row.platform,
    provider: row.provider,
    capability: "delivery_health_readback",
    capability_state: row.readback_complete === true ? "available" : "unavailable",
    missing_capability: row.readback_complete === true ? null : "backend_delivery_readback",
    readback_complete: row.readback_complete === true,
    data_source: row.data_source,
    provider_environment: row.provider_environment ?? null,
    app_version: row.app_version ?? null,
    native_build: row.native_build ?? null,
    runtime_version: row.runtime_version ?? null,
    channel: row.channel ?? null,
    money_moved: false,
    user_rights_changed: false,
    high_risk_executed: false,
    metadata: sanitizeAutonomousReadback({ healthState: row.health_state, errorCode: row.error_code ?? null }),
  });
  if (error) throw error;
};

export const runNotificationAutonomyProbe: ScopedOperatorHandler = async ({ client, metadata }) => {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);
  const [tokenResult, voipTokenResult, attemptResult, voipResult, retryResult] = await Promise.all([
    queryRows(client
      .from("user_push_tokens")
      .select("id,platform,provider,enabled,revoked_at,app_version,build_version")
      .limit(5000)),
    queryRows(client
      .from("user_voip_push_tokens")
      .select("id,enabled,revoked_at,app_version,build_version,apns_environment")
      .limit(5000)),
    queryRows(client
      .from("notification_delivery_attempts")
      .select("push_token_id,provider,status,error_code,created_at")
      .gte("created_at", windowStart.toISOString())
      .limit(5000)),
    queryRows(client
      .from("voip_push_delivery_attempts")
      .select("apns_environment,status,error_code,provider_status_code,created_at")
      .gte("created_at", windowStart.toISOString())
      .limit(5000)),
    client.rpc("get_ios_autonomous_call_retry_readback"),
  ]);

  const tokenById = new Map(tokenResult.data.map((row) => [toText(row.id), row]));
  const ordinaryRails = [
    { platform: "ios", provider: "expo" },
    { platform: "android", provider: "expo" },
    { platform: "android", provider: "fcm" },
  ];

  const railRows: JsonObject[] = ordinaryRails.map(({ platform, provider }) => {
    const tokens = tokenResult.data.filter((row) => row.platform === platform && row.provider === provider);
    const attempts = attemptResult.data.filter((attempt) => {
      const token = tokenById.get(toText(attempt.push_token_id));
      return token?.platform === platform && attempt.provider === provider;
    });
    const failed = attempts.filter((attempt) => attempt.status === "failed").length;
    const invalid = attempts.filter((attempt) => isInvalidDeliveryTokenError(attempt.error_code, provider)).length;
    const activeTokenCount = tokens.filter((token) => token.enabled === true && !token.revoked_at).length;
    const revokedTokenCount = tokens.filter((token) => token.enabled !== true || Boolean(token.revoked_at)).length;
    const railRolloutEnabled = platform === "ios" ? rolloutEnabled("IOS_ORDINARY_PUSH_ROLLOUT_ENABLED") : true;
    // Expo's endpoint is a configured rail even when enhanced push security is
    // not enabled and no optional Expo access token is required.
    const providerConfigured = provider === "fcm"
      ? configured("FIREBASE_SERVICE_ACCOUNT_PATH", "GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_SERVICE_ACCOUNT_JSON")
      : true;
    const latestToken = tokens.sort((left, right) => toText(right.build_version).localeCompare(toText(left.build_version)))[0];
    const classified = classifyNotificationAutonomy({
      readbackComplete: tokenResult.complete && attemptResult.complete,
      providerConfigured,
      rolloutEnabled: railRolloutEnabled,
      activeTokenCount,
      revokedTokenCount,
      attemptCount: attempts.length,
      successfulAttemptCount: attempts.filter((attempt) => attempt.status === "sent").length,
      failedAttemptCount: failed,
      invalidTokenCount: invalid,
      retryBacklog: 0,
      cappedAttemptCount: 0,
    });
    return {
      platform,
      provider,
      health_state: classified.healthState,
      finding: classified.finding,
      retry_backlog: 0,
      failed_attempt_count: failed,
      invalid_token_count: invalid,
      provider_response_class: "expo_ticket_receipt",
      app_version: latestToken?.app_version ?? null,
      native_build: latestToken?.build_version ?? null,
      bundle_identifier: null,
      provider_environment: "production",
      data_source: "user_push_tokens+notification_delivery_attempts",
      readback_complete: classified.readbackComplete,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      error_code: tokenResult.errorCode ?? attemptResult.errorCode,
      metadata: {
        activeTokenCount,
        revokedTokenCount,
        attemptCount: attempts.length,
        successfulAttemptCount: attempts.filter((attempt) => attempt.status === "sent").length,
        rolloutEnabled: railRolloutEnabled,
        providerConfigured,
        backendState: classified.backendState,
        configurationState: classified.configurationState,
        deliveryEvidenceState: classified.deliveryEvidenceState,
        expectedBundleIdentifier: platform === "ios" ? "com.chillywood.mobile" : null,
      },
    };
  });

  const voipFailed = voipResult.data.filter((attempt) => attempt.status === "failed").length;
  const voipInvalid = voipResult.data.filter((attempt) => isInvalidDeliveryTokenError(attempt.error_code, "voip_apns")).length;
  const voipActiveTokens = voipTokenResult.data.filter((token) => token.enabled === true && !token.revoked_at).length;
  const voipRevokedTokens = voipTokenResult.data.filter((token) => token.enabled !== true || Boolean(token.revoked_at)).length;
  const voipProviderConfigured = configured("APNS_KEY_ID", "APNS_PRIVATE_KEY", "APNS_KEY_PATH");
  const voipRolloutEnabled = rolloutEnabled("IOS_VOIP_PUSH_DISPATCH_ENABLED");
  const voipResponseClasses = [...new Set(voipResult.data.map((attempt) => providerResponseClass(attempt.provider_status_code)))];
  const voipClassified = classifyNotificationAutonomy({
    readbackComplete: voipResult.complete && voipTokenResult.complete,
    providerConfigured: voipProviderConfigured,
    rolloutEnabled: voipRolloutEnabled,
    activeTokenCount: voipActiveTokens,
    revokedTokenCount: voipRevokedTokens,
    attemptCount: voipResult.data.length,
    successfulAttemptCount: voipResult.data.filter((attempt) => attempt.status === "sent").length,
    failedAttemptCount: voipFailed,
    invalidTokenCount: voipInvalid,
  });
  railRows.push({
    platform: "ios",
    provider: "voip_apns",
    health_state: voipClassified.healthState,
    finding: voipClassified.finding,
    retry_backlog: 0,
    failed_attempt_count: voipFailed,
    invalid_token_count: voipInvalid,
    provider_response_class: voipResponseClasses.join(",") || "none",
    bundle_identifier: null,
    provider_environment: "production",
    data_source: "voip_push_delivery_attempts",
    readback_complete: voipClassified.readbackComplete,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    error_code: voipResult.errorCode,
    metadata: {
      activeTokenCount: voipActiveTokens,
      revokedTokenCount: voipRevokedTokens,
      attemptCount: voipResult.data.length,
      successfulAttemptCount: voipResult.data.filter((attempt) => attempt.status === "sent").length,
      rolloutEnabled: voipRolloutEnabled,
      providerConfigured: voipProviderConfigured,
      backendState: voipClassified.backendState,
      configurationState: voipClassified.configurationState,
      deliveryEvidenceState: voipClassified.deliveryEvidenceState,
      expectedBundleIdentifier: "com.chillywood.mobile",
    },
  });

  const retry = retryResult.error ? {} : (retryResult.data as JsonObject ?? {});
  const retryBacklog = Number(retry.pendingCount ?? 0) + Number(retry.failedCount ?? 0) + Number(retry.staleDispatchingCount ?? 0);
  const retryClassified = classifyNotificationAutonomy({
    readbackComplete: !retryResult.error && retry.readbackComplete === true,
    deliveryRail: false,
    providerConfigured: true,
    retryBacklog,
    failedAttemptCount: Number(retry.failedCount ?? 0),
    cappedAttemptCount: Number(retry.cappedCount ?? 0),
    unresolvedCriticalCount: Number(retry.unresolvedCriticalCount ?? 0),
  });
  railRows.push({
    platform: "shared",
    provider: "terminal_call_retry",
    health_state: retryClassified.healthState,
    finding: retryClassified.finding,
    retry_backlog: retryBacklog,
    failed_attempt_count: Number(retry.failedCount ?? 0),
    invalid_token_count: 0,
    provider_response_class: "server_owned_retry",
    data_source: "get_ios_autonomous_call_retry_readback",
    readback_complete: retryClassified.readbackComplete,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    error_code: retryResult.error ? String(retryResult.error.code ?? "retry_readback_failed") : null,
    metadata: {
      scheduleExists: retry.scheduleExists === true,
      scheduleActive: retry.scheduleActive === true,
      schedule: retry.schedule ?? null,
      enabled: retry.enabled === true,
      cappedCount: Number(retry.cappedCount ?? 0),
      unresolvedWarningCount: Number(retry.unresolvedWarningCount ?? 0),
      unresolvedCriticalCount: Number(retry.unresolvedCriticalCount ?? 0),
    },
  });

  const findingKeysByPlatform = new Map<string, string[]>();
  for (const rail of railRows) {
    const { error: snapshotError } = await client.from("notification_delivery_health_snapshots").insert({
      system_id: "notification_delivery_operator",
      health_state: rail.health_state,
      provider: rail.provider,
      retry_backlog: rail.retry_backlog,
      failed_attempt_count: rail.failed_attempt_count,
      invalid_token_count: rail.invalid_token_count,
      provider_response_class: rail.provider_response_class,
      environment_mode: "production",
      platform: rail.platform,
      app_version: rail.app_version ?? null,
      native_build: rail.native_build ?? null,
      bundle_identifier: rail.bundle_identifier ?? null,
      runtime_version: rail.runtime_version ?? null,
      channel: rail.channel ?? null,
      update_id: rail.update_id ?? null,
      distribution_source: rail.distribution_source ?? null,
      provider_environment: rail.provider_environment ?? null,
      data_source: rail.data_source,
      readback_complete: rail.readback_complete,
      window_start: rail.window_start,
      window_end: rail.window_end,
      user_rights_changed: false,
      money_moved: false,
      metadata: sanitizeAutonomousReadback(rail.metadata),
    });
    if (snapshotError) throw snapshotError;
    await insertCapability(client, rail);
    if (rail.finding) {
      const severity = rail.health_state === "critical" ? "critical" : rail.health_state === "degraded" ? "warning" : "review";
      const { data: findingKey, error: reviewError } = await client.rpc("record_autonomous_finding", {
        p_system_id: "notification_delivery_operator",
        p_platform: rail.platform,
        p_finding_type: rail.finding,
        p_target_surface: `${rail.platform}/${rail.provider}`,
        p_provider: rail.provider,
        p_severity: severity,
        p_metadata: sanitizeAutonomousReadback({ data_source: rail.data_source, readback_complete: rail.readback_complete }),
      });
      if (reviewError) throw reviewError;
      const railPlatform = toText(rail.platform);
      if (typeof findingKey === "string" && railPlatform) {
        findingKeysByPlatform.set(railPlatform, [...(findingKeysByPlatform.get(railPlatform) ?? []), findingKey]);
      }
    }
  }

  for (const platform of ["ios", "android", "shared"]) {
    if (railRows.filter((rail) => rail.platform === platform).every((rail) => rail.readback_complete === true)) {
      const { error } = await client.rpc("resolve_autonomous_findings", {
        p_system_id: "notification_delivery_operator",
        p_platform: platform,
        p_active_finding_keys: findingKeysByPlatform.get(platform) ?? [],
      });
      if (error) throw error;
    }
  }

  const retryRail = railRows.find((row) => row.provider === "terminal_call_retry")!;
  const { error: schedulerError } = await client.from("autonomous_scheduler_health_snapshots").insert({
    system_id: "notification_delivery_operator",
    surface_id: "ios_terminal_call_delivery_retry",
    platform: "shared",
    scheduler: "pg_cron",
    schedule: (retryRail.metadata as JsonObject).schedule ?? null,
    enabled: (retryRail.metadata as JsonObject).enabled === true && (retryRail.metadata as JsonObject).scheduleActive === true,
    health_state: retryRail.health_state,
    retry_backlog: retryRail.retry_backlog,
    failed_attempt_count: retryRail.failed_attempt_count,
    capped_attempt_count: Number((retryRail.metadata as JsonObject).cappedCount ?? 0),
    readback_complete: retryRail.readback_complete,
    data_source: retryRail.data_source,
    money_moved: false,
    user_rights_changed: false,
    high_risk_executed: false,
    metadata: sanitizeAutonomousReadback({ staleLeaseRecovery: true, attemptCap: 10, batchCap: 10 }),
  });
  if (schedulerError) throw schedulerError;

  const allComplete = railRows.every((row) => row.readback_complete === true);
  const { error: eventError } = await client.from("notification_operator_events").insert({
    system_id: "notification_delivery_operator",
    actor_type: "operator",
    actor_id: "notification_delivery_operator",
    action_id: "watch_once",
    result: allComplete ? "platform_readback_complete" : "platform_readback_incomplete",
    environment_mode: "production",
    platform: "shared",
    user_rights_changed: false,
    money_moved: false,
    metadata: sanitizeAutonomousReadback({
      scheduler: metadata.scheduler,
      source: metadata.source,
      railCount: railRows.length,
      readbackComplete: allComplete,
    }),
  });
  if (eventError) throw eventError;

  return {
    readbackComplete: allComplete,
    platform: "shared",
    source: "backend_notification_delivery_state",
    dataWindow: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
    rails: railRows.map((row) => sanitizeAutonomousReadback({
      platform: row.platform,
      provider: row.provider,
      healthState: row.health_state,
      retryBacklog: row.retry_backlog,
      failedAttemptCount: row.failed_attempt_count,
      invalidTokenCount: row.invalid_token_count,
      readbackComplete: row.readback_complete,
    })),
    ordinaryIosRolloutEnabled: rolloutEnabled("IOS_ORDINARY_PUSH_ROLLOUT_ENABLED"),
    voipIosRolloutEnabled: rolloutEnabled("IOS_VOIP_PUSH_DISPATCH_ENABLED"),
    moneyMoved: false,
    userRightsChanged: false,
    highRiskExecuted: false,
    broadPushSent: false,
    lifecycleManaged: true,
  };
};
