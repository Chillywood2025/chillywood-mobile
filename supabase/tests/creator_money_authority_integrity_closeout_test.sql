begin;
select plan(136);

-- Successor-owned authority surfaces exist and remain service/internal only.
select has_table('public', 'creator_earnings_lifecycle_events', 'append-only creator earnings lifecycle exists');
select has_table('public', 'revenuecat_unbound_terminal_authority', 'unbound terminal authority tombstones exist');
select has_table('public', 'revenuecat_unbound_initial_authority', 'unbound initial authority reservations exist');
select has_table('public', 'revenuecat_webhook_ingress_events', 'append-only RevenueCat webhook ingress identity exists');

select ok(
  to_regclass('public.revenuecat_premium_transaction_authority') is not null
  and (
    select bool_and(class.relrowsecurity and class.relforcerowsecurity)
    from pg_catalog.pg_class class
    where class.oid in (
      'public.creator_earnings_lifecycle_events'::regclass,
      'public.revenuecat_unbound_terminal_authority'::regclass,
      'public.revenuecat_unbound_initial_authority'::regclass,
      'public.revenuecat_premium_transaction_authority'::regclass
    )
  ),
  'successor evidence tables force RLS'
);

select ok(
  not has_table_privilege('service_role', 'public.creator_earnings_lifecycle_events', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.revenuecat_unbound_terminal_authority', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.revenuecat_unbound_initial_authority', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.revenuecat_premium_transaction_authority', 'INSERT,UPDATE,DELETE'),
  'service role cannot directly mutate internal lifecycle or provider tombstones'
);

select ok(
  has_function_privilege('service_role', 'public.reserve_revenuecat_webhook_ingress_event(text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.reserve_revenuecat_webhook_ingress_event(text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reserve_revenuecat_webhook_ingress_event(text,text)', 'EXECUTE')
  and not has_table_privilege('service_role', 'public.revenuecat_webhook_ingress_events', 'INSERT,UPDATE,DELETE'),
  'webhook ingress reservation is service-only and its identity table is read-only'
);

select is(
  public.reserve_revenuecat_webhook_ingress_event(
    'closeout-ingress-event', repeat('a', 64)
  )->>'status',
  'reserved',
  'first exact webhook event/hash pair reserves append-only ingress identity'
);
select ok(
  public.reserve_revenuecat_webhook_ingress_event(
    'closeout-ingress-event', repeat('a', 64)
  )->>'status' = 'duplicate'
  and coalesce((public.reserve_revenuecat_webhook_ingress_event(
    'closeout-ingress-event', repeat('a', 64)
  )->>'duplicateEvent')::boolean, false),
  'exact webhook ingress replay is idempotent'
);
select throws_ok(
  $$select public.reserve_revenuecat_webhook_ingress_event(
    'closeout-ingress-event', repeat('b', 64)
  )$$,
  'P0001', 'revenuecat_webhook_ingress_identity_mismatch',
  'one webhook event ID cannot be rebound to a different signed payload hash'
);
select throws_ok(
  $$select public.reserve_revenuecat_webhook_ingress_event(
    'closeout-malformed-ingress-event', repeat('a', 63)
  )$$,
  'P0001', 'revenuecat_webhook_ingress_identity_invalid',
  'malformed webhook evidence hash is rejected before reservation'
);
select throws_ok(
  $$update public.revenuecat_webhook_ingress_events
    set raw_payload_hash = repeat('c', 64)
    where provider_event_id = 'closeout-ingress-event'$$,
  'P0001', 'revenuecat_webhook_ingress_events_are_append_only',
  'reserved webhook ingress identity cannot be rewritten'
);

select ok(
  has_function_privilege('service_role', 'public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid)', 'EXECUTE'),
  'LiveKit viewer authority resolver is service-only'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"service_role","sub":"a1000000-0000-4000-8000-000000000001"}', true);
select throws_ok(
  $$select public.resolve_watch_party_livekit_viewer_authority(
    'CLOSEOUT-NOT-YET-CREATED', 'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001'
  )$$,
  '42501', 'permission denied for function resolve_watch_party_livekit_viewer_authority',
  'caller-controlled JWT role text cannot bypass the authenticated-role EXECUTE denial'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

select ok(
  has_function_privilege('service_role', 'public.process_revenuecat_app_store_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.process_revenuecat_google_play_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.process_revenuecat_terminal_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.process_revenuecat_app_store_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.process_revenuecat_google_play_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.process_revenuecat_terminal_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text)', 'EXECUTE'),
  'exact App Store, Google, neutral terminal and 20-argument Premium wrappers are service-only'
);

select ok(
  not has_function_privilege('service_role', 'public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.record_creator_earnings_lifecycle_internal(uuid,text,text,text,uuid,uuid,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.wave1_user_has_active_legal_requirements_internal(uuid,text)', 'EXECUTE'),
  'internal provider, earnings and legal projectors cannot be invoked by API roles'
);

select ok(
  pg_get_functiondef('public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)'::regprocedure)
    ilike '%security definer%set search_path to ''''%'
  and pg_get_functiondef('public.process_revenuecat_app_store_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text)'::regprocedure)
    ilike '%security definer%set search_path to ''''%'
  and pg_get_functiondef('public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid)'::regprocedure)
    ilike '%security definer%set search_path to ''''%'
  and pg_get_functiondef('public.mark_creator_payout_provider_result(uuid,text,text)'::regprocedure)
    ilike '%security definer%set search_path to ''''%',
  'high-risk authority functions are SECURITY DEFINER with an empty search path'
);

select ok(
  to_regclass('public.revenuecat_transaction_intents_original_global_unique') is not null
  and to_regclass('public.creator_payout_requests_provider_payout_id_unique') is not null
  and exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.creator_earnings_lifecycle_events'::regclass
      and tgname = 'block_creator_earnings_lifecycle_mutation'
      and not tgisinternal
  ),
  'exact transaction, payout identity and append-only controls are installed'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.user_entitlements'::regclass
      and conname = 'user_entitlements_premium_finite_authority_check'
  )
  and exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.access_grants'::regclass
      and conname = 'access_grants_premium_finite_authority_check'
  ),
  'Premium active authority requires finite database periods'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.creator_payout_requests'::regclass
      and conname = 'creator_payout_requests_provider_payout_id_shape_check'
  )
  and to_regclass('public.creator_payout_requests_provider_payout_id_unique') is not null,
  'payout provider proof has exact shape and global uniqueness controls'
);

-- One rollout-eligible creator with two live session generations.
create temporary table creator_money_closeout_fixture as
select creator_id
from (
  select md5('creator-money-closeout:' || candidate::text)::uuid as creator_id
  from generate_series(1, 1000) candidate
) candidates
where mod(hashtextextended('chillywood-wave1-us-rollout-v1:' || creator_id::text, 20260814), 100) = 0
limit 1;

alter table pg_temp.creator_money_closeout_fixture
  add column session_one uuid,
  add column session_two uuid;
update pg_temp.creator_money_closeout_fixture
set session_one = md5('closeout-session-one:' || creator_id::text)::uuid,
    session_two = md5('closeout-session-two:' || creator_id::text)::uuid;

grant select on pg_temp.creator_money_closeout_fixture to authenticated, service_role;

insert into auth.users (id, is_sso_user, is_anonymous, email_confirmed_at)
select creator_id, false, false, now() from pg_temp.creator_money_closeout_fixture
union all values
  ('a1000000-0000-4000-8000-000000000001'::uuid, false, false, now()),
  ('a1000000-0000-4000-8000-000000000002'::uuid, false, false, now()),
  ('a1000000-0000-4000-8000-000000000003'::uuid, false, false, now()),
  ('a1000000-0000-4000-8000-000000000004'::uuid, false, false, now()),
  ('a1000000-0000-4000-8000-000000000005'::uuid, false, false, now()),
  ('a1000000-0000-4000-8000-000000000006'::uuid, false, false, now()),
  ('a1000000-0000-4000-8000-000000000007'::uuid, false, false, now()),
  ('a1000000-0000-4000-8000-000000000008'::uuid, false, false, now())
on conflict (id) do nothing;

update auth.users
set email = case id
  when 'a1000000-0000-4000-8000-000000000001' then 'current-owner@closeout.example'
  when 'a1000000-0000-4000-8000-000000000002' then 'former-owner@closeout.example'
  else email end
where id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002'
);

insert into public.platform_role_memberships (user_id, email, role, status)
values (
  'a1000000-0000-4000-8000-000000000001',
  'former-owner@closeout.example', 'owner', 'active'
);
select ok(
  public.is_platform_owner_user('a1000000-0000-4000-8000-000000000001')
  and not public.is_platform_owner_user('a1000000-0000-4000-8000-000000000002')
  and exists (
    select 1 from public.platform_role_memberships membership
    where membership.user_id = 'a1000000-0000-4000-8000-000000000001'
      and membership.email = 'former-owner@closeout.example'
      and membership.status = 'active'
  )
  and not exists (
    select 1 from public.platform_role_memberships membership
    where membership.user_id = 'a1000000-0000-4000-8000-000000000002'
      and membership.status = 'active'
  )
  and public.autonomous_actor_authority_role(
    'a1000000-0000-4000-8000-000000000002',
    'former-owner@closeout.example'
  ) is null
  and pg_get_functiondef(
    'public.bind_platform_role_membership_identity_internal()'::regprocedure
  ) ilike '%email_confirmed_at%'
  and not exists (
    select 1 from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'auth.users'::regclass
      and trigger_row.tgname = 'bind_platform_role_invitation_on_auth_user'
      and not trigger_row.tgisinternal
  ),
  'a recycled old privileged email cannot authorize a different immutable confirmed user subject'
);

insert into auth.sessions (id, user_id)
select session_one, creator_id from pg_temp.creator_money_closeout_fixture
union all
select session_two, creator_id from pg_temp.creator_money_closeout_fixture;

create temporary table creator_money_closeout_buyer_sessions (
  user_id uuid primary key,
  session_generation uuid not null,
  rotated_generation uuid
);
insert into pg_temp.creator_money_closeout_buyer_sessions (
  user_id, session_generation, rotated_generation
) values
  ('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', null),
  ('a1000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', null),
  ('a1000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000003', null),
  ('a1000000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000004', null),
  ('a1000000-0000-4000-8000-000000000005', 'b5000000-0000-4000-8000-000000000005', null),
  ('a1000000-0000-4000-8000-000000000006', 'b6000000-0000-4000-8000-000000000006', null),
  ('a1000000-0000-4000-8000-000000000007', 'b7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000007'),
  ('a1000000-0000-4000-8000-000000000008', 'b8000000-0000-4000-8000-000000000008', null);

insert into auth.sessions (id, user_id)
select session_generation, user_id
from pg_temp.creator_money_closeout_buyer_sessions;

grant select on pg_temp.creator_money_closeout_buyer_sessions to authenticated, service_role;

insert into public.wave1_legal_acceptances (
  user_id, subject_hash, document_key, document_version, market,
  role_key, capability, session_generation, authority_source
)
select
  buyer.user_id, public.wave1_sha256(buyer.user_id::text),
  document.document_key, document.version, document.market,
  'member', document.capability, buyer.session_generation::text, 'service_reconciliation'
from pg_temp.creator_money_closeout_buyer_sessions buyer
cross join public.wave1_legal_document_versions document
where document.active and document.market = 'UNITED_STATES'
  and document.capability = 'account';

insert into public.user_entitlements (
  user_id, entitlement_key, status, source, starts_at, expires_at, revoked_at, metadata
) values (
  'a1000000-0000-4000-8000-000000000001', 'premium_live', 'revoked',
  'migration', now() - interval '1 day', null, now(),
  jsonb_build_object('authority_granted', false, 'synthetic_closeout_fixture', true)
);
select throws_ok(
  $$insert into public.user_entitlements (
      user_id, entitlement_key, status, source, starts_at, expires_at, metadata
    ) values (
      'a1000000-0000-4000-8000-000000000002', 'premium_live', 'active',
      'migration', now() - interval '1 day', null,
      jsonb_build_object('synthetic_closeout_fixture', true)
    )$$,
  '23514',
  'new row for relation "user_entitlements" violates check constraint "user_entitlements_supported_premium_authority_check"',
  'unsupported Premium-family alias cannot create active authority'
);
select ok(
  not exists (
    select 1 from public.user_entitlements entitlement
    where entitlement.entitlement_key in ('premium_watch_party','premium_live','paid_content')
      and entitlement.status in ('active','trialing','grace_period')
  ),
  'no unsupported Premium-family or global paid-content alias remains active'
);

