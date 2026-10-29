begin;

-- Physical sandbox catalog. Publication never activates production payments.
alter table public.merch_products
  add column publication_status text not null default 'draft'
    check (publication_status in ('draft','published','paused','archived')),
  add column stock_quantity integer not null default 0 check (stock_quantity between 0 and 1000000),
  add column reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  add constraint merch_stock_reservation_check check (reserved_quantity <= stock_quantity);
alter table public.merch_orders
  add column checkout_attempt_id uuid,
  add column product_title_snapshot text,
  add column reservation_released_at timestamptz,
  add column quantity integer check (quantity between 1 and 10);
create unique index merch_checkout_buyer_attempt on public.merch_orders(buyer_id,checkout_attempt_id)
  where checkout_attempt_id is not null;
create index merch_creator_publication_page on public.merch_products(creator_id,publication_status,id desc);
create index merch_buyer_recent_page on public.merch_orders(buyer_id,created_at desc,id desc);
create index merch_creator_recent_page on public.merch_orders(creator_id,created_at desc,id desc);

-- Same seller predicates as wave1_enforce_creator_money_exposure, evaluated
-- against the seller rather than impersonating the browsing buyer.
create function public.merch_seller_ready_internal(p_creator_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.wave1_creator_money_subject_authorized_internal(p_creator_id)
$$;
revoke all on function public.merch_seller_ready_internal(uuid) from public,anon,authenticated,service_role;

create function public.merch_product_projection_internal(p public.merch_products)
returns jsonb language sql stable set search_path = '' as $$
 select jsonb_build_object('id',p.id,'creatorId',p.creator_id,'title',p.title,
 'description',p.description,'imageUrl',p.image_url,'priceMinor',p.price_minor,
 'currency',p.currency,'publicationStatus',p.publication_status,'stockQuantity',p.stock_quantity,
 'availableQuantity',p.stock_quantity-p.reserved_quantity,'environment',p.environment,
 'updatedAt',p.updated_at,'shippingSummary','Sandbox only — no physical shipment. US manual fulfillment is not live.',
 'checkoutAvailable',p.publication_status='published' and p.status='sandbox' and p.environment='sandbox'
   and p.provider='stripe_physical_goods' and p.is_physical_good and not p.creates_digital_access
   and p.currency='usd' and p.price_minor>0 and p.creator_id is not null
   and public.merch_seller_ready_internal(p.creator_id)
   and p.stock_quantity>p.reserved_quantity and p.creator_id is distinct from auth.uid()
   and (public.has_platform_role(array['owner','operator']) or public.has_active_beta_access()),
 'checkoutReason',case when p.status<>'sandbox' or p.environment<>'sandbox' or p.provider<>'stripe_physical_goods'
   or p.is_physical_good is not true or p.creates_digital_access is not false or p.currency<>'usd'
   or p.price_minor is null or p.price_minor<=0 or p.creator_id is null then 'This product is not ready for sandbox checkout.'
   when p.creator_id=auth.uid() then 'Creator preview — you cannot buy your own product.'
   when not public.merch_seller_ready_internal(p.creator_id) then 'This creator is not ready to accept sandbox orders.'
   when p.publication_status<>'published' then 'This listing is not published.'
   when p.stock_quantity<=p.reserved_quantity then 'Sold out or reserved in pending orders.'
   when not (public.has_platform_role(array['owner','operator']) or public.has_active_beta_access())
     then 'Checkout is available only to approved sandbox testers. Public sales are not active.'
   else 'Sandbox test checkout only. No real payment or physical shipment.' end)
$$;
revoke all on function public.merch_product_projection_internal(public.merch_products) from public,anon,authenticated;

create function public.list_creator_merch_products(p_creator_id uuid,p_manage boolean default false,
 p_before_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
   and environment='sandbox' and (p_manage or publication_status='published')
   and (p_before_id is null or id<p_before_id) order by id desc limit v_limit+1) p;
 v_more:=jsonb_array_length(v_items)>v_limit;
 if v_more then v_items:=v_items-v_limit; end if;
 return jsonb_build_object('products',v_items,'nextCursor',case when v_more then v_items->(v_limit-1)->>'id' end);
end $$;

create function public.save_creator_merch_product(p_product_id uuid default null,p_title text default '',
 p_description text default '',p_image_url text default null,p_price_minor integer default 0,
 p_stock_quantity integer default 0,p_publication_status text default 'draft',p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
   if v_product.environment<>'sandbox' or v_product.provider<>'stripe_physical_goods' then
     raise exception 'merch_sandbox_only' using errcode='42501'; end if;
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
end $$;

create function public.merch_order_projection_internal(o public.merch_orders)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',o.id,'creatorId',o.creator_id,'productId',o.product_id,
 'title',coalesce(o.product_title_snapshot,'Physical merch'),'quantity',coalesce(o.quantity,
   (select sum(i.quantity)::integer from public.merch_order_items i where i.order_id=o.id),1),
 'totalMinor',o.amount_total_minor,'currency',o.currency,'paymentStatus',o.payment_status,
 'fulfillmentStatus',o.fulfillment_status,'refundedAmountMinor',o.refunded_amount_minor,
 'createdAt',o.created_at,'updatedAt',o.updated_at,'environment',o.environment,
 'checkoutAttemptId',case when o.buyer_id=auth.uid() then o.checkout_attempt_id end,
 'checkoutExpiresAt',case when o.checkout_attempt_id is not null then o.created_at+interval '1 hour' end,
 'checkoutResumeAvailable',o.buyer_id=auth.uid() and o.checkout_attempt_id is not null
   and o.environment='sandbox' and o.payment_status='pending' and o.reservation_released_at is null
   and o.created_at>clock_timestamp()-interval '1 hour'
   and public.merch_seller_ready_internal(o.creator_id)
   and (public.has_platform_role(array['owner','operator']) or public.has_active_beta_access())
   and coalesce((public.resolve_platform_visibility_access(o.creator_id::text,auth.uid()::text)->>'allowed')::boolean,false)
   and exists(select 1 from public.merch_products p where p.id=o.product_id and p.publication_status='published'),
 'checkoutResumeReason',case when o.buyer_id is distinct from auth.uid() then 'Only the buyer can resume checkout.'
   when o.payment_status<>'pending' then 'Checkout has ended. This order shows the recorded payment status.'
   when o.checkout_attempt_id is null or o.environment<>'sandbox' then 'This order does not support sandbox checkout resumption.'
   when o.reservation_released_at is not null then 'This reservation has ended. Refresh the order status before choosing another product.'
   when o.created_at<=clock_timestamp()-interval '1 hour' then 'Checkout has expired. Refresh for payment confirmation; unresolved orders require support reconciliation. Do not start a replacement payment.'
   when not (public.has_platform_role(array['owner','operator']) or public.has_active_beta_access()) then 'Checkout is limited to currently approved sandbox testers.'
   when not public.merch_seller_ready_internal(o.creator_id) then 'This creator is not ready to accept sandbox orders. Existing order status remains available.'
   when not coalesce((public.resolve_platform_visibility_access(o.creator_id::text,auth.uid()::text)->>'allowed')::boolean,false) then 'This Platform is no longer available to your account. Existing order status remains available.'
   when not exists(select 1 from public.merch_products p where p.id=o.product_id and p.publication_status='published') then 'This listing is paused or unavailable. Existing order status remains available.'
   else 'Resume the same sandbox checkout attempt. Returning or canceling does not confirm payment.' end)
$$;
revoke all on function public.merch_order_projection_internal(public.merch_orders) from public,anon,authenticated;

create function public.list_my_merch_orders(p_role text default 'buyer',p_before_id uuid default null,
 p_limit integer default 20,p_order_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb; v_limit integer:=least(greatest(coalesce(p_limit,20),1),50); v_more boolean; v_before_created timestamptz;
begin
 if not public.whole_app_exact_current_session_authority_internal() then
   raise exception 'merch_current_session_required' using errcode='42501'; end if;
 if p_role is null or p_role not in ('buyer','creator') then raise exception 'merch_role_invalid' using errcode='22023'; end if;
 if p_before_id is not null then
   select created_at into v_before_created from public.merch_orders where id=p_before_id and environment='sandbox'
     and ((p_role='buyer' and buyer_id=auth.uid()) or (p_role='creator' and creator_id=auth.uid()));
   if not found then raise exception 'merch_cursor_unavailable' using errcode='22023'; end if;
 end if;
 select coalesce(jsonb_agg(public.merch_order_projection_internal(o) order by o.created_at desc,o.id desc),'[]'::jsonb)
 into v_items from (select * from public.merch_orders where environment='sandbox'
   and ((p_role='buyer' and buyer_id=auth.uid()) or (p_role='creator' and creator_id=auth.uid()))
   and (p_order_id is null or id=p_order_id) and (p_before_id is null or (created_at,id)<(v_before_created,p_before_id))
   order by created_at desc,id desc limit v_limit+1) o;
 v_more:=jsonb_array_length(v_items)>v_limit;
 if v_more then v_items:=v_items-v_limit; end if;
 return jsonb_build_object('orders',v_items,'nextCursor',case when v_more then v_items->(v_limit-1)->>'id' end);
end $$;

create function public.update_creator_merch_fulfillment(p_order_id uuid,p_status text,p_expected_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.merch_orders%rowtype;
begin
 if not public.whole_app_exact_current_session_authority_internal() then raise exception 'merch_current_session_required' using errcode='42501'; end if;
 select * into v_order from public.merch_orders where id=p_order_id and creator_id=auth.uid() for update;
 if not found then raise exception 'merch_order_not_found' using errcode='42501'; end if;
 if v_order.environment<>'sandbox' or v_order.payment_status<>'paid' or coalesce(v_order.refunded_amount_minor,0)>0
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
end $$;

-- Internal worker called only by the service wrapper after Edge verifies the
-- buyer's original JWT; callers cannot reserve stock directly as authenticated.
-- Reserve once per attempt. Pending/failed orders retain allocation: refund/cancel does
-- not prove stock was returned and must not silently make stock sellable again.
create function public.reserve_merch_checkout(p_product_id uuid,p_quantity integer,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.merch_products%rowtype; o public.merch_orders%rowtype;
begin
 if not public.whole_app_exact_current_session_authority_internal() then raise exception 'merch_current_session_required' using errcode='42501'; end if;
 if not (public.has_platform_role(array['owner','operator']) or public.has_active_beta_access()) then
   raise exception 'sandbox_tester_required' using errcode='42501'; end if;
 if p_attempt_id is null or p_quantity is null or p_quantity not between 1 and 10 then raise exception 'merch_checkout_invalid' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_attempt_id::text,0));
 select * into p from public.merch_products where id=p_product_id for update;
 if not found or p.environment<>'sandbox' or p.status<>'sandbox' or p.provider<>'stripe_physical_goods'
   or p.publication_status<>'published' or p.is_physical_good is not true or p.creates_digital_access is not false
   or p.currency<>'usd' or p.price_minor is null or p.price_minor<=0 or p.creator_id is null or p.creator_id=auth.uid() then
   raise exception 'merch_product_unavailable' using errcode='42501'; end if;
 if not coalesce((public.resolve_platform_visibility_access(p.creator_id::text,auth.uid()::text)->>'allowed')::boolean,false) then
   raise exception 'merch_platform_unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('wave1-creator:'||p.creator_id::text,0));
 perform 1 from public.wave1_creator_eligibility where creator_user_id=p.creator_id for share;
 perform 1 from public.wave1_legal_document_versions where market='UNITED_STATES' for share;
 perform 1 from public.wave1_legal_acceptances where user_id=p.creator_id and invalidated_at is null for share;
 if not public.merch_seller_ready_internal(p.creator_id) then raise exception 'merch_creator_not_ready' using errcode='42501'; end if;
 select * into o from public.merch_orders where buyer_id=auth.uid() and checkout_attempt_id=p_attempt_id;
 if found then
   if o.product_id is distinct from p_product_id or o.quantity is distinct from p_quantity then raise exception 'merch_attempt_conflict' using errcode='22023'; end if;
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
   update public.merch_products set reserved_quantity=reserved_quantity+p_quantity,updated_at=clock_timestamp() where id=p.id;
   insert into public.merch_orders(product_id,buyer_id,creator_id,provider,environment,order_status,
     fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,shipping_required,
     checkout_attempt_id,product_title_snapshot,quantity)
   values(p.id,auth.uid(),p.creator_id,'stripe_physical_goods','sandbox','pending','not_started','pending',
     p.price_minor*p_quantity,p.price_minor*p_quantity,p.currency,true,p_attempt_id,p.title,p_quantity) returning * into o;
   insert into public.merch_order_items(order_id,product_id,quantity,unit_amount_minor,currency)
     values(o.id,p.id,p_quantity,p.price_minor,p.currency);
 end if;
 return jsonb_build_object('id',o.id,'title',o.product_title_snapshot,'priceMinor',o.amount_subtotal_minor/o.quantity,
   'currency',o.currency,'createdAt',o.created_at);
end $$;

-- The Edge adapter verifies the original JWT and obtains this exact session
-- from authority readback. Neither buyer id nor session comes from its body.
create function public.reserve_merch_checkout_for_actor(p_buyer_id uuid,p_session_id uuid,
 p_product_id uuid,p_quantity integer,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_claims text:=current_setting('request.jwt.claims',true);
 v_role text:=current_setting('request.jwt.claim.role',true); v_result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_buyer_id,'role','authenticated','session_id',p_session_id)::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 -- Serialize one buyer's holds too, so concurrent products cannot evade the cap.
 perform pg_advisory_xact_lock(hashtextextended('merch_buyer:'||p_buyer_id::text,0));
 v_result:=public.reserve_merch_checkout(p_product_id,p_quantity,p_attempt_id);
 perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
 perform set_config('request.jwt.claim.role',coalesce(v_role,''),true);
 return v_result;
end $$;
revoke all on function public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid) to service_role;

-- Retain the settled-money implementation and add inventory release only for
-- its verified expired/unpaid projection. Browser return never releases stock.
alter function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb)
 rename to process_stripe_merch_webhook_lifecycle_before_storefront;
