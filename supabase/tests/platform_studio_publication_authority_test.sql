begin;
select no_plan();

create function pg_temp.studio_user(n integer) returns uuid language sql immutable as $$
  select ('ac150000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.studio_session(n integer) returns uuid language sql immutable as $$
  select ('ac150001-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.studio_asset(n integer) returns uuid language sql immutable as $$
  select ('ac150002-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.studio_login(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.role', case when n is null then 'anon' else 'authenticated' end, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', case when n is null then 'anon' else 'authenticated' end,
    'sub', pg_temp.studio_user(n), 'session_id', pg_temp.studio_session(n))::text, true);
end;
$$;
create function pg_temp.studio_payload(n integer, patch jsonb default '{}'::jsonb)
returns jsonb language sql immutable as $$
  select '{"owner_user_id":"replaced","hero_image_asset_id":null,"hero_video_asset_id":null,"hero_poster_asset_id":null,"background_image_asset_id":null,"avatar_asset_id":null,"logo_asset_id":null,"watermark_asset_id":null,"spotlight_video_id":null,"theme_preset":"city_night","accent_color":"#DC143C","hero_fit_mode":"fill","hero_focal_x":0.5,"hero_focal_y":0.5,"hero_crop_scale":1,"background_fit_mode":"fill","background_focal_x":0.5,"background_focal_y":0.5,"overlay_strength":0.7,"blur_strength":0}'::jsonb
    || jsonb_build_object('owner_user_id', pg_temp.studio_user(n)::text) || patch;
$$;

insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at)
  select pg_temp.studio_user(n),false,false,now() from generate_series(1,6) n;
insert into auth.sessions(id,user_id,not_after)
  select pg_temp.studio_session(n),pg_temp.studio_user(n),now()+interval '1 day' from generate_series(1,6) n;
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
  select pg_temp.studio_user(n),public.wave1_sha256(pg_temp.studio_user(n)::text),d.document_key,d.version,d.market,
    'member',d.capability,pg_temp.studio_session(n)::text,'service_reconciliation'
  from generate_series(1,6) n cross join public.wave1_legal_document_versions d
  where d.active and d.market='UNITED_STATES' and d.capability='account';
update public.platform_money_kill_switches set state='sandbox_only'
  where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled');
select is((select public.process_revenuecat_premium_event_atomic(
  'revenuecat_google_play','studio-publication-premium-1','INITIAL_PURCHASE',pg_temp.studio_user(1),
  p.provider_product_id,p.provider_base_plan_id,'sandbox','active',now()-interval '1 minute',now()+interval '1 day',
  now(),999,'usd',repeat('1',64),'NORMAL','google_play','android',null,p.id,'studio-publication-original-1')->>'status'
  from public.monetization_products p where p.provider='revenuecat_google_play' and p.environment='sandbox'
    and p.product_type='premium_subscription' and p.status='sandbox' order by p.created_at,p.id limit 1),
  'processed','publisher receives finite Premium through actual sandbox authority');
insert into public.user_profiles(user_id,username,display_name,tagline,profile_access_visibility,platform_access_visibility,
  follower_surface_enabled,subscriber_surface_enabled,avatar_url,profile_background_url,default_watch_party_join_policy)
  select pg_temp.studio_user(n)::text, 'studiofixture' || n, 'Platform ' || n, 'Platform tagline',
    'private','public',true,true,'https://example.invalid/private-avatar','https://example.invalid/private-background','invite_only'
  from generate_series(1,6) n;
insert into public.channel_followers(channel_user_id,follower_user_id)
  values(pg_temp.studio_user(1)::text,pg_temp.studio_user(2)::text),
    (pg_temp.studio_user(1)::text,pg_temp.studio_user(3)::text);
insert into public.platform_brand_assets(id,owner_user_id,asset_type,asset_state,storage_provider,storage_bucket,
  storage_object_key,storage_path,mime_type,moderation_status,scan_status)
  select pg_temp.studio_asset(n),pg_temp.studio_user(1)::text,'hero_image','draft','supabase','platform-brand-assets',
    pg_temp.studio_user(1)::text || '/studio-' || n || '.png',
    pg_temp.studio_user(1)::text || '/studio-' || n || '.png','image/png','pending_review',
    case when n=2 then 'pending_scan' else 'clean' end
  from generate_series(1,3) n;
