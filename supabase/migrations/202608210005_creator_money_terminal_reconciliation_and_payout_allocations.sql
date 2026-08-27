-- Corrective convergence for iOS creator-money production readiness.
-- Keeps every provider/payout switch off by default while closing exact-source,
-- lifecycle-accounting, partial-payout, and post-payout recovery edges.

-- The historical v1 intent function had a legacy Paid Video discriminator. Preserve
-- it for the already-reviewed Event/VIP/Channel paths and front it with an exact
-- creator_video implementation.
alter function public."create_ios_creator_money_purchase_intent"(text,uuid,integer,jsonb)
  rename to "create_ios_creator_money_purchase_intent_v1";

create or replace function public."create_ios_creator_money_purchase_intent"(
  p_concept text,p_source_id uuid,p_amount_minor integer,p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_concept text:=lower(trim(coalesce(p_concept,'')));
  v_user uuid:=auth.uid(); v_email text:=nullif(lower(trim(coalesce(auth.jwt()->>'email',''))),'');
  v_now timestamptz:=timezone('utc'::text,now());
  v_creator uuid; v_price integer; v_currency text; v_mapping public."monetization_product_store_mappings"%rowtype;
  v_product public."monetization_products"%rowtype; v_intent public."money_purchase_intents"%rowtype;
  v_app_store text; v_webhooks text; v_paid_content text; v_creator_money text; v_live text; v_payouts text; v_environment text; v_legal jsonb;
begin
  if v_concept<>'paid_video' then
    return public."create_ios_creator_money_purchase_intent_v1"(p_concept,p_source_id,p_amount_minor,p_metadata);
  end if;
  if v_user is null then raise exception 'auth_required'; end if;
  if p_source_id is null then raise exception 'source_id_required'; end if;
  if coalesce(p_amount_minor,0)<=0 then raise exception 'amount_required'; end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' or coalesce(p_metadata,'{}'::jsonb)::text ~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization)' then raise exception 'unsafe_metadata'; end if;

  select "creator_id","price_cents",lower("currency") into v_creator,v_price,v_currency
  from public."creator_content_prices"
  where "content_id"=p_source_id and "content_type"='creator_video' and "is_paid" and "status" in ('sandbox','active')
  order by "updated_at" desc limit 1;
  if v_creator is null then raise exception 'paid_video_offer_not_available'; end if;
  if v_creator=v_user then raise exception 'creator_cannot_purchase_own_offer'; end if;
  if v_currency<>'usd' then raise exception 'ios_creator_money_usd_catalog_required'; end if;
  if p_amount_minor<>v_price then raise exception 'ios_creator_money_exact_store_price_required'; end if;
  if coalesce((public."has_paid_content_access"(v_user,p_source_id)->>'allowed')::boolean,false) then return jsonb_build_object('alreadyPurchased',true,'providerProductId',null); end if;
  if exists (select 1 from public."channel_audience_blocks" where ("channel_user_id"=v_creator::text and "blocked_user_id"=v_user::text) or ("channel_user_id"=v_user::text and "blocked_user_id"=v_creator::text)) then raise exception 'creator_money_blocked_by_audience_policy'; end if;

  select "state" into v_app_store from public."platform_money_kill_switches" where "key"='revenuecat_app_store_enabled';
  select "state" into v_webhooks from public."platform_money_kill_switches" where "key"='provider_webhooks_enabled';
  select "state" into v_paid_content from public."platform_money_kill_switches" where "key"='paid_content_enabled';
  select "state" into v_creator_money from public."platform_money_kill_switches" where "key"='creator_monetization_enabled';
  select "state" into v_live from public."platform_money_kill_switches" where "key"='live_money_enabled';
  select "state" into v_payouts from public."platform_money_kill_switches" where "key"='payouts_enabled';

  if v_app_store='sandbox_only' and v_webhooks='sandbox_only' and v_paid_content='sandbox_only'
    and v_creator_money in ('sandbox_only','on') and coalesce(v_live,'off')='off' and coalesce(v_payouts,'off')='off' then
    v_environment:='sandbox';
    if not (public."has_platform_role"(array['owner'::text,'operator'::text]) or public."has_active_beta_access"()
      or public."resolve_sandbox_monetization_tester"(v_user::text,v_email)) then raise exception 'sandbox_monetization_tester_required'; end if;
  elsif v_app_store='on' and v_webhooks='on' and v_paid_content='on' and v_creator_money='on' and v_live='on' then
    v_environment:='production';
    v_legal:=public."wave1_legal_requirements_readback"('creator_money');
    if coalesce((v_legal->>'allAccepted')::boolean,false) is not true or v_legal->>'market'<>'UNITED_STATES' then raise exception 'buyer_creator_money_legal_not_current'; end if;
    if not exists (select 1 from public."wave1_creator_eligibility" e where e."creator_user_id"=v_creator and e."state"='VERIFIED'
      and e."account_status"='ACTIVE' and e."age_18_plus" and e."legal_accepted" and e."creator_role" and e."moderation_state"='CLEAR'
      and e."market"='UNITED_STATES' and e."rollout_eligible" and e."platform_capability" and e."provider_eligible"
      and e."kyc_complete" and e."tax_complete" and e."sanctions_clear" and e."payout_eligible") then raise exception 'creator_not_verified_for_production_money'; end if;
  else raise exception 'ios_creator_money_disabled'; end if;

  select mapping.* into v_mapping from public."monetization_product_store_mappings" mapping
  where mapping."concept"='paid_video' and mapping."platform"='ios' and mapping."store"='app_store' and mapping."provider"='revenuecat_app_store'
    and mapping."reference_price_minor"=v_price and mapping."environment"=v_environment
    and mapping."status"=case when v_environment='production' then 'active' else 'sandbox' end
    and mapping."store_product_type"='consumable' and not mapping."grants_livekit_authority" and not mapping."creates_payable_balance"
  order by mapping."tier" limit 1;
  if v_mapping."id" is null then raise exception 'ios_store_tier_mapping_missing'; end if;
  if v_environment='production' and (coalesce((v_mapping."metadata"->>'provider_proof')::boolean,false) is not true
    or coalesce((v_mapping."metadata"->>'owner_release_approved')::boolean,false) is not true
    or coalesce((v_mapping."metadata"->>'physical_device_proof')::boolean,false) is not true) then raise exception 'ios_production_mapping_proof_incomplete'; end if;
  select * into v_product from public."monetization_products" where "id"=v_mapping."product_id";
  if v_product."id" is null then raise exception 'ios_conceptual_product_missing'; end if;
  if (select count(*) from public."money_purchase_intents" where "user_id"=v_user and "provider"='revenuecat_app_store' and "status"='pending' and "expires_at">v_now and "created_at">v_now-interval '1 minute')>=6 then raise exception 'ios_purchase_intent_rate_limited'; end if;

  insert into public."money_purchase_intents" ("user_id","product_id","product_key","product_type","provider","provider_product_id","source_type","source_id","creator_id","environment","status","amount_minor","currency","idempotency_key","expires_at","metadata")
  values (v_user,v_product."id",v_product."product_key",v_product."product_type",'revenuecat_app_store',v_mapping."provider_product_id",'paid_content',p_source_id,v_creator,v_environment,'pending',v_price,v_currency,
    'ios_creator_money:'||v_user::text||':'||gen_random_uuid()::text,v_now+interval '15 minutes',
    jsonb_build_object('store_mapping_id',v_mapping."id",'concept','paid_video','sandbox_only',v_environment='sandbox','production_intent',v_environment='production',
      'not_payable',true,'viewer_access_only',true,'grants_livekit_authority',false,'grants_host_authority',false,'premium_unlock',false,'payout_ready',false,
      'creator_eligibility_required',v_environment='production','canonical_content_type','creator_video')||coalesce(p_metadata,'{}'::jsonb)) returning * into v_intent;
  return public."money_purchase_intent_safe_row"(v_intent)||jsonb_build_object('providerProductId',v_mapping."provider_product_id",'concept','paid_video','environment',v_environment,'storeMappingId',v_mapping."id");
end;
$$;
revoke all on function public."create_ios_creator_money_purchase_intent"(text,uuid,integer,jsonb) from public, anon;
grant execute on function public."create_ios_creator_money_purchase_intent"(text,uuid,integer,jsonb) to authenticated, service_role;
revoke all on function public."create_ios_creator_money_purchase_intent_v1"(text,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public."create_ios_creator_money_purchase_intent_v1"(text,uuid,integer,jsonb) to service_role;

-- Subscription cancellation/expiration/pause ends or changes access, but does not
-- retroactively reverse earned subscription revenue. Only provider refund/revocation
-- events are financial reversals.
create or replace function public."normalize_creator_money_lifecycle_ledger_insert"()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new."environment"='production' and new."source_type"='channel_subscription'
    and upper(new."event_type") in ('EXPIRATION','CANCELLATION','BILLING_ISSUE','SUBSCRIPTION_PAUSED') then
    new."payable_state":='not_payable';
    new."status":=case when upper(new."event_type")='BILLING_ISSUE' then 'pending' else 'ignored' end;
    new."metadata":=coalesce(new."metadata",'{}'::jsonb)||jsonb_build_object('lifecycle_no_financial_reversal',true);
  end if;
  return new;
end;
$$;
revoke all on function public."normalize_creator_money_lifecycle_ledger_insert"() from public, anon, authenticated, service_role;
drop trigger if exists "normalize_creator_money_lifecycle_ledger_insert" on public."money_access_ledger_events";
create trigger "normalize_creator_money_lifecycle_ledger_insert"
before insert on public."money_access_ledger_events" for each row execute function public."normalize_creator_money_lifecycle_ledger_insert"();

create table if not exists public."creator_money_reversal_links" (
  "id" uuid primary key default gen_random_uuid(),
  "terminal_money_ledger_event_id" uuid not null references public."money_access_ledger_events"("id") on delete restrict,
  "original_money_ledger_event_id" uuid not null references public."money_access_ledger_events"("id") on delete restrict,
  "amount_cents" integer not null,
  "currency" text not null,
  "reason" text not null,
  "created_at" timestamptz not null default timezone('utc'::text,now()),
  constraint "creator_money_reversal_links_unique" unique ("terminal_money_ledger_event_id","original_money_ledger_event_id"),
  constraint "creator_money_reversal_links_amount_check" check ("amount_cents">0),
  constraint "creator_money_reversal_links_currency_check" check ("currency"~'^[a-z]{3}$'),
  constraint "creator_money_reversal_links_reason_check" check ("reason" in ('refund','revocation','chargeback'))
);
alter table public."creator_money_reversal_links" enable row level security;
alter table public."creator_money_reversal_links" force row level security;
revoke all on table public."creator_money_reversal_links" from public,anon,authenticated;
grant select,insert,update,delete on table public."creator_money_reversal_links" to service_role;

create or replace function public."link_creator_money_terminal_event"()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_original public."money_access_ledger_events"%rowtype; v_terminal_state text; v_reason text; v_original_tx text;
begin
  if new."environment"<>'production' or new."payable_state" not in ('refunded','reversed','chargeback') then return new; end if;
  v_original_tx:=nullif(new."metadata"->>'original_transaction_id','');
  select * into v_original from public."money_access_ledger_events" prior
  where prior."id"<>new."id" and prior."environment"='production' and prior."status"='verified'
    and prior."user_id" is not distinct from new."user_id" and prior."creator_id" is not distinct from new."creator_id"
    and prior."product_id" is not distinct from new."product_id" and prior."source_id" is not distinct from new."source_id"
    and prior."amount_minor"=new."amount_minor" and prior."currency"=new."currency"
    and prior."payable_state" in ('pending_verification','payable','paid')
    and (v_original_tx is null or nullif(prior."metadata"->>'original_transaction_id','') is null or prior."metadata"->>'original_transaction_id'=v_original_tx)
  order by prior."created_at" desc limit 1 for update;
  if v_original."id" is null then return new; end if;
  v_terminal_state:=case when new."payable_state"='refunded' then 'refunded' when new."payable_state"='chargeback' then 'chargeback' else 'reversed' end;
  v_reason:=case when v_terminal_state='refunded' then 'refund' when v_terminal_state='chargeback' then 'chargeback' else 'revocation' end;
  insert into public."creator_money_reversal_links" ("terminal_money_ledger_event_id","original_money_ledger_event_id","amount_cents","currency","reason")
  values (new."id",v_original."id",new."amount_minor",new."currency",v_reason) on conflict do nothing;
  update public."money_access_ledger_events" set "payable_state"=v_terminal_state,
    "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object('terminal_money_ledger_event_id',new."id",'terminal_reason',v_reason)
  where "id"=v_original."id";
  new."metadata":=coalesce(new."metadata",'{}'::jsonb)||jsonb_build_object('reverses_money_ledger_event_id',v_original."id");
  return new;
end;
$$;
revoke all on function public."link_creator_money_terminal_event"() from public,anon,authenticated,service_role;
drop trigger if exists "link_creator_money_terminal_event" on public."money_access_ledger_events";
create trigger "link_creator_money_terminal_event"
before insert on public."money_access_ledger_events" for each row execute function public."link_creator_money_terminal_event"();

-- Wrap the atomic provider function so its response reflects any lifecycle ledger
-- normalization performed by the database trigger above.
alter function public."process_revenuecat_consumable_event_atomic"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text)
  rename to "process_revenuecat_consumable_event_atomic_v1";
create or replace function public."process_revenuecat_consumable_event_atomic"(
  p_provider_event_id text,p_event_type text,p_user_id uuid,p_provider_product_id text,p_environment text,
  p_occurred_at timestamptz,p_expires_at timestamptz,p_amount_minor integer,p_currency text,p_raw_payload_hash text,p_original_transaction_id text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_ledger public."money_access_ledger_events"%rowtype;
begin
  v_result:=public."process_revenuecat_consumable_event_atomic_v1"(p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,p_environment,p_occurred_at,p_expires_at,p_amount_minor,p_currency,p_raw_payload_hash,p_original_transaction_id);
  if nullif(v_result->>'ledgerEventId','') is not null then
    select * into v_ledger from public."money_access_ledger_events" where "id"=(v_result->>'ledgerEventId')::uuid;
    if v_ledger."id" is not null then v_result:=v_result||jsonb_build_object('payableState',v_ledger."payable_state",'ledgerStatus',v_ledger."status"); end if;
  end if;
  return v_result;
end;
$$;
revoke all on function public."process_revenuecat_consumable_event_atomic"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text) from public,anon,authenticated;
grant execute on function public."process_revenuecat_consumable_event_atomic"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text) to service_role;
revoke all on function public."process_revenuecat_consumable_event_atomic_v1"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text) from public,anon,authenticated;
grant execute on function public."process_revenuecat_consumable_event_atomic_v1"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text) to service_role;

