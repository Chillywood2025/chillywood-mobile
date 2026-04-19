alter table public."user_profiles"
  add column if not exists "public_activity_visibility" text,
  add column if not exists "follower_surface_enabled" boolean,
  add column if not exists "subscriber_surface_enabled" boolean;

update public."user_profiles"
set
  "public_activity_visibility" = coalesce("public_activity_visibility", 'public'::text),
  "follower_surface_enabled" = coalesce("follower_surface_enabled", false),
  "subscriber_surface_enabled" = coalesce("subscriber_surface_enabled", false)
where
  "public_activity_visibility" is null
  or "follower_surface_enabled" is null
  or "subscriber_surface_enabled" is null;

alter table public."user_profiles"
  alter column "public_activity_visibility" set default 'public'::text,
  alter column "public_activity_visibility" set not null,
  alter column "follower_surface_enabled" set default false,
  alter column "follower_surface_enabled" set not null,
  alter column "subscriber_surface_enabled" set default false,
  alter column "subscriber_surface_enabled" set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_public_activity_visibility_check'
  ) then
    alter table public."user_profiles"
      add constraint "user_profiles_public_activity_visibility_check"
      check ("public_activity_visibility" in ('public', 'followers_only', 'subscribers_only', 'private'));
  end if;
end
$$;
