begin;
select no_plan();

create function pg_temp.rolling_user(n integer) returns uuid language sql immutable as $$
  select ('ac190000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.rolling_session(n integer) returns uuid language sql immutable as $$
  select ('ac190001-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.rolling_login(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.role',case when n is null then 'anon' else 'authenticated' end,true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'role',case when n is null then 'anon' else 'authenticated' end,
    'sub',pg_temp.rolling_user(n),'session_id',pg_temp.rolling_session(n))::text,true);
end;
$$;
create function pg_temp.rolling_payload(patch jsonb default '{}'::jsonb)
returns jsonb language sql immutable as $$
  select '{"hero_image_asset_id":null,"hero_video_asset_id":null,"hero_poster_asset_id":null,"background_image_asset_id":null,"avatar_asset_id":null,"logo_asset_id":null,"watermark_asset_id":null,"spotlight_video_id":null,"theme_preset":"city_night","accent_color":"#112233","hero_fit_mode":"fill","hero_focal_x":0.5,"hero_focal_y":0.5,"hero_crop_scale":1,"background_fit_mode":"fill","background_focal_x":0.5,"background_focal_y":0.5,"overlay_strength":0.7,"blur_strength":0}'::jsonb
    || jsonb_build_object('owner_user_id',pg_temp.rolling_user(1)::text) || patch;
$$;

insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at)
  select pg_temp.rolling_user(n),false,false,now() from generate_series(1,6) n;
insert into auth.sessions(id,user_id,not_after)
  select pg_temp.rolling_session(n),pg_temp.rolling_user(n),now()+interval '1 day' from generate_series(1,6) n;
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
  select pg_temp.rolling_user(n),public.wave1_sha256(pg_temp.rolling_user(n)::text),d.document_key,d.version,d.market,
    'member',d.capability,pg_temp.rolling_session(n)::text,'service_reconciliation'
  from generate_series(1,6) n cross join public.wave1_legal_document_versions d
  where d.active and d.market='UNITED_STATES' and d.capability='account';
insert into public.user_profiles(user_id,username,display_name,profile_access_visibility,platform_access_visibility,follower_surface_enabled)
  select pg_temp.rolling_user(n)::text,'studiorolling' || n,'Rolling fixture','private','public',true
  from generate_series(1,6) n where true
  on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name,
    profile_access_visibility=excluded.profile_access_visibility,platform_access_visibility=excluded.platform_access_visibility,
    follower_surface_enabled=excluded.follower_surface_enabled;
update public.platform_money_kill_switches set state='sandbox_only'
  where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled');
select is((select public.process_revenuecat_premium_event_atomic(
  'revenuecat_google_play','studio-rolling-premium-1','INITIAL_PURCHASE',pg_temp.rolling_user(1),
  p.provider_product_id,p.provider_base_plan_id,'sandbox','active',now()-interval '1 minute',now()+interval '1 day',
  now(),999,'usd',repeat('1',64),'NORMAL','google_play','android',null,p.id,'studio-rolling-original-1')->>'status'
  from public.monetization_products p where p.provider='revenuecat_google_play' and p.environment='sandbox'
    and p.product_type='premium_subscription' and p.status='sandbox' order by p.created_at,p.id limit 1),
  'processed','rolling fixture uses canonical finite Premium projection');

select ok(not has_table_privilege('authenticated','public.channel_audience_requests','UPDATE')
  and has_column_privilege('authenticated','public.channel_audience_requests','status','UPDATE')
  and has_column_privilege('authenticated','public.channel_audience_requests','reviewed_at','UPDATE')
  and has_column_privilege('authenticated','public.channel_audience_requests','reviewed_by','UPDATE')
  and has_column_privilege('authenticated','public.channel_audience_requests','updated_at','UPDATE'),
  'legacy exact-id review grants only its four historical fields');
select ok(not has_table_privilege('anon','public.channel_audience_requests','UPDATE'),
  'anonymous review transport remains unavailable');
select ok((select relrowsecurity from pg_class where oid='public.channel_audience_requests'::regclass),
  'request RLS remains enabled');
select ok(not has_function_privilege('anon','public.review_channel_audience_request(bigint,text)','EXECUTE'),
  'new review RPC remains unavailable to anonymous callers');

