alter table public."user_profiles"
  add column if not exists "profile_access_visibility" text not null default 'public',
  add column if not exists "platform_access_visibility" text not null default 'public';

update public."user_profiles"
set
  "profile_access_visibility" = case
    when coalesce(nullif("profile_access_visibility", ''), 'public') in ('public', 'private', 'subscriber_only')
      then coalesce(nullif("profile_access_visibility", ''), 'public')
    when coalesce(nullif("profile_visibility", ''), 'everyone') = 'chilly_circle_only'
      then 'private'
    when coalesce(nullif("profile_visibility", ''), 'everyone') = 'private'
      then 'private'
    else 'public'
  end,
  "platform_access_visibility" = case
    when coalesce(nullif("platform_access_visibility", ''), 'public') in ('public', 'private', 'subscriber_only')
      then coalesce(nullif("platform_access_visibility", ''), 'public')
    else 'public'
  end;

alter table public."user_profiles"
  drop constraint if exists "user_profiles_profile_access_visibility_check",
  drop constraint if exists "user_profiles_platform_access_visibility_check";

alter table public."user_profiles"
  add constraint "user_profiles_profile_access_visibility_check"
    check ("profile_access_visibility" in ('public'::text, 'private'::text, 'subscriber_only'::text)),
  add constraint "user_profiles_platform_access_visibility_check"
    check ("platform_access_visibility" in ('public'::text, 'private'::text, 'subscriber_only'::text));

create index if not exists "user_profiles_profile_access_visibility_idx"
  on public."user_profiles" ("profile_access_visibility", "updated_at" desc);

create index if not exists "user_profiles_platform_access_visibility_idx"
  on public."user_profiles" ("platform_access_visibility", "updated_at" desc);

comment on column public."user_profiles"."profile_access_visibility" is
  'Hard access gate for the Profile surface. public = anyone, private = active Chi''lly Circle member or active creator subscriber, subscriber_only = active creator subscriber only. Followers do not unlock access.';

comment on column public."user_profiles"."platform_access_visibility" is
  'Hard access gate for the public Platform surface. public = anyone, private = active Chi''lly Circle member or active creator subscriber, subscriber_only = active creator subscriber only. Followers do not unlock access.';

