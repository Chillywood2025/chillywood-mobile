-- Wave 4 abuse/rate-limit controls.
-- Narrow backend-side throttles for direct write paths. These controls do not
-- grant money, Premium, LiveKit authority, room authority, or public access.

set check_function_bodies = false;

create table if not exists public."abuse_rate_limit_events" (
  "id" uuid default gen_random_uuid() not null,
  "actor_user_id" text not null,
  "action_key" text not null,
  "target_key" text not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "metadata" jsonb default '{}'::jsonb not null,
  constraint "abuse_rate_limit_events_pkey" primary key ("id"),
  constraint "abuse_rate_limit_events_actor_check" check (length(trim("actor_user_id")) > 0),
  constraint "abuse_rate_limit_events_action_check" check (length(trim("action_key")) between 2 and 120),
  constraint "abuse_rate_limit_events_target_check" check (length(trim("target_key")) between 1 and 240)
);

create index if not exists "abuse_rate_limit_events_lookup_idx"
  on public."abuse_rate_limit_events" using btree ("actor_user_id", "action_key", "target_key", "created_at" desc);

create index if not exists "abuse_rate_limit_events_created_idx"
  on public."abuse_rate_limit_events" using btree ("created_at" desc);

alter table public."abuse_rate_limit_events" enable row level security;
revoke all on table public."abuse_rate_limit_events" from anon, authenticated;
grant all on table public."abuse_rate_limit_events" to postgres, service_role;

