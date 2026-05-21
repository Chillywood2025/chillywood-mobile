-- Owner/Admin control tools foundation:
-- Audit Explorer, staff permission templates, temporary grants, Break Glass,
-- legal request intake, security/canary read models, and owner-normal audit rules.

create or replace function public."platform_staff_normalize_permission_key"(p_permission_key text)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select case lower(trim(coalesce(p_permission_key, '')))
    when 'support_inbox' then 'support_inbox'
    when 'user_lookup' then 'user_lookup'
    when 'content_moderation' then 'content_moderation'
    when 'reports_review' then 'reports_review'
    when 'live_ops' then 'live_ops'
    when 'billing_support_read' then 'billing_support_read'
    when 'creator_support' then 'creator_support'
    when 'legal_review' then 'legal_review'
    when 'evidence_export' then 'evidence_export'
    when 'emergency_break_glass' then 'emergency_break_glass'
    when 'admin_grants' then 'admin_grants'
    when 'manage_moderators' then 'manage_moderators'
    when 'moderator_grants' then 'manage_moderators'
    when 'audit_review' then 'audit_review'
    when 'security_review' then 'security_review'
    when 'staff_permission_templates' then 'staff_permission_templates'
    when 'legal_request_intake' then 'legal_request_intake'
    else null
  end;
$$;

alter table public."platform_staff_permission_grants"
  drop constraint if exists "platform_staff_permission_grants_permission_check",
  drop constraint if exists "platform_staff_permission_grants_status_check";

alter table public."platform_staff_permission_grants"
  add constraint "platform_staff_permission_grants_permission_check"
    check ("permission_key" in (
      'support_inbox',
      'user_lookup',
      'content_moderation',
      'reports_review',
      'live_ops',
      'billing_support_read',
      'creator_support',
      'legal_review',
      'evidence_export',
      'emergency_break_glass',
      'admin_grants',
      'manage_moderators',
      'audit_review',
      'security_review',
      'staff_permission_templates',
      'legal_request_intake'
    )),
  add constraint "platform_staff_permission_grants_status_check"
    check ("status" in ('active', 'revoked', 'expired'));

alter table public."platform_staff_permission_audit"
  drop constraint if exists "platform_staff_permission_audit_action_check",
  drop constraint if exists "platform_staff_permission_audit_permission_check";

alter table public."platform_staff_permission_audit"
  add constraint "platform_staff_permission_audit_action_check"
    check ("action" in ('grant', 'revoke', 'blocked', 'expire', 'template_apply', 'template_revoke')),
  add constraint "platform_staff_permission_audit_permission_check"
    check ("permission_key" in (
      'support_inbox',
      'user_lookup',
      'content_moderation',
      'reports_review',
      'live_ops',
      'billing_support_read',
      'creator_support',
      'legal_review',
      'evidence_export',
      'emergency_break_glass',
      'admin_grants',
      'manage_moderators',
      'audit_review',
      'security_review',
      'staff_permission_templates',
      'legal_request_intake'
    ));

create table if not exists public."platform_break_glass_sessions" (
  "id" uuid not null default gen_random_uuid(),
  "actor_user_id" text,
  "actor_email" text,
  "actor_role" text not null,
  "status" text not null default 'active',
  "reason" text not null,
  "case_id" text,
  "report_id" text,
  "activated_at" timestamptz not null default timezone('utc'::text, now()),
  "expires_at" timestamptz,
  "ended_at" timestamptz,
  "ended_by_user_id" text,
  "ended_by_email" text,
  "metadata" jsonb not null default '{}'::jsonb,
  constraint "platform_break_glass_sessions_pkey" primary key ("id"),
  constraint "platform_break_glass_sessions_role_check"
    check ("actor_role" in ('owner', 'operator', 'moderator')),
  constraint "platform_break_glass_sessions_status_check"
    check ("status" in ('active', 'ended', 'expired')),
  constraint "platform_break_glass_sessions_reason_check"
    check (length(trim("reason")) >= 6),
  constraint "platform_break_glass_sessions_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object')
);

create index if not exists "platform_break_glass_sessions_actor_idx"
  on public."platform_break_glass_sessions" ("actor_user_id", lower("actor_email"), "status", "activated_at" desc);

create table if not exists public."platform_break_glass_audit" (
  "id" uuid not null default gen_random_uuid(),
  "session_id" uuid references public."platform_break_glass_sessions"("id") on delete restrict,
  "actor_user_id" text,
  "actor_email" text,
  "actor_role" text not null,
  "action" text not null,
  "reason" text not null,
  "target_type" text,
  "target_id" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "platform_break_glass_audit_pkey" primary key ("id"),
  constraint "platform_break_glass_audit_role_check"
    check ("actor_role" in ('owner', 'operator', 'moderator', 'system')),
  constraint "platform_break_glass_audit_action_check"
    check ("action" in ('activate', 'end', 'expire', 'blocked', 'owner_action', 'admin_action')),
  constraint "platform_break_glass_audit_reason_check"
    check (length(trim("reason")) >= 6),
  constraint "platform_break_glass_audit_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object')
);

