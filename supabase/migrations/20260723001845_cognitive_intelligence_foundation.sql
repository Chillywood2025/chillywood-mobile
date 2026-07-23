-- Source-only Cognitive Intelligence Platform foundation.
-- This migration is intentionally undeployed. It is exercised only by local Supabase CI
-- until a separate owner-approved promotion task authorizes linked deployment.

create type public.cognitive_platform as enum ('shared', 'ios', 'android', 'web', 'unknown');

create or replace function public.cognitive_json_is_sanitized(payload jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select payload is null or (
    payload::text !~* '-----BEGIN [A-Z ]*PRIVATE KEY-----'
    and payload::text !~* '"(?:password|secret|token|authorization|cookie|service_role|private_key)"\s*:'
    and payload::text !~* '\b(?:sk_live|rk_live)_[A-Za-z0-9_-]{12,}\b'
  );
$$;

revoke all on function public.cognitive_json_is_sanitized(jsonb) from public, anon, authenticated;
grant execute on function public.cognitive_json_is_sanitized(jsonb) to service_role;

do $$
declare
  table_name text;
  cognitive_tables constant text[] := array[
    'intelligence_tasks',
    'research_sources',
    'research_claims',
    'knowledge_entities',
    'knowledge_relationships',
    'architecture_components',
    'architecture_dependencies',
    'decision_records',
    'hypotheses',
    'solution_candidates',
    'experiments',
    'experiment_results',
    'execution_plans',
    'execution_runs',
    'evaluation_results',
    'lessons',
    'playbooks',
    'model_invocations',
    'tool_invocations',
    'intelligence_budgets'
  ];
begin
  foreach table_name in array cognitive_tables loop
    execute format(
      'create table public.%I (
        id uuid primary key default gen_random_uuid(),
        dedupe_key text not null unique check (length(dedupe_key) between 8 and 256),
        platform public.cognitive_platform not null default ''shared'',
        status text not null default ''pending'' check (length(status) between 2 and 64),
        summary jsonb not null default ''{}''::jsonb check (public.cognitive_json_is_sanitized(summary)),
        evidence_metadata jsonb not null default ''{}''::jsonb check (public.cognitive_json_is_sanitized(evidence_metadata)),
        private_user_data_used boolean not null default false check (private_user_data_used = false),
        retention_until timestamptz,
        expires_at timestamptz,
        created_at timestamptz not null default statement_timestamp(),
        updated_at timestamptz not null default statement_timestamp()
      )', table_name
    );
    execute format('create index %I on public.%I (platform, status, created_at desc)', table_name || '_platform_status_idx', table_name);
    execute format('create index %I on public.%I (expires_at) where expires_at is not null', table_name || '_expiry_idx', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_platform_role(array[''owner''::text, ''operator''::text]))',
      table_name || '_owner_operator_read',
      table_name
    );
  end loop;
end
$$;

alter table public.research_sources
  add column source_reference text not null check (length(source_reference) between 4 and 2048),
  add column publisher text not null check (length(publisher) between 2 and 256),
  add column publication_date date,
  add column retrieval_date date not null,
  add column source_type text not null check (source_type in (
    'official_documentation', 'security_advisory', 'platform_policy', 'store_policy',
    'product_research', 'competitor_research', 'engineering_practice', 'news'
  )),
  add column is_primary boolean not null default false,
  add column trusted_for_tool_execution boolean not null default false check (trusted_for_tool_execution = false),
  add column citation_metadata jsonb not null default '{}'::jsonb check (public.cognitive_json_is_sanitized(citation_metadata));

alter table public.research_claims
  add column source_ids uuid[] not null default '{}'::uuid[],
  add column claim text not null check (length(claim) between 4 and 8000),
  add column confidence numeric(4,3) not null check (confidence between 0 and 1),
  add column freshness_deadline timestamptz not null,
  add column contradiction_state text not null default 'none' check (contradiction_state in ('none', 'detected', 'unresolved', 'resolved'));

alter table public.knowledge_relationships
  add column source_entity_id uuid not null references public.knowledge_entities(id),
  add column target_entity_id uuid not null references public.knowledge_entities(id),
  add column relationship_type text not null check (length(relationship_type) between 2 and 80),
  add constraint knowledge_relationship_not_self check (source_entity_id <> target_entity_id);

