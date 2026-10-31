begin;
select plan(12);
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and c.relname in('creator_room_sessions','creator_room_seat_claims',
    'creator_party_ticket_reservations','creator_room_seat_auctions','creator_room_seat_auction_bids',
    'creator_room_auction_quotes') and c.relrowsecurity and c.relforcerowsecurity),6,
  'room inventory, bids and financial quotes all enable and force RLS');
select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and c.relname in('creator_room_sessions','creator_room_seat_claims',
    'creator_party_ticket_reservations','creator_room_seat_auctions','creator_room_seat_auction_bids',
    'creator_room_auction_quotes') and has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')),
  'clients cannot directly read or mutate private commercial authority');
select ok(not has_table_privilege('service_role','private.creator_room_seat_claims','INSERT,UPDATE,DELETE'),
  'ordinary service table mutations cannot fabricate a reserved paid seat');
select ok(has_function_privilege('authenticated','public.create_creator_room_seat_auction(text,text,integer,integer,timestamp with time zone,timestamp with time zone,text,uuid,uuid)','EXECUTE'),
  'authenticated creators can enter the checked auction creation RPC');
select ok(not has_function_privilege('anon','public.create_creator_room_seat_auction(text,text,integer,integer,timestamp with time zone,timestamp with time zone,text,uuid,uuid)','EXECUTE'),
  'anonymous callers cannot create auctions');
select ok(has_function_privilege('authenticated','public.place_creator_room_seat_auction_bid(uuid,integer,uuid,uuid)','EXECUTE'),
  'authenticated buyers can enter the checked bid RPC');
select ok(not has_function_privilege('authenticated','public.claim_creator_room_auction_checkout(uuid,uuid,uuid,uuid)','EXECUTE'),
  'buyers cannot claim dispatch authority directly');
select ok(has_function_privilege('service_role','public.claim_creator_room_auction_checkout(uuid,uuid,uuid,uuid)','EXECUTE'),
  'checkout service can claim a checked immutable winner quote');
select ok(not has_function_privilege('authenticated','public.set_creator_room_participant_authority_service(text,uuid,uuid,uuid,text,boolean,text)','EXECUTE'),
  'clients cannot call service-only host promotion');
select ok(not has_function_privilege('service_role','private.creator_room_seat_inventory(text,text,uuid,text)','EXECUTE'),
  'shared inventory calculations remain private to reviewed RPCs');
select ok(not has_function_privilege('authenticated','private.ensure_creator_room_session(text)','EXECUTE'),
  'clients cannot mint a commercial room incarnation');
select ok(has_function_privilege('authenticated','public.read_my_creator_room_seat_claims(text)','EXECUTE'),
  'buyers can read their own reconciliation and reservation status through the checked RPC');
select * from finish();
rollback;
