import { reportDebugError } from "./devDebug";
import { recordFirebaseCrashlyticsError } from "./firebaseCrashlytics";
import { trackEvent, type AnalyticsPayload } from "./analytics";

type SerializableMeta = AnalyticsPayload | Record<string, unknown> | undefined;

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

const redactSerializableValue = (value: unknown): string | number | boolean | null => {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  return redactSensitiveText(String(value));
};

const sanitizeMeta = (meta?: SerializableMeta) => {
  if (!meta || typeof meta !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [key, redactSerializableValue(value)]),
  );
};

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: redactSensitiveText(error.name),
      message: redactSensitiveText(error.message),
      stack: error.stack ? redactSensitiveText(error.stack) : undefined,
    };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const normalizeText = (value: unknown) => (typeof value === "string" ? value.trim() : "");
    const message = [
      normalizeText(record.message),
      normalizeText(record.details),
      normalizeText(record.hint),
    ].filter(Boolean).join(" ");

    return {
      name: normalizeText(record.name) || "Error",
      message: redactSensitiveText(message || normalizeText(record.code) || "Unknown error"),
      stack: normalizeText(record.stack) ? redactSensitiveText(normalizeText(record.stack)) : undefined,
    };
  }

  return {
    name: "Error",
    message: redactSensitiveText(String(error ?? "Unknown error")),
  };
};

export function debugLog(scope: string, message: string, meta?: SerializableMeta) {
  if (!__DEV__) return;
  const safeMessage = redactSensitiveText(message);
  const safeMeta = sanitizeMeta(meta);
  if (meta) {
    console.log(`[${scope}] ${safeMessage}`, safeMeta ?? {});
    return;
  }
  console.log(`[${scope}] ${safeMessage}`);
}

export function reportRuntimeError(scope: string, error: unknown, meta?: SerializableMeta) {
  const normalized = serializeError(error);
  const safeMeta = sanitizeMeta(meta);
  reportDebugError(`${scope}: ${normalized.message}`);
  recordFirebaseCrashlyticsError(scope, normalized, safeMeta);

  if (__DEV__) {
    console.error(`[${scope}] ${normalized.message}`, {
      ...normalized,
      meta: safeMeta,
    });
  }

  trackEvent("runtime_error", {
    scope,
    message: normalized.message,
    ...(safeMeta ?? {}),
  });

  return normalized;
}
