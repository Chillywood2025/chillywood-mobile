-- Canonical deferred-evidence Manifest V2 decision receipts.
--
-- Historical observations have a 30-day retention contract, while live
-- product-sentinel evaluation intentionally expires within 24 hours of the
-- observation. This forward-only path preserves that distinction: it records
-- exact-Owner import/defer/reject decisions for the already-sanitized
-- canonical candidates without relabeling them as fresh live sentinel runs.

create table public.cognitive_deferred_evidence_v2_candidates (
  evidence_key text primary key check (evidence_key ~ '^[a-f0-9]{64}$'),
  future_import_key text not null unique check (
    future_import_key ~ '^[a-f0-9]{64}$'
  ),
  manifest_version text not null check (
    manifest_version = 'chillywood-cognitive-deferred-evidence-v2'
  ),
  manifest_hash text not null check (
    manifest_hash =
      '665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793'
  ),
  evidence_type text not null,
  observed_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > observed_at),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  observation_platform text not null,
  evaluator_result text not null,
  metric_hashes text[] not null check (
    public.governance_hash_array_valid(metric_hashes, 1, 8)
  ),
  synthetic boolean not null,
  import_eligibility text not null check (
    import_eligibility in (
      'audit_only',
      'eligible_after_runtime_unlock',
      'requires_reevaluation',
      'not_eligible'
    )
  )
);

