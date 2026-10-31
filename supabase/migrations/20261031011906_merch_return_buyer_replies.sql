-- Forward-only reply support. No existing case/history is rewritten and no refund or earnings release is performed.
alter table private.merch_return_case_events drop constraint merch_return_case_events_action_check;
alter table private.merch_return_case_events add constraint merch_return_case_events_action_check
 check(action in ('opened','creator_response','buyer_response','escalate','buyer_close','staff_resolve'));

create or replace function public.respond_merch_return_case(p_case_id uuid,p_request_id uuid,p_action text,p_note text) returns jsonb
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
 if p_request_id is null or p_action is null or p_action not in('creator_response','buyer_response','escalate','buyer_close','staff_resolve')
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
  or p_action in('buyer_response','buyer_close') and actor<>'buyer'
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

revoke all on function public.respond_merch_return_case(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.respond_merch_return_case(uuid,uuid,text,text) to authenticated;
