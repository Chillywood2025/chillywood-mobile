import { Platform } from "react-native";

import { ensureFirebaseDefaultApp } from "./firebaseApp";
import { getRuntimeConfig } from "./runtimeConfig";

let performanceBootstrapped = false;

const canUseFirebasePerformance = () => Platform.OS !== "web";

let cachedPerformanceModule: typeof import("@react-native-firebase/perf").default | null = null;

const maybeWarn = (scope: string, error: unknown) => {
  if (!__DEV__) return;
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  console.warn(`[firebase-perf] ${scope}: ${message}`);
};

const getPerformanceModule = () => {
  if (!canUseFirebasePerformance()) return null;
  if (!ensureFirebaseDefaultApp()) return null;

  cachedPerformanceModule ??=
    require("@react-native-firebase/perf").default as typeof import("@react-native-firebase/perf").default;

  return cachedPerformanceModule;
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
  const performanceModule = getPerformanceModule();
  if (!performanceModule) return false;

  try {
    await performanceModule().setPerformanceCollectionEnabled(true);

    if (!performanceBootstrapped) {
      const trace = performanceModule().newTrace("app_runtime_bootstrap");
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
  const performanceModule = getPerformanceModule();
  if (!performanceModule) {
    return { ok: false as const, reason: "unsupported_platform" };
  }

  try {
    const trace = performanceModule().newTrace("dev_monitoring_trace_probe");
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
  const performanceModule = getPerformanceModule();
  if (!performanceModule) {
    return { ok: false as const, reason: "unsupported_platform" };
  }

  const probe = buildSupabaseSettingsProbe();
  if (!probe) {
    return { ok: false as const, reason: "missing_runtime_config" };
  }

  const metric = performanceModule().newHttpMetric(probe.url, "GET");

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
