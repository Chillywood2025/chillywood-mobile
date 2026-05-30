create or replace function public."admin_read_models_can_read_users"()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      public.has_platform_role(array['owner'::text, 'operator'::text])
      or public.has_platform_permission('user_lookup')
      or public.has_platform_permission('support_inbox')
      or public.has_platform_permission('reports_review')
      or public.has_platform_permission('legal_review')
      or public.has_platform_permission('security_review')
    );
$$;

create or replace function public."admin_read_models_can_read_ops"()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      public.has_platform_role(array['owner'::text, 'operator'::text])
      or public.has_platform_permission('audit_review')
      or public.has_platform_permission('security_review')
      or public.has_platform_permission('live_ops')
      or public.has_platform_permission('billing_support_read')
      or public.has_platform_permission('reports_review')
    );
$$;

create or replace function public."admin_read_model_jsonb_object_key_count"(p_value jsonb)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_value) = 'object' then (
      select count(*)::integer
      from jsonb_object_keys(p_value)
    )
    else 0
  end;
$$;

create or replace function public."get_admin_users_read_model"(
  p_query text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_payload jsonb;
begin
  if not public.admin_read_models_can_read_users() then
    raise exception 'admin_users_read_model_denied' using errcode = '42501';
  end if;

  with base as (
    select
      auth_user."id"::text as user_id,
      auth_user."email"::text as email,
      auth_user."email_confirmed_at",
      auth_user."confirmed_at",
      auth_user."last_sign_in_at",
      auth_user."created_at",
      auth_user."updated_at",
      auth_user."banned_until",
      auth_user."deleted_at",
      coalesce(auth_user."is_anonymous", false) as is_anonymous,
      profile."username",
      profile."display_name",
      profile."channel_role",
      profile."profile_visibility",
      profile."profile_avatar_media_status",
      profile."profile_background_media_status",
      profile."profile_media_updated_at",
      case
        when auth_user."deleted_at" is not null then 'deleted'
        when auth_user."banned_until" is not null and auth_user."banned_until" > now() then 'banned'
        when coalesce(auth_user."is_anonymous", false) then 'anonymous'
        when auth_user."email_confirmed_at" is null and auth_user."confirmed_at" is null then 'unconfirmed'
        else 'active'
      end as auth_status
    from auth."users" auth_user
    left join public."user_profiles" profile
      on profile."user_id" = auth_user."id"::text
  ),
  filtered as (
    select *
    from base
    where
      v_query = ''
      or lower(
        concat_ws(
          ' ',
          base.user_id,
          base.email,
          base.username,
          base.display_name,
          base.channel_role,
          base.profile_visibility,
          base.auth_status
        )
      ) like '%' || v_query || '%'
  ),
  limited as (
    select *
    from filtered
    order by filtered.created_at desc nulls last
    limit v_limit
  )
  select jsonb_build_object(
    'connected', true,
    'generatedAt', timezone('utc'::text, now()),
    'summary', jsonb_build_object(
      'totalUsers', (select count(*) from base),
      'filteredUsers', (select count(*) from filtered),
      'activeUsers', (select count(*) from base where auth_status = 'active'),
      'unconfirmedUsers', (select count(*) from base where auth_status = 'unconfirmed'),
      'bannedUsers', (select count(*) from base where auth_status = 'banned'),
      'deletedUsers', (select count(*) from base where auth_status = 'deleted'),
      'anonymousUsers', (select count(*) from base where auth_status = 'anonymous'),
      'privateProfiles', (select count(*) from base where coalesce(profile_visibility, 'public') <> 'public'),
      'premiumActiveUsers', (
        select count(distinct entitlement."user_id")
        from public."user_entitlements" entitlement
        where entitlement."entitlement_key" = 'premium'
          and entitlement."status" in ('active', 'trialing', 'grace_period')
      ),
      'openTargetedReports', (
        select count(*)
        from public."safety_reports" report
        where coalesce(report."status", 'needs_review') in ('needs_review', 'reviewing', 'escalated')
      ),
      'activeStaffRoles', (
        select count(*)
        from public."platform_role_memberships" role_row
        where role_row."status" = 'active'
      ),
      'activeBlocks', (select count(*) from public."channel_audience_blocks"),
      'accountDeletionRequests', (
        select count(*)
        from public."legal_request_intake" request_row
        where lower(coalesce(request_row."request_type", '')) in ('account_deletion', 'account_deletion_request', 'delete_account')
          or lower(coalesce(request_row."request_reason", '')) like '%account deletion%'
          or lower(coalesce(request_row."request_reason", '')) like '%delete account%'
      )
    ),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'userId', row_data.user_id,
          'email', row_data.email,
          'identityLabel', coalesce(nullif(row_data.display_name, ''), nullif(row_data.username, ''), row_data.email, concat('User ', left(row_data.user_id, 8))),
          'username', row_data.username,
          'displayName', row_data.display_name,
          'authStatus', row_data.auth_status,
          'profileVisibility', coalesce(row_data.profile_visibility, 'public'),
          'profileRole', row_data.channel_role,
          'profileAvatarMediaStatus', coalesce(row_data.profile_avatar_media_status, 'active'),
          'profileBackgroundMediaStatus', coalesce(row_data.profile_background_media_status, 'active'),
          'profileMediaUpdatedAt', row_data.profile_media_updated_at,
          'createdAt', row_data.created_at,
          'updatedAt', row_data.updated_at,
          'lastSignInAt', row_data.last_sign_in_at,
          'emailConfirmedAt', coalesce(row_data.email_confirmed_at, row_data.confirmed_at),
          'bannedUntil', row_data.banned_until,
          'deletedAt', row_data.deleted_at,
          'premium', (
            select jsonb_build_object(
              'status', entitlement."status",
              'source', entitlement."source",
              'startsAt', entitlement."starts_at",
              'expiresAt', entitlement."expires_at",
              'revokedAt', entitlement."revoked_at",
              'updatedAt', entitlement."updated_at"
            )
            from public."user_entitlements" entitlement
            where entitlement."user_id" = row_data.user_id
              and entitlement."entitlement_key" = 'premium'
            order by entitlement."updated_at" desc nulls last
            limit 1
          ),
          'staffRoles', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'role', role_row."role",
                'status', role_row."status",
                'grantedAt', role_row."granted_at",
                'revokedAt', role_row."revoked_at"
              )
              order by role_row."granted_at" desc nulls last
            )
            from public."platform_role_memberships" role_row
            where role_row."user_id" = row_data.user_id
              or (row_data.email is not null and lower(role_row."email") = lower(row_data.email))
          ), '[]'::jsonb),
          'counts', jsonb_build_object(
            'reportsMade', (
              select count(*)
              from public."safety_reports" report
              where report."reporter_user_id" = row_data.user_id
            ),
            'reportsTargetingUser', (
              select count(*)
              from public."safety_reports" report
              where report."target_id" = row_data.user_id
                or report."reporter_user_id" = row_data.user_id
            ),
            'openReportsTargetingUser', (
              select count(*)
              from public."safety_reports" report
              where (
                  report."target_id" = row_data.user_id
                  or report."reporter_user_id" = row_data.user_id
                )
                and coalesce(report."status", 'needs_review') in ('needs_review', 'reviewing', 'escalated')
            ),
            'blocksCreated', (
              select count(*)
              from public."channel_audience_blocks" block_row
              where block_row."blocked_by_user_id" = row_data.user_id
                or block_row."channel_user_id" = row_data.user_id
            ),
            'blocksReceived', (
              select count(*)
              from public."channel_audience_blocks" block_row
              where block_row."blocked_user_id" = row_data.user_id
            ),
            'profilePosts', (
              select count(*)
              from public."profile_posts" post_row
              where post_row."user_id" = row_data.user_id
                and post_row."deleted_at" is null
            ),
            'publicProfilePosts', (
              select count(*)
              from public."profile_posts" post_row
              where post_row."user_id" = row_data.user_id
                and post_row."deleted_at" is null
                and coalesce(post_row."visibility", 'public') = 'public'
                and coalesce(post_row."moderation_status", 'clean') not in ('hidden', 'removed')
            ),
            'creatorVideos', (
              select count(*)
              from public."videos" video_row
              where video_row."owner_id"::text = row_data.user_id
            ),
            'publicCreatorVideos', (
              select count(*)
              from public."videos" video_row
              where video_row."owner_id"::text = row_data.user_id
                and coalesce(video_row."visibility", 'private') = 'public'
                and coalesce(video_row."moderation_status", 'clean') not in ('hidden', 'removed')
            ),
            'accountDeletionRequests', (
              select count(*)
              from public."legal_request_intake" request_row
              where request_row."target_user_id" = row_data.user_id
                and (
                  lower(coalesce(request_row."request_type", '')) in ('account_deletion', 'account_deletion_request', 'delete_account')
                  or lower(coalesce(request_row."request_reason", '')) like '%account deletion%'
                  or lower(coalesce(request_row."request_reason", '')) like '%delete account%'
                )
            )
          )
        )
        order by row_data.created_at desc nulls last
      )
      from limited row_data
    ), '[]'::jsonb)
  ) into v_payload;

  return v_payload;
