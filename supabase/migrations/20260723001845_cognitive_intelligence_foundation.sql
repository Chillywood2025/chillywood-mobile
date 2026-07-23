-- Undeployed Cognitive Intelligence security-hardened scaffold.
-- LOCAL/DISPOSABLE DATABASES ONLY. No production scheduler, function, model,
-- provider credential, or execution authority is created by this migration.

create type public.cognitive_platform as enum ('shared', 'ios', 'android', 'web', 'unknown');
create type public.cognitive_environment as enum ('local', 'ci', 'preview');
create type public.cognitive_task_status as enum (
  'received', 'planning', 'awaiting_approval', 'approved', 'executing',
  'evaluating', 'completed', 'failed', 'cancelled', 'budget_exhausted',
  'rollback_pending', 'rollback_running', 'rollback_succeeded', 'rollback_failed',
  'quarantined', 'escalation_required'
);
create type public.cognitive_capability_status as enum ('active', 'revoked', 'exhausted', 'expired');
create type public.cognitive_evaluation_status as enum ('pass', 'fail', 'incomplete', 'blocked');
create type public.cognitive_data_class as enum (
  'non_personal_audit', 'operational_metadata', 'research_cache',
  'user_derived', 'security_evidence', 'legal_hold'
);

set check_function_bodies = false;

