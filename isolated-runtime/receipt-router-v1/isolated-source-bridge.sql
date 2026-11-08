-- OPTIONAL source bridge. Requires the ACTUAL sandbox core + receipts sources
-- installed earlier in this SAME disabled install transaction. No shared legacy
-- table reads, no new provider processing, and no public/service importer API.
-- Execute both modules' finalizers only AFTER this file and all other bridges.
set local role receipt_router_v1_owner;
grant usage,create on schema receipt_router_v1 to sbx_v1_core_owner;
grant execute on function receipt_router_v1.source_candidate(uuid),receipt_router_v1.arm_source_import_context(),
  receipt_router_v1.commit_original_from_source(uuid,uuid,text,text,uuid,uuid,text,uuid,text,uuid,text) to sbx_v1_core_owner;
reset role;
set local role sbx_v1_core_owner;
create function receipt_router_v1.import_isolated_receipt(p_router_receipt uuid,p_source_receipt uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare f record;r sandbox_commerce_v1.receipts;i sandbox_commerce_v1.intents;
  a sandbox_commerce_v1.dispatch_attempts;e sandbox_commerce_v1.receipt_events;g sandbox_commerce_v1.receipt_ingress;
  original sandbox_commerce_v1.original_states;owner_row sandbox_commerce_v1.transaction_owners;
  route sandbox_commerce_v1.provider_routes;o sandbox_commerce_v1.offers;c sandbox_commerce_v1.catalog;p jsonb;
begin
  -- This private entry point owns the one-shot timer. Its subfunctions do not
  -- re-arm it, and it rejects ambient positive timers rather than extending one.
  perform receipt_router_v1.arm_source_import_context();
  select * into strict f from receipt_router_v1.source_candidate(p_router_receipt);
  if f.environment<>'SANDBOX' or f.provider_event_type not in ('NON_RENEWING_PURCHASE','REFUND','REVOCATION')
  then raise exception 'receipt_router_isolated_lifecycle_unsupported' using errcode='42501'; end if;
  lock table sandbox_commerce_v1.receipts,sandbox_commerce_v1.intents,sandbox_commerce_v1.dispatch_attempts,
    sandbox_commerce_v1.receipt_events,sandbox_commerce_v1.receipt_ingress,sandbox_commerce_v1.original_states,
    sandbox_commerce_v1.transaction_owners,sandbox_commerce_v1.provider_routes,sandbox_commerce_v1.offers,
    sandbox_commerce_v1.catalog in share mode nowait;
  select * into strict r from sandbox_commerce_v1.receipts where id=p_source_receipt;
  select * into strict i from sandbox_commerce_v1.intents where id=r.intent_id;
  select * into strict a from sandbox_commerce_v1.dispatch_attempts where intent_id=i.id;
  select * into strict o from sandbox_commerce_v1.offers where id=i.offer_id;
  select * into strict c from sandbox_commerce_v1.catalog where id=o.catalog_id;
  select * into strict route from sandbox_commerce_v1.provider_routes
    where provider=r.provider and scope_key=r.scope_key and store=r.store;
  select * into strict original from sandbox_commerce_v1.original_states
    where provider=r.provider and scope_key=r.scope_key and store=r.store and original_transaction_id=r.original_transaction_id;
  select * into strict owner_row from sandbox_commerce_v1.transaction_owners
    where provider=r.provider and scope_key=r.scope_key and store=r.store and original_transaction_id=r.original_transaction_id;
  select * into strict e from sandbox_commerce_v1.receipt_events where provider=r.provider and scope_key=r.scope_key
    and event_id=f.provider_event_id and receipt_id=r.id;
  select * into strict g from sandbox_commerce_v1.receipt_ingress where provider=r.provider and scope_key=r.scope_key
    and store=r.store and event_id=f.provider_event_id;
  p:=e.payload;
  if r.provider<>'revenuecat' or r.state not in ('verified','refunded','revoked') or r.expires_at is not null
    or r.original_transaction_id<>f.original_transaction_id or (f.transaction_id is not null and f.transaction_id<>r.transaction_id)
    or (f.product_id is not null and f.product_id<>r.product_id)
    or r.store<>(case f.store when 'APP_STORE' then 'app_store' when 'PLAY_STORE' then 'google_play' end)
    or r.scope_key::jsonb is distinct from jsonb_build_array('revenuecat',f.project_id,f.app_id,f.store,f.environment)
    or i.kind<>'creator_tip' or i.state<>'verified' or i.buyer_id<>f.user_id
    or i.provider<>r.provider or i.scope_key<>r.scope_key or i.store<>r.store or i.product_id<>r.product_id
    or i.dispatch_id is distinct from a.dispatch_id or i.dispatched_at is distinct from a.claimed_at
    or r.purchased_at<a.claimed_at or r.purchased_at>a.accept_purchase_until
    or o.revision<>i.offer_revision or o.resource_id<>i.resource_id or o.resource_revision<>i.resource_revision
    or c.kind<>i.kind or c.provider<>i.provider or c.scope_key<>i.scope_key or c.store<>i.store or c.product_id<>i.product_id
    or c.amount_minor<>i.amount_minor or c.currency<>i.currency
    or route.qualification_state<>'qualified' or route.source_environment<>'SANDBOX'
    or route.semantic_contract<>(case r.store when 'app_store' then 'rc_app_store_tip_v1' when 'google_play' then 'rc_google_play_tip_v1' end)
    or original.state not in ('verified','refunded','revoked') or original.receipt_id is distinct from r.id
    or original.intent_id is distinct from i.id or original.buyer_id<>i.buyer_id or original.product_id is distinct from r.product_id
    or original.transaction_id is distinct from r.transaction_id or original.amount_minor is distinct from i.amount_minor or original.currency is distinct from i.currency
    or owner_row.buyer_id<>i.buyer_id or owner_row.product_id<>r.product_id
    or g.status<>'processed' or g.payload is distinct from p or g.result->>'receiptId' is distinct from r.id::text
    or p->>'rawBodySha256' is distinct from f.raw_sha256 or p->>'providerEventId' is distinct from f.provider_event_id
    or p->>'providerEventType' is distinct from f.provider_event_type or (p->>'providerEventAt')::timestamptz is distinct from f.event_at
    or p->>'provider' is distinct from r.provider or p->>'providerScopeKey' is distinct from r.scope_key
    or p->>'store' is distinct from r.store or p->>'sourceEnvironment' is distinct from 'SANDBOX' or p->>'environment' is distinct from 'sandbox'
    or p->>'buyerId' is distinct from i.buyer_id::text or p->>'originalTransactionId' is distinct from r.original_transaction_id
    or (p->>'productId' is not null and p->>'productId'<>r.product_id)
    or (p->>'providerTransactionId' is not null and p->>'providerTransactionId'<>r.transaction_id)
    or not exists(select 1 from sandbox_commerce_v1.receipt_events anchor where anchor.receipt_id=r.id
      and anchor.provider=r.provider and anchor.scope_key=r.scope_key
      and anchor.payload->>'providerEventType'='NON_RENEWING_PURCHASE' and anchor.payload->>'eventType'='non_renewing_purchase'
      and anchor.payload->>'buyerId'=i.buyer_id::text and anchor.payload->>'originalTransactionId'=r.original_transaction_id
      and anchor.payload->>'providerTransactionId'=r.transaction_id and anchor.payload->>'productId'=r.product_id
      and (anchor.payload->>'purchasedAt')::timestamptz=r.purchased_at
      and (anchor.payload->>'amountMinor')::bigint=i.amount_minor and anchor.payload->>'currency'=i.currency)
  then raise exception 'receipt_router_isolated_source_mismatch' using errcode='42501'; end if;
  -- Today's Premium, active app session, route initiation switch and lifecycle
  -- state do not rewrite historical ownership. This imports no positive right.
  return receipt_router_v1.commit_original_from_source(p_router_receipt,f.scope_id,r.product_id,r.original_transaction_id,
    i.buyer_id,i.id,'isolated_verified_receipt_v1',r.id,f.provider_event_id,a.dispatch_id,r.scope_key);
end; $$;
revoke all on function receipt_router_v1.import_isolated_receipt(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function receipt_router_v1.import_isolated_receipt(uuid,uuid) to receipt_router_v1_owner;
reset role;
set local role receipt_router_v1_owner;
revoke create on schema receipt_router_v1 from sbx_v1_core_owner;
reset role;
