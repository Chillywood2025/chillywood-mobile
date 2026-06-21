-- LiveKit Server Registry + Room Router + Drain Mode foundation.
-- Security boundary:
-- - Normal users cannot create, update, or list LiveKit server registry rows.
-- - Server/owner/operator paths manage registry state through service-role Edge Functions.
-- - Clients receive only the assigned public WebSocket URL from the token function after normal room authorization.
-- - This migration does not migrate active rooms, delete rooms, disconnect participants, or add autoscaling.

create table if not exists public."livekit_servers" (
  "id" uuid primary key default gen_random_uuid(),
  "server_id" text not null unique,
  "display_name" text not null,
  "provider" text not null default 'hetzner',
  "region" text not null,
  "public_ws_url" text not null,
  "internal_api_url" text,
  "status" text not null default 'standby',
  "weight" integer not null default 100,
  "max_rooms" integer not null default 100,
  "max_participants" integer not null default 1000,
  "max_publishers" integer,
  "max_egress_mbps" numeric,
  "current_rooms" integer not null default 0,
  "current_participants" integer not null default 0,
  "current_publishers" integer not null default 0,
  "cpu_percent" numeric,
  "ram_percent" numeric,
  "bandwidth_in_mbps" numeric,
  "bandwidth_out_mbps" numeric,
  "packet_loss_percent" numeric,
  "disconnect_rate" numeric,
  "last_heartbeat_at" timestamptz,
  "last_assignment_at" timestamptz,
  "drain_started_at" timestamptz,
  "drain_reason" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "livekit_servers_provider_check"
    check ("provider" in ('hetzner', 'ovh', 'local', 'other')),
  constraint "livekit_servers_status_check"
    check ("status" in ('active', 'draining', 'offline', 'maintenance', 'disabled', 'standby')),
  constraint "livekit_servers_weight_check"
    check ("weight" > 0),
  constraint "livekit_servers_capacity_check"
    check ("max_rooms" > 0 and "max_participants" > 0),
  constraint "livekit_servers_publishers_check"
    check ("max_publishers" is null or "max_publishers" >= 0),
  constraint "livekit_servers_nonnegative_metrics_check"
    check (
      "max_egress_mbps" is null or "max_egress_mbps" >= 0
    ),
  constraint "livekit_servers_current_counts_check"
    check (
      "current_rooms" >= 0
      and "current_participants" >= 0
      and "current_publishers" >= 0
    ),
  constraint "livekit_servers_percent_metrics_check"
    check (
      ("cpu_percent" is null or ("cpu_percent" >= 0 and "cpu_percent" <= 100))
      and ("ram_percent" is null or ("ram_percent" >= 0 and "ram_percent" <= 100))
      and ("packet_loss_percent" is null or ("packet_loss_percent" >= 0 and "packet_loss_percent" <= 100))
      and ("disconnect_rate" is null or "disconnect_rate" >= 0)
      and ("bandwidth_in_mbps" is null or "bandwidth_in_mbps" >= 0)
      and ("bandwidth_out_mbps" is null or "bandwidth_out_mbps" >= 0)
    ),
  constraint "livekit_servers_public_ws_url_check"
    check (
      "public_ws_url" ~ '^wss://[^[:space:]]+$'
      or "public_ws_url" ~ '^ws://(localhost|127[.]0[.]0[.]1)(:[0-9]+)?(/.*)?$'
    ),
  constraint "livekit_servers_internal_api_url_check"
    check (
      "internal_api_url" is null
      or "internal_api_url" ~ '^https?://[^[:space:]]+$'
    )
);

create table if not exists public."livekit_room_assignments" (
  "id" uuid primary key default gen_random_uuid(),
  "app_room_id" text not null,
  "livekit_room_name" text not null,
  "assigned_server_id" uuid not null references public."livekit_servers"("id") on delete restrict,
  "assignment_reason" text not null,
  "assignment_status" text not null default 'assigned',
  "room_type" text not null,
  "visibility" text,
  "is_publicly_eligible" boolean not null default false,
  "created_by" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "ended_at" timestamptz,
  constraint "livekit_room_assignments_status_check"
    check ("assignment_status" in ('assigned', 'active', 'ended', 'failed', 'manually_moved')),
  constraint "livekit_room_assignments_type_check"
    check ("room_type" in ('live_watch_party', 'watch_party_live', 'live_stage', 'party_room', 'proof', 'chat_call', 'other')),
  constraint "livekit_room_assignments_unique_active_key"
    unique ("app_room_id", "livekit_room_name", "room_type")
);

