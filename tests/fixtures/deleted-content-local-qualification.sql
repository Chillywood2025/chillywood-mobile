-- Disposable test database ONLY. These explicit owner assertions exercise the
-- gate, not deployment/schedule/provider evidence. Production remains unset.
-- No inventory/guard check is disabled or replaced by this fixture.
-- The full historical migration stack seeds exactly this public proof video.
-- Remove that known synthetic local row before qualifying an empty inventory;
-- never erase arbitrary legacy objects to make readiness pass.
delete from public.videos
where id='6e1c3405-7db8-4cb2-98f3-5a7642e82126'
  and title='Chi''llywood Originals Proof Fixture' and storage_provider='supabase';
delete from public.media_scan_jobs
where target_table='videos' and target_id='6e1c3405-7db8-4cb2-98f3-5a7642e82126';
update private.deleted_content_retention_settings set legacy_object_deletes_blocked=true;
update private.deleted_content_rollout_qualification
set source_revision=repeat('0',40),
    client_enforcement_evidence='disposable-local qualification fixture: SQL protocol exercised',
    legacy_delete_drain_evidence='disposable-local fixture: no gateway/provider requests in flight',
    worker_schedule_evidence='disposable-local qualification fixture: manually driven bounded worker',
    origin_cleanup_evidence='disposable-local qualification fixture: no live provider claim',
    qualified_at=clock_timestamp()
where singleton;
select public.record_deleted_content_worker_heartbeat();
