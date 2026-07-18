begin;
select plan(113);

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
select has_index('public', 'device_availability_findings', 'device_availability_one_open_condition_uidx', 'device availability has one-open-condition index');
select has_index('public', 'qa_required_review_flags', 'qa_review_one_open_condition_uidx', 'installed QA review flags have one-open-condition index');
select ok((select relrowsecurity from pg_class where oid = 'public.release_binary_attestations'::regclass), 'binary attestations have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.user_report_intake_events'::regclass), 'report intake has RLS');
select ok(not has_table_privilege('anon', 'public.release_binary_attestations', 'INSERT'), 'anon cannot write attestations');
select ok(not has_table_privilege('authenticated', 'public.user_report_intake_events', 'INSERT'), 'authenticated clients cannot bypass report intake function');
select ok(not has_table_privilege('authenticated', 'public.autonomous_provider_readback_current', 'INSERT'), 'authenticated clients cannot write current provider state');
select ok(has_table_privilege('service_role', 'public.user_report_clusters', 'INSERT'), 'service role can write governed clusters');
select has_index('public', 'media_scan_jobs', 'media_scan_jobs_recovery_idx', 'media scan recovery uses a partial queue index');
select has_function('public', 'recover_media_scan_jobs', array['integer','integer'], 'bounded media scan recovery RPC exists');
select ok(not has_function_privilege('anon', 'public.recover_media_scan_jobs(integer,integer)', 'EXECUTE'), 'anonymous clients cannot recover media scan jobs');
select ok(not has_function_privilege('authenticated', 'public.recover_media_scan_jobs(integer,integer)', 'EXECUTE'), 'authenticated clients cannot recover media scan jobs');
select ok(has_function_privilege('service_role', 'public.recover_media_scan_jobs(integer,integer)', 'EXECUTE'), 'service role may run bounded media recovery');
select has_function('public', 'complete_media_scan_job_with_target_propagation', array['uuid','text','text','text','text','text','text','integer'], 'target-propagating media completion is isolated behind the durable wrapper');
select ok(not has_function_privilege('anon', 'public.complete_media_scan_job_with_target_propagation(uuid,text,text,text,text,text,text,integer)', 'EXECUTE'), 'anonymous clients cannot bypass durable media completion');
select ok(not has_function_privilege('service_role', 'public.complete_media_scan_job_with_target_propagation(uuid,text,text,text,text,text,text,integer)', 'EXECUTE'), 'service role cannot bypass the durable media completion wrapper');
select has_function('public', 'can_read_creator_video_row', array['text','text','text','text','text','text','text','text'], 'scan-aware creator video authorization exists');
select hasnt_function('public', 'can_read_creator_video_row', array['text','text','text','text','text','text','text'], 'ambiguous legacy creator video authorization overload is removed');
select ok(pg_get_functiondef('public.can_read_creator_feed_item(text,text,text,text,text,text,text)'::regprocedure) like '%v_video."scan_status"%', 'creator feed authorization passes explicit scan status');
select ok(pg_get_functiondef('public.create_ios_app_store_purchase_intent(text,text,uuid,jsonb)'::regprocedure) not like '%v_room."host_user_id" = v_user_id::text%', 'iOS purchase intent compares UUID host identity without an invalid text cast');
select has_function('public', 'upsert_user_report_cluster_membership', array['uuid','text'], 'atomic report clustering RPC exists');
select ok(not has_function_privilege('anon', 'public.upsert_user_report_cluster_membership(uuid,text)', 'EXECUTE'), 'anonymous clients cannot execute atomic report clustering');
select has_function('public', 'route_user_report_cluster', array['uuid'], 'atomic report routing RPC exists');
select ok(not has_function_privilege('anon', 'public.route_user_report_cluster(uuid)', 'EXECUTE'), 'anonymous clients cannot execute atomic report routing');
select ok(has_function_privilege('service_role', 'public.route_user_report_cluster(uuid)', 'EXECUTE'), 'service role can execute atomic report routing');

select throws_ok($$insert into public.installed_traversal_runs
  (system_id,source,run_label,platform,result,blocker_classification,discovered_by,metadata)
  values ('installed_product_qa_operator','firebase_test_lab_uploaded_artifact','invalid-platform','unknown','partial','unknown_requires_review','device_lab','{}')$$,
  '23514', null, 'Firebase Test Lab traversal cannot be stored with unknown platform');