create index if not exists "platform_break_glass_audit_created_at_idx"
  on public."platform_break_glass_audit" ("created_at" desc);
create index if not exists "platform_break_glass_audit_session_idx"
  on public."platform_break_glass_audit" ("session_id", "created_at" desc);

create table if not exists public."legal_request_intake" (
  "id" uuid not null default gen_random_uuid(),
  "requesting_agency" text not null,
  "contact_name" text,
  "case_number" text,
  "request_reason" text not null,
  "target_user_id" text,
  "target_content_id" text,
  "target_thread_id" text,
  "target_room_id" text,
  "target_report_id" text,
  "date_from" timestamptz,
  "date_to" timestamptz,
  "status" text not null default 'open',
  "reviewed_summary" text,
  "exported_summary" text,
  "handled_by_user_id" text,
  "handled_by_email" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "legal_request_intake_pkey" primary key ("id"),
  constraint "legal_request_intake_agency_check"
    check (length(trim("requesting_agency")) >= 2),
  constraint "legal_request_intake_reason_check"
    check (length(trim("request_reason")) >= 6),
  constraint "legal_request_intake_status_check"
    check ("status" in ('open', 'reviewing', 'fulfilled', 'rejected', 'closed')),
  constraint "legal_request_intake_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object')
);

create index if not exists "legal_request_intake_created_at_idx"
  on public."legal_request_intake" ("created_at" desc);
create index if not exists "legal_request_intake_status_idx"
  on public."legal_request_intake" ("status", "created_at" desc);
create index if not exists "legal_request_intake_target_user_idx"
  on public."legal_request_intake" ("target_user_id", "created_at" desc);
create index if not exists "legal_request_intake_target_report_idx"
  on public."legal_request_intake" ("target_report_id", "created_at" desc);

create table if not exists public."admin_canary_runs" (
  "id" uuid not null default gen_random_uuid(),
  "requested_by_user_id" text,
  "requested_by_email" text,
  "requested_by_role" text,
  "status" text not null default 'completed',
  "results" jsonb not null default '[]'::jsonb,
  "summary" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "admin_canary_runs_pkey" primary key ("id"),
  constraint "admin_canary_runs_status_check"
    check ("status" in ('completed', 'partial', 'failed')),
  constraint "admin_canary_runs_results_array_check"
    check (jsonb_typeof("results") = 'array'),
  constraint "admin_canary_runs_summary_object_check"
    check (jsonb_typeof("summary") = 'object')
);

create index if not exists "admin_canary_runs_created_at_idx"
  on public."admin_canary_runs" ("created_at" desc);

alter table public."platform_break_glass_sessions" enable row level security;
alter table public."platform_break_glass_audit" enable row level security;
alter table public."legal_request_intake" enable row level security;
alter table public."admin_canary_runs" enable row level security;

drop policy if exists "platform_break_glass_sessions_select_authorized" on public."platform_break_glass_sessions";
create policy "platform_break_glass_sessions_select_authorized"
  on public."platform_break_glass_sessions"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or public.has_platform_permission('security_review')
    or public.has_platform_permission('audit_review')
    or public.has_platform_permission('emergency_break_glass')
  );

drop policy if exists "platform_break_glass_audit_select_authorized" on public."platform_break_glass_audit";
create policy "platform_break_glass_audit_select_authorized"
  on public."platform_break_glass_audit"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or public.has_platform_permission('security_review')
    or public.has_platform_permission('audit_review')
  );

drop policy if exists "legal_request_intake_select_authorized" on public."legal_request_intake";
create policy "legal_request_intake_select_authorized"
  on public."legal_request_intake"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or public.has_platform_permission('legal_request_intake')
    or public.has_platform_permission('legal_review')
    or public.has_platform_permission('evidence_export')
    or public.has_platform_permission('audit_review')
    or public.has_platform_permission('security_review')
  );

drop policy if exists "admin_canary_runs_select_authorized" on public."admin_canary_runs";
create policy "admin_canary_runs_select_authorized"
  on public."admin_canary_runs"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or public.has_platform_permission('audit_review')
    or public.has_platform_permission('security_review')
  );

