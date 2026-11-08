-- Separate protocol v2. A slot release is not cancellation or payment evidence.
set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.test_store_v2_customer_json(c sandbox_commerce_v1.test_store_v2_customers)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id','scv2_customer_'||c.id,'buyerId',c.buyer_id,'installationId',c.installation_id,
   'providerAppUserId',c.provider_app_user_id,'configurationDigest',c.configuration_digest,
   'projectId',connection.project_id,'appId',connection.app_id,'providerScopeKey',connection.scope_key,
   'economicApplicationId',connection.economic_application_id,'provider','revenuecat','store','TEST_STORE','sourceEnvironment','SANDBOX')
 from sandbox_commerce_v1.test_store_v2_connections connection
 where connection.id=c.connection_id and connection.revision=c.connection_revision;
$$;
create function sandbox_commerce_v1.test_store_v2_allocation_json(a sandbox_commerce_v1.test_store_v2_allocations)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id','scv2_allocation_'||a.id,'intentId','scv1_intent_'||a.intent_id,'dispatchId',a.dispatch_id,
   'customerBindingId','scv2_customer_'||a.customer_id,'configurationDigest',c.configuration_digest,
   'productId',i.product_id,'quote',a.quote,'acceptPurchaseUntil',i.expires_at,
   'registration',case when r.id is null then null else jsonb_build_object('id','scv2_registration_'||r.id,
     'providerOfferingId',r.provider_offering_id,'offeringIdentifier',r.offering_identifier,
     'providerPackageId',r.provider_package_id,'packageIdentifier',r.package_identifier,
     'providerProductId',r.provider_product_id,'productId',r.product_id) end)
 from sandbox_commerce_v1.intents i join sandbox_commerce_v1.test_store_v2_customers c on c.id=a.customer_id
 left join sandbox_commerce_v1.test_store_v2_registrations r on r.plan_id=a.plan_id where i.id=a.intent_id;