insert into public.cognitive_deferred_evidence_v2_candidates(
  evidence_key, future_import_key, manifest_version, manifest_hash,
  evidence_type, observed_at, expires_at, source_commit,
  observation_platform, evaluator_result, metric_hashes, synthetic,
  import_eligibility
) values
(
  '14a5bdf59feb02799208f1391f34dde5007cb6c132c980eea55c94b063eaee5f',
  'b2f909e873686ccba6b3b767991739d7723a9929ffb1872e8dddab8cf35a56a1',
  'chillywood-cognitive-deferred-evidence-v2',
  '665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793',
  'cloudflare_inert_readiness', '2026-07-25T08:24:00.000Z',
  '2026-08-24T08:24:00.000Z',
  'a4519f33e685fb3b85b3019e87323d3fef935d32',
  'cloudflare_workers_free', 'pass_inert_readiness_only',
  array[
    '50b7103acacde8b35da4e25d36333209d2451e77cc56971a97a4692084ec40f9',
    '722992d0f6394757f842454924d809cd4b7649f8b2b88869381e7f3f79a38679'
  ], true, 'audit_only'
),
(
  'cb6bb1f1a6b268dccd97ffdc21927bc134ce4febe771d619fe991645d6a58349',
  '3d9a3a0a6b66aca50bc79e6753941410a5afd18588eb4d4511961593ffbe3586',
  'chillywood-cognitive-deferred-evidence-v2',
  '665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793',
  'android_installed_route_repeat', '2026-07-25T13:15:53.066Z',
  '2026-08-24T13:15:53.066Z',
  '0a69bbf400151b5136c2dda070aeb586cd846171',
  'android', 'pass_routes_with_watch_party_entitlement_gate',
  array[
    '70ce84f76b3d68b620994993e0e8ed28bffd70fc18b8f6fda070c7a86afdfdf3'
  ], true, 'eligible_after_runtime_unlock'
),
(
  '3ea7b98e3bb938a2520b9bde427875c255d2a50c362dec7144c5c1008e5d7539',
  'efbc3d1cb0fc024303cfa5dc236fdd84c15f299582d1d4a748dd121a1ea2fd35',
  'chillywood-cognitive-deferred-evidence-v2',
  '665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793',
  'android_accessibility_touch_target', '2026-07-25T13:16:34.140Z',
  '2026-08-24T13:16:34.140Z',
  '0a69bbf400151b5136c2dda070aeb586cd846171',
  'android', 'finding_102_86_by_23_24_dp_below_48_dp_height',
  array[
    'aa326881aac9c1dd9ee1dea15421389ec5dc30f65d395bc07b83969637dd254c',
    'eeb1860d6e4edb647e1ebeb116ff81393ec50e2d721560c1fe2d686716a518f8'
  ], true, 'eligible_after_runtime_unlock'
),
(
  'd27ba0ffa1d435eaae403fde84200cc92c19e7b70f269a501da588e660495330',
  '21ea5630697b3fe7b507b4feedf4994a6d1106797f77107f929b0363f9c5bcdd',
  'chillywood-cognitive-deferred-evidence-v2',
  '665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793',
  'github_owner_assisted_draft_pr_canaries',
  '2026-07-25T13:20:04.413Z', '2026-08-24T13:20:04.413Z',
  '0a69bbf400151b5136c2dda070aeb586cd846171',
  'github', 'draft_only_provider_and_path_boundaries_pass',
  array[
    '8189e750277342559dd6f88096677f8482fb3cf2a13a7313d35d5241eb9c1d9d',
    'd2f96a9fe80c4a6a693f2e3d3d25a189ed3c17a1a84f01e98839b3ec133bf82b'
  ], true, 'audit_only'
),
(
  '698c1a9630422a3ff93413fbd91ec234de5c34de3edf57541fc6022f4f2b0c10',
  'af0dfd949c8ff0d48182180cc362dc1f4cb4207e51692c5ad3d119a774b53496',
  'chillywood-cognitive-deferred-evidence-v2',
  '665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793',
  'android_session_lifecycle', '2026-07-25T13:25:50.033Z',
  '2026-08-24T13:25:50.033Z',
  '0a69bbf400151b5136c2dda070aeb586cd846171',
  'android', 'pass_background_foreground_and_session_persistence',
  array[
    '89bc1b278a8b86a78d0c43b423459710f93b63e37bcc9e2b4f7a46df10cb7ab9'
  ], true, 'eligible_after_runtime_unlock'
),
(
  '0a7eb5d147618c23f1e7bb8700ef8a27ee764279b17d725865953fa272e66e53',
  '20ecc79b3e4a962b8209cc7ea1c77bf512d45b382e3c9f1f4bb193fbf1acd952',
  'chillywood-cognitive-deferred-evidence-v2',
  '665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793',
  'livekit_installed_observer_gate', '2026-07-25T13:29:09.000Z',
  '2026-08-24T13:29:09.000Z',
  '0a69bbf400151b5136c2dda070aeb586cd846171',
  'android', 'blocked_existing_premium_entitlement_gate',
  array[
    'f3c6618be6bd415d8699b89935dbf387cbbffa6f9e1716173ca1e5e6c2b80906'
  ], true, 'requires_reevaluation'
),
(
  '5c6c60554d27c1c70e707b1026727dac40db3f8c60a1937ce257f09d8062511c',
  'b31174850aeff725bd1efadc68244dbafde9af8a7610516e3e381c975ab099c3',
  'chillywood-cognitive-deferred-evidence-v2',
  '665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793',
  'livekit_two_headless_recovery', '2026-07-25T13:29:43.000Z',
  '2026-08-24T13:29:43.000Z',
  '0a69bbf400151b5136c2dda070aeb586cd846171',
  'macos_headless', 'blocked_reconnect_timeout_after_initial_connections',
  array[
    '624ac2ef2ff731e480108cc3d0b633bd8ac563bd75e21e31641d9f1e7f6b2e05'
  ], true, 'requires_reevaluation'
),
(
  'e04b4ee34fab844543419cd825e20600ca44604ccb68e0f1b0ac18e42ae98bba',
  '71d75109bc1ccd6538ae04cec34e6dd3f8abdce2959b0c3d965d507f70153916',
  'chillywood-cognitive-deferred-evidence-v2',
  '665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793',
  'pinned_public_research_canaries', '2026-07-25T13:31:37.319Z',
  '2026-08-24T13:31:37.319Z',
  '0a69bbf400151b5136c2dda070aeb586cd846171',
  'pinned_https_host', 'blocked_external_route_404_fail_closed',
  array[
    '6490755d9ad8431e4cc2d63340520a2024fa26a7ec8d0b66f5af83deeb506937'
  ], true, 'not_eligible'
),
(
  '4da38676d6acb44d4b2e4a7245e281afaf0b74ea859e33a4501df541c1145670',
  '21aebeac65bcb8e84937d5b571941f0be35a65ae8fded51eb70949c8f8b7fc27',
  'chillywood-cognitive-deferred-evidence-v2',
  '665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793',
  'scheduler_definition_dry_run', '2026-07-25T13:33:23.978Z',
  '2026-08-24T13:33:23.978Z',
  '0a69bbf400151b5136c2dda070aeb586cd846171',
  'local_scheduler', 'pass_dry_run_all_dispatches_no_work',
  array[
    '69ea17d3841a8a64b857146b529f7547012d5d8971ff3276e272fae2acc61f7e'
  ], true, 'audit_only'
),
(
  '9841966318dba452ba547a2c582f84dffacce44bb9fca1cfa3c3a513c075499d',
  '9fe3aef30ba0034021bced6a8e2bbc657ae56fb9263eda48e82e4cc28b214d7a',
  'chillywood-cognitive-deferred-evidence-v2',
  '665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793',
  'android_signout_signin', '2026-07-25T13:41:52.297Z',
  '2026-08-24T13:41:52.297Z',
  '0a69bbf400151b5136c2dda070aeb586cd846171',
  'android', 'pass_ui_signout_and_signin',
  array[
    '9df71b84e0c7b20d3ff025fd29b6a55ee754884df60e5602de82b1b998d0135f'
  ], true, 'eligible_after_runtime_unlock'
),
(
  'fe18d1480c07361d9321d55043b792c4d0dbbed20aa9c2dee9159295dd28eed6',
  '44a39b52dd37cbf367e6dbae0e71fb7eb59e4fb5dab6686b4b9f9a707288a2d2',
  'chillywood-cognitive-deferred-evidence-v2',
  '665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793',
  'android_crash_anr_observation', '2026-07-25T13:42:33.972Z',
  '2026-08-24T13:42:33.972Z',
  '0a69bbf400151b5136c2dda070aeb586cd846171',
  'android', 'pass_no_crash_anr_marker',
  array[
    'e3a3ea2aa188f5c800a4dc64a33280aeb2b4780b82457b2e9af8ff8ef38aba23'
  ], true, 'eligible_after_runtime_unlock'
),
(
  'ceff19cda847439490658cf248023b7e4ae0d16cb48b16eb2e39282e2f4b38a0',
  '3238d0cf4471c6f0ed3a889340160f751ce24b7829276018c0401feac5f7ae7f',
  'chillywood-cognitive-deferred-evidence-v2',
  '665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793',
  'android_post_ota_after_state', '2026-07-25T16:55:06.769Z',
  '2026-08-24T16:55:06.769Z',
  '4e03c91e896da0ecb29eac51986bdefa97bfcb35',
  'android', 'accepted_touch_target_48_76dp',
  array[
    '4ee6577e0b2ba41aa36cc97508e85a459b0944010adb3ad1f2148d45e3658f5d',
    '48ab4aea1c6cf8e50d1762e18f0b262f4e1ed90f8a2a296e6ec26a3c5550b8bb',
    '4a6147ed2fea0a562e4ec36029d31e8bfb147569349b46211a4b030abcc0134e',
    '3c571e59d792710017f057bb7892b74bbffc1d39aa457f25226b50b7c80eab70'
  ], false, 'requires_reevaluation'
);

