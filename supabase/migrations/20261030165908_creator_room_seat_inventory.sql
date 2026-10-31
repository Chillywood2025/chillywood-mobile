-- Reserved room-session rights are distinct from legacy eligibility passes.
-- No historical pass is upgraded; no provider, room, role, or money is activated.
create table private.creator_room_sessions (
  id uuid primary key default gen_random_uuid(),party_id text not null,host_id uuid not null,
  room_type text not null check(room_type in('live','title')),
  source_type text,source_id text,title_id text,
  opened_at timestamptz not null default clock_timestamp(),ended_at timestamptz,end_reason text,
  check((ended_at is null)=(end_reason is null))
);
create unique index creator_room_session_active on private.creator_room_sessions(party_id) where ended_at is null;
create table private.creator_room_seat_claims (
  id uuid primary key default gen_random_uuid(),
  room_session_id uuid not null references private.creator_room_sessions(id) on delete restrict,
  party_id text not null,source_kind text not null check(source_kind in('stage_reserved_seat','party_admission')),
  buyer_id uuid,auction_id uuid,
  state text not null check(state in('auction_hold','winner_hold','payment_pending','paid_reserved','available','unfulfilled','released','ended')),
  expires_at timestamptz not null check(isfinite(expires_at)),
  paid_at timestamptz,host_approved_at timestamptz,availability_confirmed_at timestamptz,
  access_grant_id uuid references public.access_grants(id) on delete restrict,
  purchase_intent_id uuid references public.money_purchase_intents(id) on delete restrict,
  reason text,refund_review_eligible boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create index creator_room_claim_inventory on private.creator_room_seat_claims(room_session_id,source_kind,state);
create unique index creator_room_claim_buyer on private.creator_room_seat_claims(room_session_id,buyer_id,source_kind)
  where buyer_id is not null and state in('winner_hold','payment_pending','paid_reserved','available','unfulfilled');
alter table private.creator_room_sessions enable row level security;
alter table private.creator_room_sessions force row level security;
alter table private.creator_room_seat_claims enable row level security;
alter table private.creator_room_seat_claims force row level security;
revoke all on private.creator_room_sessions,private.creator_room_seat_claims from public,anon,authenticated,service_role;
create table private.creator_party_ticket_reservations (
  purchase_intent_id uuid primary key references public.money_purchase_intents(id) on delete restrict,
  room_session_id uuid not null references private.creator_room_sessions(id) on delete restrict,
  party_id text not null,offer_id uuid not null references public.paid_watch_party_offers(id) on delete restrict,
  buyer_id uuid not null,expires_at timestamptz not null,
  state text not null default 'held' check(state in('held','pending','fulfilled','reconciliation_required','released')),
  created_at timestamptz not null default clock_timestamp()
);
alter table private.creator_party_ticket_reservations enable row level security;
alter table private.creator_party_ticket_reservations force row level security;
revoke all on private.creator_party_ticket_reservations from public,anon,authenticated,service_role;

create function private.guard_creator_room_session_history()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'room_session_history_immutable'; end if;
  if row(new.id,new.party_id,new.host_id,new.room_type,new.source_type,new.source_id,new.title_id,new.opened_at)
    is distinct from row(old.id,old.party_id,old.host_id,old.room_type,old.source_type,old.source_id,old.title_id,old.opened_at)
    or (old.ended_at is not null and new is distinct from old)
  then raise exception 'room_session_history_immutable'; end if;
  return new;
end; $$;
create trigger creator_room_session_history before update or delete on private.creator_room_sessions
for each row execute function private.guard_creator_room_session_history();
revoke all on function private.guard_creator_room_session_history() from public,anon,authenticated,service_role;

create function private.guard_creator_room_claim_history()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'room_seat_claim_history_immutable'; end if;
  if row(new.id,new.room_session_id,new.party_id,new.source_kind,new.created_at)
    is distinct from row(old.id,old.room_session_id,old.party_id,old.source_kind,old.created_at)
    or (old.buyer_id is not null and new.buyer_id is distinct from old.buyer_id)
    or (old.auction_id is not null and new.auction_id is distinct from old.auction_id)
    or (old.paid_at is not null and new.paid_at is distinct from old.paid_at)
    or (old.availability_confirmed_at is not null and new.availability_confirmed_at is distinct from old.availability_confirmed_at)
    or (old.purchase_intent_id is not null and new.purchase_intent_id is distinct from old.purchase_intent_id)
    or (old.access_grant_id is not null and new.access_grant_id is distinct from old.access_grant_id)
    or (old.refund_review_eligible and not new.refund_review_eligible)
  then raise exception 'room_seat_claim_history_immutable'; end if;
  return new;
end; $$;
create trigger creator_room_claim_history before update or delete on private.creator_room_seat_claims
for each row execute function private.guard_creator_room_claim_history();
revoke all on function private.guard_creator_room_claim_history() from public,anon,authenticated,service_role;

create function private.ensure_creator_room_session(p_party_id text)
returns private.creator_room_sessions language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms;s private.creator_room_sessions;
begin
  select * into r from public.watch_party_rooms where party_id=p_party_id for update;
  if r.party_id is null or not r.is_active or r.room_type not in('live','title') then raise exception 'auction_room_unavailable'; end if;
  select * into s from private.creator_room_sessions where party_id=r.party_id and ended_at is null for update;
  if s.id is not null then
    if row(s.host_id,s.room_type,s.source_type,s.source_id,s.title_id)
      is distinct from row(r.host_user_id,r.room_type,r.source_type,r.source_id,r.title_id)
    then raise exception 'room_session_source_changed'; end if;
    return s;
  end if;
  insert into private.creator_room_sessions(party_id,host_id,room_type,source_type,source_id,title_id)
    values(r.party_id,r.host_user_id,r.room_type,r.source_type,r.source_id,r.title_id) returning * into s;
  return s;
end; $$;
revoke all on function private.ensure_creator_room_session(text) from public,anon,authenticated,service_role;

create function private.creator_room_session_current(p_session_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.creator_room_sessions s join public.watch_party_rooms r on r.party_id=s.party_id
   where s.id=p_session_id and s.ended_at is null and r.is_active
     and row(s.host_id,s.room_type,s.source_type,s.source_id,s.title_id)
       is not distinct from row(r.host_user_id,r.room_type,r.source_type,r.source_id,r.title_id));
$$;
revoke all on function private.creator_room_session_current(uuid) from public,anon,authenticated,service_role;

-- Deliberately fail closed until the subsequent dedicated signed-receipt
-- projector supplies its exact provider/intent/ledger/grant identity predicate.
-- Neither a private claim's status nor a host toggle is payment evidence.
create function private.creator_room_seat_payment_verified(p_claim_id uuid)
returns boolean language sql stable security definer set search_path='' as $$ select false; $$;
revoke all on function private.creator_room_seat_payment_verified(uuid) from public,anon,authenticated,service_role;

create function private.creator_room_seat_subject_allowed(p_party_id text,p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms;
begin
  select * into r from public.watch_party_rooms where party_id=p_party_id;
  if r.party_id is null or not r.is_active or p_user_id is null
    or public.is_account_access_restricted(p_user_id::text) or public.is_account_access_restricted(r.host_user_id::text)
    or exists(select 1 from public.channel_audience_blocks b where (b.channel_user_id=r.host_user_id::text and b.blocked_user_id=p_user_id::text) or (b.channel_user_id=p_user_id::text and b.blocked_user_id=r.host_user_id::text))
    or not public.wave1_creator_money_subject_authorized_internal(r.host_user_id)
  then return false; end if;
  if r.room_type='title' and not private.party_room_viewer_source_allowed(r,p_user_id) then return false; end if;
  return true;
end; $$;
revoke all on function private.creator_room_seat_subject_allowed(text,uuid) from public,anon,authenticated,service_role;

create function private.creator_room_paid_seat_claim(p_party_id text,p_user_id uuid)
returns private.creator_room_seat_claims language plpgsql stable security definer set search_path='' as $$
declare c private.creator_room_seat_claims;
begin
  if not private.creator_room_seat_subject_allowed(p_party_id,p_user_id) then return c; end if;
  select claim.* into c from private.creator_room_seat_claims claim
    join private.creator_room_sessions s on s.id=claim.room_session_id
    where claim.party_id=p_party_id and claim.buyer_id=p_user_id and s.ended_at is null
      and claim.state in('paid_reserved','available') and claim.paid_at is not null
      and private.creator_room_session_current(s.id) and private.creator_room_seat_payment_verified(claim.id)
    order by claim.created_at,claim.id limit 1;
  return c;
end; $$;
revoke all on function private.creator_room_paid_seat_claim(text,uuid) from public,anon,authenticated,service_role;

create function private.creator_room_seat_inventory(p_party_id text,p_kind text,p_except_claim_id uuid default null,p_except_user_id text default null)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare result integer;host_id uuid;
begin
  select host_user_id into host_id from public.watch_party_rooms where party_id=p_party_id for update;
  if p_kind='stage_reserved_seat' then
    -- Reserve the host's slot even while the host is temporarily disconnected.
    -- A paid guest's presence/approval is the SAME reserved slot, not two.
    select 1+count(*)::integer into result from (
      select coalesce(c.buyer_id::text,'claim:'||c.id::text) identity from private.creator_room_seat_claims c
        join private.creator_room_sessions s on s.id=c.room_session_id
        where c.party_id=p_party_id and c.source_kind=p_kind and s.ended_at is null and c.id is distinct from p_except_claim_id
          and (p_except_user_id is null or c.buyer_id::text is distinct from p_except_user_id)
          and (c.state in('payment_pending','paid_reserved','available','unfulfilled')
            or (c.state in('auction_hold','winner_hold') and c.expires_at>clock_timestamp()))
      union
      select m.user_id from public.watch_party_room_memberships m where m.party_id=p_party_id
        and m.user_id<>host_id::text and m.user_id is distinct from p_except_user_id
        and m.membership_state in('active','reconnecting') and (m.stage_role='speaker' or m.can_speak)
        and m.last_seen_at>clock_timestamp()-interval '45 seconds'
    ) occupied;
  elsif p_kind='party_admission' then
    select count(*)::integer into result from (
      select t.buyer_id::text identity from public.paid_watch_party_tickets t where t.party_id=p_party_id
        and t.status='active' and t.refunded_at is null and t.revoked_at is null
        and (t.expires_at is null or t.expires_at>clock_timestamp()) and t.buyer_id::text is distinct from p_except_user_id
      union
      select n.buyer_id::text from private.creator_party_ticket_reservations n join private.creator_room_sessions s on s.id=n.room_session_id
        where n.party_id=p_party_id and s.ended_at is null and n.buyer_id::text is distinct from p_except_user_id
          and (n.state in('pending','reconciliation_required') or (n.state='held' and n.expires_at>clock_timestamp()))
      union
      select coalesce(c.buyer_id::text,'claim:'||c.id::text) from private.creator_room_seat_claims c
        join private.creator_room_sessions s on s.id=c.room_session_id
        where c.party_id=p_party_id and c.source_kind=p_kind and s.ended_at is null and c.id is distinct from p_except_claim_id
          and (p_except_user_id is null or c.buyer_id::text is distinct from p_except_user_id)
          and (c.state in('payment_pending','paid_reserved','available','unfulfilled')
            or (c.state in('auction_hold','winner_hold') and c.expires_at>clock_timestamp()))
    ) occupied;
  else raise exception 'auction_room_source_unsupported'; end if;
  return result;
end; $$;
revoke all on function private.creator_room_seat_inventory(text,text,uuid,text) from public,anon,authenticated,service_role;

create function private.close_creator_room_session_on_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare s private.creator_room_sessions;why text;
begin
  if tg_op='DELETE' then why:='room_deleted';
  elsif old.is_active and not new.is_active then why:='creator_ended_room';
  elsif row(new.party_id,new.host_user_id,new.room_type,new.source_type,new.source_id,new.title_id)
    is distinct from row(old.party_id,old.host_user_id,old.room_type,old.source_type,old.source_id,old.title_id)
  then why:='room_identity_changed'; else return new; end if;
  for s in select * from private.creator_room_sessions where party_id=old.party_id and ended_at is null for update loop
    update private.creator_room_sessions set ended_at=clock_timestamp(),end_reason=why where id=s.id;
    update private.creator_party_ticket_reservations set state=case when state in('pending','reconciliation_required')
      then 'reconciliation_required' else 'released' end where room_session_id=s.id and state not in('fulfilled','released');
    update private.creator_room_seat_claims set
      state=case when state in('paid_reserved','available','payment_pending','unfulfilled')
        then case when availability_confirmed_at is null then 'unfulfilled' else 'ended' end else 'released' end,
      refund_review_eligible=refund_review_eligible or (paid_at is not null and availability_confirmed_at is null),
      reason=case when availability_confirmed_at is null and state in('paid_reserved','available','payment_pending','unfulfilled')
        then why||'_availability_unconfirmed' else why end,updated_at=clock_timestamp()
      where room_session_id=s.id and state not in('released','ended');
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
end; $$;
create trigger close_creator_room_commercial_session before update or delete on public.watch_party_rooms
for each row execute function private.close_creator_room_session_on_change();
revoke all on function private.close_creator_room_session_on_change() from public,anon,authenticated,service_role;

create function private.guard_reserved_stage_capacity()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms;
begin
  select * into r from public.watch_party_rooms where party_id=new.party_id for update;
  if r.room_type<>'live' or new.user_id=r.host_user_id::text then return new; end if;
  if new.membership_state in('active','reconnecting') and (new.stage_role='speaker' or new.can_speak) then
    if not r.is_active then raise exception 'auction_room_unavailable'; end if;
    if private.creator_room_seat_inventory(r.party_id,'stage_reserved_seat',null,new.user_id)>=4
    then raise exception 'speaker_seats_full'; end if;
    -- Payment does not approve media: this only records an independent, already
    -- authorized host/service promotion. Self heartbeat cannot manufacture it.
    if (auth.uid()=r.host_user_id or auth.role()='service_role') and (tg_op='INSERT'
      or old.stage_role is distinct from 'speaker' or not old.can_speak) then
      update private.creator_room_seat_claims claim set host_approved_at=coalesce(claim.host_approved_at,clock_timestamp()),updated_at=clock_timestamp()
      from private.creator_room_sessions s where claim.room_session_id=s.id and s.ended_at is null
        and claim.party_id=r.party_id and claim.buyer_id::text=new.user_id and claim.source_kind='stage_reserved_seat'
        and claim.state in('paid_reserved','available') and private.creator_room_seat_payment_verified(claim.id);
    end if;
  end if;
  return new;
end; $$;
create trigger zz_reserved_stage_capacity before insert or update on public.watch_party_room_memberships
for each row execute function private.guard_reserved_stage_capacity();
revoke all on function private.guard_reserved_stage_capacity() from public,anon,authenticated,service_role;

create function private.record_reserved_room_availability()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- An independent current buyer action confirms an available spot, not RTP,
  -- camera activation, spoken words, or a completed provider settlement.
  if auth.uid()::text is distinct from new.user_id or not public.whole_app_exact_current_session_authority_internal()
    or new.membership_state not in('active','reconnecting') then return new; end if;
  update private.creator_room_seat_claims c set state='available',availability_confirmed_at=coalesce(c.availability_confirmed_at,clock_timestamp()),
    updated_at=clock_timestamp() from private.creator_room_sessions s
    where c.room_session_id=s.id and s.ended_at is null and c.party_id=new.party_id and c.buyer_id=auth.uid()
      and c.state in('paid_reserved','available') and private.creator_room_session_current(s.id)
      and private.creator_room_seat_payment_verified(c.id)
      and (c.source_kind='party_admission' or (c.host_approved_at is not null and new.stage_role='speaker' and new.can_speak));
  return new;
end; $$;
create trigger zzz_reserved_room_availability after insert or update on public.watch_party_room_memberships
for each row execute function private.record_reserved_room_availability();
revoke all on function private.record_reserved_room_availability() from public,anon,authenticated,service_role;

create function public.read_my_creator_room_seat_claims(p_party_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.whole_app_exact_current_session_authority_internal()
    or public.is_account_access_restricted(auth.uid()::text) then raise exception 'buyer_session_authority_required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'partyId',c.party_id,'roomSessionId',c.room_session_id,
    'sourceKind',c.source_kind,'state',c.state,'paidAt',c.paid_at,'hostApprovedAt',c.host_approved_at,
    'availabilityConfirmedAt',c.availability_confirmed_at,'refundReviewEligible',c.refund_review_eligible,
    'reason',c.reason,'sessionEndedAt',s.ended_at,'admissionIncluded',true,'sameAccountRejoin',true,
    'mediaPublicationProven',false) order by c.created_at desc) from private.creator_room_seat_claims c
    join private.creator_room_sessions s on s.id=c.room_session_id where c.party_id=p_party_id and c.buyer_id=auth.uid()),'[]'::jsonb);
