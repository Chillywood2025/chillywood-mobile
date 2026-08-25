-- Whole-app pre-release closure: keep direct chat, call, room, and private
-- realtime authority server-owned. Historical malformed rows are retained for
-- investigation, but fail closed instead of being silently repaired/deleted.

set check_function_bodies = false;

create index if not exists "chat_threads_active_communication_room_idx"
  on public."chat_threads" ("active_communication_room_id")
  where "active_communication_room_id" is not null;

-- Every caller-bound private-room authority check uses the exact current
-- Supabase Auth session generation. A still-unexpired JWT from a rotated,
-- revoked, restricted, or restore-only session cannot retain room authority.
create or replace function public."whole_app_exact_current_session_authority_internal"()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_generation text := nullif(
    btrim(coalesce(auth.jwt() ->> 'session_id', '')),
    ''
  );
  v_readback jsonb;
begin
  if auth.role() <> 'authenticated'
    or v_user_id is null
    or v_session_generation is null
  then
    return false;
  end if;

  begin
    v_readback := public."wave1_session_authority_readback"();
  exception when others then
    return false;
  end;

  return coalesce((v_readback ->> 'authoritative')::boolean, false)
    and v_readback ->> 'state' = 'ACTIVE'
    and coalesce((v_readback ->> 'restoreOnly')::boolean, true) is false
    and nullif(v_readback ->> 'userId', '') = v_user_id::text
    and nullif(v_readback ->> 'accountId', '') = v_user_id::text
    and nullif(v_readback ->> 'sessionGeneration', '') =
      v_session_generation;
exception when others then
  return false;
end;
$$;

revoke all on function public."whole_app_exact_current_session_authority_internal"()
  from public, anon, authenticated, service_role;

-- RLS expressions execute with the caller's privileges, so they cannot call
-- the internal helper directly after its API privileges are revoked. Expose
-- only this boolean, caller-bound projection to authenticated sessions; the
-- underlying authority readback and its details remain private.
create or replace function public."whole_app_exact_current_session_authority"()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public."whole_app_exact_current_session_authority_internal"();
$$;

revoke all on function public."whole_app_exact_current_session_authority"()
  from public, anon, service_role;
grant execute on function public."whole_app_exact_current_session_authority"()
  to authenticated;

-- A chat thread is readable only by one of its two actual members. Creator
-- ownership is not membership, and malformed third-member rows close access
-- for everyone until an authorized data repair is performed.
create or replace function public."can_access_chat_thread"(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select nullif(auth.uid()::text, '') as user_id
  ),
  thread_scope as (
    select
      thread."id",
      thread."created_by",
      thread."thread_kind",
      thread."participant_pair_key"
    from public."chat_threads" thread
    where thread."id" = target_thread_id
  ),
  member_scope as (
    select
      member."user_id",
      (count(*) over ())::integer as member_count
    from public."chat_thread_members" member
    where member."thread_id" = target_thread_id
  )
  select coalesce((
    select
      actor.user_id is not null
      and public."whole_app_exact_current_session_authority_internal"()
      and thread_scope."thread_kind" = 'direct'
      and thread_scope."participant_pair_key" = (
        select array_to_string(
          array_agg(member."user_id" order by member."user_id"),
          '::'
        )
        from member_scope member
      )
      and exists (
        select 1
        from member_scope member
        where member."user_id" = actor.user_id
          and member.member_count = 2
      )
      and exists (
        select 1
        from member_scope member
        where member."user_id" = thread_scope."created_by"
          and member.member_count = 2
      )
      and not public."is_account_access_restricted"(actor.user_id)
      and not exists (
        select 1
        from member_scope other_member
        where other_member."user_id" <> actor.user_id
          and (
            public."is_account_access_restricted"(other_member."user_id")
            or public."has_channel_audience_block_between"(
              actor.user_id,
              other_member."user_id"
            )
          )
      )
    from actor
    join thread_scope on true
  ), false);
$$;

comment on function public."can_access_chat_thread"(uuid) is
  'Fail-closed direct-thread read gate: the caller must be one of the exact canonical pair; creator-only, pair-mismatched, and third-member rows grant no access.';

revoke all on function public."can_access_chat_thread"(uuid)
  from public, anon;
grant execute on function public."can_access_chat_thread"(uuid)
  to authenticated, service_role;

