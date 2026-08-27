begin;

create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(56);

select ok(
  pg_get_functiondef(
    'public.social_attachment_storage_access_allowed(text,text)'::regprocedure
  ) ilike '%security definer%set search_path to ''''%'
  and has_function_privilege(
    'anon',
    'public.social_attachment_storage_access_allowed(text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.social_attachment_storage_access_allowed(text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.social_attachment_storage_access_allowed(text,text)',
    'EXECUTE'
  ),
  '1. the boolean Storage helper is fixed-path, caller-bounded, and not a service API'
);

select ok(
  pg_get_functiondef(
    'public.social_attachment_storage_access_allowed(text,text)'::regprocedure
  ) ilike '%storage_provider%=%''supabase''%'
  and pg_get_functiondef(
    'public.social_attachment_storage_access_allowed(text,text)'::regprocedure
  ) ilike '%quarantined_at%is null%'
  and pg_get_functiondef(
    'public.social_attachment_storage_access_allowed(text,text)'::regprocedure
  ) ilike '%media_scan_public_safe%'
  and pg_get_functiondef(
    'public.social_attachment_storage_access_allowed(text,text)'::regprocedure
  ) ilike '%can_access_chat_thread%'
  and pg_get_functiondef(
    'public.social_attachment_storage_access_allowed(text,text)'::regprocedure
  ) ilike '%can_read_watch_party_room_authority%'
  and pg_get_functiondef(
    'public.social_attachment_storage_access_allowed(text,text)'::regprocedure
  ) not ilike '%attachment."owner_user_id"=auth.uid()::text%'
  and pg_get_functiondef(
    'public.social_attachment_storage_access_allowed(text,text)'::regprocedure
  ) not ilike '%has_platform_role%'
  and pg_get_functiondef(
    'public.social_attachment_storage_access_allowed(text,text)'::regprocedure
  ) ilike '%exception when others%return false%',
  '2. exact provider/key, scan, parent-surface, chat, Watch-Party, and fail-closed authority compose without owner or broad-role bypass'
);

select ok(
  (select policy."qual" ilike '%social_attachment_storage_access_allowed%'
          and policy."qual" not ilike '%watch_party_room_messages%'
          and policy."qual" not ilike '%social_attachments attachment%'
          and cardinality(policy."roles")=2
          and policy."roles" @> array['anon'::name,'authenticated'::name]
   from pg_catalog.pg_policies policy
   where policy."schemaname"='storage'
     and policy."tablename"='objects'
     and policy."policyname"='social_attachments_storage_select_authorized'),
  '3. the permissive Storage policy delegates without cross-table expressions and names only API caller roles'
);

select ok(
  not has_table_privilege(
    'anon','public.watch_party_room_messages','SELECT'
  )
  and not has_function_privilege(
    'anon','public.can_read_watch_party_room_authority(text)','EXECUTE'
  ),
  '4. anonymous callers retain no direct protected Watch-Party table or resolver authority'
);

select ok(
  pg_get_functiondef(
    'public.platform_brand_asset_row_access_allowed(text,text,text,text,text,text,text,text,timestamptz,timestamptz)'::regprocedure
  ) ilike '%security definer%set search_path to ''''%'
  and pg_get_functiondef(
    'public.platform_brand_asset_row_access_allowed(text,text,text,text,text,text,text,text,timestamptz,timestamptz)'::regprocedure
  ) ilike '%storage_provider%'
  and pg_get_functiondef(
    'public.platform_brand_asset_row_access_allowed(text,text,text,text,text,text,text,text,timestamptz,timestamptz)'::regprocedure
  ) ilike '%foldername%'
  and has_function_privilege(
    'anon',
    'public.platform_brand_asset_row_access_allowed(text,text,text,text,text,text,text,text,timestamptz,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.platform_brand_asset_row_access_allowed(text,text,text,text,text,text,text,text,timestamptz,timestamptz)',
    'EXECUTE'
  ),
  '4a. platform-brand row authority is a fixed-path caller-bounded boolean gate'
);

select ok(
  (select policy."qual" ilike '%platform_brand_asset_row_access_allowed%'
          and policy."qual" not ilike '%has_platform_role%'
          and policy."qual" not ilike '%has_platform_permission%'
   from pg_catalog.pg_policies policy
   where policy."schemaname"='public'
     and policy."tablename"='platform_brand_assets'
     and policy."policyname"='platform_brand_assets_select_owner_or_public_safe'),
  '4b. platform-brand row RLS no longer plans private staff helpers for anonymous reads'
);

