begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(66);

select ok(
  (select count(*) = 3
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'monetization_webhook_events'
     and column_name in (
       'processing_attempt_id',
       'processing_started_at',
       'processing_attempt_count'
     ))
  and exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.monetization_webhook_events'::regclass
      and constraint_row.conname = 'monetization_webhook_events_terminal_attempt_check'
  ),
  'Stripe tip webhook attempt-token lease columns and terminal-state guard exist'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'creator_tip_transactions'
      and column_name = 'refunded_amount_cents'
      and data_type = 'integer'
  )
  and exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.creator_tip_transactions'::regclass
      and constraint_row.conname = 'creator_tip_transactions_refunded_amount_check'
  )
  and not exists (
    select 1
    from public."creator_tip_transactions" tip_row
    where (tip_row."status" = 'refunded' or tip_row."payment_status" = 'refunded')
      and (
        tip_row."refunded_amount_cents" <> tip_row."total_paid_cents"
        or tip_row."creator_net_cents" <> 0
        or tip_row."payout_status" <> 'reversed'
      )
  ),
  'tip transactions persist cumulative refunds and historical full refunds have zero net'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.reserve_stripe_tip_webhook_event(text,text,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.finalize_stripe_tip_webhook_event(text,uuid,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.process_stripe_tip_webhook_lifecycle(text,uuid,uuid,jsonb,jsonb,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.reserve_stripe_tip_webhook_event(text,text,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.process_stripe_tip_webhook_lifecycle(text,uuid,uuid,jsonb,jsonb,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.enforce_stripe_tip_lifecycle_monotonic_internal()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.serialize_stripe_tip_buyer_authority_user_internal()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.serialize_stripe_tip_buyer_authority_global_internal()',
    'EXECUTE'
  )
  and exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.creator_tip_transactions'::regclass
      and trigger_row.tgname = 'enforce_stripe_tip_lifecycle_monotonic'
      and not trigger_row.tgisinternal
  )
  and (select count(*) = 6
       from pg_catalog.pg_trigger trigger_row
       where trigger_row.tgname like 'serialize_stripe_tip_buyer_authority_%'
         and not trigger_row.tgisinternal
  ),
  'Stripe tip webhook authority RPCs are service-only'
);

select ok(
  pg_get_functiondef(
    'public.reserve_stripe_tip_webhook_event(text,text,text,uuid)'::regprocedure
  ) ilike '%security definer%set search_path to ''''%'
  and pg_get_functiondef(
    'public.finalize_stripe_tip_webhook_event(text,uuid,text)'::regprocedure
  ) ilike '%security definer%set search_path to ''''%'
  and pg_get_functiondef(
    'public.process_stripe_tip_webhook_lifecycle(text,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure
  ) ilike '%security definer%set search_path to ''''%'
  and pg_get_functiondef(
    'public.enforce_stripe_tip_lifecycle_monotonic_internal()'::regprocedure
  ) ilike '%security definer%set search_path to ''''%'
  and pg_get_functiondef(
    'public.serialize_stripe_tip_buyer_authority_user_internal()'::regprocedure
  ) ilike '%security definer%set search_path to ''''%'
  and pg_get_functiondef(
    'public.serialize_stripe_tip_buyer_authority_global_internal()'::regprocedure
  ) ilike '%security definer%set search_path to ''''%',
  'Stripe tip webhook authority RPCs use an empty search path'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_tip_retry', 'checkout.session.completed', repeat('a', 64),
    '10000000-0000-4000-8000-000000000001'
  )->>'disposition',
  'claimed',
  'a new Stripe tip event is claimed'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_tip_retry', 'checkout.session.completed', repeat('a', 64),
    '10000000-0000-4000-8000-000000000002'
  )->>'disposition',
  'in_progress',
  'a concurrent delivery cannot take an active claim'
);

select is(
  public.finalize_stripe_tip_webhook_event(
    'evt_tip_retry', '10000000-0000-4000-8000-000000000001', 'failed'
  )->>'status',
  'failed',
  'the current attempt can mark its delivery failed'
);

with retry_claim as materialized (
  select public.reserve_stripe_tip_webhook_event(
    'evt_tip_retry', 'checkout.session.completed', repeat('a', 64),
    '10000000-0000-4000-8000-000000000003'
  ) as value
)
select ok(
  (value->>'claimAcquired')::boolean
  and (value->>'retry')::boolean
  and value->>'processingAttemptId' = '10000000-0000-4000-8000-000000000003',
  'a failed delivery is reclaimed by one fresh attempt token'
)
from retry_claim;

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_tip_retry', 'checkout.session.completed', repeat('a', 64),
    '10000000-0000-4000-8000-000000000004'
  )->>'disposition',
  'in_progress',
  'a second retry cannot process beside the reclaimed attempt'
);

select throws_ok(
  $$select public.finalize_stripe_tip_webhook_event(
    'evt_tip_retry', '10000000-0000-4000-8000-000000000001', 'processed'
  )$$,
  'P0001',
  'stripe_tip_webhook_claim_not_current',
  'a stale attempt cannot finalize the reclaimed delivery'
);

