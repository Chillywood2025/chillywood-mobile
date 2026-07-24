-- Dedicated least-privilege authority for the Cognitive Level 0/1 GitHub
-- draft-PR broker. The broker may consume only an already-issued, exact-scope
-- capability that is also bound to a live Owner-approved two-party execution.
-- It cannot merge, release, deploy, mutate protected product areas, or use the
-- generic control-plane/tool-broker identity.

alter table public.cognitive_service_identities
  drop constraint cognitive_service_identities_service_identity_check;

alter table public.cognitive_service_identities
  add constraint cognitive_service_identities_service_identity_check
  check (
    service_identity in (
      'cognitive_control_plane',
      'product_intelligence_operator',
      'privacy_compliance_operator',
      'research_source_broker',
      'governance_constitution_service',
      'deliberation_orchestrator',
      'decision_manifest_authority',
      'owner_approval_lifecycle_service',
      'capability_and_tool_broker',
      'cognitive_postflight_authority',
      'independent_evaluation_judge',
      'approval_revalidation_service',
      'intelligence_memory_service',
      'governance_canary_scheduler',
      'trusted_test_runner',
      'credential_attestation_authority',
      'cognitive_sentinel_collector',
      'cognitive_product_quality_triage',
      'cognitive_research_broker',
      'cognitive_model_router',
      'cognitive_github_draft_pr_broker',
      'cognitive_level01_scheduler'
    )
  );

