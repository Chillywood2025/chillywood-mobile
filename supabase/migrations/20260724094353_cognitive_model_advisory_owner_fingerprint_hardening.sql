-- Close two advisory-model gaps without granting model output approval,
-- evaluator, quorum, tool, deployment, or product-mutation authority.
--
-- 1. An exact Owner may authorize one bounded advisory call while the truthful
--    independence state remains MODEL_INDEPENDENCE_PROVIDER_REQUIRED. This
--    exception is represented by its own immutable decision binding and cannot
--    satisfy any collective-governance or non-advisory independence gate.
-- 2. Every provider reservation is bound to a SHA-256 fingerprint computed
--    from the actual runtime API key. Raw credential material never crosses the
--    Edge/database boundary or enters an audit table.

create table public.cognitive_model_advisory_owner_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_manifest_id uuid not null unique,
  deliberation_id uuid not null,
  evidence_packet_id uuid not null,
  selected_proposal_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  owner_user_id uuid not null references auth.users(id),
  owner_identity_hash text not null check (
    owner_identity_hash ~ '^[a-f0-9]{64}$'
  ),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  architecture_graph_digest text not null check (
    architecture_graph_digest ~ '^[a-f0-9]{64}$'
  ),
  evidence_manifest_hash text not null check (
    evidence_manifest_hash ~ '^[a-f0-9]{64}$'
  ),
  capability_scope_hash text not null check (
    capability_scope_hash ~ '^[a-f0-9]{64}$'
  ),
  budget_id uuid not null,
  budget_hash text not null check (budget_hash ~ '^[a-f0-9]{64}$'),
  required_test_ids text[] not null check (
    cardinality(required_test_ids) between 1 and 128
  ),
  rollback_hash text not null check (rollback_hash ~ '^[a-f0-9]{64}$'),
  credential_attestation_id uuid not null,
  credential_public_fingerprint_hash text not null check (
    credential_public_fingerprint_hash ~ '^[a-f0-9]{64}$'
  ),
  credential_scope_manifest_hash text not null check (
    credential_scope_manifest_hash ~ '^[a-f0-9]{64}$'
  ),
  decision_hash text not null unique check (decision_hash ~ '^[a-f0-9]{64}$'),
  provider_required_evidence_hash text not null unique check (
    provider_required_evidence_hash ~ '^[a-f0-9]{64}$'
  ),
  authority text not null default 'advisory_only' check (
    authority = 'advisory_only'
  ),
  quorum_eligible boolean not null default false check (
    quorum_eligible = false
  ),
  evaluator_required boolean not null default true check (
    evaluator_required = true
  ),
  maximum_executions integer not null default 1 check (
    maximum_executions = 1
  ),
  created_at timestamptz not null default transaction_timestamp(),
  expires_at timestamptz not null,
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(
      id, project_id, platform, environment
    ),
  foreign key (
    deliberation_id, task_id, project_id, platform, environment
  ) references public.governance_deliberations(
    id, task_id, project_id, platform, environment
  ),
  foreign key (
    evidence_packet_id, task_id, project_id, platform, environment
  ) references public.governance_evidence_packets(
    id, task_id, project_id, platform, environment
  ),
  foreign key (
    selected_proposal_id, task_id, project_id, platform, environment
  ) references public.governance_proposals(
    id, task_id, project_id, platform, environment
  ),
  foreign key (budget_id, task_id, project_id, platform, environment)
    references public.intelligence_budgets(
      id, task_id, project_id, platform, environment
    ),
  foreign key (
    credential_attestation_id, task_id, project_id, platform, environment
  ) references public.cognitive_level01_credential_attestations(
    id, task_id, project_id, platform, environment
  ),
  foreign key (
    decision_manifest_id, task_id, project_id, platform, environment
  ) references public.governance_decision_manifests(
    id, task_id, project_id, platform, environment
  ) deferrable initially deferred,
  check (
    platform = 'shared'
    and environment = 'production'
    and expires_at > created_at
    and expires_at <= created_at + interval '24 hours'
  )
);

alter table public.cognitive_model_advisory_owner_decisions
  enable row level security;
alter table public.cognitive_model_advisory_owner_decisions
  force row level security;
revoke all on table public.cognitive_model_advisory_owner_decisions
  from public,anon,authenticated,service_role;
grant select on table public.cognitive_model_advisory_owner_decisions
  to authenticated,service_role;
create policy cognitive_model_advisory_owner_decisions_exact_read
  on public.cognitive_model_advisory_owner_decisions
  for select to authenticated
  using ((
    select public.cognitive_can_read_scope(project_id,task_id,platform)
  ));
create trigger cognitive_model_advisory_owner_decisions_immutable
before update or delete on public.cognitive_model_advisory_owner_decisions
for each row execute function public.reject_cognitive_evidence_mutation();

create or replace function public.governance_enforce_decision_model_independence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  required_count integer;
  assessment_id_value text;
  status_value jsonb;
  advisory_value public.cognitive_model_advisory_owner_decisions%rowtype;
