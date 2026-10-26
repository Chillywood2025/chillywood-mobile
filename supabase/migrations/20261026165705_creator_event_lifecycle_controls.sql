-- Source-only creator lifecycle with immutable purchase terms and explicit remedies.
alter table public.creator_events add column management_status text;
alter table public.creator_events add column status_message text;
alter table public.creator_events add constraint creator_event_management_status_check
  check(management_status is null or management_status in ('published','live','delayed','rescheduled','ended','canceled','no_show','sales_paused'));
alter table public.creator_events add constraint creator_event_status_message_length check(char_length(status_message)<=1000);

create table private.creator_event_lifecycle_permits(
  transaction_id bigint not null,event_id uuid not null,actor_id uuid not null,
  primary key(transaction_id,event_id)
);
alter table private.creator_event_lifecycle_permits enable row level security;
alter table private.creator_event_lifecycle_permits force row level security;
revoke all on private.creator_event_lifecycle_permits from public,anon,authenticated,service_role;

create table public.creator_event_purchase_remedies(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.creator_events(id) on delete restrict,
  buyer_id uuid not null,
  pass_id uuid references public.paid_creator_event_passes(id) on delete restrict,
  access_grant_id uuid,
  purchase_intent_id uuid,
  reason text not null check(reason in ('event_canceled','event_no_show','material_schedule_change')),
  refund_eligibility text not null default 'eligible' check(refund_eligibility='eligible'),
  status text not null default 'provider_review_required' check(status='provider_review_required'),
  created_at timestamptz not null default clock_timestamp(),
  check(pass_id is not null or purchase_intent_id is not null),
  unique(pass_id,reason),
  unique(purchase_intent_id,reason)
);
create index creator_event_purchase_remedies_buyer_event on public.creator_event_purchase_remedies(buyer_id,event_id,purchase_intent_id);
alter table public.creator_event_purchase_remedies enable row level security;
alter table public.creator_event_purchase_remedies force row level security;
revoke all on public.creator_event_purchase_remedies from public,anon,authenticated,service_role;
grant select on public.creator_event_purchase_remedies to authenticated;
create policy creator_event_purchase_remedies_owner_read on public.creator_event_purchase_remedies
for select to authenticated using(buyer_id=(select auth.uid()) and public.wave1_current_caller_authority_internal() and pass_id is not null);

create function private.guard_creator_event_lifecycle()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_has_purchase boolean; v_contract_changed boolean; v_permit boolean;
begin
  if not coalesce(isfinite(new.starts_at),true) or not coalesce(isfinite(new.ends_at),true)
    or not coalesce(isfinite(new.replay_available_at),true) or not coalesce(isfinite(new.replay_expires_at),true)
  then raise exception 'event_finite_schedule_required'; end if;
  if auth.uid() is not null and (not public.wave1_current_caller_authority_internal()
    or auth.uid() is distinct from new.host_user_id or public.is_account_access_restricted(auth.uid()::text))
  then raise exception 'event_creator_session_required'; end if;
  if tg_op='INSERT' and auth.uid() is not null and (new.management_status is not null or new.status_message is not null)
  then raise exception 'event_lifecycle_management_required'; end if;
  if tg_op='UPDATE' and new.host_user_id is distinct from old.host_user_id then raise exception 'event_host_immutable'; end if;
  if new.status='live_now' and (tg_op='INSERT' or old.status is distinct from 'live_now') then
    if not exists(select 1 from public.creator_event_broadcast_ready_internal(new.id,new.host_user_id,false))
    then raise exception 'event_verified_broadcast_required'; end if;
  end if;
  if tg_op='UPDATE' then
    select exists(select 1 from private.creator_event_lifecycle_permits p
      where p.transaction_id=txid_current() and p.event_id=new.id and p.actor_id=auth.uid()) into v_permit;
    if auth.uid() is not null and row(new.management_status,new.status_message)
      is distinct from row(old.management_status,old.status_message) and not v_permit
    then raise exception 'event_lifecycle_management_required'; end if;
    v_contract_changed:=row(new.starts_at,new.ends_at,new.time_zone,new.replay_policy,new.replay_available_at,new.replay_expires_at)
      is distinct from row(old.starts_at,old.ends_at,old.time_zone,old.replay_policy,old.replay_available_at,old.replay_expires_at);
    select exists(select 1 from public.paid_creator_event_passes p where p.creator_event_id=new.id
      and p.refunded_at is null and p.revoked_at is null and p.status in ('active','expired'))
      or exists(select 1 from public.event_ticket_reservations r where r.creator_event_id=new.id) into v_has_purchase;
    if v_has_purchase and (v_contract_changed or (new.status='canceled' and old.status is distinct from new.status)) then
      if not v_permit then raise exception 'purchased_event_lifecycle_management_required'; end if;
      if row(new.replay_policy,new.replay_available_at,new.replay_expires_at)
        is distinct from row(old.replay_policy,old.replay_available_at,old.replay_expires_at)
      then raise exception 'purchased_event_replay_terms_immutable'; end if;
    end if;
    if v_contract_changed then
      update public.paid_creator_events set sales_paused=true,updated_at=clock_timestamp()
        where creator_event_id=new.id and status in ('active','sandbox','sold_out','paused');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_creator_event_lifecycle() from public,anon,authenticated,service_role;
