begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column(
  'public', 'platform_role_memberships', 'expires_at',
  'platform role memberships carry bounded expiry authority'
);
select has_function(
  'public', 'platform_exact_current_session_authority_internal', array[]::text[],
  'current platform authority has a narrow live-session helper'
);
select has_function(
  'public', 'platform_resolve_exact_confirmed_subject_by_email_internal', array['text'],
  'email grant APIs share one exact confirmed-subject resolver'
);
select has_function(
  'public', 'cognitive_can_read_scope',
  array['uuid','uuid','cognitive_platform'],
  'cognitive RLS has an exact live-subject scope predicate'
);
select has_trigger(
  'public', 'platform_staff_permission_grants',
  'enforce_platform_staff_permission_exact_subject',
  'active staff permissions have an exact-subject table guard'
);
select has_trigger(
  'public', 'platform_break_glass_sessions',
  'enforce_platform_break_glass_exact_subject',
  'active Break Glass sessions have an exact First Owner table guard'
);

select ok(
  not exists (
    select 1
    from public.platform_role_memberships membership
    where membership.status = 'active'
      and (
        nullif(trim(coalesce(membership.user_id, '')), '') is null
        or not exists (
          select 1 from auth.users subject
          where subject.id::text = membership.user_id
            and subject.email_confirmed_at is not null
            and subject.deleted_at is null
        )
        or (membership.expires_at is not null and membership.expires_at <= now())
      )
  ),
  'migration quarantines every active unbound, unconfirmed, or expired platform role'
);
select ok(
  not exists (
    select 1 from public.platform_staff_permission_grants grant_row
    where grant_row.status = 'active'
      and (
        nullif(trim(coalesce(grant_row.target_user_id, '')), '') is null
        or not exists (
          select 1 from auth.users subject
          where subject.id::text = grant_row.target_user_id
            and subject.email_confirmed_at is not null
            and subject.deleted_at is null
        )
      )
  ),
  'migration leaves no active unbound or unconfirmed staff permission'
);
select ok(
  not exists (
    select 1 from public.beta_access_memberships membership
    where membership.access_status = 'active'
      and (
        nullif(trim(coalesce(membership.user_id, '')), '') is null
        or not exists (
          select 1 from auth.users subject
          where subject.id::text = membership.user_id
            and subject.email_confirmed_at is not null
            and subject.deleted_at is null
        )
      )
  ),
  'migration leaves no active unbound or unconfirmed beta membership'
);
select ok(
  not exists (
    select 1 from public.sandbox_monetization_testers tester
    where tester.status = 'active'
      and (
        nullif(trim(coalesce(tester.user_id, '')), '') is null
        or not exists (
          select 1 from auth.users subject
          where subject.id::text = tester.user_id
            and subject.email_confirmed_at is not null
            and subject.deleted_at is null
        )
        or (tester.expires_at is not null and tester.expires_at <= now())
      )
  ),
  'migration leaves no active unbound, unconfirmed, or expired sandbox tester'
);

insert into auth.users (
  id, email, email_confirmed_at, is_sso_user, is_anonymous
)
values
  ('94000000-0000-4000-8000-000000000001', 'owner-exact@example.test', now(), false, false),
  ('94000000-0000-4000-8000-000000000002', 'wrong-user@example.test', now(), false, false),
  ('94000000-0000-4000-8000-000000000003', 'operator-exact@example.test', now(), false, false),
  ('94000000-0000-4000-8000-000000000004', 'moderator-exact@example.test', now(), false, false),
  ('94000000-0000-4000-8000-000000000005', 'unconfirmed@example.test', null, false, false),
  ('94000000-0000-4000-8000-000000000006', 'beta-exact@example.test', now(), false, false),
  ('94000000-0000-4000-8000-000000000007', 'sandbox-exact@example.test', now(), false, false),
  ('94000000-0000-4000-8000-000000000008', 'historical-current@example.test', now(), false, false),
  ('94000000-0000-4000-8000-000000000009', 'staff-recycled@example.test', now(), false, false),
  ('94000000-0000-4000-8000-000000000010', 'ambiguous@example.test', now(), true, false),
  ('94000000-0000-4000-8000-000000000011', 'ambiguous@example.test', now(), true, false),
  ('94000000-0000-4000-8000-000000000012', 'expired-owner@example.test', now(), false, false);

insert into auth.sessions (id, user_id)
values
  ('95000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001'),
  ('95000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000002'),
  ('95000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000003'),
  ('95000000-0000-4000-8000-000000000004', '94000000-0000-4000-8000-000000000004'),
  ('95000000-0000-4000-8000-000000000006', '94000000-0000-4000-8000-000000000006'),
  ('95000000-0000-4000-8000-000000000007', '94000000-0000-4000-8000-000000000007'),
  ('95000000-0000-4000-8000-000000000008', '94000000-0000-4000-8000-000000000008'),
  ('95000000-0000-4000-8000-000000000009', '94000000-0000-4000-8000-000000000009'),
  ('95000000-0000-4000-8000-000000000012', '94000000-0000-4000-8000-000000000012'),
  ('95000000-0000-4000-8000-000000000013', '94000000-0000-4000-8000-000000000001');

insert into public.platform_role_memberships (
  role, user_id, email, status, notes, granted_by
)
values (
  'owner', '94000000-0000-4000-8000-000000000001',
  'owner-exact@example.test', 'active', 'Exact owner fixture', 'pgtap'
);

insert into public.platform_first_owner_authority (
  owner_membership_id, owner_user_id, owner_email,
  established_by, established_reason
)
select membership.id, membership.user_id, membership.email,
       'pgtap', 'Exact First Owner fixture'
from public.platform_role_memberships membership
where membership.role = 'owner'
  and membership.user_id = '94000000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.platform_role_memberships(role,email,status)
    values ('operator','email-only@example.test','active')$$,
  'P0001', 'platform_role_exact_confirmed_subject_required',
  'email-only active platform role is rejected'
);
select throws_ok(
  $$insert into public.platform_role_memberships(role,user_id,email,status)
    values ('operator','94000000-0000-4000-8000-000000000005','unconfirmed@example.test','active')$$,
  'P0001', 'platform_role_exact_confirmed_subject_required',
  'unconfirmed subject cannot receive an active platform role'
);
select throws_ok(
  $$insert into public.platform_role_memberships(role,user_id,email,status,expires_at)
    values ('operator','94000000-0000-4000-8000-000000000002','wrong-user@example.test','active',now()-interval '1 second')$$,
  'P0001', 'platform_role_exact_confirmed_subject_required',
  'expired role cannot be activated'
);
select throws_ok(
  $$insert into public.platform_first_owner_authority(
      owner_membership_id,owner_user_id,owner_email,established_by,established_reason
    ) select id,'94000000-0000-4000-8000-000000000002','owner-exact@example.test','pgtap','Mismatch marker'
      from public.platform_role_memberships
      where user_id='94000000-0000-4000-8000-000000000001' and role='owner'$$,
  'P0001', 'first_owner_exact_confirmed_subject_required',
  'First Owner marker rejects a different user_id even when email matches'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001","session_id":"95000000-0000-4000-8000-000000000001","email":"owner-exact@example.test"}',
  true
);

select ok(public.has_platform_role(array['owner']), 'exact owner has owner authority on the live session');
select ok(public.has_platform_permission('security_review'), 'exact owner retains owner permission authority');
select is(
  public.governance_assert_exact_owner(),
  '94000000-0000-4000-8000-000000000001'::uuid,
  'cognitive governance Owner authority requires and returns the exact live subject'
);
select ok(
  public.governance_exact_owner('94000000-0000-4000-8000-000000000001'),
  'cognitive governance recognizes the exact confirmed active Owner subject'
);

