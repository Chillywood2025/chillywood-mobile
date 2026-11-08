-- Fresh inactive add-on. Selects an already owned current grant for the exact
-- historical quote. It issues no bytes, URL, grant, provider work or money.
set local role sbx_v1_core_owner;
do $fresh$
begin
 if (select state from sandbox_commerce_v1.lifecycle where singleton) is distinct from 'disabled'
  or exists(select 1 from sandbox_commerce_v1.test_store_v3_allocations)
  or exists(select 1 from sandbox_commerce_v1.test_store_v3_controls where ingress_enabled or provisioning_enabled or initiation_enabled)
 then raise exception 'paid_video_resolve_fresh_install_required'; end if;
end; $fresh$;
create function sandbox_commerce_v1.paid_video_resolve_playback_v3(p_buyer uuid,p_session uuid,p_command text,
 p_request uuid,p_configuration_digest text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare i sandbox_commerce_v1.intents; g sandbox_commerce_v1.resource_grants;
 preparation sandbox_commerce_v1.test_store_v3_preparations;
 authority jsonb; quote jsonb; access jsonb; current_grant text:=null; message text;
begin
 perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
 if p_buyer is null or p_session is null or p_request is null or p_configuration_digest is null
  or p_configuration_digest !~ '^[a-f0-9]{64}$' or p_command is distinct from 'resolve_playback'
  or jsonb_typeof(p_payload) is distinct from 'object' or not(p_payload ? 'intentId')
  or (p_payload-'intentId')<>'{}'::jsonb or jsonb_typeof(p_payload->'intentId') is distinct from 'string'
 then raise exception 'paid_video_resolve_invalid'; end if;
 authority:=sandbox_commerce_v1.assert_authority(p_buyer,p_session,'delivery');
 select intent.* into strict i from sandbox_commerce_v1.intents intent
  join sandbox_commerce_v1.test_store_v3_preparations prep on prep.intent_id=intent.id
  where intent.id=sandbox_commerce_v1.identifier(p_payload->>'intentId','intent')
   and intent.buyer_id=p_buyer and prep.buyer_id=p_buyer and prep.configuration_digest=p_configuration_digest;
 select * into strict preparation from sandbox_commerce_v1.test_store_v3_preparations where intent_id=i.id;
 quote:=preparation.payload->'expectedQuote';
 if quote is null or quote is distinct from sandbox_commerce_v1.test_store_v3_quote(i)
 then raise exception 'paid_video_resolve_retained_quote_required'; end if;
 -- Historical receipt state is deliberately not ownership authority. A separate
 -- current exact grant may survive refund/expiry of this particular purchase.
 begin
  g:=sandbox_commerce_v1.current_resource_grant(p_buyer,i.resource_id,i.resource_revision);
  access:=sandbox_commerce_v1.paid_video_gateway_access_v2(p_buyer,p_session,i.resource_id,g.id);
  if access->>'resourceId' is distinct from quote->>'resourceId'
   or access->>'grantId' is distinct from 'scv1_grant_'||g.id
   or access->'media' is distinct from jsonb_build_object('assetId',quote#>>'{asset,id}',
    'incarnation',quote#>>'{asset,incarnation}','sha256',quote#>>'{asset,sha256}',
    'byteLength',quote#>'{asset,byteLength}','resourceRevision',quote#>'{asset,resourceRevision}',
    'profile',quote#>>'{asset,profile}')
  then raise exception 'paid_video_resolve_exact_asset_required'; end if;
  current_grant:='scv1_grant_'||g.id;
 exception when sqlstate '42501' or sqlstate 'P0001' then
  get stacked diagnostics message=message_text;
  if message not in ('sandbox_current_exact_resource_grant_required','paid_video_current_receipt_required',
   'paid_video_provider_evidence_held','paid_video_exact_current_grant_required','paid_video_media_authority_required',
   'sandbox_owner_delivery_context_required','sandbox_owner_delivery_safety_required','sandbox_owner_retained_legal_required',
   'sandbox_owner_delivery_expired','sandbox_immutable_clean_asset_required','sandbox_exact_target_owner_required',
   'sandbox_resource_safety_required','paid_video_current_object_required','paid_video_verified_media_required',
   'paid_video_current_object_receipt_required','sandbox_generation_inactive','paid_video_resolve_exact_asset_required')
  then raise; end if;
  current_grant:=null;
 end;
 perform sandbox_commerce_v1.assert_fresh(authority);
 return jsonb_build_object('protocol','isolated-paid-video-checkout-v3','command',p_command,'requestId',p_request,
  'actor',jsonb_build_object('userId',p_buyer,'sessionId',p_session),'status','ok',
  'data',jsonb_build_object('intent',sandbox_commerce_v1.test_store_v3_intent_history(i),'currentGrantId',current_grant,
   'accessRequiresCurrentAuthorization',true),
  'providerDispatchAllowed',false,'grantsAccess',false,'financialAuthority',false,'notPayable',true);
end; $$;
revoke all on function sandbox_commerce_v1.paid_video_resolve_playback_v3(uuid,uuid,text,uuid,text,jsonb)
 from public,anon,authenticated,service_role,sbx_v1_operator;
reset role;
grant usage,create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.isolated_paid_video_resolve_playback_v3(p_buyer_id uuid,p_session_id uuid,p_command text,p_request_id uuid,p_configuration_digest text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.paid_video_resolve_playback_v3(p_buyer_id,p_session_id,p_command,p_request_id,p_configuration_digest,p_payload);
end; $$;
revoke all on function public.isolated_paid_video_resolve_playback_v3(uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.isolated_paid_video_resolve_playback_v3(uuid,uuid,text,uuid,text,jsonb) to service_role;
reset role;
revoke create on schema public from sbx_v1_core_owner;
