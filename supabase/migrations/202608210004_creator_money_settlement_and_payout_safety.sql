-- Production creator-money settlement and payout safety.
-- Source-only. This migration never calls Stripe, Apple, RevenueCat, or any payout provider.
-- Provider-verified sales remain non-withdrawable until trusted settlement evidence,
-- hold maturity, current creator eligibility, and payout/provider switches all pass.

alter table public."creator_earnings_ledger"
  add column if not exists "provider_event_id" uuid references public."provider_events"("id") on delete restrict,
  add column if not exists "money_ledger_event_id" uuid references public."money_access_ledger_events"("id") on delete restrict,
  add column if not exists "settlement_reference_hash" text,
  add column if not exists "available_at" timestamptz,
  add column if not exists "reversed_at" timestamptz,
  add column if not exists "updated_at" timestamptz not null default timezone('utc'::text, now());

alter table public."creator_earnings_ledger" drop constraint if exists "creator_earnings_ledger_source_type_check";
alter table public."creator_earnings_ledger" add constraint "creator_earnings_ledger_source_type_check"
  check ("source_type" in (
    'tip','paid_content','product','ad','sponsor','adjustment','refund','chargeback','payout',
    'watch_party_ticket','event_pass','vip_pass','channel_subscription'
  ));

alter table public."creator_earnings_ledger" drop constraint if exists "creator_earnings_ledger_settlement_hash_check";
alter table public."creator_earnings_ledger" add constraint "creator_earnings_ledger_settlement_hash_check"
  check ("settlement_reference_hash" is null or "settlement_reference_hash" ~ '^[0-9a-f]{64}$');

create unique index if not exists "creator_earnings_ledger_provider_event_unique"
  on public."creator_earnings_ledger" ("provider_event_id")
  where "provider_event_id" is not null and "source_type" <> 'payout';
create unique index if not exists "creator_earnings_ledger_money_ledger_unique"
  on public."creator_earnings_ledger" ("money_ledger_event_id")
  where "money_ledger_event_id" is not null and "source_type" <> 'payout';

create table if not exists public."creator_money_recovery_obligations" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_id" uuid not null,
  "money_ledger_event_id" uuid not null references public."money_access_ledger_events"("id") on delete restrict,
  "earnings_ledger_id" uuid not null references public."creator_earnings_ledger"("id") on delete restrict,
  "amount_cents" integer not null,
  "currency" text not null default 'usd',
  "reason" text not null,
  "state" text not null default 'pending_recovery',
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_money_recovery_amount_check" check ("amount_cents" > 0),
  constraint "creator_money_recovery_currency_check" check ("currency" ~ '^[a-z]{3}$'),
  constraint "creator_money_recovery_state_check" check ("state" in ('pending_recovery','recovered','waived')),
  constraint "creator_money_recovery_reason_check" check ("reason" in ('refund_after_payout','reversal_after_payout','chargeback_after_payout')),
  constraint "creator_money_recovery_unique" unique ("money_ledger_event_id", "earnings_ledger_id")
);

alter table public."creator_money_recovery_obligations" enable row level security;
alter table public."creator_money_recovery_obligations" force row level security;
revoke all on table public."creator_money_recovery_obligations" from public, anon, authenticated;
grant select, insert, update, delete on table public."creator_money_recovery_obligations" to service_role;

create or replace function public."creator_money_source_type_for_product"(p_product_type text)
returns text language sql immutable set search_path = '' as $$
  select case lower(trim(coalesce(p_product_type,'')))
    when 'creator_tip' then 'tip'
    when 'paid_content_access' then 'paid_content'
    when 'watch_party_live_ticket' then 'watch_party_ticket'
    when 'event_pass' then 'event_pass'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
    else 'adjustment'
  end
$$;
revoke all on function public."creator_money_source_type_for_product"(text) from public, anon, authenticated;
grant execute on function public."creator_money_source_type_for_product"(text) to service_role;

