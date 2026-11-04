import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';

// Compile the actual reconciliation/checkpoint/observer modules. Only provider
// HTTP and the durable RPC boundary are synthetic; no live network is used.
export function loadGoogleRefundModule(name='google-refund-tax-history',overrides={},timers={}){
  const cache=new Map();
  const load=moduleName=>{
    if(Object.hasOwn(overrides,moduleName))return overrides[moduleName];
    if(cache.has(moduleName))return cache.get(moduleName);
    assert.ok(['google-refund-tax-history','google-refund-tax-reconciliation','stripe-refund-tax-evidence',
      'stripe-history-checkpoint','merch-observation-budget'].includes(moduleName),`Unexpected dependency ${moduleName}`);
    const source=readFileSync(`supabase/functions/_shared/${moduleName}.ts`,'utf8');
    const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const module={exports:{}};
    new Function('require','module','exports','setTimeout','clearTimeout',compiled)(dependency=>{
      assert.match(dependency,/^\.\/[a-z-]+\.ts$/);return load(dependency.slice(2,-3));
    },module,module.exports,timers[moduleName]?.setTimeout??setTimeout,timers[moduleName]?.clearTimeout??clearTimeout);
    cache.set(moduleName,module.exports);return module.exports;
  };
  return load(name);
}

export async function googleVerificationCheckpoint(f){
  const {createStripeHistoryCheckpoint}=loadGoogleRefundModule('stripe-history-checkpoint');
  const {observeGoogleRefundTax}=loadGoogleRefundModule('google-refund-tax-reconciliation');
  const history=createStripeHistoryCheckpoint({},f.transport,()=>64);
  await observeGoogleRefundTax(f.context,'sk_test_synthetic','acct_platform',history.transport);
  assert.equal(await history.finish({method:'GET',redirect:'error',headers:{Authorization:'Bearer sk_test_synthetic',
    'Stripe-Version':'2026-10-28.endive'}}),false);
  return history.checkpoint();
}

export const googleRefundContext={transaction_id:'a7100000-0000-4000-8000-000000000001',feature:'creator_tip',
  quote_id:'a7100000-0000-4000-8000-000000000002',buyer_id:'a7100000-0000-4000-8000-000000000003',
  creator_id:'a7100000-0000-4000-8000-000000000004',checkout_id:'cs_test_sale',payment_intent_id:'pi_sale',
  gross_minor:1001,tax_minor:91,currency:'usd',recipient_account_id:'acct_creator',platform_account_id:null};

