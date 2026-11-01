import {reconcileSecondaryMediaObject,waitWithSignal,withDeadline} from './secondary-media-producer.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const discard=r=>{void r?.body?.cancel().catch(()=>{});};
function validate(b){
 if(!b||b.status!=='authorized'||!UUID.test(b.claimId)||!UUID.test(b.objectId)||!UUID.test(b.writeToken)
  ||!['cloudflare_r2','hetzner_s3'].includes(b.provider)||!b.bucket||!b.objectKey
  ||!Number.isSafeInteger(b.sizeBytes)||b.sizeBytes<1||b.sizeBytes>5368709120
  ||!/^[a-f0-9]{64}$/.test(b.sha256)||!/^[a-f0-9]{64}$/.test(b.contractSha256)||!/^[a-f0-9]{64}$/.test(b.writerFenceSha256)||!b.etag
  ||b.deletionMode!==(b.provider==='cloudflare_r2'?'permanent_key_retirement':'immutable_version')
  ||b.permanentlyAbsent!==false||b.provider==='hetzner_s3'&&(!b.versionId||b.versionId==='null'))throw Error('secondary_media_expiry_binding_invalid');
}
// Explicit one-object operation, not a background scheduler. SQL admission and
// readback remain authoritative; callers must separately possess permission to
// delete this object. A configured provider or published function is not that
// permission. This function is tested against local doubles only by CI.
export async function expireSecondaryMediaObject(objectId,{rpc,targetURL,fetcher=fetch,timeoutMs=120000}){
 if(!UUID.test(objectId))throw Error('secondary_media_expiry_object_invalid');
 return withDeadline(timeoutMs,async signal=>{
 const started=Date.now();
 const remaining=()=>{const ms=timeoutMs-(Date.now()-started);if(ms<=0)throw Error('secondary_media_expiry_deadline');return ms;};
 const call=async(name,args)=>{
  const response=await waitWithSignal(rpc(name,args),signal);if(!response||typeof response!=='object')throw Error('secondary_media_expiry_rpc_invalid');return response;
 };
 const claim=await call('claim_secondary_media_expiry',{p_object_id:objectId});
 if(claim.status!=='claimed')return {status:claim.status,permanentlyAbsent:false};
 if(!UUID.test(claim.claimId))throw Error('secondary_media_expiry_claim_invalid');
 const binding=await call('read_secondary_media_expiry_claim',{p_claim_id:claim.claimId});
 if(binding.status!=='authorized')return{status:binding.status,permanentlyAbsent:false};
 validate(binding);if(binding.objectId!==objectId||binding.claimId!==claim.claimId)throw Error('secondary_media_expiry_identity_changed');
 const request=async(method)=>{
  const url=new URL(await waitWithSignal(targetURL(method,binding,{versionId:binding.versionId}),signal));
  if(url.protocol!=='https:'||url.username||url.password||url.hash
   ||binding.provider==='hetzner_s3'&&url.searchParams.get('versionId')!==binding.versionId)throw Error('secondary_media_expiry_origin_invalid');
  remaining();return waitWithSignal(fetcher(url,{method,redirect:'error',cache:'no-store',signal}),signal);
 };
 let outcome='failed';
 try{
  const before=await request('HEAD');discard(before);
  if(before.status===404)outcome='observed_absent';
  else if(before.status===200){
   // Read every byte, bind producer metadata, and for Hetzner read the immutable
   // version. A HEAD/ETag alone never proves the object to be destroyed.
   const proof=await reconcileSecondaryMediaObject(binding,{targetURL,fetcher,timeoutMs:remaining()});
   if(proof.etag!==binding.etag||proof.versionId!==(binding.versionId||null))throw Error('secondary_media_expiry_generation_changed');
   const current=await call('read_secondary_media_expiry_claim',{p_claim_id:claim.claimId});
   if(JSON.stringify(current)!==JSON.stringify(binding))return{status:current.status==='authorized'?'binding_changed':current.status,permanentlyAbsent:false};
   const removed=await request('DELETE');discard(removed);
   if(removed.ok||removed.status===404){outcome='delete_acknowledged';const after=await request('HEAD');discard(after);if(after.status===404)outcome='observed_absent';}
  }
 }catch(error){if(/identity|digest|generation|version/.test(String(error?.message)))outcome='identity_changed';}
 const recorded=await call('record_secondary_media_expiry_result',{p_claim_id:claim.claimId,p_result:outcome});
 if(recorded.status!==outcome||recorded.permanentlyAbsent!==false)throw Error('secondary_media_expiry_receipt_unconfirmed');
 return {status:outcome,permanentlyAbsent:false};
 });
}
