import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const buyer='70000000-0000-4000-8000-000000000001',session='70000000-0000-4000-8000-000000000002';
const product='70000000-0000-4000-8000-000000000003',attempt='70000000-0000-4000-8000-000000000004';
const order='70000000-0000-4000-8000-000000000005';
function harness({beta=true,authority=true,reservationError=false,providerError=false,livemode=false,snapshot={}}={}) {
  const calls=[],provider=[],updates=[];let handler;
  const productRow={id:product,creator_id:'creator',provider:'stripe_physical_goods',environment:'sandbox',status:'sandbox',is_physical_good:true,creates_digital_access:false,price_minor:9999,currency:'usd'};
  const admin={from:table=>{
    const q={select:()=>q,limit:()=>q,eq:async()=>({error:null}),maybeSingle:async()=>({data:productRow,error:null}),update:body=>{updates.push({table,body});return q;}};
    q.eq=(...args)=>{calls.push(['eq',table,...args]);return table==='merch_products'?q:Promise.resolve({error:null});};return q;
  },rpc:async(name,args)=>{calls.push([name,args]);return reservationError?{data:null,error:{message:'blocked'}}:{data:{id:order,title:'Frozen title',priceMinor:1000,currency:'usd',createdAt:'2026-10-29T19:00:00Z',...snapshot},error:null};}};
  const ctx={exports:{},Date,Number,URLSearchParams,Request,Response,Deno:{serve:fn=>{handler=fn;}},fetch:async(url,options)=>{
    if(url.includes('/rest/v1/rpc/')) {calls.push(['authority',options]);return new Response(JSON.stringify(authority?{authoritative:true,userId:buyer,sessionGeneration:session}:null),{status:200});}
    provider.push({url,options});if(providerError)throw Error('transport outcome unknown');
    return new Response(JSON.stringify({id:'cs_test_order',url:'https://checkout.stripe.com/c/pay/test',livemode,payment_intent:null}),{status:200});
  },require:name=>{
    if(name.startsWith('jsr:'))return {};
    if(name.endsWith('/exact-subject-authority.ts'))return {readExactBetaAccess:async()=>beta,parseExactCurrentSessionAuthority:x=>x};
    if(name.endsWith('/stripe-connect.ts'))return {
      authenticateRequest:async()=>({user:{id:buyer,email:null}}),createAuthClient:()=>({supabaseUrl:'https://db.invalid',supabaseAnonKey:'public'}),
      createAdminClient:()=>({configured:true,client:admin}),userHasPlatformRole:async()=>false,
      readStripeTestSecret:()=>({configured:true,secret:'synthetic_test_only'}),
      parseJsonPayload:async req=>({value:await req.json()}),toText:x=>String(x??'').trim(),
      jsonResponse:(status,body)=>new Response(JSON.stringify(body),{status}),optionsResponse:()=>new Response(null,{status:204}),
      notConfiguredPayload:()=>({}),safeWriteAuditLog:async()=>{},sanitizeErrorMessage:e=>String(e?.message??e),
    };throw Error(name);
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/stripe-merch-checkout/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  return {calls,provider,updates,send:async(payload={product_id:product,quantity:2,attempt_id:attempt})=>{const response=await handler(new Request('https://edge.invalid',{method:'POST',headers:{Authorization:'Bearer frozen-original-token'},body:JSON.stringify(payload)}));return {status:response.status,body:await response.json()};}};
}
test('checkout adapter binds verified original session and atomic frozen catalog snapshot',async()=>{
 const h=harness();const r=await h.send();assert.equal(r.status,200);assert.equal(r.body.orderId,order);
 const reserve=h.calls.find(c=>c[0]==='reserve_merch_checkout_for_actor_with_tracking');assert.equal(reserve[1].p_buyer_id,buyer);assert.equal(reserve[1].p_session_id,session);assert.equal(reserve[1].p_attempt_id,attempt);
 assert.equal(h.calls.find(c=>c[0]==='authority')[1].headers.Authorization,'Bearer frozen-original-token');
 const body=new URLSearchParams(h.provider[0].options.body);assert.equal(body.get('line_items[0][price_data][unit_amount]'),'1000');assert.equal(body.get('line_items[0][price_data][product_data][name]'),'Frozen title');
 assert.equal(body.get('shipping_address_collection[allowed_countries][0]'),'US');assert.equal(body.get('expires_at'),String(Date.parse('2026-10-29T20:00:00Z')/1000));
 assert.equal(body.get('success_url'),`chillywoodmobile://merch/orders?orderId=${order}`);assert.equal(body.get('cancel_url'),body.get('success_url'));assert.equal(h.provider[0].options.headers['Idempotency-Key'],`chillywood-merch-checkout-${order}`);
 assert.equal(r.body.liveMoneyAction,false);assert.equal(r.body.payoutCreated,false);
});
test('ineligible, stale session and rejected reservation never reach provider',async()=>{
 for(const options of [{beta:false},{authority:false},{reservationError:true}]){const h=harness(options);assert.ok((await h.send()).status>=400);assert.equal(h.provider.length,0);assert.equal(h.updates.length,0);}
 const h=harness();assert.equal((await h.send({product_id:product,quantity:1})).status,400);assert.equal(h.provider.length,0);
});
test('ambiguous provider error never cancels or releases reserved stock',async()=>{
 const h=harness({providerError:true});const r=await h.send();assert.equal(r.status,500);assert.equal(r.body.checkoutCreated,false);assert.equal(h.updates.length,0);
 assert.equal(h.calls.filter(c=>c[0].startsWith('reserve')).length,1);assert.equal(h.calls.filter(c=>/release|cancel/.test(c[0])).length,0);
});
test('provider must positively confirm test mode before order session update',async()=>{
 for(const livemode of [true,null]){const h=harness({livemode});assert.equal((await h.send()).status,500);assert.equal(h.updates.length,0);}
});
test('selected SKU is reserved exactly and only immutable SQL snapshots reach checkout',async()=>{
 const variant='70000000-0000-4000-8000-000000000006';
 const h=harness({snapshot:{variantId:variant,sku:'TEE-S-RED',size:'S',color:'Red'}});
 const payload={product_id:product,quantity:2,attempt_id:attempt,variant_id:variant,sku:'CLIENT-LIE',size:'XL',color:'Blue',price_minor:1};
 assert.equal((await h.send(payload)).status,200);
 assert.equal(h.calls.find(c=>c[0]==='reserve_merch_checkout_for_actor_with_tracking')[1].p_variant_id,variant);
 const body=new URLSearchParams(h.provider[0].options.body);
 assert.equal(body.get('line_items[0][price_data][product_data][name]'),'Frozen title — S / Red');
 assert.equal(body.get('line_items[0][price_data][product_data][metadata][sku]'),'TEE-S-RED');
 assert.equal(body.get('line_items[0][price_data][product_data][metadata][chillywood_merch_variant_id]'),variant);
 assert.equal(body.get('line_items[0][price_data][unit_amount]'),'1000');
 await h.send({...payload,color:'Black',price_minor:9999});
 assert.equal(String(h.provider[1].options.body),String(h.provider[0].options.body));
 assert.equal(h.provider[1].options.headers['Idempotency-Key'],h.provider[0].options.headers['Idempotency-Key']);
 const invalid=harness();assert.equal((await invalid.send({...payload,variant_id:'not-a-uuid'})).status,400);assert.equal(invalid.provider.length,0);
 const unavailable=harness({reservationError:true});assert.equal((await unavailable.send(payload)).status,409);assert.equal(unavailable.provider.length,0);
 const simple=harness();await simple.send();assert.equal(simple.calls.find(c=>c[0]==='reserve_merch_checkout_for_actor_with_tracking')[1].p_variant_id,null);
});

test('physical merch freezes10%NET metadata without surcharge and rejects changed split before dispatch',async()=>{
 const snapshot={netSharePolicyVersion:'physical_merch_net_90_10_v1',platformNetShareBps:1000,creatorNetShareBps:9000};const h=harness({snapshot});assert.equal((await h.send()).status,200);
 const body=new URLSearchParams(h.provider[0].options.body);assert.equal(body.get('metadata[platform_net_share_bps]'),'1000');assert.equal(body.get('line_items[0][price_data][unit_amount]'),'1000');assert.equal(body.get('payment_intent_data[application_fee_amount]'),null);
 for(const patch of [{platformNetShareBps:2000},{creatorNetShareBps:8000},{netSharePolicyVersion:'unknown'}]){const bad=harness({snapshot:{...snapshot,...patch}});assert.equal((await bad.send()).status,409);assert.equal(bad.provider.length,0);}
 const legacy=harness();await legacy.send();assert.equal(new URLSearchParams(legacy.provider[0].options.body).has('metadata[platform_net_share_bps]'),false,'old checkout body is not rewritten');
});
