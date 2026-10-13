begin;
select no_plan();
set local timezone='UTC';

-- Persisted prior lifecycles are deliberately older than this transaction.
-- The real request RPC uses transaction time when a terminal relationship is
-- requested again; no clock, production row or request implementation is mocked.
create function pg_temp.circle_user(n integer) returns text language sql immutable as $$
  select '9b350000-0000-4000-8000-'||lpad(n::text,12,'0')
$$;
create function pg_temp.circle_actor(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.circle_user(n))::text,true);
end $$;
create function pg_temp.circle_events(kind text,actor integer,recipient integer) returns integer language sql as $$
  select count(*)::integer from public.notification_activity_events
  where event_kind=kind and actor_user_id=pg_temp.circle_user(actor)::uuid
    and recipient_user_id=pg_temp.circle_user(recipient)::uuid
$$;
create function pg_temp.circle_bells(kind text,recipient integer) returns integer language sql as $$
  select count(*)::integer from public.notifications
  where notification_type=kind and user_id=pg_temp.circle_user(recipient)::uuid
$$;
create function pg_temp.circle_drain() returns integer language plpgsql as $$
declare claim jsonb; n integer:=0;
begin
  for claim in select public.claim_notification_activity_batch(100) loop
    perform public.prepare_notification_activity((claim->>'eventId')::uuid,(claim->>'leaseToken')::uuid);
    perform public.finish_notification_activity((claim->>'eventId')::uuid,(claim->>'leaseToken')::uuid);
    n:=n+1;
  end loop;
  return n;
end $$;

insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at)
  select pg_temp.circle_user(n)::uuid,false,false,now() from generate_series(1,8) n;
update public.user_profiles set profile_visibility='everyone',profile_access_visibility='public'
  where user_id like '9b350000-%';
update public.user_profiles set profile_visibility='private',profile_access_visibility='private'
  where user_id in (pg_temp.circle_user(2),pg_temp.circle_user(4),pg_temp.circle_user(6));

select ok(not has_function_privilege('authenticated','private.enqueue_social_notification_activity()','execute'),
  'Circle producer remains unavailable to clients');
select ok(not has_table_privilege('authenticated','public.notification_activity_events','insert'),
  'clients still cannot invent Circle event recipients');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.notification_activity_events'::regclass),
  'event table retains RLS and FORCE RLS');

-- Both Follow relationships survive the entire Circle removal/restoration.
insert into public.channel_followers(channel_user_id,follower_user_id) values
  (pg_temp.circle_user(1),pg_temp.circle_user(2)),(pg_temp.circle_user(2),pg_temp.circle_user(1));
insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status,created_at)
  values(pg_temp.circle_user(1),pg_temp.circle_user(2),pg_temp.circle_user(1),'pending',now()-interval '2 days');
-- Represent an event already stored before this forward migration. It must not
-- block the next lifecycle or be rewritten/replayed as a new notification.
update public.notification_activity_events set event_key=split_part(event_key,':lifecycle:',1)
  where event_kind='circle_request' and actor_user_id=pg_temp.circle_user(1)::uuid;
select pg_temp.circle_drain();
select is(pg_temp.circle_bells('circle_request',2),1,'first request has one actual bell row');
select pg_temp.circle_actor(1);
set local role authenticated;
select is((public.request_friendship(pg_temp.circle_user(2))).status,'pending','same pending request is idempotent');
reset role;
select is(pg_temp.circle_events('circle_request',1,2),1,'repeating the pending request produces no duplicate event');
select pg_temp.circle_actor(2);
set local role authenticated;
select is((public.respond_to_friendship(pg_temp.circle_user(1),'accept')).status,'active','recipient accepts first request');
reset role;
update public.notification_activity_events set event_key=split_part(event_key,':lifecycle:',1)
  where event_kind='circle_accepted' and actor_user_id=pg_temp.circle_user(2)::uuid;
select pg_temp.circle_drain();
select is(pg_temp.circle_bells('circle_accepted',1),1,'first acceptance has one actual bell row');

