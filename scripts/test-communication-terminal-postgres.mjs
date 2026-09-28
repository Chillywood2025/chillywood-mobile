#!/usr/bin/env node
// Disposable PostgreSQL executes the real checked-in authority, RLS, join,
// membership, and terminal-trigger bodies. This is not an HTTP/native test;
// test-communication-terminal-http.mjs covers the actual Supabase SDK boundary.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const authority = fs.readFileSync("supabase/migrations/202608250001_chilly_chat_room_authority_closure.sql", "utf8");
const terminal = fs.readFileSync("supabase/migrations/20260729020612_chilly_chat_terminal_membership_race_guard.sql", "utf8");
const session = fs.readFileSync("supabase/migrations/20260826055737_exact_current_session_not_after_authority.sql", "utf8");
const repair = fs.readFileSync("supabase/migrations/20260928164743_communication_terminal_self_leave.sql", "utf8");
const extractFunction = (source, name) => {
  const start = source.indexOf(`create or replace function public."${name}"`);
  assert.ok(start >= 0, `actual SQL function exists: ${name}`);
  const end = source.indexOf("$$;", start);
  assert.ok(end > start, `actual SQL function terminates: ${name}`);
  return source.slice(start, end + 3);
};
const db = new PGlite();
const caller = "11111111-1111-4111-8111-111111111111";
const callee = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";
const threadId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const inviteId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessionId = (user) => user.replace(/.$/u, "0");
const asUser = async (user, sql, params = []) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user, role: "authenticated", session_id: sessionId(user) })]);
  await db.exec("set role authenticated");
  try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
};
const rpc = (user, room, generation) => asUser(user,
  "select * from public.leave_communication_room_session($1, $2::uuid)", [room, generation]);
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };

