// Disposable local fixture only. Real SQL/crypto/provider-worker source with
// explicitly synthetic provider/scanner facts. Checkout preparation belongs to
// the authenticated FOURTH Edge entry, never a service-only checkout shortcut.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createV3CommandApi,createV3SourceLoader,sqlText} from './snapshot/isolated-runtime/sandbox-commerce-v1/tests/test-store-v3.fixture.mjs';
import {createV3ProviderFixture,providerSources} from './snapshot/isolated-runtime/sandbox-commerce-v1/tests/test-store-v3-provider.fixture.mjs';
import {createV3ReceiptFixture} from './snapshot/isolated-runtime/sandbox-commerce-v1/tests/test-store-v3-receipts.fixture.mjs';
import {signScanResult} from './snapshot/ops/isolated-paid-video-worker/scan.mjs';
const input=JSON.parse(fs.readFileSync(0,'utf8')),repo=path.join(path.dirname(fileURLToPath(import.meta.url)),'snapshot');
assert.match(input.database,/^chillywood-[a-z0-9-]+-db$/u);
assert.ok(Array.isArray(input.dockerArgs)&&input.dockerArgs.length>=1);
const q=statement=>{const result=spawnSync(input.dockerArgs[0],[...input.dockerArgs.slice(1),'exec','-i',input.database,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],{input:statement,encoding:'utf8',timeout:30000});
  if(result.status!==0)throw Error(result.stderr);return result.stdout.trim();};