-- Stored-subject provenance remains intentionally session-independent for the
-- trusted service path. Caller authority below remains exact-session-bound.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select ok(
  public.governance_exact_owner('94000000-0000-4000-8000-000000000001'),
  'service provenance can validate an exact active Owner subject without a caller JWT session'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001","session_id":"95000000-0000-4000-8000-000000000001","email":"owner-exact@example.test"}',
  true
);
update auth.sessions
set not_after=now()-interval '1 second'
where id='95000000-0000-4000-8000-000000000001';
select ok(
  not public.platform_exact_current_session_authority_internal(),
  'past auth.sessions.not_after fails exact current-session authority closed'
);
select throws_ok(
  $$select public.governance_assert_exact_owner()$$,
  '42501', 'governance_owner_identity_required',
  'time-box-expired session cannot retain governance Owner caller authority'
);
select ok(
  not public.cognitive_can_read_scope(
    '97000000-0000-4000-8000-000000000001'::uuid,
    null,
    null
  ),
  'time-box-expired session cannot retain cognitive read authority'
);

update auth.sessions
set not_after=now()+interval '1 day'
where id='95000000-0000-4000-8000-000000000001';
select ok(
  public.platform_exact_current_session_authority_internal(),
  'future auth.sessions.not_after preserves the exact live session'
);
select is(
  public.governance_assert_exact_owner(),
  '94000000-0000-4000-8000-000000000001'::uuid,
  'future-bounded exact live session retains governance Owner caller authority'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001","email":"owner-exact@example.test"}',
  true
);
select ok(
  not public.platform_exact_current_session_authority_internal(),
  'missing session generation fails exact current-session authority closed'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001","session_id":"95000000-0000-4000-8000-000000000013","email":"owner-exact@example.test"}',
  true
);
select ok(
  public.platform_exact_current_session_authority_internal(),
  'second exact live generation is valid before server-side session deletion'
);
delete from auth.sessions
where id='95000000-0000-4000-8000-000000000013';
select ok(
  not public.platform_exact_current_session_authority_internal(),
  'deleted server-side session immediately loses exact caller authority'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001","session_id":"95000000-0000-4000-8000-000000000001","email":"owner-exact@example.test"}',
  true
);
select is(
  public.autonomous_actor_authority_role(
    '94000000-0000-4000-8000-000000000001', 'ignored@example.test'
  ),
  'owner',
  'autonomous owner authority binds exact current user_id and ignores email'
);
select ok(
  public.is_platform_owner_user('94000000-0000-4000-8000-000000000001'),
  'owner target readback uses exact confirmed user_id'
);
select ok(
  public.is_first_owner('94000000-0000-4000-8000-000000000001', 'wrong@example.test'),
  'First Owner matches immutable user_id while email is audit-only'
);
select ok(
  public.platform_first_owner_only_break_glass(
    '94000000-0000-4000-8000-000000000001', 'wrong@example.test'
  ),
  'First Owner break-glass requires the exact live caller'
);
select throws_ok(
  $$insert into public.platform_break_glass_sessions(
      actor_email,actor_role,status,reason,expires_at
    ) values (
      'owner-exact@example.test','owner','active',
      'Email-only Break Glass fixture',now()+interval '1 hour'
    )$$,
  'P0001', 'break_glass_exact_first_owner_subject_required',
  'email-only Break Glass cannot become active'
);
select throws_ok(
  $$insert into public.platform_break_glass_sessions(
      actor_user_id,actor_email,actor_role,status,reason,expires_at
    ) values (
      '94000000-0000-4000-8000-000000000002','owner-exact@example.test',
      'owner','active','Wrong-subject Break Glass fixture',now()+interval '1 hour'
    )$$,
  'P0001', 'break_glass_exact_first_owner_subject_required',
  'matching email cannot make the wrong user an active Break Glass actor'
);
select throws_ok(
  $$insert into public.platform_break_glass_sessions(
      actor_user_id,actor_email,actor_role,status,reason,expires_at
    ) values (
      '94000000-0000-4000-8000-000000000001','owner-exact@example.test',
      'owner','active','Unbounded Break Glass fixture',null
    )$$,
  'P0001', 'break_glass_exact_first_owner_subject_required',
  'active Break Glass requires a bounded future expiry'
);
insert into public.platform_break_glass_sessions(
  id,actor_user_id,actor_email,actor_role,status,reason,expires_at
) values (
  '96000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001','owner-exact@example.test',
  'owner','active','Exact Break Glass fixture',now()+interval '1 hour'
);
select is(
  public.platform_current_break_glass_session_id(
    '94000000-0000-4000-8000-000000000001','recycled@example.test'
  ),
  '96000000-0000-4000-8000-000000000001'::uuid,
  'Break Glass readback binds exact user_id and ignores email'
);
select is(
  public.platform_current_break_glass_session_id(
    '94000000-0000-4000-8000-000000000002','owner-exact@example.test'
  ),
  null,
  'Break Glass readback cannot be inherited through recycled email'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000002","session_id":"95000000-0000-4000-8000-000000000002","email":"owner-exact@example.test"}',
  true
);
select ok(
  not public.has_platform_role(array['owner']),
  'wrong user cannot inherit owner role from a matching JWT email'
);
select ok(
  not public.has_platform_permission('security_review'),
  'wrong user cannot inherit owner permissions from a matching JWT email'
);
select ok(
  not public.governance_exact_owner('94000000-0000-4000-8000-000000000002'),
  'recycled Owner email cannot make the wrong UUID an exact governance Owner'
);
select throws_ok(
  $$select public.governance_assert_exact_owner()$$,
  '42501', 'governance_owner_identity_required',
  'recycled Owner email cannot grant governance Owner caller authority'
);
select is(
  public.autonomous_actor_authority_role(
    '94000000-0000-4000-8000-000000000002', 'owner-exact@example.test'
  ),
  null,
  'wrong user cannot inherit autonomous owner authority from email'
);
select ok(
  not public.is_first_owner(
    '94000000-0000-4000-8000-000000000002', 'owner-exact@example.test'
  ),
  'wrong user cannot inherit First Owner marker authority from email'
);
select ok(
  not public.platform_first_owner_only_break_glass(
    '94000000-0000-4000-8000-000000000001', 'owner-exact@example.test'
  ),
  'caller-supplied First Owner id cannot establish break-glass authority'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001","session_id":"95000000-0000-4000-8000-999999999999","email":"owner-exact@example.test"}',
  true
);
select ok(
  not public.platform_exact_current_session_authority_internal(),
  'stale non-existent session generation fails exact current-session authority closed'
);
select ok(
  not public.has_platform_role(array['owner']),
  'missing/stale session generation fails closed without throwing'
);
select throws_ok(
  $$select public.governance_assert_exact_owner()$$,
  '42501', 'governance_owner_identity_required',
  'stale session generation cannot retain governance Owner authority'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001","session_id":"95000000-0000-4000-8000-000000000001","email":"owner-exact@example.test"}',
  true
);
update auth.users
set banned_until = now() + interval '1 hour'
where id = '94000000-0000-4000-8000-000000000001';
select ok(
  not public.has_platform_role(array['owner']),
  'restricted current account cannot retain platform authority'
);
update auth.users
set banned_until = null
where id = '94000000-0000-4000-8000-000000000001';
insert into public.account_deletion_requests(
  user_id,status,reason,delete_after,restore_deadline
) values (
  '94000000-0000-4000-8000-000000000001','scheduled',
  'Exact-subject restore-only fixture',now()+interval '30 days',now()+interval '30 days'
);
select ok(
  not public.has_platform_role(array['owner']),
  'restore-only current session cannot retain platform authority'
);
delete from public.account_deletion_requests
where user_id='94000000-0000-4000-8000-000000000001'
  and reason='Exact-subject restore-only fixture';

