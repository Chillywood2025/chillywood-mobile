begin;
select plan(49);

select has_table('public', 'release_binary_attestations', 'local/cloud binary attestations exist');
select has_table('public', 'autonomous_current_findings', 'current finding lifecycle exists');
select has_table('public', 'autonomous_finding_lifecycle_events', 'append-only finding lifecycle audit exists');
select has_table('public', 'autonomous_provider_readback_current', 'deduplicated current provider capability state exists');
select has_table('public', 'user_report_clusters', 'governed user report clusters exist');
select has_column('public', 'autonomous_approval_requests', 'platform', 'approval request has platform scope');
select has_column('public', 'autonomous_approval_request_events', 'platform', 'approval event has platform scope');
select has_column('public', 'owner_command_requests', 'platform', 'owner command has platform scope');
select has_column('public', 'owner_command_execution_steps', 'platform', 'owner step has inherited platform');
select has_column('public', 'owner_command_blockers', 'platform', 'owner blocker has inherited platform');
select has_column('public', 'user_report_routing_actions', 'platform', 'report routing action has platform');
select has_column('public', 'user_report_operator_findings', 'platform', 'report operator finding has platform');
select has_column('public', 'device_availability_findings', 'testflight_internal_build_available', 'installed QA records TestFlight availability');
select has_column('public', 'device_availability_findings', 'ios_second_device_available', 'installed QA records second iOS device separately');
select has_index('public', 'release_binary_attestations', 'release_binary_attestations_identity_idx', 'binary identity index exists');
select has_index('public', 'user_report_clusters', 'user_report_clusters_status_idx', 'platform report status index exists');
select ok((select relrowsecurity from pg_class where oid = 'public.release_binary_attestations'::regclass), 'binary attestations have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.user_report_intake_events'::regclass), 'report intake has RLS');
select ok(not has_table_privilege('anon', 'public.release_binary_attestations', 'INSERT'), 'anon cannot write attestations');
select ok(not has_table_privilege('authenticated', 'public.user_report_intake_events', 'INSERT'), 'authenticated clients cannot bypass report intake function');
select ok(not has_table_privilege('authenticated', 'public.autonomous_provider_readback_current', 'INSERT'), 'authenticated clients cannot write current provider state');
select ok(has_table_privilege('service_role', 'public.user_report_clusters', 'INSERT'), 'service role can write governed clusters');

select lives_ok($$insert into public.owner_command_requests
  (command_text, normalized_intent, target_systems, approval_level, status, platform)
  values ('Sanitized iOS status review', 'support_success', array['support_success_operator'], 2, 'planned', 'ios')$$,
  'iOS owner command is valid');

select lives_ok($$insert into public.owner_command_events
  (command_id, event_type, actor_type, status, event_summary, platform)
  select id, 'planned', 'support_success_operator', 'planned', 'Sanitized plan recorded.', 'android'
  from public.owner_command_requests where command_text = 'Sanitized iOS status review'$$,
  'owner command event is accepted and inherited');
select is((select platform from public.owner_command_events order by created_at desc limit 1), 'ios', 'owner event platform inherits parent instead of caller value');

select lives_ok($$insert into public.owner_command_execution_steps
  (command_id, step_index, target_system, action_id, approval_level, platform)
  select id, 1, 'support_success_operator', 'owner_command_report', 2, 'android'
  from public.owner_command_requests where command_text = 'Sanitized iOS status review'$$,
  'owner execution step is accepted');
select is((select platform from public.owner_command_execution_steps order by created_at desc limit 1), 'ios', 'owner execution step inherits iOS scope');

select lives_ok($$insert into public.autonomous_approval_requests
  (system_id, action_id, platform, requested_by_actor_type, approval_level, status, title, reason, risk_summary, proposed_action,
   allowed_write_scope, forbidden_scope, rollback_plan, kill_switch_plan, proof_plan, validation_plan, expires_at, approved_at)
  values ('money_flow_control','provider_readback_review','ios','money_flow_control',3,'approved','iOS review','bounded review','no mutation','read only',
   '["read only"]','["money movement"]','stop','emergency stop','readback','exact platform',now()+interval '1 hour',now())$$,
  'platform-scoped iOS approval is valid');
select is(public.assert_autonomous_approval_platform_scope(
  (select id from public.autonomous_approval_requests where platform='ios' order by created_at desc limit 1),
  'money_flow_control','provider_readback_review','ios'), true, 'exact iOS approval scope passes');
select is(public.assert_autonomous_approval_platform_scope(
  (select id from public.autonomous_approval_requests where platform='ios' order by created_at desc limit 1),
  'money_flow_control','provider_readback_review','android'), false, 'iOS approval cannot authorize Android');