create or replace function public."enforce_abuse_rate_limit"(
  p_actor_user_id text,
  p_action_key text,
  p_target_key text,
  p_limit integer,
  p_window_seconds integer,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := nullif(btrim(coalesce(p_actor_user_id, '')), '');
  v_action text := lower(nullif(btrim(coalesce(p_action_key, '')), ''));
  v_target text := left(nullif(btrim(coalesce(p_target_key, '')), ''), 240);
  v_limit integer := greatest(1, least(coalesce(p_limit, 1), 100));
  v_window integer := greatest(1, least(coalesce(p_window_seconds, 60), 86400));
  v_since timestamp with time zone := timezone('utc'::text, now()) - make_interval(secs => greatest(1, least(coalesce(p_window_seconds, 60), 86400)));
  v_count integer;
begin
  if v_actor is null or v_action is null or v_target is null then
    raise exception 'abuse_rate_limit_invalid_scope';
  end if;

  delete from public."abuse_rate_limit_events"
  where "created_at" < timezone('utc'::text, now()) - interval '7 days';

  select count(*) into v_count
  from public."abuse_rate_limit_events" event
  where event."actor_user_id" = v_actor
    and event."action_key" = v_action
    and event."target_key" = v_target
    and event."created_at" >= v_since;

  if coalesce(v_count, 0) >= v_limit then
    raise exception 'rate_limited';
  end if;

  insert into public."abuse_rate_limit_events" (
    "actor_user_id",
    "action_key",
    "target_key",
    "metadata"
  ) values (
    v_actor,
    v_action,
    v_target,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public."enforce_abuse_rate_limit"(text, text, text, integer, integer, jsonb) from public;
grant execute on function public."enforce_abuse_rate_limit"(text, text, text, integer, integer, jsonb) to service_role;

create or replace function public."has_channel_audience_block_between"(
  p_user_a text,
  p_user_b text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    nullif(btrim(coalesce(p_user_a, '')), '') is not null
    and nullif(btrim(coalesce(p_user_b, '')), '') is not null
    and exists (
      select 1
      from public."channel_audience_blocks" block
      where (
        block."channel_user_id" = p_user_a
        and block."blocked_user_id" = p_user_b
      ) or (
        block."channel_user_id" = p_user_b
        and block."blocked_user_id" = p_user_a
      )
    );
$$;

revoke all on function public."has_channel_audience_block_between"(text, text) from public;
grant execute on function public."has_channel_audience_block_between"(text, text) to service_role;

create or replace function public."enforce_chat_messages_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blocked boolean := false;
begin
  new."body" := btrim(coalesce(new."body", ''));
  if char_length(new."body") < 1 then
    raise exception 'chat_message_body_required';
  end if;
  if char_length(new."body") > 1000 then
    raise exception 'chat_message_body_too_long';
  end if;

  select exists (
    select 1
    from public."chat_thread_members" other_member
    where other_member."thread_id" = new."thread_id"
      and other_member."user_id" <> new."sender_user_id"
      and public."has_channel_audience_block_between"(new."sender_user_id", other_member."user_id")
  ) into v_blocked;

  if coalesce(v_blocked, false) then
    raise exception 'blocked_relationship';
  end if;

  perform public."enforce_abuse_rate_limit"(
    new."sender_user_id",
    'chat_message',
    new."thread_id"::text,
    8,
    30,
    jsonb_build_object('source', 'chat_messages')
  );

  perform public."enforce_abuse_rate_limit"(
    new."sender_user_id",
    'chat_message_duplicate',
    new."thread_id"::text || ':' || md5(new."body"),
    2,
    60,
    jsonb_build_object('source', 'chat_messages')
  );

  return new;
end;
$$;

drop trigger if exists "enforce_chat_messages_abuse_guard" on public."chat_messages";
create trigger "enforce_chat_messages_abuse_guard"
  before insert on public."chat_messages"
  for each row execute function public."enforce_chat_messages_abuse_guard"();

revoke all on function public."enforce_chat_messages_abuse_guard"() from public;

create or replace function public."enforce_chat_call_invites_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public."chat_call_invites" invite
    where invite."thread_id" = new."thread_id"
      and invite."caller_user_id" = new."caller_user_id"
      and invite."callee_user_id" = new."callee_user_id"
      and invite."status" = 'ringing'
      and invite."expires_at" > timezone('utc'::text, now())
  ) then
    raise exception 'active_call_invite_exists';
  end if;

  perform public."enforce_abuse_rate_limit"(
    new."caller_user_id",
    'chat_call_invite',
    new."thread_id"::text || ':' || new."callee_user_id",
    3,
    300,
    jsonb_build_object('source', 'chat_call_invites', 'call_type', new."call_type")
  );

  return new;
end;
$$;

drop trigger if exists "enforce_chat_call_invites_abuse_guard" on public."chat_call_invites";
create trigger "enforce_chat_call_invites_abuse_guard"
  before insert on public."chat_call_invites"
  for each row execute function public."enforce_chat_call_invites_abuse_guard"();

revoke all on function public."enforce_chat_call_invites_abuse_guard"() from public;

create or replace function public."enforce_watch_party_rooms_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public."videos" video
    where video."id" = new."video_id"
      and public."has_channel_audience_block_between"(new."user_id", video."owner_id")
  ) then
    raise exception 'blocked_relationship';
  end if;

  perform public."enforce_abuse_rate_limit"(
    new."host_user_id"::text,
    'watch_party_room_create',
    coalesce(new."room_type", 'unknown'),
    5,
    600,
    jsonb_build_object('source', 'watch_party_rooms')
  );
  return new;
end;
$$;

drop trigger if exists "enforce_watch_party_rooms_abuse_guard" on public."watch_party_rooms";
create trigger "enforce_watch_party_rooms_abuse_guard"
  before insert on public."watch_party_rooms"
  for each row execute function public."enforce_watch_party_rooms_abuse_guard"();

revoke all on function public."enforce_watch_party_rooms_abuse_guard"() from public;

create or replace function public."enforce_communication_rooms_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public."profile_posts" post
    where post."id" = new."post_id"
      and public."has_channel_audience_block_between"(new."user_id", post."user_id")
  ) then
    raise exception 'blocked_relationship';
  end if;

  perform public."enforce_abuse_rate_limit"(
    new."host_user_id",
    'communication_room_create',
    coalesce(new."linked_party_id", 'direct_call'),
    5,
    600,
    jsonb_build_object('source', 'communication_rooms')
  );
  return new;
end;
$$;

drop trigger if exists "enforce_communication_rooms_abuse_guard" on public."communication_rooms";
create trigger "enforce_communication_rooms_abuse_guard"
  before insert on public."communication_rooms"
  for each row execute function public."enforce_communication_rooms_abuse_guard"();

revoke all on function public."enforce_communication_rooms_abuse_guard"() from public;

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

drop trigger if exists "enforce_watch_party_room_messages_abuse_guard" on public."watch_party_room_messages";
create trigger "enforce_watch_party_room_messages_abuse_guard"
  before insert on public."watch_party_room_messages"
  for each row execute function public."enforce_watch_party_room_messages_abuse_guard"();

revoke all on function public."enforce_watch_party_room_messages_abuse_guard"() from public;