create or replace function public."finalize_creator_money_settlement"(
  p_money_ledger_event_id uuid,
  p_creator_net_minor integer,
  p_provider_fee_minor integer,
  p_settlement_reference_hash text,
  p_hold_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_money public."money_access_ledger_events"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_earning public."creator_earnings_ledger"%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_hold_days integer;
  v_platform_fee integer;
  v_source_type text;
  v_live_state text;
begin
  if p_money_ledger_event_id is null then raise exception 'money_ledger_event_required'; end if;
  if p_creator_net_minor is null or p_creator_net_minor < 0 then raise exception 'creator_net_invalid'; end if;
  if p_provider_fee_minor is null or p_provider_fee_minor < 0 then raise exception 'provider_fee_invalid'; end if;
  if coalesce(p_settlement_reference_hash,'') !~ '^[0-9a-f]{64}$' then raise exception 'settlement_reference_hash_invalid'; end if;

  perform pg_advisory_xact_lock(hashtextextended('creator-money-settlement:'||p_money_ledger_event_id::text, 0));
  select * into v_money from public."money_access_ledger_events" where "id"=p_money_ledger_event_id for update;
  if v_money."id" is null then raise exception 'money_ledger_event_not_found'; end if;
  if v_money."environment" <> 'production' or v_money."status" <> 'verified' or v_money."payable_state" <> 'pending_verification' then
    raise exception 'money_ledger_event_not_settlement_eligible';
  end if;
  if v_money."creator_id" is null or v_money."provider_event_id" is null or v_money."product_id" is null then
    raise exception 'money_ledger_event_binding_incomplete';
  end if;
  if p_creator_net_minor + p_provider_fee_minor > v_money."amount_minor" then raise exception 'settlement_amounts_exceed_gross'; end if;

  select * into v_provider from public."provider_events" where "id"=v_money."provider_event_id" for update;
  if v_provider."id" is null or v_provider."provider" <> 'revenuecat_app_store' or v_provider."environment" <> 'production' or v_provider."status" <> 'processed' then
    raise exception 'provider_event_not_settlement_eligible';
  end if;
  select * into v_product from public."monetization_products" where "id"=v_money."product_id";
  if v_product."id" is null then raise exception 'settlement_product_missing'; end if;

  if not exists (
    select 1 from public."wave1_creator_eligibility" e
    where e."creator_user_id"=v_money."creator_id" and e."state"='VERIFIED' and e."account_status"='ACTIVE'
      and e."age_18_plus" and e."legal_accepted" and e."creator_role" and e."moderation_state"='CLEAR'
      and e."market"='UNITED_STATES' and e."rollout_eligible" and e."platform_capability" and e."provider_eligible"
      and e."kyc_complete" and e."tax_complete" and e."sanctions_clear" and e."payout_eligible"
  ) then raise exception 'creator_not_currently_settlement_eligible'; end if;

  select "state" into v_live_state from public."platform_money_kill_switches" where "key"='live_money_enabled';
  if coalesce(v_live_state,'off') <> 'on' then raise exception 'live_money_not_enabled_for_settlement'; end if;

  select coalesce(p_hold_days, "payout_hold_days_min") into v_hold_days
  from public."monetization_system_settings" where "id"=true;
  v_hold_days := greatest(7, least(30, coalesce(v_hold_days, 7)));
  v_platform_fee := v_money."amount_minor" - p_provider_fee_minor - p_creator_net_minor;
  v_source_type := public."creator_money_source_type_for_product"(v_product."product_type");

  if v_source_type='tip' and v_platform_fee <> 0 then raise exception 'creator_tip_platform_fee_must_be_zero'; end if;

  select * into v_earning from public."creator_earnings_ledger"
  where "money_ledger_event_id"=v_money."id" for update;
  if v_earning."id" is not null then
    if v_earning."settlement_reference_hash" <> p_settlement_reference_hash
      or v_earning."net_creator_amount_cents" <> p_creator_net_minor
      or v_earning."provider_fee_cents" <> p_provider_fee_minor then
      raise exception 'settlement_replay_mismatch';
    end if;
    return jsonb_build_object('status','already_settled','earningsLedgerId',v_earning."id",'ledgerStatus',v_earning."ledger_status",'holdUntil',v_earning."hold_until");
  end if;

  insert into public."creator_earnings_ledger" (
    "creator_id","source_type","source_id","gross_amount_cents","platform_fee_cents","provider_fee_cents","tax_cents",
    "net_creator_amount_cents","currency","ledger_status","hold_until","metadata","provider_event_id","money_ledger_event_id",
    "settlement_reference_hash","updated_at"
  ) values (
    v_money."creator_id",v_source_type,v_money."source_id",v_money."amount_minor",v_platform_fee,p_provider_fee_minor,0,
    p_creator_net_minor,v_money."currency",'held',v_now+(v_hold_days||' days')::interval,
    jsonb_build_object('provider','revenuecat_app_store','production_money',true,'provider_verified',true,'settlement_verified',true,
      'payout_ready',false,'hold_days',v_hold_days,'source_product_type',v_product."product_type"),
    v_provider."id",v_money."id",p_settlement_reference_hash,v_now
  ) returning * into v_earning;

  update public."money_access_ledger_events"
  set "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object(
    'settlement_verified',true,'settlement_reference_hash',p_settlement_reference_hash,'creator_earnings_ledger_id',v_earning."id",
    'creator_net_minor',p_creator_net_minor,'provider_fee_minor',p_provider_fee_minor,'platform_fee_minor',v_platform_fee,
    'payout_readiness_proved',false,'requires_settlement_before_payable',true
  ) where "id"=v_money."id";

  return jsonb_build_object('status','held','earningsLedgerId',v_earning."id",'holdUntil',v_earning."hold_until",
    'creatorNetMinor',p_creator_net_minor,'providerFeeMinor',p_provider_fee_minor,'platformFeeMinor',v_platform_fee);
