-- Cognitive Level 0/1 product-sentinel persistence and evaluated triage.
--
-- This migration is additive over the deployed two-party control plane. It
-- introduces separately scoped collector and triage capabilities, binds every
-- triage mutation to an immutable independent-evaluator proof, and preserves an
-- immutable event for every detection, recurrence, and resolution. It grants
-- no client, Owner-impersonation, source mutation, deployment, or Level 2
-- authority.

create table public.cognitive_product_quality_service_capabilities (
  id uuid primary key default gen_random_uuid(),
  service_identity text not null check (
    service_identity in (
      'cognitive_sentinel_collector',
      'cognitive_product_quality_triage'
    )
  ),
  operation text not null check (
    operation in ('collect_sentinel_run', 'triage_product_quality')
  ),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  assertion_hash text not null unique check (assertion_hash ~ '^[a-f0-9]{64}$'),
  allowed_sentinel_keys text[] not null default '{}'::text[] check (
    allowed_sentinel_keys <@ array[
      'livekit_experience_sentinel',
      'visual_product_experience_sentinel',
      'installed_journey_sentinel'
    ]::text[]
    and (
      (
        service_identity = 'cognitive_sentinel_collector'
        and operation = 'collect_sentinel_run'
        and cardinality(allowed_sentinel_keys) between 1 and 3
      )
      or (
        service_identity = 'cognitive_product_quality_triage'
        and operation = 'triage_product_quality'
        and cardinality(allowed_sentinel_keys) = 0
      )
    )
  ),
  registered_by uuid not null,
  issued_at timestamptz not null default transaction_timestamp(),
  expires_at timestamptz not null,
  created_at timestamptz not null default transaction_timestamp(),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment),
  check (
    expires_at > issued_at
    and expires_at <= issued_at + interval '30 days'
  )
);

