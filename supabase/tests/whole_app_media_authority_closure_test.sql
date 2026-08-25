begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(51);

select is(public.media_scan_public_safe('clean'), true,
  'only an explicit clean result is public-safe');
select is(public.media_scan_public_safe('manual_review'), false,
  'manual review is not automated malware approval');
select is(public.media_scan_public_safe('unknown'), false,
  'unknown scan state fails closed');
select is((select public from storage.buckets where id = 'profile-media'), false,
  'profile media bucket is private');
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'profile_media_storage_select_public'),
  0,
  'profile media has no public object-read policy'
);
select is(
  has_function_privilege('anon', 'public.monetization_write_audit(uuid,text,text,text,jsonb)', 'EXECUTE'),
  false,
  'anonymous callers cannot forge monetization audit evidence'
);
select is(
  has_function_privilege('authenticated', 'public.monetization_write_audit(uuid,text,text,text,jsonb)', 'EXECUTE'),
  false,
  'authenticated callers cannot forge monetization audit evidence'
);
select is(
  has_table_privilege('authenticated', 'public.media_upload_reservations', 'SELECT'),
  false,
  'clients cannot read upload reservations'
);
select is(
  has_table_privilege('authenticated', 'public.media_upload_reservations', 'INSERT'),
  false,
  'clients cannot manufacture upload reservations'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated', 'wholeapp-media-owner@example.test', '',
  transaction_timestamp(), '{"provider":"email","providers":["email"]}', '{}',
  transaction_timestamp(), transaction_timestamp(), false, false
) on conflict (id) do nothing;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-4222-8222-222222222222',
  'authenticated', 'authenticated', 'wholeapp-media-viewer@example.test', '',
  transaction_timestamp(), '{"provider":"email","providers":["email"]}', '{}',
  transaction_timestamp(), transaction_timestamp(), false, false
) on conflict (id) do nothing;

insert into public.user_entitlements (
  user_id, entitlement_key, status, source, starts_at, expires_at, metadata
) values (
  '11111111-1111-4111-8111-111111111111', 'premium', 'active', 'test_grant',
  transaction_timestamp(), transaction_timestamp() + interval '1 day',
  '{"fixture":"whole_app_media_authority_closure"}'::jsonb
) on conflict (user_id, entitlement_key) do update
set status = excluded.status, source = excluded.source, expires_at = excluded.expires_at;

insert into public.media_upload_reservations (
  owner_user_id, surface_type, storage_provider, storage_bucket,
  storage_object_key, expected_mime_type, expected_size_bytes, status,
  expires_at, observed_mime_type, observed_size_bytes, verified_at
) values (
  '11111111-1111-4111-8111-111111111111', 'creator_video', 'cloudflare_r2',
  'chillywood-media-origin',
  '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4',
  'video/mp4', 1024, 'verified', transaction_timestamp() + interval '1 hour',
  'video/mp4', 1024, transaction_timestamp()
);

insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values (
  'profile-media',
  '11111111-1111-4111-8111-111111111111/avatar/fresh.jpg',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '{"mimetype":"image/jpeg","size":1024}'::jsonb
) on conflict (bucket_id, name) do nothing;

set local request.jwt.claims =
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"wholeapp-media-owner@example.test"}';
set local role authenticated;

select lives_ok($sql$
  insert into public.videos (
    id, owner_id, title, visibility, moderation_status,
    storage_provider, storage_bucket, storage_object_key, storage_path,
    mime_type, file_size_bytes
  ) values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'Verified source', 'draft', 'clean', 'cloudflare_r2',
    'chillywood-media-origin',
    '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4',
    '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4',
    'video/mp4', 1024
  )
$sql$, 'an exact provider-verified upload may create its bound creator video');