create table if not exists public."livekit_server_heartbeats" (
  "id" uuid primary key default gen_random_uuid(),
  "server_id" uuid not null references public."livekit_servers"("id") on delete cascade,
  "cpu_percent" numeric,
  "ram_percent" numeric,
  "bandwidth_in_mbps" numeric,
  "bandwidth_out_mbps" numeric,
  "active_rooms" integer not null default 0,
  "active_participants" integer not null default 0,
  "active_publishers" integer not null default 0,
  "packet_loss_percent" numeric,
  "disconnect_rate" numeric,
  "heartbeat_at" timestamptz not null default now(),
  constraint "livekit_server_heartbeats_counts_check"
    check ("active_rooms" >= 0 and "active_participants" >= 0 and "active_publishers" >= 0),
  constraint "livekit_server_heartbeats_metric_check"
    check (
      ("cpu_percent" is null or ("cpu_percent" >= 0 and "cpu_percent" <= 100))
      and ("ram_percent" is null or ("ram_percent" >= 0 and "ram_percent" <= 100))
      and ("packet_loss_percent" is null or ("packet_loss_percent" >= 0 and "packet_loss_percent" <= 100))
      and ("disconnect_rate" is null or "disconnect_rate" >= 0)
      and ("bandwidth_in_mbps" is null or "bandwidth_in_mbps" >= 0)
      and ("bandwidth_out_mbps" is null or "bandwidth_out_mbps" >= 0)
    )
);

create table if not exists public."livekit_routing_audit" (
  "id" uuid primary key default gen_random_uuid(),
  "event_type" text not null,
  "server_id" uuid references public."livekit_servers"("id") on delete set null,
  "app_room_id" text,
  "livekit_room_name" text,
  "actor_user_id" text,
  "reason" text not null,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now(),
  constraint "livekit_routing_audit_event_type_check"
    check (
      "event_type" in (
        'server_registered',
        'heartbeat_received',
        'room_assigned',
        'assignment_reused',
        'assignment_failed',
        'server_draining',
        'server_activated',
        'server_disabled',
        'server_maintenance',
        'server_offline',
        'server_standby',
        'capacity_blocked',
        'no_eligible_server'
      )
    )
);

create index if not exists "livekit_servers_status_idx"
  on public."livekit_servers" using btree ("status", "last_heartbeat_at" desc);

create index if not exists "livekit_room_assignments_room_idx"
  on public."livekit_room_assignments" using btree ("app_room_id", "room_type", "assignment_status");

create index if not exists "livekit_room_assignments_server_idx"
  on public."livekit_room_assignments" using btree ("assigned_server_id", "assignment_status");

create index if not exists "livekit_server_heartbeats_server_time_idx"
  on public."livekit_server_heartbeats" using btree ("server_id", "heartbeat_at" desc);

create index if not exists "livekit_routing_audit_created_idx"
  on public."livekit_routing_audit" using btree ("created_at" desc);

create or replace function public."set_livekit_registry_updated_at"()
returns trigger
language plpgsql
as $$
begin
  new."updated_at" = now();
  return new;
end;
$$;

drop trigger if exists "set_livekit_servers_updated_at" on public."livekit_servers";
create trigger "set_livekit_servers_updated_at"
  before update on public."livekit_servers"
  for each row execute function public."set_livekit_registry_updated_at"();

drop trigger if exists "set_livekit_room_assignments_updated_at" on public."livekit_room_assignments";
create trigger "set_livekit_room_assignments_updated_at"
  before update on public."livekit_room_assignments"
  for each row execute function public."set_livekit_registry_updated_at"();

