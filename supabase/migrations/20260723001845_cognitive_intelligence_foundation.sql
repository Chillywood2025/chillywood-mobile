-- Undeployed Cognitive Intelligence security-hardened scaffold.
-- LOCAL/DISPOSABLE DATABASES ONLY. No production scheduler, function, model,
-- provider credential, or execution authority is created by this migration.

create type public.cognitive_platform as enum ('shared', 'ios', 'android', 'web', 'unknown');
create type public.cognitive_environment as enum ('local', 'ci', 'preview');
create type public.cognitive_task_status as enum (
  'received', 'planning', 'awaiting_approval', 'approved', 'executing',
  'evaluating', 'completed', 'failed', 'cancelled', 'budget_exhausted',
  'rollback_pending', 'rollback_running', 'rollback_succeeded', 'rollback_failed',
  'quarantined', 'escalation_required'
);
create type public.cognitive_capability_status as enum ('active', 'revoked', 'exhausted', 'expired');
create type public.cognitive_evaluation_status as enum ('pass', 'fail', 'incomplete', 'blocked');
create type public.cognitive_data_class as enum (
  'non_personal_audit', 'operational_metadata', 'research_cache',
  'user_derived', 'security_evidence', 'legal_hold'
);

create or replace function public.cognitive_json_is_sanitized(payload jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select payload is null or (
    pg_column_size(payload) <= 65536
    and payload::text !~* '-----BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE)-----'
    and payload::text !~* '"(__proto__|constructor|prototype)"\s*:'
    and payload::text !~* '"(password|secret|token|authorization|cookie|service[_-]?role|private[_-]?key)"\s*:'
    and payload::text !~* '\b(sk|rk)_(live|test)_[A-Za-z0-9_-]{12,}\b'
    and payload::text !~* '\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b'
  );
$$;
revoke all on function public.cognitive_json_is_sanitized(jsonb) from public, anon, authenticated;
grant execute on function public.cognitive_json_is_sanitized(jsonb) to service_role;

create table public.cognitive_projects (
  id uuid primary key default gen_random_uuid(),
  repository_full_name text not null check (repository_full_name = 'Chillywood2025/chillywood-mobile'),
  source_state text not null default 'security_hardened_scaffold_not_deployed'
    check (source_state in ('security_hardening_in_progress', 'security_hardened_scaffold_not_deployed')),
  activation_state text not null default 'off' check (activation_state = 'off'),
  scheduler_state text not null default 'none' check (scheduler_state = 'none'),
  production_authority boolean not null default false check (production_authority = false),
  created_at timestamptz not null default statement_timestamp()
);

create table public.intelligence_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cognitive_projects(id),
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  repository_full_name text not null check (repository_full_name = 'Chillywood2025/chillywood-mobile'),
  branch_name text not null check (
    branch_name ~ '^codex/[a-z0-9][a-z0-9/_-]{2,120}$'
    and branch_name !~* '(^|/)(main|master|release)(/|$)'
  ),
  task_key text not null check (length(task_key) between 8 and 256),
  objective_hash text not null check (objective_hash ~ '^[a-f0-9]{64}$'),
  status public.cognitive_task_status not null default 'received',
  actor_identity text not null check (length(actor_identity) between 3 and 128),
  cancelled_at timestamptz,
  quarantined_at timestamptz,
  deadman_at timestamptz not null,
  retention_until timestamptz,
  data_class public.cognitive_data_class not null default 'operational_metadata',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (project_id, platform, environment, task_key),
  unique (id, project_id, platform, environment)
);

do $$
declare
  table_name text;
  child_tables constant text[] := array[
    'research_sources', 'research_claims', 'knowledge_entities', 'knowledge_relationships',
    'architecture_components', 'architecture_dependencies', 'decision_records',
    'hypotheses', 'solution_candidates', 'experiments', 'experiment_results',
    'execution_plans', 'execution_runs', 'evaluation_results', 'lessons', 'playbooks',
    'model_invocations', 'tool_invocations', 'intelligence_budgets'
  ];
begin
  foreach table_name in array child_tables loop
    execute format(
      'create table public.%I (
        id uuid primary key default gen_random_uuid(),
        task_id uuid not null,
        project_id uuid not null,
        platform public.cognitive_platform not null,
        environment public.cognitive_environment not null,
        actor_identity text not null check (length(actor_identity) between 3 and 128),
        dedupe_key text not null check (length(dedupe_key) between 8 and 256),
        status text not null default ''received'' check (length(status) between 2 and 64),
        summary jsonb not null default ''{}''::jsonb check (public.cognitive_json_is_sanitized(summary)),
        evidence_metadata jsonb not null default ''{}''::jsonb check (public.cognitive_json_is_sanitized(evidence_metadata)),
        data_class public.cognitive_data_class not null default ''operational_metadata'',
        retention_until timestamptz,
        legal_hold boolean not null default false,
        erased_at timestamptz,
        created_at timestamptz not null default statement_timestamp(),
        unique (task_id, dedupe_key),
        unique (id, task_id, project_id, platform, environment),
        foreign key (task_id, project_id, platform, environment)
          references public.intelligence_tasks(id, project_id, platform, environment)
      )', table_name
    );
    execute format(
      'create index %I on public.%I (task_id, project_id, platform, status, created_at desc)',
      table_name || '_scope_status_idx', table_name
    );
    execute format(
      'create index %I on public.%I (retention_until) where retention_until is not null and legal_hold = false',
      table_name || '_retention_idx', table_name
    );
  end loop;
end
$$;

alter table public.research_sources
  add column source_reference_hash text not null check (source_reference_hash ~ '^[a-f0-9]{64}$'),
  add column canonical_url_hash text not null check (canonical_url_hash ~ '^[a-f0-9]{64}$'),
  add column content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  add column publisher text not null check (length(publisher) between 2 and 256),
  add column publication_date timestamptz,
  add column retrieval_date timestamptz not null,
  add column freshness_deadline timestamptz not null,
  add column source_type text not null check (source_type in (
    'official_documentation', 'security_advisory', 'platform_policy', 'store_policy',
    'product_research', 'competitor_research', 'engineering_practice', 'news'
  )),
  add column is_primary boolean not null default false,
  add column bounded_excerpt text not null check (length(bounded_excerpt) between 1 and 2000),
  add column citation_metadata jsonb not null default '{}'::jsonb check (
    pg_column_size(citation_metadata) <= 8192 and public.cognitive_json_is_sanitized(citation_metadata)
  ),
  add column trusted_for_tool_execution boolean not null default false check (trusted_for_tool_execution = false),
  add constraint research_source_date_order check (
    publication_date is null or publication_date <= retrieval_date
  );

