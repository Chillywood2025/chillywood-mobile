-- Admin-safe malware scanner read model.
--
-- This exposes scanner status to Owner/Admin and scoped operations staff
-- without returning storage buckets, object keys, raw paths, raw error bodies,
-- service-role values, or metadata values.

create or replace function public."get_admin_media_scan_read_model"(
  p_status text default 'all',
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, 'all')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_payload jsonb;
begin
  if not public.admin_read_models_can_read_ops() then
    raise exception 'admin_media_scan_read_model_denied' using errcode = '42501';
  end if;

  with filtered as (
    select job.*
    from public."media_scan_jobs" job
    where v_status = 'all' or job."status" = v_status
  ),
  limited as (
    select *
    from filtered
    order by coalesce("completed_at", "claimed_at", "created_at") desc nulls last, "created_at" desc
    limit v_limit
  )
  select jsonb_build_object(
    'connected', true,
    'generatedAt', timezone('utc'::text, now()),
    'status', v_status,
    'summary', jsonb_build_object(
      'filteredRows', (select count(*) from filtered),
      'totalRows', (select count(*) from public."media_scan_jobs"),
      'pendingRows', (select count(*) from public."media_scan_jobs" where "status" = 'pending_scan'),
      'scanningRows', (select count(*) from public."media_scan_jobs" where "status" = 'scanning'),
      'cleanRows', (select count(*) from public."media_scan_jobs" where "status" = 'clean'),
      'malwareDetectedRows', (select count(*) from public."media_scan_jobs" where "status" = 'malware_detected'),
      'scanFailedRows', (select count(*) from public."media_scan_jobs" where "status" = 'scan_failed'),
      'manualReviewRows', (select count(*) from public."media_scan_jobs" where "status" = 'manual_review'),
      'quarantinedRows', (select count(*) from public."media_scan_jobs" where "status" = 'quarantined'),
      'staleScanningRows', (
        select count(*)
        from public."media_scan_jobs"
        where "status" = 'scanning'
          and "claimed_at" < now() - interval '20 minutes'
      ),
      'oldestPendingAt', (
        select min("created_at")
        from public."media_scan_jobs"
        where "status" in ('pending_scan', 'scan_failed')
      ),
      'latestCompletedAt', (
        select max("completed_at")
        from public."media_scan_jobs"
        where "status" in ('clean', 'malware_detected', 'manual_review', 'quarantined')
      ),
      'latestClaimedAt', (
        select max("claimed_at")
        from public."media_scan_jobs"
      )
    ),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'jobId', row_data."id",
          'targetTable', row_data."target_table",
          'targetColumn', row_data."target_column",
          'targetId', row_data."target_id",
          'status', row_data."status",
          'priority', row_data."priority",
          'attemptCount', row_data."attempt_count",
          'maxAttempts', row_data."max_attempts",
          'claimedBy', case when nullif(trim(coalesce(row_data."claimed_by", '')), '') is null then null else 'scanner-worker' end,
          'claimedAt', row_data."claimed_at",
          'completedAt', row_data."completed_at",
          'scannerProvider', row_data."scanner_provider",
          'scannerVersion', row_data."scanner_version",
          'signatureVersion', row_data."signature_version",
          'findingName', row_data."finding_name",
          'errorPresent', nullif(trim(coalesce(row_data."error_message", '')), '') is not null,
          'mimeType', row_data."mime_type",
          'sizeBytes', row_data."size_bytes",
          'metadataFieldCount', public.admin_read_model_jsonb_object_key_count(row_data."metadata"),
          'createdAt', row_data."created_at",
          'updatedAt', row_data."updated_at"
        )
        order by coalesce(row_data."completed_at", row_data."claimed_at", row_data."created_at") desc nulls last, row_data."created_at" desc
      )
      from limited row_data
    ), '[]'::jsonb)
  ) into v_payload;

  return v_payload;
end;
$$;

revoke all on function public."get_admin_media_scan_read_model"(text, integer) from public;
grant execute on function public."get_admin_media_scan_read_model"(text, integer) to authenticated;

comment on function public."get_admin_media_scan_read_model"(text, integer) is
  'Admin-safe malware scanner read model over media_scan_jobs. Returns counts and sanitized scan job status only; does not return storage buckets, object keys, raw paths, raw error bodies, service-role values, or metadata values.';

