-- Cross-bind an enabled LiveKit platform outcome to the exact reviewed source
-- receipt and the exact platform artifact that supplied its installed runs.
-- The deployed 20260730142519 migration remains immutable.

create table public.cognitive_livekit_final_source_identity_bindings (
  binding_version text not null check (
    binding_version = 'livekit-final-source-identity-v3'
  ),
  target_platform public.cognitive_platform not null check (
    target_platform in ('android','ios')
  ),
  final_source_commit text not null check (
    final_source_commit ~ '^[a-f0-9]{40}$'
  ),
  final_source_tree_hash text not null check (
    final_source_tree_hash ~ '^[a-f0-9]{40}$'
  ),
  final_deployment_hash text not null check (
    final_deployment_hash ~ '^[a-f0-9]{64}$'
  ),
  application_identifier text not null,
  distribution text not null,
  build_number text not null,
  runtime_version text not null,
  channel text not null,
  internal_update_id uuid not null,
  installed_artifact_hash text not null check (
    installed_artifact_hash ~ '^[a-f0-9]{64}$'
  ),
  delivered_source_commit text not null check (
    delivered_source_commit ~ '^[a-f0-9]{40}$'
  ),
  expected_source_build_hash text not null check (
    expected_source_build_hash ~ '^[a-f0-9]{64}$'
  ),
  expected_runtime_identity_hash text not null check (
    expected_runtime_identity_hash ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default transaction_timestamp(),
  check (
    expected_source_build_hash = encode(extensions.digest(
      convert_to(delivered_source_commit,'UTF8'),'sha256'
    ),'hex')
  ),
  primary key (binding_version,target_platform),
  unique (
    target_platform,final_source_commit,final_source_tree_hash,
    final_deployment_hash,internal_update_id,installed_artifact_hash,
    expected_source_build_hash,expected_runtime_identity_hash
  ),
  check (
    (
      target_platform = 'android'
      and application_identifier = 'com.chillywood.mobile'
      and distribution = 'google_play_internal_testing'
      and build_number = '86'
      and runtime_version = '1.0.0-android-chat-call-action-v1'
      and channel = 'android-chat-livekit-qa'
    )
    or (
      target_platform = 'ios'
      and application_identifier = 'com.chillywood.mobile'
      and distribution = 'internal_testflight'
      and build_number = '8'
      and runtime_version = '1.0.0-iosqa1'
      and channel = 'ios-qa'
    )
  )
);

alter table public.cognitive_livekit_final_source_identity_bindings
  enable row level security;
alter table public.cognitive_livekit_final_source_identity_bindings
  force row level security;
revoke all on table
  public.cognitive_livekit_final_source_identity_bindings
from public,anon,authenticated,service_role;

create trigger cognitive_livekit_final_source_identity_bindings_immutable
before update or delete
on public.cognitive_livekit_final_source_identity_bindings
for each row
execute function public.reject_cognitive_evidence_mutation();

insert into public.cognitive_livekit_final_source_identity_bindings (
  binding_version,target_platform,final_source_commit,
  final_source_tree_hash,final_deployment_hash,application_identifier,
  distribution,build_number,runtime_version,channel,internal_update_id,
  installed_artifact_hash,delivered_source_commit,
  expected_source_build_hash,expected_runtime_identity_hash
)
values
(
  'livekit-final-source-identity-v3','android',
  'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
  '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
  '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
  'com.chillywood.mobile','google_play_internal_testing','86',
  '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
  'e3379ac9-61f0-40db-a014-81975be123e5',
  'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
  '0cd2d981c79640199a02236abff6c79cbe0790ea',
  'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
  '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
),
(
  'livekit-final-source-identity-v3','ios',
  'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
  '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
  '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
  'com.chillywood.mobile','internal_testflight','8',
  '1.0.0-iosqa1','ios-qa',
  '019fb099-f7c3-7130-97aa-a4bb1c49792f',
  '24a951d58302dd73e13e4adc899fc28680472eb78f37cac04639ee95896e36d8',
  '36c5d34e5db508112241651ff2a80056d594a797',
  '73792a29b2de5445bc7fc718abd6463d812ffec6b566b00ab930045a32d266cb',
  '17d0bf8d12eed354ab5784cc94a3373620c4a9dc09b9aeda81bdb13103351bcf'
);

create function public.cognitive_livekit_final_source_identity_matches_v3(
  p_target_platform public.cognitive_platform,
  p_final_source_commit text,
  p_final_source_tree_hash text,
  p_final_deployment_hash text,
  p_application_identifier text,
  p_distribution text,
  p_build_number text,
  p_runtime_version text,
  p_channel text,
  p_internal_update_id uuid,
  p_installed_artifact_hash text,
  p_source_build_hash text,
  p_runtime_identity_hash text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cognitive_livekit_final_source_identity_bindings binding
    where binding.binding_version = 'livekit-final-source-identity-v3'
      and binding.target_platform = p_target_platform
      and binding.final_source_commit = p_final_source_commit
      and binding.final_source_tree_hash = p_final_source_tree_hash
      and binding.final_deployment_hash = p_final_deployment_hash
      and binding.application_identifier = p_application_identifier
      and binding.distribution = p_distribution
      and binding.build_number = p_build_number
      and binding.runtime_version = p_runtime_version
      and binding.channel = p_channel
      and binding.internal_update_id = p_internal_update_id
      and binding.installed_artifact_hash = p_installed_artifact_hash
      and binding.expected_source_build_hash = p_source_build_hash
      and binding.expected_runtime_identity_hash = p_runtime_identity_hash
  );
$$;

revoke all on function
  public.cognitive_livekit_final_source_identity_matches_v3(
    public.cognitive_platform,text,text,text,text,text,text,text,text,
    uuid,text,text,text
  )
from public,anon,authenticated,service_role;

create function public.cognitive_require_livekit_platform_run_identity_v3()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  authorization_value
    public.cognitive_livekit_platform_canary_authorizations%rowtype;
  receipt_value
    public.cognitive_livekit_platform_preflight_receipts%rowtype;
  expected_pair_count integer;
begin
  if not new.enabled then
    return new;
  end if;

  select * into authorization_value
  from public.cognitive_livekit_platform_canary_authorizations authorization_row
  where authorization_row.id = new.authorization_id
  for share;

  select * into receipt_value
  from public.cognitive_livekit_platform_preflight_receipts receipt
  where receipt.id = authorization_value.preflight_receipt_id
  for share;

  if authorization_value.id is null
     or receipt_value.id is null
     or authorization_value.target_platform <> receipt_value.target_platform
     or authorization_value.source_commit <> receipt_value.source_commit
     or authorization_value.source_tree_hash <> receipt_value.source_tree_hash
     or authorization_value.deployment_hash <> receipt_value.deployment_hash
     or authorization_value.rollback_hash <> receipt_value.rollback_hash
     or not public.cognitive_livekit_final_source_identity_matches_v3(
       receipt_value.target_platform,receipt_value.source_commit,
       receipt_value.source_tree_hash,receipt_value.deployment_hash,
       receipt_value.application_identifier,receipt_value.distribution,
       receipt_value.build_number,receipt_value.runtime_version,
       receipt_value.channel,receipt_value.internal_update_id,
       receipt_value.installed_artifact_hash,
       case receipt_value.target_platform
         when 'android' then
           'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050'
         else
           '73792a29b2de5445bc7fc718abd6463d812ffec6b566b00ab930045a32d266cb'
       end,
       case receipt_value.target_platform
         when 'android' then
           '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
         else
           '17d0bf8d12eed354ab5784cc94a3373620c4a9dc09b9aeda81bdb13103351bcf'
       end
     ) then
    raise exception 'livekit_final_source_identity_cross_binding_rejected'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.product_experience_sentinel_runs run
    where run.task_id = authorization_value.target_task_id
      and run.project_id = authorization_value.project_id
      and run.platform = authorization_value.target_platform
      and run.environment = authorization_value.environment
      and run.sentinel_key = 'livekit_experience_sentinel'
      and run.observation_started_at >= authorization_value.opened_at
      and not public.cognitive_livekit_final_source_identity_matches_v3(
        receipt_value.target_platform,receipt_value.source_commit,
        receipt_value.source_tree_hash,receipt_value.deployment_hash,
        receipt_value.application_identifier,receipt_value.distribution,
        receipt_value.build_number,receipt_value.runtime_version,
        receipt_value.channel,receipt_value.internal_update_id,
        receipt_value.installed_artifact_hash,run.source_build_hash,
        run.runtime_identity_hash
      )
  ) then
    raise exception 'livekit_final_source_identity_cross_binding_rejected'
      using errcode = 'P0001';
  end if;

  select count(distinct (
    run.route_or_surface,
    run.metric_manifest->'metrics'->>'scenarioType'
  ))::integer
  into expected_pair_count
  from public.product_experience_sentinel_runs run
  where run.task_id = authorization_value.target_task_id
    and run.project_id = authorization_value.project_id
    and run.platform = authorization_value.target_platform
    and run.environment = authorization_value.environment
    and run.sentinel_key = 'livekit_experience_sentinel'
    and run.observation_started_at >= authorization_value.opened_at
    and run.route_or_surface in (
      'live-stage','watch-party-live','chat-call'
    )
    and run.metric_manifest->'metrics'->>'scenarioType' in (
      'success_baseline','bounded_failure_fixture',
      'background_foreground_recovery'
    )
    and public.cognitive_livekit_final_source_identity_matches_v3(
      receipt_value.target_platform,receipt_value.source_commit,
      receipt_value.source_tree_hash,receipt_value.deployment_hash,
      receipt_value.application_identifier,receipt_value.distribution,
      receipt_value.build_number,receipt_value.runtime_version,
      receipt_value.channel,receipt_value.internal_update_id,
      receipt_value.installed_artifact_hash,run.source_build_hash,
      run.runtime_identity_hash
    );

  if expected_pair_count <> 9 then
    raise exception 'livekit_final_source_identity_cross_binding_rejected'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function
  public.cognitive_require_livekit_platform_run_identity_v3()
from public,anon,authenticated,service_role;

drop trigger if exists cognitive_livekit_platform_run_identity_v2
on public.cognitive_livekit_platform_activation_outcomes;
create trigger cognitive_livekit_platform_run_identity_v3
before insert on public.cognitive_livekit_platform_activation_outcomes
for each row
execute function public.cognitive_require_livekit_platform_run_identity_v3();

comment on table
  public.cognitive_livekit_final_source_identity_bindings is
  'Immutable v3 manifest pairing the final reviewed receipt source with each exact delivered platform source, update, runtime, channel, artifact, and accepted run identity.';
comment on function
  public.cognitive_require_livekit_platform_run_identity_v3() is
  'Fail-closed enabled-outcome guard that joins authorization to its immutable receipt and rejects stale or cross-platform source/update/runtime/artifact run evidence.';