select is(
  public.finalize_stripe_tip_webhook_event(
    'evt_tip_retry', '10000000-0000-4000-8000-000000000003', 'ignored'
  )->>'status',
  'ignored',
  'the current retry attempt can finalize the delivery'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_tip_retry', 'checkout.session.completed', repeat('a', 64),
    '10000000-0000-4000-8000-000000000005'
  )->>'disposition',
  'duplicate',
  'a finalized delivery is idempotent'
);

select is(
  (select "processing_attempt_count"
   from public."monetization_webhook_events"
   where "provider" = 'stripe_tip' and "event_id" = 'evt_tip_retry'),
  2,
  'only the original and successful retry claims increment the attempt count'
);

select throws_ok(
  $$select public.reserve_stripe_tip_webhook_event(
    'evt_tip_retry', 'checkout.session.completed', repeat('b', 64),
    '10000000-0000-4000-8000-000000000006'
  )$$,
  'P0001',
  'stripe_tip_webhook_event_identity_mismatch',
  'a provider event ID cannot be rebound to another signed payload'
);

insert into public."monetization_webhook_events" (
  "provider", "event_id", "event_type", "idempotency_key", "raw_event_hash", "status"
) values (
  'stripe_tip', 'evt_tip_legacy_active', 'checkout.session.completed',
  'evt_tip_legacy_active', repeat('f', 64), 'received'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_tip_legacy_active', 'checkout.session.completed', repeat('f', 64),
    '10000000-0000-4000-8000-000000000007'
  )->>'disposition',
  'in_progress',
  'a recent legacy claim is not processed concurrently during rollout'
);

update public."monetization_webhook_events"
set "created_at" = timezone('utc'::text, now()) - interval '10 minutes'
where "provider" = 'stripe_tip' and "event_id" = 'evt_tip_legacy_active';

select ok(
  (public.reserve_stripe_tip_webhook_event(
    'evt_tip_legacy_active', 'checkout.session.completed', repeat('f', 64),
    '10000000-0000-4000-8000-000000000008'
  )->>'retry')::boolean,
  'an abandoned legacy claim becomes safely retryable after the lease window'
);

select throws_ok(
  $$update public."monetization_webhook_events"
    set "status" = 'processed', "processed_at" = timezone('utc'::text, now())
    where "provider" = 'stripe_tip' and "event_id" = 'evt_tip_legacy_active'$$,
  '23514',
  'new row for relation "monetization_webhook_events" violates check constraint "monetization_webhook_events_terminal_attempt_check"',
  'a stale legacy worker cannot finalize over a reclaimed active attempt'
);

select is(
  public.finalize_stripe_tip_webhook_event(
    'evt_tip_legacy_active', '10000000-0000-4000-8000-000000000008', 'ignored'
  )->>'status',
  'ignored',
  'the reclaimed legacy delivery is owned by its fresh attempt token'
);

set local session_replication_role = replica;
insert into public."creator_tip_transactions" (
  "id", "sender_id", "creator_id", "tip_amount_cents", "service_fee_cents",
  "provider_fee_cents", "total_paid_cents", "currency", "provider",
  "payment_status", "payout_status", "status", "provider_environment",
  "provider_checkout_session_id", "provider_payment_intent_id",
  "creator_net_cents", "refunded_amount_cents", "metadata", "buyer_account_id",
  "buyer_session_generation"
) values
  (
    '20000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000001',
    500, 0, 0, 500, 'usd', 'stripe_connect', 'refunded', 'reversed',
    'refunded', 'test', 'cs_atomic_refunded', 'pi_atomic_refunded', 0, 500,
    '{"compensation_required":false}'::jsonb, null, null
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000002',
    '22000000-0000-4000-8000-000000000002',
    600, 0, 0, 600, 'usd', 'stripe_connect', 'canceled', 'not_payable',
    'canceled', 'test', 'cs_atomic_canceled', 'pi_atomic_canceled', 0, 0,
    '{"compensation_required":false}'::jsonb, null, null
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '21000000-0000-4000-8000-000000000003',
    '22000000-0000-4000-8000-000000000003',
    700, 0, 0, 700, 'usd', 'stripe_connect', 'succeeded', 'not_payable',
    'paid', 'test', 'cs_atomic_paid', 'pi_atomic_paid', 700, 0,
    '{"compensation_required":false}'::jsonb, null, null
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    '21000000-0000-4000-8000-000000000004',
    '22000000-0000-4000-8000-000000000004',
    800, 0, 0, 800, 'usd', 'manual', 'failed', 'not_payable',
    'failed', 'test', 'cs_atomic_manual', 'pi_atomic_manual', 0, 0,
    '{"compensation_required":false}'::jsonb, null, null
  ),
  (
    '20000000-0000-4000-8000-000000000005',
    '21000000-0000-4000-8000-000000000005',
    '22000000-0000-4000-8000-000000000005',
    900, 0, 0, 900, 'usd', 'stripe_connect', 'failed', 'not_payable',
    'failed', 'live', 'cs_atomic_live', 'pi_atomic_live', 0, 0,
    '{"compensation_required":false}'::jsonb, null, null
  ),
  (
    '20000000-0000-4000-8000-000000000006',
    '21000000-0000-4000-8000-000000000006',
    '22000000-0000-4000-8000-000000000006',
    1000, 0, 0, 1000, 'usd', 'stripe_connect', 'failed', 'not_payable',
    'failed', 'test', 'cs_atomic_stale_buyer', 'pi_atomic_stale_buyer', 0, 0,
    '{"compensation_required":false}'::jsonb,
    '21000000-0000-4000-8000-000000000006',
    '23000000-0000-4000-8000-000000000006'
  ),
  (
    '20000000-0000-4000-8000-000000000007',
    '21000000-0000-4000-8000-000000000007',
    '22000000-0000-4000-8000-000000000007',
    1000, 0, 0, 1000, 'usd', 'stripe_connect', 'succeeded', 'not_payable',
    'paid', 'test', 'cs_atomic_partial', 'pi_atomic_partial', 1000, 0,
    '{"compensation_required":false}'::jsonb, null, null
  );
