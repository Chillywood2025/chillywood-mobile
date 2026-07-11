create table if not exists public.livekit_operator_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  surface text not null,
  health_state text not null,
  severity text not null default 'info',
  reason text not null,
  action_planned text,
  action_taken text,
  result text,
  recovery_duration_ms integer,
  before_health jsonb not null default '{}'::jsonb,
  after_health jsonb not null default '{}'::jsonb,
  rollback_available boolean not null default false,
  confidence numeric(4,3) not null default 0,
  occurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.livekit_operator_recovery_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  surface text not null,
  health_state text not null,
  severity text not null default 'info',
  reason text not null,
  recovery_level integer not null default 0 check (recovery_level between 0 and 4),
  action_planned text not null,
  action_taken text,
  result text not null default 'planned',
  auto_executable boolean not null default false,
  owner_approval_required boolean not null default false,
  rollback_available boolean not null default false,
  recovery_duration_ms integer,
  before_health jsonb not null default '{}'::jsonb,
  after_health jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.livekit_surface_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  surface text not null,
  health_state text not null,
  severity text not null default 'info',
  reason text not null,
  eligible_server_count integer,
  heartbeat_age_seconds integer,
  token_probe_status text,
  render_health jsonb not null default '{}'::jsonb,
  router_health jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.livekit_operator_learning_state (
  id uuid primary key default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  surface text not null,
  health_state text not null,
  reason text not null,
  preferred_action text not null,
  occurrence_count integer not null default 1,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  confidence numeric(4,3) not null default 0,
  last_result text,
  last_recovery_duration_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  unique (surface, health_state, reason, preferred_action)
);

alter table public.livekit_operator_events enable row level security;
alter table public.livekit_operator_recovery_actions enable row level security;
alter table public.livekit_surface_health_snapshots enable row level security;
alter table public.livekit_operator_learning_state enable row level security;

revoke all on table public.livekit_operator_events from anon, authenticated;
revoke all on table public.livekit_operator_recovery_actions from anon, authenticated;
revoke all on table public.livekit_surface_health_snapshots from anon, authenticated;
revoke all on table public.livekit_operator_learning_state from anon, authenticated;

grant select, insert, update, delete on table public.livekit_operator_events to service_role;
grant select, insert, update, delete on table public.livekit_operator_recovery_actions to service_role;
grant select, insert, update, delete on table public.livekit_surface_health_snapshots to service_role;
grant select, insert, update, delete on table public.livekit_operator_learning_state to service_role;

create index if not exists livekit_operator_events_surface_created_idx
  on public.livekit_operator_events (surface, created_at desc);

create index if not exists livekit_operator_recovery_actions_surface_created_idx
  on public.livekit_operator_recovery_actions (surface, created_at desc);

create index if not exists livekit_surface_health_snapshots_surface_created_idx
  on public.livekit_surface_health_snapshots (surface, created_at desc);

create index if not exists livekit_operator_learning_state_surface_idx
  on public.livekit_operator_learning_state (surface, health_state);
