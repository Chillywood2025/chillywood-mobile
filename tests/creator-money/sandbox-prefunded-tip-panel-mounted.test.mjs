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
 const source={tipId:'tip',status:'eligible_test_cashout',amountMinor:1237,availableMinor:1202,bankMinor:1192,connectedFeeMinor:10};
 const row={requestId:'request',tipId:'tip',status:'ready',bankMinor:1192,connectedFeeMinor:10,sourceHeld:false,canCancel:true,qualificationStatus:'current'};
 const api={readSandboxPrefundedTipState:async()=>({sources:[source],rows:[row]}),reviewSandboxPrefundedTip:s=>{calls.push(['review',s]);return {...s};},
  submitSandboxPrefundedTip:async q=>{calls.push(['submit',q]);return row;},refreshSandboxPrefundedTip:async s=>{calls.push(['receipt',s]);},
  advanceSandboxPrefundedTip:async r=>{calls.push(['advance',r]);return r;},cancelSandboxPrefundedTip:async r=>{calls.push(['cancel',r]);return r;},...overrides};
 const context={exports:{},Date,Number,JSON,Error,setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),require:name=>{
  if(name==='react')return React;
  if(name==='react-native')return Object.fromEntries(['View','Text','Pressable'].map(n=>[n,host(n)]));
  if(name==='@react-navigation/native')return {useIsFocused:()=>focused};
  if(name.endsWith('/accountSessionAuthority'))return {getCurrentAccountSessionAuthoritySnapshot:()=>authority,subscribeToAccountSessionAuthority:()=>()=>{}};
  if(name.endsWith('/chillywood-visual-system'))return {CHILLYWOOD_VISUAL:{}};
  return api;
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/monetization/sandbox-prefunded-tip-panel.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,context);
 const root=createRoot({addEventListener(){},removeEventListener(){},namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:globalThis.document,parentNode:null,tagName:'DIV'});
 const render=()=>React.act(async()=>root.render(React.createElement(context.exports.SandboxPrefundedTipPanel)));
 await render();t.after(()=>React.act(async()=>root.unmount()));
 return {api,calls,source,row,button:label=>[...nodes.values()].find(n=>n.type==='Pressable'&&textOf(n)===label),text:()=>[...nodes.values()].filter(n=>n.type==='Text').map(textOf).join('\n'),
  async press(n){assert.ok(n);assert.notEqual(n.props.disabled,true);await React.act(async()=>{void n.props.onPress();});},
  async account(value){authority=value;await render();},async focus(value){focused=value;await render();},async resolve(d,value){await React.act(async()=>d.resolve(value));},
  async expire(){await React.act(async()=>{for(const fn of [...timers.values()])fn();});}};
}
test('mounted custom tip quote preserves cents and separates connected costs, duplicate confirm reserves only once',async t=>{
 const m=await mount(t);assert.match(m.text(),/\$12\.37/);assert.match(m.text(),/not assumed zero/);await m.press(m.button('Review this test tip payout'));
 assert.match(m.text(),/No payout has been sent/);assert.match(m.text(),/\$11\.92/);const confirm=m.button('Confirm this test tip request');
 await React.act(async()=>{void confirm.props.onPress();void confirm.props.onPress();});assert.equal(m.calls.filter(x=>x[0]==='submit').length,1);assert.equal(m.calls.filter(x=>x[0]==='advance').length,0);
 await m.press(m.button('Continue this test tip payout'));assert.equal(m.calls.filter(x=>x[0]==='advance').length,1);
});
test('unknown and denied current tester reads hide all receipt, review and payout controls',async t=>{
 const pending=deferred(),m=await mount(t,{readSandboxPrefundedTipState:()=>pending.promise});assert.equal(m.button('Review this test tip payout'),undefined);assert.equal(m.button('Verify this test tip with provider'),undefined);
 await React.act(async()=>pending.reject(Error('denied')));assert.equal(m.button('Continue this test tip payout'),undefined);assert.match(m.text(),/could not be verified/);
});
test('blur, logout, session replacement and stale callbacks cannot reuse tip quote or request',async t=>{
 const m=await mount(t);await m.press(m.button('Review this test tip payout'));const confirm=m.button('Confirm this test tip request'),advance=m.button('Continue this test tip payout');
 await m.focus(false);await React.act(async()=>{void confirm.props.onPress();void advance.props.onPress();});await m.focus(true);
 await m.account(null);await m.account({userId:'B',sessionGeneration:'2'});await m.account({userId:'A',sessionGeneration:'3'});
 await React.act(async()=>{void confirm.props.onPress();void advance.props.onPress();});assert.equal(m.calls.filter(x=>['submit','advance'].includes(x[0])).length,0);
});
test('late provider receipt result after logout cannot restore tip controls',async t=>{
 const pending=deferred(),m=await mount(t,{refreshSandboxPrefundedTip:()=>pending.promise});await m.press(m.button('Verify this test tip with provider'));await m.account(null);await m.resolve(pending,{});
 assert.equal(m.button('Review this test tip payout'),undefined);assert.equal(m.button('Continue this test tip payout'),undefined);
});
test('stale confirmation cannot submit a newer reviewed quote',async t=>{
 const m=await mount(t);await m.press(m.button('Review this test tip payout'));const stale=m.button('Confirm this test tip request');
 await m.press(m.button('Refresh received test tips'));await m.press(m.button('Review this test tip payout'));
 await React.act(async()=>stale.props.onPress());assert.equal(m.calls.filter(x=>x[0]==='submit').length,0);
 await m.press(m.button('Confirm this test tip request'));assert.equal(m.calls.filter(x=>x[0]==='submit').length,1);
});
test('revoked authority before quote confirmation fails closed',async t=>{
 const m=await mount(t);await m.press(m.button('Review this test tip payout'));m.api.readSandboxPrefundedTipState=async()=>{throw Error('tester revoked');};await m.press(m.button('Confirm this test tip request'));
 assert.equal(m.calls.filter(x=>x[0]==='submit').length,0);assert.equal(m.button('Review this test tip payout'),undefined);assert.match(m.text(),/tester revoked/);
});
test('ambiguous submit clears the quote and directs original-request reconciliation, never paid success',async t=>{
 const m=await mount(t,{submitSandboxPrefundedTip:async()=>{throw Error('Test tip request is not confirmed. Refresh history before trying again.');}});
 await m.press(m.button('Review this test tip payout'));await m.press(m.button('Confirm this test tip request'));
 assert.equal(m.button('Confirm this test tip request'),undefined);assert.equal(m.button('Review this test tip payout'),undefined);
 assert.match(m.text(),/not confirmed/);assert.doesNotMatch(m.text(),/reports test tip payout paid|request reserved/);
});
test('expired lease hides rows and does not unlock an in-flight submit',async t=>{
 const pending=deferred(),m=await mount(t,{submitSandboxPrefundedTip:()=>pending.promise});await m.press(m.button('Review this test tip payout'));await m.press(m.button('Confirm this test tip request'));await m.expire();
 assert.equal(m.button('Continue this test tip payout'),undefined);assert.equal(m.button('Check internal test tip access').props.disabled,true);await m.resolve(pending,m.row);
 assert.equal(m.button('Continue this test tip payout'),undefined);assert.equal(m.button('Check internal test tip access').props.disabled,false);
});
test('held ready requests cannot continue; unknown requests retain original reconciliation without cancel',async t=>{
 const held={requestId:'request',tipId:'tip',status:'ready',bankMinor:100,connectedFeeMinor:0,sourceHeld:true,canCancel:true,qualificationStatus:'expired_or_revoked'};
 const m=await mount(t,{readSandboxPrefundedTipState:async()=>({sources:[],rows:[held]})});assert.equal(m.button('Continue this test tip payout'),undefined);assert.match(m.text(),/No replacement payout/);
 m.api.readSandboxPrefundedTipState=async()=>({sources:[],rows:[{...held,status:'payout_unknown',canCancel:false}]});await m.press(m.button('Refresh received test tips'));
 assert.ok(m.button('Reconcile this test tip payout'));assert.equal(m.button('Cancel this undispatched test tip request'),undefined);
});