select ok(
  pg_get_functiondef(
    'public.platform_brand_storage_access_allowed(text,text)'::regprocedure
  ) ilike '%security definer%set search_path to ''''%'
  and pg_get_functiondef(
    'public.platform_brand_storage_access_allowed(text,text)'::regprocedure
  ) ilike '%whole_app_exact_current_session_authority_internal%'
  and pg_get_functiondef(
    'public.platform_brand_storage_access_allowed(text,text)'::regprocedure
  ) ilike '%media_scan_public_safe%'
  and pg_get_functiondef(
    'public.platform_brand_storage_access_allowed(text,text)'::regprocedure
  ) ilike '%quarantined_at%is null%'
  and has_function_privilege(
    'anon','public.platform_brand_storage_access_allowed(text,text)','EXECUTE'
  )
  and not has_function_privilege(
    'service_role','public.platform_brand_storage_access_allowed(text,text)','EXECUTE'
  ),
  '4c. platform-brand Storage authority composes exact session, owner, provider, path, and scan state'
);

select ok(
  (select policy."qual" ilike '%platform_brand_storage_access_allowed%'
          and policy."qual" not ilike '%platform_brand_assets%'
   from pg_catalog.pg_policies policy
   where policy."schemaname"='storage'
     and policy."tablename"='objects'
     and policy."policyname"='platform_brand_storage_select_owner_or_public_safe'),
  '4d. platform-brand Storage RLS contains no direct cross-table expression'
);

select ok(
  (select policy."with_check" ilike '%storage_provider%'
          and policy."with_check" ilike '%storage_object_key%storage_path%'
          and policy."with_check" ilike '%foldername%owner_user_id%'
   from pg_catalog.pg_policies policy
   where policy."schemaname"='public'
     and policy."tablename"='platform_brand_assets'
     and policy."policyname"='platform_brand_assets_insert_owner_draft'),
  '4k. direct client brand-row inserts require an exact owner-prefixed Supabase object identity'
);

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select lives_ok(
  $$select count(*) from public.platform_brand_assets$$,
  '4e. anonymous platform-brand row discovery no longer fails on private staff-helper ACLs'
);
reset role;
select set_config('request.jwt.claims','{}',true);

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000','da000000-0000-4000-8000-000000000001','authenticated','authenticated','social-storage-host@example.test','',now(),'{}','{}',now(),now(),false,false),
  ('00000000-0000-0000-0000-000000000000','da000000-0000-4000-8000-000000000002','authenticated','authenticated','social-storage-member@example.test','',now(),'{}','{}',now(),now(),false,false),
  ('00000000-0000-0000-0000-000000000000','da000000-0000-4000-8000-000000000003','authenticated','authenticated','social-storage-outsider@example.test','',now(),'{}','{}',now(),now(),false,false);

insert into auth.sessions(id,user_id,not_after) values
  ('da000000-0000-4000-8000-000000000101','da000000-0000-4000-8000-000000000001',now()+interval '1 day'),
  ('da000000-0000-4000-8000-000000000202','da000000-0000-4000-8000-000000000002',now()+interval '1 day'),
  ('da000000-0000-4000-8000-000000000303','da000000-0000-4000-8000-000000000003',now()+interval '1 day');

insert into public.wave1_legal_acceptances(
  user_id,subject_hash,document_key,document_version,market,role_key,capability,
  session_generation,authority_source
)
select fixture.user_id,public.wave1_sha256(fixture.user_id::text),
       document.document_key,document.version,document.market,'member',
       document.capability,fixture.session_generation,'service_reconciliation'
from (values
  ('da000000-0000-4000-8000-000000000001'::uuid,'da000000-0000-4000-8000-000000000101'),
  ('da000000-0000-4000-8000-000000000002'::uuid,'da000000-0000-4000-8000-000000000202'),
  ('da000000-0000-4000-8000-000000000003'::uuid,'da000000-0000-4000-8000-000000000303')
) fixture(user_id,session_generation)
cross join public.wave1_legal_document_versions document
where document.active and document.market='UNITED_STATES'
  and document.capability='account';

insert into public.videos(
  id,owner_id,title,visibility,moderation_status,storage_provider,
  storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes
) values (
  'db000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000001',
  'Cross-bucket policy availability fixture','public','clean','supabase',
  'creator-videos',
  'da000000-0000-4000-8000-000000000001/db000000-0000-4000-8000-000000000001/source.mp4',
  'da000000-0000-4000-8000-000000000001/db000000-0000-4000-8000-000000000001/source.mp4',
  'video/mp4',1024
);
update public.videos
set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now()
where id='db000000-0000-4000-8000-000000000001';

insert into public.creator_video_comments(
  id,video_id,user_id,body,moderation_status
) values (
  'dc000000-0000-4000-8000-000000000001',
  'db000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000001',
  'public attachment surface','clean'
);

-- Membership lifecycle triggers accept only their server-owned transition
-- context.  Build the room fixture through that exact trusted role rather
-- than disabling triggers or restoring direct client upserts.
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.watch_party_rooms(
  party_id,title_id,host_user_id,room_type,join_policy,content_access_rule,
  is_active,playback_state,playback_position_millis,started_at,last_activity_at
) values (
  'SOCIALSTORAGE','social-storage-title',
  'da000000-0000-4000-8000-000000000001',
  'title','open','open',true,'paused',0,now(),now()
);
insert into public.watch_party_room_memberships(
  party_id,user_id,role,stage_role,membership_state,last_seen_at
) values (
  'SOCIALSTORAGE','da000000-0000-4000-8000-000000000002',
  'viewer','listener','active',now()
);
insert into public.watch_party_room_messages(
  id,party_id,user_id,username,text
) values (
  'dc000000-0000-4000-8000-000000000002','SOCIALSTORAGE',
  'da000000-0000-4000-8000-000000000001','storage_host',
  'protected Watch-Party attachment surface'
);
reset role;
select set_config('request.jwt.claims','{}',true);

insert into public.social_attachments(
  id,owner_user_id,surface_type,surface_id,storage_provider,storage_bucket,
  storage_object_key,storage_path,mime_type,size_bytes,moderation_status
) values
  ('dd000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','creator_video_comment','dc000000-0000-4000-8000-000000000001','supabase','social-attachments','da000000-0000-4000-8000-000000000001/public-comment.jpg','da000000-0000-4000-8000-000000000001/public-comment.jpg','image/jpeg',1024,'clean'),
  ('dd000000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000001','watch_party_room_message','dc000000-0000-4000-8000-000000000002','supabase','social-attachments','da000000-0000-4000-8000-000000000001/watch-private.jpg','da000000-0000-4000-8000-000000000001/watch-private.jpg','image/jpeg',1024,'clean'),
  ('dd000000-0000-4000-8000-000000000003','da000000-0000-4000-8000-000000000001','creator_video_comment','dc000000-0000-4000-8000-000000000001','supabase','social-attachments','da000000-0000-4000-8000-000000000001/pending.jpg','da000000-0000-4000-8000-000000000001/pending.jpg','image/jpeg',1024,'clean'),
  ('dd000000-0000-4000-8000-000000000004','da000000-0000-4000-8000-000000000001','creator_video_comment','dc000000-0000-4000-8000-000000000001','supabase','social-attachments','da000000-0000-4000-8000-000000000001/quarantined.jpg','da000000-0000-4000-8000-000000000001/quarantined.jpg','image/jpeg',1024,'clean'),
  ('dd000000-0000-4000-8000-000000000005','da000000-0000-4000-8000-000000000001','creator_video_comment','dc000000-0000-4000-8000-000000000001','cloudflare_r2','chillywood-media-origin','collision/social-object.jpg','collision/social-object.jpg','image/jpeg',1024,'clean'),
  ('dd000000-0000-4000-8000-000000000008','da000000-0000-4000-8000-000000000002','watch_party_room_message','dc000000-0000-4000-8000-000000000002','supabase','social-attachments','da000000-0000-4000-8000-000000000002/watch-member-owned.jpg','da000000-0000-4000-8000-000000000002/watch-member-owned.jpg','image/jpeg',1024,'clean');

update public.social_attachments
set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now()
where id in (
  'dd000000-0000-4000-8000-000000000001',
  'dd000000-0000-4000-8000-000000000002',
  'dd000000-0000-4000-8000-000000000005',
  'dd000000-0000-4000-8000-000000000008'
);
update public.social_attachments
set scan_status='quarantined',scan_provider='pgtap',scan_result='malware',
    quarantined_at=now()
where id='dd000000-0000-4000-8000-000000000004';

insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values
  ('creator-videos','da000000-0000-4000-8000-000000000001/db000000-0000-4000-8000-000000000001/source.mp4','da000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','{"mimetype":"video/mp4","size":1024}'),
  ('social-attachments','da000000-0000-4000-8000-000000000001/public-comment.jpg','da000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','{"mimetype":"image/jpeg","size":1024}'),
  ('social-attachments','da000000-0000-4000-8000-000000000001/watch-private.jpg','da000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','{"mimetype":"image/jpeg","size":1024}'),
  ('social-attachments','da000000-0000-4000-8000-000000000001/pending.jpg','da000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','{"mimetype":"image/jpeg","size":1024}'),
  ('social-attachments','da000000-0000-4000-8000-000000000001/quarantined.jpg','da000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','{"mimetype":"image/jpeg","size":1024}'),
  ('social-attachments','da000000-0000-4000-8000-000000000002/watch-member-owned.jpg','da000000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000002','{"mimetype":"image/jpeg","size":1024}'),
  ('social-attachments','collision/social-object.jpg',null,null,'{"mimetype":"image/jpeg","size":1024}');

-- Preserve intentionally inconsistent historical/adversarial rows. Normal
-- client inserts are covered by the owner-prefix policy assertion above and
-- the scan trigger would otherwise normalize these fixtures before RLS sees
-- the states under test.
set local session_replication_role=replica;
insert into public.platform_brand_assets(
  id,owner_user_id,asset_type,asset_state,storage_provider,storage_bucket,
  storage_object_key,storage_path,mime_type,file_size_bytes,
  moderation_status,scan_status,scan_provider,scan_result,scanned_at,
  quarantined_at
) values (
  'dd000000-0000-4000-8000-000000000099',
  'da000000-0000-4000-8000-000000000001','logo','published','supabase',
  'platform-brand-assets',
  'da000000-0000-4000-8000-000000000001/quarantined-published-logo.jpg',
  'da000000-0000-4000-8000-000000000001/quarantined-published-logo.jpg',
  'image/jpeg',1024,'clean','clean','pgtap','clean',now(),now()
),(
  'dd000000-0000-4000-8000-000000000098',
  'da000000-0000-4000-8000-000000000001','logo','published','supabase',
  'platform-brand-assets',
  'da000000-0000-4000-8000-000000000002/cross-owner-alias.jpg',
  'da000000-0000-4000-8000-000000000002/cross-owner-alias.jpg',
  'image/jpeg',1024,'clean','clean','pgtap','clean',now(),null
);
set local session_replication_role=origin;

insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values (
  'platform-brand-assets',
  'da000000-0000-4000-8000-000000000001/quarantined-published-logo.jpg',
  'da000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000001',
  '{"mimetype":"image/jpeg","size":1024}'
),(
  'platform-brand-assets',
  'da000000-0000-4000-8000-000000000002/cross-owner-alias.jpg',
  'da000000-0000-4000-8000-000000000002',
  'da000000-0000-4000-8000-000000000002',
  '{"mimetype":"image/jpeg","size":1024}'
),(
  'platform-brand-assets',
  'da000000-0000-4000-8000-000000000001/unbound-brand-object.jpg',
  'da000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000001',
  '{"mimetype":"image/jpeg","size":1024}'
);

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is(public.platform_brand_asset_row_access_allowed(
  'da000000-0000-4000-8000-000000000001','published','clean','clean',
  'supabase','platform-brand-assets',
  'da000000-0000-4000-8000-000000000001/quarantined-published-logo.jpg',
  'da000000-0000-4000-8000-000000000001/quarantined-published-logo.jpg',
  now(),null
),false,
  '4f. an explicit quarantine marker overrides public-looking brand row state');
select is((select count(*)::integer from public.platform_brand_assets
  where id='dd000000-0000-4000-8000-000000000099'),0,
  '4g. anonymous row RLS hides a published clean-looking quarantined brand asset');
select is((select count(*)::integer from storage.objects
  where bucket_id='platform-brand-assets'
    and name='da000000-0000-4000-8000-000000000001/quarantined-published-logo.jpg'),0,
  '4h. anonymous Storage RLS hides the bound quarantined brand object');
select is((select count(*)::integer from public.platform_brand_assets
  where id='dd000000-0000-4000-8000-000000000098'),0,
  '4l. anonymous row RLS hides a published cross-owner object alias');
select is((select count(*)::integer from storage.objects
  where bucket_id='platform-brand-assets'
    and name='da000000-0000-4000-8000-000000000002/cross-owner-alias.jpg'),0,
  '4m. a published cross-owner alias cannot disclose the victim object');
select is(public.platform_brand_asset_public_safe(
  'dd000000-0000-4000-8000-000000000098',
  'da000000-0000-4000-8000-000000000001'
),false,
  '4n. public Brand profile resolution rejects the cross-owner alias');
reset role;
select set_config('request.jwt.claims','{}',true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"da000000-0000-4000-8000-000000000001","session_id":"da000000-0000-4000-8000-000000000101"}',true
);
select is((select count(*)::integer from storage.objects
  where bucket_id='platform-brand-assets'
    and name='da000000-0000-4000-8000-000000000001/quarantined-published-logo.jpg'),0,
  '4i. the exact owner cannot download a quarantined brand object');
select is((select count(*)::integer from storage.objects
  where bucket_id='platform-brand-assets'
    and name='da000000-0000-4000-8000-000000000001/unbound-brand-object.jpg'),0,
  '4j. an owner folder prefix alone cannot authorize an unbound brand object');
reset role;
select set_config('request.jwt.claims','{}',true);

select is(
  public.social_attachment_storage_access_allowed(
    'wrong-bucket','da000000-0000-4000-8000-000000000001/public-comment.jpg'
  ),false,
  '5. a wrong bucket fails closed'
);
select is(
  public.social_attachment_storage_access_allowed(
    'social-attachments','da000000-0000-4000-8000-000000000001/not-the-bound-object.jpg'
  ),false,
  '6. a neighboring or unbound object key fails closed'
);
select is(
  public.social_attachment_storage_access_allowed(
    'social-attachments','collision/social-object.jpg'
  ),false,
  '7. an R2 row cannot authorize a same-named Supabase object'
);
select is(
  public.social_attachment_storage_access_allowed(
    'social-attachments','da000000-0000-4000-8000-000000000001/pending.jpg'
  ),false,
  '8. a pending attachment scan cannot become playback authority'
);
select is(
  public.social_attachment_storage_access_allowed(
    'social-attachments','da000000-0000-4000-8000-000000000001/quarantined.jpg'
  ),false,
  '9. quarantine cannot be bypassed by a clean-looking row binding'
);

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select lives_ok($sql$
  select count(*) from storage.objects
  where bucket_id='creator-videos'
    and name='da000000-0000-4000-8000-000000000001/db000000-0000-4000-8000-000000000001/source.mp4'
$sql$,'10. an unrelated anonymous creator-video Storage read no longer errors through the social policy');
select is((select count(*)::integer from storage.objects
  where bucket_id='creator-videos'
    and name='da000000-0000-4000-8000-000000000001/db000000-0000-4000-8000-000000000001/source.mp4'),1,
  '11. the unrelated exact public creator-video object remains readable');
select is(public.social_attachment_storage_access_allowed(
  'social-attachments','da000000-0000-4000-8000-000000000001/public-comment.jpg'),true,
  '12. an exact clean public-surface attachment remains anonymously authorized');
select lives_ok($sql$
  select count(*) from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000001/public-comment.jpg'
$sql$,'13. anonymous public social-attachment Storage selection executes without protected-table privileges');
select is((select count(*)::integer from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000001/public-comment.jpg'),1,
  '14. the exact clean public social attachment is returned');
select is(public.social_attachment_storage_access_allowed(
  'social-attachments','da000000-0000-4000-8000-000000000001/watch-private.jpg'),false,
  '15. message existence alone grants anonymous callers no Watch-Party attachment access');
select lives_ok($sql$
  select count(*) from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000001/watch-private.jpg'
$sql$,'16. denying an anonymous Watch-Party attachment remains an ordinary empty Storage result');
select is((select count(*)::integer from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000001/watch-private.jpg'),0,
  '17. anonymous callers cannot read a protected Watch-Party attachment');
reset role;
select set_config('request.jwt.claims','{}',true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"da000000-0000-4000-8000-000000000003","session_id":"da000000-0000-4000-8000-000000000303"}',true
);
select is(public.social_attachment_storage_access_allowed(
  'social-attachments','da000000-0000-4000-8000-000000000001/watch-private.jpg'),false,
  '18. a current authenticated outsider has no room-derived attachment authority');
select is((select count(*)::integer from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000001/watch-private.jpg'),0,
  '19. direct Storage RLS hides the Watch-Party attachment from an outsider');

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"da000000-0000-4000-8000-000000000002","session_id":"da000000-0000-4000-8000-000000000202"}',true
);
select is(public.can_read_watch_party_room_authority('SOCIALSTORAGE'),true,
  '20. the exact current room member has canonical Watch-Party read authority');
select is(public.social_attachment_storage_access_allowed(
  'social-attachments','da000000-0000-4000-8000-000000000001/watch-private.jpg'),true,
  '21. the exact current room member receives attachment authority');
select is((select count(*)::integer from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000001/watch-private.jpg'),1,
  '22. direct Storage RLS returns the bound Watch-Party attachment to that member');
select is(public.social_attachment_storage_access_allowed(
  'social-attachments','da000000-0000-4000-8000-000000000002/watch-member-owned.jpg'),true,
  '22a. an attachment owner with exact current room membership is authorized');
select is((select count(*)::integer from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000002/watch-member-owned.jpg'),1,
  '22b. direct Storage returns the member-owned attachment while room authority is current');

reset role;
select set_config('request.jwt.claims','{}',true);
set local session_replication_role=replica;
update public.watch_party_room_memberships
set membership_state='left',left_at=now()
where party_id='SOCIALSTORAGE'
  and user_id='da000000-0000-4000-8000-000000000002';
set local session_replication_role=origin;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"da000000-0000-4000-8000-000000000002","session_id":"da000000-0000-4000-8000-000000000202"}',true
);
select is(public.social_attachment_storage_access_allowed(
  'social-attachments','da000000-0000-4000-8000-000000000002/watch-member-owned.jpg'),false,
  '22c. leaving the room revokes attachment authority even for the attachment owner');
select is((select count(*)::integer from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000002/watch-member-owned.jpg'),0,
  '22d. direct Storage cannot reuse attachment ownership after room membership loss');

reset role;
select set_config('request.jwt.claims','{}',true);
set local session_replication_role=replica;
update public.watch_party_room_memberships
set membership_state='active',left_at=null,last_seen_at=now()
where party_id='SOCIALSTORAGE'
  and user_id='da000000-0000-4000-8000-000000000002';
set local session_replication_role=origin;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"da000000-0000-4000-8000-000000000002","session_id":"da000000-0000-4000-8000-000000000299"}',true
);
select is(public.social_attachment_storage_access_allowed(
  'social-attachments','da000000-0000-4000-8000-000000000001/watch-private.jpg'),false,
  '23. a stale session cannot reuse room attachment authority');
select is((select count(*)::integer from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000001/watch-private.jpg'),0,
  '24. direct Storage RLS fails closed for the stale session');
reset role;
select set_config('request.jwt.claims','{}',true);

insert into public.account_deletion_requests(
  user_id,status,delete_after,restore_deadline
) values (
  'da000000-0000-4000-8000-000000000002','scheduled',
  now()+interval '30 days',now()+interval '30 days'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"da000000-0000-4000-8000-000000000002","session_id":"da000000-0000-4000-8000-000000000202"}',true
);
select is(public.social_attachment_storage_access_allowed(
  'social-attachments','da000000-0000-4000-8000-000000000001/watch-private.jpg'),false,
  '25. an account-restricted member loses attachment authority immediately');
select is((select count(*)::integer from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000001/watch-private.jpg'),0,
  '26. direct Storage RLS also fails closed after account restriction');
reset role;
select set_config('request.jwt.claims','{}',true);

-- Protected creator-video comments inherit the exact parent commerce boundary.
-- Build provider-backed VIP and Paid Video authority for the existing current
-- outsider session, after first proving that neither attachment is public.
insert into public.wave1_creator_eligibility (
  creator_user_id,state,account_status,age_18_plus,legal_accepted,
  creator_role,moderation_state,market,rollout_eligible,platform_capability,
  provider_eligible,kyc_complete,tax_complete,sanctions_clear,payout_eligible,
  authority_source,last_operation_key
) values (
  'da000000-0000-4000-8000-000000000001','VERIFIED','ACTIVE',true,true,
  true,'CLEAR','UNITED_STATES',true,true,true,true,true,true,true,
  'social-storage-protected-fixture','social-storage-protected-creator'
);

insert into public.wave1_legal_acceptances (
  user_id,subject_hash,document_key,document_version,market,role_key,capability,
  session_generation,authority_source
)
select
  'da000000-0000-4000-8000-000000000001',
  public.wave1_sha256('da000000-0000-4000-8000-000000000001'),
  document.document_key,document.version,document.market,'member',
  document.capability,'da000000-0000-4000-8000-000000000101',
  'service_reconciliation'
from public.wave1_legal_document_versions document
where document.active
  and document.market='UNITED_STATES'
  and document.capability in ('creator','creator_money');

insert into public.videos(
  id,owner_id,title,visibility,moderation_status,storage_provider,
  storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes,
  vip_access_required
) values
  (
    'db000000-0000-4000-8000-000000000002',
    'da000000-0000-4000-8000-000000000001',
    'Protected VIP attachment parent','public','clean','supabase',
    'creator-videos',
    'da000000-0000-4000-8000-000000000001/db000000-0000-4000-8000-000000000002/source.mp4',
    'da000000-0000-4000-8000-000000000001/db000000-0000-4000-8000-000000000002/source.mp4',
    'video/mp4',1024,true
  ),
  (
    'db000000-0000-4000-8000-000000000003',
    'da000000-0000-4000-8000-000000000001',
    'Protected Paid Video attachment parent','public','clean','supabase',
    'creator-videos',
    'da000000-0000-4000-8000-000000000001/db000000-0000-4000-8000-000000000003/source.mp4',
    'da000000-0000-4000-8000-000000000001/db000000-0000-4000-8000-000000000003/source.mp4',
    'video/mp4',1024,false
  );
update public.videos
set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now()
where id in (
  'db000000-0000-4000-8000-000000000002',
  'db000000-0000-4000-8000-000000000003'
);

insert into public.creator_video_comments(
  id,video_id,user_id,body,moderation_status
) values
  (
    'dc000000-0000-4000-8000-000000000003',
    'db000000-0000-4000-8000-000000000002',
    'da000000-0000-4000-8000-000000000003',
    'VIP protected attachment surface','clean'
  ),
  (
    'dc000000-0000-4000-8000-000000000004',
    'db000000-0000-4000-8000-000000000003',
    'da000000-0000-4000-8000-000000000003',
    'Paid Video protected attachment surface','clean'
  );

insert into public.social_attachments(
  id,owner_user_id,surface_type,surface_id,storage_provider,storage_bucket,
  storage_object_key,storage_path,mime_type,size_bytes,moderation_status
) values
  (
    'dd000000-0000-4000-8000-000000000006',
    'da000000-0000-4000-8000-000000000003','creator_video_comment',
    'dc000000-0000-4000-8000-000000000003','supabase','social-attachments',
    'da000000-0000-4000-8000-000000000003/vip-protected-comment.jpg',
    'da000000-0000-4000-8000-000000000003/vip-protected-comment.jpg',
    'image/jpeg',1024,'clean'
  ),
  (
    'dd000000-0000-4000-8000-000000000007',
    'da000000-0000-4000-8000-000000000003','creator_video_comment',
    'dc000000-0000-4000-8000-000000000004','supabase','social-attachments',
    'da000000-0000-4000-8000-000000000003/paid-protected-comment.jpg',
    'da000000-0000-4000-8000-000000000003/paid-protected-comment.jpg',
    'image/jpeg',1024,'clean'
  );
update public.social_attachments
set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now()
where id in (
  'dd000000-0000-4000-8000-000000000006',
  'dd000000-0000-4000-8000-000000000007'
);

insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values
  (
    'creator-videos',
    'da000000-0000-4000-8000-000000000001/db000000-0000-4000-8000-000000000002/source.mp4',
    'da000000-0000-4000-8000-000000000001',
    'da000000-0000-4000-8000-000000000001',
    '{"mimetype":"video/mp4","size":1024}'
  ),
  (
    'creator-videos',
    'da000000-0000-4000-8000-000000000001/db000000-0000-4000-8000-000000000003/source.mp4',
    'da000000-0000-4000-8000-000000000001',
    'da000000-0000-4000-8000-000000000001',
    '{"mimetype":"video/mp4","size":1024}'
  ),
  (
    'social-attachments',
    'da000000-0000-4000-8000-000000000003/vip-protected-comment.jpg',
    'da000000-0000-4000-8000-000000000003',
    'da000000-0000-4000-8000-000000000003',
    '{"mimetype":"image/jpeg","size":1024}'
  ),
  (
    'social-attachments',
    'da000000-0000-4000-8000-000000000003/paid-protected-comment.jpg',
    'da000000-0000-4000-8000-000000000003',
    'da000000-0000-4000-8000-000000000003',
    '{"mimetype":"image/jpeg","size":1024}'
  );

insert into public.creator_vip_pass_offers(
  id,creator_id,title,price_cents,currency,pass_type,status,
  provider,provider_product_key,provider_product_id
)
select
  'de000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000001',
  'Protected attachment VIP',mapping.reference_price_minor,
  mapping.reference_currency,'one_time','sandbox','revenuecat',
  product.product_key,mapping.provider_product_id
from public.monetization_product_store_mappings mapping
join public.monetization_products product on product.id=mapping.product_id
where mapping.provider='revenuecat_app_store'
  and mapping.provider_product_id='com.chillywood.vip.tier1'
  and mapping.environment='sandbox';

insert into public.creator_content_prices(
  id,creator_id,content_type,content_id,is_paid,price_cents,currency,status,
  provider,provider_product_id,provider_product_key,metadata
)
select
  'de000000-0000-4000-8000-000000000002',
  'da000000-0000-4000-8000-000000000001','creator_video',
  'db000000-0000-4000-8000-000000000003',true,
  mapping.reference_price_minor,mapping.reference_currency,'sandbox',
  mapping.provider,mapping.provider_product_id,product.product_key,
  jsonb_build_object('sandbox_only',true,'not_payable',true)
from public.monetization_product_store_mappings mapping
join public.monetization_products product on product.id=mapping.product_id
where mapping.provider='revenuecat_app_store'
  and mapping.provider_product_id='com.chillywood.paidvideo.tier1'
  and mapping.environment='sandbox';

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is(public.social_attachment_storage_access_allowed(
  'social-attachments',
  'da000000-0000-4000-8000-000000000003/vip-protected-comment.jpg'),false,
  '27. anonymous callers cannot authorize a VIP-video comment attachment');
select is((select count(*)::integer from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000003/vip-protected-comment.jpg'),0,
  '28. direct Storage RLS hides a VIP-video comment attachment from anonymous callers');
select is(public.social_attachment_storage_access_allowed(
  'social-attachments',
  'da000000-0000-4000-8000-000000000003/paid-protected-comment.jpg'),false,
  '29. anonymous callers cannot authorize a Paid Video comment attachment');
select is((select count(*)::integer from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000003/paid-protected-comment.jpg'),0,
  '30. direct Storage RLS hides a Paid Video comment attachment from anonymous callers');
reset role;
select set_config('request.jwt.claims','{}',true);

update public.platform_money_kill_switches
set state='sandbox_only'
where key='revenuecat_app_store_enabled';

insert into public.money_purchase_intents(
  id,user_id,product_id,product_key,product_type,provider,provider_product_id,
  source_type,source_id,creator_id,environment,status,amount_minor,currency,
  idempotency_key,expires_at,session_generation,metadata
)
select
  'df000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000003',mapping.product_id,
  product.product_key,product.product_type,mapping.provider,
  mapping.provider_product_id,'vip_pass',
  'de000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000001','sandbox','pending',
  mapping.reference_price_minor,mapping.reference_currency,
  'social-storage-protected-vip-intent',now()+interval '15 minutes',
  'da000000-0000-4000-8000-000000000303',
  jsonb_build_object('sandbox_only',true,'not_payable',true)
from public.monetization_product_store_mappings mapping
join public.monetization_products product on product.id=mapping.product_id
where mapping.provider='revenuecat_app_store'
  and mapping.provider_product_id='com.chillywood.vip.tier1'
  and mapping.environment='sandbox';

insert into public.money_purchase_intents(
  id,user_id,product_id,product_key,product_type,provider,provider_product_id,
  source_type,source_id,creator_id,environment,status,amount_minor,currency,
  idempotency_key,expires_at,session_generation,metadata
)
select
  'df000000-0000-4000-8000-000000000002',
  'da000000-0000-4000-8000-000000000003',mapping.product_id,
  product.product_key,product.product_type,mapping.provider,
  mapping.provider_product_id,'paid_content',
  'db000000-0000-4000-8000-000000000003',
  'da000000-0000-4000-8000-000000000001','sandbox','pending',
  mapping.reference_price_minor,mapping.reference_currency,
  'social-storage-protected-paid-intent',now()+interval '15 minutes',
  'da000000-0000-4000-8000-000000000303',
  jsonb_build_object('sandbox_only',true,'not_payable',true)
from public.monetization_product_store_mappings mapping
join public.monetization_products product on product.id=mapping.product_id
where mapping.provider='revenuecat_app_store'
  and mapping.provider_product_id='com.chillywood.paidvideo.tier1'
  and mapping.environment='sandbox';

select public.process_revenuecat_app_store_event_atomic(
  'social-storage-protected-vip-initial','INITIAL_PURCHASE',
  'da000000-0000-4000-8000-000000000003',mapping.provider_product_id,
  mapping.environment,now(),null,mapping.reference_price_minor,
  mapping.reference_currency,repeat('a',64),
  'social-storage-protected-vip-original',null
)
from public.monetization_product_store_mappings mapping
where mapping.provider='revenuecat_app_store'
  and mapping.provider_product_id='com.chillywood.vip.tier1'
  and mapping.environment='sandbox';

select public.process_revenuecat_app_store_event_atomic(
  'social-storage-protected-paid-initial','INITIAL_PURCHASE',
  'da000000-0000-4000-8000-000000000003',mapping.provider_product_id,
  mapping.environment,now(),null,mapping.reference_price_minor,
  mapping.reference_currency,repeat('b',64),
  'social-storage-protected-paid-original',null
)
from public.monetization_product_store_mappings mapping
where mapping.provider='revenuecat_app_store'
  and mapping.provider_product_id='com.chillywood.paidvideo.tier1'
  and mapping.environment='sandbox';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"da000000-0000-4000-8000-000000000003","session_id":"da000000-0000-4000-8000-000000000303"}',true
);
select is(public.social_attachment_storage_access_allowed(
  'social-attachments',
  'da000000-0000-4000-8000-000000000003/vip-protected-comment.jpg'),true,
  '31. the exact provider-backed VIP entitlement authorizes its parent comment attachment');
select is((select count(*)::integer from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000003/vip-protected-comment.jpg'),1,
  '32. direct Storage RLS returns the VIP attachment to its exact entitled viewer');
select is(public.social_attachment_storage_access_allowed(
  'social-attachments',
  'da000000-0000-4000-8000-000000000003/paid-protected-comment.jpg'),true,
  '33. the exact provider-backed Paid Video purchase authorizes its parent comment attachment');
select is((select count(*)::integer from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000003/paid-protected-comment.jpg'),1,
  '34. direct Storage RLS returns the Paid Video attachment to its exact entitled viewer');
reset role;
select set_config('request.jwt.claims','{}',true);

select public.process_revenuecat_terminal_event_atomic(
  'revenuecat_app_store','social-storage-protected-vip-refund','REFUND',
  'da000000-0000-4000-8000-000000000003',
  'com.chillywood.vip.tier1',null,'sandbox','refunded',null,null,now(),
  repeat('c',64),'NORMAL','app_store','ios',
  'social-storage-protected-vip-original'
);
select public.process_revenuecat_terminal_event_atomic(
  'revenuecat_app_store','social-storage-protected-paid-revocation','REVOCATION',
  'da000000-0000-4000-8000-000000000003',
  'com.chillywood.paidvideo.tier1',null,'sandbox','revoked',null,null,now(),
  repeat('d',64),'NORMAL','app_store','ios',
  'social-storage-protected-paid-original'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"da000000-0000-4000-8000-000000000003","session_id":"da000000-0000-4000-8000-000000000303"}',true
);
select is(public.social_attachment_storage_access_allowed(
  'social-attachments',
  'da000000-0000-4000-8000-000000000003/vip-protected-comment.jpg'),false,
  '35. refund removes the attachment owner''s exact VIP parent authority');
select is((select count(*)::integer from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000003/vip-protected-comment.jpg'),0,
  '36. direct Storage RLS cannot reuse attachment ownership after VIP refund');
select is(public.social_attachment_storage_access_allowed(
  'social-attachments',
  'da000000-0000-4000-8000-000000000003/paid-protected-comment.jpg'),false,
  '37. revocation removes the attachment owner''s exact Paid Video parent authority');
select is((select count(*)::integer from storage.objects
  where bucket_id='social-attachments'
    and name='da000000-0000-4000-8000-000000000003/paid-protected-comment.jpg'),0,
  '38. direct Storage RLS cannot reuse attachment ownership after Paid Video revocation');
reset role;
select set_config('request.jwt.claims','{}',true);

select * from finish();
rollback;
