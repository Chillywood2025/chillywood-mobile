begin;
select plan(39);

select has_table('public', 'autonomous_provider_readback_capabilities', 'provider capability table exists');
select has_table('public', 'autonomous_scheduler_health_snapshots', 'scheduler health table exists');
select has_column('public', 'notification_delivery_health_snapshots', 'platform', 'notification snapshots are platform aware');
select has_column('public', 'release_health_snapshots', 'native_build', 'release snapshots record native build');
select has_column('public', 'runtime_health_snapshots', 'bundle_identifier', 'observability records bundle identity');
select has_column('public', 'observability_required_review_flags', 'app_version', 'observability review flags retain iOS release identity');
select has_column('public', 'installed_traversal_runs', 'distribution_source', 'installed QA records distribution source');
select has_column('public', 'livekit_operator_events', 'platform', 'LiveKit telemetry records platform');
select has_column('public', 'money_flow_health_snapshots', 'provider_environment', 'money readback records provider environment');
select has_column('public', 'backup_health_snapshots', 'runtime_version', 'recovery snapshots record iOS runtime identity');

select has_index('public', 'autonomous_provider_readback_capabilities', 'autonomous_provider_readback_platform_created_idx', 'provider platform index exists');
select has_index('public', 'release_health_snapshots', 'autonomous_identity_' || substr(md5('release_health_snapshots'), 1, 12) || '_idx', 'release identity index exists');
select has_index('public', 'runtime_health_snapshots', 'autonomous_identity_' || substr(md5('runtime_health_snapshots'), 1, 12) || '_idx', 'runtime identity index exists');
select has_index('public', 'backup_health_snapshots', 'autonomous_identity_adfab0a58090_idx', 'recovery identity index exists');

select ok((select relrowsecurity from pg_class where oid = 'public.autonomous_provider_readback_capabilities'::regclass), 'provider readback has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.autonomous_scheduler_health_snapshots'::regclass), 'scheduler readback has RLS enabled');
select ok(not has_table_privilege('anon', 'public.autonomous_provider_readback_capabilities', 'INSERT'), 'anon cannot write provider readback');
select ok(not has_table_privilege('authenticated', 'public.autonomous_scheduler_health_snapshots', 'INSERT'), 'authenticated clients cannot write scheduler readback');
select ok(has_table_privilege('service_role', 'public.autonomous_provider_readback_capabilities', 'INSERT'), 'service role can write provider readback');

select lives_ok(
  $$insert into public.autonomous_provider_readback_capabilities
    (system_id, platform, provider, capability, capability_state, readback_complete, data_source)
    values ('notification_delivery_operator', 'ios', 'expo', 'delivery_health_readback', 'available', true, 'synthetic_pgtap')$$,
  'iOS provider readback row is valid'
);
select lives_ok(
  $$insert into public.autonomous_provider_readback_capabilities
    (system_id, platform, provider, capability, capability_state, readback_complete, data_source)
    values ('notification_delivery_operator', 'android', 'fcm', 'delivery_health_readback', 'available', true, 'synthetic_pgtap')$$,
  'Android provider readback remains valid'
);
select lives_ok(
  $$insert into public.autonomous_provider_readback_capabilities
    (system_id, platform, provider, capability, capability_state, readback_complete, data_source)
    values ('media_automation', 'shared', 'object_storage', 'catalog_readback', 'available', true, 'synthetic_pgtap')$$,
  'shared backend row is valid'
);
select throws_ok(
  $$insert into public.autonomous_provider_readback_capabilities
    (system_id, platform, provider, capability, capability_state, data_source)
    values ('release_ota_operator', 'windows', 'eas', 'release_readback', 'unknown', 'synthetic_pgtap')$$,
  '23514', null, 'unsupported platform is rejected'
);
select throws_ok(
  $$insert into public.autonomous_provider_readback_capabilities
    (system_id, platform, provider, capability, capability_state, data_source, metadata)
    values ('notification_delivery_operator', 'ios', 'expo', 'delivery_health_readback', 'unknown', 'synthetic_pgtap', '{"token":"forbidden"}')$$,
  '23514', null, 'raw token-shaped metadata is rejected'
);
select throws_ok(
  $$insert into public.autonomous_provider_readback_capabilities
    (system_id, platform, provider, capability, capability_state, data_source, money_moved)
    values ('money_flow_control', 'ios', 'revenuecat_app_store', 'catalog', 'available', 'synthetic_pgtap', true)$$,
  '23514', null, 'provider readback cannot claim money movement'
);
select throws_ok(
  $$insert into public.autonomous_scheduler_health_snapshots
    (system_id, surface_id, platform, scheduler, health_state, data_source, user_rights_changed)
    values ('notification_delivery_operator', 'ios_terminal_call_delivery_retry', 'shared', 'pg_cron', 'healthy', 'synthetic_pgtap', true)$$,
  '23514', null, 'scheduler readback cannot claim user-right changes'
);

