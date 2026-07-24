begin;
select no_plan();

select is(
  (
    select count(*)::integer
    from public.intelligence_tasks task
    where task.task_key = 'cognitive-level01-canary-control'
      and task.platform = 'shared'
      and task.environment = 'production'
  ),
  0,
  'zero-state fixture starts without a Level 0/1 task'
);
select is(
  (
    select status
    from public.autonomous_system_emergency_states
    where system_id = 'product_intelligence_operator'
  ),
  'active',
  'forward migration installs an explicit active bootstrap emergency guard'
);
select ok(
  (
    select count(*) = 5
    from pg_class
    where oid in (
      'public.governance_bootstrap_approvals'::regclass,
      'public.governance_bootstrap_approval_states'::regclass,
      'public.governance_bootstrap_executions'::regclass,
      'public.governance_bootstrap_evaluator_proofs'::regclass,
      'public.governance_bootstrap_events'::regclass
    )
      and relrowsecurity
      and relforcerowsecurity
  ),
  'all pre-task bootstrap tables have RLS and FORCE RLS'
);
select ok(
  not has_table_privilege(
    'anon', 'public.governance_bootstrap_approvals', 'SELECT'
  )
  and not has_table_privilege(
    'authenticated', 'public.governance_bootstrap_approvals', 'SELECT'
  )
  and not has_table_privilege(
    'service_role', 'public.governance_bootstrap_approvals', 'SELECT'
  ),
  'no caller role has direct bootstrap approval-table access'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.governance_record_bootstrap_approval(text,text,text,text,text,text,text,text,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.governance_claim_bootstrap_control_plane(uuid,text,text,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.governance_record_bootstrap_evaluator_proof(uuid,text,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.cognitive_bootstrap_level01_canary(text,text,text,text,text)',
    'EXECUTE'
  ),
  'Owner, worker, evaluator, and retired legacy bootstrap grants remain separated'
);
select ok(
  lower(pg_get_functiondef(
    'public.governance_complete_bootstrap_control_plane(uuid,text,text,text,text)'::regprocedure
  )) like '%for share%'
  and lower(pg_get_functiondef(
    'public.governance_complete_bootstrap_control_plane(uuid,text,text,text,text)'::regprocedure
  )) like '%for update%'
  and lower(pg_get_functiondef(
    'public.governance_complete_bootstrap_control_plane(uuid,text,text,text,text)'::regprocedure
  )) like '%pg_advisory_xact_lock%'
  and lower(pg_get_functiondef(
    'public.governance_complete_bootstrap_control_plane(uuid,text,text,text,text)'::regprocedure
  )) like '%proof_value.verdict <> ''passed''%',
  'completion locks emergency, approval, execution, and passed proof before materialization'
);

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.cognitive_bootstrap_level01_canary(
    repeat('1',40),repeat('2',64),repeat('3',64),repeat('4',64),
    'governance_canary_scheduler'
  )$$,
  '42501',
  null,
  'legacy service-role bootstrap cannot bypass the two-party chain'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.intelligence_tasks task
    where task.task_key = 'cognitive-level01-canary-control'
      and task.platform = 'shared'
      and task.environment = 'production'
  ),
  0,
  'denied legacy bootstrap invocation creates no live control-plane rows'
);

insert into public.platform_role_memberships(user_id, email, role, status)
values
  ('c2000000-0000-0000-0000-000000000001', null, 'owner', 'active'),
  ('c2000000-0000-0000-0000-000000000002', null, 'super_admin', 'active');

create temporary table bootstrap_secret_fixture(
  worker_assertion text not null,
  evaluator_assertion text not null
);
insert into bootstrap_secret_fixture(worker_assertion, evaluator_assertion)
values (
  encode(extensions.gen_random_bytes(48), 'base64'),
  encode(extensions.gen_random_bytes(48), 'base64')
);
grant select on bootstrap_secret_fixture to authenticated, service_role;

create temporary table bootstrap_fixture(
  fixture_key text primary key,
  branch_name text not null,
  approval_id uuid,
  approval_hash text,
  target_resource_hash text,
  execution_id uuid,
  execution_receipt_hash text,
  evaluator_proof_hash text
);
grant select, insert, update on bootstrap_fixture
  to authenticated, service_role;
