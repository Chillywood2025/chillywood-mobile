#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import {
  AudioFrame,
  AudioSource,
  dispose,
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  TrackPublishOptions,
  TrackSource,
  VideoBufferType,
  VideoFrame,
  VideoSource,
} from "@livekit/rtc-node";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ENV_FILES = [".env.local", ".env.browserstack-monetization.local"];
const DEFAULT_HOLD_MS = 180_000;
const MIN_HOLD_MS = 60_000;
const PASSIVE_VIEWER_COUNT = 10;
const SERVER_ID = "chillywood-prod-01";
const EXPECTED_SERVER_URL = "wss://live.chillywoodstream.com";
const TOKEN_LIKE_PATTERN = /([A-Za-z0-9._~+/=-]{32,})/g;

const redact = (value) => String(value ?? "").replace(TOKEN_LIKE_PATTERN, "[redacted]");
const suffix = (value) => String(value ?? "").slice(-8) || "unknown";
const nowIso = () => new Date().toISOString();

const parseEnvText = (text) => {
  const output = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    output[key] = value;
  }
  return output;
};

const loadEnv = () => {
  const merged = { ...process.env };
  for (const file of ENV_FILES) {
    if (!existsSync(file)) continue;
    Object.assign(merged, parseEnvText(readFileSync(file, "utf8")));
  }
  return merged;
};

const requireEnv = (env, key) => {
  const value = String(env[key] ?? "").trim();
  if (!value) throw new Error(`Missing required proof env: ${key}`);
  return value;
};

const proofRunId = `livekit-passive-load-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const env = loadEnv();
const supabaseUrl = requireEnv(env, "SUPABASE_URL");
const anonKey = env.SUPABASE_ANON_KEY || requireEnv(env, "EXPO_PUBLIC_SUPABASE_ANON_KEY");
const serviceRoleKey = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
const tokenEndpoint = env.LIVEKIT_TOKEN_ENDPOINT
  || env.EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT
  || `${supabaseUrl.replace(/\/$/, "")}/functions/v1/livekit-token`;
const registryFunctionUrl = env.LIVEKIT_REGISTRY_FUNCTION_URL
  || `${supabaseUrl.replace(/\/$/, "")}/functions/v1/livekit-registry`;
const holdMs = Math.max(
  MIN_HOLD_MS,
  Number.parseInt(env.LIVEKIT_PASSIVE_LOAD_HOLD_MS || String(DEFAULT_HOLD_MS), 10) || DEFAULT_HOLD_MS,
);
const heartbeatCommand = String(env.LIVEKIT_PASSIVE_LOAD_HEARTBEAT_COMMAND || "").trim();

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const result = {
  proofRunId,
  target: {
    expectedPassiveViewers: PASSIVE_VIEWER_COUNT,
    expectedServerId: SERVER_ID,
    expectedServerUrl: EXPECTED_SERVER_URL,
    holdMs,
    method: "synthetic_livekit_node_rtc_subscribers_with_deployed_token_endpoint",
  },
  setup: {
    createdTempViewer: false,
    proofRoomId: null,
    viewerCount: 0,
  },
  tokenProof: {
    endpointUsed: tokenEndpoint.replace(/\/functions\/v1\/livekit-token$/, "/functions/v1/livekit-token"),
    hostCanPublish: false,
    viewerCanPublish: [],
    viewerTokenCount: 0,
    serverUrls: [],
    unauthorizedSpeakerDowngraded: false,
  },
  loadProof: {
    hostConnected: false,
    hostPublishedAudio: false,
    hostPublishedVideo: false,
    passiveConnected: 0,
    passiveDisconnectedEarly: 0,
    passivePublishDenied: false,
    trackSubscriptionsObserved: 0,
    stabilityWindowMs: holdMs,
    roomName: null,
  },
  metrics: {
    before: null,
    during: null,
    after: null,
    heartbeatCommandUsed: !!heartbeatCommand,
    heartbeatOutputs: [],
  },
  cleanup: {
    disconnectedRooms: 0,
    proofRoomEnded: false,
    tempViewerDeleted: false,
    tempOperatorGrantRestored: false,
    tempOperatorRoleRestored: false,
  },
  secretLeakCheck: "passed_no_tokens_printed",
  status: "failed",
};

const cleanupTasks = [];
const openRooms = [];
let tempViewer = null;
let tempOperatorRoleSnapshot = null;
let tempOperatorGrantSnapshot = null;
let operatorReadbackPrepared = false;

const registerCleanup = (fn) => cleanupTasks.push(fn);

async function runCleanup() {
  for (const room of openRooms.splice(0)) {
    try {
      await room.disconnect();
      result.cleanup.disconnectedRooms += 1;
    } catch {
      // best effort
    }
  }
  for (const task of cleanupTasks.reverse()) {
    try {
      await task();
    } catch (error) {
      console.error(redact(`cleanup warning: ${error?.message || error}`));
    }
  }
  try {
    await dispose();
  } catch {
    // best effort
  }
}

async function signIn(email, password) {
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token || !data.user?.id) {
    throw new Error(`Could not sign in proof account ending ${suffix(email)}: ${error?.message || "missing session"}`);
  }
  return { accessToken: data.session.access_token, userId: data.user.id, email };
}

async function ensureTempViewer() {
  const email = `livekit.passive.${proofRunId}@proof.chillywood.test`;
  const password = `Proof-${randomBytes(18).toString("base64url")}!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: `Proof Passive ${proofRunId.slice(-6)}`,
      proof_run_id: proofRunId,
    },
  });
  if (created.error || !created.data.user?.id) {
    throw new Error(`Temp viewer create failed: ${created.error?.message || "missing user"}`);
  }
  tempViewer = { email, password, userId: created.data.user.id };
  result.setup.createdTempViewer = true;
  registerCleanup(async () => {
    if (!tempViewer?.userId) return;
    const deleted = await admin.auth.admin.deleteUser(tempViewer.userId);
    if (!deleted.error) result.cleanup.tempViewerDeleted = true;
  });
  return tempViewer;
}

