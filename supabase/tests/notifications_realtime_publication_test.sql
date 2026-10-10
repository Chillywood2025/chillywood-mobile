begin;
select plan(10);

select is((select count(*)::integer from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'),1,
  'notifications are included once in the existing realtime publication');
select ok((select relrowsecurity from pg_class where oid='public.notifications'::regclass),
  'notification rows retain owner RLS');
select is((select relreplident::text from pg_class where oid='public.notifications'::regclass),'d',
  'notification publication does not expose old full records');
select is((select count(*)::integer from pg_policy where polrelid='public.notifications'::regclass),2,
  'publication adds no permissive policies');

insert into auth.users(id,is_sso_user,is_anonymous) values
  ('9a110000-0000-4000-8000-000000000001',false,false),
  ('9a110000-0000-4000-8000-000000000002',false,false);
insert into public.notifications(user_id,category,notification_type,title,target_route) values
  ('9a110000-0000-4000-8000-000000000001','reply_comment','reply_comment','Owner A','/channel-settings'),
  ('9a110000-0000-4000-8000-000000000002','reply_comment','reply_comment','Owner B','/channel-settings');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a110000-0000-4000-8000-000000000001"}',true);
select is((select count(*)::integer from public.notifications where title in ('Owner A','Owner B')),1,
  'authenticated owner can read only its row');
select results_eq($$select title from public.notifications where title in ('Owner A','Owner B')$$,
  $$values ('Owner A'::text)$$,'current owner reads the exact expected row');
with changed as (update public.notifications set read_at=now()
  where user_id='9a110000-0000-4000-8000-000000000002' returning id)
  select is((select count(*)::integer from changed),0,'one account cannot mark another account read');
with changed as (update public.notifications set read_at=now()
  where user_id='9a110000-0000-4000-8000-000000000001' returning id)
  select is((select count(*)::integer from changed),1,'current owner retains its read action');
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is((select count(*)::integer from public.notifications where title in ('Owner A','Owner B')),0,
  'anonymous subscriber cannot read either row');
reset role;
select is((select count(*)::integer from public.notifications where title in ('Owner A','Owner B')),2,
  'visibility guards preserve both durable rows');
select * from finish();
rollback;