$$;
create function sandbox_commerce_v1.test_store_v2_status(p_customer uuid,p_allocation uuid default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare c sandbox_commerce_v1.test_store_v2_customers; a sandbox_commerce_v1.test_store_v2_allocations;
 reservation sandbox_commerce_v1.test_store_v2_reservations; i sandbox_commerce_v1.intents;
 receipt sandbox_commerce_v1.receipts; status text; reason text; receipt_json jsonb;
begin
 select * into strict c from sandbox_commerce_v1.test_store_v2_customers where id=p_customer;
 select * into strict reservation from sandbox_commerce_v1.test_store_v2_reservations where customer_id=c.id for share nowait;
 select * into a from sandbox_commerce_v1.test_store_v2_allocations
   where id=coalesce(p_allocation,reservation.active_allocation_id) and customer_id=c.id;
 if p_allocation is not null and a.id is null then raise exception 'test_store_v2_allocation_mismatch'; end if;
 if a.id is not null then
   select * into strict i from sandbox_commerce_v1.intents where id=a.intent_id;
   select * into receipt from sandbox_commerce_v1.receipts where intent_id=i.id for share nowait;
   if receipt.id is not null then receipt_json:=jsonb_build_object('id','scv1_receipt_'||receipt.id,'state',receipt.state,
     'providerTransactionId',receipt.transaction_id,'originalTransactionId',receipt.original_transaction_id,'purchasedAt',receipt.purchased_at); end if;
 end if;
 if sandbox_commerce_v1.test_store_v2_is_held(c.id,a.id) or receipt.state='quarantined'
 then status:='held'; reason:='test_store_v2_evidence_held';
 elsif a.id is null then status:='customer_bound'; reason:='test_store_v2_customer_only';
 elsif receipt.id is not null then status:=receipt.state; reason:='test_store_v2_historical_receipt';
 elsif i.dispatch_id is not null then status:='pending'; reason:='test_store_v2_provider_outcome_unknown';
 elsif i.state<>'prepared' or i.expires_at<=clock_timestamp()
   or exists(select 1 from sandbox_commerce_v1.test_store_v2_releases where allocation_id=a.id)
 then status:='expired'; reason:='test_store_v2_unclaimed_intent_closed';
 elsif exists(select 1 from sandbox_commerce_v1.test_store_v2_registrations where plan_id=a.plan_id)
 then status:='offering_ready'; reason:='test_store_v2_registered_offering';
 else status:='provisioning'; reason:='test_store_v2_offering_not_registered'; end if;
 return jsonb_build_object('status',status,'reason',reason,'dispatchAllowed',false,'retryProviderMutation',false,
   'grantsAccess',false,'notPayable',true,'customer',sandbox_commerce_v1.test_store_v2_customer_json(c),
   'allocation',case when a.id is null then null else sandbox_commerce_v1.test_store_v2_allocation_json(a) end,
   'reservation',jsonb_build_object('revision',reservation.revision,'activeAllocationId',case when reservation.active_allocation_id is null then null else 'scv2_allocation_'||reservation.active_allocation_id end),
   'authorityValidUntil',null,'receipt',receipt_json);
end; $$;

create function sandbox_commerce_v1.test_store_v2_begin_dispatch(p_allocation uuid,p_registration uuid)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare a sandbox_commerce_v1.test_store_v2_allocations; c sandbox_commerce_v1.test_store_v2_customers;
 connection sandbox_commerce_v1.test_store_v2_connections; controls sandbox_commerce_v1.test_store_v2_controls;
 profile sandbox_commerce_v1.test_store_v2_native_profiles; registration sandbox_commerce_v1.test_store_v2_registrations;
 i sandbox_commerce_v1.intents; o sandbox_commerce_v1.offers; resource sandbox_commerce_v1.resources;
 catalog sandbox_commerce_v1.catalog; product sandbox_commerce_v1.test_store_v2_products;
 reservation sandbox_commerce_v1.test_store_v2_reservations; attempt sandbox_commerce_v1.dispatch_attempts;
 buyer jsonb; seller jsonb; valid_until timestamptz;
begin
 perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
 select * into strict a from sandbox_commerce_v1.test_store_v2_allocations where id=p_allocation;
 select * into strict c from sandbox_commerce_v1.test_store_v2_customers where id=a.customer_id;
 select * into strict reservation from sandbox_commerce_v1.test_store_v2_reservations where customer_id=c.id for update nowait;
 select * into registration from sandbox_commerce_v1.test_store_v2_registrations where id=p_registration and plan_id=a.plan_id for share nowait;
 if registration.id is null then raise exception 'test_store_v2_registration_mismatch'; end if;
 select * into attempt from sandbox_commerce_v1.dispatch_attempts where intent_id=a.intent_id;
 if found then return sandbox_commerce_v1.test_store_v2_status(c.id,a.id); end if;
 perform sandbox_commerce_v1.assert_generation(true);
 if reservation.active_allocation_id is distinct from a.id or sandbox_commerce_v1.test_store_v2_is_held(c.id,a.id)
   or exists(select 1 from sandbox_commerce_v1.test_store_v2_releases where allocation_id=a.id)
 then raise exception 'test_store_v2_initiation_held'; end if;
 select * into strict controls from sandbox_commerce_v1.test_store_v2_controls where singleton for share nowait;
 select * into strict connection from sandbox_commerce_v1.test_store_v2_connections where id=c.connection_id and revision=c.connection_revision for share nowait;
 select * into strict profile from sandbox_commerce_v1.test_store_v2_native_profiles where configuration_digest=c.configuration_digest for share nowait;
 select * into registration from sandbox_commerce_v1.test_store_v2_registrations where id=p_registration and plan_id=a.plan_id for share nowait;
 if not controls.initiation_enabled or not controls.ingress_enabled or not controls.provisioning_enabled
   or not connection.qualified or not profile.qualified or registration.id is null
   or row(controls.connection_id,controls.connection_revision) is distinct from row(connection.id,connection.revision)
 then raise exception 'test_store_v2_route_unavailable'; end if;
 perform sandbox_commerce_v1.test_store_v2_scope_exclusive(connection.project_id);
 select * into strict i from sandbox_commerce_v1.intents where id=a.intent_id;
 buyer:=sandbox_commerce_v1.assert_authority(c.buyer_id,a.buyer_session_id,'buyer');
 seller:=sandbox_commerce_v1.assert_authority(i.creator_id,null,'creator_subject');
 -- Same own-quote lock order as checkout.prepare; never hold these across HTTP.
 select * into strict o from sandbox_commerce_v1.offers where id=i.offer_id for share nowait;
 select * into strict resource from sandbox_commerce_v1.resources where id=o.resource_id for share nowait;
 select * into strict catalog from sandbox_commerce_v1.catalog where id=o.catalog_id for share nowait;
 select * into strict product from sandbox_commerce_v1.test_store_v2_products where catalog_id=catalog.id for share nowait;
 select * into strict i from sandbox_commerce_v1.intents where id=a.intent_id for update nowait;
 if i.kind<>'creator_tip' or i.state<>'prepared' or i.dispatch_id is not null or i.expires_at<=clock_timestamp()
   or i.buyer_id<>c.buyer_id or i.buyer_session_id<>a.buyer_session_id or a.quote is distinct from sandbox_commerce_v1.test_store_quote(i)
   or i.provider<>'revenuecat' or i.store<>'test_store' or i.scope_key<>connection.scope_key or i.currency<>'usd'
   or o.revision<>i.offer_revision or o.status<>'published' or o.resource_id<>i.resource_id or o.resource_revision<>i.resource_revision
   or resource.revision<>i.resource_revision or resource.status<>'published' or resource.creator_id<>i.creator_id or resource.kind<>'creator_tip'
   or catalog.kind<>i.kind or catalog.provider<>i.provider or catalog.scope_key<>i.scope_key or catalog.store<>i.store
   or catalog.product_id<>i.product_id or catalog.amount_minor<>i.amount_minor or catalog.currency<>i.currency
   or not product.qualified or row(product.connection_id,product.connection_revision) is distinct from row(connection.id,connection.revision)
   or product.store_identifier<>i.product_id or product.amount_minor<>i.amount_minor or product.currency<>i.currency
   or registration.provider_product_id<>product.provider_product_id or registration.product_id<>i.product_id
 then raise exception 'test_store_v2_quote_or_source_changed'; end if;
 perform sandbox_commerce_v1.assert_fresh(buyer); perform sandbox_commerce_v1.assert_fresh(seller);
 valid_until:=least((buyer->>'valid_until')::timestamptz,(seller->>'valid_until')::timestamptz,i.expires_at);
 insert into sandbox_commerce_v1.dispatch_attempts(intent_id,dispatch_id,state,claimed_at,accept_purchase_until,authority_valid_until)
   values(i.id,a.dispatch_id,'claimed',clock_timestamp(),i.expires_at,valid_until) returning * into attempt;
 update sandbox_commerce_v1.intents set state='provider_pending',dispatch_id=a.dispatch_id,dispatched_at=attempt.claimed_at where id=i.id;
 perform sandbox_commerce_v1.assert_fresh(buyer); perform sandbox_commerce_v1.assert_fresh(seller);
 if clock_timestamp()>=valid_until then raise exception 'test_store_v2_dispatch_expired'; end if;
 return sandbox_commerce_v1.test_store_v2_status(c.id,a.id)||jsonb_build_object('status','dispatch_claimed',
   'reason','test_store_v2_one_use_sdk_admission','dispatchAllowed',true,'authorityValidUntil',valid_until);
end; $$;

create function sandbox_commerce_v1.test_store_v2_command(p_buyer uuid,p_session uuid,p_command text,
 p_request uuid,p_configuration_digest text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor jsonb; seller jsonb; allowed_keys text[]; previous sandbox_commerce_v1.test_store_v2_requests;
 controls sandbox_commerce_v1.test_store_v2_controls; connection sandbox_commerce_v1.test_store_v2_connections;
 profile sandbox_commerce_v1.test_store_v2_native_profiles; c sandbox_commerce_v1.test_store_v2_customers;
 a sandbox_commerce_v1.test_store_v2_allocations; reservation sandbox_commerce_v1.test_store_v2_reservations;
 i sandbox_commerce_v1.intents; o sandbox_commerce_v1.offers; product sandbox_commerce_v1.test_store_v2_products;
 resource sandbox_commerce_v1.resources; catalog sandbox_commerce_v1.catalog;
 plan sandbox_commerce_v1.test_store_v2_plans; release sandbox_commerce_v1.test_store_v2_releases;
 attempt sandbox_commerce_v1.dispatch_attempts; receipt sandbox_commerce_v1.receipts;
 result jsonb; existing_request boolean; installation uuid; next_plan uuid;
 candidate sandbox_commerce_v1.test_store_v2_customer_candidates;
begin
 perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
 if p_buyer is null or p_session is null or p_request is null or p_configuration_digest is null
   or p_configuration_digest !~ '^[a-f0-9]{64}$' or p_command is null or p_command not in ('bind','allocate','claim','read','report','advance')
   or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>4096
 then raise exception 'test_store_v2_command_invalid'; end if;
 allowed_keys:=case p_command when 'bind' then array['installationId']
   when 'allocate' then array['customerBindingId','intentId','expectedQuote']
   when 'claim' then array['intentId','dispatchId','registrationId','expectedQuote']
   when 'read' then array['intentId'] when 'report' then array['intentId','dispatchId','outcome','transactionHint']
   else array['intentId','dispatchId','expectedReservationRevision','disposition','expectedReceiptId'] end;
 if not p_payload ?& allowed_keys or (p_payload-allowed_keys)<>'{}'::jsonb then raise exception 'test_store_v2_command_shape_invalid'; end if;
 actor:=sandbox_commerce_v1.assert_authority(p_buyer,p_session,'delivery');
 if not pg_try_advisory_xact_lock(hashtextextended('test-store-v2-request:'||p_buyer||':'||p_request,683))
 then raise exception 'test_store_v2_request_busy' using errcode='55P03'; end if;
 select * into previous from sandbox_commerce_v1.test_store_v2_requests where buyer_id=p_buyer and request_id=p_request;
 existing_request:=found;
 if existing_request and row(previous.buyer_session_id,previous.command,previous.configuration_digest,previous.payload)
   is distinct from row(p_session,p_command,p_configuration_digest,p_payload)
 then raise exception 'test_store_v2_request_conflict'; end if;
 select * into profile from sandbox_commerce_v1.test_store_v2_native_profiles where configuration_digest=p_configuration_digest for share nowait;
 if profile.configuration_digest is null then raise exception 'test_store_v2_profile_unavailable'; end if;
 select * into strict connection from sandbox_commerce_v1.test_store_v2_connections where id=profile.connection_id and revision=profile.connection_revision for share nowait;
 if p_command='bind' then
   if jsonb_typeof(p_payload->'installationId') is distinct from 'string'
     or p_payload->>'installationId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   then raise exception 'test_store_v2_installation_invalid'; end if;
   installation:=(p_payload->>'installationId')::uuid;
   if not pg_try_advisory_xact_lock(hashtextextended('test-store-v2-installation:'||connection.project_id||':'||installation,683))
   then raise exception 'test_store_v2_installation_busy' using errcode='55P03'; end if;
   select * into c from sandbox_commerce_v1.test_store_v2_customers where project_id=connection.project_id and installation_id=installation;
   if c.id is null then
     perform sandbox_commerce_v1.assert_generation(true);
     select * into strict controls from sandbox_commerce_v1.test_store_v2_controls where singleton for share nowait;
     if not controls.initiation_enabled or not controls.ingress_enabled or not connection.qualified or not profile.qualified
       or row(controls.connection_id,controls.connection_revision) is distinct from row(connection.id,connection.revision)
     then raise exception 'test_store_v2_route_unavailable'; end if;
     perform sandbox_commerce_v1.test_store_v2_scope_exclusive(connection.project_id);
     actor:=sandbox_commerce_v1.assert_authority(p_buyer,p_session,'buyer');
     select * into candidate from sandbox_commerce_v1.test_store_v2_customer_candidates
       where project_id=connection.project_id and installation_id=installation;
     if candidate.installation_id is null then
       insert into sandbox_commerce_v1.test_store_v2_customer_candidates(project_id,installation_id,buyer_id,configuration_digest,connection_id,connection_revision,provider_app_user_id)
         values(connection.project_id,installation,p_buyer,p_configuration_digest,connection.id,connection.revision,'scv2_teststore_'||gen_random_uuid())
         returning * into candidate;
     elsif row(candidate.buyer_id,candidate.configuration_digest,candidate.connection_id,candidate.connection_revision)
       is distinct from row(p_buyer,p_configuration_digest,connection.id,connection.revision)
     then raise exception 'test_store_v2_installation_immutable' using errcode='42501'; end if;
     if sandbox_commerce_v1.test_store_qualification_gate(connection.project_id,null,null,null,null,candidate.provider_app_user_id) is distinct from 'not_qualification' then
       result:=jsonb_build_object('status','held','reason','test_store_v2_customer_qualification_excluded',
         'dispatchAllowed',false,'retryProviderMutation',false,'grantsAccess',false,'notPayable',true,
         'customer',null,'allocation',null,'reservation',null,'authorityValidUntil',null,'receipt',null);
     else
       insert into sandbox_commerce_v1.test_store_v2_customers(buyer_id,installation_id,configuration_digest,connection_id,connection_revision,project_id,provider_app_user_id)
         values(p_buyer,installation,p_configuration_digest,connection.id,connection.revision,connection.project_id,candidate.provider_app_user_id) returning * into c;
       insert into sandbox_commerce_v1.test_store_v2_reservations(customer_id) values(c.id);
     end if;
   elsif c.buyer_id<>p_buyer or c.configuration_digest<>p_configuration_digest
   then raise exception 'test_store_v2_installation_immutable' using errcode='42501'; end if;
 else
   if jsonb_typeof(p_payload->'intentId') is distinct from 'string' then raise exception 'test_store_v2_intent_invalid'; end if;
   select * into strict i from sandbox_commerce_v1.intents where id=sandbox_commerce_v1.identifier(p_payload->>'intentId','intent');
   if i.buyer_id<>p_buyer or i.kind<>'creator_tip' or i.provider<>'revenuecat' or i.store<>'test_store'
     or i.scope_key<>connection.scope_key or i.currency<>'usd' then raise exception 'test_store_v2_intent_unavailable'; end if;
   select * into a from sandbox_commerce_v1.test_store_v2_allocations where intent_id=i.id;
   if p_command='allocate' then
     select * into strict c from sandbox_commerce_v1.test_store_v2_customers where id=sandbox_commerce_v1.test_store_v2_id(p_payload->>'customerBindingId','customer');
   elsif a.id is not null then select * into strict c from sandbox_commerce_v1.test_store_v2_customers where id=a.customer_id;
   else raise exception 'test_store_v2_allocation_missing'; end if;
   if c.buyer_id<>p_buyer or c.configuration_digest<>p_configuration_digest or (a.id is not null and a.customer_id<>c.id)
   then raise exception 'test_store_v2_customer_mismatch'; end if;
   if p_command in ('allocate','claim','report') and i.buyer_session_id<>p_session then raise exception 'test_store_v2_original_session_required'; end if;
   if p_command in ('allocate','claim') and p_payload->'expectedQuote' is distinct from sandbox_commerce_v1.test_store_quote(i)
   then raise exception 'test_store_v2_quote_conflict'; end if;
   if p_command in ('claim','report','advance') and (jsonb_typeof(p_payload->'dispatchId') is distinct from 'string' or p_payload->>'dispatchId'<>a.dispatch_id::text)
   then raise exception 'test_store_v2_dispatch_conflict'; end if;
 end if;
 -- A qualification-excluded candidate has no customer or reservation. Preserve
 -- its held result through request persistence and the final freshness check.
 if c.id is not null then
   select * into strict reservation from sandbox_commerce_v1.test_store_v2_reservations where customer_id=c.id for update nowait;
 end if;
 if p_command='allocate' and a.id is null then
   perform sandbox_commerce_v1.assert_generation(true);
   select * into strict controls from sandbox_commerce_v1.test_store_v2_controls where singleton for share nowait;
   if reservation.active_allocation_id is not null then raise exception 'test_store_v2_reservation_occupied'; end if;
   if sandbox_commerce_v1.test_store_v2_is_held(c.id) or not controls.initiation_enabled or not controls.ingress_enabled
     or not controls.provisioning_enabled or not connection.qualified or not profile.qualified
     or row(controls.connection_id,controls.connection_revision) is distinct from row(connection.id,connection.revision)
   then raise exception 'test_store_v2_initiation_held'; end if;
   perform sandbox_commerce_v1.test_store_v2_scope_exclusive(connection.project_id);
   if not pg_try_advisory_xact_lock(hashtextextended('test-store-v2-capacity:'||connection.project_id,683))
   then raise exception 'test_store_v2_capacity_busy' using errcode='55P03'; end if;
   if (select count(*) from sandbox_commerce_v1.test_store_v2_plans p join sandbox_commerce_v1.test_store_v2_customers customer on customer.id=p.customer_id where customer.project_id=connection.project_id)>=controls.max_active_plans
   then raise exception 'test_store_v2_capacity_unavailable'; end if;
   actor:=sandbox_commerce_v1.assert_authority(p_buyer,p_session,'buyer');
   seller:=sandbox_commerce_v1.assert_authority(i.creator_id,null,'creator_subject');
   select * into strict o from sandbox_commerce_v1.offers where id=i.offer_id for share nowait;
   select * into strict resource from sandbox_commerce_v1.resources where id=o.resource_id for share nowait;
   select * into strict catalog from sandbox_commerce_v1.catalog where id=o.catalog_id for share nowait;
   select * into product from sandbox_commerce_v1.test_store_v2_products where catalog_id=o.catalog_id for share nowait;
   select * into strict i from sandbox_commerce_v1.intents where id=i.id for share nowait;
   if i.state<>'prepared' or i.dispatch_id is not null or i.expires_at<=clock_timestamp() or product.catalog_id is null or not product.qualified
     or o.revision<>i.offer_revision or o.status<>'published' or o.resource_id<>i.resource_id or o.resource_revision<>i.resource_revision
     or resource.revision<>i.resource_revision or resource.status<>'published' or resource.creator_id<>i.creator_id or resource.kind<>'creator_tip'
     or catalog.kind<>i.kind or catalog.provider<>i.provider or catalog.scope_key<>i.scope_key or catalog.store<>i.store
     or catalog.product_id<>i.product_id or catalog.amount_minor<>i.amount_minor or catalog.currency<>i.currency
     or product.store_identifier<>i.product_id or product.amount_minor<>i.amount_minor or product.currency<>i.currency
     or row(product.connection_id,product.connection_revision) is distinct from row(connection.id,connection.revision)
   then raise exception 'test_store_v2_intent_or_product_unavailable'; end if;
   next_plan:=gen_random_uuid();
   insert into sandbox_commerce_v1.test_store_v2_plans(id,intent_id,customer_id,catalog_id,offering_lookup_key,package_lookup_key,offering_display_name,package_display_name,quote)
     values(next_plan,i.id,c.id,product.catalog_id,'scv2_tip_'||replace(next_plan::text,'-',''),'scv2_tip','Sandbox tip '||next_plan,'Sandbox tip',sandbox_commerce_v1.test_store_quote(i)) returning * into plan;
   insert into sandbox_commerce_v1.test_store_v2_allocations(intent_id,dispatch_id,customer_id,plan_id,buyer_session_id,quote)
     values(i.id,gen_random_uuid(),c.id,plan.id,p_session,plan.quote) returning * into a;
   update sandbox_commerce_v1.test_store_v2_reservations set active_allocation_id=a.id,revision=revision+1 where customer_id=c.id;
   perform sandbox_commerce_v1.assert_fresh(seller);
 elsif p_command='claim' then
   result:=sandbox_commerce_v1.test_store_v2_begin_dispatch(a.id,sandbox_commerce_v1.test_store_v2_id(p_payload->>'registrationId','registration'));
 elsif p_command='report' then
   if jsonb_typeof(p_payload->'outcome') is distinct from 'string'
     or p_payload->>'outcome' not in ('sdk_success','sdk_cancelled','sdk_failed','sdk_unknown')
     or jsonb_typeof(p_payload->'transactionHint') not in ('null','string')
     or (p_payload->>'transactionHint' is not null and sandbox_commerce_v1.provider_text(p_payload->>'transactionHint') is not true)
     or i.dispatch_id is null then raise exception 'test_store_v2_report_invalid'; end if;
   insert into sandbox_commerce_v1.test_store_v2_reports values(p_buyer,p_request,a.id,p_payload->>'outcome',p_payload->>'transactionHint',clock_timestamp()) on conflict do nothing;
 elsif p_command='advance' then
   if jsonb_typeof(p_payload->'expectedReservationRevision') is distinct from 'number'
     or p_payload->>'expectedReservationRevision' !~ '^[1-9][0-9]{0,15}$'
     or (p_payload->>'expectedReservationRevision')::numeric>9007199254740991
     or jsonb_typeof(p_payload->'disposition') is distinct from 'string'
     or p_payload->>'disposition' not in ('receipt_recorded','retain_unknown')
   then raise exception 'test_store_v2_advance_invalid'; end if;
   result:=sandbox_commerce_v1.test_store_v2_status(c.id,a.id);
   select * into release from sandbox_commerce_v1.test_store_v2_releases where allocation_id=a.id;
   if result->>'status'<>'held' then
     if release.allocation_id is null then
       if reservation.active_allocation_id is distinct from a.id or reservation.revision<>(p_payload->>'expectedReservationRevision')::bigint
       then raise exception 'test_store_v2_reservation_conflict'; end if;
       select * into attempt from sandbox_commerce_v1.dispatch_attempts where intent_id=i.id;
       if attempt.intent_id is not null and attempt.authority_valid_until>clock_timestamp()
       then raise exception 'test_store_v2_old_dispatch_lease_active'; end if;
       select * into receipt from sandbox_commerce_v1.receipts where intent_id=i.id for share nowait;
       if p_payload->>'disposition'='receipt_recorded' then
         if receipt.id is null or p_payload->>'expectedReceiptId' is distinct from 'scv1_receipt_'||receipt.id
         then raise exception 'test_store_v2_receipt_conflict'; end if;
       elsif p_payload->'expectedReceiptId' is distinct from 'null'::jsonb or receipt.id is not null
       then raise exception 'test_store_v2_unknown_disposition_conflict'; end if;
       insert into sandbox_commerce_v1.test_store_v2_releases values(a.id,p_buyer,p_request,p_session,reservation.revision,p_payload->>'disposition',receipt.id,clock_timestamp());
       update sandbox_commerce_v1.test_store_v2_reservations set active_allocation_id=null,revision=revision+1 where customer_id=c.id;
     elsif not existing_request or release.request_id<>p_request then raise exception 'test_store_v2_advance_already_recorded'; end if;
     result:=sandbox_commerce_v1.test_store_v2_status(c.id,a.id)||jsonb_build_object('status','released','reason','test_store_v2_prior_outcome_retained');
   end if;
 end if;
 if not existing_request then insert into sandbox_commerce_v1.test_store_v2_requests values(p_buyer,p_request,p_session,p_command,p_configuration_digest,p_payload); end if;
 result:=coalesce(result,sandbox_commerce_v1.test_store_v2_status(c.id,a.id));
 perform sandbox_commerce_v1.assert_fresh(actor);
 if result->'dispatchAllowed'='true'::jsonb and clock_timestamp()>=(result->>'authorityValidUntil')::timestamptz
 then raise exception 'test_store_v2_dispatch_lease_expired'; end if;
 return jsonb_build_object('protocol','isolated-test-store-v2','command',p_command,'requestId',p_request,
   'actor',jsonb_build_object('userId',p_buyer,'sessionId',p_session),'generation',1,'environment','sandbox','result',result);
end; $$;
revoke all on function sandbox_commerce_v1.test_store_v2_customer_json(sandbox_commerce_v1.test_store_v2_customers),
 sandbox_commerce_v1.test_store_v2_allocation_json(sandbox_commerce_v1.test_store_v2_allocations),sandbox_commerce_v1.test_store_v2_status(uuid,uuid),
 sandbox_commerce_v1.test_store_v2_begin_dispatch(uuid,uuid),sandbox_commerce_v1.test_store_v2_command(uuid,uuid,text,uuid,text,jsonb)
 from public,anon,authenticated,service_role;
reset role;
grant usage,create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.isolated_test_store_command_v2(p_buyer_id uuid,p_session_id uuid,p_command text,p_request_id uuid,p_configuration_digest text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.test_store_v2_command(p_buyer_id,p_session_id,p_command,p_request_id,p_configuration_digest,p_payload);
end; $$;
revoke all on function public.isolated_test_store_command_v2(uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.isolated_test_store_command_v2(uuid,uuid,text,uuid,text,jsonb) to service_role;
reset role;
revoke create on schema public from sbx_v1_core_owner;