end;
$$;

create or replace function public."get_admin_usage_detail_read_model"(
  p_section text default 'all',
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_section text := lower(trim(coalesce(p_section, 'all')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_payload jsonb;
begin
  if not public.admin_read_models_can_read_ops() then
    raise exception 'admin_usage_detail_read_model_denied' using errcode = '42501';
  end if;

  with unified as (
    select
      'internal'::text as row_group,
      'usage_meter_event'::text as row_kind,
      event_row."id"::text as row_id,
      event_row."created_at" as occurred_at,
      coalesce(event_row."event_type", event_row."usage_class", 'Usage event') as primary_label,
      coalesce(event_row."event_source", event_row."storage_provider", 'Internal metering') as secondary_label,
      event_row."usage_class" as metric_key,
      event_row."quantity" as quantity,
      event_row."unit" as unit,
      event_row."user_id",
      event_row."room_id",
      event_row."media_id",
      null::text as status,
      coalesce(event_row."event_source", 'internal') as source
    from public."usage_meter_events" event_row
    union all
    select
      'internal',
      'usage_daily_summary',
      summary_row."id"::text,
      summary_row."usage_date"::timestamptz,
      coalesce(summary_row."metric_key", summary_row."usage_class", 'Daily summary'),
      'Daily rollup',
      summary_row."metric_key",
      summary_row."quantity",
      summary_row."unit",
      summary_row."user_id",
      summary_row."room_id",
      summary_row."media_id",
      null::text,
      'usage_daily_summaries'
    from public."usage_daily_summaries" summary_row
    union all
    select
      'internal',
      'usage_monthly_summary',
      summary_row."id"::text,
      summary_row."usage_month"::timestamptz,
      coalesce(summary_row."metric_key", summary_row."usage_class", 'Monthly summary'),
      'Monthly rollup',
      summary_row."metric_key",
      summary_row."quantity",
      summary_row."unit",
      summary_row."user_id",
      summary_row."room_id",
      summary_row."media_id",
      null::text,
      'usage_monthly_summaries'
    from public."usage_monthly_summaries" summary_row
    union all
    select
      'internal',
      'platform_usage_event',
      event_row."id"::text,
      event_row."occurred_at",
      coalesce(event_row."metric_key", 'Platform usage event'),
      coalesce(event_row."source_type", 'Platform metering'),
      event_row."metric_key",
      event_row."quantity",
      event_row."unit",
      event_row."owner_user_id",
      null::text,
      event_row."source_id"::text,
      null::text,
      'platform_usage_metering_events'
    from public."platform_usage_metering_events" event_row
    union all
    select
      'provider',
      'provider_import',
      import_row."id"::text,
      import_row."created_at",
      coalesce(import_row."provider", 'Provider import'),
      coalesce(import_row."import_type", 'Provider usage import'),
      null::text,
      import_row."records_imported"::numeric,
      'records'::text,
      null::text,
      null::text,
      import_row."provider_account_id"::text,
      import_row."status",
      'provider_usage_imports'
    from public."provider_usage_imports" import_row
    union all
    select
      'provider',
      'provider_daily_usage',
      daily_row."id"::text,
      daily_row."usage_date"::timestamptz,
      coalesce(daily_row."metric_key", daily_row."resource_type", 'Provider usage'),
      coalesce(daily_row."provider", 'Provider'),
      daily_row."metric_key",
      daily_row."quantity",
      daily_row."unit",
      null::text,
      null::text,
      daily_row."provider_account_id"::text,
      null::text,
      'provider_usage_daily'
    from public."provider_usage_daily" daily_row
    union all
    select
      'reconciliation',
      'provider_reconciliation',
      reconciliation_row."id"::text,
      reconciliation_row."updated_at",
      coalesce(reconciliation_row."usage_class", reconciliation_row."provider", 'Provider reconciliation'),
      coalesce(reconciliation_row."provider", 'Provider'),
      reconciliation_row."usage_class",
      reconciliation_row."variance_quantity",
      reconciliation_row."unit",
      null::text,
      null::text,
      null::text,
      reconciliation_row."status",
      'provider_usage_reconciliation'
    from public."provider_usage_reconciliation" reconciliation_row
    union all
    select
      'reconciliation',
      'provider_billing_snapshot',
      snapshot_row."id"::text,
      snapshot_row."updated_at",
      coalesce(snapshot_row."provider", 'Provider billing snapshot'),
      coalesce(snapshot_row."billing_month"::text, 'Billing month'),
      'provider_amount'::text,
      null::numeric,
      snapshot_row."currency",
      null::text,
      null::text,
      snapshot_row."provider_account_id"::text,
      snapshot_row."status",
      'provider_billing_snapshots'
    from public."provider_billing_snapshots" snapshot_row
    union all
    select
      'watch_party',
      'watch_party_membership',
      concat(member_row."party_id", ':', member_row."user_id"),
      coalesce(member_row."last_seen_at", member_row."joined_at", member_row."updated_at"),
      coalesce(member_row."membership_state", 'Watch-Party membership'),
      coalesce(member_row."role", member_row."stage_role", 'participant'),
      'participant_session'::text,
      null::numeric,
      'row'::text,
      member_row."user_id",
      member_row."party_id",
      null::text,
      member_row."membership_state",
      'watch_party_room_memberships'
    from public."watch_party_room_memberships" member_row
    union all
    select
      'live',
      'communication_membership',
      concat(member_row."room_id", ':', member_row."user_id"),
      coalesce(member_row."last_seen_at", member_row."joined_at", member_row."updated_at"),
      coalesce(member_row."membership_state", 'Live membership'),
      coalesce(member_row."role", 'participant'),
      'participant_session'::text,
      null::numeric,
      'row'::text,
      member_row."user_id",
      member_row."room_id",
      null::text,
      member_row."membership_state",
      'communication_room_memberships'
    from public."communication_room_memberships" member_row
    union all
    select
      'uploads',
      'creator_video',
      video_row."id"::text,
      video_row."created_at"::timestamptz,
      coalesce(nullif(video_row."title", ''), 'Creator video'),
      coalesce(video_row."visibility", 'unknown'),
      'file_size_bytes'::text,
      video_row."file_size_bytes"::numeric,
      'bytes'::text,
      video_row."owner_id"::text,
      null::text,
      video_row."id"::text,
      coalesce(video_row."moderation_status", 'clean'),
      'videos'
    from public."videos" video_row
    union all
    select
      'storage',
      'social_attachment',
      attachment_row."id"::text,
      attachment_row."created_at",
      coalesce(attachment_row."surface_type", 'Social attachment'),
      coalesce(attachment_row."mime_type", 'attachment'),
      'size_bytes'::text,
      attachment_row."size_bytes"::numeric,
      'bytes'::text,
      attachment_row."owner_user_id",
      null::text,
      attachment_row."surface_id"::text,
      coalesce(attachment_row."moderation_status", 'clean'),
      'social_attachments'
    from public."social_attachments" attachment_row
  ),
  filtered as (
    select *
    from unified
    where
      v_section = 'all'
      or row_group = v_section
      or (v_section = 'uploads' and row_group in ('uploads', 'storage'))
      or (v_section = 'storage' and row_group in ('uploads', 'storage'))
      or (v_section = 'participant_minutes' and row_group in ('watch_party', 'live'))
      or (v_section = 'bandwidth' and lower(coalesce(metric_key, '')) like '%bandwidth%')
      or (v_section = 'provider' and row_group in ('provider', 'reconciliation'))
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
    'section', v_section,
    'summary', jsonb_build_object(
      'filteredRows', (select count(*) from filtered),
      'internalRows', (select count(*) from unified where row_group = 'internal'),
      'providerRows', (select count(*) from unified where row_group = 'provider'),
      'reconciliationRows', (select count(*) from unified where row_group = 'reconciliation'),
      'roomRows', (select count(*) from unified where row_group in ('live', 'watch_party')),
      'mediaRows', (select count(*) from unified where row_group in ('uploads', 'storage')),
      'latestAt', (select max(occurred_at) from filtered)
    ),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'rowGroup', row_data.row_group,
          'rowKind', row_data.row_kind,
          'rowId', row_data.row_id,
          'occurredAt', row_data.occurred_at,
          'primaryLabel', row_data.primary_label,
          'secondaryLabel', row_data.secondary_label,
          'metricKey', row_data.metric_key,
          'quantity', row_data.quantity,
          'unit', row_data.unit,
          'userId', row_data.user_id,
          'roomId', row_data.room_id,
          'mediaId', row_data.media_id,
          'status', row_data.status,
          'source', row_data.source
        )
        order by row_data.occurred_at desc nulls last
      )
      from limited row_data
    ), '[]'::jsonb)
  ) into v_payload;

  return v_payload;
