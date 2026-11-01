import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const taxModule={exports:{}};
new Function('exports',ts.transpileModule(readFileSync('supabase/functions/_shared/commerce-tax-readiness.ts','utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(taxModule.exports);

test('dedicated auction checkout is fail-closed, single-dispatch and revalidates before revealing provider URL',async()=>{
  const source=readFileSync('supabase/functions/stripe-event-auction-checkout/index.ts','utf8');
  const buyer='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
  const quote='33333333-3333-4333-8333-333333333333',attempt='44444444-4444-4444-8444-444444444444';
  const creator='55555555-5555-4555-8555-555555555555',auction='66666666-6666-4666-8666-666666666666';
  const q={startAuthorized:true,environment:'test',buyerId:buyer,quoteId:quote,checkoutAttemptId:attempt,
    routeKind:'external_browser_checkout',platform:'ios',storefrontCountry:'US',
    creatorId:creator,auctionId:auction,amountMinor:237,currency:'usd',providerAccountId:'acct_platform',recipientAccountId:'acct_fixture',settlementContractId:quote,settlementPolicy:'auction_platform_net_80_20_v1',chargePattern:'platform_separate_transfer',financialAuthority:false,providerProductId:'prod_AuctionFixture',
    expiresAt:new Date(Date.now()+3600000).toISOString()};
  const valid={id:'cs_test_Fixture',object:'checkout.session',livemode:false,mode:'payment',status:'open',payment_status:'unpaid',
    client_reference_id:quote,amount_total:237,amount_subtotal:237,currency:'usd',payment_intent:null,
    expires_at:Math.floor(Date.parse(q.expiresAt)/1000),automatic_tax:{enabled:true,status:'requires_location'},
    payment_method_types:['card'],url:'https://checkout.stripe.com/c/pay/cs_test_Fixture',
    metadata:{auction_quote_id:quote,auction_id:auction,buyer_user_id:buyer,creator_user_id:creator,provider_product_id:'prod_AuctionFixture',environment:'test',rail:'stripe_event_auction',settlement_contract_id:quote,settlement_policy:'auction_platform_net_80_20_v1',commerce_tax_policy_id:quote}};
  const run=async({dispatch=true,taxCurrent=true,mode='test',configured=true,start=true,release=true,authorityAfter=true,response=valid,claimFields={},nativePayload={},nativeBound=true,recovery=false,providerAccountId='acct_platform',providerTaxCode='txcd_10000000'}={})=>{
    const expectedId=mode==='live'?'cs_live_Fixture':valid.id;
    if(mode==='live'&&response===valid)response={...valid,id:expectedId,livemode:true,
      url:'https://checkout.stripe.com/c/pay/'+expectedId,metadata:{...valid.metadata,environment:'live'}};
    let handler,fetches=0,reads=0;const calls=[];
    const env={STRIPE_AUCTION_PLATFORM_LIVE_ACCOUNT_ID:'acct_platform',STRIPE_AUCTION_PLATFORM_LIVE_KEY:configured?'rk_live_fixture':undefined,STRIPE_AUCTION_PLATFORM_TEST_ACCOUNT_ID:'acct_platform',STRIPE_AUCTION_PLATFORM_TEST_KEY:configured?'rk_test_fixture':undefined,STRIPE_EVENT_AUCTION_RETURN_URL:'https://example.test/return'};
    const client={rpc:async(name,args)=>{calls.push(name);if(name==='get_auction_checkout_provider_context')return{data:!dispatch&&calls.filter(c=>c===name).length>1?null:{environment:mode,platformAccountId:'acct_platform'}};if(name==='prepare_creator_event_auction_platform_checkout')return{data:{...q,environment:mode,startAuthorized:start,...claimFields}};
      if(name==='bind_commerce_tax_checkout_policy'){
        if(!taxCurrent&&calls.filter(c=>c===name).length>1)return {data:{ready:false,reason:'tax_qualification_expired'}};
        assert.equal(args.p_feature,'event_auction');assert.equal(args.p_identity_id,quote);
        assert.equal(args.p_account_id,'acct_platform');assert.equal(args.p_environment,mode);
        assert.equal(args.p_product_id,'prod_AuctionFixture');assert.equal(args.p_permitted_scope,'worldwide');
        return{data:{ready:true,policyId:quote,taxBehavior:'inclusive',taxCode:'txcd_10000000',
          liabilityType:'self',liabilityAccountId:null,collectionMode:'automatic'}};
      }
      if(name==='recover_creator_event_auction_platform_checkout')return{data:recovery?{...q,environment:mode,...claimFields,startAuthorized:false,
        recoveryAuthorized:true,providerCheckoutSessionId:expectedId}:null};
      if(name==='bind_creator_event_auction_checkout'){assert.equal(args.p_session_id,response.id);return{error:null};}
      if(name==='bind_google_play_external_checkout'){
        assert.equal(args.p_feature,'event_auction');
        assert.equal(args.p_buyer_id,buyer);assert.equal(args.p_session_id,session);
        assert.equal(args.p_quote_id,quote);
        if(!nativeBound||args.p_external_transaction_token!=='synthetic_native_token'||args.p_api_version!==1)
          return {error:{message:'native token required'}};
        return {data:{bindingId:quote,routeKind:'android_external_content_link'}};
      }
      if(name==='revalidate_creator_event_auction_platform_checkout')return{data:release};throw Error(name);}};
    const modules={'../_shared/commerce-tax-readiness.ts':taxModule.exports,'npm:@supabase/supabase-js@2':{createClient:()=>({})},'../_shared/stripe-connect.ts':{
      authenticateRequest:async()=>({user:{id:buyer}}),createAdminClient:()=>({configured:true,client}),
      createAuthClient:()=>({supabaseUrl:'https://example.test',supabaseAnonKey:'fixture'}),
      jsonResponse:(status,body)=>Response.json(body,{status}),optionsResponse:()=>new Response(),readOptionalEnv:k=>env[k],
    },'../_shared/exact-subject-authority.ts':{readExactCurrentSessionAuthority:async()=>
      (++reads===1||authorityAfter)?{userId:buyer,sessionGeneration:session}:null}};
    const module={exports:{}};
    new Function('require','module','exports','Deno',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,
      target:ts.ScriptTarget.ES2022}}).outputText)(name=>name.startsWith('jsr:')?{}:modules[name],module,module.exports,{serve:f=>{handler=f;}});
    const oldFetch=globalThis.fetch;
    globalThis.fetch=async(url,request)=>{
      if(url==='https://api.stripe.com/v1/account'){
        assert.equal(request.method,'GET');assert.equal(request.headers['Stripe-Account'],undefined);
        return Response.json({object:'account',id:providerAccountId});
      }
      if(url==='https://api.stripe.com/v1/products/prod_AuctionFixture'){
        assert.equal(request.method,'GET');
        return Response.json({object:'product',id:'prod_AuctionFixture',livemode:mode==='live',active:true,tax_code:providerTaxCode});
      }
      fetches++;assert.equal(url,'https://api.stripe.com/v1/checkout/sessions'+(recovery?'/'+expectedId:''));assert.equal(request.headers['Stripe-Account'],undefined);
      assert.equal(request.headers['Idempotency-Key'],`event-auction-platform-v1-${quote}`);
      assert.equal(request.headers['Stripe-Version'],'2026-10-28.endive');
      if(recovery){assert.equal(request.method,'GET');assert.equal(request.body,undefined);return Response.json(response);}
      assert.equal(request.method,'POST');
      // GA Endive removed the old request key. Its response property retains
      // the old name, so request/response names intentionally differ.
      // https://docs.stripe.com/changelog/endive/2026-09-30/remove-payment-method-types-checkout-sessions
      assert.equal(request.body.has('payment_method_types[0]'),false);
      const allowedKeys=new Set(['mode','allowed_payment_method_types[0]','client_reference_id','success_url','cancel_url',
        'expires_at','line_items[0][quantity]','line_items[0][price_data][currency]',
        'line_items[0][price_data][unit_amount]','line_items[0][price_data][product]',
        'adaptive_pricing[enabled]','allow_promotion_codes','integration_identifier',
        ...['auction_quote_id','auction_id','buyer_user_id','creator_user_id','provider_product_id','environment','rail','settlement_contract_id','settlement_policy','commerce_tax_policy_id']
          .flatMap(k=>[`metadata[${k}]`,`payment_intent_data[metadata][${k}]`])]);
      for(const key of ['automatic_tax[enabled]','automatic_tax[liability][type]',
        'line_items[0][price_data][tax_behavior]'])allowedKeys.add(key);
      allowedKeys.add('billing_address_collection');
      assert.deepEqual([...request.body.keys()].sort(),[...allowedKeys].sort(),'exact documented Checkout request shape');
      assert.equal(request.body.get('allowed_payment_method_types[0]'),'card');assert.equal(request.body.get('line_items[0][price_data][unit_amount]'),'237');
      assert.equal(request.body.get('automatic_tax[enabled]'),'true');
      assert.equal(request.body.get('automatic_tax[liability][type]'),'self');
      assert.equal(request.body.get('line_items[0][price_data][tax_behavior]'),'inclusive');
      assert.equal(request.body.get('payment_intent_data[transfer_data][destination]'),null,'no transfer side effect');
      assert.ok(!request.body.toString().includes('synthetic_native_token'),'native token never leaves private binding');
      if(claimFields.platform==='android'){
        assert.equal(request.body.get('automatic_tax[enabled]'),'true');
        assert.equal(request.body.get('billing_address_collection'),'required');
        assert.equal(request.body.get('line_items[0][price_data][tax_behavior]'),'inclusive');
      }
      return Response.json(response);
    };
    try {const result=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer fixture'},
      body:JSON.stringify({quote_id:quote,attempt_id:attempt,...nativePayload})}));return {body:await result.json(),status:result.status,calls,fetches};}
    finally{globalThis.fetch=oldFetch;}
  };
  assert.equal((await run({configured:false})).fetches,0);
  assert.equal((await run({mode:'live',dispatch:false})).fetches,0,'stop or provider revocation during GETs prevents POST');
  assert.equal((await run({mode:'live',taxCurrent:false})).fetches,0,'tax revocation during GETs prevents POST');
  assert.equal((await run({providerAccountId:'acct_wrong'})).fetches,0,'wrong key account cannot create checkout');
  assert.equal((await run({providerTaxCode:'txcd_99999999'})).fetches,0,'provider product tax category must match reviewed policy');
  assert.equal((await run({providerTaxCode:null})).fetches,0,'missing provider tax category cannot use account defaults');
  const duplicate=await run({start:false});assert.equal(duplicate.fetches,0);assert.equal(duplicate.body.status,'pending');
  const recovered=await run({start:false,recovery:true});assert.equal(recovered.fetches,1);
  const {commerce_tax_policy_id:_oldPolicy,...historicalMetadata}=valid.metadata;
  const historical=await run({start:false,recovery:true,response:{...valid,metadata:historicalMetadata,automatic_tax:undefined}});
  assert.equal(historical.body.status,'checkout_ready','historical bound provider session resumes without rewriting tax policy');
  assert.equal(historical.fetches,1,'recovery is exactly one session GET and never a replacement POST');
  assert.ok(!historical.calls.includes('bind_commerce_tax_checkout_policy'),'missing current policy cannot hide historical checkout recovery');
  assert.equal(recovered.body.status,'checkout_ready','bound session GET resumes without another POST');
  const wrongRecovered=await run({start:false,recovery:true,response:{...valid,id:'cs_test_Different'}});
  assert.equal(wrongRecovered.body.checkoutUrl,undefined);
  assert.equal(wrongRecovered.fetches,1,'mismatched recovery cannot fall back to creating a new payment');
  const live=await run({mode:'live'});assert.equal(live.body.status,'checkout_ready');assert.equal(live.body.liveMoneyAction,true);
  const liveRecovery=await run({mode:'live',start:false,recovery:true});assert.equal(liveRecovery.body.status,'checkout_ready');
  assert.equal(liveRecovery.body.liveMoneyAction,false,'GET recovery is not a new live charge');
  const liveMissing=await run({mode:'live',configured:false});assert.equal(liveMissing.fetches,0);
  assert.ok(!liveMissing.calls.includes('prepare_creator_event_auction_platform_checkout'),'missing live key does not consume claim');
  const liveMismatch=await run({mode:'live',response:{...valid}});assert.equal(liveMismatch.body.checkoutUrl,undefined);
  const good=await run();assert.equal(good.fetches,1);assert.equal(good.body.status,'checkout_ready');assert.equal(good.body.quoteId,quote);
  // Inclusive prices retain the full bid in amount_subtotal and amount_total;
  // a nonzero tax breakdown is included, never added on top of the winning bid.
  const taxed=await run({response:{...valid,automatic_tax:{enabled:true,status:'complete'},total_details:{amount_tax:19,amount_discount:0,amount_shipping:0}}});
  assert.equal(taxed.body.status,'checkout_ready');assert.equal(taxed.body.amountMinor,237);
  assert.equal(good.body.routeKind,'external_browser_checkout');assert.equal(good.body.platform,'ios');
  assert.equal(good.body.storefrontCountry,'US');assert.equal(good.body.launchStrategy,'system_browser');
  const web=await run({claimFields:{platform:'web'}});assert.equal(web.fetches,1);assert.equal(web.body.platform,'web');
  const androidOptions={claimFields:{platform:'android',routeKind:'android_external_content_link'},
    nativePayload:{google_play_external_transaction_token:'synthetic_native_token',google_play_external_link_api_version:1},
    response:{...valid,automatic_tax:{enabled:true,status:'requires_location'}}};
  const android=await run(androidOptions);assert.equal(android.fetches,1);
  assert.equal(android.body.status,'checkout_ready');assert.equal(android.body.launchStrategy,'google_play_external_content_link');
  assert.ok(android.calls.indexOf('bind_google_play_external_checkout')<android.calls.indexOf('bind_creator_event_auction_checkout'));
  for(const change of [{nativeBound:false},{nativePayload:{}},{nativePayload:{...androidOptions.nativePayload,google_play_external_link_api_version:2}}]){
    const denied=await run({...androidOptions,...change});assert.equal(denied.fetches,0);assert.equal(denied.body.checkoutUrl,undefined);
  }
  const noTax=await run({...androidOptions,response:{...valid,automatic_tax:{enabled:false}}});assert.equal(noTax.body.checkoutUrl,undefined);
  const mixed=await run({nativePayload:androidOptions.nativePayload});assert.equal(mixed.fetches,0);
  for(const claimFields of [{routeKind:null},{routeKind:'android_external_content_link'},{platform:'android'},
    {platform:'ios',storefrontCountry:'CA'},{platform:'web',storefrontCountry:'GB'},{storefrontCountry:null},{platform:null},{providerAccountId:'acct_fixture'},{settlementContractId:null},{chargePattern:'direct'},{settlementPolicy:null},{financialAuthority:true},{recipientAccountId:'acct_platform'}]){
    const blocked=await run({claimFields});assert.equal(blocked.fetches,0,'unqualified trusted route never reaches Stripe');
    assert.equal(blocked.body.checkoutUrl,undefined);assert.equal(blocked.body.launchStrategy,undefined);
  }
  for(const options of [{release:false},{authorityAfter:false},{response:{...valid,livemode:true}},
    {response:{...valid,amount_total:238}},{response:{...valid,currency:'eur'}},
    {response:{...valid,expires_at:Math.floor(Date.parse(q.expiresAt)/1000)+1}},
    {response:{...valid,url:'https://evil.test/c/pay/cs_test_Fixture'}},{response:{...valid,client_reference_id:buyer}},
    {response:{...valid,payment_method_types:['card','klarna']}},{response:{...valid,payment_method_types:[]}}]){
    const r=await run(options);assert.equal(r.body.status,'pending');assert.equal(r.body.checkoutUrl,undefined);assert.equal(r.fetches,1);
  }
  const revoked=await run({authorityAfter:false});assert.ok(revoked.calls.includes('bind_creator_event_auction_checkout'),
    'persist provider response before withholding URL; do not erase uncertain checkout identity');
});