set local session_replication_role = origin;

insert into public."monetization_webhook_events" (
  "provider", "event_id", "event_type", "idempotency_key", "raw_event_hash",
  "status", "created_at"
) values (
  'stripe_tip', 'evt_tip_legacy_expired', 'checkout.session.completed',
  'evt_tip_legacy_expired', repeat('8', 64), 'received',
  timezone('utc'::text, now()) - interval '10 minutes'
);

select throws_ok(
  $$update public."creator_tip_transactions" tip_row
    set "status" = 'paid',
        "payment_status" = 'succeeded',
        "payout_status" = 'not_payable',
        "creator_net_cents" = 600,
        "metadata" = tip_row."metadata" || jsonb_build_object(
          'provider_event_id', 'evt_tip_legacy_expired',
          'provider_event_type', 'checkout.session.completed',
          'updated_by', 'stripe-tip-webhook'
        )
    where tip_row."id" = '20000000-0000-4000-8000-000000000002'$$,
  'P0001',
  'stripe_tip_webhook_projector_claim_required',
  'an expired unleased legacy worker is fenced before a fresh attempt can reclaim it'
);

insert into public."monetization_webhook_events" (
  "provider", "event_id", "event_type", "idempotency_key", "raw_event_hash", "status"
) values (
  'stripe_tip', 'evt_tip_legacy_drain', 'checkout.session.completed',
  'evt_tip_legacy_drain', repeat('9', 64), 'received'
);

select lives_ok(
  $$update public."creator_tip_transactions" tip_row
    set "status" = 'paid',
        "payment_status" = 'succeeded',
        "payout_status" = 'not_payable',
        "creator_net_cents" = 500,
        "metadata" = tip_row."metadata" || jsonb_build_object(
          'provider_event_id', 'evt_tip_legacy_drain',
          'provider_event_type', 'checkout.session.completed',
          'updated_by', 'stripe-tip-webhook'
        )
    where tip_row."id" = '20000000-0000-4000-8000-000000000001'$$,
  'an already-running legacy worker can drain only its active unleased claim'
);

with legacy_finalize as materialized (
  update public."monetization_webhook_events"
  set "status" = 'processed', "processed_at" = timezone('utc'::text, now())
  where "provider" = 'stripe_tip' and "event_id" = 'evt_tip_legacy_drain'
  returning "status"
)
select ok(
  (select "status" = 'processed' from legacy_finalize)
  and (select "status" = 'refunded'
          and "payment_status" = 'refunded'
          and "payout_status" = 'reversed'
       from public."creator_tip_transactions"
       where "id" = '20000000-0000-4000-8000-000000000001'),
  'legacy drain finalizes without resurrecting the terminal tip'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_completion_wrong_provider', 'checkout.session.completed', repeat('6', 64),
    '30000000-0000-4000-8000-000000000005'
  )->>'disposition',
  'claimed',
  'a completion linked to a non-Stripe tip is claimed for fail-closed projection'
);

select is(
  public.process_stripe_tip_webhook_lifecycle(
    'evt_completion_wrong_provider',
    '30000000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000004',
    jsonb_build_object(
      'object_id', 'cs_atomic_manual',
      'payment_intent_id', 'pi_atomic_manual',
      'amount_cents', 800,
      'currency', 'usd',
      'metadata_tip_id', '20000000-0000-4000-8000-000000000004',
      'metadata_sender_id', '21000000-0000-4000-8000-000000000004',
      'metadata_creator_id', '22000000-0000-4000-8000-000000000004'
    ),
    jsonb_build_object('metadata', '{}'::jsonb),
    '{}'::jsonb
  )->>'reason',
  'tip_provider_lifecycle_identity_mismatch',
  'exact-looking facts cannot bind a Stripe event to a non-Stripe tip'
);