-- The real upload trigger always queues a fresh scan and overrides an INSERT
-- clean value. Model the separate trusted scanner acknowledgement explicitly.
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.platform_brand_assets
  set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now()
  where id in (pg_temp.studio_asset(1),pg_temp.studio_asset(3));
select is((select count(*)::integer from public.platform_brand_assets
  where id in (pg_temp.studio_asset(1),pg_temp.studio_asset(3)) and scan_status='clean'),2,
  'trusted scanner acknowledgement establishes actual clean state after upload triggers');
select is((select scan_status from public.platform_brand_assets where id=pg_temp.studio_asset(2)),
  'pending_scan','unscanned draft remains blocked');

select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid='public.platform_brand_publications'::regclass),'snapshot has RLS and FORCE RLS');
select ok(not has_table_privilege('anon','public.platform_brand_publications','SELECT')
  and not has_table_privilege('authenticated','public.platform_brand_publications','SELECT')
  and not has_table_privilege('authenticated','public.platform_brand_publications','INSERT,UPDATE,DELETE'),
  'client cannot inspect or manufacture snapshots');
select ok(not has_function_privilege('anon','public.publish_platform_brand_profile(jsonb)','EXECUTE')
  and not has_function_privilege('service_role','public.publish_platform_brand_profile(jsonb)','EXECUTE'),
  'publish is authenticated owner API only');
select ok(not has_function_privilege('authenticated','public.platform_brand_publication_asset_safe_internal(uuid,text)','EXECUTE'),
  'internal public safety lookup is not an API');
select ok((select not prosecdef from pg_proc
  where oid='public.guard_platform_brand_profile_publication_metadata()'::regprocedure),
  'publication metadata trigger uses invoker database authority');
select is((select proowner from pg_proc where oid='public.publish_platform_brand_profile(jsonb)'::regprocedure),
  (select relowner from pg_class where oid='public.platform_brand_profiles'::regclass),
  'atomic publisher executes as the canonical draft table owner');
select ok(not has_function_privilege('authenticated','public.guard_platform_brand_profile_publication_metadata()','EXECUTE'),
  'publication metadata guard is not a client RPC');
select ok(not has_table_privilege('authenticated','public.channel_audience_requests','UPDATE'),
  'direct request identity and lifecycle tampering is closed');
select ok(not has_function_privilege('anon','public.review_channel_audience_request(bigint,text)','EXECUTE'),
  'anonymous request review denied');

select pg_temp.studio_login(null);
set local role anon;
select is((select count(*)::integer from public.read_public_platform_identity(pg_temp.studio_user(1)::text)),1,
  'private Profile with public Platform has public minimal identity');
select ok((select not (to_jsonb(identity) ?| array['avatar_url','avatar_index','profile_background_url',
  'profile_access_visibility','default_watch_party_join_policy','default_communication_capture_policy'])
  from public.read_public_platform_identity(pg_temp.studio_user(1)::text) identity),
  'Platform identity excludes Profile media, privacy and room defaults');
select is(public.read_public_channel_follower_count(pg_temp.studio_user(1)::text),2::bigint,'anonymous count is full count only');
select is((select count(*)::integer from public.channel_followers where channel_user_id=pg_temp.studio_user(1)::text),0,
  'anonymous roster remains inaccessible');
reset role;

select pg_temp.studio_login(2);
set local role authenticated;
select is(public.read_public_channel_follower_count(pg_temp.studio_user(1)::text),2::bigint,'a follower sees complete aggregate');
select is((select count(*)::integer from public.channel_followers where channel_user_id=pg_temp.studio_user(1)::text),1,
  'follower roster still exposes only own row');
reset role;
select pg_temp.studio_login(4);
set local role authenticated;
select is(public.read_public_channel_follower_count(pg_temp.studio_user(1)::text),2::bigint,'unrelated viewer sees complete aggregate');
select is((select count(*)::integer from public.user_profiles where user_id=pg_temp.studio_user(1)::text),0,
  'private Profile RLS remains unchanged');
select throws_ok($$select public.publish_platform_brand_profile(pg_temp.studio_payload(1))$$,
  'brand_publish_owner_required','foreign profile publication denied before mutation');
select throws_ok($$select public.publish_platform_brand_profile(pg_temp.studio_payload(4))$$,
  'brand_publish_premium_required','non-Premium owner cannot publish');
reset role;

