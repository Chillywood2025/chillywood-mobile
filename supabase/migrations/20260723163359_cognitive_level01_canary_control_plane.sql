-- Bounded Level 0/1 canary control plane.
-- This migration is additive. It creates no schedule and enables no switch.

create table public.cognitive_level01_canary_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  canary_key text not null check (canary_key in (
    'platform_policy_research',
    'repository_architecture_ux',
    'dependency_security_research',
    'low_risk_ux_deliberation',
    'backend_reliability_deliberation',
    'security_dependency_deliberation',
    'documentation_draft_pr',
    'test_only_draft_pr',
    'low_risk_source_draft_pr'
  )),
  canary_type text not null check (canary_type in (
    'research','deliberation','draft_pr'
  )),
  result_status text not null check (result_status in (
    'passed','blocked','failed','processing'
  )),
  source_manifest jsonb not null default '[]'::jsonb check (
    jsonb_typeof(source_manifest) = 'array'
    and jsonb_array_length(source_manifest) <= 16
    and pg_column_size(source_manifest) <= 32768
  ),
  result_manifest jsonb not null check (
    jsonb_typeof(result_manifest) = 'object'
    and pg_column_size(result_manifest) <= 65536
  ),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  evaluator_state text not null default 'incomplete' check (
    evaluator_state in ('pass','fail','incomplete','blocked')
  ),
  private_data_used boolean not null default false check (private_data_used = false),
  user_derived_data_used boolean not null default false check (user_derived_data_used = false),
  production_mutation_allowed boolean not null default false check (production_mutation_allowed = false),
  created_at timestamptz not null default transaction_timestamp(),
  completed_at timestamptz,
  unique (task_id, canary_key, evidence_hash),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment),
  check (
    (result_status = 'processing' and completed_at is null)
    or (result_status <> 'processing' and completed_at is not null)
  )
);

create table public.cognitive_level01_schedule_definitions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  schedule_key text not null check (schedule_key in (
    'daily_platform_policy_security',
    'daily_non_personal_support_observability',
    'weekly_ux_route_dead_control',
    'weekly_architecture_dependency',
    'weekly_experiment_outcome'
  )),
  cadence text not null check (cadence in (
    '0 14 * * *',
    '30 14 * * *',
    '0 15 * * 1',
    '30 15 * * 1',
    '0 16 * * 1'
  )),
  enabled boolean not null default false,
  maximum_tasks integer not null check (maximum_tasks between 1 and 10),
  maximum_cost numeric(10,4) not null check (maximum_cost between 0 and 25),
  timeout_seconds integer not null check (timeout_seconds between 30 and 900),
  policy_version text not null check (
    length(policy_version) between 1 and 64
    and not public.cognitive_text_has_secret(policy_version)
  ),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  unique (task_id, schedule_key),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment)
);

create table public.cognitive_level01_credential_attestations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  credential_kind text not null check (credential_kind in (
    'model_provider',
    'github_draft_pr'
  )),
  state text not null check (state in ('configured','missing','revoked')),
  public_fingerprint_hash text not null check (
    public_fingerprint_hash ~ '^[a-f0-9]{64}$'
  ),
  scope_manifest_hash text not null check (
    scope_manifest_hash ~ '^[a-f0-9]{64}$'
  ),
  private_material_stored boolean not null default false
    check (private_material_stored = false),
  verified_at timestamptz not null default transaction_timestamp(),
  expires_at timestamptz not null,
  created_at timestamptz not null default transaction_timestamp(),
  unique (task_id, credential_kind, verified_at),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment),
  check (expires_at > verified_at and expires_at <= verified_at + interval '30 days')
);

create table public.governance_execution_evaluations (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  evaluator_identity_hash text not null check (
    evaluator_identity_hash ~ '^[a-f0-9]{64}$'
  ),
  evaluation_status public.cognitive_evaluation_status not null,
  required_test_manifest_hash text not null check (
    required_test_manifest_hash ~ '^[a-f0-9]{64}$'
  ),
  evidence_manifest_hash text not null check (
    evidence_manifest_hash ~ '^[a-f0-9]{64}$'
  ),
  evaluated_commit text not null check (evaluated_commit ~ '^[a-f0-9]{40}$'),
  evaluated_diff_hash text not null check (evaluated_diff_hash ~ '^[a-f0-9]{64}$'),
  proof_manifest jsonb not null check (
    jsonb_typeof(proof_manifest) = 'object'
    and pg_column_size(proof_manifest) <= 65536
  ),
  owner_approval_granted boolean not null default false
    check (owner_approval_granted = false),
  source_write_allowed boolean not null default false
    check (source_write_allowed = false),
  created_at timestamptz not null default transaction_timestamp(),
  unique (receipt_id),
  unique (id, task_id, project_id, platform, environment),
  foreign key (receipt_id, task_id, project_id, platform, environment)
    references public.cognitive_execution_receipts(
      id, task_id, project_id, platform, environment
    )
);

create index cognitive_level01_canary_runs_scope_idx
  on public.cognitive_level01_canary_runs(
    task_id, project_id, platform, environment, canary_type, created_at desc
  );
create index cognitive_level01_schedule_enabled_idx
  on public.cognitive_level01_schedule_definitions(enabled, schedule_key);
create index cognitive_level01_credential_latest_idx
  on public.cognitive_level01_credential_attestations(
    task_id, credential_kind, verified_at desc
  );
create index governance_execution_evaluations_scope_idx
  on public.governance_execution_evaluations(
    task_id, project_id, platform, environment, evaluation_status, created_at desc
  );

alter table public.cognitive_level01_canary_runs enable row level security;
alter table public.cognitive_level01_canary_runs force row level security;
alter table public.cognitive_level01_schedule_definitions enable row level security;
alter table public.cognitive_level01_schedule_definitions force row level security;
alter table public.cognitive_level01_credential_attestations enable row level security;
alter table public.cognitive_level01_credential_attestations force row level security;
alter table public.governance_execution_evaluations enable row level security;
alter table public.governance_execution_evaluations force row level security;

revoke all on table public.cognitive_level01_canary_runs
  from public, anon, authenticated, service_role;
revoke all on table public.cognitive_level01_schedule_definitions
  from public, anon, authenticated, service_role;
revoke all on table public.cognitive_level01_credential_attestations
  from public, anon, authenticated, service_role;
