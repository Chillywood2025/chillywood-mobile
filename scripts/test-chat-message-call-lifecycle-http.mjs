#!/usr/bin/env node
// Disposable LOCAL Supabase integration. Text messaging, reads, call begin,
// account publication, and frozen-session mutation transport execute production
// source against real Auth/PostgREST/RLS. Terminal transitions execute the real
// service-only SQL transaction used by the server dispatcher. This does NOT
// certify the Edge dispatcher, notification delivery, native UI, or devices.
// Setup: install locked root dependencies, start/reset the local Supabase stack
// with all repository migrations, then run this script from the repository root.
// No project URL/key overrides are accepted. No delivery worker is invoked.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import * as boundRpc from "../_lib/accountBoundSupabaseRpc.mjs";
import * as mediaPolicy from "../_lib/communicationCallMediaPolicy.mjs";
import { loadCommunicationApiSource } from "../tests/assurance/helpers/communication-api-source.mjs";

function loadSource(file, imports, source = fs.readFileSync(file, "utf8")) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console, setTimeout, clearTimeout,
    crypto: crypto.webcrypto, process: { env: {} },
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `${file}: unexpected dependency ${name}`);
      return imports[name];
    },
  }, { filename: file });
  return module.exports;
}

// These production auth helpers are selected verbatim by AST. Unrelated
// Watch-Party/native imports are not loaded into the Node integration runtime.
function loadWritableIdentity(client) {
  const file = "_lib/watchParty.ts";
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const names = new Set(["UUID_REGEX", "looksLikeUuid", "getAuthBackedUserId", "getWritablePartyUserId"]);
  const selected = ast.statements.filter((node) => {
    if (ts.isFunctionDeclaration(node)) return names.has(node.name?.text);
    return ts.isVariableStatement(node)
      && node.declarationList.declarations.some((declaration) => names.has(declaration.name.getText(ast)));
  });
  assert.equal(selected.length, names.size, "production identity helper extraction remains exact");
  return loadSource(file, { "./supabase": { supabase: client } },
    `import { supabase } from "./supabase";\n${selected.map((node) => node.getText(ast)).join("\n")}`);
}

function unavailableModule(label) {
  return new Proxy({}, { get(_target, name) {
    throw new Error(`out-of-scope ${label} dependency accessed: ${String(name)}`);
  } });
}

async function loadChatSource(client, connection, { initializeAuthority = true } = {}) {
  const bootstrap = { supabase: client, SUPABASE_URL: connection.apiUrl, SUPABASE_ANON_KEY: connection.anonKey };
  const deadlines = loadSource("_lib/entitlementAuthority.ts", {});
  const authority = loadSource("_lib/accountSessionAuthority.ts", {
    "./supabase": bootstrap, "./entitlementAuthority": deadlines,
  });
  const refreshAuthority = async () => {
    const binding = await authority.readCurrentAccountSessionAuthority();
    assert.ok(binding, "real server exact-session authority is required");
    authority.publishAccountSessionAuthoritySnapshot(binding);
    return binding;
  };
  if (initializeAuthority) await refreshAuthority();
  const mutation = loadSource("_lib/accountBoundSupabaseMutation.ts", {
    "./supabase": bootstrap, "./entitlementAuthority": deadlines,
    "./accountSessionAuthority": authority, "./accountBoundSupabaseRpc.mjs": boundRpc,
    "react-native": { Platform: { OS: "ios" } },
  });
  const communication = loadCommunicationApiSource(client, mutation.runExactSessionAccountBoundSupabaseMutationRpc);
  const errors = loadSource("_lib/userFacingErrors.ts", {});
  const calls = loadSource("_lib/chillyChatCalls.ts", {
    "./supabase": bootstrap, "./accountSessionAuthority": authority,
    "./accountBoundSupabaseMutation": mutation,
    "./chillyChatCallDispatchSchema": loadSource("_lib/chillyChatCallDispatchSchema.ts", {}),
  });
  const attachments = loadSource("_lib/socialAttachments.ts", {
    "./supabase": bootstrap, "./userFacingErrors": errors,
    "./imageUploadNormalization": unavailableModule("attachment upload"),
    "./mediaStorage": unavailableModule("attachment provider"),
  });
  const diagnostics = [];
  const chat = loadSource("_lib/chat.ts", {
    "./communication": communication, "./chillyChatCalls": calls,
    "./socialAttachments": attachments, "./supabase": bootstrap,
    "./peopleSearchNormalization": loadSource("_lib/peopleSearchNormalization.ts", {}),
    "./watchParty": loadWritableIdentity(client), "./accountSessionAuthority": authority,
    "./accountBoundSupabaseMutation": mutation, "./communicationCallMediaPolicy.mjs": mediaPolicy,
    "./logger": { reportRuntimeError: (label) => diagnostics.push(label) },
    "./userFacingErrors": errors,
  });
  return { chat, calls, communication, mutation, authority, refreshAuthority, diagnostics };
}

