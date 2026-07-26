import assert from "node:assert/strict";
import test from "node:test";
import { hashJson } from "../src/contracts.mjs";
import {
  LIVEKIT_COLLECTOR_ADAPTERS,
  prepareLiveKitFixturePacket,
} from "../src/adapters/livekit.mjs";
import {
  issueLiveKitFailureFixture,
  LIVEKIT_FAILURE_FIXTURE_SCHEMA_VERSION,
  readLiveKitFailureFixture,
  validateLiveKitFailureFixtureEvidence,
} from "../src/adapters/livekit-failure-fixture.mjs";
import { RUNTIME_MANIFEST } from "../src/manifest.mjs";

const NOW = Date.parse("2026-07-24T20:00:00.000Z");
const TASK_ID = "00000000-0000-4000-8000-000000000001";
const PROJECT_ID = "00000000-0000-4000-8000-000000000002";
const SOURCE_COMMIT = "1".repeat(40);
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const SECRET = "fixture-hmac-test-key-material-".repeat(2);
const SYNTHETIC_ROOM = "cognitive-test-livekit-baseline";

const context = Object.freeze({
  environment: "production",
  platform: "android",
  projectId: PROJECT_ID,
  sourceCommit: SOURCE_COMMIT,
  taskId: TASK_ID,
});

const issuePayload = (overrides = {}) => ({
  action: "issue_failure_fixture",
  fixtureType: "remote_join_without_publish",
  installedObserverRequired: true,
  requestedTtlSeconds: 120,
  roomRunCorrelationHash: HASH_D,
  syntheticRoomName: SYNTHETIC_ROOM,
  ...overrides,
});

const issue = (overrides = {}) =>
  issueLiveKitFailureFixture({
    context,
    nowMillis: NOW,
    payload: issuePayload(overrides),
    randomBytes: new Uint8Array(32).fill(7),
    secret: SECRET,
  });

const failureMetrics = () => ({
  backgroundForegroundRecovery: false,
  backgrounded: false,
  buildRuntimeMatched: true,
  cleanupDisconnected: true,
  connectingResolved: true,
  firstAudioVideoObserved: false,
  firstRemoteMediaElapsedMs: 0,
  foregrounded: false,
  headlessParticipantUsed: true,
  headlessObservationFinishedAt: new Date(NOW - 5_000).toISOString(),
  headlessObservationStartedAt: new Date(NOW - 20_000).toISOString(),
  headlessParticipantIdentityHash: HASH_A,
  iceCheckingObserved: true,
  iceGatheringObserved: true,
  iceState: "connected",
  installedUiEvidenceHash: HASH_B,
  installedUiObserved: true,
  installedObservationFinishedAt: new Date(NOW - 4_000).toISOString(),
  installedObservationStartedAt: new Date(NOW - 18_000).toISOString(),
  installedParticipantIdentityHash: HASH_C,
  installedRuntimeIdentityHash: HASH_B,
  installedRoomRunCorrelationHash: HASH_D,
  installedSourceBuildHash: HASH_C,
  localMediaSource: "test_tone",
  localTrackPublished: true,
  networkState: "ready",
  participantIdentityDistinct: true,
  peerConnectionEstablished: true,
  permissionState: "granted",
  providerState: "healthy",
  remoteMediaKind: "none",
  remoteParticipantJoined: true,
  remoteTrackSubscribed: false,
  roomConnectElapsedMs: 1_000,
  roomConnected: true,
  roomRunCorrelationHash: HASH_D,
  scenarioType: "bounded_failure_fixture",
  stageFailureCategory: "remote_subscription_failure",
  tokenIssuedElapsedMs: 500,
  tokenRequestStarted: true,
  tokenRequested: true,
  tokenResultStatus: "success",
  tokenReturned: true,
  tokenClaimsValidated: true,
  uiStateResolutionElapsedMs: 1_000,
  websocketConnected: true,
});

