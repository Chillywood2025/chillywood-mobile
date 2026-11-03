-- Evidence-only prerequisite. No native production intent admission, product,
-- provider credential, qualification or money switch is created or enabled.
-- RevenueCat app_id is a dashboard app identifier, NOT a project/account proof.
create table private.native_production_ingress_qualifications (
 id uuid primary key default gen_random_uuid(),
 project_id text not null check(length(btrim(project_id)) between 1 and 128),
 app_id text not null check(length(btrim(app_id)) between 1 and 128),
 provider text not null check(provider in ('revenuecat_app_store','revenuecat_google_play')),
 provider_product_id text not null check(length(btrim(provider_product_id)) between 1 and 512),
 evidence_reference text not null check(length(btrim(evidence_reference)) between 1 and 500),
 verified_at timestamptz not null, expires_at timestamptz not null check(expires_at>verified_at)
);
create table private.native_production_ingress_revocations (
 qualification_id uuid primary key references private.native_production_ingress_qualifications(id),
 revoked_at timestamptz not null default clock_timestamp()
);
create table private.native_production_ingress_observations (
 provider_event_id text primary key references public.revenuecat_webhook_ingress_events(provider_event_id),
 canonical_receipt_id uuid not null references public.provider_events(id),
 raw_payload_hash text not null check(raw_payload_hash ~ '^[0-9a-f]{64}$'),
 provider text not null check(provider in ('revenuecat_app_store','revenuecat_google_play')),
 environment text not null check(environment='production'),
 event_type text not null,
 reported_app_id text,
 configured_project_id text,
 reported_product_id text,
 original_transaction_id text,
 transaction_id text,
 user_id uuid,
 qualification_id uuid references private.native_production_ingress_qualifications(id),
 observed_at timestamptz not null default clock_timestamp(),
 financial_authority boolean not null default false check(not financial_authority)
);
do $$ declare t text; begin
 foreach t in array array['native_production_ingress_qualifications','native_production_ingress_revocations','native_production_ingress_observations'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before update or delete on private.%I for each row execute function public.block_revenuecat_webhook_ingress_mutation_internal()',t||'_immutable',t);
 end loop;
end $$;

-- Called after authenticated webhook processing identifies the channel domain.
-- No API role may provision qualifications. Observations are not authority:
-- original/cycle IDs are retained, not substituted for canonical receipt proof.
create function public.record_native_production_ingress_observation(p_facts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing private.native_production_ingress_observations;
 q private.native_production_ingress_qualifications; receipt public.provider_events; event_id text; raw_hash text;
 field text; current_value text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if jsonb_typeof(p_facts) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_facts) k
  where k not in ('providerEventId','canonicalReceiptId','rawPayloadHash','provider','environment','eventType','reportedAppId',
   'configuredProjectId','reportedProductId','originalTransactionId','transactionId','userId'))
 then raise exception 'native_ingress_observation_invalid'; end if;
 foreach field in array array['providerEventId','canonicalReceiptId','rawPayloadHash','provider','environment','eventType'] loop
  if jsonb_typeof(p_facts->field) is distinct from 'string' or nullif(p_facts->>field,'') is null
  then raise exception 'native_ingress_observation_invalid'; end if;
 end loop;
 foreach field in array array['providerEventId','canonicalReceiptId','rawPayloadHash','provider','environment','eventType',
   'reportedAppId','configuredProjectId','reportedProductId','originalTransactionId','transactionId','userId'] loop
  if p_facts ? field and jsonb_typeof(p_facts->field) not in ('string','null')
  then raise exception 'native_ingress_observation_invalid'; end if;
  current_value:=p_facts->>field;
  if current_value is not null and (length(current_value) not between 1 and 512
    or current_value<>btrim(current_value) or current_value ~ '[[:cntrl:]]')
  then raise exception 'native_ingress_observation_invalid'; end if;
 end loop;
 if p_facts->>'provider' not in ('revenuecat_app_store','revenuecat_google_play')
  or p_facts->>'environment'<>'production' or p_facts->>'rawPayloadHash' !~ '^[0-9a-f]{64}$'
  or p_facts->>'canonicalReceiptId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or (p_facts->>'userId' is not null and p_facts->>'userId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
 then raise exception 'native_ingress_observation_invalid'; end if;
 event_id:=p_facts->>'providerEventId';raw_hash:=p_facts->>'rawPayloadHash';
 perform pg_advisory_xact_lock(hashtextextended('native-production-ingress:'||event_id,0));
 if not exists(select 1 from public.revenuecat_webhook_ingress_events
  where provider_event_id=event_id and raw_payload_hash=raw_hash)
 then raise exception 'native_ingress_authenticated_receipt_required'; end if;
 select * into receipt from public.provider_events where id=(p_facts->>'canonicalReceiptId')::uuid;
 if receipt.id is null or row(receipt.provider_event_id,receipt.raw_payload_hash,receipt.provider,receipt.environment,
    receipt.event_type,receipt.user_id,receipt.metadata->>'original_transaction_id') is distinct from
   row(event_id,raw_hash,p_facts->>'provider','production',p_facts->>'eventType',(p_facts->>'userId')::uuid,p_facts->>'originalTransactionId')
 then raise exception 'native_ingress_canonical_receipt_required'; end if;
 -- Resolve scope from the persisted canonical receipt, including duplicate
 -- terminal responses that intentionally omit productType. Never trust a body
 -- feature label or reinterpret an unrelated Premium/creator receipt.
 if not exists(select 1 from public.monetization_products where id=receipt.product_id and product_type='channel_subscription') then
  return jsonb_build_object('status','out_of_scope','financialAuthority',false);
 end if;
 select * into existing from private.native_production_ingress_observations where provider_event_id=event_id;
 if existing.provider_event_id is not null then
  -- Exact retry keeps FIRST configuration/qualification observation. It never
  -- upgrades old evidence after a new project setting or qualification arrives.
  if row(existing.canonical_receipt_id,existing.raw_payload_hash,existing.provider,existing.environment,existing.event_type,
      existing.reported_app_id,existing.reported_product_id,existing.original_transaction_id,existing.transaction_id,existing.user_id)
   is distinct from row(receipt.id,raw_hash,p_facts->>'provider',p_facts->>'environment',p_facts->>'eventType',
      p_facts->>'reportedAppId',p_facts->>'reportedProductId',p_facts->>'originalTransactionId',p_facts->>'transactionId',(p_facts->>'userId')::uuid)
  then raise exception 'native_ingress_observation_identity_conflict'; end if;
  return jsonb_build_object('status','duplicate','financialAuthority',false);
 end if;
 -- Newest exact scope wins even when expired/revoked: never fall back.
 select * into q from private.native_production_ingress_qualifications
 where project_id=p_facts->>'configuredProjectId' and app_id=p_facts->>'reportedAppId'
  and provider=p_facts->>'provider' and provider_product_id=p_facts->>'reportedProductId'
 order by verified_at desc,id desc limit 1;
 if q.verified_at>clock_timestamp() or q.expires_at<=clock_timestamp()
  or exists(select 1 from private.native_production_ingress_revocations where qualification_id=q.id)
 then q.id:=null; end if;
 insert into private.native_production_ingress_observations(provider_event_id,canonical_receipt_id,raw_payload_hash,provider,environment,
  event_type,reported_app_id,configured_project_id,reported_product_id,original_transaction_id,transaction_id,user_id,qualification_id)
 values(event_id,receipt.id,raw_hash,p_facts->>'provider','production',p_facts->>'eventType',p_facts->>'reportedAppId',
  p_facts->>'configuredProjectId',p_facts->>'reportedProductId',p_facts->>'originalTransactionId',p_facts->>'transactionId',
  (p_facts->>'userId')::uuid,q.id);
 return jsonb_build_object('status','recorded','financialAuthority',false);