select is(
  public.admin_grant_platform_role_by_email(
    'operator-exact@example.test', 'operator', 'Exact operator grant'
  )->>'userId',
  '94000000-0000-4000-8000-000000000003',
  'role grant resolves and persists exactly one confirmed subject'
);
select ok(
  exists (
    select 1 from public.platform_role_memberships
    where role='operator' and status='active'
      and user_id='94000000-0000-4000-8000-000000000003'
      and email='operator-exact@example.test'
  ),
  'exact role grant is stored with immutable user_id'
);
select throws_ok(
  $$update public.platform_role_memberships
    set user_id='94000000-0000-4000-8000-000000000002',
        email='wrong-user@example.test'
    where role='operator' and status='active'
      and user_id='94000000-0000-4000-8000-000000000003'$$,
  'P0001', 'platform_role_immutable_subject_required',
  'an exact platform role row cannot be rebound to another subject'
);
select throws_ok(
  $$select public.admin_grant_platform_role_by_email(
      'missing-subject@example.test','moderator','Missing subject grant'
    )$$,
  'P0001', 'platform_exact_confirmed_subject_required',
  'role grant rejects a missing confirmed subject'
);
select throws_ok(
  $$select public.admin_grant_platform_role_by_email(
      'ambiguous@example.test','moderator','Ambiguous subject grant'
    )$$,
  'P0001', 'platform_exact_confirmed_subject_required',
  'role grant rejects ambiguous confirmed subjects'
);
select is(
  public.admin_grant_platform_role_by_email(
    'moderator-exact@example.test','moderator','Exact moderator grant'
  )->>'userId',
  '94000000-0000-4000-8000-000000000004',
  'moderator role grant binds the exact confirmed subject'
);
select is(
  public.admin_revoke_platform_role_by_email(
    'moderator-exact@example.test','moderator','Exact moderator revoke'
  )->>'userId',
  '94000000-0000-4000-8000-000000000004',
  'role revoke resolves and revokes the exact immutable subject'
);

select is(
  public.admin_grant_platform_staff_permission_by_email(
    'operator-exact@example.test', 'security_review',
    'Exact permission grant', null
  )->>'userId',
  '94000000-0000-4000-8000-000000000003',
  'permission issuance binds the exact confirmed staff subject'
);
select ok(
  exists (
    select 1 from public.platform_staff_permission_grants
    where status='active' and permission_key='security_review'
      and target_user_id='94000000-0000-4000-8000-000000000003'
  ),
  'permission grant stores exact target_user_id'
);
select throws_ok(
  $$update public.platform_staff_permission_grants
    set target_user_id='94000000-0000-4000-8000-000000000001',
        target_email='owner-exact@example.test'
    where status='active' and permission_key='security_review'
      and target_user_id='94000000-0000-4000-8000-000000000003'$$,
  'P0001', 'platform_staff_permission_immutable_subject_required',
  'an exact staff permission row cannot be rebound to another valid staff subject'
);
select throws_ok(
  $$select public.admin_grant_platform_staff_permission_by_email(
      'operator-exact@example.test','audit_review','Expired permission grant',now()-interval '1 second'
    )$$,
  'P0001', 'platform_staff_permission_expiry_invalid',
  'expired permission issuance is rejected'
);
select is(
  public.admin_grant_platform_staff_permission_by_email(
    'operator-exact@example.test','audit_review','Exact revoke fixture',null
  )->>'userId',
  '94000000-0000-4000-8000-000000000003',
  'second permission issuance remains exact-subject functional'
);
select is(
  public.admin_revoke_platform_staff_permission_by_email(
    'operator-exact@example.test','audit_review','Exact permission revoke'
  )->>'userId',
  '94000000-0000-4000-8000-000000000003',
  'permission revoke resolves and mutates only the exact subject grant'
);
select throws_ok(
  $$insert into public.platform_staff_permission_grants(
      target_email,permission_key,status,reason,granted_by
    ) values (
      'operator-exact@example.test','audit_review','active',
      'Email-only permission fixture','pgtap'
    )$$,
  'P0001', 'platform_staff_permission_exact_confirmed_subject_required',
  'email-only active staff permission is rejected at the table boundary'
);
select throws_ok(
  $$insert into public.platform_staff_permission_grants(
      target_user_id,target_email,permission_key,status,reason,granted_by
    ) values (
      '94000000-0000-4000-8000-000000000005','unconfirmed@example.test',
      'audit_review','active','Unconfirmed permission fixture','pgtap'
    )$$,
  'P0001', 'platform_staff_permission_exact_confirmed_subject_required',
  'unconfirmed subject cannot receive an active staff permission'
);
select throws_ok(
  $$insert into public.platform_staff_permission_grants(
      target_user_id,target_email,permission_key,status,reason,granted_by
    ) values (
      '94000000-0000-4000-8000-000000000002','operator-exact@example.test',
      'audit_review','active','Wrong-subject permission fixture','pgtap'
    )$$,
  'P0001', 'platform_staff_permission_exact_confirmed_subject_required',
  'permission email cannot substitute a different non-staff user_id'
);
select throws_ok(
  $$insert into public.platform_staff_permission_grants(
      target_user_id,target_email,permission_key,status,reason,granted_by,expires_at
    ) values (
      '94000000-0000-4000-8000-000000000003','operator-exact@example.test',
      'audit_review','active','Expired permission fixture','pgtap',
      now()-interval '1 second'
    )$$,
  'P0001', 'platform_staff_permission_exact_confirmed_subject_required',
  'expired active staff permission is rejected at the table boundary'
);
select is(
  public.admin_update_platform_staff_permissions_by_email(
    'operator-exact@example.test',
    array['security_review','audit_review'],
    'Exact bulk permission update',null
  )->>'userId',
  '94000000-0000-4000-8000-000000000003',
  'bulk permission update resolves and mutates one exact confirmed subject'
);
select is(
  public.list_staff_scoped_permissions_by_email('operator-exact@example.test'),
  array['audit_review','security_review']::text[],
  'Owner permission list reads only the exact target_user_id rows'
);
select throws_ok(
  $$select public.admin_update_platform_staff_permissions_by_email(
      'operator-exact@example.test',array['audit_review'],
      'Expired bulk permission',now()-interval '1 second'
    )$$,
  'P0001', 'platform_staff_permission_expiry_invalid',
  'bulk permission update rejects an expired authority window'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000003","session_id":"95000000-0000-4000-8000-000000000003","email":"operator-exact@example.test"}',
  true
);
select ok(public.has_platform_role(array['operator']), 'exact confirmed operator role is active');
select ok(public.has_platform_permission('security_review'), 'exact operator receives exact active permission');
select ok(
  'security_review' = any(public.read_my_platform_staff_permission_keys()),
  'permission readback returns exact current subject grant'
);
select is(
  public.list_staff_scoped_permissions_by_email('operator-exact@example.test'),
  array['audit_review','security_review']::text[],
  'non-Owner staff may list only their own exact subject permissions'
);
select throws_ok(
  $$select public.list_staff_scoped_permissions_by_email(
      'owner-exact@example.test'
    )$$,
  'P0001', 'platform_staff_permission_owner_required',
  'non-Owner staff cannot use a target email to list another subject permissions'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000003","session_id":"95000000-0000-4000-8000-000000000003","email":"operator-exact@example.test","app_metadata":{"cognitive_project_ids":["97000000-0000-4000-8000-000000000001"],"cognitive_task_ids":["97000000-0000-4000-8000-000000000002"],"cognitive_platforms":["shared"]}}',
  true
);
insert into public.platform_staff_permission_grants(
  target_user_id,target_email,permission_key,status,reason,granted_by
) values (
  '94000000-0000-4000-8000-000000000003','operator-exact@example.test',
  'admin.cognitive.read','active','Exact cognitive scope fixture','pgtap'
);
select ok(
  public.cognitive_can_read_scope(
    '97000000-0000-4000-8000-000000000001'::uuid,
    '97000000-0000-4000-8000-000000000002'::uuid,
    'shared'::public.cognitive_platform
  ),
  'exact live operator role plus exact permission retains scoped cognitive read'
);
alter table public.platform_role_memberships disable trigger
  enforce_platform_role_exact_subject;
