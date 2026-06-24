-- Wave 4.3 Profile/Platform blocked-route policy.
-- Users blocked by a channel/profile owner cannot create follow or audience
-- request relationships to that owner through Profile/Platform routes or direct
-- table writes. This preserves safety/report/legal access and does not change
-- payments, Premium, LiveKit authority, participant caps, or scan gates.

set check_function_bodies = false;

create or replace function public."enforce_channel_follow_block_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public."has_channel_audience_block_between"(new."channel_user_id", new."follower_user_id") then
    raise exception 'blocked_relationship';
  end if;

  return new;
end;
$$;

drop trigger if exists "enforce_channel_follow_block_guard" on public."channel_followers";
create trigger "enforce_channel_follow_block_guard"
  before insert or update on public."channel_followers"
  for each row execute function public."enforce_channel_follow_block_guard"();

revoke all on function public."enforce_channel_follow_block_guard"() from public;

create or replace function public."enforce_channel_audience_request_block_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new."status", 'pending')) in ('pending', 'approved')
    and public."has_channel_audience_block_between"(new."channel_user_id", new."requester_user_id")
  then
    raise exception 'blocked_relationship';
  end if;

  return new;
end;
$$;

drop trigger if exists "enforce_channel_audience_request_block_guard" on public."channel_audience_requests";
create trigger "enforce_channel_audience_request_block_guard"
  before insert or update on public."channel_audience_requests"
  for each row execute function public."enforce_channel_audience_request_block_guard"();

revoke all on function public."enforce_channel_audience_request_block_guard"() from public;