create or replace function public."get_admin_system_history_read_model"(
  p_source text default 'all',
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_source text := lower(trim(coalesce(p_source, 'all')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_payload jsonb;
begin
  if not public.admin_read_models_can_read_ops() then
    raise exception 'admin_system_history_read_model_denied' using errcode = '42501';
  end if;

  with unified as (
    select
      'admin_audit'::text as source,
      audit_row."id"::text as row_id,
      audit_row."created_at" as occurred_at,
      audit_row."action"::text as event_type,
      audit_row."action_category"::text as category,
      null::text as status,
      audit_row."severity"::text as severity,
      audit_row."actor_role"::text as actor_role,
      audit_row."actor_user_id"::text as actor_user_id,
      audit_row."target_type"::text as target_type,
      audit_row."target_id"::text as target_id,
      null::text as room_id,
      audit_row."reason"::text as result_label,
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata") as metadata_field_count
    from public."platform_admin_audit_logs" audit_row
    union all
    select
      'live_ops'::text,
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."event_type"::text,
      audit_row."action_type"::text,
      case when audit_row."success" is true then 'success' when audit_row."success" is false then 'failed' else null::text end,
      audit_row."risk_level"::text,
      audit_row."actor_role"::text,
      audit_row."actor_user_id"::text,
      (audit_row."target" ->> 'type')::text,
      (audit_row."target" ->> 'id')::text,
      (audit_row."target" ->> 'room_id')::text,
      (case when audit_row."dry_run" then 'dry_run' else coalesce(audit_row."error_message", 'executed') end)::text,
      public.admin_read_model_jsonb_object_key_count(audit_row."result")
    from public."admin_live_ops_action_audit" audit_row
    union all
    select
      'security'::text,
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."event_type"::text,
      audit_row."target_type"::text,
      null::text,
      audit_row."severity"::text,
      audit_row."actor_role"::text,
      audit_row."actor_user_id"::text,
      audit_row."target_type"::text,
      audit_row."target_id"::text,
      null::text,
      audit_row."reason"::text,
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata")
    from public."security_audit_events" audit_row
    union all
    select
      'livekit_token'::text,
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."action"::text,
      coalesce(audit_row."surface", audit_row."room_kind", audit_row."room_type")::text,
      audit_row."outcome"::text,
      audit_row."error_code"::text,
      audit_row."effective_participant_role"::text,
      audit_row."actor_user_id"::text,
      'livekit_room'::text,
      coalesce(audit_row."room_name_hash", audit_row."app_room_id_hash")::text,
      audit_row."app_room_id_hash"::text,
      audit_row."outcome"::text,
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata")
    from public."livekit_token_request_audit" audit_row
    union all
    select
      'livekit_routing'::text,
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."event_type"::text,
      'routing'::text,
      null::text,
      null::text,
      null::text,
      audit_row."actor_user_id"::text,
      'app_room'::text,
      audit_row."app_room_id"::text,
      audit_row."app_room_id"::text,
      audit_row."reason"::text,
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata")
    from public."livekit_routing_audit" audit_row
    union all
    select
      'media_security'::text,
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."action"::text,
      audit_row."surface_type"::text,
      audit_row."result"::text,
      null::text,
      null::text,
      audit_row."actor_user_id"::text,
      audit_row."surface_type"::text,
      audit_row."record_id"::text,
      null::text,
      audit_row."reason"::text,
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata")
    from public."media_security_audit_events" audit_row
    union all
    select
      'media_scan'::text,
      job."id"::text,
      coalesce(job."completed_at", job."claimed_at", job."created_at"),
      'malware_scan'::text,
      concat_ws(':', job."target_table", job."target_column")::text,
      job."status"::text,
      case
        when job."status" in ('malware_detected', 'quarantined') then 'high'
        when job."status" in ('scan_failed', 'manual_review') then 'warning'
        when job."status" in ('pending_scan', 'scanning') then 'manual'
        else 'info'
      end::text,
      'scanner'::text,
      null::text,
      job."target_table"::text,
      job."target_id"::text,
      null::text,
      coalesce(nullif(job."finding_name", ''), job."status")::text,
      public.admin_read_model_jsonb_object_key_count(job."metadata")
    from public."media_scan_jobs" job
    union all
    select
      'legal_evidence'::text,
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."action"::text,
      audit_row."target_type"::text,
      null::text,
      null::text,
      audit_row."actor_role"::text,
      audit_row."actor_user_id"::text,
      audit_row."target_type"::text,
      audit_row."target_id"::text,
      null::text,
      audit_row."reason"::text,
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata")
    from public."legal_evidence_audit_log" audit_row
    union all
    select
      'dmca'::text,
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."event_type"::text,
      'dmca'::text,
      null::text,
      null::text,
      audit_row."actor_role"::text,
      audit_row."actor_user_id"::text,
      'dmca_case'::text,
      audit_row."dmca_case_id"::text,
      null::text,
      audit_row."reason"::text,
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata")
    from public."dmca_audit_log" audit_row
    union all
    select
      'spectator'::text,
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."event_type"::text,
      'spectator_child_room'::text,
      audit_row."denial_reason"::text,
      null::text,
      null::text,
      audit_row."actor_user_id"::text,
      'spectator_source'::text,
      audit_row."source_item_id"::text,
      audit_row."child_room_id"::text,
      audit_row."denial_reason"::text,
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata")
    from public."spectator_child_room_audit_log" audit_row
    union all
    select
      'provider_readiness'::text,
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."action"::text,
      concat_ws(':', audit_row."provider", audit_row."capability")::text,
      audit_row."status_after"::text,
      null::text,
      null::text,
      audit_row."actor_user_id"::text,
      'provider_readiness'::text,
      concat_ws(':', audit_row."provider", audit_row."capability")::text,
      null::text,
      coalesce(audit_row."reason", audit_row."proof_source")::text,
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata")
    from public."provider_readiness_audit_log" audit_row
    union all
    select
      'provider_webhook'::text,
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."event_type"::text,
      concat_ws(':', audit_row."provider", audit_row."provider_environment")::text,
      audit_row."status"::text,
      null::text,
      null::text,
      null::text,
      'provider_webhook_event'::text,
      audit_row."id"::text,
      null::text,
      coalesce(audit_row."failure_reason", concat_ws(' ', audit_row."provider_environment", audit_row."status"))::text,
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata")
    from public."creator_payout_provider_webhook_events" audit_row
  ),
  filtered as (
    select *
    from unified
    where v_source = 'all' or source = v_source
  ),
  limited as (
    select *
    from filtered
    order by occurred_at desc nulls last
    limit v_limit
  )
  select jsonb_build_object(
    'connected', true,
    'generatedAt', timezone('utc'::text, now()),
    'source', v_source,
    'summary', jsonb_build_object(
      'filteredRows', (select count(*) from filtered),
      'adminAuditRows', (select count(*) from unified where source = 'admin_audit'),
      'liveOpsRows', (select count(*) from unified where source = 'live_ops'),
      'securityRows', (select count(*) from unified where source = 'security'),
      'liveKitRows', (select count(*) from unified where source in ('livekit_token', 'livekit_routing')),
      'mediaSecurityRows', (select count(*) from unified where source in ('media_security', 'media_scan')),
      'legalRows', (select count(*) from unified where source in ('legal_evidence', 'dmca')),
      'spectatorRows', (select count(*) from unified where source = 'spectator'),
      'providerRows', (select count(*) from unified where source in ('provider_readiness', 'provider_webhook')),
      'latestAt', (select max(occurred_at) from filtered)
    ),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'source', row_data.source,
          'rowId', row_data.row_id,
          'occurredAt', row_data.occurred_at,
          'eventType', row_data.event_type,
          'category', row_data.category,
          'status', row_data.status,
          'severity', row_data.severity,
          'actorRole', row_data.actor_role,
          'actorUserId', row_data.actor_user_id,
          'targetType', row_data.target_type,
          'targetId', row_data.target_id,
          'roomId', row_data.room_id,
          'resultLabel', row_data.result_label,
          'metadataFieldCount', row_data.metadata_field_count
        )
        order by row_data.occurred_at desc nulls last
      )
      from limited row_data
    ), '[]'::jsonb)
  ) into v_payload;

  return v_payload;
end;
$$;

revoke all on function public."get_admin_system_history_read_model"(text, integer) from public;
grant execute on function public."get_admin_system_history_read_model"(text, integer) to authenticated;

comment on function public."get_admin_system_history_read_model"(text, integer) is
  'Admin-safe System history read model over immutable audit/event tables, media scan jobs, provider readiness, and provider webhook evidence when backed. Casts every union column to public-safe scalar text/number fields and never returns secrets, storage paths, provider keys, provider payload values, LiveKit tokens, raw room tokens, raw scan errors, or metadata values.';
