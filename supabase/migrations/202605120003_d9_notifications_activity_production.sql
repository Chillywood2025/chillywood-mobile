-- D9 production notifications/activity closeout.
-- Raw push tokens are server-owned only. Users register/revoke through Edge Functions,
-- read their own notification records, and may only mutate read/dismiss state.

alter table public."notifications"
  add column if not exists "actor_user_id" uuid references auth.users(id) on delete set null,
  add column if not exists "source_type" text,
  add column if not exists "source_id" text,
  add column if not exists "notification_type" text,
  add column if not exists "deep_link" text,
  add column if not exists "status" text default 'pending'::text not null,
  add column if not exists "priority" integer default 5 not null,
  add column if not exists "eligibility_reason" text,
  add column if not exists "blocked_reason" text,
  add column if not exists "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  add column if not exists "delivered_at" timestamp with time zone;

update public."notifications"
set
  "notification_type" = coalesce(nullif(btrim("notification_type"), ''), "category"),
  "updated_at" = coalesce("updated_at", "created_at", timezone('utc'::text, now()))
where "notification_type" is null
  or btrim("notification_type") = ''
  or "updated_at" is null;

alter table public."notifications"
  alter column "notification_type" set not null;

alter table public."notifications"
  drop constraint if exists "notifications_status_check";
alter table public."notifications"
  add constraint "notifications_status_check"
  check ("status" in ('pending', 'sent', 'failed', 'skipped', 'read', 'dismissed'));

alter table public."notifications"
  drop constraint if exists "notifications_priority_check";
alter table public."notifications"
  add constraint "notifications_priority_check"
  check ("priority" between 1 and 10);

alter table public."notifications"
  drop constraint if exists "notifications_notification_type_check";
alter table public."notifications"
  add constraint "notifications_notification_type_check"
  check ("notification_type" in (
    'followed_creator_live',
    'circle_friend_live',
    'event_starts_soon',
    'public_upload',
    'replay_later',
    'creator_went_live',
    'upcoming_event_reminder',
    'new_message',
    'access_granted',
    'content_dropped',
    'reply_comment',
    'moderation_notice',
    'payment_access_confirmation'
  ));

alter table public."notifications"
  drop constraint if exists "notifications_deep_link_check";
alter table public."notifications"
  add constraint "notifications_deep_link_check"
  check ("deep_link" is null or nullif(btrim("deep_link"), ''::text) is not null);

create index if not exists "notifications_source_idx"
  on public."notifications" using btree ("source_type", "source_id", "notification_type", "created_at" desc);

create index if not exists "notifications_status_idx"
  on public."notifications" using btree ("user_id", "status", "created_at" desc);

create table if not exists public."notification_preferences" (
  "user_id" uuid not null references auth.users(id) on delete cascade,
  "followed_creator_live_enabled" boolean default true not null,
  "circle_friend_live_enabled" boolean default true not null,
  "event_starts_soon_enabled" boolean default true not null,
  "public_upload_enabled" boolean default true not null,
  "replay_later_enabled" boolean default true not null,
  "push_enabled" boolean default true not null,
  "in_app_enabled" boolean default true not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "notification_preferences_pkey" primary key ("user_id")
);

create table if not exists public."user_push_tokens" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null references auth.users(id) on delete cascade,
  "platform" text not null,
  "provider" text not null,
  "token" text not null,
  "token_hash" text not null,
  "token_fingerprint" text not null,
  "device_id" text,
  "install_id" text,
  "app_version" text,
  "build_version" text,
  "enabled" boolean default true not null,
  "last_seen_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "revoked_at" timestamp with time zone,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "user_push_tokens_pkey" primary key ("id"),
  constraint "user_push_tokens_platform_check" check ("platform" in ('android', 'ios')),
  constraint "user_push_tokens_provider_check" check ("provider" in ('expo', 'fcm')),
  constraint "user_push_tokens_token_check" check (nullif(btrim("token"), ''::text) is not null),
  constraint "user_push_tokens_token_hash_check" check (nullif(btrim("token_hash"), ''::text) is not null),
  constraint "user_push_tokens_token_fingerprint_check" check (nullif(btrim("token_fingerprint"), ''::text) is not null)
);

create unique index if not exists "user_push_tokens_provider_token_hash_unique"
  on public."user_push_tokens" using btree ("provider", "token_hash");

create index if not exists "user_push_tokens_user_enabled_idx"
  on public."user_push_tokens" using btree ("user_id", "enabled", "last_seen_at" desc);

create index if not exists "user_push_tokens_install_idx"
  on public."user_push_tokens" using btree ("user_id", "platform", "provider", "install_id")
  where "install_id" is not null;

create table if not exists public."notification_delivery_attempts" (
  "id" uuid default gen_random_uuid() not null,
  "notification_id" uuid references public."notifications"(id) on delete cascade,
  "recipient_user_id" uuid not null references auth.users(id) on delete cascade,
  "push_token_id" uuid references public."user_push_tokens"(id) on delete set null,
  "provider" text not null,
  "provider_message_id" text,
  "attempt_number" integer default 1 not null,
  "status" text not null,
  "error_code" text,
  "error_message" text,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "notification_delivery_attempts_pkey" primary key ("id"),
  constraint "notification_delivery_attempts_provider_check" check ("provider" in ('expo', 'fcm', 'none')),
  constraint "notification_delivery_attempts_attempt_number_check" check ("attempt_number" > 0),
  constraint "notification_delivery_attempts_status_check" check ("status" in ('attempted', 'sent', 'failed', 'skipped'))
);

