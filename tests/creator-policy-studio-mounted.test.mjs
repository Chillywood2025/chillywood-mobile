import assert from 'node:assert/strict';
import test from 'node:test';
import { mount } from './platform-studio-mounted-harness.mjs';
import { createPolicyHarness, policyAuthority } from './helpers/creator-policy-runtime.mjs';

test('production Money Center exposes consent before legal eligibility and refreshes parent status after the real helper accepts',async t=>{
  const helper=createPolicyHarness({authority:policyAuthority('first','owner')});
  let eligibility,declared=false;
  const readback=()=>({declaration:declared?{regionCode:'CA',declaredAt:'2026-11-06T00:00:00Z'}:null,
    pending:helper.state.accepted?['Tax information','Sanctions review']:['Current creator and money terms'],
    eligibility:eligibility.parseCreatorEligibilityReadback({...helper.state.authority,state:helper.state.accepted?'PENDING_VERIFICATION':'INELIGIBLE',
      authoritative:true,authoritySource:'automatic_eligibility',accountStatus:'ACTIVE',moderationState:'CLEAR',
      age18Plus:declared,market:'UNITED_STATES',creatorRole:true,legalAccepted:helper.state.accepted,platformCapability:true,
      rolloutEligible:true,taxComplete:null,sanctionsClear:null,providerEligible:null,payoutEligible:null,kycComplete:null,
      canCreateMoneyExposure:false,canProcessHistoricalObligations:true,minimumAge:18,rollout:'AUTOMATIC_PREMIUM_UNITED_STATES',
      version:1,evaluatedAt:'2026-11-06T00:00:00Z',sandboxCapability:{environment:'sandbox',financialAuthority:false,canUseCreatorTools:declared&&helper.state.accepted}},helper.state.authority),
  });
  const h=await mount(t,{route:{tab:'monetization'},overrides:{
    readCreatorPolicyRequirements:helper.api.readCreatorPolicyRequirements,acceptCreatorPolicies:helper.api.acceptCreatorPolicies,
    readCreatorEligibilityDeclaration:async()=>readback(),
    saveCreatorEligibilityDeclaration:async()=>{declared=true;return readback();},
  }});
  eligibility=h.creatorEligibility;
  const control=id=>h.find(n=>n.props.testID===`creator-declaration-${id}`);
  assert.ok(control('refresh'),'Premium reaches Overview before creator legal eligibility');
  assert.equal(control('accept-terms').props.disabled,true);
  await h.press(control('adult'));await h.press(control('us'));await h.change(control('region'),'CA');await h.press(control('save'));
  assert.equal(helper.state.accepted,false,'declaration is not consent');assert.match(h.text(),/Current creator and money terms/);
  await h.press(control('creator-terms'));await h.press(control('money-terms'));
  const refreshes=h.calls.filter(c=>c[0]==='listMyCreatorSandboxMonetizationConfigs').length;
  await h.press(control('accept-terms'));
  assert.equal(helper.state.calls.filter(c=>c.name==='wave1_accept_legal_documents').length,1);
  assert.match(h.text(),/Sandbox creator tools ready; live verification pending/);
  assert.match(h.text(),/Tax information, Sanctions review/);
  assert.ok(h.calls.filter(c=>c[0]==='listMyCreatorSandboxMonetizationConfigs').length>refreshes,'parent config/status re-read');
  assert.equal(control('accept-terms').props.disabled,true);
});