select pg_temp.studio_login(1);
set local role authenticated;
select throws_ok($$insert into public.platform_brand_profiles(owner_user_id,published_at)
  values(pg_temp.studio_user(1)::text,clock_timestamp())$$,
  '42501','brand_publish_rpc_required','direct initial insert cannot forge a publication timestamp');
select lives_ok($$insert into public.platform_brand_profiles(owner_user_id,accent_color)
  values(pg_temp.studio_user(1)::text,'#112233')$$,
  'new direct draft may omit publication metadata');
select lives_ok($$insert into public.platform_brand_profiles(owner_user_id,accent_color,published_at)
  values(pg_temp.studio_user(1)::text,'#223344',null)
  on conflict(owner_user_id) do update set accent_color=excluded.accent_color,published_at=excluded.published_at$$,
  'legacy asset-free first draft upsert with unchanged null metadata is allowed');
select throws_ok($$insert into public.platform_brand_profiles(owner_user_id,accent_color,published_at)
  values(pg_temp.studio_user(1)::text,'#334455',clock_timestamp())
  on conflict(owner_user_id) do update set accent_color=excluded.accent_color,published_at=excluded.published_at$$,
  '42501','brand_publish_rpc_required','legacy asset-free second publish upsert fails closed');
select is((select accent_color from public.platform_brand_profiles where owner_user_id=pg_temp.studio_user(1)::text),
  '#223344','rejected legacy publication rolls back its entire second upsert');
select is((select count(*)::integer from public.read_public_platform_brand_profile(pg_temp.studio_user(1)::text)),0,
  'legacy metadata upsert cannot manufacture a public snapshot');
select is(public.publish_platform_brand_profile(pg_temp.studio_payload(1,
  jsonb_build_object('hero_image_asset_id',pg_temp.studio_asset(1))))->>'owner_user_id',pg_temp.studio_user(1)::text,
  'atomic definer RPC passes metadata guard and publishes the complete owner payload');
select is((select hero_image_asset_id from public.read_public_platform_brand_profile(pg_temp.studio_user(1)::text)),
  pg_temp.studio_asset(1),'owner public readback returns strictly safe selected media');
select throws_ok($$update public.platform_brand_profiles set published_at=now()+interval '10 years'
  where owner_user_id=pg_temp.studio_user(1)::text$$,
  '42501','brand_publish_rpc_required','direct forged publication timestamp is denied');
select throws_ok($$update public.platform_brand_profiles set published_at=null
  where owner_user_id=pg_temp.studio_user(1)::text$$,
  '42501','brand_publish_rpc_required','direct clearing of publication metadata is denied');
select lives_ok($$insert into public.platform_brand_profiles(owner_user_id,published_at,accent_color)
  select owner_user_id,published_at,'#234567' from public.platform_brand_profiles
  where owner_user_id=pg_temp.studio_user(1)::text
  on conflict(owner_user_id) do update set published_at=excluded.published_at,accent_color=excluded.accent_color$$,
  'legitimate draft upsert may resend unchanged nonnull publication metadata');
select lives_ok($$insert into public.platform_brand_profiles(owner_user_id,accent_color)
  values(pg_temp.studio_user(1)::text,'#345678')
  on conflict(owner_user_id) do update set accent_color=excluded.accent_color$$,
  'legitimate published draft upsert may omit publication metadata');
select set_config('app.platform_brand_review_context','review_platform_brand_asset',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',pg_temp.studio_user(1),
  'session_id',pg_temp.studio_session(1))::text,true);
select throws_ok($$update public.platform_brand_profiles set published_at=clock_timestamp()
  where owner_user_id=pg_temp.studio_user(1)::text$$,
  '42501','brand_publish_rpc_required','caller-supplied claims and review GUC cannot bypass metadata authority');
select pg_temp.studio_login(1);
select set_config('app.platform_brand_review_context','',true);
update public.platform_brand_profiles set accent_color='#123456',hero_fit_mode='fit',overlay_strength=0.5,
  hero_image_asset_id=pg_temp.studio_asset(2)
  where owner_user_id=pg_temp.studio_user(1)::text;
select is((select accent_color from public.read_public_platform_brand_profile(pg_temp.studio_user(1)::text)),
  '#DC143C','legacy draft upsert cannot alter published accent');
select is((select hero_fit_mode from public.read_public_platform_brand_profile(pg_temp.studio_user(1)::text)),
  'fill','draft fit remains staged');
