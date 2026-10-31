-- Separate provider dispute evidence from parcel delivery. Never activates a
-- worker or permits refunds/payouts. All API calls remain sandbox-only.
create table private.merch_dispute_observation_attempts (
 id uuid primary key default extensions.gen_random_uuid(),attempt_no bigint generated always as identity unique,
 order_id uuid not null references public.merch_orders(id),
 started_at timestamptz not null default clock_timestamp(),payment_intent_id text not null,charge_id text,
 amount_minor bigint not null,currency text not null
);
create table private.merch_dispute_observations (
 attempt_id uuid primary key references private.merch_dispute_observation_attempts(id),
 order_id uuid not null references public.merch_orders(id),recorded_at timestamptz not null default clock_timestamp(),
 provider_account_id text not null,charge_id text not null,state text not null check(state in('none','open','resolved','lost')),
 facts jsonb not null
);
create index merch_dispute_attempt_order_idx on private.merch_dispute_observation_attempts(order_id,attempt_no desc);
create index merch_dispute_observation_order_idx on private.merch_dispute_observations(order_id);
create index merch_dispute_observation_charge_idx on private.merch_dispute_observations(provider_account_id,charge_id);
alter table private.merch_dispute_observation_attempts enable row level security;
alter table private.merch_dispute_observation_attempts force row level security;
alter table private.merch_dispute_observations enable row level security;
alter table private.merch_dispute_observations force row level security;
revoke all on private.merch_dispute_observation_attempts,private.merch_dispute_observations from public,anon,authenticated,service_role;
revoke all on sequence private.merch_dispute_observation_attempts_attempt_no_seq from public,anon,authenticated,service_role;
create trigger merch_dispute_attempt_append_only before update or delete on private.merch_dispute_observation_attempts
 for each row execute function private.merch_cost_append_only();
create trigger merch_dispute_observation_append_only before update or delete on private.merch_dispute_observations
 for each row execute function private.merch_cost_append_only();

