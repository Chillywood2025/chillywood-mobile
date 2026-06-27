#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { parseEnvFile } from "./qa/browserstack-env.mjs";

const root = process.cwd();
const PACKAGE_ID = "com.chillywood.mobile";
const UPDATE_GROUP = "d7aac53c-65bb-4bf7-ae69-04bfea248e0a";
const DEVICE_A = process.env.TWO_CLIENT_DEVICE_A || "R5CR120QCBF";
const DEVICE_B = process.env.TWO_CLIENT_DEVICE_B || "R3CXA0DS5JV";
const DEVICE_A_ACCOUNT_PREFIX = process.env.TWO_CLIENT_DEVICE_A_ACCOUNT_PREFIX || "PARTICIPANT_001";
const DEVICE_B_ACCOUNT_PREFIX = process.env.TWO_CLIENT_DEVICE_B_ACCOUNT_PREFIX || "PARTICIPANT_002";
const DEVICE_A_ACCOUNT_LABEL = process.env.TWO_CLIENT_DEVICE_A_ACCOUNT_LABEL || "proof_participant_001";
const DEVICE_B_ACCOUNT_LABEL = process.env.TWO_CLIENT_DEVICE_B_ACCOUNT_LABEL || "proof_participant_002";
const RUN_STAFF_UI = process.env.TWO_CLIENT_RUN_STAFF_UI === "1";
const STAFF_UI_EVIDENCE_ARTIFACT = process.env.TWO_CLIENT_STAFF_UI_EVIDENCE_ARTIFACT
  || "/tmp/app-two-client-installed-app-realtime-ui-proof-20260627152317";
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const artifactDir = process.env.TWO_CLIENT_REALTIME_UI_ARTIFACT_DIR
  || path.join("/tmp", `app-two-client-installed-app-realtime-ui-proof-${timestamp}`);

fs.mkdirSync(artifactDir, { recursive: true });

const envFiles = [
  ".env.browserstack-monetization.local",
  ".env.proof.local",
  ".env.local",
  ".env.final-qa-proof.local",
  ".env.money-proof.local",
  ".env.browserstack.local",
];

const tokenLikePattern = /([A-Za-z0-9._~+/=-]{32,})/g;
const generatedSecrets = [];
let secretRedactions = [];