select is((select hero_image_asset_id from public.read_public_platform_brand_profile(pg_temp.studio_user(1)::text)),
  pg_temp.studio_asset(1),'unsafe draft replacement leaves old public asset live');
select throws_ok($$select public.publish_platform_brand_profile(pg_temp.studio_payload(1,
  jsonb_build_object('hero_image_asset_id',pg_temp.studio_asset(2),'accent_color','#ABCDEF')))$$,
  'brand_publish_asset_not_ready','pending scan rejects entire publish');
select is((select accent_color from public.platform_brand_profiles where owner_user_id=pg_temp.studio_user(1)::text),
  '#123456','failed publication rolls back its draft update');
select is((select accent_color from public.read_public_platform_brand_profile(pg_temp.studio_user(1)::text)),
  '#DC143C','failed publication preserves public snapshot');
select throws_ok($$select public.publish_platform_brand_profile('{"owner_user_id":"ac150000-0000-4000-8000-000000000001"}')$$,
  'brand_publish_complete_profile_required','partial payload cannot mix with another draft');
reset role;
select is((select count(*)::integer from public.platform_brand_asset_review_events where asset_id=pg_temp.studio_asset(2)),0,
  'failed publication produces no review side effects');

-- Fail the final snapshot write after review/publish has succeeded: every
-- preceding write must roll back, including moderation evidence.
create function pg_temp.studio_fail_publication() returns trigger language plpgsql as $$
begin
  if new.accent_color='#FEDCBA' then raise exception 'studio_injected_publication_fault'; end if;
  return new;
end;
$$;
create trigger studio_test_publication_fault before insert or update on public.platform_brand_publications
  for each row execute function pg_temp.studio_fail_publication();
set local role authenticated;
select throws_ok($$select public.publish_platform_brand_profile(pg_temp.studio_payload(1,
  jsonb_build_object('hero_image_asset_id',pg_temp.studio_asset(3),'accent_color','#FEDCBA')))$$,
  'studio_injected_publication_fault','final snapshot failure rolls back the complete publish');
reset role;
select is((select moderation_status from public.platform_brand_assets where id=pg_temp.studio_asset(3)),
  'pending_review','snapshot failure rolls back owner review');
select is((select asset_state from public.platform_brand_assets where id=pg_temp.studio_asset(3)),
  'draft','snapshot failure rolls back asset publication');
select is((select count(*)::integer from public.platform_brand_asset_review_events where asset_id=pg_temp.studio_asset(3)),0,
  'snapshot failure rolls back review events');
select is((select accent_color from public.platform_brand_profiles where owner_user_id=pg_temp.studio_user(1)::text),
  '#123456','snapshot failure rolls back draft write');
drop trigger studio_test_publication_fault on public.platform_brand_publications;

create function pg_temp.studio_revoke_during_publish() returns trigger language plpgsql as $$
begin
  if new.accent_color='#AA55AA' then
    delete from auth.sessions where id=pg_temp.studio_session(1);
  end if;
  return new;
end;
$$;
create trigger studio_test_publish_revocation after insert or update on public.platform_brand_profiles
  for each row execute function pg_temp.studio_revoke_during_publish();
set local role authenticated;
select throws_ok($$select public.publish_platform_brand_profile(pg_temp.studio_payload(1,
  jsonb_build_object('accent_color','#AA55AA')))$$,
  'brand_publish_current_session_required','late session revocation is rechecked before publication');
reset role;
select is((select accent_color from public.platform_brand_profiles where owner_user_id=pg_temp.studio_user(1)::text),
  '#123456','late authority failure rolls back draft');
select is((select count(*)::integer from auth.sessions where id=pg_temp.studio_session(1)),1,
  'injected revocation rolled back with rejected transaction');
drop trigger studio_test_publish_revocation on public.platform_brand_profiles;

-- Safety can change after publication. Even the owner public read must filter.
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.platform_brand_assets set asset_state='draft',scan_status='manual_review' where id=pg_temp.studio_asset(1);
select pg_temp.studio_login(1);
set local role authenticated;
select is((select hero_image_asset_id from public.read_public_platform_brand_profile(pg_temp.studio_user(1)::text)),
  null::uuid,'owner visibility cannot turn unsafe media into public-safe media');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.platform_brand_assets set asset_state='archived',moderation_status='removed',
  updated_at=now()-interval '90 days' where id=pg_temp.studio_asset(1);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select is((select count(*)::integer from public.platform_brand_asset_cleanup_candidates(30,500)
  where asset_id=pg_temp.studio_asset(1)),0,'cleanup protects asset referenced only by published snapshot');
