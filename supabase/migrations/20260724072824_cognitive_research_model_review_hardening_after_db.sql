-- Research/model review hardening.
--
-- This forward-only migration:
--   * binds the shared github.com research authority to the reviewed repository;
--   * closes the superseded caller-authored research-source RPC;
--   * binds every model reservation to its Owner-approved target and canonical
--     assessment scope; and
--   * gives in-flight model reservations a bounded lease with conservative,
--     immutable recovery.
--
-- It enables no switch and grants no quorum, evaluator, tool, or release authority.

alter table public.cognitive_research_authorities
  add column path_prefix text;

alter table public.cognitive_research_authorities
  add constraint cognitive_research_authorities_path_prefix_check check (
    path_prefix is null
    or (
      length(path_prefix) between 2 and 501
      and path_prefix ~ '^/[A-Za-z0-9._~!$&''()*+,;=:@%/-]+$'
      and path_prefix !~ '(^|/)\.\.?(/|$)'
      and right(path_prefix, 1) <> '/'
    )
  );

update public.cognitive_research_authorities
set path_prefix = '/Chillywood2025/chillywood-mobile'
where authority_id = 'chillywood-public-repository'
  and canonical_host = 'github.com'
  and source_type = 'engineering_practice'
  and publisher = 'Chi''llywood'
  and ownership_identity = 'chillywood';

-- BEGIN GENERATED RESEARCH AUTHORITY PATHS — config/intelligence/research-authorities.json
select * from (values
  ('chillywood-public-repository','/Chillywood2025/chillywood-mobile')
) as generated_research_authority_paths(authority_id,path_prefix)
where false;
-- END GENERATED RESEARCH AUTHORITY PATHS

do $$
begin
  if not exists (
    select 1
    from public.cognitive_research_authorities authority
    where authority.authority_id = 'chillywood-public-repository'
      and authority.canonical_host = 'github.com'
      and authority.source_type = 'engineering_practice'
      and authority.publisher = 'Chi''llywood'
      and authority.ownership_identity = 'chillywood'
      and authority.path_prefix = '/Chillywood2025/chillywood-mobile'
  ) then
    raise exception 'chillywood_research_authority_path_missing'
      using errcode = 'P0001';
  end if;
end
$$;

create function public.cognitive_enforce_research_authority_path()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  required_path text;
  locator text;
  canonical_base text;
begin
  select authority.path_prefix into required_path
  from public.cognitive_research_authorities authority
  where authority.authority_id = new.authority_id
    and authority.canonical_host = new.canonical_host
    and authority.source_type = new.source_type
    and authority.publisher = new.publisher
    and authority.ownership_identity = new.ownership_identity;

  if required_path is null then
    return new;
  end if;

  locator := new.citation_metadata->>'locator';
  canonical_base := 'https://' || new.canonical_host || required_path;
  if locator is null
     or not (
       locator = canonical_base
       or locator like canonical_base || '/%'
       or locator like canonical_base || '?%'
     )
     or encode(
       extensions.digest(convert_to(locator, 'UTF8'), 'sha256'),
       'hex'
     ) <> new.canonical_url_hash then
    raise exception 'research_authority_path_rejected' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
revoke all on function public.cognitive_enforce_research_authority_path()
  from public, anon, authenticated, service_role;

create trigger research_sources_authority_path_guard
before insert on public.research_sources
for each row execute function public.cognitive_enforce_research_authority_path();

-- The superseded helper accepted caller-authored network and citation evidence.
-- The DNS-pinned cognitive_record_public_research_source RPC is the only live
-- research-source persistence path.
revoke all on function public.cognitive_record_research_source(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,timestamptz,timestamptz,timestamptz,text,boolean,
  text,text,text,text[],text
) from public,anon,authenticated,service_role;

alter table public.cognitive_model_router_preflight_audits
  add column approval_target_hash text,
  add column scope_hash text,
  add column lease_expires_at timestamptz;

-- The operationalization source has not been deployed, so no model preflight
-- can exist. Fail closed instead of retroactively claiming that a legacy call
-- proved target/scope binding it did not enforce.
do $$
begin
  if exists (
    select 1 from public.cognitive_model_router_preflight_audits
  ) then
    raise exception 'model_router_hardening_requires_empty_preflights'
      using errcode = 'P0001';
  end if;
end
$$;