insert into public.channel_audience_requests(id,channel_user_id,requester_user_id,request_kind)
  values(91901,pg_temp.rolling_user(1)::text,pg_temp.rolling_user(2)::text,'follow'),
    (91902,pg_temp.rolling_user(1)::text,pg_temp.rolling_user(3)::text,'follow'),
    (91903,pg_temp.rolling_user(1)::text,pg_temp.rolling_user(4)::text,'subscriber_access'),
    (91904,pg_temp.rolling_user(1)::text,pg_temp.rolling_user(5)::text,'follow');
select pg_temp.rolling_login(1);
set local role authenticated;
select lives_ok($$insert into public.channel_followers(channel_user_id,follower_user_id,updated_at)
  values(pg_temp.rolling_user(1)::text,pg_temp.rolling_user(2)::text,clock_timestamp())$$,
  'actual legacy first request is a successful preflight');
select is((select count(*)::integer from public.channel_followers where channel_user_id=pg_temp.rolling_user(1)::text
  and follower_user_id=pg_temp.rolling_user(2)::text),0,'preflight does not create a follower');
select is((select status from public.channel_audience_requests where id=91901),'pending',
  'an interrupted legacy flow leaves review pending');
reset role;
select is((select count(*)::integer from public.notification_activity_events
  where event_kind='social_follow' and actor_user_id=pg_temp.rolling_user(2)
    and recipient_user_id=pg_temp.rolling_user(1)),0,'legacy preflight emits no follower notification activity');
set local role authenticated;
with reviewed as (update public.channel_audience_requests set status='approved',reviewed_at='2001-01-01',
  reviewed_by=pg_temp.rolling_user(1)::text,updated_at='2001-01-01' where id=91901 returning id,status)
select is((select id::text || ':' || status from reviewed),'91901:approved','legacy final update returns the exact reviewed row');
select is((select count(*)::integer from public.channel_followers where channel_user_id=pg_temp.rolling_user(1)::text
  and follower_user_id=pg_temp.rolling_user(2)::text),1,'legacy final update atomically creates one follower');
select ok((select reviewed_at>'2001-01-01' and updated_at>'2001-01-01'
  and reviewed_by=pg_temp.rolling_user(1)::text from public.channel_audience_requests where id=91901),
  'review timestamps and reviewer are canonical server values');
select is(public.review_channel_audience_request(91901,'approved')->>'status','approved',
  'new RPC retry after lost legacy response returns the committed approval');
with reviewed as (update public.channel_audience_requests set status='approved',reviewed_at='2002-01-01',
  reviewed_by=pg_temp.rolling_user(1)::text,updated_at='2002-01-01' where id=91901 returning id,status)
select is((select id::text || ':' || status from reviewed),'91901:approved','legacy retry after lost response returns the same terminal row');
select is((select count(*)::integer from public.channel_followers where channel_user_id=pg_temp.rolling_user(1)::text
  and follower_user_id=pg_temp.rolling_user(2)::text),1,'mixed-version retries do not duplicate followers');
reset role;
delete from public.channel_followers where channel_user_id=pg_temp.rolling_user(1)::text
  and follower_user_id=pg_temp.rolling_user(2)::text;
set local role authenticated;
select lives_ok($$update public.channel_audience_requests set status='approved',
  reviewed_by=pg_temp.rolling_user(1)::text where id=91901$$,'legacy terminal retry remains accepted after a later unfollow');
select is(public.review_channel_audience_request(91901,'approved')->>'status','approved',
  'RPC terminal retry remains accepted after a later unfollow');
select is((select count(*)::integer from public.channel_followers where channel_user_id=pg_temp.rolling_user(1)::text
  and follower_user_id=pg_temp.rolling_user(2)::text),0,'same-approved retries never resurrect a removed follower');
select throws_ok($$update public.channel_audience_requests set status='declined',
  reviewed_by=pg_temp.rolling_user(1)::text where id=91901$$,'audience_request_not_pending',
  'legacy conflicting terminal retry cannot rewrite approval');
with reviewed as (update public.channel_audience_requests set status='declined',reviewed_at=clock_timestamp(),
  reviewed_by=pg_temp.rolling_user(6)::text,updated_at=clock_timestamp() where id=91902 returning id,status)
select is((select id::text || ':' || status from reviewed),'91902:declined','legacy decline returns a reviewed row');
select is((select reviewed_by from public.channel_audience_requests where id=91902),pg_temp.rolling_user(1)::text,
  'caller-supplied reviewer cannot impersonate another account');
