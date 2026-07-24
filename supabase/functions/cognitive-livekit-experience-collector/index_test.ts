import {
  type LiveKitMetricManifest,
  canonicalMetricHash,
  classifyLiveKitEvidence,
  deriveLiveKitFailureCategory,
  handler,
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

const baseline = (): LiveKitMetricManifest => ({
  backgroundForegroundRecovery: true,
  backgrounded: true,
  buildRuntimeMatched: true,
  cleanupDisconnected: true,
  connectingResolved: true,
  firstAudioVideoObserved: true,
  firstRemoteMediaElapsedMs: 1_800,
  foregrounded: true,
  headlessParticipantUsed: true,
  iceCheckingObserved: true,
  iceGatheringObserved: true,
  iceState: "connected",
  installedUiEvidenceHash: "a".repeat(64),
  installedUiObserved: true,
  localMediaSource: "test_tone",
  localTrackPublished: true,
  networkState: "ready",
  peerConnectionEstablished: true,
  permissionState: "granted",
  providerState: "healthy",
  remoteMediaKind: "audio",
  remoteParticipantJoined: true,
  remoteTrackSubscribed: true,
  roomConnectElapsedMs: 900,
  roomConnected: true,
  stageFailureCategory: "none",
  tokenIssuedElapsedMs: 120,
  tokenRequestStarted: true,
  tokenRequested: true,
  tokenResultStatus: "success",
  tokenReturned: true,
  uiStateResolutionElapsedMs: 1_100,
  websocketConnected: true,
});

const packet = async (
  metricManifest: LiveKitMetricManifest,
  action = "prepare_run",
) => {
  const evidenceManifestHash = await canonicalMetricHash(metricManifest);
  const observationStartedAt = new Date(Date.now() - 1_000).toISOString();
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
    observationFinishedAt: new Date().toISOString(),
    observationStartedAt,
    routeOrSurface: "live-stage",
    runtimeIdentityHash: await fixtureHash("runtime"),
    sourceBuildHash: await fixtureHash("source-build"),
  };
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
    installedUiEvidenceHash: null,
    installedUiObserved: false,
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
    if (body.persisted !== false || body.independentEvaluationRequired !== true) {
      throw new Error("prepare action overstated persistence or evaluation");
    }
  } finally {
    Deno.env.delete("COGNITIVE_LIVEKIT_SENTINEL_INVOKE_SHA256");
  }
});
