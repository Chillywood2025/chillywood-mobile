-- Provisional SANDBOX transport, no qualification/account/credential seeded.
-- External tracking numbers remain seller-supplied; carrier data corroborates
-- destination/time, not contents. No payout/return/dispute clearance is created.
create table private.merch_tracking_qualification (
 id boolean primary key default true check(id), qualified boolean not null default false,
 evidence_reference text not null check(length(evidence_reference) between 1 and 256),
 valid_until timestamptz not null
);
create table private.merch_tracking_accounts (
 creator_id uuid primary key references auth.users(id), provider_account text not null unique,
 qualified boolean not null default false, evidence_reference text not null,
 valid_until timestamptz not null
);
create table private.merch_checkout_destination (
 order_id uuid primary key references public.merch_orders(id), country text not null,
 postal_code text not null, event_id text not null unique, observed_at timestamptz not null default clock_timestamp()
);
create table private.merch_checkout_destination_conflicts (
 order_id uuid primary key references public.merch_orders(id), event_id text not null,
 observed_at timestamptz not null default clock_timestamp()
);
create table private.merch_tracking_assignments (
 id uuid primary key default extensions.gen_random_uuid(), order_id uuid not null unique references public.merch_orders(id),
 creator_id uuid not null references auth.users(id), carrier text not null check(carrier in ('usps','ups','fedex')),
 tracking_number text not null check(tracking_number ~ '^[A-Z0-9]{6,64}$'),
 assigned_at timestamptz not null default clock_timestamp(),
 -- Conservative reuse protection: correction/reuse requires a future reviewed
 -- supersession flow, never delete/reassign or silently recycle another order.
 unique(carrier,tracking_number)
);
create table private.merch_tracking_jobs (
 assignment_id uuid primary key references private.merch_tracking_assignments(id),
 provider_account text, registration_state text not null default 'pending'
  check(registration_state in ('pending','attempted','registered','unknown')),
 next_attempt_at timestamptz not null default clock_timestamp(), lease uuid, lease_until timestamptz,
 attempts integer not null default 0, status text not null default 'pending',
 confidence text not null default 'unverified', review_reason text,
 delivery_at timestamptz, checked_at timestamptz
);
create table private.merch_tracking_inbox (
 payload_hash text primary key check(payload_hash ~ '^[0-9a-f]{64}$'),
 assignment_id uuid not null references private.merch_tracking_assignments(id),
 received_at timestamptz not null default clock_timestamp(), processed_at timestamptz
);
create table private.merch_tracking_observations (
 id uuid primary key, assignment_id uuid not null references private.merch_tracking_assignments(id),
 observed_at timestamptz not null default clock_timestamp(), facts jsonb not null,
 confidence text not null, review_reason text
);
create index merch_tracking_jobs_due on private.merch_tracking_jobs(next_attempt_at);
create index merch_tracking_inbox_pending on private.merch_tracking_inbox(assignment_id) where processed_at is null;
create index merch_tracking_observations_assignment on private.merch_tracking_observations(assignment_id,observed_at desc);
do $$ declare t text; begin
 foreach t in array array['merch_tracking_qualification','merch_tracking_accounts','merch_checkout_destination','merch_checkout_destination_conflicts',
  'merch_tracking_assignments','merch_tracking_jobs','merch_tracking_inbox','merch_tracking_observations'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
create function private.merch_tracking_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'merch_tracking_immutable'; end $$;
revoke all on function private.merch_tracking_immutable() from public,anon,authenticated,service_role;
create trigger merch_tracking_assignment_immutable before update or delete on private.merch_tracking_assignments
 for each row execute function private.merch_tracking_immutable();
create trigger merch_tracking_destination_immutable before update or delete on private.merch_checkout_destination
 for each row execute function private.merch_tracking_immutable();
create trigger merch_tracking_destination_conflict_immutable before update or delete on private.merch_checkout_destination_conflicts
 for each row execute function private.merch_tracking_immutable();
create trigger merch_tracking_observation_immutable before update or delete on private.merch_tracking_observations
 for each row execute function private.merch_tracking_immutable();

create function private.merch_tracking_configured(p_creator uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from private.merch_tracking_qualification q,private.merch_tracking_accounts a
  where q.qualified and q.valid_until>statement_timestamp() and a.creator_id=p_creator
   and a.qualified and a.valid_until>statement_timestamp())
$$;
revoke all on function private.merch_tracking_configured(uuid) from public,anon,authenticated,service_role;
create function private.merch_tracking_projection(p_order_id uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare a private.merch_tracking_assignments; j private.merch_tracking_jobs; o public.merch_orders; effective_reason text;
begin
 select * into strict o from public.merch_orders where id=p_order_id;
 select * into a from private.merch_tracking_assignments where order_id=p_order_id;
 select * into j from private.merch_tracking_jobs where assignment_id=a.id;
 effective_reason:=case when a.id is null then null
  when not private.merch_tracking_configured(o.creator_id) then 'provider_unqualified'
  when exists(select 1 from private.merch_checkout_destination_conflicts where order_id=o.id) then 'checkout_destination_conflict'
  when j.checked_at is null or j.checked_at<statement_timestamp()-interval '12 hours' then 'tracking_reconciliation_required'
  else j.review_reason end;
 return jsonb_build_object('assigned',a.id is not null,'carrier',a.carrier,'trackingNumber',a.tracking_number,
  'status',j.status,'confidence',case when effective_reason is null then j.confidence else 'unverified' end,
  'reviewReason',effective_reason,'deliveryAt',j.delivery_at,
  'providerConfigured',private.merch_tracking_configured(o.creator_id),'financialAuthority',false);
end $$;
revoke all on function private.merch_tracking_projection(uuid) from public,anon,authenticated,service_role;
create function public.get_merch_tracking(p_order_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.whole_app_exact_current_session_authority_internal() or not exists(select 1 from public.merch_orders
  where id=p_order_id and auth.uid() in (buyer_id,creator_id)) then raise exception 'merch_tracking_order_unavailable' using errcode='42501'; end if;
 return private.merch_tracking_projection(p_order_id);
end $$;
create function public.assign_merch_tracking(p_order_id uuid,p_carrier text,p_tracking_number text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.merch_orders; a private.merch_tracking_assignments; c text:=lower(btrim(p_carrier)); n text:=upper(btrim(p_tracking_number));
begin
 if not public.whole_app_exact_current_session_authority_internal() then raise exception 'merch_tracking_order_unavailable' using errcode='42501'; end if;
 select * into o from public.merch_orders where id=p_order_id and creator_id=auth.uid() for update;
 if not found then raise exception 'merch_tracking_order_unavailable' using errcode='42501'; end if;
 if o.environment<>'sandbox' or o.provider<>'stripe_physical_goods' or o.payment_status<>'paid'
  or coalesce(o.refunded_amount_minor,0)>0 or o.shipping_tracking_mode is distinct from 'tracked'
 then raise exception 'merch_tracking_not_available'; end if;
 if c is null or c not in ('usps','ups','fedex') or n is null or n !~ '^[A-Z0-9]{6,64}$' then raise exception 'merch_tracking_invalid'; end if;
 select * into a from private.merch_tracking_assignments where order_id=o.id;
 if a.id is not null then
  if row(a.carrier,a.tracking_number) is distinct from row(c,n) then raise exception 'merch_tracking_immutable'; end if;
  return private.merch_tracking_projection(o.id);
 end if;
 begin
  insert into private.merch_tracking_assignments(order_id,creator_id,carrier,tracking_number)
   values(o.id,o.creator_id,c,n) returning * into a;
 exception when unique_violation then raise exception 'merch_tracking_reused'; end;
 insert into private.merch_tracking_jobs(assignment_id) values(a.id);
 return private.merch_tracking_projection(o.id);
end $$;
revoke all on function public.get_merch_tracking(uuid),public.assign_merch_tracking(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_merch_tracking(uuid),public.assign_merch_tracking(uuid,text,text) to authenticated;

-- Signed notifications are wake-up hints only. Delivery evidence comes from a
-- subsequent authenticated, merchant-scoped GET under a serialized worker lease.
create function public.receive_merch_tracking_hint(p_hash text,p_carrier text,p_tracking_number text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.merch_tracking_assignments; inserted integer;
begin
 select * into a from private.merch_tracking_assignments where carrier=p_carrier and tracking_number=p_tracking_number;
 if a.id is null or not private.merch_tracking_configured(a.creator_id) then return '{"accepted":false}'::jsonb; end if;
 insert into private.merch_tracking_inbox(payload_hash,assignment_id) values(p_hash,a.id) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted>0 then update private.merch_tracking_jobs set next_attempt_at=least(next_attempt_at,
  greatest(clock_timestamp(),coalesce(checked_at+interval '15 minutes',clock_timestamp())))
  where assignment_id=a.id; end if;
 return jsonb_build_object('accepted',true,'duplicate',inserted=0);
end $$;
create function public.claim_merch_tracking_jobs(p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j record; result jsonb:='[]'::jsonb; token uuid;
begin
 for j in select w.*,a.id,a.order_id,a.carrier,a.tracking_number,m.provider_account as account
  from private.merch_tracking_jobs w join private.merch_tracking_assignments a on a.id=w.assignment_id
  join private.merch_tracking_accounts m on m.creator_id=a.creator_id
  where private.merch_tracking_configured(a.creator_id) and w.next_attempt_at<=clock_timestamp()
   and (w.lease_until is null or w.lease_until<clock_timestamp())
  order by w.next_attempt_at limit greatest(1,least(coalesce(p_limit,10),20)) for update of w skip locked loop
  token:=extensions.gen_random_uuid();
  -- An expired attempted POST is unknown: never automatically POST twice.
  update private.merch_tracking_jobs set lease=token,lease_until=clock_timestamp()+interval '5 minutes',
   provider_account=coalesce(provider_account,j.account), attempts=attempts+1,
   registration_state=case when registration_state='pending' then 'attempted' when registration_state='attempted' then 'unknown' else registration_state end
   where assignment_id=j.id;
  result:=result||jsonb_build_array(jsonb_build_object('id',j.id,'order_id',j.order_id,'carrier',j.carrier,
   'tracking_number',j.tracking_number,'provider_account',coalesce(j.provider_account,j.account),'lease',token,
   'registration_state',j.registration_state));
 end loop;
 return result;
end $$;

create function public.complete_merch_tracking_job(p_assignment_id uuid,p_lease uuid,p_facts jsonb,p_registered boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.merch_tracking_assignments; j private.merch_tracking_jobs; o public.merch_orders;
 d private.merch_checkout_destination; prior private.merch_return_evidence;
 reason text; delivered timestamptz; first_event timestamptz; paid timestamptz; v_confidence text:='unverified';
 v_status text:=coalesce(p_facts->>'status','UNKNOWN'); observation uuid:=extensions.gen_random_uuid();
begin
 if jsonb_typeof(p_facts) is distinct from 'object' or pg_column_size(p_facts)>8192 then raise exception 'merch_tracking_facts_invalid'; end if;
 select * into a from private.merch_tracking_assignments where id=p_assignment_id;
 if a.id is null then raise exception 'merch_tracking_not_found'; end if;
 -- Same order-first lock order as assignment/evidence/return workflows.
 select * into strict o from public.merch_orders where id=a.order_id for update;
 select * into j from private.merch_tracking_jobs where assignment_id=a.id for update;
 if p_lease is null or j.lease is null or j.lease_until is null
  or j.lease is distinct from p_lease or j.lease_until<=clock_timestamp() then return '{"stale":true}'::jsonb; end if;
 select * into d from private.merch_checkout_destination where order_id=o.id;
 select * into prior from private.merch_return_evidence where order_id=o.id order by id desc limit 1;
 paid:=private.merch_verified_purchase_at(o.id);
 begin delivered:=(p_facts->>'status_date')::timestamptz; first_event:=(p_facts->>'first_event_at')::timestamptz;
 exception when others then reason:='invalid_carrier_timestamp'; end;
 reason:=coalesce(reason,p_facts->>'review_reason');
 if not private.merch_tracking_configured(a.creator_id) then reason:='provider_unqualified';
 elsif j.provider_account is distinct from (select provider_account from private.merch_tracking_accounts where creator_id=a.creator_id)
 then reason:='provider_account_changed';
 elsif o.environment<>'sandbox' or o.shipping_tracking_mode is distinct from 'tracked' then reason:='order_ineligible';
 elsif (p_facts->>'test') is distinct from 'true' then reason:='provider_environment_mismatch';
 elsif (p_facts->>'carrier') is distinct from a.carrier or (p_facts->>'tracking_number') is distinct from a.tracking_number then reason:='tracking_identity_mismatch';
 elsif d.order_id is null then reason:='checkout_destination_missing';
 elsif exists(select 1 from private.merch_checkout_destination_conflicts where order_id=o.id) then reason:='checkout_destination_conflict';
 elsif upper(p_facts->>'destination_country') is distinct from d.country
  or regexp_replace(upper(p_facts->>'destination_zip'),'[ -]','','g') is distinct from regexp_replace(d.postal_code,'[ -]','','g')
 then reason:='destination_mismatch_or_missing';
 elsif paid is null or first_event is null or first_event<paid or first_event>clock_timestamp()
  or delivered is null or delivered<first_event or delivered>clock_timestamp() then reason:='shipment_timing_unverified';
 elsif prior.id is not null and prior.delivered_at is distinct from delivered and v_status='DELIVERED' then reason:='delivery_timestamp_corrected';
 end if;
 if v_status='DELIVERED' and reason is null then v_confidence:='corroborated'; end if;
 insert into private.merch_tracking_observations(id,assignment_id,facts,confidence,review_reason)
  values(observation,a.id,p_facts,v_confidence,reason);
 if v_confidence='corroborated' or prior.delivered_at is not null then
  insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
  values(o.id,coalesce(prior.delivered_at,delivered),'shippo:'||observation::text,
   case when v_confidence='corroborated' then 'verified' else 'revoked' end,
   coalesce(prior.return_state,'unknown'),coalesce(prior.dispute_state,'unknown'));
 end if;
 update private.merch_tracking_jobs set lease=null,lease_until=null,checked_at=clock_timestamp(),
  next_attempt_at=clock_timestamp()+case when reason is not null then interval '2 hours' else interval '6 hours' end,
  registration_state=case when p_registered then 'registered' when registration_state='attempted' then 'unknown' else registration_state end,
  status=v_status,confidence=v_confidence,review_reason=reason,
  delivery_at=case when v_status='DELIVERED' then delivered else null end where assignment_id=a.id;
 update private.merch_tracking_inbox set processed_at=clock_timestamp() where assignment_id=a.id and processed_at is null;
 return private.merch_tracking_projection(o.id);
end $$;
revoke all on function public.receive_merch_tracking_hint(text,text,text),public.claim_merch_tracking_jobs(integer),
 public.complete_merch_tracking_job(uuid,uuid,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.receive_merch_tracking_hint(text,text,text),public.claim_merch_tracking_jobs(integer),
 public.complete_merch_tracking_job(uuid,uuid,jsonb,boolean) to service_role;

-- Minimal destination is only extracted from the same signed Checkout event
-- accepted by the canonical lifecycle. Metadata/billing addresses are not used.
alter function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) rename to process_stripe_merch_before_destination;
revoke all on function public.process_stripe_merch_before_destination(text,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.process_stripe_merch_webhook_lifecycle(p_event_id text,p_event_type text,p_raw_event_hash text,p_facts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; o public.merch_orders; prior private.merch_checkout_destination;
 c text:=upper(p_facts->>'shipping_country'); z text:=upper(btrim(p_facts->>'shipping_postal_code'));
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 result:=public.process_stripe_merch_before_destination(p_event_id,p_event_type,p_raw_event_hash,p_facts);
 if p_event_type in ('checkout.session.completed','checkout.session.async_payment_succeeded')
  and result->>'status'='processed' and result->>'reason'='payment_confirmed'
  and c ~ '^[A-Z]{2}$' and z ~ '^[A-Z0-9 -]{2,16}$' then
  select * into strict o from public.merch_orders where id=(result->>'orderId')::uuid for update;
  if o.stripe_checkout_session_id is distinct from p_facts->>'object_id' then raise exception 'merch_destination_session_mismatch'; end if;
  select * into prior from private.merch_checkout_destination where order_id=o.id;
  if prior.order_id is not null then
   if row(prior.country,prior.postal_code) is distinct from row(c,z) then
    insert into private.merch_checkout_destination_conflicts(order_id,event_id) values(o.id,p_event_id) on conflict do nothing;
    update private.merch_tracking_jobs set next_attempt_at=clock_timestamp() where assignment_id in
     (select id from private.merch_tracking_assignments where order_id=o.id);
   end if;
  else insert into private.merch_checkout_destination(order_id,country,postal_code,event_id) values(o.id,c,z,p_event_id); end if;
 end if;
 return result;
end $$;
revoke all on function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) to service_role;

-- Delivery status must stay reconciled; outages/expired qualification never
-- turn tracked orders into purchase-based orders or permit stale release.
alter function private.merch_return_hold_state(public.merch_orders,timestamptz) rename to merch_return_hold_before_tracking;
create function private.merch_return_hold_state(o public.merch_orders,p_as_of timestamptz)
returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb; j private.merch_tracking_jobs;
begin
 result:=private.merch_return_hold_before_tracking(o,p_as_of);
 if o.shipping_tracking_mode='tracked' then
  select w.* into j from private.merch_tracking_jobs w join private.merch_tracking_assignments a on a.id=w.assignment_id where a.order_id=o.id;
  if j.assignment_id is not null and (not private.merch_tracking_configured(o.creator_id) or j.checked_at is null
   or j.checked_at<p_as_of-interval '12 hours' or j.confidence<>'corroborated'
   or exists(select 1 from private.merch_checkout_destination_conflicts where order_id=o.id)) then
   result:=result||jsonb_build_object('returnHoldReasons',(result->'returnHoldReasons')||'"merch_tracking_review_required"'::jsonb,
    'returnWindowStatus',case when result->>'returnWindowStatus'='elapsed' then 'review_required' else result->>'returnWindowStatus' end);
  end if;
 end if;
 return result;
end $$;
revoke all on function private.merch_return_hold_state(public.merch_orders,timestamptz),
 private.merch_return_hold_before_tracking(public.merch_orders,timestamptz) from public,anon,authenticated,service_role;

-- Recompute these dynamic holds instead of retaining an allocation's earlier
-- tracking outage or missing-purchase snapshot forever. Other holds stay intact.
create or replace function public.merch_order_projection_before_declared_price(o public.merch_orders)
returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb; state jsonb; holds text[];
begin
 result:=public.merch_order_projection_before_return_policy(o);
 state:=private.merch_return_hold_state(o,statement_timestamp());
 holds:=array(select jsonb_array_elements_text(coalesce(result->'netSettlementHoldReasons','[]'::jsonb)));
 select coalesce(array_agg(h),'{}'::text[]) into holds from unnest(holds) h
  where h not in ('merch_return_window_policy_unqualified','verified_delivery_required','verified_purchase_required',
   'merch_tracking_review_required','merch_return_window_open','merch_return_clearance_unknown','merch_return_unresolved',
   'merch_dispute_clearance_unknown','merch_dispute_unresolved');
 return result||state||jsonb_build_object('netSettlementHoldReasons',holds||array(select jsonb_array_elements_text(state->'returnHoldReasons')));
end $$;
revoke all on function public.merch_order_projection_before_declared_price(public.merch_orders) from public,anon,authenticated,service_role;
