-- Room/session discovery consent is not public Owner profile consent. These
-- SECURITY DEFINER readers do not inherit user_profiles RLS; enforce the same
-- self-only Owner boundary on their final returned identity, not on user input.
-- Dedicated staff inspection APIs and ordinary profile visibility stay intact.
alter function public.read_public_channel_profile(text)
  rename to read_public_channel_profile_pre_owner_boundary;
revoke all on function public.read_public_channel_profile_pre_owner_boundary(text)
  from public, anon, authenticated, service_role;
create function public.read_public_channel_profile(profile_user_id text)
returns table (
  user_id text, username text, avatar_index integer, display_name text, avatar_url text,
  profile_avatar_media_status text, profile_avatar_media_flagged_at timestamptz,
  tagline text, channel_layout_preset text, channel_role text, profile_visibility text,
  public_activity_visibility text, follower_surface_enabled boolean, subscriber_surface_enabled boolean,
  default_watch_party_join_policy text, default_watch_party_reactions_policy text,
  default_watch_party_content_access_rule text, default_watch_party_capture_policy text,
  default_communication_content_access_rule text, default_communication_capture_policy text,
  profile_avatar_fit_mode text, profile_avatar_focal_x numeric, profile_avatar_focal_y numeric,
  profile_background_url text, profile_background_media_status text,
  profile_background_media_flagged_at timestamptz, profile_background_fit_mode text,
  profile_background_focal_x numeric, profile_background_focal_y numeric,
  profile_background_overlay_strength numeric
)
language sql stable security definer set search_path = '' as $$
  select profile.* from public.read_public_channel_profile_pre_owner_boundary(profile_user_id) profile
  where not public.is_platform_owner_user(profile.user_id) or profile.user_id = auth.uid()::text;
$$;
revoke all on function public.read_public_channel_profile(text) from public, anon, authenticated, service_role;
grant execute on function public.read_public_channel_profile(text) to anon, authenticated, service_role;

alter function public.read_public_platform_identity(text)
  rename to read_public_platform_identity_pre_owner_boundary;
revoke all on function public.read_public_platform_identity_pre_owner_boundary(text)
  from public, anon, authenticated, service_role;
create function public.read_public_platform_identity(profile_user_id text)
returns table (
  user_id text, username text, display_name text, tagline text,
  channel_layout_preset text, channel_role text,
  follower_surface_enabled boolean, subscriber_surface_enabled boolean,
  platform_access_visibility text
)
language sql stable security definer set search_path = '' as $$
  select profile.* from public.read_public_platform_identity_pre_owner_boundary(profile_user_id) profile
  where not public.is_platform_owner_user(profile.user_id) or profile.user_id = auth.uid()::text;
$$;
revoke all on function public.read_public_platform_identity(text) from public, anon, authenticated, service_role;
grant execute on function public.read_public_platform_identity(text) to anon, authenticated, service_role;
