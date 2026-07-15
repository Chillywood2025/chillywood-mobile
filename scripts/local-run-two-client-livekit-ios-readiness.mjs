#!/usr/bin/env node

/**
 * Bounded two-client LiveKit automation harness.
 *
 * This is automated rtc-node evidence, not physical iPhone media proof. The
 * default --self-test mode performs no network activity and needs no secrets.
 * --live is intentionally limited to non-production environments and existing,
 * owner-approved Live Stage/Watch Party rooms. It never creates rooms, changes
 * memberships, or uses service-role/LiveKit server credentials.
 *
 * Live mode requires client A to be the existing room host and client B to be a
 * fresh approved speaker. Tokens are acquired from the repository's authenticated
 * livekit-token boundary so its room, role, block, and account policies remain in
 * force.
 */

import assert from "node:assert/strict";

const MODE_SELF_TEST = "self-test";
const MODE_LIVE = "live";
const ALLOWED_ENVIRONMENTS = new Set(["development", "local", "preview"]);
const ALLOWED_SURFACES = new Set(["live-stage", "watch-party-live"]);
const EXPLICIT_ENV_KEYS = Object.freeze({
  accountAEmail: "CHILLYWOOD_LIVEKIT_HARNESS_ACCOUNT_A_EMAIL",
  accountAPassword: "CHILLYWOOD_LIVEKIT_HARNESS_ACCOUNT_A_PASSWORD",
  accountBEmail: "CHILLYWOOD_LIVEKIT_HARNESS_ACCOUNT_B_EMAIL",
  accountBPassword: "CHILLYWOOD_LIVEKIT_HARNESS_ACCOUNT_B_PASSWORD",
  anonKey: "CHILLYWOOD_LIVEKIT_HARNESS_SUPABASE_ANON_KEY",
  confirmBoundedTest: "CHILLYWOOD_LIVEKIT_HARNESS_CONFIRM_BOUNDED_TEST",
  environment: "CHILLYWOOD_LIVEKIT_HARNESS_ENVIRONMENT",
  holdMs: "CHILLYWOOD_LIVEKIT_HARNESS_HOLD_MS",
  roomName: "CHILLYWOOD_LIVEKIT_HARNESS_ROOM_NAME",
  supabaseUrl: "CHILLYWOOD_LIVEKIT_HARNESS_SUPABASE_URL",
  surface: "CHILLYWOOD_LIVEKIT_HARNESS_SURFACE",
  timeoutMs: "CHILLYWOOD_LIVEKIT_HARNESS_TIMEOUT_MS",
  tokenEndpoint: "CHILLYWOOD_LIVEKIT_HARNESS_TOKEN_ENDPOINT",
});

const sensitiveValues = new Set();

function rememberSensitive(value) {
  const normalized = String(value ?? "").trim();
  if (normalized) sensitiveValues.add(normalized);
  return normalized;
}

function readExplicitEnv(name, { required = false, sensitive = false } = {}) {
  const value = String(process.env[name] ?? "").trim();
  if (required && !value) throw new Error(`missing_required_configuration:${name}`);
  return sensitive ? rememberSensitive(value) : value;
}

function sanitizeDiagnostic(value) {
  let sanitized = String(value ?? "");
  for (const secret of sensitiveValues) {
    if (secret.length >= 4) sanitized = sanitized.split(secret).join("[redacted]");
  }
  return sanitized
    .replace(/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}(?:\.[A-Za-z0-9_-]{8,})?\b/g, "[redacted-jwt]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b(?:https?|wss?):\/\/[^\s"')]+/gi, "[redacted-url]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[redacted-ip]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[redacted-id]")
    .slice(0, 360);
}

function safeErrorCode(error) {
  const raw = error instanceof Error ? error.message : String(error ?? "unknown_failure");
  return sanitizeDiagnostic(raw) || "unknown_failure";
}

function parseBoundedInteger(value, fallback, minimum, maximum, label) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`invalid_bounded_integer:${label}`);
  }
  return parsed;
}