create trigger guard_creator_event_lifecycle before insert or update on public.creator_events
for each row execute function private.guard_creator_event_lifecycle();

create function public.manage_creator_event_lifecycle(
  p_creator_event_id uuid,p_action text,p_expected_updated_at timestamptz,
  p_starts_at timestamptz default null,p_ends_at timestamptz default null,
  p_time_zone text default null,p_message text default null,p_material_change boolean default false
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.creator_events; v_actor uuid:=auth.uid(); v_status text; v_management text;
  v_message text:=nullif(btrim(p_message),''); v_purchased boolean; v_reason text;
  v_starts timestamptz; v_ends timestamptz; v_zone text;
begin
  if v_actor is null or not public.wave1_current_caller_authority_internal()
    or public.is_account_access_restricted(v_actor::text) then raise exception 'event_creator_session_required'; end if;
  select * into e from public.creator_events where id=p_creator_event_id for update;
  if e.id is null or e.host_user_id is distinct from v_actor then raise exception 'event_creator_required'; end if;
  if p_expected_updated_at is null or e.updated_at is distinct from p_expected_updated_at then raise exception 'event_changed_refresh_required'; end if;
  if p_action is null or p_action not in ('publish','start','delay','reschedule','end','cancel','mark_no_show','stop_sales') then raise exception 'event_action_invalid'; end if;
  if not coalesce(isfinite(p_starts_at),true) or not coalesce(isfinite(p_ends_at),true) then raise exception 'event_finite_schedule_required'; end if;
  if char_length(v_message)>1000 then raise exception 'event_message_too_long'; end if;
  if p_action in ('delay','reschedule','cancel','mark_no_show') and v_message is null then raise exception 'event_update_message_required'; end if;
  select exists(select 1 from public.paid_creator_event_passes p where p.creator_event_id=e.id
    and p.refunded_at is null and p.revoked_at is null and p.status in ('active','expired'))
    or exists(select 1 from public.event_ticket_reservations r where r.creator_event_id=e.id) into v_purchased;
  v_status:=e.status; v_management:=e.management_status; v_starts:=e.starts_at; v_ends:=e.ends_at; v_zone:=e.time_zone;
  if p_action='publish' then
    if e.status<>'draft' or e.starts_at is null or e.starts_at<=clock_timestamp() then raise exception 'event_future_draft_required'; end if;
    v_status:='scheduled';v_management:='published';
  elsif p_action='start' then
    if e.status<>'scheduled' then raise exception 'event_scheduled_required'; end if;
    if not exists(select 1 from public.creator_event_broadcast_ready_internal(e.id,e.host_user_id,false)) then raise exception 'event_verified_broadcast_required'; end if;
    v_status:='live_now';v_management:='live';
  elsif p_action in ('delay','reschedule') then
    if e.status<>'scheduled' then raise exception 'event_scheduled_required'; end if;
    if p_action='reschedule' and p_starts_at is null then raise exception 'event_new_start_required'; end if;
    if p_ends_at is not null and p_starts_at is null then raise exception 'event_new_start_required'; end if;
    if p_starts_at is not null then
      if p_starts_at<=clock_timestamp() then raise exception 'event_new_start_must_be_future'; end if;
      v_starts:=p_starts_at;
      -- Preserve the declared duration when the creator supplies only a new start.
      v_ends:=coalesce(p_ends_at,case when e.ends_at is not null and e.starts_at is not null then p_starts_at+(e.ends_at-e.starts_at) else null end);
      if v_ends is not null and v_ends<=v_starts then raise exception 'event_end_after_start_required'; end if;
      if v_purchased and row(v_starts,v_ends) is distinct from row(e.starts_at,e.ends_at) then
        if p_material_change is not true then raise exception 'event_material_change_confirmation_required'; end if;
        v_reason:='material_schedule_change';
      end if;
    end if;
    v_zone:=coalesce(nullif(btrim(p_time_zone),''),e.time_zone);
    if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_zone) then raise exception 'event_time_zone_invalid'; end if;
    v_management:=case when p_action='delay' then 'delayed' else 'rescheduled' end;
  elsif p_action='end' then
    if e.status<>'live_now' then raise exception 'event_live_required'; end if;
    v_status:='ended';v_management:='ended';
  elsif p_action='cancel' then
    if e.status in ('ended','expired','canceled') then raise exception 'event_already_terminal'; end if;
    v_status:='canceled';v_management:='canceled';v_reason:='event_canceled';
  elsif p_action='mark_no_show' then
    if e.status<>'scheduled' or e.starts_at is null or e.starts_at>clock_timestamp() then raise exception 'event_started_schedule_required'; end if;
    if exists(select 1 from public.creator_event_broadcast_ready_internal(e.id,e.host_user_id,false)) then raise exception 'event_active_broadcast_not_no_show'; end if;
    v_status:='canceled';v_management:='no_show';v_reason:='event_no_show';
  elsif p_action='stop_sales' then v_management:='sales_paused';
  end if;
  insert into private.creator_event_lifecycle_permits values(txid_current(),e.id,v_actor);
  update public.creator_events set status=v_status,management_status=v_management,status_message=v_message,
    starts_at=v_starts,ends_at=v_ends,time_zone=v_zone,reminder_ready=case when v_status='scheduled' then reminder_ready else false end,
    updated_at=clock_timestamp() where id=e.id returning * into e;
  delete from private.creator_event_lifecycle_permits where transaction_id=txid_current() and event_id=e.id;
  if p_action in ('delay','reschedule','end','cancel','mark_no_show','stop_sales') then
    update public.paid_creator_events set sales_paused=true,updated_at=clock_timestamp()
      where creator_event_id=e.id and status in ('active','sandbox','sold_out','paused');
  end if;
  if v_reason is not null then
    insert into public.creator_event_purchase_remedies(event_id,buyer_id,pass_id,access_grant_id,purchase_intent_id,reason)
    select e.id,p.buyer_id,p.id,p.access_grant_id,r.purchase_intent_id,v_reason
      from public.paid_creator_event_passes p
      left join public.event_ticket_reservations r on r.access_grant_id=p.access_grant_id and r.buyer_id=p.buyer_id
      where p.creator_event_id=e.id and p.refunded_at is null and p.revoked_at is null and p.status in ('active','expired')
    on conflict do nothing;
    -- Reservations can later receive an already-charged provider event without
    -- ever producing a pass. Preserve the exact intent's conditional remedy;
    -- the buyer wallet exposes it only after verified payment evidence exists.
    insert into public.creator_event_purchase_remedies(event_id,buyer_id,access_grant_id,purchase_intent_id,reason)
    select e.id,r.buyer_id,r.access_grant_id,r.purchase_intent_id,v_reason
      from public.event_ticket_reservations r where r.creator_event_id=e.id
    on conflict do nothing;
  end if;
  return to_jsonb(e);
end;
$$;
revoke all on function public.manage_creator_event_lifecycle(uuid,text,timestamptz,timestamptz,timestamptz,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.manage_creator_event_lifecycle(uuid,text,timestamptz,timestamptz,timestamptz,text,text,boolean) to authenticated;

-- Keep existing reminder outbox producers sensitive to explicit creator updates.
create or replace function private.discovery_notification_event_revision(e public.creator_events)
returns text language sql immutable set search_path='' as $$
  select md5(jsonb_build_array(e.host_user_id,e.event_title,e.event_type,e.visibility,e.status,
    e.starts_at,e.ends_at,e.reminder_ready,e.time_zone,e.management_status,e.status_message)::text);
$$;
