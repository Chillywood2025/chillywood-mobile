begin;
select no_plan();

-- This suite tests the shared delivery boundary with a deterministic source
-- resolver. Social/discovery suites independently exercise their actual sources.
create or replace function private.resolve_social_notification_activity(p_event public.notification_activity_events)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('eligible',coalesce((p_event.context->>'testEligible')::boolean,true),
    'category','social_activity','notification_type','social_follow','title','New activity','body','Open the app.',
    'target_route','/profile/[userId]','target_entity_id',p_event.actor_user_id::text,
    'target_context','{}'::jsonb,'preference_key','social_activity_enabled')
$$;
insert into auth.users(id,is_sso_user,is_anonymous) values
  ('9a120000-0000-4000-8000-000000000001',false,false),
  ('9a120000-0000-4000-8000-000000000002',false,false);
insert into auth.sessions(id,user_id) values
  ('9a120000-0000-4000-8000-000000000003','9a120000-0000-4000-8000-000000000002');
insert into public.wave1_push_installation_ownership(platform,install_id,user_id,account_id,session_generation,
  ownership_state,revocation_credential_hash,last_operation_key,last_reason) values
  ('ios','activity-test-install','9a120000-0000-4000-8000-000000000002','9a120000-0000-4000-8000-000000000002',
  '9a120000-0000-4000-8000-000000000003','ACCOUNT_BOUND',repeat('a',64),'activity-test','test');
insert into public.user_push_tokens(id,user_id,platform,provider,token,token_hash,token_fingerprint,install_id,session_generation,ownership_state)
values ('9a120000-0000-4000-8000-000000000004','9a120000-0000-4000-8000-000000000002','ios','expo',
  'ExponentPushToken[activity-test-only]','activity-test-hash','activity-test-fingerprint','activity-test-install',
  '9a120000-0000-4000-8000-000000000003','ACCOUNT_BOUND');
insert into public.notification_preferences(user_id) values ('9a120000-0000-4000-8000-000000000002');

select ok(not public.authorize_notification_activity_worker('arbitrary'),'worker starts disabled');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
  where oid in ('public.notification_activity_events'::regclass,'public.notification_activity_pushes'::regclass,
  'public.notification_activity_worker_config'::regclass)),'queue, reservations and config enforce RLS');
select ok(not has_table_privilege('authenticated','public.notification_activity_events','INSERT'),'clients cannot forge events');
select ok(not has_table_privilege('authenticated','public.notification_activity_pushes','SELECT'),'clients cannot read provider reservations');
select ok(not has_function_privilege('authenticated','public.claim_notification_activity_batch(integer)','EXECUTE'),'clients cannot claim work');
select ok(not has_function_privilege('anon','public.reserve_notification_activity_push(uuid,uuid,uuid)','EXECUTE'),'anonymous cannot retrieve push tokens');
select ok(not has_function_privilege('service_role','private.enqueue_notification_activity(text,text,text,uuid,uuid,jsonb,timestamptz,timestamptz)','EXECUTE'),
  'source helper is not an externally callable recipient authority');

select isnt(private.enqueue_notification_activity('outbox-first','social_follow','source-one',
  '9a120000-0000-4000-8000-000000000001','9a120000-0000-4000-8000-000000000002'),null::uuid,'source transaction creates event');
select is(private.enqueue_notification_activity('outbox-first','social_follow','source-one',
  '9a120000-0000-4000-8000-000000000001','9a120000-0000-4000-8000-000000000002'),null::uuid,'same event cannot be enqueued twice');
select is(private.enqueue_notification_activity('outbox-self','social_follow','source-one',
  '9a120000-0000-4000-8000-000000000001','9a120000-0000-4000-8000-000000000001'),null::uuid,'self activity is suppressed');
savepoint source_write;
select private.enqueue_notification_activity('outbox-rollback','social_follow','source-two',
  '9a120000-0000-4000-8000-000000000001','9a120000-0000-4000-8000-000000000002');
