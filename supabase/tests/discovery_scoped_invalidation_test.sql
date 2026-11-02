begin;
select plan(23);

select is((select enabled from private.discovery_invalidation_worker_config),false,'dispatcher defaults disabled');
select is((select collecting from private.discovery_invalidation_worker_config),false,'collection defaults disabled');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.discovery_invalidation_outbox'::regclass),'outbox FORCE RLS');
select ok(not has_table_privilege('authenticated','private.discovery_invalidation_outbox','SELECT'),'clients cannot read queue');
select ok(not has_function_privilege('authenticated','public.authorize_discovery_invalidation_worker(text)','EXECUTE'),'client cannot authorize workers');
select ok(not has_function_privilege('authenticated','public.flush_discovery_invalidations(integer)','EXECUTE'),'client cannot dispatch');
select is((select cmd from pg_policies where schemaname='realtime' and policyname='discovery_scoped_invalidation_receive'),'SELECT','receive-only policy');
select is((select count(*)::integer from pg_policies where schemaname='realtime' and policyname like 'discovery%' and cmd<>'SELECT'),0,'no client send policy');

insert into auth.users(id,is_anonymous,is_sso_user,email_confirmed_at) values('9d280001-0000-4000-8000-000000000001',false,false,now());
insert into auth.sessions(id,user_id,not_after) values
  ('9d280001-0000-4000-8000-000000000003','9d280001-0000-4000-8000-000000000001',now()+interval '1 day');
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
select '9d280001-0000-4000-8000-000000000001'::uuid,public.wave1_sha256('9d280001-0000-4000-8000-000000000001'),
  document_key,version,market,'member',capability,'9d280001-0000-4000-8000-000000000003','service_reconciliation'
from public.wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account';
insert into public.discovery_feed_items(id,item_type,source_type,owner_user_id,channel_user_id,
  visibility,rights_status,is_publicly_discoverable,discovery_surface,title)
values('9d280001-0000-4000-8000-000000000002','manual_foundation','manual_foundation',
  '9d280001-0000-4000-8000-000000000001','9d280001-0000-4000-8000-000000000001',
  'public','creator_owned',true,'home_profile_channel','Scoped fixture');
select is((select count(*)::integer from private.discovery_invalidation_outbox),0,'disabled collection creates no backlog');
update private.discovery_invalidation_worker_config set collecting=true;
update public.discovery_feed_items set title='Changed fixture' where id='9d280001-0000-4000-8000-000000000002';
select is((select count(*)::integer from private.discovery_invalidation_outbox),4,'three surface scopes plus one deduplicated creator');
update public.discovery_feed_items set updated_at=clock_timestamp() where id='9d280001-0000-4000-8000-000000000002';
select is((select count(*)::integer from private.discovery_invalidation_outbox),4,'timestamp-only write creates no work');
update public.discovery_feed_items set visibility='private',is_publicly_discoverable=false where id='9d280001-0000-4000-8000-000000000002';
select is((select count(*)::integer from private.discovery_invalidation_outbox),8,'withdrawal covers old public scopes');
update public.discovery_feed_items set title='Private fixture' where id='9d280001-0000-4000-8000-000000000002';
select is((select count(*)::integer from private.discovery_invalidation_outbox),8,'private-only edits create no timing hint');
select is((public.flush_discovery_invalidations(100)->>'enabled')::boolean,false,'disabled flush does not consume queued work');
select is((select count(*)::integer from private.discovery_invalidation_outbox where status='pending'),8,'disabled work remains durable');

select set_config('request.jwt.claims','{"role":"authenticated","sub":"9d280001-0000-4000-8000-000000000001","session_id":"9d280001-0000-4000-8000-000000000003"}',true);
set local role authenticated;
select ok(public.can_receive_discovery_invalidation('discovery:v1:surface:home'),'active authenticated recipient accepts public scope');
select ok(not public.can_receive_discovery_invalidation('discovery:v1:surface:circle'),'no Circle scope authority');
select ok(not public.can_receive_discovery_invalidation('comm-room-anything'),'no old room authority change');
reset role;
update auth.sessions set not_after=now()-interval '1 second' where id='9d280001-0000-4000-8000-000000000003';
set local role authenticated;
select ok(not public.can_receive_discovery_invalidation('discovery:v1:surface:home'),'expired exact session cannot subscribe');
reset role;
update auth.sessions set not_after=now()+interval '1 day' where id='9d280001-0000-4000-8000-000000000003';
update public.wave1_legal_acceptances set invalidated_at=now() where user_id='9d280001-0000-4000-8000-000000000001';
set local role authenticated;
select ok(not public.can_receive_discovery_invalidation('discovery:v1:surface:home'),'missing current legal acceptance cannot subscribe');
reset role;
update public.wave1_legal_acceptances set invalidated_at=null where user_id='9d280001-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9d280001-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select ok(not public.can_receive_discovery_invalidation('discovery:v1:surface:home'),'legacy identity-only claims cannot subscribe without the exact session');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9d280001-0000-4000-8000-000000000001","session_id":"9d280001-0000-4000-8000-000000000003"}',true);
update auth.users set banned_until=now()+interval '1 day' where id='9d280001-0000-4000-8000-000000000001';
set local role authenticated;
select ok(not public.can_receive_discovery_invalidation('discovery:v1:surface:home'),'restricted account rejected at join');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
set local role authenticated;
select ok(not public.can_receive_discovery_invalidation('discovery:v1:surface:home'),'missing identity rejected');
reset role;
select * from finish();
rollback;
