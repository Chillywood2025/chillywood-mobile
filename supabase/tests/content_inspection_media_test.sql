-- Canonical database contracts only: no provider bytes are uploaded or fetched.
-- Real session/legal/role helpers and real reservation/scanner functions remain
-- installed and enabled throughout. All synthetic fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(46);

select has_table('private','content_inspection_media_receipts','media receipts exist');
select has_table('private','content_inspection_media_authorizations','one-use authorizations exist');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
  where oid in ('private.content_inspection_media_receipts'::regclass,'private.content_inspection_media_authorizations'::regclass)),
  'both media tables enforce RLS and FORCE RLS');
select ok(not has_table_privilege('authenticated','private.content_inspection_media_receipts','SELECT'),'clients cannot enumerate receipts');
select ok(not has_table_privilege('authenticated','private.content_inspection_media_receipts','INSERT'),'clients cannot forge receipts');
select ok(not has_table_privilege('service_role','private.content_inspection_media_authorizations','UPDATE'),'gateway cannot alter authorization rows directly');
select ok(not has_function_privilege('authenticated','private.content_inspection_media_binding(text,uuid)','EXECUTE'),'binding helper is private');
select ok(not has_function_privilege('service_role','private.content_inspection_media_receipt_valid(private.content_inspection_media_receipts)','EXECUTE'),'validity helper is private');
select ok(not has_function_privilege('anon','public.admin_prepare_content_inspection_media(uuid,text,text,text,uuid)','EXECUTE'),'anonymous prepare forbidden');
select ok(not has_function_privilege('authenticated','public.admin_resolve_content_inspection_media(uuid,uuid,text)','EXECUTE'),'client cannot resolve storage locators');
select ok(has_function_privilege('service_role','public.admin_resolve_content_inspection_media(uuid,uuid,text)','EXECUTE'),'only gateway receives resolver grant');
select ok(not has_function_privilege('service_role','public.admin_authorize_content_inspection_media(uuid,uuid,text)','EXECUTE'),'gateway cannot mint caller authorizations');
select ok(not (select enabled from private.content_inspection_settings where singleton),'feature starts disabled');

insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
select ('b3100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'inspection-media-'||n||'@example.test',now(),false,false from generate_series(1,5) n;
insert into auth.sessions(id,user_id,not_after)
select ('b4100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('b3100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now()+interval '1 day' from generate_series(1,5) n;
-- A second real session for the same operator must not inherit its receipt.
insert into auth.sessions(id,user_id,not_after) values
  ('b4100000-0000-4000-8000-000000000006','b3100000-0000-4000-8000-000000000003',now()+interval '1 day');
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,
  coalesce(nullif(lower(trim(p.channel_role)),''),'member'),d.capability,s.id::text,'service_reconciliation'
from auth.sessions s left join public.user_profiles p on p.user_id=s.user_id::text
cross join public.wave1_legal_document_versions d
where s.id::text like 'b4100000-%' and d.active and d.market='UNITED_STATES' and d.capability='account';
insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
select role,'b3100000-0000-4000-8000-'||lpad(n::text,12,'0'),'inspection-media-'||n||'@example.test','active','Synthetic media inspection fixture','pgtap'
from (values(1,'owner'),(2,'super_admin'),(3,'operator'),(4,'operator')) r(n,role);

-- This helper only sets normal caller claims; it replaces no authority code.
create function pg_temp.inspection_media_claim(n integer, s integer default null) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub','b3100000-0000-4000-8000-'||lpad(n::text,12,'0'),
    'session_id','b4100000-0000-4000-8000-'||lpad(coalesce(s,n)::text,12,'0'),'role','authenticated',
    'email','inspection-media-'||n||'@example.test')::text,true)::text;
$$;

-- Seed provider-readback evidence, then bind it using the production consumer.
insert into public.media_upload_reservations(owner_user_id,surface_type,storage_provider,storage_bucket,storage_object_key,
  expected_mime_type,expected_size_bytes,status,expires_at,observed_mime_type,observed_size_bytes,verified_at)
values('b3100000-0000-4000-8000-000000000005','creator_video','cloudflare_r2','chillywood-media-origin',
  'b3100000-0000-4000-8000-000000000005/b5100000-0000-4000-8000-000000000001/source.mp4',
  'video/mp4',1024,'verified',now()+interval '1 hour','video/mp4',1024,now());