export function googleRefundFixture({context=googleRefundContext,count=28,refunds,
  account='acct_platform',charge='ch_sale',association='taxa_sale',original='tax_sale'}={}){
  refunds??=Array.from({length:count},(_,i)=>({id:`re_${String(i).padStart(3,'0')}`,amount:10,tax:1}));
  const list=data=>({object:'list',data,has_more:false});
  const transaction=(id,reversal)=>({id,object:'tax.transaction',currency:context.currency,livemode:false,
    type:reversal?'reversal':'transaction',reversal:reversal?{original_transaction:original}:null,shipping_cost:null});
  const line=(id,amount,tax,reversal)=>({id,object:'tax.transaction_line_item',amount,amount_tax:tax,
    livemode:false,type:reversal?'reversal':'transaction',tax_behavior:'inclusive'});
  const data={
    '/account':{id:account,object:'account'},
    [`/checkout/sessions/${context.checkout_id}`]:{id:context.checkout_id,object:'checkout.session',livemode:false,
      mode:'payment',status:'complete',payment_status:'paid',client_reference_id:context.quote_id,
      payment_intent:context.payment_intent_id,currency:context.currency,amount_total:context.gross_minor,
      automatic_tax:{enabled:true,status:'complete'},total_details:{amount_tax:context.tax_minor,amount_discount:0,amount_shipping:0},
      metadata:context.feature==='creator_tip'?{chillywood_tip_id:context.quote_id,fan_user_id:context.buyer_id,creator_user_id:context.creator_id}
        :{auction_quote_id:context.quote_id,buyer_user_id:context.buyer_id}},
    [`/payment_intents/${context.payment_intent_id}`]:{id:context.payment_intent_id,object:'payment_intent',livemode:false,
      status:'succeeded',currency:context.currency,amount:context.gross_minor,amount_received:context.gross_minor,
      latest_charge:charge,transfer_data:context.feature==='creator_tip'?{destination:context.recipient_account_id}:null,
      application_fee_amount:null,on_behalf_of:null},
    [`/charges/${charge}`]:{id:charge,object:'charge',livemode:false,payment_intent:context.payment_intent_id,currency:context.currency,
      paid:true,captured:true,amount:context.gross_minor,amount_captured:context.gross_minor,
      amount_refunded:refunds.reduce((sum,r)=>sum+r.amount,0),disputed:false},
    [`/refunds?charge=${charge}&limit=100`]:list(refunds.map(r=>({id:r.id,charge,payment_intent:context.payment_intent_id,
      currency:context.currency,status:'succeeded',amount:r.amount,balance_transaction:null}))),
    [`/tax/associations/find?payment_intent=${context.payment_intent_id}`]:{id:association,object:'tax.association',
      payment_intent:context.payment_intent_id,tax_transaction_attempts:[{source:context.payment_intent_id,status:'committed',committed:{transaction:original}},
        ...refunds.map(r=>({source:r.id,status:'committed',committed:{transaction:`tax_${r.id.slice(3)}`}}))]},
    [`/tax/transactions/${original}`]:transaction(original,false),
    [`/tax/transactions/${original}/line_items?limit=100`]:list([line('tax_li_original',context.gross_minor,context.tax_minor,false)]),
  };
  for(const refund of refunds){
    const id=`tax_${refund.id.slice(3)}`;
    data[`/tax/transactions/${id}`]=transaction(id,true);
    data[`/tax/transactions/${id}/line_items?limit=100`]=list([line(`tax_li_${refund.id.slice(3)}`,-refund.amount,-refund.tax,true)]);
  }
  const calls=[];
  const transport=async(url,init)=>{
    assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
    assert.equal(init.headers.Authorization,'Bearer sk_test_synthetic');
    assert.equal(init.headers['Stripe-Version'],'2026-10-28.endive');
    const parsed=new URL(url);assert.equal(parsed.origin,'https://api.stripe.com');
    const path=parsed.pathname.replace(/^\/v1/,'')+parsed.search;calls.push(path);
    assert.ok(Object.hasOwn(data,path),`Unexpected fixture GET ${path}`);
    return data[path] instanceof Response?data[path].clone():Response.json(data[path]);
  };
  return {context,data,calls,transport};
}

export function googleHistoryClient({context=googleRefundContext,checkpoint={},busy=false,save}={}){
  const calls=[],generation=randomUUID(),state={checkpoint:structuredClone(checkpoint),lease:null};
  const client={rpc:async(name,args)=>{
    calls.push({name,args:structuredClone(args)});
    if(name==='begin_google_refund_tax_history'){
      assert.equal(args.p_transaction_id,context.transaction_id);assert.equal(args.p_account_id,'acct_platform');
      state.lease=randomUUID();
      return {error:null,data:busy?{busy:true}:{generation,lease:state.lease,context:structuredClone(context),checkpoint:structuredClone(state.checkpoint)}};
    }
    assert.equal(name,'save_google_refund_tax_history','helper must never directly record evidence or submit Google reports');
    assert.equal(args.p_transaction_id,context.transaction_id);assert.equal(args.p_generation,generation);assert.equal(args.p_lease,state.lease);
    if(save)return save(args,state);
    state.checkpoint=structuredClone(args.p_checkpoint);
    return {error:null,data:args.p_facts?{status:'history_complete',evidenceRecorded:true,financialAuthority:false}
      :{status:'history_pending',financialAuthority:false}};
  }};
  return {client,calls,state,generation};
}
