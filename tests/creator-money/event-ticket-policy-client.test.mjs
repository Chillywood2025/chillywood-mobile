import assert from 'node:assert/strict';
import test from 'node:test';
import {client,deferred,ids,policy} from './event-ticket-policy-fixture.mjs';

test('ticket policy reader binds the exact account, event and library purchase',async()=>{
  const h=client(),r=await h.api.readEventTicketPolicy(ids.event,ids.purchase);
  assert.equal(r.status,'resolved');assert.equal(r.subjectUserId,ids.buyer);assert.equal(r.subjectSessionGeneration,'one');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].args)),{p_creator_event_id:ids.event,p_purchase_id:ids.purchase});
  assert.equal(h.calls[0].name,'read_my_creator_event_ticket_policy');
});
test('choices bind an exact revision and never invoke a payment provider',async()=>{
  for(const choice of ['keep_ticket','request_refund_review']){
    const h=client();assert.equal((await h.api.respondToEventSchedule(ids.event,ids.purchase,ids.revision,choice)).status,'resolved');
    assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,'respond_creator_event_schedule_change');
    assert.equal(h.calls[0].args.p_expected_revision_id,ids.revision);assert.equal(h.calls[0].args.p_choice,choice);
  }
});
test('invalid identifiers, implicit consent, restore-only and retired capture dispatch no RPC',async()=>{
  const h=client();await h.api.readEventTicketPolicy('invalid',ids.purchase);
  await h.api.respondToEventSchedule(ids.event,ids.purchase,ids.revision,'accept_all');
  await h.api.respondToEventSchedule(ids.event,ids.purchase,'current','keep_ticket');assert.equal(h.calls.length,0);
  h.setAuthority({userId:ids.buyer,sessionGeneration:'one',restoreOnly:true});await h.api.readEventTicketPolicy(ids.event,ids.purchase);assert.equal(h.calls.length,0);
  const stale=client({captured:{userId:ids.buyer,sessionGeneration:'retired'}});await stale.api.readEventTicketPolicy(ids.event,ids.purchase);assert.equal(stale.calls.length,0);
});
test('wrong identities, fabricated refund completion, bad schedule and malformed history fail closed',async()=>{
  const h=client();
  for(const change of [{eventId:ids.other},{purchaseId:ids.other},{buyerId:ids.other},{currentRevision:{...policy().currentRevision,timeZone:'made/up'}},
    {currentRevision:{...policy().currentRevision,startsAt:'infinity'}},{currentRevision:{...policy().currentRevision,endsAt:'2026-01-01T00:00:00Z'}},
    {refundEligibility:{...policy().refundEligibility,status:'refunded'}},{history:[{revisionId:'current',choice:'keep_ticket',createdAt:'2026-10-27T10:00:00Z'}]},
    {notice:{id:'not-an-id',createdAt:'now'}},{choiceRequired:'false'}]){
    assert.equal(h.api.parseEventTicketPolicy(policy(change),ids.event,ids.purchase,ids.buyer),null,JSON.stringify(change));
  }
  assert.ok(h.api.parseEventTicketPolicy(policy({originalSchedule:null,purchaseIntentId:null}),ids.event,ids.purchase,ids.buyer),'historical missing terms remain explicit');
});
test('account or same-account session change suppresses in-flight read and choice results',async()=>{
  for(const mutation of [false,true])for(const userId of [ids.buyer,ids.other]){
    const pending=deferred(),h=client({rpc:()=>pending.promise});
    const operation=mutation?h.api.respondToEventSchedule(ids.event,ids.purchase,ids.revision,'keep_ticket'):h.api.readEventTicketPolicy(ids.event,ids.purchase);
    await Promise.resolve();h.setAuthority({userId,sessionGeneration:'two',restoreOnly:false});pending.resolve({data:policy(),error:null});
    assert.equal((await operation).status,'unavailable');
  }
});
test('choice history requires the exact immutable schedule rather than filling from the current revision',()=>{
  const h=client(),entry={revisionId:ids.other,choice:'keep_ticket',createdAt:'2026-10-27T11:00:00Z'};
  for(const historicalSchedule of [undefined,null,{...policy().originalSchedule,timeZone:'unknown/zone'},
    {...policy().originalSchedule,endsAt:'2020-01-01T00:00:00Z'}]){
    assert.equal(h.api.parseEventTicketPolicy(policy({history:[{...entry,schedule:historicalSchedule}]}),ids.event,ids.purchase,ids.buyer),null);
  }
  const parsed=h.api.parseEventTicketPolicy(policy({history:[{...entry,schedule:policy().originalSchedule}]}),ids.event,ids.purchase,ids.buyer);
  assert.ok(parsed);assert.equal(parsed.history[0].schedule.startsAt,policy().originalSchedule.startsAt);
  assert.notEqual(parsed.history[0].schedule.startsAt,parsed.currentRevision.startsAt);
});
test('ticket policy recognizes missed promised replay review without accepting unknown or completed-refund claims',()=>{
  const h=client(),eligibility={...policy().refundEligibility,reasons:['event_replay_unavailable']};
  const parsed=h.api.parseEventTicketPolicy(policy({choiceRequired:false,refundEligibility:eligibility}),ids.event,ids.purchase,ids.buyer);
  assert.ok(parsed);assert.equal(parsed.refundEligibility.reasons[0],'event_replay_unavailable');
  assert.equal(parsed.refundEligibility.status,'provider_review_required');assert.equal(parsed.refundEligibility.createdAt,eligibility.createdAt);
  for(const bad of [{...eligibility,reasons:['replay_refund_guaranteed']},{...eligibility,reasons:['event_replay_unavailable','unknown_reason']},{...eligibility,status:'refunded'}]){
    assert.equal(h.api.parseEventTicketPolicy(policy({refundEligibility:bad}),ids.event,ids.purchase,ids.buyer),null);
  }
});
test('timeout, stale revision rejection and malformed response never report acceptance or retry automatically',async()=>{
  for(const result of [{data:null,error:{message:'account_bound_rpc_timeout'}},{data:null,error:{message:'event_changed_refresh_required'}},{data:{accepted:true},error:null}]){
    const h=client({rpc:()=>result});assert.equal((await h.api.respondToEventSchedule(ids.event,ids.purchase,ids.revision,'keep_ticket')).status,'unavailable');assert.equal(h.calls.length,1);
  }
});
