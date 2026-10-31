import test from 'node:test';
import assert from 'node:assert/strict';
import {mountCorrections} from './helpers/merch-correction-mounted-harness.mjs';
const item=(status='pending_review')=>({id:'request-1',orderId:'order-1',carrier:'usps',trackingNumber:'NEW123456',note:'Private correction reason',status,financialAuthority:false,replacementApplied:false});
const page=(requests=[])=>({requests,nextCursor:null});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const open='Review or request a tracking correction';
async function fill(h){await h.change('Proposed tracking number','NEW123456');await h.change('Reason for tracking correction','Private correction reason');}

test('creator correction retry freezes identity and keeps truthful held status',async()=>{
 const calls=[];let saved=false;const h=await mountCorrections({rpc:async(name,args)=>{
  if(name==='request_merch_tracking_correction'){calls.push(args);if(calls.length===1)throw Error('timeout PRIVATE_PROVIDER');saved=true;}
  return page(saved?[item()]:[]);
 }});
 try{await h.press(open);await fill(h);await h.press('Request correction review');assert.doesNotMatch(h.text(),/PRIVATE_PROVIDER/);
  await assert.rejects(h.change('Proposed tracking number','CHANGED123'),/input unavailable/);
  await h.press('Retry same correction request');assert.deepEqual(calls[0],calls[1]);assert.match(h.text(),/Awaiting staff review; not corrected/);assert.match(h.text(),/earnings remain held/);
 }finally{await h.close();}
});
test('definitive validation rejection permits a corrected request, but uncertain replay rejection stays frozen',async()=>{
 for(const uncertain of [false,true]){
  const calls=[];const h=await mountCorrections({rpcEnvelope:true,rpc:async(name,args)=>{
   if(name==='request_merch_tracking_correction'){calls.push(args);return {data:null,error:uncertain&&calls.length===1?{message:'timeout'}:{code:'P0001',message:'merch_correction_invalid'}};}
   return {data:page(),error:null};
  }});
  try{await h.press(open);await fill(h);await h.press('Request correction review');
   if(uncertain){await h.press('Retry same correction request');assert.deepEqual(calls[0],calls[1]);await assert.rejects(h.change('Proposed tracking number','CHANGED123'),/input unavailable/);}
   else{await h.change('Proposed tracking number','CHANGED123');await h.press('Request correction review');assert.notEqual(calls[0].p_request_id,calls[1].p_request_id);}
  }finally{await h.close();}
 }
});
test('late correction read cannot expose notes after account/order switch or blur',async()=>{
 for(const kind of ['account','order','focus']){
  const d=deferred();const h=await mountCorrections({rpc:async()=>d.promise});
  try{await h.press(open,{wait:false});await h[kind](kind==='focus'?false:'replacement');await h.resolve(d,page([item()]));assert.doesNotMatch(h.text(),/Private correction reason/);}finally{await h.close();}
 }
});
test('staff decline has idempotent retry and explicit remaining hold',async()=>{
 const calls=[];let declined=false;const h=await mountCorrections({staff:true,actor:'staff',rpc:async(name,args)=>{
  if(name==='decline_merch_tracking_correction'){calls.push(args);if(calls.length===1)throw Error('timeout');declined=true;}
  return page([item(declined?'declined_held':'pending_review')]);
 }});
 try{await h.press('Open staff tracking correction review');await h.change('Tracking correction staff review note','Needs better evidence');
  await h.press('Decline proposal request-1 (keep verification hold)');await h.press('Retry same correction request');assert.deepEqual(calls[0],calls[1]);assert.match(h.text(),/Correction declined; shipment verification still needs review/);
  assert.doesNotMatch(h.text(),/Approve|corrected successfully|earnings released/);
 }finally{await h.close();}
});
test('staff approval retries the frozen action and never promises delivery or earnings release',async()=>{
 const calls=[];let approved=false;const h=await mountCorrections({staff:true,actor:'staff',rpc:async(name,args)=>{
  if(name==='approve_merch_tracking_correction'){calls.push({name,args});if(calls.length===1)throw Error('timeout');approved=true;return page([{...item('approved'),replacementApplied:true}]);}
  return page(approved?[]:[item()]);
 }});
 try{await h.press('Open staff tracking correction review');await h.change('Tracking correction staff review note','Pre-delivery identity reviewed');
  await h.press('Approve pre-delivery correction request-1');assert.match(h.text(),/outcome could not be confirmed/);assert.doesNotMatch(h.text(),/Tracking has not been replaced/);
  await h.press('Retry same correction request');assert.deepEqual(calls[0],calls[1]);assert.match(h.text(),/Approval does not confirm delivery/);
  assert.doesNotMatch(h.text(),/earnings released|delivery confirmed/);
 }finally{await h.close();}
});
test('approved creator read shows replacement separately from carrier verification',async()=>{
 const h=await mountCorrections({rpc:async()=>page([{...item('approved'),replacementApplied:true}])});
 try{await h.press(open);assert.match(h.text(),/Replacement approved; check current shipment verification/);assert.doesNotMatch(h.text(),/delivery confirmed|earnings released/);}finally{await h.close();}
});
test('public support gate performs permission check only and cannot load private correction queue',async()=>{
 const calls=[];const h=await mountCorrections({gate:true,rpc:async(name)=>{calls.push(name);return false;}});
 try{assert.ok(calls.every(name=>name!=='list_merch_tracking_correction_queue'));assert.doesNotMatch(h.text(),/Open staff tracking/);}finally{await h.close();}
});
