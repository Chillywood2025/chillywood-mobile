-- Governed User Report Router, owned as a Support Success Operator surface.
-- This is a reviewed forward migration derived from the intentionally isolated
-- 20260714001704 source. It adds current platform, RLS, control-plane, and
-- secret-safety contracts without deploying the historical migration itself.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.user_report_intake_events (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid,
  report_type text not null check (report_type in (
    'safety_abuse','harassment','impersonation','copyright','illegal_or_dangerous_content',
    'bug_broken_feature','feature_request','account_access','premium_or_billing','payout_or_money',
    'media_playback','upload_or_transcode','livekit_live_watchparty','chat_or_call',
    'notification_delivery','release_update_version','search_discovery_visibility',
    'privacy_data','security_access','ads_sponsor','other_support'
  )),
  category text not null,
  severity text not null default 'review' check (severity in ('low','review','major','critical')),
  platform text not null default 'unknown' check (platform in ('shared','ios','android','web','unknown')),
  surface text, route text, target_type text, target_id_hash text,
  app_version text, native_build text, update_id text, runtime_version text, channel text,
  normalized_fingerprint text not null,
  text_summary_redacted text not null default '', raw_text_redacted text,
  source text not null default 'app_user_report',
  report_status text not null default 'submitted' check (report_status in ('submitted','classified','clustered','routed','review_required','spam','closed')),
  false_positive boolean not null default false, spam_flag boolean not null default false,
  duplicate_flag boolean not null default false,
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_report_intake_no_obvious_secret check (
    coalesce(text_summary_redacted,'') !~* '(service[_-]?role|private[_-]?key|signed[_-]?url|db[_-]?url|database[_-]?url|payment[_-]?credential|tax[_-]?id|bank[_-]?detail|authorization|api[_-]?key)'
    and coalesce(raw_text_redacted,'') !~* '(service[_-]?role|private[_-]?key|signed[_-]?url|db[_-]?url|database[_-]?url|payment[_-]?credential|tax[_-]?id|bank[_-]?detail|authorization|api[_-]?key)'
  )
);

