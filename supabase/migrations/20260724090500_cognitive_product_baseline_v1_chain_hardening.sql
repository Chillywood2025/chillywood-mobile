-- Close the authenticated Owner -> baseline executor -> independent evaluator
-- -> immutable persistence path for the Owner-selected Chi'llywood product
-- experience baseline v1. This migration grants measurement-governance
-- authority only. It grants no UI, source, build, deploy, release, switch,
-- finding, role, rights, money, provider-product, or auth/RLS mutation.

alter table public.product_experience_baseline_versions
  add column baseline_identifier text,
  add column baseline_option_name text,
  add column source_commit text;

alter table public.product_experience_baseline_versions
  drop constraint product_experience_baseline_versions_canonical_v1_check;

alter table public.product_experience_baseline_versions
  add constraint product_experience_baseline_versions_identifier_check
    check (
      (
        status <> 'owner_approved'
        and approved_execution_id is null
        and baseline_manifest_hash is null
        and baseline_option is null
        and baseline_identifier is null
        and baseline_option_name is null
        and source_commit is null
      )
      or (
        status = 'owner_approved'
        and approved_execution_id is not null
        and baseline_identifier is not null
        and length(baseline_identifier) between 8 and 160
        and baseline_identifier ~
          '^chillywood-product-experience-baseline-v[1-9][0-9]*$'
        and baseline_option is not null
        and baseline_option ~ '^[A-Z][A-Z0-9_-]{0,31}$'
        and baseline_option_name is not null
        and baseline_option_name ~ '^[a-z][a-z0-9_]{2,63}$'
        and baseline_manifest_hash ~ '^[a-f0-9]{64}$'
        and source_commit ~ '^[a-f0-9]{40}$'
        and (
          baseline_identifier <>
            'chillywood-product-experience-baseline-v1'
          or (
            baseline_key = 'streaming_mobile_content_density'
            and baseline_option = 'C'
            and baseline_option_name = 'creator_balanced'
            and baseline_manifest_hash =
              '7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df'
            and baseline_hash =
              '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184'
          )
        )
      )
    );

create unique index product_experience_baseline_versions_identifier_unique
  on public.product_experience_baseline_versions(
    task_id, project_id, platform, environment, baseline_identifier
  )
  where baseline_identifier is not null;

create table public.product_experience_baseline_execution_stages (
  execution_id uuid primary key,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  baseline_identifier text not null check (
    baseline_identifier = 'chillywood-product-experience-baseline-v1'
  ),
  baseline_key text not null check (
    baseline_key = 'streaming_mobile_content_density'
  ),
  selected_option_code text not null check (selected_option_code = 'C'),
  selected_option_name text not null check (
    selected_option_name = 'creator_balanced'
  ),
  baseline_hash text not null check (
    baseline_hash =
      '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184'
  ),
  source_options_manifest_hash text not null check (
    source_options_manifest_hash =
      '7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df'
  ),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  stage_evidence_hash text not null unique check (
    stage_evidence_hash ~ '^[a-f0-9]{64}$'
  ),
  staged_by_identity_hash text not null check (
    staged_by_identity_hash ~ '^[a-f0-9]{64}$'
  ),
  staged_at timestamptz not null default transaction_timestamp(),
  unique (execution_id, task_id, project_id, platform, environment),
  foreign key (execution_id, task_id, project_id, platform, environment)
    references public.governance_approved_action_executions(
      id, task_id, project_id, platform, environment
    )
);

create table public.product_experience_baseline_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  baseline_version_id uuid not null,
  replacement_baseline_version_id uuid,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  event_sequence integer not null check (event_sequence between 1 and 1000),
  event_type text not null check (
    event_type in ('owner_approved','revoked','superseded')
  ),
  event_hash text not null check (event_hash ~ '^[a-f0-9]{64}$'),
  reason_hash text not null check (reason_hash ~ '^[a-f0-9]{64}$'),
  actor_user_id uuid not null,
  actor_identity_hash text not null check (
    actor_identity_hash ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (baseline_version_id, event_sequence),
  unique (id, task_id, project_id, platform, environment),
  foreign key (
    baseline_version_id, task_id, project_id, platform, environment
  )
    references public.product_experience_baseline_versions(
      id, task_id, project_id, platform, environment
    ),
  foreign key (
    replacement_baseline_version_id, task_id, project_id, platform, environment
  )
    references public.product_experience_baseline_versions(
      id, task_id, project_id, platform, environment
    ),
  check (
    (
      event_type in ('owner_approved','revoked')
      and replacement_baseline_version_id is null
    )
    or (
      event_type = 'superseded'
      and replacement_baseline_version_id is not null
      and replacement_baseline_version_id <> baseline_version_id
    )
  )
);

create unique index product_experience_baseline_terminal_event_unique
  on public.product_experience_baseline_lifecycle_events(baseline_version_id)
  where event_type in ('revoked','superseded');