select is((select count(*)::integer from public.channel_followers where channel_user_id=pg_temp.rolling_user(1)::text
  and follower_user_id=pg_temp.rolling_user(3)::text),0,'decline never creates a follower');
select throws_ok($$update public.channel_audience_requests set status='approved',
  reviewed_by=pg_temp.rolling_user(1)::text where id=91903$$,'subscriber_mutation_unsupported',
  'legacy transport cannot approve subscriber access');
select throws_ok($$update public.channel_audience_requests set requester_user_id=pg_temp.rolling_user(6)::text
  where id=91904$$,'42501',null,'legacy transport cannot replace requester identity');
select throws_ok($$update public.channel_audience_requests set channel_user_id=pg_temp.rolling_user(2)::text
  where id=91904$$,'42501',null,'legacy transport cannot retarget a request');
select throws_ok($$update public.channel_audience_requests set request_kind='subscriber_access'
  where id=91904$$,'42501',null,'legacy transport cannot change request kind');
select throws_ok($$update public.channel_audience_requests set status='canceled'
  where id=91904$$,'audience_review_status_invalid','review transport cannot invent additional transitions');
reset role;

-- Requester self-follow remains a normal INSERT, not an owner preflight.
select pg_temp.rolling_login(6);
set local role authenticated;
select lives_ok($$insert into public.channel_followers(channel_user_id,follower_user_id)
  values(pg_temp.rolling_user(1)::text,pg_temp.rolling_user(6)::text)$$,'requester self-follow remains available');
select is((select count(*)::integer from public.channel_followers where channel_user_id=pg_temp.rolling_user(1)::text
  and follower_user_id=pg_temp.rolling_user(6)::text),1,'self-follow still creates its own relationship');
with reviewed as (update public.channel_audience_requests set status='approved' where id=91904 returning id)
select is((select count(*)::integer from reviewed),0,'unrelated caller cannot reach another request through UPDATE RLS');
reset role;

-- A fault after the compatibility trigger must roll back its follower INSERT.
create function pg_temp.rolling_review_fault() returns trigger language plpgsql as $$
begin
  if new.id=91904 then raise exception 'rolling_review_injected_fault'; end if;
  return new;
end;
$$;
create trigger zz_rolling_review_fault after update on public.channel_audience_requests
  for each row execute function pg_temp.rolling_review_fault();
select pg_temp.rolling_login(1);
set local role authenticated;
select throws_ok($$update public.channel_audience_requests set status='approved',
  reviewed_by=pg_temp.rolling_user(1)::text where id=91904$$,'rolling_review_injected_fault',
  'legacy final update faults after its atomic follower work');
reset role;
select is((select status from public.channel_audience_requests where id=91904),'pending','failed legacy final review rolls back request status');
select is((select count(*)::integer from public.channel_followers where channel_user_id=pg_temp.rolling_user(1)::text
  and follower_user_id=pg_temp.rolling_user(5)::text),0,'failed legacy final review rolls back follower');
drop trigger zz_rolling_review_fault on public.channel_audience_requests;

-- Preserve exact request identity across interruption, cancellation and recreation.
select pg_temp.rolling_login(1);
set local role authenticated;
insert into public.channel_followers(channel_user_id,follower_user_id,updated_at)
  values(pg_temp.rolling_user(1)::text,pg_temp.rolling_user(5)::text,clock_timestamp());
reset role;
select pg_temp.rolling_login(5);
set local role authenticated;
delete from public.channel_audience_requests where id=91904;
insert into public.channel_audience_requests(id,channel_user_id,requester_user_id,request_kind)
  values(91905,pg_temp.rolling_user(1)::text,pg_temp.rolling_user(5)::text,'follow');
reset role;
select pg_temp.rolling_login(1);
set local role authenticated;
with reviewed as (update public.channel_audience_requests set status='approved',
  reviewed_by=pg_temp.rolling_user(1)::text where id=91904 returning id)
select is((select count(*)::integer from reviewed),0,'canceled exact-id update does not retarget replacement request');
select is((select status from public.channel_audience_requests where id=91905),'pending','replacement remains pending after stale final request');
select is((select count(*)::integer from public.channel_followers where channel_user_id=pg_temp.rolling_user(1)::text
  and follower_user_id=pg_temp.rolling_user(5)::text),0,'stale exact-id review grants no follower');
select throws_ok($$select public.review_channel_audience_request(91904,'approved')$$,
  'audience_request_not_found','new RPC also rejects the canceled exact id');
