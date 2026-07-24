#!/usr/bin/env node
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = path.resolve(process.cwd());
const MAX_PRIVATE_INPUT_BYTES = 65_536;
const MAX_PRIVATE_INPUT_AGE_MS = 6 * 60 * 60 * 1_000;
const MAX_SESSION_OBSERVATION_AGE_MS = 5 * 60 * 1_000;
const MAX_SESSION_OBSERVATION_WINDOW_MS = 120_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 60_000;
const SAMPLE_RATE = 48_000;
const CHANNELS = 1;
const FRAME_DURATION_MS = 10;
const SAMPLES_PER_FRAME = SAMPLE_RATE / (1_000 / FRAME_DURATION_MS);
const TEST_TONE_HZ = 440;
const TEST_TONE_AMPLITUDE = Math.round(0.08 * 32_767);
const APPROVED_TOKEN_ORIGIN = "https://bmkkhihfbmsnnmcqkoly.supabase.co";
const APPROVED_TOKEN_PATH = "/functions/v1/livekit-token";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SESSION_NONCE_PATTERN = /^[a-f0-9]{32,64}$/u;
const BEARER_JWT_PATTERN =
  /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const ROUTES = new Set(["live-stage", "watch-party-live", "chat-call"]);
const ICE_STATE_BY_NUMBER = Object.freeze({
  0: "new",
  1: "checking",
  2: "connected",
  3: "completed",
  4: "disconnected",
  5: "failed",
  6: "closed",
});

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
]);

const isRecord = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, expected) => {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((entry, index) => entry === wanted[index]);
};

const boundedInteger = (value, minimum, maximum) =>
  Number.isInteger(value) && value >= minimum && value <= maximum;

const boundedElapsed = (startedAt) =>
  Math.max(0, Math.min(600_000, Math.round(Date.now() - startedAt)));

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
};

const hashJson = (value) =>
  crypto.createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");

const hashText = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const hashParticipantIdentity = (identity) =>
  hashText(`livekit-participant-identity-v1\0${identity}`);

const normalizeRoomName = (value) =>
  typeof value === "string" ? value.trim().toUpperCase() : "";

const hashSessionRoomCorrelation = (nonce, roomName) =>
  hashText(
    `livekit-session-room-correlation-v1\0${nonce}\0${
      normalizeRoomName(roomName)
    }`,
  );

const parseObservationTimestamp = (value) => {
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

const decodeBase64UrlJson = (value) => {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("participant_token_claims_rejected");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length < 2 || decoded.length > 16_384) {
    throw new Error("participant_token_claims_rejected");
  }
  const parsed = JSON.parse(decoded.toString("utf8"));
  if (!isRecord(parsed)) {
    throw new Error("participant_token_claims_rejected");
  }
  return parsed;
};

const validateParticipantTokenClaims = (token, expectedRoomName, nowMillis) => {
  if (
    typeof token !== "string" ||
    token.length < 64 ||
    token.length > 16_384
  ) {
    throw new Error("participant_token_claims_rejected");
  }
  const segments = token.split(".");
  if (
    segments.length !== 3 ||
    segments.some((segment) => !/^[A-Za-z0-9_-]+$/u.test(segment))
  ) {
    throw new Error("participant_token_claims_rejected");
  }
  const claims = decodeBase64UrlJson(segments[1]);
  const subject = typeof claims.sub === "string" ? claims.sub.trim() : "";
  const tokenRoom = isRecord(claims.video) &&
      typeof claims.video.room === "string"
    ? claims.video.room.trim()
    : "";
  const nowSeconds = Math.floor(nowMillis / 1_000);
  if (
    subject.length < 1 ||
    subject.length > 256 ||
    tokenRoom.length < 1 ||
    tokenRoom.length > 256 ||
    normalizeRoomName(tokenRoom) !== normalizeRoomName(expectedRoomName) ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= nowSeconds - 30 ||
    claims.exp > nowSeconds + 2 * 60 * 60 ||
    (
      claims.nbf !== undefined &&
      (!Number.isInteger(claims.nbf) || claims.nbf > nowSeconds + 60)
    ) ||
    (
      claims.iat !== undefined &&
      (
        !Number.isInteger(claims.iat) ||
        claims.iat > nowSeconds + 60 ||
        claims.iat < nowSeconds - 10 * 60
      )
    )
  ) {
    throw new Error("participant_token_claims_rejected");
  }
  return {
    participantIdentityHash: hashParticipantIdentity(subject),
    roomName: normalizeRoomName(tokenRoom),
  };
};

