-- Separate editable Brand drafts from the explicit, atomic public publication.
-- Existing publications are preserved once; subsequent legacy draft upserts,
-- including writes to published_at, cannot update the public snapshot.
create table public.platform_brand_publications (
  like public.platform_brand_profiles including defaults including constraints
);
alter table public.platform_brand_publications add primary key (owner_user_id);
-- LIKE does not copy foreign keys. Preserve existing deletion/unpublish and
-- asset-removal semantics rather than retaining orphan public snapshots.
alter table public.platform_brand_publications
  add foreign key (owner_user_id) references public.platform_brand_profiles(owner_user_id) on delete cascade,
  add foreign key (hero_image_asset_id) references public.platform_brand_assets(id) on delete set null,
  add foreign key (hero_video_asset_id) references public.platform_brand_assets(id) on delete set null,
  add foreign key (hero_poster_asset_id) references public.platform_brand_assets(id) on delete set null,
  add foreign key (background_image_asset_id) references public.platform_brand_assets(id) on delete set null,
  add foreign key (avatar_asset_id) references public.platform_brand_assets(id) on delete set null,
  add foreign key (logo_asset_id) references public.platform_brand_assets(id) on delete set null,
  add foreign key (watermark_asset_id) references public.platform_brand_assets(id) on delete set null;
alter table public.platform_brand_publications enable row level security;
alter table public.platform_brand_publications force row level security;
revoke all on table public.platform_brand_publications from public, anon, authenticated, service_role;
grant select on table public.platform_brand_publications to service_role;

insert into public.platform_brand_publications
select * from public.platform_brand_profiles where published_at is not null;

comment on table public.platform_brand_publications is
  'Server-owned published Platform presentation. Draft writes never change this snapshot; public reads use the gated projection.';

-- Old clients publish by directly upserting a new published_at after saving
-- the draft. Reject that write rather than acknowledging a publication that
-- cannot reach the snapshot. Current_user is database execution authority,
-- not a caller-controlled JWT or custom GUC. The atomic SECURITY DEFINER RPC
-- writes as its trusted owner; direct authenticated draft edits cannot.
-- AFTER row timing intentionally checks the actual ON CONFLICT outcome, so
-- existing drafts may resend unchanged publication metadata without failing
-- the INSERT leg of a legitimate upsert.
create function public.guard_platform_brand_profile_publication_metadata()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user <> 'service_role'
    and current_user <> pg_catalog.pg_get_userbyid((select relation.relowner
      from pg_catalog.pg_class relation where relation.oid = tg_relid)) then
    if (tg_op = 'INSERT' and new.published_at is not null)
      or (tg_op = 'UPDATE' and new.published_at is distinct from old.published_at) then
      raise exception using errcode = '42501', message = 'brand_publish_rpc_required';
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.guard_platform_brand_profile_publication_metadata()
  from public, anon, authenticated, service_role;
create trigger guard_platform_brand_profile_publication_metadata
  after insert or update on public.platform_brand_profiles
  for each row execute function public.guard_platform_brand_profile_publication_metadata();

-- A viewer-neutral predicate: owner/reviewer row access must never be mistaken
-- for public-safe media, including when owners preview their public Platform.
create function public.platform_brand_publication_asset_safe_internal(
  p_asset_id uuid, p_owner_user_id text
)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_brand_assets asset
    where asset.id = p_asset_id and asset.owner_user_id = p_owner_user_id
      and asset.asset_state = 'published'
      and asset.moderation_status in ('clean', 'reported')
      and public.media_scan_public_safe(asset.scan_status)
      and asset.quarantined_at is null and asset.deleted_at is null
      and lower(btrim(coalesce(asset.storage_provider, ''))) = 'supabase'
      and asset.storage_bucket = 'platform-brand-assets'
      and nullif(btrim(asset.storage_object_key), '') is not null
      and asset.storage_object_key = asset.storage_path
      and (storage.foldername(asset.storage_path))[1] = asset.owner_user_id
  );
$$;
revoke all on function public.platform_brand_publication_asset_safe_internal(uuid,text)
  from public, anon, authenticated, service_role;

