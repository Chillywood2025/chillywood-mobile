-- Full migrated disposable PostgreSQL; real source/session/provenance triggers.
-- Only synthetic fixtures and deployment evidence; every mutation rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- Repository seed, not user data; scoped deletion stays inside this rollback.
delete from public.videos where id='6e1c3405-7db8-4cb2-98f3-5a7642e82126'
 and title='Chi''llywood Originals Proof Fixture' and storage_provider='supabase';
delete from public.media_scan_jobs
 where target_table='videos' and target_id='6e1c3405-7db8-4cb2-98f3-5a7642e82126';

insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
select ('e3300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'delete-intent-'||n||'@example.test',now(),false,false from generate_series(1,2) n;
insert into auth.sessions(id,user_id,not_after)
select ('e4300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('e3300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now()+interval '1 day' from generate_series(1,2) n;
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,
 coalesce(nullif(lower(trim(p.channel_role)),''),'member'),d.capability,s.id::text,'service_reconciliation'
from auth.sessions s left join public.user_profiles p on p.user_id=s.user_id::text
cross join public.wave1_legal_document_versions d
where s.id::text like 'e4300000-%' and d.active and d.market='UNITED_STATES' and d.capability='account';

create function pg_temp.intent_id(n integer) returns uuid language sql immutable as $$
 select ('e5300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.intent_claim(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','e3300000-0000-4000-8000-'||lpad(n::text,12,'0'),
  'session_id','e4300000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated',
  'email','delete-intent-'||n||'@example.test')::text,true)::text
$$;
create function pg_temp.intent_video(n integer,ext text default 'mp4',replace_source boolean default false) returns void
language plpgsql as $$
declare u uuid:='e3300000-0000-4000-8000-000000000001'; t uuid:=pg_temp.intent_id(n);
 k text:=u::text||'/'||t::text||'/source.'||ext;
begin
 insert into public.media_upload_reservations(owner_user_id,surface_type,storage_provider,storage_bucket,storage_object_key,
  expected_mime_type,expected_size_bytes,status,expires_at,observed_mime_type,observed_size_bytes,verified_at)
 values(u,'creator_video','cloudflare_r2','chillywood-media-origin',k,'video/mp4',1024,'verified',
  clock_timestamp()+interval '1 hour','video/mp4',1024,clock_timestamp());
 if replace_source then
  update public.videos set storage_object_key=k,storage_path=k,updated_at=clock_timestamp() where id=t;
 else
  insert into public.videos(id,owner_id,title,description,visibility,moderation_status,storage_provider,storage_bucket,
   storage_object_key,storage_path,mime_type,file_size_bytes,created_at)
  values(t,u,'Synthetic delete intent','Current body','draft','clean','cloudflare_r2','chillywood-media-origin',
   k,k,'video/mp4',1024,clock_timestamp());
 end if;
 perform pg_temp.intent_claim(1);
 if not public.consume_verified_media_upload('creator_video','cloudflare_r2','chillywood-media-origin',k,'video/mp4',1024,t::text) then
  raise exception 'synthetic_reservation_consume_failed';
 end if;
end $$;
create function pg_temp.intent_delete(n integer,created_at timestamptz,ext text default 'mp4') returns jsonb language sql as $$
 select public.delete_retained_content('creator_video',pg_temp.intent_id(n),'cloudflare_r2','chillywood-media-origin',
  'e3300000-0000-4000-8000-000000000001/'||pg_temp.intent_id(n)::text||'/source.'||ext,created_at)
$$;

select ok(not has_function_privilege('anon','public.delete_retained_content(text,uuid,text,text,text,timestamptz)','EXECUTE'),'anonymous callers cannot issue content deletion');
select ok(not has_function_privilege('service_role','public.delete_retained_content(text,uuid,text,text,text,timestamptz)','EXECUTE'),'service caller cannot self-attest owner deletion authority');
select ok(not has_function_privilege('authenticated','private.stage_deleted_content_media_internal(text,text,text,text,text,uuid)','EXECUTE'),'consumers cannot directly stage media');
select pg_temp.intent_video(1);
select set_config('test.intent.created',created_at::text,true) from public.videos where id=pg_temp.intent_id(1);
set local role authenticated;
select is(pg_temp.intent_delete(1,current_setting('test.intent.created')::timestamptz)->>'status','disabled','inactive endpoint explicitly preserves legacy client flow');
select is(pg_temp.intent_delete(1,null)->>'status','disabled','inactive unretired source adds no new incarnation requirement');
reset role;
select ok(exists(select 1 from public.videos where id=pg_temp.intent_id(1)),'disabled endpoint does not remove source');
select is((select count(*) from private.deleted_content_media_stages where target_id=pg_temp.intent_id(1)::text),0::bigint,'disabled endpoint creates no stage');

-- Qualification rows are explicit synthetic setup, never inferred from an R2
-- preference. The same inventory, session and source guards remain installed.
update private.deleted_content_retention_settings set legacy_object_deletes_blocked=true;
update private.deleted_content_rollout_qualification set source_revision=repeat('a',40),
 client_enforcement_evidence='synthetic explicit endpoint rollout qualification',
 legacy_delete_drain_evidence='synthetic disposable test with no gateway requests in flight',
 worker_schedule_evidence='synthetic disabled disposable-worker qualification',
 origin_cleanup_evidence='synthetic isolated origin cleanup qualification',qualified_at=clock_timestamp();
select public.record_deleted_content_worker_heartbeat();
update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true;

select throws_ok(
 $$select public.stage_deleted_content_media('creator_video',pg_temp.intent_id(1)::text,'cloudflare_r2','chillywood-media-origin',
 'e3300000-0000-4000-8000-000000000001/'||pg_temp.intent_id(1)::text||'/source.mp4')$$,
 '55000','explicit_content_delete_required','old object-delete request cannot stage or delete a whole parent');
select throws_ok(
 $$select public.stage_deleted_content_media('creator_video',null,'cloudflare_r2','chillywood-media-origin',
 'e3300000-0000-4000-8000-000000000001/'||pg_temp.intent_id(1)::text||'/source.mp4','e3300000-0000-4000-8000-000000000001')$$,
 '55000','explicit_content_delete_required','omitted record ID cannot bypass active retention');
select pg_temp.intent_claim(2);
set local role authenticated;
select throws_ok($$select pg_temp.intent_delete(1,current_setting('test.intent.created')::timestamptz)$$,
 '55000','deleted_content_source_binding_changed','different valid session cannot delete another owner content');
reset role;
select pg_temp.intent_claim(1);
set local role authenticated;
select throws_ok($$select pg_temp.intent_delete(1,current_setting('test.intent.created')::timestamptz-interval '1 second')$$,
 '55000','deleted_content_source_binding_changed','stale source incarnation cannot delete current content');
reset role;
savepoint rollback_delete;
set local role authenticated;
select is(pg_temp.intent_delete(1,current_setting('test.intent.created')::timestamptz)->>'status','deleted','fresh owner content intent deletes source atomically');
reset role;
select is((select count(*) from private.deleted_media_key_retirements where target_id=pg_temp.intent_id(1)::text and status='retained'),1::bigint,'same transaction finalized exact original');
rollback to rollback_delete;
select ok(exists(select 1 from public.videos where id=pg_temp.intent_id(1)),'rollback restores source');
select is((select count(*) from private.deleted_content_media_stages where target_id=pg_temp.intent_id(1)::text),0::bigint,'rollback removes staging and permanent retirement together');
select is((select status from public.media_upload_reservations where attached_record_id=pg_temp.intent_id(1)::text),'verified','rollback restores delivery reservation');
create function pg_temp.intent_revoke_session_after_delete() returns trigger language plpgsql as $$
begin
 delete from auth.sessions where id='e4300000-0000-4000-8000-000000000001';
 return old;
end $$;
create trigger intent_revoke_session_after_delete after delete on public.videos
 for each row execute function pg_temp.intent_revoke_session_after_delete();
set local role authenticated;
select throws_ok($$select pg_temp.intent_delete(1,current_setting('test.intent.created')::timestamptz)$$,
 '42501','deleted_content_current_session_required','real post-delete session revocation aborts the transaction');
reset role;
select ok(exists(select 1 from public.videos where id=pg_temp.intent_id(1))
 and exists(select 1 from auth.sessions where id='e4300000-0000-4000-8000-000000000001'),
 'failed final authority check rolls back source, capture, and injected session mutation');
drop trigger intent_revoke_session_after_delete on public.videos;
drop function pg_temp.intent_revoke_session_after_delete();
set local role authenticated;
select is(pg_temp.intent_delete(1,current_setting('test.intent.created')::timestamptz)->>'status','deleted','retry after rollback completes');
select is(pg_temp.intent_delete(1,current_setting('test.intent.created')::timestamptz)->>'status','already_deleted','retry after unknown committed outcome is idempotent');
reset role;
select is((select count(*) from private.deleted_content_records where target_id=pg_temp.intent_id(1)::text),1::bigint,'retry does not create another retention record');
select ok((select expires_at=deleted_at+interval '720 hours' and media_disposition='retained_original'
 from private.deleted_content_records where target_id=pg_temp.intent_id(1)::text),'server-owned window is fixed and original disposition explicit');
select is((select status from public.media_upload_reservations where attached_record_id=pg_temp.intent_id(1)::text),'deleted','atomic delete revokes delivery before returning');

select pg_temp.intent_video(2);
select private.stage_deleted_content_media_internal('creator_video',pg_temp.intent_id(2)::text,'cloudflare_r2','chillywood-media-origin',
 'e3300000-0000-4000-8000-000000000001/'||pg_temp.intent_id(2)::text||'/source.mp4');
select pg_temp.intent_video(2,'webm',true);
delete from public.videos where id=pg_temp.intent_id(2);
select ok((select s.deletion_id is null and r.status='staged' from private.deleted_content_media_stages s
 join private.deleted_media_key_retirements r on r.stage_id=s.id where s.target_id=pg_temp.intent_id(2)::text and s.object_key like '%.mp4'),
 'replacement old stage is not falsely adopted as a finalized deleted original');
select is((select count(*) from private.deleted_media_key_retirements where target_id=pg_temp.intent_id(2)::text and status='retained'),1::bigint,'current replacement alone enters deletion retention');

-- Exercise the real archive routine's no-media branch directly. The existing
-- creator producer guard forbids inserting an empty video, so this assertion
-- deliberately makes no claim that an empty draft is a permitted producer row.
select lives_ok($$select private.capture_deleted_content_row('creator_video',
 jsonb_build_object('id',pg_temp.intent_id(3),'owner_id','e3300000-0000-4000-8000-000000000001',
  'title','Metadata-only archive payload','created_at',clock_timestamp()),false)$$,
 'real capture routine accepts a metadata-only payload without provider authority');
select is((select media_disposition from private.deleted_content_records where target_id=pg_temp.intent_id(3)::text),'metadata_only','metadata-only archive records explicit no-media disposition');
select is((select count(*) from private.deleted_content_media_stages where target_id=pg_temp.intent_id(3)::text),0::bigint,'metadata-only archive creates no provider stage');

select pg_temp.intent_video(4);
insert into private.deleted_content_records(target_type,target_id,author,content,source_created_at,deletion_kind,deleted_at,expires_at)
select 'creator_video',id::text,owner_id::text,'{"title":"Historical soft record"}',created_at,'soft',
 now()-interval '1 hour',now()-interval '1 hour'+interval '720 hours'
from public.videos where id=pg_temp.intent_id(4);
select throws_ok($$delete from public.videos where id=pg_temp.intent_id(4)$$,
 '55000','deleted_content_existing_media_proof_required','historical soft metadata cannot pretend to prove retained original bytes');
select is((select count(*) from private.deleted_content_media_stages where target_id=pg_temp.intent_id(4)::text),0::bigint,
 'failed historical recovery does not manufacture a new stage or restart retention');

update private.deleted_content_retention_settings set capture_enabled=false,media_staging_enabled=false,text_expiry_enabled=false,media_expiry_enabled=false;
select is(public.stage_deleted_content_media('creator_video',pg_temp.intent_id(1)::text,'cloudflare_r2','chillywood-media-origin',
 'e3300000-0000-4000-8000-000000000001/'||pg_temp.intent_id(1)::text||'/source.mp4')->>'decision','defer','stopping flags never reauthorizes legacy immediate deletion of retained original');
select is(public.stage_deleted_content_media('creator_video',null,'cloudflare_r2','chillywood-media-origin',
 'e3300000-0000-4000-8000-000000000001/'||pg_temp.intent_id(1)::text||'/source.mp4',
 'e3300000-0000-4000-8000-000000000001')->>'decision','defer','omitted record ID cannot bypass retired-key fence after stop');
set local role authenticated;
select is(pg_temp.intent_delete(1,current_setting('test.intent.created')::timestamptz)->>'status','already_deleted','committed delete retry remains idempotent while runtime stopped');
reset role;
select * from finish();
rollback;
