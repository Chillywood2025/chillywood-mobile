import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {React,ts,textOf,deferred} from '../platform-studio-mounted-harness.mjs';
const require=createRequire(import.meta.url),{createRoot}=require('react-dom/client');
async function mount(t,overrides={}){
 let authority={userId:'A',sessionGeneration:'1'},focused=true;const nodes=new Map(),calls=[];
 const host=name=>function Host(props){const id=React.useId();nodes.set(id,{type:name,props});React.useLayoutEffect(()=>()=>nodes.delete(id),[id]);return React.Children.toArray(props.children).filter(x=>typeof x==='object');};
 const policy={version:'v1',terms:'Actual displayed policy',termsSha256:'hash',accepted:true,negativeAdjustmentCents:0,adjustments:[]};
 const quote={ready:true,qualificationId:'qualification',operationId:'operation',grossMinor:10000,appFeeMinor:0,expectedProviderFeeMinor:10,bankMinor:9990,subject:{authority},expiresAt:new Date(Date.now()+60000).toISOString()};
 const api={cashoutDollarsToMinor:x=>Number(x)*100,CREATOR_CASHOUT_STATUS:{prepared:'Request accepted'},
  previewQualifiedCreatorCashout:async(...args)=>{calls.push(['quote',...args]);return quote;},
  submitQualifiedCreatorCashout:async q=>{calls.push(['submit',q]);return {requestId:'request',status:'prepared',grossMinor:10000,bankMinor:9990,observedProviderFeeMinor:null};},
  readCreatorCashoutHistory:async()=>[],captureAccountBoundSupabaseMutationSubject:async()=>({authority}),
  loadCreatorFeePolicyStatus:async()=>policy,acceptCreatorFeePolicy:async(s,p)=>{calls.push(['accept',s,p]);return {...p,accepted:true};},...overrides};
 const context={exports:{},Date,Number,JSON,Error,require:name=>{
  if(name==='react')return React;
  if(name==='react-native')return Object.fromEntries(['View','Text','TextInput','Pressable'].map(n=>[n,host(n)]));
  if(name==='@react-navigation/native')return {useIsFocused:()=>focused};
  if(name.endsWith('/accountSessionAuthority'))return {getCurrentAccountSessionAuthoritySnapshot:()=>authority,subscribeToAccountSessionAuthority:()=>()=>{}};
  if(name.endsWith('/chillywood-visual-system'))return {CHILLYWOOD_VISUAL:{}};
  return api;
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../../components/monetization/creator-cashout-panel.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,context);
 const root=createRoot({addEventListener(){},removeEventListener(){},namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:globalThis.document,parentNode:null,tagName:'DIV'});
 const render=()=>React.act(async()=>root.render(React.createElement(context.exports.CreatorCashoutPanel)));
 await render();t.after(()=>React.act(async()=>root.unmount()));
 return {calls,quote,api,nodes,button:label=>[...nodes.values()].find(n=>n.type==='Pressable'&&textOf(n)===label),
  async press(n){assert.ok(n);assert.notEqual(n.props.disabled,true);await React.act(async()=>{void n.props.onPress();});},
  async amount(value){const n=[...nodes.values()].find(n=>n.type==='TextInput');await React.act(async()=>n.props.onChangeText(value));},
  async account(value){authority=value;await render();},async focus(value){focused=value;await render();},
  async resolve(d,value){await React.act(async()=>d.resolve(value));}};
}
test('mounted cashout confirms displayed exact quote once; fee terms precede review',async t=>{
 const m=await mount(t);assert.equal(m.button('Review cashout fees').props.disabled,true);
 await m.press(m.button('Review creator fee terms'));await m.amount('100');await m.press(m.button('Review cashout fees'));
 const confirm=m.button('Confirm this cashout request');
 await React.act(async()=>{void confirm.props.onPress();void confirm.props.onPress();});
 assert.equal(m.calls.filter(x=>x[0]==='submit').length,1);assert.equal(m.calls.find(x=>x[0]==='submit')[1],m.quote);
 assert.equal(m.button('Confirm this cashout request'),undefined);
});
test('mounted cashout retires stale confirmation after amount changes, blur and A→B→A',async t=>{
 const m=await mount(t);await m.press(m.button('Review creator fee terms'));await m.amount('100');await m.press(m.button('Review cashout fees'));
 const old=m.button('Confirm this cashout request');await m.amount('99');await React.act(async()=>old.props.onPress());
 assert.equal(m.calls.filter(x=>x[0]==='submit').length,0);
 await m.press(m.button('Review cashout fees'));const next=m.button('Confirm this cashout request');
 await m.focus(false);await React.act(async()=>next.props.onPress());await m.focus(true);
 await m.account({userId:'B',sessionGeneration:'2'});await m.account({userId:'A',sessionGeneration:'3'});
 await React.act(async()=>next.props.onPress());assert.equal(m.calls.filter(x=>x[0]==='submit').length,0);
});
test('mounted async response after logout is discarded; stale terms cannot accept',async t=>{
 const pending=deferred(),m=await mount(t,{loadCreatorFeePolicyStatus:()=>pending.promise});
 await m.press(m.button('Review creator fee terms'));await m.account(null);
 await m.resolve(pending,{terms:'Old terms',accepted:false,negativeAdjustmentCents:0,adjustments:[]});
 assert.equal(m.nodes.size,0);
});
test('mounted prepared cancellation is one-shot and retires on account switch',async t=>{
 let cancels=0;const row={requestId:'request',status:'prepared',canCancel:true,grossMinor:10000,bankMinor:9800,observedProviderFeeMinor:null};
 const m=await mount(t,{readCreatorCashoutHistory:async()=>[row],cancelQualifiedCreatorCashout:async r=>{assert.equal(r,row);cancels++;return {...r,status:'canceled',canCancel:false};}});
 await m.press(m.button('Refresh cashout history'));const old=m.button('Cancel before funds are sent');
 await m.account({userId:'B',sessionGeneration:'2'});await React.act(async()=>old.props.onPress());assert.equal(cancels,0);
 await m.press(m.button('Refresh cashout history'));const current=m.button('Cancel before funds are sent');
 await React.act(async()=>{void current.props.onPress();void current.props.onPress();});assert.equal(cancels,1);
 assert.equal(m.button('Cancel before funds are sent'),undefined);
});
test('funded cancellation says bank canceled and funds still held, never claims an immediate refund',async t=>{
 const row={requestId:'request',status:'funded',canCancel:true,grossMinor:10000,bankMinor:9800,observedProviderFeeMinor:null};
 const m=await mount(t,{readCreatorCashoutHistory:async()=>[row],cancelQualifiedCreatorCashout:async()=>({...row,status:'funding_return_pending',canCancel:false,fundingReturnHeld:true})});
 await m.press(m.button('Refresh cashout history'));assert.equal(m.button('Cancel before funds are sent'),undefined);
 await m.press(m.button('Cancel bank payout'));
 const rendered=[...m.nodes.values()].map(textOf).join(' ');
 assert.match(rendered,/Funds remain held/);assert.match(rendered,/app cashout fee will/);
 assert.equal(m.button('Cancel bank payout'),undefined);
});
