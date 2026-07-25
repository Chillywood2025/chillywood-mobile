-- Database-enforced authority boundary for the advisory-only model router.
-- A distinct Owner registers one exact capability against an already claimed,
-- live two-party execution. The model router can then reserve and settle only
-- the bound task/project/platform/environment, council role, prerequisite
-- switch, provider/model, and intelligence budget. No row grants approval,
-- evaluator authority, quorum eligibility, or tool authority.

create or replace function public.governance_service_identity_allows_operation(
  p_service_identity text,
  p_operation text
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_service_identity
    when 'cognitive_approved_action_worker' then p_operation = any(array[
      'bootstrap_control_plane','set_switch','public_research_ingest',
      'collective_deliberation','github_draft_pr','model_advisory'
    ]::text[])
    when 'product_experience_baseline_service' then p_operation = 'visual_experience_canary'
    when 'livekit_experience_sentinel' then p_operation = 'livekit_experience_canary'
    when 'visual_product_experience_sentinel' then p_operation = 'visual_experience_canary'
    when 'installed_journey_sentinel' then p_operation = 'installed_journey_canary'
    when 'product_quality_triage_router' then p_operation = 'product_quality_triage'
    when 'model_independence_attestation_service' then p_operation = 'model_independence_attestation'
    when 'cognitive_independent_evaluator' then p_operation = 'independent_evaluation'
    else false
  end;
$$;
revoke all on function public.governance_service_identity_allows_operation(text,text)
  from public, anon, authenticated, service_role;

alter table public.governance_owner_approval_versions
  drop constraint governance_owner_approval_versions_operation_check;
alter table public.governance_owner_approval_versions
  add constraint governance_owner_approval_versions_operation_check
  check (operation in (
    'bootstrap_control_plane',
    'set_switch',
    'public_research_ingest',
    'collective_deliberation',
    'model_independence_attestation',
    'model_advisory',
    'livekit_experience_canary',
    'visual_experience_canary',
    'installed_journey_canary',
    'product_quality_triage',
    'github_draft_pr'
  ));

create table public.cognitive_model_router_capabilities (
  id uuid primary key default gen_random_uuid(),
  approved_execution_id uuid not null unique,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  council_role text not null check (council_role in (
    'product_user_experience',
    'architecture_engineering',
    'security_privacy',
    'reliability_release',
    'safety_trust',
    'accessibility_inclusion',
    'money_commercial_policy',
    'research_futures',
    'adversarial_red_team'
  )),
  required_switch_key text not null check (required_switch_key in (
    'cognitive_research_enabled',
    'cognitive_memory_enabled',
    'cognitive_collective_deliberation_enabled',
    'cognitive_draft_pr_executor_enabled',
    'cognitive_scheduled_level01_enabled',
    'cognitive_livekit_experience_sentinel_enabled',
    'cognitive_visual_experience_sentinel_enabled',
    'cognitive_installed_journey_sentinel_enabled'
  )),
  provider_family text not null check (provider_family = 'openai'),
  model_family text not null check (
    model_family ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,79}$'
  ),
  model_name text not null check (
    model_name ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$'
  ),
  budget_id uuid not null,
  service_identity text not null default 'cognitive_model_router' check (
    service_identity = 'cognitive_model_router'
  ),
  authority text not null default 'advisory_only' check (
    authority = 'advisory_only'
  ),
  quorum_eligible boolean not null default false check (
    quorum_eligible = false
  ),
  evaluator_authority boolean not null default false check (
    evaluator_authority = false
  ),
  tool_authority boolean not null default false check (
    tool_authority = false
  ),
  maximum_calls integer not null check (maximum_calls between 1 and 10),
  maximum_model_tokens bigint not null check (
    maximum_model_tokens between 128 and 100000
  ),
  maximum_model_cost numeric(12,4) not null check (
    maximum_model_cost between 0.0001 and 5
  ),
  reserved_calls integer not null default 0 check (reserved_calls >= 0),
  settled_calls integer not null default 0 check (settled_calls >= 0),
  reserved_model_tokens bigint not null default 0 check (
    reserved_model_tokens >= 0
  ),
  settled_model_tokens bigint not null default 0 check (
    settled_model_tokens >= 0
  ),
  reserved_model_cost numeric(12,4) not null default 0 check (
    reserved_model_cost >= 0
  ),
  settled_model_cost numeric(12,4) not null default 0 check (
    settled_model_cost >= 0
  ),
  approval_target_hash text not null check (
    approval_target_hash ~ '^[a-f0-9]{64}$'
  ),
  scope_hash text not null unique check (scope_hash ~ '^[a-f0-9]{64}$'),
  registered_by uuid not null references auth.users(id),
  issued_at timestamptz not null default transaction_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  revocation_hash text check (
    revocation_hash is null or revocation_hash ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (id, task_id, project_id, platform, environment),
  foreign key (
    approved_execution_id, task_id, project_id, platform, environment
  ) references public.governance_approved_action_executions(
    id, task_id, project_id, platform, environment
  ),
  foreign key (
    budget_id, task_id, project_id, platform, environment
  ) references public.intelligence_budgets(
    id, task_id, project_id, platform, environment
  ),
  check (expires_at > issued_at),
  check (
    model_name = model_family
    or model_name like model_family || '-%'
  ),
  check (
    reserved_calls + settled_calls <= maximum_calls
    and reserved_model_tokens + settled_model_tokens <= maximum_model_tokens
    and reserved_model_cost + settled_model_cost <= maximum_model_cost
  ),
  check (
    (revoked_at is null and revoked_by is null and revocation_hash is null)
    or
    (revoked_at is not null and revoked_by is not null and revocation_hash is not null)
  )
);

create table public.cognitive_model_router_preflight_audits (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null,
  approved_execution_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  council_role text not null,
  required_switch_key text not null,
  provider_family text not null check (provider_family = 'openai'),
  model_family text not null,
  model_name text not null,
  budget_id uuid not null,
  assessment_id text not null check (
    length(assessment_id) between 8 and 160
    and not public.cognitive_text_has_secret(assessment_id)
    and not public.cognitive_text_has_private_identifier(assessment_id)
  ),
  idempotency_key text not null check (idempotency_key ~ '^[a-f0-9]{64}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  evidence_packet_hash text not null check (
    evidence_packet_hash ~ '^[a-f0-9]{64}$'
  ),
  prompt_template_hash text not null check (
    prompt_template_hash ~ '^[a-f0-9]{64}$'
  ),
  configured_model_identity_hash text not null check (
    configured_model_identity_hash ~ '^[a-f0-9]{64}$'
  ),
  reserved_model_tokens bigint not null check (
    reserved_model_tokens between 128 and 100000
  ),
  reserved_model_cost numeric(12,4) not null check (
    reserved_model_cost between 0.0001 and 5
  ),
  service_identity text not null check (
    service_identity = 'cognitive_model_router'
  ),
  authority text not null default 'advisory_only' check (
    authority = 'advisory_only'
  ),
  quorum_eligible boolean not null default false check (
    quorum_eligible = false
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (capability_id, idempotency_key),
  unique (capability_id, assessment_id),
  unique (id, capability_id),
  unique (id, budget_id),
  unique (id, task_id, project_id, platform, environment),
  foreign key (
    capability_id, task_id, project_id, platform, environment
  ) references public.cognitive_model_router_capabilities(
    id, task_id, project_id, platform, environment
  ),
  foreign key (
    approved_execution_id, task_id, project_id, platform, environment
  ) references public.governance_approved_action_executions(
    id, task_id, project_id, platform, environment
  ),
  foreign key (
    budget_id, task_id, project_id, platform, environment
  ) references public.intelligence_budgets(
    id, task_id, project_id, platform, environment
  )
);

create table public.cognitive_model_router_result_audits (
  id uuid primary key default gen_random_uuid(),
  preflight_id uuid not null unique,
  capability_id uuid not null,
  budget_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  result_status text not null check (result_status in (
    'completed',
    'provider_failed',
    'provider_timeout',
    'provider_rate_limited',
    'provider_rejected',
    'governance_rejected'
  )),
  actual_model_tokens bigint not null check (
    actual_model_tokens between 0 and 100000
  ),
  actual_model_cost numeric(12,4) not null check (
    actual_model_cost between 0 and 5
  ),
  provider_model_version text,
  provider_response_id_hash text check (
    provider_response_id_hash is null
    or provider_response_id_hash ~ '^[a-f0-9]{64}$'
  ),
  output_hash text check (
    output_hash is null or output_hash ~ '^[a-f0-9]{64}$'
  ),
  invocation_hash text check (
    invocation_hash is null or invocation_hash ~ '^[a-f0-9]{64}$'
  ),
  execution_identity_hash text check (
    execution_identity_hash is null
    or execution_identity_hash ~ '^[a-f0-9]{64}$'
  ),
  failure_reason_hash text check (
    failure_reason_hash is null
    or failure_reason_hash ~ '^[a-f0-9]{64}$'
  ),
  result_hash text not null unique check (result_hash ~ '^[a-f0-9]{64}$'),
  latency_ms integer not null check (latency_ms between 0 and 120000),
  service_identity text not null check (
    service_identity = 'cognitive_model_router'
  ),
  authority text not null default 'advisory_only' check (
    authority = 'advisory_only'
  ),
  quorum_eligible boolean not null default false check (
    quorum_eligible = false
  ),
  evaluator_proof_present boolean not null default false check (
    evaluator_proof_present = false
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (id, task_id, project_id, platform, environment),
  foreign key (preflight_id, capability_id)
    references public.cognitive_model_router_preflight_audits(id, capability_id),
  foreign key (preflight_id, budget_id)
    references public.cognitive_model_router_preflight_audits(id, budget_id),
  check (
    (
      result_status = 'completed'
      and provider_model_version is not null
      and provider_response_id_hash is not null
      and output_hash is not null
      and invocation_hash is not null
      and execution_identity_hash is not null
      and failure_reason_hash is null
    )
    or
    (
      result_status <> 'completed'
      and failure_reason_hash is not null
    )
  )
);

create table public.cognitive_model_router_revocation_audits (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null unique,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  revocation_hash text not null unique check (
    revocation_hash ~ '^[a-f0-9]{64}$'
  ),
  revoked_by_identity_hash text not null check (
    revoked_by_identity_hash ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (id, task_id, project_id, platform, environment),
  foreign key (
    capability_id, task_id, project_id, platform, environment
  ) references public.cognitive_model_router_capabilities(
    id, task_id, project_id, platform, environment
  )
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cognitive_model_router_capabilities',
    'cognitive_model_router_preflight_audits',
    'cognitive_model_router_result_audits',
    'cognitive_model_router_revocation_audits'
  ] loop
    execute format(
      'alter table public.%I enable row level security',
      table_name
    );
    execute format(
      'alter table public.%I force row level security',
      table_name
    );
    execute format(
      'revoke all on table public.%I
       from public, anon, authenticated, service_role',
      table_name
    );
    execute format(
      'grant select on table public.%I to service_role',
      table_name
    );
  end loop;
end
$$;

grant select on table
  public.cognitive_model_router_capabilities,
  public.cognitive_model_router_preflight_audits,
  public.cognitive_model_router_result_audits,
  public.cognitive_model_router_revocation_audits
to authenticated;

create policy cognitive_model_router_capabilities_exact_read
  on public.cognitive_model_router_capabilities
  for select to authenticated
  using ((select public.cognitive_can_read_scope(project_id, task_id, platform)));
create policy cognitive_model_router_preflights_exact_read
  on public.cognitive_model_router_preflight_audits
  for select to authenticated
  using ((select public.cognitive_can_read_scope(project_id, task_id, platform)));
create policy cognitive_model_router_results_exact_read
  on public.cognitive_model_router_result_audits
  for select to authenticated
  using ((select public.cognitive_can_read_scope(project_id, task_id, platform)));
create policy cognitive_model_router_revocations_exact_read
  on public.cognitive_model_router_revocation_audits
  for select to authenticated
  using ((select public.cognitive_can_read_scope(project_id, task_id, platform)));

create trigger cognitive_model_router_preflights_immutable
before update or delete on public.cognitive_model_router_preflight_audits
for each row execute function public.reject_cognitive_evidence_mutation();
create trigger cognitive_model_router_results_immutable
before update or delete on public.cognitive_model_router_result_audits
for each row execute function public.reject_cognitive_evidence_mutation();
create trigger cognitive_model_router_revocations_immutable
before update or delete on public.cognitive_model_router_revocation_audits
for each row execute function public.reject_cognitive_evidence_mutation();

create function public.governance_owner_register_model_router_capability(
  p_approved_execution_id uuid,
  p_budget_id uuid,
  p_council_role text,
  p_required_switch_key text,
  p_provider_family text,
  p_model_family text,
  p_model_name text,
  p_maximum_calls integer,
  p_maximum_model_tokens bigint,
  p_maximum_model_cost numeric,
  p_scope_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  execution_value public.governance_approved_action_executions%rowtype;
  budget_value public.intelligence_budgets%rowtype;
  switch_enabled boolean;
  capability_id_value uuid;
  now_at timestamptz := transaction_timestamp();
begin
  select * into execution_value
  from public.governance_approved_action_executions
  where id = p_approved_execution_id
  for update;

  if execution_value.id is null
     or execution_value.service_identity <> 'cognitive_approved_action_worker'
     or execution_value.provider <> 'model'
     or execution_value.operation <> 'model_advisory'
     or execution_value.state <> 'executing'
     or not public.governance_lock_approved_execution_liveness(
       execution_value.id
     ) then
    raise exception 'model_router_owner_capability_rejected'
      using errcode = 'P0001';
  end if;

  select * into budget_value
  from public.intelligence_budgets
  where id = p_budget_id
    and task_id = execution_value.task_id
    and project_id = execution_value.project_id
    and platform = execution_value.platform
    and environment = execution_value.environment
  for update;

  select switch.enabled into switch_enabled
  from public.cognitive_governance_switches switch
  where switch.task_id = execution_value.task_id
    and switch.project_id = execution_value.project_id
    and switch.platform = execution_value.platform
    and switch.environment = execution_value.environment
    and switch.switch_key = p_required_switch_key
  for share;

  if budget_value.id is null
     or now_at >= budget_value.deadline_at
     or switch_enabled is distinct from true
     or p_council_role not in (
       'product_user_experience','architecture_engineering',
       'security_privacy','reliability_release','safety_trust',
       'accessibility_inclusion','money_commercial_policy',
       'research_futures','adversarial_red_team'
     )
     or p_required_switch_key not in (
       'cognitive_research_enabled','cognitive_memory_enabled',
       'cognitive_collective_deliberation_enabled',
       'cognitive_draft_pr_executor_enabled',
       'cognitive_scheduled_level01_enabled',
       'cognitive_livekit_experience_sentinel_enabled',
       'cognitive_visual_experience_sentinel_enabled',
       'cognitive_installed_journey_sentinel_enabled'
     )
     or p_provider_family <> 'openai'
     or p_model_family !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,79}$'
     or p_model_name !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$'
     or (
       p_model_name <> p_model_family
       and p_model_name not like p_model_family || '-%'
     )
     or p_maximum_calls not between 1 and 10
     or p_maximum_model_tokens not between 128 and 100000
     or p_maximum_model_cost not between 0.0001 and 5
     or p_maximum_model_tokens > (
       budget_value.max_model_tokens - budget_value.used_model_tokens
     )
     or p_maximum_model_cost > (
       budget_value.max_model_cost - budget_value.used_model_cost
     )
     or p_scope_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at <= now_at
     or p_expires_at > now_at + interval '24 hours' then
    raise exception 'model_router_owner_capability_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.cognitive_model_router_capabilities(
    approved_execution_id, task_id, project_id, platform, environment,
    council_role, required_switch_key, provider_family, model_family,
    model_name, budget_id, maximum_calls, maximum_model_tokens,
    maximum_model_cost, approval_target_hash, scope_hash, registered_by,
    expires_at
  ) values (
    execution_value.id, execution_value.task_id, execution_value.project_id,
    execution_value.platform, execution_value.environment, p_council_role,
    p_required_switch_key, p_provider_family, p_model_family, p_model_name,
    p_budget_id, p_maximum_calls, p_maximum_model_tokens,
    p_maximum_model_cost, execution_value.target_resource_hash, p_scope_hash,
    owner_id, p_expires_at
  )
  returning id into capability_id_value;

  return capability_id_value;
end;
$$;
revoke all on function public.governance_owner_register_model_router_capability(
  uuid,uuid,text,text,text,text,text,integer,bigint,numeric,text,timestamptz
) from public, anon, service_role;
grant execute on function public.governance_owner_register_model_router_capability(
  uuid,uuid,text,text,text,text,text,integer,bigint,numeric,text,timestamptz
) to authenticated;

create function public.governance_owner_revoke_model_router_capability(
  p_capability_id uuid,
  p_revocation_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  capability_value public.cognitive_model_router_capabilities%rowtype;
  owner_hash text;
  now_at timestamptz := transaction_timestamp();
begin
  select * into capability_value
  from public.cognitive_model_router_capabilities
  where id = p_capability_id
  for update;

  if capability_value.id is null
     or capability_value.revoked_at is not null
     or p_revocation_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'model_router_capability_revocation_rejected'
      using errcode = 'P0001';
  end if;

  owner_hash := encode(extensions.digest(
    convert_to(owner_id::text, 'UTF8'), 'sha256'
  ), 'hex');

  update public.cognitive_model_router_capabilities
  set revoked_at = now_at,
      revoked_by = owner_id,
      revocation_hash = p_revocation_hash
  where id = capability_value.id;

  insert into public.cognitive_model_router_revocation_audits(
    capability_id, task_id, project_id, platform, environment,
    revocation_hash, revoked_by_identity_hash
  ) values (
    capability_value.id, capability_value.task_id,
    capability_value.project_id, capability_value.platform,
    capability_value.environment, p_revocation_hash, owner_hash
  );

  return true;
end;
$$;
revoke all on function public.governance_owner_revoke_model_router_capability(
  uuid,text
) from public, anon, service_role;
grant execute on function public.governance_owner_revoke_model_router_capability(
  uuid,text
) to authenticated;

create function public.cognitive_model_router_reserve(
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
  budget_value public.intelligence_budgets%rowtype;
  switch_enabled boolean;
  preflight_id_value uuid := gen_random_uuid();
  now_at timestamptz := transaction_timestamp();
begin
  perform public.cognitive_verify_service_token(
    'cognitive_model_router', p_service_identity_token
  );

  select * into capability_value
  from public.cognitive_model_router_capabilities
  where id = p_capability_id
  for update;

  if capability_value.id is null then
    raise exception 'model_router_capability_rejected'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.cognitive_model_router_preflight_audits preflight
    where preflight.capability_id = capability_value.id
      and (
        preflight.idempotency_key = p_idempotency_key
        or preflight.assessment_id = p_assessment_id
      )
  ) then
    raise exception 'model_router_replay_denied'
      using errcode = '23505';
  end if;

  if not public.governance_lock_approved_execution_liveness(
    capability_value.approved_execution_id
  ) then
    raise exception 'model_router_capability_rejected'
      using errcode = 'P0001';
  end if;

  select switch.enabled into switch_enabled
  from public.cognitive_governance_switches switch
  where switch.task_id = capability_value.task_id
    and switch.project_id = capability_value.project_id
    and switch.platform = capability_value.platform
    and switch.environment = capability_value.environment
    and switch.switch_key = capability_value.required_switch_key
  for share;

  select * into budget_value
  from public.intelligence_budgets
  where id = capability_value.budget_id
    and task_id = capability_value.task_id
    and project_id = capability_value.project_id
    and platform = capability_value.platform
    and environment = capability_value.environment
  for update;

  if capability_value.revoked_at is not null
     or now_at >= capability_value.expires_at
     or switch_enabled is distinct from true
     or budget_value.id is null
     or now_at >= budget_value.deadline_at
     or capability_value.task_id <> p_task_id
     or capability_value.project_id <> p_project_id
     or capability_value.platform <> p_platform
     or capability_value.environment <> p_environment
     or capability_value.council_role <> p_council_role
     or capability_value.provider_family <> p_provider_family
     or capability_value.model_family <> p_model_family
     or capability_value.model_name <> p_model_name
     or p_assessment_id is null
     or length(p_assessment_id) not between 8 and 160
     or public.cognitive_text_has_secret(p_assessment_id)
     or public.cognitive_text_has_private_identifier(p_assessment_id)
     or p_idempotency_key !~ '^[a-f0-9]{64}$'
     or p_request_hash !~ '^[a-f0-9]{64}$'
     or p_evidence_packet_hash !~ '^[a-f0-9]{64}$'
     or p_prompt_template_hash !~ '^[a-f0-9]{64}$'
     or p_configured_model_identity_hash !~ '^[a-f0-9]{64}$'
     or p_reserved_model_tokens not between 128 and 100000
     or p_reserved_model_cost not between 0.0001 and 5
     or capability_value.reserved_calls
       + capability_value.settled_calls + 1
       > capability_value.maximum_calls
     or capability_value.reserved_model_tokens
       + capability_value.settled_model_tokens
       + p_reserved_model_tokens
       > capability_value.maximum_model_tokens
     or capability_value.reserved_model_cost
       + capability_value.settled_model_cost
       + p_reserved_model_cost
       > capability_value.maximum_model_cost
     or budget_value.active_concurrent_calls + 1
       > budget_value.max_concurrent_calls
     or budget_value.used_model_tokens + p_reserved_model_tokens
       > budget_value.max_model_tokens
     or budget_value.used_model_cost + p_reserved_model_cost
       > budget_value.max_model_cost then
    raise exception 'model_router_capability_rejected'
      using errcode = 'P0001';
  end if;

  update public.cognitive_model_router_capabilities
  set reserved_calls = reserved_calls + 1,
      reserved_model_tokens = reserved_model_tokens + p_reserved_model_tokens,
      reserved_model_cost = reserved_model_cost + p_reserved_model_cost
  where id = capability_value.id;

  update public.intelligence_budgets
  set used_model_tokens = used_model_tokens + p_reserved_model_tokens,
      used_model_cost = used_model_cost + p_reserved_model_cost,
      active_concurrent_calls = active_concurrent_calls + 1
  where id = budget_value.id;

  insert into public.cognitive_model_router_preflight_audits(
    id, capability_id, approved_execution_id, task_id, project_id,
    platform, environment, council_role, required_switch_key,
    provider_family, model_family, model_name, budget_id, assessment_id,
    idempotency_key, request_hash, evidence_packet_hash,
    prompt_template_hash, configured_model_identity_hash,
    reserved_model_tokens, reserved_model_cost, service_identity
  ) values (
    preflight_id_value, capability_value.id,
    capability_value.approved_execution_id, capability_value.task_id,
    capability_value.project_id, capability_value.platform,
    capability_value.environment, capability_value.council_role,
    capability_value.required_switch_key, capability_value.provider_family,
    capability_value.model_family, capability_value.model_name,
    capability_value.budget_id, p_assessment_id, p_idempotency_key,
    p_request_hash, p_evidence_packet_hash, p_prompt_template_hash,
    p_configured_model_identity_hash, p_reserved_model_tokens,
    p_reserved_model_cost, 'cognitive_model_router'
  );

  insert into public.cognitive_budget_events(
    budget_id, task_id, project_id, platform, environment,
    reservation_id, event_type, usage
  ) values (
    budget_value.id, budget_value.task_id, budget_value.project_id,
    budget_value.platform, budget_value.environment, p_idempotency_key,
    'reserved', jsonb_build_object(
      'model_tokens', p_reserved_model_tokens,
      'model_cost', p_reserved_model_cost,
      'model_calls', 1,
      'service_identity', 'cognitive_model_router',
      'request_hash', p_request_hash
    )
  );

  return jsonb_build_object(
    'preflightId', preflight_id_value,
    'capabilityId', capability_value.id,
    'budgetId', budget_value.id,
    'reservedModelTokens', p_reserved_model_tokens,
    'reservedModelCost', p_reserved_model_cost,
    'providerFamily', capability_value.provider_family,
    'modelFamily', capability_value.model_family,
    'modelName', capability_value.model_name,
    'authority', 'advisory_only',
    'quorumEligible', false
  );
end;
$$;
revoke all on function public.cognitive_model_router_reserve(
  uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,text,text,bigint,numeric,text
) from public, anon, authenticated;
grant execute on function public.cognitive_model_router_reserve(
  uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,text,text,bigint,numeric,text
) to service_role;

create function public.cognitive_model_router_settle(
  p_preflight_id uuid,
  p_result_status text,
  p_actual_model_tokens bigint,
  p_actual_model_cost numeric,
  p_provider_model_version text,
  p_provider_response_id_hash text,
  p_output_hash text,
  p_invocation_hash text,
  p_execution_identity_hash text,
  p_failure_reason_hash text,
  p_result_hash text,
  p_latency_ms integer,
  p_service_identity_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  preflight_value public.cognitive_model_router_preflight_audits%rowtype;
  capability_value public.cognitive_model_router_capabilities%rowtype;
  budget_value public.intelligence_budgets%rowtype;
  switch_enabled boolean;
  result_id_value uuid;
  result_is_live boolean;
begin
  perform public.cognitive_verify_service_token(
    'cognitive_model_router', p_service_identity_token
  );

  select * into preflight_value
  from public.cognitive_model_router_preflight_audits
  where id = p_preflight_id
  for update;

  if preflight_value.id is null
     or exists (
       select 1 from public.cognitive_model_router_result_audits result
       where result.preflight_id = p_preflight_id
     ) then
    raise exception 'model_router_settlement_replay_denied'
      using errcode = '23505';
  end if;

  select * into capability_value
  from public.cognitive_model_router_capabilities
  where id = preflight_value.capability_id
  for update;

  select switch.enabled into switch_enabled
  from public.cognitive_governance_switches switch
  where switch.task_id = capability_value.task_id
    and switch.project_id = capability_value.project_id
    and switch.platform = capability_value.platform
    and switch.environment = capability_value.environment
    and switch.switch_key = capability_value.required_switch_key
  for share;

  select * into budget_value
  from public.intelligence_budgets
  where id = preflight_value.budget_id
    and task_id = preflight_value.task_id
    and project_id = preflight_value.project_id
    and platform = preflight_value.platform
    and environment = preflight_value.environment
  for update;

  if p_result_status = 'completed' then
    result_is_live :=
      capability_value.revoked_at is null
      and transaction_timestamp() < capability_value.expires_at
      and switch_enabled is true
      and public.governance_lock_approved_execution_liveness(
        capability_value.approved_execution_id
      );
  else
    result_is_live := public.governance_lock_approved_execution_cleanup_scope(
      capability_value.approved_execution_id
    );
  end if;

  if capability_value.id is null
     or budget_value.id is null
     or not coalesce(result_is_live, false)
     or p_result_status not in (
       'completed','provider_failed','provider_timeout',
       'provider_rate_limited','provider_rejected','governance_rejected'
     )
     or p_actual_model_tokens < 0
     or p_actual_model_tokens > preflight_value.reserved_model_tokens
     or p_actual_model_cost < 0
     or p_actual_model_cost > preflight_value.reserved_model_cost
     or p_result_hash !~ '^[a-f0-9]{64}$'
     or p_latency_ms not between 0 and 120000
     or (
       p_result_status = 'completed'
       and (
         p_provider_model_version is null
         or (
           p_provider_model_version <> capability_value.model_name
           and p_provider_model_version not like
             capability_value.model_name || '-%'
         )
         or p_provider_response_id_hash !~ '^[a-f0-9]{64}$'
         or p_output_hash !~ '^[a-f0-9]{64}$'
         or p_invocation_hash !~ '^[a-f0-9]{64}$'
         or p_execution_identity_hash !~ '^[a-f0-9]{64}$'
         or p_failure_reason_hash is not null
       )
     )
     or (
       p_result_status <> 'completed'
       and p_failure_reason_hash !~ '^[a-f0-9]{64}$'
     )
     or capability_value.reserved_calls < 1
     or capability_value.reserved_model_tokens
       < preflight_value.reserved_model_tokens
     or capability_value.reserved_model_cost
       < preflight_value.reserved_model_cost
     or budget_value.active_concurrent_calls < 1
     or budget_value.used_model_tokens
       < preflight_value.reserved_model_tokens
     or budget_value.used_model_cost
       < preflight_value.reserved_model_cost then
    raise exception 'model_router_settlement_rejected'
      using errcode = 'P0001';
  end if;

  update public.cognitive_model_router_capabilities
  set reserved_calls = reserved_calls - 1,
      settled_calls = settled_calls + 1,
      reserved_model_tokens =
        reserved_model_tokens - preflight_value.reserved_model_tokens,
      settled_model_tokens =
        settled_model_tokens + p_actual_model_tokens,
      reserved_model_cost =
        reserved_model_cost - preflight_value.reserved_model_cost,
      settled_model_cost =
        settled_model_cost + p_actual_model_cost
  where id = capability_value.id;

  update public.intelligence_budgets
  set used_model_tokens =
        used_model_tokens - preflight_value.reserved_model_tokens
        + p_actual_model_tokens,
      used_model_cost =
        used_model_cost - preflight_value.reserved_model_cost
        + p_actual_model_cost,
      active_concurrent_calls = active_concurrent_calls - 1
  where id = budget_value.id;

  insert into public.cognitive_budget_events(
    budget_id, task_id, project_id, platform, environment,
    reservation_id, event_type, usage
  ) values (
    budget_value.id, budget_value.task_id, budget_value.project_id,
    budget_value.platform, budget_value.environment,
    preflight_value.idempotency_key, 'settled', jsonb_build_object(
      'model_tokens', p_actual_model_tokens,
      'model_cost', p_actual_model_cost,
      'model_calls', 1,
      'service_identity', 'cognitive_model_router',
      'result_status', p_result_status,
      'result_hash', p_result_hash
    )
  );

  insert into public.cognitive_model_router_result_audits(
    preflight_id, capability_id, budget_id, task_id, project_id,
    platform, environment, result_status, actual_model_tokens,
    actual_model_cost, provider_model_version, provider_response_id_hash,
    output_hash, invocation_hash, execution_identity_hash,
    failure_reason_hash, result_hash, latency_ms, service_identity
  ) values (
    preflight_value.id, preflight_value.capability_id,
    preflight_value.budget_id, preflight_value.task_id,
    preflight_value.project_id, preflight_value.platform,
    preflight_value.environment, p_result_status, p_actual_model_tokens,
    p_actual_model_cost, p_provider_model_version,
    p_provider_response_id_hash, p_output_hash, p_invocation_hash,
    p_execution_identity_hash, p_failure_reason_hash, p_result_hash,
    p_latency_ms, 'cognitive_model_router'
  )
  returning id into result_id_value;

  return jsonb_build_object(
    'resultAuditId', result_id_value,
    'preflightId', preflight_value.id,
    'resultStatus', p_result_status,
    'authority', 'advisory_only',
    'quorumEligible', false,
    'evaluatorProofPresent', false
  );
end;
$$;
revoke all on function public.cognitive_model_router_settle(
  uuid,text,bigint,numeric,text,text,text,text,text,text,text,integer,text
) from public, anon, authenticated;
grant execute on function public.cognitive_model_router_settle(
  uuid,text,bigint,numeric,text,text,text,text,text,text,text,integer,text
) to service_role;

comment on function public.governance_owner_register_model_router_capability(
  uuid,uuid,text,text,text,text,text,integer,bigint,numeric,text,timestamptz
) is
  'Owner-only registration of an exact advisory model capability bound to a live two-party execution, prerequisite switch, and intelligence budget.';
comment on function public.cognitive_model_router_reserve(
  uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,text,text,bigint,numeric,text
) is
  'Atomically reserves one exact advisory model call and writes a sanitized immutable preflight audit; replay is denied.';
comment on function public.cognitive_model_router_settle(
  uuid,text,bigint,numeric,text,text,text,text,text,text,text,integer,text
) is
  'Atomically settles one reserved model call and writes a sanitized immutable result audit. Completed results require current task, emergency, switch, execution, capability, and model scope.';