begin
  if new.status <> 'finalized' then
    return new;
  end if;

  select * into advisory_value
  from public.cognitive_model_advisory_owner_decisions advisory
  where advisory.decision_manifest_id = new.id
    and advisory.deliberation_id = new.deliberation_id
    and advisory.evidence_packet_id = new.evidence_packet_id
    and advisory.selected_proposal_id = new.selected_proposal_id
    and advisory.task_id = new.task_id
    and advisory.project_id = new.project_id
    and advisory.platform = new.platform
    and advisory.environment = new.environment
  for share;

  if advisory_value.id is not null then
    if auth.uid() is null
       or auth.uid() <> advisory_value.owner_user_id
       or not public.governance_exact_owner(auth.uid())
       or transaction_timestamp() >= advisory_value.expires_at
       or advisory_value.authority <> 'advisory_only'
       or advisory_value.quorum_eligible
       or not advisory_value.evaluator_required
       or new.source_commit <> advisory_value.source_commit
       or new.architecture_graph_digest
          <> advisory_value.architecture_graph_digest
       or new.evidence_manifest_hash <> advisory_value.evidence_manifest_hash
       or new.capability_scope_hash <> advisory_value.capability_scope_hash
       or new.budget_hash <> advisory_value.budget_hash
       or new.required_test_ids <> advisory_value.required_test_ids
       or new.rollback_hash <> advisory_value.rollback_hash
       or new.maximum_executions <> 1
       or new.decision_hash <> advisory_value.decision_hash
       or new.model_independence_assessment_id is not null
       or new.model_independence_status is not null
       or new.model_independence_evidence_hash is not null then
      raise exception 'model_advisory_owner_decision_rejected'
        using errcode = 'P0001';
    end if;
    new.model_independence_assessment_id := null;
    new.model_independence_status := 'MODEL_INDEPENDENCE_PROVIDER_REQUIRED';
    new.model_independence_evidence_hash :=
      advisory_value.provider_required_evidence_hash;
    return new;
  end if;

  select deliberation.required_quorum
    into required_count
  from public.governance_deliberations deliberation
  where deliberation.id = new.deliberation_id
    and deliberation.task_id = new.task_id
    and deliberation.project_id = new.project_id
    and deliberation.platform = new.platform
    and deliberation.environment = new.environment;

  assessment_id_value := coalesce(
    new.model_independence_assessment_id,
    'deliberation-' || encode(extensions.digest(
      convert_to(new.deliberation_id::text, 'UTF8'), 'sha256'
    ), 'hex')
  );
  status_value := public.governance_model_independence_status_internal(
    new.task_id, assessment_id_value, coalesce(required_count, 3)
  );

  if required_count is null
     or status_value->>'status' <> 'MODEL_INDEPENDENCE_VERIFIED' then
    raise exception 'governance_model_independence_required'
      using errcode = 'P0001';
  end if;

  new.model_independence_assessment_id := assessment_id_value;
  new.model_independence_status := status_value->>'status';
  new.model_independence_evidence_hash := encode(extensions.digest(convert_to(
    concat_ws(
      '|',new.id::text,new.decision_hash,assessment_id_value,status_value::text
    ),
    'UTF8'
  ),'sha256'),'hex');
  return new;
end;
$$;
revoke all on function public.governance_enforce_decision_model_independence()
  from public,anon,authenticated,service_role;

