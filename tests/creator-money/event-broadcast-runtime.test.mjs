import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';

function load(file,imports={},extra={}) {
  const context={exports:{},URL,Request,Response,TextEncoder,Uint8Array,crypto:webcrypto,Promise,Date,
    require:name=>{assert.ok(name in imports,`Unexpected import ${name}`);return imports[name];},...extra};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return context.exports;
}
const core=load('supabase/functions/_shared/creator-event-broadcast-producer.ts');
const id=n=>`ee000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const source={allowed:true,eventId:id(1),hostId:id(2),roomId:`EVENT${'A'.repeat(32)}`,broadcastId:id(3),attemptId:id(4),
  creatorSessionId:id(5),egressId:'EG_runtime',outputPrefix:`creator-events/${id(3)}/${id(4)}`,state:'active',stopAt:'2099-01-01T00:00:00Z'};
function runtime(options={}) {
  const calls=[];
  const admin={rpc:async(name,args)=>{calls.push([name,args]);return options.rpc?.(name,args)??{data:{state:'active'},error:null};},
    from:table=>{
      const result=table==='admin_live_cost_guard_settings'?{data:{id:'settings'},error:null}:{data:[],error:options.costError?{message:'synthetic outage'}:null};
      const q={then:(resolve,reject)=>Promise.resolve(result).then(resolve,reject)};
      for(const method of ['select','order','limit','maybeSingle','gte','eq'])q[method]=()=>q;
      return q;
    }};
  const api=load('supabase/functions/_shared/creator-event-broadcast-runtime.ts',{
    './creator-event-broadcast-producer.ts':core,
    './creator-event-broadcast-transport.ts':{createEventBroadcastTransport:()=>({configured:value=>calls.push(['configured',value])})},
    './live-cost-guard.ts':{readLiveCostGuardTokenDecision:async db=>{
      await db.from('admin_live_cost_guard_events').select('id').gte('created_at','synthetic');return {blockNewLiveRooms:false};
    }},
  });
  return {api,admin,calls,deps:api.createEventBroadcastRuntime(admin,()=>undefined)};
}
test('producer runtime pins original session and requires database activation acknowledgement',async()=>{
  const h=runtime();await h.deps.read(source.eventId,source.hostId,source.creatorSessionId,'refresh');
  await h.deps.claim(source,source.hostId,source.creatorSessionId);
  assert.equal(h.calls[1][0],'configured');assert.equal(h.calls[2][0],'claim_creator_event_broadcast_start');
  await h.deps.receipt(source,{status:'active',egressId:source.egressId,privateOriginVerified:true,sourceUrl:'https://private.example/index.m3u8',playlistPath:'index.m3u8'});
  const saved=h.calls.at(-1);assert.equal(saved[1].p_session_id,source.creatorSessionId);assert.equal(saved[1].p_provider_status,'ACTIVE');
  assert.equal(saved[1].p_provider_binding_verified,true);
  const denied=runtime({rpc:()=>({data:{state:'stopping'},error:null})});
  await assert.rejects(denied.deps.receipt(source,{status:'active',egressId:source.egressId}),/activation_not_confirmed/);
  await h.deps.receipt(source,{status:'stopped',egressId:source.egressId});assert.equal(h.calls.at(-1)[1].p_provider_status,'COMPLETE');
  await h.deps.receipt(source,{status:'uncertain',egressId:source.egressId});assert.equal(h.calls.at(-1)[1].p_provider_binding_verified,false);
});
test('cost transport failures cannot become empty/default allow decisions',async()=>{
  assert.equal(await runtime().deps.costAllowed(),true);
  await assert.rejects(runtime({costError:true}).deps.costAllowed(),/cost_guard_unavailable/);
});
test('deadline worker renews its lease only after confirmed terminal cleanup or a successful empty scan',async()=>{
  const h=runtime({rpc:name=>({data:name==='claim_due_creator_event_broadcast_stops'?[source]:{},error:null})});
  const receipts=[];
  const deps={...h.deps,list:async()=>[{egressId:source.egressId,roomId:source.roomId,outputPrefix:source.outputPrefix,status:'active'}],
    stop:async()=>({egressId:source.egressId,roomId:source.roomId,outputPrefix:source.outputPrefix,status:'complete'}),
    verifyPrivateOrigin:async()=>null,receipt:async(s,r)=>receipts.push(r)};
  assert.equal((await h.api.runEventBroadcastDeadlineWorker(h.admin,deps)).healthy,true);
  assert.equal(receipts[0].status,'stopped');assert.equal(h.calls.at(-1)[0],'heartbeat_creator_event_broadcast_worker');
  h.calls.length=0;deps.stop=async()=>{throw Error('lost stop response');};
  assert.equal((await h.api.runEventBroadcastDeadlineWorker(h.admin,deps)).healthy,false);
  assert.equal(h.calls.some(c=>c[0]==='heartbeat_creator_event_broadcast_worker'),false);assert.equal(receipts.at(-1).status,'uncertain');
  const empty=runtime({rpc:name=>({data:name==='claim_due_creator_event_broadcast_stops'?[]:{},error:null})});
  assert.equal((await empty.api.runEventBroadcastDeadlineWorker(empty.admin,deps)).healthy,true);
  assert.equal(empty.calls.at(-1)[0],'heartbeat_creator_event_broadcast_worker');
  const failed=runtime({rpc:()=>({data:null,error:{message:'queue unavailable'}})});
  await assert.rejects(failed.api.runEventBroadcastDeadlineWorker(failed.admin,deps),/queue_unavailable/);
  assert.equal(failed.calls.length,1);
});

function endpoint(options={}) {
  let handler;const calls=[];
  const env={SUPABASE_URL:'https://local.example',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',SUPABASE_ANON_KEY:'synthetic-anon'};
  load('supabase/functions/creator-event-broadcast/index.ts',{
    'jsr:@supabase/functions-js/edge-runtime.d.ts':{},
    'npm:@supabase/supabase-js@2':{createClient:(url,key,settings)=>{calls.push(['client',key,settings]);return {auth:{getUser:async()=>({data:{user:options.noUser?null:{id:source.hostId}},error:null})}};}},
    '../_shared/exact-subject-authority.ts':{readExactCurrentSessionAuthority:async()=>options.stale?null:{userId:source.hostId,sessionGeneration:source.creatorSessionId}},
    '../_shared/creator-event-broadcast-producer.ts':{runCreatorEventBroadcast:async(...args)=>{calls.push(['producer',...args.slice(0,3)]);return {state:'active'};}},
    '../_shared/creator-event-broadcast-runtime.ts':{createEventBroadcastRuntime:()=>({}),runEventBroadcastDeadlineWorker:async()=>{calls.push(['worker']);return {healthy:true};}},
  },{Deno:{env:{get:key=>env[key]},serve:value=>{handler=value;}}});
  return {calls,request:(body,token='synthetic-user')=>handler(new Request('https://local.example/functions/v1/creator-event-broadcast',{
    method:'POST',headers:{'Content-Type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)}))};
}
test('actual Edge handler rejects caller routing/approval fields and nonservice worker dispatch',async()=>{
  const h=endpoint();assert.equal((await h.request({action:'start',creatorEventId:source.eventId,sourceUrl:'https://untrusted.example'})).status,400);
  assert.equal(h.calls.length,0);assert.equal((await h.request({action:'worker'})).status,403);assert.equal(h.calls.some(c=>c[0]==='worker'),false);
  assert.equal((await h.request({action:'worker'},'synthetic-service')).status,200);assert.equal(h.calls.filter(c=>c[0]==='worker').length,1);
});
test('actual Edge handler requires exact current authenticated actor before production dispatch',async()=>{
  for(const options of [{noUser:true},{stale:true}]){
    const h=endpoint(options);assert.equal((await h.request({action:'start',creatorEventId:source.eventId})).status,401);
    assert.equal(h.calls.some(c=>c[0]==='producer'),false);
  }
  const h=endpoint();assert.equal((await h.request({action:'start',creatorEventId:source.eventId})).status,200);
  const call=h.calls.find(c=>c[0]==='producer');assert.equal(call[1],'start');assert.equal(call[2],source.eventId);
  assert.equal(call[3].userId,source.hostId);assert.equal(call[3].sessionId,source.creatorSessionId);
  assert.equal(h.calls.find(c=>c[0]==='client'&&c[1]==='synthetic-anon')[2].global.headers.Authorization,'Bearer synthetic-user');
});