alter table public.product_experience_baseline_execution_stages
  enable row level security;
alter table public.product_experience_baseline_execution_stages
  force row level security;
alter table public.product_experience_baseline_lifecycle_events
  enable row level security;
alter table public.product_experience_baseline_lifecycle_events
  force row level security;

revoke all on table public.product_experience_baseline_execution_stages
  from public, anon, authenticated, service_role;
revoke all on table public.product_experience_baseline_lifecycle_events
  from public, anon, authenticated, service_role;
grant select on table public.product_experience_baseline_execution_stages
  to authenticated, service_role;
grant select on table public.product_experience_baseline_lifecycle_events
  to authenticated, service_role;

create policy product_experience_baseline_execution_stages_exact_read
on public.product_experience_baseline_execution_stages
for select to authenticated
using (
  (select public.cognitive_can_read_scope(project_id, task_id, platform))
);

create policy product_experience_baseline_lifecycle_events_exact_read
on public.product_experience_baseline_lifecycle_events
for select to authenticated
using (
  (select public.cognitive_can_read_scope(project_id, task_id, platform))
);

create trigger product_experience_baseline_execution_stages_immutable
before update or delete on public.product_experience_baseline_execution_stages
for each row execute function public.reject_cognitive_evidence_mutation();

create trigger product_experience_baseline_lifecycle_events_immutable
before update or delete on public.product_experience_baseline_lifecycle_events
for each row execute function public.reject_cognitive_evidence_mutation();