create function public.begin_merch_dispute_observation(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.merch_orders;a private.merch_dispute_observation_attempts;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into strict o from public.merch_orders where id=p_order_id for update;
 perform public.get_merch_cost_reconciliation_context(p_order_id);
 insert into private.merch_dispute_observation_attempts(order_id,payment_intent_id,charge_id,amount_minor,currency)
 values(o.id,o.stripe_payment_intent_id,o.stripe_charge_id,o.amount_total_minor,o.currency) returning * into a;
 return to_jsonb(a);
end $$;
create function public.complete_merch_dispute_observation(p_attempt_id uuid,p_facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.merch_dispute_observation_attempts;o public.merch_orders; prior private.merch_dispute_observations;
 d jsonb;old_d jsonb;result_state text;account text;charge text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into strict a from private.merch_dispute_observation_attempts where id=p_attempt_id;
 select * into strict o from public.merch_orders where id=a.order_id for update;
 if exists(select 1 from private.merch_dispute_observations where attempt_id=a.id and facts=p_facts) then return '{"duplicate":true,"financialAuthority":false}'::jsonb;end if;
 if a.started_at<clock_timestamp()-interval '5 minutes' or a.started_at>clock_timestamp()
  or exists(select 1 from private.merch_dispute_observation_attempts n where n.order_id=o.id and n.attempt_no>a.attempt_no)
  or o.updated_at>a.started_at
 then raise exception 'merch_dispute_observation_stale';end if;
 account:=p_facts->>'account_id';charge:=p_facts->>'charge_id';
 if not coalesce(jsonb_typeof(p_facts)='object' and pg_column_size(p_facts)<=65536
  and o.provider='stripe_physical_goods' and o.environment='sandbox'
  and p_facts->>'environment'='sandbox' and p_facts->>'order_id'=o.id::text
  and p_facts->>'payment_intent_id'=o.stripe_payment_intent_id and a.payment_intent_id=o.stripe_payment_intent_id
  and p_facts->>'currency'=o.currency and p_facts->'amount_minor'=to_jsonb(o.amount_total_minor)
  and a.amount_minor=o.amount_total_minor and a.currency=o.currency
  and account ~ '^acct_[A-Za-z0-9_]+$' and charge ~ '^ch_[A-Za-z0-9_]+$'
  and (o.stripe_charge_id is null or charge=o.stripe_charge_id)
  and (a.charge_id is null or charge=a.charge_id)
  and p_facts->'complete'='true'::jsonb and p_facts->'financial_authority'='false'::jsonb
  and jsonb_typeof(p_facts->'disputed')='boolean' and jsonb_typeof(p_facts->'disputes')='array',false)
 then raise exception 'merch_dispute_evidence_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended('merch-dispute:'||account||':'||charge,0));
 if exists(select 1 from private.merch_dispute_observations where order_id<>o.id and provider_account_id=account and charge_id=charge)
 then raise exception 'merch_dispute_cross_order';end if;
 select s.* into prior from private.merch_dispute_observations s join private.merch_dispute_observation_attempts x on x.id=s.attempt_id
 where s.order_id=o.id order by x.attempt_no desc limit 1;
 if prior.attempt_id is not null and (prior.provider_account_id<>account or prior.charge_id<>charge) then raise exception 'merch_dispute_identity_changed';end if;
 -- Bind to the independently authenticated cost account when present.
 if exists(select 1 from private.merch_provider_cost_observations c where c.order_id=o.id
  and (c.facts->>'account_id' is distinct from account or c.facts->>'charge_id' is distinct from charge))
 then raise exception 'merch_dispute_identity_changed';end if;
 if jsonb_array_length(p_facts->'disputes')<>(select count(distinct value->>'id') from jsonb_array_elements(p_facts->'disputes'))
 then raise exception 'merch_dispute_duplicate';end if;
 for d in select value from jsonb_array_elements(p_facts->'disputes') loop
  if not coalesce(d->>'id' ~ '^du_[A-Za-z0-9_]+$' and d->>'status' in('warning_needs_response','warning_under_review','warning_closed','needs_response','under_review','appeal_needs_response','appeal_under_review','won','lost','prevented')
   and jsonb_typeof(d->'amount')='number' and d->>'amount' ~ '^[1-9][0-9]{0,10}$'
   and jsonb_typeof(d->'created')='number' and d->>'created' ~ '^[1-9][0-9]{0,10}$',false)
  then raise exception 'merch_dispute_item_invalid';end if;
 end loop;
 -- A complete new list cannot erase previously seen provider objects, immutable
 -- amounts, or a final loss. Reopened/appealed cases retain a hold.
 for old_d in select value from jsonb_array_elements(coalesce(prior.facts->'disputes','[]'::jsonb)) loop
  select value into d from jsonb_array_elements(p_facts->'disputes') where value->>'id'=old_d->>'id';
  if d is null or d->'amount'<>old_d->'amount' or d->'created'<>old_d->'created'
   or (old_d->>'status'='lost' and d->>'status' not in('lost','appeal_needs_response','appeal_under_review','won'))
  then raise exception 'merch_dispute_history_regressed';end if;
 end loop;
 result_state:=case when exists(select 1 from jsonb_array_elements(p_facts->'disputes') item where item->>'status'='lost') then 'lost'
  when (p_facts->'disputed'='true'::jsonb and jsonb_array_length(p_facts->'disputes')=0)
   or exists(select 1 from jsonb_array_elements(p_facts->'disputes') item where item->>'status' not in('won','warning_closed','prevented')) then 'open'
  when jsonb_array_length(p_facts->'disputes')=0 then 'none' else 'resolved' end;
 insert into private.merch_dispute_observations(attempt_id,order_id,provider_account_id,charge_id,state,facts)
 values(a.id,o.id,account,charge,result_state,p_facts);
 return jsonb_build_object('disputeState',result_state,'financialAuthority',false);
end $$;
revoke all on function public.begin_merch_dispute_observation(uuid),public.complete_merch_dispute_observation(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.begin_merch_dispute_observation(uuid),public.complete_merch_dispute_observation(uuid,jsonb) to service_role;

alter function private.merch_return_hold_state(public.merch_orders,timestamptz) rename to merch_return_hold_before_provider_disputes;
create function private.merch_return_hold_state(o public.merch_orders,p_as_of timestamptz) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;a private.merch_dispute_observation_attempts;e private.merch_dispute_observations;holds text[];
begin
 result:=private.merch_return_hold_before_provider_disputes(o,p_as_of);
 select * into a from private.merch_dispute_observation_attempts where order_id=o.id order by attempt_no desc limit 1;
 select * into e from private.merch_dispute_observations where attempt_id=a.id;
 if a.id is not null and e.attempt_id is not null and a.started_at<=p_as_of and e.recorded_at<=p_as_of
  and a.started_at>=p_as_of-interval '12 hours' and o.updated_at<=a.started_at
  and e.state in('none','resolved') then
  select coalesce(array_agg(h),'{}'::text[]) into holds from jsonb_array_elements_text(result->'returnHoldReasons') h where h<>'merch_dispute_clearance_unknown';
  result:=result||jsonb_build_object('returnHoldReasons',holds,'providerDisputeState',e.state);
  if result->>'returnWindowStatus'='review_required' and cardinality(holds)=0 and nullif(result->>'returnWindowEndsAt','')::timestamptz<=p_as_of
  then result:=result||jsonb_build_object('returnWindowStatus','elapsed');end if;
 else
  result:=result||jsonb_build_object('providerDisputeState',case when e.state in('open','lost') then e.state else 'unknown' end);
  -- A newer incomplete/stale provider read must also override any historical
  -- delivery-coupled clearance. Explicit open/lost observations always hold.
  if a.id is not null then
   select coalesce(array_agg(h),'{}'::text[]) into holds from jsonb_array_elements_text(result->'returnHoldReasons') h;
   holds:=array_append(holds,case when e.state in('open','lost') then 'merch_dispute_unresolved' else 'merch_dispute_clearance_unknown' end);
   result:=result||jsonb_build_object('returnHoldReasons',holds,
    'returnWindowStatus',case when result->>'returnWindowStatus'='elapsed' then 'review_required' else result->>'returnWindowStatus' end);
  end if;
 end if;
 return result;
end $$;
revoke all on function private.merch_return_hold_before_provider_disputes(public.merch_orders,timestamptz),private.merch_return_hold_state(public.merch_orders,timestamptz) from public,anon,authenticated,service_role;