select ok(
  (select "status" = 'failed'
   from public."creator_tip_transactions"
   where "id" = '20000000-0000-4000-8000-000000000004')
  and (select "status" = 'ignored'
       from public."monetization_webhook_events"
       where "provider" = 'stripe_tip' and "event_id" = 'evt_completion_wrong_provider'),
  'the non-Stripe tip remains unchanged and its delivery is ignored'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_completion_live_tip', 'checkout.session.completed', repeat('7', 64),
    '30000000-0000-4000-8000-000000000006'
  )->>'disposition',
  'claimed',
  'a test delivery linked to a live-environment tip is claimed for fail-closed projection'
);

select is(
  public.process_stripe_tip_webhook_lifecycle(
    'evt_completion_live_tip',
    '30000000-0000-4000-8000-000000000006',
    '20000000-0000-4000-8000-000000000005',
    jsonb_build_object(
      'object_id', 'cs_atomic_live',
      'payment_intent_id', 'pi_atomic_live',
      'amount_cents', 900,
      'currency', 'usd',
      'metadata_tip_id', '20000000-0000-4000-8000-000000000005',
      'metadata_sender_id', '21000000-0000-4000-8000-000000000005',
      'metadata_creator_id', '22000000-0000-4000-8000-000000000005'
    ),
    jsonb_build_object('metadata', '{}'::jsonb),
    '{}'::jsonb
  )->>'reason',
  'tip_provider_lifecycle_identity_mismatch',
  'test-mode projection cannot mutate a live-environment tip'
);

select ok(
  (select "status" = 'failed'
   from public."creator_tip_transactions"
   where "id" = '20000000-0000-4000-8000-000000000005')
  and (select "status" = 'ignored'
       from public."monetization_webhook_events"
       where "provider" = 'stripe_tip' and "event_id" = 'evt_completion_live_tip'),
  'the live-environment tip remains unchanged and its delivery is ignored'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_completion_stale_buyer', 'checkout.session.completed', repeat('8', 64),
    '30000000-0000-4000-8000-000000000007'
  )->>'disposition',
  'claimed',
  'a captured completion with stale buyer authority is claimed'
);

select is(
  public.process_stripe_tip_webhook_lifecycle(
    'evt_completion_stale_buyer',
    '30000000-0000-4000-8000-000000000007',
    '20000000-0000-4000-8000-000000000006',
    jsonb_build_object(
      'object_id', 'cs_atomic_stale_buyer',
      'payment_intent_id', 'pi_atomic_stale_buyer',
      'amount_cents', 1000,
      'currency', 'usd',
      'metadata_tip_id', '20000000-0000-4000-8000-000000000006',
      'metadata_sender_id', '21000000-0000-4000-8000-000000000006',
      'metadata_creator_id', '22000000-0000-4000-8000-000000000006'
    ),
    jsonb_build_object(
      'creator_net_cents', 1000,
      'metadata', jsonb_build_object(
        'buyer_authority_valid_at_completion', true,
        'compensation_required', false
      )
    ),
    jsonb_build_object('buyer_authority_valid_at_completion', true)
  )->>'reason',
  'tip_payment_recorded_compensation_required',
  'locked projector ignores stale Edge authority and records compensation'
);

select ok(
  (select "status" = 'paid'
      and "payment_status" = 'succeeded'
      and "payout_status" = 'not_payable'
      and "creator_net_cents" = 0
      and ("metadata"->>'buyer_authority_valid_at_completion')::boolean is false
      and ("metadata"->>'compensation_required')::boolean is true
   from public."creator_tip_transactions"
   where "id" = '20000000-0000-4000-8000-000000000006')
  and (select "status" = 'processed'
       from public."monetization_webhook_events"
       where "provider" = 'stripe_tip' and "event_id" = 'evt_completion_stale_buyer'),
  'stale buyer authority can record provider settlement but never creator net'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_completion_missing_facts', 'checkout.session.completed', repeat('b', 64),
    '30000000-0000-4000-8000-000000000004'
  )->>'disposition',
  'claimed',
  'completion with missing facts is claimed for fail-closed projection'
);

select is(
  public.process_stripe_tip_webhook_lifecycle(
    'evt_completion_missing_facts',
    '30000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'object_id', 'cs_atomic_refunded',
      'payment_intent_id', 'pi_atomic_refunded'
    ),
    jsonb_build_object(
      'creator_net_cents', 500,
      'metadata', jsonb_build_object('compensation_required', false)
    ),
    '{}'::jsonb
  )->>'reason',
  'tip_provider_lifecycle_identity_mismatch',
  'NULL-producing missing provider facts fail closed as an identity mismatch'
);

select ok(
  (select "status" = 'refunded'
   from public."creator_tip_transactions"
   where "id" = '20000000-0000-4000-8000-000000000001')
  and (select "status" = 'ignored'
       from public."monetization_webhook_events"
       where "provider" = 'stripe_tip' and "event_id" = 'evt_completion_missing_facts')
  and exists (
    select 1 from public."creator_tip_events"
    where "provider_event_id" = 'evt_completion_missing_facts'
      and "event_type" = 'webhook_ignored'
  ),
  'malformed identity, ignored audit, and claim finalization commit atomically'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_completion_after_refund', 'checkout.session.completed', repeat('c', 64),
    '30000000-0000-4000-8000-000000000001'
  )->>'disposition',
  'claimed',
  'completion-after-refund delivery is claimed'
);

