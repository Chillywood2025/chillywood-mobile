import {
  canonicalize,
  constantTimeEqual,
  sha256Hex,
} from "../contracts.mjs";
import { ready } from "./helpers.mjs";

const SERVICE_IDENTITY = "cognitive_sentinel_collector";
const SENTINEL_KEY = "livekit_experience_sentinel";
const REPOSITORY = "Chillywood2025/chillywood-mobile";
const TASK_KEY = "cognitive-level01-canary-control";
const MAX_TIMING_MS = 600_000;
const MAX_OBSERVATION_AGE_MS = 5 * 60_000;
const MAX_OBSERVATION_WINDOW_MS = 120_000;
const SHA256 = /^[a-f0-9]{64}$/u;
const ROUTES = new Set(["live-stage", "watch-party-live", "chat-call"]);
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
const METRIC_KEYS = Object.freeze([
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
  "participantIdentityDistinct",
  "peerConnectionEstablished",
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
]);
const METRIC_ENVELOPE_KEYS = Object.freeze([
  "evidenceHashes",
  "metrics",
  "observationKind",
  "sanitizationVersion",
  "schemaVersion",
]);
const PAYLOAD_KEYS = Object.freeze([
  "action",
  "evidenceManifestHash",
  "metricManifest",
  "observationFinishedAt",
  "observationStartedAt",
  "routeOrSurface",
  "runtimeIdentityHash",
  "sourceBuildHash",
]);
const BOOLEAN_METRICS = Object.freeze([
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
]);
const TIMING_METRICS = Object.freeze([
  "firstRemoteMediaElapsedMs",
  "roomConnectElapsedMs",
  "tokenIssuedElapsedMs",
  "uiStateResolutionElapsedMs",
]);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, expected) => {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index]);
};

const canonicalTimestamp = (value) => {
  if (typeof value !== "string") return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value
    ? millis
    : null;
};

const nullableHash = (value) => value === null ||
  (typeof value === "string" && SHA256.test(value));

const nullableTimestamp = (value) =>
  value === null || canonicalTimestamp(value) !== null;

const boundedTiming = (value) =>
  Number.isInteger(value) && value >= 0 && value <= MAX_TIMING_MS;

