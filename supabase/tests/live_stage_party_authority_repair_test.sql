-- Full-schema contract test. Run against the disposable local Supabase test
-- database after all migrations; never run test fixtures against production.
begin;
select no_plan();

create function pg_temp.live_repair_user(n integer) returns uuid language sql immutable as $$
  select ('ac140000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.live_repair_session(n integer) returns uuid language sql immutable as $$
  select ('ac140001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.live_repair_login(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
    'sub',pg_temp.live_repair_user(n),'session_id',pg_temp.live_repair_session(n))::text,true);
end $$;

insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at)
  select pg_temp.live_repair_user(n),false,false,now() from generate_series(1,3) n;
insert into auth.sessions(id,user_id,not_after)
  select pg_temp.live_repair_session(n),pg_temp.live_repair_user(n),now()+interval '1 day' from generate_series(1,3) n;
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
  select pg_temp.live_repair_user(n),public.wave1_sha256(pg_temp.live_repair_user(n)::text),
    d.document_key,d.version,d.market,'member',d.capability,pg_temp.live_repair_session(n)::text,'service_reconciliation'
  from generate_series(1,3) n cross join public.wave1_legal_document_versions d
  where d.active and d.market='UNITED_STATES' and d.capability='account';
update public.platform_money_kill_switches set state='sandbox_only'
  where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled');
select is((select public.process_revenuecat_premium_event_atomic(
  'revenuecat_google_play','live-repair-premium-2','INITIAL_PURCHASE',pg_temp.live_repair_user(2),
  p.provider_product_id,p.provider_base_plan_id,'sandbox','active',now()-interval '1 minute',now()+interval '1 day',now(),999,'usd',repeat('2',64),
  'NORMAL','google_play','android',null,p.id,'live-repair-original-2')->>'status'
  from public.monetization_products p where p.provider='revenuecat_google_play' and p.environment='sandbox'
    and p.product_type='premium_subscription' and p.status='sandbox' order by p.created_at,p.id limit 1),
  'processed','viewer Premium comes from the real finite provider authority transaction');
select ok(public.premium_subject_has_finite_authority_internal(pg_temp.live_repair_user(2)::text),
  'fixture viewer has actual provider-backed finite Premium');

select pg_temp.live_repair_login(1);
set local role authenticated;
insert into public.watch_party_rooms(party_id,host_user_id,room_type,content_access_rule)
  values ('LIVE-REPAIR-OPEN',auth.uid(),'live','open'),('LIVE-REPAIR-PREMIUM',auth.uid(),'live','premium');
select pg_temp.live_repair_login(2);
select lives_ok($$select public.join_watch_party_room_session('LIVE-REPAIR-OPEN')$$,'viewer joins through normal RPC');
select lives_ok($$select public.join_watch_party_room_session('LIVE-REPAIR-PREMIUM')$$,'Premium viewer joins through caller-bound RPC');
select pg_temp.live_repair_login(3);
select lives_ok($$select public.join_watch_party_room_session('LIVE-REPAIR-OPEN')$$,'ordinary listener joins open Live');
select throws_ok($$select public.join_watch_party_room_session('LIVE-REPAIR-PREMIUM')$$,
  'watch_party_room_entitlement_required','non-Premium listener cannot use ordinary Live fallback');
select pg_temp.live_repair_login(1);
select lives_ok($$select public.set_watch_party_participant_authority('LIVE-REPAIR-OPEN',pg_temp.live_repair_user(2)::text,'speaker',false,'active')$$,
  'exact host grants a speaker seat through the real authority RPC');
select pg_temp.live_repair_login(2);
select results_eq($$select stage_role,can_speak,camera_enabled,mic_enabled from public.heartbeat_watch_party_room_session('LIVE-REPAIR-OPEN','active',true,true,false)$$,
  $$values ('speaker'::text,true,true,true)$$,'approved speaker heartbeat survives every production membership trigger');
select results_eq($$select stage_role,can_speak from public.join_watch_party_room_session('LIVE-REPAIR-OPEN')$$,
  $$values ('speaker'::text,true)$$,'fresh approved join survives INSERT and UPDATE halves of UPSERT');