set local role authenticated;
select is((public.respond_to_friendship(pg_temp.circle_user(1),'remove')).status,'removed','recipient removes the active connection');
reset role;
select is(pg_temp.circle_events('circle_request',1,2)+pg_temp.circle_events('circle_accepted',2,1),2,
  'removal itself emits no request or acceptance');
select pg_temp.circle_actor(1);
set local role authenticated;
select is((public.request_friendship(pg_temp.circle_user(2))).status,'pending','new request after removal is a genuine pending lifecycle');
reset role;
select is(pg_temp.circle_events('circle_request',1,2),2,'second genuine request gets a new event despite old permanent key');
select is((select count(distinct event_key)::integer from public.notification_activity_events
  where event_kind='circle_request' and actor_user_id=pg_temp.circle_user(1)::uuid),2,'request event identities are distinct');
select is((select count(*)::integer from public.notification_activity_events e
  where e.event_kind='circle_request' and e.actor_user_id=pg_temp.circle_user(1)::uuid
    and private.resolve_social_notification_activity(e)->>'eligible'='true'),1,
  'only the current lifecycle request is eligible');
select pg_temp.circle_drain();
select is(pg_temp.circle_bells('circle_request',2),2,'second request materializes a second bell row');
set local role authenticated;
select is((public.request_friendship(pg_temp.circle_user(2))).status,'pending','new pending lifecycle replay remains pending');
reset role;
update public.user_friendships set updated_at=clock_timestamp()
  where user_low_id=pg_temp.circle_user(1) and user_high_id=pg_temp.circle_user(2);
select is(pg_temp.circle_events('circle_request',1,2),2,'pending replay and unrelated metadata change add no duplicate');

-- Changing the session timezone must not change the lifecycle identifier.
set local timezone='America/Chicago';
select pg_temp.circle_actor(2);
set local role authenticated;
select is((public.respond_to_friendship(pg_temp.circle_user(1),'accept')).status,'active','recipient accepts second lifecycle');
select throws_ok(format('select public.respond_to_friendship(%L,%L)',pg_temp.circle_user(1),'accept'),
  'P0001','Only pending Chi''lly Circle requests can be accepted.','accept replay remains rejected');
reset role;
set local timezone='UTC';
select is(pg_temp.circle_events('circle_accepted',2,1),2,'second acceptance emits exactly one fresh event');
select is((select count(distinct split_part(event_key,':lifecycle:',2))::integer
  from public.notification_activity_events where event_key like '%:lifecycle:%'
    and source_id=pg_temp.circle_user(1)||':'||pg_temp.circle_user(2)
    and (context->>'createdAt')::timestamptz=now()),1,'request and acceptance share one timezone-independent lifecycle');
select is((select count(*)::integer from public.notification_activity_events e
  where e.event_kind='circle_accepted' and e.actor_user_id=pg_temp.circle_user(2)::uuid
    and private.resolve_social_notification_activity(e)->>'eligible'='true'),1,'prior acceptance is stale after the next lifecycle');
select pg_temp.circle_drain();
select is(pg_temp.circle_bells('circle_accepted',1),2,'second acceptance materializes one new bell row');
select pg_temp.circle_drain();
select is(pg_temp.circle_bells('circle_request',2)+pg_temp.circle_bells('circle_accepted',1),4,
  'draining again does not redeliver either lifecycle');
select is((select count(*)::integer from public.channel_followers where
  (channel_user_id=pg_temp.circle_user(1) and follower_user_id=pg_temp.circle_user(2)) or
  (channel_user_id=pg_temp.circle_user(2) and follower_user_id=pg_temp.circle_user(1))),2,
  'Circle removal and restoration preserve both Follow relationships');

-- An undelivered canceled request must stay stale while the new request alerts.
insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status,created_at)
  values(pg_temp.circle_user(3),pg_temp.circle_user(4),pg_temp.circle_user(3),'pending',now()-interval '1 hour');
