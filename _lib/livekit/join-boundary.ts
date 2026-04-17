import { getRuntimeConfig } from "../runtimeConfig";
import { supabase } from "../supabase";

export type LiveKitJoinSurface = "watch-party-live" | "live-stage" | "chat-call";
export type LiveKitParticipantRole = "host" | "speaker" | "viewer";

export type LiveKitRequestedGrants = {
  roomJoin: boolean;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
};

export type LiveKitJoinBoundaryRequest = {
  surface: LiveKitJoinSurface;
  roomId: string;
  participantRole: LiveKitParticipantRole;
  metadata?: Record<string, boolean | number | string | null | undefined>;
};

export type LiveKitJoinBoundaryReady = {
  status: "ready";
  provider: "livekit";
  roomId: string;
  roomName: string;
  serverUrl: string;
  tokenEndpoint: string;
  token: string;
  participantRole: LiveKitParticipantRole;
  requestedGrants: LiveKitRequestedGrants;
};

export type LiveKitJoinBoundaryUnavailableReason =
  | "not_configured"
  | "request_failed"
  | "invalid_response";

export type LiveKitJoinBoundaryUnavailable = {
  status: "unavailable";
  provider: "livekit";
  roomId: string;
  participantRole: LiveKitParticipantRole;
  requestedGrants: LiveKitRequestedGrants;
  reason: LiveKitJoinBoundaryUnavailableReason;
  message: string;
  serverUrl?: string;
  tokenEndpoint?: string;
};

export type LiveKitJoinBoundaryResult =
  | LiveKitJoinBoundaryReady
  | LiveKitJoinBoundaryUnavailable;

const sanitizeMetadata = (value: LiveKitJoinBoundaryRequest["metadata"]) => {
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

export async function prepareLiveKitJoinBoundary(
  request: LiveKitJoinBoundaryRequest,
): Promise<LiveKitJoinBoundaryResult> {
  const config = getRuntimeConfig();
  const roomId = String(request.roomId ?? "").trim();
  const participantRole = request.participantRole;
  const requestedGrants = getRequestedLiveKitGrants(participantRole);
  const serverUrl = String(config.livekit.serverUrl ?? "").trim();
  const tokenEndpoint = String(config.livekit.tokenEndpoint ?? "").trim();

  if (!roomId || !serverUrl || !tokenEndpoint) {
    return {
      status: "unavailable",
      provider: "livekit",
      roomId,
      participantRole,
      requestedGrants,
      reason: "not_configured",
      message:
        "LiveKit token issuance is not configured yet. Chi'llywood will keep using the current active room surface until the backend join endpoint is ready.",
      serverUrl: serverUrl || undefined,
      tokenEndpoint: tokenEndpoint || undefined,
    };
  }

  const authSession = await supabase.auth.getSession().catch(() => null);
  const accessToken = String(authSession?.data.session?.access_token ?? "").trim();

  let response: Response;
  try {
    response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        surface: request.surface,
        roomId,
        participantRole,
        requestedGrants,
        metadata: sanitizeMetadata(request.metadata),
      }),
    });
  } catch {
    return {
      status: "unavailable",
      provider: "livekit",
      roomId,
      participantRole,
      requestedGrants,
      reason: "request_failed",
      message:
        "Chi'llywood could not reach the LiveKit token endpoint. The backend join seam still needs to come online for active media entry.",
      serverUrl,
      tokenEndpoint,
    };
  }

  if (!response.ok) {
    return {
      status: "unavailable",
      provider: "livekit",
      roomId,
      participantRole,
      requestedGrants,
      reason: "request_failed",
      message: `LiveKit token issuance failed with status ${response.status}. The backend join endpoint still needs to be completed for active media entry.`,
      serverUrl,
      tokenEndpoint,
    };
  }

  const payload = await response.json().catch(() => null) as {
    token?: unknown;
    roomName?: unknown;
    serverUrl?: unknown;
  } | null;
  const token = String(payload?.token ?? "").trim();
  const roomName = String(payload?.roomName ?? roomId).trim();
  const resolvedServerUrl = String(payload?.serverUrl ?? serverUrl).trim();

  if (!token || !roomName || !resolvedServerUrl) {
    return {
      status: "unavailable",
      provider: "livekit",
      roomId,
      participantRole,
      requestedGrants,
      reason: "invalid_response",
      message:
        "LiveKit token issuance returned an incomplete response. The backend join endpoint still needs to return a token, room name, and server URL.",
      serverUrl,
      tokenEndpoint,
    };
  }

  return {
    status: "ready",
    provider: "livekit",
    roomId,
    roomName,
    serverUrl: resolvedServerUrl,
    tokenEndpoint,
    token,
    participantRole,
    requestedGrants,
  };
}
