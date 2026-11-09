-- Private discovery from persisted original receipt identity. No provider-body
-- claim ID, newest-pending selection, scheduler, acknowledgement or grant.
set local role sbx_v1_core_owner;
create index native_store_claim_exact_identity on sandbox_commerce_v1.native_store_claims(buyer_id,transaction_identifier,product_identifier);
create function sandbox_commerce_v1.native_store_effect_candidate(p_raw_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw jsonb;o jsonb;chosen jsonb;mapping jsonb;candidates jsonb;prior sandbox_commerce_v1.native_store_raw_effects;
 held jsonb:=jsonb_build_object('protocol','native-store-effect-candidate-v1','rawReceiptId',p_raw_receipt_id,'status','held','work',null,'acknowledgementAllowed',false);
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 perform sandbox_commerce_v1.assert_provider_service();
 raw:=native_store_sandbox_v1.settlement_source(p_raw_receipt_id);o:=raw->'observation';
 if raw is null or raw->>'environment' is distinct from 'SANDBOX' or raw->'conflicted' is distinct from 'false'::jsonb
  or jsonb_array_length(raw->'eventIds')<>1 or o->>'parseStatus' is distinct from 'valid' or o->'issues' is distinct from '[]'::jsonb
  or o->'conflictingUserIds' is distinct from '[]'::jsonb or o->'transferredFrom' is distinct from '[]'::jsonb or o->'transferredTo' is distinct from '[]'::jsonb
  or coalesce(o->>'userId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or coalesce(length(o->>'transactionId'),0)=0 or coalesce(length(o->>'originalTransactionId'),0)=0
  or coalesce(length(o->>'productId'),0)=0 or coalesce(length(o->>'eventId'),0)=0
  or o->>'eventType' not in('NON_RENEWING_PURCHASE','CANCELLATION') then return held;end if;
 if o->>'eventType'='NON_RENEWING_PURCHASE' and (raw->'intakeEnabled' is distinct from 'true'::jsonb or raw->'originalRevisionRevoked' is distinct from 'false'::jsonb) then return held;end if;
 -- A completed effect has an immutable original pair; never rediscover a newer
 -- candidate for the same receipt. The worker/apply still revalidate evidence.
 select * into prior from sandbox_commerce_v1.native_store_raw_effects where raw_receipt_id=p_raw_receipt_id;
 if prior.raw_receipt_id is not null then
  if prior.raw_sha256 is distinct from raw->>'rawSha256' then return held;end if;
  chosen:=jsonb_build_object('rawReceiptId',p_raw_receipt_id,'claimId',prior.claim_id,'protocolId',prior.protocol_id,'protocolRevision',prior.protocol_revision);
 else
  with mappings as (
   select p.id,p.revision,q.platform,q.native_build,q.native_version,q.signed_app_version,q.sdk_version
   from sandbox_commerce_v1.native_store_settlement_protocols p
   join sandbox_commerce_v1.native_store_protocol_qualifications q on q.id=p.sample_qualification_id and q.revision=p.sample_qualification_revision
   join sandbox_commerce_v1.native_store_claims sample on sample.id=p.sample_claim_id
   join sandbox_commerce_v1.native_store_selections s on s.id=sample.selection_id and s.buyer_id=sample.buyer_id
   where not exists(select 1 from sandbox_commerce_v1.native_store_settlement_revocations v where v.protocol_id=p.id and v.protocol_revision=p.revision)
    and q.connection_id::text=raw->>'connectionId' and q.connection_revision::text=raw->>'connectionRevision'
    and s.quote#>>'{catalog,projectId}'=raw->>'projectId' and s.quote#>>'{catalog,appId}'=raw->>'appId'
    and s.quote#>>'{catalog,store}'=raw->>'store' and s.quote#>>'{catalog,environment}'='SANDBOX'
    and sample.product_identifier=o->>'productId' and s.quote#>>'{catalog,wireProductId}'=o->>'productId'
  ), pairs as (
   select c.id claim_id,m.id protocol_id,m.revision protocol_revision
   from sandbox_commerce_v1.native_store_claims c
   join sandbox_commerce_v1.native_store_selections s on s.id=c.selection_id and s.buyer_id=c.buyer_id
   join sandbox_commerce_v1.native_store_reservations r on r.selection_id=s.id and r.buyer_id=s.buyer_id and r.quote=s.quote
   join sandbox_commerce_v1.native_store_dispatch_attempts a on a.reservation_id=r.id and a.buyer_id=s.buyer_id
   join sandbox_commerce_v1.native_store_qualified_attempts qa on qa.attempt_id=a.id
   join sandbox_commerce_v1.native_store_protocol_qualifications q on q.id=qa.qualification_id and q.revision=qa.qualification_revision
   join mappings m on row(q.platform,q.native_build,q.native_version,q.signed_app_version,q.sdk_version)
    =row(m.platform,m.native_build,m.native_version,m.signed_app_version,m.sdk_version)
   where o->>'eventType'='NON_RENEWING_PURCHASE' and c.buyer_id=(o->>'userId')::uuid
    and c.transaction_identifier=o->>'transactionId' and c.product_identifier=o->>'productId'
    and s.quote#>>'{catalog,projectId}'=raw->>'projectId' and s.quote#>>'{catalog,appId}'=raw->>'appId'
    and s.quote#>>'{catalog,store}'=raw->>'store' and s.quote#>>'{catalog,environment}'='SANDBOX'
    and s.quote#>>'{catalog,wireProductId}'=o->>'productId'
    and q.connection_id::text=raw->>'connectionId' and q.connection_revision::text=raw->>'connectionRevision'
    and q.quote_digest=s.quote->>'quoteDigest'
    and not exists(select 1 from sandbox_commerce_v1.native_store_protocol_revocations v where v.qualification_id=q.id and v.qualification_revision=q.revision)
   union all
   select null::uuid,m.id,m.revision from mappings m where o->>'eventType'='CANCELLATION'
  ) select coalesce(jsonb_agg(jsonb_build_object('rawReceiptId',p_raw_receipt_id,'claimId',p.claim_id,'protocolId',p.protocol_id,'protocolRevision',p.protocol_revision)),'[]'::jsonb)
   into candidates from (select * from pairs limit 2) p;
  -- LIMIT 2 is only an ambiguity detector, never a selection ordering rule.
  if jsonb_array_length(candidates)<>1 then return held;end if;
  chosen:=candidates->0;
 end if;
 mapping:=sandbox_commerce_v1.native_store_settlement_protocol((chosen->>'protocolId')::uuid,(chosen->>'protocolRevision')::bigint);
 if mapping->>'projectId' is distinct from raw->>'projectId' or mapping->>'appId' is distinct from raw->>'appId'
  or mapping->>'store' is distinct from raw->>'store' or mapping->>'productId' is distinct from o->>'productId'
  or mapping->>'connectionId' is distinct from raw->>'connectionId' or mapping->>'connectionRevision' is distinct from raw->>'connectionRevision'
 then return held;end if;
 perform sandbox_commerce_v1.assert_generation(false);
 return jsonb_build_object('protocol','native-store-effect-candidate-v1','rawReceiptId',p_raw_receipt_id,'status','candidate','work',chosen,'acknowledgementAllowed',false);
end $$;
revoke all on function sandbox_commerce_v1.native_store_effect_candidate(uuid) from public,anon,authenticated,service_role;
reset role;
create function public.native_store_sandbox_effect_candidate_v1(p_raw_receipt_id uuid)
returns jsonb language sql security definer set search_path='' as $$select sandbox_commerce_v1.native_store_effect_candidate(p_raw_receipt_id)$$;
alter function public.native_store_sandbox_effect_candidate_v1(uuid) owner to sbx_v1_core_owner;
revoke all on function public.native_store_sandbox_effect_candidate_v1(uuid) from public,anon,authenticated;
grant execute on function public.native_store_sandbox_effect_candidate_v1(uuid) to service_role;
