-- Durable, server-authored activity. No historical backfill or provider call.
-- Delivery is disabled until the separately deployed worker is configured.
alter table public.notification_preferences
  add column social_activity_enabled boolean not null default true,
  add column circle_activity_enabled boolean not null default true,
  add column messages_enabled boolean not null default true,
  add column view_summary_enabled boolean not null default true,
  add column view_summary_push_enabled boolean not null default false,
  add column event_updates_enabled boolean not null default true,
  add column seat_activity_enabled boolean not null default true,
  add column account_activity_enabled boolean not null default true;

alter table public.notifications drop constraint notifications_category_check;
alter table public.notifications add constraint notifications_category_check check (category in (
  'creator_went_live','upcoming_event_reminder','new_message','access_granted','content_dropped',
  'reply_comment','moderation_notice','payment_access_confirmation','chilly_chat_call',
  'chilly_chat_missed_call','creator_money_purchase','creator_money_sale',
  'social_activity','circle_activity','view_summary'
));
alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type in (
  'followed_creator_live','circle_friend_live','event_starts_soon','watch_party_starts_soon','public_upload',
  'replay_later','creator_went_live','upcoming_event_reminder','new_message','access_granted','content_dropped',
  'reply_comment','moderation_notice','payment_access_confirmation','chilly_chat_call','chilly_chat_missed_call',
  'paid_video_unlocked','watch_party_ticket_ready','live_watch_party_access_ready','live_watch_party_seat_eligible',
  'live_watch_party_seat_requested','live_watch_party_seat_approved','live_watch_party_seat_rejected',
  'channel_subscription_active','vip_access_active','event_pass_active','tip_sent_receipt','paid_video_sold',
  'watch_party_ticket_sold','live_watch_party_access_sold','live_watch_party_seat_sold',
  'channel_subscription_started','vip_pass_sold','event_pass_sold','tip_received','creator_money_refunded',
  'creator_money_revoked','event_pass_event_starts_soon','watch_party_ticket_room_starts_soon','payout_readiness_updated',
  'social_follow','social_follow_request','social_follow_accepted','circle_request','circle_accepted','circle_added',
  'circle_post','content_shared','content_liked','profile_post_liked','profile_comment','profile_reply',
  'video_comment','video_reply','chat_message','video_view_summary','live_view_summary',
  'creator_event_updated','creator_event_canceled'
));

create table public.notification_activity_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (length(event_key) between 1 and 512),
  event_kind text not null check (event_kind ~ '^[a-z_]{1,64}$'),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete cascade,
  source_id text not null check (length(source_id) between 1 and 256),
  context jsonb not null default '{}' check (jsonb_typeof(context)='object'),
  scheduled_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending','leased','complete','suppressed','dead_letter')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  lease_token uuid,
  lease_until timestamptz,
  notification_id uuid references public.notifications(id) on delete set null,
  materialized_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (actor_user_id is distinct from recipient_user_id)
);
create index notification_activity_ready_idx on public.notification_activity_events(scheduled_at,id)
  where status in ('pending','leased');
create index notification_activity_recipient_idx on public.notification_activity_events(recipient_user_id);
create index notification_activity_actor_idx on public.notification_activity_events(actor_user_id);
create index notification_activity_notification_idx on public.notification_activity_events(notification_id);

create table public.notification_activity_pushes (
  event_id uuid not null references public.notification_activity_events(id) on delete cascade,
  push_token_id uuid not null references public.user_push_tokens(id) on delete cascade,
  lease_token uuid not null,
  token_fingerprint text not null,
  status text not null check (status in ('sending','sent','failed','unknown','retryable')),
  attempts integer not null default 1 check (attempts between 1 and 3),
  retry_after timestamptz,
  provider_message_id text,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key(event_id,push_token_id)
);
create index notification_activity_push_token_idx on public.notification_activity_pushes(push_token_id);
create table public.notification_activity_worker_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  token_sha256 text not null check (token_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);
alter table public.notification_activity_events enable row level security;
alter table public.notification_activity_events force row level security;
alter table public.notification_activity_pushes enable row level security;
alter table public.notification_activity_pushes force row level security;
alter table public.notification_activity_worker_config enable row level security;
alter table public.notification_activity_worker_config force row level security;
revoke all on public.notification_activity_events, public.notification_activity_pushes,
  public.notification_activity_worker_config from public,anon,authenticated;
