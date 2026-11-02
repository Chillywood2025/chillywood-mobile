import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {React,ts,textOf,deferred} from '../platform-studio-mounted-harness.mjs';
const require=createRequire(import.meta.url),{createRoot}=require('react-dom/client');
async function mount(t,overrides={}){
 let authority={userId:'A',sessionGeneration:'1'},focused=true;const nodes=new Map(),calls=[],timers=new Map();let timerId=0;
 const host=name=>function Host(props){const id=React.useId();nodes.set(id,{type:name,props});React.useLayoutEffect(()=>()=>nodes.delete(id),[id]);return React.Children.toArray(props.children).filter(x=>typeof x==='object');};
 const quote={ready:true,environment:'test',grossMinor:10000,appFeeMinor:0,expectedProviderFeeMinor:10,bankMinor:9990};
 const row={requestId:'request',status:'prepared',environment:'test',bankPaid:false,grossMinor:10000,bankMinor:9990,observedProviderFeeMinor:null,canCancel:true};
 const api={cashoutDollarsToMinor:x=>Number(x)*100,SANDBOX_CASHOUT_STATUS:{prepared:'Test request reserved — no payout sent'},
  previewSandboxCreatorCashout:async(...args)=>{calls.push(['quote',...args]);return quote;},
  submitSandboxCreatorCashout:async q=>{calls.push(['submit',q]);return row;},
  readSandboxCreatorCashoutHistory:async()=>[row],
  advanceSandboxCreatorCashout:async r=>{calls.push(['advance',r]);return {...r,status:'payout_pending'};},
  cancelSandboxCreatorCashout:async r=>{calls.push(['cancel',r]);return {...r,status:'canceled',canCancel:false};},...overrides};
 const context={exports:{},Date,Number,JSON,Error,setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),require:name=>{
  if(name==='react')return React;
  if(name==='react-native')return Object.fromEntries(['View','Text','TextInput','Pressable'].map(n=>[n,host(n)]));
  if(name==='@react-navigation/native')return {useIsFocused:()=>focused};
  if(name.endsWith('/accountSessionAuthority'))return {getCurrentAccountSessionAuthoritySnapshot:()=>authority,subscribeToAccountSessionAuthority:()=>()=>{}};
  if(name.endsWith('/chillywood-visual-system'))return {CHILLYWOOD_VISUAL:{}};
  return api;
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/monetization/sandbox-creator-cashout-panel.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,context);
 const root=createRoot({addEventListener(){},removeEventListener(){},namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:globalThis.document,parentNode:null,tagName:'DIV'});
 const render=()=>React.act(async()=>root.render(React.createElement(context.exports.SandboxCreatorCashoutPanel)));
 await render();t.after(()=>React.act(async()=>root.unmount()));
 return {calls,quote,row,nodes,api,button:label=>[...nodes.values()].find(n=>n.type==='Pressable'&&textOf(n)===label),
  text:()=>[...nodes.values()].filter(n=>n.type==='Text').map(textOf).join('\n'),
  async press(n){assert.ok(n);assert.notEqual(n.props.disabled,true);await React.act(async()=>{void n.props.onPress();});},
  async amount(value){const n=[...nodes.values()].find(n=>n.type==='TextInput');await React.act(async()=>n.props.onChangeText(value));},
  async account(value){authority=value;await render();},async focus(value){focused=value;await render();},
  async resolve(d,value){await React.act(async()=>d.resolve(value));},async expire(){await React.act(async()=>{for(const fn of [...timers.values()])fn();});}};
}
test('mounted sandbox quote never reports payout success; duplicate confirm reserves once and explicit continuation dispatches',async t=>{
 const m=await mount(t);await m.amount('100');await m.press(m.button('Review test payout'));
 assert.match(m.text(),/No provider payout has been sent/);assert.match(m.text(),/simulated test deductions/);
 const confirm=m.button('Confirm sandbox request');
 await React.act(async()=>{void confirm.props.onPress();void confirm.props.onPress();});
 assert.equal(m.calls.filter(x=>x[0]==='submit').length,1);assert.equal(m.calls.filter(x=>x[0]==='advance').length,0);
 assert.match(m.text(),/Test request reserved/);await m.press(m.button('Continue provider test payout'));
 assert.equal(m.calls.filter(x=>x[0]==='advance').length,1);assert.equal(m.calls.find(x=>x[0]==='advance')[1],m.row);
});
test('mounted sandbox retires quotes on edit, blur, logout and account/session replacement',async t=>{
 const m=await mount(t);await m.amount('100');await m.press(m.button('Review test payout'));
 const old=m.button('Confirm sandbox request');await m.amount('99');await React.act(async()=>old.props.onPress());
 assert.equal(m.calls.filter(x=>x[0]==='submit').length,0);
 await m.press(m.button('Review test payout'));const next=m.button('Confirm sandbox request');
 await m.focus(false);await React.act(async()=>next.props.onPress());await m.focus(true);
 await m.account(null);await m.account({userId:'B',sessionGeneration:'2'});await m.account({userId:'A',sessionGeneration:'3'});
 await React.act(async()=>next.props.onPress());assert.equal(m.calls.filter(x=>x[0]==='submit').length,0);
});
test('late sandbox quote after logout is discarded and stale row controls cannot dispatch',async t=>{
 const pending=deferred(),m=await mount(t,{previewSandboxCreatorCashout:()=>pending.promise});
 await m.amount('100');await m.press(m.button('Review test payout'));await m.account(null);await m.resolve(pending,m.quote);
 assert.equal(m.button('Confirm sandbox request'),undefined);
 await m.account({userId:'A',sessionGeneration:'2'});await m.press(m.button('Refresh test payout history'));
 const advance=m.button('Continue provider test payout'),cancel=m.button('Cancel test payout');await m.focus(false);
 await React.act(async()=>{void advance.props.onPress();void cancel.props.onPress();});
 assert.equal(m.calls.filter(x=>['advance','cancel'].includes(x[0])).length,0);
});
test('ambiguous request failure clears confirmation and instructs history, never success',async t=>{
 const m=await mount(t,{submitSandboxCreatorCashout:async()=>{throw Error('Test request is not confirmed. Refresh test history before trying again.');}});
 await m.amount('100');await m.press(m.button('Review test payout'));await m.press(m.button('Confirm sandbox request'));
 assert.equal(m.button('Confirm sandbox request'),undefined);assert.match(m.text(),/not confirmed/);assert.doesNotMatch(m.text(),/Test request reserved/);
});
test('expired recovery authority shows exact held reason and read-only refresh, never a replacement payout',async t=>{
 let reads=0;
 const row={requestId:'held',status:'funding_return_pending',grossMinor:10000,bankMinor:9990,observedProviderFeeMinor:null,
  recoveryAuthorityRequired:true,qualificationStatus:'expired_or_revoked',ownerAction:'sandbox_recovery_authority_required'};
 const m=await mount(t,{readSandboxCreatorCashoutHistory:async()=>{reads++;return [row];}});
 await m.press(m.button('Refresh test payout history'));
 assert.match(m.text(),/fresh, recovery-only authority for this exact execution/);
 assert.match(m.text(),/does not authorize a new payout/);
 assert.equal(m.button('Continue provider test payout'),undefined);assert.equal(m.button('Reconcile this test payout'),undefined);
 await m.press(m.button('Refresh held test payout status'));assert.equal(reads,3);
 assert.equal(m.calls.filter(x=>x[0]==='advance').length,0);
});
test('expired ordinary provider qualification never offers continuation and distinguishes recovery authority',async t=>{
 const row={requestId:'held',status:'funded',grossMinor:10000,bankMinor:9990,observedProviderFeeMinor:null,
  recoveryAuthorityRequired:false,qualificationStatus:'expired_or_revoked',ownerAction:'sandbox_cashout_provider_qualification_required'};
 const m=await mount(t,{readSandboxCreatorCashoutHistory:async()=>[row]});
 await m.press(m.button('Refresh test payout history'));
 assert.match(m.text(),/Qualification is not renewed automatically/);assert.doesNotMatch(m.text(),/fresh, recovery-only authority/);
 assert.equal(m.button('Continue provider test payout'),undefined);
 await m.press(m.button('Refresh held test payout status'));assert.equal(m.calls.filter(x=>x[0]==='advance').length,0);
});
test('fresh recovery-only authority allows exact return despite original expired qualification',async t=>{
 const row={requestId:'recovery',status:'funding_return_pending',grossMinor:10000,bankMinor:9990,observedProviderFeeMinor:null,
  recoveryAuthorityRequired:false,qualificationStatus:'expired_or_revoked',ownerAction:null};
 const m=await mount(t,{readSandboxCreatorCashoutHistory:async()=>[row]});
 await m.press(m.button('Refresh test payout history'));
 assert.equal(m.button('Refresh held test payout status'),undefined);assert.equal(m.button('Continue provider test payout'),undefined);
 await m.press(m.button('Continue test funds recovery'));assert.equal(m.calls.filter(x=>x[0]==='advance').length,1);
});
test('unknown dispatch with expired qualification retains safe provider reconciliation',async t=>{
 const row={requestId:'unknown',status:'funding_unknown',grossMinor:10000,bankMinor:9990,observedProviderFeeMinor:null,
  recoveryAuthorityRequired:false,qualificationStatus:'expired_or_revoked',ownerAction:'sandbox_cashout_provider_qualification_required'};
 const m=await mount(t,{readSandboxCreatorCashoutHistory:async()=>[row]});
 await m.press(m.button('Refresh test payout history'));
 assert.equal(m.button('Continue provider test payout'),undefined);
 await m.press(m.button('Reconcile this test payout'));assert.equal(m.calls.filter(x=>x[0]==='advance').length,1);
});
test('unknown and denied actual tester reads hide all payout controls and rows',async t=>{
 const pending=deferred(),m=await mount(t,{readSandboxCreatorCashoutHistory:()=>pending.promise});
 assert.match(m.text(),/Checking current internal tester access/);assert.equal(m.button('Review test payout'),undefined);
 assert.equal([...m.nodes.values()].some(n=>n.type==='TextInput'),false);
 m.api.readSandboxCreatorCashoutHistory=async()=>{throw Error('tester revoked');};
 await m.account({userId:'B',sessionGeneration:'2'});await m.resolve(pending,[m.row]);
 assert.equal(m.button('Review test payout'),undefined);assert.equal(m.button('Continue provider test payout'),undefined);
 assert.match(m.text(),/could not be verified/);assert.ok(m.button('Check internal test access'));
});
test('revocation before confirmation fails closed before submit and clears displayed quote and rows',async t=>{
 const m=await mount(t);await m.amount('100');await m.press(m.button('Review test payout'));
 const confirm=m.button('Confirm sandbox request');m.api.readSandboxCreatorCashoutHistory=async()=>{throw Error('tester expired');};
 await m.press(confirm);await React.act(async()=>confirm.props.onPress());
 assert.equal(m.calls.filter(x=>x[0]==='submit').length,0);assert.equal(m.button('Review test payout'),undefined);
 assert.equal(m.button('Continue provider test payout'),undefined);assert.match(m.text(),/tester expired/);
});
test('access lease expiry hides all rows and retains in-flight submit latch until actual settlement',async t=>{
 const pending=deferred();let submits=0;
 const m=await mount(t,{submitSandboxCreatorCashout:async()=>{submits++;return pending.promise;}});
 await m.amount('100');await m.press(m.button('Review test payout'));const confirm=m.button('Confirm sandbox request');
 await m.press(confirm);assert.equal(submits,1);await m.expire();
 assert.equal(m.button('Review test payout'),undefined);assert.equal(m.button('Continue provider test payout'),undefined);
 const access=m.button('Check internal test access');assert.equal(access.props.disabled,true);
 await React.act(async()=>{confirm.props.onPress();access.props.onPress();});assert.equal(submits,1);
 await m.resolve(pending,m.row);assert.equal(m.button('Continue provider test payout'),undefined);
 assert.equal(m.button('Check internal test access').props.disabled,false);assert.match(m.text(),/in-flight request may still be processing/);
});
