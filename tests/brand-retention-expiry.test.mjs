import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(path, imports={}) {
 const source=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};new Function('exports',...Object.keys(imports),js)(exports,...Object.values(imports));return exports;
}
const helper=load('../supabase/functions/_shared/brand-retention-expiry.ts');
const {createBrandExpiryHandler}=load('../supabase/functions/_shared/brand-retention-expiry-handler.ts',helper);
const asset='00000000-0000-4000-8000-000000000001',token='00000000-0000-4000-8000-000000000002';
const binding={assetId:asset,claimToken:token,storageObjectId:'00000000-0000-4000-8000-000000000003',storageVersion:'version-1',provider:'supabase',bucket:'platform-brand-assets',objectKey:'owner/logo/synthetic.png',providerOrigin:'https://project.supabase.test',providerContractSha256:'a'.repeat(64),exactVersionDelete:true,permanentlyAbsent:false,metadataPresent:true,observationOnly:false,deleteAcknowledged:false};
function fixture(options={}) {
 const calls=[];
 const rpc=async(name,args)=>{calls.push({name,args});
  if(name===options.errorAt)return {data:null,error:{message:'private secret'}};
  if(name==='begin_platform_brand_retention_transport')return {data:{status:options.claimStatus??'claimed',assetId:asset,claimToken:token}};
  if(name==='read_platform_brand_retention_expiry_claim')return {data:{...binding,status:options.readStatus??'authorized',...options.binding}};
  if(name==='prepare_platform_brand_retention_dispatch')return {data:{...binding,status:options.permitStatus??'dispatch_authorized',...options.binding,...options.permit}};
  if(name==='record_platform_brand_retention_transport_result')return {data:{status:args.p_outcome,assetId:asset,claimToken:token,permanentlyAbsent:false,...options.receipt}};
  throw Error('unexpected RPC');
 };
 const fetcher=async(url,init)=>{calls.push({method:init.method,url:String(url),init});if(options.fetchError)throw Error('private URL secret');
  if (init.method==='GET') return new Response(JSON.stringify(options.body??{code:'NoSuchKey',statusCode:'404',message:'Object not found'}),{status:options.getStatus??400});
  return new Response(null,{status:init.method==='DELETE'?(options.deleteStatus??200):(options.headStatus??400)});
 };
 const origin=helper.createBrandExpiryOrigin(options.projectUrl??binding.providerOrigin,'synthetic-service-key',fetcher);
 return {calls,rpc,origin,fetcher};
}
test('qualified exact deletion persists acknowledgement then requires metadata and current GET missing proof',async()=>{
 const f=fixture();assert.deepEqual(await helper.expirePlatformBrandAsset(asset,f),{status:'observed_absent',permanentlyAbsent:false});
 assert.deepEqual(f.calls.map(x=>x.method??x.name),['begin_platform_brand_retention_transport','read_platform_brand_retention_expiry_claim','prepare_platform_brand_retention_dispatch','DELETE','record_platform_brand_retention_transport_result','GET','HEAD','GET','record_platform_brand_retention_transport_result']);
 const requests=f.calls.filter(x=>x.method);for(const request of requests){const u=new URL(request.url);assert.equal(u.search,request.method==='GET'?'':'?versionId=version-1');assert.equal(u.origin,binding.providerOrigin);assert.equal(request.init.redirect,'error');assert.equal(request.init.cache,'no-store');}
 assert.equal(new URL(requests[0].url).pathname,'/storage/v1/object/platform-brand-assets/owner/logo/synthetic.png');
 assert.equal(new URL(requests[1].url).pathname,'/storage/v1/object/info/platform-brand-assets/owner/logo/synthetic.png');
});
test('off, unqualified, held and changed incarnation never reach provider',async()=>{
 for(const claimStatus of ['disabled','transport_unqualified_or_disabled','held','not_due']) {const f=fixture({claimStatus});assert.equal((await helper.expirePlatformBrandAsset(asset,f)).status,claimStatus);assert.equal(f.calls.length,1);}
 for(const readStatus of ['held','storage_generation_changed','references_or_coverage_blocked','contended']) {const f=fixture({readStatus});assert.equal((await helper.expirePlatformBrandAsset(asset,f)).status,readStatus);assert.equal(f.calls.length,2);}
});
test('HTTP or decorated provider origin rejects before any fetch',()=>{
 for(const projectUrl of ['http://project.test','https://user:pass@project.test','https://project.test/path','https://project.test/?x=1','https://project.test/#x'])assert.throws(()=>fixture({projectUrl}),/config_invalid/);
});
test('tampered exact claim bindings cannot dispatch a delete',async()=>{
 for(const patch of [{assetId:token},{claimToken:asset},{storageObjectId:'bad'},{storageVersion:''},{storageVersion:'v?query'},{objectKey:'owner/../secret'},{objectKey:'owner/%2fsecret'},{bucket:'other'},{provider:'r2'},{exactVersionDelete:false},{permanentlyAbsent:true},{providerContractSha256:'bad'}]){
  const f=fixture({binding:patch});await assert.rejects(helper.expirePlatformBrandAsset(asset,f),/binding_invalid/);assert.equal(f.calls.some(x=>x.method),false);
 }
 const f=fixture({binding:{providerOrigin:'https://other.test'}});assert.equal((await helper.expirePlatformBrandAsset(asset,f)).status,'failed');assert.equal(f.calls.some(x=>x.method),false);
});
test('failed or uncertain provider deletion has no unversioned fallback or blind retry',async()=>{
 for(const deleteStatus of [403,409,412,500]){const f=fixture({deleteStatus,getStatus:403});assert.equal((await helper.expirePlatformBrandAsset(asset,f)).status,'failed');assert.deepEqual(f.calls.filter(x=>x.method).map(x=>x.method),['DELETE','GET']);}
 const f=fixture({fetchError:true});assert.equal((await helper.expirePlatformBrandAsset(asset,f)).status,'failed');assert.equal(f.calls.filter(x=>x.method).length,2);
});
test('present or unauthorized HEAD cannot become absence evidence',async()=>{
 for(const headStatus of [200,403,500]){const f=fixture({headStatus});assert.equal((await helper.expirePlatformBrandAsset(asset,f)).status,'delete_acknowledged');}
});
test('uncertain RPC and forged receipt never return success or retry',async()=>{
 for(const errorAt of ['begin_platform_brand_retention_transport','read_platform_brand_retention_expiry_claim','prepare_platform_brand_retention_dispatch','record_platform_brand_retention_transport_result']){const f=fixture({errorAt});await assert.rejects(helper.expirePlatformBrandAsset(asset,f),/rpc_unconfirmed/);assert.equal(f.calls.filter(x=>x.name===errorAt).length,1);}
 const f=fixture({receipt:{permanentlyAbsent:true}});await assert.rejects(helper.expirePlatformBrandAsset(asset,f),/receipt_unconfirmed/);
});
test('actual handler and helper require existing service authority and one exact asset',async()=>{
 const f=fixture();let clients=0;const handler=createBrandExpiryHandler({env:n=>n==='SUPABASE_URL'?binding.providerOrigin:'synthetic-service-key',client:()=>{clients++;return {rpc:f.rpc};},fetcher:f.fetcher});
 const request=(body,auth='Bearer synthetic-service-key')=>new Request('https://edge.test',{method:'POST',headers:{Authorization:auth},body:JSON.stringify(body)});
 assert.equal((await handler(request({assetId:asset},'Bearer ordinary-user'))).status,403);assert.equal(clients,0);
 for(const body of [{assetId:asset,prefix:'owner/'},{assetIds:[asset]},[asset]])assert.equal((await handler(request(body))).status,400);
 assert.equal(clients,0);const result=await handler(request({assetId:asset}));assert.equal(result.status,200);assert.deepEqual(await result.json(),{status:'observed_absent',permanentlyAbsent:false});
});
test('actual handler-to-helper insecure configuration fails before RPC or provider work',async()=>{
 const f=fixture();let clients=0;const handler=createBrandExpiryHandler({env:n=>n==='SUPABASE_URL'?'http://project.test':'synthetic-service-key',client:()=>{clients++;return {rpc:f.rpc};},fetcher:f.fetcher});
 const result=await handler(new Request('https://edge.test',{method:'POST',headers:{Authorization:'Bearer synthetic-service-key'},body:JSON.stringify({assetId:asset})}));
 assert.equal(result.status,503);assert.equal(clients,0);assert.equal(f.calls.length,0);assert.equal(JSON.stringify(await result.json()).includes('synthetic-service-key'),false);
});

