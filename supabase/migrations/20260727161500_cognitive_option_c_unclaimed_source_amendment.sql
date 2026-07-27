-- Forward-only source amendment for the provider-independent Option C Owner
-- approval when a live canary finds a runtime defect before the single claim.
--
-- The immutable decision and version-1 approval remain intact. This path may
-- create exactly one version-2 approval only while the first approval is
-- unclaimed, no execution exists, and the amendment binds the reviewed
-- Hyperdrive startup-timeout repair to its exact commit, tree, source graph,
-- review, tests, plan snapshot, and rollback evidence.

create table public.product_experience_baseline_owner_source_amendments (
  id uuid primary key default gen_random_uuid(),
  decision_manifest_id uuid not null,
  approval_record_id uuid not null unique,
  prior_approval_version_id uuid not null unique,
  amended_approval_version_id uuid not null unique,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  owner_user_id uuid not null,
  prior_source_commit text not null check (
    prior_source_commit =
      'c0d6e8f5b403324fff2d12e89d456f9cbe5e4e38'
  ),
  amended_source_commit text not null check (
    amended_source_commit ~ '^[a-f0-9]{40}$'
    and amended_source_commit <> prior_source_commit
  ),
  amended_source_tree text not null check (
    amended_source_tree ~ '^[a-f0-9]{40}$'
  ),
  prior_source_module_graph_hash text not null check (
    prior_source_module_graph_hash =
      '0d377e19a200e0c970bef32ca141a588a7f4097d2c21ac69951ea19356edcb87'
  ),
  amended_source_module_graph_hash text not null check (
    amended_source_module_graph_hash =
      'b8d974ae532bc7b3a26230048376af19d507fb0fb64069c2660868ff0c547bf9'
  ),
  independent_review_hash text not null check (
    independent_review_hash ~ '^[a-f0-9]{64}$'
  ),
  tests_hash text not null check (tests_hash ~ '^[a-f0-9]{64}$'),
  plan_snapshot_hash text not null check (
    plan_snapshot_hash ~ '^[a-f0-9]{64}$'
  ),
  rollback_hash text not null check (rollback_hash ~ '^[a-f0-9]{64}$'),
  reason_code text not null check (
    reason_code = 'hyperdrive_initial_connection_timeout_alignment'
  ),
  amendment_hash text not null unique check (
    amendment_hash ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (id, task_id, project_id, platform, environment),
  foreign key (
    decision_manifest_id, task_id, project_id, platform, environment
  ) references public.governance_decision_manifests(
    id, task_id, project_id, platform, environment
  ),
  foreign key (
    approval_record_id, task_id, project_id, platform, environment
  ) references public.governance_owner_approval_records(
    id, task_id, project_id, platform, environment
  ),
  foreign key (
    prior_approval_version_id, task_id, project_id, platform, environment
  ) references public.governance_owner_approval_versions(
    id, task_id, project_id, platform, environment
  ),
  foreign key (
    amended_approval_version_id, task_id, project_id, platform, environment
  ) references public.governance_owner_approval_versions(
    id, task_id, project_id, platform, environment
  ),
  check (
    platform = 'shared'
    and environment = 'production'
  )
);

alter table public.product_experience_baseline_owner_source_amendments
  enable row level security;
alter table public.product_experience_baseline_owner_source_amendments
  force row level security;
revoke all on table
  public.product_experience_baseline_owner_source_amendments
from public, anon, authenticated, service_role;
grant select on table
  public.product_experience_baseline_owner_source_amendments
to authenticated;
create policy
  product_experience_baseline_owner_source_amendments_owner_read
on public.product_experience_baseline_owner_source_amendments
for select
to authenticated
using (
  auth.uid() = owner_user_id
  and public.governance_exact_owner(auth.uid())
);
create trigger
  product_experience_baseline_owner_source_amendments_immutable
before update or delete
on public.product_experience_baseline_owner_source_amendments
for each row
execute function public.reject_cognitive_evidence_mutation();

create function
  public.governance_amend_unclaimed_product_baseline_v1_owner_approval_source(
    p_prior_approval_version_id uuid,
    p_amended_source_commit text,
    p_amended_source_tree text,
    p_amended_source_module_graph_hash text,
    p_independent_review_hash text,
    p_tests_hash text,
    p_plan_snapshot_hash text,
    p_rollback_hash text,
    p_validity interval default interval '24 hours'
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  prior_version public.governance_owner_approval_versions%rowtype;
  prior_state public.governance_owner_approval_version_states%rowtype;
  approval public.governance_owner_approval_records%rowtype;
  decision public.governance_decision_manifests%rowtype;
  baseline public.product_experience_baseline_owner_decisions%rowtype;
  amendment_id uuid := gen_random_uuid();
  amended_version_id uuid := gen_random_uuid();
  amendment_hash_value text;
  approval_scope_hash_value text;
  evaluator_requirement_hash_value text;
  approval_hash_value text;
  owner_hash_value text;
  event_sequence_value integer;
  expires_at_value timestamptz;
  now_at timestamptz := transaction_timestamp();
begin
  select * into prior_version
  from public.governance_owner_approval_versions version
  where version.id = p_prior_approval_version_id
  for update;

  select * into prior_state
  from public.governance_owner_approval_version_states state
  where state.approval_version_id = p_prior_approval_version_id
  for update;

  select * into approval
  from public.governance_owner_approval_records record
  where record.id = prior_version.approval_record_id
  for update;

  select * into decision
  from public.governance_decision_manifests manifest
  where manifest.id = prior_version.decision_manifest_id
  for share;

  select * into baseline
  from public.product_experience_baseline_owner_decisions owner_decision
  where owner_decision.decision_manifest_id =
    prior_version.decision_manifest_id
  for share;

  if prior_version.id is null
     or prior_state.approval_version_id is null
     or approval.id is null
     or decision.id is null
     or baseline.id is null
     or prior_version.owner_user_id <> owner_id
     or baseline.owner_user_id <> owner_id
     or prior_version.version_number <> 1
     or prior_version.prior_version_id is not null
     or approval.current_version <> 1
     or approval.current_state <> 'active'
     or prior_state.state <> 'active'
     or prior_state.revoked_at is not null
     or prior_state.superseded_at is not null
     or prior_state.cancelled_at is not null
     or prior_state.executions_claimed <> 0
     or prior_state.executions_completed <> 0
     or approval.executions_claimed <> 0
     or approval.executions_completed <> 0
     or exists (
       select 1
       from public.governance_approved_action_executions execution
       where execution.approval_version_id = prior_version.id
     )
     or exists (
       select 1
       from public.product_experience_baseline_owner_source_amendments existing
       where existing.approval_record_id = approval.id
     )
     or transaction_timestamp() >= prior_version.expires_at
     or transaction_timestamp() >= decision.expires_at
     or not public.governance_approval_emergency_active()
     or decision.status <> 'finalized'
     or decision.model_independence_status <>
        'PROVIDER_INDEPENDENT_OWNER_SELECTION_REVIEWED'
     or decision.model_independence_assessment_id <>
        'product-baseline-owner-selection-v1'
     or decision.model_independence_evidence_hash <>
        baseline.independent_review_hash
     or prior_version.source_commit <>
        'c0d6e8f5b403324fff2d12e89d456f9cbe5e4e38'
     or prior_version.architecture_graph_digest <>
        '0d377e19a200e0c970bef32ca141a588a7f4097d2c21ac69951ea19356edcb87'
     or baseline.source_commit <> prior_version.source_commit
     or baseline.source_module_graph_hash <>
        prior_version.architecture_graph_digest
     or baseline.baseline_identifier <>
        'chillywood-product-experience-baseline-v1'
     or baseline.selected_option_code <> 'C'
     or baseline.selected_option_name <> 'creator_balanced'
     or baseline.baseline_hash <>
        '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
     or p_amended_source_commit !~ '^[a-f0-9]{40}$'
     or p_amended_source_commit = prior_version.source_commit
     or p_amended_source_tree !~ '^[a-f0-9]{40}$'
     or p_amended_source_module_graph_hash <>
        'b8d974ae532bc7b3a26230048376af19d507fb0fb64069c2660868ff0c547bf9'
     or p_independent_review_hash !~ '^[a-f0-9]{64}$'
     or p_tests_hash !~ '^[a-f0-9]{64}$'
     or p_plan_snapshot_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash !~ '^[a-f0-9]{64}$'
     or p_validity <= interval '0 seconds'
     or p_validity > interval '24 hours' then
    raise exception
      'product_experience_baseline_source_amendment_rejected'
      using errcode = 'P0001';
  end if;

  expires_at_value := least(
    now_at + p_validity,
    prior_version.expires_at,
    decision.expires_at
  );
  if expires_at_value <= now_at then
    raise exception
      'product_experience_baseline_source_amendment_rejected'
      using errcode = 'P0001';
  end if;

  owner_hash_value := encode(extensions.digest(
    convert_to(owner_id::text, 'UTF8'), 'sha256'
  ), 'hex');
  amendment_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', 'product-baseline-v1-unclaimed-source-amendment',
    amendment_id::text, prior_version.id::text,
    decision.id::text, decision.decision_hash,
    prior_version.source_commit, p_amended_source_commit,
    baseline.source_tree, p_amended_source_tree,
    prior_version.architecture_graph_digest,
    p_amended_source_module_graph_hash,
    p_independent_review_hash, p_tests_hash,
    p_plan_snapshot_hash, p_rollback_hash, owner_id::text, now_at::text
  ), 'UTF8'), 'sha256'), 'hex');
  approval_scope_hash_value := encode(extensions.digest(convert_to(
    concat_ws(
      '|', 'product-baseline-v1-provider-independent-amended-scope',
      'visual_experience_canary', baseline.baseline_hash,
      p_amended_source_commit, p_amended_source_module_graph_hash
    ), 'UTF8'
  ), 'sha256'), 'hex');
  evaluator_requirement_hash_value := encode(extensions.digest(convert_to(
    concat_ws(
      '|', 'product-baseline-v1-independent-evaluator-required',
      'cognitive_product_quality_evaluator',
      'independent_evaluation', p_independent_review_hash
    ), 'UTF8'
  ), 'sha256'), 'hex');
  approval_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', 'product-baseline-v1-owner-source-amended-approval',
    prior_version.approval_hash, amendment_hash_value,
    p_amended_source_commit, p_amended_source_tree,
    p_amended_source_module_graph_hash, p_independent_review_hash,
    p_tests_hash, p_plan_snapshot_hash, p_rollback_hash,
    owner_id::text, now_at::text, expires_at_value::text
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.governance_owner_approval_versions(
    id, approval_record_id, decision_manifest_id, task_id, project_id,
    platform, environment, version_number, prior_version_id, owner_user_id,
    owner_identity_hash, decision_manifest_hash, plan_snapshot_hash,
    source_commit, architecture_graph_digest, approval_scope_hash,
    objective_hash, repository_full_name, branch_name, provider, operation,
    target_resource_hash, path_scope_hashes, table_scope_hashes,
    function_scope_hashes, budget_hash, maximum_cost, maximum_calls,
    maximum_bytes, maximum_executions, tests_hash, required_test_ids,
    evaluator_requirement_hash, rollback_hash, approval_hash,
    revalidation_hash, material_delta, approved_at, valid_from, expires_at
  ) values (
    amended_version_id, prior_version.approval_record_id,
    prior_version.decision_manifest_id, prior_version.task_id,
    prior_version.project_id, prior_version.platform,
    prior_version.environment, 2, prior_version.id, owner_id,
    owner_hash_value, prior_version.decision_manifest_hash,
    p_plan_snapshot_hash, p_amended_source_commit,
    p_amended_source_module_graph_hash, approval_scope_hash_value,
    prior_version.objective_hash, prior_version.repository_full_name,
    prior_version.branch_name, prior_version.provider,
    prior_version.operation, prior_version.target_resource_hash,
    prior_version.path_scope_hashes, prior_version.table_scope_hashes,
    prior_version.function_scope_hashes, prior_version.budget_hash,
    prior_version.maximum_cost, prior_version.maximum_calls,
    prior_version.maximum_bytes, prior_version.maximum_executions,
    p_tests_hash, prior_version.required_test_ids,
    evaluator_requirement_hash_value, p_rollback_hash,
    approval_hash_value, amendment_hash_value, true,
    now_at, now_at, expires_at_value
  );

  insert into public.product_experience_baseline_owner_source_amendments(
    id, decision_manifest_id, approval_record_id,
    prior_approval_version_id, amended_approval_version_id,
    task_id, project_id, platform, environment, owner_user_id,
    prior_source_commit, amended_source_commit, amended_source_tree,
    prior_source_module_graph_hash, amended_source_module_graph_hash,
    independent_review_hash, tests_hash, plan_snapshot_hash,
    rollback_hash, reason_code, amendment_hash
  ) values (
    amendment_id, prior_version.decision_manifest_id,
    prior_version.approval_record_id, prior_version.id,
    amended_version_id, prior_version.task_id, prior_version.project_id,
    prior_version.platform, prior_version.environment, owner_id,
    prior_version.source_commit, p_amended_source_commit,
    p_amended_source_tree, prior_version.architecture_graph_digest,
    p_amended_source_module_graph_hash, p_independent_review_hash,
    p_tests_hash, p_plan_snapshot_hash, p_rollback_hash,
    'hyperdrive_initial_connection_timeout_alignment',
    amendment_hash_value
  );

  update public.governance_owner_approval_version_states
  set state = 'superseded',
      superseded_at = now_at,
      updated_at = now_at
  where approval_version_id = prior_version.id
    and state = 'active'
    and executions_claimed = 0
    and executions_completed = 0;

  if not found then
    raise exception
      'product_experience_baseline_source_amendment_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.governance_owner_approval_version_states(
    approval_version_id, approval_record_id, task_id, project_id,
    platform, environment, state, maximum_executions
  ) values (
    amended_version_id, prior_version.approval_record_id,
    prior_version.task_id, prior_version.project_id,
    prior_version.platform, prior_version.environment,
    'active', prior_version.maximum_executions
  );

  update public.governance_owner_approval_records
  set current_version = 2,
      current_state = 'active',
      executions_claimed = 0,
      executions_completed = 0,
      approval_hash = approval_hash_value,
      updated_at = now_at
  where id = prior_version.approval_record_id
    and current_version = 1
    and current_state = 'active'
    and executions_claimed = 0
    and executions_completed = 0;

  if not found then
    raise exception
      'product_experience_baseline_source_amendment_rejected'
      using errcode = 'P0001';
  end if;

  select public.governance_approval_event_next_sequence(
    prior_version.approval_record_id
  ) into event_sequence_value;
  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id, approval_version_id, task_id, project_id,
    platform, environment, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    prior_version.approval_record_id, prior_version.id,
    prior_version.task_id, prior_version.project_id,
    prior_version.platform, prior_version.environment,
    event_sequence_value, 'superseded',
    amendment_hash_value, owner_hash_value
  );

  select public.governance_approval_event_next_sequence(
    prior_version.approval_record_id
  ) into event_sequence_value;
  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id, approval_version_id, task_id, project_id,
    platform, environment, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    prior_version.approval_record_id, amended_version_id,
    prior_version.task_id, prior_version.project_id,
    prior_version.platform, prior_version.environment,
    event_sequence_value, 'owner_approved',
    approval_hash_value, owner_hash_value
  );

  return jsonb_build_object(
    'amendmentId', amendment_id,
    'amendmentHash', amendment_hash_value,
    'approvalId', prior_version.approval_record_id,
    'approvalVersionId', amended_version_id,
    'approvalVersion', 2,
    'approvalHash', approval_hash_value,
    'decisionManifestId', decision.id,
    'decisionManifestHash', decision.decision_hash,
    'planSnapshotHash', p_plan_snapshot_hash,
    'sourceCommit', p_amended_source_commit,
    'sourceTree', p_amended_source_tree,
    'architectureGraphDigest',
      p_amended_source_module_graph_hash,
    'repositoryFullName', prior_version.repository_full_name,
    'branchName', prior_version.branch_name,
    'provider', prior_version.provider,
    'operation', prior_version.operation,
    'targetResourceHash', prior_version.target_resource_hash,
    'budgetHash', prior_version.budget_hash,
    'testsHash', p_tests_hash,
    'requiredTestIds', prior_version.required_test_ids,
    'evaluatorRequirementHash', evaluator_requirement_hash_value,
    'rollbackHash', p_rollback_hash,
    'baselineId', baseline.baseline_identifier,
    'selectedOptionCode', baseline.selected_option_code,
    'selectedOption', baseline.selected_option_name,
    'baselineHash', baseline.baseline_hash,
    'sourceOptionsManifestHash',
      baseline.source_options_manifest_hash,
    'status', 'active',
    'maximumExecutions', 1,
    'remainingExecutionAllowance', 1,
    'priorVersionState', 'superseded',
    'modelProviderUsed', false,
    'independentEvaluatorRequired', true,
    'uiMutationAuthority', false,
    'approvedAt', now_at,
    'expiresAt', expires_at_value
  );
end;
$$;

revoke all on function
  public.governance_amend_unclaimed_product_baseline_v1_owner_approval_source(
    uuid, text, text, text, text, text, text, text, interval
  )
from public, anon, service_role;
grant execute on function
  public.governance_amend_unclaimed_product_baseline_v1_owner_approval_source(
    uuid, text, text, text, text, text, text, text, interval
  )
to authenticated;

comment on table
  public.product_experience_baseline_owner_source_amendments
is
  'Immutable exact-Owner evidence that an unclaimed Option C approval was superseded by reviewed source after a live runtime canary defect; no selection, provider, or mutation authority changes.';

comment on function
  public.governance_amend_unclaimed_product_baseline_v1_owner_approval_source(
    uuid, text, text, text, text, text, text, text, interval
  )
is
  'Authenticated exact-Owner source amendment for the unclaimed provider-independent Option C approval; preserves immutable version 1 and grants exactly one version-2 claim.';
