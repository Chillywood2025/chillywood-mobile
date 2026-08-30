-- Financial state may advance only from immutable provider receipts written by
-- a database-owned verifier. The ordinary service role can consume a verified
-- receipt, but cannot create or alter one.

create table if not exists public."creator_money_provider_settlement_receipts" (
  "id" uuid primary key default gen_random_uuid(),
  "money_ledger_event_id" uuid not null unique
    references public."money_access_ledger_events"("id") on delete restrict,
  "provider_event_id" uuid not null
    references public."provider_events"("id") on delete restrict,
  "provider" text not null check ("provider" in ('revenuecat_app_store','revenuecat_google_play')),
  "provider_settlement_id" text not null,
  "creator_id" uuid not null,
  "gross_amount_minor" integer not null check ("gross_amount_minor" >= 0),
  "creator_net_minor" integer not null check ("creator_net_minor" >= 0),
  "provider_fee_minor" integer not null check ("provider_fee_minor" >= 0),
  "currency" text not null check ("currency" ~ '^[a-z]{3}$'),
  "environment" text not null check ("environment" in ('sandbox','production')),
  "evidence_source" text not null check ("evidence_source" in (
    'app_store_server_api','google_play_financial_report','revenuecat_verified_report'
  )),
  "evidence_hash" text not null check ("evidence_hash" ~ '^[0-9a-f]{64}$'),
  "verified_at" timestamptz not null,
  "consumed_at" timestamptz,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  unique ("provider", "provider_settlement_id"),
  check ("creator_net_minor" + "provider_fee_minor" <= "gross_amount_minor"),
  check (jsonb_typeof("metadata") = 'object')
);

create table if not exists public."creator_payout_provider_result_receipts" (
  "id" uuid primary key default gen_random_uuid(),
  "payout_request_id" uuid not null unique
    references public."creator_payout_requests"("id") on delete restrict,
  "creator_id" uuid not null,
  "provider" text not null check ("provider" = 'stripe_connect'),
  "provider_object_type" text not null check ("provider_object_type" in ('transfer','payout')),
  "provider_object_id" text not null,
  "provider_account_id" text not null,
  "provider_status" text not null check ("provider_status" in ('processing','paid','failed','canceled')),
  "amount_cents" integer not null check ("amount_cents" > 0),
  "currency" text not null check ("currency" ~ '^[a-z]{3}$'),
  "environment" text not null check ("environment" in ('test','production')),
  "evidence_hash" text not null check ("evidence_hash" ~ '^[0-9a-f]{64}$'),
  "verified_at" timestamptz not null,
  "consumed_at" timestamptz,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  unique ("provider", "provider_object_id"),
  check (jsonb_typeof("metadata") = 'object')
);

alter table public."creator_money_provider_settlement_receipts" enable row level security;
alter table public."creator_payout_provider_result_receipts" enable row level security;

revoke all on table public."creator_money_provider_settlement_receipts" from public, anon, authenticated, service_role;
revoke all on table public."creator_payout_provider_result_receipts" from public, anon, authenticated, service_role;

alter function public."finalize_creator_money_settlement"(uuid,integer,integer,text,integer)
  rename to "finalize_creator_money_settlement_pre_verified_receipt";
revoke all on function public."finalize_creator_money_settlement_pre_verified_receipt"(uuid,integer,integer,text,integer)
  from public, anon, authenticated, service_role;

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
  v_receipt public."creator_money_provider_settlement_receipts"%rowtype;
  v_money public."money_access_ledger_events"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_result jsonb;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if p_money_ledger_event_id is null then raise exception 'money_ledger_event_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('provider-settlement-receipt:' || p_money_ledger_event_id::text, 0)
  );

  select receipt.* into v_receipt
  from public."creator_money_provider_settlement_receipts" receipt
  where receipt."money_ledger_event_id" = p_money_ledger_event_id
  for update;
  if v_receipt."id" is null then raise exception 'verified_provider_settlement_receipt_required'; end if;
  if v_receipt."verified_at" > v_now + interval '2 minutes' then
    raise exception 'provider_settlement_receipt_time_invalid';
  end if;

  select money.* into v_money
  from public."money_access_ledger_events" money
  where money."id" = p_money_ledger_event_id
  for update;
  if v_money."id" is null
    or v_money."provider_event_id" is distinct from v_receipt."provider_event_id"
    or v_money."creator_id" is distinct from v_receipt."creator_id"
    or v_money."amount_minor" is distinct from v_receipt."gross_amount_minor"
    or v_money."currency" is distinct from v_receipt."currency"
    or v_money."environment" is distinct from v_receipt."environment"
  then raise exception 'provider_settlement_receipt_binding_mismatch'; end if;
  select provider_event.* into v_provider
  from public."provider_events" provider_event
  where provider_event."id" = v_receipt."provider_event_id"
  for update;
  if v_provider."id" is null
    or v_provider."provider" is distinct from v_receipt."provider"
    or v_provider."environment" is distinct from v_receipt."environment"
    or v_provider."user_id" is distinct from v_money."user_id"
    or v_provider."status" <> 'processed'
  then raise exception 'provider_settlement_receipt_provider_mismatch'; end if;
  if p_creator_net_minor is distinct from v_receipt."creator_net_minor"
    or p_provider_fee_minor is distinct from v_receipt."provider_fee_minor"
    or p_settlement_reference_hash is distinct from v_receipt."evidence_hash"
  then raise exception 'provider_settlement_receipt_parameter_mismatch'; end if;
  if p_hold_days is not null then
    raise exception 'provider_settlement_hold_policy_must_be_server_owned';
  end if;

  v_result := public."finalize_creator_money_settlement_pre_verified_receipt"(
    p_money_ledger_event_id,
    v_receipt."creator_net_minor",
    v_receipt."provider_fee_minor",
    v_receipt."evidence_hash",
    null
  );
  update public."creator_money_provider_settlement_receipts"
  set "consumed_at" = coalesce("consumed_at", v_now)
  where "id" = v_receipt."id";
  return v_result || jsonb_build_object(
    'providerSettlementReceiptId', v_receipt."id",
    'providerSettlementReceiptVerified', true
  );