alter table public.cognitive_deferred_evidence_v2_candidates
  enable row level security;
alter table public.cognitive_deferred_evidence_v2_candidates
  force row level security;
revoke all on table public.cognitive_deferred_evidence_v2_candidates
from public, anon, authenticated, service_role;

create table public.cognitive_deferred_evidence_v2_decision_receipts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  owner_user_id uuid not null,
  evidence_key text not null unique references
    public.cognitive_deferred_evidence_v2_candidates(evidence_key),
  future_import_key text not null unique check (
    future_import_key ~ '^[a-f0-9]{64}$'
  ),
  manifest_hash text not null check (
    manifest_hash =
      '665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793'
  ),
  evidence_type text not null,
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  original_observed_at timestamptz not null,
  evidence_expires_at timestamptz not null,
  decision text not null check (
    decision in ('imported', 'deferred', 'rejected')
  ),
  reason_code text not null check (
    reason_code in (
      'eligible_exact_bound_unexpired',
      'premium_gate_unresolved',
      'physical_installed_proof_incomplete',
      'audit_only',
      'provider_prerequisite_absent',
      'contradicted_by_newer_evidence'
    )
  ),
  reevaluation_hash text not null check (
    reevaluation_hash ~ '^[a-f0-9]{64}$'
  ),
  imported_at timestamptz,
  decided_at timestamptz not null default transaction_timestamp(),
  receipt_hash text not null unique check (
    receipt_hash ~ '^[a-f0-9]{64}$'
  ),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(
      id, project_id, platform, environment
    ),
  check (platform = 'shared' and environment = 'production'),
  check (
    (decision = 'imported' and imported_at is not null)
    or (decision <> 'imported' and imported_at is null)
  ),
  check (evidence_expires_at > original_observed_at)
);

alter table public.cognitive_deferred_evidence_v2_decision_receipts
  enable row level security;
alter table public.cognitive_deferred_evidence_v2_decision_receipts
  force row level security;
revoke all on table
  public.cognitive_deferred_evidence_v2_decision_receipts
from public, anon, authenticated, service_role;
grant select on table
  public.cognitive_deferred_evidence_v2_decision_receipts
to authenticated;

