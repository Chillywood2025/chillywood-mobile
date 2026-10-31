import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync('_lib/openCreatorExternalCheckout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(options={}){
 let authority={userId:'buyer',sessionGeneration:'one'},visible=true;const calls=[],exports={};
 const imports={
 'react-native':{Platform:{OS:options.platform??'ios'},Linking:{openURL:async url=>calls.push(['open',url])}},
 './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>a?.userId===b?.userId&&a?.sessionGeneration===b?.sessionGeneration},
 './accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async()=>({authority:{...authority}})},
 './iosExternalAdmission':{assertIosExternalStorefront:async subject=>{calls.push(['storefront',subject.authority.userId]);await options.storefront?.();}},
 };vm.runInNewContext(code,{exports,require:n=>{assert.ok(n in imports,n);return imports[n];},URL});
 return {calls,open:(url='https://checkout.stripe.com/c/pay/test')=>exports.openCreatorExternalCheckout(url,()=>visible),close:()=>{visible=false;},switch:()=>{authority={userId:'other',sessionGeneration:'two'};}};
}
test('production browser launcher checks fresh iOS storefront immediately before opening; Android never falls back',async()=>{
 const h=harness();await h.open();assert.deepEqual(h.calls.map(c=>c[0]),['storefront','open']);
 const android=harness({platform:'android'});await assert.rejects(android.open(),/native Google Play/);assert.equal(android.calls.length,0);
 const web=harness({platform:'web'});await web.open();assert.deepEqual(web.calls.map(c=>c[0]),['open']);
});
test('storefront denial, unsafe links, close/back and account changes cannot open a delayed browser',async()=>{
 const denied=harness({storefront:()=>{throw Error('non-US or unavailable SDK');}});await assert.rejects(denied.open());assert.equal(denied.calls.some(c=>c[0]==='open'),false);
 for(const action of ['close','switch']){let release;const wait=new Promise(r=>{release=r;});const h=harness({storefront:()=>wait});const pending=h.open();await new Promise(r=>setImmediate(r));h[action]();release();await assert.rejects(pending);assert.equal(h.calls.some(c=>c[0]==='open'),false);}
 const bad=harness();await assert.rejects(bad.open('https://example.com/pay/test'));assert.equal(bad.calls.length,0);
});
