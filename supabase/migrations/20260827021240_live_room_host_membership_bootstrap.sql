create or replace function public."bootstrap_watch_party_live_host_membership"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new."room_type" <> 'live' or auth.role() <> 'authenticated' then
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

drop trigger if exists "bootstrap_watch_party_live_host_membership"
  on public."watch_party_rooms";
create trigger "bootstrap_watch_party_live_host_membership"
after insert on public."watch_party_rooms"
for each row execute function public."bootstrap_watch_party_live_host_membership"();

comment on function public."bootstrap_watch_party_live_host_membership"() is
  'After an authenticated exact-current-session user creates an ordinary Live room for themself, establish the canonical host membership in the same transaction. No creator-money, payout, provider, speaker, or viewer authority is broadened.';
