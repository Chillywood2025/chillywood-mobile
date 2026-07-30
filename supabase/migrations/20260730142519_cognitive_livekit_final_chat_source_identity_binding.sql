-- Bind the platform LiveKit activation gate to the exact Part A merge and
-- installed internal artifacts. The original deployed authorization migration
-- is intentionally preserved; this is a forward-only successor.

do $$
begin
  if exists (
    select 1
    from public.cognitive_livekit_platform_preflight_receipts
  )
     or exists (
       select 1
       from public.cognitive_livekit_platform_canary_authorizations
     )
     or exists (
       select 1
       from public.cognitive_livekit_platform_activation_outcomes
     ) then
    raise exception 'livekit_platform_identity_binding_requires_zero_state'
      using errcode = 'P0001';
  end if;
end;
$$;

alter table public.cognitive_livekit_platform_preflight_receipts
  drop constraint if exists
    cognitive_livekit_platform_preflight_receipt_build_number_check,
  drop constraint if exists
    cognitive_livekit_platform_preflight_rece_runtime_version_check,
  drop constraint if exists
    cognitive_livekit_platform_preflight_receipts_channel_check,
  drop constraint if exists
    cognitive_livekit_platform_preflight_receipts_check;

alter table public.cognitive_livekit_platform_preflight_receipts
  add constraint
    cognitive_livekit_platform_preflight_receipt_build_number_check
    check (build_number in ('86','8')),
  add constraint
    cognitive_livekit_platform_preflight_rece_runtime_version_check
    check (
      runtime_version in (
        '1.0.0-android-chat-call-action-v1',
        '1.0.0-iosqa1'
      )
    ),
  add constraint
    cognitive_livekit_platform_preflight_receipts_channel_check
    check (channel in ('android-chat-livekit-qa','ios-qa')),
  add constraint
    cognitive_livekit_platform_preflight_identity_v2_check
    check (
      (
        target_platform = 'android'
        and distribution = 'google_play_internal_testing'
        and build_number = '86'
        and runtime_version = '1.0.0-android-chat-call-action-v1'
        and channel = 'android-chat-livekit-qa'
        and internal_update_id =
          'e3379ac9-61f0-40db-a014-81975be123e5'::uuid
        and installed_artifact_hash =
          'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44'
        and rollback_hash =
          '0fbe0c0d5bf2fe593b23f8970fe03e85c2e32e9195ec93ac9533d254b9014759'
      )
      or (
        target_platform = 'ios'
        and distribution = 'internal_testflight'
        and build_number = '8'
        and runtime_version = '1.0.0-iosqa1'
        and channel = 'ios-qa'
        and internal_update_id =
          '019fb099-f7c3-7130-97aa-a4bb1c49792f'::uuid
        and installed_artifact_hash =
          '24a951d58302dd73e13e4adc899fc28680472eb78f37cac04639ee95896e36d8'
        and rollback_hash =
          '37d14e930e6787973866b0a5f38c28e1484dac0cb187f4ecb5de363147528e48'
      )
    ),
  add constraint
    cognitive_livekit_platform_preflight_chat_source_v2_check
    check (
      source_commit =
        'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6'
      and source_tree_hash =
        '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec'
      and deployment_hash =
        '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0'
    );

create or replace function public.cognitive_livekit_sandbox_premium_proof_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  canary_count_value integer;
  role_count_value integer;
  active_manual_grant_count_value integer;
  qualified_row_count_value integer;
  qualified_user_count_value integer;
  proof_material_value text;
  proof_hash_value text;
  eligible_value boolean;
