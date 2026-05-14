-- Admin-only Live Cost Guard foundation for LiveKit/TURN runaway cost protection.
-- Security boundary: normal users must not read or mutate these tables. Owner/operator
-- platform roles can inspect settings, events, and audit rows; service-role Edge
-- Functions can insert system webhook/action rows without exposing service-role keys.

create table if not exists public."admin_live_cost_guard_settings" (
  "id" uuid primary key default gen_random_uuid(),
  "mode" text not null default 'observe_only',
  "warning_threshold_mbps" numeric,
  "critical_threshold_mbps" numeric,
  "emergency_threshold_mbps" numeric,
  "max_estimated_usd_per_hour" numeric,
  "token_ttl_warning_seconds" integer default 300,
  "token_ttl_critical_seconds" integer default 60,
  "cooldown_seconds" integer default 300,
  "enabled" boolean not null default false,
  "updated_by" uuid null references auth.users("id"),
  "created_at" timestamptz default now(),
  "updated_at" timestamptz default now(),
  constraint "admin_live_cost_guard_settings_mode_check"
    check ("mode" in ('observe_only', 'manual_approval', 'auto_protect')),
  constraint "admin_live_cost_guard_settings_ttl_warning_check"
    check ("token_ttl_warning_seconds" is null or "token_ttl_warning_seconds" > 0),
  constraint "admin_live_cost_guard_settings_ttl_critical_check"
    check ("token_ttl_critical_seconds" is null or "token_ttl_critical_seconds" > 0),
  constraint "admin_live_cost_guard_settings_cooldown_check"
    check ("cooldown_seconds" is null or "cooldown_seconds" >= 0)
);

create table if not exists public."admin_live_cost_guard_events" (
  "id" uuid primary key default gen_random_uuid(),
  "created_at" timestamptz default now(),
  "severity" text not null,
  "source" text not null,
  "room_name" text null,
  "participant_identity" text null,
  "metric_snapshot_json" jsonb not null default '{}'::jsonb,
  "estimated_usd_per_hour" numeric null,
  "recommended_action" text null,
  "action_taken" text null,
  "action_status" text not null default 'logged',
  "admin_actor_id" uuid null references auth.users("id"),
  constraint "admin_live_cost_guard_events_severity_check"
    check ("severity" in ('normal', 'warning', 'high', 'critical', 'emergency')),
  constraint "admin_live_cost_guard_events_source_check"
    check ("source" in ('prometheus', 'alertmanager', 'manual', 'system'))
);

create table if not exists public."admin_live_cost_guard_actions" (
  "id" uuid primary key default gen_random_uuid(),
  "created_at" timestamptz default now(),
  "action_type" text not null,
  "room_name" text null,
  "participant_identity" text null,
  "reason" text not null,
  "before_json" jsonb not null default '{}'::jsonb,
  "after_json" jsonb not null default '{}'::jsonb,
  "success" boolean not null default false,
  "error_message" text null,
  "actor_type" text not null,
  "actor_id" uuid null references auth.users("id"),
  constraint "admin_live_cost_guard_actions_actor_type_check"
    check ("actor_type" in ('system', 'admin'))
);

create index if not exists "admin_live_cost_guard_settings_created_idx"
  on public."admin_live_cost_guard_settings" using btree ("created_at" desc);
create index if not exists "admin_live_cost_guard_events_created_idx"
  on public."admin_live_cost_guard_events" using btree ("created_at" desc);
create index if not exists "admin_live_cost_guard_events_severity_created_idx"
  on public."admin_live_cost_guard_events" using btree ("severity", "created_at" desc);
create index if not exists "admin_live_cost_guard_events_room_created_idx"
  on public."admin_live_cost_guard_events" using btree ("room_name", "created_at" desc);
create index if not exists "admin_live_cost_guard_actions_created_idx"
  on public."admin_live_cost_guard_actions" using btree ("created_at" desc);
create index if not exists "admin_live_cost_guard_actions_type_created_idx"
  on public."admin_live_cost_guard_actions" using btree ("action_type", "created_at" desc);

