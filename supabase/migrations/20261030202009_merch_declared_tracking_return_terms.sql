-- Prospective explicit shipping declaration. No legacy backfill and no fallback
-- from a temporarily unavailable tracking provider to an untracked purchase.
alter table public.merch_products add column shipping_tracking_mode text
 check(shipping_tracking_mode in ('tracked','untracked'));
alter table public.merch_orders add column shipping_tracking_mode text
 check(shipping_tracking_mode in ('tracked','untracked'));
alter table public.merch_orders drop constraint merch_return_policy_terms_check;
alter table public.merch_orders add constraint merch_return_policy_terms_check check (
 (return_policy_version is null and return_window_days is null and shipping_tracking_mode is null)
 or (return_policy_version='physical_merch_verified_delivery_30d_v1' and return_window_days=30 and shipping_tracking_mode is null)
 or (num_nonnulls(return_policy_version,return_window_days,shipping_tracking_mode)=3 and return_window_days=30
  and ((return_policy_version='physical_merch_declared_tracked_30d_v2' and shipping_tracking_mode='tracked')
   or (return_policy_version='physical_merch_declared_untracked_30d_v2' and shipping_tracking_mode='untracked'))));

create function private.freeze_merch_tracking_declaration() returns trigger language plpgsql set search_path='' as $$
declare mode text;
begin
 if tg_op='UPDATE' then
  if new.shipping_tracking_mode is distinct from old.shipping_tracking_mode then raise exception 'merch_accepted_tracking_mode_immutable'; end if;
 elsif new.provider='stripe_physical_goods' and new.product_id is not null then
  select shipping_tracking_mode into strict mode from public.merch_products where id=new.product_id for share;
  if mode is null then raise exception 'merch_tracking_declaration_required'; end if;
  if new.shipping_tracking_mode is not null and new.shipping_tracking_mode<>mode then raise exception 'merch_tracking_declaration_mismatch'; end if;
  new.shipping_tracking_mode:=mode; new.return_window_days:=30;
  new.return_policy_version:='physical_merch_declared_'||mode||'_30d_v2';
 end if;
 return new;
end;
$$;
revoke all on function private.freeze_merch_tracking_declaration() from public,anon,authenticated,service_role;
-- AFTER the existing prospective v1 BEFORE trigger; legacy rows are untouched.
create trigger zz_freeze_merch_tracking_declaration before insert or update on public.merch_orders
 for each row execute function private.freeze_merch_tracking_declaration();

alter function public.merch_product_projection_internal(public.merch_products) rename to merch_product_projection_before_tracking;
revoke all on function public.merch_product_projection_before_tracking(public.merch_products) from public,anon,authenticated,service_role;
create function public.merch_product_projection_internal(p public.merch_products) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 result:=public.merch_product_projection_before_tracking(p);
 return result||jsonb_build_object('shippingTrackingMode',p.shipping_tracking_mode,
  'checkoutAvailable',coalesce((result->>'checkoutAvailable')::boolean,false) and p.shipping_tracking_mode is not null,
  'checkoutReason',case when p.shipping_tracking_mode is null then 'The creator must declare tracked or untracked shipping before new checkout.' else result->>'checkoutReason' end);
end;
$$;
revoke all on function public.merch_product_projection_internal(public.merch_products) from public,anon,authenticated,service_role;

