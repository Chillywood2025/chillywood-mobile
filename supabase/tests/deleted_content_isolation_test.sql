-- A stale-snapshot isolation mode must not bypass advisory-lock freshness.
begin isolation level repeatable read;
create extension if not exists pgtap with schema extensions;
select no_plan();
update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,
 media_staging_enabled=true,text_expiry_enabled=true,media_expiry_enabled=true;
select throws_ok($$insert into public.legal_holds(target_type,target_id,reason,status)
 values('room_message','d5100000-0000-4000-8000-000000000001','Synthetic stale snapshot hold','active')$$,
 '25000','retention_requires_read_committed','hold writes cannot run with stale snapshots');
select throws_ok($$select public.expire_deleted_content_text('d5100000-0000-4000-8000-000000000001')$$,
 '25000','retention_requires_read_committed','text expiry requires fresh statements after lock');
select throws_ok($$select public.claim_deleted_content_media_expiry('d5100000-0000-4000-8000-000000000001')$$,
 '25000','retention_requires_read_committed','media claim rejects stale snapshot');
select throws_ok($$select public.read_deleted_content_media_expiry_claim('d5100000-0000-4000-8000-000000000001')$$,
 '25000','retention_requires_read_committed','provider revalidation rejects stale snapshot');
select * from finish();
rollback;
