set check_function_bodies = false;

-- Platform role membership does not replace a user's personal Profile identity.
-- Apply the same Profile visibility, exact-object, and malware-clean gates to
-- Owner personal media that already apply to every other account.
create or replace function public.resolve_profile_media_delivery(
  p_owner_user_id text,
  p_object_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner_user_id text := nullif(btrim(coalesce(p_owner_user_id, '')), '');
  v_object_key text := nullif(btrim(coalesce(p_object_key, '')), '');
  v_canonical_url text;
  v_profile public.user_profiles%rowtype;
  v_media_kind text;
  v_scan_status text;
begin
  if v_owner_user_id is null or v_object_key is null
    or length(v_owner_user_id) > 128 or length(v_object_key) > 1024
    or v_object_key like '%..%'
    or not (
      v_object_key like v_owner_user_id || '/avatar/%'
      or v_object_key like v_owner_user_id || '/background/%'
      or (
        v_owner_user_id = 'platform_rachi_official'
        and v_object_key like 'official/rachi/avatar/%'
      )
    )
  then
    return jsonb_build_object(
      'authoritative', true,
      'allowed', false,
      'reason', 'profile_media_identity_invalid'
    );
  end if;

  v_canonical_url := public.profile_media_public_url(v_owner_user_id, v_object_key);

  select profile.* into v_profile
  from public.user_profiles profile
  where profile.user_id = v_owner_user_id
    and public.can_view_profile_content(profile.user_id)
  limit 1;

  if not found then
    return jsonb_build_object(
      'authoritative', true,
      'allowed', false,
      'reason', 'profile_media_not_visible',
      'ownerUserId', v_owner_user_id,
      'objectKey', v_object_key
    );
  end if;

  if v_profile.avatar_url = v_canonical_url then
    v_media_kind := 'avatar';
    v_scan_status := v_profile.profile_avatar_scan_status;
  elsif v_profile.profile_background_url = v_canonical_url then
    v_media_kind := 'background';
    v_scan_status := v_profile.profile_background_scan_status;
  else
    return jsonb_build_object(
      'authoritative', true,
      'allowed', false,
      'reason', 'profile_media_not_current',
      'ownerUserId', v_owner_user_id,
      'objectKey', v_object_key
    );
  end if;

  if not public.media_scan_public_safe(v_scan_status) then
    return jsonb_build_object(
      'authoritative', true,
      'allowed', false,
      'reason', 'profile_media_scan_blocked',
      'ownerUserId', v_owner_user_id,
      'objectKey', v_object_key,
      'mediaKind', v_media_kind,
      'scanStatus', coalesce(v_scan_status, 'unknown')
    );
  end if;

  return jsonb_build_object(
    'authoritative', true,
    'allowed', true,
    'reason', 'profile_media_exact_clean',
    'ownerUserId', v_owner_user_id,
    'objectKey', v_object_key,
    'mediaKind', v_media_kind,
    'scanStatus', 'clean'
  );
end;
$$;

revoke all on function public.resolve_profile_media_delivery(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_profile_media_delivery(text, text)
  to anon, authenticated, service_role;

comment on function public.resolve_profile_media_delivery(text, text) is
  'Resolves exact clean personal Profile media under current Profile visibility. Platform role membership grants no media bypass and does not suppress an otherwise authorized personal Profile.';
