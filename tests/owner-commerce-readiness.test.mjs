import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {createSharedVisualLoader} from './helpers/shared-visual-host.mjs';
const compile=(file,imports)=>{const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText)(imports,module,module.exports);return module.exports;};
const payload=()=>({schemaVersion:1,status:'blocked',financialAuthority:false,liveActivationAllowed:false,items:['physical_merch','event_auction','room_auction'].map(feature=>({feature,status:'blocked',reason:'tax_qualification_required',taxServiceFeeStatus:'unverified'}))});
test('owner read accepts only complete blocked observation contract and never invokes mutation RPCs',async()=>{
 let data=payload(),error=null;const calls=[];
 const helper=compile('_lib/ownerCommerceReadiness.ts',()=>({runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{calls.push({name,args});return {data,error};}}));
 assert.equal((await helper.readOwnerCommerceReadiness()).length,3);
 for(const patch of [{schemaVersion:2},{status:'ready'},{financialAuthority:true},{liveActivationAllowed:true},{items:[]},{items:[payload().items[0],payload().items[0],payload().items[2]]},{items:payload().items.map(x=>({...x,reason:'unknown'}))},{items:payload().items.map(x=>({...x,taxServiceFeeStatus:'verified'}))}]){data={...payload(),...patch};await assert.rejects(helper.readOwnerCommerceReadiness(),/unavailable/);}
 error={message:'private provider evidence'};await assert.rejects(helper.readOwnerCommerceReadiness(),e=>!e.message.includes('private'));
 assert.ok(calls.every(x=>x.name==='get_owner_commerce_tax_readiness'&&Object.keys(x.args).length===0));
});
test('mounted owner panel gates roles and exact sessions, clears failures/back/refocus, shares visuals, and has only read refresh',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
 const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
 doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
 let session={userId:'A',accountId:'A',sessionGeneration:'1',state:'ACTIVE',restoreOnly:false},focused=true,fail=false,pending=null;
 const nodes=new Map(),listeners=new Set(),calls=[];
 const host=name=>function Host(p){const key=React.useId();nodes.set(key,{name,p});React.useLayoutEffect(()=>()=>nodes.delete(key),[key]);return React.createElement(React.Fragment,null,...React.Children.toArray(p.children).filter(x=>typeof x==='object'));};
 const native={Text:host('Text'),View:host('View'),Pressable:host('Pressable')},visuals=createSharedVisualLoader(React,native,host);
 const helper=compile('_lib/ownerCommerceReadiness.ts',()=>({runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{calls.push({name,args});if(fail)throw Error('private failure');return {data:pending?await pending:payload(),error:null};}}));
 const feeHelper=compile('_lib/ownerFeeAccountingHealth.ts',()=>({runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{calls.push({name,args});if(fail)throw Error('private failure');return {data:pending?await pending:{pendingCount:1,retryCount:0,blockedCount:0,newScheduleCreated:false,jobs:[]},error:null};}}));
 const feePanel=compile('components/admin/owner-fee-accounting-health.tsx',name=>visuals(name)??(name==='react'?React:name==='react-native'?native:feeHelper));
 const authority={getCurrentAccountSessionAuthoritySnapshot:()=>session,subscribeToAccountSessionAuthority:f=>{listeners.add(f);return()=>listeners.delete(f);}};
 const mod=compile('components/admin/owner-commerce-readiness.tsx',name=>visuals(name)??(name==='react'?React:name==='react-native'?native:name==='@react-navigation/native'?{useIsFocused:()=>focused}:name.endsWith('/accountSessionAuthority')?authority:name.endsWith('/owner-fee-accounting-health')?feePanel:helper));
 const root=createRoot(container());let props={isOwner:false,ownerSessionKey:JSON.stringify(session)};
 const render=()=>React.act(async()=>root.render(React.createElement(mod.OwnerCommerceReadinessPanel,props)));
 const text=x=>Array.isArray(x)?x.map(text).join(' '):x&&typeof x==='object'?text(x.props?.children):x??'';
 const visible=()=>[...nodes.values()].filter(x=>x.name==='Text').map(x=>text(x.p.children)).join(' ');
 const refresh=()=>React.act(async()=>{const button=[...nodes.values()].find(x=>x.name==='Pressable'&&x.p.accessibilityLabel==='Refresh commerce setup status');assert.ok(button);assert.notEqual(button.p.disabled,true);button.p.onPress();});
 try {
  await render();assert.equal(calls.length,0);assert.equal(visible(),''); // public/creator/non-owner
  props.isOwner=true;await render();assert.match(visible(),/Creator merchandise/);assert.match(visible(),/not launch approval or payout authorization/);assert.match(visible(),/not verified by this check/);
  const card=[...nodes.values()].find(x=>x.p.testID==='owner-commerce-readiness');assert.equal(card.p.style.backgroundColor,visuals('chillywood-visual-system').CHILLYWOOD_VISUAL.glassBackground);
  assert.equal([...nodes.values()].filter(x=>x.name==='Pressable').length,2);assert.match(visible(),/1\s+pending/);
  fail=true;await refresh();assert.match(visible(),/unavailable/);assert.doesNotMatch(visible(),/Creator merchandise|private failure/);
  fail=false;let resolve;pending=new Promise(r=>resolve=r);await refresh();assert.match(visible(),/Checking/);
  await React.act(async()=>{session={...session,userId:'B',accountId:'B',sessionGeneration:'2'};listeners.forEach(f=>f());});assert.equal(visible(),'');
  await React.act(async()=>resolve(payload()));assert.equal(visible(),''); // old owner result cannot follow account
  pending=null;props={isOwner:true,ownerSessionKey:JSON.stringify(session)};await render();assert.match(visible(),/Creator merchandise/);
  focused=false;await render();assert.equal(visible(),'');const before=calls.length;focused=true;await render();assert.equal(calls.length,before+2);
  props.isOwner=false;await render();assert.equal(visible(),'');
  props.isOwner=true;await React.act(async()=>{session={...session,restoreOnly:true};listeners.forEach(f=>f());});props.ownerSessionKey=JSON.stringify(session);await render();assert.equal(visible(),'');
  assert.ok(calls.every(x=>['get_owner_commerce_tax_readiness','get_owner_commerce_fee_accounting_health'].includes(x.name)));
 } finally {await React.act(async()=>root.unmount());}
 const admin=fs.readFileSync('app/admin.tsx','utf8');assert.match(admin,/isOwnerStaff && adminReadAuthorityKey \? <OwnerCommerceReadinessPanel/);assert.match(admin,/ownerSessionKey=\{JSON.stringify\(authority\)\}/);
});