alter table public.research_claims
  add column claim_hash text not null check (claim_hash ~ '^[a-f0-9]{64}$'),
  add column bounded_claim text not null check (length(bounded_claim) between 4 and 8000),
  add column confidence numeric(4,3) not null check (confidence between 0 and 1),
  add column category text not null check (category in ('technical', 'platform_policy', 'consequential_news', 'product', 'security')),
  add column freshness_deadline timestamptz not null,
  add column contradiction_state text not null default 'none'
    check (contradiction_state in ('none', 'detected', 'unresolved', 'resolved')),
  add column support_state text not null default 'pending'
    check (support_state in ('pending', 'supported', 'blocked', 'stale', 'contradicted'));

create table public.research_claim_sources (
  claim_id uuid not null,
  source_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  relationship text not null check (relationship in ('supports', 'contradicts', 'context')),
  created_at timestamptz not null default statement_timestamp(),
  primary key (claim_id, source_id),
  foreign key (claim_id, task_id, project_id, platform, environment)
    references public.research_claims(id, task_id, project_id, platform, environment),
  foreign key (source_id, task_id, project_id, platform, environment)
    references public.research_sources(id, task_id, project_id, platform, environment)
);
create index research_claim_sources_scope_idx
  on public.research_claim_sources(task_id, project_id, platform, relationship);

create table public.research_contradictions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null,
  source_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  resolution_state text not null default 'open' check (resolution_state in ('open', 'resolved')),
  created_at timestamptz not null default statement_timestamp(),
  foreign key (claim_id, task_id, project_id, platform, environment)
    references public.research_claims(id, task_id, project_id, platform, environment),
  foreign key (source_id, task_id, project_id, platform, environment)
    references public.research_sources(id, task_id, project_id, platform, environment)
);

create table public.research_retrieval_events (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  request_url_hash text not null check (request_url_hash ~ '^[a-f0-9]{64}$'),
  resolved_address_hashes text[] not null check (cardinality(resolved_address_hashes) between 1 and 16),
  response_hash text check (response_hash is null or response_hash ~ '^[a-f0-9]{64}$'),
  result text not null check (result in ('accepted', 'blocked', 'failed')),
  created_at timestamptz not null default statement_timestamp(),
  foreign key (source_id, task_id, project_id, platform, environment)
    references public.research_sources(id, task_id, project_id, platform, environment)
);

alter table public.knowledge_relationships
  add column source_entity_id uuid not null,
  add column target_entity_id uuid not null,
  add column relationship_type text not null check (length(relationship_type) between 2 and 80),
  add constraint knowledge_relationship_not_self check (source_entity_id <> target_entity_id),
  add foreign key (source_entity_id, task_id, project_id, platform, environment)
    references public.knowledge_entities(id, task_id, project_id, platform, environment),
  add foreign key (target_entity_id, task_id, project_id, platform, environment)
    references public.knowledge_entities(id, task_id, project_id, platform, environment);

alter table public.architecture_components
  add column repository_full_name text not null check (repository_full_name = 'Chillywood2025/chillywood-mobile'),
  add column source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  add column generator_version text not null check (length(generator_version) between 1 and 64),
  add column generator_config_hash text not null check (generator_config_hash ~ '^[a-f0-9]{64}$'),
  add column file_content_hash text not null check (file_content_hash ~ '^[a-f0-9]{64}$'),
  add column graph_digest text not null check (graph_digest ~ '^[a-f0-9]{64}$');

alter table public.architecture_dependencies
  add column source_component_id uuid not null,
  add column target_component_id uuid not null,
  add column dependency_type text not null check (length(dependency_type) between 2 and 80),
  add constraint architecture_dependency_not_self check (source_component_id <> target_component_id),
  add foreign key (source_component_id, task_id, project_id, platform, environment)
    references public.architecture_components(id, task_id, project_id, platform, environment),
  add foreign key (target_component_id, task_id, project_id, platform, environment)
    references public.architecture_components(id, task_id, project_id, platform, environment);

alter table public.experiments
  add column hypothesis_id uuid,
  add column production_activation_allowed boolean not null default false check (production_activation_allowed = false),
  add foreign key (hypothesis_id, task_id, project_id, platform, environment)
    references public.hypotheses(id, task_id, project_id, platform, environment);

alter table public.execution_plans
  add column plan_version integer not null default 1 check (plan_version between 1 and 1000),
  add column branch_name text not null check (
    branch_name ~ '^codex/[a-z0-9][a-z0-9/_-]{2,120}$'
    and branch_name !~* '(^|/)(main|master|release)(/|$)'
  ),
  add column requested_actions text[] not null check (
    cardinality(requested_actions) between 1 and 32
    and requested_actions <@ array[
      'repository_read_file','repository_list_files','repository_search',
      'repository_apply_patch','repository_write_new_file','test_run_allowlisted',
      'git_create_scoped_branch','git_stage_allowlisted_paths','git_commit_scoped',
      'git_push_scoped_draft_branch','github_open_draft_pr','github_update_draft_pr_body'
    ]::text[]
  ),
  add column path_allowlist text[] not null check (cardinality(path_allowlist) between 1 and 128),
  add column required_test_ids text[] not null check (cardinality(required_test_ids) between 1 and 128),
  add column rollback_plan_hash text not null check (rollback_plan_hash ~ '^[a-f0-9]{64}$'),
  add column source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  add column graph_digest text not null check (graph_digest ~ '^[a-f0-9]{64}$');

create table public.execution_plan_snapshots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  canonical_snapshot jsonb not null check (
    pg_column_size(canonical_snapshot) <= 65536 and public.cognitive_json_is_sanitized(canonical_snapshot)
  ),
  approval_scope_hash text not null check (approval_scope_hash ~ '^[a-f0-9]{64}$'),
  approval_request_id uuid not null references public.autonomous_approval_requests(id),
  created_at timestamptz not null default statement_timestamp(),
  unique (id, task_id, project_id, platform, environment),
  unique (task_id, snapshot_hash),
  foreign key (plan_id, task_id, project_id, platform, environment)
    references public.execution_plans(id, task_id, project_id, platform, environment)
);

alter table public.execution_runs
  add column snapshot_id uuid not null,
  add column snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  add column final_commit text check (final_commit is null or final_commit ~ '^[a-f0-9]{40}$'),
  add column evidence_manifest_hash text check (evidence_manifest_hash is null or evidence_manifest_hash ~ '^[a-f0-9]{64}$'),
  add column production_deployed boolean not null default false check (production_deployed = false),
  add column money_moved boolean not null default false check (money_moved = false),
  add column user_rights_changed boolean not null default false check (user_rights_changed = false),
  add column public_release_executed boolean not null default false check (public_release_executed = false),
  add foreign key (snapshot_id, task_id, project_id, platform, environment)
    references public.execution_plan_snapshots(id, task_id, project_id, platform, environment);