-- The room is a fixture for entitlement alias closure. Its creation is not an
-- authenticated Live-room operation and must not invoke caller authority.
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.watch_party_rooms (
  party_id, title_id, host_user_id, room_type, join_policy,
  content_access_rule, is_active
)
select
  'CLOSEOUT-ALIAS-ROOM', 'closeout-alias-title', creator_id,
  'live', 'open', 'premium', true
from pg_temp.creator_money_closeout_fixture;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001","session_id":"b1000000-0000-4000-8000-000000000001"}',
  true
);
select is(
  public.resolve_creator_video_visibility_access(
    'a7000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002'
  )->>'reason',
  'viewer_identity_mismatch',
  'creator-video resolver rejects caller-selected viewer substitution before lookup'
);
select ok(
  (public.resolve_creator_video_visibility_access(
    'a7000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002'
  )->>'owner_user_id') is null
  and not coalesce((public.resolve_creator_video_visibility_access(
    'a7000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002'
  )->>'is_owner')::boolean, false)
  and not coalesce((public.resolve_creator_video_visibility_access(
    'a7000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002'
  )->>'is_blocked')::boolean, false)
  and not coalesce((public.resolve_creator_video_visibility_access(
    'a7000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002'
  )->>'is_circle_member')::boolean, false),
  'viewer substitution discloses no owner, block, or circle relationship data'
);
select ok(
  not public.can_read_creator_video_row(
    'a1000000-0000-4000-8000-000000000002', 'public', 'clean', 'clean',
    'creator-videos/a1000000-0000-4000-8000-000000000002/video.mp4',
    'creator-videos/a1000000-0000-4000-8000-000000000002/video.mp4', null,
    'a1000000-0000-4000-8000-000000000002'
  ),
  'creator-video RLS helper cannot use another subject as the viewer'
);
select ok(
  not public.user_has_active_entitlement(
    'a1000000-0000-4000-8000-000000000001', array['premium_live'::text]
  ),
  'revoked unsupported Premium alias cannot authorize its exact subject'
);
select ok(
  public.resolve_creator_video_visibility_access(
    'a7000000-0000-4000-8000-000000000001'
  )->>'reason' = 'not_found'
  and public.resolve_creator_video_visibility_access(
    'a7000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001'
  )->>'reason' = 'not_found'
  and public.resolve_creator_video_visibility_access(
    'a7000000-0000-4000-8000-000000000001'
  )->>'viewer_user_id' = 'a1000000-0000-4000-8000-000000000001',
  'omitted and exact-self creator-video viewer identities preserve canonical lookup behavior'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  auth.role(),
  'service_role',
  'service-only LiveKit authority uses the canonical request.jwt.claims role shape'
);
select ok(
  not coalesce((public.resolve_watch_party_livekit_viewer_authority(
    'CLOSEOUT-ALIAS-ROOM', 'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001'
  )->>'allowed')::boolean, false),
  'unsupported Premium-family alias cannot authorize a Premium room path'
);
reset role;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.role', '', true);

select ok(
  public.wave1_legal_document_configuration_complete_internal('creator_money'),
  'creator-money legal document configuration starts complete'
);

insert into public.wave1_legal_acceptances (
  user_id, subject_hash, document_key, document_version, market,
  role_key, capability, session_generation, authority_source
)
select
  fixture.creator_id, public.wave1_sha256(fixture.creator_id::text),
  document.document_key, document.version, document.market,
  'member', document.capability, fixture.session_one::text, 'service_reconciliation'
from pg_temp.creator_money_closeout_fixture fixture
cross join public.wave1_legal_document_versions document
where document.active and document.market = 'UNITED_STATES'
  and document.capability in ('account', 'creator', 'creator_money');

select ok(
  not public.wave1_user_has_active_legal_requirements_internal(
    (select creator_id from pg_temp.creator_money_closeout_fixture), 'creator_money'
  ),
  'one accepted session cannot authorize a second live session generation'
);

insert into public.wave1_legal_acceptances (
  user_id, subject_hash, document_key, document_version, market,
  role_key, capability, session_generation, authority_source
)
select
  fixture.creator_id, public.wave1_sha256(fixture.creator_id::text),
  document.document_key, document.version, document.market,
  'member', document.capability, fixture.session_two::text, 'service_reconciliation'
from pg_temp.creator_money_closeout_fixture fixture
cross join public.wave1_legal_document_versions document
where document.active and document.market = 'UNITED_STATES'
  and document.capability in ('account', 'creator', 'creator_money');

select ok(
  public.wave1_user_has_active_legal_requirements_internal(
    (select creator_id from pg_temp.creator_money_closeout_fixture), 'creator_money'
  ),
  'every live session generation with exact current documents satisfies legal authority'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role','authenticated',
    'sub',(select creator_id::text from pg_temp.creator_money_closeout_fixture),
    'session_id',(select session_one::text from pg_temp.creator_money_closeout_fixture)
  )::text,
  true
);
do $canonical_host_join$
begin
  perform public.join_watch_party_room_session(
    'CLOSEOUT-ALIAS-ROOM',null,null,null,false,false,false
  );