-- Source fixtures are inserted as the migration owner; no triggers are disabled.
insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
values('b5100000-0000-4000-8000-000000000001','b3100000-0000-4000-8000-000000000005','Exact original media','draft','clean',
  'cloudflare_r2','chillywood-media-origin',
  'b3100000-0000-4000-8000-000000000005/b5100000-0000-4000-8000-000000000001/source.mp4',
  'b3100000-0000-4000-8000-000000000005/b5100000-0000-4000-8000-000000000001/source.mp4','video/mp4',1024);
select pg_temp.inspection_media_claim(5);
set local role authenticated;
select ok(public.consume_verified_media_upload('creator_video','cloudflare_r2','chillywood-media-origin',
  'b3100000-0000-4000-8000-000000000005/b5100000-0000-4000-8000-000000000001/source.mp4','video/mp4',1024,
  'b5100000-0000-4000-8000-000000000001'),'real consumer attaches verified reservation to exact source');
reset role;
select is((select count(*) from public.media_scan_jobs where target_table='videos' and target_column='source'
  and target_id='b5100000-0000-4000-8000-000000000001'),1::bigint,'source insert enqueues exact real scan job');
set local request.jwt.claims='{"role":"service_role"}';
set local role service_role;
select lives_ok($$select public.complete_media_scan_job((select id from public.media_scan_jobs where target_table='videos'
  and target_column='source' and target_id='b5100000-0000-4000-8000-000000000001'),
  'clean','clamav','synthetic','synthetic-signatures',null,null,5)$$,'trusted scanner completes exact source job');
reset role;
select is((select scan_status from public.videos where id='b5100000-0000-4000-8000-000000000001'),'clean','real scanner propagates clean source state');
select is(private.content_inspection_media_binding('creator_video','b5100000-0000-4000-8000-000000000001')->>'sizeBytes','1024','verified source binding uses exact observed size');

update private.content_inspection_settings set enabled=true;
select pg_temp.inspection_media_claim(1);
set local role authenticated;
select set_config('test.media.context',public.admin_create_content_inspection_context('Synthetic media review',
  '[{"targetType":"creator_video","targetId":"b5100000-0000-4000-8000-000000000001"},{"targetType":"creator_video","targetId":"b5100000-0000-4000-8000-000000000002"}]',gen_random_uuid())->>'contextId',true);
reset role;
update private.content_inspection_settings set enabled=false;
set local role authenticated;
select throws_ok($$select public.admin_prepare_content_inspection_media(current_setting('test.media.context')::uuid,'creator_video',
  'b5100000-0000-4000-8000-000000000001','Synthetic media review',gen_random_uuid())$$,'42501','content_inspection_disabled','disabled flag blocks even Owner media preparation');
reset role;
update private.content_inspection_settings set enabled=true;
set local role authenticated;
select throws_ok($$select public.admin_prepare_content_inspection_media(current_setting('test.media.context')::uuid,'profile_post',
  'b5100000-0000-4000-8000-000000000001','Synthetic media review',gen_random_uuid())$$,'22023','content_inspection_unsupported_target','text target cannot nominate a media adapter');
select throws_ok($$select public.admin_prepare_content_inspection_media(current_setting('test.media.context')::uuid,'creator_video',
  'b5100000-0000-4000-8000-000000000099','Synthetic media review',gen_random_uuid())$$,'42501','content_inspection_denied','out-of-context media target denied');
select is(public.admin_prepare_content_inspection_media(current_setting('test.media.context')::uuid,'creator_video',
  'b5100000-0000-4000-8000-000000000002','Synthetic media review',gen_random_uuid()),
  '{"availability":"unsupported_media_inspection"}'::jsonb,'missing retained bytes return only explicit unsupported envelope');
select set_config('test.media.owner',public.admin_prepare_content_inspection_media(current_setting('test.media.context')::uuid,'creator_video',
  'b5100000-0000-4000-8000-000000000001','Synthetic media review',gen_random_uuid())::text,true);