create or replace function public."read_public_platform_brand_profile"(profile_user_id text)
returns table (
  owner_user_id text,
  hero_image_asset_id uuid,
  hero_video_asset_id uuid,
  hero_poster_asset_id uuid,
  background_image_asset_id uuid,
  avatar_asset_id uuid,
  logo_asset_id uuid,
  watermark_asset_id uuid,
  spotlight_video_id text,
  theme_preset text,
  accent_color text,
  hero_fit_mode text,
  hero_focal_x numeric,
  hero_focal_y numeric,
  hero_crop_scale numeric,
  background_fit_mode text,
  background_focal_x numeric,
  background_focal_y numeric,
  overlay_strength numeric,
  blur_strength numeric,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile."owner_user_id",
    case
      when public.platform_brand_publication_asset_safe_internal(profile."hero_image_asset_id", profile."owner_user_id")
        then profile."hero_image_asset_id"
      else null
    end as "hero_image_asset_id",
    case
      when public.platform_brand_publication_asset_safe_internal(profile."hero_video_asset_id", profile."owner_user_id")
        then profile."hero_video_asset_id"
      else null
    end as "hero_video_asset_id",
    case
      when public.platform_brand_publication_asset_safe_internal(profile."hero_poster_asset_id", profile."owner_user_id")
        then profile."hero_poster_asset_id"
      else null
    end as "hero_poster_asset_id",
    case
      when public.platform_brand_publication_asset_safe_internal(profile."background_image_asset_id", profile."owner_user_id")
        then profile."background_image_asset_id"
      else null
    end as "background_image_asset_id",
    case
      when public.platform_brand_publication_asset_safe_internal(profile."avatar_asset_id", profile."owner_user_id")
        then profile."avatar_asset_id"
      else null
    end as "avatar_asset_id",
    case
      when public.platform_brand_publication_asset_safe_internal(profile."logo_asset_id", profile."owner_user_id")
        then profile."logo_asset_id"
      else null
    end as "logo_asset_id",
    case
      when public.platform_brand_publication_asset_safe_internal(profile."watermark_asset_id", profile."owner_user_id")
        then profile."watermark_asset_id"
      else null
    end as "watermark_asset_id",
    case
      when exists (
        select 1
        from public."videos" video
        where video."id"::text = profile."spotlight_video_id"
          and video."owner_id"::text = profile."owner_user_id"
          and video."visibility" = 'public'
          and video."moderation_status" in ('clean', 'reported')
          and public.media_scan_public_safe(video."scan_status")
          and video."quarantined_at" is null
      )
        then profile."spotlight_video_id"
      else null
    end as "spotlight_video_id",
    profile."theme_preset",
    profile."accent_color",
    profile."hero_fit_mode",
    profile."hero_focal_x",
    profile."hero_focal_y",
    profile."hero_crop_scale",
    profile."background_fit_mode",
    profile."background_focal_x",
    profile."background_focal_y",
    profile."overlay_strength",
    profile."blur_strength",
    profile."published_at",
    profile."updated_at"
  from public."platform_brand_publications" profile
  where profile."owner_user_id" = nullif(btrim(coalesce(profile_user_id, '')), '')
    and profile."published_at" is not null
    -- Deletion-request visibility alone does not cover a removed auth account.
    -- Rachi is the one existing, explicitly supported non-auth public subject.
    and (profile."owner_user_id" = 'platform_rachi_official'
      or exists (select 1 from auth.users subject
        where subject.id::text = profile."owner_user_id" and subject.deleted_at is null))
    and coalesce((public.resolve_platform_visibility_access(profile."owner_user_id", auth.uid()::text) ->> 'allowed')::boolean, false)
    and (auth.uid() is null or not public.has_channel_audience_block_between(profile."owner_user_id", auth.uid()::text))
  limit 1;
$$;
revoke all on function public.read_public_platform_brand_profile(text) from public;
grant execute on function public.read_public_platform_brand_profile(text) to anon, authenticated, service_role;

-- These checks add wall-clock expiry to the existing canonical authority;
-- they never create entitlements or broaden staff scope. VOLATILE permits
-- fresh READ COMMITTED statement snapshots when called again after a wait.
create function public.platform_studio_current_staff_access_internal()
returns boolean
language sql volatile security definer set search_path = ''
as $$
  select public.has_platform_role(array['owner'::text, 'operator'::text])
    and exists (select 1 from public.platform_role_memberships membership
      where membership.user_id = auth.uid()::text and membership.status = 'active'
        and membership.role in ('owner', 'operator')
        and (membership.expires_at is null or membership.expires_at > clock_timestamp()));
$$;
revoke all on function public.platform_studio_current_staff_access_internal()
  from public, anon, authenticated, service_role;

create function public.platform_studio_current_creator_tool_access_internal()
returns boolean
language sql volatile security definer set search_path = ''
as $$
  select public.has_active_premium_creator_tool_access(auth.uid()::text)
    and (public.platform_studio_current_staff_access_internal()
      or (public.premium_subject_has_finite_authority_internal(auth.uid()::text)
        and exists (select 1 from public.user_entitlements entitlement
          where entitlement.user_id = auth.uid()::text and entitlement.entitlement_key = 'premium'
            and entitlement.status in ('active', 'trialing', 'grace_period')
            and entitlement.revoked_at is null and entitlement.expires_at > clock_timestamp())));
$$;
revoke all on function public.platform_studio_current_creator_tool_access_internal()
  from public, anon, authenticated, service_role;

create function public.publish_platform_brand_profile(p_profile jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor text := auth.uid()::text;
  v_profile public.platform_brand_profiles%rowtype;
  v_previous public.platform_brand_profiles%rowtype;
  v_asset public.platform_brand_assets%rowtype;
  v_selection record;
  v_asset_ids uuid[];
  v_review_context text := current_setting('app.platform_brand_review_context', true);
begin
  if v_actor is null then raise exception 'brand_publish_auth_required'; end if;
  if jsonb_typeof(p_profile) is distinct from 'object'
    or p_profile ->> 'owner_user_id' is distinct from v_actor then
    raise exception 'brand_publish_owner_required';
  end if;
  if not public.whole_app_exact_current_session_authority_internal()
    or not exists (select 1 from auth.users subject
      where subject.id = auth.uid() and subject.deleted_at is null) then
    raise exception 'brand_publish_current_session_required';
  end if;
  if public.is_account_access_restricted(v_actor) then
    raise exception 'brand_publish_account_restricted';
  end if;
  if not public.platform_studio_current_creator_tool_access_internal() then
    raise exception 'brand_publish_premium_required';
  end if;
  if not (p_profile ?& array['owner_user_id','hero_image_asset_id','hero_video_asset_id','hero_poster_asset_id','background_image_asset_id','avatar_asset_id','logo_asset_id','watermark_asset_id','spotlight_video_id','theme_preset','accent_color','hero_fit_mode','hero_focal_x','hero_focal_y','hero_crop_scale','background_fit_mode','background_focal_x','background_focal_y','overlay_strength','blur_strength']) then
    raise exception 'brand_publish_complete_profile_required';
  end if;

  -- Serialize publishes for an owner, including the first publication, then
  -- take the draft row lock used by ordinary upserts. The payload is complete,
  -- so no read/merge/save race can mix another draft into this publication.
  perform pg_advisory_xact_lock(hashtextextended('platform-brand-publish:' || v_actor, 0));
  select * into v_previous from public.platform_brand_profiles
    where owner_user_id = v_actor for update;
  -- A queued transaction may outlive a session/entitlement revocation.
  -- Re-read after waits, using wall-clock session expiry rather than now(),
  -- whose value remains fixed at transaction start.
  if not public.whole_app_exact_current_session_authority_internal()
    or public.is_account_access_restricted(v_actor)
    or not exists (select 1 from auth.users subject join auth.sessions session_row
      on session_row.user_id = subject.id
      where subject.id = auth.uid() and subject.deleted_at is null
        and session_row.id::text = auth.jwt() ->> 'session_id'
        and (session_row.not_after is null or session_row.not_after > clock_timestamp())) then
    raise exception 'brand_publish_current_session_required';
  end if;
  if not public.platform_studio_current_creator_tool_access_internal() then
    raise exception 'brand_publish_premium_required';
  end if;
  v_profile := jsonb_populate_record(null::public.platform_brand_profiles, p_profile);
  v_profile.created_at := coalesce(v_previous.created_at, now());
  v_profile.updated_at := now();
  v_profile.published_at := now();

  insert into public.platform_brand_profiles select (v_profile).*
  on conflict (owner_user_id) do update set
    hero_image_asset_id = excluded.hero_image_asset_id,
    hero_video_asset_id = excluded.hero_video_asset_id,
    hero_poster_asset_id = excluded.hero_poster_asset_id,
    background_image_asset_id = excluded.background_image_asset_id,
    avatar_asset_id = excluded.avatar_asset_id,
    logo_asset_id = excluded.logo_asset_id,
    watermark_asset_id = excluded.watermark_asset_id,
    spotlight_video_id = excluded.spotlight_video_id,
    theme_preset = excluded.theme_preset,
    accent_color = excluded.accent_color,
    hero_fit_mode = excluded.hero_fit_mode,
    hero_focal_x = excluded.hero_focal_x,
    hero_focal_y = excluded.hero_focal_y,
    hero_crop_scale = excluded.hero_crop_scale,
    background_fit_mode = excluded.background_fit_mode,
    background_focal_x = excluded.background_focal_x,
    background_focal_y = excluded.background_focal_y,
    overlay_strength = excluded.overlay_strength,
    blur_strength = excluded.blur_strength,
    published_at = excluded.published_at,
    updated_at = excluded.updated_at
  returning * into v_profile;

  v_asset_ids := array[v_profile.hero_image_asset_id, v_profile.hero_video_asset_id,
    v_profile.hero_poster_asset_id, v_profile.background_image_asset_id,
    v_profile.avatar_asset_id, v_profile.logo_asset_id, v_profile.watermark_asset_id];

  -- Locks and eligibility checks happen before any review or publication.
  -- All selected media must be eligible, otherwise the whole transaction rolls
  -- back (including the draft save and any review events).
  for v_selection in
    select selected.asset_id, selected.asset_type from (values
      (v_profile.hero_image_asset_id, 'hero_image'),
      (v_profile.hero_video_asset_id, 'hero_video'),
      (v_profile.hero_poster_asset_id, 'hero_poster'),
      (v_profile.background_image_asset_id, 'background_image'),
      (v_profile.avatar_asset_id, 'avatar'), (v_profile.logo_asset_id, 'logo'),
      (v_profile.watermark_asset_id, 'watermark')
    ) selected(asset_id, asset_type)
    where selected.asset_id is not null order by selected.asset_id, selected.asset_type
  loop
    select * into v_asset from public.platform_brand_assets
      where id = v_selection.asset_id for update;
    if not found or v_asset.owner_user_id <> v_actor
      or v_asset.asset_type <> v_selection.asset_type
      or v_asset.asset_state not in ('draft', 'published')
      or v_asset.moderation_status not in ('pending_review', 'clean', 'reported')
      or not public.media_scan_public_safe(v_asset.scan_status)
      or v_asset.quarantined_at is not null or v_asset.deleted_at is not null
      or lower(btrim(coalesce(v_asset.storage_provider, ''))) <> 'supabase'
      or v_asset.storage_bucket <> 'platform-brand-assets'
      or nullif(btrim(v_asset.storage_object_key), '') is null
      or v_asset.storage_object_key is distinct from v_asset.storage_path
      or (storage.foldername(v_asset.storage_path))[1] is distinct from v_actor
    then raise exception 'brand_publish_asset_not_ready'; end if;
  end loop;

  if nullif(btrim(v_profile.spotlight_video_id), '') is not null then
    perform 1 from public.videos video
      where video.id::text = v_profile.spotlight_video_id
        and video.owner_id::text = v_actor and video.visibility = 'public'
        and video.moderation_status in ('clean', 'reported')
        and public.media_scan_public_safe(video.scan_status)
        and video.quarantined_at is null
      for share;
    if not found then raise exception 'brand_publish_spotlight_not_ready'; end if;
  end if;

  perform 1 from public.platform_brand_publications
    where owner_user_id = v_actor for update;
  -- Asset, Spotlight and snapshot locks may also have waited.
  if not public.whole_app_exact_current_session_authority_internal()
    or public.is_account_access_restricted(v_actor)
    or not exists (select 1 from auth.users subject join auth.sessions session_row
      on session_row.user_id = subject.id
      where subject.id = auth.uid() and subject.deleted_at is null
        and session_row.id::text = auth.jwt() ->> 'session_id'
        and (session_row.not_after is null or session_row.not_after > clock_timestamp())) then
    raise exception 'brand_publish_current_session_required';
  end if;
  if not public.platform_studio_current_creator_tool_access_internal() then
    raise exception 'brand_publish_premium_required';
  end if;

  -- Reuse the existing owner review/audit workflow only after the stricter
  -- eligibility check above. Restore its transaction-local context afterward.
  perform public.publish_platform_brand_profile_assets(v_asset_ids,
    'Approved by the creator during atomic Brand Studio publish.');
  perform set_config('app.platform_brand_review_context', coalesce(v_review_context, ''), true);
  if exists (select 1 from unnest(v_asset_ids) selected(asset_id)
      where asset_id is not null
        and not public.platform_brand_publication_asset_safe_internal(asset_id, v_actor)) then
    raise exception 'brand_publish_asset_not_ready';
  end if;

  insert into public.platform_brand_publications select (v_profile).*
  on conflict (owner_user_id) do update set
    hero_image_asset_id = excluded.hero_image_asset_id,
    hero_video_asset_id = excluded.hero_video_asset_id,
    hero_poster_asset_id = excluded.hero_poster_asset_id,
    background_image_asset_id = excluded.background_image_asset_id,
    avatar_asset_id = excluded.avatar_asset_id,
    logo_asset_id = excluded.logo_asset_id,
    watermark_asset_id = excluded.watermark_asset_id,
    spotlight_video_id = excluded.spotlight_video_id,
    theme_preset = excluded.theme_preset,
    accent_color = excluded.accent_color,
    hero_fit_mode = excluded.hero_fit_mode,
    hero_focal_x = excluded.hero_focal_x,
    hero_focal_y = excluded.hero_focal_y,
    hero_crop_scale = excluded.hero_crop_scale,
    background_fit_mode = excluded.background_fit_mode,
    background_focal_x = excluded.background_focal_x,
    background_focal_y = excluded.background_focal_y,
    overlay_strength = excluded.overlay_strength,
    blur_strength = excluded.blur_strength,
    published_at = excluded.published_at,
    updated_at = excluded.updated_at;
  return to_jsonb(v_profile);
end;
$$;
revoke all on function public.publish_platform_brand_profile(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_platform_brand_profile(jsonb) to authenticated;

-- The independent Platform access gate authorizes only its shared identity.
-- Profile media, Profile privacy settings and private room defaults never cross
-- this boundary. Callers use their neutral avatar fallback or published Brand.
create function public.read_public_platform_identity(profile_user_id text)
returns table (
  user_id text, username text, display_name text, tagline text,
  channel_layout_preset text, channel_role text,
  follower_surface_enabled boolean, subscriber_surface_enabled boolean,
  platform_access_visibility text
)
language sql stable security definer set search_path = ''
as $$
  select profile.user_id, profile.username, profile.display_name, profile.tagline,
    profile.channel_layout_preset, profile.channel_role,
    profile.follower_surface_enabled, profile.subscriber_surface_enabled,
    profile.platform_access_visibility
  from public.user_profiles profile
  where profile.user_id = nullif(btrim(coalesce(profile_user_id, '')), '')
    and (profile.user_id = 'platform_rachi_official'
      or exists (select 1 from auth.users subject
        where subject.id::text = profile.user_id and subject.deleted_at is null))
    and coalesce((public.resolve_platform_visibility_access(profile.user_id, auth.uid()::text) ->> 'allowed')::boolean, false)
    and (auth.uid() is null or not public.has_channel_audience_block_between(profile.user_id, auth.uid()::text))
  limit 1;
$$;
revoke all on function public.read_public_platform_identity(text) from public;
grant execute on function public.read_public_platform_identity(text) to anon, authenticated, service_role;

create function public.read_public_channel_follower_count(p_channel_user_id text)
returns bigint
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_owner text := nullif(btrim(coalesce(p_channel_user_id, '')), '');
  v_access jsonb;
  v_count bigint;
begin
  v_access := public.resolve_platform_visibility_access(v_owner, auth.uid()::text);
  if (v_owner is distinct from 'platform_rachi_official'
      and not exists (select 1 from auth.users subject
        where subject.id::text = v_owner and subject.deleted_at is null))
    or not coalesce((v_access ->> 'allowed')::boolean, false)
    or (auth.uid() is not null and public.has_channel_audience_block_between(v_owner, auth.uid()::text))
    or not exists (select 1 from public.user_profiles profile where profile.user_id = v_owner
      and profile.follower_surface_enabled)
  then return null; end if;
  select count(*) into v_count from public.channel_followers where channel_user_id = v_owner;
  return v_count;
end;
$$;
revoke all on function public.read_public_channel_follower_count(text) from public;
grant execute on function public.read_public_channel_follower_count(text) to anon, authenticated, service_role;

-- Remove the direct UPDATE path that allowed an owner to swap requester
-- identity or resurrect a terminal request. Existing cancel remains DELETE.
-- General self-follow INSERT, follower roster SELECT and request DELETE RLS
-- stay unchanged.
revoke update on table public.channel_audience_requests from public, anon, authenticated;

create function public.review_channel_audience_request(p_request_id bigint, p_status text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor text := auth.uid()::text;
  v_request public.channel_audience_requests%rowtype;
begin
  if v_actor is null then raise exception 'audience_review_auth_required'; end if;
  if not public.whole_app_exact_current_session_authority_internal()
    or not exists (select 1 from auth.users subject
      where subject.id = auth.uid() and subject.deleted_at is null)
    or public.is_account_access_restricted(v_actor) then
    raise exception 'audience_review_current_session_required';
  end if;
  if p_status is null or p_status not in ('approved', 'declined') then
    raise exception 'audience_review_status_invalid';
  end if;
  select * into v_request from public.channel_audience_requests
    where id = p_request_id for update;
  if not found then raise exception 'audience_request_not_found'; end if;
  -- Session validity can change while the request row is locked elsewhere.
  if not public.whole_app_exact_current_session_authority_internal()
    or public.is_account_access_restricted(v_actor)
    or not exists (select 1 from auth.users subject join auth.sessions session_row
      on session_row.user_id = subject.id
      where subject.id = auth.uid() and subject.deleted_at is null
        and session_row.id::text = auth.jwt() ->> 'session_id'
        and (session_row.not_after is null or session_row.not_after > clock_timestamp())) then
    raise exception 'audience_review_current_session_required';
  end if;
  if v_request.channel_user_id <> v_actor
    and not (not public.is_platform_owner_user(v_request.channel_user_id)
      and public.platform_studio_current_staff_access_internal()) then
    raise exception 'audience_review_forbidden';
  end if;
  if public.is_account_access_restricted(v_request.channel_user_id)
    or public.is_account_access_restricted(v_request.requester_user_id)
    or not exists (select 1 from auth.users subject
      where subject.id::text = v_request.channel_user_id and subject.deleted_at is null)
    or not exists (select 1 from auth.users subject
      where subject.id::text = v_request.requester_user_id and subject.deleted_at is null) then
    raise exception 'audience_review_account_restricted';
  end if;
  if v_request.status <> 'pending' then
    if v_request.status = p_status then return to_jsonb(v_request); end if;
    raise exception 'audience_request_not_pending';
  end if;
  if p_status = 'approved' then
    if v_request.request_kind <> 'follow' then
      raise exception 'subscriber_mutation_unsupported';
    end if;
    if public.has_channel_audience_block_between(v_request.channel_user_id, v_request.requester_user_id) then
      raise exception 'blocked_relationship';
    end if;
    insert into public.channel_followers(channel_user_id, follower_user_id)
      values(v_request.channel_user_id, v_request.requester_user_id)
      on conflict (channel_user_id, follower_user_id) do nothing;
  end if;
  -- An existing concurrent self-follow can make INSERT wait as well.
  if not public.whole_app_exact_current_session_authority_internal()
    or public.is_account_access_restricted(v_actor)
    or not exists (select 1 from auth.users subject join auth.sessions session_row
      on session_row.user_id = subject.id
      where subject.id = auth.uid() and subject.deleted_at is null
        and session_row.id::text = auth.jwt() ->> 'session_id'
        and (session_row.not_after is null or session_row.not_after > clock_timestamp())) then
    raise exception 'audience_review_current_session_required';
  end if;
  if v_request.channel_user_id <> v_actor
    and not (not public.is_platform_owner_user(v_request.channel_user_id)
      and public.platform_studio_current_staff_access_internal()) then
    raise exception 'audience_review_forbidden';
  end if;
  if public.is_account_access_restricted(v_request.channel_user_id)
    or public.is_account_access_restricted(v_request.requester_user_id)
    or not exists (select 1 from auth.users subject
      where subject.id::text = v_request.channel_user_id and subject.deleted_at is null)
    or not exists (select 1 from auth.users subject
      where subject.id::text = v_request.requester_user_id and subject.deleted_at is null) then
    raise exception 'audience_review_account_restricted';
  end if;
  if p_status = 'approved'
    and public.has_channel_audience_block_between(v_request.channel_user_id, v_request.requester_user_id) then
    raise exception 'blocked_relationship';
  end if;
  update public.channel_audience_requests
    set status = p_status, reviewed_at = now(), reviewed_by = v_actor, updated_at = now()
    where id = v_request.id returning * into v_request;
  return to_jsonb(v_request);
end;
$$;
revoke all on function public.review_channel_audience_request(bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.review_channel_audience_request(bigint,text) to authenticated;

create or replace function public."platform_brand_asset_cleanup_candidates"(
  p_retention_days integer default 30,
  p_limit integer default 100
)
returns table (
  asset_id uuid,
  owner_user_id text,
  asset_type text,
  asset_state text,
  moderation_status text,
  storage_bucket text,
  storage_path text,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz,
  cleanup_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'platform_brand_cleanup_service_role_required';
  end if;

  return query
  with settings as (
    select
      greatest(7, least(365, coalesce(p_retention_days, 30)))::integer as retention_days,
      greatest(1, least(500, coalesce(p_limit, 100)))::integer as result_limit
  ),
  referenced_assets as (
    select distinct refs.asset_id
    from (
      select hero_image_asset_id, hero_video_asset_id, hero_poster_asset_id,
        background_image_asset_id, avatar_asset_id, logo_asset_id, watermark_asset_id
      from public."platform_brand_profiles"
      union all
      select hero_image_asset_id, hero_video_asset_id, hero_poster_asset_id,
        background_image_asset_id, avatar_asset_id, logo_asset_id, watermark_asset_id
      from public."platform_brand_publications"
    ) profile
    cross join lateral (
      values
        (profile."hero_image_asset_id"),
        (profile."hero_video_asset_id"),
        (profile."hero_poster_asset_id"),
        (profile."background_image_asset_id"),
        (profile."avatar_asset_id"),
        (profile."logo_asset_id"),
        (profile."watermark_asset_id")
    ) as refs(asset_id)
    where refs.asset_id is not null
  ),
  candidates as (
    select
      asset."id" as candidate_asset_id,
      asset."owner_user_id" as candidate_owner_user_id,
      asset."asset_type" as candidate_asset_type,
      asset."asset_state" as candidate_asset_state,
      asset."moderation_status" as candidate_moderation_status,
      asset."storage_bucket" as candidate_storage_bucket,
      asset."storage_path" as candidate_storage_path,
      asset."created_at" as candidate_created_at,
      asset."updated_at" as candidate_updated_at,
      asset."deleted_at" as candidate_deleted_at,
      case
        when asset."deleted_at" is not null then 'deleted_asset_retained'
        when asset."asset_state" = 'archived' then 'archived_asset_retained'
        when asset."moderation_status" in ('rejected', 'removed', 'hidden') then 'moderation_terminal_retained'
        when asset."asset_state" = 'draft'
          and asset."moderation_status" = 'pending_review'
          and asset."updated_at" < timezone('utc'::text, now()) - (settings.retention_days::text || ' days')::interval
          then 'orphaned_old_draft_pending_review'
        else null
      end as candidate_cleanup_reason,
      settings.result_limit
    from public."platform_brand_assets" asset
    cross join settings
    left join referenced_assets referenced on referenced.asset_id = asset."id"
    where referenced.asset_id is null
      and asset."asset_state" <> 'published'
  )
  select
    candidates.candidate_asset_id,
    candidates.candidate_owner_user_id,
    candidates.candidate_asset_type,
    candidates.candidate_asset_state,
    candidates.candidate_moderation_status,
    candidates.candidate_storage_bucket,
    candidates.candidate_storage_path,
    candidates.candidate_created_at,
    candidates.candidate_updated_at,
    candidates.candidate_deleted_at,
    candidates.candidate_cleanup_reason
  from candidates
  where candidates.candidate_cleanup_reason is not null
  order by candidates.candidate_updated_at asc
  limit (select result_limit from settings);
end;
$$;

revoke all on function public."platform_brand_asset_cleanup_candidates"(integer, integer) from public;
grant execute on function public."platform_brand_asset_cleanup_candidates"(integer, integer) to service_role;

comment on function public."platform_brand_asset_cleanup_candidates"(integer, integer) is
  'Service-role-only helper that lists Brand Studio assets eligible for manual storage cleanup. It raises for anon/authenticated callers, never returns published assets or assets still referenced by draft or published Platform brand profiles, and does not delete storage objects.';