select pg_temp.live_repair_login(1);
select lives_ok($$select public.set_watch_party_participant_authority('LIVE-REPAIR-OPEN',pg_temp.live_repair_user(2)::text,'speaker',true,'active')$$,
  'host mute commits through the normal RPC');
select pg_temp.live_repair_login(2);
select results_eq($$select host_muted,is_muted,camera_enabled,mic_enabled from public.heartbeat_watch_party_room_session('LIVE-REPAIR-OPEN','active',true,true,false)$$,
  $$values (true,true,false,false)$$,'self heartbeat cannot undo host mute');
select pg_temp.live_repair_login(3);
select results_eq($$select stage_role,can_speak,camera_enabled,mic_enabled from public.heartbeat_watch_party_room_session('LIVE-REPAIR-OPEN','active',true,true,false)$$,
  $$values ('listener'::text,false,false,false)$$,'listener media preferences cannot grant speaker authority');
select throws_ok($$update public.watch_party_room_memberships set stage_role='speaker',can_speak=true where party_id='LIVE-REPAIR-OPEN'$$,
  '42501',null,'direct self promotion remains forbidden');
reset role;

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select is(public.resolve_watch_party_livekit_viewer_authority('LIVE-REPAIR-PREMIUM',pg_temp.live_repair_user(2),pg_temp.live_repair_session(2))->>'allowed',
  'true','real service-role LiveKit resolver accepts finite target Premium without a viewer JWT');
select is(public.resolve_watch_party_livekit_viewer_authority('LIVE-REPAIR-PREMIUM',pg_temp.live_repair_user(3),pg_temp.live_repair_session(3))->>'allowed',
  'false','service resolver does not invent target Premium');
select ok(not public.user_has_active_entitlement(pg_temp.live_repair_user(2)::text,array['premium']),
  'public entitlement RPC remains caller-bound under service context');
select is(public.resolve_watch_party_livekit_viewer_authority('LIVE-REPAIR-PREMIUM',pg_temp.live_repair_user(2),pg_temp.live_repair_session(3))->>'allowed',
  'false','foreign target session cannot borrow viewer Premium');
reset role;
select ok(not has_function_privilege('authenticated','public.watch_party_room_self_access_allowed_internal(text,text)','EXECUTE')
  and not has_function_privilege('service_role','public.watch_party_room_self_access_allowed_internal(text,text)','EXECUTE'),
  'internal target authority remains inaccessible as a direct RPC');
select ok(not has_function_privilege('authenticated','public.enforce_watch_party_room_membership_authority_closeout_internal()','EXECUTE')
  and not has_function_privilege('service_role','public.enforce_watch_party_room_membership_authority_closeout_internal()','EXECUTE'),
  'trigger helper remains internal');
select ok(not has_table_privilege('authenticated','public.watch_party_room_memberships','INSERT')
  and not has_column_privilege('authenticated','public.watch_party_room_memberships','stage_role','UPDATE'),
  'membership admission and role writes remain RPC-only');
select ok((select relrowsecurity from pg_class where oid='public.watch_party_room_memberships'::regclass),
  'membership RLS remains enabled');
select is((select tgenabled::text from pg_trigger where tgrelid='public.watch_party_room_memberships'::regclass
  and tgname='enforce_watch_party_membership_identity'),'O','canonical identity guard remains enabled');
select pg_temp.live_repair_login(1);
set local role authenticated;
select lives_ok($$select public.set_watch_party_participant_authority('LIVE-REPAIR-OPEN',pg_temp.live_repair_user(2)::text,'listener',false,'removed')$$,
  'host can remove an approved speaker');
select pg_temp.live_repair_login(2);
select throws_ok($$select public.heartbeat_watch_party_room_session('LIVE-REPAIR-OPEN')$$,
  'watch_party_join_rpc_required','heartbeat cannot revive removed member');
select throws_ok($$select public.join_watch_party_room_session('LIVE-REPAIR-OPEN')$$,
  'watch_party_membership_removed','join cannot revive removed member');
reset role;
update auth.sessions set not_after=now()-interval '1 second' where id=pg_temp.live_repair_session(3);
select pg_temp.live_repair_login(3);
set local role authenticated;
select throws_ok($$select public.heartbeat_watch_party_room_session('LIVE-REPAIR-OPEN')$$,
  'watch_party_current_session_required','expired current session still fails closed');
reset role;
select * from finish();
rollback;
