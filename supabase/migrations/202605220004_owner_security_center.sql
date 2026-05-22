-- Owner Security Center production backing.
-- Adds owner-only device trust and functional security audit records while
-- keeping service-role access server-side and normal users denied by RLS.

create table if not exists public."owner_trusted_devices" (
  "id" uuid primary key default gen_random_uuid(),
  "owner_user_id" uuid not null,
  "device_fingerprint_hash" text not null,
  "device_label" text,
  "platform" text,
  "app_version" text,
  "build_version" text,
  "trusted_at" timestamptz,
  "trusted_by" uuid,
  "revoked_at" timestamptz,
  "revoked_by" uuid,
  "last_seen_at" timestamptz not null default timezone('utc'::text, now()),
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "owner_trusted_devices_hash_check"
    check (length(trim("device_fingerprint_hash")) >= 32),
  constraint "owner_trusted_devices_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object')
);

create unique index if not exists "owner_trusted_devices_owner_hash_uidx"
  on public."owner_trusted_devices" ("owner_user_id", "device_fingerprint_hash");

create index if not exists "owner_trusted_devices_owner_seen_idx"
  on public."owner_trusted_devices" ("owner_user_id", "last_seen_at" desc);

create table if not exists public."security_audit_events" (
  "id" uuid primary key default gen_random_uuid(),
  "actor_user_id" uuid,
  "actor_email" text,
  "actor_role" text,
  "event_type" text not null,
  "severity" text not null default 'low',
  "target_type" text,
  "target_id" text,
  "reason" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "security_audit_events_severity_check"
    check ("severity" in ('low', 'medium', 'high', 'critical')),
  constraint "security_audit_events_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object')
);

create index if not exists "security_audit_events_created_at_idx"
  on public."security_audit_events" ("created_at" desc);

create index if not exists "security_audit_events_type_idx"
  on public."security_audit_events" ("event_type", "created_at" desc);

create or replace function public."set_owner_security_updated_at"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new."updated_at" = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists "set_owner_trusted_devices_updated_at" on public."owner_trusted_devices";
create trigger "set_owner_trusted_devices_updated_at"
  before update on public."owner_trusted_devices"
  for each row execute function public."set_owner_security_updated_at"();

create or replace function public."prevent_security_audit_event_mutation"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'security_audit_events_append_only';
end;
$$;

drop trigger if exists "security_audit_events_no_update" on public."security_audit_events";
create trigger "security_audit_events_no_update"
  before update or delete on public."security_audit_events"
  for each row execute function public."prevent_security_audit_event_mutation"();

alter table public."owner_trusted_devices" enable row level security;
alter table public."security_audit_events" enable row level security;

drop policy if exists "owner_trusted_devices_select_owner" on public."owner_trusted_devices";
create policy "owner_trusted_devices_select_owner"
  on public."owner_trusted_devices"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    and "owner_user_id" = auth.uid()
  );

drop policy if exists "security_audit_events_select_owner" on public."security_audit_events";
create policy "security_audit_events_select_owner"
  on public."security_audit_events"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text]));

revoke all on table public."owner_trusted_devices" from "anon", "authenticated";
revoke all on table public."security_audit_events" from "anon", "authenticated";
grant select on table public."owner_trusted_devices" to "authenticated";
grant select on table public."security_audit_events" to "authenticated";
grant select, insert, update on table public."owner_trusted_devices" to "service_role";
grant select, insert on table public."security_audit_events" to "service_role";
revoke delete on table public."owner_trusted_devices" from "service_role";
revoke update, delete on table public."security_audit_events" from "service_role";

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

comment on table public."owner_trusted_devices" is
  'Owner Security Center app-level device trust records. Service-role Edge Functions write; normal users receive no rows.';

comment on table public."security_audit_events" is
  'Functional Owner Security Center audit feed for device trust and grant actions. It is not owner-sensitive app-level audit.';