grant all on public.notification_activity_events, public.notification_activity_pushes,
  public.notification_activity_worker_config to service_role;

create or replace function private.enqueue_notification_activity(
  p_event_key text,p_event_kind text,p_source_id text,p_actor_user_id uuid,p_recipient_user_id uuid,
  p_context jsonb default '{}',p_scheduled_at timestamptz default now(),p_expires_at timestamptz default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if p_recipient_user_id is null or p_actor_user_id=p_recipient_user_id then return null; end if;
  insert into public.notification_activity_events(event_key,event_kind,source_id,actor_user_id,recipient_user_id,context,scheduled_at,expires_at)
  values(p_event_key,p_event_kind,p_source_id,p_actor_user_id,p_recipient_user_id,coalesce(p_context,'{}'),p_scheduled_at,
    coalesce(p_expires_at,p_scheduled_at+interval '1 day'))
  on conflict(event_key) do nothing returning id into v_id;
  return v_id;
end $$;
revoke all on function private.enqueue_notification_activity(text,text,text,uuid,uuid,jsonb,timestamptz,timestamptz)
  from public,anon,authenticated,service_role;

-- Successor migrations replace only their own resolver. Unknown types fail closed.
create function private.resolve_social_notification_activity(p_event public.notification_activity_events)
returns jsonb language sql stable security definer set search_path='' as $$ select '{"eligible":false}'::jsonb $$;
create function private.resolve_discovery_notification_activity(p_event public.notification_activity_events)
returns jsonb language sql stable security definer set search_path='' as $$ select '{"eligible":false}'::jsonb $$;
create function private.resolve_view_notification_activity(p_event public.notification_activity_events)
returns jsonb language sql stable security definer set search_path='' as $$ select '{"eligible":false}'::jsonb $$;
create function private.resolve_account_notification_activity(p_event public.notification_activity_events)
returns jsonb language sql stable security definer set search_path='' as $$ select '{"eligible":false}'::jsonb $$;
create function private.resolve_seat_notification_activity(p_event public.notification_activity_events)
returns jsonb language sql stable security definer set search_path='' as $$ select '{"eligible":false}'::jsonb $$;
revoke all on function private.resolve_social_notification_activity(public.notification_activity_events),
  private.resolve_discovery_notification_activity(public.notification_activity_events),
  private.resolve_view_notification_activity(public.notification_activity_events),
  private.resolve_account_notification_activity(public.notification_activity_events),
  private.resolve_seat_notification_activity(public.notification_activity_events) from public,anon,authenticated,service_role;

create function private.resolve_notification_activity(p_event public.notification_activity_events)
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
  elsif v_route not in ('/chilly-circle','/channel-settings','/channel-studio','/settings','/chat','/watch-party')
    or v_route is null then return '{"eligible":false}'::jsonb;
  end if;
  return v_plan || jsonb_build_object('deep_link',v_route,
    'in_app_allowed',coalesce((v_preferences->>'in_app_enabled')::boolean,true),
    'push_allowed',coalesce((v_preferences->>'push_enabled')::boolean,true)
      and (p_event.event_kind not in ('video_view_summary','live_view_summary')
        or coalesce((v_preferences->>'view_summary_push_enabled')::boolean,false)));
end $$;
revoke all on function private.resolve_notification_activity(public.notification_activity_events) from public,anon,authenticated,service_role;

create function private.notification_activity_token_current(p_token public.user_push_tokens,p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_token.user_id=p_user_id and p_token.provider='expo' and p_token.enabled
    and p_token.revoked_at is null and p_token.ownership_state='ACCOUNT_BOUND'
    and exists(select 1 from public.wave1_push_installation_ownership o
      where o.platform=p_token.platform and o.install_id=p_token.install_id
        and o.user_id=p_user_id and o.account_id=p_user_id and o.revoked_at is null
        and o.ownership_state='ACCOUNT_BOUND' and o.session_generation=p_token.session_generation)
    and exists(select 1 from auth.sessions s where s.id::text=p_token.session_generation and s.user_id=p_user_id
      and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function private.notification_activity_token_current(public.user_push_tokens,uuid) from public,anon,authenticated,service_role;

create function public.claim_notification_activity_batch(p_limit integer default 10)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.notification_activity_events;
begin
  update public.notification_activity_events set status='dead_letter',completed_at=now()
    where status in ('pending','leased') and attempts>=10 and (lease_until is null or lease_until<now());
  for v_event in select * from public.notification_activity_events
    where status in ('pending','leased') and scheduled_at<=now() and attempts<10
      and (lease_until is null or lease_until<now())
    order by scheduled_at,id limit least(greatest(coalesce(p_limit,10),1),10) for update skip locked
  loop
    -- A lost worker may have sent. Never blindly send that token again.
    update public.notification_activity_pushes set status='unknown',completed_at=now(),error_code='worker_lease_expired'
      where event_id=v_event.id and status='sending';
    update public.notification_activity_events set status='leased',attempts=attempts+1,
      lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
      where id=v_event.id returning * into v_event;
    return next jsonb_build_object('eventId',v_event.id,'leaseToken',v_event.lease_token);
  end loop;
end $$;

create function public.prepare_notification_activity(p_event_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.notification_activity_events; v_plan jsonb; v_id uuid; v_tokens jsonb;
begin
  select * into v_event from public.notification_activity_events where id=p_event_id for update;
  if not found or v_event.status<>'leased' or v_event.lease_token is distinct from p_lease_token or v_event.lease_until<=now()
    then return '{"eligible":false,"reason":"stale_lease"}'::jsonb; end if;
  v_plan:=private.resolve_notification_activity(v_event);
  if coalesce((v_plan->>'eligible')::boolean,false) is false then
    update public.notification_activity_events set status='suppressed',completed_at=now() where id=v_event.id;
    return '{"eligible":false,"reason":"source_or_preference_changed"}'::jsonb;
  end if;
  if v_event.materialized_at is null then
    if (v_plan->>'in_app_allowed')::boolean then
      insert into public.notifications(user_id,actor_user_id,category,notification_type,title,body,
        target_route,target_entity_id,target_context,deep_link,source_type,source_id,status,delivered_at)
      values(v_event.recipient_user_id,v_event.actor_user_id,v_plan->>'category',v_plan->>'notification_type',
        v_plan->>'title',v_plan->>'body',v_plan->>'target_route',v_plan->>'target_entity_id',
        coalesce(v_plan->'target_context','{}'),v_plan->>'deep_link','notification_activity',v_event.id::text,'sent',now())
      returning id into v_id;
    end if;
    update public.notification_activity_events set notification_id=v_id,materialized_at=now()
      where id=v_event.id returning * into v_event;
  end if;
  -- A rate-limit rejection is known not to have been sent. A later worker may
  -- retry only the same currently owned token, after backoff, up to three sends.
  update public.notification_activity_pushes d set status='failed',retry_after=null,
    error_code='delivery_no_longer_eligible',completed_at=now()
    where d.event_id=v_event.id and d.status='retryable' and
      (not (v_plan->>'push_allowed')::boolean or not exists (
        select 1 from public.user_push_tokens p where p.id=d.push_token_id
          and p.token_fingerprint=d.token_fingerprint
          and private.notification_activity_token_current(p,v_event.recipient_user_id)));
  select coalesce(jsonb_agg(t.id),'[]') into v_tokens from (
    select p.id,row_number() over(partition by p.platform order by p.last_seen_at desc,p.id) ordinal from public.user_push_tokens p
    where (v_plan->>'push_allowed')::boolean and private.notification_activity_token_current(p,v_event.recipient_user_id)
      and (not exists(select 1 from public.notification_activity_pushes d where d.event_id=v_event.id and d.push_token_id=p.id)
        or exists(select 1 from public.notification_activity_pushes d where d.event_id=v_event.id and d.push_token_id=p.id
          and d.status='retryable' and d.attempts<3 and d.retry_after<=now()
          and d.lease_token is distinct from p_lease_token and d.token_fingerprint=p.token_fingerprint))
  ) t where t.ordinal<=5;
  return jsonb_build_object('eligible',true,'tokenIds',v_tokens);
end $$;

create function public.reserve_notification_activity_push(p_event_id uuid,p_lease_token uuid,p_push_token_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.notification_activity_events; v_plan jsonb; v_token public.user_push_tokens; v_badge bigint;
begin
  select * into v_event from public.notification_activity_events where id=p_event_id for update;
  if not found or v_event.status<>'leased' or v_event.lease_token is distinct from p_lease_token
    or v_event.lease_until<=now() or v_event.materialized_at is null then return '{"eligible":false}'::jsonb; end if;
  v_plan:=private.resolve_notification_activity(v_event);
  if not coalesce((v_plan->>'eligible')::boolean,false) or not coalesce((v_plan->>'push_allowed')::boolean,false)
    then return '{"eligible":false}'::jsonb; end if;
  select * into v_token from public.user_push_tokens where id=p_push_token_id for update;
  if not found or not private.notification_activity_token_current(v_token,v_event.recipient_user_id)
    then return '{"eligible":false}'::jsonb; end if;
  insert into public.notification_activity_pushes(event_id,push_token_id,lease_token,token_fingerprint,status)
    values(v_event.id,v_token.id,p_lease_token,v_token.token_fingerprint,'sending')
    on conflict(event_id,push_token_id) do update set status='sending',lease_token=excluded.lease_token,
      attempts=notification_activity_pushes.attempts+1,retry_after=null,started_at=now(),completed_at=null,
      provider_message_id=null,error_code=null
    where notification_activity_pushes.status='retryable' and notification_activity_pushes.attempts<3
      and notification_activity_pushes.retry_after<=now()
      and notification_activity_pushes.lease_token is distinct from excluded.lease_token
      and notification_activity_pushes.token_fingerprint=excluded.token_fingerprint;
  if not found then return '{"eligible":false}'::jsonb; end if;
  select count(*) into v_badge from public.notifications where user_id=v_event.recipient_user_id
    and read_at is null and dismissed_at is null;
  return jsonb_build_object('eligible',true,'token',v_token.token,'platform',v_token.platform,'badge',v_badge,
    'ttl',greatest(0,least(86400,floor(extract(epoch from (coalesce(v_event.expires_at,now()+interval '1 day')-now())))))::integer,
    'title',v_plan->>'title','body',v_plan->>'body','data',jsonb_strip_nulls(jsonb_build_object(
      'notificationId',v_event.notification_id,'notificationType',v_plan->>'notification_type',
      'category',v_plan->>'category','route',v_plan->>'deep_link','targetRoute',v_plan->>'target_route',
      'targetEntityId',v_plan->>'target_entity_id','targetContext',v_plan->'target_context')));
end $$;

create function public.complete_notification_activity_push(p_event_id uuid,p_lease_token uuid,p_push_token_id uuid,
  p_status text,p_provider_message_id text default null,p_error_code text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_event public.notification_activity_events; v_push public.notification_activity_pushes;
begin
  if p_status not in ('sent','failed','unknown') or coalesce(p_error_code,'') !~ '^[a-zA-Z0-9_.:-]{0,80}$'
    or (p_provider_message_id is not null and p_provider_message_id !~ '^[a-zA-Z0-9_-]{1,128}$') then return false; end if;
  select * into v_event from public.notification_activity_events where id=p_event_id for update;
  if not found or v_event.lease_token is distinct from p_lease_token or v_event.status<>'leased' or v_event.lease_until<=now()
    then return false; end if;
  update public.notification_activity_pushes set status=case
      when p_status='failed' and p_error_code='MessageRateExceeded' and attempts<3 then 'retryable' else p_status end,
    retry_after=case when p_status='failed' and p_error_code='MessageRateExceeded' and attempts<3
      then now()+make_interval(secs=>60*(2^(attempts-1))::integer) else null end,
    provider_message_id=p_provider_message_id,error_code=p_error_code,completed_at=now()
    where event_id=p_event_id and push_token_id=p_push_token_id and lease_token=p_lease_token and status='sending'
    returning * into v_push;
  if not found then return false; end if;
  insert into public.notification_delivery_attempts(id,notification_id,recipient_user_id,push_token_id,provider,
    provider_message_id,status,error_code)
  values(gen_random_uuid(),v_event.notification_id,v_event.recipient_user_id,p_push_token_id,'expo',p_provider_message_id,
    case when p_status='sent' then 'sent' else 'failed' end,case when p_status='unknown' then 'delivery_unknown' else p_error_code end);
  if p_error_code='DeviceNotRegistered' then
    update public.user_push_tokens set enabled=false,revoked_at=now(),updated_at=now()
      where id=p_push_token_id and user_id=v_event.recipient_user_id and token_fingerprint=v_push.token_fingerprint;
  end if;
  return true;
end $$;

create function public.finish_notification_activity(p_event_id uuid,p_lease_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_event public.notification_activity_events; v_retry_after timestamptz;
begin
  select * into v_event from public.notification_activity_events where id=p_event_id for update;
  if not found or v_event.status<>'leased' or v_event.lease_token is distinct from p_lease_token
    or v_event.lease_until<=now() or v_event.materialized_at is null then return false; end if;
  if exists(select 1 from public.notification_activity_pushes p where p.event_id=p_event_id and p.status='sending')
    then return false; end if;
  select min(retry_after) into v_retry_after from public.notification_activity_pushes
    where event_id=p_event_id and status='retryable';
  if v_retry_after is not null then
    update public.notification_activity_events set status='pending',scheduled_at=greatest(now(),v_retry_after),
      lease_token=null,lease_until=null where id=p_event_id;
    return false;
  end if;
  update public.notification_activity_events set status='complete',completed_at=now(),lease_until=null
    where id=p_event_id and status='leased' and lease_token=p_lease_token and lease_until>now()
      and materialized_at is not null and not exists(select 1 from public.notification_activity_pushes p
        where p.event_id=p_event_id and p.status='sending');
  return found;
end $$;

create function public.authorize_notification_activity_worker(p_token text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select enabled and token_sha256=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
    from public.notification_activity_worker_config where singleton),false)
$$;
revoke all on function public.claim_notification_activity_batch(integer), public.prepare_notification_activity(uuid,uuid),
  public.reserve_notification_activity_push(uuid,uuid,uuid), public.complete_notification_activity_push(uuid,uuid,uuid,text,text,text),
  public.finish_notification_activity(uuid,uuid), public.authorize_notification_activity_worker(text) from public,anon,authenticated;
grant execute on function public.claim_notification_activity_batch(integer), public.prepare_notification_activity(uuid,uuid),
  public.reserve_notification_activity_push(uuid,uuid,uuid), public.complete_notification_activity_push(uuid,uuid,uuid,text,text,text),
  public.finish_notification_activity(uuid,uuid), public.authorize_notification_activity_worker(text) to service_role;

comment on table public.notification_activity_pushes is
  'A reservation is a possible provider send. Lost replies or worker leases become unknown and are never automatically resent.';

create function public.configure_notification_activity_worker(p_project_url text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_token text; v_job_id bigint;
begin
  if p_project_url is distinct from 'https://bmkkhihfbmsnnmcqkoly.supabase.co' then
    raise exception 'activity_worker_project_url_rejected';
  end if;
  select decrypted_secret into v_token from vault.decrypted_secrets
    where name='notification_activity_worker_token' order by created_at desc limit 1;
  if nullif(v_token,'') is null then
    v_token:=encode(extensions.gen_random_bytes(32),'hex');
    perform vault.create_secret(v_token,'notification_activity_worker_token','Scoped notification activity worker credential.');
  end if;
  insert into public.notification_activity_worker_config(singleton,enabled,token_sha256)
    values(true,true,encode(extensions.digest(v_token,'sha256'),'hex'))
    on conflict(singleton) do update set enabled=true,token_sha256=excluded.token_sha256,updated_at=now();
  select jobid into v_job_id from cron.job where jobname='notification-activity-worker';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  v_job_id:=cron.schedule('notification-activity-worker','10 seconds',format($command$
    select net.http_post(url := %L,
      headers := jsonb_build_object('Content-Type','application/json','x-chillywood-activity-token',
        (select decrypted_secret from vault.decrypted_secrets where name='notification_activity_worker_token' order by created_at desc limit 1)),
      body := '{}'::jsonb, timeout_milliseconds := 65000);
    $command$,p_project_url||'/functions/v1/notification-activity-worker'));
  return jsonb_build_object('enabled',true,'jobId',v_job_id);
end $$;
create function public.disable_notification_activity_worker()
returns boolean language plpgsql security definer set search_path='' as $$
declare v_job_id bigint;
begin
  update public.notification_activity_worker_config set enabled=false,updated_at=now() where singleton;
  select jobid into v_job_id from cron.job where jobname='notification-activity-worker';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  return true;
end $$;
revoke all on function public.configure_notification_activity_worker(text),public.disable_notification_activity_worker() from public,anon,authenticated;
grant execute on function public.configure_notification_activity_worker(text),public.disable_notification_activity_worker() to service_role;
