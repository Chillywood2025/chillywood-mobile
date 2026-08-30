begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(14);

select has_table(
  'public', 'creator_money_provider_settlement_receipts',
  'immutable provider settlement receipts exist'
);
select has_table(
  'public', 'creator_payout_provider_result_receipts',
  'immutable provider payout result receipts exist'
);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.creator_money_provider_settlement_receipts'::regclass)
  and (select relrowsecurity from pg_catalog.pg_class where oid = 'public.creator_payout_provider_result_receipts'::regclass),
  'provider financial receipt tables use RLS'
);

select ok(
  not has_table_privilege('service_role', 'public.creator_money_provider_settlement_receipts', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.creator_money_provider_settlement_receipts', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.creator_money_provider_settlement_receipts', 'SELECT,INSERT,UPDATE,DELETE'),
  'ordinary API roles cannot forge or mutate settlement receipts'
);

select ok(
  not has_table_privilege('service_role', 'public.creator_payout_provider_result_receipts', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.creator_payout_provider_result_receipts', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.creator_payout_provider_result_receipts', 'SELECT,INSERT,UPDATE,DELETE'),
  'ordinary API roles cannot forge or mutate payout receipts'
);

select ok(
  has_function_privilege('service_role', 'public.finalize_creator_money_settlement(uuid,integer,integer,text,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.finalize_creator_money_settlement(uuid,integer,integer,text,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.finalize_creator_money_settlement(uuid,integer,integer,text,integer)', 'EXECUTE'),
  'only the service role may consume a verified settlement receipt'
);

select ok(
  not has_function_privilege('service_role', 'public.finalize_creator_money_settlement_pre_verified_receipt(uuid,integer,integer,text,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.finalize_creator_money_settlement_pre_verified_receipt(uuid,integer,integer,text,integer)', 'EXECUTE'),
  'the legacy caller-asserted settlement projector is not API executable'
);

select ok(
  has_function_privilege('service_role', 'public.mark_creator_payout_provider_result(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mark_creator_payout_provider_result(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.mark_creator_payout_provider_result(uuid,text,text)', 'EXECUTE'),
  'only the service role may consume a verified payout receipt'
);

select ok(
  not has_function_privilege('service_role', 'public.mark_creator_payout_provider_result_pre_verified_receipt(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mark_creator_payout_provider_result_pre_verified_receipt(uuid,text,text)', 'EXECUTE'),
  'the legacy caller-asserted payout projector is not API executable'
);

select throws_ok(
  $$select public.finalize_creator_money_settlement(
      '00000000-0000-4000-8000-000000000001', 1, 0, repeat('a', 64), null
    )$$,
  'P0001', 'verified_provider_settlement_receipt_required',
  'settlement fails closed when provider receipt evidence is absent'
);

select throws_ok(
  $$select public.mark_creator_payout_provider_result(
      '00000000-0000-4000-8000-000000000002', 'po_unverified', 'paid'
    )$$,
  'P0001', 'verified_provider_payout_receipt_required',
  'payout result fails closed when provider receipt evidence is absent'
);

select ok(
  pg_get_functiondef('public.finalize_creator_money_settlement(uuid,integer,integer,text,integer)'::regprocedure)
    ilike '%provider_settlement_receipt_parameter_mismatch%'
  and pg_get_functiondef('public.finalize_creator_money_settlement(uuid,integer,integer,text,integer)'::regprocedure)
    ilike '%provider_settlement_receipt_provider_mismatch%'
  and pg_get_functiondef('public.mark_creator_payout_provider_result(uuid,text,text)'::regprocedure)
    ilike '%provider_payout_receipt_parameter_mismatch%'
  and pg_get_functiondef('public.mark_creator_payout_provider_result(uuid,text,text)'::regprocedure)
    ilike '%provider_payout_destination_mismatch%',
  'receipt consumers bind exact economics, object identity, status, creator and payout destination'
);

select ok(
  pg_get_functiondef('public.finalize_creator_money_settlement(uuid,integer,integer,text,integer)'::regprocedure)
    ilike '%provider_settlement_hold_policy_must_be_server_owned%'
  and pg_get_functiondef('public.finalize_creator_money_settlement(uuid,integer,integer,text,integer)'::regprocedure)
    ilike '%v_receipt."evidence_hash",%null%'
  ,
  'settlement hold duration is selected by server policy rather than the caller'
);

select ok(
  pg_get_functiondef('public.mark_creator_payout_provider_result(uuid,text,text)'::regprocedure)
    ilike '%provider_payout_environment_mismatch%'
  and pg_get_functiondef('public.mark_creator_payout_provider_result(uuid,text,text)'::regprocedure)
    ilike '%when ''production'' then ''live'' else ''test'' end%'
  ,
  'payout receipt environment must match the exact Stripe Connect account environment'
);

select * from finish();
rollback;
