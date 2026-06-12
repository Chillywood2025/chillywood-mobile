-- Paid Watch-Party Seats V1 proof fix:
-- watch_party_rooms.host_user_id is uuid in the remote schema. The initial
-- ticket RPCs compared it to auth.uid() cast to text, which blocks creator
-- setup and access checks with "operator does not exist: uuid <> text".

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public."set_paid_watch_party_offer"(text,text,integer,integer,text)'::regprocedure)
  into v_definition;

  execute replace(
    v_definition,
    'v_room."host_user_id" <> v_actor_id::text',
    'v_room."host_user_id" <> v_actor_id'
  );

  select pg_get_functiondef('public."resolve_paid_watch_party_ticket_access"(text)'::regprocedure)
  into v_definition;

  execute replace(
    v_definition,
    'v_room."host_user_id" = v_user_id::text',
    'v_room."host_user_id" = v_user_id'
  );

  select pg_get_functiondef('public."create_paid_watch_party_ticket_purchase_intent"(uuid)'::regprocedure)
  into v_definition;

  execute replace(
    v_definition,
    'v_room."host_user_id" = v_user_id::text',
    'v_room."host_user_id" = v_user_id'
  );
end $$;

comment on function public."set_paid_watch_party_offer"(text, text, integer, integer, text) is
  'Creator-safe Paid Watch-Party ticket setup. Host checks compare uuid-to-uuid; tickets remain sandbox-only and do not grant Premium, Live Stage, LiveKit authority, payouts, Tips, or Paid Videos.';

comment on function public."resolve_paid_watch_party_ticket_access"(text) is
  'Read-only room-ticket gate for Paid Watch-Party Seats V1. Party Waiting Room and Party Room use this before entry; direct deep links must not bypass it. Host checks compare uuid-to-uuid.';
