// Production React controls and date/price components; RPC/auth are synthetic boundaries.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import {createRoot} from 'react-dom/client';
import ts from 'typescript';
import {productionFunctions} from './platform-studio-mounted-harness.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
const textOf=n=>Array.isArray(n)?n.map(textOf).join(' '):n==null||typeof n==='boolean'?'':typeof n==='object'?textOf(n.props?.children):String(n);
const owner='11111111-1111-4111-8111-111111111111';
const event={id:'33333333-3333-4333-8333-333333333333',hostUserId:owner,eventTitle:'Sunday show',status:'scheduled',timeZone:'America/New_York',startsAt:'2099-01-04T01:00:00.000Z',endsAt:'2099-01-04T02:00:00.000Z',replayPolicy:'none',replayAvailableAt:null,replayExpiresAt:null,updatedAt:'2026-10-26T17:00:00Z'};
const prices=[{priceKey:'p199',amountMinor:199,currency:'usd',label:'$1.99',availabilityLabel:'iOS and Android',environment:'sandbox'}];
async function mount(t,kind,options={}){
  const nodes=new Map(),calls=[];let authority={userId:owner,sessionGeneration:'a'};
  const host=name=>function Native(props){const id=React.useId();nodes.set(id,{type:name,props});React.useEffect(()=>()=>nodes.delete(id),[id]);return React.createElement(React.Fragment,null,...React.Children.toArray(props.children).filter(c=>typeof c==='object'));};
  const native={StyleSheet:{create:x=>x}};for(const n of ['View','Text','TextInput','Pressable','ActivityIndicator'])native[n]=host(n);
  const cache=new Map();
  const load=file=>{if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
    const mocks={react:React,'react-native':native,'../ui/chillywood-visual-system':{CHILLYWOOD_VISUAL:{glassBackground:'#10151C'}},
      '../../_lib/accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>a?.userId===b?.userId&&a?.sessionGeneration===b?.sessionGeneration},
      '../../_lib/creatorSupportedPrices':{readCreatorAuthoringPrices:async()=>options.catalog??{status:'resolved',subjectUserId:owner,prices}},
      '../../_lib/paidCreatorEvents':{configurePaidCreatorEventSale:async input=>{calls.push(['save',input]);return options.save?options.save(input):{id:'offer',...input};}},
      '../../_lib/liveEvents':productionFunctions('_lib/liveEvents.ts',['readNewCreatorEventReplayTermsError'],{Date,Number}),
      '../../_lib/creatorEventJourney':{manageCreatorEventLifecycle:async(e,action,input)=>{calls.push(['manage',action,input]);return {...e};}},
      '../../_lib/eventSchedule':()=>load('_lib/eventSchedule.ts'),'./creator-price-picker':()=>load('components/monetization/creator-price-picker.tsx'),
      './event-broadcast-preparation':{EventBroadcastPreparation:()=>null}};
    const context={exports,Date,Intl,Promise,require:name=>{assert.ok(name in mocks,`unexpected import ${name}`);return typeof mocks[name]==='function'?mocks[name]():mocks[name];}};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);return exports;};
  const Component=kind==='sale'?load('components/monetization/event-sale-editor.tsx').EventSaleEditor:load('components/monetization/event-lifecycle-controls.tsx').EventLifecycleControls;
  const root=createRoot(container());await React.act(async()=>root.render(React.createElement(Component,{event,offer:null,onSaved:o=>calls.push(['saved',o]),onClose:noop,hasPaidOffer:true,onChanged:o=>calls.push(['changed',o]),...options.props})));
  t.after(()=>React.act(async()=>root.unmount()));
  const find=label=>[...nodes.values()].find(n=>n.props.accessibilityLabel===label||n.props.testID===label);
  return {calls,find,text:()=>[...nodes.values()].filter(n=>n.type==='Text').map(textOf).join(' '),
    press:async label=>{const node=find(label);assert.ok(node,label);assert.notEqual(node.props.disabled,true);await React.act(async()=>{void node.props.onPress();});},
    change:async(label,value)=>{const node=find(label);assert.ok(node,label);await React.act(async()=>node.props.onChangeText(value));},
    changeAccount:()=>{authority={userId:'other',sessionGeneration:'b'};},resolve:async(fn)=>React.act(async()=>fn())};
}

