-- A dormant test-only pure-tip checkout remains one immutable provider request
-- across transport retries. No catalog, provider, payout or split is activated.
create table private.creator_tip_checkout_attempts(
  buyer_id uuid not null,request_id uuid not null,session_id uuid not null,
  tip_id uuid not null unique references public.creator_tip_transactions(id),
  request_body jsonb not null check(jsonb_typeof(request_body)='object'),
  created_at timestamptz not null default clock_timestamp(),
  retry_until timestamptz not null default clock_timestamp()+interval '23 hours',
  primary key(buyer_id,request_id)
);
alter table private.creator_tip_checkout_attempts enable row level security;
alter table private.creator_tip_checkout_attempts force row level security;
revoke all on private.creator_tip_checkout_attempts from public,anon,authenticated,service_role;

create function private.guard_creator_tip_checkout_quote()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='creator_tip_checkout_attempts' then raise exception 'tip_checkout_quote_immutable'; end if;
  if exists(select 1 from private.creator_tip_checkout_attempts where tip_id=old.id)
    and row(new.id,new.sender_id,new.creator_id,new.buyer_account_id,new.buyer_session_generation,
      new.tip_amount_cents,new.total_paid_cents,new.currency,new.provider,new.provider_environment,
      new.provider_account_id,new.idempotency_key,new.message_private)
      is distinct from row(old.id,old.sender_id,old.creator_id,old.buyer_account_id,old.buyer_session_generation,
      old.tip_amount_cents,old.total_paid_cents,old.currency,old.provider,old.provider_environment,
      old.provider_account_id,old.idempotency_key,old.message_private)
  then raise exception 'tip_checkout_quote_immutable'; end if;
  return new;
end;
$$;
revoke all on function private.guard_creator_tip_checkout_quote() from public,anon,authenticated,service_role;
create trigger guard_creator_tip_checkout_quote before update or delete on private.creator_tip_checkout_attempts
for each row execute function private.guard_creator_tip_checkout_quote();
create trigger guard_creator_tip_transaction_quote before update on public.creator_tip_transactions
for each row execute function private.guard_creator_tip_checkout_quote();

create function public.reserve_creator_tip_checkout_attempt(p_buyer_id uuid,p_session_id uuid,p_request_id uuid,p_quote jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_tip_checkout_attempts;t public.creator_tip_transactions;
  creator uuid:=(p_quote->>'creatorId')::uuid;amount integer:=(p_quote->>'amountCents')::integer;
  candidate uuid:=(p_quote->>'tipId')::uuid;body jsonb:=p_quote->'body';
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  if not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id)
  then raise exception 'tip_buyer_authority_required'; end if;
  if p_request_id is null or creator is null or creator=p_buyer_id or amount is null or amount<100
    or candidate is null or p_quote->>'currency' is distinct from 'usd'
    or coalesce(p_quote->>'providerAccountId','')!~'^acct_[A-Za-z0-9]+$'
    or body is null or jsonb_typeof(body)<>'object'
  then raise exception 'tip_checkout_quote_invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stripe-tip-checkout:'||p_buyer_id::text||':'||creator::text,0));
  select * into a from private.creator_tip_checkout_attempts where buyer_id=p_buyer_id and request_id=p_request_id for update;
  if a.tip_id is not null then
    select * into t from public.creator_tip_transactions where id=a.tip_id for update;
    if a.session_id is distinct from p_session_id or t.sender_id is distinct from p_buyer_id
      or t.creator_id is distinct from creator or t.tip_amount_cents is distinct from amount or t.currency is distinct from p_quote->>'currency'
      or t.message_private is distinct from nullif(p_quote->>'privateNote','')
    then raise exception 'tip_checkout_request_conflict'; end if;
  else
    if exists(select 1 from public.creator_tip_transactions where sender_id=p_buyer_id and creator_id=creator
      and provider='stripe_connect' and provider_environment='test' and (status in('pending','checkout_started')
        or (status='failed' and (provider_checkout_session_id is not null or provider_payment_intent_id is not null))))
    then raise exception 'tip_checkout_previous_unresolved'; end if;
    if body->>'client_reference_id' is distinct from candidate::text
      or body->>'metadata[chillywood_tip_id]' is distinct from candidate::text
      or body->>'metadata[fan_user_id]' is distinct from p_buyer_id::text
      or body->>'metadata[creator_user_id]' is distinct from creator::text
      or body->>'line_items[0][price_data][currency]' is distinct from 'usd'
      or (body->>'line_items[0][price_data][unit_amount]')::integer is distinct from amount
      or body->>'payment_intent_data[transfer_data][destination]' is distinct from p_quote->>'providerAccountId'
      or body->>'mode' is distinct from 'payment'
      or body->>'expires_at' is null
      or (body->>'expires_at')::bigint<extract(epoch from clock_timestamp())+1800
      or (body->>'expires_at')::bigint>extract(epoch from clock_timestamp())+86400
    then raise exception 'tip_checkout_quote_invalid'; end if;
    insert into public.creator_tip_transactions(id,buyer_account_id,buyer_session_generation,creator_id,creator_net_cents,currency,
      idempotency_key,message_private,metadata,payment_status,platform_fee_cents,provider,provider_account_id,provider_environment,
      provider_fee_cents,payout_status,sender_id,service_fee_cents,status,tip_amount_cents,total_paid_cents)
    values(candidate,p_buyer_id,p_session_id,creator,amount,'usd','tip-attempt-'||candidate::text,nullif(p_quote->>'privateNote',''),
      '{"access_granted":false,"buyer_authority_bound":true,"checkout_created_by":"create-creator-tip-checkout","live_money_action":false,"no_badge":true,"no_digital_content":true,"no_perk":true,"no_room_access":true,"no_vip":true,"pure_contribution_only":true,"test_mode":true}',
      'pending',0,'stripe_connect',p_quote->>'providerAccountId','test',0,'not_payable',p_buyer_id,0,'pending',amount,amount) returning * into t;
    insert into private.creator_tip_checkout_attempts(buyer_id,request_id,session_id,tip_id,request_body)
    values(p_buyer_id,p_request_id,p_session_id,t.id,body) returning * into a;
  end if;
  return jsonb_build_object('tipId',t.id,'requestId',a.request_id,'buyerId',a.buyer_id,'creatorId',t.creator_id,
    'amountCents',t.tip_amount_cents,'currency',t.currency,'status',t.status,'body',a.request_body,
    'providerSessionId',t.provider_checkout_session_id,'idempotencyKey','chillywood-tip-checkout-'||t.idempotency_key,
    'retryAllowed',a.retry_until>clock_timestamp() and (a.request_body->>'expires_at')::bigint>extract(epoch from clock_timestamp()),
    'retryUntil',least(a.retry_until,to_timestamp((a.request_body->>'expires_at')::bigint)));