test('actual Edge entrypoint awaits the Supabase thenable builder without broadening handler authority',async()=>{
 let served;const calls=[];
 const Deno={env:{get:name=>name==='SUPABASE_URL'?binding.providerOrigin:'synthetic-service-key'},serve:handler=>{served=handler;}};
 const createClient=(url,key,options)=>{
  assert.equal(url,binding.providerOrigin);assert.equal(key,'synthetic-service-key');
  assert.deepEqual(options,{auth:{persistSession:false,autoRefreshToken:false}});
  return {rpc:(name,args)=>{calls.push({name,args});return {then:resolve=>resolve({data:{status:'transport_unqualified_or_disabled'}})};}};
 };
 load('../supabase/functions/platform-brand-retention-expiry/index.ts',{Deno,createClient,createBrandExpiryHandler});
 assert.equal(typeof served,'function');
 const response=await served(new Request('https://edge.test',{method:'POST',headers:{Authorization:'Bearer synthetic-service-key'},body:JSON.stringify({assetId:asset})}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'transport_unqualified_or_disabled',permanentlyAbsent:false});
 assert.deepEqual(calls,[{name:'begin_platform_brand_retention_transport',args:{p_asset_id:asset}}]);
});

test('actual missing response shapes, never arbitrary statuses or permission failures',async()=>{
 for(const status of [400,404]) for(const code of ['NoSuchKey','NoSuchObject','not_found']) {
  const f=fixture({getStatus:status,body:{code,statusCode:'404'},binding:{observationOnly:true}});
  assert.equal((await helper.expirePlatformBrandAsset(asset,f)).status,'observed_absent');
  assert.equal(f.calls.some(x=>x.method==='DELETE'),false);
 }
 for(const options of [{getStatus:403},{getStatus:200},{body:{code:'AccessDenied',statusCode:'404'}},{body:{statusCode:'404'}},{body:{code:'NoSuchKey',statusCode:'403'}}]) {
  const f=fixture({...options,binding:{observationOnly:true,deleteAcknowledged:true}});
  assert.equal((await helper.expirePlatformBrandAsset(asset,f)).status,'delete_acknowledged');
  assert.equal(f.calls.some(x=>x.method==='DELETE'),false);
 }
});

