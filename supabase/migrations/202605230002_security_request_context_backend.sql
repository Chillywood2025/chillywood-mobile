-- Security Request Context backend foundation.
-- Centralizes hashed/masked request-network proof and links the first high-value
-- admin/owner/LiveKit audit paths without adding raw IP to product tables.

create table if not exists public."security_request_context" (
  "id" uuid primary key default gen_random_uuid(),
  "user_id" uuid,
  "session_id" text,
  "device_hash" text,
  "ip_hash" text not null,
  "ip_prefix_or_masked_ip" text,
  "country" text,
  "region" text,
  "city_approx" text,
  "asn_or_isp" text,
  "user_agent_hash" text,
  "request_id" text,
  "source" text not null,
  "capture_status" text default 'captured'::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamptz default timezone('utc'::text, now()) not null,
  "retention_expires_at" timestamptz,
  constraint "security_request_context_ip_hash_check"
    check (length(trim("ip_hash")) >= 16),
  constraint "security_request_context_source_check"
    check (length(trim("source")) between 2 and 120),
  constraint "security_request_context_capture_status_check"
    check ("capture_status" in ('captured', 'unavailable', 'malformed')),
  constraint "security_request_context_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object')
);

create index if not exists "security_request_context_user_created_idx"
  on public."security_request_context" ("user_id", "created_at" desc);

create index if not exists "security_request_context_ip_hash_created_idx"
  on public."security_request_context" ("ip_hash", "created_at" desc);

create index if not exists "security_request_context_device_created_idx"
  on public."security_request_context" ("device_hash", "created_at" desc);

create index if not exists "security_request_context_retention_idx"
  on public."security_request_context" ("retention_expires_at");

alter table public."security_request_context" enable row level security;

revoke all on table public."security_request_context" from "anon", "authenticated";
grant select, insert, update on table public."security_request_context" to "service_role";
revoke delete on table public."security_request_context" from "service_role";

alter table public."platform_admin_audit_logs"
  add column if not exists "security_context_id" uuid references public."security_request_context"("id") on delete set null;

create index if not exists "platform_admin_audit_logs_security_context_idx"
  on public."platform_admin_audit_logs" ("security_context_id");

alter table public."security_audit_events"
  add column if not exists "security_context_id" uuid references public."security_request_context"("id") on delete set null;

create index if not exists "security_audit_events_security_context_idx"
  on public."security_audit_events" ("security_context_id");

alter table public."owner_trusted_devices"
  add column if not exists "last_security_context_id" uuid references public."security_request_context"("id") on delete set null;

create index if not exists "owner_trusted_devices_security_context_idx"
  on public."owner_trusted_devices" ("last_security_context_id");

alter table public."platform_staff_permission_audit"
  add column if not exists "security_context_id" uuid references public."security_request_context"("id") on delete set null;

create index if not exists "platform_staff_permission_audit_security_context_idx"
  on public."platform_staff_permission_audit" ("security_context_id");

create table if not exists public."livekit_token_request_audit" (
  "id" uuid primary key default gen_random_uuid(),
  "actor_user_id" uuid,
  "action" text not null,
  "surface" text,
  "room_kind" text,
  "room_type" text,
  "room_name_hash" text,
  "app_room_id_hash" text,
  "requested_participant_role" text,
  "effective_participant_role" text,
  "can_publish" boolean,
  "can_subscribe" boolean,
  "can_publish_data" boolean,
  "room_join" boolean,
  "outcome" text not null,
  "error_code" text,
  "security_context_id" uuid references public."security_request_context"("id") on delete set null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamptz default timezone('utc'::text, now()) not null,
  constraint "livekit_token_request_audit_action_check"
    check ("action" in ('mint-token', 'enforce-participant-state', 'unknown')),
  constraint "livekit_token_request_audit_surface_check"
    check ("surface" is null or "surface" in ('live-stage', 'watch-party-live', 'chat-call')),
  constraint "livekit_token_request_audit_outcome_check"
    check ("outcome" in ('success', 'denied', 'error')),
  constraint "livekit_token_request_audit_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object')
);

create index if not exists "livekit_token_request_audit_created_idx"
  on public."livekit_token_request_audit" ("created_at" desc);

create index if not exists "livekit_token_request_audit_actor_created_idx"
  on public."livekit_token_request_audit" ("actor_user_id", "created_at" desc);

create index if not exists "livekit_token_request_audit_surface_created_idx"
  on public."livekit_token_request_audit" ("surface", "created_at" desc);

create index if not exists "livekit_token_request_audit_security_context_idx"
  on public."livekit_token_request_audit" ("security_context_id");

alter table public."livekit_token_request_audit" enable row level security;

