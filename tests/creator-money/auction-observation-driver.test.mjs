import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
function endpoint({claimed=true,configured=true,costFailed=false,historyPending=false,domainFailed=false,count=2}={}){
 let handler;const calls=[],jobs=Array.from({length:count},(_,i)=>({contract_id:randomUUID(),lease:randomUUID(),lane:i%2?'room':'event'}));
 const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service_synthetic'};
 const runtime={exports:{},setTimeout,clearTimeout,AbortSignal,TextDecoder,fetch:async(url,opts)=>{
  calls.push({url,opts});assert.equal(url,'https://synthetic.supabase.co/functions/v1/stripe-auction-cost-reconcile');
  assert.equal(opts.method,'POST');assert.equal(opts.redirect,'error');assert.ok(opts.signal);assert.equal(opts.headers.Authorization,'Bearer service_synthetic');
  assert.deepEqual(Object.keys(JSON.parse(opts.body)),['contract_id']);
  return new Response(JSON.stringify(costFailed?{error:'incomplete',financialAuthority:false}:{financialAuthority:false,transferCreated:false,status:historyPending?'history_pending':'held',netMinor:null,holdReasons:['tax_unverified']}));
 },Deno:{serve:f=>handler=f},require:name=>{
  if(name.startsWith('jsr:'))return{};
  if(name.endsWith('stripe-connect.ts'))return{readOptionalEnv:k=>env[k],createAdminClient:()=>({configured,client:{rpc:async(name,args)=>{
   calls.push({name,args});if(name==='claim_auction_observation_batch')return{data:{claimed,jobs:claimed?jobs:[]}};
   if(name.startsWith('qualify_auction_'))return domainFailed?{error:{message:'missing'}}:{data:{status:'held',reason:'objective_fulfillment_unproved'}};
   assert.equal(name,historyPending?'continue_auction_cost_history_refresh':'complete_auction_observation');return{data:{stale:false}};
  }}}),jsonResponse:(status,body)=>new Response(JSON.stringify(body),{status})};throw Error(name);
 }};
 vm.runInNewContext(ts.transpileModule(readFileSync('supabase/functions/auction-observation-driver/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,runtime);
 return {calls,jobs,send:(token='service_synthetic',body='{}')=>handler(new Request('https://synthetic.test',{method:'POST',headers:{Authorization:'Bearer '+token},body}))};
}
test('actual observer default-off, missing configuration, caller IDs and user authority do no network work',async()=>{
 for(const opts of [{claimed:false},{configured:false},{count:4}]){const h=endpoint(opts);await h.send();assert.equal(h.calls.filter(c=>c.url).length,0);}
 const h=endpoint();assert.equal((await h.send('user')).status,403);assert.equal((await h.send('service_synthetic','{"contract_id":"caller"}')).status,400);assert.equal((await h.send('service_synthetic',' '.repeat(100))).status,503);assert.deepEqual(h.calls,[]);
});
test('actual observer calls only GET-backed cost endpoint, lane qualifier and lease completion; never reserves or dispatches',async()=>{
 const h=endpoint();const result=await(await h.send()).json();assert.equal(result.completed,2);assert.equal(result.financialAuthority,false);assert.equal(result.transferCreated,false);
 assert.equal(h.calls.filter(c=>c.url).length,2);
 assert.deepEqual(h.calls.filter(c=>c.name?.startsWith('qualify')).map(c=>c.name).sort(),['qualify_auction_event_release_from_domain','qualify_auction_room_release_from_domain']);
 for(const job of h.jobs){const done=h.calls.find(c=>c.name==='complete_auction_observation'&&c.args.p_contract_id===job.contract_id);assert.equal(done.args.p_lease,job.lease);assert.equal(done.args.p_complete,true);assert.equal(done.args.p_domain_status,'held');}
 assert.equal(h.calls.some(c=>/reserve|dispatch|transfer|renew/.test(c.name??c.url)),false);
});
test('provider and domain failures persist unknown retry state, never qualify on failed cost read',async()=>{
 for(const opts of [{costFailed:true},{domainFailed:true}]){
  const h=endpoint(opts);assert.equal((await(await h.send()).json()).completed,0);
  if(opts.costFailed)assert.equal(h.calls.filter(c=>c.name?.startsWith('qualify')).length,0);
  for(const done of h.calls.filter(c=>c.name==='complete_auction_observation')){assert.equal(done.args.p_complete,false);assert.equal(done.args.p_domain_status,'unknown');}
 }
});

test('partial cost history continues fairly without domain qualification or false success',async()=>{
 const h=endpoint({historyPending:true});const result=await(await h.send()).json();
 assert.equal(result.completed,0);assert.equal(result.financialAuthority,false);
 assert.equal(h.calls.some(c=>c.name?.startsWith('qualify')),false);
 assert.equal(h.calls.filter(c=>c.name==='continue_auction_cost_history_refresh').length,2);
 assert.equal(h.calls.some(c=>c.name==='complete_auction_observation'),false);
});
