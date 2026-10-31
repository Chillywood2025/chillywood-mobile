-- Owner-approved pre-delivery, staff-reviewed correction. Immutable shipment
-- history and global carrier identity uniqueness survive every replacement.
alter table private.merch_tracking_assignments drop constraint merch_tracking_assignments_order_id_key;
alter table private.merch_tracking_assignments add constraint merch_tracking_assignment_order_identity unique(id,order_id);
create index merch_tracking_assignments_order_history on private.merch_tracking_assignments(order_id,assigned_at,id);
create table private.merch_tracking_supersessions (
 id uuid primary key, correction_id uuid not null unique references private.merch_tracking_corrections(id),
 order_id uuid not null references public.merch_orders(id),
 old_assignment_id uuid not null unique, new_assignment_id uuid not null unique,
 actor_id uuid not null references auth.users(id), note text not null check(length(note) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(old_assignment_id,order_id) references private.merch_tracking_assignments(id,order_id),
 foreign key(new_assignment_id,order_id) references private.merch_tracking_assignments(id,order_id),
 check(old_assignment_id<>new_assignment_id)
);
alter table private.merch_tracking_supersessions enable row level security;
alter table private.merch_tracking_supersessions force row level security;
revoke all on private.merch_tracking_supersessions from public,anon,authenticated,service_role;
create trigger merch_tracking_supersessions_immutable before update or delete on private.merch_tracking_supersessions
 for each row execute function private.merch_tracking_immutable();
create function private.merch_active_tracking_assignment(p_order_id uuid) returns uuid
language sql stable set search_path='' as $$
 select a.id from private.merch_tracking_assignments a where a.order_id=p_order_id and not exists(
  select 1 from private.merch_tracking_supersessions s where s.old_assignment_id=a.id)
$$;
revoke all on function private.merch_active_tracking_assignment(uuid) from public,anon,authenticated,service_role;

create or replace function private.merch_tracking_correction_projection(c private.merch_tracking_corrections) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'orderId',c.order_id,'carrier',c.carrier,'trackingNumber',c.tracking_number,
  'note',c.note,'createdAt',c.created_at,'status',case when s.correction_id=c.id then 'approved'
   when s.id is not null then 'superseded' when d.id is null then 'pending_review' else 'declined_held' end,
  'reviewNote',case when s.correction_id=c.id then s.note else d.note end,
  'financialAuthority',false,'replacementApplied',coalesce(s.correction_id=c.id,false))
 from (select 1) seed left join private.merch_tracking_correction_declines d on d.correction_id=c.id
 left join private.merch_tracking_supersessions s on s.old_assignment_id=c.assignment_id
$$;