-- Extend the existing closed staff-permission vocabulary for source-manifest
-- readback. The normalizer remains fail-closed and this migration remains local.
create or replace function public.platform_staff_normalize_permission_key(p_permission_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(trim(coalesce(p_permission_key, ''))) = 'moderator_grants'
      then 'manage_moderators'
    when lower(trim(coalesce(p_permission_key, ''))) = any(array[
      'support_inbox','user_lookup','content_moderation','reports_review',
      'live_ops','billing_support_read','creator_support','legal_review',
      'evidence_preview','dmca_review','copyright_review','evidence_export',
      'legal_hold','legal_ops','emergency_break_glass','admin_grants',
      'manage_moderators','audit_review','security_review',
      'staff_permission_templates','legal_request_intake','admin.user.search',
      'admin.user.view','admin.user.suspend','admin.user.restore',
      'admin.support.view','admin.support.manage','admin.dmca.view',
      'admin.dmca.manage','admin.payment_status.view',
      'admin.refund_status.record','admin.profile_private.view',
      'admin.room_private.view','admin.chat_evidence.view',
      'admin.content.hide','admin.content.restore','admin.content.remove',
      'admin.comment.moderate','admin.room.moderate',
      'admin.live.force_end','admin.audit.view','admin.lower_role.manage',
      'admin.cognitive.read'
    ]::text[])
      then lower(trim(p_permission_key))
    else null
  end
$$;

create or replace function public.cognitive_text_has_secret(payload text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  candidate text := left(coalesce(payload, ''), 65536);
  decoded text;
  encoded text;
  embedded_decoded text;
  normalized text;
  octet integer;
  position_value integer;
  depth integer;
begin
  -- Walk a bounded decoding frontier instead of repeatedly appending the
  -- original encoded text. Six nested layers are inspected; a payload that
  -- remains encoded beyond that bound is rejected rather than retained.
  for depth in 0..5 loop
    decoded := '';
    position_value := 1;
    while position_value <= length(candidate) loop
      if substring(candidate from position_value for 1) = '%'
         and substring(candidate from position_value + 1 for 2) ~ '^[0-9A-Fa-f]{2}$' then
        begin
          octet := get_byte(decode(substring(candidate from position_value + 1 for 2), 'hex'), 0);
          decoded := decoded || chr(octet);
          position_value := position_value + 3;
        exception when others then
          decoded := decoded || substring(candidate from position_value for 1);
          position_value := position_value + 1;
        end;
      else
        decoded := decoded || substring(candidate from position_value for 1);
        position_value := position_value + 1;
      end if;
    end loop;
    candidate := decoded;
    normalized := lower(regexp_replace(candidate, '[^a-zA-Z0-9_=:/.?&+-]', '', 'g'));
    if candidate ~* '-----BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE)-----'
       or normalized ~* '(password|secret|token|authorization|cookie|service_?role|private_?key|api_?key|access_?key|refresh_?token)[:=][^,}]{4,}'
       or candidate ~* '\b(sk|rk)_(live|test)_[A-Za-z0-9_-]{12,}\b'
       or candidate ~ '(AKIA|ASIA)[A-Z0-9]{16}'
       or candidate ~* '(^|[^A-Za-z0-9_])(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})([^A-Za-z0-9_]|$)'
       or candidate ~* '\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b'
       or candidate ~* 'https?://[^/@:[:space:]]+:[^/@[:space:]]+@'
       or candidate ~* 'https?://[^?[:space:]]+\?[^[:space:]]*(token|signature|sig|key|credential)=' then
      return true;
    end if;

    -- Decode bounded base64/base64url fragments wherever they appear, not only
    -- when the complete caller string is encoded. The decoded text is scanned
    -- in the next bounded pass so nested/embedded credential-like values fail
    -- closed without retaining the rejected payload.
    embedded_decoded := '';
    for encoded in
      select (match_value)[1]
      from regexp_matches(
        candidate,
        '([A-Za-z0-9+/_-]{12,}={0,2})',
        'g'
      ) as match_value
      limit 128
    loop
      begin
        encoded := translate(encoded, '-_', '+/');
        encoded := encoded || repeat('=', (4 - (length(encoded) % 4)) % 4);
        decoded := convert_from(decode(encoded, 'base64'), 'UTF8');
        embedded_decoded := left(
          embedded_decoded || E'\n' || decoded,
          32768
        );
      exception when others then
        null;
      end;
    end loop;
    if embedded_decoded <> '' then
      if depth = 5 then
        return true;
      end if;
      candidate := left(embedded_decoded, 65536);
    else
      return false;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function public.cognitive_text_has_private_identifier(payload text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(payload,'') ~ '^[a-f0-9]{40,128}$'
      or coalesce(payload,'') ~ '^[a-f0-9-]{36}$'
      or coalesce(payload,'') ~ '^(task|project|finding):[a-f0-9-]{36}$' then false
    else coalesce(payload,'') ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
      or coalesce(payload,'') ~ '\m([0-9]{1,3}\.){3}[0-9]{1,3}\M'
      or coalesce(payload,'') ~ '\m\+?[0-9][0-9 ()-]{7,}[0-9]\M'
  end
$$;

create or replace function public.cognitive_json_is_sanitized(payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  string_value text;
  aggregate_value text := '';
begin
  if payload is null then return true; end if;
  if pg_column_size(payload) > 16384
     or payload::text ~* '"(__proto__|constructor|prototype)"\s*:' then
    return false;
  end if;
  for string_value in
    select trim(both '"' from value::text)
    from jsonb_path_query(payload, 'strict $.** ? (@.type() == "string")') value
  loop
    aggregate_value := left(aggregate_value || string_value, 32768);
    if public.cognitive_text_has_secret(string_value)
       or public.cognitive_text_has_private_identifier(string_value) then return false; end if;
  end loop;
  return not public.cognitive_text_has_secret(aggregate_value)
    and not public.cognitive_text_has_secret(payload::text);
end;
$$;
revoke all on function public.cognitive_text_has_secret(text) from public, anon, authenticated;
revoke all on function public.cognitive_text_has_private_identifier(text) from public, anon, authenticated;
revoke all on function public.cognitive_json_is_sanitized(jsonb) from public, anon, authenticated;
grant execute on function public.cognitive_text_has_secret(text) to service_role;
grant execute on function public.cognitive_text_has_private_identifier(text) to service_role;
grant execute on function public.cognitive_json_is_sanitized(jsonb) to service_role;

create or replace function public.cognitive_assert_service_actor(
  p_allowed_actors text[],
  p_claimed_actor text default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    claims->>'role'
  );
  request_actor text := coalesce(
    nullif(current_setting('request.jwt.claim.cognitive_actor', true), ''),
    claims->>'cognitive_actor'
  );
begin
  if request_role <> 'service_role'
     or request_actor is null
     or not request_actor = any(p_allowed_actors)
     or (p_claimed_actor is not null and p_claimed_actor <> request_actor) then
    raise exception 'cognitive_service_actor_mismatch' using errcode='42501';
  end if;
  return request_actor;
end;
$$;
revoke all on function public.cognitive_assert_service_actor(text[],text)
  from public, anon, authenticated;
grant execute on function public.cognitive_assert_service_actor(text[],text)
  to service_role;

create table public.cognitive_projects (
  id uuid primary key default gen_random_uuid(),
  repository_full_name text not null check (repository_full_name = 'Chillywood2025/chillywood-mobile'),
  source_state text not null default 'security_hardening_in_progress'
    check (source_state in (
      'security_hardening_in_progress',
      'security_hardened_scaffold_not_deployed'
    )),
  activation_state text not null default 'off' check (activation_state = 'off'),
  scheduler_state text not null default 'none' check (scheduler_state = 'none'),
  production_authority boolean not null default false check (production_authority = false),
  created_at timestamptz not null default statement_timestamp()
);

create table public.intelligence_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cognitive_projects(id),
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  repository_full_name text not null check (repository_full_name = 'Chillywood2025/chillywood-mobile'),
  branch_name text not null check (
    branch_name ~ '^codex/[a-z0-9][a-z0-9/_-]{2,120}$'
    and branch_name !~* '(^|/)(main|master|release)(/|$)'
  ),
  task_key text not null check (
    length(task_key) between 8 and 256
    and not public.cognitive_text_has_secret(task_key)
    and not public.cognitive_text_has_private_identifier(task_key)
  ),
  objective_hash text not null check (objective_hash ~ '^[a-f0-9]{64}$'),
  status public.cognitive_task_status not null default 'received',
  actor_identity text not null check (
    length(actor_identity) between 3 and 128
    and not public.cognitive_text_has_secret(actor_identity)
    and not public.cognitive_text_has_private_identifier(actor_identity)
  ),
  cancelled_at timestamptz,
  quarantined_at timestamptz,
  deadman_at timestamptz not null,
  retention_until timestamptz,
  data_class public.cognitive_data_class not null default 'operational_metadata',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (project_id, platform, environment, task_key),
  unique (id, project_id, platform, environment)
);
alter table public.intelligence_tasks
  add constraint intelligence_tasks_no_user_content
  check (data_class <> 'user_derived');

do $$
declare
  table_name text;
  child_tables constant text[] := array[
    'research_sources', 'research_claims', 'knowledge_entities', 'knowledge_relationships',
    'architecture_components', 'architecture_dependencies', 'decision_records',
    'hypotheses', 'solution_candidates', 'experiments', 'experiment_results',
    'execution_plans', 'execution_runs', 'evaluation_results', 'lessons', 'playbooks',
    'model_invocations', 'tool_invocations', 'intelligence_budgets'
  ];
begin
  foreach table_name in array child_tables loop
    execute format(
      'create table public.%I (
        id uuid primary key default gen_random_uuid(),
        task_id uuid not null,
        project_id uuid not null,
        platform public.cognitive_platform not null,
        environment public.cognitive_environment not null,
        actor_identity text not null check (
          length(actor_identity) between 3 and 128
          and not public.cognitive_text_has_secret(actor_identity)
          and not public.cognitive_text_has_private_identifier(actor_identity)
        ),
        dedupe_key text not null check (
          length(dedupe_key) between 8 and 256
          and not public.cognitive_text_has_secret(dedupe_key)
          and not public.cognitive_text_has_private_identifier(dedupe_key)
        ),
        status text not null default ''received'' check (length(status) between 2 and 64),
        summary jsonb not null default ''{}''::jsonb check (public.cognitive_json_is_sanitized(summary)),
        evidence_metadata jsonb not null default ''{}''::jsonb check (public.cognitive_json_is_sanitized(evidence_metadata)),
        data_class public.cognitive_data_class not null default ''operational_metadata'',
        retention_until timestamptz,
        legal_hold boolean not null default false,
        erased_at timestamptz,
        created_at timestamptz not null default statement_timestamp(),
        unique (task_id, dedupe_key),
        unique (id, task_id, project_id, platform, environment),
        foreign key (task_id, project_id, platform, environment)
          references public.intelligence_tasks(id, project_id, platform, environment)
      )', table_name
    );
    execute format(
      'create index %I on public.%I (task_id, project_id, platform, status, created_at desc)',
      table_name || '_scope_status_idx', table_name
    );
    execute format(
      'create index %I on public.%I (retention_until) where retention_until is not null and legal_hold = false',
      table_name || '_retention_idx', table_name
    );
  end loop;
end
$$;

-- Remove the superseded fail-open state transition overload created earlier in
-- this migration. Only the approval/snapshot-bound overload remains callable.
drop function if exists public.cognitive_transition_task(
  uuid, uuid, public.cognitive_platform, public.cognitive_environment,
  public.cognitive_task_status, public.cognitive_task_status, text, text
);

drop function if exists public.cognitive_consume_capability(
  text, text, uuid, uuid, text, text, public.cognitive_platform,
  public.cognitive_environment, text, text, text, bigint, numeric, text, text, text
);

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
  p_bytes bigint,
  p_cost numeric,
  p_approval_scope_hash text,
  p_plan_snapshot_hash text,
  p_request_hash text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability public.cognitive_capabilities%rowtype;
  task_value public.intelligence_tasks%rowtype;
  emergency_status text;
  sequence_value integer;
begin
  perform public.cognitive_assert_service_actor(array['cognitive_control_plane'],null);
  if length(p_capability_id) not between 8 and 128
     or public.cognitive_text_has_secret(p_capability_id)
     or public.cognitive_text_has_private_identifier(p_capability_id)
     or length(p_call_id) not between 3 and 128
     or public.cognitive_text_has_secret(p_call_id)
     or public.cognitive_text_has_private_identifier(p_call_id) then
    raise exception 'capability_scope_or_proof_rejected' using errcode='P0001';
  end if;
  select * into capability
  from public.cognitive_capabilities
  where capability_id=p_capability_id
  for update;
  if capability.id is null then raise exception 'capability_missing' using errcode='P0001'; end if;
  select * into task_value
  from public.intelligence_tasks
  where id=p_task_id and project_id=p_project_id
    and platform=p_platform and environment=p_environment;
  select status into emergency_status
  from public.autonomous_system_emergency_states
  where system_id='product_intelligence_operator';

  if encode(extensions.digest(convert_to(coalesce(p_opaque_bearer,''),'UTF8'),'sha256'),'hex')
       is distinct from capability.bearer_hash
     or encode(extensions.digest(convert_to(coalesce(p_opaque_nonce,''),'UTF8'),'sha256'),'hex')
       is distinct from capability.nonce_hash
     or capability.status <> 'active'
     or statement_timestamp() < capability.not_before
     or statement_timestamp() >= capability.expires_at
     or capability.revoked_at is not null
     or task_value.id is null or task_value.cancelled_at is not null
     or task_value.quarantined_at is not null
     or statement_timestamp() >= task_value.deadman_at
     or coalesce(emergency_status,'emergency_stop') <> 'active'
     or capability.task_id <> p_task_id or capability.project_id <> p_project_id
     or capability.repository_full_name <> 'Chillywood2025/chillywood-mobile'
     or p_repository_full_name <> 'Chillywood2025/chillywood-mobile'
     or capability.repository_full_name <> p_repository_full_name
     or capability.branch_name <> p_branch_name
     or p_branch_name !~ '^codex/[a-z0-9][a-z0-9/_-]{2,120}$'
     or p_branch_name ~* '(^|/)(main|master|release)(/|$)'
     or capability.platform <> p_platform or capability.environment <> p_environment
     or capability.provider <> p_provider or capability.operation <> p_operation
     or p_path ~ '(^|/)\.\.(/|$)|(^/)|(^|/)(\.git|node_modules|android|ios)(/|$)'
     or p_path like '.github/workflows/%'
     or p_path ~* '(^|/)(\.env|credentials?\.json|.*\.(jks|keystore|p8|p12|pem|key))$'
     or capability.approval_scope_hash is distinct from p_approval_scope_hash
     or capability.plan_snapshot_hash is distinct from p_plan_snapshot_hash
     or not public.cognitive_approval_is_fresh(
       capability.approval_request_id,p_operation,p_platform,
       p_approval_scope_hash,p_plan_snapshot_hash
     )
     or not exists (
       select 1 from unnest(capability.path_scopes) scope
       where p_path=rtrim(scope,'/') or p_path like rtrim(scope,'/') || '/%'
     )
     or capability.remaining_calls < 1
     or p_bytes < 0 or p_bytes > capability.remaining_bytes
     or p_cost < 0 or p_cost > capability.remaining_cost
     or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'capability_scope_or_proof_rejected' using errcode='P0001';
  end if;
  if exists (
    select 1 from public.cognitive_capability_events
    where capability_id=capability.id and call_id=p_call_id
  ) then raise exception 'capability_replay' using errcode='23505'; end if;
  sequence_value := capability.next_usage_sequence;
  update public.cognitive_capabilities set
    remaining_calls=remaining_calls-1,
    remaining_bytes=remaining_bytes-p_bytes,
    remaining_cost=remaining_cost-p_cost,
    consumed_at=statement_timestamp(),
    next_usage_sequence=next_usage_sequence+1,
    status=case when remaining_calls-1=0 then 'exhausted'::public.cognitive_capability_status else status end
  where id=capability.id;
  insert into public.cognitive_capability_events(
    capability_id,task_id,project_id,platform,environment,call_id,
    usage_sequence,event_type,request_hash
  ) values (
    capability.id,p_task_id,p_project_id,p_platform,p_environment,p_call_id,
    sequence_value,'consumed',p_request_hash
  );
  return sequence_value;
end;
$$;
revoke all on function public.cognitive_consume_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,bigint,numeric,text,text,text
) from public, anon, authenticated;
grant execute on function public.cognitive_consume_capability(
  text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,bigint,numeric,text,text,text
) to service_role;

create function public.cognitive_accept_tool_result(
  p_capability_id text,
  p_call_id text,
  p_opaque_bearer text,
  p_opaque_nonce text,
  p_result_envelope jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability public.cognitive_capabilities%rowtype;
  task_value public.intelligence_tasks%rowtype;
  emergency_status text;
  result_envelope_hash text;
begin
  perform public.cognitive_assert_service_actor(array['cognitive_control_plane'],null);
  if length(p_capability_id) not between 8 and 128
     or public.cognitive_text_has_secret(p_capability_id)
     or public.cognitive_text_has_private_identifier(p_capability_id)
     or length(p_call_id) not between 3 and 128
     or public.cognitive_text_has_secret(p_call_id)
     or public.cognitive_text_has_private_identifier(p_call_id) then
    raise exception 'tool_result_postflight_rejected' using errcode='P0001';
  end if;
  select * into capability from public.cognitive_capabilities
  where capability_id=p_capability_id for update;
  select * into task_value from public.intelligence_tasks
  where id=capability.task_id and project_id=capability.project_id
    and platform=capability.platform and environment=capability.environment;
  select status into emergency_status from public.autonomous_system_emergency_states
  where system_id='product_intelligence_operator';
  if capability.id is null
     or encode(extensions.digest(convert_to(coalesce(p_opaque_bearer,''),'UTF8'),'sha256'),'hex')
          is distinct from capability.bearer_hash
     or encode(extensions.digest(convert_to(coalesce(p_opaque_nonce,''),'UTF8'),'sha256'),'hex')
          is distinct from capability.nonce_hash
     or capability.status not in ('active','exhausted')
     or capability.revoked_at is not null or statement_timestamp() >= capability.expires_at
     or task_value.cancelled_at is not null or task_value.quarantined_at is not null
     or statement_timestamp() >= task_value.deadman_at
     or coalesce(emergency_status,'emergency_stop') <> 'active'
     or p_result_envelope is null
     or pg_column_size(p_result_envelope) > 65536
     or not public.cognitive_json_is_sanitized(p_result_envelope)
     or not exists (
       select 1 from public.cognitive_capability_events event
       where event.capability_id=capability.id and event.call_id=p_call_id
         and event.event_type='consumed'
     )
     or not public.cognitive_approval_is_fresh(
       capability.approval_request_id,capability.operation,capability.platform,
       capability.approval_scope_hash,capability.plan_snapshot_hash
     ) then
    raise exception 'tool_result_postflight_rejected' using errcode='P0001';
  end if;
  result_envelope_hash := encode(
    extensions.digest(convert_to(p_result_envelope::text,'UTF8'),'sha256'),
    'hex'
  );
  return result_envelope_hash;
end;
$$;
revoke all on function public.cognitive_accept_tool_result(text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.cognitive_accept_tool_result(text,text,text,text,jsonb)
  to service_role;

create function public.cognitive_revoke_capability(
  p_capability_id text,
  p_reason text,
  p_event_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare capability public.cognitive_capabilities%rowtype;
begin
  perform public.cognitive_assert_service_actor(array['cognitive_control_plane'],null);
  if length(p_capability_id) not between 8 and 128
     or public.cognitive_text_has_secret(p_capability_id)
     or public.cognitive_text_has_private_identifier(p_capability_id)
     or public.cognitive_text_has_secret(p_reason)
     or public.cognitive_text_has_private_identifier(p_reason) then
    raise exception 'capability_revocation_rejected' using errcode='P0001';
  end if;
  select * into capability from public.cognitive_capabilities
  where capability_id=p_capability_id for update;
  if capability.id is null or capability.status='revoked'
     or length(p_reason) not between 3 and 256
     or p_event_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'capability_revocation_rejected' using errcode='P0001';
  end if;
  update public.cognitive_capabilities set
    status='revoked',revoked_at=statement_timestamp(),
    next_usage_sequence=next_usage_sequence+1
  where id=capability.id;
  insert into public.cognitive_capability_events(
    capability_id,task_id,project_id,platform,environment,call_id,
    usage_sequence,event_type,reason,request_hash
  ) values (
    capability.id,capability.task_id,capability.project_id,capability.platform,
    capability.environment,'revoke-' || substr(gen_random_uuid()::text,1,16),
    capability.next_usage_sequence,'revoked',left(p_reason,256),p_event_hash
  );
  return true;
end;
$$;
revoke all on function public.cognitive_revoke_capability(text,text,text)
  from public, anon, authenticated;
grant execute on function public.cognitive_revoke_capability(text,text,text)
  to service_role;

create or replace function public.cognitive_approval_is_fresh(
  p_request_id uuid,
  p_action_id text,
  p_platform public.cognitive_platform,
  p_approval_scope_hash text,
  p_snapshot_hash text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_approval_scope_hash ~ '^[a-f0-9]{64}$'
    and p_snapshot_hash ~ '^[a-f0-9]{64}$'
    and exists (
      select 1
      from public.autonomous_approval_requests request
      where request.id = p_request_id
        and request.system_id = 'product_intelligence_operator'
        and request.action_id = 'approve_cognitive_execution'
        and (
          p_action_id = 'approve_cognitive_execution'
          or (
            jsonb_typeof(request.metadata->'allowed_operations')='array'
            and request.metadata->'allowed_operations' ? p_action_id
          )
        )
        and request.platform = p_platform::text
        and request.status = 'approved'
        and request.approved_by is not null
        and request.approved_at is not null
        and request.expires_at > statement_timestamp()
        and request.metadata->>'approval_scope_hash' is not distinct from p_approval_scope_hash
        and request.metadata->>'plan_snapshot_hash' is not distinct from p_snapshot_hash
        and exists (
          select 1 from public.cognitive_approval_bindings binding
          where binding.approval_request_id=request.id
            and binding.snapshot_hash=p_snapshot_hash
            and binding.approval_scope_hash=p_approval_scope_hash
            and binding.bound_by=request.approved_by
        )
        and exists (
          select 1
          from public.autonomous_approval_request_events event
          where event.request_id = request.id
            and event.event_type = 'preflight_passed'
            and event.created_at >= request.approved_at
            and event.metadata->>'approval_scope_hash' is not distinct from p_approval_scope_hash
            and event.metadata->>'plan_snapshot_hash' is not distinct from p_snapshot_hash
        )
    );
$$;
revoke all on function public.cognitive_approval_is_fresh(uuid, text, public.cognitive_platform, text, text)
  from public, anon, authenticated;
grant execute on function public.cognitive_approval_is_fresh(uuid, text, public.cognitive_platform, text, text)
  to service_role;

drop function if exists public.cognitive_transition_task(
  uuid, uuid, public.cognitive_platform, public.cognitive_environment,
  public.cognitive_task_status, public.cognitive_task_status, text, text
);

create function public.cognitive_transition_task(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_expected public.cognitive_task_status,
  p_next public.cognitive_task_status,
  p_actor_identity text,
  p_transition_hash text,
  p_approval_request_id uuid,
  p_snapshot_hash text
)
returns public.cognitive_task_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_value public.intelligence_tasks%rowtype;
  allowed boolean;
  approval_scope_hash text;
begin
  perform public.cognitive_assert_service_actor(
    array['cognitive_control_plane','product_intelligence_operator'],
    p_actor_identity
  );
  if p_transition_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'cognitive_transition_actor_or_hash_invalid' using errcode = 'P0001';
  end if;
  select * into task_value
  from public.intelligence_tasks
  where id=p_task_id and project_id=p_project_id
    and platform=p_platform and environment=p_environment
  for update;
  if task_value.id is null or task_value.status <> p_expected then
    raise exception 'task_scope_or_expected_state_mismatch' using errcode = 'P0001';
  end if;
  allowed := case task_value.status
    when 'received' then p_next in ('planning','cancelled','quarantined')
    when 'planning' then p_next in ('awaiting_approval','failed','cancelled','budget_exhausted','quarantined')
    when 'awaiting_approval' then p_next in ('approved','failed','cancelled','quarantined')
    when 'approved' then p_next in ('executing','cancelled','quarantined')
    when 'executing' then p_next in ('evaluating','failed','cancelled','budget_exhausted','rollback_pending','quarantined')
    when 'evaluating' then p_next in ('completed','failed','rollback_pending','quarantined')
    when 'rollback_pending' then p_next in ('rollback_running','quarantined')
    when 'rollback_running' then p_next in ('rollback_succeeded','rollback_failed','quarantined')
    when 'rollback_failed' then p_next in ('quarantined','escalation_required')
    else false
  end;
  if not allowed then raise exception 'invalid_cognitive_task_transition' using errcode = 'P0001'; end if;

  if p_next in ('approved','executing','evaluating','completed') then
    if p_approval_request_id is null or p_snapshot_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'cognitive_transition_approval_snapshot_required' using errcode = 'P0001';
    end if;
    select snapshot.approval_scope_hash into approval_scope_hash
    from public.execution_plan_snapshots snapshot
    where snapshot.task_id=p_task_id and snapshot.project_id=p_project_id
      and snapshot.platform=p_platform and snapshot.environment=p_environment
      and snapshot.approval_request_id=p_approval_request_id
      and snapshot.snapshot_hash=p_snapshot_hash;
    if approval_scope_hash is null or not public.cognitive_approval_is_fresh(
      p_approval_request_id,
      'approve_cognitive_execution',
      p_platform,
      approval_scope_hash,
      p_snapshot_hash
    ) then
      raise exception 'cognitive_transition_fresh_approval_required' using errcode = 'P0001';
    end if;
  end if;

  if p_next = 'executing' and not exists (
    select 1 from public.cognitive_capabilities capability
    where capability.task_id=p_task_id and capability.project_id=p_project_id
      and capability.platform=p_platform and capability.environment=p_environment
      and capability.approval_request_id=p_approval_request_id
      and capability.plan_snapshot_hash=p_snapshot_hash
      and capability.status='active' and capability.not_before <= statement_timestamp()
      and capability.expires_at > statement_timestamp() and capability.revoked_at is null
  ) then
    raise exception 'cognitive_transition_active_capability_required' using errcode = 'P0001';
  end if;

  if p_next = 'completed' and not exists (
    select 1
    from public.execution_runs run
    join public.evaluation_results evaluation
      on evaluation.execution_run_id=run.id
      and evaluation.task_id=run.task_id and evaluation.project_id=run.project_id
      and evaluation.platform=run.platform and evaluation.environment=run.environment
    where run.task_id=p_task_id and run.project_id=p_project_id
      and run.platform=p_platform and run.environment=p_environment
      and run.status='completed' and run.snapshot_hash=p_snapshot_hash
      and evaluation.evaluation_status='pass'
      and evaluation.completion_supported=true
      and evaluation.owner_approval_granted=false
      and evaluation.evaluator_write_allowed=false
      and evaluation.snapshot_hash=p_snapshot_hash
  ) then
    raise exception 'cognitive_transition_passing_evaluation_required' using errcode = 'P0001';
  end if;

  if task_value.status='rollback_running' and p_next='rollback_failed' then
    update public.intelligence_tasks
      set status='quarantined', quarantined_at=statement_timestamp(),
          updated_at=statement_timestamp()
      where id=p_task_id;
    insert into public.cognitive_state_transition_events(
      task_id,project_id,platform,environment,entity_type,entity_id,
      prior_status,next_status,actor_identity,transition_hash
    ) values
      (p_task_id,p_project_id,p_platform,p_environment,'task',p_task_id,
       'rollback_running','rollback_failed',p_actor_identity,p_transition_hash),
      (p_task_id,p_project_id,p_platform,p_environment,'task',p_task_id,
       'rollback_failed','quarantined',p_actor_identity,p_transition_hash);
    with revoked as (
      update public.cognitive_capabilities
      set status='revoked', revoked_at=statement_timestamp(),
          next_usage_sequence=next_usage_sequence+1
      where task_id=p_task_id and status in ('active','exhausted')
      returning *
    )
    insert into public.cognitive_capability_events(
      capability_id,task_id,project_id,platform,environment,call_id,
      usage_sequence,event_type,reason,request_hash
    )
    select id,task_id,project_id,platform,environment,
      'rollback-revoke-' || substr(id::text,1,8),
      next_usage_sequence-1,'revoked','rollback_failed_quarantine',p_transition_hash
    from revoked;
    perform public.cognitive_record_finding(
      p_task_id,p_project_id,p_platform,p_environment,
      'rollback-failed-quarantine','rollback_failure','task:' || p_task_id::text,
      'p1',p_transition_hash
    );
    insert into public.cognitive_owner_review_requests(
      task_id,project_id,platform,environment,request_type,evidence_hash
    ) values (
      p_task_id,p_project_id,p_platform,p_environment,'rollback_failed',p_transition_hash
    ) on conflict do nothing;
    return 'quarantined'::public.cognitive_task_status;
  end if;

  update public.intelligence_tasks set
    status=p_next,
    updated_at=statement_timestamp(),
    cancelled_at=case when p_next='cancelled' then statement_timestamp() else cancelled_at end,
    quarantined_at=case when p_next='quarantined' then statement_timestamp() else quarantined_at end
  where id=p_task_id;
  insert into public.cognitive_state_transition_events(
    task_id,project_id,platform,environment,entity_type,entity_id,
    prior_status,next_status,actor_identity,transition_hash
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,'task',p_task_id,
    p_expected::text,p_next::text,p_actor_identity,p_transition_hash
  );
  return p_next;
end;
$$;
revoke all on function public.cognitive_transition_task(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  public.cognitive_task_status,public.cognitive_task_status,text,text,uuid,text
) from public, anon, authenticated;
grant execute on function public.cognitive_transition_task(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  public.cognitive_task_status,public.cognitive_task_status,text,text,uuid,text
) to service_role;

create table public.cognitive_research_authorities (
  authority_id text not null check (length(authority_id) between 2 and 80),
  canonical_host text not null check (
    canonical_host = lower(canonical_host)
    and canonical_host ~ '^[a-z0-9.-]{3,253}$'
  ),
  source_type text not null check (source_type in (
    'official_documentation','security_advisory','platform_policy','store_policy',
    'product_research','competitor_research','engineering_practice','news'
  )),
  publisher text not null check (length(publisher) between 2 and 256),
  ownership_identity text not null check (length(ownership_identity) between 2 and 80),
  created_at timestamptz not null default statement_timestamp(),
  primary key (authority_id, canonical_host, source_type),
  unique (authority_id,canonical_host,source_type,publisher,ownership_identity)
);
insert into public.cognitive_research_authorities(
  authority_id,canonical_host,source_type,publisher,ownership_identity
) values
  -- BEGIN GENERATED RESEARCH AUTHORITIES — config/intelligence/research-authorities.json
  ('apple-docs','developer.apple.com','official_documentation','Apple','apple'),
  ('apple-policy','developer.apple.com','platform_policy','Apple','apple'),
  ('apple-store-policy','developer.apple.com','store_policy','Apple','apple'),
  ('apple-security','developer.apple.com','security_advisory','Apple','apple'),
  ('android-docs','developer.android.com','official_documentation','Google','google'),
  ('android-policy','developer.android.com','platform_policy','Google','google'),
  ('android-store-policy','developer.android.com','store_policy','Google','google'),
  ('android-security','developer.android.com','security_advisory','Google','google'),
  ('firebase-docs','firebase.google.com','official_documentation','Google','google'),
  ('firebase-security','firebase.google.com','security_advisory','Google','google'),
  ('expo-docs','docs.expo.dev','official_documentation','Expo','expo'),
  ('expo-security','docs.expo.dev','security_advisory','Expo','expo'),
  ('supabase-docs','supabase.com','official_documentation','Supabase','supabase'),
  ('supabase-security','supabase.com','security_advisory','Supabase','supabase'),
  ('github-docs','docs.github.com','official_documentation','GitHub','github'),
  ('github-security','docs.github.com','security_advisory','GitHub','github'),
  ('revenuecat-docs','revenuecat.com','official_documentation','RevenueCat','revenuecat'),
  ('revenuecat-security','revenuecat.com','security_advisory','RevenueCat','revenuecat'),
  ('stripe-docs','stripe.com','official_documentation','Stripe','stripe'),
  ('stripe-security','stripe.com','security_advisory','Stripe','stripe'),
  ('livekit-docs','docs.livekit.io','official_documentation','LiveKit','livekit'),
  ('livekit-security','docs.livekit.io','security_advisory','LiveKit','livekit'),
  ('cloudflare-docs','developers.cloudflare.com','official_documentation','Cloudflare','cloudflare'),
  ('cloudflare-security','developers.cloudflare.com','security_advisory','Cloudflare','cloudflare'),
  ('iana-docs','iana.org','official_documentation','IANA','iana'),
  ('reuters-news','reuters.com','news','Reuters','reuters'),
  ('ap-news','apnews.com','news','Associated Press','associated-press');
  -- END GENERATED RESEARCH AUTHORITIES
alter table public.cognitive_research_authorities enable row level security;
alter table public.cognitive_research_authorities force row level security;
revoke all on table public.cognitive_research_authorities from public,anon,authenticated;
grant select on table public.cognitive_research_authorities to service_role;

alter table public.research_sources
  add column authority_id text not null,
  add column canonical_host text not null,
  add column ownership_identity text not null,
  add column source_reference_hash text not null check (source_reference_hash ~ '^[a-f0-9]{64}$'),
  add column canonical_url_hash text not null check (canonical_url_hash ~ '^[a-f0-9]{64}$'),
  add column content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  add column publisher text not null check (length(publisher) between 2 and 256),
  add column publication_date timestamptz,
  add column retrieval_date timestamptz not null,
  add column freshness_deadline timestamptz not null,
  add column source_type text not null check (source_type in (
    'official_documentation', 'security_advisory', 'platform_policy', 'store_policy',
    'product_research', 'competitor_research', 'engineering_practice', 'news'
  )),
  add column is_primary boolean not null default false,
  add column bounded_excerpt text not null check (length(bounded_excerpt) between 1 and 2000),
  add column citation_metadata jsonb not null default '{}'::jsonb check (
    pg_column_size(citation_metadata) <= 8192 and public.cognitive_json_is_sanitized(citation_metadata)
  ),
  add column trusted_for_tool_execution boolean not null default false check (trusted_for_tool_execution = false),
  add constraint research_source_date_order check (
    (publication_date is null or publication_date <= retrieval_date)
    and retrieval_date >= created_at - interval '48 hours'
    and retrieval_date <= created_at + interval '5 minutes'
    and freshness_deadline > retrieval_date
    and freshness_deadline <= retrieval_date + case source_type
      when 'news' then interval '7 days'
      when 'security_advisory' then interval '14 days'
      when 'platform_policy' then interval '30 days'
      when 'store_policy' then interval '30 days'
      else interval '90 days'
    end
    and created_at <= statement_timestamp() + interval '5 minutes'
  ),
  add constraint research_source_text_sanitized check (
    not public.cognitive_text_has_secret(publisher)
    and not public.cognitive_text_has_secret(bounded_excerpt)
  ),
  add constraint research_source_citation_schema check (
    jsonb_typeof(citation_metadata)='object'
    and citation_metadata ?& array['title','locator']
    and not citation_metadata ?| array['authority','credential','token','secret']
    and citation_metadata - 'title' - 'locator' = '{}'::jsonb
    and length(trim(citation_metadata->>'title')) between 1 and 512
    and length(trim(citation_metadata->>'locator')) between 1 and 512
    and not public.cognitive_text_has_secret(citation_metadata->>'title')
    and not public.cognitive_text_has_secret(citation_metadata->>'locator')
  ),
  add foreign key (
    authority_id,canonical_host,source_type,publisher,ownership_identity
  ) references public.cognitive_research_authorities(
    authority_id,canonical_host,source_type,publisher,ownership_identity
  );

alter table public.research_claims
  add column claim_hash text not null check (claim_hash ~ '^[a-f0-9]{64}$'),
  add column bounded_claim text not null check (length(bounded_claim) between 4 and 8000),
  add column confidence numeric(4,3) not null check (confidence between 0 and 1),
  add column category text not null check (category in ('technical', 'platform_policy', 'consequential_news', 'product', 'security')),
  add column freshness_deadline timestamptz not null,
  add column contradiction_state text not null default 'none'
    check (contradiction_state in ('none', 'detected', 'unresolved', 'resolved')),
  add column support_state text not null default 'pending'
    check (support_state in ('pending', 'supported', 'blocked', 'stale', 'contradicted'));
alter table public.research_claims
  add constraint research_claim_freshness_ceiling check (
    freshness_deadline > created_at
    and freshness_deadline <= created_at + case category
      when 'consequential_news' then interval '7 days'
      when 'security' then interval '14 days'
      when 'platform_policy' then interval '30 days'
      else interval '90 days'
    end
  );

create table public.research_claim_sources (
  claim_id uuid not null,
  source_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  relationship text not null check (relationship in ('supports', 'contradicts', 'context')),
  created_at timestamptz not null default statement_timestamp(),
  primary key (claim_id, source_id),
  foreign key (claim_id, task_id, project_id, platform, environment)
    references public.research_claims(id, task_id, project_id, platform, environment),
  foreign key (source_id, task_id, project_id, platform, environment)
    references public.research_sources(id, task_id, project_id, platform, environment)
);
create index research_claim_sources_scope_idx
  on public.research_claim_sources(task_id, project_id, platform, relationship);

create function public.enforce_research_claim_source_freshness()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  claim_deadline timestamptz;
  source_deadline timestamptz;
begin
  if new.relationship <> 'supports' then
    return new;
  end if;
  select claim.freshness_deadline, source.freshness_deadline
    into claim_deadline, source_deadline
  from public.research_claims claim
  join public.research_sources source
    on source.id = new.source_id
    and source.task_id = new.task_id
    and source.project_id = new.project_id
    and source.platform = new.platform
    and source.environment = new.environment
  where claim.id = new.claim_id
    and claim.task_id = new.task_id
    and claim.project_id = new.project_id
    and claim.platform = new.platform
    and claim.environment = new.environment;
  -- Scope/identity absence is rejected by the composite foreign keys. Only
  -- evaluate freshness when both same-scope parents are present so the trigger
  -- does not mask the relational binding error.
  if claim_deadline is not null
     and source_deadline is not null
     and claim_deadline > source_deadline then
    raise exception 'research_claim_freshness_exceeds_source' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_research_claim_source_freshness()
  from public, anon, authenticated;
create trigger research_claim_sources_freshness_guard
  before insert or update on public.research_claim_sources
  for each row execute function public.enforce_research_claim_source_freshness();

create function public.enforce_research_claim_freshness_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.freshness_deadline > old.freshness_deadline
     and exists (
       select 1
       from public.research_claim_sources relation
       join public.research_sources source
         on source.id = relation.source_id
         and source.task_id = relation.task_id
         and source.project_id = relation.project_id
         and source.platform = relation.platform
         and source.environment = relation.environment
       where relation.claim_id = old.id
         and relation.task_id = old.task_id
         and relation.project_id = old.project_id
         and relation.platform = old.platform
         and relation.environment = old.environment
         and relation.relationship = 'supports'
         and source.freshness_deadline < new.freshness_deadline
     ) then
    raise exception 'research_claim_freshness_exceeds_source' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_research_claim_freshness_update()
  from public, anon, authenticated;
create trigger research_claim_freshness_update_guard
  before update of freshness_deadline on public.research_claims
  for each row execute function public.enforce_research_claim_freshness_update();

create table public.research_contradictions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null,
  source_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  resolution_state text not null default 'open' check (resolution_state in ('open', 'resolved')),
  created_at timestamptz not null default statement_timestamp(),
  foreign key (claim_id, task_id, project_id, platform, environment)
    references public.research_claims(id, task_id, project_id, platform, environment),
  foreign key (source_id, task_id, project_id, platform, environment)
    references public.research_sources(id, task_id, project_id, platform, environment)
);

create table public.research_retrieval_events (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  request_url_hash text not null check (request_url_hash ~ '^[a-f0-9]{64}$'),
  resolved_address_hashes text[] not null check (cardinality(resolved_address_hashes) between 1 and 16),
  response_hash text check (response_hash is null or response_hash ~ '^[a-f0-9]{64}$'),
  result text not null check (result in ('accepted', 'blocked', 'failed')),
  created_at timestamptz not null default statement_timestamp(),
  foreign key (source_id, task_id, project_id, platform, environment)
    references public.research_sources(id, task_id, project_id, platform, environment)
);

create function public.cognitive_validate_research_retrieval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare source_value public.research_sources%rowtype;
begin
  select * into source_value from public.research_sources
  where id=new.source_id and task_id=new.task_id and project_id=new.project_id
    and platform=new.platform and environment=new.environment;
  if source_value.id is null
     or new.request_url_hash <> source_value.canonical_url_hash
     or (new.result='accepted' and new.response_hash is distinct from source_value.content_hash)
     or new.created_at > statement_timestamp() + interval '5 minutes'
     or exists (
       select 1 from unnest(new.resolved_address_hashes) address_hash
       where address_hash !~ '^[a-f0-9]{64}$'
     ) then
    raise exception 'research_retrieval_binding_rejected' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.cognitive_validate_research_retrieval()
  from public,anon,authenticated,service_role;
create trigger cognitive_research_retrieval_binding
before insert on public.research_retrieval_events
for each row execute function public.cognitive_validate_research_retrieval();

alter table public.knowledge_relationships
  add column source_entity_id uuid not null,
  add column target_entity_id uuid not null,
  add column relationship_type text not null check (length(relationship_type) between 2 and 80),
  add constraint knowledge_relationship_not_self check (source_entity_id <> target_entity_id),
  add foreign key (source_entity_id, task_id, project_id, platform, environment)
    references public.knowledge_entities(id, task_id, project_id, platform, environment),
  add foreign key (target_entity_id, task_id, project_id, platform, environment)
    references public.knowledge_entities(id, task_id, project_id, platform, environment);

alter table public.architecture_components
  add column repository_full_name text not null check (repository_full_name = 'Chillywood2025/chillywood-mobile'),
  add column source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  add column generator_version text not null check (length(generator_version) between 1 and 64),
  add column generator_config_hash text not null check (generator_config_hash ~ '^[a-f0-9]{64}$'),
  add column file_content_hash text not null check (file_content_hash ~ '^[a-f0-9]{64}$'),
  add column graph_digest text not null check (graph_digest ~ '^[a-f0-9]{64}$');

alter table public.architecture_dependencies
  add column source_component_id uuid not null,
  add column target_component_id uuid not null,
  add column dependency_type text not null check (length(dependency_type) between 2 and 80),
  add constraint architecture_dependency_not_self check (source_component_id <> target_component_id),
  add foreign key (source_component_id, task_id, project_id, platform, environment)
    references public.architecture_components(id, task_id, project_id, platform, environment),
  add foreign key (target_component_id, task_id, project_id, platform, environment)
    references public.architecture_components(id, task_id, project_id, platform, environment);

alter table public.experiments
  add column hypothesis_id uuid,
  add column production_activation_allowed boolean not null default false check (production_activation_allowed = false),
  add foreign key (hypothesis_id, task_id, project_id, platform, environment)
    references public.hypotheses(id, task_id, project_id, platform, environment);

alter table public.execution_plans
  add column plan_version integer not null default 1 check (plan_version between 1 and 1000),
  add column branch_name text not null check (
    branch_name ~ '^codex/[a-z0-9][a-z0-9/_-]{2,120}$'
    and branch_name !~* '(^|/)(main|master|release)(/|$)'
  ),
  add column requested_actions text[] not null check (
    cardinality(requested_actions) between 1 and 32
    and requested_actions <@ array[
      'repository_read_file','repository_list_files','repository_search',
      'repository_apply_patch','repository_write_new_file','test_run_allowlisted',
      'git_create_scoped_branch','git_stage_allowlisted_paths','git_commit_scoped',
      'git_push_scoped_draft_branch','github_open_draft_pr','github_update_draft_pr_body'
    ]::text[]
  ),
  add column path_allowlist text[] not null check (cardinality(path_allowlist) between 1 and 128),
  add column required_test_ids text[] not null check (cardinality(required_test_ids) between 1 and 128),
  add column rollback_plan_hash text not null check (rollback_plan_hash ~ '^[a-f0-9]{64}$'),
  add column source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  add column graph_digest text not null check (graph_digest ~ '^[a-f0-9]{64}$');

create table public.execution_plan_snapshots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  canonical_snapshot jsonb not null check (
    pg_column_size(canonical_snapshot) <= 65536 and public.cognitive_json_is_sanitized(canonical_snapshot)
  ),
  approval_scope_hash text not null check (approval_scope_hash ~ '^[a-f0-9]{64}$'),
  approval_request_id uuid not null references public.autonomous_approval_requests(id),
  created_at timestamptz not null default statement_timestamp(),
  data_class public.cognitive_data_class not null default 'operational_metadata'
    check (data_class in ('operational_metadata','non_personal_audit','security_evidence')),
  retention_until timestamptz not null default statement_timestamp() + interval '365 days'
    check (retention_until > created_at and retention_until <= created_at + interval '365 days'),
  legal_hold boolean not null default false,
  unique (id, task_id, project_id, platform, environment),
  unique (task_id, snapshot_hash),
  foreign key (plan_id, task_id, project_id, platform, environment)
    references public.execution_plans(id, task_id, project_id, platform, environment)
);

alter table public.execution_runs
  add column snapshot_id uuid not null,
  add column snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  add column final_commit text check (final_commit is null or final_commit ~ '^[a-f0-9]{40}$'),
  add column evidence_manifest_hash text check (evidence_manifest_hash is null or evidence_manifest_hash ~ '^[a-f0-9]{64}$'),
  add column production_deployed boolean not null default false check (production_deployed = false),
  add column money_moved boolean not null default false check (money_moved = false),
  add column user_rights_changed boolean not null default false check (user_rights_changed = false),
  add column public_release_executed boolean not null default false check (public_release_executed = false),
  add foreign key (snapshot_id, task_id, project_id, platform, environment)
    references public.execution_plan_snapshots(id, task_id, project_id, platform, environment);

create table public.execution_evidence_records (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  evidence_type text not null check (evidence_type in (
    'test_exit', 'stdout_hash', 'stderr_hash', 'diff_hash', 'commit_hash',
    'ci_run', 'physical_device', 'rollback'
  )),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  trusted_producer text not null check (length(trusted_producer) between 3 and 128),
  final_commit text not null check (final_commit ~ '^[a-f0-9]{40}$'),
  created_at timestamptz not null default statement_timestamp(),
  foreign key (run_id, task_id, project_id, platform, environment)
    references public.execution_runs(id, task_id, project_id, platform, environment)
);

alter table public.evaluation_results
  add column execution_run_id uuid not null,
  add column snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  add column evaluator_identity text not null check (
    length(evaluator_identity) between 3 and 128
    and not public.cognitive_text_has_secret(evaluator_identity)
    and not public.cognitive_text_has_private_identifier(evaluator_identity)
  ),
  add column executor_identity text not null check (
    length(executor_identity) between 3 and 128
    and not public.cognitive_text_has_secret(executor_identity)
    and not public.cognitive_text_has_private_identifier(executor_identity)
  ),
  add column evaluation_status public.cognitive_evaluation_status not null,
  add column completion_supported boolean not null default false,
  add column owner_approval_granted boolean not null default false check (owner_approval_granted = false),
  add column evaluator_write_allowed boolean not null default false check (evaluator_write_allowed = false),
  add constraint evaluator_identity_separate check (evaluator_identity <> executor_identity),
  add foreign key (execution_run_id, task_id, project_id, platform, environment)
    references public.execution_runs(id, task_id, project_id, platform, environment);

alter table public.model_invocations
  add column model_provider text not null check (model_provider in ('mock')),
  add column model_label text not null check (length(model_label) between 2 and 128),
  add column model_version text not null check (length(model_version) between 1 and 128),
  add column model_role text not null check (model_role in ('planner', 'researcher', 'evaluator')),
  add column input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  add column output_hash text not null check (output_hash ~ '^[a-f0-9]{64}$'),
  add column evidence_reference_hashes text[] not null check (cardinality(evidence_reference_hashes) between 1 and 128),
  add column safety_classification text not null check (safety_classification in ('accepted', 'rejected', 'blocked')),
  add column input_token_count integer not null check (input_token_count between 0 and 10000000),
  add column output_token_count integer not null check (output_token_count between 0 and 10000000),
  add column cost numeric(12,4) not null check (cost between 0 and 25),
  add column latency_ms integer not null check (latency_ms between 0 and 14400000);

alter table public.tool_invocations
  add column capability_id uuid not null,
  add column call_id text not null check (
    length(call_id) between 3 and 128
    and not public.cognitive_text_has_secret(call_id)
    and not public.cognitive_text_has_private_identifier(call_id)
  ),
  add column operation text not null check (operation in (
    'repository_read_file', 'repository_list_files', 'repository_search',
    'repository_apply_patch', 'repository_write_new_file', 'test_run_allowlisted',
    'git_create_scoped_branch', 'git_stage_allowlisted_paths', 'git_commit_scoped',
    'git_push_scoped_draft_branch', 'github_open_draft_pr', 'github_update_draft_pr_body'
  )),
  add column result_envelope_hash text not null check (result_envelope_hash ~ '^[a-f0-9]{64}$'),
  add column result_untrusted boolean not null default true check (result_untrusted = true),
  add column result_sanitized boolean not null,
  add column result_truncated boolean not null,
  add column output_bytes bigint not null check (output_bytes between 0 and 10000000);

create table public.cognitive_capabilities (
  id uuid primary key default gen_random_uuid(),
  capability_id text not null unique check (
    length(capability_id) between 8 and 128
    and not public.cognitive_text_has_secret(capability_id)
    and not public.cognitive_text_has_private_identifier(capability_id)
  ),
  bearer_hash text not null unique check (bearer_hash ~ '^[a-f0-9]{64}$'),
  nonce_hash text not null unique check (nonce_hash ~ '^[a-f0-9]{64}$'),
  task_id uuid not null,
  project_id uuid not null,
  repository_full_name text not null check (repository_full_name = 'Chillywood2025/chillywood-mobile'),
  branch_name text not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  risk_level text not null check (risk_level in ('low','medium','high')),
  provider text not null check (provider in ('repository', 'github', 'supabase_local', 'research_mock', 'model_mock', 'none')),
  operation text not null check (operation in (
    'repository_read_file', 'repository_list_files', 'repository_search',
    'repository_apply_patch', 'repository_write_new_file', 'test_run_allowlisted',
    'git_create_scoped_branch', 'git_stage_allowlisted_paths', 'git_commit_scoped',
    'git_push_scoped_draft_branch', 'github_open_draft_pr', 'github_update_draft_pr_body'
  )),
  path_scopes text[] not null check (cardinality(path_scopes) between 1 and 128),
  issued_at timestamptz not null,
  not_before timestamptz not null,
  expires_at timestamptz not null,
  maximum_calls integer not null check (maximum_calls between 1 and 100),
  remaining_calls integer not null check (remaining_calls between 0 and maximum_calls),
  maximum_bytes bigint not null check (maximum_bytes between 1 and 10000000),
  remaining_bytes bigint not null check (remaining_bytes between 0 and maximum_bytes),
  maximum_cost numeric(12,4) not null check (maximum_cost between 0 and 25),
  remaining_cost numeric(12,4) not null check (remaining_cost between 0 and maximum_cost),
  approval_request_id uuid not null references public.autonomous_approval_requests(id),
  approval_scope_hash text not null check (approval_scope_hash ~ '^[a-f0-9]{64}$'),
  plan_snapshot_id uuid not null,
  plan_snapshot_hash text not null check (plan_snapshot_hash ~ '^[a-f0-9]{64}$'),
  status public.cognitive_capability_status not null default 'active',
  revoked_at timestamptz,
  consumed_at timestamptz,
  next_usage_sequence integer not null default 1 check (next_usage_sequence >= 1),
  created_at timestamptz not null default statement_timestamp(),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment),
  foreign key (plan_snapshot_id, task_id, project_id, platform, environment)
    references public.execution_plan_snapshots(id, task_id, project_id, platform, environment),
  check (not_before >= issued_at and expires_at > not_before)
);
create index cognitive_capabilities_active_scope_idx
  on public.cognitive_capabilities(task_id, project_id, repository_full_name, branch_name, platform, environment, status, expires_at);

alter table public.tool_invocations
  add foreign key (capability_id, task_id, project_id, platform, environment)
    references public.cognitive_capabilities(id, task_id, project_id, platform, environment),
  add constraint tool_invocation_call_unique unique (capability_id, call_id);

create table public.cognitive_capability_events (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  call_id text not null check (
    length(call_id) between 3 and 128
    and not public.cognitive_text_has_secret(call_id)
    and not public.cognitive_text_has_private_identifier(call_id)
  ),
  usage_sequence integer not null check (usage_sequence >= 1),
  event_type text not null check (event_type in ('issued', 'consumed', 'rejected', 'revoked', 'expired')),
  reason text check (
    reason is null or (
      length(reason) between 2 and 512
      and not public.cognitive_text_has_secret(reason)
      and not public.cognitive_text_has_private_identifier(reason)
    )
  ),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default statement_timestamp(),
  unique (capability_id, call_id),
  unique (capability_id, usage_sequence),
  foreign key (capability_id, task_id, project_id, platform, environment)
    references public.cognitive_capabilities(id, task_id, project_id, platform, environment)
);

alter table public.intelligence_budgets
  add column immutable_ceiling_hash text not null check (immutable_ceiling_hash ~ '^[a-f0-9]{64}$'),
  add column max_model_tokens bigint not null check (max_model_tokens between 0 and 10000000),
  add column used_model_tokens bigint not null default 0 check (used_model_tokens between 0 and max_model_tokens),
  add column max_model_cost numeric(12,4) not null check (max_model_cost between 0 and 25),
  add column used_model_cost numeric(12,4) not null default 0 check (used_model_cost between 0 and max_model_cost),
  add column max_tool_calls integer not null check (max_tool_calls between 0 and 100),
  add column used_tool_calls integer not null default 0 check (used_tool_calls between 0 and max_tool_calls),
  add column max_tool_bytes bigint not null check (max_tool_bytes between 0 and 10000000),
  add column used_tool_bytes bigint not null default 0 check (used_tool_bytes between 0 and max_tool_bytes),
  add column max_child_tasks integer not null check (max_child_tasks between 0 and 20),
  add column used_child_tasks integer not null default 0 check (used_child_tasks between 0 and max_child_tasks),
  add column max_recursion_depth integer not null check (max_recursion_depth between 0 and 4),
  add column max_retries integer not null check (max_retries between 0 and 5),
  add column max_concurrent_calls integer not null default 1 check (max_concurrent_calls between 1 and 8),
  add column active_concurrent_calls integer not null default 0 check (active_concurrent_calls between 0 and max_concurrent_calls),
  add column last_action_hash text check (last_action_hash is null or last_action_hash ~ '^[a-f0-9]{64}$'),
  add column repeated_action_count integer not null default 0 check (repeated_action_count between 0 and 3),
  add column last_plan_hash text check (last_plan_hash is null or last_plan_hash ~ '^[a-f0-9]{64}$'),
  add column repeated_plan_count integer not null default 0 check (repeated_plan_count between 0 and 3),
  add column deadline_at timestamptz not null;

create table public.cognitive_budget_events (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  reservation_id text not null check (
    length(reservation_id) between 3 and 128
    and not public.cognitive_text_has_secret(reservation_id)
    and not public.cognitive_text_has_private_identifier(reservation_id)
  ),
  event_type text not null check (event_type in ('reserved', 'settled', 'rejected', 'released')),
  usage jsonb not null check (
    pg_column_size(usage) <= 8192 and public.cognitive_json_is_sanitized(usage)
  ),
  created_at timestamptz not null default statement_timestamp(),
  unique (budget_id, reservation_id, event_type),
  foreign key (budget_id, task_id, project_id, platform, environment)
    references public.intelligence_budgets(id, task_id, project_id, platform, environment)
);

create table public.cognitive_resource_leases (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  resource_type text not null check (resource_type in (
    'repository', 'branch', 'path', 'migration_namespace', 'edge_function',
    'database_object', 'provider', 'release_channel', 'platform', 'feature_flag'
  )),
  resource_key text not null check (
    length(resource_key) between 3 and 512
    and not public.cognitive_text_has_secret(resource_key)
    and not public.cognitive_text_has_private_identifier(resource_key)
  ),
  mode text not null check (mode in ('read', 'write')),
  issued_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > issued_at),
  heartbeat_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment)
);
create unique index cognitive_resource_lease_write_active_idx
  on public.cognitive_resource_leases(resource_type, resource_key)
  where mode = 'write' and revoked_at is null;

