import {
  canonicalMetricHash,
  classifyLiveKitEvidence,
  deriveLiveKitFailureCategory,
  handler,
  type LiveKitMetricManifest,
} from "./index.ts";

const fixtureHash = async (value: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const AUTHORIZATION = "Bearer synthetic.header.signature";

const baseline = (): LiveKitMetricManifest => {
  const now = Date.now();
  return {
    backgroundForegroundRecovery: true,
    backgrounded: true,
    buildRuntimeMatched: true,
    cleanupDisconnected: true,
    connectingResolved: true,
    firstAudioVideoObserved: true,
    firstRemoteMediaElapsedMs: 1_800,
    foregrounded: true,
    headlessParticipantUsed: true,
    headlessObservationFinishedAt: new Date(now).toISOString(),
    headlessObservationStartedAt: new Date(now - 1_000).toISOString(),
    headlessParticipantIdentityHash: "b".repeat(64),
    iceCheckingObserved: true,
    iceGatheringObserved: true,
    iceState: "connected",
    installedUiEvidenceHash: "a".repeat(64),
    installedUiObserved: true,
    installedObservationFinishedAt: new Date(now - 100).toISOString(),
    installedObservationStartedAt: new Date(now - 900).toISOString(),
    installedParticipantIdentityHash: "c".repeat(64),
    installedRuntimeIdentityHash: awaitableHashes.runtime,
    installedRoomRunCorrelationHash: "d".repeat(64),
    installedSourceBuildHash: awaitableHashes.sourceBuild,
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
    roomConnectElapsedMs: 900,
    roomConnected: true,
    roomRunCorrelationHash: "d".repeat(64),
    stageFailureCategory: "none",
    tokenClaimsValidated: true,
    tokenIssuedElapsedMs: 120,
    tokenRequestStarted: true,
    tokenRequested: true,
    tokenResultStatus: "success",
    tokenReturned: true,
    uiStateResolutionElapsedMs: 1_100,
    websocketConnected: true,
  };
};

const awaitableHashes = {
  runtime: await fixtureHash("runtime"),
  sourceBuild: await fixtureHash("source-build"),
};

const packet = async (
  metricManifest: LiveKitMetricManifest,
  action = "prepare_run",
) => {
  const evidenceManifestHash = await canonicalMetricHash(metricManifest);
  const observationStartedAt = [
    metricManifest.headlessObservationStartedAt,
    metricManifest.installedObservationStartedAt,
  ].filter((value): value is string => value !== null)
    .sort()[0];
  const observationFinishedAt = [
    metricManifest.headlessObservationFinishedAt,
    metricManifest.installedObservationFinishedAt,
  ].filter((value): value is string => value !== null)
    .sort().at(-1);
  return {
    action,
    evidenceManifestHash,
    metricManifest: {
      evidenceHashes: [evidenceManifestHash],
      metrics: metricManifest,
      observationKind: "livekit_experience",
      sanitizationVersion: "bounded-nonpersonal-v1",
      schemaVersion: "product-sentinel-v1",
    },
    observationFinishedAt,
    observationStartedAt,
    routeOrSurface: "live-stage",
    runtimeIdentityHash: awaitableHashes.runtime,
    sourceBuildHash: awaitableHashes.sourceBuild,
  };
};

const invokePrepare = async (
  payload: Record<string, unknown>,
  authorization = AUTHORIZATION,
) => {
  const invocation = "synthetic-livekit-sentinel-invocation";
  Deno.env.set(
    "COGNITIVE_LIVEKIT_SENTINEL_INVOKE_SHA256",
    await fixtureHash(invocation),
  );
  try {
    return await handler(
      new Request("http://localhost/collector", {
        body: JSON.stringify(payload),
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          "x-cognitive-livekit-sentinel-invocation": invocation,
        },
        method: "POST",
      }),
    );
  } finally {
    Deno.env.delete("COGNITIVE_LIVEKIT_SENTINEL_INVOKE_SHA256");
  }
};

Deno.test("LiveKit collector separates healthy media and installed UI proof", () => {
  const evidence = baseline();
  const classification = classifyLiveKitEvidence(evidence);
  if (classification.resultStatus !== "passed") {
    throw new Error("expected installed healthy evidence to pass");
  }
  if (classification.physicalProofStatus !== "installed_ui_observed") {
    throw new Error("expected installed UI proof status");
  }
});

Deno.test("headless-only evidence never claims installed UI pass", () => {
  const evidence = {
    ...baseline(),
    installedObservationFinishedAt: null,
    installedObservationStartedAt: null,
    installedParticipantIdentityHash: null,
    installedRoomRunCorrelationHash: null,
    installedRuntimeIdentityHash: null,
    installedSourceBuildHash: null,
    installedUiEvidenceHash: null,
    installedUiObserved: false,
    participantIdentityDistinct: false,
  } satisfies LiveKitMetricManifest;
  const classification = classifyLiveKitEvidence(evidence);
  if (classification.resultStatus !== "blocked") {
    throw new Error("headless-only evidence must remain blocked");
  }
  if (classification.physicalProofStatus !== "source_only") {
    throw new Error("headless-only evidence must remain source-only");
  }
});

