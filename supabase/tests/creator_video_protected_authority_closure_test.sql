begin;

create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(36);

select ok(
  pg_get_functiondef('public.resolve_creator_content_access(text,uuid)'::regprocedure)
    ilike '%security definer%set search_path to ''''%'
  and not has_function_privilege('service_role','public.resolve_creator_content_access(text,uuid)','EXECUTE')
  and has_function_privilege('anon','public.resolve_creator_content_access(text,uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.resolve_creator_content_access(text,uuid)','EXECUTE'),
  '1. the unified source resolver has a fixed path and only public caller roles may invoke it'
);

select ok(
  pg_get_functiondef('public.resolve_creator_content_access_pre_subscription_doctrine(text,uuid)'::regprocedure)
    ilike '%resolve_creator_vip_pass_access"(v_owner_id%'
  and pg_get_functiondef('public.resolve_creator_content_access_pre_subscription_doctrine(text,uuid)'::regprocedure)
    ilike '%v_vip->>''reason''=''vip_active''%'
  and pg_get_functiondef('public.resolve_creator_content_access(text,uuid)'::regprocedure)
    ilike '%creator_video_subscription_access_internal%'
  and pg_get_functiondef('public.creator_video_subscription_access_internal(uuid)'::regprocedure)
    ilike '%not coalesce(video."vip_access_required",false)%',
  '2. VIP remains exact-creator authority while only ordinary Paid Video delegates to exact subscription authority'
);

select ok(
  (select policy.qual ilike '%creator_video_commerce_access_allowed%'
   from pg_policies policy
   where policy.schemaname='public'
     and policy.tablename='media_renditions'
     and policy.policyname='media_renditions_select_public_safe_metadata'),
  '3. source-bearing public rendition metadata is gated by unified creator-video commerce authority'
);

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000','f1000000-0000-4000-8000-000000000001','authenticated','authenticated','protected-owner-a@example.test','',now(),'{}','{}',now(),now(),false,false),
  ('00000000-0000-0000-0000-000000000000','f1000000-0000-4000-8000-000000000002','authenticated','authenticated','protected-viewer@example.test','',now(),'{}','{}',now(),now(),false,false),
  ('00000000-0000-0000-0000-000000000000','f1000000-0000-4000-8000-000000000003','authenticated','authenticated','protected-owner-b@example.test','',now(),'{}','{}',now(),now(),false,false);
insert into auth.sessions(id,user_id,not_after) values
  ('f1100000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',now()+interval '1 day'),
  ('f1100000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002',now()+interval '1 day'),
  ('f1100000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000003',now()+interval '1 day');
insert into public.wave1_legal_acceptances (
  user_id,subject_hash,document_key,document_version,market,
  role_key,capability,session_generation,authority_source
)
select
  authority.user_id,
  public.wave1_sha256(authority.user_id::text),
  document.document_key,
  document.version,
  document.market,
  'member',
  document.capability,
  authority.session_generation,
  'service_reconciliation'
from (
  values
    ('f1000000-0000-4000-8000-000000000001'::uuid,'f1100000-0000-4000-8000-000000000001'::text),
    ('f1000000-0000-4000-8000-000000000002'::uuid,'f1100000-0000-4000-8000-000000000002'::text),
    ('f1000000-0000-4000-8000-000000000003'::uuid,'f1100000-0000-4000-8000-000000000003'::text)
) authority(user_id,session_generation)
cross join public.wave1_legal_document_versions document
where document.active
  and document.market='UNITED_STATES'
  and document.capability='account';

insert into public.videos (
  id,owner_id,title,visibility,moderation_status,
  storage_provider,storage_bucket,storage_object_key,storage_path,
  mime_type,file_size_bytes,vip_access_required
) values
  ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','VIP A','public','clean','cloudflare_r2','chillywood-media-origin','f1000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000001/source.mp4','f1000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000001/source.mp4','video/mp4',1024,true),
  ('f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001','Paused paid','public','clean','cloudflare_r2','chillywood-media-origin','f1000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000002/source.mp4','f1000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000002/source.mp4','video/mp4',1024,false),
  ('f2000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','Free','public','clean','cloudflare_r2','chillywood-media-origin','f1000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000003/source.mp4','f1000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000003/source.mp4','video/mp4',1024,false),
  ('f2000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000001','Hidden','draft','clean','cloudflare_r2','chillywood-media-origin','f1000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000004/source.mp4','f1000000-0000-4000-8000-000000000001/f2000000-0000-4000-8000-000000000004/source.mp4','video/mp4',1024,false),
  ('f2000000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000003','VIP B','public','clean','cloudflare_r2','chillywood-media-origin','f1000000-0000-4000-8000-000000000003/f2000000-0000-4000-8000-000000000005/source.mp4','f1000000-0000-4000-8000-000000000003/f2000000-0000-4000-8000-000000000005/source.mp4','video/mp4',1024,true);

-- The trusted scanner, not a client, supplies clean source authority.
update public.videos
set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now()
where id in (
  'f2000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000002',
  'f2000000-0000-4000-8000-000000000003',
  'f2000000-0000-4000-8000-000000000004',
  'f2000000-0000-4000-8000-000000000005'
);

insert into public.wave1_creator_eligibility (
  creator_user_id,state,account_status,age_18_plus,legal_accepted,
  creator_role,moderation_state,market,rollout_eligible,platform_capability,
  provider_eligible,kyc_complete,tax_complete,sanctions_clear,payout_eligible,
  authority_source,last_operation_key
) values
  ('f1000000-0000-4000-8000-000000000001','VERIFIED','ACTIVE',true,true,true,'CLEAR','UNITED_STATES',true,true,true,true,true,true,true,'protected-authority-test','protected-creator-a'),
  ('f1000000-0000-4000-8000-000000000003','VERIFIED','ACTIVE',true,true,true,'CLEAR','UNITED_STATES',true,true,true,true,true,true,true,'protected-authority-test','protected-creator-b');
insert into public.wave1_legal_acceptances (
  user_id,subject_hash,document_key,document_version,market,
  role_key,capability,session_generation,authority_source
)
select
  authority.user_id,
  public.wave1_sha256(authority.user_id::text),
  document.document_key,
  document.version,
  document.market,
  'member',
  document.capability,
  authority.session_generation,
  'service_reconciliation'
from (
  values
    ('f1000000-0000-4000-8000-000000000001'::uuid,'f1100000-0000-4000-8000-000000000001'::text),
    ('f1000000-0000-4000-8000-000000000003'::uuid,'f1100000-0000-4000-8000-000000000003'::text)
) authority(user_id,session_generation)
cross join public.wave1_legal_document_versions document
where document.active
  and document.market='UNITED_STATES'
  and document.capability in ('creator','creator_money');

-- Simulate a pre-closure paused paid row without letting setup triggers turn it
-- into authority. The test exercises the final resolver and RLS definitions.
set local session_replication_role=replica;
insert into public.creator_content_prices (
  creator_id,content_type,content_id,is_paid,price_cents,currency,status,
  provider,provider_product_id,provider_product_key
) values (
  'f1000000-0000-4000-8000-000000000001','creator_video',
  'f2000000-0000-4000-8000-000000000002',true,499,'usd','paused',
  'revenuecat_google_play','paused-video-product','paused-video-product'
);
set local session_replication_role=origin;

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"f1000000-0000-4000-8000-000000000001","session_id":"f1100000-0000-4000-8000-000000000001"}',true);
select throws_ok(
  $$update public.videos set vip_access_required=false where id='f2000000-0000-4000-8000-000000000001'$$,
  '42501','creator_video_vip_authority_server_owned',
  '4. a current owner cannot toggle VIP classification by direct table update'
);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"f1000000-0000-4000-8000-000000000001","session_id":"f1100000-0000-4000-8000-000000000099"}',true);
select throws_ok(
  $$select public.set_creator_video_vip_access('f2000000-0000-4000-8000-000000000001',false)$$,
  '42501','creator_video_current_session_required',
  '5. a revoked or unknown session cannot mutate VIP classification through the setter'
);
reset role;
select set_config('request.jwt.claims','{}',true);

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select ok(
  not coalesce((result->>'allowed')::boolean,false)
  and coalesce((result->>'vipRequired')::boolean,false),
  '6. an anonymous caller cannot resolve VIP video access'
) from (select public.resolve_creator_vip_video_access('f2000000-0000-4000-8000-000000000001') result) resolved;
select ok(
  not coalesce((result->>'allowed')::boolean,false),
  '7. the unified source resolver denies an anonymous VIP caller'
) from (select public.resolve_creator_content_access('creator_video','f2000000-0000-4000-8000-000000000001') result) resolved;
select is(
  (select count(*)::integer from public.videos where id='f2000000-0000-4000-8000-000000000001'),0,
  '8. VIP denial occurs before the protected videos row can be selected'
);
select ok(
  result->>'status'='not_allowed'
  and result->'allowed_qualities'='[]'::jsonb
  and not coalesce((result->>'legacy_single_file_available')::boolean,false)
  and not coalesce((result->>'legacy_playback_allowed')::boolean,false),
  '9. VIP denial returns no playback source or legacy path'
) from (select public.resolve_video_playback('f2000000-0000-4000-8000-000000000001') result) playback;
select is(
  public.resolve_creator_content_access('creator_video','f2000000-0000-4000-8000-000000000002')->>'reason',
  'content_unavailable',
  '10. a paused paid offer remains protected rather than becoming free'
);
select is(
  (select count(*)::integer from public.videos where id='f2000000-0000-4000-8000-000000000002'),0,
  '11. a paused paid video row is not disclosed'
);
select is(
  public.resolve_creator_content_access('creator_video','f2000000-0000-4000-8000-000000000003')->>'reason',
  'free_content',
  '12. a public clean explicitly free video remains free'
);
select is(
  (select count(*)::integer from public.videos where id='f2000000-0000-4000-8000-000000000003'),1,
  '13. the protected-source closure does not regress a valid free public row'
);
select ok(
  not coalesce((result->>'allowed')::boolean,false)
  and result->>'creatorId' is null,
  '14. the VIP resolver does not disclose the owner of a hidden non-VIP row'
) from (select public.resolve_creator_vip_video_access('f2000000-0000-4000-8000-000000000004') result) hidden;
reset role;
select set_config('request.jwt.claims','{}',true);

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"f1000000-0000-4000-8000-000000000002","session_id":"f1100000-0000-4000-8000-000000000002"}',true);
select ok(
  not coalesce((result->>'allowed')::boolean,false)
  and result->>'reason'='vip_not_available',
  '15. a current authenticated caller receives no VIP authority when provider-bound VIP state is unresolved'
) from (select public.resolve_creator_vip_video_access('f2000000-0000-4000-8000-000000000005') result) unresolved;
reset role;
select set_config('request.jwt.claims','{}',true);

update public.platform_money_kill_switches
set state='sandbox_only'
where key='revenuecat_app_store_enabled';
insert into public.creator_vip_pass_offers (
  id,creator_id,title,price_cents,currency,pass_type,status,
  provider,provider_product_key,provider_product_id
) values
  ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','Creator A VIP',99,'usd','one_time','sandbox','revenuecat','vip_pass_store_catalog','com.chillywood.vip.tier1'),
  ('f3000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','Creator B VIP',99,'usd','one_time','sandbox','revenuecat','vip_pass_store_catalog','com.chillywood.vip.tier1');
insert into public.money_purchase_intents (
  id,user_id,product_id,product_key,product_type,provider,provider_product_id,
  source_type,source_id,creator_id,environment,status,amount_minor,currency,
  idempotency_key,expires_at,session_generation,metadata
)
select
  'f4000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000002',mapping.product_id,
  product.product_key,product.product_type,mapping.provider,mapping.provider_product_id,
  'vip_pass','f3000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001','sandbox','pending',
  mapping.reference_price_minor,mapping.reference_currency,
  'protected-video-vip-a-intent',now()+interval '15 minutes',
  'f1100000-0000-4000-8000-000000000002',
  jsonb_build_object('sandbox_only',true,'not_payable',true)
from public.monetization_product_store_mappings mapping
join public.monetization_products product on product.id=mapping.product_id
where mapping.provider='revenuecat_app_store'
  and mapping.provider_product_id='com.chillywood.vip.tier1'
  and mapping.environment='sandbox';
select public.process_revenuecat_app_store_event_atomic(
  'protected-video-vip-a-initial','INITIAL_PURCHASE',
  'f1000000-0000-4000-8000-000000000002',
  'com.chillywood.vip.tier1','sandbox',now(),
  null,99,'usd',repeat('d',64),'protected-video-vip-a-original',null
);

select ok(
  grant_row.expires_at=grant_row.starts_at+interval '30 days'
  and pass_row.activated_at=grant_row.starts_at
  and pass_row.expires_at=grant_row.expires_at,
  '32. verified VIP activation creates one canonical finite 30-day grant and pass period'
) from public.access_grants grant_row
join public.creator_vip_passes pass_row
  on pass_row.access_grant_id=grant_row.id
where grant_row.grant_type='vip_pass'
  and grant_row.source_id='f3000000-0000-4000-8000-000000000001';

update public.access_grants
set expires_at=now()+interval '100 days'
where grant_type='vip_pass'
  and source_id='f3000000-0000-4000-8000-000000000001';
select ok(
  grant_row.expires_at=grant_row.starts_at+interval '30 days'
  and pass_row.expires_at=pass_row.activated_at+interval '30 days',
  '33. caller-supplied VIP extension is canonicalized and cannot extend authority'
) from public.access_grants grant_row
join public.creator_vip_passes pass_row
  on pass_row.access_grant_id=grant_row.id
where grant_row.grant_type='vip_pass'
  and grant_row.source_id='f3000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"f1000000-0000-4000-8000-000000000002","session_id":"f1100000-0000-4000-8000-000000000002"}',true);
select ok(
  coalesce((result->>'allowed')::boolean,false)
  and result->>'reason'='vip_active',
  '22. an exact provider-bound Creator A VIP pass authorizes Creator A protected video'
) from (select public.resolve_creator_content_access('creator_video','f2000000-0000-4000-8000-000000000001') result) exact_vip;
select ok(
  coalesce((result->>'allowed')::boolean,false)
  and result->>'reason'='vip_active'
  and result->>'creatorId'='f1000000-0000-4000-8000-000000000001',
  '23. VIP playback authority remains cross-bound to the exact creator returned by the provider resolver'
) from (select public.resolve_creator_vip_video_access('f2000000-0000-4000-8000-000000000001') result) exact_vip;
reset role;
select set_config('request.jwt.claims','{}',true);
update public.creator_vip_pass_offers
set status='archived',price_cents=499
where id='f3000000-0000-4000-8000-000000000001';
update public.wave1_creator_eligibility
set payout_eligible=false
where creator_user_id='f1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"f1000000-0000-4000-8000-000000000002","session_id":"f1100000-0000-4000-8000-000000000002"}',true);
select ok(
  coalesce((result->>'allowed')::boolean,false)
  and result->>'reason'='vip_active',
  '31. exact creator VIP survives future-sale archive, reprice, and seller payout-readiness loss'
) from (
  select public.resolve_creator_content_access(
    'creator_video','f2000000-0000-4000-8000-000000000001'
  ) result
) historical_vip;
reset role;
select set_config('request.jwt.claims','{}',true);
update public.creator_vip_pass_offers
set status='sandbox',price_cents=99
where id='f3000000-0000-4000-8000-000000000001';
update public.wave1_creator_eligibility
set payout_eligible=true
where creator_user_id='f1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"f1000000-0000-4000-8000-000000000002","session_id":"f1100000-0000-4000-8000-000000000002"}',true);
select ok(
  not coalesce((result->>'allowed')::boolean,false)
  and result->>'reason'<>'vip_active',
  '24. Creator A VIP cannot authorize Creator B protected video'
) from (select public.resolve_creator_content_access('creator_video','f2000000-0000-4000-8000-000000000005') result) cross_creator;
select is(
  (select count(*)::integer from public.videos where id='f2000000-0000-4000-8000-000000000005'),0,
  '25. cross-creator VIP denial occurs before Creator B protected row is disclosed'
);
select ok(
  not coalesce((public.resolve_creator_content_access(
    'creator_video','f2000000-0000-4000-8000-000000000002'
  )->>'allowed')::boolean,false),
  '26. a VIP pass cannot become Paid Video authority'
);
select ok(
  not public.monetization_has_active_premium('f1000000-0000-4000-8000-000000000002'),
  '27. a VIP pass cannot become Premium authority'
);
reset role;
select set_config('request.jwt.claims','{}',true);

create temporary table creator_vip_lifecycle_snapshot as
select
  grant_row.id grant_id, grant_row.status grant_status,
  grant_row.starts_at grant_starts_at, grant_row.expires_at grant_expires_at,
  grant_row.refunded_at grant_refunded_at, grant_row.revoked_at grant_revoked_at,
  pass_row.id pass_id, pass_row.status pass_status,
  pass_row.activated_at pass_activated_at, pass_row.expires_at pass_expires_at,
  pass_row.refunded_at pass_refunded_at, pass_row.revoked_at pass_revoked_at
from public.access_grants grant_row
join public.creator_vip_passes pass_row on pass_row.access_grant_id=grant_row.id
where grant_row.grant_type='vip_pass'
  and grant_row.source_id='f3000000-0000-4000-8000-000000000001';

set local session_replication_role=replica;
update public.access_grants grant_row
set status='sandbox_only',starts_at=now()-interval '30 days',expires_at=now(),
    refunded_at=null,revoked_at=null
from pg_temp.creator_vip_lifecycle_snapshot snapshot
where grant_row.id=snapshot.grant_id;
update public.creator_vip_passes pass_row
set status='active',activated_at=now()-interval '30 days',expires_at=now(),
    refunded_at=null,revoked_at=null
from pg_temp.creator_vip_lifecycle_snapshot snapshot
where pass_row.id=snapshot.pass_id;
set local session_replication_role=origin;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"f1000000-0000-4000-8000-000000000002","session_id":"f1100000-0000-4000-8000-000000000002"}',true);
select ok(
  not coalesce((public.resolve_creator_vip_pass_access(
    'f1000000-0000-4000-8000-000000000001'
  )->>'allowed')::boolean,false),
  '34. VIP denies at or after the canonical 30-day expiry boundary'
);
reset role;
select set_config('request.jwt.claims','{}',true);

set local session_replication_role=replica;
update public.access_grants grant_row
set status='refunded',starts_at=snapshot.grant_starts_at,
    expires_at=snapshot.grant_expires_at,refunded_at=now(),revoked_at=null
from pg_temp.creator_vip_lifecycle_snapshot snapshot
where grant_row.id=snapshot.grant_id;
update public.creator_vip_passes pass_row
set status='refunded',activated_at=snapshot.pass_activated_at,
    expires_at=snapshot.pass_expires_at,refunded_at=now(),revoked_at=null
from pg_temp.creator_vip_lifecycle_snapshot snapshot
where pass_row.id=snapshot.pass_id;
set local session_replication_role=origin;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"f1000000-0000-4000-8000-000000000002","session_id":"f1100000-0000-4000-8000-000000000002"}',true);
select ok(
  not coalesce((public.resolve_creator_vip_pass_access(
    'f1000000-0000-4000-8000-000000000001'
  )->>'allowed')::boolean,false),
  '35. verified VIP refund removes exact-creator access'
);
reset role;
select set_config('request.jwt.claims','{}',true);

set local session_replication_role=replica;
update public.access_grants grant_row
set status='revoked',starts_at=snapshot.grant_starts_at,
    expires_at=snapshot.grant_expires_at,refunded_at=null,revoked_at=now()
from pg_temp.creator_vip_lifecycle_snapshot snapshot
where grant_row.id=snapshot.grant_id;
update public.creator_vip_passes pass_row
set status='revoked',activated_at=snapshot.pass_activated_at,
    expires_at=snapshot.pass_expires_at,refunded_at=null,revoked_at=now()
from pg_temp.creator_vip_lifecycle_snapshot snapshot
where pass_row.id=snapshot.pass_id;
set local session_replication_role=origin;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"f1000000-0000-4000-8000-000000000002","session_id":"f1100000-0000-4000-8000-000000000002"}',true);
select ok(
  not coalesce((public.resolve_creator_vip_pass_access(
    'f1000000-0000-4000-8000-000000000001'
  )->>'allowed')::boolean,false),
  '36. verified VIP revocation removes exact-creator access'
);
reset role;
select set_config('request.jwt.claims','{}',true);

set local session_replication_role=replica;
update public.access_grants grant_row
set status=snapshot.grant_status,starts_at=snapshot.grant_starts_at,
    expires_at=snapshot.grant_expires_at,refunded_at=snapshot.grant_refunded_at,
    revoked_at=snapshot.grant_revoked_at
from pg_temp.creator_vip_lifecycle_snapshot snapshot
where grant_row.id=snapshot.grant_id;
update public.creator_vip_passes pass_row
set status=snapshot.pass_status,activated_at=snapshot.pass_activated_at,
    expires_at=snapshot.pass_expires_at,refunded_at=snapshot.pass_refunded_at,
    revoked_at=snapshot.pass_revoked_at
from pg_temp.creator_vip_lifecycle_snapshot snapshot
where pass_row.id=snapshot.pass_id;
set local session_replication_role=origin;

select throws_ok(
  $$update public.videos set vip_access_required=true where id='f2000000-0000-4000-8000-000000000002'$$,
  'P0001','vip_video_cannot_be_paid_per_video',
  '16. the video-side invariant rejects Paid Video and VIP overlap'
);
select throws_ok(
  $$insert into public.creator_content_prices (creator_id,content_type,content_id,is_paid,price_cents,currency,status,provider,provider_product_id,provider_product_key)
    values ('f1000000-0000-4000-8000-000000000001','creator_video','f2000000-0000-4000-8000-000000000005',true,499,'usd','paused','revenuecat_google_play','vip-overlap','vip-overlap')$$,
  'P0001','vip_video_cannot_be_paid_per_video',
  '17. the price-side invariant rejects Paid Video and VIP overlap'
);
select throws_ok(
  $$insert into public.media_renditions (
      media_id,video_id,source_type,source_id,creator_id,rendition_label,
      delivery_format,delivery_provider,storage_provider,bucket_role,storage_bucket,
      public_playback_path,manifest_path,variant_playlist_path,width,height,duration_ms,
      codec,bitrate,file_size_bytes,cache_policy,visibility,scan_status,moderation_status,
      is_public_playback_safe,is_original,is_ready,worker_version,source_hash
    ) values (
      'vip-public-rendition','f2000000-0000-4000-8000-000000000005','creator_video',
      'f2000000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000001','480p',
      'hls','cloudflare_r2_custom_domain','cloudflare_r2','public_playback','chillywood-public',
      'playback/public/vip-b/480p/master.m3u8','playback/public/vip-b/480p/master.m3u8','playback/public/vip-b/480p/index.m3u8',
      854,480,1000,'h264',1000000,1024,'public, max-age=300','public','clean','clean',
      true,false,true,'pgtap-worker',repeat('a',64)
    )$$,
  'P0001','protected_video_cannot_have_unsigned_public_rendition',
  '18. a transcoder cannot create an unsigned public rendition after VIP classification'
);

-- Simulate one historical bad row to test RLS independently of the new write
-- trigger. Even a known source UUID cannot reveal its path columns.
set local session_replication_role=replica;
insert into public.media_renditions (
  media_id,video_id,source_type,source_id,creator_id,rendition_label,
  delivery_format,delivery_provider,storage_provider,bucket_role,storage_bucket,
  public_playback_path,manifest_path,variant_playlist_path,width,height,duration_ms,
  codec,bitrate,file_size_bytes,cache_policy,visibility,scan_status,moderation_status,
  is_public_playback_safe,is_original,is_ready,worker_version,source_hash
) values (
  'vip-historical-rendition','f2000000-0000-4000-8000-000000000001','creator_video',
  'f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','480p',
  'hls','cloudflare_r2_custom_domain','cloudflare_r2','public_playback','chillywood-public',
  'playback/public/vip-a/480p/master.m3u8','playback/public/vip-a/480p/master.m3u8','playback/public/vip-a/480p/index.m3u8',
  854,480,1000,'h264',1000000,1024,'public, max-age=300','public','clean','clean',
  true,false,true,'pgtap-worker',repeat('b',64)
);
set local session_replication_role=origin;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is(
  (select count(*)::integer from public.media_renditions where source_id='f2000000-0000-4000-8000-000000000001'),0,
  '19. direct Data API access cannot reveal a historical VIP rendition path'
);
reset role;
select set_config('request.jwt.claims','{}',true);

insert into public.media_renditions (
  media_id,video_id,source_type,source_id,creator_id,rendition_label,
  delivery_format,delivery_provider,storage_provider,bucket_role,storage_bucket,
  public_playback_path,manifest_path,variant_playlist_path,width,height,duration_ms,
  codec,bitrate,file_size_bytes,cache_policy,visibility,scan_status,moderation_status,
  is_public_playback_safe,is_original,is_ready,worker_version,source_hash
) values (
  'free-public-rendition','f2000000-0000-4000-8000-000000000003','creator_video',
  'f2000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','480p',
  'hls','cloudflare_r2_custom_domain','cloudflare_r2','public_playback','chillywood-public',
  'playback/public/free/480p/master.m3u8','playback/public/free/480p/master.m3u8','playback/public/free/480p/index.m3u8',
  854,480,1000,'h264',1000000,1024,'public, max-age=300','public','clean','clean',
  true,false,true,'pgtap-worker',repeat('c',64)
);
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is(
  (select count(*)::integer from public.media_renditions where source_id='f2000000-0000-4000-8000-000000000003'),1,
  '20. a public unsigned rendition remains available for explicitly free content'
);
reset role;
select set_config('request.jwt.claims','{}',true);

update public.videos
set visibility='draft'
where id='f2000000-0000-4000-8000-000000000003';
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is(
  (select count(*)::integer from public.media_renditions where source_id='f2000000-0000-4000-8000-000000000003'),0,
  '28. a formerly-free rendition is hidden immediately when its parent becomes non-public'
);
reset role;
select set_config('request.jwt.claims','{}',true);

update public.videos
set visibility='public',quarantined_at=now()
where id='f2000000-0000-4000-8000-000000000003';
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is(
  (select count(*)::integer from public.media_renditions where source_id='f2000000-0000-4000-8000-000000000003'),0,
  '29. a free rendition is hidden when its exact parent is quarantined'
);
reset role;
select set_config('request.jwt.claims','{}',true);

update public.videos
set quarantined_at=null,scan_status='malware_detected'
where id='f2000000-0000-4000-8000-000000000003';
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is(
  (select count(*)::integer from public.media_renditions where source_id='f2000000-0000-4000-8000-000000000003'),0,
  '30. a free rendition is hidden when its exact parent scan becomes unsafe'
);
reset role;
select set_config('request.jwt.claims','{}',true);
update public.videos
set scan_status='clean'
where id='f2000000-0000-4000-8000-000000000003';
select throws_ok(
  $$update public.videos set vip_access_required=true where id='f2000000-0000-4000-8000-000000000003'$$,
  'P0001','protected_video_public_rendition_must_be_revoked',
  '21. classification cannot become protected while a reusable public URL exists'
);

select * from finish();
rollback;
