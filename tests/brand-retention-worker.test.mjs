import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Match the Node20 product lane without changing the production TypeScript.
function load(path,imports={}) {
  const source=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};new Function('exports',...Object.keys(imports),js)(exports,...Object.values(imports));return exports;
}
const transport=load('../supabase/functions/_shared/brand-retention-expiry.ts');
const {createBrandExpiryOrigin}=transport;
const brandWorker=load('../supabase/functions/_shared/brand-retention-worker.ts',transport);
const {runPlatformBrandRetentionExpiryBatch}=brandWorker;
const {runDeletedContentRetentionWorker}=load('../supabase/functions/_shared/deleted-content-retention-worker.ts',{
  ...load('../supabase/functions/_shared/deleted-content-retention.ts'),
  ...load('../supabase/functions/_shared/deleted-content-media-expiry.ts'),...brandWorker,
});

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const claim=id(100),storageObject=id(101),project='https://brand.supabase.test';
const work=assetIds=>({enabled:true,qualified:true,assetIds,limit:25});
function fixture(options={}) {
  const calls=[],requests=[];
  const rpc=async(name,args)=>{
    calls.push({name,args});
    if(name===options.errorAt && (!options.errorAsset || args.p_asset_id===options.errorAsset)) {
      if(options.throwRpc) throw Error('synthetic-private-database-error');
      return {data:null,error:{message:'synthetic-private-database-error'}};
    }
    let data;
    if(name==='list_platform_brand_retention_expiry_work') data=Object.hasOwn(options,'work')?options.work:work([id(1)]);
    else if(name==='begin_platform_brand_retention_batch_transport') data={status:options.claimStatus??'claimed',assetId:args.p_asset_id,claimToken:claim};
    else if(name==='read_platform_brand_retention_batch_claim'||name==='prepare_platform_brand_retention_batch_dispatch') data={status:name==='prepare_platform_brand_retention_batch_dispatch'?'dispatch_authorized':options.readStatus??'authorized',
      assetId:args.p_asset_id,claimToken:claim,provider:'supabase',bucket:'platform-brand-assets',
      objectKey:`owner/logo/${args.p_asset_id}.png`,storageObjectId:storageObject,storageVersion:'exact-version',
      providerOrigin:project,providerContractSha256:'a'.repeat(64),exactVersionDelete:true,permanentlyAbsent:false,metadataPresent:true,observationOnly:false,deleteAcknowledged:false};
    else if(name==='record_platform_brand_retention_transport_result') data={status:args.p_outcome,
      assetId:args.p_asset_id,claimToken:claim,permanentlyAbsent:false,...options.receipt};
    else if(name==='record_platform_brand_retention_worker_heartbeat') data={status:'recorded',
      enabled:args.p_enabled,qualified:args.p_qualified,permanentlyAbsent:false,...options.heartbeat};
    else if(name==='record_deleted_content_worker_heartbeat') data={};
    else if(['list_deleted_content_expiry_work','list_deleted_content_media_expiry_work',
      'list_deleted_content_stage_cleanup_work'].includes(name)) data={enabled:false};
    else throw Error('unexpected RPC: '+name);
    return {data,error:null};
  };
  const origin=createBrandExpiryOrigin(project,'synthetic-service-key',async(url,init)=>{
    requests.push({url:String(url),init});
    if(options.providerThrows) throw Error('synthetic-private-provider-url');
    const failing=options.failAsset && String(url).includes(options.failAsset);
    if(init.method==='GET')return new Response(JSON.stringify({code:'NoSuchKey',statusCode:'404'}),{status:failing?503:400});
    return new Response(null,{status:init.method==='DELETE'?(failing?503:204):(options.headStatus??404)});
  });
  return {rpc,origin,calls,requests};
}
const heartbeatNames=f=>f.calls.filter(c=>c.name.includes('heartbeat')).map(c=>c.name);

test('disabled and unqualified passes record only state-labelled liveness with zero transport calls',async()=>{
  for(const [enabled,qualified] of [[false,false],[false,true],[true,false]]) {
    const f=fixture({work:{...work([]),enabled,qualified}});
    const result=await runPlatformBrandRetentionExpiryBatch(f.rpc,f.origin);
    assert.deepEqual(result,{enabled,qualified,results:[],success:true,heartbeatRecorded:true,
      permanentPhysicalAbsenceGuaranteed:false});
    assert.deepEqual(f.requests,[]);
    assert.deepEqual(f.calls,[{name:'list_platform_brand_retention_expiry_work',args:{}},
      {name:'record_platform_brand_retention_worker_heartbeat',args:{p_enabled:enabled,p_qualified:qualified}}]);
  }
});