create table public.cognitive_state_transition_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  entity_type text not null check (entity_type in (
    'task', 'research_claim', 'hypothesis', 'solution_candidate', 'experiment',
    'execution_plan', 'execution_run', 'capability', 'evaluation', 'lesson', 'playbook'
  )),
  entity_id uuid not null,
  prior_status text,
  next_status text not null,
  actor_identity text not null check (
    length(actor_identity) between 3 and 128
    and not public.cognitive_text_has_secret(actor_identity)
    and not public.cognitive_text_has_private_identifier(actor_identity)
  ),
  transition_hash text not null check (transition_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default statement_timestamp(),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment)
);
create index cognitive_state_transition_scope_idx
  on public.cognitive_state_transition_events(task_id, entity_type, entity_id, created_at);

create table public.cognitive_current_findings (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  finding_key text not null check (
    length(finding_key) between 8 and 256
    and not public.cognitive_text_has_secret(finding_key)
    and not public.cognitive_text_has_private_identifier(finding_key)
  ),
  finding_type text not null check (
    length(finding_type) between 3 and 128
    and not public.cognitive_text_has_secret(finding_type)
    and not public.cognitive_text_has_private_identifier(finding_type)
  ),
  target_scope text not null check (
    length(target_scope) between 3 and 256
    and not public.cognitive_text_has_secret(target_scope)
    and not public.cognitive_text_has_private_identifier(target_scope)
  ),
  severity text not null check (severity in ('p0', 'p1', 'p2', 'p3', 'info')),
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  current_status text not null default 'open' check (current_status in ('open', 'resolved')),
  resolved_at timestamptz,
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  data_class public.cognitive_data_class not null default 'operational_metadata'
    check (data_class in ('operational_metadata', 'security_evidence', 'legal_hold')),
  retention_until timestamptz not null default statement_timestamp() + interval '90 days',
  legal_hold boolean not null default false,
  erased_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  check (retention_until > created_at),
  check (legal_hold or retention_until <= created_at + interval '365 days'),
  check (legal_hold = (data_class = 'legal_hold')),
  check (
    erased_at is null
    or (
      current_status = 'resolved'
      and finding_type = 'erased_finding'
      and target_scope = 'erased_scope'
    )
  ),
  unique (task_id, finding_key),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment)
);
create index cognitive_current_findings_retention_idx
  on public.cognitive_current_findings(retention_until)
  where legal_hold = false and erased_at is null;

