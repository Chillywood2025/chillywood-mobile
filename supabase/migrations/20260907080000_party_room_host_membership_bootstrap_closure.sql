-- Party Rooms and ordinary Live rooms share the same exact room/session
-- membership authority. Establish the exact authenticated host membership in
-- the room-creation transaction for both room types so Party Waiting Room ->
-- Party Room cannot strand a valid host on an empty membership table.

create or replace function public."bootstrap_watch_party_live_host_membership"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new."room_type" not in ('live', 'title')
    or auth.role() is distinct from 'authenticated'
  then
    return new;
  end if;

  if auth.uid() is null
    or auth.uid() is distinct from new."host_user_id"
    or not public."whole_app_exact_current_session_authority_internal"()
  then
    raise exception using
      errcode = '28000',
      message = 'watch_party_current_session_required';
  end if;

  perform public."join_watch_party_room_session"(
    new."party_id",
    null,
    null,
    null,
    false,
    false,
    false
  );

  return new;
end;
$function$;

revoke all on function public."bootstrap_watch_party_live_host_membership"()
  from public, anon, authenticated, service_role;

comment on function public."bootstrap_watch_party_live_host_membership"() is
  'After an authenticated exact-current-session user creates an ordinary Live room or Party Room for themself, establish the canonical exact host membership in the same transaction. No payment, pass, provider, creator-money, payout, speaker, moderator, or viewer authority is broadened.';