-- Direct-thread creation and missing-member repair are one serialized RPC.
-- Existing rows are repaired only when every present member already belongs
-- to the requested pair and the immutable thread identity is exact.
create or replace function public."get_or_create_direct_chat_thread"(
  p_target_user_id text,
  p_target_display_name text default null,
  p_target_avatar_url text default null,
  p_target_tagline text default null
)
returns table(thread_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := nullif(auth.uid()::text, '');
  v_target_user_id text := nullif(btrim(coalesce(p_target_user_id, '')), '');
  v_pair_key text;
  v_thread public."chat_threads"%rowtype;
  v_actor_profile public."user_profiles"%rowtype;
  v_target_profile public."user_profiles"%rowtype;
  v_member_ids text[] := array[]::text[];
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'sign_in_required';
  end if;
  if not public."whole_app_exact_current_session_authority_internal"() then
    raise exception using errcode = '28000', message = 'exact_current_session_required';
  end if;
  if v_target_user_id is null then
    raise exception using errcode = '23514', message = 'target_required';
  end if;
  if v_target_user_id = v_actor_user_id then
    raise exception using errcode = '23514', message = 'self_chat_unavailable';
  end if;

  perform public."assert_account_private_feature_allowed"(
    v_actor_user_id,
    'chat_direct_thread_open'
  );
  perform public."assert_account_private_feature_allowed"(
    v_target_user_id,
    'chat_direct_thread_target'
  );

  if public."has_channel_audience_block_between"(
    v_actor_user_id,
    v_target_user_id
  ) then
    raise exception using errcode = '42501', message = 'blocked_relationship';
  end if;
  if public."is_platform_owner_user"(v_target_user_id)
    and not public."is_current_platform_owner"()
  then
    raise exception using errcode = '42501', message = 'owner_chat_unavailable';
  end if;

  select profile.* into v_actor_profile
  from public."user_profiles" profile
  where profile."user_id" = v_actor_user_id;

  select profile.* into v_target_profile
  from public."user_profiles" profile
  where profile."user_id" = v_target_user_id;

  if v_target_profile."user_id" is null then
    raise exception using errcode = '42501', message = 'target_unavailable';
  end if;

  select array_to_string(array_agg(participant_id order by participant_id), '::')
  into v_pair_key
  from unnest(array[v_actor_user_id, v_target_user_id]) participant_id;

  perform pg_advisory_xact_lock(
    hashtextextended('direct-chat-pair:' || v_pair_key, 0)
  );

  select thread.* into v_thread
  from public."chat_threads" thread
  where thread."participant_pair_key" = v_pair_key
  for update;

  if v_thread."id" is null then
    insert into public."chat_threads" (
      "thread_kind",
      "participant_pair_key",
      "created_by"
    ) values (
      'direct',
      v_pair_key,
      v_actor_user_id
    ) returning * into v_thread;
  elsif v_thread."thread_kind" <> 'direct'
    or v_thread."participant_pair_key" <> v_pair_key
    or v_thread."created_by" not in (v_actor_user_id, v_target_user_id)
  then
    raise exception using errcode = '23514', message = 'direct_thread_integrity_invalid';
  end if;

  select coalesce(array_agg(member."user_id" order by member."user_id"), array[]::text[])
  into v_member_ids
  from public."chat_thread_members" member
  where member."thread_id" = v_thread."id";

  if cardinality(v_member_ids) > 2
    or exists (
      select 1
      from unnest(v_member_ids) member_id
      where member_id not in (v_actor_user_id, v_target_user_id)
    )
  then
    raise exception using errcode = '23514', message = 'direct_thread_integrity_invalid';
  end if;

  insert into public."chat_thread_members" (
    "thread_id",
    "user_id",
    "display_name",
    "avatar_url",
    "tagline"
  ) values
    (
      v_thread."id",
      v_actor_user_id,
      coalesce(
        nullif(v_actor_profile."display_name", ''),
        nullif(v_actor_profile."username", ''),
        'You'
      ),
      nullif(v_actor_profile."avatar_url", ''),
      nullif(v_actor_profile."tagline", '')
    ),
    (
      v_thread."id",
      v_target_user_id,
      coalesce(
        nullif(v_target_profile."display_name", ''),
        nullif(v_target_profile."username", ''),
        'Member'
      ),
      nullif(v_target_profile."avatar_url", ''),
      nullif(v_target_profile."tagline", '')
    )
  on conflict on constraint "chat_thread_members_pkey" do update
  set
    "display_name" = excluded."display_name",
    "avatar_url" = excluded."avatar_url",
    "tagline" = excluded."tagline";

  select coalesce(array_agg(member."user_id" order by member."user_id"), array[]::text[])
  into v_member_ids
  from public."chat_thread_members" member
  where member."thread_id" = v_thread."id";

  if v_member_ids <> array(
    select participant_id
    from unnest(array[v_actor_user_id, v_target_user_id]) participant_id
    order by participant_id
  ) then
    raise exception using errcode = '23514', message = 'direct_thread_integrity_invalid';
  end if;

  return query select v_thread."id";
end;
$$;

revoke all on function public."get_or_create_direct_chat_thread"(text, text, text, text)
  from public, anon, service_role;
grant execute on function public."get_or_create_direct_chat_thread"(text, text, text, text)
  to authenticated;

comment on function public."get_or_create_direct_chat_thread"(text, text, text, text) is
  'Serialized, idempotent two-party direct-thread open/repair. It rejects mismatched pair identity and any historical third-member row without deleting evidence; compatibility display hints never override canonical profile metadata.';

drop policy if exists "chat_threads_insert_policy" on public."chat_threads";
drop policy if exists "chat_thread_members_insert_policy" on public."chat_thread_members";
revoke insert, update on table public."chat_threads" from anon, authenticated;
revoke insert, update on table public."chat_thread_members" from anon, authenticated;
grant update ("unread_count", "last_read_at")
  on table public."chat_thread_members" to authenticated;

drop policy if exists "chat_thread_members_update_policy"
  on public."chat_thread_members";
create policy "chat_thread_members_update_policy"
  on public."chat_thread_members"
  for update
  to authenticated
  using (
    "user_id" = auth.uid()::text
    and public."whole_app_exact_current_session_authority"()
    and public."can_access_chat_thread"("thread_id")
  )
  with check (
    "user_id" = auth.uid()::text
    and public."whole_app_exact_current_session_authority"()
    and public."can_access_chat_thread"("thread_id")
  );

-- Call invite creation and transitions are already represented by the begin
-- and transition operations. Remove the legacy raw lifecycle authority.
drop policy if exists "chat_call_invites_insert_caller" on public."chat_call_invites";
drop policy if exists "chat_call_invites_update_participants" on public."chat_call_invites";
revoke insert, update on table public."chat_call_invites" from anon, authenticated;

-- The service-only lifecycle RPC is still constrained by immutable invite
-- identity and the exact canonical two-member thread. Acceptance additionally
-- requires the same live room and call type still anchored on that thread.
create or replace function public."enforce_chat_call_invite_authority"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public."chat_threads"%rowtype;
  v_room public."communication_rooms"%rowtype;
  v_member_count integer := 0;
  v_member_pair_key text;
  v_invite_pair_key text;
begin
  if new."id" is distinct from old."id"
    or new."thread_id" is distinct from old."thread_id"
    or new."communication_room_id" is distinct from old."communication_room_id"
    or new."caller_user_id" is distinct from old."caller_user_id"
    or new."callee_user_id" is distinct from old."callee_user_id"
    or new."call_type" is distinct from old."call_type"
    or new."chat_call_media_provider" is distinct from old."chat_call_media_provider"
    or new."created_at" is distinct from old."created_at"
    or new."expires_at" is distinct from old."expires_at"
  then
    raise exception 'chat_call_invite_binding_immutable';
  end if;

  select thread.* into v_thread
  from public."chat_threads" thread
  where thread."id" = new."thread_id";

  select
    count(*)::integer,
    array_to_string(array_agg(member."user_id" order by member."user_id"), '::')
  into v_member_count, v_member_pair_key
  from public."chat_thread_members" member
  where member."thread_id" = new."thread_id";

  select array_to_string(array_agg(participant_id order by participant_id), '::')
  into v_invite_pair_key
  from unnest(array[new."caller_user_id", new."callee_user_id"]) participant_id;

  if v_thread."id" is null
    or v_thread."thread_kind" <> 'direct'
    or new."caller_user_id" = new."callee_user_id"
    or v_member_count <> 2
    or v_member_pair_key is distinct from v_invite_pair_key
    or v_thread."participant_pair_key" is distinct from v_invite_pair_key
    or v_thread."created_by" not in (
      new."caller_user_id",
      new."callee_user_id"
    )
  then
    raise exception 'chat_call_invite_thread_integrity_invalid';
  end if;

  if new."status" = 'accepted' and new."status" is distinct from old."status" then
    if old."status" <> 'ringing'
      or new."accepted_at" is null
      or new."ended_at" is not null
    then
      raise exception 'chat_call_invite_acceptance_invalid';
    end if;
    if public."is_account_access_restricted"(new."caller_user_id")
      or public."is_account_access_restricted"(new."callee_user_id")
      or public."has_channel_audience_block_between"(
        new."caller_user_id",
        new."callee_user_id"
      )
    then
      raise exception 'chat_call_invite_participant_access_invalid';
    end if;
    select room.* into v_room
    from public."communication_rooms" room
    where room."room_id" = new."communication_room_id";
    if v_room."room_id" is null
      or v_room."status" <> 'active'
      or v_room."host_user_id" <> new."caller_user_id"
      or v_thread."active_communication_room_id" is distinct from
        new."communication_room_id"
      or v_thread."active_call_type" is distinct from new."call_type"
    then
      raise exception 'chat_call_invite_room_authority_invalid';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public."enforce_chat_call_invite_authority"()
  from public, anon, authenticated, service_role;
drop trigger if exists "enforce_chat_call_invite_authority"
  on public."chat_call_invites";
create trigger "enforce_chat_call_invite_authority"
before update on public."chat_call_invites"
for each row execute function public."enforce_chat_call_invite_authority"();

-- Client cleanup can request a compare-and-clear, but it cannot detach a
-- ringing/accepted call or a different/newer room.
create or replace function public."clear_stale_chilly_chat_thread_call"(
  p_thread_id uuid,
  p_expected_room_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public."chat_threads"%rowtype;
  v_expected_room_id text := upper(btrim(coalesce(p_expected_room_id, '')));
  v_now timestamptz := timezone('utc'::text, now());
begin
  if auth.uid() is null or p_thread_id is null then
    raise exception 'chat_call_clear_authentication_required';
  end if;
  if not public."can_access_chat_thread"(p_thread_id) then
    raise exception 'chat_call_thread_access_required';
  end if;

  select thread.* into v_thread
  from public."chat_threads" thread
  where thread."id" = p_thread_id
  for update;

  if v_thread."id" is null then
    raise exception 'chat_call_thread_access_required';
  end if;
  if v_thread."active_communication_room_id" is null then
    return jsonb_build_object('cleared', false, 'reason', 'already_clear');
  end if;
  if v_expected_room_id <> ''
    and v_expected_room_id <> v_thread."active_communication_room_id"
  then
    raise exception 'chat_call_room_identity_mismatch';
  end if;

  v_expected_room_id := v_thread."active_communication_room_id";

  if exists (
    select 1
    from public."chat_call_invites" invite
    where invite."thread_id" = p_thread_id
      and invite."communication_room_id" = v_expected_room_id
      and (
        invite."status" = 'accepted'
        or (invite."status" = 'ringing' and invite."expires_at" > v_now)
      )
  ) then
    return jsonb_build_object('cleared', false, 'reason', 'active_invite');
  end if;

  if exists (
    select 1
    from public."communication_rooms" room
    where room."room_id" = v_expected_room_id
      and room."status" = 'active'
  ) and not exists (
    select 1
    from public."chat_call_invites" terminal_invite
    where terminal_invite."thread_id" = p_thread_id
      and terminal_invite."communication_room_id" = v_expected_room_id
      and terminal_invite."status" in (
        'declined', 'missed', 'canceled', 'ended', 'busy'
      )
  ) then
    return jsonb_build_object('cleared', false, 'reason', 'room_still_active');
  end if;

  update public."chat_threads" thread
  set
    "active_communication_room_id" = null,
    "active_call_type" = null,
    "updated_at" = v_now
  where thread."id" = p_thread_id
    and thread."active_communication_room_id" = v_expected_room_id;

  return jsonb_build_object(
    'cleared', found,
    'reason', case when found then 'terminal_or_inactive' else 'identity_changed' end,
    'roomId', v_expected_room_id
  );
end;
$$;

revoke all on function public."clear_stale_chilly_chat_thread_call"(uuid, text)
  from public, anon, service_role;
grant execute on function public."clear_stale_chilly_chat_thread_call"(uuid, text)
  to authenticated;

-- A room with a current paid offer is ticket-gated even when the historical
-- room row still says `open`. The ticket itself is only a projection: access
-- requires the exact current purchase intent, product, provider event, grant,
-- buyer, creator, room, and (for App Store consumables) original-transaction
-- binding. This helper is intentionally not executable by clients; caller-
-- bound RPCs, RLS helpers, and service-only Edge resolvers reuse it.
create or replace function public."watch_party_room_self_access_allowed_internal"(
  p_party_id text,
  p_user_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_party_id text := upper(btrim(coalesce(p_party_id, '')));
  v_user_id text := nullif(btrim(coalesce(p_user_id, '')), '');
  v_auth_user_id text := nullif(auth.uid()::text, '');
  v_request_role text := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('role', true), ''),
    session_user::text
  );
  v_service_authority boolean := false;
  v_room public."watch_party_rooms"%rowtype;
  v_paid_ticket_required boolean := false;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_party_id = '' or v_user_id is null then
    return false;
  end if;

  select room.* into v_room
  from public."watch_party_rooms" room
  where room."party_id" = v_party_id;
  if v_room."party_id" is null or not coalesce(v_room."is_active", false) then
    return false;
  end if;

  v_service_authority := v_request_role = 'service_role'
    or (
      coalesce(auth.jwt() ->> 'role', '') not in ('authenticated', 'anon')
      and session_user::text in ('postgres', 'supabase_admin')
    );
  if not v_service_authority then
    if v_auth_user_id is null
      or v_auth_user_id not in (v_user_id, v_room."host_user_id"::text)
    then
      return false;
    end if;
    if not public."whole_app_exact_current_session_authority_internal"() then
      return false;
    end if;
  end if;

  if public."is_account_access_restricted"(v_user_id)
    or public."watch_party_room_actor_blocked_by_host"(
      v_party_id,
      v_user_id
    )
  then
    return false;
  end if;

  -- Creator eligibility is live authority, not a one-time room-creation
  -- receipt. Existing Live Stages also fail closed after eligibility changes.
  if v_room."room_type" = 'live' and not exists (
    select 1
    from public."wave1_creator_eligibility" eligibility
    where eligibility."creator_user_id"::text =
        v_room."host_user_id"::text
      and eligibility."state" = 'VERIFIED'
      and eligibility."account_status" = 'ACTIVE'
      and eligibility."age_18_plus"
      and eligibility."legal_accepted"
      and eligibility."creator_role"
      and eligibility."moderation_state" = 'CLEAR'
      and eligibility."market" = 'UNITED_STATES'
      and eligibility."rollout_eligible"
      and eligibility."platform_capability"
      and eligibility."provider_eligible"
      and eligibility."kyc_complete"
      and eligibility."tax_complete"
      and eligibility."sanctions_clear"
      and eligibility."payout_eligible"
  ) then
    return false;
  end if;

  select exists (
    select 1
    from public."paid_watch_party_offers" offer
    where offer."party_id" = v_party_id
      and offer."status" in (
        'sandbox', 'active', 'paused', 'sold_out', 'blocked'
      )
  ) into v_paid_ticket_required;

  if v_room."host_user_id"::text = v_user_id then
    if not v_paid_ticket_required then
      return v_room."content_access_rule" in ('open', 'party_pass', 'premium');
    end if;
    return exists (
      select 1
      from public."paid_watch_party_offers" offer
      join public."wave1_creator_eligibility" eligibility
        on eligibility."creator_user_id" = offer."creator_id"
      where offer."party_id" = v_party_id
        and offer."creator_id"::text = v_room."host_user_id"::text
        and offer."host_id"::text = v_room."host_user_id"::text
        and offer."status" in ('sandbox', 'active', 'sold_out')
        and (offer."starts_at" is null or offer."starts_at" <= v_now)
        and (offer."ends_at" is null or offer."ends_at" > v_now)
        and eligibility."state" = 'VERIFIED'
        and eligibility."account_status" = 'ACTIVE'
        and eligibility."age_18_plus"
        and eligibility."legal_accepted"
        and eligibility."creator_role"
        and eligibility."moderation_state" = 'CLEAR'
        and eligibility."market" = 'UNITED_STATES'
        and eligibility."rollout_eligible"
        and eligibility."platform_capability"
        and eligibility."provider_eligible"
        and eligibility."kyc_complete"
        and eligibility."tax_complete"
        and eligibility."sanctions_clear"
        and eligibility."payout_eligible"
    );
  end if;

  -- Without a paid offer, preserve the canonical room rule. Unknown or
  -- malformed rules fail closed; they never fall back to `open`.
  if not v_paid_ticket_required then
    if v_room."content_access_rule" = 'open' then
      return true;
    elsif v_room."content_access_rule" = 'party_pass' then
      return public."user_has_active_entitlement"(
        v_user_id,
        array['premium_watch_party'::text, 'premium'::text]
      );
    elsif v_room."content_access_rule" = 'premium' then
      return public."user_has_active_entitlement"(
        v_user_id,
        case when v_room."room_type" = 'live'
          then array['premium_live'::text, 'premium'::text]
          else array['paid_content'::text, 'premium'::text]
        end
      );
    end if;
    return false;
  end if;

  return exists (
    select 1
    from public."access_grants" grant_row
    join public."paid_watch_party_offers" offer
      on offer."id" = grant_row."source_id"
     and offer."party_id" = v_party_id
     and offer."creator_id"::text = v_room."host_user_id"::text
     and offer."host_id"::text = v_room."host_user_id"::text
    join public."monetization_products" product
      on product."id" = grant_row."product_id"
     and product."product_type" = 'watch_party_live_ticket'
    join public."provider_events" provider_event
      on provider_event."id" = grant_row."provider_event_id"
     and provider_event."provider" = grant_row."provider"
     and provider_event."product_id" = grant_row."product_id"
     and provider_event."user_id" = grant_row."user_id"
     and provider_event."environment" = grant_row."environment"
     and provider_event."status" = 'processed'
    join public."money_purchase_intents" intent
      on intent."id"::text = grant_row."metadata" ->> 'purchase_intent_id'
     and intent."id"::text = provider_event."metadata" ->> 'purchase_intent_id'
     and intent."user_id" = grant_row."user_id"
     and intent."product_id" = grant_row."product_id"
     and intent."product_key" = product."product_key"
     and intent."product_type" = 'watch_party_live_ticket'
     and intent."provider" = grant_row."provider"
     and intent."provider_product_id" =
       provider_event."metadata" ->> 'provider_product_id'
     and intent."source_type" = 'watch_party_live'
     and intent."source_id" = offer."id"
     and intent."creator_id" = offer."creator_id"
     and intent."environment" = grant_row."environment"
     and intent."status" = 'consumed'
     and intent."consumed_at" is not null
     and intent."revoked_at" is null
     and intent."amount_minor" = offer."price_cents"
     and lower(intent."currency") = lower(offer."currency")
    join public."paid_watch_party_tickets" ticket
      on ticket."access_grant_id" = grant_row."id"
     and ticket."offer_id" = offer."id"
     and ticket."party_id" = offer."party_id"
     and ticket."buyer_id" = grant_row."user_id"
     and ticket."creator_id" = offer."creator_id"
     and ticket."host_id" = offer."host_id"
     and ticket."provider" = grant_row."provider"
     and ticket."provider_transaction_id" =
       provider_event."provider_event_id"
     and ticket."status" = 'active'
     and ticket."refunded_at" is null
     and ticket."revoked_at" is null
     and (ticket."expires_at" is null or ticket."expires_at" > v_now)
    join public."wave1_creator_eligibility" eligibility
      on eligibility."creator_user_id" = offer."creator_id"
     and eligibility."state" = 'VERIFIED'
     and eligibility."account_status" = 'ACTIVE'
     and eligibility."age_18_plus"
     and eligibility."legal_accepted"
     and eligibility."creator_role"
     and eligibility."moderation_state" = 'CLEAR'
     and eligibility."market" = 'UNITED_STATES'
     and eligibility."rollout_eligible"
     and eligibility."platform_capability"
     and eligibility."provider_eligible"
     and eligibility."kyc_complete"
     and eligibility."tax_complete"
     and eligibility."sanctions_clear"
     and eligibility."payout_eligible"
    where grant_row."user_id"::text = v_user_id
      and grant_row."grant_type" = 'watch_party_live_ticket'
      and grant_row."source_type" = 'provider_event'
      and grant_row."provider" in (
        'revenuecat_app_store', 'revenuecat_google_play', 'google_play'
      )
      and grant_row."environment" in ('sandbox', 'production')
      and grant_row."status" in ('active', 'sandbox_only')
      and grant_row."starts_at" <= v_now
      and (grant_row."expires_at" is null or grant_row."expires_at" > v_now)
      and grant_row."refunded_at" is null
      and grant_row."revoked_at" is null
      and offer."status" in ('sandbox', 'active', 'sold_out')
      and (offer."starts_at" is null or offer."starts_at" <= v_now)
      and (offer."ends_at" is null or offer."ends_at" > v_now)
      and provider_event."metadata" ->> 'provider_product_id' =
        intent."provider_product_id"
      and nullif(
        provider_event."metadata" ->> 'original_transaction_id',
        ''
      ) is not null
      and grant_row."metadata" -> 'viewer_access_only' = 'true'::jsonb
      and coalesce(
        grant_row."metadata" -> 'authority_granted',
        'false'::jsonb
      ) = 'false'::jsonb
      and coalesce(
        grant_row."metadata" -> 'speaker_authority',
        'false'::jsonb
      ) = 'false'::jsonb
      and coalesce(
        grant_row."metadata" -> 'moderator_authority',
        'false'::jsonb
      ) = 'false'::jsonb
      and coalesce(
        grant_row."metadata" -> 'payout_access',
        'false'::jsonb
      ) = 'false'::jsonb
      and coalesce(
        grant_row."metadata" -> 'premium_unlock',
        'false'::jsonb
      ) = 'false'::jsonb
      and ticket."metadata" -> 'viewer_access_only' = 'true'::jsonb
      and coalesce(
        ticket."metadata" -> 'grants_livekit_publish',
        'false'::jsonb
      ) = 'false'::jsonb
      and coalesce(
        ticket."metadata" -> 'grants_host_authority',
        'false'::jsonb
      ) = 'false'::jsonb
      and (
        (
          grant_row."provider" = 'revenuecat_app_store'
          and exists (
            select 1
            from public."revenuecat_consumable_transaction_intents" link
            where link."provider" = 'revenuecat_app_store'
              and link."original_transaction_id" =
                provider_event."metadata" ->> 'original_transaction_id'
              and link."user_id" = grant_row."user_id"
              and link."product_id" = grant_row."product_id"
              and link."purchase_intent_id" = intent."id"
              and link."provider_event_id" = provider_event."id"
          )
        )
        or (
          grant_row."provider" in ('revenuecat_google_play', 'google_play')
          and grant_row."metadata" ->> 'original_transaction_id' =
            provider_event."metadata" ->> 'original_transaction_id'
        )
      )
  );
end;
$$;

revoke all on function public."watch_party_room_self_access_allowed_internal"(
  text, text
) from public, anon, authenticated, service_role;

-- Service-only, schema-bound LiveKit resolver. Token issuance supplies the
-- exact live auth.sessions generation observed from the same bearer JWT. A
-- null generation is reserved for host-side enforcement of another exact
-- target and still evaluates all room/account/paid authority fail closed.
create or replace function public."resolve_watch_party_livekit_viewer_authority"(
  p_party_id text,
  p_user_id uuid,
  p_session_generation uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_party_id text := upper(btrim(coalesce(p_party_id, '')));
  v_now timestamptz := timezone('utc'::text, now());
  v_paid_required boolean := false;
  v_is_host boolean := false;
  v_allowed boolean := false;
  v_expires_at timestamptz;
  v_service_target_resolution boolean := p_session_generation is null
    and auth.role() = 'service_role';
begin
  select exists (
    select 1
    from public."paid_watch_party_offers" offer
    where offer."party_id" = v_party_id
      and offer."status" in (
        'sandbox', 'active', 'paused', 'sold_out', 'blocked'
      )
  ) into v_paid_required;
  select exists (
    select 1
    from public."watch_party_rooms" room
    where room."party_id" = v_party_id
      and room."host_user_id" = p_user_id
  ) into v_is_host;

  if p_user_id is null
    or v_party_id = ''
    or (
      not v_service_target_resolution
      and (
        p_session_generation is null
        or not exists (
          select 1
          from auth."sessions" session_row
          where session_row."id" = p_session_generation
            and session_row."user_id" = p_user_id
        )
      )
    )
    or public."is_account_access_restricted"(p_user_id::text)
  then
    return jsonb_build_object(
      'allowed', false,
      'paidSeatRequired', v_paid_required,
      'hostAuthority', v_is_host,
      'expiresAt', null,
      'reason', 'viewer_session_authority_invalid'
    );
  end if;

  v_allowed := public."watch_party_room_self_access_allowed_internal"(
    v_party_id,
    p_user_id::text
  );
  if not v_allowed then
    return jsonb_build_object(
      'allowed', false,
      'paidSeatRequired', v_paid_required,
      'hostAuthority', v_is_host,
      'expiresAt', null,
      'reason', case
        when v_paid_required and v_is_host
          then 'paid_room_host_creator_authority_required'
        when v_paid_required
          then 'exact_paid_seat_authority_required'
        else 'room_viewer_authority_required'
      end
    );
  end if;

  if not v_paid_required then
    return jsonb_build_object(
      'allowed', true,
      'paidSeatRequired', false,
      'hostAuthority', v_is_host,
      'expiresAt', null,
      'reason', case when v_is_host
        then 'non_seat_room_host_authority'
        else 'non_seat_room_authority'
      end
    );
  end if;

  if v_is_host then
    select least(
      coalesce(offer."ends_at", v_now + interval '30 seconds'),
      v_now + interval '30 seconds'
    ) into v_expires_at
    from public."paid_watch_party_offers" offer
    where offer."party_id" = v_party_id
      and offer."creator_id" = p_user_id
      and offer."host_id" = p_user_id
      and offer."status" in ('sandbox', 'active', 'sold_out')
      and (offer."starts_at" is null or offer."starts_at" <= v_now)
      and (offer."ends_at" is null or offer."ends_at" > v_now)
    order by offer."updated_at" desc
    limit 1;
    return jsonb_build_object(
      'allowed', true,
      'paidSeatRequired', true,
      'hostAuthority', true,
      'expiresAt', v_expires_at,
      'reason', 'paid_room_host_authority'
    );
  end if;

  select least(
    coalesce(ticket."expires_at", v_now + interval '30 seconds'),
    coalesce(grant_row."expires_at", v_now + interval '30 seconds'),
    coalesce(offer."ends_at", v_now + interval '30 seconds'),
    v_now + interval '30 seconds'
  ) into v_expires_at
  from public."paid_watch_party_tickets" ticket
  join public."access_grants" grant_row
    on grant_row."id" = ticket."access_grant_id"
   and grant_row."user_id" = p_user_id
   and grant_row."source_id" = ticket."offer_id"
   and grant_row."status" in ('active', 'sandbox_only')
   and grant_row."refunded_at" is null
   and grant_row."revoked_at" is null
  join public."paid_watch_party_offers" offer
    on offer."id" = ticket."offer_id"
   and offer."party_id" = v_party_id
  where ticket."buyer_id" = p_user_id
    and ticket."party_id" = v_party_id
    and ticket."status" = 'active'
    and ticket."refunded_at" is null
    and ticket."revoked_at" is null
    and (ticket."expires_at" is null or ticket."expires_at" > v_now)
  order by ticket."created_at" desc
  limit 1;
  v_expires_at := least(
    coalesce(v_expires_at, v_now + interval '30 seconds'),
    v_now + interval '30 seconds'
  );
  return jsonb_build_object(
    'allowed', true,
    'paidSeatRequired', true,
    'hostAuthority', false,
    'expiresAt', v_expires_at,
    'reason', 'exact_paid_seat_viewer_authority'
  );
end;
$$;

revoke all on function public."resolve_watch_party_livekit_viewer_authority"(
  text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public."resolve_watch_party_livekit_viewer_authority"(
  text, uuid, uuid
) to service_role;

comment on function public."resolve_watch_party_livekit_viewer_authority"(
  text, uuid, uuid
) is
  'Service-only exact room-viewer authority: token issuance binds one current auth session; null-session target checks are reserved for host enforcement and still require exact current room authority. Paid tickets are viewer/listener only and the response never grants publish, host, admin, Premium, creator-money, or payout authority.';

-- Watch-Party membership identity and publish authority are never writable
-- client claims. Existing non-host authority is downgraded once at cutover;
-- a host can re-approve a speaker through the bounded RPC below.
alter table public."watch_party_room_memberships"
  add column if not exists "host_muted" boolean not null default false,
  add column if not exists "self_muted" boolean not null default false;

alter table public."watch_party_room_memberships"
  disable trigger "enforce_watch_party_room_membership_block_guard";
update public."watch_party_room_memberships" membership
set
  "role" = 'viewer',
  "stage_role" = 'listener',
  "can_speak" = false,
  "host_muted" = membership."is_muted",
  "self_muted" = false,
  "camera_enabled" = false,
  "mic_enabled" = false,
  "updated_at" = timezone('utc'::text, now())
from public."watch_party_rooms" room
where room."party_id" = membership."party_id"
  and membership."user_id" <> room."host_user_id"::text;
update public."watch_party_room_memberships" membership
set
  "role" = 'host',
  "stage_role" = 'host',
  "can_speak" = true,
  "host_muted" = false,
  "self_muted" = membership."is_muted",
  "updated_at" = timezone('utc'::text, now())
from public."watch_party_rooms" room
where room."party_id" = membership."party_id"
  and membership."user_id" = room."host_user_id"::text;

-- Existing non-host presence admitted before a paid offer became authoritative
-- is not carried forward. Exact current ticket holders remain present but are
-- normalized to viewer/listener; everyone else must re-enter after proof.
update public."watch_party_room_memberships" membership
set
  "role" = 'viewer',
  "stage_role" = 'listener',
  "can_speak" = false,
  "host_muted" = false,
  "camera_enabled" = false,
  "mic_enabled" = false,
  "membership_state" = case
    when public."watch_party_room_self_access_allowed_internal"(
      membership."party_id",
      membership."user_id"
    ) then membership."membership_state"
    else 'removed'
  end,
  "left_at" = case
    when public."watch_party_room_self_access_allowed_internal"(
      membership."party_id",
      membership."user_id"
    ) then membership."left_at"
    else coalesce(
      membership."left_at",
      timezone('utc'::text, now())
    )
  end,
  "updated_at" = timezone('utc'::text, now())
from public."watch_party_rooms" room
where room."party_id" = membership."party_id"
  and membership."user_id" <> room."host_user_id"::text
  and membership."membership_state" in ('active', 'reconnecting')
  and exists (
    select 1
    from public."paid_watch_party_offers" offer
    where offer."party_id" = room."party_id"
      and offer."status" in (
        'sandbox', 'active', 'paused', 'sold_out', 'blocked'
      )
  );
alter table public."watch_party_room_memberships"
  enable trigger "enforce_watch_party_room_membership_block_guard";

create or replace function public."enforce_watch_party_membership_identity"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host_user_id text;
  v_paid_ticket_required boolean := false;
  v_server_transition boolean :=
    coalesce(current_setting('app.watch_party_membership_authority', true), '') = 'server';
  v_configured_role text := nullif(current_setting('role', true), '');
  v_request_role text := nullif(auth.jwt() ->> 'role', '');
  v_service_transition boolean := false;
begin
  v_service_transition :=
    coalesce(v_configured_role, session_user::text) = 'service_role'
    and v_request_role = 'service_role';

  if tg_op = 'UPDATE' then
    if new."party_id" is distinct from old."party_id"
      or new."user_id" is distinct from old."user_id"
      or new."joined_at" is distinct from old."joined_at"
    then
      raise exception 'watch_party_membership_identity_immutable';
    end if;
    if old."membership_state" = 'removed'
      and new."membership_state" <> 'removed'
    then
      raise exception 'watch_party_membership_removed';
    end if;
    if (
      new."role" is distinct from old."role"
      or new."stage_role" is distinct from old."stage_role"
      or new."can_speak" is distinct from old."can_speak"
      or new."host_muted" is distinct from old."host_muted"
      or new."self_muted" is distinct from old."self_muted"
      or new."membership_state" is distinct from old."membership_state"
    ) and not v_server_transition and not v_service_transition then
      raise exception 'watch_party_membership_authority_rpc_required';
    end if;
  end if;

  select room."host_user_id"::text into v_host_user_id
  from public."watch_party_rooms" room
  where room."party_id" = new."party_id";

  if v_host_user_id is null then
    raise exception 'watch_party_room_unavailable';
  end if;
  select exists (
    select 1
    from public."paid_watch_party_offers" offer
    where offer."party_id" = new."party_id"
      and offer."status" in (
        'sandbox', 'active', 'paused', 'sold_out', 'blocked'
      )
  ) into v_paid_ticket_required;
  if new."membership_state" in ('active', 'reconnecting')
    and not public."watch_party_room_self_access_allowed_internal"(
      new."party_id",
      new."user_id"
    )
  then
    raise exception 'watch_party_membership_access_required';
  end if;
  if new."user_id" = v_host_user_id then
    if new."role" <> 'host'
      or new."stage_role" <> 'host'
      or not new."can_speak"
      or new."host_muted"
    then
      raise exception 'watch_party_host_authority_invalid';
    end if;
  elsif new."role" <> 'viewer'
    or new."stage_role" not in ('listener', 'speaker')
    or new."can_speak" is distinct from (new."stage_role" = 'speaker')
  then
    raise exception 'watch_party_viewer_authority_invalid';
  end if;
  if v_paid_ticket_required
    and new."user_id" <> v_host_user_id
    and (
      new."role" <> 'viewer'
      or new."stage_role" <> 'listener'
      or new."can_speak"
      or new."camera_enabled"
      or new."mic_enabled"
    )
  then
    raise exception 'paid_watch_party_viewer_only';
  end if;

  new."is_muted" := new."host_muted" or new."self_muted";
  if new."membership_state" not in ('active', 'reconnecting', 'left', 'removed') then
    raise exception 'watch_party_membership_state_invalid';
  end if;
  if new."membership_state" in ('left', 'removed')
    or new."is_muted"
    or not new."can_speak"
  then
    new."camera_enabled" := false;
    new."mic_enabled" := false;
  end if;

  return new;
end;
$$;

revoke all on function public."enforce_watch_party_membership_identity"()
  from public, anon, authenticated;

drop trigger if exists "enforce_watch_party_membership_identity"
  on public."watch_party_room_memberships";
create trigger "enforce_watch_party_membership_identity"
before insert or update on public."watch_party_room_memberships"
for each row execute function public."enforce_watch_party_membership_identity"();

drop policy if exists "watch_party_room_memberships_self_insert_policy"
  on public."watch_party_room_memberships";
drop policy if exists "watch_party_room_memberships_self_update_policy"
  on public."watch_party_room_memberships";
drop policy if exists "watch_party_room_memberships_host_update_policy"
  on public."watch_party_room_memberships";
revoke insert, update on table public."watch_party_room_memberships"
  from anon, authenticated;

-- Joining is serialized by room/user and derives all membership and speaker
-- fields. A new paid/Seat-Pass member is always viewer/listener only.
create or replace function public."join_watch_party_room_session"(
  p_party_id text,
  p_display_name text default null,
  p_avatar_url text default null,
  p_camera_preview_url text default null,
  p_camera_enabled boolean default false,
  p_mic_enabled boolean default true,
  p_self_muted boolean default null
)
returns setof public."watch_party_room_memberships"
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := nullif(auth.uid()::text, '');
  v_party_id text := upper(btrim(coalesce(p_party_id, '')));
  v_room public."watch_party_rooms"%rowtype;
  v_existing public."watch_party_room_memberships"%rowtype;
  v_membership public."watch_party_room_memberships"%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_is_host boolean := false;
  v_stage_role text := 'listener';
  v_can_speak boolean := false;
  v_host_muted boolean := false;
  v_self_muted boolean := false;
  v_can_publish boolean := false;
  v_entitled boolean := false;
  v_paid_ticket_required boolean := false;
begin
  if v_actor_user_id is null then
    raise exception 'watch_party_authentication_required';
  end if;
  if not public."whole_app_exact_current_session_authority_internal"() then
    raise exception 'watch_party_current_session_required';
  end if;
  if v_party_id = '' then
    raise exception 'watch_party_room_identity_required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('watch-party-member:' || v_party_id || ':' || v_actor_user_id, 0)
  );
  perform public."assert_account_private_feature_allowed"(
    v_actor_user_id,
    'watch_party_room_membership'
  );

  select room.* into v_room
  from public."watch_party_rooms" room
  where room."party_id" = v_party_id
  for update;
  if v_room."party_id" is null or not coalesce(v_room."is_active", false) then
    raise exception 'watch_party_room_unavailable';
  end if;
  if public."watch_party_room_actor_blocked_by_host"(
    v_party_id,
    v_actor_user_id
  ) then
    raise exception 'blocked_from_room';
  end if;

  select membership.* into v_existing
  from public."watch_party_room_memberships" membership
  where membership."party_id" = v_party_id
    and membership."user_id" = v_actor_user_id
  for update;
  if v_existing."membership_state" = 'removed' then
    raise exception 'watch_party_membership_removed';
  end if;

  v_is_host := v_actor_user_id = v_room."host_user_id"::text;
  if not v_is_host
    and v_room."join_policy" <> 'open'
    and v_existing."user_id" is null
  then
    raise exception 'watch_party_room_locked';
  end if;

  select exists (
    select 1
    from public."paid_watch_party_offers" offer
    where offer."party_id" = v_party_id
      and offer."status" in (
        'sandbox', 'active', 'paused', 'sold_out', 'blocked'
      )
  ) into v_paid_ticket_required;
  v_entitled := public."watch_party_room_self_access_allowed_internal"(
    v_party_id,
    v_actor_user_id
  );
  if not v_entitled then
    raise exception 'watch_party_room_entitlement_required';
  end if;

  if v_is_host then
    v_stage_role := 'host';
    v_can_speak := true;
  elsif not v_paid_ticket_required
    and v_existing."membership_state" in ('active', 'reconnecting')
    and v_existing."last_seen_at" >= v_now - interval '45 seconds'
    and v_existing."role" = 'viewer'
    and v_existing."stage_role" = 'speaker'
    and v_existing."can_speak"
  then
    v_stage_role := 'speaker';
    v_can_speak := true;
  end if;
  v_host_muted := coalesce(v_existing."host_muted", false) and not v_is_host;
  v_self_muted := coalesce(
    p_self_muted,
    v_existing."self_muted",
    false
  );
  v_can_publish := v_can_speak
    and (v_is_host or not v_paid_ticket_required)
    and not v_host_muted
    and not v_self_muted;

  perform set_config('app.watch_party_membership_authority', 'server', true);
  insert into public."watch_party_room_memberships" (
    "party_id", "user_id", "role", "stage_role", "can_speak",
    "is_muted", "host_muted", "self_muted", "membership_state",
    "camera_enabled", "mic_enabled", "display_name", "avatar_url",
    "camera_preview_url", "joined_at", "last_seen_at", "left_at",
    "updated_at"
  ) values (
    v_party_id,
    v_actor_user_id,
    case when v_is_host then 'host' else 'viewer' end,
    v_stage_role,
    v_can_speak,
    v_host_muted or v_self_muted,
    v_host_muted,
    v_self_muted,
    'active',
    v_can_publish and coalesce(p_camera_enabled, false),
    v_can_publish and coalesce(p_mic_enabled, true),
    nullif(left(btrim(coalesce(p_display_name, '')), 160), ''),
    nullif(left(btrim(coalesce(p_avatar_url, '')), 2048), ''),
    nullif(left(btrim(coalesce(p_camera_preview_url, '')), 2048), ''),
    v_now,
    v_now,
    null,
    v_now
  )
  on conflict on constraint "watch_party_room_memberships_pkey" do update
  set
    "role" = excluded."role",
    "stage_role" = excluded."stage_role",
    "can_speak" = excluded."can_speak",
    "is_muted" = excluded."is_muted",
    "host_muted" = excluded."host_muted",
    "self_muted" = excluded."self_muted",
    "membership_state" = 'active',
    "camera_enabled" = excluded."camera_enabled",
    "mic_enabled" = excluded."mic_enabled",
    "display_name" = excluded."display_name",
    "avatar_url" = excluded."avatar_url",
    "camera_preview_url" = excluded."camera_preview_url",
    "joined_at" = case
      when public."watch_party_room_memberships"."membership_state" = 'left'
        then excluded."joined_at"
      else public."watch_party_room_memberships"."joined_at"
    end,
    "last_seen_at" = excluded."last_seen_at",
    "left_at" = null,
    "updated_at" = excluded."updated_at"
  returning * into v_membership;

  return next v_membership;
end;
$$;

revoke all on function public."join_watch_party_room_session"(
  text, text, text, text, boolean, boolean, boolean
) from public, anon, service_role;
grant execute on function public."join_watch_party_room_session"(
  text, text, text, text, boolean, boolean, boolean
) to authenticated;

-- Heartbeat/media preference updates preserve server/host authority and use
-- the database clock. They cannot reparent, promote, or unremove membership.
create or replace function public."heartbeat_watch_party_room_session"(
  p_party_id text,
  p_membership_state text default 'active',
  p_camera_enabled boolean default false,
  p_mic_enabled boolean default true,
  p_self_muted boolean default null,
  p_display_name text default null,
  p_avatar_url text default null,
  p_camera_preview_url text default null
)
returns setof public."watch_party_room_memberships"
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := nullif(auth.uid()::text, '');
  v_party_id text := upper(btrim(coalesce(p_party_id, '')));
  v_state text := lower(btrim(coalesce(p_membership_state, 'active')));
  v_room public."watch_party_rooms"%rowtype;
  v_membership public."watch_party_room_memberships"%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_can_publish boolean := false;
  v_entitled boolean := false;
  v_self_muted boolean := false;
  v_is_host boolean := false;
  v_paid_ticket_required boolean := false;
begin
  if v_actor_user_id is null then
    raise exception 'watch_party_authentication_required';
  end if;
  if not public."whole_app_exact_current_session_authority_internal"() then
    raise exception 'watch_party_current_session_required';
  end if;
  if v_state not in ('active', 'reconnecting', 'left') then
    raise exception 'watch_party_membership_state_invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('watch-party-member:' || v_party_id || ':' || v_actor_user_id, 0)
  );
  select room.* into v_room
  from public."watch_party_rooms" room
  where room."party_id" = v_party_id;
  select membership.* into v_membership
  from public."watch_party_room_memberships" membership
  where membership."party_id" = v_party_id
    and membership."user_id" = v_actor_user_id
  for update;

  if v_room."party_id" is null or v_membership."user_id" is null then
    raise exception 'watch_party_membership_unavailable';
  end if;
  v_is_host := v_actor_user_id = v_room."host_user_id"::text;
  select exists (
    select 1
    from public."paid_watch_party_offers" offer
    where offer."party_id" = v_party_id
      and offer."status" in (
        'sandbox', 'active', 'paused', 'sold_out', 'blocked'
      )
  ) into v_paid_ticket_required;
  if v_membership."membership_state" in ('left', 'removed')
    and v_state <> 'left'
  then
    raise exception 'watch_party_join_rpc_required';
  end if;
  if v_state <> 'left' then
    perform public."assert_account_private_feature_allowed"(
      v_actor_user_id,
      'watch_party_room_membership'
    );
    if not coalesce(v_room."is_active", false)
      or public."watch_party_room_actor_blocked_by_host"(
        v_party_id,
        v_actor_user_id
      )
    then
      raise exception 'watch_party_room_unavailable';
    end if;

    v_entitled := public."watch_party_room_self_access_allowed_internal"(
      v_party_id,
      v_actor_user_id
    );
    if not v_entitled then
      raise exception 'watch_party_room_entitlement_required';
    end if;
  end if;

  v_self_muted := coalesce(
    p_self_muted,
    v_membership."self_muted",
    false
  );
  v_can_publish := v_state in ('active', 'reconnecting')
    and v_membership."can_speak"
    and (v_is_host or not v_paid_ticket_required)
    and not v_membership."host_muted"
    and not v_self_muted;
  perform set_config('app.watch_party_membership_authority', 'server', true);
  update public."watch_party_room_memberships" membership
  set
    "role" = case
      when v_is_host then 'host'
      else 'viewer'
    end,
    "stage_role" = case
      when v_is_host then 'host'
      when v_paid_ticket_required then 'listener'
      else membership."stage_role"
    end,
    "can_speak" = case
      when v_is_host then true
      when v_paid_ticket_required then false
      else membership."can_speak"
    end,
    "membership_state" = v_state,
    "self_muted" = v_self_muted,
    "is_muted" = membership."host_muted" or v_self_muted,
    "camera_enabled" = v_can_publish and coalesce(p_camera_enabled, false),
    "mic_enabled" = v_can_publish and coalesce(p_mic_enabled, true),
    "display_name" = coalesce(
      nullif(left(btrim(coalesce(p_display_name, '')), 160), ''),
      membership."display_name"
    ),
    "avatar_url" = coalesce(
      nullif(left(btrim(coalesce(p_avatar_url, '')), 2048), ''),
      membership."avatar_url"
    ),
    "camera_preview_url" = coalesce(
      nullif(left(btrim(coalesce(p_camera_preview_url, '')), 2048), ''),
      membership."camera_preview_url"
    ),
    "last_seen_at" = v_now,
    "left_at" = case when v_state = 'left' then v_now else null end,
    "updated_at" = v_now
  where membership."party_id" = v_party_id
    and membership."user_id" = v_actor_user_id
  returning * into v_membership;

  return next v_membership;
end;
$$;

revoke all on function public."heartbeat_watch_party_room_session"(
  text, text, boolean, boolean, boolean, text, text, text
) from public, anon, service_role;
grant execute on function public."heartbeat_watch_party_room_session"(
  text, text, boolean, boolean, boolean, text, text, text
) to authenticated;

-- Only the exact room host may transition an existing non-host member's
-- listener/speaker/removal authority. A removed row is terminal.
create or replace function public."set_watch_party_participant_authority"(
  p_party_id text,
  p_target_user_id text,
  p_stage_role text default 'listener',
  p_host_muted boolean default false,
  p_membership_state text default 'active'
)
returns setof public."watch_party_room_memberships"
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := nullif(auth.uid()::text, '');
  v_party_id text := upper(btrim(coalesce(p_party_id, '')));
  v_target_user_id text := nullif(btrim(coalesce(p_target_user_id, '')), '');
  v_stage_role text := lower(btrim(coalesce(p_stage_role, 'listener')));
  v_state text := lower(btrim(coalesce(p_membership_state, 'active')));
  v_room public."watch_party_rooms"%rowtype;
  v_membership public."watch_party_room_memberships"%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_paid_ticket_required boolean := false;
begin
  if v_actor_user_id is null or v_target_user_id is null then
    raise exception 'watch_party_authentication_required';
  end if;
  if not public."whole_app_exact_current_session_authority_internal"() then
    raise exception 'watch_party_current_session_required';
  end if;
  if v_stage_role not in ('listener', 'speaker')
    or v_state not in ('active', 'reconnecting', 'removed')
  then
    raise exception 'watch_party_participant_authority_invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('watch-party-member:' || v_party_id || ':' || v_target_user_id, 0)
  );
  select room.* into v_room
  from public."watch_party_rooms" room
  where room."party_id" = v_party_id
  for update;
  if v_room."party_id" is null
    or v_room."host_user_id"::text <> v_actor_user_id
    or v_target_user_id = v_actor_user_id
  then
    raise exception 'watch_party_host_authority_required';
  end if;

  select membership.* into v_membership
  from public."watch_party_room_memberships" membership
  where membership."party_id" = v_party_id
    and membership."user_id" = v_target_user_id
  for update;
  if v_membership."user_id" is null
    or v_membership."membership_state" in ('left', 'removed')
  then
    raise exception 'watch_party_membership_unavailable';
  end if;
  select exists (
    select 1
    from public."paid_watch_party_offers" offer
    where offer."party_id" = v_party_id
      and offer."status" in (
        'sandbox', 'active', 'paused', 'sold_out', 'blocked'
      )
  ) into v_paid_ticket_required;
  if v_paid_ticket_required
    and v_state <> 'removed'
    and v_stage_role <> 'listener'
  then
    raise exception 'paid_watch_party_viewer_only';
  end if;
  if v_state <> 'removed' then
    perform public."assert_account_private_feature_allowed"(
      v_target_user_id,
      'watch_party_room_membership'
    );
    if not public."watch_party_room_self_access_allowed_internal"(
      v_party_id,
      v_target_user_id
    ) then
      raise exception 'watch_party_membership_access_required';
    end if;
  end if;

  perform set_config('app.watch_party_membership_authority', 'server', true);
  update public."watch_party_room_memberships" membership
  set
    "role" = 'viewer',
    "stage_role" = case
      when v_state = 'removed' or v_paid_ticket_required then 'listener'
      else v_stage_role
    end,
    "can_speak" = v_state <> 'removed'
      and not v_paid_ticket_required
      and v_stage_role = 'speaker',
    "host_muted" = coalesce(p_host_muted, false),
    "is_muted" = coalesce(p_host_muted, false) or membership."self_muted",
    "membership_state" = v_state,
    "camera_enabled" = case
      when v_state <> 'removed'
        and not v_paid_ticket_required
        and v_stage_role = 'speaker'
        and not coalesce(p_host_muted, false)
        and not membership."self_muted"
      then membership."camera_enabled"
      else false
    end,
    "mic_enabled" = case
      when v_state <> 'removed'
        and not v_paid_ticket_required
        and v_stage_role = 'speaker'
        and not coalesce(p_host_muted, false)
        and not membership."self_muted"
      then membership."mic_enabled"
      else false
    end,
    "left_at" = case when v_state = 'removed' then v_now else null end,
    "updated_at" = v_now
  where membership."party_id" = v_party_id
    and membership."user_id" = v_target_user_id
  returning * into v_membership;

  return next v_membership;