end;
$canonical_host_join$;
select ok(
  exists (
    select 1
    from public.watch_party_room_memberships membership
    join pg_temp.creator_money_closeout_fixture fixture
      on fixture.creator_id::text=membership.user_id
    where membership.party_id='CLOSEOUT-ALIAS-ROOM'
      and membership.role='host'
      and membership.membership_state='active'
  ),
  'canonical session join establishes one ordinary active host membership server-side'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

-- Test-only payout policy fixture: the production migration deliberately does
-- not fabricate a provider/legal payout document.
insert into public.wave1_legal_document_versions (
  document_key, version, market, capability, effective_at
) values (
  'payout_terms', '1.0', 'UNITED_STATES', 'payout', now() - interval '1 day'
);
select ok(
  public.wave1_legal_document_configuration_complete_internal('payout')
  and not public.wave1_user_has_active_legal_requirements_internal(
    (select creator_id from pg_temp.creator_money_closeout_fixture), 'payout'
  ),
  'creator-money acceptance alone cannot satisfy the separately configured payout legal tier'
);

insert into public.wave1_legal_acceptances (
  user_id, subject_hash, document_key, document_version, market,
  role_key, capability, session_generation, authority_source
)
select
  creator_id, public.wave1_sha256(creator_id::text),
  'payout_terms', '1.0', 'UNITED_STATES',
  'member', 'payout', session_one::text, 'service_reconciliation'
from pg_temp.creator_money_closeout_fixture;
select ok(
  not public.wave1_user_has_active_legal_requirements_internal(
    (select creator_id from pg_temp.creator_money_closeout_fixture), 'payout'
  ),
  'payout acceptance for one session cannot authorize another extant session generation'
);

insert into public.wave1_legal_acceptances (
  user_id, subject_hash, document_key, document_version, market,
  role_key, capability, session_generation, authority_source
)
select
  creator_id, public.wave1_sha256(creator_id::text),
  'payout_terms', '1.0', 'UNITED_STATES',
  'member', 'payout', session_two::text, 'service_reconciliation'
from pg_temp.creator_money_closeout_fixture;
select ok(
  public.wave1_user_has_active_legal_requirements_internal(
    (select creator_id from pg_temp.creator_money_closeout_fixture), 'payout'
  ),
  'exact payout acceptance for every current session satisfies the stricter payout legal tier'
);

update public.wave1_legal_document_versions
set active = false
where document_key = 'money_terms' and capability = 'creator_money' and market = 'UNITED_STATES';
select ok(
  not public.wave1_legal_document_configuration_complete_internal('creator_money')
  and not public.wave1_user_has_active_legal_requirements_internal(
    (select creator_id from pg_temp.creator_money_closeout_fixture), 'creator_money'
  ),
  'incomplete legal configuration fails closed'
);
update public.wave1_legal_document_versions
set active = true
where document_key = 'money_terms' and capability = 'creator_money' and market = 'UNITED_STATES';

do $$
declare
  v_result jsonb;
begin
  select public.wave1_evaluate_creator_eligibility(
    creator_id,
    jsonb_build_object(
      'accountStatus', 'ACTIVE', 'age18Plus', true, 'legalAccepted', true,
      'creatorRole', true, 'moderationState', 'CLEAR', 'market', 'UNITED_STATES',
      'rolloutEligible', false, 'platformCapability', true, 'providerEligible', true,
      'kycComplete', true, 'taxComplete', true, 'sanctionsClear', true,
      'payoutEligible', true, 'inputVersions', jsonb_build_object('evaluationSequence', 1)
    ),
    'creator-money-authority-integrity-closeout', 'local_pgtap'
  ) into v_result
  from pg_temp.creator_money_closeout_fixture;
  if v_result->>'state' <> 'VERIFIED' then
    raise exception 'closeout_creator_not_verified';
  end if;
end;
$$;

select ok(
  public.wave1_creator_money_subject_authorized_internal(
    (select creator_id from pg_temp.creator_money_closeout_fixture)
  ),
  'complete current legal and eligibility evidence authorizes the creator subject'
);

insert into public.creator_channel_subscription_offers (
  id, creator_id, title, price_cents, currency, interval, status,
  provider, provider_product_id, metadata
)
select
  'a8000000-0000-4000-8000-000000000001', creator_id,
  'Closeout channel subscription', 499, 'usd', 'monthly', 'sandbox',
  'revenuecat', 'com.chillywood.channel.subscription.slot1',
  jsonb_build_object('synthetic_closeout_fixture', true)
from pg_temp.creator_money_closeout_fixture;

update public.wave1_creator_eligibility
set age_18_plus = false
where creator_user_id = (select creator_id from pg_temp.creator_money_closeout_fixture);
select ok(
  not public.wave1_creator_money_subject_authorized_internal(
    (select creator_id from pg_temp.creator_money_closeout_fixture)
  ),
  'loss of authoritative 18+ eligibility fails creator-money authority closed'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001","session_id":"b1000000-0000-4000-8000-000000000001"}',
  true
);
select ok(
  (public.resolve_creator_channel_subscription_access(
    (select creator_id from pg_temp.creator_money_closeout_fixture)
  )->>'reason') = 'creator_authority_not_current'
  and pg_get_functiondef(
    'public.creator_video_paid_precharge_authority_internal(uuid,text,text,text,integer,text,text)'::regprocedure
  )
    ilike '%wave1_creator_money_subject_authorized_internal%',
  'creator restriction closes new channel-subscription and Paid Video precharge authority'
);
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.wave1_creator_eligibility
set age_18_plus = true
where creator_user_id = (select creator_id from pg_temp.creator_money_closeout_fixture);

update public.platform_money_kill_switches
set state = case
  when key in (
    'revenuecat_app_store_enabled', 'revenuecat_google_play_enabled',
    'provider_webhooks_enabled', 'watch_party_tickets_enabled'
  ) then 'sandbox_only'
  when key in ('live_money_enabled', 'payouts_enabled') then 'off'
  else state
end
where key in (
  'revenuecat_app_store_enabled', 'revenuecat_google_play_enabled',
  'provider_webhooks_enabled', 'watch_party_tickets_enabled',
  'live_money_enabled', 'payouts_enabled'
);

create function pg_temp.apply_closeout_premium(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_status text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_occurred_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_original_transaction_id text default null
)
returns jsonb
language sql
volatile
as $$
  select public.process_revenuecat_premium_event_atomic(
    'revenuecat_app_store', p_event_id, p_event_type, p_user_id,
    mapping.provider_product_id, mapping.provider_base_plan_id,
    'sandbox', p_status, p_starts_at, p_expires_at, p_occurred_at,
    p_amount_minor, p_currency, repeat('a', 64), 'NORMAL',
    'app_store', 'ios', mapping.id, mapping.product_id,
    coalesce(p_original_transaction_id, 'closeout-premium-original:' || p_event_id)
  )
  from public.monetization_product_store_mappings mapping
  where mapping.provider = 'revenuecat_app_store'
    and mapping.provider_product_id = 'com.chillywood.premium.monthly'
    and mapping.environment = 'sandbox'
  limit 1;
$$;

select is(
  (pg_temp.apply_closeout_premium(
    'closeout-premium-null-expiry', 'INITIAL_PURCHASE',
    'a1000000-0000-4000-8000-000000000001', 'active',
    now() - interval '1 day', null, now() - interval '20 minutes', 499, 'usd'
  ))->>'status',
  'ignored',
  'Premium active event with missing expiry is ignored'
);
select is(
  (select metadata->>'final_reason' from public.provider_events
   where provider_event_id = 'closeout-premium-null-expiry'),
  'premium_finite_period_invalid',
  'missing Premium expiry records an honest finite-period failure'
);
select ok(
  not public.premium_subject_has_finite_authority_internal('a1000000-0000-4000-8000-000000000001'),
  'malformed Premium event creates no finite entitlement authority'
);

select is(
  (pg_temp.apply_closeout_premium(
    'closeout-premium-zero-amount', 'INITIAL_PURCHASE',
    'a1000000-0000-4000-8000-000000000002', 'active',
    now() - interval '1 day', now() + interval '30 days',
    now() - interval '20 minutes', 0, 'usd'
  ))->>'reason',
  'premium_positive_amount_required',
  'Premium active event with zero amount fails closed'
);

select is(
  (pg_temp.apply_closeout_premium(
    'closeout-premium-initial', 'INITIAL_PURCHASE',
    'a1000000-0000-4000-8000-000000000003', 'active',
    now() - interval '1 day', now() + interval '30 days',
    now() - interval '10 minutes', 499, 'usd', 'closeout-premium-original-valid'
  ))->>'status',
  'processed',
  'exact finite Premium initial purchase processes'
);
select ok(
  public.premium_subject_has_finite_authority_internal('a1000000-0000-4000-8000-000000000003'),
  'exact finite Premium initial purchase grants current authority'
);

select is(
  (pg_temp.apply_closeout_premium(
    'closeout-premium-refund', 'REFUND',
    'a1000000-0000-4000-8000-000000000003', 'revoked',
    now() - interval '1 day', now() + interval '30 days',
    now() - interval '5 minutes', 499, 'usd', 'closeout-premium-original-valid'
  ))->>'status',
  'refunded',
  'exact newer Premium refund processes without an activation bypass'
);
select ok(
  not public.premium_subject_has_finite_authority_internal('a1000000-0000-4000-8000-000000000003'),
  'Premium refund removes current authority'
);

select is(
  (pg_temp.apply_closeout_premium(
    'closeout-premium-renew-after-refund', 'RENEWAL',
    'a1000000-0000-4000-8000-000000000003', 'active',
    now() - interval '1 day', now() + interval '30 days',
    now() - interval '1 minute', 499, 'usd', 'closeout-premium-original-valid'
  ))->>'status',
  'ignored',
  'renewal cannot silently reopen sticky terminal Premium authority'
);
select is(
  (select metadata->>'final_reason' from public.provider_events
   where provider_event_id = 'closeout-premium-renew-after-refund'),
  'premium_original_transaction_terminal_or_blocked',
  'post-refund Premium original transaction remains terminal'
);

select is(
  (pg_temp.apply_closeout_premium(
    'closeout-premium-replayed-initial', 'INITIAL_PURCHASE',
    'a1000000-0000-4000-8000-000000000003', 'active',
    now() - interval '1 day', now() + interval '30 days',
    now(), 499, 'usd', 'closeout-premium-original-valid'
  ))->>'reason',
  'premium_original_transaction_initial_replay',
  'same Premium original transaction cannot be replayed as a fresh purchase'
);

select is(
  (pg_temp.apply_closeout_premium(
    'closeout-premium-fresh-initial', 'INITIAL_PURCHASE',
    'a1000000-0000-4000-8000-000000000003', 'active',
    now() - interval '1 day', now() + interval '30 days',
    now() + interval '1 second', 499, 'usd', 'closeout-premium-original-fresh'
  ))->>'status',
  'processed',
  'a genuinely new Premium original transaction may establish fresh finite authority'
);

select throws_ok(
  $$select pg_temp.apply_closeout_premium(
    'closeout-premium-initial', 'RENEWAL',
    'a1000000-0000-4000-8000-000000000003', 'active',
    now() - interval '1 day', now() + interval '30 days', now(), 499, 'usd',
    'closeout-premium-original-valid'
  )$$,
  'P0001', 'revenuecat_premium_event_id_identity_mismatch',
  'Premium provider event ID cannot be rebound to another event type'
);

select throws_ok(
  $$select public.process_revenuecat_premium_event_atomic(
    'revenuecat_app_store', 'closeout-premium-wrong-store', 'INITIAL_PURCHASE',
    'a1000000-0000-4000-8000-000000000004',
    mapping.provider_product_id, mapping.provider_base_plan_id, 'sandbox', 'active',
    now() - interval '1 day', now() + interval '30 days', now(), 499, 'usd',
    repeat('b', 64), 'NORMAL', 'google_play', 'ios', mapping.id, mapping.product_id,
    'closeout-premium-wrong-store-original'
  ) from public.monetization_product_store_mappings mapping
  where mapping.provider_product_id = 'com.chillywood.premium.monthly'
    and mapping.environment = 'sandbox' limit 1$$,
  'P0001', 'revenuecat_premium_transaction_identity_invalid',
  'Premium provider/store/platform identity mismatch fails closed'
);

create temporary table unresolved_premium_closeout_results as
with first_delivery as materialized (
  select public.process_revenuecat_premium_event_atomic(
    'revenuecat_app_store', 'closeout-premium-unresolved-catalog', 'INITIAL_PURCHASE',
    'a1000000-0000-4000-8000-000000000004',
    'com.chillywood.premium.monthly', null, 'sandbox', 'active',
    now() - interval '1 day', now() + interval '30 days', now() - interval '2 minutes',
    499, 'usd', repeat('9', 64), 'NORMAL', 'app_store', 'ios', null, null,
    'closeout-premium-unresolved-original'
  ) as initial_result
), canonical_retry as materialized (
  select public.process_revenuecat_premium_event_atomic(
    'revenuecat_app_store', 'closeout-premium-unresolved-catalog-retry', 'RENEWAL',
    'a1000000-0000-4000-8000-000000000004',
    mapping.provider_product_id, mapping.provider_base_plan_id, 'sandbox', 'active',
    now() - interval '1 day', now() + interval '30 days', now() - interval '1 minute',
    499, 'usd', repeat('8', 64), 'NORMAL', 'app_store', 'ios', mapping.id, mapping.product_id,
    'closeout-premium-unresolved-original'
  ) as retry_result
  from first_delivery
  cross join public.monetization_product_store_mappings mapping
  where mapping.provider = 'revenuecat_app_store'
    and mapping.provider_product_id = 'com.chillywood.premium.monthly'
    and mapping.environment = 'sandbox'
  limit 1
)
select first_delivery.initial_result, canonical_retry.retry_result
from first_delivery cross join canonical_retry;

select ok(
  coalesce((select initial_result->>'status' = 'ignored'
    and initial_result->>'reason' = 'premium_store_product_resolution_missing_or_ambiguous'
    and retry_result->>'status' = 'ignored'
    and retry_result->>'reason' = 'premium_original_transaction_terminal_or_blocked'
    from pg_temp.unresolved_premium_closeout_results), false)
  and exists (
    select 1 from public.provider_events event
    where event.provider = 'revenuecat_app_store'
      and event.provider_event_id = 'closeout-premium-unresolved-catalog'
      and event.product_id is null
      and event.metadata->>'final_reason' = 'premium_store_product_resolution_missing_or_ambiguous'
  )
  and exists (
    select 1 from public.revenuecat_premium_transaction_authority authority
    where authority.provider = 'revenuecat_app_store'
      and authority.original_transaction_id = 'closeout-premium-unresolved-original'
      and authority.authority_state = 'blocked'
      and authority.current_product_id is null
  )
  and not public.premium_subject_has_finite_authority_internal(
    'a1000000-0000-4000-8000-000000000004'
  ),
  'unresolved Premium catalog identity is durably blocked and cannot later replay into authority'
);

select throws_ok(
  $$select public.process_revenuecat_app_store_event_atomic(
    'closeout-malformed-payload-hash', 'INITIAL_PURCHASE',
    'a1000000-0000-4000-8000-000000000004',
    'com.chillywood.seatpass.tier1', 'sandbox', now(),
    null, 99, 'usd', 'NOT-A-LOWERCASE-SHA256',
    'closeout-malformed-hash-original', null
  )$$,
  'P0001', 'revenuecat_payload_hash_invalid',
  'creator-money provider evidence rejects a malformed raw payload hash'
);

create temporary table cross_domain_premium_terminal_results as
with initial_delivery as materialized (
  select pg_temp.apply_closeout_premium(
    'closeout-cross-domain-premium-initial', 'INITIAL_PURCHASE',
    'a1000000-0000-4000-8000-000000000007', 'active',
    now() - interval '1 day', now() + interval '30 days',
    now() - interval '2 minutes', 499, 'usd',
    'closeout-cross-domain-premium-original'
  ) as result
), terminal_delivery as materialized (
  select public.process_revenuecat_app_store_event_atomic(
    'closeout-cross-domain-premium-refund', 'REFUND',
    'a1000000-0000-4000-8000-000000000007',
    '<missing-or-ambiguous>', 'sandbox', now() - interval '1 minute',
    null, null, null, repeat('7', 64),
    'closeout-cross-domain-premium-original',
    'provider_product_id_missing_or_ambiguous'
  ) as result
  from initial_delivery
)
select initial_delivery.result as initial_result,
       terminal_delivery.result as terminal_result
from initial_delivery cross join terminal_delivery;

select ok(
  coalesce((select initial_result->>'status' = 'processed'
    and terminal_result->>'status' = 'refunded'
    and terminal_result->>'domain' = 'premium'
    and terminal_result->>'reason' = 'terminal_dispatch_premium_projected'
    from pg_temp.cross_domain_premium_terminal_results), false)
  and not public.premium_subject_has_finite_authority_internal(
    'a1000000-0000-4000-8000-000000000007'
  ),
  'unresolved terminal product identity dispatches by exact original transaction and revokes Premium'
);

select ok(
  (public.process_revenuecat_app_store_event_atomic(
    'closeout-cross-domain-creator-rebind', 'INITIAL_PURCHASE',
    'a1000000-0000-4000-8000-000000000007',
    'com.chillywood.seatpass.tier1', 'sandbox', now(),
    null, 99, 'usd', repeat('5', 64),
    'closeout-cross-domain-premium-original', null
  )->>'reason') = 'provider_source_lock_unresolved'
  and not exists (
    select 1
    from public.revenuecat_premium_transaction_authority premium
    join public.revenuecat_consumable_transaction_intents creator_binding
      on creator_binding.provider = premium.provider
     and creator_binding.original_transaction_id = premium.original_transaction_id
  ),
  'an unresolved creator-money attempt cannot bind a Premium original transaction or bypass source locking'
);

update auth.users
set banned_until = now() + interval '1 day'
where id = 'a1000000-0000-4000-8000-000000000008';
create temporary table restricted_premium_closeout_result as
select pg_temp.apply_closeout_premium(
  'closeout-restricted-premium-initial', 'INITIAL_PURCHASE',
  'a1000000-0000-4000-8000-000000000008', 'active',
  now() - interval '1 day', now() + interval '30 days',
  now(), 499, 'usd', 'closeout-restricted-premium-original'
) as result;
select ok(
  coalesce((select result->>'status' = 'ignored'
    and result->>'reason' = 'premium_buyer_account_restricted'
    from pg_temp.restricted_premium_closeout_result), false)
  and not public.premium_subject_has_finite_authority_internal(
    'a1000000-0000-4000-8000-000000000008'
  ),
  'restricted Premium buyer cannot receive new entitlement authority'
);
update auth.users
set banned_until = null
where id = 'a1000000-0000-4000-8000-000000000008';

-- A real Seat projection proves the exact intent/provider/grant/ticket chain.
insert into public.watch_party_rooms (
  party_id, title_id, host_user_id, room_type, join_policy,
  content_access_rule, is_active
)
select
  'CLOSEOUT-SEAT-ROOM', 'closeout-title', creator_id,
  'title', 'open', 'party_pass', true
from pg_temp.creator_money_closeout_fixture;

insert into public.paid_watch_party_offers (
  id, party_id, creator_id, host_id, title, price_cents, currency,
  starts_at, ends_at, status, provider, provider_product_id, metadata
)
select
  'a2000000-0000-4000-8000-000000000001', 'CLOSEOUT-SEAT-ROOM',
  creator_id, creator_id, 'Closeout Seat Pass', 99, 'usd',
  now() - interval '5 minutes', now() + interval '1 hour',
  'sandbox', 'revenuecat', 'com.chillywood.seatpass.tier1',
  jsonb_build_object('sandbox_only', true, 'not_payable', true)
from pg_temp.creator_money_closeout_fixture;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role','authenticated',
    'sub',(select creator_id::text from pg_temp.creator_money_closeout_fixture),
    'session_id',(select session_one::text from pg_temp.creator_money_closeout_fixture)
  )::text,
  true
);
do $canonical_paid_host_join$
begin
  perform public.join_watch_party_room_session(
    'CLOSEOUT-SEAT-ROOM',null,null,null,false,false,false
  );