reset role;

update public.user_profiles set platform_access_visibility='private' where user_id=pg_temp.studio_user(1)::text;
select pg_temp.studio_login(4);
set local role authenticated;
select is(public.read_public_channel_follower_count(pg_temp.studio_user(1)::text),null::bigint,'private Platform hides count');
select is((select count(*)::integer from public.read_public_platform_identity(pg_temp.studio_user(1)::text)),0,'private Platform hides identity');
select is((select count(*)::integer from public.read_public_platform_brand_profile(pg_temp.studio_user(1)::text)),0,'private Platform hides published Brand');
reset role;
update public.user_profiles set platform_access_visibility='public',follower_surface_enabled=false where user_id=pg_temp.studio_user(1)::text;
set local role authenticated;
select is(public.read_public_channel_follower_count(pg_temp.studio_user(1)::text),null::bigint,'disabled follower surface hides aggregate');
reset role;
update public.user_profiles set follower_surface_enabled=true where user_id=pg_temp.studio_user(1)::text;
insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id)
  values(pg_temp.studio_user(1)::text,pg_temp.studio_user(4)::text,pg_temp.studio_user(1)::text);
set local role authenticated;
select is(public.read_public_channel_follower_count(pg_temp.studio_user(1)::text),null::bigint,'blocked viewer cannot read aggregate');
select is((select count(*)::integer from public.read_public_platform_identity(pg_temp.studio_user(1)::text)),0,'blocked viewer cannot read identity');
reset role;
delete from public.channel_audience_blocks where channel_user_id=pg_temp.studio_user(1)::text and blocked_user_id=pg_temp.studio_user(4)::text;

insert into public.channel_audience_requests(id,channel_user_id,requester_user_id,request_kind)
  values(91501,pg_temp.studio_user(1)::text,pg_temp.studio_user(4)::text,'follow'),
    (91502,pg_temp.studio_user(1)::text,pg_temp.studio_user(5)::text,'follow'),
    (91503,pg_temp.studio_user(1)::text,pg_temp.studio_user(6)::text,'subscriber_access'),
    (91504,pg_temp.studio_user(1)::text,pg_temp.studio_user(2)::text,'follow');
select pg_temp.studio_login(4);
set local role authenticated;
select throws_ok($$select public.review_channel_audience_request(91501,'approved')$$,
  'audience_review_forbidden','requester cannot approve own request');
reset role;
select pg_temp.studio_login(1);
set local role authenticated;
select throws_ok($$update public.channel_audience_requests set requester_user_id=pg_temp.studio_user(3)::text where id=91501$$,
  '42501',null,'creator cannot swap requester identity');
select throws_ok($$insert into public.channel_followers(channel_user_id,follower_user_id)
  values(pg_temp.studio_user(1)::text,pg_temp.studio_user(4)::text)$$,
  '42501',null,'general follower INSERT remains self-only');
select is(public.review_channel_audience_request(91501,'approved')->>'status','approved','owner atomically approves pending follow');
select is(public.review_channel_audience_request(91501,'approved')->>'status','approved','same-status retry is idempotent');
select throws_ok($$select public.review_channel_audience_request(91501,'declined')$$,
  'audience_request_not_pending','conflicting terminal retry cannot rewrite outcome');
select is(public.review_channel_audience_request(91502,'declined')->>'status','declined','decline updates request without follow');
select throws_ok($$select public.review_channel_audience_request(91503,'approved')$$,
  'subscriber_mutation_unsupported','subscriber approval remains unsupported');
select is(public.review_channel_audience_request(91504,'approved')->>'status','approved',
  'approval succeeds when requester already follows');
select throws_ok($$select public.review_channel_audience_request(91503,'pending')$$,
  'audience_review_status_invalid','review RPC rejects arbitrary status transitions');
select throws_ok($$select public.review_channel_audience_request(91999,'approved')$$,
  'audience_request_not_found','missing request cannot create a follow');
reset role;
select is((select count(*)::integer from public.channel_followers where channel_user_id=pg_temp.studio_user(1)::text
  and follower_user_id=pg_temp.studio_user(4)::text),1,'approval creates exactly one follower');