test('metadata-missing, prior intent and concurrent lost permit are read-only',async()=>{
 for(const options of [{binding:{metadataPresent:false}},{binding:{observationOnly:true}},{permitStatus:'observe_only'}]) {
  const f=fixture(options);assert.equal((await helper.expirePlatformBrandAsset(asset,f)).status,'observed_absent');
  assert.equal(f.calls.some(x=>x.method==='DELETE'),false);
 }
});

test('contradictory or wrong-generation dispatch permits never reach the provider',async()=>{
 for(const permit of [{metadataPresent:false},{observationOnly:true},{deleteAcknowledged:true},{storageVersion:'changed'},{metadataPresent:undefined}]) {
  const f=fixture({permit});await assert.rejects(helper.expirePlatformBrandAsset(asset,f),/binding_invalid/);
  assert.equal(f.calls.some(x=>x.method),false);
 }
});

test('acknowledgement survives stale current GET then a later read-only convergence',async()=>{
 const f=fixture();let intent=false,ack=false,deletes=0,currentPresent=true;
 const rpc=async(name,args)=>{
  if(name==='read_platform_brand_retention_expiry_claim')return {data:{...binding,status:'authorized',observationOnly:intent,deleteAcknowledged:ack}};
  if(name==='prepare_platform_brand_retention_dispatch'){const prior=intent;intent=true;return {data:{...binding,status:prior?'observe_only':'dispatch_authorized'}};}
  if(name==='record_platform_brand_retention_transport_result'&&args.p_outcome==='delete_acknowledged')ack=true;
  return f.rpc(name,args);
 };
 const origin=async(b,op)=>{if(op==='DELETE')deletes++;if(op==='GET'&&currentPresent)return new Response('cached synthetic content',{status:200});return f.origin(b,op);};
 assert.equal((await helper.expirePlatformBrandAsset(asset,{rpc,origin})).status,'delete_acknowledged');
 assert.equal((await helper.expirePlatformBrandAsset(asset,{rpc,origin})).status,'delete_acknowledged');
 currentPresent=false;
 assert.equal((await helper.expirePlatformBrandAsset(asset,{rpc,origin})).status,'observed_absent');
 assert.equal(deletes,1);
});