select lives_ok($$insert into public.installed_traversal_runs
  (system_id,source,run_label,platform,result,blocker_classification,discovered_by,metadata)
  values ('installed_product_qa_operator','firebase_test_lab_uploaded_artifact','android-platform','android','partial','unknown_requires_review','device_lab','{}')$$,
  'Firebase Test Lab traversal accepts explicit Android platform');

insert into public.media_scan_jobs
  (id,target_table,target_column,target_id,storage_provider,storage_bucket,storage_object_key,status,attempt_count,max_attempts,claimed_by,claimed_at)
values
  ('10000000-0000-0000-0000-000000000001','videos','video_url','stale','supabase','fixture-private','stale-object','scanning',1,3,'stale-worker',now()-interval '1 hour'),
  ('10000000-0000-0000-0000-000000000002','videos','video_url','capped','supabase','fixture-private','capped-object','scan_failed',3,3,null,null);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$select public.recover_media_scan_jobs(20,25)$$, 'service role can execute bounded media recovery');
select is((select status from public.media_scan_jobs where id='10000000-0000-0000-0000-000000000001'), 'scan_failed', 'stale scanning lease is requeued as retryable failure');
select is((select claimed_by from public.media_scan_jobs where id='10000000-0000-0000-0000-000000000001'), null, 'stale scanning lease clears worker ownership');
select is((select status from public.media_scan_jobs where id='10000000-0000-0000-0000-000000000002'), 'manual_review', 'capped scan failure becomes manual review');
select ok((select completed_at is not null from public.media_scan_jobs where id='10000000-0000-0000-0000-000000000002'), 'capped scan recovery records completion time');
select ok(public.recover_media_scan_jobs(20,25)::text !~* '(token|secret|credential|authorization)', 'media recovery returns sanitized aggregate state only');

update public.videos
set storage_object_key = 'pgtap-target-propagation-object'
where id = (select id from public.videos order by created_at limit 1);
delete from public.media_scan_jobs where storage_object_key = 'pgtap-target-propagation-object';
insert into public.media_scan_jobs
  (id,target_table,target_column,target_id,storage_provider,storage_bucket,storage_object_key,status,attempt_count,max_attempts,claimed_by,claimed_at)
select
  '10000000-0000-0000-0000-000000000003','videos','video_url',id::text,'supabase','fixture-private',
  'pgtap-target-propagation-object','scanning',3,3,'pgtap-worker',now()
from public.videos
order by created_at
limit 1;
create function pg_temp.block_media_target_propagation()
returns trigger language plpgsql as $$begin raise exception 'pgtap_target_update_blocked'; end$$;
create trigger pgtap_block_media_target_propagation
  before update on public.videos
  for each row
  when (new.scan_provider = 'pgtap_block')
  execute function pg_temp.block_media_target_propagation();
select lives_ok($$select public.complete_media_scan_job(
  '10000000-0000-0000-0000-000000000003','manual_review','pgtap_block','fixture',null,null,
  'scan_attempt_cap_reached',0)$$, 'target trigger failure cannot roll back durable media scan completion');
select is((select status from public.media_scan_jobs where id='10000000-0000-0000-0000-000000000003'), 'manual_review', 'blocked target propagation leaves the queue in a bounded terminal state');
select is((select metadata->>'targetPropagationComplete' from public.media_scan_jobs where id='10000000-0000-0000-0000-000000000003'), 'false', 'blocked target propagation is recorded truthfully');
select ok((select metadata::text !~* '(pgtap_target_update_blocked|token|secret|credential|authorization)' from public.media_scan_jobs where id='10000000-0000-0000-0000-000000000003'), 'target propagation failure metadata is sanitized');
drop trigger pgtap_block_media_target_propagation on public.videos;
select set_config('request.jwt.claims', '{}', true);

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
select is((select count(*)::integer from pg_indexes where schemaname='public' and indexname like 'observability_open_%_uidx'), 7, 'all typed observability finding tables prevent duplicate open conditions');
select lives_ok($$insert into public.observability_required_review_flags
  (system_id,flag_type,severity,target_type,target_id,review_status,platform)
  values ('observability_runtime_operator','dedupe_fixture','warning','ios_runtime','fixture-build','open','ios')$$,
  'first typed observability condition opens');