select is(
  public.process_stripe_tip_webhook_lifecycle(
    'evt_completion_after_refund',
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'object_id', 'cs_atomic_refunded',
      'payment_intent_id', 'pi_atomic_refunded',
      'amount_cents', 500,
      'currency', 'usd',
      'metadata_tip_id', '20000000-0000-4000-8000-000000000001',
      'metadata_sender_id', '21000000-0000-4000-8000-000000000001',
      'metadata_creator_id', '22000000-0000-4000-8000-000000000001'
    ),
    jsonb_build_object(
      'creator_net_cents', 500,
      'metadata', jsonb_build_object(
        'buyer_authority_valid_at_completion', true,
        'compensation_required', false,
        'provider_completion_exact', true
      )
    ),
    jsonb_build_object('buyer_authority_valid_at_completion', true)
  )->>'reason',
  'tip_terminal_state_preserved',
  'completion cannot resurrect a refunded tip'
);

select ok(
  (select "status" = 'refunded'
      and "payment_status" = 'refunded'
      and "payout_status" = 'reversed'
   from public."creator_tip_transactions"
   where "id" = '20000000-0000-4000-8000-000000000001')
  and (select "status" = 'processed'
       from public."monetization_webhook_events"
       where "provider" = 'stripe_tip' and "event_id" = 'evt_completion_after_refund')
  and exists (
    select 1 from public."creator_tip_events"
    where "provider_event_id" = 'evt_completion_after_refund'
      and "event_type" = 'checkout_completed'
      and ("metadata"->>'lifecycle_transition_applied')::boolean is false
  ),
  'refunded state, audit event, and finalized claim commit consistently'
);

select throws_ok(
  $$update public."creator_tip_transactions" tip_row
    set "status" = 'paid',
        "payment_status" = 'succeeded',
        "payout_status" = 'not_payable',
        "creator_net_cents" = 500,
        "paid_at" = timezone('utc'::text, now()),
        "metadata" = tip_row."metadata" || jsonb_build_object(
          'provider_event_id', 'evt_completion_after_refund',
          'provider_event_type', 'checkout.session.completed',
          'updated_by', 'stripe-tip-webhook'
        )
    where tip_row."id" = '20000000-0000-4000-8000-000000000001'$$,
  'P0001',
  'stripe_tip_webhook_projector_claim_required',
  'a stale legacy worker cannot replay the same event after its new claim finalized'
);

select ok(
  (select "status" = 'refunded'
      and "payment_status" = 'refunded'
      and "payout_status" = 'reversed'
      and "metadata"->>'provider_event_id' = 'evt_completion_after_refund'
   from public."creator_tip_transactions"
   where "id" = '20000000-0000-4000-8000-000000000001'),
  'the rejected same-event legacy update leaves the terminal tip unchanged'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_completion_after_cancel', 'checkout.session.completed', repeat('d', 64),
    '30000000-0000-4000-8000-000000000002'
  )->>'disposition',
  'claimed',
  'completion-after-cancel delivery is claimed'
);

select is(
  public.process_stripe_tip_webhook_lifecycle(
    'evt_completion_after_cancel',
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'object_id', 'cs_atomic_canceled',
      'payment_intent_id', 'pi_atomic_canceled',
      'amount_cents', 600,
      'currency', 'usd',
      'metadata_tip_id', '20000000-0000-4000-8000-000000000002',
      'metadata_sender_id', '21000000-0000-4000-8000-000000000002',
      'metadata_creator_id', '22000000-0000-4000-8000-000000000002'
    ),
    jsonb_build_object(
      'creator_net_cents', 600,
      'metadata', jsonb_build_object(
        'buyer_authority_valid_at_completion', true,
        'compensation_required', false,
        'provider_completion_exact', true
      )
    ),
    jsonb_build_object('buyer_authority_valid_at_completion', true)
  )->>'reason',
  'tip_terminal_state_preserved',
  'completion cannot resurrect a canceled tip'
);

select ok(
  (select "status" = 'canceled'
      and "payment_status" = 'canceled'
      and "payout_status" = 'not_payable'
   from public."creator_tip_transactions"
   where "id" = '20000000-0000-4000-8000-000000000002'),
  'canceled lifecycle fields remain unchanged'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_failure_after_paid', 'payment_intent.payment_failed', repeat('e', 64),
    '30000000-0000-4000-8000-000000000003'
  )->>'disposition',
  'claimed',
  'out-of-order failure delivery is claimed'
);

select is(
  public.process_stripe_tip_webhook_lifecycle(
    'evt_failure_after_paid',
    '30000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000003',
    jsonb_build_object(
      'object_id', 'pi_atomic_paid',
      'payment_intent_id', 'pi_atomic_paid'
    ),
    jsonb_build_object(
      'metadata', jsonb_build_object('compensation_required', false)
    ),
    '{}'::jsonb
  )->>'reason',
  'tip_terminal_state_preserved',
  'an out-of-order provider failure cannot regress a paid tip'
);