alter table public.cognitive_model_router_preflight_audits
  alter column approval_target_hash set not null,
  alter column scope_hash set not null,
  alter column lease_expires_at set not null,
  alter column lease_expires_at set default (
    transaction_timestamp() + interval '2 minutes'
  ),
  add constraint cognitive_model_router_preflight_approval_target_hash_check
    check (approval_target_hash ~ '^[a-f0-9]{64}$'),
  add constraint cognitive_model_router_preflight_scope_hash_check
    check (scope_hash ~ '^[a-f0-9]{64}$'),
  add constraint cognitive_model_router_preflight_lease_check
    check (
      lease_expires_at > created_at
      and lease_expires_at <= created_at + interval '2 minutes'
    );

create table public.cognitive_model_router_recovery_audits (
  id uuid primary key default gen_random_uuid(),
  preflight_id uuid not null unique,
  capability_id uuid not null,
  budget_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  recovery_batch_hash text not null check (
    recovery_batch_hash ~ '^[a-f0-9]{64}$'
  ),
  recovery_hash text not null unique check (
    recovery_hash ~ '^[a-f0-9]{64}$'
  ),
  accounting_state text not null check (
    accounting_state = 'conservative_reservation_charged'
  ),
  recovered_model_tokens bigint not null check (
    recovered_model_tokens between 128 and 100000
  ),
  recovered_model_cost numeric(12,4) not null check (
    recovered_model_cost between 0.0001 and 5
  ),
  service_identity text not null check (
    service_identity = 'cognitive_model_router'
  ),
  recovered_at timestamptz not null default transaction_timestamp(),
  created_at timestamptz not null default transaction_timestamp(),
  unique (id, task_id, project_id, platform, environment),
  foreign key (preflight_id, capability_id)
    references public.cognitive_model_router_preflight_audits(id, capability_id),
  foreign key (preflight_id, budget_id)
    references public.cognitive_model_router_preflight_audits(id, budget_id)
);

alter table public.cognitive_model_router_recovery_audits enable row level security;
alter table public.cognitive_model_router_recovery_audits force row level security;
revoke all on table public.cognitive_model_router_recovery_audits
  from public,anon,authenticated,service_role;
grant select on table public.cognitive_model_router_recovery_audits
  to authenticated,service_role;
create policy cognitive_model_router_recoveries_exact_read
  on public.cognitive_model_router_recovery_audits
  for select to authenticated
  using ((select public.cognitive_can_read_scope(project_id,task_id,platform)));
create trigger cognitive_model_router_recoveries_immutable
before update or delete on public.cognitive_model_router_recovery_audits
for each row execute function public.reject_cognitive_evidence_mutation();

