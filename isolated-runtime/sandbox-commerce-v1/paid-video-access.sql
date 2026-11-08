-- Inactive protocol-3 extension. Install only after the complete separately
-- qualified test_store_v3 source, paid-video-media and delivery-authority.
-- No route, product, credential, grant or enabled control is provisioned here.
set local role sbx_v1_core_owner;

create table sandbox_commerce_v1.paid_video_receipt_links (
 receipt_id uuid primary key references sandbox_commerce_v1.receipts(id),
 allocation_id uuid not null unique references sandbox_commerce_v1.test_store_v3_allocations(id),
 ingress_id uuid not null references sandbox_commerce_v1.test_store_v3_ingress(id),
 linked_at timestamptz not null default clock_timestamp()
);
alter table sandbox_commerce_v1.paid_video_receipt_links enable row level security;
alter table sandbox_commerce_v1.paid_video_receipt_links force row level security;
create policy core_owner on sandbox_commerce_v1.paid_video_receipt_links
 for all to sbx_v1_core_owner using(true) with check(true);
revoke all on sandbox_commerce_v1.paid_video_receipt_links from public,anon,authenticated,service_role;
create trigger immutable before update or delete on sandbox_commerce_v1.paid_video_receipt_links
 for each row execute function sandbox_commerce_v1.protect_resource_identity();
create trigger no_truncate before truncate on sandbox_commerce_v1.paid_video_receipt_links
 for each statement execute function sandbox_commerce_v1.test_store_v3_immutable();

-- Private only. The raw authenticated protocol-3 projector calls this AFTER
-- inserting its exact receipt event, in the same bounded transaction. A failed
-- settlement rolls back that projection; a runtime-normalized receipt cannot
-- establish this link or issue a grant.
create function sandbox_commerce_v1.settle_paid_video_receipt_v3(p_ingress uuid,p_allocation uuid,p_receipt uuid)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare a sandbox_commerce_v1.test_store_v3_allocations; c sandbox_commerce_v1.test_store_v3_customers;
 cn sandbox_commerce_v1.test_store_v3_connections; e sandbox_commerce_v1.test_store_v3_ingress;
 r sandbox_commerce_v1.receipts; i sandbox_commerce_v1.intents; o sandbox_commerce_v1.offers;
 link sandbox_commerce_v1.paid_video_receipt_links; result jsonb;
begin
 perform sandbox_commerce_v1.assert_generation(false);
 select * into strict a from sandbox_commerce_v1.test_store_v3_allocations where id=p_allocation;
 select * into strict c from sandbox_commerce_v1.test_store_v3_customers where id=a.customer_id;
 select * into strict cn from sandbox_commerce_v1.test_store_v3_connections where id=c.connection_id and revision=c.connection_revision;
 select * into strict e from sandbox_commerce_v1.test_store_v3_ingress where id=p_ingress;
 select * into strict r from sandbox_commerce_v1.receipts where id=p_receipt for share nowait;
 select * into strict i from sandbox_commerce_v1.intents where id=r.intent_id for share nowait;
 select * into strict o from sandbox_commerce_v1.offers where id=i.offer_id;
 if i.kind<>'paid_content' or i.state<>'verified' or r.state<>'verified'
  or i.provider<>'revenuecat' or i.store<>'test_store' or i.currency<>'usd'
  or row(r.provider,r.scope_key,r.store,r.product_id) is distinct from row(i.provider,i.scope_key,i.store,i.product_id)
  or row(i.id,i.buyer_id,i.buyer_session_id,i.dispatch_id) is distinct from row(a.intent_id,c.buyer_id,a.buyer_session_id,a.dispatch_id)
  or row(e.connection_id,e.connection_revision,e.project_id) is distinct from row(cn.id,cn.revision,cn.project_id)
  or i.scope_key<>cn.scope_key or e.observation->>'mode' is distinct from 'paid_video_purchase'
  or e.observation->>'originalTransactionId' is distinct from r.original_transaction_id
  or e.observation->>'transactionId' is distinct from r.transaction_id
  or e.observation->>'customerId' is distinct from c.provider_app_user_id
  or not exists(select 1 from sandbox_commerce_v1.paid_video_catalog pc where pc.catalog_id=o.catalog_id and pc.protocol=3)
  or not exists(select 1 from sandbox_commerce_v1.test_store_v3_original_bindings b
    where b.project_id=cn.project_id and b.app_id=cn.app_id and b.allocation_id=a.id
      and b.original_transaction_id=r.original_transaction_id and b.transaction_id=r.transaction_id)
  or not exists(select 1 from sandbox_commerce_v1.receipt_events re
    where re.provider=r.provider and re.scope_key=r.scope_key and re.event_id=e.provider_event_id and re.receipt_id=r.id
      and re.payload->>'protocol'='scv3-test-store-raw-effect-v1'
      and re.payload->>'ingressId'=e.id::text and re.payload->>'rawSha256'=e.raw_sha256)
 then raise exception 'paid_video_exact_raw_receipt_required' using errcode='42501'; end if;
 if sandbox_commerce_v1.test_store_v3_is_held(c.id,a.id)
 then raise exception 'paid_video_provider_evidence_held' using errcode='42501'; end if;
 select * into link from sandbox_commerce_v1.paid_video_receipt_links where receipt_id=r.id;
 if found then
  if link.allocation_id<>a.id then raise exception 'paid_video_receipt_link_conflict'; end if;
 else
  insert into sandbox_commerce_v1.paid_video_receipt_links(receipt_id,allocation_id,ingress_id) values(r.id,a.id,e.id);
 end if;
 result:=sandbox_commerce_v1.settle_resource_receipt(r.id);
 return result||jsonb_build_object('protocol','scpv-receipt-settlement-v3','receiptId',r.id,
   'accessRequiresCurrentAuthorization',true,'financialAuthority',false,'notPayable',true);
