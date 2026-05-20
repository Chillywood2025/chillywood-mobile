create table if not exists public."admin_live_ops_incidents" (
  "id" uuid default gen_random_uuid() not null,
  "ops_job_id" text,
  "idempotency_key" text not null,
  "status" text default 'detected'::text not null,
  "title" text not null,
  "affected_route" text not null,
  "affected_purpose" text default 'live-stage'::text not null,
  "affected_platform" text default 'mobile'::text not null,
  "affected_rooms" text[] default '{}'::text[] not null,
  "affected_server_id" text,
  "affected_thread_id" text,
  "affected_call_id" text,
  "call_mode" text,
  "detected_symptoms" text[] default '{}'::text[] not null,
  "likely_cause" text not null,
  "confidence" text default 'low'::text not null,
  "suggested_fix" text not null,
  "risk_level" text default 'low'::text not null,
  "recommended_action" text default 'observe'::text not null,
  "rollback_note" text not null,
  "runbook_url" text,
  "runbook_path" text default 'docs/admin/LIVE_OPS_FIX_CENTER.md'::text not null,
  "dry_run_result" jsonb,
  "metadata" jsonb default '{}'::jsonb not null,
  "last_action_at" timestamp with time zone,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "admin_live_ops_incidents_pkey" primary key ("id"),
  constraint "admin_live_ops_incidents_idempotency_key_key" unique ("idempotency_key"),
  constraint "admin_live_ops_incidents_ops_job_id_key" unique ("ops_job_id"),
  constraint "admin_live_ops_incidents_status_check"
    check ("status" in ('detected', 'waiting_approval', 'dry_run_completed', 'approved', 'rejected', 'executed', 'failed')),
  constraint "admin_live_ops_incidents_route_check"
    check ("affected_route" in ('Live Watch-Party', 'Watch-Party Live', 'Chi''lly Chat')),
  constraint "admin_live_ops_incidents_purpose_check"
    check ("affected_purpose" in ('live-stage', 'watch-party-live', 'chat-call', 'chat-video-call', 'chat-audio-call')),
  constraint "admin_live_ops_incidents_call_mode_check"
    check ("call_mode" is null or "call_mode" in ('voice', 'video')),
  constraint "admin_live_ops_incidents_confidence_check"
    check ("confidence" in ('low', 'medium', 'high')),
  constraint "admin_live_ops_incidents_risk_level_check"
    check ("risk_level" in ('low', 'medium', 'high', 'critical')),
  constraint "admin_live_ops_incidents_action_check"
    check ("recommended_action" in (
      'observe',
      'create_github_issue',
      'create_github_pr',
      'rerun_github_actions_job',
      'drain_livekit_server',
      'block_new_rooms_on_server',
      'route_to_standby',
      'clear_stale_room_assignment',
      'clean_stale_chat_call',
      'restart_livekit_service',
      'rollback_last_infra_deploy'
    )),
  constraint "admin_live_ops_incidents_dry_run_object_check"
    check ("dry_run_result" is null or jsonb_typeof("dry_run_result") = 'object'),
  constraint "admin_live_ops_incidents_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object')
);

alter table public."admin_live_ops_incidents"
  add column if not exists "affected_purpose" text default 'live-stage'::text not null,
  add column if not exists "affected_thread_id" text,
  add column if not exists "affected_call_id" text,
  add column if not exists "call_mode" text,
  add column if not exists "dry_run_result" jsonb;

update public."admin_live_ops_incidents"
set "affected_purpose" = case
  when "affected_route" = 'Watch-Party Live' then 'watch-party-live'
  when "affected_route" = 'Chi''lly Chat' then 'chat-call'
  else 'live-stage'
end
where "affected_purpose" is null
   or "affected_purpose" = ''
   or ("affected_route" = 'Watch-Party Live' and "affected_purpose" = 'live-stage')
   or ("affected_route" = 'Chi''lly Chat' and "affected_purpose" = 'live-stage');

alter table public."admin_live_ops_incidents"
  drop constraint if exists "admin_live_ops_incidents_route_check",
  drop constraint if exists "admin_live_ops_incidents_purpose_check",
  drop constraint if exists "admin_live_ops_incidents_call_mode_check",
  drop constraint if exists "admin_live_ops_incidents_action_check",
  drop constraint if exists "admin_live_ops_incidents_dry_run_object_check";

alter table public."admin_live_ops_incidents"
  add constraint "admin_live_ops_incidents_route_check"
    check ("affected_route" in ('Live Watch-Party', 'Watch-Party Live', 'Chi''lly Chat')),
  add constraint "admin_live_ops_incidents_purpose_check"
    check ("affected_purpose" in ('live-stage', 'watch-party-live', 'chat-call', 'chat-video-call', 'chat-audio-call')),
  add constraint "admin_live_ops_incidents_call_mode_check"
    check ("call_mode" is null or "call_mode" in ('voice', 'video')),
  add constraint "admin_live_ops_incidents_action_check"
    check ("recommended_action" in (
      'observe',
      'create_github_issue',
      'create_github_pr',
      'rerun_github_actions_job',
      'drain_livekit_server',
      'block_new_rooms_on_server',
      'route_to_standby',
      'clear_stale_room_assignment',
      'clean_stale_chat_call',
      'restart_livekit_service',
      'rollback_last_infra_deploy'
    )),
  add constraint "admin_live_ops_incidents_dry_run_object_check"
    check ("dry_run_result" is null or jsonb_typeof("dry_run_result") = 'object');

