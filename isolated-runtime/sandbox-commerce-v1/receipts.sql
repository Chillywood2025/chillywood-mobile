-- Install in the same disabled-generation transaction AFTER core/authority/commands.
-- TIP-ONLY vertical slice. No HTTP adapter, provider route activation, external
-- verification, funds movement, content grant or delivery capability is created.
-- Only a separately qualified service adapter may submit normalized provider
-- facts. A classifier result, SDK return or client 'verified' flag is NOT proof.
set local role sbx_v1_core_owner;

create table sandbox_commerce_v1.provider_routes (
  provider text not null, scope_key text not null, store text not null,
  source_environment text not null,
  semantic_contract text not null check(semantic_contract in
    ('rc_app_store_tip_v1','rc_google_play_tip_v1','stripe_platform_tip_v1')),
  qualification_state text not null default 'unavailable' check(qualification_state in ('unavailable','qualified')),
  ownership_evidence_sha256 text, delivery_evidence_sha256 text, adapter_evidence_sha256 text,
  initiation_enabled boolean not null default false,
  primary key(provider,scope_key,store),
  check((qualification_state='unavailable' and not initiation_enabled
    and ownership_evidence_sha256 is null and delivery_evidence_sha256 is null and adapter_evidence_sha256 is null)
    or (qualification_state='qualified' and ownership_evidence_sha256 is not null
      and delivery_evidence_sha256 is not null and adapter_evidence_sha256 is not null
      and ownership_evidence_sha256 ~ '^[a-f0-9]{64}$'
      and delivery_evidence_sha256 ~ '^[a-f0-9]{64}$' and adapter_evidence_sha256 ~ '^[a-f0-9]{64}$'))
);
-- No runtime setter: these rows must remain empty until provider namespace,
-- complete lifecycle delivery and authenticated adapter are independently
-- qualified. A second webhook or evidence-shaped string alone is not proof.
create table sandbox_commerce_v1.dispatch_attempts (
  intent_id uuid primary key references sandbox_commerce_v1.intents(id),
  dispatch_id uuid not null unique,
  provider_transaction_id text unique,
  state text not null check(state in ('claimed','bound')),
  claimed_at timestamptz not null, accept_purchase_until timestamptz not null,
  authority_valid_until timestamptz not null
);
create table sandbox_commerce_v1.original_states (
  provider text not null, scope_key text not null, store text not null,
  original_transaction_id text not null,
  buyer_id uuid not null, product_id text,
  intent_id uuid unique references sandbox_commerce_v1.intents(id),
  receipt_id uuid unique references sandbox_commerce_v1.receipts(id), transaction_id text,
  state text not null check(state in ('pending','verified','refunded','revoked','quarantined')),
  refunded_minor bigint not null default 0 check(refunded_minor>=0),
  amount_minor bigint, currency text, last_event_at timestamptz not null,
  quarantine_reason text,
  primary key(provider,scope_key,store,original_transaction_id)
);
create table sandbox_commerce_v1.receipt_ingress (
  provider text not null, scope_key text not null, store text not null, event_id text not null,
  payload jsonb not null, status text not null check(status in ('pending','processed','quarantined')),
  result jsonb,
  primary key(provider,scope_key,store,event_id)
);
do $install$
declare t text;
begin
  foreach t in array array['provider_routes','dispatch_attempts','original_states','receipt_ingress'] loop
    execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
    execute format('alter table sandbox_commerce_v1.%I force row level security',t);
    execute format('create policy core_owner on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using(true) with check(true)',t);
    execute format('revoke all on table sandbox_commerce_v1.%I from public,anon,authenticated,service_role',t);
  end loop;
end; $install$;

create function sandbox_commerce_v1.provider_text(p text) returns boolean
language sql immutable security invoker set search_path='' as $$
  select p is not null and length(p) between 1 and 512 and p=btrim(p) and p !~ '[[:cntrl:]]';
