create table if not exists public."platform_brand_asset_review_events" (
  "id" uuid primary key default gen_random_uuid(),
  "asset_id" uuid not null references public."platform_brand_assets"("id") on delete cascade,
  "owner_user_id" text not null,
  "actor_user_id" text,
  "actor_email" text,
  "actor_role" text,
  "action" text not null,
  "reason" text,
  "before_state" jsonb,
  "after_state" jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "platform_brand_asset_review_events_action_check"
    check ("action" in ('approve', 'reject', 'archive'))
);

create index if not exists "platform_brand_asset_review_events_asset_idx"
  on public."platform_brand_asset_review_events" ("asset_id", "created_at" desc);

create index if not exists "platform_brand_asset_review_events_owner_idx"
  on public."platform_brand_asset_review_events" ("owner_user_id", "created_at" desc);

alter table public."platform_brand_asset_review_events" enable row level security;

drop policy if exists "platform_brand_asset_review_events_select_reviewers" on public."platform_brand_asset_review_events";
create policy "platform_brand_asset_review_events_select_reviewers"
  on public."platform_brand_asset_review_events" for select to authenticated
  using (
    public.has_platform_role(array['owner'::text, 'operator'::text])
    or public.has_platform_permission('content_moderation')
    or public.has_platform_permission('reports_review')
  );

revoke all on table public."platform_brand_asset_review_events" from anon, authenticated;
grant select on table public."platform_brand_asset_review_events" to authenticated;
grant all on table public."platform_brand_asset_review_events" to service_role;

create or replace function public."platform_brand_asset_public_safe"(
  p_asset_id uuid,
  p_owner_user_id text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."platform_brand_assets" asset
    where asset."id" = p_asset_id
      and (p_owner_user_id is null or asset."owner_user_id" = p_owner_user_id)
      and asset."asset_state" = 'published'
      and asset."moderation_status" in ('clean', 'reported')
      and asset."deleted_at" is null
  );
$$;

revoke all on function public."platform_brand_asset_public_safe"(uuid, text) from public;
grant execute on function public."platform_brand_asset_public_safe"(uuid, text) to anon;
grant execute on function public."platform_brand_asset_public_safe"(uuid, text) to authenticated;
grant execute on function public."platform_brand_asset_public_safe"(uuid, text) to service_role;

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
set search_path = public
as $$
  select
    profile."owner_user_id",
    case
      when public.platform_brand_asset_public_safe(profile."hero_image_asset_id", profile."owner_user_id")
        then profile."hero_image_asset_id"
      else null
    end as "hero_image_asset_id",
    case
      when public.platform_brand_asset_public_safe(profile."hero_video_asset_id", profile."owner_user_id")
        then profile."hero_video_asset_id"
      else null
    end as "hero_video_asset_id",
    case
      when public.platform_brand_asset_public_safe(profile."hero_poster_asset_id", profile."owner_user_id")
        then profile."hero_poster_asset_id"
      else null
    end as "hero_poster_asset_id",
    case
      when public.platform_brand_asset_public_safe(profile."background_image_asset_id", profile."owner_user_id")
        then profile."background_image_asset_id"
      else null
    end as "background_image_asset_id",
    case
      when public.platform_brand_asset_public_safe(profile."avatar_asset_id", profile."owner_user_id")
        then profile."avatar_asset_id"
      else null
    end as "avatar_asset_id",
    case
      when public.platform_brand_asset_public_safe(profile."logo_asset_id", profile."owner_user_id")
        then profile."logo_asset_id"
      else null
    end as "logo_asset_id",
    case
      when public.platform_brand_asset_public_safe(profile."watermark_asset_id", profile."owner_user_id")
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
  from public."platform_brand_profiles" profile
  where profile."owner_user_id" = nullif(btrim(coalesce(profile_user_id, '')), '')
    and profile."published_at" is not null
  limit 1;
$$;

revoke all on function public."read_public_platform_brand_profile"(text) from public;
grant execute on function public."read_public_platform_brand_profile"(text) to anon;
grant execute on function public."read_public_platform_brand_profile"(text) to authenticated;
grant execute on function public."read_public_platform_brand_profile"(text) to service_role;

