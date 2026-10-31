-- Copy-only enrichment runs AFTER the existing current-source, recipient,
-- relationship and revision checks. No delivery, history backfill or access grant.
create function private.notification_subject_label(p_value text,p_limit integer)
returns text language sql immutable set search_path='' as $$
 select nullif(left(btrim(regexp_replace(translate(coalesce(p_value,''),
   chr(8234)||chr(8235)||chr(8236)||chr(8237)||chr(8238)||chr(8294)||chr(8295)||chr(8296)||chr(8297),''),
   '[[:cntrl:][:space:]]+',' ','g')),greatest(1,least(coalesce(p_limit,120),240))),'');
$$;
revoke all on function private.notification_subject_label(text,integer) from public,anon,authenticated,service_role;

alter function private.resolve_discovery_notification_activity(public.notification_activity_events)
 rename to resolve_discovery_notification_before_subject_context;
create function private.resolve_discovery_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare plan jsonb; creator_name text; handle text; subject_title text; v_source_type text;
 label text; title_text text; body_text text;
begin
 plan:=private.resolve_discovery_notification_before_subject_context(p_event);
 if plan->>'eligible' is distinct from 'true' then return plan; end if;
 -- Never source an identity from caller context or JWT metadata. A deleted or
 -- restricted actor cannot expose an old profile label through this helper.
 if p_event.actor_user_id is null or not exists(select 1 from auth.users where id=p_event.actor_user_id)
   or public.is_account_access_restricted(p_event.actor_user_id::text)
   or exists(select 1 from public.account_deletion_requests where user_id::text=p_event.actor_user_id::text
      and status in ('scheduled','completed')) then return '{"eligible":false}'; end if;
 -- Profile visibility's public RPC binds auth.uid(), not an arbitrary worker
 -- recipient. Do not let an operator worker disclose a private profile name.
 select private.notification_subject_label(display_name,80),private.notification_subject_label(username,60)
   into creator_name,handle from public.user_profiles where user_id=p_event.actor_user_id::text
     and profile_access_visibility='public' and not public.is_platform_owner_user(user_id);
 if creator_name is null then creator_name:=case when handle is not null then '@'||handle else 'Creator unavailable' end;
 elsif handle is not null and lower(creator_name)<>lower(handle) and lower(creator_name)<>lower('@'||handle)
   then creator_name:=creator_name||' (@'||handle||')'; end if;
 v_source_type:=p_event.context->>'sourceType';
 if p_event.event_kind in ('event_starts_soon','watch_party_starts_soon','creator_event_updated','creator_event_canceled') then
   select private.notification_subject_label(event_title,160) into subject_title from public.creator_events
     where id=private.discovery_notification_uuid(p_event.source_id) and host_user_id=p_event.actor_user_id;
   v_source_type:='event';
 elsif v_source_type='video' then
   select private.notification_subject_label(title,160) into subject_title from public.videos
     where id=private.discovery_notification_uuid(p_event.source_id) and owner_id=p_event.actor_user_id;
 elsif v_source_type='replay' then
   select private.notification_subject_label(title,160) into subject_title from public.creator_replay_library_items
     where id=private.discovery_notification_uuid(p_event.source_id) and owner_user_id=p_event.actor_user_id::text;
 elsif v_source_type in ('live_stage','party_room') then
   select private.notification_subject_label(coalesce(nullif(btrim(r.discovery_title),''),
       case when v_source_type='party_room' then private.party_room_content_metadata(r)->>'title' end),160)
     into subject_title from public.watch_party_rooms r where party_id=p_event.source_id and host_user_id=p_event.actor_user_id;
 elsif v_source_type='broadcast' then
   select private.notification_subject_label(r.discovery_title,160) into subject_title
     from public.room_broadcast_sessions b join public.watch_party_rooms r
       on r.party_id=coalesce(nullif(b.source_room_id,''),nullif(b.watch_party_room_id,''))
     where b.id=private.discovery_notification_uuid(p_event.source_id) and r.host_user_id=p_event.actor_user_id;
 end if;
 label:=coalesce(subject_title,case v_source_type when 'video' then 'Untitled video' when 'replay' then 'Untitled replay'
   when 'event' then 'Untitled event' when 'live_stage' then 'Live Stage' else 'Watch-Party Live' end);
 if p_event.event_kind='public_upload' then
   title_text:=creator_name||' posted a video'; body_text:=label;
 elsif p_event.event_kind='replay_later' then
   title_text:=creator_name||' · Replay ready'; body_text:=label||'. Open to check playback availability.';
 elsif p_event.event_kind='creator_event_canceled' then
   title_text:='Event canceled · '||creator_name; body_text:=label||' was canceled.';
 elsif p_event.event_kind='creator_event_updated' then
   title_text:='Event updated · '||creator_name; body_text:=label||' has changed. Open for the latest details.';
 elsif p_event.event_kind in ('event_starts_soon','watch_party_starts_soon') then
   title_text:='Starting soon · '||creator_name; body_text:=label||' starts soon.';
 else
   title_text:=creator_name||' is live'; body_text:=label||'. Open to check access.';
 end if;
 return plan||jsonb_build_object('title',title_text,'body',body_text,'target_context',
   coalesce(plan->'target_context','{}'::jsonb)||jsonb_build_object('display_context',jsonb_build_object('version',1,
     'creator_id',p_event.actor_user_id,'creator_display_name',creator_name,
     'target_id',plan->>'target_entity_id','subject_title',label)));