end;
$$;

revoke all on function public."set_watch_party_participant_authority"(
  text, text, text, boolean, text
) from public, anon, service_role;
grant execute on function public."set_watch_party_participant_authority"(
  text, text, text, boolean, text
) to authenticated;

-- Refund/revocation/expiration is terminal room authority. Remove the exact
-- same-party non-host presence in the provider transaction so stale client or
-- Realtime state cannot keep it alive.
create or replace function public."remove_terminal_paid_watch_party_membership"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_party_id text;
begin
  if new."grant_type" <> 'watch_party_live_ticket'
    or new."source_id" is null
    or not (
      new."status" in ('refunded', 'revoked', 'expired', 'blocked')
      or new."refunded_at" is not null
      or new."revoked_at" is not null
      or (
        new."expires_at" is not null
        and new."expires_at" <= timezone('utc'::text, now())
      )
    )
  then
    return new;
  end if;

  select offer."party_id" into v_party_id
  from public."paid_watch_party_offers" offer
  where offer."id" = new."source_id"
    and offer."creator_id" is not null
    and offer."host_id" is not null;
  if v_party_id is null then
    return new;
  end if;

  perform set_config('app.watch_party_membership_authority', 'server', true);
  update public."watch_party_room_memberships" membership
  set
    "role" = 'viewer',
    "stage_role" = 'listener',
    "can_speak" = false,
    "camera_enabled" = false,
    "mic_enabled" = false,
    "membership_state" = 'removed',
    "left_at" = coalesce(
      membership."left_at",
      timezone('utc'::text, now())
    ),
    "updated_at" = timezone('utc'::text, now())
  from public."watch_party_rooms" room
  where membership."party_id" = v_party_id
    and membership."user_id" = new."user_id"::text
    and membership."membership_state" in ('active', 'reconnecting')
    and room."party_id" = membership."party_id"
    and room."host_user_id"::text <> membership."user_id";
  return new;