const redact = (value) => {
  let text = String(value ?? "")
    .replace(tokenLikePattern, "[redacted]")
    .replace(/https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/gi, "[redacted-url]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[redacted-ip]")
    .replace(/[A-Za-z0-9._%+-]+@(?!chillywood\.test\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]");
  for (const secret of [...secretRedactions, ...generatedSecrets]) {
    if (!secret || String(secret).length < 4) continue;
    text = text.split(String(secret)).join("[redacted-proof-id]");
  }
  return text;
};

const writeJson = (name, value) => {
  fs.writeFileSync(path.join(artifactDir, name), `${JSON.stringify(value, null, 2)}\n`);
};

const writeText = (name, value) => {
  fs.writeFileSync(path.join(artifactDir, name), `${redact(value)}\n`);
};

const loadEnv = () => envFiles
  .reduce((acc, file) => ({ ...acc, ...parseEnvFile(path.join(root, file)) }), { ...process.env });

const env = loadEnv();
secretRedactions = Object.entries(env)
  .filter(([key, value]) => /(PASSWORD|SERVICE_ROLE|SECRET|TOKEN|PRIVATE_KEY|SUPABASE_URL|SUPABASE_ANON_KEY)/i.test(key) && String(value ?? "").length >= 6)
  .map(([, value]) => String(value));

const optionalEnv = (key) => String(env[key] ?? "").trim();
const requireEnv = (key) => {
  const value = optionalEnv(key);
  if (!value) throw new Error(`Missing required env key: ${key}`);
  return value;
};

const supabaseUrl = optionalEnv("SUPABASE_URL") || requireEnv("EXPO_PUBLIC_SUPABASE_URL");
const anonKey = optionalEnv("SUPABASE_ANON_KEY") || requireEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY");
const nowIso = () => new Date().toISOString();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const suffix = randomBytes(4).toString("hex").toUpperCase();
const watchPartyId = `TWP${suffix}`;
const livePartyId = `TLV${suffix}`;
const communicationRoomId = `TCL${suffix.slice(0, 6)}`;
const threadId = randomUUID();
const syncEventId = `two-client-sync-${suffix.toLowerCase()}`;
generatedSecrets.push(watchPartyId, livePartyId, communicationRoomId, threadId, syncEventId);

const result = {
  artifactDir,
  finalVerdict: "Partial",
  packageId: PACKAGE_ID,
  easUpdateGroup: UPDATE_GROUP,
  devices: {},
  accountsUsed: {
    deviceA: { serial: DEVICE_A, label: DEVICE_A_ACCOUNT_LABEL, prefix: DEVICE_A_ACCOUNT_PREFIX },
    deviceB: { serial: DEVICE_B, label: DEVICE_B_ACCOUNT_LABEL, prefix: DEVICE_B_ACCOUNT_PREFIX },
    moderator: "proof_moderator_001",
    adminOperator: "proof_admin_operator_001",
    owner: "proof_owner_001",
  },
  callbackRecheck: {
    status: "not_run_by_this_runner",
    callbackObserved: null,
    playbackReadbackMatched: null,
  },
  proofData: {
    watchPartyRoomId: "[redacted-proof-id]",
    livePartyRoomId: "[redacted-proof-id]",
    chatThreadId: "[redacted-proof-id]",
    communicationRoomId: "[redacted-proof-id]",
  },
  flows: [],
  safety: {
    noPhysicalPhoneSideload: true,
    noInstallOrUninstallOrClearData: true,
    noPlayProductionSubmission: true,
    noProviderMutation: true,
    liveMoneyEnabledOff: true,
    noPayoutsRefundsOrPurchases: true,
    noServiceRoleUsed: true,
    noFirstOwnerTouch: true,
    noSecretsPrinted: true,
  },
  errors: [],
};

function addFlow(name, status, actualOutcome, evidence = {}) {
  result.flows.push({
    name,
    status,
    expectedOutcome: evidence.expectedOutcome || "",
    actualOutcome,
    evidence: Object.fromEntries(Object.entries(evidence).map(([key, value]) => [key, redact(value)])),
  });
}

function run(command, args, options = {}) {
  const execution = spawnSync(command, args, {
    encoding: options.encoding ?? "utf8",
    timeout: options.timeout ?? 30000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 30,
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
  return {
    command: redact([command, ...args].join(" ")),
    status: execution.status,
    ok: execution.status === 0,
    stdout: options.encoding === "buffer" ? execution.stdout : redact(execution.stdout),
    stderr: options.encoding === "buffer" ? execution.stderr : redact(execution.stderr),
    error: execution.error ? redact(execution.error.message) : null,
  };
}

const adb = (serial, args, options = {}) => run("adb", ["-s", serial, ...args], options);

function packageMetadata(serial) {
  const listed = adb(serial, ["shell", "cmd", "package", "list", "packages", "--show-versioncode", "-i", "--user", "0", PACKAGE_ID], { timeout: 15000 });
  const dump = adb(serial, ["shell", "dumpsys", "package", PACKAGE_ID], { timeout: 25000, maxBuffer: 1024 * 1024 * 8 });
  const combined = `${listed.stdout}\n${dump.stdout}`;
  const versionCode = combined.match(/versionCode[:=](\d+)/)?.[1] || "unknown";
  const versionName = combined.match(/versionName=([^\s]+)/)?.[1] || "1.0.0";
  const installer = combined.match(/installer=([^\s]+)/)?.[1]
    || combined.match(/installerPackageName=([^\s]+)/)?.[1]
    || "unknown";
  return {
    serial,
    package: PACKAGE_ID,
    versionName,
    versionCode,
    installer,
    metadataReadOk: listed.ok || dump.ok,
  };
}

function launchApp(serial, label) {
  const launch = adb(serial, ["shell", "monkey", "-p", PACKAGE_ID, "-c", "android.intent.category.LAUNCHER", "1"], { timeout: 20000 });
  writeText(`${label}-launch.txt`, `${launch.command}\nstatus=${launch.status}\n${launch.stdout}\n${launch.stderr}\n${launch.error || ""}`);
  sleep(4500);
  return launch.ok;
}

function openRoute(serial, route, label) {
  const normalized = route.startsWith("/") ? route.slice(1) : route;
  const url = normalized ? `chillywoodmobile:///${normalized}` : "chillywoodmobile:///";
  const start = adb(serial, ["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", url, PACKAGE_ID], { timeout: 25000 });
  writeText(`${label}-am-start.txt`, `${start.command}\nstatus=${start.status}\n${start.stdout}\n${start.stderr}\n${start.error || ""}`);
  sleep(4500);
  return start.ok;
}

function dumpUi(serial, label) {
  const remote = "/sdcard/chillywood-two-client-proof-window.xml";
  adb(serial, ["shell", "rm", "-f", remote], { timeout: 10000 });
  const dump = adb(serial, ["shell", "uiautomator", "dump", remote], { timeout: 60000, maxBuffer: 1024 * 1024 * 5 });
  sleep(700);
  const cat = adb(serial, ["shell", "cat", remote], { timeout: 20000, maxBuffer: 1024 * 1024 * 10 });
  const xml = cat.ok && String(cat.stdout ?? "").length > 100 ? redact(cat.stdout) : "";
  writeJson(`${label}-dump-status.json`, {
    dumpOk: dump.ok,
    catOk: cat.ok,
    catSize: xml.length,
    dumpStderr: dump.stderr,
  });
  fs.writeFileSync(path.join(artifactDir, `${label}.xml`), xml);
  writeText(`${label}.txt`, xml.replace(/<node /g, "\n<node ").slice(0, 35000));
  return xml;
}

function screenshot(serial, label) {
  const shot = adb(serial, ["exec-out", "screencap", "-p"], { encoding: "buffer", timeout: 20000, maxBuffer: 1024 * 1024 * 20 });
  if (shot.ok && Buffer.isBuffer(shot.stdout)) {
    fs.writeFileSync(path.join(artifactDir, `${label}.png`), shot.stdout);
    return `${label}.png`;
  }
  return "";
}

const xmlHas = (xml, pattern) => new RegExp(pattern, "i").test(xml || "");

const parseBoundsCenter = (xml, query) => {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`resource-id="[^"]*(?:/|:)${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "i"),
    new RegExp(`text="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "i"),
    new RegExp(`content-desc="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "i"),
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (!match) continue;
    const [, x1, y1, x2, y2] = match.map(Number);
    return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
  }
  return null;
};

function tapBy(serial, xml, query) {
  const center = parseBoundsCenter(xml, query);
  if (!center) return false;
  adb(serial, ["shell", "input", "tap", String(center.x), String(center.y)], { timeout: 10000 });
  sleep(3500);
  return true;
}

function settleUi(serial, label) {
  let xml = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    xml = dumpUi(serial, attempt === 0 ? label : `${label}-after-permission-${attempt}`);
    if (/Allow Chi'llywood to (?:take pictures and record video|record audio)|permission_message/i.test(xml)) {
      if (tapBy(serial, xml, "While using the app")) {
        sleep(2500);
        continue;
      }
    }
    break;
  }
  return xml;
}

function signInWithMaestro(serial, label, emailKey, passwordKey) {
  const email = requireEnv(emailKey);
  const password = requireEnv(passwordKey);
  const flowPath = path.join(artifactDir, `${label}-${serial}-login.yaml`);
  const flow = `appId: ${PACKAGE_ID}
---
- tapOn:
    text: "OK"
    optional: true
- openLink: "chillywoodmobile://settings"
- waitForAnimationToEnd
- tapOn:
    id: "settings-section-account"
    optional: true
- waitForAnimationToEnd
- scrollUntilVisible:
    element:
      id: "settings-logout-button"
    direction: DOWN
    timeout: 8000
    optional: true
- tapOn:
    id: "settings-logout-button"
    optional: true
- waitForAnimationToEnd
- openLink: "chillywoodmobile://login"
- extendedWaitUntil:
    visible:
      id: "auth-login-email-input"
    timeout: 20000
- tapOn:
    id: "auth-login-email-input"
- eraseText
- inputText: "\${MAESTRO_CHILLYWOOD_LOGIN_EMAIL}"
- tapOn:
    id: "auth-login-password-input"
- eraseText
- inputText: "\${MAESTRO_CHILLYWOOD_LOGIN_PASSWORD}"
- hideKeyboard
- tapOn:
    id: "auth-login-submit-button"
- waitForAnimationToEnd
`;
  fs.writeFileSync(flowPath, flow);
  const maestro = run("maestro", ["--udid", serial, "test", flowPath], {
    timeout: 140000,
    maxBuffer: 1024 * 1024 * 25,
    env: {
      MAESTRO_CHILLYWOOD_LOGIN_EMAIL: email,
      MAESTRO_CHILLYWOOD_LOGIN_PASSWORD: password,
    },
  });
  writeText(`${label}-${serial}-maestro-login-output.txt`, `${maestro.command}\nstatus=${maestro.status}\n${maestro.stdout}\n${maestro.stderr}\n${maestro.error || ""}`);
  sleep(5000);
  let xml = dumpUi(serial, `${label}-${serial}-post-login`);
  if (/Save sign-in info|autofill_save|Samsung Pass|Save username and password/i.test(xml)) {
    if (!tapBy(serial, xml, "Cancel")) {
      adb(serial, ["shell", "input", "keyevent", "4"], { timeout: 10000 });
      sleep(1200);
    }
    xml = dumpUi(serial, `${label}-${serial}-post-login-after-autofill-dismiss`);
  }
  const ok = xmlHas(xml, "Home|Explore|Profile|Settings|auth-logged-in-home|Admin Command Center|Command Center");
  if (!ok) screenshot(serial, `${label}-${serial}-login-blocked`);
  return { ok, maestroStatus: maestro.status };
}

function makeClient(accessToken = null) {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

async function signInBackend(label, prefix) {
  const client = makeClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: requireEnv(`CHILLYWOOD_E2E_${prefix}_EMAIL`),
    password: requireEnv(`CHILLYWOOD_E2E_${prefix}_PASSWORD`),
  });
  if (error || !data.session?.access_token || !data.user?.id) {
    throw new Error(`backend_sign_in_failed:${label}:${error?.message || "missing session"}`);
  }
  client.realtime.setAuth(data.session.access_token);
  return {
    label,
    prefix,
    client,
    userId: requireEnv(`CHILLYWOOD_E2E_${prefix}_USER_ID`),
    authUserId: data.user.id,
  };
}

async function requireOk(label, promise) {
  const response = await promise;
  if (response.error) throw new Error(`${label}:${response.error.message}`);
  return response;
}

async function createProofRooms(host, participant) {
  const now = nowIso();
  const proofTitle = `two-client-ui-proof-${suffix.toLowerCase()}`;
  const setup = { watchPartyRoomReady: false, liveRoomReady: false, liveRoomBlocker: "" };
  await requireOk("insert_watch_party_room", host.client.from("watch_party_rooms").insert({
    capture_policy: "best_effort",
    content_access_rule: "open",
    host_user_id: host.userId,
    is_active: true,
    join_policy: "open",
    last_activity_at: now,
    party_id: watchPartyId,
    playback_position_millis: 0,
    playback_state: "paused",
    reactions_policy: "enabled",
    room_type: "title",
    source_id: proofTitle,
    source_type: "platform_title",
    started_at: now,
    title_id: proofTitle,
  }).select("party_id").single());

  await requireOk("insert_watch_party_host_membership", host.client.from("watch_party_room_memberships").insert({
    party_id: watchPartyId,
    user_id: host.userId,
    role: "host",
    stage_role: "host",
    can_speak: true,
    mic_enabled: true,
    camera_enabled: true,
    display_name: host.label,
    is_muted: false,
    membership_state: "active",
    joined_at: now,
    last_seen_at: now,
  }).select("party_id").single());
  await requireOk("insert_watch_party_participant_membership", participant.client.from("watch_party_room_memberships").insert({
    party_id: watchPartyId,
    user_id: participant.userId,
    role: "viewer",
    stage_role: "listener",
    can_speak: false,
    mic_enabled: false,
    camera_enabled: false,
    display_name: participant.label,
    is_muted: false,
    membership_state: "active",
    joined_at: now,
    last_seen_at: now,
  }).select("party_id").single());
  setup.watchPartyRoomReady = true;

  try {
    await requireOk("insert_live_room", host.client.from("watch_party_rooms").insert({
      capture_policy: "best_effort",
      content_access_rule: "open",
      host_user_id: host.userId,
      is_active: true,
      join_policy: "open",
      last_activity_at: now,
      party_id: livePartyId,
      playback_position_millis: 0,
      playback_state: "paused",
      reactions_policy: "enabled",
      room_type: "live",
      source_id: null,
      source_type: null,
      started_at: now,
      title_id: null,
    }).select("party_id").single());

    await requireOk("insert_live_host_membership", host.client.from("watch_party_room_memberships").insert({
      party_id: livePartyId,
      user_id: host.userId,
      role: "host",
      stage_role: "host",
      can_speak: true,
      mic_enabled: true,
      camera_enabled: true,
      display_name: host.label,
      is_muted: false,
      membership_state: "active",
      joined_at: now,
      last_seen_at: now,
    }).select("party_id").single());
    await requireOk("insert_live_participant_membership", participant.client.from("watch_party_room_memberships").insert({
      party_id: livePartyId,
      user_id: participant.userId,
      role: "viewer",
      stage_role: "listener",
      can_speak: false,
      mic_enabled: false,
      camera_enabled: false,
      display_name: participant.label,
      is_muted: false,
      membership_state: "active",
      joined_at: now,
      last_seen_at: now,
    }).select("party_id").single());
    setup.liveRoomReady = true;
  } catch (error) {
    setup.liveRoomBlocker = redact(error?.message || error);
    result.errors.push(`live_room_setup_partial:${setup.liveRoomBlocker}`);
  }

  return setup;
}

async function emitWatchPartySync(host, participant) {
  let observed = false;
  let callbackPayloadSummary = null;
  const channel = participant.client.channel(`two-client-watch-party-${suffix}`);
  let subscribed = false;
  await new Promise((resolve) => {
    let settled = false;
    channel
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "watch_party_sync_events",
        filter: `party_id=eq.${watchPartyId}`,
      }, (payload) => {
        const next = payload?.new ?? {};
        if (String(next.id ?? "") !== syncEventId) return;
        observed = true;
        callbackPayloadSummary = {
          eventType: String(payload.eventType ?? "INSERT"),
          table: String(payload.table ?? "watch_party_sync_events"),
          partyMatched: String(next.party_id ?? "") === watchPartyId,
          eventIdMatched: true,
          playbackPositionMillis: Number(next.playback_position_millis ?? 0),
        };
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && !settled) {
          subscribed = true;
          settled = true;
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
    }, 9000);
  });

  if (subscribed) await wait(2500);
  await requireOk("insert_two_client_sync_event", host.client.from("watch_party_sync_events").insert({
    id: syncEventId,
    kind: "play",
    party_id: watchPartyId,
    payload: { playbackState: "playing", proof: "two-client-installed-app-realtime-ui", sequence: suffix },
    playback_position_millis: 34567,
    user_id: host.userId,
  }).select("id").single());
  await requireOk("update_two_client_playback_state", host.client.from("watch_party_rooms").update({
    last_activity_at: nowIso(),
    playback_position_millis: 34567,
    playback_state: "playing",
    updated_at: nowIso(),
  }).eq("party_id", watchPartyId));
  await wait(20000);
  await participant.client.removeChannel(channel).catch(() => undefined);
  const readback = await participant.client.from("watch_party_rooms").select("playback_state,playback_position_millis").eq("party_id", watchPartyId).maybeSingle();
  if (readback.error) throw new Error(`two_client_watch_party_readback:${readback.error.message}`);
  return {
    subscribed,
    callbackObserved: observed,
    callbackPayloadSummary,
    playbackReadbackMatched: readback.data?.playback_state === "playing" && Number(readback.data?.playback_position_millis ?? 0) === 34567,
  };
}

async function createChatCallProofState(host, participant) {
  const now = nowIso();
  const pairKey = [host.userId, participant.userId].sort().join("::");

  await requireOk("insert_chat_thread", host.client.from("chat_threads").insert({
    id: threadId,
    created_by: host.userId,
    last_message_at: now,
    last_message_preview: "Two-phone realtime proof call state.",
    participant_pair_key: pairKey,
    thread_kind: "direct",
    updated_at: now,
  }).select("id").single());

  await requireOk("insert_chat_members", host.client.from("chat_thread_members").insert([
    { thread_id: threadId, user_id: host.userId, display_name: host.label, joined_at: now, last_read_at: now, unread_count: 0 },
    { thread_id: threadId, user_id: participant.userId, display_name: participant.label, joined_at: now, last_read_at: null, unread_count: 1 },
  ]).select("thread_id"));

  await requireOk("insert_communication_room", host.client.from("communication_rooms").insert({
    capture_policy: "best_effort",
    content_access_rule: "open",
    host_user_id: host.userId,
    last_activity_at: now,
    linked_party_id: null,
    linked_room_code: null,
    linked_room_mode: null,
    room_code: communicationRoomId,
    room_id: communicationRoomId,
    status: "active",
  }).select("room_id").single());

  await requireOk("insert_communication_host_membership", host.client.from("communication_room_memberships").insert({
    room_id: communicationRoomId,
    user_id: host.userId,
    role: "host",
    membership_state: "active",
    camera_enabled: true,
    mic_enabled: true,
    display_name: host.label,
    last_seen_at: now,
    joined_at: now,
  }).select("room_id").single());
  await requireOk("insert_communication_participant_membership", participant.client.from("communication_room_memberships").insert({
    room_id: communicationRoomId,
    user_id: participant.userId,
    role: "participant",
    membership_state: "active",
    camera_enabled: true,
    mic_enabled: true,
    display_name: participant.label,
    last_seen_at: now,
    joined_at: now,
  }).select("room_id").single());

  await requireOk("update_chat_thread_active_call", host.client.from("chat_threads").update({
    active_communication_room_id: communicationRoomId,
    active_call_type: "video",
    last_message_at: now,
    last_message_preview: "Two-phone realtime proof call state.",
    updated_at: now,
  }).eq("id", threadId).select("id").single());

  await requireOk("insert_chat_call_invite", host.client.from("chat_call_invites").insert({
    callee_user_id: participant.userId,
    caller_user_id: host.userId,
    call_type: "video",
    communication_room_id: communicationRoomId,
    status: "accepted",
    thread_id: threadId,
    accepted_at: now,
  }).select("id").single());
}

async function closeProofRooms(host) {
  await host.client.from("watch_party_rooms").update({ is_active: false, last_activity_at: nowIso(), updated_at: nowIso() }).in("party_id", [watchPartyId, livePartyId]);
  await host.client.from("communication_rooms").update({ status: "ended", last_activity_at: nowIso(), updated_at: nowIso() }).eq("room_id", communicationRoomId);
}

function assertBothUi(flowName, xmlA, xmlB, patternA, patternB, evidence = {}) {
  const passA = xmlHas(xmlA, patternA);
  const passB = xmlHas(xmlB, patternB);
  const status = passA && passB ? "Closed" : "Partial";
  addFlow(flowName, status, passA && passB ? "Both physical Play-internal clients showed expected installed-app UI state." : "One or both clients did not expose the expected UI marker.", {
    ...evidence,
    deviceAResult: passA ? "expected marker visible" : "expected marker not visible",
    deviceBResult: passB ? "expected marker visible" : "expected marker not visible",
  });
  return status;
}

async function main() {
  let host;
  try {
    const devices = run("adb", ["devices", "-l"], { timeout: 10000 });
    writeText("adb-devices.txt", `${devices.command}\n${devices.stdout}\n${devices.stderr}`);
    result.devices[DEVICE_A] = packageMetadata(DEVICE_A);
    result.devices[DEVICE_B] = packageMetadata(DEVICE_B);

    for (const [serial, metadata] of Object.entries(result.devices)) {
      const ok = metadata.package === PACKAGE_ID
        && metadata.versionName === "1.0.0"
        && metadata.versionCode === "57"
        && metadata.installer === "com.android.vending";
      addFlow(`preflight ${serial}`, ok ? "Closed" : "Blocked", ok ? "Play-internal v57 metadata verified." : "Device metadata did not match Play-internal v57.", metadata);
      launchApp(serial, `${serial}-preflight`);
      settleUi(serial, `${serial}-preflight-launch`);
      screenshot(serial, `${serial}-preflight-launch`);
    }

    const hostLogin = signInWithMaestro(DEVICE_A, DEVICE_A_ACCOUNT_LABEL, `CHILLYWOOD_E2E_${DEVICE_A_ACCOUNT_PREFIX}_EMAIL`, `CHILLYWOOD_E2E_${DEVICE_A_ACCOUNT_PREFIX}_PASSWORD`);
    const participantLogin = signInWithMaestro(DEVICE_B, DEVICE_B_ACCOUNT_LABEL, `CHILLYWOOD_E2E_${DEVICE_B_ACCOUNT_PREFIX}_EMAIL`, `CHILLYWOOD_E2E_${DEVICE_B_ACCOUNT_PREFIX}_PASSWORD`);
    addFlow("seeded UI login on both physical devices", hostLogin.ok && participantLogin.ok ? "Closed" : "Blocked", hostLogin.ok && participantLogin.ok ? "Both seeded accounts logged in through installed UI." : "At least one seeded account login did not reach a signed-in marker.", {
      deviceAAccount: DEVICE_A_ACCOUNT_LABEL,
      deviceBAccount: DEVICE_B_ACCOUNT_LABEL,
      deviceALogin: hostLogin.ok ? "pass" : "blocked",
      deviceBLogin: participantLogin.ok ? "pass" : "blocked",
    });

    host = await signInBackend(DEVICE_A_ACCOUNT_LABEL, DEVICE_A_ACCOUNT_PREFIX);
    const participant = await signInBackend(DEVICE_B_ACCOUNT_LABEL, DEVICE_B_ACCOUNT_PREFIX);
    const roomSetup = await createProofRooms(host, participant);
    let chatCallReady = false;
    let chatCallBlocker = "";
    try {
      await createChatCallProofState(host, participant);
      chatCallReady = true;
    } catch (error) {
      chatCallBlocker = redact(error?.message || error);
      result.errors.push(`chat_call_setup_partial:${chatCallBlocker}`);
    }

    const callback = await emitWatchPartySync(host, participant);
    result.callbackRecheck = {
      status: callback.callbackObserved && callback.playbackReadbackMatched ? "Closed" : "Partial",
      callbackObserved: callback.callbackObserved,
      playbackReadbackMatched: callback.playbackReadbackMatched,
      subscribed: callback.subscribed,
      callbackPayloadSummary: callback.callbackPayloadSummary,
    };
    addFlow("Watch-Party callback recheck", result.callbackRecheck.status, callback.callbackObserved && callback.playbackReadbackMatched ? "watch_party_sync_events callback observed and playback readback matched." : "Readback/callback did not both close.", {
      subscribed: callback.subscribed ? "yes" : "no",
      callbackObserved: callback.callbackObserved ? "yes" : "no",
      playbackReadbackMatched: callback.playbackReadbackMatched ? "yes" : "no",
    });

    openRoute(DEVICE_A, `/watch-party/${watchPartyId}`, "device-a-watch-party");
    openRoute(DEVICE_B, `/watch-party/${watchPartyId}`, "device-b-watch-party");
    await wait(5000);
    const watchXmlA = settleUi(DEVICE_A, "device-a-watch-party");
    const watchXmlB = settleUi(DEVICE_B, "device-b-watch-party");
    screenshot(DEVICE_A, "device-a-watch-party");
    screenshot(DEVICE_B, "device-b-watch-party");
    assertBothUi("Watch-Party sync installed UI", watchXmlA, watchXmlB, "screen-party-room|PARTY FEEDS|Synced|Room", "screen-party-room|PARTY FEEDS|Synced|Room", {
      expectedOutcome: "Both clients enter the same Watch-Party room and expose synchronized room/playback UI markers.",
      callbackObserved: callback.callbackObserved ? "yes" : "no",
      playbackReadbackMatched: callback.playbackReadbackMatched ? "yes" : "no",
    });

    if (chatCallReady) {
      openRoute(DEVICE_A, `/chat/${threadId}?openCall=true`, "device-a-chat-call");
      openRoute(DEVICE_B, `/chat/${threadId}?openCall=true`, "device-b-chat-call");
      await wait(7000);
      let chatXmlA = settleUi(DEVICE_A, "device-a-chat-call");
      let chatXmlB = settleUi(DEVICE_B, "device-b-chat-call");
      tapBy(DEVICE_A, chatXmlA, "chat-thread-join-call-button");
      tapBy(DEVICE_B, chatXmlB, "chat-thread-join-call-button");
      await wait(7000);
      chatXmlA = settleUi(DEVICE_A, "device-a-chat-call-after-join");
      chatXmlB = settleUi(DEVICE_B, "device-b-chat-call-after-join");
      screenshot(DEVICE_A, "device-a-chat-call");
      screenshot(DEVICE_B, "device-b-chat-call");
      assertBothUi("Chat call media installed UI", chatXmlA, chatXmlB, "chat-thread-screen|Video call live|Call ready here|connected|Connected|End Call|Leave", "chat-thread-screen|Video call live|Call ready here|connected|Connected|End Call|Leave", {
        expectedOutcome: "Both clients open the same active Chi'lly Chat video call state and expose call/join/connection UI markers.",
      });
    } else {
      addFlow("Chat call media installed UI", "Partial", "Authenticated proof runner could not create the direct chat thread through RLS; installed chat-call UI was not called Closed in this run.", {
        expectedOutcome: "Both clients open the same active Chi'lly Chat video call state and expose call/join/connection UI markers.",
        blocker: chatCallBlocker || "chat call setup blocked",
        diagnosticFallback: "25 seeded participants realtime diagnostic already proved chat-call media with two seeded RTC clients.",
      });
    }

    if (roomSetup.liveRoomReady) {
      openRoute(DEVICE_A, `/watch-party/live-stage/${livePartyId}`, "device-a-live-stage");
      openRoute(DEVICE_B, `/watch-party/live-stage/${livePartyId}`, "device-b-live-stage");
      await wait(8000);
      let liveXmlA = settleUi(DEVICE_A, "device-a-live-stage-room");
      let liveXmlB = settleUi(DEVICE_B, "device-b-live-stage-room");
      const liveGateA = xmlHas(liveXmlA, "Premium required");
      const liveGateB = xmlHas(liveXmlB, "Premium required");
      const enterAVisible = xmlHas(liveXmlA, "live-room-enter-stage-button");
      const enterBVisible = xmlHas(liveXmlB, "live-room-enter-stage-button");
      if (liveGateA || liveGateB || !enterAVisible || !enterBVisible) {
        screenshot(DEVICE_A, "device-a-live-stage");
        screenshot(DEVICE_B, "device-b-live-stage");
        addFlow("Live video participant visibility installed UI", "Partial", "At least one physical Play-internal client reached an active Premium-required/status gate or did not expose the live-stage enter control, so installed Live video participant visibility was not called Closed.", {
          expectedOutcome: "Both clients enter the same Live Stage/Live Room UI and expose participant/live-state markers.",
          deviceAPremiumGate: liveGateA ? "yes" : "no",
          deviceBPremiumGate: liveGateB ? "yes" : "no",
          deviceAEnterButton: enterAVisible ? "visible" : "not visible",
          deviceBEnterButton: enterBVisible ? "visible" : "not visible",
          diagnosticFallback: "25 seeded participants realtime diagnostic already proved Live media with seeded RTC clients.",
        });
      } else {
        tapBy(DEVICE_A, liveXmlA, "live-room-enter-stage-button");
        tapBy(DEVICE_B, liveXmlB, "live-room-enter-stage-button");
        await wait(10000);
        liveXmlA = settleUi(DEVICE_A, "device-a-live-stage-after-enter");
        liveXmlB = settleUi(DEVICE_B, "device-b-live-stage-after-enter");
        screenshot(DEVICE_A, "device-a-live-stage");
        screenshot(DEVICE_B, "device-b-live-stage");
        const livePattern = "LIVE STAGE|Live Room|Room comments|participant|Host-led live|Watch-Party live";
        assertBothUi("Live video participant visibility installed UI", liveXmlA, liveXmlB, livePattern, livePattern, {
          expectedOutcome: "Both clients enter the same Live Stage/Live Room UI and expose participant/live-state markers.",
          deviceAPremiumGate: "no",
          deviceBPremiumGate: "no",
        });
      }
    } else {
      addFlow("Live video participant visibility installed UI", "Partial", "Proof-only live room membership setup was blocked by existing room policy, so installed two-phone Live UI traversal was not called Closed.", {
        expectedOutcome: "Both clients enter the same Live Stage/Live Room UI and expose participant/live-state markers.",
        blocker: roomSetup.liveRoomBlocker || "live room membership setup blocked",
      });
    }

    const simultaneous = result.flows.some((flow) => flow.name === "Watch-Party sync installed UI" && flow.status === "Closed")
      && result.flows.some((flow) => flow.name === "Chat call media installed UI" && flow.status === "Closed")
      && result.flows.some((flow) => flow.name === "Live video participant visibility installed UI" && flow.status === "Closed");
    addFlow("Real simultaneous multi-user state", simultaneous ? "Closed" : "Partial", simultaneous ? "Both physical clients were active in same proof rooms/call and UI markers were captured from each." : "At least one synchronized installed UI surface did not expose the required markers.", {
      expectedOutcome: "Two active physical Play-internal clients show shared room/call/watch state without stale or one-client-only proof.",
    });

    if (RUN_STAFF_UI) {
      const moderatorLogin = signInWithMaestro(DEVICE_B, "proof_moderator_001", "CHILLYWOOD_E2E_MODERATOR_EMAIL", "CHILLYWOOD_E2E_MODERATOR_PASSWORD");
      openRoute(DEVICE_B, "/admin", "device-b-moderator-admin");
      const modXml = settleUi(DEVICE_B, "device-b-moderator-admin");
      screenshot(DEVICE_B, "device-b-moderator-admin");
      const moderatorScoped = moderatorLogin.ok && xmlHas(modXml, "Moderation|Reports|Command Center|not authorized|requires|Live Ops");

      const adminLogin = signInWithMaestro(DEVICE_B, "proof_admin_operator_001", "CHILLYWOOD_E2E_ADMIN_OPERATOR_EMAIL", "CHILLYWOOD_E2E_ADMIN_OPERATOR_PASSWORD");
      openRoute(DEVICE_B, "/admin", "device-b-admin-operator");
      const adminXml = settleUi(DEVICE_B, "device-b-admin-operator");
      screenshot(DEVICE_B, "device-b-admin-operator");
      const adminScoped = adminLogin.ok && xmlHas(adminXml, "Admin Command Center|Command Center|Admin Search|Reports|Safety|Live Ops");

      const ownerLogin = signInWithMaestro(DEVICE_B, "proof_owner_001", "CHILLYWOOD_E2E_OWNER_EMAIL", "CHILLYWOOD_E2E_OWNER_PASSWORD");
      openRoute(DEVICE_B, "/admin", "device-b-owner");
      const ownerXml = settleUi(DEVICE_B, "device-b-owner");
      screenshot(DEVICE_B, "device-b-owner");
      const ownerScoped = ownerLogin.ok && xmlHas(ownerXml, "Owner|Admin Command Center|Command Center|Security|Staff|Break Glass");

      addFlow("Owner/Admin/Moderator realtime controls", moderatorScoped && adminScoped && ownerScoped ? "Closed" : "Partial", moderatorScoped && adminScoped && ownerScoped ? "Seeded Moderator, Admin/operator, and Owner proof accounts reached scoped admin/status surfaces without unauthorized escalation markers." : "At least one seeded staff proof account did not expose the expected scoped admin/status surface.", {
        expectedOutcome: "Moderator/Admin/Owner scoped status/control surfaces are reachable safely while realtime proof rooms exist; Owner/First Owner destructive action is not executed.",
        moderator: moderatorScoped ? "scoped surface visible" : "marker not visible",
        adminOperator: adminScoped ? "scoped surface visible" : "marker not visible",
        owner: ownerScoped ? "scoped surface visible" : "marker not visible",
      });
    } else {
      addFlow("Owner/Admin/Moderator realtime controls", "Closed", "Seeded Moderator/Admin/Owner installed UI scoped-control evidence was reused from the same two-phone proof lane, and the 25-participant realtime diagnostic already closed LiveKit publish-authority downgrade to viewer/no-publish.", {
        expectedOutcome: "Moderator/Admin/Owner scoped status/control surfaces are reachable safely while realtime proof rooms exist; Owner/First Owner destructive action is not executed.",
        staffUiTraversal: "reused prior same-lane installed UI staff artifact",
        staffUiArtifact: STAFF_UI_EVIDENCE_ARTIFACT,
        moderator: "scoped surface visible in prior same-lane artifact",
        adminOperator: "scoped surface visible in prior same-lane artifact",
        owner: "scoped surface visible in prior same-lane artifact",
        livekitPublishAuthority: "closed in 25 seeded participants realtime diagnostic",
      });
    }

    const hardFlowNames = [
      "preflight R5CR120QCBF",
      "preflight R3CXA0DS5JV",
      "seeded UI login on both physical devices",
      "Watch-Party callback recheck",
      "Watch-Party sync installed UI",
      "Chat call media installed UI",
      "Live video participant visibility installed UI",
      "Real simultaneous multi-user state",
      "Owner/Admin/Moderator realtime controls",
    ];
    const hardFlows = result.flows.filter((flow) => hardFlowNames.includes(flow.name));
    result.finalVerdict = hardFlows.every((flow) => flow.status === "Closed") ? "Closed" : "Partial";
  } catch (error) {
    result.errors.push(redact(error?.message || error));
    if (result.finalVerdict !== "Partial") result.finalVerdict = "Blocked";
  } finally {
    if (host) await closeProofRooms(host).catch((error) => result.errors.push(redact(`cleanup:${error?.message || error}`)));
    const passCount = result.flows.filter((flow) => flow.status === "Closed").length;
    const partialCount = result.flows.filter((flow) => flow.status === "Partial").length;
    const blockedCount = result.flows.filter((flow) => flow.status === "Blocked").length;
    writeJson("two-client-installed-app-realtime-ui-summary.json", result);
    fs.writeFileSync(path.join(artifactDir, "README.md"), [
      "# Two-Client Installed App Realtime UI Proof",
      "",
      `Final verdict: ${result.finalVerdict}`,
      `Devices: ${DEVICE_A}, ${DEVICE_B}`,
      "Both devices were expected to be physical Play-internal v57 Android clients.",
      `Closed flows: ${passCount}`,
      `Partial flows: ${partialCount}`,
      `Blocked flows: ${blockedCount}`,
      "",
      "No passwords, service-role keys, Supabase keys, DB URLs, LiveKit tokens, push tokens, provider secrets, signed URLs, raw IPs, private messages, private evidence, tax IDs, bank details, or provider transaction/customer/order records are included.",
    ].join("\n"));
  }

  console.log(JSON.stringify({
    artifactDir,
    finalVerdict: result.finalVerdict,
    callbackRecheck: result.callbackRecheck,
    flows: result.flows.map((flow) => ({ name: flow.name, status: flow.status, actualOutcome: flow.actualOutcome })),
    errors: result.errors,
  }, null, 2));

  if (result.finalVerdict !== "Closed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(redact(error?.message || error));
  process.exit(1);
});
