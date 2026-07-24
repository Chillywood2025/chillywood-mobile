import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.110.6";
import {
  type CanonicalSecurityPolicy,
  classifyCanonicalSecurityPayload,
} from "../../../_lib/cognitivePolicyEngine.ts";
import securityPolicyJson from "../../../config/intelligence/cognitive-security-classification-policy.json" with {
  type: "json",
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };
type SupabaseClientLike = ReturnType<typeof createClient<any>>;

export type LiveKitMetricManifest = Readonly<{
  backgroundForegroundRecovery: boolean;
  backgrounded: boolean;
  buildRuntimeMatched: boolean;
  cleanupDisconnected: boolean;
  connectingResolved: boolean;
  firstAudioVideoObserved: boolean;
  firstRemoteMediaElapsedMs: number;
  foregrounded: boolean;
  headlessParticipantUsed: boolean;
  headlessObservationFinishedAt: string;
  headlessObservationStartedAt: string;
  headlessParticipantIdentityHash: string | null;
  iceCheckingObserved: boolean;
  iceGatheringObserved: boolean;
  iceState:
    | "new"
    | "checking"
    | "connected"
    | "completed"
    | "failed"
    | "disconnected"
    | "closed"
    | "unknown";
  installedUiEvidenceHash: string | null;
  installedUiObserved: boolean;
  installedObservationFinishedAt: string | null;
  installedObservationStartedAt: string | null;
  installedParticipantIdentityHash: string | null;
  installedRuntimeIdentityHash: string | null;
  installedRoomRunCorrelationHash: string | null;
  installedSourceBuildHash: string | null;
  localMediaSource: "test_tone" | "silent_audio" | "color_bars" | "none";
  localTrackPublished: boolean;
  networkState: "ready" | "interrupted" | "unknown";
  peerConnectionEstablished: boolean;
  participantIdentityDistinct: boolean;
  permissionState: "granted" | "denied" | "unknown" | "not_applicable";
  providerState: "healthy" | "degraded" | "blocked" | "unknown";
  remoteMediaKind: "audio" | "video" | "audio_video" | "none";
  remoteParticipantJoined: boolean;
  remoteTrackSubscribed: boolean;
  roomConnectElapsedMs: number;
  roomConnected: boolean;
  roomRunCorrelationHash: string;
  stageFailureCategory: LiveKitFailureCategory;
  tokenIssuedElapsedMs: number;
  tokenRequestStarted: boolean;
  tokenRequested: boolean;
  tokenResultStatus:
    | "success"
    | "denied"
    | "error"
    | "timeout"
    | "not_attempted";
  tokenReturned: boolean;
  tokenClaimsValidated: boolean;
  uiStateResolutionElapsedMs: number;
  websocketConnected: boolean;
}>;

export type LiveKitFailureCategory =
  | "none"
  | "permission_failure"
  | "build_runtime_mismatch"
  | "network_interruption"
  | "token_backend_failure"
  | "websocket_failure"
  | "ice_turn_failure"
  | "room_connection_failure"
  | "local_publish_failure"
  | "remote_participant_missing"
  | "remote_subscription_failure"
  | "first_media_missing"
  | "installed_ui_connecting_stuck"
  | "background_foreground_recovery_failed"
  | "cleanup_failure"
  | "provider_degradation"
  | "deadline_exceeded";

export type LiveKitEvidenceClassification = Readonly<{
  failureCategory: LiveKitFailureCategory;
  physicalProofStatus:
    | "installed_ui_observed"
    | "provider_blocked"
    | "source_only";
  resultStatus: "passed" | "failed" | "blocked";
}>;

type LiveKitMetricEnvelope = Readonly<{
  evidenceHashes: readonly string[];
  metrics: LiveKitMetricManifest;
  observationKind: "livekit_experience";
  sanitizationVersion: "bounded-nonpersonal-v1";
  schemaVersion: "product-sentinel-v1";
}>;

