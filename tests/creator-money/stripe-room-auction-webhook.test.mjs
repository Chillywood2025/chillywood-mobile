import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import ts from 'typescript';
test('platform webhook uses separately pinned signature/account and cannot masquerade as connected receipts',async()=>{
  const e=event();delete e.account;
  Object.assign(e.data.object.metadata,{settlement_contract_id:ids.quote,settlement_policy:'auction_platform_net_80_20_v1'});
  assert.equal(parse(e),null);
  assert.equal(parse(e,'acct_platform').accountId,'acct_platform');
  assert.equal(parse({...e,livemode:true},'acct_platform'),null);
  const missing=structuredClone(e);delete missing.data.object.metadata.settlement_policy;
  assert.equal(parse(missing,'acct_platform'),null);
  const env={STRIPE_ROOM_AUCTION_WEBHOOK_SECRET:'whsec_legacy',
    STRIPE_ROOM_AUCTION_PLATFORM_WEBHOOK_SECRET:'whsec_platform',STRIPE_AUCTION_PLATFORM_TEST_ACCOUNT_ID:'acct_platform'};
  const calls=[];let handler;
  const Deno={env:{get:k=>env[k]},serve:fn=>handler=fn};
  const realStripe=load('_shared/stripe-connect.ts',{Deno,modules:{
    'npm:@supabase/supabase-js@2':{createClient:()=>({})},'./exact-subject-authority.ts':load('_shared/exact-subject-authority.ts')}});
  const stripe={...realStripe,createAdminClient:()=>({configured:true,client:{rpc:async(name,args)=>{
    calls.push({name,args});return{data:{status:'fulfilled'}};}}})};
  load('stripe-room-auction-webhook/index.ts',{Deno,modules:{
    '../_shared/stripe-connect.ts':stripe,'../_shared/stripe-room-auction-evidence.ts':{parseAuctionEvidence:parse,parseAuctionNoPaymentEvidence:noPayment}}});
  const send=async(secret,payload=e)=>{
    const raw=JSON.stringify(payload),t=Math.floor(Date.now()/1000);
    const sig='t='+t+',v1='+createHmac('sha256',secret).update(t+'.'+raw).digest('hex');
    return handler(new Request('https://test.invalid',{method:'POST',body:raw,headers:{'stripe-signature':sig}}));
  };
  assert.equal((await send('whsec_legacy')).status,400);assert.equal(calls.length,0);
  assert.equal((await send('whsec_platform')).status,200);assert.equal(calls.length,1);
  assert.equal(calls[0].args.p_evidence.accountId,'acct_platform');
  assert.equal((await send('whsec_platform',{...e,account:'acct_fixture'})).status,400);
  const live=structuredClone(e);live.livemode=true;live.data.object.livemode=true;
  live.data.object.metadata.environment='live';live.data.object.id='cs_live_Fixture';
  assert.equal((await send('whsec_platform',live)).status,503,'no live signing configuration is inferred');
  env.STRIPE_AUCTION_PLATFORM_LIVE_ACCOUNT_ID='acct_liveplatform';
  env.STRIPE_ROOM_AUCTION_PLATFORM_LIVE_WEBHOOK_SECRET='whsec_liveplatform';
  assert.equal((await send('whsec_platform',live)).status,400,'test signing secret cannot authenticate live');
  assert.equal((await send('whsec_liveplatform',live)).status,200);
  assert.equal(calls.at(-1).args.p_evidence.environment,'live');
  assert.equal(calls.at(-1).args.p_evidence.accountId,'acct_liveplatform');
  delete env.STRIPE_AUCTION_PLATFORM_TEST_ACCOUNT_ID;
  assert.equal((await send('whsec_platform')).status,503);
  assert.equal(calls.length,2);
});

