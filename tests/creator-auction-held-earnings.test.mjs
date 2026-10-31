import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {createSharedVisualLoader} from './helpers/shared-visual-host.mjs';
const compile=(file,imports)=>{const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText)(imports,module,module.exports);return module.exports;};
const id='ab333333-3333-4333-8333-333333333333',id2='ab333333-3333-4333-8333-333333333334';
const entry={id,lane:'event',createdAt:'2026-10-31T00:00:00Z',currency:'usd',grossMinor:1000,netMinor:null,creatorMinor:null,platformMinor:null,recoveryObligationMinor:null,observedAt:null,holdReasons:['tax_unverified','not_payable_source_only'],providerRefreshStatus:'unknown',lastCheckedAt:null,financialAuthority:false,notPayable:true};
const page=(entries=[entry],nextCursor=null)=>({entries,nextCursor,financialAuthority:false,notPayable:true});
test('held read freezes scoped RPC, preserves unknown money, and rejects payable/malformed authority',async()=>{
 let data=page();const calls=[];
 const helper=compile('_lib/creatorAuctionHeldEarnings.ts',()=>({runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{calls.push({name,args});return {data,error:null};}}));
 const read=await helper.readCreatorAuctionHeldEarnings();assert.equal(read.entries[0].creatorMinor,null);assert.deepEqual(calls[0],{name:'list_creator_auction_held_earnings',args:{p_after:null,p_limit:20}});
 for(const patch of [{financialAuthority:true},{notPayable:false},{entries:[{...entry,financialAuthority:true}]},{entries:[{...entry,creatorMinor:undefined}]},{entries:[{...entry,creatorMinor:1.2}]},{entries:[{...entry,creatorMinor:-1}]},{entries:[{...entry,currency:'eur'}]},{entries:[{...entry,observedAt:'bad'}]},{entries:[entry,entry]},{nextCursor:'invalid'}]){data={...page(),...patch};await assert.rejects(helper.readCreatorAuctionHeldEarnings());}
 data=page([{...entry,netMinor:-100,recoveryObligationMinor:100}]);assert.equal((await helper.readCreatorAuctionHeldEarnings()).entries[0].netMinor,-100);
 await assert.rejects(helper.readCreatorAuctionHeldEarnings('bad'));
 const source=fs.readFileSync('app/channel-settings.tsx','utf8');assert.match(source,/<CreatorAuctionHeldEarnings key=\{JSON.stringify\(getCurrentAccountSessionAuthoritySnapshot\(\)\)\}/);
 assert.match(source,/creatorEarningsBalances.availableCents, "usd"/);
});
test('actual held card/helper handles null estimates, pages, failures, refresh and retired account reads without cashout',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
 const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
 doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
 let focused=true,account='A',fail=true,delayed=null;const calls=[],nodes=new Map();
 const host=name=>function Host(p){const key=React.useId();nodes.set(key,{name,p});React.useLayoutEffect(()=>()=>nodes.delete(key),[key]);return React.createElement(React.Fragment,null,...React.Children.toArray(p.children).filter(x=>typeof x==='object'));};
 const native={Text:host('Text'),View:host('View'),Pressable:host('Pressable'),StyleSheet:{create:x=>x}},visuals=createSharedVisualLoader(React,native,host);
 const helper=compile('_lib/creatorAuctionHeldEarnings.ts',()=>({runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{const subject=account;calls.push({name,args,subject});if(fail)throw Error('raw private failure');const data=delayed?await delayed:args.p_after?page([{...entry,id:id2,lane:'room',creatorMinor:720,netMinor:900,platformMinor:180,observedAt:entry.createdAt,lastCheckedAt:entry.createdAt,providerRefreshStatus:'fresh'}]):page([entry],id);if(account!==subject)throw Error('stale account');return {data,error:null};}}));
 const m=compile('components/monetization/creator-auction-held-earnings.tsx',name=>visuals(name)??(name==='react'?React:name==='react-native'?native:name==='expo-router'?{
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useFocusEffect:f=>React.useEffect(()=>focused?f():undefined,[f,focused]),}:helper));
 const root=createRoot(container()),render=()=>React.act(async()=>root.render(React.createElement(m.CreatorAuctionHeldEarnings,{key:account})));
 const text=x=>Array.isArray(x)?x.map(text).join(' '):x&&typeof x==='object'?text(x.props?.children):x??'';
 const visible=()=>[...nodes.values()].filter(n=>n.name==='Text').map(n=>text(n.p.children)).join(' ');
 const press=label=>React.act(async()=>{const n=[...nodes.values()].find(n=>n.p.accessibilityLabel===label);assert.ok(n,label);assert.notEqual(n.p.disabled,true);n.p.onPress();});
 try{await render();await press('View held auction details');assert.match(visible(),/could not be refreshed/);assert.doesNotMatch(visible(),/raw private failure/);
 fail=false;await press('View held auction details');assert.match(visible(),/Creator held estimate:\s+Not yet verified/);assert.match(visible(),/Tax amount needs verification/);assert.match(visible(),/not added to the balances above/);
 await press('Next held auction page');assert.equal(calls.at(-1).args.p_after,id);assert.match(visible(),/Room seat auction/);assert.match(visible(),/\$7.20 USD/);assert.match(visible(),/not payout authorization/);
 await press('Refresh held auction details');assert.equal(calls.at(-1).args.p_after,null);assert.match(visible(),/Event auction/);
 let resolve;delayed=new Promise(r=>resolve=r);await press('Next held auction page');account='B';await render();await React.act(async()=>resolve(page([{...entry,creatorMinor:999999}])));assert.doesNotMatch(visible(),/9999.99/);assert.match(visible(),/No bank payout or cash-out/);
 focused=false;await render();focused=true;await render();assert.doesNotMatch(visible(),/Event auction/);
 }finally{await React.act(async()=>root.unmount());}
});
