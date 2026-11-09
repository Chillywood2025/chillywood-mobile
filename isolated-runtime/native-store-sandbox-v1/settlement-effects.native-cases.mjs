import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
// All external facts are explicitly synthetic. This composes the real private
// worker, authenticated encrypted bytes and actual service-only PostgreSQL RPCs.
export async function runSettlementEffectCases(x){
 const {q,json,literal,call,actor,load,fresh,qualify,dispatch,conf}=x;let cases=0;
 const service="set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
 const worker=load('native-store-effect-worker-v1.ts');
 const reconciliation=load('native-store-reconciliation-handler-v1.ts').createNativeStoreReconciliationHandlerV1;
 const retainedBodies=new Map();
 // Reconciliation is entered automatically by authenticated webhook redelivery,
 // never a manual service call. The standalone service authority is tested below.
 const processEffect=async(w,d)=>{const candidate=read(`public.native_store_sandbox_effect_candidate_v1('${w.rawReceiptId}')`);assert.deepEqual(candidate.work,w);let outcome;
  const handler=ingress({connection:()=>conf,persist:async intake=>read(`public.native_store_sandbox_journal_v1(${json(intake)})`),
   reconcile:async(id,deadlineMs)=>(outcome=await worker.processPersistedNativeStoreReceiptV1(id,{...d,readCandidate:async raw=>read(`public.native_store_sandbox_effect_candidate_v1('${raw}')`)},{deadlineMs}))});
  const response=await handler(new Request('https://local.invalid',{method:'POST',headers:{authorization:conf.authentication.secret},body:retainedBodies.get(w.rawReceiptId)}));
  assert.ok(outcome);assert.equal(response.status,503);const body=await response.json();assert.equal(body.durable,true);assert.equal(body.acknowledgementAllowed,false);assert.equal(body.grantsAccess,false);assert.equal('nativeConsumerEffect' in body,false);return outcome;};
 const read=sql=>JSON.parse(q(service+'select '+sql+';'));
 const workArgs=w=>`'${w.rawReceiptId}',${w.claimId?"'"+w.claimId+"'":'null'},'${w.protocolId}',${w.protocolRevision}`;
 const deps={readContext:async w=>read(`public.native_store_sandbox_effect_context_v1(${workArgs(w)})`),
  readOriginalJournal:async id=>read(`public.native_store_sandbox_journal_read_v1('${id}')`),
  resolveOriginalConnection:async registry=>{assert.equal(registry.id,conf.connectionId);assert.equal(registry.revision,1);return conf;},
  applyEffect:async(w,projection)=>read(`public.native_store_sandbox_effect_v1(${workArgs(w)},${json(projection)})`)};
 const ingress=load('native-store-ingress-handler-v1.ts').createNativeStoreIngressHandlerV1;
 const automaticOutcomes=new Map();
 const retain=async(event,automatic=false)=>{let persisted;const rawBody=typeof event==='string'?event:JSON.stringify({api_version:'1.0',event});
  const handler=ingress({connection:()=>conf,persist:async intake=>(persisted=read(`public.native_store_sandbox_journal_v1(${json(intake)})`)),
   ...(automatic?{reconcile:async(id,deadlineMs)=>{const outcome=await worker.processPersistedNativeStoreReceiptV1(id,{...deps,readCandidate:async raw=>read(`public.native_store_sandbox_effect_candidate_v1('${raw}')`)},{deadlineMs});automaticOutcomes.set(id,outcome);return outcome;}}:{})});
  const response=await handler(new Request('https://local.invalid',{method:'POST',headers:{authorization:conf.authentication.secret},body:rawBody}));
  assert.equal(response.status,503);const body=await response.json();assert.equal(body.durable,true);assert.equal(body.acknowledgementAllowed,false);assert.equal(body.dispatchAllowed,false);assert.ok(persisted);retainedBodies.set(persisted.receiptId,rawBody);return persisted.receiptId;};
 let unauthorizedWrites=0;const unauthorized=await ingress({connection:()=>conf,persist:async()=>{unauthorizedWrites++;throw Error('must not write');}})(new Request('https://local.invalid',{method:'POST',headers:{authorization:'incorrect-synthetic-secret'},body:'{}'}));assert.equal(unauthorized.status,401);assert.equal(unauthorizedWrites,0);cases++;
 let unauthorizedEffects=0;const guarded=reconciliation({enabled:()=>true,authenticate:async()=>false,process:async()=>{unauthorizedEffects++;throw Error('must not process');}});
 assert.equal((await guarded(new Request('https://local.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rawReceiptId:randomUUID()})}))).status,403);assert.equal(unauthorizedEffects,0);cases++;
 const f=fresh(),qid=qualify(f);assert.equal(dispatch(f.r).dispatchAllowed,true);
 const txn='synthetic-effect-'+randomUUID(),now=Date.now();
 const claim=call('claim',{selectionId:f.r.selectionId,transactionIdentifier:txn,productIdentifier:f.quote.catalog.wireProductId}).data.claim;
 const event={id:'synthetic-positive-'+randomUUID(),type:'NON_RENEWING_PURCHASE',app_id:conf.appId,store:conf.store,environment:'SANDBOX',
  app_user_id:actor.userId,original_app_user_id:actor.userId,transaction_id:txn,original_transaction_id:txn,product_id:f.quote.catalog.wireProductId,
  purchased_at_ms:now,event_timestamp_ms:now,price_in_purchased_currency:f.quote.amountMinor/100,currency:'USD',quantity:1,expiration_at_ms:null};
 const raw=await retain(event),pid=randomUUID(),cid=claim.id.slice(12);
 q(`insert into sandbox_commerce_v1.native_store_settlement_protocols(id,revision,sample_qualification_id,sample_qualification_revision,sample_claim_id,sample_raw_receipt_id,pair_evidence_sha256,lifecycle_evidence_sha256,policy)
 values('${pid}',1,'${qid}',1,'${cid}','${raw}',repeat('c',64),repeat('d',64),'exact_native_usd_consumable_v1');`);
 const work={rawReceiptId:raw,claimId:cid,protocolId:pid,protocolRevision:1};
 const candidateSql=`public.native_store_sandbox_effect_candidate_v1('${raw}')`;
 for(const role of ['anon','authenticated'])assert.throws(()=>q(`set role ${role};select ${candidateSql};`),/permission denied/u);
 assert.throws(()=>q(`set role service_role;select sandbox_commerce_v1.native_store_effect_candidate('${raw}');`),/permission denied/u);
 assert.throws(()=>q('set role service_role;select * from sandbox_commerce_v1.native_store_allocations;'),/permission denied/u);cases++;
 // A client assertion alone cannot squat an authenticated transaction. A second
 // same-buyer assertion lacking qualified consumption is ignored, not allocated.
 const unqualified=call('prepare',f.preparePayload).data.selection;
 call('claim',{selectionId:unqualified.id,transactionIdentifier:txn,productIdentifier:event.product_id});
 const otherActor={userId:x.other,accountId:x.other,sessionGeneration:x.otherSession};
 const otherSelection=call('prepare',f.preparePayload,undefined,otherActor).data.selection;
 call('claim',{selectionId:otherSelection.id,transactionIdentifier:txn,productIdentifier:event.product_id},undefined,otherActor);
 assert.deepEqual(read(candidateSql).work,work);cases++;
 const ambiguousId=randomUUID();const ambiguous=JSON.parse(q(`begin;insert into sandbox_commerce_v1.native_store_settlement_protocols(id,revision,sample_qualification_id,sample_qualification_revision,sample_claim_id,sample_raw_receipt_id,pair_evidence_sha256,lifecycle_evidence_sha256,policy)
 values('${ambiguousId}',1,'${qid}',1,'${cid}','${raw}',repeat('e',64),repeat('f',64),'exact_native_usd_consumable_v1');`+service+'select '+candidateSql+';rollback;'));
 assert.equal(ambiguous.status,'held');assert.equal(ambiguous.work,null);cases++;
 const context=await deps.readContext(work);assert.equal(context.raw.rawReceiptId,raw);assert.equal(context.settlementProtocol.signedAppVersion,'100.7');cases++;
 const result=await processEffect(work,deps);assert.equal(result.status,'processed',JSON.stringify(result));assert.equal(result.nativeConsumerEffect.effectKind,'positive_applied');assert.equal(result.acknowledgementAllowed,false);cases++;
 const receipt=q(`select core_receipt_id from sandbox_commerce_v1.native_store_allocations where raw_receipt_id='${raw}';`);
 assert.equal(q(`select count(*) from sandbox_commerce_v1.native_store_core_links where core_receipt_id='${receipt}';`),'1');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.resource_grants where receipt_id='${receipt}' and revoked_at is null;`),'1');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.native_store_reservation_terminals where allocation_id='${result.nativeConsumerEffect.allocationId.slice(17)}' and kind='allocated';`),'1');cases++;
 cases+=await (await import('./native-access.native-cases.mjs')).runNativeAccessCases(x,{f,receipt,result});
 const replay=await processEffect(work,deps);assert.equal(replay.nativeConsumerEffect.status,'already_processed');assert.equal(replay.nativeConsumerEffect.grantId,result.nativeConsumerEffect.grantId);cases++;
 // A completed allocation releases the SKU only for a NEW immutable selection.
 const next=()=>{const selection=call('prepare',f.preparePayload).data.selection;const reservation=call('reserve',{selectionId:selection.id}).data.reservation;return {selection,reservation};};
 const second=next();assert.notEqual(second.reservation.id,f.r.id);assert.equal(dispatch(second.reservation).dispatchAllowed,true);
 assert.equal((await processEffect(work,deps)).nativeConsumerEffect.allocationId,result.nativeConsumerEffect.allocationId);
 assert.equal(q(`select count(*) from sandbox_commerce_v1.native_store_reservation_terminals where selection_id='${second.selection.id.slice(16)}';`),'0');cases++;
 const txn2='synthetic-refund-first-'+randomUUID(),t2=Date.now();
 const claim2=call('claim',{selectionId:second.selection.id,transactionIdentifier:txn2,productIdentifier:event.product_id}).data.claim;
 const event2={...event,id:'synthetic-refund-first-positive-'+randomUUID(),transaction_id:txn2,original_transaction_id:txn2,purchased_at_ms:t2,event_timestamp_ms:t2};
 const refundFirst={...event2,id:'synthetic-refund-first-negative-'+randomUUID(),type:'CANCELLATION',cancel_reason:'CUSTOMER_SUPPORT'};
 const refundFirstRaw=await retain(refundFirst,true);
 assert.equal(automaticOutcomes.get(refundFirstRaw).nativeConsumerEffect.effectKind,'negative_applied');cases++;
 assert.equal((await processEffect({...work,rawReceiptId:refundFirstRaw,claimId:null},deps)).nativeConsumerEffect.effectKind,'negative_applied');
 const lateRaw=await retain(event2,true),lateWork={...work,rawReceiptId:lateRaw,claimId:claim2.id.slice(12)};
 assert.equal(automaticOutcomes.get(lateRaw).nativeConsumerEffect.effectKind,'purchase_tombstoned');cases++;
 const late=await processEffect(lateWork,deps);assert.equal(late.status,'processed',JSON.stringify(late));assert.equal(late.nativeConsumerEffect.effectKind,'purchase_tombstoned');
 assert.equal(late.nativeConsumerEffect.allocationId,null);assert.equal(late.nativeConsumerEffect.grantId,null);
 assert.equal(q(`select kind from sandbox_commerce_v1.native_store_reservation_terminals where selection_id='${second.selection.id.slice(16)}';`),'refunded_before_allocation');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.native_store_allocations where claim_id='${claim2.id.slice(12)}';`),'0');cases++;
 const third=next();assert.equal(dispatch(third.reservation).dispatchAllowed,true);
 const txn3='synthetic-rollback-'+randomUUID(),t3=Date.now(),claim3=call('claim',{selectionId:third.selection.id,transactionIdentifier:txn3,productIdentifier:event.product_id}).data.claim;
 const event3={...event,id:'synthetic-rollback-positive-'+randomUUID(),transaction_id:txn3,original_transaction_id:txn3,purchased_at_ms:t3,event_timestamp_ms:t3};
 let raw3,work3;
 q(`create function sandbox_commerce_v1.synthetic_fail_terminal() returns trigger language plpgsql as $$begin raise exception 'synthetic_late_terminal_failure';end$$;
 create trigger synthetic_fail_terminal before insert on sandbox_commerce_v1.native_store_reservation_terminals for each row execute function sandbox_commerce_v1.synthetic_fail_terminal();`);
 raw3=await retain(event3,true);work3={...work,rawReceiptId:raw3,claimId:claim3.id.slice(12)};
 const failed=automaticOutcomes.get(raw3);assert.equal(failed.status,'unknown');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.native_store_allocations where raw_receipt_id='${raw3}';`),'0');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.native_store_raw_effects where raw_receipt_id='${raw3}';`),'0');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.receipts where transaction_id=${literal(txn3)};`),'0');
 q('drop trigger synthetic_fail_terminal on sandbox_commerce_v1.native_store_reservation_terminals;drop function sandbox_commerce_v1.synthetic_fail_terminal();');
 const firstDeliveryRetry=await retain(event3,true);assert.equal(firstDeliveryRetry,raw3);assert.equal(automaticOutcomes.get(raw3).nativeConsumerEffect.status,'processed');cases++;
 const uncertain=await processEffect(work3,{...deps,applyEffect:async(w,p)=>{await deps.applyEffect(w,p);throw Error('synthetic committed response lost');}});assert.equal(uncertain.status,'unknown');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.native_store_allocations where raw_receipt_id='${raw3}';`),'1');
 const succeeded=await processEffect(work3,deps);assert.equal(succeeded.status,'processed',JSON.stringify(succeeded));assert.equal(succeeded.nativeConsumerEffect.status,'already_processed');assert.equal(succeeded.nativeConsumerEffect.effectKind,'positive_applied');cases++;
 const fourth=next();assert.equal(dispatch(fourth.reservation).dispatchAllowed,true);
 const txn4='synthetic-inline-first-'+randomUUID(),t4=Date.now();
 call('claim',{selectionId:fourth.selection.id,transactionIdentifier:txn4,productIdentifier:event.product_id});
 const raw4=await retain({...event,id:'synthetic-inline-first-'+randomUUID(),transaction_id:txn4,original_transaction_id:txn4,purchased_at_ms:t4,event_timestamp_ms:t4},true);
 assert.equal(automaticOutcomes.get(raw4).nativeConsumerEffect.status,'processed');
 assert.equal(automaticOutcomes.get(raw4).nativeConsumerEffect.effectKind,'positive_applied');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.native_store_allocations where raw_receipt_id='${raw4}';`),'1');cases++;
 const negative={...event,id:'synthetic-refund-'+randomUUID(),type:'CANCELLATION',event_timestamp_ms:Date.now(),cancel_reason:'CUSTOMER_SUPPORT'};
 const negativeRaw=await retain(negative),negativeWork={...work,rawReceiptId:negativeRaw,claimId:null};
 assert.equal(q(`select count(*) from sandbox_commerce_v1.resource_delivery_holds where receipt_id='${receipt}' and resolved_at is null;`),'1');
 const refunded=await processEffect(negativeWork,deps);assert.equal(refunded.status,'processed',JSON.stringify(refunded));assert.equal(refunded.nativeConsumerEffect.effectKind,'negative_applied');
 assert.equal(q(`select state from sandbox_commerce_v1.receipts where id='${receipt}';`),'refunded');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.resource_grants where receipt_id='${receipt}' and revoked_at is not null;`),'1');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.resource_delivery_holds where receipt_id='${receipt}' and reason like 'native_store_refund:%' and resolved_at is null;`),'1');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.resource_delivery_holds where receipt_id='${receipt}' and reason like 'native_store_pending_raw:%' and resolved_at is null;`),'0');cases++;
 assert.equal((await processEffect(work,deps)).nativeConsumerEffect.status,'already_processed');assert.equal(q(`select state from sandbox_commerce_v1.receipts where id='${receipt}';`),'refunded');cases++;
 assert.equal(await retain(event),raw);cases++;
 const conflictRaw=await retain({...event,event_timestamp_ms:event.event_timestamp_ms+1},true);assert.equal(automaticOutcomes.has(conflictRaw),false);
 assert.equal(read(`public.native_store_sandbox_effect_candidate_v1('${conflictRaw}')`).status,'held');
 assert.equal(read(`public.native_store_sandbox_effect_candidate_v1('${raw}')`).status,'held');
 assert.ok(Number(q(`select count(*) from sandbox_commerce_v1.resource_delivery_holds where receipt_id='${receipt}' and resolved_at is null;`))>0);cases++;
 const malformed=await retain('{synthetic-malformed-json',true);assert.equal(automaticOutcomes.get(malformed).status,'held');assert.equal(read(`public.native_store_sandbox_effect_candidate_v1('${malformed}')`).status,'held');cases++;
 console.log(JSON.stringify({protocol:'native-store-authenticated-effects-managed-proof-v1',cases,passed:cases,realWorker:true,realPostgres:true,automaticWebhookProcessing:true,syntheticProviderEvidenceOnly:true,providerObserved:false}));return cases;
}
