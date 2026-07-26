-- Forward-only closure for the evaluated-sentinel scheduler boundary.
--
-- A failed sentinel run becomes schedule-ready only after the independent
-- detection proof has been consumed by the triage principal into an immutable
-- detected/recurred event and a non-erased governed finding. A passed run must
-- carry the database-derived run_no_finding proof. Both the read-only scheduler
-- snapshot and the authoritative issuance trigger use this one predicate.

create function public.product_experience_scheduler_evaluation_is_ready(
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
  public.product_experience_scheduler_evaluation_is_ready(uuid)
is
  'Canonical schedule-readiness predicate: passed runs require an exact database-bound no-finding proof; failed runs require immutable triage consumption, detected/recurred event, and a non-erased governed finding.';

create or replace function public.cognitive_level01_schedule_prerequisites_pass(
  p_schedule_definition_id uuid,
  p_parent_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  schedule_key_value text;
  base_pass boolean;
  exact_draft_canary_count integer;
begin
  base_pass:=public.cognitive_level01_schedule_prerequisites_base(
    p_schedule_definition_id,p_parent_task_id,p_project_id,
    p_platform,p_environment
  );
  if not coalesce(base_pass,false) then
    return false;
  end if;

  select schedule.schedule_key into schedule_key_value
  from public.cognitive_level01_schedule_definitions schedule
  where schedule.id=p_schedule_definition_id
    and schedule.task_id=p_parent_task_id
    and schedule.project_id=p_project_id
    and schedule.platform=p_platform
    and schedule.environment=p_environment;

  if schedule_key_value='weekly_ux_route_dead_control' then
    return (
      select count(distinct run.sentinel_key)=2
      from public.product_experience_sentinel_runs run
      join public.cognitive_product_sentinel_platform_scopes sentinel_scope
        on sentinel_scope.platform_task_id=run.task_id
       and sentinel_scope.project_id=run.project_id
       and sentinel_scope.platform=run.platform
       and sentinel_scope.environment=run.environment
      join public.cognitive_governance_switches sentinel_switch
        on sentinel_switch.task_id=run.task_id
       and sentinel_switch.project_id=run.project_id
       and sentinel_switch.platform=run.platform
       and sentinel_switch.environment=run.environment
       and sentinel_switch.switch_key=case run.sentinel_key
         when 'installed_journey_sentinel'
           then 'cognitive_installed_journey_sentinel_enabled'
         when 'visual_product_experience_sentinel'
           then 'cognitive_visual_experience_sentinel_enabled'
         else null
       end
       and sentinel_switch.enabled
      where run.project_id=p_project_id
        and sentinel_scope.shared_task_id=p_parent_task_id
        and run.platform in ('android','ios')
        and run.environment=p_environment
        and run.sentinel_key in (
          'installed_journey_sentinel',
          'visual_product_experience_sentinel'
        )
        and run.observation_finished_at between
          transaction_timestamp()-interval '7 days'
          and transaction_timestamp()
        and public.product_experience_scheduler_evaluation_is_ready(run.id)
    );
  end if;

  if schedule_key_value<>'weekly_experiment_outcome' then
    return true;
  end if;

  select count(distinct run.canary_key)
  into exact_draft_canary_count
  from public.cognitive_level01_canary_runs run
  where run.task_id=p_parent_task_id
    and run.project_id=p_project_id
    and run.platform=p_platform
    and run.environment=p_environment
    and run.canary_type='draft_pr'
    and run.canary_key in (
      'documentation_draft_pr',
      'test_only_draft_pr',
      'low_risk_source_draft_pr'
    )
    and run.result_status='passed'
    and run.evaluator_state='pass'
    and run.completed_at>=transaction_timestamp()-interval '30 days'
    and run.completed_at<=transaction_timestamp();

  return exact_draft_canary_count=3;
end;
$$;

revoke all on function public.cognitive_level01_schedule_prerequisites_pass(
  uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment
) from public,anon,authenticated,service_role;

do $patch_scheduler_snapshot_with_canonical_evaluation$
declare
  target regprocedure :=
    'cognitive_runtime.scheduler_prerequisite_snapshot(uuid,uuid,text,text)'::regprocedure;
  definition text := pg_catalog.pg_get_functiondef(target);
  needle constant text := 'and proof.verdict = ''passed''';
  replacement constant text :=
    $replacement$
      and proof.verdict = 'passed'
      and public.product_experience_scheduler_evaluation_is_ready(run.id)
    $replacement$;
begin
  if (
    length(definition) - length(replace(definition, needle, ''))
  ) / length(needle) <> 1 then
    raise exception 'scheduler_canonical_evaluation_patch_rejected'
      using errcode = 'P0001';
  end if;
  execute replace(definition, needle, replacement);
end;
$patch_scheduler_snapshot_with_canonical_evaluation$;

create or replace function
  public.product_experience_enforce_objective_accessibility_run_binding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.metric_manifest->>'observationKind' = 'touch_target'
     and (
       (
         new.route_or_surface = 'Home main tab'
         and (
           new.metric_manifest->'metrics'->>'routeFamilyMappingId'
             is distinct from 'home_main_tab_navigation_control'
           or new.metric_manifest->'metrics'->>'componentIdentityHash'
             is distinct from
               'b6b6e64a3375935b849019fbeedd8fd07f02e7a76e938aea3b6e1a0189a7fddc'
         )
       )
       or (
         new.metric_manifest->'metrics'->>'routeFamilyMappingId' =
           'home_main_tab_navigation_control'
         and (
           new.route_or_surface is distinct from 'Home main tab'
           or new.metric_manifest->'metrics'->>'componentIdentityHash'
             is distinct from
               'b6b6e64a3375935b849019fbeedd8fd07f02e7a76e938aea3b6e1a0189a7fddc'
         )
       )
     ) then
    raise exception
      'product_experience_objective_accessibility_binding_rejected'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function
  public.product_experience_enforce_objective_accessibility_run_binding()
from public,anon,authenticated,service_role;
