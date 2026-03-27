import { reportDebugError } from "./devDebug";
import { trackEvent, type AnalyticsPayload } from "./analytics";

type SerializableMeta = AnalyticsPayload | Record<string, unknown> | undefined;

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "Error",
    message: String(error ?? "Unknown error"),
  };
};

export function debugLog(scope: string, message: string, meta?: SerializableMeta) {
  if (!__DEV__) return;
  if (meta) {
    console.log(`[${scope}] ${message}`, meta);
    return;
  }
  console.log(`[${scope}] ${message}`);
}

export function reportRuntimeError(scope: string, error: unknown, meta?: SerializableMeta) {
  const normalized = serializeError(error);
  reportDebugError(`${scope}: ${normalized.message}`);

  if (__DEV__) {
    console.error(`[${scope}] ${normalized.message}`, {
      ...normalized,
      meta,
    });
  }

  trackEvent("runtime_error", {
    scope,
    message: normalized.message,
    ...(typeof meta === "object" && meta ? Object.fromEntries(
      Object.entries(meta).map(([key, value]) => [key, value == null ? null : String(value)]),
    ) : {}),
  });

  return normalized;
}
