-- Narrow provider-independent visual-sentinel activation.
--
-- The existing generic switch path correctly requires its own two-party
-- approval, but the visual collector also correctly refuses to persist a live
-- canary while its switch is off. This forward-only migration closes that
-- circular bootstrap with an exact-Owner, 30-minute authorization that is
-- available only after the completed Option C chain and four isolated core
-- identities are live. It cannot enable any sibling switch or schedule.

create table public.cognitive_provider_independent_visual_canary_authorizations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  owner_user_id uuid not null,
  baseline_version_id uuid not null,
  owner_approval_version_id uuid not null,
  worker_source_commit text not null check (
    worker_source_commit =
      '6b9d7da6b8bb0d707a92fa19bd0058529e6e0a6a'
  ),
  worker_source_tree text not null check (
    worker_source_tree =
      'cc040ff917f762d2c3d5e944202a00f7c68734cb'
  ),
  worker_source_module_graph_hash text not null check (
    worker_source_module_graph_hash =
      'd9a1b788775f358912946920106442036105e4f66b5bf72eb64518b1ee5b9a6f'
  ),
  independent_review_hash text not null check (
    independent_review_hash ~ '^[a-f0-9]{64}$'
  ),
  tests_hash text not null check (tests_hash ~ '^[a-f0-9]{64}$'),
  deployment_plan_hash text not null check (
    deployment_plan_hash ~ '^[a-f0-9]{64}$'
  ),
  rollback_hash text not null check (rollback_hash ~ '^[a-f0-9]{64}$'),
  authorization_hash text not null unique check (
    authorization_hash ~ '^[a-f0-9]{64}$'
  ),
  opened_at timestamptz not null default transaction_timestamp(),
  expires_at timestamptz not null,
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(
      id, project_id, platform, environment
    ),
  foreign key (
    baseline_version_id, task_id, project_id, platform, environment
  ) references public.product_experience_baseline_versions(
    id, task_id, project_id, platform, environment
  ),
  foreign key (
    owner_approval_version_id, task_id, project_id, platform, environment
  ) references public.governance_owner_approval_versions(
    id, task_id, project_id, platform, environment
  ),
  check (platform = 'shared' and environment = 'production'),
  check (
    expires_at > opened_at
    and expires_at <= opened_at + interval '30 minutes'
  )
);

