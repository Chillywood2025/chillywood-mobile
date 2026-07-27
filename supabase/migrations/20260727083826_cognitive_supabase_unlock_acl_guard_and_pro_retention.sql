-- Complete the provider-admin unlock without rewriting deployed history.
--
-- The pg_net ACL remains provider-owned.  This migration records the verified
-- SU-431426 state, adds a read-only drift guard to the existing Security Owner
-- Operator readback path, and makes every isolated runtime invocation fail
-- closed if that state changes.  The guard never grants, revokes, or repairs an
-- ACL.
--
-- The same forward migration supersedes only the effective Free-plan research
-- retention tuple.  Historical Free attestations remain valid immutable
-- evidence, while all new activation/maintenance/readiness paths require the
-- independently verified Pro daily-backup tuple.  No research switch, memory
-- switch, schedule, Level 2 repair, product RLS policy, or product right is
-- enabled here.

create table cognitive_runtime.net_acl_provider_attestations (
  id uuid primary key default gen_random_uuid(),
  attestation_version integer not null unique check (
    attestation_version > 0
  ),
  ticket_id text not null check (ticket_id = 'SU-431426'),
  project_ref text not null check (project_ref = 'bmkkhihfbmsnnmcqkoly'),
  verified_at timestamptz not null,
  schema_owner text not null check (schema_owner = 'supabase_admin'),
  extension_owner text not null check (extension_owner = 'supabase_admin'),
  extension_version text not null check (extension_version = '0.19.5'),
  postgres_version_num integer not null check (postgres_version_num = 170006),
  normalized_acl_sha256 text not null check (
    normalized_acl_sha256 ~ '^[a-f0-9]{64}$'
  ),
  public_usage_denied boolean not null check (public_usage_denied),
  required_role_grants_present boolean not null check (
    required_role_grants_present
  ),
  cognitive_principals_denied boolean not null check (
    cognitive_principals_denied
  ),
  trusted_function_regression_passed boolean not null check (
    trusted_function_regression_passed
  ),
  automatic_acl_repair_attempted boolean not null default false check (
    not automatic_acl_repair_attempted
  ),
  created_at timestamptz not null default transaction_timestamp()
);

revoke all on table cognitive_runtime.net_acl_provider_attestations
  from public,anon,authenticated,service_role;

create trigger net_acl_provider_attestations_immutable
before update or delete
on cognitive_runtime.net_acl_provider_attestations
for each row execute function public.reject_cognitive_evidence_mutation();

insert into cognitive_runtime.net_acl_provider_attestations(
  attestation_version,ticket_id,project_ref,verified_at,schema_owner,
  extension_owner,extension_version,postgres_version_num,
  normalized_acl_sha256,public_usage_denied,
  required_role_grants_present,cognitive_principals_denied,
  trusted_function_regression_passed,automatic_acl_repair_attempted
) values (
  1,'SU-431426','bmkkhihfbmsnnmcqkoly',
  '2026-07-27T08:35:24.550686Z'::timestamptz,
  'supabase_admin','supabase_admin','0.19.5',170006,
  '864674950bb9fa2a3ab0528f7a8b46cdaa2455f910181602238adbaa2563d4c9',
  true,true,true,true,false
);

comment on table cognitive_runtime.net_acl_provider_attestations is
  'Immutable sanitized Supabase provider attestation for SU-431426. Contains no credential, connection string, origin, token, or private evidence.';

create table cognitive_runtime.research_provider_plan_attestations (
  id uuid primary key default gen_random_uuid(),
  attestation_version integer not null unique check (
    attestation_version > 0
  ),
  project_ref text not null check (project_ref = 'bmkkhihfbmsnnmcqkoly'),
  provider text not null check (provider = 'supabase'),
  provider_plan text not null check (provider_plan = 'pro'),
  backup_state text not null check (
    backup_state = 'provider_daily_backups_available'
  ),
  backup_window_days integer not null check (backup_window_days = 7),
  restore_available boolean not null check (restore_available),
  point_in_time_recovery boolean not null check (
    not point_in_time_recovery
  ),
  walg_enabled boolean not null check (walg_enabled),
  observed_backup_count integer not null check (observed_backup_count >= 1),
  restored_data_requires_tombstone_replay boolean not null check (
    restored_data_requires_tombstone_replay
  ),
  provider_evidence_sha256 text not null check (
    provider_evidence_sha256 ~ '^[a-f0-9]{64}$'
  ),
  verified_at timestamptz not null,
  research_activated boolean not null default false check (
    not research_activated
  ),
  user_derived_memory_enabled boolean not null default false check (
    not user_derived_memory_enabled
  ),
  created_at timestamptz not null default transaction_timestamp()
);

