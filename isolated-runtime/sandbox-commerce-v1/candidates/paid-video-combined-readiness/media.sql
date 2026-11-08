-- Fresh inactive combined profile only. No existing function is replaced.
-- Shared by checkout readiness/preparation and the dedicated range authority.
set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.paid_video_verified_media_v2(p_resource uuid,p_revision bigint,p_creator uuid)
returns sandbox_commerce_v1.delivery_assets language plpgsql volatile security invoker set search_path='' as $$
declare a sandbox_commerce_v1.delivery_assets; terms sandbox_commerce_v1.video_terms;
 u sandbox_commerce_v1.paid_video_uploads; ctl sandbox_commerce_v1.paid_video_gateway_controls;
 route sandbox_commerce_v1.paid_video_routes; verifier sandbox_commerce_v1.paid_video_verifiers;
 receipt sandbox_commerce_v1.paid_video_object_receipts; transfer sandbox_commerce_v1.paid_video_transfers;
 context sandbox_commerce_v1.paid_video_gateway_transfers; worker sandbox_commerce_v1.paid_video_workers;
 scan sandbox_commerce_v1.paid_video_scan_results; ticket sandbox_commerce_v1.paid_video_tickets;
 original_worker sandbox_commerce_v1.paid_video_workers; observation jsonb; scan_body jsonb;
begin
 select * into terms from sandbox_commerce_v1.video_terms where resource_id=p_resource and revision=p_revision for share nowait;
 if not found or terms.audience<>'paid' then raise exception 'paid_video_verified_media_required'; end if;
 a:=sandbox_commerce_v1.clean_resource_asset(terms.asset_id,p_resource,p_revision,p_creator,'video');
 select * into u from sandbox_commerce_v1.paid_video_uploads where resource_id=p_resource and asset_id=a.id for share nowait;
 if not found then raise exception 'paid_video_verified_media_required'; end if;
 select * into ctl from sandbox_commerce_v1.paid_video_gateway_controls where singleton for share nowait;
 if not found or not ctl.enabled or ctl.route_id is distinct from u.route_id
 then raise exception 'paid_video_verified_media_required'; end if;
 select * into route from sandbox_commerce_v1.paid_video_routes where id=ctl.route_id for share nowait;
 if not found or not route.active or route.provider<>'s3' or u.state<>'clean' or u.moderation<>'clear'
  or row(u.creator_id,route.provider,route.bucket,u.object_key,u.object_version,u.incarnation,u.expected_sha256,u.expected_byte_length)
   is distinct from row(p_creator,a.provider,a.bucket,a.object_key,a.object_version,a.incarnation,a.sha256,a.byte_length)
 then raise exception 'paid_video_verified_media_required'; end if;
 -- Freeze the independent-key absence condition as well as current rows.
 lock table sandbox_commerce_v1.paid_video_workers in share mode nowait;
 select * into worker from sandbox_commerce_v1.paid_video_workers where id=ctl.worker_id for share nowait;
 if not found or not worker.active then raise exception 'paid_video_verified_media_required'; end if;
 select * into verifier from sandbox_commerce_v1.paid_video_verifiers where id=ctl.verifier_id for share nowait;
 if not found or not verifier.active or exists(select 1 from sandbox_commerce_v1.paid_video_workers w where w.hmac_key=verifier.hmac_key)
 then raise exception 'paid_video_verified_media_required'; end if;
 select * into receipt from sandbox_commerce_v1.paid_video_object_receipts where upload_id=u.id for share nowait;
 if not found or row(receipt.verifier_id,receipt.object_version) is distinct from row(verifier.id,u.object_version)
  or not sandbox_commerce_v1.paid_video_signature_matches(sandbox_commerce_v1.paid_video_hmac(verifier.hmac_key,receipt.observation_raw),receipt.signature)
 then raise exception 'paid_video_verified_media_required'; end if;
 select * into transfer from sandbox_commerce_v1.paid_video_transfers where id=receipt.transfer_id for share nowait;
 if not found or row(transfer.upload_id,transfer.user_id) is distinct from row(u.id,u.creator_id)
 then raise exception 'paid_video_verified_media_required'; end if;
 select * into context from sandbox_commerce_v1.paid_video_gateway_transfers where transfer_id=transfer.id for share nowait;
 if not found then raise exception 'paid_video_verified_media_required'; end if;
 observation:=receipt.observation_raw::jsonb;
 if observation->>'protocol' is distinct from 'scpv-object-observation-v2'
  or row(observation->>'uploadId',observation->>'userId',observation->>'requestId',observation->>'transferId',observation->>'originalSessionId',
    observation->>'originalConfigurationDigest',observation->>'verifierId',observation->>'incarnation',observation->>'sha256',observation->>'objectVersion')
   is distinct from row('scpv_upload_'||u.id,u.creator_id::text,transfer.request_id::text,transfer.id::text,transfer.session_id::text,
    context.configuration_digest,verifier.id::text,u.incarnation::text,u.expected_sha256,u.object_version)
  or observation->'byteLength' is distinct from to_jsonb(u.expected_byte_length)
 then raise exception 'paid_video_verified_media_required'; end if;
 -- Observation freshness was consumed at immutable receipt acceptance. A
 -- retained accepted receipt is not required to have a new 30-second expiry.
 select * into scan from sandbox_commerce_v1.paid_video_scan_results where sha256=u.clean_result_sha256 for share nowait;
 if not found or not scan.accepted_positive then raise exception 'paid_video_verified_media_required'; end if;
 select * into ticket from sandbox_commerce_v1.paid_video_tickets where id=scan.ticket_id for share nowait;
 if not found or ticket.upload_id is distinct from u.id or ticket.positive_consumed_at is null
 then raise exception 'paid_video_verified_media_required'; end if;
 select * into original_worker from sandbox_commerce_v1.paid_video_workers where id=ticket.worker_id for share nowait;
 if not found or not sandbox_commerce_v1.paid_video_signature_matches(sandbox_commerce_v1.paid_video_hmac(original_worker.hmac_key,scan.raw_body),scan.signature)
  or encode(sha256(convert_to(scan.raw_body,'UTF8')),'hex') is distinct from scan.sha256
 then raise exception 'paid_video_verified_media_required'; end if;
 scan_body:=scan.raw_body::jsonb;
 if row(scan_body->>'protocol',scan_body->>'ticketId',scan_body->>'uploadId',scan_body->>'incarnation',scan_body->>'objectVersion',
    scan_body#>>'{result,sha256}',scan_body#>>'{result,verdict}',scan_body#>>'{result,profile}')
   is distinct from row('scpv-worker-result-v1',ticket.id::text,'scpv_upload_'||u.id,u.incarnation::text,u.object_version,
    u.expected_sha256,'clean','scpv-mp4-h264-aac-v1')
  or scan_body#>'{result,byteLength}' is distinct from to_jsonb(u.expected_byte_length)
 then raise exception 'paid_video_verified_media_required'; end if;
 return a;
end $$;
revoke all on function sandbox_commerce_v1.paid_video_verified_media_v2(uuid,bigint,uuid)
 from public,anon,authenticated,service_role,sbx_v1_operator;
reset role;
