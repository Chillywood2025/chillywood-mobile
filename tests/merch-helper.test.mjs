import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';

function harness({reply,request}={}) {
  let current=true;
  const calls=[],opened=[],subject={accessToken:'synthetic-token',authority:{userId:'buyer'}};
  const assertCurrent=()=>{if(!current)throw Error('account_changed');};
  const context={exports:{},URL,Uint8Array,crypto:webcrypto,fetch:async(url,options)=>{
    calls.push({url,options});
    if(request)return request(()=>{current=false;});
    return {ok:true,json:async()=>reply??{checkoutCreated:true,orderId:'order',url:'https://checkout.stripe.com/c/pay/test'}};
  },require:name=>{
    if(name==='react-native')return {Linking:{openURL:async url=>opened.push(url)}};
    if(name==='./supabase')return {SUPABASE_URL:'https://example.invalid'};
    if(name==='./merchProductPhotos')return {resolveMerchProductPhotos:async products=>products};
    if(name==='./accountBoundSupabaseMutation')return {
      captureAccountBoundSupabaseMutationSubject:async()=>subject,
      assertAccountBoundSupabaseMutationSubjectCurrent:assertCurrent,
      runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{assertCurrent();calls.push({name,args});return {data:{products:[],orders:[],nextCursor:null},error:null};},
    };
    throw Error(name);
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/creatorMerch.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {api:context.exports,calls,opened};
}
const input={productId:'product',quantity:1,attemptId:'70000000-0000-4000-8000-000000000001'};
test('production helper sends exact catalog, owner and paging arguments to bound RPC',async()=>{
  const h=harness();await h.api.readMerchProducts({creatorId:'creator',owner:true,cursor:'last'});
  assert.equal(h.calls[0].name,'list_creator_merch_products');assert.equal(h.calls[0].args.p_manage,true);
  assert.equal(h.calls[0].args.p_creator_id,'creator');assert.equal(h.calls[0].args.p_before_id,'last');
  await h.api.readMerchOrders({role:'buyer',orderId:'order'});
  assert.equal(h.calls[1].name,'list_my_merch_orders');assert.equal(h.calls[1].args.p_order_id,'order');
});
test('checkout preserves stable attempt and opens only validated provider checkout',async()=>{
  const h=harness();assert.equal((await h.api.launchMerchCheckout(input)).orderId,'order');
  assert.equal(JSON.parse(h.calls[0].options.body).attempt_id,input.attemptId);
  assert.equal(h.opened.length,1);
  assert.match(h.api.createMerchCheckoutAttemptId(),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
test('checkout rejects unsafe redirect, malformed success and account change before opening',async()=>{
  for(const url of ['http://checkout.stripe.com/x','https://evil.invalid/x','https://checkout.stripe.com.evil.invalid/x','https://user:pass@checkout.stripe.com/x']){
    const h=harness({reply:{checkoutCreated:true,orderId:'o',url}});
    await assert.rejects(h.api.launchMerchCheckout(input));assert.equal(h.opened.length,0);
  }
  const malformed=harness({reply:{checkoutCreated:false}});
  await assert.rejects(malformed.api.launchMerchCheckout(input));assert.equal(malformed.opened.length,0);
  const changed=harness({request:async change=>{change();return {ok:true,json:async()=>({checkoutCreated:true,orderId:'o',url:'https://checkout.stripe.com/x'})};}});
  await assert.rejects(changed.api.launchMerchCheckout(input),/account_changed/);assert.equal(changed.opened.length,0);
});
test('invalid quantity never starts network work',async()=>{
  for(const quantity of [0,11,1.5,NaN]){const h=harness();await assert.rejects(h.api.launchMerchCheckout({...input,quantity}));assert.equal(h.calls.length,0);}
});
test('SKU configuration and checkout retain exact option identity',async()=>{
  const h=harness();const variant={id:'variant',sku:'TEE-M-BLUE',size:'M',color:'Blue',stockQuantity:5,status:'active'};
  await h.api.configureMerchVariants({productId:'product',variantMode:'options',variants:[variant],expectedUpdatedAt:'2026-10-29T19:00:00Z'});
  assert.equal(h.calls[0].name,'configure_creator_merch_variants');assert.equal(h.calls[0].args.p_variants[0].id,'variant');assert.equal(h.calls[0].args.p_variant_mode,'options');
  await h.api.launchMerchCheckout({...input,variantId:'variant'});
  assert.equal(JSON.parse(h.calls[1].options.body).variant_id,'variant');
});