const assertParticipantIdentitySeparation = (
  headlessParticipantIdentityHash,
  installedParticipantIdentityHash,
) => {
  const participantIdentityDistinct =
    headlessParticipantIdentityHash !== null &&
    installedParticipantIdentityHash !== null &&
    headlessParticipantIdentityHash !== installedParticipantIdentityHash;
  if (
    headlessParticipantIdentityHash !== null &&
    installedParticipantIdentityHash !== null &&
    !participantIdentityDistinct
  ) {
    throw new Error("same_participant_identity_rejected");
  }
  return participantIdentityDistinct;
};

const parseArgs = (argv) => {
  const parsed = {
    input: "",
    installedEvidence: "",
    selfTest: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (const arg of argv) {
    if (arg === "--self-test") parsed.selfTest = true;
    else if (arg.startsWith("--input=")) {
      parsed.input = arg.slice("--input=".length);
    } else if (arg.startsWith("--installed-evidence=")) {
      parsed.installedEvidence = arg.slice("--installed-evidence=".length);
    } else if (arg.startsWith("--timeout-ms=")) {
      parsed.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    } else {
      throw new Error("unsupported_argument");
    }
  }
  if (
    !boundedInteger(parsed.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
  ) {
    throw new Error("timeout_out_of_bounds");
  }
  return parsed;
};

const readOwnerOnlyJson = (candidatePath, label) => {
  const absolute = path.resolve(candidatePath);
  const relative = path.relative(ROOT, absolute);
  if (
    !path.isAbsolute(candidatePath) ||
    (!relative.startsWith("..") && relative !== "..")
  ) {
    throw new Error(`${label}_must_be_outside_git`);
  }
  const pathStats = fs.lstatSync(absolute);
  if (!pathStats.isFile() || pathStats.isSymbolicLink()) {
    throw new Error(`${label}_must_be_regular_file`);
  }
  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  const descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | noFollow);
  try {
    const stats = fs.fstatSync(descriptor);
    if (
      !stats.isFile() ||
      stats.dev !== pathStats.dev ||
      stats.ino !== pathStats.ino
    ) {
      throw new Error(`${label}_file_changed_during_open`);
    }
    if ((stats.mode & 0o077) !== 0) {
      throw new Error(`${label}_must_be_0600`);
    }
    if (
      typeof process.getuid === "function" && stats.uid !== process.getuid()
    ) {
      throw new Error(`${label}_must_be_owner_readable`);
    }
    if (
      stats.size < 2 || stats.size > MAX_PRIVATE_INPUT_BYTES ||
      Date.now() - stats.mtimeMs > MAX_PRIVATE_INPUT_AGE_MS
    ) {
      throw new Error(`${label}_expired_or_out_of_bounds`);
    }
    return JSON.parse(fs.readFileSync(descriptor, "utf8"));
  } finally {
    fs.closeSync(descriptor);
  }
};

const validatePrivateInput = (value) => {
  if (
    !exactKeys(value, [
      "routeOrSurface",
      "runtimeIdentityHash",
      "sessionCorrelationNonce",
      "roomRunCorrelationHash",
      "sourceBuildHash",
      "tokenRequest",
    ]) ||
    !ROUTES.has(value.routeOrSurface) ||
    !SHA256_PATTERN.test(value.runtimeIdentityHash) ||
    !SESSION_NONCE_PATTERN.test(value.sessionCorrelationNonce) ||
    !SHA256_PATTERN.test(value.roomRunCorrelationHash) ||
    !SHA256_PATTERN.test(value.sourceBuildHash) ||
    !exactKeys(value.tokenRequest, [
      "apiKey",
      "authorization",
      "body",
      "endpointUrl",
    ]) ||
    typeof value.tokenRequest.apiKey !== "string" ||
    value.tokenRequest.apiKey.length < 20 ||
    value.tokenRequest.apiKey.length > 4_096 ||
    typeof value.tokenRequest.authorization !== "string" ||
    !BEARER_JWT_PATTERN.test(value.tokenRequest.authorization) ||
    value.tokenRequest.authorization.length > 8_192 ||
    !isRecord(value.tokenRequest.body) ||
    Buffer.byteLength(JSON.stringify(value.tokenRequest.body), "utf8") >
      16_384 ||
    typeof value.tokenRequest.body.roomName !== "string" ||
    normalizeRoomName(value.tokenRequest.body.roomName).length < 1 ||
    normalizeRoomName(value.tokenRequest.body.roomName).length > 256 ||
    hashSessionRoomCorrelation(
        value.sessionCorrelationNonce,
        value.tokenRequest.body.roomName,
      ) !== value.roomRunCorrelationHash
  ) {
    throw new Error("private_input_contract_rejected");
  }
  const endpoint = new URL(value.tokenRequest.endpointUrl);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.origin !== APPROVED_TOKEN_ORIGIN ||
    endpoint.pathname !== APPROVED_TOKEN_PATH ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.search !== "" ||
    endpoint.hash !== ""
  ) {
    throw new Error("token_endpoint_not_approved");
  }
  return value;
};