const fixtureRunPayload = async (issued, metricOverrides = {}, overrides = {}) => {
  const metrics = { ...failureMetrics(), ...metricOverrides };
  const evidenceManifestHash = await hashJson(metrics);
  return {
    action: "prepare_fixture_run",
    evidenceManifestHash,
    fixtureId: issued.fixtureId,
    fixtureTicket: issued.fixtureTicket,
    metricManifest: {
      evidenceHashes: [
        evidenceManifestHash,
        issued.fixtureAttestationHash,
      ],
      metrics,
      observationKind: "livekit_experience",
      sanitizationVersion: "bounded-nonpersonal-v1",
      schemaVersion: "product-sentinel-v1",
    },
    observationFinishedAt: metrics.installedObservationFinishedAt,
    observationStartedAt: metrics.headlessObservationStartedAt,
    platform: "android",
    routeOrSurface: "live-stage",
    runtimeIdentityHash: HASH_B,
    sourceBuildHash: HASH_C,
    syntheticRoomName: SYNTHETIC_ROOM,
    ...overrides,
  };
};

test("fixture issuer fixes an immutable synthetic-room-only condition", async () => {
  const issued = await issue();
  assert.equal(issued.active, true);
  assert.equal(issued.immutable, true);
  assert.equal(issued.normalUserRoomEligible, false);
  assert.equal(issued.evaluatorReadbackRequired, true);
  assert.match(issued.fixtureId, /^[a-f0-9]{64}$/u);
  assert.match(issued.fixtureAttestationHash, /^[a-f0-9]{64}$/u);
  assert.equal(
    issued.fixtureRecord.schemaVersion,
    LIVEKIT_FAILURE_FIXTURE_SCHEMA_VERSION,
  );
  assert.deepEqual(issued.fixtureRecord.condition, {
    expectedFailureCategory: "remote_subscription_failure",
    injectedCondition: "suppress_remote_publication",
    timeoutMs: 12_000,
    triggerStage: "remote_participant_joined",
  });
  assert.equal(
    JSON.stringify(issued.fixtureRecord).includes(SYNTHETIC_ROOM),
    false,
  );
  assert.equal(JSON.stringify(issued).includes("normal-user"), false);
});

test("isolated fixture issue persists only hashes through its exact wrapper", async () => {
  const calls = [];
  let activeChecks = 0;
  const persisted = await LIVEKIT_COLLECTOR_ADAPTERS.issue_failure_fixture.execute(
    {
      assertActive: async () => {
        activeChecks += 1;
      },
      context,
      database: {
        call: async (statement, parameters) => {
          calls.push({ parameters, statement });
          return {
            active: true,
            fixtureAttestationHash: parameters[6],
            fixtureId: parameters[5],
            issuanceHash: HASH_A,
            principal: "cognitive_livekit_experience_collector",
          };
        },
      },
      env: {
        COGNITIVE_LIVEKIT_FAILURE_FIXTURE_HMAC_KEY: SECRET,
        COGNITIVE_LIVEKIT_SENTINEL_ASSERTION: "sentinel-assertion",
      },
      payload: issuePayload(),
    },
  );
  assert.equal(activeChecks, 1);
  assert.equal(persisted.persisted, true);
  assert.equal(persisted.issuanceHash, HASH_A);
  assert.deepEqual(
    calls.map((entry) => entry.statement),
    ["issueLiveKitFailureFixture"],
  );
  assert.equal(calls[0].parameters.length, 15);
  assert.equal(calls[0].parameters.includes(persisted.fixtureTicket), false);
  assert.equal(
    calls[0].parameters.some((parameter) =>
      typeof parameter === "string" &&
      parameter.includes(persisted.fixtureTicket)
    ),
    false,
  );
});

test("normal user rooms and caller-defined fixture labels are rejected", async () => {
  await assert.rejects(
    issue({ syntheticRoomName: "normal-user-room" }),
    /livekit_fixture_issue_rejected/u,
  );
  await assert.rejects(
    issue({ fixtureType: "caller_selected_failure_label" }),
    /livekit_fixture_issue_rejected/u,
  );
  await assert.rejects(
    issue({ installedObserverRequired: false }),
    /livekit_fixture_issue_rejected/u,
  );
});