function selectedMode(argv) {
  const wantsLive = argv.includes("--live");
  const wantsSelfTest = argv.includes("--self-test");
  if (wantsLive && wantsSelfTest) throw new Error("choose_exactly_one_mode");
  const unknown = argv.filter((arg) => arg !== "--live" && arg !== "--self-test");
  if (unknown.length) throw new Error("unsupported_argument");
  return wantsLive ? MODE_LIVE : MODE_SELF_TEST;
}

function validateBoundedTarget(environment, surface) {
  if (!ALLOWED_ENVIRONMENTS.has(environment)) throw new Error("production_or_unknown_environment_refused");
  if (!ALLOWED_SURFACES.has(surface)) throw new Error("surface_must_support_two_publishers");
}

function readLiveConfiguration() {
  const environment = readExplicitEnv(EXPLICIT_ENV_KEYS.environment, { required: true }).toLowerCase();
  const supabaseUrl = readExplicitEnv(EXPLICIT_ENV_KEYS.supabaseUrl, { required: true, sensitive: true });
  const anonKey = readExplicitEnv(EXPLICIT_ENV_KEYS.anonKey, { required: true, sensitive: true });
  const accountAEmail = readExplicitEnv(EXPLICIT_ENV_KEYS.accountAEmail, { required: true, sensitive: true });
  const accountAPassword = readExplicitEnv(EXPLICIT_ENV_KEYS.accountAPassword, { required: true, sensitive: true });
  const accountBEmail = readExplicitEnv(EXPLICIT_ENV_KEYS.accountBEmail, { required: true, sensitive: true });
  const accountBPassword = readExplicitEnv(EXPLICIT_ENV_KEYS.accountBPassword, { required: true, sensitive: true });
  const roomName = readExplicitEnv(EXPLICIT_ENV_KEYS.roomName, { required: true, sensitive: true });
  const surface = readExplicitEnv(EXPLICIT_ENV_KEYS.surface, { required: true }).toLowerCase();
  const confirmBoundedTest = readExplicitEnv(EXPLICIT_ENV_KEYS.confirmBoundedTest).toLowerCase();
  const configuredEndpoint = readExplicitEnv(EXPLICIT_ENV_KEYS.tokenEndpoint, { sensitive: true });
  const timeoutMs = parseBoundedInteger(
    readExplicitEnv(EXPLICIT_ENV_KEYS.timeoutMs),
    30_000,
    5_000,
    60_000,
    EXPLICIT_ENV_KEYS.timeoutMs,
  );
  const holdMs = parseBoundedInteger(
    readExplicitEnv(EXPLICIT_ENV_KEYS.holdMs),
    1_500,
    250,
    10_000,
    EXPLICIT_ENV_KEYS.holdMs,
  );

  validateBoundedTarget(environment, surface);
  if (confirmBoundedTest !== "true") throw new Error(`missing_explicit_confirmation:${EXPLICIT_ENV_KEYS.confirmBoundedTest}`);
  if (accountAEmail.toLowerCase() === accountBEmail.toLowerCase()) throw new Error("two_distinct_approved_accounts_required");
  if (roomName.length > 128) throw new Error("room_name_out_of_bounds");

  let supabaseOrigin;
  let tokenEndpoint;
  try {
    const parsedSupabaseUrl = new URL(supabaseUrl);
    if (environment === "local") {
      if (!new Set(["http:", "https:"]).has(parsedSupabaseUrl.protocol)) throw new Error("invalid_local_protocol");
    } else if (parsedSupabaseUrl.protocol !== "https:") {
      throw new Error("remote_supabase_url_must_use_https");
    }
    supabaseOrigin = parsedSupabaseUrl.origin;
    tokenEndpoint = new URL(configuredEndpoint || `${supabaseUrl.replace(/\/$/, "")}/functions/v1/livekit-token`);
  } catch (error) {
    throw new Error(`invalid_endpoint_configuration:${safeErrorCode(error)}`);
  }
  if (tokenEndpoint.origin !== supabaseOrigin) throw new Error("token_endpoint_origin_mismatch");
  if (!tokenEndpoint.pathname.endsWith("/functions/v1/livekit-token")) throw new Error("invalid_token_endpoint_path");
  rememberSensitive(tokenEndpoint.toString());

  return {
    accountA: { email: accountAEmail, password: accountAPassword },
    accountB: { email: accountBEmail, password: accountBPassword },
    anonKey,
    environment,
    holdMs,
    roomName,
    supabaseUrl,
    surface,
    timeoutMs,
    tokenEndpoint: tokenEndpoint.toString(),
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(label, predicate, timeoutMs, pollMs = 75) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await wait(pollMs);
  }
  throw new Error(`timeout:${label}`);
}

