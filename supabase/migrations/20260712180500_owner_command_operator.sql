create extension if not exists pgcrypto with schema extensions;

create table if not exists public.owner_command_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid null,
  command_text text not null,
  normalized_intent text not null,
  target_systems text[] not null default '{}'::text[],
  approval_level integer not null check (approval_level in (0, 1, 2, 3, 4)),
  status text not null default 'received' check (
    status in (
      'received',
      'classified',
      'needs_clarification',
      'planned',
      'preflight_pending',
      'preflight_passed',
      'approval_required',
      'approved',
      'executing',
      'executed',
      'blocked',
      'failed',
      'cancelled',
      'denied',
      'superseded'
    )
  ),
  allowed_scope jsonb not null default '[]'::jsonb,
  forbidden_scope jsonb not null default '[]'::jsonb,
  preflight_plan jsonb not null default '[]'::jsonb,
  execution_plan jsonb not null default '[]'::jsonb,
  rollback_plan jsonb not null default '[]'::jsonb,
  proof_plan jsonb not null default '[]'::jsonb,
  validation_plan jsonb not null default '[]'::jsonb,
  approval_request_id uuid null references public.autonomous_approval_requests(id) on delete set null,
  external_confirmation_required boolean not null default false,
  external_confirmation_status text not null default 'not_required' check (
    external_confirmation_status in (
      'not_required',
      'required',
      'missing',
      'provided_test_mode',
      'provided_production',
      'rejected'
    )
  ),
  result_summary text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint owner_command_requests_json_shapes check (
    jsonb_typeof(allowed_scope) = 'array'
    and jsonb_typeof(forbidden_scope) = 'array'
    and jsonb_typeof(preflight_plan) = 'array'
    and jsonb_typeof(execution_plan) = 'array'
    and jsonb_typeof(rollback_plan) = 'array'
    and jsonb_typeof(proof_plan) = 'array'
    and jsonb_typeof(validation_plan) = 'array'
    and jsonb_typeof(metadata) = 'object'
  ),
  constraint owner_command_requests_has_target_system check (cardinality(target_systems) > 0),
  constraint owner_command_requests_command_no_obvious_secret check (
    command_text !~* '(secret|token|password|authorization|service[_-]?role|participant[_-]?token|signed[_-]?url|api[_-]?key|private[_-]?key|db[_-]?url|database[_-]?url)'
  )
);

create table if not exists public.owner_command_events (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null references public.owner_command_requests(id) on delete restrict,
  event_type text not null check (
    event_type in (
      'received',
      'classified',
      'needs_clarification',
      'planned',
      'preflight_pending',
      'preflight_passed',
      'approval_required',
      'approved',
      'executing',
      'executed',
      'blocked',
      'failed',
      'cancelled',
      'denied',
      'superseded',
      'approval_request_created',
      'external_confirmation_required'
    )
  ),
  actor_type text not null check (
    actor_type in (
      'owner',
      'super_admin',
      'rachi',
      'operator',
      'owner_command_operator',
      'media_automation',
      'livekit_operator',
      'money_flow_control',
      'notification_delivery_operator',
      'release_ota_operator',
      'security_owner_operator',
      'moderation_safety_operator',
      'observability_runtime_operator',
      'system'
    )
  ),
  actor_id uuid null,
  status text not null,
  event_summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint owner_command_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.owner_command_execution_steps (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null references public.owner_command_requests(id) on delete restrict,
  step_index integer not null check (step_index > 0),
  target_system text not null,
  action_id text not null,
  approval_level integer not null check (approval_level in (0, 1, 2, 3, 4)),
  status text not null default 'preflight_pending',
  preflight_status text not null default 'pending' check (
    preflight_status in ('pending', 'passed', 'failed', 'stale', 'not_required')
  ),
  execution_status text not null default 'not_started' check (
    execution_status in ('not_started', 'executed', 'blocked', 'failed', 'approval_required')
  ),
  allowed_scope jsonb not null default '[]'::jsonb,
  proof jsonb not null default '{}'::jsonb,
  result_summary text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint owner_command_execution_steps_json_shapes check (
    jsonb_typeof(allowed_scope) = 'array'
    and jsonb_typeof(proof) = 'object'
    and jsonb_typeof(metadata) = 'object'
  ),
  unique (command_id, step_index)
);

create table if not exists public.owner_command_blockers (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null references public.owner_command_requests(id) on delete restrict,
  blocker_code text not null,
  blocker_summary text not null,
  next_action text not null,
  resolved_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint owner_command_blockers_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists owner_command_requests_status_created_idx
  on public.owner_command_requests (status, created_at desc);

create index if not exists owner_command_requests_owner_created_idx
  on public.owner_command_requests (owner_user_id, created_at desc);

create index if not exists owner_command_events_command_created_idx
  on public.owner_command_events (command_id, created_at desc);

create index if not exists owner_command_execution_steps_command_idx
  on public.owner_command_execution_steps (command_id, step_index);

create index if not exists owner_command_blockers_command_idx
  on public.owner_command_blockers (command_id, created_at desc);

alter table public.owner_command_requests enable row level security;
alter table public.owner_command_events enable row level security;
alter table public.owner_command_execution_steps enable row level security;
alter table public.owner_command_blockers enable row level security;

revoke all on table public.owner_command_requests from anon, authenticated;
revoke all on table public.owner_command_events from anon, authenticated;
revoke all on table public.owner_command_execution_steps from anon, authenticated;
revoke all on table public.owner_command_blockers from anon, authenticated;

grant select, insert, update on table public.owner_command_requests to service_role;
grant select, insert on table public.owner_command_events to service_role;
grant select, insert, update on table public.owner_command_execution_steps to service_role;
grant select, insert, update on table public.owner_command_blockers to service_role;

comment on table public.owner_command_requests is
  'Owner judgment execution requests. Direct client writes are denied; the owner-command Edge Function verifies owner/super-admin authority and routes through existing autonomous system scopes.';

comment on table public.owner_command_events is
  'Append-only audit timeline for owner command classification, planning, approval gating, execution, and blockers. No secrets belong in metadata.';

comment on table public.owner_command_execution_steps is
  'Per-target autonomous system execution plan and proof rows for owner commands. Steps cannot bypass target operator scope or approval gates.';

comment on table public.owner_command_blockers is
  'Exact blocker and next-action records for owner commands that cannot safely execute.';
