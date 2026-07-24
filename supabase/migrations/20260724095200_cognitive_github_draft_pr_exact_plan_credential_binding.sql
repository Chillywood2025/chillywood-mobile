-- Bind each GitHub draft-PR capability to both:
--   1. the exact Owner-approved content/title/commit/body/path/base/prior/test plan;
--   2. the exact accepted GitHub App installation and least-privilege scope.
-- Only public installation identity and scope hashes are stored. Private keys
-- and installation tokens remain outside Postgres.

do $$
begin
  if exists (
    select 1
    from public.cognitive_capabilities
    where operation = 'github_open_draft_pr'
  ) or exists (
    select 1 from public.cognitive_github_draft_pr_authorizations
  ) then
    raise exception 'github_draft_pr_binding_requires_empty_runtime_state'
      using errcode = 'P0001';
  end if;
end;
$$;

alter table public.cognitive_capabilities
  add column github_credential_attestation_id uuid,
  add column github_credential_public_fingerprint_hash text,
  add column github_credential_scope_manifest_hash text,
  add column github_credential_expires_at timestamptz,
  add constraint cognitive_capabilities_github_credential_binding_check
  check (
    (
      operation <> 'github_open_draft_pr'
      and github_credential_attestation_id is null
      and github_credential_public_fingerprint_hash is null
      and github_credential_scope_manifest_hash is null
      and github_credential_expires_at is null
    )
    or (
      operation = 'github_open_draft_pr'
      and github_credential_attestation_id is not null
      and github_credential_public_fingerprint_hash ~ '^[a-f0-9]{64}$'
      and github_credential_scope_manifest_hash =
        'ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554'
      and github_credential_expires_at is not null
      and expires_at <= github_credential_expires_at
    )
  ),
  add foreign key (
    github_credential_attestation_id,task_id,project_id,platform,environment
  ) references public.cognitive_level01_credential_attestations(
    id,task_id,project_id,platform,environment
  );

create table public.cognitive_github_draft_pr_plan_bindings (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null unique,
  capability_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  credential_attestation_id uuid not null,
  credential_public_fingerprint_hash text not null check (
    credential_public_fingerprint_hash ~ '^[a-f0-9]{64}$'
  ),
  credential_scope_manifest_hash text not null check (
    credential_scope_manifest_hash =
      'ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554'
  ),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  title_hash text not null check (title_hash ~ '^[a-f0-9]{64}$'),
  commit_message_hash text not null check (
    commit_message_hash ~ '^[a-f0-9]{64}$'
  ),
  pr_body_hash text not null check (pr_body_hash ~ '^[a-f0-9]{64}$'),
  path_hash text not null check (path_hash ~ '^[a-f0-9]{64}$'),
  base_branch_hash text not null check (base_branch_hash ~ '^[a-f0-9]{64}$'),
  branch_hash text not null check (branch_hash ~ '^[a-f0-9]{64}$'),
  repository_hash text not null check (repository_hash ~ '^[a-f0-9]{64}$'),
  prior_state_hash text not null check (prior_state_hash ~ '^[a-f0-9]{64}$'),
  required_tests_hash text not null check (
    required_tests_hash ~ '^[a-f0-9]{64}$'
  ),
  plan_contract_hash text not null unique check (
    plan_contract_hash ~ '^[a-f0-9]{64}$'
  ),
  request_hash text not null unique check (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  unique (id,task_id,project_id,platform,environment),
  foreign key (
    authorization_id,task_id,project_id,platform,environment
  ) references public.cognitive_github_draft_pr_authorizations(
    id,task_id,project_id,platform,environment
  ),
  foreign key (
    capability_id,task_id,project_id,platform,environment
  ) references public.cognitive_capabilities(
    id,task_id,project_id,platform,environment
  ),
  foreign key (
    credential_attestation_id,task_id,project_id,platform,environment
  ) references public.cognitive_level01_credential_attestations(
    id,task_id,project_id,platform,environment
  )
);

alter table public.cognitive_github_draft_pr_plan_bindings
  enable row level security;
alter table public.cognitive_github_draft_pr_plan_bindings
  force row level security;
revoke all on table public.cognitive_github_draft_pr_plan_bindings
from public,anon,authenticated,service_role;
grant select on table public.cognitive_github_draft_pr_plan_bindings
to authenticated,service_role;
create policy cognitive_github_draft_pr_plan_bindings_exact_read
  on public.cognitive_github_draft_pr_plan_bindings
  for select to authenticated
  using (
    (select public.cognitive_can_read_scope(project_id,task_id,platform))
  );
create trigger cognitive_github_draft_pr_plan_bindings_immutable
before update or delete on public.cognitive_github_draft_pr_plan_bindings
for each row execute function public.reject_cognitive_evidence_mutation();

create function public.cognitive_github_draft_pr_guard_attestation_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.credential_kind = 'github_draft_pr' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      concat_ws(
        '|','github-draft-pr-attestation',new.task_id::text,
        new.project_id::text,new.platform::text,new.environment::text
      ),
      0
    ));
  end if;
  if new.credential_kind = 'github_draft_pr'
     and (
       new.scope_manifest_hash <>
         'ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554'
       or new.private_material_stored
     ) then
    raise exception 'github_draft_pr_attestation_scope_rejected'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function
  public.cognitive_github_draft_pr_guard_attestation_scope()