revoke all on table public.governance_execution_evaluations
  from public, anon, authenticated, service_role;
grant select on table public.cognitive_level01_canary_runs
  to authenticated, service_role;
grant select on table public.cognitive_level01_schedule_definitions
  to authenticated, service_role;
grant select on table public.cognitive_level01_credential_attestations
  to authenticated, service_role;
grant select on table public.governance_execution_evaluations
  to authenticated, service_role;

create policy cognitive_level01_canary_runs_exact_read
  on public.cognitive_level01_canary_runs
  for select to authenticated
  using ((select public.cognitive_can_read_scope(project_id, task_id, platform)));
create policy cognitive_level01_schedule_exact_read
  on public.cognitive_level01_schedule_definitions
  for select to authenticated
  using ((select public.cognitive_can_read_scope(project_id, task_id, platform)));
create policy cognitive_level01_credential_exact_read
  on public.cognitive_level01_credential_attestations
  for select to authenticated
  using ((select public.cognitive_can_read_scope(project_id, task_id, platform)));
create policy governance_execution_evaluations_exact_read
  on public.governance_execution_evaluations
  for select to authenticated
  using ((select public.cognitive_can_read_scope(project_id, task_id, platform)));

create trigger cognitive_level01_canary_runs_immutable
  before update or delete on public.cognitive_level01_canary_runs
  for each row execute function public.reject_cognitive_evidence_mutation();
create trigger cognitive_level01_credential_attestations_immutable
  before update or delete on public.cognitive_level01_credential_attestations
  for each row execute function public.reject_cognitive_evidence_mutation();
create trigger governance_execution_evaluations_immutable
  before update or delete on public.governance_execution_evaluations
  for each row execute function public.reject_cognitive_evidence_mutation();

