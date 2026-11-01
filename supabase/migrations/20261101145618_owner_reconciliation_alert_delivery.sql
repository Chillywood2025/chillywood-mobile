-- Reuse the existing durable notification outbox and owner role, not an
-- invented email destination. Monitoring performs no financial/provider action.
create function private.merch_reconciliation_health_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c private.merch_reconciliation_driver; h jsonb; t jsonb; metrics jsonb;
 alerts jsonb:='[]'; last_start timestamptz; successes bigint; failures bigint; runs bigint;
begin
 select * into strict c from private.merch_reconciliation_driver where singleton;
 h:=private.merch_reconciliation_backlog_health();
 select max(started_at),count(*) filter(where started_at>=now()-interval '6 hours'),
  coalesce(sum(completed) filter(where started_at>=now()-interval '6 hours'),0),
  coalesce(sum(incomplete) filter(where started_at>=now()-interval '6 hours'),0)
 into last_start,runs,successes,failures from private.merch_reconciliation_run_observations;
 select jsonb_build_object('assigned',count(*),
  'unqualified',count(*) filter(where not private.merch_tracking_configured(a.creator_id,o.environment)),
  'overdue12h',count(*) filter(where j.checked_at is null or j.checked_at<now()-interval '12 hours'),
  'reviewRequired',count(*) filter(where j.review_reason is not null)) into t
 from private.merch_tracking_assignments a join private.merch_tracking_jobs j on j.assignment_id=a.id
 join public.merch_orders o on o.id=a.order_id
 where a.id=private.merch_active_tracking_assignment(a.order_id);
 if not c.enabled then alerts:=alerts||'"driver_disabled"'::jsonb;
 elsif last_start is null or last_start<now()-interval '30 minutes' then alerts:=alerts||'"driver_heartbeat_missing"'::jsonb;end if;
 if (h->>'refreshOverdue12h')::bigint>0 then alerts:=alerts||'"cost_refresh_overdue"'::jsonb;end if;
 if failures>0 then alerts:=alerts||'"provider_refresh_failures"'::jsonb;end if;
 if (h->>'eligible')::bigint>0 and runs>=24 and successes<(h->>'eligible')::bigint
 then alerts:=alerts||'"observed_capacity_shortfall"'::jsonb;end if;
 if (t->>'unqualified')::bigint>0 then alerts:=alerts||'"tracking_unqualified"'::jsonb;end if;
 if (t->>'overdue12h')::bigint>0 then alerts:=alerts||'"tracking_refresh_overdue"'::jsonb;end if;
 if (t->>'reviewRequired')::bigint>0 then alerts:=alerts||'"tracking_review_required"'::jsonb;end if;
 metrics:=jsonb_build_object('windowHours',6,'runs',runs,'completed',successes,'incomplete',failures,
  'lastRunAt',last_start,'capacityGuaranteed',false);
 return jsonb_build_object('schemaVersion',1,'observedAt',now(),'environment','sandbox',
  'driverEnabled',c.enabled,'cost',h,'tracking',t,'measured',metrics,'alerts',alerts,
  'financialAuthority',false,'liveActivationAllowed',false);
end $$;
revoke all on function private.merch_reconciliation_health_snapshot() from public,anon,authenticated,service_role;
create or replace function public.get_owner_merch_reconciliation_health() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
  or public.has_platform_role(array['owner']) is distinct from true then raise exception 'owner_current_session_required'; end if;
 return private.merch_reconciliation_health_snapshot();
end $$;

create table private.merch_reconciliation_alert_state(
 singleton boolean primary key default true check(singleton),fingerprint text,
 episode uuid,alerts jsonb not null default '[]',last_checked_at timestamptz,has_warned boolean not null default false,
 health jsonb not null default '{}'
);
alter table private.merch_reconciliation_alert_state enable row level security;
alter table private.merch_reconciliation_alert_state force row level security;
revoke all on private.merch_reconciliation_alert_state from public,anon,authenticated,service_role;
insert into private.merch_reconciliation_alert_state(singleton) values(true);

alter function private.resolve_account_notification_activity(public.notification_activity_events)
 rename to resolve_account_notification_before_reconciliation;
