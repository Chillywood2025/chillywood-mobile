begin;
select plan(51);

select has_table('public','paid_live_watch_party_offers','1. exact live offers table exists');
select has_table('public','paid_live_watch_party_passes','2. exact live passes table exists');
select is((select relforcerowsecurity from pg_class where oid='public.paid_live_watch_party_offers'::regclass),true,'3. offers force RLS');
select is((select relforcerowsecurity from pg_class where oid='public.paid_live_watch_party_passes'::regclass),true,'4. passes force RLS');
select ok(not has_table_privilege('authenticated','public.paid_live_watch_party_offers','INSERT'),'5. clients cannot mint offers');
select ok(not has_table_privilege('authenticated','public.paid_live_watch_party_passes','INSERT'),'6. clients cannot mint passes');
select ok(has_function_privilege('authenticated','public.resolve_live_watch_party_money_access(text)','EXECUTE'),'7. viewer can resolve exact live authority');
select ok(not has_function_privilege('authenticated','public.process_revenuecat_live_watch_party_event_atomic(text,text,text,uuid,text,text,timestamptz,integer,text,text,text)','EXECUTE'),'8. provider projector is service-only');

select ok(position('room."room_type"<>''live''' in pg_get_functiondef('public.set_my_live_watch_party_offer(text,text,boolean,text)'::regprocedure))>0
  and position('room."host_user_id" is distinct from v_user' in pg_get_functiondef('public.set_my_live_watch_party_offer(text,text,boolean,text)'::regprocedure))>0,
  '9. creator offer binds exact live room and host');
select ok(position('creator_cannot_purchase_own_offer' in pg_get_functiondef('public.create_live_watch_party_purchase_intent(uuid)'::regprocedure))>0
  and position('creator_money_blocked_by_audience_policy' in pg_get_functiondef('public.create_live_watch_party_purchase_intent(uuid)'::regprocedure))>0,
  '10. self-purchase and audience blocks deny');
select ok(position('live_watch_party_access' in pg_get_functiondef('public.create_live_watch_party_purchase_intent(uuid)'::regprocedure))>0
  and position('live_watch_party_seat' in pg_get_functiondef('public.create_live_watch_party_purchase_intent(uuid)'::regprocedure))>0,
  '11. access and seat purchase intents stay distinct');
select ok(position('original_transaction_id' in pg_get_functiondef('public.process_revenuecat_live_watch_party_event_atomic(text,text,text,uuid,text,text,timestamptz,integer,text,text,text)'::regprocedure))>0
  and position('binding_state' in pg_get_functiondef('public.process_revenuecat_live_watch_party_event_atomic(text,text,text,uuid,text,text,timestamptz,integer,text,text,text)'::regprocedure))>0,
  '12. provider event binds immutable original transaction');