$$;
create function sandbox_commerce_v1.provider_scope_valid(p_provider text,p_scope text,p_store text,p_environment text)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare s jsonb;
begin
  s:=p_scope::jsonb;
  if jsonb_typeof(s)<>'array' then return false; end if;
  if exists(select 1 from jsonb_array_elements(s) element where jsonb_typeof(element)<>'string') then return false; end if;
  if p_provider='revenuecat' then
    return jsonb_array_length(s)=5 and s->>0='revenuecat'
      and sandbox_commerce_v1.provider_text(s->>1) and sandbox_commerce_v1.provider_text(s->>2)
      and p_store in ('app_store','google_play')
      and s->>3=case p_store when 'app_store' then 'APP_STORE' else 'PLAY_STORE' end
      and s->>4='SANDBOX' and p_environment='SANDBOX';
  elsif p_provider='stripe' then
    return jsonb_array_length(s)=4 and s->>0='stripe' and s->>1 ~ '^acct_[A-Za-z0-9]+$'
      and s->>2='STRIPE' and s->>3='test' and p_store='stripe' and p_environment='test';
  end if;
  return false;
exception when invalid_text_representation then return false;
end; $$;
create function sandbox_commerce_v1.assert_provider_service() returns void
language plpgsql volatile security invoker set search_path='' as $$
begin
  if (nullif(current_setting('request.jwt.claims',true),'')::jsonb)->>'role' is distinct from 'service_role'
  then raise exception 'sandbox_provider_service_required' using errcode='42501'; end if;
end; $$;

