-- Dormant live compatibility: no qualification, switch or provider mutation is seeded.
create table private.merch_live_checkout_qualifications (
 account_id text primary key check(account_id ~ '^acct_[A-Za-z0-9]+$'),
 provider_evidence_sha256 text not null check(provider_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 legal_evidence_sha256 text not null check(legal_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 fulfillment_evidence_sha256 text not null check(fulfillment_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 qualified_until timestamptz not null, revoked_at timestamptz
);
create table private.merch_checkout_provider_bindings (
 order_id uuid primary key references public.merch_orders(id),
 environment text not null check(environment in('sandbox','production')),
 account_id text not null check(account_id ~ '^acct_[A-Za-z0-9]+$'),
 quote jsonb not null, created_at timestamptz not null default clock_timestamp()
);
alter table private.merch_live_checkout_qualifications enable row level security;
alter table private.merch_live_checkout_qualifications force row level security;
alter table private.merch_checkout_provider_bindings enable row level security;
alter table private.merch_checkout_provider_bindings force row level security;
revoke all on private.merch_live_checkout_qualifications,private.merch_checkout_provider_bindings from public,anon,authenticated,service_role;
create trigger merch_checkout_binding_immutable before update or delete on private.merch_checkout_provider_bindings
 for each row execute function private.platform_brand_retention_immutable();
create trigger merch_checkout_binding_no_truncate before truncate on private.merch_checkout_provider_bindings
 for each statement execute function private.platform_brand_retention_immutable();
create function private.merch_live_checkout_ready(p_account text default null) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_money_feature_allowed('merch_enabled',true)
 and exists(select 1 from public.provider_readiness_status where provider='stripe' and capability='platform_commerce'
  and environment='production' and status='active' and is_live_money_enabled)
 and exists(select 1 from private.merch_live_checkout_qualifications where (p_account is null or account_id=p_account)
  and revoked_at is null and qualified_until>statement_timestamp());
$$;
create function private.assert_merch_live_checkout(p_account text default null) returns void
language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.platform_money_kill_switches where key in('merch_enabled','live_money_enabled') order by key for share;
 perform 1 from public.provider_readiness_status where provider='stripe' and capability='platform_commerce' and environment='production' for share;
 perform 1 from private.merch_live_checkout_qualifications where p_account is null or account_id=p_account order by account_id for share;
 if not private.merch_live_checkout_ready(p_account) then raise exception 'merch_live_checkout_unqualified'; end if;
end $$;
create function private.merch_checkout_quote(o public.merch_orders) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('orderId',o.id,'buyerId',o.buyer_id,'productId',o.product_id,'creatorId',o.creator_id,
 'environment',o.environment,'provider',o.provider,'quantity',o.quantity,'variantId',o.variant_id,
 'subtotalMinor',o.amount_subtotal_minor,'totalMinor',o.amount_total_minor,'currency',o.currency,'createdAt',o.created_at,
 'title',o.product_title_snapshot,'sku',o.sku_snapshot,'size',o.size_snapshot,'color',o.color_snapshot,'returnDays',o.return_window_days,
 'trackingMode',o.shipping_tracking_mode,'returnPolicy',o.return_policy_version,
 'netSharePolicy',o.net_share_policy_version,'platformBps',o.platform_net_share_bps,'creatorBps',o.creator_net_share_bps);
$$;
create function public.bind_merch_checkout_provider(p_order_id uuid,p_environment text,p_account_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.merch_orders; b private.merch_checkout_provider_bindings; begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform private.platform_brand_retention_lock();
 select * into strict o from public.merch_orders where id=p_order_id for update;
 if o.environment is distinct from p_environment or o.provider<>'stripe_physical_goods'
  or p_account_id is null or p_account_id !~ '^acct_[A-Za-z0-9]+$' or o.payment_status<>'pending'
  or o.reservation_released_at is not null then raise exception 'merch_provider_binding_invalid'; end if;
 if o.environment='production' then perform private.assert_merch_live_checkout(p_account_id); end if;
 insert into private.merch_checkout_provider_bindings(order_id,environment,account_id,quote)
 values(o.id,o.environment,p_account_id,private.merch_checkout_quote(o)) on conflict(order_id) do nothing;
 select * into strict b from private.merch_checkout_provider_bindings where order_id=o.id;
 if b.environment<>o.environment or b.account_id<>p_account_id or b.quote is distinct from private.merch_checkout_quote(o)
 then raise exception 'merch_provider_binding_conflict'; end if;
 return jsonb_build_object('bound',true,'orderId',o.id,'environment',o.environment,'accountId',b.account_id);
end $$;
revoke all on function public.bind_merch_checkout_provider(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.bind_merch_checkout_provider(uuid,text,text) to service_role;
revoke all on function private.merch_live_checkout_ready(text),private.assert_merch_live_checkout(text),private.merch_checkout_quote(public.merch_orders) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.reserve_merch_checkout_before_net_share(p_product_id uuid, p_quantity integer, p_attempt_id uuid, p_variant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.merch_products%rowtype; o public.merch_orders%rowtype; v public.merch_product_variants%rowtype;
begin
 if not public.whole_app_exact_current_session_authority_internal() then raise exception 'merch_current_session_required' using errcode='42501'; end if;
 if p_attempt_id is null or p_quantity is null or p_quantity not between 1 and 10 then raise exception 'merch_checkout_invalid' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_attempt_id::text,0));
 select * into p from public.merch_products where id=p_product_id for update;
 if not found or p.environment not in('sandbox','production') or p.status<>(case when p.environment='sandbox' then 'sandbox' else 'active' end) or p.provider<>'stripe_physical_goods'
   or p.publication_status<>'published' or p.is_physical_good is not true or p.creates_digital_access is not false
   or p.currency<>'usd' or p.price_minor is null or p.price_minor<=0 or p.creator_id is null or p.creator_id=auth.uid() then
   raise exception 'merch_product_unavailable' using errcode='42501'; end if;
 if p.environment='sandbox' and not (public.has_platform_role(array['owner','operator']) or public.has_active_beta_access()) then raise exception 'sandbox_tester_required' using errcode='42501'; end if;
 if p.environment='production' then perform private.assert_merch_live_checkout(); end if;
 if not coalesce((public.resolve_platform_visibility_access(p.creator_id::text,auth.uid()::text)->>'allowed')::boolean,false) then
   raise exception 'merch_platform_unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('wave1-creator:'||p.creator_id::text,0));
 perform 1 from public.wave1_creator_eligibility where creator_user_id=p.creator_id for share;
 perform 1 from public.wave1_legal_document_versions where market='UNITED_STATES' for share;
 perform 1 from public.wave1_legal_acceptances where user_id=p.creator_id and invalidated_at is null for share;
 if not public.merch_seller_ready_internal(p.creator_id) then raise exception 'merch_creator_not_ready' using errcode='42501'; end if;
 if p.variant_mode='options' then
   select * into v from public.merch_product_variants where id=p_variant_id and product_id=p.id for update;
   if not found or v.status<>'active' then raise exception 'merch_variant_unavailable' using errcode='22023'; end if;
 elsif p_variant_id is not null then raise exception 'merch_variant_not_expected' using errcode='22023';
 end if;
 select * into o from public.merch_orders where buyer_id=auth.uid() and checkout_attempt_id=p_attempt_id;
 if found then
   if o.environment is distinct from p.environment or o.product_id is distinct from p_product_id or o.quantity is distinct from p_quantity or o.variant_id is distinct from p_variant_id then raise exception 'merch_attempt_conflict' using errcode='22023'; end if;
   if o.created_at<=clock_timestamp()-interval '1 hour' or o.payment_status<>'pending'
      or o.reservation_released_at is not null then raise exception 'merch_attempt_closed_check_orders' using errcode='22023'; end if;
 else
   if exists(select 1 from public.merch_orders where buyer_id=auth.uid() and product_id=p_product_id
     and checkout_attempt_id is not null and payment_status='pending' and reservation_released_at is null) then
     raise exception 'merch_existing_pending_order_check_orders' using errcode='22023'; end if;
   if (select count(*) from public.merch_orders where buyer_id=auth.uid() and checkout_attempt_id is not null
     and payment_status='pending' and reservation_released_at is null)>=3 then
     raise exception 'merch_pending_order_limit_check_orders' using errcode='22023'; end if;
   if p.stock_quantity-p.reserved_quantity<p_quantity then raise exception 'merch_sold_out' using errcode='22023'; end if;
   if p.variant_mode='options' then
     if v.stock_quantity-v.reserved_quantity<p_quantity then raise exception 'merch_sold_out' using errcode='22023'; end if;
     update public.merch_product_variants set reserved_quantity=reserved_quantity+p_quantity,updated_at=clock_timestamp() where id=v.id;
   end if;
   update public.merch_products set reserved_quantity=reserved_quantity+p_quantity,updated_at=clock_timestamp() where id=p.id;
   insert into public.merch_orders(product_id,buyer_id,creator_id,provider,environment,order_status,
     fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,shipping_required,
     checkout_attempt_id,product_title_snapshot,quantity,variant_id,sku_snapshot,size_snapshot,color_snapshot)
   values(p.id,auth.uid(),p.creator_id,'stripe_physical_goods',p.environment,'pending','not_started','pending',
     p.price_minor*p_quantity,p.price_minor*p_quantity,p.currency,true,p_attempt_id,p.title,p_quantity,v.id,v.sku,v.size,v.color) returning * into o;
   insert into public.merch_order_items(order_id,product_id,quantity,unit_amount_minor,currency)
     values(o.id,p.id,p_quantity,p.price_minor,p.currency);
 end if;
 return jsonb_build_object('id',o.id,'title',o.product_title_snapshot,'priceMinor',o.amount_subtotal_minor/o.quantity,
   'currency',o.currency,'createdAt',o.created_at,'variantId',o.variant_id,'sku',o.sku_snapshot,'size',o.size_snapshot,'color',o.color_snapshot);
end $function$
;

CREATE OR REPLACE FUNCTION public.reserve_merch_checkout_dispatch(p_buyer_id uuid, p_session_id uuid, p_product_id uuid, p_quantity integer, p_attempt_id uuid, p_variant_id uuid, p_expected_tracking_mode text, p_expected_unit_price integer, p_expected_currency text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; prior uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 -- Retained reservation/webhook/photo triggers take this global latch first.
 -- Never hold buyer/product locks while waiting for the retention latch.
 perform private.platform_brand_retention_lock();
 -- Same lock as the retained reservation implementation, before inspecting
 -- existence: a retry must never classify a historical/inflight order as new.
 perform pg_advisory_xact_lock(hashtextextended('merch_buyer:'||p_buyer_id::text,0));
 select id into prior from public.merch_orders where buyer_id=p_buyer_id and checkout_attempt_id=p_attempt_id;
 result:=public.reserve_merch_checkout_for_actor_with_tracking(p_buyer_id,p_session_id,p_product_id,p_quantity,p_attempt_id,
   p_variant_id,p_expected_tracking_mode,p_expected_unit_price,p_expected_currency);
 if prior is null then
  insert into private.merch_checkout_dispatch(order_id,state) values((result->>'id')::uuid,'prepared');
 end if;
 return result||jsonb_build_object('environment',(select environment from public.merch_orders where id=(result->>'id')::uuid));
end $function$
;

CREATE OR REPLACE FUNCTION public.transition_merch_checkout_dispatch(p_buyer_id uuid, p_session_id uuid, p_attempt_id uuid, p_action text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.merch_orders; d private.merch_checkout_dispatch;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_action is null or p_action not in ('dispatch','abort') then raise exception 'invalid_checkout_transition'; end if;
 perform private.platform_brand_retention_lock();
 perform private.assert_merch_checkout_actor(p_buyer_id,p_session_id);
 perform pg_advisory_xact_lock(hashtextextended('merch_buyer:'||p_buyer_id::text,0));
 select * into o from public.merch_orders where buyer_id=p_buyer_id and checkout_attempt_id=p_attempt_id;
 if o.id is null then return '{"authorized":false,"aborted":false}'::jsonb; end if;
 if p_request is null or jsonb_typeof(p_request)<>'object'
  or o.product_id is distinct from (p_request->>'productId')::uuid
  or o.quantity is distinct from (p_request->>'quantity')::integer
  or o.variant_id is distinct from (p_request->>'variantId')::uuid
  or (o.shipping_tracking_mode is not null and (
   o.shipping_tracking_mode is distinct from p_request->>'trackingMode'
   or o.amount_subtotal_minor::bigint is distinct from (p_request->>'unitPriceMinor')::bigint*o.quantity
   or o.currency is distinct from p_request->>'currency'))
 then return '{"authorized":false,"aborted":false}'::jsonb; end if;
 -- Retained global latch precedes buyer, product, variant, order, provenance.
 perform 1 from public.merch_products where id=o.product_id for update;
 perform 1 from public.merch_product_variants where id=o.variant_id for update;
 select * into o from public.merch_orders where id=o.id for update;
 select * into d from private.merch_checkout_dispatch where order_id=o.id for update;
 if d.order_id is null and p_action='abort' then return '{"authorized":false,"aborted":false}'::jsonb; end if;
 if p_action='abort' and d.state='aborted' then
  -- A later verified webhook may preserve contradictory payment truth. Never
  -- issue replacement permission from a stale cancellation marker alone.
  return jsonb_build_object('authorized',false,'aborted',
   o.order_status='canceled' and o.payment_status='failed' and o.reservation_released_at is not null
   and o.stripe_checkout_session_id is null and o.stripe_payment_intent_id is null and o.provider_order_id is null,
   'attemptId',p_attempt_id);
 end if;
 if o.environment not in('sandbox','production') or o.provider<>'stripe_physical_goods' or o.payment_status<>'pending'
  or o.reservation_released_at is not null then return '{"authorized":false,"aborted":false}'::jsonb; end if;
 if p_action='dispatch' and o.environment='production' then
  if not exists(select 1 from private.merch_checkout_provider_bindings b join private.commerce_tax_checkout_bindings t
   on t.feature='physical_merch' and t.identity_id=b.order_id and t.account_id=b.account_id and t.environment=b.environment
   where b.order_id=o.id and b.environment=o.environment and b.quote=private.merch_checkout_quote(o))
  then return '{"authorized":false,"aborted":false}'::jsonb; end if;
  perform private.assert_merch_live_checkout((select account_id from private.merch_checkout_provider_bindings where order_id=o.id));
  if coalesce((public.bind_commerce_tax_checkout_policy('physical_merch',o.id,o.product_id::text,
    (select account_id from private.merch_checkout_provider_bindings where order_id=o.id),o.environment,'US_all_destinations')->>'ready')::boolean,false) is not true
  then raise exception 'merch_tax_dispatch_unqualified'; end if;
 end if;
 if p_action='dispatch' then
  -- Legacy retry preserves the same owned order and existing <1h window.
  -- No provenance is inserted: historical holds can NEVER be compensated.
  if (d.order_id is not null and d.state not in ('prepared','dispatched')) or o.created_at<=clock_timestamp()-interval '1 hour'
   or not exists(select 1 from private.commerce_tax_checkout_bindings where feature='physical_merch' and identity_id=o.id)
  then return '{"authorized":false,"aborted":false}'::jsonb; end if;
  update private.merch_checkout_dispatch set state='dispatched',dispatched_at=coalesce(dispatched_at,clock_timestamp()) where order_id=o.id;
  return jsonb_build_object('authorized',true,'aborted',false,'orderId',o.id);
 end if;
 -- Only positive durable proof can compensate. An acknowledged dispatch may
 -- have reached Stripe even without any locally stored provider/session ID.
 if d.state<>'prepared' or o.stripe_checkout_session_id is not null or o.stripe_payment_intent_id is not null or o.provider_order_id is not null
 then return '{"authorized":false,"aborted":false}'::jsonb; end if;
 if o.variant_id is not null then
  update public.merch_product_variants set reserved_quantity=reserved_quantity-o.quantity,updated_at=clock_timestamp() where id=o.variant_id;
 end if;
 update public.merch_products set reserved_quantity=reserved_quantity-o.quantity,updated_at=clock_timestamp() where id=o.product_id;
 update public.merch_orders set order_status='canceled',payment_status='failed',reservation_released_at=clock_timestamp(),updated_at=clock_timestamp() where id=o.id;
 update private.merch_checkout_dispatch set state='aborted',aborted_at=clock_timestamp() where order_id=o.id;
 return jsonb_build_object('authorized',false,'aborted',true,'attemptId',p_attempt_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.process_stripe_merch_webhook_lifecycle_before_storefront(p_event_id text, p_event_type text, p_raw_event_hash text, p_facts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_environment text:=case when p_facts->'event_livemode'='true'::jsonb then 'production' when p_facts->'event_livemode'='false'::jsonb then 'sandbox' end;
  v_event public.stripe_merch_events%rowtype;
  v_order public.merch_orders%rowtype;
  v_object_id text := p_facts->>'object_id';
  v_pi text := nullif(p_facts->>'payment_intent_id','');
  v_order_id uuid;
  v_checkout boolean := p_event_type like 'checkout.session.%';
  v_amount bigint;
  v_received bigint;
  v_refunded bigint;
  v_success boolean := false;
  v_failure boolean := false;
  v_pending boolean := false;
  v_reason text := 'unsupported_event';
  v_valid boolean := true;
  v_updated boolean := false;
  v_full_refund boolean;
  v_terminal_refund boolean;
  v_disputed boolean;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]{1,240}$'
    or p_event_type is null or length(p_event_type)>120
    or p_raw_event_hash is null or p_raw_event_hash !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_facts) is distinct from 'object' then
    raise exception 'merch_event_invalid' using errcode='22023';
  end if;
  -- Test-only authority is enforced here as well as in the signed Edge adapter.
  if v_environment is null or p_facts->'object_livemode' is distinct from p_facts->'event_livemode'
    or (v_environment='production' and (p_facts->>'verified_environment' is distinct from v_environment or coalesce(p_facts->>'provider_account_id','') !~ '^acct_[A-Za-z0-9]+$'))
    or nullif(p_facts->>'event_account_id','') is not null then
    return jsonb_build_object('status','ignored','reason','test_environment_required',
      'eventStored',false,'orderUpdated',false,'retryable',false);
  end if;

  -- No provider I/O occurs here. The receipt and financial projection commit
  -- together. A failed transaction cannot acknowledge unfinished order work.
  perform pg_advisory_xact_lock(hashtextextended('stripe_merch_event:'||p_event_id,0));
  insert into public.stripe_merch_events(stripe_event_id,event_type,environment,
    status,object_id,raw_event_hash,metadata)
  values(p_event_id,p_event_type,v_environment,'received',v_object_id,p_raw_event_hash,
    jsonb_build_object('physical_merch_only',true,'live_money_action',false))
  on conflict(stripe_event_id) do nothing;
  select * into strict v_event from public.stripe_merch_events
    where stripe_event_id=p_event_id for update;
  if v_event.event_type is distinct from p_event_type
    or v_event.object_id is distinct from v_object_id
    or v_event.environment <> v_environment
    or (v_event.raw_event_hash is not null and v_event.raw_event_hash <> p_raw_event_hash) then
    raise exception 'merch_event_identity_conflict' using errcode='22023';
  end if;
  if v_event.status in ('processed','ignored') then
    return jsonb_build_object('status','duplicate','reason','event_already_finalized',
      'eventStored',false,'orderUpdated',false,'orderId',v_event.linked_order_id,'retryable',false);
  end if;
  -- Legacy received/failed/duplicate rows are retryable; a verified replay binds
  -- their previously unrecorded body hash. Legacy terminal rows stay terminal.
  update public.stripe_merch_events set raw_event_hash=p_raw_event_hash,
    status='received',processed_at=null where id=v_event.id;

  if p_event_type not in ('checkout.session.completed','checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed','checkout.session.expired',
    'payment_intent.succeeded','payment_intent.payment_failed','charge.refunded','charge.dispute.created') then
    v_valid:=false;
  else
    if nullif(p_facts->>'metadata_order_id','') is not null then
      if p_facts->>'metadata_order_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        v_order_id:=(p_facts->>'metadata_order_id')::uuid;
      else v_valid:=false; v_reason:='order_identity_mismatch'; end if;
    end if;
    if v_valid then
      select * into v_order from public.merch_orders
      where (v_order_id is not null and id=v_order_id)
        or (v_order_id is null and v_checkout and stripe_checkout_session_id=v_object_id)
        or (v_order_id is null and not v_checkout and stripe_payment_intent_id=v_pi)
      for update;
      if not found then
        return jsonb_build_object('status','pending','reason','order_identity_pending',
          'eventStored',true,'orderUpdated',false,'retryable',true);
      end if;
      if v_event.linked_order_id is not null and v_event.linked_order_id <> v_order.id then
        raise exception 'merch_event_identity_conflict' using errcode='22023';
      end if;
      if v_environment='production' and not exists(
       select 1 from private.merch_checkout_provider_bindings b join private.commerce_tax_checkout_bindings t
        on t.feature='physical_merch' and t.identity_id=b.order_id and t.account_id=b.account_id and t.environment=b.environment
       where b.order_id=v_order.id and b.environment=v_environment and b.account_id=p_facts->>'provider_account_id'
        and b.quote=private.merch_checkout_quote(v_order)) then
       raise exception 'merch_live_webhook_binding_mismatch';
      end if;
      v_valid:=coalesce(v_order.provider='stripe_physical_goods' and v_order.environment=v_environment
        and v_order.digital_access_grant_id is null
        and (v_environment<>'production' or not (v_checkout or p_event_type like 'payment_intent.%')
         or (p_facts->>'metadata_environment'=v_environment and p_facts->>'metadata_order_id'=v_order.id::text
          and p_facts->>'metadata_tax_policy_id'=(select policy_id::text from private.commerce_tax_checkout_bindings where feature='physical_merch' and identity_id=v_order.id)))
        and (nullif(p_facts->>'metadata_order_id','') is null or p_facts->>'metadata_order_id'=v_order.id::text)
        and (nullif(p_facts->>'metadata_buyer_id','') is null or p_facts->>'metadata_buyer_id'=v_order.buyer_id::text)
        and (nullif(p_facts->>'metadata_environment','') is null or p_facts->>'metadata_environment'=v_environment)
        and (nullif(p_facts->>'metadata_rail','') is null or p_facts->>'metadata_rail'='physical_merch'),false);
      v_reason:='order_identity_mismatch';
    end if;
    if v_valid then
      -- Only the exact stored Checkout session may bind an initially null PI.
      if v_checkout then
        if v_order.stripe_checkout_session_id is null then
          return jsonb_build_object('status','pending','reason','checkout_identity_pending',
            'eventStored',true,'orderUpdated',false,'orderId',v_order.id,'retryable',true);
        end if;
        v_valid:=v_object_id=v_order.stripe_checkout_session_id and v_object_id like 'cs_test_%'
          and p_facts->>'object_type'='checkout.session' and p_facts->>'mode'='payment'
          and p_facts->>'client_reference_id'=v_order.id::text
          and (v_pi is null or v_pi ~ '^pi_[A-Za-z0-9_]+$')
          and (v_order.stripe_payment_intent_id is null or v_pi=v_order.stripe_payment_intent_id);
      else
        if v_order.stripe_payment_intent_id is null then
          return jsonb_build_object('status','pending','reason','payment_identity_pending',
            'eventStored',true,'orderUpdated',false,'orderId',v_order.id,'retryable',true);
        end if;
        v_valid:=v_pi=v_order.stripe_payment_intent_id and v_pi ~ '^pi_[A-Za-z0-9_]+$';
        if p_event_type like 'payment_intent.%' then
          v_valid:=v_valid and v_object_id=v_pi and p_facts->>'object_type'='payment_intent';
        elsif p_event_type='charge.refunded' then
          v_valid:=v_valid and v_object_id ~ '^ch_[A-Za-z0-9_]+$' and p_facts->>'object_type'='charge'
            and (v_order.stripe_charge_id is null or v_order.stripe_charge_id=v_object_id);
        else
          v_valid:=v_valid and v_object_id ~ '^dp_[A-Za-z0-9_]+$' and p_facts->>'object_type'='dispute'
            and p_facts->>'charge_id' ~ '^ch_[A-Za-z0-9_]+$'
            and (v_order.stripe_charge_id is null or v_order.stripe_charge_id=p_facts->>'charge_id');
        end if;
      end if;
      v_valid:=coalesce(v_valid,false);
    end if;
    if v_valid then
      v_reason:='payment_economics_mismatch';
      if jsonb_typeof(p_facts->'amount_minor')='number' and p_facts->>'amount_minor' ~ '^[0-9]{1,10}$' then
        v_amount:=(p_facts->>'amount_minor')::bigint;
      end if;
      v_valid:=coalesce(v_amount>0 and p_facts->>'currency'=v_order.currency
        and case when p_event_type='charge.dispute.created' then v_amount<=v_order.amount_total_minor
          else v_amount=v_order.amount_total_minor end,false);
    end if;
    if v_valid then
      v_reason:='payment_state_not_confirmed';
      if p_event_type in ('checkout.session.completed','checkout.session.async_payment_succeeded') then
        v_success:=p_facts->>'status'='complete' and p_facts->>'payment_status'='paid' and v_pi is not null;
        v_pending:=p_event_type='checkout.session.completed' and p_facts->>'status'='complete'
          and p_facts->>'payment_status'='unpaid' and v_pi is not null;
        v_valid:=coalesce(v_success or v_pending,false);
      elsif p_event_type='checkout.session.async_payment_failed' then
        v_failure:=p_facts->>'status'='complete' and p_facts->>'payment_status'='unpaid' and v_pi is not null;
        v_valid:=coalesce(v_failure,false);
      elsif p_event_type='checkout.session.expired' then
        v_failure:=p_facts->>'status'='expired' and p_facts->>'payment_status'='unpaid';
        v_valid:=coalesce(v_failure,false);
      elsif p_event_type like 'payment_intent.%' then
        if jsonb_typeof(p_facts->'amount_received_minor')='number'
          and p_facts->>'amount_received_minor' ~ '^[0-9]{1,10}$' then
          v_received:=(p_facts->>'amount_received_minor')::bigint;
        end if;
        v_success:=p_event_type='payment_intent.succeeded' and p_facts->>'status'='succeeded' and v_received=v_amount;
        v_failure:=p_event_type='payment_intent.payment_failed' and p_facts->>'status'='requires_payment_method' and v_received=0;
        v_valid:=coalesce(v_success or v_failure,false);
      elsif p_event_type='charge.refunded' then
        if jsonb_typeof(p_facts->'refunded_amount_minor')='number'
          and p_facts->>'refunded_amount_minor' ~ '^[0-9]{1,10}$' then
          v_refunded:=(p_facts->>'refunded_amount_minor')::bigint;
        end if;
        v_valid:=coalesce(v_refunded>0 and v_refunded<=v_amount
          and p_facts->'refunded'=to_jsonb(v_refunded=v_amount),false);
      end if;
    end if;
  end if;

  if v_valid then
    v_terminal_refund:=v_order.payment_status='refunded' or v_order.order_status='refunded'
      or coalesce(v_order.refunded_amount_minor,0)=v_order.amount_total_minor;
    v_disputed:=v_order.payment_status='disputed' or v_order.order_status='chargeback';
    if v_pending then
      update public.merch_orders set stripe_payment_intent_id=coalesce(stripe_payment_intent_id,v_pi)
        where id=v_order.id;
      v_updated:=v_order.stripe_payment_intent_id is null; v_reason:='payment_pending';
    elsif v_success then
      if not v_terminal_refund and not v_disputed then
        update public.merch_orders set stripe_payment_intent_id=coalesce(stripe_payment_intent_id,v_pi),
          payment_status='paid',order_status=case when order_status='fulfilled' then order_status else 'paid' end,
          fulfillment_status=case when fulfillment_status in ('not_started','pending') then 'processing' else fulfillment_status end,
          paid_at=coalesce(paid_at,v_now) where id=v_order.id;
        v_updated:=true; v_reason:='payment_confirmed';
      else v_reason:='terminal_removal_preserved'; end if;
    elsif v_failure then
      if not v_terminal_refund and not v_disputed and v_order.payment_status<>'paid'
        and v_order.paid_at is null and coalesce(v_order.refunded_amount_minor,0)=0 then
        update public.merch_orders set stripe_payment_intent_id=coalesce(stripe_payment_intent_id,v_pi),
          payment_status='failed',order_status=case when p_event_type='checkout.session.expired' then 'canceled' else 'failed' end,
          canceled_at=case when p_event_type='checkout.session.expired' then coalesce(canceled_at,v_now) else canceled_at end
          where id=v_order.id;
        v_updated:=true; v_reason:='payment_failed';
      else v_reason:='confirmed_or_removed_payment_preserved'; end if;
    elsif p_event_type='charge.refunded' then
      v_refunded:=greatest(coalesce(v_order.refunded_amount_minor,0),v_refunded);
      v_full_refund:=v_refunded=v_amount or v_terminal_refund;
      update public.merch_orders set stripe_charge_id=coalesce(stripe_charge_id,v_object_id),
        refunded_amount_minor=v_refunded,refunded_at=coalesce(refunded_at,v_now),
        payment_status=case when v_disputed then payment_status when v_full_refund then 'refunded' else payment_status end,
        order_status=case when v_disputed then order_status when v_full_refund then 'refunded' else order_status end,
        fulfillment_status=case when not v_full_refund or fulfillment_status in ('shipped','delivered','returned')
          then fulfillment_status when v_disputed then fulfillment_status else 'canceled' end
        where id=v_order.id;
      v_updated:=true; v_reason:=case when v_refunded=v_amount then 'full_refund_recorded' else 'partial_refund_recorded' end;
    elsif p_event_type='charge.dispute.created' then
      update public.merch_orders set stripe_charge_id=coalesce(stripe_charge_id,p_facts->>'charge_id'),
        payment_status='disputed',order_status='chargeback',
        fulfillment_status=case when fulfillment_status in ('shipped','delivered','returned') then fulfillment_status else 'blocked' end
        where id=v_order.id;
      v_updated:=true; v_reason:='dispute_recorded';
    end if;
  end if;

  update public.stripe_merch_events set status=case when v_valid then 'processed' else 'ignored' end,
    linked_order_id=v_order.id,processed_at=v_now,
    metadata=jsonb_build_object('physical_merch_only',true,'live_money_action',false,'processing_reason',v_reason)
    where id=v_event.id;
  return jsonb_build_object('status',case when v_valid then 'processed' else 'ignored' end,
    'reason',v_reason,'eventStored',true,'orderUpdated',v_updated,'orderId',v_order.id,'retryable',false);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_stripe_merch_webhook_before_photo_lock(p_event_id text, p_event_type text, p_raw_event_hash text, p_facts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb; o public.merch_orders%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 -- Reserve/save also lock product before order. Preserve that lock order when
 -- the retained payment lifecycle later locks its exact matched order.
 perform 1 from public.merch_products p where p.id in (
   select m.product_id from public.merch_orders m where m.id::text=p_facts->>'metadata_order_id'
     or m.stripe_checkout_session_id=p_facts->>'object_id'
     or m.stripe_payment_intent_id=p_facts->>'payment_intent_id'
 ) order by p.id for update;
 v_result:=public.process_stripe_merch_webhook_lifecycle_before_storefront(p_event_id,p_event_type,p_raw_event_hash,p_facts);
 if coalesce(v_result->>'status','') not in ('processed','duplicate') then return v_result; end if;
 if p_event_type='checkout.session.expired' and p_facts->>'status'='expired' and p_facts->>'payment_status'='unpaid' then
   select m.* into o from public.merch_orders m join public.stripe_merch_events e on e.linked_order_id=m.id
     where e.stripe_event_id=p_event_id and e.status='processed' and e.raw_event_hash=p_raw_event_hash
       and e.event_type=p_event_type and e.object_id=p_facts->>'object_id' and e.environment=case when p_facts->'event_livemode'='true'::jsonb then 'production' else 'sandbox' end and m.order_status='canceled'
       and m.payment_status='failed' and m.environment=e.environment and m.checkout_attempt_id is not null
       and m.reservation_released_at is null for update of m;
   if found then
     if o.variant_id is not null then
       update public.merch_product_variants set reserved_quantity=reserved_quantity-o.quantity,updated_at=clock_timestamp() where id=o.variant_id;
     end if;
     update public.merch_products set reserved_quantity=reserved_quantity-o.quantity,updated_at=clock_timestamp() where id=o.product_id;
     update public.merch_orders set reservation_released_at=clock_timestamp() where id=o.id;
   end if;
 end if;
 -- Preserve payment truth if delayed success arrives after inventory release.
 -- Reacquire allocation atomically, or block fulfillment for reconciliation;
 -- never claim the payment failed merely because inventory was consumed.
 select m.* into o from public.merch_orders m join public.stripe_merch_events e on e.linked_order_id=m.id
   where e.stripe_event_id=p_event_id and e.status='processed' and e.raw_event_hash=p_raw_event_hash
     and e.event_type=p_event_type and e.object_id=p_facts->>'object_id' and e.environment=case when p_facts->'event_livemode'='true'::jsonb then 'production' else 'sandbox' end and m.payment_status='paid'
     and m.environment=e.environment and m.checkout_attempt_id is not null
     and m.reservation_released_at is not null for update of m;
 if found then
   if o.variant_id is not null and not exists(select 1 from public.merch_product_variants where id=o.variant_id and stock_quantity-reserved_quantity>=o.quantity) then
     update public.merch_orders set fulfillment_status='blocked',updated_at=clock_timestamp() where id=o.id;
     return v_result;
   end if;
   update public.merch_products set reserved_quantity=reserved_quantity+o.quantity,updated_at=clock_timestamp()
     where id=o.product_id and stock_quantity-reserved_quantity>=o.quantity;
   if found then
     if o.variant_id is not null then
       update public.merch_product_variants set reserved_quantity=reserved_quantity+o.quantity,updated_at=clock_timestamp() where id=o.variant_id;
     end if;
     update public.merch_orders set reservation_released_at=null,updated_at=clock_timestamp() where id=o.id;
   else
     update public.merch_orders set fulfillment_status='blocked',updated_at=clock_timestamp() where id=o.id;
   end if;
 end if;
 return v_result;
end $function$
;

CREATE OR REPLACE FUNCTION public.list_my_merch_orders(p_role text DEFAULT 'buyer'::text, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_order_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_items jsonb; v_limit integer:=least(greatest(coalesce(p_limit,20),1),50); v_more boolean; v_before_created timestamptz;
begin
 if not public.whole_app_exact_current_session_authority_internal() then
   raise exception 'merch_current_session_required' using errcode='42501'; end if;
 if p_role is null or p_role not in ('buyer','creator') then raise exception 'merch_role_invalid' using errcode='22023'; end if;
 if p_before_id is not null then
   select created_at into v_before_created from public.merch_orders where id=p_before_id and environment in('sandbox','production')
     and ((p_role='buyer' and buyer_id=auth.uid()) or (p_role='creator' and creator_id=auth.uid()));
   if not found then raise exception 'merch_cursor_unavailable' using errcode='22023'; end if;
 end if;
 select coalesce(jsonb_agg(public.merch_order_projection_internal(o) order by o.created_at desc,o.id desc),'[]'::jsonb)
 into v_items from (select * from public.merch_orders where environment in('sandbox','production')
   and ((p_role='buyer' and buyer_id=auth.uid()) or (p_role='creator' and creator_id=auth.uid()))
   and (p_order_id is null or id=p_order_id) and (p_before_id is null or (created_at,id)<(v_before_created,p_before_id))
   order by created_at desc,id desc limit v_limit+1) o;
 v_more:=jsonb_array_length(v_items)>v_limit;
 if v_more then v_items:=v_items-v_limit; end if;
 return jsonb_build_object('orders',v_items,'nextCursor',case when v_more then v_items->(v_limit-1)->>'id' end);
end $function$
;

CREATE OR REPLACE FUNCTION public.update_creator_merch_fulfillment(p_order_id uuid, p_status text, p_expected_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_order public.merch_orders%rowtype;
begin
 if not public.whole_app_exact_current_session_authority_internal() then raise exception 'merch_current_session_required' using errcode='42501'; end if;
 select * into v_order from public.merch_orders where id=p_order_id and creator_id=auth.uid() for update;
 if not found then raise exception 'merch_order_not_found' using errcode='42501'; end if;
 if v_order.environment not in('sandbox','production') or v_order.payment_status<>'paid' or coalesce(v_order.refunded_amount_minor,0)>0
   or v_order.reservation_released_at is not null then
   raise exception 'merch_fulfillment_not_available' using errcode='22023'; end if;
 if v_order.fulfillment_status is distinct from p_expected_status then raise exception 'merch_order_changed_reload' using errcode='40001'; end if;
 if not ((v_order.fulfillment_status in ('not_started','pending') and p_status='processing')
   or (v_order.fulfillment_status='processing' and p_status in ('shipped','blocked'))
   or (v_order.fulfillment_status='shipped' and p_status='delivered')) then
   raise exception 'merch_fulfillment_transition_invalid' using errcode='22023'; end if;
 update public.merch_orders set fulfillment_status=p_status,updated_at=clock_timestamp()
   where id=p_order_id returning * into v_order;
 return public.merch_order_projection_internal(v_order);
end $function$
;


CREATE OR REPLACE FUNCTION public.get_merch_fulfillment_address(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.merch_orders; result jsonb;
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true then
  raise exception 'merch_shipping_unavailable' using errcode='42501'; end if;
 select * into o from public.merch_orders where id=p_order_id and auth.uid() in (buyer_id,creator_id) for share;
 if not found or o.provider<>'stripe_physical_goods' or o.environment not in('sandbox','production')
  or o.payment_status<>'paid' or coalesce(o.refunded_amount_minor,0)>0
  or o.fulfillment_status in ('blocked','canceled')
  or (auth.uid()=o.creator_id and public.wave1_creator_money_subject_authorized_internal(o.creator_id) is distinct from true)
 then raise exception 'merch_shipping_unavailable' using errcode='42501'; end if;
 if exists(select 1 from private.merch_fulfillment_address_conflicts where order_id=o.id)
  or exists(select 1 from private.merch_checkout_destination_conflicts where order_id=o.id)
 then return jsonb_build_object('status','review_required'); end if;
 select address into result from private.merch_fulfillment_addresses where order_id=o.id;
 if result is null then return jsonb_build_object('status','unavailable'); end if;
 insert into private.merch_fulfillment_address_access(order_id,actor_id) values(o.id,auth.uid())
  on conflict(order_id,actor_id) do update set last_accessed_at=clock_timestamp();
 return jsonb_build_object('status','available','address',result);
end $function$
;

CREATE OR REPLACE FUNCTION public.list_creator_merch_products(p_creator_id uuid, p_manage boolean DEFAULT false, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_items jsonb; v_limit integer:=least(greatest(coalesce(p_limit,20),1),50); v_more boolean;
begin
 if p_manage and p_creator_id is null then p_creator_id:=auth.uid(); end if;
 if not public.whole_app_exact_current_session_authority_internal() then
   raise exception 'merch_current_session_required' using errcode='42501'; end if;
 if p_manage and p_creator_id is distinct from auth.uid() then
   raise exception 'merch_creator_required' using errcode='42501'; end if;
 if not coalesce((public.resolve_platform_visibility_access(p_creator_id::text,auth.uid()::text)->>'allowed')::boolean,false) then
   raise exception 'merch_platform_unavailable' using errcode='42501'; end if;
 select coalesce(jsonb_agg(public.merch_product_projection_internal(p) order by p.id desc),'[]'::jsonb)
 into v_items from (select * from public.merch_products where creator_id=p_creator_id
   and environment in('sandbox','production') and (p_manage or publication_status='published')
   and (p_before_id is null or id<p_before_id) order by id desc limit v_limit+1) p;
 v_more:=jsonb_array_length(v_items)>v_limit;
 if v_more then v_items:=v_items-v_limit; end if;
 return jsonb_build_object('products',v_items,'nextCursor',case when v_more then v_items->(v_limit-1)->>'id' end);
end $function$
;

CREATE OR REPLACE FUNCTION public.merch_order_projection_before_variants(o merch_orders)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',o.id,'creatorId',o.creator_id,'productId',o.product_id,
 'title',coalesce(o.product_title_snapshot,'Physical merch'),'quantity',coalesce(o.quantity,
   (select sum(i.quantity)::integer from public.merch_order_items i where i.order_id=o.id),1),
 'totalMinor',o.amount_total_minor,'currency',o.currency,'paymentStatus',o.payment_status,
 'fulfillmentStatus',o.fulfillment_status,'refundedAmountMinor',o.refunded_amount_minor,
 'createdAt',o.created_at,'updatedAt',o.updated_at,'environment',o.environment,
 'checkoutAttemptId',case when o.buyer_id=auth.uid() then o.checkout_attempt_id end,
 'checkoutExpiresAt',case when o.checkout_attempt_id is not null then o.created_at+interval '1 hour' end,
 'checkoutResumeAvailable',o.buyer_id=auth.uid() and o.checkout_attempt_id is not null
   and (o.environment='sandbox' or (o.environment='production' and private.merch_live_checkout_ready())) and o.payment_status='pending' and o.reservation_released_at is null
   and o.created_at>clock_timestamp()-interval '1 hour'
   and public.merch_seller_ready_internal(o.creator_id)
   and (o.environment='production' or public.has_platform_role(array['owner','operator']) or public.has_active_beta_access())
   and coalesce((public.resolve_platform_visibility_access(o.creator_id::text,auth.uid()::text)->>'allowed')::boolean,false)
   and exists(select 1 from public.merch_products p where p.id=o.product_id and p.publication_status='published'),
 'checkoutResumeReason',case when o.buyer_id is distinct from auth.uid() then 'Only the buyer can resume checkout.'
   when o.payment_status<>'pending' then 'Checkout has ended. This order shows the recorded payment status.'
   when o.checkout_attempt_id is null or o.environment not in('sandbox','production') then 'This order does not support checkout resumption.'
   when o.reservation_released_at is not null then 'This reservation has ended. Refresh the order status before choosing another product.'
   when o.created_at<=clock_timestamp()-interval '1 hour' then 'Checkout has expired. Refresh for payment confirmation; unresolved orders require support reconciliation. Do not start a replacement payment.'
   when o.environment='sandbox' and not (public.has_platform_role(array['owner','operator']) or public.has_active_beta_access()) then 'Checkout is limited to currently approved sandbox testers.'
   when not public.merch_seller_ready_internal(o.creator_id) then 'This creator is not ready to accept orders. Existing order status remains available.'
   when not coalesce((public.resolve_platform_visibility_access(o.creator_id::text,auth.uid()::text)->>'allowed')::boolean,false) then 'This Platform is no longer available to your account. Existing order status remains available.'
   when not exists(select 1 from public.merch_products p where p.id=o.product_id and p.publication_status='published') then 'This listing is paused or unavailable. Existing order status remains available.'
   else 'Resume the same checkout attempt. Returning or canceling does not confirm payment.' end)
$function$
;

create function private.guard_merch_checkout_quote() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from private.merch_checkout_provider_bindings b where b.order_id=old.id
  and (new.id<>old.id or b.quote is distinct from private.merch_checkout_quote(new)))
 then raise exception 'merch_checkout_quote_immutable'; end if;
 return new;
end $$;
create trigger merch_checkout_quote_immutable before update on public.merch_orders
 for each row execute function private.guard_merch_checkout_quote();
revoke all on function private.guard_merch_checkout_quote() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.merch_product_projection_before_variants(p merch_products)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',p.id,'creatorId',p.creator_id,'title',p.title,
 'description',p.description,'imageUrl',p.image_url,'priceMinor',p.price_minor,
 'currency',p.currency,'publicationStatus',p.publication_status,'stockQuantity',p.stock_quantity,
 'availableQuantity',p.stock_quantity-p.reserved_quantity,'environment',p.environment,
 'updatedAt',p.updated_at,'shippingSummary',case when p.environment='production' then 'Physical merchandise. Creator fulfillment and accepted return terms apply.' else 'Sandbox only — no physical shipment.' end,
 'checkoutAvailable',p.publication_status='published' and ((p.status='sandbox' and p.environment='sandbox') or (p.status='active' and p.environment='production' and private.merch_live_checkout_ready()))
   and p.provider='stripe_physical_goods' and p.is_physical_good and not p.creates_digital_access
   and p.currency='usd' and p.price_minor>0 and p.creator_id is not null
   and public.merch_seller_ready_internal(p.creator_id)
   and p.stock_quantity>p.reserved_quantity and p.creator_id is distinct from auth.uid()
   and (p.environment='production' or public.has_platform_role(array['owner','operator']) or public.has_active_beta_access()),
 'checkoutReason',case when not ((p.status='sandbox' and p.environment='sandbox') or (p.status='active' and p.environment='production' and private.merch_live_checkout_ready())) or p.provider<>'stripe_physical_goods'
   or p.is_physical_good is not true or p.creates_digital_access is not false or p.currency<>'usd'
   or p.price_minor is null or p.price_minor<=0 or p.creator_id is null then 'This product is not ready for sandbox checkout.'
   when p.creator_id=auth.uid() then 'Creator preview — you cannot buy your own product.'
   when not public.merch_seller_ready_internal(p.creator_id) then 'This creator is not ready to accept sandbox orders.'
   when p.publication_status<>'published' then 'This listing is not published.'
   when p.stock_quantity<=p.reserved_quantity then 'Sold out or reserved in pending orders.'
   when p.environment='sandbox' and not (public.has_platform_role(array['owner','operator']) or public.has_active_beta_access())
     then 'Checkout is available only to approved sandbox testers. Public sales are not active.'
   when p.environment='production' then 'Physical merchandise checkout. Review the total and shipping terms.' else 'Sandbox test checkout only. No real payment or physical shipment.' end)
$function$
;

CREATE OR REPLACE FUNCTION public.merch_photo_public_access_allowed(p_asset_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select public.whole_app_exact_current_session_authority_internal()
 and not public.is_account_access_restricted(auth.uid()::text)
 and exists(select 1 from public.platform_brand_assets a join public.merch_products p on p.photo_asset_id=a.id
   where a.id=p_asset_id and a.asset_type='merch_product_image' and a.owner_user_id=p.creator_id::text
     and a.storage_provider='supabase' and a.storage_bucket='platform-brand-assets'
     and a.storage_object_key=a.storage_path and p.photo_storage_object_key=a.storage_object_key
     and (storage.foldername(a.storage_path))[1]=a.owner_user_id
     and a.deleted_at is null and a.quarantined_at is null and a.asset_state<>'archived'
     and a.scan_status='clean' and a.moderation_status in ('clean','reported')
     and p.publication_status='published' and p.environment in('sandbox','production')
     and coalesce((public.resolve_platform_visibility_access(p.creator_id::text,auth.uid()::text)->>'allowed')::boolean,false))
$function$
;

CREATE OR REPLACE FUNCTION public.check_creator_merch_photo_target(p_product_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select public.whole_app_exact_current_session_authority_internal()
 and not public.is_account_access_restricted(auth.uid()::text)
 and public.has_active_premium_creator_tool_access(auth.uid()::text)
 and exists(select 1 from public.merch_products where id=p_product_id and creator_id=auth.uid()
   and environment in('sandbox','production') and provider='stripe_physical_goods')
$function$
;

CREATE OR REPLACE FUNCTION public.configure_creator_merch_variants_before_photo_lock(p_product_id uuid, p_variant_mode text, p_variants jsonb, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.merch_products%rowtype; item jsonb; v public.merch_product_variants%rowtype;
 v_ids uuid[]:='{}'; v_id uuid; v_sku text; v_size text; v_color text; v_status text;
 v_stock integer; v_total integer; v_reserved integer;
begin
 if not public.whole_app_exact_current_session_authority_internal() then raise exception 'merch_current_session_required' using errcode='42501'; end if;
 if p_variant_mode is null or p_variant_mode not in ('simple','options')
   or p_variants is null or jsonb_typeof(p_variants)<>'array' then raise exception 'merch_variants_invalid' using errcode='22023'; end if;
 if jsonb_array_length(p_variants)>50 or (p_variant_mode='options' and jsonb_array_length(p_variants)=0) then
   raise exception 'merch_variants_invalid' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('merch_product:'||p_product_id::text,0));
 select * into p from public.merch_products where id=p_product_id and creator_id=auth.uid() for update;
 if not found then raise exception 'merch_product_not_found' using errcode='42501'; end if;
 if p.publication_status='published' then perform public.wave1_assert_current_creator_money_authority_internal(); end if;
 if p.environment not in('sandbox','production') or p.provider<>'stripe_physical_goods' then raise exception 'merch_provider_mode_invalid' using errcode='42501'; end if;
 if p_expected_updated_at is null or p.updated_at is distinct from p_expected_updated_at then raise exception 'merch_product_changed_reload' using errcode='40001'; end if;
 if p.variant_mode<>p_variant_mode and p.reserved_quantity<>0 then raise exception 'merch_variant_mode_has_reserved_stock' using errcode='22023'; end if;
 -- Even released/expired attempts can settle late. Never change their inventory
 -- identity; use a new listing instead. Archive/replenish existing SKUs safely.
 if p.variant_mode<>p_variant_mode and exists(select 1 from public.merch_orders where product_id=p.id and checkout_attempt_id is not null) then
   raise exception 'merch_variant_mode_has_order_history' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_variants) loop
   if jsonb_typeof(item)<>'object' or not coalesce((item->>'id')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
     or not coalesce((item->>'stockQuantity')~'^[0-9]{1,7}$',false)
     or item ? 'priceMinor' or item ? 'price' or item ? 'unitAmount' then
     raise exception 'merch_variants_invalid' using errcode='22023'; end if;
   v_id:=(item->>'id')::uuid; v_stock:=(item->>'stockQuantity')::integer;
   v_sku:=btrim(item->>'sku'); v_size:=nullif(btrim(item->>'size'),''); v_color:=nullif(btrim(item->>'color'),''); v_status:=item->>'status';
   if v_id=any(v_ids) or v_sku is null or length(v_sku) not between 1 and 64
     or (v_size is null and v_color is null) or length(v_size)>60 or length(v_color)>60
     or v_status is null or v_status not in ('active','paused','archived') or v_stock>1000000 then
     raise exception 'merch_variants_invalid' using errcode='22023'; end if;
   v_ids:=array_append(v_ids,v_id);
   select * into v from public.merch_product_variants where id=v_id for update;
   if found then
     if v.product_id<>p.id then raise exception 'merch_variant_not_found' using errcode='42501'; end if;
     if v_stock<v.reserved_quantity then raise exception 'merch_stock_below_reserved' using errcode='22023'; end if;
     update public.merch_product_variants set sku=v_sku,size=v_size,color=v_color,stock_quantity=v_stock,status=v_status,updated_at=clock_timestamp() where id=v_id;
   else
     insert into public.merch_product_variants(id,product_id,sku,size,color,stock_quantity,status)
       values(v_id,p.id,v_sku,v_size,v_color,v_stock,v_status);
   end if;
 end loop;
 if exists(select 1 from public.merch_product_variants where product_id=p.id and not(id=any(v_ids))) then
   raise exception 'merch_variants_archive_instead_of_delete' using errcode='22023'; end if;
 select coalesce(sum(stock_quantity),0)::integer,coalesce(sum(reserved_quantity),0)::integer
 into v_total,v_reserved from public.merch_product_variants where product_id=p.id;
 if v_total>1000000 then raise exception 'merch_variants_stock_limit' using errcode='22023'; end if;
 update public.merch_products set variant_mode=p_variant_mode,
   stock_quantity=case when p_variant_mode='options' then v_total else stock_quantity end,
   reserved_quantity=case when p_variant_mode='options' then v_reserved else reserved_quantity end,
   updated_at=clock_timestamp() where id=p.id returning * into p;
 return public.merch_product_projection_internal(p);
end $function$
;

CREATE OR REPLACE FUNCTION public.read_creator_merch_photo_status(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.merch_products%rowtype;
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true
   or public.is_account_access_restricted(auth.uid()::text) is distinct from false then
   raise exception 'merch_current_session_required' using errcode='42501'; end if;
 select * into p from public.merch_products where id=p_product_id and creator_id=auth.uid() and environment in('sandbox','production');
 if p.id is null then raise exception 'merch_photo_owner_required' using errcode='42501'; end if;
 return public.merch_product_projection_internal(p);
end $function$
;

CREATE OR REPLACE FUNCTION public.save_creator_merch_product_before_variants(p_product_id uuid DEFAULT NULL::uuid, p_title text DEFAULT ''::text, p_description text DEFAULT ''::text, p_image_url text DEFAULT NULL::text, p_price_minor integer DEFAULT 0, p_stock_quantity integer DEFAULT 0, p_publication_status text DEFAULT 'draft'::text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_product public.merch_products%rowtype; v_user uuid;
begin
 v_user:=auth.uid();
 if not public.whole_app_exact_current_session_authority_internal() then
   raise exception 'merch_current_session_required' using errcode='42501'; end if;
 if p_publication_status='published' then perform public.wave1_assert_current_creator_money_authority_internal(); end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 120
   or p_description is null or length(p_description)>2000
   or p_price_minor is null or p_price_minor not between 1 and 1000000
   or p_stock_quantity is null or p_stock_quantity not between 0 and 1000000
   or p_publication_status is null or p_publication_status not in ('draft','published','paused','archived')
   or (nullif(p_image_url,'') is not null and (length(p_image_url)>2048 or p_image_url !~ '^https://[^[:space:]]+$')) then
   raise exception 'merch_product_invalid' using errcode='22023'; end if;
 if p_product_id is null then p_product_id:=gen_random_uuid(); end if;
 perform pg_advisory_xact_lock(hashtextextended('merch_product:'||p_product_id::text,0));
 select * into v_product from public.merch_products where id=p_product_id for update;
 if not found and p_expected_updated_at is null then
   insert into public.merch_products(id,creator_id,display_name,title,description,image_url,price_minor,currency,
     provider,status,fulfillment_model,environment,is_physical_good,creates_digital_access,publication_status,stock_quantity)
   values(p_product_id,v_user,btrim(p_title),btrim(p_title),p_description,nullif(p_image_url,''),p_price_minor,'usd',
     'stripe_physical_goods','sandbox','manual','sandbox',true,false,p_publication_status,p_stock_quantity)
   returning * into v_product;
 else
   if v_product.id is null or v_product.creator_id is distinct from v_user then raise exception 'merch_product_not_found' using errcode='42501'; end if;
   if v_product.environment not in('sandbox','production') or v_product.provider<>'stripe_physical_goods' then
     raise exception 'merch_provider_mode_invalid' using errcode='42501'; end if;
   if p_expected_updated_at is null and v_product.title=btrim(p_title)
     and v_product.description=p_description and v_product.image_url is not distinct from nullif(p_image_url,'')
     and v_product.price_minor=p_price_minor and v_product.stock_quantity=p_stock_quantity
     and v_product.publication_status=p_publication_status then
     return public.merch_product_projection_internal(v_product);
   end if;
   if p_expected_updated_at is null or v_product.updated_at is distinct from p_expected_updated_at then
     raise exception 'merch_product_changed_reload' using errcode='40001'; end if;
   if p_stock_quantity<v_product.reserved_quantity then raise exception 'merch_stock_below_reserved' using errcode='22023'; end if;
   update public.merch_products set title=btrim(p_title),display_name=btrim(p_title),description=p_description,
     image_url=nullif(p_image_url,''),price_minor=p_price_minor,stock_quantity=p_stock_quantity,
     publication_status=p_publication_status,updated_at=clock_timestamp() where id=p_product_id returning * into v_product;
 end if;
 return public.merch_product_projection_internal(v_product);
end $function$
;
