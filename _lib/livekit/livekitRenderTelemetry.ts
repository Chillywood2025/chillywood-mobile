import type { LiveKitOperatorSurface } from "../livekitAutonomousOperator";
import { readReleaseDiagnostics } from "../releaseDiagnostics";
import { supabase } from "../supabase";

export type ChatCallLiveKitTelemetryStage =
  | "token_requested"
  | "token_returned"
  | "token_claims_validated"
  | "websocket_connected"
  | "ice_state"
  | "room_connected"
  | "local_audio_published"
  | "local_video_published"
  | "remote_participant_joined"
  | "remote_audio_subscribed"
  | "remote_video_subscribed"
  | "first_audio"
  | "first_video"
  | "installed_ui_connected"
  | "backgrounded"
  | "foregrounded"
  | "reconnecting"
  | "recovered"
  | "disconnected"
  | "cleanup_complete";

export type LiveKitRenderTelemetryEventName =
  | "livekit_bubble_grid_rendered"
  | "livekit_camera_preparing"
  | "livekit_camera_preparing_state"
  | "livekit_camera_track_present"
  | "livekit_connection_state_changed"
  | "livekit_fallback_roster_shown"
  | "livekit_fallback_roster_suppressed"
  | "livekit_identity_alias_mismatch"
  | "livekit_identity_mismatch_guarded"
  | "livekit_render_contract_missing"
  | "livekit_renderable_contract_cleared"
  | "livekit_renderable_contract_preserved"
  | "livekit_renderable_contract_set"
  | "livekit_surface_feed_rendered"
  | "livekit_surface_mount_attempt"
  | "livekit_surface_mounted"
  | "livekit_surface_placeholder_shown"
  | "livekit_surface_recovered"
  | "livekit_token_contract_present"
  | "livekit_token_expired_rejected"
  | "livekit_token_nbf_future_grace_used"
  | "livekit_token_nbf_rejected"
  | "livekit_token_received"
  | "livekit_chat_call_stage";

export type LiveKitRenderTelemetryInput = {
  activeContractPresent?: boolean | null;
  bubbleGridItemCount?: number | null;
  bubbleGridTrackCount?: number | null;
  canPublish?: boolean | null;
  connectionState?: string | null;
  callInviteId?: string | null;
  communicationRoomId?: string | null;
  durationMs?: number | null;
  fallbackReason?: string | null;
  hasRenderableContract?: boolean | null;
  nbfGraceUsed?: boolean | null;
  liveKitSdkEvent?: boolean | null;
  mediaProvider?: "legacy_webrtc" | "livekit" | null;
  participantRole?: "host" | "speaker" | "viewer" | null;
  renderableContractPresent?: boolean | null;
  route?: string | null;
  roomType?: "chat_call" | "live" | "watch_party" | null;
  shouldRenderSurface?: boolean | null;
  stage?: ChatCallLiveKitTelemetryStage | null;
  surface: LiveKitOperatorSurface;
  threadId?: string | null;
  tokenExpDeltaSeconds?: number | null;
  tokenNbfDeltaSeconds?: number | null;
};

const TELEMETRY_THROTTLE_MILLIS = 1_500;
const MAX_NUMERIC_BUCKET = 86_400;
const emitCache = new Map<string, number>();

const safeText = (value: unknown) => String(value ?? "")
  .replace(/[A-Za-z0-9._~+/=-]{32,}/g, "[redacted]")
  .slice(0, 160);

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const bucketSeconds = (value: unknown) => {
  const parsed = safeNumber(value);
  if (parsed === null) return null;
  const bounded = Math.max(-MAX_NUMERIC_BUCKET, Math.min(MAX_NUMERIC_BUCKET, parsed));
  if (Math.abs(bounded) < 10) return Math.round(bounded * 10) / 10;
  if (Math.abs(bounded) < 120) return Math.round(bounded);
  return Math.round(bounded / 60) * 60;
};

export const buildLiveKitRenderTelemetryEvent = (
  eventName: LiveKitRenderTelemetryEventName,
  input: LiveKitRenderTelemetryInput,
) => ({
  activeContractPresent: input.activeContractPresent === true,
  callInviteId: safeText(input.callInviteId),
  bubbleGridItemCount: safeNumber(input.bubbleGridItemCount),
  bubbleGridTrackCount: safeNumber(input.bubbleGridTrackCount),
  canPublish: input.canPublish === true,
  connectionState: safeText(input.connectionState),
  communicationRoomId: safeText(input.communicationRoomId),
  durationMs: safeNumber(input.durationMs),
  eventName,
  fallbackReason: safeText(input.fallbackReason),
  hasRenderableContract: input.hasRenderableContract === true || input.renderableContractPresent === true,
  liveKitSdkEvent: input.liveKitSdkEvent === true,
  mediaProvider: input.mediaProvider ?? null,
  nbfGraceUsed: input.nbfGraceUsed === true,
  participantRole: input.participantRole ?? null,
  renderableContractPresent: input.renderableContractPresent === true || input.hasRenderableContract === true,
  route: safeText(input.route),
  roomType: input.roomType ?? null,
  shouldRenderSurface: input.shouldRenderSurface === true,
  stage: input.stage ?? null,
  surface: input.surface,
  threadId: safeText(input.threadId),
  expDeltaSecondsBucket: bucketSeconds(input.tokenExpDeltaSeconds),
  nbfDeltaSecondsBucket: bucketSeconds(input.tokenNbfDeltaSeconds),
  tokenExpDeltaSecondsBucket: bucketSeconds(input.tokenExpDeltaSeconds),
  tokenNbfDeltaSecondsBucket: bucketSeconds(input.tokenNbfDeltaSeconds),
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

export const emitLiveKitRenderTelemetryEvent = (
  eventName: LiveKitRenderTelemetryEventName,
  input: LiveKitRenderTelemetryInput,
) => {
  const diagnostics = readReleaseDiagnostics();
  const event = {
    ...buildLiveKitRenderTelemetryEvent(eventName, input),
    appVersion: diagnostics.appVersion,
    bundleIdentifier: diagnostics.applicationId,
    channel: diagnostics.channel,
    distributionSource: diagnostics.isEmbeddedLaunch === true
      ? "embedded"
      : diagnostics.updateId
        ? "ota"
        : "unknown",
    nativeBuild: diagnostics.nativeBuildVersion,
    platform: diagnostics.platform,
    runtimeVersion: diagnostics.runtimeVersion,
    updateId: diagnostics.updateId,
  };
  const throttleKey = [
    event.eventName,
    event.surface,
    event.participantRole ?? "none",
    event.connectionState ?? "none",
    event.fallbackReason ?? "none",
    event.shouldRenderSurface ? "render" : "no-render",
    event.stage ?? "no-stage",
    event.bubbleGridItemCount ?? "no-items",
    event.bubbleGridTrackCount ?? "no-tracks",
  ].join("|");
  const now = Date.now();
  const last = emitCache.get(throttleKey) ?? 0;
  if (now - last < TELEMETRY_THROTTLE_MILLIS) return event;
  emitCache.set(throttleKey, now);

  void supabase.functions.invoke("livekit-operator", {
    body: {
      action: "render_event_ingest",
      render_event: sanitizeLiveKitRenderTelemetryPayload(event),
    },
  }).catch(() => {});

  return event;
};