reset role;
update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=pg_temp.rolling_session(1);
select pg_temp.rolling_login(1);
set local role authenticated;
select throws_ok($$update public.channel_audience_requests set status='approved',
  reviewed_by=pg_temp.rolling_user(1)::text where id=91905$$,'audience_review_current_session_required',
  'expired session cannot use the legacy final request');
select throws_ok($$insert into public.channel_followers(channel_user_id,follower_user_id,updated_at)
  values(pg_temp.rolling_user(1)::text,pg_temp.rolling_user(5)::text,clock_timestamp())$$,
  'audience_review_current_session_required','expired session cannot use the legacy first request');
reset role;
select is((select status from public.channel_audience_requests where id=91905),'pending','expired attempts leave request pending');
select is((select count(*)::integer from public.channel_followers where channel_user_id=pg_temp.rolling_user(1)::text
  and follower_user_id=pg_temp.rolling_user(5)::text),0,'expired attempts create no follower');

update auth.sessions set not_after=clock_timestamp()+interval '1 day' where id=pg_temp.rolling_session(1);
select pg_temp.rolling_login(1);
set local role authenticated;
select lives_ok($$select public.publish_platform_brand_profile(pg_temp.rolling_payload())$$,
  'current Brand RPC publishes through the compatibility asset wrapper');
reset role;
-- Represent an earlier committed snapshot using trusted fixture authority.
-- The real metadata trigger, not a direct history INSERT, records its time.
update public.platform_brand_profiles set published_at='2000-01-01'
  where owner_user_id=pg_temp.rolling_user(1)::text;
update public.platform_brand_publications set published_at='2000-01-01'
  where owner_user_id=pg_temp.rolling_user(1)::text;
select pg_temp.rolling_login(1);
set local role authenticated;
select lives_ok($$select public.publish_platform_brand_profile(pg_temp.rolling_payload('{"accent_color":"#223344"}'))$$,
  'a new complete publication replaces the earlier snapshot');
select lives_ok($$insert into public.platform_brand_profiles(owner_user_id,accent_color,published_at)
  values(pg_temp.rolling_user(1)::text,'#445566','2000-01-01') on conflict(owner_user_id)
  do update set accent_color=excluded.accent_color,published_at=excluded.published_at$$,
  'older cached committed publication timestamp is accepted as draft metadata');
select is((select accent_color from public.platform_brand_profiles where owner_user_id=pg_temp.rolling_user(1)::text),
  '#445566','legacy cached draft changes the editable draft');
select is((select accent_color from public.read_public_platform_brand_profile(pg_temp.rolling_user(1)::text)),
  '#223344','legacy cached draft never publishes its changes');
select ok((select published_at>'2000-01-01' from public.platform_brand_profiles where owner_user_id=pg_temp.rolling_user(1)::text),
  'legacy cached metadata cannot roll back the current publication time');
select lives_ok($$insert into public.platform_brand_profiles(owner_user_id,accent_color,published_at)
  values(pg_temp.rolling_user(1)::text,'#556677',null) on conflict(owner_user_id)
  do update set accent_color=excluded.accent_color,published_at=excluded.published_at$$,
  'cached null metadata also saves only a draft after new Publish');
select ok((select published_at>'2000-01-01' from public.platform_brand_profiles where owner_user_id=pg_temp.rolling_user(1)::text),
  'cached null cannot clear canonical publication metadata');
select is((select accent_color from public.read_public_platform_brand_profile(pg_temp.rolling_user(1)::text)),
  '#223344','cached null draft leaves the public snapshot unchanged');
select throws_ok($$insert into public.platform_brand_profiles(owner_user_id,accent_color,published_at)
  values(pg_temp.rolling_user(1)::text,'#000000','2050-01-01') on conflict(owner_user_id)
  do update set accent_color=excluded.accent_color,published_at=excluded.published_at$$,
  '42501','brand_publish_rpc_required','ambiguous legacy Publish requires an app update');
select is((select accent_color from public.platform_brand_profiles where owner_user_id=pg_temp.rolling_user(1)::text),
  '#556677','rejected unknown timestamp rolls back the complete draft write');
select ok((select count(*)>=2 from public.platform_brand_publication_metadata where owner_user_id=pg_temp.rolling_user(1)::text),
  'actual snapshot trigger retains known publication metadata');
select is(public.platform_brand_publication_metadata_read_allowed(null),false,
  'metadata boolean gate rejects a null owner');