reset role;
select is(
  (select attached_record_id from public.media_upload_reservations
   where storage_object_key like '%/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'the verified upload is bound to the exact media record'
);
set local role authenticated;

select lives_ok($sql$
  update public.videos
  set title = 'Safe title edit', updated_at = transaction_timestamp()
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
$sql$, 'owners retain safe descriptive video edits');

select throws_ok($sql$
  update public.videos
  set scan_status = 'clean', scan_result = 'client_forged'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
$sql$, '42501', 'creator_video_authority_fields_server_owned',
  'owners cannot forge creator-video scan authority');

select throws_ok($sql$
  insert into public.videos (
    id, owner_id, title, visibility, moderation_status,
    storage_provider, storage_bucket, storage_object_key, storage_path,
    mime_type, file_size_bytes
  ) values (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111',
    'Cross owner source', 'draft', 'clean', 'cloudflare_r2',
    'chillywood-media-origin',
    '22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source.mp4',
    '22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source.mp4',
    'video/mp4', 1024
  )
$sql$, '42501', 'creator_video_storage_provenance_invalid',
  'a creator video cannot bind another owners object key');

select throws_ok($sql$
  insert into public.videos (
    id, owner_id, title, visibility, moderation_status,
    storage_provider, storage_bucket, storage_object_key, storage_path,
    mime_type, file_size_bytes
  ) values (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111',
    'Unverified source', 'draft', 'clean', 'cloudflare_r2',
    'chillywood-media-origin',
    '11111111-1111-4111-8111-111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc/source.mp4',
    '11111111-1111-4111-8111-111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc/source.mp4',
    'video/mp4', 1024
  )
$sql$, '42501', 'creator_video_verified_upload_required',
  'external-origin metadata requires exact verified provider readback');

select lives_ok($sql$
  update public.user_profiles
  set avatar_url = 'https://bmkkhihfbmsnnmcqkoly.supabase.co/functions/v1/profile-media-public?ownerUserId=11111111-1111-4111-8111-111111111111&objectKey=11111111-1111-4111-8111-111111111111/avatar/fresh.jpg',
      profile_avatar_media_status = 'active',
      profile_avatar_scan_status = 'pending_scan',
      profile_avatar_scan_provider = 'clamav',
      profile_avatar_scan_result = null,
      profile_avatar_scanned_at = null,
      profile_avatar_scan_error = null
  where user_id = '11111111-1111-4111-8111-111111111111'
$sql$, 'an owner may bind a fresh owner-prefixed profile object as pending');

select is(
  (select avatar_url from public.user_profiles
   where user_id = '11111111-1111-4111-8111-111111111111'),
  'https://bmkkhihfbmsnnmcqkoly.supabase.co/functions/v1/profile-media-public?ownerUserId=11111111-1111-4111-8111-111111111111&objectKey=11111111-1111-4111-8111-111111111111/avatar/fresh.jpg',
  'profile media is stored only at the exact trusted project proxy origin'
);

select throws_ok($sql$
  update public.user_profiles
  set avatar_url = 'https://attacker.example/functions/v1/profile-media-public?ownerUserId=11111111-1111-4111-8111-111111111111&objectKey=11111111-1111-4111-8111-111111111111/avatar/fresh.jpg',
      profile_avatar_media_status = 'active',
      profile_avatar_scan_status = 'pending_scan'
  where user_id = '11111111-1111-4111-8111-111111111111'
$sql$, '42501', 'profile_avatar_storage_provenance_invalid',
  'a hostile URL origin cannot substitute mutable bytes for a scanned profile object');

select throws_ok($sql$
  update public.user_profiles
  set profile_avatar_scan_status = 'clean',
      profile_avatar_scan_result = 'client_forged'
  where user_id = '11111111-1111-4111-8111-111111111111'
$sql$, '42501', 'profile_avatar_scan_fields_server_owned',
  'profile owners cannot forge clean scan authority');

select is(
  (public.resolve_profile_media_delivery(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/avatar/fresh.jpg'
  )->>'allowed')::boolean,
  false,
  'pending profile media is not delivered even to an otherwise authorized viewer'
);

reset role;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}';
set local role service_role;
update public.user_profiles
set profile_avatar_scan_status = 'clean',
    profile_avatar_scan_provider = 'clamav',
    profile_avatar_scan_result = 'clean',
    profile_avatar_scanned_at = transaction_timestamp(),
    profile_avatar_scan_error = null
where user_id = '11111111-1111-4111-8111-111111111111';

reset role;
set local request.jwt.claims =
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","email":"wholeapp-media-viewer@example.test"}';
set local role authenticated;
select is(
  public.resolve_profile_media_delivery(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/avatar/fresh.jpg'
  )->>'reason',
  'profile_media_exact_clean',
  'an authorized viewer receives exact clean profile-media authority'
);
select is(
  public.resolve_profile_media_delivery(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/avatar/fresh.jpg'
  )->>'objectKey',
  '11111111-1111-4111-8111-111111111111/avatar/fresh.jpg',
  'profile-media authority is bound to the exact object key'
);
select is(
  (public.resolve_profile_media_delivery(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/background/fresh.jpg'
  )->>'allowed')::boolean,
  false,
  'clean avatar evidence cannot authorize a different background object'
);
select is(
  (public.resolve_profile_media_delivery(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111/avatar/fresh.jpg'
  )->>'allowed')::boolean,
  false,
  'cross-owner profile-media identity substitution fails closed'
);

