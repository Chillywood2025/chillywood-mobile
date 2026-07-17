import {
  classifyNotificationAutonomy,
  sanitizeAutonomousReadback,
} from "../_shared/ios-autonomous-operator-policy.mjs";
import type { ScopedOperatorHandler } from "../_shared/scoped-operator.ts";

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
const isInvalidTokenError = (value: unknown) => /DeviceNotRegistered|Unregistered/i.test(toText(value));
const providerResponseClass = (statusCode: unknown) => {
  const value = Number(statusCode);
  if (!Number.isFinite(value)) return "none";
  if (value >= 200 && value < 300) return "2xx";
  if (value >= 400 && value < 500) return "4xx";
  if (value >= 500) return "5xx";
  return "other";
};

const rolloutEnabled = (key: string) => toText(Deno.env.get(key)).toLowerCase() === "true";

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
  const [tokenResult, attemptResult, voipResult, retryResult] = await Promise.all([
    queryRows(client
      .from("user_push_tokens")
      .select("id,platform,provider,enabled,revoked_at,app_version,build_version")
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
    const invalid = attempts.filter((attempt) => isInvalidTokenError(attempt.error_code)).length;
    const latestToken = tokens.sort((left, right) => toText(right.build_version).localeCompare(toText(left.build_version)))[0];
    const classified = classifyNotificationAutonomy({
      readbackComplete: tokenResult.complete && attemptResult.complete,
      attemptCount: attempts.length,
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
      bundle_identifier: platform === "ios" ? "com.chillywood.mobile" : null,
      provider_environment: "production",
      data_source: "user_push_tokens+notification_delivery_attempts",
      readback_complete: classified.readbackComplete,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      error_code: tokenResult.errorCode ?? attemptResult.errorCode,
      metadata: {
        activeTokenCount: tokens.filter((token) => token.enabled === true && !token.revoked_at).length,
        revokedTokenCount: tokens.filter((token) => token.enabled !== true || Boolean(token.revoked_at)).length,
        attemptCount: attempts.length,
        sentCount: attempts.filter((attempt) => attempt.status === "sent").length,
        rolloutEnabled: platform === "ios" ? rolloutEnabled("IOS_ORDINARY_PUSH_ROLLOUT_ENABLED") : null,
      },
    };
  });

  const voipFailed = voipResult.data.filter((attempt) => attempt.status === "failed").length;
  const voipInvalid = voipResult.data.filter((attempt) => isInvalidTokenError(attempt.error_code)).length;
  const voipResponseClasses = [...new Set(voipResult.data.map((attempt) => providerResponseClass(attempt.provider_status_code)))];
  const voipClassified = classifyNotificationAutonomy({
    readbackComplete: voipResult.complete,
    attemptCount: voipResult.data.length,
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
    bundle_identifier: "com.chillywood.mobile",
    provider_environment: "production",
    data_source: "voip_push_delivery_attempts",
    readback_complete: voipClassified.readbackComplete,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    error_code: voipResult.errorCode,
    metadata: {
      attemptCount: voipResult.data.length,
      sentCount: voipResult.data.filter((attempt) => attempt.status === "sent").length,
      rolloutEnabled: rolloutEnabled("IOS_VOIP_PUSH_DISPATCH_ENABLED"),
    },
  });

  const retry = retryResult.error ? {} : (retryResult.data as JsonObject ?? {});
  const retryBacklog = Number(retry.pendingCount ?? 0) + Number(retry.failedCount ?? 0) + Number(retry.staleDispatchingCount ?? 0);
  const retryClassified = classifyNotificationAutonomy({
    readbackComplete: !retryResult.error && retry.readbackComplete === true,
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
      const { error: reviewError } = await client.from("notification_required_review_flags").insert({
        system_id: "notification_delivery_operator",
        flag_type: rail.finding,
        severity,
        target_type: "delivery_rail",
        target_id: `${rail.platform}/${rail.provider}`,
        environment_mode: "production",
        platform: rail.platform,
        user_rights_changed: false,
        money_moved: false,
        metadata: sanitizeAutonomousReadback({ dataSource: rail.data_source, readbackComplete: rail.readback_complete }),
      });
      if (reviewError) throw reviewError;
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
  };
};
