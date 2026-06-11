-- Chi'lly Chat call invites, call history, and ringtone preferences.
-- Keeps communication room/LiveKit authority unchanged; this stores call UX state only.

set check_function_bodies = false;

create table if not exists public."chat_call_invites" (
  "id" uuid default gen_random_uuid() not null,
  "thread_id" uuid not null references public."chat_threads"(id) on delete cascade,
  "communication_room_id" text references public."communication_rooms"(room_id) on delete set null,
  "caller_user_id" text not null,
  "callee_user_id" text not null,
  "call_type" text not null,
  "status" text default 'ringing'::text not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "expires_at" timestamp with time zone default (timezone('utc'::text, now()) + interval '45 seconds') not null,
  "accepted_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  constraint "chat_call_invites_pkey" primary key ("id"),
  constraint "chat_call_invites_call_type_check" check ("call_type" in ('voice', 'video')),
  constraint "chat_call_invites_status_check" check ("status" in ('ringing', 'accepted', 'declined', 'missed', 'canceled', 'ended', 'busy')),
  constraint "chat_call_invites_distinct_users_check" check ("caller_user_id" <> "callee_user_id")
);

create index if not exists "chat_call_invites_thread_created_idx"
  on public."chat_call_invites" using btree ("thread_id", "created_at" desc);

create index if not exists "chat_call_invites_callee_status_idx"
  on public."chat_call_invites" using btree ("callee_user_id", "status", "expires_at" desc);

create table if not exists public."chat_call_events" (
  "id" uuid default gen_random_uuid() not null,
  "thread_id" uuid not null references public."chat_threads"(id) on delete cascade,
  "call_invite_id" uuid references public."chat_call_invites"(id) on delete set null,
  "actor_user_id" text not null,
  "call_type" text not null,
  "event_type" text not null,
  "duration_seconds" integer,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "chat_call_events_pkey" primary key ("id"),
  constraint "chat_call_events_call_type_check" check ("call_type" in ('voice', 'video')),
  constraint "chat_call_events_event_type_check" check ("event_type" in ('started', 'accepted', 'declined', 'missed', 'canceled', 'ended', 'busy')),
  constraint "chat_call_events_duration_check" check ("duration_seconds" is null or "duration_seconds" >= 0)
);

create index if not exists "chat_call_events_thread_created_idx"
  on public."chat_call_events" using btree ("thread_id", "created_at" desc);

alter table public."notification_preferences"
  add column if not exists "chilly_chat_calls_enabled" boolean default true not null,
  add column if not exists "chilly_chat_call_sound_key" text default 'chilly_ring'::text not null,
  add column if not exists "chilly_chat_call_vibrate_enabled" boolean default true not null,
  add column if not exists "chilly_chat_call_custom_in_app_sound_uri" text;

alter table public."notification_preferences"
  drop constraint if exists "notification_preferences_chilly_chat_call_sound_key_check";

alter table public."notification_preferences"
  add constraint "notification_preferences_chilly_chat_call_sound_key_check"
  check ("chilly_chat_call_sound_key" in (
    'chilly_ring',
    'skyline_pulse',
    'theater_bell',
    'velvet_knock',
    'quiet_buzz',
    'classic_phone',
    'silent_vibrate'
  ));

alter table public."notifications"
  drop constraint if exists "notifications_category_check";

alter table public."notifications"
  add constraint "notifications_category_check"
  check ("category" in (
    'creator_went_live',
    'upcoming_event_reminder',
    'new_message',
    'access_granted',
    'content_dropped',
    'reply_comment',
    'moderation_notice',
    'payment_access_confirmation',
    'chilly_chat_call',
    'chilly_chat_missed_call'
  ));

alter table public."notifications"
  drop constraint if exists "notifications_notification_type_check";

alter table public."notifications"
  add constraint "notifications_notification_type_check"
  check ("notification_type" in (
    'followed_creator_live',
    'circle_friend_live',
    'event_starts_soon',
    'watch_party_starts_soon',
    'public_upload',
    'replay_later',
    'payment_access_confirmation',
    'chilly_chat_call',
    'chilly_chat_missed_call'
  ));

alter table public."chat_call_invites" enable row level security;
alter table public."chat_call_events" enable row level security;

drop policy if exists "chat_call_invites_select_members" on public."chat_call_invites";
create policy "chat_call_invites_select_members"
  on public."chat_call_invites"
  for select
  to "authenticated"
  using (public.can_access_chat_thread("thread_id"));

drop policy if exists "chat_call_invites_insert_caller" on public."chat_call_invites";
create policy "chat_call_invites_insert_caller"
  on public."chat_call_invites"
  for insert
  to "authenticated"
  with check (
    "caller_user_id" = (auth.uid())::text
    and public.can_access_chat_thread("thread_id")
    and exists (
      select 1
      from public."chat_thread_members" member
      where member."thread_id" = "chat_call_invites"."thread_id"
        and member."user_id" = "chat_call_invites"."callee_user_id"
    )
  );

drop policy if exists "chat_call_invites_update_participants" on public."chat_call_invites";
create policy "chat_call_invites_update_participants"
  on public."chat_call_invites"
  for update
  to "authenticated"
  using (
    public.can_access_chat_thread("thread_id")
    and ((auth.uid())::text in ("caller_user_id", "callee_user_id"))
  )
  with check (
    public.can_access_chat_thread("thread_id")
    and ((auth.uid())::text in ("caller_user_id", "callee_user_id"))
  );

drop policy if exists "chat_call_events_select_members" on public."chat_call_events";
create policy "chat_call_events_select_members"
  on public."chat_call_events"
  for select
  to "authenticated"
  using (public.can_access_chat_thread("thread_id"));

drop policy if exists "chat_call_events_insert_members" on public."chat_call_events";
create policy "chat_call_events_insert_members"
  on public."chat_call_events"
  for insert
  to "authenticated"
  with check (
    "actor_user_id" = (auth.uid())::text
    and public.can_access_chat_thread("thread_id")
  );

grant select, insert, update on table public."chat_call_invites" to "authenticated";
grant select, insert on table public."chat_call_events" to "authenticated";
grant all on table public."chat_call_invites" to "postgres", "service_role";
grant all on table public."chat_call_events" to "postgres", "service_role";

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    begin
      alter publication supabase_realtime add table public."chat_call_invites";
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public."chat_call_events";
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

comment on table public."chat_call_invites" is
  'Chi''lly Chat call invite state for ringing/accepted/declined/missed UX. Does not grant LiveKit publish or room authority.';

comment on table public."chat_call_events" is
  'Chi''lly Chat call history cards. Thread members only; not a replacement for chat text messages.';