revoke all on table cognitive_runtime.research_provider_plan_attestations
  from public,anon,authenticated,service_role;

create trigger research_provider_plan_attestations_immutable
before update or delete
on cognitive_runtime.research_provider_plan_attestations
for each row execute function public.reject_cognitive_evidence_mutation();

insert into cognitive_runtime.research_provider_plan_attestations(
  attestation_version,project_ref,provider,provider_plan,backup_state,
  backup_window_days,restore_available,point_in_time_recovery,walg_enabled,
  observed_backup_count,restored_data_requires_tombstone_replay,
  provider_evidence_sha256,verified_at,research_activated,
  user_derived_memory_enabled
) values (
  1,'bmkkhihfbmsnnmcqkoly','supabase','pro',
  'provider_daily_backups_available',7,true,false,true,8,true,
  '5e6b52b3afbc6ce82a02f6ae1d65aadfbf5f4c0845f4548d8d9e9401e86930b3',
  '2026-07-27T08:39:11Z'::timestamptz,false,false
);

comment on table cognitive_runtime.research_provider_plan_attestations is
  'Immutable sanitized provider-plan and backup readback. It does not activate research or user-derived memory.';

create function cognitive_runtime.net_acl_guard_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  baseline_value
    cognitive_runtime.net_acl_provider_attestations%rowtype;
  observed_schema_owner text;
  observed_extension_owner text;
  observed_extension_version text;
  observed_postgres_version_num integer;
  observed_acl_sha256 text;
  public_usage_value boolean := false;
  missing_required_grant_count integer := 0;
  unexpected_direct_grant_count integer := 0;
  cognitive_net_access_count integer := 0;
  guard_passed boolean := false;
  finding_codes text[];