end $$;
revoke all on function private.resolve_discovery_notification_before_subject_context(public.notification_activity_events),
 private.resolve_discovery_notification_activity(public.notification_activity_events) from public,anon,authenticated,service_role;

-- Social activity keeps the existing relationship/content authorization and
-- exact targets. Never include chat, comment or profile-post body previews.
alter function private.resolve_social_notification_activity(public.notification_activity_events)
 rename to resolve_social_notification_before_subject_context;
create function private.resolve_social_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare plan jsonb; actor_name text; handle text; subject_label text; copy_body text;
begin
 plan:=private.resolve_social_notification_before_subject_context(p_event);
 if plan->>'eligible' is distinct from 'true' then return plan; end if;
 if exists(select 1 from public.account_deletion_requests where user_id::text=p_event.actor_user_id::text
   and status in ('scheduled','completed')) then return '{"eligible":false}'; end if;
 select private.notification_subject_label(display_name,80),private.notification_subject_label(username,60)
 into actor_name,handle from public.user_profiles where user_id=p_event.actor_user_id::text
   and profile_access_visibility='public' and not public.is_platform_owner_user(user_id);
 if actor_name is null then actor_name:=case when handle is not null then '@'||handle else 'Member unavailable' end;
 elsif handle is not null and lower(actor_name)<>lower(handle) and lower(actor_name)<>lower('@'||handle)
   then actor_name:=actor_name||' (@'||handle||')'; end if;
 if p_event.event_kind='content_shared' then
   select private.notification_subject_label(title,160) into subject_label from public.titles
    where id=private.social_notification_uuid(plan->>'target_entity_id');
 elsif p_event.event_kind in ('video_comment','video_reply') then
   select private.notification_subject_label(title,160) into subject_label from public.videos
    where id=private.social_notification_uuid(plan->>'target_entity_id');
 end if;
 copy_body:=case p_event.event_kind
 when 'social_follow' then actor_name||' followed your Platform.'
 when 'social_follow_request' then actor_name||' requested to follow your Platform.'
 when 'social_follow_accepted' then actor_name||' accepted your follow request.'
 when 'circle_request' then actor_name||' sent you a Chi''lly Circle request.'
 when 'circle_accepted' then actor_name||' accepted your Chi''lly Circle request.'
 when 'circle_added' then actor_name||' added you to their Chi''lly Circle.'
 when 'content_shared' then actor_name||' shared '||coalesce(subject_label,'an untitled title')||'.'
 when 'circle_post' then actor_name||' posted a Chi''lly Circle update.'
 when 'profile_post_liked' then actor_name||' liked your profile post.'
 when 'profile_comment' then actor_name||' commented on your profile post.'
 when 'profile_reply' then actor_name||' replied to your profile comment.'
 when 'video_comment' then actor_name||' commented on '||coalesce(subject_label,'your video')||'.'
 when 'video_reply' then actor_name||' replied to your comment on '||coalesce(subject_label,'a video')||'.'
 when 'chat_message' then actor_name||' sent you a Chi''lly Chat message.'
 else plan->>'body' end;
 return plan||jsonb_build_object('body',copy_body,'target_context',coalesce(plan->'target_context','{}'::jsonb)
   ||jsonb_build_object('display_context',jsonb_build_object('version',1,'actor_id',p_event.actor_user_id,
    'actor_display_name',actor_name,'target_id',plan->>'target_entity_id','subject_title',subject_label)));
