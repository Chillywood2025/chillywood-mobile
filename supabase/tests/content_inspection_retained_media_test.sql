-- Full local migrated database; synthetic fixtures only, all rolled back.
-- Real source deletion triggers, reservation consumer, scanner completion,
-- staging/revocation RPCs and inspection authority helpers remain installed.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(36);

insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
select ('c3300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'retained-inspection-'||n||'@example.test',now(),false,false from generate_series(1,5) n;
insert into auth.sessions(id,user_id,not_after)
select ('c4300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('c3300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now()+interval '1 day' from generate_series(1,5) n;
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,
 coalesce(nullif(lower(trim(p.channel_role)),''),'member'),d.capability,s.id::text,'service_reconciliation'
from auth.sessions s left join public.user_profiles p on p.user_id=s.user_id::text
cross join public.wave1_legal_document_versions d
where s.id::text like 'c4300000-%' and d.active and d.market='UNITED_STATES' and d.capability='account';
insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
select role,'c3300000-0000-4000-8000-'||lpad(n::text,12,'0'),'retained-inspection-'||n||'@example.test',
 'active','Synthetic retained inspection fixture','pgtap'
from (values(1,'owner'),(2,'super_admin'),(3,'operator'),(5,'owner')) r(n,role);

-- These helpers compose fixtures/caller claims only; no production predicate
-- or migration function is replaced, and no trigger is disabled.
create function pg_temp.retained_id(n integer) returns uuid language sql immutable as $$
 select ('c5300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.retained_claim(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','c3300000-0000-4000-8000-'||lpad(n::text,12,'0'),
  'session_id','c4300000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated',
  'email','retained-inspection-'||n||'@example.test')::text,true)::text;
$$;
create function pg_temp.retained_video(n integer,author_n integer default 4,ext text default 'mp4',replace_source boolean default false)
returns void language plpgsql as $$
declare u uuid:=('c3300000-0000-4000-8000-'||lpad(author_n::text,12,'0'))::uuid;
 t uuid:=pg_temp.retained_id(n); k text:=u::text||'/'||t::text||'/source.'||ext;
 mime text:=case ext when 'webm' then 'video/webm' else 'video/mp4' end;
 saved_claims text:=current_setting('request.jwt.claims',true);
begin
 insert into public.media_upload_reservations(owner_user_id,surface_type,storage_provider,storage_bucket,storage_object_key,
  expected_mime_type,expected_size_bytes,status,expires_at,observed_mime_type,observed_size_bytes,verified_at)
 values(u,'creator_video','cloudflare_r2','chillywood-media-origin',k,mime,1024,'verified',now()+interval '1 hour',mime,1024,now());
 if replace_source then
  update public.videos set storage_object_key=k,storage_path=k,mime_type=mime,file_size_bytes=1024,
   updated_at=clock_timestamp() where id=t;
 else
  insert into public.videos(id,owner_id,title,description,visibility,moderation_status,storage_provider,storage_bucket,
   storage_object_key,storage_path,mime_type,file_size_bytes,created_at)
  values(t,u,'Synthetic retained title '||n,'Final stored description','draft','clean','cloudflare_r2','chillywood-media-origin',
   k,k,mime,1024,clock_timestamp());
 end if;
 perform pg_temp.retained_claim(author_n);
 if not public.consume_verified_media_upload('creator_video','cloudflare_r2','chillywood-media-origin',k,mime,1024,t::text) then
  raise exception 'synthetic_reservation_consume_failed'; end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform public.complete_media_scan_job((select id from public.media_scan_jobs where target_table='videos' and target_column='source'
  and target_id=t::text and storage_object_key=k),'clean','clamav','synthetic','synthetic-signatures',null,null,5);
 if (select scan_status from public.videos where id=t) is distinct from 'clean' then raise exception 'synthetic_scan_projection_failed'; end if;
 perform set_config('request.jwt.claims',coalesce(saved_claims,''),true);
end;
$$;
create function pg_temp.retained_delete(n integer) returns void language plpgsql as $$
declare v public.videos%rowtype; response jsonb; saved_claims text:=current_setting('request.jwt.claims',true);
begin
 select * into strict v from public.videos where id=pg_temp.retained_id(n);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 response:=public.stage_deleted_content_media('creator_video',v.id::text,v.storage_provider,v.storage_bucket,v.storage_object_key,v.owner_id);
 if response->>'decision' is distinct from 'defer' then raise exception 'synthetic_stage_failed'; end if;
 response:=public.revoke_media_object_delivery('creator_video',v.storage_provider,v.storage_bucket,v.storage_object_key,v.owner_id,v.id::text,null,null);
 if response->>'revoked' is distinct from 'true' then raise exception 'synthetic_revoke_failed'; end if;
 delete from public.videos where id=v.id;
 perform set_config('request.jwt.claims',coalesce(saved_claims,''),true);
end;
$$;
create function pg_temp.retained_prepare(n integer,context_id uuid) returns jsonb language sql as $$
 select public.admin_prepare_content_inspection_media(context_id,'creator_video',pg_temp.retained_id(n)::text,'Synthetic retained review',gen_random_uuid());
$$;

select ok((select not capture_enabled and not media_staging_enabled from private.deleted_content_retention_settings),'retention remains disabled until test-only activation');
select ok(not has_table_privilege('authenticated','private.deleted_media_key_retirements','SELECT'),'clients cannot enumerate retained locators or proofs');
select ok(not has_table_privilege('service_role','private.deleted_media_key_retirements','UPDATE'),'gateway cannot forge finalized retained proof');
update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true;
update private.content_inspection_settings set enabled=true;
select pg_temp.retained_video(1);
select pg_temp.retained_video(2,5);
select pg_temp.retained_video(3);
select pg_temp.retained_video(4);
select pg_temp.retained_video(5);
select pg_temp.retained_video(6);
select pg_temp.retained_video(7);
select pg_temp.retained_claim(1);
set local role authenticated;
select set_config('test.retained.context',public.admin_create_content_inspection_context('Synthetic retained review',
 (select jsonb_agg(jsonb_build_object('targetType','creator_video','targetId',pg_temp.retained_id(n))) from generate_series(1,8) n),gen_random_uuid())->>'contextId',true);
select set_config('test.retained.grant',public.admin_grant_content_inspection_access(current_setting('test.retained.context')::uuid,'creator_video',
 pg_temp.retained_id(1)::text,'c3300000-0000-4000-8000-000000000003',clock_timestamp()+interval '1 hour',
 'Synthetic retained review',gen_random_uuid())->>'grantId',true);
reset role;

select lives_ok($$select pg_temp.retained_delete(1)$$,'canonical stage, provenance revoke and real hard delete capture ready proof');
select is((select count(*) from public.videos where id=pg_temp.retained_id(1)),0::bigint,'original source row is genuinely absent');
select ok((select status='retained' and inspection_proof is not null from private.deleted_media_key_retirements where target_id=pg_temp.retained_id(1)::text),'deletion finalizes exact immutable media proof');
select ok((select r.deletion_id=d.id and r.expires_at=d.expires_at and r.expires_at=r.deleted_at+interval '30 days'
 from private.deleted_media_key_retirements r join private.deleted_content_records d on d.id=r.deletion_id
 where r.target_id=pg_temp.retained_id(1)::text),'proof is bound to deletion identity and exact fixed thirty-day window');
select throws_ok($$update private.deleted_media_key_retirements set inspection_proof='{}' where target_id=pg_temp.retained_id(1)::text$$,
 'P0001','retirement_identity_immutable','finalized inspection proof cannot be rewritten');
select pg_temp.retained_claim(1);
set local role authenticated;
select set_config('test.retained.owner',pg_temp.retained_prepare(1,current_setting('test.retained.context')::uuid)::text,true);
select is(current_setting('test.retained.owner')::jsonb->>'availability','ready','Owner prepares retained original after actual deletion');
select ok(not(current_setting('test.retained.owner')::jsonb ?| array['provider','bucket','objectKey','url','signedUrl']),'retained prepare exposes no storage locator');
select is(public.admin_read_content_inspection(current_setting('test.retained.context')::uuid,'creator_video',pg_temp.retained_id(1)::text,
 'Synthetic retained review',gen_random_uuid())->>'availability','available_deleted','retained text and media refer to a genuine deletion');
select is(public.admin_read_content_inspection(current_setting('test.retained.context')::uuid,'creator_video',pg_temp.retained_id(1)::text,
 'Synthetic retained review',gen_random_uuid())->>'retainedMediaAvailability','prepare_required','retained reader advertises authorization step for eligible original');
select set_config('test.retained.authorization',public.admin_authorize_content_inspection_media(
 (current_setting('test.retained.owner')::jsonb->>'receiptId')::uuid,gen_random_uuid(),current_setting('test.retained.owner')::jsonb->>'storedVersion')::text,true);
reset role;
select ok((select r.expires_at<=d.expires_at from private.content_inspection_media_receipts r join private.deleted_content_records d
 on d.target_type=r.target_type and d.target_id=r.target_id::text where r.id=(current_setting('test.retained.owner')::jsonb->>'receiptId')::uuid),
 'receipt cannot outlive retained deletion expiry');
set local request.jwt.claims='{"role":"service_role"}';
set local role service_role;
select is(public.admin_resolve_content_inspection_media((current_setting('test.retained.authorization')::jsonb->>'authorizationId')::uuid,
 'c3300000-0000-4000-8000-000000000001','c4300000-0000-4000-8000-000000000001')->>'objectKey',
 'c3300000-0000-4000-8000-000000000004/c5300000-0000-4000-8000-000000000001/source.mp4','gateway resolves exact retained original after reservation revocation');
reset role;
update private.content_inspection_grants set expires_at=clock_timestamp()+interval '30 seconds'
 where id=current_setting('test.retained.grant')::uuid;
select set_config('test.retained.grant_deadline',(select expires_at::text from private.content_inspection_grants
 where id=current_setting('test.retained.grant')::uuid),true);
select pg_temp.retained_claim(3);
set local role authenticated;
select set_config('test.retained.operator',pg_temp.retained_prepare(1,current_setting('test.retained.context')::uuid)::text,true);
select is(current_setting('test.retained.operator')::jsonb->>'availability','ready','exact delegated operator can inspect ordinary retained target');
select ok((current_setting('test.retained.operator')::jsonb->>'expiresAt')::timestamptz<=current_setting('test.retained.grant_deadline')::timestamptz,
 'prepared retained receipt is capped by the exact thirty-second delegation expiry');
select pg_temp.retained_claim(1);
select public.admin_revoke_content_inspection_access(current_setting('test.retained.grant')::uuid,'Synthetic retained revoke',gen_random_uuid());
select pg_temp.retained_claim(3);
select throws_ok($$select public.admin_authorize_content_inspection_media((current_setting('test.retained.operator')::jsonb->>'receiptId')::uuid,
 gen_random_uuid(),current_setting('test.retained.operator')::jsonb->>'storedVersion')$$,'42501','content_inspection_denied','revoking exact delegation invalidates retained receipt');
reset role;
update private.content_inspection_media_receipts set expires_at=clock_timestamp()-interval '1 second'
 where id=(current_setting('test.retained.owner')::jsonb->>'receiptId')::uuid;
select pg_temp.retained_claim(1);
set local role authenticated;
select throws_ok($$select public.admin_authorize_content_inspection_media((current_setting('test.retained.owner')::jsonb->>'receiptId')::uuid,
 gen_random_uuid(),current_setting('test.retained.owner')::jsonb->>'storedVersion')$$,'42501','content_inspection_denied','expired retained Owner receipt cannot authorize');
reset role;

select pg_temp.retained_delete(2);
select ok((select owner_protected from private.deleted_content_records where target_id=pg_temp.retained_id(2)::text),'deletion captures immutable Owner protection');
delete from public.platform_role_memberships where user_id='c3300000-0000-4000-8000-000000000005' and role='owner';
select is((select count(*) from public.platform_role_memberships where user_id='c3300000-0000-4000-8000-000000000005' and role='owner'),0::bigint,
 'protected author now has no Owner membership row');
select pg_temp.retained_claim(2);
set local role authenticated;
select set_config('test.retained.sa_context',public.admin_create_content_inspection_context('Synthetic protected review',
 jsonb_build_array(jsonb_build_object('targetType','creator_video','targetId',pg_temp.retained_id(2))),gen_random_uuid())->>'contextId',true);
select throws_ok($$select pg_temp.retained_prepare(2,current_setting('test.retained.sa_context')::uuid)$$,'42501','content_inspection_denied',
 'immutable deletion protection survives removal of source author Owner role');
select pg_temp.retained_claim(1);
select is(pg_temp.retained_prepare(2,current_setting('test.retained.context')::uuid)->>'availability','ready','exact Owner retains access to protected retained original');
reset role;

select pg_temp.retained_delete(3);
select pg_temp.retained_claim(1);
set local role authenticated;
select set_config('test.retained.recreated',pg_temp.retained_prepare(3,current_setting('test.retained.context')::uuid)::text,true);
reset role;
select pg_temp.retained_video(3,4,'webm');
select pg_temp.retained_claim(1);
set local role authenticated;
select throws_ok($$select public.admin_authorize_content_inspection_media((current_setting('test.retained.recreated')::jsonb->>'receiptId')::uuid,
 gen_random_uuid(),current_setting('test.retained.recreated')::jsonb->>'storedVersion')$$,'42501','content_inspection_stale_version','new current incarnation cannot inherit old retained receipt');
select is(pg_temp.retained_prepare(3,current_setting('test.retained.context')::uuid)->>'mimeType','video/webm','recreated current original takes precedence over retained mp4');
reset role;
update public.videos set quarantined_at=clock_timestamp() where id=pg_temp.retained_id(3);
select pg_temp.retained_claim(1);
set local role authenticated;
select is(pg_temp.retained_prepare(3,current_setting('test.retained.context')::uuid)->>'availability','unsupported_media_inspection',
 'unclean recreated current source cannot fall back to older retained bytes');
reset role;

-- Stage an original, replace it before metadata deletion, and do not stage the
-- replacement. This is ordinary edit history, not the deleted original proof.
set local request.jwt.claims='{"role":"service_role"}';
select public.stage_deleted_content_media('creator_video',pg_temp.retained_id(4)::text,'cloudflare_r2','chillywood-media-origin',
 'c3300000-0000-4000-8000-000000000004/c5300000-0000-4000-8000-000000000004/source.mp4','c3300000-0000-4000-8000-000000000004');
select pg_temp.retained_video(4,4,'webm',true);
delete from public.videos where id=pg_temp.retained_id(4);
select ok((select inspection_proof is null from private.deleted_media_key_retirements where target_id=pg_temp.retained_id(4)::text),
 'source replaced after staging never receives a finalized deleted-original proof');
select pg_temp.retained_claim(1);
set local role authenticated;
select is(pg_temp.retained_prepare(4,current_setting('test.retained.context')::uuid)->>'availability','unsupported_media_inspection',
 'a replaced staged original is never exposed as retained edit history');
reset role;

-- Fail-closed proof variants use the actual stage/revoke/delete flow.
update public.media_scan_jobs set status='manual_review' where target_table='videos' and target_column='source' and target_id=pg_temp.retained_id(5)::text;
update public.videos set quarantined_at=clock_timestamp() where id=pg_temp.retained_id(6);
update public.media_upload_reservations set expected_size_bytes=2048 where attached_record_id=pg_temp.retained_id(7)::text;
select pg_temp.retained_delete(5);
select pg_temp.retained_delete(6);
select pg_temp.retained_delete(7);
select is((select count(*) from private.deleted_media_key_retirements where target_id in
 (pg_temp.retained_id(5)::text,pg_temp.retained_id(6)::text,pg_temp.retained_id(7)::text)
 and staged_inspection_proof is null and inspection_proof is null),3::bigint,'non-clean scan, quarantine and inconsistent verified size produce no staged or final inspection proof');
select pg_temp.retained_claim(1);
set local role authenticated;
select is(pg_temp.retained_prepare(5,current_setting('test.retained.context')::uuid)->>'availability','unsupported_media_inspection','missing exact clean scan fails closed after deletion');
select is(pg_temp.retained_prepare(6,current_setting('test.retained.context')::uuid)->>'availability','unsupported_media_inspection','quarantined original fails closed after deletion');
select is(pg_temp.retained_prepare(7,current_setting('test.retained.context')::uuid)->>'availability','unsupported_media_inspection','mismatched reservation proof fails closed after deletion');
reset role;

-- Explicit historical trusted-database fixture for elapsed thirty-day expiry.
-- The ready lifecycle above used real deletion clocks. This separately seeds a
-- complete old archive/proof without changing clocks, disabling immutability,
-- replacing helpers, or pretending that thirty days passed during this test.
do $$
declare d uuid:=gen_random_uuid(); stage uuid:=gen_random_uuid(); reservation uuid:=gen_random_uuid();
 t text:=pg_temp.retained_id(8)::text; a text:='c3300000-0000-4000-8000-000000000004';
 k text:=a||'/'||t||'/source.mp4'; deleted timestamptz:=clock_timestamp()-interval '31 days'; proof jsonb;
begin
 select inspection_proof-array['storedVersion','mediaKind'] into strict proof
 from private.deleted_media_key_retirements where target_id=pg_temp.retained_id(1)::text;
 proof:=proof||jsonb_build_object('targetId',t,'objectKey',k,'reservationId',reservation,
  'scanId',gen_random_uuid(),'scanUpdatedAt',deleted-interval '1 day','reservationUpdatedAt',deleted-interval '1 day');
 proof:=proof||jsonb_build_object('storedVersion',md5(proof::text),'mediaKind','video');
 insert into private.deleted_content_records(id,target_type,target_id,author,owner_protected,content,deletion_kind,deleted_at,expires_at)
 values(d,'creator_video',t,a,false,'{"title":"Synthetic historical expired original"}','hard',deleted,deleted+interval '30 days');
 insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,reservation_id,staged_at,reconcile_after,deletion_id)
 values(stage,'creator_video',t,a,'cloudflare_r2','chillywood-media-origin',k,reservation,deleted,deleted+interval '1 hour',d);
 insert into private.deleted_media_key_retirements(stage_id,provider,bucket,object_key,target_type,target_id,author,reservation_id,
  verified_at,attached_at,status,deletion_id,deleted_at,expires_at,staged_inspection_proof,inspection_proof,inspection_proof_fingerprint)
 values(stage,'cloudflare_r2','chillywood-media-origin',k,'creator_video',t,a,reservation,
  deleted-interval '1 day',deleted-interval '1 day','retained',d,deleted,deleted+interval '30 days',proof,proof,md5(proof::text));
end;
$$;
select ok((select inspection_proof is not null and inspection_proof_fingerprint=md5(inspection_proof::text)
 and expires_at=deleted_at+interval '30 days' and expires_at<clock_timestamp()
 from private.deleted_media_key_retirements where target_id=pg_temp.retained_id(8)::text),'historical fixture has complete proof but immutable window already elapsed');
select ok(private.content_inspection_media_binding('creator_video',pg_temp.retained_id(8)) is null,'elapsed retained media window fails closed despite complete historical proof');
select pg_temp.retained_claim(1);
set local role authenticated;
select is(pg_temp.retained_prepare(8,current_setting('test.retained.context')::uuid)->>'availability','unsupported_media_inspection','Owner cannot prepare elapsed retained bytes');
select is(public.admin_read_content_inspection(current_setting('test.retained.context')::uuid,'creator_video',pg_temp.retained_id(8)::text,
 'Synthetic retained review',gen_random_uuid())->>'availability','unavailable_current','expired archive text is unavailable with expired media');
reset role;
select is((select count(*) from private.content_inspection_media_receipts where target_id=pg_temp.retained_id(8)),0::bigint,'expired retained target minted no receipt');

select * from finish();
rollback;
