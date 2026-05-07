create unique index if not exists "usage_meter_events_creator_video_upload_media_unique"
  on public."usage_meter_events" using btree ("media_id")
  where "event_type" = 'video_uploaded'::text
    and "usage_class" = 'upload'::text
    and "media_id" is not null;

create unique index if not exists "platform_usage_metering_events_creator_video_storage_unique"
  on public."platform_usage_metering_events" using btree ("source_id")
  where "metric_key" = 'storage_bytes'::text
    and "source_type" = 'creator_video'::text
    and "source_id" is not null;

create or replace function public.record_creator_video_upload_usage(target_video_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id text := (auth.uid())::text;
  normalized_video_id text := nullif(btrim(coalesce(target_video_id, '')), '');
  video_record record;
  usage_event_inserted boolean := false;
  storage_event_inserted boolean := false;
  file_size_bytes numeric := 0;
begin
  if actor_user_id is null or actor_user_id = '' then
    return jsonb_build_object(
      'status', 'unauthenticated',
      'recorded', false
    );
  end if;

  if normalized_video_id is null then
    return jsonb_build_object(
      'status', 'invalid_video_id',
      'recorded', false
    );
  end if;

  select
    "id",
    "owner_id",
    "file_size_bytes",
    "storage_provider",
    "visibility"
  into video_record
  from public."videos"
  where "id" = normalized_video_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'not_found',
      'recorded', false
    );
  end if;

  if coalesce(video_record."owner_id", '') <> actor_user_id then
    return jsonb_build_object(
      'status', 'not_owner',
      'recorded', false
    );
  end if;

  file_size_bytes := greatest(coalesce(video_record."file_size_bytes", 0), 0);

  insert into public."usage_meter_events" (
    "event_type",
    "event_source",
    "user_id",
    "channel_user_id",
    "media_id",
    "usage_class",
    "quantity",
    "unit",
    "metadata"
  )
  values (
    'video_uploaded',
    'app_rpc',
    actor_user_id,
    video_record."owner_id",
    video_record."id",
    'upload',
    1,
    'event',
    jsonb_build_object(
      'file_size_bytes', video_record."file_size_bytes",
      'storage_provider', video_record."storage_provider",
      'visibility', video_record."visibility"
    )
  )
  on conflict do nothing
  returning true into usage_event_inserted;

  usage_event_inserted := coalesce(usage_event_inserted, false);

  if file_size_bytes > 0 then
    insert into public."platform_usage_metering_events" (
      "metric_key",
      "source_type",
      "source_id",
      "owner_user_id",
      "quantity",
      "unit",
      "metadata"
    )
    values (
      'storage_bytes',
      'creator_video',
      video_record."id",
      video_record."owner_id",
      file_size_bytes,
      'bytes',
      jsonb_build_object(
        'storage_provider', video_record."storage_provider"
      )
    )
    on conflict do nothing
    returning true into storage_event_inserted;

    storage_event_inserted := coalesce(storage_event_inserted, false);
  end if;

  return jsonb_build_object(
    'status',
      case
        when usage_event_inserted or storage_event_inserted then 'recorded'
        else 'skipped'
      end,
    'recorded', usage_event_inserted or storage_event_inserted,
    'usage_event_recorded', usage_event_inserted,
    'storage_event_recorded', storage_event_inserted,
    'video_id', video_record."id"
  );
end;
$$;

revoke all on function public.record_creator_video_upload_usage(text) from public;
grant execute on function public.record_creator_video_upload_usage(text) to "authenticated";

comment on function public.record_creator_video_upload_usage(text) is
  'Records idempotent creator-video upload usage for the authenticated owner after a videos row exists. Does not record bandwidth, participant-minutes, billing, revenue, payouts, provider imports, or overages.';
