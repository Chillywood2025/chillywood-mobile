#!/usr/bin/env node
// Isolated PostgreSQL regression, not a full Supabase/provider test. Execute
// actual migration, trigger, session, join and heartbeat bodies. The legacy
// paid admission and provider-backed Premium predicate use explicit fixture
// relations; their full production dependency graph is covered by pgTAP.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (name) => fs.readFileSync(`supabase/migrations/${name}.sql`, "utf8");
const old = read("20260824034109_creator_money_authority_integrity_closeout");
const lifecycle = read("202608250001_chilly_chat_room_authority_closure");
const live = read("20260827235000_live_room_access_independence_closure");
const session = read("20260826055737_exact_current_session_not_after_authority");
const baseline = read("202604190004_baseline_current_schema_truth");
const repair = read("20261014234628_live_stage_party_authority_repair");
const extract = (source, name) => {
  const start = source.indexOf(`create or replace function public."${name}"`);
  assert.ok(start >= 0, `real function ${name} exists`);
  const end = source.indexOf("$$;", start);
  assert.ok(end > start, `real function ${name} terminates`);
  return source.slice(start, end + 3);
};
const db = new PGlite();
const host = "11111111-1111-4111-8111-111111111111";
const speaker = "22222222-2222-4222-8222-222222222222";
const listener = "33333333-3333-4333-8333-333333333333";
const generation = (user) => user.replace(/.$/u, "0");
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const as = async (user, sql, params = [], role = "authenticated") => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({role, ...(user ? {sub:user,session_id:generation(user)} : {})})]);
  await db.exec(`set role ${role}`);
  try { return await db.query(sql, params); }
  finally { await db.exec("reset role; select set_config('app.watch_party_membership_authority','',false)"); }
};
const join = (user, party = "LIVE-OPEN") => as(user, "select * from public.join_watch_party_room_session($1,null,null,null,true,true,false)", [party]);
const heartbeat = (user, state = "active", selfMuted = false, party = "LIVE-OPEN") =>
  as(user, "select * from public.heartbeat_watch_party_room_session($1,$2,true,true,$3)", [party,state,selfMuted]);
const approve = (user, mute = false, state = "active", party = "LIVE-OPEN") =>
  as(host, "select * from public.set_watch_party_participant_authority($1,$2,'speaker',$3,$4)", [party,user,mute,state]);