create index if not exists "admin_live_ops_incidents_created_at_idx"
  on public."admin_live_ops_incidents" using btree ("created_at" desc);

create index if not exists "admin_live_ops_incidents_status_idx"
  on public."admin_live_ops_incidents" using btree ("status", "created_at" desc);

create index if not exists "admin_live_ops_incidents_server_idx"
  on public."admin_live_ops_incidents" using btree ("affected_server_id");

create index if not exists "admin_live_ops_incidents_purpose_idx"
  on public."admin_live_ops_incidents" using btree ("affected_purpose", "created_at" desc);

create index if not exists "admin_live_ops_incidents_call_idx"
  on public."admin_live_ops_incidents" using btree ("affected_call_id", "affected_thread_id");

create table if not exists public."admin_live_ops_action_audit" (
  "id" uuid default gen_random_uuid() not null,
  "incident_id" uuid references public."admin_live_ops_incidents"("id") on delete cascade,
  "ops_job_id" text,
  "idempotency_key" text not null,
  "event_type" text not null,
  "action_type" text not null,
  "actor_user_id" text,
  "actor_email" text,
  "actor_role" text,
  "target" jsonb default '{}'::jsonb not null,
  "risk_level" text default 'low'::text not null,
  "rollback_note" text,
  "dry_run" boolean default true not null,
  "success" boolean default false not null,
  "result" jsonb default '{}'::jsonb not null,
  "error_message" text,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "admin_live_ops_action_audit_pkey" primary key ("id"),
  constraint "admin_live_ops_action_audit_event_type_check"
    check ("event_type" in ('detect', 'dry_run', 'approve', 'reject', 'execute', 'fail', 'rollback_note', 'create_pr_only')),
  constraint "admin_live_ops_action_audit_risk_level_check"
    check ("risk_level" in ('low', 'medium', 'high', 'critical')),
  constraint "admin_live_ops_action_audit_target_object_check"
    check (jsonb_typeof("target") = 'object'),
  constraint "admin_live_ops_action_audit_result_object_check"
    check (jsonb_typeof("result") = 'object')
);

create index if not exists "admin_live_ops_action_audit_incident_idx"
  on public."admin_live_ops_action_audit" using btree ("incident_id", "created_at" desc);

create index if not exists "admin_live_ops_action_audit_ops_job_idx"
  on public."admin_live_ops_action_audit" using btree ("ops_job_id", "created_at" desc);

create index if not exists "admin_live_ops_action_audit_actor_rate_idx"
  on public."admin_live_ops_action_audit" using btree ("actor_user_id", "action_type", "created_at" desc);

alter table public."admin_live_ops_incidents" enable row level security;
alter table public."admin_live_ops_action_audit" enable row level security;

drop policy if exists "admin_live_ops_incidents_select_owner_operator" on public."admin_live_ops_incidents";
create policy "admin_live_ops_incidents_select_owner_operator"
  on public."admin_live_ops_incidents"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "admin_live_ops_incidents_insert_owner_operator" on public."admin_live_ops_incidents";
drop policy if exists "admin_live_ops_incidents_update_owner_operator" on public."admin_live_ops_incidents";

drop policy if exists "admin_live_ops_action_audit_select_owner_operator" on public."admin_live_ops_action_audit";
create policy "admin_live_ops_action_audit_select_owner_operator"
  on public."admin_live_ops_action_audit"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "admin_live_ops_action_audit_insert_owner_operator" on public."admin_live_ops_action_audit";

revoke all on table public."admin_live_ops_incidents" from "anon", "authenticated";
revoke all on table public."admin_live_ops_action_audit" from "anon", "authenticated";
grant select on table public."admin_live_ops_incidents" to "authenticated";
grant select on table public."admin_live_ops_action_audit" to "authenticated";
grant select, insert, update on table public."admin_live_ops_incidents" to "service_role";
grant select, insert on table public."admin_live_ops_action_audit" to "service_role";
revoke delete on table public."admin_live_ops_incidents" from "authenticated", "service_role";
revoke update, delete on table public."admin_live_ops_action_audit" from "authenticated", "service_role";

create or replace function public.set_admin_live_ops_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new."updated_at" = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists "set_admin_live_ops_incidents_updated_at" on public."admin_live_ops_incidents";
create trigger "set_admin_live_ops_incidents_updated_at"
  before update on public."admin_live_ops_incidents"
  for each row execute function public.set_admin_live_ops_updated_at();

create or replace function public.prevent_admin_live_ops_action_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'admin_live_ops_action_audit is append-only';
end;
$$;

drop trigger if exists "prevent_admin_live_ops_action_audit_mutation" on public."admin_live_ops_action_audit";
create trigger "prevent_admin_live_ops_action_audit_mutation"
  before update or delete on public."admin_live_ops_action_audit"
  for each row execute function public.prevent_admin_live_ops_action_audit_mutation();

comment on table public."admin_live_ops_incidents" is
  'Owner/operator Live Ops Fix Center incident cards for real reliability alerts only. No fake health, fake participants, fake stats, automatic merge, or automatic deploy.';

comment on table public."admin_live_ops_action_audit" is
  'Append-only owner/operator Live Ops Fix Center action audit. Stores sanitized dry-run, approval, rejection, execution, failure, and rollback-note events.';