set local request.jwt.claims =
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"wholeapp-media-owner@example.test"}';
set local role authenticated;

select throws_ok($sql$
  update public.user_profiles
  set avatar_url = 'https://bmkkhihfbmsnnmcqkoly.supabase.co/functions/v1/profile-media-public?ownerUserId=22222222-2222-4222-8222-222222222222&objectKey=22222222-2222-4222-8222-222222222222/avatar/stolen.jpg',
      profile_avatar_media_status = 'active',
      profile_avatar_scan_status = 'pending_scan'
  where user_id = '11111111-1111-4111-8111-111111111111'
$sql$, '42501', 'profile_avatar_storage_provenance_invalid',
  'profile media cannot bind another owners object key');

reset role;
insert into public.media_upload_reservations (
  owner_user_id, surface_type, storage_provider, storage_bucket,
  storage_object_key, expected_mime_type, expected_size_bytes, status,
  expires_at, observed_mime_type, observed_size_bytes, verified_at
) values (
  '11111111-1111-4111-8111-111111111111', 'creator_video', 'cloudflare_r2',
  'chillywood-media-origin',
  '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cover-fresh.jpg',
  'image/jpeg', 512, 'verified', transaction_timestamp() + interval '1 hour',
  'image/jpeg', 512, transaction_timestamp()
);
set local role authenticated;

select lives_ok($sql$
  update public.videos
  set thumb_storage_path = '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cover-fresh.jpg',
      thumb_url = null,
      updated_at = transaction_timestamp()
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
$sql$, 'an exact provider-verified cover may bind to its creator video');

reset role;
select is(
  (select count(*)::integer
   from public.media_scan_jobs
   where target_table = 'videos'
     and target_column = 'thumbnail'
     and target_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and storage_object_key like '%/cover-fresh.jpg'
     and status = 'pending_scan'),
  1,
  'a cover gets a distinct exact pending malware scan job'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}';
set local role service_role;
select lives_ok($sql$
  select public.complete_media_scan_job(
    (select id from public.media_scan_jobs
     where target_table = 'videos'
       and target_column = 'thumbnail'
       and target_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
       and storage_object_key like '%/cover-fresh.jpg'),
    'clean', 'clamav', 'test', 'test-signatures', null, null, 5
  )
$sql$, 'the trusted scanner may complete the exact cover job');

