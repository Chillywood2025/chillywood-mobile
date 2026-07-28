-- Forward-only second source revision for the still-unclaimed Option C Owner
-- approval after the live Worker proved that forcing TLS on Hyperdrive's
-- internal dynamic connection string prevents the first database handshake.
--
-- Versions 1 and 2 and the first immutable amendment remain unchanged.
-- This exact-Owner path can create version 3 only before any winning claim.

create table public.product_experience_baseline_owner_tls_source_revisions (
  id uuid primary key default gen_random_uuid(),
  first_amendment_id uuid not null unique references
    public.product_experience_baseline_owner_source_amendments(id),
  decision_manifest_id uuid not null,
  approval_record_id uuid not null unique,
  prior_approval_version_id uuid not null unique,
  revised_approval_version_id uuid not null unique,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  owner_user_id uuid not null,
  prior_source_commit text not null check (
    prior_source_commit =
      'a54c04518f85f17a9983e0bbe7699463262537e1'
  ),
  revised_source_commit text not null check (
    revised_source_commit ~ '^[a-f0-9]{40}$'
    and revised_source_commit <> prior_source_commit
  ),
  revised_source_tree text not null check (
    revised_source_tree ~ '^[a-f0-9]{40}$'
  ),
  prior_source_module_graph_hash text not null check (
    prior_source_module_graph_hash =
      'b8d974ae532bc7b3a26230048376af19d507fb0fb64069c2660868ff0c547bf9'
  ),
  revised_source_module_graph_hash text not null check (
    revised_source_module_graph_hash =
      'd9a1b788775f358912946920106442036105e4f66b5bf72eb64518b1ee5b9a6f'
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
    reason_code = 'hyperdrive_dynamic_connection_tls_mode'
  ),
  revision_hash text not null unique check (
    revision_hash ~ '^[a-f0-9]{64}$'
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
    revised_approval_version_id, task_id, project_id, platform, environment
  ) references public.governance_owner_approval_versions(
    id, task_id, project_id, platform, environment
  ),
  check (platform = 'shared' and environment = 'production')
);

alter table public.product_experience_baseline_owner_tls_source_revisions
  enable row level security;
alter table public.product_experience_baseline_owner_tls_source_revisions
  force row level security;
revoke all on table
  public.product_experience_baseline_owner_tls_source_revisions
from public, anon, authenticated, service_role;
grant select on table
  public.product_experience_baseline_owner_tls_source_revisions
to authenticated;
create policy product_experience_baseline_owner_tls_revision_owner_read
on public.product_experience_baseline_owner_tls_source_revisions
for select
to authenticated
using (
  auth.uid() = owner_user_id
  and public.governance_exact_owner(auth.uid())
);
create trigger product_experience_baseline_owner_tls_revision_immutable
before update or delete
on public.product_experience_baseline_owner_tls_source_revisions
for each row
execute function public.reject_cognitive_evidence_mutation();