create function public.governance_owner_prepare_model_advisory_decision(
  p_deliberation_id uuid,
  p_selected_proposal_id uuid,
  p_decision_key text,
  p_required_test_ids text[],
  p_capability_scope_hash text,
  p_budget_id uuid,
  p_budget_hash text,
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
  deliberation_value public.governance_deliberations%rowtype;
  packet_value public.governance_evidence_packets%rowtype;
  proposal_value public.governance_proposals%rowtype;
  budget_value public.intelligence_budgets%rowtype;
  credential_value public.cognitive_level01_credential_attestations%rowtype;
  decision_id_value uuid := gen_random_uuid();
  decision_hash_value text;
  provider_required_hash_value text;
  owner_hash text;
  expires_at_value timestamptz;
  now_at timestamptz := transaction_timestamp();
begin
  select * into deliberation_value
  from public.governance_deliberations deliberation
  where deliberation.id = p_deliberation_id
  for share;

  select * into packet_value
  from public.governance_evidence_packets packet
  where packet.deliberation_id = p_deliberation_id
  for share;

  select * into proposal_value
  from public.governance_proposals proposal
  where proposal.id = p_selected_proposal_id
    and proposal.deliberation_id = p_deliberation_id
  for share;

  if deliberation_value.id is not null then
    select * into budget_value
    from public.intelligence_budgets budget
    where budget.id = p_budget_id
      and budget.task_id = deliberation_value.task_id
      and budget.project_id = deliberation_value.project_id
      and budget.platform = deliberation_value.platform
      and budget.environment = deliberation_value.environment
    for share;

    select * into credential_value
    from public.cognitive_level01_credential_attestations credential
    where credential.task_id = deliberation_value.task_id
      and credential.project_id = deliberation_value.project_id
      and credential.platform = deliberation_value.platform
      and credential.environment = deliberation_value.environment
      and credential.credential_kind = 'model_provider'
    order by credential.verified_at desc,credential.id desc
    limit 1
    for share;
  end if;

  if deliberation_value.id is null
     or packet_value.id is null
     or proposal_value.id is null
     or deliberation_value.platform <> 'shared'
     or deliberation_value.environment <> 'production'
     or deliberation_value.status in ('blocked','cancelled')
     or now_at >= deliberation_value.deadline_at
     or packet_value.task_id <> deliberation_value.task_id
     or packet_value.project_id <> deliberation_value.project_id
     or packet_value.platform <> deliberation_value.platform
     or packet_value.environment <> deliberation_value.environment
     or packet_value.source_commit <> deliberation_value.source_commit
     or packet_value.architecture_graph_digest
        <> deliberation_value.architecture_graph_digest
     or now_at >= packet_value.freshness_deadline
     or packet_value.approval_level <> 'owner'
     or proposal_value.option_kind <> 'no_action'
     or proposal_value.rollback_hash <> p_rollback_hash
     or budget_value.id is null
     or budget_value.actor_identity <> 'cognitive_model_router'
     or budget_value.immutable_ceiling_hash <> p_budget_hash
     or packet_value.budget_hash <> p_budget_hash
     or budget_value.status not in ('received','running')
     or now_at >= budget_value.deadline_at
     or credential_value.id is null
     or credential_value.state <> 'configured'
     or now_at >= credential_value.expires_at
     or p_decision_key is null
     or length(p_decision_key) not between 8 and 160
     or public.cognitive_text_has_secret(p_decision_key)
     or public.cognitive_text_has_private_identifier(p_decision_key)
     or p_required_test_ids is null
     or cardinality(p_required_test_ids) not between 1 and 128
     or not (
       'cognitive-model-advisory-independent-evaluation'
       = any(p_required_test_ids)
     )
     or exists (
       select 1 from unnest(p_required_test_ids) test_id
       where length(test_id) not between 3 and 128
         or public.cognitive_text_has_secret(test_id)
         or public.cognitive_text_has_private_identifier(test_id)
     )
     or p_capability_scope_hash !~ '^[a-f0-9]{64}$'
     or p_budget_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash !~ '^[a-f0-9]{64}$'
     or p_validity <= interval '0 seconds'
     or p_validity > interval '24 hours'
     or not public.governance_approval_emergency_active()
     or exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = deliberation_value.task_id
         and switch.project_id = deliberation_value.project_id
         and switch.platform = deliberation_value.platform
         and switch.environment = deliberation_value.environment
         and switch.switch_key in (
           'cognitive_collective_deliberation_enabled',
           'cognitive_user_derived_memory_enabled',
           'cognitive_level2_production_repairs_enabled'
         )
         and switch.enabled
     )
     or not exists (
       select 1
       from public.intelligence_tasks task
       where task.id = deliberation_value.task_id
         and task.project_id = deliberation_value.project_id
         and task.platform = deliberation_value.platform
         and task.environment = deliberation_value.environment
         and task.cancelled_at is null
         and task.quarantined_at is null
         and now_at < task.deadman_at
     ) then
    raise exception 'model_advisory_owner_decision_rejected'
      using errcode = 'P0001';
  end if;

  expires_at_value := least(
    now_at + p_validity,
    deliberation_value.deadline_at,
    packet_value.freshness_deadline,
    budget_value.deadline_at,
    credential_value.expires_at
  );
  if expires_at_value <= now_at then
    raise exception 'model_advisory_owner_decision_rejected'
      using errcode = 'P0001';
  end if;

  owner_hash := encode(extensions.digest(
    convert_to(owner_id::text,'UTF8'),'sha256'
  ),'hex');
  decision_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|','cognitive-model-advisory-owner-decision-v1',
    decision_id_value::text,deliberation_value.id::text,packet_value.id::text,
    proposal_value.id::text,deliberation_value.source_commit,
    deliberation_value.architecture_graph_digest,packet_value.packet_hash,
    p_capability_scope_hash,p_budget_id::text,p_budget_hash,
    array_to_string(p_required_test_ids,','),p_rollback_hash,
    credential_value.id::text,credential_value.public_fingerprint_hash,
    credential_value.scope_manifest_hash,owner_hash,expires_at_value::text,
    'advisory_only','MODEL_INDEPENDENCE_PROVIDER_REQUIRED','false','true'
  ),'UTF8'),'sha256'),'hex');
  provider_required_hash_value := encode(extensions.digest(convert_to(
    concat_ws(
      '|','cognitive-model-advisory-provider-required-v1',
      decision_id_value::text,decision_hash_value,
      credential_value.public_fingerprint_hash,
      credential_value.scope_manifest_hash
    ),
    'UTF8'
  ),'sha256'),'hex');

  insert into public.cognitive_model_advisory_owner_decisions(
    decision_manifest_id,deliberation_id,evidence_packet_id,
    selected_proposal_id,task_id,project_id,platform,environment,
    owner_user_id,owner_identity_hash,source_commit,
    architecture_graph_digest,evidence_manifest_hash,
    capability_scope_hash,budget_id,budget_hash,required_test_ids,
    rollback_hash,credential_attestation_id,
    credential_public_fingerprint_hash,credential_scope_manifest_hash,
    decision_hash,provider_required_evidence_hash,expires_at
  ) values (
    decision_id_value,deliberation_value.id,packet_value.id,proposal_value.id,
    deliberation_value.task_id,deliberation_value.project_id,
    deliberation_value.platform,deliberation_value.environment,
    owner_id,owner_hash,deliberation_value.source_commit,
    deliberation_value.architecture_graph_digest,packet_value.packet_hash,
    p_capability_scope_hash,p_budget_id,p_budget_hash,p_required_test_ids,
    p_rollback_hash,credential_value.id,
    credential_value.public_fingerprint_hash,
    credential_value.scope_manifest_hash,decision_hash_value,
    provider_required_hash_value,expires_at_value
  );

  insert into public.governance_decision_manifests(
    id,deliberation_id,evidence_packet_id,selected_proposal_id,task_id,
    project_id,platform,environment,decision_key,source_commit,
    architecture_graph_digest,evidence_manifest_hash,research_claim_hashes,
    selected_option_hash,rejected_option_hashes,council_attestation_hash,
    votes_hash,vetoes_hash,dissent_hash,stakeholder_impact_hash,risk_level,
    required_test_ids,capability_scope_hash,budget_hash,maximum_executions,
    rollback_hash,external_confirmation_required,decision_hash,status,
    expires_at,finalized_at
  ) values (
    decision_id_value,deliberation_value.id,packet_value.id,proposal_value.id,
    deliberation_value.task_id,deliberation_value.project_id,
    deliberation_value.platform,deliberation_value.environment,p_decision_key,
    deliberation_value.source_commit,deliberation_value.architecture_graph_digest,
    packet_value.packet_hash,packet_value.research_claim_hashes,
    proposal_value.proposal_hash,'{}'::text[],
    encode(extensions.digest(convert_to(
      'owner-model-advisory:no-collective-attestation','UTF8'
    ),'sha256'),'hex'),
    encode(extensions.digest(convert_to(
      'owner-model-advisory:no-collective-vote','UTF8'
    ),'sha256'),'hex'),
    encode(extensions.digest(convert_to(
      'owner-model-advisory:no-veto-authority','UTF8'
    ),'sha256'),'hex'),
    encode(extensions.digest(convert_to(
      'owner-model-advisory:no-dissent-authority','UTF8'
    ),'sha256'),'hex'),
    encode(extensions.digest(convert_to(
      'owner-model-advisory:no-product-mutation','UTF8'
    ),'sha256'),'hex'),
    deliberation_value.risk_level,p_required_test_ids,p_capability_scope_hash,
    p_budget_hash,1,p_rollback_hash,false,decision_hash_value,'finalized',
    expires_at_value,now_at
  );

  insert into public.governance_decision_manifest_events(
    decision_manifest_id,task_id,project_id,platform,environment,
    event_sequence,event_type,event_hash,actor_identity
  ) values (
    decision_id_value,deliberation_value.task_id,deliberation_value.project_id,
    deliberation_value.platform,deliberation_value.environment,1,'finalized',
    decision_hash_value,'exact_owner_model_advisory'
  );

  return jsonb_build_object(
    'decisionManifestId',decision_id_value,
    'decisionHash',decision_hash_value,
    'authority','advisory_only',
    'quorumEligible',false,
    'modelIndependenceStatus','MODEL_INDEPENDENCE_PROVIDER_REQUIRED',
    'evaluatorRequired',true,
    'maximumExecutions',1,
    'expiresAt',expires_at_value
  );