const validateInstalledEvidence = (value, input) => {
  if (
    !exactKeys(value, [
      "backgroundForegroundRecovery",
      "backgrounded",
      "buildRuntimeMatched",
      "connectingResolved",
      "foregrounded",
      "installedUiEvidenceHash",
      "installedParticipantIdentityHash",
      "networkState",
      "observationFinishedAt",
      "observationStartedAt",
      "observerKind",
      "permissionState",
      "routeOrSurface",
      "runtimeIdentityHash",
      "roomRunCorrelationHash",
      "sourceBuildHash",
      "uiStateResolutionElapsedMs",
    ]) ||
    !["android_installed_app", "ios_installed_app"].includes(
      value.observerKind,
    ) ||
    value.routeOrSurface !== input.routeOrSurface ||
    !SHA256_PATTERN.test(value.installedUiEvidenceHash) ||
    !SHA256_PATTERN.test(value.installedParticipantIdentityHash) ||
    !SHA256_PATTERN.test(value.runtimeIdentityHash) ||
    value.runtimeIdentityHash !== input.runtimeIdentityHash ||
    !SHA256_PATTERN.test(value.sourceBuildHash) ||
    value.sourceBuildHash !== input.sourceBuildHash ||
    !SHA256_PATTERN.test(value.roomRunCorrelationHash) ||
    value.roomRunCorrelationHash !== input.roomRunCorrelationHash ||
    !["ready", "interrupted", "unknown"].includes(value.networkState) ||
    !["granted", "denied", "unknown"].includes(value.permissionState) ||
    !boundedInteger(value.uiStateResolutionElapsedMs, 0, 600_000)
  ) {
    throw new Error("installed_evidence_contract_rejected");
  }
  const startedAtMillis = parseObservationTimestamp(value.observationStartedAt);
  const finishedAtMillis = parseObservationTimestamp(
    value.observationFinishedAt,
  );
  const nowMillis = Date.now();
  if (
    startedAtMillis === null ||
    finishedAtMillis === null ||
    startedAtMillis > finishedAtMillis ||
    finishedAtMillis - startedAtMillis > MAX_SESSION_OBSERVATION_WINDOW_MS ||
    nowMillis - finishedAtMillis > MAX_SESSION_OBSERVATION_AGE_MS ||
    finishedAtMillis > nowMillis + 60_000
  ) {
    throw new Error("installed_evidence_stale_or_unbounded");
  }
  for (
    const key of [
      "backgroundForegroundRecovery",
      "backgrounded",
      "buildRuntimeMatched",
      "connectingResolved",
      "foregrounded",
    ]
  ) {
    if (typeof value[key] !== "boolean") {
      throw new Error("installed_evidence_contract_rejected");
    }
  }
  return value;
};

const deriveFailureCategory = (metric) => {
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

const observeRtcStats = (stats, state) => {
  const entries = [
    ...(stats?.publisherStats ?? []),
    ...(stats?.subscriberStats ?? []),
  ];
  for (const entry of entries) {
    const kind = entry?.stats?.case;
    const value = entry?.stats?.value;
    if (kind === "localCandidate") state.iceGatheringObserved = true;
    if (kind === "peerConnection") state.peerConnectionEstablished = true;
    if (kind === "candidatePair") {
      const pairState = Number(value?.candidatePair?.state);
      if (pairState === 2) state.iceCheckingObserved = true;
      if (pairState === 4 && value?.candidatePair?.nominated === true) {
        state.iceState = "connected";
      }
    }
    if (kind === "transport") {
      const numericIceState = Number(value?.transport?.iceState);
      const normalized = ICE_STATE_BY_NUMBER[numericIceState];
      if (normalized) state.iceState = normalized;
      if (normalized === "checking") state.iceCheckingObserved = true;
    }
  }
};

const waitUntil = async (condition, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await delay(50);
  }
  return condition();
};