select ok(position('''payment_role_authority'',false' in pg_get_functiondef('public.process_revenuecat_live_watch_party_event_atomic(text,text,text,uuid,text,text,timestamptz,integer,text,text,text)'::regprocedure))>0
  and position('''authority_granted'',false' in pg_get_functiondef('public.process_revenuecat_live_watch_party_event_atomic(text,text,text,uuid,text,text,timestamptz,integer,text,text,text)'::regprocedure))>0,
  '13. provider payment cannot grant media authority');
select ok(position('exact_live_access_viewer_authority' in pg_get_functiondef('public.resolve_live_watch_party_money_access_as_service_internal(text,uuid)'::regprocedure))>0
  and position('exact_live_seat_eligibility_authority' in pg_get_functiondef('public.resolve_live_watch_party_money_access_as_service_internal(text,uuid)'::regprocedure))>0,
  '14. LiveKit access and seat authority remain distinct');
select ok(position('stage_role"=''speaker''' in pg_get_functiondef('public.record_watch_party_money_pass_use_internal()'::regprocedure))>0,
  '15. host-approved persisted speaker state records approval separately');
select ok(position('meaningful_entry_at' in pg_get_functiondef('public.record_live_watch_party_money_obligation_completion(uuid,text)'::regprocedure))>0
  and position('approved_at' in pg_get_functiondef('public.record_live_watch_party_money_obligation_completion(uuid,text)'::regprocedure))>0,
  '16. completion requires entry and seat approval where applicable');
select is((select requires_obligation_completion from public.creator_money_settlement_policies where source_type='live_watch_party_access'),true,
  '17. live access settlement waits for completion');
select is((select requires_obligation_completion from public.creator_money_settlement_policies where source_type='live_watch_party_seat'),true,
  '18. live seat settlement waits for completion');
select ok(position('live_pass_offer_requires_empty_room' in pg_get_functiondef('public.set_my_live_watch_party_offer(text,text,boolean,text)'::regprocedure))>0,
  '19. paid live offer cannot be enabled over an already occupied room');

-- Executable provider/access/authority lifecycle proof. All fixtures live only
-- inside this rolled-back pgTAP transaction and never weaken production RLS.
set local session_replication_role=replica;
insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values
  ('a1000000-0000-4000-8000-000000000001',false,false,timezone('utc'::text,now())),
  ('b1000000-0000-4000-8000-000000000001',false,false,timezone('utc'::text,now())),
  ('b1000000-0000-4000-8000-000000000002',false,false,timezone('utc'::text,now())),
  ('b1000000-0000-4000-8000-000000000003',false,false,timezone('utc'::text,now()))
on conflict (id) do nothing;
insert into public.watch_party_rooms(party_id,host_user_id,room_type,is_active) values
  ('RFGC-LIVE-A','a1000000-0000-4000-8000-000000000001','live',true),
  ('RFGC-LIVE-B','a1000000-0000-4000-8000-000000000001','live',true),
  ('RFGC-LIVE-FREE','a1000000-0000-4000-8000-000000000001','live',true),
  ('RFGC-LIVE-SEAT-ONLY','a1000000-0000-4000-8000-000000000001','live',true),
  ('RFGC-PARTY-A','a1000000-0000-4000-8000-000000000001','title',true);
insert into public.paid_live_watch_party_offers(
  id,party_id,creator_id,host_user_id,pass_type,product_id,provider,provider_product_id,
  price_cents,currency,environment,status
) values
  ('c1000000-0000-4000-8000-000000000001','RFGC-LIVE-A','a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    'live_watch_party_access_pass',(select id from public.monetization_products where product_key='live_watch_party_access_pass_sandbox_099'),
    'revenuecat_google_play','cw_live_watch_party_access_sandbox_099',99,'usd','sandbox','sandbox'),
  ('c1000000-0000-4000-8000-000000000002','RFGC-LIVE-A','a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    'live_watch_party_seat_pass',(select id from public.monetization_products where product_key='live_watch_party_seat_pass_sandbox_099'),
    'revenuecat_google_play','cw_live_watch_party_seat_sandbox_099',99,'usd','sandbox','sandbox'),
  ('c1000000-0000-4000-8000-000000000003','RFGC-LIVE-B','a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    'live_watch_party_access_pass',(select id from public.monetization_products where product_key='live_watch_party_access_pass_sandbox_099'),
    'revenuecat_google_play','cw_live_watch_party_access_sandbox_099',99,'usd','sandbox','sandbox'),
  ('c1000000-0000-4000-8000-000000000004','RFGC-LIVE-SEAT-ONLY','a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    'live_watch_party_seat_pass',(select id from public.monetization_products where product_key='live_watch_party_seat_pass_sandbox_099'),
    'revenuecat_google_play','cw_live_watch_party_seat_sandbox_099',99,'usd','sandbox','sandbox');
insert into public.paid_watch_party_offers(
  id,party_id,creator_id,host_id,title,price_cents,currency,status,provider,
  provider_product_key,provider_product_id,metadata
) values (
  'e1000000-0000-4000-8000-000000000001','RFGC-PARTY-A',
  'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
  'RFGC ordinary Party Room Seat Pass',99,'usd','sandbox','revenuecat_google_play',
  'watch_party_live_ticket_sandbox_099','cw_watch_party_ticket_sandbox_099','{}'
);
insert into public.paid_watch_party_tickets(
  id,offer_id,party_id,buyer_id,creator_id,host_id,provider,provider_transaction_id,status,metadata
) values (
  'f1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','RFGC-PARTY-A',
  'b1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001','revenuecat_google_play','rfgc-party-provider-event','active','{}'
);
insert into public.watch_party_room_memberships(party_id,user_id,role,stage_role,membership_state)
values ('RFGC-PARTY-A','b1000000-0000-4000-8000-000000000003','viewer','listener','active');
insert into public.money_purchase_intents(
  id,user_id,product_id,product_key,product_type,provider,provider_product_id,source_type,source_id,
  creator_id,environment,status,amount_minor,currency,idempotency_key,expires_at,session_generation,metadata
) values
  ('d1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',
    (select id from public.monetization_products where product_key='live_watch_party_access_pass_sandbox_099'),
    'live_watch_party_access_pass_sandbox_099','live_watch_party_access_pass','revenuecat_google_play','cw_live_watch_party_access_sandbox_099',
    'live_watch_party_access','c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    'sandbox','pending',99,'usd','rfgc-live-access-b1',timezone('utc'::text,now())+interval '15 minutes','rfgc-session-b1','{}'),
  ('d1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002',
    (select id from public.monetization_products where product_key='live_watch_party_seat_pass_sandbox_099'),
    'live_watch_party_seat_pass_sandbox_099','live_watch_party_seat_pass','revenuecat_google_play','cw_live_watch_party_seat_sandbox_099',
    'live_watch_party_seat','c1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001',
    'sandbox','pending',99,'usd','rfgc-live-seat-b2',timezone('utc'::text,now())+interval '15 minutes','rfgc-session-b2-seat','{}'),
  ('d1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002',
    (select id from public.monetization_products where product_key='live_watch_party_access_pass_sandbox_099'),
    'live_watch_party_access_pass_sandbox_099','live_watch_party_access_pass','revenuecat_google_play','cw_live_watch_party_access_sandbox_099',
    'live_watch_party_access','c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    'sandbox','pending',99,'usd','rfgc-live-access-b2',timezone('utc'::text,now())+interval '15 minutes','rfgc-session-b2-access','{}'),
  ('d1000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000003',
    (select id from public.monetization_products where product_key='live_watch_party_access_pass_sandbox_099'),
    'live_watch_party_access_pass_sandbox_099','live_watch_party_access_pass','revenuecat_google_play','cw_live_watch_party_access_sandbox_099',
    'live_watch_party_access','c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    'sandbox','pending',99,'usd','rfgc-live-access-b3',timezone('utc'::text,now())+interval '15 minutes','rfgc-session-b3-access','{}');
set local session_replication_role=origin;

select lives_ok($$select public.process_revenuecat_live_watch_party_event_atomic(
  'revenuecat_google_play','rfgc-access-b1-active','NON_RENEWING_PURCHASE','b1000000-0000-4000-8000-000000000001',
  'cw_live_watch_party_access_sandbox_099','sandbox',timezone('utc'::text,now()),99,'usd',repeat('a',64),'rfgc-original-access-b1')$$,
  '20. provider projects an exact access purchase atomically');
select is((select count(*)::integer from public.paid_live_watch_party_passes
  where buyer_id='b1000000-0000-4000-8000-000000000001' and party_id='RFGC-LIVE-A'
    and pass_type='live_watch_party_access_pass' and status='active'),1,'21. exact access pass row is active');
select is((public.resolve_live_watch_party_money_access_as_service_internal('RFGC-LIVE-A','b1000000-0000-4000-8000-000000000001')->>'allowed')::boolean,
  true,'22. access buyer can enter the exact target');
select is((public.resolve_live_watch_party_money_access_as_service_internal('RFGC-LIVE-A','b1000000-0000-4000-8000-000000000001')->>'speakerEligible')::boolean,
  false,'23. access payment alone cannot request or publish from a paid seat');

select lives_ok($$select public.process_revenuecat_live_watch_party_event_atomic(
  'revenuecat_google_play','rfgc-seat-b2-active','NON_RENEWING_PURCHASE','b1000000-0000-4000-8000-000000000002',
  'cw_live_watch_party_seat_sandbox_099','sandbox',timezone('utc'::text,now()),99,'usd',repeat('b',64),'rfgc-original-seat-b2')$$,
  '24. provider projects exact seat eligibility without role authority');
select is((public.resolve_live_watch_party_money_access_as_service_internal('RFGC-LIVE-A','b1000000-0000-4000-8000-000000000002')->>'allowed')::boolean,
  false,'25. seat eligibility does not substitute for a required Live Access Pass');
select lives_ok($$select public.process_revenuecat_live_watch_party_event_atomic(
  'revenuecat_google_play','rfgc-access-b2-active','NON_RENEWING_PURCHASE','b1000000-0000-4000-8000-000000000002',
  'cw_live_watch_party_access_sandbox_099','sandbox',timezone('utc'::text,now()),99,'usd',repeat('c',64),'rfgc-original-access-b2')$$,
  '26. separate exact access purchase reconciles independently');
select is((public.resolve_live_watch_party_money_access_as_service_internal('RFGC-LIVE-A','b1000000-0000-4000-8000-000000000002')->>'speakerEligible')::boolean,
  true,'27. access plus seat yields eligibility but still not host approval');
select is((public.resolve_live_watch_party_money_access_as_service_internal('RFGC-LIVE-B','b1000000-0000-4000-8000-000000000001')->>'allowed')::boolean,
  false,'28. an exact pass cannot unlock another live target');
select is((public.resolve_live_watch_party_money_access_as_service_internal('RFGC-LIVE-FREE','b1000000-0000-4000-8000-000000000001')->>'speakerEligible')::boolean,
  true,'29. a free live room preserves ordinary host-approved seat requests');
select is((public.resolve_live_watch_party_money_access_as_service_internal('RFGC-LIVE-SEAT-ONLY','b1000000-0000-4000-8000-000000000001')->>'allowed')::boolean,
  true,'30. optional paid seat eligibility does not create a viewer paywall');
select is((public.resolve_live_watch_party_money_access_as_service_internal('RFGC-LIVE-SEAT-ONLY','b1000000-0000-4000-8000-000000000001')->>'speakerEligible')::boolean,
  false,'31. an optional paid seat remains required only for requesting a seat');

select is((public.process_revenuecat_live_watch_party_event_atomic(
  'revenuecat_google_play','rfgc-access-b1-active','NON_RENEWING_PURCHASE','b1000000-0000-4000-8000-000000000001',
  'cw_live_watch_party_access_sandbox_099','sandbox',timezone('utc'::text,now()),99,'usd',repeat('a',64),'rfgc-original-access-b1')->>'reason'),
  'duplicate_provider_event','32. duplicate provider event is idempotent');
select is((public.process_revenuecat_live_watch_party_event_atomic(
  'revenuecat_google_play','rfgc-access-b1-duplicate-original','NON_RENEWING_PURCHASE','b1000000-0000-4000-8000-000000000001',
  'cw_live_watch_party_access_sandbox_099','sandbox',timezone('utc'::text,now()),99,'usd',repeat('d',64),'rfgc-original-access-b1')->>'reason'),
  'duplicate_original_transaction','33. a second active event cannot duplicate the grant or earning');
update public.paid_live_watch_party_offers set
  creator_id='b1000000-0000-4000-8000-000000000003',
  host_user_id='b1000000-0000-4000-8000-000000000003',price_cents=199
where id='c1000000-0000-4000-8000-000000000001';
select lives_ok($$select public.process_revenuecat_live_watch_party_event_atomic(
  'revenuecat_google_play','rfgc-access-b1-refund','REFUND','b1000000-0000-4000-8000-000000000001',
  'cw_live_watch_party_access_sandbox_099','sandbox',timezone('utc'::text,now())+interval '1 second',99,'usd',repeat('e',64),'rfgc-original-access-b1')$$,
  '34. late provider refund reconciles against the immutable original despite current offer drift');
update public.paid_live_watch_party_offers set
  creator_id='a1000000-0000-4000-8000-000000000001',
  host_user_id='a1000000-0000-4000-8000-000000000001',price_cents=99
where id='c1000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.money_access_ledger_events
  where metadata->>'original_transaction_id'='rfgc-original-access-b1'),2,'35. reversal appends immutable ledger evidence exactly once');
select is((select status from public.paid_live_watch_party_passes
  where buyer_id='b1000000-0000-4000-8000-000000000001' and offer_id='c1000000-0000-4000-8000-000000000001'),
  'refunded','36. refund revokes the exact pass without erasing it');
select is((public.resolve_live_watch_party_money_access_as_service_internal('RFGC-LIVE-A','b1000000-0000-4000-8000-000000000001')->>'allowed')::boolean,
  false,'37. refunded access cannot reappear through LiveKit authority');
select throws_ok($$select public.process_revenuecat_live_watch_party_event_atomic(
  'revenuecat_google_play','rfgc-wrong-user','NON_RENEWING_PURCHASE','b1000000-0000-4000-8000-000000000001',
  'cw_live_watch_party_seat_sandbox_099','sandbox',timezone('utc'::text,now()),99,'usd',repeat('f',64),'rfgc-wrong-user-original')$$,
  'live_watch_party_purchase_intent_missing_or_ambiguous','38. wrong user and intent tuple is denied');
select throws_ok($$select public.process_revenuecat_live_watch_party_event_atomic(
  'revenuecat_google_play','rfgc-wrong-product','NON_RENEWING_PURCHASE','b1000000-0000-4000-8000-000000000002',
  'wrong-provider-product','sandbox',timezone('utc'::text,now()),99,'usd',repeat('1',64),'rfgc-wrong-product-original')$$,
  'live_watch_party_purchase_intent_missing_or_ambiguous','39. wrong product is denied');
select throws_ok($$select public.process_revenuecat_live_watch_party_event_atomic(
  'revenuecat_google_play','rfgc-wrong-environment','NON_RENEWING_PURCHASE','b1000000-0000-4000-8000-000000000002',
  'cw_live_watch_party_access_sandbox_099','production',timezone('utc'::text,now()),99,'usd',repeat('2',64),'rfgc-wrong-environment-original')$$,
  'live_watch_party_purchase_intent_missing_or_ambiguous','40. wrong environment is denied');

update public.platform_money_kill_switches set state='off'
where key='live_watch_party_access_enabled';
select throws_ok($$select public.process_revenuecat_live_watch_party_event_atomic(
  'revenuecat_google_play','rfgc-disabled-rail','NON_RENEWING_PURCHASE','b1000000-0000-4000-8000-000000000003',
  'cw_live_watch_party_access_sandbox_099','sandbox',timezone('utc'::text,now()),99,'usd',repeat('4',64),'rfgc-disabled-rail-original')$$,
  'live_watch_party_sandbox_rail_not_ready','41. disabled live-money rail cannot grant a pass');
update public.platform_money_kill_switches set state='sandbox_only'
where key='live_watch_party_access_enabled';
update public.paid_live_watch_party_offers set price_cents=199
where id='c1000000-0000-4000-8000-000000000001';
select throws_ok($$select public.process_revenuecat_live_watch_party_event_atomic(
  'revenuecat_google_play','rfgc-stale-offer','NON_RENEWING_PURCHASE','b1000000-0000-4000-8000-000000000003',
  'cw_live_watch_party_access_sandbox_099','sandbox',timezone('utc'::text,now()),99,'usd',repeat('3',64),'rfgc-stale-offer-original')$$,
  'live_watch_party_active_offer_binding_stale','42. active event cannot grant after offer mapping changes');
select is((select count(*)::integer from public.paid_live_watch_party_passes
  where buyer_id='b1000000-0000-4000-8000-000000000003'),0,
  '43. stale offer mismatch creates no pass authority');
select is((select creator_id::text from public.money_access_ledger_events
  where metadata->>'original_transaction_id'='rfgc-original-access-b1' and event_type='REFUND'),
  'a1000000-0000-4000-8000-000000000001',
  '44. late reversal retains the immutable original creator binding');
select ok(position('resolve_live_watch_party_money_access_as_service_internal' in
  pg_get_functiondef('public.set_watch_party_participant_authority(text,text,text,boolean,text)'::regprocedure))>0
  and position('speakerEligible' in
  pg_get_functiondef('public.set_watch_party_participant_authority(text,text,text,boolean,text)'::regprocedure))>0,
  '45. canonical host participant RPC enforces exact live seat eligibility');
select ok(position('paid_watch_party_tickets' in
  pg_get_functiondef('public.record_watch_party_money_pass_use_internal()'::regprocedure))>0,
  '46. membership lifecycle records ordinary Party Room ticket use');
select set_config('app.watch_party_membership_authority','server',true);
alter table public.watch_party_room_memberships disable trigger "enforce_watch_party_membership_identity";
alter table public.watch_party_room_memberships disable trigger "enforce_watch_party_room_membership_authority_closeout";
alter table public.watch_party_room_memberships disable trigger "enforce_watch_party_room_membership_block_guard";
update public.watch_party_room_memberships set membership_state='reconnecting'
where party_id='RFGC-PARTY-A' and user_id='b1000000-0000-4000-8000-000000000003';
alter table public.watch_party_room_memberships enable trigger "enforce_watch_party_membership_identity";
alter table public.watch_party_room_memberships enable trigger "enforce_watch_party_room_membership_authority_closeout";
alter table public.watch_party_room_memberships enable trigger "enforce_watch_party_room_membership_block_guard";
select ok((select used_at is not null from public.paid_watch_party_tickets
  where id='f1000000-0000-4000-8000-000000000001'),
  '47. exact ordinary ticket buyer use is physically recorded by the lifecycle trigger');
select ok(position('ticket."used_at" is not null' in
  pg_get_functiondef('public.enforce_exact_watch_party_ticket_completion_internal()'::regprocedure))>0
  and position('ticket."buyer_id"=money."user_id"' in
  pg_get_functiondef('public.enforce_exact_watch_party_ticket_completion_internal()'::regprocedure))>0,
  '48. ordinary completion receipt requires exact buyer meaningful use');
select ok(position('reported_product_mismatch' in
  pg_get_functiondef('public.process_revenuecat_terminal_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text)'::regprocedure))>0,
  '49. terminal evidence preserves the provider-reported product comparison');
select ok(position('is_account_access_restricted' in (select qual from pg_policies
  where schemaname='public' and tablename='paid_live_watch_party_passes'
    and policyname='paid_live_watch_party_passes_read_self_or_creator'))>0,
  '50. restricted accounts cannot directly read Live pass rows');
select ok(position('watch_party_room_memberships' in
  pg_get_functiondef('public.resolve_live_watch_party_money_access(text)'::regprocedure))>0
  and position('v_offer."host_user_id" is distinct from v_room."host_user_id"' in
  pg_get_functiondef('public.record_live_watch_party_money_obligation_completion(uuid,text)'::regprocedure))>0,
  '51. current seat approval and completion remain bound to persisted room authority');

select * from finish();
rollback;
