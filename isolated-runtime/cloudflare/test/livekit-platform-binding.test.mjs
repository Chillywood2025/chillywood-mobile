import assert from "node:assert/strict";
import test from "node:test";
import { hashJson, sha256Hex } from "../src/contracts.mjs";
import {
  LIVEKIT_COLLECTOR_ADAPTERS,
  prepareLiveKitPacket,
} from "../src/adapters/livekit.mjs";
import { PRINCIPAL_BY_ID, RUNTIME_MANIFEST } from "../src/manifest.mjs";
import { createPrivateInvocationHandler } from "../src/private-core.mjs";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const TASK_ID = "00000000-0000-4000-8000-000000000001";
const PROJECT_ID = "00000000-0000-4000-8000-000000000002";

const packetFixture = async (platform = "android") => {
  const now = Date.now();
  const metrics = {
    backgroundForegroundRecovery: true,
    backgrounded: true,
    buildRuntimeMatched: true,
    cleanupDisconnected: true,
    connectingResolved: true,
    firstAudioVideoObserved: true,
    firstRemoteMediaElapsedMs: 1_000,
    foregrounded: true,
    headlessParticipantUsed: true,
    headlessObservationFinishedAt: new Date(now - 5_000).toISOString(),
    headlessObservationStartedAt: new Date(now - 20_000).toISOString(),
    headlessParticipantIdentityHash: HASH_A,
    iceCheckingObserved: true,
    iceGatheringObserved: true,
    iceState: "connected",
    installedUiEvidenceHash: HASH_B,
    installedUiObserved: true,
    installedObservationFinishedAt: new Date(now - 4_000).toISOString(),
    installedObservationStartedAt: new Date(now - 18_000).toISOString(),
    installedParticipantIdentityHash: HASH_C,
    installedRuntimeIdentityHash: HASH_B,
    installedRoomRunCorrelationHash: HASH_A,
    installedSourceBuildHash: HASH_C,
    localMediaSource: "test_tone",
    localTrackPublished: true,
    networkState: "ready",
    participantIdentityDistinct: true,
    peerConnectionEstablished: true,
    permissionState: "granted",
    providerState: "healthy",
    remoteMediaKind: "audio",
    remoteParticipantJoined: true,
    remoteTrackSubscribed: true,
    roomConnectElapsedMs: 1_000,
    roomConnected: true,
    roomRunCorrelationHash: HASH_A,
    stageFailureCategory: "none",
    tokenIssuedElapsedMs: 500,
    tokenRequestStarted: true,
    tokenRequested: true,
    tokenResultStatus: "success",
    tokenReturned: true,
    tokenClaimsValidated: true,
    uiStateResolutionElapsedMs: 1_000,
    websocketConnected: true,
  };
  const evidenceManifestHash = await hashJson(metrics);
  return {
    action: "record_run",
    evidenceManifestHash,
    metricManifest: {
      evidenceHashes: [evidenceManifestHash],
      metrics,
      observationKind: "livekit_experience",
      sanitizationVersion: "bounded-nonpersonal-v1",
      schemaVersion: "product-sentinel-v1",
    },
    observationFinishedAt: metrics.installedObservationFinishedAt,
    observationStartedAt: metrics.headlessObservationStartedAt,
    platform,
    routeOrSurface: "live-stage",
    runtimeIdentityHash: HASH_B,
    sourceBuildHash: HASH_C,
  };
};

test("LiveKit packets bind to an actual Android or iOS installed observer", async () => {
  const android = await prepareLiveKitPacket(await packetFixture("android"));
  const ios = await prepareLiveKitPacket(await packetFixture("ios"));
  assert.equal(android?.platform, "android");
  assert.equal(ios?.platform, "ios");
  assert.equal(await prepareLiveKitPacket(await packetFixture("shared")), null);
  assert.equal(await prepareLiveKitPacket(await packetFixture("web")), null);
});

test("LiveKit persistence uses the installed observer platform", async () => {
  const payload = await packetFixture("android");
  const calls = [];
  await LIVEKIT_COLLECTOR_ADAPTERS.record_run.execute({
    context: {
      environment: "production",
      platform: "android",
      projectId: PROJECT_ID,
      taskId: TASK_ID,
    },
    database: {
      call: async (statement, parameters) => {
        calls.push({ parameters, statement });
        return { sentinelRunId: "00000000-0000-4000-8000-000000000003" };
      },
    },
    env: { COGNITIVE_LIVEKIT_SENTINEL_ASSERTION: "assertion" },
    payload,
  });
  assert.equal(calls[0].statement, "collectLiveKitSentinelRun");
  assert.equal(calls[0].parameters[2], "android");
  assert.notEqual(calls[0].parameters[2], "shared");
});

test("LiveKit persistence rejects an envelope/platform mismatch", async () => {
  const payload = await packetFixture("android");
  await assert.rejects(
    LIVEKIT_COLLECTOR_ADAPTERS.record_run.execute({
      context: {
        environment: "production",
        platform: "ios",
        projectId: PROJECT_ID,
        taskId: TASK_ID,
      },
      database: { call: async () => assert.fail("database must not be called") },
      env: { COGNITIVE_LIVEKIT_SENTINEL_ASSERTION: "assertion" },
      payload,
    }),
    /livekit_sentinel_payload_rejected/u,
  );
});

test("private Worker propagates the validated envelope platform to LiveKit", async () => {
  const payload = await packetFixture("android");
  payload.action = "prepare_run";
  const now = Date.now();
  const sourceCommit = "d".repeat(40);
  const invocationToken = "bounded-livekit-invocation";
  const principal = PRINCIPAL_BY_ID.get(
    "cognitive_livekit_experience_collector",
  );
  const envelope = {
    deadlineAt: new Date(now + 30_000).toISOString(),
    environment: "production",
    operation: "prepare_run",
    payload,
    payloadHash: await hashJson(payload),
    platform: "android",
    principal: principal.dbRole,
    projectId: PROJECT_ID,
    requestId: "00000000-0000-4000-8000-000000000004",
    schemaVersion: RUNTIME_MANIFEST.schemaVersion,
    sourceCommit,
    taskId: TASK_ID,
  };
  const handler = createPrivateInvocationHandler({
    createDatabase: () => ({
      close: async () => undefined,
      revocationStatus: async () => ({
        databaseAccessRevoked: false,
        principal: principal.dbRole,
      }),
    }),
    env: {
      COGNITIVE_LIVEKIT_EXPERIENCE_COLLECTOR_HYPERDRIVE: {
        connectionString: "postgres://isolated.invalid/db",
      },
      COGNITIVE_LIVEKIT_EXPERIENCE_COLLECTOR_INVOKE_SHA256:
        await sha256Hex(invocationToken),
      COGNITIVE_LIVEKIT_SENTINEL_ASSERTION: "assertion",
      SOURCE_COMMIT: sourceCommit,
      WORKER_VERSION: { id: "test-version" },
    },
    logger: { log() {} },
    now: () => now,
    principal,
    resolveAdapter: (operation) => LIVEKIT_COLLECTOR_ADAPTERS[operation],
  });
  const response = await handler(envelope, invocationToken);
  assert.equal(response.status, "completed");
  assert.equal(response.result.persisted, false);
});