create function public.approve_merch_tracking_correction(p_correction_id uuid,p_request_id uuid,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.merch_tracking_corrections; o public.merch_orders; s private.merch_tracking_supersessions;
 a private.merch_tracking_assignments; note text:=btrim(p_note);
begin
 if private.merch_return_case_staff() is distinct from true then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 select * into r from private.merch_tracking_corrections where id=p_correction_id;
 if r.id is null then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 select * into strict o from public.merch_orders where id=r.order_id for update;
 -- Recheck after a potentially blocking lock; an earlier permission/session
 -- snapshot is not authority if it was revoked while this decision waited.
 if private.merch_return_case_staff() is distinct from true then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 if auth.uid() in(o.buyer_id,o.creator_id) then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 if p_request_id is null or note is null or length(note) not between 1 and 2000 then raise exception 'merch_correction_invalid'; end if;
 select * into s from private.merch_tracking_supersessions where id=p_request_id;
 if s.id is not null then
  if row(s.correction_id,s.actor_id,s.note) is distinct from row(r.id,auth.uid(),note) then raise exception 'merch_correction_request_conflict'; end if;
  return public.read_merch_tracking_corrections(o.id);
 end if;
 if o.environment<>'sandbox' or o.provider<>'stripe_physical_goods' or o.payment_status<>'paid'
  or coalesce(o.refunded_amount_minor,0)>0 or o.shipping_tracking_mode is distinct from 'tracked' then raise exception 'merch_correction_not_available'; end if;
 if r.assignment_id is distinct from private.merch_active_tracking_assignment(o.id)
  or exists(select 1 from private.merch_tracking_correction_declines where correction_id=r.id)
  then raise exception 'merch_correction_already_reviewed'; end if;
 -- EVER verified, not merely the current confidence. Revocation cannot reopen
 -- correction authority or erase the frozen accepted delivery-clock history.
 if exists(select 1 from private.merch_return_evidence where order_id=o.id and delivery_state='verified')
  or exists(select 1 from private.merch_tracking_observations ob join private.merch_tracking_assignments old on old.id=ob.assignment_id
   where old.order_id=o.id and ob.confidence='corroborated')
  or exists(select 1 from private.merch_checkout_destination_conflicts where order_id=o.id)
  or exists(select 1 from private.merch_fulfillment_address_conflicts where order_id=o.id)
 then raise exception 'merch_correction_manual_review_required'; end if;
 begin
  insert into private.merch_tracking_assignments(order_id,creator_id,carrier,tracking_number)
   values(o.id,o.creator_id,r.carrier,r.tracking_number) returning * into a;
 exception when unique_violation then raise exception 'merch_correction_identity_unavailable'; end;
 insert into private.merch_tracking_supersessions(id,correction_id,order_id,old_assignment_id,new_assignment_id,actor_id,note)
  values(p_request_id,r.id,o.id,r.assignment_id,a.id,auth.uid(),note);
 -- Retire old leases under the order lock. Even a later acquired stale lease
 -- cannot append order evidence: completion independently checks active identity.
 update private.merch_tracking_jobs set lease=null,lease_until=null where assignment_id=r.assignment_id;
 insert into private.merch_tracking_jobs(assignment_id) values(a.id);
 return public.read_merch_tracking_corrections(o.id);
end $$;
revoke all on function public.approve_merch_tracking_correction(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.approve_merch_tracking_correction(uuid,uuid,text) to authenticated;

create or replace function private.merch_return_hold_state(o public.merch_orders,p_as_of timestamptz) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 result:=private.merch_return_hold_before_tracking_corrections(o,p_as_of);
 if exists(select 1 from private.merch_tracking_corrections r where r.order_id=o.id and not exists(
  select 1 from private.merch_tracking_supersessions s where s.old_assignment_id=r.assignment_id)) then
  result:=result||jsonb_build_object('returnHoldReasons',(result->'returnHoldReasons')||'"merch_tracking_correction_review_required"'::jsonb,
   'returnWindowStatus',case when result->>'returnWindowStatus'='elapsed' then 'review_required' else result->>'returnWindowStatus' end);
 end if;
 return result;
end $$;
create or replace function public.merch_order_projection_internal(o public.merch_orders) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 result:=public.merch_order_projection_before_tracking_corrections(o);
 if exists(select 1 from private.merch_tracking_corrections r where r.order_id=o.id and not exists(
  select 1 from private.merch_tracking_supersessions s where s.old_assignment_id=r.assignment_id)) then
  result:=result||jsonb_build_object('netSettlementHoldReasons',coalesce(result->'netSettlementHoldReasons','[]'::jsonb)||'"merch_tracking_correction_review_required"'::jsonb);
 end if;
 return result;
end $$;

create or replace function private.merch_tracking_projection(p_order_id uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare a private.merch_tracking_assignments; j private.merch_tracking_jobs; o public.merch_orders; effective_reason text;
begin
 select * into strict o from public.merch_orders where id=p_order_id;
 select * into a from private.merch_tracking_assignments where id=private.merch_active_tracking_assignment(p_order_id);
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

create or replace function public.assign_merch_tracking(p_order_id uuid,p_carrier text,p_tracking_number text)
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
 select * into a from private.merch_tracking_assignments where id=private.merch_active_tracking_assignment(o.id);
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

create or replace function public.receive_merch_tracking_hint(p_hash text,p_carrier text,p_tracking_number text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.merch_tracking_assignments; inserted integer;
begin
 select * into a from private.merch_tracking_assignments where carrier=p_carrier and tracking_number=p_tracking_number;
 if a.id is null or a.id is distinct from private.merch_active_tracking_assignment(a.order_id) or not private.merch_tracking_configured(a.creator_id) then return '{"accepted":false}'::jsonb; end if;
 insert into private.merch_tracking_inbox(payload_hash,assignment_id) values(p_hash,a.id) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted>0 then update private.merch_tracking_jobs set next_attempt_at=least(next_attempt_at,
  greatest(clock_timestamp(),coalesce(checked_at+interval '15 minutes',clock_timestamp())))
  where assignment_id=a.id; end if;
 return jsonb_build_object('accepted',true,'duplicate',inserted=0);
end $$;

create or replace function public.claim_merch_tracking_jobs(p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j record; result jsonb:='[]'::jsonb; token uuid;
begin
 for j in select w.*,a.id,a.order_id,a.carrier,a.tracking_number,m.provider_account as account
  from private.merch_tracking_jobs w join private.merch_tracking_assignments a on a.id=w.assignment_id
  join private.merch_tracking_accounts m on m.creator_id=a.creator_id
  where a.id=private.merch_active_tracking_assignment(a.order_id) and private.merch_tracking_configured(a.creator_id) and w.next_attempt_at<=clock_timestamp()
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

create or replace function public.complete_merch_tracking_job(p_assignment_id uuid,p_lease uuid,p_facts jsonb,p_registered boolean)
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
 if a.id is distinct from private.merch_active_tracking_assignment(o.id) then return '{"stale":true,"superseded":true}'::jsonb; end if;
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

create or replace function private.merch_return_hold_before_fulfillment_address(o public.merch_orders,p_as_of timestamptz)
returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb; j private.merch_tracking_jobs;
begin
 result:=private.merch_return_hold_before_tracking(o,p_as_of);
 if o.shipping_tracking_mode='tracked' then
  select w.* into j from private.merch_tracking_jobs w join private.merch_tracking_assignments a on a.id=w.assignment_id where a.id=private.merch_active_tracking_assignment(o.id);
  if j.assignment_id is not null and (not private.merch_tracking_configured(o.creator_id) or j.checked_at is null
   or j.checked_at<p_as_of-interval '12 hours' or j.confidence<>'corroborated'
   or exists(select 1 from private.merch_checkout_destination_conflicts where order_id=o.id)) then
   result:=result||jsonb_build_object('returnHoldReasons',(result->'returnHoldReasons')||'"merch_tracking_review_required"'::jsonb,
    'returnWindowStatus',case when result->>'returnWindowStatus'='elapsed' then 'review_required' else result->>'returnWindowStatus' end);
  end if;
 end if;
 return result;
end $$;

create or replace function public.request_merch_tracking_correction(p_order_id uuid,p_request_id uuid,p_carrier text,p_tracking_number text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.merch_orders; a private.merch_tracking_assignments; prior private.merch_tracking_corrections;
 c text:=lower(btrim(p_carrier)); n text:=upper(btrim(p_tracking_number)); note text:=btrim(p_note);
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 select * into o from public.merch_orders where id=p_order_id and creator_id=auth.uid() for update;
 if o.id is null or public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 if p_request_id is null or c is null or c not in('usps','ups','fedex') or n is null or n !~ '^[A-Z0-9]{6,64}$'
  or note is null or length(note) not between 1 and 2000 then raise exception 'merch_correction_invalid'; end if;
 select * into prior from private.merch_tracking_corrections where id=p_request_id;
 if prior.id is not null then
  if row(prior.order_id,prior.creator_id,prior.carrier,prior.tracking_number,prior.note) is distinct from row(o.id,auth.uid(),c,n,note)
  then raise exception 'merch_correction_request_conflict'; end if;
  return public.read_merch_tracking_corrections(o.id);
 end if;
 if o.environment<>'sandbox' or o.provider<>'stripe_physical_goods' or o.payment_status<>'paid'
  or o.shipping_tracking_mode is distinct from 'tracked' then raise exception 'merch_correction_not_available'; end if;
 select * into a from private.merch_tracking_assignments where id=private.merch_active_tracking_assignment(o.id);
 if a.id is null or row(a.carrier,a.tracking_number)=row(c,n) then raise exception 'merch_correction_invalid'; end if;
 if exists(select 1 from private.merch_tracking_assignments where carrier=c and tracking_number=n)
 then raise exception 'merch_correction_identity_unavailable'; end if;
 if exists(select 1 from private.merch_tracking_corrections r where r.order_id=o.id and not exists(
  select 1 from private.merch_tracking_correction_declines d where d.correction_id=r.id)
  and not exists(select 1 from private.merch_tracking_supersessions s where s.old_assignment_id=r.assignment_id)) then raise exception 'merch_correction_pending'; end if;
 if (select count(*) from private.merch_tracking_corrections where order_id=o.id)>=100 then raise exception 'merch_correction_request_limit'; end if;
 insert into private.merch_tracking_corrections(id,order_id,assignment_id,creator_id,carrier,tracking_number,note)
 values(p_request_id,o.id,a.id,auth.uid(),c,n,note);
 return public.read_merch_tracking_corrections(o.id);
end $$;

create or replace function public.decline_merch_tracking_correction(p_correction_id uuid,p_request_id uuid,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.merch_tracking_corrections; o public.merch_orders; d private.merch_tracking_correction_declines; note text:=btrim(p_note);
begin
 if private.merch_return_case_staff() is distinct from true then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 select * into r from private.merch_tracking_corrections where id=p_correction_id;
 if r.id is null then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 select * into strict o from public.merch_orders where id=r.order_id for update;
 if private.merch_return_case_staff() is distinct from true then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 if auth.uid() in(o.buyer_id,o.creator_id) then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 if p_request_id is null or note is null or length(note) not between 1 and 2000 then raise exception 'merch_correction_invalid'; end if;
 select * into d from private.merch_tracking_correction_declines where id=p_request_id;
 if d.id is not null then
  if row(d.correction_id,d.actor_id,d.note) is distinct from row(r.id,auth.uid(),note) then raise exception 'merch_correction_request_conflict'; end if;
 else
  if exists(select 1 from private.merch_tracking_supersessions where old_assignment_id=r.assignment_id) then raise exception 'merch_correction_already_reviewed'; end if;
  if exists(select 1 from private.merch_tracking_correction_declines where correction_id=r.id) then raise exception 'merch_correction_already_reviewed'; end if;
  insert into private.merch_tracking_correction_declines values(p_request_id,r.id,auth.uid(),note,clock_timestamp());
 end if;
 return public.read_merch_tracking_corrections(o.id);
end $$;

create or replace function public.list_merch_tracking_correction_queue(p_after uuid default null,p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path='' as $$
declare anchor private.merch_tracking_corrections; page jsonb; n integer:=greatest(1,least(coalesce(p_limit,25),100)); next_id text;
begin
 if private.merch_return_case_staff() is distinct from true then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 if p_after is not null then
  select * into anchor from private.merch_tracking_corrections where id=p_after;
  if anchor.id is null then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 end if;
 select coalesce(jsonb_agg(private.merch_tracking_correction_projection(c) order by created_at,id),'[]'::jsonb) into page
 from (select * from private.merch_tracking_corrections where (p_after is null or (created_at,id)>(anchor.created_at,anchor.id))
   and not exists(select 1 from private.merch_tracking_supersessions s where s.old_assignment_id=merch_tracking_corrections.assignment_id)
  order by created_at,id limit n+1) c;
 if jsonb_array_length(page)>n then page:=page-n;next_id:=page->(n-1)->>'id';end if;
 return jsonb_build_object('requests',page,'nextCursor',next_id);
end $$;