end;
$$;
revoke all on function
  public.governance_owner_prepare_model_advisory_decision(
    uuid,uuid,text,text[],text,uuid,text,text,interval
  )
  from public,anon,service_role;
grant execute on function
  public.governance_owner_prepare_model_advisory_decision(
    uuid,uuid,text,text[],text,uuid,text,text,interval
  )
  to authenticated;

create or replace function public.governance_record_owner_approval(
  p_decision_manifest_id uuid,
  p_approval_key text,
  p_objective_hash text,
  p_plan_snapshot_hash text,
  p_source_commit text,
  p_architecture_graph_digest text,
  p_approval_scope_hash text,
  p_repository_full_name text,
  p_branch_name text,
  p_provider text,
  p_operation text,
  p_target_resource_hash text,
  p_path_scope_hashes text[],
  p_table_scope_hashes text[],
  p_function_scope_hashes text[],
  p_budget_hash text,
  p_maximum_cost numeric,
  p_maximum_calls integer,
  p_maximum_bytes bigint,
  p_maximum_executions integer,
  p_tests_hash text,
  p_required_test_ids text[],
  p_evaluator_requirement_hash text,
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
  decision_value public.governance_decision_manifests%rowtype;
  advisory_value public.cognitive_model_advisory_owner_decisions%rowtype;
  approval_record_id uuid;
  approval_version_id uuid;
  approval_hash_value text;
  owner_hash text;
  now_at timestamptz := transaction_timestamp();
  expires_at_value timestamptz;
  is_model_advisory boolean := (
    p_provider = 'model' and p_operation = 'model_advisory'
  );
begin
  select * into decision_value
  from public.governance_decision_manifests
  where id = p_decision_manifest_id
  for share;

  select * into advisory_value
  from public.cognitive_model_advisory_owner_decisions advisory
  where advisory.decision_manifest_id = p_decision_manifest_id
  for share;

  if decision_value.id is null
     or decision_value.status <> 'finalized'
     or now_at >= decision_value.expires_at
     or (
       is_model_advisory
       and (
         advisory_value.id is null
         or advisory_value.owner_user_id <> owner_id
         or advisory_value.task_id <> decision_value.task_id
         or advisory_value.project_id <> decision_value.project_id
         or advisory_value.platform <> decision_value.platform
         or advisory_value.environment <> decision_value.environment
         or advisory_value.authority <> 'advisory_only'
         or advisory_value.quorum_eligible
         or not advisory_value.evaluator_required
         or advisory_value.maximum_executions <> 1
         or now_at >= advisory_value.expires_at
         or decision_value.model_independence_status
            <> 'MODEL_INDEPENDENCE_PROVIDER_REQUIRED'
         or decision_value.model_independence_assessment_id is not null
         or decision_value.model_independence_evidence_hash
            <> advisory_value.provider_required_evidence_hash
         or decision_value.decision_hash <> advisory_value.decision_hash
       )
     )
     or (
       not is_model_advisory
       and (
         decision_value.model_independence_status
            <> 'MODEL_INDEPENDENCE_VERIFIED'
         or decision_value.model_independence_assessment_id is null
         or decision_value.model_independence_evidence_hash is null
       )
     )
     or (
       p_operation = 'model_advisory'
       and not is_model_advisory
     )
     or exists (
       select 1 from public.governance_vetoes veto
       where veto.deliberation_id = decision_value.deliberation_id
         and veto.mandatory and veto.status = 'active'
     )
     or p_approval_key is null
     or length(p_approval_key) not between 8 and 160
     or public.cognitive_text_has_secret(p_approval_key)
     or public.cognitive_text_has_private_identifier(p_approval_key)
     or p_objective_hash !~ '^[a-f0-9]{64}$'
     or p_plan_snapshot_hash !~ '^[a-f0-9]{64}$'
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_source_commit <> decision_value.source_commit
     or p_architecture_graph_digest !~ '^[a-f0-9]{64}$'
     or p_architecture_graph_digest
        <> decision_value.architecture_graph_digest
     or p_approval_scope_hash !~ '^[a-f0-9]{64}$'
     or p_approval_scope_hash <> decision_value.capability_scope_hash
     or p_repository_full_name <> 'Chillywood2025/chillywood-mobile'
     or p_branch_name !~ '^codex/[a-z0-9][a-z0-9/_-]{2,120}$'
     or p_branch_name ~* '(^|/)(main|master|release)(/|$)'
     or p_provider not in (
       'repository','github_draft_pr','public_research','model','none',
       'livekit','visual_sentinel','installed_journey'
     )
     or p_operation not in (
       'bootstrap_control_plane','set_switch','public_research_ingest',
       'collective_deliberation','model_independence_attestation',
       'model_advisory','livekit_experience_canary',
       'visual_experience_canary','installed_journey_canary',
       'product_quality_triage','github_draft_pr'
     )
     or (p_operation = 'model_advisory' and p_provider <> 'model')
     or p_target_resource_hash !~ '^[a-f0-9]{64}$'
     or not public.governance_hash_array_valid(
       p_path_scope_hashes,0,128
     )
     or not public.governance_hash_array_valid(
       coalesce(p_table_scope_hashes,'{}'::text[]),0,128
     )
     or not public.governance_hash_array_valid(
       coalesce(p_function_scope_hashes,'{}'::text[]),0,64
     )
     or p_budget_hash !~ '^[a-f0-9]{64}$'
     or p_budget_hash <> decision_value.budget_hash
     or p_maximum_cost not between 0 and 100
     or p_maximum_calls not between 1 and 100
     or p_maximum_bytes not between 1 and 10000000
     or p_maximum_executions < 1
     or p_maximum_executions > decision_value.maximum_executions
     or p_tests_hash !~ '^[a-f0-9]{64}$'
     or p_required_test_ids is null
     or cardinality(p_required_test_ids) not between 1 and 128
     or not decision_value.required_test_ids <@ p_required_test_ids
     or p_evaluator_requirement_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash <> decision_value.rollback_hash
     or p_validity <= interval '0 seconds'
     or p_validity > interval '24 hours'
     or (
       is_model_advisory
       and (
         p_maximum_cost > 5
         or p_maximum_calls > 10
         or p_maximum_bytes > 16384
         or p_maximum_executions <> 1
         or cardinality(p_path_scope_hashes) <> 0
         or cardinality(coalesce(p_table_scope_hashes,'{}'::text[])) <> 0
         or cardinality(coalesce(p_function_scope_hashes,'{}'::text[])) <> 0
         or not (
           'cognitive-model-advisory-independent-evaluation'
           = any(p_required_test_ids)
         )
         or p_approval_scope_hash <> advisory_value.capability_scope_hash
         or p_budget_hash <> advisory_value.budget_hash
         or p_rollback_hash <> advisory_value.rollback_hash
       )
     ) then
    raise exception 'two_party_owner_approval_rejected'
      using errcode = 'P0001';
  end if;

  expires_at_value := least(
    now_at + p_validity,
    decision_value.expires_at,
    case
      when is_model_advisory then advisory_value.expires_at
      else decision_value.expires_at
    end
  );
  owner_hash := encode(extensions.digest(
    convert_to(owner_id::text,'UTF8'),'sha256'
  ),'hex');
  approval_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|',decision_value.id::text,decision_value.decision_hash,p_approval_key,
    p_objective_hash,p_plan_snapshot_hash,p_source_commit,
    p_architecture_graph_digest,p_approval_scope_hash,p_repository_full_name,
    p_branch_name,p_provider,p_operation,p_target_resource_hash,
    array_to_string(p_path_scope_hashes,','),
    array_to_string(coalesce(p_table_scope_hashes,'{}'::text[]),','),
    array_to_string(coalesce(p_function_scope_hashes,'{}'::text[]),','),
    p_budget_hash,p_maximum_cost::text,p_maximum_calls::text,
    p_maximum_bytes::text,p_maximum_executions::text,p_tests_hash,
    array_to_string(p_required_test_ids,','),p_evaluator_requirement_hash,
    p_rollback_hash,owner_id::text,now_at::text,expires_at_value::text
  ),'UTF8'),'sha256'),'hex');

  insert into public.governance_owner_approval_records(
    decision_manifest_id,task_id,project_id,platform,environment,
    approval_key,objective_hash,owner_user_id,current_version,
    current_state,maximum_executions,executions_claimed,
    executions_completed,approval_hash,created_at,updated_at
  ) values (
    decision_value.id,decision_value.task_id,decision_value.project_id,
    decision_value.platform,decision_value.environment,p_approval_key,
    p_objective_hash,owner_id,1,'active',p_maximum_executions,0,0,
    approval_hash_value,now_at,now_at
  ) returning id into approval_record_id;

  insert into public.governance_owner_approval_versions(
    approval_record_id,decision_manifest_id,task_id,project_id,platform,
    environment,version_number,owner_user_id,owner_identity_hash,
    decision_manifest_hash,plan_snapshot_hash,source_commit,
    architecture_graph_digest,approval_scope_hash,objective_hash,
    repository_full_name,branch_name,provider,operation,target_resource_hash,
    path_scope_hashes,table_scope_hashes,function_scope_hashes,budget_hash,
    maximum_cost,maximum_calls,maximum_bytes,maximum_executions,tests_hash,
    required_test_ids,evaluator_requirement_hash,rollback_hash,approval_hash,
    approved_at,valid_from,expires_at
  ) values (
    approval_record_id,decision_value.id,decision_value.task_id,
    decision_value.project_id,decision_value.platform,
    decision_value.environment,1,owner_id,owner_hash,
    decision_value.decision_hash,p_plan_snapshot_hash,p_source_commit,
    p_architecture_graph_digest,p_approval_scope_hash,p_objective_hash,
    p_repository_full_name,p_branch_name,p_provider,p_operation,
    p_target_resource_hash,p_path_scope_hashes,
    coalesce(p_table_scope_hashes,'{}'::text[]),
    coalesce(p_function_scope_hashes,'{}'::text[]),p_budget_hash,
    p_maximum_cost,p_maximum_calls,p_maximum_bytes,p_maximum_executions,
    p_tests_hash,p_required_test_ids,p_evaluator_requirement_hash,
    p_rollback_hash,approval_hash_value,now_at,now_at,expires_at_value
  ) returning id into approval_version_id;

  insert into public.governance_owner_approval_version_states(
    approval_version_id,approval_record_id,task_id,project_id,platform,
    environment,state,maximum_executions
  ) values (
    approval_version_id,approval_record_id,decision_value.task_id,
    decision_value.project_id,decision_value.platform,
    decision_value.environment,'active',p_maximum_executions
  );

  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id,approval_version_id,task_id,project_id,platform,
    environment,event_sequence,event_type,event_hash,actor_identity_hash
  ) values (
    approval_record_id,approval_version_id,decision_value.task_id,
    decision_value.project_id,decision_value.platform,
    decision_value.environment,1,'owner_approved',approval_hash_value,
    owner_hash
  );

  return jsonb_build_object(
    'approvalId',approval_record_id,
    'approvalVersionId',approval_version_id,
    'approvalVersion',1,
    'approvalHash',approval_hash_value,
    'status','active',
    'approvedAt',now_at,
    'expiresAt',expires_at_value,
    'remainingExecutionAllowance',p_maximum_executions,
    'authority',case
      when is_model_advisory then 'advisory_only'
      else 'independence_verified'
    end,
    'quorumEligible',false
  );