end;
$$;
revoke all on function public."finalize_creator_money_settlement"(uuid,integer,integer,text,integer) from public, anon, authenticated;
grant execute on function public."finalize_creator_money_settlement"(uuid,integer,integer,text,integer) to service_role;

create or replace function public."release_mature_creator_money_settlements"(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc'::text, now());
  v_limit integer := greatest(1, least(500, coalesce(p_limit,100)));
  v_payouts text; v_connect text; v_live text;
  v_row record; v_released integer := 0; v_blocked integer := 0;
begin
  select "state" into v_live from public."platform_money_kill_switches" where "key"='live_money_enabled';
  select "state" into v_payouts from public."platform_money_kill_switches" where "key"='payouts_enabled';
  select "state" into v_connect from public."platform_money_kill_switches" where "key"='stripe_connect_enabled';
  if coalesce(v_live,'off')<>'on' or coalesce(v_payouts,'off')<>'on' or coalesce(v_connect,'off')<>'on' then
    return jsonb_build_object('status','blocked','reason','payout_switches_not_enabled','released',0);
  end if;

  for v_row in
    select e."id" earnings_id,e."creator_id",e."money_ledger_event_id",m."id" money_id
    from public."creator_earnings_ledger" e
    join public."money_access_ledger_events" m on m."id"=e."money_ledger_event_id"
    join public."provider_events" p on p."id"=e."provider_event_id"
    where e."ledger_status"='held' and e."hold_until" is not null and e."hold_until"<=v_now
      and m."environment"='production' and m."status"='verified' and m."payable_state"='pending_verification'
      and p."provider"='revenuecat_app_store' and p."status"='processed'
    order by e."hold_until",e."created_at"
    limit v_limit
    for update of e,m
  loop
    if exists (
      select 1 from public."wave1_creator_eligibility" c where c."creator_user_id"=v_row."creator_id"
        and c."state"='VERIFIED' and c."account_status"='ACTIVE' and c."age_18_plus" and c."legal_accepted" and c."creator_role"
        and c."moderation_state"='CLEAR' and c."market"='UNITED_STATES' and c."rollout_eligible" and c."platform_capability"
        and c."provider_eligible" and c."kyc_complete" and c."tax_complete" and c."sanctions_clear" and c."payout_eligible"
    ) then
      update public."creator_earnings_ledger" set "ledger_status"='available',"available_at"=v_now,"updated_at"=v_now,
        "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object('payout_ready',true,'released_at',v_now)
      where "id"=v_row.earnings_id;
      update public."money_access_ledger_events" set "payable_state"='payable',
        "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object('payout_readiness_proved',true,'released_to_available_at',v_now)
      where "id"=v_row.money_id;
      v_released:=v_released+1;
    else
      v_blocked:=v_blocked+1;
    end if;
  end loop;
  return jsonb_build_object('status','complete','released',v_released,'blockedEligibility',v_blocked);
end;
$$;
revoke all on function public."release_mature_creator_money_settlements"(integer) from public, anon, authenticated;
grant execute on function public."release_mature_creator_money_settlements"(integer) to service_role;

create or replace function public."reverse_creator_money_earnings_on_provider_terminal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_earning public."creator_earnings_ledger"%rowtype;
  v_reason text;
begin
  if new."payable_state" not in ('refunded','reversed','chargeback') or old."payable_state"=new."payable_state" then return new; end if;
  select * into v_earning from public."creator_earnings_ledger" where "money_ledger_event_id"=new."id" for update;
  if v_earning."id" is null then return new; end if;
  if v_earning."ledger_status"='paid' then
    v_reason:=case new."payable_state" when 'refunded' then 'refund_after_payout' when 'chargeback' then 'chargeback_after_payout' else 'reversal_after_payout' end;
    insert into public."creator_money_recovery_obligations" ("creator_id","money_ledger_event_id","earnings_ledger_id","amount_cents","currency","reason")
    values (v_earning."creator_id",new."id",v_earning."id",v_earning."net_creator_amount_cents",v_earning."currency",v_reason)
    on conflict ("money_ledger_event_id","earnings_ledger_id") do nothing;
  else
    update public."creator_earnings_ledger" set "ledger_status"='reversed',"reversed_at"=timezone('utc'::text,now()),"updated_at"=timezone('utc'::text,now()),
      "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object('reversed_by_money_ledger_state',new."payable_state")
    where "id"=v_earning."id";
  end if;
  return new;
end;
$$;
revoke all on function public."reverse_creator_money_earnings_on_provider_terminal"() from public, anon, authenticated, service_role;
drop trigger if exists "reverse_creator_money_earnings_on_provider_terminal" on public."money_access_ledger_events";
create trigger "reverse_creator_money_earnings_on_provider_terminal"
after update of "payable_state" on public."money_access_ledger_events"
for each row execute function public."reverse_creator_money_earnings_on_provider_terminal"();

create or replace function public."create_creator_payout_request_safe"(p_amount_cents integer,p_payout_type text default 'scheduled')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid(); v_type text:=lower(trim(coalesce(p_payout_type,'scheduled'))); v_available bigint; v_fee integer; v_request public."creator_payout_requests"%rowtype;
  v_live text; v_payouts text; v_connect text; v_cashout text;
begin
  if v_user is null then raise exception 'auth_required'; end if;
  if coalesce(p_amount_cents,0)<=0 then raise exception 'payout_amount_invalid'; end if;
  if v_type not in ('scheduled','instant') then raise exception 'payout_type_invalid'; end if;
  if not exists (select 1 from public."wave1_creator_eligibility" c where c."creator_user_id"=v_user and c."state"='VERIFIED' and c."account_status"='ACTIVE'
    and c."age_18_plus" and c."legal_accepted" and c."creator_role" and c."moderation_state"='CLEAR' and c."market"='UNITED_STATES'
    and c."rollout_eligible" and c."platform_capability" and c."provider_eligible" and c."kyc_complete" and c."tax_complete" and c."sanctions_clear" and c."payout_eligible")
  then raise exception 'creator_not_payout_eligible'; end if;
  select "state" into v_live from public."platform_money_kill_switches" where "key"='live_money_enabled';
  select "state" into v_payouts from public."platform_money_kill_switches" where "key"='payouts_enabled';
  select "state" into v_connect from public."platform_money_kill_switches" where "key"='stripe_connect_enabled';
  select "state" into v_cashout from public."platform_money_kill_switches" where "key"='cashout_enabled';
  if coalesce(v_live,'off')<>'on' or coalesce(v_payouts,'off')<>'on' or coalesce(v_connect,'off')<>'on' or (v_type='instant' and coalesce(v_cashout,'off')<>'on') then
    raise exception 'payout_execution_disabled'; end if;
  if exists (select 1 from public."creator_money_recovery_obligations" where "creator_id"=v_user and "state"='pending_recovery') then raise exception 'creator_recovery_obligation_pending'; end if;
  select coalesce(sum("net_creator_amount_cents"),0) into v_available from public."creator_earnings_ledger" where "creator_id"=v_user and "ledger_status"='available';
  if v_available<p_amount_cents then raise exception 'insufficient_available_balance'; end if;
  v_fee:=case when v_type='instant' then ceil(p_amount_cents*0.015)::integer else 0 end;
  insert into public."creator_payout_requests" ("creator_id","amount_cents","currency","payout_type","instant_fee_cents","status")
  values (v_user,p_amount_cents,'usd',v_type,v_fee,'requested') returning * into v_request;
  return jsonb_build_object('id',v_request."id",'status',v_request."status",'amountCents',v_request."amount_cents",'instantFeeCents',v_request."instant_fee_cents",'providerMutationPerformed',false);
end;
$$;
revoke all on function public."create_creator_payout_request_safe"(integer,text) from public, anon;
grant execute on function public."create_creator_payout_request_safe"(integer,text) to authenticated, service_role;

-- Marking a payout paid is deliberately service-role only and requires a provider id.
create or replace function public."mark_creator_payout_provider_result"(p_request_id uuid,p_provider_payout_id text,p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_request public."creator_payout_requests"%rowtype; v_status text:=lower(trim(coalesce(p_status,''))); v_now timestamptz:=timezone('utc'::text,now());
begin
  if p_request_id is null then raise exception 'payout_request_required'; end if;
  if v_status not in ('processing','paid','failed','canceled') then raise exception 'payout_provider_status_invalid'; end if;
  if v_status in ('processing','paid') and nullif(trim(coalesce(p_provider_payout_id,'')),'') is null then raise exception 'provider_payout_id_required'; end if;
  select * into v_request from public."creator_payout_requests" where "id"=p_request_id for update;
  if v_request."id" is null then raise exception 'payout_request_not_found'; end if;
  if v_request."status"='paid' and v_status<>'paid' then raise exception 'paid_payout_terminal'; end if;
  update public."creator_payout_requests" set "status"=v_status,"provider_payout_id"=coalesce(nullif(trim(p_provider_payout_id),''),"provider_payout_id"),"updated_at"=v_now where "id"=p_request_id returning * into v_request;
  if v_status='paid' then
    -- Reserve oldest available earnings only after provider-confirmed payout completion.
    with candidates as (
      select "id",sum("net_creator_amount_cents") over(order by "available_at","created_at","id") running
      from public."creator_earnings_ledger" where "creator_id"=v_request."creator_id" and "ledger_status"='available' order by "available_at","created_at","id"
    ), chosen as (
      select "id" from candidates where running - (select "net_creator_amount_cents" from public."creator_earnings_ledger" e where e."id"=candidates."id") < v_request."amount_cents"
    )
    update public."creator_earnings_ledger" e set "ledger_status"='paid',"updated_at"=v_now,
      "metadata"=coalesce(e."metadata",'{}'::jsonb)||jsonb_build_object('payout_request_id',v_request."id",'provider_payout_id_hash',encode(extensions.digest(convert_to(p_provider_payout_id,'UTF8'),'sha256'),'hex'))
    where e."id" in (select "id" from chosen);
  end if;
  return jsonb_build_object('id',v_request."id",'status',v_request."status",'providerPayoutIdPresent',v_request."provider_payout_id" is not null);
end;
$$;
revoke all on function public."mark_creator_payout_provider_result"(uuid,text,text) from public, anon, authenticated;
grant execute on function public."mark_creator_payout_provider_result"(uuid,text,text) to service_role;

comment on function public."finalize_creator_money_settlement"(uuid,integer,integer,text,integer) is 'Trusted financial-report settlement step. Does not execute payouts.';
comment on function public."release_mature_creator_money_settlements"(integer) is 'Moves held obligations to available only after hold, eligibility, and payout/provider switches. Does not execute payouts.';
comment on function public."create_creator_payout_request_safe"(integer,text) is 'Creates a payout request from available obligations only. Provider execution remains external and disabled unless separately configured.';
