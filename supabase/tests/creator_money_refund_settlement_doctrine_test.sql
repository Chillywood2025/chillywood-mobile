begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(39);

select has_table('public','creator_money_settlement_policies','server-owned settlement policy exists');
select has_table('public','creator_money_obligation_completion_receipts','obligation completion receipts exist');
select columns_are(
  'public','creator_money_settlement_policies',
  array['source_type','normal_hold','requires_obligation_completion','post_completion_hold',
    'reserve_basis_points','reserve_duration','policy_version','created_at'],
  'settlement policy has only bounded server-owned timing fields'
);
select is((select normal_hold from public.creator_money_settlement_policies where source_type='tip'),interval '7 days','tips use seven-day hold');
select is((select normal_hold from public.creator_money_settlement_policies where source_type='paid_content'),interval '7 days','Paid Video uses seven-day hold');
select is((select normal_hold from public.creator_money_settlement_policies where source_type='channel_subscription'),interval '7 days','each Channel Subscription transaction uses seven-day hold');
select is((select display_name from public.money_refund_policy_rules where policy_key='channel_subscription'),'Platform Subscription','backed user-facing policy name is Platform Subscription');
select is(
  (select column_default from information_schema.columns
    where table_schema='public' and table_name='creator_channel_subscription_offers' and column_name='title'),
  '''Platform subscription''::text','new Platform Subscription offers use the reconciled user-facing default'
);
select is((select normal_hold from public.creator_money_settlement_policies where source_type='vip_pass'),interval '7 days','VIP earnings use seven-day hold independent of access term');
select is((select post_completion_hold from public.creator_money_settlement_policies where source_type='watch_party_ticket'),interval '48 hours','Watch-Party uses completion plus 48 hours');
select is((select post_completion_hold from public.creator_money_settlement_policies where source_type='event_pass'),interval '48 hours','Event Pass uses completion plus 48 hours');
select ok((select bool_and(reserve_basis_points=1000 and reserve_duration=interval '30 days') from public.creator_money_settlement_policies),'all creator flows use 10 percent thirty-day reserve');

select ok(
  not has_table_privilege('authenticated','public.money_refund_policy_rules','INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.money_credit_ledger_entries','INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.creator_obligation_review_records','INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.creator_payout_hold_records','INSERT,UPDATE,DELETE'),
  'authenticated clients cannot mutate policy, credits, obligations, or payout holds'
);
select ok(
  not has_table_privilege('service_role','public.creator_money_obligation_completion_receipts','INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.creator_money_obligation_completion_receipts','SELECT,INSERT,UPDATE,DELETE'),
  'completion evidence cannot be forged through direct API table access'
);
select ok(
  has_function_privilege('service_role','public.record_creator_money_obligation_completion(uuid,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.record_creator_money_obligation_completion(uuid,text,text)','EXECUTE'),
  'only service authority may record canonical completion'
);
select throws_ok(
  $$select public.finalize_creator_money_settlement_provider_closeout_internal(
    '00000000-0000-4000-8000-000000000001',1,0,repeat('a',64),8)$$,
  'P0001','caller_hold_days_not_allowed','caller-selected settlement hold is rejected first'
);

select is(
  (public.resolve_money_refund_policy('premium_subscription','not_started','not_applicable',false,false)->>'standardRefundReviewEligible')::boolean,
  false,'Premium has no standard Chi''llywood refund path'
);
select ok(
  (public.resolve_money_refund_policy('premium_subscription','consumed','not_applicable',false,true)->>'authoritativeReversalRequired')::boolean
  and not (public.resolve_money_refund_policy('premium_subscription','consumed','not_applicable',false,true)->>'standardRefundReviewEligible')::boolean,
  'Premium provider reversal is required without becoming a standard refund'
);
select ok(
  not (public.resolve_money_refund_policy('creator_tip','not_started','not_applicable',false,false)->>'standardRefundReviewEligible')::boolean
  and (public.resolve_money_refund_policy('creator_tip','consumed','not_applicable',false,true)->>'authoritativeReversalRequired')::boolean,
  'tips are final through Chi''llywood while authoritative reversals remain recognized'
);
select ok(
  not (public.resolve_creator_payout_hold_policy('paid_creator_video','met',true,true,true,true)->>'canReleasePayoutNow')::boolean
  and public.resolve_creator_payout_hold_policy('paid_creator_video','met',true,true,true,true)->'reasonCodes'
    @> '["client_flags_cannot_release_payout"]'::jsonb,
  'caller flags cannot release payout'
);

insert into public.creator_earnings_ledger(
  id,creator_id,source_type,source_id,gross_amount_cents,net_creator_amount_cents,currency,
  ledger_status,settlement_started_at,normal_eligible_at,reserve_amount_cents,reserve_release_at,
  settlement_policy_version,metadata
) values (
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  'paid_content','30000000-0000-4000-8000-000000000001',100,100,'usd','available',
  timezone('utc'::text,now())-interval '8 days',timezone('utc'::text,now())-interval '1 day',
  10,timezone('utc'::text,now())+interval '29 days','2026-08-31-v1','{}'
);
select is(public.creator_earnings_withdrawable_cents_internal(
  '10000000-0000-4000-8000-000000000001',timezone('utc'::text,now())),90,
  'only ninety percent is withdrawable during reserve'
);
select is(public.creator_earnings_withdrawable_cents_internal(
  '10000000-0000-4000-8000-000000000001',timezone('utc'::text,now())+interval '31 days'),100,
  'unreversed reserve releases server-side after thirty days'
);
select is(public.creator_earnings_withdrawable_cents_internal(
  '10000000-0000-4000-8000-000000000001',timezone('utc'::text,now())-interval '2 days'),0,
  'ordinary earnings are unavailable before normal hold expiry'
);
select ok(
  pg_get_functiondef('public.create_creator_payout_request_safe(integer,text)'::regprocedure)
    like '%creator_earnings_withdrawable_cents_internal%(earnings."id",v_now)%',
  'payout request sizing and allocation consume the reserve-aware server amount'
);

insert into public.creator_payout_requests(
  id,creator_id,amount_cents,currency,payout_type,instant_fee_cents,status
) values (
  '40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',90,'usd','scheduled',0,'requested'
);
insert into public.creator_payout_allocations(
  payout_request_id,earnings_ledger_id,amount_cents,state
) values (
  '40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',90,'reserved'
);
select pass('allocation of only the non-reserved ninety percent succeeds');
select throws_ok(
  $$insert into public.creator_payout_allocations(
    payout_request_id,earnings_ledger_id,amount_cents,state
  ) values (
    '40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'reserved'
  )$$,
  'P0001','payout_allocation_exceeds_available_after_reserve',
  'reserved money cannot be allocated to payout'
);

insert into public.creator_earnings_ledger(
  id,creator_id,source_type,source_id,gross_amount_cents,net_creator_amount_cents,currency,
  ledger_status,settlement_started_at,reserve_amount_cents,settlement_policy_version,metadata
) values
  ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',
    'event_pass','30000000-0000-4000-8000-000000000002',1000,1000,'usd','available',
    timezone('utc'::text,now())-interval '10 days',100,'2026-08-31-v1','{}'),
  ('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001',
    'event_pass','30000000-0000-4000-8000-000000000003',1000,1000,'usd','available',
    timezone('utc'::text,now())-interval '10 days',100,'2026-08-31-v1','{}');
insert into public.creator_money_obligation_completion_receipts(
  id,earnings_ledger_id,creator_id,source_type,source_id,completed_at,evidence_source,evidence_hash
) values
  ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001','event_pass','30000000-0000-4000-8000-000000000002',
    timezone('utc'::text,now())-interval '47 hours','canonical_event_lifecycle',repeat('b',64)),
  ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001','event_pass','30000000-0000-4000-8000-000000000003',
    timezone('utc'::text,now())-interval '49 hours','canonical_event_lifecycle',repeat('b',64));
select pass('one canonical lifecycle evidence hash may back each exact buyer earning without cross-buyer uniqueness failure');
select is(public.creator_earnings_withdrawable_cents_internal(
  '10000000-0000-4000-8000-000000000002',timezone('utc'::text,now())),0,
  'Event Pass remains unavailable before completion plus 48 hours'
);
select is(public.creator_earnings_withdrawable_cents_internal(
  '10000000-0000-4000-8000-000000000003',timezone('utc'::text,now())),900,
  'a completed advance obligation becomes ninety-percent available after completion plus 48 hours'
);
select is(public.creator_earnings_withdrawable_cents_internal(
  '10000000-0000-4000-8000-000000000003',timezone('utc'::text,now())+interval '31 days'),1000,
  'the advance-obligation reserve releases only after its additional thirty-day period'
);
select throws_ok(
  $$update public.creator_money_obligation_completion_receipts
    set completed_at=timezone('utc'::text,now())
    where id='50000000-0000-4000-8000-000000000001'$$,
  'P0001','creator_money_obligation_completion_receipt_is_immutable',
  'canonical completion time cannot be rewritten'
);

-- Copy-only regression through the real public RPC. Paused offers are the
-- existing non-exposing save path; no purchase, active sale or entitlement is
-- created. Synthetic sandbox configuration and rows roll back with this test.
select is(
  pg_get_function_arguments('public.set_creator_channel_subscription_offer(text,text,text)'::regprocedure),
  'p_title text DEFAULT ''Platform subscription''::text, p_description text DEFAULT NULL::text, p_status text DEFAULT ''sandbox''::text',
  'omitted public offer title uses the established Platform name'
);
select is(
  pg_get_function_arguments('public.set_creator_channel_subscription_offer_pre_integrity_closeout(text,text,text)'::regprocedure),
  'p_title text DEFAULT ''Platform subscription''::text, p_description text DEFAULT NULL::text, p_status text DEFAULT ''sandbox''::text',
  'hidden predecessor retains compatible Platform defaults'
);
select ok(
  has_function_privilege('authenticated','public.set_creator_channel_subscription_offer(text,text,text)','EXECUTE')
  and has_function_privilege('service_role','public.set_creator_channel_subscription_offer(text,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.set_creator_channel_subscription_offer(text,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.set_creator_channel_subscription_offer_pre_integrity_closeout(text,text,text)','EXECUTE')
  and not has_function_privilege('service_role','public.set_creator_channel_subscription_offer_pre_integrity_closeout(text,text,text)','EXECUTE'),
  'copy correction preserves the public wrapper and inaccessible predecessor'
);
insert into auth.users(id,is_sso_user,is_anonymous)
values ('d4310000-0000-4000-8000-000000000001',false,false);
insert into auth.sessions(id,user_id)
values ('d4310000-0000-4000-8000-000000000002','d4310000-0000-4000-8000-000000000001');
update public.platform_money_kill_switches set state='sandbox_only'
where key in ('digital_sales_enabled','revenuecat_google_play_enabled');
update public.monetization_products
set provider='revenuecat_google_play',environment='sandbox',status='sandbox',
  provider_product_id='platform_copy_test_product'
where product_key='channel_subscription_sandbox_monthly_499' and product_type='channel_subscription';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"d4310000-0000-4000-8000-000000000001","session_id":"d4310000-0000-4000-8000-000000000002"}',true);
select is(public.set_creator_channel_subscription_offer(p_status=>'paused')->>'title',
  'Platform subscription','actual paused public save with omitted title uses Platform');
select is(public.set_creator_channel_subscription_offer(p_title=>'   ',p_status=>'paused')->>'title',
  'Platform subscription','actual paused public save normalizes a blank title to Platform');
select is(public.set_creator_channel_subscription_offer(p_title=>null,p_status=>'paused')->>'title',
  'Platform subscription','actual paused public save normalizes a null title to Platform');
select is(public.set_creator_channel_subscription_offer(p_title=>'My Channel Notes',p_status=>'paused')->>'title',
  'My Channel Notes','explicit custom user title is preserved without a broad text replacement');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.set_creator_channel_subscription_offer(p_status=>'paused')$$,
  'P0001','auth_required','copy-only default does not remove authenticated ownership');
reset role;
select * from finish();
rollback;
