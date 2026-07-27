-- Preserve deterministic verification of the deployed timestamp-bound Free
-- retention receipts while keeping every new effective activation bound to
-- the reviewed Supabase Pro tuple.
--
-- The preceding forward migration corrected the effective provider truth but
-- replaced the v2 hash implementation in place. Restore that immutable v2
-- lineage, introduce a distinct Pro v3 domain, and point only the current
-- persistence path at v3. This migration activates no research, switch,
-- schedule, user-derived memory, or Level 2 capability.

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
    'free',
    'provider_project_backups_absent',
    '0',
    'false',
    'false',
    'true',
    p_provider_evidence_hash,
    extract(epoch from p_provider_verified_at)::text,
    extract(epoch from p_expires_at)::text
  ), 'UTF8'), 'sha256'), 'hex')
$$;

revoke all on function
  public.governance_research_retention_activation_hash(
    text,text,text,text,text,timestamptz,timestamptz
  )
  from public,anon,authenticated,service_role;

comment on function public.governance_research_retention_activation_hash(
  text,text,text,text,text,timestamptz,timestamptz
) is
  'Immutable historical v2 Free research-retention hash with provider evidence and expiry timestamps.';

create function public.governance_research_retention_activation_hash_v3(
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
    'chillywood-research-retention-processor-v3',
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
  ), 'UTF8'), 'sha256'), 'hex')
$$;

revoke all on function
  public.governance_research_retention_activation_hash_v3(
    text,text,text,text,text,timestamptz,timestamptz
  )
  from public,anon,authenticated,service_role;

comment on function public.governance_research_retention_activation_hash_v3(
  text,text,text,text,text,timestamptz,timestamptz
) is
  'Exact current v3 Supabase Pro research-retention activation hash; it enables no capability.';

do $patch_research_retention_v3_hash$
declare
  definition text;
  old_call text :=
    'public.governance_research_retention_activation_hash(';
  new_call text :=
    'public.governance_research_retention_activation_hash_v3(';
begin
  select pg_catalog.pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) into definition;

  if definition is null
     or (
       length(definition) - length(replace(definition, old_call, ''))
     ) / length(old_call) <> 1
     or position(new_call in definition) <> 0 then
    raise exception 'research_retention_v3_persist_patch_rejected'
      using errcode = 'P0001';
  end if;

  execute replace(definition, old_call, new_call);
end;
$patch_research_retention_v3_hash$;

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
  'Persists only the current reviewed Supabase Pro tuple using the distinct v3 hash through the exact Owner, worker, and evaluator chain.';
