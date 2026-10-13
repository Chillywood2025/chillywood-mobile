-- Preserve existing event rows and Follow/refollow anti-spam. Only genuine
-- Circle request lifecycles gain a fresh event identity; recipients, eligibility,
-- outbox delivery and all function privileges remain unchanged.

create or replace function private.enqueue_social_notification_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_new jsonb:=to_jsonb(new); v_old jsonb; v_actor uuid; v_recipient uuid;
  v_kind text; v_source text; v_context jsonb:='{}'; v_rec record;
  v_owner text; v_parent text; v_other text;
  v_key_suffix text:='';
begin
  if tg_op='UPDATE' then v_old:=to_jsonb(old); end if;
  if tg_table_name='channel_followers' then
    v_actor:=private.social_notification_uuid(new.follower_user_id);
    v_recipient:=private.social_notification_uuid(new.channel_user_id);
    v_kind:='social_follow'; v_source:=new.channel_user_id||':'||new.follower_user_id;
    v_context:=jsonb_build_object('followedAt',new.followed_at);
  elsif tg_table_name='channel_audience_requests' then
    if new.request_kind<>'follow' then return new; end if;
    v_source:=new.id::text;
    v_context:=jsonb_build_object('channelUserId',new.channel_user_id,'requesterUserId',new.requester_user_id,'createdAt',new.created_at);
    if tg_op='INSERT' and new.status='pending' then
      v_kind:='social_follow_request';
      v_actor:=private.social_notification_uuid(new.requester_user_id);
      v_recipient:=private.social_notification_uuid(new.channel_user_id);
    elsif tg_op='UPDATE' and old.status='pending' and new.status='approved'
      and old.channel_user_id=new.channel_user_id and old.requester_user_id=new.requester_user_id then
      v_kind:='social_follow_accepted';
      v_actor:=private.social_notification_uuid(new.channel_user_id);
      v_recipient:=private.social_notification_uuid(new.requester_user_id);
    else return new; end if;
  elsif tg_table_name='user_friendships' then
    v_actor:=private.social_notification_uuid(new.requested_by_user_id);
    v_other:=case when new.requested_by_user_id=new.user_low_id then new.user_high_id else new.user_low_id end;
    v_recipient:=private.social_notification_uuid(v_other);
    v_source:=new.user_low_id||':'||new.user_high_id;
    -- The request RPC advances created_at after removal, decline or cancellation.
    -- Keep one event per real request lifecycle, independent of session timezone.
    v_key_suffix:=':lifecycle:'||extract(epoch from new.created_at)::text;
    v_context:=jsonb_build_object('requestedBy',new.requested_by_user_id,'createdAt',new.created_at,'respondedAt',new.responded_at);
    if new.status='pending' and (tg_op='INSERT' or old.status is distinct from 'pending' or old.requested_by_user_id is distinct from new.requested_by_user_id) then
      v_kind:='circle_request';
    elsif new.status='active' and (tg_op='INSERT' or old.status is distinct from 'active') then
      if tg_op='UPDATE' and old.status='pending' and old.requested_by_user_id=new.requested_by_user_id and new.actioned_by_user_id=v_other then
        v_kind:='circle_accepted'; v_recipient:=v_actor; v_actor:=private.social_notification_uuid(v_other);
      elsif new.actioned_by_user_id=new.requested_by_user_id then v_kind:='circle_added';
      else return new; end if;
    else return new; end if;
  elsif tg_table_name in ('user_content_relationships','profile_posts') then
    if tg_table_name='user_content_relationships' then
      if new.relationship_type<>'share' then return new; end if;
      v_kind:='content_shared'; v_source:=new.title_id; v_actor:=private.social_notification_uuid(new.user_id);
      v_context:=jsonb_build_object('titleId',new.title_id);
    else
      if new.deleted_at is not null or new.visibility<>'public' or new.moderation_status<>'clean'
        or (tg_op='UPDATE' and old.deleted_at is null and old.visibility='public' and old.moderation_status in ('clean','reported'))
      then return new; end if;
      v_kind:='circle_post'; v_source:=new.id::text; v_actor:=private.social_notification_uuid(new.user_id);
      v_context:=jsonb_build_object('postId',new.id,'createdAt',new.created_at);
    end if;
    for v_rec in select case when user_low_id=v_actor::text then user_high_id else user_low_id end as user_id
      from public.user_friendships where status='active' and v_actor::text in (user_low_id,user_high_id)
    loop
      v_recipient:=private.social_notification_uuid(v_rec.user_id);
      if private.social_notification_accounts_allowed(v_actor,v_recipient) then
        perform private.enqueue_notification_activity(v_kind||':'||v_source||':'||v_actor||':'||v_recipient,v_kind,v_source,v_actor,v_recipient,v_context);
      end if;
    end loop;
    return new;
  elsif tg_table_name='profile_post_likes' then
    select user_id into v_owner from public.profile_posts where id=new.post_id;
    v_kind:='profile_post_liked'; v_source:=new.post_id::text;
    v_actor:=private.social_notification_uuid(new.user_id); v_recipient:=private.social_notification_uuid(v_owner);
    v_context:=jsonb_build_object('postId',new.post_id,'createdAt',new.created_at);
  elsif tg_table_name in ('profile_post_comments','creator_video_comments') then
    if new.deleted_at is not null or new.moderation_status<>'clean' then return new; end if;
    v_actor:=private.social_notification_uuid(new.user_id); v_source:=new.id::text;
    if tg_table_name='profile_post_comments' then
      select user_id into v_owner from public.profile_posts where id=new.post_id;
      select user_id into v_parent from public.profile_post_comments where id=new.parent_comment_id and post_id=new.post_id and deleted_at is null and moderation_status in ('clean','reported');
      v_context:=jsonb_build_object('postId',new.post_id,'parentCommentId',new.parent_comment_id,'createdAt',new.created_at);
    else
      select owner_id::text into v_owner from public.videos where id=new.video_id;
      select user_id into v_parent from public.creator_video_comments where id=new.parent_comment_id and video_id=new.video_id and deleted_at is null and moderation_status in ('clean','reported');
      v_context:=jsonb_build_object('videoId',new.video_id,'parentCommentId',new.parent_comment_id,'createdAt',new.created_at);
    end if;
    for v_rec in select distinct user_id from (values(v_owner),(v_parent)) recipients(user_id) where user_id is not null loop
      v_recipient:=private.social_notification_uuid(v_rec.user_id);
      v_kind:=(case when tg_table_name='profile_post_comments' then 'profile_' else 'video_' end)
        ||case when v_rec.user_id=v_parent then 'reply' else 'comment' end;
      if private.social_notification_accounts_allowed(v_actor,v_recipient) then
        perform private.enqueue_notification_activity('comment:'||tg_table_name||':'||v_source||':'||v_recipient,v_kind,v_source,v_actor,v_recipient,v_context);
      end if;
    end loop;
    return new;
  elsif tg_table_name='chat_messages' then
    if new.moderation_status<>'clean' or new.message_type<>'text' then return new; end if;
    v_kind:='chat_message'; v_source:=new.id::text; v_actor:=private.social_notification_uuid(new.sender_user_id);
    v_context:=jsonb_build_object('threadId',new.thread_id,'createdAt',new.created_at);
    for v_rec in select user_id from public.chat_thread_members where thread_id=new.thread_id and user_id<>new.sender_user_id loop
      v_recipient:=private.social_notification_uuid(v_rec.user_id);
      if private.social_notification_accounts_allowed(v_actor,v_recipient) then
        perform private.enqueue_notification_activity(v_kind||':'||v_source||':'||v_recipient,v_kind,v_source,v_actor,v_recipient,v_context);
      end if;
    end loop;
    return new;
  else return new; end if;
  if private.social_notification_accounts_allowed(v_actor,v_recipient) then
    perform private.enqueue_notification_activity(v_kind||':'||v_source||':'||v_actor||':'||v_recipient||v_key_suffix,v_kind,v_source,v_actor,v_recipient,v_context);
  end if;
  return new;
end;
$$;
revoke all on function private.enqueue_social_notification_activity() from public,anon,authenticated,service_role;
