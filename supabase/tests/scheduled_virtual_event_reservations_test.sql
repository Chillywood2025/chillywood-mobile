begin;
select plan(12);
select has_table('public','creator_event_offer_revisions','immutable event sale revisions exist');
select has_table('public','event_ticket_reservations','purchase-bound reservations exist');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.creator_event_offer_revisions'::regclass),
  'event revisions enforce RLS even for their owner');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.event_ticket_reservations'::regclass),
  'event reservations enforce RLS even for their owner');
select ok(not has_table_privilege('authenticated','public.event_ticket_reservations','INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role','public.event_ticket_reservations','INSERT,UPDATE,DELETE'),
  'API roles cannot manufacture or rewrite capacity reservations');
select ok(not has_table_privilege('authenticated','public.creator_event_offer_revisions','INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon','public.creator_event_offer_revisions','SELECT'),
  'API roles cannot manufacture terms or anonymously enumerate revision history');
select ok(has_function_privilege('authenticated','public.read_my_creator_event_reservation(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.read_my_creator_event_reservation(uuid)','EXECUTE'),
  'pre-SDK readback requires an authenticated caller');
select ok(not has_function_privilege('authenticated','public.event_ticket_reservation_failure_internal(uuid,uuid,text)','EXECUTE')
  and not has_function_privilege('service_role','public.event_ticket_reservation_failure_internal(uuid,uuid,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.finalize_event_ticket_reservation_internal(uuid,uuid,text,jsonb)','EXECUTE'),
  'only the existing trusted provider transaction can admit or finalize a hold');
select ok(not has_function_privilege('authenticated','public.event_ticket_inventory_internal(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.event_ticket_reservation_safe_row(public.event_ticket_reservations)','EXECUTE'),
  'internal inventory and arbitrary-row readers remain private');
set local role authenticated;
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.read_my_creator_event_reservation('00000000-0000-4000-8000-000000000001')$$,
  'P0001','buyer_session_authority_required','missing identity cannot read a reservation');
select throws_ok($$select public.create_reserved_creator_event_purchase_intent('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002')$$,
  'P0001','buyer_session_authority_required','missing identity cannot reserve capacity');
select throws_ok($$select public.configure_paid_creator_event_sale('00000000-0000-4000-8000-000000000001','Live show',99,1,'sandbox','UTC',now(),now()+interval '1 day')$$,
  'P0001','creator_session_authority_required','missing creator identity cannot publish a sale');
reset role;
select * from finish();
rollback;