reset role;
select is(
  (select thumb_scan_status from public.videos
   where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'clean',
  'clean cover evidence projects only to the cover scan state'
);
select is(
  (select scan_status from public.videos
   where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'pending_scan',
  'a clean cover cannot overwrite the source video malware state'
);

insert into public.media_scan_jobs (
  target_table, target_column, target_id, owner_user_id,
  storage_provider, storage_bucket, storage_object_key,
  mime_type, size_bytes, status, claimed_by, claimed_at
) values (
  'videos', 'thumbnail', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111', 'cloudflare_r2',
  'wrong-origin-bucket',
  '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cover-fresh.jpg',
  'image/jpeg', 512, 'scanning', 'wrong-origin-test', transaction_timestamp()
);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}';
set local role service_role;
select lives_ok($sql$
  select public.complete_media_scan_job(
    (select id from public.media_scan_jobs
     where target_table = 'videos'
       and target_column = 'thumbnail'
       and storage_bucket = 'wrong-origin-bucket'),
    'malware_detected', 'clamav', 'test', 'test-signatures', 'test-malware', null, 5
  )
$sql$, 'a stale wrong-origin result is durably recorded without target authority');

reset role;
select is(
  (select thumb_scan_status from public.videos
   where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'clean',
  'a wrong provider/bucket scan result cannot overwrite exact cover state'
);
select is(
  (select metadata->>'targetPropagationComplete'
   from public.media_scan_jobs
   where target_table = 'videos'
     and target_column = 'thumbnail'
     and storage_bucket = 'wrong-origin-bucket'),
  'false',
  'wrong-origin completion is explicitly marked as non-propagating'
);

update public.videos
set scan_status = 'clean',
    scan_provider = 'clamav',
    scan_result = 'clean',
    scanned_at = transaction_timestamp(),
    visibility = 'public',
    updated_at = transaction_timestamp()
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

insert into public.creator_content_prices (
  creator_id, content_type, content_id, is_paid, price_cents, currency,
  status, provider, provider_product_id, provider_product_key, metadata
) values (
  '11111111-1111-4111-8111-111111111111', 'creator_video',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true, 499, 'usd', 'sandbox',
  'revenuecat_google_play', 'wholeapp-paid-video', 'wholeapp-paid-video', '{}'
);

insert into public.access_grants (
  user_id, grant_type, source_type, source_id, provider, environment, status,
  starts_at, expires_at, metadata
) values (
  '22222222-2222-4222-8222-222222222222', 'paid_content_access', 'setup',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'revenuecat_google_play', 'sandbox',
  'sandbox_only', transaction_timestamp() - interval '2 days',
  transaction_timestamp() - interval '1 day', '{}'
);
insert into public.content_access_grants (
  user_id, content_type, content_id, source, active
) values (
  '22222222-2222-4222-8222-222222222222', 'creator_video',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'purchase', true
);

set local request.jwt.claims =
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","email":"wholeapp-media-viewer@example.test"}';
set local role authenticated;
select is(
  (public.resolve_creator_content_access(
    'creator_video', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  )->>'allowed')::boolean,
  false,
  'an expired exact paid grant blocks even when a stale legacy boolean row remains active'
);

reset role;
insert into public.access_grants (
  user_id, grant_type, source_type, source_id, provider, environment, status,
  starts_at, expires_at, metadata
) values (
  '22222222-2222-4222-8222-222222222222', 'paid_content_access', 'setup',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'revenuecat_google_play', 'sandbox',
  'sandbox_only', transaction_timestamp() - interval '1 minute',
  transaction_timestamp() + interval '1 day', '{}'
);
set local role authenticated;
select is(
  public.resolve_creator_content_access(
    'creator_video', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  )->>'reason',
  'sandbox_grant',
  'a current exact sandbox grant authorizes only its bound viewer and content'
);

reset role;
update public.access_grants
set status = 'refunded',
    refunded_at = transaction_timestamp(),
    updated_at = transaction_timestamp()
where user_id = '22222222-2222-4222-8222-222222222222'
  and grant_type = 'paid_content_access'
  and status = 'sandbox_only'
  and expires_at > transaction_timestamp();
set local role authenticated;
select is(
  (public.resolve_creator_content_access(
    'creator_video', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  )->>'allowed')::boolean,
  false,
  'refund immediately removes paid media authority'
);

set local request.jwt.claims =
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"wholeapp-media-owner@example.test"}';
set local role authenticated;
select throws_ok($sql$
  update public.videos
  set thumb_scan_result = 'client_forged'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
$sql$, '42501', 'creator_video_authority_fields_server_owned',
  'owners cannot mutate exact cover scanner evidence');

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in (
       'creator_videos_storage_owner_update',
       'social_attachments_storage_owner_update',
       'profile_media_storage_update_owner_prefix',
       'platform_brand_storage_update_owner_prefix'
     )),
  0,
  'client storage overwrite policies are absent'
);

select is(
  (select count(*)::integer from pg_constraint
   where conrelid = 'public.media_security_audit_events'::regclass
     and conname = 'media_security_audit_events_action_check'
     and pg_get_constraintdef(oid) like '%verify_upload%'
     and pg_get_constraintdef(oid) like '%media_readability_result_recorded%'),
  1,
  'provider upload verification and non-authoritative readability are auditable actions'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.revoke_media_object_delivery(text,text,text,text,uuid,text,text,text)',
    'EXECUTE'
  ),
  false,
  'clients cannot revoke or manufacture media delivery provenance'
);
select is(
  has_function_privilege(
    'service_role',
    'public.revoke_media_object_delivery(text,text,text,text,uuid,text,text,text)',
    'EXECUTE'
  ),
  true,
  'the trusted media gateway may revoke exact delivery provenance'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}';
