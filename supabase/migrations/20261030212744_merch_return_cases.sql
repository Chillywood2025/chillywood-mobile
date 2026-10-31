-- Source-only sandbox support workflow. No refund/transfer/label execution.
-- Case headers and events are immutable; current state is derived from history.
alter table public.merch_orders add column return_case_protocol text check(return_case_protocol='app_merch_cases_v1');
create function private.freeze_merch_return_case_protocol() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.return_case_protocol is distinct from old.return_case_protocol then raise exception 'merch_case_protocol_immutable'; end if;
 elsif new.provider='stripe_physical_goods' and new.environment='sandbox' then
  new.return_case_protocol:='app_merch_cases_v1';
 else new.return_case_protocol:=null;
 end if;
 return new;
end $$;
create trigger freeze_merch_return_case_protocol before insert or update on public.merch_orders
 for each row execute function private.freeze_merch_return_case_protocol();
create table private.merch_return_cases (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.merch_orders(id),
 buyer_id uuid not null,
 request_id uuid not null,
 kind text not null check(kind in ('return','non_delivery')),
 support_report_id uuid not null references public.user_report_intake_events(id),
 accepted_terms jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(buyer_id,request_id)
);
create index merch_return_cases_order on private.merch_return_cases(order_id);
create table private.merch_return_case_events (
 id bigint generated always as identity primary key,
 case_id uuid not null references private.merch_return_cases(id),
 actor_id uuid not null,
 request_id uuid not null,
 actor_role text not null check(actor_role in ('buyer','creator','staff')),
 action text not null check(action in ('opened','creator_response','escalate','buyer_close','staff_resolve')),
 resulting_status text not null check(resulting_status in ('open','escalated','closed')),
 note text not null check(length(btrim(note)) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp(),
 unique(actor_id,request_id)
);
create index merch_return_case_events_case on private.merch_return_case_events(case_id,id desc);
create table private.merch_return_case_hold_events (
 event_id bigint primary key references private.merch_return_case_events(id),
 order_id uuid not null references public.merch_orders(id),
 unresolved_case_ids uuid[] not null,
 created_at timestamptz not null default clock_timestamp(),
 financial_authority boolean not null default false check(financial_authority=false)
);
alter table private.merch_return_case_hold_events enable row level security;
alter table private.merch_return_case_hold_events force row level security;
revoke all on private.merch_return_case_hold_events from public,anon,authenticated,service_role;
alter table private.merch_return_cases enable row level security;
alter table private.merch_return_cases force row level security;
alter table private.merch_return_case_events enable row level security;
alter table private.merch_return_case_events force row level security;
revoke all on private.merch_return_cases,private.merch_return_case_events from public,anon,authenticated,service_role;
revoke all on sequence private.merch_return_case_events_id_seq from public,anon,authenticated,service_role;
create function private.guard_merch_return_case_history() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise exception 'merch_case_history_immutable'; end if;
 if tg_table_name in('merch_return_cases','merch_return_case_hold_events') then
  perform 1 from public.merch_orders where id=new.order_id for update;
 else
  perform 1 from public.merch_orders o join private.merch_return_cases c on c.order_id=o.id where c.id=new.case_id for update of o;
 end if;
 return new;
end $$;
create trigger guard_merch_return_cases before insert or update or delete on private.merch_return_cases
 for each row execute function private.guard_merch_return_case_history();
create trigger guard_merch_return_case_events before insert or update or delete on private.merch_return_case_events
 for each row execute function private.guard_merch_return_case_history();
create trigger guard_merch_return_case_hold_events before insert or update or delete on private.merch_return_case_hold_events
 for each row execute function private.guard_merch_return_case_history();
create function private.stamp_merch_return_case_hold() returns trigger language plpgsql set search_path='' as $$
declare v_order_id uuid;
begin
 select c.order_id into strict v_order_id from private.merch_return_cases c where c.id=new.case_id;
 insert into private.merch_return_case_hold_events(event_id,order_id,unresolved_case_ids)
 select new.id,v_order_id,array(select c.id from private.merch_return_cases c where c.order_id=v_order_id
  and coalesce((select resulting_status from private.merch_return_case_events where case_id=c.id order by id desc limit 1),'open')<>'closed' order by c.id);
 return new;
end $$;
create trigger stamp_merch_return_case_hold after insert on private.merch_return_case_events
 for each row execute function private.stamp_merch_return_case_hold();

create function private.merch_return_case_staff() returns boolean language sql stable security definer set search_path='' as $$
 select public.whole_app_exact_current_session_authority_internal() is true
  and public.has_platform_permission('admin.support.manage') is true
  and public.has_platform_permission('admin.refund_status.record') is true
$$;
create function private.merch_return_case_projection(c private.merch_return_cases) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'orderId',c.order_id,'kind',c.kind,'createdAt',c.created_at,
  'status',coalesce((select resulting_status from private.merch_return_case_events where case_id=c.id order by id desc limit 1),'open'),
  'acceptedTerms',c.accepted_terms,'supportReportId',c.support_report_id,'refundExecuted',false,
  'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'actorRole',e.actor_role,
    'note',e.note,'createdAt',e.created_at) order by e.id) from private.merch_return_case_events e where e.case_id=c.id),'[]'::jsonb))
