import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const event={id:'33333333-3333-4333-8333-333333333333',hostUserId:'11111111-1111-4111-8111-111111111111'};
const response={creatorEventId:event.id,hostUserId:event.hostUserId,roomId:`EVENT${'A'.repeat(32)}`,
  broadcastSessionId:'44444444-4444-4444-8444-444444444444',state:'awaiting_operator_setup',canStart:false,
  providerStarted:false,mediaUrlReturned:false,ticketAccessGranted:false};
function load(options={}) {
  let authority={userId:event.hostUserId,sessionGeneration:'one'};
  const calls=[];
  const imports={
    './liveEvents':{parseCreatorEventRow:row=>row,buildCreatorEventSummary:row=>({id:row.id,hostUserId:row.host_user_id})},
    './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,
      sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&a.userId===b.userId&&a.sessionGeneration===b.sessionGeneration},
    './premiumWatchPartyAccess':{requireLiveFirstPremium:async()=>{if(options.switchPremium)authority={...authority,sessionGeneration:'two'};return options.access??{allowed:true};}},
    './accountBoundSupabaseMutation':{runCurrentAccountBoundSupabaseMutationRpc:async(...args)=>{calls.push(args);if(options.switchRpc)authority={...authority,sessionGeneration:'two'};return options.result??{data:response,error:null};}},
  };
  const context={exports:{},require:name=>{assert.ok(name in imports,name);return imports[name];}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/creatorEventBroadcast.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {api:context.exports,calls};
}
test('creator preparation preserves Premium and binds exact event, owner and recoverable nonplayable reply',async()=>{
  const h=load();const result=await h.api.prepareCreatorEventBroadcast(event);
  assert.equal(result.roomId,response.roomId);assert.equal(result.state,'awaiting_operator_setup');assert.equal(result.canStart,false);
  assert.equal(h.calls[0][0],'prepare_creator_event_broadcast');assert.equal(h.calls[0][1].p_creator_event_id,event.id);assert.equal(h.calls[0][2],event.hostUserId);
  for(const options of [{switchPremium:true},{access:{allowed:false}},{access:{allowed:false,featureDisabled:true}}]) {
    const denied=load(options);await assert.rejects(denied.api.prepareCreatorEventBroadcast(event));assert.equal(denied.calls.length,0);
  }
});
test('creator preparation rejects wrong source, owner, forged readiness and stale completion',async()=>{
  for(const change of [{creatorEventId:event.hostUserId},{hostUserId:event.id},{roomId:'D7D_TEST_OTHER'},
    {state:'active'},{state:'broadcast_ready',canStart:false},{canStart:true},{mediaUrlReturned:true},{providerStarted:true},{ticketAccessGranted:true}]) {
    const h=load({result:{data:{...response,...change},error:null}});await assert.rejects(h.api.prepareCreatorEventBroadcast(event));
  }
  await assert.rejects(load({switchRpc:true}).api.prepareCreatorEventBroadcast(event));
  await assert.rejects(load({result:{data:response,error:{message:'unavailable'}}}).api.prepareCreatorEventBroadcast(event));
  assert.equal((await load({result:{data:{...response,state:'broadcast_ready',canStart:true},error:null}}).api.prepareCreatorEventBroadcast(event)).canStart,true);
});
test('host event context is exact-room and current-owner bound, with explicit ordinary-room null',async()=>{
  const room=response.roomId;
  const result={data:{userId:event.hostUserId,roomId:room,creatorEvent:{id:event.id,host_user_id:event.hostUserId}},error:null};
  const h=load({result});assert.equal((await h.api.readCreatorEventForHostRoom(room)).id,event.id);
  assert.equal(h.calls[0][0],'read_creator_event_for_host_room');assert.equal(h.calls[0][1].p_party_id,room);
  for(const changes of [{userId:event.id},{roomId:'OTHER'},{creatorEvent:{id:event.id,host_user_id:event.id}},{creatorEvent:undefined}]){
    await assert.rejects(load({result:{data:{...result.data,...changes},error:null}}).api.readCreatorEventForHostRoom(room));
  }
  await assert.rejects(load({result,switchRpc:true}).api.readCreatorEventForHostRoom(room));
  assert.equal(await load({result:{data:{...result.data,creatorEvent:null},error:null}}).api.readCreatorEventForHostRoom(room),null);
});