create function sandbox_commerce_v1.begin_dispatch(p_intent_id text,p_dispatch_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare i sandbox_commerce_v1.intents; a sandbox_commerce_v1.dispatch_attempts;
  r sandbox_commerce_v1.provider_routes; buyer jsonb; seller jsonb; valid_until timestamptz;
  o sandbox_commerce_v1.offers; resource sandbox_commerce_v1.resources; c sandbox_commerce_v1.catalog;
begin
  perform sandbox_commerce_v1.assert_provider_service();
  perform sandbox_commerce_v1.assert_generation(false);
  if p_dispatch_id is null then raise exception 'sandbox_dispatch_identity_required'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('sandbox-dispatch:'||p_intent_id,683))
  then raise exception 'sandbox_dispatch_busy' using errcode='55P03'; end if;
  select * into strict i from sandbox_commerce_v1.intents
    where id=sandbox_commerce_v1.identifier(p_intent_id,'intent');
  select * into a from sandbox_commerce_v1.dispatch_attempts where intent_id=i.id;
  if found then
    if a.dispatch_id<>p_dispatch_id then raise exception 'sandbox_dispatch_identity_conflict'; end if;
    return jsonb_build_object('status',case when a.state='bound' then 'provider_bound' else 'provider_outcome_unknown' end,
      'dispatchAllowed',false,'dispatchId',a.dispatch_id,'providerTransactionId',a.provider_transaction_id,
      'retryProviderMutation',false,'grantsAccess',false,'notPayable',true);
  end if;
  perform sandbox_commerce_v1.assert_generation(true);
  if i.kind<>'creator_tip' or i.state<>'prepared' or i.dispatch_id is not null or i.expires_at<=clock_timestamp()
  then raise exception 'sandbox_tip_dispatch_unavailable'; end if;
  select * into r from sandbox_commerce_v1.provider_routes
    where provider=i.provider and scope_key=i.scope_key and store=i.store for share nowait;
  if not found or r.qualification_state<>'qualified' or not r.initiation_enabled
    or sandbox_commerce_v1.provider_scope_valid(r.provider,r.scope_key,r.store,r.source_environment) is not true
    or r.semantic_contract is distinct from (case
      when i.provider='revenuecat' and i.store='app_store' then 'rc_app_store_tip_v1'
      when i.provider='revenuecat' and i.store='google_play' then 'rc_google_play_tip_v1'
      when i.provider='stripe' and i.store='stripe' then 'stripe_platform_tip_v1' end)
  then raise exception 'sandbox_provider_route_unavailable'; end if;
  buyer:=sandbox_commerce_v1.assert_authority(i.buyer_id,i.buyer_session_id,'buyer');
  seller:=sandbox_commerce_v1.assert_authority(i.creator_id,null,'creator_subject');
  -- Preserve the own-quote order used by checkout.prepare: offer, resource,
  -- catalog. Each exact row is fenced until commit; a concurrent takedown or
  -- quote edit must win first or wait until this admitted dispatch completes.
  select * into strict o from sandbox_commerce_v1.offers where id=i.offer_id for share nowait;
  select * into strict resource from sandbox_commerce_v1.resources where id=o.resource_id for share nowait;
  select * into strict c from sandbox_commerce_v1.catalog where id=o.catalog_id for share nowait;
  select * into strict i from sandbox_commerce_v1.intents where id=i.id for update nowait;
  if i.state<>'prepared' or i.dispatch_id is not null or i.expires_at<=clock_timestamp()
    or r.provider<>i.provider or r.scope_key<>i.scope_key or r.store<>i.store
    or (buyer->>'user_id')::uuid is distinct from i.buyer_id
    or (buyer->>'session_id')::uuid is distinct from i.buyer_session_id
    or (seller->>'user_id')::uuid is distinct from i.creator_id
    or o.id<>i.offer_id or o.revision<>i.offer_revision or o.status<>'published'
    or o.resource_id<>i.resource_id or o.resource_revision<>i.resource_revision
    or resource.id<>i.resource_id or resource.revision<>i.resource_revision or resource.status<>'published'
    or resource.creator_id<>i.creator_id or resource.kind<>'creator_tip'
    or c.kind<>i.kind or c.provider<>i.provider or c.scope_key<>i.scope_key or c.store<>i.store or c.product_id<>i.product_id
    or c.amount_minor<>i.amount_minor or c.currency<>i.currency
  then raise exception 'sandbox_tip_quote_changed'; end if;
  perform sandbox_commerce_v1.assert_fresh(buyer); perform sandbox_commerce_v1.assert_fresh(seller);
  valid_until:=least((buyer->>'valid_until')::timestamptz,(seller->>'valid_until')::timestamptz,i.expires_at);
  insert into sandbox_commerce_v1.dispatch_attempts(intent_id,dispatch_id,state,claimed_at,accept_purchase_until,authority_valid_until)
    values(i.id,p_dispatch_id,'claimed',clock_timestamp(),i.expires_at,valid_until) returning * into a;
  update sandbox_commerce_v1.intents set state='provider_pending',dispatch_id=p_dispatch_id,dispatched_at=a.claimed_at where id=i.id;
  -- Writes/triggers can consume the lease. Fail the whole transaction if either
  -- authority or the intent deadline expires before returning the one-use claim.
  perform sandbox_commerce_v1.assert_fresh(buyer); perform sandbox_commerce_v1.assert_fresh(seller);
  if clock_timestamp()>=valid_until then
    raise exception 'sandbox_dispatch_lease_expired' using errcode='42501';
  end if;
  -- This is only a bounded network-initiation lease, not authority at provider
  -- sheet settlement. The future authenticated Edge adapter must bind this
  -- exact committed dispatch/quote/scope, verify its clock is before the lease
  -- deadline immediately before its first provider request, use the frozen
  -- idempotency key, and never resend an uncertain attempt. Later receipts use
  -- the admitted purchase window and immutable provider binding independently
  -- of today's seller Premium/session; they never assert current authority.
  -- The lease does not prove authority remained unchanged after commit. The
  -- provider route stays unavailable until its admission/cancellation and
  -- compensation contract across that network boundary is qualified.
  return jsonb_build_object('status','dispatch_claimed','dispatchAllowed',true,'dispatchId',p_dispatch_id,
    'intentId',i.id,'provider',i.provider,'providerScopeKey',i.scope_key,'store',i.store,'productId',i.product_id,
    'buyerId',i.buyer_id,'amountMinor',i.amount_minor,'currency',i.currency,
    'authorityValidUntil',valid_until,'idempotencyKey','isolated-sandbox-v1:'||p_dispatch_id,
    'retryProviderMutation',false,'grantsAccess',false,'notPayable',true);
end; $$;