-- Exact payout allocation allows partial payout requests without double-spending an
-- earnings row and gives post-payout refunds an exact recovered amount.
create table if not exists public."creator_payout_allocations" (
  "id" uuid primary key default gen_random_uuid(),
  "payout_request_id" uuid not null references public."creator_payout_requests"("id") on delete restrict,
  "earnings_ledger_id" uuid not null references public."creator_earnings_ledger"("id") on delete restrict,
  "amount_cents" integer not null,
  "state" text not null default 'reserved',
  "created_at" timestamptz not null default timezone('utc'::text,now()),
  "updated_at" timestamptz not null default timezone('utc'::text,now()),
  constraint "creator_payout_allocations_amount_check" check ("amount_cents">0),
  constraint "creator_payout_allocations_state_check" check ("state" in ('reserved','paid','released')),
  constraint "creator_payout_allocations_unique" unique ("payout_request_id","earnings_ledger_id")
);
alter table public."creator_payout_allocations" enable row level security;
alter table public."creator_payout_allocations" force row level security;
revoke all on table public."creator_payout_allocations" from public,anon,authenticated;
grant select,insert,update,delete on table public."creator_payout_allocations" to service_role;

create or replace function public."create_creator_payout_request_safe"(p_amount_cents integer,p_payout_type text default 'scheduled')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid:=auth.uid(); v_type text:=lower(trim(coalesce(p_payout_type,'scheduled'))); v_available bigint:=0; v_fee integer; v_request public."creator_payout_requests"%rowtype;
  v_live text; v_payouts text; v_connect text; v_cashout text; v_remaining integer; v_row record; v_unallocated integer;