revoke all on table public."platform_break_glass_sessions" from "anon", "authenticated";
revoke all on table public."platform_break_glass_audit" from "anon", "authenticated";
revoke all on table public."legal_request_intake" from "anon", "authenticated";
revoke all on table public."admin_canary_runs" from "anon", "authenticated";
grant select on table public."platform_break_glass_sessions" to "authenticated";
grant select on table public."platform_break_glass_audit" to "authenticated";
grant select on table public."legal_request_intake" to "authenticated";
grant select on table public."admin_canary_runs" to "authenticated";
grant all on table public."platform_break_glass_sessions" to "service_role";
grant all on table public."platform_break_glass_audit" to "service_role";
grant select, insert, update on table public."legal_request_intake" to "service_role";
grant select, insert on table public."admin_canary_runs" to "service_role";
revoke delete on table public."legal_request_intake" from "service_role";
revoke update, delete on table public."platform_break_glass_audit" from "service_role";
revoke update, delete on table public."admin_canary_runs" from "service_role";

create or replace function public."platform_control_audit_prevent_mutation"()
returns trigger
language plpgsql
as $$
begin
  raise exception 'platform_control_audit_append_only';
end;
$$;

drop trigger if exists "platform_break_glass_audit_no_update" on public."platform_break_glass_audit";
create trigger "platform_break_glass_audit_no_update"
  before update or delete on public."platform_break_glass_audit"
  for each row execute function public."platform_control_audit_prevent_mutation"();

drop trigger if exists "admin_canary_runs_no_update" on public."admin_canary_runs";
create trigger "admin_canary_runs_no_update"
  before update or delete on public."admin_canary_runs"
  for each row execute function public."platform_control_audit_prevent_mutation"();

create or replace function public."platform_current_break_glass_session_id"(
  p_actor_user_id text default auth.uid()::text,
  p_actor_email text default (auth.jwt() ->> 'email')
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select session."id"
  from public."platform_break_glass_sessions" session
  where session."status" = 'active'
    and (
      (nullif(trim(coalesce(p_actor_user_id, '')), '') is not null and session."actor_user_id" = nullif(trim(coalesce(p_actor_user_id, '')), ''))
      or (
        public.platform_staff_normalize_email(p_actor_email) is not null
        and lower(session."actor_email") = public.platform_staff_normalize_email(p_actor_email)
      )
    )
    and (
      session."expires_at" is null
      or session."expires_at" > timezone('utc'::text, now())
    )
  order by session."activated_at" desc
  limit 1;
$$;

create or replace function public."platform_break_glass_active_for_actor"(
  p_actor_user_id text,
  p_actor_email text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.platform_current_break_glass_session_id(p_actor_user_id, p_actor_email) is not null;
$$;

create or replace function public."platform_actor_should_write_app_audit"(
  p_actor_role text,
  p_actor_user_id text,
  p_actor_email text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(coalesce(p_actor_role, '')), ''), 'member') <> 'owner'
    or public.platform_break_glass_active_for_actor(p_actor_user_id, p_actor_email);
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
  v_actor_role text := coalesce(nullif(trim(coalesce(p_actor_role, '')), ''), 'member');
  v_break_glass_session_id uuid := public.platform_current_break_glass_session_id(p_actor_user_id, p_actor_email);
  v_should_audit boolean := public.platform_actor_should_write_app_audit(p_actor_role, p_actor_user_id, p_actor_email);
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'break_glass_active', v_break_glass_session_id is not null,
      'break_glass_session_id', v_break_glass_session_id
    );
begin
  if v_permission_key is null then
    raise exception 'platform_staff_permission_invalid';
  end if;

  if not v_should_audit then
    return;
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
    "metadata"
  )
  values (
    nullif(trim(coalesce(p_actor_user_id, '')), ''),
    public.platform_staff_normalize_email(p_actor_email),
    v_actor_role,
    nullif(trim(coalesce(p_target_user_id, '')), ''),
    public.platform_staff_normalize_email(p_target_email),
    v_permission_key,
    p_action,
    nullif(trim(coalesce(p_reason, '')), ''),
    v_metadata
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
      "metadata"
    )
    values (
      nullif(trim(coalesce(p_actor_user_id, '')), ''),
      public.platform_staff_normalize_email(p_actor_email),
      v_actor_role,
      concat('platform_staff_permission_', p_action),
      'role',
      'platform_staff_permission',
      concat(public.platform_staff_normalize_email(p_target_email), ':', v_permission_key),
      nullif(trim(coalesce(p_reason, '')), ''),
      case when p_action = 'blocked' then 'warning' else 'notice' end,
      v_metadata
    );
  end if;
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
  v_actor_role text := coalesce(nullif(trim(coalesce(p_actor_role, '')), ''), 'member');
  v_break_glass_session_id uuid := public.platform_current_break_glass_session_id(p_actor_user_id, p_actor_email);
  v_should_audit boolean := public.platform_actor_should_write_app_audit(p_actor_role, p_actor_user_id, p_actor_email);
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'break_glass_active', v_break_glass_session_id is not null,
      'break_glass_session_id', v_break_glass_session_id
    );
