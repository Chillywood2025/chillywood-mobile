begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
set local timezone = 'UTC';
select no_plan();

-- Rollback-only fake accounts. Authority is established by the real Google
-- producer and removed by the real terminal dispatcher, never by inserting a
-- grant or transaction binding. Fixed transaction time makes retries exact.
create function pg_temp.restore_user(n integer) returns uuid language sql immutable as $$
  select ('9b470000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
insert into auth.users(id,is_sso_user,is_anonymous)
  select pg_temp.restore_user(n),false,false from generate_series(1,10) n;
update public.platform_money_kill_switches set state=case
  when key in ('revenuecat_google_play_enabled','provider_webhooks_enabled') then 'sandbox_only'
  else 'off' end
where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled',
  'live_money_enabled','payouts_enabled','cashout_enabled');

create function pg_temp.google_event(n integer,event_id text,event_type text,
  starts_at timestamptz,expires_at timestamptz,occurred_at timestamptz)
returns jsonb language sql volatile as $$
  select public.process_revenuecat_premium_event_atomic(
    'revenuecat_google_play',event_id,event_type,pg_temp.restore_user(n),
    product.provider_product_id,product.provider_base_plan_id,'sandbox','active',
    starts_at,expires_at,occurred_at,999,'usd',md5(event_id)||md5(event_id),
    'NORMAL','google_play','android',null,product.id,'google-restore-original-'||n)
  from public.monetization_products product
  where product.product_key='premium_subscription_monthly'
    and product.provider='revenuecat_google_play'
    and product.provider_product_id='premium_subscription'
    and product.provider_base_plan_id='monthly' and product.environment='sandbox'
$$;
create function pg_temp.google_terminal(n integer,kind text) returns jsonb language sql volatile as $$
  select public.process_revenuecat_terminal_event_atomic(
    'revenuecat_google_play','google-restore-terminal-'||n,kind,pg_temp.restore_user(n),
    'premium_subscription','monthly','sandbox',
    case when kind='EXPIRATION' then 'expired' else 'revoked' end,
    now()-interval '3 hours',now()-interval '1 hour',now()-interval '1 hour',
    md5('terminal-'||n)||md5('terminal-'||n),'NORMAL','google_play','android',
    'google-restore-original-'||n)
$$;
-- This wrapper supplies inputs to the actual production function; it does not
-- reproduce its validator, authority lookup, ordering, or mutation logic.
create function pg_temp.google_snapshot(n integer,event_id text,overrides jsonb default '{}'::jsonb)
returns jsonb language sql volatile as $$
  select public.reconcile_revenuecat_google_premium_snapshot_atomic(
    a->>'event', (a->>'user')::uuid, a->>'customer',a->>'subscription',a->>'original',
    a->>'product',a->>'plan',a->>'status',(a->>'start')::timestamptz,
    (a->>'expiry')::timestamptz,(a->>'observed')::timestamptz,a->>'hash')
  from (select jsonb_build_object(
    'event',event_id,'user',pg_temp.restore_user(n),'customer',pg_temp.restore_user(n),
    'subscription','google-restore-subscription-'||n,'original','google-restore-original-'||n,
    'product','premium_subscription','plan','monthly','status','active',
    'start',now()-interval '30 minutes','expiry',now()+interval '1 hour',
    'observed',now(),'hash',repeat('a',64)) || overrides a) args
$$;
create function pg_temp.restore_graph() returns jsonb language sql volatile as $$
  select jsonb_build_object(
    'events',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.provider_events r),
    'entitlements',(select coalesce(jsonb_agg(to_jsonb(r) order by r.user_id,r.entitlement_key),'[]') from public.user_entitlements r),
    'grants',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.access_grants r),
    'bindings',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.revenuecat_premium_transaction_authority r),
    'billing',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.billing_events r),
    'money',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.money_access_ledger_events r),
    'catalog',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.monetization_products r),
    'switches',(select coalesce(jsonb_agg(to_jsonb(r) order by r.key),'[]') from public.platform_money_kill_switches r),
    'quarantines',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.revenuecat_terminal_authority_quarantines r))
