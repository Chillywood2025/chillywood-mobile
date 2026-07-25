-- Forward-only closure for the reviewed route-timing no-finding P2.
--
-- A route that merely rendered inside ten seconds is not a healthy-route
-- attestation. The canonical contract below binds one passed installed run to
-- its exact app/runtime, route family, monotonic stages, terminal state,
-- interaction evidence, and sanitized evidence hash. The independent proof
-- must then be consumed by the triage principal into an immutable no-finding
-- disposition before the run can satisfy scheduler readiness.

create function public.product_experience_route_family_binding_hash(
  p_platform public.cognitive_platform,
  p_route_or_surface text,
  p_route_family_id text
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
          'domain', 'product-route-family-binding-v1',
          'platform', p_platform,
          'routeOrSurface', p_route_or_surface,
          'routeFamilyId', p_route_family_id
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

revoke all on function
  public.product_experience_route_family_binding_hash(
    public.cognitive_platform,text,text
  )
from public,anon,authenticated,service_role;

create or replace function
  public.product_experience_route_timing_no_finding_is_valid(
    p_metric_manifest jsonb
  )
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  metrics jsonb;
  navigation_started numeric;
  first_rendered numeric;
  first_interactive numeric;
  resolved_at numeric;
  elapsed_duration numeric;
  maximum_duration numeric;
  route_value text;
  route_family_id_value text;
begin
  if jsonb_typeof(p_metric_manifest) <> 'object'
     or p_metric_manifest->>'observationKind' <> 'route_timing'
     or jsonb_typeof(p_metric_manifest->'metrics') <> 'object'
     or jsonb_typeof(p_metric_manifest->'evidenceHashes') <> 'array'
     or jsonb_array_length(p_metric_manifest->'evidenceHashes')
       not between 1 and 32
     or exists (
       select 1
       from jsonb_array_elements(
         p_metric_manifest->'evidenceHashes'
       ) evidence_hash
       where jsonb_typeof(evidence_hash) <> 'string'
          or trim(both '"' from evidence_hash::text) !~ '^[a-f0-9]{64}$'
     ) then
    return false;
  end if;

  metrics := p_metric_manifest->'metrics';
  if not metrics ?& array[
       'appVersion','appBuild','runtimeVersion','channel',
       'platform','routeOrSurface','routeFamilyId',
       'routeFamilyBindingHash','runtimeIdentityHash','buildRuntimeHash',
       'syntheticAccount','networkReadyBeforeNavigation','networkState',
       'navigationStartMonotonicMs','firstRenderedMonotonicMs',
       'firstInteractiveMonotonicMs','resolvedStateMonotonicMs',
       'resolutionKind','finalObservedState','reviewedErrorState',
       'unresolvedStateCount','timeoutObserved','maximumDurationMs',
       'elapsedDurationMs','interactionEvidenceKind',
       'interactionEvidenceHash','sanitizedEvidenceHash',
       'installedProofStatus','findingDisposition'
     ] then
    return false;
  end if;

  if jsonb_typeof(metrics->'appVersion') <> 'string'
     or metrics->>'appVersion' !~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$'
     or jsonb_typeof(metrics->'appBuild') <> 'string'
     or metrics->>'appBuild' !~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$'
     or jsonb_typeof(metrics->'runtimeVersion') <> 'string'
     or metrics->>'runtimeVersion' !~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$'
     or jsonb_typeof(metrics->'channel') <> 'string'
     or metrics->>'channel' !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     or metrics->>'platform' not in ('android','ios','web')
     or jsonb_typeof(metrics->'routeOrSurface') <> 'string'
     or length(metrics->>'routeOrSurface') not between 1 and 160
     or public.cognitive_text_has_secret(metrics->>'routeOrSurface')
     or public.cognitive_text_has_private_identifier(
       metrics->>'routeOrSurface'
     )
     or jsonb_typeof(metrics->'routeFamilyId') <> 'string'
     or metrics->>'routeFamilyId' !~
       '^[a-z0-9][a-z0-9._/-]{1,79}$'
     or metrics->>'routeFamilyBindingHash' !~ '^[a-f0-9]{64}$'
     or metrics->>'runtimeIdentityHash' !~ '^[a-f0-9]{64}$'
     or metrics->>'buildRuntimeHash' !~ '^[a-f0-9]{64}$'
     or metrics->>'interactionEvidenceHash' !~ '^[a-f0-9]{64}$'
     or metrics->>'sanitizedEvidenceHash' !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(metrics->'syntheticAccount') <> 'boolean'
     or metrics->'syntheticAccount' <> 'true'::jsonb
     or jsonb_typeof(metrics->'networkReadyBeforeNavigation') <> 'boolean'
     or metrics->'networkReadyBeforeNavigation' <> 'true'::jsonb
     or metrics->>'networkState' <> 'ready'
     or jsonb_typeof(metrics->'reviewedErrorState') <> 'boolean'
     or jsonb_typeof(metrics->'timeoutObserved') <> 'boolean'
     or metrics->'timeoutObserved' <> 'false'::jsonb
     or jsonb_typeof(metrics->'unresolvedStateCount') <> 'number'
     or (metrics->>'unresolvedStateCount')::numeric <> 0
     or metrics->>'resolutionKind' not in (
       'content_state','empty_state','reviewed_error_state'
     )
     or metrics->>'finalObservedState' not in (
       'content_loaded','empty_state','reviewed_error_state'
     )
     or (
       (metrics->>'resolutionKind' = 'content_state'
        and metrics->>'finalObservedState' <> 'content_loaded')
       or
       (metrics->>'resolutionKind' = 'empty_state'
        and metrics->>'finalObservedState' <> 'empty_state')
       or
       (metrics->>'resolutionKind' = 'reviewed_error_state'
        and metrics->>'finalObservedState' <> 'reviewed_error_state')
     )
     or (
       (metrics->>'resolutionKind' = 'reviewed_error_state')
       is distinct from (metrics->'reviewedErrorState' = 'true'::jsonb)
     )
     or metrics->>'interactionEvidenceKind' not in (
       'accessibility_tree','direct_interaction','both'
     )
     or metrics->>'installedProofStatus' not in (
       'installed_ui_observed','simulator_observed'
     )
     or metrics->>'findingDisposition' <> 'no_finding'
     or jsonb_typeof(metrics->'navigationStartMonotonicMs') <> 'number'
     or jsonb_typeof(metrics->'firstRenderedMonotonicMs') <> 'number'
     or jsonb_typeof(metrics->'firstInteractiveMonotonicMs') <> 'number'
     or jsonb_typeof(metrics->'resolvedStateMonotonicMs') <> 'number'
     or jsonb_typeof(metrics->'maximumDurationMs') <> 'number'
     or jsonb_typeof(metrics->'elapsedDurationMs') <> 'number' then
    return false;
  end if;

  navigation_started :=
    (metrics->>'navigationStartMonotonicMs')::numeric;
  first_rendered := (metrics->>'firstRenderedMonotonicMs')::numeric;
  first_interactive :=
    (metrics->>'firstInteractiveMonotonicMs')::numeric;
  resolved_at := (metrics->>'resolvedStateMonotonicMs')::numeric;
  maximum_duration := (metrics->>'maximumDurationMs')::numeric;
  elapsed_duration := (metrics->>'elapsedDurationMs')::numeric;

  if navigation_started < 0
     or navigation_started > 1000000000000000
     or first_rendered < navigation_started
     or first_interactive < first_rendered
     or resolved_at < first_interactive
     or resolved_at > 1000000000000000
     or maximum_duration not between 1 and 10000
     or elapsed_duration < 0
     or elapsed_duration > maximum_duration
     or resolved_at - navigation_started <> elapsed_duration then
    return false;
  end if;

  route_value := metrics->>'routeOrSurface';
  route_family_id_value := metrics->>'routeFamilyId';
  return metrics->>'routeFamilyBindingHash' =
    public.product_experience_route_family_binding_hash(
      (metrics->>'platform')::public.cognitive_platform,
      route_value,
      route_family_id_value
    );
exception
  when others then
    return false;
end;
$$;

revoke all on function
  public.product_experience_route_timing_no_finding_is_valid(jsonb)
from public,anon,authenticated,service_role;

create function
  public.product_experience_route_timing_no_finding_binding_is_valid(
    p_platform public.cognitive_platform,
    p_route_or_surface text,
    p_runtime_identity_hash text,
    p_source_build_hash text,
    p_evidence_manifest_hash text,
    p_physical_proof_status text,
    p_metric_manifest jsonb
  )
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when not
      public.product_experience_route_timing_no_finding_is_valid(
        p_metric_manifest
      )
      then false
    else
      p_metric_manifest->'metrics'->>'platform' = p_platform::text
      and p_metric_manifest->'metrics'->>'routeOrSurface' =
        p_route_or_surface
      and p_metric_manifest->'metrics'->>'runtimeIdentityHash' =
        p_runtime_identity_hash
      and p_metric_manifest->'metrics'->>'buildRuntimeHash' =
        p_source_build_hash
      and p_metric_manifest->'metrics'->>'sanitizedEvidenceHash' =
        p_evidence_manifest_hash
      and p_metric_manifest->'metrics'->>'installedProofStatus' =
        p_physical_proof_status
      and exists (
        select 1
        from jsonb_array_elements_text(
          p_metric_manifest->'evidenceHashes'
        ) evidence_hash(value)
        where evidence_hash.value = p_evidence_manifest_hash
      )
  end
$$;

revoke all on function
  public.product_experience_route_timing_no_finding_binding_is_valid(
    public.cognitive_platform,text,text,text,text,text,jsonb
  )
from public,anon,authenticated,service_role;

create or replace function public.product_experience_metric_manifest_is_bounded(
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
    and (
      public.cognitive_json_is_sanitized(p_metric_manifest)
      or (
        public.product_experience_route_timing_no_finding_is_valid(
          p_metric_manifest
        )
        and public.cognitive_json_is_sanitized(
          jsonb_set(
            p_metric_manifest,
            '{metrics}',
            (p_metric_manifest->'metrics')
              - 'appVersion'
              - 'appBuild'
              - 'runtimeVersion'
              - 'channel'
          )
        )
      )
    )
    and p_metric_manifest->>'schemaVersion' = 'product-sentinel-v1'
    and p_metric_manifest->>'sanitizationVersion' =
      'bounded-nonpersonal-v1'
    and jsonb_typeof(p_metric_manifest->'observationKind') = 'string'
    and jsonb_typeof(p_metric_manifest->'metrics') = 'object'
    and (
      select count(*)
      from jsonb_object_keys(p_metric_manifest->'metrics')
    ) between 1 and 64
    and pg_column_size(p_metric_manifest->'metrics') <= 49152
    and jsonb_typeof(p_metric_manifest->'evidenceHashes') = 'array'
    and jsonb_array_length(p_metric_manifest->'evidenceHashes')
      between 1 and 32
    and not exists (
      select 1
      from jsonb_array_elements(
        p_metric_manifest->'evidenceHashes'
      ) item
      where jsonb_typeof(item) <> 'string'
        or trim(both '"' from item::text) !~ '^[a-f0-9]{64}$'
    )
    and exists (
      select 1
      from jsonb_array_elements_text(
        p_metric_manifest->'evidenceHashes'
      ) item(value)
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
    end
$$;

revoke all on function
  public.product_experience_metric_manifest_is_bounded(text,text,jsonb)
from public,anon,authenticated,service_role;

alter table public.product_experience_sentinel_runs
  drop constraint product_experience_sentinel_runs_metric_manifest_check;
alter table public.product_experience_sentinel_runs
  add constraint product_experience_sentinel_runs_metric_manifest_check
  check (
    jsonb_typeof(metric_manifest) = 'object'
    and pg_column_size(metric_manifest) <= 65536
    and (
      public.cognitive_json_is_sanitized(metric_manifest)
      or (
        public.product_experience_route_timing_no_finding_is_valid(
          metric_manifest
        )
        and public.cognitive_json_is_sanitized(
          jsonb_set(
            metric_manifest,
            '{metrics}',
            (metric_manifest->'metrics')
              - 'appVersion'
              - 'appBuild'
              - 'runtimeVersion'
              - 'channel'
          )
        )
      )
    )
  );

create function
  public.product_experience_require_rich_route_timing_no_finding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.result_status = 'passed'
     and new.metric_manifest->>'observationKind' = 'route_timing'
     and not
       public.product_experience_route_timing_no_finding_binding_is_valid(
         new.platform,
         new.route_or_surface,
         new.runtime_identity_hash,
         new.source_build_hash,
         new.evidence_manifest_hash,
         new.physical_proof_status,
         new.metric_manifest
       ) then
    raise exception 'product_experience_route_timing_no_finding_rejected'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function
  public.product_experience_require_rich_route_timing_no_finding()
from public,anon,authenticated,service_role;

create trigger product_experience_rich_route_timing_no_finding_required
before insert or update of
  metric_manifest,result_status,platform,route_or_surface,
  runtime_identity_hash,source_build_hash,evidence_manifest_hash,
  physical_proof_status
on public.product_experience_sentinel_runs
for each row
execute function
  public.product_experience_require_rich_route_timing_no_finding();

create or replace function public.product_quality_no_finding_assessment_hash(
  p_sentinel_run_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'domain', 'product-sentinel-run-no-finding-v1',
          'sentinelRunId', run.id,
          'taskId', run.task_id,
          'projectId', run.project_id,
          'platform', run.platform,
          'environment', run.environment,
          'sentinelKey', run.sentinel_key,
          'routeOrSurface', run.route_or_surface,
          'runtimeIdentityHash', run.runtime_identity_hash,
          'sourceBuildHash', run.source_build_hash,
          'evidenceManifestHash', run.evidence_manifest_hash,
          'metricManifestHash', encode(
            extensions.digest(
              convert_to(run.metric_manifest::text, 'UTF8'),
              'sha256'
            ),
            'hex'
          ),
          'resultStatus', run.result_status,
          'physicalProofStatus', run.physical_proof_status,
          'collectorCapabilityId', run.collector_capability_id,
          'observationStartedAt', run.observation_started_at,
          'observationFinishedAt', run.observation_finished_at,
          'evaluationExpiresAt', run.evaluation_expires_at
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from public.product_experience_sentinel_runs run
  where run.id = p_sentinel_run_id
    and run.result_status = 'passed'
    and run.physical_proof_status in (
      'installed_ui_observed',
      'simulator_observed'
    )
    and run.collector_capability_id is not null
    and run.erased_at is null
    and (
      run.metric_manifest->>'observationKind' <> 'route_timing'
      or
        public.product_experience_route_timing_no_finding_binding_is_valid(
          run.platform,
          run.route_or_surface,
          run.runtime_identity_hash,
          run.source_build_hash,
          run.evidence_manifest_hash,
          run.physical_proof_status,
          run.metric_manifest
        )
    )
$$;

revoke all on function
  public.product_quality_no_finding_assessment_hash(uuid)
from public,anon,authenticated,service_role;

create table public.product_experience_sentinel_no_finding_events (
  id uuid primary key default gen_random_uuid(),
  sentinel_run_id uuid not null unique,
  evaluator_proof_id uuid not null unique,
  proof_consumption_id uuid not null unique,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  route_or_surface text not null check (
    length(route_or_surface) between 1 and 160
    and not public.cognitive_text_has_secret(route_or_surface)
    and not public.cognitive_text_has_private_identifier(route_or_surface)
  ),
  route_family_binding_hash text not null check (
    route_family_binding_hash ~ '^[a-f0-9]{64}$'
  ),
  disposition text not null check (disposition = 'no_finding'),
  finding_id uuid check (finding_id is null),
  assessment_hash text not null check (
    assessment_hash ~ '^[a-f0-9]{64}$'
  ),
  evidence_manifest_hash text not null check (
    evidence_manifest_hash ~ '^[a-f0-9]{64}$'
  ),
  event_hash text not null unique check (event_hash ~ '^[a-f0-9]{64}$'),
  consumed_by_identity text not null check (
    consumed_by_identity = 'cognitive_product_quality_triage'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  foreign key (
    sentinel_run_id,task_id,project_id,platform,environment
  ) references public.product_experience_sentinel_runs(
    id,task_id,project_id,platform,environment
  ),
  foreign key (
    evaluator_proof_id,task_id,project_id,platform,environment
  ) references public.product_experience_sentinel_evaluator_proofs(
    id,task_id,project_id,platform,environment
  ),
  foreign key (proof_consumption_id)
    references
      public.product_experience_sentinel_evaluator_proof_consumptions(id)
);

alter table public.product_experience_sentinel_no_finding_events
  enable row level security;
alter table public.product_experience_sentinel_no_finding_events
  force row level security;
revoke all on table
  public.product_experience_sentinel_no_finding_events
from public,anon,authenticated,service_role;
grant select on table
  public.product_experience_sentinel_no_finding_events
to service_role;

create trigger product_experience_sentinel_no_finding_events_immutable
before update or delete
on public.product_experience_sentinel_no_finding_events
for each row execute function public.reject_cognitive_evidence_mutation();

create function public.product_quality_triage_no_finding(
  p_sentinel_run_id uuid,
  p_evaluator_proof_id uuid,
  p_evaluator_proof_hash text,
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
  consumption_id uuid;
  event_id uuid;
  event_hash_value text;
  route_family_binding_hash_value text;
begin
  select * into run_value
  from public.product_experience_sentinel_runs
  where id = p_sentinel_run_id
  for share;

  if run_value.id is null then
    raise exception 'product_quality_no_finding_triage_rejected'
      using errcode = 'P0001';
  end if;

  capability_id := public.cognitive_product_quality_assert_service_capability(
    p_service_identity,
    'triage_product_quality',
    run_value.task_id,
    run_value.project_id,
    run_value.platform,
    run_value.environment,
    null,
    p_service_assertion
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(run_value.id::text, 0)
  );

  select * into proof_value
  from public.product_experience_sentinel_evaluator_proofs
  where id = p_evaluator_proof_id
  for share;

  route_family_binding_hash_value :=
    run_value.metric_manifest->'metrics'->>'routeFamilyBindingHash';

  if capability_id is null
     or p_service_identity <> 'cognitive_product_quality_triage'
     or run_value.result_status <> 'passed'
     or run_value.collector_capability_id is null
     or run_value.erased_at is not null
     or run_value.evaluation_expires_at <= transaction_timestamp()
     or not
       public.product_experience_route_timing_no_finding_binding_is_valid(
         run_value.platform,
         run_value.route_or_surface,
         run_value.runtime_identity_hash,
         run_value.source_build_hash,
         run_value.evidence_manifest_hash,
         run_value.physical_proof_status,
         run_value.metric_manifest
       )
     or proof_value.id is null
     or proof_value.sentinel_run_id <> run_value.id
     or proof_value.task_id <> run_value.task_id
     or proof_value.project_id <> run_value.project_id
     or proof_value.platform <> run_value.platform
     or proof_value.environment <> run_value.environment
     or proof_value.assessment_kind <> 'run_no_finding'
     or proof_value.assessment_hash <>
       public.product_quality_no_finding_assessment_hash(run_value.id)
     or proof_value.evidence_manifest_hash <>
       run_value.evidence_manifest_hash
     or proof_value.verdict <> 'passed'
     or proof_value.evaluator_identity not in (
       'cognitive_independent_evaluator',
       'cognitive_product_quality_evaluator'
     )
     or proof_value.evaluator_proof_hash <> p_evaluator_proof_hash
     or proof_value.valid_until <= transaction_timestamp()
     or exists (
       select 1
       from public.product_quality_findings finding
       where finding.sentinel_run_id = run_value.id
         and finding.erased_at is null
     )
     or not public.governance_task_writes_allowed(
       run_value.task_id,
       run_value.project_id,
       run_value.platform,
       run_value.environment
     ) then
    raise exception 'product_quality_no_finding_triage_rejected'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.product_experience_sentinel_no_finding_events event
    where event.sentinel_run_id = run_value.id
       or event.evaluator_proof_id = proof_value.id
  ) then
    raise exception 'product_quality_no_finding_triage_replay_rejected'
      using errcode = 'P0001';
  end if;

  event_hash_value := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'domain', 'product-sentinel-no-finding-event-v1',
          'sentinelRunId', run_value.id,
          'evaluatorProofId', proof_value.id,
          'assessmentHash', proof_value.assessment_hash,
          'evidenceManifestHash', run_value.evidence_manifest_hash,
          'routeFamilyBindingHash', route_family_binding_hash_value,
          'disposition', 'no_finding'
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into
    public.product_experience_sentinel_evaluator_proof_consumptions(
      evaluator_proof_id,task_id,project_id,platform,environment,
      event_hash,consumed_by_identity
    )
  values (
    proof_value.id,run_value.task_id,run_value.project_id,
    run_value.platform,run_value.environment,event_hash_value,
    p_service_identity
  )
  returning id into consumption_id;

  insert into public.product_experience_sentinel_no_finding_events(
    sentinel_run_id,evaluator_proof_id,proof_consumption_id,
    task_id,project_id,platform,environment,route_or_surface,
    route_family_binding_hash,disposition,finding_id,assessment_hash,
    evidence_manifest_hash,event_hash,consumed_by_identity
  )
  values (
    run_value.id,proof_value.id,consumption_id,
    run_value.task_id,run_value.project_id,run_value.platform,
    run_value.environment,run_value.route_or_surface,
    route_family_binding_hash_value,'no_finding',null,
    proof_value.assessment_hash,run_value.evidence_manifest_hash,
    event_hash_value,p_service_identity
  )
  returning id into event_id;

  return jsonb_build_object(
    'sentinelRunId', run_value.id,
    'evaluatorProofId', proof_value.id,
    'proofConsumptionId', consumption_id,
    'noFindingEventId', event_id,
    'disposition', 'no_finding',
    'eventHash', event_hash_value
  );
end;
$$;

revoke all on function public.product_quality_triage_no_finding(
  uuid,uuid,text,text,text
) from public,anon,authenticated;
grant execute on function public.product_quality_triage_no_finding(
  uuid,uuid,text,text,text
) to service_role;

create function cognitive_runtime.product_quality_triage_no_finding(
  p_sentinel_run_id uuid,
  p_evaluator_proof_id uuid,
  p_evaluator_proof_hash text,
  p_service_identity text,
  p_service_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_request_role text :=
    current_setting('request.jwt.claim.role', true);
  result_value jsonb;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_product_quality_triage',
    'triage_no_finding'
  );
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    result_value := public.product_quality_triage_no_finding(
      p_sentinel_run_id,
      p_evaluator_proof_id,
      p_evaluator_proof_hash,
      p_service_identity,
      p_service_assertion
    );
  exception
    when others then
      perform set_config(
        'request.jwt.claim.role',
        coalesce(prior_request_role, ''),
        true
      );
      raise;
  end;
  perform set_config(
    'request.jwt.claim.role',
    coalesce(prior_request_role, ''),
    true
  );
  return result_value;
end;
$$;

revoke all on function cognitive_runtime.product_quality_triage_no_finding(
  uuid,uuid,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function
  cognitive_runtime.product_quality_triage_no_finding(
    uuid,uuid,text,text,text
  )
to cognitive_product_quality_triage;

create or replace function cognitive_runtime.runtime_operation_allowed(
  p_principal text,
  p_operation text
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select (p_principal, p_operation) in (
    ('cognitive_product_baseline_executor', 'claim_approved_action'),
    ('cognitive_product_baseline_executor', 'begin_approved_execution'),
    ('cognitive_product_baseline_executor', 'stage_product_baseline'),
    ('cognitive_product_baseline_executor', 'complete_approved_execution'),
    ('cognitive_product_baseline_executor', 'persist_product_baseline'),
    ('cognitive_product_baseline_executor', 'fail_approved_execution'),
    ('cognitive_sentinel_collector', 'collect_sentinel_run'),
    ('cognitive_product_quality_evaluator', 'read_active_baseline'),
    ('cognitive_product_quality_evaluator', 'compute_detection_hash'),
    ('cognitive_product_quality_evaluator', 'compute_no_finding_hash'),
    ('cognitive_product_quality_evaluator', 'compute_resolution_hash'),
    ('cognitive_product_quality_evaluator', 'evaluate_product_baseline'),
    ('cognitive_product_quality_evaluator', 'record_sentinel_evaluator_proof'),
    ('cognitive_product_quality_evaluator', 'read_product_quality_snapshot'),
    ('cognitive_product_quality_triage', 'triage_detection'),
    ('cognitive_product_quality_triage', 'triage_no_finding'),
    ('cognitive_product_quality_triage', 'triage_resolution'),
    ('cognitive_public_research_broker', 'record_research_source'),
    ('cognitive_public_research_broker', 'record_research_claim'),
    ('cognitive_public_research_broker', 'detect_research_contradiction'),
    ('cognitive_public_research_broker', 'expire_research'),
    ('cognitive_research_evaluator', 'derive_research_evaluation'),
    ('cognitive_research_evaluator', 'resolve_research_contradiction'),
    ('cognitive_research_evaluator', 'read_research_snapshot'),
    ('cognitive_model_router', 'recover_model_reservation'),
    ('cognitive_model_router', 'reserve_model_invocation'),
    ('cognitive_model_router', 'record_model_provider_overrun'),
    ('cognitive_model_router', 'settle_model_invocation'),
    (
      'cognitive_livekit_experience_collector',
      'collect_livekit_sentinel_run'
    ),
    (
      'cognitive_github_draft_pr_broker',
      'record_github_provider_readback'
    ),
    (
      'cognitive_github_draft_pr_broker',
      'consume_github_capability'
    ),
    (
      'cognitive_github_draft_pr_broker',
      'accept_github_tool_result'
    ),
    ('cognitive_level01_scheduler', 'read_scheduler_status'),
    ('cognitive_level01_scheduler', 'issue_recurring_child_task')
  )
$$;

revoke all on function
  cognitive_runtime.runtime_operation_allowed(text,text)
from public,anon,authenticated,service_role;

create or replace function
  public.product_experience_scheduler_evaluation_is_ready(
    p_sentinel_run_id uuid
  )
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.product_experience_sentinel_runs run
    join public.product_experience_sentinel_evaluator_proofs proof
      on proof.sentinel_run_id = run.id
     and proof.task_id = run.task_id
     and proof.project_id = run.project_id
     and proof.platform = run.platform
     and proof.environment = run.environment
    where run.id = p_sentinel_run_id
      and run.result_status in ('passed', 'failed')
      and run.erased_at is null
      and run.observation_finished_at is not null
      and run.observation_finished_at between
        transaction_timestamp() - interval '7 days'
        and transaction_timestamp()
      and run.evaluation_expires_at > transaction_timestamp()
      and proof.verdict = 'passed'
      and proof.evaluator_identity in (
        'cognitive_independent_evaluator',
        'cognitive_product_quality_evaluator'
      )
      and proof.evidence_manifest_hash = run.evidence_manifest_hash
      and proof.created_at between
        transaction_timestamp() - interval '7 days'
        and transaction_timestamp()
      and proof.valid_until > transaction_timestamp()
      and (
        (
          run.result_status = 'passed'
          and proof.assessment_kind = 'run_no_finding'
          and proof.assessment_hash =
            public.product_quality_no_finding_assessment_hash(run.id)
          and (
            run.metric_manifest->>'observationKind' <> 'route_timing'
            or exists (
              select 1
              from public.product_experience_sentinel_no_finding_events
                no_finding_event
              join
                public.product_experience_sentinel_evaluator_proof_consumptions
                  consumption
                on consumption.id =
                  no_finding_event.proof_consumption_id
               and consumption.evaluator_proof_id = proof.id
               and consumption.task_id = run.task_id
               and consumption.project_id = run.project_id
               and consumption.platform = run.platform
               and consumption.environment = run.environment
               and consumption.event_hash = no_finding_event.event_hash
               and consumption.consumed_by_identity =
                 'cognitive_product_quality_triage'
              where no_finding_event.sentinel_run_id = run.id
                and no_finding_event.evaluator_proof_id = proof.id
                and no_finding_event.task_id = run.task_id
                and no_finding_event.project_id = run.project_id
                and no_finding_event.platform = run.platform
                and no_finding_event.environment = run.environment
                and no_finding_event.disposition = 'no_finding'
                and no_finding_event.finding_id is null
                and no_finding_event.assessment_hash =
                  proof.assessment_hash
                and no_finding_event.evidence_manifest_hash =
                  run.evidence_manifest_hash
            )
          )
        )
        or (
          run.result_status = 'failed'
          and proof.assessment_kind = 'finding_detection'
          and exists (
            select 1
            from
              public.product_experience_sentinel_evaluator_proof_consumptions
                consumption
            join public.product_quality_finding_events event
              on event.evaluator_proof_id = proof.id
             and event.sentinel_run_id = run.id
             and event.task_id = run.task_id
             and event.project_id = run.project_id
             and event.platform = run.platform
             and event.environment = run.environment
             and event.event_type in ('detected', 'recurred')
             and event.event_hash = consumption.event_hash
             and event.assessment_hash = proof.assessment_hash
             and run.evidence_manifest_hash = any(event.evidence_hashes)
            join public.product_quality_findings finding
              on finding.id = event.finding_id
             and finding.task_id = event.task_id
             and finding.project_id = event.project_id
             and finding.platform = event.platform
             and finding.environment = event.environment
             and finding.finding_key = event.finding_key
             and finding.finding_scope_hash = event.finding_scope_hash
             and finding.route_or_surface = event.route_or_surface
             and finding.erased_at is null
            where consumption.evaluator_proof_id = proof.id
              and consumption.task_id = run.task_id
              and consumption.project_id = run.project_id
              and consumption.platform = run.platform
              and consumption.environment = run.environment
              and consumption.consumed_by_identity =
                'cognitive_product_quality_triage'
          )
        )
      )
  )
$$;

revoke all on function
  public.product_experience_scheduler_evaluation_is_ready(uuid)
from public,anon,authenticated,service_role;

comment on function
  public.product_experience_route_timing_no_finding_is_valid(jsonb)
is
  'Canonical rich route-timing no-finding schema with monotonic stage, terminal-state, interaction-evidence, and exact route-family binding requirements.';
comment on table
  public.product_experience_sentinel_no_finding_events
is
  'Immutable triage consumption event linking one passed route-timing run to one independent no-finding proof and explicitly to no finding.';