end;
$$;
revoke all on function public."finalize_creator_money_settlement"(uuid,integer,integer,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public."finalize_creator_money_settlement"(uuid,integer,integer,text,integer)
  to service_role;
comment on function public."finalize_creator_money_settlement"(uuid,integer,integer,text,integer) is
  'Consumes an immutable database-owned provider settlement receipt. Caller-supplied hashes and economics are never authority.';

alter function public."mark_creator_payout_provider_result"(uuid,text,text)
  rename to "mark_creator_payout_provider_result_pre_verified_receipt";
revoke all on function public."mark_creator_payout_provider_result_pre_verified_receipt"(uuid,text,text)
  from public, anon, authenticated, service_role;

create or replace function public."mark_creator_payout_provider_result"(
  p_request_id uuid,
  p_provider_payout_id text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public."creator_payout_provider_result_receipts"%rowtype;
  v_request public."creator_payout_requests"%rowtype;
  v_provider_account_id text;
  v_provider_environment text;
  v_result jsonb;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if p_request_id is null then raise exception 'payout_request_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('provider-payout-receipt:' || p_request_id::text, 0)
  );

  select receipt.* into v_receipt
  from public."creator_payout_provider_result_receipts" receipt
  where receipt."payout_request_id" = p_request_id
  for update;
  if v_receipt."id" is null then raise exception 'verified_provider_payout_receipt_required'; end if;
  if v_receipt."verified_at" > v_now + interval '2 minutes' then
    raise exception 'provider_payout_receipt_time_invalid';
  end if;

  select request.* into v_request
  from public."creator_payout_requests" request
  where request."id" = p_request_id
  for update;
  if v_request."id" is null
    or v_request."creator_id" is distinct from v_receipt."creator_id"
    or v_request."amount_cents" is distinct from v_receipt."amount_cents"
    or v_request."currency" is distinct from v_receipt."currency"
  then raise exception 'provider_payout_receipt_binding_mismatch'; end if;

  select account."provider_account_id", account."provider_environment"
    into v_provider_account_id, v_provider_environment
  from public."creator_payout_accounts" account
  where account."creator_user_id" = v_request."creator_id"::text
    and account."provider" = 'stripe_connect'
    and account."provider_account_id" = v_receipt."provider_account_id"
  limit 1;
  if v_provider_account_id is null then raise exception 'provider_payout_destination_mismatch'; end if;
  if v_provider_environment is distinct from (case v_receipt."environment"
      when 'production' then 'live' else 'test' end)
  then raise exception 'provider_payout_environment_mismatch'; end if;
  if nullif(trim(coalesce(p_provider_payout_id, '')), '') is distinct from v_receipt."provider_object_id"
    or lower(trim(coalesce(p_status, ''))) is distinct from v_receipt."provider_status"
  then raise exception 'provider_payout_receipt_parameter_mismatch'; end if;

  v_result := public."mark_creator_payout_provider_result_pre_verified_receipt"(
    p_request_id,
    v_receipt."provider_object_id",
    v_receipt."provider_status"
  );
  update public."creator_payout_provider_result_receipts"
  set "consumed_at" = coalesce("consumed_at", v_now)
  where "id" = v_receipt."id";
  return v_result || jsonb_build_object(
    'providerPayoutReceiptId', v_receipt."id",
    'providerPayoutReceiptVerified', true
  );
end;
$$;
revoke all on function public."mark_creator_payout_provider_result"(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public."mark_creator_payout_provider_result"(uuid,text,text)
  to service_role;
comment on function public."mark_creator_payout_provider_result"(uuid,text,text) is
  'Consumes an immutable database-owned Stripe result receipt bound to the exact request, creator, destination, amount, currency, object id, and status.';
