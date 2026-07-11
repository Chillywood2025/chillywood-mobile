import type { LiveKitOperatorSurface } from "./livekitAutonomousOperator";

export type LiveKitRenderTelemetryEventName =
  | "livekit_camera_preparing_state"
  | "livekit_camera_track_present"
  | "livekit_fallback_roster_shown"
  | "livekit_identity_mismatch_guarded"
  | "livekit_render_contract_missing"
  | "livekit_surface_feed_rendered"
  | "livekit_surface_mounted"
  | "livekit_surface_placeholder_shown"
  | "livekit_surface_recovered"
  | "livekit_token_contract_present";

export type LiveKitRenderTelemetryInput = {
  bubbleGridItemCount?: number | null;
  bubbleGridTrackCount?: number | null;
  canPublish?: boolean | null;
  connectionState?: string | null;
  durationMs?: number | null;
  fallbackReason?: string | null;
  hasRenderableContract?: boolean | null;
  participantRole?: "host" | "speaker" | "viewer" | null;
  route?: string | null;
  roomType?: "chat_call" | "live" | "watch_party" | null;
  shouldRenderSurface?: boolean | null;
  surface: LiveKitOperatorSurface;
};

const safeText = (value: unknown) => String(value ?? "")
  .replace(/[A-Za-z0-9._~+/=-]{32,}/g, "[redacted]")
  .slice(0, 160);

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const buildLiveKitRenderTelemetryEvent = (
  eventName: LiveKitRenderTelemetryEventName,
  input: LiveKitRenderTelemetryInput,
) => ({
  bubbleGridItemCount: safeNumber(input.bubbleGridItemCount),
  bubbleGridTrackCount: safeNumber(input.bubbleGridTrackCount),
  canPublish: input.canPublish === true,
  connectionState: safeText(input.connectionState),
  durationMs: safeNumber(input.durationMs),
  eventName,
  fallbackReason: safeText(input.fallbackReason),
  hasRenderableContract: input.hasRenderableContract === true,
  participantRole: input.participantRole ?? null,
  route: safeText(input.route),
  roomType: input.roomType ?? null,
  shouldRenderSurface: input.shouldRenderSurface === true,
  surface: input.surface,
});

export const sanitizeLiveKitRenderTelemetryPayload = (
  payload: Record<string, unknown>,
) => Object.fromEntries(
  Object.entries(payload)
    .filter(([key]) => {
      const normalized = key.toLowerCase();
      return !normalized.includes("token")
        && !normalized.includes("secret")
        && !normalized.includes("password")
        && !normalized.includes("authorization")
        && !normalized.includes("key");
    })
    .map(([key, value]) => [key, typeof value === "string" ? safeText(value) : value]),
);