create function public.cognitive_bootstrap_level01_canary(
  p_source_commit text,
  p_retention_policy_hash text,
  p_constitution_hash text,
  p_rollback_hash text,
  p_actor_identity text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_id_value uuid;
  task_id_value uuid;
  constitution_version_id uuid;
  now_at timestamptz := transaction_timestamp();
  switch_key_value text;
  schedule_value record;
begin
  perform public.governance_assert_level01_service_actor(
    array['governance_canary_scheduler'],
    p_actor_identity
  );
  if p_source_commit !~ '^[a-f0-9]{40}$'
     or p_retention_policy_hash !~ '^[a-f0-9]{64}$'
     or p_constitution_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'cognitive_level01_bootstrap_proof_rejected'
      using errcode = 'P0001';
  end if;

  select task.id, task.project_id
    into task_id_value, project_id_value
  from public.intelligence_tasks task
  join public.cognitive_projects project on project.id = task.project_id
  where task.task_key = 'cognitive-level01-canary-control'
    and task.platform = 'shared'
    and task.environment = 'production'
    and project.repository_full_name = 'Chillywood2025/chillywood-mobile'
  order by task.created_at
  limit 1
  for update of task;

  if task_id_value is null then
    insert into public.cognitive_projects(
      repository_full_name, source_state, activation_state,
      scheduler_state, production_authority
    ) values (
      'Chillywood2025/chillywood-mobile',
      'collective_governance_source_complete_not_deployed',
      'off',
      'none',
      false
    ) returning id into project_id_value;

    insert into public.intelligence_tasks(
      project_id, platform, environment, repository_full_name, branch_name,
      task_key, objective_hash, status, actor_identity, deadman_at,
      retention_until, data_class
    ) values (
      project_id_value, 'shared', 'production',
      'Chillywood2025/chillywood-mobile',
      'codex/cognitive-canary-deployment',
      'cognitive-level01-canary-control',
      encode(extensions.digest(
        convert_to(
          'bounded-level01-public-research-memory-deliberation-draft-pr',
          'UTF8'
        ),
        'sha256'
      ), 'hex'),
      'received',
      'governance-canary-scheduler',
      now_at + interval '30 days',
      now_at + interval '90 days',
      'operational_metadata'
    ) returning id into task_id_value;

    insert into public.cognitive_retention_policy_states(
      task_id, project_id, platform, environment, policy_hash, policy_state,
      user_derived_memory_allowed, raw_user_reports_allowed,
      raw_private_messages_allowed, raw_private_media_allowed,
      raw_user_analytics_allowed, private_model_input_allowed
    ) values (
      task_id_value, project_id_value, 'shared', 'production',
      p_retention_policy_hash, 'owner_counsel_decision_required',
      false, false, false, false, false, false
    );

    foreach switch_key_value in array array[
      'cognitive_research_enabled',
      'cognitive_memory_enabled',
      'cognitive_collective_deliberation_enabled',
      'cognitive_draft_pr_executor_enabled',
      'cognitive_scheduled_level01_enabled',
      'cognitive_level2_production_repairs_enabled',
      'cognitive_user_derived_memory_enabled'
    ] loop
      insert into public.cognitive_governance_switches(
        task_id, project_id, platform, environment, switch_key,
        enabled, policy_version
      ) values (
        task_id_value, project_id_value, 'shared', 'production',
        switch_key_value, false, 'collective-governance-v1'
      );
    end loop;

    for schedule_value in
      select *
      from (values
        ('daily_platform_policy_security','0 14 * * *',3,5.0000,300),
        ('daily_non_personal_support_observability','30 14 * * *',2,3.0000,300),
        ('weekly_ux_route_dead_control','0 15 * * 1',3,5.0000,600),
        ('weekly_architecture_dependency','30 15 * * 1',3,5.0000,600),
        ('weekly_experiment_outcome','0 16 * * 1',2,3.0000,300)
      ) as schedule(
        schedule_key, cadence, maximum_tasks, maximum_cost, timeout_seconds
      )
    loop
      insert into public.cognitive_level01_schedule_definitions(
        task_id, project_id, platform, environment, schedule_key, cadence,
        enabled, maximum_tasks, maximum_cost, timeout_seconds, policy_version
      ) values (
        task_id_value, project_id_value, 'shared', 'production',
        schedule_value.schedule_key, schedule_value.cadence, false,
        schedule_value.maximum_tasks, schedule_value.maximum_cost,
        schedule_value.timeout_seconds, 'collective-governance-v1'
      );
    end loop;

    constitution_version_id := public.governance_bootstrap_constitution(
      task_id_value,
      project_id_value,
      'shared',
      'production',
      'collective-governance-v1',
      'Chi''llywood Collective Governance Constitution',
      p_constitution_hash,
      jsonb_build_object(
        'activation', 'off',
        'level2', false,
        'selfApproval', false,
        'userDerivedMemory', false,
        'sourceCommit', p_source_commit
      ),
      p_rollback_hash,
      'governance_constitution_service'
    );
  else
    select version.id into constitution_version_id
    from public.governance_constitution_versions version
    where version.task_id = task_id_value
    order by version.version_number desc
    limit 1;
  end if;

  insert into public.autonomous_system_emergency_states(
    system_id, status, reason, updated_at, metadata
  ) values (
    'product_intelligence_operator',
    'active',
    'Level 0/1 cognitive control plane initialized with every rollout switch off.',
    now_at,
    jsonb_build_object('policyVersion','collective-governance-v1')
  )
  on conflict (system_id) do nothing;

  return jsonb_build_object(
    'projectId', project_id_value,
    'taskId', task_id_value,
    'constitutionVersionId', constitution_version_id,
    'createdAt', now_at
  );
end;
$$;
revoke all on function public.cognitive_bootstrap_level01_canary(
  text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.cognitive_bootstrap_level01_canary(
  text,text,text,text,text
) to service_role;

create or replace function public.cognitive_record_research_source(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_authority_id text,
  p_reference text,
  p_publisher text,
  p_publication_date timestamptz,
  p_retrieval_date timestamptz,
  p_freshness_deadline timestamptz,
  p_source_type text,
  p_is_primary boolean,
  p_bounded_excerpt text,
  p_citation_title text,
  p_citation_locator text,
  p_resolved_address_hashes text[],
  p_actor_identity text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_id_value uuid;
  authority_value public.cognitive_research_authorities%rowtype;
  reference_hash_value text;
  content_hash_value text;
  now_at timestamptz := transaction_timestamp();
begin
  perform public.governance_assert_level01_service_actor(
    array['research_source_broker'],
    p_actor_identity
  );
  if p_platform <> 'shared'
     or p_environment <> 'production'
     or p_retrieval_date > now_at + interval '1 minute'
     or p_retrieval_date < now_at - interval '24 hours'
     or p_freshness_deadline <= p_retrieval_date
     or p_reference !~ '^https://[a-z0-9.-]+(/[^[:space:]]*)?$'
     or p_reference ~ '://[^/]*@'
     or p_reference ~ '^https://[^/]*:[0-9]+'
     or cardinality(p_resolved_address_hashes) not between 1 and 16
     or exists (
       select 1 from unnest(p_resolved_address_hashes) value
       where value !~ '^[a-f0-9]{64}$'
     )
     or length(p_bounded_excerpt) not between 1 and 2000
     or public.cognitive_text_has_secret(p_bounded_excerpt)
     or public.cognitive_text_has_private_identifier(p_bounded_excerpt)
     or not exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = p_task_id
         and switch.project_id = p_project_id
         and switch.platform = p_platform
         and switch.environment = p_environment
         and switch.switch_key = 'cognitive_research_enabled'
         and switch.enabled
     )
     or not exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = p_task_id
         and switch.switch_key = 'cognitive_memory_enabled'
         and switch.enabled
     )
     or exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = p_task_id
         and switch.switch_key = 'cognitive_user_derived_memory_enabled'
         and switch.enabled
     )
     or not exists (
       select 1
       from public.cognitive_retention_policy_states policy
       where policy.task_id = p_task_id
         and policy.policy_state = 'owner_counsel_decision_required'
         and not policy.user_derived_memory_allowed
         and not policy.raw_user_reports_allowed
         and not policy.raw_private_messages_allowed
         and not policy.raw_private_media_allowed
         and not policy.raw_user_analytics_allowed
         and not policy.private_model_input_allowed
     ) then
    raise exception 'cognitive_public_research_canary_rejected'
      using errcode = 'P0001';
  end if;

  select * into authority_value
  from public.cognitive_research_authorities authority
  where authority.authority_id = p_authority_id
    and authority.publisher = p_publisher
    and authority.source_type = p_source_type;
  if authority_value.authority_id is null
     or lower(split_part(split_part(p_reference, 'https://', 2), '/', 1))
        <> authority_value.canonical_host then
    raise exception 'cognitive_public_research_authority_rejected'
      using errcode = 'P0001';
  end if;

  reference_hash_value := encode(extensions.digest(
    convert_to(p_reference, 'UTF8'),
    'sha256'
  ), 'hex');
  content_hash_value := encode(extensions.digest(
    convert_to(p_bounded_excerpt, 'UTF8'),
    'sha256'
  ), 'hex');

  insert into public.research_sources(
    task_id, project_id, platform, environment, actor_identity, dedupe_key,
    status, summary, evidence_metadata, data_class, retention_until,
    authority_id, canonical_host, ownership_identity, source_reference_hash,
    canonical_url_hash, content_hash, publisher, publication_date,
    retrieval_date, freshness_deadline, source_type, is_primary,
    bounded_excerpt, citation_metadata, trusted_for_tool_execution
  ) values (
    p_task_id, p_project_id, p_platform, p_environment,
    'research-source-broker',
    'research-source-' || substr(reference_hash_value, 1, 32),
    'accepted',
    '{}'::jsonb,
    '{}'::jsonb,
    'research_cache',
    least(p_freshness_deadline, now_at + interval '90 days'),
    authority_value.authority_id,
    authority_value.canonical_host,
    authority_value.ownership_identity,
    reference_hash_value,
    reference_hash_value,
    content_hash_value,
    authority_value.publisher,
    p_publication_date,
    p_retrieval_date,
    p_freshness_deadline,
    p_source_type,
    p_is_primary,
    p_bounded_excerpt,
    jsonb_build_object('title', p_citation_title, 'locator', p_citation_locator),
    false
  ) returning id into source_id_value;

  insert into public.research_retrieval_events(
    source_id, task_id, project_id, platform, environment,
    request_url_hash, resolved_address_hashes, response_hash, result
  ) values (
    source_id_value, p_task_id, p_project_id, p_platform, p_environment,
    reference_hash_value, p_resolved_address_hashes, content_hash_value, 'accepted'
  );

  return source_id_value;
end;
$$;

