-- Opaque correlation is not identity or access. Both reads retain exact current
-- recipient/session and the existing canonical live visibility predicate.
-- Membership/ordinary Live access is not a paid Live Stage access pass. Reuse
-- the same pure explicit-subject money reader as media admission, without
-- impersonating a service caller or changing any caller-bound room helper.
alter function private.live_room_join_recipient_allowed(public.watch_party_rooms,uuid,uuid)
  rename to live_room_join_recipient_pre_paid_stage;
create function private.live_room_join_recipient_allowed(r public.watch_party_rooms,p_actor uuid,p_recipient uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  return private.live_room_join_recipient_pre_paid_stage(r,p_actor,p_recipient)
    and (r.room_type<>'live' or p_recipient=r.host_user_id
      or coalesce((public.resolve_live_watch_party_money_access_as_service_internal(r.party_id,p_recipient)->>'allowed')::boolean,false));
end $$;
revoke all on function private.live_room_join_recipient_pre_paid_stage(public.watch_party_rooms,uuid,uuid),
  private.live_room_join_recipient_allowed(public.watch_party_rooms,uuid,uuid) from public,anon,authenticated,service_role;
alter function private.room_attendance_source_access_current(public.watch_party_rooms,uuid)
  rename to room_attendance_source_access_pre_paid_stage;
create function private.room_attendance_source_access_current(r public.watch_party_rooms,p_viewer uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  return private.room_attendance_source_access_pre_paid_stage(r,p_viewer)
    and (r.room_type<>'live' or p_viewer=r.host_user_id
      or coalesce((public.resolve_live_watch_party_money_access_as_service_internal(r.party_id,p_viewer)->>'allowed')::boolean,false));
end $$;
revoke all on function private.room_attendance_source_access_pre_paid_stage(public.watch_party_rooms,uuid),
  private.room_attendance_source_access_current(public.watch_party_rooms,uuid) from public,anon,authenticated,service_role;

-- Receipt withdrawal is terminal for this materialization, not a perpetual
-- private subscription. Rejoining or re-enabling a preference cannot revive an
-- old attendance row after its correlation receipt has been retired. Historical
-- audit rows remain stored; ordinary previously-public ended Live history is
-- unaffected. No legacy attendance subscription is backfilled during rollout.
alter function private.live_notification_read_context(uuid,uuid) rename to live_notification_read_context_pre_hint_receipts;
create function private.live_notification_read_context(p_notification_id uuid,p_viewer uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  result:=private.live_notification_read_context_pre_hint_receipts(p_notification_id,p_viewer);
  if result->>'allowed'='true' and exists(select 1 from public.notifications n where n.id=p_notification_id
      and n.user_id=p_viewer and n.notification_type='live_room_member_joined')
    and not exists(select 1 from private.room_attendance_hint_receipts s
      join public.notification_activity_events e on e.id=s.event_id and e.notification_id=s.notification_id
      where s.notification_id=p_notification_id and s.recipient_user_id=p_viewer
        and e.recipient_user_id=p_viewer and e.actor_user_id=s.actor_user_id and e.source_id=s.party_id
        and e.context->>'generation'=s.generation::text and e.context->>'hostId'=s.host_user_id::text)
    then return '{}'; end if;
  return result;
end $$;
revoke all on function private.live_notification_read_context_pre_hint_receipts(uuid,uuid),
  private.live_notification_read_context(uuid,uuid) from public,anon,authenticated,service_role;

alter function public.read_my_notification_display_context(uuid[]) rename to read_my_notification_display_context_pre_discovery_keys;
create function public.read_my_notification_display_context(p_notification_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;item jsonb;items jsonb:='[]';k uuid;
begin
  result:=public.read_my_notification_display_context_pre_discovery_keys(p_notification_ids);
  for item in select value from jsonb_array_elements(result->'items') loop
    if item->>'notificationType' in ('followed_creator_live','circle_friend_live','live_room_member_joined')
      and item->>'resolution'='resolved' and item->>'liveState' in ('live','ended') then
      k:=private.notification_discovery_hint_key(private.discovery_notification_uuid(item->>'notificationId'),auth.uid());
      item:=item||jsonb_build_object('discoveryHintKey',k);
    end if;
    items:=items||jsonb_build_array(item);
  end loop;
  return result||jsonb_build_object('items',items);
end $$;
revoke all on function public.read_my_notification_display_context_pre_discovery_keys(uuid[]),
  public.read_my_notification_display_context(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.read_my_notification_display_context(uuid[]) to authenticated;

-- Unlike a finite recently-loaded page, this footprint covers every currently
-- visible undismissed live notice. The response is bounded, with an explicit
-- Counts and keys use ONE SQL snapshot; parallel count/footprint requests could
-- otherwise cross a new-notice then Off transition and miss its former key.
-- The bounded response has an incomplete result on overflow/missing legacy keys: callers must then mask an
-- uncertain badge, not infer that an unknown key cannot affect its count.
create function public.read_my_live_notification_hint_footprint()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.whole_app_exact_current_session_authority_internal()
    then raise exception 'notification_current_session_required'; end if;
  with visible as materialized (
    select n.id,n.notification_type,n.read_at,n.dismissed_at from public.notifications n where n.user_id=auth.uid()
      and (n.notification_type not in ('followed_creator_live','circle_friend_live','live_room_member_joined')
        or coalesce((private.live_notification_read_context(n.id,auth.uid())->>'allowed')::boolean,false))
  ), bound as materialized (
    select private.notification_discovery_hint_key(n.id,auth.uid()) k
    from visible n where n.dismissed_at is null
      and n.notification_type in ('followed_creator_live','circle_friend_live','live_room_member_joined')
  ), keys as materialized (select distinct k from bound where k is not null order by k limit 257)
  select jsonb_build_object('schemaVersion',1,'subjectUserId',auth.uid(),
    'totalCount',(select count(*) from visible),
    'unreadCount',(select count(*) from visible where read_at is null and dismissed_at is null),
    'undismissedCount',(select count(*) from visible where dismissed_at is null),
    'hasLiveActivity',exists(select 1 from bound),
    'keys',coalesce((select jsonb_agg(k order by k) from (select k from keys order by k limit 256) x),'[]'::jsonb),
    'complete',not exists(select 1 from bound where k is null) and (select count(*)<=256 from keys)) into result;
  return result;
end $$;
revoke all on function public.read_my_live_notification_hint_footprint() from public,anon,authenticated,service_role;
grant execute on function public.read_my_live_notification_hint_footprint() to authenticated;

-- A personal attendance preference is not public room activity. Withdraw only
-- this exact recipient+actor's already materialized receipts; never refresh a
-- host projection, fan out to peers, or resurrect historical subscriptions.
create function private.withdraw_person_attendance_hint_receipts()
returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb;after_row jsonb;receipt record;collecting boolean;
begin
  select coalesce(c.collecting,false) into collecting from private.discovery_invalidation_worker_config c where singleton;
  before_row:=case when tg_op<>'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  after_row:=case when tg_op<>'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  perform private.lock_discovery_hint_hosts(array(
    select value from unnest(array[before_row->>'user_id',before_row->>'actor_user_id',after_row->>'user_id',after_row->>'actor_user_id']) value
    union select s.host_user_id::text from private.room_attendance_hint_receipts s where
      (s.recipient_user_id::text=before_row->>'user_id' and s.actor_user_id::text=before_row->>'actor_user_id')
      or (s.recipient_user_id::text=after_row->>'user_id' and s.actor_user_id::text=after_row->>'actor_user_id')));
  for receipt in select s.* from private.room_attendance_hint_receipts s
    join public.notification_activity_events e on e.id=s.event_id
    where ((s.recipient_user_id::text=before_row->>'user_id' and s.actor_user_id::text=before_row->>'actor_user_id')
      or (s.recipient_user_id::text=after_row->>'user_id' and s.actor_user_id::text=after_row->>'actor_user_id'))
      and not private.room_attendance_receipt_current(e)
  loop
    if coalesce(collecting,false) then
      insert into private.discovery_invalidation_outbox(topic,source_id,source_table,hint_keys)
        values('discovery:v1:viewer:'||receipt.recipient_user_id,receipt.event_id,'notification_activity_events',array[receipt.discovery_hint_key]);
    end if;
    -- Pausing transport cannot preserve revoked authority for later revival.
    delete from private.room_attendance_hint_receipts where notification_id=receipt.notification_id;
  end loop;
  return null;
end $$;
revoke all on function private.withdraw_person_attendance_hint_receipts() from public,anon,authenticated,service_role;
create constraint trigger person_attendance_preference_after_change
  after insert or update of joined_live_enabled or delete on public.person_notification_preferences
  deferrable initially deferred for each row execute function private.withdraw_person_attendance_hint_receipts();
