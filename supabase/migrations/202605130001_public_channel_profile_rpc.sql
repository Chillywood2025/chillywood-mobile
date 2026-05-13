create or replace function public.read_public_channel_profile(profile_user_id text)
returns table (
  user_id text,
  username text,
  avatar_index integer,
  display_name text,
  avatar_url text,
  tagline text,
  channel_layout_preset text,
  channel_role text,
  profile_visibility text,
  public_activity_visibility text,
  follower_surface_enabled boolean,
  subscriber_surface_enabled boolean,
  default_watch_party_join_policy text,
  default_watch_party_reactions_policy text,
  default_watch_party_content_access_rule text,
  default_watch_party_capture_policy text,
  default_communication_content_access_rule text,
  default_communication_capture_policy text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.user_id,
    profile.username,
    profile.avatar_index,
    profile.display_name,
    profile.avatar_url,
    profile.tagline,
    profile.channel_layout_preset,
    profile.channel_role,
    profile.profile_visibility,
    profile.public_activity_visibility,
    profile.follower_surface_enabled,
    profile.subscriber_surface_enabled,
    null::text as default_watch_party_join_policy,
    null::text as default_watch_party_reactions_policy,
    null::text as default_watch_party_content_access_rule,
    null::text as default_watch_party_capture_policy,
    null::text as default_communication_content_access_rule,
    null::text as default_communication_capture_policy
  from public.user_profiles profile
  where profile.user_id = nullif(btrim(coalesce(profile_user_id, '')), '')
    and public.can_view_profile_content(profile.user_id)
  limit 1;
$$;

revoke all on function public.read_public_channel_profile(text) from public;
grant execute on function public.read_public_channel_profile(text) to "anon";
grant execute on function public.read_public_channel_profile(text) to "authenticated";
grant execute on function public.read_public_channel_profile(text) to "postgres";
grant execute on function public.read_public_channel_profile(text) to "service_role";