if (process.argv.includes("--check-source")) {
  await loadChatSource(unavailableModule("database access during source check"),
    { apiUrl: "http://127.0.0.1:54321", anonKey: "source-check-no-key" }, { initializeAuthority: false });
  console.log("chat message/call lifecycle module wiring: PASS; backend integration NOT RUN");
  process.exit(0);
}

const environment = {};
try {
  // Discover the installed CLI contract before requesting its local status.
  execFileSync("supabase", ["status", "--help"], { stdio: "ignore" });
  const status = execFileSync("supabase", ["status", "-o", "env"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  for (const line of status.split(/\r?\n/u)) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const value = line.slice(separator + 1).trim();
    environment[line.slice(0, separator).trim()] = value.startsWith('"') ? JSON.parse(value) : value;
  }
} catch {
  throw new Error("LOCAL_SUPABASE_REQUIRED: start the disposable local stack with repository migrations; this test was NOT RUN");
}
const apiUrl = environment.API_URL;
const origin = new URL(apiUrl).origin;
assert.ok(["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname), "disposable local Supabase only");
assert.ok(environment.ANON_KEY && environment.SERVICE_ROLE_KEY, "local CLI credentials required");
const originalFetch = globalThis.fetch;
let heldRead = null;
const localFetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  assert.equal(url.origin, origin, "this test never contacts a remote API or provider");
  const response = await originalFetch(input, init);
  if (heldRead && url.pathname === "/rest/v1/chat_threads" && (!init?.method || init.method === "GET")) {
    const gate = heldRead;
    heldRead = null;
    gate.arrived();
    await gate.resume;
  }
  return response;
};
globalThis.fetch = localFetch;
const options = { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: localFetch } };
const admin = createClient(apiUrl, environment.SERVICE_ROLE_KEY, options);
const clients = [];
const users = [];
const credentials = [];
const roomIds = [];
const nonce = crypto.randomBytes(6).toString("hex");
const password = `Local-${crypto.randomBytes(16).toString("hex")}!`;
const connection = { apiUrl, anonKey: environment.ANON_KEY };
const expectedMessages = [];
let threadId;
let checks = 0;
let failed = false;
const requireData = (result, label) => {
  assert.equal(result.error, null, `${label}: ${result.error?.message ?? "error"}`);
  return result.data;
};
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const transition = (invite, actor, status) => admin.rpc("transition_chilly_chat_call_invite", {
  p_invite_id: invite.id, p_actor_user_id: actor, p_target_status: status,
  p_duration_seconds: status === "ended" ? 1 : null,
});
try {
  for (const label of ["caller", "callee", "outsider"]) {
    const email = `message-lifecycle-${label}-${nonce}@example.invalid`;
    const created = requireData(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "create isolated user");
    users.push(created.user.id);
    credentials.push({ email, password });
    requireData(await admin.from("user_profiles").upsert({ user_id: created.user.id,
      username: `msg_${users.length}_${nonce}`, display_name: `Message lifecycle ${label}` }), "profile fixture");
    const client = createClient(apiUrl, environment.ANON_KEY, options);
    requireData(await client.auth.signInWithPassword({ email, password }), "authenticated sign in");
    clients.push(client);
  }
  const [caller, callee, outsider] = users;
  const [callerClient, calleeClient, outsiderClient] = clients;
  const [callerApi, calleeApi, outsiderApi] = await Promise.all(clients.map((client) => loadChatSource(client, connection)));
  const thread = await callerApi.chat.getOrCreateDirectThread({ userId: callee });
  threadId = thread.threadId;
  check(thread.currentMember.userId === caller && thread.otherMember.userId === callee, "production API returns exact direct participants");

  const messageTimes = new Map();
  async function messagesBothWays(stage) {
    for (const [sender, recipient, user] of [[callerApi, calleeApi, caller], [calleeApi, callerApi, callee]]) {
      // Respect the real 8-per-30-second per-thread abuse limit. This test does
      // not delete throttle history or grant its fixtures a policy exemption.
      const times = messageTimes.get(user) ?? [];
      if (times.length >= 8) {
        const remaining = times[times.length - 8] + 31_000 - Date.now();
        if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      const body = `${nonce}:${stage}:${user === caller ? "caller" : "callee"}`;
      const sent = await sender.chat.sendChatMessage(threadId, body);
      times.push(Date.now());
      messageTimes.set(user, times);
      check(sent.senderUserId === user && sent.body === body && sent.threadId === threadId, `${stage}: production send returns committed identity`);
      expectedMessages.push({ id: sent.id, sender_user_id: user, body });
      const received = await recipient.chat.listChatMessages(threadId);
      check(received.filter((row) => row.id === sent.id && row.body === body && row.senderUserId === user).length === 1,
        `${stage}: other authenticated account reads exact message once through production API`);
    }
  }
  async function createRoom(label) {
    const roomId = `MSG${nonce}${label}`.toUpperCase();
    requireData(await callerClient.from("communication_rooms").insert({ room_id: roomId, room_code: roomId,
      host_user_id: caller, status: "active", content_access_rule: "open" }), "authenticated room creation");
    roomIds.push(roomId);
    return roomId;
  }
  async function begin(label) {
    const roomId = await createRoom(label);
    const started = await callerApi.calls.beginChillyChatCall({ actorUserId: caller,
      threadId, communicationRoomId: roomId, callType: "video" });
    check(started.created === true && started.invite.communicationRoomId === roomId && started.invite.status === "ringing",
      `${label}: actual account-bound API starts a distinct call`);
    check(Date.parse(started.invite.expiresAt) - Date.parse(started.invite.createdAt) === 90_000,
      `${label}: server declares a 90-second deadline, not an inferred UI timeout`);
    return started.invite;
  }
  async function assertTerminal(invite, status) {
    const current = requireData(await callerClient.from("chat_call_invites").select("id,status,accepted_at")
      .eq("id", invite.id).single(), "participant terminal readback");
    check(current.status === status, `authoritative invite is ${status}`);
    const events = requireData(await callerClient.from("chat_call_events").select("event_type")
      .eq("call_invite_id", invite.id), "participant event readback");
    check(events.filter((row) => row.event_type === status).length === 1, "exactly one durable terminal event");
    const currentThread = requireData(await callerClient.from("chat_threads").select("active_communication_room_id,active_call_type")
      .eq("id", threadId).single(), "terminal thread readback");
    check(currentThread.active_communication_room_id === null && currentThread.active_call_type === null,
      "terminal transaction clears only its current call binding");
  }

  for (const status of ["canceled", "declined"]) {
    await messagesBothWays(`before-${status}`);
    const invite = await begin(status);
    await messagesBothWays(`ringing-${status}`);
    const actor = status === "canceled" ? caller : callee;
    requireData(await transition(invite, actor, status), "canonical server terminal transaction");
    await assertTerminal(invite, status);
    const duplicate = requireData(await transition(invite, actor, status), "terminal lost-response retry");
    check(duplicate.idempotent === true, "terminal retry is idempotent");
    const staleAnswer = await transition(invite, callee, "accepted");
    check(staleAnswer.error?.message === "transition_accept_forbidden", "late Answer cannot revive terminal invite");
    await messagesBothWays(`after-${status}`);
  }

  await messagesBothWays("before-end");
  const acceptedInvite = await begin("ended");
  requireData(await transition(acceptedInvite, callee, "accepted"), "canonical server Answer transaction");
  const memberships = [];
  for (const [api, user] of [[callerApi, caller], [calleeApi, callee]]) {
    const admission = await api.communication.prepareCommunicationRoomAdmission({ roomId: acceptedInvite.communicationRoomId, userId: user });
    memberships.push(await api.communication.joinCommunicationRoomSession({ roomId: acceptedInvite.communicationRoomId,
      userId: user, admission, cameraEnabled: true, micEnabled: true }));
  }
  await messagesBothWays("accepted-before-end");
  // Two independently issued real HTTP terminal transactions contend on the
  // same locked invite. Both may confirm success, but only one event commits.
  const ended = await Promise.all([transition(acceptedInvite, caller, "ended"), transition(acceptedInvite, callee, "ended")]);
  ended.forEach((result) => requireData(result, "concurrent End transaction"));
  check(ended.filter((result) => result.data.idempotent === false).length === 1, "concurrent End elects one durable transition");
  await assertTerminal(acceptedInvite, "ended");
  const leftRows = requireData(await admin.from("communication_room_memberships")
    .select("user_id,membership_state,camera_enabled,mic_enabled").eq("room_id", acceptedInvite.communicationRoomId), "terminal membership readback");
  check(leftRows.length === 2 && leftRows.every((row) => row.membership_state === "left" && !row.camera_enabled && !row.mic_enabled),
    "End commits both participants' durable media cleanup before subsequent messaging");
  await messagesBothWays("after-end");

  const replacement = await begin("replacement");
  requireData(await transition(replacement, callee, "accepted"), "same-thread fresh Answer");
  const newAdmission = await callerApi.communication.prepareCommunicationRoomAdmission({ roomId: replacement.communicationRoomId, userId: caller });
  const newMembership = await callerApi.communication.joinCommunicationRoomSession({ roomId: replacement.communicationRoomId,
    userId: caller, admission: newAdmission, cameraEnabled: true, micEnabled: true });
  check(newMembership.membershipGeneration !== memberships[0].membershipGeneration, "fresh same-thread call owns a distinct generation");
  requireData(await transition(acceptedInvite, caller, "ended"), "old End retry while replacement active");
  const protectedThread = requireData(await callerClient.from("chat_threads").select("active_communication_room_id")
    .eq("id", threadId).single(), "replacement binding readback");
  check(protectedThread.active_communication_room_id === replacement.communicationRoomId, "old terminal retry cannot clear replacement call");
  await messagesBothWays("fresh-same-thread");
  requireData(await transition(replacement, caller, "ended"), "finish replacement");
  await assertTerminal(replacement, "ended");

  // The immutable deadline cannot be rewritten, even by the service API.
  // Build an isolated expired fixture with the same canonical thread/room and
  // the original 90-second interval in the past; do not disable any trigger.
  const expiredRoom = await createRoom("expired");
  const createdAt = new Date(Date.parse(replacement.createdAt) - 120_000).toISOString();
  const expiresAt = new Date(Date.parse(createdAt) + 90_000).toISOString();
  const expired = requireData(await admin.from("chat_call_invites").insert({ thread_id: threadId,
    communication_room_id: expiredRoom, caller_user_id: caller, callee_user_id: callee,
    call_type: "video", status: "ringing", chat_call_media_provider: replacement.mediaProvider,
    created_at: createdAt, expires_at: expiresAt }).select("*").single(), "local expired fixture");
  requireData(await admin.from("chat_threads").update({ active_communication_room_id: expiredRoom, active_call_type: "video" })
    .eq("id", threadId), "local expired fixture thread binding");
  const late = await transition(expired, callee, "accepted");
  check(late.error?.message === "transition_accept_forbidden", "ACTUAL SERVER rejects Answer after expires_at");
  const unaccepted = requireData(await callerClient.from("chat_call_invites").select("status,accepted_at")
    .eq("id", expired.id).single(), "expired Answer rejection readback");
  check(unaccepted.status === "ringing" && unaccepted.accepted_at === null, "late Answer does not commit accepted state");
  const lateEvents = requireData(await callerClient.from("chat_call_events").select("event_type")
    .eq("call_invite_id", expired.id), "expired event readback");
  check(!lateEvents.some((row) => row.event_type === "accepted"), "late Answer creates no accepted event");
  requireData(await transition(expired, caller, "missed"), "server expiry terminal transaction");
  await assertTerminal(expired, "missed");
  await messagesBothWays("after-authoritative-expiry");

  const race = await begin("cancelrace");
  const [answerRace, cancelRace] = await Promise.all([transition(race, callee, "accepted"), transition(race, caller, "canceled")]);
  check([answerRace, cancelRace].filter((result) => result.error === null).length === 1,
    "concurrent Answer/Cancel has exactly one legal winner");
  const raceState = requireData(await callerClient.from("chat_call_invites").select("status")
    .eq("id", race.id).single(), "terminal race readback");
  check(raceState.status === (answerRace.error ? "canceled" : "accepted"), "readback agrees with serialized race winner");
  const raceEvents = requireData(await callerClient.from("chat_call_events").select("event_type")
    .eq("call_invite_id", race.id), "terminal race events");
  check(raceEvents.filter((row) => ["accepted", "canceled"].includes(row.event_type)).length === 1,
    "competing terminal race never writes both Answer and Cancel events");
  if (raceState.status === "accepted") requireData(await transition(race, caller, "ended"), "finish race winner");
  await messagesBothWays("after-terminal-race");

  // Actual authorization negatives: a client cannot call the service-only
  // transition, spoof a sender, read private messages, or send into this thread.
  const clientTransition = await outsiderClient.rpc("transition_chilly_chat_call_invite", {
    p_invite_id: race.id, p_actor_user_id: callee, p_target_status: "accepted", p_duration_seconds: null,
  });
  check(clientTransition.error?.code === "42501", "authenticated client cannot impersonate the trusted dispatcher");
  const forgedActor = await transition(race, outsider, "ended");
  check(forgedActor.error?.message === "transition_not_call_participant", "server transaction rejects outsider actor");
  await assert.rejects(outsiderApi.chat.sendChatMessage(threadId, `${nonce}:outsider`), /unavailable/u); checks++;
  const forgedMessage = await outsiderClient.from("chat_messages").insert({ thread_id: threadId,
    sender_user_id: caller, body: `${nonce}:forged`, message_type: "text" });
  check(forgedMessage.error?.code === "42501", "real RLS rejection, rather than an arbitrary transport error, blocks nonmember sender forgery");
  check(requireData(await outsiderClient.from("chat_messages").select("id").eq("thread_id", threadId), "outsider read").length === 0,
    "RLS hides the private thread's messages from the outsider");

  const frozenSubject = await callerApi.mutation.captureAccountBoundSupabaseMutationSubject(caller);
  let releaseRead;
  let signalRead;
  const readArrived = new Promise((resolve) => { signalRead = resolve; });
  const resumeRead = new Promise((resolve) => { releaseRead = resolve; });
  heldRead = { arrived: signalRead, resume: resumeRead };
  const pendingSend = callerApi.chat.sendChatMessage(threadId, `${nonce}:stale-account`)
    .then((value) => ({ value }), (error) => ({ error }));
  let arrivalTimer;
  try {
    await Promise.race([readArrived, new Promise((_, reject) => {
      arrivalTimer = setTimeout(() => reject(new Error("real thread read did not reach account-switch barrier")), 10_000);
    })]);
    requireData(await callerClient.auth.signOut(), "sign out retired account");
    requireData(await callerClient.auth.signInWithPassword(credentials[2]), "replace with actual outsider session");
    const replacedAuthority = await callerApi.refreshAuthority();
    check(replacedAuthority.userId === outsider, "replacement publication comes from actual server authority");
  } finally {
    clearTimeout(arrivalTimer);
    heldRead = null;
    releaseRead();
  }
  const stale = await pendingSend;
  check(Boolean(stale.error) && /account changed/iu.test(String(stale.error)), "late old-account read cannot authorize a message send");
  await assert.rejects(callerApi.mutation.invokeAccountBoundSupabaseMutationRpc(frozenSubject,
    "begin_chilly_chat_call", { p_thread_id: threadId, p_communication_room_id: expiredRoom, p_call_type: "video" }), /account changed/iu); checks++;

  const finalRows = requireData(await admin.from("chat_messages").select("id,sender_user_id,body").eq("thread_id", threadId), "final committed message readback");
  check(finalRows.length === expectedMessages.length, "no duplicate, missing, rejected, or stale-account message was committed");
  for (const expected of expectedMessages) {
    check(finalRows.some((row) => row.id === expected.id && row.sender_user_id === expected.sender_user_id && row.body === expected.body),
      "all messages retain exact identity/body across call terminal and replacement operations");
  }
  check([callerApi, calleeApi, outsiderApi].every((api) => api.diagnostics.length === 0), "production reconciliation emitted no hidden runtime error");
  console.log(`chat message/call lifecycle HTTP integration: ${checks} checks PASS; actual local Auth/PostgREST/RLS and server transition transaction; Edge delivery and physical/native behavior NOT TESTED`);
} catch (error) {
  failed = true;
  throw error;
} finally {
  const cleanupErrors = [];
  for (const client of clients) {
    const result = await client.auth.signOut().catch(() => ({ error: true }));
    if (result.error) cleanupErrors.push("signout");
  }
  if (threadId) {
    const result = await admin.from("chat_threads").delete().eq("id", threadId);
    if (result.error) cleanupErrors.push("thread fixture");
  }
  if (roomIds.length) {
    for (const table of ["communication_room_memberships", "communication_rooms"]) {
      const result = await admin.from(table).delete().in("room_id", roomIds);
      if (result.error) cleanupErrors.push(table);
    }
  }
  for (const user of users) {
    const result = await admin.auth.admin.deleteUser(user).catch(() => ({ error: true }));
    if (result.error) cleanupErrors.push("user fixture");
  }
  globalThis.fetch = originalFetch;
  if (cleanupErrors.length) {
    if (!failed) throw new Error(`local fixture cleanup failed: ${cleanupErrors.join(", ")}`);
    console.error(`local fixture cleanup also failed: ${cleanupErrors.join(", ")}`);
  }
}
