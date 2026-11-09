-- Source only. Requires the native allocator's current-evidence helper. No
-- qualification, route or control is seeded here; Test Store V3 is untouched.
set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.native_store_paid_video_access(p_user uuid,p_session uuid,p_resource uuid,p_grant uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare g sandbox_commerce_v1.resource_grants;r sandbox_commerce_v1.receipts;i sandbox_commerce_v1.intents;
 asset sandbox_commerce_v1.delivery_assets;video sandbox_commerce_v1.video_terms;
 upload sandbox_commerce_v1.paid_video_uploads;route sandbox_commerce_v1.paid_video_routes;
 ctl sandbox_commerce_v1.paid_video_gateway_controls;authority jsonb;evidence jsonb;delivery jsonb;deadline timestamptz;
begin
 perform sandbox_commerce_v1.assert_provider_service();perform sandbox_commerce_v1.assert_generation(true);
 if p_user is null or p_session is null or p_resource is null or p_grant is null then raise exception 'native_video_binding_required';end if;
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 -- Same generic hold/grant graph as existing private delivery. NOWAIT prevents
 -- acknowledging access while intake or negative application changes it.
 lock table sandbox_commerce_v1.resource_grants,sandbox_commerce_v1.resource_delivery_holds in share mode nowait;
 select * into strict g from sandbox_commerce_v1.resource_grants where id=p_grant and buyer_id=p_user and product_id=p_resource for share nowait;
 select * into strict r from sandbox_commerce_v1.receipts where id=g.receipt_id for share nowait;
 select * into strict i from sandbox_commerce_v1.intents where id=r.intent_id for share nowait;
 if i.kind<>'paid_content' or i.state<>'verified' or r.state<>'verified' or g.revoked_at is not null
  or i.provider<>'revenuecat' or i.store not in('APP_STORE','PLAY_STORE') or i.currency<>'usd' or i.buyer_id<>p_user
  or row(g.product_id,g.product_revision) is distinct from row(i.resource_id,i.resource_revision)
  or row(r.provider,r.scope_key,r.store,r.product_id) is distinct from row(i.provider,i.scope_key,i.store,i.product_id)
 then raise exception 'native_video_exact_receipt_required';end if;
 -- This owner-private helper re-reads allocation, original journal/effect and
 -- mapping/dispatch/connection revocations under the common project lock. A
 -- generic verified receipt or caller-supplied boolean is never sufficient.
 evidence:=sandbox_commerce_v1.native_store_assert_current_allocation(r.id,p_user);
 if evidence->>'allocationId' is null or evidence->>'projectId' is null
  or evidence->>'originalTransactionId' is distinct from r.original_transaction_id
 then raise exception 'native_video_current_allocation_required';end if;
 if (sandbox_commerce_v1.current_resource_grant(p_user,p_resource,g.product_revision)).id is distinct from g.id
 then raise exception 'native_video_exact_current_grant_required';end if;
 delivery:=sandbox_commerce_v1.authorize_resource_delivery(p_user,p_session,p_resource,g.product_revision,p_resource,g.product_revision,'play_video');
 if delivery->>'issuer' is distinct from 'media_signer' or delivery->>'eligibleForIssuer' is distinct from 'true'
 then raise exception 'native_video_media_authority_required';end if;
 select * into strict video from sandbox_commerce_v1.video_terms where resource_id=p_resource and revision=g.product_revision;
 asset:=sandbox_commerce_v1.clean_resource_asset(video.asset_id,p_resource,g.product_revision,i.creator_id,'video');
 select * into strict upload from sandbox_commerce_v1.paid_video_uploads where resource_id=p_resource and asset_id=asset.id for share nowait;
 select * into strict route from sandbox_commerce_v1.paid_video_routes where id=upload.route_id for share nowait;
 select * into strict ctl from sandbox_commerce_v1.paid_video_gateway_controls where singleton for share nowait;
 perform 1 from sandbox_commerce_v1.paid_video_workers where id=ctl.worker_id and active for share nowait;
 if not found then raise exception 'native_video_worker_unavailable';end if;
 perform 1 from sandbox_commerce_v1.paid_video_verifiers v where v.id=ctl.verifier_id and v.active
  and not exists(select 1 from sandbox_commerce_v1.paid_video_workers w where w.hmac_key=v.hmac_key) for share of v nowait;
 if not found then raise exception 'native_video_verifier_unavailable';end if;
 if not ctl.enabled or ctl.route_id is distinct from route.id or not route.active or route.provider<>'s3' or upload.state<>'clean' or upload.moderation<>'clear'
  or row(route.provider,route.bucket,upload.object_key,upload.object_version,upload.incarnation,upload.expected_sha256,upload.expected_byte_length)
   is distinct from row(asset.provider,asset.bucket,asset.object_key,asset.object_version,asset.incarnation,asset.sha256,asset.byte_length)
  or not exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts o join sandbox_commerce_v1.paid_video_transfers t on t.id=o.transfer_id
   where o.upload_id=upload.id and o.verifier_id=ctl.verifier_id and o.object_version=upload.object_version and t.upload_id=upload.id and t.user_id=upload.creator_id
    and o.observation_raw::jsonb->>'incarnation'=upload.incarnation::text and o.observation_raw::jsonb->>'sha256'=upload.expected_sha256
    and (o.observation_raw::jsonb->>'byteLength')::bigint=upload.expected_byte_length)
 then raise exception 'native_video_current_object_required';end if;
 deadline:=least(transaction_timestamp()+interval '5 seconds',(authority->>'valid_until')::timestamptz,to_timestamp((delivery#>>'{binding,expiresAtMs}')::numeric/1000));
 perform sandbox_commerce_v1.assert_fresh(authority);
 if deadline is null or not isfinite(deadline) or clock_timestamp()>=deadline then raise exception 'native_video_access_expired';end if;
 return jsonb_build_object('protocol','nssv1-current-access-gateway-v1','actor',jsonb_build_object('userId',p_user,'sessionGeneration',p_session),
  'resourceId','scv1_resource_'||p_resource,'grantId','scv1_grant_'||g.id,'receiptId','scv1_receipt_'||r.id,
  'originalTransactionId',r.original_transaction_id,'allocationId',evidence->>'allocationId','projectId',evidence->>'projectId',
  'validUntilMs',floor(extract(epoch from deadline)*1000),
  'object',jsonb_build_object('provider',asset.provider,'bucket',asset.bucket,'routeId',route.id,'objectKey',asset.object_key,'incarnation',asset.incarnation,'expectedSha256',asset.sha256,'expectedByteLength',asset.byte_length,'objectVersion',asset.object_version),
  'media',jsonb_build_object('assetId','scv1_asset_'||asset.id,'incarnation',asset.incarnation,'sha256',asset.sha256,'byteLength',asset.byte_length,'resourceRevision',asset.resource_revision,'profile','scpv-mp4-h264-aac-v1'));
end $$;
revoke all on function sandbox_commerce_v1.native_store_paid_video_access(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
reset role;
create function public.native_store_paid_video_access_v1(p_user_id uuid,p_session_id uuid,p_resource_id uuid,p_grant_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.native_store_paid_video_access(p_user_id,p_session_id,p_resource_id,p_grant_id);
end $$;
alter function public.native_store_paid_video_access_v1(uuid,uuid,uuid,uuid) owner to sbx_v1_core_owner;
revoke all on function public.native_store_paid_video_access_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.native_store_paid_video_access_v1(uuid,uuid,uuid,uuid) to service_role;
