import {
  classifyIosObservabilityAutonomy,
  IOS_QA_RELEASE_EXPECTATION,
  sanitizeAutonomousReadback,
} from "../_shared/ios-autonomous-operator-policy.mjs";
import type { ScopedOperatorHandler } from "../_shared/scoped-operator.ts";

type JsonObject = Record<string, unknown>;
const objectValue = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const platformProviderReadback = (payload: JsonObject, platform: "ios" | "android" | "shared") => {
  const root = objectValue(payload.provider_readback ?? payload.providerReadback);
  const nested = objectValue(root[platform]);
  return Object.keys(nested).length ? nested : root;
};
const IOS_TYPED_FINDING_TABLES = [
  "crash_cluster_findings",
  "js_error_findings",
  "performance_regression_findings",
  "analytics_delivery_findings",
  "release_health_findings",
  "backend_error_rate_findings",
  "observability_required_review_flags",
] as const;

export const runIosObservabilityProbe: ScopedOperatorHandler = async ({ client, payload, metadata }) => {
  const providerReadback = platformProviderReadback(payload, "ios");
  const firebase = objectValue(providerReadback.firebase);
  const edge = objectValue(providerReadback.supabaseEdgeFunctions);
  const now = new Date();
  const windowStart = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const windowEnd = now.toISOString();

  const { data: releaseSnapshot, error: releaseError } = await client
    .from("release_health_snapshots")
    .select("platform,bundle_identifier,app_version,native_build,runtime_version,channel,update_id,distribution_source,embedded_launch,emergency_launch,readback_complete,created_at")
    .eq("platform", "ios")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (releaseError) throw releaseError;

  const { data: livekitSnapshot, error: livekitError } = await client
    .from("livekit_surface_health_snapshots")
    .select("platform,health_state,app_version,native_build,runtime_version,channel,readback_complete,created_at")
    .eq("platform", "ios")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (livekitError) throw livekitError;

  const providers = {
    crashlytics: { readbackComplete: firebase.crashlyticsReadbackComplete === true },
    firebasePerformance: { readbackComplete: firebase.performanceReadbackComplete === true },
    firebaseAnalytics: { readbackComplete: firebase.analyticsReadbackComplete === true },
    supabaseEdgeFunctions: { readbackComplete: edge.readbackComplete === true },
    releaseDiagnostics: { readbackComplete: releaseSnapshot?.readback_complete === true },
    livekitClientTelemetry: { readbackComplete: livekitSnapshot?.readback_complete === true },
  };
  const classification = classifyIosObservabilityAutonomy({
    providers,
    nativeCrashCount: numberValue(firebase.nativeCrashCount),
    jsFatalCount: numberValue(firebase.jsFatalCount),
    startupFailureCount: numberValue(firebase.startupFailureCount),
    performanceRegressionCount: numberValue(firebase.performanceRegressionCount),
    analyticsDeliveryFailureCount: numberValue(firebase.analyticsDeliveryFailureCount),
    backendErrorRatePercent: numberValue(edge.errorRatePercent),
    runtimeMismatch: Boolean(releaseSnapshot?.readback_complete === true && releaseSnapshot.runtime_version !== IOS_QA_RELEASE_EXPECTATION.runtimeVersion),
    channelMismatch: Boolean(releaseSnapshot?.readback_complete === true && releaseSnapshot.channel !== IOS_QA_RELEASE_EXPECTATION.channel),
    updateMismatch: false,
    embeddedLaunch: releaseSnapshot?.embedded_launch === true,
    emergencyLaunch: releaseSnapshot?.emergency_launch === true,
  });

  const observedReleaseComplete = releaseSnapshot?.readback_complete === true;
  const identity = {
    platform: "ios",
    bundle_identifier: observedReleaseComplete ? releaseSnapshot?.bundle_identifier ?? null : null,
    app_version: observedReleaseComplete ? releaseSnapshot?.app_version ?? null : null,
    native_build: observedReleaseComplete ? releaseSnapshot?.native_build ?? null : null,
    runtime_version: observedReleaseComplete ? releaseSnapshot?.runtime_version ?? null : null,
    channel: observedReleaseComplete ? releaseSnapshot?.channel ?? null : null,
    update_id: observedReleaseComplete ? releaseSnapshot?.update_id ?? null : null,
    distribution_source: observedReleaseComplete ? releaseSnapshot?.distribution_source ?? null : null,
    provider_environment: null,
    data_source: "firebase_host_adapter+supabase_readback+release_snapshot+livekit_snapshot",
    readback_complete: classification.readbackComplete,
    window_start: windowStart,
    window_end: windowEnd,
  };

  for (const [provider, state] of Object.entries(providers)) {
    const { error } = await client.from("autonomous_provider_readback_capabilities").insert({
      system_id: "observability_runtime_operator",
      ...identity,
      provider,
      capability: "ios_health_readback",
      capability_state: state.readbackComplete ? "available" : "unavailable",
      missing_capability: state.readbackComplete ? null : `${provider}_provider_unavailable`,
      readback_complete: state.readbackComplete,
      data_source: provider === "releaseDiagnostics" || provider === "livekitClientTelemetry" ? "supabase_sanitized_snapshot" : "host_read_only_provider_adapter",
      metadata: sanitizeAutonomousReadback({ status: state.readbackComplete ? "readback_complete" : "provider_unavailable" }),
      money_moved: false,
      user_rights_changed: false,
      high_risk_executed: false,
    });
    if (error) throw error;
  }

  const { error: snapshotError } = await client.from("runtime_health_snapshots").insert({
    system_id: "observability_runtime_operator",
    health_state: classification.healthState,
    crash_cluster_count: numberValue(firebase.nativeCrashCount),
    js_error_count: numberValue(firebase.jsFatalCount),
    performance_regression_count: numberValue(firebase.performanceRegressionCount),
    backend_error_rate_percent: edge.readbackComplete === true ? numberValue(edge.errorRatePercent) : null,
    embedded_launch: releaseSnapshot?.embedded_launch === true,
    emergency_launch: releaseSnapshot?.emergency_launch === true,
    environment_mode: "production",
    pii_stored: false,
    secrets_logged: false,
    release_action_executed: false,
    user_rights_changed: false,
    money_moved: false,
    ...identity,
    metadata: sanitizeAutonomousReadback({ findings: classification.findings, missingCapabilities: classification.missingCapabilities }),
  });
  if (snapshotError) throw snapshotError;

  const tableForFinding = (finding: string) => {
    if (finding === "native_crash_cluster") return "crash_cluster_findings";
    if (finding === "javascript_fatal_cluster" || finding === "startup_failure") return "js_error_findings";
    if (finding === "performance_regression") return "performance_regression_findings";
    if (finding === "analytics_delivery_failure" || finding.includes("firebaseAnalytics_provider_unavailable")) return "analytics_delivery_findings";
    if (finding === "backend_error_rate_spike" || finding.includes("supabaseEdgeFunctions_provider_unavailable")) return "backend_error_rate_findings";
    if (["runtime_channel_update_mismatch", "embedded_launch", "emergency_launch"].includes(finding)) return "release_health_findings";
    return "observability_required_review_flags";
  };
  const activeFindingsByTable = new Map<string, Set<string>>();
  for (const finding of classification.findings) {
    const table = tableForFinding(finding);
    const activeForTable = activeFindingsByTable.get(table) ?? new Set<string>();
    activeForTable.add(finding);
    activeFindingsByTable.set(table, activeForTable);
    const row: JsonObject = {
      system_id: "observability_runtime_operator",
      flag_type: finding,
      severity: ["native_crash_cluster", "startup_failure", "emergency_launch"].includes(finding) ? "critical" : "warning",
      target_type: "ios_runtime",
      target_id: "com.chillywood.mobile:1.0.0:8",
      review_status: "open",
      environment_mode: "production",
      pii_stored: false,
      secrets_logged: false,
      release_action_executed: false,
      user_rights_changed: false,
      money_moved: false,
      ...identity,
      metadata: sanitizeAutonomousReadback({ providerUnavailable: finding.endsWith("_provider_unavailable") }),
    };
    if (table === "analytics_delivery_findings") {
      row.provider = "firebase_analytics";
      row.capability = "delivery_status";
    }
    if (table === "backend_error_rate_findings") {
      row.backend_surface = "supabase_edge_functions";
      row.error_rate_percent = edge.readbackComplete === true ? numberValue(edge.errorRatePercent) : null;
    }
    if (table === "release_health_findings") {
      row.embedded_launch = releaseSnapshot?.embedded_launch === true;
      row.emergency_launch = releaseSnapshot?.emergency_launch === true;
    }
    const { data: existing, error: existingError } = await client.from(table)
      .select("id")
      .eq("system_id", "observability_runtime_operator")
      .eq("platform", "ios")
      .eq("flag_type", finding)
      .eq("target_id", "com.chillywood.mobile:1.0.0:8")
      .eq("review_status", "open")
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) {
      const { error } = await client.from(table).update({ severity: row.severity, metadata: row.metadata, updated_at: windowEnd }).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await client.from(table).insert(row);
      if (error?.code === "23505") {
        const { data: raced, error: racedError } = await client.from(table)
          .select("id")
          .eq("system_id", "observability_runtime_operator")
          .eq("platform", "ios")
          .eq("flag_type", finding)
          .eq("target_id", "com.chillywood.mobile:1.0.0:8")
          .eq("review_status", "open")
          .limit(1)
          .maybeSingle();
        if (racedError || !raced?.id) throw racedError ?? error;
        const { error: updateError } = await client.from(table).update({ severity: row.severity, metadata: row.metadata, updated_at: windowEnd }).eq("id", raced.id);
        if (updateError) throw updateError;
      } else if (error) throw error;
    }
  }
  if (classification.readbackComplete) {
    for (const table of IOS_TYPED_FINDING_TABLES) {
      const { data: openRows, error: openRowsError } = await client.from(table)
        .select("id,flag_type")
        .eq("system_id", "observability_runtime_operator")
        .eq("platform", "ios")
        .eq("review_status", "open");
      if (openRowsError) throw openRowsError;
      const active = activeFindingsByTable.get(table) ?? new Set<string>();
      const resolvedIds = (openRows ?? []).filter((entry: JsonObject) => !active.has(String(entry.flag_type ?? ""))).map((entry: JsonObject) => entry.id);
      if (resolvedIds.length) {
        const { error: resolveError } = await client.from(table).update({ review_status: "reviewed", updated_at: windowEnd }).in("id", resolvedIds);
        if (resolveError) throw resolveError;
      }
    }
  }

  return {
    readbackComplete: classification.readbackComplete,
    platform: "ios",
    source: identity.data_source,
    dataWindow: { start: windowStart, end: windowEnd },
    healthState: classification.healthState,
    reasons: classification.findings,
    findings: classification.findings,
    missingCapabilities: classification.missingCapabilities,
    moneyMoved: false,
    userRightsChanged: false,
    highRiskExecuted: false,
  };
};

