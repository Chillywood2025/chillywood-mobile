#!/usr/bin/env node
// Required disposable-local integration: production legacy hooks and actual
// authenticated Supabase APIs/private Realtime carry native Chromium SDP/RTP.
// Synthetic local capture is the only media source. Invite acceptance uses the
// canonical service-only SQL transaction; Edge delivery and devices are outside
// this baseline. The service key never enters the browser.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import { createRequire } from "node:module";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";
import { normalizeCommunicationRoomIdentifier } from "../_lib/communicationRoomIdentifier.mjs";
import { buildLegacyPairedBrowserBundle } from "../tests/assurance/helpers/legacy-paired-browser-harness.mjs";

const secrets = new Set();
const redact = (input) => {
  let value = String(input);
  for (const secret of secrets) if (secret) value = value.split(secret).join("[redacted]");
  return value.replace(/Bearer\s+\S+/giu, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu, "[redacted JWT]");
};
const requireData = (result, label) => {
  if (result.error) throw new Error(`${label}: ${redact(result.error.message ?? "request failed")}`);
  return result.data;
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const receivedAudio = (endpoint) => endpoint.audioReceivers.filter((receiver) => receiver.connection === "connected");
const pcm = (endpoint, name) => receivedAudio(endpoint).reduce((sum, receiver) => (
  sum + (!receiver.error && Number.isFinite(receiver[name]) ? receiver[name] : Number.NaN)
), 0);
const energy = (endpoint) => pcm(endpoint, "pcmEnergy");
const samples = (endpoint) => pcm(endpoint, "pcmSamples");
const packets = (endpoint) => endpoint.stats.filter((report) => report.kind === "audio")
  .reduce((sum, report) => sum + report.packets, 0);
const frames = (endpoint) => endpoint.stats.filter((report) => report.kind === "video")
  .reduce((sum, report) => sum + report.frames, 0);
const colored = (endpoint) => endpoint.pixels.some((frame) => frame.brightness > 20);
const connected = (endpoint) => endpoint.peers.filter((peer) => peer.connection === "connected" && peer.signaling === "stable");
const hasMedia = (endpoint) => endpoint.channelState === "live" && connected(endpoint).length === 1
  && packets(endpoint) > 0 && samples(endpoint) > 2048 && energy(endpoint) > 0 && frames(endpoint) > 5 && colored(endpoint);
const advances = (endpoint, baseline) => packets(endpoint) > packets(baseline) && samples(endpoint) > samples(baseline)
  && energy(endpoint) > energy(baseline) && frames(endpoint) > frames(baseline) + 3 && colored(endpoint)
  && endpoint.pixels.some((frame) => frame.fingerprint !== baseline.pixels.find((old) => old.peerId === frame.peerId)?.fingerprint);
const diagnostics = (state) => redact(JSON.stringify({
  roomId: state?.roomId,
  errors: state?.errors,
  reportedErrors: state?.events?.filter((event) => event.kind === "reported-error").slice(-20),
  endpoints: state?.endpoints?.map((endpoint) => ({
    userId: endpoint.userId, instanceId: endpoint.instanceId, channelState: endpoint.channelState,
    error: endpoint.error, appState: endpoint.appState, cameraEnabled: endpoint.cameraEnabled,
    micEnabled: endpoint.micEnabled, membership: endpoint.membership, peers: endpoint.peers,
    tracks: endpoint.tracks, stats: endpoint.stats, audioReceivers: endpoint.audioReceivers, pixels: endpoint.pixels,
  })),
}));

async function main() {
  const bundle = buildLegacyPairedBrowserBundle({
    sourceRoot: process.env.CHILLY_CHAT_SOURCE_ROOT || process.cwd(), authenticatedBackend: true,
  });
  new vm.Script(bundle, { filename: "authenticated-legacy-browser-bundle.js" });
  if (process.argv.includes("--check-source")) {
    console.log("authenticated real-peer browser bundle syntax: PASS; backend and RTC integration NOT RUN");
    return;
  }

  const environment = {};
  try {
    execFileSync("supabase", ["status", "--help"], { stdio: "ignore" });
    const output = execFileSync("supabase", ["status", "-o", "env"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of output.split(/\r?\n/u)) {
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const value = line.slice(separator + 1).trim();
      environment[line.slice(0, separator).trim()] = value.startsWith('"') ? JSON.parse(value) : value;
    }
  } catch {
    throw new Error("LOCAL_SUPABASE_REQUIRED: start/reset the disposable local stack with repository migrations; integration NOT RUN");
  }
  const apiUrl = new URL(environment.API_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(apiUrl.hostname), "disposable loopback Supabase only");
  assert.equal(apiUrl.protocol, "http:", "the disposable local stack uses HTTP on loopback");
  assert.ok(environment.ANON_KEY && environment.SERVICE_ROLE_KEY, "local CLI credentials are required");
  secrets.add(environment.ANON_KEY); secrets.add(environment.SERVICE_ROLE_KEY);
  const apiOrigin = apiUrl.origin;
  const websocketOrigin = apiOrigin.replace(/^http:/u, "ws:");
  const localFetch = (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    assert.equal(url.origin, apiOrigin, "Node fixture requests stay on the disposable local API");
    assert.ok(/^\/(?:auth|rest)\/v1\//u.test(url.pathname), "Node setup cannot invoke providers or Edge delivery");
    return fetch(input, { ...init, redirect: "error", signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(20_000)]) });
  };
  const options = { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: localFetch } };
  const admin = createClient(apiOrigin, environment.SERVICE_ROLE_KEY, options);
  const clients = [], users = [], endpoints = [], roomIds = [];
  const nonce = crypto.randomBytes(6).toString("hex");
  const password = `Local-${crypto.randomBytes(16).toString("hex")}!`;
  secrets.add(password);
  let threadId, browser, context, page, server;
  let failed = false;
  const networkFailures = [], browserErrors = [];
  const browserRequests = new Map();
  let realtimeSockets = 0;

  const read = async () => {
    assert.deepEqual(networkFailures, [], "browser network stays within the local fixture/API allowlist");
    assert.deepEqual(browserErrors, [], "browser must not throw");
    const state = await page.evaluate(() => window.__pairedCall.read());
    assert.equal(state.authenticatedBackend, true, "this gate requires the actual authenticated backend adapter");
    assert.deepEqual(state.errors, [], `browser fixture errors: ${diagnostics(state)}`);
    return state;
  };
  const wait = async (predicate, label, timeout = 20_000) => {
    const deadline = Date.now() + timeout;
    let state;
    while (Date.now() < deadline) {
      state = await read();
      if (predicate(state)) return state;
      await pause(100);
    }
    throw new Error(`${label}: ${diagnostics(state)}`);
  };
  const rows = async (roomId) => requireData(await admin.from("communication_room_memberships")
    .select("user_id,membership_generation,membership_admission_attempt,membership_state,camera_enabled,mic_enabled,left_at")
    .eq("room_id", roomId), "authoritative local membership readback");
  const terminalize = (inviteId) => admin.rpc("transition_chilly_chat_call_invite", {
    p_invite_id: inviteId, p_actor_user_id: users[0], p_target_status: "ended", p_duration_seconds: 1,
  });
  const createAcceptedCall = async (suffix) => {
    const roomId = `BHTTP${nonce}${suffix}`.toUpperCase();
    assert.equal(normalizeCommunicationRoomIdentifier(roomId), roomId, "fixture room ID obeys the production identifier contract");
    requireData(await clients[0].from("communication_rooms").insert({
      room_id: roomId, room_code: roomId, host_user_id: users[0], status: "active", content_access_rule: "open",
    }), "authenticated room creation");
    roomIds.push(roomId);
    const started = requireData(await clients[0].rpc("begin_chilly_chat_call", {
      p_thread_id: threadId, p_communication_room_id: roomId, p_call_type: "video",
    }), "authenticated exact-thread call begin");
    assert.ok(started.created && started.invite?.id, "a distinct actual call invitation was created");
    assert.equal(started.invite.thread_id, threadId);
    assert.equal(started.invite.communication_room_id, roomId);
    assert.equal(started.invite.caller_user_id, users[0]);
    assert.equal(started.invite.callee_user_id, users[1]);
    assert.equal(started.invite.call_type, "video");
    assert.equal(started.invite.status, "ringing");
    assert.equal(started.invite.chat_call_media_provider, "legacy_webrtc", "actual immutable invite provider must select legacy hooks; the fixture never overrides provider authority");
    assert.equal(Date.parse(started.invite.expires_at) - Date.parse(started.invite.created_at), 90_000, "actual call begin declares the current server ringing deadline");
    requireData(await admin.rpc("transition_chilly_chat_call_invite", {
      p_invite_id: started.invite.id, p_actor_user_id: users[1], p_target_status: "accepted", p_duration_seconds: null,
    }), "canonical server Answer setup transaction");
    const accepted = requireData(await clients[0].from("chat_call_invites")
      .select("status,accepted_at,ended_at,chat_call_media_provider").eq("id", started.invite.id).single(),
    "authenticated accepted-invite readback");
    assert.equal(accepted.status, "accepted");
    assert.ok(accepted.accepted_at && accepted.ended_at === null);
    assert.equal(accepted.chat_call_media_provider, "legacy_webrtc");
    return { roomId, inviteId: started.invite.id };
  };
  const proveOwnedRows = async (roomId, state, expectedMedia) => {
    const current = await rows(roomId);
    assert.equal(current.length, 2, "both browser hooks own a real PostgreSQL row");
    for (const endpoint of state.endpoints) {
      const row = current.find((candidate) => candidate.user_id === endpoint.userId);
      assert.ok(row?.membership_admission_attempt && row.membership_generation, "browser used modern owned admission");
      assert.equal(row.membership_generation, endpoint.membership?.membershipGeneration, "browser authority matches actual PostgreSQL generation");
      assert.equal(row.membership_state, "active");
      assert.equal(row.left_at, null);
      const expected = expectedMedia(endpoint.userId);
      assert.equal(row.mic_enabled, expected.mic, "actual PostgreSQL microphone state");
      assert.equal(row.camera_enabled, expected.camera, "actual PostgreSQL camera state");
    }
  };
  const endAndProve = async (call) => {
    await page.evaluate(() => window.__pairedCall.end());
    await wait((state) => state.endpoints.length === 2 && [...state.endpoints, ...state.retiredEndpoints].every((endpoint) => (
      endpoint.peers.every((peer) => peer.connection === "closed") && endpoint.tracks.every((track) => track.state === "ended")
    )), "actual browser End must close every native peer and acquired track");
    const current = await rows(call.roomId);
    assert.equal(current.length, 2);
    assert.ok(current.every((row) => row.membership_state === "left" && row.left_at && !row.mic_enabled && !row.camera_enabled),
      "actual hook End must leave both PostgreSQL memberships terminal with media false before server invite cleanup");
    requireData(await terminalize(call.inviteId), "canonical server End transaction");
    const thread = requireData(await clients[0].from("chat_threads").select("active_communication_room_id,active_call_type")
      .eq("id", threadId).single(), "terminal thread binding readback");
    assert.equal(thread.active_communication_room_id, null);
    assert.equal(thread.active_call_type, null);
  };

  try {
    for (const label of ["caller", "callee"]) {
      const email = `browser-http-${label}-${nonce}@example.invalid`;
      const created = requireData(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "create isolated browser user");
      users.push(created.user.id);
      const displayName = `Browser ${label}`;
      requireData(await admin.from("user_profiles").upsert({
        user_id: created.user.id, username: `browser_${users.length}_${nonce}`, display_name: displayName,
      }), "isolated profile fixture");
      const client = createClient(apiOrigin, environment.ANON_KEY, options);
      clients.push(client);
      const signedIn = requireData(await client.auth.signInWithPassword({ email, password }), "actual browser-owner sign in");
      assert.ok(signedIn.session?.access_token && signedIn.session.refresh_token, "actual authenticated session exists");
      const { access_token, refresh_token } = signedIn.session;
      secrets.add(access_token); secrets.add(refresh_token);
      endpoints.push({ userId: created.user.id, displayName, session: { access_token, refresh_token } });
    }
    threadId = requireData(await clients[0].rpc("get_or_create_direct_chat_thread", {
      p_target_user_id: users[1],
    }), "authenticated direct thread")[0].thread_id;
    const initialCall = await createAcceptedCall("FIRST");
    server = http.createServer((request, response) => {
      response.setHeader("Cache-Control", "no-store");
      // CSP also confines redirected fetches, which are not necessarily routed
      // a second time by Playwright. Blob modules are the received-PCM worklet.
      response.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'self' 'unsafe-eval' blob:; connect-src ${apiOrigin} ${websocketOrigin}; media-src blob:; worker-src blob:`);
      if (request.url === "/fixture.js") {
        response.setHeader("Content-Type", "application/javascript"); response.end(bundle);
      } else if (request.url === "/") {
        response.setHeader("Content-Type", "text/html");
        response.end('<!doctype html><html><body><script src="/fixture.js"></script></body></html>');
      } else { response.statusCode = 404; response.end(); }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const fixtureOrigin = `http://127.0.0.1:${server.address().port}`;
    const require = createRequire(new URL("../tests/integration/real-peer-browser/package.json", import.meta.url));
    const { chromium } = require("./node_modules/playwright");
    browser = await chromium.launch({
      headless: true, executablePath: process.env.CHILLY_CHAT_CHROMIUM_PATH || undefined,
      args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--allow-loopback-in-peer-connection"],
    });
    console.log(`Authenticated real-peer integration: Chromium ${browser.version()}, actual local Auth/PostgREST/private Realtime, synthetic capture; service-only SQL Answer setup`);
    context = await browser.newContext({ serviceWorkers: "block" });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin === fixtureOrigin || (url.origin === apiOrigin && /^\/(?:auth|rest|realtime)\/v1\//u.test(url.pathname))) {
        if (url.origin === apiOrigin) browserRequests.set(url.pathname, (browserRequests.get(url.pathname) ?? 0) + 1);
        return route.continue();
      }
      networkFailures.push("unexpected browser HTTP destination");
      return route.abort();
    });
    await context.routeWebSocket("**/*", (socket) => {
      const url = new URL(socket.url());
      if (url.origin === websocketOrigin && url.pathname === "/realtime/v1/websocket") {
        realtimeSockets += 1;
        socket.connectToServer();
      } else {
        networkFailures.push("unexpected browser WebSocket destination");
        void socket.close();
      }
    });
    page = await context.newPage();
    page.on("pageerror", (error) => browserErrors.push(redact(error.message)));
    await page.goto(fixtureOrigin);
    await page.evaluate((backend) => window.__pairedCall.start({ callType: "video", backend }), {
      apiUrl: apiOrigin, anonKey: environment.ANON_KEY, roomId: initialCall.roomId, hostUserId: users[0], endpoints,
    });
    const initial = await wait((state) => state.endpoints.length === 2 && state.endpoints.every(hasMedia),
      "authenticated production hooks must receive actual audio RTP/PCM and decoded video through private SDK Realtime");
    await wait((state) => state.endpoints.every((endpoint) => advances(endpoint, initial.endpoints.find((old) => old.userId === endpoint.userId))),
      "both authenticated endpoints must receive advancing audio and changing video pixels");
    await proveOwnedRows(initialCall.roomId, await read(), () => ({ mic: true, camera: true }));
    assert.ok(realtimeSockets >= 2, "independent authenticated endpoint SDK WebSockets reached local Realtime");
    assert.ok((browserRequests.get("/rest/v1/rpc/join_owned_communication_room_session") ?? 0) >= 2, "both browser hooks performed actual owned-admission HTTP requests");
    assert.ok((browserRequests.get("/rest/v1/rpc/broadcast_owned_communication_room_signal") ?? 0) > 0, "actual browser-owned signals traversed the server RPC");
    console.log("PASS: authenticated production hooks -> owned PostgreSQL admission -> private SDK Realtime -> real received RTP/PCM/video");

    for (const userId of users) {
      assert.equal(await page.evaluate((id) => window.__pairedCall.control(id, "setMicrophoneEnabled", false), userId), true);
      let projected = await wait((state) => state.endpoints.every((endpoint) => endpoint.participants.some((participant) => participant.userId === userId && participant.micOn === false)),
        "authenticated mute must project through both production hooks");
      await proveOwnedRows(initialCall.roomId, projected, (id) => ({ mic: id !== userId, camera: true }));
      await pause(300);
      const silentStart = (await read()).endpoints.find((endpoint) => endpoint.userId !== userId);
      await pause(300);
      const silentEnd = (await read()).endpoints.find((endpoint) => endpoint.userId !== userId);
      assert.ok(samples(silentEnd) > samples(silentStart) && packets(silentEnd) > packets(silentStart), "mute preserves actual received PCM samples and RTP for the silence measurement");
      assert.ok(energy(silentEnd) - energy(silentStart) < 0.0001, "actual receiver observes muted PCM silence");
      assert.equal(await page.evaluate((id) => window.__pairedCall.control(id, "setMicrophoneEnabled", true), userId), true);
      assert.equal(await page.evaluate((id) => window.__pairedCall.control(id, "toggleCamera"), userId), true);
      projected = await wait((state) => state.endpoints.every((endpoint) => endpoint.participants.some((participant) => participant.userId === userId && participant.cameraOn === false && participant.micOn === true)),
        "authenticated camera-off and unmute project through both hooks");
      await proveOwnedRows(initialCall.roomId, projected, (id) => ({ mic: true, camera: id !== userId }));
      await wait((state) => {
        const receiver = state.endpoints.find((endpoint) => endpoint.userId !== userId);
        return receiver.pixels.length > 0 && receiver.pixels.every((frame) => frame.brightness < 5);
      }, "camera off must remove the actual picture at the receiving endpoint");
      assert.equal(await page.evaluate((id) => window.__pairedCall.control(id, "toggleCamera"), userId), true);
      const baseline = await read();
      const restored = await wait((state) => state.endpoints.every((endpoint) => hasMedia(endpoint)
        && advances(endpoint, baseline.endpoints.find((old) => old.userId === endpoint.userId))),
      "restored controls must preserve one peer and advancing actual received audio/video");
      await proveOwnedRows(initialCall.roomId, restored, () => ({ mic: true, camera: true }));
    }
    console.log("PASS: both endpoints commit actual PostgreSQL mic/camera controls and observe receiver silence, black frames, and restored media");
    const beforeEnd = await read();
    await endAndProve(initialCall);
    console.log("PASS: browser End stops native capture/peers and confirms real PostgreSQL terminal media state");

    const fresh = await createAcceptedCall("FRESH");
    await page.evaluate((roomId) => window.__pairedCall.freshCall({ roomId }), fresh.roomId);
    const oldPeerIds = beforeEnd.endpoints.flatMap((endpoint) => endpoint.peers.map((peer) => peer.id));
    const freshInitial = await wait((state) => state.roomId === fresh.roomId && state.endpoints.length === 2
      && state.endpoints.every((endpoint) => {
        const previous = beforeEnd.endpoints.find((old) => old.userId === endpoint.userId);
        return endpoint.instanceId === previous.instanceId && hasMedia(endpoint)
          && endpoint.membership.membershipGeneration !== previous.membership.membershipGeneration
          && connected(endpoint).every((peer) => !oldPeerIds.includes(peer.id))
          && endpoint.stats.every((report) => !oldPeerIds.includes(report.peerId))
          && receivedAudio(endpoint).every((receiver) => !oldPeerIds.includes(receiver.peerId))
          && endpoint.pixels.every((frame) => !oldPeerIds.includes(frame.peerId));
      }), "fresh accepted room must receive media in the same mounted hooks using new server generations and peers");
    const freshAdvanced = await wait((state) => state.endpoints.every((endpoint) => hasMedia(endpoint)
      && advances(endpoint, freshInitial.endpoints.find((old) => old.userId === endpoint.userId))),
    "fresh-room media must advance independently of all prior peer counters");
    await proveOwnedRows(fresh.roomId, freshAdvanced, () => ({ mic: true, camera: true }));
    await endAndProve(fresh);
    console.log("PASS: fresh authenticated accepted call in the same hooks/context receives advancing media and completes real server/native cleanup");
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    const cleanupErrors = [];
    const cleanup = async (label, operation) => {
      try { const result = await operation(); if (result?.error) cleanupErrors.push(label); }
      catch { cleanupErrors.push(label); }
    };
    if (page) await cleanup("browser media disposal", () => page.evaluate(() => window.__pairedCall?.dispose()));
    if (context) await cleanup("browser context", () => context.close());
    if (browser) await cleanup("browser", () => browser.close());
    if (server) await cleanup("fixture server", () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
    for (const client of clients) await cleanup("session signout", () => client.auth.signOut({ scope: "local" }));
    if (threadId) await cleanup("thread fixture", () => admin.from("chat_threads").delete().eq("id", threadId));
    if (roomIds.length) {
      for (const table of ["communication_room_memberships", "communication_rooms"]) {
        await cleanup(table, () => admin.from(table).delete().in("room_id", roomIds));
      }
    }
    for (const userId of users) await cleanup("user fixture", () => admin.auth.admin.deleteUser(userId));
    if (cleanupErrors.length) {
      if (!failed) throw new Error(`local fixture cleanup failed: ${cleanupErrors.join(", ")}`);
      console.error(`local fixture cleanup also failed: ${cleanupErrors.join(", ")}`);
    }
  }
}

main().catch((error) => {
  console.error(redact(error.stack ?? error));
  process.exitCode = 1;
});
