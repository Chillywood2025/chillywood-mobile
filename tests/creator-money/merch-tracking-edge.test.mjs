import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import ts from 'typescript';

export function loadTracking(file,{Deno={},modules={},fetch=globalThis.fetch,clock=Date,timer=setTimeout}={}) {
 const module={exports:{}};
 const require=name=>{if(name in modules)return modules[name];if(name.startsWith('jsr:'))return {};throw Error(name);};
 new Function('require','module','exports','Deno','fetch','Date','setTimeout',ts.transpileModule(readFileSync('supabase/functions/'+file,'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,module,module.exports,Deno,fetch,clock,timer);
 return module.exports;
}
const tracking=loadTracking('_shared/merch-tracking.ts');
test('carrier dates, identity and HMAC are explicit; no unsigned or replayed evidence',async()=>{
 await assert.rejects(tracking.readBoundedTrackingBody(new Response('a'.repeat(256001)).body),/payload_too_large/);
 const raw=JSON.stringify({carrier:'usps',tracking_number:'ABC12345',test:true,address_to:{zip:'12345',country:'US'},
  tracking_status:{status:'DELIVERED',status_date:'2026-10-29T12:00:00-05:00'},
  tracking_history:[{status_date:'2026-10-27T13:00:00Z'}]});
 const f=await tracking.normalizeTracking(raw);assert.equal(f.status_date,'2026-10-29T17:00:00.000Z');assert.equal(f.review_reason,null);
 assert.equal((await tracking.normalizeTracking(raw.replace('-05:00',''))).review_reason,'ambiguous_carrier_timestamp');
 const now=Math.floor(Date.now()/1000),secret='synthetic-signing-secret';
 const sign=(t,body)=>`t=${t},v1=${createHmac('sha256',secret).update(`${t}.${body}`).digest('hex')}`;
 assert.equal(await tracking.verifyTrackingSignature(raw,sign(now,raw),secret),true);
 assert.equal(await tracking.verifyTrackingSignature(raw+' ',sign(now,raw),secret),false);
 assert.equal(await tracking.verifyTrackingSignature(raw,sign(now-301,raw),secret),false);
 assert.equal(await tracking.verifyTrackingSignature(raw,'',secret),false);
 assert.throws(()=>tracking.trackingNotification(JSON.stringify({event:'track_updated',data:{carrier:'usps',tracking_number:'ABC12345',test:false}})));
});
test('transport is fixed-host test-only merchant-scoped, bounded and never follows redirects',async()=>{
 const job={id:'fixture',carrier:'usps',tracking_number:'ABC12345',provider_account:'managed_fixture'}, calls=[];
 const fetch=async(url,options)=>{calls.push({url,options});return new Response('{}');};
 await assert.rejects(tracking.readExistingShippoTracking(job,'shippo_live_example',fetch));assert.equal(calls.length,0);
 await tracking.readExistingShippoTracking(job,'shippo_test_fixture',fetch);
 assert.equal(calls[0].url,'https://api.goshippo.com/tracks/usps/ABC12345');
 assert.equal(calls[0].options.headers['SHIPPO-ACCOUNT-ID'],'managed_fixture');assert.equal(calls[0].options.redirect,'error');
 assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.body,undefined);
 assert.equal(tracking.shippoRequest,undefined,'registration-capable legacy transport is removed');
 await assert.rejects(tracking.readExistingShippoTracking(job,'shippo_test_fixture',async()=>new Response('',{status:429})),/rate_limited/);
});
test('dormant production transport requires explicit environment and never accepts mismatched credentials',async()=>{
 const job={id:'fixture',carrier:'usps',tracking_number:'ABC12345',provider_account:'managed_fixture'},calls=[];
 const fetch=async(url,options)=>{calls.push({url,options});return new Response('{}');};
 await assert.rejects(tracking.readExistingShippoTracking(job,'shippo_live_fixture',fetch));
 await assert.rejects(tracking.readExistingShippoTracking(job,'shippo_test_fixture',fetch,'production'));
 await assert.rejects(tracking.readExistingShippoTracking(job,'shippo_live_fixture',fetch,'unknown'));
 assert.equal(calls.length,0);
 await tracking.readExistingShippoTracking(job,'shippo_live_fixture',fetch,'production');
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.goshippo.com/tracks/usps/ABC12345');
 assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.redirect,'error');
});
test('stalled tracking body is cancelled and cannot block a worker or webhook indefinitely',async()=>{
 let cancelled=false;
 const body=new ReadableStream({pull:()=>new Promise(()=>{}),cancel:()=>{cancelled=true;}});
 await assert.rejects(tracking.readBoundedTrackingBody(body,5),/deadline/);
 assert.equal(cancelled,true);
});

test('production worker is explicit, exact-mode claimed, live-key-only and rejects missing provider mode',async()=>{
 let worker;const calls=[],requests=[];
 const env={MERCH_TRACKING_ENVIRONMENT:'production',MERCH_TRACKING_WORKER_SECRET:'fixture-worker',MERCH_SHIPPO_LIVE_TOKEN:'shippo_live_fixture'};
 const job={id:'fixture',order_id:'order',lease:'lease',carrier:'usps',tracking_number:'ABC12345',provider_account:'managed_live_fixture',registration_state:'unknown',environment:'production'};
 const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='claim_merch_tracking_jobs'?[job]:{},error:null};}};
 const shared={createAdminClient:()=>({configured:true,client:admin}),jsonResponse:(s,b)=>new Response(JSON.stringify(b),{status:s}),readOptionalEnv:k=>env[k]};
 const provider=loadTracking('_shared/merch-tracking.ts',{fetch:async(url,options)=>{
  requests.push({url,options});return new Response(JSON.stringify({carrier:'usps',tracking_number:'ABC12345',test:false}));
 }});
 loadTracking('merch-tracking-reconcile/index.ts',{Deno:{serve:h=>{worker=h;}},modules:{'../_shared/stripe-connect.ts':shared,'../_shared/merch-tracking.ts':provider}});
 const run=()=>worker(new Request('https://fixture.test',{method:'POST',headers:{authorization:'Bearer fixture-worker'}}));
 assert.equal((await run()).status,200);assert.equal(calls[0].args.p_environment,'production');
 assert.equal(requests[0].options.headers.Authorization,'ShippoToken shippo_live_fixture');
 job.environment='sandbox';requests.length=0;assert.equal((await run()).status,503);assert.equal(requests.length,0);
 env.MERCH_SHIPPO_LIVE_TOKEN='shippo_test_wrong';assert.equal((await run()).status,503);assert.equal(requests.length,0);
 assert.equal((await tracking.normalizeTracking('{"test":null}')).review_reason,'provider_environment_ambiguous');
 assert.deepEqual(tracking.trackingNotification(JSON.stringify({event:'track_updated',data:{carrier:'usps',tracking_number:'ABC12345',test:false}}),'production'),{carrier:'usps',tracking_number:'ABC12345'});
 assert.throws(()=>tracking.trackingNotification(JSON.stringify({event:'track_updated',data:{carrier:'usps',tracking_number:'ABC12345',test:true}}),'production'));
});
test('durable signed callback only enqueues hint, while authenticated worker GET supplies facts',async()=>{
 let webhook,worker;const calls=[],requests=[];
 const env={MERCH_SHIPPO_WEBHOOK_SECRET:'fixture-hmac',MERCH_TRACKING_WORKER_SECRET:'fixture-worker',MERCH_SHIPPO_TEST_TOKEN:'shippo_test_fixture'};
 const job={id:'assignment',order_id:'order',lease:'lease',carrier:'usps',tracking_number:'ABC12345',provider_account:'managed_fixture',registration_state:'pending',environment:'sandbox'};
 const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='claim_merch_tracking_jobs'?[job]:{},error:null};}};
 const shared={createAdminClient:()=>({configured:true,client:admin}),jsonResponse:(s,b)=>new Response(JSON.stringify(b),{status:s}),readOptionalEnv:k=>env[k]};
 const provider=loadTracking('_shared/merch-tracking.ts',{fetch:async(url,options)=>{
  requests.push({url,options});return new Response(JSON.stringify({carrier:'usps',tracking_number:'ABC12345',test:true,
   tracking_status:{status:'DELIVERED',status_date:'2026-10-29T12:00:00Z'},tracking_history:[{status_date:'2026-10-28T12:00:00Z'}]}));}});
 const modules={'../_shared/stripe-connect.ts':shared,'../_shared/merch-tracking.ts':provider};
 loadTracking('merch-tracking-webhook/index.ts',{Deno:{serve:h=>{webhook=h;}},modules});
 loadTracking('merch-tracking-reconcile/index.ts',{Deno:{serve:h=>{worker=h;}},modules});
 const raw=JSON.stringify({event:'track_updated',data:{carrier:'usps',tracking_number:'ABC12345',test:true}}),now=Math.floor(Date.now()/1000);
 const sig=`t=${now},v1=${createHmac('sha256',env.MERCH_SHIPPO_WEBHOOK_SECRET).update(`${now}.${raw}`).digest('hex')}`;
 assert.equal((await webhook(new Request('https://fixture.test',{method:'POST',body:raw}))).status,400);assert.equal(calls.length,0);
 assert.equal((await webhook(new Request('https://fixture.test',{method:'POST',body:raw,headers:{'shippo-auth-signature':sig}}))).status,200);
 assert.equal(calls[0].name,'receive_merch_tracking_hint');assert.equal(requests.length,0);
 assert.equal((await worker(new Request('https://fixture.test',{method:'POST'}))).status,401);
 assert.equal((await worker(new Request('https://fixture.test',{method:'POST',headers:{authorization:'Bearer fixture-worker'}}))).status,200);
 assert.deepEqual(requests.map(r=>r.options.method),['GET']);
 assert.equal(calls.at(-1).args.p_facts.status,'DELIVERED');assert.equal(calls.at(-1).name,'complete_merch_tracking_job');
 for(const state of ['pending','attempted','unknown','registered','failed']) {
  job.registration_state=state;requests.length=0;
  await worker(new Request('https://fixture.test',{method:'POST',headers:{authorization:'Bearer fixture-worker'}}));
  assert.deepEqual(requests.map(r=>r.options.method),['GET'],`${state} never registers tracking`);
  assert.equal(calls.at(-1).args.p_registered,false,'GET never fabricates registration evidence');
  assert.equal(requests[0].options.body,undefined);
 }
});
test('tracking worker aggregate deadline stops admissions and stale acknowledgements are incomplete',async()=>{
 for(const stale of [false,true]){
  let handler,now=0;const calls=[],requests=[];
  const env={MERCH_TRACKING_WORKER_SECRET:'fixture-worker',MERCH_SHIPPO_TEST_TOKEN:'shippo_test_fixture'};
  const jobs=Array.from({length:5},(_,i)=>({id:'assignment'+i,order_id:'order'+i,lease:'lease'+i,carrier:'usps',tracking_number:'ABC12345'+i,provider_account:'managed_fixture',registration_state:'unknown',environment:'sandbox'}));
  const shared={readOptionalEnv:k=>env[k],jsonResponse:(s,b)=>new Response(JSON.stringify(b),{status:s}),createAdminClient:()=>({configured:true,client:{rpc:async(name,args)=>{
   calls.push({name,args});return {data:name==='claim_merch_tracking_jobs'?jobs:{stale},error:null};
  }}})};
  const provider={...tracking,readExistingShippoTracking:async(job)=>{requests.push(job.id);now+=30000;return '{}';},normalizeTracking:async()=>({status:'UNKNOWN',test:true})};
  loadTracking('merch-tracking-reconcile/index.ts',{clock:{now:()=>now},Deno:{serve:h=>handler=h},modules:{'../_shared/stripe-connect.ts':shared,'../_shared/merch-tracking.ts':provider}});
  const response=await handler(new Request('https://fixture.test',{method:'POST',headers:{authorization:'Bearer fixture-worker'}}));
  const body=await response.json();assert.equal(response.status,503);assert.equal(body.claimed,5);assert.equal(body.completed,stale?0:2);
  assert.equal(requests.length,2);assert.equal(calls.filter(c=>c.name==='complete_merch_tracking_job').length,2);
  assert.equal(body.financialAuthority,false);
 }
});