update public.platform_role_memberships
set expires_at=now()-interval '1 second'
where user_id='94000000-0000-4000-8000-000000000003'
  and role='operator' and status='active';
alter table public.platform_role_memberships enable trigger
  enforce_platform_role_exact_subject;
select ok(
  not public.cognitive_can_read_scope(
    '97000000-0000-4000-8000-000000000001'::uuid,
    '97000000-0000-4000-8000-000000000002'::uuid,
    'shared'::public.cognitive_platform
  ),
  'expired status-active operator cannot retain cognitive reads through permission and JWT scope'
);
update public.platform_role_memberships
set expires_at=null
where user_id='94000000-0000-4000-8000-000000000003'
  and role='operator' and status='active';
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000003","session_id":"95000000-0000-4000-8000-999999999999","email":"operator-exact@example.test","app_metadata":{"cognitive_project_ids":["97000000-0000-4000-8000-000000000001"],"cognitive_task_ids":["97000000-0000-4000-8000-000000000002"],"cognitive_platforms":["shared"]}}',
  true
);
select ok(
  not public.cognitive_can_read_scope(
    '97000000-0000-4000-8000-000000000001'::uuid,
    '97000000-0000-4000-8000-000000000002'::uuid,
    'shared'::public.cognitive_platform
  ),
  'stale session cannot retain cognitive RLS authority'
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000003","session_id":"95000000-0000-4000-8000-000000000003","email":"operator-exact@example.test"}',
  true
);

select throws_ok(
  $$update public.platform_staff_permission_grants
    set expires_at=now()-interval '1 second'
    where target_user_id='94000000-0000-4000-8000-000000000003'
      and permission_key='security_review' and status='active'$$,
  'P0001', 'platform_staff_permission_exact_confirmed_subject_required',
  'active permission cannot be written directly into an expired state'
);
alter table public.platform_staff_permission_grants disable trigger
  enforce_platform_staff_permission_exact_subject;
update public.platform_staff_permission_grants
set expires_at=now()-interval '1 second'
where target_user_id='94000000-0000-4000-8000-000000000003'
  and permission_key='security_review' and status='active';
alter table public.platform_staff_permission_grants enable trigger
  enforce_platform_staff_permission_exact_subject;
select ok(not public.has_platform_permission('security_review'), 'expired permission cannot authorize');
select ok(
  not ('security_review' = any(public.read_my_platform_staff_permission_keys())),
  'expired permission is absent from self readback'
);
update public.platform_staff_permission_grants
set expires_at=null
where target_user_id='94000000-0000-4000-8000-000000000003'
  and permission_key='security_review' and status='active';

-- Historical rows may retain an old email for audit. Reassignment of that
-- address to a new auth user never rebinds or mutates the historical subject.
insert into public.platform_role_memberships(
  role,user_id,email,status,notes,granted_by
) values
  ('operator','94000000-0000-4000-8000-000000000008','staff-recycled@example.test','active','Historical exact operator','pgtap'),
  ('owner','94000000-0000-4000-8000-000000000008','staff-recycled@example.test','active','Historical exact owner','pgtap');
insert into public.platform_staff_permission_grants(
  target_user_id,target_email,permission_key,status,reason,granted_by
) values (
  '94000000-0000-4000-8000-000000000008','staff-recycled@example.test',
  'audit_review','active','Historical exact permission','pgtap'
);
insert into public.beta_access_memberships(
  email,user_id,access_status,cohort
) values (
  'staff-recycled@example.test','94000000-0000-4000-8000-000000000008','active','exact-subject-test'
);
insert into public.sandbox_monetization_testers(
  user_id,email,status,note
) values (
  '94000000-0000-4000-8000-000000000008','staff-recycled@example.test','active','Historical exact tester'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001","session_id":"95000000-0000-4000-8000-000000000001","email":"owner-exact@example.test"}',
  true
);
select throws_ok(
  $$select public.admin_grant_platform_role_by_email(
      'staff-recycled@example.test','operator','Recycled role grant'
    )$$,
  'P0001', 'platform_role_membership_subject_conflict',
  'recycled email cannot rebind a historical platform role'
);
select throws_ok(
  $$select public.admin_revoke_platform_role_by_email(
      'staff-recycled@example.test','operator','Recycled role revoke'
    )$$,
  'P0001', 'platform_staff_role_not_found',
  'recycled email cannot revoke a different historical role subject'
);
select ok(
  exists(select 1 from public.platform_role_memberships
    where role='operator' and status='active'
      and user_id='94000000-0000-4000-8000-000000000008'),
  'historical operator remains untouched by recycled-email revoke'
);
select throws_ok(
  $$select public.admin_revoke_platform_staff_permission_by_email(
      'staff-recycled@example.test','audit_review','Recycled permission revoke'
    )$$,
  'P0001', 'platform_staff_permission_not_found',
  'recycled email cannot revoke another subject permission'
);
select ok(
  exists(select 1 from public.platform_staff_permission_grants
    where status='active' and permission_key='audit_review'
      and target_user_id='94000000-0000-4000-8000-000000000008'),
  'historical permission remains untouched by recycled-email revoke'
);
select throws_ok(
  $$select public.first_owner_grant_owner_by_email(
      'staff-recycled@example.test','Recycled owner grant'
    )$$,
  'P0001', 'platform_role_membership_subject_conflict',
  'recycled email cannot rebind a historical Owner role'
);
select throws_ok(
  $$select public.first_owner_revoke_owner_by_email(
      'staff-recycled@example.test','Recycled owner revoke'
    )$$,
  'P0001', 'owner_role_not_found',
  'recycled email cannot revoke a different historical Owner subject'
);
select ok(
  exists(select 1 from public.platform_role_memberships
    where role='owner' and status='active'
      and user_id='94000000-0000-4000-8000-000000000008'),
  'historical Owner remains untouched by recycled-email revoke'
);
insert into public.platform_role_memberships(
  role,user_id,email,status,notes,granted_by
) values (
  'operator','94000000-0000-4000-8000-000000000009',
  'current-subject-role-audit@example.test','active',
  'Current recycled-email subject role','pgtap'
);
select throws_ok(
  $$select public.admin_update_platform_staff_permissions_by_email(
      'staff-recycled@example.test',array['security_review'],
      'Recycled bulk permission target',null
    )$$,
  'P0001', 'platform_staff_permission_subject_conflict',
  'bulk permission update refuses a recycled email with another active subject grant'
);
select ok(
  exists(select 1 from public.platform_staff_permission_grants
    where status='active' and permission_key='audit_review'
      and target_user_id='94000000-0000-4000-8000-000000000008'),
  'recycled bulk mutation leaves the historical exact permission untouched'
);
update public.platform_role_memberships
set status='revoked',revoked_by='pgtap',revoked_at=now(),updated_at=now()
where role='operator'
  and user_id='94000000-0000-4000-8000-000000000009';

