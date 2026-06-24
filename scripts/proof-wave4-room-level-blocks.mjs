#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_SUPABASE_URL = "https://bmkkhihfbmsnnmcqkoly.supabase.co";
const DEFAULT_SUPABASE_FUNCTIONS_URL = "https://network-proof.chillywoodstream.com";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid-placeholder";

const args = new Set(process.argv.slice(2));
const shouldRun = args.has("--run");
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const proofRunId = `wave4-room-block-${timestamp}`;
const proofDirArg = process.argv.find((arg) => arg.startsWith("--proof-dir="));
const proofDir = proofDirArg
  ? path.resolve(proofDirArg.slice("--proof-dir=".length))
  : path.join("/tmp", `app-wave4-room-level-block-proof-${timestamp}`);

const toText = (value) => String(value ?? "").trim();
const suffix = (value) => toText(value).slice(-8) || null;
const nowIso = () => new Date().toISOString();
const row = (status, evidence, extra = {}) => ({ evidence, status, ...extra });
const classifyError = (error) => toText(error?.message || error?.code || error?.details || error).slice(0, 180);
const isExpectedBlocked = (error) => /blocked_from_room|blocked_relationship|row-level security|violates row-level security|permission denied|policy/i.test(classifyError(error));

const loadLocalEnv = () => {
  for (const file of [".env.local", ".env.final-qa-proof.local", ".env.browserstack-monetization.local"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      if (process.env[key]) continue;
      let value = match[2].trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
};

const writeJson = (name, value) => {
  fs.mkdirSync(proofDir, { recursive: true });
  fs.writeFileSync(path.join(proofDir, name), `${JSON.stringify(value, null, 2)}\n`);
};

const client = (url, key) => createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const signIn = async (url, anonKey, label, email, password) => {
  const supabase = client(url, anonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token || !data.user?.id) {
    throw new Error(`${label}_sign_in_failed`);
  }
  return {
    client: supabase,
    id: data.user.id,
    label,
    token: data.session.access_token,
  };
};

const callFunction = async (functionsUrl, name, token, body) => {
  const response = await fetch(`${functionsUrl.replace(/\/+$/g, "")}/functions/v1/${name}`, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => null);
  return {
    ok: response.ok,
    participantTokenReturned: !!payload?.participantToken,
    requestedGrants: payload?.requestedGrants ?? null,
    error: toText(payload?.error) || null,
    status: response.status,
  };
};

const expectAllowed = (label, res) => {
  if (res.error) return row("Fail", `${label} expected allowed but got ${classifyError(res.error)}`);
  return row("Pass", `${label} allowed`);
};

const expectBlocked = (label, res) => {
  if (!res.error) return row("Fail", `${label} expected blocked but was allowed`);
  if (!isExpectedBlocked(res.error)) return row("Fail", `${label} blocked with unexpected error: ${classifyError(res.error)}`);
  return row("Pass", `${label} blocked safely`);
};

const main = async () => {
  loadLocalEnv();
  fs.mkdirSync(proofDir, { recursive: true });

  const supabaseUrl = toText(process.env.SUPABASE_URL) || toText(process.env.EXPO_PUBLIC_SUPABASE_URL) || DEFAULT_SUPABASE_URL;
  const functionsUrl = toText(process.env.SUPABASE_FUNCTIONS_URL) || toText(process.env.EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL) || DEFAULT_SUPABASE_FUNCTIONS_URL;
  const anonKey = toText(process.env.SUPABASE_ANON_KEY) || toText(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) || "";
  const serviceRoleKey = toText(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const required = {
    CHILLYWOOD_E2E_OWNER_EMAIL: toText(process.env.CHILLYWOOD_E2E_OWNER_EMAIL),
    CHILLYWOOD_E2E_OWNER_PASSWORD: toText(process.env.CHILLYWOOD_E2E_OWNER_PASSWORD),
    CHILLYWOOD_E2E_VIEWER_EMAIL: toText(process.env.CHILLYWOOD_E2E_VIEWER_EMAIL),
    CHILLYWOOD_E2E_VIEWER_PASSWORD: toText(process.env.CHILLYWOOD_E2E_VIEWER_PASSWORD),
    CHILLYWOOD_E2E_VIEWER_02_EMAIL: toText(process.env.CHILLYWOOD_E2E_VIEWER_02_EMAIL),
    CHILLYWOOD_E2E_VIEWER_02_PASSWORD: toText(process.env.CHILLYWOOD_E2E_VIEWER_02_PASSWORD),
  };

  const preflight = {
    anonKeyPresent: !!anonKey,
    functionsUrlPresent: !!functionsUrl,
    proofDir,
    proofRunId,
    runRequested: shouldRun,
    serviceRoleKeyPresent: !!serviceRoleKey,
    supabaseUrlPresent: !!supabaseUrl,
    requiredProofCredentialsPresent: Object.fromEntries(Object.entries(required).map(([key, value]) => [key, !!value])),
  };
  writeJson("00-preflight.json", preflight);

  if (!shouldRun) {
    const dryRun = {
      mode: "dry_run",
      mutationPerformed: false,
      ok: true,
      preflight,
      secretsPrinted: false,
      tokensPrinted: false,
    };
    writeJson("wave4-room-level-block-proof.json", dryRun);
    console.log(JSON.stringify(dryRun, null, 2));
    console.error(`Wave 4.2 proof artifact: ${proofDir}`);
    return;
  }

  const missing = [];
  if (!anonKey || anonKey === DEFAULT_SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  for (const [key, value] of Object.entries(required)) {
    if (!value) missing.push(key);
  }
  if (missing.length) throw new Error(`missing_required_proof_env:${missing.join(",")}`);

  const admin = client(supabaseUrl, serviceRoleKey);
  const users = {
    host: await signIn(supabaseUrl, anonKey, "host", required.CHILLYWOOD_E2E_OWNER_EMAIL, required.CHILLYWOOD_E2E_OWNER_PASSWORD),
    blocked: await signIn(supabaseUrl, anonKey, "blocked", required.CHILLYWOOD_E2E_VIEWER_EMAIL, required.CHILLYWOOD_E2E_VIEWER_PASSWORD),
    validViewer: await signIn(supabaseUrl, anonKey, "validViewer", required.CHILLYWOOD_E2E_VIEWER_02_EMAIL, required.CHILLYWOOD_E2E_VIEWER_02_PASSWORD),
  };

  const cleanup = [];
  const addCleanup = (name, fn) => cleanup.push({ fn, name });
  const cleanupRateLimits = async () => {
    await admin
      .from("abuse_rate_limit_events")
      .delete()
      .in("actor_user_id", [users.host.id, users.blocked.id, users.validViewer.id])
      .in("action_key", ["watch_party_room_create", "seat_request_marker", "room_message"]);
  };

  await cleanupRateLimits();
  await admin.from("watch_party_rooms").delete().like("party_id", "W42-%WAVE4-ROOM-BLOCK-%");

  const makePartyId = (prefix) => `${prefix}-${proofRunId}`.toUpperCase().replace(/[^A-Z0-9-]/g, "-").slice(0, 64);
  const createRoom = async (partyId, roomType) => {
    const now = nowIso();
    const res = await users.host.client.from("watch_party_rooms").insert({
      content_access_rule: "open",
      host_user_id: users.host.id,
      is_active: true,
      join_policy: "open",
      last_activity_at: now,
      party_id: partyId,
      playback_position_millis: 0,
      playback_state: "paused",
      room_type: roomType,
      source_id: roomType === "title" ? `proof-title-${proofRunId}` : null,
      source_type: roomType === "title" ? "platform_title" : null,
      started_at: now,
      title_id: roomType === "title" ? `proof-title-${proofRunId}` : null,
      updated_at: now,
    });
    if (res.error) throw new Error(`room_setup_failed:${partyId}:${classifyError(res.error)}`);
    addCleanup(`room:${partyId}`, async () => admin.from("watch_party_rooms").delete().eq("party_id", partyId));
    await admin.from("watch_party_room_memberships").upsert({
      can_speak: true,
      is_muted: false,
      joined_at: now,
      last_seen_at: now,
      membership_state: "active",
      party_id: partyId,
      role: "host",
      stage_role: "host",
      user_id: users.host.id,
    });
  };

  const activeMembership = (partyId, user, role = "viewer", stageRole = "listener") => ({
    can_speak: stageRole === "speaker" || role === "host",
    is_muted: false,
    joined_at: nowIso(),
    last_seen_at: nowIso(),
    membership_state: "active",
    party_id: partyId,
    role,
    stage_role: stageRole,
    user_id: user.id,
  });

  const seatText = (userId) => `__chillywood_party_seat_request_v1__:${userId}`;
  const notificationCountForRoom = async (partyId) => {
    const { count } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", users.host.id)
      .eq("source_id", partyId);
    return count ?? 0;
  };

  const matrix = {};
  const liveJoinRoom = makePartyId("W42-LIVE-JOIN");
  const liveStaleRoom = makePartyId("W42-LIVE-STALE");
  const partyJoinRoom = makePartyId("W42-PARTY-JOIN");
  const partyStaleRoom = makePartyId("W42-PARTY-STALE");

  try {
    for (const [partyId, roomType] of [
      [liveJoinRoom, "live"],
      [liveStaleRoom, "live"],
      [partyJoinRoom, "title"],
      [partyStaleRoom, "title"],
    ]) {
      await createRoom(partyId, roomType);
    }

    await admin.from("watch_party_room_memberships").upsert([
      activeMembership(liveStaleRoom, users.blocked),
      activeMembership(partyStaleRoom, users.blocked),
    ]);

    await admin.from("channel_audience_blocks").upsert({
      blocked_by_user_id: users.host.id,
      blocked_user_id: users.blocked.id,
      channel_user_id: users.host.id,
      reason: `wave4-room-block:${proofRunId}`,
    });
    addCleanup("channel_audience_block", async () =>
      admin.from("channel_audience_blocks")
        .delete()
        .eq("channel_user_id", users.host.id)
        .eq("blocked_user_id", users.blocked.id)
    );

    const liveBlockedJoin = await users.blocked.client.from("watch_party_room_memberships").insert(activeMembership(liveJoinRoom, users.blocked));
    matrix.liveStageJoin = expectBlocked("Live Stage blocked viewer join", liveBlockedJoin);
    const partyBlockedJoin = await users.blocked.client.from("watch_party_room_memberships").insert(activeMembership(partyJoinRoom, users.blocked));
    matrix.watchPartyLiveJoin = expectBlocked("Watch-Party Live blocked viewer join", partyBlockedJoin);

    const liveBlockedToken = await callFunction(functionsUrl, "livekit-token", users.blocked.token, {
      participantRole: "viewer",
      roomName: liveStaleRoom,
      surface: "live-stage",
    });
    matrix.liveStageLiveKitToken = liveBlockedToken.status === 403 && liveBlockedToken.error === "blocked_from_room" && !liveBlockedToken.participantTokenReturned
      ? row("Pass", "blocked Live Stage viewer cannot mint LiveKit token")
      : row("Fail", "blocked Live Stage viewer token result unexpected", liveBlockedToken);

    const partyBlockedToken = await callFunction(functionsUrl, "livekit-token", users.blocked.token, {
      participantRole: "viewer",
      roomName: partyStaleRoom,
      surface: "watch-party-live",
    });
    matrix.watchPartyLiveLiveKitToken = partyBlockedToken.status === 403 && partyBlockedToken.error === "blocked_from_room" && !partyBlockedToken.participantTokenReturned
      ? row("Pass", "blocked Watch-Party Live viewer cannot mint LiveKit token")
      : row("Fail", "blocked Watch-Party Live viewer token result unexpected", partyBlockedToken);

    const liveNotificationsBefore = await notificationCountForRoom(liveStaleRoom);
    const liveSeat = await users.blocked.client.from("watch_party_room_messages").insert({
      party_id: liveStaleRoom,
      text: seatText(users.blocked.id),
      user_id: users.blocked.id,
      username: "blocked-proof",
    });
    const liveNotificationsAfter = await notificationCountForRoom(liveStaleRoom);
    matrix.liveStageSeatRequest = expectBlocked("Live Stage blocked seat request", liveSeat);
    matrix.liveStageSeatRequestNotification = liveNotificationsAfter === liveNotificationsBefore
      ? row("Pass", "blocked Live Stage seat request created no host notification")
      : row("Fail", "blocked Live Stage seat request notification count changed", { before: liveNotificationsBefore, after: liveNotificationsAfter });

    const partyNotificationsBefore = await notificationCountForRoom(partyStaleRoom);
    const partySeat = await users.blocked.client.from("watch_party_room_messages").insert({
      party_id: partyStaleRoom,
      text: seatText(users.blocked.id),
      user_id: users.blocked.id,
      username: "blocked-proof",
    });
    const partyNotificationsAfter = await notificationCountForRoom(partyStaleRoom);
    matrix.watchPartyLiveSeatRequest = expectBlocked("Watch-Party Live blocked seat request", partySeat);
    matrix.watchPartyLiveSeatRequestNotification = partyNotificationsAfter === partyNotificationsBefore
      ? row("Pass", "blocked Watch-Party Live seat request created no host notification")
      : row("Fail", "blocked Watch-Party Live seat request notification count changed", { before: partyNotificationsBefore, after: partyNotificationsAfter });

    const unrelatedLiveJoin = await users.validViewer.client.from("watch_party_room_memberships").insert(activeMembership(liveJoinRoom, users.validViewer));
    matrix.unrelatedLiveStageJoin = expectAllowed("unrelated Live Stage viewer join", unrelatedLiveJoin);
    const unrelatedPartyJoin = await users.validViewer.client.from("watch_party_room_memberships").insert(activeMembership(partyJoinRoom, users.validViewer));
    matrix.unrelatedWatchPartyLiveJoin = expectAllowed("unrelated Watch-Party Live viewer join", unrelatedPartyJoin);
    const unrelatedLiveSeat = await users.validViewer.client.from("watch_party_room_messages").insert({
      party_id: liveJoinRoom,
      text: seatText(users.validViewer.id),
      user_id: users.validViewer.id,
      username: "valid-viewer-proof",
    });
    matrix.unrelatedLiveStageSeatRequest = expectAllowed("unrelated Live Stage seat request", unrelatedLiveSeat);
    const unrelatedPartySeat = await users.validViewer.client.from("watch_party_room_messages").insert({
      party_id: partyJoinRoom,
      text: seatText(users.validViewer.id),
      user_id: users.validViewer.id,
      username: "valid-viewer-proof",
    });
    matrix.unrelatedWatchPartyLiveSeatRequest = expectAllowed("unrelated Watch-Party Live seat request", unrelatedPartySeat);

    const cleanupResults = [];
    for (const item of cleanup.reverse()) {
      try {
        const res = await item.fn();
        cleanupResults.push({ error: classifyError(res?.error) || null, name: item.name, ok: !res?.error });
      } catch (error) {
        cleanupResults.push({ error: classifyError(error), name: item.name, ok: false });
      }
    }
    await cleanupRateLimits();

    const result = {
      cleanup: cleanupResults,
      matrix,
      mutationPerformed: true,
      proofRunId,
      safetyReportRoutesChanged: false,
      secretsPrinted: false,
      tokenLikeValuesPrinted: false,
      userSuffixes: Object.fromEntries(Object.entries(users).map(([key, value]) => [key, suffix(value.id)])),
    };
    writeJson("wave4-room-level-block-proof.json", result);
    writeJson("README.json", {
      proofRunId,
      summary: "Bounded Wave 4.2 room-level block proof. Values are sanitized; no credentials, service-role keys, push tokens, LiveKit tokens, signed URLs, participant tokens, or passwords are written.",
    });
    console.log(JSON.stringify(result, null, 2));
    console.error(`Wave 4.2 proof artifact: ${proofDir}`);
  } catch (error) {
    const failure = {
      error: classifyError(error),
      mutationPerformed: true,
      proofRunId,
      secretsPrinted: false,
      tokenLikeValuesPrinted: false,
    };
    writeJson("failure.json", failure);
    throw error;
  }
};

main().catch((error) => {
  console.error(`Wave 4.2 room-level block proof failed: ${classifyError(error)}`);
  process.exitCode = 1;
});
