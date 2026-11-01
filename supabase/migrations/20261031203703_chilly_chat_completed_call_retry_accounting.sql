-- Preserve the three-unanswered-invitations / five-minute abuse budget.
-- A callee-authorized accepted call that durably ended is not an unanswered
-- ring attempt. Caller cancellation, decline, missed, busy and unknown evidence
-- still count. Existing thresholds and client grants remain unchanged; exact
-- completed direct calls also earn allocation credit in the room guard below.
-- Keep the immutable rate ledger, including pre-migration entries.
set check_function_bodies = false;

create or replace function public."enforce_chat_call_invites_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_count integer;
begin
  -- Same lock as begin_chilly_chat_call, including direct server insert paths.
  perform pg_advisory_xact_lock(hashtextextended(new."thread_id"::text, 0));
  v_now := clock_timestamp();
  perform public."assert_account_private_feature_allowed"(new."caller_user_id", 'chat_call_invite');
  perform public."assert_account_private_feature_allowed"(new."callee_user_id", 'chat_call_invite_recipient');

  if exists (
    select 1 from public."chat_call_invites" invite
    where invite."thread_id" = new."thread_id"
      and invite."status" = 'ringing' and invite."expires_at" > v_now
  ) then
    raise exception 'active_call_invite_exists';
  end if;

  select count(*) into v_count
  from public."abuse_rate_limit_events" event
  where event."actor_user_id" = new."caller_user_id"
    and event."action_key" = 'chat_call_invite'
    and event."target_key" = new."thread_id"::text || ':' || new."callee_user_id"
    and event."created_at" >= v_now - interval '300 seconds'
    and not exists (
      select 1 from public."chat_call_invites" invite
      where invite."thread_id" = new."thread_id"
        and invite."caller_user_id" = new."caller_user_id"
        and invite."callee_user_id" = new."callee_user_id"
        and (
          event."metadata" ->> 'invite_id' = invite."id"::text
          or (
            not (event."metadata" ? 'invite_id')
            and invite."created_at" = event."created_at"
            -- Legacy ledger has no invite ID. Only an unambiguous exact
            -- timestamp/scope association can earn the completed-call credit.
            and 1 = (select count(*) from public."chat_call_invites" legacy
              where legacy."thread_id" = new."thread_id"
                and legacy."caller_user_id" = new."caller_user_id"
                and legacy."callee_user_id" = new."callee_user_id"
                and legacy."created_at" = event."created_at")
          )
        )
        and invite."status" = 'ended'
        and invite."accepted_at" is not null and invite."ended_at" >= invite."accepted_at"
        -- These are server-only transition receipts, not client-writable
        -- timeline events, UI labels, duration claims or media-success claims.
        and exists (select 1 from public."chat_call_transition_deliveries" accepted
          where accepted."transition_key" = invite."id"::text || ':accepted'
            and accepted."call_invite_id" = invite."id"
            and accepted."target_status" = 'accepted'
            and accepted."actor_user_id"::text = invite."callee_user_id")
        and exists (select 1 from public."chat_call_transition_deliveries" ended
          where ended."transition_key" = invite."id"::text || ':ended'
            and ended."call_invite_id" = invite."id"
            and ended."target_status" = 'ended'
            and ended."actor_user_id"::text in (invite."caller_user_id", invite."callee_user_id"))
    );
  if v_count >= 3 then raise exception 'rate_limited'; end if;

  insert into public."abuse_rate_limit_events" (
    "actor_user_id", "action_key", "target_key", "created_at", "metadata"
  ) values (
    new."caller_user_id", 'chat_call_invite',
    new."thread_id"::text || ':' || new."callee_user_id", v_now,
    jsonb_build_object('source', 'chat_call_invites', 'call_type', new."call_type", 'invite_id', new."id")
  );
  return new;
end;
$$;

revoke all on function public."enforce_chat_call_invites_abuse_guard"() from public, anon, authenticated;
comment on function public."enforce_chat_call_invites_abuse_guard"() is
  'Serialized three-unanswered-call budget per caller/thread/callee in five minutes. Only exact callee-accepted and durably ended calls with server transition receipts are exempt; ledger, account restrictions and infrastructure request limits remain intact.';

-- The existing shared room guard remains five allocations per ten minutes.
-- Only the direct-call bucket receives the same consent-based completion credit.
-- Linked Live rooms, standalone rooms, failed/canceled calls and uncertain
-- associations retain their existing allocation cost. No ledger rows are erased.
create or replace function public."enforce_communication_rooms_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_count integer;
begin
  perform public."assert_account_private_feature_allowed"(new."host_user_id", 'communication_room_create');
  if new."linked_party_id" is not null then
    perform public."enforce_abuse_rate_limit"(new."host_user_id", 'communication_room_create',
      new."linked_party_id", 5, 600, jsonb_build_object('source', 'communication_rooms'));
    return new;
  end if;

  -- Serialize the existing shared direct-call allocation bucket, without
  -- locking invite/room rows or changing the call begin/transition lock order.
  perform pg_advisory_xact_lock(hashtextextended('communication-room-create:' || new."host_user_id" || ':direct_call', 0));
  v_now := clock_timestamp();
  select count(*) into v_count
  from public."abuse_rate_limit_events" event
  where event."actor_user_id" = new."host_user_id"
    and event."action_key" = 'communication_room_create'
    and event."target_key" = 'direct_call'
    and event."created_at" >= v_now - interval '600 seconds'
    and not exists (
      select 1 from public."communication_rooms" room
      join public."chat_call_invites" invite on invite."communication_room_id" = room."room_id"
      where room."host_user_id" = new."host_user_id"
        and room."status" = 'ended'
        and room."linked_party_id" is null
        and room."linked_room_code" is null and room."linked_room_mode" is null
        and invite."caller_user_id" = room."host_user_id"
        -- A matching historical timestamp alone is not proven allocation
        -- identity. Legacy room events stay
        -- charged until expiry; only server-written room_id metadata qualifies.
        and event."metadata" ->> 'room_id' = room."room_id"
        and invite."status" = 'ended'
        and invite."accepted_at" is not null and invite."ended_at" >= invite."accepted_at"
        and exists (select 1 from public."chat_call_transition_deliveries" accepted
          where accepted."transition_key" = invite."id"::text || ':accepted'
            and accepted."call_invite_id" = invite."id" and accepted."target_status" = 'accepted'
            and accepted."actor_user_id"::text = invite."callee_user_id")
        and exists (select 1 from public."chat_call_transition_deliveries" ended
          where ended."transition_key" = invite."id"::text || ':ended'
            and ended."call_invite_id" = invite."id" and ended."target_status" = 'ended'
            and ended."actor_user_id"::text in (invite."caller_user_id", invite."callee_user_id"))
    );
  if v_count >= 5 then raise exception 'rate_limited'; end if;
  insert into public."abuse_rate_limit_events" (
    "actor_user_id", "action_key", "target_key", "created_at", "metadata"
  ) values (
    new."host_user_id", 'communication_room_create', 'direct_call', v_now,
    jsonb_build_object('source', 'communication_rooms', 'room_id', new."room_id")
  );
  return new;
end;
$$;
revoke all on function public."enforce_communication_rooms_abuse_guard"() from public, anon, authenticated;
