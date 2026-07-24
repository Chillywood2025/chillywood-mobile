-- Forward-only zero-state Level 0/1 bootstrap handoff.
--
-- The deployed two-party approval tables are task-scoped, so they cannot
-- represent the first approval when no Level 0/1 project or task exists. This
-- migration adds a deliberately narrower pre-task approval domain. It creates
-- no project, task, constitution, switch, or schedule until an exact Owner
-- approval has been claimed and staged by the worker and independently passed
-- by the evaluator. Completion creates every switch and schedule disabled.

insert into public.autonomous_system_emergency_states(
  system_id, status, reason, updated_at, metadata
) values (
  'product_intelligence_operator',
  'active',
  'Cognitive bootstrap guard initialized; no Level 0/1 authority is enabled.',
  transaction_timestamp(),
  jsonb_build_object('policyVersion', 'collective-governance-v1')
)
on conflict (system_id) do nothing;

-- Retire the legacy direct service bootstrap. Its implementation remains as
-- immutable deployed history, but no caller may bypass the pre-task
-- Owner/worker/evaluator chain added below.
revoke all on function public.cognitive_bootstrap_level01_canary(
  text,text,text,text,text
) from public, anon, authenticated, service_role;

create table public.governance_bootstrap_approvals (
  id uuid primary key,
  owner_user_id uuid not null,
  owner_identity_hash text not null check (
    owner_identity_hash ~ '^[a-f0-9]{64}$'
  ),
  repository_full_name text not null check (
    repository_full_name = 'Chillywood2025/chillywood-mobile'
  ),
  branch_name text not null check (
    branch_name ~ '^codex/[a-z0-9][a-z0-9/_-]{2,120}$'
    and branch_name !~* '(^|/)(main|master|release)(/|$)'
  ),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  retention_policy_hash text not null check (
    retention_policy_hash ~ '^[a-f0-9]{64}$'
  ),
  constitution_hash text not null check (
    constitution_hash ~ '^[a-f0-9]{64}$'
  ),
  rollback_hash text not null check (rollback_hash ~ '^[a-f0-9]{64}$'),
  evaluator_requirement_hash text not null check (
    evaluator_requirement_hash ~ '^[a-f0-9]{64}$'
  ),
  policy_version text not null check (
    policy_version = 'collective-governance-v1'
  ),
  target_resource_hash text not null check (
    target_resource_hash ~ '^[a-f0-9]{64}$'
  ),
  approval_hash text not null unique check (approval_hash ~ '^[a-f0-9]{64}$'),
  approved_at timestamptz not null,
  valid_from timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default transaction_timestamp(),
  check (valid_from >= approved_at),
  check (
    expires_at > valid_from
    and expires_at <= valid_from + interval '24 hours'
  )
);

create table public.governance_bootstrap_approval_states (
  approval_id uuid primary key references public.governance_bootstrap_approvals(id),
  state text not null check (
    state in (
      'active','claimed','staged','evaluated','completed',
      'revoked','expired','failed'
    )
  ),
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_hash text check (
    revocation_hash is null or revocation_hash ~ '^[a-f0-9]{64}$'
  ),
  updated_at timestamptz not null default transaction_timestamp(),
  check (
    (state = 'revoked') = (
      revoked_at is not null
      and revoked_by is not null
      and revocation_hash is not null
    )
  )
);

create table public.governance_bootstrap_executions (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null unique references public.governance_bootstrap_approvals(id),
  state text not null check (
    state in ('claimed','staged','evaluated','completed','failed','quarantined')
  ),
  service_identity text not null check (
    service_identity = 'cognitive_approved_action_worker'
  ),
  service_identity_hash text not null check (
    service_identity_hash ~ '^[a-f0-9]{64}$'
  ),
  worker_assertion_hash text not null check (
    worker_assertion_hash ~ '^[a-f0-9]{64}$'
  ),
  approval_hash text not null check (approval_hash ~ '^[a-f0-9]{64}$'),
  target_resource_hash text not null check (
    target_resource_hash ~ '^[a-f0-9]{64}$'
  ),
  execution_receipt_hash text check (
    execution_receipt_hash is null
    or execution_receipt_hash ~ '^[a-f0-9]{64}$'
  ),
  evaluator_proof_hash text check (
    evaluator_proof_hash is null
    or evaluator_proof_hash ~ '^[a-f0-9]{64}$'
  ),
  claimed_at timestamptz not null default transaction_timestamp(),
  staged_at timestamptz,
  evaluated_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default transaction_timestamp(),
  check (
    state = 'claimed'
    or (
      staged_at is not null
      and execution_receipt_hash is not null
    )
  ),
  check (
    state not in ('evaluated','completed')
    or (evaluated_at is not null and evaluator_proof_hash is not null)
  ),
  check (state <> 'completed' or completed_at is not null)
);