create function public.product_experience_resolve_current_active_baseline(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_baseline_key text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with active as (
    select baseline.*
    from public.product_experience_baseline_versions baseline
    where baseline.task_id = p_task_id
      and baseline.project_id = p_project_id
      and baseline.platform = p_platform
      and baseline.environment = p_environment
      and baseline.baseline_key = p_baseline_key
      and baseline.status = 'owner_approved'
      and baseline.owner_approval_version_id is not null
      and baseline.approved_at is not null
      and exists (
        select 1
        from public.product_experience_baseline_lifecycle_events event
        where event.baseline_version_id = baseline.id
          and event.task_id = baseline.task_id
          and event.project_id = baseline.project_id
          and event.platform = baseline.platform
          and event.environment = baseline.environment
          and event.event_type = 'owner_approved'
      )
      and not exists (
        select 1
        from public.product_experience_baseline_lifecycle_events event
        where event.baseline_version_id = baseline.id
          and event.task_id = baseline.task_id
          and event.project_id = baseline.project_id
          and event.platform = baseline.platform
          and event.environment = baseline.environment
          and event.event_type in ('revoked','superseded')
      )
    order by baseline.baseline_version desc, baseline.id
    limit 1
  )
  select jsonb_build_object(
    'baselineVersionId', active.id,
    'baselineId', active.baseline_identifier,
    'baselineKey', active.baseline_key,
    'baselineVersion', active.baseline_version,
    'baselineHash', active.baseline_hash,
    'sourceOptionsManifestHash', active.baseline_manifest_hash,
    'selectedOptionCode', active.baseline_option,
    'selectedOption', active.baseline_option_name,
    'sourceCommit', active.source_commit,
    'ownerApprovalVersionId', active.owner_approval_version_id,
    'approvedExecutionId', active.approved_execution_id,
    'status', 'owner_approved'
  )
  from active;
$$;

revoke all on function public.product_experience_resolve_current_active_baseline(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text
) from public, anon;
grant execute on function public.product_experience_resolve_current_active_baseline(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text
) to authenticated, service_role;

create function public.governance_stage_product_experience_baseline_v1(
  p_execution_id uuid,
  p_service_identity text,
  p_worker_assertion text,
  p_source_commit text,
  p_baseline_identifier text,
  p_selected_option_code text,
  p_selected_option_name text,
  p_baseline_hash text,
  p_source_options_manifest_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_value public.governance_approved_action_executions%rowtype;
  approval_version_value public.governance_owner_approval_versions%rowtype;
  existing_stage public.product_experience_baseline_execution_stages%rowtype;
  service_identity_value text;
  stage_evidence_hash_value text;
  event_sequence_value integer;
  now_at timestamptz := transaction_timestamp();
begin
  select * into execution_value
  from public.governance_approved_action_executions execution
  where execution.id = p_execution_id
  for update;

  if execution_value.id is null then
    raise exception 'product_experience_baseline_stage_rejected'
      using errcode = 'P0001';
  end if;

  service_identity_value := public.governance_assert_two_party_service_principal(
    p_service_identity,
    p_worker_assertion,
    execution_value.operation
  );

  select * into approval_version_value
  from public.governance_owner_approval_versions version
  where version.id = execution_value.approval_version_id
  for share;

  stage_evidence_hash_value := encode(extensions.digest(convert_to(
    concat_ws(
      '|',
      'chillywood-product-experience-baseline-v1-stage',
      p_execution_id::text,
      p_source_commit,
      p_baseline_identifier,
      p_selected_option_code,
      p_selected_option_name,
      p_baseline_hash,
      p_source_options_manifest_hash
    ),
    'UTF8'
  ), 'sha256'), 'hex');

  select * into existing_stage
  from public.product_experience_baseline_execution_stages stage
  where stage.execution_id = p_execution_id
  for share;

  if existing_stage.execution_id is not null then
    if existing_stage.task_id <> execution_value.task_id
       or existing_stage.project_id <> execution_value.project_id
       or existing_stage.platform <> execution_value.platform
       or existing_stage.environment <> execution_value.environment
       or existing_stage.source_commit <> p_source_commit
       or existing_stage.baseline_identifier <> p_baseline_identifier
       or existing_stage.selected_option_code <> p_selected_option_code
       or existing_stage.selected_option_name <> p_selected_option_name
       or existing_stage.baseline_hash <> p_baseline_hash
       or existing_stage.source_options_manifest_hash <>
          p_source_options_manifest_hash
       or existing_stage.stage_evidence_hash <> stage_evidence_hash_value then
      raise exception 'product_experience_baseline_stage_rejected'
        using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'executionId', existing_stage.execution_id,
      'stageEvidenceHash', existing_stage.stage_evidence_hash,
      'state', execution_value.state,
      'created', false
    );
  end if;

  if approval_version_value.id is null
     or execution_value.service_identity <>
        'product_experience_baseline_service'
     or execution_value.service_identity <> service_identity_value
     or execution_value.operation <> 'visual_experience_canary'
     or execution_value.provider <> 'visual_sentinel'
     or execution_value.state <> 'executing'
     or not public.governance_lock_approved_execution_liveness(p_execution_id)
     or execution_value.target_resource_hash <>
        '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184'
     or approval_version_value.target_resource_hash <>
        execution_value.target_resource_hash
     or approval_version_value.source_commit <> p_source_commit
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_baseline_identifier <>
        'chillywood-product-experience-baseline-v1'
     or p_selected_option_code <> 'C'
     or p_selected_option_name <> 'creator_balanced'
     or p_baseline_hash <>
        '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184'
     or p_source_options_manifest_hash <>
        '7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df'
     or not public.governance_exact_owner(
       approval_version_value.owner_user_id
     ) then
    raise exception 'product_experience_baseline_stage_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.product_experience_baseline_execution_stages(
    execution_id, task_id, project_id, platform, environment,
    baseline_identifier, baseline_key, selected_option_code,
    selected_option_name, baseline_hash, source_options_manifest_hash,
    source_commit, stage_evidence_hash, staged_by_identity_hash, staged_at
  ) values (
    execution_value.id, execution_value.task_id, execution_value.project_id,
    execution_value.platform, execution_value.environment,
    p_baseline_identifier, 'streaming_mobile_content_density',
    p_selected_option_code, p_selected_option_name, p_baseline_hash,
    p_source_options_manifest_hash, p_source_commit,
    stage_evidence_hash_value, execution_value.service_identity_hash, now_at
  );

  update public.governance_approved_action_executions
  set state = 'postflight',
      updated_at = now_at
  where id = p_execution_id;

  select public.governance_approval_event_next_sequence(
    execution_value.approval_record_id
  ) into event_sequence_value;

  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id, approval_version_id, execution_id, task_id, project_id,
    platform, environment, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    execution_value.approval_record_id, execution_value.approval_version_id,
    execution_value.id, execution_value.task_id, execution_value.project_id,
    execution_value.platform, execution_value.environment,
    event_sequence_value, 'postflight', stage_evidence_hash_value,
    execution_value.service_identity_hash
  );

  return jsonb_build_object(
    'executionId', execution_value.id,
    'stageEvidenceHash', stage_evidence_hash_value,
    'state', 'postflight',
    'created', true
  );
end;
$$;

