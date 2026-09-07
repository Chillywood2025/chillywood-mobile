set check_function_bodies = false;

-- Rachi is a protected platform-owned public identity, not a normal auth user.
-- Keep the existing profile-backed resolver intact for every ordinary account,
-- and place the single documented official identity in front of it. This makes
-- the Profile, Platform, and profile-content RLS decisions agree without
-- manufacturing a user_profiles row or granting Rachi any user/staff authority.
alter function public."resolve_profile_platform_visibility_access"(text, text, text)
  rename to "resolve_profile_platform_visibility_access_profile_backed_v1";

revoke all on function public."resolve_profile_platform_visibility_access_profile_backed_v1"(text, text, text)
  from public, anon, authenticated;
grant execute on function public."resolve_profile_platform_visibility_access_profile_backed_v1"(text, text, text)
  to postgres, service_role;

create function public."resolve_profile_platform_visibility_access"(
  p_owner_user_id text,
  p_surface text,
  p_viewer_user_id text default (auth.uid())::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner_user_id text := nullif(btrim(coalesce(p_owner_user_id, '')), '');
  v_surface text := lower(nullif(btrim(coalesce(p_surface, 'profile')), ''));
  v_authenticated_viewer_id text := (auth.uid())::text;
begin
  if v_surface not in ('profile', 'platform') then
    v_surface := 'profile';
  end if;

  if v_owner_user_id = 'platform_rachi_official' then
    return jsonb_build_object(
      'allowed', true,
      'visibility', 'public',
      'reason', 'official_public_allowed',
      'is_owner', false,
      'is_blocked', false,
      'is_circle_member', false,
      'is_subscriber', false,
      'is_follower', false,
      'viewer_user_id', v_authenticated_viewer_id,
      'owner_user_id', v_owner_user_id,
      'surface', v_surface,
      'official_identity', true
    );
  end if;

  return public."resolve_profile_platform_visibility_access_profile_backed_v1"(
    v_owner_user_id,
    v_surface,
    p_viewer_user_id
  );
end;
$$;

create or replace function public."resolve_profile_visibility_access"(
  profile_owner_id text,
  viewer_id text default (auth.uid())::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner_user_id text := nullif(btrim(coalesce(profile_owner_id, '')), '');
  v_hidden_reason text;
begin
  if v_owner_user_id is null then
    return jsonb_build_object(
      'allowed', false,
      'visibility', 'public',
      'reason', 'not_found',
      'is_owner', false,
      'is_blocked', false,
      'is_circle_member', false,
      'is_subscriber', false,
      'is_follower', false,
      'viewer_user_id', nullif(btrim(coalesce(viewer_id, '')), ''),
      'owner_user_id', v_owner_user_id
    );
  end if;

  v_hidden_reason := public."account_deletion_public_hidden_reason"(v_owner_user_id);
  if v_hidden_reason is not null then
    return jsonb_build_object(
      'allowed', false,
      'visibility', 'private',
      'reason', v_hidden_reason,
      'is_owner', nullif(btrim(coalesce(viewer_id, '')), '') = v_owner_user_id,
      'is_blocked', false,
      'is_circle_member', false,
      'is_subscriber', false,
      'is_follower', false,
      'viewer_user_id', nullif(btrim(coalesce(viewer_id, '')), ''),
      'owner_user_id', v_owner_user_id
    );
  end if;

  return public."resolve_profile_platform_visibility_access"(
    v_owner_user_id,
    'profile',
    viewer_id
  );
end;
$$;

create or replace function public."resolve_platform_visibility_access"(
  platform_owner_id text,
  viewer_id text default (auth.uid())::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner_user_id text := nullif(btrim(coalesce(platform_owner_id, '')), '');
  v_hidden_reason text;
begin
  if v_owner_user_id is null then
    return jsonb_build_object(
      'allowed', false,
      'visibility', 'public',
      'reason', 'not_found',
      'is_owner', false,
      'is_blocked', false,
      'is_circle_member', false,
      'is_subscriber', false,
      'is_follower', false,
      'viewer_user_id', nullif(btrim(coalesce(viewer_id, '')), ''),
      'owner_user_id', v_owner_user_id
    );
  end if;

  v_hidden_reason := public."account_deletion_public_hidden_reason"(v_owner_user_id);
  if v_hidden_reason is not null then
    return jsonb_build_object(
      'allowed', false,
      'visibility', 'private',
      'reason', v_hidden_reason,
      'is_owner', nullif(btrim(coalesce(viewer_id, '')), '') = v_owner_user_id,
      'is_blocked', false,
      'is_circle_member', false,
      'is_subscriber', false,
      'is_follower', false,
      'viewer_user_id', nullif(btrim(coalesce(viewer_id, '')), ''),
      'owner_user_id', v_owner_user_id
    );
  end if;

  return public."resolve_profile_platform_visibility_access"(
    v_owner_user_id,
    'platform',
    viewer_id
  );
end;
$$;

create or replace function public.can_view_profile_content(profile_user_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  access_result jsonb;
begin
  access_result := public."resolve_profile_visibility_access"(
    profile_user_id,
    (auth.uid())::text
  );
  return coalesce((access_result->>'allowed')::boolean, false);
exception
  when others then
    return false;
end;
$$;

-- Account restriction hardening correctly fails closed for arbitrary non-UUID
-- subjects. Rachi is the one documented non-auth content publisher, so allow
-- only service authority or the existing owner/operator-gated admin path to
-- write that exact subject. Ordinary users still cannot post as Rachi.
create or replace function public."enforce_profile_posts_account_access_guard"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new."user_id" = 'platform_rachi_official' then
    if auth.role() = 'service_role'
      or (
        auth.uid() is not null
        and public.has_platform_role(array['owner'::text, 'operator'::text])
      )
    then
      return new;
    end if;

    raise exception using
      errcode = '42501',
      message = 'official_rachi_operator_required';
  end if;

  perform public."assert_account_private_feature_allowed"(
    new."user_id",
    'profile_post'
  );
  return new;
end;
$$;

revoke all on function public."resolve_profile_platform_visibility_access"(text, text, text)
  from public;
revoke all on function public."resolve_profile_visibility_access"(text, text)
  from public;
revoke all on function public."resolve_platform_visibility_access"(text, text)
  from public;
revoke all on function public.can_view_profile_content(text)
  from public;
revoke all on function public."enforce_profile_posts_account_access_guard"()
  from public, anon, authenticated, service_role;

grant execute on function public."resolve_profile_platform_visibility_access"(text, text, text)
  to anon, authenticated, postgres, service_role;
grant execute on function public."resolve_profile_visibility_access"(text, text)
  to anon, authenticated, postgres, service_role;
grant execute on function public."resolve_platform_visibility_access"(text, text)
  to anon, authenticated, postgres, service_role;
grant execute on function public.can_view_profile_content(text)
  to anon, authenticated, postgres, service_role;

comment on function public."resolve_profile_platform_visibility_access"(text, text, text) is
  'Resolves Profile/Platform visibility. The exact protected Rachi pseudo-account is public without becoming an auth, owner, operator, Circle, subscriber, or follower identity; every ordinary account delegates unchanged to the profile-backed resolver.';

comment on function public."resolve_profile_platform_visibility_access_profile_backed_v1"(text, text, text) is
  'Internal pre-existing Profile/Platform resolver retained unchanged for normal user_profiles-backed identities.';

comment on function public."resolve_profile_visibility_access"(text, text) is
  'Safely resolves Profile access, including scheduled/completed deletion, the exact public Rachi identity, and ordinary public/private/subscriber access.';

comment on function public."resolve_platform_visibility_access"(text, text) is
  'Safely resolves Platform access, including scheduled/completed deletion, the exact public Rachi identity, and ordinary public/private/subscriber access.';

comment on function public.can_view_profile_content(text) is
  'Profile-content RLS bridge. Allows only authorized ordinary profiles or the exact public Rachi pseudo-account; row visibility, moderation, and deletion policies remain independently enforced.';

comment on function public."enforce_profile_posts_account_access_guard"() is
  'Fails closed for restricted normal accounts and permits the exact non-auth Rachi publisher only through service authority or the existing owner/operator-gated admin path.';
