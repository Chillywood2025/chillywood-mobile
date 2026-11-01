import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import * as storePolicy from '../../supabase/functions/revenuecat-webhook/store-policy.mjs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

const source = fs.readFileSync('supabase/functions/revenuecat-webhook/index.ts','utf8');
const ast = ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const code = ts.transpileModule(ast.statements.filter(n=>!ts.isImportDeclaration(n))
  .map(n=>n.getText(ast)).join('\n'), {
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
}).outputText;

// Run the actual entire handler. Transport and provider database are doubles;
// the separate full-schema test below executes the actual SQL entry points.
function harness({signature=true, configured=true, ingressFailure=false, nonpurchase=false}={}) {
  let handler;
  const calls=[];
  const hashes=new Map();
  const client={rpc:async(name,args)=>{
    calls.push({name,args});
    if(nonpurchase && name==='process_revenuecat_nonpurchase_lifecycle_atomic') {
      return {data:{status:'pending',reason:'independent_provider_snapshot_required',accessStateChanged:false,
        authorityGranted:false,financialAuthority:false},error:null};
    }
    if(name!=='reserve_revenuecat_webhook_ingress_event') {
      throw new Error(`Unexpected authority mutation: ${name}`);
    }
    if(ingressFailure) return {data:null,error:{message:'database unavailable'}};
    const prior=hashes.get(args.p_provider_event_id);
    if(prior && prior!==args.p_raw_payload_hash) return {data:null,error:{message:'revenuecat_webhook_ingress_identity_mismatch'}};
    hashes.set(args.p_provider_event_id,args.p_raw_payload_hash);
    return {data:{status:prior?'duplicate':'reserved',providerEventId:args.p_provider_event_id,
      duplicateEvent:!!prior,authorityGranted:false},error:null};
  }};
  const context={...storePolicy,Request,Response,Headers,URL,TextEncoder,console,
    setTimeout,clearTimeout,AbortController,Date,
    Deno:{serve:fn=>{handler=fn;},env:{get:()=>undefined}},
    RevenueCatAdapter:class {getSafeStatus(){return {safeSummary:'synthetic configuration'};}},
    createAdminClient:()=>({configured,client}),readOptionalEnv:()=> 'synthetic-secret',
    verifySharedWebhookSecret:()=>signature,
    hashText:async text=>createHash('sha256').update(text).digest('hex'),
    jsonResponse:(status,body)=>new Response(JSON.stringify(body),{status}),
    optionsResponse:()=>new Response(null,{status:204}),
    toText:value=>typeof value==='string'?value.trim():'',
    sanitizeErrorMessage:error=>error instanceof Error?error.message:String(error),
    writeProviderReadinessAudit:async()=>{},
  };
  vm.runInNewContext(code,context);
  return {calls,send:async event=>{
    const response=await handler(new Request('https://synthetic.invalid/webhook',{
      method:'POST',body:JSON.stringify({event}),
    }));
    return {status:response.status,body:await response.json()};
  }};
}

test('scheduled pause is durably received without terminal dispatch, including duplicate and absent product fields',async()=>{
  const h=harness();
  const event={id:'pause-1',type:'SUBSCRIPTION_PAUSED',store:'PLAY_STORE',environment:'PRODUCTION'};
  for(let i=0;i<2;i++) {
    const result=await h.send(event);
    assert.equal(result.status,200);
    assert.equal(result.body.reason,'subscription_pause_scheduled');
    assert.equal(result.body.accessStateChanged,false);
    assert.equal(result.body.authorityGranted,false);
  }
  assert.deepEqual(h.calls.map(c=>c.name),[
    'reserve_revenuecat_webhook_ingress_event','reserve_revenuecat_webhook_ingress_event',
  ]);
});

test('scheduled pause preserves authentication, durable receipt and immutable identity boundaries',async()=>{
  const event={id:'pause-boundaries',type:'SUBSCRIPTION_PAUSED'};
  const unsigned=harness({signature:false});
  assert.equal((await unsigned.send(event)).status,401);
  assert.equal(unsigned.calls.length,0);
  assert.equal((await harness({configured:false}).send(event)).status,503);
  assert.equal((await harness({ingressFailure:true}).send(event)).status,500);
  const collision=harness();
  await collision.send(event);
  const changed=await collision.send({...event,product_id:'changed'});
  assert.equal(changed.body.premiumGranted,false);
  assert.equal(changed.body.webhookProcessed,false);
  assert.ok(collision.calls.every(c=>c.name==='reserve_revenuecat_webhook_ingress_event'));
});

test('deferred product change does not activate new SKU or alter current access',async()=>{
  const h=harness();
  for(const store of ['APP_STORE','PLAY_STORE']) {
    const event={id:`change-${store}`,type:'PRODUCT_CHANGE',store,environment:'PRODUCTION',
      product_id:'current.product',new_product_id:'future.product',expiration_at_ms:Date.now()+86400000};
    for(let i=0;i<2;i++) {
      const result=await h.send(event);
      assert.equal(result.status,200);
      assert.equal(result.body.reason,'product_change_pending_effective_proof');
      assert.equal(result.body.accessStateChanged,false);
      assert.equal(result.body.authorityGranted,false);
    }
  }
  assert.ok(h.calls.every(c=>c.name==='reserve_revenuecat_webhook_ingress_event'));
});