Deno.test("media flow with unresolved Connecting is an installed UI failure", () => {
  const evidence = {
    ...baseline(),
    connectingResolved: false,
    stageFailureCategory: "installed_ui_connecting_stuck",
  } satisfies LiveKitMetricManifest;
  const classification = classifyLiveKitEvidence(evidence);
  if (classification.failureCategory !== "installed_ui_connecting_stuck") {
    throw new Error("expected installed UI Connecting classification");
  }
  if (classification.resultStatus !== "failed") {
    throw new Error("expected failed run pending governed triage");
  }
});

Deno.test("ICE failure is distinct from room and token failure", () => {
  const evidence = {
    ...baseline(),
    iceState: "failed",
    roomConnected: false,
    stageFailureCategory: "ice_turn_failure",
  } satisfies LiveKitMetricManifest;
  if (deriveLiveKitFailureCategory(evidence) !== "ice_turn_failure") {
    throw new Error("expected ICE/TURN classification");
  }
});

Deno.test("canonical evidence hashes ignore object insertion order", async () => {
  const evidence = baseline();
  const reversed = Object.fromEntries(
    Object.entries(evidence).reverse(),
  ) as LiveKitMetricManifest;
  if (
    await canonicalMetricHash(evidence) !== await canonicalMetricHash(reversed)
  ) {
    throw new Error("canonical evidence hash changed with key order");
  }
});

Deno.test("collector prepare action requires its private invocation", async () => {
  const evidence = baseline();
  const payload = await packet(evidence);
  const missing = await handler(
    new Request("http://localhost/collector", {
      body: JSON.stringify(payload),
      headers: { Authorization: AUTHORIZATION },
      method: "POST",
    }),
  );
  if (missing.status !== 401) {
    throw new Error("collector accepted a request without private invocation");
  }

  const invocation = "synthetic-livekit-sentinel-invocation";
  Deno.env.set(
    "COGNITIVE_LIVEKIT_SENTINEL_INVOKE_SHA256",
    await fixtureHash(invocation),
  );
  try {
    const prepared = await handler(
      new Request("http://localhost/collector", {
        body: JSON.stringify(payload),
        headers: {
          Authorization: AUTHORIZATION,
          "Content-Type": "application/json",
          "x-cognitive-livekit-sentinel-invocation": invocation,
        },
        method: "POST",
      }),
    );
    if (prepared.status !== 200) {
      throw new Error(`prepare failed with ${prepared.status}`);
    }
    const body = await prepared.json();
    if (
      body.persisted !== false || body.independentEvaluationRequired !== true
    ) {
      throw new Error("prepare action overstated persistence or evaluation");
    }
  } finally {
    Deno.env.delete("COGNITIVE_LIVEKIT_SENTINEL_INVOKE_SHA256");
  }
});

Deno.test("collector requires bearer authorization shape before invocation", async () => {
  const payload = await packet(baseline());
  const missing = await handler(
    new Request("http://localhost/collector", {
      body: JSON.stringify(payload),
      method: "POST",
    }),
  );
  if (missing.status !== 401) {
    throw new Error("collector accepted missing bearer authorization");
  }
  const malformed = await invokePrepare(payload, "Basic synthetic");
  if (malformed.status !== 401) {
    throw new Error("collector accepted malformed bearer authorization");
  }
});

Deno.test("collector rejects unrelated session correlation evidence", async () => {
  const evidence = {
    ...baseline(),
    installedRoomRunCorrelationHash: "e".repeat(64),
  } satisfies LiveKitMetricManifest;
  const response = await invokePrepare(await packet(evidence));
  if (response.status !== 400) {
    throw new Error("collector accepted unrelated session evidence");
  }
});

Deno.test("collector rejects stale installed and headless evidence", async () => {
  const staleNow = Date.now() - 10 * 60 * 1_000;
  const evidence = {
    ...baseline(),
    headlessObservationFinishedAt: new Date(staleNow).toISOString(),
    headlessObservationStartedAt: new Date(staleNow - 1_000).toISOString(),
    installedObservationFinishedAt: new Date(staleNow - 100).toISOString(),
    installedObservationStartedAt: new Date(staleNow - 900).toISOString(),
  } satisfies LiveKitMetricManifest;
  const response = await invokePrepare(await packet(evidence));
  if (response.status !== 400) {
    throw new Error("collector accepted stale session evidence");
  }
});

Deno.test("collector rejects same-identity participants", async () => {
  const evidence = {
    ...baseline(),
    installedParticipantIdentityHash: "b".repeat(64),
    participantIdentityDistinct: false,
  } satisfies LiveKitMetricManifest;
  const response = await invokePrepare(await packet(evidence));
  if (response.status !== 400) {
    throw new Error("collector accepted same-identity participants");
  }
});

Deno.test("collector rejects installed source/runtime mismatch", async () => {
  const evidence = {
    ...baseline(),
    installedRuntimeIdentityHash: "f".repeat(64),
  } satisfies LiveKitMetricManifest;
  const response = await invokePrepare(await packet(evidence));
  if (response.status !== 400) {
    throw new Error("collector accepted mismatched installed runtime evidence");
  }
});
