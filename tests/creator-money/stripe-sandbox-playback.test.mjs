import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const exports={};new Function('exports',ts.transpileModule(readFileSync('supabase/functions/_shared/native-production-paid-video-range.ts','utf8'),
 {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(exports);
const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003'];
function fixture({enabled=true,revoked=false,wrongBuyer=false,wrongGrant=false,native=false,badOrigin=false,wrongSession=false}={}){
 const calls=[];let reads=0;
 const actor={buyerId:ids[0],sessionId:ids[1]};
 const handler=exports.createNativeProductionPaidVideoRange({adapter:'stripe-sandbox',enabled:()=>enabled,now:()=>1000,
 authenticate:async()=>({...actor,...(wrongSession?{sessionId:ids[2]}:{})}),
 rpc:async(name,args)=>{calls.push({name,args});reads++;if(revoked&&reads>1)return null;
 return {protocol:native?'native-production-origin-v1':'stripe-sandbox-origin-v1',...actor,
 buyerId:wrongBuyer?ids[2]:ids[0],videoId:ids[0],grantId:wrongGrant?ids[1]:ids[2],sourceVersionId:ids[2],
 provider:'cloudflare_r2',bucket:'private',objectKey:'test.mp4',generation:'"'+'a'.repeat(32)+'"',
 assetSha256:'a'.repeat(64),byteLength:4,validUntilMs:5000};},
 origin:async(binding,method,signal,headers)=>{calls.push({method,headers});
 assert.equal(method,'GET');assert.equal(headers['if-match'],'"'+'a'.repeat(32)+'"');
 return new Response(new Uint8Array([1,2]),{status:206,headers:{'content-type':'video/mp4','content-length':'2',
 'content-range':'bytes 0-1/4','etag':badOrigin?'"wrong"':headers['if-match']}});}});
 const run=(path=`${ids[0]}/${ids[2]}`,method='GET')=>handler(new Request(`https://fixture.invalid/functions/v1/stripe-sandbox-paid-video-playback/${path}`,
 {method,headers:{'X-Chillywood-Auth-Session':ids[1],Range:'bytes=0-1'}}));
 return {run,calls};
}
test('Stripe sandbox transport reads exact verified origin and rechecks grant after buffering',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,206);assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2]);
 assert.equal(r.headers.get('X-Chillywood-Media-Protocol'),'stripe-sandbox-range-v1');
 assert.match(r.headers.get('Access-Control-Expose-Headers'),/Content-Range/);
 assert.equal(f.calls.filter(c=>c.name==='resolve_stripe_sandbox_paid_video_origin').length,2);
 assert.ok(f.calls.every(c=>!c.name||!c.name.includes('native')));
});
test('Stripe sandbox rejects disabled, revoked, wrong actor/grant/protocol and changed bytes',async()=>{
 for(const options of [{enabled:false},{revoked:true},{wrongBuyer:true},{wrongGrant:true},{native:true},{badOrigin:true},{wrongSession:true}]){
 const f=fixture(options),r=await f.run();assert.ok(r.status>=400,JSON.stringify(options));
 assert.deepEqual(await r.json(),{status:'unavailable'});
 }
});
test('Stripe adapter cannot invoke native preflight or use checkout-return query as authority',async()=>{
 for(const [path,method] of [[`preflight/${ids[2]}`,'POST'],[`${ids[0]}/${ids[2]}?session_id=cs_test_fake`,'GET']]){
 const f=fixture(),r=await f.run(path,method);assert.equal(r.status,400);assert.equal(f.calls.length,0);
 }
});
