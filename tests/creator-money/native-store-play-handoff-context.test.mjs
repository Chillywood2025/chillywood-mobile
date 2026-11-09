import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const A={userId:'buyer',accountId:'buyer',sessionGeneration:'session',state:'ACTIVE',restoreOnly:false};
function fixture({platform='android',state='active',flavor=false,packageName='com.chillywood.mobile'}={}){
 const listeners=new Set(),Application={applicationId:packageName,nativeBuildVersion:'43',nativeApplicationVersion:'1.0'};let authority=A;
 const AppState={currentState:state,addEventListener(event,fn){assert.equal(event,'change');listeners.add(fn);return{remove(){listeners.delete(fn);}};}};
 const bindings={'react-native':{Platform:{OS:platform},AppState},'expo-application':Application,
  './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>JSON.stringify(a)===JSON.stringify(b)},
  './isolatedTestStoreBuild':{isIsolatedTestStoreFlavor:()=>flavor},'./isolatedTestStoreV2Build':{isIsolatedTestStoreV2Flavor:()=>false},'./isolatedTestStoreV3Build':{isIsolatedTestStoreV3Flavor:()=>false},
  './nativeStoreSandboxQuote':{NativeSandboxQuoteError:class extends Error{}}};
 const scope={exports:{},require:n=>{assert.ok(Object.hasOwn(bindings,n),n);return bindings[n];}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../../_lib/nativeStorePlayTestHandoff.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,scope);
 return{capture:()=>scope.exports.captureNativePlayTestSheetContext(A),Application,listeners,change(v){authority=v;},state(v){AppState.currentState=v;listeners.forEach(fn=>fn(v));}};
}
test('Play local context is unsigned lifecycle/build restriction, never automatic no-charge evidence',()=>{
 const f=fixture(),c=f.capture();assert.equal(c.nativeBuild,'43');assert.equal(c.nativeVersion,'1.0');assert.equal(c.automaticNoChargeProof,false);assert.equal(f.listeners.size,1);c.assertCurrent();c.dispose();assert.equal(f.listeners.size,0);assert.throws(c.assertCurrent);
});
test('wrong platform, package, background, debug flavor and missing build cannot enter Play handoff',()=>{
 for(const opts of [{platform:'ios'},{state:'background'},{flavor:true},{packageName:'com.chillywood.mobile.teststoredebugv3'}]){const f=fixture(opts);assert.throws(f.capture);assert.equal(f.listeners.size,0);}
 const f=fixture();f.Application.nativeBuildVersion=null;assert.throws(f.capture);
});
test('background permanently retires the pre-launch context and changed account/build fails closed',()=>{
 const f=fixture(),c=f.capture();f.state('background');f.state('active');assert.throws(c.assertCurrent);c.dispose();
 const g=fixture(),d=g.capture();g.change({...A,userId:'other'});assert.throws(d.assertCurrent);d.dispose();
 const h=fixture(),e=h.capture();h.Application.nativeBuildVersion='44';assert.throws(e.assertCurrent);e.dispose();
});
