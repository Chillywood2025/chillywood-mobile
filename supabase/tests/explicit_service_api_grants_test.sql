begin;
select plan(7);

create temporary table expected_service_api_grants(table_name text primary key, privileges text[]);
insert into expected_service_api_grants values
  ('admin_live_cost_guard_actions', array['INSERT','SELECT']),
  ('admin_live_cost_guard_events', array['INSERT','SELECT']),
  ('admin_live_cost_guard_settings', array['SELECT']),
  ('creator_payout_accounts', array['INSERT','SELECT','UPDATE']),
  ('creator_payout_eligibility_records', array['INSERT','SELECT','UPDATE']),
  ('creator_payout_onboarding_sessions', array['INSERT']),
  ('creator_payout_provider_transfers', array['SELECT','UPDATE']),
  ('creator_payout_provider_webhook_events', array['INSERT','SELECT','UPDATE']),
  ('discovery_feed_item_blocks', array['SELECT']),
  ('dmca_attachments', array['DELETE','SELECT']),
  ('dmca_audit_log', array['DELETE','SELECT']),
  ('dmca_cases', array['DELETE','SELECT','UPDATE']),
  ('dmca_content_actions', array['DELETE','SELECT']),
  ('dmca_counter_notices', array['DELETE','SELECT']),
  ('dmca_strikes', array['DELETE','SELECT']),
  ('livekit_room_assignments', array['INSERT','SELECT']),
  ('livekit_routing_audit', array['INSERT','SELECT']),
  ('livekit_server_heartbeats', array['INSERT']),
  ('livekit_servers', array['INSERT','SELECT','UPDATE']),
  ('platform_staff_role_audit', array['SELECT']),
  ('provider_access_audit_events', array['INSERT','SELECT']),
  ('provider_access_capabilities', array['INSERT','SELECT','UPDATE']),
  ('provider_accounts', array['INSERT','SELECT','UPDATE']),
  ('provider_dashboard_repair_requests', array['INSERT','SELECT']),
  ('provider_usage_daily', array['INSERT','SELECT','UPDATE']),
  ('provider_usage_imports', array['INSERT','SELECT','UPDATE']),
  ('provider_usage_reconciliation', array['INSERT','SELECT','UPDATE']),
  ('room_broadcast_sessions', array['INSERT','SELECT','UPDATE']),
  ('spectator_hls_playback_records', array['INSERT','SELECT','UPDATE']),
  ('usage_daily_summaries', array['SELECT']);

select is((select count(*)::integer from expected_service_api_grants expected
  cross join unnest(expected.privileges) privilege
  where not has_table_privilege('service_role', 'public.' || expected.table_name, privilege)), 0,
  'existing Edge consumers retain their explicit named service-role operations');

select is((select count(*)::integer from expected_service_api_grants expected
  join pg_class relation on relation.oid=('public.' || expected.table_name)::regclass
  where not relation.relrowsecurity), 0,
  'repaired public tables retain RLS');

select is((select count(*)::integer from pg_class relation
  join pg_namespace namespace on namespace.oid=relation.relnamespace
  cross join (values ('anon'),('authenticated'),('service_role')) api(role_name)
  cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) privilege
  where namespace.nspname='private' and relation.relkind='r'
    and (relation.relname like 'content_inspection_%' or relation.relname like 'deleted_content_%'
      or relation.relname like 'deleted_media_%' or relation.relname like 'admin_canary_%'
      or relation.relname in ('owner_security_revocation_receipts','user_collection_states','user_collection_operation_receipts'))
    and has_table_privilege(api.role_name,relation.oid,privilege)), 0,
  'inspection, retention, canary and collection internals remain denied to all API roles');

select is((select count(*)::integer
  from (values ('public.ios_native_call_state_issuances'),('public.ios_native_call_state_connections')) protected(name)
  cross join (values ('anon'),('authenticated'),('service_role')) api(role_name)
  cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) privilege
  where has_table_privilege(api.role_name,protected.name,privilege)), 0,
  'RPC-only call capabilities have no direct API grants');

select ok(has_table_privilege('authenticated','public.platform_brand_publication_metadata','SELECT')
  and not has_table_privilege('authenticated','public.platform_brand_publication_metadata','INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon','public.platform_brand_publication_metadata','SELECT'),
  'publication metadata keeps exactly its intended consumer read access');

set local role service_role;
select throws_ok('select * from private.content_inspection_settings', '42501', null,
  'service role cannot directly read private inspection settings');
reset role;

set local role authenticated;
select throws_ok('select * from private.deleted_content_records', '42501', null,
  'authenticated users cannot directly read private retained content');
reset role;

select * from finish();
rollback;