end;
$$;
revoke all on function public.governance_record_owner_approval(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text[],
  text[],text[],text,numeric,integer,bigint,integer,text,text[],text,text,
  interval
) from public,anon,service_role;
grant execute on function public.governance_record_owner_approval(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text[],
  text[],text[],text,numeric,integer,bigint,integer,text,text[],text,text,
  interval
) to authenticated;

create function public.cognitive_model_router_validate_advisory_capability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_value public.governance_approved_action_executions%rowtype;
  approval_version_value public.governance_owner_approval_versions%rowtype;
  advisory_value public.cognitive_model_advisory_owner_decisions%rowtype;
begin
  select * into execution_value
  from public.governance_approved_action_executions execution
  where execution.id = new.approved_execution_id
  for share;

  if execution_value.id is not null then
    select * into approval_version_value
    from public.governance_owner_approval_versions version
    where version.id = execution_value.approval_version_id
    for share;

    select advisory.* into advisory_value
    from public.cognitive_model_advisory_owner_decisions advisory
    where advisory.decision_manifest_id =
          approval_version_value.decision_manifest_id
      and advisory.task_id = new.task_id
      and advisory.project_id = new.project_id
      and advisory.platform = new.platform
      and advisory.environment = new.environment
    for share;
  end if;

  if execution_value.id is null
     or approval_version_value.id is null
     or advisory_value.id is null
     or transaction_timestamp() >= advisory_value.expires_at
     or execution_value.operation <> 'model_advisory'
     or execution_value.provider <> 'model'
     or new.budget_id <> advisory_value.budget_id
     or new.scope_hash <> advisory_value.capability_scope_hash
     or new.credential_attestation_id <>
        advisory_value.credential_attestation_id
     or new.credential_public_fingerprint_hash <>
        advisory_value.credential_public_fingerprint_hash
     or new.credential_scope_manifest_hash <>
        advisory_value.credential_scope_manifest_hash
     or new.authority <> 'advisory_only'
     or new.quorum_eligible
     or new.evaluator_authority
     or new.tool_authority then
    raise exception 'model_router_advisory_capability_rejected'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