select throws_ok($$insert into public.observability_required_review_flags
  (system_id,flag_type,severity,target_type,target_id,review_status,platform)
  values ('observability_runtime_operator','dedupe_fixture','warning','ios_runtime','fixture-build','open','ios')$$,
  '23505', null, 'duplicate open typed observability condition is rejected');

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

select lives_ok($$
  insert into public.user_report_intake_events
    (report_type, category, severity, platform, normalized_fingerprint, text_summary_redacted, report_status)
  values
    ('notification_delivery','notification_delivery','review','ios','atomic-safe-fingerprint','First sanitized report','classified'),
    ('notification_delivery','notification_delivery','review','ios','atomic-safe-fingerprint','Second sanitized report','classified');
  insert into public.user_report_classifications
    (report_id, platform, report_type, category, severity, routed_system_id, escalation_policy, confidence)
  select id, platform, report_type, category, severity, 'notification_delivery_operator', 'threshold', 0.8
  from public.user_report_intake_events where normalized_fingerprint='atomic-safe-fingerprint';
$$, 'atomic clustering fixtures are valid');
select lives_ok($$select public.upsert_user_report_cluster_membership(
  (select id from public.user_report_intake_events where normalized_fingerprint='atomic-safe-fingerprint' order by created_at, id limit 1),
  repeat('b',64))$$, 'first report clusters atomically');
select is((select unique_reporter_count from public.user_report_clusters where platform='ios' and normalized_fingerprint='atomic-safe-fingerprint'), 1, 'first atomic report records one reporter');
select is((select report_count from public.user_report_clusters where platform='ios' and normalized_fingerprint='atomic-safe-fingerprint'), 1, 'unprocessed classified report is not counted early');
select lives_ok($$select public.upsert_user_report_cluster_membership(
  (select id from public.user_report_intake_events where normalized_fingerprint='atomic-safe-fingerprint' order by created_at, id offset 1 limit 1),
  repeat('b',64))$$, 'duplicate reporter clusters without a unique-race failure');
select is((select unique_reporter_count from public.user_report_clusters where platform='ios' and normalized_fingerprint='atomic-safe-fingerprint'), 1, 'duplicate reporter does not inflate threshold');
select is((select report_count from public.user_report_clusters where platform='ios' and normalized_fingerprint='atomic-safe-fingerprint'), 2, 'second report increments cluster count once');
select is((select duplicate_flag from public.user_report_intake_events where normalized_fingerprint='atomic-safe-fingerprint' order by created_at, id offset 1 limit 1), true, 'duplicate reporter is marked truthfully');
select lives_ok($$select public.upsert_user_report_cluster_membership(
  (select id from public.user_report_intake_events where normalized_fingerprint='atomic-safe-fingerprint' order by created_at, id offset 1 limit 1),
  repeat('b',64))$$, 'atomic clustering is safe to retry');
select is((select report_count from public.user_report_clusters where platform='ios' and normalized_fingerprint='atomic-safe-fingerprint'), 2, 'retry does not double count the report');

select lives_ok($$insert into public.user_report_clusters
  (platform, normalized_fingerprint, report_type, category, severity, routed_system_id,
   unique_reporter_count, report_count, text_summary_redacted, action_status)
  values ('ios','atomic-route-fingerprint','privacy_data','privacy_data','critical',
    'privacy_compliance_operator',1,1,'Sanitized privacy review','threshold_pending')$$,
  'atomic routing fixture is valid');
select lives_ok($$select public.route_user_report_cluster(
  (select id from public.user_report_clusters where normalized_fingerprint='atomic-route-fingerprint'))$$,
  'qualified report cluster routes in one transaction');
select is((select count(*)::integer from public.user_report_routing_actions action
  join public.user_report_clusters cluster on cluster.id=action.cluster_id
  where cluster.normalized_fingerprint='atomic-route-fingerprint'), 1,
  'one routing action is created');
select is((select count(*)::integer from public.owner_command_requests command
  where command.metadata->>'normalized_fingerprint'='atomic-route-fingerprint'), 1,
  'one owner command is created');
select is((select count(*)::integer from public.autonomous_approval_requests request
  join public.user_report_clusters cluster on request.metadata->>'cluster_id'=cluster.id::text
  where cluster.normalized_fingerprint='atomic-route-fingerprint'), 1,
  'one platform-scoped approval request is created');
