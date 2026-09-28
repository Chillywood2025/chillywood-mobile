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
  const callerMembership = await callerApi.joinCommunicationRoomSession({ roomId, userId: caller, cameraEnabled: true, micEnabled: true });
  const calleeMembership = await calleeApi.joinCommunicationRoomSession({ roomId, userId: callee, cameraEnabled: true, micEnabled: true });
  check(Boolean(callerMembership.membershipGeneration && calleeMembership.membershipGeneration), "actual join returns server generation");
  requireData(await admin.rpc("transition_chilly_chat_call_invite", { p_invite_id: inviteId, p_actor_user_id: caller, p_target_status: "ended", p_duration_seconds: 1 }), "screen's server terminal transition");
  const authoritative = requireData(await admin.from("communication_room_memberships").select("*").eq("room_id", roomId), "observe terminal server postcondition");
  check(authoritative.length === 2 && authoritative.every((row) => row.membership_state === "left" && !row.camera_enabled && !row.mic_enabled), "server completed both memberships before redundant client cleanup");
  for (const [api, user, membership] of [[callerApi, caller, callerMembership], [calleeApi, callee, calleeMembership]]) {
    await assert.rejects(api.touchCommunicationRoomSession({ roomId, userId: user, membershipState: "left", cameraEnabled: false, micEnabled: false }), /membership update/u); checks++;
    const args = { roomId, userId: user, expectedMembershipGeneration: membership.membershipGeneration };
    const left = await api.leaveCommunicationRoomSession(args);
    const retry = await api.leaveCommunicationRoomSession(args);
    check(left.membershipState === "left" && left.leftAt === retry.leftAt && left.membershipGeneration === retry.membershipGeneration, "actual API terminal End and lost-response retry confirm same exact row");
    check((await api.listCommunicationRoomMemberships(roomId)).length === 0, "ordinary terminal peer discovery remains closed");
  }
  const denied = await outsiderClient.rpc("leave_communication_room_session", { p_room_id: roomId, p_expected_membership_generation: callerMembership.membershipGeneration });
  check(Boolean(denied.error), "outsider cannot read/leave caller terminal membership");
  requireData(await callerClient.from("communication_rooms").insert({ room_id: rejoinRoomId, room_code: rejoinRoomId, host_user_id: caller, status: "active", content_access_rule: "open" }), "new isolated room");
  const first = await callerApi.joinCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller });
  const repeated = await callerApi.joinCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller });
  check(first.membershipGeneration === repeated.membershipGeneration, "duplicate active join idempotent over HTTP");
  await callerApi.leaveCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, expectedMembershipGeneration: first.membershipGeneration });
  // Two real HTTP requests race for the same room/membership row locks. The
  // lost-response retry either observes the old LEFT row before the rejoin or
  // is rejected after rotation; it may never retire the replacement.
  const [retriedOldLeave, joinedAgain] = await Promise.allSettled([
    callerApi.leaveCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, expectedMembershipGeneration: first.membershipGeneration }),
    callerApi.joinCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller }),
  ]);
  assert.equal(joinedAgain.status, "fulfilled");
  const replacement = joinedAgain.value;
  check(retriedOldLeave.status === "fulfilled"
    ? retriedOldLeave.value.membershipGeneration === first.membershipGeneration
    : /generation_changed/u.test(String(retriedOldLeave.reason)), "concurrent old retry is bounded to its generation");
  check(first.membershipGeneration !== replacement.membershipGeneration, "new admission rotates token over HTTP");
  await assert.rejects(callerApi.leaveCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, expectedMembershipGeneration: first.membershipGeneration }), /generation_changed/u); checks++;
  check((await callerApi.listCommunicationRoomMemberships(rejoinRoomId))[0].membershipState === "active", "late old cleanup preserves replacement");
  await callerApi.leaveCommunicationRoomSession({ roomId: rejoinRoomId, userId: caller, expectedMembershipGeneration: replacement.membershipGeneration });
  await assert.rejects(callerApi.leaveCommunicationRoomSession({ roomId: "NOTFOUND", userId: caller, expectedMembershipGeneration: replacement.membershipGeneration }), /not_found/u); checks++;
  await assert.rejects(callerApi.leaveCommunicationRoomSession({ roomId, userId: caller }), /cleanup identity/u); checks++;
  const terminalArgs = { roomId, userId: callee, expectedMembershipGeneration: calleeMembership.membershipGeneration };
  calleeAuthority.publishAccountSessionAuthoritySnapshot(null);
  await assert.rejects(calleeApi.leaveCommunicationRoomSession(terminalArgs), /signed-in account changed/u); checks++;
  const calleeJwt = requireData(await calleeClient.auth.getSession(), "retain isolated test session for revocation assertion").session.access_token;
  requireData(await calleeClient.auth.signOut({ scope: "local" }), "revoke isolated exact session");
  const retired = createClient(apiUrl, environment.ANON_KEY, { ...options, global: { headers: { Authorization: `Bearer ${calleeJwt}` } } });
  const revoked = await retired.rpc("leave_communication_room_session", { p_room_id: roomId, p_expected_membership_generation: calleeMembership.membershipGeneration });
  check(revoked.error?.message.includes("current_session_required"), "server rejects the exact revoked JWT even while its access token has not expired");
  const anonymous = createClient(apiUrl, environment.ANON_KEY, options);
  check(Boolean((await anonymous.rpc("leave_communication_room_session", { p_room_id: roomId, p_expected_membership_generation: callerMembership.membershipGeneration })).error), "anonymous caller has no RPC grant");
  console.log(`communication terminal HTTP integration: ${checks} checks PASS; former application API fails on the same server-completed fixture`);
} finally {
  for (const client of clients) await client.auth.signOut().catch(() => {});
  if (threadId) await admin.from("chat_threads").delete().eq("id", threadId);
  await admin.from("communication_room_memberships").delete().in("room_id", [roomId, rejoinRoomId]);
  await admin.from("communication_rooms").delete().in("room_id", [roomId, rejoinRoomId]);
  for (const user of users) await admin.auth.admin.deleteUser(user).catch(() => {});
}