end;
$$;

revoke all on function public."remove_terminal_paid_watch_party_membership"()
  from public, anon, authenticated, service_role;
drop trigger if exists "remove_terminal_paid_watch_party_membership"
  on public."access_grants";
create trigger "remove_terminal_paid_watch_party_membership"
after update of "status", "refunded_at", "revoked_at", "expires_at"
on public."access_grants"
for each row execute function
  public."remove_terminal_paid_watch_party_membership"();

-- A source-less Live Stage is creator authority, not a Premium/navigation
-- claim. Require the complete current verified creator eligibility row.
create or replace function public."enforce_watch_party_live_creator_eligibility"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'authenticated'
    and not public."whole_app_exact_current_session_authority_internal"()
  then
    raise exception using
      errcode = '28000',
      message = 'watch_party_current_session_required';
  end if;
  if new."room_type" = 'live' and not exists (
    select 1
    from public."wave1_creator_eligibility" eligibility
    where eligibility."creator_user_id" = new."host_user_id"
      and eligibility."state" = 'VERIFIED'
      and eligibility."account_status" = 'ACTIVE'
      and eligibility."age_18_plus"
      and eligibility."legal_accepted"
      and eligibility."creator_role"
      and eligibility."moderation_state" = 'CLEAR'
      and eligibility."market" = 'UNITED_STATES'
      and eligibility."rollout_eligible"
      and eligibility."platform_capability"
      and eligibility."provider_eligible"
      and eligibility."kyc_complete"
      and eligibility."tax_complete"
      and eligibility."sanctions_clear"
      and eligibility."payout_eligible"
  ) then
    raise exception using errcode = '42501', message = 'creator_eligibility_required';
  end if;
  return new;
