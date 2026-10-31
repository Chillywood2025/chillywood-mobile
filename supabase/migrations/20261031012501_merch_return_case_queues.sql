-- Read-only discovery. Keyset pagination survives closing earlier cases; refresh
-- restarts discovery when an older case is newly escalated between page reads.
create index merch_return_cases_queue_order on private.merch_return_cases(created_at,id);

create function public.list_merch_return_case_queue(p_role text,p_after uuid default null,p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path='' as $$
declare anchor private.merch_return_cases; page jsonb; total bigint; n integer:=greatest(1,least(coalesce(p_limit,50),100)); next_id text;
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true
  or p_role is null or p_role not in('creator','buyer','staff') then raise exception 'merch_case_unavailable' using errcode='42501'; end if;
 if p_role='staff' and private.merch_return_case_staff() is distinct from true then raise exception 'merch_case_unavailable' using errcode='42501'; end if;
 if p_after is not null then
  select c.* into anchor from private.merch_return_cases c join public.merch_orders o on o.id=c.order_id
   where c.id=p_after and (p_role='staff' or p_role='creator' and o.creator_id=auth.uid() or p_role='buyer' and o.buyer_id=auth.uid());
  if anchor.id is null then raise exception 'merch_case_unavailable' using errcode='42501'; end if;
 end if;
 with scoped as materialized (
  select c from private.merch_return_cases c join public.merch_orders o on o.id=c.order_id
  where (p_role='staff' or p_role='creator' and o.creator_id=auth.uid() or p_role='buyer' and o.buyer_id=auth.uid())
   and coalesce((select resulting_status from private.merch_return_case_events e where e.case_id=c.id order by e.id desc limit 1),'open')
    = any(case when p_role='staff' then array['escalated'] else array['open','escalated'] end)
 ), limited as (
  select c from scoped where p_after is null or ((c).created_at,(c).id)>(anchor.created_at,anchor.id)
   order by (c).created_at,(c).id limit n+1
 )
 select (select count(*) from scoped),coalesce(jsonb_agg(private.merch_return_case_projection(c) order by (c).created_at,(c).id),'[]'::jsonb)
 into total,page from limited;
 if jsonb_array_length(page)>n then page:=page-n;next_id:=page->(n-1)->>'id';end if;
 return jsonb_build_object('cases',page,'totalCount',total,'nextCursor',next_id,'role',p_role);
end $$;
revoke all on function public.list_merch_return_case_queue(text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_merch_return_case_queue(text,uuid,integer) to authenticated;