create or replace function public."enforce_creator_video_comments_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public."enforce_abuse_rate_limit"(
    new."user_id",
    'creator_video_comment',
    new."video_id"::text,
    5,
    60,
    jsonb_build_object('source', 'creator_video_comments', 'parent_comment_id', new."parent_comment_id")
  );

  perform public."enforce_abuse_rate_limit"(
    new."user_id",
    'creator_video_comment_duplicate',
    new."video_id"::text || ':' || md5(btrim(coalesce(new."body", ''))),
    2,
    120,
    jsonb_build_object('source', 'creator_video_comments')
  );

  return new;
end;
$$;

drop trigger if exists "enforce_creator_video_comments_abuse_guard" on public."creator_video_comments";
create trigger "enforce_creator_video_comments_abuse_guard"
  before insert on public."creator_video_comments"
  for each row execute function public."enforce_creator_video_comments_abuse_guard"();

revoke all on function public."enforce_creator_video_comments_abuse_guard"() from public;

create or replace function public."enforce_profile_post_comments_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public."enforce_abuse_rate_limit"(
    new."user_id",
    'profile_post_comment',
    new."post_id"::text,
    5,
    60,
    jsonb_build_object('source', 'profile_post_comments')
  );

  perform public."enforce_abuse_rate_limit"(
    new."user_id",
    'profile_post_comment_duplicate',
    new."post_id"::text || ':' || md5(btrim(coalesce(new."body", ''))),
    2,
    120,
    jsonb_build_object('source', 'profile_post_comments')
  );

  return new;
end;
$$;

drop trigger if exists "enforce_profile_post_comments_abuse_guard" on public."profile_post_comments";
create trigger "enforce_profile_post_comments_abuse_guard"
  before insert on public."profile_post_comments"
  for each row execute function public."enforce_profile_post_comments_abuse_guard"();

revoke all on function public."enforce_profile_post_comments_abuse_guard"() from public;

create or replace function public."enforce_safety_reports_abuse_rate_limit"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public."enforce_abuse_rate_limit"(
    coalesce(nullif(new."reporter_user_id", ''), 'anonymous_reporter'),
    'safety_report',
    coalesce(new."target_type", 'unknown') || ':' || coalesce(new."target_id", 'unknown'),
    2,
    600,
    jsonb_build_object('source', 'safety_reports')
  );
  return new;
end;
$$;

drop trigger if exists "enforce_safety_reports_abuse_rate_limit" on public."safety_reports";
create trigger "enforce_safety_reports_abuse_rate_limit"
  before insert on public."safety_reports"
  for each row execute function public."enforce_safety_reports_abuse_rate_limit"();

revoke all on function public."enforce_safety_reports_abuse_rate_limit"() from public;

create or replace function public."enforce_dmca_cases_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := coalesce(nullif(new."reporter_user_id", ''), 'email:' || md5(lower(coalesce(new."reporter_email", ''))));
  v_target text := coalesce(new."allegedly_infringing_content_type", 'unknown') || ':'
    || coalesce(new."allegedly_infringing_content_id", new."allegedly_infringing_url", 'unknown');
begin
  if new."source" = 'public_form' then
    perform public."enforce_abuse_rate_limit"(
      v_actor,
      'dmca_notice',
      v_target,
      2,
      3600,
      jsonb_build_object('source', 'dmca_cases')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists "enforce_dmca_cases_abuse_guard" on public."dmca_cases";
create trigger "enforce_dmca_cases_abuse_guard"
  before insert on public."dmca_cases"
  for each row execute function public."enforce_dmca_cases_abuse_guard"();

revoke all on function public."enforce_dmca_cases_abuse_guard"() from public;

comment on table public."abuse_rate_limit_events" is
  'Internal short-retention abuse/rate-limit ledger for Wave 4 controls. Stores action keys and scoped targets only; no secrets, tokens, push tokens, LiveKit tokens, signed URLs, or provider credentials.';

comment on function public."enforce_abuse_rate_limit"(text, text, text, integer, integer, jsonb) is
  'Internal bounded time-window rate limiter for direct write paths and approved server functions. Does not grant app, money, Premium, room, or LiveKit authority.';

comment on function public."has_channel_audience_block_between"(text, text) is
  'Checks whether either user has a channel audience block against the other. Used by narrow Wave 4 harassment guards for chat messages and comments.';
