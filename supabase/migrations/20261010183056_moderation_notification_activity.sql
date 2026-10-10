-- Notify the exact content owner after an existing operator decision. This
-- observer does not change enforcement, reporter privacy, or access authority.
create function private.notification_moderation_target(p_report public.safety_reports)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_target uuid; v_owner text; v_status text; v_expected text; v_route text:='/profile/[userId]'; v_kind text;
  v_action_at timestamptz; v_action_by text; v_thread uuid;
begin
  if p_report.status<>'actioned' or p_report.resolved_at is null or p_report.resolved_by is null
    or p_report.resolution_type not in ('target_hidden','target_removed','target_restored') then return null; end if;
  v_target:=public.admin_reports_safe_uuid(p_report.target_id);
  if v_target is null then return null; end if;
  v_expected:=case p_report.resolution_type when 'target_hidden' then 'hidden' when 'target_removed' then 'removed' else 'clean' end;
  case p_report.target_type
    when 'creator_video' then
      select owner_id::text,moderation_status,moderated_at,moderated_by into v_owner,v_status,v_action_at,v_action_by from public.videos where id=v_target;
      v_route:='/channel-studio';
    when 'profile_post' then
      select user_id,moderation_status,moderated_at,moderated_by into v_owner,v_status,v_action_at,v_action_by from public.profile_posts where id=v_target and deleted_at is null;
    when 'profile_post_comment' then
      select user_id,moderation_status,moderated_at,moderated_by into v_owner,v_status,v_action_at,v_action_by from public.profile_post_comments where id=v_target and deleted_at is null;
    when 'creator_video_comment' then
      select user_id,moderation_status,moderated_at,moderated_by into v_owner,v_status,v_action_at,v_action_by from public.creator_video_comments where id=v_target and deleted_at is null;
    when 'social_attachment' then
      select owner_user_id,moderation_status,moderated_at,moderated_by into v_owner,v_status,v_action_at,v_action_by from public.social_attachments where id=v_target and deleted_at is null;
    when 'profile_media' then
      v_kind:=lower(coalesce(p_report.context->>'profileMediaKind',p_report.context->>'profile_media_kind',''));
      if v_kind not in ('avatar','background') then return null; end if;
      select user_id,case when v_kind='avatar' then profile_avatar_media_status else profile_background_media_status end,profile_media_updated_at
        into v_owner,v_status,v_action_at from public.user_profiles where user_id=v_target::text;
      v_expected:=case p_report.resolution_type when 'target_hidden' then 'flagged' when 'target_removed' then 'admin_removed' else 'active' end;
    when 'chat_message' then
      select sender_user_id,moderation_status,moderation_actioned_at,moderation_actioned_by,thread_id
        into v_owner,v_status,v_action_at,v_action_by,v_thread from public.chat_messages
        where id=v_target and moderation_report_id=p_report.id;
      if v_thread is null or v_thread::text is distinct from coalesce(p_report.context->>'threadId',p_report.context->>'thread_id')
        or not exists(select 1 from public.chat_thread_members where thread_id=v_thread and user_id=v_owner)
        then return null; end if;
      v_route:='/chat/[threadId]';
    else return null;
  end case;
  if v_owner is null or v_status is distinct from v_expected or v_action_at is distinct from p_report.resolved_at
    or (p_report.target_type<>'profile_media' and v_action_by is distinct from p_report.resolved_by::text)
    or public.admin_reports_safe_uuid(v_owner) is null
    or not exists(select 1 from auth.users where id=v_owner::uuid) then return null; end if;
  return jsonb_build_object('owner',v_owner,'route',v_route,'threadId',v_thread,'targetType',p_report.target_type,
    'targetId',v_target,'resolution',p_report.resolution_type);
end $$;
revoke all on function private.notification_moderation_target(public.safety_reports) from public,anon,authenticated,service_role;

create function private.enqueue_moderation_notification_activity()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_target jsonb;
begin
  if new.status<>'actioned' or (old.status=new.status and old.resolution_type is not distinct from new.resolution_type
    and old.resolved_at is not distinct from new.resolved_at) then return new; end if;
  v_target:=private.notification_moderation_target(new);
  if v_target is null then return new; end if;
  perform private.enqueue_notification_activity('moderation-decision:'||new.id::text||':'||new.resolved_at::text||':'||new.resolution_type,
    'moderation_notice',new.id::text,null,(v_target->>'owner')::uuid,
    jsonb_build_object('resolution',new.resolution_type,'resolvedAt',new.resolved_at));
  return new;
end $$;
revoke all on function private.enqueue_moderation_notification_activity() from public,anon,authenticated,service_role;
create trigger enqueue_moderation_notification_activity after update of status,resolution_type,resolved_at on public.safety_reports
  for each row execute function private.enqueue_moderation_notification_activity();

create or replace function private.resolve_account_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_report public.safety_reports; v_target jsonb;
begin
  if p_event.event_kind<>'moderation_notice' or p_event.actor_user_id is not null or p_event.source_id !~ '^[0-9]{1,18}$'
    then return '{"eligible":false}'; end if;
  select * into v_report from public.safety_reports where id=p_event.source_id::bigint;
  if not found or v_report.resolution_type is distinct from p_event.context->>'resolution'
    or to_jsonb(v_report.resolved_at) is distinct from p_event.context->'resolvedAt' then return '{"eligible":false}'; end if;
  v_target:=private.notification_moderation_target(v_report);
  if v_target is null or v_target->>'owner' is distinct from p_event.recipient_user_id::text then return '{"eligible":false}'; end if;
  return jsonb_build_object('eligible',true,'category','moderation_notice','notification_type','moderation_notice',
    'title','Content moderation update','body',case v_report.resolution_type
      when 'target_hidden' then 'Your content was hidden after review.'
      when 'target_removed' then 'Your content was removed after review.'
      else 'Your content was restored after review.' end,
    'target_route',v_target->>'route','target_entity_id',case when v_target->>'route'='/profile/[userId]' then p_event.recipient_user_id::text
      when v_target->>'route'='/chat/[threadId]' then v_target->>'threadId' else null end,
    'target_context',jsonb_build_object('resolution',v_report.resolution_type),
    'preference_key','account_activity_enabled');
end $$;
revoke all on function private.resolve_account_notification_activity(public.notification_activity_events) from public,anon,authenticated,service_role;
