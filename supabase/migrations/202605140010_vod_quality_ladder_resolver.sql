-- VOD quality ladder metadata and playback resolver foundation.
-- This does not transcode media. It records rendition metadata and keeps the
-- resolver, not the client, responsible for deciding which qualities are allowed.

create table if not exists public."video_renditions" (
  "id" uuid primary key default gen_random_uuid(),
  "video_id" uuid not null references public."videos"("id") on delete cascade,
  "owner_id" uuid not null,
  "quality_label" text not null,
  "width" integer,
  "height" integer,
  "fps" integer,
  "bitrate_kbps" integer,
  "codec" text,
  "container" text,
  "storage_bucket" text,
  "storage_path" text,
  "manifest_path" text,
  "status" text not null default 'queued',
  "access_tier" text not null default 'private',
  "error_message" text,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "video_renditions_quality_label_check"
    check ("quality_label" in ('original', '360p', '480p', '720p', '1080p')),
  constraint "video_renditions_status_check"
    check ("status" in ('queued', 'processing', 'ready', 'failed', 'archived')),
  constraint "video_renditions_access_tier_check"
    check ("access_tier" in ('owner', 'free', 'premium', 'private')),
  constraint "video_renditions_dimensions_positive_check"
    check (
      ("width" is null or "width" > 0)
      and ("height" is null or "height" > 0)
      and ("fps" is null or "fps" > 0)
      and ("bitrate_kbps" is null or "bitrate_kbps" > 0)
    ),
  constraint "video_renditions_original_private_check"
    check (
      "quality_label" <> 'original'
      or "access_tier" in ('owner', 'private')
    ),
  constraint "video_renditions_hd_premium_check"
    check (
      "quality_label" not in ('720p', '1080p')
      or "access_tier" in ('premium', 'owner', 'private')
    ),
  constraint "video_renditions_video_quality_key"
    unique ("video_id", "quality_label")
);

create index if not exists "video_renditions_video_status_idx"
  on public."video_renditions" ("video_id", "status", "quality_label");

create index if not exists "video_renditions_owner_status_idx"
  on public."video_renditions" ("owner_id", "status", "updated_at" desc);

create index if not exists "video_renditions_storage_lookup_idx"
  on public."video_renditions" ("storage_bucket", "storage_path")
  where "storage_path" is not null;

create index if not exists "video_renditions_manifest_lookup_idx"
  on public."video_renditions" ("storage_bucket", "manifest_path")
  where "manifest_path" is not null;

create or replace function public."touch_video_renditions_updated_at"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new."updated_at" = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists "touch_video_renditions_updated_at_trigger" on public."video_renditions";
create trigger "touch_video_renditions_updated_at_trigger"
  before update on public."video_renditions"
  for each row
  execute function public."touch_video_renditions_updated_at"();

alter table public."video_renditions" enable row level security;