const consumeFirstRemoteFrame = async (
  rtc,
  track,
  state,
  roomConnectStartedAt,
  timeoutMs,
) => {
  const isAudio = track.kind === rtc.TrackKind.KIND_AUDIO;
  const stream = isAudio
    ? new rtc.AudioStream(track)
    : new rtc.VideoStream(track);
  const reader = stream.getReader();
  try {
    const result = await Promise.race([
      reader.read(),
      delay(timeoutMs).then(() => ({ done: true })),
    ]);
    if (!result.done && result.value) {
      state.remoteMediaKinds.add(isAudio ? "audio" : "video");
      state.firstAudioVideoObserved = true;
      state.firstRemoteMediaElapsedMs = boundedElapsed(roomConnectStartedAt);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
};

const pumpTestTone = async (rtc, source, signal, timeoutMs) => {
  let sampleOffset = 0;
  const deadline = Date.now() + timeoutMs;
  while (!signal.aborted && Date.now() < deadline) {
    const frame = rtc.AudioFrame.create(
      SAMPLE_RATE,
      CHANNELS,
      SAMPLES_PER_FRAME,
    );
    for (let sample = 0; sample < SAMPLES_PER_FRAME; sample += 1) {
      frame.data[sample] = Math.round(
        TEST_TONE_AMPLITUDE *
          Math.sin(
            (2 * Math.PI * TEST_TONE_HZ * sampleOffset) / SAMPLE_RATE,
          ),
      );
      sampleOffset += 1;
    }
    await source.captureFrame(frame);
  }
};

const requestParticipantToken = async (input, timeoutMs, state) => {
  state.tokenRequestStarted = true;
  state.tokenRequested = true;
  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(input.tokenRequest.endpointUrl, {
      body: JSON.stringify(input.tokenRequest.body),
      headers: {
        apikey: input.tokenRequest.apiKey,
        authorization: input.tokenRequest.authorization,
        "Content-Type": "application/json",
      },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(Math.min(timeoutMs, 15_000)),
    });
  } catch (error) {
    state.tokenIssuedElapsedMs = boundedElapsed(startedAt);
    state.tokenResultStatus = error?.name === "TimeoutError"
      ? "timeout"
      : "error";
    state.networkState = error?.name === "TimeoutError"
      ? "unknown"
      : "interrupted";
    return null;
  }
  state.tokenIssuedElapsedMs = boundedElapsed(startedAt);
  if (!response.ok) {
    state.tokenResultStatus = [401, 403].includes(response.status)
      ? "denied"
      : "error";
    state.providerState = response.status >= 500 ? "degraded" : "healthy";
    return null;
  }
  const body = await response.json().catch(() => null);
  if (
    !isRecord(body) ||
    typeof body.participantToken !== "string" ||
    body.participantToken.length < 64 ||
    body.participantToken.length > 16_384 ||
    typeof body.serverUrl !== "string" ||
    !body.serverUrl.startsWith("wss://") ||
    !isRecord(body.requestedGrants)
  ) {
    state.tokenResultStatus = "error";
    return null;
  }
  let tokenClaims;
  try {
    tokenClaims = validateParticipantTokenClaims(
      body.participantToken,
      input.tokenRequest.body.roomName,
      Date.now(),
    );
  } catch {
    state.tokenResultStatus = "error";
    return null;
  }
  state.tokenResultStatus = "success";
  state.tokenReturned = true;
  state.tokenClaimsValidated = true;
  state.networkState = "ready";
  state.providerState = "healthy";
  return {
    canPublish: body.requestedGrants.canPublish === true,
    participantIdentityHash: tokenClaims.participantIdentityHash,
    participantToken: body.participantToken,
    serverUrl: body.serverUrl,
  };
};

const runHeadlessParticipant = async (
  rtc,
  input,
  installedEvidence,
  timeoutMs,
) => {
  const overallStartedAt = Date.now();
  const observationStartedAt = new Date(overallStartedAt).toISOString();
  const state = {
    cleanupDisconnected: false,
    firstAudioVideoObserved: false,
    firstRemoteMediaElapsedMs: timeoutMs,
    iceCheckingObserved: false,
    iceGatheringObserved: false,
    iceState: "unknown",
    localTrackPublished: false,
    networkState: installedEvidence?.networkState ?? "unknown",
    peerConnectionEstablished: false,
    providerState: "unknown",
    remoteMediaKinds: new Set(),
    remoteParticipantJoined: false,
    remoteTrackSubscribed: false,
    roomConnectElapsedMs: timeoutMs,
    roomConnected: false,
    tokenIssuedElapsedMs: timeoutMs,
    tokenRequestStarted: false,
    tokenRequested: false,
    tokenResultStatus: "not_attempted",
    tokenReturned: false,
    tokenClaimsValidated: false,
    websocketConnected: false,
  };
  const credentials = await requestParticipantToken(input, timeoutMs, state);
  let room;
  let source;
  let localTrack;
  let pumpAbort;
  let pumpPromise;
  const remoteFrameTasks = new Set();
  const roomConnectStartedAt = Date.now();
  try {
    if (!credentials) {
      state.cleanupDisconnected = true;
    } else {
      room = new rtc.Room();
      room.on(rtc.RoomEvent.ParticipantConnected, () => {
        state.remoteParticipantJoined = true;
      });
      room.on(rtc.RoomEvent.TrackSubscribed, (track) => {
        state.remoteTrackSubscribed = true;
        const task = consumeFirstRemoteFrame(
          rtc,
          track,
          state,
          roomConnectStartedAt,
          Math.max(1_000, timeoutMs - boundedElapsed(overallStartedAt)),
        );
        remoteFrameTasks.add(task);
        void task.finally(() => remoteFrameTasks.delete(task));
      });
      room.on(rtc.RoomEvent.Connected, () => {
        state.websocketConnected = true;
        state.roomConnected = true;
      });

      let polling = true;
      const statsPoll = (async () => {
        while (polling) {
          await room.getRtcStats()
            .then((stats) => observeRtcStats(stats, state))
            .catch(() => {});
          await delay(50);
        }
      })();
      try {
        await Promise.race([
          room.connect(credentials.serverUrl, credentials.participantToken, {
            autoSubscribe: true,
            dynacast: false,
          }),
          delay(timeoutMs).then(() => {
            throw new Error("room_connect_timeout");
          }),
        ]);
      } finally {
        polling = false;
        await statsPoll;
      }
      state.roomConnectElapsedMs = boundedElapsed(roomConnectStartedAt);
      state.websocketConnected = room.isConnected;
      state.roomConnected = room.isConnected;
      state.remoteParticipantJoined = room.remoteParticipants.size > 0 ||
        state.remoteParticipantJoined;
      await room.getRtcStats()
        .then((stats) => observeRtcStats(stats, state))
        .catch(() => {});
      state.peerConnectionEstablished = state.peerConnectionEstablished ||
        room.isConnected;

      if (credentials.canPublish) {
        source = new rtc.AudioSource(SAMPLE_RATE, CHANNELS);
        localTrack = rtc.LocalAudioTrack.createAudioTrack(
          "chillywood-synthetic-test-tone",
          source,
        );
        const options = new rtc.TrackPublishOptions();
        options.source = rtc.TrackSource.SOURCE_MICROPHONE;
        await room.localParticipant.publishTrack(localTrack, options);
        state.localTrackPublished = true;
        pumpAbort = new AbortController();
        pumpPromise = pumpTestTone(
          rtc,
          source,
          pumpAbort.signal,
          Math.max(1_000, timeoutMs - boundedElapsed(overallStartedAt)),
        );
      }

      await waitUntil(
        () =>
          state.firstAudioVideoObserved ||
          boundedElapsed(overallStartedAt) >= timeoutMs,
        Math.max(1_000, timeoutMs - boundedElapsed(overallStartedAt)),
      );
    }
  } catch {
    if (state.tokenReturned && !state.roomConnected) {
      state.providerState = state.providerState === "unknown"
        ? "degraded"
        : state.providerState;
    }
  } finally {
    pumpAbort?.abort();
    await pumpPromise?.catch(() => {});
    await Promise.allSettled([...remoteFrameTasks]);
    await room?.disconnect().catch(() => {});
    await localTrack?.close().catch(() => {});
    await source?.close().catch(() => {});
    if (room) state.cleanupDisconnected = !room.isConnected;
    await rtc.dispose().catch(() => {});
  }

  if (!state.roomConnected) {
    state.roomConnectElapsedMs = boundedElapsed(roomConnectStartedAt);
  }
  if (!state.firstAudioVideoObserved) {
    state.firstRemoteMediaElapsedMs = boundedElapsed(roomConnectStartedAt);
  }
  const headlessObservationFinishedAt = new Date().toISOString();
  const headlessObservationFinishedAtMillis = Date.parse(
    headlessObservationFinishedAt,
  );
  const installedObservationStartedAtMillis = installedEvidence
    ? Date.parse(installedEvidence.observationStartedAt)
    : overallStartedAt;
  const installedObservationFinishedAtMillis = installedEvidence
    ? Date.parse(installedEvidence.observationFinishedAt)
    : headlessObservationFinishedAtMillis;
  const observationStartedAtMillis = Math.min(
    overallStartedAt,
    installedObservationStartedAtMillis,
  );
  const observationFinishedAtMillis = Math.max(
    headlessObservationFinishedAtMillis,
    installedObservationFinishedAtMillis,
  );
  if (
    observationFinishedAtMillis - observationStartedAtMillis >
      MAX_SESSION_OBSERVATION_WINDOW_MS
  ) {
    throw new Error("session_observation_window_rejected");
  }
  const headlessParticipantIdentityHash =
    credentials?.participantIdentityHash ?? null;
  const installedParticipantIdentityHash =
    installedEvidence?.installedParticipantIdentityHash ?? null;
  const participantIdentityDistinct = assertParticipantIdentitySeparation(
    headlessParticipantIdentityHash,
    installedParticipantIdentityHash,
  );
  const remoteMediaKind = state.remoteMediaKinds.size === 2
    ? "audio_video"
    : state.remoteMediaKinds.has("audio")
    ? "audio"
    : state.remoteMediaKinds.has("video")
    ? "video"
    : "none";
  const metric = {
    backgroundForegroundRecovery:
      installedEvidence?.backgroundForegroundRecovery ?? false,
    backgrounded: installedEvidence?.backgrounded ?? false,
    buildRuntimeMatched: installedEvidence?.buildRuntimeMatched ?? true,
    cleanupDisconnected: state.cleanupDisconnected,
    connectingResolved: installedEvidence?.connectingResolved ?? false,
    firstAudioVideoObserved: state.firstAudioVideoObserved,
    firstRemoteMediaElapsedMs: state.firstRemoteMediaElapsedMs,
    foregrounded: installedEvidence?.foregrounded ?? false,
    headlessParticipantUsed: true,
    headlessObservationFinishedAt,
    headlessObservationStartedAt: observationStartedAt,
    headlessParticipantIdentityHash,
    iceCheckingObserved: state.iceCheckingObserved,
    iceGatheringObserved: state.iceGatheringObserved,
    iceState: state.iceState,
    installedUiEvidenceHash: installedEvidence?.installedUiEvidenceHash ?? null,
    installedUiObserved: !!installedEvidence,
    installedObservationFinishedAt: installedEvidence?.observationFinishedAt ??
      null,
    installedObservationStartedAt: installedEvidence?.observationStartedAt ??
      null,
    installedParticipantIdentityHash,
    installedRuntimeIdentityHash: installedEvidence?.runtimeIdentityHash ??
      null,
    installedRoomRunCorrelationHash:
      installedEvidence?.roomRunCorrelationHash ?? null,
    installedSourceBuildHash: installedEvidence?.sourceBuildHash ?? null,
    localMediaSource: state.localTrackPublished ? "test_tone" : "none",
    localTrackPublished: state.localTrackPublished,
    networkState: installedEvidence?.networkState ?? state.networkState,
    peerConnectionEstablished: state.peerConnectionEstablished,
    participantIdentityDistinct,
    permissionState: installedEvidence?.permissionState ?? "not_applicable",
    providerState: state.providerState,
    remoteMediaKind,
    remoteParticipantJoined: state.remoteParticipantJoined,
    remoteTrackSubscribed: state.remoteTrackSubscribed,
    roomConnectElapsedMs: state.roomConnectElapsedMs,
    roomConnected: state.roomConnected,
    roomRunCorrelationHash: input.roomRunCorrelationHash,
    stageFailureCategory: "none",
    tokenIssuedElapsedMs: state.tokenIssuedElapsedMs,
    tokenRequestStarted: state.tokenRequestStarted,
    tokenRequested: state.tokenRequested,
    tokenResultStatus: state.tokenResultStatus,
    tokenReturned: state.tokenReturned,
    tokenClaimsValidated: state.tokenClaimsValidated,
    uiStateResolutionElapsedMs: installedEvidence?.uiStateResolutionElapsedMs ??
      boundedElapsed(overallStartedAt),
    websocketConnected: state.websocketConnected,
  };
  metric.stageFailureCategory = deriveFailureCategory(metric);
  if (!exactKeys(metric, METRIC_KEYS)) {
    throw new Error("internal_metric_contract_mismatch");
  }
  const evidenceManifestHash = hashJson(metric);
  const evidenceHashes = [evidenceManifestHash];
  if (
    metric.installedUiEvidenceHash &&
    metric.installedUiEvidenceHash !== evidenceManifestHash
  ) {
    evidenceHashes.push(metric.installedUiEvidenceHash);
  }
  return {
    action: "prepare_run",
    evidenceManifestHash,
    metricManifest: {
      evidenceHashes: evidenceHashes.sort(),
      metrics: metric,
      observationKind: "livekit_experience",
      sanitizationVersion: "bounded-nonpersonal-v1",
      schemaVersion: "product-sentinel-v1",
    },
    observationFinishedAt: new Date(observationFinishedAtMillis).toISOString(),
    observationStartedAt: new Date(observationStartedAtMillis).toISOString(),
    routeOrSurface: input.routeOrSurface,
    runtimeIdentityHash: input.runtimeIdentityHash,
    sourceBuildHash: input.sourceBuildHash,
  };
};

const runSelfTest = () => {
  const selfTestNowMillis = Date.now();
  const selfTestRoom = "SYNTHETIC-ROOM";
  const selfTestSubject = "synthetic-headless-participant";
  const selfTestToken = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
      .toString("base64url"),
    Buffer.from(JSON.stringify({
      exp: Math.floor(selfTestNowMillis / 1_000) + 3_600,
      iat: Math.floor(selfTestNowMillis / 1_000),
      sub: selfTestSubject,
      video: { room: selfTestRoom },
    })).toString("base64url"),
    "synthetic-signature",
  ].join(".");
  const sessionCorrelationNonce = "1".repeat(32);
  const privateInputFixture = {
    routeOrSurface: "live-stage",
    runtimeIdentityHash: "a".repeat(64),
    sessionCorrelationNonce,
    roomRunCorrelationHash: hashSessionRoomCorrelation(
      sessionCorrelationNonce,
      selfTestRoom,
    ),
    sourceBuildHash: "b".repeat(64),
    tokenRequest: {
      apiKey: "synthetic-public-key-000000",
      authorization: `Bearer ${selfTestToken}`,
      body: { roomName: selfTestRoom },
      endpointUrl: `${APPROVED_TOKEN_ORIGIN}${APPROVED_TOKEN_PATH}`,
    },
  };
  try {
    validatePrivateInput(privateInputFixture);
  } catch {
    throw new Error("self_test_approved_endpoint_failed");
  }
  let unapprovedTokenEndpointRejected = false;
  try {
    validatePrivateInput({
      ...privateInputFixture,
      tokenRequest: {
        ...privateInputFixture.tokenRequest,
        endpointUrl: "https://example.invalid/functions/v1/livekit-token",
      },
    });
  } catch (error) {
    unapprovedTokenEndpointRejected =
      error?.message === "token_endpoint_not_approved";
  }
  if (!unapprovedTokenEndpointRejected) {
    throw new Error("self_test_token_endpoint_policy_failed");
  }
  const tokenClaims = validateParticipantTokenClaims(
    selfTestToken,
    selfTestRoom,
    selfTestNowMillis,
  );
  if (
    tokenClaims.participantIdentityHash !==
      hashParticipantIdentity(selfTestSubject)
  ) {
    throw new Error("self_test_token_subject_hash_failed");
  }
  let mismatchedRoomRejected = false;
  try {
    validateParticipantTokenClaims(
      selfTestToken,
      "UNRELATED-ROOM",
      selfTestNowMillis,
    );
  } catch (error) {
    mismatchedRoomRejected =
      error?.message === "participant_token_claims_rejected";
  }
  if (!mismatchedRoomRejected) {
    throw new Error("self_test_token_room_binding_failed");
  }
  let sameIdentityRejected = false;
  try {
    assertParticipantIdentitySeparation(
      tokenClaims.participantIdentityHash,
      tokenClaims.participantIdentityHash,
    );
  } catch (error) {
    sameIdentityRejected =
      error?.message === "same_participant_identity_rejected";
  }
  if (!sameIdentityRejected) {
    throw new Error("self_test_participant_separation_failed");
  }
  const selfTestStartedAt = new Date(selfTestNowMillis - 1_000).toISOString();
  const selfTestFinishedAt = new Date(selfTestNowMillis).toISOString();
  const metric = {
    backgroundForegroundRecovery: false,
    backgrounded: false,
    buildRuntimeMatched: true,
    cleanupDisconnected: true,
    connectingResolved: false,
    firstAudioVideoObserved: true,
    firstRemoteMediaElapsedMs: 900,
    foregrounded: false,
    headlessParticipantUsed: true,
    headlessObservationFinishedAt: selfTestFinishedAt,
    headlessObservationStartedAt: selfTestStartedAt,
    headlessParticipantIdentityHash: tokenClaims.participantIdentityHash,
    iceCheckingObserved: true,
    iceGatheringObserved: true,
    iceState: "connected",
    installedUiEvidenceHash: null,
    installedUiObserved: false,
    installedObservationFinishedAt: null,
    installedObservationStartedAt: null,
    installedParticipantIdentityHash: null,
    installedRuntimeIdentityHash: null,
    installedRoomRunCorrelationHash: null,
    installedSourceBuildHash: null,
    localMediaSource: "test_tone",
    localTrackPublished: true,
    networkState: "ready",
    peerConnectionEstablished: true,
    participantIdentityDistinct: false,
    permissionState: "not_applicable",
    providerState: "healthy",
    remoteMediaKind: "audio",
    remoteParticipantJoined: true,
    remoteTrackSubscribed: true,
    roomConnectElapsedMs: 500,
    roomConnected: true,
    roomRunCorrelationHash: privateInputFixture.roomRunCorrelationHash,
    stageFailureCategory: "none",
    tokenIssuedElapsedMs: 100,
    tokenRequestStarted: true,
    tokenRequested: true,
    tokenResultStatus: "success",
    tokenReturned: true,
    tokenClaimsValidated: true,
    uiStateResolutionElapsedMs: 1_000,
    websocketConnected: true,
  };
  metric.stageFailureCategory = deriveFailureCategory(metric);
  if (metric.stageFailureCategory !== "none") {
    throw new Error("self_test_classification_failed");
  }
  if (!exactKeys(metric, METRIC_KEYS) || hashJson(metric).length !== 64) {
    throw new Error("self_test_contract_failed");
  }
  process.stdout.write(
    JSON.stringify({
      approvedTokenEndpointAccepted: true,
      headlessOnlyCannotClaimInstalledUi: metric.installedUiObserved === false,
      mismatchedRoomRejected,
      ok: true,
      participantClaimsValidated: true,
      sameIdentityRejected,
      stageCount: METRIC_KEYS.length,
      unapprovedTokenEndpointRejected,
    }) + "\n",
  );
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    runSelfTest();
    return;
  }
  if (!args.input) throw new Error("owner_only_input_required");
  const input = validatePrivateInput(
    readOwnerOnlyJson(args.input, "private_input"),
  );
  const installedEvidence = args.installedEvidence
    ? validateInstalledEvidence(
      readOwnerOnlyJson(
        args.installedEvidence,
        "installed_evidence",
      ),
      input,
    )
    : null;
  const rtc = await import("@livekit/rtc-node").catch(() => {
    throw new Error("rtc_node_dependency_unavailable");
  });
  const packet = await runHeadlessParticipant(
    rtc,
    input,
    installedEvidence,
    args.timeoutMs,
  );
  process.stdout.write(JSON.stringify(packet) + "\n");
};

main().catch((error) => {
  const code = typeof error?.message === "string" &&
      /^[a-z0-9_]+$/u.test(error.message)
    ? error.message
    : "livekit_headless_sentinel_failed";
  process.stderr.write(JSON.stringify({ error: code, ok: false }) + "\n");
  process.exitCode = 1;
});
