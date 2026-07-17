import {
  classifyIosObservabilityAutonomy,
  IOS_QA_RELEASE_EXPECTATION,
  sanitizeAutonomousReadback,
} from "../_shared/ios-autonomous-operator-policy.mjs";
import type { ScopedOperatorHandler } from "../_shared/scoped-operator.ts";

type JsonObject = Record<string, unknown>;
const objectValue = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export const runIosObservabilityProbe: ScopedOperatorHandler = async ({ client, payload, metadata }) => {
  const providerReadback = objectValue(payload.provider_readback ?? payload.providerReadback);
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
    runtimeMismatch: Boolean(releaseSnapshot && releaseSnapshot.runtime_version !== IOS_QA_RELEASE_EXPECTATION.runtimeVersion),
    channelMismatch: Boolean(releaseSnapshot && releaseSnapshot.channel !== IOS_QA_RELEASE_EXPECTATION.channel),
    updateMismatch: false,
    embeddedLaunch: releaseSnapshot?.embedded_launch === true,
    emergencyLaunch: releaseSnapshot?.emergency_launch === true,
  });

  const identity = {
    platform: "ios",
    bundle_identifier: releaseSnapshot?.bundle_identifier ?? IOS_QA_RELEASE_EXPECTATION.bundleIdentifier,
    app_version: releaseSnapshot?.app_version ?? IOS_QA_RELEASE_EXPECTATION.appVersion,
    native_build: releaseSnapshot?.native_build ?? IOS_QA_RELEASE_EXPECTATION.nativeBuild,
    runtime_version: releaseSnapshot?.runtime_version ?? null,
    channel: releaseSnapshot?.channel ?? null,
    update_id: releaseSnapshot?.update_id ?? null,
    distribution_source: releaseSnapshot?.distribution_source ?? "unknown",
    provider_environment: "production",
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
  for (const finding of classification.findings) {
    const table = tableForFinding(finding);
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
    const { error } = await client.from(table).insert(row);
    if (error) throw error;
  }

  return {
    readbackComplete: classification.readbackComplete,
    platform: "ios",
    source: identity.data_source,
    dataWindow: { start: windowStart, end: windowEnd },
    healthState: classification.healthState,
    findings: classification.findings,
    missingCapabilities: classification.missingCapabilities,
    moneyMoved: false,
    userRightsChanged: false,
    highRiskExecuted: false,
  };
};
