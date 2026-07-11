create extension if not exists pgcrypto with schema extensions;

create table if not exists public.autonomous_approval_requests (
  id uuid primary key default gen_random_uuid(),
  system_id text not null,
  action_id text not null,
  requested_by_actor_type text not null check (
    requested_by_actor_type in (
      'operator',
      'livekit_operator',
      'media_automation',
      'rachi',
      'admin',
      'owner'
    )
  ),
  requested_by_actor_id uuid null,
  approval_level integer not null check (approval_level in (3, 4)),
  status text not null default 'pending' check (
    status in (
      'pending',
      'approved',
      'denied',
      'expired',
      'cancelled',
      'executed',
      'superseded'
    )
  ),
  title text not null,
  reason text not null,
  risk_summary text not null,
  proposed_action text not null,
  allowed_write_scope jsonb not null default '[]'::jsonb,
  forbidden_scope jsonb not null default '[]'::jsonb,
  rollback_plan text not null,
  kill_switch_plan text not null,
  proof_plan text not null,
  validation_plan text not null,
  expires_at timestamptz not null,
  approved_by uuid null,
  approved_at timestamptz null,
  denied_by uuid null,
  denied_at timestamptz null,
  denial_reason text null,
  execution_result text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint autonomous_approval_requests_scope_arrays check (
    jsonb_typeof(allowed_write_scope) = 'array'
    and jsonb_typeof(forbidden_scope) = 'array'
    and jsonb_typeof(metadata) = 'object'
  ),
  constraint autonomous_approval_requests_no_self_approval check (
    approved_by is null
    or requested_by_actor_id is null
    or approved_by <> requested_by_actor_id
  )
);

create table if not exists public.autonomous_approval_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.autonomous_approval_requests(id) on delete restrict,
  event_type text not null check (
    event_type in (
      'created',
      'approved',
      'denied',
      'cancelled',
      'expired',
      'executed',
      'superseded',
      'preflight_reran',
      'execution_blocked'
    )
  ),
  actor_type text not null check (
    actor_type in (
      'operator',
      'livekit_operator',
      'media_automation',
      'rachi',
      'admin',
      'owner',
      'system'
    )
  ),
  actor_id uuid null,
  event_summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint autonomous_approval_request_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists autonomous_approval_requests_status_idx
  on public.autonomous_approval_requests (status, expires_at);

create index if not exists autonomous_approval_requests_system_action_idx
  on public.autonomous_approval_requests (system_id, action_id, status);

create index if not exists autonomous_approval_request_events_request_idx
  on public.autonomous_approval_request_events (request_id, created_at desc);

alter table public.autonomous_approval_requests enable row level security;
alter table public.autonomous_approval_request_events enable row level security;

revoke all on table public.autonomous_approval_requests from anon, authenticated;
revoke all on table public.autonomous_approval_request_events from anon, authenticated;

grant select, insert, update on table public.autonomous_approval_requests to service_role;
grant select, insert on table public.autonomous_approval_request_events to service_role;

comment on table public.autonomous_approval_requests is
  'Source-proofed owner/admin approval request foundation for Level 3/4 autonomous actions. Client access is denied by default; approval execution remains foundation-only until explicit owner/super-admin backing is complete.';

comment on table public.autonomous_approval_request_events is
  'Append-only audit events for autonomous approval requests. No secrets, tokens, signed URLs, or provider credentials belong in metadata.';
