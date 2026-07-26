-- Exact-head authority closeout for the undeployed Cognitive Collective
-- Intelligence control plane.  This migration is additive, changes only
-- cognitive/governance objects, and leaves every rollout switch disabled.

-- A vote or assessment must be made by the assignment for the exact council
-- role and participant.  Independent foreign keys to an assignment and role
-- are insufficient because they can be mixed across valid rows.
alter table public.governance_council_assignments
  add constraint governance_assignment_role_unique
  unique (
    id,council_role_id,
    task_id,project_id,platform,environment
  ),
  add constraint governance_assignment_role_identity_unique
  unique (
    id,council_role_id,participant_identity_hash,
    task_id,project_id,platform,environment
  );

alter table public.governance_assessments
  add constraint governance_assessment_assignment_role_fk
  foreign key (
    assignment_id,council_role_id,task_id,project_id,platform,environment
  ) references public.governance_council_assignments(
    id,council_role_id,task_id,project_id,platform,environment
  );

alter table public.governance_votes
  add constraint governance_vote_assignment_role_participant_fk
  foreign key (
    assignment_id,council_role_id,participant_identity_hash,
    task_id,project_id,platform,environment
  ) references public.governance_council_assignments(
    id,council_role_id,participant_identity_hash,
    task_id,project_id,platform,environment
  );

create function public.governance_enforce_role_authority()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare role_value public.governance_council_roles%rowtype;
begin
  select * into role_value
  from public.governance_council_roles role
  where role.id=new.council_role_id
    and role.task_id=new.task_id
    and role.project_id=new.project_id
    and role.platform=new.platform
    and role.environment=new.environment;
  if role_value.id is null
     or not exists (
       select 1 from public.governance_council_assignments assignment
       where assignment.deliberation_id=new.deliberation_id
         and assignment.council_role_id=new.council_role_id
         and assignment.task_id=new.task_id
         and assignment.project_id=new.project_id
         and assignment.platform=new.platform
         and assignment.environment=new.environment
         and assignment.conflict_state='clear'
     )
     or (
       tg_table_name='governance_vetoes'
       and not (to_jsonb(new)->>'veto_scope')=any(role_value.veto_scopes)
     ) then
    raise exception 'governance_role_authority_rejected' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.governance_enforce_role_authority()
  from public,anon,authenticated,service_role;

create trigger governance_veto_role_authority
before insert or update on public.governance_vetoes
for each row execute function public.governance_enforce_role_authority();

create trigger governance_dissent_role_authority
before insert or update on public.governance_dissent_reports
for each row execute function public.governance_enforce_role_authority();

-- Capability consumption binds the exact resource lease and reservation to
-- the call.  Later postflight may not substitute another same-task lease.
alter table public.cognitive_capability_events
  add column resource_lease_id uuid,
  add column resource_type text,
  add column resource_key text,
  add column reserved_bytes bigint,
  add column reserved_cost numeric(12,4),
  add constraint cognitive_capability_consumed_resource_check check (
    event_type<>'consumed'
    or (
      resource_lease_id is not null
      and resource_type in (
        'repository','branch','path','migration_namespace','edge_function',
        'database_object','provider','release_channel','platform','feature_flag'
      )
      and length(resource_key) between 3 and 512
      and reserved_bytes between 0 and 10000000
      and reserved_cost between 0 and 25
    )
  ),
  add foreign key (resource_lease_id)
    references public.cognitive_resource_leases(id);

alter table public.cognitive_tool_result_records
  add column before_state_hash text
    check (before_state_hash ~ '^[a-f0-9]{64}$'),
  add column after_state_hash text
    check (after_state_hash ~ '^[a-f0-9]{64}$'),
  add column diff_hash text
    check (diff_hash is null or diff_hash ~ '^[a-f0-9]{64}$'),
  add column final_commit text
    check (final_commit is null or final_commit ~ '^[a-f0-9]{40}$'),
  add column resource_type text,
  add column resource_key text,
  add constraint cognitive_tool_result_trusted_state_required check (
    before_state_hash is not null
    and after_state_hash is not null
    and resource_type is not null
    and resource_key is not null
  );

create table public.cognitive_capability_usage_settlements (
  id uuid primary key default gen_random_uuid(),
  capability_event_id uuid not null unique,
  receipt_id uuid not null unique,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  reserved_bytes bigint not null check (reserved_bytes between 0 and 10000000),
  actual_bytes bigint not null check (
    actual_bytes between 0 and reserved_bytes
  ),
  released_bytes bigint not null check (
    released_bytes=reserved_bytes-actual_bytes
  ),
  reserved_cost numeric(12,4) not null check (reserved_cost between 0 and 25),
  actual_cost numeric(12,4) not null check (
    actual_cost between 0 and reserved_cost
  ),
  released_cost numeric(12,4) not null check (
    released_cost=reserved_cost-actual_cost
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (id,task_id,project_id,platform,environment),
  foreign key (capability_event_id)
    references public.cognitive_capability_events(id),
  foreign key (receipt_id,task_id,project_id,platform,environment)
    references public.cognitive_execution_receipts(
      id,task_id,project_id,platform,environment
    )
);
alter table public.cognitive_capability_usage_settlements
  enable row level security;
alter table public.cognitive_capability_usage_settlements
  force row level security;
revoke all on table public.cognitive_capability_usage_settlements
  from public,anon,authenticated,service_role;
grant select on table public.cognitive_capability_usage_settlements
  to authenticated,service_role;
create policy cognitive_capability_usage_settlements_exact_read
  on public.cognitive_capability_usage_settlements
  for select to authenticated
  using ((select public.cognitive_can_read_scope(project_id,task_id,platform)));
create trigger cognitive_capability_usage_settlements_immutable
before update or delete on public.cognitive_capability_usage_settlements
for each row execute function public.reject_cognitive_evidence_mutation();

revoke all on function public.cognitive_consume_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,bigint,numeric,text,text,text
) from public,anon,authenticated,service_role;

create function public.cognitive_consume_capability(
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
  p_request_hash text
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  capability_value public.cognitive_capabilities%rowtype;
  lease_value public.cognitive_resource_leases%rowtype;
  sequence_value integer;
  task_value public.intelligence_tasks%rowtype;
  approval_status text;
  approval_expires timestamptz;
  approval_platform text;
  approval_scope_hash text;
  emergency_status text;
  required_resource_type text;
  required_resource_key text;
  now_at timestamptz := transaction_timestamp();
begin
  perform public.cognitive_assert_service_actor(array['cognitive_control_plane'],null);
  select * into capability_value from public.cognitive_capabilities
  where capability_id=p_capability_id for update;
  if capability_value.id is null then
    raise exception 'capability_missing' using errcode='P0001';
  end if;
  select * into task_value from public.intelligence_tasks
  where id=p_task_id and project_id=p_project_id
    and platform=p_platform and environment=p_environment;
  select status,expires_at,platform,metadata->>'approval_scope_hash'
    into approval_status,approval_expires,approval_platform,approval_scope_hash
  from public.autonomous_approval_requests
  where id=capability_value.approval_request_id;
  select status into emergency_status
  from public.autonomous_system_emergency_states
  where system_id='product_intelligence_operator';
  required_resource_type := case
    when p_operation in (
      'git_create_scoped_branch','git_push_scoped_draft_branch',
      'github_open_draft_pr','github_update_draft_pr_body'
    ) then 'branch'
    else 'path'
  end;
  required_resource_key := case
    when required_resource_type='branch' then 'branch:' || p_branch_name
    else 'path:' || p_path
  end;
  select * into lease_value from public.cognitive_resource_leases
  where id=p_resource_lease_id for update;
  if capability_value.status<>'active'
     or encode(extensions.digest(
       convert_to(coalesce(p_opaque_bearer,''),'UTF8'),'sha256'
     ),'hex') is distinct from capability_value.bearer_hash
     or encode(extensions.digest(
       convert_to(coalesce(p_opaque_nonce,''),'UTF8'),'sha256'
     ),'hex') is distinct from capability_value.nonce_hash
     or now_at<capability_value.not_before
     or now_at>=capability_value.expires_at
     or capability_value.revoked_at is not null
     or task_value.id is null
     or task_value.cancelled_at is not null
     or task_value.quarantined_at is not null
     or now_at>=task_value.deadman_at
     or approval_status<>'approved'
     or approval_expires<=now_at
     or approval_platform<>p_platform::text
     or approval_scope_hash<>p_approval_scope_hash
     or coalesce(emergency_status,'emergency_stop')<>'active'
     or capability_value.task_id<>p_task_id
     or capability_value.project_id<>p_project_id
     or capability_value.repository_full_name<>p_repository_full_name
     or capability_value.branch_name<>p_branch_name
     or capability_value.platform<>p_platform
     or capability_value.environment<>p_environment
     or capability_value.provider<>p_provider
     or capability_value.operation<>p_operation
     or capability_value.approval_scope_hash<>p_approval_scope_hash
     or capability_value.plan_snapshot_hash<>p_plan_snapshot_hash
     or (
       p_path ~* '^(supabase/migrations/|app\.json$|app\.config\.|eas\.json$|config/release/)|(^|/)(auth|rls|role|money|payment|revenuecat|provider)([._/-]|$)'
       and capability_value.risk_level<>'high'
     )
     or not exists (
       select 1 from unnest(capability_value.path_scopes) scope
       where p_path=rtrim(scope,'/') or p_path like rtrim(scope,'/') || '/%'
     )
     or capability_value.remaining_calls<1
     or p_bytes<0 or p_bytes>capability_value.remaining_bytes
     or p_cost<0 or p_cost>capability_value.remaining_cost
     or p_request_hash !~ '^[a-f0-9]{64}$'
     or lease_value.id is null
     or lease_value.task_id<>p_task_id
     or lease_value.project_id<>p_project_id
     or lease_value.platform<>p_platform
     or lease_value.environment<>p_environment
     or lease_value.resource_type<>required_resource_type
     or lease_value.resource_key<>required_resource_key
     or lease_value.revoked_at is not null
     or now_at<lease_value.issued_at
     or now_at>=lease_value.expires_at
     or (
       p_operation in (
         'repository_apply_patch','repository_write_new_file',
         'git_create_scoped_branch','git_stage_allowlisted_paths',
         'git_commit_scoped','git_push_scoped_draft_branch',
         'github_open_draft_pr','github_update_draft_pr_body'
       )
       and lease_value.mode<>'write'
     ) then
    raise exception 'capability_scope_budget_or_lease_rejected'
      using errcode='P0001';
  end if;
  if exists (
    select 1 from public.cognitive_capability_events
    where capability_id=capability_value.id and call_id=p_call_id
  ) then
    raise exception 'capability_replay' using errcode='23505';
  end if;
  sequence_value:=capability_value.next_usage_sequence;
  update public.cognitive_capabilities set
    remaining_calls=remaining_calls-1,
    remaining_bytes=remaining_bytes-p_bytes,
    remaining_cost=remaining_cost-p_cost,
    consumed_at=now_at,
    next_usage_sequence=next_usage_sequence+1,
    status=case when remaining_calls-1=0
      then 'exhausted'::public.cognitive_capability_status else status end
  where id=capability_value.id;
  insert into public.cognitive_capability_events(
    capability_id,task_id,project_id,platform,environment,call_id,
    usage_sequence,event_type,request_hash,resource_lease_id,
    resource_type,resource_key,reserved_bytes,reserved_cost
  ) values (
    capability_value.id,p_task_id,p_project_id,p_platform,p_environment,p_call_id,
    sequence_value,'consumed',p_request_hash,p_resource_lease_id,
    required_resource_type,required_resource_key,p_bytes,p_cost
  );
  return sequence_value;
end;
$$;
revoke all on function public.cognitive_consume_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text
) from public,anon,authenticated;
grant execute on function public.cognitive_consume_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text
) to service_role;