end;
$$;

revoke all on function public."enforce_watch_party_live_creator_eligibility"()
  from public, anon, authenticated, service_role;
drop trigger if exists "enforce_watch_party_live_creator_eligibility"
  on public."watch_party_rooms";
create trigger "enforce_watch_party_live_creator_eligibility"
before insert or update of "room_type", "host_user_id"
on public."watch_party_rooms"
for each row execute function public."enforce_watch_party_live_creator_eligibility"();

-- Sensitive Watch-Party child rows are visible only to the host or a fresh,
-- active/reconnecting exact member. The room row remains discoverable through
-- its existing authenticated policy so a signed-in user can evaluate/join it.
create or replace function public."can_read_watch_party_room_authority"(
  p_party_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select nullif(auth.uid()::text, '') as user_id
  ),
  room_scope as (
    select
      room."party_id",
      room."host_user_id"::text as host_user_id
    from public."watch_party_rooms" room
    where room."party_id" = upper(btrim(coalesce(p_party_id, '')))
  )
  select coalesce((
    select
      actor.user_id is not null
      and public."watch_party_room_self_access_allowed_internal"(
        room_scope."party_id",
        actor.user_id
      )
      and (
        actor.user_id = room_scope.host_user_id
        or exists (
          select 1
          from public."watch_party_room_memberships" membership
          where membership."party_id" = room_scope."party_id"
            and membership."user_id" = actor.user_id
            and membership."membership_state" in ('active', 'reconnecting')
            and membership."last_seen_at" >=
              timezone('utc'::text, now()) - interval '45 seconds'
        )
      )
    from actor
    join room_scope on true
  ), false);
$$;

revoke all on function public."can_read_watch_party_room_authority"(text)
  from public, anon;
grant execute on function public."can_read_watch_party_room_authority"(text)
  to authenticated, service_role;

drop policy if exists "watch_party_room_memberships_select_policy"
  on public."watch_party_room_memberships";
create policy "watch_party_room_memberships_select_policy"
  on public."watch_party_room_memberships"
  for select
  to authenticated
  using (public."can_read_watch_party_room_authority"("party_id"));

drop policy if exists "watch_party_room_messages_select_policy"
  on public."watch_party_room_messages";
create policy "watch_party_room_messages_select_policy"
  on public."watch_party_room_messages"
  for select
  to authenticated
  using (public."can_read_watch_party_room_authority"("party_id"));

drop policy if exists "watch_party_room_messages_insert_policy"
  on public."watch_party_room_messages";
create policy "watch_party_room_messages_insert_policy"
  on public."watch_party_room_messages"
  for insert
  to authenticated
  with check (
    "user_id" = auth.uid()::text
    and public."can_read_watch_party_room_authority"("party_id")
  );

drop policy if exists "watch_party_sync_events_authenticated_select"
  on public."watch_party_sync_events";
drop policy if exists "watch_party_sync_events_select_policy"
  on public."watch_party_sync_events";
create policy "watch_party_sync_events_select_policy"
  on public."watch_party_sync_events"
  for select
  to authenticated
  using (public."can_read_watch_party_room_authority"("party_id"));