create table public.governance_bootstrap_evaluator_proofs (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null unique
    references public.governance_bootstrap_executions(id),
  approval_id uuid not null references public.governance_bootstrap_approvals(id),
  evaluator_identity text not null check (
    evaluator_identity = 'cognitive_independent_evaluator'
  ),
  evaluator_identity_hash text not null check (
    evaluator_identity_hash ~ '^[a-f0-9]{64}$'
  ),
  execution_receipt_hash text not null check (
    execution_receipt_hash ~ '^[a-f0-9]{64}$'
  ),
  evaluator_proof_hash text not null unique check (
    evaluator_proof_hash ~ '^[a-f0-9]{64}$'
  ),
  evaluator_requirement_hash text not null check (
    evaluator_requirement_hash ~ '^[a-f0-9]{64}$'
  ),
  verdict text not null check (verdict in ('passed','failed')),
  created_at timestamptz not null default transaction_timestamp()
);

create table public.governance_bootstrap_events (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.governance_bootstrap_approvals(id),
  execution_id uuid references public.governance_bootstrap_executions(id),
  event_sequence integer not null check (event_sequence >= 1),
  event_type text not null check (
    event_type in (
      'owner_approved','claimed','staged','evaluator_passed',
      'evaluator_failed','completed','revoked'
    )
  ),
  event_hash text not null check (event_hash ~ '^[a-f0-9]{64}$'),
  actor_identity_hash text not null check (
    actor_identity_hash ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (approval_id, event_sequence),
  unique (approval_id, event_type)
);

create index governance_bootstrap_approvals_expiry_idx
  on public.governance_bootstrap_approvals(expires_at);
create index governance_bootstrap_approval_states_state_idx
  on public.governance_bootstrap_approval_states(state, updated_at);
create index governance_bootstrap_executions_state_idx
  on public.governance_bootstrap_executions(state, updated_at);

alter table public.governance_bootstrap_approvals enable row level security;
alter table public.governance_bootstrap_approvals force row level security;
alter table public.governance_bootstrap_approval_states enable row level security;
alter table public.governance_bootstrap_approval_states force row level security;
alter table public.governance_bootstrap_executions enable row level security;
alter table public.governance_bootstrap_executions force row level security;
alter table public.governance_bootstrap_evaluator_proofs enable row level security;
alter table public.governance_bootstrap_evaluator_proofs force row level security;
alter table public.governance_bootstrap_events enable row level security;
alter table public.governance_bootstrap_events force row level security;

revoke all on table public.governance_bootstrap_approvals
  from public, anon, authenticated, service_role;
revoke all on table public.governance_bootstrap_approval_states
  from public, anon, authenticated, service_role;
revoke all on table public.governance_bootstrap_executions
  from public, anon, authenticated, service_role;
revoke all on table public.governance_bootstrap_evaluator_proofs
  from public, anon, authenticated, service_role;
revoke all on table public.governance_bootstrap_events
  from public, anon, authenticated, service_role;

create function public.governance_reject_bootstrap_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'immutable_governance_bootstrap_evidence'
    using errcode = '42501';
end;
$$;
revoke all on function public.governance_reject_bootstrap_evidence_mutation()
  from public, anon, authenticated, service_role;

create trigger governance_bootstrap_approvals_immutable
before update or delete on public.governance_bootstrap_approvals
for each row execute function public.governance_reject_bootstrap_evidence_mutation();
create trigger governance_bootstrap_evaluator_proofs_immutable
before update or delete on public.governance_bootstrap_evaluator_proofs
for each row execute function public.governance_reject_bootstrap_evidence_mutation();
create trigger governance_bootstrap_events_immutable
before update or delete on public.governance_bootstrap_events
for each row execute function public.governance_reject_bootstrap_evidence_mutation();

create function public.governance_bootstrap_target_hash(
  p_repository_full_name text,
  p_branch_name text,
  p_source_commit text,
  p_retention_policy_hash text,
  p_constitution_hash text,
  p_rollback_hash text,
  p_evaluator_requirement_hash text,
  p_policy_version text
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(concat_ws(
    '|',
    'bootstrap_control_plane',
    p_repository_full_name,
    p_branch_name,
    p_source_commit,
    p_retention_policy_hash,
    p_constitution_hash,
    p_rollback_hash,
    p_evaluator_requirement_hash,
    p_policy_version
  ), 'UTF8'), 'sha256'), 'hex');
$$;
revoke all on function public.governance_bootstrap_target_hash(
  text,text,text,text,text,text,text,text
) from public, anon, authenticated, service_role;

create function public.governance_bootstrap_event_next_sequence(p_approval_id uuid)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce(max(event.event_sequence), 0) + 1
  from public.governance_bootstrap_events event
  where event.approval_id = p_approval_id;
$$;
revoke all on function public.governance_bootstrap_event_next_sequence(uuid)
  from public, anon, authenticated, service_role;

