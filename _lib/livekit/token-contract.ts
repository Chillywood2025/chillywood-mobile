import { decodeTokenPayload } from "livekit-client";

import {
  emitLiveKitRenderTelemetryEvent,
  type LiveKitRenderTelemetryInput,
} from "./livekitRenderTelemetry";
import { getRuntimeLiveKitConfig, isLiveKitRuntimeConfigured } from "../runtimeConfig";
import { supabase } from "../supabase";
import { readCurrentAccountSessionAuthority, sameAccountSessionAuthority, type AccountSessionAuthorityBinding } from "../accountSessionAuthority";

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
  callInviteId?: string;
  callType?: "voice" | "video";
  mediaProvider?: "legacy_webrtc" | "livekit";
  threadId?: string;
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
  sub?: unknown;
  video?: {
    room?: unknown;
    roomJoin?: unknown;
    canPublish?: unknown;
    canSubscribe?: unknown;
    canPublishData?: unknown;
  };
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

export const validateChatCallLiveKitTokenClaims = (input: {
  participantIdentity: string;
  participantToken: string;
  roomName: string;
}) => {
  const participantIdentity = String(input.participantIdentity ?? "").trim();
  const roomName = String(input.roomName ?? "").trim().toUpperCase();
  if (!participantIdentity || !roomName) return false;
  try {
    const { payload } = decodeLiveKitParticipantTokenPayload(input.participantToken);
    const video = payload.video;
    return String(payload.sub ?? "").trim() === participantIdentity
      && String(video?.room ?? "").trim().toUpperCase() === roomName
      && video?.roomJoin === true
      && video?.canPublish === true
      && video?.canSubscribe === true
      && video?.canPublishData === true
      && !getLiveKitParticipantTokenExpiryState(input.participantToken).isExpired;
  } catch {
    return false;
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

const getLiveKitTelemetrySurface = (surface: LiveKitJoinSurface): LiveKitRenderTelemetryInput["surface"] => {
  if (surface === "live-stage") return "live_stage";
  if (surface === "chat-call") return "chat_call";
  return "watch_party_live";
};

const getLiveKitTelemetryRoomType = (surface: LiveKitJoinSurface): LiveKitRenderTelemetryInput["roomType"] => {
  if (surface === "live-stage") return "live";
  if (surface === "chat-call") return "chat_call";
  return "watch_party";
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

export const LIVEKIT_TOKEN_REQUEST_TIMEOUT_MILLIS = 15_000;

const requestLiveKitTokenResponse = async (
  endpoint: string,
  init: RequestInit,
): Promise<Response> => {
  if (typeof AbortController === "undefined") {
    return fetch(endpoint, init);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVEKIT_TOKEN_REQUEST_TIMEOUT_MILLIS);
  try {
    return await fetch(endpoint, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

export type LiveDiscoveryPublicationResult =
  | { status: "published" }
  | { status: "cancelled" }
  | { status: "failed"; reason: "not_configured" | "session_changed" | "not_eligible" | "request_failed" | "invalid_response"; retryable: boolean };

export const LIVE_DISCOVERY_PUBLICATION_ATTEMPT_TIMEOUT_MILLIS = 5_000;

// Auth SDK reads cannot be interrupted themselves. Retire their result at the
// same deadline as the abortable HTTP request; a late read cannot start a send.
const awaitDiscoveryOperation = <T>(operation: () => PromiseLike<T>, signal: AbortSignal): Promise<T> => new Promise((resolve, reject) => {
  const aborted = () => { signal.removeEventListener("abort", aborted); reject(new Error("publication_aborted")); };
  if (signal.aborted) { aborted(); return; }
  signal.addEventListener("abort", aborted, { once: true });
  Promise.resolve().then(() => {
    if (signal.aborted) throw new Error("publication_aborted");
    return operation();
  }).then(value => {
    signal.removeEventListener("abort", aborted);
    if (signal.aborted) reject(new Error("publication_aborted")); else resolve(value);
  }, error => { signal.removeEventListener("abort", aborted); reject(error); });
});

const waitForDiscoveryRetry = (delay: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const aborted = () => { clearTimeout(timer); signal.removeEventListener("abort", aborted); reject(new Error("publication_aborted")); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", aborted); resolve(); }, delay);
  if (signal.aborted) { aborted(); return; }
  signal.addEventListener("abort", aborted, { once: true });
});

export async function markLiveStageRoomConnectedForDiscovery(
  roomNameValue: string,
  options: { authority: AccountSessionAuthorityBinding; signal: AbortSignal },
): Promise<LiveDiscoveryPublicationResult> {
  const config = getRuntimeLiveKitConfig();
  const roomName = String(roomNameValue ?? "").trim().toUpperCase();
  if (!roomName || !isLiveKitRuntimeConfigured()) return { status: "failed", reason: "not_configured", retryable: false };
  const expected = options.authority;
  if (!expected || expected.restoreOnly) return { status: "failed", reason: "session_changed", retryable: false };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (options.signal.aborted) return { status: "cancelled" };
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, LIVE_DISCOVERY_PUBLICATION_ATTEMPT_TIMEOUT_MILLIS);
    try {
      const current = () => awaitDiscoveryOperation(readCurrentAccountSessionAuthority, controller.signal);
      if (!sameAccountSessionAuthority(expected, await current())) return { status: "failed", reason: "session_changed", retryable: false };
      const authSession = await awaitDiscoveryOperation(() => supabase.auth.getSession(), controller.signal);
      const session = authSession?.data.session;
      const accessToken = String(session?.access_token ?? "").trim();
      if (authSession.error || !accessToken || session?.user.id !== expected.userId
        || (session.expires_at != null && session.expires_at * 1000 <= Date.now())
        || !sameAccountSessionAuthority(expected, await current())) {
        return { status: "failed", reason: "session_changed", retryable: false };
      }
      const response = await awaitDiscoveryOperation(() => fetch(config.tokenEndpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "mark-room-live",
          surface: "live-stage",
          roomName,
        }),
      }), controller.signal);
      const payload = await awaitDiscoveryOperation(() => response.json(), controller.signal).catch(error => {
        if (controller.signal.aborted) throw error;
        return null;
      }) as { published?: unknown; roomName?: unknown; error?: unknown } | null;
      if (!sameAccountSessionAuthority(expected, await current())) return { status: "failed", reason: "session_changed", retryable: false };
      if (response.ok) {
        return payload?.published === true && payload.roomName === roomName
          ? { status: "published" }
          : { status: "failed", reason: "invalid_response", retryable: true };
      }
      if (response.status === 401) return { status: "failed", reason: "session_changed", retryable: false };
      const providerNotReady = response.status === 409 && [
        "live_discovery_provider_room_unconfirmed", "live_discovery_provider_host_unconfirmed",
      ].includes(String(payload?.error ?? ""));
      if (!providerNotReady && ![502, 503, 504].includes(response.status)) {
        return { status: "failed", reason: "not_eligible", retryable: false };
      }
    } catch {
      if (options.signal.aborted) return { status: "cancelled" };
    } finally {
      clearTimeout(timeout);
      options.signal.removeEventListener("abort", abort);
      controller.abort();
    }
    if (attempt < 2) {
      try { await waitForDiscoveryRetry(750 * (attempt + 1), options.signal); }
      catch { return { status: "cancelled" }; }
    }
  }
  return { status: "failed", reason: "request_failed", retryable: true };
}

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
    response = await requestLiveKitTokenResponse(config.tokenEndpoint, {
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
        callInviteId: String(request.callInviteId ?? "").trim() || undefined,
        callType: request.callType,
        mediaProvider: request.mediaProvider,
        requestedGrants,
        threadId: String(request.threadId ?? "").trim() || undefined,
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

  const expiryState = getLiveKitParticipantTokenExpiryState(participantToken);
  const telemetryBase = {
    activeContractPresent: true,
    canPublish: effectiveRequestedGrants.canPublish,
    participantRole: effectiveParticipantRole,
    roomType: getLiveKitTelemetryRoomType(request.surface),
    route: request.surface,
    shouldRenderSurface: true,
    surface: getLiveKitTelemetrySurface(request.surface),
    tokenExpDeltaSeconds: typeof expiryState.expiresInMillis === "number" ? expiryState.expiresInMillis / 1000 : null,
    tokenNbfDeltaSeconds: typeof expiryState.notBeforeInMillis === "number" ? expiryState.notBeforeInMillis / 1000 : null,
  } satisfies LiveKitRenderTelemetryInput;
  emitLiveKitRenderTelemetryEvent("livekit_token_received", telemetryBase);
  if (
    expiryState.reason === "valid"
    && typeof expiryState.notBeforeInMillis === "number"
    && expiryState.notBeforeInMillis > 0
  ) {
    emitLiveKitRenderTelemetryEvent("livekit_token_nbf_future_grace_used", {
      ...telemetryBase,
      nbfGraceUsed: true,
    });
  } else if (expiryState.reason === "not_yet_valid") {
    emitLiveKitRenderTelemetryEvent("livekit_token_nbf_rejected", telemetryBase);
  } else if (expiryState.reason === "expired") {
    emitLiveKitRenderTelemetryEvent("livekit_token_expired_rejected", telemetryBase);
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