create function public.cognitive_record_public_research_claim(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_canary_key text,
  p_bounded_claim text,
  p_category text,
  p_confidence numeric,
  p_freshness_deadline timestamptz,
  p_contradiction_state text,
  p_source_ids uuid[],
  p_source_commit text,
  p_actor_identity text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim_id_value uuid;
  claim_hash_value text;
  source_id_value uuid;
  independent_source_count integer;
  official_primary_count integer;
  evidence_hash_value text;
  now_at timestamptz := transaction_timestamp();
begin
  perform public.governance_assert_level01_service_actor(
    array['research_source_broker'],
    p_actor_identity
  );
  if p_canary_key not in (
      'platform_policy_research',
      'repository_architecture_ux',
      'dependency_security_research'
    )
     or p_category not in (
       'technical','platform_policy','consequential_news','product','security'
     )
     or p_confidence not between 0 and 1
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_freshness_deadline <= now_at
     or p_freshness_deadline > now_at + interval '90 days'
     or p_contradiction_state not in ('none','detected','unresolved','resolved')
     or cardinality(p_source_ids) not between 1 and 8
     or length(p_bounded_claim) not between 4 and 2000
     or public.cognitive_text_has_secret(p_bounded_claim)
     or public.cognitive_text_has_private_identifier(p_bounded_claim) then
    raise exception 'cognitive_public_research_claim_rejected'
      using errcode = 'P0001';
  end if;

  select
    count(distinct source.ownership_identity),
    count(*) filter (
      where source.is_primary
        and source.source_type in (
          'official_documentation','security_advisory',
          'platform_policy','store_policy'
        )
    )
  into independent_source_count, official_primary_count
  from public.research_sources source
  where source.id = any(p_source_ids)
    and source.task_id = p_task_id
    and source.project_id = p_project_id
    and source.platform = p_platform
    and source.environment = p_environment
    and source.freshness_deadline >= p_freshness_deadline;
  if (p_category in ('technical','platform_policy','security')
        and official_primary_count < 1)
     or (p_category = 'consequential_news' and independent_source_count < 2)
     or (select count(*) from public.research_sources source
         where source.id = any(p_source_ids)
           and source.task_id = p_task_id) <> cardinality(p_source_ids) then
    raise exception 'cognitive_public_research_provenance_rejected'
      using errcode = 'P0001';
  end if;

  claim_hash_value := encode(extensions.digest(
    convert_to(p_bounded_claim, 'UTF8'),
    'sha256'
  ), 'hex');
  evidence_hash_value := encode(extensions.digest(
    convert_to(
      claim_hash_value || ':' ||
      array_to_string(p_source_ids::text[], ',') || ':' ||
      p_source_commit,
      'UTF8'
    ),
    'sha256'
  ), 'hex');

  insert into public.research_claims(
    task_id, project_id, platform, environment, actor_identity, dedupe_key,
    status, summary, evidence_metadata, data_class, retention_until,
    claim_hash, bounded_claim, confidence, category, freshness_deadline,
    contradiction_state, support_state
  ) values (
    p_task_id, p_project_id, p_platform, p_environment,
    'research-source-broker',
    'research-claim-' || p_canary_key,
    'pending',
    '{}'::jsonb,
    '{}'::jsonb,
    'research_cache',
    least(p_freshness_deadline, now_at + interval '90 days'),
    claim_hash_value,
    p_bounded_claim,
    p_confidence,
    p_category,
    p_freshness_deadline,
    p_contradiction_state,
    case
      when p_contradiction_state in ('detected','unresolved') then 'contradicted'
      else 'supported'
    end
  ) returning id into claim_id_value;

  foreach source_id_value in array p_source_ids loop
    insert into public.research_claim_sources(
      claim_id, source_id, task_id, project_id, platform, environment,
      relationship
    ) values (
      claim_id_value, source_id_value, p_task_id, p_project_id,
      p_platform, p_environment,
      case
        when p_contradiction_state in ('detected','unresolved') then 'contradicts'
        else 'supports'
      end
    );
  end loop;

  update public.research_claims
  set status = case
        when p_contradiction_state in ('detected','unresolved') then 'contradicted'
        else 'supported'
      end
  where id = claim_id_value
    and status = 'pending';

  insert into public.cognitive_level01_canary_runs(
    task_id, project_id, platform, environment, canary_key, canary_type,
    result_status, source_manifest, result_manifest, source_commit,
    evidence_hash, evaluator_state, completed_at
  ) values (
    p_task_id, p_project_id, p_platform, p_environment,
    p_canary_key, 'research',
    case when p_contradiction_state = 'unresolved' then 'blocked' else 'passed' end,
    (
      select jsonb_agg(
        encode(extensions.digest(convert_to(source_id::text,'UTF8'),'sha256'),'hex')
        order by source_id
      )
      from unnest(p_source_ids) source_id
    ),
    jsonb_build_object(
      'claimIdHash', encode(extensions.digest(
        convert_to(claim_id_value::text,'UTF8'),'sha256'
      ),'hex'),
      'claimHash', claim_hash_value,
      'confidence', p_confidence,
      'contradictionState', p_contradiction_state,
      'publicOnly', true,
      'toolAuthority', false
    ),
    p_source_commit,
    evidence_hash_value,
    case when p_contradiction_state = 'unresolved' then 'blocked' else 'pass' end,
    now_at
  );

  return claim_id_value;
end;
$$;
revoke all on function public.cognitive_record_public_research_claim(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,
  numeric,timestamptz,text,uuid[],text,text
) from public, anon, authenticated;
grant execute on function public.cognitive_record_public_research_claim(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,
  numeric,timestamptz,text,uuid[],text,text
) to service_role;

create function public.cognitive_record_level01_deliberation_canary(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_canary_key text,
  p_decision_manifest jsonb,
  p_source_commit text,
  p_actor_identity text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  evidence_hash_value text;
  result_id uuid;
  now_at timestamptz := transaction_timestamp();
begin
  perform public.governance_assert_level01_service_actor(
    array['deliberation_orchestrator'],
    p_actor_identity
  );
  if p_canary_key not in (
      'low_risk_ux_deliberation',
      'backend_reliability_deliberation',
      'security_dependency_deliberation'
    )
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or jsonb_typeof(p_decision_manifest) <> 'object'
     or pg_column_size(p_decision_manifest) > 65536
     or not p_decision_manifest ?& array[
       'evidencePacketHash','blindAssessments','alternatives','criticisms',
       'dissent','votes','mandatoryVetoes','stakeholderImpacts',
       'selectedOption','decisionHash'
     ]
     or jsonb_array_length(p_decision_manifest->'blindAssessments') < 4
     or jsonb_array_length(p_decision_manifest->'alternatives') < 3
     or jsonb_array_length(p_decision_manifest->'criticisms') < 4
     or jsonb_array_length(p_decision_manifest->'stakeholderImpacts') < 10
     or exists (
       select 1
       from jsonb_array_elements(p_decision_manifest->'mandatoryVetoes') veto
       where coalesce((veto->>'unresolved')::boolean, false)
     )
     or not exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = p_task_id
         and switch.switch_key = 'cognitive_collective_deliberation_enabled'
         and switch.enabled
     ) then
    raise exception 'cognitive_level01_deliberation_canary_rejected'
      using errcode = 'P0001';
  end if;

  evidence_hash_value := encode(extensions.digest(
    convert_to(p_decision_manifest::text || ':' || p_source_commit, 'UTF8'),
    'sha256'
  ), 'hex');
  insert into public.cognitive_level01_canary_runs(
    task_id, project_id, platform, environment, canary_key, canary_type,
    result_status, source_manifest, result_manifest, source_commit,
    evidence_hash, evaluator_state, completed_at
  ) values (
    p_task_id, p_project_id, p_platform, p_environment,
    p_canary_key, 'deliberation', 'passed', '[]'::jsonb,
    p_decision_manifest, p_source_commit, evidence_hash_value, 'pass', now_at
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.cognitive_record_level01_deliberation_canary(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,jsonb,text,text
) from public, anon, authenticated;
grant execute on function public.cognitive_record_level01_deliberation_canary(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,jsonb,text,text
) to service_role;

-- The owner enables schedules only after all three draft-PR canaries passed.
create function public.cognitive_set_level01_schedule_state(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_enabled boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  perform public.governance_assert_exact_owner();
  if p_enabled and (
    select count(distinct run.canary_key)
    from public.cognitive_level01_canary_runs run
    where run.task_id = p_task_id
      and run.project_id = p_project_id
      and run.platform = p_platform
      and run.environment = p_environment
      and run.canary_type = 'draft_pr'
      and run.result_status = 'passed'
      and run.evaluator_state = 'pass'
  ) <> 3 then
    raise exception 'cognitive_level01_executor_canaries_required'
      using errcode = 'P0001';
  end if;
  update public.cognitive_level01_schedule_definitions schedule
  set enabled = p_enabled, updated_at = transaction_timestamp()
  where schedule.task_id = p_task_id
    and schedule.project_id = p_project_id
    and schedule.platform = p_platform
    and schedule.environment = p_environment;
  get diagnostics updated_count = row_count;
  if updated_count <> 5 then
    raise exception 'cognitive_level01_schedule_scope_rejected'
      using errcode = 'P0001';
  end if;
  return updated_count;
end;
$$;
revoke all on function public.cognitive_set_level01_schedule_state(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,boolean
) from public, anon;
grant execute on function public.cognitive_set_level01_schedule_state(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,boolean
) to authenticated;

create function public.cognitive_record_level01_credential_attestation(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_credential_kind text,
  p_state text,
  p_public_fingerprint_hash text,
  p_scope_manifest_hash text,
  p_expires_at timestamptz,
  p_actor_identity text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_id uuid;
  now_at timestamptz := transaction_timestamp();
begin
  perform public.governance_assert_level01_service_actor(
    array['capability_and_tool_broker'],
    p_actor_identity
  );
  if p_platform <> 'shared'
     or p_environment <> 'production'
     or p_credential_kind not in ('model_provider','github_draft_pr')
     or p_state not in ('configured','missing','revoked')
     or p_public_fingerprint_hash !~ '^[a-f0-9]{64}$'
     or p_scope_manifest_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at <= now_at
     or p_expires_at > now_at + interval '30 days'
     or not exists (
       select 1
       from public.intelligence_tasks task
       where task.id = p_task_id
         and task.project_id = p_project_id
         and task.platform = p_platform
         and task.environment = p_environment
         and task.repository_full_name = 'Chillywood2025/chillywood-mobile'
     ) then
    raise exception 'cognitive_level01_credential_attestation_rejected'
      using errcode = 'P0001';
  end if;
  insert into public.cognitive_level01_credential_attestations(
    task_id, project_id, platform, environment, credential_kind, state,
    public_fingerprint_hash, scope_manifest_hash, verified_at, expires_at
  ) values (
    p_task_id, p_project_id, p_platform, p_environment, p_credential_kind,
    p_state, p_public_fingerprint_hash, p_scope_manifest_hash, now_at, p_expires_at
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.cognitive_record_level01_credential_attestation(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,timestamptz,text
) from public, anon, authenticated;
grant execute on function public.cognitive_record_level01_credential_attestation(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,timestamptz,text
) to service_role;

create function public.cognitive_record_execution_evaluation(
  p_receipt_id uuid,
  p_evaluation_status public.cognitive_evaluation_status,
  p_proof_manifest jsonb,
  p_actor_identity text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt public.cognitive_execution_receipts%rowtype;
  decision public.governance_decision_manifests%rowtype;
  evaluation_id uuid;
  required_test_manifest_hash_value text;
  evidence_manifest_hash_value text;
  missing_required_test boolean;
begin
  perform public.governance_assert_level01_service_actor(
    array['independent_evaluation_judge'],
    p_actor_identity
  );
  select * into receipt
  from public.cognitive_execution_receipts value
  where value.id = p_receipt_id
  for share;
  if receipt.id is null then
    raise exception 'cognitive_execution_evaluation_receipt_missing'
      using errcode = 'P0001';
  end if;
  select * into decision
  from public.governance_decision_manifests value
  where value.id = receipt.decision_manifest_id
    and value.task_id = receipt.task_id
    and value.project_id = receipt.project_id
    and value.platform = receipt.platform
    and value.environment = receipt.environment;
  if decision.id is null
     or p_evaluation_status not in ('pass','fail','incomplete','blocked')
     or jsonb_typeof(p_proof_manifest) <> 'object'
     or pg_column_size(p_proof_manifest) > 65536
     or not p_proof_manifest ?& array[
       'tests','finalCommit','diffHash','evidenceManifestHash',
       'physicalEvidenceType'
     ]
     or (select count(*) from jsonb_object_keys(p_proof_manifest)) <> 5
     or jsonb_typeof(p_proof_manifest->'tests') <> 'array'
     or jsonb_array_length(p_proof_manifest->'tests') > 128
     or (p_proof_manifest->>'finalCommit') !~ '^[a-f0-9]{40}$'
     or (p_proof_manifest->>'diffHash') !~ '^[a-f0-9]{64}$'
     or (p_proof_manifest->>'evidenceManifestHash') !~ '^[a-f0-9]{64}$'
     or p_proof_manifest->>'physicalEvidenceType' not in (
       'none','device_attested','provider_attested'
     )
     or receipt.final_commit is null
     or receipt.diff_hash is null
     or p_proof_manifest->>'finalCommit' <> receipt.final_commit
     or p_proof_manifest->>'diffHash' <> receipt.diff_hash
     or exists (
       select 1
       from jsonb_array_elements(p_proof_manifest->'tests') test
       where jsonb_typeof(test) <> 'object'
          or not test ?& array['testId','status','exitCode','commit']
          or (select count(*) from jsonb_object_keys(test)) <> 4
          or length(test->>'testId') not between 3 and 128
          or public.cognitive_text_has_secret(test->>'testId')
          or public.cognitive_text_has_private_identifier(test->>'testId')
          or test->>'status' not in ('passed','failed','skipped')
          or test->>'exitCode' !~ '^-?[0-9]{1,4}$'
          or test->>'commit' !~ '^[a-f0-9]{40}$'
     ) then
    raise exception 'cognitive_execution_evaluation_proof_rejected'
      using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from unnest(decision.required_test_ids) required_test_id
    where not exists (
      select 1
      from jsonb_array_elements(p_proof_manifest->'tests') test
      where test->>'testId' = required_test_id
        and test->>'status' = 'passed'
        and (test->>'exitCode')::integer = 0
        and test->>'commit' = receipt.final_commit
    )
  ) into missing_required_test;
  if p_evaluation_status = 'pass' and missing_required_test then
    raise exception 'cognitive_execution_evaluation_required_test_missing'
      using errcode = 'P0001';
  end if;

  required_test_manifest_hash_value := encode(extensions.digest(
    convert_to(
      (
        select jsonb_agg(value order by value)::text
        from unnest(decision.required_test_ids) value
      ),
      'UTF8'
    ),
    'sha256'
  ), 'hex');
  evidence_manifest_hash_value := encode(extensions.digest(
    convert_to(p_proof_manifest::text, 'UTF8'),
    'sha256'
  ), 'hex');

  insert into public.governance_execution_evaluations(
    receipt_id, task_id, project_id, platform, environment,
    evaluator_identity_hash, evaluation_status, required_test_manifest_hash,
    evidence_manifest_hash, evaluated_commit, evaluated_diff_hash, proof_manifest
  ) values (
    receipt.id, receipt.task_id, receipt.project_id, receipt.platform,
    receipt.environment,
    encode(extensions.digest(convert_to(p_actor_identity,'UTF8'),'sha256'),'hex'),
    p_evaluation_status, required_test_manifest_hash_value,
    evidence_manifest_hash_value, receipt.final_commit, receipt.diff_hash,
    p_proof_manifest
  ) returning id into evaluation_id;
  return evaluation_id;
exception
  when invalid_text_representation then
    raise exception 'cognitive_execution_evaluation_proof_rejected'
      using errcode = 'P0001';
end;
$$;
revoke all on function public.cognitive_record_execution_evaluation(
  uuid,public.cognitive_evaluation_status,jsonb,text
) from public, anon, authenticated;
grant execute on function public.cognitive_record_execution_evaluation(
  uuid,public.cognitive_evaluation_status,jsonb,text
) to service_role;

create function public.cognitive_record_draft_pr_canary(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_canary_key text,
  p_decision_manifest_id uuid,
  p_approval_version_id uuid,
  p_execution_receipt_id uuid,
  p_execution_evaluation_id uuid,
  p_branch_name text,
  p_draft_pr_reference_hash text,
  p_actor_identity text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt public.cognitive_execution_receipts%rowtype;
  evaluation public.governance_execution_evaluations%rowtype;
  approval_version public.governance_approval_versions%rowtype;
  decision public.governance_decision_manifests%rowtype;
  result_id uuid;
  evidence_hash_value text;
  now_at timestamptz := transaction_timestamp();
begin
  perform public.governance_assert_level01_service_actor(
    array['independent_evaluation_judge'],
    p_actor_identity
  );
  select * into receipt
  from public.cognitive_execution_receipts value
  where value.id = p_execution_receipt_id
    and value.task_id = p_task_id
    and value.project_id = p_project_id
    and value.platform = p_platform
    and value.environment = p_environment;
  select * into evaluation
  from public.governance_execution_evaluations value
  where value.id = p_execution_evaluation_id
    and value.receipt_id = p_execution_receipt_id
    and value.task_id = p_task_id
    and value.project_id = p_project_id
    and value.platform = p_platform
    and value.environment = p_environment;
  select * into approval_version
  from public.governance_approval_versions value
  where value.id = p_approval_version_id
    and value.task_id = p_task_id
    and value.project_id = p_project_id
    and value.platform = p_platform
    and value.environment = p_environment;
  select * into decision
  from public.governance_decision_manifests value
  where value.id = p_decision_manifest_id
    and value.task_id = p_task_id
    and value.project_id = p_project_id
    and value.platform = p_platform
    and value.environment = p_environment;
  if p_canary_key not in (
       'documentation_draft_pr','test_only_draft_pr','low_risk_source_draft_pr'
     )
     or p_platform <> 'shared'
     or p_environment <> 'production'
     or p_branch_name !~ '^codex/cognitive-canary/[a-z0-9][a-z0-9/_-]{2,80}$'
     or p_draft_pr_reference_hash !~ '^[a-f0-9]{64}$'
     or receipt.id is null
     or evaluation.id is null
     or evaluation.evaluation_status <> 'pass'
     or approval_version.id is null
     or now_at < approval_version.valid_from
     or now_at >= approval_version.expires_at
     or decision.id is null
     or decision.status <> 'finalized'
     or now_at >= decision.expires_at
     or receipt.decision_manifest_id <> decision.id
     or receipt.approval_version_id <> approval_version.id
     or receipt.branch_name <> p_branch_name
     or receipt.receipt_state <> 'pending_evaluation'
     or receipt.final_commit is null
     or exists (
       select 1
       from public.governance_vetoes veto
       where veto.deliberation_id = decision.deliberation_id
         and veto.mandatory
         and veto.status = 'active'
     ) then
    raise exception 'cognitive_draft_pr_canary_rejected' using errcode = 'P0001';
  end if;

  evidence_hash_value := encode(extensions.digest(
    convert_to(
      concat_ws(
        ':', p_canary_key, decision.decision_hash, approval_version.id::text,
        receipt.receipt_hash, evaluation.evidence_manifest_hash,
        p_draft_pr_reference_hash
      ),
      'UTF8'
    ),
    'sha256'
  ), 'hex');
  insert into public.cognitive_level01_canary_runs(
    task_id, project_id, platform, environment, canary_key, canary_type,
    result_status, source_manifest, result_manifest, source_commit,
    evidence_hash, evaluator_state, completed_at
  ) values (
    p_task_id, p_project_id, p_platform, p_environment, p_canary_key,
    'draft_pr', 'passed',
    jsonb_build_array(
      jsonb_build_object(
        'decisionManifestHash', decision.decision_hash,
        'approvalVersionIdHash', encode(extensions.digest(
          convert_to(approval_version.id::text,'UTF8'),'sha256'
        ),'hex')
      )
    ),
    jsonb_build_object(
      'receiptHash', receipt.receipt_hash,
      'evaluationHash', evaluation.evidence_manifest_hash,
      'draftPrReferenceHash', p_draft_pr_reference_hash,
      'mergeAuthority', false,
      'releaseAuthority', false
    ),
    receipt.final_commit, evidence_hash_value, 'pass', now_at
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.cognitive_record_draft_pr_canary(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,uuid,uuid,uuid,uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.cognitive_record_draft_pr_canary(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,uuid,uuid,uuid,uuid,text,text,text
) to service_role;

create or replace function public.governance_set_level01_switch(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_switch_key text,
  p_enabled boolean,
  p_policy_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  result_id uuid;
  now_at timestamptz := transaction_timestamp();
  audit_hash text;
begin
  if p_platform <> 'shared'
     or p_environment <> 'production'
     or p_switch_key not in (
       'cognitive_research_enabled',
       'cognitive_memory_enabled',
       'cognitive_collective_deliberation_enabled',
       'cognitive_draft_pr_executor_enabled',
       'cognitive_scheduled_level01_enabled'
     )
     or length(p_policy_version) not between 1 and 64
     or public.cognitive_text_has_secret(p_policy_version)
     or not exists (
       select 1
       from public.intelligence_tasks task
       where task.id = p_task_id
         and task.project_id = p_project_id
         and task.platform = p_platform
         and task.environment = p_environment
         and task.repository_full_name = 'Chillywood2025/chillywood-mobile'
     )
     or (
       p_enabled and not exists (
         select 1
         from public.autonomous_system_emergency_states emergency
         where emergency.system_id = 'product_intelligence_operator'
           and emergency.status = 'active'
       )
     ) then
    raise exception 'governance_switch_scope_rejected' using errcode = 'P0001';
  end if;

  if p_enabled
     and p_switch_key in ('cognitive_research_enabled','cognitive_memory_enabled')
     and not exists (
       select 1
       from public.cognitive_retention_policy_states policy
       where policy.task_id = p_task_id
         and policy.project_id = p_project_id
         and policy.platform = p_platform
         and policy.environment = p_environment
         and policy.policy_state = 'owner_counsel_decision_required'
         and not policy.user_derived_memory_allowed
         and not policy.raw_user_reports_allowed
         and not policy.raw_private_messages_allowed
         and not policy.raw_private_media_allowed
         and not policy.raw_user_analytics_allowed
         and not policy.private_model_input_allowed
     ) then
    raise exception 'cognitive_retention_gate_required' using errcode = 'P0001';
  end if;

  if p_enabled and p_switch_key = 'cognitive_collective_deliberation_enabled'
     and (
       select count(distinct run.canary_key)
       from public.cognitive_level01_canary_runs run
       where run.task_id = p_task_id
         and run.project_id = p_project_id
         and run.platform = p_platform
         and run.environment = p_environment
         and run.canary_type = 'research'
         and run.result_status = 'passed'
         and run.evaluator_state = 'pass'
     ) <> 3 then
    raise exception 'cognitive_research_canaries_required' using errcode = 'P0001';
  end if;

  if p_enabled and p_switch_key = 'cognitive_draft_pr_executor_enabled'
     and (
       (
         select count(distinct run.canary_key)
         from public.cognitive_level01_canary_runs run
         where run.task_id = p_task_id
           and run.project_id = p_project_id
           and run.platform = p_platform
           and run.environment = p_environment
           and run.canary_type = 'deliberation'
           and run.result_status = 'passed'
           and run.evaluator_state = 'pass'
       ) <> 3
       or not exists (
         select 1
         from public.cognitive_level01_credential_attestations attestation
         where attestation.task_id = p_task_id
           and attestation.project_id = p_project_id
           and attestation.platform = p_platform
           and attestation.environment = p_environment
           and attestation.credential_kind = 'github_draft_pr'
           and attestation.state = 'configured'
           and attestation.verified_at <= now_at
           and now_at < attestation.expires_at
         order by attestation.verified_at desc
         limit 1
       )
     ) then
    raise exception 'cognitive_draft_pr_canary_prerequisites_required'
      using errcode = 'P0001';
  end if;

  if p_enabled and p_switch_key = 'cognitive_scheduled_level01_enabled'
     and (
       (
         select count(distinct run.canary_key)
         from public.cognitive_level01_canary_runs run
         where run.task_id = p_task_id
           and run.project_id = p_project_id
           and run.platform = p_platform
           and run.environment = p_environment
           and run.canary_type = 'draft_pr'
           and run.result_status = 'passed'
           and run.evaluator_state = 'pass'
       ) <> 3
       or (
         select count(*)
         from public.cognitive_level01_schedule_definitions schedule
         where schedule.task_id = p_task_id
           and schedule.project_id = p_project_id
           and schedule.platform = p_platform
           and schedule.environment = p_environment
           and schedule.enabled
       ) <> 5
     ) then
    raise exception 'cognitive_schedule_canaries_required' using errcode = 'P0001';
  end if;

  insert into public.cognitive_governance_switches(
    task_id, project_id, platform, environment, switch_key, enabled,
    policy_version, enabled_by, enabled_at, disabled_at, updated_at
  ) values (
    p_task_id, p_project_id, p_platform, p_environment, p_switch_key, p_enabled,
    p_policy_version, case when p_enabled then owner_id else null end,
    case when p_enabled then now_at else null end,
    case when p_enabled then null else now_at end,
    now_at
  )
  on conflict (task_id, switch_key) do update
  set enabled = excluded.enabled,
      policy_version = excluded.policy_version,
      enabled_by = excluded.enabled_by,
      enabled_at = excluded.enabled_at,
      disabled_at = excluded.disabled_at,
      updated_at = now_at
  where cognitive_governance_switches.project_id = excluded.project_id
    and cognitive_governance_switches.platform = excluded.platform
    and cognitive_governance_switches.environment = excluded.environment
  returning id into result_id;
  if result_id is null then
    raise exception 'governance_switch_scope_rejected' using errcode = 'P0001';
  end if;

  if not p_enabled and p_switch_key in (
    'cognitive_research_enabled',
    'cognitive_memory_enabled',
    'cognitive_collective_deliberation_enabled',
    'cognitive_draft_pr_executor_enabled'
  ) then
    update public.cognitive_governance_switches switch
    set enabled = false,
        enabled_by = null,
        disabled_at = now_at,
        updated_at = now_at
    where switch.task_id = p_task_id
      and switch.switch_key = any(
        case p_switch_key
          when 'cognitive_research_enabled' then array[
            'cognitive_collective_deliberation_enabled',
            'cognitive_draft_pr_executor_enabled',
            'cognitive_scheduled_level01_enabled'
          ]
          when 'cognitive_memory_enabled' then array[
            'cognitive_collective_deliberation_enabled',
            'cognitive_draft_pr_executor_enabled',
            'cognitive_scheduled_level01_enabled'
          ]
          when 'cognitive_collective_deliberation_enabled' then array[
            'cognitive_draft_pr_executor_enabled',
            'cognitive_scheduled_level01_enabled'
          ]
          else array['cognitive_scheduled_level01_enabled']
        end
      );
  end if;

  audit_hash := encode(extensions.digest(
    convert_to(
      p_task_id::text || ':' || p_switch_key || ':' || p_enabled::text || ':' ||
      p_policy_version || ':' || now_at::text,
      'UTF8'
    ),
    'sha256'
  ), 'hex');
  insert into public.governance_audit_events(
    task_id, project_id, platform, environment, entity_type, entity_id,
    event_type, actor_identity_hash, evidence_hash
  ) values (
    p_task_id, p_project_id, p_platform, p_environment,
    'switch', result_id,
    case when p_enabled then 'enabled' else 'disabled' end,
    encode(extensions.digest(convert_to(owner_id::text,'UTF8'),'sha256'),'hex'),
    audit_hash
  );
  return result_id;
end;
$$;
revoke all on function public.governance_set_level01_switch(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,boolean,text
) from public, anon;
grant execute on function public.governance_set_level01_switch(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,boolean,text
) to authenticated;

create function public.cognitive_classify_canonical_payload(p_payload jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  candidate text := public.cognitive_security_normalize(coalesce(p_payload::text, ''));
  maximum_depth integer;
  excessive_container boolean;
  sanitized_payload boolean;
begin
  with recursive payload_walk(value, depth) as (
    select p_payload, 0
    union all
    select child.value, parent.depth + 1
    from payload_walk parent
    cross join lateral (
      select array_entry.value
      from jsonb_array_elements(
        case when jsonb_typeof(parent.value) = 'array'
          then parent.value else '[]'::jsonb end
      ) array_entry
      union all
      select object_entry.value
      from jsonb_each(
        case when jsonb_typeof(parent.value) = 'object'
          then parent.value else '{}'::jsonb end
      ) object_entry
    ) child
    where parent.depth <= 8
  )
  select
    coalesce(max(depth), 0),
    coalesce(bool_or(
      (jsonb_typeof(value) = 'array' and jsonb_array_length(value) > 128)
      or (
        jsonb_typeof(value) = 'object'
        and (select count(*) from jsonb_object_keys(value)) > 128
      )
      or (
        jsonb_typeof(value) = 'string'
        and octet_length(value #>> '{}') > 4000
      )
    ), false)
  into maximum_depth, excessive_container
  from payload_walk;
  if p_payload is null
     or pg_column_size(p_payload) > 16000
     or maximum_depth > 8
     or excessive_container
     or jsonb_typeof(p_payload) not in ('object','array','string','number','boolean') then
    return 'invalid_or_oversized';
  end if;
  sanitized_payload := public.cognitive_json_is_sanitized(p_payload);
  if not sanitized_payload
     and (
       public.cognitive_text_has_secret(candidate)
       or public.cognitive_text_has_private_identifier(candidate)
     ) then
    return 'secret_or_private';
  end if;
  if candidate ~* '\m(ignore|override|bypass|disable|weaken|forget)\M.{0,80}\m(instruction|policy|approval|rls|guard|system|developer|safety)\M'
     or candidate ~* '\m(merge|deploy|release|execute|run|invoke|read)\M.{0,80}\m(pull[[:space:]]+request|production|shell|command|tool|environment|secret|credential)\M' then
    return 'untrusted_instruction';
  end if;
  if candidate ~* '\m(administrator|assumerole|attachuserpolicy|cluster-admin|clusterrolebindings|contents:write|editor|impersonate|notaction|notresource|owner|poweruseraccess|root|setiampolicy|system:masters|tokencreator|workflow:write|workflows:write|wildcard_allow)\M' then
    return 'provider_authority';
  end if;
  if not sanitized_payload then
    return 'secret_or_private';
  end if;
  return 'safe';
end;
$$;
revoke all on function public.cognitive_classify_canonical_payload(jsonb)
  from public, anon, authenticated;
grant execute on function public.cognitive_classify_canonical_payload(jsonb)
  to service_role;

comment on table public.cognitive_level01_canary_runs is
  'Immutable bounded Level 0/1 canary evidence; never stores private user content.';
comment on table public.cognitive_level01_schedule_definitions is
  'Owner-gated bounded Level 0/1 schedule definitions; all rows begin disabled.';