function onceEvent(room, event, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      room.off(event, onEvent);
      reject(new Error(`timeout:${label}`));
    }, timeoutMs);
    const onEvent = (...args) => {
      clearTimeout(timer);
      resolve(args);
    };
    room.once(event, onEvent);
  });
}

function mediaKindLabel(kind, TrackKind) {
  if (kind === TrackKind.KIND_AUDIO) return "audio";
  if (kind === TrackKind.KIND_VIDEO) return "video";
  return "other";
}

function hasBothMediaKinds(kinds) {
  return kinds.has("audio") && kinds.has("video");
}

function observeRoom(room, remoteIdentity, rtc) {
  const state = {
    dataMarkers: new Set(),
    localRepublishedKinds: new Set(),
    reconnecting: 0,
    reconnected: 0,
    remoteDepartures: 0,
    subscriptionFailures: 0,
    subscribedKinds: new Set(),
  };

  room
    .on(rtc.RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (participant.identity === remoteIdentity) {
        state.subscribedKinds.add(mediaKindLabel(track.kind, rtc.TrackKind));
      }
    })
    .on(rtc.RoomEvent.TrackSubscriptionFailed, () => {
      state.subscriptionFailures += 1;
    })
    .on(rtc.RoomEvent.Reconnecting, () => {
      state.reconnecting += 1;
    })
    .on(rtc.RoomEvent.Reconnected, () => {
      state.reconnected += 1;
    })
    .on(rtc.RoomEvent.LocalTrackRepublished, (publication) => {
      state.localRepublishedKinds.add(mediaKindLabel(publication.kind, rtc.TrackKind));
    })
    .on(rtc.RoomEvent.ParticipantDisconnected, (participant) => {
      if (participant.identity === remoteIdentity) state.remoteDepartures += 1;
    })
    .on(rtc.RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      if (participant?.identity !== remoteIdentity || topic !== "chillywood-bounded-reconnect-proof") return;
      const marker = new TextDecoder().decode(payload);
      if (marker === "after-reconnect-a" || marker === "after-reconnect-b") state.dataMarkers.add(marker);
    });

  return state;
}

function remoteMediaKinds(room, remoteIdentity, TrackKind) {
  const kinds = new Set();
  for (const participant of room.remoteParticipants.values()) {
    if (participant.identity !== remoteIdentity) continue;
    for (const publication of participant.trackPublications.values()) {
      kinds.add(mediaKindLabel(publication.kind, TrackKind));
    }
  }
  return kinds;
}

async function signInApprovedAccount(createClient, config, account, label) {
  const client = createClient(config.supabaseUrl, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { headers: { "X-Client-Info": "chillywood-bounded-livekit-harness/1" } },
  });
  const { data, error } = await client.auth.signInWithPassword(account);
  if (error || !data.user?.id || !data.session?.access_token) {
    throw new Error(`approved_account_sign_in_failed:${label}:${safeErrorCode(error?.message)}`);
  }
  rememberSensitive(data.user.id);
  rememberSensitive(data.session.access_token);
  return {
    accessToken: data.session.access_token,
    client,
    userId: data.user.id,
  };
}

