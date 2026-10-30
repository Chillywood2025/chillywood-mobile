begin;
select no_plan();
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in(
  'private.creator_event_auction_product_bindings'::regclass,'private.creator_event_auction_receipts'::regclass,
  'private.creator_event_auction_no_payment_receipts'::regclass)), 'auction provider lineage forces RLS');
select ok(not has_table_privilege('authenticated','private.creator_event_auction_receipts','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon','private.creator_event_auction_receipts','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role','private.creator_event_auction_receipts','INSERT,UPDATE,DELETE'),
  'clients and direct service writes cannot manufacture signed receipt provenance');
select ok(not has_table_privilege('authenticated','private.creator_event_auction_product_bindings','INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role','private.creator_event_auction_product_bindings','UPDATE,DELETE'),
  'qualification is a separate server configuration with immutable bindings');
select ok(has_function_privilege('service_role','public.process_stripe_event_auction_receipt(jsonb,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.process_stripe_event_auction_receipt(jsonb,text)','EXECUTE')
  and not has_function_privilege('anon','public.process_stripe_event_auction_receipt(jsonb,text)','EXECUTE'),
  'only verified server ingress can project payment or financial terminal events');
select ok(has_function_privilege('service_role','public.process_stripe_event_auction_no_payment(jsonb,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.process_stripe_event_auction_no_payment(jsonb,text)','EXECUTE'),
  'buyer cannot release an uncertain checkout by asserting a provider cancellation');
select ok(not has_function_privilege('authenticated','public.prepare_creator_event_auction_checkout(uuid,uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.bind_creator_event_auction_checkout(uuid,uuid,text,text,text,integer,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.revalidate_creator_event_auction_checkout(uuid,uuid,uuid,uuid)','EXECUTE'),
  'checkout claim, provider response binding and URL release stay service-only');
select ok(not has_function_privilege('service_role','private.creator_event_auction_grant_identity(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.creator_event_auction_intent_exact(public.money_purchase_intents)','EXECUTE'),
  'historical authority helpers are internal, not alternative entitlement endpoints');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in(
  'public.process_stripe_event_auction_receipt(jsonb,text)'::regprocedure,
  'public.process_stripe_event_auction_no_payment(jsonb,text)'::regprocedure,
  'public.prepare_creator_event_auction_checkout(uuid,uuid,uuid,uuid)'::regprocedure)),
  'trusted money mutation functions pin empty definer search paths');
select ok(exists(select 1 from pg_trigger where tgname='auction_receipts_immutable' and tgenabled='O')
  and exists(select 1 from pg_trigger where tgname='auction_no_payment_receipts_immutable' and tgenabled='O')
  and exists(select 1 from pg_trigger where tgname='guard_bound_auction_product_identity' and tgenabled='O'),
  'provider history and its product identity retain active immutable guards');
select ok(exists(select 1 from pg_constraint where conrelid='public.money_purchase_intents'::regclass
  and conname='money_purchase_intents_sandbox_only_check'), 'live intent prohibition remains in force');
select is((select count(*) from private.creator_event_auction_product_bindings),0::bigint,'migration qualifies no product or payment route');
select is((select count(*) from private.creator_event_auction_receipts),0::bigint,'migration fabricates no financial provider receipt');
select is((select count(*) from private.creator_event_auction_no_payment_receipts),0::bigint,'migration fabricates no cancellation evidence');
select * from finish();
rollback;