test('the entire bounded typed queue is validated before any asset or heartbeat mutation',async()=>{
  const alias='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const malformed=[null,undefined,[],{}, {...work([]),enabled:1},{...work([]),qualified:'true'},
    {...work([]),limit:24},{...work([]),limit:'25'},{...work([]),limit:undefined},
    {...work([]),assetIds:null},work(['-'.repeat(36)]),work([id(1),null]),work([id(1),id(1)]),
    work([alias,alias.toUpperCase()]),work(Array.from({length:26},(_,i)=>id(i+1))),
    {...work([id(1)]),enabled:false},{...work([id(1)]),qualified:false}];
  for(const response of malformed) {
    const f=fixture({work:response});
    const result=await runPlatformBrandRetentionExpiryBatch(f.rpc,f.origin);
    assert.equal(result.success,false);assert.equal(result.error,'brand_retention_work_invalid');
    assert.equal(result.heartbeatRecorded,false);assert.deepEqual(result.results,[]);
    assert.deepEqual(f.requests,[]);assert.equal(f.calls.length,1);
  }
});

test('exactly 25 due assets each reuse one exact claim, recheck, transport and receipt without listing storage',async()=>{
  const assetIds=Array.from({length:25},(_,i)=>id(i+1));
  const f=fixture({work:work(assetIds)}),result=await runPlatformBrandRetentionExpiryBatch(f.rpc,f.origin);
  assert.equal(result.success,true);assert.equal(result.heartbeatRecorded,true);
  assert.deepEqual(result.results,assetIds.map(assetId=>({assetId,status:'observed_absent',permanentlyAbsent:false})));
  assert.equal(f.requests.length,100);
  for(const assetId of assetIds) {
    const attempts=f.calls.filter(c=>c.args.p_asset_id===assetId);
    assert.deepEqual(attempts.map(c=>c.name),['begin_platform_brand_retention_batch_transport',
      'read_platform_brand_retention_batch_claim','prepare_platform_brand_retention_batch_dispatch','record_platform_brand_retention_transport_result','record_platform_brand_retention_transport_result']);
    const requests=f.requests.filter(r=>r.url.includes(assetId));
    assert.deepEqual(requests.map(r=>r.init.method),['DELETE','GET','HEAD','GET']);
    for(const request of requests) {
      const url=new URL(request.url);
      assert.equal(url.origin,project);assert.equal(url.search,request.init.method==='GET'?'':'?versionId=exact-version');
      assert.equal(request.init.redirect,'error');assert.equal(request.init.cache,'no-store');
    }
  }
  assert.deepEqual(heartbeatNames(f),['record_platform_brand_retention_worker_heartbeat']);
  assert.equal(f.calls.at(-1).name,'record_platform_brand_retention_worker_heartbeat');
  assert.equal(result.permanentPhysicalAbsenceGuaranteed,false);
});

test('holds, changed generations and qualification changes still fail closed at the existing exact recheck',async()=>{
  for(const options of [{claimStatus:'held'},{claimStatus:'transport_unqualified_or_disabled'},
    {claimStatus:'not_due'},{readStatus:'storage_generation_changed'},{readStatus:'references_or_coverage_blocked'},
    {claimStatus:'batch_disabled_or_unqualified'},{claimStatus:'batch_dispatch_unavailable'},
    {readStatus:'batch_disabled_or_unqualified'},{readStatus:'batch_dispatch_unavailable'}]) {
    const f=fixture(options),result=await runPlatformBrandRetentionExpiryBatch(f.rpc,f.origin);
    assert.equal(result.results[0].status,options.claimStatus??options.readStatus);
    assert.equal(result.success,true);assert.deepEqual(f.requests,[]);
    assert.equal(f.calls.some(c=>c.name==='record_platform_brand_retention_transport_result'),false);
    assert.equal(result.permanentPhysicalAbsenceGuaranteed,false);
  }
});

