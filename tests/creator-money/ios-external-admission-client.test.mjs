import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness(options={}) {
  let authority={userId:'buyer',sessionGeneration:'one',restoreOnly:options.restoreOnly??false};
  const subject={authority:{...authority}},calls=[];
  const exports={};
  const dependencies={
    'react-native':{Platform:{OS:options.platform??'ios'}},
    'react-native-purchases':{default:{getStorefront:async()=>{calls.push('storefront');return options.read?options.read():{countryCode:options.country??'USA'};}}},
    './accountBoundSupabaseMutation':{invokeAccountBoundSupabaseMutationRpc:async(_s,name,args)=>{calls.push({name,args});return options.rpc?options.rpc():{error:null,data:{capabilityId:'11111111-1111-4111-8111-111111111111',expiresAt:'2099-01-01T00:00:00Z',verification:'native_storefront_observation_unverified',financialAuthority:false,accessGranted:false}};}},
    './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>a?.userId===b?.userId&&a?.sessionGeneration===b?.sessionGeneration},
    './entitlementAuthority':{withAuthorityReadDeadline:async(p,fallback)=>options.timeout?fallback:p},
    './revenuecat':{configureRevenueCatOnce:()=>({shouldConfigure:!options.unconfigured,mode:'ios-release'}),syncRevenueCatCustomerIdentity:async()=>({status:'identified',matchesSourceUser:!options.wrongIdentity,sourceUserId:'buyer',appUserId:'buyer'})},
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/iosExternalAdmission.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>{assert.ok(name in dependencies,name);return dependencies[name];},Date,Error});
  return {api:exports,subject,calls,switch:()=>{authority={...authority,userId:'other'};}};
}
const input={feature:'creator_tip',creatorId:'creator',sourceId:'request',amountMinor:237};
test('iOS admission transports exact selected capability and rejects a different returned route',async()=>{
 const capabilityId='11111111-1111-4111-8111-111111111111',h=harness();
 await h.api.admitIosExternalCheckout(h.subject,{...input,capabilityId});
 assert.equal(h.calls.find(c=>typeof c==='object').args.p_capability_id,capabilityId);
 await assert.rejects(()=>h.api.admitIosExternalCheckout(h.subject,{...input,capabilityId:'22222222-2222-4222-8222-222222222222'}));
});
test('actual iOS helper reads fresh SDK storefront for admission and every launch check',async()=>{
  const h=harness();await h.api.admitIosExternalCheckout(h.subject,input);await h.api.assertIosExternalStorefront(h.subject);
  assert.equal(h.calls.filter(c=>c==='storefront').length,2);
  const rpc=h.calls.find(c=>typeof c==='object');assert.equal(rpc.name,'admit_ios_external_session');
  assert.equal(rpc.args.p_country_code,'USA');assert.equal(rpc.args.p_source_id,'request');assert.equal(rpc.args.p_amount_minor,237);
  assert.equal('p_storefront_id' in rpc.args,false,'installed SDK does not expose a numeric storefront identifier');
});
test('nonUS unknown timedout and unconfigured storefront cannot reach admission',async()=>{
  for(const options of [{country:'CAN'},{country:'US'},{read:async()=>null},{read:async()=>({})},{read:async()=>({countryCode:123})},{timeout:true},{unconfigured:true},{wrongIdentity:true},{platform:'android'},{restoreOnly:true}]){
    const h=harness(options);await assert.rejects(()=>h.api.admitIosExternalCheckout(h.subject,input));
    assert.equal(h.calls.some(c=>typeof c==='object'),false);
  }
});
test('denied malformed expired or payment-authority admission never becomes a qualified route',async()=>{
  const valid={capabilityId:'11111111-1111-4111-8111-111111111111',expiresAt:'2099-01-01T00:00:00Z',verification:'native_storefront_observation_unverified',financialAuthority:false,accessGranted:false};
  for(const response of [{error:Error('denied'),data:valid},{error:null,data:null},
    ...[{capabilityId:'invalid'},{expiresAt:'invalid'},{expiresAt:'2000-01-01T00:00:00Z'},
      {verification:'apple_verified'},{financialAuthority:true},{accessGranted:true}].map(change=>({error:null,data:{...valid,...change}}))]) {
    const h=harness({rpc:async()=>response});await assert.rejects(()=>h.api.admitIosExternalCheckout(h.subject,input));
  }
});
test('admission completion cannot cross an account replacement',async()=>{
  let resolve;const pending=new Promise(r=>{resolve=r;});const h=harness({rpc:()=>pending});
  const run=h.api.admitIosExternalCheckout(h.subject,input);await new Promise(r=>setImmediate(r));h.switch();
  resolve({error:null,data:{capabilityId:'11111111-1111-4111-8111-111111111111',expiresAt:'2099-01-01T00:00:00Z',verification:'native_storefront_observation_unverified',financialAuthority:false,accessGranted:false}});
  await assert.rejects(run);
});
test('late StoreKit result after account change cannot admit or authorize launch',async()=>{
  let resolve;const pending=new Promise(r=>{resolve=r;});const h=harness({read:()=>pending});
  const run=h.api.admitIosExternalCheckout(h.subject,input);await new Promise(r=>setImmediate(r));h.switch();
  resolve({countryCode:'USA'});await assert.rejects(run);assert.equal(h.calls.some(c=>typeof c==='object'),false);
});
