import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {client,deferred,ids,load,policy} from './event-ticket-policy-fixture.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
const textOf=n=>Array.isArray(n)?n.map(textOf).join(' '):n==null||typeof n==='boolean'?'':typeof n==='object'?textOf(n.props?.children):String(n);
async function mount(t,options={}){
  const h=client(options),nodes=new Map(),listeners=new Set();
  const host=name=>function Native(props){const id=React.useId();nodes.set(id,{type:name,props});React.useEffect(()=>()=>nodes.delete(id),[id]);return React.createElement(React.Fragment,null,...React.Children.toArray(props.children).filter(c=>typeof c==='object'));};
  const native={StyleSheet:{create:x=>x}};for(const name of ['View','Text','Pressable','ActivityIndicator'])native[name]=host(name);
  const Component=load('components/monetization/event-ticket-policy.tsx',{
    react:React,'react-native':native,'../../_lib/creatorEventTicketPolicy':h.api,
    '../../_lib/accountSessionAuthority':{...h.session,subscribeToAccountSessionAuthority:cb=>{listeners.add(cb);return()=>listeners.delete(cb);}},
  }).EventTicketPolicy;
  const root=createRoot(container());let props={eventId:ids.event,purchaseId:ids.purchase,initiallyExpanded:options.expanded??true};
  const render=async next=>{props={...props,...next};await React.act(async()=>root.render(React.createElement(Component,props)));};
  await render();t.after(()=>React.act(async()=>root.unmount()));
  const node=id=>[...nodes.values()].find(n=>n.props.testID===id);
  return{...h,node,render,text:()=>[...nodes.values()].filter(n=>n.type==='Text').map(textOf).join(' '),
    async press(id){const n=node(id);assert.ok(n,id);await React.act(async()=>{void n.props.onPress();});},
    async switchAccount(notify=true){await React.act(async()=>{h.setAuthority({userId:ids.other,sessionGeneration:'two',restoreOnly:false});if(notify)listeners.forEach(cb=>cb(h.session.getCurrentAccountSessionAuthoritySnapshot()));});},
    async resolve(p,value){await React.act(async()=>p.resolve(value));},
  };
}
test('purchase card loads changes only when expanded; viewing and refreshing never accepts a schedule',async t=>{
  const h=await mount(t,{expanded:false});assert.equal(h.calls.length,0);
  await h.press(`ticket-policy-toggle-${ids.purchase}`);assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,'read_my_creator_event_ticket_policy');
  assert.match(h.text(),/Purchased start/);assert.match(h.text(),/Current advertised start/);assert.match(h.text(),/EDT/);assert.match(h.text(),/EST/);
  assert.match(h.text(),/Reading it does not accept/);assert.match(h.text(),/No acceptance of a changed schedule is recorded/);
  await h.press(`ticket-policy-refresh-${ids.purchase}`);assert.equal(h.calls.length,2);assert.ok(h.calls.every(c=>c.name==='read_my_creator_event_ticket_policy'));
});
test('double tap records one exact choice, refreshes after save and preserves a racing cancellation',async t=>{
  const pending=deferred();let saved=false;
  const h=await mount(t,{rpc:async name=>{
    if(name==='respond_creator_event_schedule_change'){saved=true;return pending.promise;}
    return{data:policy(saved?{choiceRequired:false,acceptedRevisionId:ids.revision,history:[{revisionId:ids.revision,choice:'keep_ticket',createdAt:'2026-10-27T11:00:00Z',schedule:policy().currentRevision}],refundEligibility:{...policy().refundEligibility,reasons:['event_canceled']}}:{}),error:null};
  }});
  const press=h.node(`ticket-policy-keep-${ids.purchase}`).props.onPress;
  await React.act(async()=>{press();press();});assert.equal(h.calls.filter(c=>c.name==='respond_creator_event_schedule_change').length,1);
  assert.equal(h.calls[1].args.p_expected_revision_id,ids.revision);assert.equal(h.calls[1].args.p_choice,'keep_ticket');
  await h.resolve(pending,{data:policy({choiceRequired:false,acceptedRevisionId:ids.revision}),error:null});
  assert.equal(h.calls.length,3);assert.match(h.text(),/show canceled/);assert.match(h.text(),/does not waive later cancellation or no-show/);
  assert.match(h.text(),/Kept ticket/);assert.equal(h.node(`ticket-policy-keep-${ids.purchase}`),undefined);
});
test('refund-review choice records review only; failed readback requires refresh and does not resend',async t=>{
  let responded=false,readbackFailed=true;
  const h=await mount(t,{rpc:async name=>{
    if(name==='respond_creator_event_schedule_change'){responded=true;return{data:policy({choiceRequired:false}),error:null};}
    if(responded&&readbackFailed)return{data:null,error:{message:'network'}};
    return{data:policy(responded?{choiceRequired:false,history:[{revisionId:ids.revision,choice:'request_refund_review',createdAt:'2026-10-27T11:00:00Z',schedule:policy().currentRevision}]}:{}),error:null};
  }});
  await h.press(`ticket-policy-refund-${ids.purchase}`);assert.equal(h.calls[1].args.p_choice,'request_refund_review');
  assert.match(h.text(),/could not be verified/);assert.equal(h.node(`ticket-policy-refund-${ids.purchase}`),undefined);
  readbackFailed=false;await h.press(`ticket-policy-refresh-${ids.purchase}`);assert.match(h.text(),/Requested provider refund review/);
  assert.match(h.text(),/not a confirmed refund/);assert.equal(h.calls.filter(c=>c.name==='respond_creator_event_schedule_change').length,1);
});
test('unknown mutation outcome and stale revision do not allow another choice until a fresh read',async t=>{
  for(const message of ['account_bound_rpc_timeout','event_changed_refresh_required']){
    let changed=false;const next={...policy().currentRevision,id:ids.other};
    const h=await mount(t,{rpc:async name=>{
      if(name==='respond_creator_event_schedule_change'){changed=true;return{data:null,error:{message}};}
      return{data:policy(changed?{currentRevision:next}:{}),error:null};
    }});
    await h.press(`ticket-policy-keep-${ids.purchase}`);assert.match(h.text(),/choice could not be confirmed/);assert.equal(h.node(`ticket-policy-keep-${ids.purchase}`),undefined);
    await h.press(`ticket-policy-refresh-${ids.purchase}`);await h.press(`ticket-policy-refund-${ids.purchase}`);
    assert.equal(h.calls.at(-1).args.p_expected_revision_id,ids.other);
  }
});
test('retained choice handler is retired after timeout and stays retired after a fresh same-object read',async t=>{
  const cachedPolicy=policy();
  const h=await mount(t,{rpc:async name=>name==='respond_creator_event_schedule_change'
    ?{data:null,error:{message:'account_bound_rpc_timeout'}}:{data:cachedPolicy,error:null}});
  const retired=h.node(`ticket-policy-keep-${ids.purchase}`).props.onPress;
  await React.act(async()=>retired());
  assert.equal(h.node(`ticket-policy-keep-${ids.purchase}`),undefined);
  await React.act(async()=>retired());
  assert.equal(h.calls.filter(c=>c.name==='respond_creator_event_schedule_change').length,1,'unknown outcome cannot resend through a retained callback');
  assert.equal(h.calls.filter(c=>c.name==='read_my_creator_event_ticket_policy').length,1);
  await h.press(`ticket-policy-refresh-${ids.purchase}`);
  await React.act(async()=>retired());
  assert.equal(h.calls.filter(c=>c.name==='respond_creator_event_schedule_change').length,1,'a new read does not revive an older handler even if policy object/revision are identical');
  await h.press(`ticket-policy-refund-${ids.purchase}`);
  assert.equal(h.calls.filter(c=>c.name==='respond_creator_event_schedule_change').length,2,'only the fresh rendered choice can act after checking the outcome');
});
test('refresh retires existing choice handlers before the newer read settles',async t=>{
  const pending=deferred();let reads=0;
  const h=await mount(t,{rpc:async name=>name==='read_my_creator_event_ticket_policy'&&++reads>1?pending.promise:{data:policy(),error:null}});
  const old=h.node(`ticket-policy-keep-${ids.purchase}`).props.onPress;
  await h.press(`ticket-policy-refresh-${ids.purchase}`);await React.act(async()=>old());
  assert.equal(h.calls.filter(c=>c.name==='respond_creator_event_schedule_change').length,0);
  await h.resolve(pending,{data:policy({currentRevision:{...policy().currentRevision,id:ids.other}}),error:null});
  await React.act(async()=>old());assert.equal(h.calls.filter(c=>c.name==='respond_creator_event_schedule_change').length,0);
});
test('account switch suppresses pending read, choice, and a retained handler even without notification',async t=>{
  const read=deferred(),a=await mount(t,{rpc:()=>read.promise});await a.switchAccount();await a.resolve(read,{data:policy(),error:null});
  assert.doesNotMatch(a.text(),/Current advertised start/);
  const save=deferred(),b=await mount(t,{rpc:name=>name==='respond_creator_event_schedule_change'?save.promise:{data:policy(),error:null}});
  await b.press(`ticket-policy-keep-${ids.purchase}`);await b.switchAccount();await b.resolve(save,{data:policy(),error:null});assert.doesNotMatch(b.text(),/Current advertised start/);
  const c=await mount(t),old=c.node(`ticket-policy-keep-${ids.purchase}`).props.onPress;await c.switchAccount(false);
  await React.act(async()=>old());assert.equal(c.calls.length,1,'retained handler dispatches no mutation as replacement account');
});
test('selected purchase change suppresses previous response and retained event handler',async t=>{
  const pending=deferred();const h=await mount(t,{rpc:async(name,args)=>args.p_purchase_id===ids.purchase?{data:policy(),error:null}:pending.promise});
  const old=h.node(`ticket-policy-keep-${ids.purchase}`).props.onPress;
  await h.render({purchaseId:ids.other});await React.act(async()=>old());assert.equal(h.calls.length,2);
  await h.resolve(pending,{data:policy({purchaseId:ids.other}),error:null});assert.ok(h.node(`ticket-policy-keep-${ids.other}`));
});
test('multiple choices show each immutable accepted or reviewed schedule with its own timezone',async t=>{
  const historical={startsAt:'2026-12-15T15:00:00Z',endsAt:'2026-12-15T16:00:00Z',timeZone:'Asia/Tokyo'};
  const h=await mount(t,{rpc:async()=>({data:policy({history:[
    {revisionId:ids.other,choice:'keep_ticket',createdAt:'2026-10-27T10:00:00Z',schedule:policy().originalSchedule},
    {revisionId:ids.revision,choice:'request_refund_review',createdAt:'2026-10-27T11:00:00Z',schedule:historical},
  ]}),error:null})});
  const accepted=textOf(h.node(`ticket-policy-history-${ids.purchase}-0`)),reviewed=textOf(h.node(`ticket-policy-history-${ids.purchase}-1`));
  assert.match(accepted,/Accepted start.*EDT.*America\/New_York/);assert.match(accepted,/Recorded end.*EST.*America\/New_York/);
  assert.match(reviewed,/Reviewed start.*Dec 16, 2026.*Asia\/Tokyo/);assert.match(reviewed,/Recorded end.*Asia\/Tokyo/);
  assert.doesNotMatch(reviewed,/America\/New_York/);assert.doesNotMatch(accepted,new RegExp(ids.other));
  assert.match(h.text(),/Current advertised end/);
});
test('missed replay deadline displays provider review and preserves accrued eligibility on later refresh',async t=>{
  let lateReplay=false;
  const eligibility={...policy().refundEligibility,reasons:['event_replay_unavailable'],createdAt:'2026-11-01T08:00:00Z'};
  const h=await mount(t,{rpc:async()=>({data:policy({choiceRequired:false,refundEligibility:{...eligibility},notice:lateReplay?null:policy().notice}),error:null})});
  assert.match(h.text(),/promised replay missed its availability deadline/);assert.match(h.text(),/not a confirmed refund/);
  assert.match(h.text(),/eligibility remains if replay becomes available later/);assert.equal(h.node(`ticket-policy-keep-${ids.purchase}`),undefined);
  lateReplay=true;await h.press(`ticket-policy-refresh-${ids.purchase}`);
  assert.match(h.text(),/Eligible for provider refund review.*promised replay/);
  assert.equal(h.calls.filter(c=>c.name==='respond_creator_event_schedule_change').length,0,'read-only remedy display never initiates provider execution or consent');
});