create table if not exists public.user_report_classifications (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.user_report_intake_events(id) on delete cascade,
  platform text not null default 'unknown' check (platform in ('shared','ios','android','web','unknown')),
  report_type text not null, category text not null,
  severity text not null check (severity in ('low','review','major','critical')),
  routed_system_id text not null,
  escalation_policy text not null default 'threshold' check (escalation_policy in ('threshold','immediate_review','manual_review','spam_review')),
  blocker_classification text,
  confidence numeric(4,3) not null default 0.7 check (confidence between 0 and 1),
  prompt_injection_flag boolean not null default false, spam_flag boolean not null default false,
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_report_clusters (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'unknown' check (platform in ('shared','ios','android','web','unknown')),
  normalized_fingerprint text not null,
  report_type text not null, category text not null,
  severity text not null check (severity in ('low','review','major','critical')),
  surface text, route text, target_type text, target_id_hash text,
  text_summary_redacted text not null default '',
  unique_reporter_count integer not null default 0 check (unique_reporter_count >= 0),
  report_count integer not null default 0 check (report_count >= 0),
  threshold_unique_reporters integer not null default 3 check (threshold_unique_reporters >= 1),
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  cluster_status text not null default 'open' check (cluster_status in ('open','threshold_met','routed','review_required','spam','false_positive','closed','superseded')),
  routed_system_id text not null,
  owner_command_id uuid references public.owner_command_requests(id) on delete set null,
  approval_request_id uuid references public.autonomous_approval_requests(id) on delete set null,
  action_status text not null default 'not_routed' check (action_status in ('not_routed','threshold_pending','review_required','owner_command_created','approval_request_created','routed','blocked','closed')),
  false_positive boolean not null default false, spam_flag boolean not null default false,
  finding_key text,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  resolved_at timestamptz,
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  unique (platform, normalized_fingerprint),
  constraint user_report_clusters_no_obvious_secret check (coalesce(text_summary_redacted,'') !~* '(service[_-]?role|private[_-]?key|signed[_-]?url|db[_-]?url|database[_-]?url|payment[_-]?credential|tax[_-]?id|bank[_-]?detail|authorization|api[_-]?key)')
);

create table if not exists public.user_report_cluster_members (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.user_report_clusters(id) on delete cascade,
  report_id uuid not null references public.user_report_intake_events(id) on delete cascade,
  reporter_user_id uuid, reporter_hash text not null,
  report_count integer not null default 1 check (report_count >= 1), duplicate_flag boolean not null default false,
  first_seen_at timestamptz not null default timezone('utc', now()), last_seen_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  constraint user_report_cluster_members_unique_reporter unique (cluster_id, reporter_hash)
);

create table if not exists public.user_report_routing_actions (
  id uuid primary key default gen_random_uuid(), cluster_id uuid not null references public.user_report_clusters(id) on delete cascade,
  platform text not null default 'unknown' check (platform in ('shared','ios','android','web','unknown')),
  action_type text not null check (action_type in ('threshold_owner_command','immediate_escalation','manual_review','spam_review')),
  routed_system_id text not null,
  owner_command_id uuid references public.owner_command_requests(id) on delete set null,
  approval_request_id uuid references public.autonomous_approval_requests(id) on delete set null,
  action_status text not null default 'created' check (action_status in ('created','queued','owner_command_created','approval_request_created','blocked','closed')),
  reason text not null, unique_reporter_count integer not null default 0, report_count integer not null default 0,
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_report_operator_findings (
  id uuid primary key default gen_random_uuid(), cluster_id uuid not null references public.user_report_clusters(id) on delete cascade,
  platform text not null default 'unknown' check (platform in ('shared','ios','android','web','unknown')),
  system_id text not null, finding_type text not null,
  severity text not null check (severity in ('low','review','major','critical')),
  routed_system_id text not null, text_summary_redacted text not null default '',
  unique_reporter_count integer not null default 0, report_count integer not null default 0,
  owner_command_id uuid references public.owner_command_requests(id) on delete set null,
  approval_request_id uuid references public.autonomous_approval_requests(id) on delete set null,
  finding_status text not null default 'open' check (finding_status in ('open','owner_command_created','approval_request_created','blocked','closed')),
  finding_key text, occurrence_count integer not null default 1 check (occurrence_count >= 1),
  first_seen_at timestamptz not null default timezone('utc', now()), last_seen_at timestamptz not null default timezone('utc', now()), resolved_at timestamptz,
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_report_operator_findings_no_obvious_secret check (coalesce(text_summary_redacted,'') !~* '(service[_-]?role|private[_-]?key|signed[_-]?url|db[_-]?url|database[_-]?url|payment[_-]?credential|tax[_-]?id|bank[_-]?detail|authorization|api[_-]?key)')
);

create table if not exists public.user_report_router_learning_state (
  id uuid primary key default gen_random_uuid(), system_id text not null default 'support_success_operator' check (system_id = 'support_success_operator'),
  platform text not null default 'shared' check (platform in ('shared','ios','android','web','unknown')),
  learning_key text not null, learning_state text not null default 'active',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  unique (system_id, platform, learning_key)
);

create index if not exists user_report_intake_reporter_idx on public.user_report_intake_events (reporter_user_id, created_at desc);
create index if not exists user_report_intake_platform_fingerprint_idx on public.user_report_intake_events (platform, normalized_fingerprint, created_at desc);
create index if not exists user_report_classifications_report_idx on public.user_report_classifications (report_id, created_at desc);
create index if not exists user_report_clusters_status_idx on public.user_report_clusters (platform, cluster_status, last_seen_at desc);
create index if not exists user_report_clusters_routed_system_idx on public.user_report_clusters (platform, routed_system_id, action_status);
create index if not exists user_report_cluster_members_report_idx on public.user_report_cluster_members (report_id);
create index if not exists user_report_routing_actions_cluster_idx on public.user_report_routing_actions (platform, cluster_id, created_at desc);
create index if not exists user_report_operator_findings_system_idx on public.user_report_operator_findings (platform, routed_system_id, finding_status, created_at desc);

create or replace function public.inherit_user_report_platform()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'user_report_classifications' then
    select report.platform into new.platform from public.user_report_intake_events report where report.id = new.report_id;
  elsif tg_table_name in ('user_report_routing_actions','user_report_operator_findings') then
    select cluster.platform into new.platform from public.user_report_clusters cluster where cluster.id = new.cluster_id;
  end if;
  new.platform := coalesce(new.platform, 'unknown');
  return new;
end;
$$;
drop trigger if exists user_report_classification_inherit_platform on public.user_report_classifications;
create trigger user_report_classification_inherit_platform before insert on public.user_report_classifications for each row execute function public.inherit_user_report_platform();
drop trigger if exists user_report_action_inherit_platform on public.user_report_routing_actions;
create trigger user_report_action_inherit_platform before insert on public.user_report_routing_actions for each row execute function public.inherit_user_report_platform();
drop trigger if exists user_report_finding_inherit_platform on public.user_report_operator_findings;
create trigger user_report_finding_inherit_platform before insert on public.user_report_operator_findings for each row execute function public.inherit_user_report_platform();

alter table public.user_report_intake_events enable row level security;
alter table public.user_report_classifications enable row level security;
alter table public.user_report_clusters enable row level security;
alter table public.user_report_cluster_members enable row level security;
alter table public.user_report_routing_actions enable row level security;
alter table public.user_report_operator_findings enable row level security;
alter table public.user_report_router_learning_state enable row level security;

revoke all on table public.user_report_intake_events from public;
revoke all on table public.user_report_classifications from public;
revoke all on table public.user_report_clusters from public;
revoke all on table public.user_report_cluster_members from public;
revoke all on table public.user_report_routing_actions from public;
revoke all on table public.user_report_operator_findings from public;
revoke all on table public.user_report_router_learning_state from public;

revoke all on table public.user_report_intake_events from anon, authenticated;
revoke all on table public.user_report_classifications from anon, authenticated;
revoke all on table public.user_report_clusters from anon, authenticated;
revoke all on table public.user_report_cluster_members from anon, authenticated;
revoke all on table public.user_report_routing_actions from anon, authenticated;
revoke all on table public.user_report_operator_findings from anon, authenticated;
revoke all on table public.user_report_router_learning_state from anon, authenticated;

grant select, insert, update on table public.user_report_intake_events to service_role;
grant select, insert, update on table public.user_report_classifications to service_role;
grant select, insert, update on table public.user_report_clusters to service_role;
grant select, insert, update on table public.user_report_cluster_members to service_role;
grant select, insert, update on table public.user_report_routing_actions to service_role;
grant select, insert, update on table public.user_report_operator_findings to service_role;
grant select, insert, update on table public.user_report_router_learning_state to service_role;

comment on table public.user_report_intake_events is 'Sanitized authenticated user report intake; direct client writes denied. Raw text never executes.';
comment on table public.user_report_clusters is 'Support-owned platform-aware clusters with three-unique-reporter protection.';
comment on table public.user_report_routing_actions is 'Governed routing audit only; never executes money, release, enforcement, provider, auth, or role mutation.';
