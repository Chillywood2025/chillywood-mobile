-- Current live rows first; genuine deletion uses only an eligible 30-day record.
-- Moderation hidden/removed and quarantine are not deletion. No edit snapshots.
begin;
create function private.content_inspection_current_source(p_type text,p_target uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v jsonb;
begin
  case p_type
  when 'profile_post' then
    select jsonb_build_object('author',user_id,'content',jsonb_build_object('body',body),'sourceUpdatedAt',updated_at,'deletedAt',deleted_at,
      'restrictionLabels',jsonb_build_array(visibility,moderation_status,case when deleted_at is not null then 'soft_deleted' else 'stored' end))
      into v from public.profile_posts where id=p_target;
  when 'profile_post_comment' then
    select jsonb_build_object('author',user_id,'content',jsonb_build_object('body',body),'sourceUpdatedAt',updated_at,'deletedAt',deleted_at,
      'restrictionLabels',jsonb_build_array(moderation_status,case when deleted_at is not null then 'soft_deleted' else 'stored' end))
      into v from public.profile_post_comments where id=p_target;
  when 'creator_video_comment' then
    select jsonb_build_object('author',user_id,'content',jsonb_build_object('body',body),'sourceUpdatedAt',updated_at,'deletedAt',deleted_at,
      'restrictionLabels',jsonb_build_array(moderation_status,case when deleted_at is not null then 'soft_deleted' else 'stored' end))
      into v from public.creator_video_comments where id=p_target;
  when 'chat_message' then
    select jsonb_build_object('author',sender_user_id,'content',jsonb_build_object('body',body),'sourceUpdatedAt',null,
      'restrictionLabels',jsonb_build_array('private_chat',moderation_status)) into v from public.chat_messages where id=p_target;
  when 'room_message' then
    select jsonb_build_object('author',user_id,'content',jsonb_build_object('body',text),'sourceUpdatedAt',null,
      'restrictionLabels',jsonb_build_array('room_message')) into v from public.watch_party_room_messages where id=p_target;
  when 'creator_video' then
    select jsonb_build_object('author',owner_id::text,'content',jsonb_build_object('title',title,'description',description),'sourceUpdatedAt',null,
      'restrictionLabels',jsonb_build_array('video_text_only')) into v from public.videos where id=p_target;
  when 'social_attachment' then
    select jsonb_build_object('author',owner_user_id,'content',null,'sourceUpdatedAt',updated_at,'deletedAt',deleted_at,
      'restrictionLabels',jsonb_build_array('media_only',moderation_status)) into v from public.social_attachments where id=p_target;
  else raise exception 'content_inspection_unsupported_target' using errcode='22023';
  end case;
  return v;
end;
$$;

create or replace function private.content_inspection_source(p_type text,p_target uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_current jsonb;
begin
  v_current:=private.content_inspection_current_source(p_type,p_target);
  if v_current is not null and v_current->>'deletedAt' is null then return v_current; end if;
  -- Never read still-present soft-deleted bytes around archive expiry.
  return private.read_deleted_content_inspection(p_type,p_target);
end;
$$;

create or replace function private.content_inspection_owner_target(p_type text,p_target uuid) returns boolean
language sql volatile security definer set search_path='' as $$
  with source as (select private.content_inspection_source(p_type,p_target) as value)
  select coalesce((value->>'ownerProtected')::boolean,false) or exists(
    select 1 from public.platform_role_memberships m where m.user_id=value->>'author' and m.role='owner')
  from source;
$$;

create or replace function public.admin_read_content_inspection(p_context_id uuid,p_target_type text,p_target_id text,p_reason text,p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_role text; v_target uuid:=p_target_id::uuid; v_grant private.content_inspection_grants; v_source jsonb; v_version text; v_result text;
begin
  -- All grant/read/revoke/close decisions serialize here. Authority checks are
  -- deliberately AFTER waiting for this lock, using fresh volatile statements.
  perform 1 from private.content_inspection_contexts where id=p_context_id and status='open' for update;
  if not found then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  v_role:=private.content_inspection_actor(p_reason,p_request_id);
  if not exists(select 1 from private.content_inspection_context_targets where context_id=p_context_id and target_type=p_target_type and target_id=v_target) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if not private.content_inspection_context_owned(p_context_id,v_role) then
    select g.* into v_grant from private.content_inspection_grants g where g.context_id=p_context_id
      and g.target_type=p_target_type and g.target_id=v_target and private.content_inspection_grant_valid(g);
    if not found then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  end if;
  v_source:=private.content_inspection_source(p_target_type,v_target);
  if v_role<>'owner' and private.content_inspection_owner_target(p_target_type,v_target) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  v_result:=case when v_source is null then 'unavailable_current' when coalesce((v_source->>'isRetainedDeletion')::boolean,false) then 'available_deleted' when p_target_type='social_attachment' then 'media_only' else 'available' end;
  v_version:=case when v_source is not null then md5(v_source::text) end;
  perform private.content_inspection_audit(v_role,p_request_id,'read',p_context_id,p_target_type,v_target,v_grant.id,v_grant.revision,p_reason,v_result,v_version);
  -- Audit insertion can wait. Recheck current session/role and wall-clock grant
  -- expiry afterwards; failure rolls back the event and releases no content.
  if private.content_inspection_actor(p_reason,p_request_id,false) is distinct from v_role
    or (v_grant.id is not null and not private.content_inspection_grant_valid(v_grant)) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if v_role<>'owner' and private.content_inspection_owner_target(p_target_type,v_target) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if md5(private.content_inspection_source(p_target_type,v_target)::text) is distinct from v_version then
    raise exception 'content_inspection_stale_version' using errcode='42501'; end if;
  if private.content_inspection_actor(p_reason,p_request_id,false) is distinct from v_role then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  return jsonb_build_object('contextId',p_context_id,'targetType',p_target_type,'targetId',v_target,
    'availability',v_result,'storedVersion',v_version,'sourceUpdatedAt',v_source->'sourceUpdatedAt',
    'content',v_source->'content','restrictionLabels',coalesce(v_source->'restrictionLabels','[]'::jsonb),
    'deletedRetentionAvailability',case when coalesce((v_source->>'isRetainedDeletion')::boolean,false) then 'available' else 'unavailable' end,
    'deletedAt',v_source->'deletedAt','retentionExpiresAt',v_source->'retentionExpiresAt',
    'mediaAvailability','unsupported_media_inspection','retainedMediaAvailability','unsupported');
end;
$$;

revoke all on function private.content_inspection_current_source(text,uuid),
  private.content_inspection_source(text,uuid),private.content_inspection_owner_target(text,uuid)
  from public,anon,authenticated,service_role;
-- CREATE OR REPLACE preserves the original authenticated-only public RPC ACL.
commit;

