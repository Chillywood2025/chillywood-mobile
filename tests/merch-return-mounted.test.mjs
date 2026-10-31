import test from 'node:test';
import assert from 'node:assert/strict';
import {mountReturns} from './helpers/merch-return-mounted-harness.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {resolve,promise};};
const item=(status='open')=>({id:'case-1',orderId:'order-1',kind:'non_delivery',status,createdAt:'2026-10-30T00:00:00Z',events:[{id:'event-1',action:'opened',actorRole:'buyer',note:'SYNTHETIC CLAIM',createdAt:'2026-10-30T00:00:00Z'}]});
test('non-delivery can be submitted before delivery; exact order is passed, no return deadline fabricated',async()=>{
 const calls=[];let cases=[];const h=await mountReturns({rpc:async(name,args)=>{calls.push({name,args});if(name==='submit_merch_return_case'){cases=[item()];return item();}return {cases,canManage:false};}});
 try{assert.equal(calls.length,0);await h.press('View return cases');await h.change('Not received');assert.equal(h.button('Request return').props.disabled,true);await h.press('Report non-delivery');assert.equal(calls[1].name,'submit_merch_return_case');assert.equal(calls[1].args.p_order_id,'order-1');assert.equal(calls[1].args.p_kind,'non_delivery');assert.match(calls[1].args.p_request_id,/^[a-f0-9-]{36}$/);assert.match(h.text(),/SYNTHETIC CLAIM/);assert.match(h.text(),/does not issue a refund/);assert.doesNotMatch(h.text(),/Recorded return deadline:/);}finally{await h.close();}
});
test('return request uses recorded deadline; expired window disables return but not delivery help',async()=>{
 for(const deadline of ['2099-01-01T00:00:00Z','2000-01-01T00:00:00Z']){const h=await mountReturns({deadline,rpc:async()=>({cases:[],canManage:false})});try{await h.press('View return cases');await h.change('Return request');assert.equal(h.button('Request return').props.disabled,deadline.startsWith('2000'));assert.equal(h.button('Report non-delivery').props.disabled,false);assert.match(h.text(),new RegExp(deadline.replace('Z','.000Z')));}finally{await h.close();}}
});
test('uncertain submit retries frozen UUID and original note; raw errors never render',async()=>{
 const calls=[];let failed=false;const h=await mountReturns({rpc:async(name,args)=>{if(name==='submit_merch_return_case'){calls.push(args);if(!failed){failed=true;throw Error('provider-secret PRIVATE ADDRESS');}return item();}return {cases:[],canManage:false};}});
 try{await h.press('View return cases');await h.change('Original note');await h.press('Report non-delivery');assert.doesNotMatch(h.text(),/provider-secret|PRIVATE ADDRESS/);await assert.rejects(()=>h.change('Changed note'),/input unavailable/);await h.press('Retry same case request');assert.deepEqual(calls[0],calls[1]);assert.equal(calls.length,2);}finally{await h.close();}
});
test('creator can respond or escalate, never close buyer claims',async()=>{
 const calls=[];const h=await mountReturns({manage:true,actor:'creator',rpc:async(name,args)=>{calls.push({name,args});return {cases:[item()],canManage:true};}});
 try{await h.press('View return cases');assert.equal(h.button('Close my case case-1'),undefined);assert.equal(h.button('Request return'),undefined);await h.change('Please describe the problem');await h.press('Respond to case case-1');assert.equal(calls[1].args.p_action,'creator_response');assert.ok(h.button('Ask staff to review case case-1'));}finally{await h.close();}
});
test('buyer escalation and voluntary closure target exact case and are not refund actions',async()=>{
 const calls=[];let status='open';const h=await mountReturns({rpc:async(name,args)=>{calls.push({name,args});if(name==='respond_merch_return_case'){status=args.p_action==='escalate'?'escalated':'closed';return item(status);}return {cases:[item(status)],canManage:false};}});
 try{await h.press('View return cases');await h.change('Please review my unresolved claim');await h.press('Ask staff to review case case-1');assert.equal(calls[1].args.p_case_id,'case-1');assert.equal(calls[1].args.p_action,'escalate');assert.equal(h.button('Ask staff to review case case-1').props.disabled,true);await h.change('The issue is resolved');await h.press('Close my case case-1');assert.equal(calls[3].args.p_action,'buyer_close');assert.match(h.text(),/closed/);assert.doesNotMatch(h.text(),/refund completed/i);}finally{await h.close();}
});
test('wrong-order case read is rejected before rendering another order claim',async()=>{
 const h=await mountReturns({rpc:async()=>({cases:[{...item(),orderId:'other-order'}],canManage:false})});try{await h.press('View return cases');assert.doesNotMatch(h.text(),/SYNTHETIC CLAIM/);assert.match(h.text(),/couldn't confirm/);}finally{await h.close();}
});
for(const transition of ['account','order','blur'])test(`late request completion after ${transition} cannot repopulate old claim`,async()=>{
 const d=deferred();const h=await mountReturns({rpc:async name=>name==='submit_merch_return_case'?d.promise:{cases:[],canManage:false}});
 try{await h.press('View return cases');await h.change('PRIVATE RETIRED DRAFT');await h.press('Report non-delivery',{wait:false});if(transition==='account')await h.account('other');else if(transition==='order')await h.order('other');else await h.focus(false);await h.resolve(d,item());assert.doesNotMatch(h.text(),/SYNTHETIC CLAIM|PRIVATE RETIRED DRAFT/);}finally{await h.close();}
});
for(const transition of ['account','order','blur','unmount'])test(`late case read after ${transition} cannot disclose retired case`,async()=>{
 const d=deferred();const h=await mountReturns({rpc:async()=>d.promise});try{await h.press('View return cases',{wait:false});if(transition==='account')await h.account('other');else if(transition==='order')await h.order('other');else if(transition==='blur')await h.focus(false);else await h.close();await h.resolve(d,{cases:[item()],canManage:false});assert.doesNotMatch(h.text(),/SYNTHETIC CLAIM/);}finally{await h.close();}
});
test('staff resolution requires queue read and preserves same request on retry; never presents refund completion',async()=>{
 let fail=true;const calls=[];const h=await mountReturns({staff:true,actor:'staff',rpc:async(name,args)=>{calls.push({name,args});if(name==='respond_merch_return_case'){if(fail){fail=false;throw Error('uncertain');}return item('closed');}return {cases:[item('escalated')],role:'staff',totalCount:1,nextCursor:null};}});
 try{await h.press('Open staff merch case review');assert.equal(calls[0].name,'list_merch_return_case_queue');await h.change('Reviewed buyer and creator evidence');await h.press('Resolve support case case-1');await h.press('Retry same staff resolution');assert.deepEqual(calls[1],calls[2]);assert.equal(calls[1].args.p_action,'staff_resolve');assert.match(h.text(),/not a refund/);assert.doesNotMatch(h.text(),/refund completed/i);}finally{await h.close();}
});
test('staff permission denial cannot render queue and replaced session cannot display late staff notes',async()=>{
 const d=deferred();const h=await mountReturns({staff:true,rpc:async()=>d.promise});try{await h.press('Open staff merch case review',{wait:false});await h.account('other');await h.resolve(d,{cases:[item('escalated')],role:'staff',totalCount:1,nextCursor:null});assert.doesNotMatch(h.text(),/SYNTHETIC CLAIM/);}finally{await h.close();}
 const denied=await mountReturns({staff:true,rpc:async()=>{throw Error('permission_denied');}});try{await denied.press('Open staff merch case review');assert.match(denied.text(),/unavailable/);assert.equal(denied.button('Resolve support case case-1'),undefined);}finally{await denied.close();}
});

for (const message of ['merch_case_request_invalid', 'merch_case_return_window_unavailable']) test(`definitive ${message} permits corrected buyer request with a new UUID`, async()=>{
 const calls=[];let first=true;const h=await mountReturns({deadline:'2099-01-01T00:00:00Z',rpcEnvelope:true,rpc:async(name,args)=>{
  if(name==='submit_merch_return_case'){calls.push(args);if(first){first=false;return {data:null,error:{code:'P0001',message}};}return {data:item(),error:null};}
  return {data:{cases:[],canManage:false},error:null};
 }});
 try{await h.press('View return cases');await h.change('Old request');await h.press('Request return');assert.match(h.text(),/update was rejected/);assert.equal(h.button('Retry same case request'),undefined);await h.change('Corrected non-delivery details');await h.press('Report non-delivery');assert.notEqual(calls[0].p_request_id,calls[1].p_request_id);assert.equal(calls[1].p_kind,'non_delivery');assert.equal(calls[1].p_note,'Corrected non-delivery details');}finally{await h.close();}
});

test('already-closed staff case releases pending request and permits queue refresh',async()=>{
 let closed=false;const h=await mountReturns({staff:true,actor:'staff',rpcEnvelope:true,rpc:async name=>{
  if(name==='respond_merch_return_case'){closed=true;return {data:null,error:{code:'P0001',message:'merch_case_already_closed'}};}
  return {data:{cases:closed?[]:[item('escalated')],canManage:true,role:'staff',totalCount:closed?0:1,nextCursor:null},error:null};
 }});
 try{await h.press('Open staff merch case review');await h.change('Stale resolution');await h.press('Resolve support case case-1');assert.match(h.text(),/update was rejected/);assert.equal(h.button('Retry same staff resolution'),undefined);await h.change('Updated resolution notes');await h.press('Open staff merch case review');assert.match(h.text(),/No escalated merch cases/);}finally{await h.close();}
});

for(const error of [{message:'account_bound_rpc_timeout'},{code:'42501',message:'merch_case_unavailable'},{code:'P0001',message:'merch_case_request_conflict'},{code:'P0001',message:'unknown_provider_failure PRIVATE'},{message:'merch_case_request_invalid'}])test(`ambiguous envelope ${error.message} preserves frozen request`,async()=>{
 const calls=[];const h=await mountReturns({rpcEnvelope:true,rpc:async(name,args)=>{
  if(name==='submit_merch_return_case'){calls.push(args);return calls.length===1?{data:null,error}:{data:item(),error:null};}
  return {data:{cases:[],canManage:false},error:null};
 }});
 try{await h.press('View return cases');await h.change('Frozen original');await h.press('Report non-delivery');await assert.rejects(()=>h.change('Changed'),/input unavailable/);assert.doesNotMatch(h.text(),/PRIVATE|update was rejected/);await h.press('Retry same case request');assert.deepEqual(calls[0],calls[1]);}finally{await h.close();}
});

for (const staff of [false,true]) test(`later SQL rejection cannot unlock an earlier uncertain ${staff?'staff':'buyer'} request`,async()=>{
 const calls=[];const h=await mountReturns({staff,actor:staff?'staff':'buyer',rpcEnvelope:true,rpc:async(name,args)=>{
  if(['submit_merch_return_case','respond_merch_return_case'].includes(name)){calls.push(args);return {data:null,error:calls.length===1?{message:'account_bound_rpc_timeout'}:{code:'P0001',message:staff?'merch_case_already_closed':'merch_case_return_window_unavailable'}};}
  return {data:{cases:staff?[item('escalated')]:[],canManage:staff,role:'staff',totalCount:staff?1:0,nextCursor:null},error:null};
 }});
 try{await h.press(staff?'Open staff merch case review':'View return cases');await h.change('Original unresolved operation');await h.press(staff?'Resolve support case case-1':'Report non-delivery');await h.press(staff?'Retry same staff resolution':'Retry same case request');await assert.rejects(()=>h.change('Replacement'),/input unavailable/);assert.deepEqual(calls[0],calls[1]);assert.doesNotMatch(h.text(),/update was rejected/);}finally{await h.close();}
});

for (const staff of [false,true]) test(`blurred in-flight ${staff?'staff':'buyer'} request remains uncertain across refocus and rejection`,async()=>{
 const d=deferred(),calls=[];const h=await mountReturns({staff,actor:staff?'staff':'buyer',rpcEnvelope:true,rpc:async(name,args)=>{
  if(['submit_merch_return_case','respond_merch_return_case'].includes(name)){calls.push(args);return calls.length===1?d.promise:{data:null,error:{code:'P0001',message:staff?'merch_case_already_closed':'merch_case_return_window_unavailable'}};}
  return {data:{cases:staff?[item('escalated')]:[],canManage:staff,role:'staff',totalCount:staff?1:0,nextCursor:null},error:null};
 }});
 try{await h.press(staff?'Open staff merch case review':'View return cases');await h.change('Still in flight');await h.press(staff?'Resolve support case case-1':'Report non-delivery',{wait:false});await h.focus(false);await h.focus(true);await h.press(staff?'Retry same staff resolution':'Retry same case request',{wait:false});await h.resolve(d,{data:item(),error:null});assert.deepEqual(calls[0],calls[1]);assert.ok(h.button(staff?'Retry same staff resolution':'Retry same case request'));assert.doesNotMatch(h.text(),/update was rejected/);}finally{await h.close();}
});

test('staff next page reaches unseen case, refresh resets cursor, and delayed next page cannot cross accounts',async()=>{
 const cursor='ab333333-3333-4333-8333-333333333333',calls=[],d=deferred();let delayed=false;
 const h=await mountReturns({staff:true,actor:'staff',rpc:async(name,args)=>{calls.push(args);if(args.p_after&&delayed)return d.promise;return {role:'staff',totalCount:51,nextCursor:args.p_after?null:cursor,cases:[{...item('escalated'),id:args.p_after?'case-51':'case-1'}]};}});
 try{await h.press('Open staff merch case review');await h.press('Next staff case page');assert.ok(h.button('Resolve support case case-51'));assert.equal(calls.at(-1).p_after,cursor);
 await h.press('Open staff merch case review');assert.equal(calls.at(-1).p_after,null);delayed=true;await h.press('Next staff case page',{wait:false});await h.account('other');await h.resolve(d,{role:'staff',totalCount:51,nextCursor:null,cases:[{...item('escalated'),id:'PRIVATE-STAFF'}]});assert.doesNotMatch(h.text(),/PRIVATE-STAFF/);
 }finally{await h.close();}
});
