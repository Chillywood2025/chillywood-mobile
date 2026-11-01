import { Buffer } from 'node:buffer';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {expireSecondaryMediaObject} from '../scripts/lib/secondary-media-expiry.mjs';
import {createSecondaryMediaS3Signer} from '../scripts/lib/secondary-media-s3-signer.mjs';
const body=Buffer.from('synthetic retained media');
const binding={status:'authorized',claimId:randomUUID(),objectId:randomUUID(),writeToken:randomUUID(),provider:'cloudflare_r2',
 bucket:'private-origin',objectKey:'renders/proof/export.mp4',versionId:null,etag:'"exact"',sha256:createHash('sha256').update(body).digest('hex'),
 sizeBytes:body.length,contractSha256:'a'.repeat(64),writerFenceSha256:'b'.repeat(64),deletionMode:'permanent_key_retirement',permanentlyAbsent:false};
const targetURL=async(_method,b,{versionId}={})=>'https://origin.example.invalid/'+b.objectKey+(versionId?'?versionId='+versionId:'');
function fixture({patch={},secondRead,corrupt=false}={}){
 const b={...binding,...patch},calls=[];let reads=0,removed=false;
 const rpc=async(name,args)=>{calls.push(name);
  if(name==='claim_secondary_media_expiry')return{status:'claimed',claimId:b.claimId};
  if(name==='read_secondary_media_expiry_claim')return ++reads===2&&secondRead?secondRead:b;
  if(name==='record_secondary_media_expiry_result')return{status:args.p_result,permanentlyAbsent:false};
  throw Error('unexpected RPC');};
 const fetcher=async(url,o)=>{calls.push(o.method);
  if(b.provider==='hetzner_s3')assert.equal(new URL(url).searchParams.get('versionId'),b.versionId);
  if(o.method==='HEAD')return new Response(null,{status:removed?404:200});
  if(o.method==='DELETE'){removed=true;return new Response(null,{status:204});}
  return new Response(corrupt?Buffer.alloc(body.length):body,{headers:{etag:b.etag,'x-amz-meta-chillywood-write-id':b.writeToken,
   ...(b.versionId?{'x-amz-version-id':b.versionId}:{})}});};
 return{b,calls,rpc,fetcher};
}
test('dormant consumer performs full proof then fresh authority read before exact delete',async()=>{
 const f=fixture();const r=await expireSecondaryMediaObject(f.b.objectId,{...f,targetURL});
 assert.deepEqual(r,{status:'observed_absent',permanentlyAbsent:false});
 assert.deepEqual(f.calls,['claim_secondary_media_expiry','read_secondary_media_expiry_claim','HEAD','GET',
  'read_secondary_media_expiry_claim','DELETE','HEAD','record_secondary_media_expiry_result']);
});
test('changed bytes and stop switch cannot reach DELETE',async()=>{
 for(const options of [{corrupt:true},{secondRead:{status:'disabled'}}]){
  const f=fixture(options);const r=await expireSecondaryMediaObject(f.b.objectId,{...f,targetURL});
  assert.ok(['identity_changed','disabled'].includes(r.status));assert.ok(!f.calls.includes('DELETE'));
 }
});
test('Hetzner deletion and presence checks require exact immutable version query',async()=>{
 const f=fixture({patch:{provider:'hetzner_s3',versionId:'version-1',deletionMode:'immutable_version'}});
 assert.equal((await expireSecondaryMediaObject(f.b.objectId,{...f,targetURL})).status,'observed_absent');
 const bad=fixture({patch:{provider:'hetzner_s3',versionId:'version-1',deletionMode:'immutable_version'}});
 assert.equal((await expireSecondaryMediaObject(bad.b.objectId,{...bad,targetURL:async()=> 'https://origin.example.invalid/key'})).status,'failed');
 assert.ok(!bad.calls.includes('DELETE'));
});
test('disabled admission is zero network and hung RPC is bounded',async()=>{
 const r=await expireSecondaryMediaObject(binding.objectId,{rpc:async()=>({status:'disabled'}),targetURL,fetcher:async()=>{throw Error('must not call');}});
 assert.equal(r.status,'disabled');
 const start=Date.now();await assert.rejects(expireSecondaryMediaObject(binding.objectId,{rpc:async()=>new Promise(()=>{}),targetURL,timeoutMs:20}),/transport_deadline/);
 assert.ok(Date.now()-start<1000);
});
test('S3 signer binds create-only and checksum identity headers to exact configured origin',async()=>{
 const config={provider:'cloudflare_r2',bucket:binding.bucket,endpoint:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com',region:'auto',accessKeyId:'synthetic-access',secretAccessKey:'synthetic-secret'};
 const signer=createSecondaryMediaS3Signer(config,()=>new Date('2026-11-01T12:00:00Z'));
 const headers={'If-None-Match':'*','x-amz-meta-chillywood-write-id':binding.writeToken,'Content-Length':String(binding.sizeBytes)};
 const signed=new URL(await signer('PUT',binding,{headers}));
 assert.equal(signed.pathname,'/'+binding.bucket+'/'+binding.objectKey);
 assert.equal(signed.searchParams.get('X-Amz-Expires'),'60');
 assert.equal(signed.searchParams.get('X-Amz-SignedHeaders'),'content-length;host;if-none-match;x-amz-meta-chillywood-write-id');
 assert.ok(!signed.toString().includes(config.secretAccessKey));
 await assert.rejects(signer('PUT',binding,{headers:{}}),/create_only_required/);
 await assert.rejects(signer('DELETE',binding),/signer_identity_invalid/);
 await assert.rejects(signer('GET',{...binding,bucket:'other'},{headers:{'If-Match':'"exact"'}}),/identity_invalid/);
 assert.throws(()=>createSecondaryMediaS3Signer({...config,endpoint:'https://attacker.invalid'}),/configuration_invalid/);
 const expiry=createSecondaryMediaS3Signer({...config,allowExpiry:true});
 assert.equal(new URL(await expiry('DELETE',binding)).hostname,'a'.repeat(32)+'.r2.cloudflarestorage.com');
 await assert.rejects(expiry('DELETE',{...binding,claimId:null}),/expiry_binding_required/);
});