test("evaluator readback verifies source, task, expiry, and HMAC integrity", async () => {
  const issued = await issue();
  const readback = await readLiveKitFailureFixture({
    context,
    fixtureId: issued.fixtureId,
    fixtureTicket: issued.fixtureTicket,
    nowMillis: NOW + 1_000,
    secret: SECRET,
  });
  assert.equal(readback.fixtureId, issued.fixtureId);
  assert.equal(
    readback.fixtureAttestationHash,
    issued.fixtureAttestationHash,
  );
  await assert.rejects(
    readLiveKitFailureFixture({
      context: { ...context, taskId: "00000000-0000-4000-8000-000000000003" },
      fixtureId: issued.fixtureId,
      fixtureTicket: issued.fixtureTicket,
      nowMillis: NOW + 1_000,
      secret: SECRET,
    }),
    /livekit_fixture_readback_rejected/u,
  );
  await assert.rejects(
    readLiveKitFailureFixture({
      context,
      fixtureId: issued.fixtureId,
      fixtureTicket: issued.fixtureTicket,
      nowMillis: NOW + 120_000,
      secret: SECRET,
    }),
    /livekit_fixture_expired/u,
  );
});

test("a caller cannot relabel a signed fixture condition", async () => {
  const issued = await issue();
  const [body, signature] = issued.fixtureTicket.split(".");
  const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  decoded.fixtureType = "controlled_test_endpoint_timeout";
  const tamperedBody = Buffer.from(
    JSON.stringify(decoded),
    "utf8",
  ).toString("base64url");
  await assert.rejects(
    readLiveKitFailureFixture({
      context,
      fixtureId: issued.fixtureId,
      fixtureTicket: `${tamperedBody}.${signature}`,
      nowMillis: NOW + 1_000,
      secret: SECRET,
    }),
    /livekit_fixture_readback_rejected/u,
  );
});

test("bounded failure evidence must match the signed condition and room", async () => {
  const issued = await issue();
  const payload = await fixtureRunPayload(issued);
  const prepared = await prepareLiveKitFixturePacket({
    context,
    env: { COGNITIVE_LIVEKIT_FAILURE_FIXTURE_HMAC_KEY: SECRET },
    nowMillis: NOW,
    payload,
  });
  assert.ok(prepared);
  assert.equal(prepared.fixtureId, issued.fixtureId);
  assert.equal(
    prepared.packet.classification.failureCategory,
    "remote_subscription_failure",
  );
  assert.equal(prepared.packet.classification.resultStatus, "failed");

  const relabeled = await fixtureRunPayload(issued, {
    scenarioType: "success_baseline",
  });
  assert.equal(
    await prepareLiveKitFixturePacket({
      context,
      env: { COGNITIVE_LIVEKIT_FAILURE_FIXTURE_HMAC_KEY: SECRET },
      nowMillis: NOW,
      payload: relabeled,
    }),
    null,
  );

  const wrongRoom = await fixtureRunPayload(issued, {}, {
    syntheticRoomName: "cognitive-test-another-room",
  });
  await assert.rejects(
    prepareLiveKitFixturePacket({
      context,
      env: { COGNITIVE_LIVEKIT_FAILURE_FIXTURE_HMAC_KEY: SECRET },
      nowMillis: NOW,
      payload: wrongRoom,
    }),
    /livekit_fixture_plan_required/u,
  );
});

test("fixture evidence requires exact server condition and attestation hash", async () => {
  const issued = await issue();
  const readback = await readLiveKitFailureFixture({
    context,
    fixtureId: issued.fixtureId,
    fixtureTicket: issued.fixtureTicket,
    nowMillis: NOW,
    secret: SECRET,
  });
  assert.equal(
    await validateLiveKitFailureFixtureEvidence({
      fixtureReadback: readback,
      metrics: failureMetrics(),
      syntheticRoomName: SYNTHETIC_ROOM,
    }),
    true,
  );
  assert.equal(
    await validateLiveKitFailureFixtureEvidence({
      fixtureReadback: readback,
      metrics: {
        ...failureMetrics(),
        stageFailureCategory: "remote_participant_missing",
      },
      syntheticRoomName: SYNTHETIC_ROOM,
    }),
    false,
  );
  const missingAttestation = await fixtureRunPayload(issued);
  missingAttestation.metricManifest.evidenceHashes = [
    missingAttestation.evidenceManifestHash,
  ];
  await assert.rejects(
    prepareLiveKitFixturePacket({
      context,
      env: { COGNITIVE_LIVEKIT_FAILURE_FIXTURE_HMAC_KEY: SECRET },
      nowMillis: NOW,
      payload: missingAttestation,
    }),
    /livekit_fixture_plan_required/u,
  );
});