drop policy if exists "livekit_token_request_audit_select_authorized" on public."livekit_token_request_audit";
create policy "livekit_token_request_audit_select_authorized"
  on public."livekit_token_request_audit"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text, 'operator'::text])
    or public.has_platform_permission('audit_review')
    or public.has_platform_permission('security_review')
    or public.has_platform_permission('live_ops')
  );

revoke all on table public."livekit_token_request_audit" from "anon", "authenticated";
grant select on table public."livekit_token_request_audit" to "authenticated";
grant select, insert on table public."livekit_token_request_audit" to "service_role";
revoke update, delete on table public."livekit_token_request_audit" from "authenticated", "service_role";

create or replace function public."prevent_livekit_token_request_audit_mutation"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'livekit_token_request_audit is append-only';
end;
$$;

drop trigger if exists "prevent_livekit_token_request_audit_mutation" on public."livekit_token_request_audit";
create trigger "prevent_livekit_token_request_audit_mutation"
  before update or delete on public."livekit_token_request_audit"
  for each row execute function public."prevent_livekit_token_request_audit_mutation"();

create or replace function public."get_security_request_context_summary"(p_context_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public."security_request_context"%rowtype;
begin
  if auth.role() <> 'service_role'
    and not public.has_platform_role(array['owner'::text, 'operator'::text])
    and not public.has_platform_permission('audit_review')
    and not public.has_platform_permission('security_review')
  then
    raise exception 'security_context_admin_required';
  end if;

  select *
    into v_row
  from public."security_request_context"
  where "id" = p_context_id;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row."id",
    'userId', v_row."user_id",
    'sessionIdHashShort', case when v_row."session_id" is null then null else left(v_row."session_id", 12) || '...' || right(v_row."session_id", 6) end,
    'deviceHashShort', case when v_row."device_hash" is null then null else left(v_row."device_hash", 12) || '...' || right(v_row."device_hash", 6) end,
    'ipHashShort', left(v_row."ip_hash", 12) || '...' || right(v_row."ip_hash", 6),
    'maskedIp', v_row."ip_prefix_or_masked_ip",
    'country', v_row."country",
    'region', v_row."region",
    'cityApprox', v_row."city_approx",
    'asnOrIsp', v_row."asn_or_isp",
    'userAgentHashShort', case when v_row."user_agent_hash" is null then null else left(v_row."user_agent_hash", 12) || '...' || right(v_row."user_agent_hash", 6) end,
    'requestId', v_row."request_id",
    'source', v_row."source",
    'captureStatus', v_row."capture_status",
    'createdAt', v_row."created_at",
    'retentionExpiresAt', v_row."retention_expires_at"
  );
end;
$$;

revoke all on function public."get_security_request_context_summary"(uuid) from public;
grant execute on function public."get_security_request_context_summary"(uuid) to authenticated, service_role;

create or replace function public."owner_security_center_table_status"()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_table text;
  v_exists boolean;
  v_rls_enabled boolean;
  v_policy_count integer;
begin
  if auth.role() <> 'service_role' and not public.has_platform_role(array['owner'::text]) then
    raise exception 'owner_required';
  end if;

  foreach v_table in array array[
    'owner_trusted_devices',
    'security_audit_events',
    'security_request_context',
    'livekit_token_request_audit',
    'platform_staff_permission_grants',
    'platform_staff_permission_audit',
    'platform_admin_audit_logs',
    'admin_live_ops_incidents',
    'admin_live_ops_action_audit',
    'livekit_servers'
  ]::text[]
  loop
    v_exists := false;
    v_rls_enabled := false;
    v_policy_count := 0;

    select true, coalesce(c.relrowsecurity, false)
      into v_exists, v_rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = v_table
      and c.relkind in ('r', 'p')
    limit 1;

    select count(*)
      into v_policy_count
    from pg_policies
    where schemaname = 'public'
      and tablename = v_table;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'table', v_table,
      'exists', v_exists,
      'rlsEnabled', v_rls_enabled,
      'policyCount', coalesce(v_policy_count, 0)
    ));
  end loop;

  return jsonb_build_object(
    'checkedAt', timezone('utc'::text, now()),
    'tables', v_result
  );
end;
$$;

revoke all on function public."owner_security_center_table_status"() from public;
grant execute on function public."owner_security_center_table_status"() to authenticated, service_role;

comment on table public."security_request_context" is
  'Restricted backend-only request context evidence. Stores hashed/masked network proof for audit linkage; no public UI or normal user table access.';

comment on table public."livekit_token_request_audit" is
  'Append-only LiveKit token request audit. Stores token request outcomes and security_context_id only; never stores LiveKit tokens.';