try {
  await db.exec(`
    set timezone = 'UTC';
    create role authenticated; create role anon; create role service_role;
    create schema auth;
    create schema realtime;
    create table realtime.fixture_messages(payload jsonb,event text,topic text,private boolean);
    create function realtime.send(payload jsonb,event text,topic text,private boolean)
      returns void language sql as $$ insert into realtime.fixture_messages values(payload,event,topic,private) $$;
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    grant usage on schema auth to authenticated,anon;
    create table public.fixture_restrictions(user_id text primary key);
    create function public.is_account_access_restricted(p text) returns boolean language sql stable security definer as $$ select exists(select 1 from public.fixture_restrictions where user_id=p) $$;
    create function public.is_account_deletion_scheduled(p text) returns boolean language sql stable as $$ select false $$;
    create function public.has_channel_audience_block_between(a text,b text) returns boolean language sql stable as $$ select false $$;
    create function public.can_read_watch_party_room_authority(p text) returns boolean language sql stable as $$ select false $$;
    create function public.user_has_active_entitlement(p text,e text[]) returns boolean language sql stable as $$ select false $$;
    create function public.assert_account_private_feature_allowed(p text,f text) returns void language plpgsql as $$ begin if public.is_account_access_restricted(p) then raise exception 'account_restricted'; end if; end $$;
    create table public.communication_rooms(
      room_id text primary key,room_code text,host_user_id text,status text,
      created_at timestamptz default now(),updated_at timestamptz default now(),
      last_activity_at timestamptz default now(),linked_party_id text,linked_room_code text,linked_room_mode text,
      content_access_rule text default 'open',capture_policy text default 'no_recording');
    create table public.communication_room_memberships(
      room_id text references public.communication_rooms,user_id text,role text,membership_state text,
      camera_enabled boolean,mic_enabled boolean,display_name text,avatar_url text,
      joined_at timestamptz default now(),last_seen_at timestamptz default now(),
      left_at timestamptz,updated_at timestamptz default now(),
      constraint communication_room_memberships_pkey primary key(room_id,user_id));
    create table public.chat_threads(id uuid primary key,created_by text,thread_kind text,participant_pair_key text,
      active_communication_room_id text,active_call_type text,updated_at timestamptz);
    create table public.chat_thread_members(thread_id uuid,user_id text);
    create table public.chat_call_invites(id uuid primary key,thread_id uuid,communication_room_id text,
      caller_user_id text,callee_user_id text,status text,call_type text,
      expires_at timestamptz,accepted_at timestamptz,ended_at timestamptz);
    create table public.watch_party_rooms(party_id text,host_user_id text);
    create table public.paid_watch_party_offers(party_id text,status text);
  `);
  for (const [source, names] of [
    [session, ["wave1_session_authority_readback"]],
    [authority, ["whole_app_exact_current_session_authority_internal", "whole_app_exact_current_session_authority", "can_access_chat_thread", "can_read_communication_room_authority", "can_access_communication_realtime_topic", "communication_sdp_is_receive_only_internal", "enforce_communication_membership_identity", "join_communication_room_session"]],
    [terminal, ["cleanup_terminal_chilly_chat_call_product_state", "prevent_ended_communication_room_membership_reactivation"]],
  ]) {
    for (const name of names) await db.exec(extractFunction(source, name));
  }
  await db.exec(`
    create trigger cleanup_terminal_chilly_chat_call_product_state after update of status on public.chat_call_invites
      for each row execute function public.cleanup_terminal_chilly_chat_call_product_state();
    create trigger enforce_communication_membership_identity before update on public.communication_room_memberships
      for each row execute function public.enforce_communication_membership_identity();
    create trigger prevent_ended_communication_room_membership_reactivation before insert or update of membership_state,camera_enabled,mic_enabled on public.communication_room_memberships
      for each row execute function public.prevent_ended_communication_room_membership_reactivation();
    alter table public.communication_rooms enable row level security;
    alter table public.communication_rooms force row level security;
    alter table public.communication_room_memberships enable row level security;
    alter table public.communication_room_memberships force row level security;
    grant select on public.communication_rooms,public.communication_room_memberships to authenticated;
    grant update(membership_state,camera_enabled,mic_enabled,last_seen_at,updated_at,display_name,avatar_url) on public.communication_room_memberships to authenticated;
  `);
  for (const name of ["communication_rooms_select_policy", "communication_room_memberships_select_policy", "communication_room_memberships_self_update_policy"]) {
    const start = authority.indexOf(`create policy "${name}"`);
    await db.exec(authority.slice(start, authority.indexOf(";", start) + 1));
  }
  for (const user of [caller, callee, outsider]) await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [sessionId(user), user]);
  await db.query("insert into public.communication_rooms(room_id,room_code,host_user_id,status) values ('TERMINAL1','TERMINAL1',$1,'active'),('REJOIN1','REJOIN1',$1,'active')", [caller]);
  await db.query("insert into public.chat_threads values($1,$2,'direct',$3,'TERMINAL1','video',now())", [threadId, caller, `${caller}::${callee}`]);
  await db.query("insert into public.chat_thread_members values($1,$2),($1,$3)", [threadId, caller, callee]);
  await db.query("insert into public.chat_call_invites values($1,$2,'TERMINAL1',$3,$4,'accepted','video',now()+interval '90 seconds',now(),null)", [inviteId, threadId, caller, callee]);
  for (const user of [caller, callee]) await asUser(user, "select * from public.join_communication_room_session('TERMINAL1',null,null,true,true)");

  // The actual server terminal trigger is committed before the original
  // client UPDATE ... RETURNING. Both authenticated endpoints lose visibility.
  await db.query("update public.chat_call_invites set status='ended',ended_at=now() where id=$1", [inviteId]);
  for (const user of [caller, callee]) {
    const before = await asUser(user, "update public.communication_room_memberships set membership_state='left',camera_enabled=false,mic_enabled=false where room_id='TERMINAL1' and user_id=$1 returning *", [user]);
    check(before.rows.length === 0, `BEFORE: ${user === caller ? "caller" : "callee"} legacy single-row readback has zero rows after server cleanup`);
  }
  const serverRows = (await db.query("select * from public.communication_room_memberships where room_id='TERMINAL1'")).rows;
  check(serverRows.every((row) => row.membership_state === "left" && !row.camera_enabled && !row.mic_enabled && row.left_at), "BEFORE server had already completed cleanup");

  await db.exec(repair);
  const tokens = Object.fromEntries((await db.query("select user_id,membership_generation from public.communication_room_memberships where room_id='TERMINAL1'")).rows.map((row) => [row.user_id, row.membership_generation]));
  await db.query("update public.communication_room_memberships set membership_state='active',camera_enabled=true,mic_enabled=true where room_id='TERMINAL1' and user_id=$1", [caller]);
  const guardedTerminal = (await db.query("select * from public.communication_room_memberships where room_id='TERMINAL1' and user_id=$1", [caller])).rows[0];
  check(guardedTerminal.membership_state === "left" && guardedTerminal.membership_generation === tokens[caller], "rejected ended-room reactivation never rotates cleanup identity");
  for (const user of [caller, callee]) {
    const first = (await rpc(user, "TERMINAL1", tokens[user])).rows[0];
    const repeated = (await rpc(user, "TERMINAL1", tokens[user])).rows[0];
    check(first.user_id === user && first.membership_state === "left" && !first.camera_enabled && !first.mic_enabled, "AFTER exact self row confirms server cleanup");
    check(first.membership_generation === repeated.membership_generation && +first.left_at === +repeated.left_at, "repeated End/lost response retry is idempotent");
    check((await asUser(user, "select * from public.communication_room_memberships where room_id='TERMINAL1'")).rows.length === 0, "ordinary terminal room visibility remains closed");
  }
  await assert.rejects(rpc(outsider, "TERMINAL1", tokens[caller]), /cleanup_not_found/u); checks++;
  await assert.rejects(rpc(caller, "MISSING1", tokens[caller]), /cleanup_not_found/u); checks++;
  await assert.rejects(rpc(caller, "TERMINAL1", null), /cleanup_identity_required/u); checks++;
  await assert.rejects(rpc(callee, "TERMINAL1", tokens[caller]), /generation_changed/u); checks++;
  await db.query("delete from auth.sessions where id=$1", [sessionId(callee)]);
  await assert.rejects(rpc(callee, "TERMINAL1", tokens[callee]), /current_session_required/u); checks++;
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [sessionId(callee), callee]);
  await db.query("insert into public.fixture_restrictions values($1)", [callee]);
  await assert.rejects(rpc(callee, "TERMINAL1", tokens[callee]), /current_session_required/u); checks++;
  await db.query("delete from public.fixture_restrictions where user_id=$1", [callee]);

  const join = async () => (await asUser(caller, "select * from public.join_communication_room_session('REJOIN1',null,null,true,true)")).rows[0];
  const first = await join();
  const repeated = await join();
  check(first.membership_generation === repeated.membership_generation, "duplicate active join keeps cleanup generation");
  const legacyTouch = (await asUser(caller, "update public.communication_room_memberships set mic_enabled=false,camera_enabled=false,last_seen_at=now() where room_id='REJOIN1' and user_id=$1 returning room_id,user_id,membership_state,camera_enabled,mic_enabled,joined_at,last_seen_at,left_at,updated_at", [caller])).rows[0];
  check(legacyTouch.membership_state === "active" && !legacyTouch.mic_enabled && !legacyTouch.camera_enabled, "old v3 column selection and direct media heartbeat remain compatible");
  await assert.rejects(asUser(caller, "update public.communication_room_memberships set membership_generation=gen_random_uuid() where room_id='REJOIN1'"), /permission denied/u); checks++;
  const left = (await rpc(caller, "REJOIN1", first.membership_generation)).rows[0];
  check(left.membership_state === "left" && !left.camera_enabled && !left.mic_enabled, "active self leave commits disabled media");
  const replacement = await join();
  check(first.membership_generation !== replacement.membership_generation, "admitted rejoin rotates generation");
  check(+first.joined_at === +replacement.joined_at, "historical joined_at preserved and is not used as generation");
  await assert.rejects(rpc(caller, "REJOIN1", first.membership_generation), /generation_changed/u); checks++;
  check((await asUser(caller, "select * from public.communication_room_memberships where room_id='REJOIN1'")).rows[0].membership_state === "active", "late old cleanup cannot stop replacement");
  const legacyLeave = (await asUser(caller, "update public.communication_room_memberships set membership_state='left',camera_enabled=false,mic_enabled=false where room_id='REJOIN1' and user_id=$1 returning *", [caller])).rows[0];
  check(legacyLeave.membership_state === "left" && legacyLeave.left_at && legacyLeave.membership_generation === replacement.membership_generation, "old v3 ordinary leave remains compatible before terminal visibility closes");
  const finalReplacement = await join();
  await db.query("update public.communication_room_memberships set membership_state='removed',camera_enabled=false,mic_enabled=false,left_at=now() where room_id='REJOIN1' and user_id=$1", [caller]);
  check((await rpc(caller, "REJOIN1", finalReplacement.membership_generation)).rows[0].membership_state === "removed", "removed row is verified without resurrection");
  await assert.rejects(join(), /membership_removed/u); checks++;
  // Reproduce the process-restart boundary with the retained old client RPC:
  // a second logical process resumes an ACTIVE row, so a delayed old leave
  // still owns that same legacy generation. Modern admission must rotate it.
  await db.query("insert into public.communication_rooms(room_id,room_code,host_user_id,status) values ('RESTART0','RESTART0',$1,'active'),('OWNED1','OWNED1',$1,'active')", [caller]);
  const oldProcess = (await asUser(caller, "select * from public.join_communication_room_session('RESTART0',null,null,true,true)")).rows[0];
  const oldResume = (await asUser(caller, "select * from public.join_communication_room_session('RESTART0',null,null,true,true)")).rows[0];
  check(oldProcess.membership_generation === oldResume.membership_generation, "BEFORE old-client active resume reuses old generation across process restart");
  check((await rpc(caller, "RESTART0", oldProcess.membership_generation)).rows[0].membership_state === "left", "BEFORE delayed old leave terminates the unfenced resumed legacy row");

  const prepare = async (user, room = "OWNED1") => (await asUser(user, "select public.read_communication_room_admission($1) as snapshot", [room])).rows[0].snapshot;
  const ownedJoin = async (user, attempt, previous, camera = true, mic = true, room = "OWNED1") => (await asUser(user,
    "select * from public.join_owned_communication_room_session($1,$2::uuid,$3::uuid,null,null,$4,$5)", [room, attempt, previous, camera, mic])).rows[0];
  const ownedTouch = async (user, generation, camera = null, mic = null) => (await asUser(user,
    "select * from public.touch_owned_communication_room_session('OWNED1',$1::uuid,null,$2,$3)", [generation, camera, mic])).rows[0];
  const attempts = ["44444444-4444-4444-8444-444444444441", "44444444-4444-4444-8444-444444444442", "44444444-4444-4444-8444-444444444443", "44444444-4444-4444-8444-444444444444"];
  const initialSnapshot = await prepare(caller);
  check(initialSnapshot.roomId === "OWNED1" && initialSnapshot.userId === caller && initialSnapshot.previousGeneration === null, "authorized snapshot proves initial own row absent");
  const ownedFirst = await ownedJoin(caller, attempts[0], initialSnapshot.previousGeneration);
  check(ownedFirst.membership_admission_attempt === attempts[0] && ownedFirst.membership_state === "active", "owned admission records attempt and fresh generation");
  await ownedTouch(caller, ownedFirst.membership_generation, false, false);
  const ownedRetry = await ownedJoin(caller, attempts[0], null, true, true);
  check(!ownedRetry.camera_enabled && !ownedRetry.mic_enabled && ownedRetry.membership_generation === ownedFirst.membership_generation, "same admission retry reads current media unchanged instead of replaying flags");
  const restartSnapshot = await prepare(caller);
  const restarted = await ownedJoin(caller, attempts[1], restartSnapshot.previousGeneration);
  check(restarted.membership_generation !== ownedFirst.membership_generation && +restarted.joined_at === +ownedFirst.joined_at, "AFTER process restart ACTIVE takeover rotates ownership while preserving historical join");
  await assert.rejects(rpc(caller, "OWNED1", ownedFirst.membership_generation), /cleanup_generation_changed/u); checks++;
  await assert.rejects(ownedTouch(caller, ownedFirst.membership_generation, false, false), /membership_generation_changed/u); checks++;
  await assert.rejects(ownedTouch(caller, ownedFirst.membership_generation), /membership_generation_changed/u); checks++;
  await assert.rejects(ownedJoin(caller, attempts[0], initialSnapshot.previousGeneration), /admission_conflict/u); checks++;
  await assert.rejects(ownedJoin(caller, attempts[2], restartSnapshot.previousGeneration), /admission_conflict/u); checks++;
  check((await prepare(caller)).previousGeneration === restarted.membership_generation, "late old join/leave/media/heartbeat and competing CAS cannot change replacement ownership");
  await assert.rejects(asUser(caller, "select * from public.join_communication_room_session('OWNED1',null,null,true,true)"), /owned_admission_required/u); checks++;
  await assert.rejects(asUser(caller, "update public.communication_room_memberships set mic_enabled=false where room_id='OWNED1' and user_id=$1", [caller]), /owned_write_required/u); checks++;
  const metadataBefore = (await asUser(caller, "select * from public.communication_room_memberships where room_id='OWNED1' and user_id=$1", [caller])).rows[0];
  const metadataAfter = (await asUser(caller, "update public.communication_room_memberships set display_name='Updated profile',avatar_url='https://example.invalid/avatar.png',updated_at=now() where room_id='OWNED1' and user_id=$1 returning *", [caller])).rows[0];
  check(metadataAfter.display_name === 'Updated profile' && +metadataBefore.last_seen_at === +metadataAfter.last_seen_at && metadataAfter.membership_generation === restarted.membership_generation, "metadata-only profile sync retains media ownership and does not refresh liveness");
  const calleeOwned = await ownedJoin(callee, attempts[3], null);
  const signal = (user, gen, payload) => asUser(user, "select public.broadcast_owned_communication_room_signal('OWNED1',$1::uuid,'webrtc:offer',$2::jsonb) as receipt", [gen, JSON.stringify(payload)]);
  const offer = { targetUserId: callee, description: { type: "offer", sdp: "v=0\r\nm=audio 9 RTP/AVP 0\r\na=sendrecv\r\n" }, fromUserId: outsider, membershipGeneration: ownedFirst.membership_generation };
  const sent = (await signal(caller, restarted.membership_generation, offer)).rows[0].receipt;
  check(sent.sent && sent.fromUserId === caller && sent.membershipGeneration === restarted.membership_generation, "owned relay acknowledges canonical authenticated sender generation");
  const packet = (await db.query("select * from realtime.fixture_messages order by ctid desc limit 1")).rows[0];
  check(packet.payload.fromUserId === caller && packet.payload.membershipGeneration === restarted.membership_generation && packet.private && packet.topic === 'comm-room-OWNED1', "relay overwrites spoofed sender/generation with actual owner and preserves private canonical delivery");
  await assert.rejects(signal(caller, ownedFirst.membership_generation, offer), /membership_generation_changed/u); checks++;
  await assert.rejects(asUser(caller, "select public.broadcast_communication_room_signal('OWNED1','webrtc:offer',$1::jsonb)", [JSON.stringify(offer)]), /owned_signal_required/u); checks++;
  check((await db.query("select count(*)::int as count from realtime.fixture_messages")).rows[0].count === 1, "old relay and delayed old owner cannot emit packets after takeover");
  await rpc(caller, "OWNED1", restarted.membership_generation);
  await assert.rejects(ownedJoin(caller, attempts[1], restartSnapshot.previousGeneration), /admission_retired/u); checks++;
  await assert.rejects(ownedTouch(caller, restarted.membership_generation), /membership_not_active/u); checks++;
  const leftSnapshot = await prepare(caller);
  check(leftSnapshot.previousGeneration === restarted.membership_generation, "LEFT own row remains distinguishable from absence through exact authorized snapshot");
  const third = await ownedJoin(caller, attempts[2], leftSnapshot.previousGeneration);
  await assert.rejects(rpc(caller, "OWNED1", restarted.membership_generation), /cleanup_generation_changed/u); checks++;
  check(third.membership_state === 'active' && third.membership_generation !== restarted.membership_generation, "LEFT rejoin obtains a distinct durable owner unaffected by late old cleanup");
  await db.query("delete from auth.sessions where id=$1", [sessionId(caller)]);
  await assert.rejects(prepare(caller), /current_session_required/u); checks++;
  await assert.rejects(ownedJoin(caller, attempts[2], leftSnapshot.previousGeneration), /current_session_required/u); checks++;
  await assert.rejects(ownedTouch(caller, third.membership_generation), /current_session_required/u); checks++;
  await assert.rejects(signal(caller, third.membership_generation, offer), /current_session_required/u); checks++;
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [sessionId(caller), caller]);
  const privateAcls = (await db.query("select has_function_privilege('authenticated','public.authorize_communication_room_admission_internal(text)','EXECUTE') as admission,has_function_privilege('authenticated','public.broadcast_communication_room_signal_internal(text,text,jsonb,uuid)','EXECUTE') as signal,has_column_privilege('authenticated','public.communication_room_memberships','membership_admission_attempt','UPDATE') as attempt")).rows[0];
  check(!privateAcls.admission && !privateAcls.signal && !privateAcls.attempt, "private authorization/relay helpers and direct admission identity remain inaccessible");
  check(calleeOwned.membership_generation !== third.membership_generation, "members have independent ownership generations");
  const acl = (await db.query("select has_function_privilege('anon','public.leave_communication_room_session(text,uuid)','EXECUTE') as anon, has_function_privilege('service_role','public.leave_communication_room_session(text,uuid)','EXECUTE') as service, has_column_privilege('authenticated','public.communication_room_memberships','membership_generation','UPDATE') as writable")).rows[0];
  check(!acl.anon && !acl.service && !acl.writable, "no anonymous/service RPC or client generation rewrite grants");
  console.log(`communication terminal PostgreSQL: ${checks} checks PASS; original terminal readback mismatch reproduced before repair`);
} finally {
  await db.close();
}