create table public.cognitive_product_quality_service_capability_revocations (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null unique,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  revoked_by uuid not null,
  revocation_hash text not null unique check (revocation_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  foreign key (capability_id, task_id, project_id, platform, environment)
    references public.cognitive_product_quality_service_capabilities(
      id, task_id, project_id, platform, environment
    )
);

alter table public.product_experience_sentinel_runs
  add column collector_capability_id uuid,
  add column collection_idempotency_hash text check (
    collection_idempotency_hash is null
    or collection_idempotency_hash ~ '^[a-f0-9]{64}$'
  ),
  add column source_build_hash text check (
    source_build_hash is null or source_build_hash ~ '^[a-f0-9]{64}$'
  ),
  add column observation_started_at timestamptz,
  add column observation_finished_at timestamptz,
  add column evaluation_expires_at timestamptz,
  add constraint product_experience_sentinel_runs_collector_capability_fk
    foreign key (
      collector_capability_id, task_id, project_id, platform, environment
    )
    references public.cognitive_product_quality_service_capabilities(
      id, task_id, project_id, platform, environment
    ),
  add constraint product_experience_sentinel_runs_operational_envelope_check
    check (
      (
        collector_capability_id is null
        and collection_idempotency_hash is null
        and source_build_hash is null
        and observation_started_at is null
        and observation_finished_at is null
        and evaluation_expires_at is null
      )
      or (
        collector_capability_id is not null
        and collection_idempotency_hash is not null
        and source_build_hash is not null
        and observation_started_at is not null
        and observation_finished_at is not null
        and evaluation_expires_at is not null
        and observation_finished_at >= observation_started_at
        and observation_finished_at <= observation_started_at + interval '30 minutes'
        and evaluation_expires_at > observation_finished_at
        and evaluation_expires_at <= observation_finished_at + interval '24 hours'
        and evaluation_expires_at <= retention_until
      )
    );

create unique index product_experience_sentinel_runs_idempotency_idx
  on public.product_experience_sentinel_runs(
    task_id, collection_idempotency_hash
  )
  where collection_idempotency_hash is not null;

create index product_experience_sentinel_runs_evaluation_expiry_idx
  on public.product_experience_sentinel_runs(
    task_id, evaluation_expires_at
  )
  where evaluation_expires_at is not null and erased_at is null;

create table public.product_experience_sentinel_evaluator_proofs (
  id uuid primary key default gen_random_uuid(),
  sentinel_run_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  assessment_kind text not null check (
    assessment_kind in ('finding_detection', 'finding_resolution')
  ),
  assessment_hash text not null check (assessment_hash ~ '^[a-f0-9]{64}$'),
  evidence_manifest_hash text not null check (
    evidence_manifest_hash ~ '^[a-f0-9]{64}$'
  ),
  verdict text not null check (verdict in ('passed', 'rejected')),
  evaluator_identity text not null check (
    evaluator_identity = 'cognitive_independent_evaluator'
  ),
  evaluator_proof_hash text not null unique check (
    evaluator_proof_hash ~ '^[a-f0-9]{64}$'
  ),
  evaluator_output_hash text not null check (
    evaluator_output_hash ~ '^[a-f0-9]{64}$'
  ),
  valid_until timestamptz not null,
  created_at timestamptz not null default transaction_timestamp(),
  unique (
    sentinel_run_id, assessment_kind, assessment_hash, evaluator_proof_hash
  ),
  unique (id, task_id, project_id, platform, environment),
  foreign key (
    sentinel_run_id, task_id, project_id, platform, environment
  )
    references public.product_experience_sentinel_runs(
      id, task_id, project_id, platform, environment
    ),
  check (valid_until > created_at and valid_until <= created_at + interval '24 hours')
);

alter table public.product_quality_findings
  add column finding_class text,
  add column finding_scope_hash text,
  add column current_status text not null default 'open' check (
    current_status in ('open', 'resolved')
  ),
  add column current_evaluator_proof_id uuid,
  add column resolved_at timestamptz,
  add column resolution_hash text check (
    resolution_hash is null or resolution_hash ~ '^[a-f0-9]{64}$'
  );

drop trigger product_quality_findings_retention_tombstone_only
  on public.product_quality_findings;

update public.product_quality_findings
set
  finding_class = 'legacy_classification',
  finding_scope_hash = encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          task_id::text,
          project_id::text,
          platform::text,
          environment::text,
          route_or_surface,
          finding_key
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  current_status = case
    when governance_status = 'closed_no_action' then 'resolved'
    else 'open'
  end,
  resolved_at = case
    when governance_status = 'closed_no_action' then last_seen_at
    else null
  end;

alter table public.product_quality_findings
  alter column finding_class set not null,
  alter column finding_scope_hash set not null,
  add constraint product_quality_findings_finding_class_check check (
    finding_class ~ '^[a-z0-9][a-z0-9._-]{2,80}$'
  ),
  add constraint product_quality_findings_scope_hash_check check (
    finding_scope_hash ~ '^[a-f0-9]{64}$'
  ),
  add constraint product_quality_findings_resolution_state_check check (
    (
      current_status = 'open'
      and resolved_at is null
      and resolution_hash is null
    )
    or (
      current_status = 'resolved'
      and resolved_at is not null
    )
  ),
  add constraint product_quality_findings_current_evaluator_proof_fk
    foreign key (
      current_evaluator_proof_id, task_id, project_id, platform, environment
    )
    references public.product_experience_sentinel_evaluator_proofs(
      id, task_id, project_id, platform, environment
    );

create unique index product_quality_findings_scope_idx
  on public.product_quality_findings(finding_scope_hash);

alter table public.product_quality_findings
  drop constraint if exists product_quality_findings_governance_status_check,
  add constraint product_quality_findings_governance_status_check check (
    governance_status in (
      'entered_collective_governance',
      'needs_product_baseline_review',
      'proposal_requested',
      'owner_approval_requested',
      'closed_no_action',
      'resolved'
    )
  );

create table public.product_quality_finding_events (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null,
  sentinel_run_id uuid not null,
  evaluator_proof_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  finding_key text not null,
  finding_class text not null check (
    finding_class ~ '^[a-z0-9][a-z0-9._-]{2,80}$'
  ),
  finding_scope_hash text not null check (
    finding_scope_hash ~ '^[a-f0-9]{64}$'
  ),
  route_or_surface text not null check (
    length(route_or_surface) between 1 and 160
    and not public.cognitive_text_has_secret(route_or_surface)
    and not public.cognitive_text_has_private_identifier(route_or_surface)
  ),
  event_type text not null check (
    event_type in ('detected', 'recurred', 'resolved')
  ),
  occurrence_number integer not null check (
    occurrence_number between 1 and 1000000
  ),
  severity text not null check (
    severity in ('info', 'low', 'medium', 'high', 'critical')
  ),
  reproduction_state text not null check (
    reproduction_state in (
      'confirmed_defect',
      'likely_defect',
      'design_baseline_missing',
      'provider_blocked',
      'device_unavailable'
    )
  ),
  suspected_layer text not null check (
    suspected_layer in (
      'backend_token','websocket','ice_turn','media_publish',
      'media_subscribe','installed_ui_state','react_state',
      'permission','provider_degradation','layout_density',
      'route_navigation','loading_state','empty_error_offline',
      'platform_drift','unknown'
    )
  ),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  assessment_hash text not null check (assessment_hash ~ '^[a-f0-9]{64}$'),
  event_hash text not null unique check (event_hash ~ '^[a-f0-9]{64}$'),
  evidence_hashes text[] not null check (
    public.governance_hash_array_valid(evidence_hashes, 1, 64)
  ),
  resolution_hash text check (
    resolution_hash is null or resolution_hash ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (finding_id, event_type, occurrence_number),
  foreign key (finding_id, task_id, project_id, platform, environment)
    references public.product_quality_findings(
      id, task_id, project_id, platform, environment
    ),
  foreign key (sentinel_run_id, task_id, project_id, platform, environment)
    references public.product_experience_sentinel_runs(
      id, task_id, project_id, platform, environment
    ),
  foreign key (evaluator_proof_id, task_id, project_id, platform, environment)
    references public.product_experience_sentinel_evaluator_proofs(
      id, task_id, project_id, platform, environment
    ),
  check (
    (event_type = 'resolved' and resolution_hash is not null)
    or (event_type <> 'resolved' and resolution_hash is null)
  )
);

create table public.product_experience_sentinel_evaluator_proof_consumptions (
  id uuid primary key default gen_random_uuid(),
  evaluator_proof_id uuid not null unique,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  event_hash text not null unique check (event_hash ~ '^[a-f0-9]{64}$'),
  consumed_by_identity text not null check (
    consumed_by_identity = 'cognitive_product_quality_triage'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  foreign key (
    evaluator_proof_id, task_id, project_id, platform, environment
  )
    references public.product_experience_sentinel_evaluator_proofs(
      id, task_id, project_id, platform, environment
    )
);

do $$
declare
  table_name text;
  tables constant text[] := array[
    'cognitive_product_quality_service_capabilities',
    'cognitive_product_quality_service_capability_revocations',
    'product_experience_sentinel_evaluator_proofs',
    'product_quality_finding_events',
    'product_experience_sentinel_evaluator_proof_consumptions'
  ];
begin
  foreach table_name in array tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated, service_role',
      table_name
    );
    execute format('grant select on table public.%I to service_role', table_name);
    execute format(
      'create trigger %I before update or delete on public.%I
       for each row execute function public.reject_cognitive_evidence_mutation()',
      table_name || '_immutable',
      table_name
    );
  end loop;
end
$$;

grant select on table public.product_experience_sentinel_evaluator_proofs
  to authenticated;
grant select on table public.product_quality_finding_events
  to authenticated;
create policy product_experience_sentinel_evaluator_proofs_exact_cognitive_read
  on public.product_experience_sentinel_evaluator_proofs
  for select
  to authenticated
  using ((select public.cognitive_can_read_scope(project_id, task_id, platform)));
create policy product_quality_finding_events_exact_cognitive_read
  on public.product_quality_finding_events
  for select
  to authenticated
  using ((select public.cognitive_can_read_scope(project_id, task_id, platform)));

create function public.product_quality_finding_state_mutation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_write_mode text := current_setting(
    'app.cognitive_product_quality_state_write',
    true
  );
begin
  if tg_op = 'DELETE' then
    raise exception 'immutable_product_quality_finding' using errcode = '42501';
  end if;

  if old.erased_at is null
     and new.erased_at is not null
     and old.legal_hold = false
     and new.erased_at >= old.retention_until
     and to_jsonb(new) - 'erased_at' = to_jsonb(old) - 'erased_at' then
    return new;
  end if;

  if state_write_mode = 'recurrence'
     and new.occurrence_count = old.occurrence_count + 1
     and new.last_seen_at >= old.last_seen_at
     and new.current_status = 'open'
     and new.resolved_at is null
     and new.resolution_hash is null
     and new.current_evaluator_proof_id is not null
     and (
       to_jsonb(new) - array[
         'sentinel_run_id','build_runtime_hash','last_seen_at',
         'occurrence_count','severity','user_impact_hash','evidence_hashes',
         'suspected_layer','confidence','reproduction_state',
         'affected_components_hash','provider_backend_state_hash',
         'proposed_next_investigation_hash','physical_proof_status',
         'governance_status','current_status','current_evaluator_proof_id',
         'resolved_at','resolution_hash'
       ]::text[]
       =
       to_jsonb(old) - array[
         'sentinel_run_id','build_runtime_hash','last_seen_at',
         'occurrence_count','severity','user_impact_hash','evidence_hashes',
         'suspected_layer','confidence','reproduction_state',
         'affected_components_hash','provider_backend_state_hash',
         'proposed_next_investigation_hash','physical_proof_status',
         'governance_status','current_status','current_evaluator_proof_id',
         'resolved_at','resolution_hash'
       ]::text[]
     ) then
    return new;
  end if;

  if state_write_mode = 'resolution'
     and old.current_status = 'open'
     and new.current_status = 'resolved'
     and new.occurrence_count = old.occurrence_count
     and new.last_seen_at = old.last_seen_at
     and new.resolved_at is not null
     and new.resolution_hash is not null
     and new.current_evaluator_proof_id is not null
     and (
       to_jsonb(new) - array[
         'governance_status','current_status','current_evaluator_proof_id',
         'resolved_at','resolution_hash'
       ]::text[]
       =
       to_jsonb(old) - array[
         'governance_status','current_status','current_evaluator_proof_id',
         'resolved_at','resolution_hash'
       ]::text[]
     ) then
    return new;
  end if;

  raise exception 'immutable_product_quality_finding' using errcode = '42501';
end;
$$;
revoke all on function public.product_quality_finding_state_mutation_guard()
  from public, anon, authenticated, service_role;

create function public.product_quality_require_evaluator_for_collected_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_value public.product_experience_sentinel_runs%rowtype;
  proof_value public.product_experience_sentinel_evaluator_proofs%rowtype;
begin
  select * into run_value
  from public.product_experience_sentinel_runs
  where id = new.sentinel_run_id;

  if run_value.collector_capability_id is null then
    new.finding_class := coalesce(
      new.finding_class,
      'legacy_classification'
    );
    new.finding_scope_hash := coalesce(
      new.finding_scope_hash,
      encode(
        extensions.digest(
          convert_to(
            concat_ws(
              '|',
              new.task_id::text,
              new.project_id::text,
              new.platform::text,
              new.environment::text,
              new.route_or_surface,
              new.finding_key
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    );
    return new;
  end if;

  select * into proof_value
  from public.product_experience_sentinel_evaluator_proofs
  where id = new.current_evaluator_proof_id;

  if proof_value.id is null
     or proof_value.sentinel_run_id <> run_value.id
     or proof_value.task_id <> run_value.task_id
     or proof_value.project_id <> run_value.project_id
     or proof_value.platform <> run_value.platform
     or proof_value.environment <> run_value.environment
     or proof_value.assessment_kind <> 'finding_detection'
     or proof_value.evidence_manifest_hash <> run_value.evidence_manifest_hash
     or proof_value.verdict <> 'passed'
     or proof_value.evaluator_identity <> 'cognitive_independent_evaluator'
     or proof_value.valid_until <= transaction_timestamp() then
    raise exception 'product_quality_evaluator_proof_required'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
revoke all on function public.product_quality_require_evaluator_for_collected_run()
  from public, anon, authenticated, service_role;

create trigger product_quality_findings_collected_run_evaluator_required
before insert on public.product_quality_findings
for each row
execute function public.product_quality_require_evaluator_for_collected_run();

create trigger product_quality_findings_evaluated_state_only
before update or delete on public.product_quality_findings
for each row execute function public.product_quality_finding_state_mutation_guard();

create function public.product_quality_expected_finding_key(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_route_or_surface text,
  p_finding_class text
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select 'pqf_' || substr(
    encode(
      extensions.digest(
        convert_to(
          concat_ws(
            '|',
            p_task_id::text,
            p_project_id::text,
            p_platform::text,
            p_environment::text,
            p_route_or_surface,
            p_finding_class
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ),
    1,
    48
  );
$$;
revoke all on function public.product_quality_expected_finding_key(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text
) from public, anon, authenticated, service_role;

create function public.product_quality_detection_assessment_hash(
  p_sentinel_run_id uuid,
  p_finding_key text,
  p_route_or_surface text,
  p_build_runtime_hash text,
  p_severity text,
  p_user_impact_hash text,
  p_evidence_hashes text[],
  p_suspected_layer text,
  p_confidence numeric,
  p_reproduction_state text,
  p_affected_components_hash text,
  p_provider_backend_state_hash text,
  p_proposed_next_investigation_hash text,
  p_physical_proof_status text
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'affectedComponentsHash', p_affected_components_hash,
          'buildRuntimeHash', p_build_runtime_hash,
          'confidence', p_confidence,
          'evidenceHashes', to_jsonb(p_evidence_hashes),
          'findingKey', p_finding_key,
          'physicalProofStatus', p_physical_proof_status,
          'proposedNextInvestigationHash', p_proposed_next_investigation_hash,
          'providerBackendStateHash', p_provider_backend_state_hash,
          'reproductionState', p_reproduction_state,
          'routeOrSurface', p_route_or_surface,
          'sentinelRunId', p_sentinel_run_id,
          'severity', p_severity,
          'suspectedLayer', p_suspected_layer,
          'userImpactHash', p_user_impact_hash
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;
revoke all on function public.product_quality_detection_assessment_hash(
  uuid,text,text,text,text,text,text[],text,numeric,text,text,text,text,text
) from public, anon, authenticated, service_role;

create function public.product_quality_resolution_assessment_hash(
  p_finding_id uuid,
  p_sentinel_run_id uuid,
  p_resolution_evidence_hash text,
  p_resolution_reason_hash text
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'findingId', p_finding_id,
          'resolutionEvidenceHash', p_resolution_evidence_hash,
          'resolutionReasonHash', p_resolution_reason_hash,
          'sentinelRunId', p_sentinel_run_id
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;
revoke all on function public.product_quality_resolution_assessment_hash(
  uuid,uuid,text,text
) from public, anon, authenticated, service_role;

create function public.cognitive_product_quality_register_service_capability(
  p_service_identity text,
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_assertion_hash text,
  p_allowed_sentinel_keys text[],
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  operation_value text;
  capability_id uuid;
begin
  operation_value := case p_service_identity
    when 'cognitive_sentinel_collector' then 'collect_sentinel_run'
    when 'cognitive_product_quality_triage' then 'triage_product_quality'
    else null
  end;

  if operation_value is null
     or p_assertion_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at <= transaction_timestamp()
     or p_expires_at > transaction_timestamp() + interval '30 days'
     or not exists (
       select 1
       from public.intelligence_tasks task
       where task.id = p_task_id
         and task.project_id = p_project_id
         and task.platform = p_platform
         and task.environment = p_environment
     )
     or (
       p_service_identity = 'cognitive_sentinel_collector'
       and (
         p_allowed_sentinel_keys is null
         or cardinality(p_allowed_sentinel_keys) not between 1 and 3
         or not p_allowed_sentinel_keys <@ array[
           'livekit_experience_sentinel',
           'visual_product_experience_sentinel',
           'installed_journey_sentinel'
         ]::text[]
       )
     )
     or (
       p_service_identity = 'cognitive_product_quality_triage'
       and coalesce(cardinality(p_allowed_sentinel_keys), 0) <> 0
     ) then
    raise exception 'product_quality_service_capability_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.cognitive_product_quality_service_capabilities(
    service_identity, operation, task_id, project_id, platform, environment,
    assertion_hash, allowed_sentinel_keys, registered_by, expires_at
  ) values (
    p_service_identity, operation_value, p_task_id, p_project_id,
    p_platform, p_environment, p_assertion_hash,
    coalesce(p_allowed_sentinel_keys, '{}'::text[]), owner_id, p_expires_at
  )
  returning id into capability_id;

  return jsonb_build_object(
    'capabilityId', capability_id,
    'serviceIdentity', p_service_identity,
    'operation', operation_value,
    'taskId', p_task_id,
    'projectId', p_project_id,
    'platform', p_platform,
    'environment', p_environment,
    'expiresAt', p_expires_at
  );
end;
$$;
revoke all on function public.cognitive_product_quality_register_service_capability(
  text,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text[],timestamptz
) from public, anon, service_role;
grant execute on function public.cognitive_product_quality_register_service_capability(
  text,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text[],timestamptz
) to authenticated;

create function public.cognitive_product_quality_revoke_service_capability(
  p_capability_id uuid,
  p_revocation_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  capability_value public.cognitive_product_quality_service_capabilities%rowtype;
  revocation_id uuid;
begin
  select * into capability_value
  from public.cognitive_product_quality_service_capabilities
  where id = p_capability_id
  for update;

  if capability_value.id is null
     or p_revocation_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'product_quality_service_capability_revocation_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.cognitive_product_quality_service_capability_revocations(
    capability_id, task_id, project_id, platform, environment,
    revoked_by, revocation_hash
  ) values (
    capability_value.id, capability_value.task_id, capability_value.project_id,
    capability_value.platform, capability_value.environment,
    owner_id, p_revocation_hash
  )
  returning id into revocation_id;

  return jsonb_build_object(
    'capabilityId', capability_value.id,
    'revocationId', revocation_id,
    'revoked', true
  );
end;
$$;
revoke all on function public.cognitive_product_quality_revoke_service_capability(
  uuid,text
) from public, anon, service_role;
grant execute on function public.cognitive_product_quality_revoke_service_capability(
  uuid,text
) to authenticated;

create function public.cognitive_product_quality_assert_service_capability(
  p_service_identity text,
  p_operation text,
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_sentinel_key text,
  p_service_assertion text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    claims->>'role'
  );
  capability_id uuid;
begin
  if request_role <> 'service_role'
     or p_service_identity not in (
       'cognitive_sentinel_collector',
       'cognitive_product_quality_triage'
     )
     or p_operation not in (
       'collect_sentinel_run',
       'triage_product_quality'
     )
     or p_service_assertion is null
     or octet_length(p_service_assertion) not between 32 and 1024
     or (
       p_service_identity = 'cognitive_sentinel_collector'
       and p_operation <> 'collect_sentinel_run'
     )
     or (
       p_service_identity = 'cognitive_product_quality_triage'
       and p_operation <> 'triage_product_quality'
     ) then
    raise exception 'product_quality_service_capability_required'
      using errcode = '42501';
  end if;

  select capability.id into capability_id
  from public.cognitive_product_quality_service_capabilities capability
  where capability.service_identity = p_service_identity
    and capability.operation = p_operation
    and capability.task_id = p_task_id
    and capability.project_id = p_project_id
    and capability.platform = p_platform
    and capability.environment = p_environment
    and transaction_timestamp() < capability.expires_at
    and (
      p_operation <> 'collect_sentinel_run'
      or p_sentinel_key = any(capability.allowed_sentinel_keys)
    )
    and capability.assertion_hash = encode(
      extensions.digest(convert_to(p_service_assertion, 'UTF8'), 'sha256'),
      'hex'
    )
    and not exists (
      select 1
      from public.cognitive_product_quality_service_capability_revocations revocation
      where revocation.capability_id = capability.id
    )
  for share;

  if capability_id is null then
    raise exception 'product_quality_service_capability_required'
      using errcode = '42501';
  end if;

  return capability_id;
end;
$$;
revoke all on function public.cognitive_product_quality_assert_service_capability(
  text,text,uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text
) from public, anon, authenticated;
grant execute on function public.cognitive_product_quality_assert_service_capability(
  text,text,uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text
) to service_role;

create function public.product_experience_metric_manifest_is_bounded(
  p_sentinel_key text,
  p_evidence_manifest_hash text,
  p_metric_manifest jsonb
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select
    jsonb_typeof(p_metric_manifest) = 'object'
    and pg_column_size(p_metric_manifest) <= 65536
    and public.cognitive_json_is_sanitized(p_metric_manifest)
    and p_metric_manifest->>'schemaVersion' = 'product-sentinel-v1'
    and p_metric_manifest->>'sanitizationVersion' = 'bounded-nonpersonal-v1'
    and jsonb_typeof(p_metric_manifest->'observationKind') = 'string'
    and jsonb_typeof(p_metric_manifest->'metrics') = 'object'
    and (
      select count(*)
      from jsonb_object_keys(p_metric_manifest->'metrics')
    ) between 1 and 64
    and pg_column_size(p_metric_manifest->'metrics') <= 49152
    and jsonb_typeof(p_metric_manifest->'evidenceHashes') = 'array'
    and jsonb_array_length(p_metric_manifest->'evidenceHashes') between 1 and 32
    and not exists (
      select 1
      from jsonb_array_elements(p_metric_manifest->'evidenceHashes') item
      where jsonb_typeof(item) <> 'string'
        or trim(both '"' from item::text) !~ '^[a-f0-9]{64}$'
    )
    and exists (
      select 1
      from jsonb_array_elements_text(p_metric_manifest->'evidenceHashes') item(value)
      where item.value = p_evidence_manifest_hash
    )
    and case p_sentinel_key
      when 'livekit_experience_sentinel' then
        p_metric_manifest->>'observationKind' = 'livekit_experience'
      when 'visual_product_experience_sentinel' then
        p_metric_manifest->>'observationKind' in (
          'visual_layout',
          'touch_target'
        )
      when 'installed_journey_sentinel' then
        p_metric_manifest->>'observationKind' in (
          'installed_journey',
          'route_timing',
          'search_accessibility',
          'crash_anr'
        )
      else false
    end;
$$;
revoke all on function public.product_experience_metric_manifest_is_bounded(
  text,text,jsonb
) from public, anon, authenticated, service_role;

create function public.product_experience_collect_sentinel_run(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_sentinel_key text,
  p_route_or_surface text,
  p_runtime_identity_hash text,
  p_source_build_hash text,
  p_evidence_manifest_hash text,
  p_metric_manifest jsonb,
  p_result_status text,
  p_physical_proof_status text,
  p_observation_started_at timestamptz,
  p_observation_finished_at timestamptz,
  p_evaluation_expires_at timestamptz,
  p_collection_idempotency_hash text,
  p_service_identity text,
  p_service_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability_id uuid;
  result_id uuid;
  existing_run public.product_experience_sentinel_runs%rowtype;
begin
  capability_id := public.cognitive_product_quality_assert_service_capability(
    p_service_identity, 'collect_sentinel_run', p_task_id, p_project_id,
    p_platform, p_environment, p_sentinel_key, p_service_assertion
  );

  if p_service_identity <> 'cognitive_sentinel_collector'
     or not public.governance_task_writes_allowed(
       p_task_id, p_project_id, p_platform, p_environment
     )
     or p_runtime_identity_hash !~ '^[a-f0-9]{64}$'
     or p_source_build_hash !~ '^[a-f0-9]{64}$'
     or p_evidence_manifest_hash !~ '^[a-f0-9]{64}$'
     or p_collection_idempotency_hash !~ '^[a-f0-9]{64}$'
     or length(p_route_or_surface) not between 1 and 160
     or public.cognitive_text_has_secret(p_route_or_surface)
     or public.cognitive_text_has_private_identifier(p_route_or_surface)
     or p_result_status not in ('passed', 'blocked', 'failed')
     or p_physical_proof_status not in (
       'installed_ui_observed','simulator_observed','source_only',
       'provider_blocked','device_unavailable','new_binary_or_ota_required'
     )
     or (
       p_result_status in ('passed', 'failed')
       and p_physical_proof_status not in (
         'installed_ui_observed', 'simulator_observed'
       )
     )
     or p_observation_started_at is null
     or p_observation_finished_at is null
     or p_observation_finished_at < p_observation_started_at
     or p_observation_finished_at > p_observation_started_at + interval '30 minutes'
     or p_observation_finished_at > transaction_timestamp() + interval '5 minutes'
     or p_evaluation_expires_at <= p_observation_finished_at
     or p_evaluation_expires_at > p_observation_finished_at + interval '24 hours'
     or not public.product_experience_metric_manifest_is_bounded(
       p_sentinel_key, p_evidence_manifest_hash, p_metric_manifest
     )
     or not exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = p_task_id
         and switch.project_id = p_project_id
         and switch.platform = p_platform
         and switch.environment = p_environment
         and switch.enabled
         and switch.switch_key = case p_sentinel_key
           when 'livekit_experience_sentinel'
             then 'cognitive_livekit_experience_sentinel_enabled'
           when 'visual_product_experience_sentinel'
             then 'cognitive_visual_experience_sentinel_enabled'
           when 'installed_journey_sentinel'
             then 'cognitive_installed_journey_sentinel_enabled'
         end
     ) then
    raise exception 'product_experience_sentinel_collection_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.product_experience_sentinel_runs(
    task_id, project_id, platform, environment, sentinel_key,
    route_or_surface, runtime_identity_hash, source_build_hash,
    evidence_manifest_hash, metric_manifest, result_status,
    physical_proof_status, collector_capability_id,
    collection_idempotency_hash, observation_started_at,
    observation_finished_at, evaluation_expires_at
  ) values (
    p_task_id, p_project_id, p_platform, p_environment, p_sentinel_key,
    p_route_or_surface, p_runtime_identity_hash, p_source_build_hash,
    p_evidence_manifest_hash, p_metric_manifest, p_result_status,
    p_physical_proof_status, capability_id, p_collection_idempotency_hash,
    p_observation_started_at, p_observation_finished_at,
    p_evaluation_expires_at
  )
  on conflict (task_id, collection_idempotency_hash)
    where collection_idempotency_hash is not null
  do nothing
  returning id into result_id;

  if result_id is null then
    select * into existing_run
    from public.product_experience_sentinel_runs
    where task_id = p_task_id
      and collection_idempotency_hash = p_collection_idempotency_hash
    for share;

    if existing_run.id is null
       or existing_run.project_id <> p_project_id
       or existing_run.platform <> p_platform
       or existing_run.environment <> p_environment
       or existing_run.sentinel_key <> p_sentinel_key
       or existing_run.route_or_surface <> p_route_or_surface
       or existing_run.runtime_identity_hash <> p_runtime_identity_hash
       or existing_run.source_build_hash <> p_source_build_hash
       or existing_run.evidence_manifest_hash <> p_evidence_manifest_hash
       or existing_run.metric_manifest <> p_metric_manifest
       or existing_run.result_status <> p_result_status
       or existing_run.physical_proof_status <> p_physical_proof_status
       or existing_run.collector_capability_id <> capability_id
       or existing_run.observation_started_at <> p_observation_started_at
       or existing_run.observation_finished_at <> p_observation_finished_at
       or existing_run.evaluation_expires_at <> p_evaluation_expires_at then
      raise exception 'product_experience_sentinel_idempotency_conflict'
        using errcode = 'P0001';
    end if;
    result_id := existing_run.id;
  end if;

  return jsonb_build_object(
    'sentinelRunId', result_id,
    'taskId', p_task_id,
    'projectId', p_project_id,
    'platform', p_platform,
    'environment', p_environment,
    'resultStatus', p_result_status,
    'evaluationExpiresAt', p_evaluation_expires_at
  );
end;
$$;
revoke all on function public.product_experience_collect_sentinel_run(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,
  timestamptz,text,text,text
) from public, anon, authenticated;
grant execute on function public.product_experience_collect_sentinel_run(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,
  timestamptz,text,text,text
) to service_role;

create function public.product_quality_record_sentinel_evaluator_proof(
  p_sentinel_run_id uuid,
  p_assessment_kind text,
  p_assessment_hash text,
  p_evidence_manifest_hash text,
  p_verdict text,
  p_evaluator_output_hash text,
  p_evaluator_proof_hash text,
  p_evaluator_identity text,
  p_evaluator_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_value public.product_experience_sentinel_runs%rowtype;
  proof_id uuid;
  valid_until_value timestamptz;
begin
  perform public.governance_assert_two_party_service_principal(
    p_evaluator_identity, p_evaluator_assertion, 'independent_evaluation'
  );

  select * into run_value
  from public.product_experience_sentinel_runs
  where id = p_sentinel_run_id
  for share;

  valid_until_value := least(
    run_value.evaluation_expires_at,
    transaction_timestamp() + interval '24 hours'
  );

  if p_evaluator_identity <> 'cognitive_independent_evaluator'
     or run_value.id is null
     or run_value.collector_capability_id is null
     or run_value.erased_at is not null
     or run_value.evaluation_expires_at <= transaction_timestamp()
     or p_assessment_kind not in (
       'finding_detection', 'finding_resolution'
     )
     or p_assessment_hash !~ '^[a-f0-9]{64}$'
     or p_evidence_manifest_hash <> run_value.evidence_manifest_hash
     or p_verdict not in ('passed', 'rejected')
     or p_evaluator_output_hash !~ '^[a-f0-9]{64}$'
     or p_evaluator_proof_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'product_quality_evaluator_proof_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.product_experience_sentinel_evaluator_proofs(
    sentinel_run_id, task_id, project_id, platform, environment,
    assessment_kind, assessment_hash, evidence_manifest_hash, verdict,
    evaluator_identity, evaluator_proof_hash, evaluator_output_hash,
    valid_until
  ) values (
    run_value.id, run_value.task_id, run_value.project_id,
    run_value.platform, run_value.environment, p_assessment_kind,
    p_assessment_hash, p_evidence_manifest_hash, p_verdict,
    p_evaluator_identity, p_evaluator_proof_hash,
    p_evaluator_output_hash, valid_until_value
  )
  returning id into proof_id;

  return jsonb_build_object(
    'evaluatorProofId', proof_id,
    'sentinelRunId', run_value.id,
    'assessmentKind', p_assessment_kind,
    'verdict', p_verdict,
    'validUntil', valid_until_value
  );
end;
$$;
revoke all on function public.product_quality_record_sentinel_evaluator_proof(
  uuid,text,text,text,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.product_quality_record_sentinel_evaluator_proof(
  uuid,text,text,text,text,text,text,text,text
) to service_role;

create function public.product_quality_triage_detection(
  p_sentinel_run_id uuid,
  p_evaluator_proof_id uuid,
  p_evaluator_proof_hash text,
  p_finding_class text,
  p_route_or_surface text,
  p_build_runtime_hash text,
  p_severity text,
  p_user_impact_hash text,
  p_evidence_hashes text[],
  p_suspected_layer text,
  p_confidence numeric,
  p_reproduction_state text,
  p_affected_components_hash text,
  p_provider_backend_state_hash text,
  p_proposed_next_investigation_hash text,
  p_physical_proof_status text,
  p_service_identity text,
  p_service_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability_id uuid;
  run_value public.product_experience_sentinel_runs%rowtype;
  proof_value public.product_experience_sentinel_evaluator_proofs%rowtype;
  finding_value public.product_quality_findings%rowtype;
  finding_id uuid;
  finding_key_value text;
  scope_hash_value text;
  assessment_hash_value text;
  event_hash_value text;
  event_type_value text;
  occurrence_value integer;
  governance_status_value text;
begin
  select * into run_value
  from public.product_experience_sentinel_runs
  where id = p_sentinel_run_id
  for share;

  if run_value.id is null then
    raise exception 'product_quality_detection_rejected' using errcode = 'P0001';
  end if;

  capability_id := public.cognitive_product_quality_assert_service_capability(
    p_service_identity, 'triage_product_quality', run_value.task_id,
    run_value.project_id, run_value.platform, run_value.environment,
    null, p_service_assertion
  );

  finding_key_value := public.product_quality_expected_finding_key(
    run_value.task_id, run_value.project_id, run_value.platform,
    run_value.environment, p_route_or_surface, p_finding_class
  );
  scope_hash_value := encode(
    extensions.digest(convert_to(finding_key_value, 'UTF8'), 'sha256'),
    'hex'
  );
  assessment_hash_value := public.product_quality_detection_assessment_hash(
    run_value.id, finding_key_value, p_route_or_surface,
    p_build_runtime_hash, p_severity, p_user_impact_hash,
    p_evidence_hashes, p_suspected_layer, p_confidence,
    p_reproduction_state, p_affected_components_hash,
    p_provider_backend_state_hash, p_proposed_next_investigation_hash,
    p_physical_proof_status
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(scope_hash_value, 0)
  );

  select * into proof_value
  from public.product_experience_sentinel_evaluator_proofs
  where id = p_evaluator_proof_id
  for share;

  if capability_id is null
     or p_service_identity <> 'cognitive_product_quality_triage'
     or run_value.collector_capability_id is null
     or run_value.erased_at is not null
     or run_value.evaluation_expires_at <= transaction_timestamp()
     or run_value.result_status not in ('failed', 'blocked')
     or p_finding_class !~ '^[a-z0-9][a-z0-9._-]{2,80}$'
     or p_route_or_surface <> run_value.route_or_surface
     or p_build_runtime_hash <> run_value.source_build_hash
     or p_evidence_hashes is null
     or not public.governance_hash_array_valid(p_evidence_hashes, 1, 64)
     or not run_value.evidence_manifest_hash = any(p_evidence_hashes)
     or p_reproduction_state not in (
       'confirmed_defect', 'likely_defect', 'design_baseline_missing',
       'provider_blocked', 'device_unavailable'
     )
     or p_physical_proof_status <> run_value.physical_proof_status
     or (
       p_reproduction_state in (
         'confirmed_defect', 'likely_defect', 'design_baseline_missing'
       )
       and (
         run_value.result_status <> 'failed'
         or p_physical_proof_status not in (
           'installed_ui_observed', 'simulator_observed'
         )
       )
     )
     or (
       p_reproduction_state = 'design_baseline_missing'
       and run_value.sentinel_key <> 'visual_product_experience_sentinel'
     )
     or (
       p_reproduction_state = 'provider_blocked'
       and (
         run_value.result_status <> 'blocked'
         or p_physical_proof_status <> 'provider_blocked'
       )
     )
     or (
       p_reproduction_state = 'device_unavailable'
       and (
         run_value.result_status <> 'blocked'
         or p_physical_proof_status <> 'device_unavailable'
       )
     )
     or proof_value.id is null
     or proof_value.sentinel_run_id <> run_value.id
     or proof_value.task_id <> run_value.task_id
     or proof_value.assessment_kind <> 'finding_detection'
     or proof_value.assessment_hash <> assessment_hash_value
     or proof_value.evidence_manifest_hash <> run_value.evidence_manifest_hash
     or proof_value.verdict <> 'passed'
     or proof_value.evaluator_identity <> 'cognitive_independent_evaluator'
     or proof_value.evaluator_proof_hash <> p_evaluator_proof_hash
     or proof_value.valid_until <= transaction_timestamp() then
    raise exception 'product_quality_detection_rejected' using errcode = 'P0001';
  end if;

  select * into finding_value
  from public.product_quality_findings finding
  where finding.finding_scope_hash = scope_hash_value
  for update;

  occurrence_value := coalesce(finding_value.occurrence_count, 0) + 1;
  event_type_value := case
    when finding_value.id is null then 'detected'
    else 'recurred'
  end;
  governance_status_value := case
    when p_reproduction_state = 'design_baseline_missing'
      then 'needs_product_baseline_review'
    else 'entered_collective_governance'
  end;
  event_hash_value := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|', scope_hash_value, run_value.id::text,
          proof_value.id::text, event_type_value, occurrence_value::text,
          assessment_hash_value
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.product_experience_sentinel_evaluator_proof_consumptions(
    evaluator_proof_id, task_id, project_id, platform, environment,
    event_hash, consumed_by_identity
  ) values (
    proof_value.id, run_value.task_id, run_value.project_id,
    run_value.platform, run_value.environment, event_hash_value,
    p_service_identity
  );

  if finding_value.id is null then
    insert into public.product_quality_findings(
      sentinel_run_id, task_id, project_id, platform, environment,
      finding_key, finding_class, finding_scope_hash, route_or_surface,
      build_runtime_hash, severity, user_impact_hash, evidence_hashes,
      suspected_layer, confidence, reproduction_state,
      affected_components_hash, provider_backend_state_hash,
      proposed_next_investigation_hash, physical_proof_status,
      governance_status, current_status, current_evaluator_proof_id
    ) values (
      run_value.id, run_value.task_id, run_value.project_id,
      run_value.platform, run_value.environment, finding_key_value,
      p_finding_class, scope_hash_value, p_route_or_surface,
      p_build_runtime_hash, p_severity, p_user_impact_hash,
      p_evidence_hashes, p_suspected_layer, p_confidence,
      p_reproduction_state, p_affected_components_hash,
      p_provider_backend_state_hash, p_proposed_next_investigation_hash,
      p_physical_proof_status, governance_status_value, 'open',
      proof_value.id
    )
    returning id into finding_id;
  else
    perform set_config(
      'app.cognitive_product_quality_state_write',
      'recurrence',
      true
    );
    update public.product_quality_findings
    set
      sentinel_run_id = run_value.id,
      build_runtime_hash = p_build_runtime_hash,
      last_seen_at = transaction_timestamp(),
      occurrence_count = occurrence_value,
      severity = p_severity,
      user_impact_hash = p_user_impact_hash,
      evidence_hashes = p_evidence_hashes,
      suspected_layer = p_suspected_layer,
      confidence = p_confidence,
      reproduction_state = p_reproduction_state,
      affected_components_hash = p_affected_components_hash,
      provider_backend_state_hash = p_provider_backend_state_hash,
      proposed_next_investigation_hash = p_proposed_next_investigation_hash,
      physical_proof_status = p_physical_proof_status,
      governance_status = governance_status_value,
      current_status = 'open',
      current_evaluator_proof_id = proof_value.id,
      resolved_at = null,
      resolution_hash = null
    where id = finding_value.id
    returning id into finding_id;
  end if;

  insert into public.product_quality_finding_events(
    finding_id, sentinel_run_id, evaluator_proof_id,
    task_id, project_id, platform, environment,
    finding_key, finding_class, finding_scope_hash, route_or_surface,
    event_type, occurrence_number, severity, reproduction_state,
    suspected_layer, confidence, assessment_hash, event_hash,
    evidence_hashes
  ) values (
    finding_id, run_value.id, proof_value.id, run_value.task_id,
    run_value.project_id, run_value.platform, run_value.environment,
    finding_key_value, p_finding_class, scope_hash_value,
    p_route_or_surface, event_type_value, occurrence_value,
    p_severity, p_reproduction_state, p_suspected_layer, p_confidence,
    assessment_hash_value, event_hash_value, p_evidence_hashes
  );

  return jsonb_build_object(
    'findingId', finding_id,
    'findingKey', finding_key_value,
    'eventType', event_type_value,
    'occurrenceCount', occurrence_value,
    'evaluatorProofId', proof_value.id,
    'governanceStatus', governance_status_value
  );
end;
$$;
revoke all on function public.product_quality_triage_detection(
  uuid,uuid,text,text,text,text,text,text,text[],text,numeric,text,
  text,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.product_quality_triage_detection(
  uuid,uuid,text,text,text,text,text,text,text[],text,numeric,text,
  text,text,text,text,text,text
) to service_role;

create function public.product_quality_triage_resolution(
  p_finding_id uuid,
  p_sentinel_run_id uuid,
  p_evaluator_proof_id uuid,
  p_evaluator_proof_hash text,
  p_resolution_reason_hash text,
  p_service_identity text,
  p_service_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability_id uuid;
  run_value public.product_experience_sentinel_runs%rowtype;
  finding_value public.product_quality_findings%rowtype;
  proof_value public.product_experience_sentinel_evaluator_proofs%rowtype;
  assessment_hash_value text;
  event_hash_value text;
begin
  select * into finding_value
  from public.product_quality_findings
  where id = p_finding_id
  for update;

  select * into run_value
  from public.product_experience_sentinel_runs
  where id = p_sentinel_run_id
  for share;

  if finding_value.id is null or run_value.id is null then
    raise exception 'product_quality_resolution_rejected' using errcode = 'P0001';
  end if;

  capability_id := public.cognitive_product_quality_assert_service_capability(
    p_service_identity, 'triage_product_quality', finding_value.task_id,
    finding_value.project_id, finding_value.platform,
    finding_value.environment, null, p_service_assertion
  );
  assessment_hash_value := public.product_quality_resolution_assessment_hash(
    finding_value.id, run_value.id, run_value.evidence_manifest_hash,
    p_resolution_reason_hash
  );

  select * into proof_value
  from public.product_experience_sentinel_evaluator_proofs
  where id = p_evaluator_proof_id
  for share;

  event_hash_value := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|', finding_value.finding_scope_hash, run_value.id::text,
          proof_value.id::text, 'resolved',
          finding_value.occurrence_count::text, assessment_hash_value
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if capability_id is null
     or p_service_identity <> 'cognitive_product_quality_triage'
     or finding_value.current_status <> 'open'
     or run_value.task_id <> finding_value.task_id
     or run_value.project_id <> finding_value.project_id
     or run_value.platform <> finding_value.platform
     or run_value.environment <> finding_value.environment
     or run_value.route_or_surface <> finding_value.route_or_surface
     or run_value.collector_capability_id is null
     or run_value.erased_at is not null
     or run_value.result_status <> 'passed'
     or run_value.evaluation_expires_at <= transaction_timestamp()
     or p_resolution_reason_hash !~ '^[a-f0-9]{64}$'
     or proof_value.id is null
     or proof_value.sentinel_run_id <> run_value.id
     or proof_value.assessment_kind <> 'finding_resolution'
     or proof_value.assessment_hash <> assessment_hash_value
     or proof_value.evidence_manifest_hash <> run_value.evidence_manifest_hash
     or proof_value.verdict <> 'passed'
     or proof_value.evaluator_identity <> 'cognitive_independent_evaluator'
     or proof_value.evaluator_proof_hash <> p_evaluator_proof_hash
     or proof_value.valid_until <= transaction_timestamp() then
    raise exception 'product_quality_resolution_rejected' using errcode = 'P0001';
  end if;

  insert into public.product_experience_sentinel_evaluator_proof_consumptions(
    evaluator_proof_id, task_id, project_id, platform, environment,
    event_hash, consumed_by_identity
  ) values (
    proof_value.id, finding_value.task_id, finding_value.project_id,
    finding_value.platform, finding_value.environment, event_hash_value,
    p_service_identity
  );

  perform set_config(
    'app.cognitive_product_quality_state_write',
    'resolution',
    true
  );
  update public.product_quality_findings
  set
    governance_status = 'resolved',
    current_status = 'resolved',
    current_evaluator_proof_id = proof_value.id,
    resolved_at = transaction_timestamp(),
    resolution_hash = p_resolution_reason_hash
  where id = finding_value.id;

  insert into public.product_quality_finding_events(
    finding_id, sentinel_run_id, evaluator_proof_id,
    task_id, project_id, platform, environment,
    finding_key, finding_class, finding_scope_hash, route_or_surface,
    event_type, occurrence_number, severity, reproduction_state,
    suspected_layer, confidence, assessment_hash, event_hash,
    evidence_hashes, resolution_hash
  ) values (
    finding_value.id, run_value.id, proof_value.id,
    finding_value.task_id, finding_value.project_id,
    finding_value.platform, finding_value.environment,
    finding_value.finding_key, finding_value.finding_class,
    finding_value.finding_scope_hash, finding_value.route_or_surface,
    'resolved', finding_value.occurrence_count, finding_value.severity,
    finding_value.reproduction_state, finding_value.suspected_layer,
    finding_value.confidence, assessment_hash_value, event_hash_value,
    array[run_value.evidence_manifest_hash], p_resolution_reason_hash
  );

  return jsonb_build_object(
    'findingId', finding_value.id,
    'findingKey', finding_value.finding_key,
    'eventType', 'resolved',
    'occurrenceCount', finding_value.occurrence_count,
    'evaluatorProofId', proof_value.id,
    'governanceStatus', 'resolved'
  );
end;
$$;
revoke all on function public.product_quality_triage_resolution(
  uuid,uuid,uuid,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.product_quality_triage_resolution(
  uuid,uuid,uuid,text,text,text,text
) to service_role;

comment on table public.cognitive_product_quality_service_capabilities is
  'Owner-registered, expiring, exact-scope collector/triage verifier records; assertion material is never stored.';
comment on table public.product_experience_sentinel_evaluator_proofs is
  'Immutable independent-evaluator decisions over exact sentinel assessment hashes.';
comment on table public.product_quality_finding_events is
  'Immutable detection, atomic recurrence, and resolution history for deterministic product findings.';
comment on function public.product_experience_collect_sentinel_run(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,
  timestamptz,text,text,text
) is
  'Collector-only bounded non-personal sentinel persistence; cannot create findings, enable switches, or mutate products.';
comment on function public.product_quality_triage_detection(
  uuid,uuid,text,text,text,text,text,text,text[],text,numeric,text,
  text,text,text,text,text,text
) is
  'Triage-only deterministic current finding plus immutable event; requires one unexpired passing independent-evaluator proof.';
comment on function public.product_quality_require_evaluator_for_collected_run()
  is 'Table-boundary guard preventing every legacy or future RPC from creating an operational collector finding without a matching passing evaluator proof.';