end;
$$;

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
      audit_row."action" as event_type,
      audit_row."action_category" as category,
      null::text as status,
      audit_row."severity",
      audit_row."actor_role",
      audit_row."actor_user_id",
      audit_row."target_type",
      audit_row."target_id",
      null::text as room_id,
      audit_row."reason" as result_label,
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata") as metadata_field_count
    from public."platform_admin_audit_logs" audit_row
    union all
    select
      'live_ops',
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."event_type",
      audit_row."action_type",
      case when audit_row."success" is true then 'success' when audit_row."success" is false then 'failed' else null::text end,
      audit_row."risk_level",
      audit_row."actor_role",
      audit_row."actor_user_id",
      audit_row."target" ->> 'type',
      audit_row."target" ->> 'id',
      audit_row."target" ->> 'room_id',
      case when audit_row."dry_run" then 'dry_run' else coalesce(audit_row."error_message", 'executed') end,
      public.admin_read_model_jsonb_object_key_count(audit_row."result")
    from public."admin_live_ops_action_audit" audit_row
    union all
    select
      'security',
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."event_type",
      audit_row."target_type",
      null::text,
      audit_row."severity",
      audit_row."actor_role",
      audit_row."actor_user_id",
      audit_row."target_type",
      audit_row."target_id",
      null::text,
      audit_row."reason",
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata")
    from public."security_audit_events" audit_row
    union all
    select
      'livekit_token',
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."action",
      coalesce(audit_row."surface", audit_row."room_kind", audit_row."room_type"),
      audit_row."outcome",
      audit_row."error_code",
      audit_row."effective_participant_role",
      audit_row."actor_user_id"::text,
      'livekit_room',
      coalesce(audit_row."room_name_hash", audit_row."app_room_id_hash"),
      audit_row."app_room_id_hash",
      audit_row."outcome",
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata")
    from public."livekit_token_request_audit" audit_row
    union all
    select
      'livekit_routing',
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."event_type",
      'routing',
      null::text,
      null::text,
      null::text,
      audit_row."actor_user_id",
      'app_room',
      audit_row."app_room_id",
      audit_row."app_room_id",
      audit_row."reason",
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata")
    from public."livekit_routing_audit" audit_row
    union all
    select
      'media_security',
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."action",
      audit_row."surface_type",
      audit_row."result",
      null::text,
      null::text,
      audit_row."actor_user_id",
      audit_row."surface_type",
      audit_row."record_id",
      null::text,
      audit_row."reason",
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata")
    from public."media_security_audit_events" audit_row
    union all
    select
      'legal_evidence',
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."action",
      audit_row."target_type",
      null::text,
      null::text,
      audit_row."actor_role",
      audit_row."actor_user_id",
      audit_row."target_type",
      audit_row."target_id",
      null::text,
      audit_row."reason",
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata")
    from public."legal_evidence_audit_log" audit_row
    union all
    select
      'dmca',
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."event_type",
      'dmca',
      null::text,
      null::text,
      audit_row."actor_role",
      audit_row."actor_user_id",
      'dmca_case',
      audit_row."dmca_case_id"::text,
      null::text,
      audit_row."reason",
      public.admin_read_model_jsonb_object_key_count(audit_row."metadata")
    from public."dmca_audit_log" audit_row
    union all
    select
      'spectator',
      audit_row."id"::text,
      audit_row."created_at",
      audit_row."event_type",
      'spectator_child_room',
      audit_row."denial_reason",
      null::text,
      null::text,
      audit_row."actor_user_id"::text,
      'spectator_source',
      audit_row."source_item_id"::text,
      audit_row."child_room_id",
      audit_row."denial_reason",
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

