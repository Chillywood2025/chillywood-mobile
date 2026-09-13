begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'public', 'privileged_mutation_operation_receipts',
  'privileged ambiguous outcomes retain one server-authoritative operation receipt'
);
select has_function(
  'public', 'admin_grant_platform_role_by_email', array['text','text','text','text'],
  'staff role grants accept an exact operation key'
);
select has_function(
  'public', 'admin_dmca_add_strike',
  array['uuid','text','text','text','text','text','text','text'],
  'DMCA strikes accept an exact operation key'
);

insert into auth.users (id, email, email_confirmed_at, is_sso_user, is_anonymous)
values
  ('9d000000-0000-4000-8000-000000000001', 'idempotency-owner@example.test', now(), false, false),
  ('9d000000-0000-4000-8000-000000000002', 'idempotency-staff@example.test', now(), false, false),
  ('9d000000-0000-4000-8000-000000000003', 'idempotency-target@example.test', now(), false, false);

insert into auth.sessions (id, user_id)
values (
  '9e000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000001'
);

insert into public.platform_role_memberships (
  role, user_id, email, status, notes, granted_by
) values (
  'owner',
  '9d000000-0000-4000-8000-000000000001',
  'idempotency-owner@example.test',
  'active',
  'Privileged mutation idempotency fixture',
  'pgtap'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"9d000000-0000-4000-8000-000000000001","session_id":"9e000000-0000-4000-8000-000000000001","email":"idempotency-owner@example.test"}',
  true
);

select is(
  public.admin_grant_platform_role_by_email(
    'idempotency-staff@example.test',
    'moderator',
    'One exact staff role grant',
    'staff-role-grant:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )->>'idempotent',
  'false',
  'the first staff role operation performs the exact grant'
);
select is(
  public.admin_grant_platform_role_by_email(
    'idempotency-staff@example.test',
    'moderator',
    'One exact staff role grant',
    'staff-role-grant:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )->>'idempotent',
  'true',
  'an ambiguous staff role retry replays the original result'
);
select is(
  (
    select count(*)::integer
    from public.privileged_mutation_operation_receipts
    where operation_family = 'staff_role_grant'
      and actor_user_id = '9d000000-0000-4000-8000-000000000001'
      and operation_key = 'staff-role-grant:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ),
  1,
  'one staff role intent creates one actor-bound operation receipt'
);
select is(
  (
    select count(*)::integer
    from public.platform_role_memberships
    where user_id = '9d000000-0000-4000-8000-000000000002'
      and role = 'moderator'
      and status = 'active'
  ),
  1,
  'one staff role intent leaves exactly one active target membership'
);
select throws_ok(
  $$select public.admin_grant_platform_role_by_email(
      'idempotency-staff@example.test',
      'moderator',
      'Changed staff grant reason',
      'staff-role-grant:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    )$$,
  'P0001', 'platform_staff_operation_key_conflict',
  'staff operation-key reuse with a changed exact request fails closed'
);

insert into public.dmca_cases (
  id,
  case_number,
  status,
  reporter_name,
  reporter_email,
  copyrighted_work_description,
  allegedly_infringing_content_type,
  allegedly_infringing_content_id,
  uploader_user_id,
  good_faith_statement,
  accuracy_penalty_perjury_statement,
  electronic_signature,
  source
) values (
  '9f000000-0000-4000-8000-000000000001',
  'CW-IDEMPOTENCY-0001',
  'content_disabled',
  'Rights Owner',
  'rights-owner@example.test',
  'Exact copyrighted work',
  'creator_video',
  'video-idempotency-1',
  '9d000000-0000-4000-8000-000000000003',
  true,
  true,
  'Rights Owner',
  'admin_created'
);

select lives_ok(
  $$select public.admin_dmca_add_strike(
      '9f000000-0000-4000-8000-000000000001'::uuid,
      '9d000000-0000-4000-8000-000000000003',
      null,
      'creator_video',
      'video-idempotency-1',
      'standard',
      'One exact copyright strike',
      'dmca-strike:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    )$$,
  'the first exact DMCA strike intent commits'
);
select lives_ok(
  $$select public.admin_dmca_add_strike(
      '9f000000-0000-4000-8000-000000000001'::uuid,
      '9d000000-0000-4000-8000-000000000003',
      null,
      'creator_video',
      'video-idempotency-1',
      'standard',
      'One exact copyright strike',
      'dmca-strike:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    )$$,
  'an ambiguous DMCA strike retry replays safely'
);
select is(
  (
    select count(*)::integer
    from public.dmca_strikes
    where dmca_case_id = '9f000000-0000-4000-8000-000000000001'
      and user_id = '9d000000-0000-4000-8000-000000000003'
      and content_id = 'video-idempotency-1'
      and strike_status = 'active'
  ),
  1,
  'one logical DMCA strike intent creates exactly one active punitive record'
);
select is(
  (
    select count(*)::integer
    from public.privileged_mutation_operation_receipts
    where operation_family = 'dmca_strike'
      and actor_user_id = '9d000000-0000-4000-8000-000000000001'
      and operation_key = 'dmca-strike:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  ),
  1,
  'one DMCA strike intent creates one actor-bound operation receipt'
);
select throws_ok(
  $$select public.admin_dmca_add_strike(
      '9f000000-0000-4000-8000-000000000001'::uuid,
      '9d000000-0000-4000-8000-000000000003',
      null,
      'creator_video',
      'changed-video-id',
      'standard',
      'One exact copyright strike',
      'dmca-strike:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    )$$,
  'P0001', 'dmca_strike_operation_key_conflict',
  'DMCA operation-key reuse with a changed exact target fails closed'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_grant_platform_role_by_email(text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.admin_grant_platform_role_by_email(text,text,text,text)',
    'EXECUTE'
  ),
  'the idempotent staff role API is authenticated-only'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_dmca_add_strike(uuid,text,text,text,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.admin_dmca_add_strike(uuid,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'the idempotent DMCA strike API is authenticated-only'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.privileged_mutation_operation_receipts',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.privileged_mutation_operation_receipts',
    'INSERT'
  )
  and not has_table_privilege(
    'anon',
    'public.privileged_mutation_operation_receipts',
    'SELECT'
  ),
  'operation receipts are not directly client-readable or writable'
);

select * from finish();
rollback;
