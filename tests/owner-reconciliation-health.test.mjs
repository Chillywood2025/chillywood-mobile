import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {createSharedVisualLoader} from './helpers/shared-visual-host.mjs';
const compile=(file,imports)=>{const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText)(imports,module,module.exports);return module.exports;};
const payload=()=>({schemaVersion:1,environment:'sandbox',financialAuthority:false,liveActivationAllowed:false,observedAt:'2026-11-01T14:00:00Z',driverEnabled:false,
 cost:{eligible:7,due:3,capacityGuaranteed:false},tracking:{assigned:2},measured:{windowHours:6,runs:2,completed:3,incomplete:1,capacityGuaranteed:false},alerts:['driver_disabled']});
test('owner alert deep link selects the Money Center without admitting authority parameters',()=>{
 const links=compile('_lib/appLinks.ts',()=>{throw Error('Unexpected import');});
 assert.equal(links.resolveApplicationRoute('/admin?tab=money-center&section=overview'),'/admin?tab=money-center&section=overview');
 for(const route of ['/admin','chillywoodmobile:///admin?tab=money-center&section=overview',
  'https://chillywoodstream.com/admin?tab=money-center&section=overview','/admin?tab=money-center&role=owner','/admin?tab=money-center&section=kill_switches',
  '/admin?tab=other','/admin?tab=money-center&tab=money-center']) assert.equal(links.resolveApplicationRoute(route),null);
});
test('health parser validates observations, never accepts financial authority or malformed/private errors',async()=>{
 let data=payload(),error=null;const calls=[];
 const helper=compile('_lib/ownerReconciliationHealth.ts',()=>({runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{calls.push({name,args});return {data,error};}}));
 assert.equal((await helper.readOwnerReconciliationHealth()).eligible,7);
 for(const patch of [{schemaVersion:2},{environment:'production'},{financialAuthority:true},{liveActivationAllowed:true},{driverEnabled:'true'},
  {observedAt:'bad'},{alerts:['private_bad']},{alerts:['driver_disabled','driver_disabled']},
  {cost:{eligible:-1,due:0,capacityGuaranteed:false}},{cost:{eligible:1,due:0,capacityGuaranteed:true}},
  {measured:{...payload().measured,completed:1.5}},{measured:{...payload().measured,capacityGuaranteed:true}}]){
  data={...payload(),...patch};await assert.rejects(helper.readOwnerReconciliationHealth(),/unavailable/);
 }
 error={message:'private provider evidence'};await assert.rejects(helper.readOwnerReconciliationHealth(),e=>!e.message.includes('private'));
 assert.ok(calls.every(x=>x.name==='get_owner_merch_reconciliation_health'&&Object.keys(x.args).length===0));
});
test('mounted health read is owner/session/focus bound, hides retired responses and uses shared visuals',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
 const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
 doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
 let session={userId:'A',accountId:'A',sessionGeneration:'1',state:'ACTIVE',restoreOnly:false},focused=true,fail=false,pending=null;
 const nodes=new Map(),listeners=new Set(),calls=[];
 const host=name=>function Host(p){const key=React.useId();nodes.set(key,{name,p});React.useLayoutEffect(()=>()=>nodes.delete(key),[key]);return React.createElement(React.Fragment,null,...React.Children.toArray(p.children).filter(x=>typeof x==='object'));};
 const native={Text:host('Text'),View:host('View'),Pressable:host('Pressable')},visuals=createSharedVisualLoader(React,native,host);
 const helper=compile('_lib/ownerReconciliationHealth.ts',()=>({runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{calls.push({name,args});if(fail)throw Error('private failure');return {data:pending?await pending:payload(),error:null};}}));
 const authority={getCurrentAccountSessionAuthoritySnapshot:()=>session,subscribeToAccountSessionAuthority:f=>{listeners.add(f);return()=>listeners.delete(f);}};
 const mod=compile('components/admin/owner-reconciliation-health.tsx',name=>visuals(name)??(name==='react'?React:name==='react-native'?native:name==='@react-navigation/native'?{useIsFocused:()=>focused}:name.endsWith('/accountSessionAuthority')?authority:helper));
 const root=createRoot(container());let props={isOwner:false,ownerSessionKey:JSON.stringify(session)};
 const render=()=>React.act(async()=>root.render(React.createElement(mod.OwnerReconciliationHealthPanel,props)));
 const text=x=>Array.isArray(x)?x.map(text).join(' '):x&&typeof x==='object'?text(x.props?.children):x??'';
 const visible=()=>[...nodes.values()].filter(x=>x.name==='Text').map(x=>text(x.p.children)).join(' ').replace(/\s+/g,' ');
 const refresh=()=>React.act(async()=>{const button=[...nodes.values()].find(x=>x.name==='Pressable');assert.ok(button);assert.notEqual(button.p.disabled,true);button.p.onPress();});
 try{
  await render();assert.equal(calls.length,0);assert.equal(visible(),'');
  props.isOwner=true;await render();assert.match(visible(),/7 eligible orders/);assert.match(visible(),/Automatic reconciliation is off/);
  assert.match(visible(),/Push delivery follows account notification preferences/);
  assert.equal([...nodes.values()].find(x=>x.p.testID==='owner-reconciliation-health').p.style.backgroundColor,visuals('chillywood-visual-system').CHILLYWOOD_VISUAL.glassBackground);
  fail=true;await refresh();assert.match(visible(),/unavailable/);assert.doesNotMatch(visible(),/7 eligible|private failure/);
  fail=false;let resolve;pending=new Promise(r=>resolve=r);await refresh();
  await React.act(async()=>{session={...session,userId:'B',accountId:'B',sessionGeneration:'2'};listeners.forEach(f=>f());});assert.equal(visible(),'');
  await React.act(async()=>resolve(payload()));assert.equal(visible(),'');
  pending=null;props={isOwner:true,ownerSessionKey:JSON.stringify(session)};await render();assert.match(visible(),/7 eligible orders/);
  focused=false;await render();assert.equal(visible(),'');const before=calls.length;focused=true;await render();assert.equal(calls.length,before+1);
  props.isOwner=false;await render();assert.equal(visible(),'');
  props.isOwner=true;await React.act(async()=>{session={...session,restoreOnly:true};listeners.forEach(f=>f());});props.ownerSessionKey=JSON.stringify(session);await render();assert.equal(visible(),'');
  assert.ok(calls.every(x=>x.name==='get_owner_merch_reconciliation_health'));
 }finally{await React.act(async()=>root.unmount());}
 const admin=fs.readFileSync('app/admin.tsx','utf8');assert.match(admin,/isOwnerStaff && adminReadAuthorityKey \? <OwnerReconciliationHealthPanel/);
});