drop policy if exists "video_renditions_select_owner_operator" on public."video_renditions";
create policy "video_renditions_select_owner_operator"
  on public."video_renditions"
  for select
  to authenticated
  using (
    (auth.uid() is not null and "owner_id" = auth.uid())
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

drop policy if exists "video_renditions_no_direct_client_insert" on public."video_renditions";
create policy "video_renditions_no_direct_client_insert"
  on public."video_renditions"
  for insert
  to authenticated
  with check (false);

drop policy if exists "video_renditions_no_direct_client_update" on public."video_renditions";
create policy "video_renditions_no_direct_client_update"
  on public."video_renditions"
  for update
  to authenticated
  using (false)
  with check (false);

drop policy if exists "video_renditions_no_direct_client_delete" on public."video_renditions";
create policy "video_renditions_no_direct_client_delete"
  on public."video_renditions"
  for delete
  to authenticated
  using (false);

revoke all on table public."video_renditions" from "anon";
revoke all on table public."video_renditions" from "authenticated";
grant select on table public."video_renditions" to "authenticated";
grant all on table public."video_renditions" to "service_role";

comment on table public."video_renditions" is
  'VOD rendition metadata only. Original/master is owner/private processing source; public playback must go through resolve_video_playback.';
comment on column public."video_renditions"."access_tier" is
  'free renditions may be exposed by the resolver to public viewers; premium requires backed Premium entitlement; original/private/owner stay out of regular playback.';

create or replace function public."record_video_original_rendition"(p_video_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_video public."videos"%rowtype;
  v_object_key text;
begin
  if v_actor_id is null then
    return jsonb_build_object('status', 'auth_required');
  end if;

  select *
  into v_video
  from public."videos" video
  where video."id" = p_video_id
    and video."owner_id" = v_actor_id;

  if not found then
    return jsonb_build_object('status', 'not_found_or_not_owner');
  end if;

  v_object_key := nullif(trim(coalesce(v_video."storage_object_key", v_video."storage_path", '')), '');
  if v_object_key is null then
    return jsonb_build_object('status', 'missing_source_object');
  end if;

  insert into public."video_renditions" (
    "video_id",
    "owner_id",
    "quality_label",
    "storage_bucket",
    "storage_path",
    "status",
    "access_tier",
    "container",
    "created_at",
    "updated_at"
  )
  values (
    v_video."id",
    v_video."owner_id",
    'original',
    coalesce(nullif(trim(v_video."storage_bucket"), ''), 'creator-videos'),
    v_object_key,
    'ready',
    'owner',
    nullif(trim(coalesce(v_video."mime_type", '')), ''),
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  on conflict ("video_id", "quality_label")
  do update set
    "owner_id" = excluded."owner_id",
    "storage_bucket" = excluded."storage_bucket",
    "storage_path" = excluded."storage_path",
    "status" = 'ready',
    "access_tier" = 'owner',
    "container" = excluded."container",
    "error_message" = null,
    "updated_at" = timezone('utc'::text, now());

  return jsonb_build_object('status', 'recorded', 'video_id', v_video."id");
end;
$$;

revoke all on function public."record_video_original_rendition"(uuid) from public;
grant execute on function public."record_video_original_rendition"(uuid) to authenticated;
grant execute on function public."record_video_original_rendition"(uuid) to service_role;

create or replace function public."resolve_video_playback"(target_video_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_video public."videos"%rowtype;
  v_is_owner boolean := false;
  v_is_staff boolean := false;
  v_has_premium boolean := false;
  v_is_public_safe boolean := false;
  v_has_legacy_source boolean := false;
  v_ready_rendition_count integer := 0;
  v_allowed_qualities jsonb := '[]'::jsonb;
  v_rendition_statuses jsonb := '[]'::jsonb;
  v_default_quality text := null;
  v_hd_available boolean := false;
  v_premium_locked_available boolean := false;
begin
  select *
  into v_video
  from public."videos" video
  where video."id" = target_video_id;

  if not found then
    return jsonb_build_object(
      'status', 'not_found',
      'video_id', target_video_id,
      'allowed_qualities', '[]'::jsonb,
      'default_quality', null,
      'is_premium_locked_available', false,
      'hd_available', false,
      'legacy_single_file_available', false,
      'legacy_playback_allowed', false,
      'message', 'Video was not found.'
    );
  end if;

  v_is_owner := v_viewer_id is not null and v_video."owner_id" = v_viewer_id;
  v_is_staff := public.has_platform_role(array['owner'::text, 'operator'::text]);
  v_is_public_safe := v_video."visibility" = 'public'
    and v_video."moderation_status" in ('clean', 'reported');
  v_has_legacy_source := nullif(trim(coalesce(v_video."storage_object_key", v_video."storage_path", v_video."playback_url", '')), '') is not null;

  if not (v_is_public_safe or v_is_owner or v_is_staff) then
    return jsonb_build_object(
      'status', 'not_allowed',
      'video_id', v_video."id",
      'title', coalesce(nullif(trim(v_video."title"), ''), 'Untitled Video'),
      'allowed_qualities', '[]'::jsonb,
      'default_quality', null,
      'is_premium_locked_available', false,
      'hd_available', false,
      'legacy_single_file_available', false,
      'legacy_playback_allowed', false,
      'message', 'This creator video is not available for this viewer.'
    );
  end if;

  if v_viewer_id is not null then
    v_has_premium := public.user_has_active_entitlement(v_viewer_id::text, array['premium'::text]);
  end if;

  select count(*)
  into v_ready_rendition_count
  from public."video_renditions" rendition
  where rendition."video_id" = v_video."id"
    and rendition."status" = 'ready'
    and rendition."quality_label" <> 'original';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', rendition."id",
      'quality_label', rendition."quality_label",
      'width', rendition."width",
      'height', rendition."height",
      'fps', rendition."fps",
      'bitrate_kbps', rendition."bitrate_kbps",
      'codec', rendition."codec",
      'container', rendition."container",
      'access_tier', rendition."access_tier",
      'storage_bucket', rendition."storage_bucket",
      'storage_path', rendition."storage_path",
      'manifest_path', rendition."manifest_path"
    )
    order by
      case rendition."quality_label"
        when '1080p' then 5
        when '720p' then 4
        when '480p' then 3
        when '360p' then 2
        else 1
      end desc
  ), '[]'::jsonb)
  into v_allowed_qualities
  from public."video_renditions" rendition
  where rendition."video_id" = v_video."id"
    and rendition."status" = 'ready'
    and rendition."quality_label" <> 'original'
    and nullif(trim(coalesce(rendition."manifest_path", rendition."storage_path", '')), '') is not null
    and (
      rendition."access_tier" = 'free'
      or v_is_owner
      or v_is_staff
      or (rendition."access_tier" = 'premium' and v_has_premium)
    );

  select rendition."quality_label"
  into v_default_quality
  from public."video_renditions" rendition
  where rendition."video_id" = v_video."id"
    and rendition."status" = 'ready'
    and rendition."quality_label" <> 'original'
    and nullif(trim(coalesce(rendition."manifest_path", rendition."storage_path", '')), '') is not null
    and (
      rendition."access_tier" = 'free'
      or v_is_owner
      or v_is_staff
      or (rendition."access_tier" = 'premium' and v_has_premium)
    )
  order by
    case rendition."quality_label"
      when '1080p' then 5
      when '720p' then 4
      when '480p' then 3
      when '360p' then 2
      else 1
    end desc
  limit 1;

  select exists (
    select 1
    from public."video_renditions" rendition
    where rendition."video_id" = v_video."id"
      and rendition."status" = 'ready'
      and rendition."quality_label" in ('720p', '1080p')
      and (
        rendition."access_tier" = 'free'
        or v_is_owner
        or v_is_staff
        or (rendition."access_tier" = 'premium' and v_has_premium)
      )
  )
  into v_hd_available;

  select exists (
    select 1
    from public."video_renditions" rendition
    where rendition."video_id" = v_video."id"
      and rendition."status" = 'ready'
      and rendition."quality_label" in ('720p', '1080p')
      and rendition."access_tier" = 'premium'
      and not (v_is_owner or v_is_staff or v_has_premium)
  )
  into v_premium_locked_available;

  if v_is_owner or v_is_staff then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', rendition."id",
        'quality_label', rendition."quality_label",
        'status', rendition."status",
        'access_tier', rendition."access_tier",
        'width', rendition."width",
        'height', rendition."height",
        'fps', rendition."fps",
        'bitrate_kbps', rendition."bitrate_kbps",
        'error_message', rendition."error_message",
        'updated_at', rendition."updated_at"
      )
      order by
        case rendition."quality_label"
          when 'original' then 1
          when '360p' then 2
          when '480p' then 3
          when '720p' then 4
          when '1080p' then 5
          else 6
        end asc
    ), '[]'::jsonb)
    into v_rendition_statuses
    from public."video_renditions" rendition
    where rendition."video_id" = v_video."id";
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'video_id', v_video."id",
    'title', coalesce(nullif(trim(v_video."title"), ''), 'Untitled Video'),
    'allowed_qualities', v_allowed_qualities,
    'default_quality', v_default_quality,
    'is_premium_locked_available', v_premium_locked_available,
    'hd_available', v_hd_available,
    'legacy_single_file_available', v_has_legacy_source,
    'legacy_playback_allowed', v_has_legacy_source and v_ready_rendition_count = 0,
    'legacy_quality_enforcement',
      case
        when jsonb_array_length(v_allowed_qualities) > 0 then 'resolver_renditions'
        when v_has_legacy_source and v_ready_rendition_count = 0 then 'pending_renditions'
        else 'no_playable_source'
      end,
    'message',
      case
        when jsonb_array_length(v_allowed_qualities) > 0 then 'Resolved playback through allowed VOD renditions.'
        when v_has_legacy_source and v_ready_rendition_count = 0 then 'Legacy single-file playback is available; quality enforcement is pending real renditions.'
        else 'No playable VOD rendition is ready.'
      end,
    'rendition_statuses', v_rendition_statuses
  );