end;
$canonical_paid_host_join$;
reset role;
select set_config('request.jwt.claims', '{}', true);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select ok(
  coalesce((authority.result->>'allowed')::boolean, false)
  and coalesce((authority.result->>'paidSeatRequired')::boolean, false)
  and coalesce((authority.result->>'hostAuthority')::boolean, false)
  and authority.result->>'reason' = 'paid_room_host_authority'
  and (authority.result->>'expiresAt')::timestamptz > now()
  and (authority.result->>'expiresAt')::timestamptz <= now() + interval '31 seconds',
  'paid-room host retains host authority only through current creator proof and a short finite epoch'
)
from (
  select public.resolve_watch_party_livekit_viewer_authority(
    'CLOSEOUT-SEAT-ROOM',
    (select creator_id from pg_temp.creator_money_closeout_fixture),
    (select session_one from pg_temp.creator_money_closeout_fixture)
  ) as result
) authority;
reset role;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.role', '', true);

update public.watch_party_rooms
set is_active = false
where party_id = 'CLOSEOUT-SEAT-ROOM';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select ok(
  not coalesce((authority.result->>'allowed')::boolean, false),
  'inactive room denies even its paid host'
)
from (
  select public.resolve_watch_party_livekit_viewer_authority(
    'CLOSEOUT-SEAT-ROOM',
    (select creator_id from pg_temp.creator_money_closeout_fixture),
    (select session_one from pg_temp.creator_money_closeout_fixture)
  ) as result
) authority;
reset role;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.role', '', true);
update public.watch_party_rooms
set is_active = true
where party_id = 'CLOSEOUT-SEAT-ROOM';

update public.wave1_creator_eligibility
set age_18_plus = false
where creator_user_id = (select creator_id from pg_temp.creator_money_closeout_fixture);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select ok(
  not coalesce((authority.result->>'allowed')::boolean, false)
  and authority.result->>'reason' = 'paid_room_host_creator_authority_required',
  'paid-room host loses LiveKit authority when creator-money eligibility is no longer current'
)
from (
  select public.resolve_watch_party_livekit_viewer_authority(
    'CLOSEOUT-SEAT-ROOM',
    (select creator_id from pg_temp.creator_money_closeout_fixture),
    (select session_one from pg_temp.creator_money_closeout_fixture)
  ) as result
) authority;
reset role;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.role', '', true);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role','authenticated',
    'sub',(select creator_id::text from pg_temp.creator_money_closeout_fixture),
    'session_id',(select session_one::text from pg_temp.creator_money_closeout_fixture)
  )::text,
  true
);
select throws_ok(
  $$select public.heartbeat_watch_party_room_session(
    'CLOSEOUT-SEAT-ROOM','reconnecting',false,false,false,null,null,null
  )$$,
  'P0001', 'watch_party_room_entitlement_required',
  'canonical heartbeat cannot retain a paid-room host after creator authority loss'
);
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.wave1_creator_eligibility
set age_18_plus = true
where creator_user_id = (select creator_id from pg_temp.creator_money_closeout_fixture);

update public.paid_watch_party_offers
set status = 'paused'
where id = 'a2000000-0000-4000-8000-000000000001';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(
  not coalesce((authority.result->>'allowed')::boolean, false)
  and authority.result->>'reason' = 'paid_room_host_creator_authority_required',
  'paused paid Seat offer denies LiveKit host authority'
)
from (
  select public.resolve_watch_party_livekit_viewer_authority(
    'CLOSEOUT-SEAT-ROOM',
    (select creator_id from pg_temp.creator_money_closeout_fixture),
    (select session_one from pg_temp.creator_money_closeout_fixture)
  ) as result
) authority;
reset role;
select set_config('request.jwt.claims', '{}', true);

update public.paid_watch_party_offers
set status = 'blocked'
where id = 'a2000000-0000-4000-8000-000000000001';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(
  not coalesce((authority.result->>'allowed')::boolean, false)
  and authority.result->>'reason' = 'paid_room_host_creator_authority_required',
  'blocked paid Seat offer denies LiveKit host authority'
)
from (
  select public.resolve_watch_party_livekit_viewer_authority(
    'CLOSEOUT-SEAT-ROOM',
    (select creator_id from pg_temp.creator_money_closeout_fixture),
    (select session_one from pg_temp.creator_money_closeout_fixture)
  ) as result
) authority;
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.paid_watch_party_offers
set status = 'sandbox'
where id = 'a2000000-0000-4000-8000-000000000001';

insert into public.money_purchase_intents (
  id, user_id, product_id, product_key, product_type, provider, provider_product_id,
  source_type, source_id, creator_id, environment, status, amount_minor, currency,
  idempotency_key, expires_at, session_generation, metadata
)
select
  'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000004', mapping.product_id,
  product.product_key, product.product_type, mapping.provider,
  mapping.provider_product_id, 'watch_party_live',
  'a2000000-0000-4000-8000-000000000001', fixture.creator_id,
  'sandbox', 'pending', mapping.reference_price_minor, mapping.reference_currency,
  'closeout-seat-intent', now() + interval '15 minutes',
  (select session_generation::text
   from pg_temp.creator_money_closeout_buyer_sessions
   where user_id = 'a1000000-0000-4000-8000-000000000004'),
  jsonb_build_object('sandbox_only', true, 'not_payable', true)
from public.monetization_product_store_mappings mapping
join public.monetization_products product on product.id = mapping.product_id
cross join pg_temp.creator_money_closeout_fixture fixture
where mapping.provider = 'revenuecat_app_store'
  and mapping.provider_product_id = 'com.chillywood.seatpass.tier1'
  and mapping.environment = 'sandbox';

select is(
  (public.process_revenuecat_app_store_event_atomic(
    'closeout-seat-initial', 'INITIAL_PURCHASE',
    'a1000000-0000-4000-8000-000000000004',
    'com.chillywood.seatpass.tier1', 'sandbox', now() - interval '2 minutes',
    null, 99, 'usd', repeat('c', 64), 'closeout-seat-original', null
  ))->>'status',
  'processed',
  'exact Seat provider event consumes its single source-bound intent'
);

select ok(
  (select
    (metadata->>'viewer_access_only')::boolean
    and not (metadata->>'authority_granted')::boolean
    and not (metadata->>'speaker_authority')::boolean
    and not (metadata->>'moderator_authority')::boolean
    and not (metadata->>'payout_access')::boolean
    and not (metadata->>'premium_unlock')::boolean
   from public.access_grants
   where user_id = 'a1000000-0000-4000-8000-000000000004'
     and grant_type = 'watch_party_live_ticket'),
  'Seat access grant remains viewer-only with no Premium, publish or payout authority'
);

select ok(
  exists (
    select 1
    from public.paid_watch_party_tickets ticket
    join public.access_grants grant_row on grant_row.id = ticket.access_grant_id
    where ticket.offer_id = 'a2000000-0000-4000-8000-000000000001'
      and ticket.party_id = 'CLOSEOUT-SEAT-ROOM'
      and ticket.buyer_id = 'a1000000-0000-4000-8000-000000000004'
      and ticket.status = 'active'
      and grant_row.source_id = ticket.offer_id
  ),
  'Seat ticket is bound to the exact offer, party, buyer and access grant'
);

update public.paid_watch_party_offers
set status='paused',price_cents=199
where id='a2000000-0000-4000-8000-000000000001';
update public.wave1_creator_eligibility
set payout_eligible=false
where creator_user_id=(select creator_id from pg_temp.creator_money_closeout_fixture);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000004","session_id":"b4000000-0000-4000-8000-000000000004"}',
  true
);
select ok(
  coalesce((result->>'allowed')::boolean,false)
  and result->>'reason'='ticket_confirmed',
  'an exact Seat purchase survives future-sale pause, reprice, and seller payout-readiness loss'
) from (
  select public.resolve_paid_watch_party_ticket_access('CLOSEOUT-SEAT-ROOM') result
) historical_seat;
reset role;
select set_config('request.jwt.claims','{}',true);
update public.paid_watch_party_offers
set status='sandbox',price_cents=99
where id='a2000000-0000-4000-8000-000000000001';
update public.wave1_creator_eligibility
set payout_eligible=true
where creator_user_id=(select creator_id from pg_temp.creator_money_closeout_fixture);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select ok(
  coalesce((public.resolve_watch_party_livekit_viewer_authority(
    'CLOSEOUT-SEAT-ROOM', 'a1000000-0000-4000-8000-000000000004',
    'b4000000-0000-4000-8000-000000000004'
  )->>'allowed')::boolean, false),
  'service resolver admits the exact current Seat viewer proof'
);
select ok(
  coalesce((public.resolve_watch_party_livekit_viewer_authority(
    'CLOSEOUT-SEAT-ROOM', 'a1000000-0000-4000-8000-000000000004',
    'b4000000-0000-4000-8000-000000000004'
  )->>'paidSeatRequired')::boolean, false)
  and (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSEOUT-SEAT-ROOM', 'a1000000-0000-4000-8000-000000000004',
    'b4000000-0000-4000-8000-000000000004'
  )->>'expiresAt') is not null,
  'Seat resolver marks paid authority and returns an effective expiry bound'
);
select ok(
  not coalesce((public.resolve_watch_party_livekit_viewer_authority(
    'CLOSEOUT-OTHER-ROOM', 'a1000000-0000-4000-8000-000000000004',
    'b4000000-0000-4000-8000-000000000004'
  )->>'allowed')::boolean, false),
  'Seat proof cannot authorize another room'
);

insert into public.account_deletion_requests (
  id, user_id, status, delete_after, restore_deadline, metadata
) values (
  'a5000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000004',
  'scheduled', now() + interval '30 days', now() + interval '30 days',
  jsonb_build_object('synthetic_closeout_fixture', true)
);
select ok(
  not coalesce((authority.result->>'allowed')::boolean, false)
  and authority.result->>'reason' = 'viewer_session_authority_invalid',
  'a restore-only scheduled-deletion session cannot retain connected paid Seat authority'
)
from (
  select public.resolve_watch_party_livekit_viewer_authority(
    'CLOSEOUT-SEAT-ROOM',
    'a1000000-0000-4000-8000-000000000004',
    'b4000000-0000-4000-8000-000000000004'
  ) as result
) authority;
update public.account_deletion_requests
set status = 'restored', restored_at = now(), updated_at = now()
where id = 'a5000000-0000-4000-8000-000000000004';

insert into public.watch_party_room_memberships (party_id, user_id)
values ('CLOSEOUT-SEAT-ROOM', 'a1000000-0000-4000-8000-000000000004');

reset role;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.role', '', true);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role','authenticated',
    'sub',(select creator_id::text from pg_temp.creator_money_closeout_fixture),
    'session_id',(select session_one::text from pg_temp.creator_money_closeout_fixture)
  )::text,
  true
);
select throws_ok(
  $$update public.watch_party_room_memberships
    set role = 'speaker', stage_role = 'speaker', can_speak = true
    where party_id = 'CLOSEOUT-SEAT-ROOM'
      and user_id = 'a1000000-0000-4000-8000-000000000004'$$,
  '42501', 'permission denied for table watch_party_room_memberships',
  'paid-room host has no direct table authority to escalate an exact Seat viewer'
);
reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000004","session_id":"b4000000-0000-4000-8000-000000000004"}',
  true
);
set local role authenticated;
do $canonical_paid_viewer_reconnect$
begin
  perform public.heartbeat_watch_party_room_session(
    'CLOSEOUT-SEAT-ROOM','reconnecting',false,false,false,null,null,null
  );