$$;

create function public.read_merch_return_cases(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.merch_orders; staff boolean;
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'merch_case_unavailable' using errcode='42501'; end if;
 staff:=private.merch_return_case_staff();
 select * into o from public.merch_orders where id=p_order_id;
 if o.id is null or (not staff and auth.uid() is distinct from o.buyer_id and auth.uid() is distinct from o.creator_id) then raise exception 'merch_case_unavailable' using errcode='42501'; end if;
 return jsonb_build_object('cases',coalesce((select jsonb_agg(private.merch_return_case_projection(c) order by c.created_at,c.id)
  from private.merch_return_cases c where order_id=o.id),'[]'::jsonb),'canManage',staff);
end $$;

create function public.submit_merch_return_case(p_order_id uuid,p_request_id uuid,p_kind text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.merch_orders; c private.merch_return_cases; state jsonb; report_id uuid; deadline timestamptz; v_note text:=btrim(p_note);
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'merch_case_unavailable' using errcode='42501'; end if;
 -- Lock before eligibility, retry reconciliation, history or hold aggregation.
 select * into o from public.merch_orders where id=p_order_id and buyer_id=auth.uid() for update;
 if o.id is null or o.provider is distinct from 'stripe_physical_goods' or o.environment is distinct from 'sandbox' then raise exception 'merch_case_unavailable' using errcode='42501'; end if;
 if p_request_id is null or p_kind is null or p_kind not in('return','non_delivery') or v_note is null or length(v_note) not between 1 and 2000
  or replace(replace(replace(v_note,chr(10),''),chr(13),''),chr(9),'') ~ '[[:cntrl:]]'
 then raise exception 'merch_case_request_invalid'; end if;
 select * into c from private.merch_return_cases where buyer_id=auth.uid() and request_id=p_request_id;
 if c.id is not null then
  if c.order_id<>o.id or c.kind<>p_kind or not exists(select 1 from private.merch_return_case_events where case_id=c.id and action='opened' and note=v_note)
  then raise exception 'merch_case_request_conflict'; end if;
  return private.merch_return_case_projection(c);
 end if;
 if o.payment_status is null or o.payment_status not in('paid','disputed','partially_refunded','refunded') then raise exception 'merch_case_verified_payment_required'; end if;
 state:=private.merch_return_hold_state(o,clock_timestamp());
 deadline:=nullif(state->>'returnWindowEndsAt','')::timestamptz;
 if p_kind='return' and (deadline is null or clock_timestamp()>=deadline) then raise exception 'merch_case_return_window_unavailable'; end if;
 -- Non-delivery is a support claim, not a delivery assertion or return waiver.
 -- Generic inbox receives fixed safe text only, never buyer notes or addresses.
 insert into public.user_report_intake_events(reporter_user_id,report_type,category,platform,surface,route,
  normalized_fingerprint,text_summary_redacted,source,report_status,metadata)
 values(auth.uid(),'other_support','physical_merch_'||p_kind,'shared','merch_orders','/merch/orders',
  'merch_case:'||p_request_id::text,'Physical merchandise order support request','merch_return_case','review_required','{}') returning id into report_id;
 insert into private.merch_return_cases(order_id,buyer_id,request_id,kind,support_report_id,accepted_terms)
 values(o.id,auth.uid(),p_request_id,p_kind,report_id,jsonb_build_object('returnCaseProtocol',o.return_case_protocol,'returnPolicyVersion',o.return_policy_version,
  'shippingTrackingMode',o.shipping_tracking_mode,'returnWindowDays',o.return_window_days,
  'returnWindowEndsAt',state->'returnWindowEndsAt','verifiedPurchaseAt',state->'verifiedPurchaseAt','verifiedDeliveryAt',state->'verifiedDeliveryAt')) returning * into c;
 insert into private.merch_return_case_events(case_id,actor_id,request_id,actor_role,action,resulting_status,note)
 values(c.id,auth.uid(),p_request_id,'buyer','opened','open',v_note);
 return private.merch_return_case_projection(c);
end $$;

create function public.respond_merch_return_case(p_case_id uuid,p_request_id uuid,p_action text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.merch_return_cases; o public.merch_orders; e private.merch_return_case_events;
 status text; actor text; next_status text; note text:=btrim(p_note); staff boolean;
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'merch_case_unavailable' using errcode='42501'; end if;
 select * into c from private.merch_return_cases where id=p_case_id;
 if c.id is null then raise exception 'merch_case_unavailable' using errcode='42501'; end if;
 select * into o from public.merch_orders where id=c.order_id for update;
 staff:=private.merch_return_case_staff();
 if not staff and auth.uid() is distinct from o.buyer_id and auth.uid() is distinct from o.creator_id then raise exception 'merch_case_unavailable' using errcode='42501'; end if;
 if p_request_id is null or p_action is null or p_action not in('creator_response','escalate','buyer_close','staff_resolve')
  or note is null or length(note) not between 1 and 2000
  or replace(replace(replace(note,chr(10),''),chr(13),''),chr(9),'') ~ '[[:cntrl:]]'
 then raise exception 'merch_case_request_invalid'; end if;
 select * into e from private.merch_return_case_events where actor_id=auth.uid() and request_id=p_request_id;
 if e.id is not null then
  if e.case_id<>c.id or e.action<>p_action or e.note<>note then raise exception 'merch_case_request_conflict'; end if;
  return private.merch_return_case_projection(c);
 end if;
 select resulting_status into status from private.merch_return_case_events where case_id=c.id order by id desc limit 1;
 if status='closed' then raise exception 'merch_case_already_closed'; end if;
 actor:=case when auth.uid()=o.buyer_id then 'buyer' when auth.uid()=o.creator_id then 'creator' else 'staff' end;
 if p_action='creator_response' and (actor<>'creator' or public.wave1_creator_money_subject_authorized_internal(o.creator_id) is distinct from true)
  or p_action='buyer_close' and actor<>'buyer'
  or p_action='escalate' and actor not in('buyer','creator')
  or p_action='staff_resolve' and (not staff or status<>'escalated' or auth.uid() in(o.buyer_id,o.creator_id))
 then raise exception 'merch_case_action_denied' using errcode='42501'; end if;
 if p_action='staff_resolve' then actor:='staff'; end if;
 next_status:=case when p_action in('buyer_close','staff_resolve') then 'closed' when p_action='escalate' then 'escalated' else status end;
 insert into private.merch_return_case_events(case_id,actor_id,request_id,actor_role,action,resulting_status,note)
 values(c.id,auth.uid(),p_request_id,actor,p_action,next_status,note);
 -- Closing a case is not evidence that a refund was executed. Payment/provider
 -- dispute and return evidence remain immutable and independent of staff text.
 return private.merch_return_case_projection(c);
end $$;

create function public.list_merch_return_review_cases(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if private.merch_return_case_staff() is distinct from true then raise exception 'merch_case_unavailable' using errcode='42501'; end if;
 return jsonb_build_object('canManage',true,'cases',coalesce((select jsonb_agg(private.merch_return_case_projection(c) order by c.created_at,c.id)
  from (select c.* from private.merch_return_cases c where
   (select resulting_status from private.merch_return_case_events where case_id=c.id order by id desc limit 1)='escalated'
   order by c.created_at,c.id limit greatest(1,least(coalesce(p_limit,50),100))) c),'[]'::jsonb));
end $$;

-- Every unresolved case contributes, regardless of delivery existence. The
-- wrapper never overwrites provider disputes, carrier confidence or old unknown
-- clearance. Resolving one case cannot clear a second case or provider claim.
alter function private.merch_return_hold_state(public.merch_orders,timestamptz) rename to merch_return_hold_before_cases;
create function private.merch_return_hold_state(o public.merch_orders,p_as_of timestamptz) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb; unresolved integer; holds text[];
begin
 result:=private.merch_return_hold_before_cases(o,p_as_of);
 select count(*) into unresolved from private.merch_return_cases c where c.order_id=o.id and
  coalesce((select resulting_status from private.merch_return_case_events where case_id=c.id order by id desc limit 1),'open')<>'closed';
 -- Only prospectively enrolled orders have a complete app case ledger. Remove
 -- only the app return UNKNOWN marker, never known external open-return facts,
 -- provider dispute unknown/open markers, or any financial qualification hold.
 if o.return_case_protocol='app_merch_cases_v1' then
  select coalesce(array_agg(h),'{}'::text[]) into holds from jsonb_array_elements_text(result->'returnHoldReasons') h where h<>'merch_return_clearance_unknown';
  result:=result||jsonb_build_object('returnHoldReasons',holds,'appReturnCaseState',case when unresolved>0 then 'open'
   when exists(select 1 from private.merch_return_cases where order_id=o.id) then 'resolved' else 'none' end);
  if result->>'returnWindowStatus'='review_required' and cardinality(holds)=0
   and nullif(result->>'returnWindowEndsAt','')::timestamptz<=p_as_of
  then result:=result||jsonb_build_object('returnWindowStatus','elapsed'); end if;
 end if;
 if unresolved>0 then
  result:=result||jsonb_build_object('returnHoldReasons',(result->'returnHoldReasons')||'"merch_case_unresolved"'::jsonb,
   'returnWindowStatus',case when result->>'returnWindowStatus'='elapsed' then 'review_required' else result->>'returnWindowStatus' end);
 end if;
 return result||jsonb_build_object('unresolvedReturnCaseCount',unresolved,'returnCaseProtocol',o.return_case_protocol);
end $$;
alter function public.merch_order_projection_internal(public.merch_orders) rename to merch_order_projection_before_cases;
create function public.merch_order_projection_internal(o public.merch_orders) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb; state jsonb; holds text[];
begin
 result:=public.merch_order_projection_before_cases(o);
 state:=private.merch_return_hold_state(o,statement_timestamp());
 select coalesce(array_agg(h),'{}'::text[]) into holds from jsonb_array_elements_text(coalesce(result->'netSettlementHoldReasons','[]'::jsonb)) h where h<>'merch_case_unresolved';
 if (state->>'unresolvedReturnCaseCount')::integer>0 then holds:=array_append(holds,'merch_case_unresolved'); end if;
 return result||state||jsonb_build_object('netSettlementHoldReasons',holds);
end $$;
revoke all on function private.guard_merch_return_case_history(),private.merch_return_case_staff(),
 private.freeze_merch_return_case_protocol(),
 private.stamp_merch_return_case_hold(),public.merch_order_projection_before_cases(public.merch_orders),public.merch_order_projection_internal(public.merch_orders),
 private.merch_return_case_projection(private.merch_return_cases),private.merch_return_hold_before_cases(public.merch_orders,timestamptz),
 private.merch_return_hold_state(public.merch_orders,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.read_merch_return_cases(uuid),public.submit_merch_return_case(uuid,uuid,text,text),
 public.respond_merch_return_case(uuid,uuid,text,text),public.list_merch_return_review_cases(integer) from public,anon,authenticated,service_role;
grant execute on function public.read_merch_return_cases(uuid),public.submit_merch_return_case(uuid,uuid,text,text),
 public.respond_merch_return_case(uuid,uuid,text,text),public.list_merch_return_review_cases(integer) to authenticated;
