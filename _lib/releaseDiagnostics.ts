import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { IMAGE_MANIPULATOR_NATIVE_MODULE_NAME } from "./imageManipulatorNativeBoundary.mjs";

export type ReleaseUpdateCheckStatus =
  | "available"
  | "downloaded"
  | "error"
  | "not_checked"
  | "unavailable";

export type ReleaseUpdateCheckResult = {
  checkedAt: string;
  reason: string;
  status: ReleaseUpdateCheckStatus;
};

export type ReleaseDiagnostics = {
  appOwnership: string | null;
  appVersion: string | null;
  applicationId: string | null;
  buildVersion: string | null;
  channel: string | null;
  checkAutomatically: string | null;
  createdAt: string | null;
  isEmbeddedLaunch: boolean | null;
  isEmergencyLaunch: boolean | null;
  imageManipulatorNativeModuleAvailable: boolean;
  internalV2OtaPlatform: string | null;
  iosNativeCallsAvailable: boolean | null;
  iosNativeCallsBuildEnabled: boolean | null;
  iosNativeCallsDisabledReason: string | null;
  iosNativeCallsRuntimeEnabled: boolean | null;
  iosVoipApnsEnvironment: string | null;
  iosVoipRegistrationStatus: string | null;
  latestKnownUpdateCheckResult: ReleaseUpdateCheckResult | null;
  nativeApplicationVersion: string | null;
  nativeBuildVersion: string | null;
  platform: string;
  runtimeVersion: string | null;
  updateId: string | null;
};

export type ReleaseDiagnosticsDisplay = ReleaseDiagnostics;

