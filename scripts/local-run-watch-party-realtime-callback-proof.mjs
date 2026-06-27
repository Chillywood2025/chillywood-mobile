#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseEnvFile } from "./qa/browserstack-env.mjs";

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const artifactDir = process.env.WATCH_PARTY_REALTIME_CALLBACK_RUN_DIR
  || path.join("/tmp", `app-watch-party-realtime-callback-fix-${timestamp}`);
const tokenLikePattern = /([A-Za-z0-9._~+/=-]{32,})/g;

fs.mkdirSync(artifactDir, { recursive: true });

const redact = (value) => String(value ?? "")
  .replace(tokenLikePattern, "[redacted]")
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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const supabaseUrl = optionalEnv("SUPABASE_URL") || requireEnv("EXPO_PUBLIC_SUPABASE_URL");
const anonKey = optionalEnv("SUPABASE_ANON_KEY") || requireEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY");
const roomSuffix = randomBytes(4).toString("hex").toUpperCase();
const watchRoomId = `WPRTCB${roomSuffix}`;
const syncEventId = `wprtc-sync-${roomSuffix.toLowerCase()}`;
const postSubscribeSettleMs = Number(process.env.WATCH_PARTY_CALLBACK_POST_SUBSCRIBE_SETTLE_MS || 2500);
const callbackObservationMs = Number(process.env.WATCH_PARTY_CALLBACK_OBSERVATION_MS || 20000);

const account = (label, prefix) => ({
  label,
  email: requireEnv(`CHILLYWOOD_E2E_${prefix}_EMAIL`),
  password: requireEnv(`CHILLYWOOD_E2E_${prefix}_PASSWORD`),
  userId: requireEnv(`CHILLYWOOD_E2E_${prefix}_USER_ID`),
});

const result = {
  artifactDir,
  status: "failed",
  method: "seeded_authenticated_watch_party_postgres_changes_callback",
  rootCauseClassification: "realtime publication/config issue",
  migrationAdded: "supabase/migrations/20260627131501_watch_party_realtime_publication.sql",
  remoteMigrationAppliedByThisRunner: false,
  hostLabel: "proof_participant_001",
  viewerLabel: "proof_participant_002",
  watchPartyRoomId: watchRoomId,
  syncEventId,
  subscribedBeforeEmit: false,
  channelStatuses: [],
  callbackObserved: false,
  callbackPayloadSummary: null,
  playbackReadbackMatched: false,
  staleEventConfusionAvoided: true,
  postSubscribeSettleMs,
  callbackObservationMs,
  safety: {
    serviceRoleUsed: false,
    noProviderMutation: true,
    noPlayProductionSubmission: true,
    noPhysicalPhoneSideload: true,
    liveMoneyEnabledOff: true,
    noPayoutsOrRefunds: true,
    noSecretsPrinted: true,
  },
  errors: [],
};

const cleanupTasks = [];
const addCleanup = (task) => cleanupTasks.push(task);

