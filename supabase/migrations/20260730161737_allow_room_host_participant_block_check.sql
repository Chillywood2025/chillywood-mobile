-- Let the authenticated host of one exact room evaluate the existing
-- blocked-participant guard while moderating that room. Direct checks for
-- another actor remain forbidden to every unrelated authenticated user.

create or replace function public."watch_party_room_actor_blocked_by_host"(
  p_party_id text,
  p_actor_user_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_party_id text := upper(nullif(btrim(coalesce(p_party_id, '')), ''));
  v_actor_user_id text := nullif(btrim(coalesce(p_actor_user_id, '')), '');
  v_auth_user_id text := nullif((auth.uid())::text, '');
  v_auth_is_room_host boolean := false;
  v_blocked boolean := false;
begin
  if v_party_id is null or v_actor_user_id is null then
    return false;
  end if;

  if v_auth_user_id is not null and v_auth_user_id <> v_actor_user_id then
    select exists (
      select 1
      from public."watch_party_rooms" room
      where room."party_id" = v_party_id
        and room."host_user_id"::text = v_auth_user_id
    ) into v_auth_is_room_host;

    if not v_auth_is_room_host then
      raise exception 'room_block_check_forbidden';
    end if;
  end if;

  select exists (
    select 1
    from public."watch_party_rooms" room
    join public."channel_audience_blocks" block
      on block."channel_user_id" = room."host_user_id"::text
     and block."blocked_user_id" = v_actor_user_id
    where room."party_id" = v_party_id
      and room."host_user_id"::text <> v_actor_user_id
  ) into v_blocked;

  return coalesce(v_blocked, false);
end;
$$;

revoke all on function public."watch_party_room_actor_blocked_by_host"(text, text) from public;
grant execute on function public."watch_party_room_actor_blocked_by_host"(text, text)
  to authenticated, service_role;