revoke all on function public."admin_read_models_can_read_users"() from public;
revoke all on function public."admin_read_models_can_read_ops"() from public;
revoke all on function public."admin_read_model_jsonb_object_key_count"(jsonb) from public;
revoke all on function public."get_admin_users_read_model"(text, integer) from public;
revoke all on function public."get_admin_usage_detail_read_model"(text, integer) from public;
revoke all on function public."get_admin_system_history_read_model"(text, integer) from public;

grant execute on function public."get_admin_users_read_model"(text, integer) to authenticated;
grant execute on function public."get_admin_usage_detail_read_model"(text, integer) to authenticated;
grant execute on function public."get_admin_system_history_read_model"(text, integer) to authenticated;

comment on function public."get_admin_users_read_model"(text, integer) is
  'Admin-safe Users read model for account status, Premium entitlement status, reports, blocks, profile media status, deletion-request counts, and public-content counts. Does not return auth secrets, raw storage paths, or destructive controls.';
comment on function public."get_admin_usage_detail_read_model"(text, integer) is
  'Admin-safe Usage row detail read model over usage, provider import, room membership, video, and attachment metadata. Read-only and not billing, payout, Premium, ads, or earnings truth.';
comment on function public."get_admin_system_history_read_model"(text, integer) is
  'Admin-safe System history read model over immutable audit/event tables. Does not return secrets, provider keys, LiveKit tokens, raw room tokens, or metadata values.';