end;
$$;

revoke all on function public."resolve_video_playback"(uuid) from public;
grant execute on function public."resolve_video_playback"(uuid) to anon;
grant execute on function public."resolve_video_playback"(uuid) to authenticated;
grant execute on function public."resolve_video_playback"(uuid) to service_role;

comment on function public."resolve_video_playback"(uuid) is
  'Resolver-owned VOD playback decision. Free viewers receive ready free renditions only; Premium viewers receive ready premium HD when backed entitlement exists; original/master paths are never returned as regular playback options.';

drop policy if exists "creator_videos_storage_select_public_or_owner" on storage.objects;
create policy "creator_videos_storage_select_public_or_owner"
  on storage.objects
  for select
  to public
  using (
    bucket_id = 'creator-videos'
    and (
      ((auth.uid() is not null) and ((storage.foldername(name))[1] = (auth.uid())::text))
      or exists (
        select 1
        from public."videos" video
        where video."visibility" = 'public'
          and video."moderation_status" in ('clean', 'reported')
          and (
            video."storage_path" = storage.objects.name
            or video."thumb_storage_path" = storage.objects.name
          )
      )
      or exists (
        select 1
        from public."video_renditions" rendition
        join public."videos" video on video."id" = rendition."video_id"
        where rendition."storage_bucket" = storage.objects.bucket_id
          and (
            rendition."storage_path" = storage.objects.name
            or rendition."manifest_path" = storage.objects.name
          )
          and rendition."status" = 'ready'
          and rendition."quality_label" <> 'original'
          and video."visibility" = 'public'
          and video."moderation_status" in ('clean', 'reported')
          and rendition."access_tier" = 'free'
      )
      or public.has_platform_role(array['owner'::text, 'operator'::text])
    )
  );

drop policy if exists "creator_videos_storage_select_premium_renditions" on storage.objects;
create policy "creator_videos_storage_select_premium_renditions"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'creator-videos'
    and exists (
      select 1
      from public."video_renditions" rendition
      join public."videos" video on video."id" = rendition."video_id"
      where rendition."storage_bucket" = storage.objects.bucket_id
        and (
          rendition."storage_path" = storage.objects.name
          or rendition."manifest_path" = storage.objects.name
        )
        and rendition."status" = 'ready'
        and rendition."quality_label" <> 'original'
        and rendition."access_tier" = 'premium'
        and video."visibility" = 'public'
        and video."moderation_status" in ('clean', 'reported')
        and public.user_has_active_entitlement((auth.uid())::text, array['premium'::text])
    )
  );