revoke all on function public.governance_stage_product_experience_baseline_v1(
  uuid,text,text,text,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.governance_stage_product_experience_baseline_v1(
  uuid,text,text,text,text,text,text,text,text
) to service_role;

create function public.governance_evaluate_product_experience_baseline_v1(
  p_execution_id uuid,
  p_evaluator_identity text,
  p_evaluator_assertion text,
  p_execution_receipt_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_value public.governance_approved_action_executions%rowtype;
  approval_version_value public.governance_owner_approval_versions%rowtype;
  stage_value public.product_experience_baseline_execution_stages%rowtype;
  evaluator_identity_value text;
  evaluator_proof_hash_value text;
  proof_result jsonb;
begin
  select * into execution_value
  from public.governance_approved_action_executions execution
  where execution.id = p_execution_id
  for update;

  if execution_value.id is null then
    raise exception 'product_experience_baseline_evaluation_rejected'
      using errcode = 'P0001';
  end if;

  evaluator_identity_value :=
    public.governance_assert_two_party_service_principal(
      p_evaluator_identity,
      p_evaluator_assertion,
      'independent_evaluation'
    );

  select * into approval_version_value
  from public.governance_owner_approval_versions version
  where version.id = execution_value.approval_version_id
  for share;

  select * into stage_value
  from public.product_experience_baseline_execution_stages stage
  where stage.execution_id = p_execution_id
  for share;

  if evaluator_identity_value <> 'cognitive_independent_evaluator'
     or evaluator_identity_value = execution_value.service_identity
     or execution_value.service_identity <>
        'product_experience_baseline_service'
     or execution_value.operation <> 'visual_experience_canary'
     or execution_value.provider <> 'visual_sentinel'
     or execution_value.state <> 'evaluating'
     or not public.governance_lock_approved_execution_liveness(p_execution_id)
     or p_execution_receipt_hash !~ '^[a-f0-9]{64}$'
     or approval_version_value.id is null
     or approval_version_value.source_commit <> stage_value.source_commit
     or approval_version_value.target_resource_hash <> stage_value.baseline_hash
     or not public.governance_exact_owner(
       approval_version_value.owner_user_id
     )
     or stage_value.execution_id is null
     or stage_value.task_id <> execution_value.task_id
     or stage_value.project_id <> execution_value.project_id
     or stage_value.platform <> execution_value.platform
     or stage_value.environment <> execution_value.environment
     or stage_value.baseline_identifier <>
        'chillywood-product-experience-baseline-v1'
     or stage_value.baseline_key <>
        'streaming_mobile_content_density'
     or stage_value.selected_option_code <> 'C'
     or stage_value.selected_option_name <> 'creator_balanced'
     or stage_value.baseline_hash <>
        '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184'
     or stage_value.source_options_manifest_hash <>
        '7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df'
     or stage_value.staged_by_identity_hash <>
        execution_value.service_identity_hash then
    raise exception 'product_experience_baseline_evaluation_rejected'
      using errcode = 'P0001';
  end if;

  evaluator_proof_hash_value := encode(extensions.digest(convert_to(
    concat_ws(
      '|',
      'chillywood-product-experience-baseline-v1-evaluation',
      execution_value.id::text,
      stage_value.stage_evidence_hash,
      p_execution_receipt_hash,
      execution_value.evaluator_requirement_hash,
      'passed'
    ),
    'UTF8'
  ), 'sha256'), 'hex');

  proof_result := public.governance_record_approved_execution_evaluator_proof(
    execution_value.id,
    evaluator_identity_value,
    p_evaluator_assertion,
    p_execution_receipt_hash,
    evaluator_proof_hash_value,
    'passed'
  );

  return proof_result || jsonb_build_object(
    'evaluatorProofHash', evaluator_proof_hash_value,
    'stageEvidenceHash', stage_value.stage_evidence_hash,
    'baselineId', stage_value.baseline_identifier,
    'selectedOptionCode', stage_value.selected_option_code,
    'selectedOption', stage_value.selected_option_name,
    'baselineHash', stage_value.baseline_hash,
    'sourceOptionsManifestHash', stage_value.source_options_manifest_hash,
    'sourceCommit', stage_value.source_commit,
    'selfApproval', false
  );
end;
$$;

revoke all on function public.governance_evaluate_product_experience_baseline_v1(
  uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.governance_evaluate_product_experience_baseline_v1(
  uuid,text,text,text
) to service_role;

create function public.governance_persist_product_experience_baseline_v1_internal(
  p_execution_id uuid,
  p_expected_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_value public.governance_approved_action_executions%rowtype;
  version_value public.governance_owner_approval_versions%rowtype;
  version_state_value public.governance_owner_approval_version_states%rowtype;
  approval_value public.governance_owner_approval_records%rowtype;
  decision_value public.governance_decision_manifests%rowtype;
  proof_value public.governance_approved_execution_evaluator_proofs%rowtype;
  stage_value public.product_experience_baseline_execution_stages%rowtype;
  existing_value public.product_experience_baseline_versions%rowtype;
  baseline_id_value uuid;
  baseline_version_value integer;
  approved_execution_count integer;
  event_hash_value text;
  now_at timestamptz := transaction_timestamp();
  baseline_identifier_value constant text :=
    'chillywood-product-experience-baseline-v1';
  baseline_key_value constant text :=
    'streaming_mobile_content_density';
  manifest_hash_value constant text :=
    '7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df';
  option_hash_value constant text :=
    '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184';
begin
  if p_execution_id is null then
    raise exception 'product_experience_baseline_persistence_rejected'
      using errcode = 'P0001';
  end if;

  select * into execution_value
  from public.governance_approved_action_executions execution
  where execution.id = p_execution_id
  for update;

  if execution_value.id is null then
    raise exception 'product_experience_baseline_persistence_rejected'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(
        '|',
        'product_experience_baseline',
        execution_value.task_id::text,
        execution_value.project_id::text,
        execution_value.platform::text,
        execution_value.environment::text,
        baseline_key_value
      ),
      0
    )
  );

  select * into existing_value
  from public.product_experience_baseline_versions baseline
  where baseline.approved_execution_id = p_execution_id
  for share;

  if existing_value.id is not null then
    if existing_value.task_id <> execution_value.task_id
       or existing_value.project_id <> execution_value.project_id
       or existing_value.platform <> execution_value.platform
       or existing_value.environment <> execution_value.environment
       or existing_value.baseline_key <> baseline_key_value
       or existing_value.baseline_identifier <> baseline_identifier_value
       or existing_value.baseline_hash <> option_hash_value
       or existing_value.baseline_manifest_hash <> manifest_hash_value
       or existing_value.baseline_option <> 'C'
       or existing_value.baseline_option_name <> 'creator_balanced'
       or existing_value.status <> 'owner_approved'
       or existing_value.owner_approval_version_id <>
          execution_value.approval_version_id then
      raise exception 'product_experience_baseline_persistence_rejected'
        using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'baselineVersionId', existing_value.id,
      'baselineId', existing_value.baseline_identifier,
      'baselineVersion', existing_value.baseline_version,
      'baselineKey', existing_value.baseline_key,
      'baselineHash', existing_value.baseline_hash,
      'sourceOptionsManifestHash', existing_value.baseline_manifest_hash,
      'selectedOptionCode', existing_value.baseline_option,
      'selectedOption', existing_value.baseline_option_name,
      'sourceCommit', existing_value.source_commit,
      'approvedExecutionId', existing_value.approved_execution_id,
      'status', existing_value.status,
      'created', false
    );
  end if;

  select * into version_value
  from public.governance_owner_approval_versions version
  where version.id = execution_value.approval_version_id
  for share;

  select * into version_state_value
  from public.governance_owner_approval_version_states state
  where state.approval_version_id = execution_value.approval_version_id
  for share;

  select * into approval_value
  from public.governance_owner_approval_records approval
  where approval.id = execution_value.approval_record_id
  for share;

  select * into decision_value
  from public.governance_decision_manifests decision
  where decision.id = version_value.decision_manifest_id
  for share;

  select * into proof_value
  from public.governance_approved_execution_evaluator_proofs proof
  where proof.execution_id = execution_value.id
  for share;

  select * into stage_value
  from public.product_experience_baseline_execution_stages stage
  where stage.execution_id = execution_value.id
  for share;

  select count(*)::integer into approved_execution_count
  from public.governance_approved_action_executions execution
  where execution.approval_version_id = execution_value.approval_version_id;

  if version_value.id is null
     or version_state_value.approval_version_id is null
     or approval_value.id is null
     or decision_value.id is null
     or proof_value.id is null
     or stage_value.execution_id is null
     or execution_value.state <> 'completed'
     or execution_value.completed_at is null
     or execution_value.service_identity <>
        'product_experience_baseline_service'
     or execution_value.operation <> 'visual_experience_canary'
     or execution_value.provider <> 'visual_sentinel'
     or execution_value.target_resource_hash <> option_hash_value
     or execution_value.execution_receipt_hash is null
     or execution_value.evaluator_proof_hash is null
     or version_value.id <> execution_value.approval_version_id
     or version_value.approval_record_id <> execution_value.approval_record_id
     or not public.governance_exact_owner(version_value.owner_user_id)
     or (
       p_expected_owner_id is not null
       and version_value.owner_user_id <> p_expected_owner_id
     )
     or version_value.task_id <> execution_value.task_id
     or version_value.project_id <> execution_value.project_id
     or version_value.platform <> execution_value.platform
     or version_value.environment <> execution_value.environment
     or version_value.provider <> 'visual_sentinel'
     or version_value.operation <> 'visual_experience_canary'
     or version_value.target_resource_hash <> option_hash_value
     or version_value.maximum_executions <> 1
     or execution_value.completed_at < version_value.valid_from
     or execution_value.completed_at >= version_value.expires_at
     or now_at >= version_value.expires_at
     or version_state_value.approval_record_id <>
        execution_value.approval_record_id
     or version_state_value.task_id <> execution_value.task_id
     or version_state_value.project_id <> execution_value.project_id
     or version_state_value.platform <> execution_value.platform
     or version_state_value.environment <> execution_value.environment
     or version_state_value.state <> 'completed'
     or version_state_value.maximum_executions <> 1
     or version_state_value.executions_claimed <> 1
     or version_state_value.executions_completed <> 1
     or approval_value.owner_user_id <> version_value.owner_user_id
     or approval_value.task_id <> execution_value.task_id
     or approval_value.project_id <> execution_value.project_id
     or approval_value.platform <> execution_value.platform
     or approval_value.environment <> execution_value.environment
     or approval_value.current_version <> version_value.version_number
     or approval_value.current_state <> 'completed'
     or approval_value.maximum_executions <> 1
     or approval_value.executions_claimed <> 1
     or approval_value.executions_completed <> 1
     or decision_value.task_id <> execution_value.task_id
     or decision_value.project_id <> execution_value.project_id
     or decision_value.platform <> execution_value.platform
     or decision_value.environment <> execution_value.environment
     or decision_value.status <> 'finalized'
     or decision_value.decision_hash <> execution_value.decision_manifest_hash
     or decision_value.decision_hash <> version_value.decision_manifest_hash
     or decision_value.selected_option_hash <> option_hash_value
     or proof_value.approval_record_id <>
        execution_value.approval_record_id
     or proof_value.approval_version_id <>
        execution_value.approval_version_id
     or proof_value.task_id <> execution_value.task_id
     or proof_value.project_id <> execution_value.project_id
     or proof_value.platform <> execution_value.platform
     or proof_value.environment <> execution_value.environment
     or proof_value.evaluator_identity <> 'cognitive_independent_evaluator'
     or proof_value.evaluator_identity_hash =
        execution_value.service_identity_hash
     or proof_value.execution_receipt_hash <>
        execution_value.execution_receipt_hash
     or proof_value.evaluator_proof_hash <>
        execution_value.evaluator_proof_hash
     or proof_value.evaluator_requirement_hash <>
        execution_value.evaluator_requirement_hash
     or proof_value.verdict <> 'passed'
     or proof_value.created_at > execution_value.completed_at
     or stage_value.task_id <> execution_value.task_id
     or stage_value.project_id <> execution_value.project_id
     or stage_value.platform <> execution_value.platform
     or stage_value.environment <> execution_value.environment
     or stage_value.baseline_identifier <> baseline_identifier_value
     or stage_value.baseline_key <> baseline_key_value
     or stage_value.selected_option_code <> 'C'
     or stage_value.selected_option_name <> 'creator_balanced'
     or stage_value.baseline_hash <> option_hash_value
     or stage_value.source_options_manifest_hash <> manifest_hash_value
     or stage_value.source_commit <> version_value.source_commit
     or stage_value.staged_by_identity_hash <>
        execution_value.service_identity_hash
     or approved_execution_count <> 1 then
    raise exception 'product_experience_baseline_persistence_rejected'
      using errcode = 'P0001';
  end if;

  select coalesce(max(baseline.baseline_version), 0) + 1
    into baseline_version_value
  from public.product_experience_baseline_versions baseline
  where baseline.task_id = execution_value.task_id
    and baseline.project_id = execution_value.project_id
    and baseline.platform = execution_value.platform
    and baseline.environment = execution_value.environment
    and baseline.baseline_key = baseline_key_value;

  if baseline_version_value not between 1 and 1000 then
    raise exception 'product_experience_baseline_persistence_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.product_experience_baseline_versions(
    task_id, project_id, platform, environment, baseline_key,
    baseline_version, baseline_hash, status, owner_approval_version_id,
    approved_execution_id, baseline_manifest_hash, baseline_option,
    baseline_identifier, baseline_option_name, source_commit,
    approved_at, created_at
  ) values (
    execution_value.task_id, execution_value.project_id,
    execution_value.platform, execution_value.environment, baseline_key_value,
    baseline_version_value, option_hash_value, 'owner_approved',
    execution_value.approval_version_id, execution_value.id,
    manifest_hash_value, 'C', baseline_identifier_value,
    'creator_balanced', version_value.source_commit, now_at, now_at
  )
  returning id into baseline_id_value;

  event_hash_value := encode(extensions.digest(convert_to(
    concat_ws(
      '|',
      'product-experience-baseline-owner-approved',
      baseline_id_value::text,
      baseline_identifier_value,
      baseline_version_value::text,
      option_hash_value,
      manifest_hash_value,
      version_value.source_commit,
      execution_value.approval_version_id::text,
      execution_value.id::text
    ),
    'UTF8'
  ), 'sha256'), 'hex');

  insert into public.product_experience_baseline_lifecycle_events(
    baseline_version_id, task_id, project_id, platform, environment,
    event_sequence, event_type, event_hash, reason_hash, actor_user_id,
    actor_identity_hash, created_at
  ) values (
    baseline_id_value, execution_value.task_id, execution_value.project_id,
    execution_value.platform, execution_value.environment, 1,
    'owner_approved', event_hash_value, option_hash_value,
    version_value.owner_user_id, version_value.owner_identity_hash, now_at
  );

  return jsonb_build_object(
    'baselineVersionId', baseline_id_value,
    'baselineId', baseline_identifier_value,
    'baselineVersion', baseline_version_value,
    'baselineKey', baseline_key_value,
    'baselineHash', option_hash_value,
    'sourceOptionsManifestHash', manifest_hash_value,
    'selectedOptionCode', 'C',
    'selectedOption', 'creator_balanced',
    'sourceCommit', version_value.source_commit,
    'approvedExecutionId', execution_value.id,
    'status', 'owner_approved',
    'created', true
  );