end;
$canonical_paid_viewer_reconnect$;
select ok(
  exists (
    select 1 from public.watch_party_room_memberships membership
    where membership.party_id = 'CLOSEOUT-SEAT-ROOM'
      and membership.user_id = 'a1000000-0000-4000-8000-000000000004'
      and membership.membership_state = 'reconnecting'
      and membership.role = 'viewer'
      and membership.stage_role = 'listener'
      and not membership.can_speak
      and not membership.camera_enabled
      and not membership.mic_enabled
  ),
  'the exact Seat viewer can reconnect only through the canonical viewer/listener heartbeat'
);
reset role;
select set_config('request.jwt.claims', '{}', true);
delete from auth.sessions
where id = (
  select session_generation
  from pg_temp.creator_money_closeout_buyer_sessions
  where user_id = 'a1000000-0000-4000-8000-000000000004'
);
select ok(
  not exists (
    select 1 from auth.sessions session_row
    where session_row.id = (
      select session_generation
      from pg_temp.creator_money_closeout_buyer_sessions
      where user_id = 'a1000000-0000-4000-8000-000000000004'
    )
  ),
  'Seat purchase session is invalidated before terminal provider reconciliation'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select ok(
  not coalesce((authority.result->>'allowed')::boolean, false)
  and authority.result->>'reason' = 'viewer_session_authority_invalid',
  'deleting the exact token-bound session generation removes an already-connected Seat viewer authority'
)
from (
  select public.resolve_watch_party_livekit_viewer_authority(
    'CLOSEOUT-SEAT-ROOM',
    'a1000000-0000-4000-8000-000000000004',
    'b4000000-0000-4000-8000-000000000004'
  ) as result
) authority;

select is(
  (public.process_revenuecat_app_store_event_atomic(
    'closeout-seat-refund', 'REFUND',
    'a1000000-0000-4000-8000-000000000004',
    'com.chillywood.seatpass.tier1', 'sandbox', now() - interval '1 minute',
    null, 99, 'usd', repeat('d', 64), 'closeout-seat-original', null
  ))->>'status',
  'processed',
  'exact Seat refund processes against the durable original transaction'
);
select ok(
  not coalesce((public.resolve_watch_party_livekit_viewer_authority(
    'CLOSEOUT-SEAT-ROOM', 'a1000000-0000-4000-8000-000000000004',
    'b4000000-0000-4000-8000-000000000004'
  )->>'allowed')::boolean, false),
  'Seat refund immediately removes resolver authority'
);
reset role;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.role', '', true);
select ok(
  exists (
    select 1 from public.access_grants grant_row
    join public.paid_watch_party_tickets ticket on ticket.access_grant_id = grant_row.id
    where grant_row.user_id = 'a1000000-0000-4000-8000-000000000004'
      and grant_row.status = 'refunded'
      and ticket.status = 'refunded'
      and ticket.refunded_at is not null
  ),
  'Seat refund converges the grant and ticket to terminal state'
);
select ok(
  not exists (
    select 1 from public.watch_party_room_memberships membership
    where membership.party_id = 'CLOSEOUT-SEAT-ROOM'
      and membership.user_id = 'a1000000-0000-4000-8000-000000000004'
      and membership.membership_state in ('active','reconnecting')
  ),
  'canonical terminal Seat grant leaves no active historical room membership'
);
select ok(
  exists (
    select 1 from public.revenuecat_consumable_transaction_intents link
    where link.provider = 'revenuecat_app_store'
      and link.original_transaction_id = 'closeout-seat-original'
      and link.terminal
  ),
  'Seat refund makes the durable original-transaction binding terminal'
);

-- Unbound and duplicate deliveries remain durable fail-closed evidence.
select is(
  (public.process_revenuecat_app_store_event_atomic(
    'closeout-unbound-terminal', 'REFUND',
    'a1000000-0000-4000-8000-000000000005',
    'com.chillywood.seatpass.tier1', 'sandbox', now() - interval '4 minutes',
    null, 99, 'usd', repeat('e', 64), 'closeout-unbound-terminal-original', null
  ))->>'status',
  'ignored',
  'terminal delivery without an exact purchase intent is finalized ignored'
);
select is(
  (select metadata->>'final_reason' from public.provider_events
   where provider_event_id = 'closeout-unbound-terminal'),
  'terminal_dispatch_binding_missing',
  'unbound terminal delivery records a durable terminal watermark'
);
select is(
  (select count(*)::integer from public.revenuecat_unbound_terminal_authority
   where provider = 'revenuecat_app_store'
     and original_transaction_id = 'closeout-unbound-terminal-original'),
  1,
  'one exact unbound terminal tombstone is stored'
);
select is(
  (public.process_revenuecat_app_store_event_atomic(
    'closeout-after-unbound-terminal', 'INITIAL_PURCHASE',
    'a1000000-0000-4000-8000-000000000005',
    'com.chillywood.seatpass.tier1', 'sandbox', now() - interval '3 minutes',
    null, 99, 'usd', repeat('f', 64), 'closeout-unbound-terminal-original', null
  ))->>'reason',
  'provider_source_lock_unresolved',
  'later source-unresolved initial delivery cannot reopen a sticky unbound terminal transaction'
);
select ok(
  not exists (
    select 1 from public.access_grants
    where user_id = 'a1000000-0000-4000-8000-000000000005'
  )
  and not exists (
    select 1 from public.money_access_ledger_events
    where user_id = 'a1000000-0000-4000-8000-000000000005'
  ),
  'unbound terminal sequence creates no access or money projection'
);

select is(
  (public.process_revenuecat_app_store_event_atomic(
    'closeout-unbound-initial', 'INITIAL_PURCHASE',
    'a1000000-0000-4000-8000-000000000006',
    'com.chillywood.seatpass.tier1', 'sandbox', now() - interval '4 minutes',
    null, 99, 'usd', repeat('1', 64), 'closeout-unbound-initial-original', null
  ))->>'reason',
  'provider_source_lock_unresolved',
  'unbound initial delivery records the exact fail-closed source-lock failure'
);
select is(
  (select count(*)::integer from public.revenuecat_unbound_initial_authority
   where provider = 'revenuecat_app_store'
     and original_transaction_id = 'closeout-unbound-initial-original'),
  1,
  'one exact unbound initial reservation is stored'
);
select is(
  (public.process_revenuecat_app_store_event_atomic(
    'closeout-unbound-initial-retry', 'INITIAL_PURCHASE',
    'a1000000-0000-4000-8000-000000000006',
    'com.chillywood.seatpass.tier1', 'sandbox', now() - interval '3 minutes',
    null, 99, 'usd', repeat('2', 64), 'closeout-unbound-initial-original', null
  ))->>'reason',
  'provider_source_lock_unresolved',
  'a different source-unresolved event cannot later bind a previously unbound initial transaction'
);
select ok(
  coalesce((public.process_revenuecat_app_store_event_atomic(
    'closeout-unbound-terminal', 'REFUND',
    'a1000000-0000-4000-8000-000000000005',
    'com.chillywood.seatpass.tier1', 'sandbox', now() - interval '4 minutes',
    null, 99, 'usd', repeat('e', 64), 'closeout-unbound-terminal-original', null
  )->>'duplicateEvent')::boolean, false),
  'exact duplicate provider delivery is retry safe'
);
select throws_ok(
  $$select public.process_revenuecat_app_store_event_atomic(
    'closeout-unbound-terminal', 'REVOCATION',
    'a1000000-0000-4000-8000-000000000005',
    'com.chillywood.seatpass.tier1', 'sandbox', now(), null, 99, 'usd',
    repeat('e', 64), 'closeout-unbound-terminal-original', null
  )$$,
  'P0001', 'revenuecat_terminal_dispatch_event_identity_mismatch',
  'provider event ID cannot be rebound to another lifecycle event'
);

-- A recurring channel subscription outlives the one client session that
-- initiated it, but each renewal still requires complete current account
-- authority.  Session rotation with exact replacement receipts is valid;
-- adding any extant unaccepted session prevents a new provider period from
-- extending access and records an explicit reconciliation disposition.
insert into public.money_purchase_intents (
  id, user_id, product_id, product_key, product_type, provider, provider_product_id,
  source_type, source_id, creator_id, environment, status, amount_minor, currency,
  idempotency_key, expires_at, session_generation, metadata
)
select
  'a3000000-0000-4000-8000-000000000005',
  'a1000000-0000-4000-8000-000000000005', mapping.product_id,
  product.product_key, product.product_type, mapping.provider,
  mapping.provider_product_id, 'channel_subscription',
  'a8000000-0000-4000-8000-000000000001', fixture.creator_id,
  'sandbox', 'pending', mapping.reference_price_minor, mapping.reference_currency,
  'closeout-channel-renewal-intent', now() + interval '15 minutes',
  'b5000000-0000-4000-8000-000000000005',
  jsonb_build_object('sandbox_only', true, 'not_payable', true)
from public.monetization_product_store_mappings mapping
join public.monetization_products product on product.id = mapping.product_id
cross join pg_temp.creator_money_closeout_fixture fixture
where mapping.provider = 'revenuecat_app_store'
  and mapping.provider_product_id = 'com.chillywood.channel.subscription.slot1'
  and mapping.environment = 'sandbox';

create temporary table channel_subscription_rotation_results as
select public.process_revenuecat_app_store_event_atomic(
  'closeout-channel-initial', 'INITIAL_PURCHASE',
  'a1000000-0000-4000-8000-000000000005',
  'com.chillywood.channel.subscription.slot1', 'sandbox', now() - interval '10 minutes',
  now() + interval '30 days', 499, 'usd', repeat('3', 64),
  'closeout-channel-renewal-original', null
) as initial_result;
select ok(
  coalesce((select initial_result->>'status' = 'processed'
    from pg_temp.channel_subscription_rotation_results), false)
  and exists (
    select 1
    from public.creator_channel_subscriptions subscription
    join public.access_grants grant_row on grant_row.id = subscription.access_grant_id
    where subscription.subscriber_id = 'a1000000-0000-4000-8000-000000000005'
      and subscription.offer_id = 'a8000000-0000-4000-8000-000000000001'
      and subscription.status = 'active'
      and subscription.current_period_end > timezone('utc'::text, now()) + interval '29 days'
      and grant_row.status = 'sandbox_only'
  ),
  'channel subscription initial purchase binds the exact initiating session and finite grant chain'
);

select public.process_revenuecat_app_store_event_atomic(
  'closeout-channel-cancel-prepaid','CANCELLATION',
  'a1000000-0000-4000-8000-000000000005',
  'com.chillywood.channel.subscription.slot1','sandbox',now()-interval '7 minutes',
  now()+interval '30 days',null,null,repeat('6',64),
  'closeout-channel-renewal-original',null
);

update public.creator_channel_subscription_offers
set status='archived',price_cents=799
where id='a8000000-0000-4000-8000-000000000001';
insert into public.creator_channel_subscription_offers (
  id,creator_id,title,price_cents,currency,interval,status,
  provider,provider_product_id,metadata
)
select
  'a8000000-0000-4000-8000-000000000002',creator_id,
  'Replacement channel subscription',499,'usd','monthly','sandbox',
  'revenuecat','com.chillywood.channel.subscription.slot2',
  jsonb_build_object('synthetic_closeout_fixture',true)
from pg_temp.creator_money_closeout_fixture;
update public.wave1_creator_eligibility
set payout_eligible=false
where creator_user_id=(select creator_id from pg_temp.creator_money_closeout_fixture);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000005","session_id":"b5000000-0000-4000-8000-000000000005"}',
  true
);
select ok(
  coalesce((result->>'allowed')::boolean,false)
  and result->>'reason'='subscription_cancel_pending'
  and result->'offer'->>'id'='a8000000-0000-4000-8000-000000000001',
  'prepaid cancellation survives until expiry across App Store slot replacement, reprice, archive, and seller payout-readiness loss'
) from (
  select public.resolve_creator_channel_subscription_access(
    (select creator_id from pg_temp.creator_money_closeout_fixture)
  ) result
) historical_subscription;
reset role;
select set_config('request.jwt.claims','{}',true);
delete from public.creator_channel_subscription_offers
where id='a8000000-0000-4000-8000-000000000002';
update public.creator_channel_subscription_offers
set status='sandbox',price_cents=499
where id='a8000000-0000-4000-8000-000000000001';
update public.wave1_creator_eligibility
set payout_eligible=true
where creator_user_id=(select creator_id from pg_temp.creator_money_closeout_fixture);

delete from auth.sessions
where id = 'b5000000-0000-4000-8000-000000000005';
insert into auth.sessions (id, user_id) values (
  'c5000000-0000-4000-8000-000000000005',
  'a1000000-0000-4000-8000-000000000005'
);
insert into public.wave1_legal_acceptances (
  user_id, subject_hash, document_key, document_version, market,
  role_key, capability, session_generation, authority_source
)
select
  'a1000000-0000-4000-8000-000000000005',
  public.wave1_sha256('a1000000-0000-4000-8000-000000000005'),
  document.document_key, document.version, document.market,
  'member', document.capability, 'c5000000-0000-4000-8000-000000000005',
  'service_reconciliation'