async function requestBoundedToken(config, session, label, role) {
  const response = await fetch(config.tokenEndpoint, {
    body: JSON.stringify({
      action: "mint-token",
      metadata: {
        automatedNotPhysical: true,
        environment: config.environment,
        proofRun: "two-client-livekit-ios-readiness",
      },
      participantName: `bounded-${label}`,
      role,
      roomName: config.roomName,
      surface: config.surface,
    }),
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      apikey: config.anonKey,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== "object") {
    const serverCode = String(body?.error ?? "token_request_failed").replace(/[^a-z0-9_-]/gi, "").slice(0, 80);
    throw new Error(`bounded_token_denied:${label}:${response.status}:${serverCode || "unknown"}`);
  }
  const participantToken = rememberSensitive(body.participantToken);
  const serverUrl = rememberSensitive(body.serverUrl);
  if (!participantToken || !serverUrl) throw new Error(`bounded_token_missing_fields:${label}`);
  if (body.requestedGrants?.canPublish !== true || body.requestedGrants?.canSubscribe !== true) {
    throw new Error(`approved_publisher_grants_missing:${label}`);
  }
  if (label === "client-a" && body.participantRole !== "host") throw new Error("client_a_must_be_room_host");
  if (label === "client-b" && body.participantRole !== "speaker") throw new Error("client_b_must_be_fresh_approved_speaker");
  return { participantToken, serverUrl };
}

async function connectClient(rtc, serverUrl, participantToken) {
  const room = new rtc.Room();
  await room.connect(serverUrl, participantToken, { autoSubscribe: true, dynacast: true });
  if (!room.isConnected || !room.localParticipant) throw new Error("livekit_connection_not_ready");
  return room;
}

async function publishSyntheticMedia(rtc, room, suffix) {
  const sampleRate = 16_000;
  const audioSource = new rtc.AudioSource(sampleRate, 1);
  const audioTrack = rtc.LocalAudioTrack.createAudioTrack(`bounded-audio-${suffix}`, audioSource);
  const audioOptions = new rtc.TrackPublishOptions();
  audioOptions.source = rtc.TrackSource.SOURCE_MICROPHONE;
  const audioPublication = await room.localParticipant.publishTrack(audioTrack, audioOptions);

  const width = 160;
  const height = 90;
  const videoSource = new rtc.VideoSource(width, height);
  const videoTrack = rtc.LocalVideoTrack.createVideoTrack(`bounded-video-${suffix}`, videoSource);
  const videoOptions = new rtc.TrackPublishOptions();
  videoOptions.source = rtc.TrackSource.SOURCE_CAMERA;
  const videoPublication = await room.localParticipant.publishTrack(videoTrack, videoOptions);

  let captureFailed = false;
  let phase = 0;
  let frameIndex = suffix === "a" ? 0 : 80;
  const captureAudio = () => {
    const samples = new Int16Array(sampleRate / 10);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.round(Math.sin(phase) * 1_200);
      phase += (2 * Math.PI * (suffix === "a" ? 330 : 440)) / sampleRate;
    }
    void audioSource.captureFrame(new rtc.AudioFrame(samples, sampleRate, 1, samples.length)).catch(() => {
      captureFailed = true;
    });
  };
  const captureVideo = () => {
    const data = new Uint8Array(width * height * 4);
    const shade = frameIndex % 255;
    for (let index = 0; index < data.length; index += 4) {
      data[index] = suffix === "a" ? shade : 40;
      data[index + 1] = suffix === "a" ? 60 : shade;
      data[index + 2] = 180;
      data[index + 3] = 255;
    }
    frameIndex += 1;
    videoSource.captureFrame(new rtc.VideoFrame(data, width, height, rtc.VideoBufferType.RGBA));
  };
  captureAudio();
  captureVideo();
  const audioTimer = setInterval(captureAudio, 100);
  const videoTimer = setInterval(captureVideo, 250);
  let stopped = false;

  return {
    captureFailed: () => captureFailed,
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(audioTimer);
      clearInterval(videoTimer);
      if (room.isConnected && room.localParticipant) {
        if (audioPublication.sid) await room.localParticipant.unpublishTrack(audioPublication.sid, true).catch(() => undefined);
        if (videoPublication.sid) await room.localParticipant.unpublishTrack(videoPublication.sid, true).catch(() => undefined);
      }
      await audioTrack.close(true).catch(() => undefined);
      await videoTrack.close(true).catch(() => undefined);
    },
    stopped: () => stopped,
  };
}