create table public.finding_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  event_type text not null check (event_type in ('detected', 'recurred', 'resolved', 'erased')),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default statement_timestamp(),
  foreign key (finding_id, task_id, project_id, platform, environment)
    references public.cognitive_current_findings(id, task_id, project_id, platform, environment)
);

create table public.cognitive_erasure_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  target_table text not null check (length(target_table) between 3 and 128),
  target_id uuid not null,
  prior_data_class public.cognitive_data_class not null,
  tombstone_hash text not null check (tombstone_hash ~ '^[a-f0-9]{64}$'),
  legal_hold boolean not null,
  erased_at timestamptz not null,
  actor_identity text not null check (
    length(actor_identity) between 3 and 128
    and not public.cognitive_text_has_secret(actor_identity)
    and not public.cognitive_text_has_private_identifier(actor_identity)
  ),
  created_at timestamptz not null default statement_timestamp(),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment)
);

alter table public.lessons
  add column learning_type text not null check (learning_type in (
    'source_reliability_score', 'tool_success_score', 'expected_duration_seconds',
    'test_priority_weight', 'rollback_strategy_rank', 'model_routing_preference',
    'retry_timing_seconds'
  )),
  add column numeric_value numeric(12,4) not null check (numeric_value between 0 and 14400),
  add column evaluation_result_id uuid not null,
  add column outcome_evidence_hash text not null check (outcome_evidence_hash ~ '^[a-f0-9]{64}$'),
  add foreign key (evaluation_result_id, task_id, project_id, platform, environment)
    references public.evaluation_results(id, task_id, project_id, platform, environment);

alter table public.research_claims
  add constraint research_claim_status_machine check (status in ('pending', 'supported', 'blocked', 'stale', 'contradicted'));
alter table public.hypotheses
  add constraint hypothesis_status_machine check (status in ('received', 'planned', 'approved', 'denied', 'cancelled'));
alter table public.solution_candidates
  add constraint solution_candidate_status_machine check (status in ('received', 'planned', 'approved', 'denied', 'cancelled'));
alter table public.experiments
  add constraint experiment_status_machine check (status in ('received', 'planned', 'approved', 'running', 'evaluating', 'completed', 'failed', 'cancelled'));
alter table public.execution_plans
  add constraint execution_plan_status_machine check (status in ('draft', 'awaiting_approval', 'approved', 'denied', 'cancelled', 'invalidated'));
alter table public.execution_runs
  add constraint execution_run_status_machine check (status in (
    'received', 'executing', 'evaluating', 'completed', 'failed', 'cancelled',
    'budget_exhausted', 'rollback_pending', 'rollback_running',
    'rollback_succeeded', 'rollback_failed', 'quarantined', 'escalation_required'
  ));
alter table public.evaluation_results
  add constraint evaluation_result_status_machine check (status in ('pass', 'fail', 'incomplete', 'blocked'));
alter table public.lessons
  add constraint lesson_status_machine check (status in ('proposed', 'accepted', 'rejected', 'quarantined'));
alter table public.playbooks
  add constraint playbook_status_machine check (status in ('draft', 'reviewed', 'approved', 'quarantined'));

create or replace function public.enforce_cognitive_initial_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare expected_status text;
begin
  expected_status := case tg_table_name
    when 'intelligence_tasks' then 'received'
    when 'research_claims' then 'pending'
    when 'hypotheses' then 'received'
    when 'solution_candidates' then 'received'
    when 'experiments' then 'received'
    when 'execution_plans' then 'draft'
    when 'execution_runs' then 'received'
    when 'lessons' then 'proposed'
    when 'playbooks' then 'draft'
    else null
  end;
  if expected_status is not null and new.status::text <> expected_status then
    raise exception 'cognitive_initial_state_rejected' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_cognitive_initial_status() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'intelligence_tasks','research_claims','hypotheses','solution_candidates',
    'experiments','execution_plans','execution_runs','lessons','playbooks'
  ] loop
    execute format(
      'create trigger %I before insert on public.%I
       for each row execute function public.enforce_cognitive_initial_status()',
      table_name || '_initial_state', table_name
    );
  end loop;
end
$$;

-- Immutable evidence is append-only. Raw user-derived content is not placed in
-- immutable tables; redacted tombstone metadata is preserved instead.
create or replace function public.reject_cognitive_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'immutable_cognitive_evidence' using errcode = '42501';
end;
$$;
revoke all on function public.reject_cognitive_evidence_mutation() from public, anon, authenticated;
grant execute on function public.reject_cognitive_evidence_mutation() to service_role;