drop policy if exists "watch_party_sync_events_insert_policy"
  on public."watch_party_sync_events";
drop policy if exists "watch_party_sync_events_owner_insert"
  on public."watch_party_sync_events";
create policy "watch_party_sync_events_insert_policy"
  on public."watch_party_sync_events"
  for insert
  to authenticated
  with check (
    "user_id" = auth.uid()
    and public."can_read_watch_party_room_authority"("party_id")
  );

revoke select, insert, update, delete on table
  public."watch_party_room_memberships",
  public."watch_party_room_messages",
  public."watch_party_sync_events"
from anon;

-- Communication room rows and participant lists use one exact authority gate.
-- A linked Watch-Party room also requires the corresponding Watch-Party gate;
-- an attached chat call also requires the canonical two-party chat gate.
create or replace function public."can_read_communication_room_authority"(
  p_room_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select nullif(auth.uid()::text, '') as user_id
  ),
  room_scope as (
    select
      room."room_id",
      room."host_user_id",
      room."linked_party_id",
      room."status"
    from public."communication_rooms" room
    where room."room_id" = upper(btrim(coalesce(p_room_id, '')))
  ),
  attached_thread as (
    select
      min(thread."id"::text)::uuid as thread_id,
      count(*)::integer as thread_count
    from public."chat_threads" thread
    join room_scope
      on thread."active_communication_room_id" = room_scope."room_id"
  )
  select coalesce((
    select
      actor.user_id is not null
      and public."whole_app_exact_current_session_authority_internal"()
      and not public."is_account_access_restricted"(actor.user_id)
      and room_scope."status" = 'active'
      and (
        actor.user_id = room_scope."host_user_id"
        or exists (
          select 1
          from public."communication_room_memberships" membership
          where membership."room_id" = room_scope."room_id"
            and membership."user_id" = actor.user_id
            and membership."membership_state" in ('active', 'reconnecting')
            and membership."last_seen_at" >=
              timezone('utc'::text, now()) - interval '45 seconds'
            and membership."role" = case
              when actor.user_id = room_scope."host_user_id" then 'host'
              else 'participant'
            end
        )
      )
      and (
        room_scope."linked_party_id" is null
        or public."can_read_watch_party_room_authority"(
          room_scope."linked_party_id"
        )
      )
      and (
        (select attached_thread.thread_count from attached_thread) = 0
        or (
          (select attached_thread.thread_count from attached_thread) = 1
          and public."can_access_chat_thread"(
            (select attached_thread.thread_id from attached_thread)
          )
          and exists (
            select 1
            from public."chat_call_invites" invite
            where invite."thread_id" =
              (select attached_thread.thread_id from attached_thread)
              and invite."communication_room_id" = room_scope."room_id"
              and (
                (
                  invite."status" = 'ringing'
                  and invite."expires_at" > timezone('utc'::text, now())
                )
                or (
                  invite."status" = 'accepted'
                  and invite."accepted_at" is not null
                  and invite."ended_at" is null
                )
              )
              and actor.user_id in (
                invite."caller_user_id",
                invite."callee_user_id"
              )
          )
        )
      )
    from actor
    join room_scope on true
  ), false);
$$;

revoke all on function public."can_read_communication_room_authority"(text)
  from public, anon;
grant execute on function public."can_read_communication_room_authority"(text)
  to authenticated, service_role;

drop policy if exists "communication_rooms_select_policy"
  on public."communication_rooms";
create policy "communication_rooms_select_policy"
  on public."communication_rooms"
  for select
  to authenticated
  using (public."can_read_communication_room_authority"("room_id"));

drop policy if exists "communication_rooms_insert_policy"
  on public."communication_rooms";
create policy "communication_rooms_insert_policy"
  on public."communication_rooms"
  for insert
  to authenticated
  with check (
    "host_user_id" = auth.uid()::text
    and public."whole_app_exact_current_session_authority"()
    and not public."is_account_access_restricted"(auth.uid()::text)
    and "room_id" = upper(btrim("room_id"))
    and "room_code" = "room_id"
    and "status" = 'active'
    and (
      (
        "linked_party_id" is null
        and "linked_room_code" is null
        and "linked_room_mode" is null
      )
      or exists (
        select 1
        from public."watch_party_rooms" linked_party
        where linked_party."party_id" = "communication_rooms"."linked_party_id"
          and linked_party."party_id" = "communication_rooms"."linked_room_code"
          and linked_party."host_user_id"::text = auth.uid()::text
          and linked_party."is_active"
          and public."can_read_watch_party_room_authority"(
            linked_party."party_id"
          )
      )
    )
  );

-- An authenticated host can end or heartbeat only the exact room they
-- created. Room identity, linked-party authority, and access/capture policy
-- cannot be rewritten after admission, and an ended room is terminal.
create or replace function public."enforce_communication_room_identity"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_configured_role text := coalesce(
    nullif(current_setting('role', true), ''),
    session_user::text
  );
  v_request_role text := coalesce(
    nullif(auth.jwt() ->> 'role', ''),
    v_configured_role,
    session_user::text
  );
  v_service_transition boolean := v_configured_role = 'service_role'
    or (
      v_configured_role not in ('authenticated', 'anon')
      and session_user::text in ('postgres', 'supabase_admin')
    );
  v_now timestamptz := timezone('utc'::text, now());
begin
  -- Identity and terminal state are invariant even for internal lifecycle
  -- writers. A maintenance repair must create a successor migration instead
  -- of silently reparenting or reopening a live-media authority row.
  if tg_op = 'UPDATE' then
    if new."room_id" is distinct from old."room_id"
      or new."room_code" is distinct from old."room_code"
      or new."host_user_id" is distinct from old."host_user_id"
      or new."created_at" is distinct from old."created_at"
      or new."linked_party_id" is distinct from old."linked_party_id"
      or new."linked_room_code" is distinct from old."linked_room_code"
      or new."linked_room_mode" is distinct from old."linked_room_mode"
      or new."content_access_rule" is distinct from old."content_access_rule"
      or new."capture_policy" is distinct from old."capture_policy"
    then
      raise exception 'communication_room_identity_immutable';
    end if;
    if old."status" = 'ended' and new."status" <> 'ended' then
      raise exception 'communication_room_ended';
    end if;
  end if;

  if v_service_transition then
    return new;
  end if;

  if v_request_role <> 'authenticated'
    or auth.uid() is null
    or new."host_user_id" <> auth.uid()::text
    or not public."whole_app_exact_current_session_authority_internal"()
  then
    raise exception 'communication_room_current_session_required';
  end if;

  if tg_op = 'INSERT' then
    if new."room_id" <> upper(btrim(new."room_id"))
      or new."room_code" <> new."room_id"
      or new."status" <> 'active'
    then
      raise exception 'communication_room_identity_invalid';
    end if;
    if (
      new."linked_party_id" is null
      and (
        new."linked_room_code" is not null
        or new."linked_room_mode" is not null
      )
    ) or (
      new."linked_party_id" is not null
      and not exists (
        select 1
        from public."watch_party_rooms" linked_party
        where linked_party."party_id" = new."linked_party_id"
          and linked_party."party_id" = new."linked_room_code"
          and linked_party."host_user_id"::text = auth.uid()::text
          and linked_party."is_active"
          and public."watch_party_room_self_access_allowed_internal"(
            linked_party."party_id",
            auth.uid()::text
          )
      )
    ) then
      raise exception 'communication_room_linked_host_authority_required';
    end if;
    -- Creation timestamps are server observations, never client authority.
    new."created_at" := v_now;
    new."updated_at" := v_now;
    new."last_activity_at" := v_now;
    return new;
  end if;

  new."updated_at" := v_now;
  if new."last_activity_at" is distinct from old."last_activity_at"
    or new."status" = 'ended'
  then
    new."last_activity_at" := v_now;
  end if;
  return new;
end;
$$;

revoke all on function public."enforce_communication_room_identity"()
  from public, anon, authenticated;

drop trigger if exists "enforce_communication_room_identity"
  on public."communication_rooms";
create trigger "enforce_communication_room_identity"
before insert or update on public."communication_rooms"
for each row execute function public."enforce_communication_room_identity"();

drop policy if exists "communication_rooms_host_update_policy"
  on public."communication_rooms";
create policy "communication_rooms_host_update_policy"
  on public."communication_rooms"
  for update
  to authenticated
  using (
    "host_user_id" = auth.uid()::text
    and public."whole_app_exact_current_session_authority"()
  )
  with check (
    "host_user_id" = auth.uid()::text
    and public."whole_app_exact_current_session_authority"()
  );

revoke update on table public."communication_rooms" from authenticated;
grant update ("status", "updated_at", "last_activity_at")
  on table public."communication_rooms" to authenticated;

drop policy if exists "communication_room_memberships_select_policy"
  on public."communication_room_memberships";
create policy "communication_room_memberships_select_policy"
  on public."communication_room_memberships"
  for select
  to authenticated
  using (public."can_read_communication_room_authority"("room_id"));

revoke select, insert, update, delete on table
  public."communication_rooms",
  public."communication_room_memberships"
from anon;

-- One RPC establishes a membership. It derives identity and role, enforces
-- accepted-call or linked Watch-Party authority, capacity, current entitlement,
-- and keeps a removed member removed.
create or replace function public."join_communication_room_session"(
  p_room_id text,
  p_display_name text default null,
  p_avatar_url text default null,
  p_camera_enabled boolean default false,
  p_mic_enabled boolean default true
)
returns setof public."communication_room_memberships"
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := nullif(auth.uid()::text, '');
  v_room_id text := upper(btrim(coalesce(p_room_id, '')));
  v_room public."communication_rooms"%rowtype;
  v_attached_thread public."chat_threads"%rowtype;
  v_attached_thread_count integer := 0;
  v_existing public."communication_room_memberships"%rowtype;
  v_membership public."communication_room_memberships"%rowtype;
  v_active_member_count integer := 0;
  v_now timestamptz := timezone('utc'::text, now());
  v_linked_party_host_user_id text;
  v_linked_paid_viewer boolean := false;
