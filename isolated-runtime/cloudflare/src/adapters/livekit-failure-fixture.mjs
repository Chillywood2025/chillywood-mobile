import {
  canonicalize,
  constantTimeEqual,
  hashJson,
  sha256Hex,
} from "../contracts.mjs";

export const LIVEKIT_FAILURE_FIXTURE_SCHEMA_VERSION =
  "livekit-failure-fixture-v1";

const FIXTURE_SECRET_MINIMUM_BYTES = 32;
const FIXTURE_SECRET_MAXIMUM_BYTES = 512;
const FIXTURE_TTL_MINIMUM_SECONDS = 30;
const FIXTURE_TTL_MAXIMUM_SECONDS = 300;
const HASH = /^[a-f0-9]{64}$/u;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SOURCE_COMMIT = /^[a-f0-9]{40}$/u;
const SYNTHETIC_ROOM =
  /^cognitive-test-[a-z0-9][a-z0-9-]{2,63}$/u;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

const FIXTURE_RECORD_KEYS = Object.freeze([
  "condition",
  "environment",
  "expiresAt",
  "fixtureId",
  "fixtureType",
  "installedObserverRequired",
  "issuedAt",
  "nonceHash",
  "normalUserRoomEligible",
  "platform",
  "projectId",
  "roomRunCorrelationHash",
  "schemaVersion",
  "sourceCommit",
  "syntheticRoomNameHash",
  "taskId",
]);

const FIXTURE_CONDITIONS = Object.freeze({
  controlled_test_endpoint_timeout: Object.freeze({
    expectedFailureCategory: "websocket_failure",
    injectedCondition: "hold_test_websocket_handshake",
    timeoutMs: 12_000,
    triggerStage: "websocket_connecting",
  }),
  participant_disconnect_at_room_connected: Object.freeze({
    expectedFailureCategory: "remote_participant_missing",
    injectedCondition: "disconnect_test_participant",
    timeoutMs: 1_000,
    triggerStage: "room_connected",
  }),
  remote_join_without_publish: Object.freeze({
    expectedFailureCategory: "remote_subscription_failure",
    injectedCondition: "suppress_remote_publication",
    timeoutMs: 12_000,
    triggerStage: "remote_participant_joined",
  }),
  remote_publication_cancelled: Object.freeze({
    expectedFailureCategory: "remote_subscription_failure",
    injectedCondition: "cancel_remote_publication",
    timeoutMs: 1_000,
    triggerStage: "remote_track_published",
  }),
});

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
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) &&
      new Date(milliseconds).toISOString() === value
    ? milliseconds
    : null;
};

const encodeBase64Url = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
};

const decodeBase64Url = (value) => {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    return null;
  }
  const padding = (4 - value.length % 4) % 4;
  try {
    const binary = atob(
      value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(padding),
    );
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
};

const fixtureSecret = (value) => {
  if (typeof value !== "string") return null;
  const bytes = TEXT_ENCODER.encode(value);
  return bytes.byteLength >= FIXTURE_SECRET_MINIMUM_BYTES &&
      bytes.byteLength <= FIXTURE_SECRET_MAXIMUM_BYTES
    ? bytes
    : null;
};

const importHmacKey = async (secret, usage) =>
  crypto.subtle.importKey(
    "raw",
    secret,
    { hash: "SHA-256", name: "HMAC" },
    false,
    [usage],
  );

const fixtureMaterial = (record) =>
  Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== "fixtureId"),
  );

const fixtureRecordIsValid = async (record) => {
  if (
    !exactKeys(record, FIXTURE_RECORD_KEYS) ||
    record.schemaVersion !== LIVEKIT_FAILURE_FIXTURE_SCHEMA_VERSION ||
    !Object.hasOwn(FIXTURE_CONDITIONS, record.fixtureType) ||
    !exactKeys(record.condition, [
      "expectedFailureCategory",
      "injectedCondition",
      "timeoutMs",
      "triggerStage",
    ]) ||
    JSON.stringify(canonicalize(record.condition)) !==
      JSON.stringify(canonicalize(FIXTURE_CONDITIONS[record.fixtureType])) ||
    record.environment !== "production" ||
    !["android", "ios"].includes(record.platform) ||
    !UUID.test(record.projectId) ||
    !UUID.test(record.taskId) ||
    !SOURCE_COMMIT.test(record.sourceCommit) ||
    !HASH.test(record.fixtureId) ||
    !HASH.test(record.nonceHash) ||
    !HASH.test(record.roomRunCorrelationHash) ||
    !HASH.test(record.syntheticRoomNameHash) ||
    record.installedObserverRequired !== true ||
    record.normalUserRoomEligible !== false
  ) {
    return false;
  }
  const issuedAt = canonicalTimestamp(record.issuedAt);
  const expiresAt = canonicalTimestamp(record.expiresAt);
  if (
    issuedAt === null ||
    expiresAt === null ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt < FIXTURE_TTL_MINIMUM_SECONDS * 1_000 ||
    expiresAt - issuedAt > FIXTURE_TTL_MAXIMUM_SECONDS * 1_000
  ) {
    return false;
  }
  return constantTimeEqual(
    record.fixtureId,
    await hashJson(fixtureMaterial(record)),
  );
};