from public.wave1_legal_document_versions document
where document.active and document.market = 'UNITED_STATES'
  and document.capability = 'account';

alter table pg_temp.channel_subscription_rotation_results
  add column renewal_result jsonb,
  add column rejected_renewal_result jsonb;
update pg_temp.channel_subscription_rotation_results
set renewal_result = public.process_revenuecat_app_store_event_atomic(
  'closeout-channel-renewal-current-account', 'RENEWAL',
  'a1000000-0000-4000-8000-000000000005',
  'com.chillywood.channel.subscription.slot1', 'sandbox', now() - interval '5 minutes',
  now() + interval '60 days', 499, 'usd', repeat('4', 64),
  'closeout-channel-renewal-original', null
);
select ok(
  coalesce((select renewal_result->>'status' = 'processed'
    from pg_temp.channel_subscription_rotation_results), false)
  and exists (
    select 1
    from public.creator_channel_subscriptions subscription
    join public.access_grants grant_row on grant_row.id = subscription.access_grant_id
    where subscription.subscriber_id = 'a1000000-0000-4000-8000-000000000005'
      and subscription.offer_id = 'a8000000-0000-4000-8000-000000000001'
      and subscription.status = 'active'
      and subscription.current_period_end > timezone('utc'::text, now()) + interval '59 days'
      and grant_row.expires_at = subscription.current_period_end
  ),
  'channel renewal succeeds after session rotation only when the replacement session has exact current account receipts'
);

insert into auth.sessions (id, user_id) values (
  'd5000000-0000-4000-8000-000000000005',
  'a1000000-0000-4000-8000-000000000005'
);
update pg_temp.channel_subscription_rotation_results
set rejected_renewal_result = public.process_revenuecat_app_store_event_atomic(
  'closeout-channel-renewal-unaccepted-session', 'RENEWAL',
  'a1000000-0000-4000-8000-000000000005',
  'com.chillywood.channel.subscription.slot1', 'sandbox', now(),
  now() + interval '90 days', 499, 'usd', repeat('5', 64),
  'closeout-channel-renewal-original', null
);
select ok(
  coalesce((select rejected_renewal_result->>'status' = 'ignored'
      and rejected_renewal_result->>'reason' = 'subscription_account_authority_not_current'
    from pg_temp.channel_subscription_rotation_results), false)
  and exists (
    select 1 from public.provider_events event
    where event.provider = 'revenuecat_app_store'
      and event.provider_event_id = 'closeout-channel-renewal-unaccepted-session'
      and event.status = 'ignored'
      and event.metadata->>'final_reason' = 'subscription_account_authority_not_current'
      and coalesce((event.metadata->>'provider_reconciliation_required')::boolean, false)
      and event.metadata->>'provider_reconciliation_disposition'
        = 'refund_or_authoritative_provider_reconciliation_required'
  )
  and not exists (
    select 1
    from public.money_access_ledger_events ledger
    join public.provider_events event on event.id = ledger.provider_event_id
    where event.provider_event_id = 'closeout-channel-renewal-unaccepted-session'
  )
  and not exists (
    select 1 from public.creator_channel_subscriptions subscription
    where subscription.subscriber_id = 'a1000000-0000-4000-8000-000000000005'
      and subscription.offer_id = 'a8000000-0000-4000-8000-000000000001'
      and subscription.current_period_end > timezone('utc'::text, now()) + interval '89 days'
  ),
  'an extant session missing account receipts blocks renewal extension and records provider reconciliation without access or value'
);

insert into public.money_purchase_intents (
  id, user_id, product_id, product_key, product_type, provider, provider_product_id,
  source_type, source_id, creator_id, environment, status, amount_minor, currency,
  idempotency_key, expires_at, session_generation, metadata
)
select
  'a3000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000008', mapping.product_id,
  product.product_key, product.product_type, mapping.provider,
  mapping.provider_product_id, 'watch_party_live',
  'a2000000-0000-4000-8000-000000000001', fixture.creator_id,
  'sandbox', 'pending', mapping.reference_price_minor, mapping.reference_currency,
  'closeout-restricted-seat-intent', now() + interval '15 minutes',
  (select session_generation::text
   from pg_temp.creator_money_closeout_buyer_sessions
   where user_id = 'a1000000-0000-4000-8000-000000000008'),
  jsonb_build_object('sandbox_only', true, 'not_payable', true)
from public.monetization_product_store_mappings mapping
join public.monetization_products product on product.id = mapping.product_id
cross join pg_temp.creator_money_closeout_fixture fixture
where mapping.provider = 'revenuecat_app_store'
  and mapping.provider_product_id = 'com.chillywood.seatpass.tier1'
  and mapping.environment = 'sandbox';

update auth.users
set banned_until = now() + interval '1 day'
where id = 'a1000000-0000-4000-8000-000000000008';
create temporary table restricted_creator_money_closeout_result as
select public.process_revenuecat_app_store_event_atomic(
  'closeout-restricted-seat-initial', 'INITIAL_PURCHASE',
  'a1000000-0000-4000-8000-000000000008',
  'com.chillywood.seatpass.tier1', 'sandbox', now(),
  null, 99, 'usd', repeat('6', 64),
  'closeout-restricted-seat-original', null
) as result;
select ok(
  coalesce((select result->>'status' = 'ignored'
    and result->>'reason' = 'buyer_account_restricted'
    from pg_temp.restricted_creator_money_closeout_result), false)
  and (select status = 'pending' from public.money_purchase_intents
       where id = 'a3000000-0000-4000-8000-000000000002')
  and not exists (
    select 1 from public.access_grants
    where metadata->>'purchase_intent_id' = 'a3000000-0000-4000-8000-000000000002'
  )
  and not exists (
    select 1 from public.money_access_ledger_events
    where metadata->>'purchase_intent_id' = 'a3000000-0000-4000-8000-000000000002'
  ),
  'restricted creator-money buyer cannot consume an intent or receive access/value'
);
update auth.users
set banned_until = null
where id = 'a1000000-0000-4000-8000-000000000008';

