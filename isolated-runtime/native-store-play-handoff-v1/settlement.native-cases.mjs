import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';

// Real encrypted intake, authenticated replay, service-only RPCs and common
// protected playback. Provider/account/media evidence is synthetic throughout.
export async function runPlaySettlementCases(x) {
 const {q,json,literal,call,actor,otherActor,buyer,session,newSession,fresh,enroll,dispatch,connection,resource,asset,route,root,service}=x;
 const names=[];const test=async(name,body)=>{await body();names.push(name);};
 const modules=new Map();function load(name){if(modules.has(name))return modules.get(name);const value={};modules.set(name,value);
  new Function('exports','require',ts.transpileModule(fs.readFileSync(path.join(root,'supabase/functions/_shared',name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(value,s=>{assert.ok(s.startsWith('./'));return load(s.slice(2));});return value;}
 const conf={bridgeProtocol:'native-store-sandbox-v1',connectionId:connection,connectionRevision:1,projectId:'synthetic-project',appId:'synthetic-app',store:'PLAY_STORE',environment:'SANDBOX',
  authentication:{method:'shared_secret',keyVersion:'synthetic-v1',secret:'synthetic-not-real-secret-'.repeat(3)},encryption:{keyId:'synthetic-key',key:new Uint8Array(32).fill(17)}};
 const read=sql=>JSON.parse(q(service+'select '+sql+';'));
 const args=w=>`'${w.rawReceiptId}',${w.claimId?"'"+w.claimId+"'":'null'},'${w.protocolId}',${w.protocolRevision}`;
 const worker=load('native-store-effect-worker-v1.ts'),ingress=load('native-store-ingress-handler-v1.ts').createNativeStoreIngressHandlerV1;
 const deps={readCandidate:async raw=>read(`public.native_store_sandbox_effect_candidate_v1('${raw}')`),
  readContext:async w=>read(`public.native_store_sandbox_effect_context_v1(${args(w)})`),
  readOriginalJournal:async id=>read(`public.native_store_sandbox_journal_read_v1('${id}')`),
  resolveOriginalConnection:async registry=>{assert.equal(registry.id,connection);assert.equal(registry.revision,1);return conf;},
  applyEffect:async(w,projection)=>read(`public.native_store_sandbox_effect_v1(${args(w)},${json(projection)})`)};
 const outcomes=new Map();const retained=new Map();
 const retain=async event=>{let persisted;const body=JSON.stringify({api_version:'1.0',event});
  const handler=ingress({connection:()=>conf,persist:async intake=>(persisted=read(`public.native_store_sandbox_journal_v1(${json(intake)})`)),
   reconcile:async(id,deadlineMs)=>{const result=await worker.processPersistedNativeStoreReceiptV1(id,deps,{deadlineMs});outcomes.set(id,result);return result;}});
  const response=await handler(new Request('https://synthetic.invalid',{method:'POST',headers:{authorization:conf.authentication.secret},body}));
  assert.equal(response.status,503);const reply=await response.json();assert.equal(reply.durable,true);assert.equal(reply.acknowledgementAllowed,false);assert.equal(reply.grantsAccess,false);
  assert.ok(persisted);retained.set(persisted.receiptId,body);return persisted.receiptId;};
 const process=raw=>worker.processPersistedNativeStoreReceiptV1(raw,deps);
 const count=()=>q('select (select count(*) from sandbox_commerce_v1.native_store_play_allocations),(select count(*) from sandbox_commerce_v1.receipts),(select count(*) from sandbox_commerce_v1.resource_grants);');
 const f=fresh(),enrollment=enroll(f);assert.equal(dispatch(f).dispatchAllowed,true);
 const txn='synthetic-play-'+randomUUID(),now=Date.now();
 const event={id:'synthetic-play-purchase-'+randomUUID(),type:'NON_RENEWING_PURCHASE',app_id:conf.appId,store:'PLAY_STORE',environment:'SANDBOX',
  app_user_id:buyer,original_app_user_id:buyer,transaction_id:txn,original_transaction_id:txn,product_id:f.quote.catalog.wireProductId,
  purchased_at_ms:now,event_timestamp_ms:now,price_in_purchased_currency:1.99,currency:'USD',quantity:1,expiration_at_ms:null};
 const claim=call('claim',{selectionId:f.selection.id,transactionIdentifier:txn,productIdentifier:event.product_id}).data.claim;
 await test('enrollment consumed attempt and SDK callback alone grant nothing',()=>{assert.equal(count(),'0|0|0');});
 const raw=await retain(event),pid=randomUUID(),cid=claim.id.slice(12),work={rawReceiptId:raw,claimId:cid,protocolId:pid,protocolRevision:1};
 await test('authenticated sandbox receipt alone remains held before explicit settlement mapping',()=>{assert.equal(outcomes.get(raw).status,'held');assert.equal(count(),'0|0|0');});
 q(`insert into sandbox_commerce_v1.native_store_play_settlement_protocols(id,revision,sample_setup_id,sample_setup_revision,sample_claim_id,sample_raw_receipt_id,pair_evidence_sha256,lifecycle_evidence_sha256,policy)
  values('${pid}',1,'${enrollment.setupId}',1,'${cid}','${raw}',repeat('c',64),repeat('d',64),'exact_native_usd_consumable_v1');`);
 await test('candidate and context bind exact Play source without Apple signed application version',async()=>{
  assert.deepEqual((await deps.readCandidate(raw)).work,work);const context=await deps.readContext(work);
  assert.equal(context.settlementProtocol.handoffMode,'play_test_sheet_handoff_v1');assert.equal(context.settlementProtocol.automaticNoChargeProof,false);
  assert.equal(context.settlementProtocol.userStoreConfirmationRequired,true);assert.equal('signedAppVersion' in context.settlementProtocol,false);
  assert.equal(context.settlementProtocol.store,'PLAY_STORE');assert.equal(context.settlementProtocol.platform,'android');assert.equal(context.settlementProtocol.sdkVersion,'10.15.1');
 });
 await test('ambiguous mapping is held instead of choosing a recent row',()=>{
  const result=JSON.parse(q(`begin;insert into sandbox_commerce_v1.native_store_play_settlement_protocols select '${randomUUID()}',revision,sample_setup_id,sample_setup_revision,sample_claim_id,sample_raw_receipt_id,pair_evidence_sha256,lifecycle_evidence_sha256,policy,created_at from sandbox_commerce_v1.native_store_play_settlement_protocols where id='${pid}';`+service+`select public.native_store_sandbox_effect_candidate_v1('${raw}');rollback;`));
  assert.equal(result.status,'held');assert.equal(result.work,null);
 });
 await test('money identity revocation and stale original session reject without partial effects',async()=>{
  const context=await deps.readContext(work),projection={protocol:'native-store-authenticated-effect-v1',rawSha256:context.raw.rawSha256,kind:'purchase',amountMinor:199,currency:'usd',purchasedAt:new Date(now).toISOString(),eventAt:new Date(now).toISOString(),quantity:1,cancelReason:null};
  for(const patch of [{amountMinor:200},{currency:'eur'},{quantity:2},{rawSha256:'e'.repeat(64)}])assert.throws(()=>q(service+`select public.native_store_sandbox_effect_v1(${args(work)},${json({...projection,...patch})});`),/native_store_/u);
  for(const change of [
   `update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='${session}';`,
   `update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='${buyer}';`,
   `insert into sandbox_commerce_v1.native_store_play_enrollment_revocations values('${enrollment.id}',1,'synthetic revoked',clock_timestamp());`,
   `insert into sandbox_commerce_v1.native_store_play_setup_revocations values('${enrollment.setupId}',1,'synthetic revoked',clock_timestamp());`,
   `insert into native_store_sandbox_v1.revocations values('${connection}',1,'synthetic revoked',clock_timestamp());`
  ])assert.throws(()=>q('begin;'+change+service+`select public.native_store_sandbox_effect_v1(${args(work)},${json(projection)});rollback;`),/sandbox_|native_store_/u);
  assert.equal(count(),'0|0|0');
 });
 let result,receipt,grant;
 await test('real encrypted webhook redelivery atomically allocates shared core receipt grant and terminal',async()=>{
  assert.equal(await retain(event),raw);result=outcomes.get(raw);assert.equal(result.status,'processed',JSON.stringify(result));
  assert.equal(result.nativeConsumerEffect.effectKind,'positive_applied');assert.equal(result.acknowledgementAllowed,false);assert.equal(result.financialAuthority,false);assert.equal(result.payable,false);
  receipt=q(`select core_receipt_id from sandbox_commerce_v1.native_store_play_allocations where raw_receipt_id='${raw}';`);grant=result.nativeConsumerEffect.grantId.slice(11);
  assert.equal(count(),'1|1|1');assert.equal(q(`select count(*) from sandbox_commerce_v1.native_store_core_links where core_receipt_id='${receipt}';`),'1');
  assert.equal(q(`select kind,allocation_id is null,play_allocation_id is not null,grant_id='${grant}' from sandbox_commerce_v1.native_store_reservation_terminals where selection_id='${f.selection.id.slice(16)}';`),'allocated|t|t|t');
  assert.equal(q('select count(*) from sandbox_commerce_v1.native_store_allocations;'),'0');
  const terminal=read(`public.native_store_sandbox_terminal_v1('${buyer}','${session}','terminal-recover','${randomUUID()}',${json({selectionId:f.selection.id})})`);
  assert.equal(terminal.data.terminal.allocationId,result.nativeConsumerEffect.allocationId);
 });
 await test('duplicate delivery and uncertain committed response retain one immutable allocation',async()=>{
  const duplicate=await process(raw);assert.equal(duplicate.nativeConsumerEffect.status,'already_processed');assert.equal(duplicate.nativeConsumerEffect.allocationId,result.nativeConsumerEffect.allocationId);
  const lost=await worker.processNativeStoreEffectV1(work,{...deps,applyEffect:async(w,p)=>{await deps.applyEffect(w,p);throw Error('synthetic lost response');}});assert.equal(lost.status,'unknown');assert.equal(count(),'1|1|1');
  for(const table of ['native_store_play_allocations','native_store_play_raw_effects','native_store_play_settlement_protocols']){
   assert.throws(()=>q(`delete from sandbox_commerce_v1.${table};`),/native_store_quote_immutable/u);
   assert.throws(()=>q(`truncate sandbox_commerce_v1.${table} cascade;`),/native_store_quote_immutable/u);
  }
 });
 // Common protected playback must re-read Play evidence on every issuance.
 const mediaWorker=randomUUID(),verifier=randomUUID(),transfer=randomUUID();
 q(`insert into sandbox_commerce_v1.paid_video_workers values('${mediaWorker}',decode(repeat('01',32),'hex'),repeat('a',64),true);
  insert into sandbox_commerce_v1.paid_video_verifiers values('${verifier}',decode(repeat('02',32),'hex'),repeat('b',64),true);
  insert into sandbox_commerce_v1.paid_video_transfers(id,upload_id,user_id,session_id,request_id) select '${transfer}',id,creator_id,'${randomUUID()}','${randomUUID()}' from sandbox_commerce_v1.paid_video_uploads where asset_id='${asset}';
  insert into sandbox_commerce_v1.paid_video_object_receipts(upload_id,transfer_id,verifier_id,object_version,observation_raw,signature)
   select id,'${transfer}','${verifier}',object_version,jsonb_build_object('incarnation',incarnation,'sha256',expected_sha256,'byteLength',expected_byte_length)::text,'synthetic-signature-not-provider-evidence' from sandbox_commerce_v1.paid_video_uploads where asset_id='${asset}';
  update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true,route_id='${route}',worker_id='${mediaWorker}',verifier_id='${verifier}',qualification_sha256=repeat('c',64);`);
 const access=(who=actor)=>`public.native_store_paid_video_access_v1('${who.userId}','${who.sessionGeneration}','${resource}','${grant}')`;
 await test('shared protected playback checks exact Play receipt with current account session and media authority',()=>{
  assert.equal(read(access()).allocationId,result.nativeConsumerEffect.allocationId);assert.equal(read(access({userId:buyer,sessionGeneration:newSession})).receiptId,'scv1_receipt_'+receipt);
  assert.throws(()=>read(access(otherActor)));
  for(const change of [
   `update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='${session}';`,
   `update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='${buyer}';`,
   `update sandbox_commerce_v1.delivery_assets set state='quarantined' where id='${asset}';`,
   `update sandbox_commerce_v1.paid_video_gateway_controls set enabled=false;`,
   `update sandbox_commerce_v1.paid_video_routes set active=false where id='${route}';`,
   `update native_store_sandbox_v1.control set enabled=false;`,
   `insert into sandbox_commerce_v1.native_store_play_enrollment_revocations values('${enrollment.id}',1,'synthetic revoked',clock_timestamp());`,
   `insert into sandbox_commerce_v1.native_store_play_setup_revocations values('${enrollment.setupId}',1,'synthetic revoked',clock_timestamp());`,
   `insert into sandbox_commerce_v1.native_store_play_settlement_revocations values('${pid}',1,'synthetic revoked',clock_timestamp());`,
   `insert into native_store_sandbox_v1.revocations values('${connection}',1,'synthetic revoked',clock_timestamp());`
  ])assert.throws(()=>q('begin;'+change+service+'select '+access()+';rollback;'),/sandbox_|native_store_|native_video_|test_store_/u);
 });
 const next=(who=actor)=>{const selection=call('prepare',{...f.payload,expectedQuote:f.quote},undefined,who).data.selection;const reservation=call('reserve',{selectionId:selection.id},undefined,who).data.reservation;return {...f,selection,reservation,who};};
 await test('per-buyer SKU terminal releases only a fresh selection and another ordinary buyer can settle',async()=>{
  const second=next(otherActor);enroll(second,{setup:enrollment.setupId});assert.equal(dispatch(second).dispatchAllowed,true);
  const tx='synthetic-second-buyer-'+randomUUID(),at=Date.now();call('claim',{selectionId:second.selection.id,transactionIdentifier:tx,productIdentifier:event.product_id},undefined,otherActor);
  const secondRaw=await retain({...event,id:'synthetic-second-buyer-'+randomUUID(),app_user_id:otherActor.userId,original_app_user_id:otherActor.userId,transaction_id:tx,original_transaction_id:tx,purchased_at_ms:at,event_timestamp_ms:at});
  assert.equal(outcomes.get(secondRaw).nativeConsumerEffect.effectKind,'positive_applied');assert.equal(count(),'2|2|2');
  assert.equal(q(`select buyer_id from sandbox_commerce_v1.native_store_play_allocations where raw_receipt_id='${secondRaw}';`),otherActor.userId);
 });
 const second=next();assert.equal(dispatch(second).dispatchAllowed,true);const tx2='synthetic-negative-first-'+randomUUID(),at2=Date.now();
 const c2=call('claim',{selectionId:second.selection.id,transactionIdentifier:tx2,productIdentifier:event.product_id}).data.claim;
 const e2={...event,id:'synthetic-late-positive-'+randomUUID(),transaction_id:tx2,original_transaction_id:tx2,purchased_at_ms:at2,event_timestamp_ms:at2};
 await test('refund before purchase creates shared tombstone and prevents late access while releasing terminal',async()=>{
  const negative=await retain({...e2,id:'synthetic-negative-first-'+randomUUID(),type:'CANCELLATION',cancel_reason:'CUSTOMER_SUPPORT'});
  assert.equal(outcomes.get(negative).nativeConsumerEffect.effectKind,'negative_applied');
  const positive=await retain(e2);assert.equal(outcomes.get(positive).nativeConsumerEffect.effectKind,'purchase_tombstoned');assert.equal(outcomes.get(positive).nativeConsumerEffect.grantId,null);
  assert.equal(count(),'2|2|2');assert.equal(q(`select count(*) from sandbox_commerce_v1.native_store_play_allocations where claim_id='${c2.id.slice(12)}';`),'0');
  assert.equal(q(`select kind from sandbox_commerce_v1.native_store_reservation_terminals where selection_id='${second.selection.id.slice(16)}';`),'refunded_before_allocation');
 });
 await test('late terminal failure rolls back receipt allocation grant and completion then exact redelivery succeeds',async()=>{
  const third=next();assert.equal(dispatch(third).dispatchAllowed,true);const tx='synthetic-atomic-'+randomUUID(),at=Date.now();
  call('claim',{selectionId:third.selection.id,transactionIdentifier:tx,productIdentifier:event.product_id});
  const purchase={...event,id:'synthetic-atomic-'+randomUUID(),transaction_id:tx,original_transaction_id:tx,purchased_at_ms:at,event_timestamp_ms:at};
  q("create function sandbox_commerce_v1.synthetic_play_terminal_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_terminal_failure';end$$;create trigger synthetic_play_terminal_failure before insert on sandbox_commerce_v1.native_store_reservation_terminals for each row execute function sandbox_commerce_v1.synthetic_play_terminal_failure();");
  const failedRaw=await retain(purchase);assert.equal(outcomes.get(failedRaw).status,'unknown');assert.equal(count(),'2|2|2');
  assert.equal(q(`select count(*) from sandbox_commerce_v1.native_store_play_raw_effects where raw_receipt_id='${failedRaw}';`),'0');
  assert.equal(q(`select count(*) from sandbox_commerce_v1.receipts where transaction_id=${literal(tx)};`),'0');
  q('drop trigger synthetic_play_terminal_failure on sandbox_commerce_v1.native_store_reservation_terminals;drop function sandbox_commerce_v1.synthetic_play_terminal_failure();');
  assert.equal(await retain(purchase),failedRaw);assert.equal(outcomes.get(failedRaw).nativeConsumerEffect.effectKind,'positive_applied');assert.equal(count(),'3|3|3');
 });
 await test('refund withdraws retained grant and replay cannot restore playback',async()=>{
  const negative=await retain({...event,id:'synthetic-refund-'+randomUUID(),type:'CANCELLATION',cancel_reason:'CUSTOMER_SUPPORT',event_timestamp_ms:Date.now()});
  assert.equal(outcomes.get(negative).nativeConsumerEffect.effectKind,'negative_applied');assert.equal(q(`select state from sandbox_commerce_v1.receipts where id='${receipt}';`),'refunded');
  assert.equal(q(`select revoked_at is not null from sandbox_commerce_v1.resource_grants where id='${grant}';`),'t');assert.throws(()=>read(access()));
  assert.equal((await process(raw)).nativeConsumerEffect.status,'already_processed');assert.throws(()=>read(access()));
  assert.equal(q(`select count(*) from sandbox_commerce_v1.resource_delivery_holds where receipt_id='${receipt}' and reason like 'native_store_refund:%' and resolved_at is null;`),'1');
 });
 await test('wrong buyer app store product production and callback transaction never discover purchase candidates',async()=>{
  const prepare=load('native-store-sandbox-bridge-v1.ts').prepareNativeStoreSandboxIntakeV1;
  for(const patch of [{environment:'PRODUCTION'},{app_id:'wrong-app'},{store:'APP_STORE'},{product_id:'wrong-product'},
   {app_user_id:otherActor.userId,original_app_user_id:otherActor.userId},{transaction_id:'unclaimed-'+randomUUID(),original_transaction_id:'unclaimed-'+randomUUID()}]){
   const body=JSON.stringify({api_version:'1.0',event:{...event,id:'synthetic-wrong-'+randomUUID(),...patch}});
   const intake=await prepare(new Request('https://synthetic.invalid',{method:'POST',headers:{authorization:conf.authentication.secret},body}),conf);
   // Journal RPC already armed this transaction. Invoke the same private armed
   // candidate used by the public router, then roll the synthetic probe back.
   const result=JSON.parse(q('begin;'+service+`select public.native_store_sandbox_journal_v1(${json(intake)})->>'receiptId' as probe_raw \\gset
    set role sbx_v1_core_owner;select sandbox_commerce_v1.native_store_play_effect_candidate(:'probe_raw'::uuid);rollback;`));assert.equal(result.status,'held');
  }
  assert.equal(count(),'3|3|3');
 });
 await test('Play tables and every compatibility helper remain owner-private and existing FKs retained',()=>{
  for(const table of ['native_store_play_settlement_protocols','native_store_play_settlement_revocations','native_store_play_allocations','native_store_play_raw_effects']){
   assert.equal(q(`select relrowsecurity,relforcerowsecurity from pg_class where oid='sandbox_commerce_v1.${table}'::regclass;`),'t|t');
   for(const role of ['anon','authenticated','service_role'])assert.throws(()=>q(`set role ${role};select * from sandbox_commerce_v1.${table};`),/permission denied/u);
  }
  assert.equal(q("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sandbox_commerce_v1' and p.proname like '%play%' and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'));"),'0');
  assert.equal(q("select count(*) from pg_constraint where conrelid='sandbox_commerce_v1.native_store_reservation_terminals'::regclass and contype='f' and confrelid in('sandbox_commerce_v1.native_store_allocations'::regclass,'sandbox_commerce_v1.native_store_play_allocations'::regclass);"),'2');
  assert.equal(q("select count(*)>0,bool_and(not m.inherit_option and not m.set_option) from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where r.rolname='sbx_v1_core_owner' and u.rolname='postgres';"),'t|t');
 });
 await test('Apple encrypted purchase retained allocation duplicate and refund still traverse original public RPCs',async()=>{
  const af=fresh(actor,'APP_STORE'),aq=randomUUID(),ac=q("select id from native_store_sandbox_v1.connections where store='APP_STORE';");
  q(`insert into sandbox_commerce_v1.native_store_protocol_qualifications values('${aq}',1,'${af.binding}',1,${literal(af.quote.quoteDigest)},'${ac}',1,repeat('a',64),'ios','101','1.0.0','100.7','10.15.1','testflight_distribution',repeat('b',64),clock_timestamp());`);
  assert.equal(dispatch(af).dispatchAllowed,true);const tx='synthetic-apple-'+randomUUID(),at=Date.now();
  const appleClaim=call('claim',{selectionId:af.selection.id,transactionIdentifier:tx,productIdentifier:af.quote.catalog.wireProductId}).data.claim;
  const appleConf={...conf,connectionId:ac,store:'APP_STORE'},appleDeps={...deps,resolveOriginalConnection:async registry=>{assert.equal(registry.id,ac);return appleConf;}};
  const retainApple=async value=>{let persisted;const handler=ingress({connection:()=>appleConf,persist:async intake=>(persisted=read(`public.native_store_sandbox_journal_v1(${json(intake)})`))});
   const response=await handler(new Request('https://synthetic.invalid',{method:'POST',headers:{authorization:appleConf.authentication.secret},body:JSON.stringify({api_version:'1.0',event:value})}));assert.equal(response.status,503);assert.ok(persisted);return persisted.receiptId;};
  const purchase={...event,id:'synthetic-apple-'+randomUUID(),store:'APP_STORE',product_id:af.quote.catalog.wireProductId,transaction_id:tx,original_transaction_id:tx,purchased_at_ms:at,event_timestamp_ms:at};
  const appleRaw=await retainApple(purchase),ap=randomUUID();
  q(`insert into sandbox_commerce_v1.native_store_settlement_protocols values('${ap}',1,'${aq}',1,'${appleClaim.id.slice(12)}','${appleRaw}',repeat('c',64),repeat('d',64),'exact_native_usd_consumable_v1',clock_timestamp());`);
  const appleResult=await worker.processPersistedNativeStoreReceiptV1(appleRaw,appleDeps);assert.equal(appleResult.status,'processed',JSON.stringify(appleResult));assert.equal(appleResult.nativeConsumerEffect.effectKind,'positive_applied');
  const appleReceipt=q(`select core_receipt_id from sandbox_commerce_v1.native_store_allocations where raw_receipt_id='${appleRaw}';`);
  assert.equal(q(`select allocation_id is not null,play_allocation_id is null from sandbox_commerce_v1.native_store_reservation_terminals where selection_id='${af.selection.id.slice(16)}';`),'t|t');
  const retained=JSON.parse(q(`begin;set role sbx_v1_core_owner;set request.jwt.claims='{"role":"service_role"}';select sandbox_commerce_v1.arm_transaction_timeout();select sandbox_commerce_v1.native_store_assert_current_allocation('${appleReceipt}','${buyer}');commit;`));
  assert.equal(retained.allocationId,appleResult.nativeConsumerEffect.allocationId);
  assert.equal((await worker.processPersistedNativeStoreReceiptV1(appleRaw,appleDeps)).nativeConsumerEffect.status,'already_processed');
  const negative=await retainApple({...purchase,id:'synthetic-apple-refund-'+randomUUID(),type:'CANCELLATION',cancel_reason:'CUSTOMER_SUPPORT',event_timestamp_ms:Date.now()});
  assert.equal((await worker.processPersistedNativeStoreReceiptV1(negative,appleDeps)).nativeConsumerEffect.effectKind,'negative_applied');
  assert.equal(q(`select state from sandbox_commerce_v1.receipts where id='${appleReceipt}';`),'refunded');
  assert.equal(q(`select revoked_at is not null from sandbox_commerce_v1.resource_grants where receipt_id='${appleReceipt}';`),'t');
 });
 console.log(JSON.stringify({protocol:'native-store-play-settlement-local-proof-v1',cases:names.length,passed:names.length,names,realPostgres:true,realEncryptedReplay:true,ordinaryBuyers:2,
  providerObserved:false,syntheticFactsOnly:true,automaticNoChargeProof:false,productionInstalled:false,productionEnabled:false}));
 return names.length;
}