select is(
  public.first_owner_grant_owner_by_email(
    'moderator-exact@example.test','Exact successor Owner grant'
  )->>'targetUserId',
  '94000000-0000-4000-8000-000000000004',
  'First Owner grant binds the exact confirmed successor user_id'
);
select is(
  public.first_owner_create_self_step_down_challenge(
    'moderator-exact@example.test', repeat('a',32), repeat('b',16),
    'Exact succession challenge', now()+interval '10 minutes'
  )->>'successorUserId',
  '94000000-0000-4000-8000-000000000004',
  'succession challenge stores the exact successor subject'
);
select ok(
  exists (
    select 1 from public.platform_owner_succession_challenges challenge
    join public.platform_role_memberships successor
      on successor.id=challenge.successor_owner_membership_id
     and successor.user_id=challenge.successor_user_id
    where challenge.status='active'
      and challenge.actor_user_id='94000000-0000-4000-8000-000000000001'
      and challenge.successor_user_id='94000000-0000-4000-8000-000000000004'
  ),
  'active succession path carries exact actor and successor membership bindings'
);
update public.platform_owner_succession_challenges
set successor_user_id='94000000-0000-4000-8000-000000000002'
where status='active'
  and actor_user_id='94000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.first_owner_complete_self_step_down(
      (select id from public.platform_owner_succession_challenges
        where status='active'
          and actor_user_id='94000000-0000-4000-8000-000000000001'
        order by created_at desc limit 1),
      repeat('a',32),'STEP DOWN FIRST OWNER','Wrong successor subject'
    )$$,
  'P0001', 'successor_owner_required',
  'succession completion rejects a successor membership/user_id mismatch'
);
update public.platform_owner_succession_challenges
set successor_user_id='94000000-0000-4000-8000-000000000004'
where status='active'
  and actor_user_id='94000000-0000-4000-8000-000000000001';
update auth.users set email_confirmed_at=null
where id='94000000-0000-4000-8000-000000000004';
select throws_ok(
  $$select public.first_owner_complete_self_step_down(
      (select id from public.platform_owner_succession_challenges
        where status='active'
          and actor_user_id='94000000-0000-4000-8000-000000000001'
        order by created_at desc limit 1),
      repeat('a',32),'STEP DOWN FIRST OWNER','Unconfirmed successor subject'
    )$$,
  'P0001', 'successor_owner_required',
  'succession completion revalidates the successor confirmed subject'
);
update auth.users set email_confirmed_at=now()
where id='94000000-0000-4000-8000-000000000004';
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001","session_id":"95000000-0000-4000-8000-999999999999","email":"owner-exact@example.test"}',
  true
);
select throws_ok(
  $$select public.first_owner_complete_self_step_down(
      (select id from public.platform_owner_succession_challenges
        where status='active'
          and actor_user_id='94000000-0000-4000-8000-000000000001'
        order by created_at desc limit 1),
      repeat('a',32),'STEP DOWN FIRST OWNER','Stale session succession'
    )$$,
  'P0001', 'first_owner_auth_required',
  'stale session cannot complete First Owner succession'
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001","session_id":"95000000-0000-4000-8000-000000000001","email":"owner-exact@example.test"}',
  true
);
select is(
  public.first_owner_authority_status()->>'actorIsFirstOwner',
  'true',
  'First Owner status uses the exact live caller subject'
);

-- Beta: invitation email can locate only an unbound invited row once.
insert into public.beta_access_memberships(email,access_status,cohort)
values ('beta-exact@example.test','invited','exact-subject-test');
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000006","session_id":"95000000-0000-4000-8000-000000000006","email":"beta-exact@example.test"}',
  true
);
select is(
  public.activate_beta_membership()->>'user_id',
  '94000000-0000-4000-8000-000000000006',
  'legitimate invite activation binds the exact confirmed current user'
);
select ok(public.has_active_beta_access(), 'exact activated beta subject has access');
select ok(public.acknowledge_beta_onboarding() is not null, 'exact beta subject may acknowledge onboarding');

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000009","session_id":"95000000-0000-4000-8000-000000000009","email":"staff-recycled@example.test"}',
  true
);
select ok(not public.has_active_beta_access(), 'recycled email does not inherit another subject beta access');
select is(public.activate_beta_membership(), null, 'bound beta membership cannot be rebound by recycled email');
select is(public.acknowledge_beta_onboarding(), null, 'wrong beta subject cannot update onboarding state');
select ok(
  exists(select 1 from public.beta_access_memberships
    where email='staff-recycled@example.test'
      and user_id='94000000-0000-4000-8000-000000000008'
      and access_status='active'),
  'bound beta row retains its historical exact subject'
);
select throws_ok(
  $$insert into public.beta_access_memberships(email,access_status)
    values ('active-email-only@example.test','active')$$,
  'P0001', 'beta_access_exact_confirmed_subject_required',
  'email-only active beta access is rejected'
);
select throws_ok(
  $$insert into public.beta_access_memberships(email,user_id,access_status)
    values ('unconfirmed@example.test','94000000-0000-4000-8000-000000000005','active')$$,
  'P0001', 'beta_access_exact_confirmed_subject_required',
  'unconfirmed beta subject cannot activate'
);

