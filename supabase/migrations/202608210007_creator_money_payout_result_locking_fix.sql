-- Replace payout provider-result reconciliation with creator-wide advisory locking.
-- This avoids an invalid row-locking clause on an aggregate query and serializes
-- provider results with payout reservation creation for the same creator.

create or replace function public."mark_creator_payout_provider_result"(p_request_id uuid,p_provider_payout_id text,p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_request public."creator_payout_requests"%rowtype;
  v_status text:=lower(trim(coalesce(p_status,'')));
  v_now timestamptz:=timezone('utc'::text,now());
  v_row record;
  v_paid_amount integer;
  v_total_paid integer;
begin
  if p_request_id is null then raise exception 'payout_request_required'; end if;
  if v_status not in ('processing','paid','failed','canceled') then raise exception 'payout_provider_status_invalid'; end if;
  if v_status in ('processing','paid') and nullif(trim(coalesce(p_provider_payout_id,'')),'') is null then raise exception 'provider_payout_id_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('creator-payout-result:'||p_request_id::text,0));
  select * into v_request from public."creator_payout_requests" where "id"=p_request_id for update;
  if v_request."id" is null then raise exception 'payout_request_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||v_request."creator_id"::text,0));
  if v_request."status"='paid' and v_status<>'paid' then raise exception 'paid_payout_terminal'; end if;
  if v_request."status" in ('failed','canceled') and v_status in ('processing','paid') then raise exception 'closed_payout_cannot_resume'; end if;
  if v_request."provider_payout_id" is not null and nullif(trim(coalesce(p_provider_payout_id,'')),'') is not null
    and v_request."provider_payout_id"<>trim(p_provider_payout_id) then raise exception 'provider_payout_id_mismatch'; end if;

  if v_status='processing' then
    update public."creator_payout_allocations" set "state"='processing',"updated_at"=v_now
    where "payout_request_id"=p_request_id and "state"='reserved';
  elsif v_status='paid' then
    update public."creator_payout_allocations" set "state"='paid',"updated_at"=v_now
    where "payout_request_id"=p_request_id and "state" in ('reserved','processing');
  elsif v_status in ('failed','canceled') then
    update public."creator_payout_allocations" set "state"='released',"updated_at"=v_now
    where "payout_request_id"=p_request_id and "state" in ('reserved','processing');
  end if;

  update public."creator_payout_requests" set "status"=v_status,
    "provider_payout_id"=coalesce(nullif(trim(p_provider_payout_id),''),"provider_payout_id"),"updated_at"=v_now
  where "id"=p_request_id returning * into v_request;

  if v_status='paid' then
    select coalesce(sum("amount_cents"),0)::integer into v_paid_amount
    from public."creator_payout_allocations" where "payout_request_id"=p_request_id and "state"='paid';
    if v_paid_amount<>v_request."amount_cents" then
      insert into public."creator_money_payout_incidents" ("payout_request_id","incident_type","metadata")
      values (p_request_id,'allocation_mismatch',jsonb_build_object('expected_amount_cents',v_request."amount_cents",'paid_allocation_cents',v_paid_amount))
      on conflict do nothing;
      raise exception 'paid_payout_allocation_mismatch';
    end if;

    for v_row in
      select e."id" earnings_id,e."money_ledger_event_id",e."net_creator_amount_cents",e."ledger_status",
        coalesce(sum(a."amount_cents") filter (where a."state"='paid'),0)::integer total_paid
      from public."creator_payout_allocations" current_allocation
      join public."creator_earnings_ledger" e on e."id"=current_allocation."earnings_ledger_id"
      left join public."creator_payout_allocations" a on a."earnings_ledger_id"=e."id"
      where current_allocation."payout_request_id"=p_request_id
      group by e."id",e."money_ledger_event_id",e."net_creator_amount_cents",e."ledger_status"
    loop
      perform 1 from public."creator_earnings_ledger" where "id"=v_row.earnings_id for update;
      v_total_paid:=v_row.total_paid;
      if v_row."ledger_status"='reversed' then
        insert into public."creator_money_recovery_obligations" ("creator_id","money_ledger_event_id","earnings_ledger_id","amount_cents","currency","reason")
        select e."creator_id",e."money_ledger_event_id",e."id",least(v_total_paid,e."net_creator_amount_cents"),e."currency",
          case m."payable_state" when 'refunded' then 'refund_after_payout' when 'chargeback' then 'chargeback_after_payout' else 'reversal_after_payout' end
        from public."creator_earnings_ledger" e join public."money_access_ledger_events" m on m."id"=e."money_ledger_event_id"
        where e."id"=v_row.earnings_id and v_total_paid>0
        on conflict ("money_ledger_event_id","earnings_ledger_id") do update set
          "amount_cents"=greatest(public."creator_money_recovery_obligations"."amount_cents",excluded."amount_cents"),"updated_at"=v_now;
        insert into public."creator_money_payout_incidents" ("payout_request_id","earnings_ledger_id","incident_type","metadata")
        values (p_request_id,v_row.earnings_id,'paid_after_reversal',jsonb_build_object('paid_amount_cents',v_total_paid)) on conflict do nothing;
      elsif v_total_paid>=v_row."net_creator_amount_cents" then
        update public."creator_earnings_ledger" set "ledger_status"='paid',"updated_at"=v_now,
          "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object('fully_paid_at',v_now)
        where "id"=v_row.earnings_id;
        if v_row."money_ledger_event_id" is not null then
          update public."money_access_ledger_events" set "payable_state"='paid',
            "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object('payout_completed_at',v_now,'payout_readiness_proved',true)
          where "id"=v_row."money_ledger_event_id" and "payable_state"='payable';
        end if;
      end if;
    end loop;
  end if;

  return jsonb_build_object('id',v_request."id",'status',v_request."status",'providerPayoutIdPresent',v_request."provider_payout_id" is not null);
end;
$$;
revoke all on function public."mark_creator_payout_provider_result"(uuid,text,text) from public,anon,authenticated;
grant execute on function public."mark_creator_payout_provider_result"(uuid,text,text) to service_role;
comment on function public."mark_creator_payout_provider_result"(uuid,text,text) is 'Service-role provider-result reconciliation only, serialized with creator payout reservations. No provider call is performed.';