test('consume-only handler preserves unknown delivery on missing, failed, malformed, oversized or stalled GET',async()=>{
 for(const outcome of ['missing','rate_limited','malformed','oversized','timeout']) {
  let worker;const requests=[],completions=[];
  const env={MERCH_TRACKING_WORKER_SECRET:'fixture-worker',MERCH_SHIPPO_TEST_TOKEN:'shippo_test_fixture'};
  const job={id:'assignment',carrier:'usps',tracking_number:'ABC12345',provider_account:'managed_fixture',lease:'lease',registration_state:'pending',environment:'sandbox'};
  const provider=loadTracking('_shared/merch-tracking.ts',{timer:(fn,ms)=>setTimeout(fn,Math.min(ms,5)),fetch:async(url,options)=>{
   requests.push({url,options});
   if(outcome==='timeout')return new Promise(()=>{});
   if(outcome==='missing'||outcome==='rate_limited')return new Response('',{status:outcome==='missing'?404:429});
   return new Response(outcome==='oversized'?'x'.repeat(256001):'not-json');
  }});
  const shared={readOptionalEnv:k=>env[k],jsonResponse:(s,b)=>new Response(JSON.stringify(b),{status:s}),createAdminClient:()=>({configured:true,client:{rpc:async(name,args)=>{
   if(name==='claim_merch_tracking_jobs')return {data:[job],error:null};
   completions.push(args);return {data:{},error:null};
  }}})};
  loadTracking('merch-tracking-reconcile/index.ts',{Deno:{serve:h=>worker=h},modules:{'../_shared/stripe-connect.ts':shared,'../_shared/merch-tracking.ts':provider}});
  await worker(new Request('https://fixture.test',{method:'POST',headers:{authorization:'Bearer fixture-worker'}}));
  assert.deepEqual(requests.map(r=>r.options.method),['GET'],outcome);
  assert.equal(completions.length,1);assert.equal(completions[0].p_registered,false);
  assert.equal(completions[0].p_facts.status,'UNKNOWN');assert.equal(completions[0].p_facts.review_reason,'carrier_unavailable');
  assert.equal(completions[0].p_facts.status_date,undefined,'failure cannot invent delivery or purchase fallback');
  if(outcome==='timeout')assert.equal(requests[0].options.signal.aborted,true);
 }
});