$$;

select ok(not has_function_privilege('anon',
  'public.reconcile_revenuecat_google_premium_snapshot_atomic(text,uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',
  'execute'),'anonymous users cannot execute the Google authority writer');
select ok(not has_function_privilege('authenticated',
  'public.reconcile_revenuecat_google_premium_snapshot_atomic(text,uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',
  'execute'),'authenticated clients cannot self-assert a provider snapshot');
select ok(has_function_privilege('service_role',
  'public.reconcile_revenuecat_google_premium_snapshot_atomic(text,uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',
  'execute'),'the authenticated Edge service can execute reconciliation');
select ok((select prosecdef and proconfig @> array['search_path=""']
  from pg_proc where oid='public.reconcile_revenuecat_google_premium_snapshot_atomic(text,uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)'::regprocedure),
  'the service function uses an empty search path');
set local role anon;
select throws_ok($$select pg_temp.google_snapshot(1,'google-restore-anon')$$,
  '42501','permission denied for function reconcile_revenuecat_google_premium_snapshot_atomic',
  'an actual anonymous invocation is denied before authority lookup');
reset role;
set local role authenticated;
select throws_ok($$select pg_temp.google_snapshot(1,'google-restore-client')$$,
  '42501','permission denied for function reconcile_revenuecat_google_premium_snapshot_atomic',
  'an actual client invocation cannot impersonate the provider');
reset role;
select is((select count(*)::integer from public.monetization_products
  where product_key='premium_subscription_monthly' and provider='revenuecat_google_play'
    and provider_product_id='premium_subscription' and provider_base_plan_id='monthly'
    and product_type='premium_subscription' and environment='sandbox' and status='sandbox'
    and is_android_digital),1,'the fixture uses the exact existing Android sandbox catalog');
select is(pg_temp.google_event(n,'google-restore-initial-'||n,'INITIAL_PURCHASE',
  now()-interval '3 hours',now()+interval '1 hour',now()-interval '3 hours')->>'status',
  'processed','real initial producer establishes account '||n)
from generate_series(1,9) n;

-- Model a missed renewal after elapsed access without inventing purchase rows.
-- Only the two existing access expiries change; original provider proof remains.
update public.user_entitlements set expires_at=now()-interval '1 minute'
  where user_id=pg_temp.restore_user(1)::text and entitlement_key='premium';
update public.access_grants set expires_at=now()-interval '1 minute'
  where user_id=pg_temp.restore_user(1) and grant_type='premium';
select ok(not public.premium_subject_has_finite_authority_internal(pg_temp.restore_user(1)::text),
  'clock-expired access is not authoritative before Restore');
create temporary table before_restore on commit drop as select pg_temp.restore_graph() graph;
create temporary table original_ids on commit drop as
  select 'grant' kind,id from public.access_grants union all
  select 'binding',id from public.revenuecat_premium_transaction_authority;
set local role service_role;
select is(pg_temp.google_snapshot(1,'google-restore-snapshot-1')->>'status','processed',
  'the real service role restores the existing account from a newer finite snapshot');
reset role;
select ok(public.premium_subject_has_finite_authority_internal(pg_temp.restore_user(1)::text),
  'the existing backend Premium resolver accepts the repaired exact graph');
select results_eq(
  $$select 'grant'::text kind,id from public.access_grants union all select 'binding',id from public.revenuecat_premium_transaction_authority order by kind,id$$,
  $$select kind,id from original_ids order by kind,id$$,
  'Restore updates exactly the preexisting grant and binding IDs');
select is(pg_temp.restore_graph()-array['events','entitlements','grants','bindings'],
  (select graph-array['events','entitlements','grants','bindings'] from before_restore),
  'billing, money rows, catalog, switches and quarantine are byte-identical');
