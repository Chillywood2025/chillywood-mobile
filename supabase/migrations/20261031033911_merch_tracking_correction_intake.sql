-- Intake only. No replacement, provider activation, clearance or clock reset.
create table private.merch_tracking_corrections (
 id uuid primary key, order_id uuid not null references public.merch_orders(id),
 assignment_id uuid not null references private.merch_tracking_assignments(id),
 creator_id uuid not null references auth.users(id),
 carrier text not null check(carrier in('usps','ups','fedex')),
 tracking_number text not null check(tracking_number ~ '^[A-Z0-9]{6,64}$'),
 note text not null check(length(note) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp()
);
create table private.merch_tracking_correction_declines (
 id uuid primary key, correction_id uuid not null unique references private.merch_tracking_corrections(id),
 actor_id uuid not null references auth.users(id), note text not null check(length(note) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp()
);
create index merch_tracking_corrections_order on private.merch_tracking_corrections(order_id,created_at,id);
create index merch_tracking_corrections_queue on private.merch_tracking_corrections(created_at,id);
alter table private.merch_tracking_corrections enable row level security;
alter table private.merch_tracking_corrections force row level security;
alter table private.merch_tracking_correction_declines enable row level security;
alter table private.merch_tracking_correction_declines force row level security;
revoke all on private.merch_tracking_corrections,private.merch_tracking_correction_declines from public,anon,authenticated,service_role;
create trigger merch_tracking_corrections_immutable before update or delete on private.merch_tracking_corrections
 for each row execute function private.merch_tracking_immutable();
create trigger merch_tracking_correction_declines_immutable before update or delete on private.merch_tracking_correction_declines
 for each row execute function private.merch_tracking_immutable();

create function private.merch_tracking_correction_projection(c private.merch_tracking_corrections) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'orderId',c.order_id,'carrier',c.carrier,'trackingNumber',c.tracking_number,
  'note',c.note,'createdAt',c.created_at,'status',case when d.id is null then 'pending_review' else 'declined_held' end,
  'reviewNote',d.note,'financialAuthority',false,'replacementApplied',false)
 from (select 1) seed left join private.merch_tracking_correction_declines d on d.correction_id=c.id
$$;
create function public.read_merch_tracking_corrections(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true or not exists(
  select 1 from public.merch_orders where id=p_order_id and (auth.uid() in(buyer_id,creator_id) or private.merch_return_case_staff()))
 then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 return jsonb_build_object('requests',coalesce((select jsonb_agg(private.merch_tracking_correction_projection(c) order by created_at,id)
  from private.merch_tracking_corrections c where order_id=p_order_id),'[]'::jsonb));
end $$;
create function public.request_merch_tracking_correction(p_order_id uuid,p_request_id uuid,p_carrier text,p_tracking_number text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.merch_orders; a private.merch_tracking_assignments; prior private.merch_tracking_corrections;
 c text:=lower(btrim(p_carrier)); n text:=upper(btrim(p_tracking_number)); note text:=btrim(p_note);
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 select * into o from public.merch_orders where id=p_order_id and creator_id=auth.uid() for update;
 if o.id is null then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
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
 select * into a from private.merch_tracking_assignments where order_id=o.id;
 if a.id is null or row(a.carrier,a.tracking_number)=row(c,n) then raise exception 'merch_correction_invalid'; end if;
 if exists(select 1 from private.merch_tracking_assignments where carrier=c and tracking_number=n)
 then raise exception 'merch_correction_identity_unavailable'; end if;
 if exists(select 1 from private.merch_tracking_corrections r where r.order_id=o.id and not exists(
  select 1 from private.merch_tracking_correction_declines d where d.correction_id=r.id)) then raise exception 'merch_correction_pending'; end if;
 if (select count(*) from private.merch_tracking_corrections where order_id=o.id)>=100 then raise exception 'merch_correction_request_limit'; end if;
 insert into private.merch_tracking_corrections(id,order_id,assignment_id,creator_id,carrier,tracking_number,note)
 values(p_request_id,o.id,a.id,auth.uid(),c,n,note);
 return public.read_merch_tracking_corrections(o.id);
end $$;

create function public.decline_merch_tracking_correction(p_correction_id uuid,p_request_id uuid,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.merch_tracking_corrections; o public.merch_orders; d private.merch_tracking_correction_declines; note text:=btrim(p_note);
begin
 if private.merch_return_case_staff() is distinct from true then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 select * into r from private.merch_tracking_corrections where id=p_correction_id;
 if r.id is null then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 select * into strict o from public.merch_orders where id=r.order_id for update;
 if auth.uid() in(o.buyer_id,o.creator_id) then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 if p_request_id is null or note is null or length(note) not between 1 and 2000 then raise exception 'merch_correction_invalid'; end if;
 select * into d from private.merch_tracking_correction_declines where id=p_request_id;
 if d.id is not null then
  if row(d.correction_id,d.actor_id,d.note) is distinct from row(r.id,auth.uid(),note) then raise exception 'merch_correction_request_conflict'; end if;
 else
  if exists(select 1 from private.merch_tracking_correction_declines where correction_id=r.id) then raise exception 'merch_correction_already_reviewed'; end if;
  insert into private.merch_tracking_correction_declines values(p_request_id,r.id,auth.uid(),note,clock_timestamp());
 end if;
 return public.read_merch_tracking_corrections(o.id);
end $$;

-- All reported identities remain held, including declined proposals. Decline
-- is not proof that the original number was correct and cannot restore release.
create function public.list_merch_tracking_correction_queue(p_after uuid default null,p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path='' as $$
declare anchor private.merch_tracking_corrections; page jsonb; n integer:=greatest(1,least(coalesce(p_limit,25),100)); next_id text;
begin
 if private.merch_return_case_staff() is distinct from true then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 if p_after is not null then
  select * into anchor from private.merch_tracking_corrections where id=p_after;
  if anchor.id is null then raise exception 'merch_correction_unavailable' using errcode='42501'; end if;
 end if;
 select coalesce(jsonb_agg(private.merch_tracking_correction_projection(c) order by created_at,id),'[]'::jsonb) into page
 from (select * from private.merch_tracking_corrections where p_after is null or (created_at,id)>(anchor.created_at,anchor.id)
  order by created_at,id limit n+1) c;
 if jsonb_array_length(page)>n then page:=page-n;next_id:=page->(n-1)->>'id';end if;
 return jsonb_build_object('requests',page,'nextCursor',next_id);
end $$;

alter function private.merch_return_hold_state(public.merch_orders,timestamptz) rename to merch_return_hold_before_tracking_corrections;
create function private.merch_return_hold_state(o public.merch_orders,p_as_of timestamptz) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 result:=private.merch_return_hold_before_tracking_corrections(o,p_as_of);
 if exists(select 1 from private.merch_tracking_corrections where order_id=o.id) then
  result:=result||jsonb_build_object('returnHoldReasons',(result->'returnHoldReasons')||'"merch_tracking_correction_review_required"'::jsonb,
   'returnWindowStatus',case when result->>'returnWindowStatus'='elapsed' then 'review_required' else result->>'returnWindowStatus' end);
 end if;
 return result;
end $$;
alter function public.merch_order_projection_internal(public.merch_orders) rename to merch_order_projection_before_tracking_corrections;
create function public.merch_order_projection_internal(o public.merch_orders) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 result:=public.merch_order_projection_before_tracking_corrections(o);
 if exists(select 1 from private.merch_tracking_corrections where order_id=o.id) then
  result:=result||jsonb_build_object('netSettlementHoldReasons',coalesce(result->'netSettlementHoldReasons','[]'::jsonb)||'"merch_tracking_correction_review_required"'::jsonb);
 end if;
 return result;
end $$;
revoke all on function private.merch_tracking_correction_projection(private.merch_tracking_corrections),
 private.merch_return_hold_before_tracking_corrections(public.merch_orders,timestamptz),private.merch_return_hold_state(public.merch_orders,timestamptz),
 public.merch_order_projection_before_tracking_corrections(public.merch_orders),public.merch_order_projection_internal(public.merch_orders),
 public.read_merch_tracking_corrections(uuid),public.request_merch_tracking_correction(uuid,uuid,text,text,text),
 public.decline_merch_tracking_correction(uuid,uuid,text),public.list_merch_tracking_correction_queue(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.read_merch_tracking_corrections(uuid),public.request_merch_tracking_correction(uuid,uuid,text,text,text),
 public.decline_merch_tracking_correction(uuid,uuid,text),public.list_merch_tracking_correction_queue(uuid,integer) to authenticated;