create function sandbox_commerce_v1.bind_dispatch(p_intent_id text,p_dispatch_id uuid,p_provider_transaction_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare i sandbox_commerce_v1.intents; a sandbox_commerce_v1.dispatch_attempts;
begin
  perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
  if p_dispatch_id is null or p_provider_transaction_id is null or p_provider_transaction_id !~ '^pi_[A-Za-z0-9]+$'
  then raise exception 'sandbox_provider_binding_invalid'; end if;
  select * into strict i from sandbox_commerce_v1.intents where id=sandbox_commerce_v1.identifier(p_intent_id,'intent');
  select * into strict a from sandbox_commerce_v1.dispatch_attempts where intent_id=i.id for update nowait;
  if i.provider<>'stripe' or a.dispatch_id<>p_dispatch_id or i.dispatch_id<>p_dispatch_id
    or (a.provider_transaction_id is not null and a.provider_transaction_id<>p_provider_transaction_id)
    or exists(select 1 from sandbox_commerce_v1.dispatch_attempts other
      where other.intent_id<>i.id and other.provider_transaction_id=p_provider_transaction_id)
  then raise exception 'sandbox_provider_binding_conflict'; end if;
  -- This is an authenticated adapter's provider-read result, not client metadata.
  update sandbox_commerce_v1.dispatch_attempts set state='bound',provider_transaction_id=p_provider_transaction_id where intent_id=i.id;
  return jsonb_build_object('status','provider_bound','dispatchAllowed',false,'retryProviderMutation',false,
    'grantsAccess',false,'notPayable',true);
end; $$;

create function sandbox_commerce_v1.quarantine_original(p_provider text,p_scope text,p_store text,p_original text,
  p_buyer uuid,p_product text,p_at timestamptz,p_reason text) returns void
language plpgsql volatile security invoker set search_path='' as $$
declare existing sandbox_commerce_v1.original_states;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('sandbox-original:'||jsonb_build_array(p_provider,p_scope,p_store,p_original)::text,683))
  then raise exception 'sandbox_original_busy' using errcode='55P03'; end if;
  insert into sandbox_commerce_v1.original_states(provider,scope_key,store,original_transaction_id,buyer_id,product_id,state,last_event_at,quarantine_reason)
    values(p_provider,p_scope,p_store,p_original,p_buyer,p_product,'quarantined',p_at,p_reason)
    on conflict(provider,scope_key,store,original_transaction_id) do update
      set state=case when original_states.state in ('refunded','revoked') then original_states.state else 'quarantined' end,
        last_event_at=greatest(original_states.last_event_at,excluded.last_event_at),quarantine_reason=excluded.quarantine_reason
    returning * into existing;
  if existing.receipt_id is not null then
    update sandbox_commerce_v1.receipts set state=case when state in ('refunded','revoked') then state else 'quarantined' end
      where id=existing.receipt_id;
  end if;
end; $$;