end; $$;

-- Evaluate immediately before origin I/O and again before releasing each bounded
-- range. Transactions end before network I/O. This is a five-second, current
-- authority projection, not a reusable URL or a promise to revoke buffered bytes.
create function sandbox_commerce_v1.paid_video_current_access_v3(p_user uuid,p_session uuid,p_resource uuid,p_grant uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare g sandbox_commerce_v1.resource_grants; r sandbox_commerce_v1.receipts; i sandbox_commerce_v1.intents;
 link sandbox_commerce_v1.paid_video_receipt_links; a sandbox_commerce_v1.test_store_v3_allocations;
 c sandbox_commerce_v1.test_store_v3_customers; cn sandbox_commerce_v1.test_store_v3_connections;
 ctl sandbox_commerce_v1.test_store_v3_controls; original sandbox_commerce_v1.original_states;
 upload sandbox_commerce_v1.paid_video_uploads; route sandbox_commerce_v1.paid_video_routes;
 asset sandbox_commerce_v1.delivery_assets; video sandbox_commerce_v1.video_terms;
 authority jsonb; delivery jsonb; deadline timestamptz;
begin
 perform sandbox_commerce_v1.assert_provider_service();
 if p_user is null or p_session is null or p_resource is null or p_grant is null
 then raise exception 'paid_video_access_binding_required' using errcode='42501'; end if;
 -- Retired generations retain history but issue no new video byte leases.
 perform sandbox_commerce_v1.assert_generation(true);
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 -- Freeze absent holds and competing grant insertions for this short read.
 lock table sandbox_commerce_v1.resource_grants,sandbox_commerce_v1.resource_delivery_holds,
  sandbox_commerce_v1.test_store_v3_holds in share mode nowait;
 select * into strict g from sandbox_commerce_v1.resource_grants where id=p_grant and buyer_id=p_user
  and product_id=p_resource for share nowait;
 select * into strict r from sandbox_commerce_v1.receipts where id=g.receipt_id for share nowait;
 select * into strict i from sandbox_commerce_v1.intents where id=r.intent_id for share nowait;
 select * into strict link from sandbox_commerce_v1.paid_video_receipt_links where receipt_id=r.id;
 select * into strict a from sandbox_commerce_v1.test_store_v3_allocations where id=link.allocation_id;
 select * into strict c from sandbox_commerce_v1.test_store_v3_customers where id=a.customer_id;
 select * into strict cn from sandbox_commerce_v1.test_store_v3_connections where id=c.connection_id and revision=c.connection_revision for share nowait;
 select * into strict ctl from sandbox_commerce_v1.test_store_v3_controls where singleton for share nowait;
 select * into strict original from sandbox_commerce_v1.original_states where provider=r.provider and scope_key=r.scope_key
  and store=r.store and original_transaction_id=r.original_transaction_id for share nowait;
 if i.kind<>'paid_content' or i.state<>'verified' or r.state<>'verified' or original.state<>'verified'
  or g.revoked_at is not null or i.provider<>'revenuecat' or i.store<>'test_store' or i.currency<>'usd'
  or i.buyer_id<>p_user or c.buyer_id<>p_user or a.intent_id<>i.id or a.dispatch_id<>i.dispatch_id
  or row(g.product_id,g.product_revision) is distinct from row(i.resource_id,i.resource_revision)
  or row(r.provider,r.scope_key,r.store,r.product_id) is distinct from row(i.provider,i.scope_key,i.store,i.product_id)
  or row(original.buyer_id,original.intent_id,original.receipt_id,original.transaction_id,original.product_id)
    is distinct from row(p_user,i.id,r.id,r.transaction_id,r.product_id)
  or original.refunded_minor<>0 or original.amount_minor is distinct from i.amount_minor or original.currency is distinct from i.currency
  or i.scope_key<>cn.scope_key or not cn.qualified or not ctl.ingress_enabled
  or row(ctl.connection_id,ctl.connection_revision) is distinct from row(cn.id,cn.revision)
  or not exists(select 1 from sandbox_commerce_v1.test_store_v3_original_bindings b
    where b.project_id=cn.project_id and b.app_id=cn.app_id and b.allocation_id=a.id
      and b.original_transaction_id=r.original_transaction_id and b.transaction_id=r.transaction_id)
  or not exists(select 1 from sandbox_commerce_v1.test_store_v3_effects e where e.ingress_id=link.ingress_id
    and e.status='processed' and e.result#>>'{projection,receiptId}'=r.id::text)
 then raise exception 'paid_video_current_receipt_required' using errcode='42501'; end if;
 perform sandbox_commerce_v1.test_store_v3_scope_exclusive(cn.project_id);
 if sandbox_commerce_v1.test_store_v3_is_held(c.id,a.id)
 then raise exception 'paid_video_provider_evidence_held' using errcode='42501'; end if;
 if (sandbox_commerce_v1.current_resource_grant(p_user,p_resource,g.product_revision)).id is distinct from g.id
 then raise exception 'paid_video_exact_current_grant_required' using errcode='42501'; end if;
 delivery:=sandbox_commerce_v1.authorize_resource_delivery(p_user,p_session,p_resource,g.product_revision,
  p_resource,g.product_revision,'play_video');
 if delivery->>'issuer' is distinct from 'media_signer' or delivery->>'eligibleForIssuer' is distinct from 'true'
 then raise exception 'paid_video_media_authority_required' using errcode='42501'; end if;
 select * into strict video from sandbox_commerce_v1.video_terms where resource_id=p_resource and revision=g.product_revision;
 asset:=sandbox_commerce_v1.clean_resource_asset(video.asset_id,p_resource,g.product_revision,i.creator_id,'video');
 select * into strict upload from sandbox_commerce_v1.paid_video_uploads where resource_id=p_resource and asset_id=asset.id for share nowait;
 select * into strict route from sandbox_commerce_v1.paid_video_routes where id=upload.route_id for share nowait;
 if not route.active or route.provider<>'s3' or upload.state<>'clean' or upload.moderation<>'clear'
  or row(route.provider,route.bucket,upload.object_key,upload.object_version,upload.incarnation,upload.expected_sha256,upload.expected_byte_length)
   is distinct from row(asset.provider,asset.bucket,asset.object_key,asset.object_version,asset.incarnation,asset.sha256,asset.byte_length)
 then raise exception 'paid_video_current_object_required' using errcode='42501'; end if;
 deadline:=least(transaction_timestamp()+interval '5 seconds',(authority->>'valid_until')::timestamptz,
   to_timestamp((delivery#>>'{binding,expiresAtMs}')::numeric/1000));
 perform sandbox_commerce_v1.assert_fresh(authority);
 if deadline is null or not isfinite(deadline) or clock_timestamp()>=deadline
 then raise exception 'paid_video_access_expired' using errcode='42501'; end if;
 return jsonb_build_object('protocol','scpv-current-access-v3',
  'actor',jsonb_build_object('userId',p_user,'sessionGeneration',p_session),
  'resourceId','scv1_resource_'||p_resource,'grantId','scv1_grant_'||g.id,'receiptId','scv1_receipt_'||r.id,
  'originalTransactionId',r.original_transaction_id,'customerId','scv3_customer_'||c.id,'projectId',cn.project_id,
  'validUntilMs',floor(extract(epoch from deadline)*1000),
  'object',jsonb_build_object('provider',asset.provider,'bucket',asset.bucket,'routeId',route.id,
   'objectKey',asset.object_key,'incarnation',asset.incarnation,'expectedSha256',asset.sha256,
   'expectedByteLength',asset.byte_length,'objectVersion',asset.object_version));
end; $$;
revoke all on function sandbox_commerce_v1.settle_paid_video_receipt_v3(uuid,uuid,uuid),
 sandbox_commerce_v1.paid_video_current_access_v3(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
reset role;

create function public.isolated_paid_video_access_v3(p_user_id uuid,p_session_id uuid,p_resource_id uuid,p_grant_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.paid_video_current_access_v3(p_user_id,p_session_id,p_resource_id,p_grant_id);
end; $$;
alter function public.isolated_paid_video_access_v3(uuid,uuid,uuid,uuid) owner to sbx_v1_core_owner;
revoke all on function public.isolated_paid_video_access_v3(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.isolated_paid_video_access_v3(uuid,uuid,uuid,uuid) to service_role;
