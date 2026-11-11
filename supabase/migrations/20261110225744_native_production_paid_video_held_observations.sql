-- Reachable evidence-only successor of the normal RevenueCat post-canonical RPC.
-- This does NOT admit a native production intent, promote a sandbox allocation,
-- qualify an account/report/source, release earnings, grant access or send funds.
-- Existing channel-subscription observations keep their original implementation.
create table private.native_production_paid_video_observations (
 canonical_receipt_id uuid primary key references public.provider_events(id),
 provider_event_id text not null unique references public.revenuecat_webhook_ingress_events(provider_event_id),
 raw_payload_hash text not null check(raw_payload_hash ~ '^[0-9a-f]{64}$'),
 provider text not null check(provider in ('revenuecat_app_store','revenuecat_google_play')),
 environment text not null default 'production' check(environment='production'),
 event_type text not null,
 configured_project_id text, reported_app_id text, reported_product_id text, canonical_provider_product_id text,
 original_transaction_id text, transaction_id text, buyer_id uuid,
 ingress_qualification_id uuid references private.native_production_ingress_qualifications(id),
 -- These are reported canonical metadata, never authenticated settlement facts.
 reported_gross_minor bigint, reported_currency text,
 observed_at timestamptz not null default clock_timestamp(),
 financial_authority boolean not null default false check(not financial_authority)
);
create index native_production_paid_video_original_chain
 on private.native_production_paid_video_observations(provider,original_transaction_id,buyer_id);

