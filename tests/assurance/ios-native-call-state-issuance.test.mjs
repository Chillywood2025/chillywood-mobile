import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {createCallDispatchHarness} from './helpers/chat-call-dispatch-handler-harness.mjs';
const pushes=h=>h.events.filter(e=>e.kind==='http'&&e.url.includes('push.apple.com'));
for(const flag of [undefined,'false','1','TRUE'])test(`flag ${flag} preserves original incoming payload without issuing observer`,async()=>{
  const h=createCallDispatchHarness({presentationReceipt:true,env:{IOS_NATIVE_CALL_STATE_OBSERVER_ENABLED:flag}});
  const result=await h.dispatch(undefined,{ios:true});
  assert.equal(result.body.status,'sent');assert.equal(pushes(h).length,1);
  assert.equal(pushes(h)[0].body.stateObserverCapability,undefined);
  assert.equal(h.events.filter(e=>e.name==='whole_app_issue_ios_call_state_observer').length,0);
});
for(const failure of ['throw','held','error','denied','mismatch'])test(`${failure} optional issuance preserves incoming CallKit payload and original deadline`,async()=>{
  const h=createCallDispatchHarness({presentationReceipt:true,observerIssue:failure,env:{IOS_NATIVE_CALL_STATE_OBSERVER_ENABLED:'true'}});
  const result=await h.dispatch(undefined,{ios:true});
  assert.equal(result.body.status,'sent');assert.equal(pushes(h).length,1);
  assert.equal(pushes(h)[0].body.action,'incoming');assert.equal(pushes(h)[0].body.stateObserverCapability,undefined);
  assert.equal(pushes(h)[0].headers['apns-expiration'],'0');
  assert.equal(pushes(h)[0].body.callUuid,h.ids.invite);
});
test('explicitly enabled proposal issues independent immutable capability; existing duplicate prevents reissue',async()=>{
  const h=createCallDispatchHarness({presentationReceipt:true,env:{IOS_NATIVE_CALL_STATE_OBSERVER_ENABLED:'true'}});
  const first=await h.dispatch(undefined,{ios:true});assert.equal(first.body.status,'sent');
  const push=pushes(h)[0].body;
  assert.match(push.stateObserverCapability,/^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(push.stateObserverCapability,push.presentationAckToken);
  assert.equal(push.stateObserverVersion,1);
  assert.equal(push.stateObserverExpiresAtMillis,String(Date.parse(push.expiresAt)));
  assert.equal(new URL(push.stateObserverUrl).protocol,'wss:');
  const issued=h.events.find(e=>e.name==='whole_app_issue_ios_call_state_observer').parameters;
  assert.equal(issued.p_capability_hash,createHash('sha256').update(push.stateObserverCapability).digest('hex'));
  assert.equal(issued.p_issuance_id,push.stateObserverId);assert.equal(issued.p_attempt_count,1);
  assert.equal(JSON.stringify(issued).includes(push.stateObserverCapability),false,'only a hash enters durable SQL');
  await h.dispatch(undefined,{ios:true});
  assert.equal(pushes(h).length,1);assert.equal(h.events.filter(e=>e.name==='whole_app_issue_ios_call_state_observer').length,1);
});