create function sandbox_commerce_v1.ingest_receipt(p_receipt jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
<<receipt_ctx>>
declare
  provider text; scope text; store text; source_environment text; event_id text; event_type text; provider_event_type text;
  original_id text; transaction_id text; product text; buyer uuid; intent_hint uuid; dispatch_hint uuid;
  amount bigint; refunded bigint; currency text; purchased timestamptz; event_at timestamptz;
  r sandbox_commerce_v1.provider_routes; ingress sandbox_commerce_v1.receipt_ingress;
  original sandbox_commerce_v1.original_states; other sandbox_commerce_v1.original_states;
  i sandbox_commerce_v1.intents; a sandbox_commerce_v1.dispatch_attempts;
  receipt_row sandbox_commerce_v1.receipts; candidates uuid[];
  result jsonb; reason text; outcome text; final_state text; exact_purchase boolean;
begin
  perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
  if p_receipt is null or jsonb_typeof(p_receipt)<>'object' or octet_length(p_receipt::text)>16384
    or not p_receipt ?& array['provider','providerScopeKey','store','sourceEnvironment','environment','providerEventId','providerEventType','eventType',
      'rawBodySha256','buyerId','intentId','dispatchId','providerTransactionId','originalTransactionId','productId','purchasedAt','expiresAt',
      'amountMinor','currency','refundedAmountMinor','providerEventAt','providerObjectType','providerStatus','providerAmountReceivedMinor','providerLivemode','providerConnectedAccountId']
    or (p_receipt-array['provider','providerScopeKey','store','sourceEnvironment','environment','providerEventId','providerEventType','eventType',
      'rawBodySha256','buyerId','intentId','dispatchId','providerTransactionId','originalTransactionId','productId','purchasedAt','expiresAt',
      'amountMinor','currency','refundedAmountMinor','providerEventAt','providerObjectType','providerStatus','providerAmountReceivedMinor','providerLivemode','providerConnectedAccountId'])<>'{}'::jsonb
    or exists(select 1 from unnest(array['provider','providerScopeKey','store','sourceEnvironment','environment','providerEventId',
      'providerEventType','eventType','rawBodySha256','buyerId','originalTransactionId','providerEventAt']) required(key)
      where jsonb_typeof(p_receipt->required.key) is distinct from 'string')
    or exists(select 1 from unnest(array['intentId','dispatchId','providerTransactionId','productId','purchasedAt','expiresAt',
      'currency','providerObjectType','providerStatus','providerConnectedAccountId']) optional(key)
      where jsonb_typeof(p_receipt->optional.key) not in ('string','null'))
    or jsonb_typeof(p_receipt->'providerLivemode') not in ('boolean','null')
    or p_receipt->>'environment' is distinct from 'sandbox' or coalesce(p_receipt->>'rawBodySha256','') !~ '^[a-f0-9]{64}$'
  then raise exception 'sandbox_receipt_shape_invalid'; end if;
  provider:=p_receipt->>'provider'; scope:=p_receipt->>'providerScopeKey'; store:=p_receipt->>'store'; source_environment:=p_receipt->>'sourceEnvironment';
  event_id:=p_receipt->>'providerEventId'; event_type:=p_receipt->>'eventType'; provider_event_type:=p_receipt->>'providerEventType';
  original_id:=p_receipt->>'originalTransactionId'; transaction_id:=p_receipt->>'providerTransactionId'; product:=p_receipt->>'productId';
  buyer:=(p_receipt->>'buyerId')::uuid; intent_hint:=(p_receipt->>'intentId')::uuid; dispatch_hint:=(p_receipt->>'dispatchId')::uuid;
  amount:=(p_receipt->>'amountMinor')::bigint; refunded:=(p_receipt->>'refundedAmountMinor')::bigint; currency:=p_receipt->>'currency';
  event_at:=(p_receipt->>'providerEventAt')::timestamptz; purchased:=(p_receipt->>'purchasedAt')::timestamptz;
  if sandbox_commerce_v1.provider_scope_valid(provider,scope,store,source_environment) is not true
    or sandbox_commerce_v1.provider_text(event_id) is not true or sandbox_commerce_v1.provider_text(original_id) is not true
    or sandbox_commerce_v1.provider_text(provider_event_type) is not true or sandbox_commerce_v1.provider_text(event_type) is not true
    or buyer is null or event_at is null
    or not isfinite(event_at) or event_at>clock_timestamp()+interval '5 minutes'
    or (product is not null and sandbox_commerce_v1.provider_text(product) is not true)
    or (transaction_id is not null and sandbox_commerce_v1.provider_text(transaction_id) is not true)
    or (amount is not null and (jsonb_typeof(p_receipt->'amountMinor')<>'number' or amount<=0 or amount>9007199254740991))
    or (refunded is not null and (jsonb_typeof(p_receipt->'refundedAmountMinor')<>'number' or refunded<=0 or refunded>9007199254740991))
    or ((amount is null)<>(currency is null)) or (currency is not null and currency !~ '^[a-z]{3}$')
  then raise exception 'sandbox_receipt_identity_invalid'; end if;
  select * into r from sandbox_commerce_v1.provider_routes pr where pr.provider=receipt_ctx.provider and pr.scope_key=scope and pr.store=receipt_ctx.store;
  if not found or r.qualification_state<>'qualified' or r.source_environment<>source_environment
    or r.semantic_contract is distinct from (case when provider='revenuecat' and store='app_store' then 'rc_app_store_tip_v1'
      when provider='revenuecat' and store='google_play' then 'rc_google_play_tip_v1'
      when provider='stripe' and store='stripe' then 'stripe_platform_tip_v1' end)
  then raise exception 'sandbox_provider_route_unavailable'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('sandbox-event:'||jsonb_build_array(provider,scope,store,event_id)::text,683))
  then raise exception 'sandbox_receipt_event_busy' using errcode='55P03'; end if;
  select * into ingress from sandbox_commerce_v1.receipt_ingress e
    where e.provider=receipt_ctx.provider and e.scope_key=scope and e.store=receipt_ctx.store and e.event_id=receipt_ctx.event_id;
  if found then
    if ingress.payload is distinct from p_receipt then
      -- Persist conflict; raising after this write would roll it back.
      perform sandbox_commerce_v1.quarantine_original(provider,scope,store,ingress.payload->>'originalTransactionId',
        (ingress.payload->>'buyerId')::uuid,ingress.payload->>'productId',event_at,'event_payload_identity_conflict');
      return jsonb_build_object('status','quarantined','reason','event_payload_identity_conflict','grantsAccess',false,'notPayable',true);
    end if;
    if ingress.status<>'pending' then return ingress.result||jsonb_build_object('duplicate',true); end if;
  else
    insert into sandbox_commerce_v1.receipt_ingress(provider,scope_key,store,event_id,payload,status)
      values(provider,scope,store,event_id,p_receipt,'pending');
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('sandbox-original:'||jsonb_build_array(provider,scope,store,original_id)::text,683))
  then raise exception 'sandbox_original_busy' using errcode='55P03'; end if;
  select * into original from sandbox_commerce_v1.original_states o
    where o.provider=receipt_ctx.provider and o.scope_key=scope and o.store=receipt_ctx.store and o.original_transaction_id=original_id;
  exact_purchase:= (provider='revenuecat' and event_type='non_renewing_purchase' and provider_event_type='NON_RENEWING_PURCHASE')
    or (provider='stripe' and event_type='payment_succeeded' and provider_event_type='payment_intent.succeeded');
  if original.buyer_id is not null and (original.buyer_id<>buyer or (original.product_id is not null and product is not null and original.product_id<>product))
  then reason:='original_identity_conflict';
  elsif exact_purchase and original.amount_minor is not null
    and (amount is distinct from original.amount_minor or currency is distinct from original.currency)
  then reason:='original_quote_conflict';
  elsif exact_purchase then
    if purchased is null or not isfinite(purchased) or purchased>event_at or product is null or transaction_id is null or amount is null
      or p_receipt->'expiresAt'<>'null'::jsonb or refunded is not null
    then reason:='finite_tip_purchase_invalid';
    elsif provider='stripe' and (p_receipt->>'providerObjectType' is distinct from 'payment_intent'
      or p_receipt->>'providerStatus' is distinct from 'succeeded'
      or p_receipt->'providerLivemode' is distinct from 'false'::jsonb
      or p_receipt->'providerConnectedAccountId' is distinct from 'null'::jsonb
      or jsonb_typeof(p_receipt->'providerAmountReceivedMinor') is distinct from 'number'
      or (p_receipt->>'providerAmountReceivedMinor')::bigint is distinct from amount
      or transaction_id!~'^pi_[A-Za-z0-9]+$' or original_id<>transaction_id)
    then reason:='stripe_tip_settlement_invalid';
    end if;
    if reason is null then
      if original.intent_id is not null then
        select * into strict i from sandbox_commerce_v1.intents where id=original.intent_id;
        if original.transaction_id<>transaction_id or (intent_hint is not null and intent_hint<>i.id)
        then reason:='original_transaction_or_intent_conflict'; end if;
      elsif provider='revenuecat' then
        select array_agg(candidate.id order by candidate.id) into candidates
        from sandbox_commerce_v1.intents candidate join sandbox_commerce_v1.dispatch_attempts attempt on attempt.intent_id=candidate.id
        where candidate.provider=receipt_ctx.provider and candidate.scope_key=scope and candidate.store=receipt_ctx.store
          and candidate.buyer_id=buyer and candidate.product_id=product and candidate.amount_minor=amount and candidate.currency=receipt_ctx.currency
          and candidate.kind='creator_tip' and candidate.state='provider_pending'
          and candidate.dispatch_id=attempt.dispatch_id and candidate.dispatched_at=attempt.claimed_at
          and purchased>=attempt.claimed_at and purchased<=attempt.accept_purchase_until;
        if coalesce(cardinality(candidates),0)<>1 then reason:='tip_intent_missing_or_ambiguous';
        else select * into strict i from sandbox_commerce_v1.intents where id=candidates[1];
          if intent_hint is not null and intent_hint<>i.id then reason:='tip_intent_hint_conflict'; end if;
        end if;
      else
        if intent_hint is null or dispatch_hint is null then reason:='stripe_tip_intent_binding_required';
        else select * into i from sandbox_commerce_v1.intents where id=intent_hint;
          if not found then reason:='stripe_tip_intent_missing'; end if;
        end if;
      end if;
    end if;
    if reason is null then
      if not pg_try_advisory_xact_lock(hashtextextended('sandbox-tip-intent:'||i.id,683))
      then raise exception 'sandbox_tip_intent_busy' using errcode='55P03'; end if;
      select * into a from sandbox_commerce_v1.dispatch_attempts where intent_id=i.id;
      if not found or i.kind<>'creator_tip' or i.state not in ('provider_pending','verified')
        or i.provider<>provider or i.scope_key<>scope or i.store<>store or i.product_id<>product or i.buyer_id<>buyer
        or i.amount_minor<>amount or i.currency<>currency or i.dispatch_id is distinct from a.dispatch_id or i.dispatched_at is distinct from a.claimed_at
        or purchased<a.claimed_at or purchased>a.accept_purchase_until
      then reason:='tip_admitted_quote_mismatch';
      elsif provider='stripe' and (a.dispatch_id<>dispatch_hint or a.provider_transaction_id is distinct from transaction_id) then
        if a.dispatch_id=dispatch_hint and a.provider_transaction_id is null then outcome:='pending'; reason:='stripe_provider_binding_pending';
        else reason:='stripe_provider_binding_conflict'; end if;
      end if;
      select * into other from sandbox_commerce_v1.original_states where intent_id=i.id;
      if other.original_transaction_id is not null and (other.provider<>provider or other.scope_key<>scope or other.store<>store or other.original_transaction_id<>original_id) then
        perform sandbox_commerce_v1.quarantine_original(other.provider,other.scope_key,other.store,other.original_transaction_id,
          other.buyer_id,other.product_id,event_at,'intent_has_multiple_provider_transactions');
        reason:='intent_has_multiple_provider_transactions'; outcome:=null;
      end if;
    end if;
    if reason is null then
      final_state:=case when original.state in ('refunded','revoked','quarantined') then original.state else 'verified' end;
      if original.receipt_id is null then
        if exists(select 1 from sandbox_commerce_v1.receipts existing where existing.provider=receipt_ctx.provider
          and existing.scope_key=scope and existing.store=receipt_ctx.store and existing.transaction_id=receipt_ctx.transaction_id)
        then reason:='provider_transaction_already_owned';
        else
          insert into sandbox_commerce_v1.receipts(intent_id,provider,scope_key,store,product_id,transaction_id,original_transaction_id,state,purchased_at,expires_at,last_event_at)
            values(i.id,provider,scope,store,product,transaction_id,original_id,final_state,purchased,null,greatest(event_at,original.last_event_at)) returning * into receipt_row;
          insert into sandbox_commerce_v1.original_states(provider,scope_key,store,original_transaction_id,buyer_id,product_id,intent_id,receipt_id,transaction_id,state,amount_minor,currency,last_event_at)
            values(provider,scope,store,original_id,buyer,product,i.id,receipt_row.id,transaction_id,final_state,amount,currency,event_at)
            on conflict on constraint original_states_pkey do update set
              product_id=excluded.product_id,intent_id=excluded.intent_id,receipt_id=excluded.receipt_id,transaction_id=excluded.transaction_id,
              amount_minor=excluded.amount_minor,currency=excluded.currency,last_event_at=greatest(original_states.last_event_at,excluded.last_event_at);
          insert into sandbox_commerce_v1.transaction_owners(provider,scope_key,store,original_transaction_id,buyer_id,product_id)
            values(provider,scope,store,original_id,buyer,product);
          update sandbox_commerce_v1.intents set state='verified' where id=i.id;
        end if;
      else select * into strict receipt_row from sandbox_commerce_v1.receipts where id=original.receipt_id;
      end if;
    end if;
  elsif (event_type='refund' and provider_event_type=case provider when 'stripe' then 'charge.refunded' else 'REFUND' end)
    or (provider='revenuecat' and event_type='revocation' and provider_event_type='REVOCATION') then
    if provider='stripe' and (amount is null or refunded is null or refunded>amount
      or p_receipt->>'providerObjectType' is distinct from 'charge'
      or p_receipt->'providerLivemode' is distinct from 'false'::jsonb
      or p_receipt->'providerConnectedAccountId' is distinct from 'null'::jsonb
      or transaction_id is null or transaction_id!~'^pi_[A-Za-z0-9]+$' or original_id<>transaction_id)
    then reason:='stripe_refund_economics_invalid';
    elsif original.amount_minor is not null and ((amount is not null and amount<>original.amount_minor) or (currency is not null and currency<>original.currency))
    then reason:='terminal_quote_mismatch';
    elsif provider='stripe' and refunded<amount then reason:='partial_refund_requires_reconciliation';
    else
      final_state:=case when original.state='revoked' or event_type='revocation' then 'revoked' else 'refunded' end;
      insert into sandbox_commerce_v1.original_states(provider,scope_key,store,original_transaction_id,buyer_id,product_id,state,refunded_minor,amount_minor,currency,last_event_at)
        values(provider,scope,store,original_id,buyer,product,final_state,coalesce(refunded,0),amount,currency,event_at)
        on conflict on constraint original_states_pkey do update set state=excluded.state,
          refunded_minor=greatest(original_states.refunded_minor,excluded.refunded_minor),last_event_at=greatest(original_states.last_event_at,excluded.last_event_at)
        returning * into original;
      if original.receipt_id is not null then
        update sandbox_commerce_v1.receipts set state=final_state,last_event_at=greatest(last_event_at,event_at)
          where id=original.receipt_id returning * into receipt_row;
      end if;
    end if;
  else reason:='unsupported_tip_lifecycle_requires_reconciliation';
  end if;
  if reason is not null and outcome is distinct from 'pending' then
    perform sandbox_commerce_v1.quarantine_original(provider,scope,store,original_id,buyer,product,event_at,reason);
    if refunded is not null and amount is not null and refunded<=amount then
      update sandbox_commerce_v1.original_states s set refunded_minor=greatest(s.refunded_minor,refunded)
        where s.provider=receipt_ctx.provider and s.scope_key=scope and s.store=receipt_ctx.store and s.original_transaction_id=original_id;
    end if;
    outcome:='quarantined';
  end if;
  outcome:=coalesce(outcome,'processed');
  result:=jsonb_build_object('status',outcome,'reason',coalesce(reason,'tip_provider_evidence_recorded'),
    'receiptId',receipt_row.id,'grantsAccess',false,'notPayable',true,'financialAuthority',false);
  update sandbox_commerce_v1.receipt_ingress e set status=outcome,result=receipt_ctx.result
    where e.provider=receipt_ctx.provider and e.scope_key=scope and e.store=receipt_ctx.store and e.event_id=receipt_ctx.event_id;
  if outcome='processed' and receipt_row.id is not null then
    insert into sandbox_commerce_v1.receipt_events(provider,scope_key,event_id,payload,receipt_id)
      values(provider,scope,event_id,p_receipt,receipt_row.id);
  end if;
  return result;