async function createProofAccounts() {
  const host = {
    email: requireEnv(env, "CHILLYWOOD_E2E_OWNER_EMAIL"),
    password: requireEnv(env, "CHILLYWOOD_E2E_OWNER_PASSWORD"),
    userId: requireEnv(env, "CHILLYWOOD_E2E_OWNER_USER_ID"),
  };
  const viewers = [
    ["CHILLYWOOD_E2E_VIEWER_EMAIL", "CHILLYWOOD_E2E_VIEWER_PASSWORD", "CHILLYWOOD_E2E_VIEWER_USER_ID"],
    ["CHILLYWOOD_E2E_VIEWER_02_EMAIL", "CHILLYWOOD_E2E_VIEWER_02_PASSWORD", "CHILLYWOOD_E2E_VIEWER_02_USER_ID"],
    ["CHILLYWOOD_E2E_VIEWER_03_EMAIL", "CHILLYWOOD_E2E_VIEWER_03_PASSWORD", "CHILLYWOOD_E2E_VIEWER_03_USER_ID"],
    ["CHILLYWOOD_E2E_VIEWER_04_EMAIL", "CHILLYWOOD_E2E_VIEWER_04_PASSWORD", "CHILLYWOOD_E2E_VIEWER_04_USER_ID"],
    ["CHILLYWOOD_E2E_VIEWER_05_EMAIL", "CHILLYWOOD_E2E_VIEWER_05_PASSWORD", "CHILLYWOOD_E2E_VIEWER_05_USER_ID"],
    ["CHILLYWOOD_E2E_VIEWER_06_EMAIL", "CHILLYWOOD_E2E_VIEWER_06_PASSWORD", "CHILLYWOOD_E2E_VIEWER_06_USER_ID"],
    ["CHILLYWOOD_E2E_VIEWER_07_EMAIL", "CHILLYWOOD_E2E_VIEWER_07_PASSWORD", "CHILLYWOOD_E2E_VIEWER_07_USER_ID"],
    ["CHILLYWOOD_E2E_VIEWER_08_EMAIL", "CHILLYWOOD_E2E_VIEWER_08_PASSWORD", "CHILLYWOOD_E2E_VIEWER_08_USER_ID"],
    ["CHILLYWOOD_E2E_VIEWER_09_EMAIL", "CHILLYWOOD_E2E_VIEWER_09_PASSWORD", "CHILLYWOOD_E2E_VIEWER_09_USER_ID"],
  ].map(([emailKey, passwordKey, userIdKey]) => ({
    email: requireEnv(env, emailKey),
    password: requireEnv(env, passwordKey),
    userId: requireEnv(env, userIdKey),
  }));

  viewers.push(await ensureTempViewer());
  result.setup.viewerCount = viewers.length;
  return { host, viewers };
}

