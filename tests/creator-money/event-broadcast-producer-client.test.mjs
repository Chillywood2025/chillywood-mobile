import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const event={id:'ea000000-0000-4000-8000-000000000001',hostUserId:'ea000000-0000-4000-8000-000000000002'};
const reply={creatorEventId:event.id,state:'active',reason:'verified_event_broadcast_ready',canStart:true,
  rawHlsUrlReturned:false,fullRoomTokenForSpectators:false};
function load(options={}) {
  let authority={userId:event.hostUserId,sessionGeneration:'original'};const calls=[];
  const imports={
    'react-native':{Platform:{OS:'ios'}},
    './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,
      sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&a.userId===b.userId&&a.sessionGeneration===b.sessionGeneration},
    './accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async()=>{
      const subject={authority,accessToken:'synthetic-original-token'};if(options.switchCapture)authority={...authority,sessionGeneration:'new'};return subject;
    }},
    './supabase':{SUPABASE_URL:'https://local.example/',SUPABASE_ANON_KEY:'synthetic-anon'},
  };
  const context={exports:{},AbortController,setTimeout,clearTimeout,require:name=>{assert.ok(name in imports,name);return imports[name];},
    fetch:async(...args)=>{calls.push(args);if(options.switchFetch)authority={...authority,sessionGeneration:'new'};
      if(options.error)throw Error('synthetic network failure');return {ok:options.ok??true,json:async()=>({...reply,...options.reply})};}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/creatorEventBroadcastProducer.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {api:context.exports,calls};
}
test('creator producer request contains exact event/action and frozen account token only',async()=>{
  const h=load();const result=await h.api.controlCreatorEventBroadcast(event,'start');assert.equal(result.canStart,true);
  const [url,request]=h.calls[0];assert.equal(url,'https://local.example/functions/v1/creator-event-broadcast');
  assert.equal(request.headers.Authorization,'Bearer synthetic-original-token');assert.equal(request.headers['x-chillywood-platform'],'ios');
  assert.deepEqual(JSON.parse(request.body),{action:'start',creatorEventId:event.id});assert.doesNotMatch(request.body,/hostId|sourceUrl|approval|egress/);
});
test('old account results and malformed readiness replies cannot become creator-ready state',async()=>{
  const capture=load({switchCapture:true});assert.equal((await capture.api.controlCreatorEventBroadcast(event,'start')).canStart,false);assert.equal(capture.calls.length,0);
  for(const options of [{switchFetch:true},{error:true},{ok:false},{reply:{creatorEventId:event.hostUserId}},
    {reply:{canStart:false}},{reply:{state:'starting'}},{reply:{rawHlsUrlReturned:true}},{reply:{fullRoomTokenForSpectators:true}}]){
    assert.equal((await load(options).api.controlCreatorEventBroadcast(event,'refresh')).canStart,false);
  }
  const other=load();assert.equal((await other.api.controlCreatorEventBroadcast({...event,hostUserId:event.id},'stop')).canStart,false);assert.equal(other.calls.length,0);
});
test('denied restart preserves replay promises and original terms without claiming cleanup or a refund',async()=>{
  const reasons=[
    ['event_broadcast_replay_recovery_required',/purchased replay.*platform support.*preserving that replay/],
    ['event_broadcast_original_terms_required',/window or event terms have changed or expired.*purchase history are preserved/],
    ['event_broadcast_terminal_receipt_required',/has not confirmed.*Refresh readiness.*until shutdown is confirmed/],
  ];
  for(const [reason,expected] of reasons){
    const h=load({reply:{state:'unavailable',reason,canStart:false}});
    const result=await h.api.controlCreatorEventBroadcast(event,'start');
    assert.equal(result.canStart,false);assert.equal(result.reason,reason);
    const copy=h.api.creatorEventBroadcastStatusCopy(result);
    assert.match(copy,expected);assert.doesNotMatch(copy,/refund|verified and ready|has stopped/);
    assert.equal(h.calls.length,1);
  }
});
test('qualified self-start messaging distinguishes creator qualification from platform worker readiness',()=>{
  const h=load();
  for(const reason of ['event_broadcast_approval_required','event_broadcast_qualification_required']) {
    const copy=h.api.creatorEventBroadcastStatusCopy({state:'unavailable',reason,canStart:false});
    assert.match(copy,/qualification must be current.*readiness checks pass.*without a separate approval for each show/);
    assert.doesNotMatch(copy,/verified and ready|has stopped|refund/);
  }
  assert.match(h.api.creatorEventBroadcastStatusCopy({state:'unavailable',reason:'event_broadcast_worker_not_ready',canStart:false}),/Platform broadcast setup is not ready.*refresh readiness/);
});