create table public.execution_evidence_records (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  evidence_type text not null check (evidence_type in (
    'test_exit', 'stdout_hash', 'stderr_hash', 'diff_hash', 'commit_hash',
    'ci_run', 'physical_device', 'rollback'
  )),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  trusted_producer text not null check (length(trusted_producer) between 3 and 128),
  final_commit text not null check (final_commit ~ '^[a-f0-9]{40}$'),
  created_at timestamptz not null default statement_timestamp(),
  foreign key (run_id, task_id, project_id, platform, environment)
    references public.execution_runs(id, task_id, project_id, platform, environment)
);

alter table public.evaluation_results
  add column execution_run_id uuid not null,
  add column snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  add column evaluator_identity text not null check (length(evaluator_identity) between 3 and 128),
  add column executor_identity text not null check (length(executor_identity) between 3 and 128),
  add column evaluation_status public.cognitive_evaluation_status not null,
  add column completion_supported boolean not null default false,
  add column owner_approval_granted boolean not null default false check (owner_approval_granted = false),
  add column evaluator_write_allowed boolean not null default false check (evaluator_write_allowed = false),
  add constraint evaluator_identity_separate check (evaluator_identity <> executor_identity),
  add foreign key (execution_run_id, task_id, project_id, platform, environment)
    references public.execution_runs(id, task_id, project_id, platform, environment);

alter table public.model_invocations
  add column model_provider text not null check (model_provider in ('mock')),
  add column model_label text not null check (length(model_label) between 2 and 128),
  add column model_version text not null check (length(model_version) between 1 and 128),
  add column model_role text not null check (model_role in ('planner', 'researcher', 'evaluator')),
  add column input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  add column output_hash text not null check (output_hash ~ '^[a-f0-9]{64}$'),
  add column evidence_reference_hashes text[] not null check (cardinality(evidence_reference_hashes) between 1 and 128),
  add column safety_classification text not null check (safety_classification in ('accepted', 'rejected', 'blocked')),
  add column input_token_count integer not null check (input_token_count between 0 and 10000000),
  add column output_token_count integer not null check (output_token_count between 0 and 10000000),
  add column cost numeric(12,4) not null check (cost between 0 and 25),
  add column latency_ms integer not null check (latency_ms between 0 and 14400000);

alter table public.tool_invocations
  add column capability_id uuid not null,
  add column call_id text not null check (length(call_id) between 3 and 128),
  add column operation text not null check (operation in (
    'repository_read_file', 'repository_list_files', 'repository_search',
    'repository_apply_patch', 'repository_write_new_file', 'test_run_allowlisted',
    'git_create_scoped_branch', 'git_stage_allowlisted_paths', 'git_commit_scoped',
    'git_push_scoped_draft_branch', 'github_open_draft_pr', 'github_update_draft_pr_body'
  )),
  add column result_envelope_hash text not null check (result_envelope_hash ~ '^[a-f0-9]{64}$'),
  add column result_untrusted boolean not null default true check (result_untrusted = true),
  add column result_sanitized boolean not null,
  add column result_truncated boolean not null,
  add column output_bytes bigint not null check (output_bytes between 0 and 10000000);

create table public.cognitive_capabilities (
  id uuid primary key default gen_random_uuid(),
  capability_id text not null unique check (length(capability_id) between 8 and 128),
  bearer_hash text not null unique check (bearer_hash ~ '^[a-f0-9]{64}$'),
  nonce_hash text not null unique check (nonce_hash ~ '^[a-f0-9]{64}$'),
  task_id uuid not null,
  project_id uuid not null,
  repository_full_name text not null check (repository_full_name = 'Chillywood2025/chillywood-mobile'),
  branch_name text not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  risk_level text not null check (risk_level in ('low','medium','high')),
  provider text not null check (provider in ('repository', 'github', 'supabase_local', 'research_mock', 'model_mock', 'none')),
  operation text not null check (operation in (
    'repository_read_file', 'repository_list_files', 'repository_search',
    'repository_apply_patch', 'repository_write_new_file', 'test_run_allowlisted',
    'git_create_scoped_branch', 'git_stage_allowlisted_paths', 'git_commit_scoped',
    'git_push_scoped_draft_branch', 'github_open_draft_pr', 'github_update_draft_pr_body'
  )),
  path_scopes text[] not null check (cardinality(path_scopes) between 1 and 128),
  issued_at timestamptz not null,
  not_before timestamptz not null,
  expires_at timestamptz not null,
  maximum_calls integer not null check (maximum_calls between 1 and 100),
  remaining_calls integer not null check (remaining_calls between 0 and maximum_calls),
  maximum_bytes bigint not null check (maximum_bytes between 1 and 10000000),
  remaining_bytes bigint not null check (remaining_bytes between 0 and maximum_bytes),
  maximum_cost numeric(12,4) not null check (maximum_cost between 0 and 25),
  remaining_cost numeric(12,4) not null check (remaining_cost between 0 and maximum_cost),
  approval_request_id uuid not null references public.autonomous_approval_requests(id),
  approval_scope_hash text not null check (approval_scope_hash ~ '^[a-f0-9]{64}$'),
  plan_snapshot_id uuid not null,
  plan_snapshot_hash text not null check (plan_snapshot_hash ~ '^[a-f0-9]{64}$'),
  status public.cognitive_capability_status not null default 'active',
  revoked_at timestamptz,
  consumed_at timestamptz,
  next_usage_sequence integer not null default 1 check (next_usage_sequence >= 1),
  created_at timestamptz not null default statement_timestamp(),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment),
  foreign key (plan_snapshot_id, task_id, project_id, platform, environment)
    references public.execution_plan_snapshots(id, task_id, project_id, platform, environment),
  check (not_before >= issued_at and expires_at > not_before)
);
create index cognitive_capabilities_active_scope_idx
  on public.cognitive_capabilities(task_id, project_id, repository_full_name, branch_name, platform, environment, status, expires_at);

alter table public.tool_invocations
  add foreign key (capability_id, task_id, project_id, platform, environment)
    references public.cognitive_capabilities(id, task_id, project_id, platform, environment),
  add constraint tool_invocation_call_unique unique (capability_id, call_id);

