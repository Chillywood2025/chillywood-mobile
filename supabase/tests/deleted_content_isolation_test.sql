-- A stale snapshot must not qualify/enable the retention protocol. Active
-- hold/claim interleavings are separately exercised by two native backends in
-- test-deleted-content-retention-concurrency.mjs.
begin isolation level repeatable read;
create extension if not exists pgtap with schema extensions;
select no_plan();
select throws_ok($$update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,
 media_staging_enabled=true,text_expiry_enabled=true,media_expiry_enabled=true$$,
 '25000','retention_requires_read_committed','activation requires fresh statements after serialization');
select ok((select not armed from private.deleted_media_reference_fence),'failed stale-snapshot activation leaves fence unarmed');
select ok((select not capture_enabled and not media_expiry_enabled from private.deleted_content_retention_settings),'failed activation leaves flags disabled');
select throws_ok($$select public.record_deleted_content_media_expiry_result('d5100000-0000-4000-8000-000000000001','failed')$$,
 '25000','retention_requires_read_committed','provider receipt cannot mutate through a stale snapshot');
select * from finish();
rollback;
