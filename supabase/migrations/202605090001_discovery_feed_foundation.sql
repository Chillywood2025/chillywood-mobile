create table if not exists public."discovery_feed_items" (
  "id" uuid default gen_random_uuid() not null,
  "item_type" text not null,
  "source_type" text not null,
  "source_id" text,
  "owner_user_id" text,
  "channel_user_id" text,
  "host_user_id" text,
  "room_id" text,
  "media_id" text,
  "event_id" text,
  "title" text,
  "subtitle" text,
  "thumbnail_url" text,
  "visibility" text default 'private'::text not null,
  "access_type" text default 'private'::text not null,
  "rights_status" text default 'unknown_block_public_spectator'::text not null,
  "ad_policy" text default 'ads_not_allowed'::text not null,
  "discovery_surface" text default 'none'::text not null,
  "starts_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "live_state" text default 'not_live'::text not null,
  "moderation_status" text default 'clean'::text not null,
  "is_publicly_discoverable" boolean default false not null,
  "is_spectator_enabled" boolean default false not null,
  "is_spectator_playback_enabled" boolean default false not null,
  "requires_premium_to_join" boolean default true not null,
  "requires_ticket_to_watch" boolean default false not null,
  "requires_subscription_to_watch" boolean default false not null,
  "follow_signal_user_id" text,
  "circle_signal_user_id" text,
  "category_key" text,
  "ranking_score" numeric default 0 not null,
  "ranking_reason" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "discovery_feed_items_pkey" primary key ("id"),
  constraint "discovery_feed_items_item_type_check"
    check ("item_type" in (
      'live_room',
      'watch_party',
      'creator_upload',
      'creator_event',
      'channel_update',
      'replay_later',
      'manual_foundation'
    )),
  constraint "discovery_feed_items_source_type_check"
    check ("source_type" in (
      'watch_party_room',
      'creator_event',
      'creator_video',
      'profile_post',
      'channel',
      'manual_foundation'
    )),
  constraint "discovery_feed_items_visibility_check"
    check ("visibility" in (
      'public',
      'followers',
      'chilly_circle',
      'premium_only',
      'ticketed',
      'subscriber_only_later',
      'invite_only',
      'private'
    )),
  constraint "discovery_feed_items_access_type_check"
    check ("access_type" in (
      'public_free',
      'premium_only',
      'ticketed',
      'subscriber_only_later',
      'invite_only',
      'private'
    )),
  constraint "discovery_feed_items_rights_status_check"
    check ("rights_status" in (
      'creator_owned',
      'chillywood_original',
      'licensed_for_public_stream',
      'private_use_only',
      'protected_title_block_public_spectator',
      'unknown_block_public_spectator'
    )),
  constraint "discovery_feed_items_ad_policy_check"
    check ("ad_policy" in (
      'free_with_ads',
      'premium_ad_free',
      'no_ads',
      'sponsor_breaks_only_later',
      'ctv_ads_allowed_later',
      'ads_not_allowed'
    )),
  constraint "discovery_feed_items_surface_check"
    check ("discovery_surface" in (
      'home',
      'profile',
      'channel',
      'home_profile_channel',
      'none'
    )),
  constraint "discovery_feed_items_live_state_check"
    check ("live_state" in (
      'not_live',
      'scheduled',
      'live',
      'ended',
      'replay_available_later'
    )),
  constraint "discovery_feed_items_moderation_status_check"
    check ("moderation_status" in (
      'clean',
      'under_review',
      'hidden',
      'blocked'
    )),
  constraint "discovery_feed_items_ranking_score_check"
    check ("ranking_score" >= 0),
  constraint "discovery_feed_items_public_discovery_guard_check"
    check (
      "is_publicly_discoverable" = false
      or (
        "visibility" = 'public'
        and "moderation_status" = 'clean'
        and "rights_status" in (
          'creator_owned',
          'chillywood_original',
          'licensed_for_public_stream'
        )
      )
    ),
  constraint "discovery_feed_items_spectator_guard_check"
    check (
      "is_spectator_enabled" = false
      or "rights_status" in (
        'creator_owned',
        'chillywood_original',
        'licensed_for_public_stream'
      )
    ),
  constraint "discovery_feed_items_spectator_playback_disabled_check"
    check ("is_spectator_playback_enabled" = false)
);

create index if not exists "discovery_feed_items_item_type_idx"
  on public."discovery_feed_items" using btree ("item_type");

create index if not exists "discovery_feed_items_source_idx"
  on public."discovery_feed_items" using btree ("source_type", "source_id");