create function private.resolve_account_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s private.merch_reconciliation_alert_state; recovered boolean;
begin
 if p_event.event_kind<>'owner_reconciliation_health' then
  return private.resolve_account_notification_before_reconciliation(p_event); end if;
 select * into s from private.merch_reconciliation_alert_state where singleton;
 if not public.platform_subject_has_role_internal(p_event.recipient_user_id::text,array['owner'])
  or p_event.actor_user_id is not null or p_event.source_id is distinct from s.episode::text
  or p_event.context->>'episode' is distinct from s.episode::text
 then return '{"eligible":false}'::jsonb; end if;
 recovered:=s.alerts='[]'::jsonb;
 return jsonb_build_object('eligible',true,'preference_key','account_activity_enabled',
  'category','moderation_notice','notification_type','payout_readiness_updated',
  'title',case when recovered then 'Chi''llywood operations: checks recovered' else 'Chi''llywood operations need attention' end,
  'body',case when recovered then 'The monitored shipment and cost-refresh warnings cleared. This does not enable payments or payouts.'
    else 'Open Owner Money Center to review shipment verification, provider refresh and queue health. Payments and payouts are not enabled by this alert.' end,
  'target_route','/admin','target_entity_id',s.episode::text,
  'target_context',jsonb_build_object('section','money','alertCodes',s.alerts,'observedAt',s.last_checked_at),
  'push_allowed',true);
end $$;
revoke all on function private.resolve_account_notification_activity(public.notification_activity_events),
 private.resolve_account_notification_before_reconciliation(public.notification_activity_events) from public,anon,authenticated,service_role;
create or replace function private.resolve_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_plan jsonb; v_preferences jsonb; v_route text; v_entity text;
begin
  if (p_event.expires_at is not null and p_event.expires_at<=now())
    or public.is_account_access_restricted(p_event.recipient_user_id::text)
    or (p_event.actor_user_id is not null and public.is_account_access_restricted(p_event.actor_user_id::text))
    or exists (select 1 from public.account_deletion_requests d
      where d.user_id::text in (p_event.recipient_user_id::text,p_event.actor_user_id::text) and d.status in ('scheduled','completed'))
    or exists (select 1 from public.channel_audience_blocks b
      where (b.channel_user_id=p_event.actor_user_id::text and b.blocked_user_id=p_event.recipient_user_id::text)
         or (b.channel_user_id=p_event.recipient_user_id::text and b.blocked_user_id=p_event.actor_user_id::text))
  then return '{"eligible":false}'::jsonb; end if;
  v_plan := private.resolve_social_notification_activity(p_event);
  if coalesce((v_plan->>'eligible')::boolean,false) is false then v_plan:=private.resolve_discovery_notification_activity(p_event); end if;
  if coalesce((v_plan->>'eligible')::boolean,false) is false then v_plan:=private.resolve_view_notification_activity(p_event); end if;
  if coalesce((v_plan->>'eligible')::boolean,false) is false then v_plan:=private.resolve_account_notification_activity(p_event); end if;
  if coalesce((v_plan->>'eligible')::boolean,false) is false then v_plan:=private.resolve_seat_notification_activity(p_event); end if;
  if coalesce((v_plan->>'eligible')::boolean,false) is false then return '{"eligible":false}'::jsonb; end if;
  select to_jsonb(p) into v_preferences from public.notification_preferences p where p.user_id=p_event.recipient_user_id;
  if v_plan->>'preference_key' not in ('social_activity_enabled','circle_activity_enabled','messages_enabled',
    'view_summary_enabled','event_updates_enabled','seat_activity_enabled','account_activity_enabled',
    'followed_creator_live_enabled','circle_friend_live_enabled','event_starts_soon_enabled','public_upload_enabled','replay_later_enabled')
    or nullif(v_plan->>'preference_key','') is null
    or coalesce((v_preferences->>(v_plan->>'preference_key'))::boolean,true) is false
  then return '{"eligible":false}'::jsonb; end if;
  v_route:=v_plan->>'target_route'; v_entity:=v_plan->>'target_entity_id';
  if v_route in ('/profile/[userId]','/channel/[userId]','/player/[id]','/title/[id]',
    '/chat/[threadId]','/event/[eventId]','/watch-party/[partyId]','/watch-party/live-stage/[partyId]','/spectate/[itemId]',
    '/player/replay/[replayId]')
    and v_entity ~ '^[a-zA-Z0-9_-]{1,128}$'
  then v_route:=regexp_replace(v_route,'\[[a-zA-Z]+\]',v_entity);
  elsif v_route not in ('/chilly-circle','/channel-settings','/channel-studio','/settings','/chat','/watch-party','/admin')
    or v_route is null then return '{"eligible":false}'::jsonb;
  end if;
  return v_plan || jsonb_build_object('deep_link',case when p_event.event_kind='owner_reconciliation_health'
    and v_route='/admin' then '/admin?tab=money-center&section=overview' else v_route end,
    'in_app_allowed',coalesce((v_preferences->>'in_app_enabled')::boolean,true),
    'push_allowed',coalesce((v_preferences->>'push_enabled')::boolean,true)
      and (p_event.event_kind not in ('video_view_summary','live_view_summary')
        or coalesce((v_preferences->>'view_summary_push_enabled')::boolean,false)));