-- Sandbox: compatibility resolver inputs cannot select authority.
select ok(
  not public.resolve_sandbox_monetization_tester(
    '94000000-0000-4000-8000-000000000008','staff-recycled@example.test'
  ),
  'arbitrary resolver identity and recycled email cannot grant sandbox authority'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001","session_id":"95000000-0000-4000-8000-000000000001","email":"owner-exact@example.test"}',
  true
);
select is(
  public.grant_sandbox_monetization_tester(
    'sandbox-exact@example.test',null,now()+interval '1 day','Exact sandbox tester'
  )->>'userId',
  '94000000-0000-4000-8000-000000000007',
  'sandbox grant-by-email resolves and stores one exact confirmed subject'
);
select throws_ok(
  $$select public.grant_sandbox_monetization_tester(
      'sandbox-exact@example.test',null,now()-interval '1 second','Expired sandbox tester'
    )$$,
  'P0001', 'tester_expiry_invalid',
  'expired sandbox tester grant is rejected'
);
select throws_ok(
  $$select public.grant_sandbox_monetization_tester(
      'ambiguous@example.test',null,now()+interval '1 day','Ambiguous sandbox tester'
    )$$,
  'P0001', 'platform_exact_confirmed_subject_required',
  'sandbox grant-by-email rejects ambiguous confirmed subjects'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000007","session_id":"95000000-0000-4000-8000-000000000007","email":"sandbox-exact@example.test"}',
  true
);
select ok(
  public.resolve_sandbox_monetization_tester(
    '94000000-0000-4000-8000-999999999999','fabricated@example.test'
  ),
  'resolver authorizes only the exact current tester despite irrelevant compatibility inputs'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000002","session_id":"95000000-0000-4000-8000-000000000002","email":"sandbox-exact@example.test"}',
  true
);
select ok(
  not public.resolve_sandbox_monetization_tester(
    '94000000-0000-4000-8000-000000000007','sandbox-exact@example.test'
  ),
  'wrong current user cannot select exact tester authority through arguments or JWT email'
);
select throws_ok(
  $$insert into public.sandbox_monetization_testers(email,status)
    values ('sandbox-email-only@example.test','active')$$,
  'P0001', 'sandbox_tester_exact_confirmed_subject_required',
  'email-only active sandbox tester is rejected'
);
select throws_ok(
  $$update public.sandbox_monetization_testers
    set expires_at=now()-interval '1 second'
    where user_id='94000000-0000-4000-8000-000000000007' and status='active'$$,
  'P0001', 'sandbox_tester_exact_confirmed_subject_required',
  'active sandbox tester cannot be made stale-expired'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001","session_id":"95000000-0000-4000-8000-000000000001","email":"owner-exact@example.test"}',
  true
);
select is(
  (public.revoke_sandbox_monetization_tester(
    null,'sandbox-exact@example.test',null
  )->>'revokedCount')::integer,
  1,
  'sandbox revoke-by-email resolves and revokes the exact subject only'
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000007","session_id":"95000000-0000-4000-8000-000000000007","email":"sandbox-exact@example.test"}',
  true
);
select ok(
  not public.resolve_sandbox_monetization_tester(null,null),
  'revoked sandbox tester remains blocked'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001","session_id":"95000000-0000-4000-8000-000000000001","email":"owner-exact@example.test"}',
  true
);
select is(
  public.first_owner_complete_self_step_down(
    (select id from public.platform_owner_succession_challenges
      where status='active'
        and actor_user_id='94000000-0000-4000-8000-000000000001'
      order by created_at desc limit 1),
    repeat('a',32),'STEP DOWN FIRST OWNER','Exact succession completion'
  )->>'successorUserId',
  '94000000-0000-4000-8000-000000000004',
  'exact live First Owner can complete succession to the exact confirmed successor'
);
select ok(
  exists(select 1 from public.platform_first_owner_authority marker
    where marker.is_active
      and marker.owner_user_id='94000000-0000-4000-8000-000000000004')
  and not exists(select 1 from public.platform_role_memberships membership
    where membership.role='owner' and membership.status='active'
      and membership.user_id='94000000-0000-4000-8000-000000000001'),
  'succession atomically moves First Owner marker and revokes the exact prior owner'
);
select ok(
  not exists(select 1 from public.platform_break_glass_sessions session
    where session.actor_user_id='94000000-0000-4000-8000-000000000001'
      and session.status='active'),
  'First Owner succession expires the prior subject Break Glass session'
);

insert into public.platform_role_memberships(
  role,user_id,email,status,notes,granted_by,expires_at
) values (
  'owner','94000000-0000-4000-8000-000000000012',
  'expired-owner@example.test','active','Expired self-read fixture','pgtap',
  now()+interval '1 hour'
);
alter table public.platform_role_memberships disable trigger
  enforce_platform_role_exact_subject;
update public.platform_role_memberships
set expires_at=now()-interval '1 second'
where user_id='94000000-0000-4000-8000-000000000012'
  and role='owner' and status='active';
alter table public.platform_role_memberships enable trigger
  enforce_platform_role_exact_subject;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000012","session_id":"95000000-0000-4000-8000-000000000012","email":"expired-owner@example.test"}',
  true
);
set local role authenticated;
select ok(
  not public.governance_exact_owner('94000000-0000-4000-8000-000000000012'),
  'expired status-active role is not an exact governance Owner subject'
);
select throws_ok(
  $$select public.governance_assert_exact_owner()$$,
  '42501', 'governance_owner_identity_required',
  'expired Owner role cannot retain governance mutation authority'
);
select is(
  (select count(*)::integer from public.platform_role_memberships
    where user_id='94000000-0000-4000-8000-000000000012'),
  0,
  'expired status-active owner cannot read or recover its own role through RLS'
);
reset role;

-- RLS self reads are exact immutable subjects; matching email never widens.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000009","session_id":"95000000-0000-4000-8000-000000000009","email":"staff-recycled@example.test"}',
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from public.platform_role_memberships
    where email='staff-recycled@example.test'),
  0,
  'role RLS does not expose another subject through recycled email'
);
select is(
  (select count(*)::integer from public.platform_staff_permission_grants
    where target_email='staff-recycled@example.test'),
  0,
  'permission RLS does not expose another subject through recycled email'
);
select is(
  (select count(*)::integer from public.beta_access_memberships
    where email='staff-recycled@example.test'),
  0,
  'beta RLS does not expose another subject through recycled email'
);
select is(
  (select count(*)::integer from public.sandbox_monetization_testers
    where email='staff-recycled@example.test'),
  0,
  'sandbox tester RLS does not expose another subject through recycled email'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000008","session_id":"95000000-0000-4000-8000-999999999999","email":"historical-current@example.test"}',
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from public.platform_role_memberships
    where user_id='94000000-0000-4000-8000-000000000008'),
  0,
  'stale session cannot read exact self platform roles through RLS'
);
select is(
  (select count(*)::integer from public.platform_staff_permission_grants
    where target_user_id='94000000-0000-4000-8000-000000000008'),
  0,
  'stale session cannot read exact self permissions through RLS'
);
select is(
  (select count(*)::integer from public.beta_access_memberships
    where user_id='94000000-0000-4000-8000-000000000008'),
  0,
  'stale session cannot read exact self beta membership through RLS'
);
select is(
  (select count(*)::integer from public.sandbox_monetization_testers
    where user_id='94000000-0000-4000-8000-000000000008'),
  0,
  'stale session cannot read exact self sandbox tester row through RLS'
);
reset role;

-- Exercise every legacy authenticated Owner-read table with a real row. The
-- probe rows bypass only fixture FK/check construction while RLS itself remains
-- enabled and is evaluated under the authenticated role below. The outer test
-- transaction rolls every temporary constraint change back.
create temp table owner_rls_probe_targets (
  table_name regclass primary key,
  policy_name text not null,
  description text not null
) on commit drop;

insert into owner_rls_probe_targets(table_name,policy_name,description)
values
  ('public.cognitive_product_sentinel_platform_scopes'::regclass,
   'cognitive_product_sentinel_platform_scopes_owner_read','sentinel platform scopes'),
  ('public.product_experience_baseline_owner_source_amendments'::regclass,
   'product_experience_baseline_owner_source_amendments_owner_read','baseline source amendments'),
  ('public.product_experience_baseline_owner_tls_source_revisions'::regclass,
   'product_experience_baseline_owner_tls_revision_owner_read','baseline TLS revisions'),
  ('public.cognitive_provider_independent_visual_canary_authorizations'::regclass,
   'cognitive_provider_independent_visual_canary_authorizations_own','visual canary authorizations'),
  ('public.cognitive_provider_independent_visual_activation_outcomes'::regclass,
   'cognitive_provider_independent_visual_activation_outcomes_owner','visual activation outcomes'),
  ('public.cognitive_deferred_evidence_v2_decision_receipts'::regclass,
   'cognitive_deferred_evidence_v2_decisions_owner_read','deferred evidence decisions'),
  ('public.cognitive_ios_visual_canary_preflight_receipts'::regclass,
   'cognitive_ios_visual_canary_preflight_receipts_owner_read','iOS visual preflight receipts'),
  ('public.product_experience_livekit_no_finding_attestation_consumptions'::regclass,
   'product_experience_livekit_no_finding_consumptions_owner_read','LiveKit no-finding consumptions'),
  ('public.cognitive_livekit_platform_preflight_receipts'::regclass,
   'cognitive_livekit_platform_preflight_receipts_owner_read','LiveKit preflight receipts'),
  ('public.cognitive_livekit_platform_canary_authorizations'::regclass,
   'cognitive_livekit_platform_canary_authorizations_owner_read','LiveKit canary authorizations'),
  ('public.cognitive_livekit_platform_activation_outcomes'::regclass,
   'cognitive_livekit_platform_activation_outcomes_owner_read','LiveKit activation outcomes');

