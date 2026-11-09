import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');const A={userId:'buyer',accountId:'buyer',sessionGeneration:'session',state:'ACTIVE',restoreOnly:false};
const evidence=()=>({schema:'app-transaction-evidence-v1',status:'verified',evidenceScope:'app_only',environment:'SANDBOX',bundleID:'com.chillywood.mobile',signedAppVersion:'1.0',unsignedNativeVersion:'1.0',unsignedNativeBuild:'43',dispatchAllowed:false,providerQualified:false,iapQualified:false,accountQualified:false,exactBuildVerified:false});
function fixture({read=async()=>evidence(),platform='ios',flavor=false}={}){let current=A,calls=0;const listeners=new Set();const bindings={
 'expo-modules-core':{requireOptionalNativeModule:name=>{assert.equal(name,'ChillywoodTestStoreAdmission');return{readAppTransactionEvidence:()=>{calls++;return read();}};}},
 'react-native':{Platform:{OS:platform}},'./accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>current,sameAccountSessionAuthority:(a,b)=>JSON.stringify(a)===JSON.stringify(b),subscribeToAccountSessionAuthority:f=>{listeners.add(f);return()=>listeners.delete(f);}},
 './entitlementAuthority':{withAuthorityReadDeadline:async(p,fallback)=>{let t;try{return await Promise.race([p,new Promise(r=>{t=setTimeout(()=>r(fallback),20);})]);}finally{clearTimeout(t);}}},
 './isolatedTestStoreBuild':{isIsolatedTestStoreFlavor:()=>flavor},'./isolatedTestStoreV2Build':{isIsolatedTestStoreV2Flavor:()=>false},'./isolatedTestStoreV3Build':{isIsolatedTestStoreV3Flavor:()=>false},
 './creatorMoneyStoreQuote':{},'./nativeStoreSandboxQuote':{},'./revenuecat':new Proxy({},{get(){assert.fail('app evidence must not use RevenueCat');}})};
 const scope={exports:{},require:name=>{assert.ok(Object.hasOwn(bindings,name));return bindings[name];}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../../_lib/nativeStoreSandboxProduct.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,scope);
 return{read:()=>scope.exports.readNativeSandboxAppEvidence(A),calls:()=>calls,listeners,change(v){current=v;listeners.forEach(f=>f(v));}};
}
test('explicit app evidence is whitelisted and immutable, never IAP/account/build qualification',async()=>{
 for(const environment of ['SANDBOX','PRODUCTION','XCODE']){const raw={...evidence(),environment};const f=fixture({read:async()=>raw});assert.equal(f.calls(),0);const r=await f.read();assert.equal(r.status,'observed');assert.equal(r.dispatchAllowed,false);assert.equal(r.providerQualified,false);assert.equal(r.evidence.environment,environment);assert.equal(r.evidence.exactBuildVerified,false);raw.environment='changed';assert.equal(r.evidence.environment,environment);assert.ok(Object.isFrozen(r.evidence));assert.equal(f.listeners.size,0);}
});
test('malformed or permission-claiming native values fail closed without exporting them',async()=>{
 for(const patch of [{dispatchAllowed:true},{providerQualified:true},{exactBuildVerified:true},{accountQualified:true},{iapQualified:true},{bundleID:'other'},{status:'unverified'},{signedAppVersion:''},{environment:'future'},{receipt:'secret'},{unsignedNativeBuild:99}]){const f=fixture({read:async()=>({...evidence(),...patch})});const r=await f.read();assert.equal(r.status,'unavailable');assert.equal(r.evidence,null);assert.equal(r.dispatchAllowed,false);}
 for(const options of [{platform:'android'},{platform:'web'},{flavor:true}]){const f=fixture(options);assert.equal((await f.read()).status,'unavailable');assert.equal(f.calls(),0);}
});
test('native app read is bounded and permanently retires on any account gap',async()=>{
 const hung=fixture({read:()=>new Promise(()=>{})});assert.equal((await hung.read()).status,'unavailable');assert.equal(hung.listeners.size,0);
 let resolve;const p=new Promise(r=>{resolve=r;});const f=fixture({read:()=>p}),pending=f.read();f.change(null);f.change(A);resolve(evidence());assert.equal((await pending).status,'unavailable');assert.equal(f.listeners.size,0);
 const failed=fixture({read:async()=>{throw Error('private-native-error');}});assert.equal(JSON.stringify(await failed.read()).includes('private'),false);
});