select ok(
  pg_get_functiondef('public.resolve_creator_content_access(text,uuid)'::regprocedure)
    ilike '%security definer%set search_path to ''''%'
  and pg_get_functiondef('public.resolve_video_playback_pre_paid_authority_closeout(uuid)'::regprocedure)
    ilike '%security definer%set search_path to ''''%'
  and not has_function_privilege('service_role', 'public.resolve_video_playback_pre_paid_authority_closeout(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.resolve_video_playback_pre_paid_authority_closeout(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.resolve_video_playback_pre_paid_authority_closeout(uuid)', 'EXECUTE')
  and pg_get_functiondef('public.is_current_platform_owner()'::regprocedure)
    ilike '%security definer%set search_path to ''''%has_platform_role%',
  'paid-video gates and immutable owner lookup retain empty SECURITY DEFINER search paths and no predecessor bypass'
);

select ok(
  (select policy.qual ilike '%creator_video_storage_object_access_allowed%'
   from pg_catalog.pg_policies policy
   where policy.schemaname = 'storage'
     and policy.tablename = 'objects'
     and policy.policyname = 'creator_videos_storage_select_visibility_access')
  and (select count(*) = 2
       from pg_catalog.pg_policies policy
       where policy.schemaname = 'storage'
         and policy.tablename = 'objects'
         and policy.policyname in (
           'creator_videos_storage_select_free_renditions',
           'creator_videos_storage_select_premium_renditions'
         )
         and policy.qual ilike '%creator_video_storage_rendition_access_allowed%')
  and pg_get_functiondef(
    'public.creator_video_storage_object_access_allowed(text,text)'::regprocedure
  ) ilike '%can_read_creator_video_row%'
  and pg_get_functiondef(
    'public.creator_video_storage_rendition_access_allowed(text,text,text)'::regprocedure
  ) ilike '%can_read_creator_video_row%monetization_has_active_premium%',
  'both storage paths require the paid-aware helper and Premium quality never substitutes for item authority'
);

insert into public.videos (
  id, owner_id, title, storage_provider, storage_bucket,
  storage_object_key, storage_path, visibility,
  moderation_status, scan_status, quarantined_at
)
select
  'a7000000-0000-4000-8000-000000000002', creator_id,
  'Closeout paid creator video', 'supabase', 'creator-videos',
  creator_id::text || '/a7000000-0000-4000-8000-000000000002/source.mp4',
  creator_id::text || '/a7000000-0000-4000-8000-000000000002/source.mp4',
  'public', 'clean', 'clean', null
from pg_temp.creator_money_closeout_fixture;

-- The canonical insert trigger always queues a new source for scanning. This
-- synthetic fixture projects the authoritative scanner completion explicitly;
-- no client/authenticated path can self-declare a clean scan.
update public.videos
set scan_status = 'clean',
    scan_provider = 'closeout_fixture_scanner',
    scan_result = 'clean',
    scanned_at = now(),
    scan_error = null,
    quarantined_at = null
where id = 'a7000000-0000-4000-8000-000000000002';

insert into public.creator_content_prices (
  id, creator_id, content_type, content_id, is_paid,
  price_cents, currency, status, provider,
  provider_product_id, provider_product_key, metadata
)
select
  'a9000000-0000-4000-8000-000000000001', fixture.creator_id,
  'creator_video', 'a7000000-0000-4000-8000-000000000002', true,
  mapping.reference_price_minor, mapping.reference_currency, 'sandbox',
  mapping.provider, mapping.provider_product_id, product.product_key,
  jsonb_build_object('sandbox_only', true, 'not_payable', true)
from public.monetization_product_store_mappings mapping
join public.monetization_products product on product.id = mapping.product_id
cross join pg_temp.creator_money_closeout_fixture fixture
where mapping.provider = 'revenuecat_app_store'
  and mapping.provider_product_id = 'com.chillywood.paidvideo.tier1'
  and mapping.environment = 'sandbox';

insert into public.content_access_grants (
  user_id, content_type, content_id, source, active
) values (
  'a1000000-0000-4000-8000-000000000002', 'creator_video',
  'a7000000-0000-4000-8000-000000000002', 'purchase', true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
select ok(
  playback.result->>'status' = 'not_allowed'
  and playback.result->'allowed_qualities' = '[]'::jsonb
  and not coalesce((playback.result->>'legacy_single_file_available')::boolean, false)
  and not coalesce((playback.result->>'legacy_playback_allowed')::boolean, false)
  and not public.can_read_creator_video_row(
    (select creator_id::text from pg_temp.creator_money_closeout_fixture),
    'public', 'clean', 'clean',
    (select storage_path from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    (select storage_object_key from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    (select playback_url from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    'a1000000-0000-4000-8000-000000000002'
  ),
  'unpaid paid-video row exposes neither playback sources nor video/storage RLS access'
)
from (
  select public.resolve_video_playback(
    'a7000000-0000-4000-8000-000000000002'
  ) as result
) playback;
select ok(
  not coalesce((result->>'allowed')::boolean, false)
  and result->>'reason' = 'purchase_required',
  'legacy content_access_grants alone cannot authorize paid-video playback'
)
from (
  select public.resolve_creator_content_access(
    'creator_video', 'a7000000-0000-4000-8000-000000000002'
  ) as result
) access_result;
select set_config('request.jwt.claims', '{}', true);

insert into public.money_purchase_intents (
  id, user_id, product_id, product_key, product_type, provider, provider_product_id,
  source_type, source_id, creator_id, environment, status, amount_minor, currency,
  idempotency_key, expires_at, session_generation, metadata
)
select
  'a3000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000007', mapping.product_id,
  product.product_key, product.product_type, mapping.provider,
  mapping.provider_product_id, 'paid_content',
  'a7000000-0000-4000-8000-000000000002', fixture.creator_id,
  'sandbox', 'pending', mapping.reference_price_minor, mapping.reference_currency,
  'closeout-rotated-session-video-intent', now() + interval '15 minutes',
  (select session_generation::text
   from pg_temp.creator_money_closeout_buyer_sessions
   where user_id = 'a1000000-0000-4000-8000-000000000007'),
  jsonb_build_object('sandbox_only', true, 'not_payable', true)
from public.monetization_product_store_mappings mapping
join public.monetization_products product on product.id = mapping.product_id
cross join pg_temp.creator_money_closeout_fixture fixture
where mapping.provider = 'revenuecat_app_store'
  and mapping.provider_product_id = 'com.chillywood.paidvideo.tier1'
  and mapping.environment = 'sandbox';

delete from auth.sessions
where id = (
  select session_generation
  from pg_temp.creator_money_closeout_buyer_sessions
  where user_id = 'a1000000-0000-4000-8000-000000000007'
);
insert into auth.sessions (id, user_id)
select rotated_generation, user_id
from pg_temp.creator_money_closeout_buyer_sessions
where user_id = 'a1000000-0000-4000-8000-000000000007';
insert into public.wave1_legal_acceptances (
  user_id, subject_hash, document_key, document_version, market,
  role_key, capability, session_generation, authority_source
)
select
  buyer.user_id, public.wave1_sha256(buyer.user_id::text),
  document.document_key, document.version, document.market,
  'member', document.capability, buyer.rotated_generation::text, 'service_reconciliation'
from pg_temp.creator_money_closeout_buyer_sessions buyer
cross join public.wave1_legal_document_versions document
where buyer.user_id = 'a1000000-0000-4000-8000-000000000007'
  and document.active and document.market = 'UNITED_STATES'
  and document.capability = 'account';

create temporary table rotated_session_creator_money_result as
select public.process_revenuecat_app_store_event_atomic(
  'closeout-rotated-session-video-initial', 'INITIAL_PURCHASE',
  'a1000000-0000-4000-8000-000000000007',
  'com.chillywood.paidvideo.tier1', 'sandbox', now(),
  null, 99, 'usd', repeat('7', 64),
  'closeout-rotated-session-video-original', null
) as result;
select ok(
  coalesce((select result->>'status' = 'ignored'
    and result->>'reason' = 'purchase_intent_session_authority_not_current'
    from pg_temp.rotated_session_creator_money_result), false)
  and (select status = 'pending'
       from public.money_purchase_intents
       where id = 'a3000000-0000-4000-8000-000000000004')
  and not exists (
    select 1 from public.access_grants
    where metadata->>'purchase_intent_id' = 'a3000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1 from public.money_access_ledger_events
    where metadata->>'purchase_intent_id' = 'a3000000-0000-4000-8000-000000000004'
  ),
  'rotating the buyer session cannot consume an intent bound to the invalidated session generation'
);

select throws_ok(
  $$select public.process_revenuecat_app_store_event_atomic(
    'closeout-malformed-creator-hash', 'INITIAL_PURCHASE',
    'a1000000-0000-4000-8000-000000000007',
    'com.chillywood.paidvideo.tier1', 'sandbox', now(),
    null, 99, 'usd', repeat('8', 63),
    'closeout-malformed-creator-hash-original', null
  )$$,
  'P0001', 'revenuecat_payload_hash_invalid',
  'creator-money provider evidence rejects a malformed raw payload hash'
);

insert into public.money_purchase_intents (
  id, user_id, product_id, product_key, product_type, provider, provider_product_id,
  source_type, source_id, creator_id, environment, status, amount_minor, currency,
  idempotency_key, expires_at, session_generation, metadata
)
select
  'a3000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000002', mapping.product_id,
  product.product_key, product.product_type, mapping.provider,
  mapping.provider_product_id, 'paid_content',
  'a7000000-0000-4000-8000-000000000002', fixture.creator_id,
  'sandbox', 'pending', mapping.reference_price_minor, mapping.reference_currency,
  'closeout-paid-video-intent', now() + interval '15 minutes',
  (select session_generation::text
   from pg_temp.creator_money_closeout_buyer_sessions
   where user_id = 'a1000000-0000-4000-8000-000000000002'),
  jsonb_build_object('sandbox_only', true, 'not_payable', true)
from public.monetization_product_store_mappings mapping
join public.monetization_products product on product.id = mapping.product_id
cross join pg_temp.creator_money_closeout_fixture fixture
where mapping.provider = 'revenuecat_app_store'
  and mapping.provider_product_id = 'com.chillywood.paidvideo.tier1'
  and mapping.environment = 'sandbox';

select ok(
  safe.result ?& array[
    'id','userId','productId','productKey','productType','provider','providerProductId',
    'sourceType','sourceId','creatorId','platformId','environment','status','amountMinor',
    'currency','expiresAt','consumedAt','revokedAt','createdAt'
  ]
  and not (safe.result ? 'metadata')
  and not (safe.result ? 'sessionGeneration')
  and safe.result->>'id' = 'a3000000-0000-4000-8000-000000000003'
  and safe.result->>'providerProductId' = 'com.chillywood.paidvideo.tier1',
  'safe purchase-intent response exposes the exact charge identity without session or internal metadata'
)
from (
  select public.money_purchase_intent_safe_row(intent) as result
  from public.money_purchase_intents intent
  where intent.id = 'a3000000-0000-4000-8000-000000000003'
) safe;

select public.process_revenuecat_app_store_event_atomic(
  'closeout-paid-video-initial', 'INITIAL_PURCHASE',
  'a1000000-0000-4000-8000-000000000002',
  'com.chillywood.paidvideo.tier1', 'sandbox', now(),
  null, 99, 'usd', repeat('4', 64),
  'closeout-paid-video-original', null
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
select ok(
  coalesce((result->>'allowed')::boolean, false)
  and result->>'reason' = 'sandbox_grant',
  'exact provider event, consumed intent, nonterminal original and grant authorize paid video'
)
from (
  select public.resolve_creator_content_access(
    'creator_video', 'a7000000-0000-4000-8000-000000000002'
  ) as result
) access_result;

reset role;
select set_config('request.jwt.claims', '{}', true);
update public.monetization_product_store_mappings
set status='retired'
where id=(
  select provider_event.metadata->>'store_mapping_id'
  from public.provider_events provider_event
  where provider_event.provider_event_id='closeout-paid-video-initial'
)::uuid;
update public.monetization_products
set status='retired'
where id=(
  select intent.product_id from public.money_purchase_intents intent
  where intent.id='a3000000-0000-4000-8000-000000000003'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
select ok(
  coalesce((result->>'allowed')::boolean,false)
  and result->>'reason'='sandbox_grant',
  'retiring the current product and App Store mapping cannot revoke or duplicate-charge an exact completed Paid Video purchase'
) from (
  select public.resolve_creator_content_access(
    'creator_video','a7000000-0000-4000-8000-000000000002'
  ) result
) retired_catalog;
reset role;
select set_config('request.jwt.claims','{}',true);
update public.monetization_products
set status='sandbox'
where id=(
  select intent.product_id from public.money_purchase_intents intent
  where intent.id='a3000000-0000-4000-8000-000000000003'
);
update public.monetization_product_store_mappings
set status='sandbox'
where id=(
  select provider_event.metadata->>'store_mapping_id'
  from public.provider_events provider_event
  where provider_event.provider_event_id='closeout-paid-video-initial'
)::uuid;

reset role;
select set_config('request.jwt.claims', '{}', true);
update public.money_purchase_intents
set amount_minor=amount_minor+1
where id='a3000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
select ok(
  not coalesce((result->>'allowed')::boolean,false)
  and result->>'reason'='purchase_required',
  'wrong-price consumed intent cannot retain paid-video playback authority'
)
from (
  select public.resolve_creator_content_access(
    'creator_video','a7000000-0000-4000-8000-000000000002'
  ) result
) corrupt_price;
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.money_purchase_intents
set amount_minor=amount_minor-1
where id='a3000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
select ok(
  playback.result->>'status' = 'ok'
  and coalesce((playback.result->>'legacy_single_file_available')::boolean, false)
  and coalesce((playback.result->>'legacy_playback_allowed')::boolean, false)
  and public.can_read_creator_video_row(
    (select creator_id::text from pg_temp.creator_money_closeout_fixture),
    'public', 'clean', 'clean',
    (select storage_path from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    (select storage_object_key from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    (select playback_url from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    'a1000000-0000-4000-8000-000000000002'
  ),
  'exact paid-video grant unlocks the mature resolver and matching video/storage RLS path'
)
from (
  select public.resolve_video_playback(
    'a7000000-0000-4000-8000-000000000002'
  ) as result
) playback;

reset role;
select set_config('request.jwt.claims', '{}', true);
insert into public.channel_audience_blocks (
  channel_user_id, blocked_user_id, blocked_by_user_id, reason
)
select
  creator_id::text,
  'a1000000-0000-4000-8000-000000000002',
  creator_id::text,
  'closeout paid-video viewer block'
from pg_temp.creator_money_closeout_fixture;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
select ok(
  playback.result->>'status' = 'not_allowed'
  and playback.result->'allowed_qualities' = '[]'::jsonb
  and not coalesce((playback.result->>'legacy_single_file_available')::boolean, false)
  and not coalesce((playback.result->>'legacy_playback_allowed')::boolean, false)
  and not public.can_read_creator_video_row(
    (select creator_id::text from pg_temp.creator_money_closeout_fixture),
    'public', 'clean', 'clean',
    (select storage_path from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    (select storage_object_key from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    (select playback_url from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    'a1000000-0000-4000-8000-000000000002'
  ),
  'an exact active paid-video grant exposes no source after the creator blocks that viewer'
)
from (
  select public.resolve_video_playback(
    'a7000000-0000-4000-8000-000000000002'
  ) as result
) playback;
reset role;
select set_config('request.jwt.claims', '{}', true);
delete from public.channel_audience_blocks
where channel_user_id = (select creator_id::text from pg_temp.creator_money_closeout_fixture)
  and blocked_user_id = 'a1000000-0000-4000-8000-000000000002';

update public.wave1_creator_eligibility
set payout_eligible = false
where creator_user_id = (select creator_id from pg_temp.creator_money_closeout_fixture);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
select is(
  public.resolve_creator_content_access(
    'creator_video', 'a7000000-0000-4000-8000-000000000002'
  )->>'reason',
  'sandbox_grant',
  'seller payout-readiness loss cannot erase an exact completed paid-video purchase'
);
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.wave1_creator_eligibility
set payout_eligible = true
where creator_user_id = (select creator_id from pg_temp.creator_money_closeout_fixture);

create temporary table unsafe_creator_content_results (reason text not null);
grant select, insert on pg_temp.unsafe_creator_content_results to authenticated;
update public.videos
set moderation_status = 'hidden'
where id = 'a7000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
insert into pg_temp.unsafe_creator_content_results
select public.resolve_creator_content_access(
  'creator_video', 'a7000000-0000-4000-8000-000000000002'
)->>'reason';
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.videos
set moderation_status = 'clean', quarantined_at = now()
where id = 'a7000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
insert into pg_temp.unsafe_creator_content_results
select public.resolve_creator_content_access(
  'creator_video', 'a7000000-0000-4000-8000-000000000002'
)->>'reason';
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.videos
set quarantined_at = null, scan_status = 'malware_detected'
where id = 'a7000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
insert into pg_temp.unsafe_creator_content_results
select public.resolve_creator_content_access(
  'creator_video', 'a7000000-0000-4000-8000-000000000002'
)->>'reason';
select ok(
  count(*) = 3 and bool_and(reason = 'content_unavailable'),
  'moderation, quarantine and unsafe scan each close paid-video playback'
)
from pg_temp.unsafe_creator_content_results;
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.videos
set scan_status = 'clean'
where id = 'a7000000-0000-4000-8000-000000000002';

update public.wave1_creator_eligibility
set age_18_plus = false
where creator_user_id = (select creator_id from pg_temp.creator_money_closeout_fixture);
update public.creator_content_prices
set is_paid = false, price_cents = 0, status = 'draft'
where id = 'a9000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000006","session_id":"b6000000-0000-4000-8000-000000000006"}',
  true
);
select ok(
  coalesce((result->>'allowed')::boolean, false)
  and result->>'reason' = 'free_content',
  'explicit free video remains free without creator-money eligibility'
)
from (
  select public.resolve_creator_content_access(
    'creator_video', 'a7000000-0000-4000-8000-000000000002'
  ) as result
) access_result;
reset role;
select set_config('request.jwt.claims', '{}', true);

update public.videos
set quarantined_at = now()
where id = 'a7000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
select ok(
  public.resolve_creator_content_access(
    'creator_video', 'a7000000-0000-4000-8000-000000000002'
  )->>'reason' = 'content_unavailable'
  and not public.can_read_creator_video_row(
    (select creator_id::text from pg_temp.creator_money_closeout_fixture),
    'public', 'clean', 'clean',
    (select storage_path from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    (select storage_object_key from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    (select playback_url from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    'a1000000-0000-4000-8000-000000000002'
  ),
  'quarantine closes free-video resolver and storage authority'
);
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.videos
set quarantined_at = null
where id = 'a7000000-0000-4000-8000-000000000002';

update auth.users
set banned_until = now() + interval '1 day'
where id = (select creator_id from pg_temp.creator_money_closeout_fixture);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
select ok(
  public.resolve_creator_content_access(
    'creator_video', 'a7000000-0000-4000-8000-000000000002'
  )->>'reason' = 'content_unavailable'
  and not public.can_read_creator_video_row(
    (select creator_id::text from pg_temp.creator_money_closeout_fixture),
    'public', 'clean', 'clean',
    (select storage_path from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    (select storage_object_key from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    (select playback_url from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    'a1000000-0000-4000-8000-000000000002'
  ),
  'restricted creator closes free-video resolver and storage authority'
);
reset role;
select set_config('request.jwt.claims', '{}', true);
update auth.users
set banned_until = null
where id = (select creator_id from pg_temp.creator_money_closeout_fixture);

update auth.users
set banned_until = now() + interval '1 day'
where id = 'a1000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
select ok(
  public.resolve_creator_content_access(
    'creator_video', 'a7000000-0000-4000-8000-000000000002'
  )->>'reason' = 'content_unavailable'
  and not public.can_read_creator_video_row(
    (select creator_id::text from pg_temp.creator_money_closeout_fixture),
    'public', 'clean', 'clean',
    (select storage_path from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    (select storage_object_key from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    (select playback_url from public.videos
     where id = 'a7000000-0000-4000-8000-000000000002'),
    'a1000000-0000-4000-8000-000000000002'
  ),
  'restricted viewer closes free-video resolver and storage authority'
);
reset role;
select set_config('request.jwt.claims', '{}', true);
update auth.users
set banned_until = null
where id = 'a1000000-0000-4000-8000-000000000002';

update public.wave1_creator_eligibility
set age_18_plus = true
where creator_user_id = (select creator_id from pg_temp.creator_money_closeout_fixture);
update public.creator_content_prices
set is_paid = true, price_cents = 99, status = 'sandbox'
where id = 'a9000000-0000-4000-8000-000000000001';

create temporary table inactive_paid_content_results (status text not null, reason text not null);
grant select, insert on pg_temp.inactive_paid_content_results to authenticated;
update public.creator_content_prices set status = 'draft',price_cents=499
where id = 'a9000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
insert into pg_temp.inactive_paid_content_results
select 'draft', public.resolve_creator_content_access(
  'creator_video', 'a7000000-0000-4000-8000-000000000002'
)->>'reason';
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.creator_content_prices set status = 'paused'
where id = 'a9000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
insert into pg_temp.inactive_paid_content_results
select 'paused', public.resolve_creator_content_access(
  'creator_video', 'a7000000-0000-4000-8000-000000000002'
)->>'reason';
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.creator_content_prices set status = 'archived'
where id = 'a9000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
insert into pg_temp.inactive_paid_content_results
select 'archived', public.resolve_creator_content_access(
  'creator_video', 'a7000000-0000-4000-8000-000000000002'
)->>'reason';
select ok(
  count(*) = 3 and bool_and(reason = 'sandbox_grant'),
  'a repriced exact purchase survives draft, paused, and archived future-sale state without becoming free authority'
)
from pg_temp.inactive_paid_content_results;
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.creator_content_prices set status = 'sandbox',price_cents=99
where id = 'a9000000-0000-4000-8000-000000000001';

-- Payout and earnings are immutable, serialized, exact-currency projections.
insert into public.creator_earnings_ledger (
  id, creator_id, source_type, source_id, gross_amount_cents,
  platform_fee_cents, provider_fee_cents, tax_cents,
  net_creator_amount_cents, currency, ledger_status, metadata
)
select
  'a4000000-0000-4000-8000-000000000001', creator_id, 'tip',
  'a5000000-0000-4000-8000-000000000001', 1000, 0, 0, 0,
  1000, 'usd', 'held', jsonb_build_object('synthetic_closeout_fixture', true)
from pg_temp.creator_money_closeout_fixture;

select is(
  public.record_creator_earnings_lifecycle_internal(
    'a4000000-0000-4000-8000-000000000001', 'available',
    'settlement_released', 'closeout-earning-available', null, null,
    jsonb_build_object('source', 'pgtap')
  ),
  'available',
  'settled earnings append one available lifecycle event'
);
select ok(
  public.record_creator_earnings_lifecycle_internal(
    'a4000000-0000-4000-8000-000000000001', 'available',
    'settlement_released', 'closeout-earning-available', null, null,
    jsonb_build_object('source', 'retry')
  ) = 'available'
  and (select count(*) from public.creator_earnings_lifecycle_events
       where operation_key = 'closeout-earning-available') = 1,
  'exact earnings lifecycle retry is idempotent'
);
select throws_ok(
  $$select public.record_creator_earnings_lifecycle_internal(
    'a4000000-0000-4000-8000-000000000001', 'reversed',
    'provider_terminal_reversal', 'closeout-earning-available', null, null, '{}'::jsonb
  )$$,
  'P0001', 'creator_earnings_lifecycle_replay_mismatch',
  'earnings operation key cannot be rebound to a conflicting state'
);
select is(
  public.record_creator_earnings_lifecycle_internal(
    'a4000000-0000-4000-8000-000000000001', 'reversed',
    'provider_terminal_reversal', 'closeout-earning-reversed', null, null, '{}'::jsonb
  ),
  'reversed',
  'provider terminal reversal appends a reversed earnings state'
);
select throws_ok(
  $$select public.record_creator_earnings_lifecycle_internal(
    'a4000000-0000-4000-8000-000000000001', 'available',
    'settlement_released', 'closeout-earning-reopen', null, null, '{}'::jsonb
  )$$,
  'P0001', 'creator_earnings_lifecycle_transition_invalid:reversed:available',
  'reversed earnings cannot be reopened'
);
select throws_ok(
  $$update public.creator_earnings_lifecycle_events
    set metadata = metadata || jsonb_build_object('mutated', true)
    where operation_key = 'closeout-earning-reversed'$$,
  'P0001', 'creator_earnings_lifecycle_events_are_append_only',
  'historical earnings lifecycle evidence cannot be updated'
);
select is(
  public.creator_earnings_current_state_internal('a4000000-0000-4000-8000-000000000001'),
  'reversed',
  'current earnings state resolves from the append-only projection'
);

insert into public.creator_payout_requests (
  id, creator_id, amount_cents, currency, payout_type,
  instant_fee_cents, status, provider_payout_id
)
select
  'a6000000-0000-4000-8000-000000000001', creator_id,
  100, 'usd', 'scheduled', 0, 'paid', 'po_closeout_unique'
from pg_temp.creator_money_closeout_fixture;

select throws_ok(
  $$insert into public.creator_payout_requests (
      id, creator_id, amount_cents, currency, payout_type,
      instant_fee_cents, status, provider_payout_id
    )
    select
      'a6000000-0000-4000-8000-000000000002', creator_id,
      100, 'usd', 'scheduled', 0, 'processing', 'po_closeout_unique'
    from pg_temp.creator_money_closeout_fixture$$,
  '23505',
  'duplicate key value violates unique constraint "creator_payout_requests_provider_payout_id_unique"',
  'one provider payout identity cannot authorize two payout requests'
);
select throws_ok(
  $$select public.mark_creator_payout_provider_result(
    'a6000000-0000-4000-8000-000000000001', 'po_closeout_unique', 'failed'
  )$$,
  'P0001', 'verified_provider_payout_receipt_required',
  'payout state cannot move without an immutable verified provider receipt'
);
select ok(
  has_function_privilege('service_role', 'public.mark_creator_payout_provider_result(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mark_creator_payout_provider_result(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.mark_creator_payout_provider_result(uuid,text,text)', 'EXECUTE'),
  'payout provider result projector is service-only'
);
select ok(
  pg_get_functiondef('public.create_creator_payout_request_safe(integer,text)'::regprocedure)
    ilike '%state%in (%reserved%,%processing%,%paid%)%'
  and pg_get_functiondef('public.create_creator_payout_request_safe(integer,text)'::regprocedure)
    ilike '%last_provider_sync_at%interval ''15 minutes''%'
  and pg_get_functiondef('public.create_creator_payout_request_safe(integer,text)'::regprocedure)
    ilike '%earnings.%currency%=%usd%'
  and pg_get_functiondef('public.create_creator_payout_request_safe(integer,text)'::regprocedure)
    ilike '%pg_advisory_xact_lock%creator-payout:%',
  'payout reservation counts in-flight allocations and requires fresh USD provider proof under creator lock'
);
select ok(
  pg_get_functiondef('public.mark_creator_payout_provider_result(uuid,text,text)'::regprocedure)
    ilike '%verified_provider_payout_receipt_required%'
  and pg_get_functiondef('public.mark_creator_payout_provider_result(uuid,text,text)'::regprocedure)
    ilike '%provider_payout_receipt_binding_mismatch%'
  and pg_get_functiondef('public.mark_creator_payout_provider_result(uuid,text,text)'::regprocedure)
    ilike '%provider_payout_destination_mismatch%'
  and pg_get_functiondef('public.mark_creator_payout_provider_result_pre_verified_receipt(uuid,text,text)'::regprocedure)
    ilike '%creator-payout-result:%',
  'payout result projector requires verified exact receipt binding before the serialized lifecycle projector'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role','authenticated',
    'sub',(select creator_id::text from pg_temp.creator_money_closeout_fixture),
    'session_id',(select session_one::text from pg_temp.creator_money_closeout_fixture)
  )::text,
  true
);
select ok(
  (public.calculate_creator_payout_balances()->>'creatorId')::uuid =
    (select creator_id from pg_temp.creator_money_closeout_fixture),
  'current exact creator session may read its payout balance projection'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

delete from auth.sessions
where id = (select session_two from pg_temp.creator_money_closeout_fixture);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role','authenticated',
    'sub',(select creator_id::text from pg_temp.creator_money_closeout_fixture),
    'session_id',(select session_two::text from pg_temp.creator_money_closeout_fixture)
  )::text,
  true
);
select throws_ok(
  $$select public.calculate_creator_payout_balances()$$,
  'P0001', 'monetization_session_authority_required',
  'deleted creator session cannot read a payout balance projection'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

update auth.users
set banned_until = now() + interval '1 day'
where id = (select creator_id from pg_temp.creator_money_closeout_fixture);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role','authenticated',
    'sub',(select creator_id::text from pg_temp.creator_money_closeout_fixture),
    'session_id',(select session_one::text from pg_temp.creator_money_closeout_fixture)
  )::text,
  true
);
select throws_ok(
  $$select public.calculate_creator_payout_balances()$$,
  'P0001', 'monetization_session_authority_required',
  'restricted creator cannot read a payout balance projection'
);
reset role;
select set_config('request.jwt.claims', '{}', true);
update auth.users
set banned_until = null
where id = (select creator_id from pg_temp.creator_money_closeout_fixture);

update auth.users
set email = 'sandbox-subject@closeout.example'
where id = 'a1000000-0000-4000-8000-000000000003';
select throws_ok(
  $$insert into public.sandbox_monetization_testers (
      email,status,note,created_by
    ) values (
      'sandbox-subject@closeout.example','active',
      'synthetic closeout fixture','a1000000-0000-4000-8000-000000000001'
    )$$,
  'P0001', 'sandbox_tester_exact_confirmed_subject_required',
  'an email-only tester row is rejected before it can grant sandbox monetization authority'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000003","session_id":"b3000000-0000-4000-8000-000000000003","email":"sandbox-subject@closeout.example"}',
  true
);
select is(
  public.resolve_sandbox_monetization_tester(
    'a1000000-0000-4000-8000-000000000003',
    'sandbox-subject@closeout.example'
  ),
  false,
  'email-only tester row cannot grant sandbox monetization authority'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

insert into public.sandbox_monetization_testers (
  user_id,email,status,note,created_by
) values (
  'a1000000-0000-4000-8000-000000000003',
  'sandbox-subject@closeout.example','active',
  'synthetic exact-subject closeout fixture',
  'a1000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000003","session_id":"b3000000-0000-4000-8000-000000000003","email":"sandbox-subject@closeout.example"}',
  true
);
select is(
  public.resolve_sandbox_monetization_tester(
    'a1000000-0000-4000-8000-000000000003',
    'sandbox-subject@closeout.example'
  ),
  true,
  'exact active tester subject with a current session receives sandbox-only authority'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

delete from auth.sessions
where id = 'b3000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000003","session_id":"b3000000-0000-4000-8000-000000000003","email":"sandbox-subject@closeout.example"}',
  true
);
select throws_ok(
  $$select public.list_my_paid_video_offers()$$,
  'P0001', 'monetization_session_authority_required',
  'deleted sandbox tester session cannot use a private creator-money readback'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

select * from finish();
rollback;