end $$;

create function private.refresh_merch_reconciliation_alerts() returns jsonb
language plpgsql security definer set search_path='' as $$
declare h jsonb; s private.merch_reconciliation_alert_state; fp text; owner_id uuid;
event_id uuid; ev public.notification_activity_events; plan jsonb; v_notification_id uuid;
 emitted integer:=0;
begin
 select * into strict s from private.merch_reconciliation_alert_state where singleton for update;
 h:=private.merch_reconciliation_health_snapshot();
 fp:=md5((h->'alerts')::text);
 if s.fingerprint is distinct from fp then
  update private.merch_reconciliation_alert_state set fingerprint=fp,episode=extensions.gen_random_uuid(),
   alerts=h->'alerts',health=h,last_checked_at=clock_timestamp(),has_warned=has_warned or h->'alerts'<>'[]'::jsonb where singleton returning * into s;
 else
  update private.merch_reconciliation_alert_state set health=h,last_checked_at=clock_timestamp()
   where singleton returning * into s;
 end if;
 if not s.has_warned then return jsonb_build_object('emitted',0,'financialAuthority',false); end if;
 -- A stable incident is deduplicated per current verified owner. New owners
 -- receive the still-active incident; removed owners lose delivery eligibility.
 for owner_id in select distinct membership.user_id::uuid from public.platform_role_memberships membership
  where membership.role='owner' and membership.status='active'
   and public.platform_subject_has_role_internal(membership.user_id,array['owner']) loop
  event_id:=private.enqueue_notification_activity(
   'owner-reconciliation:'||s.episode::text||':'||owner_id::text,'owner_reconciliation_health',s.episode::text,
   null,owner_id,jsonb_build_object('episode',s.episode),clock_timestamp(),clock_timestamp()+interval '7 days');
  if event_id is not null then
   select * into strict ev from public.notification_activity_events where id=event_id for update;
   plan:=private.resolve_notification_activity(ev);
   v_notification_id:=null;
   if coalesce((plan->>'eligible')::boolean,false) and coalesce((plan->>'in_app_allowed')::boolean,false) then
    insert into public.notifications(user_id,actor_user_id,category,notification_type,title,body,
     target_route,target_entity_id,target_context,deep_link,source_type,source_id,status,delivered_at)
    values(owner_id,null,plan->>'category',plan->>'notification_type',plan->>'title',plan->>'body',
     plan->>'target_route',plan->>'target_entity_id',coalesce(plan->'target_context','{}'),plan->>'deep_link',
     'notification_activity',event_id::text,'sent',clock_timestamp()) returning id into v_notification_id;
   end if;
   -- In-app delivery is committed now even if the push worker is unavailable.
   -- Its existing producer rechecks role/preferences and owns push receipts.
   update public.notification_activity_events set materialized_at=clock_timestamp(),notification_id=v_notification_id
    where id=event_id;
   emitted:=emitted+1;
  end if;
 end loop;
 return jsonb_build_object('emitted',emitted,'episode',s.episode,'financialAuthority',false);
end $$;
revoke all on function private.refresh_merch_reconciliation_alerts() from public,anon,authenticated,service_role;

-- Independent of the disabled financial reconciliation driver: these are reads
-- plus owner notifications only. No credentials, provider traffic or money.
select cron.schedule('merch-reconciliation-owner-health','*/5 * * * *',
 'set statement_timeout=''10s''; select private.refresh_merch_reconciliation_alerts();');