begin
  if v_user is null then raise exception 'auth_required'; end if;
  if coalesce(p_amount_cents,0)<=0 then raise exception 'payout_amount_invalid'; end if;
  if v_type not in ('scheduled','instant') then raise exception 'payout_type_invalid'; end if;
  if not exists (select 1 from public."wave1_creator_eligibility" c where c."creator_user_id"=v_user and c."state"='VERIFIED' and c."account_status"='ACTIVE'
    and c."age_18_plus" and c."legal_accepted" and c."creator_role" and c."moderation_state"='CLEAR' and c."market"='UNITED_STATES'
    and c."rollout_eligible" and c."platform_capability" and c."provider_eligible" and c."kyc_complete" and c."tax_complete" and c."sanctions_clear" and c."payout_eligible") then raise exception 'creator_not_payout_eligible'; end if;
  select "state" into v_live from public."platform_money_kill_switches" where "key"='live_money_enabled';
  select "state" into v_payouts from public."platform_money_kill_switches" where "key"='payouts_enabled';
  select "state" into v_connect from public."platform_money_kill_switches" where "key"='stripe_connect_enabled';
  select "state" into v_cashout from public."platform_money_kill_switches" where "key"='cashout_enabled';
  if coalesce(v_live,'off')<>'on' or coalesce(v_payouts,'off')<>'on' or coalesce(v_connect,'off')<>'on' or (v_type='instant' and coalesce(v_cashout,'off')<>'on') then raise exception 'payout_execution_disabled'; end if;
  if exists (select 1 from public."creator_money_recovery_obligations" where "creator_id"=v_user and "state"='pending_recovery') then raise exception 'creator_recovery_obligation_pending'; end if;
  perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||v_user::text,0));
  select coalesce(sum(e."net_creator_amount_cents"-coalesce(a.allocated,0)),0) into v_available
  from public."creator_earnings_ledger" e left join (
    select "earnings_ledger_id",sum("amount_cents") allocated from public."creator_payout_allocations" where "state" in ('reserved','paid') group by "earnings_ledger_id"
  ) a on a."earnings_ledger_id"=e."id" where e."creator_id"=v_user and e."ledger_status"='available';
  if v_available<p_amount_cents then raise exception 'insufficient_available_balance'; end if;
  v_fee:=case when v_type='instant' then ceil(p_amount_cents*0.015)::integer else 0 end;
  insert into public."creator_payout_requests" ("creator_id","amount_cents","currency","payout_type","instant_fee_cents","status") values (v_user,p_amount_cents,'usd',v_type,v_fee,'requested') returning * into v_request;
  v_remaining:=p_amount_cents;
  for v_row in
    select e."id",e."net_creator_amount_cents"-coalesce(a.allocated,0) unallocated
    from public."creator_earnings_ledger" e left join (
      select "earnings_ledger_id",sum("amount_cents") allocated from public."creator_payout_allocations" where "state" in ('reserved','paid') group by "earnings_ledger_id"
    ) a on a."earnings_ledger_id"=e."id"
    where e."creator_id"=v_user and e."ledger_status"='available' and e."net_creator_amount_cents"-coalesce(a.allocated,0)>0
    order by e."available_at",e."created_at",e."id" for update of e
  loop
    exit when v_remaining<=0;
    v_unallocated:=least(v_remaining,v_row.unallocated);
    insert into public."creator_payout_allocations" ("payout_request_id","earnings_ledger_id","amount_cents") values (v_request."id",v_row."id",v_unallocated);
    v_remaining:=v_remaining-v_unallocated;
  end loop;
  if v_remaining<>0 then raise exception 'payout_allocation_incomplete'; end if;
  return jsonb_build_object('id',v_request."id",'status',v_request."status",'amountCents',v_request."amount_cents",'instantFeeCents',v_request."instant_fee_cents",'providerMutationPerformed',false);