create policy cognitive_deferred_evidence_v2_decisions_owner_read
on public.cognitive_deferred_evidence_v2_decision_receipts
for select to authenticated
using (
  auth.uid() = owner_user_id
  and public.governance_exact_owner(auth.uid())
);

create trigger cognitive_deferred_evidence_v2_candidates_immutable
before update or delete
on public.cognitive_deferred_evidence_v2_candidates
for each row
execute function public.reject_cognitive_evidence_mutation();

create trigger cognitive_deferred_evidence_v2_decisions_immutable
before update or delete
on public.cognitive_deferred_evidence_v2_decision_receipts
for each row
execute function public.reject_cognitive_evidence_mutation();

create function public.governance_record_deferred_evidence_v2_decision(
  p_task_id uuid,
  p_project_id uuid,
  p_evidence_key text,
  p_decision text,
  p_reason_code text,
  p_reevaluation_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  candidate public.cognitive_deferred_evidence_v2_candidates%rowtype;
  existing
    public.cognitive_deferred_evidence_v2_decision_receipts%rowtype;
  receipt_id uuid := gen_random_uuid();
  receipt_hash_value text;
  now_at timestamptz := transaction_timestamp();
  imported_at_value timestamptz;
  expected_decision text;
  expected_reason text;
begin
  select * into candidate
  from public.cognitive_deferred_evidence_v2_candidates value
  where value.evidence_key = p_evidence_key
  for share;

  expected_decision := case p_evidence_key
    when 'cb6bb1f1a6b268dccd97ffdc21927bc134ce4febe771d619fe991645d6a58349'
      then 'imported'
    when '698c1a9630422a3ff93413fbd91ec234de5c34de3edf57541fc6022f4f2b0c10'
      then 'imported'
    when '9841966318dba452ba547a2c582f84dffacce44bb9fca1cfa3c3a513c075499d'
      then 'imported'
    when 'fe18d1480c07361d9321d55043b792c4d0dbbed20aa9c2dee9159295dd28eed6'
      then 'imported'
    when 'ceff19cda847439490658cf248023b7e4ae0d16cb48b16eb2e39282e2f4b38a0'
      then 'imported'
    when '0a7eb5d147618c23f1e7bb8700ef8a27ee764279b17d725865953fa272e66e53'
      then 'deferred'
    when '5c6c60554d27c1c70e707b1026727dac40db3f8c60a1937ce257f09d8062511c'
      then 'deferred'
    else 'rejected'
  end;
  expected_reason := case p_evidence_key
    when 'cb6bb1f1a6b268dccd97ffdc21927bc134ce4febe771d619fe991645d6a58349'
      then 'eligible_exact_bound_unexpired'
    when '698c1a9630422a3ff93413fbd91ec234de5c34de3edf57541fc6022f4f2b0c10'
      then 'eligible_exact_bound_unexpired'
    when '9841966318dba452ba547a2c582f84dffacce44bb9fca1cfa3c3a513c075499d'
      then 'eligible_exact_bound_unexpired'
    when 'fe18d1480c07361d9321d55043b792c4d0dbbed20aa9c2dee9159295dd28eed6'
      then 'eligible_exact_bound_unexpired'
    when 'ceff19cda847439490658cf248023b7e4ae0d16cb48b16eb2e39282e2f4b38a0'
      then 'eligible_exact_bound_unexpired'
    when '0a7eb5d147618c23f1e7bb8700ef8a27ee764279b17d725865953fa272e66e53'
      then 'premium_gate_unresolved'
    when '5c6c60554d27c1c70e707b1026727dac40db3f8c60a1937ce257f09d8062511c'
      then 'physical_installed_proof_incomplete'
    when '3ea7b98e3bb938a2520b9bde427875c255d2a50c362dec7144c5c1008e5d7539'
      then 'contradicted_by_newer_evidence'
    when 'e04b4ee34fab844543419cd825e20600ca44604ccb68e0f1b0ac18e42ae98bba'
      then 'provider_prerequisite_absent'
    else 'audit_only'
  end;

  if candidate.evidence_key is null
     or p_decision <> expected_decision
     or p_reason_code <> expected_reason
     or p_reevaluation_hash !~ '^[a-f0-9]{64}$'
     or (p_decision = 'imported' and now_at >= candidate.expires_at)
     or not exists (
       select 1
       from public.product_experience_baseline_versions baseline
       where baseline.task_id = p_task_id
         and baseline.project_id = p_project_id
         and baseline.platform = 'shared'
         and baseline.environment = 'production'
         and baseline.baseline_identifier =
           'chillywood-product-experience-baseline-v1'
         and baseline.baseline_option = 'C'
         and baseline.status = 'owner_approved'
     )
     or not exists (
       select 1
       from public.cognitive_provider_independent_visual_activation_outcomes
         outcome
       where outcome.task_id = p_task_id
         and outcome.project_id = p_project_id
         and outcome.platform = 'shared'
         and outcome.environment = 'production'
         and outcome.enabled
     )
     or not exists (
       select 1
       from public.autonomous_system_emergency_states emergency
       where emergency.system_id = 'product_intelligence_operator'
         and emergency.status = 'active'
     )
     or exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = p_task_id
         and switch.project_id = p_project_id
         and switch.platform = 'shared'
         and switch.environment = 'production'
         and switch.switch_key <>
           'cognitive_visual_experience_sentinel_enabled'
         and switch.enabled
     )
     or exists (
       select 1
       from public.cognitive_level01_schedule_definitions schedule
       where schedule.task_id = p_task_id
         and schedule.project_id = p_project_id
         and schedule.platform = 'shared'
         and schedule.environment = 'production'
         and schedule.enabled
     ) then
    raise exception 'cognitive_deferred_evidence_v2_decision_rejected'
      using errcode = 'P0001';
  end if;

  select * into existing
  from public.cognitive_deferred_evidence_v2_decision_receipts receipt
  where receipt.evidence_key = p_evidence_key
     or receipt.future_import_key = candidate.future_import_key
  for share;

  if existing.id is not null then
    if existing.task_id <> p_task_id
       or existing.project_id <> p_project_id
       or existing.decision <> p_decision
       or existing.reason_code <> p_reason_code
       or existing.reevaluation_hash <> p_reevaluation_hash then
      raise exception 'cognitive_deferred_evidence_v2_replay_conflict'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'receiptId', existing.id,
      'receiptHash', existing.receipt_hash,
      'evidenceKey', existing.evidence_key,
      'decision', existing.decision,
      'originalObservedAt', existing.original_observed_at,
      'importedAt', existing.imported_at,
      'replayed', true
    );
  end if;

  imported_at_value := case
    when p_decision = 'imported' then now_at
    else null
  end;
  receipt_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', 'cognitive-deferred-evidence-v2-decision-v1',
    receipt_id::text, p_task_id::text, p_project_id::text,
    owner_id::text, candidate.manifest_hash, candidate.evidence_key,
    candidate.future_import_key, candidate.evidence_type,
    candidate.source_commit, candidate.observed_at::text,
    candidate.expires_at::text, p_decision, p_reason_code,
    p_reevaluation_hash, coalesce(imported_at_value::text, ''), now_at::text
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.cognitive_deferred_evidence_v2_decision_receipts(
    id, task_id, project_id, platform, environment, owner_user_id,
    evidence_key, future_import_key, manifest_hash, evidence_type,
    source_commit, original_observed_at, evidence_expires_at,
    decision, reason_code, reevaluation_hash, imported_at, decided_at,
    receipt_hash
  ) values (
    receipt_id, p_task_id, p_project_id, 'shared', 'production', owner_id,
    candidate.evidence_key, candidate.future_import_key,
    candidate.manifest_hash, candidate.evidence_type,
    candidate.source_commit, candidate.observed_at, candidate.expires_at,
    p_decision, p_reason_code, p_reevaluation_hash, imported_at_value,
    now_at, receipt_hash_value
  );

  return jsonb_build_object(
    'receiptId', receipt_id,
    'receiptHash', receipt_hash_value,
    'evidenceKey', candidate.evidence_key,
    'decision', p_decision,
    'reasonCode', p_reason_code,
    'originalObservedAt', candidate.observed_at,
    'importedAt', imported_at_value,
    'replayed', false
  );
end;
$$;

revoke all on function
  public.governance_record_deferred_evidence_v2_decision(
    uuid, uuid, text, text, text, text
  )
from public, anon, service_role;
grant execute on function
  public.governance_record_deferred_evidence_v2_decision(
    uuid, uuid, text, text, text, text
  )
to authenticated;

comment on table public.cognitive_deferred_evidence_v2_candidates is
  'Exact sanitized candidates from canonical Manifest V2; not imported evidence.';
comment on table
  public.cognitive_deferred_evidence_v2_decision_receipts is
  'Immutable exact-Owner reevaluation decisions preserving original observation and separate import timestamps.';
comment on function
  public.governance_record_deferred_evidence_v2_decision(
    uuid, uuid, text, text, text, text
  ) is
  'Records one idempotent exact Manifest V2 import, deferral, or rejection only after the live provider-independent core gate passes.';
