begin;

-- Optional physical size/color choices. Existing simple inventory is unchanged.
alter table public.merch_products add column variant_mode text not null default 'simple'
  check (variant_mode in ('simple','options'));
create table public.merch_product_variants (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.merch_products(id),
 sku text not null check (length(sku) between 1 and 64 and sku=btrim(sku)),
 size text check (length(size) between 1 and 60 and size=btrim(size)),
 color text check (length(color) between 1 and 60 and color=btrim(color)),
 stock_quantity integer not null check (stock_quantity between 0 and 1000000),
 reserved_quantity integer not null default 0 check (reserved_quantity>=0 and reserved_quantity<=stock_quantity),
 status text not null default 'active' check (status in ('active','paused','archived')),
 updated_at timestamptz not null default clock_timestamp(),
 check (size is not null or color is not null),
 unique(product_id,id)
);
create unique index merch_variant_product_sku on public.merch_product_variants(product_id,lower(sku));
create unique index merch_variant_product_options on public.merch_product_variants(product_id,lower(coalesce(size,'')),lower(coalesce(color,'')));
alter table public.merch_product_variants enable row level security;
alter table public.merch_product_variants force row level security;
-- Catalog and mutations use exact-session RPCs, not raw table access.
revoke all on public.merch_product_variants from public,anon,authenticated,service_role;
alter table public.merch_orders
 add column variant_id uuid,
 add column sku_snapshot text,
 add column size_snapshot text,
 add column color_snapshot text,
 add constraint merch_order_variant_product_fk foreign key(product_id,variant_id)
   references public.merch_product_variants(product_id,id);

alter function public.merch_product_projection_internal(public.merch_products)
 rename to merch_product_projection_before_variants;
revoke all on function public.merch_product_projection_before_variants(public.merch_products) from public,anon,authenticated,service_role;
create function public.merch_product_projection_internal(p public.merch_products)
returns jsonb language plpgsql stable set search_path='' as $$
declare j jsonb; v_available integer; v_variants jsonb;
begin
 j:=public.merch_product_projection_before_variants(p);
 select coalesce(sum(stock_quantity-reserved_quantity) filter(where status='active'),0)::integer,
 coalesce(jsonb_agg(jsonb_build_object('id',id,'sku',sku,'size',size,'color',color,
   'stockQuantity',stock_quantity,'availableQuantity',stock_quantity-reserved_quantity,
   'status',status,'updatedAt',updated_at) order by lower(coalesce(size,'')),lower(coalesce(color,'')),id)
   filter(where p.creator_id=auth.uid() or status='active'),'[]'::jsonb)
 into v_available,v_variants from public.merch_product_variants where product_id=p.id;
 j:=j||jsonb_build_object('variantMode',p.variant_mode,'variants',case when p.variant_mode='options' or p.creator_id=auth.uid() then v_variants else '[]'::jsonb end);
 if p.variant_mode='options' then
   j:=j||jsonb_build_object('availableQuantity',v_available,
     'checkoutAvailable',coalesce((j->>'checkoutAvailable')::boolean,false) and v_available>0);
   if v_available=0 then j:=j||jsonb_build_object('checkoutReason','All size/color options are sold out or unavailable.'); end if;
 end if;
 return j;
end $$;
revoke all on function public.merch_product_projection_internal(public.merch_products) from public,anon,authenticated,service_role;

