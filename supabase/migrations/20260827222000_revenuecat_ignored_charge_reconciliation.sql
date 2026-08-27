-- A verified active Store/RevenueCat delivery may represent money already
-- charged even when application authority must fail closed. Preserve a durable,
-- service-owned obligation for every such ignored event so it cannot become an
-- invisible buyer loss or an untracked manual task.

create table public."revenuecat_provider_reconciliation_obligations" (
  "id" uuid primary key default gen_random_uuid(),
  "provider_event_id" uuid not null unique
    references public."provider_events"("id") on delete restrict,
  "purchase_intent_id" uuid
    references public."money_purchase_intents"("id") on delete restrict,
  "user_id" uuid not null,
  "creator_id" uuid,
  "provider" text not null,
  "provider_product_id" text not null,
  "original_transaction_id" text,
  "event_type" text not null,
  "environment" text not null,
  "reported_amount_minor" integer,
  "reported_currency" text,
  "reason" text not null,
  "disposition" text not null default
    'refund_or_authoritative_provider_reconciliation_required',
  "state" text not null default 'pending_reconciliation',
  "resolution_reference_hash" text,
  "resolved_at" timestamptz,
  "created_at" timestamptz not null default timezone('utc'::text,now()),
  "updated_at" timestamptz not null default timezone('utc'::text,now()),
  constraint "revenuecat_provider_reconciliation_provider_check"
    check ("provider" in (
      'revenuecat_app_store','revenuecat_google_play'
    )),
  constraint "revenuecat_provider_reconciliation_event_check"
    check ("event_type" in (
      'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL',
      'UNCANCELLATION','PRODUCT_CHANGE'
    )),
  constraint "revenuecat_provider_reconciliation_environment_check"
    check ("environment" in ('sandbox','production')),
  constraint "revenuecat_provider_reconciliation_identity_check"
    check (
      length(pg_catalog.btrim("provider_product_id")) between 1 and 512
      and ("original_transaction_id" is null
        or length(pg_catalog.btrim("original_transaction_id")) between 1 and 512)
      and length(pg_catalog.btrim("reason")) between 1 and 160
    ),
  constraint "revenuecat_provider_reconciliation_amount_check"
    check ("reported_amount_minor" is null or "reported_amount_minor">0),
  constraint "revenuecat_provider_reconciliation_currency_check"
    check ("reported_currency" is null or "reported_currency"~'^[a-z]{3}$'),
  constraint "revenuecat_provider_reconciliation_disposition_check"
    check ("disposition"='refund_or_authoritative_provider_reconciliation_required'),
  constraint "revenuecat_provider_reconciliation_state_check"
    check ("state" in (
      'pending_reconciliation','resolved_refund','resolved_authority',
      'resolved_no_charge'
    )),
  constraint "revenuecat_provider_reconciliation_resolution_check"
    check (
      ("state"='pending_reconciliation'
        and "resolution_reference_hash" is null and "resolved_at" is null)
      or
      ("state"<>'pending_reconciliation'
        and "resolution_reference_hash" is not null
        and "resolution_reference_hash"~'^[0-9a-f]{64}$'
        and "resolved_at" is not null)
    )
);

alter table public."revenuecat_provider_reconciliation_obligations"
  enable row level security;
alter table public."revenuecat_provider_reconciliation_obligations"
  force row level security;
revoke all on table public."revenuecat_provider_reconciliation_obligations"
  from public,anon,authenticated,service_role;
grant select on table public."revenuecat_provider_reconciliation_obligations"
  to service_role;
grant update (
  "state","resolution_reference_hash","resolved_at","updated_at"
) on table public."revenuecat_provider_reconciliation_obligations"
  to service_role;

create or replace function public."capture_ignored_revenuecat_charge_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent_id uuid;
  v_creator_id uuid;
