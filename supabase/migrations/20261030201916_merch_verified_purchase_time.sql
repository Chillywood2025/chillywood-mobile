-- Prospective signed payment-success evidence. Existing paid_at remains the
-- historical receipt-processing field; it is never rewritten or used as proof.
create table private.merch_purchase_time_evidence (
 order_id uuid primary key references public.merch_orders(id),
 stripe_event_id text not null unique references public.stripe_merch_events(stripe_event_id),
 stripe_payment_intent_id text not null unique,
 succeeded_at timestamptz not null,
 raw_event_hash text not null check(raw_event_hash ~ '^[a-f0-9]{64}$'),
 observed_at timestamptz not null default clock_timestamp()
);
alter table private.merch_purchase_time_evidence enable row level security;
alter table private.merch_purchase_time_evidence force row level security;
revoke all on private.merch_purchase_time_evidence from public,anon,authenticated,service_role;
create function private.guard_merch_purchase_time_evidence() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise exception 'merch_purchase_time_immutable'; end if;
 return new;
end;
$$;
revoke all on function private.guard_merch_purchase_time_evidence() from public,anon,authenticated,service_role;
create trigger guard_merch_purchase_time_evidence before update or delete on private.merch_purchase_time_evidence
 for each row execute function private.guard_merch_purchase_time_evidence();

create function private.merch_verified_purchase_at(p_order_id uuid) returns timestamptz
language sql stable set search_path='' as $$
 select e.succeeded_at from private.merch_purchase_time_evidence e
 join public.merch_orders o on o.id=e.order_id and o.stripe_payment_intent_id=e.stripe_payment_intent_id
 where e.order_id=p_order_id and o.provider='stripe_physical_goods' and o.environment='sandbox'
 and o.return_policy_version is not null
$$;
revoke all on function private.merch_verified_purchase_at(uuid) from public,anon,authenticated,service_role;

alter function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb)
 rename to process_stripe_merch_webhook_before_purchase_time;
revoke all on function public.process_stripe_merch_webhook_before_purchase_time(text,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.process_stripe_merch_webhook_lifecycle(p_event_id text,p_event_type text,p_raw_event_hash text,p_facts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; o public.merch_orders; prior private.merch_purchase_time_evidence; succeeded timestamptz;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 result:=public.process_stripe_merch_webhook_before_purchase_time(p_event_id,p_event_type,p_raw_event_hash,p_facts);
 -- Only a newly reconciled canonical success can issue evidence. Checkout,
 -- delayed checkout, refunds, duplicates and old receipts cannot invent it.
 if p_event_type='payment_intent.succeeded' and result->>'status'='processed'
  and result->>'reason'='payment_confirmed' and p_facts->'event_created_seconds' is not null
  and p_facts->'event_created_seconds'<>'null'::jsonb then
  select * into strict o from public.merch_orders where id=(result->>'orderId')::uuid for update;
  if o.return_policy_version is not null then
   if jsonb_typeof(p_facts->'event_created_seconds')<>'number'
    or p_facts->>'event_created_seconds' !~ '^[0-9]{1,10}$'
   then raise exception 'merch_purchase_time_invalid'; end if;
   succeeded:=to_timestamp((p_facts->>'event_created_seconds')::bigint);
   if succeeded<date_trunc('second',o.created_at) or succeeded>clock_timestamp()
    or succeeded<='1970-01-01'::timestamptz then raise exception 'merch_purchase_time_invalid'; end if;
   select * into prior from private.merch_purchase_time_evidence where order_id=o.id;
   if prior.order_id is not null then
    if prior.stripe_payment_intent_id is distinct from o.stripe_payment_intent_id or prior.succeeded_at<>succeeded
    then raise exception 'merch_purchase_time_identity_conflict'; end if;
   else
    insert into private.merch_purchase_time_evidence(order_id,stripe_event_id,stripe_payment_intent_id,succeeded_at,raw_event_hash)
    values(o.id,p_event_id,o.stripe_payment_intent_id,succeeded,p_raw_event_hash);
   end if;
  end if;
 end if;
 return result;
end;
$$;
revoke all on function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) to service_role;