const contextMatches = (record, context) =>
  record.environment === context.environment &&
  record.platform === context.platform &&
  record.projectId === context.projectId &&
  record.sourceCommit === context.sourceCommit &&
  record.taskId === context.taskId;

const signRecord = async (record, secret) => {
  const body = TEXT_ENCODER.encode(
    JSON.stringify(canonicalize(record)),
  );
  const key = await importHmacKey(secret, "sign");
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, body),
  );
  return `${encodeBase64Url(body)}.${encodeBase64Url(signature)}`;
};

const verifyTicket = async (ticket, secret) => {
  if (typeof ticket !== "string" || ticket.length > 8_192) return null;
  const segments = ticket.split(".");
  if (segments.length !== 2) return null;
  const body = decodeBase64Url(segments[0]);
  const signature = decodeBase64Url(segments[1]);
  if (!body || !signature || signature.byteLength !== 32) return null;
  const key = await importHmacKey(secret, "verify");
  if (!await crypto.subtle.verify("HMAC", key, signature, body)) return null;
  try {
    const parsed = JSON.parse(TEXT_DECODER.decode(body));
    return await fixtureRecordIsValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const randomNonceHash = async (randomBytes) => {
  const nonce = randomBytes ?? crypto.getRandomValues(new Uint8Array(32));
  if (!(nonce instanceof Uint8Array) || nonce.byteLength !== 32) {
    throw new Error("livekit_fixture_randomness_rejected");
  }
  return sha256Hex(encodeBase64Url(nonce));
};

export const issueLiveKitFailureFixture = async ({
  context,
  nowMillis = Date.now(),
  payload,
  randomBytes,
  secret,
}) => {
  const secretBytes = fixtureSecret(secret);
  if (
    !secretBytes ||
    !isRecord(context) ||
    !Number.isInteger(nowMillis) ||
    !exactKeys(payload, [
      "action",
      "fixtureType",
      "installedObserverRequired",
      "requestedTtlSeconds",
      "roomRunCorrelationHash",
      "syntheticRoomName",
    ]) ||
    payload.action !== "issue_failure_fixture" ||
    !Object.hasOwn(FIXTURE_CONDITIONS, payload.fixtureType) ||
    payload.installedObserverRequired !== true ||
    !Number.isInteger(payload.requestedTtlSeconds) ||
    payload.requestedTtlSeconds < FIXTURE_TTL_MINIMUM_SECONDS ||
    payload.requestedTtlSeconds > FIXTURE_TTL_MAXIMUM_SECONDS ||
    !HASH.test(payload.roomRunCorrelationHash) ||
    !SYNTHETIC_ROOM.test(payload.syntheticRoomName) ||
    context.environment !== "production" ||
    !["android", "ios"].includes(context.platform) ||
    !UUID.test(context.projectId) ||
    !UUID.test(context.taskId) ||
    !SOURCE_COMMIT.test(context.sourceCommit)
  ) {
    throw new Error("livekit_fixture_issue_rejected");
  }
  const material = {
    condition: FIXTURE_CONDITIONS[payload.fixtureType],
    environment: context.environment,
    expiresAt: new Date(
      nowMillis + payload.requestedTtlSeconds * 1_000,
    ).toISOString(),
    fixtureType: payload.fixtureType,
    installedObserverRequired: true,
    issuedAt: new Date(nowMillis).toISOString(),
    nonceHash: await randomNonceHash(randomBytes),
    normalUserRoomEligible: false,
    platform: context.platform,
    projectId: context.projectId,
    roomRunCorrelationHash: payload.roomRunCorrelationHash,
    schemaVersion: LIVEKIT_FAILURE_FIXTURE_SCHEMA_VERSION,
    sourceCommit: context.sourceCommit,
    syntheticRoomNameHash: await sha256Hex(payload.syntheticRoomName),
    taskId: context.taskId,
  };
  const record = Object.freeze({
    ...material,
    fixtureId: await hashJson(material),
  });
  const ticket = await signRecord(record, secretBytes);
  return Object.freeze({
    active: true,
    evaluatorReadbackRequired: true,
    fixtureAttestationHash: await sha256Hex(ticket),
    fixtureId: record.fixtureId,
    fixtureRecord: record,
    fixtureTicket: ticket,
    immutable: true,
    normalUserRoomEligible: false,
  });
};

export const readLiveKitFailureFixture = async ({
  context,
  fixtureId,
  fixtureTicket,
  nowMillis = Date.now(),
  secret,
}) => {
  const secretBytes = fixtureSecret(secret);
  if (
    !secretBytes ||
    !isRecord(context) ||
    !Number.isInteger(nowMillis) ||
    !HASH.test(fixtureId)
  ) {
    throw new Error("livekit_fixture_readback_rejected");
  }
  const record = await verifyTicket(fixtureTicket, secretBytes);
  if (
    !record ||
    !constantTimeEqual(fixtureId, record.fixtureId) ||
    !contextMatches(record, context)
  ) {
    throw new Error("livekit_fixture_readback_rejected");
  }
  if (nowMillis >= Date.parse(record.expiresAt)) {
    throw new Error("livekit_fixture_expired");
  }
  if (nowMillis < Date.parse(record.issuedAt) - 1_000) {
    throw new Error("livekit_fixture_not_yet_valid");
  }
  return Object.freeze({
    active: true,
    evaluatorReadbackRequired: true,
    fixtureAttestationHash: await sha256Hex(fixtureTicket),
    fixtureId: record.fixtureId,
    fixtureRecord: Object.freeze(record),
    immutable: true,
    normalUserRoomEligible: false,
  });
};

const invariant = (metrics, expected) =>
  Object.entries(expected).every(([key, value]) => metrics[key] === value);

export const validateLiveKitFailureFixtureEvidence = async ({
  fixtureReadback,
  metrics,
  syntheticRoomName,
}) => {
  if (
    !isRecord(fixtureReadback) ||
    !isRecord(fixtureReadback.fixtureRecord) ||
    !isRecord(metrics) ||
    !SYNTHETIC_ROOM.test(syntheticRoomName) ||
    !HASH.test(metrics.roomRunCorrelationHash) ||
    !constantTimeEqual(
      await sha256Hex(syntheticRoomName),
      fixtureReadback.fixtureRecord.syntheticRoomNameHash,
    ) ||
    !constantTimeEqual(
      metrics.roomRunCorrelationHash,
      fixtureReadback.fixtureRecord.roomRunCorrelationHash,
    ) ||
    metrics.scenarioType !== "bounded_failure_fixture" ||
    metrics.stageFailureCategory !==
      fixtureReadback.fixtureRecord.condition.expectedFailureCategory ||
    metrics.installedUiObserved !== true ||
    metrics.headlessParticipantUsed !== true ||
    metrics.backgrounded !== false ||
    metrics.foregrounded !== false ||
    metrics.backgroundForegroundRecovery !== false ||
    metrics.networkState !== "ready" ||
    metrics.permissionState !== "granted" ||
    metrics.providerState !== "healthy" ||
    metrics.buildRuntimeMatched !== true ||
    metrics.cleanupDisconnected !== true ||
    metrics.connectingResolved !== true
  ) {
    return false;
  }
  const common = {
    firstAudioVideoObserved: false,
    remoteMediaKind: "none",
    remoteTrackSubscribed: false,
  };
  const byType = {
    controlled_test_endpoint_timeout: {
      ...common,
      iceCheckingObserved: false,
      iceGatheringObserved: false,
      iceState: "unknown",
      localTrackPublished: false,
      peerConnectionEstablished: false,
      remoteParticipantJoined: false,
      roomConnected: false,
      tokenReturned: true,
      websocketConnected: false,
    },
    participant_disconnect_at_room_connected: {
      ...common,
      iceState: "connected",
      localTrackPublished: true,
      peerConnectionEstablished: true,
      remoteParticipantJoined: false,
      roomConnected: true,
      tokenReturned: true,
      websocketConnected: true,
    },
    remote_join_without_publish: {
      ...common,
      iceState: "connected",
      localTrackPublished: true,
      peerConnectionEstablished: true,
      remoteParticipantJoined: true,
      roomConnected: true,
      tokenReturned: true,
      websocketConnected: true,
    },
    remote_publication_cancelled: {
      ...common,
      iceState: "connected",
      localTrackPublished: true,
      peerConnectionEstablished: true,
      remoteParticipantJoined: true,
      roomConnected: true,
      tokenReturned: true,
      websocketConnected: true,
    },
  };
  return invariant(
    metrics,
    byType[fixtureReadback.fixtureRecord.fixtureType] ?? {},
  );
};

export const LIVEKIT_FAILURE_FIXTURE_TYPES = Object.freeze(
  Object.keys(FIXTURE_CONDITIONS).sort(),
);
