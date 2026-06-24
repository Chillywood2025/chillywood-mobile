-- Wave 4.2 room-level block policy.
-- A user blocked by a host/creator cannot join or request seats in rooms
-- owned by that blocker. This does not change LiveKit publish authority,
-- active speaker caps, payments, Premium, or safety/report/legal routes.

set check_function_bodies = false;

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
  v_blocked boolean := false;
begin
  if v_party_id is null or v_actor_user_id is null then
    return false;
  end if;

  if v_auth_user_id is not null and v_auth_user_id <> v_actor_user_id then
    raise exception 'room_block_check_forbidden';
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
grant execute on function public."watch_party_room_actor_blocked_by_host"(text, text) to authenticated, service_role;

create or replace function public."enforce_watch_party_room_membership_block_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new."membership_state", 'active')) in ('active', 'reconnecting')
    and public."watch_party_room_actor_blocked_by_host"(new."party_id", new."user_id")
  then
    raise exception 'blocked_from_room';
  end if;

  return new;
end;
$$;

drop trigger if exists "enforce_watch_party_room_membership_block_guard" on public."watch_party_room_memberships";
create trigger "enforce_watch_party_room_membership_block_guard"
  before insert or update on public."watch_party_room_memberships"
  for each row execute function public."enforce_watch_party_room_membership_block_guard"();

revoke all on function public."enforce_watch_party_room_membership_block_guard"() from public;

create or replace function public."enforce_watch_party_room_messages_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new."text" := btrim(coalesce(new."text", ''));
  if char_length(new."text") < 1 then
    raise exception 'room_message_body_required';
  end if;
  if char_length(new."text") > 1000 then
    raise exception 'room_message_body_too_long';
  end if;

  if public."watch_party_room_actor_blocked_by_host"(new."party_id", new."user_id") then
    raise exception 'blocked_from_room';
  end if;

  if left(new."text", length('__chillywood_party_seat_request_v1__:')) = '__chillywood_party_seat_request_v1__:' then
    perform public."enforce_abuse_rate_limit"(
      new."user_id",
      'seat_request_marker',
      new."party_id",
      3,
      60,
      jsonb_build_object('source', 'watch_party_room_messages')
    );
  else
    perform public."enforce_abuse_rate_limit"(
      new."user_id",
      'room_message',
      new."party_id",
      10,
      30,
      jsonb_build_object('source', 'watch_party_room_messages')
    );
  end if;

  return new;
end;
$$;

revoke all on function public."enforce_watch_party_room_messages_abuse_guard"() from public;

drop policy if exists "watch_party_room_memberships_self_insert_policy" on public."watch_party_room_memberships";
create policy "watch_party_room_memberships_self_insert_policy"
  on public."watch_party_room_memberships"
  for insert
  to public
  with check (
    auth.uid() is not null
    and "user_id" = (auth.uid())::text
    and not public."watch_party_room_actor_blocked_by_host"(
      watch_party_room_memberships."party_id",
      (auth.uid())::text
    )
    and exists (
      select 1
      from public."watch_party_rooms" room
      where room."party_id" = watch_party_room_memberships."party_id"
        and (
          room."host_user_id" = auth.uid()
          or (
            room."join_policy" = 'open'
            and (
              room."content_access_rule" = 'open'
              or (
                room."content_access_rule" = 'party_pass'
                and public.user_has_active_entitlement(
                  (auth.uid())::text,
                  array['premium_watch_party'::text, 'premium'::text]
                )
              )
              or (
                room."content_access_rule" = 'premium'
                and (
                  (
                    room."room_type" = 'live'
                    and public.user_has_active_entitlement(
                      (auth.uid())::text,
                      array['premium_live'::text, 'premium'::text]
                    )
                  )
                  or (
                    room."room_type" = 'title'
                    and public.user_has_active_entitlement(
                      (auth.uid())::text,
                      array['paid_content'::text, 'premium'::text]
                    )
                  )
                  or public.user_has_active_entitlement(
                    (auth.uid())::text,
                    array['premium'::text]
                  )
                )
              )
            )
          )
        )
    )
  );
