import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createClient as installedCreateClient} from '@supabase/supabase-js';
import {loadQualificationModule} from '../../../tests/helpers/r2-qualification-fixture.mjs';

const {createQualificationRuntime}=loadQualificationModule('r2-disposable-qualification-runtime.ts');
const {createQualificationHandler}=loadQualificationModule('r2-disposable-qualification-handler.ts');
const {initialState,runQualification}=loadQualificationModule('r2-disposable-qualification.ts');
const {RUN_ID,RUN_APPROVED,CLEANUP_APPROVED,BUCKET,R2_ENDPOINT,OBJECTS,MUTATION_RECEIPTS,DEADLINE}=loadQualificationModule('r2-disposable-qualification-manifest.ts');
const key='synthetic-canonical-service',project='https://bmkkhihfbmsnnmcqkoly.supabase.co';
const readUrl=project+'/rest/v1/rpc/read_r2_qualification_test_run';
const casUrl=project+'/rest/v1/rpc/cas_r2_qualification_test_run';
const now=()=>Date.parse('2026-10-24T11:00:00.000Z');
const environment={SUPABASE_URL:project,RETENTION_WORKER_SERVICE_KEY_SHA256:createHash('sha256').update(key).digest('hex'),
  SUPABASE_SERVICE_ROLE_KEY:'synthetic-injected-not-authority'};
const request=(action='prepare',authorization='Bearer '+key)=>new Request('https://synthetic.invalid',{
  method:'POST',headers:{Authorization:authorization},body:JSON.stringify({runId:RUN_ID,action}),
});
const envelope=()=>({method:'POST',headers:{Authorization:'Bearer '+key,apikey:key,'X-Not-Forwarded':'private-sdk-value'},
  body:'private-sdk-body',redirect:'follow',credentials:'include',referrer:'https://untrusted.invalid'});
function fixture({change={},dispatch,construct,network}={}) {
  const reads=[],clients=[],calls=[],rpc=[];
  const runtime=createQualificationRuntime({env:name=>{reads.push(name);return {...environment,...change}[name];},now,
    createClient:(url,credential,options)=>{
      clients.push({url,credential,options});construct?.(options);
      return {rpc:async(name,args)=>{
        rpc.push([name,args]);
        const response=await (dispatch??((fetch,name)=>fetch(project+'/rest/v1/rpc/'+name,envelope())))(options.global.fetch,name,args);
        return {data:await response.json(),error:null};
      }};
    },
    request:async(input,init)=>{calls.push({input,init});return network?network(input,init):new Response('null',{status:200});},
  });
  return {runtime,handler:createQualificationHandler(runtime),reads,clients,calls,rpc};
}

// The real handler, SDK, store, core and signed origin use only this synthetic
// transport. No approval overrides, source rewriting or inherited fetch exist.
async function commissionedFixture({change={},missing=false,fault}={}) {
  let state=missing?null:await initialState(),clock=now();
  const reads=[],database=[],provider=[],objects=new Map();
  const env={...environment,MEDIA_ORIGIN_PROVIDER:'cloudflare_r2',MEDIA_ORIGIN_PRIVATE_ONLY:'true',
    MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED:'true',MEDIA_ORIGIN_R2_ENDPOINT:R2_ENDPOINT,MEDIA_ORIGIN_BUCKET:BUCKET,
    MEDIA_ORIGIN_R2_ACCESS_KEY_ID:'synthetic-access',MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY:'synthetic-secret',...change};
  const keys=new Set([...Object.values(OBJECTS),...Object.values(MUTATION_RECEIPTS)].map(item=>item.key));
  const runtime=createQualificationRuntime({env:name=>{reads.push(name);return env[name];},now:()=>clock,
    createClient:installedCreateClient,request:async(input,init)=>{
      if(input===readUrl||input===casUrl){
        database.push({input,init});assert.equal(init.method,'POST');
        assert.equal(init.headers.Authorization,'Bearer '+key);assert.equal(init.headers.apikey,key);
        const args=JSON.parse(init.body);assert.equal(args.p_run_id,RUN_ID);
        if(fault==='database')throw Error('private database '+key);
        if(input===readUrl)return new Response(JSON.stringify(state));
        if(state===null||state.revision!==args.p_expected_revision)return new Response('false');
        state=structuredClone(args.p_next_state);return new Response('true');
      }
      const url=new URL(input),objectKey=decodeURIComponent(url.pathname.slice(1));
      assert.equal(url.origin,`https://${BUCKET}.${new URL(R2_ENDPOINT).hostname}`);
      assert.ok(keys.has(objectKey));assert.equal(init.redirect,'error');assert.equal(url.search,'');
      provider.push({key:objectKey,method:init.method});
      if(fault==='origin_once'){fault=undefined;throw Error('private origin synthetic-secret');}
      if(init.method==='PUT'){
        assert.equal(init.headers['if-none-match'],'*');
        if(objects.has(objectKey))return new Response(null,{status:412});
        objects.set(objectKey,init.body);return new Response(null,{status:200});
      }
      assert.equal(init.method,'GET','non-delete fixture must never dispatch DELETE');
      return objects.has(objectKey)?new Response(objects.get(objectKey)):new Response(null,{status:404});
    },
  });
  return {handler:createQualificationHandler(runtime),reads,database,provider,objects,
    state:()=>structuredClone(state),setNow:value=>{clock=value;}};
}