begin
  select count(*)::integer
  into canary_count_value
  from public.chat_call_livekit_canary_users canary
  where canary.enabled;

  select count(*)::integer
  into role_count_value
  from public.platform_role_memberships role
  join public.chat_call_livekit_canary_users canary
    on canary.user_id::text = role.user_id
   and canary.enabled
  where role.status = 'active';

  select count(*)::integer
  into active_manual_grant_count_value
  from public.user_entitlements entitlement
  join public.chat_call_livekit_canary_users canary
    on canary.user_id::text = entitlement.user_id
   and canary.enabled
  where entitlement.entitlement_key in (
      'premium','premium_live','premium_watch_party'
    )
    and entitlement.status in ('active','trialing','grace_period')
    and entitlement.source in (
      'operator_grant','test_grant','migration'
    )
    and entitlement.revoked_at is null
    and (
      entitlement.expires_at is null
      or entitlement.expires_at > transaction_timestamp()
    );

  select
    count(*)::integer,
    count(distinct entitlement.user_id)::integer,
    coalesce(
      string_agg(
        concat_ws(
          '|',
          entitlement.user_id,
          entitlement.entitlement_key,
          entitlement.status,
          entitlement.source,
          entitlement.updated_at,
          entitlement.expires_at,
          entitlement.metadata->>'environment',
          entitlement.metadata->>'sandbox'
        ),
        '||'
        order by entitlement.user_id, entitlement.entitlement_key
      ),
      'none'
    )
  into
    qualified_row_count_value,
    qualified_user_count_value,
    proof_material_value
  from public.user_entitlements entitlement
  join public.chat_call_livekit_canary_users canary
    on canary.user_id::text = entitlement.user_id
   and canary.enabled
  where entitlement.entitlement_key in (
      'premium','premium_live','premium_watch_party'
    )
    and entitlement.status in ('active','trialing','grace_period')
    and entitlement.source = 'revenuecat'
    and entitlement.revoked_at is null
    and (
      entitlement.expires_at is null
      or entitlement.expires_at > transaction_timestamp()
    )
    and entitlement.metadata->>'environment' = 'sandbox'
    and coalesce((entitlement.metadata->>'sandbox')::boolean,false)
    and exists (
      select 1
      from public.access_grants access_grant
      where access_grant.user_id::text = entitlement.user_id
        and access_grant.grant_type = 'premium'
        and access_grant.provider like 'revenuecat%'
        and access_grant.source_type = 'provider_event'
        and access_grant.provider_event_id is not null
        and access_grant.environment = 'sandbox'
        and access_grant.status = 'sandbox_only'
        and access_grant.refunded_at is null
        and access_grant.revoked_at is null
        and (
          access_grant.expires_at is null
          or access_grant.expires_at > transaction_timestamp()
        )
        and exists (
          select 1
          from public.provider_events provider_event
          where provider_event.id = access_grant.provider_event_id
            and provider_event.user_id::text = entitlement.user_id
            and provider_event.provider like 'revenuecat%'
            and provider_event.environment = 'sandbox'
            and provider_event.status = 'processed'
        )
    );

  eligible_value :=
    canary_count_value = 2
    and role_count_value = 0
    and active_manual_grant_count_value = 0
    and qualified_user_count_value = 2
    and qualified_row_count_value >= 2;

  proof_hash_value := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          'livekit-sandbox-premium-proof-v1',
          canary_count_value,
          role_count_value,
          active_manual_grant_count_value,
          qualified_row_count_value,
          qualified_user_count_value,
          proof_material_value
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  return jsonb_build_object(
    'schemaVersion', 1,
    'eligible', eligible_value,
    'canaryCount', canary_count_value,
    'activeRoleMembershipCount', role_count_value,
    'activeManualGrantCount', active_manual_grant_count_value,
    'qualifiedRevenueCatSandboxRowCount', qualified_row_count_value,
    'qualifiedPremiumUserCount', qualified_user_count_value,
    'proofHash', proof_hash_value
  );
end;
$$;

revoke all on function
  public.cognitive_livekit_sandbox_premium_proof_v1()
from public,anon,authenticated,service_role;

create or replace function public.governance_read_livekit_sandbox_premium_proof()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.governance_assert_exact_owner();
  return public.cognitive_livekit_sandbox_premium_proof_v1();
end;
$$;

revoke all on function
  public.governance_read_livekit_sandbox_premium_proof()
from public,anon,service_role;
grant execute on function
  public.governance_read_livekit_sandbox_premium_proof()
to authenticated;