create function public.cognitive_model_router_recover_expired(
  p_capability_id uuid,
  p_limit integer,
  p_recovery_batch_hash text,
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
  recovered_count integer := 0;
  recovery_hash_value text;
begin
  perform public.cognitive_verify_service_token(
    'cognitive_model_router', p_service_identity_token
  );

  if p_limit not between 1 and 10
     or p_recovery_batch_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'model_router_recovery_rejected' using errcode = 'P0001';
  end if;

  for preflight_value in
    select preflight.*
    from public.cognitive_model_router_preflight_audits preflight
    where preflight.capability_id = p_capability_id
      and preflight.lease_expires_at <= transaction_timestamp()
      and not exists (
        select 1
        from public.cognitive_model_router_result_audits result
        where result.preflight_id = preflight.id
      )
      and not exists (
        select 1
        from public.cognitive_model_router_recovery_audits recovery
        where recovery.preflight_id = preflight.id
      )
    order by preflight.lease_expires_at, preflight.id
    limit p_limit
    for update skip locked
  loop
    if exists (
         select 1 from public.cognitive_model_router_result_audits result
         where result.preflight_id = preflight_value.id
       )
       or exists (
         select 1 from public.cognitive_model_router_recovery_audits recovery
         where recovery.preflight_id = preflight_value.id
       ) then
      continue;
    end if;

    select * into capability_value
    from public.cognitive_model_router_capabilities capability
    where capability.id = preflight_value.capability_id
    for update;

    select * into budget_value
    from public.intelligence_budgets budget
    where budget.id = preflight_value.budget_id
      and budget.task_id = preflight_value.task_id
      and budget.project_id = preflight_value.project_id
      and budget.platform = preflight_value.platform
      and budget.environment = preflight_value.environment
    for update;

    if capability_value.id is null
       or budget_value.id is null
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
      raise exception 'model_router_recovery_accounting_rejected'
        using errcode = 'P0001';
    end if;

    update public.cognitive_model_router_capabilities
    set reserved_calls = reserved_calls - 1,
        settled_calls = settled_calls + 1,
        reserved_model_tokens =
          reserved_model_tokens - preflight_value.reserved_model_tokens,
        settled_model_tokens =
          settled_model_tokens + preflight_value.reserved_model_tokens,
        reserved_model_cost =
          reserved_model_cost - preflight_value.reserved_model_cost,
        settled_model_cost =
          settled_model_cost + preflight_value.reserved_model_cost
    where id = capability_value.id;

    update public.intelligence_budgets
    set active_concurrent_calls = active_concurrent_calls - 1
    where id = budget_value.id;

    recovery_hash_value := encode(extensions.digest(convert_to(concat_ws(
      '|','cognitive-model-router-recovery-v1',preflight_value.id::text,
      preflight_value.lease_expires_at::text,p_recovery_batch_hash,
      preflight_value.reserved_model_tokens::text,
      preflight_value.reserved_model_cost::text
    ),'UTF8'),'sha256'),'hex');

    insert into public.cognitive_budget_events(
      budget_id,task_id,project_id,platform,environment,
      reservation_id,event_type,usage
    ) values (
      budget_value.id,budget_value.task_id,budget_value.project_id,
      budget_value.platform,budget_value.environment,
      preflight_value.idempotency_key,'released',jsonb_build_object(
        'model_tokens',preflight_value.reserved_model_tokens,
        'model_cost',preflight_value.reserved_model_cost,
        'model_calls',1,
        'service_identity','cognitive_model_router',
        'reason_hash',recovery_hash_value,
        'accounting_state','conservative_reservation_charged'
      )
    );

    insert into public.cognitive_model_router_recovery_audits(
      preflight_id,capability_id,budget_id,task_id,project_id,platform,
      environment,recovery_batch_hash,recovery_hash,accounting_state,
      recovered_model_tokens,recovered_model_cost,service_identity
    ) values (
      preflight_value.id,preflight_value.capability_id,
      preflight_value.budget_id,preflight_value.task_id,
      preflight_value.project_id,preflight_value.platform,
      preflight_value.environment,p_recovery_batch_hash,recovery_hash_value,
      'conservative_reservation_charged',
      preflight_value.reserved_model_tokens,
      preflight_value.reserved_model_cost,'cognitive_model_router'
    );

    recovered_count := recovered_count + 1;
  end loop;

  return jsonb_build_object(
    'capabilityId',p_capability_id,
    'recoveredCount',recovered_count,
    'recoveryBatchHash',p_recovery_batch_hash
  );
end;
$$;
revoke all on function public.cognitive_model_router_recover_expired(
  uuid,integer,text,text
) from public,anon,authenticated;
grant execute on function public.cognitive_model_router_recover_expired(
  uuid,integer,text,text
) to service_role;

revoke all on function public.cognitive_model_router_reserve(
  uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,text,text,bigint,numeric,text
) from public,anon,authenticated,service_role;
drop function public.cognitive_model_router_reserve(
  uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,text,text,bigint,numeric,text
);

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
  p_approval_target_hash text,
  p_scope_hash text,
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
  expected_scope_hash text;
  expected_model_identity_hash text;
begin
  perform public.cognitive_verify_service_token(
    'cognitive_model_router',p_service_identity_token
  );

  select * into capability_value
  from public.cognitive_model_router_capabilities
  where id = p_capability_id
  for update;

  if capability_value.id is null then
    raise exception 'model_router_capability_rejected' using errcode = 'P0001';
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
    raise exception 'model_router_replay_denied' using errcode = '23505';
  end if;

  if not public.governance_lock_approved_execution_liveness(
    capability_value.approved_execution_id
  ) then
    raise exception 'model_router_capability_rejected' using errcode = 'P0001';
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

  expected_scope_hash := encode(extensions.digest(convert_to(concat_ws(
    '|','cognitive-model-assessment-scope-v1',p_task_id::text,
    p_project_id::text,p_platform::text,p_environment::text,p_council_role,
    p_assessment_id,p_evidence_packet_hash
  ),'UTF8'),'sha256'),'hex');
  expected_model_identity_hash := encode(extensions.digest(convert_to(concat_ws(
    '|',p_provider_family,p_model_family,p_model_name
  ),'UTF8'),'sha256'),'hex');

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
     or capability_value.approval_target_hash
       is distinct from p_approval_target_hash
     or capability_value.scope_hash is distinct from p_scope_hash
     or p_scope_hash is distinct from expected_scope_hash
     or p_configured_model_identity_hash
       is distinct from expected_model_identity_hash
     or p_assessment_id is null
     or length(p_assessment_id) not between 8 and 160
     or public.cognitive_text_has_secret(p_assessment_id)
     or public.cognitive_text_has_private_identifier(p_assessment_id)
     or p_idempotency_key !~ '^[a-f0-9]{64}$'
     or p_request_hash !~ '^[a-f0-9]{64}$'
     or p_evidence_packet_hash !~ '^[a-f0-9]{64}$'
     or p_prompt_template_hash !~ '^[a-f0-9]{64}$'
     or p_approval_target_hash !~ '^[a-f0-9]{64}$'
     or p_scope_hash !~ '^[a-f0-9]{64}$'
     or p_configured_model_identity_hash !~ '^[a-f0-9]{64}$'
     or p_reserved_model_tokens not between 128 and 100000
     or p_reserved_model_cost not between 0.0001 and 5
     or capability_value.reserved_calls
       + capability_value.settled_calls + 1 > capability_value.maximum_calls
     or capability_value.reserved_model_tokens
       + capability_value.settled_model_tokens + p_reserved_model_tokens
       > capability_value.maximum_model_tokens
     or capability_value.reserved_model_cost
       + capability_value.settled_model_cost + p_reserved_model_cost
       > capability_value.maximum_model_cost
     or budget_value.active_concurrent_calls + 1
       > budget_value.max_concurrent_calls
     or budget_value.used_model_tokens + p_reserved_model_tokens
       > budget_value.max_model_tokens
     or budget_value.used_model_cost + p_reserved_model_cost
       > budget_value.max_model_cost then
    raise exception 'model_router_capability_rejected' using errcode = 'P0001';
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
    id,capability_id,approved_execution_id,task_id,project_id,platform,
    environment,council_role,required_switch_key,provider_family,model_family,
    model_name,budget_id,assessment_id,idempotency_key,request_hash,
    evidence_packet_hash,prompt_template_hash,configured_model_identity_hash,
    approval_target_hash,scope_hash,lease_expires_at,reserved_model_tokens,
    reserved_model_cost,service_identity
  ) values (
    preflight_id_value,capability_value.id,
    capability_value.approved_execution_id,capability_value.task_id,
    capability_value.project_id,capability_value.platform,
    capability_value.environment,capability_value.council_role,
    capability_value.required_switch_key,capability_value.provider_family,
    capability_value.model_family,capability_value.model_name,
    capability_value.budget_id,p_assessment_id,p_idempotency_key,
    p_request_hash,p_evidence_packet_hash,p_prompt_template_hash,
    p_configured_model_identity_hash,p_approval_target_hash,p_scope_hash,
    now_at + interval '2 minutes',p_reserved_model_tokens,
    p_reserved_model_cost,'cognitive_model_router'
  );

  insert into public.cognitive_budget_events(
    budget_id,task_id,project_id,platform,environment,
    reservation_id,event_type,usage
  ) values (
    budget_value.id,budget_value.task_id,budget_value.project_id,
    budget_value.platform,budget_value.environment,p_idempotency_key,
    'reserved',jsonb_build_object(
      'model_tokens',p_reserved_model_tokens,
      'model_cost',p_reserved_model_cost,
      'model_calls',1,
      'service_identity','cognitive_model_router',
      'request_hash',p_request_hash
    )
  );

  return jsonb_build_object(
    'preflightId',preflight_id_value,
    'capabilityId',capability_value.id,
    'budgetId',budget_value.id,
    'reservedModelTokens',p_reserved_model_tokens,
    'reservedModelCost',p_reserved_model_cost,
    'providerFamily',capability_value.provider_family,
    'modelFamily',capability_value.model_family,
    'modelName',capability_value.model_name,
    'authority','advisory_only',
    'quorumEligible',false
  );
end;
$$;
revoke all on function public.cognitive_model_router_reserve(
  uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,text,text,text,text,bigint,numeric,text
) from public,anon,authenticated;
grant execute on function public.cognitive_model_router_reserve(
  uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,text,text,text,text,bigint,numeric,text
) to service_role;

comment on column public.cognitive_research_authorities.path_prefix is
  'Optional exact path boundary for authorities hosted on shared public domains.';
comment on function public.cognitive_model_router_recover_expired(
  uuid,integer,text,text
) is
  'Idempotently releases expired model concurrency leases, conservatively charges the reserved call/token/cost ceiling, and writes immutable recovery evidence.';
comment on function public.cognitive_model_router_reserve(
  uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,text,text,text,text,bigint,numeric,text
) is
  'Reserves one advisory model call only when Owner target and canonical assessment scope match the stored capability; each reservation has a two-minute recovery lease.';