alter table public."livekit_servers" enable row level security;
alter table public."livekit_room_assignments" enable row level security;
alter table public."livekit_server_heartbeats" enable row level security;
alter table public."livekit_routing_audit" enable row level security;

drop policy if exists "livekit_servers_owner_operator_select" on public."livekit_servers";
create policy "livekit_servers_owner_operator_select"
  on public."livekit_servers"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "livekit_servers_owner_operator_write" on public."livekit_servers";
create policy "livekit_servers_owner_operator_write"
  on public."livekit_servers"
  for all
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "livekit_room_assignments_owner_operator_select" on public."livekit_room_assignments";
create policy "livekit_room_assignments_owner_operator_select"
  on public."livekit_room_assignments"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "livekit_room_assignments_owner_operator_write" on public."livekit_room_assignments";
create policy "livekit_room_assignments_owner_operator_write"
  on public."livekit_room_assignments"
  for all
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "livekit_server_heartbeats_owner_operator_select" on public."livekit_server_heartbeats";
create policy "livekit_server_heartbeats_owner_operator_select"
  on public."livekit_server_heartbeats"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "livekit_server_heartbeats_owner_operator_write" on public."livekit_server_heartbeats";
create policy "livekit_server_heartbeats_owner_operator_write"
  on public."livekit_server_heartbeats"
  for all
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "livekit_routing_audit_owner_operator_select" on public."livekit_routing_audit";
create policy "livekit_routing_audit_owner_operator_select"
  on public."livekit_routing_audit"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "livekit_routing_audit_owner_operator_insert" on public."livekit_routing_audit";
create policy "livekit_routing_audit_owner_operator_insert"
  on public."livekit_routing_audit"
  for insert
  to authenticated
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."livekit_servers" from "anon", "authenticated";
revoke all on table public."livekit_room_assignments" from "anon", "authenticated";
revoke all on table public."livekit_server_heartbeats" from "anon", "authenticated";
revoke all on table public."livekit_routing_audit" from "anon", "authenticated";

grant select, insert, update, delete on table public."livekit_servers" to "authenticated";
grant select, insert, update, delete on table public."livekit_room_assignments" to "authenticated";
grant select, insert, update, delete on table public."livekit_server_heartbeats" to "authenticated";
grant select, insert on table public."livekit_routing_audit" to "authenticated";

insert into public."livekit_servers" (
  "server_id",
  "display_name",
  "provider",
  "region",
  "public_ws_url",
  "status",
  "weight",
  "max_rooms",
  "max_participants",
  "metadata"
) values (
  'chillywood-prod-01',
  'Chi''llywood Hetzner LiveKit 01',
  'hetzner',
  'operator-set',
  'wss://live.chillywoodstream.com',
  'active',
  100,
  100,
  1000,
  jsonb_build_object('single_box_current_truth', true, 'autoscaling', false)
)
on conflict ("server_id") do update set
  "display_name" = excluded."display_name",
  "provider" = excluded."provider",
  "public_ws_url" = excluded."public_ws_url",
  "metadata" = public."livekit_servers"."metadata" || excluded."metadata",
  "updated_at" = now();

comment on table public."livekit_servers" is
  'Operator/server-owned LiveKit registry. Normal users cannot manage or broadly read this table; clients receive only the assigned public WebSocket URL after room authorization.';

comment on column public."livekit_servers"."public_ws_url" is
  'Client-safe public LiveKit WebSocket URL returned only by authorized token issuance for an assigned room.';

comment on column public."livekit_servers"."internal_api_url" is
  'Server/operator-only internal API URL. Do not return this to normal app clients.';

comment on table public."livekit_room_assignments" is
  'Pins Chi''llywood app rooms to a LiveKit server. Existing assignments win; active rooms are not migrated by the router.';

comment on table public."livekit_server_heartbeats" is
  'Server heartbeat snapshots for router health/capacity decisions. Metrics may be null when not available; null metrics must not be faked.';

comment on table public."livekit_routing_audit" is
  'Append-style routing decisions and operator registry events with redacted metadata only.';