create table public.cognitive_capability_events (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null references public.cognitive_capabilities(id),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  call_id text not null check (length(call_id) between 3 and 128),
  usage_sequence integer not null check (usage_sequence >= 1),
  event_type text not null check (event_type in ('issued', 'consumed', 'rejected', 'revoked', 'expired')),
  reason text check (reason is null or length(reason) between 2 and 512),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default statement_timestamp(),
  unique (capability_id, call_id),
  unique (capability_id, usage_sequence)
);

alter table public.intelligence_budgets
  add column immutable_ceiling_hash text not null check (immutable_ceiling_hash ~ '^[a-f0-9]{64}$'),
  add column max_model_tokens bigint not null check (max_model_tokens between 0 and 10000000),
  add column used_model_tokens bigint not null default 0 check (used_model_tokens between 0 and max_model_tokens),
  add column max_model_cost numeric(12,4) not null check (max_model_cost between 0 and 25),
  add column used_model_cost numeric(12,4) not null default 0 check (used_model_cost between 0 and max_model_cost),
  add column max_tool_calls integer not null check (max_tool_calls between 0 and 100),
  add column used_tool_calls integer not null default 0 check (used_tool_calls between 0 and max_tool_calls),
  add column max_tool_bytes bigint not null check (max_tool_bytes between 0 and 10000000),
  add column used_tool_bytes bigint not null default 0 check (used_tool_bytes between 0 and max_tool_bytes),
  add column max_child_tasks integer not null check (max_child_tasks between 0 and 20),
  add column used_child_tasks integer not null default 0 check (used_child_tasks between 0 and max_child_tasks),
  add column max_recursion_depth integer not null check (max_recursion_depth between 0 and 4),
  add column max_retries integer not null check (max_retries between 0 and 5),
  add column deadline_at timestamptz not null;

create table public.cognitive_budget_events (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  reservation_id text not null check (length(reservation_id) between 3 and 128),
  event_type text not null check (event_type in ('reserved', 'settled', 'rejected', 'released')),
  usage jsonb not null check (
    pg_column_size(usage) <= 8192 and public.cognitive_json_is_sanitized(usage)
  ),
  created_at timestamptz not null default statement_timestamp(),
  unique (budget_id, reservation_id, event_type),
  foreign key (budget_id, task_id, project_id, platform, environment)
    references public.intelligence_budgets(id, task_id, project_id, platform, environment)
);

create table public.cognitive_resource_leases (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  resource_type text not null check (resource_type in (
    'repository', 'branch', 'path', 'migration_namespace', 'edge_function',
    'database_object', 'provider', 'release_channel', 'platform', 'feature_flag'
  )),
  resource_key text not null check (length(resource_key) between 3 and 512),
  mode text not null check (mode in ('read', 'write')),
  issued_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > issued_at),
  heartbeat_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment)
);
create unique index cognitive_resource_lease_write_active_idx
  on public.cognitive_resource_leases(resource_type, resource_key)
  where mode = 'write' and revoked_at is null;

create table public.cognitive_state_transition_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  entity_type text not null check (entity_type in (
    'task', 'research_claim', 'hypothesis', 'solution_candidate', 'experiment',
    'execution_plan', 'execution_run', 'capability', 'evaluation', 'lesson', 'playbook'
  )),
  entity_id uuid not null,
  prior_status text,
  next_status text not null,
  actor_identity text not null check (length(actor_identity) between 3 and 128),
  transition_hash text not null check (transition_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default statement_timestamp(),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment)
);
create index cognitive_state_transition_scope_idx
  on public.cognitive_state_transition_events(task_id, entity_type, entity_id, created_at);

create table public.cognitive_current_findings (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  finding_key text not null check (length(finding_key) between 8 and 256),
  finding_type text not null check (length(finding_type) between 3 and 128),
  target_scope text not null check (length(target_scope) between 3 and 256),
  severity text not null check (severity in ('p0', 'p1', 'p2', 'p3', 'info')),
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  current_status text not null default 'open' check (current_status in ('open', 'resolved')),
  resolved_at timestamptz,
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default statement_timestamp(),
  unique (task_id, finding_key),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment)
);

create table public.finding_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.cognitive_current_findings(id),
  task_id uuid not null,
  event_type text not null check (event_type in ('detected', 'recurred', 'resolved')),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default statement_timestamp()
);

create table public.cognitive_erasure_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  target_table text not null check (length(target_table) between 3 and 128),
  target_id uuid not null,
  prior_data_class public.cognitive_data_class not null,
  tombstone_hash text not null check (tombstone_hash ~ '^[a-f0-9]{64}$'),
  legal_hold boolean not null,
  erased_at timestamptz not null,
  actor_identity text not null check (length(actor_identity) between 3 and 128),
  created_at timestamptz not null default statement_timestamp(),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment)
);

alter table public.lessons
  add column learning_type text not null check (learning_type in (
    'source_reliability_score', 'tool_success_score', 'expected_duration_seconds',
    'test_priority_weight', 'rollback_strategy_rank', 'model_routing_preference',
    'retry_timing_seconds'
  )),
  add column numeric_value numeric(12,4) not null check (numeric_value between 0 and 14400),
  add column evaluation_result_id uuid not null,
  add column outcome_evidence_hash text not null check (outcome_evidence_hash ~ '^[a-f0-9]{64}$'),
  add foreign key (evaluation_result_id, task_id, project_id, platform, environment)
    references public.evaluation_results(id, task_id, project_id, platform, environment);

alter table public.research_claims
  add constraint research_claim_status_machine check (status in ('pending', 'supported', 'blocked', 'stale', 'contradicted'));
alter table public.hypotheses
  add constraint hypothesis_status_machine check (status in ('received', 'planned', 'approved', 'denied', 'cancelled'));
alter table public.solution_candidates
  add constraint solution_candidate_status_machine check (status in ('received', 'planned', 'approved', 'denied', 'cancelled'));
alter table public.experiments
  add constraint experiment_status_machine check (status in ('received', 'planned', 'approved', 'running', 'evaluating', 'completed', 'failed', 'cancelled'));
alter table public.execution_plans
  add constraint execution_plan_status_machine check (status in ('draft', 'awaiting_approval', 'approved', 'denied', 'cancelled', 'invalidated'));
alter table public.execution_runs
  add constraint execution_run_status_machine check (status in (
    'received', 'executing', 'evaluating', 'completed', 'failed', 'cancelled',
    'budget_exhausted', 'rollback_pending', 'rollback_running',
    'rollback_succeeded', 'rollback_failed', 'quarantined', 'escalation_required'
  ));
alter table public.evaluation_results
  add constraint evaluation_result_status_machine check (status in ('pass', 'fail', 'incomplete', 'blocked'));
alter table public.lessons
  add constraint lesson_status_machine check (status in ('proposed', 'accepted', 'rejected', 'quarantined'));
