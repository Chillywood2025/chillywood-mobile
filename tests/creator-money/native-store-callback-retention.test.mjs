import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
import {runKeyedSingleFlight} from '../../_lib/actionSingleFlight.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const A={userId:'a',accountId:'a',sessionGeneration:'one',state:'ACTIVE',restoreOnly:false},B={...A,userId:'b',accountId:'b'};
const load=(path,mocks={},timers={setTimeout,clearTimeout})=>{const out={};new Function('exports','require','__DEV__','setTimeout','clearTimeout',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(out,id=>{assert.ok(id in mocks,'unmodeled '+id);return mocks[id];},false,timers.setTimeout,timers.clearTimeout);return out;};
function fixture(timers){
 let authority=A,sdkUser='a',result;const entered=deferred(),settle=deferred();let purchases=0,restores=0;
 const product={identifier:'one_time',price:1.99,priceString:'$1.99',title:'One time',description:'Content'};
 const info={entitlements:{active:{},all:{}},activeSubscriptions:[],originalAppUserId:'a'};
 result={productIdentifier:'one_time',transaction:{productIdentifier:'one_time',transactionIdentifier:'txn',purchaseDate:'2026-11-08T00:00:00Z',purchaseToken:'secret'},customerInfo:info};
 const purchase=async()=>{purchases++;entered.resolve();await settle.promise;return result;};
 const api=load('_lib/revenuecat.ts',{'expo-application':{applicationId:'com.chillywood.mobile'},'react-native':{Platform:{OS:'android'},Linking:{}},
  'react-native-purchases':{__esModule:true,default:{configure(){},setLogHandler(){},setLogLevel(){},addCustomerInfoUpdateListener(){},getAppUserID:async()=>sdkUser,purchaseStoreProduct:purchase,purchasePackage:purchase,restorePurchases:async()=>{restores++;return info;}},LOG_LEVEL:{ERROR:0},PRODUCT_CATEGORY:{}},
  './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,readCurrentAccountSessionAuthority:async()=>authority,sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&['userId','accountId','sessionGeneration','restoreOnly'].every(k=>a[k]===b[k])},
  './actionSingleFlight.mjs':{runKeyedSingleFlight},'./entitlementAuthority':{withAuthorityReadDeadline:async p=>await p},'./logger':{debugLog(){},reportRuntimeError(){}},
  './runtimeConfig':{getRuntimeConfig:()=>({revenueCat:{androidPublicSdkKey:'goog_fixture',appStorePurchasesEnabled:false}})},
  './revenuecatPurchaseClosure':load('_lib/revenuecatPurchaseClosure.ts'),
  './isolatedTestStoreBuild':{isIsolatedTestStoreFlavor:()=>false},'./isolatedTestStoreV2Build':{isIsolatedTestStoreV2Flavor:()=>false},'./isolatedTestStoreV3Build':{isIsolatedTestStoreV3Flavor:()=>false}},timers);
 return{api,product,entered,settle,change(){authority=B;sdkUser='b';},setResult(v){result=v;},counts:()=>({purchases,restores})};
}
test('actual purchase owner retains immutable original-account whitelist before post-SDK retirement',async()=>{
 const f=fixture(),retained=[];const options={authority:A,retainPurchaseEvidence:async(e,a)=>{retained.push({e,a});assert.ok(Object.isFrozen(e));assert.ok(Object.isFrozen(a));}};
 const pending=f.api.purchaseRevenueCatStoreProduct(f.product,options);const rejected=assert.rejects(pending,/authority/u);await f.entered.promise;
 options.retainPurchaseEvidence=()=>{throw Error('mutated options');};options.authority=B;f.change();f.settle.resolve();await rejected;
 assert.equal(retained.length,1);assert.deepEqual(retained[0].e,{productIdentifier:'one_time',transactionIdentifier:'txn'});assert.deepEqual(retained[0].a,A);
 assert.equal(JSON.stringify(retained).includes('secret'),false);assert.equal(f.counts().purchases,1);
});
test('authority change during durable retention still rejects legacy success but retains evidence first',async()=>{
 const f=fixture(),writing=deferred(),finish=deferred();let persisted;
 const pending=f.api.purchaseRevenueCatPackage({identifier:'pkg',product:f.product},{authority:A,retainPurchaseEvidence:async e=>{writing.resolve();await finish.promise;persisted=e;}});
 const rejected=assert.rejects(pending,/authority/u);await f.entered.promise;f.settle.resolve();await writing.promise;f.change();finish.resolve();await rejected;
 assert.equal(persisted.transactionIdentifier,'txn');assert.equal(f.counts().purchases,1);
});
test('retention failure is reconciliation-required, malformed product cannot persist, restore ignores sink',async()=>{
 const f=fixture();const p=f.api.purchaseRevenueCatStoreProduct(f.product,{authority:A,retainPurchaseEvidence:async()=>{throw Error('disk');}});const rejected=assert.rejects(p,/requires reconciliation: evidence retention unconfirmed/u);await f.entered.promise;f.settle.resolve();await rejected;assert.equal(f.counts().purchases,1);
 const g=fixture();let calls=0;g.setResult({productIdentifier:'wrong',transaction:{productIdentifier:'wrong',transactionIdentifier:'txn'}});const q=g.api.purchaseRevenueCatStoreProduct(g.product,{authority:A,retainPurchaseEvidence:async()=>{calls++;}});const malformed=assert.rejects(q,/requires reconciliation: evidence unavailable/u);await g.entered.promise;g.settle.resolve();await malformed;assert.equal(calls,0);
 await g.api.restoreRevenueCatPurchases({authority:A,retainPurchaseEvidence:async()=>{calls++;}});assert.equal(calls,0);assert.equal(g.counts().restores,1);
});
test('SDK result mutated during retention cannot return a different transaction than retained evidence',async()=>{
 for(const mutate of [r=>r.transaction.transactionIdentifier='other',r=>r.productIdentifier='other',r=>r.transaction.productIdentifier='other',r=>r.transaction=null]){
  const f=fixture(),writing=deferred(),finish=deferred();let retained;
  const result={productIdentifier:'one_time',transaction:{productIdentifier:'one_time',transactionIdentifier:'original'},customerInfo:{entitlements:{active:{},all:{}},activeSubscriptions:[],originalAppUserId:'a'}};f.setResult(result);
  const pending=f.api.purchaseRevenueCatStoreProduct(f.product,{authority:A,retainPurchaseEvidence:async e=>{retained=e;writing.resolve();await finish.promise;}});
  const rejected=assert.rejects(pending,/requires reconciliation: retained evidence changed/u);await f.entered.promise;f.settle.resolve();await writing.promise;mutate(result);finish.resolve();await rejected;
  assert.deepEqual(retained,{productIdentifier:'one_time',transactionIdentifier:'original'});assert.equal(f.counts().purchases,1);
 }
});

test('retention deadline is bounded and late persistence never retries or returns a success',async()=>{
 let fire,cleared=false;const f=fixture({setTimeout(fn,ms){assert.equal(ms,15000);fire=fn;return 7;},clearTimeout(id){assert.equal(id,7);cleared=true;}}),writing=deferred(),finish=deferred();let persisted=false;
 const pending=f.api.purchaseRevenueCatStoreProduct(f.product,{authority:A,retainPurchaseEvidence:async()=>{writing.resolve();await finish.promise;persisted=true;}});
 const rejected=assert.rejects(pending,/requires reconciliation: evidence retention unconfirmed/u);await f.entered.promise;f.settle.resolve();await writing.promise;fire();await rejected;
 assert.equal(cleared,true);assert.equal(persisted,false);finish.resolve();await new Promise(r=>setImmediate(r));assert.equal(persisted,true);assert.equal(f.counts().purchases,1);
});
test('retained transaction identifiers reject invalid scalars, controls, and UTF8 overflow before sink',async()=>{
 for(const txn of ['',' txn','txn\n','x\ud800','x\udfff','x'.repeat(513),'😀'.repeat(129)]){
  const f=fixture();let called=0;f.setResult({productIdentifier:'one_time',transaction:{productIdentifier:'one_time',transactionIdentifier:txn}});
  const pending=f.api.purchaseRevenueCatStoreProduct(f.product,{authority:A,retainPurchaseEvidence:async()=>{called++;}});const rejected=assert.rejects(pending,/requires reconciliation: evidence unavailable/u);
  await f.entered.promise;f.settle.resolve();await rejected;assert.equal(called,0);assert.equal(f.counts().purchases,1);
 }
 const f=fixture();let retained;f.setResult({productIdentifier:'one_time',transaction:{productIdentifier:'one_time',transactionIdentifier:'😀'.repeat(128)}});
 const pending=f.api.purchaseRevenueCatStoreProduct(f.product,{authority:A,retainPurchaseEvidence:async e=>{retained=e;}});const malformed=assert.rejects(pending,/malformed mutation result/u);await f.entered.promise;f.settle.resolve();await malformed;
 assert.equal(retained.transactionIdentifier,'😀'.repeat(128),'valid512-byte evidence survives malformed unrelated SDK customer data');
});
