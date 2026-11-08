-- Source-only v3 provider worker boundary. No credential or qualified row is
-- installed. SQL consumes capabilities; the private authenticated worker owns
-- HTTPS, AES-GCM capture and raw parsing. Ciphertext shape alone is not provider
-- authentication. No client receipt/verified flag can invoke this boundary.
set local role sbx_v1_core_owner;

create function sandbox_commerce_v1.test_store_v3_canonical(p_value jsonb)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare answer text;
begin
 if jsonb_typeof(p_value)='object' then
   select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||sandbox_commerce_v1.test_store_v3_canonical(value),',' order by key collate "C"),'')||'}'
     into answer from jsonb_each(p_value); return answer;
 elsif jsonb_typeof(p_value)='array' then
   select '['||coalesce(string_agg(sandbox_commerce_v1.test_store_v3_canonical(value),',' order by ord),'')||']'
     into answer from jsonb_array_elements(p_value) with ordinality as entries(value,ord); return answer;
 end if;
 return p_value::text;
end; $$;
create function sandbox_commerce_v1.test_store_v3_hash(p_value jsonb)
returns text language sql immutable security invoker set search_path='' as $$
 select encode(sha256(convert_to(sandbox_commerce_v1.test_store_v3_canonical(p_value),'UTF8')),'hex');
$$;
create function sandbox_commerce_v1.test_store_v3_provision_hold(p_plan uuid,p_ticket uuid,p_reason text,p_project_wide boolean default false)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare project text;
begin
 lock table sandbox_commerce_v1.test_store_v3_holds in row exclusive mode nowait;
 select c.project_id into strict project from sandbox_commerce_v1.test_store_v3_plans p
   join sandbox_commerce_v1.test_store_v3_customers c on c.id=p.customer_id where p.id=p_plan;
 insert into sandbox_commerce_v1.test_store_v3_holds(project_id,scope,plan_id,ticket_id,reason)
 values(project,case when p_project_wide then 'project' else 'plan' end,case when not p_project_wide then p_plan end,p_ticket,p_reason);
end; $$;