test('event creator chooses a supported price and publishes exact capacity, zoned sale window and inclusions',async t=>{
  const h=await mount(t,'sale');assert.equal(h.find('Publish ticket terms').props.disabled,true,'no99 default');
  await h.press('event-price-picker-p199');
  await h.change('Virtual event ticket capacity','12');
  await h.change('Event ticket sales open date and time','2098-12-20T20:00');
  await h.change('Event ticket sales close date and time','2099-01-03T19:30');
  await h.change('What this event ticket includes','Admission to Sunday show; replay not included.');
  await h.press('Publish ticket terms');
  const input=h.calls.find(c=>c[0]==='save')[1];
  assert.equal(input.priceCents,199);assert.equal(input.capacityLimit,12);assert.equal(input.status,'sandbox');
  assert.equal(input.salesOpenAt,'2098-12-21T01:00:00.000Z');assert.equal(input.salesCloseAt,'2099-01-04T00:30:00.000Z');
  assert.equal(input.timeZone,'America/New_York');assert.match(input.description,/replay not included/);
  assert.equal(input.expectedUpdatedAt,event.updatedAt);assert.equal(input.expectedTerms.startsAt,event.startsAt);
});
test('event ticket editor blocks invalid capacity and inverted windows without writes',async t=>{
  const h=await mount(t,'sale');await h.press('event-price-picker-p199');
  await h.change('Virtual event ticket capacity','1.5');await h.press('Publish ticket terms');
  assert.match(h.text(),/whole number/);assert.equal(h.calls.length,0);
  await h.change('Virtual event ticket capacity','12');
  await h.change('Event ticket sales open date and time','2099-01-03T20:00');
  await h.change('Event ticket sales close date and time','2099-01-03T19:00');await h.press('Publish ticket terms');
  assert.match(h.text(),/close after they open/);assert.equal(h.calls.length,0);
});
test('new ticket publication rejects unknown replay windows without a sale RPC and shows exact supported terms',async t=>{
  for (const replay of [
    {replayPolicy:'indefinite'},
    {replayPolicy:'until_expiration',replayAvailableAt:null,replayExpiresAt:'2099-01-05T02:00:00Z'},
    {replayPolicy:'until_expiration',replayAvailableAt:'2099-01-04T02:00:00Z',replayExpiresAt:'2099-01-04T02:00:00Z'},
  ]) {
    const h=await mount(t,'sale',{props:{event:{...event,...replay}}});await h.press('event-price-picker-p199');
    await h.press('Publish ticket terms');
    assert.equal(h.calls.filter(c=>c[0]==='save').length,0);
    assert.match(h.text(),/explicit availability time|Choose the event end|must be after replay availability/);
  }
  const bounded={...event,replayPolicy:'until_expiration',replayAvailableAt:'2099-01-04T02:00:00Z',replayExpiresAt:'2099-01-05T02:00:00Z'};
  const h=await mount(t,'sale',{props:{event:bounded}});await h.press('event-price-picker-p199');
  assert.match(h.text(),/Available from 2099-01-03T21:00 until 2099-01-04T21:00 \(America\/New_York\)/);
  await h.change('Event ticket sales open date and time','2098-12-20T20:00');
  await h.change('Event ticket sales close date and time','2099-01-03T19:30');await h.press('Publish ticket terms');
  const saved=h.calls.find(c=>c[0]==='save')[1];
  assert.equal(saved.expectedTerms.replayAvailableAt,bounded.replayAvailableAt);
  assert.equal(saved.expectedTerms.replayExpiresAt,bounded.replayExpiresAt);
});
test('event catalog unavailable has recovery and cannot publish',async t=>{
  const h=await mount(t,'sale',{catalog:{status:'unavailable',subjectUserId:owner,prices:[]}});
  assert.equal(h.find('Publish ticket terms').props.disabled,true);assert.ok(h.find('Refresh supported prices'));assert.match(h.text(),/could not be verified/);
});
test('late event save cannot update UI after owning account changes',async t=>{
  let resolve;const pending=new Promise(r=>{resolve=r;});const h=await mount(t,'sale',{save:()=>pending});
  await h.press('event-price-picker-p199');
  await h.change('Event ticket sales open date and time','2098-12-20T20:00');
  await h.change('Event ticket sales close date and time','2099-01-03T19:30');
  await h.press('Publish ticket terms');h.changeAccount();
  await h.resolve(()=>resolve({id:'old-account-offer'}));assert.equal(h.calls.some(c=>c[0]==='saved'),false);
});
test('purchased schedule changes use server policy without a creator eligibility override',async t=>{
  const h=await mount(t,'lifecycle');await h.change('Updated event start time','2099-01-10T20:00');
  await h.change('Event update message for buyers','Moving the show to next Sunday.');await h.press('Reschedule event');
  assert.equal(h.find('Confirm material schedule change and refund request eligibility'),undefined);
  const action=h.calls.find(c=>c[0]==='manage');assert.equal(action[1],'reschedule');assert.equal(action[2].materialChange,undefined);
  assert.equal(action[2].startsAt,'2099-01-11T01:00:00.000Z');assert.match(h.text(),/subject to the payment provider/);
  assert.match(h.text(),/delay of 30 minutes or more/);assert.match(h.text(),/silence does not accept/);
  assert.match(h.text(),/keeps later cancellation and no-show protection/);
});
test('pause sales uses lifecycle action and does not convert the paid event to free',async t=>{
  const h=await mount(t,'lifecycle');await h.press('Pause new sales');assert.equal(h.calls[0][1],'stop_sales');assert.match(h.text(),/Existing purchases keep/);
});

test('stale creator preview rejection preserves selected price, capacity, windows and inclusions',async t=>{
  const h=await mount(t,'sale',{save:async()=>{throw Error('event_changed_refresh_required');}});
  await h.press('event-price-picker-p199');await h.change('Virtual event ticket capacity','12');
  await h.change('Event ticket sales open date and time','2098-12-20T20:00');
  await h.change('Event ticket sales close date and time','2099-01-03T19:30');
  await h.change('What this event ticket includes','Exact agreed online show');await h.press('Publish ticket terms');
  assert.equal(h.calls.filter(c=>c[0]==='saved').length,0);
  assert.equal(h.find('event-price-picker-p199').props.accessibilityState.checked,true);
  assert.equal(h.find('Virtual event ticket capacity').props.value,'12');
  assert.equal(h.find('Event ticket sales close date and time').props.value,'2099-01-03T19:30');
  assert.equal(h.find('What this event ticket includes').props.value,'Exact agreed online show');
  assert.match(h.text(),/edits are preserved; refresh/);
});
