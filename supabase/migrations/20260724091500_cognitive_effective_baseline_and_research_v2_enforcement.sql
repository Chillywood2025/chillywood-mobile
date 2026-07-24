-- Enforce the effective Owner-approved visual baseline at the final database
-- write boundaries and close the superseded public-research source writer.
--
-- Objective platform/WCAG touch-target observations remain baseline-independent.
-- No switch, schedule, UI mutation, or provider authority is enabled here.

create function public.product_experience_objective_touch_target_is_independent(
  p_platform public.cognitive_platform,
  p_result_status text,
  p_metrics jsonb,
  p_finding_class text default null
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  target_classification text;
  expected_finding_class text;
begin
  if not public.product_experience_option_c_touch_target_is_valid(
       p_platform,p_result_status,p_metrics
     )
     or p_metrics->'isActuallyInteractive' <> 'true'::jsonb
     or p_metrics->>'evidenceQuality' not in (
       'measured_installed','measured_simulator'
     )
     or p_metrics->>'automationStatus' <> 'observed' then
    return false;
  end if;

  target_classification := p_metrics->>'targetClassification';
  if p_result_status in ('failed','finding_created') then
    expected_finding_class := case
      when p_platform='android'
           and target_classification='below_platform_minimum'
        then 'android_touch_target_below_48dp'
      when p_platform='ios'
           and target_classification='below_platform_minimum'
        then 'ios_touch_target_below_44pt'
      when p_platform='web'
           and target_classification='below_wcag_aa_minimum'
        then 'web_touch_target_below_wcag_24csspx'
      else null
    end;
    return expected_finding_class is not null
      and (
        p_finding_class is null
        or p_finding_class=expected_finding_class
      );
  end if;

  if p_result_status='passed' then
    return p_metrics->'accessibilityNamePresent'='true'::jsonb
      and p_metrics->'accessibilityRolePresent'='true'::jsonb
      and (
        (
          p_platform in ('android','ios')
          and target_classification='meets_platform_minimum'
        )
        or (
          p_platform='web'
          and target_classification='meets_platform_preferred'
        )
      );
  end if;

  return false;
exception
  when others then
    return false;
end;
$$;

revoke all on function
  public.product_experience_objective_touch_target_is_independent(
    public.cognitive_platform,text,jsonb,text
  )
from public,anon,authenticated,service_role;

create function public.product_experience_lock_effective_baseline_v1(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_metrics jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  baseline_before jsonb;
  baseline_after jsonb;
  baseline_version_id uuid;
  canonical_hash constant text :=
    '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184';
begin
  if jsonb_typeof(p_metrics)<>'object'
     or p_metrics->>'baselineState'<>'approved_baseline'
     or p_metrics->>'baselineId'<>
        'chillywood-product-experience-baseline-v1'
     or p_metrics->>'baselineComparisonHash'<>canonical_hash then
    return false;
  end if;

  baseline_before :=
    public.product_experience_resolve_current_active_baseline(
      p_task_id,p_project_id,p_platform,p_environment,
      'streaming_mobile_content_density'
    );
  if baseline_before is null
     or baseline_before->>'baselineVersionId'
        !~ '^[a-f0-9-]{36}$'
     or baseline_before->>'baselineId'<>
        'chillywood-product-experience-baseline-v1'
     or baseline_before->>'selectedOptionCode'<>'C'
     or baseline_before->>'selectedOption'<>'creator_balanced'
     or baseline_before->>'baselineHash'<>canonical_hash
     or baseline_before->>'status'<>'owner_approved' then
    return false;
  end if;

  baseline_version_id := (baseline_before->>'baselineVersionId')::uuid;
  -- Revocation and supersession use this exact advisory-lock namespace.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(
        '|','product_experience_baseline',baseline_version_id::text
      ),
      0
    )
  );

  -- Re-resolve after any concurrent lifecycle mutation has committed.
  baseline_after :=
    public.product_experience_resolve_current_active_baseline(
      p_task_id,p_project_id,p_platform,p_environment,
      'streaming_mobile_content_density'
    );
  return baseline_after is not null
    and baseline_after->>'baselineVersionId'=baseline_version_id::text
    and baseline_after->>'baselineId'=
      'chillywood-product-experience-baseline-v1'
    and baseline_after->>'selectedOptionCode'='C'
    and baseline_after->>'selectedOption'='creator_balanced'
    and baseline_after->>'baselineHash'=canonical_hash
    and baseline_after->>'status'='owner_approved';
exception
  when others then
    return false;
end;
$$;

revoke all on function public.product_experience_lock_effective_baseline_v1(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,jsonb
) from public,anon,authenticated,service_role;

create function public.product_experience_require_effective_baseline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  observation_kind text;
  metrics_value jsonb;