select ok(not has_function_privilege('authenticated','public.whole_app_exact_current_session_authority_internal()','EXECUTE'),
  'metadata compatibility does not expose the private session authority helper');
select throws_ok($$insert into public.platform_brand_publication_metadata(owner_user_id,published_at)
  values(pg_temp.rolling_user(1)::text,'2050-01-01')$$,'42501',null,
  'client cannot manufacture known publication metadata');
reset role;
select pg_temp.rolling_login(2);
set local role authenticated;
select is((select count(*)::integer from public.platform_brand_publication_metadata
  where owner_user_id=pg_temp.rolling_user(1)::text),0,'publication metadata history is owner-private');
reset role;
update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=pg_temp.rolling_session(1);
select pg_temp.rolling_login(1);
set local role authenticated;
select is((select count(*)::integer from public.platform_brand_publication_metadata
  where owner_user_id=pg_temp.rolling_user(1)::text),0,'expired owner session cannot inspect publication metadata');
reset role;
update auth.sessions set not_after=clock_timestamp()+interval '1 day' where id=pg_temp.rolling_session(1);
select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid='public.platform_brand_publication_metadata'::regclass),'publication metadata has RLS and FORCE RLS');

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into storage.objects(bucket_id,name,owner,owner_id,metadata,version)
  select 'platform-brand-assets',pg_temp.rolling_user(1)::text || '/rolling-' || n || '.png',
    pg_temp.rolling_user(1),pg_temp.rolling_user(1)::text,'{"mimetype":"image/png","size":1024}'::jsonb,
    'studio-rolling-fixture-v' || n
  from generate_series(1,3) n;
insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_provider,storage_bucket,
  storage_object_key,storage_path,mime_type)
  select ('ac190002-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,pg_temp.rolling_user(1)::text,
    'hero_image','supabase','platform-brand-assets',
    pg_temp.rolling_user(1)::text || '/rolling-' || n || '.png',
    pg_temp.rolling_user(1)::text || '/rolling-' || n || '.png','image/png'
  from generate_series(1,3) n;
update public.platform_brand_assets set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now()
  where owner_user_id=pg_temp.rolling_user(1)::text;
-- A safe independently approved asset is still private until a snapshot uses it.
update public.platform_brand_assets set asset_state='published',moderation_status='clean'
  where id='ac190002-0000-4000-8000-000000000002';
select pg_temp.rolling_login(1);
set local role authenticated;
select throws_ok($$select public.publish_platform_brand_profile_assets(
  array['ac190002-0000-4000-8000-000000000001'::uuid],'Historical publish')$$,
  '42501','brand_publish_rpc_required','old standalone asset publish fails before effects');
select is((select asset_state from public.platform_brand_assets where id='ac190002-0000-4000-8000-000000000001'),
  'draft','rejected old asset phase leaves selected media staged');
reset role;
select is((select count(*)::integer from public.platform_brand_asset_review_events
  where asset_id='ac190002-0000-4000-8000-000000000001'),0,'rejected old asset phase creates no review event');
select pg_temp.rolling_login(1);
set local role authenticated;
select lives_ok($$select public.publish_platform_brand_profile(pg_temp.rolling_payload(
  '{"hero_image_asset_id":"ac190002-0000-4000-8000-000000000001","accent_color":"#778899"}'))$$,
  'new atomic Publish still approves and commits selected media');
update public.platform_brand_profiles set hero_image_asset_id='ac190002-0000-4000-8000-000000000002'
  where owner_user_id=pg_temp.rolling_user(1)::text;
select is((select hero_image_asset_id from public.read_public_platform_brand_profile(pg_temp.rolling_user(1)::text)),
  'ac190002-0000-4000-8000-000000000001'::uuid,'draft media replacement cannot replace committed public media');
reset role;
select pg_temp.rolling_login(null);
set local role anon;
select is((select count(*)::integer from public.platform_brand_assets
  where id='ac190002-0000-4000-8000-000000000001'),1,'anonymous row access permits committed safe media');
select is((select count(*)::integer from storage.objects where bucket_id='platform-brand-assets'
  and name=pg_temp.rolling_user(1)::text || '/rolling-1.png'),1,'anonymous storage access permits committed safe media');
select is((select count(*)::integer from public.platform_brand_assets
  where id='ac190002-0000-4000-8000-000000000002'),0,'published-looking draft-only asset remains private');
select is((select count(*)::integer from storage.objects where bucket_id='platform-brand-assets'
  and name=pg_temp.rolling_user(1)::text || '/rolling-2.png'),0,'published-looking draft-only object remains private');
reset role;
select pg_temp.rolling_login(1);
set local role authenticated;
select lives_ok($$update public.platform_brand_assets set asset_state='archived',deleted_at=clock_timestamp()
  where id='ac190002-0000-4000-8000-000000000003' and owner_user_id=pg_temp.rolling_user(1)::text$$,
  'actual owner archive request succeeds for a draft without RETURNING');
select throws_ok($$update public.platform_brand_assets set asset_state='archived',deleted_at=clock_timestamp()
  where id='ac190002-0000-4000-8000-000000000001' and owner_user_id=pg_temp.rolling_user(1)::text$$,
  'P0001','brand_asset_in_use','direct owner archive rejects still-published reference');
select is((select hero_image_asset_id from public.read_public_platform_brand_profile(pg_temp.rolling_user(1)::text)),
 'ac190002-0000-4000-8000-000000000001'::uuid,'rejected archive preserves committed public pointer');
select lives_ok($$select public.publish_platform_brand_profile(pg_temp.rolling_payload())$$,
 'real authorized complete Publish clears design and public references before removal');
select lives_ok($$update public.platform_brand_assets set asset_state='archived',deleted_at=clock_timestamp()
  where id='ac190002-0000-4000-8000-000000000001' and owner_user_id=pg_temp.rolling_user(1)::text$$,
  'actual owner archive succeeds for formerly published media after explicit publication clearing');
select set_config('test.rolling_archive_time',(select deleted_at::text from public.platform_brand_assets
  where id='ac190002-0000-4000-8000-000000000001'),true);
select throws_ok($$update public.platform_brand_assets set asset_state='archived',deleted_at='2000-01-01'
  where id='ac190002-0000-4000-8000-000000000001' and owner_user_id=pg_temp.rolling_user(1)::text$$,
  'P0001','brand_retention_tombstone_permanent','archive retry cannot rewrite permanent retention timestamp');
select lives_ok($$select public.remove_platform_brand_asset('ac190002-0000-4000-8000-000000000001')$$,
 'authorized removal RPC retry is idempotent');
select is((select deleted_at::text from public.platform_brand_assets where id='ac190002-0000-4000-8000-000000000001'),
  current_setting('test.rolling_archive_time'),'archive retry preserves the original retention timestamp');
select throws_ok($$update public.platform_brand_assets set asset_state='published',deleted_at=null
  where id='ac190002-0000-4000-8000-000000000001'$$,
  'P0001','brand_retention_tombstone_permanent','owner cannot restore an archived publication through visible metadata');
select throws_ok($$update public.platform_brand_assets set asset_state='draft',deleted_at=null
  where id='ac190002-0000-4000-8000-000000000003'$$,
  'P0001','brand_retention_tombstone_permanent','owner cannot restore an archived draft');
select throws_ok($$update public.platform_brand_assets set deleted_at=null
  where id='ac190002-0000-4000-8000-000000000001'$$,
  'P0001','brand_retention_tombstone_permanent','owner cannot clear a deletion tombstone');
select set_config('app.platform_brand_review_context','review_platform_brand_asset',true);
select throws_ok($$update public.platform_brand_assets set asset_state='published',deleted_at=null
  where id='ac190002-0000-4000-8000-000000000001'$$,
  'P0001','brand_retention_tombstone_permanent','caller-set review context cannot bypass archive authority');
select set_config('app.platform_brand_review_context','',true);
reset role;
select is((select count(*)::integer from public.platform_brand_assets
  where id in ('ac190002-0000-4000-8000-000000000001','ac190002-0000-4000-8000-000000000003')
    and asset_state='archived' and deleted_at is not null),2,'both owner archive requests commit their tombstones');
select pg_temp.rolling_login(null);
set local role anon;
select is((select count(*)::integer from public.platform_brand_assets
  where id in ('ac190002-0000-4000-8000-000000000001','ac190002-0000-4000-8000-000000000003')),0,
  'archived media metadata remains inaccessible to anonymous viewers');
select is((select count(*)::integer from storage.objects where bucket_id='platform-brand-assets'
  and name=pg_temp.rolling_user(1)::text || '/rolling-1.png'),0,'archived publication object is no longer public');
reset role;

select * from finish();
rollback;