alter table public.playbooks
  add constraint playbook_status_machine check (status in ('draft', 'reviewed', 'approved', 'quarantined'));

create or replace function public.enforce_cognitive_initial_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare expected_status text;
begin
  expected_status := case tg_table_name
    when 'intelligence_tasks' then 'received'
    when 'research_claims' then 'pending'
    when 'hypotheses' then 'received'
    when 'solution_candidates' then 'received'
    when 'experiments' then 'received'
    when 'execution_plans' then 'draft'
    when 'execution_runs' then 'received'
    when 'lessons' then 'proposed'
    when 'playbooks' then 'draft'
    else null
  end;
  if expected_status is not null and new.status::text <> expected_status then
    raise exception 'cognitive_initial_state_rejected' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_cognitive_initial_status() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'intelligence_tasks','research_claims','hypotheses','solution_candidates',
    'experiments','execution_plans','execution_runs','lessons','playbooks'
  ] loop
    execute format(
      'create trigger %I before insert on public.%I
       for each row execute function public.enforce_cognitive_initial_status()',
      table_name || '_initial_state', table_name
    );
  end loop;
end
$$;

-- Immutable evidence is append-only. Raw user-derived content is not placed in
-- immutable tables; redacted tombstone metadata is preserved instead.
create or replace function public.reject_cognitive_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'immutable_cognitive_evidence' using errcode = '42501';
end;
$$;
revoke all on function public.reject_cognitive_evidence_mutation() from public, anon, authenticated;
grant execute on function public.reject_cognitive_evidence_mutation() to service_role;

do $$
declare
  table_name text;
  immutable_tables constant text[] := array[
    'research_sources', 'research_claim_sources', 'research_contradictions',
    'research_retrieval_events', 'execution_plan_snapshots',
    'execution_evidence_records', 'evaluation_results', 'model_invocations',
    'tool_invocations', 'cognitive_capability_events', 'cognitive_budget_events',
    'cognitive_state_transition_events', 'finding_lifecycle_events',
    'cognitive_erasure_events'
  ];
begin
  foreach table_name in array immutable_tables loop
    execute format(
      'create trigger %I before update or delete on public.%I
       for each row execute function public.reject_cognitive_evidence_mutation()',
      table_name || '_immutable', table_name
    );
  end loop;
end
$$;

create or replace function public.cognitive_transition_task(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_expected public.cognitive_task_status,
  p_next public.cognitive_task_status,
  p_actor_identity text,
  p_transition_hash text
)
returns public.cognitive_task_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.cognitive_task_status;
  allowed boolean;
begin
  select status into current_status
  from public.intelligence_tasks
  where id = p_task_id and project_id = p_project_id and platform = p_platform and environment = p_environment
  for update;
  if current_status is null or current_status <> p_expected then
    raise exception 'task_scope_or_expected_state_mismatch' using errcode = 'P0001';
  end if;
  allowed := case current_status
    when 'received' then p_next in ('planning', 'cancelled', 'quarantined')
    when 'planning' then p_next in ('awaiting_approval', 'failed', 'cancelled', 'budget_exhausted', 'quarantined')
    when 'awaiting_approval' then p_next in ('approved', 'failed', 'cancelled', 'quarantined')
    when 'approved' then p_next in ('executing', 'cancelled', 'quarantined')
    when 'executing' then p_next in ('evaluating', 'failed', 'cancelled', 'budget_exhausted', 'rollback_pending', 'quarantined')
    when 'evaluating' then p_next in ('completed', 'failed', 'rollback_pending', 'quarantined')
    when 'rollback_pending' then p_next in ('rollback_running', 'quarantined')
    when 'rollback_running' then p_next in ('rollback_succeeded', 'rollback_failed', 'quarantined')
    when 'rollback_failed' then p_next in ('quarantined', 'escalation_required')
    else false
  end;
  if not allowed then raise exception 'invalid_cognitive_task_transition' using errcode = 'P0001'; end if;
  update public.intelligence_tasks
    set status = p_next,
        updated_at = statement_timestamp(),
        cancelled_at = case when p_next = 'cancelled' then statement_timestamp() else cancelled_at end,
        quarantined_at = case when p_next = 'quarantined' then statement_timestamp() else quarantined_at end
  where id = p_task_id;
  insert into public.cognitive_state_transition_events(
    task_id, project_id, platform, environment, entity_type, entity_id,
    prior_status, next_status, actor_identity, transition_hash
  ) values (
    p_task_id, p_project_id, p_platform, p_environment, 'task', p_task_id,
    current_status::text, p_next::text, p_actor_identity, p_transition_hash
  );
  return p_next;
end;
$$;
revoke all on function public.cognitive_transition_task(uuid, uuid, public.cognitive_platform, public.cognitive_environment, public.cognitive_task_status, public.cognitive_task_status, text, text)
  from public, anon, authenticated;
grant execute on function public.cognitive_transition_task(uuid, uuid, public.cognitive_platform, public.cognitive_environment, public.cognitive_task_status, public.cognitive_task_status, text, text)
  to service_role;

