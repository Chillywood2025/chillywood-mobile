import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compiled=ts.transpileModule(fs.readFileSync('_lib/googlePlayExternalAdmission.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
test('actual Google admission helper carries selected binding and rejects substituted route or switched session',async()=>{
 const capabilityId='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 let authority={userId:'buyer',sessionGeneration:'one'},returned=capabilityId;
 const subject={authority:{...authority}},calls=[],module={exports:{}};
 new Function('exports','module','require',compiled)(module.exports,module,name=>{
  if(name==='./accountSessionAuthority')return {getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>a.userId===b.userId&&a.sessionGeneration===b.sessionGeneration};
  if(name==='./accountBoundSupabaseMutation')return {invokeAccountBoundSupabaseMutationRpc:async(_s,name,args)=>{calls.push({name,args});return {error:null,data:{capabilityId:returned,expiresAt:'2099-01-01T00:00:00Z',verification:'native_sdk_observation_unverified',financialAuthority:false,accessGranted:false}};}};
  throw Error(name);
 });
 const input={feature:'creator_tip',creatorId:'creator',amountMinor:299,sourceId:'action',capabilityId},native={google_play_external_transaction_token:'synthetic-token',google_play_external_link_api_version:1};
 assert.equal(await module.exports.admitGooglePlayExternalCheckout(subject,input,native),capabilityId);
 assert.equal(calls[0].args.p_capability_id,capabilityId);assert.equal(calls[0].args.p_source_id,'action');
 returned=other;await assert.rejects(()=>module.exports.admitGooglePlayExternalCheckout(subject,input,native));
 authority={...authority,sessionGeneration:'two'};await assert.rejects(()=>module.exports.admitGooglePlayExternalCheckout(subject,input,native));assert.equal(calls.length,2);
});