begin
  if new."status"<>'ignored'
    or new."idempotency_key" not like 'creator_money:%'
    or new."provider" not in (
      'revenuecat_app_store','revenuecat_google_play'
    )
    or new."event_type" not in (
      'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL',
      'UNCANCELLATION','PRODUCT_CHANGE'
    )
  then
    return new;
  end if;

  if coalesce((new."metadata"->>'provider_reconciliation_required')::boolean,false)
    is not true
    or new."metadata"->>'provider_reconciliation_disposition'
      is distinct from 'refund_or_authoritative_provider_reconciliation_required'
  then
    raise exception 'ignored_active_provider_event_requires_reconciliation';
  end if;

  if coalesce(new."metadata"->>'purchase_intent_id','')
    ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    v_intent_id:=(new."metadata"->>'purchase_intent_id')::uuid;
    select intent."creator_id" into v_creator_id
    from public."money_purchase_intents" intent
    where intent."id"=v_intent_id
      and intent."user_id"=new."user_id";
    if not found then
      v_intent_id:=null;
      v_creator_id:=null;
    end if;
  end if;

  insert into public."revenuecat_provider_reconciliation_obligations" (
    "provider_event_id","purchase_intent_id","user_id","creator_id",
    "provider","provider_product_id","original_transaction_id",
    "event_type","environment","reported_amount_minor",
    "reported_currency","reason"
  ) values (
    new."id",v_intent_id,new."user_id",v_creator_id,new."provider",
    new."metadata"->>'provider_product_id',
    nullif(new."metadata"->>'original_transaction_id',''),
    new."event_type",new."environment",
    case when coalesce(new."metadata"->>'reported_amount_minor','')~'^[1-9][0-9]*$'
      then (new."metadata"->>'reported_amount_minor')::integer else null end,
    case when lower(coalesce(new."metadata"->>'reported_currency',''))~'^[a-z]{3}$'
      then lower(new."metadata"->>'reported_currency') else null end,
    left(coalesce(nullif(new."metadata"->>'final_reason',''),
      'ignored_active_provider_event'),160)
  )
  on conflict ("provider_event_id") do nothing;
  return new;
end;
$$;
revoke all on function public."capture_ignored_revenuecat_charge_internal"()
  from public,anon,authenticated,service_role;

drop trigger if exists "capture_ignored_revenuecat_charge"
  on public."provider_events";
create trigger "capture_ignored_revenuecat_charge"
after insert or update of "status","metadata" on public."provider_events"
for each row
when (new."status"='ignored')
execute function public."capture_ignored_revenuecat_charge_internal"();

-- Preserve obligations if this closure is applied over an environment that
-- already contains finalized ignored active events.
insert into public."revenuecat_provider_reconciliation_obligations" (
  "provider_event_id","purchase_intent_id","user_id","creator_id",
  "provider","provider_product_id","original_transaction_id",
  "event_type","environment","reported_amount_minor","reported_currency",
  "reason"
)
select
  event."id",intent."id",event."user_id",intent."creator_id",
  event."provider",event."metadata"->>'provider_product_id',
  nullif(event."metadata"->>'original_transaction_id',''),
  event."event_type",event."environment",
  case when coalesce(event."metadata"->>'reported_amount_minor','')~'^[1-9][0-9]*$'
    then (event."metadata"->>'reported_amount_minor')::integer else null end,
  case when lower(coalesce(event."metadata"->>'reported_currency',''))~'^[a-z]{3}$'
    then lower(event."metadata"->>'reported_currency') else null end,
  left(coalesce(nullif(event."metadata"->>'final_reason',''),
    'ignored_active_provider_event'),160)
from public."provider_events" event
left join public."money_purchase_intents" intent
  on intent."id"=case
    when coalesce(event."metadata"->>'purchase_intent_id','')
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then (event."metadata"->>'purchase_intent_id')::uuid else null end
 and intent."user_id"=event."user_id"
where event."status"='ignored'
  and event."idempotency_key" like 'creator_money:%'
  and event."provider" in ('revenuecat_app_store','revenuecat_google_play')
  and event."event_type" in (
    'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL',
    'UNCANCELLATION','PRODUCT_CHANGE'
  )
  and event."metadata"->>'provider_reconciliation_disposition'
    ='refund_or_authoritative_provider_reconciliation_required'
on conflict ("provider_event_id") do nothing;

comment on table public."revenuecat_provider_reconciliation_obligations" is
  'Service-only durable obligations for authoritative active Store events that fail closed after a possible charge. Production activation/release must not proceed with pending production rows; resolution requires hashed provider evidence.';
