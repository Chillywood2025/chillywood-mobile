-- Exact iOS successor authorization for the provider-independent visual
-- sentinel. This migration creates only fail-closed boundaries. It does not
-- register a capability, open an authorization, enable a switch, create a
-- schedule, or persist product evidence.

alter table public.cognitive_provider_independent_visual_canary_authorizations
  drop constraint cognitive_visual_canary_target_pair_check,
  add constraint cognitive_visual_canary_target_pair_check check (
    (target_task_id is null and target_platform is null)
    or (
      target_task_id is not null
      and target_platform in ('android','ios')
    )
  );

alter table public.cognitive_provider_independent_visual_activation_outcomes
  drop constraint cognitive_visual_outcome_target_pair_check,
  add constraint cognitive_visual_outcome_target_pair_check check (
    (target_task_id is null and target_platform is null)
    or (
      target_task_id is not null
      and target_platform in ('android','ios')
    )
  );

create table public.cognitive_ios_visual_canary_preflight_receipts (
  id uuid primary key default gen_random_uuid(),
  shared_task_id uuid not null,
  target_task_id uuid not null,
  project_id uuid not null,
  shared_platform public.cognitive_platform not null default 'shared'
    check (shared_platform = 'shared'),
  target_platform public.cognitive_platform not null default 'ios'
    check (target_platform = 'ios'),
  environment public.cognitive_environment not null default 'production'
    check (environment = 'production'),
  owner_user_id uuid not null,
  evidence_manifest_hash text not null check (
    evidence_manifest_hash ~ '^[a-f0-9]{64}$'
  ),
  metric_manifest_hash text not null check (
    metric_manifest_hash ~ '^[a-f0-9]{64}$'
  ),
  source_build_hash text not null check (
    source_build_hash ~ '^[a-f0-9]{64}$'
  ),
  result_status text not null check (
    result_status in ('passed','failed')
  ),
  physical_proof_status text not null check (
    physical_proof_status = 'verified_physical'
  ),
  generic_predicates_passed boolean not null check (
    generic_predicates_passed
  ),
  detailed_validator_passed boolean not null check (
    detailed_validator_passed
  ),
  receipt_hash text not null unique check (
    receipt_hash ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  expires_at timestamptz not null,
  unique (
    id, shared_task_id, target_task_id, project_id,
    shared_platform, target_platform, environment
  ),
  foreign key (
    shared_task_id, project_id, shared_platform, environment
  ) references public.intelligence_tasks(
    id, project_id, platform, environment
  ),
  foreign key (
    target_task_id, project_id, target_platform, environment
  ) references public.intelligence_tasks(
    id, project_id, platform, environment
  ),
  check (
    expires_at > created_at
    and expires_at <= created_at + interval '15 minutes'
  )
);

alter table public.cognitive_ios_visual_canary_preflight_receipts
  enable row level security;
alter table public.cognitive_ios_visual_canary_preflight_receipts
  force row level security;

revoke all on table
  public.cognitive_ios_visual_canary_preflight_receipts
from public,anon,authenticated,service_role;
grant select on table
  public.cognitive_ios_visual_canary_preflight_receipts
to authenticated;

create policy cognitive_ios_visual_canary_preflight_receipts_owner_read
  on public.cognitive_ios_visual_canary_preflight_receipts
  for select
  to authenticated
  using (
    auth.uid() = owner_user_id
    and public.governance_exact_owner(auth.uid())
  );

create trigger cognitive_ios_visual_canary_preflight_receipts_immutable
before update or delete
on public.cognitive_ios_visual_canary_preflight_receipts
for each row execute function public.reject_cognitive_evidence_mutation();

alter table public.cognitive_provider_independent_visual_canary_authorizations
  add column ios_preflight_receipt_id uuid unique,
  add constraint cognitive_visual_canary_ios_preflight_pair_check check (
    (
      target_platform is distinct from 'ios'
      and ios_preflight_receipt_id is null
    )
    or (
      target_platform = 'ios'
      and ios_preflight_receipt_id is not null
    )
  ),
  add constraint cognitive_visual_canary_ios_preflight_fk foreign key (
    ios_preflight_receipt_id,
    task_id,
    target_task_id,
    project_id,
    platform,
    target_platform,
    environment
  ) references public.cognitive_ios_visual_canary_preflight_receipts(
    id,
    shared_task_id,
    target_task_id,
    project_id,
    shared_platform,
    target_platform,
    environment
  );

create function public.governance_prepare_ios_visual_canary_preflight(
  p_shared_task_id uuid,
  p_project_id uuid,
  p_evidence_manifest_hash text,
  p_source_build_hash text,
  p_metric_manifest jsonb,
  p_result_status text,
  p_physical_proof_status text,
  p_validity interval default interval '15 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  target_scope public.cognitive_product_sentinel_platform_scopes%rowtype;
  target_task public.intelligence_tasks%rowtype;
  target_switch public.cognitive_governance_switches%rowtype;
  generic_result jsonb;
  metric_manifest_hash_value text;
  receipt_id uuid := gen_random_uuid();
  receipt_hash_value text;
  now_at timestamptz := transaction_timestamp();
  expires_at_value timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cognitive-ios-visual-canary-preflight:'
        || p_shared_task_id::text,
      0
    )
  );

  select * into target_scope
  from public.cognitive_product_sentinel_platform_scopes scope
  where scope.shared_task_id = p_shared_task_id
    and scope.project_id = p_project_id
    and scope.shared_platform = 'shared'
    and scope.platform = 'ios'
    and scope.environment = 'production'
    and scope.source_commit =
      '6b9d7da6b8bb0d707a92fa19bd0058529e6e0a6a'
    and scope.policy_version = 'collective-governance-v1'
    and scope.retention_policy_hash =
      'f97c69b112f9e8ffcc133e2da052988a4cacd9790717e7f099a92e3f5d5f39f0'
  for share;

  select * into target_task
  from public.intelligence_tasks task
  where task.id = target_scope.platform_task_id
    and task.project_id = p_project_id
    and task.platform = 'ios'
    and task.environment = 'production'
    and task.repository_full_name =
      'Chillywood2025/chillywood-mobile'
    and task.branch_name =
      'codex/cognitive-level01-ios-sentinel-control'
    and task.task_key = 'cognitive-level01-canary-control'
    and task.parent_task_id is null
    and task.cancelled_at is null
    and task.quarantined_at is null
    and task.deadman_at > now_at
  for share;

  select * into target_switch
  from public.cognitive_governance_switches switch
  where switch.task_id = target_scope.platform_task_id
    and switch.project_id = p_project_id
    and switch.platform = 'ios'
    and switch.environment = 'production'
    and switch.switch_key =
      'cognitive_visual_experience_sentinel_enabled'
  for share;

  generic_result :=
    public.product_experience_generic_manifest_predicates(
      'visual_product_experience_sentinel',
      p_evidence_manifest_hash,
      p_metric_manifest
    );

  metric_manifest_hash_value := encode(
    extensions.digest(
      convert_to(p_metric_manifest::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  if target_scope.id is null
     or target_task.id is null
     or target_switch.id is null
     or target_switch.enabled
     or target_switch.policy_version <> 'collective-governance-v1'
     or p_evidence_manifest_hash !~ '^[a-f0-9]{64}$'
     or p_source_build_hash !~ '^[a-f0-9]{64}$'
     or p_result_status not in ('passed','failed')
     or p_physical_proof_status <> 'verified_physical'
     or p_validity <= interval '0 seconds'
     or p_validity > interval '15 minutes'
     or generic_result->>'failedSubpredicate' is not null
     or not public.product_experience_detailed_metric_manifest_is_valid(
       'visual_product_experience_sentinel',
       'ios',
       p_result_status,
       p_metric_manifest
     )
     or not public.governance_approval_emergency_active()
     or (
       select count(*)
       from public.cognitive_product_quality_service_capabilities capability
       where capability.task_id = target_scope.platform_task_id
         and capability.project_id = p_project_id
         and capability.platform = 'ios'
         and capability.environment = 'production'
         and capability.service_identity in (
           'cognitive_sentinel_collector',
           'cognitive_product_quality_triage'
         )
         and now_at < capability.expires_at
         and public.governance_exact_owner(capability.registered_by)
         and not exists (
           select 1
           from public.cognitive_product_quality_service_capability_revocations
             revocation
           where revocation.capability_id = capability.id
         )
     ) <> 2
     or exists (
       select 1
       from public.cognitive_governance_switches sibling
       where sibling.project_id = p_project_id
         and sibling.environment = 'production'
         and sibling.enabled
         and not (
           sibling.platform = 'android'
           and sibling.switch_key =
             'cognitive_visual_experience_sentinel_enabled'
           and sibling.policy_version =
             'provider-independent-visual-live-v2'
         )
     )
     or exists (
       select 1
       from public.cognitive_level01_schedule_definitions schedule
       where schedule.project_id = p_project_id
         and schedule.environment = 'production'
         and schedule.enabled
     )
     or exists (
       select 1
       from public.cognitive_provider_independent_visual_canary_authorizations
         authorization_row
       where authorization_row.task_id = p_shared_task_id
         and authorization_row.project_id = p_project_id
         and not exists (
           select 1
           from public.cognitive_provider_independent_visual_activation_outcomes
             outcome
           where outcome.authorization_id = authorization_row.id
         )
     ) then
    raise exception 'ios_visual_canary_preflight_rejected'
      using errcode = 'P0001';
  end if;

  expires_at_value := now_at + p_validity;
  receipt_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', 'provider-independent-ios-visual-preflight-v1',
    receipt_id::text, p_shared_task_id::text,
    target_scope.platform_task_id::text, p_project_id::text,
    owner_id::text, p_evidence_manifest_hash,
    metric_manifest_hash_value, p_source_build_hash,
    p_result_status, p_physical_proof_status,
    now_at::text, expires_at_value::text
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.cognitive_ios_visual_canary_preflight_receipts(
    id, shared_task_id, target_task_id, project_id,
    shared_platform, target_platform, environment, owner_user_id,
    evidence_manifest_hash, metric_manifest_hash, source_build_hash,
    result_status, physical_proof_status,
    generic_predicates_passed, detailed_validator_passed,
    receipt_hash, created_at, expires_at
  ) values (
    receipt_id, p_shared_task_id, target_scope.platform_task_id,
    p_project_id, 'shared', 'ios', 'production', owner_id,
    p_evidence_manifest_hash, metric_manifest_hash_value,
    p_source_build_hash, p_result_status, p_physical_proof_status,
    true, true, receipt_hash_value, now_at, expires_at_value
  );

  return jsonb_build_object(
    'receiptId', receipt_id,
    'receiptHash', receipt_hash_value,
    'targetTaskId', target_scope.platform_task_id,
    'targetPlatform', 'ios',
    'genericPredicates', 'PASS',
    'detailedValidator', 'PASS',
    'switchEnabled', false,
    'createdAt', now_at,
    'expiresAt', expires_at_value
  );
end;
$$;

revoke all on function
  public.governance_prepare_ios_visual_canary_preflight(
    uuid,uuid,text,text,jsonb,text,text,interval
  )
from public,anon,service_role;
grant execute on function
  public.governance_prepare_ios_visual_canary_preflight(
    uuid,uuid,text,text,jsonb,text,text,interval
  )
to authenticated;

create function public.governance_open_provider_independent_ios_visual_canary(
  p_preflight_receipt_id uuid,
  p_worker_source_commit text,
  p_worker_source_tree text,
  p_worker_source_module_graph_hash text,
  p_independent_review_hash text,
  p_tests_hash text,
  p_deployment_plan_hash text,
  p_rollback_hash text,
  p_validity interval default interval '30 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  receipt_value
    public.cognitive_ios_visual_canary_preflight_receipts%rowtype;
  target_switch public.cognitive_governance_switches%rowtype;
  baseline_value public.product_experience_baseline_versions%rowtype;
  approval_version public.governance_owner_approval_versions%rowtype;
  authorization_id uuid := gen_random_uuid();
  authorization_hash_value text;
  now_at timestamptz := transaction_timestamp();
  expires_at_value timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'provider-independent-ios-visual-canary-open:'
        || p_preflight_receipt_id::text,
      0
    )
  );

  select * into receipt_value
  from public.cognitive_ios_visual_canary_preflight_receipts receipt
  where receipt.id = p_preflight_receipt_id
  for share;

  select * into target_switch
  from public.cognitive_governance_switches switch
  where switch.task_id = receipt_value.target_task_id
    and switch.project_id = receipt_value.project_id
    and switch.platform = 'ios'
    and switch.environment = 'production'
    and switch.switch_key =
      'cognitive_visual_experience_sentinel_enabled'
  for update;

  select * into baseline_value
  from public.product_experience_baseline_versions baseline
  where baseline.task_id = receipt_value.shared_task_id
    and baseline.project_id = receipt_value.project_id
    and baseline.platform = 'shared'
    and baseline.environment = 'production'
    and baseline.baseline_identifier =
      'chillywood-product-experience-baseline-v1'
    and baseline.baseline_option = 'C'
    and baseline.baseline_option_name = 'creator_balanced'
    and baseline.baseline_hash =
      '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
    and baseline.status = 'owner_approved'
    and baseline.approved_at is not null
  for share;

  select * into approval_version
  from public.governance_owner_approval_versions version
  where version.id = baseline_value.owner_approval_version_id
  for share;

  if receipt_value.id is null
     or receipt_value.owner_user_id <> owner_id
     or receipt_value.target_platform <> 'ios'
     or receipt_value.environment <> 'production'
     or not receipt_value.generic_predicates_passed
     or not receipt_value.detailed_validator_passed
     or receipt_value.physical_proof_status <> 'verified_physical'
     or now_at >= receipt_value.expires_at
     or target_switch.id is null
     or target_switch.enabled
     or target_switch.policy_version <> 'collective-governance-v1'
     or p_worker_source_commit <>
        'e05ff68c426e2ccb1bc268e14e9e5d19ba64efa9'
     or p_worker_source_tree <>
        '5295d907e6806883e1de2dda5626d8e3a129783d'
     or p_worker_source_module_graph_hash <>
        '47779ee113dd79b7678569750aa2f96e4663e2e1ccc5b44262365817ce1611fb'
     or p_independent_review_hash <>
        '95e37b54d9f008fa55546f323c0be7dbf6ac24957e51bd95a3634e2e60686e67'
     or p_tests_hash <>
        '135df5593901bd206a22281ef596507aaa1c0c0d49294249a2509d58d260f7d6'
     or p_deployment_plan_hash <>
        'e39fd94c10a2612ac2d3fb2f41cecb03db52c249b55e92fb9ab4aa84cfa6b6fd'
     or p_rollback_hash <>
        '1bf97af3ea0fed5fa80ffe534f3596ade6912fdca01e46c4e7abf4640c3c168f'
     or p_validity <= interval '0 seconds'
     or p_validity > interval '30 minutes'
     or baseline_value.id is null
     or approval_version.id is null
     or approval_version.repository_full_name <>
        'Chillywood2025/chillywood-mobile'
     or not public.governance_approval_emergency_active()
     or (
       select count(*)
       from public.cognitive_product_quality_service_capabilities capability
       where capability.task_id = receipt_value.target_task_id
         and capability.project_id = receipt_value.project_id
         and capability.platform = 'ios'
         and capability.environment = 'production'
         and capability.service_identity in (
           'cognitive_sentinel_collector',
           'cognitive_product_quality_triage'
         )
         and now_at < capability.expires_at
         and public.governance_exact_owner(capability.registered_by)
         and not exists (
           select 1
           from public.cognitive_product_quality_service_capability_revocations
             revocation
           where revocation.capability_id = capability.id
         )
     ) <> 2
     or exists (
       select 1
       from public.cognitive_governance_switches sibling
       where sibling.project_id = receipt_value.project_id
         and sibling.environment = 'production'
         and sibling.enabled
         and not (
           sibling.platform = 'android'
           and sibling.switch_key =
             'cognitive_visual_experience_sentinel_enabled'
           and sibling.policy_version =
             'provider-independent-visual-live-v2'
         )
     )
     or exists (
       select 1
       from public.cognitive_level01_schedule_definitions schedule
       where schedule.project_id = receipt_value.project_id
         and schedule.environment = 'production'
         and schedule.enabled
     )
     or exists (
       select 1
       from public.cognitive_provider_independent_visual_canary_authorizations
         authorization_row
       where authorization_row.task_id = receipt_value.shared_task_id
         and authorization_row.project_id = receipt_value.project_id
         and not exists (
           select 1
           from public.cognitive_provider_independent_visual_activation_outcomes
             outcome
           where outcome.authorization_id = authorization_row.id
         )
     )
     or exists (
       select 1
       from public.cognitive_provider_independent_visual_canary_authorizations
         authorization_row
       where authorization_row.ios_preflight_receipt_id = receipt_value.id
     ) then
    raise exception 'provider_independent_ios_visual_canary_authorization_rejected'
      using errcode = 'P0001';
  end if;

  expires_at_value := now_at + p_validity;
  authorization_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', 'provider-independent-ios-visual-canary-authorization-v1',
    authorization_id::text, receipt_value.id::text,
    receipt_value.shared_task_id::text,
    receipt_value.target_task_id::text,
    receipt_value.project_id::text, owner_id::text,
    baseline_value.id::text, approval_version.id::text,
    p_worker_source_commit, p_worker_source_tree,
    p_worker_source_module_graph_hash, p_independent_review_hash,
    p_tests_hash, p_deployment_plan_hash, p_rollback_hash,
    receipt_value.metric_manifest_hash,
    receipt_value.evidence_manifest_hash,
    now_at::text, expires_at_value::text
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.cognitive_provider_independent_visual_canary_authorizations(
    id, task_id, project_id, platform, environment, owner_user_id,
    baseline_version_id, owner_approval_version_id,
    worker_source_commit, worker_source_tree,
    worker_source_module_graph_hash, independent_review_hash, tests_hash,
    deployment_plan_hash, rollback_hash, authorization_hash,
    opened_at, expires_at, target_task_id, target_platform,
    ios_preflight_receipt_id
  ) values (
    authorization_id, receipt_value.shared_task_id,
    receipt_value.project_id, 'shared', 'production', owner_id,
    baseline_value.id, approval_version.id,
    p_worker_source_commit, p_worker_source_tree,
    p_worker_source_module_graph_hash, p_independent_review_hash,
    p_tests_hash, p_deployment_plan_hash, p_rollback_hash,
    authorization_hash_value, now_at, expires_at_value,
    receipt_value.target_task_id, 'ios', receipt_value.id
  );

  update public.cognitive_governance_switches
  set enabled = true,
      policy_version = 'provider-independent-ios-visual-canary-v1',
      enabled_by = owner_id,
      enabled_at = now_at,
      disabled_at = null,
      updated_at = now_at
  where id = target_switch.id
    and not enabled
    and policy_version = 'collective-governance-v1';

  if not found then
    raise exception 'provider_independent_ios_visual_canary_authorization_rejected'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'authorizationId', authorization_id,
    'authorizationHash', authorization_hash_value,
    'preflightReceiptId', receipt_value.id,
    'switchKey', target_switch.switch_key,
    'enabled', true,
    'policyVersion', 'provider-independent-ios-visual-canary-v1',
    'targetTaskId', receipt_value.target_task_id,
    'targetPlatform', 'ios',
    'openedAt', now_at,
    'expiresAt', expires_at_value
  );
end;
$$;

revoke all on function
  public.governance_open_provider_independent_ios_visual_canary(
    uuid,text,text,text,text,text,text,text,interval
  )
from public,anon,service_role;
grant execute on function
  public.governance_open_provider_independent_ios_visual_canary(
    uuid,text,text,text,text,text,text,text,interval
  )
to authenticated;

create function
  public.governance_finalize_provider_independent_ios_visual_canary(
    p_authorization_id uuid,
    p_enable boolean,
    p_canary_receipt_hash text,
    p_emergency_stop_receipt_hash text,
    p_rollback_receipt_hash text
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  authorization_value
    public.cognitive_provider_independent_visual_canary_authorizations%rowtype;
  target_switch public.cognitive_governance_switches%rowtype;
  sentinel_run_count_value integer := 0;
  evaluator_proof_count_value integer := 0;
  triage_consumption_count_value integer := 0;
  finding_event_count_value integer := 0;
  outcome_id uuid := gen_random_uuid();
  outcome_hash_value text;
  now_at timestamptz := transaction_timestamp();
begin
  select * into authorization_value
  from public.cognitive_provider_independent_visual_canary_authorizations value
  where value.id = p_authorization_id
  for share;

  select * into target_switch
  from public.cognitive_governance_switches switch
  where switch.task_id = authorization_value.target_task_id
    and switch.project_id = authorization_value.project_id
    and switch.platform = 'ios'
    and switch.environment = 'production'
    and switch.switch_key =
      'cognitive_visual_experience_sentinel_enabled'
  for update;

  if authorization_value.id is null
     or authorization_value.owner_user_id <> owner_id
     or authorization_value.target_task_id is null
     or authorization_value.target_platform <> 'ios'
     or authorization_value.ios_preflight_receipt_id is null
     or target_switch.id is null
     or not target_switch.enabled
     or target_switch.policy_version <>
        'provider-independent-ios-visual-canary-v1'
     or (p_enable and now_at >= authorization_value.expires_at)
     or p_canary_receipt_hash !~ '^[a-f0-9]{64}$'
     or p_emergency_stop_receipt_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_receipt_hash !~ '^[a-f0-9]{64}$'
     or exists (
       select 1
       from public.cognitive_provider_independent_visual_activation_outcomes
         outcome
       where outcome.authorization_id = authorization_value.id
     ) then
    raise exception 'provider_independent_ios_visual_canary_finalization_rejected'
      using errcode = 'P0001';
  end if;

  if p_enable then
    select count(*)::integer into sentinel_run_count_value
    from public.product_experience_sentinel_runs run
    where run.task_id = authorization_value.target_task_id
      and run.project_id = authorization_value.project_id
      and run.platform = 'ios'
      and run.environment = 'production'
      and run.sentinel_key = 'visual_product_experience_sentinel'
      and run.created_at >= authorization_value.opened_at
      and run.erased_at is null;

    select count(*)::integer into evaluator_proof_count_value
    from public.product_experience_sentinel_evaluator_proofs proof
    join public.product_experience_sentinel_runs run
      on run.id = proof.sentinel_run_id
    where run.task_id = authorization_value.target_task_id
      and run.project_id = authorization_value.project_id
      and run.platform = 'ios'
      and run.environment = 'production'
      and run.sentinel_key = 'visual_product_experience_sentinel'
      and run.created_at >= authorization_value.opened_at
      and proof.verdict = 'passed'
      and proof.assessment_kind in (
        'finding_detection','run_no_finding','finding_resolution'
      );

    select count(*)::integer into triage_consumption_count_value
    from public.product_experience_sentinel_evaluator_proof_consumptions
      consumption
    join public.product_experience_sentinel_evaluator_proofs proof
      on proof.id = consumption.evaluator_proof_id
    join public.product_experience_sentinel_runs run
      on run.id = proof.sentinel_run_id
    where run.task_id = authorization_value.target_task_id
      and run.project_id = authorization_value.project_id
      and run.platform = 'ios'
      and run.environment = 'production'
      and run.sentinel_key = 'visual_product_experience_sentinel'
      and run.created_at >= authorization_value.opened_at;

    select count(*)::integer into finding_event_count_value
    from public.product_quality_finding_events event
    join public.product_experience_sentinel_runs run
      on run.id = event.sentinel_run_id
    where run.task_id = authorization_value.target_task_id
      and run.project_id = authorization_value.project_id
      and run.platform = 'ios'
      and run.environment = 'production'
      and run.sentinel_key = 'visual_product_experience_sentinel'
      and run.created_at >= authorization_value.opened_at;

    if sentinel_run_count_value < 3
       or evaluator_proof_count_value < 3
       or triage_consumption_count_value < 3
       or finding_event_count_value < 2
       or exists (
         select required.assessment_kind
         from (
           values
             ('finding_detection'),
             ('run_no_finding'),
             ('finding_resolution')
         ) required(assessment_kind)
         where not exists (
           select 1
           from public.product_experience_sentinel_evaluator_proofs proof
           join public.product_experience_sentinel_runs run
             on run.id = proof.sentinel_run_id
           join public.product_experience_sentinel_evaluator_proof_consumptions
             consumption
             on consumption.evaluator_proof_id = proof.id
           where run.task_id = authorization_value.target_task_id
             and run.project_id = authorization_value.project_id
             and run.platform = 'ios'
             and run.environment = 'production'
             and run.sentinel_key =
               'visual_product_experience_sentinel'
             and run.created_at >= authorization_value.opened_at
             and proof.assessment_kind = required.assessment_kind
             and proof.verdict = 'passed'
         )
       )
       or not exists (
         select 1
         from public.product_experience_sentinel_runs run
         where run.task_id = authorization_value.target_task_id
           and run.project_id = authorization_value.project_id
           and run.platform = 'ios'
           and run.environment = 'production'
           and run.sentinel_key =
             'visual_product_experience_sentinel'
           and run.created_at >= authorization_value.opened_at
           and run.result_status = 'failed'
       )
       or (
         select count(*)
         from public.product_experience_sentinel_runs run
         where run.task_id = authorization_value.target_task_id
           and run.project_id = authorization_value.project_id
           and run.platform = 'ios'
           and run.environment = 'production'
           and run.sentinel_key =
             'visual_product_experience_sentinel'
           and run.created_at >= authorization_value.opened_at
           and run.result_status = 'passed'
       ) < 2
       or not exists (
         select 1
         from public.product_quality_findings finding
         join public.product_experience_sentinel_runs run
           on run.id = finding.sentinel_run_id
         where run.task_id = authorization_value.target_task_id
           and run.project_id = authorization_value.project_id
           and run.platform = 'ios'
           and run.environment = 'production'
           and run.created_at >= authorization_value.opened_at
           and finding.current_status = 'resolved'
       )
       or exists (
         select 1
         from public.product_quality_findings finding
         join public.product_experience_sentinel_runs run
           on run.id = finding.sentinel_run_id
         where run.task_id = authorization_value.target_task_id
           and run.project_id = authorization_value.project_id
           and run.platform = 'ios'
           and run.environment = 'production'
           and run.created_at >= authorization_value.opened_at
           and finding.current_status = 'open'
       )
       or not exists (
         select 1
         from public.autonomous_system_control_events event
         where event.system_id = 'product_intelligence_operator'
           and event.event_type = 'emergency_paused'
           and event.created_at >= authorization_value.opened_at
       )
       or not exists (
         select 1
         from public.autonomous_system_control_events event
         where event.system_id = 'product_intelligence_operator'
           and event.event_type = 'emergency_resumed'
           and event.created_at >= authorization_value.opened_at
       )
       or not exists (
         select 1
         from public.autonomous_system_emergency_states emergency
         where emergency.system_id = 'product_intelligence_operator'
           and emergency.status = 'active'
       )
       or exists (
         select 1
         from public.cognitive_governance_switches sibling
         where sibling.project_id = authorization_value.project_id
           and sibling.environment = 'production'
           and sibling.enabled
           and sibling.id <> target_switch.id
           and not (
             sibling.platform = 'android'
             and sibling.switch_key =
               'cognitive_visual_experience_sentinel_enabled'
             and sibling.policy_version =
               'provider-independent-visual-live-v2'
           )
       )
       or exists (
         select 1
         from public.cognitive_level01_schedule_definitions schedule
         where schedule.project_id = authorization_value.project_id
           and schedule.environment = 'production'
           and schedule.enabled
       ) then
      raise exception 'provider_independent_ios_visual_canary_finalization_rejected'
        using errcode = 'P0001';
    end if;
  end if;

  outcome_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', 'provider-independent-ios-visual-canary-outcome-v1',
    outcome_id::text, authorization_value.id::text, owner_id::text,
    authorization_value.target_task_id::text, 'ios',
    p_enable::text, sentinel_run_count_value::text,
    evaluator_proof_count_value::text,
    triage_consumption_count_value::text, finding_event_count_value::text,
    p_canary_receipt_hash, p_emergency_stop_receipt_hash,
    p_rollback_receipt_hash, now_at::text
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.cognitive_provider_independent_visual_activation_outcomes(
    id, authorization_id, task_id, project_id, platform, environment,
    owner_user_id, enabled, sentinel_run_count, evaluator_proof_count,
    triage_consumption_count, finding_event_count, canary_receipt_hash,
    emergency_stop_receipt_hash, rollback_receipt_hash, outcome_hash,
    created_at, target_task_id, target_platform
  ) values (
    outcome_id, authorization_value.id, authorization_value.task_id,
    authorization_value.project_id, authorization_value.platform,
    authorization_value.environment, owner_id, p_enable,
    sentinel_run_count_value, evaluator_proof_count_value,
    triage_consumption_count_value, finding_event_count_value,
    p_canary_receipt_hash, p_emergency_stop_receipt_hash,
    p_rollback_receipt_hash, outcome_hash_value, now_at,
    authorization_value.target_task_id, 'ios'
  );

  update public.cognitive_governance_switches
  set enabled = p_enable,
      policy_version = case
        when p_enable then 'provider-independent-ios-visual-live-v1'
        else 'provider-independent-ios-visual-canary-rolled-back-v1'
      end,
      enabled_by = case when p_enable then owner_id else null end,
      enabled_at = case when p_enable then enabled_at else null end,
      disabled_at = case when p_enable then null else now_at end,
      updated_at = now_at
  where id = target_switch.id;

  return jsonb_build_object(
    'outcomeId', outcome_id,
    'outcomeHash', outcome_hash_value,
    'authorizationId', authorization_value.id,
    'switchKey', target_switch.switch_key,
    'enabled', p_enable,
    'policyVersion', case
      when p_enable then 'provider-independent-ios-visual-live-v1'
      else 'provider-independent-ios-visual-canary-rolled-back-v1'
    end,
    'targetTaskId', authorization_value.target_task_id,
    'targetPlatform', 'ios',
    'sentinelRunCount', sentinel_run_count_value,
    'evaluatorProofCount', evaluator_proof_count_value,
    'triageConsumptionCount', triage_consumption_count_value,
    'findingEventCount', finding_event_count_value,
    'completedAt', now_at
  );
end;
$$;

revoke all on function
  public.governance_finalize_provider_independent_ios_visual_canary(
    uuid,boolean,text,text,text
  )
from public,anon,service_role;
grant execute on function
  public.governance_finalize_provider_independent_ios_visual_canary(
    uuid,boolean,text,text,text
  )
to authenticated;

create or replace function public.product_experience_lock_exact_sentinel_switch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  switch_key_value text;
  switch_enabled boolean := false;
  switch_policy_version text;
  canary_authorized boolean := false;
begin
  switch_key_value := case new.sentinel_key
    when 'livekit_experience_sentinel'
      then 'cognitive_livekit_experience_sentinel_enabled'
    when 'visual_product_experience_sentinel'
      then 'cognitive_visual_experience_sentinel_enabled'
    when 'installed_journey_sentinel'
      then 'cognitive_installed_journey_sentinel_enabled'
    else null
  end;

  select switch.enabled, switch.policy_version
  into switch_enabled, switch_policy_version
  from public.cognitive_governance_switches switch
  where switch.task_id = new.task_id
    and switch.project_id = new.project_id
    and switch.platform = new.platform
    and switch.environment = new.environment
    and switch.switch_key = switch_key_value
  for share;

  if switch_key_value is null or switch_enabled is distinct from true then
    raise exception 'product_experience_sentinel_switch_required'
      using errcode = '42501';
  end if;

  if new.sentinel_key = 'visual_product_experience_sentinel'
     and switch_policy_version in (
       'provider-independent-visual-canary-v1',
       'provider-independent-visual-canary-v2',
       'provider-independent-ios-visual-canary-v1'
     ) then
    select exists (
      select 1
      from public.cognitive_provider_independent_visual_canary_authorizations
        authorization_row
      where authorization_row.project_id = new.project_id
        and authorization_row.environment = new.environment
        and (
          (
            switch_policy_version =
              'provider-independent-visual-canary-v1'
            and authorization_row.task_id = new.task_id
            and authorization_row.platform = new.platform
          )
          or (
            switch_policy_version in (
              'provider-independent-visual-canary-v2',
              'provider-independent-ios-visual-canary-v1'
            )
            and authorization_row.target_task_id = new.task_id
            and authorization_row.target_platform = new.platform
          )
        )
        and (
          switch_policy_version <>
            'provider-independent-ios-visual-canary-v1'
          or authorization_row.ios_preflight_receipt_id is not null
        )
        and transaction_timestamp() < authorization_row.expires_at
        and not exists (
          select 1
          from public.cognitive_provider_independent_visual_activation_outcomes
            outcome
          where outcome.authorization_id = authorization_row.id
        )
    ) into canary_authorized;

    if not canary_authorized then
      raise exception 'product_experience_visual_canary_expired'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.product_experience_lock_exact_sentinel_switch()
from public,anon,authenticated,service_role;

comment on table
  public.cognitive_ios_visual_canary_preflight_receipts
is
  'Immutable hashes-only proof that one physical iOS manifest passed all fourteen generic predicates and the detailed iOS validator before authorization.';

comment on function
  public.governance_prepare_ios_visual_canary_preflight(
    uuid,uuid,text,text,jsonb,text,text,interval
  )
is
  'Creates one expiring hashes-only iOS preflight receipt after exact task, capability, switch, generic-manifest, detailed-validator, emergency, and schedule checks; never enables a switch.';

comment on function
  public.governance_open_provider_independent_ios_visual_canary(
    uuid,text,text,text,text,text,text,text,interval
  )
is
  'Consumes one fresh physical iOS preflight receipt to open one exact reviewed iOS-only visual authorization; Android evidence cannot satisfy the receipt.';

comment on function
  public.governance_finalize_provider_independent_ios_visual_canary(
    uuid,boolean,text,text,text
  )
is
  'Finalizes only an iOS authorization after iOS-only collector, evaluator, triage, finding/no-finding/resolution, emergency-stop, and rollback evidence.';
