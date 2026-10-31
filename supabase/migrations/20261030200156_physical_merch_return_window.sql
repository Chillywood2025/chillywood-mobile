-- Owner-approved prospective terms. This does not accept a provider agreement,
-- verify delivery, change historical orders, or create payout authority.
alter table public.merch_orders
 add column return_policy_version text,
 add column return_window_days integer,
 add constraint merch_return_policy_terms_check check (
  (return_policy_version is null and return_window_days is null)
  or (num_nonnulls(return_policy_version,return_window_days)=2
   and return_policy_version='physical_merch_verified_delivery_30d_v1' and return_window_days=30));

create function private.freeze_merch_return_terms() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if row(new.return_policy_version,new.return_window_days) is distinct from row(old.return_policy_version,old.return_window_days)
  then raise exception 'merch_accepted_return_terms_immutable'; end if;
 elsif new.provider='stripe_physical_goods' then
  if num_nonnulls(new.return_policy_version,new.return_window_days)>0
   and (new.return_policy_version is distinct from 'physical_merch_verified_delivery_30d_v1' or new.return_window_days is distinct from 30)
  then raise exception 'merch_return_terms_invalid'; end if;
  new.return_policy_version:='physical_merch_verified_delivery_30d_v1'; new.return_window_days:=30;
 end if;
 return new;
end;
$$;
revoke all on function private.freeze_merch_return_terms() from public,anon,authenticated,service_role;
create trigger freeze_merch_return_terms before insert or update on public.merch_orders
 for each row execute function private.freeze_merch_return_terms();

-- Private future-verifier contract, not an operational attestation endpoint.
-- No API role can seed this evidence. Creator-entered fulfillment status is
-- deliberately not delivery evidence. New observations revoke/review prior
-- observations without editing the original record or resetting the clock.
-- Each row is a complete order-wide snapshot. A future trusted issuer must
-- reconcile ALL unresolved cases and serialize concurrent case changes before
-- emitting none/resolved; a latest individual-case result is insufficient.
create table private.merch_return_evidence (
 id bigint generated always as identity primary key,
 order_id uuid not null references public.merch_orders(id),
 delivered_at timestamptz not null,
 observed_at timestamptz not null default clock_timestamp(),
 evidence_reference text not null check(length(btrim(evidence_reference)) between 1 and 256),
 delivery_state text not null check(delivery_state in ('verified','revoked')),
 return_state text not null check(return_state in ('unknown','none','open','resolved')),
 dispute_state text not null check(dispute_state in ('unknown','none','open','resolved')),
 unique(order_id,evidence_reference)
);
create index merch_return_evidence_order on private.merch_return_evidence(order_id,id desc);
alter table private.merch_return_evidence enable row level security;
alter table private.merch_return_evidence force row level security;
revoke all on private.merch_return_evidence from public,anon,authenticated,service_role;
revoke all on sequence private.merch_return_evidence_id_seq from public,anon,authenticated,service_role;
create function private.guard_merch_return_evidence() returns trigger language plpgsql set search_path='' as $$
declare o public.merch_orders; prior private.merch_return_evidence;
begin
 if tg_op<>'INSERT' then raise exception 'merch_return_evidence_append_only'; end if;
 select * into strict o from public.merch_orders where id=new.order_id for update;
 if o.return_policy_version is distinct from 'physical_merch_verified_delivery_30d_v1'
  or o.environment<>'sandbox' or o.provider<>'stripe_physical_goods'
  or new.delivered_at<o.created_at or new.delivered_at>new.observed_at or new.observed_at>clock_timestamp()
 then raise exception 'merch_return_evidence_invalid'; end if;
 select * into prior from private.merch_return_evidence where order_id=o.id order by id desc limit 1;
 if prior.id is not null and (new.delivered_at is distinct from prior.delivered_at or new.observed_at<prior.observed_at)
 then raise exception 'merch_return_evidence_identity_or_order_invalid'; end if;
 return new;
end;
$$;
revoke all on function private.guard_merch_return_evidence() from public,anon,authenticated,service_role;
create trigger guard_merch_return_evidence before insert or update or delete on private.merch_return_evidence
 for each row execute function private.guard_merch_return_evidence();

