-- UNAPPLIED REVIEW ARTIFACT ONLY. Source application was blocked by automatic review.
-- Validated only in rollback-only local SQL; this file is not a deployed or active migration.
-- Server-owned notification producers. These helpers are metadata-only and
-- never impersonate a recipient, grant access, or return protected source URLs.
create or replace function private.social_notification_uuid(p_value text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return nullif(btrim(p_value),'')::uuid;
exception when invalid_text_representation then return null;
end;
$$;
revoke all on function private.social_notification_uuid(text) from public,anon,authenticated,service_role;

create or replace function private.social_notification_accounts_allowed(p_actor uuid,p_recipient uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_actor is not null and p_recipient is not null and p_actor <> p_recipient
    and exists(select 1 from auth.users where id=p_actor)
    and exists(select 1 from auth.users where id=p_recipient)
    and not public.is_account_access_restricted(p_actor::text)
    and not public.is_account_access_restricted(p_recipient::text)
    and not public.has_channel_audience_block_between(p_actor::text,p_recipient::text);
$$;
revoke all on function private.social_notification_accounts_allowed(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.social_notification_profile_allowed(p_owner text,p_recipient uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_profiles profile
    where profile.user_id=p_owner
      and exists(select 1 from auth.users where id::text=p_owner)
      and not public.is_account_access_restricted(p_owner)
      and not public.is_account_access_restricted(p_recipient::text)
      and not public.has_channel_audience_block_between(p_owner,p_recipient::text)
      and (
        p_owner=p_recipient::text
        or profile.profile_access_visibility='public'
        or (profile.profile_access_visibility='private'
          and public.is_active_chilly_circle_member(p_owner,p_recipient::text))
        or (profile.profile_access_visibility in ('private','subscriber_only') and (
          exists(select 1 from public.channel_subscribers subscriber
            where subscriber.channel_user_id=p_owner and subscriber.subscriber_user_id=p_recipient::text
              and subscriber.status in ('active','grace_period')
              and (subscriber.expires_at is null or subscriber.expires_at>now()))
          or exists(select 1 from public.creator_channel_subscriptions subscription
            where subscription.creator_id::text=p_owner and subscription.subscriber_id=p_recipient
              and subscription.status in ('active','trialing','grace_period','cancel_pending')
              and subscription.revoked_at is null and subscription.expired_at is null
              and (subscription.current_period_end is null or subscription.current_period_end>now()))
        ))
      )
  );
$$;
revoke all on function private.social_notification_profile_allowed(text,uuid) from public,anon,authenticated,service_role;

create or replace function private.social_notification_video_allowed(p_video_id uuid,p_recipient uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_owner uuid; v_visibility text; v_moderation text; v_scan text; v_quarantined timestamptz;
  v_vip boolean; v_paid boolean; v_pass public.creator_vip_passes%rowtype;
  v_identity jsonb; v_subscription public.creator_channel_subscriptions%rowtype;
begin
  select owner_id,visibility,moderation_status,scan_status,quarantined_at,vip_access_required
    into v_owner,v_visibility,v_moderation,v_scan,v_quarantined,v_vip
  from public.videos where id=p_video_id;
  if not found or p_recipient is null
    or not exists(select 1 from auth.users where id=p_recipient)
    or public.is_account_access_restricted(v_owner::text)
    or public.is_account_access_restricted(p_recipient::text)
    or public.has_channel_audience_block_between(v_owner::text,p_recipient::text)
    or v_moderation not in ('clean','reported') or v_quarantined is not null
  then return false; end if;
  if v_owner=p_recipient then return true; end if;
  if not public.media_scan_public_safe(v_scan)
    or not (v_visibility='public' or (v_visibility='circle'
      and public.is_active_chilly_circle_member(v_owner::text,p_recipient::text)))
  then return false; end if;
  if v_vip then
    if v_visibility<>'public' then return false; end if;
    select pass.* into v_pass from public.creator_vip_passes pass
      join public.creator_vip_pass_offers offer on offer.id=pass.offer_id and offer.creator_id=pass.creator_id
      where pass.creator_id=v_owner and pass.fan_id=p_recipient and pass.status='active'
        and pass.access_grant_id is not null and pass.activated_at is not null
        and pass.expires_at=pass.activated_at+interval '30 days'
        and pass.activated_at<=now() and pass.expires_at>now()
        and pass.refunded_at is null and pass.revoked_at is null and offer.status<>'blocked'
      order by pass.activated_at desc,pass.id desc limit 1;
    if not found then return false; end if;
    begin
      v_identity:=public.creator_money_historical_purchase_identity_internal(
        p_recipient,'vip_pass',v_pass.offer_id,v_pass.access_grant_id);
    exception when raise_exception then
      if sqlerrm='historical_purchase_identity_missing' then v_identity:=null; else raise; end if;
    end;
    return nullif(v_identity->>'accessGrantId','') is not null
      and private.social_notification_uuid(v_identity->>'accessGrantId')=v_pass.access_grant_id;
  end if;
  select is_paid into v_paid from public.creator_content_prices
    where content_type='creator_video' and content_id=p_video_id and creator_id=v_owner
    order by updated_at desc,id desc limit 1;
  if not coalesce(v_paid,false) then return true; end if;
  if v_visibility<>'public' then return false; end if;
  begin
    v_identity:=public.creator_video_existing_purchase_identity_internal(p_recipient,p_video_id);
  exception when raise_exception then
    if sqlerrm='historical_purchase_identity_missing' then v_identity:=null; else raise; end if;
  end;
  if nullif(v_identity->>'id','') is not null and nullif(v_identity->>'accessGrantId','') is not null then return true; end if;
  for v_subscription in select subscription.* from public.creator_channel_subscriptions subscription
    join public.creator_channel_subscription_offers offer
      on offer.id=subscription.offer_id and offer.creator_id=subscription.creator_id
    where subscription.creator_id=v_owner and subscription.subscriber_id=p_recipient
      and subscription.status in ('active','trialing','grace_period','cancel_pending')
      and subscription.current_period_end>now() and subscription.access_grant_id is not null
      and subscription.revoked_at is null and subscription.expired_at is null and offer.status<>'blocked'
    order by subscription.updated_at desc,subscription.id desc
  loop
    begin
      v_identity:=public.creator_money_historical_purchase_identity_internal(
        p_recipient,'channel_subscription',v_subscription.offer_id,v_subscription.access_grant_id);
    exception when raise_exception then
      if sqlerrm='historical_purchase_identity_missing' then v_identity:=null; else raise; end if;
    end;
    if nullif(v_identity->>'accessGrantId','') is not null
      and private.social_notification_uuid(v_identity->>'accessGrantId')=v_subscription.access_grant_id
    then return true; end if;
  end loop;
  return false;
end;
$$;
revoke all on function private.social_notification_video_allowed(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.enqueue_social_notification_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_new jsonb:=to_jsonb(new); v_old jsonb; v_actor uuid; v_recipient uuid;
  v_kind text; v_source text; v_context jsonb:='{}'; v_rec record;
  v_owner text; v_parent text; v_other text;
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
    perform private.enqueue_notification_activity(v_kind||':'||v_source||':'||v_actor||':'||v_recipient,v_kind,v_source,v_actor,v_recipient,v_context);
  end if;
  return new;
end;
$$;
revoke all on function private.enqueue_social_notification_activity() from public,anon,authenticated,service_role;

create or replace function private.resolve_social_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor text:=p_event.actor_user_id::text; v_recipient text:=p_event.recipient_user_id::text;
  v_context jsonb:=p_event.context; v_ok boolean:=false; v_row record; v_parent record;
  v_owner text; v_category text:='social_activity'; v_preference text:='social_activity_enabled';
  v_title text; v_body text; v_route text; v_target text; v_target_context jsonb:='{}';
begin
  if not private.social_notification_accounts_allowed(p_event.actor_user_id,p_event.recipient_user_id)
    or (p_event.expires_at is not null and p_event.expires_at<=now()) then
    return jsonb_build_object('eligible',false);
  end if;
  if p_event.event_kind='social_follow' then
    select true into v_ok from public.channel_followers
      where channel_user_id=v_recipient and follower_user_id=v_actor
        and channel_user_id||':'||follower_user_id=p_event.source_id
        and followed_at=(v_context->>'followedAt')::timestamptz;
    v_title:='New follower'; v_body:='Someone followed your channel.';
    v_route:='/profile/[userId]'; v_target:=v_actor;
  elsif p_event.event_kind in ('social_follow_request','social_follow_accepted') then
    select * into v_row from public.channel_audience_requests
      where id::text=p_event.source_id and request_kind='follow'
        and channel_user_id=v_context->>'channelUserId'
        and requester_user_id=v_context->>'requesterUserId'
        and created_at=(v_context->>'createdAt')::timestamptz;
    if not found then return jsonb_build_object('eligible',false); end if;
    if p_event.event_kind='social_follow_request' then
      v_ok:=v_row.status='pending' and v_row.requester_user_id=v_actor and v_row.channel_user_id=v_recipient;
      v_title:='Follow request'; v_body:='You have a new follow request.';
      v_route:='/channel-settings';
    else
      v_ok:=v_row.status='approved' and v_row.channel_user_id=v_actor and v_row.requester_user_id=v_recipient
        and exists(select 1 from public.channel_followers where channel_user_id=v_actor and follower_user_id=v_recipient);
      v_title:='Follow request accepted'; v_body:='Your follow request was accepted.';
      v_route:='/channel/[userId]'; v_target:=v_actor;
    end if;
    v_target_context:=jsonb_build_object('requestId',p_event.source_id);
  elsif p_event.event_kind in ('circle_request','circle_accepted','circle_added') then
    select * into v_row from public.user_friendships
      where user_low_id=least(v_actor,v_recipient) and user_high_id=greatest(v_actor,v_recipient)
        and user_low_id||':'||user_high_id=p_event.source_id
        and requested_by_user_id=v_context->>'requestedBy'
        and created_at=(v_context->>'createdAt')::timestamptz;
    if not found then return jsonb_build_object('eligible',false); end if;
    v_category:='circle_activity'; v_preference:='circle_activity_enabled'; v_route:='/chilly-circle';
    if p_event.event_kind='circle_request' then
      v_ok:=v_row.status='pending' and v_row.requested_by_user_id=v_actor;
      v_title:='Chi''lly Circle request'; v_body:='You have a new Chi''lly Circle request.';
    elsif p_event.event_kind='circle_accepted' then
      v_ok:=v_row.status='active' and v_row.requested_by_user_id=v_recipient and v_row.actioned_by_user_id=v_actor
        and v_row.responded_at=(v_context->>'respondedAt')::timestamptz;
      v_title:='Chi''lly Circle request accepted'; v_body:='Your Chi''lly Circle request was accepted.';
    else
      v_ok:=v_row.status='active' and v_row.requested_by_user_id=v_actor and v_row.actioned_by_user_id=v_actor
        and v_row.responded_at=(v_context->>'respondedAt')::timestamptz;
      v_title:='Added to Chi''lly Circle'; v_body:='Someone added you to their Chi''lly Circle.';
    end if;
  elsif p_event.event_kind='content_shared' then
    v_ok:=exists(select 1 from public.user_content_relationships relation
        join public.user_profiles profile on profile.user_id=relation.user_id
        join public.titles title on title.id::text=relation.title_id
        where relation.user_id=v_actor and relation.title_id=p_event.source_id and relation.relationship_type='share'
          and relation.title_id=v_context->>'titleId' and profile.shares_visibility='public'
          and title.is_published is true and title.status='published'
          and (title.release_at is null or title.release_at<=now()))
      and public.is_active_chilly_circle_member(v_actor,v_recipient)
      and private.social_notification_profile_allowed(v_actor,p_event.recipient_user_id);
    v_category:='circle_activity'; v_preference:='circle_activity_enabled';
    v_title:='Chi''lly Circle shared activity'; v_body:='Someone in your Chi''lly Circle shared a title.';
    v_route:='/title/[id]'; v_target:=p_event.source_id;
    v_target_context:=jsonb_build_object('titleId',p_event.source_id,'defaultActionLabel','Open title');
  elsif p_event.event_kind in ('circle_post','profile_post_liked') then
    select id,user_id,visibility,moderation_status,deleted_at,created_at into v_row
      from public.profile_posts where id::text=p_event.source_id and id::text=v_context->>'postId';
    if not found then return jsonb_build_object('eligible',false); end if;
    v_ok:=v_row.deleted_at is null and v_row.visibility='public' and v_row.moderation_status in ('clean','reported')
      and private.social_notification_profile_allowed(v_row.user_id,p_event.recipient_user_id);
    if p_event.event_kind='circle_post' then
      v_ok:=v_ok and v_row.user_id=v_actor and v_row.created_at=(v_context->>'createdAt')::timestamptz
        and public.is_active_chilly_circle_member(v_actor,v_recipient);
      v_category:='circle_activity'; v_preference:='circle_activity_enabled';
      v_title:='New Chi''lly Circle post'; v_body:='Someone in your Chi''lly Circle posted an update.';
    else
      v_ok:=v_ok and v_row.user_id=v_recipient and exists(select 1 from public.profile_post_likes
        where post_id=v_row.id and user_id=v_actor and created_at=(v_context->>'createdAt')::timestamptz);
      v_title:='Your post was liked'; v_body:='Someone liked your profile post.';
    end if;
    v_route:='/profile/[userId]'; v_target:=v_row.user_id;
    v_target_context:=jsonb_build_object('postId',v_row.id);
  elsif p_event.event_kind in ('profile_comment','profile_reply','video_comment','video_reply') then
    if p_event.event_kind in ('profile_comment','profile_reply') then
      select id,post_id as content_id,user_id,parent_comment_id,created_at,deleted_at,moderation_status into v_row
        from public.profile_post_comments where id::text=p_event.source_id;
      if not found then return jsonb_build_object('eligible',false); end if;
      select post.user_id into v_owner from public.profile_posts post
        where post.id=v_row.content_id and post.id::text=v_context->>'postId'
          and post.deleted_at is null and post.visibility='public' and post.moderation_status in ('clean','reported');
      if not found or not private.social_notification_profile_allowed(v_owner,p_event.recipient_user_id)
      then return jsonb_build_object('eligible',false); end if;
      select id,user_id,post_id as content_id,deleted_at,moderation_status into v_parent
        from public.profile_post_comments where id=v_row.parent_comment_id;
      v_route:='/profile/[userId]'; v_target:=v_owner;
      v_target_context:=jsonb_build_object('postId',v_row.content_id,'commentId',v_row.id);
    else
      select id,video_id as content_id,user_id,parent_comment_id,created_at,deleted_at,moderation_status into v_row
        from public.creator_video_comments where id::text=p_event.source_id;
      if not found then return jsonb_build_object('eligible',false); end if;
      select owner_id::text into v_owner from public.videos
        where id=v_row.content_id and id::text=v_context->>'videoId';
      if not found or not private.social_notification_video_allowed(v_row.content_id,p_event.recipient_user_id)
      then return jsonb_build_object('eligible',false); end if;
      select id,user_id,video_id as content_id,deleted_at,moderation_status into v_parent
        from public.creator_video_comments where id=v_row.parent_comment_id;
      v_route:='/player/[id]'; v_target:=v_row.content_id::text;
      v_target_context:=jsonb_build_object('videoId',v_row.content_id,'commentId',v_row.id);
    end if;
    v_ok:=v_row.user_id=v_actor and v_row.deleted_at is null and v_row.moderation_status in ('clean','reported')
      and v_row.created_at=(v_context->>'createdAt')::timestamptz
      and v_row.parent_comment_id is not distinct from private.social_notification_uuid(v_context->>'parentCommentId');
    if v_row.parent_comment_id is not null then
      v_ok:=v_ok and v_parent.id=v_row.parent_comment_id and v_parent.content_id=v_row.content_id
        and v_parent.deleted_at is null and v_parent.moderation_status in ('clean','reported');
    end if;
    if p_event.event_kind in ('profile_reply','video_reply') then
      v_ok:=v_ok and v_row.parent_comment_id is not null and v_parent.user_id=v_recipient;
      v_title:='New reply'; v_body:='Someone replied to your comment.';
    else
      v_ok:=v_ok and v_owner=v_recipient;
      v_title:='New comment'; v_body:='Someone commented on your content.';
    end if;
    v_category:='reply_comment';
  elsif p_event.event_kind='chat_message' then
    select id,thread_id,sender_user_id,created_at,moderation_status,message_type into v_row
      from public.chat_messages where id::text=p_event.source_id;
    if not found then return jsonb_build_object('eligible',false); end if;
    v_ok:=v_row.sender_user_id=v_actor and v_row.thread_id::text=v_context->>'threadId'
      and v_row.created_at=(v_context->>'createdAt')::timestamptz
      and v_row.moderation_status='clean' and v_row.message_type='text'
      and exists(select 1 from public.chat_threads where id=v_row.thread_id)
      and exists(select 1 from public.chat_thread_members where thread_id=v_row.thread_id and user_id=v_actor)
      and exists(select 1 from public.chat_thread_members where thread_id=v_row.thread_id and user_id=v_recipient
        and (last_read_at is null or last_read_at<v_row.created_at));
    v_category:='new_message'; v_preference:='messages_enabled';
    v_title:='New Chi''lly Chat message'; v_body:='You have a new message.';
    v_route:='/chat/[threadId]'; v_target:=v_row.thread_id::text;
    v_target_context:=jsonb_build_object('threadId',v_row.thread_id,'messageId',v_row.id);
  else return jsonb_build_object('eligible',false); end if;
  if v_ok is not true then return jsonb_build_object('eligible',false); end if;
  return jsonb_build_object('eligible',true,'category',v_category,'notification_type',p_event.event_kind,
    'title',v_title,'body',v_body,'target_route',v_route,'target_entity_id',v_target,
    'target_context',v_target_context,'preference_key',v_preference);
end;
$$;
revoke all on function private.resolve_social_notification_activity(public.notification_activity_events) from public,anon,authenticated,service_role;

create trigger social_notification_follow after insert on public.channel_followers for each row execute function private.enqueue_social_notification_activity();
create trigger social_notification_follow_request after insert or update on public.channel_audience_requests for each row execute function private.enqueue_social_notification_activity();
create trigger social_notification_circle after insert or update on public.user_friendships for each row execute function private.enqueue_social_notification_activity();
create trigger social_notification_share after insert on public.user_content_relationships for each row execute function private.enqueue_social_notification_activity();
create trigger social_notification_post after insert or update on public.profile_posts for each row execute function private.enqueue_social_notification_activity();
create trigger social_notification_post_like after insert on public.profile_post_likes for each row execute function private.enqueue_social_notification_activity();
create trigger social_notification_post_comment after insert on public.profile_post_comments for each row execute function private.enqueue_social_notification_activity();
create trigger social_notification_video_comment after insert on public.creator_video_comments for each row execute function private.enqueue_social_notification_activity();
create trigger social_notification_message after insert on public.chat_messages for each row execute function private.enqueue_social_notification_activity();