end;
$$;
revoke all on function public.reserve_creator_tip_checkout_attempt(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.reserve_creator_tip_checkout_attempt(uuid,uuid,uuid,jsonb) to service_role;

create function public.record_creator_tip_checkout_session(p_buyer_id uuid,p_session_id uuid,p_request_id uuid,p_checkout_session_id text,p_payment_intent_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_tip_checkout_attempts;t public.creator_tip_transactions;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select * into a from private.creator_tip_checkout_attempts where buyer_id=p_buyer_id and request_id=p_request_id for update;
  if a.tip_id is null or a.session_id is distinct from p_session_id or p_checkout_session_id!~'^cs_test_[A-Za-z0-9]+$'
    or p_checkout_session_id is null or (p_payment_intent_id is not null and p_payment_intent_id!~'^pi_[A-Za-z0-9]+$')
  then raise exception 'tip_checkout_receipt_invalid'; end if;
  select * into t from public.creator_tip_transactions where id=a.tip_id for update;
  if (t.provider_checkout_session_id is not null and t.provider_checkout_session_id<>p_checkout_session_id)
    or (t.provider_payment_intent_id is not null and p_payment_intent_id is not null and t.provider_payment_intent_id<>p_payment_intent_id)
  then raise exception 'tip_checkout_receipt_conflict'; end if;
  if t.status not in('pending','checkout_started') then
    -- A webhook may win before this HTTP response. Do not issue a direct
    -- UPDATE carrying its finished projector claim, even for unchanged state.
    return jsonb_build_object('tipId',t.id,'status',t.status,
      'providerSessionId',coalesce(t.provider_checkout_session_id,p_checkout_session_id));
  end if;
  -- Record a verified provider fact even if the original actor retired during
  -- IO. Only the existing webhook may project payment, fees and payable state.
  if not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id) then
    -- Omit status from the SET clause: its existing authority trigger must keep
    -- rejecting checkout transitions by retired actors. Provider identity is a
    -- fact needed for later reconciliation, not a new checkout permission.
    update public.creator_tip_transactions set provider_checkout_session_id=p_checkout_session_id,
      provider_payment_intent_id=coalesce(provider_payment_intent_id,p_payment_intent_id),
      checkout_started_at=coalesce(checkout_started_at,clock_timestamp()),updated_at=clock_timestamp()
      where id=t.id returning * into t;
    return jsonb_build_object('tipId',t.id,'status',t.status,'providerSessionId',t.provider_checkout_session_id);
  end if;
  update public.creator_tip_transactions set provider_checkout_session_id=p_checkout_session_id,
    provider_payment_intent_id=coalesce(provider_payment_intent_id,p_payment_intent_id),
    checkout_started_at=coalesce(checkout_started_at,clock_timestamp()),
    status=case when status='pending' then 'checkout_started' else status end,
    updated_at=clock_timestamp() where id=t.id returning * into t;
  return jsonb_build_object('tipId',t.id,'status',t.status,'providerSessionId',t.provider_checkout_session_id);
end;
$$;
revoke all on function public.record_creator_tip_checkout_session(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.record_creator_tip_checkout_session(uuid,uuid,uuid,text,text) to service_role;
