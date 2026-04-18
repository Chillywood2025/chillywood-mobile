import analytics from "@react-native-firebase/analytics";
import { Platform } from "react-native";

import type { AnalyticsPayload } from "./analytics";

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

const maybeWarn = (scope: string, error: unknown) => {
  if (!__DEV__) return;
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  console.warn(`[firebase-analytics] ${scope}: ${message}`);
};

export async function bootstrapFirebaseAnalytics() {
  if (!canUseFirebaseAnalytics()) return;

  try {
    await analytics().setAnalyticsCollectionEnabled(true);
  } catch (error) {
    maybeWarn("bootstrap", error);
  }
}

export async function identifyFirebaseAnalyticsUser(identity: { id: string; email?: string | null }) {
  if (!canUseFirebaseAnalytics()) return;

  try {
    await analytics().setUserId(identity.id);
    await analytics().setUserProperties({
      email: identity.email ?? null,
    });
  } catch (error) {
    maybeWarn("identify-user", error);
  }
}

export async function clearFirebaseAnalyticsUser() {
  if (!canUseFirebaseAnalytics()) return;

  try {
    await analytics().setUserId(null);
    await analytics().setUserProperties({
      email: null,
    });
    await analytics().resetAnalyticsData();
  } catch (error) {
    maybeWarn("clear-user", error);
  }
}

export async function trackFirebaseAnalyticsScreen(screenName: string) {
  if (!canUseFirebaseAnalytics()) return;

  try {
    await analytics().logScreenView({
      screen_name: screenName,
      screen_class: "ExpoRouterScreen",
    });
  } catch (error) {
    maybeWarn("track-screen", error);
  }
}

export async function trackFirebaseAnalyticsEvent(eventName: string, payload?: AnalyticsPayload) {
  if (!canUseFirebaseAnalytics()) return;

  try {
    await analytics().logEvent(
      sanitizeAnalyticsEventName(eventName),
      sanitizeAnalyticsPayload(payload),
    );
  } catch (error) {
    maybeWarn("track-event", error);
  }
}