export const runSharedObservabilityProbe: ScopedOperatorHandler = async ({ client, payload }) => {
  const providerReadback = platformProviderReadback(payload, "shared");
  const edge = objectValue(providerReadback.supabaseEdgeFunctions);
  const end = new Date();
  const start = new Date(end.getTime() - 10 * 60 * 1000);
  const complete = edge.readbackComplete === true;
  const errorRate = complete ? numberValue(edge.errorRatePercent) : null;
  const healthState = !complete ? "unknown" : Number(errorRate ?? 0) >= 5 ? "degraded" : "healthy";
  const { error } = await client.from("runtime_health_snapshots").insert({
    system_id: "observability_runtime_operator", platform: "shared", health_state: healthState,
    crash_cluster_count: 0, js_error_count: 0, performance_regression_count: 0,
    backend_error_rate_percent: errorRate, environment_mode: "production", pii_stored: false,
    secrets_logged: false, release_action_executed: false, user_rights_changed: false, money_moved: false,
    data_source: "sanitized_supabase_edge_backend_export", readback_complete: complete,
    window_start: start.toISOString(), window_end: end.toISOString(),
    metadata: sanitizeAutonomousReadback({ providerUnavailable: !complete, zeroEventsTreatedAsHealthy: false }),
  });
  if (error) throw error;
  return { readbackComplete: complete, platform: "shared", source: "sanitized_supabase_edge_backend_export", dataWindow: { start: start.toISOString(), end: end.toISOString() }, healthState, reasons: complete ? [] : ["supabase_edge_export_unavailable"], moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};

export const runAndroidObservabilityProbe: ScopedOperatorHandler = async ({ client, payload }) => {
  const providerReadback = platformProviderReadback(payload, "android");
  const firebase = objectValue(providerReadback.firebase);
  const edge = objectValue(providerReadback.supabaseEdgeFunctions);
  const now = new Date();
  const start = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const end = now.toISOString();
  const { data: release, error: releaseError } = await client.from("release_health_snapshots")
    .select("bundle_identifier,app_version,native_build,runtime_version,channel,update_id,distribution_source,readback_complete")
    .eq("platform", "android").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (releaseError) throw releaseError;
  const providers = {
    crashlytics: firebase.crashlyticsReadbackComplete === true,
    firebasePerformance: firebase.performanceReadbackComplete === true,
    firebaseAnalytics: firebase.analyticsReadbackComplete === true,
    supabaseEdgeFunctions: edge.readbackComplete === true,
    releaseDiagnostics: release?.readback_complete === true,
  };
  const complete = Object.values(providers).every(Boolean);
  const findings = Object.entries(providers).filter(([, available]) => !available).map(([name]) => `${name}_provider_unavailable`);
  const critical = numberValue(firebase.nativeCrashCount) > 0 || numberValue(firebase.startupFailureCount) > 0;
  const healthState = critical ? "critical" : complete ? "healthy" : Object.values(providers).some(Boolean) ? "degraded" : "unknown";
  const observedReleaseComplete = release?.readback_complete === true;
  for (const [provider, available] of Object.entries(providers)) {
    const { error: capabilityError } = await client.from("autonomous_provider_readback_capabilities").insert({
      system_id: "observability_runtime_operator",
      platform: "android",
      provider,
      capability: "android_health_readback",
      capability_state: available ? "available" : "unavailable",
      missing_capability: available ? null : `${provider}_provider_unavailable`,
      readback_complete: available,
      data_source: provider === "releaseDiagnostics" ? "supabase_sanitized_snapshot" : "host_read_only_provider_adapter",
      provider_environment: null,
      money_moved: false,
      user_rights_changed: false,
      high_risk_executed: false,
      metadata: sanitizeAutonomousReadback({ status: available ? "readback_complete" : "provider_unavailable" }),
    });
    if (capabilityError) throw capabilityError;
  }
  const { error } = await client.from("runtime_health_snapshots").insert({
    system_id: "observability_runtime_operator", platform: "android", health_state: healthState,
    crash_cluster_count: numberValue(firebase.nativeCrashCount), js_error_count: numberValue(firebase.jsFatalCount),
    performance_regression_count: numberValue(firebase.performanceRegressionCount),
    backend_error_rate_percent: edge.readbackComplete === true ? numberValue(edge.errorRatePercent) : null,
    bundle_identifier: observedReleaseComplete ? release?.bundle_identifier ?? null : null,
    app_version: observedReleaseComplete ? release?.app_version ?? null : null,
    native_build: observedReleaseComplete ? release?.native_build ?? null : null,
    runtime_version: observedReleaseComplete ? release?.runtime_version ?? null : null,
    channel: observedReleaseComplete ? release?.channel ?? null : null,
    update_id: observedReleaseComplete ? release?.update_id ?? null : null,
    distribution_source: observedReleaseComplete ? release?.distribution_source ?? null : null,
    provider_environment: null, environment_mode: "production", pii_stored: false, secrets_logged: false,
    release_action_executed: false, user_rights_changed: false, money_moved: false,
    data_source: "firebase_host_adapter+supabase_readback+android_release_snapshot", readback_complete: complete,
    window_start: start, window_end: end, metadata: sanitizeAutonomousReadback({ findings, expectedIdentity: { packageIdentifier: "com.chillywood.mobile", runtimeVersion: "1.0.0", channel: "production" } }),
  });
  if (error) throw error;
  return { readbackComplete: complete, platform: "android", source: "firebase_host_adapter+supabase_readback+android_release_snapshot", dataWindow: { start, end }, healthState, reasons: findings, moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};