create table public.cognitive_provider_independent_visual_activation_outcomes (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null unique,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  owner_user_id uuid not null,
  enabled boolean not null,
  sentinel_run_count integer not null check (
    sentinel_run_count between 0 and 100
  ),
  evaluator_proof_count integer not null check (
    evaluator_proof_count between 0 and 100
  ),
  triage_consumption_count integer not null check (
    triage_consumption_count between 0 and 100
  ),
  finding_event_count integer not null check (
    finding_event_count between 0 and 100
  ),
  canary_receipt_hash text not null check (
    canary_receipt_hash ~ '^[a-f0-9]{64}$'
  ),
  emergency_stop_receipt_hash text not null check (
    emergency_stop_receipt_hash ~ '^[a-f0-9]{64}$'
  ),
  rollback_receipt_hash text not null check (
    rollback_receipt_hash ~ '^[a-f0-9]{64}$'
  ),
  outcome_hash text not null unique check (
    outcome_hash ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (id, task_id, project_id, platform, environment),
  foreign key (
    authorization_id, task_id, project_id, platform, environment
  ) references public.cognitive_provider_independent_visual_canary_authorizations(
    id, task_id, project_id, platform, environment
  ),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(
      id, project_id, platform, environment
    ),
  check (platform = 'shared' and environment = 'production'),
  check (
    enabled
    or (
      sentinel_run_count = 0
      and evaluator_proof_count = 0
      and triage_consumption_count = 0
      and finding_event_count = 0
    )
  )
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cognitive_provider_independent_visual_canary_authorizations',
    'cognitive_provider_independent_visual_activation_outcomes'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated, service_role',
      table_name
    );
    execute format(
      'grant select on table public.%I to authenticated',
      table_name
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (
         auth.uid() = owner_user_id
         and public.governance_exact_owner(auth.uid())
       )',
      table_name || '_owner_read',
      table_name
    );
    execute format(
      'create trigger %I before update or delete on public.%I
       for each row execute function public.reject_cognitive_evidence_mutation()',
      table_name || '_immutable',
      table_name
    );
  end loop;
end;
$$;

create function public.governance_open_provider_independent_visual_canary(
  p_task_id uuid,
  p_project_id uuid,
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
  baseline_value public.product_experience_baseline_versions%rowtype;
  approval_version public.governance_owner_approval_versions%rowtype;
  approval_state public.governance_owner_approval_version_states%rowtype;
  approval_record public.governance_owner_approval_records%rowtype;
  switch_value public.cognitive_governance_switches%rowtype;
  authorization_id uuid := gen_random_uuid();
  authorization_hash_value text;
  now_at timestamptz := transaction_timestamp();
  expires_at_value timestamptz;
begin
  select * into switch_value
  from public.cognitive_governance_switches switch
  where switch.task_id = p_task_id
    and switch.project_id = p_project_id
    and switch.platform = 'shared'
    and switch.environment = 'production'
    and switch.switch_key = 'cognitive_visual_experience_sentinel_enabled'
  for update;

  select baseline.* into baseline_value
  from public.product_experience_baseline_versions baseline
  where baseline.task_id = p_task_id
    and baseline.project_id = p_project_id
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
  select * into approval_state
  from public.governance_owner_approval_version_states state
  where state.approval_version_id = approval_version.id
  for share;
  select * into approval_record
  from public.governance_owner_approval_records record
  where record.id = approval_version.approval_record_id
  for share;

  if switch_value.id is null
     or switch_value.enabled
     or p_worker_source_commit <>
        '6b9d7da6b8bb0d707a92fa19bd0058529e6e0a6a'
     or p_worker_source_tree <>
        'cc040ff917f762d2c3d5e944202a00f7c68734cb'
     or p_worker_source_module_graph_hash <>
        'd9a1b788775f358912946920106442036105e4f66b5bf72eb64518b1ee5b9a6f'
     or p_independent_review_hash !~ '^[a-f0-9]{64}$'
     or p_tests_hash !~ '^[a-f0-9]{64}$'
     or p_deployment_plan_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash !~ '^[a-f0-9]{64}$'
     or p_validity <= interval '0 seconds'
     or p_validity > interval '30 minutes'
     or baseline_value.id is null
     or approval_version.id is null
     or approval_version.version_number <> 3
     or approval_version.source_commit <> p_worker_source_commit
     or approval_version.architecture_graph_digest <>
        p_worker_source_module_graph_hash
     or approval_version.repository_full_name <>
        'Chillywood2025/chillywood-mobile'
     or approval_version.branch_name <>
        'codex/cognitive-level01-staged-worker-activation'
     or approval_version.operation <> 'visual_experience_canary'
     or approval_version.maximum_executions <> 1
     or approval_state.state <> 'completed'
     or approval_state.executions_claimed <> 1
     or approval_state.executions_completed <> 1
     or approval_record.current_version <> 3
     or approval_record.current_state <> 'completed'
     or approval_record.executions_claimed <> 1
     or approval_record.executions_completed <> 1
     or (
       select count(*)
       from public.product_experience_baseline_versions baseline
       where baseline.task_id = p_task_id
         and baseline.project_id = p_project_id
         and baseline.platform = 'shared'
         and baseline.environment = 'production'
         and baseline.status = 'owner_approved'
     ) <> 1
     or not exists (
       select 1
       from public.autonomous_system_emergency_states emergency
       where emergency.system_id = 'product_intelligence_operator'
         and emergency.status = 'active'
     )
     or exists (
       select 1
       from public.cognitive_governance_switches sibling
       where sibling.task_id = p_task_id
         and sibling.project_id = p_project_id
         and sibling.platform = 'shared'
         and sibling.environment = 'production'
         and sibling.enabled
     )
     or exists (
       select 1
       from public.cognitive_level01_schedule_definitions schedule
       where schedule.task_id = p_task_id
         and schedule.project_id = p_project_id
         and schedule.platform = 'shared'
         and schedule.environment = 'production'
         and schedule.enabled
     )
     or exists (
       select 1
       from public.cognitive_provider_independent_visual_canary_authorizations authorization_row
       where authorization_row.task_id = p_task_id
         and authorization_row.project_id = p_project_id
         and not exists (
           select 1
           from public.cognitive_provider_independent_visual_activation_outcomes outcome
           where outcome.authorization_id = authorization_row.id
         )
     )
     or (
       select count(*)
       from public.governance_two_party_service_assertions assertion
       where assertion.service_identity in (
         'product_experience_baseline_service',
         'cognitive_product_quality_evaluator'
       )
         and assertion.status = 'active'
         and assertion.revoked_at is null
         and now_at < assertion.expires_at
     ) <> 2
     or (
       select count(*)
       from public.cognitive_product_quality_service_capabilities capability
       where capability.task_id = p_task_id
         and capability.project_id = p_project_id
         and capability.platform = 'shared'
         and capability.environment = 'production'
         and capability.service_identity in (
           'cognitive_sentinel_collector',
           'cognitive_product_quality_triage'
         )
         and now_at < capability.expires_at
         and public.governance_exact_owner(capability.registered_by)
         and not exists (
           select 1
           from public.cognitive_product_quality_service_capability_revocations revocation
           where revocation.capability_id = capability.id
         )
     ) <> 2 then
    raise exception 'provider_independent_visual_canary_authorization_rejected'
      using errcode = 'P0001';
  end if;

  expires_at_value := now_at + p_validity;
  authorization_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', 'provider-independent-visual-canary-authorization-v1',
    authorization_id::text, p_task_id::text, p_project_id::text,
    owner_id::text, baseline_value.id::text, approval_version.id::text,
    p_worker_source_commit, p_worker_source_tree,
    p_worker_source_module_graph_hash, p_independent_review_hash,
    p_tests_hash, p_deployment_plan_hash, p_rollback_hash,
    now_at::text, expires_at_value::text
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.cognitive_provider_independent_visual_canary_authorizations(
    id, task_id, project_id, platform, environment, owner_user_id,
    baseline_version_id, owner_approval_version_id,
    worker_source_commit, worker_source_tree,
    worker_source_module_graph_hash, independent_review_hash, tests_hash,
    deployment_plan_hash, rollback_hash, authorization_hash,
    opened_at, expires_at
  ) values (
    authorization_id, p_task_id, p_project_id, 'shared', 'production',
    owner_id, baseline_value.id, approval_version.id,
    p_worker_source_commit, p_worker_source_tree,
    p_worker_source_module_graph_hash, p_independent_review_hash,
    p_tests_hash, p_deployment_plan_hash, p_rollback_hash,
    authorization_hash_value, now_at, expires_at_value
  );

  update public.cognitive_governance_switches
  set enabled = true,
      policy_version = 'provider-independent-visual-canary-v1',
      enabled_by = owner_id,
      enabled_at = now_at,
      disabled_at = null,
      updated_at = now_at
  where id = switch_value.id;

  return jsonb_build_object(
    'authorizationId', authorization_id,
    'authorizationHash', authorization_hash_value,
    'switchKey', switch_value.switch_key,
    'enabled', true,
    'policyVersion', 'provider-independent-visual-canary-v1',
    'baselineVersionId', baseline_value.id,
    'ownerApprovalVersionId', approval_version.id,
    'openedAt', now_at,
    'expiresAt', expires_at_value
  );
end;
$$;

create function public.governance_finalize_provider_independent_visual_canary(
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
  switch_value public.cognitive_governance_switches%rowtype;
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

  select * into switch_value
  from public.cognitive_governance_switches switch
  where switch.task_id = authorization_value.task_id
    and switch.project_id = authorization_value.project_id
    and switch.platform = authorization_value.platform
    and switch.environment = authorization_value.environment
    and switch.switch_key = 'cognitive_visual_experience_sentinel_enabled'
  for update;

  if authorization_value.id is null
     or authorization_value.owner_user_id <> owner_id
     or switch_value.id is null
     or not switch_value.enabled
     or switch_value.policy_version <>
        'provider-independent-visual-canary-v1'
     or (p_enable and now_at >= authorization_value.expires_at)
     or p_canary_receipt_hash !~ '^[a-f0-9]{64}$'
     or p_emergency_stop_receipt_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_receipt_hash !~ '^[a-f0-9]{64}$'
     or exists (
       select 1
       from public.cognitive_provider_independent_visual_activation_outcomes outcome
       where outcome.authorization_id = authorization_value.id
     ) then
    raise exception 'provider_independent_visual_canary_finalization_rejected'
      using errcode = 'P0001';
  end if;

  if p_enable then
    select count(*)::integer into sentinel_run_count_value
    from public.product_experience_sentinel_runs run
    where run.task_id = authorization_value.task_id
      and run.project_id = authorization_value.project_id
      and run.platform = authorization_value.platform
      and run.environment = authorization_value.environment
      and run.sentinel_key = 'visual_product_experience_sentinel'
      and run.created_at >= authorization_value.opened_at
      and run.erased_at is null;

    select count(*)::integer into evaluator_proof_count_value
    from public.product_experience_sentinel_evaluator_proofs proof
    join public.product_experience_sentinel_runs run
      on run.id = proof.sentinel_run_id
    where run.task_id = authorization_value.task_id
      and run.project_id = authorization_value.project_id
      and run.platform = authorization_value.platform
      and run.environment = authorization_value.environment
      and run.sentinel_key = 'visual_product_experience_sentinel'
      and run.created_at >= authorization_value.opened_at
      and proof.verdict = 'passed'
      and proof.assessment_kind in (
        'finding_detection', 'run_no_finding', 'finding_resolution'
      );

    select count(*)::integer into triage_consumption_count_value
    from public.product_experience_sentinel_evaluator_proof_consumptions consumption
    join public.product_experience_sentinel_evaluator_proofs proof
      on proof.id = consumption.evaluator_proof_id
    join public.product_experience_sentinel_runs run
      on run.id = proof.sentinel_run_id
    where run.task_id = authorization_value.task_id
      and run.project_id = authorization_value.project_id
      and run.platform = authorization_value.platform
      and run.environment = authorization_value.environment
      and run.sentinel_key = 'visual_product_experience_sentinel'
      and run.created_at >= authorization_value.opened_at;

    select count(*)::integer into finding_event_count_value
    from public.product_quality_finding_events event
    join public.product_experience_sentinel_runs run
      on run.id = event.sentinel_run_id
    where run.task_id = authorization_value.task_id
      and run.project_id = authorization_value.project_id
      and run.platform = authorization_value.platform
      and run.environment = authorization_value.environment
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
           where run.task_id = authorization_value.task_id
             and run.project_id = authorization_value.project_id
             and run.platform = authorization_value.platform
             and run.environment = authorization_value.environment
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
         where run.task_id = authorization_value.task_id
           and run.project_id = authorization_value.project_id
           and run.platform = authorization_value.platform
           and run.environment = authorization_value.environment
           and run.sentinel_key = 'visual_product_experience_sentinel'
           and run.created_at >= authorization_value.opened_at
           and run.result_status = 'failed'
       )
       or (
         select count(*)
         from public.product_experience_sentinel_runs run
         where run.task_id = authorization_value.task_id
           and run.project_id = authorization_value.project_id
           and run.platform = authorization_value.platform
           and run.environment = authorization_value.environment
           and run.sentinel_key = 'visual_product_experience_sentinel'
           and run.created_at >= authorization_value.opened_at
           and run.result_status = 'passed'
       ) < 2
       or not exists (
         select 1
         from public.product_quality_findings finding
         join public.product_experience_sentinel_runs run
           on run.id = finding.sentinel_run_id
         where run.task_id = authorization_value.task_id
           and run.project_id = authorization_value.project_id
           and run.platform = authorization_value.platform
           and run.environment = authorization_value.environment
           and run.created_at >= authorization_value.opened_at
           and finding.current_status = 'resolved'
       )
       or exists (
         select 1
         from public.product_quality_findings finding
         join public.product_experience_sentinel_runs run
           on run.id = finding.sentinel_run_id
         where run.task_id = authorization_value.task_id
           and run.project_id = authorization_value.project_id
           and run.platform = authorization_value.platform
           and run.environment = authorization_value.environment
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
         where sibling.task_id = authorization_value.task_id
           and sibling.project_id = authorization_value.project_id
           and sibling.platform = authorization_value.platform
           and sibling.environment = authorization_value.environment
           and sibling.switch_key <>
             'cognitive_visual_experience_sentinel_enabled'
           and sibling.enabled
       )
       or exists (
         select 1
         from public.cognitive_level01_schedule_definitions schedule
         where schedule.task_id = authorization_value.task_id
           and schedule.project_id = authorization_value.project_id
           and schedule.platform = authorization_value.platform
           and schedule.environment = authorization_value.environment
           and schedule.enabled
       ) then
      raise exception 'provider_independent_visual_canary_finalization_rejected'
        using errcode = 'P0001';
    end if;
  end if;

  outcome_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', 'provider-independent-visual-canary-outcome-v1',
    outcome_id::text, authorization_value.id::text, owner_id::text,
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
    created_at
  ) values (
    outcome_id, authorization_value.id, authorization_value.task_id,
    authorization_value.project_id, authorization_value.platform,
    authorization_value.environment, owner_id, p_enable,
    sentinel_run_count_value, evaluator_proof_count_value,
    triage_consumption_count_value, finding_event_count_value,
    p_canary_receipt_hash, p_emergency_stop_receipt_hash,
    p_rollback_receipt_hash, outcome_hash_value, now_at
  );

  update public.cognitive_governance_switches
  set enabled = p_enable,
      policy_version = case
        when p_enable then 'provider-independent-visual-live-v1'
        else 'provider-independent-visual-canary-rolled-back-v1'
      end,
      enabled_by = case when p_enable then owner_id else null end,
      enabled_at = case when p_enable then enabled_at else null end,
      disabled_at = case when p_enable then null else now_at end,
      updated_at = now_at
  where id = switch_value.id;

  return jsonb_build_object(
    'outcomeId', outcome_id,
    'outcomeHash', outcome_hash_value,
    'authorizationId', authorization_value.id,
    'switchKey', switch_value.switch_key,
    'enabled', p_enable,
    'policyVersion', case
      when p_enable then 'provider-independent-visual-live-v1'
      else 'provider-independent-visual-canary-rolled-back-v1'
    end,
    'sentinelRunCount', sentinel_run_count_value,
    'evaluatorProofCount', evaluator_proof_count_value,
    'triageConsumptionCount', triage_consumption_count_value,
    'findingEventCount', finding_event_count_value,
    'completedAt', now_at
  );
end;
$$;

-- A bounded canary must fail closed even if its Owner does not finalize before
-- expiry. The switch row remains an immutable audit truth until finalization,
-- while this existing table-boundary lock prevents any new visual collection
-- once the authorization window has elapsed.
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
     and switch_policy_version =
       'provider-independent-visual-canary-v1' then
    select exists (
      select 1
      from public.cognitive_provider_independent_visual_canary_authorizations
        authorization_row
      where authorization_row.task_id = new.task_id
        and authorization_row.project_id = new.project_id
        and authorization_row.platform = new.platform
        and authorization_row.environment = new.environment
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
from public, anon, authenticated, service_role;

revoke all on function
  public.governance_open_provider_independent_visual_canary(
    uuid, uuid, text, text, text, text, text, text, text, interval
  )
from public, anon, service_role;
grant execute on function
  public.governance_open_provider_independent_visual_canary(
    uuid, uuid, text, text, text, text, text, text, text, interval
  )
to authenticated;

revoke all on function
  public.governance_finalize_provider_independent_visual_canary(
    uuid, boolean, text, text, text
  )
from public, anon, service_role;
grant execute on function
  public.governance_finalize_provider_independent_visual_canary(
    uuid, boolean, text, text, text
  )
to authenticated;

comment on table
  public.cognitive_provider_independent_visual_canary_authorizations
is
  'Immutable exact-Owner, exact-source 30-minute authorization for the provider-independent visual sentinel only.';
comment on table
  public.cognitive_provider_independent_visual_activation_outcomes
is
  'Immutable visual-sentinel activation or rollback outcome; no sibling switch or schedule authority.';
comment on function
  public.governance_open_provider_independent_visual_canary(
    uuid, uuid, text, text, text, text, text, text, text, interval
  )
is
  'Opens only the reviewed visual-sentinel switch for a bounded live canary after exact completed Option C and isolated core credentials.';
comment on function
  public.governance_finalize_provider_independent_visual_canary(
    uuid, boolean, text, text, text
  )
is
  'Retains the visual switch only after live collection/evaluator/triage, resolution, emergency-stop and rollback evidence; otherwise records rollback.';
