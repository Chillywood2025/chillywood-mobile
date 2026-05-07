create or replace function public.record_creator_video_upload_usage(target_video_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id text := (auth.uid())::text;
  normalized_video_id text := nullif(btrim(coalesce(target_video_id, '')), '');
  normalized_video_uuid uuid;
  video_record record;
  usage_event_inserted boolean := false;
  storage_event_inserted boolean := false;
  video_file_size_bytes numeric := 0;
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

  begin
    normalized_video_uuid := normalized_video_id::uuid;
  exception
    when invalid_text_representation then
      return jsonb_build_object(
        'status', 'invalid_video_id',
        'recorded', false
      );
  end;

  select
    video."id",
    video."owner_id",
    video."file_size_bytes",
    video."storage_provider",
    video."visibility"
  into video_record
  from public."videos" video
  where video."id" = normalized_video_uuid
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

  video_file_size_bytes := greatest(coalesce(video_record."file_size_bytes", 0), 0);

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
    video_record."id"::text,
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

  if video_file_size_bytes > 0 then
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
      video_record."id"::text,
      video_record."owner_id",
      video_file_size_bytes,
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
    'video_id', video_record."id"::text
  );
end;
$$;

revoke all on function public.record_creator_video_upload_usage(text) from public;
grant execute on function public.record_creator_video_upload_usage(text) to "authenticated";

comment on function public.record_creator_video_upload_usage(text) is
  'Records idempotent creator-video upload usage for the authenticated owner after a videos row exists. Does not record bandwidth, participant-minutes, billing, revenue, payouts, provider imports, or overages.';
