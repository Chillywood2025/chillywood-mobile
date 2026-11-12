-- Sandbox receipts join the existing money ledger, not a second balance.
-- Receipt verification proves gross/refunds, not provider costs or earnings.
create table private.stripe_paid_video_held_receipts (
 observation_id uuid primary key references private.stripe_paid_video_observations(id),
 order_id uuid not null references private.stripe_paid_video_orders(id),
 money_ledger_event_id uuid not null unique references public.money_access_ledger_events(id),
 created_at timestamptz not null default clock_timestamp()
);
alter table private.stripe_paid_video_held_receipts enable row level security;
alter table private.stripe_paid_video_held_receipts force row level security;
revoke all on private.stripe_paid_video_held_receipts from public,anon,authenticated,service_role;
create trigger stripe_paid_video_held_receipts_immutable before update or delete on private.stripe_paid_video_held_receipts
 for each row execute function private.guard_event_ticket_terms_immutable();

create function private.record_stripe_paid_video_held_earning(p_order_id uuid,p_observation_id uuid) returns uuid
language plpgsql set search_path='' as $$
declare o private.stripe_paid_video_orders; observed private.stripe_paid_video_observations;
 existing uuid; provider_id uuid; money_id uuid; previous_refund bigint; delta bigint;
begin
 select * into strict o from private.stripe_paid_video_orders where id=p_order_id for update;
 select * into strict observed from private.stripe_paid_video_observations where id=p_observation_id and order_id=o.id;
 if o.environment is distinct from 'sandbox' or o.currency is distinct from 'usd'
  or row(observed.stripe_account_id,observed.currency,observed.amount_minor,
    observed.checkout_session_id,observed.payment_intent_id,observed.charge_id)
   is distinct from row(o.stripe_account_id,o.currency,o.amount_minor,
    o.checkout_session_id,o.payment_intent_id,o.charge_id)
  or observed.kind not in ('paid','refund') then raise exception 'stripe_video_held_identity_invalid'; end if;
 select money_ledger_event_id into existing from private.stripe_paid_video_held_receipts where observation_id=observed.id;
 if existing is not null then return existing; end if;
 if observed.kind='paid' and exists(select 1 from private.stripe_paid_video_held_receipts h
  join private.stripe_paid_video_observations prior on prior.id=h.observation_id where h.order_id=o.id and prior.kind='paid')
 then raise exception 'stripe_video_duplicate_paid_receipt'; end if;
 if observed.kind='refund' then
  if not exists(select 1 from private.stripe_paid_video_held_receipts h join private.stripe_paid_video_observations prior
   on prior.id=h.observation_id where h.order_id=o.id and prior.kind='paid') then raise exception 'stripe_video_paid_receipt_required'; end if;
  select coalesce(max(prior.refund_amount_minor),0) into previous_refund from private.stripe_paid_video_held_receipts h
   join private.stripe_paid_video_observations prior on prior.id=h.observation_id where h.order_id=o.id and prior.kind='refund';
  if observed.refund_amount_minor<previous_refund or observed.refund_amount_minor>o.amount_minor
   or observed.refund_amount_minor<=0 then raise exception 'stripe_video_refund_amount_invalid'; end if;
  delta:=observed.refund_amount_minor-previous_refund;
 else delta:=o.amount_minor; end if;
 if delta<0 or delta>2147483647 then raise exception 'stripe_video_held_amount_overflow'; end if;
 insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key,metadata)
 values('stripe_connect','stripe-video:'||observed.id,o.buyer_id,'sandbox','stripe_video_'||observed.kind,
  case when observed.kind='refund' then 'refunded' else 'processed' end,'stripe-video:'||observed.id,
  jsonb_build_object('stripe_video_order_id',o.id,'stripe_video_observation_id',observed.id)) returning id into provider_id;
 insert into public.money_access_ledger_events(user_id,creator_id,provider_event_id,event_type,amount_minor,currency,
  environment,payable_state,status,source_type,source_id,metadata)
 values(o.buyer_id,o.creator_id,provider_id,'stripe_video_'||observed.kind,delta::integer,o.currency,'sandbox',
  case when observed.kind='refund' then 'refunded' else 'not_payable' end,
  case when observed.kind='refund' then 'refunded' else 'sandbox_only' end,'paid_content',o.video_id,
  jsonb_build_object('stripe_video_order_id',o.id,'stripe_video_observation_id',observed.id,
   'cost_status','awaiting_authenticated_costs','creator_earnings_known',false,
   'platform_basis_points',2000,'known_cost_policy','known_costs_future_unpaid_adjustments_v1',
   'cumulative_refunded_minor',observed.refund_amount_minor,'financial_authority',false)) returning id into money_id;
 insert into private.stripe_paid_video_held_receipts(observation_id,order_id,money_ledger_event_id)
 values(observed.id,o.id,money_id);
 -- Never invent zero tax/fees, create payable earnings, or invoke the
 -- merch/auction release dispatcher for a video receipt.
 return money_id;
end; $$;
revoke all on function private.record_stripe_paid_video_held_earning(uuid,uuid) from public,anon,authenticated,service_role;
