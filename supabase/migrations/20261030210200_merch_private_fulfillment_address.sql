-- Prospective, sandbox-only private fulfillment evidence. No legacy backfill,
-- provider call, label purchase, payment change, or public address projection.
alter table public.merch_orders add column fulfillment_address_policy_version text
 check(fulfillment_address_policy_version='checkout_shipping_v1');
create function private.freeze_merch_fulfillment_policy() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.fulfillment_address_policy_version:=case when new.provider='stripe_physical_goods' then 'checkout_shipping_v1' else null end;
 elsif new.fulfillment_address_policy_version is distinct from old.fulfillment_address_policy_version then
  raise exception 'merch_fulfillment_policy_immutable';
 end if;
 return new;
end $$;
revoke all on function private.freeze_merch_fulfillment_policy() from public,anon,authenticated,service_role;
create trigger freeze_merch_fulfillment_policy before insert or update on public.merch_orders
 for each row execute function private.freeze_merch_fulfillment_policy();

create table private.merch_fulfillment_addresses (
 order_id uuid primary key references public.merch_orders(id),
 event_id text not null unique references public.stripe_merch_events(stripe_event_id),
 address jsonb not null, captured_at timestamptz not null default clock_timestamp()
);
create table private.merch_fulfillment_address_conflicts (
 order_id uuid primary key references public.merch_orders(id),
 event_id text not null, observed_at timestamptz not null default clock_timestamp()
);
-- Bounded audit: one entry per participant/order, no address, token or payload.
create table private.merch_fulfillment_address_access (
 order_id uuid references public.merch_orders(id), actor_id uuid references auth.users(id),
 first_accessed_at timestamptz not null default clock_timestamp(),
 last_accessed_at timestamptz not null default clock_timestamp(), primary key(order_id,actor_id)
);
do $$ declare t text; begin
 foreach t in array array['merch_fulfillment_addresses','merch_fulfillment_address_conflicts','merch_fulfillment_address_access'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
create trigger merch_fulfillment_address_immutable before update or delete on private.merch_fulfillment_addresses
 for each row execute function private.merch_tracking_immutable();
create trigger merch_fulfillment_conflict_immutable before update or delete on private.merch_fulfillment_address_conflicts
 for each row execute function private.merch_tracking_immutable();

alter function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) rename to process_stripe_merch_before_fulfillment_address;
revoke all on function public.process_stripe_merch_before_fulfillment_address(text,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.process_stripe_merch_webhook_lifecycle(p_event_id text,p_event_type text,p_raw_event_hash text,p_facts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; o public.merch_orders; prior private.merch_fulfillment_addresses;
 source jsonb:=p_facts->'shipping_fulfillment'; clean jsonb:='{}'; k text; v text; valid boolean:=true;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 -- Never send raw name/street evidence into existing receipt/financial pathways.
 result:=public.process_stripe_merch_before_fulfillment_address(p_event_id,p_event_type,p_raw_event_hash,p_facts-'shipping_fulfillment');
 if p_event_type not in ('checkout.session.completed','checkout.session.async_payment_succeeded')
  or result->>'status' is distinct from 'processed' or result->>'reason' is distinct from 'payment_confirmed' then return result; end if;
 select * into strict o from public.merch_orders where id=(result->>'orderId')::uuid for update;
 if o.fulfillment_address_policy_version is distinct from 'checkout_shipping_v1' then return result; end if;
 if o.stripe_checkout_session_id is distinct from p_facts->>'object_id' then raise exception 'merch_fulfillment_session_mismatch'; end if;
 if jsonb_typeof(source) is distinct from 'object' then return result; end if;
 foreach k in array array['name','line1','line2','city','state','postal_code','country'] loop
  if source->k is not null and source->k<>'null'::jsonb and jsonb_typeof(source->k)<>'string' then valid:=false; end if;
  v:=nullif(btrim(source->>k),'');
  if k in ('name','line1','city','postal_code','country') and v is null then valid:=false; end if;
  if length(v)>200 or v ~ '[[:cntrl:]]' or v ~ '[<>]' then valid:=false; end if;
  if k in ('country','postal_code') then v:=upper(v); end if;
  clean:=clean||jsonb_build_object(k,v);
 end loop;
 if clean->>'country' !~ '^[A-Z]{2}$' or clean->>'postal_code' !~ '^[A-Z0-9 -]{2,16}$' then valid:=false; end if;
 select * into prior from private.merch_fulfillment_addresses where order_id=o.id;
 if prior.order_id is not null then
  if not valid or prior.address is distinct from clean then
   insert into private.merch_fulfillment_address_conflicts(order_id,event_id) values(o.id,p_event_id) on conflict do nothing;
   -- A different street/recipient in the same ZIP is still a destination
   -- conflict: revoke existing tracking confidence through its established
   -- append-only review marker, without changing any original evidence/time.
   insert into private.merch_checkout_destination_conflicts(order_id,event_id) values(o.id,p_event_id) on conflict do nothing;
   update private.merch_tracking_jobs set next_attempt_at=clock_timestamp() where assignment_id in
    (select id from private.merch_tracking_assignments where order_id=o.id);
  end if;
 elsif valid then
  insert into private.merch_fulfillment_addresses(order_id,event_id,address) values(o.id,p_event_id,clean);
 end if;
 return result;
end $$;
revoke all on function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) to service_role;

create function public.get_merch_fulfillment_address(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.merch_orders; result jsonb;
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true then
  raise exception 'merch_shipping_unavailable' using errcode='42501'; end if;
 select * into o from public.merch_orders where id=p_order_id and auth.uid() in (buyer_id,creator_id) for share;
 if not found or o.provider<>'stripe_physical_goods' or o.environment<>'sandbox'
  or o.payment_status<>'paid' or coalesce(o.refunded_amount_minor,0)>0
  or o.fulfillment_status in ('blocked','canceled')
  or (auth.uid()=o.creator_id and public.wave1_creator_money_subject_authorized_internal(o.creator_id) is distinct from true)
 then raise exception 'merch_shipping_unavailable' using errcode='42501'; end if;
 if exists(select 1 from private.merch_fulfillment_address_conflicts where order_id=o.id)
  or exists(select 1 from private.merch_checkout_destination_conflicts where order_id=o.id)
 then return jsonb_build_object('status','review_required'); end if;
 select address into result from private.merch_fulfillment_addresses where order_id=o.id;
 if result is null then return jsonb_build_object('status','unavailable'); end if;
 insert into private.merch_fulfillment_address_access(order_id,actor_id) values(o.id,auth.uid())
  on conflict(order_id,actor_id) do update set last_accessed_at=clock_timestamp();
 return jsonb_build_object('status','available','address',result);
end $$;
revoke all on function public.get_merch_fulfillment_address(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_merch_fulfillment_address(uuid) to authenticated;

-- A known contradictory fulfillment identity must not be treated as cleared
-- by a later settlement issuer, including purchase-clock/untracked orders.
-- This is an evidence-review hold, not delivery evidence or refund authority.
alter function private.merch_return_hold_state(public.merch_orders,timestamptz) rename to merch_return_hold_before_fulfillment_address;
create function private.merch_return_hold_state(o public.merch_orders,p_as_of timestamptz)
returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 result:=private.merch_return_hold_before_fulfillment_address(o,p_as_of);
 if exists(select 1 from private.merch_fulfillment_address_conflicts where order_id=o.id) then
  result:=result||jsonb_build_object('returnHoldReasons',(result->'returnHoldReasons')||'"merch_fulfillment_address_review_required"'::jsonb,
   'returnWindowStatus',case when result->>'returnWindowStatus'='elapsed' then 'review_required' else result->>'returnWindowStatus' end);
 end if;
 return result;
end $$;
revoke all on function private.merch_return_hold_state(public.merch_orders,timestamptz),
 private.merch_return_hold_before_fulfillment_address(public.merch_orders,timestamptz) from public,anon,authenticated,service_role;
