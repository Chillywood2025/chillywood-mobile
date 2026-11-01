import { Buffer } from 'node:buffer';
import {createHash} from 'node:crypto';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw new Error(`secondary_media_${code}`);};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const safeURL=value=>{
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.hash)fail('transport_url_invalid');
 return url;
};
export function waitWithSignal(promise,signal){
 if(signal.aborted)return Promise.reject(Error('secondary_media_transport_deadline'));
 return new Promise((resolve,reject)=>{const abort=()=>reject(Error('secondary_media_transport_deadline'));
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
const discard=response=>{void response?.body?.cancel().catch(()=>{});};
async function boundedBytes(response,expectedSize,signal) {
 if(response.status!==200||response.headers.has('content-range')||!response.body
  ||![null,'identity'].includes(response.headers.get('content-encoding')))fail('readback_invalid');
 const declared=response.headers.get('content-length');
 if(declared!==null&&declared!==String(expectedSize))fail('readback_size_mismatch');
 const reader=response.body.getReader(),hash=createHash('sha256');let size=0;
 try {
  for(;;){const {done,value}=await waitWithSignal(reader.read(),signal);if(done)break;size+=value.byteLength;
   if(size>expectedSize)fail('readback_size_exceeded');hash.update(value);}
 }finally{void reader.cancel().catch(()=>{});}
 if(size!==expectedSize)fail('readback_size_mismatch');
 return hash.digest('hex');
}

// This is the actual transport boundary. The supplied signer must select the
// intended origin (never a CDN) and sign the required headers. Credentials and
// URLs never become receipts. No retry follows an uncertain PUT or a 412.
function assertIdentity(identity){
 if(!identity||!UUID.test(identity.objectId)||!UUID.test(identity.writeToken)
  ||!['cloudflare_r2','hetzner_s3'].includes(identity.provider)
  ||!Number.isSafeInteger(identity.sizeBytes)||identity.sizeBytes<1||identity.sizeBytes>5368709120)fail('object_identity_invalid');
}
async function readExactObject(identity,{targetURL,fetcher,signal,etag,versionId}){
 let readback;
 const getHeaders=etag?{'If-Match':etag}:{};
 const getURL=safeURL(await waitWithSignal(targetURL('GET',identity,{headers:getHeaders,versionId,reconcile:!etag}),signal));
 if(versionId&&getURL.searchParams.get('versionId')!==versionId)fail('version_readback_binding_required');
 try{readback=await waitWithSignal(fetcher(getURL,{method:'GET',headers:getHeaders,redirect:'error',cache:'no-store',signal}),signal);}
 catch{fail('readback_unavailable');}
 const actualEtag=readback.headers.get('etag'),actualVersion=readback.headers.get('x-amz-version-id');
 if(!actualEtag||actualEtag.length>512||etag&&actualEtag!==etag
  ||readback.headers.get('x-amz-meta-chillywood-write-id')!==identity.writeToken
  ||versionId&&actualVersion!==versionId){discard(readback);fail('readback_identity_changed');}
 if(identity.provider==='hetzner_s3'&&(!actualVersion||actualVersion==='null')){discard(readback);fail('immutable_version_required');}
 // A reconciliation discovery GET never qualifies an unversioned Hetzner
 // snapshot. Re-read that exact returned version before accepting its bytes.
 if(identity.provider==='hetzner_s3'&&!versionId){discard(readback);
  return readExactObject(identity,{targetURL,fetcher,signal,etag:actualEtag,versionId:actualVersion});}
 try{if(await boundedBytes(readback,identity.sizeBytes,signal)!==identity.sha256)fail('readback_digest_mismatch');}
 catch(error){discard(readback);throw error;}
 return {protocol:'secondary-media-create-only-v1',provider:identity.provider,bucket:identity.bucket,
  objectKey:identity.objectKey,sha256:identity.sha256,sizeBytes:identity.sizeBytes,
  etag:actualEtag,versionId:actualVersion||null,createOnly:true,fullReadback:true,writeCompleted:true};
}
export async function withDeadline(timeoutMs,fn){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)fail('timeout_invalid');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{return await fn(controller.signal);}finally{clearTimeout(timer);}
}
export async function writeSecondaryMediaObject({identity,bytes,contentType='application/octet-stream',cacheControl='private, no-store'},
 {targetURL,fetcher=fetch,timeoutMs=120000}) {
 assertIdentity(identity);
 if(identity.sizeBytes>134217728||!Buffer.isBuffer(bytes)&&!(bytes instanceof Uint8Array)
  ||bytes.byteLength!==identity.sizeBytes||sha256(bytes)!==identity.sha256)fail('local_bytes_changed');
 return withDeadline(timeoutMs,async signal=>{
 const headers={'If-None-Match':'*','Content-Length':String(bytes.byteLength),'Content-Type':contentType,'Cache-Control':cacheControl,
  'x-amz-meta-chillywood-write-id':identity.writeToken};
 const putURL=safeURL(await waitWithSignal(targetURL('PUT',identity,{headers}),signal));
 let uploaded;
 try{uploaded=await waitWithSignal(fetcher(putURL,{method:'PUT',headers,body:bytes,redirect:'error',signal}),signal);}
 catch{fail('write_outcome_unknown');}
 if(!uploaded.ok){discard(uploaded);fail(uploaded.status===412?'write_conflict':'write_outcome_unknown');}
 discard(uploaded);
 const etag=uploaded.headers.get('etag'),versionId=uploaded.headers.get('x-amz-version-id');
 if(!etag||etag.length>512)fail('write_identity_missing');
 if(identity.provider==='hetzner_s3'&&(!versionId||versionId==='null'||versionId.length>1024))fail('immutable_version_required');
 return readExactObject(identity,{targetURL,fetcher,signal,etag,versionId});
 });
}
export async function reconcileSecondaryMediaObject(identity,{targetURL,fetcher=fetch,timeoutMs=120000}){
 assertIdentity(identity);
 return withDeadline(timeoutMs,signal=>readExactObject(identity,{targetURL,fetcher,signal,etag:identity.etag,versionId:identity.versionId}));
}

export async function persistSecondaryMediaInventory({producerId,claimToken,inventory},
 {rpc,readLocalBytes,targetURL,fetcher=fetch,contentType=()=> 'application/octet-stream',cacheControl=()=> 'private, no-store'}) {
 if(!UUID.test(producerId)||!UUID.test(claimToken)||!Array.isArray(inventory?.objects))fail('producer_identity_invalid');
 const reserved=await rpc('reserve_secondary_media_objects',{p_producer_id:producerId,p_claim_token:claimToken,p_inventory:inventory});
 if(reserved?.reserved!==true||reserved.objectCount!==inventory.objects.length)fail('inventory_not_reserved');
 for(const object of inventory.objects){
  // Re-read/check local bytes before recording dispatch; changed local files
  // never consume an intent or lead to a different provider upload.
  const bytes=await readLocalBytes(object);
  if(bytes.byteLength!==object.sizeBytes||sha256(bytes)!==object.sha256)fail('local_bytes_changed');
  const state=await rpc('read_secondary_media_object_write',{p_producer_id:producerId,p_claim_token:claimToken,p_object_key:object.objectKey});
  if(!['unwritten','dispatched','verified'].includes(state?.status))fail('write_state_invalid');
  if(state.status==='verified')continue;
  const identity=state.status==='dispatched'?state.identity:
   await rpc('begin_secondary_media_object_write',{p_producer_id:producerId,p_claim_token:claimToken,p_object_key:object.objectKey});
  const receipt=state.status==='dispatched'?await reconcileSecondaryMediaObject(identity,{targetURL,fetcher}):
   await writeSecondaryMediaObject({identity,bytes,contentType:contentType(object),cacheControl:cacheControl(object)},{targetURL,fetcher});
  const recorded=await rpc('record_secondary_media_object_receipt',{p_producer_id:producerId,p_claim_token:claimToken,
   p_object_key:object.objectKey,p_write_token:identity.writeToken,p_receipt:receipt});
  if(recorded?.recorded!==true||recorded.objectId!==identity.objectId)fail('receipt_not_recorded');
  if(recorded.publishable!==true)fail('source_changed_after_write');
 }
 const sealed=await rpc('seal_secondary_media_producer',{p_producer_id:producerId,p_claim_token:claimToken});
 if(sealed?.sealed!==true||sealed.producerId!==producerId)fail('producer_not_sealed');
 return {producerId,objectCount:inventory.objects.length,providerBytesVerified:true,producerSealed:true,
  // Publication, scanner, live-reference qualification and irreversible delete
  // claims are separate authorities. Never conflate an output receipt with them.
  retentionDeletionAuthorized:false};
}
