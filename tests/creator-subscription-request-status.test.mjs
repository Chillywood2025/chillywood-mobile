import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {createSharedVisualLoader} from './helpers/shared-visual-host.mjs';
const compile=(file,imports,globals={})=>{const module={exports:{}};new Function('require','module','exports',...Object.keys(globals),ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText)(imports,module,module.exports,...Object.values(globals));return module.exports;};
const row={id:'request-1',creator_id:'A',amount_minor:1234,currency:'usd',status:'pending_provisioning',created_at:'2026-10-30T00:00:00Z'};
test('request status GET freezes token/creator, validates rows and suppresses A/B results',async()=>{
 let actor='A',response=[row],calls=[];
 const helper=compile('_lib/creatorSubscriptionPriceRequests.ts',name=>name.endsWith('/supabase')?{SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'public-key'}:{captureAccountBoundSupabaseMutationSubject:async()=>({accessToken:'token-A',authority:{userId:actor}}),assertAccountBoundSupabaseMutationSubjectCurrent:s=>{if(s.authority.userId!==actor)throw Error('account changed');}}, {fetch:async(url,args)=>{calls.push({url,args});return {ok:true,json:async()=>response};}});
 assert.equal((await helper.readCreatorSubscriptionPriceRequests())[0].amountMinor,1234);
 assert.equal(calls[0].args.headers.Authorization,'Bearer token-A');assert.match(calls[0].url,/creator_id=eq.A/);assert.match(calls[0].url,/limit=50/);
 response=[{...row,creator_id:'B'}];await assert.rejects(helper.readCreatorSubscriptionPriceRequests());
 response=[row];const d={};d.promise=new Promise(r=>d.resolve=r);
 const delayed=compile('_lib/creatorSubscriptionPriceRequests.ts',name=>name.endsWith('/supabase')?{SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'public-key'}:{captureAccountBoundSupabaseMutationSubject:async()=>({accessToken:'token-A',authority:{userId:actor}}),assertAccountBoundSupabaseMutationSubjectCurrent:s=>{if(s.authority.userId!==actor)throw Error('account changed');}}, {fetch:async()=>({ok:true,json:async()=>d.promise})});
 const pending=delayed.readCreatorSubscriptionPriceRequests();await Promise.resolve();actor='B';d.resolve([row]);await assert.rejects(pending,/account changed/);
});
test('mounted status panel refreshes safely and retires late results on blur',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
 const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
 doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
 let focused=true,fail=true,pending=null;const nodes=new Map();
 const host=name=>function Host(p){const id=React.useId();nodes.set(id,{name,p});React.useLayoutEffect(()=>()=>nodes.delete(id),[id]);return React.createElement(React.Fragment,null,...React.Children.toArray(p.children).filter(x=>typeof x==='object'));};
 const native={Text:host('Text'),View:host('View'),Pressable:host('Pressable'),StyleSheet:{create:x=>x}};const visuals=createSharedVisualLoader(React,native,host);
 const helper={readCreatorSubscriptionPriceRequests:async()=>{if(pending)return pending;if(fail)throw Error('offline');return [{id:'1',amountMinor:1234,status:'approved',createdAt:row.created_at}];}};
 const m=compile('components/monetization/subscription-price-request-status.tsx',name=>visuals(name)??(name==='react'?React:name==='react-native'?native:name==='expo-router'?{
 // Controlled focus lifecycle, retaining the real production component.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useFocusEffect:f=>React.useEffect(()=>focused?f():undefined,[f,focused]),}:helper));
 const root=createRoot(container());const render=()=>React.act(async()=>root.render(React.createElement(m.SubscriptionPriceRequestStatus)));
 const text=x=>Array.isArray(x)?x.map(text).join(' '):x&&typeof x==='object'?text(x.props?.children):x??'';
 const visible=()=>[...nodes.values()].filter(n=>n.name==='Text').map(n=>text(n.p.children)).join(' ');
 const press=label=>React.act(async()=>{const n=[...nodes.values()].find(n=>n.p.accessibilityLabel===label);assert.ok(n,label);n.p.onPress();});
 try{await render();await press('View my price requests');assert.match(visible(),/could not be loaded/);fail=false;await press('View my price requests');assert.match(visible(),/Approved request/);assert.match(visible(),/Approval alone does not enable sales/);
 let resolve;pending=new Promise(r=>resolve=r);await press('Refresh price requests');focused=false;await render();await React.act(async()=>resolve([{id:'late',amountMinor:99999,status:'approved',createdAt:row.created_at}]));assert.doesNotMatch(visible(),/999.99/);focused=true;pending=null;await render();assert.doesNotMatch(visible(),/Approved request/);
 }finally{await React.act(async()=>root.unmount());}
});
