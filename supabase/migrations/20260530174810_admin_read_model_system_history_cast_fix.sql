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
      'mediaSecurityRows', (select count(*) from unified where source = 'media_security'),
      'legalRows', (select count(*) from unified where source in ('legal_evidence', 'dmca')),
      'spectatorRows', (select count(*) from unified where source = 'spectator'),
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
  'Admin-safe System history read model over immutable audit/event tables. Casts every union column to public-safe scalar text/number fields and never returns secrets, provider keys, LiveKit tokens, raw room tokens, or metadata values.';