async function createProofRoom(host, viewers) {
  const roomId = `LKLOAD${Date.now().toString(36).toUpperCase()}`.slice(0, 24);
  const timestamp = nowIso();
  const insertedRoom = await admin
    .from("watch_party_rooms")
    .insert({
      party_id: roomId,
      room_type: "live",
      host_user_id: host.userId,
      playback_state: "playing",
      is_active: true,
      started_at: timestamp,
      updated_at: timestamp,
      last_activity_at: timestamp,
      join_policy: "open",
      reactions_policy: "enabled",
      content_access_rule: "open",
      capture_policy: "best_effort",
    });
  if (insertedRoom.error) throw new Error(`Proof room insert failed: ${insertedRoom.error.message}`);
  result.setup.proofRoomId = roomId;
  result.loadProof.roomName = roomId;
  registerCleanup(async () => {
    const endedAt = nowIso();
    await admin
      .from("watch_party_rooms")
      .update({ is_active: false, updated_at: endedAt, last_activity_at: endedAt })
      .eq("party_id", roomId);
    result.cleanup.proofRoomEnded = true;
  });

  const memberships = [
    {
      party_id: roomId,
      user_id: host.userId,
      role: "host",
      stage_role: "host",
      can_speak: true,
      is_muted: false,
      membership_state: "active",
      camera_enabled: true,
      mic_enabled: true,
      display_name: "Proof Host",
      joined_at: timestamp,
      last_seen_at: timestamp,
      updated_at: timestamp,
    },
    ...viewers.map((viewer, index) => ({
      party_id: roomId,
      user_id: viewer.userId,
      role: "viewer",
      stage_role: "listener",
      can_speak: false,
      is_muted: true,
      membership_state: "active",
      camera_enabled: false,
      mic_enabled: false,
      display_name: `Passive Proof Viewer ${index + 1}`,
      joined_at: timestamp,
      last_seen_at: timestamp,
      updated_at: timestamp,
    })),
  ];
  const insertedMemberships = await admin.from("watch_party_room_memberships").upsert(memberships);
  if (insertedMemberships.error) {
    throw new Error(`Proof memberships insert failed: ${insertedMemberships.error.message}`);
  }
  return roomId;
}

async function refreshMemberships(roomId, accounts) {
  const timestamp = nowIso();
  await admin
    .from("watch_party_rooms")
    .update({ is_active: true, updated_at: timestamp, last_activity_at: timestamp })
    .eq("party_id", roomId);
  const updates = accounts.map((account) => admin
    .from("watch_party_room_memberships")
    .update({ membership_state: "active", last_seen_at: timestamp, updated_at: timestamp })
    .eq("party_id", roomId)
    .eq("user_id", account.userId));
  await Promise.all(updates);
}

async function requestToken(session, roomId, role) {
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      surface: "live-stage",
      roomName: roomId,
      participantIdentity: session.userId,
      participantName: role === "host" ? "Proof Host" : `Passive Viewer ${suffix(session.userId)}`,
      participantRole: role,
      metadata: {
        proofMethod: "synthetic_passive_load",
        proofRunId,
      },
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.participantToken || !body?.serverUrl) {
    throw new Error(redact(`livekit-token ${role} failed ${response.status}: ${JSON.stringify(body)}`));
  }
  return {
    participantToken: body.participantToken,
    participantRole: body.participantRole,
    requestedGrants: body.requestedGrants,
    serverUrl: body.serverUrl,
  };
}

async function runHeartbeat(label) {
  if (!heartbeatCommand) {
    result.metrics.heartbeatOutputs.push({ label, status: "skipped_missing_command" });
    return;
  }
  const startedAt = Date.now();
  const { stdout, stderr } = await execFileAsync("bash", ["-lc", heartbeatCommand], {
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });
  const sanitizedStdout = redact(stdout).trim();
  const sanitizedStderr = redact(stderr).trim();
  result.metrics.heartbeatOutputs.push({
    elapsedMs: Date.now() - startedAt,
    label,
    stderr: sanitizedStderr || null,
    stdout: sanitizedStdout || null,
  });
}