select ok(
  (select "status" = 'paid'
      and "payment_status" = 'succeeded'
      and "creator_net_cents" = 700
   from public."creator_tip_transactions"
   where "id" = '20000000-0000-4000-8000-000000000003')
  and (select "status" = 'processed'
       from public."monetization_webhook_events"
       where "provider" = 'stripe_tip' and "event_id" = 'evt_failure_after_paid'),
  'paid state remains monotonic while the out-of-order event is finalized'
);

with refund_cases(event_id, attempt_id, provider_facts) as (
  values
    (
      'evt_refund_wrong_amount',
      '40000000-0000-4000-8000-000000000101'::uuid,
      jsonb_build_object(
        'object_id', 'ch_atomic_partial',
        'payment_intent_id', 'pi_atomic_partial',
        'amount_cents', 999,
        'currency', 'usd',
        'amount_refunded_cents', 250,
        'refunded', false
      )
    ),
    (
      'evt_refund_wrong_currency',
      '40000000-0000-4000-8000-000000000102'::uuid,
      jsonb_build_object(
        'object_id', 'ch_atomic_partial',
        'payment_intent_id', 'pi_atomic_partial',
        'amount_cents', 1000,
        'currency', 'eur',
        'amount_refunded_cents', 250,
        'refunded', false
      )
    ),
    (
      'evt_refund_wrong_payment_intent',
      '40000000-0000-4000-8000-000000000103'::uuid,
      jsonb_build_object(
        'object_id', 'ch_atomic_partial',
        'payment_intent_id', 'pi_wrong',
        'amount_cents', 1000,
        'currency', 'usd',
        'amount_refunded_cents', 250,
        'refunded', false
      )
    ),
    (
      'evt_refund_invalid_cumulative',
      '40000000-0000-4000-8000-000000000104'::uuid,
      jsonb_build_object(
        'object_id', 'ch_atomic_partial',
        'payment_intent_id', 'pi_atomic_partial',
        'amount_cents', 1000,
        'currency', 'usd',
        'amount_refunded_cents', 1001,
        'refunded', false
      )
    ),
    (
      'evt_refund_wrong_boolean',
      '40000000-0000-4000-8000-000000000105'::uuid,
      jsonb_build_object(
        'object_id', 'ch_atomic_partial',
        'payment_intent_id', 'pi_atomic_partial',
        'amount_cents', 1000,
        'currency', 'usd',
        'amount_refunded_cents', 250,
        'refunded', true
      )
    )
), claims as materialized (
  select refund_case.event_id,
         refund_case.attempt_id,
         refund_case.provider_facts,
         public.reserve_stripe_tip_webhook_event(
           refund_case.event_id,
           'charge.refunded',
           repeat('1', 64),
           refund_case.attempt_id
         ) as claim
  from refund_cases refund_case
), projections as materialized (
  select public.process_stripe_tip_webhook_lifecycle(
           claim.event_id,
           claim.attempt_id,
           '20000000-0000-4000-8000-000000000007',
           claim.provider_facts,
           jsonb_build_object('metadata', '{}'::jsonb),
           '{}'::jsonb
         ) as result
  from claims claim
  where claim.claim->>'disposition' = 'claimed'
)
select ok(
  (select count(*) = 5
     and bool_and(result->>'reason' = 'tip_provider_lifecycle_identity_mismatch')
   from projections),
  'refund projection rejects mismatched amount, currency, payment intent, cumulative amount, and refunded boolean'
);

select ok(
  (select "status" = 'paid'
      and "payment_status" = 'succeeded'
      and "creator_net_cents" = 1000
      and "refunded_amount_cents" = 0
   from public."creator_tip_transactions"
   where "id" = '20000000-0000-4000-8000-000000000007')
  and (select count(*) = 5
       from public."creator_tip_events"
       where "provider_event_id" like 'evt_refund_%'
         and "event_type" = 'webhook_ignored'),
  'invalid refund facts leave money state unchanged and finalize ignored audits'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_refund_partial_250', 'charge.refunded', repeat('2', 64),
    '40000000-0000-4000-8000-000000000201'
  )->>'disposition',
  'claimed',
  'the first cumulative partial refund is claimed'
);

select is(
  public.process_stripe_tip_webhook_lifecycle(
    'evt_refund_partial_250',
    '40000000-0000-4000-8000-000000000201',
    '20000000-0000-4000-8000-000000000007',
    jsonb_build_object(
      'object_id', 'ch_atomic_partial',
      'payment_intent_id', 'pi_atomic_partial',
      'amount_cents', 1000,
      'currency', 'usd',
      'amount_refunded_cents', 250,
      'refunded', false
    ),
    jsonb_build_object('metadata', '{}'::jsonb),
    '{}'::jsonb
  )->>'reason',
  'tip_partial_refund_recorded',
  'a partial refund is distinguished from a full refund'
);

