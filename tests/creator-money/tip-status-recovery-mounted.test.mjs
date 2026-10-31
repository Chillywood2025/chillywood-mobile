import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import {createRoot} from 'react-dom/client';
import ts from 'typescript';
import {container,noop,textOf,deferred} from './purchases-mounted-fixture.mjs';

const tip='aa100000-0000-4000-8000-000000000001';
async function mount(t,reader=async()=>({status:'pending'})) {
  const nodes=new Map(),timers=new Map(),reads=[],routes=[],events=[];let timerId=0;
  let session={user:{id:'buyer'},authority:{sessionGeneration:'one'}};
  const host=name=>function Host(props){const id=React.useId();nodes.set(id,{type:name,props});
    React.useEffect(()=>()=>nodes.delete(id),[id]);return React.createElement(React.Fragment,null,...React.Children.toArray(props.children).filter(x=>typeof x==='object'));};
  const native={StyleSheet:{create:x=>x}};
  for(const name of ['ActivityIndicator','Text','TouchableOpacity','View'])native[name]=host(name);
  const imports={react:React,'react-native':native,'expo-router':{useLocalSearchParams:()=>({tip_id:tip}),
    useRouter:()=>({push:r=>routes.push(r),canGoBack:()=>false,back:noop,replace:r=>routes.push(r)})},
    '../_lib/analytics':{trackEvent:(...e)=>events.push(e)},'../_lib/session':{useSession:()=>session},
    '../_lib/creatorMonetization':{formatMonetizationCurrency:a=>`$${a/100}`},
    '../_lib/creatorTips':{readMyTipTransactionStatus:id=>{reads.push(id);return reader(id);}},
    '../components/ui/chillywood-visual-system':{CHILLYWOOD_VISUAL:{},ChillywoodPrimaryActionFill:host('Fill')}};
  const context={exports:{},Promise,require:name=>{assert.ok(name in imports,`unexpected import ${name}`);return imports[name];},
    setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/tip-status.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);
  const root=createRoot(container());let unmounted=false;
  const render=()=>React.act(async()=>root.render(React.createElement(context.exports.default)));
  await render();t.after(async()=>{if(!unmounted)await React.act(async()=>root.unmount());});
  const node=id=>[...nodes.values()].find(n=>n.props.testID===id);
  return {reads,routes,events,timers,node,text:()=>[...nodes.values()].map(textOf).join(' '),setReader:r=>{reader=r;},
    async tick(delay){const found=[...timers].find(([,v])=>v.delay===delay);assert.ok(found,`timer ${delay}`);timers.delete(found[0]);await React.act(async()=>found[1].fn());},
    async press(id){const target=node(id);assert.ok(target);assert.ok(!target.props.disabled);await React.act(async()=>target.props.onPress());},
    async session(next){session={...session,authority:{sessionGeneration:next}};await render();},
    async settle(d,value){await React.act(async()=>d.resolve(value));},
    async unmount(){unmounted=true;await React.act(async()=>root.unmount());}};
}

test('eight status reads stop spinner, retain exact tip and offer bounded status-only retry',async t=>{
  const h=await mount(t);for(let i=0;i<7;i++)await h.tick(1800);
  assert.equal(h.reads.length,8);assert.equal(h.timers.size,0);assert.equal(h.node('tip-status-checking'),undefined);
  assert.match(h.text(),/Automatic checking has stopped/);assert.match(h.text(),/Do not send another tip/);
  await h.press('tip-status-help');assert.equal(h.routes[0].pathname,'/support');assert.equal(h.routes[0].params.purchaseId,tip);
  await h.press('tip-status-retry');for(let i=0;i<7;i++)await h.tick(1800);
  assert.equal(h.reads.length,16);assert.ok(h.reads.every(id=>id===tip));assert.equal(h.timers.size,0);
  h.setReader(async()=>({status:'paid',creatorId:'creator',amountCents:300}));await h.press('tip-status-retry');
  assert.match(h.text(),/Tip sent/);assert.equal(h.events.length,1);assert.equal(h.node('tip-status-checking'),undefined);
});

test('hung read reaches deadline, late result cannot override a fresh retry, double retry is single flight',async t=>{
  const old=deferred(),current=deferred();const h=await mount(t,()=>old.promise);
  await h.tick(15000);assert.equal(h.node('tip-status-checking'),undefined);assert.ok(h.node('tip-status-retry'));
  h.setReader(()=>current.promise);const retry=h.node('tip-status-retry').props.onPress;
  await React.act(async()=>{retry();retry();});assert.equal(h.reads.length,2);
  await h.settle(old,{status:'paid',creatorId:'old',amountCents:999});assert.equal(h.events.length,0);assert.doesNotMatch(h.text(),/9\.99/);
  await h.settle(current,{status:'refunded'});assert.match(h.text(),/Tip refunded/);assert.equal(h.timers.size,0);
});

test('session replacement and unmount clear timers and suppress old receipt, help and retry callbacks',async t=>{
  const old=deferred();const h=await mount(t,()=>old.promise);const oldHelp=h.node('tip-status-help').props.onPress;
  h.setReader(async()=>({status:'disputed'}));await h.session('two');
  await h.settle(old,{status:'paid',creatorId:'old',amountCents:999});assert.equal(h.events.length,0);
  assert.match(h.text(),/Tip under review/);assert.equal(h.node('tip-status-checking'),undefined);assert.equal(h.timers.size,0);
  await React.act(async()=>oldHelp());assert.equal(h.routes.length,0);
  h.setReader(async()=>({status:'pending'}));await h.session('three');assert.ok(h.timers.size>0);
  await h.unmount();assert.equal(h.timers.size,0);
});

test('failed status read exposes retry without a running spinner and unmount retires its retry callback',async t=>{
  const h=await mount(t,async()=>{throw new Error('offline');});
  assert.equal(h.node('tip-status-checking'),undefined);assert.match(h.text(),/Tip not yet confirmed/);
  const retry=h.node('tip-status-retry').props.onPress;assert.equal(h.reads.length,1);
  await h.unmount();await React.act(async()=>retry());assert.equal(h.reads.length,1);assert.equal(h.timers.size,0);
});
