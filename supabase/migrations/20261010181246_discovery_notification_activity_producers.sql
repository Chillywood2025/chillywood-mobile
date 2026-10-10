-- New source transitions only. No historical scan, delivery, or access grant.
create function private.discovery_notification_uuid(p_value text)
returns uuid language plpgsql immutable set search_path='' as $$
begin return nullif(btrim(p_value),'')::uuid;
exception when invalid_text_representation then return null; end $$;

create function private.discovery_notification_video_public(v public.videos)
returns boolean language sql stable security definer set search_path='' as $$
  select v.visibility='public' and v.moderation_status in ('clean','reported')
    and public.media_scan_public_safe(v.scan_status) and v.quarantined_at is null
    and not coalesce(v.vip_access_required,false)
    and public.is_creator_video_playable_source(v.storage_path,v.storage_object_key,v.playback_url)
    and not coalesce((select p.is_paid from public.creator_content_prices p
      where p.content_type='creator_video' and p.content_id=v.id and p.creator_id=v.owner_id
      order by p.updated_at desc,p.id desc limit 1),false);
$$;

create function private.discovery_notification_source(p_type text,p_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms; b public.room_broadcast_sessions;
  h public.spectator_hls_playback_records; v public.videos; x public.creator_replay_library_items;
  owner_id uuid; audience text; revision text; route text; entity text; title_text text;
begin
  if p_type='live_stage' then
    select * into r from public.watch_party_rooms where party_id=p_id;
    if not found or r.room_type<>'live' or not r.is_active or r.discovery_started_at is null
      or r.content_access_rule<>'open'
      or exists(select 1 from public.paid_live_watch_party_offers o where o.party_id=r.party_id
        and o.pass_type='live_watch_party_access_pass' and o.status not in ('canceled','ended'))
      or r.discovery_visibility not in ('public','circle') then return '{"eligible":false}'; end if;
    owner_id:=r.host_user_id; audience:=r.discovery_visibility;
    revision:=r.discovery_started_at::text;
    route:='/watch-party/live-stage/[partyId]'; entity:=r.party_id; title_text:='Live now';
  elsif p_type='broadcast' then
    select * into b from public.room_broadcast_sessions where id=private.discovery_notification_uuid(p_id);
    if not found then return '{"eligible":false}'; end if;
    select * into h from public.spectator_hls_playback_records where broadcast_session_id=b.id;
    if not found or b.broadcast_status<>'active_later' or b.ended_at is not null
      or not b.is_spectator_playback_enabled or b.requires_premium or b.requires_ticket
      or b.rights_status not in ('creator_owned','chillywood_original','licensed_for_public_stream')
      or b.metadata->>'spectator_child_room_fixture'='true'
      or h.playback_status<>'live' or not h.is_spectator_playback_enabled or h.playlist_path is null
      or h.requires_premium or h.requires_ticket
      or h.rights_status not in ('creator_owned','chillywood_original','licensed_for_public_stream')
    then return '{"eligible":false}'; end if;
    if b.access_type='public_free' and b.playback_url_status='public_safe_available'
      and b.is_publicly_watchable and b.metadata->>'d7f_public_safe_approved'='true'
      and h.visibility='public' and h.access_type='public_free' and h.is_publicly_watchable
    then audience:='public';
    elsif b.access_type='circle' and b.playback_url_status='circle_safe_available'
      and not b.is_publicly_watchable and b.metadata->>'circle_spectator_approved'='true'
      and h.visibility='circle' and h.access_type='circle' and not h.is_publicly_watchable
    then audience:='circle'; else return '{"eligible":false}'; end if;
    owner_id:=private.discovery_notification_uuid(coalesce(b.host_user_id,b.channel_user_id));
    entity:=coalesce(nullif(b.source_room_id,''),nullif(b.watch_party_room_id,''));
    select * into r from public.watch_party_rooms where party_id=entity;
    if not found or not r.is_active or r.host_user_id is distinct from owner_id
      or h.source_room_id is distinct from entity then return '{"eligible":false}'; end if;
    revision:=b.id::text; route:='/watch-party/[partyId]'; title_text:='Watch-Party live now';
  elsif p_type='video' then
    select * into v from public.videos where id=private.discovery_notification_uuid(p_id);
    if not found or not coalesce(private.discovery_notification_video_public(v),false) then return '{"eligible":false}'; end if;
    owner_id:=v.owner_id; audience:='public'; revision:=v.id::text;
    route:='/player/[id]'; entity:=v.id::text; title_text:='New public upload';
  elsif p_type='replay' then
    select * into x from public.creator_replay_library_items where id=private.discovery_notification_uuid(p_id);
    if not found or x.save_status<>'ready' or x.visibility not in ('public','circle')
      or x.moderation_status not in ('clean','reported') or x.money_status<>'free'
      or x.rights_status not in ('creator_owned','chillywood_original','licensed_for_public_stream')
      or x.playback_record_id is null then return '{"eligible":false}'; end if;
    select * into h from public.spectator_hls_playback_records where id=x.playback_record_id;
    if not found or h.requires_premium or h.requires_ticket or h.playback_status not in ('live','ended')
      or h.host_user_id is distinct from x.owner_user_id or h.visibility<>x.visibility
      or h.rights_status not in ('creator_owned','chillywood_original','licensed_for_public_stream')
      or not h.is_spectator_playback_enabled then return '{"eligible":false}'; end if;
    select * into b from public.room_broadcast_sessions where id=h.broadcast_session_id;
    if not found or x.broadcast_session_id is distinct from b.id or b.host_user_id is distinct from x.owner_user_id
      or b.requires_premium or b.requires_ticket
      or b.access_type not in ('public_free','circle')
      or b.rights_status not in ('creator_owned','chillywood_original','licensed_for_public_stream')
      or coalesce(b.hls_playback_url,'') !~ '^https://[^[:space:]]+\.m3u8($|[?#])'
    then return '{"eligible":false}'; end if;
    if not b.is_spectator_playback_enabled or (
      (x.visibility='public' and h.access_type='public_free' and h.is_publicly_watchable
        and b.access_type='public_free' and b.is_publicly_watchable
        and b.playback_url_status='public_safe_available' and b.metadata->>'d7f_public_safe_approved'='true')
      or (x.visibility='circle' and h.access_type='circle' and not h.is_publicly_watchable
        and b.access_type='circle' and not b.is_publicly_watchable
        and b.playback_url_status='circle_safe_available' and b.metadata->>'circle_spectator_approved'='true')
    ) is not true then return '{"eligible":false}'; end if;
    owner_id:=private.discovery_notification_uuid(x.owner_user_id); audience:=x.visibility;
    revision:=x.id::text||':'||x.playback_record_id::text;
    route:='/player/replay/[replayId]'; entity:=x.id::text; title_text:='Replay is ready';
  else return '{"eligible":false}'; end if;
  if owner_id is null or not exists(select 1 from auth.users where id=owner_id)
    or public.is_account_access_restricted(owner_id::text) then return '{"eligible":false}'; end if;
  return jsonb_build_object('eligible',true,'owner',owner_id,'audience',audience,'revision',revision,
    'target_route',route,'target_entity_id',entity,'title',title_text);
end $$;

create function private.discovery_notification_event_revision(e public.creator_events)
returns text language sql immutable set search_path='' as $$
  select md5(jsonb_build_array(e.host_user_id,e.event_title,e.event_type,e.visibility,e.status,
    e.starts_at,e.ends_at,e.reminder_ready)::text);
$$;

create function private.discovery_notification_event_visible(e public.creator_events,p_user uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare pass public.paid_creator_event_passes; identity jsonb;
begin
  if e.status='draft' then return false; end if;
  if e.visibility='public' then return true; end if;
  if e.visibility='circle' then return public.is_active_chilly_circle_member(e.host_user_id::text,p_user::text); end if;
  if e.visibility<>'private' then return false; end if;
  select * into pass from public.paid_creator_event_passes p
    where p.creator_event_id=e.id and p.creator_id=e.host_user_id and p.buyer_id=p_user
      and p.status='active' and p.revoked_at is null and p.refunded_at is null and p.access_grant_id is not null
      and (p.expires_at is null or p.expires_at>now()) order by p.created_at desc limit 1;
  if not found then return false; end if;
  begin
    identity:=public.creator_money_historical_purchase_identity_internal(p_user,'event_pass',e.id,pass.access_grant_id);
  exception when raise_exception then
    if sqlerrm='historical_purchase_identity_missing' then return false; end if;
    raise;
  end;
  return coalesce(private.discovery_notification_uuid(identity->>'accessGrantId')=pass.access_grant_id,false);
end;
$$;

create or replace function private.resolve_discovery_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb; e public.creator_events; reminder public.event_reminders;
  kind text:=p_event.event_kind; category text; preference text; body_text text;
begin
  if kind in ('followed_creator_live','circle_friend_live','public_upload','replay_later') then
    s:=private.discovery_notification_source(p_event.context->>'sourceType',p_event.source_id);
    if not coalesce((s->>'eligible')::boolean,false)
      or s->>'owner' is distinct from p_event.actor_user_id::text
      or s->>'revision' is distinct from p_event.context->>'revision'
      or s->>'audience' is distinct from p_event.context->>'audience'
    then return '{"eligible":false}'; end if;
    if kind='circle_friend_live' or (kind='replay_later' and s->>'audience'='circle') then
      if not public.is_active_chilly_circle_member(p_event.actor_user_id::text,p_event.recipient_user_id::text)
        then return '{"eligible":false}'; end if;
    elsif s->>'audience'<>'public' or not exists(select 1 from public.channel_followers f
      where f.channel_user_id=p_event.actor_user_id::text and f.follower_user_id=p_event.recipient_user_id::text)
    then return '{"eligible":false}'; end if;
    if (kind in ('followed_creator_live','circle_friend_live') and p_event.context->>'sourceType' not in ('live_stage','broadcast'))
      or (kind='public_upload' and p_event.context->>'sourceType'<>'video')
      or (kind='replay_later' and p_event.context->>'sourceType'<>'replay') then return '{"eligible":false}'; end if;
    category:=case when kind in ('public_upload','replay_later') then 'content_dropped' else 'creator_went_live' end;
    preference:=case kind when 'followed_creator_live' then 'followed_creator_live_enabled'
      when 'circle_friend_live' then 'circle_friend_live_enabled'
      when 'public_upload' then 'public_upload_enabled' else 'replay_later_enabled' end;
    body_text:=case kind when 'public_upload' then 'A creator you follow posted a public video.'
      when 'replay_later' then 'A replay is ready. Open it to check playback availability.'
      when 'circle_friend_live' then 'Someone in your Chi''lly Circle is live.' else 'A creator you follow is live.' end;
  elsif kind in ('event_starts_soon','watch_party_starts_soon','creator_event_updated','creator_event_canceled') then
    select * into e from public.creator_events where id=private.discovery_notification_uuid(p_event.source_id);
    if not found or e.host_user_id is distinct from p_event.actor_user_id
      or private.discovery_notification_event_revision(e) is distinct from p_event.context->>'revision'
      or not private.discovery_notification_event_visible(e,p_event.recipient_user_id)
    then return '{"eligible":false}'; end if;
    select * into reminder from public.event_reminders where event_id=e.id and user_id=p_event.recipient_user_id;
    if not found or reminder.status<>'active'
      or reminder.id::text is distinct from p_event.context->>'reminderId'
      or reminder.updated_at::text is distinct from p_event.context->>'reminderRevision'
    then return '{"eligible":false}'; end if;
    if kind in ('event_starts_soon','watch_party_starts_soon') then
      if e.status<>'scheduled' or not e.reminder_ready or e.starts_at is null
        or e.starts_at<=now() or e.starts_at>now()+interval '15 minutes'
      then return '{"eligible":false}'; end if;
      category:='upcoming_event_reminder'; preference:='event_starts_soon_enabled';
      body_text:='An event you saved starts soon.';
    elsif kind='creator_event_canceled' then
      if e.status<>'canceled' then return '{"eligible":false}'; end if;
      category:='social_activity'; preference:='event_updates_enabled'; body_text:='An event you saved was canceled.';
    else
      if e.status not in ('scheduled','live_now') then return '{"eligible":false}'; end if;
      category:='social_activity'; preference:='event_updates_enabled'; body_text:='An event you saved has changed.';
    end if;
    s:=jsonb_build_object('target_route','/event/[eventId]','target_entity_id',e.id::text,
      'title',case kind when 'creator_event_canceled' then 'Event canceled'
        when 'creator_event_updated' then 'Event updated' else 'Event starts soon' end);
  else return '{"eligible":false}'; end if;
  return jsonb_build_object('eligible',true,'category',category,'notification_type',kind,
    'title',s->>'title','body',body_text,'target_route',s->>'target_route',
    'target_entity_id',s->>'target_entity_id','target_context','{}'::jsonb,'preference_key',preference);
end $$;

create function private.enqueue_discovery_notification_source(p_type text,p_id text)
returns void language plpgsql security definer set search_path='' as $$
declare s jsonb:=private.discovery_notification_source(p_type,p_id); owner_id uuid; who record; kind text;
begin
  if not coalesce((s->>'eligible')::boolean,false) then return; end if;
  owner_id:=private.discovery_notification_uuid(s->>'owner');
  for who in with candidates as (
    select f.follower_user_id as user_id from public.channel_followers f
      where s->>'audience'='public' and f.channel_user_id=owner_id::text
    union
    select case when f.user_low_id=owner_id::text then f.user_high_id else f.user_low_id end
      from public.user_friendships f where f.status='active'
        and (f.user_low_id=owner_id::text or f.user_high_id=owner_id::text)
        and (p_type in ('live_stage','broadcast') or s->>'audience'='circle')
  )
    select u.id,public.is_active_chilly_circle_member(owner_id::text,u.id::text) as friend
    from candidates c join auth.users u on u.id=private.discovery_notification_uuid(c.user_id)
    where u.id<>owner_id
  loop
    kind:=case when p_type='video' then 'public_upload' when p_type='replay' then 'replay_later'
      when who.friend then 'circle_friend_live' else 'followed_creator_live' end;
    perform private.enqueue_notification_activity('discovery:'||p_type||':'||p_id||':'||kind||':'
      ||md5(s->>'revision')||':'||who.id::text,kind,p_id,owner_id,who.id,
      jsonb_build_object('sourceType',p_type,'revision',s->>'revision','audience',s->>'audience'),
      now(),now()+case when p_type in ('live_stage','broadcast') then interval '10 minutes' else interval '24 hours' end);
  end loop;
end $$;

create function private.enqueue_discovery_event_reminder(p_reminder public.event_reminders,p_changed boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare e public.creator_events; revision text; kind text; context jsonb;
begin
  if p_reminder.status<>'active' then return; end if;
  select * into e from public.creator_events where id=p_reminder.event_id;
  if not found or not private.discovery_notification_event_visible(e,p_reminder.user_id) then return; end if;
  revision:=private.discovery_notification_event_revision(e);
  context:=jsonb_build_object('revision',revision,'reminderId',p_reminder.id,
    'reminderRevision',p_reminder.updated_at::text);
  if e.status='scheduled' and e.reminder_ready and e.starts_at>now() then
    kind:=case when e.event_type in ('live_watch_party','watch_party_live') then 'watch_party_starts_soon' else 'event_starts_soon' end;
    perform private.enqueue_notification_activity('discovery:event:'||e.id||':'||kind||':'||revision||':'
      ||md5(p_reminder.updated_at::text)||':'||p_reminder.user_id,kind,e.id::text,e.host_user_id,p_reminder.user_id,
      context,greatest(now(),e.starts_at-interval '15 minutes'),e.starts_at);
  end if;
  if p_changed and e.status in ('scheduled','live_now','canceled') then
    kind:=case when e.status='canceled' then 'creator_event_canceled' else 'creator_event_updated' end;
    perform private.enqueue_notification_activity('discovery:event:'||e.id||':'||kind||':'||revision||':'
      ||md5(p_reminder.updated_at::text)||':'||p_reminder.user_id,kind,e.id::text,e.host_user_id,p_reminder.user_id,
      context,now(),now()+interval '24 hours');
  end if;
end $$;

create function private.enqueue_discovery_notification_transition()
returns trigger language plpgsql security definer set search_path='' as $$
declare reminder public.event_reminders;
begin
  if tg_table_name='watch_party_rooms' then
    if tg_op='INSERT' or (new.is_active,new.discovery_started_at,new.discovery_visibility)
      is distinct from (old.is_active,old.discovery_started_at,old.discovery_visibility) then
      perform private.enqueue_discovery_notification_source('live_stage',new.party_id); end if;
  elsif tg_table_name='room_broadcast_sessions' then
    if tg_op='INSERT' or (to_jsonb(new)-'updated_at'-'last_health_checked_at')
      is distinct from (to_jsonb(old)-'updated_at'-'last_health_checked_at') then
      perform private.enqueue_discovery_notification_source('broadcast',new.id::text); end if;
  elsif tg_table_name='spectator_hls_playback_records' then
    if tg_op='INSERT' or (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
      perform private.enqueue_discovery_notification_source('broadcast',new.broadcast_session_id::text); end if;
  elsif tg_table_name='videos' then
    if tg_op='INSERT' or not coalesce(private.discovery_notification_video_public(old),false) then
      perform private.enqueue_discovery_notification_source('video',new.id::text); end if;
  elsif tg_table_name='creator_replay_library_items' then
    if tg_op='INSERT' or (new.save_status,new.visibility,new.playback_record_id,new.rights_status,new.moderation_status,new.money_status)
      is distinct from (old.save_status,old.visibility,old.playback_record_id,old.rights_status,old.moderation_status,old.money_status) then
      perform private.enqueue_discovery_notification_source('replay',new.id::text); end if;
  elsif tg_table_name='event_reminders' then
    if tg_op='INSERT' or (new.status,new.event_id,new.user_id) is distinct from (old.status,old.event_id,old.user_id) then
      perform private.enqueue_discovery_event_reminder(new); end if;
  elsif tg_table_name='creator_events' then
    if tg_op='UPDATE' and private.discovery_notification_event_revision(new)
      is distinct from private.discovery_notification_event_revision(old) then
      for reminder in select * from public.event_reminders where event_id=new.id and status='active' loop
        perform private.enqueue_discovery_event_reminder(reminder,old.status in ('scheduled','live_now'));
      end loop;
    end if;
  end if;
  return new;
end $$;

revoke all on function private.discovery_notification_uuid(text),
  private.discovery_notification_video_public(public.videos),private.discovery_notification_source(text,text),
  private.discovery_notification_event_revision(public.creator_events),
  private.discovery_notification_event_visible(public.creator_events,uuid),
  private.resolve_discovery_notification_activity(public.notification_activity_events),
  private.enqueue_discovery_notification_source(text,text),
  private.enqueue_discovery_event_reminder(public.event_reminders,boolean),
  private.enqueue_discovery_notification_transition() from public,anon,authenticated,service_role;

create trigger notification_discovery_after_write after insert or update on public.watch_party_rooms
  for each row execute function private.enqueue_discovery_notification_transition();
create trigger notification_discovery_after_write after insert or update on public.room_broadcast_sessions
  for each row execute function private.enqueue_discovery_notification_transition();
create trigger notification_discovery_after_write after insert or update on public.spectator_hls_playback_records
  for each row execute function private.enqueue_discovery_notification_transition();
create trigger notification_discovery_after_write after insert or update on public.videos
  for each row execute function private.enqueue_discovery_notification_transition();
create trigger notification_discovery_after_write after insert or update on public.creator_replay_library_items
  for each row execute function private.enqueue_discovery_notification_transition();
create trigger notification_discovery_after_write after insert or update on public.creator_events
  for each row execute function private.enqueue_discovery_notification_transition();
create trigger notification_discovery_after_write after insert or update on public.event_reminders
  for each row execute function private.enqueue_discovery_notification_transition();