const normalizeText = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const normalizeDate = (value: unknown) => {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();

  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

const readRuntimeExtra = () => {
  const extra = Constants.expoConfig?.extra;
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return {};
  const runtime = (extra as Record<string, unknown>).runtime;
  return runtime && typeof runtime === "object" && !Array.isArray(runtime)
    ? runtime as Record<string, unknown>
    : {};
};

const readIosNativeCallsRuntimeEnabled = () => {
  if (Platform.OS !== "ios") return null;
  const runtime = readRuntimeExtra();
  const communication = runtime.communication && typeof runtime.communication === "object" && !Array.isArray(runtime.communication)
    ? runtime.communication as Record<string, unknown>
    : {};
  const value = communication.iosNativeCallsEnabled ?? runtime.iosNativeCallsEnabled;
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
};

let latestKnownUpdateCheckResult: ReleaseUpdateCheckResult | null = null;

export function recordReleaseUpdateCheckResult(result: {
  checkedAt?: Date | string | null;
  reason: string;
  status: ReleaseUpdateCheckStatus;
}) {
  latestKnownUpdateCheckResult = {
    checkedAt: normalizeDate(result.checkedAt ?? new Date()) ?? new Date().toISOString(),
    reason: normalizeText(result.reason) ?? "unknown",
    status: result.status,
  };
}

export function readReleaseDiagnostics(): ReleaseDiagnostics {
  const runtime = readRuntimeExtra();
  return {
    appOwnership: normalizeText(Constants.appOwnership),
    appVersion: normalizeText(Application.nativeApplicationVersion ?? Constants.expoConfig?.version),
    applicationId: normalizeText(Application.applicationId),
    buildVersion: normalizeText(Application.nativeBuildVersion),
    channel: normalizeText(Updates.channel),
    checkAutomatically: normalizeText(Updates.checkAutomatically),
    createdAt: normalizeDate(Updates.createdAt),
    isEmbeddedLaunch: typeof Updates.isEmbeddedLaunch === "boolean" ? Updates.isEmbeddedLaunch : null,
    isEmergencyLaunch: typeof Updates.isEmergencyLaunch === "boolean" ? Updates.isEmergencyLaunch : null,
    imageManipulatorNativeModuleAvailable: requireOptionalNativeModule(IMAGE_MANIPULATOR_NATIVE_MODULE_NAME) != null,
    internalV2OtaPlatform: normalizeText(runtime.internalV2OtaPlatform),
    iosNativeCallsAvailable: null,
    iosNativeCallsBuildEnabled: null,
    iosNativeCallsDisabledReason: null,
    iosNativeCallsRuntimeEnabled: readIosNativeCallsRuntimeEnabled(),
    iosVoipApnsEnvironment: null,
    iosVoipRegistrationStatus: null,
    latestKnownUpdateCheckResult,
    nativeApplicationVersion: normalizeText(Application.nativeApplicationVersion),
    nativeBuildVersion: normalizeText(Application.nativeBuildVersion),
    platform: Platform.OS,
    runtimeVersion: normalizeText(Updates.runtimeVersion),
    updateId: normalizeText(Updates.updateId),
  };
}

export function sanitizeReleaseDiagnosticsForDisplay(
  diagnostics: Partial<ReleaseDiagnostics>,
): ReleaseDiagnosticsDisplay {
  return {
    appOwnership: normalizeText(diagnostics.appOwnership),
    appVersion: normalizeText(diagnostics.appVersion),
    applicationId: normalizeText(diagnostics.applicationId),
    buildVersion: normalizeText(diagnostics.buildVersion),
    channel: normalizeText(diagnostics.channel),
    checkAutomatically: normalizeText(diagnostics.checkAutomatically),
    createdAt: normalizeDate(diagnostics.createdAt),
    isEmbeddedLaunch: typeof diagnostics.isEmbeddedLaunch === "boolean" ? diagnostics.isEmbeddedLaunch : null,
    isEmergencyLaunch: typeof diagnostics.isEmergencyLaunch === "boolean" ? diagnostics.isEmergencyLaunch : null,
    imageManipulatorNativeModuleAvailable: diagnostics.imageManipulatorNativeModuleAvailable === true,
    internalV2OtaPlatform: normalizeText(diagnostics.internalV2OtaPlatform),
    iosNativeCallsAvailable: typeof diagnostics.iosNativeCallsAvailable === "boolean" ? diagnostics.iosNativeCallsAvailable : null,
    iosNativeCallsBuildEnabled: typeof diagnostics.iosNativeCallsBuildEnabled === "boolean" ? diagnostics.iosNativeCallsBuildEnabled : null,
    iosNativeCallsDisabledReason: normalizeText(diagnostics.iosNativeCallsDisabledReason),
    iosNativeCallsRuntimeEnabled: typeof diagnostics.iosNativeCallsRuntimeEnabled === "boolean" ? diagnostics.iosNativeCallsRuntimeEnabled : null,
    iosVoipApnsEnvironment: normalizeText(diagnostics.iosVoipApnsEnvironment),
    iosVoipRegistrationStatus: normalizeText(diagnostics.iosVoipRegistrationStatus),
    latestKnownUpdateCheckResult: diagnostics.latestKnownUpdateCheckResult
      ? {
        checkedAt: normalizeDate(diagnostics.latestKnownUpdateCheckResult.checkedAt) ?? new Date(0).toISOString(),
        reason: normalizeText(diagnostics.latestKnownUpdateCheckResult.reason) ?? "unknown",
        status: diagnostics.latestKnownUpdateCheckResult.status,
      }
      : null,
    nativeApplicationVersion: normalizeText(diagnostics.nativeApplicationVersion),
    nativeBuildVersion: normalizeText(diagnostics.nativeBuildVersion),
    platform: normalizeText(diagnostics.platform) ?? Platform.OS,
    runtimeVersion: normalizeText(diagnostics.runtimeVersion),
    updateId: normalizeText(diagnostics.updateId),
  };
}

const formatNullable = (value: string | null) => value ?? "null";
const formatBoolean = (value: boolean | null) => (value === null ? "null" : String(value));

export function formatReleaseDiagnosticsSummary(diagnostics: ReleaseDiagnosticsDisplay) {
  const updateCheck = diagnostics.latestKnownUpdateCheckResult;
  return [
    `Application ID: ${formatNullable(diagnostics.applicationId)}`,
    `App version: ${formatNullable(diagnostics.appVersion)}`,
    `Native application version: ${formatNullable(diagnostics.nativeApplicationVersion)}`,
    `Native build version: ${formatNullable(diagnostics.nativeBuildVersion)}`,
    `Platform: ${diagnostics.platform}`,
    `Runtime version: ${formatNullable(diagnostics.runtimeVersion)}`,
    `Channel: ${formatNullable(diagnostics.channel)}`,
    `Update ID: ${formatNullable(diagnostics.updateId)}`,
    `Created at: ${formatNullable(diagnostics.createdAt)}`,
    `Embedded launch: ${formatBoolean(diagnostics.isEmbeddedLaunch)}`,
    `Emergency launch: ${formatBoolean(diagnostics.isEmergencyLaunch)}`,
    `ExpoImageManipulator native module: ${diagnostics.imageManipulatorNativeModuleAvailable ? "available" : "missing"}`,
    `Internal-v2 OTA target: ${formatNullable(diagnostics.internalV2OtaPlatform)}`,
    `iOS native calls available: ${formatBoolean(diagnostics.iosNativeCallsAvailable)}`,
    `iOS native calls build enabled: ${formatBoolean(diagnostics.iosNativeCallsBuildEnabled)}`,
    `iOS native calls runtime enabled: ${formatBoolean(diagnostics.iosNativeCallsRuntimeEnabled)}`,
    `iOS native calls disabled reason: ${formatNullable(diagnostics.iosNativeCallsDisabledReason)}`,
    `iOS VoIP APNs environment: ${formatNullable(diagnostics.iosVoipApnsEnvironment)}`,
    `iOS VoIP registration: ${formatNullable(diagnostics.iosVoipRegistrationStatus)}`,
    `Check automatically: ${formatNullable(diagnostics.checkAutomatically)}`,
    `App ownership: ${formatNullable(diagnostics.appOwnership)}`,
    `Latest update check: ${updateCheck ? `${updateCheck.status} (${updateCheck.reason}) at ${updateCheck.checkedAt}` : "null"}`,
  ].join("\n");
}