test("fixture record uses one atomic consume-and-collect wrapper", async () => {
  const issued = await issue();
  const payload = await fixtureRunPayload(issued);
  payload.action = "record_fixture_run";
  const calls = [];
  let activeChecks = 0;
  const result = await LIVEKIT_COLLECTOR_ADAPTERS.record_fixture_run.execute({
    assertActive: async () => {
      activeChecks += 1;
    },
    context,
    database: {
      call: async (statement, parameters) => {
        calls.push({ parameters, statement });
        return {
          fixtureAttestationHash: issued.fixtureAttestationHash,
          fixtureConsumed: true,
          fixtureConsumptionHash: HASH_A,
          fixtureId: issued.fixtureId,
          fixtureReceiptHash: HASH_B,
          sentinelRunId: "00000000-0000-4000-8000-000000000003",
        };
      },
    },
    env: {
      COGNITIVE_LIVEKIT_FAILURE_FIXTURE_HMAC_KEY: SECRET,
      COGNITIVE_LIVEKIT_SENTINEL_ASSERTION: "sentinel-assertion",
    },
    nowMillis: NOW,
    payload,
  });
  assert.equal(activeChecks, 1);
  assert.equal(result.persisted, true);
  assert.equal(result.fixtureConsumptionHash, HASH_A);
  assert.equal(result.fixtureReceiptHash, HASH_B);
  assert.deepEqual(
    calls.map((entry) => entry.statement),
    ["consumeLiveKitFailureFixtureAndCollect"],
  );
  assert.equal(calls[0].parameters.length, 22);
  assert.equal(calls[0].parameters.includes(issued.fixtureTicket), false);
  const persistedManifest = JSON.parse(calls[0].parameters[14]);
  assert.deepEqual(persistedManifest.failureFixtureBinding, {
    condition: issued.fixtureRecord.condition,
    fixtureAttestationHash: issued.fixtureAttestationHash,
    fixtureId: issued.fixtureId,
    fixtureType: issued.fixtureRecord.fixtureType,
    principal: "cognitive_livekit_experience_collector",
    roomRunCorrelationHash: issued.fixtureRecord.roomRunCorrelationHash,
    sourceCommit: SOURCE_COMMIT,
    syntheticRoomNameHash: issued.fixtureRecord.syntheticRoomNameHash,
  });
});

test("runtime manifest keeps fixture operations on the isolated LiveKit principal", () => {
  const principal = RUNTIME_MANIFEST.principals.find(
    (entry) => entry.dbRole === "cognitive_livekit_experience_collector",
  );
  assert.ok(principal);
  assert.deepEqual(
    [
      "issue_failure_fixture",
      "prepare_fixture_run",
      "read_failure_fixture",
      "record_fixture_run",
    ].filter((operation) => Object.hasOwn(principal.operations, operation)),
    [
      "issue_failure_fixture",
      "prepare_fixture_run",
      "read_failure_fixture",
      "record_fixture_run",
    ],
  );
  assert.ok(
    principal.requiredSecrets.includes(
      "COGNITIVE_LIVEKIT_FAILURE_FIXTURE_HMAC_KEY",
    ),
  );
  assert.deepEqual(principal.networkEgress, []);
  assert.equal(principal.provider, "none");
  assert.deepEqual(
    LIVEKIT_COLLECTOR_ADAPTERS.issue_failure_fixture.databaseOperations,
    ["issue_livekit_failure_fixture"],
  );
  assert.deepEqual(
    LIVEKIT_COLLECTOR_ADAPTERS.prepare_fixture_run.databaseOperations,
    [],
  );
  assert.deepEqual(
    LIVEKIT_COLLECTOR_ADAPTERS.read_failure_fixture.databaseOperations,
    [],
  );
  assert.deepEqual(
    LIVEKIT_COLLECTOR_ADAPTERS.record_fixture_run.databaseOperations,
    ["consume_livekit_failure_fixture"],
  );
});