select is((select jsonb_agg(to_jsonb(r) order by r.user_id,r.entitlement_key)
  from public.user_entitlements r where r.user_id<>pg_temp.restore_user(1)::text),
  (select jsonb_agg(r order by r->>'user_id',r->>'entitlement_key')
  from before_restore,jsonb_array_elements(graph->'entitlements') r
  where r->>'user_id'<>pg_temp.restore_user(1)::text),'unrelated entitlements are unchanged');
select ok((select count(*)=1 and bool_and(event_type='RECONCILIATION' and status='processed'
  and metadata->>'provider_snapshot_only'='true' and metadata->>'provider_transaction_created'='false'
  and metadata->>'billing_event_created'='false' and metadata->>'money_ledger_created'='false'
  and metadata->>'original_transaction_id'='google-restore-original-1')
  from public.provider_events where provider_event_id='google-restore-snapshot-1'),
  'Restore creates one typed verification event, not a purchase event');
create temporary table stable_graph on commit drop as select pg_temp.restore_graph() graph;
select is(pg_temp.google_snapshot(1,'google-restore-snapshot-1')->>'status','duplicate_ignored',
  'the exact snapshot retry is idempotent');
select is(pg_temp.google_snapshot(1,'google-restore-snapshot-1')->>'duplicateEvent','true',
  'a second exact retry is still a duplicate');
select is(pg_temp.restore_graph(),(select graph from stable_graph),
  'both duplicate calls preserve every captured row, including update timestamps');

select throws_ok(format('select pg_temp.google_snapshot(1,%L,%L::jsonb)',
  'google-restore-snapshot-1',overrides),expected,label)
from (values
  (jsonb_build_object('hash',repeat('b',64)),'premium_reconciliation_duplicate_identity_mismatch','same ID with changed hash is rejected'),
  ('{"status":"trialing"}'::jsonb,'premium_reconciliation_duplicate_identity_mismatch','same ID with changed status is rejected'),
  (jsonb_build_object('expiry',now()+interval '2 hours'),'premium_reconciliation_duplicate_identity_mismatch','same ID with changed expiry is rejected'),
  ('{"subscription":"different-subscription"}'::jsonb,'premium_reconciliation_duplicate_identity_mismatch','same ID with changed provider subscription is rejected'),
  (jsonb_build_object('start',now()-interval '20 minutes'),'premium_reconciliation_duplicate_identity_mismatch','same ID with changed start is rejected'),
  (jsonb_build_object('user',pg_temp.restore_user(9),'customer',pg_temp.restore_user(9)),
    'premium_reconciliation_cross_user_transaction','a different account cannot claim the bound original'),
  (jsonb_build_object('customer',pg_temp.restore_user(9)),'premium_reconciliation_identity_invalid','a different original customer is rejected'),
  ('{"original":"unbound-new-v2-segment"}'::jsonb,'premium_reconciliation_original_authority_missing','a new subscription segment cannot invent an original binding'),
  ('{"product":"another-product"}'::jsonb,'premium_reconciliation_store_mapping_invalid','unknown SKU cannot choose the existing product'),
  ('{"plan":"yearly"}'::jsonb,'premium_reconciliation_store_mapping_invalid','unknown base plan cannot fall back to monthly'),
  ('{"plan":"Monthly"}'::jsonb,'premium_reconciliation_identity_invalid','malformed base plan is rejected'),
  ('{"hash":"invalid"}'::jsonb,'premium_reconciliation_identity_invalid','malformed provider hash is rejected'),
  ('{"event":" "}'::jsonb,'premium_reconciliation_identity_invalid','empty snapshot identity is rejected'),
  ('{"status":"revoked"}'::jsonb,'premium_reconciliation_identity_invalid','a revoked status cannot activate access')
) cases(overrides,expected,label);
select throws_ok(format('select pg_temp.google_snapshot(1,%L,%L::jsonb)',
  'google-restore-invalid-period',overrides),'premium_reconciliation_period_invalid',label)
