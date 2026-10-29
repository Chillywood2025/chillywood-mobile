begin;

-- The old adapter treated every refund as full without recording its amount.
-- Keep historical amounts unknown and never silently reopen canceled shipments.
alter table public.merch_orders
  add column refunded_amount_minor integer,
  add column stripe_charge_id text,
  add constraint merch_orders_refunded_amount_check check (
    refunded_amount_minor is null or
    (refunded_amount_minor >= 0 and amount_total_minor is not null
      and refunded_amount_minor <= amount_total_minor)
  );
create unique index merch_orders_stripe_charge_unique
  on public.merch_orders(stripe_charge_id) where stripe_charge_id is not null;
alter table public.stripe_merch_events
  add column raw_event_hash text,
  add constraint stripe_merch_events_raw_hash_check check (
    raw_event_hash is null or raw_event_hash ~ '^[a-f0-9]{64}$'
  );

create or replace function public.process_stripe_merch_webhook_lifecycle(
  p_event_id text, p_event_type text, p_raw_event_hash text, p_facts jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_event public.stripe_merch_events%rowtype;
  v_order public.merch_orders%rowtype;
  v_object_id text := p_facts->>'object_id';
  v_pi text := nullif(p_facts->>'payment_intent_id','');
  v_order_id uuid;
  v_checkout boolean := p_event_type like 'checkout.session.%';
  v_amount bigint;
  v_received bigint;
  v_refunded bigint;
  v_success boolean := false;
  v_failure boolean := false;
  v_pending boolean := false;
  v_reason text := 'unsupported_event';
  v_valid boolean := true;
  v_updated boolean := false;
  v_full_refund boolean;
  v_terminal_refund boolean;
  v_disputed boolean;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]{1,240}$'
    or p_event_type is null or length(p_event_type)>120
    or p_raw_event_hash is null or p_raw_event_hash !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_facts) is distinct from 'object' then
    raise exception 'merch_event_invalid' using errcode='22023';
  end if;
  -- Test-only authority is enforced here as well as in the signed Edge adapter.
  if p_facts->'event_livemode' is distinct from 'false'::jsonb
    or p_facts->'object_livemode' is distinct from 'false'::jsonb
    or nullif(p_facts->>'event_account_id','') is not null then
    return jsonb_build_object('status','ignored','reason','test_environment_required',
      'eventStored',false,'orderUpdated',false,'retryable',false);
  end if;

  -- No provider I/O occurs here. The receipt and financial projection commit
  -- together. A failed transaction cannot acknowledge unfinished order work.
  perform pg_advisory_xact_lock(hashtextextended('stripe_merch_event:'||p_event_id,0));
  insert into public.stripe_merch_events(stripe_event_id,event_type,environment,
    status,object_id,raw_event_hash,metadata)
  values(p_event_id,p_event_type,'sandbox','received',v_object_id,p_raw_event_hash,
    jsonb_build_object('physical_merch_only',true,'live_money_action',false))
  on conflict(stripe_event_id) do nothing;
  select * into strict v_event from public.stripe_merch_events
    where stripe_event_id=p_event_id for update;
  if v_event.event_type is distinct from p_event_type
    or v_event.object_id is distinct from v_object_id
    or v_event.environment <> 'sandbox'
    or (v_event.raw_event_hash is not null and v_event.raw_event_hash <> p_raw_event_hash) then
    raise exception 'merch_event_identity_conflict' using errcode='22023';
  end if;
  if v_event.status in ('processed','ignored') then
    return jsonb_build_object('status','duplicate','reason','event_already_finalized',
      'eventStored',false,'orderUpdated',false,'orderId',v_event.linked_order_id,'retryable',false);
  end if;
  -- Legacy received/failed/duplicate rows are retryable; a verified replay binds
  -- their previously unrecorded body hash. Legacy terminal rows stay terminal.
  update public.stripe_merch_events set raw_event_hash=p_raw_event_hash,
    status='received',processed_at=null where id=v_event.id;

  if p_event_type not in ('checkout.session.completed','checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed','checkout.session.expired',
    'payment_intent.succeeded','payment_intent.payment_failed','charge.refunded','charge.dispute.created') then
    v_valid:=false;
  else
    if nullif(p_facts->>'metadata_order_id','') is not null then
      if p_facts->>'metadata_order_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        v_order_id:=(p_facts->>'metadata_order_id')::uuid;
      else v_valid:=false; v_reason:='order_identity_mismatch'; end if;
    end if;
    if v_valid then
      select * into v_order from public.merch_orders
      where (v_order_id is not null and id=v_order_id)
        or (v_order_id is null and v_checkout and stripe_checkout_session_id=v_object_id)
        or (v_order_id is null and not v_checkout and stripe_payment_intent_id=v_pi)
      for update;
      if not found then
        return jsonb_build_object('status','pending','reason','order_identity_pending',
          'eventStored',true,'orderUpdated',false,'retryable',true);
      end if;
      if v_event.linked_order_id is not null and v_event.linked_order_id <> v_order.id then
        raise exception 'merch_event_identity_conflict' using errcode='22023';
      end if;
      v_valid:=coalesce(v_order.provider='stripe_physical_goods' and v_order.environment='sandbox'
        and v_order.digital_access_grant_id is null
        and (nullif(p_facts->>'metadata_order_id','') is null or p_facts->>'metadata_order_id'=v_order.id::text)
        and (nullif(p_facts->>'metadata_buyer_id','') is null or p_facts->>'metadata_buyer_id'=v_order.buyer_id::text)
        and (nullif(p_facts->>'metadata_environment','') is null or p_facts->>'metadata_environment'='sandbox')
        and (nullif(p_facts->>'metadata_rail','') is null or p_facts->>'metadata_rail'='physical_merch'),false);
      v_reason:='order_identity_mismatch';
    end if;
    if v_valid then
      -- Only the exact stored Checkout session may bind an initially null PI.
      if v_checkout then
        if v_order.stripe_checkout_session_id is null then
          return jsonb_build_object('status','pending','reason','checkout_identity_pending',
            'eventStored',true,'orderUpdated',false,'orderId',v_order.id,'retryable',true);
        end if;
        v_valid:=v_object_id=v_order.stripe_checkout_session_id and v_object_id like 'cs_test_%'
          and p_facts->>'object_type'='checkout.session' and p_facts->>'mode'='payment'
          and p_facts->>'client_reference_id'=v_order.id::text
          and (v_pi is null or v_pi ~ '^pi_[A-Za-z0-9_]+$')
          and (v_order.stripe_payment_intent_id is null or v_pi=v_order.stripe_payment_intent_id);
      else
        if v_order.stripe_payment_intent_id is null then
          return jsonb_build_object('status','pending','reason','payment_identity_pending',
            'eventStored',true,'orderUpdated',false,'orderId',v_order.id,'retryable',true);
        end if;
        v_valid:=v_pi=v_order.stripe_payment_intent_id and v_pi ~ '^pi_[A-Za-z0-9_]+$';
        if p_event_type like 'payment_intent.%' then
          v_valid:=v_valid and v_object_id=v_pi and p_facts->>'object_type'='payment_intent';
        elsif p_event_type='charge.refunded' then
          v_valid:=v_valid and v_object_id ~ '^ch_[A-Za-z0-9_]+$' and p_facts->>'object_type'='charge'
            and (v_order.stripe_charge_id is null or v_order.stripe_charge_id=v_object_id);
        else
          v_valid:=v_valid and v_object_id ~ '^dp_[A-Za-z0-9_]+$' and p_facts->>'object_type'='dispute'
            and p_facts->>'charge_id' ~ '^ch_[A-Za-z0-9_]+$'
            and (v_order.stripe_charge_id is null or v_order.stripe_charge_id=p_facts->>'charge_id');
        end if;
      end if;
      v_valid:=coalesce(v_valid,false);
    end if;
    if v_valid then
      v_reason:='payment_economics_mismatch';
      if jsonb_typeof(p_facts->'amount_minor')='number' and p_facts->>'amount_minor' ~ '^[0-9]{1,10}$' then
        v_amount:=(p_facts->>'amount_minor')::bigint;
      end if;
      v_valid:=coalesce(v_amount>0 and p_facts->>'currency'=v_order.currency
        and case when p_event_type='charge.dispute.created' then v_amount<=v_order.amount_total_minor
          else v_amount=v_order.amount_total_minor end,false);
    end if;
    if v_valid then
      v_reason:='payment_state_not_confirmed';
      if p_event_type in ('checkout.session.completed','checkout.session.async_payment_succeeded') then
        v_success:=p_facts->>'status'='complete' and p_facts->>'payment_status'='paid' and v_pi is not null;
        v_pending:=p_event_type='checkout.session.completed' and p_facts->>'status'='complete'
          and p_facts->>'payment_status'='unpaid' and v_pi is not null;
        v_valid:=coalesce(v_success or v_pending,false);
      elsif p_event_type='checkout.session.async_payment_failed' then
        v_failure:=p_facts->>'status'='complete' and p_facts->>'payment_status'='unpaid' and v_pi is not null;
        v_valid:=coalesce(v_failure,false);
      elsif p_event_type='checkout.session.expired' then
        v_failure:=p_facts->>'status'='expired' and p_facts->>'payment_status'='unpaid';
        v_valid:=coalesce(v_failure,false);
      elsif p_event_type like 'payment_intent.%' then
        if jsonb_typeof(p_facts->'amount_received_minor')='number'
          and p_facts->>'amount_received_minor' ~ '^[0-9]{1,10}$' then
          v_received:=(p_facts->>'amount_received_minor')::bigint;
        end if;
        v_success:=p_event_type='payment_intent.succeeded' and p_facts->>'status'='succeeded' and v_received=v_amount;
        v_failure:=p_event_type='payment_intent.payment_failed' and p_facts->>'status'='requires_payment_method' and v_received=0;
        v_valid:=coalesce(v_success or v_failure,false);
      elsif p_event_type='charge.refunded' then
        if jsonb_typeof(p_facts->'refunded_amount_minor')='number'
          and p_facts->>'refunded_amount_minor' ~ '^[0-9]{1,10}$' then
          v_refunded:=(p_facts->>'refunded_amount_minor')::bigint;
        end if;
        v_valid:=coalesce(v_refunded>0 and v_refunded<=v_amount
          and p_facts->'refunded'=to_jsonb(v_refunded=v_amount),false);
      end if;
    end if;
  end if;

  if v_valid then
    v_terminal_refund:=v_order.payment_status='refunded' or v_order.order_status='refunded'
      or coalesce(v_order.refunded_amount_minor,0)=v_order.amount_total_minor;
    v_disputed:=v_order.payment_status='disputed' or v_order.order_status='chargeback';
    if v_pending then
      update public.merch_orders set stripe_payment_intent_id=coalesce(stripe_payment_intent_id,v_pi)
        where id=v_order.id;
      v_updated:=v_order.stripe_payment_intent_id is null; v_reason:='payment_pending';
    elsif v_success then
      if not v_terminal_refund and not v_disputed then
        update public.merch_orders set stripe_payment_intent_id=coalesce(stripe_payment_intent_id,v_pi),
          payment_status='paid',order_status=case when order_status='fulfilled' then order_status else 'paid' end,
          fulfillment_status=case when fulfillment_status in ('not_started','pending') then 'processing' else fulfillment_status end,
          paid_at=coalesce(paid_at,v_now) where id=v_order.id;
        v_updated:=true; v_reason:='payment_confirmed';
      else v_reason:='terminal_removal_preserved'; end if;
    elsif v_failure then
      if not v_terminal_refund and not v_disputed and v_order.payment_status<>'paid'
        and v_order.paid_at is null and coalesce(v_order.refunded_amount_minor,0)=0 then
        update public.merch_orders set stripe_payment_intent_id=coalesce(stripe_payment_intent_id,v_pi),
          payment_status='failed',order_status=case when p_event_type='checkout.session.expired' then 'canceled' else 'failed' end,
          canceled_at=case when p_event_type='checkout.session.expired' then coalesce(canceled_at,v_now) else canceled_at end
          where id=v_order.id;
        v_updated:=true; v_reason:='payment_failed';
      else v_reason:='confirmed_or_removed_payment_preserved'; end if;
    elsif p_event_type='charge.refunded' then
      v_refunded:=greatest(coalesce(v_order.refunded_amount_minor,0),v_refunded);
      v_full_refund:=v_refunded=v_amount or v_terminal_refund;
      update public.merch_orders set stripe_charge_id=coalesce(stripe_charge_id,v_object_id),
        refunded_amount_minor=v_refunded,refunded_at=coalesce(refunded_at,v_now),
        payment_status=case when v_disputed then payment_status when v_full_refund then 'refunded' else payment_status end,
        order_status=case when v_disputed then order_status when v_full_refund then 'refunded' else order_status end,
        fulfillment_status=case when not v_full_refund or fulfillment_status in ('shipped','delivered','returned')
          then fulfillment_status when v_disputed then fulfillment_status else 'canceled' end
        where id=v_order.id;
      v_updated:=true; v_reason:=case when v_refunded=v_amount then 'full_refund_recorded' else 'partial_refund_recorded' end;
    elsif p_event_type='charge.dispute.created' then
      update public.merch_orders set stripe_charge_id=coalesce(stripe_charge_id,p_facts->>'charge_id'),
        payment_status='disputed',order_status='chargeback',
        fulfillment_status=case when fulfillment_status in ('shipped','delivered','returned') then fulfillment_status else 'blocked' end
        where id=v_order.id;
      v_updated:=true; v_reason:='dispute_recorded';
    end if;
  end if;

  update public.stripe_merch_events set status=case when v_valid then 'processed' else 'ignored' end,
    linked_order_id=v_order.id,processed_at=v_now,
    metadata=jsonb_build_object('physical_merch_only',true,'live_money_action',false,'processing_reason',v_reason)
    where id=v_event.id;
  return jsonb_build_object('status',case when v_valid then 'processed' else 'ignored' end,
    'reason',v_reason,'eventStored',true,'orderUpdated',v_updated,'orderId',v_order.id,'retryable',false);
end;
$$;
revoke all on function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) to service_role;

commit;