create or replace function public."review_platform_brand_asset"(
  p_asset_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_actor_role text := coalesce(nullif(public.platform_staff_actor_role(), ''), 'member');
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_before public."platform_brand_assets"%rowtype;
  v_after public."platform_brand_assets"%rowtype;
  v_event_id uuid;
begin
  if auth.uid() is null then
    raise exception 'brand_review_auth_required';
  end if;

  if v_action = 'approved' or v_action = 'clean' then
    v_action := 'approve';
  elsif v_action = 'rejected' then
    v_action := 'reject';
  elsif v_action = 'remove' or v_action = 'removed' or v_action = 'delete' or v_action = 'deleted' then
    v_action := 'archive';
  end if;

  if v_action not in ('approve', 'reject', 'archive') then
    raise exception 'brand_review_action_invalid';
  end if;

  if not (
    public.has_platform_role(array['owner'::text, 'operator'::text])
    or public.has_platform_permission('content_moderation')
    or public.has_platform_permission('reports_review')
  ) then
    raise exception 'brand_review_forbidden';
  end if;

  if v_action in ('reject', 'archive') and length(coalesce(v_reason, '')) < 6 then
    raise exception 'brand_review_reason_required';
  end if;

  select *
    into v_before
  from public."platform_brand_assets" asset
  where asset."id" = p_asset_id
  for update;

  if not found or v_before."deleted_at" is not null then
    raise exception 'brand_asset_not_found';
  end if;

  if v_action = 'approve' then
    update public."platform_brand_assets"
    set
      "moderation_status" = 'clean',
      "moderation_reason" = coalesce(v_reason, 'Approved for public Platform display.'),
      "moderated_at" = timezone('utc'::text, now()),
      "moderated_by" = v_actor_user_id
    where "id" = p_asset_id
    returning * into v_after;
  elsif v_action = 'reject' then
    update public."platform_brand_assets"
    set
      "asset_state" = case when "asset_state" = 'published' then 'draft' else "asset_state" end,
      "moderation_status" = 'rejected',
      "moderation_reason" = v_reason,
      "moderated_at" = timezone('utc'::text, now()),
      "moderated_by" = v_actor_user_id
    where "id" = p_asset_id
    returning * into v_after;
  else
    update public."platform_brand_assets"
    set
      "asset_state" = 'archived',
      "moderation_status" = 'removed',
      "moderation_reason" = v_reason,
      "moderated_at" = timezone('utc'::text, now()),
      "moderated_by" = v_actor_user_id,
      "deleted_at" = timezone('utc'::text, now())
    where "id" = p_asset_id
    returning * into v_after;
  end if;

  insert into public."platform_brand_asset_review_events" (
    "asset_id",
    "owner_user_id",
    "actor_user_id",
    "actor_email",
    "actor_role",
    "action",
    "reason",
    "before_state",
    "after_state"
  )
  values (
    v_after."id",
    v_after."owner_user_id",
    v_actor_user_id,
    v_actor_email,
    v_actor_role,
    v_action,
    v_reason,
    to_jsonb(v_before),
    to_jsonb(v_after)
  )
  returning "id" into v_event_id;

  if to_regclass('public.platform_admin_audit_logs') is not null then
    insert into public."platform_admin_audit_logs" (
      "actor_user_id",
      "actor_email",
      "actor_role",
      "action",
      "action_category",
      "target_type",
      "target_id",
      "target_user_id",
      "target_channel_user_id",
      "reason",
      "severity",
      "before_state",
      "after_state",
      "metadata"
    )
    values (
      v_actor_user_id,
      v_actor_email,
      v_actor_role,
      concat('platform_brand_asset_', v_action),
      'moderation',
      'platform_brand_asset',
      v_after."id"::text,
      v_after."owner_user_id",
      v_after."owner_user_id",
      coalesce(v_reason, v_after."moderation_reason"),
      case when v_action = 'approve' then 'notice' else 'warning' end,
      to_jsonb(v_before),
      to_jsonb(v_after),
      jsonb_build_object(
        'surface', 'platform_brand_studio',
        'asset_type', v_after."asset_type",
        'review_event_id', v_event_id,
        'public_asset_state', v_after."asset_state",
        'moderation_status', v_after."moderation_status",
        'raw_storage_path_logged', false,
        'fake_approval', false
      )
    );
  end if;

  return jsonb_build_object(
    'id', v_after."id",
    'ownerUserId', v_after."owner_user_id",
    'assetType', v_after."asset_type",
    'assetState', v_after."asset_state",
    'moderationStatus', v_after."moderation_status",
    'moderationReason', v_after."moderation_reason",
    'moderatedAt', v_after."moderated_at",
    'reviewEventId', v_event_id
  );
end;
$$;

revoke all on function public."review_platform_brand_asset"(uuid, text, text) from public;
grant execute on function public."review_platform_brand_asset"(uuid, text, text) to authenticated;
grant execute on function public."review_platform_brand_asset"(uuid, text, text) to service_role;

comment on table public."platform_brand_asset_review_events" is
  'Append-only Platform Brand Studio asset review events for approve, reject, and archive actions. Public assets still require published state and moderation-safe status.';

comment on function public."read_public_platform_brand_profile"(text) is
  'Returns only public Platform branding metadata and nulls any asset reference that is not currently published and moderation-safe.';

comment on function public."review_platform_brand_asset"(uuid, text, text) is
  'Owner/operator/moderation review workflow for Platform Brand Studio assets. Does not fake public approval and writes review/audit rows.';