select ok(
  (select "status" = 'paid'
      and "payment_status" = 'succeeded'
      and "payout_status" = 'not_payable'
      and "creator_net_cents" = 750
      and "refunded_amount_cents" = 250
      and "metadata"->>'refund_status' = 'partial'
   from public."creator_tip_transactions"
   where "id" = '20000000-0000-4000-8000-000000000007')
  and exists (
    select 1
    from public."creator_tip_events"
    where "provider_event_id" = 'evt_refund_partial_250'
      and ("metadata"->>'cumulative_refunded_amount_cents')::integer = 250
      and ("metadata"->>'refund_delta_cents')::integer = 250
  ),
  'the first partial refund reduces creator net by its exact cumulative delta'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_refund_partial_600', 'charge.refunded', repeat('3', 64),
    '40000000-0000-4000-8000-000000000202'
  )->>'disposition',
  'claimed',
  'a larger cumulative partial refund is claimed'
);

select is(
  public.process_stripe_tip_webhook_lifecycle(
    'evt_refund_partial_600',
    '40000000-0000-4000-8000-000000000202',
    '20000000-0000-4000-8000-000000000007',
    jsonb_build_object(
      'object_id', 'ch_atomic_partial',
      'payment_intent_id', 'pi_atomic_partial',
      'amount_cents', 1000,
      'currency', 'usd',
      'amount_refunded_cents', 600,
      'refunded', false
    ),
    jsonb_build_object('metadata', '{}'::jsonb),
    '{}'::jsonb
  )->>'reason',
  'tip_partial_refund_recorded',
  'a larger cumulative partial refund applies only its new delta'
);

select ok(
  (select "status" = 'paid'
      and "creator_net_cents" = 400
      and "refunded_amount_cents" = 600
   from public."creator_tip_transactions"
   where "id" = '20000000-0000-4000-8000-000000000007')
  and exists (
    select 1
    from public."creator_tip_events"
    where "provider_event_id" = 'evt_refund_partial_600'
      and ("metadata"->>'refund_delta_cents')::integer = 350
  ),
  'cumulative partial refunds adjust net by 250 then 350, not 250 then 600'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_refund_stale_300', 'charge.refunded', repeat('4', 64),
    '40000000-0000-4000-8000-000000000203'
  )->>'disposition',
  'claimed',
  'an out-of-order lower cumulative refund is claimed for monotonic projection'
);

select is(
  public.process_stripe_tip_webhook_lifecycle(
    'evt_refund_stale_300',
    '40000000-0000-4000-8000-000000000203',
    '20000000-0000-4000-8000-000000000007',
    jsonb_build_object(
      'object_id', 'ch_atomic_partial',
      'payment_intent_id', 'pi_atomic_partial',
      'amount_cents', 1000,
      'currency', 'usd',
      'amount_refunded_cents', 300,
      'refunded', false
    ),
    jsonb_build_object('metadata', '{}'::jsonb),
    '{}'::jsonb
  )->>'reason',
  'tip_refund_state_preserved',
  'a stale lower cumulative refund is explicitly suppressed'
);

select ok(
  (select "status" = 'paid'
      and "creator_net_cents" = 400
      and "refunded_amount_cents" = 600
   from public."creator_tip_transactions"
   where "id" = '20000000-0000-4000-8000-000000000007')
  and exists (
    select 1
    from public."creator_tip_events"
    where "provider_event_id" = 'evt_refund_stale_300'
      and ("metadata"->>'cumulative_refunded_amount_cents')::integer = 600
      and ("metadata"->>'refund_delta_cents')::integer = 0
      and ("metadata"->>'refund_amount_applied')::boolean is false
  ),
  'out-of-order refund delivery cannot reduce cumulative refunds or increase creator net'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_refund_full_1000', 'charge.refunded', repeat('5', 64),
    '40000000-0000-4000-8000-000000000204'
  )->>'disposition',
  'claimed',
  'the final cumulative full refund is claimed'
);

select is(
  public.process_stripe_tip_webhook_lifecycle(
    'evt_refund_full_1000',
    '40000000-0000-4000-8000-000000000204',
    '20000000-0000-4000-8000-000000000007',
    jsonb_build_object(
      'object_id', 'ch_atomic_partial',
      'payment_intent_id', 'pi_atomic_partial',
      'amount_cents', 1000,
      'currency', 'usd',
      'amount_refunded_cents', 1000,
      'refunded', true
    ),
    jsonb_build_object('metadata', '{}'::jsonb),
    '{}'::jsonb
  )->>'reason',
  'tip_full_refund_recorded',
  'the cumulative full refund is distinguished and recorded'
);

select ok(
  (select "status" = 'refunded'
      and "payment_status" = 'refunded'
      and "payout_status" = 'reversed'
      and "creator_net_cents" = 0
      and "refunded_amount_cents" = 1000
      and "metadata"->>'refund_status' = 'full'
   from public."creator_tip_transactions"
   where "id" = '20000000-0000-4000-8000-000000000007')
  and exists (
    select 1
    from public."creator_tip_events"
    where "provider_event_id" = 'evt_refund_full_1000'
      and ("metadata"->>'refund_delta_cents')::integer = 400
  ),
  'full refund reaches the terminal lifecycle with zero creator net'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_refund_after_full_750', 'charge.refunded', repeat('6', 64),
    '40000000-0000-4000-8000-000000000205'
  )->>'disposition',
  'claimed',
  'a stale partial refund delivered after full refund is claimed'
);

