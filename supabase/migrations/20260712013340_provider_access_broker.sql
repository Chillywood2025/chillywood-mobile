-- Provider Access Broker for Money Flow Control.
-- Stores capability/readback/repair metadata only. Never store provider secret values.

create table if not exists public.provider_access_capabilities (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'money_flow_control',
  provider text not null,
  capability text not null,
  access_mode text not null default 'none',
  status text not null default 'unknown',
  available boolean not null default false,
  last_checked_at timestamptz not null default now(),
  requires_owner_approval boolean not null default false,
  required_secret_names text[] not null default '{}',
  forbidden_scope jsonb not null default '[]'::jsonb,
  approval_request_id uuid null references public.autonomous_approval_requests(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_access_capabilities_system_check check (system_id = 'money_flow_control'),
  constraint provider_access_capabilities_provider_check check (provider in ('revenuecat', 'google_play', 'stripe_connect', 'stripe_merch', 'provider_readiness')),
  constraint provider_access_capabilities_mode_check check (access_mode in ('none', 'local_env', 'supabase_secret', 'host_env', 'github_secret', 'cloudflare_secret', 'provider_api_readonly', 'provider_api_test_mode_write', 'provider_dashboard_owner_session', 'provider_live_mutation_requires_approval')),
  constraint provider_access_capabilities_status_check check (status in ('available', 'missing_credentials', 'owner_session_required', 'approval_required', 'blocked', 'unknown')),
  constraint provider_access_capabilities_no_secret_metadata check (metadata::text !~* '(secret|token|password|service_role|private_key|db_url|database_url|webhook_secret|authorization|api_key|signed_url|account_number|routing_number|iban|swift)'),
  unique (provider, capability, access_mode)
);

create table if not exists public.provider_access_audit_events (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'money_flow_control',
  provider text not null,
  capability text not null,
  event_type text not null,
  result text not null default 'recorded',
  access_mode text not null default 'none',
  environment_mode text not null default 'test',
  money_moved boolean not null default false,
  provider_dashboard_mutated boolean not null default false,
  approval_request_id uuid null references public.autonomous_approval_requests(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint provider_access_audit_events_system_check check (system_id = 'money_flow_control'),
  constraint provider_access_audit_events_money_check check (money_moved = false),
  constraint provider_access_audit_events_dashboard_mutation_check check (provider_dashboard_mutated = false),
  constraint provider_access_audit_events_mode_check check (access_mode in ('none', 'local_env', 'supabase_secret', 'host_env', 'github_secret', 'cloudflare_secret', 'provider_api_readonly', 'provider_api_test_mode_write', 'provider_dashboard_owner_session', 'provider_live_mutation_requires_approval')),
  constraint provider_access_audit_events_environment_check check (environment_mode in ('sandbox', 'test', 'production')),
  constraint provider_access_audit_events_no_secret_metadata check (metadata::text !~* '(secret|token|password|service_role|private_key|db_url|database_url|webhook_secret|authorization|api_key|signed_url|account_number|routing_number|iban|swift)')
);

create table if not exists public.provider_dashboard_repair_requests (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'money_flow_control',
  provider text not null,
  capability text not null,
  repair_status text not null default 'approval_required',
  approval_level integer not null default 3,
  approval_request_id uuid null references public.autonomous_approval_requests(id) on delete set null,
  old_value_redacted text null,
  proposed_value_redacted text null,
  risk_summary text not null,
  rollback_plan text not null,
  proof_plan text not null,
  money_moved boolean not null default false,
  provider_dashboard_mutated boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_dashboard_repair_requests_system_check check (system_id = 'money_flow_control'),
  constraint provider_dashboard_repair_requests_status_check check (repair_status in ('approval_required', 'pending_owner_approval', 'approved_not_executed', 'denied', 'superseded')),
  constraint provider_dashboard_repair_requests_approval_level_check check (approval_level in (3, 4)),
  constraint provider_dashboard_repair_requests_money_check check (money_moved = false),
  constraint provider_dashboard_repair_requests_dashboard_mutation_check check (provider_dashboard_mutated = false),
  constraint provider_dashboard_repair_requests_no_secret_metadata check (metadata::text !~* '(secret|token|password|service_role|private_key|db_url|database_url|webhook_secret|authorization|api_key|signed_url|account_number|routing_number|iban|swift)')
);

create index if not exists provider_access_capabilities_provider_idx
  on public.provider_access_capabilities(provider, capability, status);

create index if not exists provider_access_audit_events_provider_idx
  on public.provider_access_audit_events(provider, capability, created_at desc);

create index if not exists provider_dashboard_repair_requests_provider_idx
  on public.provider_dashboard_repair_requests(provider, capability, created_at desc);

alter table public.provider_access_capabilities enable row level security;
alter table public.provider_access_audit_events enable row level security;
alter table public.provider_dashboard_repair_requests enable row level security;

comment on table public.provider_access_capabilities is 'Money Flow Control provider access capability metadata only; client writes denied by RLS and no provider secret values allowed.';
comment on table public.provider_access_audit_events is 'Money Flow Control provider access audit events; no money movement, dashboard mutation, or secret values.';
comment on table public.provider_dashboard_repair_requests is 'Provider dashboard repair approval records; mutation requires autonomous approval and remains non-money.';
