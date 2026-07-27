-- Complete the authenticated Owner registration path for the isolated
-- product-quality evaluator identity already accepted by the assertion table,
-- operation allowlist, evaluator proof constraints, and runtime RPCs.

create or replace function public.governance_register_two_party_service_principal(
  p_service_identity text,
  p_assertion_hash text,
  p_allowed_operations text[],
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  evidence_hash_value text;
begin
  if p_service_identity not in (
       'cognitive_approved_action_worker',
       'product_experience_baseline_service',
       'livekit_experience_sentinel',
       'visual_product_experience_sentinel',
       'installed_journey_sentinel',
       'product_quality_triage_router',
       'model_independence_attestation_service',
       'cognitive_independent_evaluator',
       'cognitive_product_quality_evaluator'
     )
     or p_assertion_hash !~ '^[a-f0-9]{64}$'
     or p_allowed_operations is null
     or cardinality(p_allowed_operations) not between 1 and 64
     or not p_allowed_operations <@ array[
       'bootstrap_control_plane','set_switch','public_research_ingest',
       'collective_deliberation','model_independence_attestation',
       'model_advisory','livekit_experience_canary',
       'visual_experience_canary','installed_journey_canary',
       'product_quality_triage','github_draft_pr',
       'independent_evaluation'
     ]::text[]
     or exists (
       select 1
       from unnest(p_allowed_operations) allowed_operation
       where not public.governance_service_identity_allows_operation(
         p_service_identity, allowed_operation
       )
     )
     or p_expires_at <= transaction_timestamp()
     or p_expires_at > transaction_timestamp() + interval '365 days' then
    raise exception 'two_party_service_principal_registration_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.governance_two_party_service_assertions(
    service_identity, assertion_hash, allowed_operations, registered_by,
    status, issued_at, expires_at, revoked_at, revoked_by, revocation_hash
  ) values (
    p_service_identity, p_assertion_hash, p_allowed_operations, owner_id,
    'active', transaction_timestamp(), p_expires_at, null, null, null
  )
  on conflict (service_identity) do update
    set assertion_hash = excluded.assertion_hash,
        allowed_operations = excluded.allowed_operations,
        registered_by = excluded.registered_by,
        status = 'active',
        issued_at = transaction_timestamp(),
        expires_at = excluded.expires_at,
        revoked_at = null,
        revoked_by = null,
        revocation_hash = null;

  evidence_hash_value := encode(extensions.digest(
    convert_to(p_service_identity || ':' || p_assertion_hash, 'UTF8'),
    'sha256'
  ), 'hex');

  insert into public.governance_audit_events(
    task_id, project_id, platform, environment, entity_type, entity_id,
    event_type, actor_identity_hash, evidence_hash
  )
  select task.id, task.project_id, task.platform, task.environment,
    'switch', task.id, 'two_party_service_identity_registered',
    encode(extensions.digest(
      convert_to(owner_id::text, 'UTF8'), 'sha256'
    ), 'hex'),
    evidence_hash_value
  from public.intelligence_tasks task
  where task.task_key = 'cognitive-level01-canary-control'
  order by task.created_at
  limit 1;

  return jsonb_build_object(
    'serviceIdentity', p_service_identity,
    'status', 'registered',
    'assertionHash', p_assertion_hash,
    'expiresAt', p_expires_at
  );
end;
$$;

revoke all on function public.governance_register_two_party_service_principal(
  text, text, text[], timestamptz
) from public, anon, service_role;
grant execute on function public.governance_register_two_party_service_principal(
  text, text, text[], timestamptz
) to authenticated;

comment on function public.governance_register_two_party_service_principal(
  text, text, text[], timestamptz
) is
  'Exact authenticated-Owner registration for isolated two-party service assertion identities, including the independent product-quality evaluator.';