-- Batch replaces configuration, not history: all existing ids must be retained.
-- The product lock serializes owner edits with every reservation and webhook.
create function public.configure_creator_merch_variants(p_product_id uuid,p_variant_mode text,
 p_variants jsonb,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
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
 if p.environment<>'sandbox' or p.provider<>'stripe_physical_goods' then raise exception 'merch_sandbox_only' using errcode='42501'; end if;
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
end $$;
revoke all on function public.configure_creator_merch_variants(uuid,text,jsonb,timestamptz) from public,anon,service_role;
grant execute on function public.configure_creator_merch_variants(uuid,text,jsonb,timestamptz) to authenticated;

-- Keep the stable simple-product save API. Option stock is only changed by the
-- explicit batch above; stale form stock never overwrites per-SKU allocations.
alter function public.save_creator_merch_product(uuid,text,text,text,integer,integer,text,timestamptz)
 rename to save_creator_merch_product_before_variants;
revoke all on function public.save_creator_merch_product_before_variants(uuid,text,text,text,integer,integer,text,timestamptz) from public,anon,authenticated,service_role;
create function public.save_creator_merch_product(p_product_id uuid default null,p_title text default '',
 p_description text default '',p_image_url text default null,p_price_minor integer default 0,
 p_stock_quantity integer default 0,p_publication_status text default 'draft',p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.merch_products%rowtype;
begin
 if not public.whole_app_exact_current_session_authority_internal() then raise exception 'merch_current_session_required' using errcode='42501'; end if;
 if p_product_id is not null then
   perform pg_advisory_xact_lock(hashtextextended('merch_product:'||p_product_id::text,0));
   select * into p from public.merch_products where id=p_product_id and creator_id=auth.uid() for update;
   if found and p.variant_mode='options' then p_stock_quantity:=p.stock_quantity; end if;
 end if;
 return public.save_creator_merch_product_before_variants(p_product_id,p_title,p_description,p_image_url,p_price_minor,p_stock_quantity,p_publication_status,p_expected_updated_at);
end $$;
revoke all on function public.save_creator_merch_product(uuid,text,text,text,integer,integer,text,timestamptz) from public,anon,service_role;
grant execute on function public.save_creator_merch_product(uuid,text,text,text,integer,integer,text,timestamptz) to authenticated;

alter function public.merch_order_projection_internal(public.merch_orders) rename to merch_order_projection_before_variants;
revoke all on function public.merch_order_projection_before_variants(public.merch_orders) from public,anon,authenticated,service_role;
create function public.merch_order_projection_internal(o public.merch_orders)
returns jsonb language plpgsql stable set search_path='' as $$
declare j jsonb;
begin
 j:=public.merch_order_projection_before_variants(o)||jsonb_build_object('variantId',o.variant_id,'sku',o.sku_snapshot,'size',o.size_snapshot,'color',o.color_snapshot);
 if coalesce((j->>'checkoutResumeAvailable')::boolean,false) and o.variant_id is not null
   and not exists(select 1 from public.merch_product_variants where id=o.variant_id and status='active') then
   j:=j||jsonb_build_object('checkoutResumeAvailable',false,'checkoutResumeReason','This size/color option is paused or archived. Existing order status remains available.');
 end if;
 return j;
end $$;
revoke all on function public.merch_order_projection_internal(public.merch_orders) from public,anon,authenticated,service_role;

-- Preserve exact old signatures as simple-only adapters; option calls use the
-- explicit final parameter. No direct caller can choose a buyer/session.
create function public.reserve_merch_checkout(p_product_id uuid,p_quantity integer,p_attempt_id uuid,p_variant_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.merch_products%rowtype; o public.merch_orders%rowtype; v public.merch_product_variants%rowtype;
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
 if p.variant_mode='options' then
   select * into v from public.merch_product_variants where id=p_variant_id and product_id=p.id for update;
   if not found or v.status<>'active' then raise exception 'merch_variant_unavailable' using errcode='22023'; end if;
 elsif p_variant_id is not null then raise exception 'merch_variant_not_expected' using errcode='22023';
 end if;
 select * into o from public.merch_orders where buyer_id=auth.uid() and checkout_attempt_id=p_attempt_id;
 if found then
   if o.product_id is distinct from p_product_id or o.quantity is distinct from p_quantity or o.variant_id is distinct from p_variant_id then raise exception 'merch_attempt_conflict' using errcode='22023'; end if;
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
   values(p.id,auth.uid(),p.creator_id,'stripe_physical_goods','sandbox','pending','not_started','pending',
     p.price_minor*p_quantity,p.price_minor*p_quantity,p.currency,true,p_attempt_id,p.title,p_quantity,v.id,v.sku,v.size,v.color) returning * into o;
   insert into public.merch_order_items(order_id,product_id,quantity,unit_amount_minor,currency)
     values(o.id,p.id,p_quantity,p.price_minor,p.currency);
 end if;
 return jsonb_build_object('id',o.id,'title',o.product_title_snapshot,'priceMinor',o.amount_subtotal_minor/o.quantity,
   'currency',o.currency,'createdAt',o.created_at,'variantId',o.variant_id,'sku',o.sku_snapshot,'size',o.size_snapshot,'color',o.color_snapshot);
end $$;


revoke all on function public.reserve_merch_checkout(uuid,integer,uuid,uuid) from public,anon,authenticated,service_role;
create function public.reserve_merch_checkout_for_actor(p_buyer_id uuid,p_session_id uuid,
 p_product_id uuid,p_quantity integer,p_attempt_id uuid,p_variant_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_claims text:=current_setting('request.jwt.claims',true);
 v_role text:=current_setting('request.jwt.claim.role',true); v_result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_buyer_id,'role','authenticated','session_id',p_session_id)::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 -- Serialize one buyer's holds too, so concurrent products cannot evade the cap.
 perform pg_advisory_xact_lock(hashtextextended('merch_buyer:'||p_buyer_id::text,0));
 v_result:=public.reserve_merch_checkout(p_product_id,p_quantity,p_attempt_id,p_variant_id);
 perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
 perform set_config('request.jwt.claim.role',coalesce(v_role,''),true);
 return v_result;
end $$;
revoke all on function public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid,uuid) to service_role;

create or replace function public.reserve_merch_checkout(p_product_id uuid,p_quantity integer,p_attempt_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select public.reserve_merch_checkout(p_product_id,p_quantity,p_attempt_id,null::uuid)
$$;
revoke all on function public.reserve_merch_checkout(uuid,integer,uuid) from public,anon,authenticated,service_role;
create or replace function public.reserve_merch_checkout_for_actor(p_buyer_id uuid,p_session_id uuid,
 p_product_id uuid,p_quantity integer,p_attempt_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select public.reserve_merch_checkout_for_actor(p_buyer_id,p_session_id,p_product_id,p_quantity,p_attempt_id,null::uuid)
$$;
revoke all on function public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid) to service_role;


-- Keep the retained money lifecycle; only inventory side effects gain SKU scope.
create or replace function public.process_stripe_merch_webhook_lifecycle(p_event_id text,p_event_type text,p_raw_event_hash text,p_facts jsonb)
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
     and e.event_type=p_event_type and e.object_id=p_facts->>'object_id' and e.environment='sandbox' and m.payment_status='paid'
     and m.environment='sandbox' and m.checkout_attempt_id is not null
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
end $$;
revoke all on function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) to service_role;


commit;