create function public.governance_record_bootstrap_approval(
  p_repository_full_name text,
  p_branch_name text,
  p_source_commit text,
  p_retention_policy_hash text,
  p_constitution_hash text,
  p_rollback_hash text,
  p_evaluator_requirement_hash text,
  p_policy_version text,
  p_validity_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  approval_id_value uuid := gen_random_uuid();
  owner_hash_value text;
  target_hash_value text;
  approval_hash_value text;
  now_at timestamptz := transaction_timestamp();
  expires_at_value timestamptz;
begin
  if p_repository_full_name <> 'Chillywood2025/chillywood-mobile'
     or p_branch_name !~ '^codex/[a-z0-9][a-z0-9/_-]{2,120}$'
     or p_branch_name ~* '(^|/)(main|master|release)(/|$)'
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_retention_policy_hash !~ '^[a-f0-9]{64}$'
     or p_constitution_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash !~ '^[a-f0-9]{64}$'
     or p_evaluator_requirement_hash !~ '^[a-f0-9]{64}$'
     or p_policy_version <> 'collective-governance-v1'
     or p_validity_seconds not between 60 and 86400
     or exists (
       select 1
       from public.intelligence_tasks task
       where task.task_key = 'cognitive-level01-canary-control'
         and task.platform = 'shared'
         and task.environment = 'production'
     ) then
    raise exception 'governance_bootstrap_owner_approval_rejected'
      using errcode = 'P0001';
  end if;

  expires_at_value := now_at + make_interval(secs => p_validity_seconds);
  owner_hash_value := encode(extensions.digest(
    convert_to(owner_id::text, 'UTF8'), 'sha256'
  ), 'hex');
  target_hash_value := public.governance_bootstrap_target_hash(
    p_repository_full_name, p_branch_name, p_source_commit,
    p_retention_policy_hash, p_constitution_hash, p_rollback_hash,
    p_evaluator_requirement_hash, p_policy_version
  );
  approval_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', 'bootstrap_owner_approval', approval_id_value::text,
    target_hash_value, owner_id::text, now_at::text, expires_at_value::text
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.governance_bootstrap_approvals(
    id, owner_user_id, owner_identity_hash, repository_full_name, branch_name,
    source_commit, retention_policy_hash, constitution_hash, rollback_hash,
    evaluator_requirement_hash, policy_version, target_resource_hash,
    approval_hash, approved_at, valid_from, expires_at
  ) values (
    approval_id_value, owner_id, owner_hash_value, p_repository_full_name,
    p_branch_name, p_source_commit, p_retention_policy_hash,
    p_constitution_hash, p_rollback_hash, p_evaluator_requirement_hash,
    p_policy_version, target_hash_value, approval_hash_value,
    now_at, now_at, expires_at_value
  );
  insert into public.governance_bootstrap_approval_states(approval_id, state)
  values (approval_id_value, 'active');
  insert into public.governance_bootstrap_events(
    approval_id, event_sequence, event_type, event_hash, actor_identity_hash
  ) values (
    approval_id_value, 1, 'owner_approved', approval_hash_value, owner_hash_value
  );

  return jsonb_build_object(
    'approvalId', approval_id_value,
    'approvalHash', approval_hash_value,
    'targetResourceHash', target_hash_value,
    'state', 'active',
    'approvedAt', now_at,
    'expiresAt', expires_at_value
  );
end;
$$;
revoke all on function public.governance_record_bootstrap_approval(
  text,text,text,text,text,text,text,text,integer
) from public, anon, service_role;
grant execute on function public.governance_record_bootstrap_approval(
  text,text,text,text,text,text,text,text,integer
) to authenticated;

create function public.governance_claim_bootstrap_control_plane(
  p_approval_id uuid,
  p_approval_hash text,
  p_target_resource_hash text,
  p_repository_full_name text,
  p_branch_name text,
  p_source_commit text,
  p_retention_policy_hash text,
  p_constitution_hash text,
  p_rollback_hash text,
  p_evaluator_requirement_hash text,
  p_policy_version text,
  p_service_identity text,
  p_worker_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_identity_value text;
  emergency_status text;
  approval_value public.governance_bootstrap_approvals%rowtype;
  state_value public.governance_bootstrap_approval_states%rowtype;
  execution_id_value uuid;
  now_at timestamptz := transaction_timestamp();
  event_sequence_value integer;
begin
  service_identity_value := public.governance_assert_two_party_service_principal(
    p_service_identity, p_worker_assertion, 'bootstrap_control_plane'
  );
  if service_identity_value <> 'cognitive_approved_action_worker' then
    raise exception 'governance_bootstrap_claim_rejected' using errcode = '42501';
  end if;

  select emergency.status into emergency_status
  from public.autonomous_system_emergency_states emergency
  where emergency.system_id = 'product_intelligence_operator'
  for share;
  select * into state_value
  from public.governance_bootstrap_approval_states state
  where state.approval_id = p_approval_id
  for update;
  select * into approval_value
  from public.governance_bootstrap_approvals approval
  where approval.id = p_approval_id
  for share;

  if emergency_status is distinct from 'active'
     or approval_value.id is null
     or state_value.approval_id is null
     or state_value.state <> 'active'
     or now_at < approval_value.valid_from
     or now_at >= approval_value.expires_at
     or approval_value.approval_hash <> p_approval_hash
     or approval_value.target_resource_hash <> p_target_resource_hash
     or approval_value.repository_full_name <> p_repository_full_name
     or approval_value.branch_name <> p_branch_name
     or approval_value.source_commit <> p_source_commit
     or approval_value.retention_policy_hash <> p_retention_policy_hash
     or approval_value.constitution_hash <> p_constitution_hash
     or approval_value.rollback_hash <> p_rollback_hash
     or approval_value.evaluator_requirement_hash <> p_evaluator_requirement_hash
     or approval_value.policy_version <> p_policy_version
     or approval_value.target_resource_hash <>
       public.governance_bootstrap_target_hash(
         p_repository_full_name, p_branch_name, p_source_commit,
         p_retention_policy_hash, p_constitution_hash, p_rollback_hash,
         p_evaluator_requirement_hash, p_policy_version
       )
     or exists (
       select 1 from public.intelligence_tasks task
       where task.task_key = 'cognitive-level01-canary-control'
         and task.platform = 'shared'
         and task.environment = 'production'
     ) then
    raise exception 'governance_bootstrap_claim_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.governance_bootstrap_executions(
    approval_id, state, service_identity, service_identity_hash,
    worker_assertion_hash, approval_hash, target_resource_hash,
    claimed_at, updated_at
  ) values (
    approval_value.id, 'claimed', service_identity_value,
    encode(extensions.digest(
      convert_to(service_identity_value, 'UTF8'), 'sha256'
    ), 'hex'),
    encode(extensions.digest(
      convert_to(p_worker_assertion, 'UTF8'), 'sha256'
    ), 'hex'),
    approval_value.approval_hash, approval_value.target_resource_hash,
    now_at, now_at
  ) returning id into execution_id_value;

  update public.governance_bootstrap_approval_states
  set state = 'claimed', updated_at = now_at
  where approval_id = approval_value.id;
  select public.governance_bootstrap_event_next_sequence(approval_value.id)
    into event_sequence_value;
  insert into public.governance_bootstrap_events(
    approval_id, execution_id, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    approval_value.id, execution_id_value, event_sequence_value, 'claimed',
    approval_value.approval_hash,
    encode(extensions.digest(
      convert_to(service_identity_value, 'UTF8'), 'sha256'
    ), 'hex')
  );

  return jsonb_build_object(
    'executionId', execution_id_value,
    'approvalId', approval_value.id,
    'state', 'claimed',
    'claimedAt', now_at
  );
end;
$$;
revoke all on function public.governance_claim_bootstrap_control_plane(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.governance_claim_bootstrap_control_plane(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text
) to service_role;

create function public.governance_stage_bootstrap_control_plane(
  p_execution_id uuid,
  p_approval_hash text,
  p_target_resource_hash text,
  p_service_identity text,
  p_worker_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval_id_value uuid;
  service_identity_value text;
  emergency_status text;
  approval_value public.governance_bootstrap_approvals%rowtype;
  state_value public.governance_bootstrap_approval_states%rowtype;
  execution_value public.governance_bootstrap_executions%rowtype;
  receipt_hash_value text;
  now_at timestamptz := transaction_timestamp();
  event_sequence_value integer;
begin
  select execution.approval_id into approval_id_value
  from public.governance_bootstrap_executions execution
  where execution.id = p_execution_id;
  service_identity_value := public.governance_assert_two_party_service_principal(
    p_service_identity, p_worker_assertion, 'bootstrap_control_plane'
  );
  if service_identity_value <> 'cognitive_approved_action_worker'
     or approval_id_value is null then
    raise exception 'governance_bootstrap_stage_rejected' using errcode = '42501';
  end if;

  select emergency.status into emergency_status
  from public.autonomous_system_emergency_states emergency
  where emergency.system_id = 'product_intelligence_operator'
  for share;
  select * into state_value
  from public.governance_bootstrap_approval_states state
  where state.approval_id = approval_id_value
  for update;
  select * into approval_value
  from public.governance_bootstrap_approvals approval
  where approval.id = approval_id_value
  for share;
  select * into execution_value
  from public.governance_bootstrap_executions execution
  where execution.id = p_execution_id
  for update;

  if emergency_status is distinct from 'active'
     or state_value.state <> 'claimed'
     or execution_value.state <> 'claimed'
     or execution_value.service_identity <> service_identity_value
     or execution_value.worker_assertion_hash <> encode(extensions.digest(
       convert_to(p_worker_assertion, 'UTF8'), 'sha256'
     ), 'hex')
     or approval_value.approval_hash <> p_approval_hash
     or approval_value.target_resource_hash <> p_target_resource_hash
     or execution_value.approval_hash <> p_approval_hash
     or execution_value.target_resource_hash <> p_target_resource_hash
     or now_at < approval_value.valid_from
     or now_at >= approval_value.expires_at then
    raise exception 'governance_bootstrap_stage_rejected'
      using errcode = 'P0001';
  end if;

  receipt_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', 'bootstrap_staged', execution_value.id::text,
    approval_value.approval_hash, approval_value.target_resource_hash,
    execution_value.worker_assertion_hash, now_at::text
  ), 'UTF8'), 'sha256'), 'hex');
  update public.governance_bootstrap_executions
  set state = 'staged',
      execution_receipt_hash = receipt_hash_value,
      staged_at = now_at,
      updated_at = now_at
  where id = execution_value.id;
  update public.governance_bootstrap_approval_states
  set state = 'staged', updated_at = now_at
  where approval_id = approval_value.id;
  select public.governance_bootstrap_event_next_sequence(approval_value.id)
    into event_sequence_value;
  insert into public.governance_bootstrap_events(
    approval_id, execution_id, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    approval_value.id, execution_value.id, event_sequence_value, 'staged',
    receipt_hash_value, execution_value.service_identity_hash
  );

  return jsonb_build_object(
    'executionId', execution_value.id,
    'state', 'staged',
    'executionReceiptHash', receipt_hash_value,
    'stagedAt', now_at
  );
