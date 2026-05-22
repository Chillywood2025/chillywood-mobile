-- Production closeout for Owner/Admin Legal Intake and Legal Evidence.
-- This migration keeps the owner normal-access rule intact and adds the
-- functional case-history records needed for legal request workflows.

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
    when 'evidence_preview' then 'evidence_preview'
    when 'evidence_export' then 'evidence_export'
    when 'legal_hold' then 'legal_hold'
    when 'legal_ops' then 'legal_ops'
    when 'dmca_review' then 'dmca_review'
    when 'copyright_review' then 'copyright_review'
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
      'evidence_preview',
      'evidence_export',
      'legal_hold',
      'legal_ops',
      'dmca_review',
      'copyright_review',
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
  drop constraint if exists "platform_staff_permission_audit_permission_check";

alter table public."platform_staff_permission_audit"
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
      'evidence_preview',
      'evidence_export',
      'legal_hold',
      'legal_ops',
      'dmca_review',
      'copyright_review',
      'emergency_break_glass',
      'admin_grants',
      'manage_moderators',
      'audit_review',
      'security_review',
      'staff_permission_templates',
      'legal_request_intake'
    ));

alter table public."legal_request_intake"
  drop constraint if exists "legal_request_intake_status_check";

alter table public."legal_request_intake"
  add column if not exists "request_type" text default 'law_enforcement'::text not null,
  add column if not exists "contact_email" text,
  add column if not exists "contact_phone" text,
  add column if not exists "due_at" timestamptz,
  add column if not exists "notes" text,
  add column if not exists "legal_hold_status" text default 'none'::text not null,
  add column if not exists "closed_at" timestamptz,
  add column if not exists "reopened_at" timestamptz;

update public."legal_request_intake"
set "status" = case "status"
  when 'open' then 'received'
  when 'reviewing' then 'under_review'
  when 'fulfilled' then 'exported'
  when 'rejected' then 'rejected_no_action'
  when 'closed' then 'closed'
  else coalesce(nullif("status", ''), 'received')
end
where "status" in ('open', 'reviewing', 'fulfilled', 'rejected', 'closed')
   or "status" is null
   or "status" = '';

alter table public."legal_request_intake"
  alter column "status" set default 'received',
  add constraint "legal_request_intake_status_check"
    check ("status" in (
      'received',
      'needs_more_info',
      'under_review',
      'preserved_legal_hold',
      'evidence_prepared',
      'exported',
      'closed',
      'rejected_no_action'
    )),
  add constraint "legal_request_intake_type_check"
    check ("request_type" in (
      'law_enforcement',
      'civil_legal',
      'preservation',
      'court_order',
      'subpoena',
      'emergency',
      'dmca_related',
      'other'
    )),
  add constraint "legal_request_intake_hold_status_check"
    check ("legal_hold_status" in ('none', 'active', 'released'));

create index if not exists "legal_request_intake_case_number_idx"
  on public."legal_request_intake" (lower("case_number"));
create index if not exists "legal_request_intake_target_content_idx"
  on public."legal_request_intake" ("target_content_id", "created_at" desc)
  where "target_content_id" is not null;
create index if not exists "legal_request_intake_target_thread_idx"
  on public."legal_request_intake" ("target_thread_id", "created_at" desc)
  where "target_thread_id" is not null;
create index if not exists "legal_request_intake_target_room_idx"
  on public."legal_request_intake" ("target_room_id", "created_at" desc)
  where "target_room_id" is not null;
create index if not exists "legal_request_intake_due_idx"
  on public."legal_request_intake" ("due_at", "status")
  where "due_at" is not null;

create table if not exists public."legal_request_events" (
  "id" uuid not null default gen_random_uuid(),
  "legal_request_id" uuid not null references public."legal_request_intake"("id") on delete restrict,
  "event_type" text not null,
  "actor_user_id" text,
  "actor_email" text,
  "actor_role" text,
  "reason" text,
  "message" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "legal_request_events_pkey" primary key ("id"),
  constraint "legal_request_events_type_check"
    check ("event_type" in (
      'request_created',
      'status_changed',
      'target_linked',
      'evidence_linked',
      'evidence_previewed',
      'evidence_exported',
      'legal_hold_applied',
      'legal_hold_released',
      'note_added',
      'request_closed',
      'request_reopened'
    )),
  constraint "legal_request_events_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object')
);

create index if not exists "legal_request_events_request_created_idx"
  on public."legal_request_events" ("legal_request_id", "created_at" asc);
