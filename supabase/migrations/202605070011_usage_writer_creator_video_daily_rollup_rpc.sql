create or replace function public.rollup_creator_video_upload_usage_daily(target_usage_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id text := (auth.uid())::text;
  rollup_usage_date date := coalesce(target_usage_date, (timezone('utc'::text, now()))::date);
  rollup_window_start timestamp with time zone := (coalesce(target_usage_date, (timezone('utc'::text, now()))::date)::timestamp at time zone 'UTC');
  rollup_window_end timestamp with time zone := ((coalesce(target_usage_date, (timezone('utc'::text, now()))::date) + 1)::timestamp at time zone 'UTC');
  upload_rows_upserted integer := 0;
  storage_rows_upserted integer := 0;
begin
  if actor_user_id is null or actor_user_id = '' then
    return jsonb_build_object(
      'status', 'unauthenticated',
      'rolled_up', false
    );
  end if;

  if not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    return jsonb_build_object(
      'status', 'forbidden',
      'rolled_up', false,
      'usage_date', rollup_usage_date::text
    );
  end if;

  with upload_rollups as (
    select
      rollup_usage_date as "usage_date",
      nullif(btrim(coalesce(usage_event."user_id", '')), '') as "user_id",
      nullif(btrim(coalesce(usage_event."channel_user_id", '')), '') as "channel_user_id",
      'upload'::text as "usage_class",
      'creator_video_upload_events'::text as "metric_key",
      sum(greatest(coalesce(usage_event."quantity", 0), 0)) as "quantity",
      'event'::text as "unit",
      jsonb_build_object(
        'source_table', 'usage_meter_events',
        'source_event_type', 'video_uploaded',
        'source_event_source', 'app_rpc',
        'rollup', 'creator_video_upload_usage_daily',
        'metric_truth', 'internal_event_count',
        'billing_truth', false
      ) as "metadata"
    from public."usage_meter_events" usage_event
    where usage_event."event_type" = 'video_uploaded'
      and usage_event."event_source" = 'app_rpc'
      and usage_event."usage_class" = 'upload'
      and usage_event."unit" = 'event'
      and usage_event."created_at" >= rollup_window_start
      and usage_event."created_at" < rollup_window_end
    group by
      nullif(btrim(coalesce(usage_event."user_id", '')), ''),
      nullif(btrim(coalesce(usage_event."channel_user_id", '')), '')
  ),
  updated_uploads as (
    update public."usage_daily_summaries" summary
    set
      "quantity" = upload_rollups."quantity",
      "metadata" = upload_rollups."metadata",
      "updated_at" = timezone('utc'::text, now())
    from upload_rollups
    where summary."usage_date" = upload_rollups."usage_date"
      and coalesce(summary."user_id", '') = coalesce(upload_rollups."user_id", '')
      and coalesce(summary."channel_user_id", '') = coalesce(upload_rollups."channel_user_id", '')
      and coalesce(summary."room_id", '') = ''
      and coalesce(summary."media_id", '') = ''
      and summary."usage_class" = upload_rollups."usage_class"
      and summary."metric_key" = upload_rollups."metric_key"
      and summary."unit" = upload_rollups."unit"
    returning summary."id"
  ),
  inserted_uploads as (
    insert into public."usage_daily_summaries" (
      "usage_date",
      "user_id",
      "channel_user_id",
      "usage_class",
      "metric_key",
      "quantity",
      "unit",
      "metadata"
    )
    select
      upload_rollups."usage_date",
      upload_rollups."user_id",
      upload_rollups."channel_user_id",
      upload_rollups."usage_class",
      upload_rollups."metric_key",
      upload_rollups."quantity",
      upload_rollups."unit",
      upload_rollups."metadata"
    from upload_rollups
    where not exists (
      select 1
      from public."usage_daily_summaries" summary
      where summary."usage_date" = upload_rollups."usage_date"
        and coalesce(summary."user_id", '') = coalesce(upload_rollups."user_id", '')
        and coalesce(summary."channel_user_id", '') = coalesce(upload_rollups."channel_user_id", '')
        and coalesce(summary."room_id", '') = ''
        and coalesce(summary."media_id", '') = ''
        and summary."usage_class" = upload_rollups."usage_class"
        and summary."metric_key" = upload_rollups."metric_key"
        and summary."unit" = upload_rollups."unit"
    )
    returning "id"
  )
  select count(*)::integer
  into upload_rows_upserted
  from (
    select "id" from updated_uploads
    union all
    select "id" from inserted_uploads
  ) upserted_uploads;

  with storage_rollups as (
    select
      rollup_usage_date as "usage_date",
      nullif(btrim(coalesce(meter_event."owner_user_id", '')), '') as "user_id",
      nullif(btrim(coalesce(meter_event."owner_user_id", '')), '') as "channel_user_id",
      'storage_estimate'::text as "usage_class",
      'creator_video_storage_bytes'::text as "metric_key",
      sum(greatest(coalesce(meter_event."quantity", 0), 0)) as "quantity",
      'bytes'::text as "unit",
      jsonb_build_object(
        'source_table', 'platform_usage_metering_events',
        'source_metric_key', 'storage_bytes',
        'source_type', 'creator_video',
        'rollup', 'creator_video_upload_usage_daily',
        'metric_truth', 'metadata_estimate',
        'billing_truth', false
      ) as "metadata"
    from public."platform_usage_metering_events" meter_event
    where meter_event."metric_key" = 'storage_bytes'
      and meter_event."source_type" = 'creator_video'
      and meter_event."unit" = 'bytes'
      and nullif(btrim(coalesce(meter_event."owner_user_id", '')), '') is not null
      and meter_event."occurred_at" >= rollup_window_start
      and meter_event."occurred_at" < rollup_window_end
    group by nullif(btrim(coalesce(meter_event."owner_user_id", '')), '')
  ),
  updated_storage as (
    update public."usage_daily_summaries" summary
    set
      "quantity" = storage_rollups."quantity",
      "metadata" = storage_rollups."metadata",
      "updated_at" = timezone('utc'::text, now())
    from storage_rollups
    where summary."usage_date" = storage_rollups."usage_date"
      and coalesce(summary."user_id", '') = coalesce(storage_rollups."user_id", '')
      and coalesce(summary."channel_user_id", '') = coalesce(storage_rollups."channel_user_id", '')
      and coalesce(summary."room_id", '') = ''
      and coalesce(summary."media_id", '') = ''
      and summary."usage_class" = storage_rollups."usage_class"
      and summary."metric_key" = storage_rollups."metric_key"
      and summary."unit" = storage_rollups."unit"
    returning summary."id"
  ),
  inserted_storage as (
    insert into public."usage_daily_summaries" (
      "usage_date",
      "user_id",
      "channel_user_id",
      "usage_class",
      "metric_key",
      "quantity",
      "unit",
      "metadata"
    )
    select
      storage_rollups."usage_date",
      storage_rollups."user_id",
      storage_rollups."channel_user_id",
      storage_rollups."usage_class",
      storage_rollups."metric_key",
      storage_rollups."quantity",
      storage_rollups."unit",
      storage_rollups."metadata"
    from storage_rollups
    where not exists (
      select 1
      from public."usage_daily_summaries" summary
      where summary."usage_date" = storage_rollups."usage_date"
        and coalesce(summary."user_id", '') = coalesce(storage_rollups."user_id", '')
        and coalesce(summary."channel_user_id", '') = coalesce(storage_rollups."channel_user_id", '')
        and coalesce(summary."room_id", '') = ''
        and coalesce(summary."media_id", '') = ''
        and summary."usage_class" = storage_rollups."usage_class"
        and summary."metric_key" = storage_rollups."metric_key"
        and summary."unit" = storage_rollups."unit"
    )
    returning "id"
  )
  select count(*)::integer
  into storage_rows_upserted
  from (
    select "id" from updated_storage
    union all
    select "id" from inserted_storage
  ) upserted_storage;

  return jsonb_build_object(
    'status',
      case
        when upload_rows_upserted > 0 or storage_rows_upserted > 0 then 'rolled_up'
        else 'no_source_rows'
      end,
    'rolled_up', upload_rows_upserted > 0 or storage_rows_upserted > 0,
    'usage_date', rollup_usage_date::text,
    'upload_summary_rows_upserted', upload_rows_upserted,
    'storage_summary_rows_upserted', storage_rows_upserted
  );
end;
$$;

revoke all on function public.rollup_creator_video_upload_usage_daily(date) from public;
revoke all on function public.rollup_creator_video_upload_usage_daily(date) from "anon";
grant execute on function public.rollup_creator_video_upload_usage_daily(date) to "authenticated";

comment on function public.rollup_creator_video_upload_usage_daily(date) is
  'Rolls up already-backed creator-video upload usage rows into daily summaries for owner/operator Admin use. Does not record bandwidth, participant-minutes, provider imports, billing, revenue, payouts, invoices, overages, or provider costs.';