from (values
  ('{"start":null}'::jsonb,'missing start is rejected'),
  ('{"start":"-infinity"}'::jsonb,'nonfinite start is rejected'),
  (jsonb_build_object('start',now()+interval '1 hour'),'future start is rejected'),
  ('{"expiry":null}'::jsonb,'missing expiry is rejected'),
  ('{"expiry":"infinity"}'::jsonb,'nonfinite expiry is rejected'),
  (jsonb_build_object('expiry',now()-interval '1 second'),'expired proof is rejected'),
  ('{"observed":null}'::jsonb,'missing observation is rejected'),
  (jsonb_build_object('observed',now()-interval '6 minutes'),'stale provider observation is rejected'),
  (jsonb_build_object('observed',now()+interval '6 minutes'),'future provider observation is rejected')
) cases(overrides,label);
select throws_ok($$select pg_temp.google_snapshot(10,'google-restore-no-initial')$$,
  'premium_reconciliation_original_authority_missing','missing initial webhook evidence remains explicitly blocked');
select is(pg_temp.restore_graph(),(select graph from stable_graph),
  'all invalid identity and period calls leave the entire graph unchanged');

-- Newer real webhook authority outranks an older Restore; timestamps come
-- from provider periods, never from when the client pressed Restore.
select is(pg_temp.google_event(1,'google-restore-z-renewal','RENEWAL',
  now()-interval '10 minutes',now()+interval '2 hours',now()-interval '10 minutes')->>'status',
  'processed','a real newer renewal advances the same original authority');
update stable_graph set graph=pg_temp.restore_graph();
select is(pg_temp.google_snapshot(1,'google-restore-unseen-older')->>'reason',
  'premium_reconciliation_snapshot_stale','an unseen older snapshot is a read-only stale acknowledgement');
select is(pg_temp.google_snapshot(1,'google-restore-a-equal',
  jsonb_build_object('start',now()-interval '10 minutes'))->>'reason',
  'premium_reconciliation_snapshot_stale','equal-time lower C-sort identity cannot regress a renewal');
select is(pg_temp.restore_graph(),(select graph from stable_graph),
  'stale snapshots preserve the newer period, money and every authority row');

-- Ordinary expiry must be produced by the real terminal function. The same
-- function produces the separate financial-terminal negative fixtures below.
select is(pg_temp.google_terminal(2,'EXPIRATION')->>'status','processed',
  'the real terminal dispatcher records ordinary expiration');
select ok((select authority_state='expired' and latest_event_type='EXPIRATION'
  from public.revenuecat_premium_transaction_authority where original_transaction_id='google-restore-original-2')
  and (select status='expired' and revoked_at=now()-interval '1 hour'
    and revoke_reason='RevenueCat expiration terminal dispatch.' and refunded_at is null
    from public.access_grants where user_id=pg_temp.restore_user(2) and grant_type='premium'),
  'the real expiry creates the precise removable ordinary-expiration marker');
create temporary table expiry_evidence on commit drop as
  select to_jsonb(r) evidence from public.provider_events r where provider_event_id='google-restore-terminal-2';

-- Mutate one marker field at a time in rollback-only adversarial fixtures.
-- The binding and original event remain genuine; none of these edits is a
-- production recovery operation or a replacement for the terminal producer.
savepoint expiry_marker;
update public.access_grants set revoke_reason='RevenueCat revocation terminal dispatch.'
  where user_id=pg_temp.restore_user(2) and grant_type='premium';
update stable_graph set graph=pg_temp.restore_graph();
select throws_ok($$select pg_temp.google_snapshot(2,'google-restore-bad-reason')$$,
  'premium_reconciliation_bound_grant_mismatch','a financial-looking revoke reason cannot be cleared');
select is(pg_temp.restore_graph(),(select graph from stable_graph),'wrong reason rejection is atomic');
rollback to expiry_marker;
update public.access_grants set revoked_at=revoked_at+interval '1 second'
  where user_id=pg_temp.restore_user(2) and grant_type='premium';
select throws_ok($$select pg_temp.google_snapshot(2,'google-restore-bad-time')$$,
  'premium_reconciliation_bound_grant_mismatch','a different revoke time cannot be cleared');
