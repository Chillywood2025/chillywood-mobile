-- Security Request Context Event Link Expansion.
-- Adds nullable security_context_id links to restricted event/audit tables only.
-- No raw IP columns are added; public content/message/profile rows stay free of
-- network proof. SQL-only RPC paths remain backward compatible and may attach a
-- context only when a trusted backend passes a valid actor-owned context id in
-- audit metadata.

create or replace function public."security_context_id_from_metadata"(p_metadata jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context_text text := nullif(trim(coalesce(p_metadata->>'security_context_id', '')), '');
  v_context_id uuid;
  v_request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
begin
  if v_context_text is null then
    return null;
  end if;

  begin
    v_context_id := v_context_text::uuid;
  exception when invalid_text_representation then
    return null;
  end;

  if v_request_role = 'service_role' then
    if exists (
      select 1
      from public."security_request_context" context
      where context."id" = v_context_id
    ) then
      return v_context_id;
    end if;
    return null;
  end if;

  if auth.uid() is not null and exists (
    select 1
    from public."security_request_context" context
    where context."id" = v_context_id
      and context."user_id" = auth.uid()::text
  ) then
    return v_context_id;
  end if;

  return null;
end;
$$;

revoke all on function public."security_context_id_from_metadata"(jsonb) from public;
grant execute on function public."security_context_id_from_metadata"(jsonb) to authenticated, service_role;

alter table if exists public."dmca_cases"
  add column if not exists "security_context_id" uuid references public."security_request_context"("id") on delete set null;
create index if not exists "dmca_cases_security_context_idx"
  on public."dmca_cases" ("security_context_id");

alter table if exists public."dmca_counter_notices"
  add column if not exists "security_context_id" uuid references public."security_request_context"("id") on delete set null;
create index if not exists "dmca_counter_notices_security_context_idx"
  on public."dmca_counter_notices" ("security_context_id");

alter table if exists public."dmca_attachments"
  add column if not exists "security_context_id" uuid references public."security_request_context"("id") on delete set null;
create index if not exists "dmca_attachments_security_context_idx"
  on public."dmca_attachments" ("security_context_id");

alter table if exists public."dmca_audit_log"
  add column if not exists "security_context_id" uuid references public."security_request_context"("id") on delete set null;
create index if not exists "dmca_audit_log_security_context_idx"
  on public."dmca_audit_log" ("security_context_id");

alter table if exists public."safety_reports"
  add column if not exists "security_context_id" uuid references public."security_request_context"("id") on delete set null;
create index if not exists "safety_reports_security_context_idx"
  on public."safety_reports" ("security_context_id");

alter table if exists public."admin_live_ops_action_audit"
  add column if not exists "security_context_id" uuid references public."security_request_context"("id") on delete set null;
create index if not exists "admin_live_ops_action_audit_security_context_idx"
  on public."admin_live_ops_action_audit" ("security_context_id");

alter table if exists public."admin_live_cost_guard_events"
  add column if not exists "security_context_id" uuid references public."security_request_context"("id") on delete set null;
create index if not exists "admin_live_cost_guard_events_security_context_idx"
  on public."admin_live_cost_guard_events" ("security_context_id");

alter table if exists public."admin_live_cost_guard_actions"
  add column if not exists "security_context_id" uuid references public."security_request_context"("id") on delete set null;
create index if not exists "admin_live_cost_guard_actions_security_context_idx"
  on public."admin_live_cost_guard_actions" ("security_context_id");

alter table if exists public."creator_payout_audit_log"
  add column if not exists "security_context_id" uuid references public."security_request_context"("id") on delete set null;
create index if not exists "creator_payout_audit_log_security_context_idx"
  on public."creator_payout_audit_log" ("security_context_id");

alter table if exists public."network_billing_audit_logs"
  add column if not exists "security_context_id" uuid references public."security_request_context"("id") on delete set null;
create index if not exists "network_billing_audit_logs_security_context_idx"
  on public."network_billing_audit_logs" ("security_context_id");

alter table if exists public."fraud_audit_logs"
  add column if not exists "security_context_id" uuid references public."security_request_context"("id") on delete set null;
create index if not exists "fraud_audit_logs_security_context_idx"
  on public."fraud_audit_logs" ("security_context_id");

alter table if exists public."platform_staff_role_audit"
  add column if not exists "security_context_id" uuid references public."security_request_context"("id") on delete set null;
create index if not exists "platform_staff_role_audit_security_context_idx"
  on public."platform_staff_role_audit" ("security_context_id");

create table if not exists public."media_security_audit_events" (
  "id" uuid default gen_random_uuid() not null,
  "actor_user_id" text,
  "actor_email" text,
  "action" text not null,
  "surface_type" text not null,
  "record_id" text,
  "object_key_owner" text,
  "result" text default 'success'::text not null,
  "reason" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "security_context_id" uuid references public."security_request_context"("id") on delete set null,
  "created_at" timestamptz default timezone('utc'::text, now()) not null,
  constraint "media_security_audit_events_pkey" primary key ("id"),
  constraint "media_security_audit_events_action_check"
    check ("action" in (
      'create_upload_url',
      'create_download_url',
      'delete_object',
      'private_media_download_url',
      'private_media_delete'
    )),
  constraint "media_security_audit_events_surface_check"
    check ("surface_type" in ('creator_video', 'social_attachment')),
  constraint "media_security_audit_events_result_check"
    check ("result" in ('success', 'denied', 'blocked', 'error'))
);

create index if not exists "media_security_audit_events_created_idx"
  on public."media_security_audit_events" ("created_at" desc);
create index if not exists "media_security_audit_events_actor_idx"
  on public."media_security_audit_events" ("actor_user_id", "created_at" desc);
create index if not exists "media_security_audit_events_security_context_idx"
  on public."media_security_audit_events" ("security_context_id");

alter table public."media_security_audit_events" enable row level security;

drop policy if exists "media_security_audit_events_select_owner_operator"
  on public."media_security_audit_events";
create policy "media_security_audit_events_select_owner_operator"
  on public."media_security_audit_events"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."media_security_audit_events" from anon, authenticated;
grant select on table public."media_security_audit_events" to authenticated;
grant select, insert on table public."media_security_audit_events" to service_role;
revoke update, delete on table public."media_security_audit_events" from authenticated, service_role;

create or replace function public."prevent_media_security_audit_events_mutation"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'media_security_audit_events is append-only';
end;
$$;

drop trigger if exists "prevent_media_security_audit_events_mutation"
  on public."media_security_audit_events";
create trigger "prevent_media_security_audit_events_mutation"
  before update or delete on public."media_security_audit_events"
  for each row execute function public."prevent_media_security_audit_events_mutation"();

create or replace function public."dmca_write_audit"(
  p_case_id uuid,
  p_event_type text,
  p_actor_role text,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_id uuid;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_security_context_id uuid := public."security_context_id_from_metadata"(v_metadata);
begin
  insert into public."dmca_audit_log" (
    "dmca_case_id",
    "event_type",
    "actor_user_id",
    "actor_role",
    "reason",
    "metadata",
    "security_context_id"
  ) values (
    p_case_id,
    p_event_type,
    nullif(auth.uid()::text, ''),
    p_actor_role,
    nullif(trim(coalesce(p_reason, '')), ''),
    v_metadata,
    v_security_context_id
  )
  returning "id" into audit_id;

  return audit_id;
end;
$$;

create or replace function public."admin_reports_write_audit"(
  p_report_id bigint,
  p_target_type text,
  p_target_id text,
  p_action_type text,
  p_reason text,
  p_old_status text,
  p_new_status text,
  p_old_severity text,
  p_new_severity text,
  p_before_state jsonb,
  p_after_state jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit_id uuid;
  v_action text := lower(trim(coalesce(p_action_type, 'unknown')));
  v_actor_role text := coalesce(nullif(public.platform_staff_actor_role(), ''), 'member');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_security_context_id uuid := public."security_context_id_from_metadata"(v_metadata);
begin
  insert into public."platform_admin_audit_logs" (
    "actor_user_id",
    "actor_email",
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "target_id",
    "reason",
    "severity",
    "before_state",
    "after_state",
    "metadata",
    "security_context_id"
  )
  values (
    auth.uid()::text,
    nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''),
    v_actor_role,
    concat('reports_', v_action),
    'moderation',
    nullif(trim(coalesce(p_target_type, '')), ''),
    nullif(trim(coalesce(p_target_id, '')), ''),
    nullif(trim(coalesce(p_reason, '')), ''),
    case
      when v_action in ('target_removed', 'escalated') then 'warning'
      when v_action in ('target_hidden', 'dismissed') then 'notice'
      else 'info'
    end,
    coalesce(p_before_state, '{}'::jsonb),
    coalesce(p_after_state, '{}'::jsonb),
    v_metadata || jsonb_build_object(
      'report_id', p_report_id,
      'target_type', p_target_type,
      'target_id', p_target_id,
      'action_type', v_action,
      'old_status', p_old_status,
      'new_status', p_new_status,
      'old_severity', p_old_severity,
      'new_severity', p_new_severity,
      'ui_surface', 'admin_reports_triage'
    ),
    v_security_context_id
  )
  returning "id" into v_audit_id;

  return v_audit_id;
end;
$$;

create or replace function public."platform_staff_write_audit"(
  p_actor_user_id text,
  p_actor_email text,
  p_actor_role text,
  p_target_email text,
  p_action text,
  p_role text,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_security_context_id uuid := public."security_context_id_from_metadata"(v_metadata);
begin
  insert into public."platform_staff_role_audit" (
    "actor_user_id",
    "actor_email",
    "actor_role",
    "target_email",
    "action",
    "role",
    "reason",
    "metadata",
    "security_context_id"
  )
  values (
    nullif(trim(coalesce(p_actor_user_id, '')), ''),
    public.platform_staff_normalize_email(p_actor_email),
    nullif(trim(coalesce(p_actor_role, '')), ''),
    public.platform_staff_normalize_email(p_target_email),
    p_action,
    p_role,
    nullif(trim(coalesce(p_reason, '')), ''),
    v_metadata,
    v_security_context_id
  );

  if to_regclass('public.platform_admin_audit_logs') is not null then
    insert into public."platform_admin_audit_logs" (
      "actor_user_id",
      "actor_email",
      "actor_role",
      "action",
      "action_category",
      "target_type",
      "target_id",
      "reason",
      "severity",
      "metadata",
      "security_context_id"
    )
    values (
      nullif(trim(coalesce(p_actor_user_id, '')), ''),
      public.platform_staff_normalize_email(p_actor_email),
      nullif(trim(coalesce(p_actor_role, '')), ''),
      concat('platform_staff_role_', p_action),
      'role',
      'platform_role_membership',
      concat(public.platform_staff_normalize_email(p_target_email), ':', p_role),
      nullif(trim(coalesce(p_reason, '')), ''),
      case when p_action = 'blocked' then 'warning' else 'notice' end,
      v_metadata,
      v_security_context_id
    );
  end if;
end;
$$;

create or replace function public."platform_staff_write_permission_audit"(
  p_actor_user_id text,
  p_actor_email text,
  p_actor_role text,
  p_target_user_id text,
  p_target_email text,
  p_permission_key text,
  p_action text,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permission_key text := public.platform_staff_normalize_permission_key(p_permission_key);
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_security_context_id uuid := public."security_context_id_from_metadata"(v_metadata);
begin
  if v_permission_key is null then
    raise exception 'platform_staff_permission_invalid';
  end if;

  insert into public."platform_staff_permission_audit" (
    "actor_user_id",
    "actor_email",
    "actor_role",
    "target_user_id",
    "target_email",
    "permission_key",
    "action",
    "reason",
    "metadata",
    "security_context_id"
  )
  values (
    nullif(trim(coalesce(p_actor_user_id, '')), ''),
    public.platform_staff_normalize_email(p_actor_email),
    nullif(trim(coalesce(p_actor_role, '')), ''),
    nullif(trim(coalesce(p_target_user_id, '')), ''),
    public.platform_staff_normalize_email(p_target_email),
    v_permission_key,
    p_action,
    nullif(trim(coalesce(p_reason, '')), ''),
    v_metadata,
    v_security_context_id
  );

  if to_regclass('public.platform_admin_audit_logs') is not null then
    insert into public."platform_admin_audit_logs" (
      "actor_user_id",
      "actor_email",
      "actor_role",
      "action",
      "action_category",
      "target_type",
      "target_id",
      "reason",
      "severity",
      "metadata",
      "security_context_id"
    )
    values (
      nullif(trim(coalesce(p_actor_user_id, '')), ''),
      public.platform_staff_normalize_email(p_actor_email),
      nullif(trim(coalesce(p_actor_role, '')), ''),
      concat('platform_staff_permission_', p_action),
      'role',
      'platform_staff_permission',
      concat(public.platform_staff_normalize_email(p_target_email), ':', v_permission_key),
      nullif(trim(coalesce(p_reason, '')), ''),
      case when p_action = 'blocked' then 'warning' else 'notice' end,
      v_metadata,
      v_security_context_id
    );
  end if;
end;
$$;

comment on function public."security_context_id_from_metadata"(jsonb) is
  'Safely resolves a security_context_id from trusted audit metadata. Service-role callers may reference any existing context; authenticated callers may reference only their own context.';
comment on table public."media_security_audit_events" is
  'Restricted append-only media/storage security events. Stores security_context_id and safe object-owner metadata only; never stores raw IP or signed URLs.';
comment on column public."dmca_cases"."security_context_id" is
  'Nullable network-proof link for backend-controlled DMCA intake. Legacy submitted_ip_hash fields remain preserved.';
comment on column public."safety_reports"."security_context_id" is
  'Nullable network-proof link for future backend-controlled report intake. Public users cannot read network proof.';
comment on column public."platform_staff_role_audit"."security_context_id" is
  'Nullable network-proof link for SQL/Edge role grant and revoke audit rows.';