export const deriveLiveKitFailureCategory = (metric) => {
  if (metric.permissionState === "denied") return "permission_failure";
  if (!metric.buildRuntimeMatched) return "build_runtime_mismatch";
  if (metric.networkState === "interrupted") return "network_interruption";
  if (!metric.tokenReturned) return "token_backend_failure";
  if (!metric.websocketConnected) return "websocket_failure";
  if (["failed", "disconnected", "closed"].includes(metric.iceState)) {
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
  if (["blocked", "degraded"].includes(metric.providerState)) {
    return "provider_degradation";
  }
  if (
    metric.tokenIssuedElapsedMs > 3_000 ||
    metric.roomConnectElapsedMs > 12_000 ||
    metric.uiStateResolutionElapsedMs > 15_000 ||
    metric.firstRemoteMediaElapsedMs > 20_000
  ) {
    return "deadline_exceeded";
  }
  return "none";
};

export const classifyLiveKitEvidence = (metric) => {
  const failureCategory = deriveLiveKitFailureCategory(metric);
  const physicalProofStatus = metric.providerState === "blocked"
    ? "provider_blocked"
    : metric.installedUiObserved
    ? "installed_ui_observed"
    : "source_only";
  return Object.freeze({
    failureCategory,
    physicalProofStatus,
    resultStatus: physicalProofStatus !== "installed_ui_observed"
      ? "blocked"
      : failureCategory === "none"
      ? "passed"
      : "failed",
  });
};

const parseMetricManifest = (value) => {
  if (!exactKeys(value, METRIC_KEYS)) return null;
  if (BOOLEAN_METRICS.some((key) => typeof value[key] !== "boolean")) {
    return null;
  }
  if (TIMING_METRICS.some((key) => !boundedTiming(value[key]))) return null;
  if (
    !ICE_STATES.has(value.iceState) ||
    !LOCAL_MEDIA_SOURCES.has(value.localMediaSource) ||
    !NETWORK_STATES.has(value.networkState) ||
    !PERMISSION_STATES.has(value.permissionState) ||
    !PROVIDER_STATES.has(value.providerState) ||
    !REMOTE_MEDIA_KINDS.has(value.remoteMediaKind) ||
    !TOKEN_RESULT_STATES.has(value.tokenResultStatus) ||
    !SHA256.test(value.roomRunCorrelationHash) ||
    !nullableHash(value.headlessParticipantIdentityHash) ||
    !nullableHash(value.installedUiEvidenceHash) ||
    !nullableHash(value.installedParticipantIdentityHash) ||
    !nullableHash(value.installedRuntimeIdentityHash) ||
    !nullableHash(value.installedRoomRunCorrelationHash) ||
    !nullableHash(value.installedSourceBuildHash) ||
    !nullableTimestamp(value.installedObservationStartedAt) ||
    !nullableTimestamp(value.installedObservationFinishedAt)
  ) {
    return null;
  }
  const headlessStarted = canonicalTimestamp(
    value.headlessObservationStartedAt,
  );
  const headlessFinished = canonicalTimestamp(
    value.headlessObservationFinishedAt,
  );
  const installedStarted = canonicalTimestamp(
    value.installedObservationStartedAt,
  );
  const installedFinished = canonicalTimestamp(
    value.installedObservationFinishedAt,
  );
  if (
    headlessStarted === null ||
    headlessFinished === null ||
    headlessStarted > headlessFinished ||
    headlessFinished - headlessStarted > MAX_OBSERVATION_WINDOW_MS ||
    (
      value.installedUiObserved &&
      (
        installedStarted === null ||
        installedFinished === null ||
        installedStarted > installedFinished ||
        installedFinished - installedStarted > MAX_OBSERVATION_WINDOW_MS
      )
    )
  ) {
    return null;
  }
  const installedBound = value.installedUiObserved;
  const identitiesDiffer =
    value.headlessParticipantIdentityHash !== null &&
    value.installedParticipantIdentityHash !== null &&
    value.headlessParticipantIdentityHash !==
      value.installedParticipantIdentityHash;
  if (
    installedBound !== (value.installedUiEvidenceHash !== null) ||
    installedBound !== (value.installedObservationStartedAt !== null) ||
    installedBound !== (value.installedObservationFinishedAt !== null) ||
    installedBound !== (value.installedParticipantIdentityHash !== null) ||
    installedBound !== (value.installedRuntimeIdentityHash !== null) ||
    installedBound !== (value.installedRoomRunCorrelationHash !== null) ||
    installedBound !== (value.installedSourceBuildHash !== null) ||
    (
      installedBound &&
      value.installedRoomRunCorrelationHash !== value.roomRunCorrelationHash
    ) ||
    value.participantIdentityDistinct !== identitiesDiffer ||
    (
      value.tokenReturned &&
      (
        !value.tokenClaimsValidated ||
        value.headlessParticipantIdentityHash === null
      )
    ) ||
    (
      !value.tokenReturned &&
      (
        value.tokenClaimsValidated ||
        value.headlessParticipantIdentityHash !== null
      )
    ) ||
    (
      value.tokenReturned && installedBound &&
      !value.participantIdentityDistinct
    ) ||
    value.firstAudioVideoObserved !== (value.remoteMediaKind !== "none") ||
    value.tokenReturned !== (value.tokenResultStatus === "success") ||
    value.tokenRequested !== value.tokenRequestStarted ||
    value.stageFailureCategory !== deriveLiveKitFailureCategory(value)
  ) {
    return null;
  }
  return value;
};

const stageSummary = (metric) => Object.freeze({
  installedEvidence: metric.installedUiObserved
    ? "installed_observed"
    : "headless_only",
  installedPassEligible: metric.installedUiObserved,
  media: metric.firstAudioVideoObserved
    ? "first_media_observed"
    : metric.remoteTrackSubscribed
    ? "subscribed_no_media"
    : metric.remoteParticipantJoined
    ? "participant_no_subscription"
    : metric.localTrackPublished
    ? "local_only"
    : "not_published",
  provider: metric.providerState,
  room: metric.roomConnected
    ? "connected"
    : metric.websocketConnected
    ? "websocket_only"
    : "not_connected",
  token: metric.tokenReturned
    ? "validated"
    : metric.tokenResultStatus,
});

export const prepareLiveKitPacket = async (
  payload,
  nowMillis = Date.now(),
) => {
  if (
    !exactKeys(payload, PAYLOAD_KEYS) ||
    !["prepare_run", "record_run"].includes(payload.action) ||
    !ROUTES.has(payload.routeOrSurface)
  ) {
    return null;
  }
  if (
    !SHA256.test(payload.runtimeIdentityHash) ||
    !SHA256.test(payload.sourceBuildHash) ||
    !SHA256.test(payload.evidenceManifestHash)
  ) {
    return null;
  }
  const envelope = payload.metricManifest;
  if (
    !exactKeys(envelope, METRIC_ENVELOPE_KEYS) ||
    envelope.schemaVersion !== "product-sentinel-v1" ||
    envelope.sanitizationVersion !== "bounded-nonpersonal-v1" ||
    envelope.observationKind !== "livekit_experience" ||
    !Array.isArray(envelope.evidenceHashes) ||
    envelope.evidenceHashes.length < 1 ||
    envelope.evidenceHashes.length > 64 ||
    envelope.evidenceHashes.some((entry) =>
      typeof entry !== "string" || !SHA256.test(entry)
    ) ||
    !envelope.evidenceHashes.includes(payload.evidenceManifestHash)
  ) {
    return null;
  }
  const metrics = parseMetricManifest(envelope.metrics);
  if (!metrics) return null;
  const outerStarted = canonicalTimestamp(payload.observationStartedAt);
  const outerFinished = canonicalTimestamp(payload.observationFinishedAt);
  const headlessStarted = canonicalTimestamp(
    metrics.headlessObservationStartedAt,
  );
  const headlessFinished = canonicalTimestamp(
    metrics.headlessObservationFinishedAt,
  );
  const installedStarted = canonicalTimestamp(
    metrics.installedObservationStartedAt,
  );
  const installedFinished = canonicalTimestamp(
    metrics.installedObservationFinishedAt,
  );
  const expectedStarted = installedStarted === null
    ? headlessStarted
    : Math.min(headlessStarted, installedStarted);
  const expectedFinished = installedFinished === null
    ? headlessFinished
    : Math.max(headlessFinished, installedFinished);
  if (
    outerStarted === null ||
    outerFinished === null ||
    outerStarted !== expectedStarted ||
    outerFinished !== expectedFinished ||
    outerStarted > outerFinished ||
    outerFinished - outerStarted > MAX_OBSERVATION_WINDOW_MS ||
    nowMillis - outerFinished > MAX_OBSERVATION_AGE_MS ||
    outerFinished > nowMillis + 60_000 ||
    (
      metrics.installedUiObserved &&
      (
        metrics.installedRuntimeIdentityHash !== payload.runtimeIdentityHash ||
        metrics.installedSourceBuildHash !== payload.sourceBuildHash
      )
    )
  ) {
    return null;
  }
  const computedHash = await sha256Hex(
    JSON.stringify(canonicalize(metrics)),
  );
  if (!constantTimeEqual(computedHash, payload.evidenceManifestHash)) {
    return null;
  }
  return Object.freeze({
    classification: classifyLiveKitEvidence(metrics),
    evidenceManifestHash: computedHash,
    metricManifest: Object.freeze({
      evidenceHashes: [...new Set(envelope.evidenceHashes)].sort(),
      metrics,
      observationKind: "livekit_experience",
      sanitizationVersion: "bounded-nonpersonal-v1",
      schemaVersion: "product-sentinel-v1",
    }),
    observationFinishedAt: new Date(outerFinished).toISOString(),
    observationStartedAt: new Date(outerStarted).toISOString(),
    routeOrSurface: payload.routeOrSurface,
    runtimeIdentityHash: payload.runtimeIdentityHash,
    sourceBuildHash: payload.sourceBuildHash,
    stages: stageSummary(metrics),
  });
};

const executePrepare = async ({ payload }) => {
  const packet = await prepareLiveKitPacket(payload);
  if (!packet) throw new Error("livekit_sentinel_payload_rejected");
  return Object.freeze({
    classification: packet.classification,
    evidenceManifestHash: packet.evidenceManifestHash,
    independentEvaluationRequired: true,
    ok: true,
    persisted: false,
    stages: packet.stages,
  });
};

const executeRecord = async ({ context, database, env, payload }) => {
  const packet = await prepareLiveKitPacket(payload);
  if (!packet) throw new Error("livekit_sentinel_payload_rejected");
  const collectionIdempotencyHash = await sha256Hex([
    REPOSITORY,
    TASK_KEY,
    SERVICE_IDENTITY,
    SENTINEL_KEY,
    packet.routeOrSurface,
    packet.runtimeIdentityHash,
    packet.sourceBuildHash,
    packet.evidenceManifestHash,
    packet.observationStartedAt,
    packet.observationFinishedAt,
  ].join("|"));
  const result = await database.call("collectLiveKitSentinelRun", [
    context.taskId,
    context.projectId,
    "shared",
    "production",
    packet.routeOrSurface,
    packet.runtimeIdentityHash,
    packet.sourceBuildHash,
    packet.evidenceManifestHash,
    JSON.stringify(packet.metricManifest),
    packet.classification.resultStatus,
    packet.classification.physicalProofStatus,
    packet.observationStartedAt,
    packet.observationFinishedAt,
    new Date(
      Date.parse(packet.observationFinishedAt) + 24 * 60 * 60_000,
    ).toISOString(),
    collectionIdempotencyHash,
    env.COGNITIVE_LIVEKIT_SENTINEL_ASSERTION,
  ]);
  const sentinelRunId = isRecord(result) &&
      typeof result.sentinelRunId === "string"
    ? result.sentinelRunId
    : "";
  if (!sentinelRunId) throw new Error("livekit_sentinel_run_rejected");
  return Object.freeze({
    classification: packet.classification,
    evidenceManifestHash: packet.evidenceManifestHash,
    independentEvaluationRequired: true,
    ok: true,
    persisted: true,
    runIdHash: await sha256Hex(sentinelRunId),
    stages: packet.stages,
  });
};

export const LIVEKIT_COLLECTOR_ADAPTERS = Object.freeze({
  prepare_run: ready([], executePrepare),
  record_run: ready(["collect_livekit_sentinel_run"], executeRecord),
});
