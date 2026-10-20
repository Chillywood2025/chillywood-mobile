-- Source-only current-target metadata discovery. The inspection switch remains
-- disabled; this migration does not activate inspection or change consumer RLS.
begin;
create function public.admin_list_content_inspection_subject_targets(
  p_subject_user_id uuid,p_target_type text,p_reason text,p_request_id uuid,
  p_before timestamptz default null,p_before_id uuid default null
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_role text; v_rows jsonb; v_more boolean; v_last jsonb; v_label text;
begin
  v_role:=private.content_inspection_actor(p_reason,p_request_id);
  if v_role not in ('owner','super_admin') or p_subject_user_id is null then
    raise exception 'content_inspection_denied' using errcode='42501';
  end if;
  -- Conservatively protect anyone ever assigned Owner, including inactive rows,
  -- consistently with the exact-target read boundary.
  if v_role<>'owner' and exists(select 1 from public.platform_role_memberships
    where user_id=p_subject_user_id::text and role='owner') then
    raise exception 'content_inspection_denied' using errcode='42501';
  end if;
  if (p_before is null)<>(p_before_id is null) then
    raise exception 'content_inspection_invalid_cursor' using errcode='22023';
  end if;
  v_label:=case p_target_type
    when 'profile_post' then 'Profile post'
    when 'profile_post_comment' then 'Profile post comment'
    when 'creator_video_comment' then 'Creator video comment'
    when 'chat_message' then 'Chat message'
    when 'room_message' then 'Room message'
    when 'creator_video' then 'Creator video'
    when 'social_attachment' then 'Social attachment' end;
  if v_label is null then
    raise exception 'content_inspection_unsupported_target' using errcode='22023';
  end if;
  -- Fixed adapters project only identifiers and timestamps. Labels are static:
  -- never bodies, titles, filenames, participant names, object paths or URLs.
  with candidates as (
    select id,created_at from public.profile_posts
      where p_target_type='profile_post' and user_id=p_subject_user_id::text and deleted_at is null
    union all
    select id,created_at from public.profile_post_comments
      where p_target_type='profile_post_comment' and user_id=p_subject_user_id::text and deleted_at is null
    union all
    select id,created_at from public.creator_video_comments
      where p_target_type='creator_video_comment' and user_id=p_subject_user_id::text and deleted_at is null
    union all
    select id,created_at from public.chat_messages
      where p_target_type='chat_message' and sender_user_id=p_subject_user_id::text
    union all
    select id,created_at from public.watch_party_room_messages
      where p_target_type='room_message' and user_id=p_subject_user_id::text
    union all
    -- This legacy column is timestamp without time zone. Interpret stored UTC
    -- explicitly so the cursor is independent of the caller's session timezone.
    select id,created_at at time zone 'UTC' from public.videos
      where p_target_type='creator_video' and owner_id=p_subject_user_id and created_at is not null
    union all
    select id,created_at from public.social_attachments
      where p_target_type='social_attachment' and owner_user_id=p_subject_user_id::text and deleted_at is null
  ), page as (
    select id,created_at from candidates
    where p_before is null or (created_at,id)<(p_before,p_before_id)
    order by created_at desc,id desc limit 51
  ) select coalesce(jsonb_agg(jsonb_build_object('targetId',id,'targetType',p_target_type,
      'createdAt',created_at,'label',v_label) order by created_at desc,id desc),'[]'::jsonb)
    into v_rows from page;
  v_more:=jsonb_array_length(v_rows)>50;
  if v_more then v_rows:=v_rows-50; end if;
  v_last:=v_rows->(jsonb_array_length(v_rows)-1);
  perform private.content_inspection_audit(v_role,p_request_id,'list_subject_targets',null,p_target_type,
    p_subject_user_id,null,null,p_reason,'listed');
  -- Audit may wait; recheck the protected subject before releasing metadata.
  if v_role<>'owner' and exists(select 1 from public.platform_role_memberships
    where user_id=p_subject_user_id::text and role='owner') then
    raise exception 'content_inspection_denied' using errcode='42501';
  end if;
  if private.content_inspection_actor(p_reason,p_request_id,false) is distinct from v_role then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  return jsonb_build_object('subjectUserId',p_subject_user_id,'targets',v_rows,'hasMore',v_more,
    'nextCursor',case when v_more then jsonb_build_object('createdAt',v_last->'createdAt','id',v_last->'targetId') else null end);
end;
$$;
revoke all on function public.admin_list_content_inspection_subject_targets(uuid,text,text,uuid,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_list_content_inspection_subject_targets(uuid,text,text,uuid,timestamptz,uuid)
  to authenticated;
commit;