from public,anon,authenticated,service_role;
create trigger cognitive_github_draft_pr_attestation_scope_guard
before insert on public.cognitive_level01_credential_attestations
for each row execute function
  public.cognitive_github_draft_pr_guard_attestation_scope();

create function public.cognitive_github_draft_pr_runtime_attestation_is_current(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_attestation_id uuid,
  p_public_fingerprint_hash text,
  p_scope_manifest_hash text,
  p_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select attestation.id = p_attestation_id
      and attestation.state = 'configured'
      and attestation.public_fingerprint_hash = p_public_fingerprint_hash
      and attestation.scope_manifest_hash = p_scope_manifest_hash
      and attestation.scope_manifest_hash =
        'ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554'
      and attestation.verified_at <= p_at
      and attestation.expires_at > p_at
    from public.cognitive_level01_credential_attestations attestation
    where attestation.task_id = p_task_id
      and attestation.project_id = p_project_id
      and attestation.platform = p_platform
      and attestation.environment = p_environment
      and attestation.credential_kind = 'github_draft_pr'
    order by attestation.verified_at desc,attestation.id desc
    limit 1
  ),false)
$$;
revoke all on function
  public.cognitive_github_draft_pr_runtime_attestation_is_current(
    uuid,uuid,public.cognitive_platform,public.cognitive_environment,
    uuid,text,text,timestamptz
  )
from public,anon,authenticated,service_role;

create function public.cognitive_github_draft_pr_bind_capability_credential()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_attestation public.cognitive_level01_credential_attestations%rowtype;
  now_at timestamptz := transaction_timestamp();
begin
  if new.operation <> 'github_open_draft_pr' then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(
      '|','github-draft-pr-attestation',new.task_id::text,
      new.project_id::text,new.platform::text,new.environment::text
    ),
    0
  ));
  select * into current_attestation
  from public.cognitive_level01_credential_attestations attestation
  where attestation.task_id = new.task_id
    and attestation.project_id = new.project_id
    and attestation.platform = new.platform
    and attestation.environment = new.environment
    and attestation.credential_kind = 'github_draft_pr'
  order by attestation.verified_at desc,attestation.id desc
  limit 1
  for share;
  if current_attestation.id is null
     or current_attestation.state <> 'configured'
     or current_attestation.scope_manifest_hash <>
       'ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554'
     or now_at < current_attestation.verified_at
     or now_at >= current_attestation.expires_at
     or new.expires_at > current_attestation.expires_at then
    raise exception 'github_draft_pr_capability_credential_rejected'
      using errcode = 'P0001';
  end if;
  new.github_credential_attestation_id := current_attestation.id;
  new.github_credential_public_fingerprint_hash :=
    current_attestation.public_fingerprint_hash;
  new.github_credential_scope_manifest_hash :=
    current_attestation.scope_manifest_hash;
  new.github_credential_expires_at := current_attestation.expires_at;
  return new;
end;
$$;
revoke all on function
  public.cognitive_github_draft_pr_bind_capability_credential()
from public,anon,authenticated,service_role;
create trigger cognitive_github_draft_pr_capability_credential_guard
before insert on public.cognitive_capabilities
for each row execute function
  public.cognitive_github_draft_pr_bind_capability_credential();

