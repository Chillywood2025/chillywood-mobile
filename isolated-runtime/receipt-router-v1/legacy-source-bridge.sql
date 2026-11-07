-- Inactive source only. Install after ownership.sql, before finalizer, in the
-- SAME transaction. No existing helper, provider writer, policy or token path
-- is replaced. This imports lineage evidence; it never grants/clears access.
create role receipt_router_legacy_v1_owner nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant receipt_router_legacy_v1_owner to postgres with inherit true,set true;
create schema receipt_router_legacy_v1 authorization receipt_router_legacy_v1_owner;
grant usage,create on schema receipt_router_legacy_v1 to postgres;
revoke all on schema receipt_router_legacy_v1 from public,anon,authenticated,service_role;
grant usage on schema receipt_router_v1 to receipt_router_legacy_v1_owner;
grant select on receipt_router_v1.configuration,receipt_router_v1.receipts,receipt_router_v1.events,
  receipt_router_v1.conflicts,receipt_router_v1.scopes,receipt_router_v1.catalog,
  receipt_router_v1.originals,receipt_router_v1.original_admissions to receipt_router_legacy_v1_owner;
grant references on receipt_router_v1.original_admissions,receipt_router_v1.receipts to receipt_router_legacy_v1_owner;
set local role receipt_router_v1_owner;
create policy legacy_bridge_read on receipt_router_v1.configuration for select to receipt_router_legacy_v1_owner using(true);
create policy legacy_bridge_read on receipt_router_v1.receipts for select to receipt_router_legacy_v1_owner using(true);
create policy legacy_bridge_read on receipt_router_v1.events for select to receipt_router_legacy_v1_owner using(true);
create policy legacy_bridge_read on receipt_router_v1.conflicts for select to receipt_router_legacy_v1_owner using(true);
create policy legacy_bridge_read on receipt_router_v1.scopes for select to receipt_router_legacy_v1_owner using(true);
create policy legacy_bridge_read on receipt_router_v1.catalog for select to receipt_router_legacy_v1_owner using(true);
create policy legacy_bridge_read on receipt_router_v1.originals for select to receipt_router_legacy_v1_owner using(true);
create policy legacy_bridge_read on receipt_router_v1.original_admissions for select to receipt_router_legacy_v1_owner using(true);
grant execute on function receipt_router_v1.commit_original_from_source(uuid,uuid,text,text,uuid,uuid,text,uuid,text,uuid,text),
  receipt_router_v1.read_hold(text,text,text,text,uuid,text,bigint,text),receipt_router_v1.exact_text(text),receipt_router_v1.immutable()
  to receipt_router_legacy_v1_owner;