select is((select count(*)::integer from public.channel_followers where channel_user_id=pg_temp.studio_user(1)::text
  and follower_user_id=pg_temp.studio_user(5)::text),0,'decline creates no follower');
select is((select count(*)::integer from public.channel_followers where channel_user_id=pg_temp.studio_user(1)::text
  and follower_user_id=pg_temp.studio_user(2)::text),1,'existing follower approval never duplicates the relationship');

-- An update fault after the follower INSERT must undo that INSERT as well.
insert into public.channel_audience_requests(id,channel_user_id,requester_user_id,request_kind)
  values(91509,pg_temp.studio_user(1)::text,pg_temp.studio_user(6)::text,'follow');
create function pg_temp.studio_fail_review() returns trigger language plpgsql as $$
begin
  if new.id=91509 then raise exception 'studio_injected_review_fault'; end if;
  return new;
end;
$$;
create trigger studio_test_review_fault before update on public.channel_audience_requests
  for each row execute function pg_temp.studio_fail_review();
set local role authenticated;
select throws_ok($$select public.review_channel_audience_request(91509,'approved')$$,
  'studio_injected_review_fault','request update failure rolls back complete approval');
reset role;
select is((select status from public.channel_audience_requests where id=91509),'pending','failed atomic review keeps request pending');
select is((select count(*)::integer from public.channel_followers where channel_user_id=pg_temp.studio_user(1)::text
  and follower_user_id=pg_temp.studio_user(6)::text),0,'failed atomic review rolls back follower');
drop trigger studio_test_review_fault on public.channel_audience_requests;

insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id)
  values(pg_temp.studio_user(1)::text,pg_temp.studio_user(6)::text,pg_temp.studio_user(1)::text);
set local role authenticated;
select throws_ok($$select public.review_channel_audience_request(91509,'approved')$$,
  'blocked_relationship','new block prevents approval of a previously pending request');
reset role;
delete from public.channel_audience_blocks where channel_user_id=pg_temp.studio_user(1)::text
  and blocked_user_id=pg_temp.studio_user(6)::text;

update auth.sessions set not_after=now()-interval '1 second' where id=pg_temp.studio_session(1);
set local role authenticated;
select throws_ok($$select public.publish_platform_brand_profile(pg_temp.studio_payload(1))$$,
  'brand_publish_current_session_required','expired current session cannot publish');
select throws_ok($$select public.review_channel_audience_request(91509,'approved')$$,
  'audience_review_current_session_required','expired current session cannot review');
reset role;
update auth.sessions set not_after=now()+interval '1 day' where id=pg_temp.studio_session(1);
update auth.sessions set not_after=clock_timestamp() where id=pg_temp.studio_session(1);
set local role authenticated;
select throws_ok($$select public.publish_platform_brand_profile(pg_temp.studio_payload(1))$$,
  'brand_publish_current_session_required','session cutoff after transaction start uses wall clock');
select throws_ok($$select public.review_channel_audience_request(91509,'approved')$$,
  'audience_review_current_session_required','review also checks wall-clock session cutoff');
reset role;
update auth.sessions set not_after=now()+interval '1 day' where id=pg_temp.studio_session(1);
update auth.users set deleted_at=now() where id=pg_temp.studio_user(1);
select pg_temp.studio_login(null);
set local role anon;
select is((select count(*)::integer from public.read_public_platform_brand_profile(pg_temp.studio_user(1)::text)),0,
  'soft-deleted owner has no anonymous Brand projection even without a deletion request');
select is((select count(*)::integer from public.read_public_platform_identity(pg_temp.studio_user(1)::text)),0,
  'soft-deleted owner has no anonymous Platform identity');
select is(public.read_public_channel_follower_count(pg_temp.studio_user(1)::text),null::bigint,
  'soft-deleted owner has no anonymous follower count');
reset role;
select pg_temp.studio_login(1);
set local role authenticated;
select is((select count(*)::integer from public.read_public_platform_brand_profile(pg_temp.studio_user(1)::text)),0,
  'soft-deleted owner cannot use the owner visibility bypass for published Brand');
select is((select count(*)::integer from public.read_public_platform_identity(pg_temp.studio_user(1)::text)),0,
  'soft-deleted owner cannot use the owner visibility bypass for Platform identity');
select is(public.read_public_channel_follower_count(pg_temp.studio_user(1)::text),null::bigint,
  'soft-deleted owner cannot use the owner visibility bypass for follower count');