revoke all on function public.process_stripe_merch_webhook_lifecycle_before_storefront(text,text,text,jsonb)
 from public,anon,authenticated,service_role;
create function public.process_stripe_merch_webhook_lifecycle(p_event_id text,p_event_type text,p_raw_event_hash text,p_facts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
       and e.event_type=p_event_type and e.object_id=p_facts->>'object_id' and e.environment='sandbox' and m.order_status='canceled'
       and m.payment_status='failed' and m.environment='sandbox' and m.checkout_attempt_id is not null
       and m.reservation_released_at is null for update of m;
   if found then
     update public.merch_products set reserved_quantity=reserved_quantity-o.quantity,updated_at=clock_timestamp() where id=o.product_id;
     update public.merch_orders set reservation_released_at=clock_timestamp() where id=o.id;
   end if;
 end if;
 -- Preserve payment truth if delayed success arrives after inventory release.
 -- Reacquire allocation atomically, or block fulfillment for reconciliation;
 -- never claim the payment failed merely because inventory was consumed.
 select m.* into o from public.merch_orders m join public.stripe_merch_events e on e.linked_order_id=m.id
   where e.stripe_event_id=p_event_id and e.status='processed' and e.raw_event_hash=p_raw_event_hash
     and e.event_type=p_event_type and e.object_id=p_facts->>'object_id' and e.environment='sandbox' and m.payment_status='paid'
     and m.environment='sandbox' and m.checkout_attempt_id is not null
     and m.reservation_released_at is not null for update of m;
 if found then
   update public.merch_products set reserved_quantity=reserved_quantity+o.quantity,updated_at=clock_timestamp()
     where id=o.product_id and stock_quantity-reserved_quantity>=o.quantity;
   if found then
     update public.merch_orders set reservation_released_at=null,updated_at=clock_timestamp() where id=o.id;
   else
     update public.merch_orders set fulfillment_status='blocked',updated_at=clock_timestamp() where id=o.id;
   end if;
 end if;
 return v_result;
end $$;
revoke all on function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) to service_role;

revoke all on function public.list_creator_merch_products(uuid,boolean,uuid,integer) from public,anon;
revoke all on function public.save_creator_merch_product(uuid,text,text,text,integer,integer,text,timestamptz) from public,anon;
revoke all on function public.list_my_merch_orders(text,uuid,integer,uuid) from public,anon;
revoke all on function public.update_creator_merch_fulfillment(uuid,text,text) from public,anon;
revoke all on function public.reserve_merch_checkout(uuid,integer,uuid) from public,anon;
grant execute on function public.list_creator_merch_products(uuid,boolean,uuid,integer),
 public.save_creator_merch_product(uuid,text,text,text,integer,integer,text,timestamptz),
 public.list_my_merch_orders(text,uuid,integer,uuid),public.update_creator_merch_fulfillment(uuid,text,text) to authenticated;
revoke all on function public.reserve_merch_checkout(uuid,integer,uuid) from authenticated,service_role;
commit;