revoke all on function public.cognitive_accept_tool_result(
  text,text,text,text,jsonb
) from public,anon,authenticated,service_role;

create function public.cognitive_accept_trusted_tool_result(
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
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  capability_value public.cognitive_capabilities%rowtype;
  task_value public.intelligence_tasks%rowtype;
  consumed_event public.cognitive_capability_events%rowtype;
  result_id uuid;
  result_hash_value text;
  emergency_status text;
begin
  perform public.cognitive_verify_service_token(
    'capability_and_tool_broker',p_service_identity_token
  );
  select * into capability_value from public.cognitive_capabilities
  where capability_id=p_capability_id for update;
  select * into task_value from public.intelligence_tasks
  where id=capability_value.task_id and project_id=capability_value.project_id
    and platform=capability_value.platform
    and environment=capability_value.environment;
  select * into consumed_event from public.cognitive_capability_events event
  where event.capability_id=capability_value.id
    and event.call_id=p_call_id
    and event.event_type='consumed';
  select status into emergency_status
  from public.autonomous_system_emergency_states
  where system_id='product_intelligence_operator';
  if capability_value.id is null
     or encode(extensions.digest(
       convert_to(coalesce(p_opaque_bearer,''),'UTF8'),'sha256'
     ),'hex') is distinct from capability_value.bearer_hash
     or encode(extensions.digest(
       convert_to(coalesce(p_opaque_nonce,''),'UTF8'),'sha256'
     ),'hex') is distinct from capability_value.nonce_hash
     or capability_value.status not in ('active','exhausted')
     or capability_value.revoked_at is not null
     or transaction_timestamp()>=capability_value.expires_at
     or task_value.id is null
     or task_value.cancelled_at is not null
     or task_value.quarantined_at is not null
     or transaction_timestamp()>=task_value.deadman_at
     or coalesce(emergency_status,'emergency_stop')<>'active'
     or consumed_event.id is null
     or p_result_envelope is null
     or pg_column_size(p_result_envelope)>65536
     or not public.cognitive_json_is_sanitized(p_result_envelope)
     or p_before_state_hash !~ '^[a-f0-9]{64}$'
     or p_after_state_hash !~ '^[a-f0-9]{64}$'
     or (p_diff_hash is not null and p_diff_hash !~ '^[a-f0-9]{64}$')
     or (p_final_commit is not null and p_final_commit !~ '^[a-f0-9]{40}$')
     or not public.cognitive_approval_is_fresh(
       capability_value.approval_request_id,capability_value.operation,
       capability_value.platform,capability_value.approval_scope_hash,
       capability_value.plan_snapshot_hash
     ) then
    raise exception 'trusted_tool_result_rejected' using errcode='P0001';
  end if;
  result_hash_value:=encode(extensions.digest(
    convert_to(p_result_envelope::text,'UTF8'),'sha256'
  ),'hex');
  insert into public.cognitive_tool_result_records(
    capability_id,task_id,project_id,platform,environment,call_id,
    usage_sequence,result_envelope,result_envelope_hash,result_source,
    before_state_hash,after_state_hash,diff_hash,final_commit,
    resource_type,resource_key
  ) values (
    capability_value.id,capability_value.task_id,capability_value.project_id,
    capability_value.platform,capability_value.environment,p_call_id,
    consumed_event.usage_sequence,p_result_envelope,result_hash_value,'tool_broker',
    p_before_state_hash,p_after_state_hash,p_diff_hash,p_final_commit,
    consumed_event.resource_type,consumed_event.resource_key
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.cognitive_accept_trusted_tool_result(
  text,text,text,text,jsonb,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.cognitive_accept_trusted_tool_result(
  text,text,text,text,jsonb,text,text,text,text,text
) to service_role;

-- Physical/provider proof is a verified row, never an arbitrary UUID.
create table public.cognitive_verified_external_evidence (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  evidence_type text not null check (
    evidence_type in (
      'device_attested','provider_attested','credential_attested'
    )
  ),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  producer_identity_hash text not null check (
    producer_identity_hash ~ '^[a-f0-9]{64}$'
  ),
  observed_at timestamptz not null default transaction_timestamp(),
  expires_at timestamptz not null,
  created_at timestamptz not null default transaction_timestamp(),
  unique (task_id,evidence_type,evidence_hash),
  unique (id,task_id,project_id,platform,environment),
  foreign key (task_id,project_id,platform,environment)
    references public.intelligence_tasks(id,project_id,platform,environment),
  check (
    expires_at>observed_at
    and expires_at<=observed_at+interval '30 days'
  )
);
alter table public.cognitive_verified_external_evidence enable row level security;
alter table public.cognitive_verified_external_evidence force row level security;
revoke all on table public.cognitive_verified_external_evidence
  from public,anon,authenticated,service_role;
grant select on table public.cognitive_verified_external_evidence
  to authenticated,service_role;
create policy cognitive_verified_external_evidence_exact_read
  on public.cognitive_verified_external_evidence
  for select to authenticated
  using ((select public.cognitive_can_read_scope(project_id,task_id,platform)));
create trigger cognitive_verified_external_evidence_immutable
before update or delete on public.cognitive_verified_external_evidence
for each row execute function public.reject_cognitive_evidence_mutation();

alter table public.cognitive_trusted_evidence_manifests
  add foreign key (
    physical_evidence_record_id,task_id,project_id,platform,environment
  ) references public.cognitive_verified_external_evidence(
    id,task_id,project_id,platform,environment
  );

create function public.cognitive_record_verified_external_evidence(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_evidence_type text,
  p_evidence_hash text,
  p_expires_at timestamptz,
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare result_id uuid;
declare expected_identity text;
declare now_at timestamptz:=transaction_timestamp();
begin
  expected_identity:=case p_evidence_type
    when 'device_attested' then 'trusted_test_runner'
    when 'provider_attested' then 'capability_and_tool_broker'
    when 'credential_attested' then 'credential_attestation_authority'
    else null
  end;
  if expected_identity is null then
    raise exception 'verified_external_evidence_rejected' using errcode='P0001';
  end if;
  perform public.cognitive_verify_service_token(
    expected_identity,p_service_identity_token
  );
  if p_evidence_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at<=now_at
     or p_expires_at>now_at+interval '30 days'
     or not exists (
       select 1 from public.intelligence_tasks task
       where task.id=p_task_id and task.project_id=p_project_id
         and task.platform=p_platform and task.environment=p_environment
         and task.cancelled_at is null and task.quarantined_at is null
     ) then
    raise exception 'verified_external_evidence_rejected' using errcode='P0001';
  end if;
  insert into public.cognitive_verified_external_evidence(
    task_id,project_id,platform,environment,evidence_type,evidence_hash,
    producer_identity_hash,observed_at,expires_at
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,p_evidence_type,p_evidence_hash,
    encode(extensions.digest(convert_to(expected_identity,'UTF8'),'sha256'),'hex'),
    now_at,p_expires_at
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.cognitive_record_verified_external_evidence(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,timestamptz,text
) from public,anon,authenticated;
grant execute on function public.cognitive_record_verified_external_evidence(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,timestamptz,text
) to service_role;

create or replace function public.cognitive_finalize_trusted_evidence_manifest(
  p_receipt_id uuid,
  p_physical_evidence_type text,
  p_physical_evidence_record_id uuid,
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare receipt public.cognitive_execution_receipts%rowtype;
declare external_evidence public.cognitive_verified_external_evidence%rowtype;
declare result_id uuid;
declare manifest_hash_value text;
declare now_at timestamptz:=transaction_timestamp();
begin
  perform public.cognitive_verify_service_token(
    'trusted_test_runner',p_service_identity_token
  );
  select * into receipt from public.cognitive_execution_receipts
  where id=p_receipt_id;
  if p_physical_evidence_record_id is not null then
    select * into external_evidence
    from public.cognitive_verified_external_evidence evidence
    where evidence.id=p_physical_evidence_record_id
      and evidence.task_id=receipt.task_id
      and evidence.project_id=receipt.project_id
      and evidence.platform=receipt.platform
      and evidence.environment=receipt.environment;
  end if;
  if receipt.id is null
     or receipt.final_commit is null
     or receipt.diff_hash is null
     or p_physical_evidence_type not in (
       'none','device_attested','provider_attested'
     )
     or (p_physical_evidence_type='none')<>(p_physical_evidence_record_id is null)
     or (
       p_physical_evidence_type<>'none'
       and (
         external_evidence.id is null
         or external_evidence.evidence_type<>p_physical_evidence_type
         or now_at>=external_evidence.expires_at
       )
     )
     or not exists (
       select 1 from public.cognitive_trusted_test_results test
       where test.receipt_id=receipt.id
     ) then
    raise exception 'trusted_evidence_manifest_rejected' using errcode='P0001';
  end if;
  manifest_hash_value:=encode(extensions.digest(convert_to(concat_ws(
    '|',receipt.id::text,receipt.final_commit,receipt.diff_hash,
    p_physical_evidence_type,
    coalesce(external_evidence.evidence_hash,''),
    coalesce((
      select string_agg(test.result_hash,',' order by test.test_id)
      from public.cognitive_trusted_test_results test
      where test.receipt_id=receipt.id
    ),'')
  ),'UTF8'),'sha256'),'hex');
  insert into public.cognitive_trusted_evidence_manifests(
    receipt_id,task_id,project_id,platform,environment,evaluated_commit,
    evaluated_diff_hash,physical_evidence_type,physical_evidence_record_id,
    manifest_hash,runner_identity_hash
  ) values (
    receipt.id,receipt.task_id,receipt.project_id,receipt.platform,
    receipt.environment,receipt.final_commit,receipt.diff_hash,
    p_physical_evidence_type,p_physical_evidence_record_id,
    manifest_hash_value,
    encode(extensions.digest(
      convert_to('trusted_test_runner','UTF8'),'sha256'
    ),'hex')
  ) returning id into result_id;
  return result_id;
end;
$$;

-- A subject verdict is derived from authoritative evidence.  The evaluator
-- supplies no PASS/FAIL boolean and cannot manufacture an evidence hash.
create table public.cognitive_subject_evidence_manifests (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  subject_type text not null check (
    subject_type in ('research_claim','decision_manifest','provider_credential')
  ),
  subject_id uuid not null,
  derived_status public.cognitive_evaluation_status not null,
  evidence_manifest jsonb not null check (
    pg_column_size(evidence_manifest)<=32768
    and public.cognitive_json_is_sanitized(evidence_manifest)
  ),
  manifest_hash text not null unique check (manifest_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  expires_at timestamptz not null,
  unique (subject_type,subject_id),
  unique (id,task_id,project_id,platform,environment),
  foreign key (task_id,project_id,platform,environment)
    references public.intelligence_tasks(id,project_id,platform,environment),
  check (
    expires_at>created_at and expires_at<=created_at+interval '7 days'
  )
);
alter table public.cognitive_subject_evidence_manifests enable row level security;
alter table public.cognitive_subject_evidence_manifests force row level security;
revoke all on table public.cognitive_subject_evidence_manifests
  from public,anon,authenticated,service_role;
grant select on table public.cognitive_subject_evidence_manifests
  to authenticated,service_role;
create policy cognitive_subject_evidence_manifests_exact_read
  on public.cognitive_subject_evidence_manifests
  for select to authenticated
  using ((select public.cognitive_can_read_scope(project_id,task_id,platform)));
create trigger cognitive_subject_evidence_manifests_immutable
before update or delete on public.cognitive_subject_evidence_manifests
for each row execute function public.reject_cognitive_evidence_mutation();

alter table public.cognitive_subject_evaluations
  add column evidence_manifest_id uuid not null,
  add foreign key (
    evidence_manifest_id,task_id,project_id,platform,environment
  ) references public.cognitive_subject_evidence_manifests(
    id,task_id,project_id,platform,environment
  );

revoke all on function public.cognitive_record_subject_evaluation(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,uuid,public.cognitive_evaluation_status,text
) from public,anon,authenticated,service_role;

create function public.cognitive_derive_subject_evaluation(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_subject_type text,
  p_subject_id uuid,
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare derived_status public.cognitive_evaluation_status:='blocked';
declare evidence_value jsonb;
declare evidence_hash_value text;
declare manifest_id uuid;
declare result_id uuid;
declare now_at timestamptz:=transaction_timestamp();
declare claim_value public.research_claims%rowtype;
declare decision_value public.governance_decision_manifests%rowtype;
declare credential_value public.cognitive_provider_credential_receipts%rowtype;
declare support_count integer:=0;
declare oppose_count integer:=0;
begin
  perform public.cognitive_verify_service_token(
    'independent_evaluation_judge',p_service_identity_token
  );
  if p_subject_type not in (
       'research_claim','decision_manifest','provider_credential'
     )
     or not exists (
       select 1 from public.intelligence_tasks task
       where task.id=p_task_id and task.project_id=p_project_id
         and task.platform=p_platform and task.environment=p_environment
         and task.cancelled_at is null and task.quarantined_at is null
         and now_at<task.deadman_at
     ) then
    raise exception 'derived_subject_evaluation_rejected' using errcode='P0001';
  end if;

  if p_subject_type='research_claim' then
    select * into claim_value from public.research_claims claim
    where claim.id=p_subject_id and claim.task_id=p_task_id
      and claim.project_id=p_project_id and claim.platform=p_platform
      and claim.environment=p_environment;
    if claim_value.id is null then
      raise exception 'derived_subject_evaluation_rejected' using errcode='P0001';
    end if;
    if claim_value.status='supported'
       and claim_value.support_state='supported'
       and claim_value.freshness_deadline>now_at
       and claim_value.contradiction_state not in ('detected','unresolved')
       and not exists (
         select 1 from public.research_contradictions contradiction
         where contradiction.claim_id=claim_value.id
           and contradiction.resolution_state='open'
       )
       and exists (
         select 1
         from public.research_claim_sources relation
         join public.research_sources source
           on source.id=relation.source_id
          and source.task_id=relation.task_id
          and source.project_id=relation.project_id
          and source.platform=relation.platform
          and source.environment=relation.environment
         where relation.claim_id=claim_value.id
           and relation.relationship='supports'
           and source.freshness_deadline>=claim_value.freshness_deadline
           and source.citation_metadata<>'{}'::jsonb
           and exists (
             select 1 from public.research_retrieval_events retrieval
             where retrieval.source_id=source.id
               and retrieval.task_id=source.task_id
               and retrieval.result='accepted'
               and retrieval.request_url_hash=source.canonical_url_hash
               and retrieval.response_hash=source.content_hash
           )
       )
       and (
         claim_value.category not in ('technical','platform_policy','security')
         or exists (
           select 1
           from public.research_claim_sources relation
           join public.research_sources source on source.id=relation.source_id
           where relation.claim_id=claim_value.id
             and relation.relationship='supports'
             and source.is_primary
             and source.source_type in (
               'official_documentation','security_advisory',
               'platform_policy','store_policy'
             )
         )
       )
       and (
         claim_value.category<>'consequential_news'
         or (
           select least(
             count(distinct lower(source.publisher)),
             count(distinct source.canonical_url_hash),
             count(distinct source.content_hash)
           )
           from public.research_claim_sources relation
           join public.research_sources source on source.id=relation.source_id
           where relation.claim_id=claim_value.id
             and relation.relationship='supports'
             and source.source_type='news'
         )>=2
       ) then
      derived_status:='pass';
    end if;
    evidence_value:=jsonb_build_object(
      'claimHash',claim_value.claim_hash,
      'supportState',claim_value.support_state,
      'contradictionState',claim_value.contradiction_state,
      'sourceEvidenceHashes',coalesce((
        select jsonb_agg(
          encode(extensions.digest(convert_to(concat_ws(
            '|',source.id::text,source.content_hash,
            source.canonical_url_hash,retrieval.response_hash
          ),'UTF8'),'sha256'),'hex')
          order by source.id,retrieval.id
        )
        from public.research_claim_sources relation
        join public.research_sources source on source.id=relation.source_id
        join public.research_retrieval_events retrieval
          on retrieval.source_id=source.id and retrieval.result='accepted'
        where relation.claim_id=claim_value.id
      ),'[]'::jsonb)
    );
  elsif p_subject_type='decision_manifest' then
    select * into decision_value
    from public.governance_decision_manifests decision
    where decision.id=p_subject_id and decision.task_id=p_task_id
      and decision.project_id=p_project_id and decision.platform=p_platform
      and decision.environment=p_environment;
    if decision_value.id is null then
      raise exception 'derived_subject_evaluation_rejected' using errcode='P0001';
    end if;
    select
      count(*) filter (where vote.position='support')::integer,
      count(*) filter (where vote.position='oppose')::integer
    into support_count,oppose_count
    from public.governance_votes vote
    where vote.deliberation_id=decision_value.deliberation_id
      and vote.proposal_id=decision_value.selected_proposal_id;
    if decision_value.status='finalized'
       and now_at<decision_value.expires_at
       and support_count>=(
         select deliberation.required_quorum
         from public.governance_deliberations deliberation
         where deliberation.id=decision_value.deliberation_id
       )
       and support_count>oppose_count
       and not exists (
         select 1 from public.governance_vetoes veto
         where veto.deliberation_id=decision_value.deliberation_id
           and veto.mandatory and veto.status='active'
       )
       and (
         select count(distinct impact.stakeholder_key)
         from public.governance_stakeholder_impacts impact
         where impact.deliberation_id=decision_value.deliberation_id
           and impact.proposal_id=decision_value.selected_proposal_id
       )=16 then
      derived_status:='pass';
    end if;
    evidence_value:=jsonb_build_object(
      'decisionHash',decision_value.decision_hash,
      'councilHash',decision_value.council_attestation_hash,
      'votesHash',decision_value.votes_hash,
      'vetoesHash',decision_value.vetoes_hash,
      'dissentHash',decision_value.dissent_hash,
      'stakeholderHash',decision_value.stakeholder_impact_hash,
      'supportCount',support_count,
      'opposeCount',oppose_count
    );
  else
    select * into credential_value
    from public.cognitive_provider_credential_receipts receipt
    where receipt.id=p_subject_id and receipt.task_id=p_task_id
      and receipt.project_id=p_project_id and receipt.platform=p_platform
      and receipt.environment=p_environment;
    if credential_value.id is null then
      raise exception 'derived_subject_evaluation_rejected' using errcode='P0001';
    end if;
    if credential_value.state='configured'
       and now_at<credential_value.expires_at
       and exists (
         select 1
         from public.cognitive_provider_credential_receipts peer
         where peer.task_id=credential_value.task_id
           and peer.project_id=credential_value.project_id
           and peer.platform=credential_value.platform
           and peer.environment=credential_value.environment
           and peer.credential_kind=credential_value.credential_kind
           and peer.receipt_type<>credential_value.receipt_type
           and peer.state='configured'
           and peer.public_fingerprint_hash=credential_value.public_fingerprint_hash
           and peer.scope_manifest_hash=credential_value.scope_manifest_hash
           and peer.producer_identity_hash<>credential_value.producer_identity_hash
           and now_at<peer.expires_at
       ) then
      derived_status:='pass';
    end if;
    evidence_value:=jsonb_build_object(
      'credentialKind',credential_value.credential_kind,
      'fingerprintHash',credential_value.public_fingerprint_hash,
      'scopeHash',credential_value.scope_manifest_hash,
      'receiptType',credential_value.receipt_type
    );
  end if;
  evidence_hash_value:=encode(extensions.digest(
    convert_to(evidence_value::text,'UTF8'),'sha256'
  ),'hex');
  insert into public.cognitive_subject_evidence_manifests(
    task_id,project_id,platform,environment,subject_type,subject_id,
    derived_status,evidence_manifest,manifest_hash,expires_at
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,p_subject_type,p_subject_id,
    derived_status,evidence_value,evidence_hash_value,now_at+interval '24 hours'
  ) returning id into manifest_id;
  insert into public.cognitive_subject_evaluations(
    task_id,project_id,platform,environment,subject_type,subject_id,
    evaluation_status,evidence_hash,evaluator_identity_hash,
    evaluated_at,expires_at,evidence_manifest_id
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,p_subject_type,p_subject_id,
    derived_status,evidence_hash_value,
    encode(extensions.digest(convert_to(
      'independent_evaluation_judge','UTF8'
    ),'sha256'),'hex'),
    now_at,now_at+interval '24 hours',manifest_id
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.cognitive_derive_subject_evaluation(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,uuid,text
) from public,anon,authenticated;
grant execute on function public.cognitive_derive_subject_evaluation(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,uuid,text
) to service_role;

-- Evaluation is recorded as a separate immutable verdict.  The receipt itself
-- is immutable postflight evidence and is never rewritten by the evaluator.
create table public.cognitive_execution_receipt_verdicts (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null,
  evaluation_id uuid not null,
  evidence_manifest_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  verdict public.cognitive_evaluation_status not null,
  evaluated_commit text not null check (evaluated_commit ~ '^[a-f0-9]{40}$'),
  evaluated_diff_hash text not null check (
    evaluated_diff_hash ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (receipt_id),
  unique (evaluation_id),
  unique (id,task_id,project_id,platform,environment),
  foreign key (receipt_id,task_id,project_id,platform,environment)
    references public.cognitive_execution_receipts(
      id,task_id,project_id,platform,environment
    ),
  foreign key (evaluation_id,task_id,project_id,platform,environment)
    references public.governance_execution_evaluations(
      id,task_id,project_id,platform,environment
    ),
  foreign key (evidence_manifest_id,task_id,project_id,platform,environment)
    references public.cognitive_trusted_evidence_manifests(
      id,task_id,project_id,platform,environment
    )
);
alter table public.cognitive_execution_receipt_verdicts enable row level security;
alter table public.cognitive_execution_receipt_verdicts force row level security;
revoke all on table public.cognitive_execution_receipt_verdicts
  from public,anon,authenticated,service_role;
grant select on table public.cognitive_execution_receipt_verdicts
  to authenticated,service_role;
create policy cognitive_execution_receipt_verdicts_exact_read
  on public.cognitive_execution_receipt_verdicts
  for select to authenticated
  using ((select public.cognitive_can_read_scope(project_id,task_id,platform)));
create trigger cognitive_execution_receipt_verdicts_immutable
before update or delete on public.cognitive_execution_receipt_verdicts
for each row execute function public.reject_cognitive_evidence_mutation();

create function public.cognitive_capture_execution_receipt_verdict()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare manifest_value public.cognitive_trusted_evidence_manifests%rowtype;
begin
  if not (new.proof_manifest ? 'trustedEvidenceManifestId') then
    raise exception 'trusted_evaluation_manifest_missing' using errcode='P0001';
  end if;
  select * into manifest_value
  from public.cognitive_trusted_evidence_manifests manifest
  where manifest.id=(new.proof_manifest->>'trustedEvidenceManifestId')::uuid
    and manifest.receipt_id=new.receipt_id
    and manifest.task_id=new.task_id
    and manifest.project_id=new.project_id
    and manifest.platform=new.platform
    and manifest.environment=new.environment;
  if manifest_value.id is null
     or manifest_value.manifest_hash<>new.evidence_manifest_hash
     or manifest_value.evaluated_commit<>new.evaluated_commit
     or manifest_value.evaluated_diff_hash<>new.evaluated_diff_hash then
    raise exception 'trusted_evaluation_manifest_mismatch' using errcode='P0001';
  end if;
  insert into public.cognitive_execution_receipt_verdicts(
    receipt_id,evaluation_id,evidence_manifest_id,task_id,project_id,
    platform,environment,verdict,evaluated_commit,evaluated_diff_hash
  ) values (
    new.receipt_id,new.id,manifest_value.id,new.task_id,new.project_id,
    new.platform,new.environment,new.evaluation_status,new.evaluated_commit,
    new.evaluated_diff_hash
  );
  return new;
exception
  when invalid_text_representation then
    raise exception 'trusted_evaluation_manifest_missing' using errcode='P0001';
end;
$$;
revoke all on function public.cognitive_capture_execution_receipt_verdict()
  from public,anon,authenticated,service_role;
create trigger governance_execution_evaluation_verdict
after insert on public.governance_execution_evaluations
for each row execute function public.cognitive_capture_execution_receipt_verdict();

-- The superseded broker helper created a passing canary without an evaluator.
-- It remains in migration history but has no callable runtime role.
revoke all on function public.cognitive_record_public_research_claim(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,
  numeric,timestamptz,text,uuid[],text,text
) from public,anon,authenticated,service_role;

create function public.cognitive_record_public_research_source(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_authority_id text,
  p_canonical_host text,
  p_source_type text,
  p_publisher text,
  p_ownership_identity text,
  p_source_reference_hash text,
  p_canonical_url_hash text,
  p_content_hash text,
  p_publication_date timestamptz,
  p_retrieval_date timestamptz,
  p_freshness_deadline timestamptz,
  p_is_primary boolean,
  p_bounded_excerpt text,
  p_citation_metadata jsonb,
  p_resolved_address_hashes text[],
  p_service_identity_token text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare source_id_value uuid;
declare retrieval_id_value uuid;
declare now_at timestamptz:=transaction_timestamp();
begin
  perform public.cognitive_verify_service_token(
    'research_source_broker',p_service_identity_token
  );
  if p_platform<>'shared' or p_environment<>'production'
     or p_source_reference_hash !~ '^[a-f0-9]{64}$'
     or p_canonical_url_hash !~ '^[a-f0-9]{64}$'
     or p_content_hash !~ '^[a-f0-9]{64}$'
     or p_retrieval_date>now_at+interval '5 minutes'
     or p_retrieval_date<now_at-interval '48 hours'
     or p_freshness_deadline<=p_retrieval_date
     or length(p_bounded_excerpt) not between 1 and 2000
     or public.cognitive_text_has_secret(p_bounded_excerpt)
     or public.cognitive_text_has_private_identifier(p_bounded_excerpt)
     or p_citation_metadata is null
     or not public.cognitive_json_is_sanitized(p_citation_metadata)
     or cardinality(p_resolved_address_hashes) not between 1 and 16
     or exists (
       select 1 from unnest(p_resolved_address_hashes) value
       where value !~ '^[a-f0-9]{64}$'
     )
     or not exists (
       select 1 from public.cognitive_research_authorities authority
       where authority.authority_id=p_authority_id
         and authority.canonical_host=p_canonical_host
         and authority.source_type=p_source_type
         and authority.publisher=p_publisher
         and authority.ownership_identity=p_ownership_identity
     )
     or not exists (
       select 1 from public.intelligence_tasks task
       where task.id=p_task_id and task.project_id=p_project_id
         and task.platform=p_platform and task.environment=p_environment
         and task.cancelled_at is null and task.quarantined_at is null
     ) then
    raise exception 'public_research_source_rejected' using errcode='P0001';
  end if;
  insert into public.research_sources(
    task_id,project_id,platform,environment,actor_identity,dedupe_key,
    status,summary,evidence_metadata,data_class,retention_until,
    authority_id,canonical_host,ownership_identity,source_reference_hash,
    canonical_url_hash,content_hash,publisher,publication_date,retrieval_date,
    freshness_deadline,source_type,is_primary,bounded_excerpt,citation_metadata,
    trusted_for_tool_execution
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,'research-source-broker',
    'public-source-'||substr(p_canonical_url_hash,1,32),'accepted',
    '{}'::jsonb,'{}'::jsonb,'research_cache',
    least(p_freshness_deadline,now_at+interval '90 days'),
    p_authority_id,p_canonical_host,p_ownership_identity,
    p_source_reference_hash,p_canonical_url_hash,p_content_hash,p_publisher,
    p_publication_date,p_retrieval_date,p_freshness_deadline,p_source_type,
    p_is_primary,p_bounded_excerpt,p_citation_metadata,false
  ) returning id into source_id_value;
  insert into public.research_retrieval_events(
    source_id,task_id,project_id,platform,environment,request_url_hash,
    resolved_address_hashes,response_hash,result
  ) values (
    source_id_value,p_task_id,p_project_id,p_platform,p_environment,
    p_canonical_url_hash,p_resolved_address_hashes,p_content_hash,'accepted'
  ) returning id into retrieval_id_value;
  return jsonb_build_object(
    'source_id',source_id_value,
    'retrieval_id',retrieval_id_value,
    'content_hash',p_content_hash
  );
end;
$$;
revoke all on function public.cognitive_record_public_research_source(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,
  boolean,text,jsonb,text[],text
) from public,anon,authenticated;
grant execute on function public.cognitive_record_public_research_source(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,
  boolean,text,jsonb,text[],text
) to service_role;

create function public.cognitive_record_public_research_claim_evidence(
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
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare claim_id_value uuid;
declare claim_hash_value text;
declare source_id_value uuid;
declare independent_source_count integer;
declare official_primary_count integer;
declare now_at timestamptz:=transaction_timestamp();
begin
  perform public.cognitive_verify_service_token(
    'research_source_broker',p_service_identity_token
  );
  if p_platform<>'shared' or p_environment<>'production'
     or p_canary_key not in (
       'platform_policy_research','repository_architecture_ux',
       'dependency_security_research'
     )
     or p_category not in (
       'technical','platform_policy','consequential_news','product','security'
     )
     or p_confidence not between 0 and 1
     or p_freshness_deadline<=now_at
     or p_freshness_deadline>now_at+interval '90 days'
     or p_contradiction_state not in ('none','detected','unresolved','resolved')
     or cardinality(p_source_ids) not between 1 and 8
     or length(p_bounded_claim) not between 4 and 2000
     or public.cognitive_text_has_secret(p_bounded_claim)
     or public.cognitive_text_has_private_identifier(p_bounded_claim) then
    raise exception 'public_research_claim_evidence_rejected'
      using errcode='P0001';
  end if;
  select
    count(distinct source.ownership_identity),
    count(*) filter (
      where source.is_primary and source.source_type in (
        'official_documentation','security_advisory',
        'platform_policy','store_policy'
      )
    )
  into independent_source_count,official_primary_count
  from public.research_sources source
  where source.id=any(p_source_ids)
    and source.task_id=p_task_id and source.project_id=p_project_id
    and source.platform=p_platform and source.environment=p_environment
    and source.freshness_deadline>=p_freshness_deadline
    and exists (
      select 1 from public.research_retrieval_events retrieval
      where retrieval.source_id=source.id
        and retrieval.task_id=source.task_id
        and retrieval.result='accepted'
        and retrieval.request_url_hash=source.canonical_url_hash
        and retrieval.response_hash=source.content_hash
    );
  if (p_category in ('technical','platform_policy','security')
        and official_primary_count<1)
     or (p_category='consequential_news' and independent_source_count<2)
     or (
       select count(*) from public.research_sources source
       where source.id=any(p_source_ids)
         and source.task_id=p_task_id
         and source.project_id=p_project_id
         and source.platform=p_platform
         and source.environment=p_environment
     )<>cardinality(p_source_ids) then
    raise exception 'public_research_claim_provenance_rejected'
      using errcode='P0001';
  end if;
  claim_hash_value:=encode(extensions.digest(
    convert_to(p_bounded_claim,'UTF8'),'sha256'
  ),'hex');
  insert into public.research_claims(
    task_id,project_id,platform,environment,actor_identity,dedupe_key,
    status,summary,evidence_metadata,data_class,retention_until,
    claim_hash,bounded_claim,confidence,category,freshness_deadline,
    contradiction_state,support_state
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,'research-source-broker',
    'research-claim-'||p_canary_key,'pending','{}'::jsonb,'{}'::jsonb,
    'research_cache',least(p_freshness_deadline,now_at+interval '90 days'),
    claim_hash_value,p_bounded_claim,p_confidence,p_category,p_freshness_deadline,
    p_contradiction_state,
    case when p_contradiction_state in ('detected','unresolved')
      then 'contradicted' else 'supported' end
  ) returning id into claim_id_value;
  foreach source_id_value in array p_source_ids loop
    insert into public.research_claim_sources(
      claim_id,source_id,task_id,project_id,platform,environment,relationship
    ) values (
      claim_id_value,source_id_value,p_task_id,p_project_id,p_platform,
      p_environment,case when p_contradiction_state in ('detected','unresolved')
        then 'contradicts' else 'supports' end
    );
  end loop;
  update public.research_claims set
    status=case when p_contradiction_state in ('detected','unresolved')
      then 'contradicted' else 'supported' end
  where id=claim_id_value and status='pending';
  return claim_id_value;
end;
$$;
revoke all on function public.cognitive_record_public_research_claim_evidence(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,numeric,timestamptz,text,uuid[],text
) from public,anon,authenticated;
grant execute on function public.cognitive_record_public_research_claim_evidence(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,numeric,timestamptz,text,uuid[],text
) to service_role;

alter table public.cognitive_provider_credential_receipts
  add column external_evidence_id uuid not null,
  add foreign key (
    external_evidence_id,task_id,project_id,platform,environment
  ) references public.cognitive_verified_external_evidence(
    id,task_id,project_id,platform,environment
  );

revoke all on function public.cognitive_record_provider_credential_receipt(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,timestamptz,text
) from public,anon,authenticated,service_role;

create function public.cognitive_record_provider_credential_receipt(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_receipt_type text,
  p_credential_kind text,
  p_state text,
  p_public_fingerprint_hash text,
  p_scope_manifest_hash text,
  p_expires_at timestamptz,
  p_external_evidence_id uuid,
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare result_id uuid;
declare expected_identity text;
declare expected_evidence_type text;
declare now_at timestamptz:=transaction_timestamp();
declare external_evidence public.cognitive_verified_external_evidence%rowtype;
begin
  expected_identity:=case p_receipt_type
    when 'provider_attestation' then 'credential_attestation_authority'
    when 'provider_readback' then 'capability_and_tool_broker'
    else null
  end;
  expected_evidence_type:=case p_receipt_type
    when 'provider_attestation' then 'credential_attested'
    when 'provider_readback' then 'provider_attested'
    else null
  end;
  if expected_identity is null then
    raise exception 'provider_credential_receipt_rejected' using errcode='P0001';
  end if;
  perform public.cognitive_verify_service_token(
    expected_identity,p_service_identity_token
  );
  select * into external_evidence
  from public.cognitive_verified_external_evidence evidence
  where evidence.id=p_external_evidence_id
    and evidence.task_id=p_task_id
    and evidence.project_id=p_project_id
    and evidence.platform=p_platform
    and evidence.environment=p_environment;
  if p_platform<>'shared' or p_environment<>'production'
     or p_credential_kind not in ('model_provider','github_draft_pr')
     or p_state not in ('configured','missing','revoked')
     or p_public_fingerprint_hash !~ '^[a-f0-9]{64}$'
     or p_scope_manifest_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at<=now_at
     or p_expires_at>now_at+interval '30 days'
     or external_evidence.id is null
     or external_evidence.evidence_type<>expected_evidence_type
     or now_at>=external_evidence.expires_at
     or external_evidence.producer_identity_hash<>encode(extensions.digest(
       convert_to(expected_identity,'UTF8'),'sha256'
     ),'hex')
     or not exists (
       select 1 from public.intelligence_tasks task
       where task.id=p_task_id and task.project_id=p_project_id
         and task.platform=p_platform and task.environment=p_environment
     ) then
    raise exception 'provider_credential_receipt_rejected' using errcode='P0001';
  end if;
  insert into public.cognitive_provider_credential_receipts(
    task_id,project_id,platform,environment,receipt_type,credential_kind,
    provider,state,public_fingerprint_hash,scope_manifest_hash,
    producer_identity_hash,verified_at,expires_at,external_evidence_id
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,p_receipt_type,
    p_credential_kind,
    case p_credential_kind
      when 'github_draft_pr' then 'github' else 'model_provider' end,
    p_state,p_public_fingerprint_hash,p_scope_manifest_hash,
    encode(extensions.digest(convert_to(expected_identity,'UTF8'),'sha256'),'hex'),
    now_at,p_expires_at,p_external_evidence_id
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.cognitive_record_provider_credential_receipt(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,timestamptz,uuid,text
) from public,anon,authenticated;
grant execute on function public.cognitive_record_provider_credential_receipt(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,timestamptz,uuid,text
) to service_role;

revoke all on function public.cognitive_record_level01_deliberation_canary(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,jsonb,text,text
) from public,anon,authenticated,service_role;
revoke all on function public.cognitive_record_level01_credential_attestation(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,timestamptz,text
) from public,anon,authenticated,service_role;
revoke all on function public.cognitive_set_level01_schedule_state(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,boolean
) from public,anon,authenticated,service_role;

create table public.governance_constitution_activation_events (
  id uuid primary key default gen_random_uuid(),
  constitution_version_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  event_type text not null check (event_type in ('owner_approved','activated')),
  owner_identity_id uuid not null,
  independent_review_hash text not null check (
    independent_review_hash ~ '^[a-f0-9]{64}$'
  ),
  rollback_hash text not null check (rollback_hash ~ '^[a-f0-9]{64}$'),
  activation_not_before timestamptz not null,
  created_at timestamptz not null default transaction_timestamp(),
  unique (constitution_version_id,event_type),
  unique (id,task_id,project_id,platform,environment),
  foreign key (
    constitution_version_id,task_id,project_id,platform,environment
  ) references public.governance_constitution_versions(
    id,task_id,project_id,platform,environment
  ),
  check (
    (event_type='owner_approved' and activation_not_before>created_at)
    or (event_type='activated' and activation_not_before<=created_at)
  )
);
alter table public.governance_constitution_activation_events
  enable row level security;
alter table public.governance_constitution_activation_events
  force row level security;
revoke all on table public.governance_constitution_activation_events
  from public,anon,authenticated,service_role;
grant select on table public.governance_constitution_activation_events
  to authenticated,service_role;
create policy governance_constitution_activation_events_exact_read
  on public.governance_constitution_activation_events
  for select to authenticated
  using ((select public.cognitive_can_read_scope(project_id,task_id,platform)));
create trigger governance_constitution_activation_events_immutable
before update or delete on public.governance_constitution_activation_events
for each row execute function public.reject_cognitive_evidence_mutation();

create function public.governance_schedule_constitution_activation(
  p_constitution_version_id uuid,
  p_independent_review_hash text,
  p_rollback_hash text,
  p_service_identity_token text
)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare version_value public.governance_constitution_versions%rowtype;
declare owner_id uuid;
declare activate_at timestamptz;
begin
  owner_id:=public.governance_assert_exact_owner();
  perform public.cognitive_verify_service_token(
    'governance_constitution_service',p_service_identity_token
  );
  select * into version_value
  from public.governance_constitution_versions version
  where version.id=p_constitution_version_id;
  activate_at:=transaction_timestamp()+case
    when version_value.version_number=1 then interval '1 minute'
    else interval '24 hours'
  end;
  if version_value.id is null
     or p_independent_review_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash<>version_value.rollback_hash
     or exists (
       select 1 from public.governance_constitution_activation_events event
       where event.constitution_version_id=version_value.id
     ) then
    raise exception 'governance_constitution_activation_schedule_rejected'
      using errcode='P0001';
  end if;
  insert into public.governance_constitution_activation_events(
    constitution_version_id,task_id,project_id,platform,environment,event_type,
    owner_identity_id,independent_review_hash,rollback_hash,
    activation_not_before
  ) values (
    version_value.id,version_value.task_id,version_value.project_id,
    version_value.platform,version_value.environment,'owner_approved',owner_id,
    p_independent_review_hash,p_rollback_hash,activate_at
  );
  update public.governance_constitutions
  set status='reviewed_not_active'
  where id=version_value.constitution_id and status='source_only';
  return activate_at;
end;
$$;
revoke all on function public.governance_schedule_constitution_activation(
  uuid,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.governance_schedule_constitution_activation(
  uuid,text,text,text
) to authenticated;

create function public.governance_activate_scheduled_constitution(
  p_constitution_version_id uuid,
  p_service_identity_token text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare version_value public.governance_constitution_versions%rowtype;
declare approval_event public.governance_constitution_activation_events%rowtype;
declare now_at timestamptz:=transaction_timestamp();
begin
  perform public.cognitive_verify_service_token(
    'governance_constitution_service',p_service_identity_token
  );
  select * into version_value from public.governance_constitution_versions
  where id=p_constitution_version_id;
  select * into approval_event
  from public.governance_constitution_activation_events event
  where event.constitution_version_id=p_constitution_version_id
    and event.event_type='owner_approved';
  if version_value.id is null or approval_event.id is null
     or now_at<approval_event.activation_not_before
     or exists (
       select 1 from public.governance_constitution_activation_events event
       where event.constitution_version_id=p_constitution_version_id
         and event.event_type='activated'
     ) then
    raise exception 'governance_constitution_activation_rejected'
      using errcode='P0001';
  end if;
  insert into public.governance_constitution_activation_events(
    constitution_version_id,task_id,project_id,platform,environment,event_type,
    owner_identity_id,independent_review_hash,rollback_hash,
    activation_not_before
  ) values (
    version_value.id,version_value.task_id,version_value.project_id,
    version_value.platform,version_value.environment,'activated',
    approval_event.owner_identity_id,approval_event.independent_review_hash,
    approval_event.rollback_hash,approval_event.activation_not_before
  );
  update public.governance_constitutions
  set status='active',current_version=version_value.version_number
  where id=version_value.constitution_id and status='reviewed_not_active';
  if not found then
    raise exception 'governance_constitution_activation_rejected'
      using errcode='P0001';
  end if;
  return true;
end;
$$;
revoke all on function public.governance_activate_scheduled_constitution(
  uuid,text
) from public,anon,authenticated,service_role;
grant execute on function public.governance_activate_scheduled_constitution(
  uuid,text
) to service_role;

-- Controlled, token-authenticated ingestion paths for deliberation evidence.
-- Direct table writes remain revoked, and role/participant scope is derived
-- from database rows rather than accepted from model output.
create function public.governance_open_deliberation(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_constitution_version_id uuid,
  p_deliberation_key text,
  p_objective_hash text,
  p_source_commit text,
  p_architecture_graph_digest text,
  p_risk_level text,
  p_budget_ceiling numeric,
  p_deadline_at timestamptz,
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare task_value public.intelligence_tasks%rowtype;
declare result_id uuid;
declare quorum_value integer;
declare now_at timestamptz:=transaction_timestamp();
begin
  perform public.cognitive_verify_service_token(
    'deliberation_orchestrator',p_service_identity_token
  );
  select * into task_value from public.intelligence_tasks task
  where task.id=p_task_id and task.project_id=p_project_id
    and task.platform=p_platform and task.environment=p_environment;
  quorum_value:=case p_risk_level
    when 'low' then 3 when 'medium' then 4
    when 'high' then 6 when 'critical' then 7 else null end;
  if task_value.id is null
     or task_value.cancelled_at is not null
     or task_value.quarantined_at is not null
     or now_at>=task_value.deadman_at
     or not exists (
       select 1 from public.governance_constitution_versions version
       join public.governance_constitutions constitution
         on constitution.id=version.constitution_id
        and constitution.task_id=version.task_id
        and constitution.project_id=version.project_id
        and constitution.platform=version.platform
        and constitution.environment=version.environment
       where version.id=p_constitution_version_id
         and version.task_id=p_task_id and version.project_id=p_project_id
         and version.platform=p_platform and version.environment=p_environment
         and constitution.status='active'
         and exists (
           select 1
           from public.governance_constitution_activation_events event
           where event.constitution_version_id=version.id
             and event.event_type='activated'
         )
     )
     or length(p_deliberation_key) not between 8 and 160
     or public.cognitive_text_has_secret(p_deliberation_key)
     or public.cognitive_text_has_private_identifier(p_deliberation_key)
     or p_objective_hash !~ '^[a-f0-9]{64}$'
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_architecture_graph_digest !~ '^[a-f0-9]{64}$'
     or quorum_value is null
     or p_budget_ceiling not between 0 and 100
     or p_deadline_at<=now_at
     or p_deadline_at>now_at+interval '7 days' then
    raise exception 'governance_deliberation_open_rejected' using errcode='P0001';
  end if;
  insert into public.governance_deliberations(
    task_id,project_id,platform,environment,constitution_version_id,
    deliberation_key,objective_hash,source_commit,architecture_graph_digest,
    risk_level,status,required_quorum,budget_ceiling,deadline_at
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,p_constitution_version_id,
    p_deliberation_key,p_objective_hash,p_source_commit,
    p_architecture_graph_digest,p_risk_level,'collecting_assessments',
    quorum_value,p_budget_ceiling,p_deadline_at
  ) returning id into result_id;
  insert into public.governance_audit_events(
    task_id,project_id,platform,environment,entity_type,entity_id,event_type,
    actor_identity_hash,evidence_hash
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,'deliberation',result_id,
    'opened',encode(extensions.digest(convert_to(
      'deliberation_orchestrator','UTF8'
    ),'sha256'),'hex'),p_objective_hash
  );
  return result_id;
end;
$$;

create function public.governance_record_evidence_packet(
  p_deliberation_id uuid,
  p_packet_hash text,
  p_source_commit text,
  p_architecture_graph_digest text,
  p_research_claim_hashes text[],
  p_provider_state_hash text,
  p_known_unknowns jsonb,
  p_approval_level text,
  p_budget_hash text,
  p_rollback_requirements_hash text,
  p_freshness_deadline timestamptz,
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare deliberation public.governance_deliberations%rowtype;
declare result_id uuid;
declare now_at timestamptz:=transaction_timestamp();
begin
  perform public.cognitive_verify_service_token(
    'deliberation_orchestrator',p_service_identity_token
  );
  select * into deliberation from public.governance_deliberations
  where id=p_deliberation_id for update;
  if deliberation.id is null
     or deliberation.status<>'collecting_assessments'
     or now_at>=deliberation.deadline_at
     or p_packet_hash !~ '^[a-f0-9]{64}$'
     or p_source_commit<>deliberation.source_commit
     or p_architecture_graph_digest<>deliberation.architecture_graph_digest
     or p_research_claim_hashes is null
     or cardinality(p_research_claim_hashes) not between 0 and 128
     or exists (
       select 1 from unnest(p_research_claim_hashes) hash_value
       where hash_value !~ '^[a-f0-9]{64}$'
     )
     or p_provider_state_hash !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_known_unknowns)<>'object'
     or pg_column_size(p_known_unknowns)>32768
     or not public.cognitive_json_is_sanitized(p_known_unknowns)
     or p_approval_level not in ('none','owner','external')
     or p_budget_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_requirements_hash !~ '^[a-f0-9]{64}$'
     or p_freshness_deadline<=now_at
     or p_freshness_deadline>least(
       deliberation.deadline_at,now_at+interval '7 days'
     ) then
    raise exception 'governance_evidence_packet_rejected' using errcode='P0001';
  end if;
  insert into public.governance_evidence_packets(
    deliberation_id,task_id,project_id,platform,environment,packet_hash,
    source_commit,architecture_graph_digest,research_claim_hashes,
    provider_state_hash,known_unknowns,approval_level,budget_hash,
    rollback_requirements_hash,freshness_deadline
  ) values (
    deliberation.id,deliberation.task_id,deliberation.project_id,
    deliberation.platform,deliberation.environment,p_packet_hash,p_source_commit,
    p_architecture_graph_digest,p_research_claim_hashes,p_provider_state_hash,
    p_known_unknowns,p_approval_level,p_budget_hash,
    p_rollback_requirements_hash,p_freshness_deadline
  ) returning id into result_id;
  return result_id;
end;
$$;

create function public.governance_advance_deliberation_to_voting(
  p_deliberation_id uuid,
  p_transition_hash text,
  p_service_identity_token text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare deliberation public.governance_deliberations%rowtype;
declare changed integer;
begin
  perform public.cognitive_verify_service_token(
    'deliberation_orchestrator',p_service_identity_token
  );
  select * into deliberation from public.governance_deliberations
  where id=p_deliberation_id for update;
  if deliberation.id is null
     or deliberation.status<>'collecting_assessments'
     or transaction_timestamp()>=deliberation.deadline_at
     or p_transition_hash !~ '^[a-f0-9]{64}$'
     or not exists (
       select 1 from public.governance_evidence_packets packet
       where packet.deliberation_id=deliberation.id
         and transaction_timestamp()<packet.freshness_deadline
     )
     or exists (
       select 1 from unnest(array[
         'product_user_experience','security_privacy',
         'reliability_release','adversarial_red_team'
       ]) mandatory_role(role_key)
       where not exists (
         select 1
         from public.governance_assessments assessment
         join public.governance_council_roles role
           on role.id=assessment.council_role_id
         join public.governance_council_assignments assignment
           on assignment.id=assessment.assignment_id
          and assignment.council_role_id=assessment.council_role_id
         where assessment.deliberation_id=deliberation.id
           and assessment.round_number=1 and assessment.blind_submission
           and role.role_key=mandatory_role.role_key
           and assignment.conflict_state='clear'
       )
     )
     or not exists (
       select 1 from public.governance_proposals proposal
       where proposal.deliberation_id=deliberation.id
         and proposal.option_kind='no_action'
     )
     or not exists (
       select 1 from public.governance_proposals proposal
       where proposal.deliberation_id=deliberation.id
         and proposal.option_kind='minimal_repair'
     )
     or not exists (
       select 1 from public.governance_proposals proposal
       where proposal.deliberation_id=deliberation.id
         and proposal.option_kind='moderate_improvement'
     ) then
    raise exception 'governance_deliberation_voting_rejected' using errcode='P0001';
  end if;
  update public.governance_deliberations
  set status='voting',updated_at=transaction_timestamp()
  where id=deliberation.id and status='collecting_assessments';
  get diagnostics changed=row_count;
  if changed<>1 then
    raise exception 'governance_deliberation_voting_rejected' using errcode='P0001';
  end if;
  insert into public.governance_audit_events(
    task_id,project_id,platform,environment,entity_type,entity_id,event_type,
    actor_identity_hash,evidence_hash
  ) values (
    deliberation.task_id,deliberation.project_id,deliberation.platform,
    deliberation.environment,'deliberation',deliberation.id,'voting_opened',
    encode(extensions.digest(convert_to(
      'deliberation_orchestrator','UTF8'
    ),'sha256'),'hex'),p_transition_hash
  );
  return true;
end;
$$;

create function public.governance_assign_council_member(
  p_deliberation_id uuid,
  p_council_role_id uuid,
  p_participant_identity_hash text,
  p_model_identity_hash text,
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare deliberation public.governance_deliberations%rowtype;
declare result_id uuid;
begin
  perform public.cognitive_verify_service_token(
    'deliberation_orchestrator',p_service_identity_token
  );
  select * into deliberation from public.governance_deliberations
  where id=p_deliberation_id for update;
  if deliberation.id is null
     or deliberation.status<>'collecting_assessments'
     or transaction_timestamp()>=deliberation.deadline_at
     or p_participant_identity_hash !~ '^[a-f0-9]{64}$'
     or p_model_identity_hash !~ '^[a-f0-9]{64}$'
     or not exists (
       select 1 from public.governance_council_roles role
       where role.id=p_council_role_id
         and role.constitution_version_id=deliberation.constitution_version_id
         and role.task_id=deliberation.task_id
         and role.project_id=deliberation.project_id
         and role.platform=deliberation.platform
         and role.environment=deliberation.environment
     ) then
    raise exception 'governance_council_assignment_rejected' using errcode='P0001';
  end if;
  insert into public.governance_council_assignments(
    deliberation_id,council_role_id,task_id,project_id,platform,environment,
    participant_identity_hash,model_identity_hash,conflict_state
  ) values (
    deliberation.id,p_council_role_id,deliberation.task_id,
    deliberation.project_id,deliberation.platform,deliberation.environment,
    p_participant_identity_hash,p_model_identity_hash,'clear'
  ) returning id into result_id;
  return result_id;
end;
$$;

create function public.governance_record_blind_assessment(
  p_assignment_id uuid,
  p_evidence_packet_id uuid,
  p_round_number integer,
  p_assessment_hash text,
  p_output_schema_hash text,
  p_confidence numeric,
  p_uncertainty text,
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare assignment public.governance_council_assignments%rowtype;
declare packet public.governance_evidence_packets%rowtype;
declare result_id uuid;
begin
  perform public.cognitive_verify_service_token(
    'deliberation_orchestrator',p_service_identity_token
  );
  select * into assignment from public.governance_council_assignments
  where id=p_assignment_id;
  select * into packet from public.governance_evidence_packets
  where id=p_evidence_packet_id
    and deliberation_id=assignment.deliberation_id;
  if assignment.id is null or packet.id is null
     or assignment.conflict_state<>'clear'
     or not exists (
       select 1 from public.governance_deliberations deliberation
       where deliberation.id=assignment.deliberation_id
         and deliberation.status='collecting_assessments'
         and transaction_timestamp()<deliberation.deadline_at
     )
     or p_round_number not between 1 and 4
     or p_assessment_hash !~ '^[a-f0-9]{64}$'
     or p_output_schema_hash !~ '^[a-f0-9]{64}$'
     or p_confidence not between 0 and 1
     or p_uncertainty not in ('low','medium','high','blocked')
     or transaction_timestamp()>=packet.freshness_deadline
     or (
       p_round_number=1 and exists (
         select 1 from public.governance_assessments assessment
         where assessment.deliberation_id=assignment.deliberation_id
           and assessment.round_number=1
           and assessment.revealed_at is not null
       )
     ) then
    raise exception 'governance_assessment_rejected' using errcode='P0001';
  end if;
  insert into public.governance_assessments(
    deliberation_id,evidence_packet_id,council_role_id,assignment_id,
    task_id,project_id,platform,environment,round_number,assessment_hash,
    output_schema_hash,confidence,uncertainty,blind_submission
  ) values (
    assignment.deliberation_id,packet.id,assignment.council_role_id,assignment.id,
    assignment.task_id,assignment.project_id,assignment.platform,
    assignment.environment,p_round_number,p_assessment_hash,p_output_schema_hash,
    p_confidence,p_uncertainty,p_round_number=1
  ) returning id into result_id;
  return result_id;
end;
$$;

create function public.governance_record_proposal(
  p_deliberation_id uuid,
  p_option_kind text,
  p_proposal_hash text,
  p_user_value_score numeric,
  p_risk_score numeric,
  p_reversibility text,
  p_cost_estimate numeric,
  p_proof_burden text,
  p_rollback_hash text,
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare deliberation public.governance_deliberations%rowtype;
declare result_id uuid;
begin
  perform public.cognitive_verify_service_token(
    'deliberation_orchestrator',p_service_identity_token
  );
  select * into deliberation from public.governance_deliberations
  where id=p_deliberation_id;
  if deliberation.id is null
     or deliberation.status not in ('collecting_assessments','criticizing')
     or transaction_timestamp()>=deliberation.deadline_at
     or p_option_kind not in (
       'no_action','minimal_repair','moderate_improvement','larger_redesign'
     )
     or p_proposal_hash !~ '^[a-f0-9]{64}$'
     or p_user_value_score not between 0 and 100
     or p_risk_score not between 0 and 100
     or p_reversibility not in ('full','bounded','difficult','irreversible')
     or p_cost_estimate not between 0 and 10000
     or p_proof_burden not in ('source','provider','physical','legal')
     or p_rollback_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'governance_proposal_rejected' using errcode='P0001';
  end if;
  insert into public.governance_proposals(
    deliberation_id,task_id,project_id,platform,environment,option_kind,
    proposal_hash,user_value_score,risk_score,reversibility,cost_estimate,
    proof_burden,rollback_hash
  ) values (
    deliberation.id,deliberation.task_id,deliberation.project_id,
    deliberation.platform,deliberation.environment,p_option_kind,p_proposal_hash,
    p_user_value_score,p_risk_score,p_reversibility,p_cost_estimate,
    p_proof_burden,p_rollback_hash
  ) returning id into result_id;
  return result_id;
end;
$$;

create function public.governance_record_vote(
  p_assignment_id uuid,
  p_proposal_id uuid,
  p_position text,
  p_rationale_hash text,
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare assignment public.governance_council_assignments%rowtype;
declare proposal public.governance_proposals%rowtype;
declare result_id uuid;
begin
  perform public.cognitive_verify_service_token(
    'deliberation_orchestrator',p_service_identity_token
  );
  select * into assignment from public.governance_council_assignments
  where id=p_assignment_id;
  select * into proposal from public.governance_proposals
  where id=p_proposal_id and deliberation_id=assignment.deliberation_id;
  if assignment.id is null or proposal.id is null
     or assignment.conflict_state<>'clear'
     or not exists (
       select 1 from public.governance_deliberations deliberation
       where deliberation.id=assignment.deliberation_id
         and deliberation.status='voting'
         and transaction_timestamp()<deliberation.deadline_at
     )
     or p_position not in ('support','oppose','abstain')
     or p_rationale_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'governance_vote_rejected' using errcode='P0001';
  end if;
  insert into public.governance_votes(
    deliberation_id,proposal_id,council_role_id,assignment_id,task_id,
    project_id,platform,environment,participant_identity_hash,position,
    rationale_hash
  ) values (
    assignment.deliberation_id,proposal.id,assignment.council_role_id,
    assignment.id,assignment.task_id,assignment.project_id,assignment.platform,
    assignment.environment,assignment.participant_identity_hash,p_position,
    p_rationale_hash
  ) returning id into result_id;
  return result_id;
end;
$$;

create function public.governance_record_veto(
  p_assignment_id uuid,
  p_proposal_id uuid,
  p_veto_scope text,
  p_reason_hash text,
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare assignment public.governance_council_assignments%rowtype;
declare proposal public.governance_proposals%rowtype;
declare result_id uuid;
begin
  perform public.cognitive_verify_service_token(
    'deliberation_orchestrator',p_service_identity_token
  );
  select * into assignment from public.governance_council_assignments
  where id=p_assignment_id;
  select * into proposal from public.governance_proposals
  where id=p_proposal_id and deliberation_id=assignment.deliberation_id;
  if assignment.id is null or proposal.id is null
     or assignment.conflict_state<>'clear'
     or not exists (
       select 1 from public.governance_deliberations deliberation
       where deliberation.id=assignment.deliberation_id
         and deliberation.status='voting'
         and transaction_timestamp()<deliberation.deadline_at
     )
     or p_reason_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'governance_veto_rejected' using errcode='P0001';
  end if;
  insert into public.governance_vetoes(
    deliberation_id,proposal_id,council_role_id,task_id,project_id,
    platform,environment,veto_scope,mandatory,reason_hash,status
  ) values (
    assignment.deliberation_id,proposal.id,assignment.council_role_id,
    assignment.task_id,assignment.project_id,assignment.platform,
    assignment.environment,p_veto_scope,true,p_reason_hash,'active'
  ) returning id into result_id;
  return result_id;
end;
$$;

create function public.governance_record_dissent(
  p_assignment_id uuid,
  p_proposal_id uuid,
  p_dissent_hash text,
  p_evidence_hash text,
  p_predicted_risk text,
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare assignment public.governance_council_assignments%rowtype;
declare proposal public.governance_proposals%rowtype;
declare result_id uuid;
begin
  perform public.cognitive_verify_service_token(
    'deliberation_orchestrator',p_service_identity_token
  );
  select * into assignment from public.governance_council_assignments
  where id=p_assignment_id;
  select * into proposal from public.governance_proposals
  where id=p_proposal_id and deliberation_id=assignment.deliberation_id;
  if assignment.id is null or proposal.id is null
     or assignment.conflict_state<>'clear'
     or not exists (
       select 1 from public.governance_deliberations deliberation
       where deliberation.id=assignment.deliberation_id
         and deliberation.status='voting'
         and transaction_timestamp()<deliberation.deadline_at
     )
     or p_dissent_hash !~ '^[a-f0-9]{64}$'
     or p_evidence_hash !~ '^[a-f0-9]{64}$'
     or p_predicted_risk not in ('low','medium','high','critical') then
    raise exception 'governance_dissent_rejected' using errcode='P0001';
  end if;
  insert into public.governance_dissent_reports(
    deliberation_id,proposal_id,council_role_id,task_id,project_id,
    platform,environment,dissent_hash,evidence_hash,predicted_risk,
    resolution_state
  ) values (
    assignment.deliberation_id,proposal.id,assignment.council_role_id,
    assignment.task_id,assignment.project_id,assignment.platform,
    assignment.environment,p_dissent_hash,p_evidence_hash,p_predicted_risk,
    'unresolved'
  ) returning id into result_id;
  return result_id;
end;
$$;

create function public.governance_record_stakeholder_impact(
  p_proposal_id uuid,
  p_stakeholder_key text,
  p_impact_level text,
  p_impact_hash text,
  p_mitigation_hash text,
  p_service_identity_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare proposal public.governance_proposals%rowtype;
declare result_id uuid;
begin
  perform public.cognitive_verify_service_token(
    'deliberation_orchestrator',p_service_identity_token
  );
  select * into proposal from public.governance_proposals
  where id=p_proposal_id;
  if proposal.id is null
     or not exists (
       select 1 from public.governance_deliberations deliberation
       where deliberation.id=proposal.deliberation_id
         and deliberation.status='voting'
         and transaction_timestamp()<deliberation.deadline_at
     )
     or p_stakeholder_key not in (
       'normal_users','creators','subscribers_buyers','minors_safety_sensitive',
       'accessibility_users','moderators_admins','owner_operations','android',
       'ios','web','privacy','security','support','infrastructure_cost',
       'provider_cost','legal_compliance'
     )
     or p_impact_level not in ('positive','neutral','negative','unknown')
     or p_impact_hash !~ '^[a-f0-9]{64}$'
     or (
       p_mitigation_hash is not null
       and p_mitigation_hash !~ '^[a-f0-9]{64}$'
     ) then
    raise exception 'governance_stakeholder_impact_rejected' using errcode='P0001';
  end if;
  insert into public.governance_stakeholder_impacts(
    deliberation_id,proposal_id,task_id,project_id,platform,environment,
    stakeholder_key,impact_level,impact_hash,mitigation_hash
  ) values (
    proposal.deliberation_id,proposal.id,proposal.task_id,proposal.project_id,
    proposal.platform,proposal.environment,p_stakeholder_key,p_impact_level,
    p_impact_hash,p_mitigation_hash
  ) returning id into result_id;
  return result_id;
end;
$$;

do $$
declare signature regprocedure;
begin
  foreach signature in array array[
    'public.governance_open_deliberation(uuid,uuid,public.cognitive_platform,public.cognitive_environment,uuid,text,text,text,text,text,numeric,timestamptz,text)'::regprocedure,
    'public.governance_record_evidence_packet(uuid,text,text,text,text[],text,jsonb,text,text,text,timestamptz,text)'::regprocedure,
    'public.governance_advance_deliberation_to_voting(uuid,text,text)'::regprocedure,
    'public.governance_assign_council_member(uuid,uuid,text,text,text)'::regprocedure,
    'public.governance_record_blind_assessment(uuid,uuid,integer,text,text,numeric,text,text)'::regprocedure,
    'public.governance_record_proposal(uuid,text,text,numeric,numeric,text,numeric,text,text,text)'::regprocedure,
    'public.governance_record_vote(uuid,uuid,text,text,text)'::regprocedure,
    'public.governance_record_veto(uuid,uuid,text,text,text)'::regprocedure,
    'public.governance_record_dissent(uuid,uuid,text,text,text,text)'::regprocedure,
    'public.governance_record_stakeholder_impact(uuid,text,text,text,text,text)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public,anon,authenticated',signature);
    execute format('grant execute on function %s to service_role',signature);
  end loop;
end
$$;
