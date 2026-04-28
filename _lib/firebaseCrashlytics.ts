import { Platform } from "react-native";
import { ensureFirebaseDefaultApp } from "./firebaseApp";

type CrashlyticsMeta = Record<string, unknown> | undefined;

const canUseFirebaseCrashlytics = () => Platform.OS !== "web";

let cachedCrashlyticsModule: typeof import("@react-native-firebase/crashlytics").default | null = null;

const SENSITIVE_TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-jwt]"],
  [/([?&](?:access_token|refresh_token|token|apikey|key|signature|expires|expires_in)=)[^&\s]+/gi, "$1[redacted]"],
  [/((?:participantToken|signedUrl|authorization|apiKey|secret|jwt)\s*[:=]\s*)[^\s,}]+/gi, "$1[redacted]"],
];

const redactSensitiveText = (value: string) => (
  SENSITIVE_TEXT_PATTERNS.reduce((nextValue, [pattern, replacement]) => (
    nextValue.replace(pattern, replacement)
  ), value)
);

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    const nextError = new Error(redactSensitiveText(error.message));
    nextError.name = redactSensitiveText(error.name);
    if (error.stack) nextError.stack = redactSensitiveText(error.stack);
    return nextError;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = [
      typeof record.message === "string" ? record.message.trim() : "",
      typeof record.details === "string" ? record.details.trim() : "",
      typeof record.hint === "string" ? record.hint.trim() : "",
    ].filter(Boolean).join(" ");

    const nextError = new Error(redactSensitiveText(message || String(record.code ?? "Unknown error")));
    if (typeof record.name === "string" && record.name.trim()) {
      nextError.name = redactSensitiveText(record.name.trim());
    }
    if (typeof record.stack === "string" && record.stack.trim()) {
      nextError.stack = redactSensitiveText(record.stack.trim());
    }
    return nextError;
  }

  return new Error(redactSensitiveText(String(error ?? "Unknown error")));
};

const sanitizeLogLine = (value: unknown) => redactSensitiveText(String(value ?? "").trim()).slice(0, 1000);

const serializeMeta = (meta: CrashlyticsMeta) => {
  if (!meta) return "";

  try {
    return JSON.stringify(meta, (_key, value) => {
      if (value == null) return value;
      if (typeof value === "string") return redactSensitiveText(value);
      if (typeof value === "number" || typeof value === "boolean") return value;
      return redactSensitiveText(String(value));
    }).slice(0, 1000);
  } catch {
    return "";
  }
};

const maybeWarn = (scope: string, error: unknown) => {
  if (!__DEV__) return;
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  console.warn(`[firebase-crashlytics] ${scope}: ${message}`);
};

const getCrashlyticsModule = () => {
  if (!canUseFirebaseCrashlytics()) return null;
  if (!ensureFirebaseDefaultApp()) return null;

  cachedCrashlyticsModule ??=
    require("@react-native-firebase/crashlytics").default as typeof import("@react-native-firebase/crashlytics").default;

  return cachedCrashlyticsModule;
};

export async function bootstrapFirebaseCrashlytics() {
  const crashlyticsModule = getCrashlyticsModule();
  if (!crashlyticsModule) return false;

  try {
    await crashlyticsModule().setCrashlyticsCollectionEnabled(true);
    crashlyticsModule().log("Chi'llywood Crashlytics bootstrap complete.");
    return true;
  } catch (error) {
    maybeWarn("bootstrap", error);
    return false;
  }
}

export async function identifyFirebaseCrashlyticsUser(identity: { id: string; email?: string | null }) {
  const crashlyticsModule = getCrashlyticsModule();
  if (!crashlyticsModule) return;

  try {
    await crashlyticsModule().setUserId(identity.id);
    const email = String(identity.email ?? "").trim();
    if (email) {
      await crashlyticsModule().setAttribute("email", email.slice(0, 100));
    }
  } catch (error) {
    maybeWarn("identify-user", error);
  }
}

export async function clearFirebaseCrashlyticsUser() {
  const crashlyticsModule = getCrashlyticsModule();
  if (!crashlyticsModule) return;

  try {
    await crashlyticsModule().setUserId("");
    await crashlyticsModule().setAttribute("email", "");
  } catch (error) {
    maybeWarn("clear-user", error);
  }
}

export function logFirebaseCrashlyticsMessage(message: string, meta?: CrashlyticsMeta) {
  const crashlyticsModule = getCrashlyticsModule();
  if (!crashlyticsModule) return;

  try {
    const normalizedMessage = sanitizeLogLine(message);
    if (normalizedMessage) {
      crashlyticsModule().log(normalizedMessage);
    }

    const serializedMeta = serializeMeta(meta);
    if (serializedMeta) {
      crashlyticsModule().log(serializedMeta);
    }
  } catch (error) {
    maybeWarn("log", error);
  }
}

export function recordFirebaseCrashlyticsError(scope: string, error: unknown, meta?: CrashlyticsMeta) {
  const crashlyticsModule = getCrashlyticsModule();
  if (!crashlyticsModule) return;

  try {
    const normalizedError = normalizeError(error);
    crashlyticsModule().log(`[${scope}] ${sanitizeLogLine(normalizedError.message)}`);

    const serializedMeta = serializeMeta(meta);
    if (serializedMeta) {
      crashlyticsModule().log(`[${scope}] ${serializedMeta}`);
    }

    crashlyticsModule().recordError(normalizedError, scope);
  } catch (recordErrorError) {
    maybeWarn("record-error", recordErrorError);
  }
}

export async function runFirebaseCrashlyticsNonFatalTest() {
  const crashlyticsModule = getCrashlyticsModule();
  if (!crashlyticsModule) {
    return { ok: false as const, reason: "unsupported_platform" };
  }

  try {
    await crashlyticsModule().setAttribute("monitoring_test", "non_fatal");
    crashlyticsModule().log("Running Firebase Crashlytics non-fatal monitoring test.");
    crashlyticsModule().recordError(
      new Error("Firebase Crashlytics non-fatal monitoring test"),
      "FirebaseCrashlyticsNonFatalTest",
    );
    return { ok: true as const };
  } catch (error) {
    maybeWarn("test-non-fatal", error);
    return { ok: false as const, reason: "record_failed" };
  }
}

export function triggerFirebaseCrashlyticsTestCrash() {
  const crashlyticsModule = getCrashlyticsModule();
  if (!crashlyticsModule) return;
  crashlyticsModule().log("Running Firebase Crashlytics forced native crash test.");
  crashlyticsModule().crash();
}

export async function didFirebaseCrashlyticsCrashPreviously() {
  const crashlyticsModule = getCrashlyticsModule();
  if (!crashlyticsModule) {
    return { ok: false as const, reason: "unsupported_platform" };
  }

  try {
    return {
      ok: true as const,
      didCrash: await crashlyticsModule().didCrashOnPreviousExecution(),
    };
  } catch (error) {
    maybeWarn("did-crash-previously", error);
    return { ok: false as const, reason: "read_failed" };
  }
}