end; $$;
revoke all on function sandbox_commerce_v1.provider_text(text),
  sandbox_commerce_v1.provider_scope_valid(text,text,text,text),sandbox_commerce_v1.assert_provider_service(),
  sandbox_commerce_v1.begin_dispatch(text,uuid),sandbox_commerce_v1.bind_dispatch(text,uuid,text),
  sandbox_commerce_v1.quarantine_original(text,text,text,text,uuid,text,timestamptz,text),
  sandbox_commerce_v1.ingest_receipt(jsonb) from public,anon,authenticated,service_role;
reset role;

grant usage,create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.isolated_sandbox_begin_dispatch_v1(p_intent_id text,p_dispatch_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  perform sandbox_commerce_v1.arm_transaction_timeout();
  return sandbox_commerce_v1.begin_dispatch(p_intent_id,p_dispatch_id);
end;
$$;
create function public.isolated_sandbox_bind_dispatch_v1(p_intent_id text,p_dispatch_id uuid,p_provider_transaction_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  perform sandbox_commerce_v1.arm_transaction_timeout();
  return sandbox_commerce_v1.bind_dispatch(p_intent_id,p_dispatch_id,p_provider_transaction_id);
end;
$$;
create function public.isolated_sandbox_ingest_receipt_v1(p_receipt jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  perform sandbox_commerce_v1.arm_transaction_timeout();
  return sandbox_commerce_v1.ingest_receipt(p_receipt);
end;
$$;
revoke all on function public.isolated_sandbox_begin_dispatch_v1(text,uuid),
  public.isolated_sandbox_bind_dispatch_v1(text,uuid,text),public.isolated_sandbox_ingest_receipt_v1(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.isolated_sandbox_begin_dispatch_v1(text,uuid),
  public.isolated_sandbox_bind_dispatch_v1(text,uuid,text),public.isolated_sandbox_ingest_receipt_v1(jsonb) to service_role;
reset role;
revoke create on schema public from sbx_v1_core_owner;
