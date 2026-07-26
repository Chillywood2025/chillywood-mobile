-- Close expired ringing Chi'lly Chat calls from the existing one-minute,
-- token-gated terminal delivery worker. This makes timeout durable even when
-- the caller app is backgrounded, terminated, or loses connectivity.

set check_function_bodies = false;

create index if not exists "chat_call_invites_expired_ringing_idx"
  on public."chat_call_invites" ("expires_at", "id")
  where "status" = 'ringing';

create or replace function public."expire_stale_chilly_chat_call_invites"(
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite record;
  v_result jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 10);
  v_expired_count integer := 0;
  v_delivery_created_count integer := 0;
  v_room_closed_count integer := 0;
  v_thread_cleared_count integer := 0;
  v_now timestamptz := timezone('utc'::text, now());
begin
  for v_invite in
    select
      invite."id",
      invite."caller_user_id",
      invite."thread_id",
      invite."communication_room_id"
    from public."chat_call_invites" invite
    where invite."status" = 'ringing'
      and invite."expires_at" <= v_now
    order by invite."expires_at", invite."id"
    for update skip locked
    limit v_limit
  loop
    v_result := public."transition_chilly_chat_call_invite"(
      v_invite."id",
      v_invite."caller_user_id"::uuid,
      'missed',
      null
    );
    v_expired_count := v_expired_count + 1;
    if coalesce(v_result #>> '{delivery,status}', '') = 'pending' then
      v_delivery_created_count := v_delivery_created_count + 1;
    end if;

    if v_invite."communication_room_id" is not null then
      update public."communication_rooms"
      set
        "status" = 'ended',
        "updated_at" = v_now,
        "last_activity_at" = v_now
      where "room_id" = v_invite."communication_room_id"
        and "status" = 'active';
      v_room_closed_count := v_room_closed_count + case when found then 1 else 0 end;

      update public."chat_threads"
      set
        "active_communication_room_id" = null,
        "active_call_type" = null,
        "updated_at" = v_now
      where "id" = v_invite."thread_id"
        and "active_communication_room_id" = v_invite."communication_room_id";
      v_thread_cleared_count := v_thread_cleared_count + case when found then 1 else 0 end;
    end if;
  end loop;

  return jsonb_build_object(
    'expiredCount', v_expired_count,
    'deliveryCreatedCount', v_delivery_created_count,
    'roomClosedCount', v_room_closed_count,
    'threadClearedCount', v_thread_cleared_count
  );
end;
$$;

comment on function public."expire_stale_chilly_chat_call_invites"(integer) is
  'Service-owned bounded expiry for stale ringing calls. Creates the existing durable timeout delivery and closes linked room/thread state without returning participant identifiers.';

revoke all on function public."expire_stale_chilly_chat_call_invites"(integer)
  from public, anon, authenticated;
grant execute on function public."expire_stale_chilly_chat_call_invites"(integer)
  to service_role;