end; $$;
revoke all on function public.read_my_creator_room_seat_claims(text) from public,anon,authenticated,service_role;
grant execute on function public.read_my_creator_room_seat_claims(text) to authenticated;

alter function public.watch_party_room_self_access_allowed_internal(text,text) rename to watch_party_room_access_pre_reserved_claim;
revoke all on function public.watch_party_room_access_pre_reserved_claim(text,text) from public,anon,authenticated,service_role;
create function public.watch_party_room_self_access_allowed_internal(p_party_id text,p_user_id text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare c private.creator_room_seat_claims;r public.watch_party_rooms;u uuid;
begin
  -- Auth identifiers are PostgreSQL UUIDs. Their UUID version/variant bits do
  -- not establish authority; exact current session and subject checks do.
  if p_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    u:=p_user_id::uuid;
    select * into r from public.watch_party_rooms where party_id=upper(btrim(p_party_id));
    if auth.role()='service_role' or (auth.uid() in(u,r.host_user_id) and public.whole_app_exact_current_session_authority_internal()) then
      c:=private.creator_room_paid_seat_claim(r.party_id,u);
      if c.id is not null then return true; end if;
    end if;
  end if;
  return public.watch_party_room_access_pre_reserved_claim(p_party_id,p_user_id);
end; $$;
revoke all on function public.watch_party_room_self_access_allowed_internal(text,text) from public,anon,authenticated,service_role;

alter function public.resolve_live_watch_party_money_access_as_service_internal(text,uuid)
  rename to resolve_live_watch_party_money_access_pre_reserved_claim;
revoke all on function public.resolve_live_watch_party_money_access_pre_reserved_claim(text,uuid) from public,anon,authenticated,service_role;
create function public.resolve_live_watch_party_money_access_as_service_internal(p_party_id text,p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c private.creator_room_seat_claims;
begin
  c:=private.creator_room_paid_seat_claim(p_party_id,p_user_id);
  if c.id is not null and c.source_kind='stage_reserved_seat' then
    return jsonb_build_object('allowed',true,'paidSeatRequired',true,'speakerEligible',true,'hostAuthority',false,
      'expiresAt',clock_timestamp()+interval '30 seconds','reason','verified_reserved_room_seat','reservedSeatClaimId',c.id,
      'admissionIncluded',true,'requiresHostApproval',true,'grantsPublish',false,'partyId',c.party_id,'roomSessionId',c.room_session_id);
  end if;
  return public.resolve_live_watch_party_money_access_pre_reserved_claim(p_party_id,p_user_id);
end; $$;
revoke all on function public.resolve_live_watch_party_money_access_as_service_internal(text,uuid) from public,anon,authenticated,service_role;

alter function public.resolve_live_watch_party_money_access(text) rename to resolve_live_watch_party_money_access_pre_reserved_ui;
revoke all on function public.resolve_live_watch_party_money_access_pre_reserved_ui(text) from public,anon,authenticated,service_role;
create function public.resolve_live_watch_party_money_access(p_party_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c private.creator_room_seat_claims;approved boolean;
begin
  if auth.uid() is not null and public.whole_app_exact_current_session_authority_internal() then
    c:=private.creator_room_paid_seat_claim(p_party_id,auth.uid());
    if c.id is not null and c.source_kind='stage_reserved_seat' then
      select exists(select 1 from public.watch_party_room_memberships m where m.party_id=p_party_id and m.user_id=auth.uid()::text
        and m.membership_state in('active','reconnecting') and m.stage_role='speaker' and m.can_speak) into approved;
      return jsonb_build_object('allowed',true,'reason','verified_reserved_room_seat','viewerOnly',not approved,
        'seatEligible',true,'seatApproved',approved,'hostAuthority',false,'grantsPublish',false,'requiresHostApproval',true,
        'reservedSeatClaimId',c.id,'admissionIncluded',true,'sameAccountRejoin',true,'partyId',c.party_id,'roomSessionId',c.room_session_id);
    end if;
  end if;
  return public.resolve_live_watch_party_money_access_pre_reserved_ui(p_party_id);
end; $$;
revoke all on function public.resolve_live_watch_party_money_access(text) from public,anon,authenticated,service_role;
grant execute on function public.resolve_live_watch_party_money_access(text) to authenticated;

alter function public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid) rename to resolve_watch_party_livekit_pre_reserved_claim;
revoke all on function public.resolve_watch_party_livekit_pre_reserved_claim(text,uuid,uuid) from public,anon,authenticated,service_role;
create function public.resolve_watch_party_livekit_viewer_authority(p_party_id text,p_user_id uuid,p_session_generation uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c private.creator_room_seat_claims;
begin
  if auth.role()='service_role' and (p_session_generation is null
    or public.money_purchase_intent_session_authorized_internal(p_user_id,p_session_generation::text)) then
    c:=private.creator_room_paid_seat_claim(p_party_id,p_user_id);
    if c.id is not null then
      return jsonb_build_object('allowed',true,'hostAuthority',false,'paidSeatRequired',true,
        'speakerEligible',c.source_kind='stage_reserved_seat','expiresAt',clock_timestamp()+interval '30 seconds',
        'reason','verified_reserved_room_seat','reservedSeatClaimId',c.id,'grantsPublish',false,'partyId',c.party_id,'roomSessionId',c.room_session_id);
    end if;
  end if;
  return public.resolve_watch_party_livekit_pre_reserved_claim(p_party_id,p_user_id,p_session_generation);
end; $$;
revoke all on function public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid) to service_role;

alter function public.resolve_paid_watch_party_ticket_access(text) rename to resolve_paid_watch_party_ticket_pre_reserved_claim;
revoke all on function public.resolve_paid_watch_party_ticket_pre_reserved_claim(text) from public,anon,authenticated,service_role;
create function public.resolve_paid_watch_party_ticket_access(p_party_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c private.creator_room_seat_claims;
begin
  if auth.uid() is not null and public.whole_app_exact_current_session_authority_internal() then
    c:=private.creator_room_paid_seat_claim(p_party_id,auth.uid());
    if c.id is not null and c.source_kind='party_admission' then
      return jsonb_build_object('allowed',true,'reason','verified_reserved_room_admission','requiresPurchase',false,
        'reservedSeatClaimId',c.id,'admissionIncluded',true,'grantsPublish',false,'partyId',c.party_id,'roomSessionId',c.room_session_id);
    end if;
  end if;
  return public.resolve_paid_watch_party_ticket_pre_reserved_claim(p_party_id);
end; $$;
revoke all on function public.resolve_paid_watch_party_ticket_access(text) from public,anon,authenticated,service_role;
grant execute on function public.resolve_paid_watch_party_ticket_access(text) to authenticated,service_role;

create function public.set_creator_room_participant_authority_service(
  p_party_id text,p_actor_id uuid,p_actor_session_id uuid,p_target_id uuid,
  p_stage_role text,p_host_muted boolean,p_membership_state text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms;m public.watch_party_room_memberships;a jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  if p_actor_id is null or p_target_id is null or p_stage_role not in('host','speaker','listener')
    or p_membership_state not in('active','removed') then raise exception 'room_participant_change_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('watch-party-member:'||p_party_id||':'||p_target_id::text,0));
  select * into r from public.watch_party_rooms where party_id=p_party_id for update;
  if r.party_id is null or r.room_type not in('live','title') or not r.is_active or r.host_user_id is distinct from p_actor_id
    or not public.money_purchase_intent_session_authorized_internal(p_actor_id,p_actor_session_id::text)
    or public.is_account_access_restricted(p_actor_id::text)
    or (p_stage_role='host' and p_target_id<>r.host_user_id)
  then raise exception 'exact_live_stage_host_required'; end if;
  a:=public.resolve_watch_party_livekit_viewer_authority(r.party_id,p_actor_id,p_actor_session_id);
  if coalesce((a->>'allowed')::boolean,false) is not true or coalesce((a->>'hostAuthority')::boolean,false) is not true
  then raise exception 'exact_live_stage_host_required'; end if;
  select * into m from public.watch_party_room_memberships where party_id=r.party_id and user_id=p_target_id::text for update;
  if m.party_id is null or m.membership_state in('left','removed') then raise exception 'watch_party_membership_unavailable'; end if;
  if p_membership_state<>'removed' then
    a:=public.resolve_watch_party_livekit_viewer_authority(r.party_id,p_target_id,null);
    if coalesce((a->>'allowed')::boolean,false) is not true
      or (p_stage_role='speaker' and coalesce((a->>'speakerEligible')::boolean,false) is not true)
    then raise exception 'exact_live_seat_eligibility_authority_required'; end if;
  end if;
  update public.watch_party_room_memberships set stage_role=p_stage_role,can_speak=p_membership_state<>'removed' and p_stage_role in('host','speaker'),
    host_muted=coalesce(p_host_muted,false),is_muted=coalesce(p_host_muted,false) or self_muted,
    membership_state=p_membership_state,left_at=case when p_membership_state='removed' then clock_timestamp() else null end,
    camera_enabled=p_membership_state<>'removed' and not coalesce(p_host_muted,false) and not self_muted and p_stage_role in('host','speaker'),
    mic_enabled=p_membership_state<>'removed' and not coalesce(p_host_muted,false) and not self_muted and p_stage_role in('host','speaker'),
    updated_at=clock_timestamp(),last_seen_at=clock_timestamp()
    where party_id=r.party_id and user_id=p_target_id::text returning * into m;
  return jsonb_build_object('user_id',m.user_id,'party_id',m.party_id,'stage_role',m.stage_role,'membership_state',m.membership_state);
end; $$;
revoke all on function public.set_creator_room_participant_authority_service(text,uuid,uuid,uuid,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.set_creator_room_participant_authority_service(text,uuid,uuid,uuid,text,boolean,text) to service_role;

create function private.guard_party_ticket_reserved_inventory()
returns trigger language plpgsql security definer set search_path='' as $$
declare o public.paid_watch_party_offers;r public.watch_party_rooms;s private.creator_room_sessions;
begin
  if new.source_type<>'watch_party_live' or new.product_type<>'watch_party_live_ticket' then return new; end if;
  select * into o from public.paid_watch_party_offers where id=new.source_id for update;
  select * into r from public.watch_party_rooms where party_id=o.party_id for update;
  if r.party_id is null or r.room_type<>'title' or not r.is_active or o.creator_id<>r.host_user_id
  then raise exception 'auction_room_unavailable'; end if;
  s:=private.ensure_creator_room_session(r.party_id);
  if exists(select 1 from private.creator_room_seat_claims c where c.room_session_id=s.id and c.buyer_id=new.user_id
    and c.state in('winner_hold','payment_pending','paid_reserved','available','unfulfilled'))
  then raise exception 'room_seat_existing_award_or_payment'; end if;
  if o.seat_limit is not null and private.creator_room_seat_inventory(r.party_id,'party_admission')>=o.seat_limit
  then raise exception 'room_admission_sold_out'; end if;
  return new;
end; $$;
create trigger guard_party_ticket_reserved_inventory before insert on public.money_purchase_intents
for each row execute function private.guard_party_ticket_reserved_inventory();
revoke all on function private.guard_party_ticket_reserved_inventory() from public,anon,authenticated,service_role;
create function private.reserve_native_party_ticket()
returns trigger language plpgsql security definer set search_path='' as $$
declare o public.paid_watch_party_offers;s private.creator_room_sessions;
begin
  if new.source_type<>'watch_party_live' or new.product_type<>'watch_party_live_ticket' then return new; end if;
  select * into o from public.paid_watch_party_offers where id=new.source_id;
  select * into s from private.creator_room_sessions where party_id=o.party_id and ended_at is null;
  if s.id is null then raise exception 'room_session_required'; end if;
  insert into private.creator_party_ticket_reservations(purchase_intent_id,room_session_id,party_id,offer_id,buyer_id,expires_at)
    values(new.id,s.id,o.party_id,o.id,new.user_id,new.expires_at);
  return new;
end; $$;
create trigger reserve_native_party_ticket after insert on public.money_purchase_intents
for each row execute function private.reserve_native_party_ticket();
revoke all on function private.reserve_native_party_ticket() from public,anon,authenticated,service_role;
create function private.mark_native_party_checkout_claim()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.checkout_attempt_id is not null and old.checkout_attempt_id is null then
    update private.creator_party_ticket_reservations set state='pending' where purchase_intent_id=new.id and state='held';
  end if;
  return new;
end; $$;
create trigger mark_native_party_checkout_claim after update of checkout_attempt_id on public.money_purchase_intents
for each row execute function private.mark_native_party_checkout_claim();
revoke all on function private.mark_native_party_checkout_claim() from public,anon,authenticated,service_role;
create function private.guard_party_ticket_shared_capacity()
returns trigger language plpgsql security definer set search_path='' as $$
declare o public.paid_watch_party_offers;
begin
  if new.status<>'active' then return new; end if;
  select * into o from public.paid_watch_party_offers where id=new.offer_id for update;
  perform 1 from public.watch_party_rooms where party_id=o.party_id for update;
  if o.seat_limit is not null and private.creator_room_seat_inventory(o.party_id,'party_admission',null,new.buyer_id::text)>=o.seat_limit
  then raise exception 'room_admission_sold_out'; end if;
  return new;
end; $$;
create trigger zz_party_ticket_shared_capacity before insert or update of status on public.paid_watch_party_tickets
for each row execute function private.guard_party_ticket_shared_capacity();
revoke all on function private.guard_party_ticket_shared_capacity() from public,anon,authenticated,service_role;
create function private.fulfill_native_party_ticket_hold()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='active' then
    update private.creator_party_ticket_reservations n set state='fulfilled'
    from public.access_grants g where g.id=new.access_grant_id and g.metadata->>'purchase_intent_id'=n.purchase_intent_id::text
      and n.buyer_id=new.buyer_id and n.party_id=new.party_id;
  end if;
  return new;
end; $$;
create trigger fulfill_native_party_ticket_hold after insert or update of status on public.paid_watch_party_tickets
for each row execute function private.fulfill_native_party_ticket_hold();
revoke all on function private.fulfill_native_party_ticket_hold() from public,anon,authenticated,service_role;
create function private.guard_party_offer_inventory_floor()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.watch_party_rooms where party_id=new.party_id for update;
  if new.seat_limit is not null and new.seat_limit<private.creator_room_seat_inventory(new.party_id,'party_admission')
  then raise exception 'room_admission_capacity_below_committed'; end if;
  if new.seat_limit is null and exists(select 1 from private.creator_room_seat_claims c
    join private.creator_room_sessions s on s.id=c.room_session_id where c.party_id=new.party_id and s.ended_at is null
      and c.source_kind='party_admission' and c.state not in('released','ended'))
  then raise exception 'room_auction_capacity_required'; end if;
  return new;
end; $$;
create trigger guard_party_offer_inventory_floor before update of seat_limit on public.paid_watch_party_offers
for each row execute function private.guard_party_offer_inventory_floor();
revoke all on function private.guard_party_offer_inventory_floor() from public,anon,authenticated,service_role;

-- Preserve signed charge evidence: shared-inventory denial happens in the
-- existing provider reconciliation branch BEFORE any grant/ticket projection.
do $patch$
declare f regprocedure; body text; needle text := $needle$      elsif v_seat_offer."seat_limit" is not null and (
        select count(*)::integer from public."paid_watch_party_tickets" ticket
        where ticket."offer_id"=v_seat_offer."id"
          and ticket."status"='active'
          and ticket."refunded_at" is null and ticket."revoked_at" is null
          and (ticket."expires_at" is null or ticket."expires_at">v_now)
      )$needle$;
begin
  select p.oid::regprocedure into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='process_creator_money_provider_event_pre_source_lock';
  body:=pg_get_functiondef(f);
  if position(needle in body)=0 then raise exception 'party_receipt_inventory_patch_mismatch'; end if;
  execute replace(body,needle,$replacement$      elsif exists(select 1 from private.creator_party_ticket_reservations n where n.purchase_intent_id=v_intent.id
        and not private.creator_room_session_current(n.room_session_id)) then
        v_ignore_reason := 'seat_pass_room_session_ended';
      elsif v_seat_offer."seat_limit" is not null and
        private.creator_room_seat_inventory(v_seat_offer."party_id",'party_admission',null,p_user_id::text)$replacement$);
end; $patch$;