test('runtime import, construction and store factory are inert; origin remains lazy',()=>{
  const f=fixture();assert.deepEqual(f.reads,[]);assert.deepEqual(f.clients,[]);assert.deepEqual(f.calls,[]);
  f.runtime.store(key);assert.deepEqual(f.reads,[]);assert.deepEqual(f.clients,[]);assert.deepEqual(f.calls,[]);
});
test('wrong auth and missing/invalid configuration never construct a client or read origin secrets',async()=>{
  for(const change of [{},{SUPABASE_URL:undefined},{SUPABASE_URL:'https://other.supabase.co'},
    {RETENTION_WORKER_SERVICE_KEY_SHA256:undefined},{RETENTION_WORKER_SERVICE_KEY_SHA256:'not-a-hash'}]){
    const f=fixture({change});
    for(const auth of ['Bearer wrong','Bearer '+environment.SUPABASE_SERVICE_ROLE_KEY,
      ...(Object.keys(change).length?['Bearer '+key]:[])]){
      const response=await f.handler(request('prepare',auth));
      assert.equal(response.status,403);
    }
    assert.deepEqual(f.clients,[]);assert.deepEqual(f.calls,[]);
    assert.ok(f.reads.every(name=>['SUPABASE_URL','RETENTION_WORKER_SERVICE_KEY_SHA256'].includes(name)));
  }
});
test('cleanup source gate alone cannot bypass missing durable state or construct an origin',async()=>{
  assert.equal(RUN_APPROVED,true);assert.equal(CLEANUP_APPROVED,true);
  const f=fixture();
  for(let repeat=0;repeat<3;repeat++){
    const response=await f.handler(request('cleanup'));assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{status:'qualification_unconfirmed'});
  }
  assert.equal(f.clients.length,3);assert.deepEqual(f.calls.map(call=>call.input),[readUrl,readUrl,readUrl]);
  assert.ok(f.reads.every(name=>['SUPABASE_URL','RETENTION_WORKER_SERVICE_KEY_SHA256'].includes(name)));
});
test('authenticated commissioned pipeline creates two files and three receipts, verifies bytes and rejects overwrite without deletion',async()=>{
  const f=await commissionedFixture();
  for(const [action,status] of [['prepare','prepared'],['read','read_verified'],['conflict','conflict_verified']]){
    const response=await f.handler(request(action));assert.equal(response.status,200);
    const output=await response.json();assert.equal(output.status,status);
    const serialized=JSON.stringify(output);
    for(const privateValue of [key,'synthetic-secret',OBJECTS.target.key,OBJECTS.control.payload])assert.ok(!serialized.includes(privateValue));
  }
  assert.equal(f.state().requestBudgetReserved,10);assert.equal(f.provider.length,10);
  assert.equal(f.objects.size,5);
  for(const object of Object.values(OBJECTS))assert.equal(f.objects.get(object.key),object.payload);
  for(const operation of ['put_control','put_target','conflict_target']){
    assert.equal(f.objects.get(MUTATION_RECEIPTS[operation].key),MUTATION_RECEIPTS[operation].payload);
  }
  for(const operation of ['delete_control','delete_target'])assert.ok(!f.objects.has(MUTATION_RECEIPTS[operation].key));
  assert.ok(!f.provider.some(call=>call.method==='DELETE'));
  const providerCount=f.provider.length;
  for(const action of ['prepare','read','conflict','reconcile','status','prepare']){
    const response=await f.handler(request(action));assert.equal(response.status,200);
    assert.equal((await response.json()).status,'conflict_verified');
  }
  assert.equal(f.provider.length,providerCount);
  // The separate SQL-backed integration test proves the cleanup approval fence.
  assert.ok(!f.reads.includes('SUPABASE_SERVICE_ROLE_KEY'));
});
test('authenticated missing-ledger and status paths never read provider configuration',async()=>{
  const missing=await commissionedFixture({missing:true});
  const denied=await missing.handler(request('prepare'));assert.equal(denied.status,503);
  assert.deepEqual(await denied.json(),{status:'qualification_unconfirmed'});assert.deepEqual(missing.provider,[]);
  assert.ok(missing.reads.every(name=>['SUPABASE_URL','RETENTION_WORKER_SERVICE_KEY_SHA256'].includes(name)));
  const f=await commissionedFixture({change:{MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY:undefined}});
  for(const action of ['status','read','conflict','reconcile']){
    const response=await f.handler(request(action));assert.equal(response.status,200);
    assert.equal((await response.json()).status,'new');
  }
  assert.deepEqual(f.provider,[]);
  assert.ok(f.reads.every(name=>['SUPABASE_URL','RETENTION_WORKER_SERVICE_KEY_SHA256'].includes(name)));
});
test('commissioned handler sanitizes client/origin failures and never replays an uncertain mutation',async()=>{
  for(const options of [{fault:'database'},{change:{MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY:undefined}},
    {change:{MEDIA_ORIGIN_R2_ENDPOINT:'https://00000000000000000000000000000000.r2.cloudflarestorage.com'}},
    {fault:'origin_once'}]){
    const f=await commissionedFixture(options),response=await f.handler(request('prepare'));
    assert.equal(response.status,503);assert.deepEqual(await response.json(),{status:'qualification_unconfirmed'});
    const count=f.provider.length;
    if(options.fault!=='database'){
      assert.equal(f.state().pending,'put_control');
      const retry=await f.handler(request('prepare'));assert.equal(retry.status,200);
      assert.equal((await retry.json()).status,'pending_reconcile_required');
    }
    assert.equal(f.provider.length,count);assert.ok(count<2);
  }
});
test('commissioned handler stops non-status phases at the unchanged deadline without provider dispatch',async()=>{
  for(const clock of [Date.parse(DEADLINE),Date.parse(DEADLINE)+1,NaN]){
    const f=await commissionedFixture();f.setNow(clock);
    for(const action of ['prepare','read','conflict','reconcile']){
      const response=await f.handler(request(action));assert.equal(response.status,503);
      assert.deepEqual(await response.json(),{status:'qualification_unconfirmed'});
    }
    assert.deepEqual(f.provider,[]);assert.equal(f.state().revision,0);
    const status=await f.handler(request('status'));assert.equal(status.status,200);assert.equal((await status.json()).status,'new');
    assert.equal((await f.handler(request('cleanup'))).status,503);
  }
});
test('request/env fields cannot add cleanup authority or change the bound run',async()=>{
  const f=fixture({change:{RUN_APPROVED:'false',CLEANUP_APPROVED:'true'}});
  for(const body of [{runId:RUN_ID,action:'cleanup',cleanupApproved:true},
    {runId:RUN_ID,action:'prepare',RUN_APPROVED:true},{runId:'other',action:'prepare'}]){
    const req=new Request('https://synthetic.invalid',{method:'POST',headers:{Authorization:'Bearer '+key},body:JSON.stringify(body)});
    assert.equal((await f.handler(req)).status,400);
  }
  assert.deepEqual(f.clients,[]);assert.deepEqual(f.calls,[]);
  assert.equal((await f.handler(request('cleanup'))).status,503);
  assert.equal(f.clients.length,1);assert.deepEqual(f.calls.map(call=>call.input),[readUrl]);
  assert.ok(!f.reads.includes('RUN_APPROVED'));assert.ok(!f.reads.includes('CLEANUP_APPROVED'));
});
test('lazy verified-key client sends only fixed read/CAS POST bodies and no credential alternatives',async()=>{
  const state=await initialState();
  const f=fixture({network:async(url)=>new Response(JSON.stringify(url===readUrl?state:true))});
  const store=f.runtime.store(key);assert.deepEqual(f.clients,[]);
  assert.deepEqual(await store.read(),state);
  assert.equal(await store.compareAndSwap(0,{...state,revision:1,pending:'put_control',requestBudgetReserved:2}),true);
  assert.equal(f.clients.length,2);assert.equal(f.calls.length,2);assert.deepEqual(f.reads,[]);
  for(const client of f.clients){
    assert.equal(client.url,project);assert.equal(client.credential,key);
    assert.deepEqual(client.options.auth,{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false});
  }
  for(const [i,{input,init}] of f.calls.entries()){
    assert.equal(input,i===0?readUrl:casUrl);assert.equal(init.method,'POST');assert.equal(init.redirect,'error');
    assert.equal(init.cache,'no-store');assert.equal(init.credentials,'omit');assert.ok(init.signal instanceof AbortSignal);
    assert.deepEqual(init.headers,{Authorization:'Bearer '+key,apikey:key,'Content-Type':'application/json','Content-Profile':'public'});
    assert.deepEqual(JSON.parse(init.body),f.rpc[i][1]);
    assert.ok(!JSON.stringify({input,init}).includes(environment.SUPABASE_SERVICE_ROLE_KEY));
    assert.ok(!JSON.stringify({input,init}).includes('private-sdk'));
    assert.equal(init.referrer,undefined);
  }
});
test('transport refuses arbitrary destinations, other same-project APIs, query/fragment/path variants and mismatched RPC',async()=>{
  for(const url of ['https://evil.invalid/'+key,project+'/auth/v1/user',project+'/rest/v1/users',casUrl,
    readUrl+'?x=1',readUrl+'#fragment',readUrl+'/',project+'/rest/v1/rpc/%72ead_r2_qualification_test_run',
    readUrl.replace('https://','http://'),readUrl.replace('https://','https://user:pass@'),
    readUrl.replace('.supabase.co','.supabase.co:443')]){
    const f=fixture({dispatch:fetch=>fetch(url,envelope())});
    await assert.rejects(f.runtime.store(key).read(),error=>error.message==='qualification_store_unconfirmed');
    assert.deepEqual(f.calls,[]);
  }
});
test('transport refuses non-POST/default method and wrong/missing credential headers before network',async()=>{
  for(const init of [{...envelope(),method:'GET'},{...envelope(),method:'HEAD'},{...envelope(),method:'post'},
    {...envelope(),method:undefined},{...envelope(),headers:{}},
    {...envelope(),headers:{Authorization:'Bearer wrong',apikey:key}},
    {...envelope(),headers:{Authorization:'Bearer '+key,apikey:'different-key'}}]){
    const f=fixture({dispatch:fetch=>fetch(readUrl,init)});
    await assert.rejects(f.runtime.store(key).read(),/qualification_store_unconfirmed/);assert.deepEqual(f.calls,[]);
  }
});
test('Request and URL inputs obey the same exact target and effective method rules',async()=>{
  for(const input of [new URL(readUrl),new Request(readUrl,envelope())]){
    const f=fixture({dispatch:fetch=>fetch(input,input instanceof Request?undefined:envelope())});
    assert.equal(await f.runtime.store(key).read(),null);assert.equal(f.calls.length,1);
  }
  const f=fixture({dispatch:fetch=>fetch(new Request(readUrl,envelope()),{method:'GET'})});
  await assert.rejects(f.runtime.store(key).read(),/qualification_store_unconfirmed/);assert.deepEqual(f.calls,[]);
});
test('each logical RPC permits only one dispatch, including retries after uncertain network results',async()=>{
  for(const failed of [false,true]){
    const f=fixture({network:()=>{if(failed)throw Error('private network error '+key);return new Response('null');},
      dispatch:async fetch=>{try{await fetch(readUrl,envelope());}catch{}return fetch(readUrl,envelope());}});
    await assert.rejects(f.runtime.store(key).read(),error=>error.message==='qualification_store_unconfirmed');
    assert.equal(f.calls.length,1);
  }
});
test('late SDK retries cannot borrow a later or concurrent RPC dispatch allowance',async()=>{
  const transports=[];
  const f=fixture({dispatch:async(fetch,name)=>{transports.push(fetch);return fetch(project+'/rest/v1/rpc/'+name,envelope());}});
  const store=f.runtime.store(key);await Promise.all([store.read(),store.read()]);assert.equal(f.calls.length,2);
  for(const oldFetch of transports)await assert.rejects(oldFetch(readUrl,envelope()),/qualification_rpc_transport_denied/);
  assert.equal(f.calls.length,2);assert.equal(await store.read(),null);assert.equal(f.calls.length,3);
});
test('client, SDK and HTTP failures are sanitized; no retries, logs, provider or secret reads',async()=>{
  for(const options of [{construct:()=>{throw Error('private client '+key);}},
    {dispatch:()=>{throw Error('private SDK '+key);}},
    {network:()=>{throw Error('private network '+key);}},
    ...[301,302,307,308,400,401,403,429,500,503].map(status=>({network:()=>new Response('private body '+key,{status,headers:{location:'https://evil.invalid'}})}))]){
    const f=fixture(options);await assert.rejects(f.runtime.store(key).read(),error=>error.message==='qualification_store_unconfirmed');
    assert.ok(f.calls.length<=1);assert.deepEqual(f.reads,[]);
  }
});
test('commissioned handler catches verifier errors without leaking exception text',async()=>{
  const runtime=createQualificationRuntime({env:()=>{throw Error('private configuration');},createClient:()=>{throw Error('must not construct');}});
  const response=await createQualificationHandler(runtime)(request());
  assert.equal(response.status,403);assert.deepEqual(await response.json(),{status:'not_allowed'});
});
test('core status and repeated no-op actions use durable state without origin config',async()=>{
  const state={...await initialState(),phase:'blocked',completed:['put_control'],revision:2,requestBudgetReserved:2};
  const f=fixture({network:()=>new Response(JSON.stringify(state))});
  const deps={store:f.runtime.store(key),origin:operation=>f.runtime.origin()(operation),now,cleanupApproved:false};
  for(const action of ['status','prepare','read','conflict','prepare'])assert.equal((await runQualification(action,deps)).status,'blocked');
  assert.equal(f.calls.length,5);assert.deepEqual(f.reads,[]);
});
test('installed 2.100 SDK exercises real RPC envelopes through the guarded synthetic transport',async()=>{
  const calls=[],state=await initialState();
  const runtime=createQualificationRuntime({env:()=>{throw Error('no env reads');},createClient:installedCreateClient,now,
    request:async(input,init)=>{calls.push({input,init});return new Response(JSON.stringify(input===readUrl?state:true),{headers:{'Content-Type':'application/json'}});}});
  const store=runtime.store(key);assert.deepEqual(await store.read(),state);
  assert.equal(await store.compareAndSwap(0,{...state,revision:1,pending:'put_control',requestBudgetReserved:2}),true);
  assert.deepEqual(calls.map(c=>c.input),[readUrl,casUrl]);
});
test('offline loader still denies default fetch for the new runtime',async()=>{
  let outsideCalls=0;const original=globalThis.fetch;globalThis.fetch=()=>{outsideCalls++;throw Error('must not reach host fetch');};
  try{
    const runtime=createQualificationRuntime({env:()=>undefined,createClient:(_url,_key,options)=>({
      rpc:async()=>({data:await (await options.global.fetch(readUrl,envelope())).json()}),
    })});
    await assert.rejects(runtime.store(key).read(),/qualification_store_unconfirmed/);assert.equal(outsideCalls,0);
  }finally{globalThis.fetch=original;}
});
test('commissioned entrypoint preserves JWT verification and exact handler/runtime composition',()=>{
  const source=readFileSync(new URL('../r2-disposable-qualification/index.ts',import.meta.url),'utf8');
  const config=readFileSync(new URL('../../config.toml',import.meta.url),'utf8');
  assert.match(config,/\[functions\.r2-disposable-qualification\]\nverify_jwt = true/);
  assert.equal(config.split('[functions.r2-disposable-qualification]').length,2);
  assert.match(source,/npm:@supabase\/supabase-js@2\.100\.0/);
  assert.match(source,/Deno\.serve\(createQualificationHandler\(createQualificationRuntime\(\{/);
  assert.ok(!source.includes('RUN_APPROVED'));assert.ok(!source.includes('CLEANUP_APPROVED'));
  assert.ok(!source.includes('SERVICE_ROLE_KEY'));
});