alter table public.architecture_dependencies
  add column source_component_id uuid not null references public.architecture_components(id),
  add column target_component_id uuid not null references public.architecture_components(id),
  add column dependency_type text not null check (length(dependency_type) between 2 and 80),
  add constraint architecture_dependency_not_self check (source_component_id <> target_component_id);

alter table public.experiments
  add column hypothesis_id uuid references public.hypotheses(id),
  add column production_activation_allowed boolean not null default false check (production_activation_allowed = false);

alter table public.execution_plans
  add column branch_name text not null check (branch_name like 'codex/%'),
  add column path_allowlist text[] not null default '{}'::text[],
  add column tool_allowlist text[] not null default '{}'::text[],
  add column max_tool_calls integer not null check (max_tool_calls between 1 and 100),
  add column max_duration_seconds integer not null check (max_duration_seconds between 1 and 14400),
  add column max_cost_usd numeric(10,2) not null check (max_cost_usd between 0 and 25),
  add column rollback_plan text not null check (length(rollback_plan) between 4 and 8000),
  add column owner_approval_id uuid,
  add column executor_approval_id uuid,
  add constraint cognitive_execution_no_self_approval check (
    owner_approval_id is null or executor_approval_id is null or owner_approval_id <> executor_approval_id
  );

alter table public.execution_runs
  add column plan_id uuid not null references public.execution_plans(id),
  add column production_deployed boolean not null default false check (production_deployed = false),
  add column money_moved boolean not null default false check (money_moved = false),
  add column user_rights_changed boolean not null default false check (user_rights_changed = false),
  add column public_release_executed boolean not null default false check (public_release_executed = false);

alter table public.evaluation_results
  add column execution_run_id uuid references public.execution_runs(id),
  add column evaluator_independent boolean not null default true check (evaluator_independent = true),
  add column evaluator_write_allowed boolean not null default false check (evaluator_write_allowed = false),
  add column completion_supported boolean not null default false,
  add column blockers text[] not null default '{}'::text[];

alter table public.model_invocations
  add column model_label text not null check (length(model_label) between 2 and 128),
  add column input_token_count integer not null default 0 check (input_token_count >= 0),
  add column output_token_count integer not null default 0 check (output_token_count >= 0),
  add column cost_usd numeric(10,4) not null default 0 check (cost_usd >= 0),
  add column prompt_policy_version text not null check (length(prompt_policy_version) between 2 and 64);

alter table public.tool_invocations
  add column tool_name text not null check (length(tool_name) between 2 and 128),
  add column capability_scope text[] not null default '{}'::text[],
  add column call_number integer not null check (call_number between 1 and 100),
  add column high_risk_executed boolean not null default false check (high_risk_executed = false);

alter table public.intelligence_budgets
  add column task_id uuid references public.intelligence_tasks(id),
  add column max_tool_calls integer not null check (max_tool_calls between 1 and 100),
  add column max_duration_seconds integer not null check (max_duration_seconds between 1 and 14400),
  add column max_cost_usd numeric(10,2) not null check (max_cost_usd between 0 and 25),
  add column spent_cost_usd numeric(10,2) not null default 0 check (spent_cost_usd >= 0 and spent_cost_usd <= max_cost_usd),
  add column consumed_tool_calls integer not null default 0 check (consumed_tool_calls >= 0 and consumed_tool_calls <= max_tool_calls);

create or replace function public.reject_cognitive_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'immutable cognitive evidence cannot be updated or deleted';
end;
$$;

revoke all on function public.reject_cognitive_evidence_mutation() from public, anon, authenticated;
grant execute on function public.reject_cognitive_evidence_mutation() to service_role;

do $$
declare
  table_name text;
  immutable_tables constant text[] := array[
    'research_sources', 'research_claims', 'experiment_results', 'execution_runs',
    'evaluation_results', 'model_invocations', 'tool_invocations'
  ];
begin
  foreach table_name in array immutable_tables loop
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.reject_cognitive_evidence_mutation()',
      table_name || '_immutable',
      table_name
    );
    execute format('revoke update, delete on table public.%I from service_role', table_name);
  end loop;
end
$$;

comment on type public.cognitive_platform is 'Undeployed Cognitive Intelligence foundation platform scope.';
comment on table public.intelligence_tasks is 'Service-owned cognitive task state; no production cognitive scheduler is enabled.';
comment on table public.research_sources is 'Immutable normalized source provenance. Web content is never trusted for tool execution.';
comment on table public.execution_plans is 'Bounded source-only plans; production deployment, money, rights, and self-approval remain forbidden by the application contract.';
