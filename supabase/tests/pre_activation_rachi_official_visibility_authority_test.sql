begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select is(
  (select count(*)::integer from public.user_profiles where user_id = 'platform_rachi_official'),
  0,
  'Rachi remains a protected pseudo-account rather than a fabricated normal profile'
);

select ok(
  (public.resolve_profile_platform_visibility_access(
    'platform_rachi_official', 'profile', 'forged-viewer-id'
  )->>'allowed')::boolean,
  'the shared authority resolver recognizes the exact public Rachi identity'
);
select is(
  public.resolve_profile_platform_visibility_access(
    'platform_rachi_official', 'profile', 'forged-viewer-id'
  )->>'viewer_user_id',
  null,
  'an unauthenticated caller cannot inject a viewer identity into official access'
);
select is(
  public.resolve_profile_visibility_access(
    'platform_rachi_official', 'forged-viewer-id'
  )->>'reason',
  'official_public_allowed',
  'Profile uses the deliberate official-public authority reason'
);
select is(
  public.resolve_platform_visibility_access(
    'platform_rachi_official', 'forged-viewer-id'
  )->>'reason',
  'official_public_allowed',
  'Platform uses the same deliberate official-public authority reason'
);
select ok(
  not (public.resolve_profile_visibility_access(
    'platform_rachi_official', null
  )->>'is_owner')::boolean
  and not (public.resolve_profile_visibility_access(
    'platform_rachi_official', null
  )->>'is_blocked')::boolean
  and not (public.resolve_profile_visibility_access(
    'platform_rachi_official', null
  )->>'is_circle_member')::boolean
  and not (public.resolve_profile_visibility_access(
    'platform_rachi_official', null
  )->>'is_subscriber')::boolean
  and not (public.resolve_profile_visibility_access(
    'platform_rachi_official', null
  )->>'is_follower')::boolean,
  'official visibility grants no owner, block-bypass, Circle, subscriber, or follower authority'
);
select is(
  public.resolve_profile_visibility_access(
    'missing_nonofficial_profile_subject', null
  )->>'reason',
  'not_found',
  'a nonofficial orphan identity remains fail-closed'
);
select is(
  public.is_account_access_restricted('platform_rachi_official'),
  true,
  'the generic auth-account restriction resolver continues to fail closed for the non-UUID Rachi subject'
);
select is(
  public.is_account_access_restricted('missing_nonofficial_profile_subject'),
  true,
  'an arbitrary non-UUID subject continues to fail closed as an auth account'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
insert into public.profile_posts(
  id, user_id, body, visibility, moderation_status, deleted_at
) values
  ('a6100000-0000-4000-8000-000000000001', 'platform_rachi_official',
   'Legitimate public Rachi update', 'public', 'clean', null),
  ('a6100000-0000-4000-8000-000000000002', 'platform_rachi_official',
   'Draft Rachi update', 'draft', 'clean', null),
  ('a6100000-0000-4000-8000-000000000003', 'platform_rachi_official',
   'Hidden Rachi update', 'public', 'hidden', null),
  ('a6100000-0000-4000-8000-000000000004', 'platform_rachi_official',
   'Deleted Rachi update', 'public', 'clean', timezone('utc'::text, now()));
reset role;

-- Simulate a historical orphan row without weakening its current write guard.
set local session_replication_role = replica;
insert into public.profile_posts(
  id, user_id, body, visibility, moderation_status, deleted_at
) values (
  'a6100000-0000-4000-8000-000000000005',
  'missing_nonofficial_profile_subject',
  'Orphan nonofficial update',
  'public',
  'clean',
  null
);
set local session_replication_role = origin;

set local session_replication_role = replica;
insert into auth.users(
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
) values (
  'a6200000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'rachi-viewer@example.test', '',
  timezone('utc'::text, now()), '{"provider":"email","providers":["email"]}', '{}',
  timezone('utc'::text, now()), timezone('utc'::text, now()), false, false
) on conflict (id) do nothing;
set local session_replication_role = origin;

set local request.jwt.claims =
  '{"sub":"a6200000-0000-4000-8000-000000000001","role":"authenticated","email":"rachi-viewer@example.test"}';
set local role authenticated;

select throws_ok(
  $sql$
    insert into public.profile_posts(user_id, body, visibility, moderation_status)
    values ('platform_rachi_official', 'Forged Rachi update', 'public', 'clean')
  $sql$,
  '42501',
  'official_rachi_operator_required',
  'an ordinary signed-in user cannot publish as the official Rachi identity'
);

select is(
  public.resolve_profile_visibility_access(
    'platform_rachi_official', 'forged-viewer-id'
  )->>'viewer_user_id',
  'a6200000-0000-4000-8000-000000000001',
  'signed-in official access binds the real authenticated viewer rather than a supplied alias'
);
select is(
  (select count(*)::integer
   from public.profile_posts
   where id between 'a6100000-0000-4000-8000-000000000001'
     and 'a6100000-0000-4000-8000-000000000005'),
  1,
  'authenticated discovery reads the exact public clean active Rachi post'
);
select ok(
  exists(
    select 1 from public.profile_posts
    where id = 'a6100000-0000-4000-8000-000000000001'
      and user_id = 'platform_rachi_official'
  ),
  'the legitimate public Rachi update is visible through real signed-in RLS'
);
select ok(
  not exists(
    select 1 from public.profile_posts
    where id in (
      'a6100000-0000-4000-8000-000000000002',
      'a6100000-0000-4000-8000-000000000003',
      'a6100000-0000-4000-8000-000000000004',
      'a6100000-0000-4000-8000-000000000005'
    )
  ),
  'draft, hidden, deleted, and nonofficial orphan posts remain unavailable'
);

reset role;

select ok(
  not has_function_privilege(
    'anon',
    'public.resolve_profile_platform_visibility_access_profile_backed_v1(text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.resolve_profile_platform_visibility_access_profile_backed_v1(text,text,text)',
    'EXECUTE'
  ),
  'clients cannot bypass the official wrapper by invoking the profile-backed implementation'
);
select ok(
  (select coalesce(proc.proconfig, array[]::text[]) @> array['search_path=""']
   from pg_proc proc
   where proc.oid =
     'public.resolve_profile_platform_visibility_access(text,text,text)'::regprocedure),
  'the new security-definer wrapper has an empty search path'
);

select * from finish();
rollback;