rollback to source_write;
select is((select count(*)::int from public.notification_activity_events where event_key='outbox-rollback'),0,'rolled-back source leaves no queued delivery');

create temporary table activity_claims as select (j->>'eventId')::uuid id,(j->>'leaseToken')::uuid lease
  from public.claim_notification_activity_batch(10) j;
select is((select count(*)::int from activity_claims),1,'one exact event is leased');
select is((select count(*)::int from public.claim_notification_activity_batch(10)),0,'second claim cannot take an active lease');
select is((select public.prepare_notification_activity(id,gen_random_uuid())->>'reason' from activity_claims),'stale_lease','wrong worker is fenced');
select is((select public.prepare_notification_activity(id,lease)->>'eligible' from activity_claims),'true','current source materializes');
select is((select count(*)::int from public.notifications where source_type='notification_activity' and user_id='9a120000-0000-4000-8000-000000000002'),1,'exact owner gets one bell row');
select is((select deep_link from public.notifications where source_id=(select id::text from activity_claims)),
  '/profile/9a120000-0000-4000-8000-000000000001','target template becomes canonical route');
select public.prepare_notification_activity(id,lease) from activity_claims;
select is((select count(*)::int from public.notifications where source_id=(select id::text from activity_claims)),1,'prepare replay cannot duplicate bell');
select is((select public.reserve_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004')->>'eligible' from activity_claims),
  'true','current account and live session may reserve token');
select is((select public.reserve_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004')->>'eligible' from activity_claims),
  'false','duplicate reservation cannot resend');
select ok(not (select public.finish_notification_activity(id,lease) from activity_claims),'cannot finish possible in-flight send');
select ok(not (select public.complete_notification_activity_push(id,gen_random_uuid(),'9a120000-0000-4000-8000-000000000004','sent','ticket-test',null) from activity_claims),
  'wrong worker cannot complete a send');
select ok((select public.complete_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004','unknown',null,'provider_result_unknown') from activity_claims),
  'lost provider response is durably unknown');
select is((select count(*)::int from public.notification_delivery_attempts where notification_id=(select notification_id from public.notification_activity_events where id=(select id from activity_claims))),1,
  'shared delivery attempt is written atomically');
select ok((select public.finish_notification_activity(id,lease) from activity_claims),'unknown send finishes without unsafe retry');
select is((select count(*)::int from public.claim_notification_activity_batch(10)),0,'completed uncertain event cannot be claimed again');

-- Push-only preferences never create a hidden bell row.
update public.notification_preferences set in_app_enabled=false where user_id='9a120000-0000-4000-8000-000000000002';
select private.enqueue_notification_activity('outbox-push-only','social_follow','source-three',
  '9a120000-0000-4000-8000-000000000001','9a120000-0000-4000-8000-000000000002');
truncate activity_claims;
insert into activity_claims select (j->>'eventId')::uuid,(j->>'leaseToken')::uuid from public.claim_notification_activity_batch(10) j;
select is((select jsonb_array_length(public.prepare_notification_activity(id,lease)->'tokenIds') from activity_claims),1,'push-only source still has eligible delivery');
select is((select notification_id from public.notification_activity_events where id=(select id from activity_claims)),null::uuid,'push-only event has no bell record');
select ok(not (select (public.reserve_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004')->'data') ? 'notificationId' from activity_claims),
  'push-only payload omits nonexistent notification ID');
update public.notification_activity_events set lease_until=now()-interval '1 second' where id=(select id from activity_claims);
create temporary table activity_reclaims as select (j->>'eventId')::uuid id,(j->>'leaseToken')::uuid lease from public.claim_notification_activity_batch(10) j;
select is((select status from public.notification_activity_pushes where event_id=(select id from activity_claims)),'unknown','worker crash preserves unknown delivery');
select ok((select lease from activity_claims)<>(select lease from activity_reclaims),'reclaim changes the lease fence');
select is((select public.reserve_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004')->>'eligible' from activity_reclaims),'false','recovery cannot resend reserved token');
select ok(not (select public.complete_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004','sent','late-ticket',null) from activity_claims),
  'late response from old worker cannot rewrite unknown state');
select public.finish_notification_activity(id,lease) from activity_reclaims;

-- Preference and account changes are rechecked immediately before reservation.
update public.notification_preferences set in_app_enabled=true where user_id='9a120000-0000-4000-8000-000000000002';
select private.enqueue_notification_activity('outbox-changed','social_follow','source-four',
  '9a120000-0000-4000-8000-000000000001','9a120000-0000-4000-8000-000000000002');
truncate activity_claims;
insert into activity_claims select (j->>'eventId')::uuid,(j->>'leaseToken')::uuid from public.claim_notification_activity_batch(10) j;
select public.prepare_notification_activity(id,lease) from activity_claims;
update public.notification_preferences set push_enabled=false where user_id='9a120000-0000-4000-8000-000000000002';
select is((select public.reserve_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004')->>'eligible' from activity_claims),'false','changed push preference stops send');
update public.notification_preferences set push_enabled=true where user_id='9a120000-0000-4000-8000-000000000002';
update auth.sessions set not_after=now()-interval '1 second' where id='9a120000-0000-4000-8000-000000000003';
select is((select public.reserve_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004')->>'eligible' from activity_claims),'false','expired account session stops send');
update auth.sessions set not_after=null where id='9a120000-0000-4000-8000-000000000003';
update public.wave1_push_installation_ownership set ownership_state='REVOCATION_PENDING' where install_id='activity-test-install';
select is((select public.reserve_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004')->>'eligible' from activity_claims),'false','pending ownership revocation stops send');
update public.wave1_push_installation_ownership set ownership_state='ACCOUNT_BOUND' where install_id='activity-test-install';
update public.notification_activity_events set context='{"testEligible":false}' where id=(select id from activity_claims);
select is((select public.reserve_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004')->>'eligible' from activity_claims),'false','source deletion/access change stops send');
select public.finish_notification_activity(id,lease) from activity_claims;

-- Retry only explicit provider rejections. Unknown delivery above stays final.
select private.enqueue_notification_activity('outbox-rate-limited','social_follow','source-five',
  '9a120000-0000-4000-8000-000000000001','9a120000-0000-4000-8000-000000000002');
truncate activity_claims;
insert into activity_claims select (j->>'eventId')::uuid,(j->>'leaseToken')::uuid from public.claim_notification_activity_batch(10) j;
select public.prepare_notification_activity(id,lease) from activity_claims;
select public.reserve_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004') from activity_claims;
select ok((select public.complete_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004','failed',null,'MessageRateExceeded') from activity_claims),
  'known unsent rate-limit rejection is recorded');
select is((select status from public.notification_activity_pushes where event_id=(select id from activity_claims)), 'retryable', 'explicit rate limit permits bounded retry');
select is((select extract(epoch from retry_after-now())::int from public.notification_activity_pushes where event_id=(select id from activity_claims)),60,'first retry waits one minute');
select is((select public.reserve_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004')->>'eligible' from activity_claims),'false','same worker cannot immediately retry');
select ok(not (select public.finish_notification_activity(id,lease) from activity_claims),'retryable event remains unfinished');
select is((select count(*)::int from public.claim_notification_activity_batch(10)),0,'backoff prevents early claim');
update public.notification_activity_events set scheduled_at=now()-interval '1 second' where event_key='outbox-rate-limited';
update public.notification_activity_pushes set retry_after=now()-interval '1 second' where event_id=(select id from activity_claims);
truncate activity_reclaims;
insert into activity_reclaims select (j->>'eventId')::uuid,(j->>'leaseToken')::uuid from public.claim_notification_activity_batch(10) j;
select is((select jsonb_array_length(public.prepare_notification_activity(id,lease)->'tokenIds') from activity_reclaims),1,'new worker sees due retry');
select is((select public.reserve_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004')->>'eligible' from activity_reclaims),'true','new worker may reserve second attempt');
select ok(not (select public.complete_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004','sent','late-first-attempt',null) from activity_claims),
  'late response from first attempt cannot complete second attempt');
select public.complete_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004','failed',null,'MessageRateExceeded') from activity_reclaims;
select is((select extract(epoch from retry_after-now())::int from public.notification_activity_pushes where event_id=(select id from activity_claims)),120,'second retry doubles the delay');
select public.finish_notification_activity(id,lease) from activity_reclaims;
update public.notification_activity_events set scheduled_at=now()-interval '1 second' where event_key='outbox-rate-limited';
update public.notification_activity_pushes set retry_after=now()-interval '1 second' where event_id=(select id from activity_claims);
truncate activity_reclaims;
insert into activity_reclaims select (j->>'eventId')::uuid,(j->>'leaseToken')::uuid from public.claim_notification_activity_batch(10) j;
select public.prepare_notification_activity(id,lease) from activity_reclaims;
select public.reserve_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004') from activity_reclaims;
select public.complete_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004','failed',null,'MessageRateExceeded') from activity_reclaims;
select is((select attempts from public.notification_activity_pushes where event_id=(select id from activity_claims)),3,'attempt limit is three');
select is((select status from public.notification_activity_pushes where event_id=(select id from activity_claims)),'failed','third explicit failure is terminal');
select ok((select public.finish_notification_activity(id,lease) from activity_reclaims),'exhausted retry completes');
select is((select count(*)::int from public.notifications where source_id=(select id::text from activity_claims)),1,'provider retries never duplicate bell');

select private.enqueue_notification_activity('outbox-rate-token-changed','social_follow','source-six',
  '9a120000-0000-4000-8000-000000000001','9a120000-0000-4000-8000-000000000002');
truncate activity_claims;
insert into activity_claims select (j->>'eventId')::uuid,(j->>'leaseToken')::uuid from public.claim_notification_activity_batch(10) j;
select public.prepare_notification_activity(id,lease) from activity_claims;
select public.reserve_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004') from activity_claims;
select public.complete_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004','failed',null,'MessageRateExceeded') from activity_claims;
select public.finish_notification_activity(id,lease) from activity_claims;
update public.notification_activity_events set scheduled_at=now()-interval '1 second' where event_key='outbox-rate-token-changed';
update public.notification_activity_pushes set retry_after=now()-interval '1 second' where event_id=(select id from activity_claims);
update public.user_push_tokens set token_fingerprint='replacement-token-fingerprint' where id='9a120000-0000-4000-8000-000000000004';
truncate activity_reclaims;
insert into activity_reclaims select (j->>'eventId')::uuid,(j->>'leaseToken')::uuid from public.claim_notification_activity_batch(10) j;
select is((select jsonb_array_length(public.prepare_notification_activity(id,lease)->'tokenIds') from activity_reclaims),0,'pending retry cannot follow a replacement token');
select is((select status from public.notification_activity_pushes where event_id=(select id from activity_claims)),'failed','obsolete retry retires instead of remaining pending');
select ok((select public.finish_notification_activity(id,lease) from activity_reclaims),'obsolete retry finishes without exhausting queue attempts');
select is((select public.reserve_notification_activity_push(id,lease,'9a120000-0000-4000-8000-000000000004')->>'eligible' from activity_reclaims),'false','replacement token receives no stale retry');

set local role authenticated;
select throws_ok($$select * from public.notification_activity_events$$,'42501',null,'authenticated account cannot inspect outbox');
select throws_ok($$select public.claim_notification_activity_batch(1)$$,'42501',null,'authenticated account cannot execute service worker');
reset role;
select * from finish();
rollback;
