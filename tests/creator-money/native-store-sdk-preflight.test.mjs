import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const A={userId:'buyer',accountId:'buyer',sessionGeneration:'session',state:'ACTIVE',restoreOnly:false};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function fixture({identity=async()=>A.userId,payments=async()=>true,products=async()=>[{identifier:'sku',price:1.99,currencyCode:'USD'}]}={}){
 let current=A,productReads=0;const listeners=new Set();
 const quote={creatorId:'creator',amountMinor:199,currency:'usd',catalog:{store:'APP_STORE',wireProductId:'sku'}};
 const bindings={
  'expo-modules-core':{requireOptionalNativeModule:()=>null},
  'react-native':{Platform:{OS:'ios'}},
  './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>current,sameAccountSessionAuthority:(a,b)=>JSON.stringify(a)===JSON.stringify(b),subscribeToAccountSessionAuthority:f=>{listeners.add(f);return()=>listeners.delete(f);}},
  './entitlementAuthority':{withAuthorityReadDeadline:async(p,fallback)=>{let timer;try{return await Promise.race([p,new Promise(r=>{timer=setTimeout(()=>r(fallback),25);})]);}finally{clearTimeout(timer);}}},
  './creatorMoneyStoreQuote':{isCreatorMoneyStoreQuoteMatch:(p,q)=>p.identifier===q.productId&&p.price===1.99&&p.currencyCode==='USD'},
  './isolatedTestStoreBuild':{isIsolatedTestStoreFlavor:()=>false},'./isolatedTestStoreV2Build':{isIsolatedTestStoreV2Flavor:()=>false},'./isolatedTestStoreV3Build':{isIsolatedTestStoreV3Flavor:()=>false},
  './nativeStoreSandboxQuote':{validNativeSandboxQuote:q=>q===quote},
  './revenuecat':{getRevenueCatAppUserId:identity,canMakeRevenueCatPurchases:payments,readRevenueCatNonSubscriptionProducts:async ids=>{productReads++;assert.deepEqual([...ids],['sku']);return products();}},
 };
 const scope={exports:{},require:name=>{assert.ok(Object.hasOwn(bindings,name));return bindings[name];}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../../_lib/nativeStoreSandboxProduct.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,scope);
 return{read:()=>scope.exports.readNativeSandboxDeviceProduct(A,quote),reads:()=>productReads,change:v=>{current=v;listeners.forEach(f=>f(v));},listeners};
}
test('existing SDK owner identity and payment capability are required reads, never no-charge permission',async()=>{
 for(const [options,reason] of [[{identity:async()=>''},'sdk_account_unavailable'],[{identity:async()=>'other'},'sdk_account_unavailable'],[{payments:async()=>false},'payments_unavailable']]){
  const f=fixture(options),r=await f.read();assert.equal(r.status,'unavailable');assert.equal(r.reason,reason);assert.equal(f.reads(),0);assert.equal(r.dispatchAllowed,false);assert.equal(r.environmentVerified,false);assert.equal(f.listeners.size,0);
 }
 let ids=0;const f=fixture({identity:async()=>{ids++;return A.userId;}}),r=await f.read();assert.equal(ids,2);assert.equal(f.reads(),1);assert.equal(r.status,'matched');assert.equal(r.dispatchAllowed,false);assert.equal(r.environmentVerified,false);
});
test('post-catalog SDK identity mismatch and account gaps retire successful catalog results',async()=>{
 let n=0;const mismatch=fixture({identity:async()=>++n===1?A.userId:'other'});assert.equal((await mismatch.read()).reason,'sdk_account_unavailable');assert.equal(mismatch.reads(),1);
 const gate=deferred(),f=fixture({identity:()=>gate.promise}),pending=f.read();f.change({...A,sessionGeneration:'new'});f.change(A);gate.resolve(A.userId);
 assert.equal((await pending).status,'unavailable');assert.equal(f.reads(),0);assert.equal(f.listeners.size,0);
});
test('hung SDK capability or identity reads are bounded and cannot start catalog or purchase work',async()=>{
 for(const options of [{identity:()=>new Promise(()=>{})},{payments:()=>new Promise(()=>{})}]){
  const f=fixture(options),r=await f.read();assert.equal(r.status,'unavailable');assert.equal(f.reads(),0);assert.equal(f.listeners.size,0);assert.equal(r.dispatchAllowed,false);
 }
});