create index if not exists "discovery_feed_items_channel_user_idx"
  on public."discovery_feed_items" using btree ("channel_user_id");

create index if not exists "discovery_feed_items_owner_user_idx"
  on public."discovery_feed_items" using btree ("owner_user_id");

create index if not exists "discovery_feed_items_host_user_idx"
  on public."discovery_feed_items" using btree ("host_user_id");

create index if not exists "discovery_feed_items_visibility_idx"
  on public."discovery_feed_items" using btree ("visibility");

create index if not exists "discovery_feed_items_access_type_idx"
  on public."discovery_feed_items" using btree ("access_type");

create index if not exists "discovery_feed_items_rights_status_idx"
  on public."discovery_feed_items" using btree ("rights_status");

create index if not exists "discovery_feed_items_surface_idx"
  on public."discovery_feed_items" using btree ("discovery_surface");

create index if not exists "discovery_feed_items_live_state_idx"
  on public."discovery_feed_items" using btree ("live_state");

create index if not exists "discovery_feed_items_public_discoverable_idx"
  on public."discovery_feed_items" using btree ("is_publicly_discoverable");

create index if not exists "discovery_feed_items_published_at_idx"
  on public."discovery_feed_items" using btree ("published_at" desc);

create index if not exists "discovery_feed_items_starts_at_idx"
  on public."discovery_feed_items" using btree ("starts_at" desc);

create table if not exists public."discovery_feed_item_blocks" (
  "id" uuid default gen_random_uuid() not null,
  "feed_item_id" uuid not null references public."discovery_feed_items"("id") on delete cascade,
  "blocked_user_id" text not null,
  "reason" text default 'privacy_or_block'::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "discovery_feed_item_blocks_pkey" primary key ("id"),
  constraint "discovery_feed_item_blocks_reason_check"
    check ("reason" in (
      'privacy_or_block',
      'blocked_relationship',
      'private_visibility',
      'moderation_block',
      'rights_block',
      'manual_foundation'
    )),
  constraint "discovery_feed_item_blocks_unique_target"
    unique ("feed_item_id", "blocked_user_id")
);

create index if not exists "discovery_feed_item_blocks_feed_item_idx"
  on public."discovery_feed_item_blocks" using btree ("feed_item_id");

create index if not exists "discovery_feed_item_blocks_blocked_user_idx"
  on public."discovery_feed_item_blocks" using btree ("blocked_user_id");

alter table public."discovery_feed_items" enable row level security;
alter table public."discovery_feed_item_blocks" enable row level security;

drop policy if exists "discovery_feed_items_select_owner_operator"
  on public."discovery_feed_items";
create policy "discovery_feed_items_select_owner_operator"
  on public."discovery_feed_items"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "discovery_feed_items_insert_owner_operator"
  on public."discovery_feed_items";
create policy "discovery_feed_items_insert_owner_operator"
  on public."discovery_feed_items"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "discovery_feed_items_update_owner_operator"
  on public."discovery_feed_items";
create policy "discovery_feed_items_update_owner_operator"
  on public."discovery_feed_items"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "discovery_feed_item_blocks_select_owner_operator"
  on public."discovery_feed_item_blocks";
create policy "discovery_feed_item_blocks_select_owner_operator"
  on public."discovery_feed_item_blocks"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "discovery_feed_item_blocks_insert_owner_operator"
  on public."discovery_feed_item_blocks";
create policy "discovery_feed_item_blocks_insert_owner_operator"
  on public."discovery_feed_item_blocks"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "discovery_feed_item_blocks_update_owner_operator"
  on public."discovery_feed_item_blocks";
create policy "discovery_feed_item_blocks_update_owner_operator"
  on public."discovery_feed_item_blocks"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."discovery_feed_items" from "anon";
revoke all on table public."discovery_feed_item_blocks" from "anon";
grant select, insert, update on table public."discovery_feed_items" to "authenticated";
grant select, insert, update on table public."discovery_feed_item_blocks" to "authenticated";

comment on table public."discovery_feed_items" is
  'Discovery feed read-model foundation only. No app feed UI or spectator playback is wired in D2.';
comment on column public."discovery_feed_items"."is_spectator_playback_enabled" is
  'D2 guardrail: defaults false and is constrained false until a later explicit spectator playback lane.';
comment on table public."discovery_feed_item_blocks" is
  'Future materialized privacy/block filtering support for discovery feed items. Admin/operator locked in D2.';