create or replace function public."resolve_profile_platform_visibility_access"(
  p_owner_user_id text,
  p_surface text,
  p_viewer_user_id text default (auth.uid())::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner_user_id text := nullif(btrim(coalesce(p_owner_user_id, '')), '');
  v_surface text := lower(nullif(btrim(coalesce(p_surface, 'profile')), ''));
  v_auth_user_id text := (auth.uid())::text;
  v_requested_viewer_id text := nullif(btrim(coalesce(p_viewer_user_id, '')), '');
  v_viewer_user_id text := null;
  v_profile public."user_profiles"%rowtype;
  v_visibility text := 'public';
  v_is_owner boolean := false;
  v_is_operator boolean := false;
  v_is_blocked boolean := false;
  v_is_circle_member boolean := false;
  v_is_subscriber boolean := false;
  v_is_follower boolean := false;
  v_pair_low_id text;
  v_pair_high_id text;
begin
  if v_surface not in ('profile', 'platform') then
    v_surface := 'profile';
  end if;

  if v_auth_user_id is not null and public.has_platform_role(array['owner'::text, 'operator'::text]) then
    v_is_operator := true;
  end if;

  if v_auth_user_id is not null then
    v_viewer_user_id := v_auth_user_id;
  elsif v_requested_viewer_id is not null and v_is_operator then
    v_viewer_user_id := v_requested_viewer_id;
  else
    v_viewer_user_id := null;
  end if;

  if v_owner_user_id is null then
    return jsonb_build_object(
      'allowed', false,
      'visibility', v_visibility,
      'reason', 'not_found',
      'is_owner', false,
      'is_blocked', false,
      'is_circle_member', false,
      'is_subscriber', false,
      'is_follower', false,
      'viewer_user_id', v_viewer_user_id,
      'owner_user_id', v_owner_user_id
    );
  end if;

  select *
  into v_profile
  from public."user_profiles"
  where "user_id" = v_owner_user_id
  limit 1;

  if v_profile."user_id" is null then
    return jsonb_build_object(
      'allowed', false,
      'visibility', v_visibility,
      'reason', 'not_found',
      'is_owner', false,
      'is_blocked', false,
      'is_circle_member', false,
      'is_subscriber', false,
      'is_follower', false,
      'viewer_user_id', v_viewer_user_id,
      'owner_user_id', v_owner_user_id
    );
  end if;

  v_visibility := case
    when v_surface = 'platform' then coalesce(nullif(v_profile."platform_access_visibility", ''), 'public')
    else coalesce(nullif(v_profile."profile_access_visibility", ''), 'public')
  end;

  if v_visibility not in ('public', 'private', 'subscriber_only') then
    v_visibility := 'public';
  end if;

  v_is_owner := v_viewer_user_id is not null and v_viewer_user_id = v_owner_user_id;

  if v_viewer_user_id is not null and not v_is_owner then
    select exists (
      select 1
      from public."channel_audience_blocks" block_row
      where (
        block_row."channel_user_id" = v_owner_user_id
        and block_row."blocked_user_id" = v_viewer_user_id
      ) or (
        block_row."channel_user_id" = v_viewer_user_id
        and block_row."blocked_user_id" = v_owner_user_id
      )
      limit 1
    ) into v_is_blocked;

    select exists (
      select 1
      from public."channel_followers" follower_row
      where follower_row."channel_user_id" = v_owner_user_id
        and follower_row."follower_user_id" = v_viewer_user_id
      limit 1
    ) into v_is_follower;

    v_pair_low_id := least(v_viewer_user_id, v_owner_user_id);
    v_pair_high_id := greatest(v_viewer_user_id, v_owner_user_id);

    select exists (
      select 1
      from public."user_friendships" friendship_row
      where friendship_row."user_low_id" = v_pair_low_id
        and friendship_row."user_high_id" = v_pair_high_id
        and friendship_row."status" = 'active'::text
      limit 1
    ) into v_is_circle_member;

    select exists (
      select 1
      from public."channel_subscribers" subscriber_row
      where subscriber_row."channel_user_id" = v_owner_user_id
        and subscriber_row."subscriber_user_id" = v_viewer_user_id
        and subscriber_row."status" in ('active'::text, 'grace_period'::text)
      limit 1
    ) or exists (
      select 1
      from public."creator_channel_subscriptions" subscription_row
      where subscription_row."creator_id"::text = v_owner_user_id
        and subscription_row."subscriber_id"::text = v_viewer_user_id
        and subscription_row."status" in ('active'::text, 'trialing'::text, 'grace_period'::text, 'cancel_pending'::text)
        and (subscription_row."current_period_end" is null or subscription_row."current_period_end" > timezone('utc'::text, now()))
        and subscription_row."revoked_at" is null
        and subscription_row."expired_at" is null
      limit 1
    ) into v_is_subscriber;
  end if;

  if v_is_blocked and not v_is_operator then
    return jsonb_build_object(
      'allowed', false,
      'visibility', v_visibility,
      'reason', 'blocked',
      'is_owner', v_is_owner,
      'is_blocked', true,
      'is_circle_member', v_is_circle_member,
      'is_subscriber', v_is_subscriber,
      'is_follower', v_is_follower,
      'viewer_user_id', v_viewer_user_id,
      'owner_user_id', v_owner_user_id
    );
  end if;

  if v_is_owner or v_is_operator then
    return jsonb_build_object(
      'allowed', true,
      'visibility', v_visibility,
      'reason', case when v_is_owner then 'owner_allowed' else 'operator_allowed' end,
      'is_owner', v_is_owner,
      'is_blocked', v_is_blocked,
      'is_circle_member', v_is_circle_member,
      'is_subscriber', v_is_subscriber,
      'is_follower', v_is_follower,
      'viewer_user_id', v_viewer_user_id,
      'owner_user_id', v_owner_user_id
    );
  end if;

  if v_visibility = 'public' then
    return jsonb_build_object(
      'allowed', true,
      'visibility', v_visibility,
      'reason', 'public_allowed',
      'is_owner', false,
      'is_blocked', false,
      'is_circle_member', v_is_circle_member,
      'is_subscriber', v_is_subscriber,
      'is_follower', v_is_follower,
      'viewer_user_id', v_viewer_user_id,
      'owner_user_id', v_owner_user_id
    );
  end if;

  if v_viewer_user_id is null then
    return jsonb_build_object(
      'allowed', false,
      'visibility', v_visibility,
      'reason', 'signed_out_requires_access',
      'is_owner', false,
      'is_blocked', false,
      'is_circle_member', false,
      'is_subscriber', false,
      'is_follower', false,
      'viewer_user_id', null,
      'owner_user_id', v_owner_user_id
    );
  end if;

  if v_visibility = 'private' and (v_is_circle_member or v_is_subscriber) then
    return jsonb_build_object(
      'allowed', true,
      'visibility', v_visibility,
      'reason', case when v_is_subscriber then 'subscriber_allowed' else 'circle_member_allowed' end,
      'is_owner', false,
      'is_blocked', false,
      'is_circle_member', v_is_circle_member,
      'is_subscriber', v_is_subscriber,
      'is_follower', v_is_follower,
      'viewer_user_id', v_viewer_user_id,
      'owner_user_id', v_owner_user_id
    );
  end if;

  if v_visibility = 'subscriber_only' and v_is_subscriber then
    return jsonb_build_object(
      'allowed', true,
      'visibility', v_visibility,
      'reason', 'subscriber_allowed',
      'is_owner', false,
      'is_blocked', false,
      'is_circle_member', v_is_circle_member,
      'is_subscriber', true,
      'is_follower', v_is_follower,
      'viewer_user_id', v_viewer_user_id,
      'owner_user_id', v_owner_user_id
    );
  end if;

  return jsonb_build_object(
    'allowed', false,
    'visibility', v_visibility,
    'reason', case when v_visibility = 'subscriber_only' then 'subscriber_required' else 'circle_or_subscriber_required' end,
    'is_owner', false,
    'is_blocked', false,
    'is_circle_member', v_is_circle_member,
    'is_subscriber', v_is_subscriber,
    'is_follower', v_is_follower,
    'viewer_user_id', v_viewer_user_id,
    'owner_user_id', v_owner_user_id
  );
end;
$$;

create or replace function public."resolve_profile_visibility_access"(
  profile_owner_id text,
  viewer_id text default (auth.uid())::text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public."resolve_profile_platform_visibility_access"(profile_owner_id, 'profile', viewer_id);
$$;

create or replace function public."resolve_platform_visibility_access"(
  platform_owner_id text,
  viewer_id text default (auth.uid())::text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public."resolve_profile_platform_visibility_access"(platform_owner_id, 'platform', viewer_id);
$$;

revoke all on function public."resolve_profile_platform_visibility_access"(text, text, text) from public;
revoke all on function public."resolve_profile_visibility_access"(text, text) from public;
revoke all on function public."resolve_platform_visibility_access"(text, text) from public;

grant execute on function public."resolve_profile_platform_visibility_access"(text, text, text) to anon, authenticated, postgres, service_role;
grant execute on function public."resolve_profile_visibility_access"(text, text) to anon, authenticated, postgres, service_role;
grant execute on function public."resolve_platform_visibility_access"(text, text) to anon, authenticated, postgres, service_role;

comment on function public."resolve_profile_visibility_access"(text, text) is
  'Safely resolves Profile public/private/subscriber_only access. Followers are social-only and do not unlock private or subscriber-only Profile access.';

comment on function public."resolve_platform_visibility_access"(text, text) is
  'Safely resolves Platform public/private/subscriber_only access. Followers are social-only and do not unlock private or subscriber-only Platform access.';