end;
$$;
revoke all on function public."create_creator_payout_request_safe"(integer,text) from public,anon;
grant execute on function public."create_creator_payout_request_safe"(integer,text) to authenticated,service_role;

create or replace function public."mark_creator_payout_provider_result"(p_request_id uuid,p_provider_payout_id text,p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public."creator_payout_requests"%rowtype; v_status text:=lower(trim(coalesce(p_status,''))); v_now timestamptz:=timezone('utc'::text,now()); v_allocation record;
begin
  if p_request_id is null then raise exception 'payout_request_required'; end if;
  if v_status not in ('processing','paid','failed','canceled') then raise exception 'payout_provider_status_invalid'; end if;
  if v_status in ('processing','paid') and nullif(trim(coalesce(p_provider_payout_id,'')),'') is null then raise exception 'provider_payout_id_required'; end if;
  select * into v_request from public."creator_payout_requests" where "id"=p_request_id for update;
  if v_request."id" is null then raise exception 'payout_request_not_found'; end if;
  if v_request."status"='paid' and v_status<>'paid' then raise exception 'paid_payout_terminal'; end if;
  update public."creator_payout_requests" set "status"=v_status,"provider_payout_id"=coalesce(nullif(trim(p_provider_payout_id),''),"provider_payout_id"),"updated_at"=v_now where "id"=p_request_id returning * into v_request;
  if v_status='paid' then
    update public."creator_payout_allocations" set "state"='paid',"updated_at"=v_now where "payout_request_id"=p_request_id and "state"='reserved';
    for v_allocation in select a."earnings_ledger_id",sum(a."amount_cents") paid_amount,e."net_creator_amount_cents" from public."creator_payout_allocations" a join public."creator_earnings_ledger" e on e."id"=a."earnings_ledger_id" where a."state"='paid' and a."earnings_ledger_id" in (select "earnings_ledger_id" from public."creator_payout_allocations" where "payout_request_id"=p_request_id) group by a."earnings_ledger_id",e."net_creator_amount_cents" loop
      if v_allocation.paid_amount>=v_allocation.net_creator_amount_cents then update public."creator_earnings_ledger" set "ledger_status"='paid',"updated_at"=v_now where "id"=v_allocation."earnings_ledger_id"; end if;
    end loop;
  elsif v_status in ('failed','canceled') then
    update public."creator_payout_allocations" set "state"='released',"updated_at"=v_now where "payout_request_id"=p_request_id and "state"='reserved';
  end if;
  return jsonb_build_object('id',v_request."id",'status',v_request."status",'providerPayoutIdPresent',v_request."provider_payout_id" is not null);
end;
$$;
revoke all on function public."mark_creator_payout_provider_result"(uuid,text,text) from public,anon,authenticated;
grant execute on function public."mark_creator_payout_provider_result"(uuid,text,text) to service_role;

-- Replace the reversal trigger so a post-payout refund creates recovery only for the
-- amount actually paid out, while the remaining unpaid obligation is reversed.
create or replace function public."reverse_creator_money_earnings_on_provider_terminal"()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_earning public."creator_earnings_ledger"%rowtype; v_paid integer:=0; v_reason text;
begin
  if new."payable_state" not in ('refunded','reversed','chargeback') or old."payable_state"=new."payable_state" then return new; end if;
  select * into v_earning from public."creator_earnings_ledger" where "money_ledger_event_id"=new."id" for update;
  if v_earning."id" is null then return new; end if;
  select coalesce(sum("amount_cents"),0)::integer into v_paid from public."creator_payout_allocations" where "earnings_ledger_id"=v_earning."id" and "state"='paid';
  if v_paid>0 then
    v_reason:=case new."payable_state" when 'refunded' then 'refund_after_payout' when 'chargeback' then 'chargeback_after_payout' else 'reversal_after_payout' end;
    insert into public."creator_money_recovery_obligations" ("creator_id","money_ledger_event_id","earnings_ledger_id","amount_cents","currency","reason")
    values (v_earning."creator_id",new."id",v_earning."id",least(v_paid,v_earning."net_creator_amount_cents"),v_earning."currency",v_reason)
    on conflict ("money_ledger_event_id","earnings_ledger_id") do update set "amount_cents"=greatest(public."creator_money_recovery_obligations"."amount_cents",excluded."amount_cents"),"updated_at"=timezone('utc'::text,now());
  end if;
  update public."creator_payout_allocations" set "state"='released',"updated_at"=timezone('utc'::text,now()) where "earnings_ledger_id"=v_earning."id" and "state"='reserved';
  update public."creator_earnings_ledger" set "ledger_status"='reversed',"reversed_at"=timezone('utc'::text,now()),"updated_at"=timezone('utc'::text,now()),
    "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object('reversed_by_money_ledger_state',new."payable_state",'paid_amount_recovery_required',v_paid)
  where "id"=v_earning."id";
  return new;
end;
$$;
revoke all on function public."reverse_creator_money_earnings_on_provider_terminal"() from public,anon,authenticated,service_role;