select is(
  (
    select count(*)::integer
    from pg_policies policy
    join owner_rls_probe_targets target
      on policy.schemaname='public'
     and policy.tablename=target.table_name::text
     and policy.policyname=target.policy_name
    where policy.cmd='SELECT'
      and 'authenticated'=any(policy.roles)
  ),
  11,
  'all eleven exact Owner-read policies exist once for authenticated SELECT'
);
select is(
  (
    select count(*)::integer
    from pg_policies policy
    join owner_rls_probe_targets target
      on policy.schemaname='public'
     and policy.tablename=target.table_name::text
     and policy.policyname=target.policy_name
    where policy.qual like '%platform_exact_current_session_subject%'
      and policy.qual like '%governance_exact_owner%'
  ),
  11,
  'all eleven Owner-read policies require exact current session and exact Owner subject'
);
select is(
  (
    select count(*)::integer
    from pg_policies policy
    join owner_rls_probe_targets target
      on policy.schemaname='public'
     and policy.tablename=target.table_name::text
  ),
  11,
  'no duplicate legacy Owner-read policy can OR-open an affected table'
);

do $probe_constraints$
declare
  constraint_row record;
begin
  for constraint_row in
    select constraint_value.conrelid, constraint_value.conname
    from pg_constraint constraint_value
    where constraint_value.contype='c'
      and constraint_value.conrelid in (
        select target.table_name::oid from owner_rls_probe_targets target
      )
  loop
    execute format(
      'alter table %s drop constraint %I',
      constraint_row.conrelid::regclass,
      constraint_row.conname
    );
  end loop;
end;
$probe_constraints$;

create function pg_temp.insert_owner_rls_probe(
  p_table regclass,
  p_owner_user_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_columns text;
  v_values text;
begin
  select
    string_agg(format('%I', attribute_value.attname), ', '
      order by attribute_value.attnum),
    string_agg(
      case
        when attribute_value.attname='owner_user_id'
          then format('%L::uuid', p_owner_user_id)
        when type_value.typname='uuid' then 'gen_random_uuid()'
        when type_value.typname='text'
          then format('%L::text', 'rls-probe-' || attribute_value.attname)
        when type_value.typname='bool' then 'true'
        when type_value.typname='int4' then '1'
        when type_value.typname='timestamptz'
          then 'timezone(''utc''::text, now())'
        when type_value.typname='cognitive_platform'
          then '''shared''::public.cognitive_platform'
        when type_value.typname='cognitive_environment'
          then '''production''::public.cognitive_environment'
        else 'null'
      end,
      ', ' order by attribute_value.attnum
    )
  into v_columns,v_values
  from pg_catalog.pg_attribute attribute_value
  join pg_catalog.pg_type type_value
    on type_value.oid=attribute_value.atttypid
  where attribute_value.attrelid=p_table
    and attribute_value.attnum>0
    and not attribute_value.attisdropped
    and attribute_value.attnotnull
    and attribute_value.attgenerated='';

  execute format('insert into %s (%s) values (%s)',p_table,v_columns,v_values);
end;
$$;

create function pg_temp.owner_rls_probe_count(p_table regclass)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_count integer;
begin
  execute format('select count(*)::integer from %s',p_table) into v_count;
  return v_count;
end;
$$;

set local session_replication_role=replica;
do $insert_owner_rls_probes$
declare
  target record;
begin
  for target in select table_name from owner_rls_probe_targets loop
    perform pg_temp.insert_owner_rls_probe(
      target.table_name,
      '94000000-0000-4000-8000-000000000004'::uuid
    );
  end loop;
end;
$insert_owner_rls_probes$;
set local session_replication_role=origin;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000004","session_id":"95000000-0000-4000-8000-000000000004","email":"moderator-exact@example.test"}',
  true
);
set local role authenticated;
select is(pg_temp.owner_rls_probe_count('public.cognitive_product_sentinel_platform_scopes'),1,
  'exact live Owner reads sentinel platform scopes through RLS');
select is(pg_temp.owner_rls_probe_count('public.product_experience_baseline_owner_source_amendments'),1,
  'exact live Owner reads baseline source amendments through RLS');
select is(pg_temp.owner_rls_probe_count('public.product_experience_baseline_owner_tls_source_revisions'),1,
  'exact live Owner reads baseline TLS revisions through RLS');
select is(pg_temp.owner_rls_probe_count('public.cognitive_provider_independent_visual_canary_authorizations'),1,
  'exact live Owner reads visual canary authorizations through RLS');
select is(pg_temp.owner_rls_probe_count('public.cognitive_provider_independent_visual_activation_outcomes'),1,
  'exact live Owner reads visual activation outcomes through RLS');
select is(pg_temp.owner_rls_probe_count('public.cognitive_deferred_evidence_v2_decision_receipts'),1,
  'exact live Owner reads deferred evidence decisions through RLS');
select is(pg_temp.owner_rls_probe_count('public.cognitive_ios_visual_canary_preflight_receipts'),1,
  'exact live Owner reads iOS visual preflight receipts through RLS');
select is(pg_temp.owner_rls_probe_count('public.product_experience_livekit_no_finding_attestation_consumptions'),1,
  'exact live Owner reads LiveKit no-finding consumptions through RLS');
select is(pg_temp.owner_rls_probe_count('public.cognitive_livekit_platform_preflight_receipts'),1,
  'exact live Owner reads LiveKit preflight receipts through RLS');
select is(pg_temp.owner_rls_probe_count('public.cognitive_livekit_platform_canary_authorizations'),1,
  'exact live Owner reads LiveKit canary authorizations through RLS');
select is(pg_temp.owner_rls_probe_count('public.cognitive_livekit_platform_activation_outcomes'),1,
  'exact live Owner reads LiveKit activation outcomes through RLS');
reset role;

update auth.sessions
set not_after=now()-interval '1 second'
where id='95000000-0000-4000-8000-000000000004';
set local role authenticated;
select is(pg_temp.owner_rls_probe_count('public.cognitive_product_sentinel_platform_scopes'),0,
  'time-box-expired Owner cannot read sentinel platform scopes through RLS');
select is(pg_temp.owner_rls_probe_count('public.product_experience_baseline_owner_source_amendments'),0,
  'time-box-expired Owner cannot read baseline source amendments through RLS');
select is(pg_temp.owner_rls_probe_count('public.product_experience_baseline_owner_tls_source_revisions'),0,
  'time-box-expired Owner cannot read baseline TLS revisions through RLS');
select is(pg_temp.owner_rls_probe_count('public.cognitive_provider_independent_visual_canary_authorizations'),0,
  'time-box-expired Owner cannot read visual canary authorizations through RLS');