select is((select count(*)::integer from public.owner_command_events event
  join public.owner_command_requests command on command.id=event.command_id
  where command.metadata->>'normalized_fingerprint'='atomic-route-fingerprint'), 1,
  'owner command creation retains an audit event');
select is((select count(*)::integer from public.autonomous_approval_request_events event
  join public.autonomous_approval_requests request on request.id=event.request_id
  join public.user_report_clusters cluster on request.metadata->>'cluster_id'=cluster.id::text
  where cluster.normalized_fingerprint='atomic-route-fingerprint'), 1,
  'approval creation retains an audit event');
select is((select platform from public.owner_command_requests
  where metadata->>'normalized_fingerprint'='atomic-route-fingerprint'), 'ios',
  'routed owner command preserves iOS scope');
select is((select request.platform from public.autonomous_approval_requests request
  join public.user_report_clusters cluster on request.metadata->>'cluster_id'=cluster.id::text
  where cluster.normalized_fingerprint='atomic-route-fingerprint'), 'ios',
  'routed approval preserves iOS scope');
select lives_ok($$select public.route_user_report_cluster(
  (select id from public.user_report_clusters where normalized_fingerprint='atomic-route-fingerprint'))$$,
  'atomic routing is idempotent on retry');
select is((select count(*)::integer from public.user_report_routing_actions action
  join public.user_report_clusters cluster on cluster.id=action.cluster_id
  where cluster.normalized_fingerprint='atomic-route-fingerprint'), 1,
  'routing retry does not duplicate the action');
select is((select count(*)::integer from public.owner_command_requests command
  where command.metadata->>'normalized_fingerprint'='atomic-route-fingerprint'), 1,
  'routing retry does not duplicate the owner command');
select is((select count(*)::integer from public.autonomous_approval_requests request
  join public.user_report_clusters cluster on request.metadata->>'cluster_id'=cluster.id::text
  where cluster.normalized_fingerprint='atomic-route-fingerprint'), 1,
  'routing retry does not duplicate the approval');
select is((select count(*)::integer from public.user_report_operator_findings finding
  join public.user_report_clusters cluster on cluster.id=finding.cluster_id
  where cluster.normalized_fingerprint='atomic-route-fingerprint'), 1,
  'routing retry does not duplicate the operator finding');

select is((select count(*)::integer from (
  select system_id, platform, device_requirement, blocker_classification
  from public.device_availability_findings where finding_status='open'
  group by system_id, platform, device_requirement, blocker_classification
  having count(*) > 1
) duplicate_open), 0, 'existing device availability history has no duplicate open conditions');
select lives_ok($$insert into public.device_availability_findings
  (source,device_requirement,result,blocker_classification,next_safe_action,platform)
  values ('physical_ios','dedupe fixture device','blocked','ios_physical_proof_required','retain physical gate','ios')$$,
  'first device availability condition opens');
select throws_ok($$insert into public.device_availability_findings
  (source,device_requirement,result,blocker_classification,next_safe_action,platform)
  values ('physical_ios','dedupe fixture device','blocked','ios_physical_proof_required','retain physical gate','ios')$$,
  '23505', null, 'duplicate open device availability condition is rejected');
select is((select count(*)::integer from (
  select system_id, platform, flag_type, coalesce(target_type,''), coalesce(target_id,'')
  from public.qa_required_review_flags where review_status='open'
  group by system_id, platform, flag_type, coalesce(target_type,''), coalesce(target_id,'')
  having count(*) > 1
) duplicate_open), 0, 'existing installed QA review history has no duplicate open conditions');
select lives_ok($$insert into public.qa_required_review_flags
  (source,flag_type,severity,result,blocker_classification,next_safe_action,platform)
  values ('manual_codex_proof','dedupe_fixture','review','human_review','ios_physical_proof_required','retain physical gate','ios')$$,
  'first installed QA review condition opens');
select throws_ok($$insert into public.qa_required_review_flags
  (source,flag_type,severity,result,blocker_classification,next_safe_action,platform)
  values ('manual_codex_proof','dedupe_fixture','review','human_review','ios_physical_proof_required','retain physical gate','ios')$$,
  '23505', null, 'duplicate open installed QA review condition is rejected');

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
