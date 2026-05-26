grant select on table public."discovery_feed_items" to "anon";

drop policy if exists "discovery_feed_items_select_spectator_public_safe_anon"
  on public."discovery_feed_items";

create policy "discovery_feed_items_select_spectator_public_safe_anon"
  on public."discovery_feed_items"
  for select
  to "anon"
  using (
    "allow_spectator_view" = true
    and "is_publicly_discoverable" = true
    and "visibility" = 'public'
    and "moderation_status" = 'clean'
    and "rights_status" in (
      'creator_owned',
      'chillywood_original',
      'licensed_for_public_stream'
    )
    and "access_type" = 'public_free'
    and "requires_premium_to_join" = false
    and "requires_ticket_to_watch" = false
    and "requires_subscription_to_watch" = false
    and coalesce(public.is_platform_owner_user("owner_user_id"), false) = false
    and coalesce(public.is_platform_owner_user("channel_user_id"), false) = false
    and coalesce(public.is_platform_owner_user("host_user_id"), false) = false
    and coalesce(public.is_platform_owner_user("follow_signal_user_id"), false) = false
    and coalesce(public.is_platform_owner_user("circle_signal_user_id"), false) = false
  );

comment on policy "discovery_feed_items_select_spectator_public_safe_anon"
  on public."discovery_feed_items" is
  'Signed-out Spectator may read only public-free, clean, public-safe rows that explicitly allow spectator view. Room creation and LiveKit access still require authenticated server-side checks.';