insert into bootstrap_fixture(fixture_key, branch_name)
values
  ('revoked-before-claim', 'codex/bootstrap-revoked'),
  ('revoked-after-stage', 'codex/bootstrap-staged-revoked'),
  ('emergency-before-completion', 'codex/bootstrap-emergency-completion');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c2000000-0000-0000-0000-000000000002',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c2000000-0000-0000-0000-000000000002"}',
  true
);
select throws_ok(
  $$select public.governance_record_bootstrap_approval(
    'Chillywood2025/chillywood-mobile',
    'codex/bootstrap-non-owner',
    repeat('1',40),repeat('2',64),repeat('3',64),repeat('4',64),
    repeat('5',64),'collective-governance-v1',3600
  )$$,
  '42501',
  'governance_owner_identity_required',
  'non-Owner cannot record a zero-state bootstrap approval'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c2000000-0000-0000-0000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c2000000-0000-0000-0000-000000000001"}',
  true
);
select is(
  public.governance_register_two_party_service_principal(
    'cognitive_approved_action_worker',
    encode(extensions.digest(
      convert_to(
        (select worker_assertion from bootstrap_secret_fixture),
        'UTF8'
      ),
      'sha256'
    ),'hex'),
    array['bootstrap_control_plane'],
    transaction_timestamp()+interval '1 day'
  )->>'status',
  'registered',
  'exact Owner registers the bounded bootstrap worker assertion hash'
);
select is(
  public.governance_register_two_party_service_principal(
    'cognitive_independent_evaluator',
    encode(extensions.digest(
      convert_to(
        (select evaluator_assertion from bootstrap_secret_fixture),
        'UTF8'
      ),
      'sha256'
    ),'hex'),
    array['independent_evaluation'],
    transaction_timestamp()+interval '1 day'
  )->>'status',
  'registered',
  'exact Owner registers a separate evaluator assertion hash'
);

update bootstrap_fixture fixture
set (approval_id, approval_hash, target_resource_hash) = (
  select
    (result->>'approvalId')::uuid,
    result->>'approvalHash',
    result->>'targetResourceHash'
  from (
    select public.governance_record_bootstrap_approval(
      'Chillywood2025/chillywood-mobile',
      fixture.branch_name,
      repeat('1',40), repeat('2',64), repeat('3',64), repeat('4',64),
      repeat('5',64), 'collective-governance-v1', 3600
    ) result
  ) approval
);
reset role;
select is(
  (select count(*)::integer from public.governance_bootstrap_approvals),
  3,
  'exact Owner records immutable pre-task approvals without a task or decision'
);
select is(
  (
    select count(*)::integer
    from public.intelligence_tasks task
    where task.task_key = 'cognitive-level01-canary-control'
  ),
  0,
  'Owner approval creates no live control-plane task'
);
select throws_ok(
  $$update public.governance_bootstrap_approvals
    set branch_name = 'codex/bootstrap-mutated'
    where id = (
      select approval_id from bootstrap_fixture
      where fixture_key = 'revoked-before-claim'
    )$$,
  '42501',
  'immutable_governance_bootstrap_evidence',
  'pre-task Owner approval evidence is immutable'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c2000000-0000-0000-0000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c2000000-0000-0000-0000-000000000001"}',
  true
);
select is(
  public.governance_revoke_bootstrap_approval(
    (
      select approval_id from bootstrap_fixture
      where fixture_key = 'revoked-before-claim'
    ),
    repeat('6',64)
  )->>'state',
  'revoked',
  'exact Owner can revoke bootstrap authority before claim'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.governance_record_bootstrap_approval(
    'Chillywood2025/chillywood-mobile',
    'codex/bootstrap-service-owner',
    repeat('1',40),repeat('2',64),repeat('3',64),repeat('4',64),
    repeat('5',64),'collective-governance-v1',3600
  )$$,
  '42501',
  null,
  'service role cannot record an Owner bootstrap approval'
);
select throws_ok(
  $$select public.governance_claim_bootstrap_control_plane(
    fixture.approval_id, fixture.approval_hash,
    fixture.target_resource_hash, 'Chillywood2025/chillywood-mobile',
    fixture.branch_name, repeat('1',40), repeat('2',64), repeat('3',64),
    repeat('4',64), repeat('5',64), 'collective-governance-v1',
    'cognitive_approved_action_worker',
    (select worker_assertion from bootstrap_secret_fixture)
  )
  from bootstrap_fixture fixture
  where fixture.fixture_key = 'revoked-before-claim'$$,
  'P0001',
  'governance_bootstrap_claim_rejected',
  'revocation before claim blocks worker execution'
);
select throws_ok(
  $$select public.governance_claim_bootstrap_control_plane(
    fixture.approval_id, repeat('f',64),
    fixture.target_resource_hash, 'Chillywood2025/chillywood-mobile',
    fixture.branch_name, repeat('1',40), repeat('2',64), repeat('3',64),
    repeat('4',64), repeat('5',64), 'collective-governance-v1',
    'cognitive_approved_action_worker',
    (select worker_assertion from bootstrap_secret_fixture)
  )
  from bootstrap_fixture fixture
  where fixture.fixture_key = 'revoked-after-stage'$$,
  'P0001',
  'governance_bootstrap_claim_rejected',
  'wrong approval hash cannot claim bootstrap authority'
);

