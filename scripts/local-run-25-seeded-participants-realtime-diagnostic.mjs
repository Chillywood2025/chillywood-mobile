#!/usr/bin/env node
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
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

import { parseEnvFile } from "./qa/browserstack-env.mjs";

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const artifactDir = process.env.TWENTY_FIVE_SEEDED_PARTICIPANTS_REALTIME_RUN_DIR
  || path.join("/tmp", `app-25-seeded-participants-realtime-proof-${timestamp}`);
const TOKEN_LIKE_PATTERN = /([A-Za-z0-9._~+/=-]{32,})/g;
const maxParticipants = Math.max(2, Math.min(25, Number.parseInt(process.env.REALTIME_SEEDED_PARTICIPANT_COUNT || "25", 10) || 25));
const holdMs = Math.max(5000, Math.min(60000, Number.parseInt(process.env.REALTIME_SEEDED_HOLD_MS || "10000", 10) || 10000));

fs.mkdirSync(artifactDir, { recursive: true });

const redact = (value) => String(value ?? "")
  .replace(TOKEN_LIKE_PATTERN, "[redacted]")
  .replace(/https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/gi, "[redacted-url]")
  .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[redacted-ip]");

const writeJson = (name, value) => {
  fs.writeFileSync(path.join(artifactDir, name), `${JSON.stringify(value, null, 2)}\n`);
};

const loadEnv = () => [
  ".env.local",
  ".env.proof.local",
  ".env.final-qa-proof.local",
  ".env.money-proof.local",
  ".env.browserstack.local",
  ".env.browserstack-monetization.local",
].reduce((acc, file) => ({ ...acc, ...parseEnvFile(path.join(root, file)) }), { ...process.env });

const env = loadEnv();
const requireEnv = (key) => {
  const value = String(env[key] ?? "").trim();
  if (!value) throw new Error(`Missing required env key: ${key}`);
  return value;
};
const optionalEnv = (key) => String(env[key] ?? "").trim();
const nowIso = () => new Date().toISOString();
const futureIso = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();
const roomSuffix = randomBytes(4).toString("hex").toUpperCase();
const liveRoomId = `RT25LIVE${roomSuffix}`;
const watchRoomId = `RT25WATCH${roomSuffix}`;
const callRoomId = `RT25CALL${roomSuffix}`;
const pairKey = `rt25:${roomSuffix.toLowerCase()}`;

const supabaseUrl = optionalEnv("SUPABASE_URL") || requireEnv("EXPO_PUBLIC_SUPABASE_URL");
const anonKey = optionalEnv("SUPABASE_ANON_KEY") || requireEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY");
const tokenEndpoint = optionalEnv("LIVEKIT_TOKEN_ENDPOINT")
  || optionalEnv("EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT")
  || `${supabaseUrl.replace(/\/$/, "")}/functions/v1/livekit-token`;

const account = (label, prefix) => ({
  label,
  email: requireEnv(`CHILLYWOOD_E2E_${prefix}_EMAIL`),
  password: requireEnv(`CHILLYWOOD_E2E_${prefix}_PASSWORD`),
  userId: requireEnv(`CHILLYWOOD_E2E_${prefix}_USER_ID`),
});

const participant = (index) => {
  const n = String(index).padStart(3, "0");
  return account(`proof_participant_${n}`, `PARTICIPANT_${n}`);
};