begin
  select * into baseline_value
  from cognitive_runtime.net_acl_provider_attestations attestation
  order by attestation.attestation_version desc
  limit 1;

  select owner_role.rolname
  into observed_schema_owner
  from pg_catalog.pg_namespace namespace
  join pg_catalog.pg_roles owner_role
    on owner_role.oid = namespace.nspowner
  where namespace.nspname = 'net';

  select owner_role.rolname, extension.extversion
  into observed_extension_owner,observed_extension_version
  from pg_catalog.pg_extension extension
  join pg_catalog.pg_roles owner_role
    on owner_role.oid = extension.extowner
  where extension.extname = 'pg_net';

  observed_postgres_version_num :=
    current_setting('server_version_num')::integer;

  with net_namespace as (
    select namespace.oid,namespace.nspowner,namespace.nspacl
    from pg_catalog.pg_namespace namespace
    where namespace.nspname = 'net'
  ),
  acl_rows as (
    select
      coalesce(grantee_role.rolname,'PUBLIC') as grantee,
      grantor_role.rolname as grantor,
      acl.privilege_type,
      acl.is_grantable
    from net_namespace namespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        namespace.nspacl,
        pg_catalog.acldefault('n',namespace.nspowner)
      )
    ) acl
    left join pg_catalog.pg_roles grantee_role
      on grantee_role.oid = acl.grantee
    join pg_catalog.pg_roles grantor_role
      on grantor_role.oid = acl.grantor
  ),
  required_roles(role_name) as (
    values
      ('supabase_admin'),
      ('supabase_functions_admin'),
      ('postgres'),
      ('anon'),
      ('authenticated'),
      ('service_role')
  ),
  cognitive_roles(role_name) as (
    values
      ('cognitive_product_baseline_executor'),
      ('cognitive_sentinel_collector'),
      ('cognitive_product_quality_evaluator'),
      ('cognitive_product_quality_triage'),
      ('cognitive_public_research_broker'),
      ('cognitive_research_evaluator'),
      ('cognitive_model_router'),
      ('cognitive_livekit_experience_collector'),
      ('cognitive_github_draft_pr_broker'),
      ('cognitive_level01_scheduler')
  )
  select
    encode(extensions.digest(convert_to(coalesce(string_agg(
      concat_ws(
        '|',acl.grantee,acl.grantor,acl.privilege_type,
        acl.is_grantable::text
      ),
      E'\n'
      order by acl.grantee,acl.grantor,acl.privilege_type,
        acl.is_grantable
    ),''),'UTF8'),'sha256'),'hex'),
    exists (
      select 1 from acl_rows public_acl
      where public_acl.grantee = 'PUBLIC'
        and public_acl.privilege_type = 'USAGE'
    ),
    (
      select count(*)::integer
      from required_roles required
      where not exists (
        select 1 from acl_rows required_acl
        where required_acl.grantee = required.role_name
          and required_acl.grantor = 'supabase_admin'
          and required_acl.privilege_type = 'USAGE'
          and not required_acl.is_grantable
      )
    ),
    (
      select count(*)::integer
      from acl_rows direct_acl
      where direct_acl.grantee not in (
        'supabase_admin','supabase_functions_admin','postgres',
        'anon','authenticated','service_role'
      )
    ),
    (
      select count(*)::integer
      from cognitive_roles cognitive
      join pg_catalog.pg_roles role_value
        on role_value.rolname = cognitive.role_name
      where pg_catalog.has_schema_privilege(
        role_value.oid,'net','USAGE'
      )
    )
  into
    observed_acl_sha256,
    public_usage_value,
    missing_required_grant_count,
    unexpected_direct_grant_count,
    cognitive_net_access_count
  from acl_rows acl;

  guard_passed :=
    baseline_value.id is not null
    and observed_schema_owner = baseline_value.schema_owner
    and observed_extension_owner = baseline_value.extension_owner
    and observed_extension_version = baseline_value.extension_version
    and observed_postgres_version_num =
      baseline_value.postgres_version_num
    and observed_acl_sha256 = baseline_value.normalized_acl_sha256
    and not public_usage_value
    and missing_required_grant_count = 0
    and unexpected_direct_grant_count = 0
    and cognitive_net_access_count = 0;

  finding_codes := array_remove(array[
    case when baseline_value.id is null
      then 'PROVIDER_ATTESTATION_MISSING' end,
    case when public_usage_value
      then 'PUBLIC_NET_USAGE_RESTORED' end,
    case when missing_required_grant_count > 0
      then 'REQUIRED_DIRECT_GRANT_MISSING' end,
    case when unexpected_direct_grant_count > 0
      then 'UNEXPECTED_DIRECT_GRANT_PRESENT' end,
    case when observed_schema_owner is distinct from baseline_value.schema_owner
      then 'NET_SCHEMA_OWNER_CHANGED' end,
    case when observed_extension_owner is distinct from
      baseline_value.extension_owner
      then 'PG_NET_OWNER_CHANGED' end,
    case when observed_extension_version is distinct from
      baseline_value.extension_version
      then 'PG_NET_VERSION_REVALIDATION_REQUIRED' end,
    case when observed_postgres_version_num is distinct from
      baseline_value.postgres_version_num
      then 'POSTGRES_VERSION_REVALIDATION_REQUIRED' end,
    case when observed_acl_sha256 is distinct from
      baseline_value.normalized_acl_sha256
      then 'NET_ACL_HASH_MISMATCH' end,
    case when cognitive_net_access_count > 0
      then 'COGNITIVE_NET_ACCESS_PRESENT' end
  ]::text[],null);

  return jsonb_build_object(
    'guard_status',case when guard_passed then 'PASS' else 'FAIL' end,
    'ticket_id',coalesce(baseline_value.ticket_id,'MISSING'),
    'observed_acl_sha256',coalesce(observed_acl_sha256,'MISSING'),
    'expected_acl_sha256',
      coalesce(baseline_value.normalized_acl_sha256,'MISSING'),
    'public_usage_denied',not public_usage_value,
    'required_direct_grants_present',
      missing_required_grant_count = 0,
    'unexpected_direct_grant_count',unexpected_direct_grant_count,
    'cognitive_net_access_count',cognitive_net_access_count,
    'schema_owner_match',
      observed_schema_owner is not distinct from baseline_value.schema_owner,
    'extension_owner_match',
      observed_extension_owner is not distinct from
        baseline_value.extension_owner,
    'extension_version_match',
      observed_extension_version is not distinct from
        baseline_value.extension_version,
    'postgres_version_match',
      observed_postgres_version_num is not distinct from
        baseline_value.postgres_version_num,
    'isolated_execution_allowed',guard_passed,
    'provider_administration_required',not guard_passed,
    'automatic_repair_attempted',false,
    'emergency_stop_authority_preserved',true,
    'finding_codes',to_jsonb(finding_codes)
  );