const api=createV3CommandApi(q),receipts=createV3ReceiptFixture(q,api,repo);
const command=(actor,name,payload)=>api.call(name,payload,randomUUID(),actor).result;
const claimPayload=c=>({intentId:c.intent.id,dispatchId:c.allocation.dispatchId,registrationId:c.allocation.registration.id,expectedQuote:c.quote});
const stateFor=c=>command(c.actor,'read',{intentId:c.intent.id});
const receiptResult=(context,ingress,event)=>{
  const raw=q(`select result from sandbox_commerce_v1.test_store_v3_effects where ingress_id=${sqlText(ingress.receiptId)};`);
  const output={...context,event,ingressId:ingress.receiptId,ingressStatus:ingress.status,provider:'explicitly synthetic worker fixture',rawReceipt:'actual crypto/parser/SQL'};
  if(!raw)return {...output,grantId:null,projection:null};
  const effect=JSON.parse(raw),id=q(`select id from sandbox_commerce_v1.resource_grants where receipt_id=${sqlText(effect.projection.receiptId)};`);
  assert.match(id,/^[a-f0-9-]{36}$/u);return {...output,grantId:'scv1_grant_'+id,projection:effect.projection};
};
let output;
if(input.action==='sign_scan'){
  const {upload,receipt,config,ticket}=input;
  assert.equal(ticket.uploadId,upload.id);assert.equal(ticket.objectVersion,receipt.objectVersion);
  const result={protocol:'scpv-byte-scan-v1',profile:'scpv-mp4-h264-aac-v1',sha256:receipt.sha256,byteLength:receipt.byteLength,checkedAt:new Date().toISOString(),
    definitions:{protocol:'scpv-definition-manifest-v1',files:[{filename:'daily.cvd',createdAt:new Date().toISOString()}],manifestSha256:'7'.repeat(64)},
    moderation:'unreviewed',verdict:'clean',reason:'exact_bytes_scanned',media:{durationMs:1000,width:320,height:180,framesPerSecond:24,videoCodec:'h264',pixelFormat:'yuv420p',audioCodec:null}};
  output=signScanResult({key:Buffer.from(config.workerKey,'hex'),ticketId:ticket.ticketId,uploadId:upload.id,incarnation:upload.incarnation,objectVersion:receipt.objectVersion,result});
}else if(input.action==='allocate'){
  const {actor,intent,quote}=input;assert.equal(intent.quote.offerId,quote.offerId);assert.deepEqual(intent.quote,quote);assert.equal(intent.state,'prepared');
  const provider=createV3ProviderFixture(q,repo,createV3SourceLoader(providerSources(repo)));
  const customer=input.customer??command(actor,'bind',{installationId:randomUUID()}).customer;
  const payload={customerBindingId:customer.id,intentId:intent.id,expectedQuote:quote},economicReadinessChecks={};
  if(input.checkReadiness){
    q('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=false;');
    try{assert.throws(()=>command(actor,'allocate',payload),/paid_video_verified_media_required/u);
      assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v3_allocations where intent_id=${sqlText(intent.id.slice(12))};`),'0');}
    finally{q('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true;');}
    economicReadinessChecks.disabledGatewayRefusesAllocation=true;
  }
  const allocation=command(actor,'allocate',payload).allocation,plan=provider.planFor(allocation,actor.userId);
  if(input.checkReadiness){
    q('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=false;');
    try{const stopped=await provider.runWorker(plan);assert.notEqual(stopped.result.status,'registered');
      assert.ok(provider.calls.length>0&&provider.calls.every(call=>call.method==='GET'));
      assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v3_tickets where plan_id=${sqlText(plan)} and operation in ('create_offering','create_package','attach_product');`),'0');}
    finally{q('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true;');}
    economicReadinessChecks.disabledGatewayAllowsReadOnlyProviderGetButNoPostPermit=true;
  }
  const started=Date.now();
  while(Number(q("select count(*) from sandbox_commerce_v1.test_store_v3_tickets where consumed_at>clock_timestamp()-interval '1 minute';"))>45){assert.ok(Date.now()-started<65000);await delay(250);}
  await provider.registerPlan(allocation,actor);
  const ready=command(actor,'read',{intentId:intent.id});assert.equal(ready.status,'offering_ready');
  output={actor,intent,quote,customer:ready.customer,allocation:ready.allocation,reservation:ready.reservation,plan,economicReadinessChecks};
}else if(input.action==='claim'){
  const c=input.context,payload=claimPayload(c);
  if(input.mustReject){assert.throws(()=>command(c.actor,'claim',payload),/test_store_v3_initiation_held|test_store_v3_prepared_close/u);
    output={rejected:true,dispatchAttempts:Number(q(`select count(*) from sandbox_commerce_v1.dispatch_attempts where intent_id=${sqlText(c.intent.id.slice(12))};`))};}
  else{const claim=command(c.actor,'claim',payload);assert.equal(claim.dispatchAllowed,true);output={...c,claim};}
}else if(input.action==='purchase'||input.action==='ingest'){
  const c=input.context;
  if(input.action==='purchase'){
    if(input.checkReadiness){q('update sandbox_commerce_v1.paid_video_verifiers set active=false where id=(select verifier_id from sandbox_commerce_v1.paid_video_gateway_controls where singleton);');
      try{assert.throws(()=>command(c.actor,'claim',claimPayload(c)),/paid_video_verified_media_required/u);
        assert.equal(q(`select count(*) from sandbox_commerce_v1.dispatch_attempts where intent_id=${sqlText(c.intent.id.slice(12))};`),'0');}
      finally{q('update sandbox_commerce_v1.paid_video_verifiers set active=true where id=(select verifier_id from sandbox_commerce_v1.paid_video_gateway_controls where singleton);');}
      c.economicReadinessChecks.retiredVerifierRefusesSdkClaim=true;
    }
    c.claim=command(c.actor,'claim',claimPayload(c));assert.equal(c.claim.dispatchAllowed,true);
  }
  const event=receipts.event(c);
  if(input.checkReadiness)q('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=false;');
  try{const ingress=await receipts.ingest(event);output=receiptResult(c,ingress,event);}
  finally{if(input.checkReadiness)q('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true;');}
  if(input.action==='purchase'){assert.equal(output.projection.state,'verified');if(input.checkReadiness)output.economicReadinessChecks.retainedReceiptSettlesAfterGatewayDisabled=true;}
  else{assert.equal(output.projection,null);assert.equal(output.ingressStatus,'recorded');output.retainedEnvelopeSha256=createHash('sha256').update(q(`select envelope::text from sandbox_commerce_v1.test_store_v3_ingress where id=${sqlText(output.ingressId)};`)).digest('hex');}
}else if(input.action==='advance'){
  const c=input.context,deadline=Number(q(`select floor(extract(epoch from authority_valid_until)*1000)::bigint from sandbox_commerce_v1.dispatch_attempts where intent_id=${sqlText(c.intent.id.slice(12))};`));
  assert.ok(Number.isSafeInteger(deadline));const wait=Math.max(0,deadline-Date.now()+30);assert.ok(wait<=5500);await delay(wait);
  const read=stateFor(c);assert.ok(read.receipt);const advanced=command(c.actor,'advance',{intentId:c.intent.id,dispatchId:c.allocation.dispatchId,expectedReservationRevision:read.reservation.revision,disposition:'receipt_recorded',expectedReceiptId:read.receipt.id});
  assert.equal(advanced.status,'released');output=advanced;
}else if(input.action==='effect'){
  output=receiptResult(input.context,{receiptId:input.ingressId,status:'reconciled'},input.event);
  assert.equal(output.projection.state,'verified');
}else if(input.action==='refund'){
  const event={...input.event,id:randomUUID(),type:'CANCELLATION',cancel_reason:'CUSTOMER_SUPPORT',price_in_purchased_currency:-1.99,event_timestamp_ms:Date.now()};
  const ingress=await receipts.ingest(event),effect=receipts.effect(ingress.receiptId);assert.equal(effect.projection.state,'refunded');output={state:'refunded'};
}else throw Error('Unknown fixture action');
console.log(JSON.stringify(output));
