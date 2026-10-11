-- Forward-only user-facing notification copy. No row backfill or authority change.
-- Internal channel identifiers, destinations, preferences and grants remain unchanged.

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
    v_title:='New follower'; v_body:='Someone followed your Platform.';
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

-- Keep canonical offer defaults and the blank-title fallback consistent with
-- existing Platform UI copy. No custom title or existing row is rewritten.
CREATE OR REPLACE FUNCTION public.set_creator_channel_subscription_offer(p_title text DEFAULT 'Platform subscription'::text, p_description text DEFAULT NULL::text, p_status text DEFAULT 'sandbox'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if lower(trim(coalesce(p_status, 'sandbox'))) in ('draft','sandbox','active') then
    perform public."wave1_assert_current_creator_money_authority_internal"();
  end if;
  return public."set_creator_channel_subscription_offer_pre_integrity_closeout"(p_title,p_description,p_status);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_creator_channel_subscription_offer_pre_integrity_closeout(p_title text DEFAULT 'Platform subscription'::text, p_description text DEFAULT NULL::text, p_status text DEFAULT 'sandbox'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_product public."monetization_products"%rowtype;
  v_status text := lower(trim(coalesce(p_status, 'sandbox')));
  v_offer public."creator_channel_subscription_offers"%rowtype;
  v_digital_switch text := coalesce((select "state" from public."platform_money_kill_switches" where "key" = 'digital_sales_enabled' limit 1), 'off');
  v_provider_switch text := coalesce((select "state" from public."platform_money_kill_switches" where "key" = 'revenuecat_google_play_enabled' limit 1), 'off');
begin
  if v_actor_id is null then
    raise exception 'auth_required';
  end if;
  if v_status not in ('draft', 'sandbox', 'paused', 'archived') then
    raise exception 'unsupported_offer_status';
  end if;
  if v_digital_switch not in ('sandbox_only', 'on') then
    raise exception 'channel_subscriptions_disabled';
  end if;
  if v_provider_switch not in ('sandbox_only', 'on') then
    raise exception 'provider_not_ready';
  end if;

  select * into v_product
  from public."monetization_products"
  where "product_key" = 'channel_subscription_sandbox_monthly_499'
    and "product_type" = 'channel_subscription'
    and "provider" in ('revenuecat_google_play', 'google_play', 'revenuecat')
    and "environment" = 'sandbox'
    and "status" = 'sandbox'
  limit 1;

  if v_product."id" is null or nullif(trim(coalesce(v_product."provider_product_id", '')), '') is null then
    raise exception 'provider_product_missing';
  end if;

  insert into public."creator_channel_subscription_offers" (
    "creator_id",
    "title",
    "description",
    "price_cents",
    "currency",
    "interval",
    "status",
    "provider",
    "provider_product_key",
    "provider_product_id",
    "provider_entitlement_id",
    "metadata"
  )
  values (
    v_actor_id,
    coalesce(nullif(trim(p_title), ''), 'Platform subscription'),
    nullif(trim(p_description), ''),
    499,
    'usd',
    'monthly',
    v_status,
    'revenuecat_google_play',
    v_product."product_key",
    v_product."provider_product_id",
    coalesce(nullif(trim(v_product."revenuecat_entitlement"), ''), 'creator_channel_subscription'),
    jsonb_build_object(
      'sandbox_only', true,
      'not_payable', true,
      'premium_unlock', false,
      'vip_unlock', false,
      'paid_video_unlock', false,
      'paid_watch_party_ticket_unlock', false,
      'paid_event_unlock', false,
      'tips_path', false,
      'room_media_controls', false,
      'grants_host_authority', false,
      'platform_wide_badge', false,
      'live_money_enabled_at_save', coalesce((select "state" = 'on' from public."platform_money_kill_switches" where "key" = 'live_money_enabled'), false)
    )
  )
  on conflict ("creator_id")
  where "status" in ('sandbox', 'active', 'paused', 'blocked')
  do update set
    "title" = excluded."title",
    "description" = excluded."description",
    "price_cents" = excluded."price_cents",
    "currency" = excluded."currency",
    "interval" = excluded."interval",
    "status" = excluded."status",
    "provider" = excluded."provider",
    "provider_product_key" = excluded."provider_product_key",
    "provider_product_id" = excluded."provider_product_id",
    "provider_entitlement_id" = excluded."provider_entitlement_id",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now())
  returning * into v_offer;

  insert into public."creator_channel_subscription_events" ("offer_id", "actor_id", "event_type", "metadata")
  values (
    v_offer."id",
    v_actor_id,
    'offer_saved',
    jsonb_build_object('status', v_offer."status", 'sandbox_only', true, 'not_payable', true)
  );

  return public."channel_subscription_offer_safe_row"(v_offer);
end;
$function$;

revoke all on function public.set_creator_channel_subscription_offer(text,text,text) from public,anon;
grant execute on function public.set_creator_channel_subscription_offer(text,text,text) to authenticated,service_role;
revoke all on function public.set_creator_channel_subscription_offer_pre_integrity_closeout(text,text,text) from public,anon,authenticated,service_role;