create index if not exists "legal_request_events_type_created_idx"
  on public."legal_request_events" ("event_type", "created_at" desc);

alter table public."legal_evidence_requests"
  add column if not exists "legal_request_id" uuid references public."legal_request_intake"("id") on delete set null,
  add column if not exists "target_type" text,
  add column if not exists "target_id" text;

create index if not exists "legal_evidence_requests_legal_request_idx"
  on public."legal_evidence_requests" ("legal_request_id", "created_at" desc)
  where "legal_request_id" is not null;
create index if not exists "legal_evidence_requests_target_idx"
  on public."legal_evidence_requests" ("target_type", "target_id", "created_at" desc)
  where "target_type" is not null and "target_id" is not null;

alter table public."legal_holds"
  add column if not exists "legal_request_id" uuid references public."legal_request_intake"("id") on delete set null;

create index if not exists "legal_holds_legal_request_idx"
  on public."legal_holds" ("legal_request_id", "placed_at" desc)
  where "legal_request_id" is not null;

alter table public."legal_request_events" enable row level security;

drop policy if exists "legal_request_intake_select_authorized" on public."legal_request_intake";
create policy "legal_request_intake_select_authorized"
  on public."legal_request_intake"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or (
      public.has_platform_role(array['operator'::text])
      and (
        public.has_platform_permission('legal_request_intake')
        or public.has_platform_permission('legal_review')
        or public.has_platform_permission('evidence_preview')
        or public.has_platform_permission('evidence_export')
        or public.has_platform_permission('legal_hold')
        or public.has_platform_permission('legal_ops')
        or public.has_platform_permission('audit_review')
        or public.has_platform_permission('security_review')
      )
    )
  );

drop policy if exists "legal_request_events_select_authorized" on public."legal_request_events";
create policy "legal_request_events_select_authorized"
  on public."legal_request_events"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or (
      public.has_platform_role(array['operator'::text])
      and (
        public.has_platform_permission('legal_request_intake')
        or public.has_platform_permission('legal_review')
        or public.has_platform_permission('evidence_preview')
        or public.has_platform_permission('evidence_export')
        or public.has_platform_permission('legal_hold')
        or public.has_platform_permission('legal_ops')
        or public.has_platform_permission('audit_review')
        or public.has_platform_permission('security_review')
      )
    )
  );

drop policy if exists "legal_evidence_requests_select_authorized"
  on public."legal_evidence_requests";
create policy "legal_evidence_requests_select_authorized"
  on public."legal_evidence_requests"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or (
      public.has_platform_role(array['operator'::text])
      and (
        public.has_platform_permission('legal_review')
        or public.has_platform_permission('evidence_preview')
        or public.has_platform_permission('evidence_export')
        or public.has_platform_permission('legal_hold')
        or public.has_platform_permission('legal_ops')
      )
    )
  );

drop policy if exists "legal_holds_select_authorized"
  on public."legal_holds";
create policy "legal_holds_select_authorized"
  on public."legal_holds"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or (
      public.has_platform_role(array['operator'::text])
      and (
        public.has_platform_permission('legal_review')
        or public.has_platform_permission('evidence_preview')
        or public.has_platform_permission('evidence_export')
        or public.has_platform_permission('legal_hold')
        or public.has_platform_permission('legal_ops')
      )
    )
  );

drop policy if exists "legal_evidence_audit_log_select_authorized"
  on public."legal_evidence_audit_log";
create policy "legal_evidence_audit_log_select_authorized"
  on public."legal_evidence_audit_log"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or (
      public.has_platform_role(array['operator'::text])
      and (
        public.has_platform_permission('legal_review')
        or public.has_platform_permission('evidence_preview')
        or public.has_platform_permission('evidence_export')
        or public.has_platform_permission('legal_hold')
        or public.has_platform_permission('legal_ops')
      )
    )
  );

revoke all on table public."legal_request_events" from "anon", "authenticated";
grant select on table public."legal_request_events" to "authenticated";
grant select, insert on table public."legal_request_events" to "service_role";

comment on table public."legal_request_events" is
  'Functional Legal Intake case history. This is case history, not owner-sensitive app audit.';
comment on column public."legal_request_intake"."legal_hold_status" is
  'Functional legal request hold state: none, active, or released.';
comment on column public."legal_evidence_requests"."legal_request_id" is
  'Optional linkage from a legal preview/export record to a Legal Intake request.';
comment on column public."legal_holds"."legal_request_id" is
  'Optional linkage from a legal hold to a Legal Intake request.';
