import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {loadPureTypeScriptModule} from './pure-typescript-module.mjs';

const taxModule=loadPureTypeScriptModule('supabase/functions/_shared/commerce-tax-readiness.ts');
export const reviewedTaxPolicy={ready:true,policyId:'70000000-0000-4000-8000-000000000007',taxBehavior:'inclusive',
  taxCode:'txcd_99999999',collectionMode:'automatic',liabilityType:'self',liabilityAccountId:null};

export const buyer='70000000-0000-4000-8000-000000000001',session='70000000-0000-4000-8000-000000000002';
export const product='70000000-0000-4000-8000-000000000003',attempt='70000000-0000-4000-8000-000000000004';
export const order='70000000-0000-4000-8000-000000000005';
export function harness({beta=true,authority=true,reservationError=false,providerError=false,livemode=false,snapshot={},taxPolicy=reviewedTaxPolicy,rpc,readRow,writeRow,envAccount='acct_fixture',accountError=false,source,audit,env={}}={}) {
  const calls=[],provider=[],updates=[];let handler;
  const productRow={id:product,creator_id:'creator',provider:'stripe_physical_goods',environment:'sandbox',status:'sandbox',is_physical_good:true,creates_digital_access:false,price_minor:9999,currency:'usd'};
  const admin={from:table=>{
    const q={select:()=>q,limit:()=>q,eq:async()=>({error:null}),maybeSingle:async()=>({data:readRow?await readRow():productRow,error:null}),update:body=>{updates.push({table,body});return q;}};
    q.eq=(...args)=>{calls.push(['eq',table,...args]);return table==='merch_products'?q:writeRow?writeRow(updates.at(-1).body,args[1]):Promise.resolve({error:null});};return q;
  },rpc:async(name,args)=>{calls.push([name,args]);if(rpc)return rpc(name,args);if(name==='transition_merch_checkout_dispatch')return {data:args.p_action==='dispatch'?{authorized:true,orderId:order}:{aborted:true,attemptId:args.p_attempt_id},error:null};if(name==='bind_commerce_tax_checkout_policy')return {data:taxPolicy,error:null};return reservationError?{data:null,error:{message:'blocked'}}:{data:{id:order,title:'Frozen title',priceMinor:1000,currency:'usd',createdAt:'2026-10-29T19:00:00Z',...snapshot},error:null};}};
  const ctx={exports:{},Date,Number,URLSearchParams,Request,Response,AbortSignal,setTimeout,clearTimeout,Deno:{serve:fn=>{handler=fn;}},fetch:async(url,options)=>{
    if(url.includes('/rest/v1/rpc/')) {calls.push(['authority',options]);return new Response(JSON.stringify(authority?{authoritative:true,userId:buyer,sessionGeneration:session}:null),{status:200});}
    if(url==='https://api.stripe.com/v1/account'){if(accountError)throw Error('account lookup failed');assert.equal(options.method,'GET');calls.push(['provider-account']);return Response.json({object:'account',id:'acct_fixture'});}
    provider.push({url,options});if(providerError)throw Error('transport outcome unknown');
    const body=new URLSearchParams(options.body),amount=Number(body.get('line_items[0][price_data][unit_amount]'))*Number(body.get('line_items[0][quantity]'));
    return new Response(JSON.stringify({id:'cs_test_order',object:'checkout.session',client_reference_id:body.get('client_reference_id'),currency:'usd',amount_total:amount,amount_subtotal:amount,
      automatic_tax:{enabled:true},metadata:{commerce_tax_policy_id:body.get('metadata[commerce_tax_policy_id]'),environment:body.get('metadata[environment]'),chillywood_order_id:body.get('metadata[chillywood_order_id]'),rail:body.get('metadata[rail]')},url:'https://checkout.stripe.com/c/pay/test',livemode,payment_intent:null}),{status:200});
  },require:name=>{
    if(name.startsWith('jsr:'))return {};
    if(name.endsWith('/commerce-tax-readiness.ts'))return taxModule;
    if(name.endsWith('/exact-subject-authority.ts'))return {readExactBetaAccess:async()=>beta,parseExactCurrentSessionAuthority:x=>x};
    if(name.endsWith('/stripe-connect.ts'))return {
      authenticateRequest:async()=>({user:{id:buyer,email:null}}),createAuthClient:()=>({supabaseUrl:'https://db.invalid',supabaseAnonKey:'public'}),
      createAdminClient:()=>({configured:true,client:admin}),userHasPlatformRole:async()=>false,
      readStripeTestSecret:()=>({configured:true,secret:'synthetic_test_only'}),
      readOptionalEnv:name=>Object.hasOwn(env,name)?env[name]:name==='STRIPE_MERCH_RECONCILIATION_ACCOUNT_ID'?envAccount:null,
      parseJsonPayload:async req=>({value:await req.json()}),toText:x=>String(x??'').trim(),
      jsonResponse:(status,body)=>new Response(JSON.stringify(body),{status}),optionsResponse:()=>new Response(null,{status:204}),
      notConfiguredPayload:()=>({}),safeWriteAuditLog:async()=>audit?.(),sanitizeErrorMessage:e=>String(e?.message??e),
    };throw Error(name);
  }};
  vm.runInNewContext(ts.transpileModule(source??fs.readFileSync('supabase/functions/stripe-merch-checkout/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  return {calls,provider,updates,send:async(payload={product_id:product,quantity:2,attempt_id:attempt})=>{const response=await handler(new Request('https://edge.invalid',{method:'POST',headers:{Authorization:'Bearer frozen-original-token'},body:JSON.stringify(payload)}));return {status:response.status,body:await response.json()};}};
}