const INVOCATION_HEADER = "x-cognitive-livekit-sentinel-invocation";
const SERVICE_IDENTITY = "cognitive_sentinel_collector";
const SENTINEL_KEY = "livekit_experience_sentinel";
const REPOSITORY = "Chillywood2025/chillywood-mobile";
const TASK_KEY = "cognitive-level01-canary-control";
const ENVIRONMENT = "production";
const MAX_TIMING_MS = 600_000;
const MAX_SESSION_OBSERVATION_AGE_MS = 5 * 60 * 1_000;
const MAX_SESSION_OBSERVATION_WINDOW_MS = 120_000;
const TOKEN_DEADLINE_MS = 3_000;
const ROOM_DEADLINE_MS = 12_000;
const UI_DEADLINE_MS = 15_000;
const FIRST_MEDIA_DEADLINE_MS = 20_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const BEARER_JWT_PATTERN =
  /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const ROUTES = new Set(["live-stage", "watch-party-live", "chat-call"]);
const INSTALLED_OBSERVER_PLATFORMS = new Set(["android", "ios"]);
const ICE_STATES = new Set([
  "new",
  "checking",
  "connected",
  "completed",
  "failed",
  "disconnected",
  "closed",
  "unknown",
]);
const LOCAL_MEDIA_SOURCES = new Set([
  "test_tone",
  "silent_audio",
  "color_bars",
  "none",
]);
const NETWORK_STATES = new Set(["ready", "interrupted", "unknown"]);
const PERMISSION_STATES = new Set([
  "granted",
  "denied",
  "unknown",
  "not_applicable",
]);
const PROVIDER_STATES = new Set(["healthy", "degraded", "blocked", "unknown"]);
const REMOTE_MEDIA_KINDS = new Set(["audio", "video", "audio_video", "none"]);
const TOKEN_RESULT_STATES = new Set([
  "success",
  "denied",
  "error",
  "timeout",
  "not_attempted",
]);
const METRIC_KEYS = Object.freeze(
  [
    "backgroundForegroundRecovery",
    "backgrounded",
    "buildRuntimeMatched",
    "cleanupDisconnected",
    "connectingResolved",
    "firstAudioVideoObserved",
    "firstRemoteMediaElapsedMs",
    "foregrounded",
    "headlessParticipantUsed",
    "headlessObservationFinishedAt",
    "headlessObservationStartedAt",
    "headlessParticipantIdentityHash",
    "iceCheckingObserved",
    "iceGatheringObserved",
    "iceState",
    "installedUiEvidenceHash",
    "installedUiObserved",
    "installedObservationFinishedAt",
    "installedObservationStartedAt",
    "installedParticipantIdentityHash",
    "installedRuntimeIdentityHash",
    "installedRoomRunCorrelationHash",
    "installedSourceBuildHash",
    "localMediaSource",
    "localTrackPublished",
    "networkState",
    "peerConnectionEstablished",
    "participantIdentityDistinct",
    "permissionState",
    "providerState",
    "remoteMediaKind",
    "remoteParticipantJoined",
    "remoteTrackSubscribed",
    "roomConnectElapsedMs",
    "roomConnected",
    "roomRunCorrelationHash",
    "stageFailureCategory",
    "tokenIssuedElapsedMs",
    "tokenRequestStarted",
    "tokenRequested",
    "tokenResultStatus",
    "tokenReturned",
    "tokenClaimsValidated",
    "uiStateResolutionElapsedMs",
    "websocketConnected",
  ] as const,
);
const PAYLOAD_KEYS = Object.freeze(
  [
    "action",
    "evidenceManifestHash",
    "metricManifest",
    "observationFinishedAt",
    "observationStartedAt",
    "platform",
    "routeOrSurface",
    "runtimeIdentityHash",
    "sourceBuildHash",
  ] as const,
);
const METRIC_ENVELOPE_KEYS = Object.freeze(
  [
    "evidenceHashes",
    "metrics",
    "observationKind",
    "sanitizationVersion",
    "schemaVersion",
  ] as const,
);
const SECURITY_POLICY = securityPolicyJson as CanonicalSecurityPolicy;