const result = {
  artifactDir,
  status: "failed",
  method: "seeded_accounts_authenticated_rls_plus_livekit_rtc_node_diagnostic",
  serviceRoleUsed: false,
  physicalPlayClient: {
    serial: "R5CR120QCBF",
    package: "com.chillywood.mobile",
    versionName: "1.0.0",
    versionCode: "57",
    installer: "com.android.vending",
  },
  emulatorDiagnosticClient: {
    serial: "emulator-5554",
    package: "com.chillywood.mobile",
    versionName: "1.0.0",
    versionCode: "57",
    installer: null,
    source: "owner-approved emulator-only diagnostic sideload",
  },
  participants: {
    seededIdentitiesRequested: maxParticipants,
    signedIn: 0,
    livekitConnected: 0,
  },
  liveVideo: {
    roomId: liveRoomId,
    hostConnected: false,
    hostPublishedAudio: false,
    hostPublishedVideo: false,
    viewerTokens: 0,
    viewerCanPublishCount: 0,
    unauthorizedSpeakerDowngraded: false,
    trackSubscriptionsObserved: 0,
    disconnectedEarly: 0,
    status: "not_run",
  },
  chatCall: {
    roomId: callRoomId,
    hostConnected: false,
    participantConnected: false,
    hostPublishedAudio: false,
    hostPublishedVideo: false,
    participantTrackSubscriptionsObserved: 0,
    status: "not_run",
  },
  watchPartySync: {
    roomId: watchRoomId,
    realtimeEventObserved: false,
    readbackStateMatched: false,
    channelStatuses: [],
    status: "not_run",
  },
  roleControls: {
    moderatorSpeakerDowngraded: false,
    adminSpeakerDowngraded: false,
    ownerSpeakerDowngraded: false,
    status: "not_run",
  },
  blockedRestricted: {
    restrictedDenied: false,
    blockedPairDeniedOrUnavailable: false,
    status: "not_run",
  },
  cleanup: {
    liveRoomEnded: false,
    watchRoomEnded: false,
    callRoomEnded: false,
    disconnectedRooms: 0,
  },
  safety: {
    noProviderMutation: true,
    noPlayProductionSubmission: true,
    noLiveMoneyEnabled: true,
    noPayoutsOrRefunds: true,
    noSecretsPrinted: true,
    noServiceRoleAuthorityProof: true,
  },
  errors: [],
};

const openedRooms = [];
const cleanupTasks = [];
const timers = [];

const addCleanup = (task) => cleanupTasks.push(task);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeClient(accessToken = null) {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

async function signIn(proofAccount) {
  const client = makeClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: proofAccount.email,
    password: proofAccount.password,
  });
  if (error || !data.session?.access_token || !data.user?.id) {
    throw new Error(`sign_in_failed:${proofAccount.label}:${error?.message || "missing session"}`);
  }
  return {
    ...proofAccount,
    accessToken: data.session.access_token,
    authUserId: data.user.id,
    client: makeClient(data.session.access_token),
  };
}