create or replace function public.cognitive_bind_livekit_platform_identity_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sandbox_premium_proof jsonb;
begin
  sandbox_premium_proof :=
    public.cognitive_livekit_sandbox_premium_proof_v1();

  if not coalesce(
       (sandbox_premium_proof->>'eligible')::boolean,
       false
     )
     or new.sandbox_premium_proof_hash <>
       sandbox_premium_proof->>'proofHash' then
    raise exception 'livekit_sandbox_premium_proof_rejected'
      using errcode = 'P0001';
  end if;

  if new.target_platform = 'android' then
    new.distribution := 'google_play_internal_testing';
    new.build_number := '86';
    new.runtime_version := '1.0.0-android-chat-call-action-v1';
    new.channel := 'android-chat-livekit-qa';
    new.internal_update_id :=
      'e3379ac9-61f0-40db-a014-81975be123e5'::uuid;
  elsif new.target_platform = 'ios' then
    new.distribution := 'internal_testflight';
    new.build_number := '8';
    new.runtime_version := '1.0.0-iosqa1';
    new.channel := 'ios-qa';
    new.internal_update_id :=
      '019fb099-f7c3-7130-97aa-a4bb1c49792f'::uuid;
  else
    raise exception 'livekit_platform_identity_binding_rejected'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function
  public.cognitive_bind_livekit_platform_identity_v2()
from public,anon,authenticated,service_role;

create trigger cognitive_livekit_platform_identity_v2
before insert on public.cognitive_livekit_platform_preflight_receipts
for each row
execute function public.cognitive_bind_livekit_platform_identity_v2();

create or replace function public.cognitive_require_livekit_platform_run_identity_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  authorization_value
    public.cognitive_livekit_platform_canary_authorizations%rowtype;
  expected_source_build_hash text;
  expected_runtime_identity_hash text;
  expected_pair_count integer;
begin
  if not new.enabled then
    return new;
  end if;

  select * into authorization_value
  from public.cognitive_livekit_platform_canary_authorizations
    authorization_row
  where authorization_row.id = new.authorization_id
  for share;

  if authorization_value.target_platform = 'android' then
    expected_source_build_hash :=
      'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050';
    expected_runtime_identity_hash :=
      '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0';
  elsif authorization_value.target_platform = 'ios' then
    expected_source_build_hash :=
      '73792a29b2de5445bc7fc718abd6463d812ffec6b566b00ab930045a32d266cb';
    expected_runtime_identity_hash :=
      '17d0bf8d12eed354ab5784cc94a3373620c4a9dc09b9aeda81bdb13103351bcf';
  else
    raise exception 'livekit_platform_run_identity_rejected'
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
      and (
        run.source_build_hash <> expected_source_build_hash
        or run.runtime_identity_hash <> expected_runtime_identity_hash
      )
  ) then
    raise exception 'livekit_platform_run_identity_rejected'
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
      'success_baseline',
      'bounded_failure_fixture',
      'background_foreground_recovery'
    )
    and run.source_build_hash = expected_source_build_hash
    and run.runtime_identity_hash = expected_runtime_identity_hash;

  if expected_pair_count <> 9 then
    raise exception 'livekit_platform_run_identity_rejected'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function
  public.cognitive_require_livekit_platform_run_identity_v2()
from public,anon,authenticated,service_role;

create trigger cognitive_livekit_platform_run_identity_v2
before insert on public.cognitive_livekit_platform_activation_outcomes
for each row
execute function public.cognitive_require_livekit_platform_run_identity_v2();

comment on function public.cognitive_bind_livekit_platform_identity_v2() is
  'Forward-only binding from exact RevenueCat sandbox Premium, the merged Chat Call source, and the reviewed activation manifest to the current platform-separated internal artifacts. It changes no product state.';

comment on function
  public.governance_read_livekit_sandbox_premium_proof() is
  'Exact-Owner readback of a hashed, non-identifying proof that the two role-free canaries have current RevenueCat sandbox Premium with no active manual grant.';

comment on function
  public.cognitive_require_livekit_platform_run_identity_v2() is
  'Fail-closed finalization guard requiring every enabled platform canary run to match the exact installed source-build and runtime-identity hashes. Rollback outcomes remain unblocked.';

comment on constraint
  cognitive_livekit_platform_preflight_identity_v2_check
on public.cognitive_livekit_platform_preflight_receipts is
  'Exact installed Android build 86 and iOS build 8 internal identities, artifact hashes, and rollback contracts.';

comment on constraint
  cognitive_livekit_platform_preflight_chat_source_v2_check
on public.cognitive_livekit_platform_preflight_receipts is
  'Exact merged Part A source tree and canonical platform activation manifest hash.';