select is(pg_temp.owner_rls_probe_count('public.cognitive_provider_independent_visual_activation_outcomes'),0,
  'time-box-expired Owner cannot read visual activation outcomes through RLS');
select is(pg_temp.owner_rls_probe_count('public.cognitive_deferred_evidence_v2_decision_receipts'),0,
  'time-box-expired Owner cannot read deferred evidence decisions through RLS');
select is(pg_temp.owner_rls_probe_count('public.cognitive_ios_visual_canary_preflight_receipts'),0,
  'time-box-expired Owner cannot read iOS visual preflight receipts through RLS');
select is(pg_temp.owner_rls_probe_count('public.product_experience_livekit_no_finding_attestation_consumptions'),0,
  'time-box-expired Owner cannot read LiveKit no-finding consumptions through RLS');
select is(pg_temp.owner_rls_probe_count('public.cognitive_livekit_platform_preflight_receipts'),0,
  'time-box-expired Owner cannot read LiveKit preflight receipts through RLS');
select is(pg_temp.owner_rls_probe_count('public.cognitive_livekit_platform_canary_authorizations'),0,
  'time-box-expired Owner cannot read LiveKit canary authorizations through RLS');
select is(pg_temp.owner_rls_probe_count('public.cognitive_livekit_platform_activation_outcomes'),0,
  'time-box-expired Owner cannot read LiveKit activation outcomes through RLS');
reset role;
update auth.sessions
set not_after=null
where id='95000000-0000-4000-8000-000000000004';

select ok(
  has_function_privilege('authenticated','public.has_platform_role(text[])','EXECUTE')
  and not has_function_privilege('anon','public.has_platform_role(text[])','EXECUTE'),
  'platform role readback is authenticated-only'
);
select ok(
  has_function_privilege(
    'authenticated','public.governance_assert_exact_owner()','EXECUTE'
  )
  and not has_function_privilege(
    'service_role','public.governance_assert_exact_owner()','EXECUTE'
  )
  and not has_function_privilege(
    'anon','public.governance_assert_exact_owner()','EXECUTE'
  ),
  'governance Owner assertion remains authenticated-only'
);
select ok(
  not has_function_privilege(
    'authenticated','public.platform_exact_current_session_authority_internal()','EXECUTE'
  ),
  'live-session authority helper is not API-callable'
);
select ok(
  has_function_privilege(
    'authenticated','public.platform_exact_current_session_subject(text)','EXECUTE'
  )
  and not has_function_privilege(
    'anon','public.platform_exact_current_session_subject(text)','EXECUTE'
  ),
  'RLS exposes only an authenticated exact-current-subject predicate'
);
select ok(
  not has_function_privilege(
    'authenticated','public.admin_grant_platform_role_by_email_pre_exact_subject_closure(text,text,text)','EXECUTE'
  ),
  'predecessor role-grant helper is fully revoked'
);
select ok(
  has_function_privilege('service_role','public.autonomous_actor_authority_role(text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.autonomous_actor_authority_role(text,text)','EXECUTE'),
  'autonomous authority helper remains service-only'
);
select ok(
  has_function_privilege('authenticated','public.activate_beta_membership()','EXECUTE')
  and not has_function_privilege('anon','public.activate_beta_membership()','EXECUTE'),
  'beta activation requires authenticated execution'
);
select ok(
  has_function_privilege('authenticated','public.resolve_sandbox_monetization_tester(text,text)','EXECUTE')
  and not has_function_privilege('anon','public.resolve_sandbox_monetization_tester(text,text)','EXECUTE'),
  'sandbox resolver requires authenticated execution'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_update_platform_staff_permissions_by_email(text,text[],text,timestamp with time zone)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.admin_update_platform_staff_permissions_by_email(text,text[],text,timestamp with time zone)',
    'EXECUTE'
  ),
  'exact bulk permission mutation is authenticated-only'
);
select ok(
  has_function_privilege(
    'authenticated','public.list_staff_scoped_permissions_by_email(text)','EXECUTE'
  )
  and not has_function_privilege(
    'anon','public.list_staff_scoped_permissions_by_email(text)','EXECUTE'
  ),
  'exact scoped-permission list is authenticated-only'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.enforce_platform_staff_permission_exact_subject_internal()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.enforce_platform_staff_permission_exact_subject_internal()',
    'EXECUTE'
  ),
  'staff permission exact-subject trigger helper is not API-callable'
);
select ok(
  has_function_privilege(
    'authenticated','public.first_owner_complete_self_step_down(uuid,text,text,text)','EXECUTE'
  )
  and not has_function_privilege(
    'anon','public.first_owner_complete_self_step_down(uuid,text,text,text)','EXECUTE'
  ),
  'First Owner succession finalizer is authenticated-only'
);
select ok(
  has_function_privilege(
    'service_role','public.platform_current_break_glass_session_id(text,text)','EXECUTE'
  )
  and not has_function_privilege(
    'authenticated','public.platform_current_break_glass_session_id(text,text)','EXECUTE'
  ),
  'Break Glass current-session helper remains service-only'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.cognitive_can_read_scope(uuid,uuid,public.cognitive_platform)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.cognitive_can_read_scope(uuid,uuid,public.cognitive_platform)',
    'EXECUTE'
  ),
  'exact cognitive read predicate is authenticated-only'
);
select ok(
  has_table_privilege('authenticated','public.platform_role_memberships','SELECT')
  and not has_table_privilege('authenticated','public.platform_role_memberships','INSERT')
  and not has_table_privilege('authenticated','public.platform_role_memberships','UPDATE')
  and not has_table_privilege('authenticated','public.platform_role_memberships','DELETE')
  and not has_table_privilege('authenticated','public.platform_role_memberships','TRUNCATE')
  and not has_table_privilege('anon','public.platform_role_memberships','TRUNCATE'),
  'platform role table is SELECT-only for authenticated and closed to anon mutation'
);
select ok(
  has_table_privilege('authenticated','public.platform_staff_permission_grants','SELECT')
  and not has_table_privilege('authenticated','public.platform_staff_permission_grants','INSERT')
  and not has_table_privilege('authenticated','public.platform_staff_permission_grants','UPDATE')
  and not has_table_privilege('authenticated','public.platform_staff_permission_grants','DELETE')
  and not has_table_privilege('authenticated','public.platform_staff_permission_grants','TRUNCATE'),
  'staff permission table is SELECT-only for authenticated'
);
select ok(
  has_table_privilege('authenticated','public.beta_access_memberships','SELECT')
  and not has_table_privilege('authenticated','public.beta_access_memberships','INSERT')
  and not has_table_privilege('authenticated','public.beta_access_memberships','UPDATE')
  and not has_table_privilege('authenticated','public.beta_access_memberships','DELETE')
  and not has_table_privilege('authenticated','public.beta_access_memberships','TRUNCATE')
  and not has_table_privilege('anon','public.beta_access_memberships','TRUNCATE'),
  'beta table is SELECT-only for authenticated and closed to anon mutation'
);
select ok(
  has_table_privilege('authenticated','public.sandbox_monetization_testers','SELECT')
  and not has_table_privilege('authenticated','public.sandbox_monetization_testers','INSERT')
  and not has_table_privilege('authenticated','public.sandbox_monetization_testers','UPDATE')
  and not has_table_privilege('authenticated','public.sandbox_monetization_testers','DELETE')
  and not has_table_privilege('authenticated','public.sandbox_monetization_testers','TRUNCATE'),
  'sandbox tester table is SELECT-only for authenticated'
);

select * from finish();
rollback;
