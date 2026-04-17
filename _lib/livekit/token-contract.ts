import { getRuntimeLiveKitConfig, isLiveKitRuntimeConfigured } from "../runtimeConfig";
import { supabase } from "../supabase";

export type LiveKitJoinSurface = "live-stage" | "watch-party-live" | "chat-call";
export type LiveKitParticipantRole = "host" | "speaker" | "viewer";

export type LiveKitRequestedGrants = {
  roomJoin: boolean;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
};

export type LiveKitTokenRequest = {
  surface: LiveKitJoinSurface;
  roomName: string;
  participantIdentity: string;
  participantName?: string;
  participantRole: LiveKitParticipantRole;
  metadata?: Record<string, boolean | number | string | null | undefined>;
};

export type LiveKitTokenReady = {
  status: "ready";
  provider: "livekit";
  roomName: string;
  serverUrl: string;
  participantToken: string;
  participantRole: LiveKitParticipantRole;
  requestedGrants: LiveKitRequestedGrants;
  endpoint: string;
};

export type LiveKitTokenUnavailableReason =
  | "not_configured"
  | "unauthenticated"
  | "request_failed"
  | "invalid_response";

export type LiveKitTokenUnavailable = {
  status: "unavailable";
  provider: "livekit";
  roomName: string;
  participantRole: LiveKitParticipantRole;
  requestedGrants: LiveKitRequestedGrants;
  reason: LiveKitTokenUnavailableReason;
  message: string;
  endpoint?: string;
  serverUrl?: string;
};

export type LiveKitTokenContractResult = LiveKitTokenReady | LiveKitTokenUnavailable;

const sanitizeMetadata = (value: LiveKitTokenRequest["metadata"]) => {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => (
      typeof entry === "string"
      || typeof entry === "number"
      || typeof entry === "boolean"
      || entry === null
    )),
  );
};

export const getRequestedLiveKitGrants = (
  participantRole: LiveKitParticipantRole,
): LiveKitRequestedGrants => {
  if (participantRole === "host" || participantRole === "speaker") {
    return {
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    };
  }

  return {
    roomJoin: true,
    canPublish: false,
    canSubscribe: true,
    canPublishData: true,
  };
};

// The mobile app never mints LiveKit credentials. It only requests them from a backend endpoint.
export async function requestLiveKitParticipantToken(
  request: LiveKitTokenRequest,
): Promise<LiveKitTokenContractResult> {
  const config = getRuntimeLiveKitConfig();
  const roomName = String(request.roomName ?? "").trim();
  const participantIdentity = String(request.participantIdentity ?? "").trim();
  const participantRole = request.participantRole;
  const requestedGrants = getRequestedLiveKitGrants(participantRole);

  if (!roomName || !participantIdentity || !isLiveKitRuntimeConfigured()) {
    return {
      status: "unavailable",
      provider: "livekit",
      roomName,
      participantRole,
      requestedGrants,
      reason: "not_configured",
      message:
        "LiveKit runtime config is not set yet. Keep using the current realtime path until the backend token endpoint and server URL are configured.",
      endpoint: config.tokenEndpoint || undefined,
      serverUrl: config.serverUrl || undefined,
    };
  }

  const authSession = await supabase.auth.getSession().catch(() => null);
  const accessToken = String(authSession?.data.session?.access_token ?? "").trim();

  if (!accessToken) {
    return {
      status: "unavailable",
      provider: "livekit",
      roomName,
      participantRole,
      requestedGrants,
      reason: "unauthenticated",
      message:
        "LiveKit token requests require an authenticated Chi'llywood session. Sign in first or keep using the current fallback path.",
      endpoint: config.tokenEndpoint,
      serverUrl: config.serverUrl,
    };
  }

  let response: Response;
  try {
    response = await fetch(config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        surface: request.surface,
        roomName,
        participantIdentity,
        participantName: String(request.participantName ?? "").trim() || undefined,
        participantRole,
        requestedGrants,
        metadata: sanitizeMetadata(request.metadata),
      }),
    });
  } catch {
    return {
      status: "unavailable",
      provider: "livekit",
      roomName,
      participantRole,
      requestedGrants,
      reason: "request_failed",
      message:
        "Chi'llywood could not reach the LiveKit token endpoint. The app foundation is in place, but backend token issuance still needs to come online.",
      endpoint: config.tokenEndpoint,
      serverUrl: config.serverUrl,
    };
  }

  if (!response.ok) {
    return {
      status: "unavailable",
      provider: "livekit",
      roomName,
      participantRole,
      requestedGrants,
      reason: "request_failed",
      message: `LiveKit token issuance failed with status ${response.status}. The backend token endpoint still needs to return a valid participant token.`,
      endpoint: config.tokenEndpoint,
      serverUrl: config.serverUrl,
    };
  }

  const payload = await response.json().catch(() => null) as {
    participantToken?: unknown;
    serverUrl?: unknown;
  } | null;
  const participantToken = String(payload?.participantToken ?? "").trim();
  const serverUrl = String(payload?.serverUrl ?? config.serverUrl).trim();

  if (!participantToken || !serverUrl) {
    return {
      status: "unavailable",
      provider: "livekit",
      roomName,
      participantRole,
      requestedGrants,
      reason: "invalid_response",
      message:
        "LiveKit token issuance returned an incomplete response. The backend contract must return both serverUrl and participantToken.",
      endpoint: config.tokenEndpoint,
      serverUrl: config.serverUrl,
    };
  }

  return {
    status: "ready",
    provider: "livekit",
    roomName,
    serverUrl,
    participantToken,
    participantRole,
    requestedGrants,
    endpoint: config.tokenEndpoint,
  };
}