select lives_ok(
  $$insert into public.notification_delivery_health_snapshots
    (system_id, health_state, provider, platform, readback_complete, data_source, environment_mode, metadata)
    values ('notification_delivery_operator', 'healthy', 'expo', 'ios', true, 'synthetic_pgtap', 'production', '{}')$$,
  'iOS notification snapshot is valid'
);
select lives_ok(
  $$insert into public.release_health_snapshots
    (system_id, health_state, platform, bundle_identifier, app_version, native_build, runtime_version, channel, distribution_source, readback_complete, data_source, environment_mode, metadata)
    values ('release_ota_operator', 'healthy', 'ios', 'com.chillywood.mobile', '1.0.0', '8', '1.0.0-iosqa1', 'ios-qa', 'testflight_internal', true, 'synthetic_pgtap', 'production', '{}')$$,
  'iOS release snapshot is valid'
);
select lives_ok(
  $$insert into public.runtime_health_snapshots
    (system_id, health_state, platform, bundle_identifier, app_version, native_build, runtime_version, channel, distribution_source, readback_complete, data_source, environment_mode, metadata)
    values ('observability_runtime_operator', 'unknown', 'ios', 'com.chillywood.mobile', '1.0.0', '8', '1.0.0-iosqa1', 'ios-qa', 'testflight_internal', false, 'synthetic_pgtap', 'production', '{"missingCapabilities":["crashlytics"]}')$$,
  'missing observability readback is recorded as unknown'
);
select lives_ok(
  $$insert into public.installed_traversal_runs
    (system_id, source, run_label, platform, result, blocker_classification, discovered_by, bundle_identifier, app_version, native_build, runtime_version, channel, distribution_source, readback_complete, data_source, fake_proof, metadata)
    values ('installed_product_qa_operator', 'testflight_internal', 'ios_readiness', 'ios', 'physical_proof_required', 'ios_physical_proof_required', 'autonomous_operator', 'com.chillywood.mobile', '1.0.0', '8', '1.0.0-iosqa1', 'ios-qa', 'testflight_internal', true, 'synthetic_pgtap', false, '{}')$$,
  'installed QA truthfully records physical proof required'
);
select throws_ok(
  $$insert into public.installed_traversal_runs
    (system_id, source, run_label, platform, result, blocker_classification, discovered_by, fake_proof, metadata)
    values ('installed_product_qa_operator', 'physical_ios', 'fake_device_pass', 'ios', 'pass', 'ios_physical_proof_required', 'autonomous_operator', true, '{}')$$,
  '23514', null, 'fake device proof is rejected'
);

select has_function('public', 'get_ios_autonomous_call_retry_readback', array[]::text[], 'sanitized retry readback function exists');
select ok(not has_function_privilege('anon', 'public.get_ios_autonomous_call_retry_readback()', 'EXECUTE'), 'anon cannot execute retry readback');
select ok(has_function_privilege('service_role', 'public.get_ios_autonomous_call_retry_readback()', 'EXECUTE'), 'service role can execute retry readback');
select ok((public.get_ios_autonomous_call_retry_readback() ? 'readbackComplete'), 'retry readback returns completion state');
select ok(public.get_ios_autonomous_call_retry_readback()::text !~* '(token|secret|credential|authorization)', 'retry readback returns no credential fields');
select is(public.get_ios_autonomous_recovery_readback() ->> 'migrationsAligned', 'true', 'recovery readback confirms required migration alignment');
select is(public.get_ios_autonomous_recovery_readback() ->> 'requiredFunctionsPresent', 'true', 'recovery readback confirms required functions');
select is((select count(*)::integer from pg_proc where pronamespace = 'public'::regnamespace and proname ~* '(publish.*ota|public.*release|submit.*review)'), 0, 'autonomous schema adds no public release action');

select * from finish();
rollback;