rollback to expiry_marker;
update public.access_grants set metadata=jsonb_set(metadata,'{terminal_dispatch_domain}','"creator"')
  where user_id=pg_temp.restore_user(2) and grant_type='premium';
select throws_ok($$select pg_temp.google_snapshot(2,'google-restore-bad-domain')$$,
  'premium_reconciliation_bound_grant_mismatch','another terminal domain cannot be cleared');
rollback to expiry_marker;
update public.access_grants set metadata=jsonb_set(metadata,'{latest_provider_event_id}','"different-event"')
  where user_id=pg_temp.restore_user(2) and grant_type='premium';
select throws_ok($$select pg_temp.google_snapshot(2,'google-restore-bad-event')$$,
  'premium_reconciliation_bound_grant_mismatch','a marker for another event cannot be cleared');
rollback to expiry_marker;
update public.access_grants set metadata=jsonb_set(metadata,'{original_transaction_id}','"another-original"')
  where user_id=pg_temp.restore_user(2) and grant_type='premium';
select throws_ok($$select pg_temp.google_snapshot(2,'google-restore-bad-original')$$,
  'premium_reconciliation_bound_grant_mismatch','a marker for another original cannot be cleared');
rollback to expiry_marker;
select throws_ok($$select pg_temp.google_snapshot(2,'google-restore-old-period',
  jsonb_build_object('start',now()-interval '2 hours'))$$,
  'premium_reconciliation_bound_grant_mismatch','a pre-expiration period cannot remove the ordinary-expiry marker');
update stable_graph set graph=pg_temp.restore_graph();
select is(pg_temp.google_snapshot(2,'google-restore-after-expiration')->>'status','processed',
  'a strictly newer verified period restores an ordinarily expired subscription');
select ok(public.premium_subject_has_finite_authority_internal(pg_temp.restore_user(2)::text)
  and (select revoked_at is null and revoke_reason is null and refunded_at is null and status='sandbox_only'
    from public.access_grants where user_id=pg_temp.restore_user(2) and grant_type='premium'),
  'only the matched ordinary-expiry marker is cleared and finite authority returns');
select is((select to_jsonb(r) from public.provider_events r where provider_event_id='google-restore-terminal-2'),
  (select evidence from expiry_evidence),'the prior terminal evidence remains immutable');
select is(pg_temp.restore_graph()-array['events','entitlements','grants','bindings'],
  (select graph-array['events','entitlements','grants','bindings'] from stable_graph),
  'restoring ordinary expiration adds no billing or money and changes no catalog or switch');

select is(pg_temp.google_terminal(n,kind)->>'status',expected,'real terminal fixture: '||kind)
from (values(3,'REFUND','refunded'),(4,'REVOCATION','reversed'),(5,'SUBSCRIPTION_PAUSED','reversed')) cases(n,kind,expected);
update stable_graph set graph=pg_temp.restore_graph();
select throws_ok(format('select pg_temp.google_snapshot(%s,%L)',n,'google-restore-after-financial-'||n),
  'premium_reconciliation_terminal_authority_not_superseded','Restore cannot supersede '||kind)
from (values(3,'REFUND'),(4,'REVOCATION'),(5,'SUBSCRIPTION_PAUSED')) cases(n,kind);
select is(pg_temp.restore_graph(),(select graph from stable_graph),'all financial-terminal refusals preserve their graph');
select ok(not public.premium_subject_has_finite_authority_internal(pg_temp.restore_user(n)::text),
  'terminal account '||n||' stays without Premium') from generate_series(3,5) n;

savepoint scoped_quarantine;
select is(public.quarantine_revenuecat_terminal_authority('revenuecat_google_play','google-restore-quarantine',
  'TRANSFER',pg_temp.restore_user(6),'sandbox',repeat('c',64),
  'terminal_identity_invalid:transfer_target_identity_missing_or_ambiguous')->>'status','quarantined',
  'canonical quarantine RPC projects the exact subject restriction');
update stable_graph set graph=pg_temp.restore_graph();
select throws_ok($$select pg_temp.google_snapshot(6,'google-restore-quarantined')$$,
  'premium_reconciliation_subject_restricted','a covering exact quarantine cannot be bypassed');