update bootstrap_fixture fixture
set execution_id = (
  select (result->>'executionId')::uuid
  from (
    select public.governance_claim_bootstrap_control_plane(
      fixture.approval_id, fixture.approval_hash,
      fixture.target_resource_hash, 'Chillywood2025/chillywood-mobile',
      fixture.branch_name, repeat('1',40), repeat('2',64), repeat('3',64),
      repeat('4',64), repeat('5',64), 'collective-governance-v1',
      'cognitive_approved_action_worker',
      (select worker_assertion from bootstrap_secret_fixture)
    ) result
  ) claim
)
where fixture.fixture_key in (
  'revoked-after-stage','emergency-before-completion'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.governance_bootstrap_executions
  ),
  2,
  'worker claims one execution for each still-active bootstrap approval'
);

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.governance_claim_bootstrap_control_plane(
    fixture.approval_id, fixture.approval_hash,
    fixture.target_resource_hash, 'Chillywood2025/chillywood-mobile',
    fixture.branch_name, repeat('1',40), repeat('2',64), repeat('3',64),
    repeat('4',64), repeat('5',64), 'collective-governance-v1',
    'cognitive_approved_action_worker',
    (select worker_assertion from bootstrap_secret_fixture)
  )
  from bootstrap_fixture fixture
  where fixture.fixture_key = 'emergency-before-completion'$$,
  'P0001',
  'governance_bootstrap_claim_rejected',
  'single-use bootstrap approval rejects a replayed claim'
);
select is(
  (
    select count(*)::integer
    from public.intelligence_tasks task
    where task.task_key = 'cognitive-level01-canary-control'
  ),
  0,
  'claim creates no live control-plane task'
);