end;
$$;

revoke all on function cognitive_runtime.net_acl_guard_snapshot()
  from public,anon,authenticated,service_role;

create function cognitive_runtime.net_acl_guard_passes()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    cognitive_runtime.net_acl_guard_snapshot()->>'guard_status' = 'PASS',
    false
  )
$$;

revoke all on function cognitive_runtime.net_acl_guard_passes()
  from public,anon,authenticated,service_role;

create function public.cognitive_record_net_acl_guard_readback()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_value jsonb;
  guard_passed boolean;
  observed_hash text;
  owner_command_id_value uuid;
  owner_command_created boolean := false;
begin
  snapshot_value := cognitive_runtime.net_acl_guard_snapshot();
  guard_passed := snapshot_value->>'guard_status' = 'PASS';
  observed_hash := coalesce(
    snapshot_value->>'observed_acl_sha256',
    repeat('0',64)
  );

  insert into public.autonomous_provider_readback_capabilities(
    system_id,platform,provider,capability,capability_state,
    missing_capability,readback_complete,data_source,provider_environment,
    money_moved,user_rights_changed,high_risk_executed,metadata
  ) values (
    'security_owner_operator','shared','supabase','pg_net_acl_isolation',
    case when guard_passed then 'available' else 'blocked' end,
    case when guard_passed then null
      else 'provider_acl_revalidation_required' end,
    guard_passed,'cognitive_runtime.net_acl_guard_snapshot','production',
    false,false,false,jsonb_build_object(
      'guard_status',snapshot_value->>'guard_status',
      'ticket_id',snapshot_value->>'ticket_id',
      'observed_acl_sha256',observed_hash,
      'public_usage_denied',
        (snapshot_value->>'public_usage_denied')::boolean,
      'required_direct_grants_present',
        (snapshot_value->>'required_direct_grants_present')::boolean,
      'cognitive_net_access_count',
        (snapshot_value->>'cognitive_net_access_count')::integer,
      'automatic_repair_attempted',false
    )
  );

  insert into public.security_operator_events(
    system_id,actor_type,actor_id,action_id,result,environment_mode,
    platform,user_rights_changed,money_moved,metadata
  ) values (
    'security_owner_operator','operator','security_owner_operator',
    'cognitive_net_acl_guard',
    case when guard_passed then 'pass' else 'blocked' end,
    'production','shared',false,false,jsonb_build_object(
      'guard_status',snapshot_value->>'guard_status',
      'observed_acl_sha256',observed_hash,
      'provider_administration_required',not guard_passed,
      'automatic_repair_attempted',false
    )
  );

  if not guard_passed then
    if not exists (
      select 1
      from public.security_required_review_flags review
      where review.system_id = 'security_owner_operator'
        and review.flag_type = 'cognitive_net_acl_drift'
        and review.review_status = 'open'
        and review.metadata->>'observed_acl_sha256' = observed_hash
    ) then
      insert into public.security_required_review_flags(
        system_id,flag_type,severity,review_status,environment_mode,
        platform,user_rights_changed,money_moved,metadata
      ) values (
        'security_owner_operator','cognitive_net_acl_drift','critical',
        'open','production','shared',false,false,jsonb_build_object(
          'guard_status','FAIL',
          'observed_acl_sha256',observed_hash,
          'finding_codes',snapshot_value->'finding_codes',
          'isolated_execution_allowed',false,
          'provider_administration_required',true,
          'automatic_repair_attempted',false
        )
      );
    end if;

    select request.id into owner_command_id_value
    from public.owner_command_requests request
    where request.target_systems @> array['security_owner_operator']::text[]
      and request.status in (
        'received','classified','planned','preflight_pending',
        'approval_required','approved','executing','blocked'
      )
      and request.metadata->>'request_source' =
        'cognitive_net_acl_guard'
      and request.metadata->>'observed_acl_sha256' = observed_hash
    order by request.created_at desc
    limit 1;

    if owner_command_id_value is null then
      insert into public.owner_command_requests(
        command_text,normalized_intent,target_systems,approval_level,status,
        allowed_scope,forbidden_scope,preflight_plan,execution_plan,
        rollback_plan,proof_plan,validation_plan,
        external_confirmation_required,external_confirmation_status,
        result_summary,metadata
      ) values (
        'Request Supabase administration review for Cognitive net schema ACL drift',
        'supabase administration review for cognitive net schema ACL drift',
        array['security_owner_operator']::text[],3,'approval_required',
        '["provider administration request only","read-only ACL revalidation"]',
        '["automatic ACL repair","database ACL mutation","Cognitive execution"]',
        '["re-read schema owner and normalized ACL","re-read pg_net owner and version"]',
        '["submit provider administration request through Owner Command"]',
        '["keep isolated Cognitive execution blocked","preserve emergency stop"]',
        '["normalized ACL hash","ten-principal net denial","trusted function regression"]',
        '["exact required grants","no unexpected grant","no provider owner drift"]',
        false,'not_required',
        'Provider administration review required; no ACL repair attempted.',
        jsonb_build_object(
          'request_source','cognitive_net_acl_guard',
          'ticket_id',snapshot_value->>'ticket_id',
          'observed_acl_sha256',observed_hash,
          'automatic_repair_attempted',false
        )
      )
      returning id into owner_command_id_value;
      owner_command_created := true;

      insert into public.owner_command_events(
        command_id,event_type,actor_type,status,event_summary,metadata
      ) values (
        owner_command_id_value,'approval_required',
        'security_owner_operator','approval_required',
        'Cognitive net ACL drift routed for provider administration review.',
        jsonb_build_object(
          'request_source','cognitive_net_acl_guard',
          'automatic_repair_attempted',false
        )
      );

      insert into public.owner_command_blockers(
        command_id,blocker_code,blocker_summary,next_action,metadata
      ) values (
        owner_command_id_value,'COGNITIVE_NET_ACL_DRIFT',
        'Isolated Cognitive execution is blocked by provider ACL drift.',
        'Reverify the provider-owned net schema through Supabase Support; do not attempt automatic repair.',
        jsonb_build_object(
          'observed_acl_sha256',observed_hash,
          'emergency_stop_authority_preserved',true
        )
      );
    end if;
  end if;

  return snapshot_value || jsonb_build_object(
    'evidence_recorded',true,
    'owner_command_routed',not guard_passed,
    'owner_command_created',owner_command_created,
    'automatic_repair_attempted',false
  );