select is(pg_temp.restore_graph(),(select graph from stable_graph),'quarantine denial changes neither quarantine nor access');
rollback to scoped_quarantine;
savepoint global_quarantine;
select is(public.quarantine_revenuecat_terminal_authority('unknown-store','google-restore-global-quarantine',
  'TRANSFER',null,null,repeat('d',64),'terminal_identity_invalid:unknown_store')->>'status','quarantined',
  'canonical quarantine RPC can establish a global uncertainty barrier');
select throws_ok($$select pg_temp.google_snapshot(7,'google-restore-globally-quarantined')$$,
  'premium_reconciliation_subject_restricted','a global quarantine also blocks Restore');
rollback to global_quarantine;

savepoint production_entitlement;
update public.user_entitlements set metadata=jsonb_set(metadata,'{environment}','"production"')
  where user_id=pg_temp.restore_user(7)::text and entitlement_key='premium';
update stable_graph set graph=pg_temp.restore_graph();
select throws_ok($$select pg_temp.google_snapshot(7,'google-restore-over-production')$$,
  'premium_reconciliation_cannot_override_production','sandbox Restore cannot overwrite production entitlement evidence');
select is(pg_temp.restore_graph(),(select graph from stable_graph),'production projection remains byte-identical');
rollback to production_entitlement;

savepoint bad_entitlement;
update public.user_entitlements set metadata=jsonb_set(metadata,'{revenuecat_event_hash}',to_jsonb(repeat('f',64)))
  where user_id=pg_temp.restore_user(7)::text and entitlement_key='premium';
update stable_graph set graph=pg_temp.restore_graph();
select throws_ok($$select pg_temp.google_snapshot(7,'google-restore-bad-entitlement')$$,
  'premium_reconciliation_bound_entitlement_mismatch','mismatched entitlement evidence is not silently repaired');
select is(pg_temp.restore_graph(),(select graph from stable_graph),'bad entitlement rejection is atomic');
rollback to bad_entitlement;
savepoint bad_anchor;
update public.revenuecat_premium_transaction_authority set latest_event_hash=repeat('f',64)
  where original_transaction_id='google-restore-original-7';
update stable_graph set graph=pg_temp.restore_graph();
select throws_ok($$select pg_temp.google_snapshot(7,'google-restore-bad-anchor')$$,
  'premium_reconciliation_bound_evidence_missing','a mismatched bound provider hash cannot establish current authority');
select is(pg_temp.restore_graph(),(select graph from stable_graph),'missing exact anchor rejection is atomic');
rollback to bad_anchor;
savepoint bad_grant;
update public.access_grants set source_type='admin' where user_id=pg_temp.restore_user(7) and grant_type='premium';
select throws_ok($$select pg_temp.google_snapshot(7,'google-restore-admin-grant')$$,
  'premium_reconciliation_bound_grant_mismatch','an administrative grant cannot become provider authority');
rollback to bad_grant;

savepoint catalog_gate;
update public.monetization_products set is_android_digital=false where product_key='premium_subscription_monthly';
select throws_ok($$select pg_temp.google_snapshot(7,'google-restore-nondigital')$$,
  'premium_reconciliation_store_mapping_invalid','nondigital catalog mapping is not accepted');
rollback to catalog_gate;
update public.monetization_products set status='setup' where product_key='premium_subscription_monthly';
select throws_ok($$select pg_temp.google_snapshot(7,'google-restore-inactive-catalog')$$,
  'premium_reconciliation_store_mapping_invalid','inactive catalog mapping is not accepted');
rollback to catalog_gate;

savepoint rail_gate;
update public.platform_money_kill_switches set state='off' where key='revenuecat_google_play_enabled';
select throws_ok($$select pg_temp.google_snapshot(7,'google-restore-disabled-google')$$,
  'premium_reconciliation_sandbox_rail_disabled','disabled Google rail remains closed');