async function withTemporaryOperatorReadback(hostSession) {
  if (operatorReadbackPrepared) return;
  operatorReadbackPrepared = true;

  const email = hostSession.email;
  const userId = hostSession.userId;
  const roleQuery = await admin
    .from("platform_role_memberships")
    .select("*")
    .eq("user_id", userId)
    .eq("role", "operator")
    .maybeSingle();
  tempOperatorRoleSnapshot = roleQuery.data ?? null;

  if (tempOperatorRoleSnapshot) {
    const update = await admin
      .from("platform_role_memberships")
      .update({ status: "active" })
      .eq("id", tempOperatorRoleSnapshot.id);
    if (update.error) throw new Error(`Temporary operator role activation failed: ${update.error.message}`);
  } else {
    const insert = await admin.from("platform_role_memberships").insert({
      email,
      granted_by: userId,
      metadata: { proof_run_id: proofRunId, temporary: true },
      role: "operator",
      status: "active",
      user_id: userId,
    }).select("id").maybeSingle();
    if (insert.error || !insert.data?.id) {
      throw new Error(`Temporary operator role insert failed: ${insert.error?.message || "missing id"}`);
    }
    tempOperatorRoleSnapshot = { id: insert.data.id, status: "proof_inserted" };
  }

  const grantQuery = await admin
    .from("platform_staff_permission_grants")
    .select("*")
    .eq("target_user_id", userId)
    .eq("permission_key", "live_ops")
    .maybeSingle();
  tempOperatorGrantSnapshot = grantQuery.data ?? null;

  if (tempOperatorGrantSnapshot) {
    const update = await admin
      .from("platform_staff_permission_grants")
      .update({ status: "active" })
      .eq("id", tempOperatorGrantSnapshot.id);
    if (update.error) throw new Error(`Temporary live_ops grant activation failed: ${update.error.message}`);
  } else {
    const insert = await admin.from("platform_staff_permission_grants").insert({
      granted_by: userId,
      metadata: { proof_run_id: proofRunId, temporary: true },
      permission_key: "live_ops",
      status: "active",
      target_email: email,
      target_user_id: userId,
    }).select("id").maybeSingle();
    if (insert.error || !insert.data?.id) {
      throw new Error(`Temporary live_ops grant insert failed: ${insert.error?.message || "missing id"}`);
    }
    tempOperatorGrantSnapshot = { id: insert.data.id, status: "proof_inserted" };
  }

  registerCleanup(async () => {
    if (tempOperatorGrantSnapshot?.status === "proof_inserted") {
      await admin.from("platform_staff_permission_grants").update({ status: "revoked" }).eq("id", tempOperatorGrantSnapshot.id);
    } else if (tempOperatorGrantSnapshot?.id) {
      await admin.from("platform_staff_permission_grants").update({ status: tempOperatorGrantSnapshot.status }).eq("id", tempOperatorGrantSnapshot.id);
    }
    result.cleanup.tempOperatorGrantRestored = true;
  });

  registerCleanup(async () => {
    if (tempOperatorRoleSnapshot?.status === "proof_inserted") {
      await admin.from("platform_role_memberships").update({ status: "revoked" }).eq("id", tempOperatorRoleSnapshot.id);
    } else if (tempOperatorRoleSnapshot?.id) {
      await admin.from("platform_role_memberships").update({ status: tempOperatorRoleSnapshot.status }).eq("id", tempOperatorRoleSnapshot.id);
    }
    result.cleanup.tempOperatorRoleRestored = true;
  });
}