revoke all on function
  public.cognitive_model_router_validate_advisory_capability()
  from public,anon,authenticated,service_role;

create trigger cognitive_model_router_advisory_capability_guard
before insert on public.cognitive_model_router_capabilities
for each row execute function
  public.cognitive_model_router_validate_advisory_capability();

alter table public.cognitive_model_router_preflight_audits
  add column runtime_credential_fingerprint_hash text;

do $$
begin
  if exists (
    select 1 from public.cognitive_model_router_preflight_audits
  ) then
    raise exception 'model_router_runtime_credential_binding_requires_empty_state'
      using errcode = 'P0001';
  end if;
end
$$;

alter table public.cognitive_model_router_preflight_audits
  alter column runtime_credential_fingerprint_hash set not null,
  add constraint cognitive_model_router_runtime_credential_fingerprint_check
    check (runtime_credential_fingerprint_hash ~ '^[a-f0-9]{64}$');

create table public.cognitive_model_router_runtime_credential_proofs (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null,
  idempotency_key text not null check (
    idempotency_key ~ '^[a-f0-9]{64}$'
  ),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  credential_attestation_id uuid not null,
  runtime_credential_fingerprint_hash text not null check (
    runtime_credential_fingerprint_hash ~ '^[a-f0-9]{64}$'
  ),
  credential_scope_manifest_hash text not null check (
    credential_scope_manifest_hash ~ '^[a-f0-9]{64}$'
  ),
  service_identity text not null check (
    service_identity = 'cognitive_model_router'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (capability_id,idempotency_key),
  unique (capability_id,request_hash),
  foreign key (
    capability_id,task_id,project_id,platform,environment
  ) references public.cognitive_model_router_capabilities(
    id,task_id,project_id,platform,environment
  ),
  foreign key (
    credential_attestation_id,task_id,project_id,platform,environment
  ) references public.cognitive_level01_credential_attestations(
    id,task_id,project_id,platform,environment
  )
);

alter table public.cognitive_model_router_runtime_credential_proofs
  enable row level security;
alter table public.cognitive_model_router_runtime_credential_proofs
  force row level security;
revoke all on table public.cognitive_model_router_runtime_credential_proofs
  from public,anon,authenticated,service_role;
grant select on table public.cognitive_model_router_runtime_credential_proofs
  to service_role;
create trigger cognitive_model_router_runtime_credential_proofs_immutable
before update or delete
  on public.cognitive_model_router_runtime_credential_proofs
for each row execute function public.reject_cognitive_evidence_mutation();

create or replace function
  public.cognitive_model_router_bind_preflight_credential()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability_value public.cognitive_model_router_capabilities%rowtype;
  current_attestation public.cognitive_level01_credential_attestations%rowtype;
  proof_value public.cognitive_model_router_runtime_credential_proofs%rowtype;
  now_at timestamptz := transaction_timestamp();
begin
  select * into capability_value
  from public.cognitive_model_router_capabilities capability
  where capability.id = new.capability_id
    and capability.task_id = new.task_id
    and capability.project_id = new.project_id
    and capability.platform = new.platform
    and capability.environment = new.environment
  for share;

  select * into current_attestation
  from public.cognitive_level01_credential_attestations attestation
  where attestation.task_id = new.task_id
    and attestation.project_id = new.project_id
    and attestation.platform = new.platform
    and attestation.environment = new.environment
    and attestation.credential_kind = 'model_provider'
  order by attestation.verified_at desc,attestation.id desc
  limit 1
  for share;

  select * into proof_value
  from public.cognitive_model_router_runtime_credential_proofs proof
  where proof.capability_id = new.capability_id
    and proof.idempotency_key = new.idempotency_key
    and proof.request_hash = new.request_hash
  for share;

  if capability_value.id is null
     or current_attestation.id is null
     or proof_value.id is null
     or current_attestation.id <> capability_value.credential_attestation_id
     or current_attestation.id <> proof_value.credential_attestation_id
     or current_attestation.state <> 'configured'
     or now_at >= current_attestation.expires_at
     or current_attestation.public_fingerprint_hash
       <> capability_value.credential_public_fingerprint_hash
     or current_attestation.public_fingerprint_hash
       <> proof_value.runtime_credential_fingerprint_hash
     or current_attestation.scope_manifest_hash
       <> capability_value.credential_scope_manifest_hash
     or current_attestation.scope_manifest_hash
       <> proof_value.credential_scope_manifest_hash
     or current_attestation.expires_at <> capability_value.credential_expires_at
     or new.configured_model_identity_hash <> encode(extensions.digest(
       convert_to(concat_ws(
         '|',capability_value.provider_family,capability_value.model_family,
         capability_value.model_name
       ),'UTF8'),'sha256'
     ),'hex') then
    raise exception 'model_router_runtime_credential_rejected'
      using errcode = 'P0001';
  end if;

  new.credential_attestation_id := current_attestation.id;
  new.credential_public_fingerprint_hash :=
    current_attestation.public_fingerprint_hash;
  new.credential_scope_manifest_hash := current_attestation.scope_manifest_hash;
  new.credential_expires_at := current_attestation.expires_at;
  new.runtime_credential_fingerprint_hash :=
    proof_value.runtime_credential_fingerprint_hash;
  return new;
end;
$$;
revoke all on function
  public.cognitive_model_router_bind_preflight_credential()
  from public,anon,authenticated,service_role;

revoke all on function public.cognitive_model_router_reserve(
  uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,text,text,text,text,bigint,numeric,text
) from public,anon,authenticated,service_role;

create or replace function public.cognitive_model_router_reserve(
  p_capability_id uuid,
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_council_role text,
  p_provider_family text,
  p_model_family text,
  p_model_name text,
  p_assessment_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_evidence_packet_hash text,
  p_prompt_template_hash text,
  p_configured_model_identity_hash text,
  p_approval_target_hash text,
  p_scope_hash text,
  p_runtime_credential_fingerprint_hash text,
  p_reserved_model_tokens bigint,
  p_reserved_model_cost numeric,
  p_service_identity_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability_value public.cognitive_model_router_capabilities%rowtype;
  current_attestation public.cognitive_level01_credential_attestations%rowtype;
  reservation_value jsonb;
begin
  perform public.cognitive_verify_service_token(
    'cognitive_model_router',p_service_identity_token
  );

  select * into capability_value
  from public.cognitive_model_router_capabilities capability
  where capability.id = p_capability_id
    and capability.task_id = p_task_id
    and capability.project_id = p_project_id
    and capability.platform = p_platform
    and capability.environment = p_environment
  for update;

  if exists (
    select 1
    from public.cognitive_model_router_preflight_audits preflight
    where preflight.capability_id = p_capability_id
      and (
        preflight.idempotency_key = p_idempotency_key
        or preflight.assessment_id = p_assessment_id
      )
  ) then
    raise exception 'model_router_replay_denied' using errcode = '23505';
  end if;

  select * into current_attestation
  from public.cognitive_level01_credential_attestations attestation
  where attestation.task_id = p_task_id
    and attestation.project_id = p_project_id
    and attestation.platform = p_platform
    and attestation.environment = p_environment
    and attestation.credential_kind = 'model_provider'
  order by attestation.verified_at desc,attestation.id desc
  limit 1
  for share;

  if capability_value.id is null
     or current_attestation.id is null
     or current_attestation.id <> capability_value.credential_attestation_id
     or current_attestation.state <> 'configured'
     or transaction_timestamp() >= current_attestation.expires_at
     or current_attestation.public_fingerprint_hash
       <> capability_value.credential_public_fingerprint_hash
     or current_attestation.public_fingerprint_hash
       <> p_runtime_credential_fingerprint_hash
     or current_attestation.scope_manifest_hash
       <> capability_value.credential_scope_manifest_hash
     or current_attestation.expires_at <> capability_value.credential_expires_at
     or p_runtime_credential_fingerprint_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'model_router_runtime_credential_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.cognitive_model_router_runtime_credential_proofs(
    capability_id,idempotency_key,request_hash,task_id,project_id,platform,
    environment,credential_attestation_id,runtime_credential_fingerprint_hash,
    credential_scope_manifest_hash,service_identity
  ) values (
    capability_value.id,p_idempotency_key,p_request_hash,
    capability_value.task_id,capability_value.project_id,
    capability_value.platform,capability_value.environment,
    current_attestation.id,p_runtime_credential_fingerprint_hash,
    current_attestation.scope_manifest_hash,'cognitive_model_router'
  );

  reservation_value := public.cognitive_model_router_reserve(
    p_capability_id,p_task_id,p_project_id,p_platform,p_environment,
    p_council_role,p_provider_family,p_model_family,p_model_name,
    p_assessment_id,p_idempotency_key,p_request_hash,p_evidence_packet_hash,
    p_prompt_template_hash,p_configured_model_identity_hash,
    p_approval_target_hash,p_scope_hash,p_reserved_model_tokens,
    p_reserved_model_cost,p_service_identity_token
  );
  return reservation_value;
end;
$$;
revoke all on function public.cognitive_model_router_reserve(
  uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,text,text,text,text,text,
  bigint,numeric,text
) from public,anon,authenticated;
grant execute on function public.cognitive_model_router_reserve(
  uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,text,text,text,text,text,
  bigint,numeric,text
) to service_role;

create or replace function public.cognitive_model_router_advance_to_postflight()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  preflight_value public.cognitive_model_router_preflight_audits%rowtype;
  execution_value public.governance_approved_action_executions%rowtype;
  event_sequence_value integer;
begin
  select * into preflight_value
  from public.cognitive_model_router_preflight_audits preflight
  where preflight.id = new.preflight_id
  for share;

  select * into execution_value
  from public.governance_approved_action_executions execution
  where execution.id = preflight_value.approved_execution_id
  for update;

  if execution_value.id is null
     or execution_value.operation <> 'model_advisory'
     or execution_value.provider <> 'model'
     or not public.governance_lock_approved_execution_liveness(
       execution_value.id
     ) then
    raise exception 'model_router_postflight_rejected' using errcode = 'P0001';
  end if;

  if execution_value.state = 'postflight' then
    return new;
  end if;
  if execution_value.state <> 'executing' then
    raise exception 'model_router_postflight_rejected' using errcode = 'P0001';
  end if;

  update public.governance_approved_action_executions
  set state = 'postflight',
      updated_at = transaction_timestamp()
  where id = execution_value.id;

  select public.governance_approval_event_next_sequence(
    execution_value.approval_record_id
  ) into event_sequence_value;
  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id,approval_version_id,execution_id,task_id,project_id,
    platform,environment,event_sequence,event_type,event_hash,
    actor_identity_hash
  ) values (
    execution_value.approval_record_id,execution_value.approval_version_id,
    execution_value.id,execution_value.task_id,execution_value.project_id,
    execution_value.platform,execution_value.environment,event_sequence_value,
    'postflight',new.result_hash,
    encode(extensions.digest(convert_to(
      'cognitive_model_router','UTF8'
    ),'sha256'),'hex')
  );
  return new;
end;
$$;
revoke all on function public.cognitive_model_router_advance_to_postflight()
  from public,anon,authenticated,service_role;
create trigger cognitive_model_router_result_postflight
after insert on public.cognitive_model_router_result_audits
for each row execute function
  public.cognitive_model_router_advance_to_postflight();

comment on table public.cognitive_model_advisory_owner_decisions is
  'Immutable exact-Owner authorization for one advisory-only model execution while provider independence remains truthfully unavailable.';
comment on table public.cognitive_model_router_runtime_credential_proofs is
  'Immutable SHA-256 runtime-key proof bound under row locks to the accepted model credential attestation; never stores raw provider credentials.';
comment on column
  public.cognitive_model_router_preflight_audits.runtime_credential_fingerprint_hash
  is 'SHA-256 of the exact runtime API key used for the reservation; no raw credential material is persisted.';