begin
  if new.sentinel_key<>'visual_product_experience_sentinel' then
    return new;
  end if;

  if jsonb_typeof(new.metric_manifest->'metrics')='object' then
    observation_kind := new.metric_manifest->>'observationKind';
    metrics_value := new.metric_manifest->'metrics';
  else
    -- Preserve the bounded pre-Option-C ambiguity packet as record-only
    -- evidence. Legacy approved-baseline packets still fail because the
    -- effective-baseline lock requires the exact v1 baseline ID and hash.
    observation_kind := 'visual_layout';
    metrics_value := new.metric_manifest;
  end if;
  if observation_kind='touch_target'
     and public.product_experience_objective_touch_target_is_independent(
       new.platform,new.result_status,metrics_value,null
     ) then
    return new;
  end if;

  -- Pending-baseline blocked evidence remains recordable as ambiguity. It does
  -- not acquire authority to pass, fail, or create a visual finding.
  if metrics_value->>'baselineState'='needs_product_baseline_review' then
    return new;
  end if;

  if observation_kind not in ('visual_layout','touch_target')
     or not public.product_experience_lock_effective_baseline_v1(
       new.task_id,new.project_id,new.platform,new.environment,metrics_value
     ) then
    raise exception 'product_experience_effective_baseline_required'
      using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function public.product_experience_require_effective_baseline()
  from public,anon,authenticated,service_role;

create trigger product_experience_sentinel_runs_effective_baseline_required
before insert on public.product_experience_sentinel_runs
for each row execute function
  public.product_experience_require_effective_baseline();

create function public.product_quality_require_effective_baseline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_value public.product_experience_sentinel_runs%rowtype;
  observation_kind text;
  metrics_value jsonb;
begin
  -- Resolution is cleanup of an already governed finding and must remain
  -- reachable after baseline revocation. New detections and recurrences do not.
  if tg_op='UPDATE'
     and old.current_status='open'
     and new.current_status='resolved' then
    return new;
  end if;

  select * into run_value
  from public.product_experience_sentinel_runs run
  where run.id=new.sentinel_run_id
  for share;
  if run_value.id is null
     or run_value.sentinel_key<>'visual_product_experience_sentinel' then
    return new;
  end if;

  if jsonb_typeof(run_value.metric_manifest->'metrics')='object' then
    observation_kind := run_value.metric_manifest->>'observationKind';
    metrics_value := run_value.metric_manifest->'metrics';
  else
    observation_kind := 'visual_layout';
    metrics_value := run_value.metric_manifest;
  end if;
  if observation_kind='touch_target'
     and public.product_experience_objective_touch_target_is_independent(
       run_value.platform,run_value.result_status,metrics_value,
       new.finding_class
     ) then
    return new;
  end if;

  if observation_kind not in ('visual_layout','touch_target')
     or not public.product_experience_lock_effective_baseline_v1(
       run_value.task_id,run_value.project_id,run_value.platform,
       run_value.environment,metrics_value
     ) then
    raise exception 'product_quality_effective_baseline_required'
      using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function public.product_quality_require_effective_baseline()
  from public,anon,authenticated,service_role;

create trigger product_quality_findings_effective_baseline_required
before insert or update on public.product_quality_findings
for each row execute function
  public.product_quality_require_effective_baseline();

-- Historical rows receive the legacy marker from migration 091000. Future
-- inserts must come through the provenance-validating v2 RPC.
alter table public.research_sources
  alter column publication_provenance drop default;

create function public.cognitive_research_require_v2_publication_provenance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.publication_provenance is null
     or new.publication_provenance->>'mode' not in (
       'published_metadata','github_commit_metadata'
     ) then
    raise exception 'research_source_v2_provenance_required'
      using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function
  public.cognitive_research_require_v2_publication_provenance()
from public,anon,authenticated,service_role;

create trigger research_sources_v2_publication_provenance_required
before insert on public.research_sources
for each row execute function
  public.cognitive_research_require_v2_publication_provenance();

revoke all on function public.cognitive_record_public_research_source(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,
  boolean,text,jsonb,text[],text
) from public,anon,authenticated,service_role;

comment on function public.product_experience_lock_effective_baseline_v1(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,jsonb
) is
  'Locks and re-resolves the exact current Option-C baseline against concurrent immutable revocation or supersession.';
comment on function public.product_experience_require_effective_baseline() is
  'Rejects baseline-bound visual evidence unless the exact Owner-approved Option-C version remains current; objective touch targets remain independent.';
comment on function public.product_quality_require_effective_baseline() is
  'Final finding-boundary active-baseline lock/recheck for visual detections and recurrences; cleanup resolution remains reachable.';
comment on function public.cognitive_record_public_research_source(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,
  boolean,text,jsonb,text[],text
) is
  'Superseded public-research source writer. Execution is revoked; all new sources require the v2 machine-publication-provenance contract.';