create or replace function public."set_admin_live_cost_guard_settings_updated_at"()
returns trigger
language plpgsql
as $$
begin
  new."updated_at" = now();
  return new;
end;
$$;

drop trigger if exists "set_admin_live_cost_guard_settings_updated_at"
  on public."admin_live_cost_guard_settings";
create trigger "set_admin_live_cost_guard_settings_updated_at"
  before update on public."admin_live_cost_guard_settings"
  for each row execute function public."set_admin_live_cost_guard_settings_updated_at"();

alter table public."admin_live_cost_guard_settings" enable row level security;
alter table public."admin_live_cost_guard_events" enable row level security;
alter table public."admin_live_cost_guard_actions" enable row level security;

drop policy if exists "admin_live_cost_guard_settings_select_owner_operator"
  on public."admin_live_cost_guard_settings";
create policy "admin_live_cost_guard_settings_select_owner_operator"
  on public."admin_live_cost_guard_settings"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "admin_live_cost_guard_settings_insert_owner_operator"
  on public."admin_live_cost_guard_settings";
create policy "admin_live_cost_guard_settings_insert_owner_operator"
  on public."admin_live_cost_guard_settings"
  for insert
  to authenticated
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "admin_live_cost_guard_settings_update_owner_operator"
  on public."admin_live_cost_guard_settings";
create policy "admin_live_cost_guard_settings_update_owner_operator"
  on public."admin_live_cost_guard_settings"
  for update
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "admin_live_cost_guard_events_select_owner_operator"
  on public."admin_live_cost_guard_events";
create policy "admin_live_cost_guard_events_select_owner_operator"
  on public."admin_live_cost_guard_events"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "admin_live_cost_guard_events_insert_owner_operator"
  on public."admin_live_cost_guard_events";
create policy "admin_live_cost_guard_events_insert_owner_operator"
  on public."admin_live_cost_guard_events"
  for insert
  to authenticated
  with check (
    public.has_platform_role(array['owner'::text, 'operator'::text])
    and "source" in ('manual', 'system')
  );

drop policy if exists "admin_live_cost_guard_actions_select_owner_operator"
  on public."admin_live_cost_guard_actions";
create policy "admin_live_cost_guard_actions_select_owner_operator"
  on public."admin_live_cost_guard_actions"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "admin_live_cost_guard_actions_insert_owner_operator"
  on public."admin_live_cost_guard_actions";
create policy "admin_live_cost_guard_actions_insert_owner_operator"
  on public."admin_live_cost_guard_actions"
  for insert
  to authenticated
  with check (
    public.has_platform_role(array['owner'::text, 'operator'::text])
    and "actor_type" = 'admin'
  );

revoke all on table public."admin_live_cost_guard_settings" from "anon";
revoke all on table public."admin_live_cost_guard_events" from "anon";
revoke all on table public."admin_live_cost_guard_actions" from "anon";
grant select, insert, update on table public."admin_live_cost_guard_settings" to "authenticated";
grant select, insert on table public."admin_live_cost_guard_events" to "authenticated";
grant select, insert on table public."admin_live_cost_guard_actions" to "authenticated";

insert into public."admin_live_cost_guard_settings" (
  "mode",
  "enabled",
  "token_ttl_warning_seconds",
  "token_ttl_critical_seconds",
  "cooldown_seconds"
)
select
  'observe_only',
  false,
  300,
  60,
  300
where not exists (select 1 from public."admin_live_cost_guard_settings");

comment on table public."admin_live_cost_guard_settings" is
  'Owner/operator-only Live Cost Guard settings. Default mode is observe_only and enabled=false so normal LiveKit behavior is unchanged until explicitly enabled.';
comment on table public."admin_live_cost_guard_events" is
  'Owner/operator-only Live Cost Guard event log for Prometheus, Alertmanager, manual, and system cost-risk observations. Metadata must be redacted/safe.';
comment on table public."admin_live_cost_guard_actions" is
  'Owner/operator-only audited Live Cost Guard action log. Dangerous actions must be server-side and explicitly gated; TURN cap is request/runbook only in this lane.';
