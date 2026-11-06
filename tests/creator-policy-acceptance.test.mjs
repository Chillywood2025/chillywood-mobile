import assert from 'node:assert/strict';
import test from 'node:test';
import { createPolicyHarness, loadPolicyModule, policyAuthority, policyReadback, deferredPolicy } from './helpers/creator-policy-runtime.mjs';
const consent = { creatorTerms: true, moneyTerms: true };
const writes = state => state.calls.filter(call => call.name === 'wave1_accept_legal_documents');
const settle = async () => { for (let i=0;i<20;i++) await Promise.resolve(); };

test('real creator helper uses current bundled versions, explicit separate consent, pinned token, exact identity and authoritative receipt', async () => {
  const {api,state,legal}=createPolicyHarness(), a=state.authority;
  const displayed=await api.readCreatorPolicyRequirements(a);
  assert.equal(legal.legalRequirementsAreCurrent(displayed,a),false);
  for(const bad of [{...consent,creatorTerms:false},{...consent,moneyTerms:false},{...consent,creatorTerms:'true'}]) await assert.rejects(api.acceptCreatorPolicies(a,displayed,bad),/explicit_consent/);
  assert.equal(writes(state).length,0);
  const result=await api.acceptCreatorPolicies(a,displayed,consent);
  assert.equal(legal.legalRequirementsAreCurrent(result,a),true);
  const [write]=writes(state);
  assert.equal(write.options.retainTransportSettlement,true);
  assert.equal(write.subject.accessToken,`synthetic:${a.userId}:${a.sessionGeneration}`);
  assert.deepEqual(write.args,{p_acceptances:legal.buildLegalAcceptancePayload(displayed),p_market:'UNITED_STATES',p_capability:'creator_money',p_expected_user_id:a.userId,p_expected_account_id:a.accountId,p_session_generation:a.sessionGeneration});
  assert.ok(state.calls.findIndex(c=>c===write)>state.calls.findIndex(c=>c.name==='wave1_legal_requirements_readback'));
});
test('missing, malformed, unaccepted account, stale version and wrong session documents fail closed before consent', async () => {
  for(const mutate of [r=>null,r=>({...r,capability:'payout'}),r=>({...r,sessionGeneration:'other'}),r=>({...r,accountId:'other'}),
    r=>({...r,requirements:r.requirements.slice(1)}),r=>({...r,requirements:r.requirements.map((x,i)=>i===0?{...x,accepted:false,state:'REQUIRED_UNACCEPTED',acceptedAt:null}:x)}),
    r=>({...r,requirements:r.requirements.map(x=>({...x,version:'unbundled'}))})]) {
    const {api,state}=createPolicyHarness(); state.readOverride={data:mutate(policyReadback(state.authority)),error:null};
    await assert.rejects(api.readCreatorPolicyRequirements(state.authority));
    await assert.rejects(api.acceptCreatorPolicies(state.authority,policyReadback(state.authority),consent));
    assert.equal(writes(state).length,0);
  }
});
for(const stage of ['capture','read']) for(const change of ['cancel','account','session','closed']) test(`${change} while ${stage} is pending cannot dispatch acceptance`, async()=>{
  const {api,state}=createPolicyHarness(), a=state.authority, held=deferredPolicy();
  state[`${stage}Hold`]=held.promise; let current=true;
  const pending=api.acceptCreatorPolicies(a,policyReadback(a),consent,()=>current); await settle();
  if(change==='cancel') current=false;
  if(change==='account') state.authority=policyAuthority('other','other');
  if(change==='session') state.authority=policyAuthority('other');
  if(change==='closed') state.authority={...a,restoreOnly:true};
  held.resolve(); await assert.rejects(pending,/changed|retired|unavailable/); assert.equal(writes(state).length,0);
});
test('one account acceptance lock survives cancellation and session replacement until transport actually settles',async()=>{
  const {api,state}=createPolicyHarness(),a=state.authority,held=deferredPolicy();state.writeHold=held.promise;let current=true;
  const pending=api.acceptCreatorPolicies(a,policyReadback(a),consent,()=>current);await settle();current=false;
  await assert.rejects(api.acceptCreatorPolicies(a,policyReadback(a),consent),/pending/);
  const next=policyAuthority('new');await assert.rejects(api.acceptCreatorPolicies(next,policyReadback(next),consent),/pending/);
  assert.equal(writes(state).length,1);held.resolve();assert.equal((await pending).requirements.every(x=>x.accepted),true,'cancel after dispatch is not a revocation claim');
});
test('RPC rejection, ambiguous failure and invalid receipt never report accepted',async()=>{
  for(const writeOverride of [{data:null,error:{message:'network outcome unknown'}},{data:policyReadback(policyAuthority()),error:null},{data:policyReadback(policyAuthority('other'),true),error:null}]) {
    const {api,state}=createPolicyHarness({writeOverride});await assert.rejects(api.acceptCreatorPolicies(state.authority,policyReadback(state.authority),consent));
    assert.equal(writes(state).length,1);
  }
});
test('real account-bound transport does not release legal acceptance on a display deadline',async()=>{
  const h=createPolicyHarness(),held=deferredPolicy();let deadlines=0,settled=false,request;
  const actual=loadPolicyModule('_lib/accountBoundSupabaseMutation.ts',{
    './accountSessionAuthority':h.authority,
    './accountBoundSupabaseRpc.mjs':{invokeAccountBoundSupabaseRpc:args=>{request=args;return held.promise;}},
    './entitlementAuthority':{withAuthorityReadDeadline:async(_promise,fallback)=>{deadlines++;return fallback;}},
    './supabase':{SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'synthetic',supabase:{}},
    'react-native':{Platform:{OS:'ios'}},
  });
  const subject={authority:h.state.authority,accessToken:'synthetic-pinned-token'};
  const pending=actual.invokeAccountBoundSupabaseMutationRpc(subject,'wave1_accept_legal_documents',{}, {retainTransportSettlement:true}).then(result=>{settled=true;return result;});
  await settle();assert.equal(settled,false);assert.equal(deadlines,0);assert.equal(request.accessToken,subject.accessToken);
  held.resolve({data:policyReadback(h.state.authority,true),error:null});assert.equal((await pending).error,null);assert.equal(settled,true);
});