end;
$$;
revoke all on function public.governance_stage_bootstrap_control_plane(
  uuid,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.governance_stage_bootstrap_control_plane(
  uuid,text,text,text,text
) to service_role;

create function public.governance_record_bootstrap_evaluator_proof(
  p_execution_id uuid,
  p_execution_receipt_hash text,
  p_evaluator_proof_hash text,
  p_verdict text,
  p_evaluator_identity text,
  p_evaluator_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval_id_value uuid;
  evaluator_identity_value text;
  emergency_status text;
  approval_value public.governance_bootstrap_approvals%rowtype;
  state_value public.governance_bootstrap_approval_states%rowtype;
  execution_value public.governance_bootstrap_executions%rowtype;
  proof_id_value uuid;
  now_at timestamptz := transaction_timestamp();
  event_sequence_value integer;
begin
  select execution.approval_id into approval_id_value
  from public.governance_bootstrap_executions execution
  where execution.id = p_execution_id;
  evaluator_identity_value := public.governance_assert_two_party_service_principal(
    p_evaluator_identity, p_evaluator_assertion, 'independent_evaluation'
  );
  if evaluator_identity_value <> 'cognitive_independent_evaluator'
     or approval_id_value is null then
    raise exception 'governance_bootstrap_evaluator_proof_rejected'
      using errcode = '42501';
  end if;

  select emergency.status into emergency_status
  from public.autonomous_system_emergency_states emergency
  where emergency.system_id = 'product_intelligence_operator'
  for share;
  select * into state_value
  from public.governance_bootstrap_approval_states state
  where state.approval_id = approval_id_value
  for update;
  select * into approval_value
  from public.governance_bootstrap_approvals approval
  where approval.id = approval_id_value
  for share;
  select * into execution_value
  from public.governance_bootstrap_executions execution
  where execution.id = p_execution_id
  for update;

  if emergency_status is distinct from 'active'
     or state_value.state <> 'staged'
     or execution_value.state <> 'staged'
     or evaluator_identity_value = execution_value.service_identity
     or encode(extensions.digest(
       convert_to(p_evaluator_assertion, 'UTF8'), 'sha256'
     ), 'hex') = execution_value.worker_assertion_hash
     or p_execution_receipt_hash !~ '^[a-f0-9]{64}$'
     or p_evaluator_proof_hash !~ '^[a-f0-9]{64}$'
     or p_execution_receipt_hash <> execution_value.execution_receipt_hash
     or p_verdict not in ('passed','failed')
     or now_at < approval_value.valid_from
     or now_at >= approval_value.expires_at then
    raise exception 'governance_bootstrap_evaluator_proof_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.governance_bootstrap_evaluator_proofs(
    execution_id, approval_id, evaluator_identity, evaluator_identity_hash,
    execution_receipt_hash, evaluator_proof_hash,
    evaluator_requirement_hash, verdict, created_at
  ) values (
    execution_value.id, approval_value.id, evaluator_identity_value,
    encode(extensions.digest(
      convert_to(evaluator_identity_value, 'UTF8'), 'sha256'
    ), 'hex'),
    p_execution_receipt_hash, p_evaluator_proof_hash,
    approval_value.evaluator_requirement_hash, p_verdict, now_at
  ) returning id into proof_id_value;

  update public.governance_bootstrap_executions
  set state = case when p_verdict = 'passed' then 'evaluated' else 'failed' end,
      evaluator_proof_hash = p_evaluator_proof_hash,
      evaluated_at = now_at,
      updated_at = now_at
  where id = execution_value.id;
  update public.governance_bootstrap_approval_states
  set state = case when p_verdict = 'passed' then 'evaluated' else 'failed' end,
      updated_at = now_at
  where approval_id = approval_value.id;
  select public.governance_bootstrap_event_next_sequence(approval_value.id)
    into event_sequence_value;
  insert into public.governance_bootstrap_events(
    approval_id, execution_id, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    approval_value.id, execution_value.id, event_sequence_value,
    case when p_verdict = 'passed'
      then 'evaluator_passed'
      else 'evaluator_failed'
    end,
    p_evaluator_proof_hash,
    encode(extensions.digest(
      convert_to(evaluator_identity_value, 'UTF8'), 'sha256'
    ), 'hex')
  );

  return jsonb_build_object(
    'evaluatorProofId', proof_id_value,
    'executionId', execution_value.id,
    'verdict', p_verdict,
    'recordedAt', now_at
  );
end;
$$;
revoke all on function public.governance_record_bootstrap_evaluator_proof(
  uuid,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.governance_record_bootstrap_evaluator_proof(
  uuid,text,text,text,text,text
) to service_role;

create function public.governance_complete_bootstrap_control_plane(
  p_execution_id uuid,
  p_execution_receipt_hash text,
  p_evaluator_proof_hash text,
  p_service_identity text,
  p_worker_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval_id_value uuid;
  service_identity_value text;
  emergency_status text;
  approval_value public.governance_bootstrap_approvals%rowtype;
  state_value public.governance_bootstrap_approval_states%rowtype;
  execution_value public.governance_bootstrap_executions%rowtype;
  proof_value public.governance_bootstrap_evaluator_proofs%rowtype;
  project_id_value uuid;
  task_id_value uuid;
  constitution_id_value uuid;
  constitution_version_id_value uuid;
  switch_key_value text;
  schedule_value record;
  role_key_value text;
  veto_scope_values text[];
  now_at timestamptz := transaction_timestamp();
  event_sequence_value integer;
begin
  select execution.approval_id into approval_id_value
  from public.governance_bootstrap_executions execution
  where execution.id = p_execution_id;
  service_identity_value := public.governance_assert_two_party_service_principal(
    p_service_identity, p_worker_assertion, 'bootstrap_control_plane'
  );
  if service_identity_value <> 'cognitive_approved_action_worker'
     or approval_id_value is null then
    raise exception 'governance_bootstrap_completion_rejected'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('cognitive-level01-canary-control-bootstrap', 0)
  );
  select emergency.status into emergency_status
  from public.autonomous_system_emergency_states emergency
  where emergency.system_id = 'product_intelligence_operator'
  for share;
  select * into state_value
  from public.governance_bootstrap_approval_states state
  where state.approval_id = approval_id_value
  for update;
  select * into approval_value
  from public.governance_bootstrap_approvals approval
  where approval.id = approval_id_value
  for share;
  select * into execution_value
  from public.governance_bootstrap_executions execution
  where execution.id = p_execution_id
  for update;
  select * into proof_value
  from public.governance_bootstrap_evaluator_proofs proof
  where proof.execution_id = p_execution_id
  for share;

  if emergency_status is distinct from 'active'
     or state_value.state <> 'evaluated'
     or execution_value.state <> 'evaluated'
     or execution_value.service_identity <> service_identity_value
     or execution_value.worker_assertion_hash <> encode(extensions.digest(
       convert_to(p_worker_assertion, 'UTF8'), 'sha256'
     ), 'hex')
     or p_execution_receipt_hash !~ '^[a-f0-9]{64}$'
     or p_evaluator_proof_hash !~ '^[a-f0-9]{64}$'
     or execution_value.execution_receipt_hash <> p_execution_receipt_hash
     or execution_value.evaluator_proof_hash <> p_evaluator_proof_hash
     or proof_value.id is null
     or proof_value.approval_id <> approval_value.id
     or proof_value.execution_receipt_hash <> p_execution_receipt_hash
     or proof_value.evaluator_proof_hash <> p_evaluator_proof_hash
     or proof_value.evaluator_requirement_hash <>
       approval_value.evaluator_requirement_hash
     or proof_value.evaluator_identity <> 'cognitive_independent_evaluator'
     or proof_value.evaluator_identity_hash = execution_value.service_identity_hash
     or proof_value.verdict <> 'passed'
     or now_at < approval_value.valid_from
     or now_at >= approval_value.expires_at
     or exists (
       select 1 from public.intelligence_tasks task
       where task.task_key = 'cognitive-level01-canary-control'
         and task.platform = 'shared'
         and task.environment = 'production'
     ) then
    raise exception 'governance_bootstrap_completion_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.cognitive_projects(
    repository_full_name, source_state, activation_state,
    scheduler_state, production_authority
  ) values (
    approval_value.repository_full_name,
    'collective_governance_source_complete_not_deployed',
    'off', 'none', false
  ) returning id into project_id_value;

  insert into public.intelligence_tasks(
    project_id, platform, environment, repository_full_name, branch_name,
    task_key, objective_hash, status, actor_identity, deadman_at,
    retention_until, data_class
  ) values (
    project_id_value, 'shared', 'production',
    approval_value.repository_full_name, approval_value.branch_name,
    'cognitive-level01-canary-control',
    encode(extensions.digest(convert_to(
      'bounded-level01-public-research-memory-deliberation-draft-pr',
      'UTF8'
    ), 'sha256'), 'hex'),
    'received', 'cognitive-approved-action-worker',
    now_at + interval '30 days', now_at + interval '90 days',
    'operational_metadata'
  ) returning id into task_id_value;

  insert into public.cognitive_retention_policy_states(
    task_id, project_id, platform, environment, policy_hash, policy_state,
    user_derived_memory_allowed, raw_user_reports_allowed,
    raw_private_messages_allowed, raw_private_media_allowed,
    raw_user_analytics_allowed, private_model_input_allowed
  ) values (
    task_id_value, project_id_value, 'shared', 'production',
    approval_value.retention_policy_hash,
    'owner_counsel_decision_required',
    false, false, false, false, false, false
  );

  foreach switch_key_value in array array[
    'cognitive_research_enabled',
    'cognitive_memory_enabled',
    'cognitive_collective_deliberation_enabled',
    'cognitive_draft_pr_executor_enabled',
    'cognitive_scheduled_level01_enabled',
    'cognitive_level2_production_repairs_enabled',
    'cognitive_user_derived_memory_enabled',
    'cognitive_livekit_experience_sentinel_enabled',
    'cognitive_visual_experience_sentinel_enabled',
    'cognitive_installed_journey_sentinel_enabled'
  ] loop
    insert into public.cognitive_governance_switches(
      task_id, project_id, platform, environment, switch_key,
      enabled, policy_version
    ) values (
      task_id_value, project_id_value, 'shared', 'production',
      switch_key_value, false, approval_value.policy_version
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
      schedule_value.timeout_seconds, approval_value.policy_version
    );
  end loop;

  insert into public.governance_constitutions(
    task_id, project_id, platform, environment, constitution_key, title,
    current_version, status, self_amendment_allowed, created_by_identity
  ) values (
    task_id_value, project_id_value, 'shared', 'production',
    approval_value.policy_version,
    'Chi''llywood Collective Governance Constitution',
    1, 'source_only', false, service_identity_value
  ) returning id into constitution_id_value;

  insert into public.governance_constitution_versions(
    constitution_id, task_id, project_id, platform, environment,
    version_number, constitution_hash, policy_snapshot, status,
    proposed_by_identity, rollback_hash
  ) values (
    constitution_id_value, task_id_value, project_id_value,
    'shared', 'production', 1, approval_value.constitution_hash,
    jsonb_build_object(
      'activation', 'off',
      'level2', false,
      'selfApproval', false,
      'userDerivedMemory', false,
      'sourceCommit', approval_value.source_commit,
      'twoPartyBootstrap', true,
      'allSwitchesOff', true
    ),
    'draft', service_identity_value, approval_value.rollback_hash
  ) returning id into constitution_version_id_value;

  foreach role_key_value in array array[
    'product_user_experience',
    'architecture_engineering',
    'security_privacy',
    'reliability_release',
    'safety_trust',
    'accessibility_inclusion',
    'money_commercial_policy',
    'research_futures',
    'adversarial_red_team'
  ] loop
    veto_scope_values := case role_key_value
      when 'security_privacy'
        then array['security','privacy','auth_rls','retention']
      when 'reliability_release' then array['public_release']
      when 'money_commercial_policy' then array['money']
      when 'safety_trust' then array['user_rights','legal']
      else '{}'::text[]
    end;
    insert into public.governance_council_roles(
      constitution_version_id, task_id, project_id, platform, environment,
      role_key, allowed_evidence_types, required_question_hashes,
      veto_scopes, timeout_seconds
    ) values (
      constitution_version_id_value, task_id_value, project_id_value,
      'shared', 'production', role_key_value,
      array['source','test','provider_readback','architecture_graph'],
      array[encode(extensions.digest(
        convert_to(role_key_value || ':required-question', 'UTF8'),
        'sha256'
      ), 'hex')],
      veto_scope_values, 600
    );
  end loop;

  insert into public.governance_audit_events(
    task_id, project_id, platform, environment, entity_type, entity_id,
    event_type, actor_identity_hash, evidence_hash
  ) values (
    task_id_value, project_id_value, 'shared', 'production',
    'constitution', constitution_id_value, 'bootstrapped_two_party',
    execution_value.service_identity_hash, p_evaluator_proof_hash
  );

  update public.governance_bootstrap_executions
  set state = 'completed',
      completed_at = now_at,
      updated_at = now_at
  where id = execution_value.id;
  update public.governance_bootstrap_approval_states
  set state = 'completed', updated_at = now_at
  where approval_id = approval_value.id;
  select public.governance_bootstrap_event_next_sequence(approval_value.id)
    into event_sequence_value;
  insert into public.governance_bootstrap_events(
    approval_id, execution_id, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    approval_value.id, execution_value.id, event_sequence_value, 'completed',
    p_execution_receipt_hash, execution_value.service_identity_hash
  );

  return jsonb_build_object(
    'executionId', execution_value.id,
    'state', 'completed',
    'projectId', project_id_value,
    'taskId', task_id_value,
    'constitutionVersionId', constitution_version_id_value,
    'executionReceiptHash', p_execution_receipt_hash,
    'completedAt', now_at
  );
end;
$$;
revoke all on function public.governance_complete_bootstrap_control_plane(
  uuid,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.governance_complete_bootstrap_control_plane(
  uuid,text,text,text,text
) to service_role;

create function public.governance_revoke_bootstrap_approval(
  p_approval_id uuid,
  p_reason_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  approval_value public.governance_bootstrap_approvals%rowtype;
  state_value public.governance_bootstrap_approval_states%rowtype;
  now_at timestamptz := transaction_timestamp();
  owner_hash_value text;
  event_sequence_value integer;
begin
  select * into state_value
  from public.governance_bootstrap_approval_states state
  where state.approval_id = p_approval_id
  for update;
  select * into approval_value
  from public.governance_bootstrap_approvals approval
  where approval.id = p_approval_id
  for share;
  if approval_value.id is null
     or state_value.approval_id is null
     or state_value.state not in ('active','claimed','staged','evaluated')
     or p_reason_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'governance_bootstrap_revocation_rejected'
      using errcode = 'P0001';
  end if;

  update public.governance_bootstrap_approval_states
  set state = 'revoked',
      revoked_at = now_at,
      revoked_by = owner_id,
      revocation_hash = p_reason_hash,
      updated_at = now_at
  where approval_id = approval_value.id;
  owner_hash_value := encode(extensions.digest(
    convert_to(owner_id::text, 'UTF8'), 'sha256'
  ), 'hex');
  select public.governance_bootstrap_event_next_sequence(approval_value.id)
    into event_sequence_value;
  insert into public.governance_bootstrap_events(
    approval_id, execution_id, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    approval_value.id,
    (
      select execution.id
      from public.governance_bootstrap_executions execution
      where execution.approval_id = approval_value.id
    ),
    event_sequence_value, 'revoked', p_reason_hash, owner_hash_value
  );

  return jsonb_build_object(
    'approvalId', approval_value.id,
    'state', 'revoked',
    'revocationHash', p_reason_hash,
    'revokedAt', now_at
  );
end;
$$;
revoke all on function public.governance_revoke_bootstrap_approval(uuid,text)
  from public, anon, service_role;
grant execute on function public.governance_revoke_bootstrap_approval(uuid,text)
  to authenticated;

create function public.governance_set_cognitive_emergency_state(
  p_status text,
  p_reason_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  now_at timestamptz := transaction_timestamp();
begin
  if p_status not in ('active','emergency_stop')
     or p_reason_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'governance_cognitive_emergency_state_rejected'
      using errcode = 'P0001';
  end if;

  update public.autonomous_system_emergency_states
  set status = p_status,
      reason = case
        when p_status = 'active'
          then 'Cognitive execution resumed by exact Owner.'
        else 'Cognitive execution stopped by exact Owner.'
      end,
      updated_by = owner_id,
      updated_at = now_at,
      metadata = jsonb_build_object(
        'policyVersion', 'collective-governance-v1',
        'reasonHash', p_reason_hash
      )
  where system_id = 'product_intelligence_operator';
  if not found then
    raise exception 'governance_cognitive_emergency_state_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.autonomous_system_control_events(
    system_id, event_type, actor_id, actor_role, event_summary, metadata
  ) values (
    'product_intelligence_operator',
    case when p_status = 'active' then 'emergency_resumed'
      else 'emergency_paused'
    end,
    owner_id, 'owner',
    case when p_status = 'active'
      then 'Cognitive execution resumed by exact Owner.'
      else 'Cognitive execution stopped by exact Owner.'
    end,
    jsonb_build_object('reasonHash', p_reason_hash)
  );

  return jsonb_build_object(
    'systemId', 'product_intelligence_operator',
    'status', p_status,
    'reasonHash', p_reason_hash,
    'updatedAt', now_at
  );
end;
$$;
revoke all on function public.governance_set_cognitive_emergency_state(text,text)
  from public, anon, service_role;
grant execute on function public.governance_set_cognitive_emergency_state(text,text)
  to authenticated;

comment on table public.governance_bootstrap_approvals is
  'Immutable exact-Owner approvals for the zero-state all-off Level 0/1 bootstrap.';
comment on table public.governance_bootstrap_executions is
  'Worker-only zero-state bootstrap staging; no live control-plane rows exist before completed.';
comment on table public.governance_bootstrap_evaluator_proofs is
  'Immutable independent evaluator proof bound to the database-derived bootstrap receipt.';
