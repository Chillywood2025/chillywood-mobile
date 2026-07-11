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

const LIVEKIT_TOKEN_REFRESH_MAX_SKEW_MILLIS = 60_000;
const LIVEKIT_TOKEN_REFRESH_MIN_SKEW_MILLIS = 2_000;
const LIVEKIT_TOKEN_REFRESH_LIFETIME_RATIO = 0.1;
const LIVEKIT_TOKEN_NOT_BEFORE_GRACE_MILLIS = 5_000;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

type LiveKitDecodedTokenPayload = {
  exp?: unknown;
  iat?: unknown;
  nbf?: unknown;
};

export type LiveKitParticipantTokenExpiryState = {
  decodeSource: "fallback" | "livekit" | "unavailable";
  expiresInMillis: number | null;
  hasExpiresAt: boolean;
  hasIssuedAt: boolean;
  isExpired: boolean;
  notBeforeInMillis: number | null;
  reason: "expired" | "invalid_token" | "missing_exp" | "not_yet_valid" | "valid";
  skewMillis: number;
};

const decodeBase64UrlBytes = (value: string) => {
  const normalized = String(value ?? "")
    .trim()
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/=+$/g, "");
  if (!normalized) return null;

  let bits = 0;
  let bitLength = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const charValue = BASE64_ALPHABET.indexOf(char);
    if (charValue < 0) return null;

    bits = (bits << 6) | charValue;
    bitLength += 6;

    if (bitLength >= 8) {
      bitLength -= 8;
      bytes.push((bits >> bitLength) & 0xff);
    }
  }

  return bytes;
};

const decodeUtf8Bytes = (bytes: number[]) => {
  if (typeof TextDecoder !== "undefined") {
    try {
      return new TextDecoder().decode(new Uint8Array(bytes));
    } catch {
      // Fall through to the percent-decoding fallback.
    }
  }

  const percentEncoded = bytes.map((byte) => `%${byte.toString(16).padStart(2, "0")}`).join("");
  try {
    return decodeURIComponent(percentEncoded);
  } catch {
    return String.fromCharCode(...bytes);
  }
};

const decodeLiveKitParticipantTokenPayload = (
  token: string,
): { payload: LiveKitDecodedTokenPayload; source: "fallback" | "livekit" } => {
  try {
    return {
      payload: decodeTokenPayload(token) as LiveKitDecodedTokenPayload,
      source: "livekit",
    };
  } catch {
    // React Native release builds can fail the LiveKit/Jose helper path. The
    // local fallback reads only unsigned timing claims and never verifies or
    // trusts auth grants; the backend and LiveKit server still verify the token.
  }

  const payloadSegment = token.split(".")[1];
  const payloadBytes = decodeBase64UrlBytes(payloadSegment ?? "");
  if (!payloadBytes) throw new Error("invalid_livekit_token_payload");

  const decodedPayload = decodeUtf8Bytes(payloadBytes);
  const parsedPayload = JSON.parse(decodedPayload) as unknown;
  if (!parsedPayload || typeof parsedPayload !== "object" || Array.isArray(parsedPayload)) {
    throw new Error("invalid_livekit_token_payload");
  }

  return {
    payload: parsedPayload as LiveKitDecodedTokenPayload,
    source: "fallback",
  };
};