select throws_ok($$select public.publish_platform_brand_profile(pg_temp.studio_payload(1))$$,
  'brand_publish_current_session_required','retained session for soft-deleted owner cannot publish');
select throws_ok($$select public.review_channel_audience_request(91509,'approved')$$,
  'audience_review_current_session_required','retained session for soft-deleted owner cannot review');
reset role;
update auth.users set deleted_at=null where id=pg_temp.studio_user(1);
update auth.users set deleted_at=now() where id=pg_temp.studio_user(6);
set local role authenticated;
select throws_ok($$select public.review_channel_audience_request(91509,'approved')$$,
  'audience_review_account_restricted','soft-deleted requester cannot gain a relationship');
reset role;
update auth.users set deleted_at=null where id=pg_temp.studio_user(6);
update auth.users set banned_until=now()+interval '1 day' where id=pg_temp.studio_user(6);
set local role authenticated;
select throws_ok($$select public.review_channel_audience_request(91509,'approved')$$,
  'audience_review_account_restricted','restricted requester cannot gain a relationship');
reset role;

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
-- Residual presentation rows cannot resurrect a missing auth owner. The exact
-- documented Rachi pseudo-account remains supported; a lookalike does not.
insert into public.user_profiles(user_id,username,platform_access_visibility,follower_surface_enabled)
  values(pg_temp.studio_user(7)::text,'studiofixture7','public',true),
    ('platform_rachi_official','chillywood.rachi','public',true),
    ('platform_rachi_official_copy','studiofixture8','public',true)
  on conflict (user_id) do update set platform_access_visibility='public',follower_surface_enabled=true;
insert into public.platform_brand_profiles(owner_user_id,published_at)
  values(pg_temp.studio_user(7)::text,now()),('platform_rachi_official',now()),('platform_rachi_official_copy',now())
  on conflict (owner_user_id) do update set published_at=excluded.published_at;
insert into public.platform_brand_publications
  select * from public.platform_brand_profiles
  where owner_user_id in (pg_temp.studio_user(7)::text,'platform_rachi_official','platform_rachi_official_copy')
  on conflict (owner_user_id) do update set published_at=excluded.published_at;
select pg_temp.studio_login(null);
set local role anon;
select is((select count(*)::integer from public.read_public_platform_brand_profile(pg_temp.studio_user(7)::text)),0,
  'missing auth owner cannot expose a residual Brand snapshot');
select is((select count(*)::integer from public.read_public_platform_identity(pg_temp.studio_user(7)::text)),0,
  'missing auth owner cannot expose a residual Platform identity');
select is(public.read_public_channel_follower_count(pg_temp.studio_user(7)::text),null::bigint,
  'missing auth owner cannot expose a follower count');
select is((select count(*)::integer from public.read_public_platform_brand_profile('platform_rachi_official')),1,
  'exact supported official pseudo-account retains its Brand projection');
select is((select count(*)::integer from public.read_public_platform_identity('platform_rachi_official')),1,
  'exact supported official pseudo-account retains a supplied public identity');
select is(public.read_public_channel_follower_count('platform_rachi_official'),0::bigint,
  'exact supported official pseudo-account retains the enabled count projection');
select is((select count(*)::integer from public.read_public_platform_brand_profile('platform_rachi_official_copy')),0,
  'official lookalike cannot expose Brand without an auth account');
select is((select count(*)::integer from public.read_public_platform_identity('platform_rachi_official_copy')),0,
  'official lookalike cannot expose Platform identity without an auth account');
select is(public.read_public_channel_follower_count('platform_rachi_official_copy'),null::bigint,
  'official lookalike cannot expose follower count without an auth account');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
delete from public.platform_brand_assets where id=pg_temp.studio_asset(1);
select is((select hero_image_asset_id from public.platform_brand_publications
  where owner_user_id=pg_temp.studio_user(1)::text),null::uuid,
  'asset removal clears published pointer through its foreign key');
select pg_temp.studio_login(1);
set local role authenticated;
delete from public.platform_brand_profiles where owner_user_id=pg_temp.studio_user(1)::text;
reset role;
select is((select count(*)::integer from public.platform_brand_publications
  where owner_user_id=pg_temp.studio_user(1)::text),0,
  'authorized draft deletion also removes its public publication');

select * from finish();
rollback;
