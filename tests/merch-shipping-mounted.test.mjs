import test from 'node:test';
import assert from 'node:assert/strict';
import {mountShipping} from './helpers/merch-shipping-mounted-harness.mjs';
const address={name:'SYNTHETIC NAME',line1:'PRIVATE FIXTURE STREET',line2:null,city:'TESTVILLE',state:'CA',postal_code:'12345',country:'US'};
const available={status:'available',address};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {resolve,promise};};
test('private address only after tap; hide/blur/account/order clear it and no unnecessary fields render',async()=>{
 const calls=[];const h=await mountShipping({orderId:'first',actor:'creator',rpc:async(name,args,actor)=>{calls.push({name,args,actor});return {...available,address:{...address,email:'UNNECESSARY EMAIL',phone:'UNNECESSARY PHONE'}};}});
 try{
  assert.equal(calls.length,0);await h.press('View shipping details');assert.match(h.text(),/PRIVATE FIXTURE STREET/);assert.doesNotMatch(h.text(),/UNNECESSARY/);
  assert.deepEqual(calls[0],{name:'get_merch_fulfillment_address',args:{p_order_id:'first'},actor:'creator'});
  await h.press('Hide shipping details');assert.doesNotMatch(h.text(),/PRIVATE FIXTURE/);
  await h.press('View shipping details');await h.focus(false);assert.doesNotMatch(h.text(),/PRIVATE FIXTURE/);
  await h.focus(true);assert.doesNotMatch(h.text(),/PRIVATE FIXTURE/);await h.press('View shipping details');await h.account('other');assert.doesNotMatch(h.text(),/PRIVATE FIXTURE/);
  await h.press('View shipping details');await h.order('second');assert.doesNotMatch(h.text(),/PRIVATE FIXTURE/);await h.press('View shipping details');assert.equal(calls.at(-1).args.p_order_id,'second');
 }finally{await h.close();}
});
for(const transition of ['account','order','blur','unmount'])test(`late private-address completion after ${transition} cannot disclose retired evidence`,async()=>{
 const d=deferred();const h=await mountShipping({orderId:'first',actor:'creator',rpc:async()=>d.promise});
 try{
  await h.press('View shipping details',{wait:false});
  if(transition==='account')await h.account('other');else if(transition==='order')await h.order('other');else if(transition==='blur')await h.focus(false);else await h.close();
  await h.resolve(d,available);assert.doesNotMatch(h.text(),/PRIVATE FIXTURE|SYNTHETIC NAME/);
 }finally{await h.close();}
});
test('malformed/private errors never render raw payloads and conflict state never renders an address',async()=>{
 let value=()=>{throw Error('PRIVATE DATABASE ADDRESS provider-secret');};
 const h=await mountShipping({orderId:'first',actor:'creator',rpc:async()=>value()});
 try{
  await h.press('View shipping details');assert.match(h.text(),/unavailable/);assert.doesNotMatch(h.text(),/PRIVATE DATABASE|provider-secret/);
  value=()=>({...available,address:{...address,line1:'<script>PRIVATE</script>'}});await h.press('View shipping details');assert.doesNotMatch(h.text(),/script|PRIVATE/);
  value=()=>({status:'review_required',address});await h.press('View shipping details');assert.match(h.text(),/Do not ship/);assert.doesNotMatch(h.text(),/PRIVATE FIXTURE/);
  value=()=>({status:'unavailable'});await h.press('View shipping details');assert.match(h.text(),/Do not guess/);
 }finally{await h.close();}
});