const getLiveKitTokenRefreshSkewMillis = (
  payload: { exp?: unknown; iat?: unknown },
  nowMillis: number,
) => {
  const expiresAtSeconds = Number(payload.exp);
  const issuedAtSeconds = Number(payload.iat);
  const tokenLifetimeMillis = Number.isFinite(expiresAtSeconds) && Number.isFinite(issuedAtSeconds)
    ? Math.max(0, (expiresAtSeconds - issuedAtSeconds) * 1000)
    : 0;

  if (tokenLifetimeMillis > 0) {
    return Math.min(
      LIVEKIT_TOKEN_REFRESH_MAX_SKEW_MILLIS,
      Math.max(
        LIVEKIT_TOKEN_REFRESH_MIN_SKEW_MILLIS,
        Math.floor(tokenLifetimeMillis * LIVEKIT_TOKEN_REFRESH_LIFETIME_RATIO),
      ),
    );
  }

  const remainingLifetimeMillis = Number.isFinite(expiresAtSeconds)
    ? Math.max(0, (expiresAtSeconds * 1000) - nowMillis)
    : 0;

  if (remainingLifetimeMillis > 0) {
    return Math.min(
      LIVEKIT_TOKEN_REFRESH_MAX_SKEW_MILLIS,
      Math.max(
        LIVEKIT_TOKEN_REFRESH_MIN_SKEW_MILLIS,
        Math.floor(remainingLifetimeMillis * LIVEKIT_TOKEN_REFRESH_LIFETIME_RATIO),
      ),
    );
  }

  return 0;
};

export const isLiveKitParticipantTokenExpired = (
  participantToken: string,
  nowMillis = Date.now(),
) => {
  return getLiveKitParticipantTokenExpiryState(participantToken, nowMillis).isExpired;
};

export const getLiveKitParticipantTokenExpiryState = (
  participantToken: string,
  nowMillis = Date.now(),
): LiveKitParticipantTokenExpiryState => {
  const token = String(participantToken ?? "").trim();
  if (!token) {
    return {
      decodeSource: "unavailable",
      expiresInMillis: null,
      hasExpiresAt: false,
      hasIssuedAt: false,
      isExpired: true,
      notBeforeInMillis: null,
      reason: "invalid_token",
      skewMillis: 0,
    };
  }

  try {
    const { payload, source } = decodeLiveKitParticipantTokenPayload(token);
    const expiresAtSeconds = Number(payload.exp);
    const issuedAtSeconds = Number(payload.iat);
    const notBeforeSeconds = Number(payload.nbf);

    if (!Number.isFinite(expiresAtSeconds)) {
      return {
        decodeSource: source,
        expiresInMillis: null,
        hasExpiresAt: false,
        hasIssuedAt: Number.isFinite(issuedAtSeconds),
        isExpired: true,
        notBeforeInMillis: Number.isFinite(notBeforeSeconds) ? (notBeforeSeconds * 1000) - nowMillis : null,
        reason: "missing_exp",
        skewMillis: 0,
      };
    }

    const expiresInMillis = (expiresAtSeconds * 1000) - nowMillis;
    const notBeforeInMillis = Number.isFinite(notBeforeSeconds) ? (notBeforeSeconds * 1000) - nowMillis : null;
    const skewMillis = getLiveKitTokenRefreshSkewMillis(payload, nowMillis);

    if (
      typeof notBeforeInMillis === "number"
      && notBeforeInMillis > LIVEKIT_TOKEN_NOT_BEFORE_GRACE_MILLIS
    ) {
      return {
        decodeSource: source,
        expiresInMillis,
        hasExpiresAt: true,
        hasIssuedAt: Number.isFinite(issuedAtSeconds),
        isExpired: true,
        notBeforeInMillis,
        reason: "not_yet_valid",
        skewMillis,
      };
    }

    const isExpired = expiresAtSeconds * 1000 - skewMillis <= nowMillis;
    return {
      decodeSource: source,
      expiresInMillis,
      hasExpiresAt: true,
      hasIssuedAt: Number.isFinite(issuedAtSeconds),
      isExpired,
      notBeforeInMillis,
      reason: isExpired ? "expired" : "valid",
      skewMillis,
    };
  } catch {
    return {
      decodeSource: "unavailable",
      expiresInMillis: null,
      hasExpiresAt: false,
      hasIssuedAt: false,
      isExpired: true,
      notBeforeInMillis: null,
      reason: "invalid_token",
      skewMillis: 0,
    };
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