select is(current_setting('test.media.owner')::jsonb->>'availability','ready','verified clean original is ready for Owner');
select ok(not (current_setting('test.media.owner')::jsonb ?| array['provider','bucket','objectKey','url','signedUrl']),'prepare response exposes no storage locator or bearer URL');
select is(current_setting('test.media.owner')::jsonb->>'mimeType','video/mp4','prepare preserves exact verified MIME');
select is(current_setting('test.media.owner')::jsonb->>'mediaKind','video','prepare identifies verified media kind');
select set_config('test.media.authorization',public.admin_authorize_content_inspection_media(
  (current_setting('test.media.owner')::jsonb->>'receiptId')::uuid,gen_random_uuid(),current_setting('test.media.owner')::jsonb->>'storedVersion')::text,true);
select is(current_setting('test.media.authorization')::jsonb->>'allowed','true','exact Owner receipt authorizes');
reset role;
select is((select count(*) from private.content_inspection_access_events where actor='b3100000-0000-4000-8000-000000000001'
  and operation in ('prepare_media','authorize_media')),0::bigint,'exact Owner media views remain inspection-event exempt');
select is((select count(*) from private.content_inspection_media_receipts where actor='b3100000-0000-4000-8000-000000000001'),1::bigint,'Owner exemption still requires actor-bound operational receipt');
set local request.jwt.claims='{"role":"service_role"}';
set local role service_role;
select throws_ok($$select public.admin_resolve_content_inspection_media((current_setting('test.media.authorization')::jsonb->>'authorizationId')::uuid,
  'b3100000-0000-4000-8000-000000000004','b4100000-0000-4000-8000-000000000004')$$,'42501','content_inspection_denied','gateway cannot substitute receipt actor');
select throws_ok($$select public.admin_resolve_content_inspection_media((current_setting('test.media.authorization')::jsonb->>'authorizationId')::uuid,
  'b3100000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000004')$$,'42501','content_inspection_denied','gateway cannot substitute exact session generation');
select set_config('test.media.resolved',public.admin_resolve_content_inspection_media(
  (current_setting('test.media.authorization')::jsonb->>'authorizationId')::uuid,
  'b3100000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001')::text,true);
select is(current_setting('test.media.resolved')::jsonb->>'objectKey',
  'b3100000-0000-4000-8000-000000000005/b5100000-0000-4000-8000-000000000001/source.mp4','gateway resolves only exact original object');
select is(current_setting('test.media.resolved')::jsonb->>'storedVersion',current_setting('test.media.owner')::jsonb->>'storedVersion','resolved version matches prepared version');
select throws_ok($$select public.admin_resolve_content_inspection_media((current_setting('test.media.authorization')::jsonb->>'authorizationId')::uuid,
  'b3100000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001')$$,'42501','content_inspection_denied','consumed gateway authorization cannot replay');

reset role;
select pg_temp.inspection_media_claim(2);
set local role authenticated;
select throws_ok($$select public.admin_prepare_content_inspection_media(current_setting('test.media.context')::uuid,'creator_video',
  'b5100000-0000-4000-8000-000000000001','Synthetic media review',gen_random_uuid())$$,'42501','content_inspection_denied','Super Admin cannot read Owner private context implicitly');
select pg_temp.inspection_media_claim(3);
select throws_ok($$select public.admin_prepare_content_inspection_media(current_setting('test.media.context')::uuid,'creator_video',
  'b5100000-0000-4000-8000-000000000001','Synthetic media review',gen_random_uuid())$$,'42501','content_inspection_denied','operator needs exact delegated target');
select pg_temp.inspection_media_claim(1);
select set_config('test.media.grant',public.admin_grant_content_inspection_access(current_setting('test.media.context')::uuid,'creator_video',
  'b5100000-0000-4000-8000-000000000001','b3100000-0000-4000-8000-000000000003',clock_timestamp()+interval '1 hour',
  'Synthetic media review',gen_random_uuid())->>'grantId',true);
select pg_temp.inspection_media_claim(3);
select set_config('test.media.operator',public.admin_prepare_content_inspection_media(current_setting('test.media.context')::uuid,'creator_video',
  'b5100000-0000-4000-8000-000000000001','Synthetic media review',gen_random_uuid())::text,true);
