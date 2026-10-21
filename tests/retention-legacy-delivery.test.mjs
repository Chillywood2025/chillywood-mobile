import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../supabase/functions/_shared/legacy-media-delivery-revocation.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source.replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const legacyMediaDeliveryNotRevoked=new Function(js+';return legacyMediaDeliveryNotRevoked;')();
const input={provider:'cloudflare_r2',bucket:'chillywood-media-origin',objectKey:'originals/test.mp4'};
test('legacy delivery fence forwards the exact tuple and requires explicit negative revocation',async()=>{
 let calls=0;
 assert.equal(await legacyMediaDeliveryNotRevoked({rpc:async(name,args)=>{
  calls++;assert.equal(name,'check_legacy_media_delivery_revocation');
  assert.deepEqual(args,{p_provider:input.provider,p_bucket:input.bucket,p_object_key:input.objectKey});
  return {data:{revoked:false},error:null};
 }},input),true);
 assert.equal(calls,1);
});
test('revocation, missing endpoint, malformed response, exception and ambiguous success all deny',async()=>{
 for(const data of [null,undefined,[],true,false,{}, {revoked:true},{revoked:null},{revoked:0},{revoked:'false'},{allowed:true}]) {
  assert.equal(await legacyMediaDeliveryNotRevoked({rpc:async()=>({data,error:null})},input),false);
 }
 assert.equal(await legacyMediaDeliveryNotRevoked({rpc:async()=>({data:{revoked:false},error:{code:'PGRST202'}})},input),false);
 assert.equal(await legacyMediaDeliveryNotRevoked({rpc:async()=>{throw Error('offline');}},input),false);
});
test('revocation is checked on every call rather than cached after a prior allow',async()=>{
 let calls=0;const client={rpc:async()=>({data:{revoked:++calls>1},error:null})};
 assert.equal(await legacyMediaDeliveryNotRevoked(client,input),true);
 assert.equal(await legacyMediaDeliveryNotRevoked(client,input),false);
 assert.equal(calls,2);
});
test('gateway fences upload admission and both sides of asynchronous download signing',()=>{
 const gateway=readFileSync(new URL('../supabase/functions/media-storage/index.ts',import.meta.url),'utf8');
 assert.equal((gateway.match(/if \(!await legacyMediaDeliveryNotRevoked\(adminClient/g)||[]).length,3);
 const get=gateway.indexOf('const downloadUrl = await createPresignedS3Url({');
 const before=gateway.lastIndexOf('if (!await legacyMediaDeliveryNotRevoked(adminClient',get);
 const after=gateway.indexOf('if (!await legacyMediaDeliveryNotRevoked(adminClient',get);
 const response=gateway.indexOf('downloadUrl,',after);
 assert.ok(before>=0 && before<get && after>get && response>after);
 assert.match(gateway,/Already-issued[\s\S]*bounded provider TTL/);
});