select is(public.assert_autonomous_approval_platform_scope(
  (select id from public.autonomous_approval_requests where platform='ios' order by created_at desc limit 1),
  'money_flow_control','provider_readback_review','shared'), false, 'iOS approval cannot authorize shared Stripe scope');

select lives_ok($$select public.record_autonomous_finding('release_ota_operator','ios','provider_readback_blocked','app_store_connect','app_store_connect','warning','{"readback_complete":false}')$$,
  'first finding opens');
select lives_ok($$select public.record_autonomous_finding('release_ota_operator','ios','provider_readback_blocked','app_store_connect','app_store_connect','warning','{"readback_complete":false}')$$,
  'repeated finding updates current state');
select is((select occurrence_count from public.autonomous_current_findings where system_id='release_ota_operator' and platform='ios' and current_status='open'), 2, 'repeated finding is deduped and counted');
select is((select count(*)::integer from public.autonomous_current_findings where system_id='release_ota_operator' and platform='ios'), 1, 'only one current finding row exists');
select is(public.resolve_autonomous_findings('release_ota_operator','ios','{}'), 1, 'recovery resolves open finding');
select is((select current_status from public.autonomous_current_findings where system_id='release_ota_operator' and platform='ios'), 'resolved', 'current finding is resolved');
select is((select count(*)::integer from public.autonomous_finding_lifecycle_events where system_id='release_ota_operator' and platform='ios'), 3, 'open, repeat, and resolution audit events are retained');

select lives_ok($$insert into public.autonomous_provider_readback_capabilities
  (system_id,platform,provider,capability,capability_state,missing_capability,readback_complete,data_source)
  values ('release_ota_operator','ios','app_store_connect','build_readback','blocked','provider_readback_unavailable',false,'fixture'),
         ('release_ota_operator','ios','app_store_connect','build_readback','available',null,true,'fixture')$$,
  'provider capability observations append successfully');
select is((select count(*)::integer from public.autonomous_provider_readback_capabilities where system_id='release_ota_operator' and provider='app_store_connect'), 2, 'provider capability observation history remains append-only');
select is((select count(*)::integer from public.autonomous_provider_readback_current where system_id='release_ota_operator' and provider='app_store_connect'), 1, 'provider capability current state is deduplicated');
select is((select current_status from public.autonomous_provider_readback_current where system_id='release_ota_operator' and provider='app_store_connect'), 'resolved', 'successful readback resolves current provider blocker');

select lives_ok($$insert into public.user_report_intake_events
  (report_type, category, severity, platform, normalized_fingerprint, text_summary_redacted)
  values ('notification_delivery','notification_delivery','review','ios','same-safe-fingerprint','APNs alert failed'),
         ('notification_delivery','notification_delivery','review','android','same-safe-fingerprint','FCM alert failed')$$,
  'same normalized report fingerprint can exist on different platforms');
select lives_ok($$insert into public.user_report_clusters
  (platform, normalized_fingerprint, report_type, category, severity, routed_system_id, action_status)
  values ('ios','same-safe-fingerprint','notification_delivery','notification_delivery','review','notification_delivery_operator','threshold_pending'),
         ('android','same-safe-fingerprint','notification_delivery','notification_delivery','review','notification_delivery_operator','threshold_pending')$$,
  'platform-specific clusters remain separate');
select is((select count(*)::integer from public.user_report_clusters where normalized_fingerprint='same-safe-fingerprint'), 2, 'iOS and Android report clusters do not merge');

select throws_ok($$insert into public.user_report_intake_events
  (report_type, category, severity, platform, normalized_fingerprint, text_summary_redacted)
  values ('other_support','other_support','review','windows','invalid-platform','blocked')$$,
  '23514', null, 'unsupported report platform is rejected');
select throws_ok($$insert into public.release_binary_attestations
  (platform,bundle_identifier,app_version,native_build,distribution_source,source_commit,binary_sha256,verification_source,metadata)
  values ('ios','com.chillywood.mobile','1.0.0','9','local','0123456789012345678901234567890123456789','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','fixture','{"token":"forbidden"}')$$,
  '23514', null, 'attestation metadata rejects secret-shaped keys');
select throws_ok($$insert into public.autonomous_current_findings
  (finding_key,system_id,platform,finding_type,money_moved)
  values (repeat('a',64),'money_flow_control','ios','forbidden',true)$$,
  '23514', null, 'autonomous findings cannot claim money movement');
select throws_ok($$insert into public.device_availability_findings
  (source,device_requirement,result,blocker_classification,next_safe_action,fake_proof,platform)
  values ('physical_ios','iOS hardware proof','pass','ios_physical_proof_required','do not fabricate',true,'ios')$$,
  '23514', null, 'fake installed proof remains impossible');

select * from finish();
rollback;