test('every known Brand protocol blocker remains an honest completed-pass outcome without provider calls',async()=>{
  const statuses=['disabled','transport_unqualified_or_disabled','provider_contract_unqualified',
    'publication_schema_unavailable','required_guard_unavailable','not_removed','not_due','held',
    'references_or_coverage_blocked','unproven_incarnation','scan_receipt_adapter_unavailable',
    'scan_receipt_no_longer_current','claim_unavailable','incarnation_unavailable','storage_generation_changed',
    'claimed_scan_evidence_unavailable','proof_no_longer_current','contended',
    'batch_disabled_or_unqualified','batch_dispatch_unavailable'];
  for(const claimStatus of statuses) {
    const f=fixture({claimStatus}),result=await runPlatformBrandRetentionExpiryBatch(f.rpc,f.origin);
    assert.equal(result.success,true);assert.equal(result.results[0].status,claimStatus);
    assert.deepEqual(f.requests,[]);
    assert.deepEqual(heartbeatNames(f),['record_platform_brand_retention_worker_heartbeat']);
  }
});

test('unknown and intermediate begin/read statuses are sanitized failures, not successful batch heartbeats',async()=>{
  for(const options of [{claimStatus:'synthetic-private-unknown-claim'},{readStatus:'synthetic-private-unknown-read'},
    {claimStatus:''},{readStatus:''},{claimStatus:'authorized'},{readStatus:'claimed'}]) {
    const f=fixture(options);
    const result=await runDeletedContentRetentionWorker(f.rpc,()=>{throw Error('R2 disabled');},f.origin);
    assert.equal(result.success,false);assert.equal(result.brand.success,false);
    assert.equal(result.brand.heartbeatRecorded,false);
    assert.equal(result.brand.error,'brand_retention_asset_attempt_failed');
    assert.deepEqual(result.brand.results,[{assetId:id(1),status:'unconfirmed',permanentlyAbsent:false}]);
    assert.deepEqual(f.requests,[]);assert.deepEqual(heartbeatNames(f),[]);
    assert.equal(f.calls.some(c=>c.name==='record_platform_brand_retention_transport_result'),false);
    assert.equal(JSON.stringify(result).includes('synthetic-private'),false);
  }
});

test('partial Brand provider failure preserves every outcome and prevents Brand and global success heartbeats',async()=>{
  const f=fixture({work:work([id(1),id(2),id(3)]),failAsset:id(2)});
  const result=await runDeletedContentRetentionWorker(f.rpc,()=>{throw Error('R2 must remain unused');},f.origin);
  assert.equal(result.success,false);assert.equal(result.brand.success,false);
  assert.deepEqual(result.brand.results.map(r=>r.status),['observed_absent','failed','observed_absent']);
  assert.deepEqual(heartbeatNames(f),[]);assert.equal(f.requests.length,10);
  assert.equal(result.brand.heartbeatRecorded,false);
  assert.equal(result.permanentPhysicalAbsenceGuaranteed,false);
});

test('successful real R2 helper outcomes cannot mask a failed Brand transport or share its provider origin',async()=>{
  const f=fixture({failAsset:id(1)}),r2Requests=[];
  const r2Replies={
    list_deleted_content_media_expiry_work:{enabled:true,stageIds:[id(200)]},
    claim_deleted_content_media_expiry:{status:'claimed',claimId:id(201)},
    read_deleted_content_media_expiry_claim:{status:'authorized',claimId:id(201),
      provider:'cloudflare_r2',bucket:'chillywood-media-origin',objectKey:'synthetic/retired.mp4'},
  };
  const rpc=async(name,args)=>{
    if(Object.hasOwn(r2Replies,name)||name==='record_deleted_content_media_expiry_result') {
      f.calls.push({name,args});
      return {data:r2Replies[name]??{status:args.p_result,permanentlyAbsent:false},error:null};
    }
    return f.rpc(name,args);
  };
  const result=await runDeletedContentRetentionWorker(rpc,async(binding,method)=>{
    assert.equal(binding.provider,'cloudflare_r2');assert.equal(binding.bucket,'chillywood-media-origin');
    r2Requests.push(method);return new Response(null,{status:method==='DELETE'?204:404});
  },f.origin);
  assert.deepEqual(r2Requests,['DELETE','HEAD']);
  assert.equal(result.media.results[0].status,'observed_absent');
  assert.equal(result.brand.results[0].status,'failed');assert.equal(result.success,false);
  assert.equal(f.requests.length,2);assert.equal(new URL(f.requests[0].url).origin,project);
  assert.deepEqual(heartbeatNames(f),[]);
});