do $$
declare
  table_name text;
  immutable_tables constant text[] := array[
    'research_sources', 'research_claim_sources', 'research_contradictions',
    'research_retrieval_events', 'execution_plan_snapshots',
    'execution_evidence_records', 'evaluation_results', 'model_invocations',
    'tool_invocations', 'cognitive_capability_events', 'cognitive_budget_events',
    'cognitive_state_transition_events', 'finding_lifecycle_events',
    'cognitive_erasure_events'
  ];
begin
  foreach table_name in array immutable_tables loop
    execute format(
      'create trigger %I before update or delete on public.%I
       for each row execute function public.reject_cognitive_evidence_mutation()',
      table_name || '_immutable', table_name
    );
  end loop;
end
$$;

create or replace function public.cognitive_transition_task(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_expected public.cognitive_task_status,
  p_next public.cognitive_task_status,
  p_actor_identity text,
  p_transition_hash text
)
returns public.cognitive_task_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.cognitive_task_status;
  allowed boolean;
begin
  perform public.cognitive_assert_service_actor(
    array['cognitive_control_plane','product_intelligence_operator'],
    p_actor_identity
  );
  select status into current_status
  from public.intelligence_tasks
  where id = p_task_id and project_id = p_project_id and platform = p_platform and environment = p_environment
  for update;
  if current_status is null or current_status <> p_expected then
    raise exception 'task_scope_or_expected_state_mismatch' using errcode = 'P0001';
  end if;
  allowed := case current_status
    when 'received' then p_next in ('planning', 'cancelled', 'quarantined')
    when 'planning' then p_next in ('awaiting_approval', 'failed', 'cancelled', 'budget_exhausted', 'quarantined')
    when 'awaiting_approval' then p_next in ('approved', 'failed', 'cancelled', 'quarantined')
    when 'approved' then p_next in ('executing', 'cancelled', 'quarantined')
    when 'executing' then p_next in ('evaluating', 'failed', 'cancelled', 'budget_exhausted', 'rollback_pending', 'quarantined')
    when 'evaluating' then p_next in ('completed', 'failed', 'rollback_pending', 'quarantined')
    when 'rollback_pending' then p_next in ('rollback_running', 'quarantined')
    when 'rollback_running' then p_next in ('rollback_succeeded', 'rollback_failed', 'quarantined')
    when 'rollback_failed' then p_next in ('quarantined', 'escalation_required')
    else false
  end;
  if not allowed then raise exception 'invalid_cognitive_task_transition' using errcode = 'P0001'; end if;
  update public.intelligence_tasks
    set status = p_next,
        updated_at = statement_timestamp(),
        cancelled_at = case when p_next = 'cancelled' then statement_timestamp() else cancelled_at end,
        quarantined_at = case when p_next = 'quarantined' then statement_timestamp() else quarantined_at end
  where id = p_task_id;
  insert into public.cognitive_state_transition_events(
    task_id, project_id, platform, environment, entity_type, entity_id,
    prior_status, next_status, actor_identity, transition_hash
  ) values (
    p_task_id, p_project_id, p_platform, p_environment, 'task', p_task_id,
    current_status::text, p_next::text, p_actor_identity, p_transition_hash
  );
  return p_next;
end;
$$;
revoke all on function public.cognitive_transition_task(uuid, uuid, public.cognitive_platform, public.cognitive_environment, public.cognitive_task_status, public.cognitive_task_status, text, text)
  from public, anon, authenticated;
grant execute on function public.cognitive_transition_task(uuid, uuid, public.cognitive_platform, public.cognitive_environment, public.cognitive_task_status, public.cognitive_task_status, text, text)
  to service_role;