create function public.cognitive_github_draft_pr_plan_contract_hash(
  p_repository_hash text,
  p_canary_key text,
  p_base_branch_hash text,
  p_base_commit text,
  p_branch_hash text,
  p_path_hash text,
  p_prior_state_hash text,
  p_content_hash text,
  p_title_hash text,
  p_commit_message_hash text,
  p_pr_body_hash text,
  p_required_tests_hash text,
  p_task_id uuid,
  p_project_id uuid,
  p_approval_scope_hash text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(concat_ws(
    '|','github-draft-pr-plan-v2',p_repository_hash,p_canary_key,
    p_base_branch_hash,p_base_commit,p_branch_hash,p_path_hash,
    p_prior_state_hash,p_content_hash,p_title_hash,p_commit_message_hash,
    p_pr_body_hash,p_required_tests_hash,p_task_id::text,p_project_id::text,
    p_approval_scope_hash
  ),'UTF8'),'sha256'),'hex')
$$;
revoke all on function public.cognitive_github_draft_pr_plan_contract_hash(
  text,text,text,text,text,text,text,text,text,text,text,text,uuid,uuid,text
) from public,anon,authenticated,service_role;

create function public.cognitive_github_draft_pr_request_hash(
  p_plan_contract_hash text,
  p_public_fingerprint_hash text,
  p_scope_manifest_hash text,
  p_approval_scope_hash text,
  p_capability_id text,
  p_call_id text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(concat_ws(
    '|','github-draft-pr-request-v2',p_plan_contract_hash,
    p_public_fingerprint_hash,p_scope_manifest_hash,p_approval_scope_hash,
    p_capability_id,p_call_id
  ),'UTF8'),'sha256'),'hex')
$$;
revoke all on function public.cognitive_github_draft_pr_request_hash(
  text,text,text,text,text,text
) from public,anon,authenticated,service_role;

alter function public.cognitive_consume_github_draft_pr_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,
  text,text,text,uuid,text,text,text,text,text
) rename to cognitive_consume_github_draft_pr_capability_pre_exact_binding;
revoke all on function
  public.cognitive_consume_github_draft_pr_capability_pre_exact_binding(
    text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
    public.cognitive_environment,text,text,text,uuid,bigint,numeric,
    text,text,text,uuid,text,text,text,text,text
  )
from public,anon,authenticated,service_role;

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
  p_content_hash text,
  p_title_hash text,
  p_commit_message_hash text,
  p_pr_body_hash text,
  p_path_hash text,
  p_base_branch_hash text,
  p_branch_hash text,
  p_repository_hash text,
  p_prior_state_hash text,
  p_plan_contract_hash text,
  p_runtime_public_fingerprint_hash text,
  p_runtime_scope_manifest_hash text,
  p_service_identity_token text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability_value public.cognitive_capabilities%rowtype;
  authorization_value public.cognitive_github_draft_pr_authorizations%rowtype;
  sequence_value integer;
  now_at timestamptz := transaction_timestamp();