create function public.save_creator_merch_product_with_tracking(p_product_id uuid,p_title text,p_description text,p_image_url text,
 p_price_minor integer,p_stock_quantity integer,p_publication_status text,p_expected_updated_at timestamptz,p_tracking_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.merch_products; result jsonb;
begin
 if p_tracking_mode is null or p_tracking_mode not in ('tracked','untracked') then raise exception 'merch_tracking_declaration_required'; end if;
 if not public.whole_app_exact_current_session_authority_internal() then raise exception 'merch_current_session_required' using errcode='42501'; end if;
 if p_product_id is not null then
  select * into p from public.merch_products where id=p_product_id for update;
  if p.id is not null and (p.creator_id is distinct from auth.uid() or (p.shipping_tracking_mode is distinct from p_tracking_mode
   and (p_expected_updated_at is null or p.updated_at is distinct from p_expected_updated_at)))
  then raise exception 'merch_product_changed_reload'; end if;
 end if;
 result:=public.save_creator_merch_product(p_product_id,p_title,p_description,p_image_url,p_price_minor,p_stock_quantity,p_publication_status,p_expected_updated_at);
 select * into strict p from public.merch_products where id=(result->>'id')::uuid for update;
 if p.creator_id is distinct from auth.uid() then raise exception 'merch_creator_required'; end if;
 if p.shipping_tracking_mode is distinct from p_tracking_mode then
  update public.merch_products set shipping_tracking_mode=p_tracking_mode,updated_at=clock_timestamp() where id=p.id returning * into p;
 end if;
 return public.merch_product_projection_internal(p);
end;
$$;
revoke all on function public.save_creator_merch_product_with_tracking(uuid,text,text,text,integer,integer,text,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.save_creator_merch_product_with_tracking(uuid,text,text,text,integer,integer,text,timestamptz,text) to authenticated;

-- A caller must submit the declaration actually shown to the buyer. A stale
-- declaration rolls back the reservation and inventory atomically. Retry uses
-- the immutable order declaration, not the creator's current product setting.
create function public.reserve_merch_checkout_for_actor_with_tracking(p_buyer_id uuid,p_session_id uuid,p_product_id uuid,
 p_quantity integer,p_attempt_id uuid,p_variant_id uuid,p_expected_tracking_mode text,p_expected_unit_price integer,p_expected_currency text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; o public.merch_orders;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 result:=public.reserve_merch_checkout_for_actor(p_buyer_id,p_session_id,p_product_id,p_quantity,p_attempt_id,p_variant_id);
 select * into strict o from public.merch_orders where id=(result->>'id')::uuid;
 if o.shipping_tracking_mode is not null and o.shipping_tracking_mode is distinct from p_expected_tracking_mode
 then raise exception 'merch_tracking_declaration_changed'; end if;
 if o.shipping_tracking_mode is not null and (p_expected_unit_price is null or p_expected_unit_price<=0
  or o.amount_subtotal_minor::bigint is distinct from p_expected_unit_price::bigint*o.quantity
  or o.currency is distinct from p_expected_currency)
 then raise exception 'merch_displayed_price_changed'; end if;
 return result||jsonb_build_object('shippingTrackingMode',o.shipping_tracking_mode,'returnPolicyVersion',o.return_policy_version,'returnWindowDays',o.return_window_days);
end;
$$;
revoke all on function public.reserve_merch_checkout_for_actor_with_tracking(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.reserve_merch_checkout_for_actor_with_tracking(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text) to service_role;
revoke all on function public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid,uuid),public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid) from public,anon,authenticated,service_role;

-- Return/dispute clearance remains complete order-wide evidence. An untracked
-- order has no delivery timestamp; absence of carrier data never changes mode.
alter table private.merch_return_evidence alter column delivered_at drop not null;
alter table private.merch_return_evidence drop constraint merch_return_evidence_delivery_state_check;
alter table private.merch_return_evidence add constraint merch_return_evidence_delivery_state_check
 check(delivery_state in ('verified','revoked','not_applicable'));
create or replace function private.guard_merch_return_evidence() returns trigger language plpgsql set search_path='' as $$
declare o public.merch_orders; prior private.merch_return_evidence;
begin
 if tg_op<>'INSERT' then raise exception 'merch_return_evidence_append_only'; end if;
 select * into strict o from public.merch_orders where id=new.order_id for update;
 if o.return_policy_version is null or o.return_policy_version not in ('physical_merch_verified_delivery_30d_v1','physical_merch_declared_tracked_30d_v2','physical_merch_declared_untracked_30d_v2')
  or o.environment<>'sandbox' or o.provider<>'stripe_physical_goods' or new.observed_at>clock_timestamp()
  or (o.shipping_tracking_mode='untracked' and (new.delivered_at is not null or new.delivery_state<>'not_applicable'))
  or (o.shipping_tracking_mode is distinct from 'untracked' and (new.delivered_at is null or new.delivery_state='not_applicable'
   or new.delivered_at<o.created_at or new.delivered_at>new.observed_at))
 then raise exception 'merch_return_evidence_invalid'; end if;
 select * into prior from private.merch_return_evidence where order_id=o.id order by id desc limit 1;
 if prior.id is not null and (new.delivered_at is distinct from prior.delivered_at or new.observed_at<prior.observed_at)
 then raise exception 'merch_return_evidence_identity_or_order_invalid'; end if;
 return new;
end;
$$;
revoke all on function private.guard_merch_return_evidence() from public,anon,authenticated,service_role;

alter function private.merch_return_hold_state(public.merch_orders,timestamptz) rename to merch_return_hold_state_before_tracking;
revoke all on function private.merch_return_hold_state_before_tracking(public.merch_orders,timestamptz) from public,anon,authenticated,service_role;
create function private.merch_return_hold_state(o public.merch_orders,p_as_of timestamptz) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb; legacy public.merch_orders; e private.merch_return_evidence; purchased timestamptz; deadline timestamptz;
 holds text[]:=array[]::text[]; state text;
begin
 if o.shipping_tracking_mode is distinct from 'untracked' then
  legacy:=o;
  if o.shipping_tracking_mode='tracked' then legacy.return_policy_version:='physical_merch_verified_delivery_30d_v1'; end if;
  return private.merch_return_hold_state_before_tracking(legacy,p_as_of)||jsonb_build_object('returnPolicyVersion',o.return_policy_version,
   'shippingTrackingMode',o.shipping_tracking_mode,'verifiedPurchaseAt',null);
 end if;
 purchased:=private.merch_verified_purchase_at(o.id);
 select * into e from private.merch_return_evidence where order_id=o.id order by id desc limit 1;
 if purchased is null or p_as_of is null or purchased>p_as_of then state:='awaiting_verified_purchase'; holds:=array_append(holds,'verified_purchase_required');
 else
  deadline:=purchased+interval '720 hours';
  if p_as_of<deadline then state:='open'; holds:=array_append(holds,'merch_return_window_open'); else state:='elapsed'; end if;
 end if;
 if e.id is null or e.observed_at>p_as_of or e.return_state='unknown' then holds:=array_append(holds,'merch_return_clearance_unknown');
 elsif e.return_state='open' then holds:=array_append(holds,'merch_return_unresolved'); end if;
 if e.id is null or e.observed_at>p_as_of or e.dispute_state='unknown' then holds:=array_append(holds,'merch_dispute_clearance_unknown');
 elsif e.dispute_state='open' then holds:=array_append(holds,'merch_dispute_unresolved'); end if;
 if o.payment_status='disputed' then holds:=array_append(holds,'merch_dispute_unresolved'); end if;
 if state='elapsed' and cardinality(holds)>0 then state:='review_required'; end if;
 return jsonb_build_object('returnPolicyVersion',o.return_policy_version,'returnWindowDays',o.return_window_days,'shippingTrackingMode',o.shipping_tracking_mode,
  'verifiedDeliveryAt',null,'verifiedPurchaseAt',purchased,'returnWindowEndsAt',deadline,'returnWindowStatus',state,'returnHoldReasons',holds,'financialAuthority',false);
end;
$$;
revoke all on function private.merch_return_hold_state(public.merch_orders,timestamptz) from public,anon,authenticated,service_role;

alter function public.merch_order_projection_internal(public.merch_orders) rename to merch_order_projection_before_declared_price;
revoke all on function public.merch_order_projection_before_declared_price(public.merch_orders) from public,anon,authenticated,service_role;
create function public.merch_order_projection_internal(o public.merch_orders) returns jsonb language sql stable set search_path='' as $$
 select public.merch_order_projection_before_declared_price(o)||jsonb_build_object('unitPriceMinor',
  case when o.quantity>0 then o.amount_subtotal_minor/o.quantity else null end);
$$;
revoke all on function public.merch_order_projection_internal(public.merch_orders) from public,anon,authenticated,service_role;