end $$;
revoke all on function public.record_native_production_ingress_observation(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_native_production_ingress_observation(jsonb) to service_role;

-- Positive production recheck at final persisted SDK claim. No new rail opens.
create function private.assert_creator_native_dispatch_environment(p_environment text)
returns void language plpgsql set search_path='' as $$
declare s text;
begin
 if p_environment is null or p_environment not in ('sandbox','production') then
  raise exception 'creator_money_checkout_rail_unavailable'; end if;
 select state into s from public.platform_money_kill_switches where key='live_money_enabled' for share;
 if s is distinct from (case p_environment when 'production' then 'on' else 'off' end) then
  raise exception 'creator_money_checkout_rail_unavailable'; end if;
end $$;
revoke all on function private.assert_creator_native_dispatch_environment(text) from public,anon,authenticated,service_role;
do $patch$ declare definition text; needle text; begin
 definition:=pg_get_functiondef('public.begin_creator_money_checkout(uuid,uuid)'::regprocedure);
 needle:='  update public.money_purchase_intents set checkout_attempt_id=p_checkout_attempt_id,';
 if position(needle in definition)=0 then raise exception 'native_checkout_dispatch_anchor_missing'; end if;
 execute replace(definition,needle,'  perform private.assert_creator_native_dispatch_environment(i.environment);'||E'\n'||needle);
end $patch$;