end $$;
revoke all on function private.resolve_social_notification_before_subject_context(public.notification_activity_events),
 private.resolve_social_notification_activity(public.notification_activity_events) from public,anon,authenticated,service_role;

-- Auction and speaking-seat notices retain their precise payment/role facts.
-- The creator comes from the authorized target, not the actor (a seat requester
-- is a buyer, and a creator-award event intentionally has no actor).
alter function private.resolve_seat_notification_activity(public.notification_activity_events)
 rename to resolve_seat_notification_before_subject_context;
create function private.resolve_seat_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare plan jsonb; owner_id uuid; creator_name text; handle text; subject_label text;
begin
 plan:=private.resolve_seat_notification_before_subject_context(p_event);
 if plan->>'eligible' is distinct from 'true' then return plan; end if;
 if plan->>'target_route'='/event/[eventId]' then
   select e.host_user_id,case when e.visibility='public' or e.host_user_id=p_event.recipient_user_id
     then private.notification_subject_label(e.event_title,160) end into owner_id,subject_label
   from public.creator_events e where e.id=private.seat_notification_uuid(plan->>'target_entity_id');
 else
   select r.host_user_id,case when r.discovery_visibility='public' or r.host_user_id=p_event.recipient_user_id
     then private.notification_subject_label(r.discovery_title,160) end into owner_id,subject_label
   from public.watch_party_rooms r where r.party_id=plan->>'target_entity_id';
 end if;
 if owner_id is null or public.is_account_access_restricted(owner_id::text)
   or not exists(select 1 from auth.users where id=owner_id)
   or public.has_channel_audience_block_between(owner_id::text,p_event.recipient_user_id::text)
   or exists(select 1 from public.account_deletion_requests where user_id::text=owner_id::text
    and status in ('scheduled','completed')) then return '{"eligible":false}'; end if;
 select private.notification_subject_label(display_name,80),private.notification_subject_label(username,60)
 into creator_name,handle from public.user_profiles where user_id=owner_id::text
   and profile_access_visibility='public' and not public.is_platform_owner_user(user_id);
 if creator_name is null then creator_name:=case when handle is not null then '@'||handle else 'Creator unavailable' end;
 elsif handle is not null and lower(creator_name)<>lower(handle) and lower(creator_name)<>lower('@'||handle)
   then creator_name:=creator_name||' (@'||handle||')'; end if;
 subject_label:=coalesce(subject_label,case plan->>'target_route' when '/event/[eventId]' then 'Event'
   when '/watch-party/live-stage/[partyId]' then 'Live Stage' else 'Watch-Party Live' end);
 return plan||jsonb_build_object('body',creator_name||' · '||subject_label||'. '||(plan->>'body'),
   'target_context',coalesce(plan->'target_context','{}'::jsonb)||jsonb_build_object('display_context',
    jsonb_build_object('version',1,'creator_id',owner_id,'creator_display_name',creator_name,
     'target_id',plan->>'target_entity_id','subject_title',subject_label)));
end $$;
revoke all on function private.resolve_seat_notification_before_subject_context(public.notification_activity_events),
 private.resolve_seat_notification_activity(public.notification_activity_events) from public,anon,authenticated,service_role;
