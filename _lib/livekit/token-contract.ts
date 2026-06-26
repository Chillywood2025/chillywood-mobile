import { decodeTokenPayload } from "livekit-client";

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
  responseStatus?: number;
  responseError?: string;
};

export type LiveKitTokenContractResult = LiveKitTokenReady | LiveKitTokenUnavailable;

const LIVEKIT_TOKEN_REFRESH_SKEW_MILLIS = 60_000;

export const isLiveKitParticipantTokenExpired = (
  participantToken: string,
  nowMillis = Date.now(),
) => {
  const token = String(participantToken ?? "").trim();
  if (!token) return true;

  try {
    const payload = decodeTokenPayload(token) as { exp?: unknown; nbf?: unknown };
    const expiresAtSeconds = Number(payload.exp);
    const notBeforeSeconds = Number(payload.nbf);

    if (!Number.isFinite(expiresAtSeconds)) return true;
    if (Number.isFinite(notBeforeSeconds) && notBeforeSeconds * 1000 > nowMillis) return true;

    return expiresAtSeconds * 1000 - LIVEKIT_TOKEN_REFRESH_SKEW_MILLIS <= nowMillis;
  } catch {
    return true;
  }
};

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

const normalizeLiveKitParticipantRole = (
  value: unknown,
  fallback: LiveKitParticipantRole,
): LiveKitParticipantRole => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "host" || normalized === "speaker" || normalized === "viewer") return normalized;
  return fallback;
};

const normalizeLiveKitRequestedGrants = (
  value: unknown,
  fallback: LiveKitRequestedGrants,
): LiveKitRequestedGrants => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const grants = value as Partial<Record<keyof LiveKitRequestedGrants, unknown>>;
  return {
    roomJoin: typeof grants.roomJoin === "boolean" ? grants.roomJoin : fallback.roomJoin,
    canPublish: typeof grants.canPublish === "boolean" ? grants.canPublish : fallback.canPublish,
    canSubscribe: typeof grants.canSubscribe === "boolean" ? grants.canSubscribe : fallback.canSubscribe,
    canPublishData: typeof grants.canPublishData === "boolean" ? grants.canPublishData : fallback.canPublishData,
  };
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
        "Live video status is active, but the configured LiveKit token path is not reachable. Try the current room experience for now.",
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
        "Sign in to join live video.",
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
        "Live video is temporarily unavailable. Try again in a moment.",
      endpoint: config.tokenEndpoint,
      serverUrl: config.serverUrl,
    };
  }

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null) as {
      error?: unknown;
      message?: unknown;
    } | null;
    const responseError = String(errorPayload?.error ?? "").trim();
    const message = response.status === 401 || response.status === 403
      ? "You don’t have access to join this live video."
      : "Live video is temporarily unavailable. Try again in a moment.";

    return {
      status: "unavailable",
      provider: "livekit",
      roomName,
      participantRole,
      requestedGrants,
      reason: "request_failed",
      message,
      endpoint: config.tokenEndpoint,
      serverUrl: config.serverUrl,
      responseStatus: response.status,
      responseError: responseError || undefined,
    };
  }

  const payload = await response.json().catch(() => null) as {
    participantToken?: unknown;
    participantRole?: unknown;
    requestedGrants?: unknown;
    serverUrl?: unknown;
  } | null;
  const participantToken = String(payload?.participantToken ?? "").trim();
  const serverUrl = String(payload?.serverUrl ?? config.serverUrl).trim();
  const effectiveParticipantRole = normalizeLiveKitParticipantRole(payload?.participantRole, participantRole);
  const effectiveRequestedGrants = normalizeLiveKitRequestedGrants(
    payload?.requestedGrants,
    getRequestedLiveKitGrants(effectiveParticipantRole),
  );

  if (!participantToken || !serverUrl) {
    return {
      status: "unavailable",
      provider: "livekit",
      roomName,
      participantRole,
      requestedGrants,
      reason: "invalid_response",
      message:
        "Live video is temporarily unavailable. Try again in a moment.",
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
    participantRole: effectiveParticipantRole,
    requestedGrants: effectiveRequestedGrants,
    endpoint: config.tokenEndpoint,
  };
}