create or replace function public.cognitive_transition_entity(
  p_entity_type text,
  p_entity_id uuid,
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_expected text,
  p_next text,
  p_actor_identity text,
  p_transition_hash text,
  p_approval_request_id uuid,
  p_snapshot_hash text,
  p_capability_id text,
  p_evidence_manifest_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean := false;
  changed integer := 0;
  approval_scope_hash text;
  run_value public.execution_runs%rowtype;
begin
  perform public.cognitive_assert_service_actor(
    array['cognitive_control_plane','product_intelligence_operator'],
    p_actor_identity
  );
  if p_actor_identity not in ('cognitive_control_plane','product_intelligence_operator')
     or p_transition_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'cognitive_transition_actor_or_hash_invalid' using errcode='P0001';
  end if;
  allowed := case p_entity_type
    when 'research_claim' then
      (p_expected = 'pending' and p_next in ('supported','blocked','stale','contradicted'))
      or (p_expected = 'supported' and p_next in ('stale','contradicted'))
      or (p_expected = 'contradicted' and p_next = 'blocked')
    when 'hypothesis' then
      (p_expected = 'received' and p_next = 'planned')
      or (p_expected = 'planned' and p_next in ('approved','denied','cancelled'))
    when 'solution_candidate' then
      (p_expected = 'received' and p_next = 'planned')
      or (p_expected = 'planned' and p_next in ('approved','denied','cancelled'))
    when 'experiment' then
      (p_expected = 'received' and p_next = 'planned')
      or (p_expected = 'planned' and p_next in ('approved','denied','cancelled'))
      or (p_expected = 'approved' and p_next = 'running')
      or (p_expected = 'running' and p_next in ('evaluating','failed','cancelled'))
      or (p_expected = 'evaluating' and p_next in ('completed','failed'))
    when 'execution_plan' then
      (p_expected = 'draft' and p_next = 'awaiting_approval')
      or (p_expected = 'awaiting_approval' and p_next in ('approved','denied','cancelled'))
      or (p_expected = 'approved' and p_next in ('invalidated','cancelled'))
    when 'execution_run' then
      (p_expected = 'received' and p_next in ('executing','cancelled','quarantined'))
      or (p_expected = 'executing' and p_next in ('evaluating','failed','cancelled','budget_exhausted','rollback_pending','quarantined'))
      or (p_expected = 'evaluating' and p_next in ('completed','failed','rollback_pending','quarantined'))
      or (p_expected = 'rollback_pending' and p_next in ('rollback_running','quarantined'))
      or (p_expected = 'rollback_running' and p_next in ('rollback_succeeded','rollback_failed','quarantined'))
      or (p_expected = 'rollback_failed' and p_next in ('quarantined','escalation_required'))
    when 'lesson' then
      (p_expected = 'proposed' and p_next in ('accepted','rejected','quarantined'))
    when 'playbook' then
      (p_expected = 'draft' and p_next in ('reviewed','quarantined'))
      or (p_expected = 'reviewed' and p_next in ('approved','quarantined'))
    else false
  end;
  if not allowed then raise exception 'invalid_cognitive_entity_transition' using errcode = 'P0001'; end if;
  if p_entity_type = 'execution_plan' and p_next = 'approved' then
    select snapshot.approval_scope_hash into approval_scope_hash
    from public.execution_plan_snapshots snapshot
    where snapshot.plan_id=p_entity_id and snapshot.task_id=p_task_id
      and snapshot.project_id=p_project_id and snapshot.platform=p_platform
      and snapshot.environment=p_environment
      and snapshot.approval_request_id=p_approval_request_id
      and snapshot.snapshot_hash=p_snapshot_hash;
    if approval_scope_hash is null or not public.cognitive_approval_is_fresh(
      p_approval_request_id,'approve_cognitive_execution',p_platform,
      approval_scope_hash,p_snapshot_hash
    ) then raise exception 'execution_plan_fresh_approval_required' using errcode='P0001'; end if;
  end if;

  if p_entity_type = 'execution_run' then
    select * into run_value from public.execution_runs
    where id=p_entity_id and task_id=p_task_id and project_id=p_project_id
      and platform=p_platform and environment=p_environment
    for update;
    if run_value.id is null
       or run_value.snapshot_hash is distinct from p_snapshot_hash
       or not exists (
         select 1 from public.execution_plan_snapshots snapshot
         where snapshot.id=run_value.snapshot_id and snapshot.task_id=p_task_id
           and snapshot.project_id=p_project_id and snapshot.platform=p_platform
           and snapshot.environment=p_environment and snapshot.snapshot_hash=p_snapshot_hash
       ) then
      raise exception 'execution_run_snapshot_mismatch' using errcode='P0001';
    end if;
    if p_next='executing' and not exists (
      select 1 from public.cognitive_capabilities capability
      where capability.capability_id=p_capability_id
        and capability.task_id=p_task_id and capability.project_id=p_project_id
        and capability.platform=p_platform and capability.environment=p_environment
        and capability.plan_snapshot_hash=p_snapshot_hash
        and capability.approval_request_id=p_approval_request_id
        and capability.status='active' and capability.revoked_at is null
        and capability.not_before <= statement_timestamp()
        and capability.expires_at > statement_timestamp()
        and public.cognitive_approval_is_fresh(
          capability.approval_request_id,capability.operation,p_platform,
          capability.approval_scope_hash,p_snapshot_hash
        )
    ) then raise exception 'execution_run_active_capability_required' using errcode='P0001'; end if;
    if p_next='evaluating' and (
      p_evidence_manifest_hash !~ '^[a-f0-9]{64}$'
      or run_value.evidence_manifest_hash is distinct from p_evidence_manifest_hash
      or run_value.final_commit is null
      or not exists (
        select 1 from public.execution_evidence_records evidence
        where evidence.run_id=p_entity_id and evidence.task_id=p_task_id
          and evidence.final_commit=run_value.final_commit
          and evidence.evidence_type='test_exit'
      )
      or not exists (
        select 1 from public.execution_evidence_records evidence
        where evidence.run_id=p_entity_id and evidence.task_id=p_task_id
          and evidence.final_commit=run_value.final_commit
          and evidence.evidence_type='diff_hash'
      )
    ) then raise exception 'execution_run_trusted_evidence_required' using errcode='P0001'; end if;
    if p_next='completed' and not exists (
      select 1 from public.evaluation_results evaluation
      where evaluation.execution_run_id=p_entity_id
        and evaluation.task_id=p_task_id and evaluation.project_id=p_project_id
        and evaluation.platform=p_platform and evaluation.environment=p_environment
        and evaluation.snapshot_hash=p_snapshot_hash
        and evaluation.evaluation_status='pass'
        and evaluation.completion_supported=true
        and evaluation.owner_approval_granted=false
        and evaluation.evaluator_write_allowed=false
    ) then raise exception 'execution_run_passing_evaluation_required' using errcode='P0001'; end if;
  end if;

  if p_entity_type = 'research_claim' and p_next = 'supported' and not exists (
    select 1
    from public.research_claims claim
    where claim.id=p_entity_id and claim.task_id=p_task_id and claim.project_id=p_project_id
      and claim.platform=p_platform and claim.environment=p_environment
      and claim.freshness_deadline > statement_timestamp()
      and claim.contradiction_state not in ('detected','unresolved')
      and (
        (
          claim.category in ('technical','platform_policy','security')
          and exists (
            select 1
            from public.research_claim_sources relation
            join public.research_sources source on
              source.id=relation.source_id and source.task_id=relation.task_id
              and source.project_id=relation.project_id and source.platform=relation.platform
              and source.environment=relation.environment
            where relation.claim_id=claim.id and relation.relationship='supports'
              and source.is_primary=true
              and source.source_type in ('official_documentation','security_advisory','platform_policy','store_policy')
              and source.citation_metadata <> '{}'::jsonb
              and source.freshness_deadline > statement_timestamp()
              and source.freshness_deadline >= claim.freshness_deadline
              and exists (
                select 1 from public.research_retrieval_events retrieval
                where retrieval.source_id=source.id and retrieval.task_id=source.task_id
                  and retrieval.result='accepted'
                  and retrieval.request_url_hash=source.canonical_url_hash
                  and retrieval.response_hash=source.content_hash
              )
          )
        )
        or (
          claim.category='consequential_news'
          and (
            select least(
              count(distinct lower(source.publisher)),
              count(distinct source.canonical_url_hash),
              count(distinct source.content_hash)
            )
            from public.research_claim_sources relation
            join public.research_sources source on
              source.id=relation.source_id and source.task_id=relation.task_id
              and source.project_id=relation.project_id and source.platform=relation.platform
              and source.environment=relation.environment
            where relation.claim_id=claim.id and relation.relationship='supports'
              and source.source_type='news' and source.citation_metadata <> '{}'::jsonb
              and source.freshness_deadline > statement_timestamp()
              and source.freshness_deadline >= claim.freshness_deadline
              and exists (
                select 1 from public.research_retrieval_events retrieval
                where retrieval.source_id=source.id and retrieval.task_id=source.task_id
                  and retrieval.result='accepted'
                  and retrieval.request_url_hash=source.canonical_url_hash
                  and retrieval.response_hash=source.content_hash
              )
          ) >= 2
        )
        or (
          claim.category='product'
          and exists (
            select 1
            from public.research_claim_sources relation
            join public.research_sources source on
              source.id=relation.source_id and source.task_id=relation.task_id
              and source.project_id=relation.project_id and source.platform=relation.platform
              and source.environment=relation.environment
            where relation.claim_id=claim.id and relation.relationship='supports'
              and source.citation_metadata <> '{}'::jsonb
              and source.freshness_deadline > statement_timestamp()
              and source.freshness_deadline >= claim.freshness_deadline
              and exists (
                select 1 from public.research_retrieval_events retrieval
                where retrieval.source_id=source.id and retrieval.task_id=source.task_id
                  and retrieval.result='accepted'
                  and retrieval.request_url_hash=source.canonical_url_hash
                  and retrieval.response_hash=source.content_hash
              )
          )
        )
      )
      and not exists (
        select 1 from public.research_contradictions contradiction
        where contradiction.claim_id=claim.id and contradiction.resolution_state='open'
      )
  ) then
    raise exception 'research_claim_support_requirements_not_met' using errcode = 'P0001';
  end if;

  if p_entity_type = 'research_claim' then
    update public.research_claims set
      status=p_next,
      support_state=case
        when p_next='supported' then 'supported'
        when p_next='stale' then 'stale'
        when p_next='contradicted' then 'contradicted'
        else 'blocked'
      end
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  elsif p_entity_type = 'hypothesis' then
    update public.hypotheses set status=p_next
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  elsif p_entity_type = 'solution_candidate' then
    update public.solution_candidates set status=p_next
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  elsif p_entity_type = 'experiment' then
    update public.experiments set status=p_next
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  elsif p_entity_type = 'execution_plan' then
    update public.execution_plans set status=p_next
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  elsif p_entity_type = 'execution_run' then
    update public.execution_runs set status=p_next
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  elsif p_entity_type = 'lesson' then
    update public.lessons set status=p_next
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  elsif p_entity_type = 'playbook' then
    update public.playbooks set status=p_next
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  end if;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'entity_scope_or_expected_state_mismatch' using errcode = 'P0001'; end if;
  insert into public.cognitive_state_transition_events(
    task_id, project_id, platform, environment, entity_type, entity_id,
    prior_status, next_status, actor_identity, transition_hash
  ) values (
    p_task_id, p_project_id, p_platform, p_environment, p_entity_type, p_entity_id,
    p_expected, p_next, p_actor_identity, p_transition_hash
  );
  return p_next;
end;
$$;
revoke all on function public.cognitive_transition_entity(text, uuid, uuid, uuid, public.cognitive_platform, public.cognitive_environment, text, text, text, text, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cognitive_transition_entity(text, uuid, uuid, uuid, public.cognitive_platform, public.cognitive_environment, text, text, text, text, uuid, text, text, text)
  to service_role;

create or replace function public.cognitive_consume_capability(
  p_capability_id text,
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
  p_bytes bigint,
  p_cost numeric,
  p_approval_scope_hash text,
  p_plan_snapshot_hash text,
  p_request_hash text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_value public.cognitive_capabilities%rowtype;
  sequence_value integer;
  task_cancelled timestamptz;
  task_quarantined timestamptz;
  approval_status text;
  approval_expires timestamptz;
  approval_platform text;
  approval_scope_hash text;
  emergency_status text;
begin
  perform public.cognitive_assert_service_actor(array['cognitive_control_plane'],null);
  select * into row_value from public.cognitive_capabilities
  where capability_id = p_capability_id for update;
  if row_value.id is null then raise exception 'capability_missing' using errcode = 'P0001'; end if;
  select cancelled_at, quarantined_at into task_cancelled, task_quarantined
  from public.intelligence_tasks
  where id = p_task_id and project_id = p_project_id and platform = p_platform and environment = p_environment;
  select status, expires_at, platform, metadata->>'approval_scope_hash'
    into approval_status, approval_expires, approval_platform, approval_scope_hash
  from public.autonomous_approval_requests
  where id = row_value.approval_request_id;
  select status into emergency_status
  from public.autonomous_system_emergency_states
  where system_id = 'product_intelligence_operator';
  if row_value.status <> 'active' or statement_timestamp() < row_value.not_before
     or statement_timestamp() >= row_value.expires_at or row_value.revoked_at is not null
     or task_cancelled is not null or task_quarantined is not null
     or approval_status <> 'approved' or approval_expires <= statement_timestamp()
     or approval_platform <> p_platform::text or approval_scope_hash <> p_approval_scope_hash
     or coalesce(emergency_status, 'emergency_stop') <> 'active'
     or row_value.task_id <> p_task_id or row_value.project_id <> p_project_id
     or row_value.repository_full_name <> p_repository_full_name
     or row_value.branch_name <> p_branch_name or row_value.platform <> p_platform
     or row_value.environment <> p_environment or row_value.provider <> p_provider
     or row_value.operation <> p_operation
     or (
       p_path ~* '^(supabase/migrations/|app\.json$|app\.config\.|eas\.json$|config/release/)|(^|/)(auth|rls|role|money|payment|revenuecat|provider)([._/-]|$)'
       and row_value.risk_level <> 'high'
     )
     or row_value.approval_scope_hash <> p_approval_scope_hash
     or row_value.plan_snapshot_hash <> p_plan_snapshot_hash
     or not exists (
       select 1 from unnest(row_value.path_scopes) scope
       where p_path = rtrim(scope, '/') or p_path like rtrim(scope, '/') || '/%'
     )
     or row_value.remaining_calls < 1 or p_bytes < 0 or p_bytes > row_value.remaining_bytes
     or p_cost < 0 or p_cost > row_value.remaining_cost then
    raise exception 'capability_scope_or_budget_rejected' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.cognitive_capability_events
    where capability_id = row_value.id and call_id = p_call_id
  ) then raise exception 'capability_replay' using errcode = '23505'; end if;
  sequence_value := row_value.next_usage_sequence;
  update public.cognitive_capabilities set
    remaining_calls = remaining_calls - 1,
    remaining_bytes = remaining_bytes - p_bytes,
    remaining_cost = remaining_cost - p_cost,
    consumed_at = statement_timestamp(),
    next_usage_sequence = next_usage_sequence + 1,
    status = case when remaining_calls - 1 = 0 then 'exhausted'::public.cognitive_capability_status else status end
  where id = row_value.id;
  insert into public.cognitive_capability_events(
    capability_id, task_id, project_id, platform, environment, call_id,
    usage_sequence, event_type, request_hash
  ) values (
    row_value.id, p_task_id, p_project_id, p_platform, p_environment, p_call_id,
    sequence_value, 'consumed', p_request_hash
  );
  return sequence_value;
end;
$$;
revoke all on function public.cognitive_consume_capability(text, text, uuid, uuid, text, text, public.cognitive_platform, public.cognitive_environment, text, text, text, bigint, numeric, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cognitive_consume_capability(text, text, uuid, uuid, text, text, public.cognitive_platform, public.cognitive_environment, text, text, text, bigint, numeric, text, text, text)
  to service_role;

create or replace function public.cognitive_reserve_budget(
  p_budget_id uuid,
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_reservation_id text,
  p_model_tokens bigint,
  p_model_cost numeric,
  p_tool_calls integer,
  p_tool_bytes bigint,
  p_child_tasks integer,
  p_recursion_depth integer,
  p_retry_count integer,
  p_concurrent_calls integer,
  p_action_hash text,
  p_plan_snapshot_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare row_value public.intelligence_budgets%rowtype;
declare task_value public.intelligence_tasks%rowtype;
declare emergency_status text;
begin
  perform public.cognitive_assert_service_actor(array['cognitive_control_plane'],null);
  select * into row_value from public.intelligence_budgets
    where id=p_budget_id and task_id=p_task_id and project_id=p_project_id
      and platform=p_platform and environment=p_environment
    for update;
  select * into task_value from public.intelligence_tasks
    where id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment;
  select status into emergency_status from public.autonomous_system_emergency_states
    where system_id='product_intelligence_operator';
  if row_value.id is null or task_value.id is null or task_value.cancelled_at is not null
     or task_value.quarantined_at is not null or statement_timestamp() >= row_value.deadline_at
     or statement_timestamp() >= task_value.deadman_at
     or coalesce(emergency_status,'emergency_stop') <> 'active'
     or p_model_tokens < 0 or p_model_cost < 0 or p_tool_calls < 0
     or p_tool_bytes < 0 or p_child_tasks < 0 or p_recursion_depth < 0
     or p_retry_count < 0 or p_concurrent_calls < 1
     or p_recursion_depth > row_value.max_recursion_depth
     or p_retry_count > row_value.max_retries
     or row_value.active_concurrent_calls + p_concurrent_calls > row_value.max_concurrent_calls
     or p_action_hash !~ '^[a-f0-9]{64}$' or p_plan_snapshot_hash !~ '^[a-f0-9]{64}$'
     or (row_value.last_action_hash=p_action_hash and row_value.repeated_action_count >= 3)
     or (row_value.last_plan_hash=p_plan_snapshot_hash and row_value.repeated_plan_count >= 3)
     or row_value.used_model_tokens + p_model_tokens > row_value.max_model_tokens
     or row_value.used_model_cost + p_model_cost > row_value.max_model_cost
     or row_value.used_tool_calls + p_tool_calls > row_value.max_tool_calls
     or row_value.used_tool_bytes + p_tool_bytes > row_value.max_tool_bytes
     or row_value.used_child_tasks + p_child_tasks > row_value.max_child_tasks then
    raise exception 'cognitive_budget_reservation_rejected' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.cognitive_budget_events
    where budget_id=p_budget_id and reservation_id=p_reservation_id
  ) then raise exception 'cognitive_budget_reservation_replay' using errcode = '23505'; end if;
  update public.intelligence_budgets set
    used_model_tokens=used_model_tokens+p_model_tokens,
    used_model_cost=used_model_cost+p_model_cost,
    used_tool_calls=used_tool_calls+p_tool_calls,
    used_tool_bytes=used_tool_bytes+p_tool_bytes,
    used_child_tasks=used_child_tasks+p_child_tasks,
    active_concurrent_calls=active_concurrent_calls+p_concurrent_calls,
    repeated_action_count=case when last_action_hash=p_action_hash then repeated_action_count+1 else 1 end,
    last_action_hash=p_action_hash,
    repeated_plan_count=case when last_plan_hash=p_plan_snapshot_hash then repeated_plan_count+1 else 1 end,
    last_plan_hash=p_plan_snapshot_hash
  where id=p_budget_id;
  insert into public.cognitive_budget_events(
    budget_id,task_id,project_id,platform,environment,reservation_id,event_type,usage
  ) values (
    p_budget_id,p_task_id,p_project_id,p_platform,p_environment,p_reservation_id,'reserved',
    jsonb_build_object(
      'model_tokens',p_model_tokens,'model_cost',p_model_cost,'tool_calls',p_tool_calls,
      'tool_bytes',p_tool_bytes,'child_tasks',p_child_tasks,
      'recursion_depth',p_recursion_depth,'retry_count',p_retry_count,
      'concurrent_calls',p_concurrent_calls,'action_hash',p_action_hash,
      'plan_snapshot_hash',p_plan_snapshot_hash
    )
  );
  return true;
end;
$$;
revoke all on function public.cognitive_reserve_budget(uuid, uuid, uuid, public.cognitive_platform, public.cognitive_environment, text, bigint, numeric, integer, bigint, integer, integer, integer, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.cognitive_reserve_budget(uuid, uuid, uuid, public.cognitive_platform, public.cognitive_environment, text, bigint, numeric, integer, bigint, integer, integer, integer, integer, text, text)
  to service_role;

create or replace function public.cognitive_settle_budget(
  p_budget_id uuid,
  p_task_id uuid,
  p_reservation_id text,
  p_actual_model_tokens bigint,
  p_actual_model_cost numeric,
  p_actual_tool_calls integer,
  p_actual_tool_bytes bigint,
  p_actual_child_tasks integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare row_value public.intelligence_budgets%rowtype;
declare reserved jsonb;
declare task_value public.intelligence_tasks%rowtype;
declare emergency_status text;
begin
  perform public.cognitive_assert_service_actor(array['cognitive_control_plane'],null);
  select * into row_value from public.intelligence_budgets
    where id=p_budget_id and task_id=p_task_id for update;
  select usage into reserved from public.cognitive_budget_events
    where budget_id=p_budget_id and reservation_id=p_reservation_id and event_type='reserved';
  select * into task_value from public.intelligence_tasks
    where id=p_task_id and project_id=row_value.project_id
      and platform=row_value.platform and environment=row_value.environment;
  select status into emergency_status from public.autonomous_system_emergency_states
    where system_id='product_intelligence_operator';
  if row_value.id is null or reserved is null
     or task_value.id is null or task_value.cancelled_at is not null
     or task_value.quarantined_at is not null
     or statement_timestamp() >= task_value.deadman_at
     or statement_timestamp() >= row_value.deadline_at
     or coalesce(emergency_status,'emergency_stop') <> 'active'
     or exists (
       select 1 from public.cognitive_budget_events
       where budget_id=p_budget_id and reservation_id=p_reservation_id and event_type='settled'
     )
     or p_actual_model_tokens < 0 or p_actual_model_cost < 0 or p_actual_tool_calls < 0
     or p_actual_tool_bytes < 0 or p_actual_child_tasks < 0
     or row_value.used_model_tokens-(reserved->>'model_tokens')::bigint+p_actual_model_tokens > row_value.max_model_tokens
     or row_value.used_model_cost-(reserved->>'model_cost')::numeric+p_actual_model_cost > row_value.max_model_cost
     or row_value.used_tool_calls-(reserved->>'tool_calls')::integer+p_actual_tool_calls > row_value.max_tool_calls
     or row_value.used_tool_bytes-(reserved->>'tool_bytes')::bigint+p_actual_tool_bytes > row_value.max_tool_bytes
     or row_value.used_child_tasks-(reserved->>'child_tasks')::integer+p_actual_child_tasks > row_value.max_child_tasks then
    raise exception 'cognitive_budget_settlement_rejected' using errcode = 'P0001';
  end if;
  update public.intelligence_budgets set
    used_model_tokens=used_model_tokens-(reserved->>'model_tokens')::bigint+p_actual_model_tokens,
    used_model_cost=used_model_cost-(reserved->>'model_cost')::numeric+p_actual_model_cost,
    used_tool_calls=used_tool_calls-(reserved->>'tool_calls')::integer+p_actual_tool_calls,
    used_tool_bytes=used_tool_bytes-(reserved->>'tool_bytes')::bigint+p_actual_tool_bytes,
    used_child_tasks=used_child_tasks-(reserved->>'child_tasks')::integer+p_actual_child_tasks,
    active_concurrent_calls=active_concurrent_calls-(reserved->>'concurrent_calls')::integer
  where id=p_budget_id;
  insert into public.cognitive_budget_events(
    budget_id,task_id,project_id,platform,environment,reservation_id,event_type,usage
  ) values (
    p_budget_id,p_task_id,row_value.project_id,row_value.platform,row_value.environment,
    p_reservation_id,'settled',
    jsonb_build_object(
      'model_tokens',p_actual_model_tokens,'model_cost',p_actual_model_cost,
      'tool_calls',p_actual_tool_calls,'tool_bytes',p_actual_tool_bytes,
      'child_tasks',p_actual_child_tasks
    )
  );
  return true;
end;
$$;
revoke all on function public.cognitive_settle_budget(uuid, uuid, text, bigint, numeric, integer, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.cognitive_settle_budget(uuid, uuid, text, bigint, numeric, integer, bigint, integer)
  to service_role;

create or replace function public.cognitive_record_finding(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_finding_key text,
  p_finding_type text,
  p_target_scope text,
  p_severity text,
  p_evidence_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
begin
  perform public.cognitive_assert_service_actor(
    array['cognitive_control_plane','product_intelligence_operator'],
    null
  );
  if length(coalesce(p_finding_type, '')) not between 3 and 128
     or length(coalesce(p_target_scope, '')) not between 3 and 256
     or public.cognitive_text_has_secret(p_finding_type)
     or public.cognitive_text_has_private_identifier(p_finding_type)
     or public.cognitive_text_has_secret(p_target_scope)
     or public.cognitive_text_has_private_identifier(p_target_scope) then
    raise exception 'cognitive_finding_payload_rejected' using errcode = 'P0001';
  end if;
  insert into public.cognitive_current_findings(
    task_id, project_id, platform, environment, finding_key, finding_type,
    target_scope, severity, first_seen_at, last_seen_at, evidence_hash
  ) values (
    p_task_id, p_project_id, p_platform, p_environment, p_finding_key, p_finding_type,
    p_target_scope, p_severity, statement_timestamp(), statement_timestamp(), p_evidence_hash
  )
  on conflict (task_id, finding_key) do update set
    occurrence_count = public.cognitive_current_findings.occurrence_count + 1,
    last_seen_at = statement_timestamp(),
    current_status = 'open',
    resolved_at = null,
    evidence_hash = excluded.evidence_hash
  returning id into result_id;
  insert into public.finding_lifecycle_events(
    finding_id, task_id, project_id, platform, environment, event_type, evidence_hash
  )
  values (
    result_id, p_task_id, p_project_id, p_platform, p_environment,
    case when (select occurrence_count from public.cognitive_current_findings where id = result_id) = 1 then 'detected' else 'recurred' end,
    p_evidence_hash
  );
  return result_id;
end;
$$;
revoke all on function public.cognitive_record_finding(uuid, uuid, public.cognitive_platform, public.cognitive_environment, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cognitive_record_finding(uuid, uuid, public.cognitive_platform, public.cognitive_environment, text, text, text, text, text)
  to service_role;

create or replace function public.cognitive_resolve_finding(
  p_task_id uuid,
  p_finding_key text,
  p_evidence_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
declare finding_value public.cognitive_current_findings%rowtype;
begin
  perform public.cognitive_assert_service_actor(
    array['cognitive_control_plane','product_intelligence_operator'],
    null
  );
  update public.cognitive_current_findings
  set current_status = 'resolved', resolved_at = statement_timestamp(), last_seen_at = statement_timestamp()
  where task_id = p_task_id and finding_key = p_finding_key and current_status = 'open'
  returning * into finding_value;
  result_id := finding_value.id;
  if result_id is null then raise exception 'open_finding_missing' using errcode = 'P0001'; end if;
  insert into public.finding_lifecycle_events(
    finding_id, task_id, project_id, platform, environment, event_type, evidence_hash
  ) values (
    result_id, p_task_id, finding_value.project_id, finding_value.platform,
    finding_value.environment, 'resolved', p_evidence_hash
  );
  return result_id;
end;
$$;
revoke all on function public.cognitive_resolve_finding(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cognitive_resolve_finding(uuid, text, text) to service_role;

create or replace function public.cognitive_erase_finding_details(
  p_task_id uuid,
  p_finding_key text,
  p_tombstone_hash text,
  p_actor_identity text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
declare finding_value public.cognitive_current_findings%rowtype;
begin
  perform public.cognitive_assert_service_actor(
    array['cognitive_control_plane','privacy_compliance_operator'],
    p_actor_identity
  );
  if p_tombstone_hash !~ '^[a-f0-9]{64}$'
     or p_actor_identity not in ('cognitive_control_plane','privacy_compliance_operator') then
    raise exception 'cognitive_finding_erasure_rejected' using errcode = 'P0001';
  end if;
  select * into finding_value
  from public.cognitive_current_findings
  where task_id = p_task_id and finding_key = p_finding_key
  for update;
  if finding_value.id is null or finding_value.legal_hold or finding_value.erased_at is not null then
    raise exception 'cognitive_finding_erasure_rejected' using errcode = 'P0001';
  end if;
  update public.cognitive_current_findings
  set finding_type = 'erased_finding',
      target_scope = 'erased_scope',
      current_status = 'resolved',
      resolved_at = coalesce(resolved_at, statement_timestamp()),
      last_seen_at = statement_timestamp(),
      erased_at = statement_timestamp(),
      data_class = 'operational_metadata'
  where id = finding_value.id
  returning id into result_id;
  insert into public.finding_lifecycle_events(
    finding_id, task_id, project_id, platform, environment, event_type, evidence_hash
  ) values (
    result_id, finding_value.task_id, finding_value.project_id,
    finding_value.platform, finding_value.environment, 'erased', p_tombstone_hash
  );
  insert into public.cognitive_erasure_events(
    task_id, project_id, platform, environment, target_table, target_id,
    prior_data_class, tombstone_hash, legal_hold, erased_at, actor_identity
  ) values (
    finding_value.task_id, finding_value.project_id, finding_value.platform,
    finding_value.environment, 'cognitive_current_findings', finding_value.id,
    finding_value.data_class, p_tombstone_hash, false, statement_timestamp(),
    p_actor_identity
  );
  return result_id;
end;
$$;
revoke all on function public.cognitive_erase_finding_details(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cognitive_erase_finding_details(uuid, text, text, text)
  to service_role;

-- RLS/readback: ordinary users receive nothing. Owner/super-admin and an
-- operator with the exact permission and an exact JWT project/task/platform
-- assignment may read source-safe rows. No client writes.
create or replace function public.cognitive_can_read_scope(
  p_project_id uuid,
  p_task_id uuid,
  p_platform public.cognitive_platform
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  metadata jsonb := coalesce(claims->'app_metadata','{}'::jsonb);
  project_ids jsonb := coalesce(metadata->'cognitive_project_ids','[]'::jsonb);
  task_ids jsonb := coalesce(metadata->'cognitive_task_ids','[]'::jsonb);
  platforms jsonb := coalesce(metadata->'cognitive_platforms','[]'::jsonb);
begin
  if public.has_platform_role(array['owner'::text,'super_admin'::text]) then
    return true;
  end if;
  return public.has_platform_role(array['operator'::text])
    and public.has_platform_permission('admin.cognitive.read')
    and jsonb_typeof(project_ids)='array'
    and project_ids ? p_project_id::text
    and (
      p_task_id is null
      or (jsonb_typeof(task_ids)='array' and task_ids ? p_task_id::text)
    )
    and (
      p_platform is null
      or (jsonb_typeof(platforms)='array' and platforms ? p_platform::text)
    );
end;
$$;
revoke all on function public.cognitive_can_read_scope(
  uuid,uuid,public.cognitive_platform
) from public, anon;
grant execute on function public.cognitive_can_read_scope(
  uuid,uuid,public.cognitive_platform
) to authenticated, service_role;

do $$
declare
  table_name text;
  scope_expression text;
  cognitive_tables constant text[] := array[
    'cognitive_projects', 'intelligence_tasks', 'research_sources', 'research_claims',
    'research_claim_sources', 'research_contradictions', 'research_retrieval_events',
    'knowledge_entities', 'knowledge_relationships', 'architecture_components',
    'architecture_dependencies', 'decision_records', 'hypotheses', 'solution_candidates',
    'experiments', 'experiment_results', 'execution_plans', 'execution_plan_snapshots',
    'execution_runs', 'execution_evidence_records', 'evaluation_results', 'lessons',
    'playbooks', 'model_invocations', 'tool_invocations', 'intelligence_budgets',
    'cognitive_capabilities', 'cognitive_capability_events', 'cognitive_budget_events',
    'cognitive_resource_leases', 'cognitive_state_transition_events',
    'cognitive_current_findings', 'finding_lifecycle_events', 'cognitive_erasure_events'
  ];
begin
  foreach table_name in array cognitive_tables loop
    if table_name = 'cognitive_projects' then
      scope_expression := 'public.cognitive_can_read_scope(id,null,null)';
    elsif table_name = 'intelligence_tasks' then
      scope_expression := 'public.cognitive_can_read_scope(project_id,id,platform)';
    else
      scope_expression := 'public.cognitive_can_read_scope(project_id,task_id,platform)';
    end if;
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('revoke update, delete, truncate, references, trigger on table public.%I from service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant select, insert on table public.%I to service_role', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (%s)',
      table_name || '_cognitive_exact_read', table_name, scope_expression
    );
  end loop;
end
$$;

-- Mutable current rows are changed only through the security-definer state
-- machine/RPC path. The grants above intentionally omit UPDATE/DELETE for
-- service_role on each cognitive table and do not alter unrelated tables.
-- Sensitive control-plane rows also have no direct service-role INSERT path;
-- future activation requires separately reviewed issuance/recording RPCs.
revoke insert on public.execution_plans, public.execution_plan_snapshots,
  public.execution_runs, public.execution_evidence_records,
  public.evaluation_results, public.cognitive_capabilities,
  public.intelligence_budgets, public.cognitive_resource_leases,
  public.lessons, public.playbooks
from service_role;

-- Independent-retest closeout: direct service inserts are removed. All future
-- activation writes must pass a reviewed security-definer RPC.
do $$
declare
  table_name text;
  mutable_content_tables constant text[] := array[
    'research_sources','research_claims','knowledge_entities','knowledge_relationships',
    'architecture_components','architecture_dependencies','decision_records',
    'hypotheses','solution_candidates','experiments','experiment_results',
    'execution_plans','execution_runs','evaluation_results','lessons','playbooks',
    'model_invocations','tool_invocations','intelligence_budgets'
  ];
begin
  foreach table_name in array mutable_content_tables loop
    execute format(
      'alter table public.%I add constraint %I check (
        data_class in (''non_personal_audit'',''security_evidence'',''legal_hold'')
        or retention_until is not null
      )',
      table_name, table_name || '_retention_required'
    );
  end loop;
end
$$;

alter table public.research_sources
  add constraint research_sources_bounded_fields_only
    check (summary = '{}'::jsonb and evidence_metadata = '{}'::jsonb),
  add constraint research_sources_citation_required
    check (citation_metadata <> '{}'::jsonb),
  add constraint research_sources_primary_type
    check (
      not is_primary or source_type in (
        'official_documentation','security_advisory','platform_policy','store_policy'
      )
    ),
  add constraint research_sources_no_user_content
    check (data_class <> 'user_derived');

alter table public.research_claims
  add constraint research_claims_bounded_fields_only
    check (summary = '{}'::jsonb and evidence_metadata = '{}'::jsonb),
  add constraint research_claims_no_user_content
    check (data_class <> 'user_derived');

alter table public.model_invocations
  add column invocation_key text not null check (
    length(invocation_key) between 8 and 128
    and not public.cognitive_text_has_secret(invocation_key)
    and not public.cognitive_text_has_private_identifier(invocation_key)
  ),
  add column schema_validation_result text not null check (schema_validation_result in ('passed','rejected')),
  add column invocation_result text not null check (invocation_result in ('completed','failed','timeout','rate_limited','cancelled')),
  add column retry_sequence integer not null default 0 check (retry_sequence between 0 and 5),
  add column fallback_from_invocation_id uuid,
  add column provider_billing_identity_hash text not null check (provider_billing_identity_hash ~ '^[a-f0-9]{64}$'),
  add constraint model_invocations_bounded_fields_only
    check (summary = '{}'::jsonb and evidence_metadata = '{}'::jsonb),
  add constraint model_invocations_no_user_content
    check (data_class <> 'user_derived'),
  add constraint model_invocations_idempotent unique (task_id, invocation_key),
  add foreign key (fallback_from_invocation_id, task_id, project_id, platform, environment)
    references public.model_invocations(id, task_id, project_id, platform, environment);

alter table public.tool_invocations
  add constraint tool_invocations_bounded_fields_only
    check (summary = '{}'::jsonb and evidence_metadata = '{}'::jsonb),
  add constraint tool_invocations_no_user_content
    check (data_class <> 'user_derived');

alter table public.evaluation_results
  add constraint evaluation_results_no_user_content
    check (data_class <> 'user_derived');

-- User-derived material is permitted only in the three tables covered by the
-- transactional erasure/tombstone RPC. Every other generic content surface is
-- structurally non-personal so a future caller cannot create unerasable memory.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'knowledge_relationships','architecture_components','architecture_dependencies',
    'solution_candidates','experiments','experiment_results','execution_plans',
    'execution_runs','lessons','playbooks','intelligence_budgets'
  ] loop
    execute format(
      'alter table public.%I add constraint %I check (data_class <> ''user_derived'')',
      table_name, table_name || '_no_user_content'
    );
  end loop;
end
$$;

alter table public.execution_plan_snapshots
  add column canonical_snapshot_hash text not null default repeat('0', 64),
  add constraint execution_snapshot_hash_matches_content
    check (snapshot_hash = canonical_snapshot_hash);

create or replace function public.cognitive_set_snapshot_hash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  calculated_hash text;
begin
  calculated_hash := encode(
    extensions.digest(convert_to(new.canonical_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if new.snapshot_hash is distinct from calculated_hash then
    raise exception 'snapshot hash does not match canonical content';
  end if;
  new.canonical_snapshot_hash := calculated_hash;
  return new;
end;
$$;
revoke all on function public.cognitive_set_snapshot_hash() from public, anon, authenticated, service_role;

create trigger execution_plan_snapshots_set_hash
before insert on public.execution_plan_snapshots
for each row execute function public.cognitive_set_snapshot_hash();

alter table public.cognitive_resource_leases
  add constraint cognitive_resource_leases_scope_unique
    unique (id, task_id, project_id, platform, environment);

create table public.cognitive_resource_lease_events (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  event_type text not null check (event_type in ('acquired','heartbeat','released','revoked','expired')),
  event_hash text not null check (event_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default statement_timestamp(),
  foreign key (lease_id, task_id, project_id, platform, environment)
    references public.cognitive_resource_leases(id, task_id, project_id, platform, environment)
);

create table public.cognitive_owner_review_requests (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  request_type text not null check (request_type in ('rollback_failed','security_quarantine','retention_decision')),
  request_status text not null default 'pending' check (request_status in ('pending','acknowledged','resolved')),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default statement_timestamp(),
  unique (task_id, request_type, request_status),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment)
);

create table public.cognitive_approval_bindings (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.autonomous_approval_requests(id),
  snapshot_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  approval_scope_hash text not null check (approval_scope_hash ~ '^[a-f0-9]{64}$'),
  bound_by uuid not null,
  binding_hash text not null check (binding_hash ~ '^[a-f0-9]{64}$'),
  bound_at timestamptz not null default statement_timestamp(),
  unique (approval_request_id, snapshot_id),
  foreign key (snapshot_id, task_id, project_id, platform, environment)
    references public.execution_plan_snapshots(id, task_id, project_id, platform, environment)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cognitive_resource_lease_events',
    'cognitive_owner_review_requests',
    'cognitive_approval_bindings'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated, service_role', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
        public.cognitive_can_read_scope(project_id,task_id,platform)
      )',
      table_name || '_cognitive_exact_read', table_name
    );
  end loop;
end
$$;

create trigger cognitive_resource_lease_events_immutable
before update or delete on public.cognitive_resource_lease_events
for each row execute function public.reject_cognitive_evidence_mutation();
create trigger cognitive_approval_bindings_immutable
before update or delete on public.cognitive_approval_bindings
for each row execute function public.reject_cognitive_evidence_mutation();

-- No caller, including service_role, can manufacture cognitive state by direct
-- INSERT/UPDATE/DELETE. Reviewed RPCs below are the only write surface.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cognitive_projects','intelligence_tasks','research_sources','research_claims',
    'research_claim_sources','research_contradictions','research_retrieval_events',
    'knowledge_entities','knowledge_relationships','architecture_components',
    'architecture_dependencies','decision_records','hypotheses','solution_candidates',
    'experiments','experiment_results','execution_plans','execution_plan_snapshots',
    'execution_runs','execution_evidence_records','evaluation_results','lessons',
    'playbooks','model_invocations','tool_invocations','intelligence_budgets',
    'cognitive_capabilities','cognitive_capability_events','cognitive_budget_events',
    'cognitive_resource_leases','cognitive_resource_lease_events',
    'cognitive_state_transition_events','cognitive_current_findings',
    'finding_lifecycle_events','cognitive_erasure_events','cognitive_owner_review_requests',
    'cognitive_approval_bindings','cognitive_research_authorities'
  ] loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on table public.%I from service_role',
      table_name
    );
  end loop;
end
$$;

-- The broker, not a model/caller, computes the URL and bounded-evidence hashes.
-- This is the only future source-ingestion write surface; the migration remains
-- undeployed and therefore cannot ingest production research.
create function public.cognitive_record_research_source(
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
  source_id uuid;
  v_canonical_host text;
  owner_identity text;
  url_hash text;
  body_hash text;
  ttl interval;
begin
  perform public.cognitive_assert_service_actor(array['research_source_broker'],p_actor_identity);
  -- The foundation has no deployed, non-caller-mintable transport receipt
  -- authority. Structural validation below is retained as the reviewed future
  -- contract, but no caller can currently persist a source as broker-observed.
  raise exception 'cognitive_research_broker_authority_unavailable' using errcode = 'P0001';
  v_canonical_host := lower((regexp_match(p_reference, '^https://([^/?#:@]+)(?:[/?]|$)'))[1]);
  ttl := case p_source_type
    when 'news' then interval '7 days'
    when 'security_advisory' then interval '14 days'
    when 'platform_policy' then interval '30 days'
    when 'store_policy' then interval '30 days'
    else interval '90 days'
  end;
  if p_actor_identity <> 'research_source_broker'
     or v_canonical_host is null
     or length(p_reference) not between 10 and 2048
     or p_reference ~ '#'
     or split_part(p_reference,'?',2) ~ '%'
     or public.cognitive_text_has_secret(p_reference)
     or public.cognitive_text_has_private_identifier(p_reference)
     or public.cognitive_text_has_secret(p_bounded_excerpt)
     or public.cognitive_text_has_private_identifier(p_bounded_excerpt)
     or length(p_bounded_excerpt) not between 1 and 2000
     or length(trim(p_citation_title)) not between 1 and 512
     or length(trim(p_citation_locator)) not between 1 and 512
     or public.cognitive_text_has_secret(p_citation_title)
     or public.cognitive_text_has_secret(p_citation_locator)
     or p_retrieval_date < statement_timestamp()-interval '48 hours'
     or p_retrieval_date > statement_timestamp()+interval '5 minutes'
     or p_freshness_deadline <= p_retrieval_date
     or p_freshness_deadline > p_retrieval_date+ttl
     or p_publication_date is not null and p_publication_date > p_retrieval_date
     or cardinality(p_resolved_address_hashes) not between 1 and 16
     or exists (
       select 1 from unnest(p_resolved_address_hashes) address_hash
       where address_hash !~ '^[a-f0-9]{64}$'
     )
     or not exists (
       select 1 from public.intelligence_tasks task
       where task.id=p_task_id and task.project_id=p_project_id
         and task.platform=p_platform and task.environment=p_environment
         and task.cancelled_at is null and task.quarantined_at is null
     ) then
    raise exception 'research_source_ingestion_rejected' using errcode='P0001';
  end if;
  select authority.ownership_identity into owner_identity
  from public.cognitive_research_authorities authority
  where authority.authority_id=p_authority_id
    and authority.canonical_host=v_canonical_host
    and authority.source_type=p_source_type
    and authority.publisher=p_publisher;
  if owner_identity is null then
    raise exception 'research_source_authority_rejected' using errcode='P0001';
  end if;
  url_hash := encode(extensions.digest(convert_to(p_reference,'UTF8'),'sha256'),'hex');
  body_hash := encode(extensions.digest(convert_to(p_bounded_excerpt,'UTF8'),'sha256'),'hex');
  insert into public.research_sources(
    task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
    summary,evidence_metadata,data_class,retention_until,legal_hold,
    authority_id,canonical_host,ownership_identity,source_reference_hash,
    canonical_url_hash,content_hash,publisher,publication_date,retrieval_date,
    freshness_deadline,source_type,is_primary,bounded_excerpt,citation_metadata,
    trusted_for_tool_execution
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,p_actor_identity,
    v_canonical_host || ':' || p_source_type || ':' || url_hash,'verified',
    '{}'::jsonb,'{}'::jsonb,'research_cache',p_freshness_deadline,false,
    p_authority_id,v_canonical_host,owner_identity,url_hash,url_hash,body_hash,
    p_publisher,p_publication_date,p_retrieval_date,p_freshness_deadline,
    p_source_type,p_is_primary,p_bounded_excerpt,
    jsonb_build_object('title',p_citation_title,'locator',p_citation_locator),false
  ) returning id into source_id;
  insert into public.research_retrieval_events(
    source_id,task_id,project_id,platform,environment,request_url_hash,
    resolved_address_hashes,response_hash,result
  ) values (
    source_id,p_task_id,p_project_id,p_platform,p_environment,url_hash,
    p_resolved_address_hashes,body_hash,'accepted'
  );
  return source_id;
end;
$$;
revoke all on function public.cognitive_record_research_source(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,
  timestamptz,timestamptz,timestamptz,text,boolean,text,text,text,text[],text
) from public,anon,authenticated;
grant execute on function public.cognitive_record_research_source(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,
  timestamptz,timestamptz,timestamptz,text,boolean,text,text,text,text[],text
) to service_role;

-- Superseded overloads were created in source order above for baseline
-- compatibility; remove them after the strict RPCs have been installed.
drop function if exists public.cognitive_transition_task(
  uuid, uuid, public.cognitive_platform, public.cognitive_environment,
  public.cognitive_task_status, public.cognitive_task_status, text, text
);
drop function if exists public.cognitive_consume_capability(
  text, text, uuid, uuid, text, text, public.cognitive_platform,
  public.cognitive_environment, text, text, text, bigint, numeric, text, text, text
);

create function public.cognitive_expire_capabilities(
  p_event_hash text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  perform public.cognitive_assert_service_actor(array['cognitive_control_plane'],null);
  if p_event_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'capability_expiry_event_hash_invalid' using errcode='P0001';
  end if;
  with expired as (
    update public.cognitive_capabilities
    set status='expired',next_usage_sequence=next_usage_sequence+1
    where status='active' and expires_at <= statement_timestamp()
    returning *
  ), events as (
    insert into public.cognitive_capability_events(
      capability_id,task_id,project_id,platform,environment,call_id,
      usage_sequence,event_type,reason,request_hash
    )
    select id,task_id,project_id,platform,environment,
      'expire-' || substr(id::text,1,16),next_usage_sequence-1,
      'expired','time_window_elapsed',p_event_hash
    from expired
    returning 1
  )
  select count(*) into changed from events;
  return changed;
end;
$$;
revoke all on function public.cognitive_expire_capabilities(text) from public, anon, authenticated;
grant execute on function public.cognitive_expire_capabilities(text) to service_role;

create function public.bind_cognitive_owner_approval(
  p_approval_request_id uuid,
  p_snapshot_id uuid,
  p_binding_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare request public.autonomous_approval_requests%rowtype;
declare snapshot public.execution_plan_snapshots%rowtype;
declare result_id uuid;
begin
  if auth.uid() is null
     or not public.autonomous_actor_has_owner_authority(
       auth.uid()::text,auth.jwt()->>'email'
     ) then raise exception 'owner_or_super_admin_required' using errcode='42501'; end if;
  select * into request from public.autonomous_approval_requests
  where id=p_approval_request_id for update;
  select * into snapshot from public.execution_plan_snapshots
  where id=p_snapshot_id;
  if request.id is null or snapshot.id is null
     or request.system_id <> 'product_intelligence_operator'
     or request.action_id <> 'approve_cognitive_execution'
     or request.platform <> snapshot.platform::text
     or request.status <> 'approved'
     or request.approved_by is distinct from auth.uid()
     or request.approved_at is null or request.expires_at <= statement_timestamp()
     or request.metadata->>'approval_scope_hash' is distinct from snapshot.approval_scope_hash
     or request.metadata->>'plan_snapshot_hash' is distinct from snapshot.snapshot_hash
     or jsonb_typeof(request.metadata->'allowed_operations') <> 'array'
     or jsonb_array_length(request.metadata->'allowed_operations') < 1
     or exists (
       select 1 from jsonb_array_elements_text(request.metadata->'allowed_operations') operation
       where operation not in (
         'repository_read_file','repository_list_files','repository_search',
         'repository_apply_patch','repository_write_new_file','test_run_allowlisted',
         'git_create_scoped_branch','git_stage_allowlisted_paths','git_commit_scoped',
         'git_push_scoped_draft_branch','github_open_draft_pr','github_update_draft_pr_body'
       )
     )
     or p_binding_hash !~ '^[a-f0-9]{64}$'
     or not exists (
       select 1 from public.autonomous_approval_request_events event
       where event.request_id=request.id and event.event_type='preflight_passed'
         and event.created_at >= request.approved_at
         and event.metadata->>'approval_scope_hash' is not distinct from snapshot.approval_scope_hash
         and event.metadata->>'plan_snapshot_hash' is not distinct from snapshot.snapshot_hash
     ) then raise exception 'cognitive_owner_approval_binding_rejected' using errcode='P0001'; end if;
  insert into public.cognitive_approval_bindings(
    approval_request_id,snapshot_id,task_id,project_id,platform,environment,
    snapshot_hash,approval_scope_hash,bound_by,binding_hash
  ) values (
    request.id,snapshot.id,snapshot.task_id,snapshot.project_id,snapshot.platform,
    snapshot.environment,snapshot.snapshot_hash,snapshot.approval_scope_hash,
    auth.uid(),p_binding_hash
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.bind_cognitive_owner_approval(uuid,uuid,text)
  from public, anon, service_role;
grant execute on function public.bind_cognitive_owner_approval(uuid,uuid,text)
  to authenticated;

create function public.cognitive_release_budget(
  p_budget_id uuid,
  p_task_id uuid,
  p_reservation_id text,
  p_reason_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare budget public.intelligence_budgets%rowtype;
declare reserved jsonb;
begin
  perform public.cognitive_assert_service_actor(array['cognitive_control_plane'],null);
  select * into budget from public.intelligence_budgets
    where id=p_budget_id and task_id=p_task_id for update;
  select usage into reserved from public.cognitive_budget_events
    where budget_id=p_budget_id and reservation_id=p_reservation_id and event_type='reserved';
  if budget.id is null or reserved is null or p_reason_hash !~ '^[a-f0-9]{64}$'
     or exists (
       select 1 from public.cognitive_budget_events
       where budget_id=p_budget_id and reservation_id=p_reservation_id
         and event_type in ('settled','released')
     ) then raise exception 'budget_release_rejected' using errcode='P0001'; end if;
  update public.intelligence_budgets set
    used_model_tokens=used_model_tokens-(reserved->>'model_tokens')::bigint,
    used_model_cost=used_model_cost-(reserved->>'model_cost')::numeric,
    used_tool_calls=used_tool_calls-(reserved->>'tool_calls')::integer,
    used_tool_bytes=used_tool_bytes-(reserved->>'tool_bytes')::bigint,
    used_child_tasks=used_child_tasks-(reserved->>'child_tasks')::integer,
    active_concurrent_calls=active_concurrent_calls-(reserved->>'concurrent_calls')::integer
  where id=p_budget_id;
  insert into public.cognitive_budget_events(
    budget_id,task_id,project_id,platform,environment,reservation_id,event_type,usage
  ) values (
    budget.id,budget.task_id,budget.project_id,budget.platform,budget.environment,
    p_reservation_id,'released',jsonb_build_object('reason_hash',p_reason_hash)
  );
  return true;
end;
$$;
revoke all on function public.cognitive_release_budget(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.cognitive_release_budget(uuid,uuid,text,text)
  to service_role;

create function public.cognitive_acquire_resource_lease(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_resource_type text,
  p_resource_key text,
  p_mode text,
  p_expires_at timestamptz,
  p_event_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare lease_id uuid;
begin
  perform public.cognitive_assert_service_actor(array['cognitive_control_plane'],null);
  if p_resource_type not in (
       'repository','branch','path','migration_namespace','edge_function',
       'database_object','provider','release_channel','platform','feature_flag'
     )
     or p_mode not in ('read','write')
     or length(p_resource_key) not between 3 and 512
     or p_expires_at <= statement_timestamp()
     or p_expires_at > statement_timestamp()+interval '4 hours'
     or p_event_hash !~ '^[a-f0-9]{64}$'
     or not exists (
       select 1 from public.intelligence_tasks task
       where task.id=p_task_id and task.project_id=p_project_id
         and task.platform=p_platform and task.environment=p_environment
         and task.cancelled_at is null and task.quarantined_at is null
         and task.deadman_at > statement_timestamp()
     ) then raise exception 'resource_lease_request_rejected' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_resource_type || ':' || p_resource_key,0));
  with expired as (
    update public.cognitive_resource_leases
    set revoked_at=statement_timestamp()
    where resource_type=p_resource_type and resource_key=p_resource_key
      and revoked_at is null and expires_at <= statement_timestamp()
    returning *
  )
  insert into public.cognitive_resource_lease_events(
    lease_id,task_id,project_id,platform,environment,event_type,event_hash
  )
  select id,task_id,project_id,platform,environment,'expired',p_event_hash from expired;
  if exists (
    select 1 from public.cognitive_resource_leases lease
    where lease.resource_type=p_resource_type and lease.resource_key=p_resource_key
      and lease.revoked_at is null and lease.expires_at > statement_timestamp()
      and lease.task_id <> p_task_id
      and (lease.mode='write' or p_mode='write')
  ) then raise exception 'resource_lease_conflict' using errcode='55P03'; end if;
  insert into public.cognitive_resource_leases(
    task_id,project_id,platform,environment,resource_type,resource_key,mode,
    issued_at,expires_at,heartbeat_at
  ) values (
    p_task_id,p_project_id,p_platform,p_environment,p_resource_type,p_resource_key,p_mode,
    statement_timestamp(),p_expires_at,statement_timestamp()
  ) returning id into lease_id;
  insert into public.cognitive_resource_lease_events(
    lease_id,task_id,project_id,platform,environment,event_type,event_hash
  ) values (
    lease_id,p_task_id,p_project_id,p_platform,p_environment,'acquired',p_event_hash
  );
  return lease_id;
end;
$$;
revoke all on function public.cognitive_acquire_resource_lease(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,timestamptz,text
) from public, anon, authenticated;
grant execute on function public.cognitive_acquire_resource_lease(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,timestamptz,text
) to service_role;

create function public.cognitive_release_resource_lease(
  p_lease_id uuid,
  p_task_id uuid,
  p_event_type text,
  p_event_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare lease public.cognitive_resource_leases%rowtype;
begin
  perform public.cognitive_assert_service_actor(array['cognitive_control_plane'],null);
  select * into lease from public.cognitive_resource_leases
  where id=p_lease_id and task_id=p_task_id for update;
  if lease.id is null or lease.revoked_at is not null
     or p_event_type not in ('released','revoked')
     or p_event_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'resource_lease_release_rejected' using errcode='P0001';
  end if;
  update public.cognitive_resource_leases set revoked_at=statement_timestamp()
  where id=p_lease_id;
  insert into public.cognitive_resource_lease_events(
    lease_id,task_id,project_id,platform,environment,event_type,event_hash
  ) values (
    lease.id,lease.task_id,lease.project_id,lease.platform,lease.environment,
    p_event_type,p_event_hash
  );
  return true;
end;
$$;
revoke all on function public.cognitive_release_resource_lease(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.cognitive_release_resource_lease(uuid,uuid,text,text)
  to service_role;

create function public.cognitive_erase_task_user_data(
  p_task_id uuid,
  p_tombstone_hash text,
  p_actor_identity text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer := 0;
declare row_count_value integer;
declare task_value public.intelligence_tasks%rowtype;
begin
  perform public.cognitive_assert_service_actor(
    array['cognitive_control_plane','privacy_compliance_operator'],
    p_actor_identity
  );
  select * into task_value from public.intelligence_tasks where id=p_task_id for update;
  if task_value.id is null or p_tombstone_hash !~ '^[a-f0-9]{64}$'
     or p_actor_identity not in ('cognitive_control_plane','privacy_compliance_operator')
     or exists (
       select 1 from (
         select legal_hold from public.knowledge_entities where task_id=p_task_id and data_class='user_derived'
         union all select legal_hold from public.decision_records where task_id=p_task_id and data_class='user_derived'
         union all select legal_hold from public.hypotheses where task_id=p_task_id and data_class='user_derived'
       ) held where legal_hold
     ) then raise exception 'cognitive_erasure_rejected' using errcode='P0001'; end if;
  update public.knowledge_entities
    set summary='{}'::jsonb,evidence_metadata='{}'::jsonb,erased_at=statement_timestamp(),
        data_class='operational_metadata'
    where task_id=p_task_id and data_class='user_derived' and legal_hold=false;
  get diagnostics row_count_value=row_count; changed:=changed+row_count_value;
  update public.decision_records
    set summary='{}'::jsonb,evidence_metadata='{}'::jsonb,erased_at=statement_timestamp(),
        data_class='operational_metadata'
    where task_id=p_task_id and data_class='user_derived' and legal_hold=false;
  get diagnostics row_count_value=row_count; changed:=changed+row_count_value;
  update public.hypotheses
    set summary='{}'::jsonb,evidence_metadata='{}'::jsonb,erased_at=statement_timestamp(),
        data_class='operational_metadata'
    where task_id=p_task_id and data_class='user_derived' and legal_hold=false;
  get diagnostics row_count_value=row_count; changed:=changed+row_count_value;
  insert into public.cognitive_erasure_events(
    task_id,project_id,platform,environment,target_table,target_id,
    prior_data_class,tombstone_hash,legal_hold,erased_at,actor_identity
  ) values (
    task_value.id,task_value.project_id,task_value.platform,task_value.environment,
    'task_user_derived_content',task_value.id,'user_derived',p_tombstone_hash,
    false,statement_timestamp(),p_actor_identity
  );
  return changed;
end;
$$;
revoke all on function public.cognitive_erase_task_user_data(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.cognitive_erase_task_user_data(uuid,text,text)
  to service_role;

-- Every foreign-key lookup receives a leading index. The names are derived from
-- stable table/column text rather than provider object identifiers.
do $$
declare
  fk record;
  column_list text;
  index_name text;
begin
  for fk in
    select con.oid,rel.relname,array_agg(att.attname order by key.ordinality) columns
    from pg_constraint con
    join pg_class rel on rel.oid=con.conrelid
    join pg_namespace namespace on namespace.oid=rel.relnamespace
    join unnest(con.conkey) with ordinality key(attnum,ordinality) on true
    join pg_attribute att on att.attrelid=rel.oid and att.attnum=key.attnum
    where con.contype='f' and namespace.nspname='public'
      and rel.relname in (
        'intelligence_tasks','research_sources','research_claims','research_claim_sources',
        'research_contradictions','research_retrieval_events','knowledge_entities',
        'knowledge_relationships','architecture_components','architecture_dependencies',
        'decision_records','hypotheses','solution_candidates','experiments','experiment_results',
        'execution_plans','execution_plan_snapshots','execution_runs','execution_evidence_records',
        'evaluation_results','lessons','playbooks','model_invocations','tool_invocations',
        'intelligence_budgets','cognitive_capabilities','cognitive_capability_events',
        'cognitive_budget_events','cognitive_resource_leases','cognitive_resource_lease_events',
        'cognitive_state_transition_events','cognitive_current_findings',
        'finding_lifecycle_events','cognitive_erasure_events','cognitive_owner_review_requests'
        ,'cognitive_approval_bindings'
      )
    group by con.oid,rel.relname
  loop
    select string_agg(format('%I',column_name),',') into column_list
    from unnest(fk.columns) column_name;
    index_name := left('cognitive_fk_' || fk.relname || '_' || substr(md5(fk.relname || ':' || array_to_string(fk.columns,',')),1,12),63);
    execute format('create index if not exists %I on public.%I (%s)',index_name,fk.relname,column_list);
  end loop;
end
$$;

set check_function_bodies = true;

comment on table public.cognitive_projects is
  'Undeployed/off Cognitive Intelligence project boundary. No production authority.';
comment on table public.execution_plan_snapshots is
  'Immutable canonical plan, scope, approval and rollback snapshot.';
comment on table public.cognitive_capabilities is
  'Hashed, expiring, task/project/repository/branch/platform/environment/action-bound capabilities.';
comment on table public.cognitive_erasure_events is
  'Non-personal immutable tombstone metadata; OWNER_COUNSEL_RETENTION_DECISION_REQUIRED before deployment.';