end;
$$;

revoke all on function public.cognitive_record_net_acl_guard_readback()
  from public,anon,authenticated;
grant execute on function public.cognitive_record_net_acl_guard_readback()
  to service_role;

comment on function public.cognitive_record_net_acl_guard_readback() is
  'Records sanitized read-only pg_net ACL status. Mismatch routes a provider-administration request through Owner Command and never repairs the ACL.';

create or replace function cognitive_runtime.runtime_login_provisioning_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with expected_roles(role_name) as (
    values
      ('cognitive_product_baseline_executor'),
      ('cognitive_sentinel_collector'),
      ('cognitive_product_quality_evaluator'),
      ('cognitive_product_quality_triage'),
      ('cognitive_public_research_broker'),
      ('cognitive_research_evaluator'),
      ('cognitive_model_router'),
      ('cognitive_livekit_experience_collector'),
      ('cognitive_github_draft_pr_broker'),
      ('cognitive_level01_scheduler')
  )
  select
    cognitive_runtime.net_acl_guard_passes()
    and (select count(*) from expected_roles) = 10
    and not exists (
      select 1
      from expected_roles expected
      where to_regrole(expected.role_name) is null
         or pg_catalog.has_database_privilege(
           expected.role_name,current_database(),'TEMPORARY'
         )
         or not cognitive_runtime.runtime_schema_set_is_valid(
           array(
             select namespace.nspname
             from pg_catalog.pg_namespace namespace
             where namespace.nspname not like 'pg_temp_%'
               and namespace.nspname not like 'pg_toast_temp_%'
               and pg_catalog.has_schema_privilege(
                 expected.role_name,namespace.oid,'USAGE'
               )
             order by namespace.nspname
           )
         )
    );
$$;

revoke all on function
  cognitive_runtime.runtime_login_provisioning_ready()
  from public,anon,authenticated,service_role;

