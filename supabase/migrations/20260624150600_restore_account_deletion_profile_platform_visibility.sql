set check_function_bodies = false;

create or replace function public."resolve_profile_visibility_access"(
  profile_owner_id text,
  viewer_id text default (auth.uid())::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner_user_id text := nullif(btrim(coalesce(profile_owner_id, '')), '');
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

  if public.is_account_deletion_scheduled(v_owner_user_id) then
    return jsonb_build_object(
      'allowed', false,
      'visibility', 'private',
      'reason', 'account_deletion_scheduled',
      'is_owner', nullif(btrim(coalesce(viewer_id, '')), '') = v_owner_user_id,
      'is_blocked', false,
      'is_circle_member', false,
      'is_subscriber', false,
      'is_follower', false,
      'viewer_user_id', nullif(btrim(coalesce(viewer_id, '')), ''),
      'owner_user_id', v_owner_user_id
    );
  end if;

  return public."resolve_profile_platform_visibility_access"(v_owner_user_id, 'profile', viewer_id);
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
set search_path = public
as $$
declare
  v_owner_user_id text := nullif(btrim(coalesce(platform_owner_id, '')), '');
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

  if public.is_account_deletion_scheduled(v_owner_user_id) then
    return jsonb_build_object(
      'allowed', false,
      'visibility', 'private',
      'reason', 'account_deletion_scheduled',
      'is_owner', nullif(btrim(coalesce(viewer_id, '')), '') = v_owner_user_id,
      'is_blocked', false,
      'is_circle_member', false,
      'is_subscriber', false,
      'is_follower', false,
      'viewer_user_id', nullif(btrim(coalesce(viewer_id, '')), ''),
      'owner_user_id', v_owner_user_id
    );
  end if;

  return public."resolve_profile_platform_visibility_access"(v_owner_user_id, 'platform', viewer_id);
end;
$$;

create or replace function public.can_view_profile_content(profile_user_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  access_result jsonb;
begin
  access_result := public."resolve_profile_visibility_access"(profile_user_id, (auth.uid())::text);
  return coalesce((access_result->>'allowed')::boolean, false);
exception
  when others then
    return false;
end;
$$;

revoke all on function public."resolve_profile_visibility_access"(text, text) from public;
revoke all on function public."resolve_platform_visibility_access"(text, text) from public;
revoke all on function public.can_view_profile_content(text) from public;

grant execute on function public."resolve_profile_visibility_access"(text, text) to anon, authenticated, postgres, service_role;
grant execute on function public."resolve_platform_visibility_access"(text, text) to anon, authenticated, postgres, service_role;
grant execute on function public.can_view_profile_content(text) to anon, authenticated, postgres, service_role;

comment on function public."resolve_profile_visibility_access"(text, text) is
  'Safely resolves Profile access and fails closed for scheduled account deletion before public/private/subscriber gates.';

comment on function public."resolve_platform_visibility_access"(text, text) is
  'Safely resolves Platform access and fails closed for scheduled account deletion before public/private/subscriber gates.';

comment on function public.can_view_profile_content(text) is
  'Profile content RLS bridge that uses resolve_profile_visibility_access, including scheduled account deletion, public/private/subscriber, and block gates.';