begin
  if not v_should_audit then
    return;
  end if;

  insert into public."platform_staff_role_audit" (
    "actor_user_id",
    "actor_email",
    "actor_role",
    "target_email",
    "action",
    "role",
    "reason",
    "metadata"
  )
  values (
    nullif(trim(coalesce(p_actor_user_id, '')), ''),
    public.platform_staff_normalize_email(p_actor_email),
    v_actor_role,
    public.platform_staff_normalize_email(p_target_email),
    p_action,
    public.platform_staff_normalize_role(p_role),
    nullif(trim(coalesce(p_reason, '')), ''),
    v_metadata
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
      "metadata"
    )
    values (
      nullif(trim(coalesce(p_actor_user_id, '')), ''),
      public.platform_staff_normalize_email(p_actor_email),
      v_actor_role,
      concat('platform_staff_role_', p_action),
      'role',
      'platform_role_membership',
      concat(public.platform_staff_normalize_email(p_target_email), ':', public.platform_staff_normalize_role(p_role)),
      nullif(trim(coalesce(p_reason, '')), ''),
      case when p_action = 'blocked' then 'warning' else 'notice' end,
      v_metadata
    );
  end if;
end;
$$;

create or replace function public."read_my_platform_staff_permission_keys"()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with known(permission_key) as (
    values
      ('support_inbox'::text),
      ('user_lookup'::text),
      ('content_moderation'::text),
      ('reports_review'::text),
      ('live_ops'::text),
      ('billing_support_read'::text),
      ('creator_support'::text),
      ('legal_review'::text),
      ('evidence_export'::text),
      ('emergency_break_glass'::text),
      ('admin_grants'::text),
      ('manage_moderators'::text),
      ('audit_review'::text),
      ('security_review'::text),
      ('staff_permission_templates'::text),
      ('legal_request_intake'::text)
  ),
  actor as (
    select auth.uid()::text as user_id,
           public.platform_staff_normalize_email(auth.jwt() ->> 'email') as email
  )
  select case
    when public.has_platform_role(array['owner'::text]) then array(select permission_key from known order by permission_key)
    when auth.uid() is null then array[]::text[]
    else coalesce(array(
      select distinct grant_row."permission_key"
      from public."platform_staff_permission_grants" grant_row
      join actor on true
      where grant_row."status" = 'active'
        and (
          grant_row."target_user_id" = actor.user_id
          or lower(grant_row."target_email") = actor.email
        )
        and (
          grant_row."expires_at" is null
          or grant_row."expires_at" > timezone('utc'::text, now())
        )
      order by grant_row."permission_key"
    ), array[]::text[])
  end;
$$;

drop policy if exists "platform_admin_audit_logs_select_owner_or_scoped_staff"
  on public."platform_admin_audit_logs";
create policy "platform_admin_audit_logs_select_owner_or_scoped_staff"
  on public."platform_admin_audit_logs"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or public.has_platform_permission('admin_grants')
    or public.has_platform_permission('manage_moderators')
    or public.has_platform_permission('content_moderation')
    or public.has_platform_permission('reports_review')
    or public.has_platform_permission('live_ops')
    or public.has_platform_permission('legal_review')
    or public.has_platform_permission('evidence_export')
    or public.has_platform_permission('emergency_break_glass')
    or public.has_platform_permission('audit_review')
    or public.has_platform_permission('security_review')
    or public.has_platform_permission('legal_request_intake')
    or public.has_platform_permission('staff_permission_templates')
  );

revoke all on function public."platform_current_break_glass_session_id"(text, text) from public;
revoke all on function public."platform_break_glass_active_for_actor"(text, text) from public;
revoke all on function public."platform_actor_should_write_app_audit"(text, text, text) from public;
revoke all on function public."platform_staff_normalize_permission_key"(text) from public;
revoke all on function public."platform_staff_write_permission_audit"(text, text, text, text, text, text, text, text, jsonb) from public;
revoke all on function public."platform_staff_write_audit"(text, text, text, text, text, text, text, jsonb) from public;
revoke all on function public."read_my_platform_staff_permission_keys"() from public;
grant execute on function public."platform_current_break_glass_session_id"(text, text) to service_role;
grant execute on function public."platform_break_glass_active_for_actor"(text, text) to service_role;
grant execute on function public."platform_actor_should_write_app_audit"(text, text, text) to service_role;
grant execute on function public."read_my_platform_staff_permission_keys"() to authenticated, service_role;

comment on table public."platform_break_glass_sessions" is
  'Owner/admin Break Glass sessions. Off by default; creates audit rows only for explicit emergency mode.';
comment on table public."legal_request_intake" is
  'Owner/admin legal or police request intake records. Append-style workflow; deletion is intentionally not granted.';
comment on table public."admin_canary_runs" is
  'Real public launch canary check runs. Unknown/manual-required must not be stored as passing.';