create index if not exists "notification_delivery_attempts_notification_idx"
  on public."notification_delivery_attempts" using btree ("notification_id", "created_at" desc);

create index if not exists "notification_delivery_attempts_recipient_idx"
  on public."notification_delivery_attempts" using btree ("recipient_user_id", "created_at" desc);

create table if not exists public."notification_event_dedupes" (
  "dedupe_key" text not null,
  "notification_id" uuid references public."notifications"(id) on delete set null,
  "recipient_user_id" uuid not null references auth.users(id) on delete cascade,
  "trigger_type" text not null,
  "source_type" text not null,
  "source_id" text not null,
  "timing_key" text default 'default'::text not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "notification_event_dedupes_pkey" primary key ("dedupe_key")
);

create index if not exists "notification_event_dedupes_source_idx"
  on public."notification_event_dedupes" using btree ("source_type", "source_id", "trigger_type");

create or replace function public."touch_notification_updated_at"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new."updated_at" = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists "notifications_touch_updated_at" on public."notifications";
create trigger "notifications_touch_updated_at"
before update on public."notifications"
for each row execute function public."touch_notification_updated_at"();

drop trigger if exists "notification_preferences_touch_updated_at" on public."notification_preferences";
create trigger "notification_preferences_touch_updated_at"
before update on public."notification_preferences"
for each row execute function public."touch_notification_updated_at"();

drop trigger if exists "user_push_tokens_touch_updated_at" on public."user_push_tokens";
create trigger "user_push_tokens_touch_updated_at"
before update on public."user_push_tokens"
for each row execute function public."touch_notification_updated_at"();

create or replace function public."guard_notification_user_update"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> old."user_id" then
    return new;
  end if;

  if new."user_id" is distinct from old."user_id"
    or new."actor_user_id" is distinct from old."actor_user_id"
    or new."source_type" is distinct from old."source_type"
    or new."source_id" is distinct from old."source_id"
    or new."notification_type" is distinct from old."notification_type"
    or new."category" is distinct from old."category"
    or new."title" is distinct from old."title"
    or new."body" is distinct from old."body"
    or new."target_route" is distinct from old."target_route"
    or new."target_entity_id" is distinct from old."target_entity_id"
    or new."target_context" is distinct from old."target_context"
    or new."deep_link" is distinct from old."deep_link"
    or new."priority" is distinct from old."priority"
    or new."eligibility_reason" is distinct from old."eligibility_reason"
    or new."blocked_reason" is distinct from old."blocked_reason"
    or new."delivered_at" is distinct from old."delivered_at"
  then
    raise exception 'Users may only update notification read or dismiss state.';
  end if;

  if new."status" is distinct from old."status"
    and new."status" not in ('read', 'dismissed')
  then
    raise exception 'Users may only mark notifications read or dismissed.';
  end if;

  return new;
end;
$$;

drop trigger if exists "notifications_guard_user_update" on public."notifications";
create trigger "notifications_guard_user_update"
before update on public."notifications"
for each row execute function public."guard_notification_user_update"();

alter table public."notification_preferences" enable row level security;
alter table public."user_push_tokens" enable row level security;
alter table public."notification_delivery_attempts" enable row level security;
alter table public."notification_event_dedupes" enable row level security;

drop policy if exists "notification_preferences_select_own" on public."notification_preferences";
create policy "notification_preferences_select_own"
  on public."notification_preferences"
  for select
  to "authenticated"
  using ("user_id" = auth.uid());

drop policy if exists "notification_preferences_insert_own" on public."notification_preferences";
create policy "notification_preferences_insert_own"
  on public."notification_preferences"
  for insert
  to "authenticated"
  with check ("user_id" = auth.uid());

drop policy if exists "notification_preferences_update_own" on public."notification_preferences";
create policy "notification_preferences_update_own"
  on public."notification_preferences"
  for update
  to "authenticated"
  using ("user_id" = auth.uid())
  with check ("user_id" = auth.uid());

revoke all on table public."user_push_tokens" from "anon", "authenticated";
revoke all on table public."notification_delivery_attempts" from "anon", "authenticated";
revoke all on table public."notification_event_dedupes" from "anon", "authenticated";

grant select, insert, update on table public."notification_preferences" to "authenticated";
grant all on table public."notification_preferences" to "postgres", "service_role";
grant all on table public."user_push_tokens" to "postgres", "service_role";
grant all on table public."notification_delivery_attempts" to "postgres", "service_role";
grant all on table public."notification_event_dedupes" to "postgres", "service_role";

comment on table public."notification_preferences" is
  'D9 user notification preferences. Users may read/update only their own preferences.';

comment on table public."user_push_tokens" is
  'D9 server-owned push device tokens. Raw tokens are not readable through client RLS and are used only by backend notification functions.';

comment on table public."notification_delivery_attempts" is
  'D9 backend delivery attempt log with redacted provider errors.';

comment on table public."notification_event_dedupes" is
  'D9 idempotency table preventing duplicate notification sends for a recipient/source/timing window.';
