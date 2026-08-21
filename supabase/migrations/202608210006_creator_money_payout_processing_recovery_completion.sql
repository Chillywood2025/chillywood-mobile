-- Final payout processing/recovery convergence for creator-money production readiness.
-- Source-only: this never calls Stripe or any other provider.

alter table public."creator_payout_allocations" drop constraint if exists "creator_payout_allocations_state_check";
alter table public."creator_payout_allocations" add constraint "creator_payout_allocations_state_check"
  check ("state" in ('reserved','processing','paid','released'));

create table if not exists public."creator_money_payout_incidents" (
  "id" uuid primary key default gen_random_uuid(),
  "payout_request_id" uuid not null references public."creator_payout_requests"("id") on delete restrict,
  "earnings_ledger_id" uuid references public."creator_earnings_ledger"("id") on delete restrict,
  "incident_type" text not null,
  "state" text not null default 'open',
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text,now()),
  "resolved_at" timestamptz,
  constraint "creator_money_payout_incident_type_check" check ("incident_type" in ('provider_processing_during_reversal','paid_after_reversal','allocation_mismatch')),
  constraint "creator_money_payout_incident_state_check" check ("state" in ('open','resolved')),
  constraint "creator_money_payout_incident_metadata_safe" check ("metadata"::text !~* '(secret|token|password|private_key|api_key|raw_payload)')
);
create unique index if not exists "creator_money_payout_incident_open_unique"
  on public."creator_money_payout_incidents" ("payout_request_id","earnings_ledger_id","incident_type") where "state"='open';
alter table public."creator_money_payout_incidents" enable row level security;
alter table public."creator_money_payout_incidents" force row level security;
revoke all on table public."creator_money_payout_incidents" from public,anon,authenticated;
grant select,insert,update,delete on table public."creator_money_payout_incidents" to service_role;

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
      for update of e
    loop
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

create or replace function public."reverse_creator_money_earnings_on_provider_terminal"()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_earning public."creator_earnings_ledger"%rowtype;
  v_paid integer:=0;
  v_processing integer:=0;
  v_reason text;
  v_request record;
begin
  if new."payable_state" not in ('refunded','reversed','chargeback') or old."payable_state"=new."payable_state" then return new; end if;
  select * into v_earning from public."creator_earnings_ledger" where "money_ledger_event_id"=new."id" for update;
  if v_earning."id" is null then return new; end if;
  select coalesce(sum("amount_cents") filter (where "state"='paid'),0)::integer,
         coalesce(sum("amount_cents") filter (where "state"='processing'),0)::integer
    into v_paid,v_processing
  from public."creator_payout_allocations" where "earnings_ledger_id"=v_earning."id";

  if v_paid>0 then
    v_reason:=case new."payable_state" when 'refunded' then 'refund_after_payout' when 'chargeback' then 'chargeback_after_payout' else 'reversal_after_payout' end;
    insert into public."creator_money_recovery_obligations" ("creator_id","money_ledger_event_id","earnings_ledger_id","amount_cents","currency","reason")
    values (v_earning."creator_id",new."id",v_earning."id",least(v_paid,v_earning."net_creator_amount_cents"),v_earning."currency",v_reason)
    on conflict ("money_ledger_event_id","earnings_ledger_id") do update set
      "amount_cents"=greatest(public."creator_money_recovery_obligations"."amount_cents",excluded."amount_cents"),"updated_at"=timezone('utc'::text,now());
  end if;

  update public."creator_payout_allocations" set "state"='released',"updated_at"=timezone('utc'::text,now())
  where "earnings_ledger_id"=v_earning."id" and "state"='reserved';

  for v_request in
    select distinct r."id",r."status"
    from public."creator_payout_requests" r join public."creator_payout_allocations" a on a."payout_request_id"=r."id"
    where a."earnings_ledger_id"=v_earning."id" and a."state"='processing'
  loop
    insert into public."creator_money_payout_incidents" ("payout_request_id","earnings_ledger_id","incident_type","metadata")
    values (v_request."id",v_earning."id",'provider_processing_during_reversal',jsonb_build_object('terminal_payable_state',new."payable_state"))
    on conflict do nothing;
  end loop;

  update public."creator_payout_requests" r set "status"='canceled',"updated_at"=timezone('utc'::text,now())
  where r."status" in ('requested','approved') and r."provider_payout_id" is null
    and exists (select 1 from public."creator_payout_allocations" a where a."payout_request_id"=r."id" and a."earnings_ledger_id"=v_earning."id" and a."state"='released')
    and not exists (select 1 from public."creator_payout_allocations" a where a."payout_request_id"=r."id" and a."state" in ('reserved','processing','paid'));

  update public."creator_earnings_ledger" set "ledger_status"='reversed',"reversed_at"=timezone('utc'::text,now()),"updated_at"=timezone('utc'::text,now()),
    "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object('reversed_by_money_ledger_state',new."payable_state",'paid_amount_recovery_required',v_paid,'processing_amount_at_reversal',v_processing)
  where "id"=v_earning."id";
  return new;
end;
$$;
revoke all on function public."reverse_creator_money_earnings_on_provider_terminal"() from public,anon,authenticated,service_role;

comment on function public."mark_creator_payout_provider_result"(uuid,text,text) is 'Service-role provider-result reconciliation only. No provider call is performed by this function.';
