-- After applying the exact D2 migration once. The first checks use the actual
-- cutover; the last scenario translates only the fixture observation epoch,
-- restoring it immediately. Actual delivery and purchase history never change.
create table event_reservation_fixture.transition_assertions(label text primary key);
create function event_reservation_fixture.check_transition(p_ok boolean,p_label text)
returns void language plpgsql as $$begin
  if p_ok is distinct from true then raise exception 'transition assertion failed: %',p_label; end if;
  insert into event_reservation_fixture.transition_assertions values(p_label);
end;$$;
do $$
declare row event_reservation_fixture.policy_transition_context;policy jsonb;epoch timestamptz;current_terms jsonb;current_pass jsonb;
begin
  select started_at into strict epoch from private.creator_event_ticket_policy_observation where singleton;
  for row in select * from event_reservation_fixture.policy_transition_context order by label loop
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',row.context->>'buyerId','session_id',row.context->>'buyerSession')::text,true);
    policy:=public.read_my_creator_event_ticket_policy((row.context->>'eventId')::uuid,(row.context->>'intentId')::uuid);
    perform event_reservation_fixture.check_transition((row.original_terms->>'startsAt')::timestamptz<epoch,
      row.label||': advertised start precedes actual observation boundary');
    if row.label in('delivered_past_deadline','delivered_crossing_boundary','unknown') then
      perform event_reservation_fixture.check_transition(policy->'refundEligibility'='null'::jsonb,
        row.label||': absence of post-policy evidence creates no historical no-show eligibility');
    else
      perform event_reservation_fixture.check_transition(policy->'refundEligibility'->'reasons' ?
        case when row.label='canceled' then 'event_canceled' else 'event_no_show' end,
        row.label||': explicit historical remedy remains honored');
    end if;
    perform event_reservation_fixture.check_transition(not exists(select 1 from private.creator_event_verified_start_facts
      where event_id=(row.context->>'eventId')::uuid),row.label||': no invented historical delivery fact');
    select r.terms into strict current_terms from public.money_purchase_intents i join public.creator_event_offer_revisions r
      on r.id=i.event_terms_revision_id where i.id=(row.context->>'intentId')::uuid;
    select to_jsonb(p) into strict current_pass from public.paid_creator_event_passes p
      where p.creator_event_id=(row.context->>'eventId')::uuid and p.buyer_id=(row.context->>'buyerId')::uuid;
    perform event_reservation_fixture.check_transition(current_terms=row.original_terms and current_pass=row.original_pass,
      row.label||': original purchase terms and exact ticket history remain unchanged');
  end loop;
  perform event_reservation_fixture.check_transition((select starts_at+interval '30 minutes'>epoch from public.creator_events
    where id=(select (context->>'eventId')::uuid from event_reservation_fixture.policy_transition_context where label='delivered_crossing_boundary')),
    'cutover inside original grace window does not imply full-window observation');
  perform event_reservation_fixture.check_transition(not exists(select 1 from public.creator_event_purchase_remedies r
    join event_reservation_fixture.policy_transition_context c on r.purchase_intent_id=(c.context->>'intentId')::uuid
    where c.label in('delivered_past_deadline','delivered_crossing_boundary','unknown') and r.reason='event_no_show'),
    'historical read never persists a fabricated no-show remedy');

  -- Deterministic elapsed-window proof without waiting thirty real minutes:
  -- put the observation boundary ten minutes into an actual old delivered
  -- show's advertised window. Its deadline is already in the past, so a
  -- mistaken deadline>=cutover rule would now invent no-show eligibility.
  -- Only the isolated seed epoch changes; its guard is enabled during the read.
  select * into strict row from event_reservation_fixture.policy_transition_context where label='delivered_past_deadline';
  alter table private.creator_event_ticket_policy_observation disable trigger creator_event_ticket_policy_observation_immutable;
  update private.creator_event_ticket_policy_observation
    set started_at=(row.original_terms->>'startsAt')::timestamptz+interval '10 minutes' where singleton;
  alter table private.creator_event_ticket_policy_observation enable trigger creator_event_ticket_policy_observation_immutable;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',row.context->>'buyerId','session_id',row.context->>'buyerSession')::text,true);
  policy:=public.read_my_creator_event_ticket_policy((row.context->>'eventId')::uuid,(row.context->>'intentId')::uuid);
  perform event_reservation_fixture.check_transition(policy->'refundEligibility'='null'::jsonb
    and (row.original_terms->>'startsAt')::timestamptz+interval '30 minutes'<clock_timestamp(),
    'partially observed original grace window remains unknown after its deadline');
  alter table private.creator_event_ticket_policy_observation disable trigger creator_event_ticket_policy_observation_immutable;
  update private.creator_event_ticket_policy_observation set started_at=epoch where singleton;
  alter table private.creator_event_ticket_policy_observation enable trigger creator_event_ticket_policy_observation_immutable;
  perform event_reservation_fixture.check_transition((select started_at=epoch from private.creator_event_ticket_policy_observation where singleton)
    and (select tgenabled='O' from pg_trigger where tgrelid='private.creator_event_ticket_policy_observation'::regclass
      and tgname='creator_event_ticket_policy_observation_immutable'),
    'transition temporal fixture restores exact actual epoch and immutable guard');
end;$$;