do $patch_runtime_invoker$
declare
  definition text;
  marker constant text :=
    E'begin\n  if not cognitive_runtime.runtime_operation_allowed(';
  replacement constant text :=
    E'begin\n  if not cognitive_runtime.net_acl_guard_passes() then\n' ||
    E'    raise exception ''cognitive_net_acl_guard_blocked''\n' ||
    E'      using errcode = ''42501'';\n' ||
    E'  end if;\n\n' ||
    E'  if not cognitive_runtime.runtime_operation_allowed(';
begin
  select pg_catalog.pg_get_functiondef(procedure.oid)
  into definition
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'cognitive_runtime'
    and procedure.proname = 'assert_runtime_invoker'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
      'p_expected_principal text, p_expected_operation text';

  if definition is null
     or (length(definition)-length(replace(definition,marker,''))) /
       length(marker) <> 1
     or definition like '%cognitive_net_acl_guard_blocked%' then
    raise exception 'runtime_invoker_acl_guard_patch_rejected'
      using errcode = 'P0001';
  end if;

  execute replace(definition,marker,replacement);
end;
$patch_runtime_invoker$;

comment on function cognitive_runtime.assert_runtime_invoker(text,text) is
  'Revalidates the exact login boundary and blocks every isolated operation when the provider pg_net ACL guard mismatches.';

-- Preserve historical Free rows while requiring the reviewed Pro tuple for
-- every new effective activation.
alter table public.cognitive_research_backup_retention_attestations
  drop constraint
    cognitive_research_backup_retention_attesta_provider_plan_check,
  drop constraint
    cognitive_research_backup_retention_attestat_backup_state_check,
  drop constraint
    cognitive_research_backup_retention_at_backup_window_days_check,
  drop constraint
    cognitive_research_backup_retention_att_restore_available_check;

alter table public.cognitive_research_backup_retention_attestations
  add constraint cognitive_research_backup_retention_provider_tuple_check
  check (
    (
      provider_plan = 'free'
      and backup_state = 'provider_project_backups_absent'
      and backup_window_days = 0
      and not restore_available
    )
    or
    (
      provider_plan = 'pro'
      and backup_state = 'provider_daily_backups_available'
      and backup_window_days = 7
      and restore_available
    )
  );

create or replace function public.governance_research_retention_activation_hash(
  p_source_commit text,
  p_worker_version_hash text,
  p_provider_configuration_hash text,
  p_provider_evidence_hash text,
  p_retention_policy_hash text,
  p_provider_verified_at timestamptz,
  p_expires_at timestamptz
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(concat_ws(
    '|',
    'chillywood-research-retention-processor-v2',
    'Chillywood2025/chillywood-mobile',
    p_source_commit,
    'cloudflare_workers',
    'chillywood-level01-public-research-broker',
    'cognitive_public_research_broker',
    '17 * * * *',
    'UTC',
    '100',
    '1',
    '50000',
    '7200',
    'chillywood-cognitive-retention-v1',
    p_retention_policy_hash,
    p_worker_version_hash,
    p_provider_configuration_hash,
    'supabase',
    'pro',
    'provider_daily_backups_available',
    '7',
    'true',
    'false',
    'true',
    p_provider_evidence_hash,
    extract(epoch from p_provider_verified_at)::text,
    extract(epoch from p_expires_at)::text
  ),'UTF8'),'sha256'),'hex')
$$;

revoke all on function
  public.governance_research_retention_activation_hash(
    text,text,text,text,text,timestamptz,timestamptz
  )
  from public,anon,authenticated,service_role;