begin
  if v_actor_user_id is null then
    raise exception 'communication_room_authentication_required';
  end if;
  if not public."whole_app_exact_current_session_authority_internal"() then
    raise exception 'communication_room_current_session_required';
  end if;
  if v_room_id = '' or v_room_id !~ '^[A-Z0-9_-]{4,128}$' then
    raise exception 'communication_room_identity_required';
  end if;

  perform public."assert_account_private_feature_allowed"(
    v_actor_user_id,
    'communication_room_membership'
  );

  select room.* into v_room
  from public."communication_rooms" room
  where room."room_id" = v_room_id
  for update;

  if v_room."room_id" is null
    or v_room."status" <> 'active'
    or coalesce(
      v_room."last_activity_at",
      v_room."updated_at",
      v_room."created_at"
    ) < v_now - interval '15 minutes'
  then
    raise exception 'communication_room_unavailable';
  end if;

  select count(*)::integer into v_attached_thread_count
  from public."chat_threads" thread
  where thread."active_communication_room_id" = v_room_id;

  if v_attached_thread_count > 1 then
    raise exception 'communication_chat_call_authority_required';
  end if;

  if v_attached_thread_count = 1 then
    select thread.* into v_attached_thread
    from public."chat_threads" thread
    where thread."active_communication_room_id" = v_room_id
    for update;
  end if;

  if v_attached_thread."id" is not null then
    if not public."can_access_chat_thread"(v_attached_thread."id")
      or not exists (
        select 1
        from public."chat_call_invites" invite
        where invite."thread_id" = v_attached_thread."id"
          and invite."communication_room_id" = v_room_id
          and invite."status" = 'accepted'
          and invite."accepted_at" is not null
          and invite."ended_at" is null
          and invite."call_type" = v_attached_thread."active_call_type"
          and v_actor_user_id in (
            invite."caller_user_id",
            invite."callee_user_id"
          )
      )
    then
      raise exception 'communication_chat_call_authority_required';
    end if;
  elsif v_room."linked_party_id" is not null then
    if not public."can_read_watch_party_room_authority"(
      v_room."linked_party_id"
    ) then
      raise exception 'communication_watch_party_authority_required';
    end if;
    select party_room."host_user_id"::text
    into v_linked_party_host_user_id
    from public."watch_party_rooms" party_room
    where party_room."party_id" = v_room."linked_party_id";
    v_linked_paid_viewer := v_actor_user_id is distinct from
        v_linked_party_host_user_id
      and exists (
        select 1
        from public."paid_watch_party_offers" offer
        where offer."party_id" = v_room."linked_party_id"
          and offer."status" in (
            'sandbox', 'active', 'paused', 'sold_out', 'blocked'
          )
      );
  elsif v_actor_user_id <> v_room."host_user_id"
    and not (
      v_room."content_access_rule" = 'open'
      or (
        v_room."content_access_rule" = 'party_pass'
        and public."user_has_active_entitlement"(
          v_actor_user_id,
          array['premium_watch_party'::text, 'premium'::text]
        )
      )
      or (
        v_room."content_access_rule" = 'premium'
        and public."user_has_active_entitlement"(
          v_actor_user_id,
          array['premium'::text]
        )
      )
    )
  then
    raise exception 'communication_room_entitlement_required';
  end if;

  select membership.* into v_existing
  from public."communication_room_memberships" membership
  where membership."room_id" = v_room_id
    and membership."user_id" = v_actor_user_id
  for update;

  if v_existing."membership_state" = 'removed' then
    raise exception 'communication_room_membership_removed';
  end if;

  select count(*)::integer into v_active_member_count
  from public."communication_room_memberships" membership
  where membership."room_id" = v_room_id
    and membership."user_id" <> v_actor_user_id
    and membership."membership_state" in ('active', 'reconnecting')
    and membership."last_seen_at" >= v_now - interval '45 seconds';

  if v_active_member_count >= 4 then
    raise exception 'communication_room_full';
  end if;

  insert into public."communication_room_memberships" (
    "room_id",
    "user_id",
    "role",
    "membership_state",
    "camera_enabled",
    "mic_enabled",
    "display_name",
    "avatar_url",
    "joined_at",
    "last_seen_at",
    "left_at",
    "updated_at"
  ) values (
    v_room_id,
    v_actor_user_id,
    case when v_actor_user_id = v_room."host_user_id" then 'host' else 'participant' end,
    'active',
    not v_linked_paid_viewer and coalesce(p_camera_enabled, false),
    not v_linked_paid_viewer and coalesce(p_mic_enabled, true),
    nullif(left(btrim(coalesce(p_display_name, '')), 160), ''),
    nullif(left(btrim(coalesce(p_avatar_url, '')), 2048), ''),
    v_now,
    v_now,
    null,
    v_now
  )
  on conflict on constraint "communication_room_memberships_pkey" do update
  set
    "role" = excluded."role",
    "membership_state" = 'active',
    "camera_enabled" = excluded."camera_enabled",
    "mic_enabled" = excluded."mic_enabled",
    "display_name" = excluded."display_name",
    "avatar_url" = excluded."avatar_url",
    "joined_at" = public."communication_room_memberships"."joined_at",
    "last_seen_at" = excluded."last_seen_at",
    "left_at" = null,
    "updated_at" = excluded."updated_at"
  returning * into v_membership;

  return next v_membership;
end;
$$;

revoke all on function public."join_communication_room_session"(
  text, text, text, boolean, boolean
) from public, anon, service_role;
grant execute on function public."join_communication_room_session"(
  text, text, text, boolean, boolean
) to authenticated;

drop policy if exists "communication_room_memberships_self_insert_policy"
  on public."communication_room_memberships";
revoke insert on table public."communication_room_memberships"
  from authenticated;

-- Heartbeats/media preference changes remain direct, but row identity, room,
-- role, and original join identity are immutable for every writer. Trusted
-- nested DML is identified only by its effective database role; a client-set
-- custom GUC is never an authority signal.
create or replace function public."enforce_communication_membership_identity"()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_user_id text := nullif(auth.uid()::text, '');
  v_effective_role text := current_user::text;
  v_host_user_id text;
  v_linked_party_id text;
  v_linked_party_host_user_id text;
  v_linked_paid_viewer boolean := false;
  v_now timestamptz := timezone('utc'::text, now());
  v_server_transition boolean := v_effective_role in (
    'postgres',
    'service_role',
    'supabase_admin'
  );
begin
  select room."host_user_id", room."linked_party_id"
  into v_host_user_id, v_linked_party_id
  from public."communication_rooms" room
  where room."room_id" = old."room_id";

  if v_linked_party_id is not null then
    select party_room."host_user_id"::text
    into v_linked_party_host_user_id
    from public."watch_party_rooms" party_room
    where party_room."party_id" = v_linked_party_id;
    v_linked_paid_viewer := old."user_id" is distinct from
        v_linked_party_host_user_id
      and exists (
        select 1
        from public."paid_watch_party_offers" offer
        where offer."party_id" = v_linked_party_id
          and offer."status" in (
            'sandbox', 'active', 'paused', 'sold_out', 'blocked'
          )
      );
  end if;

  if v_host_user_id is null
    or (
      not v_server_transition
      and (
        v_actor_user_id is null
        or v_actor_user_id not in (old."user_id", v_host_user_id)
      )
    )
  then
    raise exception 'communication_membership_update_forbidden';
  end if;
  if new."room_id" is distinct from old."room_id"
    or new."user_id" is distinct from old."user_id"
    or new."role" is distinct from old."role"
    or new."joined_at" is distinct from old."joined_at"
  then
    raise exception 'communication_membership_identity_immutable';
  end if;
  if old."membership_state" = 'removed'
    and new."membership_state" <> 'removed'
  then
    raise exception 'communication_room_membership_removed';
  end if;
  if old."role" <> (
    case
      when old."user_id" = v_host_user_id then 'host'
      else 'participant'
    end
  ) then
    raise exception 'communication_membership_role_invalid';
  end if;
  if v_linked_paid_viewer
    and (new."camera_enabled" or new."mic_enabled")
  then
    raise exception 'paid_watch_party_viewer_only';
  end if;

  if not v_server_transition and v_actor_user_id = old."user_id" then
    if old."membership_state" not in ('active', 'reconnecting')
      or new."membership_state" not in ('active', 'reconnecting', 'left')
    then
      raise exception 'communication_membership_join_rpc_required';
    end if;
    if new."membership_state" in ('active', 'reconnecting')
      and not public."can_read_communication_room_authority"(old."room_id")
    then
      raise exception 'communication_membership_authority_required';
    end if;
    new."last_seen_at" := v_now;
    new."updated_at" := v_now;
    if new."membership_state" = 'left' then
      new."left_at" := v_now;
      new."camera_enabled" := false;
      new."mic_enabled" := false;
    else
      new."left_at" := null;
    end if;
  elsif not v_server_transition and v_actor_user_id = v_host_user_id then
    if new."camera_enabled" is distinct from old."camera_enabled"
      or new."mic_enabled" is distinct from old."mic_enabled"
      or new."display_name" is distinct from old."display_name"
      or new."avatar_url" is distinct from old."avatar_url"
      or new."last_seen_at" is distinct from old."last_seen_at"
      or new."left_at" is distinct from old."left_at"
    then
      raise exception 'communication_membership_host_transition_invalid';
    end if;
    if new."membership_state" is distinct from old."membership_state"
      and new."membership_state" <> 'removed'
    then
      raise exception 'communication_membership_host_transition_invalid';
    end if;
    new."last_seen_at" := old."last_seen_at";
    new."joined_at" := old."joined_at";
    new."updated_at" := v_now;
    if new."membership_state" = 'removed' then
      new."left_at" := v_now;
      new."camera_enabled" := false;
      new."mic_enabled" := false;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public."enforce_communication_membership_identity"()
  from public, anon, authenticated;

drop trigger if exists "enforce_communication_membership_identity"
  on public."communication_room_memberships";
create trigger "enforce_communication_membership_identity"
before update on public."communication_room_memberships"
for each row execute function public."enforce_communication_membership_identity"();

drop policy if exists "communication_room_memberships_self_update_policy"
  on public."communication_room_memberships";
create policy "communication_room_memberships_self_update_policy"
  on public."communication_room_memberships"
  for update
  to authenticated
  using (
    "user_id" = auth.uid()::text
    and public."whole_app_exact_current_session_authority"()
  )
  with check (
    "user_id" = auth.uid()::text
    and public."whole_app_exact_current_session_authority"()
  );

drop policy if exists "communication_room_memberships_host_update_policy"
  on public."communication_room_memberships";
create policy "communication_room_memberships_host_update_policy"
  on public."communication_room_memberships"
  for update
  to authenticated
  using (
    public."whole_app_exact_current_session_authority"()
    and
    exists (
      select 1
      from public."communication_rooms" room
      where room."room_id" = "communication_room_memberships"."room_id"
        and room."host_user_id" = auth.uid()::text
    )
  )
  with check (
    public."whole_app_exact_current_session_authority"()
    and
    exists (
      select 1
      from public."communication_rooms" room
      where room."room_id" = "communication_room_memberships"."room_id"
        and room."host_user_id" = auth.uid()::text
    )
  );

revoke update on table public."communication_room_memberships"
  from authenticated;
grant update (
  "membership_state",
  "camera_enabled",
  "mic_enabled",
  "display_name",
  "avatar_url",
  "last_seen_at",
  "left_at",
  "updated_at"
) on table public."communication_room_memberships" to authenticated;