const expectDenied = async (promise, pattern, label) => { await assert.rejects(promise, pattern, label); checks++; };
try {
  await db.exec(`
    set timezone='UTC';
    create role authenticated; create role anon; create role service_role;
    create schema auth;
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    grant usage on schema auth to authenticated,anon,service_role;
    create table public.fixture_restrictions(user_id text primary key);
    create table public.fixture_blocks(party_id text,user_id text);
    create table public.fixture_premium(user_id text primary key,expires_at timestamptz);
    create table public.fixture_paid_access(party_id text,user_id text);
    create table public.paid_watch_party_offers(party_id text,status text);
    create table public.user_entitlements(user_id text,entitlement_key text);
    create function public.is_account_access_restricted(p text) returns boolean language sql stable security definer as $$ select exists(select 1 from public.fixture_restrictions where user_id=p) $$;
    create function public.is_account_deletion_scheduled(p text) returns boolean language sql stable as $$ select false $$;
    create function public.premium_subject_has_finite_authority_internal(p text) returns boolean language sql stable security definer as $$ select exists(select 1 from public.fixture_premium where user_id=p and expires_at>now()) $$;
    create function public.has_platform_role(roles text[]) returns boolean language sql stable as $$ select false $$;
    create function public.watch_party_room_actor_blocked_by_host(p text,u text) returns boolean language sql stable security definer as $$ select exists(select 1 from public.fixture_blocks where party_id=p and user_id=u) $$;
    create function public.assert_account_private_feature_allowed(p text,f text) returns void language plpgsql as $$ begin if public.is_account_access_restricted(p) then raise exception 'account_restricted'; end if; end $$;
  `);
  for (const name of ["watch_party_rooms", "watch_party_room_memberships"]) {
    const start = baseline.indexOf(`create table public."${name}"`);
    await db.exec(baseline.slice(start, baseline.indexOf(";", start) + 1));
  }
  await db.exec(`
    alter table public.watch_party_rooms add primary key(party_id);
    alter table public.watch_party_room_memberships add constraint watch_party_room_memberships_pkey primary key(party_id,user_id);
    alter table public.watch_party_room_memberships add host_muted boolean not null default false,add self_muted boolean not null default false;
    create function public.watch_party_room_access_pre_live_decouple(p text,u text) returns boolean language sql stable security definer as $$
      select exists(select 1 from public.watch_party_rooms r where r.party_id=p and r.is_active
        and ((r.room_type='title' and r.content_access_rule='open' and not exists(select 1 from public.paid_watch_party_offers o where o.party_id=p))
          or exists(select 1 from public.fixture_paid_access a where a.party_id=p and a.user_id=u))) $$;
  `);
  await db.exec(extract(session,"wave1_session_authority_readback"));
  await db.exec(extract(lifecycle,"whole_app_exact_current_session_authority_internal"));
  await db.exec(`create function public.wave1_current_caller_authority_internal() returns boolean language sql stable security definer as $$ select public.whole_app_exact_current_session_authority_internal() $$;`);
  await db.exec(extract(old,"user_has_active_entitlement"));
  await db.exec(extract(live,"watch_party_room_self_access_allowed_internal"));
  for (const name of ["enforce_watch_party_membership_identity","join_watch_party_room_session","heartbeat_watch_party_room_session","set_watch_party_participant_authority","resolve_watch_party_livekit_viewer_authority"]) {
    await db.exec(extract(lifecycle,name));
  }
  await db.exec(extract(old,"enforce_watch_party_room_membership_authority_closeout_internal"));
  await db.exec(`
    create trigger enforce_watch_party_membership_identity before insert or update on public.watch_party_room_memberships for each row execute function public.enforce_watch_party_membership_identity();
    create trigger enforce_watch_party_room_membership_authority_closeout before insert or update on public.watch_party_room_memberships for each row execute function public.enforce_watch_party_room_membership_authority_closeout_internal();
    alter table public.watch_party_room_memberships enable row level security;
    alter table public.watch_party_room_memberships force row level security;
    grant select on public.watch_party_room_memberships to authenticated;
    create policy fixture_membership_read on public.watch_party_room_memberships for select to authenticated using (user_id=auth.uid()::text);
  `);
  for (const user of [host,speaker,listener]) await db.query("insert into auth.sessions values($1,$2,now()+interval '1 day')",[generation(user),user]);
  await db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,content_access_rule) values('LIVE-OPEN',$1,'live','open'),('LIVE-PREMIUM',$1,'live','premium'),('LIVE-PARTY-PASS',$1,'live','party_pass'),('TITLE-OPEN',$1,'title','open')",[host]);
  await db.query("insert into public.fixture_premium values($1,now()+interval '1 day')",[speaker]);
  await db.query("insert into public.user_entitlements values($1,'premium')",[speaker]);
  for (const user of [host,speaker,listener]) await join(user);
  await approve(speaker);
  await expectDenied(heartbeat(speaker),/room_membership_self_escalation_forbidden/u,"BEFORE approved speaker heartbeat fails in legacy trigger");
  await expectDenied(join(speaker),/room_membership_self_escalation_forbidden/u,"BEFORE approved speaker rejoin fails in INSERT half of UPSERT");
  const before = await as(null,"select public.resolve_watch_party_livekit_viewer_authority('LIVE-PREMIUM',$1,$2) as authority",[speaker,generation(speaker)],"service_role");
  check(before.rows[0].authority.allowed===false,"BEFORE service role falsely denies finite target Premium");

  await db.exec(repair);
  const touched = (await heartbeat(speaker)).rows[0];
  check(touched.stage_role==="speaker" && touched.can_speak && touched.camera_enabled && touched.mic_enabled,"AFTER approved speaker heartbeat retains authorized media");
  check((await join(speaker)).rows[0].stage_role==="speaker","AFTER approved speaker survives both UPSERT triggers");
  check((await heartbeat(listener)).rows[0].stage_role==="listener","listener heartbeat cannot self-promote");
  await approve(speaker,true);
  const muted = (await heartbeat(speaker)).rows[0];
  check(muted.host_muted && muted.is_muted && !muted.camera_enabled && !muted.mic_enabled,"self heartbeat preserves host mute and disabled media");
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:"authenticated",sub:speaker,session_id:generation(speaker)})]);
  await db.exec("select set_config('app.watch_party_membership_authority','server',false)");
  await expectDenied(db.query("update public.watch_party_room_memberships set host_muted=false,camera_enabled=true,mic_enabled=true where party_id='LIVE-OPEN' and user_id=$1",[speaker]),
    /room_membership_self_escalation_forbidden/u,"forged server flag cannot erase host mute");
  await approve(speaker,false);
  const selfMuted = (await heartbeat(speaker,"reconnecting",true)).rows[0];
  check(selfMuted.stage_role==="speaker" && selfMuted.self_muted && !selfMuted.camera_enabled && !selfMuted.mic_enabled,"self mute and reconnect retain approval without media");
  const left = (await heartbeat(speaker,"left")).rows[0];
  check(left.membership_state==="left" && !left.camera_enabled && !left.mic_enabled,"approved speaker can leave");
  check((await heartbeat(speaker,"left")).rows[0].membership_state==="left","repeated terminal heartbeat is idempotent");
  await expectDenied(heartbeat(speaker),/watch_party_join_rpc_required/u,"heartbeat cannot revive a left membership");

  for (const party of ["LIVE-PREMIUM","LIVE-PARTY-PASS"]) {
    const result = await as(null,"select public.resolve_watch_party_livekit_viewer_authority($1,$2,$3) as authority",[party,speaker,generation(speaker)],"service_role");
    check(result.rows[0].authority.allowed===true,`${party}: service role uses exact target Premium`);
    check((await as(null,"select public.user_has_active_entitlement($1,array['premium']) as allowed",[speaker],"service_role")).rows[0].allowed===false,"public entitlement lookup remains caller-bound");
  }
  await expectDenied(as(speaker,"select public.watch_party_room_self_access_allowed_internal('LIVE-PREMIUM',$1)",[listener]),/permission denied/u,"internal helper remains inaccessible to client");
  await expectDenied(as(null,"select public.watch_party_room_self_access_allowed_internal('LIVE-PREMIUM',$1)",[speaker],"service_role"),/permission denied/u,"internal helper remains inaccessible directly to service");
  await expectDenied(as(listener,"update public.watch_party_room_memberships set stage_role='speaker',can_speak=true where party_id='LIVE-OPEN'"),/permission denied/u,"direct self promotion still denied by grants");
  // Even in a test-owner SQL context with a forged server flag and valid user
  // claims, the actual trigger independently rejects promotion/host unmute.
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:"authenticated",sub:listener,session_id:generation(listener)})]);
  await db.exec("select set_config('app.watch_party_membership_authority','server',false)");
  await expectDenied(db.query("update public.watch_party_room_memberships set stage_role='speaker',can_speak=true where party_id='LIVE-OPEN' and user_id=$1",[listener]),/room_membership_self_escalation_forbidden/u,"server flag alone cannot approve a listener");

  for (const party of ["TITLE-OPEN"]) {
    await join(speaker,party); await approve(speaker,false,"active",party);
    check((await heartbeat(speaker,"active",false,party)).rows[0].can_speak,"shared repair preserves ordinary title-room speaker heartbeat");
  }
  await db.exec("insert into public.paid_watch_party_offers values('TITLE-OPEN','active')");
  await db.query("insert into public.fixture_paid_access values('TITLE-OPEN',$1)",[speaker]);
  const paid = (await heartbeat(speaker,"active",false,"TITLE-OPEN")).rows[0];
  check(paid.stage_role==="listener" && !paid.can_speak && !paid.camera_enabled && !paid.mic_enabled,"paid Watch Party heartbeat retains viewer-only normalization");
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:"authenticated",sub:speaker,session_id:generation(speaker)})]);
  await db.exec("select set_config('app.watch_party_membership_authority','server',false)");
  await expectDenied(db.query("update public.watch_party_room_memberships set stage_role='speaker',can_speak=true where party_id='TITLE-OPEN' and user_id=$1",[speaker]),
    /paid_watch_party_viewer_only/u,"forged server flag cannot promote a paid Watch Party viewer");
  await approve(listener,false,"removed");
  await expectDenied(join(listener),/watch_party_membership_removed/u,"join cannot revive a host-removed member");
  await expectDenied(heartbeat(listener),/watch_party_join_rpc_required/u,"heartbeat cannot revive a host-removed member");
  await db.query("insert into public.fixture_blocks values('LIVE-PREMIUM',$1)",[speaker]);
  check((await as(null,"select public.resolve_watch_party_livekit_viewer_authority('LIVE-PREMIUM',$1,$2) as authority",[speaker,generation(speaker)],"service_role")).rows[0].authority.allowed===false,"blocked target still denied");
  await db.exec("delete from public.fixture_blocks");
  await db.query("update public.fixture_premium set expires_at=now()-interval '1 second' where user_id=$1",[speaker]);
  check((await as(null,"select public.resolve_watch_party_livekit_viewer_authority('LIVE-PREMIUM',$1,$2) as authority",[speaker,generation(speaker)],"service_role")).rows[0].authority.allowed===false,"expired Premium still denied");
  await db.query("update auth.sessions set not_after=now()-interval '1 second' where user_id=$1",[listener]);
  await expectDenied(heartbeat(listener),/watch_party_current_session_required/u,"expired exact session cannot heartbeat");
  const acl = (await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.watch_party_room_memberships'::regclass")).rows[0];
  check(acl.relrowsecurity && acl.relforcerowsecurity,"RLS and FORCE RLS remain unchanged");
  console.log(`Live room PostgreSQL regression passed (${checks} checks; isolated fixture authority dependencies, no external DB/provider).`);
} finally {
  await db.close();
}