-- A held accounting obligation, NOT an entry in the withdrawable earnings domain.
-- Nullable creator/source preserve unbound and refund-before-purchase evidence.
-- No price-only match, current video lookup or sandbox row may invent a binding.
create table private.native_production_paid_video_ledger_holds (
 observation_id uuid primary key references private.native_production_paid_video_observations(canonical_receipt_id),
 purchase_intent_id uuid references public.money_purchase_intents(id),
 creator_id uuid, source_id uuid, quote_sha256 text check(quote_sha256 ~ '^[0-9a-f]{64}$'),
 source_incarnation uuid check(source_incarnation is null),
 store_account_id text check(store_account_id is null),
 actual_gross_minor bigint check(actual_gross_minor is null),
 actual_store_fee_minor bigint check(actual_store_fee_minor is null),
 actual_fee_tax_minor bigint check(actual_fee_tax_minor is null),
 actual_sales_tax_minor bigint check(actual_sales_tax_minor is null),
 actual_developer_proceeds_minor bigint check(actual_developer_proceeds_minor is null),
 actual_quantity integer check(actual_quantity is null),
 status text not null default 'HELD' check(status='HELD'),
 coverage text not null default 'unknown' check(coverage='unknown'),
 negative_lifecycle boolean not null,
 financial_authority boolean not null default false check(not financial_authority),
 payable boolean not null default false check(not payable),
 created_at timestamptz not null default clock_timestamp(),
 check ((purchase_intent_id is null and creator_id is null and source_id is null and quote_sha256 is null)
   or (purchase_intent_id is not null and creator_id is not null and source_id is not null and quote_sha256 is not null))
);
do $$ declare t text; begin
 foreach t in array array['native_production_paid_video_observations','native_production_paid_video_ledger_holds'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before update or delete on private.%I for each row execute function public.block_revenuecat_webhook_ingress_mutation_internal()',t||'_immutable',t);
 end loop;
end $$;

alter function public.record_native_production_ingress_observation(jsonb)
 rename to record_native_production_ingress_observation_channel_internal;
revoke all on function public.record_native_production_ingress_observation_channel_internal(jsonb)
 from public,anon,authenticated,service_role;

create function public.record_native_production_ingress_observation(p_facts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; receipt public.provider_events;
 existing private.native_production_paid_video_observations;
 i public.money_purchase_intents; q public.creator_money_purchase_quotes;
 qualification private.native_production_ingress_qualifications;
 intent_id uuid; quote_hash text; reported_amount bigint; reported_currency text; negative boolean;
begin
 -- Reuse the existing strict JSON validation, service gate, event advisory lock,
 -- reserved ingress hash and exact canonical receipt tuple checks. Its channel
 -- branch returns unchanged. Unsupported domains remain out of scope.
 result:=public.record_native_production_ingress_observation_channel_internal(p_facts);
 if result->>'status'<>'out_of_scope' then return result; end if;
 select * into strict receipt from public.provider_events where id=(p_facts->>'canonicalReceiptId')::uuid;
 if not exists(select 1 from public.monetization_products where id=receipt.product_id and product_type='paid_content_access') then
  return result;
 end if;
 negative:=receipt.event_type in ('REFUND','REVOCATION','CANCELLATION','EXPIRATION','BILLING_ISSUE','SUBSCRIPTION_PAUSED');
 -- Terminal dispatch binds the historical product and can legitimately receive
 -- an omitted/stale reported product. Preserve both; never suppress its hold.
 if not negative and receipt.metadata->>'provider_product_id' is distinct from p_facts->>'reportedProductId' then
  raise exception 'native_paid_video_canonical_product_mismatch';
 end if;
 select * into existing from private.native_production_paid_video_observations where canonical_receipt_id=receipt.id;
 if existing.canonical_receipt_id is not null then
  -- Preserve FIRST project configuration/qualification and original held binding.
  -- A retry after mutable metadata/configuration changes never upgrades evidence.
  if row(existing.provider_event_id,existing.raw_payload_hash,existing.provider,existing.event_type,
    existing.reported_app_id,existing.reported_product_id,existing.original_transaction_id,existing.transaction_id,existing.buyer_id)
   is distinct from row(p_facts->>'providerEventId',p_facts->>'rawPayloadHash',p_facts->>'provider',p_facts->>'eventType',
    p_facts->>'reportedAppId',p_facts->>'reportedProductId',p_facts->>'originalTransactionId',p_facts->>'transactionId',(p_facts->>'userId')::uuid)
  then raise exception 'native_paid_video_observation_identity_conflict'; end if;
  return jsonb_build_object('status','duplicate','financialAuthority',false);
 end if;
 select * into qualification from private.native_production_ingress_qualifications
 where project_id=p_facts->>'configuredProjectId' and app_id=p_facts->>'reportedAppId'
  and provider=receipt.provider and provider_product_id=receipt.metadata->>'provider_product_id'
 order by verified_at desc,id desc limit 1;
 if qualification.verified_at>clock_timestamp() or qualification.expires_at<=clock_timestamp()
   or exists(select 1 from private.native_production_ingress_revocations where qualification_id=qualification.id)
 then qualification.id:=null; end if;

 -- Metadata numbers may already have been normalized by legacy processing.
 -- Retain them only as REPORTED, never use them in actual creator arithmetic.
 if jsonb_typeof(receipt.metadata->'reported_amount_minor')='number'
  and receipt.metadata->>'reported_amount_minor' ~ '^(0|[1-9][0-9]{0,17})$' then
  reported_amount:=(receipt.metadata->>'reported_amount_minor')::bigint;
 end if;
 if receipt.metadata->>'reported_currency' ~ '^[a-z]{3}$' then
  reported_currency:=receipt.metadata->>'reported_currency';
 end if;
 if receipt.metadata->>'purchase_intent_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
  select * into i from public.money_purchase_intents where id=(receipt.metadata->>'purchase_intent_id')::uuid;
  select * into q from public.creator_money_purchase_quotes where purchase_intent_id=i.id;
  if i.id is not null and i.environment='production' and i.source_type='paid_content'
   and i.product_type='paid_content_access' and i.provider=receipt.provider and i.user_id=receipt.user_id
   and i.product_id=receipt.product_id and i.provider_product_id=receipt.metadata->>'provider_product_id'
   and row(q.user_id,q.creator_id,q.source_type,q.source_id,q.amount_minor,q.currency,q.provider,q.provider_product_id,q.environment,q.created_at,q.expires_at)
    is not distinct from row(i.user_id,i.creator_id,i.source_type,i.source_id,i.amount_minor,i.currency,i.provider,i.provider_product_id,i.environment,i.created_at,i.expires_at)
   and q.purchase_intent_id=i.id then
   intent_id:=i.id;
   quote_hash:=encode(extensions.digest(convert_to(to_jsonb(q)::text,'UTF8'),'sha256'),'hex');
  end if;
 end if;
 insert into private.native_production_paid_video_observations(canonical_receipt_id,provider_event_id,raw_payload_hash,
  provider,event_type,configured_project_id,reported_app_id,reported_product_id,canonical_provider_product_id,original_transaction_id,transaction_id,buyer_id,
  ingress_qualification_id,reported_gross_minor,reported_currency)
 values(receipt.id,receipt.provider_event_id,receipt.raw_payload_hash,receipt.provider,receipt.event_type,
  p_facts->>'configuredProjectId',p_facts->>'reportedAppId',p_facts->>'reportedProductId',receipt.metadata->>'provider_product_id',p_facts->>'originalTransactionId',
  p_facts->>'transactionId',receipt.user_id,qualification.id,reported_amount,reported_currency);
 insert into private.native_production_paid_video_ledger_holds(observation_id,purchase_intent_id,creator_id,source_id,quote_sha256,negative_lifecycle)
 values(receipt.id,intent_id,case when intent_id is not null then i.creator_id end,
  case when intent_id is not null then i.source_id end,quote_hash,
  negative or exists(select 1 from public.revenuecat_unbound_terminal_authority terminal
   where terminal.provider=receipt.provider and terminal.original_transaction_id=p_facts->>'originalTransactionId'
    and terminal.user_id=receipt.user_id and terminal.environment='production'));
 return jsonb_build_object('status','recorded','financialAuthority',false);
end $$;
revoke all on function public.record_native_production_ingress_observation(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_native_production_ingress_observation(jsonb) to service_role;

-- Bounded current review of a known canonical receipt. No raw identifiers or
-- provider payloads leave this RPC. This cannot issue qualifications or release.
create function public.get_native_production_paid_video_hold(p_canonical_receipt_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o private.native_production_paid_video_observations; h private.native_production_paid_video_ledger_holds;
 negative boolean; source_changed boolean; qualification_current boolean;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into o from private.native_production_paid_video_observations where canonical_receipt_id=p_canonical_receipt_id;
 if o.canonical_receipt_id is null then raise exception 'native_paid_video_observation_missing'; end if;
 select * into strict h from private.native_production_paid_video_ledger_holds where observation_id=o.canonical_receipt_id;
 -- Project/app changes must not erase historical negative evidence. A same
 -- provider/original/buyer negative is conservatively a hold, never attribution.
 select exists(select 1 from private.native_production_paid_video_observations n
  join private.native_production_paid_video_ledger_holds nh on nh.observation_id=n.canonical_receipt_id
  where n.provider=o.provider and n.original_transaction_id=o.original_transaction_id and n.buyer_id=o.buyer_id
   and nh.negative_lifecycle)
  or exists(select 1 from public.revenuecat_unbound_terminal_authority terminal
   where terminal.provider=o.provider and terminal.original_transaction_id=o.original_transaction_id
    and terminal.user_id=o.buyer_id and terminal.environment='production') into negative;
 select h.purchase_intent_id is not null and not exists(select 1 from public.videos
   where id=h.source_id and owner_id=h.creator_id) into source_changed;
 select exists(select 1 from private.native_production_ingress_qualifications q
  where q.id=o.ingress_qualification_id and q.verified_at<=statement_timestamp() and q.expires_at>statement_timestamp()
   and not exists(select 1 from private.native_production_ingress_revocations r where r.qualification_id=q.id)
   and q.id=(select latest.id from private.native_production_ingress_qualifications latest
    where latest.project_id=o.configured_project_id and latest.app_id=o.reported_app_id
     and latest.provider=o.provider and latest.provider_product_id=o.canonical_provider_product_id
    order by latest.verified_at desc,latest.id desc limit 1)) into qualification_current;
 return jsonb_build_object('protocol','native-production-paid-video-hold-v1','status','HELD',
  'canonicalQuoteBound',h.purchase_intent_id is not null,'sourceChanged',source_changed,
  'ingressQualificationCurrent',qualification_current,'negativeLifecycleHold',negative or h.negative_lifecycle,
  'transactionIdentityComplete',o.transaction_id is not null and o.original_transaction_id is not null and o.buyer_id is not null,
  'actualGrossMinor',null,'actualStoreFeeMinor',null,'actualFeeTaxMinor',null,'actualSalesTaxMinor',null,
  'actualDeveloperProceedsMinor',null,'actualQuantity',null,'creatorCandidateMinor',null,
  'holdReasons',jsonb_build_array('production_admission_unqualified','source_incarnation_unqualified',
   'store_account_unqualified','actual_economic_coverage_unknown','production_ledger_adapter_unqualified'),
  'dispatchAllowed',false,'settlementAllowed',false,'financialAuthority',false,'payable',false);
end $$;
revoke all on function public.get_native_production_paid_video_hold(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_native_production_paid_video_hold(uuid) to service_role;
