begin;
select plan(12);

select is((select count(*)::integer from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'),1,
  'notifications are included once in the existing realtime publication');
select ok((select relrowsecurity from pg_class where oid='public.notifications'::regclass),
  'notification rows retain owner RLS');
select is((select relreplident::text from pg_class where oid='public.notifications'::regclass),'d',
  'notification publication does not expose old full records');
select is((select count(*)::integer from pg_policy where polrelid='public.notifications'::regclass and polpermissive),2,
  'publication adds no permissive policies');
select is((select count(*)::integer from pg_policy where polrelid='public.notifications'::regclass),3,
  'the exact current inventory adds only one restrictive live-availability policy');
select ok((select not polpermissive and polcmd='r'
  and polroles=array[(select oid from pg_roles where rolname='authenticated')]::oid[]
  and pg_get_expr(polqual,polrelid)=$policy$((notification_type <> ALL (ARRAY['followed_creator_live'::text, 'circle_friend_live'::text, 'live_room_member_joined'::text])) OR private.live_notification_visible(id))$policy$
  from pg_policy where polrelid='public.notifications'::regclass and polname='notifications_live_current_audience'),
  'live availability is an authenticated restrictive read gate, never an extra grant');

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