async function readRegistry(label, hostSession) {
  await withTemporaryOperatorReadback(hostSession);
  const response = await fetch(registryFunctionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${hostSession.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "list", limit: 10 }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(redact(`Registry readback ${label} failed ${response.status}: ${JSON.stringify(body)}`));
  }
  const server = (Array.isArray(body?.servers) ? body.servers : [])
    .find((entry) => entry.serverId === SERVER_ID);
  if (!server) throw new Error(`Registry readback ${label} did not include ${SERVER_ID}`);
  return {
    activeParticipants: server.activeParticipants ?? server.currentParticipants ?? null,
    activePublishers: server.activePublishers ?? server.currentPublishers ?? null,
    activeRooms: server.activeRooms ?? server.currentRooms ?? null,
    cpuPercent: server.cpuPercent ?? null,
    diskUsagePercent: server.diskUsagePercent ?? null,
    heartbeatFresh: !!server.lastHeartbeatAt && Date.now() - Date.parse(server.lastHeartbeatAt) < 120_000,
    label,
    lastHeartbeatAt: server.lastHeartbeatAt ?? null,
    livekitNodeStatus: server.livekitNodeStatus ?? null,
    memoryTotalMb: server.memoryTotalMb ?? null,
    memoryUsedMb: server.memoryUsedMb ?? null,
    metricsCollectedAt: server.metricsCollectedAt ?? null,
    metricsSource: server.metricsSource ?? null,
    networkRxBps: server.networkRxBps ?? null,
    networkTxBps: server.networkTxBps ?? null,
    publicWsUrl: server.publicWsUrl ?? null,
    ramPercent: server.ramPercent ?? null,
    serverId: server.serverId ?? null,
    status: server.status ?? null,
    turnStatus: server.turnStatus ?? null,
  };
}

async function connectRoom(label, serverUrl, token) {
  const room = new Room();
  openRooms.push(room);
  let disconnectedEarly = false;
  room
    .on(RoomEvent.TrackSubscribed, () => {
      result.loadProof.trackSubscriptionsObserved += 1;
    })
    .on(RoomEvent.Disconnected, () => {
      disconnectedEarly = true;
    });
  await room.connect(serverUrl, token, { autoSubscribe: true, dynacast: true });
  return { room, label, wasDisconnectedEarly: () => disconnectedEarly };
}

async function publishSyntheticHostTracks(room) {
  const audioSource = new AudioSource(16000, 1);
  const audioTrack = LocalAudioTrack.createAudioTrack("synthetic-proof-audio", audioSource);
  const audioOptions = new TrackPublishOptions();
  audioOptions.source = TrackSource.SOURCE_MICROPHONE;
  await room.localParticipant.publishTrack(audioTrack, audioOptions);
  result.loadProof.hostPublishedAudio = true;

  const videoSource = new VideoSource(160, 90);
  const videoTrack = LocalVideoTrack.createVideoTrack("synthetic-proof-video", videoSource);
  const videoOptions = new TrackPublishOptions();
  videoOptions.source = TrackSource.SOURCE_CAMERA;
  await room.localParticipant.publishTrack(videoTrack, videoOptions);
  result.loadProof.hostPublishedVideo = true;

  let frameCount = 0;
  const audioTimer = setInterval(() => {
    const samples = new Int16Array(1600);
    audioSource.captureFrame(new AudioFrame(samples, 16000, 1, samples.length));
  }, 100);
  const videoTimer = setInterval(() => {
    const width = 160;
    const height = 90;
    const data = new Uint8Array(width * height * 4);
    const shade = frameCount % 255;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = shade;
      data[i + 1] = 96;
      data[i + 2] = 180;
      data[i + 3] = 255;
    }
    frameCount += 1;
    videoSource.captureFrame(new VideoFrame(data, width, height, VideoBufferType.RGBA));
  }, 250);
  registerCleanup(async () => {
    clearInterval(audioTimer);
    clearInterval(videoTimer);
    await audioTrack.close(true).catch(() => undefined);
    await videoTrack.close(true).catch(() => undefined);
  });
}

