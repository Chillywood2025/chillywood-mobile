DO $profile_media_deploy$
BEGIN
  perform set_config('lock_timeout', '5s', true);
  -- The provider controls the outer statement timeout. Bound lock waits here.
  LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
  if (select count(*) from supabase_migrations.schema_migrations) <> 426 or (select encode(extensions.digest(string_agg(version || ':' || coalesce(name,'') || ':' || coalesce(encode(extensions.digest(array_to_string(statements, E'\n'),'sha256'),'hex'),''), E'\n' order by version), 'sha256'),'hex') from supabase_migrations.schema_migrations) is distinct from '7db7ebbc3e0983dac091743ae7fbcc6bbb72933b3f10bc56d3e10437a280a5ee' then raise exception 'profile_media_deployment_history_drift'; end if;
  if exists(select 1 from supabase_migrations.schema_migrations where name in ('profile_media_report_enforcement_repair','platform_studio_publication_and_audience_authority')) or to_regclass('public.platform_brand_publications') is not null then raise exception 'profile_media_deployment_scope_drift'; end if;
  if (select encode(extensions.digest(pg_get_functiondef(to_regprocedure('public.apply_admin_report_target_action(bigint,text,text,text,text)')),'sha256'),'hex')) is distinct from '2f5c875fd6977c209ed4bee5da3538bd53aea698b0871e120d70a19a0353ac3d' then raise exception 'profile_media_deployment_function_drift'; end if;
  if (select encode(extensions.digest(pg_get_functiondef(to_regprocedure('public.guard_profile_media_client_authority()')),'sha256'),'hex')) is distinct from 'e5b12a9f0bf926e206f6e3a1070849115497094772e4059abb4ce558f5e9f57d' then raise exception 'profile_media_deployment_function_drift'; end if;
  if (select encode(extensions.digest(pg_get_functiondef(to_regprocedure('public.resolve_profile_media_delivery(text,text)')),'sha256'),'hex')) is distinct from '7155963dd647c23fb63182801eb5415d48c176016604ff1dc04c6caf404d2486' then raise exception 'profile_media_deployment_function_drift'; end if;
  if not exists(select 1 from pg_proc p where p.oid = to_regprocedure('public.apply_admin_report_target_action(bigint,text,text,text,text)') and p.oid = 58483 and pg_get_userbyid(p.proowner) = 'postgres' and p.proacl::text = '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'profile_media_deployment_metadata_drift'; end if;
  if not exists(select 1 from pg_proc p where p.oid = to_regprocedure('public.guard_profile_media_client_authority()') and p.oid = 86782 and pg_get_userbyid(p.proowner) = 'postgres' and p.proacl::text = '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'profile_media_deployment_metadata_drift'; end if;
  if not exists(select 1 from pg_proc p where p.oid = to_regprocedure('public.resolve_profile_media_delivery(text,text)') and p.oid = 86780 and pg_get_userbyid(p.proowner) = 'postgres' and p.proacl::text = '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'profile_media_deployment_metadata_drift'; end if;
  EXECUTE $profile_media_exact_source$
-- Forward-only source repair. This file does not authorize deployment.
-- Preserve function identities, ACLs, RLS, object provenance and scan authority.
-- Report actions remain transactional with exact target, reason and staff scope.

create or replace function public.guard_profile_media_client_authority()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_trusted boolean := current_user in ('postgres', 'service_role', 'supabase_admin')
    or coalesce(auth.role(), '') = 'service_role';
  v_moderation_context jsonb;
  v_media_kind text;
  v_status text;
  v_allowed_columns text[];
  v_avatar_changed boolean := tg_op = 'INSERT' or new.avatar_url is distinct from old.avatar_url;
  v_background_changed boolean := tg_op = 'INSERT' or new.profile_background_url is distinct from old.profile_background_url;
  v_avatar_key text := public.media_scan_object_key_from_public_url('profile-media', new.avatar_url);
  v_background_key text := public.media_scan_object_key_from_public_url('profile-media', new.profile_background_url);
begin
  -- The client-set GUC alone is never authority. Require the executing server
  -- role, live scoped actor, exact open report and complete status-only delta.
  if tg_op = 'UPDATE'
    and current_user in ('postgres', 'service_role', 'supabase_admin')
    and nullif(current_setting('app.profile_media_report_action', true), '') is not null
  then
    v_moderation_context := current_setting('app.profile_media_report_action', true)::jsonb;
    v_media_kind := v_moderation_context->>'mediaKind';
    v_status := case v_moderation_context->>'action'
      when 'hidden' then 'flagged' when 'removed' then 'admin_removed'
      when 'clean' then 'active' else null end;
    v_allowed_columns := array[
      'profile_' || v_media_kind || '_media_status',
      'profile_' || v_media_kind || '_media_flagged_at',
      'profile_media_updated_at', 'updated_at'
    ];
    if v_media_kind in ('avatar', 'background') and v_status is not null
      and auth.uid()::text = v_moderation_context->>'actor'
      and new.user_id = old.user_id
      and new.user_id = v_moderation_context->>'target'
      and public.has_platform_permission(case v_moderation_context->>'action'
        when 'hidden' then 'admin.content.hide' when 'removed' then 'admin.content.remove'
        when 'clean' then 'admin.content.restore' end)
      and exists (
        select 1 from public.safety_reports report
        where report.id::text = v_moderation_context->>'reportId'
          and report.target_type = 'profile_media' and report.target_id = new.user_id
          and report.status not in ('actioned', 'dismissed')
          and lower(trim(coalesce(report.context->>'profileMediaKind',
            report.context->>'profile_media_kind', ''))) = v_media_kind
      )
      and (to_jsonb(new) - v_allowed_columns) = (to_jsonb(old) - v_allowed_columns)
      and to_jsonb(new)->>('profile_' || v_media_kind || '_media_status') = v_status
      and (to_jsonb(new)->>('profile_' || v_media_kind || '_media_flagged_at'))::timestamptz
        is not distinct from (case when v_status = 'active' then null::timestamptz
          else (v_moderation_context->>'at')::timestamptz end)
      and new.profile_media_updated_at = (v_moderation_context->>'at')::timestamptz
      and new.updated_at = (v_moderation_context->>'at')::timestamptz
    then
      -- Preserve exact bytes, provenance and scan evidence, even for missing or
      -- unsafe objects. Delivery still requires active status AND clean scan.
      return new;
    end if;
    raise exception using errcode = '42501', message = 'profile_media_report_action_invalid';
  end if;

  if not v_trusted and new.user_id is distinct from auth.uid()::text then
    raise exception using errcode = '42501', message = 'profile_media_owner_required';
  end if;

  if (
    tg_op = 'INSERT'
    and (
      new.profile_avatar_media_status not in ('active', 'user_removed')
      or new.profile_background_media_status not in ('active', 'user_removed')
    )
  ) or (
    tg_op = 'UPDATE'
    and (
      (
        new.profile_avatar_media_status is distinct from old.profile_avatar_media_status
        and (
          new.profile_avatar_media_status not in ('active', 'user_removed')
          or (new.profile_avatar_media_status = 'active' and not v_avatar_changed)
          or (new.profile_avatar_media_status = 'user_removed' and new.avatar_url is not null)
        )
      )
      or (
        new.profile_background_media_status is distinct from old.profile_background_media_status
        and (
          new.profile_background_media_status not in ('active', 'user_removed')
          or (new.profile_background_media_status = 'active' and not v_background_changed)
          or (new.profile_background_media_status = 'user_removed' and new.profile_background_url is not null)
        )
      )
    )
  ) then
    raise exception using errcode = '42501', message = 'profile_media_status_server_owned';
  end if;

  if new.avatar_url is not null then
    if v_avatar_key is null
      or not public.profile_media_storage_object_valid(new.user_id, v_avatar_key)
    then
      raise exception using errcode = '42501', message = 'profile_avatar_storage_provenance_invalid';
    end if;
    new.avatar_url := public.profile_media_public_url(new.user_id, v_avatar_key);
  end if;
  if new.profile_background_url is not null then
    if v_background_key is null
      or not public.profile_media_storage_object_valid(new.user_id, v_background_key)
    then
      raise exception using errcode = '42501', message = 'profile_background_storage_provenance_invalid';
    end if;
    new.profile_background_url := public.profile_media_public_url(new.user_id, v_background_key);
  end if;

  if v_avatar_changed then
    if new.avatar_url is not null and new.profile_avatar_scan_status <> 'pending_scan' then
      raise exception using errcode = '42501', message = 'profile_avatar_scan_pending_required';
    end if;
  elsif not v_trusted and (
    new.profile_avatar_scan_status is distinct from old.profile_avatar_scan_status
    or new.profile_avatar_scan_provider is distinct from old.profile_avatar_scan_provider
    or new.profile_avatar_scan_result is distinct from old.profile_avatar_scan_result
    or new.profile_avatar_scanned_at is distinct from old.profile_avatar_scanned_at
    or new.profile_avatar_scan_error is distinct from old.profile_avatar_scan_error
  ) then
    raise exception using errcode = '42501', message = 'profile_avatar_scan_fields_server_owned';
  end if;

  if v_background_changed then
    if new.profile_background_url is not null and new.profile_background_scan_status <> 'pending_scan' then
      raise exception using errcode = '42501', message = 'profile_background_scan_pending_required';
    end if;
  elsif not v_trusted and (
    new.profile_background_scan_status is distinct from old.profile_background_scan_status
    or new.profile_background_scan_provider is distinct from old.profile_background_scan_provider
    or new.profile_background_scan_result is distinct from old.profile_background_scan_result
    or new.profile_background_scanned_at is distinct from old.profile_background_scanned_at
    or new.profile_background_scan_error is distinct from old.profile_background_scan_error
  ) then
    raise exception using errcode = '42501', message = 'profile_background_scan_fields_server_owned';
  end if;

  return new;
end;
$$;


create or replace function public."apply_admin_report_target_action"(
  p_report_id bigint,
  p_target_type text,
  p_target_id text,
  p_action_type text,
  p_reason text
)
returns public."safety_reports"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_type text := lower(trim(coalesce(p_target_type, '')));
  v_action text := lower(trim(coalesce(p_action_type, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_actor uuid := auth.uid();
  v_target_uuid uuid := public."admin_reports_safe_uuid"(p_target_id);
  v_old_report public."safety_reports";
  v_new_report public."safety_reports";
  v_target_before jsonb;
  v_target_after jsonb;
  v_next_status text;
  v_next_profile_media_status text;
  v_profile_media_kind text;
  v_previous_profile_context text;
  v_resolution text;
  v_report_thread_id text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  perform public."admin_reports_assert_target_operator"();

  if v_actor is null then
    raise exception 'admin_reports_auth_required';
  end if;
  if v_reason is null then
    raise exception 'admin_report_reason_required';
  end if;
  if v_target_uuid is null then
    raise exception 'admin_report_target_uuid_required';
  end if;

  if not public."admin_reports_actor_can_target_action_scope"(v_action) then
    raise exception 'admin_report_target_action_scope_required';
  end if;

  select * into v_old_report
  from public."safety_reports"
  where "id" = p_report_id
  for update;

  if v_old_report."id" is null then
    raise exception 'admin_report_not_found';
  end if;
  if v_old_report."target_type" <> v_target_type or v_old_report."target_id" <> trim(coalesce(p_target_id, '')) then
    raise exception 'admin_report_target_mismatch';
  end if;
  if v_old_report."status" in ('actioned', 'dismissed') then
    raise exception 'admin_report_closed_state';
  end if;

  if v_action in ('hide_from_public', 'hidden', 'hide') then
    v_next_status := 'hidden';
    v_next_profile_media_status := 'flagged';
    v_resolution := 'target_hidden';
  elsif v_action in ('remove_from_public', 'removed', 'remove') then
    v_next_status := 'removed';
    v_next_profile_media_status := 'admin_removed';
    v_resolution := 'target_removed';
  elsif v_action in ('restore_clean', 'clean', 'restore') then
    v_next_status := 'clean';
    v_next_profile_media_status := 'active';
    v_resolution := 'target_restored';
  else
    raise exception 'admin_report_target_action_invalid';
  end if;

  -- A hide-only grant must not acquire remove/restore through the legacy
  -- umbrella permission's reverse aliases. Genuine broad grants still match
  -- each action's existing permission aliases.
  if v_target_type = 'profile_media' and not public.has_platform_permission(
    case v_next_status when 'hidden' then 'admin.content.hide'
      when 'removed' then 'admin.content.remove' when 'clean' then 'admin.content.restore' end
  ) then
    raise exception 'admin_report_target_action_scope_required';
  end if;

  case v_target_type
    when 'creator_video' then
      select to_jsonb(video) into v_target_before from public."videos" video where video."id" = v_target_uuid;
      update public."videos"
        set "moderation_status" = v_next_status,
            "moderation_reason" = v_reason,
            "moderated_at" = v_now,
            "moderated_by" = v_actor::text,
            "updated_at" = v_now
        where "id" = v_target_uuid;
      select to_jsonb(video) into v_target_after from public."videos" video where video."id" = v_target_uuid;
    when 'profile_post' then
      select to_jsonb(post) into v_target_before from public."profile_posts" post where post."id" = v_target_uuid;
      update public."profile_posts"
        set "moderation_status" = v_next_status,
            "moderation_reason" = v_reason,
            "moderated_at" = v_now,
            "moderated_by" = v_actor::text,
            "updated_at" = v_now
        where "id" = v_target_uuid;
      select to_jsonb(post) into v_target_after from public."profile_posts" post where post."id" = v_target_uuid;
    when 'profile_post_comment' then
      select to_jsonb(comment) into v_target_before from public."profile_post_comments" comment where comment."id" = v_target_uuid;
      update public."profile_post_comments"
        set "moderation_status" = v_next_status,
            "moderation_reason" = v_reason,
            "moderated_at" = v_now,
            "moderated_by" = v_actor::text,
            "updated_at" = v_now
        where "id" = v_target_uuid;
      select to_jsonb(comment) into v_target_after from public."profile_post_comments" comment where comment."id" = v_target_uuid;
    when 'profile_media' then
      v_profile_media_kind := lower(trim(coalesce(
        v_old_report."context"->>'profileMediaKind',
        v_old_report."context"->>'profile_media_kind',
        ''
      )));

      if v_profile_media_kind not in ('avatar', 'background') then
        raise exception 'admin_report_profile_media_kind_required';
      end if;

      select to_jsonb(profile) into v_target_before
      from public."user_profiles" profile
      where profile."user_id" = v_target_uuid::text
      for update;

      v_previous_profile_context := current_setting('app.profile_media_report_action', true);
      perform set_config('app.profile_media_report_action', jsonb_build_object(
        'reportId', p_report_id::text, 'actor', v_actor::text,
        'target', v_target_uuid::text, 'mediaKind', v_profile_media_kind,
        'action', v_next_status, 'at', v_now
      )::text, true);

      if v_profile_media_kind = 'avatar' then
        update public."user_profiles"
          set "profile_avatar_media_status" = v_next_profile_media_status,
              "profile_avatar_media_flagged_at" = case when v_next_profile_media_status = 'active' then null else v_now end,
              "profile_media_updated_at" = v_now,
              "updated_at" = v_now
          where "user_id" = v_target_uuid::text;
      else
        update public."user_profiles"
          set "profile_background_media_status" = v_next_profile_media_status,
              "profile_background_media_flagged_at" = case when v_next_profile_media_status = 'active' then null else v_now end,
              "profile_media_updated_at" = v_now,
              "updated_at" = v_now
          where "user_id" = v_target_uuid::text;
      end if;

      perform set_config('app.profile_media_report_action', coalesce(v_previous_profile_context, ''), true);

      select to_jsonb(profile) into v_target_after
      from public."user_profiles" profile
      where profile."user_id" = v_target_uuid::text;
    when 'creator_video_comment' then
      select to_jsonb(comment) into v_target_before from public."creator_video_comments" comment where comment."id" = v_target_uuid;
      update public."creator_video_comments"
        set "moderation_status" = v_next_status,
            "moderation_reason" = v_reason,
            "moderated_at" = v_now,
            "moderated_by" = v_actor::text,
            "updated_at" = v_now
        where "id" = v_target_uuid;
      select to_jsonb(comment) into v_target_after from public."creator_video_comments" comment where comment."id" = v_target_uuid;
    when 'social_attachment' then
      select to_jsonb(attachment) into v_target_before from public."social_attachments" attachment where attachment."id" = v_target_uuid;
      update public."social_attachments"
        set "moderation_status" = v_next_status,
            "moderation_reason" = v_reason,
            "moderated_at" = v_now,
            "moderated_by" = v_actor::text,
            "updated_at" = v_now
        where "id" = v_target_uuid;
      select to_jsonb(attachment) into v_target_after from public."social_attachments" attachment where attachment."id" = v_target_uuid;
    when 'chat_message' then
      v_report_thread_id := nullif(trim(coalesce(
        v_old_report."context"->>'threadId',
        v_old_report."context"->>'thread_id',
        ''
      )), '');

      if v_report_thread_id is null then
        raise exception 'admin_report_chat_message_thread_context_required';
      end if;

      select to_jsonb(message) into v_target_before
      from public."chat_messages" message
      where message."id" = v_target_uuid;

      if v_target_before is null then
        raise exception 'admin_report_target_not_found';
      end if;

      if coalesce(v_target_before->>'thread_id', '') <> v_report_thread_id then
        raise exception 'admin_report_chat_message_thread_mismatch';
      end if;

      update public."chat_messages"
        set "moderation_status" = v_next_status,
            "moderation_reason" = v_reason,
            "moderation_report_id" = p_report_id,
            "moderation_actioned_by" = v_actor::text,
            "moderation_actioned_at" = v_now
        where "id" = v_target_uuid;

      select to_jsonb(message) into v_target_after
      from public."chat_messages" message
      where message."id" = v_target_uuid;
    else
      raise exception 'admin_report_target_action_unsupported';
  end case;

  if v_target_before is null or v_target_after is null then
    raise exception 'admin_report_target_not_found';
  end if;

  update public."safety_reports"
  set
    "status" = 'actioned',
    "resolution_type" = v_resolution,
    "resolution_reason" = v_reason,
    "resolved_by" = v_actor,
    "resolved_at" = v_now,
    "actioned_at" = v_now,
    "updated_at" = v_now
  where "id" = p_report_id
  returning * into v_new_report;

  perform public."admin_reports_write_audit"(
    p_report_id,
    v_new_report."target_type",
    v_new_report."target_id",
    v_resolution,
    v_reason,
    v_old_report."status",
    v_new_report."status",
    v_old_report."severity",
    v_new_report."severity",
    jsonb_build_object('report', to_jsonb(v_old_report), 'target', v_target_before),
    jsonb_build_object('report', to_jsonb(v_new_report), 'target', v_target_after),
    jsonb_build_object(
      'target_action', v_action,
      'moderation_status', v_next_status,
      'profile_media_status', case when v_target_type = 'profile_media' then v_next_profile_media_status else null end,
      'profile_media_kind', case when v_target_type = 'profile_media' then v_profile_media_kind else null end,
      'chat_thread_id', case when v_target_type = 'chat_message' then v_report_thread_id else null end,
      'evidence_preserved', case when v_target_type = 'chat_message' then true else null end
    )
  );

  if v_target_type = 'profile_media'
    and not public.has_platform_permission(case v_next_status
      when 'hidden' then 'admin.content.hide' when 'removed' then 'admin.content.remove'
      when 'clean' then 'admin.content.restore' end)
  then
    raise exception 'admin_report_target_action_scope_required';
  end if;

  return v_new_report;
end;
$$;


create or replace function public.resolve_profile_media_delivery(
  p_owner_user_id text,
  p_object_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner_user_id text := nullif(btrim(coalesce(p_owner_user_id, '')), '');
  v_object_key text := nullif(btrim(coalesce(p_object_key, '')), '');
  v_canonical_url text;
  v_profile public.user_profiles%rowtype;
  v_media_kind text;
  v_scan_status text;
  v_media_status text;
begin
  if v_owner_user_id is null or v_object_key is null
    or length(v_owner_user_id) > 128 or length(v_object_key) > 1024
    or v_object_key like '%..%'
    or not (
      v_object_key like v_owner_user_id || '/avatar/%'
      or v_object_key like v_owner_user_id || '/background/%'
      or (
        v_owner_user_id = 'platform_rachi_official'
        and v_object_key like 'official/rachi/avatar/%'
      )
    )
  then
    return jsonb_build_object(
      'authoritative', true,
      'allowed', false,
      'reason', 'profile_media_identity_invalid'
    );
  end if;

  v_canonical_url := public.profile_media_public_url(v_owner_user_id, v_object_key);

  select profile.* into v_profile
  from public.user_profiles profile
  where profile.user_id = v_owner_user_id
    and public.can_view_profile_content(profile.user_id)
  limit 1;

  if not found then
    return jsonb_build_object(
      'authoritative', true,
      'allowed', false,
      'reason', 'profile_media_not_visible',
      'ownerUserId', v_owner_user_id,
      'objectKey', v_object_key
    );
  end if;

  if v_profile.avatar_url = v_canonical_url then
    v_media_kind := 'avatar';
    v_scan_status := v_profile.profile_avatar_scan_status;
    v_media_status := v_profile.profile_avatar_media_status;
  elsif v_profile.profile_background_url = v_canonical_url then
    v_media_kind := 'background';
    v_scan_status := v_profile.profile_background_scan_status;
    v_media_status := v_profile.profile_background_media_status;
  else
    return jsonb_build_object(
      'authoritative', true,
      'allowed', false,
      'reason', 'profile_media_not_current',
      'ownerUserId', v_owner_user_id,
      'objectKey', v_object_key
    );
  end if;

  if v_media_status is distinct from 'active' then
    return jsonb_build_object(
      'authoritative', true, 'allowed', false,
      'reason', 'profile_media_moderation_blocked'
    );
  end if;

  if not public.media_scan_public_safe(v_scan_status) then
    return jsonb_build_object(
      'authoritative', true,
      'allowed', false,
      'reason', 'profile_media_scan_blocked',
      'ownerUserId', v_owner_user_id,
      'objectKey', v_object_key,
      'mediaKind', v_media_kind,
      'scanStatus', coalesce(v_scan_status, 'unknown')
    );
  end if;

  return jsonb_build_object(
    'authoritative', true,
    'allowed', true,
    'reason', 'profile_media_exact_clean',
    'ownerUserId', v_owner_user_id,
    'objectKey', v_object_key,
    'mediaKind', v_media_kind,
    'scanStatus', 'clean'
  );
end;
$$;
$profile_media_exact_source$;
  if (select encode(extensions.digest(pg_get_functiondef(to_regprocedure('public.apply_admin_report_target_action(bigint,text,text,text,text)')),'sha256'),'hex')) is distinct from '3f1fded36905476e11075712e8e50f431162af6af741b34df646a48e60250034' then raise exception 'profile_media_deployment_function_drift'; end if;
  if (select encode(extensions.digest(pg_get_functiondef(to_regprocedure('public.guard_profile_media_client_authority()')),'sha256'),'hex')) is distinct from '00a472ee08964c8617e89d17c0a7a7ee3dafd2dde896e16458a112b0379185de' then raise exception 'profile_media_deployment_function_drift'; end if;
  if (select encode(extensions.digest(pg_get_functiondef(to_regprocedure('public.resolve_profile_media_delivery(text,text)')),'sha256'),'hex')) is distinct from '173a0506992af70399462c4cd3ac46b6c96e88ef8d685667028adc2a653d6861' then raise exception 'profile_media_deployment_function_drift'; end if;
  if (select count(*) from supabase_migrations.schema_migrations) <> 426 or (select encode(extensions.digest(string_agg(version || ':' || coalesce(name,'') || ':' || coalesce(encode(extensions.digest(array_to_string(statements, E'\n'),'sha256'),'hex'),''), E'\n' order by version), 'sha256'),'hex') from supabase_migrations.schema_migrations) is distinct from '7db7ebbc3e0983dac091743ae7fbcc6bbb72933b3f10bc56d3e10437a280a5ee' then raise exception 'profile_media_deployment_history_drift'; end if;
END;
$profile_media_deploy$;
