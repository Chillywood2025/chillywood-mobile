begin;

select plan(8);

select is(
  (
    select count(*)::bigint
    from information_schema.tables table_row
    where table_row.table_schema = 'public'
      and table_row.table_type = 'BASE TABLE'
      and (
        has_table_privilege('anon', format('%I.%I', table_row.table_schema, table_row.table_name), 'TRUNCATE')
        or has_table_privilege('anon', format('%I.%I', table_row.table_schema, table_row.table_name), 'REFERENCES')
        or has_table_privilege('anon', format('%I.%I', table_row.table_schema, table_row.table_name), 'TRIGGER')
        or has_table_privilege('anon', format('%I.%I', table_row.table_schema, table_row.table_name), 'MAINTAIN')
      )
  ),
  0::bigint,
  '1. anon has no table DDL or maintenance authority in public'
);

select is(
  (
    select count(*)::bigint
    from information_schema.tables table_row
    where table_row.table_schema = 'public'
      and table_row.table_type = 'BASE TABLE'
      and (
        has_table_privilege('authenticated', format('%I.%I', table_row.table_schema, table_row.table_name), 'TRUNCATE')
        or has_table_privilege('authenticated', format('%I.%I', table_row.table_schema, table_row.table_name), 'REFERENCES')
        or has_table_privilege('authenticated', format('%I.%I', table_row.table_schema, table_row.table_name), 'TRIGGER')
        or has_table_privilege('authenticated', format('%I.%I', table_row.table_schema, table_row.table_name), 'MAINTAIN')
      )
  ),
  0::bigint,
  '2. authenticated has no table DDL or maintenance authority in public'
);

set local role anon;
select throws_ok(
  $$truncate table public.beta_access_memberships$$,
  '42501',
  null,
  '3. anon cannot bypass RLS by truncating beta authority'
);
reset role;

set local role authenticated;
select throws_ok(
  $$truncate table public.chat_messages$$,
  '42501',
  null,
  '4. authenticated cannot bypass RLS by truncating chat data'
);
reset role;

select ok(
  has_table_privilege('service_role', 'public.beta_access_memberships', 'TRUNCATE'),
  '5. trusted service-role maintenance authority is preserved'
);

create table public.api_privilege_future_probe (
  id bigint generated always as identity primary key
);

select ok(
  not has_table_privilege('anon', 'public.api_privilege_future_probe', 'TRUNCATE')
  and not has_table_privilege('anon', 'public.api_privilege_future_probe', 'REFERENCES')
  and not has_table_privilege('anon', 'public.api_privilege_future_probe', 'TRIGGER')
  and not has_table_privilege('anon', 'public.api_privilege_future_probe', 'MAINTAIN'),
  '6. future public tables do not grant non-DML authority to anon'
);

select ok(
  not has_table_privilege('authenticated', 'public.api_privilege_future_probe', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.api_privilege_future_probe', 'REFERENCES')
  and not has_table_privilege('authenticated', 'public.api_privilege_future_probe', 'TRIGGER')
  and not has_table_privilege('authenticated', 'public.api_privilege_future_probe', 'MAINTAIN'),
  '7. future public tables do not grant non-DML authority to authenticated'
);

select ok(
  has_table_privilege(current_user, 'public.api_privilege_future_probe', 'TRUNCATE')
  and has_table_privilege(current_user, 'public.api_privilege_future_probe', 'REFERENCES')
  and has_table_privilege(current_user, 'public.api_privilege_future_probe', 'TRIGGER')
  and has_table_privilege(current_user, 'public.api_privilege_future_probe', 'MAINTAIN'),
  '8. migration owner retains reviewed schema maintenance authority'
);

select * from finish();
rollback;
