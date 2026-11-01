-- Prospective provenance only. Null provider IDs are NOT proof of no dispatch.
-- Old Edge deployments fail closed after this migration; deploy the matching
-- Edge source before authorizing any future sandbox activity. No flag changes.
create table private.merch_checkout_dispatch (
 order_id uuid primary key references public.merch_orders(id),
 state text not null check(state in ('prepared','dispatched','aborted')),
 prepared_at timestamptz not null default clock_timestamp(),
 dispatched_at timestamptz, aborted_at timestamptz
);
alter table private.merch_checkout_dispatch enable row level security;
alter table private.merch_checkout_dispatch force row level security;
revoke all on private.merch_checkout_dispatch from public,anon,authenticated,service_role;

create function public.reserve_merch_checkout_dispatch(p_buyer_id uuid,p_session_id uuid,p_product_id uuid,
 p_quantity integer,p_attempt_id uuid,p_variant_id uuid,p_expected_tracking_mode text,p_expected_unit_price integer,p_expected_currency text)
returns jsonb language plpgsql security definer set search_path='' as $$
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
 return result;
end $$;
revoke all on function public.reserve_merch_checkout_for_actor_with_tracking(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text) from service_role;
revoke all on function public.reserve_merch_checkout_dispatch(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.reserve_merch_checkout_dispatch(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text) to service_role;

-- Validate the current exact subject/session even on cleanup, rather than
-- trusting a request-body actor or the session that originally made the hold.
create function private.assert_merch_checkout_actor(p_buyer_id uuid,p_session_id uuid) returns void
language plpgsql set search_path='' as $$
declare claims text:=current_setting('request.jwt.claims',true); role_claim text:=current_setting('request.jwt.claim.role',true); valid boolean;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_buyer_id,'role','authenticated','session_id',p_session_id)::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 valid:=public.whole_app_exact_current_session_authority_internal();
 perform set_config('request.jwt.claims',coalesce(claims,''),true);
 perform set_config('request.jwt.claim.role',coalesce(role_claim,''),true);
 if valid is distinct from true then raise exception 'merch_current_session_required'; end if;
end $$;
revoke all on function private.assert_merch_checkout_actor(uuid,uuid) from public,anon,authenticated,service_role;

create function public.transition_merch_checkout_dispatch(p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid,p_action text,p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
 if o.environment<>'sandbox' or o.provider<>'stripe_physical_goods' or o.payment_status<>'pending'
  or o.reservation_released_at is not null then return '{"authorized":false,"aborted":false}'::jsonb; end if;
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
end $$;
revoke all on function public.transition_merch_checkout_dispatch(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.transition_merch_checkout_dispatch(uuid,uuid,uuid,text,jsonb) to service_role;
