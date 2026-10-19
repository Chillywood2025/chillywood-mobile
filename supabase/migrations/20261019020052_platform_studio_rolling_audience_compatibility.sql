-- Rolling compatibility for the historical two-request Audience reviewer.
-- Its preliminary follower INSERT is not an approval: only the subsequent
-- exact-request UPDATE commits the relationship and review together. The
-- current review RPC traverses the same transition guard.

create function public.assert_channel_audience_review_authority_internal(
  p_channel_user_id text,
  p_requester_user_id text,
  p_status text
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor text := auth.uid()::text;
begin
  if v_actor is null then raise exception 'audience_review_auth_required'; end if;
  if p_status is null or p_status not in ('approved', 'declined') then
    raise exception 'audience_review_status_invalid';
  end if;
  if not public.whole_app_exact_current_session_authority_internal()
    or public.is_account_access_restricted(v_actor)
    or not exists (
      select 1 from auth.users subject join auth.sessions session_row
        on session_row.user_id = subject.id
      where subject.id = auth.uid() and subject.deleted_at is null
        and session_row.id::text = auth.jwt() ->> 'session_id'
        and (session_row.not_after is null or session_row.not_after > clock_timestamp())
    ) then
    raise exception 'audience_review_current_session_required';
  end if;
  if p_channel_user_id is null or p_requester_user_id is null
    or (p_channel_user_id <> v_actor
      and not (not public.is_platform_owner_user(p_channel_user_id)
        and public.platform_studio_current_staff_access_internal())) then
    raise exception 'audience_review_forbidden';
  end if;
  if public.is_account_access_restricted(p_channel_user_id)
    or public.is_account_access_restricted(p_requester_user_id)
    or not exists (select 1 from auth.users subject
      where subject.id::text = p_channel_user_id and subject.deleted_at is null)
    or not exists (select 1 from auth.users subject
      where subject.id::text = p_requester_user_id and subject.deleted_at is null) then
    raise exception 'audience_review_account_restricted';
  end if;
  if p_status = 'approved'
    and public.has_channel_audience_block_between(p_channel_user_id, p_requester_user_id) then
    raise exception 'blocked_relationship';
  end if;
end;
$$;
revoke all on function public.assert_channel_audience_review_authority_internal(text,text,text)
  from public, anon, authenticated, service_role;

-- This read-only entry point is callable by the invoker trigger. It provides
-- no follower, review, or entitlement mutation, even when called directly.
create function public.preflight_legacy_channel_audience_follow(
  p_channel_user_id text,
  p_requester_user_id text
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.assert_channel_audience_review_authority_internal(
    p_channel_user_id, p_requester_user_id, 'approved');
  if not exists (
    select 1 from public.channel_audience_requests request
    where request.channel_user_id = p_channel_user_id
      and request.requester_user_id = p_requester_user_id
      and request.request_kind = 'follow'
      and request.status in ('pending', 'approved')
  ) then
    raise exception 'audience_request_not_pending';
  end if;
end;
$$;
revoke all on function public.preflight_legacy_channel_audience_follow(text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.preflight_legacy_channel_audience_follow(text,text)
  to authenticated;

create function public.guard_legacy_channel_audience_follow_insert()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  -- current_user is the actual SQL authority here, including the definer of
  -- the atomic review function/trigger. JWT role and custom GUCs cannot grant
  -- this bypass. Ordinary requester self-follow keeps its existing RLS path.
  if current_user = 'service_role'
    or current_user::regrole::oid = (
      select relation.relowner from pg_catalog.pg_class relation where relation.oid = tg_relid
    )
    or new.follower_user_id = auth.uid()::text then
    return new;
  end if;
  perform public.preflight_legacy_channel_audience_follow(
    new.channel_user_id, new.follower_user_id);
  -- Historical code does not select this INSERT's result. Returning NULL
  -- stages nothing and fires no follower notification; its exact-id PATCH
  -- must still succeed before the user receives a completed review result.
  return null;
end;
$$;
revoke all on function public.guard_legacy_channel_audience_follow_insert()
  from public, anon, authenticated, service_role;
create trigger guard_legacy_channel_audience_follow_insert
  before insert on public.channel_followers
  for each row execute function public.guard_legacy_channel_audience_follow_insert();

create function public.guard_channel_audience_review_transition()
returns trigger
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_database_role text := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  v_actor text := auth.uid()::text;
begin
  -- Preserve actual database-owner/service maintenance. The built-in role
  -- setting is privilege checked by PostgreSQL; a JWT or custom context flag
  -- cannot impersonate it. A definer RPC called under authenticated still
  -- takes the complete validation path below.
  if v_database_role = 'service_role'
    or v_database_role::regrole::oid = (
      select relation.relowner from pg_catalog.pg_class relation where relation.oid = tg_relid
    ) then
    return new;
  end if;
  if (to_jsonb(new) - array['status','reviewed_at','reviewed_by','updated_at'])
    is distinct from (to_jsonb(old) - array['status','reviewed_at','reviewed_by','updated_at']) then
    raise exception using errcode = '42501', message = 'audience_request_identity_immutable';
  end if;
  perform public.assert_channel_audience_review_authority_internal(
    old.channel_user_id, old.requester_user_id, new.status);
  if old.status <> 'pending' then
    if old.status = new.status then return old; end if;
    raise exception 'audience_request_not_pending';
  end if;
  if new.status = 'approved' then
    if old.request_kind <> 'follow' then
      raise exception 'subscriber_mutation_unsupported';
    end if;
    insert into public.channel_followers(channel_user_id, follower_user_id)
      values (old.channel_user_id, old.requester_user_id)
      on conflict (channel_user_id, follower_user_id) do nothing;
  end if;
  -- UPDATE holds the exact request row first. A conflicting follower insert
  -- may then wait, so re-read current session/account/staff/block authority
  -- before allowing either side of this transaction to commit.
  perform public.assert_channel_audience_review_authority_internal(
    old.channel_user_id, old.requester_user_id, new.status);
  new.reviewed_by := v_actor;
  new.reviewed_at := now();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_channel_audience_review_transition()
  from public, anon, authenticated, service_role;
create trigger guard_channel_audience_review_transition
  before update on public.channel_audience_requests
  for each row execute function public.guard_channel_audience_review_transition();

-- Restore only the historical review shape, never table-wide UPDATE or
-- requester/channel/kind/identity edits. The SELECT policy remains unchanged.
revoke update on table public.channel_audience_requests from public, anon, authenticated;
revoke update (id, channel_user_id, requester_user_id, request_kind, status, note,
  created_at, reviewed_at, reviewed_by, updated_at)
  on public.channel_audience_requests from public, anon, authenticated;
grant update (status, reviewed_at, reviewed_by, updated_at)
  on public.channel_audience_requests to authenticated;

drop policy "channel_audience_requests_update_owner_or_operator"
  on public.channel_audience_requests;
create policy "channel_audience_requests_update_owner_or_operator"
  on public.channel_audience_requests for update to authenticated
  using (
    auth.uid() is not null and (
      channel_user_id = auth.uid()::text
      or (not public.is_platform_owner_user(channel_user_id)
        and public.has_platform_role(array['owner'::text, 'operator'::text]))
    )
  )
  with check (
    auth.uid() is not null and (
      channel_user_id = auth.uid()::text
      or (not public.is_platform_owner_user(channel_user_id)
        and public.has_platform_role(array['owner'::text, 'operator'::text]))
    )
  );

comment on function public.preflight_legacy_channel_audience_follow(text,text) is
  'Read-only legacy reviewer preflight. The exact-id request update, not this call or its preliminary follower insert, commits approval atomically.';
comment on function public.guard_channel_audience_review_transition() is
  'Shared atomic review guard for legacy row-returning updates and the current review RPC; keeps identities immutable and rechecks authority after waits.';
