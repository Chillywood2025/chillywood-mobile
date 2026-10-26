import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
const load=(file,imports={})=>{const context={exports:{},URL,Date,TextEncoder,TextDecoder,AbortSignal,Response,Promise,crypto:webcrypto,fetch:()=>{throw Error('Unexpected actual fetch');},require:name=>{assert.ok(name in imports,`import ${name}`);return imports[name];}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;};
const core=load('supabase/functions/_shared/creator-event-broadcast-producer.ts');
const id=n=>`ed000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={userId:id(1),sessionId:id(2)},event=id(3),broadcast=id(4),attempt=id(5),room=`EVENT${'A'.repeat(32)}`;
const source={allowed:true,eventId:event,hostId:actor.userId,roomId:room,broadcastId:broadcast,state:'prepared',attemptId:null,egressId:null,
  outputPrefix:null,stopAt:null,creatorSessionId:actor.sessionId,serverId:id(6),assignmentId:id(7),privateOrigin:'https://private-bucket.example.test'};
const claimed={...source,claimed:true,attemptId:attempt,outputPrefix:`creator-events/${broadcast}/${attempt}`,stopAt:'2099-01-01T00:00:00Z'};
const info={egressId:'EG_test',roomId:room,outputPrefix:claimed.outputPrefix,status:'active'};
function fixture(options={}){
  let durable={...source},starts=0,reads=0;const receipts=[],stops=[];
  const deps={
    read:async()=>{reads++;return options.read?options.read(reads,durable):{...durable,claimed:false};},
    claim:async()=>{durable={...claimed};return {...durable};},
    receipt:async(s,r)=>{receipts.push(r);durable={...s,claimed:false,state:r.status,egressId:r.egressId};},
    hostPresent:async()=>options.host!==false,costAllowed:async()=>options.cost!==false,
    list:async()=>options.list?options.list(starts):starts&&options.persist!==false?[info]:[],
    start:async()=>{starts++;if(options.timeout)throw Error('timeout after provider accepted');return options.info??info;},
    stop:async(s,id)=>{stops.push(id);return {...info,status:'complete'};},
    verifyPrivateOrigin:async()=>options.private===false?null:{sourceUrl:`${source.privateOrigin}/${claimed.outputPrefix}/live.m3u8`,playlistPath:`${claimed.outputPrefix}/live.m3u8`},
  };
  return {deps,receipts,stops,starts:()=>starts,set:value=>{durable={...value};},run:action=>core.runCreatorEventBroadcast(action,event,actor,deps)};
}
test('normal event producer requires exact current host tracks, cost authority, provider receipt and private origin',async()=>{
  const h=fixture();const result=await h.run('start');assert.equal(result.state,'active');assert.equal(h.starts(),1);assert.equal(h.receipts[0].privateOriginVerified,true);
  assert.doesNotMatch(JSON.stringify(result),/sourceUrl|example.test|egressId|outputPrefix/);
  for(const options of [{host:false},{cost:false},{read:()=>({...source,allowed:false,reason:'approval_required'})},{read:()=>({...source,hostId:id(9)})}]){
    const denied=fixture(options);assert.equal((await denied.run('start')).canStart,false);assert.equal(denied.starts(),0);assert.equal(denied.receipts.length,0);
  }
  const publicOrigin=fixture({private:false});assert.equal((await publicOrigin.run('start')).state,'starting');assert.equal(publicOrigin.receipts.some(r=>r.status==='active'),false);
  const wrong=fixture({info:{...info,roomId:'D7D_TEST_FAKE'}});assert.equal((await wrong.run('start')).state,'uncertain');assert.equal(wrong.receipts.some(r=>r.status==='active'),false);
});
test('lost provider start reply never dispatches a second start; exact receipt recovers and absent receipt stays uncertain',async()=>{
  const accepted=fixture({timeout:true});assert.equal((await accepted.run('start')).state,'uncertain');assert.equal(accepted.starts(),1);
  assert.equal((await accepted.run('start')).state,'active');assert.equal(accepted.starts(),1);
  const absent=fixture({timeout:true,persist:false});await absent.run('start');assert.equal((await absent.run('start')).state,'uncertain');assert.equal(absent.starts(),1);
  const different=fixture({timeout:true,list:starts=>starts?[{...info,outputPrefix:'creator-events/unrelated/other'}]:[]});await different.run('start');
  assert.equal((await different.run('start')).state,'uncertain');assert.equal(different.starts(),1);
});
test('authority loss during provider IO stops exact attempt and never publishes playback',async()=>{
  const h=fixture({read:(count,durable)=>count===1?durable:{...durable,allowed:false}});
  assert.equal((await h.run('start')).state,'stopped');assert.deepEqual(h.stops,['EG_test']);assert.equal(h.receipts.some(r=>r.status==='active'),false);
  const terminal=fixture();terminal.set({...claimed,claimed:false,egressId:'EG_test',stopAt:'2000-01-01T00:00:00Z'});
  assert.equal((await terminal.run('refresh')).state,'stopped');assert.equal(terminal.starts(),0);
});
test('stop confirmation requires actual terminal receipt, not an empty provider list',async()=>{
  const h=fixture({list:()=>[]});h.set({...claimed,claimed:false});assert.equal((await h.run('stop')).state,'uncertain');assert.equal(h.stops.length,0);
  h.set({...claimed,claimed:false,egressId:'EG_test'});assert.equal((await h.run('stop')).state,'stopped');assert.deepEqual(h.stops,['EG_test']);
});

const rawInfo=(changes={})=>({egress_id:'EG_test',room_name:room,status:'EGRESS_ACTIVE',egress:{room_name:room,template:{layout:'grid'},
  outputs:[{segments:{filename_prefix:`${claimed.outputPrefix}/segment`,live_playlist_name:`${claimed.outputPrefix}/live.m3u8`}}]},...changes});
function transport(options={}){
  const calls=[];const env={EGRESS_OUTPUT_ENDPOINT:'https://example.test',EGRESS_OUTPUT_BUCKET:'private-bucket',EGRESS_OUTPUT_REGION:'test-region',EGRESS_OUTPUT_ACCESS_KEY_ID:'synthetic-key',EGRESS_OUTPUT_SECRET_ACCESS_KEY:'synthetic-secret',LIVEKIT_API_KEY:'synthetic-live-key',LIVEKIT_API_SECRET:'synthetic-live-secret'};
  class AccessToken{addGrant(g){calls.push(['grant',g]);}async toJwt(){return 'synthetic-token';}}
  class RoomServiceClient{async getParticipant(){return {identity:actor.userId,metadata:JSON.stringify({participantRole:'host'}),permission:{canPublish:true},tracks:[{type:1,muted:false}],...options.participant};}}
  const api=load('supabase/functions/_shared/creator-event-broadcast-transport.ts',{
    'npm:livekit-server-sdk@2':{AccessToken,RoomServiceClient},
    './livekit-session-generation.ts':{readLiveKitParticipantSessionGeneration:()=>options.generation??actor.sessionId},
    './content-inspection-private-origin.ts':{createInspectionOriginReader:()=>async binding=>{calls.push(['signed',binding.objectKey]);return binding.objectKey.endsWith('.m3u8')
      ?new Response(options.playlist??'#EXTM3U\n#EXTINF:2,\nsegment_00001.ts\n',{status:options.signedStatus??200}):new Response('segment');}},
  });
  const admin={from:table=>{const result={data:table==='livekit_servers'?{public_ws_url:'wss://assigned.example.test',internal_api_url:null}
    :{assigned_server_id:source.serverId,app_room_id:room,livekit_room_name:room},error:null};const q={select:()=>q,eq:()=>q,maybeSingle:async()=>result};return q;}};
  const request=async(url,init)=>{calls.push(['request',url,init]);if(String(url).includes('/twirp/'))return new Response(JSON.stringify(options.providerReply??rawInfo()));return new Response(null,{status:options.anonymousStatus??403});};
  return {api,runtime:api.createEventBroadcastTransport(admin,key=>env[key],request),calls};
}
test('normal transport matches current StartEgress protocol and rejects D7D or mismatched output receipts',async()=>{
  const h=transport();assert.equal(h.api.parseEventEgressInfo(rawInfo()).outputPrefix,claimed.outputPrefix);
  assert.equal(h.api.parseEventEgressInfo(rawInfo({egress:undefined,room_composite:{room_name:room}})),null);
  assert.equal(h.api.parseEventEgressInfo(rawInfo({status:undefined})).status,'starting','ProtoJSON omits default enum0');
  assert.equal(h.api.parseEventEgressInfo(rawInfo({room_name:'D7D_TEST_FAKE'})),null);
  await h.runtime.start(claimed);const call=h.calls.find(c=>c[0]==='request');assert.equal(call[1],'https://assigned.example.test/twirp/livekit.Egress/StartEgress');
  const body=JSON.parse(call[2].body);assert.equal(body.room_name,room);assert.equal(body.storage.s3.bucket,'private-bucket');assert.equal(body.outputs[0].segments.live_playlist_name,`${claimed.outputPrefix}/live.m3u8`);
  await assert.rejects(h.runtime.start({...claimed,privateOrigin:'https://public.example.test'}),/origin_approval/);
});
test('provider list accepts ProtoJSON omitted empty fields but rejects malformed successful responses',async()=>{
  assert.equal((await transport({providerReply:{}}).runtime.list(claimed)).length,0);
  assert.equal((await transport({providerReply:{items:[],next_page_token:{}}}).runtime.list(claimed)).length,0);
  for(const providerReply of [{items:'wrong'},{error:'synthetic provider error'},[]]){
    await assert.rejects(transport({providerReply}).runtime.list(claimed),/provider_list_invalid/);
  }
});
test('private-origin verification requires anonymous403 plus successful signed playlist and segment; public404 never qualifies',async()=>{
  const h=transport();const result=await h.runtime.verifyPrivateOrigin(claimed);assert.equal(result.playlistPath,`${claimed.outputPrefix}/live.m3u8`);
  assert.equal(h.calls.filter(c=>c[0]==='signed').length,2);
  await assert.rejects(transport({anonymousStatus:200}).runtime.verifyPrivateOrigin(claimed),/origin_public/);
  for(const options of [{anonymousStatus:404},{signedStatus:403},{playlist:'#EXTM3U\nhttps://external.example/segment.ts'},{playlist:'#EXTM3U\n../segment.ts'},{playlist:'#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="secret"\nsegment.ts'}]){
    assert.equal(await transport(options).runtime.verifyPrivateOrigin(claimed),null);
  }
  assert.equal(await transport({generation:id(9)}).runtime.hostPresent(claimed,actor.sessionId),false);
  assert.equal(await transport({participant:{tracks:[{type:1,muted:true}]}}).runtime.hostPresent(claimed,actor.sessionId),false);
});
test('public origin after actual ACTIVE receipt stops the known provider attempt and cannot publish replay',async()=>{
  const h=fixture();h.deps.verifyPrivateOrigin=async()=>{throw Error('event_broadcast_origin_public');};
  assert.equal((await h.run('start')).state,'stopped');assert.deepEqual(h.stops,['EG_test']);assert.equal(h.receipts.some(r=>r.privateOriginVerified),false);
});
test('completed replay requires final private index manifest; a live playlist never proves replay ready',async()=>{
  assert.equal(await transport().runtime.verifyPrivateOrigin(claimed,true),null);
  const h=transport({playlist:'#EXTM3U\n#EXTINF:2,\nsegment_00001.ts\n#EXT-X-ENDLIST'});
  const replay=await h.runtime.verifyPrivateOrigin(claimed,true);assert.equal(replay.playlistPath,`${claimed.outputPrefix}/index.m3u8`);
});
test('refresh observing natural COMPLETE performs final replay proof before the terminal receipt',async()=>{
  const h=fixture({list:()=>[{...info,status:'complete'}]});h.set({...claimed,claimed:false,egressId:info.egressId});
  const proofs=[];h.deps.verifyPrivateOrigin=async(s,replay)=>{proofs.push(replay);return {sourceUrl:`${source.privateOrigin}/${claimed.outputPrefix}/index.m3u8`,playlistPath:`${claimed.outputPrefix}/index.m3u8`};};
  assert.equal((await h.run('refresh')).state,'stopped');assert.deepEqual(proofs,[true]);
  assert.equal(h.receipts.at(-1).privateOriginVerified,true);assert.equal(h.stops.length,0);assert.equal(h.starts(),0);
});
test('persisted terminal receipt remains truthful after camera disconnect without another provider call',async()=>{
  for(const state of ['stopped','failed']){
    const h=fixture({host:false,cost:false,list:()=>{throw Error('must not query terminal job');}});
    h.set({...claimed,claimed:false,egressId:info.egressId,state});
    assert.equal((await h.run('refresh')).state,state);assert.equal(h.receipts.length,0);assert.equal(h.starts(),0);
  }
});