async function proveReconnect(rtc, room, observation, remoteObservation, marker, timeoutMs) {
  const reconnecting = onceEvent(room, rtc.RoomEvent.Reconnecting, timeoutMs, `${marker}:reconnecting`);
  const reconnected = onceEvent(room, rtc.RoomEvent.Reconnected, timeoutMs, `${marker}:reconnected`);
  await Promise.all([
    room.simulateScenario(rtc.SimulateScenarioKind.SIMULATE_FULL_RECONNECT),
    reconnecting,
    reconnected,
  ]);
  await waitFor(
    `${marker}:connected_after_reconnect`,
    () => room.connectionState === rtc.ConnectionState.CONN_CONNECTED,
    timeoutMs,
  );
  await room.localParticipant.publishData(new TextEncoder().encode(marker), {
    reliable: true,
    topic: "chillywood-bounded-reconnect-proof",
  });
  await waitFor(`${marker}:post_reconnect_data`, () => remoteObservation.dataMarkers.has(marker), timeoutMs);
  if (!hasBothMediaKinds(observation.localRepublishedKinds)) throw new Error(`media_not_republished:${marker}`);
  await room.getRtcStats();
}

function assertLiveResult(result) {
  assert.equal(result.connectedBoth, true);
  assert.equal(result.publishedBothDirections, true);
  assert.equal(result.subscribedBothDirections, true);
  assert.equal(result.reconnectedBothClients, true);
  assert.equal(result.mediaPresentAfterReconnect, true);
  assert.equal(result.subscriptionFailures, 0);
  assert.equal(result.syntheticCaptureHealthy, true);
  assert.equal(result.leaveObserved, true);
  assert.equal(result.cleanupComplete, true);
}

async function runLiveHarness() {
  const config = readLiveConfiguration();
  const [{ createClient }, rtc] = await Promise.all([
    import("@supabase/supabase-js"),
    import("@livekit/rtc-node"),
  ]);
  const rooms = [];
  const mediaResources = [];
  const sessions = [];
  const result = {
    automatedNotPhysical: true,
    cleanupComplete: false,
    connectedBoth: false,
    leaveObserved: false,
    mediaPresentAfterReconnect: false,
    publishedBothDirections: false,
    reconnectedBothClients: false,
    status: "failed",
    subscribedBothDirections: false,
    subscriptionFailures: 0,
    syntheticCaptureHealthy: false,
  };

  let mediaA;
  let mediaB;
  try {
    const sessionA = await signInApprovedAccount(createClient, config, config.accountA, "client-a");
    const sessionB = await signInApprovedAccount(createClient, config, config.accountB, "client-b");
    sessions.push(sessionA, sessionB);
    if (sessionA.userId === sessionB.userId) throw new Error("two_distinct_authenticated_users_required");

    const [tokenA, tokenB] = await Promise.all([
      requestBoundedToken(config, sessionA, "client-a", "host"),
      requestBoundedToken(config, sessionB, "client-b", "speaker"),
    ]);
    if (tokenA.serverUrl !== tokenB.serverUrl) throw new Error("livekit_routing_assignment_mismatch");

    const [roomA, roomB] = await Promise.all([
      connectClient(rtc, tokenA.serverUrl, tokenA.participantToken),
      connectClient(rtc, tokenB.serverUrl, tokenB.participantToken),
    ]);
    rooms.push(roomA, roomB);
    result.connectedBoth = true;
    const observationA = observeRoom(roomA, sessionB.userId, rtc);
    const observationB = observeRoom(roomB, sessionA.userId, rtc);

    [mediaA, mediaB] = await Promise.all([
      publishSyntheticMedia(rtc, roomA, "a"),
      publishSyntheticMedia(rtc, roomB, "b"),
    ]);
    mediaResources.push(mediaA, mediaB);
    result.publishedBothDirections = true;
    await waitFor(
      "two_way_audio_video_subscription",
      () => hasBothMediaKinds(observationA.subscribedKinds) && hasBothMediaKinds(observationB.subscribedKinds),
      config.timeoutMs,
    );
    result.subscriptionFailures = observationA.subscriptionFailures + observationB.subscriptionFailures;
    result.subscribedBothDirections = result.subscriptionFailures === 0;

    await proveReconnect(rtc, roomA, observationA, observationB, "after-reconnect-a", config.timeoutMs);
    await proveReconnect(rtc, roomB, observationB, observationA, "after-reconnect-b", config.timeoutMs);
    result.reconnectedBothClients = observationA.reconnecting > 0
      && observationA.reconnected > 0
      && observationB.reconnecting > 0
      && observationB.reconnected > 0;
    result.mediaPresentAfterReconnect = hasBothMediaKinds(remoteMediaKinds(roomA, sessionB.userId, rtc.TrackKind))
      && hasBothMediaKinds(remoteMediaKinds(roomB, sessionA.userId, rtc.TrackKind));
    await wait(config.holdMs);
    result.syntheticCaptureHealthy = !mediaA.captureFailed() && !mediaB.captureFailed();

    await mediaA.stop();
    await roomA.disconnect();
    await waitFor("client_a_leave_observed", () => observationB.remoteDepartures > 0, config.timeoutMs);
    await mediaB.stop();
    await roomB.disconnect();
    result.leaveObserved = true;
    result.cleanupComplete = mediaA.stopped()
      && mediaB.stopped()
      && !roomA.isConnected
      && !roomB.isConnected;
    assertLiveResult(result);
    result.status = "passed";
    return result;
  } finally {
    for (const media of mediaResources) await media.stop().catch(() => undefined);
    for (const room of rooms) await room.disconnect().catch(() => undefined);
    for (const session of sessions) await session.client.auth.signOut({ scope: "local" }).catch(() => undefined);
    await rtc.dispose().catch(() => undefined);
  }
}