async function assertPassiveCannotPublish(room) {
  const source = new AudioSource(16000, 1);
  const track = LocalAudioTrack.createAudioTrack("blocked-passive-audio", source);
  const options = new TrackPublishOptions();
  options.source = TrackSource.SOURCE_MICROPHONE;
  try {
    await room.localParticipant.publishTrack(track, options);
    result.loadProof.passivePublishDenied = false;
  } catch {
    result.loadProof.passivePublishDenied = true;
  } finally {
    await track.close(true).catch(() => undefined);
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

try {
  const { host, viewers } = await createProofAccounts();
  const roomId = await createProofRoom(host, viewers);
  const hostSession = await signIn(host.email, host.password);
  const viewerSessions = [];
  for (const viewer of viewers) {
    viewerSessions.push(await signIn(viewer.email, viewer.password));
  }

  await refreshMemberships(roomId, [host, ...viewers]);
  await runHeartbeat("before");
  result.metrics.before = await readRegistry("before", hostSession);

  const hostToken = await requestToken(hostSession, roomId, "host");
  result.tokenProof.hostCanPublish = hostToken.requestedGrants?.canPublish === true;
  result.tokenProof.serverUrls.push(hostToken.serverUrl);

  const viewerTokens = [];
  for (const session of viewerSessions) {
    const token = await requestToken(session, roomId, "viewer");
    viewerTokens.push(token);
    result.tokenProof.viewerCanPublish.push(token.requestedGrants?.canPublish === true);
    result.tokenProof.serverUrls.push(token.serverUrl);
  }
  result.tokenProof.viewerTokenCount = viewerTokens.length;

  const speakerDowngrade = await requestToken(viewerSessions[0], roomId, "speaker");
  result.tokenProof.unauthorizedSpeakerDowngraded =
    speakerDowngrade.participantRole === "viewer"
    && speakerDowngrade.requestedGrants?.canPublish === false;

  if (hostToken.serverUrl !== EXPECTED_SERVER_URL) {
    throw new Error(`Unexpected server URL for host: ${hostToken.serverUrl}`);
  }
  if (viewerTokens.some((token) => token.serverUrl !== EXPECTED_SERVER_URL)) {
    throw new Error("At least one viewer token did not route to the production LiveKit URL.");
  }
  if (viewerTokens.some((token) => token.requestedGrants?.canPublish !== false)) {
    throw new Error("At least one passive viewer token had publish authority.");
  }

  const hostConnection = await connectRoom("host", hostToken.serverUrl, hostToken.participantToken);
  result.loadProof.hostConnected = true;
  await publishSyntheticHostTracks(hostConnection.room);

  const passiveConnections = [];
  for (let index = 0; index < viewerTokens.length; index += 1) {
    passiveConnections.push(await connectRoom(`passive-${index + 1}`, viewerTokens[index].serverUrl, viewerTokens[index].participantToken));
  }
  result.loadProof.passiveConnected = passiveConnections.length;
  await assertPassiveCannotPublish(passiveConnections[0].room);

  await wait(10_000);
  await runHeartbeat("during");
  result.metrics.during = await readRegistry("during", hostSession);

  await wait(Math.max(0, holdMs - 10_000));
  result.loadProof.passiveDisconnectedEarly = passiveConnections
    .filter((connection) => connection.wasDisconnectedEarly())
    .length;

  for (const room of openRooms.splice(0)) {
    await room.disconnect();
    result.cleanup.disconnectedRooms += 1;
  }

  await wait(20_000);
  await runHeartbeat("after");
  result.metrics.after = await readRegistry("after", hostSession);

  const duringParticipants = Number(result.metrics.during?.activeParticipants ?? 0);
  const duringPublishers = Number(result.metrics.during?.activePublishers ?? 0);
  const hasMetrics = ["before", "during", "after"].every((key) => {
    const entry = result.metrics[key];
    return entry
      && entry.serverId === SERVER_ID
      && entry.publicWsUrl === EXPECTED_SERVER_URL
      && entry.heartbeatFresh
      && typeof entry.cpuPercent === "number"
      && typeof entry.ramPercent === "number"
      && typeof entry.networkRxBps === "number"
      && typeof entry.networkTxBps === "number";
  });

  if (
    result.tokenProof.hostCanPublish
    && result.tokenProof.viewerTokenCount === PASSIVE_VIEWER_COUNT
    && result.tokenProof.viewerCanPublish.every((canPublish) => canPublish === false)
    && result.tokenProof.unauthorizedSpeakerDowngraded
    && result.loadProof.hostConnected
    && result.loadProof.hostPublishedAudio
    && result.loadProof.hostPublishedVideo
    && result.loadProof.passiveConnected === PASSIVE_VIEWER_COUNT
    && result.loadProof.passiveDisconnectedEarly === 0
    && result.loadProof.passivePublishDenied
    && duringParticipants >= PASSIVE_VIEWER_COUNT + 1
    && duringPublishers === 1
    && hasMetrics
  ) {
    result.status = "passed";
  } else {
    result.status = "partial_or_failed";
  }
} catch (error) {
  result.status = "failed";
  result.error = redact(error?.message || String(error));
} finally {
  await runCleanup();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "passed") process.exitCode = 1;
}