begin
  perform public.cognitive_verify_service_token(
    'cognitive_github_draft_pr_broker',p_service_identity_token
  );
  select * into capability_value
  from public.cognitive_capabilities capability
  where capability.capability_id = p_capability_id
  for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(
      '|','github-draft-pr-attestation',p_task_id::text,p_project_id::text,
      p_platform::text,p_environment::text
    ),
    0
  ));

  if capability_value.id is null
     or p_runtime_public_fingerprint_hash !~ '^[a-f0-9]{64}$'
     or p_runtime_scope_manifest_hash <>
       'ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554'
     or capability_value.github_credential_attestation_id is null
     or capability_value.github_credential_public_fingerprint_hash <>
       p_runtime_public_fingerprint_hash
     or capability_value.github_credential_scope_manifest_hash <>
       p_runtime_scope_manifest_hash
     or now_at >= capability_value.github_credential_expires_at
     or not public.cognitive_github_draft_pr_runtime_attestation_is_current(
       p_task_id,p_project_id,p_platform,p_environment,
       capability_value.github_credential_attestation_id,
       p_runtime_public_fingerprint_hash,p_runtime_scope_manifest_hash,now_at
     )
     or p_content_hash !~ '^[a-f0-9]{64}$'
     or p_title_hash !~ '^[a-f0-9]{64}$'
     or p_commit_message_hash !~ '^[a-f0-9]{64}$'
     or p_pr_body_hash !~ '^[a-f0-9]{64}$'
     or p_pr_body_hash <> encode(extensions.digest(convert_to(
       'Governed Chi''llywood Level 0/1 canary: ' ||
       case
         when p_path ~ '^docs/intelligence/canaries/' then
           'documentation_draft_pr'
         when p_path ~ '^scripts/cognitive-canaries/' then
           'test_only_draft_pr'
         else 'low_risk_source_draft_pr'
       end ||
       '. Draft only; evaluator review required. No merge authority.',
       'UTF8'
     ),'sha256'),'hex')
     or p_path_hash <> encode(extensions.digest(
       convert_to(p_path,'UTF8'),'sha256'
     ),'hex')
     or p_base_branch_hash <> encode(extensions.digest(
       convert_to('codex/cognitive-level01-operationalization','UTF8'),
       'sha256'
     ),'hex')
     or p_branch_hash <> encode(extensions.digest(
       convert_to(p_branch_name,'UTF8'),'sha256'
     ),'hex')
     or p_repository_hash <> encode(extensions.digest(
       convert_to(p_repository_full_name,'UTF8'),'sha256'
     ),'hex')
     or p_prior_state_hash <> encode(extensions.digest(convert_to(
       concat_ws('|',p_base_commit,p_path,p_prior_blob_sha),'UTF8'
     ),'sha256'),'hex')
     or p_prior_state_hash <> p_source_state_hash
     or p_plan_contract_hash <> public.cognitive_github_draft_pr_plan_contract_hash(
       p_repository_hash,
       case
         when p_path ~ '^docs/intelligence/canaries/' then
           'documentation_draft_pr'
         when p_path ~ '^scripts/cognitive-canaries/' then
           'test_only_draft_pr'
         else 'low_risk_source_draft_pr'
       end,
       p_base_branch_hash,p_base_commit,p_branch_hash,p_path_hash,
       p_prior_state_hash,p_content_hash,p_title_hash,p_commit_message_hash,
       p_pr_body_hash,p_required_tests_hash,p_task_id,p_project_id,
       p_approval_scope_hash
     )
     or p_plan_contract_hash <> p_plan_snapshot_hash
     or capability_value.plan_snapshot_hash <> p_plan_contract_hash
     or p_request_hash <> public.cognitive_github_draft_pr_request_hash(
       p_plan_contract_hash,p_runtime_public_fingerprint_hash,
       p_runtime_scope_manifest_hash,p_approval_scope_hash,p_capability_id,
       p_call_id
     ) then
    raise exception 'github_draft_pr_exact_binding_rejected'
      using errcode = 'P0001';
  end if;

  sequence_value :=
    public.cognitive_consume_github_draft_pr_capability_pre_exact_binding(
      p_capability_id,p_opaque_bearer,p_opaque_nonce,p_call_id,p_task_id,
      p_project_id,p_repository_full_name,p_branch_name,p_platform,
      p_environment,p_provider,p_operation,p_path,p_resource_lease_id,
      p_bytes,p_cost,p_approval_scope_hash,p_plan_snapshot_hash,p_request_hash,
      p_preflight_receipt_id,p_required_tests_hash,p_source_state_hash,
      p_base_commit,p_prior_blob_sha,p_service_identity_token
    );

  select * into authorization_value
  from public.cognitive_github_draft_pr_authorizations authorization_record
  where authorization_record.capability_id = capability_value.id
    and authorization_record.call_id = p_call_id
  for share;
  if authorization_value.id is null then
    raise exception 'github_draft_pr_exact_binding_rejected'
      using errcode = 'P0001';
  end if;
  insert into public.cognitive_github_draft_pr_plan_bindings(
    authorization_id,capability_id,task_id,project_id,platform,environment,
    credential_attestation_id,credential_public_fingerprint_hash,
    credential_scope_manifest_hash,content_hash,title_hash,
    commit_message_hash,pr_body_hash,path_hash,base_branch_hash,branch_hash,
    repository_hash,prior_state_hash,required_tests_hash,plan_contract_hash,
    request_hash
  ) values (
    authorization_value.id,capability_value.id,p_task_id,p_project_id,
    p_platform,p_environment,capability_value.github_credential_attestation_id,
    p_runtime_public_fingerprint_hash,p_runtime_scope_manifest_hash,
    p_content_hash,p_title_hash,p_commit_message_hash,p_pr_body_hash,
    p_path_hash,p_base_branch_hash,p_branch_hash,p_repository_hash,
    p_prior_state_hash,p_required_tests_hash,p_plan_contract_hash,p_request_hash
  );
  return sequence_value;
