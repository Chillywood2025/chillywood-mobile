-- Creator VIP Video Shelf V1.
-- VIP is a creator-specific video access tier, not general Platform/channel access.
-- VIP and per-video paid unlock are mutually exclusive. Public metadata may be
-- discoverable, but playback authority stays server-resolved and fail closed.

alter table public."videos"
  add column if not exists "vip_access_required" boolean not null default false;

create index if not exists "videos_public_vip_access_idx"
  on public."videos" ("owner_id", "created_at" desc)
  where "visibility" = 'public' and "vip_access_required" = true;

create or replace function public."resolve_creator_vip_video_access"(
  p_video_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_owner_id uuid;
  v_visibility text;
  v_moderation_status text;
  v_vip_required boolean := false;
  v_has_vip boolean := false;
begin
  select
    video."owner_id",
    video."visibility",
    coalesce(video."moderation_status", 'clean'),
    coalesce(video."vip_access_required", false)
  into
    v_owner_id,
    v_visibility,
    v_moderation_status,
    v_vip_required
  from public."videos" video
  where video."id" = p_video_id;

  if v_owner_id is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'content_unavailable',
      'vipRequired', false,
      'creatorId', null
    );
  end if;

  if not v_vip_required then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'vip_not_required',
      'vipRequired', false,
      'creatorId', v_owner_id
    );
  end if;

  if v_viewer_id = v_owner_id or public.has_platform_role(array['owner'::text, 'operator'::text]) then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'owner',
      'vipRequired', true,
      'creatorId', v_owner_id
    );
  end if;

  if v_visibility <> 'public' or v_moderation_status not in ('clean', 'reported') then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'content_unavailable',
      'vipRequired', true,
      'creatorId', v_owner_id
    );
  end if;

  if v_viewer_id is not null then
    select exists (
      select 1
      from public."creator_vip_passes" vip
      join public."creator_vip_pass_offers" offer on offer."id" = vip."offer_id"
      where vip."creator_id" = v_owner_id
        and vip."fan_id" = v_viewer_id
        and vip."status" = 'active'
        and vip."revoked_at" is null
        and vip."refunded_at" is null
        and (vip."expires_at" is null or vip."expires_at" > timezone('utc'::text, now()))
        and offer."status" in ('sandbox', 'active')
    ) into v_has_vip;
  end if;

  if v_has_vip then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'active_vip',
      'vipRequired', true,
      'creatorId', v_owner_id
    );
  end if;

  return jsonb_build_object(
    'allowed', false,
    'reason', case when v_viewer_id is null then 'identity_required' else 'vip_required' end,
    'vipRequired', true,
    'creatorId', v_owner_id
  );
end;
$$;

create or replace function public."set_creator_video_vip_access"(
  p_video_id uuid,
  p_required boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_owner_id uuid;
  v_visibility text;
begin
  if v_actor_id is null then
    raise exception 'creator_video_auth_required';
  end if;

  select "owner_id", "visibility"
  into v_owner_id, v_visibility
  from public."videos"
  where "id" = p_video_id;

  if v_owner_id is null or v_owner_id <> v_actor_id then
    raise exception 'creator_video_owner_required';
  end if;

  if coalesce(p_required, false) and v_visibility <> 'public' then
    return jsonb_build_object(
      'status', 'blocked',
      'reason', 'vip_video_must_be_public'
    );
  end if;

  update public."videos"
  set
    "vip_access_required" = coalesce(p_required, false),
    "updated_at" = timezone('utc'::text, now())
  where "id" = p_video_id
    and "owner_id" = v_actor_id;

  if coalesce(p_required, false) then
    update public."creator_content_prices"
    set
      "is_paid" = false,
      "status" = 'paused',
      "updated_at" = timezone('utc'::text, now())
    where "content_type" = 'creator_video'
      and "content_id" = p_video_id
      and "creator_id" = v_actor_id;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'videoId', p_video_id,
    'vipRequired', coalesce(p_required, false),
    'paidVideoDisabled', coalesce(p_required, false)
  );
end;
$$;

create or replace function public."block_paid_price_on_vip_video"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new."content_type" = 'creator_video'
    and new."is_paid" = true
    and exists (
      select 1
      from public."videos" video
      where video."id" = new."content_id"
        and coalesce(video."vip_access_required", false) = true
    )
  then
    raise exception 'vip_video_cannot_be_paid_per_video';
  end if;
  return new;
end;
$$;

drop trigger if exists "block_paid_price_on_vip_video_trigger" on public."creator_content_prices";
create trigger "block_paid_price_on_vip_video_trigger"
  before insert or update of "is_paid", "content_id", "content_type"
  on public."creator_content_prices"
  for each row execute function public."block_paid_price_on_vip_video"();

revoke all on function public."resolve_creator_vip_video_access"(uuid) from public;
grant execute on function public."resolve_creator_vip_video_access"(uuid) to anon, authenticated;

revoke all on function public."set_creator_video_vip_access"(uuid, boolean) from public;
grant execute on function public."set_creator_video_vip_access"(uuid, boolean) to authenticated;