end;
$$;

revoke all on function public.governance_persist_product_experience_baseline_v1_internal(
  uuid,uuid
) from public, anon, authenticated, service_role;

create or replace function public.governance_owner_persist_product_experience_baseline(
  p_execution_id uuid,
  p_baseline_key text,
  p_selected_option text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
begin
  if p_baseline_key <> 'streaming_mobile_content_density'
     or p_selected_option <> 'C' then
    raise exception 'product_experience_baseline_persistence_rejected'
      using errcode = 'P0001';
  end if;
  return public.governance_persist_product_experience_baseline_v1_internal(
    p_execution_id,
    owner_id
  );
end;
$$;

revoke all on function
  public.governance_owner_persist_product_experience_baseline(uuid,text,text)
from public, anon, authenticated, service_role;
grant execute on function
  public.governance_owner_persist_product_experience_baseline(uuid,text,text)
to authenticated;

create function public.governance_product_baseline_persist_completed_execution(
  p_execution_id uuid,
  p_service_identity text,
  p_worker_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_value public.governance_approved_action_executions%rowtype;
  service_identity_value text;
begin
  select * into execution_value
  from public.governance_approved_action_executions execution
  where execution.id = p_execution_id
  for share;

  if execution_value.id is null then
    raise exception 'product_experience_baseline_persistence_rejected'
      using errcode = 'P0001';
  end if;

  service_identity_value := public.governance_assert_two_party_service_principal(
    p_service_identity,
    p_worker_assertion,
    execution_value.operation
  );

  if service_identity_value <> 'product_experience_baseline_service'
     or execution_value.service_identity <> service_identity_value
     or execution_value.operation <> 'visual_experience_canary'
     or execution_value.provider <> 'visual_sentinel'
     or execution_value.state <> 'completed' then
    raise exception 'product_experience_baseline_persistence_rejected'
      using errcode = 'P0001';
  end if;

  return public.governance_persist_product_experience_baseline_v1_internal(
    p_execution_id,
    null
  );
end;
$$;

revoke all on function public.governance_product_baseline_persist_completed_execution(
  uuid,text,text
) from public, anon, authenticated;
grant execute on function public.governance_product_baseline_persist_completed_execution(
  uuid,text,text
) to service_role;

create function public.governance_owner_revoke_product_experience_baseline(
  p_baseline_version_id uuid,
  p_reason_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  baseline_value public.product_experience_baseline_versions%rowtype;
  approval_version_value public.governance_owner_approval_versions%rowtype;
  event_sequence_value integer;
  event_hash_value text;
  now_at timestamptz := transaction_timestamp();
begin
  if p_baseline_version_id is null
     or p_reason_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'product_experience_baseline_revoke_rejected'
      using errcode = 'P0001';
  end if;

  select * into baseline_value
  from public.product_experience_baseline_versions baseline
  where baseline.id = p_baseline_version_id
  for share;

  select * into approval_version_value
  from public.governance_owner_approval_versions version
  where version.id = baseline_value.owner_approval_version_id
  for share;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws('|','product_experience_baseline',p_baseline_version_id::text),
      0
    )
  );

  if baseline_value.id is null
     or baseline_value.status <> 'owner_approved'
     or approval_version_value.id is null
     or approval_version_value.owner_user_id <> owner_id
     or exists (
       select 1
       from public.product_experience_baseline_lifecycle_events event
       where event.baseline_version_id = baseline_value.id
         and event.event_type in ('revoked','superseded')
     ) then
    raise exception 'product_experience_baseline_revoke_rejected'
      using errcode = 'P0001';
  end if;

  select coalesce(max(event.event_sequence), 0) + 1
    into event_sequence_value
  from public.product_experience_baseline_lifecycle_events event
  where event.baseline_version_id = baseline_value.id;

  event_hash_value := encode(extensions.digest(convert_to(
    concat_ws(
      '|',
      'product-experience-baseline-revoked',
      baseline_value.id::text,
      event_sequence_value::text,
      p_reason_hash,
      owner_id::text,
      now_at::text
    ),
    'UTF8'
  ), 'sha256'), 'hex');

  insert into public.product_experience_baseline_lifecycle_events(
    baseline_version_id, task_id, project_id, platform, environment,
    event_sequence, event_type, event_hash, reason_hash, actor_user_id,
    actor_identity_hash, created_at
  ) values (
    baseline_value.id, baseline_value.task_id, baseline_value.project_id,
    baseline_value.platform, baseline_value.environment, event_sequence_value,
    'revoked', event_hash_value, p_reason_hash, owner_id,
    encode(extensions.digest(convert_to(owner_id::text,'UTF8'),'sha256'),'hex'),
    now_at
  );

  return jsonb_build_object(
    'baselineVersionId', baseline_value.id,
    'status', 'revoked',
    'eventSequence', event_sequence_value,
    'eventHash', event_hash_value,
    'revokedAt', now_at
  );
end;
$$;

revoke all on function public.governance_owner_revoke_product_experience_baseline(
  uuid,text
) from public, anon, service_role;
grant execute on function public.governance_owner_revoke_product_experience_baseline(
  uuid,text
) to authenticated;

create function public.governance_owner_supersede_product_experience_baseline(
  p_baseline_version_id uuid,
  p_replacement_baseline_version_id uuid,
  p_reason_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  baseline_value public.product_experience_baseline_versions%rowtype;
  replacement_value public.product_experience_baseline_versions%rowtype;
  approval_version_value public.governance_owner_approval_versions%rowtype;
  replacement_approval_version_value
    public.governance_owner_approval_versions%rowtype;
  event_sequence_value integer;
  event_hash_value text;
  now_at timestamptz := transaction_timestamp();
begin
  if p_baseline_version_id is null
     or p_replacement_baseline_version_id is null
     or p_baseline_version_id = p_replacement_baseline_version_id
     or p_reason_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'product_experience_baseline_supersede_rejected'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws('|','product_experience_baseline',p_baseline_version_id::text),
      0
    )
  );

  select * into baseline_value
  from public.product_experience_baseline_versions baseline
  where baseline.id = p_baseline_version_id
  for share;

  select * into replacement_value
  from public.product_experience_baseline_versions baseline
  where baseline.id = p_replacement_baseline_version_id
  for share;

  select * into approval_version_value
  from public.governance_owner_approval_versions version
  where version.id = baseline_value.owner_approval_version_id
  for share;

  select * into replacement_approval_version_value
  from public.governance_owner_approval_versions version
  where version.id = replacement_value.owner_approval_version_id
  for share;

  if baseline_value.id is null
     or replacement_value.id is null
     or baseline_value.status <> 'owner_approved'
     or replacement_value.status <> 'owner_approved'
     or approval_version_value.owner_user_id <> owner_id
     or replacement_approval_version_value.owner_user_id <> owner_id
     or baseline_value.task_id <> replacement_value.task_id
     or baseline_value.project_id <> replacement_value.project_id
     or baseline_value.platform <> replacement_value.platform
     or baseline_value.environment <> replacement_value.environment
     or baseline_value.baseline_key <> replacement_value.baseline_key
     or replacement_value.baseline_version <= baseline_value.baseline_version
     or exists (
       select 1
       from public.product_experience_baseline_lifecycle_events event
       where event.baseline_version_id = baseline_value.id
         and event.event_type in ('revoked','superseded')
     )
     or not exists (
       select 1
       from public.product_experience_baseline_lifecycle_events event
       where event.baseline_version_id = replacement_value.id
         and event.event_type = 'owner_approved'
     )
     or exists (
       select 1
       from public.product_experience_baseline_lifecycle_events event
       where event.baseline_version_id = replacement_value.id
         and event.event_type in ('revoked','superseded')
     ) then
    raise exception 'product_experience_baseline_supersede_rejected'
      using errcode = 'P0001';
  end if;

  select coalesce(max(event.event_sequence), 0) + 1
    into event_sequence_value
  from public.product_experience_baseline_lifecycle_events event
  where event.baseline_version_id = baseline_value.id;

  event_hash_value := encode(extensions.digest(convert_to(
    concat_ws(
      '|',
      'product-experience-baseline-superseded',
      baseline_value.id::text,
      replacement_value.id::text,
      event_sequence_value::text,
      p_reason_hash,
      owner_id::text,
      now_at::text
    ),
    'UTF8'
  ), 'sha256'), 'hex');

  insert into public.product_experience_baseline_lifecycle_events(
    baseline_version_id, replacement_baseline_version_id, task_id, project_id,
    platform, environment, event_sequence, event_type, event_hash, reason_hash,
    actor_user_id, actor_identity_hash, created_at
  ) values (
    baseline_value.id, replacement_value.id, baseline_value.task_id,
    baseline_value.project_id, baseline_value.platform,
    baseline_value.environment, event_sequence_value, 'superseded',
    event_hash_value, p_reason_hash, owner_id,
    encode(extensions.digest(convert_to(owner_id::text,'UTF8'),'sha256'),'hex'),
    now_at
  );

  return jsonb_build_object(
    'baselineVersionId', baseline_value.id,
    'replacementBaselineVersionId', replacement_value.id,
    'status', 'superseded',
    'eventSequence', event_sequence_value,
    'eventHash', event_hash_value,
    'supersededAt', now_at
  );
end;
$$;

revoke all on function public.governance_owner_supersede_product_experience_baseline(
  uuid,uuid,text
) from public, anon, service_role;
grant execute on function public.governance_owner_supersede_product_experience_baseline(
  uuid,uuid,text
) to authenticated;
