alter table public."safety_reports"
  drop constraint if exists "safety_reports_target_type_check";

alter table public."safety_reports"
  add constraint "safety_reports_target_type_check"
  check (
    "target_type" in (
      'participant',
      'room',
      'title',
      'creator_video',
      'profile_post',
      'profile_post_comment',
      'profile_media',
      'creator_video_comment',
      'social_attachment',
      'event',
      'chat_message',
      'chat_thread'
    )
  );

comment on constraint "safety_reports_target_type_check" on public."safety_reports" is
  'Allowlisted safety report targets. chat_thread reports target exact chat_threads rows; chat_message reports target exact chat_messages rows with thread context. Report submission does not delete, hide, ban, or notify reported users.';

alter table public."chat_messages"
  add column if not exists "moderation_status" text not null default 'clean',
  add column if not exists "moderation_reason" text,
  add column if not exists "moderation_report_id" bigint references public."safety_reports"("id") on delete set null,
  add column if not exists "moderation_actioned_by" text,
  add column if not exists "moderation_actioned_at" timestamptz;

alter table public."chat_messages"
  drop constraint if exists "chat_messages_moderation_status_check";

alter table public."chat_messages"
  add constraint "chat_messages_moderation_status_check"
  check ("moderation_status" in ('clean', 'hidden', 'removed'));

create index if not exists "chat_messages_moderation_status_idx"
  on public."chat_messages" ("thread_id", "moderation_status", "created_at");

comment on column public."chat_messages"."moderation_status" is
  'Reversible moderation visibility state for chat messages. hide/remove/restore never hard-deletes the message row or attachment evidence.';
comment on column public."chat_messages"."moderation_reason" is
  'Staff moderation reason for the latest chat-message visibility action. User-facing chat copy must stay sanitized.';
comment on column public."chat_messages"."moderation_report_id" is
  'Report/case ID that authorized the latest chat-message hide/remove/restore action.';
comment on column public."chat_messages"."moderation_actioned_by" is
  'Authenticated staff actor for the latest chat-message hide/remove/restore action.';
comment on column public."chat_messages"."moderation_actioned_at" is
  'Timestamp for the latest chat-message hide/remove/restore action.';

create or replace function public."admin_reports_actor_can_target_action"()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      public.has_platform_role(array['owner'::text])
      or public.has_platform_permission('content_moderation')
      or public.has_platform_permission('admin.content.hide')
      or public.has_platform_permission('admin.content.remove')
      or public.has_platform_permission('admin.content.restore')
    );
$$;

create or replace function public."admin_reports_actor_can_target_action_scope"(p_action_type text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_action text := lower(trim(coalesce(p_action_type, '')));
begin
  if auth.uid() is null then
    return false;
  end if;

  if public.has_platform_role(array['owner'::text])
    or public.has_platform_permission('content_moderation')
  then
    return true;
  end if;

  if v_action in ('hide_from_public', 'hidden', 'hide') then
    return public.has_platform_permission('admin.content.hide');
  elsif v_action in ('remove_from_public', 'removed', 'remove') then
    return public.has_platform_permission('admin.content.remove');
  elsif v_action in ('restore_clean', 'clean', 'restore') then
    return public.has_platform_permission('admin.content.restore');
  end if;

  return false;
end;
$$;

revoke all on function public."admin_reports_actor_can_target_action_scope"(text) from public;
grant execute on function public."admin_reports_actor_can_target_action_scope"(text) to authenticated, service_role;

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
      where profile."user_id" = v_target_uuid::text;

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

  return v_new_report;
end;
$$;

grant execute on function public."apply_admin_report_target_action"(bigint, text, text, text, text) to authenticated;

comment on function public."apply_admin_report_target_action"(bigint, text, text, text, text) is
  'Report-linked moderation target action. Chat-message hide/remove/restore requires exact scoped staff authority, reason, report/thread context, audit, and preserves message/attachment evidence without hard delete.';
