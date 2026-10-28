-- Before applying the D2 migration: load reservation/broadcast fixtures, then
-- the shared setup prefix of event-ticket-delivery-policy.sql. This creates
-- real old purchase/provider/open/end history without invented delivery facts.
create table event_reservation_fixture.policy_transition_context(
  label text primary key,context jsonb not null,original_terms jsonb not null,original_pass jsonb not null
);
do $$
declare label text;context jsonb;receipt jsonb;event public.creator_events;terms jsonb;pass jsonb;
begin
  if to_regclass('private.creator_event_ticket_policy_observation') is not null
  then raise exception 'transition fixture must precede policy migration'; end if;
  foreach label in array array['delivered_past_deadline','delivered_crossing_boundary','unknown','canceled','no_show'] loop
    context:=event_reservation_fixture.delivery_show('Pre-policy '||label,
      clock_timestamp()-case when label='delivered_crossing_boundary' then interval '10 minutes' else interval '1 hour' end);
    select * into event from public.creator_events where id=(context->>'eventId')::uuid;
    if label like 'delivered_%' then
      receipt:=event_reservation_fixture.delivery_receipt(context,context->'source','ACTIVE',label);
      if receipt->>'state'<>'active' then raise exception 'historical actual broadcast not active'; end if;
      perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',context->>'hostId','session_id',context->>'hostSession')::text,true);
      perform public.manage_creator_event_lifecycle(event.id,'start',event.updated_at);
      select * into event from public.creator_events where id=event.id;
      perform public.manage_creator_event_lifecycle(event.id,'end',event.updated_at);
      receipt:=event_reservation_fixture.delivery_receipt(context,context->'source','COMPLETE',label);
      if receipt->>'state'<>'stopped' then raise exception 'historical actual broadcast not stopped'; end if;
    elsif label in('canceled','no_show') then
      perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',context->>'hostId','session_id',context->>'hostSession')::text,true);
      perform public.manage_creator_event_lifecycle(event.id,case when label='canceled' then 'cancel' else 'mark_no_show' end,
        event.updated_at,null,null,null,'Historical creator action',false);
    end if;
    select r.terms into strict terms from public.money_purchase_intents i
      join public.creator_event_offer_revisions r on r.id=i.event_terms_revision_id where i.id=(context->>'intentId')::uuid;
    select to_jsonb(p) into strict pass from public.paid_creator_event_passes p
      where p.creator_event_id=event.id and p.buyer_id=(context->>'buyerId')::uuid;
    insert into event_reservation_fixture.policy_transition_context values(label,context,terms,pass);
  end loop;
end;$$;
