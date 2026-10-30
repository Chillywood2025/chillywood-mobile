begin;
select no_plan();
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in (
  'private.creator_event_auctions'::regclass,'private.creator_event_auction_bids'::regclass,
  'private.creator_event_auction_quotes'::regclass,'private.creator_event_auction_transfers'::regclass)),
  'auction inventory, bids, quotes and transfer proofs force RLS');
select ok(not has_table_privilege('authenticated','private.creator_event_auctions','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon','private.creator_event_auctions','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role','private.creator_event_auctions','INSERT,UPDATE,DELETE'),
  'auction state can only change through exact definer boundaries');
select ok(not has_table_privilege('authenticated','private.creator_event_auction_bids','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','private.creator_event_auction_quotes','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role','private.creator_event_auction_transfers','SELECT,INSERT,UPDATE,DELETE'),
  'bidders cannot inspect identities or forge award transfer authority');
select ok(has_function_privilege('authenticated','public.place_creator_event_auction_bid(uuid,integer,uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.place_creator_event_auction_bid(uuid,integer,uuid,uuid)','EXECUTE'),
  'bidding requires an authenticated RPC with current subject checks');
select ok(has_function_privilege('service_role','public.claim_creator_event_auction_checkout(uuid,uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.claim_creator_event_auction_checkout(uuid,uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.claim_creator_event_auction_checkout(uuid,uuid,uuid,uuid)','EXECUTE'),
  'only verified backend can claim one external checkout dispatch');
select ok(not has_function_privilege('authenticated','private.advance_creator_event_auction(uuid)','EXECUTE')
  and not has_function_privilege('service_role','private.advance_creator_event_auction(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.event_ticket_inventory_pre_auctions_internal(uuid)','EXECUTE'),
  'internal helpers cannot bypass event locks or shared inventory');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in (
  'public.place_creator_event_auction_bid(uuid,integer,uuid,uuid)'::regprocedure,
  'public.create_creator_event_auction(uuid,uuid,integer,integer,timestamptz,timestamptz,text)'::regprocedure,
  'public.create_creator_event_auction_award_quote(uuid,uuid)'::regprocedure,
  'public.claim_creator_event_auction_checkout(uuid,uuid,uuid,uuid)'::regprocedure)),
  'mutation boundaries pin empty definer search paths');
select ok(exists(select 1 from pg_trigger where tgrelid='private.creator_event_auctions'::regclass and tgname='creator_event_auction_terms_immutable')
  and exists(select 1 from pg_trigger where tgrelid='private.creator_event_auction_quotes'::regclass and tgname='creator_event_auction_quote_immutable')
  and exists(select 1 from pg_trigger where tgrelid='private.creator_event_auction_bids'::regclass and tgname='creator_event_auction_bids_immutable'),
  'auction terms, bid history and quote identities retain immutable guards');
select ok(exists(select 1 from pg_trigger where tgrelid='public.money_purchase_intents'::regclass and tgname='bind_auction_event_ticket_purchase_terms')
  and exists(select 1 from pg_trigger where tgrelid='public.money_purchase_intents'::regclass and tgname='bind_event_ticket_purchase_terms'),
  'Stripe award and native store intent binders remain distinct');
select ok(exists(select 1 from pg_index where indexrelid='private.creator_event_auction_active_quote'::regclass
  and indisunique and indpred is not null),
  'one active award quote is enforced while superseded immutable history remains');
select is((select count(*) from private.creator_event_auctions),0::bigint,'migration creates no real auction or inventory hold');
select is((select count(*) from private.creator_event_auction_bids),0::bigint,'migration places no bids');
select is((select count(*) from private.creator_event_auction_quotes),0::bigint,'migration creates no payment obligation');
select is((select count(*) from private.creator_event_auction_transfers),0::bigint,'migration grants no receipt transfer authority');
select * from finish();
rollback;