set local role service_role;
select is(
  (public.revoke_media_object_delivery(
    'creator_video', 'cloudflare_r2', 'chillywood-media-origin',
    '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4',
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null
  )->>'revoked')::boolean,
  false,
  'wrong-owner deletion cannot revoke another creators delivery provenance'
);
select is(
  public.revoke_media_object_delivery(
    'creator_video', 'cloudflare_r2', 'chillywood-media-origin',
    '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null
  )->>'source',
  'reservation',
  'exact deletion revokes the attached verified reservation before provider mutation'
);
select is(
  (select status from public.media_upload_reservations
   where storage_object_key like '%/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4'),
  'deleted',
  'revoked upload provenance is a durable deleted tombstone'
);
select is(
  (public.revoke_media_object_delivery(
    'creator_video', 'cloudflare_r2', 'chillywood-media-origin',
    '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null
  )->>'revoked')::boolean,
  true,
  'exact provider-delete retry is idempotent after authority revocation'
);

reset role;
set local request.jwt.claims =
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"wholeapp-media-owner@example.test"}';
set local role authenticated;
select is(
  public.consume_verified_media_upload(
    'creator_video', 'cloudflare_r2', 'chillywood-media-origin',
    '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4',
    'video/mp4', 1024, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  false,
  'a deleted key cannot be rebound even if an old presigned PUT recreates bytes'
);

reset role;
insert into public.media_upload_reservations (
  owner_user_id, surface_type, storage_provider, storage_bucket,
  storage_object_key, expected_mime_type, expected_size_bytes, status,
  expires_at, observed_mime_type, observed_size_bytes, verified_at
) values (
  '11111111-1111-4111-8111-111111111111', 'creator_video', 'cloudflare_r2',
  'chillywood-media-origin',
  '11111111-1111-4111-8111-111111111111/unattached-cleanup/source.mp4',
  'video/mp4', 128, 'verified', transaction_timestamp() + interval '1 hour',
  'video/mp4', 128, transaction_timestamp()
);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}';
set local role service_role;
select is(
  (public.revoke_media_object_delivery(
    'creator_video', 'cloudflare_r2', 'chillywood-media-origin',
    '11111111-1111-4111-8111-111111111111/unattached-cleanup/source.mp4',
    '11111111-1111-4111-8111-111111111111',
    null, null, null
  )->>'revoked')::boolean,
  true,
  'failed metadata cleanup revokes an unattached verified upload'
);
select is(
  (select status from public.media_upload_reservations
   where storage_object_key like '%/unattached-cleanup/source.mp4'),
  'deleted',
  'unattached cleanup also leaves a single-use deleted tombstone'
);

reset role;
insert into private.media_object_storage_migration_audit (
  migration_id, batch_id, table_name, row_id, source_type, source_id,
  new_storage_provider, new_storage_bucket, new_storage_object_key
) values
  (
    'whole-app-closure-test', 'whole-app-legacy-batch-a', 'videos',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'legacy_video',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'cloudflare_r2',
    'chillywood-media-origin', 'originals/whole-app-legacy-source.mp4'
  ),
  (
    'whole-app-closure-test', 'whole-app-legacy-batch-b', 'videos',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'legacy_video',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'cloudflare_r2',
    'chillywood-media-origin', 'originals/whole-app-legacy-source.mp4'
  );
insert into public.videos (
  id, owner_id, title, visibility, moderation_status,
  storage_provider, storage_bucket, storage_object_key, storage_path,
  mime_type, file_size_bytes
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '11111111-1111-4111-8111-111111111111',
  'Migrated legacy source', 'draft', 'clean', 'cloudflare_r2',
  'chillywood-media-origin', 'originals/whole-app-legacy-source.mp4',
  'originals/whole-app-legacy-source.mp4', 'video/mp4', 256
);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}';
set local role service_role;
select is(
  public.revoke_media_object_delivery(
    'creator_video', 'cloudflare_r2', 'chillywood-media-origin',
    'originals/whole-app-legacy-source.mp4',
    '11111111-1111-4111-8111-111111111111',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'videos', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  )->>'source',
  'migration_audit',
  'legacy provider deletion converts exact migration provenance to a tombstone'
);
reset role;
select is(
  (select count(*)::integer
   from private.media_object_storage_migration_audit
   where table_name = 'videos'
     and row_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
     and status = 'updated'),
  0,
  'all duplicate-batch active receipts are revoked atomically'
);
select is(
  (select count(*)::integer
   from public.media_upload_reservations
   where storage_provider = 'cloudflare_r2'
     and storage_bucket = 'chillywood-media-origin'
     and storage_object_key = 'originals/whole-app-legacy-source.mp4'
     and status = 'deleted'
     and attached_record_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  1,
  'legacy revocation leaves one exact single-use deleted reservation'
);

reset role;
select * from finish();
rollback;
