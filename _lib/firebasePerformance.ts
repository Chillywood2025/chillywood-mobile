import perf from "@react-native-firebase/perf";
import { Platform } from "react-native";

import { getRuntimeConfig } from "./runtimeConfig";

let performanceBootstrapped = false;

const canUseFirebasePerformance = () => Platform.OS !== "web";

const maybeWarn = (scope: string, error: unknown) => {
  if (!__DEV__) return;
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  console.warn(`[firebase-perf] ${scope}: ${message}`);
};

const buildSupabaseSettingsProbe = () => {
  const config = getRuntimeConfig();
  const supabaseUrl = String(config.supabaseUrl ?? "").trim().replace(/\/+$/, "");
  const supabaseAnonKey = String(config.supabaseAnonKey ?? "").trim();

  if (!supabaseUrl || !supabaseAnonKey) return null;

  return {
    url: `${supabaseUrl}/auth/v1/settings`,
    anonKey: supabaseAnonKey,
  };
};

export async function bootstrapFirebasePerformance() {
  if (!canUseFirebasePerformance()) return false;

  try {
    await perf().setPerformanceCollectionEnabled(true);

    if (!performanceBootstrapped) {
      const trace = perf().newTrace("app_runtime_bootstrap");
      await trace.start();
      trace.putAttribute("surface", "app_shell");
      trace.putMetric("bootstrap_runs", 1);
      await trace.stop();
      performanceBootstrapped = true;
    }

    return true;
  } catch (error) {
    maybeWarn("bootstrap", error);
    return false;
  }
}

export async function runFirebasePerformanceTraceTest() {
  if (!canUseFirebasePerformance()) {
    return { ok: false as const, reason: "unsupported_platform" };
  }

  try {
    const trace = perf().newTrace("dev_monitoring_trace_probe");
    await trace.start();
    trace.putAttribute("source", "dev_debug_overlay");
    trace.putMetric("probe_runs", 1);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await trace.stop();

    return { ok: true as const };
  } catch (error) {
    maybeWarn("trace-test", error);
    return { ok: false as const, reason: "trace_failed" };
  }
}

export async function runFirebasePerformanceNetworkProbe() {
  if (!canUseFirebasePerformance()) {
    return { ok: false as const, reason: "unsupported_platform" };
  }

  const probe = buildSupabaseSettingsProbe();
  if (!probe) {
    return { ok: false as const, reason: "missing_runtime_config" };
  }

  const metric = perf().newHttpMetric(probe.url, "GET");

  try {
    await metric.start();
    metric.putAttribute("source", "dev_debug_overlay");

    const response = await fetch(probe.url, {
      method: "GET",
      headers: {
        apikey: probe.anonKey,
        Accept: "application/json",
      },
    });
    const body = await response.text();

    metric.setHttpResponseCode(response.status);
    metric.setResponseContentType(response.headers.get("content-type"));
    metric.setResponsePayloadSize(body.length || null);
    await metric.stop();

    return {
      ok: response.ok as boolean,
      status: response.status,
    };
  } catch (error) {
    maybeWarn("network-probe", error);
    try {
      await metric.stop();
    } catch {
      // noop
    }
    return { ok: false as const, reason: "network_probe_failed" };
  }
}