test('extensions and refund reversals reach nonpurchase reconciliation, never UNKNOWN terminal quarantine',async()=>{
  const h=harness({nonpurchase:true});
  for(const type of ['SUBSCRIPTION_EXTENDED','REFUND_REVERSED']) {
    const result=await h.send({id:`nonpurchase-${type}`,type,store:'PLAY_STORE',environment:'SANDBOX',
      product_id:'premium_subscription:monthly',original_transaction_id:'exact.original',
      app_user_id:'9b470000-0000-4000-8000-000000000011',purchased_at_ms:Date.now()-1000,
      expiration_at_ms:Date.now()+3600000,event_timestamp_ms:Date.now()});
    assert.equal(result.status,200);assert.equal(result.body.authorityGranted,false);
    assert.equal(result.body.accessStateChanged,false);
  }
  const calls=h.calls.filter(c=>c.name==='process_revenuecat_nonpurchase_lifecycle_atomic');
  assert.equal(calls.length,2);
  assert.equal(calls[0].args.p_provider_product_id,'premium_subscription');
  assert.equal(calls[0].args.p_provider_base_plan_id,'monthly');
  assert.equal(calls[0].args.p_environment,'sandbox');
  assert.ok(!h.calls.some(c=>/quarantine|terminal_event/.test(c.name)));
});

test('actual expiration is not swallowed by the scheduled-pause branch',async()=>{
  const h=harness();
  await h.send({id:'expiration-1',type:'EXPIRATION',store:'PLAY_STORE',environment:'PRODUCTION',
    app_user_id:'00000000-0000-4000-8000-000000000001',original_transaction_id:'GPA.synthetic',
    event_timestamp_ms:Date.now(),expiration_at_ms:Date.now()-1000});
  assert.ok(h.calls.some(c=>c.name==='process_revenuecat_terminal_event_atomic'));
});

test('all current database entry-point overloads ignore a scheduled pause without changing financial or access rows',
  {timeout:240000},async()=>{
    const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
    try {
      const names=['process_revenuecat_terminal_event_atomic','process_revenuecat_google_play_event_atomic',
        'process_revenuecat_app_store_event_atomic','process_revenuecat_premium_event_atomic',
        'process_revenuecat_live_watch_party_event_atomic'];
      const functions=(await db.query(`select p.oid::regprocedure::text signature,p.proname,
        p.proargnames,p.proargtypes::oid[] types from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname=any($1) order by signature`,[names])).rows;
      assert.equal(functions.length,8);
      const before=(await db.query(`select
        (select count(*)::int from public.provider_events) providers,
        (select count(*)::int from public.access_grants) grants,
        (select count(*)::int from public.money_access_ledger_events) ledger`)).rows[0];
      let serial=0;
      for(const fn of functions) {
       for(const eventType of ['SUBSCRIPTION_PAUSED','PRODUCT_CHANGE','SUBSCRIPTION_EXTENDED','REFUND_REVERSED']) {
        const id=`sql-scheduled-pause-${serial++}`;
        const args=[];const values=[];
        for(let i=0;i<fn.proargnames.length;i++) {
          const name=fn.proargnames[i];
          const value=name==='p_event_type'?eventType
            :name==='p_provider_event_id'?id:name==='p_raw_payload_hash'?'a'.repeat(64):null;
          values.push(value);
          const type=(await db.query('select format_type($1::oid,null) as type',[fn.types[i]])).rows[0].type;
          args.push(`$${i+1}::${type}`);
        }
        const call=`select public.${fn.proname}(${args.join(',')}) result`;
        const first=(await db.query(call,values)).rows[0].result;
        const reason=eventType==='PRODUCT_CHANGE'?'product_change_pending_effective_proof'
          :eventType==='SUBSCRIPTION_PAUSED'?'subscription_pause_scheduled':'independent_provider_snapshot_required';
        assert.equal(first.reason,reason,fn.signature);
        assert.equal(first.accessStateChanged,false);
        const second=(await db.query(call,values)).rows[0].result;
        assert.equal(second.duplicateEvent,true);
        const changed=[...values];
        changed[fn.proargnames.indexOf('p_raw_payload_hash')]='b'.repeat(64);
        await assert.rejects(db.query(call,changed),/identity_mismatch/);
        for(const role of ['anon','authenticated']) {
          const allowed=(await db.query('select has_function_privilege($1,$2,\'EXECUTE\') ok',[role,fn.signature])).rows[0].ok;
          assert.equal(allowed,false,`${role} ${fn.signature}`);
        }
       }
      }
      const after=(await db.query(`select
        (select count(*)::int from public.provider_events) providers,
        (select count(*)::int from public.access_grants) grants,
        (select count(*)::int from public.money_access_ledger_events) ledger`)).rows[0];
      assert.deepEqual(after,before);
    } finally {await db.close();}
  });
