begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select ok(
  (select relrowsecurity from pg_class where oid = 'public.titles'::regclass),
  'titles keeps row-level security enabled'
);
select is(
  (select count(*)::integer from pg_policy where polrelid = 'public.titles'::regclass),
  2,
  'titles has only the public-release and exact-programming read policies'
);
select ok(
  exists (
    select 1 from pg_policy
    where polrelid = 'public.titles'::regclass
      and polname = 'titles_public_release_select'
      and position('is_published is true' in lower(pg_get_expr(polqual, polrelid))) > 0
      and position('status' in lower(pg_get_expr(polqual, polrelid))) > 0
      and position('published' in lower(pg_get_expr(polqual, polrelid))) > 0
      and position('release_at is null' in lower(pg_get_expr(polqual, polrelid))) > 0
      and position('release_date is null' in lower(pg_get_expr(polqual, polrelid))) > 0
  ),
  'public title RLS binds publication status and both release-time boundaries'
);
select ok(
  exists (
    select 1 from pg_policy
    where polrelid = 'public.titles'::regclass
      and polname = 'titles_programming_select'
      and position('has_platform_role' in pg_get_expr(polqual, polrelid)) > 0
  ),
  'programming visibility remains bound to canonical platform authority'
);

insert into auth.users(id, email, email_confirmed_at, is_sso_user, is_anonymous)
values
  ('b7100000-0000-4000-8000-000000000001', 'title-viewer@example.test', now(), false, false),
  ('b7100000-0000-4000-8000-000000000002', 'title-owner@example.test', now(), false, false);

insert into auth.sessions(id, user_id)
values
  ('b7200000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001'),
  ('b7200000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000002');

insert into public.platform_role_memberships(role, user_id, email, status, notes, granted_by)
values (
  'owner', 'b7100000-0000-4000-8000-000000000002',
  'title-owner@example.test', 'active', 'Title release RLS fixture', 'pgtap'
);

insert into public.titles(id, title, category, status, is_published, release_at, release_date)
values
  ('b7300000-0000-4000-8000-000000000001', 'Public released title', 'Drama', 'published', true, now() - interval '1 hour', now() - interval '1 hour'),
  ('b7300000-0000-4000-8000-000000000002', 'Draft title', 'Drama', 'draft', false, null, null),
  ('b7300000-0000-4000-8000-000000000003', 'Archived title', 'Drama', 'archived', false, null, null),
  ('b7300000-0000-4000-8000-000000000004', 'Future title', 'Drama', 'published', true, now() + interval '1 hour', now() + interval '1 hour'),
  ('b7300000-0000-4000-8000-000000000005', 'Unpublished mismatch', 'Drama', 'published', false, null, null);

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is(
  (select count(*)::integer from public.titles where id::text like 'b7300000-%'),
  1,
  'anonymous release discovery sees only the released published title'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b7100000-0000-4000-8000-000000000001","session_id":"b7200000-0000-4000-8000-000000000001","email":"title-viewer@example.test"}',
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from public.titles where id::text like 'b7300000-%'),
  1,
  'an ordinary signed-in viewer cannot read draft, archived, future, or unpublished titles'
);
select throws_like(
  $$insert into public.titles(title, category, status, is_published)
    values ('Forged public title', 'Drama', 'published', true)$$,
  '%row-level security policy%',
  'an ordinary viewer cannot publish a title directly'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b7100000-0000-4000-8000-000000000002","session_id":"b7200000-0000-4000-8000-000000000002","email":"title-owner@example.test"}',
  true
);
set local role authenticated;
select ok(public.has_platform_role(array['owner']), 'the exact live Owner session retains programming authority');
select is(
  (select count(*)::integer from public.titles where id::text like 'b7300000-%'),
  5,
  'the canonical programming identity can read every lifecycle state'
);
select lives_ok(
  $$select public.apply_admin_title_programming_action(
      'b7300000-0000-4000-8000-000000000005',
      'archive',
      '{}'::jsonb,
      'RFGC test fixture quarantine'
    )$$,
  'the audited programming RPC can quarantine an exact title without deletion'
);
reset role;

select ok(
  exists (
    select 1 from public.titles
    where id = 'b7300000-0000-4000-8000-000000000005'
      and status = 'archived'
      and is_published is false
  ),
  'fixture quarantine preserves the title row as archived and unpublished'
);
select ok(
  exists (
    select 1 from public.platform_admin_audit_logs
    where target_type = 'title'
      and target_id = 'b7300000-0000-4000-8000-000000000005'
      and action = 'title_archive'
      and reason = 'RFGC test fixture quarantine'
  ),
  'fixture quarantine records immutable canonical admin audit evidence'
);

select * from finish();
rollback;