create function public.governance_amend_unclaimed_option_c_v2_tls_source(
  p_prior_approval_version_id uuid,
  p_revised_source_commit text,
  p_revised_source_tree text,
  p_revised_source_module_graph_hash text,
  p_independent_review_hash text,
  p_tests_hash text,
  p_plan_snapshot_hash text,
  p_rollback_hash text,
  p_validity interval default interval '18 hours'
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
  first_amendment
    public.product_experience_baseline_owner_source_amendments%rowtype;
  revision_id uuid := gen_random_uuid();
  revised_version_id uuid := gen_random_uuid();
  revision_hash_value text;
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

  select * into first_amendment
  from public.product_experience_baseline_owner_source_amendments amendment
  where amendment.amended_approval_version_id = prior_version.id
  for share;

  if prior_version.id is null
     or prior_state.approval_version_id is null
     or approval.id is null
     or decision.id is null
     or baseline.id is null
     or first_amendment.id is null
     or prior_version.owner_user_id <> owner_id
     or baseline.owner_user_id <> owner_id
     or prior_version.version_number <> 2
     or prior_version.prior_version_id <>
        first_amendment.prior_approval_version_id
     or approval.current_version <> 2
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
       from public.product_experience_baseline_owner_tls_source_revisions existing
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
     or first_amendment.prior_source_commit <>
        'c0d6e8f5b403324fff2d12e89d456f9cbe5e4e38'
     or first_amendment.amended_source_commit <>
        'a54c04518f85f17a9983e0bbe7699463262537e1'
     or first_amendment.prior_source_module_graph_hash <>
        '0d377e19a200e0c970bef32ca141a588a7f4097d2c21ac69951ea19356edcb87'
     or first_amendment.amended_source_module_graph_hash <>
        'b8d974ae532bc7b3a26230048376af19d507fb0fb64069c2660868ff0c547bf9'
     or prior_version.source_commit <> first_amendment.amended_source_commit
     or prior_version.architecture_graph_digest <>
        first_amendment.amended_source_module_graph_hash
     or baseline.baseline_identifier <>
        'chillywood-product-experience-baseline-v1'
     or baseline.selected_option_code <> 'C'
     or baseline.selected_option_name <> 'creator_balanced'
     or baseline.baseline_hash <>
        '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
     or p_revised_source_commit !~ '^[a-f0-9]{40}$'
     or p_revised_source_commit = prior_version.source_commit
     or p_revised_source_tree !~ '^[a-f0-9]{40}$'
     or p_revised_source_module_graph_hash <>
        'd9a1b788775f358912946920106442036105e4f66b5bf72eb64518b1ee5b9a6f'
     or p_independent_review_hash !~ '^[a-f0-9]{64}$'
     or p_tests_hash !~ '^[a-f0-9]{64}$'
     or p_plan_snapshot_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash !~ '^[a-f0-9]{64}$'
     or p_validity <= interval '0 seconds'
     or p_validity > interval '18 hours' then
    raise exception 'product_experience_baseline_tls_revision_rejected'
      using errcode = 'P0001';
  end if;

  expires_at_value := least(
    now_at + p_validity,
    prior_version.expires_at,
    decision.expires_at
  );
  if expires_at_value <= now_at then
    raise exception 'product_experience_baseline_tls_revision_rejected'
      using errcode = 'P0001';
  end if;

  owner_hash_value := encode(extensions.digest(
    convert_to(owner_id::text, 'UTF8'), 'sha256'
  ), 'hex');
  revision_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', 'product-baseline-v1-unclaimed-hyperdrive-tls-source-revision',
    revision_id::text, prior_version.id::text,
    decision.id::text, decision.decision_hash,
    prior_version.source_commit, p_revised_source_commit,
    first_amendment.amended_source_tree, p_revised_source_tree,
    prior_version.architecture_graph_digest,
    p_revised_source_module_graph_hash,
    p_independent_review_hash, p_tests_hash,
    p_plan_snapshot_hash, p_rollback_hash, owner_id::text, now_at::text
  ), 'UTF8'), 'sha256'), 'hex');
  approval_scope_hash_value := encode(extensions.digest(convert_to(
    concat_ws(
      '|', 'product-baseline-v1-provider-independent-tls-revised-scope',
      'visual_experience_canary', baseline.baseline_hash,
      p_revised_source_commit, p_revised_source_module_graph_hash
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
    '|', 'product-baseline-v1-owner-tls-revised-approval',
    prior_version.approval_hash, revision_hash_value,
    p_revised_source_commit, p_revised_source_tree,
    p_revised_source_module_graph_hash, p_independent_review_hash,
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
    revised_version_id, prior_version.approval_record_id,
    prior_version.decision_manifest_id, prior_version.task_id,
    prior_version.project_id, prior_version.platform,
    prior_version.environment, 3, prior_version.id, owner_id,
    owner_hash_value, prior_version.decision_manifest_hash,
    p_plan_snapshot_hash, p_revised_source_commit,
    p_revised_source_module_graph_hash, approval_scope_hash_value,
    prior_version.objective_hash, prior_version.repository_full_name,
    prior_version.branch_name, prior_version.provider,
    prior_version.operation, prior_version.target_resource_hash,
    prior_version.path_scope_hashes, prior_version.table_scope_hashes,
    prior_version.function_scope_hashes, prior_version.budget_hash,
    prior_version.maximum_cost, prior_version.maximum_calls,
    prior_version.maximum_bytes, prior_version.maximum_executions,
    p_tests_hash, prior_version.required_test_ids,
    evaluator_requirement_hash_value, p_rollback_hash,
    approval_hash_value, revision_hash_value, true,
    now_at, now_at, expires_at_value
  );

  insert into
    public.product_experience_baseline_owner_tls_source_revisions(
      id, first_amendment_id, decision_manifest_id, approval_record_id,
      prior_approval_version_id, revised_approval_version_id,
      task_id, project_id, platform, environment, owner_user_id,
      prior_source_commit, revised_source_commit, revised_source_tree,
      prior_source_module_graph_hash, revised_source_module_graph_hash,
      independent_review_hash, tests_hash, plan_snapshot_hash,
      rollback_hash, reason_code, revision_hash
    ) values (
      revision_id, first_amendment.id, prior_version.decision_manifest_id,
      prior_version.approval_record_id, prior_version.id,
      revised_version_id, prior_version.task_id, prior_version.project_id,
      prior_version.platform, prior_version.environment, owner_id,
      prior_version.source_commit, p_revised_source_commit,
      p_revised_source_tree, prior_version.architecture_graph_digest,
      p_revised_source_module_graph_hash, p_independent_review_hash,
      p_tests_hash, p_plan_snapshot_hash, p_rollback_hash,
      'hyperdrive_dynamic_connection_tls_mode', revision_hash_value
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
    raise exception 'product_experience_baseline_tls_revision_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.governance_owner_approval_version_states(
    approval_version_id, approval_record_id, task_id, project_id,
    platform, environment, state, maximum_executions
  ) values (
    revised_version_id, prior_version.approval_record_id,
    prior_version.task_id, prior_version.project_id,
    prior_version.platform, prior_version.environment,
    'active', prior_version.maximum_executions
  );

  update public.governance_owner_approval_records
  set current_version = 3,
      current_state = 'active',
      executions_claimed = 0,
      executions_completed = 0,
      approval_hash = approval_hash_value,
      updated_at = now_at
  where id = prior_version.approval_record_id
    and current_version = 2
    and current_state = 'active'
    and executions_claimed = 0
    and executions_completed = 0;
  if not found then
    raise exception 'product_experience_baseline_tls_revision_rejected'
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
    revision_hash_value, owner_hash_value
  );

  select public.governance_approval_event_next_sequence(
    prior_version.approval_record_id
  ) into event_sequence_value;
  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id, approval_version_id, task_id, project_id,
    platform, environment, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    prior_version.approval_record_id, revised_version_id,
    prior_version.task_id, prior_version.project_id,
    prior_version.platform, prior_version.environment,
    event_sequence_value, 'owner_approved',
    approval_hash_value, owner_hash_value
  );

  return jsonb_build_object(
    'revisionId', revision_id,
    'revisionHash', revision_hash_value,
    'approvalId', prior_version.approval_record_id,
    'approvalVersionId', revised_version_id,
    'approvalVersion', 3,
    'approvalHash', approval_hash_value,
    'decisionManifestId', decision.id,
    'decisionManifestHash', decision.decision_hash,
    'planSnapshotHash', p_plan_snapshot_hash,
    'sourceCommit', p_revised_source_commit,
    'sourceTree', p_revised_source_tree,
    'architectureGraphDigest', p_revised_source_module_graph_hash,
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
    'sourceOptionsManifestHash', baseline.source_options_manifest_hash,
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
  public.governance_amend_unclaimed_option_c_v2_tls_source(
    uuid, text, text, text, text, text, text, text, interval
  )
from public, anon, service_role;
grant execute on function
  public.governance_amend_unclaimed_option_c_v2_tls_source(
    uuid, text, text, text, text, text, text, text, interval
  )
to authenticated;

comment on table
  public.product_experience_baseline_owner_tls_source_revisions
is
  'Immutable exact-Owner revision from unclaimed Option C approval version 2 to reviewed Hyperdrive dynamic-connection TLS source; no selection, provider, or mutation authority changes.';

comment on function
  public.governance_amend_unclaimed_option_c_v2_tls_source(
    uuid, text, text, text, text, text, text, text, interval
  )
is
  'Authenticated exact-Owner source revision for still-unclaimed Option C version 2; versions 1 and 2 remain immutable and version 3 grants exactly one claim.';