select is(current_setting('test.media.operator')::jsonb->>'availability','ready','exact delegated operator can prepare verified original');
reset role;
select is((select count(*) from private.content_inspection_access_events where actor='b3100000-0000-4000-8000-000000000003'
  and operation='prepare_media' and grant_id=current_setting('test.media.grant')::uuid and grant_revision=1),1::bigint,'operator prepare event binds exact grant revision');
set local role authenticated;
select pg_temp.inspection_media_claim(4);
select throws_ok($$select public.admin_authorize_content_inspection_media((current_setting('test.media.operator')::jsonb->>'receiptId')::uuid,
  gen_random_uuid(),current_setting('test.media.operator')::jsonb->>'storedVersion')$$,'42501','content_inspection_denied','another valid operator cannot impersonate receipt owner');
select pg_temp.inspection_media_claim(3,6);
select throws_ok($$select public.admin_authorize_content_inspection_media((current_setting('test.media.operator')::jsonb->>'receiptId')::uuid,
  gen_random_uuid(),current_setting('test.media.operator')::jsonb->>'storedVersion')$$,'42501','content_inspection_denied','same actor with different valid session cannot reuse receipt');
select pg_temp.inspection_media_claim(3);
select throws_ok($$select public.admin_authorize_content_inspection_media((current_setting('test.media.operator')::jsonb->>'receiptId')::uuid,
  gen_random_uuid(),'wrong-version')$$,'42501','content_inspection_stale_version','caller must echo exact prepared version');
reset role;
update private.content_inspection_media_receipts set expires_at=clock_timestamp()-interval '1 second'
  where id=(current_setting('test.media.operator')::jsonb->>'receiptId')::uuid;
set local role authenticated;
select throws_ok($$select public.admin_authorize_content_inspection_media((current_setting('test.media.operator')::jsonb->>'receiptId')::uuid,
  gen_random_uuid(),current_setting('test.media.operator')::jsonb->>'storedVersion')$$,'42501','content_inspection_denied','expired receipt cannot authorize');
select set_config('test.media.operator',public.admin_prepare_content_inspection_media(current_setting('test.media.context')::uuid,'creator_video',
  'b5100000-0000-4000-8000-000000000001','Synthetic media review',gen_random_uuid())::text,true);
select pg_temp.inspection_media_claim(1);
select public.admin_revoke_content_inspection_access(current_setting('test.media.grant')::uuid,'Synthetic media revoke',gen_random_uuid());
select pg_temp.inspection_media_claim(3);
select throws_ok($$select public.admin_authorize_content_inspection_media((current_setting('test.media.operator')::jsonb->>'receiptId')::uuid,
  gen_random_uuid(),current_setting('test.media.operator')::jsonb->>'storedVersion')$$,'42501','content_inspection_denied','committed grant revoke invalidates previously prepared media');

reset role;
update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='b4100000-0000-4000-8000-000000000001';
select pg_temp.inspection_media_claim(1);
set local role authenticated;
select throws_ok($$select public.admin_authorize_content_inspection_media((current_setting('test.media.owner')::jsonb->>'receiptId')::uuid,
  gen_random_uuid(),current_setting('test.media.owner')::jsonb->>'storedVersion')$$,'42501','content_inspection_denied','Owner audit exemption never waives exact session validity');
reset role;
update auth.sessions set not_after=clock_timestamp()+interval '1 day' where id='b4100000-0000-4000-8000-000000000001';
-- Removing clean scan authority fails closed without altering any adapter.
update public.media_scan_jobs set status='manual_review' where target_table='videos' and target_column='source'
  and target_id='b5100000-0000-4000-8000-000000000001';
set local role authenticated;
select is(public.admin_prepare_content_inspection_media(current_setting('test.media.context')::uuid,'creator_video',
  'b5100000-0000-4000-8000-000000000001','Synthetic media review',gen_random_uuid())->>'availability',
  'unsupported_media_inspection','clean source flag without matching clean scan cannot authorize bytes');
select throws_ok($$select public.admin_authorize_content_inspection_media((current_setting('test.media.owner')::jsonb->>'receiptId')::uuid,
  gen_random_uuid(),current_setting('test.media.owner')::jsonb->>'storedVersion')$$,'42501','content_inspection_stale_version','receipt cannot outlive exact verified scan binding');
reset role;
select * from finish();
rollback;