-- The router owner takes row locks, so the bridge needs no UPDATE privilege on
-- router configuration/evidence merely to perform SELECT FOR SHARE.
create function receipt_router_v1.legacy_bridge_context(p_receipt uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r receipt_router_v1.receipts;s receipt_router_v1.scopes;c receipt_router_v1.catalog;o jsonb;
begin
  if current_setting('transaction_isolation')<>'read committed' or current_setting('transaction_timeout')='0'
    or current_setting('transaction_timeout')::interval>interval '5 seconds'
    or clock_timestamp()>=transaction_timestamp()+interval '5 seconds'
  then raise exception 'legacy_bridge_context_invalid' using errcode='42501'; end if;
  perform 1 from receipt_router_v1.configuration where ownership_coverage='complete' for share nowait;
  if not found then return null; end if;
  select * into r from receipt_router_v1.receipts where id=p_receipt for share nowait;
  if not found then return null; end if;
  o:=r.envelope->'observation';
  select * into s from receipt_router_v1.scopes where project_id=r.project_id and app_id=o->>'appId'
    and store=o->>'store' and environment=o->>'environment' for share nowait;
  if not found then return null; end if;
  select * into c from receipt_router_v1.catalog where scope_id=s.id and product_id=o->>'productId' for share nowait;
  if not found then return null; end if;
  return jsonb_build_object('receipt',to_jsonb(r),'scope',to_jsonb(s),'catalog',to_jsonb(c));
end; $$;
revoke all on function receipt_router_v1.legacy_bridge_context(uuid) from public,anon,authenticated,service_role;
grant execute on function receipt_router_v1.legacy_bridge_context(uuid) to receipt_router_legacy_v1_owner;
reset role;

-- Closed reader of a FINITE static legacy graph. Caller supplies only a row ID,
-- never an assertion of ownership or tenant scope. It is postgres-owned because
-- the existing legacy tables use FORCE RLS and expose no router-owner policy.
-- Target ownership/ACL/availability qualification is independently outstanding.
-- Create under the fresh role and close its default PUBLIC ACL BEFORE transfer,
-- avoiding any pre-existing postgres default-privilege grants to other roles.
set local role receipt_router_legacy_v1_owner;
create function receipt_router_legacy_v1.read_source(p_event uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare e public.provider_events;g public.access_grants;i public.money_purchase_intents;
  a public.revenuecat_premium_transaction_authority;l public.revenuecat_consumable_transaction_intents;
  ingress public.revenuecat_webhook_ingress_events;product_type text;domain text;original text;sku text;
begin
  if p_event is null or current_setting('transaction_isolation')<>'read committed'
    or current_setting('transaction_timeout')='0' or current_setting('transaction_timeout')::interval>interval '5 seconds'
    or clock_timestamp()>=transaction_timestamp()+interval '5 seconds'
  then raise exception 'legacy_source_context_invalid' using errcode='42501'; end if;
  select * into e from public.provider_events where id=p_event for share nowait;
  if not found or e.provider is null or e.provider not in ('revenuecat_app_store','revenuecat_google_play')
    or e.environment is null or e.environment not in ('sandbox','production') or e.user_id is null
    or e.event_type is null or e.event_type not in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE')
    or e.status is null or e.status not in ('processed','refunded','reversed')
    or e.raw_payload_hash is null or e.raw_payload_hash!~'^[a-f0-9]{64}$'
  then return null; end if;
  select * into ingress from public.revenuecat_webhook_ingress_events where provider_event_id=e.provider_event_id for share nowait;
  if not found or ingress.raw_payload_hash is distinct from e.raw_payload_hash then return null; end if;
  select p.product_type into product_type from public.monetization_products p where p.id=e.product_id for share nowait;
  if not found or product_type is null then return null; end if;
  original:=e.metadata->>'original_transaction_id';sku:=e.metadata->>'provider_product_id';
  if original is null or original='' or original<>btrim(original) or length(original)>512 or original~'[[:cntrl:]]'
    or sku is null or sku='' or sku<>btrim(sku) or length(sku)>512 or sku~'[[:cntrl:]]' then return null; end if;
  if product_type='premium_subscription' then
    domain:='legacy_premium';
    select * into a from public.revenuecat_premium_transaction_authority where provider=e.provider
      and original_transaction_id=original for share nowait;
    -- First-event identity is retained independently of current expiry/refund.
    -- A transferred/rebound owner or snapshot-only fabricated purchase cannot
    -- enter through this initial-receipt bridge.
    if not found or e.event_type<>'INITIAL_PURCHASE' or a.user_id is distinct from e.user_id
      or a.environment is distinct from e.environment or a.first_event_id is distinct from e.provider_event_id
      or a.first_event_hash is distinct from e.raw_payload_hash
      or e.metadata->>'premium_transaction_binding_id' is distinct from a.id::text
      or e.metadata->>'entitlement_key' is distinct from 'premium'
    then return null; end if;
  else
    domain:='legacy_creator';
    if product_type not in ('paid_content_access','watch_party_live_ticket','live_watch_party_access_pass',
      'live_watch_party_seat_pass','creator_tip','event_pass','vip_pass','channel_subscription')
      or coalesce(e.metadata->>'purchase_intent_id','')!~'^[0-9a-f-]{36}$'
      or coalesce(e.metadata->>'access_grant_id','')!~'^[0-9a-f-]{36}$'
    then return null; end if;
    select * into i from public.money_purchase_intents where id=(e.metadata->>'purchase_intent_id')::uuid for share nowait;
    if not found or i.user_id is distinct from e.user_id or i.product_id is distinct from e.product_id
      or i.product_key is distinct from e.product_key or i.product_type is distinct from product_type
      or i.provider is distinct from e.provider or i.environment is distinct from e.environment
      or i.provider_product_id is distinct from sku or i.consumed_at is null
      or i.status is null or i.status not in ('consumed','revoked')
    then return null; end if;
    select * into l from public.revenuecat_consumable_transaction_intents where provider=e.provider
      and original_transaction_id=original and binding_state='exact' for share nowait;
    if not found or l.user_id is distinct from e.user_id or l.product_id is distinct from e.product_id
      or l.purchase_intent_id is distinct from i.id or l.provider_event_id is distinct from e.id
    then return null; end if;
    select * into g from public.access_grants where id=(e.metadata->>'access_grant_id')::uuid for share nowait;
    if not found or g.user_id is distinct from e.user_id or g.product_id is distinct from e.product_id
      or g.provider is distinct from e.provider or g.environment is distinct from e.environment
      or g.provider_event_id is distinct from e.id or g.source_type is distinct from 'provider_event'
      or g.source_id is distinct from i.source_id
      or g.grant_type is distinct from (case when product_type='creator_tip' then 'creator_tip_record' else product_type end)
      or g.metadata->>'purchase_intent_id' is distinct from i.id::text
      or g.metadata->>'original_transaction_id' is distinct from original
      or g.metadata->>'provider_product_id' is distinct from sku
      or g.metadata->>'product_key' is distinct from e.product_key
    then return null; end if;
  end if;
  return jsonb_build_object('domain',domain,'provider',e.provider,'environment',e.environment,'subject',e.user_id,
    'original',original,'sku',sku,'productId',e.product_id,'sourceEventId',e.provider_event_id,'sourceRawHash',e.raw_payload_hash,
    'sourceEventType',e.event_type,'sourceIntentId',i.id,'sourceGrantId',g.id,'premiumAuthorityId',a.id);
exception when invalid_text_representation then return null;
end; $$;
revoke all on function receipt_router_legacy_v1.read_source(uuid) from public,anon,authenticated,service_role;
reset role;
alter function receipt_router_legacy_v1.read_source(uuid) owner to postgres;
grant execute on function receipt_router_legacy_v1.read_source(uuid) to receipt_router_legacy_v1_owner;

set local role receipt_router_legacy_v1_owner;
create table receipt_router_legacy_v1.source_bindings (
  store_app_identity text not null,store text not null,environment text not null,original_transaction_id text not null,
  router_receipt_id uuid not null,source_event_id uuid not null,provider text not null,subject_id uuid not null,
  owner_domain text not null check(owner_domain in ('legacy_premium','legacy_creator')),owner_generation bigint not null,
  source_raw_hash text not null,source_product_id uuid not null,source_intent_id uuid,source_grant_id uuid,premium_authority_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  primary key(store_app_identity,store,environment,original_transaction_id),
  unique(provider,subject_id,environment,original_transaction_id),
  foreign key(store_app_identity,store,environment,original_transaction_id)
    references receipt_router_v1.original_admissions(store_app_identity,store,environment,original_transaction_id),
  foreign key(router_receipt_id) references receipt_router_v1.receipts(id),
  check((owner_domain='legacy_premium' and premium_authority_id is not null and source_intent_id is null and source_grant_id is null)
    or (owner_domain='legacy_creator' and premium_authority_id is null and source_intent_id is not null and source_grant_id is not null))
);
alter table receipt_router_legacy_v1.source_bindings enable row level security;
alter table receipt_router_legacy_v1.source_bindings force row level security;
create policy bridge_owner on receipt_router_legacy_v1.source_bindings for all to receipt_router_legacy_v1_owner using(true) with check(true);
create trigger immutable before update or delete on receipt_router_legacy_v1.source_bindings
  for each row execute function receipt_router_v1.immutable();
revoke all on receipt_router_legacy_v1.source_bindings from public,anon,authenticated,service_role;

create function receipt_router_legacy_v1.import_authenticated_replay(p_router_receipt uuid,p_source_event uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r receipt_router_v1.receipts;s receipt_router_v1.scopes;c receipt_router_v1.catalog;o jsonb;source jsonb;
  result jsonb;b receipt_router_legacy_v1.source_bindings;kind text;expected_store text;expected_environment text;context jsonb;
begin
  if p_router_receipt is null or p_source_event is null or current_setting('transaction_isolation')<>'read committed'
    or current_setting('transaction_timeout')='0' or current_setting('transaction_timeout')::interval>interval '5 seconds'
    or clock_timestamp()>=transaction_timestamp()+interval '5 seconds'
  then raise exception 'legacy_bridge_context_invalid' using errcode='42501'; end if;
  context:=receipt_router_v1.legacy_bridge_context(p_router_receipt);
  if context is null then return jsonb_build_object('status','unavailable','reason','router_scope_unqualified','authorityGranted',false); end if;
  select * into r from jsonb_populate_record(null::receipt_router_v1.receipts,context->'receipt');
  select * into s from jsonb_populate_record(null::receipt_router_v1.scopes,context->'scope');
  select * into c from jsonb_populate_record(null::receipt_router_v1.catalog,context->'catalog');
  source:=receipt_router_legacy_v1.read_source(p_source_event);
  if source is null then return jsonb_build_object('status','unavailable','reason','legacy_source_graph_unqualified','authorityGranted',false); end if;
  o:=r.envelope->'observation';expected_store:=case source->>'provider' when 'revenuecat_app_store' then 'APP_STORE' when 'revenuecat_google_play' then 'PLAY_STORE' end;
  expected_environment:=case source->>'environment' when 'sandbox' then 'SANDBOX' when 'production' then 'PRODUCTION' end;
  if o->>'parseStatus' is distinct from 'valid' or o->>'eventId' is distinct from source->>'sourceEventId'
    or o->>'eventType' is distinct from source->>'sourceEventType' or r.raw_sha256 is distinct from source->>'sourceRawHash'
    or o->>'userId' is distinct from source->>'subject' or o->>'store' is distinct from expected_store
    or o->>'environment' is distinct from expected_environment or o->>'originalTransactionId' is distinct from source->>'original'
    or o->>'productId' is distinct from source->>'sku'
  then return jsonb_build_object('status','unavailable','reason','authenticated_replay_mismatch','authorityGranted',false); end if;
  if c.owner_domain is distinct from source->>'domain'
  then return jsonb_build_object('status','unavailable','reason','catalog_domain_unqualified','authorityGranted',false); end if;
  kind:=case c.owner_domain when 'legacy_premium' then 'legacy_premium_authenticated_replay_v1'
    when 'legacy_creator' then 'legacy_creator_authenticated_replay_v1' end;
  result:=receipt_router_v1.commit_original_from_source(r.id,s.id,source->>'sku',source->>'original',(source->>'subject')::uuid,
    (source->>'sourceIntentId')::uuid,kind,p_source_event,source->>'sourceEventId',null,s.id::text);
  select * into b from receipt_router_legacy_v1.source_bindings where store_app_identity=s.store_app_identity and store=s.store
    and environment=s.environment and original_transaction_id=source->>'original';
  if found then
    if b.source_event_id is distinct from p_source_event or b.source_raw_hash is distinct from r.raw_sha256
      or b.subject_id::text is distinct from source->>'subject' or b.owner_domain is distinct from c.owner_domain
      or b.owner_generation is distinct from c.owner_generation or b.source_product_id::text is distinct from source->>'productId'
      or b.source_intent_id::text is distinct from source->>'sourceIntentId' or b.source_grant_id::text is distinct from source->>'sourceGrantId'
      or b.premium_authority_id::text is distinct from source->>'premiumAuthorityId'
    then raise exception 'legacy_source_binding_conflict' using errcode='42501'; end if;
  else
    insert into receipt_router_legacy_v1.source_bindings values(s.store_app_identity,s.store,s.environment,source->>'original',r.id,p_source_event,
      source->>'provider',(source->>'subject')::uuid,c.owner_domain,c.owner_generation,r.raw_sha256,(source->>'productId')::uuid,
      (source->>'sourceIntentId')::uuid,(source->>'sourceGrantId')::uuid,(source->>'premiumAuthorityId')::uuid,clock_timestamp());
  end if;
  return result;
end; $$;

-- Source-mapped negative veto for future reviewed consumers. No absent mapping
-- can become "clear", and no caller can supply project/app/generation guesses.
create function receipt_router_legacy_v1.original_veto(p_domain text,p_provider text,p_environment text,p_subject uuid,p_original text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare b receipt_router_legacy_v1.source_bindings;s receipt_router_v1.scopes;o receipt_router_v1.originals;a receipt_router_v1.original_admissions;
begin
  if p_domain is null or p_domain not in ('legacy_premium','legacy_creator') or p_provider is null
    or p_provider not in ('revenuecat_app_store','revenuecat_google_play') or p_environment is null
    or p_environment not in ('sandbox','production') or p_subject is null or not receipt_router_v1.exact_text(p_original)
  then raise exception 'legacy_veto_exact_subject_required' using errcode='22023'; end if;
  if current_setting('transaction_isolation')<>'read committed' or current_setting('transaction_timeout')='0'
    or current_setting('transaction_timeout')::interval>interval '5 seconds'
    or clock_timestamp()>=transaction_timestamp()+interval '5 seconds'
  then raise exception 'legacy_bridge_context_invalid' using errcode='42501'; end if;
  select * into b from receipt_router_legacy_v1.source_bindings where provider=p_provider and subject_id=p_subject
    and environment=upper(p_environment) and original_transaction_id=p_original and owner_domain=p_domain for share nowait;
  if not found then return jsonb_build_object('protocol','rc-router-hold-v1','state','unavailable','reason','legacy_source_mapping_missing','authorityGranted',false); end if;
  select * into o from receipt_router_v1.originals where store_app_identity=b.store_app_identity and store=b.store
    and environment=b.environment and original_transaction_id=b.original_transaction_id;
  select * into a from receipt_router_v1.original_admissions where store_app_identity=b.store_app_identity and store=b.store
    and environment=b.environment and original_transaction_id=b.original_transaction_id;
  if o.original_buyer_id is distinct from b.subject_id or o.owner_domain is distinct from b.owner_domain
    or o.owner_generation is distinct from b.owner_generation or a.source_receipt_id is distinct from b.source_event_id
    or a.router_receipt_id is distinct from b.router_receipt_id
    or a.admission_kind is distinct from (case p_domain when 'legacy_premium' then 'legacy_premium_authenticated_replay_v1'
      when 'legacy_creator' then 'legacy_creator_authenticated_replay_v1' end)
  then return jsonb_build_object('protocol','rc-router-hold-v1','state','unavailable','reason','legacy_source_mapping_invalid','authorityGranted',false); end if;
  select * into s from receipt_router_v1.scopes where id=o.scope_id;
  return receipt_router_v1.read_hold(s.project_id,s.app_id,s.store,s.environment,p_subject,b.owner_domain,b.owner_generation,p_original);
end; $$;
create function receipt_router_legacy_v1.assert_original_clear(p_domain text,p_provider text,p_environment text,p_subject uuid,p_original text)
returns void language plpgsql volatile security definer set search_path='' as $$
declare decision jsonb;
begin
  decision:=receipt_router_legacy_v1.original_veto(p_domain,p_provider,p_environment,p_subject,p_original);
  if decision->>'protocol' is distinct from 'rc-router-hold-v1' or decision->>'state' is distinct from 'clear'
    or decision->'authorityGranted' is distinct from 'false'::jsonb
  then raise exception 'legacy_original_router_veto' using errcode='42501'; end if;
end; $$;
revoke all on all functions in schema receipt_router_legacy_v1 from public,anon,authenticated,service_role;
revoke create on schema receipt_router_legacy_v1 from postgres;
reset role;
grant receipt_router_legacy_v1_owner to postgres with inherit false,set false;
-- No runtime/public entry point receives either importer or veto execution.
-- Legacy writers, reads/RLS, asynchronous issuers and old work are UNCHANGED.
