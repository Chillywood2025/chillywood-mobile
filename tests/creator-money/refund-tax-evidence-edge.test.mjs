import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPureTypeScriptModule} from '../helpers/pure-typescript-module.mjs';
const {observeStripeRefundTax}=loadPureTypeScriptModule('supabase/functions/_shared/stripe-refund-tax-evidence.ts');
export const context={paymentIntentId:'pi_sale',currency:'usd',grossMinor:1001,taxMinor:91,
 refunds:[{id:'re_first',amount:333},{id:'re_second',amount:222}],livemode:false};
export function fixture(){
 const original={id:'tax_sale',object:'tax.transaction',currency:'usd',livemode:false,type:'transaction',reversal:null,shipping_cost:null};
 const reversal=id=>({...original,id,type:'reversal',reversal:{original_transaction:'tax_sale'}});
 const line=(id,amount,tax,reversal=false)=>({id,object:'tax.transaction_line_item',amount,amount_tax:tax,
  livemode:false,type:reversal?'reversal':'transaction',tax_behavior:'inclusive'});
 const list=data=>({object:'list',data,has_more:false});
 const data={
  '/tax/associations/find?payment_intent=pi_sale':{id:'taxa_sale',object:'tax.association',payment_intent:'pi_sale',tax_transaction_attempts:[
   {source:'re_second',status:'committed',committed:{transaction:'tax_second'}},
   {source:'pi_sale',status:'committed',committed:{transaction:'tax_sale'}},
   {source:'re_first',status:'committed',committed:{transaction:'tax_first'}}]},
  '/tax/transactions/tax_sale':original,
  '/tax/transactions/tax_first':reversal('tax_first'),
  '/tax/transactions/tax_second':reversal('tax_second'),
  '/tax/transactions/tax_sale/line_items?limit=100':list([line('tax_li_sale',1001,91)]),
  '/tax/transactions/tax_first/line_items?limit=100':list([line('tax_li_first',-333,-31,true)]),
  '/tax/transactions/tax_second/line_items?limit=100':list([line('tax_li_second',-222,-19,true)]),
 };
 const calls=[];
 const transport=async(url,init)=>{
  assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
  assert.equal(init.headers.Authorization,'Bearer sk_test_synthetic');
  const path=url.replace('https://api.stripe.com/v1','');calls.push(path);
  assert.ok(Object.hasOwn(data,path),`Unexpected request ${path}`);
  const value=data[path];return value instanceof Response?value.clone():Response.json(value);
 };
 return {data,calls,transport,observe:()=>observeStripeRefundTax(context,'sk_test_synthetic',transport)};
}
test('actual verifier follows exact provider association and tax transactions, preserving provider rounding',async()=>{
 const f=fixture(),result=await f.observe();
 assert.equal(result.tax_reversal_minor,50); // Not round(555 * 91 / 1001) = 50 by coincidence; individual amounts differ.
 assert.deepEqual(result.refunds.map(r=>r.tax_reversal_minor),[31,19]);
 assert.equal(result.refunded_minor,555);assert.equal(result.original_tax_transaction_id,'tax_sale');
 assert.equal(f.calls.filter(p=>p.startsWith('/tax/associations')).length,2);
});
for(const [path,key,value] of [
 ['/tax/associations/find?payment_intent=pi_sale','payment_intent','pi_other'],
 ['/tax/transactions/tax_sale','livemode',true],
 ['/tax/transactions/tax_sale','currency','eur'],
 ['/tax/transactions/tax_first','type','transaction'],
 ['/tax/transactions/tax_first','reversal',{original_transaction:'tax_other'}],
 ['/tax/transactions/tax_sale','reversal',{original_transaction:'tax_other'}],
])test(`rejects mismatched tax provenance ${path} ${key}`,async()=>{
 const f=fixture();f.data[path][key]=value;await assert.rejects(f.observe());
});
for(const [name,change] of [
 ['tax amount exceeds gross',l=>l.amount_tax=-334],
 ['wrong refund gross',l=>l.amount=-334],
 ['positive reversal',l=>l.amount_tax=31],
 ['fractional minor units',l=>l.amount=-333.2],
 ['unsafe integer',l=>l.amount=Number.MAX_SAFE_INTEGER+1],
 ['missing tax',l=>delete l.amount_tax],
 ['unknown tax behavior',l=>l.tax_behavior='estimated'],
 ['wrong mode',l=>l.livemode=true],
 ['wrong item type',l=>l.type='transaction'],
])test(`rejects ${name}`,async()=>{
 const f=fixture();change(f.data['/tax/transactions/tax_first/line_items?limit=100'].data[0]);await assert.rejects(f.observe());
});
test('absent, late or errored association stays unknown',async()=>{
 for(const value of [new Response('{}',{status:404}),{...fixture().data['/tax/associations/find?payment_intent=pi_sale'],tax_transaction_attempts:null},
  {...fixture().data['/tax/associations/find?payment_intent=pi_sale'],tax_transaction_attempts:[{source:'pi_sale',status:'errored'}]}]){
  const f=fixture();f.data['/tax/associations/find?payment_intent=pi_sale']=value;assert.equal(await f.observe(),null);
 }
 const f=fixture();f.data['/tax/associations/find?payment_intent=pi_sale'].tax_transaction_attempts.pop();assert.equal(await f.observe(),null);
});
for(const status of [401,403,429,500])test(`provider ${status} is retry failure, not zero tax`,async()=>{
 const f=fixture();f.data['/tax/associations/find?payment_intent=pi_sale']=new Response('{}',{status});await assert.rejects(f.observe());
});
test('duplicate source, reused reversal and unknown extra association cannot be cherry-picked',async()=>{
 for(const attempt of [{source:'re_first',status:'committed',committed:{transaction:'tax_other'}},
  {source:'re_unknown',status:'committed',committed:{transaction:'tax_unknown'}}]){
  const f=fixture();f.data['/tax/associations/find?payment_intent=pi_sale'].tax_transaction_attempts.push(attempt);await assert.rejects(f.observe());
 }
 const f=fixture();f.data['/tax/associations/find?payment_intent=pi_sale'].tax_transaction_attempts[0].committed.transaction='tax_first';await assert.rejects(f.observe());
});
test('full line-item pagination and inclusive/exclusive shipping totals are checked',async()=>{
 const f=fixture();f.data['/tax/transactions/tax_sale/line_items?limit=100']={object:'list',data:[{id:'tax_li_a',object:'tax.transaction_line_item',type:'transaction',livemode:false,amount:400,amount_tax:40,tax_behavior:'exclusive'}],has_more:true};
 f.data['/tax/transactions/tax_sale/line_items?limit=100&starting_after=tax_li_a']={object:'list',data:[{id:'tax_li_b',object:'tax.transaction_line_item',type:'transaction',livemode:false,amount:510,amount_tax:51,tax_behavior:'exclusive'}],has_more:false};
 assert.equal((await f.observe()).tax_reversal_minor,50);
 f.data['/tax/transactions/tax_sale/line_items?limit=100&starting_after=tax_li_a'].data[0].id='tax_li_a';await assert.rejects(f.observe());
});
test('mid-read association mutation rejects the entire snapshot',async()=>{
 const f=fixture();let reads=0;
 const transport=async(url,init)=>{
  if(url.includes('/associations')&&++reads===2)f.data['/tax/associations/find?payment_intent=pi_sale'].tax_transaction_attempts[0].committed.transaction='tax_changed';
  return f.transport(url,init);
 };
 await assert.rejects(observeStripeRefundTax(context,'sk_test_synthetic',transport));
});
test('duplicate input refunds and mode-mismatched credential rejected before network',async()=>{
 const f=fixture();await assert.rejects(observeStripeRefundTax({...context,refunds:[context.refunds[0],context.refunds[0]]},'sk_test_synthetic',f.transport));
 await assert.rejects(observeStripeRefundTax(context,'sk_live_synthetic',f.transport));assert.equal(f.calls.length,0);
});