const root='supabase/functions/';
function load(file,{Deno={},modules={}}={}){
  const module={exports:{}};
  const require=name=>{
    if(name in modules)return modules[name];
    if(name.startsWith('jsr:'))return {};
    throw new Error('Unexpected test import '+name);
  };
  new Function('require','module','exports','Deno',ts.transpileModule(readFileSync(root+file,'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,module,module.exports,Deno);
  return module.exports;
}
const {parseAuctionEvidence:parse,parseAuctionNoPaymentEvidence:noPayment}=load('_shared/stripe-room-auction-evidence.ts', {modules:{
  './google-play-stripe-tax-evidence.ts':load('_shared/google-play-stripe-tax-evidence.ts')}});
const ids={quote:'11111111-1111-4111-8111-111111111111',buyer:'22222222-2222-4222-8222-222222222222',
  creator:'33333333-3333-4333-8333-333333333333',auction:'44444444-4444-4444-8444-444444444444'};
const event=()=>({id:'evt_Fixture',type:'checkout.session.completed',account:'acct_fixture',livemode:false,
  created:Math.floor(Date.now()/1000),data:{object:{id:'cs_test_Fixture',object:'checkout.session',livemode:false,
    mode:'payment',status:'complete',payment_status:'paid',payment_intent:'pi_Fixture',amount_total:237,amount_subtotal:237,
    currency:'usd',client_reference_id:ids.quote,metadata:{auction_quote_id:ids.quote,buyer_user_id:ids.buyer,
      creator_user_id:ids.creator,auction_id:ids.auction,provider_product_id:'prod_AuctionFixture',environment:'test',rail:'stripe_room_auction'}}}});
test('auction parser accepts exact paid event evidence, never unpaid/commercially different sessions',()=>{
  assert.equal(parse(event()).amountMinor,237);
  for(const patch of [{payment_status:'unpaid'},{payment_status:'no_payment_required'},{status:'open'},{mode:'subscription'},
    {amount_total:0},{amount_total:237.5},{amount_total:'237'},{amount_subtotal:238},{currency:'USD'},
    {payment_intent:null},{livemode:true},{metadata:{}},{client_reference_id:ids.buyer}]){
    const e=event();Object.assign(e.data.object,patch);assert.equal(parse(e),null,JSON.stringify(patch));
  }
  for(const patch of [{account:null},{livemode:undefined},{created:NaN},{type:'payment_intent.succeeded'}]){
    assert.equal(parse({...event(),...patch}),null,JSON.stringify(patch));
  }
  const differentRail=event();differentRail.data.object.metadata.rail='stripe_physical_goods';assert.equal(parse(differentRail),null);
});
test('terminal events require exact provider payment and coherent full/partial refund evidence',()=>{
  const e=event();e.type='charge.refunded';e.data.object={id:'ch_fixture',object:'charge',livemode:false,
    payment_intent:'pi_Fixture',amount:237,amount_refunded:100,refunded:false,currency:'usd'};
  assert.equal(parse(e).outcome,'refunded');
  e.data.object.refunded=true;assert.equal(parse(e),null);
  e.data.object.amount_refunded=237;assert.equal(parse(e).refundedAmountMinor,237);
  e.data.object.amount_refunded=238;assert.equal(parse(e),null);
  e.type='charge.dispute.created';e.data.object={id:'dp_fixture',object:'dispute',livemode:false,
    charge:'ch_fixture',payment_intent:'pi_Fixture',amount:237,currency:'usd'};
  assert.equal(parse(e).outcome,'disputed');delete e.data.object.payment_intent;assert.equal(parse(e),null);
});
test('paid auction tax evidence comes only from complete signed provider fields',()=>{
  const e=event();Object.assign(e.data.object,{automatic_tax:{enabled:true,status:'complete'},
    customer_details:{address:{country:'US'}},total_details:{amount_tax:20,amount_discount:0,amount_shipping:0}});
  assert.deepEqual(parse(e).googlePlayTax,{provenance:'stripe_checkout_automatic_tax_complete',
    countryCode:'US',preTaxAmountMinor:217,taxAmountMinor:20});
  e.data.object.automatic_tax.status='failed';assert.equal(parse(e).googlePlayTax,null);
  e.data.object.automatic_tax.status='complete';e.data.object.customer_details.address.country='CA';
  assert.equal(parse(e).googlePlayTax,null);
  delete e.data.object.automatic_tax;e.data.object.metadata.googlePlayTax='fake';
  assert.equal(parse(e).googlePlayTax,null,'caller metadata cannot establish provider tax');
});
test('actual webhook verifies unchanged raw HMAC, rejects missing/bad/stale signatures before service projection',async()=>{
  const env={STRIPE_ROOM_AUCTION_WEBHOOK_SECRET:'whsec_fixture',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'};
  const calls=[];let handler;
  const Deno={env:{get:k=>env[k]},serve:fn=>{handler=fn;}};
  const authority=load('_shared/exact-subject-authority.ts');
  const stripe=load('_shared/stripe-connect.ts',{Deno,modules:{'npm:@supabase/supabase-js@2':{createClient:()=>({
    rpc:async(name,args)=>{calls.push({name,args});return {data:{status:'fulfilled'},error:null};}})},'./exact-subject-authority.ts':authority}});
  load('stripe-room-auction-webhook/index.ts',{Deno,modules:{'../_shared/stripe-connect.ts':stripe,
    '../_shared/stripe-room-auction-evidence.ts':{parseAuctionEvidence:parse,parseAuctionNoPaymentEvidence:noPayment}}});
  const raw=JSON.stringify(event()), now=Math.floor(Date.now()/1000);
  const signature=(text=raw,t=now)=>`t=${t},v1=${createHmac('sha256',env.STRIPE_ROOM_AUCTION_WEBHOOK_SECRET).update(`${t}.${text}`).digest('hex')}`;
  const send=(body,header)=>handler(new Request('https://fixture.test',{method:'POST',body,
    headers:header?{'stripe-signature':header}:{}}));
  for(const header of [null,'t=0,v1=wrong',signature(raw,now-301),signature(raw,now+301)]){
    assert.equal((await send(raw,header)).status,400);assert.equal(calls.length,0);
  }
  assert.equal((await send(raw+' ',signature())).status,400);assert.equal(calls.length,0);
  assert.equal((await send(raw,signature())).status,200);assert.equal(calls.length,1);
  assert.equal(calls[0].name,'process_stripe_room_auction_receipt');
  assert.match(calls[0].args.p_payload_hash,/^[0-9a-f]{64}$/);assert.equal(calls[0].args.p_evidence.quoteId,ids.quote);
  delete env.STRIPE_ROOM_AUCTION_WEBHOOK_SECRET;
  assert.equal((await send(raw,'irrelevant')).status,503);assert.equal(calls.length,1);
});

test('only definitive expired/failed unpaid sessions release a claimed checkout',()=>{
  const e=event();e.type='checkout.session.expired';e.data.object.status='expired';e.data.object.payment_status='unpaid';
  e.data.object.payment_intent=null;assert.ok(noPayment(e));
  e.data.object.payment_status='paid';assert.equal(noPayment(e),null);
  e.data.object.payment_status='unpaid';e.type='payment_intent.payment_failed';assert.equal(noPayment(e),null);
  e.type='checkout.session.async_payment_failed';e.data.object.status='complete';assert.ok(noPayment(e));
  e.data.object.status='open';assert.equal(noPayment(e),null);
});