function makeClient(accessToken = null) {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

async function requireOk(label, promise) {
  const response = await promise;
  if (response.error) throw new Error(`${label}:${response.error.message}`);
  return response;
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
  client.realtime.setAuth(data.session.access_token);
  return {
    ...proofAccount,
    accessToken: data.session.access_token,
    authUserId: String(data.user.id),
    client,
  };
}

async function createWatchRoom(host) {
  const titleSourceId = `watch-party-callback-proof-${roomSuffix.toLowerCase()}`;
  await requireOk("insert_watch_party_room", host.client.from("watch_party_rooms").insert({
    capture_policy: "best_effort",
    content_access_rule: "open",
    host_user_id: host.userId,
    is_active: true,
    join_policy: "open",
    last_activity_at: nowIso(),
    party_id: watchRoomId,
    playback_position_millis: 0,
    playback_state: "paused",
    reactions_policy: "enabled",
    room_type: "title",
    source_id: titleSourceId,
    source_type: "platform_title",
    started_at: nowIso(),
    title_id: titleSourceId,
  }).select("party_id").single());

  addCleanup(async () => {
    await host.client.from("watch_party_rooms").update({
      is_active: false,
      last_activity_at: nowIso(),
      updated_at: nowIso(),
    }).eq("party_id", watchRoomId);
  });

  await requireOk("insert_host_membership", host.client.from("watch_party_room_memberships").insert({
    can_speak: true,
    display_name: host.label,
    is_muted: false,
    last_seen_at: nowIso(),
    membership_state: "active",
    mic_enabled: true,
    camera_enabled: true,
    party_id: watchRoomId,
    role: "host",
    stage_role: "host",
    user_id: host.userId,
  }).select("party_id").single());
}

async function joinWatchRoom(viewer) {
  await requireOk("insert_viewer_membership", viewer.client.from("watch_party_room_memberships").insert({
    can_speak: false,
    display_name: viewer.label,
    is_muted: false,
    last_seen_at: nowIso(),
    membership_state: "active",
    mic_enabled: false,
    camera_enabled: false,
    party_id: watchRoomId,
    role: "viewer",
    stage_role: "listener",
    user_id: viewer.userId,
  }).select("party_id").single());
}

async function runCallbackProof(host, viewer) {
  await createWatchRoom(host);
  await joinWatchRoom(viewer);

  let observed = false;
  let callbackPayloadSummary = null;
  const channel = viewer.client.channel(`watch-party-callback-proof-${roomSuffix}`);
  addCleanup(async () => {
    await viewer.client.removeChannel(channel).catch(() => undefined);
  });

  await new Promise((resolve) => {
    let settled = false;
    channel
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "watch_party_sync_events",
        filter: `party_id=eq.${watchRoomId}`,
      }, (payload) => {
        const next = payload?.new ?? {};
        if (String(next.id ?? "") !== syncEventId) return;
        observed = true;
        callbackPayloadSummary = {
          eventType: String(payload.eventType ?? "INSERT"),
          schema: String(payload.schema ?? "public"),
          table: String(payload.table ?? "watch_party_sync_events"),
          partyMatched: String(next.party_id ?? "") === watchRoomId,
          eventIdMatched: true,
          kind: String(next.kind ?? ""),
          playbackPositionMillis: Number(next.playback_position_millis ?? 0),
        };
      })
      .subscribe((status) => {
        result.channelStatuses.push(String(status));
        if (status === "SUBSCRIBED" && !settled) {
          settled = true;
          result.subscribedBeforeEmit = true;
          resolve();
        }
        if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !settled) {
          settled = true;
          resolve();
        }
      });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    }, 7000);
  });

  if (result.subscribedBeforeEmit) await wait(postSubscribeSettleMs);

  await requireOk("insert_watch_party_sync_event", host.client.from("watch_party_sync_events").insert({
    id: syncEventId,
    kind: "play",
    party_id: watchRoomId,
    payload: {
      playbackState: "playing",
      proof: "watch-party-realtime-callback-fix",
      sequence: roomSuffix,
    },
    playback_position_millis: 23456,
    user_id: host.userId,
  }).select("id").single());

  await requireOk("update_watch_party_playback_state", host.client.from("watch_party_rooms").update({
    last_activity_at: nowIso(),
    playback_position_millis: 23456,
    playback_state: "playing",
    updated_at: nowIso(),
  }).eq("party_id", watchRoomId));

  await wait(callbackObservationMs);
  result.callbackObserved = observed;
  result.callbackPayloadSummary = callbackPayloadSummary;

  const readback = await viewer.client
    .from("watch_party_rooms")
    .select("playback_state,playback_position_millis")
    .eq("party_id", watchRoomId)
    .maybeSingle();
  if (readback.error) throw new Error(`watch_party_readback:${readback.error.message}`);
  result.playbackReadbackMatched =
    readback.data?.playback_state === "playing"
    && Number(readback.data?.playback_position_millis ?? 0) === 23456;
  result.status = result.callbackObserved && result.playbackReadbackMatched
    ? "passed"
    : (result.playbackReadbackMatched ? "partial_callback_not_observed" : "failed_readback_mismatch");
}

async function cleanup() {
  for (const task of cleanupTasks.reverse()) {
    await task().catch((error) => {
      result.errors.push(redact(`cleanup:${error?.message || error}`));
    });
  }
}

async function main() {
  try {
    const host = await signIn(account("proof_participant_001", "PARTICIPANT_001"));
    const viewer = await signIn(account("proof_participant_002", "PARTICIPANT_002"));
    await runCallbackProof(host, viewer);
  } catch (error) {
    result.errors.push(redact(error?.message || error));
    if (result.status === "failed") result.status = "blocked";
  } finally {
    await cleanup();
    writeJson("watch-party-realtime-callback-summary.json", result);
    fs.writeFileSync(path.join(artifactDir, "README.md"), [
      "# Watch-Party Realtime Callback Fix",
      "",
      `Status: ${result.status}`,
      `Root cause classification: ${result.rootCauseClassification}`,
      `Subscribed before emit: ${result.subscribedBeforeEmit ? "yes" : "no"}`,
      `Callback observed: ${result.callbackObserved ? "yes" : "no"}`,
      `Playback readback matched: ${result.playbackReadbackMatched ? "yes" : "no"}`,
      "",
      "No passwords, service-role keys, LiveKit tokens, push tokens, provider secrets, signed URLs, raw IPs, private messages, private evidence, tax IDs, bank details, or provider transaction/customer/order records are included.",
    ].join("\n"));
  }

  console.log(JSON.stringify({
    artifactDir,
    status: result.status,
    channelStatuses: result.channelStatuses,
    subscribedBeforeEmit: result.subscribedBeforeEmit,
    callbackObserved: result.callbackObserved,
    playbackReadbackMatched: result.playbackReadbackMatched,
    errors: result.errors,
  }, null, 2));

  if (result.status !== "passed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(redact(error?.message || error));
  process.exit(1);
});