select is(
  public.process_stripe_tip_webhook_lifecycle(
    'evt_refund_after_full_750',
    '40000000-0000-4000-8000-000000000205',
    '20000000-0000-4000-8000-000000000007',
    jsonb_build_object(
      'object_id', 'ch_atomic_partial',
      'payment_intent_id', 'pi_atomic_partial',
      'amount_cents', 1000,
      'currency', 'usd',
      'amount_refunded_cents', 750,
      'refunded', false
    ),
    jsonb_build_object('metadata', '{}'::jsonb),
    '{}'::jsonb
  )->>'reason',
  'tip_refund_state_preserved',
  'a stale partial cannot supersede a full refund'
);

select ok(
  (select "status" = 'refunded'
      and "payment_status" = 'refunded'
      and "creator_net_cents" = 0
      and "refunded_amount_cents" = 1000
   from public."creator_tip_transactions"
   where "id" = '20000000-0000-4000-8000-000000000007')
  and exists (
    select 1
    from public."creator_tip_events"
    where "provider_event_id" = 'evt_refund_after_full_750'
      and ("metadata"->>'cumulative_refunded_amount_cents')::integer = 1000
      and ("metadata"->>'refund_delta_cents')::integer = 0
  ),
  'full-refund state remains terminal under stale partial delivery'
);

select is(
  public.reserve_stripe_tip_webhook_event(
    'evt_completion_after_full_refund', 'checkout.session.completed', repeat('7', 64),
    '40000000-0000-4000-8000-000000000206'
  )->>'disposition',
  'claimed',
  'an out-of-order completion after full refund is claimed'
);

select is(
  public.process_stripe_tip_webhook_lifecycle(
    'evt_completion_after_full_refund',
    '40000000-0000-4000-8000-000000000206',
    '20000000-0000-4000-8000-000000000007',
    jsonb_build_object(
      'object_id', 'cs_atomic_partial',
      'payment_intent_id', 'pi_atomic_partial',
      'amount_cents', 1000,
      'currency', 'usd',
      'metadata_tip_id', '20000000-0000-4000-8000-000000000007',
      'metadata_sender_id', '21000000-0000-4000-8000-000000000007',
      'metadata_creator_id', '22000000-0000-4000-8000-000000000007'
    ),
    jsonb_build_object('metadata', '{}'::jsonb),
    '{}'::jsonb
  )->>'reason',
  'tip_terminal_state_preserved',
  'completion cannot resurrect a fully refunded tip'
);

select ok(
  (select "status" = 'refunded'
      and "payment_status" = 'refunded'
      and "creator_net_cents" = 0
      and "refunded_amount_cents" = 1000
   from public."creator_tip_transactions"
   where "id" = '20000000-0000-4000-8000-000000000007'),
  'completion after full refund cannot restore status, cumulative amount, or creator net'
);

with duplicate_deliveries(attempt_id) as (
  values
    ('40000000-0000-4000-8000-000000000207'::uuid),
    ('40000000-0000-4000-8000-000000000208'::uuid),
    ('40000000-0000-4000-8000-000000000209'::uuid)
)
select ok(
  bool_and(
    public.reserve_stripe_tip_webhook_event(
      'evt_refund_full_1000',
      'charge.refunded',
      repeat('5', 64),
      duplicate_delivery.attempt_id
    )->>'disposition' = 'duplicate'
  ),
  'three additional deliveries of one finalized refund are all idempotent duplicates'
)
from duplicate_deliveries duplicate_delivery;

insert into public."creator_tip_events" (
  "tip_transaction_id", "actor_id", "event_type", "provider",
  "provider_environment", "provider_event_id", "metadata"
) values
  (null, null, 'webhook_duplicate', 'stripe_connect', 'test', 'evt_refund_full_1000', '{}'::jsonb),
  (null, null, 'webhook_duplicate', 'stripe_connect', 'test', 'evt_refund_full_1000', '{}'::jsonb),
  (null, null, 'webhook_duplicate', 'stripe_connect', 'test', 'evt_refund_full_1000', '{}'::jsonb),
  (null, null, 'webhook_duplicate', 'stripe_connect', 'test', 'evt_refund_full_1000', '{}'::jsonb)
on conflict ("provider", "provider_environment", "provider_event_id", "event_type")
  where "provider_event_id" is not null
  do nothing;

select is(
  (select count(*)
   from public."creator_tip_events"
   where "provider" = 'stripe_connect'
     and "provider_environment" = 'test'
     and "provider_event_id" = 'evt_refund_full_1000'
     and "event_type" = 'webhook_duplicate'),
  1::bigint,
  'four duplicate audit attempts persist exactly one audit row'
);

select * from finish();
rollback;