rollback to rail_gate;
update public.platform_money_kill_switches set state='off' where key='provider_webhooks_enabled';
select throws_ok($$select pg_temp.google_snapshot(7,'google-restore-disabled-webhooks')$$,
  'premium_reconciliation_sandbox_rail_disabled','disabled provider rail remains closed');
rollback to rail_gate;
-- The real switch trigger requires trusted service request context for these
-- rollback-only high-risk fixture states. Each rollback clears that context.
select set_config('request.jwt.claim.role','service_role',true);
update public.platform_money_kill_switches set state='on' where key='live_money_enabled';
select throws_ok($$select pg_temp.google_snapshot(7,'google-restore-live-money')$$,
  'premium_reconciliation_pre_activation_switches_required','active live-money rail blocks this sandbox repair');
rollback to rail_gate;
select set_config('request.jwt.claim.role','service_role',true);
update public.platform_money_kill_switches set state='on' where key='payouts_enabled';
select throws_ok($$select pg_temp.google_snapshot(7,'google-restore-payouts')$$,
  'premium_reconciliation_pre_activation_switches_required','active payouts block this sandbox repair');
rollback to rail_gate;
-- The canonical key constraint excludes cashout_enabled. A valid fixture cannot
-- switch it on; the real positive restores above cover its absent-as-off state.

-- A real failure after event INSERT and entitlement UPDATE must roll them back.
-- The temporary trigger is test-only, restricted to one fake account, and the
-- whole test transaction rolls back the trigger as well as all fixture rows.
create function pg_temp.reject_restore_grant() returns trigger language plpgsql as $$
begin
  if new.user_id=pg_temp.restore_user(8) then raise exception 'test_restore_grant_write_failed'; end if;
  return new;
end $$;
create trigger test_google_restore_grant_failure before update on public.access_grants
  for each row execute function pg_temp.reject_restore_grant();
update stable_graph set graph=pg_temp.restore_graph();
select throws_ok($$select pg_temp.google_snapshot(8,'google-restore-forced-write-failure')$$,
  'test_restore_grant_write_failed','a downstream grant failure aborts the actual Restore transaction');
select is(pg_temp.restore_graph(),(select graph from stable_graph),
  'failed Restore rolls back its provider event and earlier entitlement update');
drop trigger test_google_restore_grant_failure on public.access_grants;
select is(pg_temp.google_snapshot(8,'google-restore-after-write-failure')->>'status','processed',
  'the same intact existing graph can subsequently reconcile successfully');
select is(pg_temp.restore_graph()-array['events','entitlements','grants','bindings'],
  (select graph-array['events','entitlements','grants','bindings'] from stable_graph),
  'successful retry still adds no billing or money and changes no catalog or switch');
select is((select count(*)::integer from public.provider_events where provider_event_id='google-restore-forced-write-failure'),0,
  'the aborted verification event was not retained');
select results_eq(
  $$select 'grant'::text kind,id from public.access_grants union all select 'binding',id from public.revenuecat_premium_transaction_authority order by kind,id$$,
  $$select kind,id from original_ids order by kind,id$$,
  'all success, terminal and rejected cases preserve original grant/binding cardinality');
select is(public.process_revenuecat_terminal_event_atomic('revenuecat_google_play',
  'google-restore-refund-after-snapshot','REFUND',pg_temp.restore_user(8),
  'premium_subscription','monthly','sandbox','revoked',now()-interval '30 minutes',
  now()+interval '1 hour',now(),repeat('e',64),'NORMAL','google_play','android',
  'google-restore-original-8')->>'status','refunded','a real later refund terminates the restored original');
update stable_graph set graph=pg_temp.restore_graph();
select throws_ok($$select pg_temp.google_snapshot(8,'google-restore-after-write-failure')$$,
  'premium_reconciliation_terminal_authority_not_superseded','even an exact historical snapshot replay cannot supersede a later refund');
select is(pg_temp.restore_graph(),(select graph from stable_graph),
  'the historical snapshot retry preserves the later financial terminal state');
select * from finish();
rollback;
