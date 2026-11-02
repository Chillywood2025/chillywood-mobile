-- Connected-view primary delivery is transactional Broadcast, not the 10-second
-- scheduled retry worker. No credential, scheduler or provider setting change.
alter table private.discovery_invalidation_worker_config
  add column primary_delivery_enabled boolean not null default true;
alter table private.discovery_invalidation_outbox
  add column source_transaction bigint not null default txid_current();
create index discovery_invalidation_transaction_topic_idx
  on private.discovery_invalidation_outbox(source_transaction,topic) where status='complete';
alter table private.discovery_invalidation_outbox drop constraint discovery_invalidation_outbox_topic_check;
alter table private.discovery_invalidation_outbox add constraint discovery_invalidation_outbox_topic_check
  check(topic ~ '^discovery:v1:(surface:(home|profile|channel)|(creator|viewer):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
alter table private.discovery_invalidation_outbox drop constraint discovery_invalidation_outbox_source_table_check;
alter table private.discovery_invalidation_outbox add constraint discovery_invalidation_outbox_source_table_check
  check(source_table in ('discovery_feed_items','creator_events','circle_spectator_feed_items','notification_activity_events'));

-- Current session is a reader boundary, not a service fanout-recipient gate.
create function public.discovery_reader_session_current()
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.whole_app_exact_current_session_authority_internal() and public.wave1_current_caller_authority_internal();
$$;
revoke all on function public.discovery_reader_session_current() from public,anon,authenticated,service_role;
grant execute on function public.discovery_reader_session_current() to authenticated;
create policy party_room_current_session_public on public.discovery_feed_items as restrictive
  for select to authenticated using(source_type<>'party_room' or public.discovery_reader_session_current());
create policy party_room_current_session_circle on public.circle_spectator_feed_items as restrictive
  for select to authenticated using(source_type<>'party_room' or public.discovery_reader_session_current());

create or replace function public.can_receive_discovery_invalidation(p_topic text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and public.whole_app_exact_current_session_authority_internal()
    and public.wave1_current_caller_authority_internal()
    and exists(select 1 from auth.users where id=auth.uid() and not coalesce(is_anonymous,false) and deleted_at is null)
    and not public.is_account_access_restricted(auth.uid()::text)
    and (p_topic='discovery:v1:viewer:'||auth.uid()::text
      or p_topic ~ '^discovery:v1:(surface:(home|profile|channel)|creator:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
$$;
revoke all on function public.can_receive_discovery_invalidation(text) from public,anon,service_role;
grant execute on function public.can_receive_discovery_invalidation(text) to authenticated;

create function private.deliver_discovery_primary_hint()
returns trigger language plpgsql security definer set search_path='' as $$
declare delivery uuid; before_send timestamp; after_send timestamp; confirmed boolean;
begin
  if new.available_at>clock_timestamp() or new.status<>'pending' or not exists(
    select 1 from private.discovery_invalidation_worker_config
      where singleton and collecting and enabled and primary_delivery_enabled) then return null; end if;
  -- One opaque hint per topic per source transaction. All writes are visible
  -- together at commit; the client reconciles canonical RLS, never this payload.
  if exists(select 1 from private.discovery_invalidation_outbox o where o.id<>new.id
    and o.source_transaction=new.source_transaction and o.topic=new.topic and o.status='complete') then
    update private.discovery_invalidation_outbox set status='complete',completed_at=clock_timestamp() where id=new.id;
    return null;
  end if;
  begin
    delivery:=gen_random_uuid(); before_send:=timezone('utc',clock_timestamp());
    perform realtime.send(jsonb_build_object('id',delivery),'discovery:invalidate',new.topic,true);
    after_send:=timezone('utc',clock_timestamp());
    -- Managed send can swallow errors. Verify the exact durable insertion;
    -- source commit and receipt insertion roll back together, never fake success.
    with candidates as materialized (
      select payload,event from realtime.messages where extension='broadcast' and private is true
        and topic=new.topic and inserted_at>=before_send and inserted_at<=after_send
      order by inserted_at desc limit 1001
    ) select count(*)<=1000 and coalesce(bool_or(event='discovery:invalidate'
      and payload=jsonb_build_object('id',delivery)),false) into confirmed from candidates;
    if not confirmed then raise exception 'discovery_primary_insert_unconfirmed'; end if;
    update private.discovery_invalidation_outbox set status='complete',completed_at=clock_timestamp(),last_error_code=null where id=new.id;
  exception when others then
    -- Failure is a durable pending retry, not a failed host privacy operation.
    -- The existing credentialed worker and bounded backoff remain the fallback.
    update private.discovery_invalidation_outbox set attempts=1,last_error_code=sqlstate where id=new.id;
  end;
  return null;
end $$;
revoke all on function private.deliver_discovery_primary_hint() from public,anon,authenticated,service_role;
create trigger discovery_primary_hint_after_enqueue after insert on private.discovery_invalidation_outbox
  for each row execute function private.deliver_discovery_primary_hint();

-- This is withdrawal bookkeeping, NOT an access grant. It records who was
-- authorized to receive a previous Circle revision so narrowing can reconcile
-- those connected views without revealing any new private-room existence.
create table private.circle_discovery_hint_recipients (
  -- No reverse parent-row FK locks in source/relationship authority paths.
  -- Explicit deletion hooks retire bookkeeping; these rows grant no access.
  item_id uuid not null,
  host_user_id uuid not null,
  recipient_user_id uuid not null,
  primary key(item_id,recipient_user_id)
);
create index circle_discovery_hint_host_recipient_idx
  on private.circle_discovery_hint_recipients(host_user_id,recipient_user_id);
alter table private.circle_discovery_hint_recipients enable row level security;
alter table private.circle_discovery_hint_recipients force row level security;
revoke all on private.circle_discovery_hint_recipients from public,anon,authenticated,service_role;

create function private.lock_discovery_hint_hosts(p_hosts text[])
returns void language plpgsql security definer set search_path='' as $$
declare host_text text;
begin
  for host_text in select distinct h from unnest(p_hosts) h
    where h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' order by h
  loop perform pg_advisory_xact_lock(190731,hashtext(host_text)); end loop;
end $$;
revoke all on function private.lock_discovery_hint_hosts(text[]) from public,anon,authenticated,service_role;

create function private.current_circle_discovery_hint_recipients(p_item uuid)
returns table(host_user_id uuid,recipient_user_id uuid)
language plpgsql security definer set search_path='' as $$
declare d public.circle_spectator_feed_items; r public.watch_party_rooms;
begin
  select * into d from public.circle_spectator_feed_items where id=p_item;
  if not found or d.source_type not in ('party_room','live_stage_room') or d.status<>'active'
    or d.visibility<>'circle' or d.moderation_status<>'clean' or d.live_state<>'live'
    or d.ended_at is not null or d.metadata->>'canonical_projection_active' is distinct from 'true' then return; end if;
  select * into r from public.watch_party_rooms where party_id=d.source_id;
  if not found or not r.is_active or r.discovery_visibility<>'circle'
    or not private.room_host_discovery_consented(r)
    or (d.source_type='party_room' and (r.room_type<>'title' or not private.party_room_publication_current(r.party_id)))
    or (d.source_type='live_stage_room' and (r.room_type<>'live' or not private.live_stage_publication_current(r.party_id))) then return; end if;
  -- The caller serializes the host snapshot before this fresh authority read.
  -- Never lock all friendship rows from an AFTER relationship trigger: two
  -- different row mutations would otherwise form a row-lock cycle.
  return query with candidates as (
    select r.host_user_id recipient
    union select case when f.user_low_id=r.host_user_id::text then f.user_high_id else f.user_low_id end::uuid
      from public.user_friendships f where f.status='active' and r.host_user_id::text in(f.user_low_id,f.user_high_id)
  ) select r.host_user_id,c.recipient from candidates c join auth.users u on u.id=c.recipient
    where not coalesce(u.is_anonymous,false) and u.deleted_at is null
      and not public.is_account_access_restricted(c.recipient::text)
      and not public.has_channel_audience_block_between(r.host_user_id::text,c.recipient::text)
      and (d.source_type<>'party_room' or private.party_room_metadata_allowed(r.party_id,c.recipient,'circle'))
      and (c.recipient=r.host_user_id or public.is_active_chilly_circle_member(r.host_user_id::text,c.recipient::text));
end $$;
revoke all on function private.current_circle_discovery_hint_recipients(uuid) from public,anon,authenticated,service_role;

create function private.reconcile_circle_discovery_hints(p_item uuid)
returns void language plpgsql security definer set search_path='' as $$
declare recipients uuid[]; host_id uuid;
begin
  if not exists(select 1 from private.discovery_invalidation_worker_config where singleton and collecting) then return; end if;
  perform private.lock_discovery_hint_hosts(array(
    select host_user_id::text from private.circle_discovery_hint_recipients where item_id=p_item
    union select coalesce(host_user_id,creator_user_id) from public.circle_spectator_feed_items where id=p_item));
  select array_agg(x.recipient_user_id),min(x.host_user_id::text)::uuid into recipients,host_id
    from private.current_circle_discovery_hint_recipients(p_item) x;
  recipients:=coalesce(recipients,array[]::uuid[]);
  -- Full exact audience, not a truncated first page or broad private-change
  -- topic. Transaction-level dedupe bounds repeated writes for each recipient.
  insert into private.discovery_invalidation_outbox(topic,source_id,source_table)
    select 'discovery:v1:viewer:'||recipient,p_item,'circle_spectator_feed_items' from (
      select recipient_user_id recipient from private.circle_discovery_hint_recipients where item_id=p_item
      union select unnest(recipients)
    ) targets;
  delete from private.circle_discovery_hint_recipients where item_id=p_item;
  if host_id is not null then
    insert into private.circle_discovery_hint_recipients(item_id,host_user_id,recipient_user_id)
      select p_item,host_id,unnest(recipients);
  end if;
end $$;
revoke all on function private.reconcile_circle_discovery_hints(uuid) from public,anon,authenticated,service_role;

create function private.circle_discovery_hint_after_write()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (to_jsonb(old)-'updated_at')=(to_jsonb(new)-'updated_at') then return null; end if;
  perform private.reconcile_circle_discovery_hints(new.id); return null;
end $$;
revoke all on function private.circle_discovery_hint_after_write() from public,anon,authenticated,service_role;
create trigger circle_discovery_primary_after_write after insert or update on public.circle_spectator_feed_items
  for each row execute function private.circle_discovery_hint_after_write();
create function private.circle_discovery_hint_before_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_discovery_hint_hosts(array[old.host_user_id,old.creator_user_id]);
  if exists(select 1 from private.discovery_invalidation_worker_config where singleton and collecting) then
    insert into private.discovery_invalidation_outbox(topic,source_id,source_table)
      select 'discovery:v1:viewer:'||recipient_user_id,old.id,'circle_spectator_feed_items'
      from private.circle_discovery_hint_recipients where item_id=old.id;
  end if;
  delete from private.circle_discovery_hint_recipients where item_id=old.id;
  return old;
end $$;
revoke all on function private.circle_discovery_hint_before_delete() from public,anon,authenticated,service_role;
create trigger circle_discovery_primary_before_delete before delete on public.circle_spectator_feed_items
  for each row execute function private.circle_discovery_hint_before_delete();

create table private.room_attendance_hint_receipts (
  notification_id uuid primary key references public.notifications(id) on delete cascade,
  event_id uuid not null,
  party_id text not null,
  generation uuid not null,
  host_user_id uuid not null,
  actor_user_id uuid not null,
  recipient_user_id uuid not null
);
create index room_attendance_hint_party on private.room_attendance_hint_receipts(party_id);
create index room_attendance_hint_host on private.room_attendance_hint_receipts(host_user_id);
create index room_attendance_hint_actor on private.room_attendance_hint_receipts(actor_user_id);
create index room_attendance_hint_recipient on private.room_attendance_hint_receipts(recipient_user_id);
alter table private.room_attendance_hint_receipts enable row level security;
alter table private.room_attendance_hint_receipts force row level security;
revoke all on private.room_attendance_hint_receipts from public,anon,authenticated,service_role;
-- Target-only admission read for receipt retirement. The public room helper
-- is deliberately caller-bound and MUST NOT be invoked as another viewer from
-- an authenticated relationship/member trigger. This copies its nonhost domain
-- predicates, not its caller privilege, and grants neither room nor API access.
create function private.room_attendance_source_access_current(r public.watch_party_rooms,p_viewer uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare paid_required boolean; claim private.creator_room_seat_claims;
begin
  if p_viewer is null or p_viewer=r.host_user_id or not r.is_active
    or not exists(select 1 from auth.users where id=p_viewer and deleted_at is null)
    or not exists(select 1 from auth.users where id=r.host_user_id and deleted_at is null)
    or public.is_account_access_restricted(p_viewer::text)
    or public.is_account_access_restricted(r.host_user_id::text)
    or public.has_channel_audience_block_between(r.host_user_id::text,p_viewer::text) then return false; end if;
  claim:=private.creator_room_paid_seat_claim(r.party_id,p_viewer);
  if claim.id is not null then return true; end if;
  select exists(select 1 from public.paid_watch_party_offers o where o.party_id=r.party_id
    and o.status in('sandbox','active','paused','sold_out','blocked')) into paid_required;
  -- Ordinary Live admission remains independent of creator-money eligibility
  -- and of the entry lock, exactly as the existing Live-decoupled resolver.
  if not paid_required and r.room_type='live' then
    return r.content_access_rule='open' or (r.content_access_rule in('party_pass','premium')
      and public.premium_subject_has_finite_authority_internal(p_viewer::text));
  end if;
  if r.join_policy<>'open' then return false; end if;
  if not paid_required and r.content_access_rule='open' then return true; end if;
  if not paid_required and r.content_access_rule in('party_pass','premium') and exists(
    select 1 from public.user_entitlements e where e.user_id=p_viewer::text and e.entitlement_key='premium'
      and e.status in('active','trialing','grace_period') and e.revoked_at is null
      and public.premium_subject_has_finite_authority_internal(p_viewer::text)) then return true; end if;
  -- Same exact ticket/provider/intent/transaction binding as the current room
  -- admission domain. A status-only ticket or historical materialization is
  -- never current payment evidence.
  return exists (
    select 1 from public.access_grants g
    join public.paid_watch_party_offers o on o.id=g.source_id and o.party_id=r.party_id
      and o.creator_id=r.host_user_id and o.host_id=r.host_user_id
    join public.monetization_products p on p.id=g.product_id and p.product_type='watch_party_live_ticket'
    join public.provider_events pe on pe.id=g.provider_event_id
      and pe.provider in('revenuecat_app_store','revenuecat_google_play') and pe.provider=g.provider
      and pe.product_id=g.product_id and pe.environment=g.environment and pe.status='processed' and pe.user_id=p_viewer
      and not public.revenuecat_authority_quarantined_internal(pe.provider,pe.user_id,pe.environment)
    join public.money_purchase_intents i on i.id::text=g.metadata->>'purchase_intent_id'
      and i.id::text=pe.metadata->>'purchase_intent_id' and i.user_id=p_viewer and i.product_id=g.product_id
      and i.product_key=p.product_key and i.product_type='watch_party_live_ticket' and i.source_type='watch_party_live'
      and i.environment=g.environment and i.consumed_at is not null and i.revoked_at is null
      and i.amount_minor=o.price_cents and lower(i.currency)=lower(o.currency) and i.source_id=o.id
      and i.creator_id=o.creator_id and i.provider=pe.provider
      and i.provider_product_id=pe.metadata->>'provider_product_id' and i.status='consumed'
    join public.revenuecat_consumable_transaction_intents x on x.purchase_intent_id=i.id and x.provider=pe.provider
      and x.original_transaction_id=g.metadata->>'original_transaction_id'
      and x.original_transaction_id=pe.metadata->>'original_transaction_id'
      and nullif(btrim(x.original_transaction_id),'') is not null and x.user_id=g.user_id and x.product_id=g.product_id
      and x.provider_event_id=pe.id and x.binding_state='exact' and not x.terminal
    join public.paid_watch_party_tickets t on t.access_grant_id=g.id and t.offer_id=o.id and t.party_id=o.party_id
      and t.buyer_id=g.user_id and t.creator_id=o.creator_id and t.host_id=o.host_id and t.provider=g.provider
      and t.provider_transaction_id=pe.provider_event_id and t.metadata->'viewer_access_only'='true'::jsonb
      and coalesce(t.metadata->'grants_livekit_publish','false'::jsonb)='false'::jsonb
      and coalesce(t.metadata->'grants_host_authority','false'::jsonb)='false'::jsonb
      and t.status='active' and t.refunded_at is null and t.revoked_at is null
      and (t.expires_at is null or t.expires_at>now())
    where g.user_id=p_viewer and g.grant_type='watch_party_live_ticket' and g.source_type='provider_event'
      and g.environment in('sandbox','production') and g.status in('active','sandbox_only')
      and g.starts_at<=now() and (g.expires_at is null or g.expires_at>now()) and g.refunded_at is null and g.revoked_at is null
      and o.status in('sandbox','active','sold_out') and (o.starts_at is null or o.starts_at<=now())
      and (o.ends_at is null or o.ends_at>now()) and coalesce((g.metadata->>'viewer_access_only')::boolean,false)
      and not coalesce((g.metadata->>'authority_granted')::boolean,false)
      and not coalesce((g.metadata->>'speaker_authority')::boolean,false)
      and not coalesce((g.metadata->>'moderator_authority')::boolean,false)
      and not coalesce((g.metadata->>'payout_access')::boolean,false)
      and not coalesce((g.metadata->>'premium_unlock')::boolean,false)
      and public.wave1_creator_money_subject_authorized_internal(o.creator_id));
end $$;
revoke all on function private.room_attendance_source_access_current(public.watch_party_rooms,uuid) from public,anon,authenticated,service_role;

create function private.room_attendance_receipt_current(e public.notification_activity_events)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms; publication jsonb; source jsonb;
begin
  if e.event_kind<>'live_room_member_joined' or e.materialized_at is null or e.notification_id is null
    or e.actor_user_id=e.recipient_user_id or e.recipient_user_id is null
    or not exists(select 1 from auth.users where id=e.actor_user_id and deleted_at is null)
    or not exists(select 1 from auth.users where id=e.recipient_user_id and deleted_at is null)
    or public.is_account_access_restricted(e.actor_user_id::text)
    or public.account_deletion_public_hidden_reason(e.actor_user_id::text) is not null
    or public.is_account_access_restricted(e.recipient_user_id::text) then return false; end if;
  select * into r from public.watch_party_rooms where party_id=e.source_id;
  select jsonb_build_array(p.publication_id,p.started_at,p.retired_at) into publication
    from (select 1) singleton left join private.party_room_discovery_publications p on p.party_id=r.party_id;
  if r.party_id is null or not r.is_active or r.notification_join_generation::text is distinct from e.context->>'generation'
    or not exists(select 1 from auth.users where id=r.host_user_id and deleted_at is null)
    or r.host_user_id::text is distinct from e.context->>'hostId' or publication is distinct from e.context->'publication'
    or public.is_account_access_restricted(r.host_user_id::text)
    or public.account_deletion_public_hidden_reason(r.host_user_id::text) is not null
    or public.has_channel_audience_block_between(e.actor_user_id::text,e.recipient_user_id::text)
    or public.has_channel_audience_block_between(r.host_user_id::text,e.recipient_user_id::text)
    or not exists(select 1 from public.person_notification_preferences p where p.user_id=e.recipient_user_id
      and p.actor_user_id=e.actor_user_id and p.joined_live_enabled)
    or not exists(select 1 from public.watch_party_room_memberships h where h.party_id=r.party_id
      and h.user_id=r.host_user_id::text and h.membership_state='active' and h.left_at is null
      and h.last_seen_at>now()-interval '45 seconds')
    or not exists(select 1 from public.notifications n where n.id=e.notification_id and n.user_id=e.recipient_user_id
      and n.actor_user_id=e.actor_user_id and n.source_type='notification_activity' and n.source_id=e.id::text
      and n.notification_type=e.event_kind and n.target_entity_id=r.party_id and n.dismissed_at is null
      and n.target_route=case when r.room_type='live' then '/watch-party/live-stage/[partyId]' else '/watch-party/[partyId]' end)
    then return false; end if;
  if e.recipient_user_id=r.host_user_id then return true; end if;
  if not public.is_active_chilly_circle_member(e.actor_user_id::text,e.recipient_user_id::text)
    or not private.social_notification_profile_allowed(e.actor_user_id::text,e.recipient_user_id)
    or not private.room_attendance_source_access_current(r,e.recipient_user_id)
    or not private.party_room_viewer_source_allowed(r,e.recipient_user_id)
    or ((r.join_policy<>'open' or r.discovery_visibility='private') and not exists(
      select 1 from public.watch_party_room_memberships m where m.party_id=r.party_id and m.user_id=e.recipient_user_id::text
        and m.membership_state='active' and m.left_at is null and m.last_seen_at>now()-interval '45 seconds'))
    then return false; end if;
  if r.discovery_visibility='private' then return true;
  elsif r.room_type='title' then return private.party_room_metadata_allowed(r.party_id,e.recipient_user_id,r.discovery_visibility);
  elsif r.room_type='live' then
    source:=private.discovery_notification_source('live_stage',r.party_id);
    return source->>'eligible'='true' and (r.discovery_visibility='public'
      or (r.discovery_visibility='circle' and public.is_active_chilly_circle_member(r.host_user_id::text,e.recipient_user_id::text)));
  end if;
  return false;
end $$;
revoke all on function private.room_attendance_receipt_current(public.notification_activity_events) from public,anon,authenticated,service_role;

-- No historical backfill: only a new authoritative materialization establishes
-- a receipt. Old audit rows can never resurrect a retired private-room hint.
create function private.record_room_attendance_hint_receipt()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.event_kind<>'live_room_member_joined' or new.materialized_at is null or new.notification_id is null
    or (tg_op='UPDATE' and (old.materialized_at,old.notification_id) is not distinct from (new.materialized_at,new.notification_id)) then return null; end if;
  -- Serialize against both room/member retirement and actor-recipient Circle
  -- changes before the fresh domain read. No relationship/source row locks.
  perform private.lock_discovery_hint_hosts(array(
    select r.host_user_id::text from public.watch_party_rooms r where r.party_id=new.source_id
    union select new.context->>'hostId' union select new.actor_user_id::text union select new.recipient_user_id::text));
  if not private.room_attendance_receipt_current(new) then return null; end if;
  insert into private.room_attendance_hint_receipts(notification_id,event_id,party_id,generation,host_user_id,actor_user_id,recipient_user_id)
    select n.id,new.id,r.party_id,r.notification_join_generation,r.host_user_id,new.actor_user_id,new.recipient_user_id
    from public.notifications n join public.watch_party_rooms r on r.party_id=new.source_id
    where n.id=new.notification_id and n.user_id=new.recipient_user_id and n.actor_user_id=new.actor_user_id
      and n.source_type='notification_activity' and n.source_id=new.id::text and n.notification_type=new.event_kind
      and n.target_entity_id=r.party_id and r.is_active
      and r.notification_join_generation::text=new.context->>'generation'
      and r.host_user_id::text=new.context->>'hostId'
    on conflict(notification_id) do nothing;
  return null;
end $$;
revoke all on function private.record_room_attendance_hint_receipt() from public,anon,authenticated,service_role;
create trigger room_attendance_receipt_after_materialization after insert or update of materialized_at,notification_id
  on public.notification_activity_events for each row execute function private.record_room_attendance_hint_receipt();

create function private.enqueue_room_attendance_reconciliation(p_party text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from private.discovery_invalidation_worker_config where singleton and collecting) then return; end if;
  -- The current host also locks when there are no receipts yet: a concurrent
  -- materialization must re-read a just-committed leave/end before insertion.
  perform private.lock_discovery_hint_hosts(array(
    select host_user_id::text from private.room_attendance_hint_receipts where party_id=p_party
    union select host_user_id::text from public.watch_party_rooms where party_id=p_party));
  -- Prior actual materialization is the only recipient evidence here. A
  -- private room with no such notice emits nothing, even on end or admission
  -- changes. Hints contain no room/actor/recipient IDs in their payload.
  insert into private.discovery_invalidation_outbox(topic,source_id,source_table)
    select 'discovery:v1:viewer:'||e.recipient_user_id,min(e.id::text)::uuid,'notification_activity_events'
    from private.room_attendance_hint_receipts s join public.notification_activity_events e on e.id=s.event_id
    join public.notifications n
      on n.id=e.notification_id and n.user_id=e.recipient_user_id and n.actor_user_id=e.actor_user_id
      and n.source_type='notification_activity' and n.source_id=e.id::text
      and n.notification_type=e.event_kind and n.target_entity_id=e.source_id
    where s.party_id=p_party and e.event_kind='live_room_member_joined' and e.source_id=p_party
      and e.materialized_at is not null and n.dismissed_at is null
    group by e.recipient_user_id;
  -- One final withdrawal, then forget this recipient. Retained notification
  -- audit/history rows are never a perpetual private existence subscription.
  delete from private.room_attendance_hint_receipts s where s.party_id=p_party and not exists(
    select 1 from public.watch_party_rooms r join public.notification_activity_events e on e.id=s.event_id
    where r.party_id=s.party_id and r.is_active and r.notification_join_generation=s.generation
      and r.host_user_id=s.host_user_id and e.notification_id=s.notification_id
      and e.actor_user_id=s.actor_user_id and e.recipient_user_id=s.recipient_user_id
      and private.room_attendance_receipt_current(e));
end $$;
revoke all on function private.enqueue_room_attendance_reconciliation(text) from public,anon,authenticated,service_role;
-- Reads existing projections only. Authority-loss triggers may already own a
-- member/billing row, so they must never take room/feed write locks in reverse
-- order. Canonical RLS supplies the new truth when these exact old audiences
-- reconcile; a private room without an old projection emits no broad hint.
create function private.enqueue_room_discovery_reconciliation(p_party text)
returns void language plpgsql security definer set search_path='' as $$
declare item uuid;
begin
  if not exists(select 1 from private.discovery_invalidation_worker_config where singleton and collecting) then return; end if;
  insert into private.discovery_invalidation_outbox(topic,source_id,source_table)
    select topic,d.id,'discovery_feed_items' from public.discovery_feed_items d
      cross join lateral unnest(private.discovery_public_invalidation_scopes(d)) topic
    where d.source_id=p_party and d.source_type in('party_room','live_stage_room');
  for item in select d.id from public.circle_spectator_feed_items d
    where d.source_id=p_party and d.source_type in('party_room','live_stage_room')
      and (d.status='active' or exists(select 1 from private.circle_discovery_hint_recipients s where s.item_id=d.id))
  loop perform private.reconcile_circle_discovery_hints(item); end loop;
end $$;
revoke all on function private.enqueue_room_discovery_reconciliation(text) from public,anon,authenticated,service_role;
create function private.room_attendance_authority_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare party text; changed_user text;
begin
  party:=case when tg_op='DELETE' then old.party_id else new.party_id end;
  if tg_table_name='watch_party_room_memberships' then
    changed_user:=case when tg_op='DELETE' then old.user_id else new.user_id end;
    if exists(select 1 from public.watch_party_rooms r where r.party_id=party and r.host_user_id::text=changed_user)
      then perform private.enqueue_room_discovery_reconciliation(party); end if;
  else perform private.enqueue_room_discovery_reconciliation(party); end if;
  perform private.enqueue_room_attendance_reconciliation(party);
  return null;
end $$;
revoke all on function private.room_attendance_authority_changed() from public,anon,authenticated,service_role;
create trigger room_attendance_room_authority_after_change after update of is_active,discovery_visibility,host_user_id,room_generation,
  join_policy,content_access_rule,source_type,source_id,title_id,started_at,discovery_started_at
  on public.watch_party_rooms for each row execute function private.room_attendance_authority_changed();
create trigger room_attendance_member_authority_after_change after delete or update of membership_state,left_at,role
  on public.watch_party_room_memberships for each row execute function private.room_attendance_authority_changed();
create trigger room_attendance_publication_authority_after_change after insert or update or delete
  on private.party_room_discovery_publications for each row execute function private.room_attendance_authority_changed();

create function private.circle_discovery_relationship_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare a text; b text; row_data jsonb; item uuid; party text;
begin
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_table_name='user_friendships' then a:=row_data->>'user_low_id'; b:=row_data->>'user_high_id';
  else a:=row_data->>'channel_user_id'; b:=row_data->>'blocked_user_id'; end if;
  if not exists(select 1 from private.discovery_invalidation_worker_config where singleton and collecting) then return null; end if;
  -- Relationship writes may already own one relationship row. This mutex
  -- serializes only snapshot work; no path takes additional relationship-row
  -- locks while holding it, and this path never locks source room/feed rows.
  -- Attendance may have a third-party room host. Acquire the WHOLE sorted set
  -- once, never pair A/B followed by unrelated host C (which can cycle against
  -- another pair C/D hosted by A). Materializers share the pair mutexes.
  perform private.lock_discovery_hint_hosts(array(
    select unnest(array[a,b]) union select s.host_user_id::text from private.room_attendance_hint_receipts s
      where s.host_user_id::text in(a,b) or (s.actor_user_id::text in(a,b) and s.recipient_user_id::text in(a,b))));
  if tg_table_name='channel_audience_blocks' then
    insert into private.discovery_invalidation_outbox(topic,source_id,source_table)
      select 'discovery:v1:viewer:'||case when r.host_user_id::text=a then b else a end,d.id,'discovery_feed_items'
      from public.watch_party_rooms r join public.discovery_feed_items d on d.source_id=r.party_id
      where r.host_user_id::text in(a,b) and r.is_active and r.discovery_visibility='public'
        and d.source_type in ('party_room','live_stage_room') and d.is_publicly_discoverable and d.visibility='public'
        and private.room_host_discovery_consented(r)
        and ((d.source_type='party_room' and private.party_room_publication_current(r.party_id))
          or (d.source_type='live_stage_room' and private.live_stage_publication_current(r.party_id)));
  end if;
  for item in select distinct id from public.circle_spectator_feed_items
    where source_type in ('party_room','live_stage_room') and (creator_user_id in(a,b) or host_user_id in(a,b))
      and (status='active' or exists(select 1 from private.circle_discovery_hint_recipients h where h.item_id=id))
  loop perform private.reconcile_circle_discovery_hints(item); end loop;
  for party in select distinct s.party_id from private.room_attendance_hint_receipts s
    where s.host_user_id::text in(a,b) or (s.actor_user_id::text in(a,b) and s.recipient_user_id::text in(a,b))
  loop perform private.enqueue_room_attendance_reconciliation(party); end loop;
  return null;
end $$;
revoke all on function private.circle_discovery_relationship_changed() from public,anon,authenticated,service_role;
create trigger circle_discovery_friendship_after_write after insert or update or delete on public.user_friendships
  for each row execute function private.circle_discovery_relationship_changed();
create trigger circle_discovery_block_after_write after insert or update or delete on public.channel_audience_blocks
  for each row execute function private.circle_discovery_relationship_changed();

create function private.refresh_host_discovery_publications(p_host uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r record;
begin
  -- Source-authority loss immediately invalidates existing projections without
  -- changing source rows or acquiring reverse room/feed write locks.
  for r in select room.party_id,room.room_type from public.watch_party_rooms room
    where room.host_user_id=p_host and (
      exists(select 1 from public.discovery_feed_items d where d.source_id=room.party_id
        and d.source_type in ('party_room','live_stage_room') and d.is_publicly_discoverable)
      or exists(select 1 from public.circle_spectator_feed_items d where d.source_id=room.party_id
        and d.source_type in ('party_room','live_stage_room') and d.status='active'))
    order by room.party_id
  loop
    perform private.enqueue_room_discovery_reconciliation(r.party_id);
  end loop;
  for r in select distinct room.party_id from public.watch_party_rooms room
    join private.room_attendance_hint_receipts s on s.party_id=room.party_id
    where room.host_user_id=p_host
  loop perform private.enqueue_room_attendance_reconciliation(r.party_id); end loop;
end $$;
revoke all on function private.refresh_host_discovery_publications(uuid) from public,anon,authenticated,service_role;
create function private.discovery_host_authority_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb; host_text text; item uuid; party text;
begin
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  host_text:=case when tg_table_name='users' then row_data->>'id' else row_data->>'user_id' end;
  if host_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    perform private.lock_discovery_hint_hosts(array(
      select host_text union select s.host_user_id::text from private.circle_discovery_hint_recipients s
        where s.host_user_id=host_text::uuid or s.recipient_user_id=host_text::uuid
      union select s.host_user_id::text from private.room_attendance_hint_receipts s
        where s.host_user_id=host_text::uuid or s.actor_user_id=host_text::uuid or s.recipient_user_id=host_text::uuid));
    perform private.refresh_host_discovery_publications(host_text::uuid);
    -- An account restriction can remove an existing VIEWER as well as a host.
    -- Reconcile only its prior exact snapshots, before deleting orphan rows.
    for item in select distinct s.item_id from private.circle_discovery_hint_recipients s
      where s.recipient_user_id=host_text::uuid
    loop perform private.reconcile_circle_discovery_hints(item); end loop;
    for party in select distinct s.party_id from private.room_attendance_hint_receipts s
      where s.actor_user_id=host_text::uuid or s.recipient_user_id=host_text::uuid
    loop perform private.enqueue_room_attendance_reconciliation(party); end loop;
  end if;
  if tg_table_name='users' and tg_op='DELETE' then
    delete from private.circle_discovery_hint_recipients where host_user_id=host_text::uuid or recipient_user_id=host_text::uuid;
  end if;
  return null;
end $$;
revoke all on function private.discovery_host_authority_changed() from public,anon,authenticated,service_role;
create trigger discovery_host_session_after_loss after delete or update of not_after on auth.sessions
  for each row execute function private.discovery_host_authority_changed();
create trigger discovery_host_account_after_loss after delete or update of banned_until,deleted_at on auth.users
  for each row execute function private.discovery_host_authority_changed();
create trigger discovery_host_owner_role_after_change after insert or update or delete on public.platform_role_memberships
  for each row execute function private.discovery_host_authority_changed();

-- Entitlement/payment projection writes can have temporary intermediate states
-- inside their atomic producer. Reconcile the FINAL committed domain, not those
-- intermediate rows, and target only already materialized attendance receipts.
-- Ordinary private rooms with no receipt still emit nothing.
create function private.discovery_receipt_subject_authority_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare subjects text[]; subject text; party text;
begin
  if not exists(select 1 from private.discovery_invalidation_worker_config where singleton and collecting) then return null; end if;
  subjects:=array(select distinct id from unnest(array[
    case when tg_op<>'DELETE' then to_jsonb(new)->>'user_id' end,
    case when tg_op<>'INSERT' then to_jsonb(old)->>'user_id' end]) id
    where id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  perform private.lock_discovery_hint_hosts(array(
    select unnest(subjects) union select s.host_user_id::text from private.room_attendance_hint_receipts s
      where s.host_user_id::text=any(subjects) or s.actor_user_id::text=any(subjects) or s.recipient_user_id::text=any(subjects)));
  foreach subject in array subjects loop perform private.refresh_host_discovery_publications(subject::uuid); end loop;
  for party in select distinct s.party_id from private.room_attendance_hint_receipts s
    where s.host_user_id::text=any(subjects) or s.actor_user_id::text=any(subjects) or s.recipient_user_id::text=any(subjects)
  loop perform private.enqueue_room_attendance_reconciliation(party); end loop;
  return null;
end $$;
revoke all on function private.discovery_receipt_subject_authority_changed() from public,anon,authenticated,service_role;
create constraint trigger discovery_entitlement_subject_after_change after insert or update or delete on public.user_entitlements
  deferrable initially deferred for each row execute function private.discovery_receipt_subject_authority_changed();
create constraint trigger discovery_grant_subject_after_change after insert or update or delete on public.access_grants
  deferrable initially deferred for each row execute function private.discovery_receipt_subject_authority_changed();
create constraint trigger discovery_profile_subject_after_change after update of profile_access_visibility on public.user_profiles
  deferrable initially deferred for each row execute function private.discovery_receipt_subject_authority_changed();

comment on column private.discovery_invalidation_worker_config.primary_delivery_enabled is
  'Immediate transactional opaque Broadcast with exact durable insertion proof; existing worker is failure/deadline fallback. No device-delivery or large-fanout capacity claim.';