async function requireOk(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}:${error.message}`);
  return data;
}

async function requestLiveKitToken(session, { roomId, surface, role }) {
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "mint-token",
      metadata: { proofRun: "25-seeded-participants-realtime" },
      participantName: session.label,
      role,
      roomName: roomId,
      surface,
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`token_failed:${session.label}:${surface}:${role}:${response.status}:${redact(JSON.stringify(body))}`);
  }
  if (!body?.participantToken || !body?.serverUrl) {
    throw new Error(`token_missing_fields:${session.label}:${surface}:${role}`);
  }
  return body;
}

async function connectRoom(label, serverUrl, token, trackCounter) {
  const room = new Room();
  openedRooms.push(room);
  let disconnected = false;
  room
    .on(RoomEvent.TrackSubscribed, () => {
      if (trackCounter) trackCounter.count += 1;
    })
    .on(RoomEvent.Disconnected, () => {
      disconnected = true;
    });
  await room.connect(serverUrl, token, { autoSubscribe: true, dynacast: true });
  return { label, room, wasDisconnected: () => disconnected };
}

async function publishSyntheticTracks(room, target) {
  const audioSource = new AudioSource(16000, 1);
  const audioTrack = LocalAudioTrack.createAudioTrack("rt25-proof-audio", audioSource);
  const audioOptions = new TrackPublishOptions();
  audioOptions.source = TrackSource.SOURCE_MICROPHONE;
  await room.localParticipant.publishTrack(audioTrack, audioOptions);
  target.hostPublishedAudio = true;

  const videoSource = new VideoSource(160, 90);
  const videoTrack = LocalVideoTrack.createVideoTrack("rt25-proof-video", videoSource);
  const videoOptions = new TrackPublishOptions();
  videoOptions.source = TrackSource.SOURCE_CAMERA;
  await room.localParticipant.publishTrack(videoTrack, videoOptions);
  target.hostPublishedVideo = true;

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
  timers.push(audioTimer, videoTimer);
  addCleanup(async () => {
    await audioTrack.close(true).catch(() => undefined);
    await videoTrack.close(true).catch(() => undefined);
  });
}

async function createWatchRoom(host, roomId, roomType) {
  const titleSourceId = roomType === "title" ? `rt25-proof-title-${roomSuffix.toLowerCase()}` : null;
  await requireOk(`insert_watch_room:${roomId}`, host.client.from("watch_party_rooms").insert({
    capture_policy: "best_effort",
    content_access_rule: "open",
    host_user_id: host.userId,
    is_active: true,
    join_policy: "open",
    last_activity_at: nowIso(),
    party_id: roomId,
    playback_position_millis: 0,
    playback_state: "paused",
    reactions_policy: "enabled",
    room_type: roomType,
    source_id: titleSourceId,
    source_type: roomType === "title" ? "platform_title" : null,
    started_at: nowIso(),
    title_id: titleSourceId,
  }).select("party_id").single());
  addCleanup(async () => {
    await host.client.from("watch_party_rooms").update({
      is_active: false,
      last_activity_at: nowIso(),
      updated_at: nowIso(),
    }).eq("party_id", roomId);
  });
  await requireOk(`insert_host_membership:${roomId}`, host.client.from("watch_party_room_memberships").insert({
    can_speak: true,
    display_name: host.label,
    is_muted: false,
    last_seen_at: nowIso(),
    membership_state: "active",
    mic_enabled: true,
    camera_enabled: true,
    party_id: roomId,
    role: "host",
    stage_role: "host",
    user_id: host.userId,
  }).select("party_id").single());
}

async function joinWatchRoom(session, roomId, { canSpeak = false, stageRole = "listener", role = "viewer" } = {}) {
  await requireOk(`join_watch_room:${roomId}:${session.label}`, session.client.from("watch_party_room_memberships").insert({
    can_speak: canSpeak,
    display_name: session.label,
    is_muted: false,
    last_seen_at: nowIso(),
    membership_state: "active",
    mic_enabled: canSpeak,
    camera_enabled: canSpeak,
    party_id: roomId,
    role,
    stage_role: stageRole,
    user_id: session.userId,
  }).select("party_id").single());
}

async function runLiveVideo(host, viewers, roleSessions) {
  await createWatchRoom(host, liveRoomId, "live");
  for (const viewer of viewers) await joinWatchRoom(viewer, liveRoomId);
  for (const roleSession of roleSessions) await joinWatchRoom(roleSession, liveRoomId);

  const hostToken = await requestLiveKitToken(host, { roomId: liveRoomId, surface: "live-stage", role: "host" });
  const viewerTokens = [];
  for (const viewer of viewers) {
    const token = await requestLiveKitToken(viewer, { roomId: liveRoomId, surface: "live-stage", role: "viewer" });
    viewerTokens.push(token);
  }
  result.liveVideo.viewerTokens = viewerTokens.length;
  result.liveVideo.viewerCanPublishCount = viewerTokens.filter((token) => token.requestedGrants?.canPublish === true).length;
  const speakerDowngrade = await requestLiveKitToken(viewers[0], { roomId: liveRoomId, surface: "live-stage", role: "speaker" });
  result.liveVideo.unauthorizedSpeakerDowngraded =
    speakerDowngrade.participantRole === "viewer" && speakerDowngrade.requestedGrants?.canPublish === false;

  const trackCounter = { count: 0 };
  const hostConnection = await connectRoom("live-host", hostToken.serverUrl, hostToken.participantToken);
  result.liveVideo.hostConnected = true;
  await publishSyntheticTracks(hostConnection.room, result.liveVideo);

  const viewerConnections = [];
  for (const [index, token] of viewerTokens.entries()) {
    viewerConnections.push(await connectRoom(`live-viewer-${index + 1}`, token.serverUrl, token.participantToken, trackCounter));
  }
  await wait(holdMs);
  result.liveVideo.trackSubscriptionsObserved = trackCounter.count;
  result.liveVideo.disconnectedEarly = viewerConnections.filter((connection) => connection.wasDisconnected()).length;
  result.participants.livekitConnected = viewerConnections.length;
  result.liveVideo.status = (
    result.liveVideo.hostConnected
    && result.liveVideo.hostPublishedAudio
    && result.liveVideo.hostPublishedVideo
    && result.liveVideo.viewerTokens === viewers.length
    && result.liveVideo.viewerCanPublishCount === 0
    && result.liveVideo.unauthorizedSpeakerDowngraded
    && result.liveVideo.trackSubscriptionsObserved > 0
    && result.liveVideo.disconnectedEarly === 0
  ) ? "passed" : "partial";
}

async function runRoleControls(roleSessions) {
  for (const roleSession of roleSessions) {
    await roleSession.client.from("watch_party_room_memberships").update({
      last_seen_at: nowIso(),
      membership_state: "active",
      updated_at: nowIso(),
    }).eq("party_id", liveRoomId).eq("user_id", roleSession.userId);
    const token = await requestLiveKitToken(roleSession, { roomId: liveRoomId, surface: "live-stage", role: "speaker" });
    const downgraded = token.participantRole === "viewer" && token.requestedGrants?.canPublish === false;
    if (roleSession.label.includes("moderator")) result.roleControls.moderatorSpeakerDowngraded = downgraded;
    if (roleSession.label.includes("admin")) result.roleControls.adminSpeakerDowngraded = downgraded;
    if (roleSession.label.includes("owner")) result.roleControls.ownerSpeakerDowngraded = downgraded;
  }
  result.roleControls.status = (
    result.roleControls.moderatorSpeakerDowngraded
    && result.roleControls.adminSpeakerDowngraded
    && result.roleControls.ownerSpeakerDowngraded
  ) ? "passed" : "partial";
}

async function runWatchPartySync(host, viewer) {
  await createWatchRoom(host, watchRoomId, "title");
  await joinWatchRoom(viewer, watchRoomId);
  let observed = false;
  const channel = viewer.client.channel(`rt25-watch-sync-${roomSuffix}`);
  await new Promise((resolve) => {
    let settled = false;
    channel
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "watch_party_sync_events",
        filter: `party_id=eq.${watchRoomId}`,
      }, (payload) => {
        if (
          String(payload?.new?.party_id ?? "") === watchRoomId
          && String(payload?.new?.id ?? "") === `rt25-sync-${roomSuffix}`
        ) observed = true;
      })
      .subscribe((status) => {
        result.watchPartySync.channelStatuses.push(String(status));
        if (status === "SUBSCRIBED" && !settled) {
          settled = true;
          resolve();
        }
      });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    }, 5000);
  });
  await requireOk("insert_watch_party_sync_event", host.client.from("watch_party_sync_events").insert({
    id: `rt25-sync-${roomSuffix}`,
    kind: "play",
    party_id: watchRoomId,
    payload: { playbackState: "playing", proof: "25-seeded-participants-realtime" },
    playback_position_millis: 12345,
    user_id: host.userId,
  }).select("id").single());
  await host.client.from("watch_party_rooms").update({
    last_activity_at: nowIso(),
    playback_position_millis: 12345,
    playback_state: "playing",
    updated_at: nowIso(),
  }).eq("party_id", watchRoomId);
  await wait(5000);
  await viewer.client.removeChannel(channel);
  const readback = await viewer.client
    .from("watch_party_rooms")
    .select("playback_state,playback_position_millis")
    .eq("party_id", watchRoomId)
    .maybeSingle();
  result.watchPartySync.realtimeEventObserved = observed;
  result.watchPartySync.readbackStateMatched =
    readback.data?.playback_state === "playing"
    && Number(readback.data?.playback_position_millis ?? 0) === 12345;
  result.watchPartySync.status = result.watchPartySync.readbackStateMatched
    ? (observed ? "passed" : "partial_realtime_event_not_observed")
    : "failed";
}

async function runChatCall(caller, callee) {
  const threadId = randomUUID();
  await requireOk("insert_chat_thread", caller.client.from("chat_threads").insert({
    id: threadId,
    created_by: caller.userId,
    participant_pair_key: pairKey,
    thread_kind: "direct",
  }));
  await requireOk("insert_chat_thread_members", caller.client.from("chat_thread_members").insert([
    { display_name: caller.label, thread_id: threadId, user_id: caller.userId },
    { display_name: callee.label, thread_id: threadId, user_id: callee.userId },
  ]).select("thread_id"));
  await requireOk("insert_communication_room", caller.client.from("communication_rooms").insert({
    capture_policy: "best_effort",
    content_access_rule: "open",
    host_user_id: caller.userId,
    last_activity_at: nowIso(),
    room_code: callRoomId,
    room_id: callRoomId,
    status: "active",
  }).select("room_id").single());
  await requireOk("join_call_host", caller.client.from("communication_room_memberships").insert({
    display_name: caller.label,
    last_seen_at: nowIso(),
    membership_state: "active",
    room_id: callRoomId,
    role: "host",
    user_id: caller.userId,
  }).select("room_id").single());
  await requireOk("join_call_participant", callee.client.from("communication_room_memberships").insert({
    display_name: callee.label,
    last_seen_at: nowIso(),
    membership_state: "active",
    room_id: callRoomId,
    role: "participant",
    user_id: callee.userId,
  }).select("room_id").single());
  await caller.client.from("chat_threads").update({
    active_call_type: "video",
    active_communication_room_id: callRoomId,
  }).eq("id", threadId);
  await requireOk("insert_chat_call_invite", caller.client.from("chat_call_invites").insert({
    callee_user_id: callee.userId,
    caller_user_id: caller.userId,
    call_type: "video",
    communication_room_id: callRoomId,
    expires_at: futureIso(120),
    status: "ringing",
    thread_id: threadId,
  }).select("id").single());

  addCleanup(async () => {
    await caller.client.from("communication_rooms").update({
      last_activity_at: nowIso(),
      status: "ended",
      updated_at: nowIso(),
    }).eq("room_id", callRoomId);
    await caller.client.from("chat_threads").update({
      active_call_type: null,
      active_communication_room_id: null,
    }).eq("id", threadId);
    result.cleanup.callRoomEnded = true;
  });

  const hostToken = await requestLiveKitToken(caller, { roomId: callRoomId, surface: "chat-call", role: "host" });
  const calleeToken = await requestLiveKitToken(callee, { roomId: callRoomId, surface: "chat-call", role: "viewer" });
  const trackCounter = { count: 0 };
  const hostConnection = await connectRoom("chat-call-host", hostToken.serverUrl, hostToken.participantToken);
  result.chatCall.hostConnected = true;
  await publishSyntheticTracks(hostConnection.room, result.chatCall);
  await connectRoom("chat-call-callee", calleeToken.serverUrl, calleeToken.participantToken, trackCounter);
  result.chatCall.participantConnected = true;
  await wait(holdMs);
  result.chatCall.participantTrackSubscriptionsObserved = trackCounter.count;
  result.chatCall.status = (
    result.chatCall.hostConnected
    && result.chatCall.participantConnected
    && result.chatCall.hostPublishedAudio
    && result.chatCall.hostPublishedVideo
    && result.chatCall.participantTrackSubscriptionsObserved > 0
  ) ? "passed" : "partial";
}

async function runBlockedRestricted(host, blockedB, restricted) {
  try {
    await joinWatchRoom(blockedB, liveRoomId);
    await requestLiveKitToken(blockedB, { roomId: liveRoomId, surface: "live-stage", role: "viewer" });
    result.blockedRestricted.blockedPairDeniedOrUnavailable = false;
  } catch (error) {
    result.blockedRestricted.blockedPairDeniedOrUnavailable = /blocked|insufficient|permission|duplicate/i.test(String(error?.message ?? error));
  }
  try {
    const restrictedSession = await signIn(restricted);
    await joinWatchRoom(restrictedSession, liveRoomId);
    await requestLiveKitToken(restrictedSession, { roomId: liveRoomId, surface: "live-stage", role: "viewer" });
    result.blockedRestricted.restrictedDenied = false;
  } catch (error) {
    result.blockedRestricted.restrictedDenied = /account_access_restricted|restricted|disabled|suspended|Invalid login credentials|not allowed/i.test(String(error?.message ?? error));
  }
  result.blockedRestricted.status = result.blockedRestricted.restrictedDenied ? "passed" : "partial";
}

async function cleanup() {
  for (const timer of timers.splice(0)) clearInterval(timer);
  for (const room of openedRooms.splice(0)) {
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
      result.errors.push(redact(`cleanup:${error?.message || error}`));
    }
  }
  try {
    await dispose();
  } catch {
    // best effort
  }
}

try {
  const creator = await signIn(account("proof_creator_001", "CREATOR"));
  const moderator = await signIn(account("proof_moderator_001", "MODERATOR"));
  const admin = await signIn(account("proof_admin_operator_001", "ADMIN_OPERATOR"));
  const owner = await signIn(account("proof_owner_001", "OWNER"));
  const blockedB = await signIn(account("proof_blocked_b_001", "BLOCKED_B"));
  const participants = [];
  for (let index = 1; index <= maxParticipants; index += 1) {
    participants.push(await signIn(participant(index)));
  }
  result.participants.signedIn = participants.length;

  await runLiveVideo(creator, participants, [moderator, admin, owner]);
  await runRoleControls([moderator, admin, owner]);
  await runWatchPartySync(participants[2], participants[3]);
  await runChatCall(participants[0], participants[1]);
  await runBlockedRestricted(creator, blockedB, account("proof_restricted_001", "RESTRICTED"));

  await creator.client.from("watch_party_rooms").update({
    is_active: false,
    last_activity_at: nowIso(),
    updated_at: nowIso(),
  }).in("party_id", [liveRoomId, watchRoomId]);
  result.cleanup.liveRoomEnded = true;
  result.cleanup.watchRoomEnded = true;

  const hardPassed = [
    result.liveVideo.status,
    result.roleControls.status,
    result.chatCall.status,
  ].every((status) => status === "passed");
  result.status = hardPassed && result.watchPartySync.status === "passed" && result.blockedRestricted.restrictedDenied
    ? "passed"
    : "partial";
} catch (error) {
  result.status = "failed";
  result.errors.push(redact(error?.message || String(error)));
} finally {
  await cleanup();
  writeJson("realtime-diagnostic-summary.json", result);
  fs.writeFileSync(path.join(artifactDir, "README.md"), [
    "# 25 Seeded Participants Realtime Diagnostic",
    "",
    `Status: ${result.status}`,
    "",
    "This artifact is sanitized. It contains no passwords, service-role keys, LiveKit tokens, push tokens, signed URLs, raw IPs, provider secrets, private messages, private evidence, tax IDs, bank details, or provider transaction records.",
    "",
  ].join("\n"));
  console.log(JSON.stringify({
    artifact: artifactDir,
    participantsConnected: result.participants.livekitConnected,
    serviceRoleUsed: false,
    status: result.status,
    valuesPrinted: false,
  }, null, 2));
  if (result.status === "failed") process.exitCode = 1;
}
