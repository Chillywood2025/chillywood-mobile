begin;

create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(9);

select has_table(
  'public','revenuecat_provider_reconciliation_obligations',
  'ignored active Store charges have a durable reconciliation queue'
);

select ok(
  (select class.relrowsecurity and class.relforcerowsecurity
   from pg_catalog.pg_class class
   where class.oid='public.revenuecat_provider_reconciliation_obligations'::regclass)
  and not has_table_privilege(
    'anon','public.revenuecat_provider_reconciliation_obligations','SELECT'
  )
  and not has_table_privilege(
    'authenticated','public.revenuecat_provider_reconciliation_obligations','SELECT'
  )
  and not has_table_privilege(
    'service_role','public.revenuecat_provider_reconciliation_obligations','INSERT,DELETE'
  )
  and has_table_privilege(
    'service_role','public.revenuecat_provider_reconciliation_obligations','SELECT'
  ),
  'the reconciliation queue is forced-RLS, service-readable, and not directly insertable'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid='public.provider_events'::regclass
      and trigger_row.tgname='capture_ignored_revenuecat_charge'
      and not trigger_row.tgisinternal
  )
  and pg_get_functiondef(
    'public.capture_ignored_revenuecat_charge_internal()'::regprocedure
  ) ilike '%security definer%set search_path to ''''%',
  'an empty-path trigger captures every finalized creator-money ignore'
);

select ok(
  pg_get_functiondef(
    'public.process_creator_money_provider_event_pre_source_lock(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)'::regprocedure
  ) ilike '%''provider_reconciliation_required'',v_is_active%'
  and pg_get_functiondef(
    'public.process_creator_money_provider_event_pre_source_lock(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)'::regprocedure
  ) ilike '%''purchase_intent_id'',v_intent."id"%',
  'every ignored active creator-money delivery records reconciliation and exact intent identity'
);

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  'fa000000-0000-4000-8000-000000000001',
  'authenticated','authenticated','ignored-charge@example.test','',now(),
  '{}','{}',now(),now(),false,false
);

insert into public.provider_events (
  provider_event_id,provider,user_id,app_user_id,environment,event_type,
  status,occurred_at,idempotency_key,raw_payload_hash,metadata
) values (
  'ignored-charge-captured','revenuecat_app_store',
  'fa000000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000001','sandbox','INITIAL_PURCHASE',
  'received',now(),'creator_money:ignored-charge-captured',repeat('a',64),
  jsonb_build_object(
    'provider_product_id','com.chillywood.paidvideo.tier1',
    'original_transaction_id','ignored-charge-original',
    'reported_amount_minor',99,'reported_currency','usd'
  )
);
update public.provider_events
set status='ignored',metadata=metadata||jsonb_build_object(
  'final_reason','purchase_intent_session_authority_not_current',
  'provider_reconciliation_required',true,
  'provider_reconciliation_disposition',
    'refund_or_authoritative_provider_reconciliation_required'
)
where provider_event_id='ignored-charge-captured';

select ok(
  exists (
    select 1
    from public.revenuecat_provider_reconciliation_obligations obligation
    join public.provider_events event
      on event.id=obligation.provider_event_id
    where event.provider_event_id='ignored-charge-captured'
      and obligation.user_id='fa000000-0000-4000-8000-000000000001'
      and obligation.state='pending_reconciliation'
      and obligation.reported_amount_minor=99
      and obligation.reported_currency='usd'
      and obligation.reason='purchase_intent_session_authority_not_current'
  ),
  'a denied active provider result creates one exact pending obligation'
);

insert into public.provider_events (
  provider_event_id,provider,user_id,app_user_id,environment,event_type,
  status,occurred_at,idempotency_key,raw_payload_hash,metadata
) values (
  'ignored-charge-untracked','revenuecat_google_play',
  'fa000000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000001','sandbox','NON_RENEWING_PURCHASE',
  'received',now(),'creator_money:ignored-charge-untracked',repeat('b',64),
  jsonb_build_object(
    'provider_product_id','chillywood_paid_video_99',
    'original_transaction_id','ignored-charge-untracked-original'
  )
);
select throws_ok(
  $$update public.provider_events
    set status='ignored',metadata=metadata||jsonb_build_object(
      'final_reason','paid_video_source_not_available'
    )
    where provider_event_id='ignored-charge-untracked'$$,
  'P0001','ignored_active_provider_event_requires_reconciliation',
  'an active creator-money provider result cannot finalize ignored without an obligation'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok(
  $$select count(*) from public.revenuecat_provider_reconciliation_obligations$$,
  '42501','permission denied for table revenuecat_provider_reconciliation_obligations',
  'a direct authenticated Data API caller cannot inspect reconciliation evidence'
);
reset role;
select set_config('request.jwt.claims','{}',true);

select throws_ok(
  $$update public.revenuecat_provider_reconciliation_obligations
    set state='resolved_refund',resolved_at=now()
    where provider_event_id=(select id from public.provider_events
      where provider_event_id='ignored-charge-captured')$$,
  '23514',null,
  'an obligation cannot be resolved without immutable provider evidence'
);

update public.revenuecat_provider_reconciliation_obligations
set state='resolved_refund',resolved_at=now(),
  resolution_reference_hash=repeat('c',64),updated_at=now()
where provider_event_id=(select id from public.provider_events
  where provider_event_id='ignored-charge-captured');
select is(
  (select state from public.revenuecat_provider_reconciliation_obligations
   where provider_event_id=(select id from public.provider_events
     where provider_event_id='ignored-charge-captured')),
  'resolved_refund',
  'a refund resolution requires a SHA-256-shaped provider evidence reference'
);

select * from finish();
rollback;