test('uncertain Brand RPCs preserve earlier outcomes, do not retry, and never refresh either success heartbeat',async()=>{
  for(const errorAt of ['begin_platform_brand_retention_batch_transport','read_platform_brand_retention_batch_claim',
    'record_platform_brand_retention_transport_result']) {
    for(const throwRpc of [false,true]) {
      const f=fixture({work:work([id(1),id(2),id(3)]),errorAt,errorAsset:id(2),throwRpc});
      const result=await runDeletedContentRetentionWorker(f.rpc,()=>{throw Error('R2 disabled');},f.origin);
      assert.equal(result.success,false);
      assert.deepEqual(result.brand.results.map(r=>r.status),['observed_absent','unconfirmed','observed_absent']);
      assert.equal(f.calls.filter(c=>c.name===errorAt&&c.args.p_asset_id===id(2)).length,1);
      assert.deepEqual(heartbeatNames(f),[]);
      assert.equal(JSON.stringify(result).includes('synthetic-private'),false);
    }
  }
});

test('list failure is fail-closed, sanitized, and not hidden by an otherwise successful R2 pass',async()=>{
  for(const throwRpc of [false,true]) {
    const f=fixture({errorAt:'list_platform_brand_retention_expiry_work',throwRpc});
    const result=await runDeletedContentRetentionWorker(f.rpc,()=>{throw Error('R2 disabled');},f.origin);
    assert.equal(result.success,false);assert.equal(result.brand.error,'brand_retention_work_unconfirmed');
    assert.equal(result.brand.enabled,null);assert.equal(result.brand.qualified,null);
    assert.deepEqual(heartbeatNames(f),[]);assert.deepEqual(f.requests,[]);
    assert.equal(JSON.stringify(result).includes('synthetic-private'),false);
  }
});

test('uncertain heartbeat receipts are not retried or misreported as confirmed or definitely absent',async()=>{
  for(const options of [{errorAt:'record_platform_brand_retention_worker_heartbeat'},
    {errorAt:'record_platform_brand_retention_worker_heartbeat',throwRpc:true},
    {heartbeat:{status:'other'}},{heartbeat:{enabled:false}},{heartbeat:{qualified:false}},
    {heartbeat:{permanentlyAbsent:true}}]) {
    const f=fixture(options),result=await runDeletedContentRetentionWorker(f.rpc,()=>{throw Error('R2 disabled');},f.origin);
    assert.equal(result.success,false);assert.equal(result.brand.heartbeatRecorded,null);
    assert.equal(result.brand.error,'brand_retention_heartbeat_unconfirmed');
    assert.equal(result.brand.results[0].status,'observed_absent');
    assert.deepEqual(heartbeatNames(f),['record_platform_brand_retention_worker_heartbeat']);
  }
});

test('provider exceptions and forged transport receipts fail without leaking errors or claiming absence',async()=>{
  for(const options of [{providerThrows:true},{receipt:{permanentlyAbsent:true}}]) {
    const f=fixture(options),result=await runPlatformBrandRetentionExpiryBatch(f.rpc,f.origin);
    assert.equal(result.success,false);assert.equal(result.heartbeatRecorded,false);
    assert.equal(result.results[0].status,options.providerThrows?'failed':'unconfirmed');
    assert.equal(result.results[0].permanentlyAbsent,false);
    assert.equal(JSON.stringify(result).includes('synthetic-private'),false);
    assert.deepEqual(heartbeatNames(f),[]);
  }
});

test('empty qualified passes and non-absence HEAD observations remain honest liveness, not permanent deletion proof',async()=>{
  for(const options of [{work:work([])},{headStatus:200},{headStatus:503}]) {
    const f=fixture(options),result=await runPlatformBrandRetentionExpiryBatch(f.rpc,f.origin);
    assert.equal(result.success,true);assert.equal(result.heartbeatRecorded,true);
    assert.equal(result.permanentPhysicalAbsenceGuaranteed,false);
    if(result.results.length) assert.equal(result.results[0].status,'delete_acknowledged');
  }
});