update bootstrap_fixture fixture
set execution_receipt_hash = (
  select result->>'executionReceiptHash'
  from (
    select public.governance_stage_bootstrap_control_plane(
      fixture.execution_id, fixture.approval_hash,
      fixture.target_resource_hash, 'cognitive_approved_action_worker',
      (select worker_assertion from bootstrap_secret_fixture)
    ) result
  ) stage
)
where fixture.fixture_key in (
  'revoked-after-stage','emergency-before-completion'
);
select ok(
  (
    select bool_and(execution_receipt_hash ~ '^[a-f0-9]{64}$')
    from bootstrap_fixture
    where execution_id is not null
  ),
  'database derives a bounded receipt for each staged bootstrap'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_governance_switches switch
    join public.intelligence_tasks task on task.id = switch.task_id
    where task.task_key = 'cognitive-level01-canary-control'
  ),
  0,
  'staging creates no governance switch rows'
);
select throws_ok(
  $$select public.governance_record_bootstrap_evaluator_proof(
    fixture.execution_id, fixture.execution_receipt_hash, repeat('7',64),
    'passed', 'cognitive_approved_action_worker',
    (select worker_assertion from bootstrap_secret_fixture)
  )
  from bootstrap_fixture fixture
  where fixture.fixture_key = 'emergency-before-completion'$$,
  '42501',
  'two_party_service_principal_required',
  'worker cannot self-attest the independent evaluator proof'
);
select throws_ok(
  $$select public.governance_record_bootstrap_evaluator_proof(
    fixture.execution_id, repeat('f',64), repeat('7',64),
    'passed', 'cognitive_independent_evaluator',
    (select evaluator_assertion from bootstrap_secret_fixture)
  )
  from bootstrap_fixture fixture
  where fixture.fixture_key = 'emergency-before-completion'$$,
  'P0001',
  'governance_bootstrap_evaluator_proof_rejected',
  'evaluator cannot pass a proof with the wrong staged receipt'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c2000000-0000-0000-0000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c2000000-0000-0000-0000-000000000001"}',
  true
);
select is(
  public.governance_revoke_bootstrap_approval(
    (
      select approval_id from bootstrap_fixture
      where fixture_key = 'revoked-after-stage'
    ),
    repeat('8',64)
  )->>'state',
  'revoked',
  'exact Owner revocation after stage prevents any later live completion'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.governance_record_bootstrap_evaluator_proof(
    fixture.execution_id, fixture.execution_receipt_hash, repeat('8',64),
    'passed', 'cognitive_independent_evaluator',
    (select evaluator_assertion from bootstrap_secret_fixture)
  )
  from bootstrap_fixture fixture
  where fixture.fixture_key = 'revoked-after-stage'$$,
  'P0001',
  'governance_bootstrap_evaluator_proof_rejected',
  'revocation after stage blocks evaluator progression'
);
update bootstrap_fixture fixture
set evaluator_proof_hash = repeat('9',64)
where fixture.fixture_key = 'emergency-before-completion';
select is(
  public.governance_record_bootstrap_evaluator_proof(
    fixture.execution_id, fixture.execution_receipt_hash,
    fixture.evaluator_proof_hash, 'passed',
    'cognitive_independent_evaluator',
    (select evaluator_assertion from bootstrap_secret_fixture)
  )->>'verdict',
  'passed',
  'independent evaluator records a receipt-bound passed proof'
)
from bootstrap_fixture fixture
where fixture.fixture_key = 'emergency-before-completion';
reset role;
select is(
  (
    select state
    from public.governance_bootstrap_approval_states state
    join bootstrap_fixture fixture on fixture.approval_id = state.approval_id
    where fixture.fixture_key = 'emergency-before-completion'
  ),
  'evaluated',
  'passed evaluator proof advances staging only to evaluated'
);
select is(
  (
    select count(*)::integer
    from public.intelligence_tasks task
    where task.task_key = 'cognitive-level01-canary-control'
  ),
  0,
  'evaluator proof still creates no live control-plane task'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c2000000-0000-0000-0000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c2000000-0000-0000-0000-000000000001"}',
  true
);
select is(
  public.governance_set_cognitive_emergency_state(
    'emergency_stop', repeat('a',64)
  )->>'status',
  'emergency_stop',
  'exact Owner can activate the cognitive emergency stop'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.governance_complete_bootstrap_control_plane(
    fixture.execution_id, fixture.execution_receipt_hash,
    fixture.evaluator_proof_hash, 'cognitive_approved_action_worker',
    (select worker_assertion from bootstrap_secret_fixture)
  )
  from bootstrap_fixture fixture
  where fixture.fixture_key = 'emergency-before-completion'$$,
  'P0001',
  'governance_bootstrap_completion_rejected',
  'emergency stop after evaluator proof blocks successful completion'
);
select is(
  (
    select count(*)::integer
    from public.intelligence_tasks task
    where task.task_key = 'cognitive-level01-canary-control'
  ),
  0,
  'failed emergency-stop completion leaves no partial control-plane task'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c2000000-0000-0000-0000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c2000000-0000-0000-0000-000000000001"}',
  true
);
select is(
  public.governance_set_cognitive_emergency_state(
    'active', repeat('b',64)
  )->>'status',
  'active',
  'exact Owner can explicitly resume after emergency review'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(
  public.governance_complete_bootstrap_control_plane(
    fixture.execution_id, fixture.execution_receipt_hash,
    fixture.evaluator_proof_hash, 'cognitive_approved_action_worker',
    (select worker_assertion from bootstrap_secret_fixture)
  )->>'state',
  'completed',
  'worker atomically completes only after matching passed evaluator proof'
)
from bootstrap_fixture fixture
where fixture.fixture_key = 'emergency-before-completion';
reset role;
select is(
  (
    select count(*)::integer
    from public.intelligence_tasks task
    where task.task_key = 'cognitive-level01-canary-control'
      and task.platform = 'shared'
      and task.environment = 'production'
  ),
  1,
  'completion creates exactly one bounded Level 0/1 task'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_governance_switches switch
    join public.intelligence_tasks task on task.id = switch.task_id
    where task.task_key = 'cognitive-level01-canary-control'
  ),
  10,
  'completion creates every reviewed Level 0/1 and sentinel switch'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_governance_switches switch
    join public.intelligence_tasks task on task.id = switch.task_id
    where task.task_key = 'cognitive-level01-canary-control'
      and switch.enabled
  ),
  0,
  'every switch remains off after bootstrap completion'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_governance_switches switch
    join public.intelligence_tasks task on task.id = switch.task_id
    where task.task_key = 'cognitive-level01-canary-control'
      and switch.switch_key in (
        'cognitive_level2_production_repairs_enabled',
        'cognitive_user_derived_memory_enabled'
      )
      and not switch.enabled
  ),
  2,
  'Level 2 repair and user-derived memory remain explicitly off'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_level01_schedule_definitions schedule
    join public.intelligence_tasks task on task.id = schedule.task_id
    where task.task_key = 'cognitive-level01-canary-control'
  ),
  5,
  'completion creates the five bounded schedule definitions'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_level01_schedule_definitions schedule
    join public.intelligence_tasks task on task.id = schedule.task_id
    where task.task_key = 'cognitive-level01-canary-control'
      and schedule.enabled
  ),
  0,
  'all schedules remain disabled after bootstrap'
);
select ok(
  (
    select not retention.user_derived_memory_allowed
      and not retention.raw_user_reports_allowed
      and not retention.raw_private_messages_allowed
      and not retention.raw_private_media_allowed
      and not retention.raw_user_analytics_allowed
      and not retention.private_model_input_allowed
    from public.cognitive_retention_policy_states retention
    join public.intelligence_tasks task on task.id = retention.task_id
    where task.task_key = 'cognitive-level01-canary-control'
  ),
  'bootstrap retention state permits no private or user-derived data'
);
select is(
  (
    select count(*)::integer
    from public.governance_council_roles role
    join public.intelligence_tasks task on task.id = role.task_id
    where task.task_key = 'cognitive-level01-canary-control'
  ),
  9,
  'bootstrap creates all nine non-executing constitutional council roles'
);
select is(
  (
    select count(*)::integer
    from public.governance_bootstrap_events event
    join bootstrap_fixture fixture on fixture.approval_id = event.approval_id
    where fixture.fixture_key = 'emergency-before-completion'
  ),
  5,
  'successful chain preserves Owner, claim, stage, evaluator, and completion events'
);

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.governance_complete_bootstrap_control_plane(
    fixture.execution_id, fixture.execution_receipt_hash,
    fixture.evaluator_proof_hash, 'cognitive_approved_action_worker',
    (select worker_assertion from bootstrap_secret_fixture)
  )
  from bootstrap_fixture fixture
  where fixture.fixture_key = 'emergency-before-completion'$$,
  'P0001',
  'governance_bootstrap_completion_rejected',
  'completed bootstrap receipt cannot replay'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c2000000-0000-0000-0000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c2000000-0000-0000-0000-000000000001"}',
  true
);
select throws_ok(
  $$select public.governance_record_bootstrap_approval(
    'Chillywood2025/chillywood-mobile',
    'codex/bootstrap-after-complete',
    repeat('1',40),repeat('2',64),repeat('3',64),repeat('4',64),
    repeat('5',64),'collective-governance-v1',3600
  )$$,
  'P0001',
  'governance_bootstrap_owner_approval_rejected',
  'zero-state approval path closes after the control plane exists'
);
reset role;

select * from finish();
rollback;
