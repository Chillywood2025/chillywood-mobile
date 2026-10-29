import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import {createRoot} from 'react-dom/client';
import ts from 'typescript';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
const textOf=n=>Array.isArray(n)?n.map(textOf).join(' '):n==null||typeof n==='boolean'?'':typeof n==='object'?textOf(n.props?.children):String(n);
const event={id:'33333333-3333-4333-8333-333333333333',hostUserId:'11111111-1111-4111-8111-111111111111',status:'scheduled'};
const prepared={creatorEventId:event.id,hostUserId:event.hostUserId,roomId:`EVENT${'A'.repeat(32)}`,broadcastSessionId:'44444444-4444-4444-8444-444444444444',state:'awaiting_operator_setup',canStart:false};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function mount(t,options={}){
  const nodes=new Map(),calls=[],listeners=new Set();let authority={userId:event.hostUserId,sessionGeneration:'one'};
  const host=name=>function Native(props){const id=React.useId();nodes.set(id,{type:name,props});React.useEffect(()=>()=>nodes.delete(id),[id]);return React.createElement(React.Fragment,null,...React.Children.toArray(props.children).filter(c=>typeof c==='object'));};
  const native={StyleSheet:{create:x=>x}};for(const n of ['View','Text','Pressable','ActivityIndicator'])native[n]=host(n);
  const imports={react:React,'react-native':native,'expo-router':{useRouter:()=>({push:value=>calls.push(['navigate',value])})},
    '../../_lib/accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&a.userId===b.userId&&a.sessionGeneration===b.sessionGeneration,
      subscribeToAccountSessionAuthority:cb=>{listeners.add(cb);return()=>listeners.delete(cb);}},
    '../../_lib/creatorEventBroadcast':{CreatorEventBroadcastPreparationError:Error,prepareCreatorEventBroadcast:async e=>{calls.push(['prepare',e]);return options.prepare?options.prepare(e):prepared;}},
    '../../_lib/creatorEventBroadcastProducer':{controlCreatorEventBroadcast:async(e,action)=>{calls.push(['control',e,action]);return {state:'active'};},creatorEventBroadcastStatusCopy:()=> 'Verified broadcast ready'},
  };
  const context={exports:{},require:name=>{assert.ok(name in imports,name);return imports[name];}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/monetization/event-broadcast-preparation.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);
  const root=createRoot(container());const render=async value=>React.act(async()=>root.render(React.createElement(context.exports.EventBroadcastPreparation,{event:value})));
  await render(event);t.after(()=>React.act(async()=>root.unmount()));
  const find=label=>[...nodes.values()].find(n=>n.props.accessibilityLabel===label);
  return {calls,find,render,text:()=>[...nodes.values()].filter(n=>n.type==='Text').map(textOf).join(' '),
    press:async label=>{const node=find(label);assert.ok(node,label);await React.act(async()=>{void node.props.onPress();});},
    switch:async(notify=true)=>React.act(async()=>{authority={userId:'other',sessionGeneration:'two'};if(notify)listeners.forEach(cb=>cb(authority));}),
    resolve:async fn=>React.act(async fnAct=>fn())};
}
test('creator prepares exact source room, enters host route and invokes normal producer',async t=>{
  const h=await mount(t);assert.match(h.text(),/Qualified creators can start their own shows.*readiness checks pass.*separate approval for each show is not required/);
  await h.press('Prepare event host room');assert.match(h.text(),/Protected playback and broadcast setup/);
  await h.press('Enter event host room');assert.equal(h.calls[1][1].params.partyId,prepared.roomId);
  await h.press('Start event broadcast');assert.equal(h.calls[2][2],'start');assert.match(h.text(),/Verified broadcast ready/);
  await h.press('Refresh broadcast readiness');assert.equal(h.calls[3][2],'refresh');
  await h.press('Stop event broadcast');assert.equal(h.calls[4][2],'stop');
});
test('same-frame duplicate preparation is coalesced and retired account cannot receive old host room',async t=>{
  const pending=deferred();const h=await mount(t,{prepare:()=>pending.promise});const press=h.find('Prepare event host room').props.onPress;
  await React.act(async()=>{press();press();});assert.equal(h.calls.length,1);
  await h.switch();await h.resolve(()=>pending.resolve(prepared));assert.equal(h.find('Enter event host room'),undefined);
});
test('navigation action rechecks current authority even without subscription notification',async t=>{
  const h=await mount(t);await h.press('Prepare event host room');await h.switch(false);await h.press('Enter event host room');
  assert.equal(h.calls.some(c=>c[0]==='navigate'),false);
});
test('old event asynchronous completion cannot update the newly selected event',async t=>{
  const pending=deferred();const h=await mount(t,{prepare:()=>pending.promise});await h.press('Prepare event host room');
  await h.render({...event,id:'55555555-5555-4555-8555-555555555555'});await h.resolve(()=>pending.resolve(prepared));
  assert.equal(h.find('Enter event host room'),undefined);
});
test('retired preparation handler cannot target a previously selected event',async t=>{
  const h=await mount(t);const prepareOldEvent=h.find('Prepare event host room').props.onPress;
  await h.render({...event,id:'55555555-5555-4555-8555-555555555555'});
  await React.act(async()=>{prepareOldEvent();});
  assert.equal(h.calls.length,0);
});
test('retired host navigation cannot reopen a closed event',async t=>{
  const h=await mount(t);await h.press('Prepare event host room');
  const enter=h.find('Enter event host room').props.onPress;
  await h.render({...event,status:'ended'});await React.act(async()=>{enter();});
  assert.equal(h.calls.some(c=>c[0]==='navigate'),false);
});