do $patch_research_retention_pro_truth$
declare
  definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) into definition;

  if definition is null
     or (length(definition)-length(replace(
       definition,'''supabase'',''free''',''
     ))) / length('''supabase'',''free''') <> 1
     or (length(definition)-length(replace(
       definition,
       '''provider_project_backups_absent'',0,false,false,true',
       ''
     ))) /
       length('''provider_project_backups_absent'',0,false,false,true') <> 1
     or (length(definition)-length(replace(
       definition,
       '''backup_state'',''provider_project_backups_absent''',
       ''
     ))) /
       length('''backup_state'',''provider_project_backups_absent''') <> 1
     or (length(definition)-length(replace(
       definition,'''backup_window_days'',0',''
     ))) / length('''backup_window_days'',0') <> 1
     or (length(definition)-length(replace(
       definition,'''restore_available'',false',''
     ))) / length('''restore_available'',false') <> 1 then
    raise exception 'research_retention_pro_persist_patch_rejected'
      using errcode = 'P0001';
  end if;

  definition := replace(
    definition,'''supabase'',''free''','''supabase'',''pro'''
  );
  definition := replace(
    definition,
    '''provider_project_backups_absent'',0,false,false,true',
    '''provider_daily_backups_available'',7,true,false,true'
  );
  definition := replace(
    definition,
    '''backup_state'',''provider_project_backups_absent''',
    '''backup_state'',''provider_daily_backups_available'''
  );
  definition := replace(
    definition,'''backup_window_days'',0','''backup_window_days'',7'
  );
  definition := replace(
    definition,'''restore_available'',false',
    '''restore_available'',true'
  );
  execute definition;

  select pg_catalog.pg_get_functiondef(
    'public.cognitive_run_attested_research_retention_maintenance(uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,timestamptz,integer,text)'
      ::regprocedure
  ) into definition;

  if definition is null
     or (length(definition)-length(replace(
       definition,'''provider_project_backups_absent''',''
     ))) / length('''provider_project_backups_absent''') <> 1
     or (length(definition)-length(replace(
       definition,'backup_value.backup_window_days <> 0',''
     ))) / length('backup_value.backup_window_days <> 0') <> 1
     or (length(definition)-length(replace(
       definition,'or backup_value.restore_available',''
     ))) / length('or backup_value.restore_available') <> 1
     or (length(definition)-length(replace(
       definition,'or backup_value.backup_state <>',''
     ))) / length('or backup_value.backup_state <>') <> 1 then
    raise exception 'research_retention_pro_maintenance_patch_rejected'
      using errcode = 'P0001';
  end if;

  definition := replace(
    definition,
    'or backup_value.backup_state <>',
    'or backup_value.provider_plan <> ''pro''' || E'\n     ' ||
      'or backup_value.backup_state <>'
  );
  definition := replace(
    definition,'''provider_project_backups_absent''',
    '''provider_daily_backups_available'''
  );
  definition := replace(
    definition,'backup_value.backup_window_days <> 0',
    'backup_value.backup_window_days <> 7'
  );
  definition := replace(
    definition,'or backup_value.restore_available',
    'or not backup_value.restore_available'
  );
  execute definition;

  select pg_catalog.pg_get_functiondef(
    'public.cognitive_research_retention_processor_ready(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
      ::regprocedure
  ) into definition;

  if definition is null
     or (length(definition)-length(replace(
       definition,'''provider_project_backups_absent''',''
     ))) / length('''provider_project_backups_absent''') <> 1
     or (length(definition)-length(replace(
       definition,'backup.backup_window_days = 0',''
     ))) / length('backup.backup_window_days = 0') <> 1
     or (length(definition)-length(replace(
       definition,'and not backup.restore_available',''
     ))) / length('and not backup.restore_available') <> 1
     or (length(definition)-length(replace(
       definition,'and backup.backup_state =',''
     ))) / length('and backup.backup_state =') <> 1 then
    raise exception 'research_retention_pro_ready_patch_rejected'
      using errcode = 'P0001';
  end if;

  definition := replace(
    definition,
    'and backup.backup_state =',
    'and backup.provider_plan = ''pro''' || E'\n      ' ||
      'and backup.backup_state ='
  );
  definition := replace(
    definition,'''provider_project_backups_absent''',
    '''provider_daily_backups_available'''
  );
  definition := replace(
    definition,'backup.backup_window_days = 0',
    'backup.backup_window_days = 7'
  );
  definition := replace(
    definition,'and not backup.restore_available',
    'and backup.restore_available'
  );
  execute definition;
end;
$patch_research_retention_pro_truth$;

revoke all on function
  public.governance_persist_research_retention_activation(
    uuid,text,text,text,text,timestamptz,text,timestamptz,text,text
  )
  from public,anon,authenticated;
grant execute on function
  public.governance_persist_research_retention_activation(
    uuid,text,text,text,text,timestamptz,text,timestamptz,text,text
  )
  to service_role;

comment on function public.governance_persist_research_retention_activation(
  uuid,text,text,text,text,timestamptz,text,timestamptz,text,text
) is
  'Persists only the current reviewed Supabase Pro seven-day daily-backup tuple through the existing exact Owner, worker, and independent-evaluator chain.';

comment on function public.cognitive_research_retention_processor_ready(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) is
  'Requires the current reviewed Supabase Pro daily-backup tuple, tombstone replay, user-derived memory off, an unrevoked processor, and a fresh heartbeat.';
