import { Platform } from "react-native";

import type { AnalyticsPayload } from "./analytics";
import { ensureFirebaseDefaultApp } from "./firebaseApp";

const sanitizeAnalyticsEventName = (value: string) => {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const withLeadingLetter = /^[A-Za-z]/.test(normalized) ? normalized : `event_${normalized || "unknown"}`;
  return withLeadingLetter.slice(0, 40);
};

const sanitizeAnalyticsPayload = (payload?: AnalyticsPayload) => {
  if (!payload) return undefined;

  const sanitized: Record<string, string | number | boolean | null> = {};

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined) return;
    sanitized[key] = value ?? null;
  });

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
};

const canUseFirebaseAnalytics = () => Platform.OS !== "web";

let cachedAnalyticsModule: typeof import("@react-native-firebase/analytics").default | null = null;

const maybeWarn = (scope: string, error: unknown) => {
  if (!__DEV__) return;
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  console.warn(`[firebase-analytics] ${scope}: ${message}`);
};

const getAnalyticsModule = () => {
  if (!canUseFirebaseAnalytics()) return null;
  if (!ensureFirebaseDefaultApp()) return null;

  cachedAnalyticsModule ??=
    require("@react-native-firebase/analytics").default as typeof import("@react-native-firebase/analytics").default;

  return cachedAnalyticsModule;
};

export async function bootstrapFirebaseAnalytics() {
  const analyticsModule = getAnalyticsModule();
  if (!analyticsModule) return;

  try {
    await analyticsModule().setAnalyticsCollectionEnabled(true);
  } catch (error) {
    maybeWarn("bootstrap", error);
  }
}

export async function identifyFirebaseAnalyticsUser(identity: { id: string; email?: string | null }) {
  const analyticsModule = getAnalyticsModule();
  if (!analyticsModule) return;

  try {
    await analyticsModule().setUserId(identity.id);
    await analyticsModule().setUserProperties({
      email: identity.email ?? null,
    });
  } catch (error) {
    maybeWarn("identify-user", error);
  }
}

export async function clearFirebaseAnalyticsUser() {
  const analyticsModule = getAnalyticsModule();
  if (!analyticsModule) return;

  try {
    await analyticsModule().setUserId(null);
    await analyticsModule().setUserProperties({
      email: null,
    });
    await analyticsModule().resetAnalyticsData();
  } catch (error) {
    maybeWarn("clear-user", error);
  }
}

export async function trackFirebaseAnalyticsScreen(screenName: string) {
  const analyticsModule = getAnalyticsModule();
  if (!analyticsModule) return;

  try {
    await analyticsModule().logScreenView({
      screen_name: screenName,
      screen_class: "ExpoRouterScreen",
    });
  } catch (error) {
    maybeWarn("track-screen", error);
  }
}

export async function trackFirebaseAnalyticsEvent(eventName: string, payload?: AnalyticsPayload) {
  const analyticsModule = getAnalyticsModule();
  if (!analyticsModule) return;

  try {
    await analyticsModule().logEvent(
      sanitizeAnalyticsEventName(eventName),
      sanitizeAnalyticsPayload(payload),
    );
  } catch (error) {
    maybeWarn("track-event", error);
  }
}
