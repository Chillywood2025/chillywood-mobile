import { isDevDebugEnabled } from "./devDebug";

export type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

export type AnalyticsEventName =
  | "auth_sign_in_success"
  | "auth_sign_in_failure"
  | "auth_sign_up_success"
  | "auth_sign_up_failure"
  | "beta_access_granted"
  | "beta_access_blocked"
  | "beta_welcome_seen"
  | "beta_feedback_submitted"
  | "room_create_success"
  | "room_create_failure"
  | "room_join_success"
  | "room_join_failure"
  | "communication_connect"
  | "communication_disconnect"
  | "communication_reconnect"
  | "playback_start"
  | "playback_failure"
  | "monetization_gate_shown"
  | "monetization_unlock_success"
  | "monetization_unlock_failure"
  | "moderation_action_used"
  | "fatal_boundary_hit"
  | "runtime_error";

export type AnalyticsSink = {
  identifyUser?: (identity: { id: string; email?: string | null }) => void;
  clearUser?: () => void;
  trackScreen?: (screenName: string, payload?: AnalyticsPayload) => void;
  trackEvent?: (eventName: AnalyticsEventName | string, payload?: AnalyticsPayload) => void;
};

const noOpSink: AnalyticsSink = {};

let sink: AnalyticsSink = noOpSink;

const maybeDevMirror = (label: string, payload?: AnalyticsPayload) => {
  if (!__DEV__ && !isDevDebugEnabled()) return;
  console.log(`[analytics] ${label}`, payload ?? {});
};

export function setAnalyticsSink(nextSink?: AnalyticsSink | null) {
  sink = nextSink ?? noOpSink;
}

export function identifyUser(identity: { id: string; email?: string | null }) {
  sink.identifyUser?.(identity);
  maybeDevMirror("identify_user", {
    id: identity.id,
    email: identity.email ?? null,
  });
}

export function clearUser() {
  sink.clearUser?.();
  maybeDevMirror("clear_user");
}

export function trackScreen(screenName: string, payload?: AnalyticsPayload) {
  sink.trackScreen?.(screenName, payload);
  maybeDevMirror(`screen:${screenName}`, payload);
}

export function trackEvent(eventName: AnalyticsEventName | string, payload?: AnalyticsPayload) {
  sink.trackEvent?.(eventName, payload);
  maybeDevMirror(`event:${eventName}`, payload);
}