select pg_temp.circle_actor(3);
set local role authenticated;
select is((public.respond_to_friendship(pg_temp.circle_user(4),'cancel')).status,'canceled','sender cancels prior pending request');
select is((public.request_friendship(pg_temp.circle_user(4))).status,'pending','sender can make a new request after cancellation');
reset role;
select is(pg_temp.circle_events('circle_request',3,4),2,'cancel then request emits a second lifecycle event');
select is((select count(*)::integer from public.notification_activity_events e
  where e.event_kind='circle_request' and e.actor_user_id=pg_temp.circle_user(3)::uuid
    and private.resolve_social_notification_activity(e)->>'eligible'='true'),1,'superseded canceled request remains ineligible');
select pg_temp.circle_drain();
select is(pg_temp.circle_bells('circle_request',4),1,'only the replacement request gets a bell row');
select is((select count(*)::integer from public.notification_activity_events
  where event_kind='circle_request' and actor_user_id=pg_temp.circle_user(3)::uuid and status='suppressed'),1,
  'the real worker suppresses the superseded pending event');

insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status,created_at)
  values(pg_temp.circle_user(5),pg_temp.circle_user(6),pg_temp.circle_user(5),'pending',now()-interval '1 hour');
select pg_temp.circle_actor(6);
set local role authenticated;
select is((public.respond_to_friendship(pg_temp.circle_user(5),'decline')).status,'declined','recipient declines prior request');
reset role;
select pg_temp.circle_actor(5);
set local role authenticated;
select is((public.request_friendship(pg_temp.circle_user(6))).status,'pending','new request after decline starts a lifecycle');
reset role;
select is(pg_temp.circle_events('circle_request',5,6),2,'decline then request emits a second event');
select pg_temp.circle_drain();
select is(pg_temp.circle_bells('circle_request',6),1,'declined stale event does not alert with the new request');

-- Public instant-add has its own lifecycle and never pretends to be acceptance.
insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status,created_at,responded_at,actioned_by_user_id)
  values(pg_temp.circle_user(7),pg_temp.circle_user(8),pg_temp.circle_user(7),'active',now()-interval '1 hour',now()-interval '1 hour',pg_temp.circle_user(7));
select pg_temp.circle_drain();
select pg_temp.circle_actor(7);
set local role authenticated;
select is((public.respond_to_friendship(pg_temp.circle_user(8),'remove')).status,'removed','public connection can be removed');
select is((public.request_friendship(pg_temp.circle_user(8))).status,'active','public re-add keeps existing instant-add semantics');
select is((public.request_friendship(pg_temp.circle_user(8))).status,'active','repeating active public add stays idempotent');
reset role;
select is(pg_temp.circle_events('circle_added',7,8),2,'genuine public re-add has one event for each lifecycle');
select is(pg_temp.circle_events('circle_accepted',8,7),0,'public re-add never fabricates acceptance');
select pg_temp.circle_drain();
select is(pg_temp.circle_bells('circle_added',8),2,'both genuine public-add lifecycles materialize');

insert into public.channel_followers(channel_user_id,follower_user_id) values(pg_temp.circle_user(8),pg_temp.circle_user(7));
delete from public.channel_followers where channel_user_id=pg_temp.circle_user(8) and follower_user_id=pg_temp.circle_user(7);
insert into public.channel_followers(channel_user_id,follower_user_id) values(pg_temp.circle_user(8),pg_temp.circle_user(7));
select is(pg_temp.circle_events('social_follow',7,8),1,'intentional Follow/refollow anti-spam key is unchanged');
select is((select event_key from public.notification_activity_events
  where event_kind='social_follow' and actor_user_id=pg_temp.circle_user(7)::uuid),
  'social_follow:'||pg_temp.circle_user(8)||':'||pg_temp.circle_user(7)||':'||pg_temp.circle_user(7)||':'||pg_temp.circle_user(8),
  'non-Circle Follow identity retains its exact original key format');

select set_config('request.jwt.claims','{}',true);
select * from finish();
rollback;