create table public.cognitive_github_draft_pr_authorizations (
  id uuid primary key default gen_random_uuid(),
  capability_event_id uuid not null unique
    references public.cognitive_capability_events(id),
  approved_execution_id uuid not null unique,
  capability_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  call_id text not null,
  branch_name text not null,
  path text not null,
  base_commit text not null check (base_commit ~ '^[a-f0-9]{40}$'),
  prior_blob_sha text not null check (
    prior_blob_sha = 'absent' or prior_blob_sha ~ '^[a-f0-9]{40}$'
  ),
  source_state_hash text not null check (
    source_state_hash ~ '^[a-f0-9]{64}$'
  ),
  required_tests_hash text not null check (
    required_tests_hash ~ '^[a-f0-9]{64}$'
  ),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  service_identity text not null check (
    service_identity = 'cognitive_github_draft_pr_broker'
  ),
  owner_impersonation_allowed boolean not null default false check (
    owner_impersonation_allowed = false
  ),
  merge_allowed boolean not null default false check (merge_allowed = false),
  release_allowed boolean not null default false check (
    release_allowed = false
  ),
  deployment_allowed boolean not null default false check (
    deployment_allowed = false
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (capability_id, call_id),
  unique (id, task_id, project_id, platform, environment),
  foreign key (
    approved_execution_id, task_id, project_id, platform, environment
  ) references public.governance_approved_action_executions(
    id, task_id, project_id, platform, environment
  ),
  foreign key (
    capability_id, task_id, project_id, platform, environment
  ) references public.cognitive_capabilities(
    id, task_id, project_id, platform, environment
  ),
  check (
    branch_name ~ '^codex/cognitive-canary/[a-z0-9][a-z0-9/_-]{2,80}$'
    and branch_name !~* '(^|/)(main|master|release)(/|$)'
    and length(path) between 3 and 180
    and path !~ '(^|/)\.\.(/|$)|(^/)|//'
  )
);

create table public.cognitive_github_draft_pr_tool_events (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null unique,
  tool_result_id uuid not null unique,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  before_state_hash text not null check (
    before_state_hash ~ '^[a-f0-9]{64}$'
  ),
  after_state_hash text not null check (
    after_state_hash ~ '^[a-f0-9]{64}$'
  ),
  diff_hash text not null check (diff_hash ~ '^[a-f0-9]{64}$'),
  final_commit text not null check (final_commit ~ '^[a-f0-9]{40}$'),
  event_hash text not null unique check (event_hash ~ '^[a-f0-9]{64}$'),
  service_identity text not null check (
    service_identity = 'cognitive_github_draft_pr_broker'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (id, task_id, project_id, platform, environment),
  foreign key (
    authorization_id, task_id, project_id, platform, environment
  ) references public.cognitive_github_draft_pr_authorizations(
    id, task_id, project_id, platform, environment
  ),
  foreign key (tool_result_id)
    references public.cognitive_tool_result_records(id)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cognitive_github_draft_pr_authorizations',
    'cognitive_github_draft_pr_tool_events'
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
    execute format(
      'create trigger %I before update or delete on public.%I
       for each row execute function public.reject_cognitive_evidence_mutation()',
      table_name || '_immutable',
      table_name
    );
  end loop;
end
$$;

grant select on table
  public.cognitive_github_draft_pr_authorizations,
  public.cognitive_github_draft_pr_tool_events
to authenticated;

create policy cognitive_github_draft_pr_authorizations_exact_read
  on public.cognitive_github_draft_pr_authorizations
  for select to authenticated
  using (
    (
      select public.cognitive_can_read_scope(
        project_id, task_id, platform
      )
    )
  );

create policy cognitive_github_draft_pr_tool_events_exact_read
  on public.cognitive_github_draft_pr_tool_events
  for select to authenticated
  using (
    (
      select public.cognitive_can_read_scope(
        project_id, task_id, platform
      )
    )
  );

create function public.cognitive_record_github_draft_pr_provider_readback(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_public_fingerprint_hash text,
  p_scope_manifest_hash text,
  p_evidence_hash text,
  p_expires_at timestamptz,
  p_service_identity_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := transaction_timestamp();
  producer_hash text := encode(
    extensions.digest(
      convert_to('cognitive_github_draft_pr_broker', 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  external_evidence_id_value uuid;
  provider_readback_id_value uuid;
begin
  perform public.cognitive_verify_service_token(
    'cognitive_github_draft_pr_broker',
    p_service_identity_token
  );

  if p_platform <> 'shared'
     or p_environment <> 'production'
     or p_public_fingerprint_hash !~ '^[a-f0-9]{64}$'
     or p_scope_manifest_hash !~ '^[a-f0-9]{64}$'
     or p_evidence_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at <= now_at + interval '5 minutes'
     or p_expires_at > now_at + interval '65 minutes'
     or not exists (
       select 1
       from public.intelligence_tasks task
       where task.id = p_task_id
         and task.project_id = p_project_id
         and task.platform = p_platform
         and task.environment = p_environment
         and task.cancelled_at is null
         and task.quarantined_at is null
         and now_at < task.deadman_at
     )
     or not public.governance_approval_emergency_active() then
    raise exception 'github_draft_pr_provider_readback_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.cognitive_verified_external_evidence(
    task_id, project_id, platform, environment, evidence_type,
    evidence_hash, producer_identity_hash, observed_at, expires_at
  ) values (
    p_task_id, p_project_id, p_platform, p_environment,
    'provider_attested', p_evidence_hash, producer_hash, now_at, p_expires_at
  )
  returning id into external_evidence_id_value;

  insert into public.cognitive_provider_credential_receipts(
    task_id, project_id, platform, environment, receipt_type,
    credential_kind, provider, state, public_fingerprint_hash,
    scope_manifest_hash, producer_identity_hash, verified_at,
    expires_at, external_evidence_id
  ) values (
    p_task_id, p_project_id, p_platform, p_environment,
    'provider_readback', 'github_draft_pr', 'github', 'configured',
    p_public_fingerprint_hash, p_scope_manifest_hash, producer_hash,
    now_at, p_expires_at, external_evidence_id_value
  )
  returning id into provider_readback_id_value;

  return jsonb_build_object(
    'provider_readback_id', provider_readback_id_value,
    'external_evidence_id', external_evidence_id_value,
    'credential_kind', 'github_draft_pr',
    'state', 'configured',
    'expires_at', p_expires_at
  );
end;
$$;

revoke all on function public.cognitive_record_github_draft_pr_provider_readback(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,timestamptz,text
) from public, anon, authenticated;
grant execute on function public.cognitive_record_github_draft_pr_provider_readback(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,timestamptz,text
) to service_role;

create function public.cognitive_consume_github_draft_pr_capability(
  p_capability_id text,
  p_opaque_bearer text,
  p_opaque_nonce text,
  p_call_id text,
  p_task_id uuid,
  p_project_id uuid,
  p_repository_full_name text,
  p_branch_name text,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_provider text,
  p_operation text,
  p_path text,
  p_resource_lease_id uuid,
  p_bytes bigint,
  p_cost numeric,
  p_approval_scope_hash text,
  p_plan_snapshot_hash text,
  p_request_hash text,
  p_preflight_receipt_id uuid,
  p_required_tests_hash text,
  p_source_state_hash text,
  p_base_commit text,
  p_prior_blob_sha text,
  p_service_identity_token text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability_value public.cognitive_capabilities%rowtype;
  lease_value public.cognitive_resource_leases%rowtype;
  task_value public.intelligence_tasks%rowtype;
  execution_value public.governance_approved_action_executions%rowtype;
  approval_status text;
  approval_expires timestamptz;
  approval_platform text;
  approval_scope_hash_value text;
  emergency_status text;
  sequence_value integer;
  capability_event_id_value uuid;
  now_at timestamptz := transaction_timestamp();
begin
  perform public.cognitive_verify_service_token(
    'cognitive_github_draft_pr_broker',
    p_service_identity_token
  );

  select * into capability_value
  from public.cognitive_capabilities
  where capability_id = p_capability_id
  for update;
  select * into task_value
  from public.intelligence_tasks
  where id = p_task_id
    and project_id = p_project_id
    and platform = p_platform
    and environment = p_environment
  for share;
  select * into lease_value
  from public.cognitive_resource_leases
  where id = p_resource_lease_id
  for update;
  select * into execution_value
  from public.governance_approved_action_executions
  where id = p_preflight_receipt_id
  for update;
  select
    status, expires_at, platform, metadata->>'approval_scope_hash'
  into
    approval_status, approval_expires, approval_platform,
    approval_scope_hash_value
  from public.autonomous_approval_requests
  where id = capability_value.approval_request_id;
  select status into emergency_status
  from public.autonomous_system_emergency_states
  where system_id = 'product_intelligence_operator'
  for share;

  if capability_value.id is null
     or capability_value.status <> 'active'
     or encode(extensions.digest(
       convert_to(coalesce(p_opaque_bearer, ''), 'UTF8'),
       'sha256'
     ), 'hex') is distinct from capability_value.bearer_hash
     or encode(extensions.digest(
       convert_to(coalesce(p_opaque_nonce, ''), 'UTF8'),
       'sha256'
     ), 'hex') is distinct from capability_value.nonce_hash
     or now_at < capability_value.not_before
     or now_at >= capability_value.expires_at
     or capability_value.revoked_at is not null
     or task_value.id is null
     or task_value.cancelled_at is not null
     or task_value.quarantined_at is not null
     or now_at >= task_value.deadman_at
     or approval_status <> 'approved'
     or approval_expires <= now_at
     or approval_platform <> p_platform::text
     or approval_scope_hash_value <> p_approval_scope_hash
     or coalesce(emergency_status, 'emergency_stop') <> 'active'
     or capability_value.task_id <> p_task_id
     or capability_value.project_id <> p_project_id
     or capability_value.repository_full_name <> p_repository_full_name
     or capability_value.branch_name <> p_branch_name
     or capability_value.platform <> p_platform
     or capability_value.environment <> p_environment
     or capability_value.provider <> p_provider
     or capability_value.operation <> p_operation
     or capability_value.approval_scope_hash <> p_approval_scope_hash
     or capability_value.plan_snapshot_hash <> p_plan_snapshot_hash
     or p_repository_full_name <> 'Chillywood2025/chillywood-mobile'
     or p_platform <> 'shared'
     or p_environment <> 'production'
     or p_provider <> 'github'
     or p_operation <> 'github_open_draft_pr'
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
         and attestation.expires_at > now_at
     )
     or p_branch_name !~
       '^codex/cognitive-canary/[a-z0-9][a-z0-9/_-]{2,80}$'
     or p_branch_name ~* '(^|/)(main|master|release)(/|$)'
     or p_path ~ '(^|/)\.\.(/|$)|(^/)|//'
     or not (
       p_path ~
         '^docs/intelligence/canaries/[A-Za-z0-9][A-Za-z0-9._-]{2,80}\.md$'
       or p_path ~
         '^scripts/cognitive-canaries/[A-Za-z0-9][A-Za-z0-9._-]{2,80}\.(mjs|ts)$'
       or p_path ~
         '^(src|components|app)/[A-Za-z0-9][A-Za-z0-9._/-]{2,160}\.(ts|tsx|js|jsx)$'
     )
     or p_path ~*
       '(^|/)(auth|billing|entitlements?|legal|moderation|money|payments?|payouts?|pricing|providers?|ranking|releases?|rights?|rls|roles?|secrets?|transfers?|withdrawals?|workflows?)([._/-]|$)'
     or not exists (
       select 1
       from unnest(capability_value.path_scopes) scope
       where p_path = rtrim(scope, '/')
          or p_path like rtrim(scope, '/') || '/%'
     )
     or capability_value.remaining_calls < 1
     or p_bytes < 0
     or p_bytes > capability_value.remaining_bytes
     or p_cost <> 0
     or p_cost > capability_value.remaining_cost
     or p_request_hash !~ '^[a-f0-9]{64}$'
     or p_required_tests_hash !~ '^[a-f0-9]{64}$'
     or p_source_state_hash !~ '^[a-f0-9]{64}$'
     or p_base_commit !~ '^[a-f0-9]{40}$'
     or not (
       p_prior_blob_sha = 'absent'
       or p_prior_blob_sha ~ '^[a-f0-9]{40}$'
     )
     or (
       p_path ~ '^(docs/intelligence/canaries|scripts/cognitive-canaries)/'
       and p_prior_blob_sha <> 'absent'
     )
     or (
       p_path ~ '^(src|components|app)/'
       and p_prior_blob_sha = 'absent'
     )
     or p_source_state_hash <> encode(
       extensions.digest(
         convert_to(
           concat_ws('|', p_base_commit, p_path, p_prior_blob_sha),
           'UTF8'
         ),
         'sha256'
       ),
       'hex'
     )
     or lease_value.id is null
     or lease_value.task_id <> p_task_id
     or lease_value.project_id <> p_project_id
     or lease_value.platform <> p_platform
     or lease_value.environment <> p_environment
     or lease_value.resource_type <> 'branch'
     or lease_value.resource_key <> 'branch:' || p_branch_name
     or lease_value.mode <> 'write'
     or lease_value.revoked_at is not null
     or now_at < lease_value.issued_at
     or now_at >= lease_value.expires_at
     or execution_value.id is null
     or execution_value.task_id <> p_task_id
     or execution_value.project_id <> p_project_id
     or execution_value.platform <> p_platform
     or execution_value.environment <> p_environment
     or execution_value.repository_full_name <> p_repository_full_name
     or execution_value.branch_name <> p_branch_name
     or execution_value.provider <> 'github_draft_pr'
     or execution_value.operation <> 'github_draft_pr'
     or execution_value.service_identity <> 'cognitive_approved_action_worker'
     or execution_value.state <> 'executing'
     or execution_value.target_resource_hash <> p_source_state_hash
     or execution_value.plan_snapshot_hash <> p_plan_snapshot_hash
     or execution_value.tests_hash <> p_required_tests_hash
     or not public.governance_lock_approved_execution_liveness(
       execution_value.id
     ) then
    raise exception 'github_draft_pr_capability_authorization_rejected'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.cognitive_capability_events event
    where event.capability_id = capability_value.id
      and event.call_id = p_call_id
  ) then
    raise exception 'github_draft_pr_capability_replay'
      using errcode = '23505';
  end if;

  sequence_value := capability_value.next_usage_sequence;
  update public.cognitive_capabilities
  set
    remaining_calls = remaining_calls - 1,
    remaining_bytes = remaining_bytes - p_bytes,
    remaining_cost = remaining_cost - p_cost,
    consumed_at = now_at,
    next_usage_sequence = next_usage_sequence + 1,
    status = case
      when remaining_calls - 1 = 0
      then 'exhausted'::public.cognitive_capability_status
      else status
    end
  where id = capability_value.id;

  insert into public.cognitive_capability_events(
    capability_id, task_id, project_id, platform, environment,
    call_id, usage_sequence, event_type, request_hash,
    resource_lease_id, resource_type, resource_key,
    reserved_bytes, reserved_cost
  ) values (
    capability_value.id, p_task_id, p_project_id, p_platform,
    p_environment, p_call_id, sequence_value, 'consumed',
    p_request_hash, p_resource_lease_id, 'branch',
    'branch:' || p_branch_name, p_bytes, p_cost
  )
  returning id into capability_event_id_value;

  insert into public.cognitive_github_draft_pr_authorizations(
    capability_event_id, approved_execution_id, capability_id,
    task_id, project_id, platform, environment, call_id,
    branch_name, path, base_commit, prior_blob_sha, source_state_hash,
    required_tests_hash, request_hash,
    service_identity
  ) values (
    capability_event_id_value, execution_value.id, capability_value.id,
    p_task_id, p_project_id, p_platform, p_environment, p_call_id,
    p_branch_name, p_path, p_base_commit, p_prior_blob_sha,
    p_source_state_hash, p_required_tests_hash, p_request_hash,
    'cognitive_github_draft_pr_broker'
  );

  return sequence_value;
end;
$$;

revoke all on function public.cognitive_consume_github_draft_pr_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,
  text,text,text,uuid,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.cognitive_consume_github_draft_pr_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,
  text,text,text,uuid,text,text,text,text,text
) to service_role;

create function public.cognitive_accept_github_draft_pr_tool_result(
  p_capability_id text,
  p_call_id text,
  p_opaque_bearer text,
  p_opaque_nonce text,
  p_result_envelope jsonb,
  p_before_state_hash text,
  p_after_state_hash text,
  p_diff_hash text,
  p_final_commit text,
  p_service_identity_token text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability_value public.cognitive_capabilities%rowtype;
  task_value public.intelligence_tasks%rowtype;
  consumed_event public.cognitive_capability_events%rowtype;
  authorization_value public.cognitive_github_draft_pr_authorizations%rowtype;
  execution_value public.governance_approved_action_executions%rowtype;
  tool_result_id_value uuid;
  result_hash_value text;
  event_hash_value text;
begin
  perform public.cognitive_verify_service_token(
    'cognitive_github_draft_pr_broker',
    p_service_identity_token
  );

  select * into capability_value
  from public.cognitive_capabilities
  where capability_id = p_capability_id
  for update;
  select * into task_value
  from public.intelligence_tasks
  where id = capability_value.task_id
    and project_id = capability_value.project_id
    and platform = capability_value.platform
    and environment = capability_value.environment
  for share;
  select * into consumed_event
  from public.cognitive_capability_events event
  where event.capability_id = capability_value.id
    and event.call_id = p_call_id
    and event.event_type = 'consumed'
  for share;
  select * into authorization_value
  from public.cognitive_github_draft_pr_authorizations authz
  where authz.capability_event_id = consumed_event.id
  for share;
  select * into execution_value
  from public.governance_approved_action_executions
  where id = authorization_value.approved_execution_id
  for update;

  if capability_value.id is null
     or encode(extensions.digest(
       convert_to(coalesce(p_opaque_bearer, ''), 'UTF8'),
       'sha256'
     ), 'hex') is distinct from capability_value.bearer_hash
     or encode(extensions.digest(
       convert_to(coalesce(p_opaque_nonce, ''), 'UTF8'),
       'sha256'
     ), 'hex') is distinct from capability_value.nonce_hash
     or capability_value.status not in ('active', 'exhausted')
     or capability_value.revoked_at is not null
     or transaction_timestamp() >= capability_value.expires_at
     or task_value.id is null
     or task_value.cancelled_at is not null
     or task_value.quarantined_at is not null
     or transaction_timestamp() >= task_value.deadman_at
     or consumed_event.id is null
     or authorization_value.id is null
     or execution_value.id is null
     or execution_value.state <> 'executing'
     or not public.governance_lock_approved_execution_liveness(
       execution_value.id
     )
     or p_result_envelope is null
     or pg_column_size(p_result_envelope) > 65536
     or not public.cognitive_json_is_sanitized(p_result_envelope)
     or p_before_state_hash !~ '^[a-f0-9]{64}$'
     or p_after_state_hash !~ '^[a-f0-9]{64}$'
     or p_diff_hash !~ '^[a-f0-9]{64}$'
     or p_final_commit !~ '^[a-f0-9]{40}$'
     or not public.cognitive_approval_is_fresh(
       capability_value.approval_request_id,
       capability_value.operation,
       capability_value.platform,
       capability_value.approval_scope_hash,
       capability_value.plan_snapshot_hash
     ) then
    raise exception 'github_draft_pr_tool_result_rejected'
      using errcode = 'P0001';
  end if;

  result_hash_value := encode(
    extensions.digest(
      convert_to(p_result_envelope::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into public.cognitive_tool_result_records(
    capability_id, task_id, project_id, platform, environment,
    call_id, usage_sequence, result_envelope, result_envelope_hash,
    result_source, before_state_hash, after_state_hash, diff_hash,
    final_commit, resource_type, resource_key
  ) values (
    capability_value.id, capability_value.task_id,
    capability_value.project_id, capability_value.platform,
    capability_value.environment, p_call_id,
    consumed_event.usage_sequence, p_result_envelope,
    result_hash_value, 'tool_broker', p_before_state_hash,
    p_after_state_hash, p_diff_hash, p_final_commit,
    consumed_event.resource_type, consumed_event.resource_key
  )
  returning id into tool_result_id_value;

  event_hash_value := encode(
    extensions.digest(
      convert_to(concat_ws(
        '|', authorization_value.id::text, tool_result_id_value::text,
        result_hash_value, p_before_state_hash, p_after_state_hash,
        p_diff_hash, p_final_commit
      ), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into public.cognitive_github_draft_pr_tool_events(
    authorization_id, tool_result_id, task_id, project_id,
    platform, environment, before_state_hash, after_state_hash,
    diff_hash, final_commit, event_hash, service_identity
  ) values (
    authorization_value.id, tool_result_id_value,
    authorization_value.task_id, authorization_value.project_id,
    authorization_value.platform, authorization_value.environment,
    p_before_state_hash, p_after_state_hash, p_diff_hash,
    p_final_commit, event_hash_value,
    'cognitive_github_draft_pr_broker'
  );

  return tool_result_id_value::text;
end;
$$;

revoke all on function public.cognitive_accept_github_draft_pr_tool_result(
  text,text,text,text,jsonb,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.cognitive_accept_github_draft_pr_tool_result(
  text,text,text,text,jsonb,text,text,text,text,text
) to service_role;

comment on function public.cognitive_consume_github_draft_pr_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,
  text,text,text,uuid,text,text,text,text,text
) is
  'Consumes one exact GitHub draft-PR capability only when a live, distinct Owner-approved two-party execution and write lease match.';

comment on function public.cognitive_accept_github_draft_pr_tool_result(
  text,text,text,text,jsonb,text,text,text,text,text
) is
  'Records immutable postflight evidence for an authorized draft-PR action; it grants no merge, release, deployment, or protected-branch authority.';
