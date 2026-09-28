#!/usr/bin/env node
// Full local Supabase/PostgREST integration: actual client API, auth JWTs,
// deployed migration stack, terminal server RPC/trigger, and RLS. No providers.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadAuthenticatedCommunicationApiSource } from "../tests/assurance/helpers/communication-api-source.mjs";

const environment = {};
for (const line of execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split(/\r?\n/u)) {
  const separator = line.indexOf("=");
  if (separator < 1) continue;
  const value = line.slice(separator + 1).trim();
  environment[line.slice(0, separator).trim()] = value.startsWith('"') ? JSON.parse(value) : value;
}
const apiUrl = environment.API_URL;
assert.ok(["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname), "disposable local Supabase only");
assert.ok(environment.ANON_KEY && environment.SERVICE_ROLE_KEY, "local credentials from CLI");
const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(apiUrl, environment.SERVICE_ROLE_KEY, options);
const clients = [];
const users = [];
const nonce = crypto.randomBytes(6).toString("hex");
const password = `Local-${crypto.randomBytes(16).toString("hex")}!`;
const roomId = `TERM${nonce}`.toUpperCase();
const rejoinRoomId = `REJOIN${nonce}`.toUpperCase();
const legacyRoomId = `LEGACY${nonce}`.toUpperCase();
let threadId;
let checks = 0;
const requireData = (result, label) => {
  assert.equal(result.error, null, `${label}: ${result.error?.message ?? "error"}`);
  return result.data;
};
const check = (condition, label) => { assert.ok(condition, label); checks++; };
try {
  for (const label of ["caller", "callee", "outsider"]) {
    const email = `terminal-${label}-${nonce}@example.invalid`;
    const created = requireData(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "create isolated user");
    users.push(created.user.id);
    requireData(await admin.from("user_profiles").upsert({ user_id: created.user.id, username: `term_${users.length}_${nonce}`, display_name: `Terminal ${label}` }), "isolated public profile fixture");
    const client = createClient(apiUrl, environment.ANON_KEY, options);
    requireData(await client.auth.signInWithPassword({ email, password }), "authenticated sign in");
    clients.push(client);
  }
  const [caller, callee, outsider] = users;
  const [callerClient, calleeClient, outsiderClient] = clients;
  threadId = requireData(await callerClient.rpc("get_or_create_direct_chat_thread", { p_target_user_id: callee }), "open exact direct thread")[0].thread_id;
  requireData(await callerClient.from("communication_rooms").insert({ room_id: roomId, room_code: roomId, host_user_id: caller, status: "active", content_access_rule: "open" }), "create owned room");
  const started = requireData(await callerClient.rpc("begin_chilly_chat_call", { p_thread_id: threadId, p_communication_room_id: roomId, p_call_type: "video" }), "begin call");
  const inviteId = started.invite.id;
  // This is the exact service-only transaction invoked by the authenticated
  // Edge transition, not an UPDATE bypass. No delivery worker runs here.
  requireData(await admin.rpc("transition_chilly_chat_call_invite", { p_invite_id: inviteId, p_actor_user_id: callee, p_target_status: "accepted", p_duration_seconds: null }), "server accepts exact invite");
  const connection = { apiUrl, anonKey: environment.ANON_KEY };
  const { api: callerApi } = await loadAuthenticatedCommunicationApiSource(callerClient, connection);
  const { api: calleeApi, authority: calleeAuthority } = await loadAuthenticatedCommunicationApiSource(calleeClient, connection);
  const callerAdmission = await callerApi.prepareCommunicationRoomAdmission({ roomId, userId: caller });
  const calleeAdmission = await calleeApi.prepareCommunicationRoomAdmission({ roomId, userId: callee });
  const callerMembership = await callerApi.joinCommunicationRoomSession({ roomId, userId: caller, admission: callerAdmission, cameraEnabled: true, micEnabled: true });
  const calleeMembership = await calleeApi.joinCommunicationRoomSession({ roomId, userId: callee, admission: calleeAdmission, cameraEnabled: true, micEnabled: true });
  check(Boolean(callerMembership.membershipGeneration && calleeMembership.membershipGeneration), "actual join returns server generation");
  requireData(await admin.rpc("transition_chilly_chat_call_invite", { p_invite_id: inviteId, p_actor_user_id: caller, p_target_status: "ended", p_duration_seconds: 1 }), "screen's server terminal transition");
  const authoritative = requireData(await admin.from("communication_room_memberships").select("*").eq("room_id", roomId), "observe terminal server postcondition");
  check(authoritative.length === 2 && authoritative.every((row) => row.membership_state === "left" && !row.camera_enabled && !row.mic_enabled), "server completed both memberships before redundant client cleanup");
  for (const [api, client, user, membership] of [[callerApi, callerClient, caller, callerMembership], [calleeApi, calleeClient, callee, calleeMembership]]) {
    // Verify the actual PostgREST zero-row response first. The application
    // preserves its message rather than inventing a "membership update"
    // prefix; only the raw SDK response carries the structured PGRST code.
    const invisibleUpdate = await client.from("communication_room_memberships")
      .update({ membership_state: "left", camera_enabled: false, mic_enabled: false })
      .eq("room_id", roomId).eq("user_id", user)
      .select("room_id,user_id,membership_state").single();
    assert.equal(invisibleUpdate.data, null);
    assert.equal(invisibleUpdate.error?.code, "PGRST116", "terminal UPDATE cannot return an RLS-hidden row");
    assert.match(invisibleUpdate.error.details, /0 rows/u, "the singular response failed because no row was visible");
    checks++;
    const args = { roomId, userId: user, expectedMembershipGeneration: membership.membershipGeneration };
    const left = await api.leaveCommunicationRoomSession(args);
    const retry = await api.leaveCommunicationRoomSession(args);
    check(left.membershipState === "left" && left.leftAt === retry.leftAt && left.membershipGeneration === retry.membershipGeneration, "actual API terminal End and lost-response retry confirm same exact row");
    check((await api.listCommunicationRoomMemberships(roomId)).length === 0, "ordinary terminal peer discovery remains closed");
  }
  const denied = await outsiderClient.rpc("leave_communication_room_session", { p_room_id: roomId, p_expected_membership_generation: callerMembership.membershipGeneration });
  check(denied.error?.code === "P0001" && denied.error.message === "communication_membership_cleanup_not_found", "outsider cannot read/leave caller terminal membership");
  requireData(await callerClient.from("communication_rooms").insert({ room_id: rejoinRoomId, room_code: rejoinRoomId, host_user_id: caller, status: "active", content_access_rule: "open" }), "new isolated room");
  const firstAdmission = await callerApi.prepareCommunicationRoomAdmission({ roomId: rejoinRoomId, userId: caller });
  check(firstAdmission.expectedPreviousGeneration === null, "first admission explicitly expects no membership");
  const firstArgs = { roomId: rejoinRoomId, userId: caller, admission: firstAdmission, cameraEnabled: true, micEnabled: true };
  const first = await callerApi.joinCommunicationRoomSession(firstArgs);
  const spoofedGeneration = crypto.randomUUID();
  const ownedSignal = requireData(await callerClient.rpc("broadcast_owned_communication_room_signal", {
    p_room_id: rejoinRoomId, p_expected_membership_generation: first.membershipGeneration,
    p_event: "media:update", p_payload: { cameraOn: true, micOn: true, fromUserId: outsider, membershipGeneration: spoofedGeneration },
  }), "owned relay canonical receipt");
  check(ownedSignal.sent === true && ownedSignal.fromUserId === caller && ownedSignal.membershipGeneration === first.membershipGeneration,
    "server derives signal sender and generation rather than accepting spoofed payload metadata");
  const forgedOwner = await callerClient.rpc("broadcast_owned_communication_room_signal", {
    p_room_id: rejoinRoomId, p_expected_membership_generation: spoofedGeneration,
    p_event: "media:update", p_payload: { cameraOn: true, micOn: true, membershipGeneration: first.membershipGeneration },
  });
  check(forgedOwner.error?.code === "P0001" && forgedOwner.error.message === "communication_membership_generation_changed",
    "correct-looking payload cannot authorize a fabricated expected generation");
  check(await callerApi.broadcastCommunicationRoomSignal({ roomId: rejoinRoomId, userId: caller,
    expectedMembershipGeneration: first.membershipGeneration, event: "media:update", payload: { cameraOn: true, micOn: true } }),
  "production API accepts only the exact owned relay receipt");
  const oldSignal = await callerClient.rpc("broadcast_communication_room_signal", {
    p_room_id: rejoinRoomId, p_event: "media:update", p_payload: { cameraOn: true, micOn: true },
  });
  check(oldSignal.error?.code === "P0001" && oldSignal.error.message === "communication_membership_owned_signal_required",
    "legacy unfenced relay cannot send media on behalf of a modern owner");
  const roomEnd = requireData(await callerClient.rpc("broadcast_communication_room_signal", {
    p_room_id: rejoinRoomId, p_event: "room:end", p_payload: { reason: "host-left" },
  }), "retained host room-end contract");
  check(roomEnd.sent === true && roomEnd.event === "room:end" && roomEnd.membershipGeneration === null,
    "existing host-only room:end signaling remains a separate room authority action");
  await callerApi.touchCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, expectedMembershipGeneration: first.membershipGeneration, cameraEnabled: false, micEnabled: false });
  const repeated = await callerApi.joinCommunicationRoomSession(firstArgs);
  check(first.membershipGeneration === repeated.membershipGeneration && !repeated.cameraEnabled && !repeated.micEnabled,
    "retrying the same admission returns its latest media state without replaying initial preferences");

  // Recreate the real application modules, including their auth publication
  // and mutation transport, with no shared JavaScript admission coordinator.
  // A process restart must fence the earlier ACTIVE owner in PostgreSQL.
  const { api: restartedApi } = await loadAuthenticatedCommunicationApiSource(callerClient, connection);
  const restartedAdmission = await restartedApi.prepareCommunicationRoomAdmission({ roomId: rejoinRoomId, userId: caller });
  check(restartedAdmission.expectedPreviousGeneration === first.membershipGeneration && restartedAdmission.attemptId !== firstAdmission.attemptId,
    "independent process captures current generation and creates a different admission attempt");
  const restarted = await restartedApi.joinCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, admission: restartedAdmission, cameraEnabled: true, micEnabled: true });
  check(restarted.membershipGeneration !== first.membershipGeneration, "new active owner rotates generation without requiring a prior leave");
  for (const operation of [
    () => callerApi.leaveCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, expectedMembershipGeneration: first.membershipGeneration }),
    () => callerApi.touchCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, expectedMembershipGeneration: first.membershipGeneration, cameraEnabled: false, micEnabled: false }),
    () => callerApi.heartbeatCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, expectedMembershipGeneration: first.membershipGeneration }),
    () => callerApi.broadcastCommunicationRoomSignal({ roomId: rejoinRoomId, userId: caller,
      expectedMembershipGeneration: first.membershipGeneration, event: "media:update", payload: { cameraOn: false, micOn: false } }),
    () => callerApi.joinCommunicationRoomSession(firstArgs),
  ]) {
    await assert.rejects(operation, /generation_changed|admission_conflict/u, "retired process cannot leave, update, heartbeat, or readmit itself"); checks++;
  }
  const afterRetired = (await restartedApi.listCommunicationRoomMemberships(rejoinRoomId))[0];
  check(afterRetired.membershipGeneration === restarted.membershipGeneration && afterRetired.cameraEnabled && afterRetired.micEnabled,
    "every retired operation preserves the new owner's active media");
  const competingAdmissions = await Promise.all([
    callerApi.prepareCommunicationRoomAdmission({ roomId: rejoinRoomId, userId: caller }),
    restartedApi.prepareCommunicationRoomAdmission({ roomId: rejoinRoomId, userId: caller }),
  ]);
  check(competingAdmissions.every((entry) => entry.expectedPreviousGeneration === restarted.membershipGeneration),
    "independent contenders compare against the same observed ACTIVE generation");
  const contested = await Promise.allSettled([
    callerApi.joinCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, admission: competingAdmissions[0], cameraEnabled: true, micEnabled: true }),
    restartedApi.joinCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, admission: competingAdmissions[1], cameraEnabled: true, micEnabled: true }),
  ]);
  const winner = contested.filter((entry) => entry.status === "fulfilled");
  const loser = contested.filter((entry) => entry.status === "rejected");
  check(winner.length === 1 && loser.length === 1 && /admission_conflict/u.test(String(loser[0].reason)),
    "two real concurrent HTTP admissions elect exactly one new owner");
  const currentMembership = winner[0].value;
  await restartedApi.leaveCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, expectedMembershipGeneration: currentMembership.membershipGeneration });
  const nextAdmission = await restartedApi.prepareCommunicationRoomAdmission({ roomId: rejoinRoomId, userId: caller });
  // Two real HTTP requests race for the same room/membership row locks. The
  // lost-response retry either observes the old LEFT row before the rejoin or
  // is rejected after rotation; it may never retire the replacement.
  const [retriedOldLeave, joinedAgain] = await Promise.allSettled([
    restartedApi.leaveCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, expectedMembershipGeneration: currentMembership.membershipGeneration }),
    restartedApi.joinCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, admission: nextAdmission }),
  ]);
  assert.equal(joinedAgain.status, "fulfilled");
  const replacement = joinedAgain.value;
  check(retriedOldLeave.status === "fulfilled"
    ? retriedOldLeave.value.membershipGeneration === currentMembership.membershipGeneration
    : /generation_changed/u.test(String(retriedOldLeave.reason)), "concurrent old retry is bounded to its generation");
  check(currentMembership.membershipGeneration !== replacement.membershipGeneration, "new admission rotates token over HTTP");
  await assert.rejects(callerApi.leaveCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, expectedMembershipGeneration: currentMembership.membershipGeneration }), /generation_changed/u); checks++;
  check((await callerApi.listCommunicationRoomMemberships(rejoinRoomId))[0].membershipState === "active", "late old cleanup preserves replacement");
  await callerApi.leaveCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, expectedMembershipGeneration: replacement.membershipGeneration });
  await assert.rejects(callerApi.leaveCommunicationRoomSession({ roomId: "NOTFOUND", userId: caller, expectedMembershipGeneration: replacement.membershipGeneration }), /not_found/u); checks++;
  await assert.rejects(callerApi.leaveCommunicationRoomSession({ roomId, userId: caller }), /cleanup identity/u); checks++;

  // Legacy clients keep their old five-argument join and direct media update
  // only while no modern owner has acquired that membership row.
  requireData(await callerClient.from("communication_rooms").insert({ room_id: legacyRoomId, room_code: legacyRoomId, host_user_id: caller, status: "active", content_access_rule: "open" }), "legacy-only room");
  const legacyArgs = { p_room_id: legacyRoomId, p_display_name: null, p_avatar_url: null, p_camera_enabled: true, p_mic_enabled: true };
  const legacy = requireData(await callerClient.rpc("join_communication_room_session", legacyArgs), "legacy admission")[0];
  const legacyMedia = requireData(await callerClient.from("communication_room_memberships")
    .update({ camera_enabled: false, mic_enabled: false }).eq("room_id", legacyRoomId).eq("user_id", caller)
    .select("membership_state,camera_enabled,mic_enabled").single(), "legacy-owned direct media update");
  check(legacyMedia.membership_state === "active" && !legacyMedia.camera_enabled && !legacyMedia.mic_enabled, "old installed client remains functional on a legacy-owned row");
  const modernAdmission = await restartedApi.prepareCommunicationRoomAdmission({ roomId: legacyRoomId, userId: caller });
  check(modernAdmission.expectedPreviousGeneration === legacy.membership_generation, "modern adoption compares against existing legacy generation");
  const modern = await restartedApi.joinCommunicationRoomSession({ roomId: legacyRoomId, userId: caller, admission: modernAdmission, cameraEnabled: true, micEnabled: true });
  check(modern.membershipGeneration !== legacy.membership_generation, "modern adoption fences every legacy generation token");
  const legacyJoinAfterAdoption = await callerClient.rpc("join_communication_room_session", legacyArgs);
  check(legacyJoinAfterAdoption.error?.code === "P0001"
    && legacyJoinAfterAdoption.error.message === "communication_membership_owned_admission_required", "legacy join cannot steal a modern-owned active row");
  const legacyWriteAfterAdoption = await callerClient.from("communication_room_memberships")
    .update({ camera_enabled: false, mic_enabled: false }).eq("room_id", legacyRoomId).eq("user_id", caller)
    .select("membership_generation,camera_enabled,mic_enabled");
  check(legacyWriteAfterAdoption.error?.code === "P0001"
    && legacyWriteAfterAdoption.error.message === "communication_membership_owned_write_required", "legacy direct write is denied on a modern-owned row");
  const protectedModern = (await restartedApi.listCommunicationRoomMemberships(legacyRoomId))[0];
  check(protectedModern.membershipGeneration === modern.membershipGeneration && protectedModern.cameraEnabled && protectedModern.micEnabled,
    "legacy requests cannot overwrite modern media intent");
  await restartedApi.leaveCommunicationRoomSession({ roomId: legacyRoomId, userId: caller, expectedMembershipGeneration: modern.membershipGeneration });
  const legacyReactivation = await callerClient.rpc("join_communication_room_session", legacyArgs);
  check(legacyReactivation.error?.code === "P0001"
    && legacyReactivation.error.message === "communication_membership_owned_admission_required", "legacy client cannot resume a retired modern owner");
  const terminalArgs = { roomId, userId: callee, expectedMembershipGeneration: calleeMembership.membershipGeneration };
  calleeAuthority.publishAccountSessionAuthoritySnapshot(null);
  await assert.rejects(calleeApi.leaveCommunicationRoomSession(terminalArgs), /signed-in account changed/u); checks++;
  const calleeJwt = requireData(await calleeClient.auth.getSession(), "retain isolated test session for revocation assertion").session.access_token;
  requireData(await calleeClient.auth.signOut({ scope: "local" }), "revoke isolated exact session");
  const retired = createClient(apiUrl, environment.ANON_KEY, { ...options, global: { headers: { Authorization: `Bearer ${calleeJwt}` } } });
  const anonymous = createClient(apiUrl, environment.ANON_KEY, options);
  for (const [rpcName, args] of [
    ["read_communication_room_admission", { p_room_id: roomId }],
    ["join_owned_communication_room_session", { p_room_id: roomId, p_admission_attempt: crypto.randomUUID(), p_expected_previous_generation: calleeMembership.membershipGeneration }],
    ["touch_owned_communication_room_session", { p_room_id: roomId, p_expected_membership_generation: calleeMembership.membershipGeneration }],
    ["leave_communication_room_session", { p_room_id: roomId, p_expected_membership_generation: calleeMembership.membershipGeneration }],
    ["broadcast_owned_communication_room_signal", { p_room_id: roomId, p_expected_membership_generation: calleeMembership.membershipGeneration,
      p_event: "media:update", p_payload: { cameraOn: false, micOn: false } }],
  ]) {
    const revoked = await retired.rpc(rpcName, args);
    check(revoked.error?.code === "P0001" && revoked.error.message === "communication_room_current_session_required",
      `${rpcName} rejects an exact revoked JWT even while its access token has not expired`);
    const anonymousResult = await anonymous.rpc(rpcName, args);
    check(anonymousResult.error?.code === "42501", `${rpcName} denies anonymous invocation at its grant boundary`);
  }
  console.log(`communication terminal HTTP integration: ${checks} checks PASS; former direct cleanup contract fails on the same server-completed fixture`);
} finally {
  for (const client of clients) await client.auth.signOut().catch(() => {});
  if (threadId) await admin.from("chat_threads").delete().eq("id", threadId);
  await admin.from("communication_room_memberships").delete().in("room_id", [roomId, rejoinRoomId, legacyRoomId]);
  await admin.from("communication_rooms").delete().in("room_id", [roomId, rejoinRoomId, legacyRoomId]);
  for (const user of users) await admin.auth.admin.deleteUser(user).catch(() => {});
}