const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Headers":
    `authorization, x-client-info, apikey, content-type, ${INVOCATION_HEADER}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
});

const json = (status: number, body: JsonObject): Response =>
  new Response(JSON.stringify(body), { headers: CORS_HEADERS, status });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const toText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const hasExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean => {
  const expectedKeys = [...expected].sort();
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === expectedKeys.length &&
    actualKeys.every((entry, index) => entry === expectedKeys[index]);
};

const isBoundedTiming = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0 &&
  Number(value) <= MAX_TIMING_MS;

const parseCanonicalTimestamp = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const millis = Date.parse(value);
  if (
    !Number.isFinite(millis) ||
    new Date(millis).toISOString() !== value
  ) {
    return null;
  }
  return millis;
};

const nullableSha256 = (value: unknown): value is string | null =>
  value === null ||
  (typeof value === "string" && SHA256_PATTERN.test(value));

const nullableTimestamp = (value: unknown): value is string | null =>
  value === null || parseCanonicalTimestamp(value) !== null;

const hasBearerAuthorization = (request: Request): boolean =>
  BEARER_JWT_PATTERN.test(
    request.headers.get("authorization")?.trim() ?? "",
  );

const readRequiredSecret = (name: string): string => {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error("server_configuration_missing");
  return value;
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const constantTimeEqual = (left: string, right: string): boolean => {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return diff === 0;
};

const canonicalize = (value: Json): Json => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  ) as JsonObject;
};

export const canonicalMetricHash = (metricManifest: LiveKitMetricManifest) =>
  sha256Hex(JSON.stringify(canonicalize(metricManifest as unknown as Json)));

export const deriveLiveKitFailureCategory = (
  metric: Omit<LiveKitMetricManifest, "stageFailureCategory">,
): LiveKitFailureCategory => {
  if (metric.permissionState === "denied") return "permission_failure";
  if (!metric.buildRuntimeMatched) return "build_runtime_mismatch";
  if (metric.networkState === "interrupted") return "network_interruption";
  if (!metric.tokenReturned) return "token_backend_failure";
  if (!metric.websocketConnected) return "websocket_failure";
  if (
    metric.iceState === "failed" || metric.iceState === "disconnected" ||
    metric.iceState === "closed"
  ) {
    return "ice_turn_failure";
  }
  if (!metric.roomConnected) {
    return metric.iceCheckingObserved
      ? "ice_turn_failure"
      : "room_connection_failure";
  }
  if (!metric.localTrackPublished) return "local_publish_failure";
  if (!metric.remoteParticipantJoined) return "remote_participant_missing";
  if (!metric.remoteTrackSubscribed) return "remote_subscription_failure";
  if (!metric.firstAudioVideoObserved) return "first_media_missing";
  if (metric.installedUiObserved && !metric.connectingResolved) {
    return "installed_ui_connecting_stuck";
  }
  if (
    metric.installedUiObserved &&
    (
      !metric.backgrounded || !metric.foregrounded ||
      !metric.backgroundForegroundRecovery
    )
  ) {
    return "background_foreground_recovery_failed";
  }
  if (!metric.cleanupDisconnected) return "cleanup_failure";
  if (
    metric.providerState === "blocked" ||
    metric.providerState === "degraded"
  ) {
    return "provider_degradation";
  }
  if (
    metric.tokenIssuedElapsedMs > TOKEN_DEADLINE_MS ||
    metric.roomConnectElapsedMs > ROOM_DEADLINE_MS ||
    metric.uiStateResolutionElapsedMs > UI_DEADLINE_MS ||
    metric.firstRemoteMediaElapsedMs > FIRST_MEDIA_DEADLINE_MS
  ) {
    return "deadline_exceeded";
  }
  return "none";
};

export const classifyLiveKitEvidence = (
  metric: LiveKitMetricManifest,
): LiveKitEvidenceClassification => {
  const failureCategory = deriveLiveKitFailureCategory(metric);
  const physicalProofStatus = metric.providerState === "blocked"
    ? "provider_blocked"
    : metric.installedUiObserved
    ? "installed_ui_observed"
    : "source_only";
  const resultStatus = physicalProofStatus !== "installed_ui_observed"
    ? "blocked"
    : failureCategory === "none"
    ? "passed"
    : "failed";
  return { failureCategory, physicalProofStatus, resultStatus };
};

const parseMetricManifest = (
  value: unknown,
): LiveKitMetricManifest | null => {
  if (!isRecord(value) || !hasExactKeys(value, METRIC_KEYS)) return null;
  for (
    const key of [
      "backgroundForegroundRecovery",
      "backgrounded",
      "buildRuntimeMatched",
      "cleanupDisconnected",
      "connectingResolved",
      "firstAudioVideoObserved",
      "foregrounded",
      "headlessParticipantUsed",
      "iceCheckingObserved",
      "iceGatheringObserved",
      "installedUiObserved",
      "localTrackPublished",
      "participantIdentityDistinct",
      "peerConnectionEstablished",
      "remoteParticipantJoined",
      "remoteTrackSubscribed",
      "roomConnected",
      "tokenRequestStarted",
      "tokenRequested",
      "tokenReturned",
      "tokenClaimsValidated",
      "websocketConnected",
    ]
  ) {
    if (typeof value[key] !== "boolean") return null;
  }
  for (
    const key of [
      "firstRemoteMediaElapsedMs",
      "roomConnectElapsedMs",
      "tokenIssuedElapsedMs",
      "uiStateResolutionElapsedMs",
    ]
  ) {
    if (!isBoundedTiming(value[key])) return null;
  }
  if (!ICE_STATES.has(toText(value.iceState))) return null;
  if (!LOCAL_MEDIA_SOURCES.has(toText(value.localMediaSource))) return null;
  if (!NETWORK_STATES.has(toText(value.networkState))) return null;
  if (!PERMISSION_STATES.has(toText(value.permissionState))) return null;
  if (!PROVIDER_STATES.has(toText(value.providerState))) return null;
  if (!REMOTE_MEDIA_KINDS.has(toText(value.remoteMediaKind))) return null;
  if (!TOKEN_RESULT_STATES.has(toText(value.tokenResultStatus))) return null;
  if (
    !SHA256_PATTERN.test(toText(value.roomRunCorrelationHash)) ||
    !nullableSha256(value.headlessParticipantIdentityHash) ||
    !nullableSha256(value.installedUiEvidenceHash) ||
    !nullableSha256(value.installedParticipantIdentityHash) ||
    !nullableSha256(value.installedRuntimeIdentityHash) ||
    !nullableSha256(value.installedRoomRunCorrelationHash) ||
    !nullableSha256(value.installedSourceBuildHash) ||
    !nullableTimestamp(value.installedObservationStartedAt) ||
    !nullableTimestamp(value.installedObservationFinishedAt)
  ) {
    return null;
  }
  const headlessStartedAtMillis = parseCanonicalTimestamp(
    value.headlessObservationStartedAt,
  );
  const headlessFinishedAtMillis = parseCanonicalTimestamp(
    value.headlessObservationFinishedAt,
  );
  const installedStartedAtMillis = parseCanonicalTimestamp(
    value.installedObservationStartedAt,
  );
  const installedFinishedAtMillis = parseCanonicalTimestamp(
    value.installedObservationFinishedAt,
  );
  if (
    headlessStartedAtMillis === null ||
    headlessFinishedAtMillis === null ||
    headlessStartedAtMillis > headlessFinishedAtMillis ||
    headlessFinishedAtMillis - headlessStartedAtMillis >
      MAX_SESSION_OBSERVATION_WINDOW_MS ||
    (
      value.installedUiObserved &&
      (
        installedStartedAtMillis === null ||
        installedFinishedAtMillis === null ||
        installedStartedAtMillis > installedFinishedAtMillis ||
        installedFinishedAtMillis - installedStartedAtMillis >
          MAX_SESSION_OBSERVATION_WINDOW_MS
      )
    )
  ) {
    return null;
  }
  const metric = value as unknown as LiveKitMetricManifest;
  const hasInstalledBinding = metric.installedUiObserved;
  const hasHeadlessIdentity = metric.headlessParticipantIdentityHash !== null;
  const hasInstalledIdentity = metric.installedParticipantIdentityHash !== null;
  const identitiesDiffer = hasHeadlessIdentity && hasInstalledIdentity &&
    metric.headlessParticipantIdentityHash !==
      metric.installedParticipantIdentityHash;
  if (
    metric.installedUiObserved !== (metric.installedUiEvidenceHash !== null) ||
    hasInstalledBinding !== (metric.installedObservationStartedAt !== null) ||
    hasInstalledBinding !== (metric.installedObservationFinishedAt !== null) ||
    hasInstalledBinding !== hasInstalledIdentity ||
    hasInstalledBinding !== (metric.installedRuntimeIdentityHash !== null) ||
    hasInstalledBinding !==
      (metric.installedRoomRunCorrelationHash !== null) ||
    hasInstalledBinding !== (metric.installedSourceBuildHash !== null) ||
    (
      hasInstalledBinding &&
      metric.installedRoomRunCorrelationHash !==
        metric.roomRunCorrelationHash
    ) ||
    metric.participantIdentityDistinct !== identitiesDiffer ||
    (
      metric.tokenReturned &&
      (
        !metric.tokenClaimsValidated ||
        !hasHeadlessIdentity
      )
    ) ||
    (
      !metric.tokenReturned &&
      (metric.tokenClaimsValidated || hasHeadlessIdentity)
    ) ||
    (
      metric.tokenReturned &&
      hasInstalledBinding &&
      !metric.participantIdentityDistinct
    ) ||
    metric.firstAudioVideoObserved !== (metric.remoteMediaKind !== "none") ||
    metric.tokenReturned !== (metric.tokenResultStatus === "success") ||
    metric.tokenRequested !== metric.tokenRequestStarted
  ) {
    return null;
  }
  const derivedFailure = deriveLiveKitFailureCategory(metric);
  if (metric.stageFailureCategory !== derivedFailure) return null;
  return metric;
};

const parseMetricEnvelope = (
  value: unknown,
  evidenceManifestHash: string,
): LiveKitMetricEnvelope | null => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, METRIC_ENVELOPE_KEYS) ||
    value.schemaVersion !== "product-sentinel-v1" ||
    value.sanitizationVersion !== "bounded-nonpersonal-v1" ||
    value.observationKind !== "livekit_experience" ||
    !Array.isArray(value.evidenceHashes) ||
    value.evidenceHashes.length < 1 ||
    value.evidenceHashes.length > 64 ||
    value.evidenceHashes.some((entry) =>
      typeof entry !== "string" || !SHA256_PATTERN.test(entry)
    ) ||
    !value.evidenceHashes.includes(evidenceManifestHash)
  ) {
    return null;
  }
  const metrics = parseMetricManifest(value.metrics);
  if (!metrics) return null;
  return {
    evidenceHashes: [...new Set(value.evidenceHashes)].sort(),
    metrics,
    observationKind: "livekit_experience",
    sanitizationVersion: "bounded-nonpersonal-v1",
    schemaVersion: "product-sentinel-v1",
  };
};

const authenticateInvocation = async (request: Request): Promise<boolean> => {
  const expectedHash =
    Deno.env.get("COGNITIVE_LIVEKIT_SENTINEL_INVOKE_SHA256")?.trim() ?? "";
  const token = request.headers.get(INVOCATION_HEADER)?.trim() ?? "";
  if (!expectedHash || !token) return false;
  return constantTimeEqual(await sha256Hex(token), expectedHash);
};

const createServiceClient = (): SupabaseClientLike => {
  const supabaseUrl = readRequiredSecret("SUPABASE_URL");
  const serviceRoleKey = readRequiredSecret("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

const readCanaryScope = async (
  serviceClient: SupabaseClientLike,
  platform: "android" | "ios",
): Promise<{ projectId: string; taskId: string } | null> => {
  const task = await serviceClient
    .from("intelligence_tasks")
    .select("id,project_id")
    .eq("repository_full_name", REPOSITORY)
    .eq("task_key", TASK_KEY)
    .eq("platform", platform)
    .eq("environment", ENVIRONMENT)
    .limit(1)
    .maybeSingle();
  if (task.error || !task.data?.id || !task.data?.project_id) return null;
  return { projectId: task.data.project_id, taskId: task.data.id };
};

const preparePacket = async (
  payload: Record<string, unknown>,
): Promise<
  | {
    classification: LiveKitEvidenceClassification;
    evidenceManifestHash: string;
    metricManifest: LiveKitMetricEnvelope;
    observationFinishedAt: string;
    observationStartedAt: string;
    platform: "android" | "ios";
    routeOrSurface: string;
    runtimeIdentityHash: string;
    sourceBuildHash: string;
  }
  | null
> => {
  if (
    !hasExactKeys(payload, PAYLOAD_KEYS) ||
    classifyCanonicalSecurityPayload(payload, SECURITY_POLICY) !== "safe"
  ) {
    return null;
  }
  const action = toText(payload.action);
  if (action !== "prepare_run" && action !== "record_run") return null;
  const routeOrSurface = toText(payload.routeOrSurface);
  const runtimeIdentityHash = toText(payload.runtimeIdentityHash);
  const sourceBuildHash = toText(payload.sourceBuildHash);
  const suppliedEvidenceHash = toText(payload.evidenceManifestHash);
  const observationStartedAt = toText(payload.observationStartedAt);
  const observationFinishedAt = toText(payload.observationFinishedAt);
  const platform = toText(payload.platform);
  const startedAtMillis = Date.parse(observationStartedAt);
  const finishedAtMillis = Date.parse(observationFinishedAt);
  const nowMillis = Date.now();
  const metricManifest = parseMetricEnvelope(
    payload.metricManifest,
    suppliedEvidenceHash,
  );
  const metric = metricManifest?.metrics;
  const headlessStartedAtMillis = metric
    ? parseCanonicalTimestamp(metric.headlessObservationStartedAt)
    : null;
  const headlessFinishedAtMillis = metric
    ? parseCanonicalTimestamp(metric.headlessObservationFinishedAt)
    : null;
  const installedStartedAtMillis = metric
    ? parseCanonicalTimestamp(metric.installedObservationStartedAt)
    : null;
  const installedFinishedAtMillis = metric
    ? parseCanonicalTimestamp(metric.installedObservationFinishedAt)
    : null;
  const expectedStartedAtMillis = headlessStartedAtMillis === null
    ? null
    : installedStartedAtMillis === null
    ? headlessStartedAtMillis
    : Math.min(headlessStartedAtMillis, installedStartedAtMillis);
  const expectedFinishedAtMillis = headlessFinishedAtMillis === null
    ? null
    : installedFinishedAtMillis === null
    ? headlessFinishedAtMillis
    : Math.max(headlessFinishedAtMillis, installedFinishedAtMillis);
  if (
    !INSTALLED_OBSERVER_PLATFORMS.has(platform) ||
    !ROUTES.has(routeOrSurface) ||
    !SHA256_PATTERN.test(runtimeIdentityHash) ||
    !SHA256_PATTERN.test(sourceBuildHash) ||
    !SHA256_PATTERN.test(suppliedEvidenceHash) ||
    !metricManifest ||
    !metric ||
    !Number.isFinite(startedAtMillis) ||
    !Number.isFinite(finishedAtMillis) ||
    expectedStartedAtMillis === null ||
    expectedFinishedAtMillis === null ||
    startedAtMillis !== expectedStartedAtMillis ||
    finishedAtMillis !== expectedFinishedAtMillis ||
    (
      metric.installedUiObserved &&
      (
        metric.installedRuntimeIdentityHash !== runtimeIdentityHash ||
        metric.installedSourceBuildHash !== sourceBuildHash
      )
    ) ||
    startedAtMillis > finishedAtMillis ||
    finishedAtMillis - startedAtMillis >
      MAX_SESSION_OBSERVATION_WINDOW_MS ||
    nowMillis - finishedAtMillis > MAX_SESSION_OBSERVATION_AGE_MS ||
    finishedAtMillis > nowMillis + 60_000
  ) {
    return null;
  }
  const evidenceManifestHash = await canonicalMetricHash(
    metricManifest.metrics,
  );
  if (!constantTimeEqual(evidenceManifestHash, suppliedEvidenceHash)) {
    return null;
  }
  return {
    classification: classifyLiveKitEvidence(metricManifest.metrics),
    evidenceManifestHash,
    metricManifest,
    observationFinishedAt: new Date(finishedAtMillis).toISOString(),
    observationStartedAt: new Date(startedAtMillis).toISOString(),
    platform: platform as "android" | "ios",
    routeOrSurface,
    runtimeIdentityHash,
    sourceBuildHash,
  };
};

export const handler = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  if (!hasBearerAuthorization(request)) {
    return json(401, { error: "bearer_authorization_required" });
  }
  if (!await authenticateInvocation(request)) {
    return json(401, { error: "livekit_sentinel_invocation_required" });
  }
  try {
    const payload = await request.json().catch(() => null);
    if (!isRecord(payload)) {
      return json(400, { error: "livekit_sentinel_payload_rejected" });
    }
    const packet = await preparePacket(payload);
    if (!packet) {
      return json(400, { error: "livekit_sentinel_payload_rejected" });
    }
    if (payload.action === "prepare_run") {
      return json(200, {
        classification: packet.classification as unknown as JsonObject,
        evidenceManifestHash: packet.evidenceManifestHash,
        independentEvaluationRequired: true,
        ok: true,
        persisted: false,
      });
    }

    const serviceClient = createServiceClient();
    const scope = await readCanaryScope(serviceClient, packet.platform);
    if (!scope) {
      return json(409, { error: "level01_canary_not_bootstrapped" });
    }
    const result = await serviceClient.rpc(
      "product_experience_collect_sentinel_run",
      {
        p_collection_idempotency_hash: await sha256Hex([
          REPOSITORY,
          TASK_KEY,
          SERVICE_IDENTITY,
          SENTINEL_KEY,
          packet.platform,
          packet.routeOrSurface,
          packet.runtimeIdentityHash,
          packet.sourceBuildHash,
          packet.evidenceManifestHash,
          packet.observationStartedAt,
          packet.observationFinishedAt,
        ].join("|")),
        p_environment: ENVIRONMENT,
        p_evidence_manifest_hash: packet.evidenceManifestHash,
        p_evaluation_expires_at: new Date(
          Date.parse(packet.observationFinishedAt) + 24 * 60 * 60 * 1_000,
        ).toISOString(),
        p_metric_manifest: packet.metricManifest,
        p_observation_finished_at: packet.observationFinishedAt,
        p_observation_started_at: packet.observationStartedAt,
        p_physical_proof_status: packet.classification.physicalProofStatus,
        p_platform: packet.platform,
        p_project_id: scope.projectId,
        p_result_status: packet.classification.resultStatus,
        p_route_or_surface: packet.routeOrSurface,
        p_runtime_identity_hash: packet.runtimeIdentityHash,
        p_sentinel_key: SENTINEL_KEY,
        p_service_assertion: readRequiredSecret(
          "COGNITIVE_LIVEKIT_SENTINEL_ASSERTION",
        ),
        p_service_identity: SERVICE_IDENTITY,
        p_source_build_hash: packet.sourceBuildHash,
        p_task_id: scope.taskId,
      },
    );
    if (result.error || !isRecord(result.data)) {
      return json(409, { error: "livekit_sentinel_run_rejected" });
    }
    const sentinelRunId = toText(result.data.sentinelRunId);
    if (!sentinelRunId) {
      return json(409, { error: "livekit_sentinel_run_rejected" });
    }
    return json(200, {
      classification: packet.classification as unknown as JsonObject,
      evidenceManifestHash: packet.evidenceManifestHash,
      independentEvaluationRequired: true,
      ok: true,
      persisted: true,
      runIdHash: await sha256Hex(sentinelRunId),
    });
  } catch {
    return json(500, {
      error: "cognitive_livekit_experience_collector_failed",
    });
  }
};

if (import.meta.main) Deno.serve(handler);