-- Latest root and its strictly linked pages. A missing page is never an empty
-- collection. Every continuation was separately admitted and rate-budgeted.
create function sandbox_commerce_v1.test_store_v3_scan(p_plan uuid,p_operation text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare current_ticket sandbox_commerce_v1.test_store_v3_tickets;
 next_ticket sandbox_commerce_v1.test_store_v3_tickets;
 e sandbox_commerce_v1.test_store_v3_transport_evidence;
 root_id uuid; items jsonb:='[]'; count_pages integer:=0; next_cursor text;
 seen_ids text[]:='{}'; item jsonb; item_id text; child_count integer;
begin
 select * into current_ticket from sandbox_commerce_v1.test_store_v3_tickets
 where plan_id=p_plan and operation=p_operation and cursor is null order by consumed_at desc,id desc limit 1;
 if current_ticket.id is null then return jsonb_build_object('status','none'); end if;
 root_id:=current_ticket.id;
 loop
   count_pages:=count_pages+1;
   if count_pages>10 then return jsonb_build_object('status','invalid','reason','page_budget'); end if;
   select * into e from sandbox_commerce_v1.test_store_v3_transport_evidence where ticket_id=current_ticket.id;
   if e.ticket_id is null or e.observation->>'kind' in ('provider_error','transport') then
     return jsonb_build_object('status','waiting','rootTicketId',root_id,'lastTicketId',current_ticket.id,'nextCursor',current_ticket.cursor);
   end if;
   if e.observation->>'kind' is distinct from 'list' or jsonb_typeof(e.observation->'items') is distinct from 'array'
     or jsonb_array_length(e.observation->'items')>100
   then return jsonb_build_object('status','invalid','reason','invalid_page'); end if;
   item_id:=null;
   for item in select value from jsonb_array_elements(e.observation->'items') loop
     item_id:=case when p_operation='list_package_products' then item#>>'{product,id}' else item->>'id' end;
     if item_id is null or item_id=any(seen_ids) then return jsonb_build_object('status','invalid','reason','repeated_identity'); end if;
     seen_ids:=array_append(seen_ids,item_id); items:=items||jsonb_build_array(item);
     if cardinality(seen_ids)>1000 then return jsonb_build_object('status','invalid','reason','item_budget'); end if;
   end loop;
   next_cursor:=e.observation->>'nextCursor';
   if e.observation->'complete'='true'::jsonb and next_cursor is null then
     return jsonb_build_object('status','complete','rootTicketId',root_id,'lastTicketId',current_ticket.id,
       'items',items,'pages',count_pages,'recordedAt',e.recorded_at);
   end if;
   if e.observation->'complete' is distinct from 'false'::jsonb or next_cursor is null
     or next_cursor is distinct from item_id or next_cursor is not distinct from current_ticket.cursor
   then return jsonb_build_object('status','invalid','reason','cursor_mismatch'); end if;
   select count(*) into child_count from sandbox_commerce_v1.test_store_v3_tickets
     where previous_ticket_id=current_ticket.id and scan_root_ticket_id=root_id;
   if child_count=0 then return jsonb_build_object('status','continue','rootTicketId',root_id,'lastTicketId',current_ticket.id,'nextCursor',next_cursor,'pages',count_pages); end if;
   if child_count<>1 then return jsonb_build_object('status','invalid','reason','forked_scan'); end if;
   select * into strict next_ticket from sandbox_commerce_v1.test_store_v3_tickets
     where previous_ticket_id=current_ticket.id and scan_root_ticket_id=root_id;
   if row(next_ticket.plan_id,next_ticket.operation,next_ticket.cursor)
     is distinct from row(p_plan,p_operation,next_cursor)
   then return jsonb_build_object('status','invalid','reason','scan_scope_changed'); end if;
   current_ticket:=next_ticket;
 end loop;
end; $$;

create function sandbox_commerce_v1.test_store_v3_fact_valid(p_item jsonb,p_kind text)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare keys text[];
begin
 if jsonb_typeof(p_item) is distinct from 'object' or p_item->>'kind' is distinct from p_kind then return false; end if;
 if p_kind='attachment' then
   return p_item ?& array['kind','product','eligibilityCriteria']
     and p_item-array['kind','product','eligibilityCriteria']='{}'::jsonb
     and jsonb_typeof(p_item->'eligibilityCriteria')='string'
     and sandbox_commerce_v1.test_store_v3_fact_valid(p_item->'product','product');
 end if;
 if jsonb_typeof(p_item->'id') is distinct from 'string' or p_item->>'id' !~ '^[A-Za-z0-9_-]{1,200}$' then return false; end if;
 if p_kind='product' then
   keys:=array['kind','id','storeIdentifier','appId','state','productType','oneTimeConsumable'];
   return p_item ?& keys and p_item-keys='{}'::jsonb
     and jsonb_typeof(p_item->'storeIdentifier')='string' and sandbox_commerce_v1.provider_text(p_item->>'storeIdentifier')
     and jsonb_typeof(p_item->'appId')='string' and p_item->>'appId' ~ '^[A-Za-z0-9_-]{1,200}$'
     and jsonb_typeof(p_item->'state')='string' and sandbox_commerce_v1.provider_text(p_item->>'state')
     and jsonb_typeof(p_item->'productType')='string' and sandbox_commerce_v1.provider_text(p_item->>'productType')
     and jsonb_typeof(p_item->'oneTimeConsumable') in ('null','boolean');
 end if;
 keys:=case when p_kind='offering' then array['kind','id','lookupKey','displayName','projectId','state','isCurrent','createdAt']
   when p_kind='package' then array['kind','id','lookupKey','displayName','position','createdAt'] else array[]::text[] end;
 if cardinality(keys)=0 or not p_item ?& keys or p_item-keys<>'{}'::jsonb
   or jsonb_typeof(p_item->'lookupKey') is distinct from 'string' or length(p_item->>'lookupKey') not between 1 and 200
   or jsonb_typeof(p_item->'displayName') is distinct from 'string' or length(p_item->>'displayName') not between 1 and 1500
   or jsonb_typeof(p_item->'createdAt') is distinct from 'number' or p_item->>'createdAt' !~ '^[0-9]+$'
   or (p_item->>'createdAt')::numeric>9007199254740991 then return false; end if;
 if p_kind='offering' then return jsonb_typeof(p_item->'projectId')='string' and p_item->>'projectId' ~ '^[A-Za-z0-9_-]{1,200}$'
   and jsonb_typeof(p_item->'state')='string' and sandbox_commerce_v1.provider_text(p_item->>'state')
   and jsonb_typeof(p_item->'isCurrent')='boolean'; end if;
 return jsonb_typeof(p_item->'position')='number' and p_item->>'position' ~ '^[0-9]+$' and (p_item->>'position')::numeric between 1 and 32767;
end; $$;

create function sandbox_commerce_v1.test_store_v3_product_matches(p_item jsonb,p_product sandbox_commerce_v1.test_store_v3_products,p_connection sandbox_commerce_v1.test_store_v3_connections)
returns boolean language sql immutable security invoker set search_path='' as $$
 select sandbox_commerce_v1.test_store_v3_fact_valid(p_item,'product') is true
   and row(p_item->>'id',p_item->>'storeIdentifier',p_item->>'appId',p_item->>'state',p_item->>'productType',p_item->'oneTimeConsumable')
    is not distinct from row(p_product.provider_product_id,p_product.store_identifier,p_connection.app_id,p_product.qualified_product_state,
       p_product.qualified_product_type,coalesce(to_jsonb(p_product.qualified_one_time_consumable),'null'::jsonb));
$$;

-- Build the request independently from the consumed immutable ticket, using the
-- same fixed route set as the source worker. No client URL or arbitrary body.
create function sandbox_commerce_v1.test_store_v3_request(p_ticket jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare path text:='/v2/projects/'||(p_ticket->>'projectId'); operation text:=p_ticket->>'operation'; body jsonb;
begin
 if operation='create_offering' then path:=path||'/offerings'; body:=jsonb_build_object('lookup_key',p_ticket#>>'{plan,offeringLookupKey}','display_name',p_ticket#>>'{plan,offeringDisplayName}');
 elsif operation='create_package' then path:=path||'/offerings/'||(p_ticket#>>'{plan,providerOfferingId}')||'/packages'; body:=jsonb_build_object('lookup_key',p_ticket#>>'{plan,packageLookupKey}','display_name',p_ticket#>>'{plan,packageDisplayName}');
 elsif operation='attach_product' then path:=path||'/packages/'||(p_ticket#>>'{plan,providerPackageId}')||'/actions/attach_products'; body:=jsonb_build_object('products',jsonb_build_array(jsonb_build_object('product_id',p_ticket#>>'{plan,providerProductId}','eligibility_criteria','all')));
 elsif operation='read_offering' then path:=path||'/offerings/'||(p_ticket#>>'{plan,providerOfferingId}');
 elsif operation='list_offerings' then path:=path||'/offerings';
 elsif operation='read_package' then path:=path||'/packages/'||(p_ticket#>>'{plan,providerPackageId}');
 elsif operation='list_packages' then path:=path||'/offerings/'||(p_ticket#>>'{plan,providerOfferingId}')||'/packages';
 elsif operation='read_product' then path:=path||'/products/'||(p_ticket#>>'{plan,providerProductId}');
 elsif operation='list_package_products' then path:=path||'/packages/'||(p_ticket#>>'{plan,providerPackageId}')||'/products';
 else raise exception 'test_store_v3_operation_invalid'; end if;
 if operation in ('list_offerings','list_packages','list_package_products') then
   path:=path||'?limit=100'||case when p_ticket->>'cursor' is not null then '&starting_after='||(p_ticket->>'cursor') else '' end;
 end if;
 return jsonb_build_object('method',case when operation in ('create_offering','create_package','attach_product') then 'POST' else 'GET' end,
   'pathAndQuery',path,'body',case when body is not null then sandbox_commerce_v1.test_store_v3_canonical(body) end);
end; $$;

create function sandbox_commerce_v1.test_store_v3_provision_claim(p_plan uuid,p_operation text,p_request uuid,p_cursor text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare plan sandbox_commerce_v1.test_store_v3_plans; customer sandbox_commerce_v1.test_store_v3_customers;
 connection sandbox_commerce_v1.test_store_v3_connections; product sandbox_commerce_v1.test_store_v3_products;
 controls sandbox_commerce_v1.test_store_v3_controls; profile sandbox_commerce_v1.test_store_v3_native_profiles;
 allocation sandbox_commerce_v1.test_store_v3_allocations; intent sandbox_commerce_v1.intents;
 offer sandbox_commerce_v1.offers; resource sandbox_commerce_v1.resources; catalog sandbox_commerce_v1.catalog;
 reservation sandbox_commerce_v1.test_store_v3_reservations; prior sandbox_commerce_v1.test_store_v3_tickets;
 offering_id text; package_id text; scanned jsonb; item jsonb; buyer jsonb; seller jsonb;
 mutation boolean; deadline timestamptz; ticket_id uuid:=gen_random_uuid(); previous_id uuid; root_id uuid; payload jsonb;
begin
 perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
 if p_plan is null or p_request is null or p_operation is null
   or p_operation not in ('create_offering','create_package','attach_product','read_offering','list_offerings','read_package','list_packages','read_product','list_package_products')
   or (p_cursor is not null and (p_operation not in ('list_offerings','list_packages','list_package_products') or p_cursor !~ '^[A-Za-z0-9_-]{1,200}$'))
 then raise exception 'test_store_v3_selector_invalid'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('test-store-v3-provision-plan:'||p_plan,683)) then return jsonb_build_object('status','waiting'); end if;
 select * into prior from sandbox_commerce_v1.test_store_v3_tickets where request_id=p_request;
 if prior.id is not null then return jsonb_build_object('status','outcome_unknown'); end if;
 select * into strict plan from sandbox_commerce_v1.test_store_v3_plans where id=p_plan;
 select * into strict customer from sandbox_commerce_v1.test_store_v3_customers where id=plan.customer_id;
 select * into strict allocation from sandbox_commerce_v1.test_store_v3_allocations where plan_id=plan.id;
 select * into strict controls from sandbox_commerce_v1.test_store_v3_controls where singleton for share nowait;
 select * into strict connection from sandbox_commerce_v1.test_store_v3_connections where id=customer.connection_id and revision=customer.connection_revision for share nowait;
 select * into strict product from sandbox_commerce_v1.test_store_v3_products where catalog_id=plan.catalog_id for share nowait;
 select * into strict profile from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest=customer.configuration_digest for share nowait;
 if not controls.provisioning_enabled or controls.requests_per_minute<=0 or controls.max_pages<=0 or controls.max_active_plans<=0
   or not connection.qualified or not product.qualified or not profile.qualified
   or row(controls.connection_id,controls.connection_revision) is distinct from row(connection.id,connection.revision)
   or row(product.connection_id,product.connection_revision) is distinct from row(connection.id,connection.revision)
   or sandbox_commerce_v1.test_store_v3_is_held(customer.id,allocation.id)
 then return jsonb_build_object('status','unavailable'); end if;
 perform sandbox_commerce_v1.test_store_v3_scope_exclusive(connection.project_id);
 if exists(select 1 from sandbox_commerce_v1.test_store_v3_work_leases where plan_id=plan.id and expires_at>clock_timestamp())
 then return jsonb_build_object('status','waiting'); end if;
 if not pg_try_advisory_xact_lock(hashtextextended('test-store-v3-rate:'||connection.credential_ref,683))
 then return jsonb_build_object('status','waiting'); end if;
 if (select count(*) from sandbox_commerce_v1.test_store_v3_tickets where credential_ref=connection.credential_ref and consumed_at>clock_timestamp()-interval '1 minute')>=controls.requests_per_minute
   or (select count(*) from sandbox_commerce_v1.test_store_v3_tickets where project_id=connection.project_id and consumed_at>clock_timestamp()-interval '1 minute')>=controls.requests_per_minute
 then return jsonb_build_object('status','waiting'); end if;
 mutation:=p_operation in ('create_offering','create_package','attach_product');
 if mutation and exists(select 1 from sandbox_commerce_v1.test_store_v3_tickets where plan_id=plan.id and operation=p_operation)
 then return jsonb_build_object('status','outcome_unknown'); end if;
 select provider_id into offering_id from sandbox_commerce_v1.test_store_v3_object_bindings where plan_id=plan.id and kind='offering';
 select provider_id into package_id from sandbox_commerce_v1.test_store_v3_object_bindings where plan_id=plan.id and kind='package';
 if (p_operation in ('create_package','read_offering','list_packages') and offering_id is null)
   or(p_operation in ('attach_product','read_package','list_package_products') and package_id is null)
 then return jsonb_build_object('status','unavailable'); end if;
 if p_operation='create_offering' then
   if offering_id is not null then return jsonb_build_object('status','unavailable'); end if;
   scanned:=sandbox_commerce_v1.test_store_v3_scan(plan.id,'list_offerings');
   if scanned->>'status' is distinct from 'complete' or (scanned->>'recordedAt')::timestamptz<clock_timestamp()-interval '5 seconds'
     or jsonb_array_length(scanned->'items')>=controls.max_active_plans
   then return jsonb_build_object('status','waiting'); end if;
   for item in select value from jsonb_array_elements(scanned->'items') loop
     if item->>'lookupKey'=plan.offering_lookup_key or not exists(select 1 from sandbox_commerce_v1.test_store_v3_plans other
       join sandbox_commerce_v1.test_store_v3_customers c on c.id=other.customer_id
       join sandbox_commerce_v1.test_store_v3_object_bindings b on b.plan_id=other.id and b.kind='offering'
       where c.project_id=connection.project_id and other.offering_lookup_key=item->>'lookupKey' and b.provider_id=item->>'id')
     then perform sandbox_commerce_v1.test_store_v3_provision_hold(plan.id,(scanned->>'lastTicketId')::uuid,'provider_inventory_unowned',true);
       return jsonb_build_object('status','unavailable'); end if;
   end loop;
 elsif p_operation='create_package' and package_id is not null then return jsonb_build_object('status','unavailable');
 end if;
 if p_operation in ('list_offerings','list_packages','list_package_products') and p_cursor is not null then
   scanned:=sandbox_commerce_v1.test_store_v3_scan(plan.id,p_operation);
   if scanned->>'status' is distinct from 'continue' or scanned->>'nextCursor' is distinct from p_cursor
     or (scanned->>'pages')::integer>=controls.max_pages then return jsonb_build_object('status','waiting'); end if;
   previous_id:=(scanned->>'lastTicketId')::uuid; root_id:=(scanned->>'rootTicketId')::uuid;
 else root_id:=ticket_id; end if;
 deadline:=clock_timestamp()+interval '5 seconds';
 if mutation then
   perform sandbox_commerce_v1.assert_generation(true);
   if not pg_try_advisory_xact_lock(hashtextextended('test-store-v3-capacity:'||connection.project_id,683))
   then return jsonb_build_object('status','waiting'); end if;
   if (select count(*) from sandbox_commerce_v1.test_store_v3_plans p join sandbox_commerce_v1.test_store_v3_customers c on c.id=p.customer_id
     where c.project_id=connection.project_id)>controls.max_active_plans then return jsonb_build_object('status','unavailable'); end if;
   select * into strict reservation from sandbox_commerce_v1.test_store_v3_reservations where customer_id=customer.id for share nowait;
   if reservation.active_allocation_id is distinct from allocation.id or exists(select 1 from sandbox_commerce_v1.test_store_v3_releases where allocation_id=allocation.id)
   then return jsonb_build_object('status','unavailable'); end if;
   select * into strict intent from sandbox_commerce_v1.intents where id=plan.intent_id;
   buyer:=sandbox_commerce_v1.assert_authority(customer.buyer_id,allocation.buyer_session_id,'buyer');
   seller:=sandbox_commerce_v1.assert_authority(intent.creator_id,null,'creator_subject');
   select * into strict offer from sandbox_commerce_v1.offers where id=intent.offer_id for share nowait;
   select * into strict resource from sandbox_commerce_v1.resources where id=offer.resource_id for share nowait;
   select * into strict catalog from sandbox_commerce_v1.catalog where id=offer.catalog_id for share nowait;
   select * into strict intent from sandbox_commerce_v1.intents where id=plan.intent_id for share nowait;
   perform sandbox_commerce_v1.test_store_v3_assert_media(intent);
   if intent.kind<>'paid_content' or intent.state<>'prepared' or intent.dispatch_id is not null or intent.expires_at<=clock_timestamp()
     or intent.buyer_id<>customer.buyer_id or intent.buyer_session_id<>allocation.buyer_session_id
     or plan.quote is distinct from sandbox_commerce_v1.test_store_v3_quote(intent) or allocation.quote is distinct from plan.quote
     or intent.provider<>'revenuecat' or intent.store<>'test_store' or intent.scope_key<>connection.scope_key or intent.currency<>'usd'
     or offer.revision<>intent.offer_revision or offer.status<>'published' or offer.resource_id<>intent.resource_id or offer.resource_revision<>intent.resource_revision
     or resource.revision<>intent.resource_revision or resource.status<>'published' or resource.creator_id<>intent.creator_id or resource.kind<>'paid_content'
     or catalog.id<>plan.catalog_id or catalog.kind<>intent.kind or catalog.provider<>intent.provider or catalog.scope_key<>intent.scope_key
     or catalog.store<>intent.store or catalog.product_id<>intent.product_id or catalog.amount_minor<>intent.amount_minor or catalog.currency<>intent.currency
     or product.store_identifier<>intent.product_id or product.amount_minor<>intent.amount_minor or product.currency<>intent.currency
   then raise exception 'test_store_v3_quote_changed'; end if;
   perform sandbox_commerce_v1.assert_fresh(buyer); perform sandbox_commerce_v1.assert_fresh(seller);
   deadline:=least(deadline,(buyer->>'valid_until')::timestamptz,(seller->>'valid_until')::timestamptz,intent.expires_at);
 end if;
 payload:=jsonb_build_object('protocol','isolated-test-store-v3-provisioning','ticketId',ticket_id,'requestId',p_request,'planId',plan.id,
   'connectionId',connection.id,'connectionRevision',connection.revision,'providerConfigurationDigest',connection.provider_configuration_digest,
   'projectId',connection.project_id,'appId',connection.app_id,'credentialVersion',connection.credential_version,
   'operation',p_operation,'cursor',p_cursor,'validUntil',deadline,
   'plan',jsonb_build_object('offeringLookupKey',plan.offering_lookup_key,'offeringDisplayName',plan.offering_display_name,
     'packageLookupKey',plan.package_lookup_key,'packageDisplayName',plan.package_display_name,'providerOfferingId',offering_id,'providerPackageId',package_id,
     'providerProductId',product.provider_product_id,'storeIdentifier',product.store_identifier,'qualifiedProductType',product.qualified_product_type,
     'qualifiedProductState',product.qualified_product_state,'qualifiedOneTimeConsumable',product.qualified_one_time_consumable));
 insert into sandbox_commerce_v1.test_store_v3_tickets(id,request_id,plan_id,operation,cursor,ticket,credential_ref,project_id,previous_ticket_id,scan_root_ticket_id,valid_until)
 values(ticket_id,p_request,plan.id,p_operation,p_cursor,payload,connection.credential_ref,connection.project_id,previous_id,root_id,deadline);
 insert into sandbox_commerce_v1.test_store_v3_work_leases(plan_id,ticket_id,expires_at) values(plan.id,ticket_id,clock_timestamp()+interval '15 seconds')
 on conflict(plan_id) do update set ticket_id=excluded.ticket_id,expires_at=excluded.expires_at;
 if mutation then perform sandbox_commerce_v1.assert_fresh(buyer); perform sandbox_commerce_v1.assert_fresh(seller); end if;
 if clock_timestamp()>=deadline then raise exception 'test_store_v3_send_permit_expired'; end if;
 return jsonb_build_object('status','send_permit_consumed','ticket',payload);
end; $$;

-- Independent readbacks are necessary even after all three POSTs succeeded.
create function sandbox_commerce_v1.test_store_v3_try_register(p_plan uuid)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare plan sandbox_commerce_v1.test_store_v3_plans; customer sandbox_commerce_v1.test_store_v3_customers;
 allocation sandbox_commerce_v1.test_store_v3_allocations; connection sandbox_commerce_v1.test_store_v3_connections;
 product sandbox_commerce_v1.test_store_v3_products; offering_id text; package_id text;
 o sandbox_commerce_v1.test_store_v3_transport_evidence; p sandbox_commerce_v1.test_store_v3_transport_evidence;
 packages jsonb; attachments jsonb; item jsonb; attached_at timestamptz;
begin
 select * into strict plan from sandbox_commerce_v1.test_store_v3_plans where id=p_plan;
 select * into strict customer from sandbox_commerce_v1.test_store_v3_customers where id=plan.customer_id;
 select * into strict allocation from sandbox_commerce_v1.test_store_v3_allocations where plan_id=plan.id;
 if sandbox_commerce_v1.test_store_v3_is_held(customer.id,allocation.id) then return; end if;
 select * into strict connection from sandbox_commerce_v1.test_store_v3_connections where id=customer.connection_id and revision=customer.connection_revision;
 select * into strict product from sandbox_commerce_v1.test_store_v3_products where catalog_id=plan.catalog_id;
 select provider_id into offering_id from sandbox_commerce_v1.test_store_v3_object_bindings where plan_id=plan.id and kind='offering';
 select provider_id into package_id from sandbox_commerce_v1.test_store_v3_object_bindings where plan_id=plan.id and kind='package';
 if offering_id is null or package_id is null then return; end if;
 select consumed_at into attached_at from sandbox_commerce_v1.test_store_v3_tickets where plan_id=plan.id and operation='attach_product';
 if attached_at is null then return; end if;
 select e.* into o from sandbox_commerce_v1.test_store_v3_tickets t left join sandbox_commerce_v1.test_store_v3_transport_evidence e on e.ticket_id=t.id
 where t.plan_id=plan.id and t.operation='read_offering' and t.consumed_at>=attached_at order by t.consumed_at desc,t.id desc limit 1;
 select e.* into p from sandbox_commerce_v1.test_store_v3_tickets t left join sandbox_commerce_v1.test_store_v3_transport_evidence e on e.ticket_id=t.id
 where t.plan_id=plan.id and t.operation='read_product' and t.consumed_at>=attached_at order by t.consumed_at desc,t.id desc limit 1;
 packages:=sandbox_commerce_v1.test_store_v3_scan(plan.id,'list_packages');
 attachments:=sandbox_commerce_v1.test_store_v3_scan(plan.id,'list_package_products');
 if o.ticket_id is null or p.ticket_id is null or o.observation->>'kind' is distinct from 'resource' or p.observation->>'kind' is distinct from 'resource'
   or packages->>'status' is distinct from 'complete' or attachments->>'status' is distinct from 'complete' then return; end if;
 if exists(select 1 from sandbox_commerce_v1.test_store_v3_tickets where id in ((packages->>'rootTicketId')::uuid,(attachments->>'rootTicketId')::uuid)
   and consumed_at<attached_at) then return; end if;
 if jsonb_array_length(packages->'items')<>1 or jsonb_array_length(attachments->'items')<>1 then
   perform sandbox_commerce_v1.test_store_v3_provision_hold(plan.id,(attachments->>'lastTicketId')::uuid,'registration_relationship_ambiguous'); return;
 end if;
 item:=o.observation#>'{items,0}';
 if row(item->>'id',item->>'lookupKey',item->>'displayName',item->>'projectId',item->>'state')
   is distinct from row(offering_id,plan.offering_lookup_key,plan.offering_display_name,connection.project_id,connection.qualified_offering_state)
   or item->'isCurrent' is distinct from 'false'::jsonb
   or row(packages#>>'{items,0,id}',packages#>>'{items,0,lookupKey}',packages#>>'{items,0,displayName}')
      is distinct from row(package_id,plan.package_lookup_key,plan.package_display_name)
   or sandbox_commerce_v1.test_store_v3_product_matches(attachments#>'{items,0,product}',product,connection) is not true
   or attachments#>>'{items,0,eligibilityCriteria}' is distinct from 'all'
   or sandbox_commerce_v1.test_store_v3_product_matches(p.observation#>'{items,0}',product,connection) is not true
 then perform sandbox_commerce_v1.test_store_v3_provision_hold(plan.id,o.ticket_id,'registration_readback_mismatch'); return; end if;
 if exists(select 1 from sandbox_commerce_v1.test_store_v3_registrations where plan_id=plan.id) then return; end if;
 insert into sandbox_commerce_v1.test_store_v3_registrations(plan_id,provider_offering_id,offering_identifier,provider_package_id,package_identifier,
   provider_product_id,product_id,webhook_offering_key,offering_evidence,package_evidence,attachment_evidence,product_evidence)
 values(plan.id,offering_id,plan.offering_lookup_key,package_id,plan.package_lookup_key,product.provider_product_id,product.store_identifier,
   case connection.webhook_offering_representation when 'lookup_key' then plan.offering_lookup_key when 'provider_id' then offering_id end,
   o.ticket_id,(packages->>'lastTicketId')::uuid,(attachments->>'lastTicketId')::uuid,p.ticket_id);
end; $$;

create function sandbox_commerce_v1.test_store_v3_provision_record(p_ticket uuid,p_evidence jsonb,p_observation jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare t sandbox_commerce_v1.test_store_v3_tickets; connection sandbox_commerce_v1.test_store_v3_connections;
 plan sandbox_commerce_v1.test_store_v3_plans; previous sandbox_commerce_v1.test_store_v3_transport_evidence;
 controls sandbox_commerce_v1.test_store_v3_controls; request jsonb; evidence_hash text; keys text[]; obs_keys text[];
 kind text; item jsonb; expected_status integer; normalized_ok boolean:=true; scan jsonb;
 candidates jsonb; observed_provider_id text; bound sandbox_commerce_v1.test_store_v3_object_bindings;
begin
 perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
 if p_ticket is null or jsonb_typeof(p_evidence) is distinct from 'object' or jsonb_typeof(p_observation) is distinct from 'object'
   or octet_length(p_evidence::text)>1600000 or octet_length(p_observation::text)>1048576
 then raise exception 'test_store_v3_evidence_invalid'; end if;
 select * into strict t from sandbox_commerce_v1.test_store_v3_tickets where id=p_ticket;
 if not pg_try_advisory_xact_lock(hashtextextended('test-store-v3-provision-plan:'||t.plan_id,683)) then raise exception 'test_store_v3_plan_busy' using errcode='55P03'; end if;
 lock table sandbox_commerce_v1.test_store_v3_holds in row exclusive mode nowait;
 select * into strict plan from sandbox_commerce_v1.test_store_v3_plans where id=t.plan_id;
 select * into strict connection from sandbox_commerce_v1.test_store_v3_connections where id=(t.ticket->>'connectionId')::uuid and revision=(t.ticket->>'connectionRevision')::integer;
 select * into strict controls from sandbox_commerce_v1.test_store_v3_controls where singleton;
 request:=sandbox_commerce_v1.test_store_v3_request(t.ticket);
 keys:=array['protocol','ticketId','requestId','planId','connectionId','connectionRevision','providerConfigurationDigest','credentialVersion','operation','method','pathAndQuery',
   'requestSha256','startedAt','endedAt','httpStatus','responseHeaders','transportOutcome','rawSha256','rawByteLength','encryption'];
 obs_keys:=array['kind','resourceKind','items','nextCursor','complete','issue','httpStatus'];
 if not p_evidence ?& keys or p_evidence-keys<>'{}'::jsonb or not p_observation ?& obs_keys or p_observation-obs_keys<>'{}'::jsonb
   or p_evidence->>'protocol' is distinct from 'isolated-test-store-v3-provisioning-evidence'
   or (p_evidence->'ticketId') is distinct from to_jsonb(t.id::text) or p_evidence->'requestId' is distinct from to_jsonb(t.request_id::text)
   or p_evidence->'planId' is distinct from to_jsonb(t.plan_id::text)
   or p_evidence->'connectionId' is distinct from t.ticket->'connectionId' or p_evidence->'connectionRevision' is distinct from t.ticket->'connectionRevision'
   or p_evidence->'providerConfigurationDigest' is distinct from t.ticket->'providerConfigurationDigest'
   or p_evidence->'credentialVersion' is distinct from t.ticket->'credentialVersion' or p_evidence->'operation' is distinct from t.ticket->'operation'
   or p_evidence->'method' is distinct from request->'method' or p_evidence->'pathAndQuery' is distinct from request->'pathAndQuery'
   or p_evidence->>'requestSha256' is distinct from sandbox_commerce_v1.test_store_v3_hash(request)
   or jsonb_typeof(p_evidence->'startedAt') is distinct from 'string' or jsonb_typeof(p_evidence->'endedAt') is distinct from 'string'
   or (p_evidence->>'startedAt')::timestamptz<t.consumed_at-interval '1 millisecond'
   or (p_evidence->>'startedAt')::timestamptz>=t.valid_until
   or (p_evidence->>'endedAt')::timestamptz<(p_evidence->>'startedAt')::timestamptz
   or (p_evidence->>'endedAt')::timestamptz>(p_evidence->>'startedAt')::timestamptz+interval '6 seconds'
   or jsonb_typeof(p_evidence->'rawByteLength') is distinct from 'number' or p_evidence->>'rawByteLength' !~ '^[0-9]+$'
   or (p_evidence->>'rawByteLength')::numeric>controls.max_response_bytes
   or jsonb_typeof(p_evidence->'rawSha256') is distinct from 'string' or p_evidence->>'rawSha256' !~ '^[a-f0-9]{64}$'
   or jsonb_typeof(p_evidence->'encryption') is distinct from 'object'
   or not (p_evidence->'encryption') ?& array['algorithm','keyId','nonce','ciphertext']
   or (p_evidence->'encryption')-array['algorithm','keyId','nonce','ciphertext']<>'{}'::jsonb
   or p_evidence#>>'{encryption,algorithm}' is distinct from 'AES-256-GCM'
   or p_evidence#>>'{encryption,keyId}' is distinct from connection.storage_key_id
   or jsonb_typeof(p_evidence#>'{encryption,nonce}') is distinct from 'string' or jsonb_typeof(p_evidence#>'{encryption,ciphertext}') is distinct from 'string'
   or octet_length(decode(p_evidence#>>'{encryption,nonce}','base64'))<>12
   or octet_length(decode(p_evidence#>>'{encryption,ciphertext}','base64'))<>(p_evidence->>'rawByteLength')::integer+16
   or p_evidence->>'transportOutcome' is null or p_evidence->>'transportOutcome' not in ('complete','timeout','connection_error','body_incomplete','body_too_large')
   or jsonb_typeof(p_evidence->'responseHeaders') is distinct from 'object'
   or exists(select 1 from jsonb_each(p_evidence->'responseHeaders') h where h.key not in ('content-type','content-length','retry-after','revenuecat-rate-limit-current-usage','revenuecat-rate-limit-current-limit')
      or jsonb_typeof(h.value)<>'string' or length(h.value#>>'{}')>4096)
   or jsonb_typeof(p_evidence->'httpStatus') not in ('number','null')
   or (jsonb_typeof(p_evidence->'httpStatus')='number' and (p_evidence->>'httpStatus' !~ '^[0-9]+$' or (p_evidence->>'httpStatus')::numeric not between 100 and 599))
   or p_observation->'httpStatus' is distinct from p_evidence->'httpStatus'
   or jsonb_typeof(p_observation->'items') is distinct from 'array' or jsonb_array_length(p_observation->'items')>100
   or jsonb_typeof(p_observation->'complete') is distinct from 'boolean'
 then raise exception 'test_store_v3_evidence_binding_invalid'; end if;
 evidence_hash:=sandbox_commerce_v1.test_store_v3_hash(p_evidence);
 insert into sandbox_commerce_v1.test_store_v3_transport_deliveries(ticket_id,evidence,observation,evidence_sha256) values(t.id,p_evidence,p_observation,evidence_hash);
 select * into previous from sandbox_commerce_v1.test_store_v3_transport_evidence where ticket_id=t.id;
 if previous.ticket_id is not null then
   if row(previous.evidence,previous.observation) is distinct from row(p_evidence,p_observation) then
     perform sandbox_commerce_v1.test_store_v3_provision_hold(plan.id,t.id,'transport_evidence_conflict');
   end if;
   return jsonb_build_object('status','recorded','ticketId',t.id,'evidenceSha256',evidence_hash,'ackAllowed',true);
 end if;
 insert into sandbox_commerce_v1.test_store_v3_transport_evidence(ticket_id,evidence,observation,evidence_sha256) values(t.id,p_evidence,p_observation,evidence_hash);
 delete from sandbox_commerce_v1.test_store_v3_work_leases where plan_id=plan.id and ticket_id=t.id;
 kind:=case when t.operation in ('create_offering','read_offering','list_offerings') then 'offering'
   when t.operation='read_product' then 'product' when t.operation='list_package_products' then 'attachment' else 'package' end;
 expected_status:=case when t.operation in ('create_offering','create_package') then 201 else 200 end;
 if p_observation->>'kind' in ('provider_error','transport') then
   if p_observation->'complete'<>'false'::jsonb or jsonb_array_length(p_observation->'items')<>0
     or p_observation->'nextCursor'<>'null'::jsonb or p_observation->'resourceKind'<>'null'::jsonb then normalized_ok:=false; end if;
 elsif p_observation->>'kind'='invalid' then normalized_ok:=false;
 elsif p_observation->>'kind' in ('resource','list') then
   if p_evidence->>'transportOutcome'<>'complete' or p_evidence->'httpStatus' is distinct from to_jsonb(expected_status)
     or p_observation->>'resourceKind' is distinct from kind or p_observation->'issue' is distinct from 'null'::jsonb
     or ((t.operation in ('list_offerings','list_packages','list_package_products')) is distinct from (p_observation->>'kind'='list'))
   then normalized_ok:=false; end if;
   for item in select value from jsonb_array_elements(p_observation->'items') loop
     if sandbox_commerce_v1.test_store_v3_fact_valid(item,kind) is not true then normalized_ok:=false; end if;
   end loop;
   if p_observation->>'kind'='resource' and (jsonb_array_length(p_observation->'items')<>1
     or p_observation->'complete' is distinct from 'true'::jsonb or p_observation->'nextCursor' is distinct from 'null'::jsonb) then normalized_ok:=false; end if;
   if p_observation->>'kind'='list' and ((p_observation->'complete'='true'::jsonb and p_observation->'nextCursor' is distinct from 'null'::jsonb)
     or(p_observation->'complete'='false'::jsonb and (jsonb_typeof(p_observation->'nextCursor') is distinct from 'string' or p_observation->>'nextCursor' !~ '^[A-Za-z0-9_-]{1,200}$')))
   then normalized_ok:=false; end if;
 else normalized_ok:=false;
 end if;
 if not normalized_ok then
   perform sandbox_commerce_v1.test_store_v3_provision_hold(plan.id,t.id,'transport_observation_invalid');
   -- An invalid project inventory may hide another retained Offering owner.
   -- Preserve its raw evidence and fence future work/current access project-wide.
   if t.operation='list_offerings' then
     perform sandbox_commerce_v1.test_store_v3_provision_hold(plan.id,t.id,'project_inventory_unresolved',true);
   end if;
 else
   if t.operation in ('create_offering','create_package') and p_observation->>'kind'='resource' then
     item:=p_observation#>'{items,0}';
     if row(item->>'lookupKey',item->>'displayName') is distinct from
       row(case when kind='offering' then plan.offering_lookup_key else plan.package_lookup_key end,
           case when kind='offering' then plan.offering_display_name else plan.package_display_name end)
       or(kind='offering' and row(item->>'projectId',item->>'state',item->'isCurrent')
         is distinct from row(connection.project_id,connection.qualified_offering_state,'false'::jsonb))
     then perform sandbox_commerce_v1.test_store_v3_provision_hold(plan.id,t.id,'created_resource_mismatch');
     else observed_provider_id:=item->>'id'; end if;
   elsif t.operation in ('list_offerings','list_packages') and p_observation->>'kind'='list' then
     scan:=sandbox_commerce_v1.test_store_v3_scan(plan.id,t.operation);
     if scan->>'status'='invalid' then perform sandbox_commerce_v1.test_store_v3_provision_hold(plan.id,t.id,'reconciliation_scan_invalid');
     elsif scan->>'status'='complete' then
       select coalesce(jsonb_agg(value),'[]'::jsonb) into candidates from jsonb_array_elements(scan->'items')
        where value->>'lookupKey'=case when kind='offering' then plan.offering_lookup_key else plan.package_lookup_key end;
       if jsonb_array_length(candidates)>1 then perform sandbox_commerce_v1.test_store_v3_provision_hold(plan.id,t.id,'reconciliation_ambiguous');
       elsif jsonb_array_length(candidates)=1 and exists(select 1 from sandbox_commerce_v1.test_store_v3_tickets
         where plan_id=plan.id and operation=case when kind='offering' then 'create_offering' else 'create_package' end) then
         item:=candidates->0;
         if item->>'displayName' is distinct from (case when kind='offering' then plan.offering_display_name else plan.package_display_name end)
           or(kind='offering' and row(item->>'projectId',item->>'state',item->'isCurrent')
             is distinct from row(connection.project_id,connection.qualified_offering_state,'false'::jsonb))
         then perform sandbox_commerce_v1.test_store_v3_provision_hold(plan.id,t.id,'reconciliation_candidate_mismatch');
         else observed_provider_id:=item->>'id'; end if;
       end if;
     end if;
   end if;
   if observed_provider_id is not null then
     select b.* into bound from sandbox_commerce_v1.test_store_v3_object_bindings b where b.kind=case when t.operation in ('create_offering','list_offerings') then 'offering' else 'package' end
       and (b.plan_id=plan.id or b.provider_id=observed_provider_id) limit 1;
     if bound.plan_id is not null and row(bound.plan_id,bound.provider_id) is distinct from row(plan.id,observed_provider_id) then
       perform sandbox_commerce_v1.test_store_v3_provision_hold(plan.id,t.id,'provider_object_collision',true);
     elsif bound.plan_id is null then
       insert into sandbox_commerce_v1.test_store_v3_object_bindings(plan_id,kind,provider_id,ticket_id)
         values(plan.id,case when t.operation in ('create_offering','list_offerings') then 'offering' else 'package' end,observed_provider_id,t.id);
     end if;
   end if;
   perform sandbox_commerce_v1.test_store_v3_try_register(plan.id);
 end if;
 return jsonb_build_object('status','recorded','ticketId',t.id,'evidenceSha256',evidence_hash,'ackAllowed',true);
end; $$;

create function sandbox_commerce_v1.test_store_v3_provision_next(p_plan uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare plan sandbox_commerce_v1.test_store_v3_plans; customer sandbox_commerce_v1.test_store_v3_customers;
 allocation sandbox_commerce_v1.test_store_v3_allocations; controls sandbox_commerce_v1.test_store_v3_controls;
 offering_id text; package_id text; op text; cursor text; scan jsonb; attempted boolean; attached_at timestamptz;
begin
 perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
 if p_plan is null then raise exception 'test_store_v3_plan_required'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('test-store-v3-provision-plan:'||p_plan,683)) then return jsonb_build_object('status','waiting'); end if;
 select * into strict plan from sandbox_commerce_v1.test_store_v3_plans where id=p_plan;
 select * into strict customer from sandbox_commerce_v1.test_store_v3_customers where id=plan.customer_id;
 select * into strict allocation from sandbox_commerce_v1.test_store_v3_allocations where plan_id=plan.id;
 if sandbox_commerce_v1.test_store_v3_is_held(customer.id,allocation.id) then return jsonb_build_object('status','held'); end if;
 if exists(select 1 from sandbox_commerce_v1.test_store_v3_registrations where plan_id=plan.id) then return jsonb_build_object('status','registered'); end if;
 select * into strict controls from sandbox_commerce_v1.test_store_v3_controls where singleton;
 if not controls.provisioning_enabled or controls.requests_per_minute<=0 or controls.max_active_plans<=0 or controls.max_pages<=0
 then return jsonb_build_object('status','unavailable'); end if;
 if exists(select 1 from sandbox_commerce_v1.test_store_v3_work_leases where plan_id=plan.id and expires_at>clock_timestamp()) then return jsonb_build_object('status','waiting'); end if;
 select provider_id into offering_id from sandbox_commerce_v1.test_store_v3_object_bindings where plan_id=plan.id and kind='offering';
 select provider_id into package_id from sandbox_commerce_v1.test_store_v3_object_bindings where plan_id=plan.id and kind='package';
 if offering_id is null then
   op:='list_offerings'; scan:=sandbox_commerce_v1.test_store_v3_scan(plan.id,op);
   attempted:=exists(select 1 from sandbox_commerce_v1.test_store_v3_tickets where plan_id=plan.id and operation='create_offering');
   if scan->>'status'='complete' then
     if attempted then
       if (scan->>'recordedAt')::timestamptz>=clock_timestamp()-interval '5 seconds'
         and not exists(select 1 from sandbox_commerce_v1.test_store_v3_tickets t where t.plan_id=plan.id and t.operation='create_offering'
           and t.consumed_at>=(select consumed_at from sandbox_commerce_v1.test_store_v3_tickets where id=(scan->>'rootTicketId')::uuid))
       then return jsonb_build_object('status','waiting'); end if;
       scan:=null;
     elsif (scan->>'recordedAt')::timestamptz>=clock_timestamp()-interval '5 seconds' then op:='create_offering'; end if;
   end if;
 elsif package_id is null then
   attempted:=exists(select 1 from sandbox_commerce_v1.test_store_v3_tickets where plan_id=plan.id and operation='create_package');
   if not attempted then op:='create_package'; else op:='list_packages'; scan:=sandbox_commerce_v1.test_store_v3_scan(plan.id,op);
     if scan->>'status'='complete' then
       if (scan->>'recordedAt')::timestamptz>=clock_timestamp()-interval '5 seconds' then return jsonb_build_object('status','waiting'); end if;
       scan:=null;
     end if;
   end if;
 elsif not exists(select 1 from sandbox_commerce_v1.test_store_v3_tickets where plan_id=plan.id and operation='attach_product') then op:='attach_product';
 elsif not exists(select 1 from sandbox_commerce_v1.test_store_v3_tickets t join sandbox_commerce_v1.test_store_v3_transport_evidence e on e.ticket_id=t.id
   where t.plan_id=plan.id and t.operation='read_offering' and e.observation->>'kind'='resource'
     and t.consumed_at>=(select consumed_at from sandbox_commerce_v1.test_store_v3_tickets where plan_id=plan.id and operation='attach_product')) then op:='read_offering';
 else
   select consumed_at into attached_at from sandbox_commerce_v1.test_store_v3_tickets where plan_id=plan.id and operation='attach_product';
   op:='list_packages'; scan:=sandbox_commerce_v1.test_store_v3_scan(plan.id,op);
   if scan->>'rootTicketId' is not null and (select consumed_at from sandbox_commerce_v1.test_store_v3_tickets where id=(scan->>'rootTicketId')::uuid)<attached_at then scan:=null; end if;
   if scan->>'status'='complete' then
     op:='list_package_products'; scan:=sandbox_commerce_v1.test_store_v3_scan(plan.id,op);
     if scan->>'rootTicketId' is not null and (select consumed_at from sandbox_commerce_v1.test_store_v3_tickets where id=(scan->>'rootTicketId')::uuid)<attached_at then scan:=null; end if;
     if scan->>'status'='complete' then
       if jsonb_array_length(scan->'items')=0 then
         if (scan->>'recordedAt')::timestamptz>=clock_timestamp()-interval '5 seconds' then return jsonb_build_object('status','waiting'); end if;
         scan:=null;
       else op:='read_product'; scan:=null; end if;
     end if;
   end if;
 end if;
 if scan->>'status'='invalid' then return jsonb_build_object('status','held'); end if;
 cursor:=case when scan->>'status'='continue' then scan->>'nextCursor' end;
 if scan->>'status'='continue' and (scan->>'pages')::integer>=controls.max_pages then return jsonb_build_object('status','waiting'); end if;
 return jsonb_build_object('status','step','selector',jsonb_build_object('planId',plan.id,'operation',op,'requestId',gen_random_uuid(),'cursor',cursor));
end; $$;

create function sandbox_commerce_v1.test_store_v3_provision_plan(p_buyer uuid,p_intent uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare matched_plan uuid;
begin
 perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
 if p_buyer is null or p_intent is null then raise exception 'test_store_v3_plan_identity_required'; end if;
 select p.id into matched_plan from sandbox_commerce_v1.test_store_v3_plans p
 join sandbox_commerce_v1.test_store_v3_allocations a on a.plan_id=p.id and a.intent_id=p.intent_id and a.customer_id=p.customer_id
 join sandbox_commerce_v1.test_store_v3_customers c on c.id=p.customer_id
 join sandbox_commerce_v1.intents i on i.id=p.intent_id and i.buyer_id=c.buyer_id
 where i.id=p_intent and c.buyer_id=p_buyer;
 return jsonb_build_object('planId',matched_plan);
end; $$;

revoke all on function sandbox_commerce_v1.test_store_v3_canonical(jsonb),sandbox_commerce_v1.test_store_v3_hash(jsonb),
 sandbox_commerce_v1.test_store_v3_provision_hold(uuid,uuid,text,boolean),sandbox_commerce_v1.test_store_v3_scan(uuid,text),
 sandbox_commerce_v1.test_store_v3_fact_valid(jsonb,text),sandbox_commerce_v1.test_store_v3_product_matches(jsonb,sandbox_commerce_v1.test_store_v3_products,sandbox_commerce_v1.test_store_v3_connections),
 sandbox_commerce_v1.test_store_v3_request(jsonb),sandbox_commerce_v1.test_store_v3_provision_claim(uuid,text,uuid,text),
 sandbox_commerce_v1.test_store_v3_try_register(uuid),sandbox_commerce_v1.test_store_v3_provision_record(uuid,jsonb,jsonb),
 sandbox_commerce_v1.test_store_v3_provision_next(uuid),sandbox_commerce_v1.test_store_v3_provision_plan(uuid,uuid) from public,anon,authenticated,service_role;
reset role;
grant usage,create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.isolated_test_store_v3_provisioning_claim_v1(p_plan_id uuid,p_operation text,p_request_id uuid,p_cursor text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin perform sandbox_commerce_v1.arm_transaction_timeout(); return sandbox_commerce_v1.test_store_v3_provision_claim(p_plan_id,p_operation,p_request_id,p_cursor); end; $$;
create function public.isolated_test_store_v3_provisioning_record_v1(p_ticket_id uuid,p_evidence jsonb,p_observation jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin perform sandbox_commerce_v1.arm_transaction_timeout(); return sandbox_commerce_v1.test_store_v3_provision_record(p_ticket_id,p_evidence,p_observation); end; $$;
create function public.isolated_test_store_v3_provisioning_next_v1(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin perform sandbox_commerce_v1.arm_transaction_timeout(); return sandbox_commerce_v1.test_store_v3_provision_next(p_plan_id); end; $$;
create function public.isolated_test_store_v3_provisioning_plan_v1(p_buyer_id uuid,p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin perform sandbox_commerce_v1.arm_transaction_timeout(); return sandbox_commerce_v1.test_store_v3_provision_plan(p_buyer_id,p_intent_id); end; $$;
revoke all on function public.isolated_test_store_v3_provisioning_claim_v1(uuid,text,uuid,text),
 public.isolated_test_store_v3_provisioning_record_v1(uuid,jsonb,jsonb),public.isolated_test_store_v3_provisioning_next_v1(uuid),
 public.isolated_test_store_v3_provisioning_plan_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.isolated_test_store_v3_provisioning_claim_v1(uuid,text,uuid,text),
 public.isolated_test_store_v3_provisioning_record_v1(uuid,jsonb,jsonb),public.isolated_test_store_v3_provisioning_next_v1(uuid),
 public.isolated_test_store_v3_provisioning_plan_v1(uuid,uuid) to service_role;
reset role;
revoke create on schema public from sbx_v1_core_owner;
