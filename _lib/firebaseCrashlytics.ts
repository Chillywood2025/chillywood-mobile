import crashlytics from "@react-native-firebase/crashlytics";
import { Platform } from "react-native";

type CrashlyticsMeta = Record<string, unknown> | undefined;

const canUseFirebaseCrashlytics = () => Platform.OS !== "web";

const normalizeError = (error: unknown) => {
  if (error instanceof Error) return error;

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = [
      typeof record.message === "string" ? record.message.trim() : "",
      typeof record.details === "string" ? record.details.trim() : "",
      typeof record.hint === "string" ? record.hint.trim() : "",
    ].filter(Boolean).join(" ");

    const nextError = new Error(message || String(record.code ?? "Unknown error"));
    if (typeof record.name === "string" && record.name.trim()) {
      nextError.name = record.name.trim();
    }
    if (typeof record.stack === "string" && record.stack.trim()) {
      nextError.stack = record.stack.trim();
    }
    return nextError;
  }

  return new Error(String(error ?? "Unknown error"));
};

const sanitizeLogLine = (value: unknown) => String(value ?? "").trim().slice(0, 1000);

const serializeMeta = (meta: CrashlyticsMeta) => {
  if (!meta) return "";

  try {
    return JSON.stringify(meta, (_key, value) => {
      if (value == null) return value;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
      return String(value);
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

export async function bootstrapFirebaseCrashlytics() {
  if (!canUseFirebaseCrashlytics()) return false;

  try {
    await crashlytics().setCrashlyticsCollectionEnabled(true);
    crashlytics().log("Chi'llywood Crashlytics bootstrap complete.");
    return true;
  } catch (error) {
    maybeWarn("bootstrap", error);
    return false;
  }
}

export async function identifyFirebaseCrashlyticsUser(identity: { id: string; email?: string | null }) {
  if (!canUseFirebaseCrashlytics()) return;

  try {
    await crashlytics().setUserId(identity.id);
    const email = String(identity.email ?? "").trim();
    if (email) {
      await crashlytics().setAttribute("email", email.slice(0, 100));
    }
  } catch (error) {
    maybeWarn("identify-user", error);
  }
}

export async function clearFirebaseCrashlyticsUser() {
  if (!canUseFirebaseCrashlytics()) return;

  try {
    await crashlytics().setUserId("");
    await crashlytics().setAttribute("email", "");
  } catch (error) {
    maybeWarn("clear-user", error);
  }
}

export function logFirebaseCrashlyticsMessage(message: string, meta?: CrashlyticsMeta) {
  if (!canUseFirebaseCrashlytics()) return;

  try {
    const normalizedMessage = sanitizeLogLine(message);
    if (normalizedMessage) {
      crashlytics().log(normalizedMessage);
    }

    const serializedMeta = serializeMeta(meta);
    if (serializedMeta) {
      crashlytics().log(serializedMeta);
    }
  } catch (error) {
    maybeWarn("log", error);
  }
}

export function recordFirebaseCrashlyticsError(scope: string, error: unknown, meta?: CrashlyticsMeta) {
  if (!canUseFirebaseCrashlytics()) return;

  try {
    const normalizedError = normalizeError(error);
    crashlytics().log(`[${scope}] ${sanitizeLogLine(normalizedError.message)}`);

    const serializedMeta = serializeMeta(meta);
    if (serializedMeta) {
      crashlytics().log(`[${scope}] ${serializedMeta}`);
    }

    crashlytics().recordError(normalizedError, scope);
  } catch (recordErrorError) {
    maybeWarn("record-error", recordErrorError);
  }
}

export async function runFirebaseCrashlyticsNonFatalTest() {
  if (!canUseFirebaseCrashlytics()) {
    return { ok: false as const, reason: "unsupported_platform" };
  }

  try {
    await crashlytics().setAttribute("monitoring_test", "non_fatal");
    crashlytics().log("Running Firebase Crashlytics non-fatal monitoring test.");
    crashlytics().recordError(
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
  if (!canUseFirebaseCrashlytics()) return;
  crashlytics().log("Running Firebase Crashlytics forced native crash test.");
  crashlytics().crash();
}

export async function didFirebaseCrashlyticsCrashPreviously() {
  if (!canUseFirebaseCrashlytics()) {
    return { ok: false as const, reason: "unsupported_platform" };
  }

  try {
    return {
      ok: true as const,
      didCrash: await crashlytics().didCrashOnPreviousExecution(),
    };
  } catch (error) {
    maybeWarn("did-crash-previously", error);
    return { ok: false as const, reason: "read_failed" };
  }
}
