import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const exports={};new Function('exports',ts.transpileModule(readFileSync('supabase/functions/_shared/native-production-paid-video-range.ts','utf8'),
 {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(exports);
const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003'];
const actor={buyerId:ids[0],sessionId:ids[1]};
function fixture({enabled=true,change=false,badEtag=false,shortBody=false,actorOverride=actor}={}){
 let reads=0;const calls=[];let preflight=false;
 const handler=exports.createNativeProductionPaidVideoRange({enabled:()=>enabled,now:()=>1000,
  authenticate:async()=>actorOverride,rpc:async(name,args)=>{calls.push({name,args});
   if(name==='record_native_production_checkout_preflight')return {protocol:'native-production-preflight-v1',status:'READY',admissionId:ids[2],dispatchAllowed:false};
   preflight=name.includes('preflight');reads++;
   return {protocol:preflight?'native-production-preflight-v1':'native-production-origin-v1',...actor,
    ...(preflight?{admissionId:ids[2],qualificationId:ids[0]}:{videoId:ids[0],grantId:ids[2]}),sourceVersionId:ids[2],provider:'s3',bucket:'private-fixture',objectKey:'fixture.mp4',
    generation:'"'+'a'.repeat(32)+'"',assetSha256:change&&reads>1?'b'.repeat(64):'a'.repeat(64),byteLength:4,validUntilMs:5000};},
  origin:async(binding,method,signal,headers)=>{calls.push({method,headers});
   assert.equal(headers['if-match'],'"'+'a'.repeat(32)+'"');
   return new Response(method==='HEAD'?null:new Uint8Array(shortBody?[1]:[1,2]),{status:method==='HEAD'?200:206,headers:{
    'content-type':'video/mp4','content-length':method==='HEAD'?'4':'2','content-range':'bytes 0-1/4','etag':badEtag?'"wrong"':headers['if-match']}});
  }});
 const run=({flight=false,range='bytes=0-1'}={})=>handler(new Request(`https://fixture.invalid/functions/v1/native-production-paid-video-playback/${flight?'preflight':ids[0]}/${ids[2]}`,
  {method:flight?'POST':'GET',headers:{'X-Chillywood-Auth-Session':ids[1],Range:range},...(flight?{body:JSON.stringify({configurationSha256:'a'.repeat(64)})}:{})}));
 return {run,calls};
}
test('production range requires actual conditional immutable origin and post-read authority',async()=>{
 const f=fixture(),response=await f.run();assert.equal(response.status,206);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2]);
 assert.equal(response.headers.get('x-chillywood-media-protocol'),'native-production-range-v1');
 assert.equal(f.calls.filter(c=>c.name==='resolve_native_production_paid_video_origin').length,2);
 for(const options of [{enabled:false},{change:true},{badEtag:true},{shortBody:true},{actorOverride:{...actor,sessionId:ids[2]}}]){
  const h=fixture(options),denied=await h.run();assert.ok(denied.status>=400);assert.equal((await denied.json()).status,'unavailable');
 }
 for(const range of ['bytes=0-1,2-3','bytes=4-9','bytes=2-1','garbage'])assert.ok((await fixture().run({range})).status>=400);
});
test('production preflight reads exact origin HEAD before issuing short-lived no-charge readiness',async()=>{
 const f=fixture(),response=await f.run({flight:true});assert.equal(response.status,200);
 assert.equal((await response.json()).dispatchAllowed,false);
 assert.equal(f.calls.find(c=>c.method)?.method,'HEAD');
 assert.equal(f.calls.at(-1).name,'record_native_production_checkout_preflight');
 const denied=fixture({badEtag:true});assert.ok((await denied.run({flight:true})).status>=400);
 assert.equal(denied.calls.some(c=>c.name==='record_native_production_checkout_preflight'),false);
});