end;
$$;
revoke all on function public.cognitive_consume_github_draft_pr_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,
  text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,
  text,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.cognitive_consume_github_draft_pr_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,
  text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,
  text,text,text,text,text,text
) to service_role;

alter function public.cognitive_accept_github_draft_pr_tool_result(
  text,text,text,text,jsonb,text,text,text,text,text
) rename to cognitive_accept_github_draft_pr_tool_result_pre_exact_binding;
revoke all on function
  public.cognitive_accept_github_draft_pr_tool_result_pre_exact_binding(
    text,text,text,text,jsonb,text,text,text,text,text
  )
from public,anon,authenticated,service_role;

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
  p_runtime_public_fingerprint_hash text,
  p_runtime_scope_manifest_hash text,
  p_service_identity_token text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability_value public.cognitive_capabilities%rowtype;
  authorization_value public.cognitive_github_draft_pr_authorizations%rowtype;
  binding_value public.cognitive_github_draft_pr_plan_bindings%rowtype;
  now_at timestamptz := transaction_timestamp();
begin
  perform public.cognitive_verify_service_token(
    'cognitive_github_draft_pr_broker',p_service_identity_token
  );
  select * into capability_value
  from public.cognitive_capabilities capability
  where capability.capability_id = p_capability_id
  for update;
  if capability_value.id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      concat_ws(
        '|','github-draft-pr-attestation',capability_value.task_id::text,
        capability_value.project_id::text,capability_value.platform::text,
        capability_value.environment::text
      ),
      0
    ));
  end if;
  select * into authorization_value
  from public.cognitive_github_draft_pr_authorizations authorization_record
  where authorization_record.capability_id = capability_value.id
    and authorization_record.call_id = p_call_id
  for share;
  select * into binding_value
  from public.cognitive_github_draft_pr_plan_bindings binding
  where binding.authorization_id = authorization_value.id
  for share;
  if binding_value.id is null
     or binding_value.credential_attestation_id <>
       capability_value.github_credential_attestation_id
     or binding_value.credential_public_fingerprint_hash <>
       p_runtime_public_fingerprint_hash
     or binding_value.credential_scope_manifest_hash <>
       p_runtime_scope_manifest_hash
     or not public.cognitive_github_draft_pr_runtime_attestation_is_current(
       capability_value.task_id,capability_value.project_id,
       capability_value.platform,capability_value.environment,
       binding_value.credential_attestation_id,
       p_runtime_public_fingerprint_hash,p_runtime_scope_manifest_hash,now_at
     ) then
    raise exception 'github_draft_pr_runtime_credential_rotated'
      using errcode = 'P0001';
  end if;
  return public.cognitive_accept_github_draft_pr_tool_result_pre_exact_binding(
    p_capability_id,p_call_id,p_opaque_bearer,p_opaque_nonce,
    p_result_envelope,p_before_state_hash,p_after_state_hash,p_diff_hash,
    p_final_commit,p_service_identity_token
  );
end;
$$;
revoke all on function public.cognitive_accept_github_draft_pr_tool_result(
  text,text,text,text,jsonb,text,text,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.cognitive_accept_github_draft_pr_tool_result(
  text,text,text,text,jsonb,text,text,text,text,text,text,text
) to service_role;

comment on table public.cognitive_github_draft_pr_plan_bindings is
  'Immutable exact-plan and accepted GitHub App installation binding. Stores hashes only; never private keys or installation tokens.';
comment on function public.cognitive_consume_github_draft_pr_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,uuid,bigint,numeric,
  text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,
  text,text,text,text,text,text
) is
  'Consumes one draft-only capability after recomputing its exact Owner-approved plan and matching the current accepted GitHub App installation/scope.';