test('ack-write failure and uncertain dispatch cannot authorize a second delete',async()=>{
 for(const crash of ['ack-write','dispatch','marker-result']) {
  const f=fixture();let intent=false,deletes=0,fail=true;
  const rpc=async(name,args)=>{
   if(name==='read_platform_brand_retention_expiry_claim')return {data:{...binding,status:'authorized',observationOnly:intent}};
   if(name==='prepare_platform_brand_retention_dispatch'){intent=true;if(crash==='marker-result'&&fail)throw Error('lost commit response');return {data:{...binding,status:'dispatch_authorized'}};}
   if(name==='record_platform_brand_retention_transport_result'&&crash==='ack-write'&&fail)throw Error('ack persistence uncertain');
   return f.rpc(name,args);
  };
  const origin=async(b,op)=>{if(op==='DELETE'){deletes++;if(crash==='dispatch'&&fail)throw Error('response lost');}return new Response(null,{status:200});};
  if(crash==='dispatch')assert.equal((await helper.expirePlatformBrandAsset(asset,{rpc,origin})).status,'failed');
  else await assert.rejects(helper.expirePlatformBrandAsset(asset,{rpc,origin}),/rpc_unconfirmed/);
  fail=false;
  assert.equal((await helper.expirePlatformBrandAsset(asset,{rpc,origin})).status,'failed');
  assert.equal(deletes,crash==='marker-result'?0:1);
 }
});

test('bounded parser rejects oversized, partial, malformed, conflicting and stalled error streams',async()=>{
 for(const kind of ['oversized','partial','malformed','stalled']) {
  const f=fixture({binding:{observationOnly:true}});let cancelled=false;
  const stream=new ReadableStream({start(c){if(kind==='oversized')c.enqueue(new Uint8Array(65537));else if(kind==='partial')c.error(Error('interrupted'));else if(kind==='malformed'){c.enqueue(new TextEncoder().encode('{'));c.close();}},cancel(){cancelled=true;}});
  const origin=async()=>new Response(stream,{status:400});
  assert.equal((await helper.expirePlatformBrandAsset(asset,{rpc:f.rpc,origin})).status,'failed');
  if(kind==='oversized'||kind==='stalled')assert.equal(cancelled,true);
 }
});

test('invalid operation is blocked and redirects are refused at the real fetch boundary',async()=>{
 const f=fixture();await assert.rejects(f.origin(binding,'PUT'),/binding_invalid/);assert.equal(f.calls.length,0);
 const origin=helper.createBrandExpiryOrigin(binding.providerOrigin,'synthetic-key',async(_,init)=>{assert.equal(init.redirect,'error');assert.ok(init.signal);throw Error('redirect blocked');});
 await assert.rejects(origin(binding,'INFO'),/origin_failed/);
});
