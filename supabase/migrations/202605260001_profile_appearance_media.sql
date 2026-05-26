insert into storage.buckets ("id", "name", "public", "file_size_limit", "allowed_mime_types")
values (
  'profile-media',
  'profile-media',
  true,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict ("id") do update
set
  "public" = true,
  "file_size_limit" = excluded."file_size_limit",
  "allowed_mime_types" = excluded."allowed_mime_types";

alter table public."user_profiles"
  add column if not exists "profile_avatar_fit_mode" text default 'fill'::text not null,
  add column if not exists "profile_avatar_focal_x" numeric default 0.5 not null,
  add column if not exists "profile_avatar_focal_y" numeric default 0.5 not null,
  add column if not exists "profile_background_url" text,
  add column if not exists "profile_background_fit_mode" text default 'fill'::text not null,
  add column if not exists "profile_background_focal_x" numeric default 0.5 not null,
  add column if not exists "profile_background_focal_y" numeric default 0.5 not null,
  add column if not exists "profile_background_overlay_strength" numeric default 0.58 not null,
  add column if not exists "profile_media_updated_at" timestamp with time zone;

alter table public."user_profiles"
  drop constraint if exists "user_profiles_profile_avatar_fit_mode_check";
alter table public."user_profiles"
  add constraint "user_profiles_profile_avatar_fit_mode_check"
  check ("profile_avatar_fit_mode" in ('fill'::text, 'fit'::text, 'center'::text));

alter table public."user_profiles"
  drop constraint if exists "user_profiles_profile_background_fit_mode_check";
alter table public."user_profiles"
  add constraint "user_profiles_profile_background_fit_mode_check"
  check ("profile_background_fit_mode" in ('fill'::text, 'fit'::text, 'center'::text));

alter table public."user_profiles"
  drop constraint if exists "user_profiles_profile_avatar_focal_check";
alter table public."user_profiles"
  add constraint "user_profiles_profile_avatar_focal_check"
  check (
    "profile_avatar_focal_x" >= 0 and "profile_avatar_focal_x" <= 1
    and "profile_avatar_focal_y" >= 0 and "profile_avatar_focal_y" <= 1
  );

alter table public."user_profiles"
  drop constraint if exists "user_profiles_profile_background_focal_check";
alter table public."user_profiles"
  add constraint "user_profiles_profile_background_focal_check"
  check (
    "profile_background_focal_x" >= 0 and "profile_background_focal_x" <= 1
    and "profile_background_focal_y" >= 0 and "profile_background_focal_y" <= 1
  );

alter table public."user_profiles"
  drop constraint if exists "user_profiles_profile_background_overlay_check";
alter table public."user_profiles"
  add constraint "user_profiles_profile_background_overlay_check"
  check ("profile_background_overlay_strength" >= 0 and "profile_background_overlay_strength" <= 0.9);

drop policy if exists "profile_media_storage_select_public" on storage.objects;
create policy "profile_media_storage_select_public"
  on storage.objects
  for select
  to public
  using (bucket_id = 'profile-media');

drop policy if exists "profile_media_storage_insert_owner_prefix" on storage.objects;
create policy "profile_media_storage_insert_owner_prefix"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-media'
    and split_part(name, '/', 1) = (auth.uid())::text
  );

drop policy if exists "profile_media_storage_update_owner_prefix" on storage.objects;
create policy "profile_media_storage_update_owner_prefix"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile-media'
    and split_part(name, '/', 1) = (auth.uid())::text
  )
  with check (
    bucket_id = 'profile-media'
    and split_part(name, '/', 1) = (auth.uid())::text
  );

drop policy if exists "profile_media_storage_delete_owner_prefix" on storage.objects;
create policy "profile_media_storage_delete_owner_prefix"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-media'
    and split_part(name, '/', 1) = (auth.uid())::text
  );

drop function if exists public.read_public_channel_profile(text);
create function public.read_public_channel_profile(profile_user_id text)
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
  default_communication_capture_policy text,
  profile_avatar_fit_mode text,
  profile_avatar_focal_x numeric,
  profile_avatar_focal_y numeric,
  profile_background_url text,
  profile_background_fit_mode text,
  profile_background_focal_x numeric,
  profile_background_focal_y numeric,
  profile_background_overlay_strength numeric
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
    null::text as default_communication_capture_policy,
    profile.profile_avatar_fit_mode,
    profile.profile_avatar_focal_x,
    profile.profile_avatar_focal_y,
    profile.profile_background_url,
    profile.profile_background_fit_mode,
    profile.profile_background_focal_x,
    profile.profile_background_focal_y,
    profile.profile_background_overlay_strength
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

comment on column public."user_profiles"."profile_background_url" is
  'Personal Profile background image URL. Separate from Platform Brand Studio hero/background assets.';
comment on column public."user_profiles"."profile_background_fit_mode" is
  'Personal Profile background fit mode: fill, fit, or center.';
comment on column public."user_profiles"."profile_avatar_fit_mode" is
  'Personal Profile avatar fit mode. Separate from Platform Brand Studio avatar/logo assets.';