-- Private Broadcast/Presence topics are authorized from the same exact fresh
-- membership. Realtime evaluates these policies when a private topic joins.
create or replace function public."can_access_communication_realtime_topic"(
  p_topic text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with topic_scope as (
    select upper(substr(btrim(coalesce(p_topic, '')), length('comm-room-') + 1))
      as room_id
    where btrim(coalesce(p_topic, '')) like 'comm-room-%'
      and btrim(coalesce(p_topic, '')) not like 'comm-room-state-%'
  )
  select coalesce((
    select
      public."can_read_communication_room_authority"(topic_scope.room_id)
      and exists (
        select 1
        from public."communication_room_memberships" membership
        join public."communication_rooms" room
          on room."room_id" = membership."room_id"
        where membership."room_id" = topic_scope.room_id
          and membership."user_id" = auth.uid()::text
          and membership."membership_state" in ('active', 'reconnecting')
          and membership."last_seen_at" >=
            timezone('utc'::text, now()) - interval '45 seconds'
          and membership."role" = case
            when membership."user_id" = room."host_user_id" then 'host'
            else 'participant'
          end
          and room."status" = 'active'
          and coalesce(
            room."last_activity_at",
            room."updated_at",
            room."created_at"
          ) >= timezone('utc'::text, now()) - interval '15 minutes'
      )
    from topic_scope
  ), false);
$$;

revoke all on function public."can_access_communication_realtime_topic"(text)
  from public, anon;
grant execute on function public."can_access_communication_realtime_topic"(text)
  to authenticated, service_role;

-- A paid viewer can negotiate receive-only legacy WebRTC media, but cannot
-- smuggle send authority through an SDP default (`sendrecv`) or an explicit
-- send direction. Every audio/video media section must therefore inherit or
-- declare recvonly/inactive.
create or replace function public."communication_sdp_is_receive_only_internal"(
  p_sdp text
)
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_line text;
  v_in_media boolean := false;
  v_media_requires_direction boolean := false;
  v_media_direction text;
  v_session_direction text;
begin
  if nullif(p_sdp, '') is null or octet_length(p_sdp) > 98304 then
    return false;
  end if;
  for v_line in
    select lower(btrim(line))
    from unnest(string_to_array(replace(p_sdp, chr(13), ''), chr(10))) line
  loop
    if v_line in ('a=sendrecv', 'a=sendonly') then
      return false;
    end if;
    if left(v_line, 2) = 'm=' then
      if v_in_media and v_media_requires_direction
        and coalesce(v_media_direction, v_session_direction, '')
          not in ('recvonly', 'inactive')
      then
        return false;
      end if;
      v_in_media := true;
      v_media_requires_direction := v_line like 'm=audio %'
        or v_line like 'm=video %';
      v_media_direction := null;
    elsif v_line in ('a=recvonly', 'a=inactive') then
      if v_in_media then
        v_media_direction := substr(v_line, 3);
      else
        v_session_direction := substr(v_line, 3);
      end if;
    end if;
  end loop;
  if v_in_media and v_media_requires_direction
    and coalesce(v_media_direction, v_session_direction, '')
      not in ('recvonly', 'inactive')
  then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public."communication_sdp_is_receive_only_internal"(text)
  from public, anon, authenticated, service_role;

-- Realtime authorizes Broadcast/Presence capabilities when a private channel
-- is joined; it does not bind a later client Broadcast payload to the JWT that
-- joined it. Keep client Broadcast writes disabled and relay the bounded
-- legacy WebRTC signal set through this caller-bound function so sender and
-- room identity are derived from auth.uid()/the authoritative membership.
create or replace function public."broadcast_communication_room_signal"(
  p_room_id text,
  p_event text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := nullif(auth.uid()::text, '');
  v_room_id text := upper(btrim(coalesce(p_room_id, '')));
  v_event text := lower(btrim(coalesce(p_event, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_target_user_id text;
  v_negotiation_id text;
  v_description jsonb;
  v_candidate jsonb;
  v_message jsonb;
  v_now timestamptz := timezone('utc'::text, now());
  v_paid_viewer_only boolean := false;
begin
  if v_actor_user_id is null then
    raise exception 'communication_room_authentication_required';
  end if;
  if v_room_id = '' or v_room_id !~ '^[A-Z0-9_-]{4,128}$' then
    raise exception 'communication_room_identity_required';
  end if;
  if jsonb_typeof(v_payload) <> 'object'
    or octet_length(v_payload::text) > 131072
  then
    raise exception 'communication_signal_payload_invalid';
  end if;
  if v_event not in (
    'webrtc:offer',
    'webrtc:answer',
    'webrtc:ice',
    'media:update',
    'room:end'
  ) then
    raise exception 'communication_signal_event_invalid';
  end if;
  if not public."can_access_communication_realtime_topic"(
    'comm-room-' || v_room_id
  ) then
    raise exception 'communication_signal_authority_required';
  end if;

  select exists (
    select 1
    from public."communication_rooms" communication_room
    join public."watch_party_rooms" party_room
      on party_room."party_id" = communication_room."linked_party_id"
    where communication_room."room_id" = v_room_id
      and party_room."host_user_id"::text <> v_actor_user_id
      and exists (
        select 1
        from public."paid_watch_party_offers" offer
        where offer."party_id" = party_room."party_id"
          and offer."status" in (
            'sandbox', 'active', 'paused', 'sold_out', 'blocked'
          )
      )
  ) into v_paid_viewer_only;

  if v_event in ('webrtc:offer', 'webrtc:answer', 'webrtc:ice') then
    v_target_user_id := nullif(btrim(coalesce(
      v_payload ->> 'targetUserId',
      ''
    )), '');
    if v_target_user_id is null
      or v_target_user_id = v_actor_user_id
      or not exists (
        select 1
        from public."communication_room_memberships" membership
        join public."communication_rooms" room
          on room."room_id" = membership."room_id"
        where membership."room_id" = v_room_id
          and membership."user_id" = v_target_user_id
          and membership."membership_state" in ('active', 'reconnecting')
          and membership."last_seen_at" >= v_now - interval '45 seconds'
          and membership."role" = case
            when membership."user_id" = room."host_user_id" then 'host'
            else 'participant'
          end
          and room."status" = 'active'
          and not public."is_account_access_restricted"(
            membership."user_id"
          )
      )
      or public."has_channel_audience_block_between"(
        v_actor_user_id,
        v_target_user_id
      )
    then
      raise exception 'communication_signal_target_invalid';
    end if;
  end if;

  if v_event in ('webrtc:offer', 'webrtc:answer') then
    v_description := v_payload -> 'description';
    if jsonb_typeof(v_description) <> 'object'
      or v_description ->> 'type' <> split_part(v_event, ':', 2)
      or nullif(v_description ->> 'sdp', '') is null
      or octet_length(v_description ->> 'sdp') > 98304
    then
      raise exception 'communication_signal_description_invalid';
    end if;
    if v_paid_viewer_only
      and not public."communication_sdp_is_receive_only_internal"(
        v_description ->> 'sdp'
      )
    then
      raise exception 'paid_watch_party_viewer_only';
    end if;
    v_negotiation_id := nullif(left(btrim(coalesce(
      v_payload ->> 'negotiationId',
      ''
    )), 256), '');
    v_message := jsonb_build_object(
      'fromUserId', v_actor_user_id,
      'roomId', v_room_id,
      'targetUserId', v_target_user_id,
      'description', jsonb_build_object(
        'type', v_description ->> 'type',
        'sdp', v_description ->> 'sdp'
      )
    );
    if v_negotiation_id is not null then
      v_message := v_message || jsonb_build_object(
        'negotiationId', v_negotiation_id
      );
    end if;
  elsif v_event = 'webrtc:ice' then
    v_candidate := v_payload -> 'candidate';
    if jsonb_typeof(v_candidate) <> 'object'
      or nullif(v_candidate ->> 'candidate', '') is null
      or octet_length(v_candidate ->> 'candidate') > 8192
      or octet_length(coalesce(v_candidate ->> 'sdpMid', '')) > 256
      or (
        v_candidate ? 'sdpMLineIndex'
        and jsonb_typeof(v_candidate -> 'sdpMLineIndex')
          not in ('number', 'null')
      )
    then
      raise exception 'communication_signal_candidate_invalid';
    end if;
    v_message := jsonb_build_object(
      'fromUserId', v_actor_user_id,
      'roomId', v_room_id,
      'targetUserId', v_target_user_id,
      'candidate', jsonb_build_object(
        'candidate', v_candidate ->> 'candidate',
        'sdpMid', v_candidate -> 'sdpMid',
        'sdpMLineIndex', v_candidate -> 'sdpMLineIndex'
      )
    );
  elsif v_event = 'media:update' then
    if jsonb_typeof(v_payload -> 'cameraOn') <> 'boolean'
      or jsonb_typeof(v_payload -> 'micOn') <> 'boolean'
    then
      raise exception 'communication_signal_media_invalid';
    end if;
    if v_paid_viewer_only
      and (
        (v_payload ->> 'cameraOn')::boolean
        or (v_payload ->> 'micOn')::boolean
      )
    then
      raise exception 'paid_watch_party_viewer_only';
    end if;
    v_message := jsonb_build_object(
      'fromUserId', v_actor_user_id,
      'roomId', v_room_id,
      'cameraOn', (v_payload ->> 'cameraOn')::boolean,
      'micOn', (v_payload ->> 'micOn')::boolean
    );
  else
    if not exists (
      select 1
      from public."communication_rooms" room
      where room."room_id" = v_room_id
        and room."host_user_id" = v_actor_user_id
        and room."status" = 'active'
    ) then
      raise exception 'communication_signal_host_required';
    end if;
    v_message := jsonb_build_object(
      'fromUserId', v_actor_user_id,
      'roomId', v_room_id,
      'reason', case
        when v_payload ->> 'reason' = 'host-left' then 'host-left'
        else 'ended'
      end
    );
  end if;

  perform realtime."send"(
    v_message,
    v_event,
    'comm-room-' || v_room_id,
    true
  );

  return jsonb_build_object(
    'sent', true,
    'event', v_event,
    'roomId', v_room_id,
    'senderUserId', v_actor_user_id
  );
end;
$$;

revoke all on function public."broadcast_communication_room_signal"(
  text, text, jsonb
) from public, anon, service_role;
grant execute on function public."broadcast_communication_room_signal"(
  text, text, jsonb
) to authenticated;

drop policy if exists "communication_room_realtime_receive"
  on realtime."messages";
create policy "communication_room_realtime_receive"
  on realtime."messages"
  for select
  to authenticated
  using (
    realtime."messages"."extension" in ('broadcast', 'presence')
    and public."can_access_communication_realtime_topic"(
      (select realtime."topic"())
    )
  );

drop policy if exists "communication_room_realtime_send"
  on realtime."messages";
create policy "communication_room_realtime_send"
  on realtime."messages"
  for insert
  to authenticated
  with check (
    -- Broadcast is server-relayed by broadcast_communication_room_signal so a
    -- member cannot forge another member's SDP/ICE sender identity.
    realtime."messages"."extension" = 'presence'
    and public."can_access_communication_realtime_topic"(
      (select realtime."topic"())
    )
  );

-- Current creator-video objects are owner-prefixed. The only bounded
-- exception is an exact R2 key written by the verified storage migration and
-- retained as an active audit record for the same video row.
create or replace function public."has_verified_legacy_video_object_provenance"(
  p_video_id uuid,
  p_provider text,
  p_bucket text,
  p_object_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    lower(btrim(coalesce(p_provider, ''))) = 'cloudflare_r2'
    and btrim(coalesce(p_bucket, '')) <> ''
    and (
      p_object_key like 'originals/%'
      or p_object_key like 'uploads/%'
      or p_object_key like 'source/%'
      or p_object_key like 'processing/%'
      or p_object_key like 'quarantine/%'
    )
    and exists (
      select 1
      from private."media_object_storage_migration_audit" audit
      join public."videos" video
        on video."id" = p_video_id
      where audit."table_name" = 'videos'
        and audit."row_id" = p_video_id::text
        and audit."status" = 'updated'
        and lower(btrim(audit."new_storage_provider")) =
          lower(btrim(p_provider))
        and audit."new_storage_bucket" = p_bucket
        and audit."new_storage_object_key" = p_object_key
        and lower(btrim(coalesce(video."storage_provider", ''))) =
          lower(btrim(p_provider))
        and video."storage_bucket" = p_bucket
        and (
          coalesce(nullif(video."storage_object_key", ''), video."storage_path") =
            p_object_key
          or video."thumb_storage_path" = p_object_key
        )
    );
$$;

revoke all on function public."has_verified_legacy_video_object_provenance"(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public."has_verified_legacy_video_object_provenance"(
  uuid, text, text, text
) to service_role;

comment on function public."has_verified_legacy_video_object_provenance"(
  uuid, text, text, text
) is
  'Service-only exact provenance check for non-owner-prefixed creator-video R2 objects written by the verified storage migration.';

-- Gateway delivery/deletion also needs the same immutable evidence for
-- migrated social attachments and renditions. The Edge function has already
-- bound the requested key to the live row before calling this service-only
-- helper, so no caller-controlled table lookup is performed here.
create or replace function public."has_verified_legacy_media_object_provenance"(
  p_table_name text,
  p_row_id text,
  p_provider text,
  p_bucket text,
  p_object_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    btrim(coalesce(p_table_name, '')) in (
      'videos',
      'social_attachments',
      'video_renditions'
    )
    and nullif(btrim(coalesce(p_row_id, '')), '') is not null
    and lower(btrim(coalesce(p_provider, ''))) = 'cloudflare_r2'
    and btrim(coalesce(p_bucket, '')) <> ''
    and btrim(coalesce(p_object_key, '')) <> ''
    and exists (
      select 1
      from private."media_object_storage_migration_audit" audit
      where audit."table_name" = btrim(p_table_name)
        and audit."row_id" = btrim(p_row_id)
        and audit."status" = 'updated'
        and lower(btrim(audit."new_storage_provider")) =
          lower(btrim(p_provider))
        and audit."new_storage_bucket" = btrim(p_bucket)
        and audit."new_storage_object_key" = btrim(p_object_key)
    );
$$;

revoke all on function public."has_verified_legacy_media_object_provenance"(
  text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public."has_verified_legacy_media_object_provenance"(
  text, text, text, text, text
) to service_role;

-- Deletion invalidates migrated provenance before the provider mutation. If
-- provider deletion must be retried, the row stays fail-closed and recreated
-- bytes can never inherit the historical audit receipt.
create or replace function public."revoke_verified_legacy_media_object_provenance"(
  p_table_name text,
  p_row_id text,
  p_provider text,
  p_bucket text,
  p_object_key text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if btrim(coalesce(p_table_name, '')) not in (
    'videos',
    'social_attachments',
    'video_renditions'
  )
    or nullif(btrim(coalesce(p_row_id, '')), '') is null
    or lower(btrim(coalesce(p_provider, ''))) <> 'cloudflare_r2'
    or nullif(btrim(coalesce(p_bucket, '')), '') is null
    or nullif(btrim(coalesce(p_object_key, '')), '') is null
  then
    return false;
  end if;

  update private."media_object_storage_migration_audit" audit
  set
    "status" = 'rolled_back',
    "updated_at" = timezone('utc'::text, now())
  where audit."table_name" = btrim(p_table_name)
    and audit."row_id" = btrim(p_row_id)
    and audit."status" = 'updated'
    and lower(btrim(audit."new_storage_provider")) =
      lower(btrim(p_provider))
    and audit."new_storage_bucket" = btrim(p_bucket)
    and audit."new_storage_object_key" = btrim(p_object_key);

  return found;
end;
$$;

revoke all on function public."revoke_verified_legacy_media_object_provenance"(
  text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public."revoke_verified_legacy_media_object_provenance"(
  text, text, text, text, text
) to service_role;
