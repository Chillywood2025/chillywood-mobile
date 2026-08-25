begin;
select no_plan();

select is(
  (
    select count(*)::integer
    from public.cognitive_deferred_evidence_v2_candidates
  ),
  12,
  'all twelve canonical Manifest V2 candidates are represented exactly'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_deferred_evidence_v2_candidates
    where manifest_hash =
      '665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793'
  ),
  12,
  'every candidate is bound to the canonical Manifest V2 hash'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_deferred_evidence_v2_candidates
    where evidence_key !~ '^[a-f0-9]{64}$'
       or future_import_key !~ '^[a-f0-9]{64}$'
       or source_commit !~ '^[a-f0-9]{40}$'
       or not public.governance_hash_array_valid(metric_hashes, 1, 8)
  ),
  0,
  'candidate source and metric identities are exact hashes'
);

select is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      'public.cognitive_deferred_evidence_v2_candidates'::regclass,
      'public.cognitive_deferred_evidence_v2_decision_receipts'::regclass
    )
      and relrowsecurity
      and relforcerowsecurity
  ),
  2,
  'candidate and decision tables have forced RLS'
);

select ok(
  not has_table_privilege(
    'service_role',
    'public.cognitive_deferred_evidence_v2_candidates',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'service_role',
    'public.cognitive_deferred_evidence_v2_decision_receipts',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'service-role cannot read or mutate deferred-evidence records'
);

select ok(
  has_table_privilege(
    'authenticated',
    'public.cognitive_deferred_evidence_v2_decision_receipts',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.cognitive_deferred_evidence_v2_decision_receipts',
    'INSERT,UPDATE,DELETE'
  ),
  'authenticated callers can only read their exact-Owner decision receipts'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.governance_record_deferred_evidence_v2_decision(uuid,uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.governance_record_deferred_evidence_v2_decision(uuid,uuid,text,text,text,text)',
    'EXECUTE'
  ),
  'only authenticated exact-Owner calls may record decisions'
);

select ok(
  pg_get_functiondef(
    'public.governance_record_deferred_evidence_v2_decision(uuid,uuid,text,text,text,text)'::regprocedure
  ) like '%cognitive_provider_independent_visual_activation_outcomes%'
  and pg_get_functiondef(
    'public.governance_record_deferred_evidence_v2_decision(uuid,uuid,text,text,text,text)'::regprocedure
  ) like '%cognitive_visual_experience_sentinel_enabled%'
  and pg_get_functiondef(
    'public.governance_record_deferred_evidence_v2_decision(uuid,uuid,text,text,text,text)'::regprocedure
  ) like '%schedule.enabled%',
  'imports require the live core gate while siblings and schedules remain off'
);

select ok(
  pg_get_functiondef(
    'public.governance_record_deferred_evidence_v2_decision(uuid,uuid,text,text,text,text)'::regprocedure
  ) like '%now_at >= candidate.expires_at%'
  and pg_get_functiondef(
    'public.governance_record_deferred_evidence_v2_decision(uuid,uuid,text,text,text,text)'::regprocedure
  ) like '%contradicted_by_newer_evidence%'
  and pg_get_functiondef(
    'public.governance_record_deferred_evidence_v2_decision(uuid,uuid,text,text,text,text)'::regprocedure
  ) like '%premium_gate_unresolved%'
  and pg_get_functiondef(
    'public.governance_record_deferred_evidence_v2_decision(uuid,uuid,text,text,text,text)'::regprocedure
  ) like '%physical_installed_proof_incomplete%',
  'stale, contradicted, Premium-gated, and incomplete evidence fail closed'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_deferred_evidence_v2_decision_receipts
  ),
  0,
  'the migration imports no evidence by itself'
);

insert into auth.users(id, is_sso_user, is_anonymous, email_confirmed_at)
values
  ('f4000000-0000-4000-8000-000000000001', false, false, now()),
  ('f4000000-0000-4000-8000-000000000002', false, false, now());

insert into public.platform_role_memberships(user_id, email, role, status)
values
  ('f4000000-0000-4000-8000-000000000001', null, 'owner', 'active'),
  ('f4000000-0000-4000-8000-000000000002', null, 'super_admin', 'active');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'f4000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"f4000000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok(
  $$select public.governance_record_deferred_evidence_v2_decision(
    'f5000000-0000-4000-8000-000000000001',
    'f6000000-0000-4000-8000-000000000001',
    'cb6bb1f1a6b268dccd97ffdc21927bc134ce4febe771d619fe991645d6a58349',
    'imported', 'eligible_exact_bound_unexpired', repeat('1',64)
  )$$,
  '42501',
  'governance_owner_identity_required',
  'a non-Owner cannot record an evidence decision'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'f4000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"f4000000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok(
  $$select public.governance_record_deferred_evidence_v2_decision(
    'f5000000-0000-4000-8000-000000000001',
    'f6000000-0000-4000-8000-000000000001',
    'cb6bb1f1a6b268dccd97ffdc21927bc134ce4febe771d619fe991645d6a58349',
    'imported', 'eligible_exact_bound_unexpired', repeat('1',64)
  )$$,
  'P0001',
  'cognitive_deferred_evidence_v2_decision_rejected',
  'even the exact Owner cannot import before the live core gate passes'
);
reset role;

select ok(
  (
    select count(*) = 2
    from pg_trigger
    where not tgisinternal
      and tgname in (
        'cognitive_deferred_evidence_v2_candidates_immutable',
        'cognitive_deferred_evidence_v2_decisions_immutable'
      )
  ),
  'canonical candidates and decision receipts are append-only'
);

select * from finish();
rollback;