create or replace function public.cognitive_transition_entity(
  p_entity_type text,
  p_entity_id uuid,
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_expected text,
  p_next text,
  p_actor_identity text,
  p_transition_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean := false;
  changed integer := 0;
begin
  allowed := case p_entity_type
    when 'research_claim' then
      (p_expected = 'pending' and p_next in ('supported','blocked','stale','contradicted'))
      or (p_expected = 'supported' and p_next in ('stale','contradicted'))
      or (p_expected = 'contradicted' and p_next = 'blocked')
    when 'hypothesis' then
      (p_expected = 'received' and p_next = 'planned')
      or (p_expected = 'planned' and p_next in ('approved','denied','cancelled'))
    when 'solution_candidate' then
      (p_expected = 'received' and p_next = 'planned')
      or (p_expected = 'planned' and p_next in ('approved','denied','cancelled'))
    when 'experiment' then
      (p_expected = 'received' and p_next = 'planned')
      or (p_expected = 'planned' and p_next in ('approved','denied','cancelled'))
      or (p_expected = 'approved' and p_next = 'running')
      or (p_expected = 'running' and p_next in ('evaluating','failed','cancelled'))
      or (p_expected = 'evaluating' and p_next in ('completed','failed'))
    when 'execution_plan' then
      (p_expected = 'draft' and p_next = 'awaiting_approval')
      or (p_expected = 'awaiting_approval' and p_next in ('approved','denied','cancelled'))
      or (p_expected = 'approved' and p_next in ('invalidated','cancelled'))
    when 'execution_run' then
      (p_expected = 'received' and p_next in ('executing','cancelled','quarantined'))
      or (p_expected = 'executing' and p_next in ('evaluating','failed','cancelled','budget_exhausted','rollback_pending','quarantined'))
      or (p_expected = 'evaluating' and p_next in ('completed','failed','rollback_pending','quarantined'))
      or (p_expected = 'rollback_pending' and p_next in ('rollback_running','quarantined'))
      or (p_expected = 'rollback_running' and p_next in ('rollback_succeeded','rollback_failed','quarantined'))
      or (p_expected = 'rollback_failed' and p_next in ('quarantined','escalation_required'))
    when 'lesson' then
      (p_expected = 'proposed' and p_next in ('accepted','rejected','quarantined'))
    when 'playbook' then
      (p_expected = 'draft' and p_next in ('reviewed','quarantined'))
      or (p_expected = 'reviewed' and p_next in ('approved','quarantined'))
    else false
  end;
  if not allowed then raise exception 'invalid_cognitive_entity_transition' using errcode = 'P0001'; end if;
  if p_entity_type = 'research_claim' and p_next = 'supported' and not exists (
    select 1
    from public.research_claims claim
    where claim.id=p_entity_id and claim.task_id=p_task_id and claim.project_id=p_project_id
      and claim.platform=p_platform and claim.environment=p_environment
      and claim.freshness_deadline > statement_timestamp()
      and claim.contradiction_state not in ('detected','unresolved')
      and (
        (
          claim.category in ('technical','platform_policy','security')
          and exists (
            select 1
            from public.research_claim_sources relation
            join public.research_sources source on
              source.id=relation.source_id and source.task_id=relation.task_id
              and source.project_id=relation.project_id and source.platform=relation.platform
              and source.environment=relation.environment
            where relation.claim_id=claim.id and relation.relationship='supports'
              and source.is_primary=true and source.freshness_deadline > statement_timestamp()
          )
        )
        or (
          claim.category='consequential_news'
          and (
            select count(distinct lower(source.publisher))
            from public.research_claim_sources relation
            join public.research_sources source on
              source.id=relation.source_id and source.task_id=relation.task_id
              and source.project_id=relation.project_id and source.platform=relation.platform
              and source.environment=relation.environment
            where relation.claim_id=claim.id and relation.relationship='supports'
              and source.source_type='news' and source.freshness_deadline > statement_timestamp()
          ) >= 2
        )
        or claim.category='product'
      )
      and not exists (
        select 1 from public.research_contradictions contradiction
        where contradiction.claim_id=claim.id and contradiction.resolution_state='open'
      )
  ) then
    raise exception 'research_claim_support_requirements_not_met' using errcode = 'P0001';
  end if;

  if p_entity_type = 'research_claim' then
    update public.research_claims set
      status=p_next,
      support_state=case
        when p_next='supported' then 'supported'
        when p_next='stale' then 'stale'
        when p_next='contradicted' then 'contradicted'
        else 'blocked'
      end
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  elsif p_entity_type = 'hypothesis' then
    update public.hypotheses set status=p_next
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  elsif p_entity_type = 'solution_candidate' then
    update public.solution_candidates set status=p_next
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  elsif p_entity_type = 'experiment' then
    update public.experiments set status=p_next
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  elsif p_entity_type = 'execution_plan' then
    update public.execution_plans set status=p_next
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  elsif p_entity_type = 'execution_run' then
    update public.execution_runs set status=p_next
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  elsif p_entity_type = 'lesson' then
    update public.lessons set status=p_next
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  elsif p_entity_type = 'playbook' then
    update public.playbooks set status=p_next
      where id=p_entity_id and task_id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment and status=p_expected;
  end if;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'entity_scope_or_expected_state_mismatch' using errcode = 'P0001'; end if;
  insert into public.cognitive_state_transition_events(
    task_id, project_id, platform, environment, entity_type, entity_id,
    prior_status, next_status, actor_identity, transition_hash
  ) values (
    p_task_id, p_project_id, p_platform, p_environment, p_entity_type, p_entity_id,
    p_expected, p_next, p_actor_identity, p_transition_hash
  );
  return p_next;
end;
$$;
revoke all on function public.cognitive_transition_entity(text, uuid, uuid, uuid, public.cognitive_platform, public.cognitive_environment, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cognitive_transition_entity(text, uuid, uuid, uuid, public.cognitive_platform, public.cognitive_environment, text, text, text, text)
  to service_role;

create or replace function public.cognitive_consume_capability(
  p_capability_id text,
  p_call_id text,
  p_task_id uuid,
  p_project_id uuid,
  p_repository_full_name text,
  p_branch_name text,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_provider text,
  p_operation text,
  p_path text,
  p_bytes bigint,
  p_cost numeric,
  p_approval_scope_hash text,
  p_plan_snapshot_hash text,
  p_request_hash text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_value public.cognitive_capabilities%rowtype;
  sequence_value integer;
  task_cancelled timestamptz;
  task_quarantined timestamptz;
  approval_status text;
  approval_expires timestamptz;
  approval_platform text;
  approval_scope_hash text;
  emergency_status text;
begin
  select * into row_value from public.cognitive_capabilities
  where capability_id = p_capability_id for update;
  if row_value.id is null then raise exception 'capability_missing' using errcode = 'P0001'; end if;
  select cancelled_at, quarantined_at into task_cancelled, task_quarantined
  from public.intelligence_tasks
  where id = p_task_id and project_id = p_project_id and platform = p_platform and environment = p_environment;
  select status, expires_at, platform, metadata->>'approval_scope_hash'
    into approval_status, approval_expires, approval_platform, approval_scope_hash
  from public.autonomous_approval_requests
  where id = row_value.approval_request_id;
  select status into emergency_status
  from public.autonomous_system_emergency_states
  where system_id = 'product_intelligence_operator';
  if row_value.status <> 'active' or statement_timestamp() < row_value.not_before
     or statement_timestamp() >= row_value.expires_at or row_value.revoked_at is not null
     or task_cancelled is not null or task_quarantined is not null
     or approval_status <> 'approved' or approval_expires <= statement_timestamp()
     or approval_platform <> p_platform::text or approval_scope_hash <> p_approval_scope_hash
     or coalesce(emergency_status, 'emergency_stop') <> 'active'
     or row_value.task_id <> p_task_id or row_value.project_id <> p_project_id
     or row_value.repository_full_name <> p_repository_full_name
     or row_value.branch_name <> p_branch_name or row_value.platform <> p_platform
     or row_value.environment <> p_environment or row_value.provider <> p_provider
     or row_value.operation <> p_operation
     or (
       p_path ~* '^(supabase/migrations/|app\.json$|app\.config\.|eas\.json$|config/release/)|(^|/)(auth|rls|role|money|payment|revenuecat|provider)([._/-]|$)'
       and row_value.risk_level <> 'high'
     )
     or row_value.approval_scope_hash <> p_approval_scope_hash
     or row_value.plan_snapshot_hash <> p_plan_snapshot_hash
     or not exists (
       select 1 from unnest(row_value.path_scopes) scope
       where p_path = rtrim(scope, '/') or p_path like rtrim(scope, '/') || '/%'
     )
     or row_value.remaining_calls < 1 or p_bytes < 0 or p_bytes > row_value.remaining_bytes
     or p_cost < 0 or p_cost > row_value.remaining_cost then
    raise exception 'capability_scope_or_budget_rejected' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.cognitive_capability_events
    where capability_id = row_value.id and call_id = p_call_id
  ) then raise exception 'capability_replay' using errcode = '23505'; end if;
  sequence_value := row_value.next_usage_sequence;
  update public.cognitive_capabilities set
    remaining_calls = remaining_calls - 1,
    remaining_bytes = remaining_bytes - p_bytes,
    remaining_cost = remaining_cost - p_cost,
    consumed_at = statement_timestamp(),
    next_usage_sequence = next_usage_sequence + 1,
    status = case when remaining_calls - 1 = 0 then 'exhausted'::public.cognitive_capability_status else status end
  where id = row_value.id;
  insert into public.cognitive_capability_events(
    capability_id, task_id, project_id, platform, environment, call_id,
    usage_sequence, event_type, request_hash
  ) values (
    row_value.id, p_task_id, p_project_id, p_platform, p_environment, p_call_id,
    sequence_value, 'consumed', p_request_hash
  );
  return sequence_value;
end;
$$;
revoke all on function public.cognitive_consume_capability(text, text, uuid, uuid, text, text, public.cognitive_platform, public.cognitive_environment, text, text, text, bigint, numeric, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cognitive_consume_capability(text, text, uuid, uuid, text, text, public.cognitive_platform, public.cognitive_environment, text, text, text, bigint, numeric, text, text, text)
  to service_role;

create or replace function public.cognitive_reserve_budget(
  p_budget_id uuid,
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_reservation_id text,
  p_model_tokens bigint,
  p_model_cost numeric,
  p_tool_calls integer,
  p_tool_bytes bigint,
  p_child_tasks integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare row_value public.intelligence_budgets%rowtype;
declare task_value public.intelligence_tasks%rowtype;
begin
  select * into row_value from public.intelligence_budgets
    where id=p_budget_id and task_id=p_task_id and project_id=p_project_id
      and platform=p_platform and environment=p_environment
    for update;
  select * into task_value from public.intelligence_tasks
    where id=p_task_id and project_id=p_project_id and platform=p_platform and environment=p_environment;
  if row_value.id is null or task_value.id is null or task_value.cancelled_at is not null
     or task_value.quarantined_at is not null or statement_timestamp() >= row_value.deadline_at
     or p_model_tokens < 0 or p_model_cost < 0 or p_tool_calls < 0
     or p_tool_bytes < 0 or p_child_tasks < 0
     or row_value.used_model_tokens + p_model_tokens > row_value.max_model_tokens
     or row_value.used_model_cost + p_model_cost > row_value.max_model_cost
     or row_value.used_tool_calls + p_tool_calls > row_value.max_tool_calls
     or row_value.used_tool_bytes + p_tool_bytes > row_value.max_tool_bytes
     or row_value.used_child_tasks + p_child_tasks > row_value.max_child_tasks then
    raise exception 'cognitive_budget_reservation_rejected' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.cognitive_budget_events
    where budget_id=p_budget_id and reservation_id=p_reservation_id
  ) then raise exception 'cognitive_budget_reservation_replay' using errcode = '23505'; end if;
  update public.intelligence_budgets set
    used_model_tokens=used_model_tokens+p_model_tokens,
    used_model_cost=used_model_cost+p_model_cost,
    used_tool_calls=used_tool_calls+p_tool_calls,
    used_tool_bytes=used_tool_bytes+p_tool_bytes,
    used_child_tasks=used_child_tasks+p_child_tasks
  where id=p_budget_id;
  insert into public.cognitive_budget_events(
    budget_id,task_id,project_id,platform,environment,reservation_id,event_type,usage
  ) values (
    p_budget_id,p_task_id,p_project_id,p_platform,p_environment,p_reservation_id,'reserved',
    jsonb_build_object(
      'model_tokens',p_model_tokens,'model_cost',p_model_cost,'tool_calls',p_tool_calls,
      'tool_bytes',p_tool_bytes,'child_tasks',p_child_tasks
    )
  );
  return true;
end;
$$;
revoke all on function public.cognitive_reserve_budget(uuid, uuid, uuid, public.cognitive_platform, public.cognitive_environment, text, bigint, numeric, integer, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.cognitive_reserve_budget(uuid, uuid, uuid, public.cognitive_platform, public.cognitive_environment, text, bigint, numeric, integer, bigint, integer)
  to service_role;

create or replace function public.cognitive_settle_budget(
  p_budget_id uuid,
  p_task_id uuid,
  p_reservation_id text,
  p_actual_model_tokens bigint,
  p_actual_model_cost numeric,
  p_actual_tool_calls integer,
  p_actual_tool_bytes bigint,
  p_actual_child_tasks integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare row_value public.intelligence_budgets%rowtype;
declare reserved jsonb;
begin
  select * into row_value from public.intelligence_budgets
    where id=p_budget_id and task_id=p_task_id for update;
  select usage into reserved from public.cognitive_budget_events
    where budget_id=p_budget_id and reservation_id=p_reservation_id and event_type='reserved';
  if row_value.id is null or reserved is null
     or exists (
       select 1 from public.cognitive_budget_events
       where budget_id=p_budget_id and reservation_id=p_reservation_id and event_type='settled'
     )
     or p_actual_model_tokens < 0 or p_actual_model_cost < 0 or p_actual_tool_calls < 0
     or p_actual_tool_bytes < 0 or p_actual_child_tasks < 0
     or row_value.used_model_tokens-(reserved->>'model_tokens')::bigint+p_actual_model_tokens > row_value.max_model_tokens
     or row_value.used_model_cost-(reserved->>'model_cost')::numeric+p_actual_model_cost > row_value.max_model_cost
     or row_value.used_tool_calls-(reserved->>'tool_calls')::integer+p_actual_tool_calls > row_value.max_tool_calls
     or row_value.used_tool_bytes-(reserved->>'tool_bytes')::bigint+p_actual_tool_bytes > row_value.max_tool_bytes
     or row_value.used_child_tasks-(reserved->>'child_tasks')::integer+p_actual_child_tasks > row_value.max_child_tasks then
    raise exception 'cognitive_budget_settlement_rejected' using errcode = 'P0001';
  end if;
  update public.intelligence_budgets set
    used_model_tokens=used_model_tokens-(reserved->>'model_tokens')::bigint+p_actual_model_tokens,
    used_model_cost=used_model_cost-(reserved->>'model_cost')::numeric+p_actual_model_cost,
    used_tool_calls=used_tool_calls-(reserved->>'tool_calls')::integer+p_actual_tool_calls,
    used_tool_bytes=used_tool_bytes-(reserved->>'tool_bytes')::bigint+p_actual_tool_bytes,
    used_child_tasks=used_child_tasks-(reserved->>'child_tasks')::integer+p_actual_child_tasks
  where id=p_budget_id;
  insert into public.cognitive_budget_events(
    budget_id,task_id,project_id,platform,environment,reservation_id,event_type,usage
  ) values (
    p_budget_id,p_task_id,row_value.project_id,row_value.platform,row_value.environment,
    p_reservation_id,'settled',
    jsonb_build_object(
      'model_tokens',p_actual_model_tokens,'model_cost',p_actual_model_cost,
      'tool_calls',p_actual_tool_calls,'tool_bytes',p_actual_tool_bytes,
      'child_tasks',p_actual_child_tasks
    )
  );
  return true;
end;
$$;
revoke all on function public.cognitive_settle_budget(uuid, uuid, text, bigint, numeric, integer, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.cognitive_settle_budget(uuid, uuid, text, bigint, numeric, integer, bigint, integer)
  to service_role;

create or replace function public.cognitive_record_finding(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_finding_key text,
  p_finding_type text,
  p_target_scope text,
  p_severity text,
  p_evidence_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
begin
  insert into public.cognitive_current_findings(
    task_id, project_id, platform, environment, finding_key, finding_type,
    target_scope, severity, first_seen_at, last_seen_at, evidence_hash
  ) values (
    p_task_id, p_project_id, p_platform, p_environment, p_finding_key, p_finding_type,
    p_target_scope, p_severity, statement_timestamp(), statement_timestamp(), p_evidence_hash
  )
  on conflict (task_id, finding_key) do update set
    occurrence_count = public.cognitive_current_findings.occurrence_count + 1,
    last_seen_at = statement_timestamp(),
    current_status = 'open',
    resolved_at = null,
    evidence_hash = excluded.evidence_hash
  returning id into result_id;
  insert into public.finding_lifecycle_events(finding_id, task_id, event_type, evidence_hash)
  values (
    result_id, p_task_id,
    case when (select occurrence_count from public.cognitive_current_findings where id = result_id) = 1 then 'detected' else 'recurred' end,
    p_evidence_hash
  );
  return result_id;
end;
$$;
revoke all on function public.cognitive_record_finding(uuid, uuid, public.cognitive_platform, public.cognitive_environment, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cognitive_record_finding(uuid, uuid, public.cognitive_platform, public.cognitive_environment, text, text, text, text, text)
  to service_role;

create or replace function public.cognitive_resolve_finding(
  p_task_id uuid,
  p_finding_key text,
  p_evidence_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
begin
  update public.cognitive_current_findings
  set current_status = 'resolved', resolved_at = statement_timestamp(), last_seen_at = statement_timestamp()
  where task_id = p_task_id and finding_key = p_finding_key and current_status = 'open'
  returning id into result_id;
  if result_id is null then raise exception 'open_finding_missing' using errcode = 'P0001'; end if;
  insert into public.finding_lifecycle_events(finding_id, task_id, event_type, evidence_hash)
  values (result_id, p_task_id, 'resolved', p_evidence_hash);
  return result_id;
end;
$$;
revoke all on function public.cognitive_resolve_finding(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cognitive_resolve_finding(uuid, text, text) to service_role;

-- RLS/readback: ordinary users receive nothing. Owner/super-admin and an
-- operator with the exact permission may read source-safe rows. No client writes.
do $$
declare
  table_name text;
  cognitive_tables constant text[] := array[
    'cognitive_projects', 'intelligence_tasks', 'research_sources', 'research_claims',
    'research_claim_sources', 'research_contradictions', 'research_retrieval_events',
    'knowledge_entities', 'knowledge_relationships', 'architecture_components',
    'architecture_dependencies', 'decision_records', 'hypotheses', 'solution_candidates',
    'experiments', 'experiment_results', 'execution_plans', 'execution_plan_snapshots',
    'execution_runs', 'execution_evidence_records', 'evaluation_results', 'lessons',
    'playbooks', 'model_invocations', 'tool_invocations', 'intelligence_budgets',
    'cognitive_capabilities', 'cognitive_capability_events', 'cognitive_budget_events',
    'cognitive_resource_leases', 'cognitive_state_transition_events',
    'cognitive_current_findings', 'finding_lifecycle_events', 'cognitive_erasure_events'
  ];
begin
  foreach table_name in array cognitive_tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('revoke update, delete, truncate, references, trigger on table public.%I from service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant select, insert on table public.%I to service_role', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
        public.has_platform_role(array[''owner''::text, ''super_admin''::text])
        or (
          public.has_platform_role(array[''operator''::text])
          and public.has_platform_permission(''admin.cognitive.read'')
        )
      )',
      table_name || '_cognitive_exact_read', table_name
    );
  end loop;
end
$$;

-- Mutable current rows are changed only through the security-definer state
-- machine/RPC path. The grants above intentionally omit UPDATE/DELETE for
-- service_role on each cognitive table and do not alter unrelated tables.
-- Sensitive control-plane rows also have no direct service-role INSERT path;
-- future activation requires separately reviewed issuance/recording RPCs.
revoke insert on public.execution_plans, public.execution_plan_snapshots,
  public.execution_runs, public.execution_evidence_records,
  public.evaluation_results, public.cognitive_capabilities,
  public.intelligence_budgets, public.cognitive_resource_leases,
  public.lessons, public.playbooks
from service_role;

comment on table public.cognitive_projects is
  'Undeployed/off Cognitive Intelligence project boundary. No production authority.';
comment on table public.execution_plan_snapshots is
  'Immutable canonical plan, scope, approval and rollback snapshot.';
comment on table public.cognitive_capabilities is
  'Hashed, expiring, task/project/repository/branch/platform/environment/action-bound capabilities.';
comment on table public.cognitive_erasure_events is
  'Non-personal immutable tombstone metadata; OWNER_COUNSEL_RETENTION_DECISION_REQUIRED before deployment.';