function runSelfTest() {
  const fakeSecret = rememberSensitive("self-test-secret-value");
  const diagnostic = sanitizeDiagnostic(
    `token=${fakeSecret} user=tester@example.com url=https://example.test/path `
      + "jwt=eyJabcdefghijklmno.abcdefghijklmnop.qwertyuiopasdfgh",
  );
  assert.ok(!diagnostic.includes(fakeSecret));
  assert.ok(!diagnostic.includes("tester@example.com"));
  assert.ok(!diagnostic.includes("https://example.test/path"));
  assert.ok(!diagnostic.includes("eyJabcdefghijklmno"));
  assert.equal(hasBothMediaKinds(new Set(["audio", "video"])), true);
  assert.equal(hasBothMediaKinds(new Set(["audio"])), false);
  assert.equal(selectedMode([]), MODE_SELF_TEST);
  assert.equal(selectedMode(["--self-test"]), MODE_SELF_TEST);
  assert.equal(selectedMode(["--live"]), MODE_LIVE);
  assert.throws(() => selectedMode(["--live", "--self-test"]));
  assert.throws(() => parseBoundedInteger("1", 100, 10, 1_000, "test"));
  assert.doesNotThrow(() => validateBoundedTarget("development", "live-stage"));
  assert.doesNotThrow(() => validateBoundedTarget("preview", "watch-party-live"));
  assert.throws(() => validateBoundedTarget("production", "live-stage"));
  assert.throws(() => validateBoundedTarget("development", "chat-call"));
  assert.doesNotThrow(() => assertLiveResult({
    cleanupComplete: true,
    connectedBoth: true,
    leaveObserved: true,
    mediaPresentAfterReconnect: true,
    publishedBothDirections: true,
    reconnectedBothClients: true,
    subscribedBothDirections: true,
    subscriptionFailures: 0,
    syntheticCaptureHealthy: true,
  }));
  return {
    automatedNotPhysical: true,
    liveNetworkUsed: false,
    mode: MODE_SELF_TEST,
    productionAllowed: false,
    providerMutationPerformed: false,
    secretValuesPrinted: false,
    status: "passed",
    verified: [
      "explicit-mode-selection",
      "redacted-diagnostics",
      "bounded-input-validation",
      "two-way-media-result-contract",
    ],
  };
}

let output;
try {
  const mode = selectedMode(process.argv.slice(2));
  output = mode === MODE_LIVE ? await runLiveHarness() : runSelfTest();
} catch (error) {
  output = {
    automatedNotPhysical: true,
    failure: safeErrorCode(error),
    physicalProofClaimed: false,
    secretValuesPrinted: false,
    status: "failed",
  };
  process.exitCode = 1;
}

console.log(JSON.stringify(output, null, 2));