create function private.merch_return_hold_state(o public.merch_orders,p_as_of timestamptz)
returns jsonb language plpgsql stable set search_path='' as $$
declare e private.merch_return_evidence; deadline timestamptz; holds text[]:=array[]::text[]; state text;
begin
 if o.return_policy_version is distinct from 'physical_merch_verified_delivery_30d_v1' or o.return_window_days is distinct from 30 then
  holds:=array['merch_return_window_policy_unqualified']; state:='historical_unqualified';
 else
  select * into e from private.merch_return_evidence where order_id=o.id order by id desc limit 1;
  if e.id is null or e.delivery_state<>'verified' or p_as_of is null or e.observed_at>p_as_of then
   holds:=array_append(holds,'verified_delivery_required'); state:='awaiting_verified_delivery';
  else
   -- Fixed elapsed 30-day window, independent of server/session daylight saving.
   deadline:=e.delivered_at+interval '720 hours';
   if p_as_of<deadline then holds:=array_append(holds,'merch_return_window_open'); state:='open';
   else state:='elapsed'; end if;
  end if;
  if e.id is null or e.return_state='unknown' then holds:=array_append(holds,'merch_return_clearance_unknown');
  elsif e.return_state='open' then holds:=array_append(holds,'merch_return_unresolved'); end if;
  if e.id is null or e.dispute_state='unknown' then holds:=array_append(holds,'merch_dispute_clearance_unknown');
  elsif e.dispute_state='open' then holds:=array_append(holds,'merch_dispute_unresolved'); end if;
  if o.payment_status='disputed' then holds:=array_append(holds,'merch_dispute_unresolved'); end if;
  if state='elapsed' and cardinality(holds)>0 then state:='review_required'; end if;
 end if;
 return jsonb_build_object('returnPolicyVersion',o.return_policy_version,'returnWindowDays',o.return_window_days,
  'verifiedDeliveryAt',case when state not in ('historical_unqualified','awaiting_verified_delivery') then e.delivered_at else null end,
  'returnWindowEndsAt',deadline,'returnWindowStatus',state,'returnHoldReasons',holds,'financialAuthority',false);
end;
$$;
revoke all on function private.merch_return_hold_state(public.merch_orders,timestamptz) from public,anon,authenticated,service_role;

create function private.stamp_merch_return_hold_allocation() returns trigger language plpgsql set search_path='' as $$
declare o public.merch_orders; state jsonb;
begin
 select * into strict o from public.merch_orders where id=new.order_id;
 state:=private.merch_return_hold_state(o,clock_timestamp());
 new.hold_reasons:=array_remove(new.hold_reasons,'merch_return_window_policy_unqualified')
  ||array(select jsonb_array_elements_text(state->'returnHoldReasons'));
 return new;
end;
$$;
revoke all on function private.stamp_merch_return_hold_allocation() from public,anon,authenticated,service_role;
create trigger stamp_merch_return_hold_allocation before insert on private.merch_held_net_allocations
 for each row execute function private.stamp_merch_return_hold_allocation();

alter function public.merch_order_projection_internal(public.merch_orders) rename to merch_order_projection_before_return_policy;
revoke all on function public.merch_order_projection_before_return_policy(public.merch_orders) from public,anon,authenticated,service_role;
create function public.merch_order_projection_internal(o public.merch_orders) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb; state jsonb; holds text[];
begin
 result:=public.merch_order_projection_before_return_policy(o);
 state:=private.merch_return_hold_state(o,statement_timestamp());
 holds:=array(select jsonb_array_elements_text(coalesce(result->'netSettlementHoldReasons','[]'::jsonb)));
 -- Refresh policy holds on read without modifying append-only past allocations.
 select coalesce(array_agg(h),'{}'::text[]) into holds from unnest(holds) h
  where h not in ('merch_return_window_policy_unqualified','verified_delivery_required','merch_return_window_open',
   'merch_return_clearance_unknown','merch_return_unresolved','merch_dispute_clearance_unknown','merch_dispute_unresolved');
 return result||state||jsonb_build_object('netSettlementHoldReasons',holds||array(select jsonb_array_elements_text(state->'returnHoldReasons')));
end;
$$;
revoke all on function public.merch_order_projection_internal(public.merch_orders) from public,anon,authenticated,service_role;

alter function public.record_merch_provider_cost_observation(uuid,jsonb) rename to record_merch_provider_cost_before_return_policy;
revoke all on function public.record_merch_provider_cost_before_return_policy(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.record_merch_provider_cost_observation(p_order_id uuid,p_facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; o public.merch_orders; projection jsonb;
begin
 result:=public.record_merch_provider_cost_before_return_policy(p_order_id,p_facts);
 select * into strict o from public.merch_orders where id=p_order_id;
 projection:=public.merch_order_projection_internal(o);
 return result||private.merch_return_hold_state(o,clock_timestamp())
  ||jsonb_build_object('holdReasons',projection->'netSettlementHoldReasons');
end;
$$;
revoke all on function public.record_merch_provider_cost_observation(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_merch_provider_cost_observation(uuid,jsonb) to service_role;
