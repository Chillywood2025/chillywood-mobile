import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {BUYER,BUYER_SESSION,SELLER,sqlJson,sqlText} from '../sandbox-commerce-v1/tests/test-store-v3.fixture.mjs';
// Genuine native quote/dispatch/journal/effect/allocation path. Only provider
// purchase/qualification inputs are synthetic. No shortcut grants or booleans.
export async function runR2AllocationCases({h,q,root,published,upload,profile,worker,route,identity,store='APP_STORE'}){
 const service="set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
 const gateway=`set role sbx_v1_r2_gateway;set request.jwt.claims=${sqlText(JSON.stringify({role:'sbx_v1_r2_gateway',profile_id:profile}))};`;
 const read=expression=>JSON.parse(q(service+'select '+expression+';'));
 const call=(command,payload)=>{
  const value=read(`public.${command==='reserve'?'native_store_sandbox_reservation_v1':'native_store_sandbox_command_v1'}('${BUYER}','${BUYER_SESSION}','${command}','${randomUUID()}',${sqlJson(payload)})`);
  return command==='reserve'?shared('native-store-sandbox-command-v1.ts').adaptNativeStoreReservationResultV1(value):value;
 };
 const ts=createRequire(import.meta.url)('typescript'),cache=new Map();
 const load=file=>{
  if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
  const text=fs.readFileSync(file,'utf8');
  const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('exports','require',js)(exports,name=>{assert.ok(name.startsWith('.'));return load(path.resolve(path.dirname(file),name));});return exports;
 };
 const shared=name=>load(path.join(root,'supabase/functions/_shared',name));
 const offer={offerId:published.data.offer.id,store},quote=call('offer',offer).data.quote;
 assert.equal(quote.asset.id,upload.assetId);
 q('update sandbox_commerce_v1.native_store_quote_controls set preparation_enabled=true;');
 const selection=call('prepare',{...offer,expectedQuote:quote}).data.selection;
 const reservation=call('reserve',{selectionId:selection.id}).data.reservation;
 const conn=randomUUID(),qualification=randomUUID(),enrollment=randomUUID(),catalog=quote.catalog;
 q(`insert into native_store_sandbox_v1.connections values('${conn}',1,${sqlText(catalog.projectId)},${sqlText(catalog.appId)},'${store}','SANDBOX','synthetic-v1','synthetic-key');
 update native_store_sandbox_v1.control set enabled=true;`);
 if(store==='APP_STORE')q(`insert into sandbox_commerce_v1.native_store_protocol_qualifications(id,revision,catalog_binding_id,catalog_revision,quote_digest,connection_id,connection_revision,protocol_evidence_sha256,platform,native_build,native_version,signed_app_version,sdk_version,no_charge_account_scope,account_evidence_sha256)
 values('${qualification}',1,'${catalog.bindingId.slice(14)}',1,'${quote.quoteDigest}','${conn}',1,repeat('a',64),'ios','101','1.0.0','100.7','10.15.1','testflight_distribution',repeat('b',64));`);
 else q(`insert into sandbox_commerce_v1.native_store_play_handoff_setups(id,revision,catalog_binding_id,catalog_revision,quote_digest,connection_id,connection_revision,protocol_evidence_sha256,platform,native_build,native_version,sdk_version)
  values('${qualification}',1,'${catalog.bindingId.slice(14)}',1,'${quote.quoteDigest}','${conn}',1,repeat('a',64),'android','101','1.0.0','10.15.1');
  insert into sandbox_commerce_v1.native_store_play_enrollments(id,revision,buyer_id,setup_id,setup_revision,account_evidence_sha256,expires_at)
  values('${enrollment}',1,'${BUYER}','${qualification}',1,repeat('b',64),clock_timestamp()+interval '1 hour');
  update sandbox_commerce_v1.native_store_play_handoff_control set enabled=true;`);
 const dispatch=read(`public.native_store_sandbox_dispatch_v1('${BUYER}','${BUYER_SESSION}','dispatch-consume','${randomUUID()}',${sqlJson({selectionId:selection.id,reservationId:reservation.id})})`);
 assert.equal(dispatch.dispatchAllowed,true);
 const transaction='synthetic-r2-'+randomUUID();
 const claim=call('claim',{selectionId:selection.id,transactionIdentifier:transaction,productIdentifier:catalog.wireProductId}).data.claim;
 const conf={bridgeProtocol:'native-store-sandbox-v1',connectionId:conn,connectionRevision:1,projectId:catalog.projectId,appId:catalog.appId,store,environment:'SANDBOX',
  authentication:{method:'shared_secret',keyVersion:'synthetic-v1',secret:'synthetic-not-real-secret-'.repeat(3)},encryption:{keyId:'synthetic-key',key:new Uint8Array(32).fill(17)}};
 const now=Date.now(),event={id:'synthetic-r2-purchase-'+randomUUID(),type:'NON_RENEWING_PURCHASE',app_id:conf.appId,store,environment:'SANDBOX',app_user_id:BUYER,original_app_user_id:BUYER,
  transaction_id:transaction,original_transaction_id:transaction,product_id:catalog.wireProductId,purchased_at_ms:now,event_timestamp_ms:now,price_in_purchased_currency:quote.amountMinor/100,currency:'USD',quantity:1,expiration_at_ms:null};
 const intake=await shared('native-store-sandbox-bridge-v1.ts').prepareNativeStoreSandboxIntakeV1(new Request('https://synthetic.invalid',{method:'POST',headers:{authorization:conf.authentication.secret},body:JSON.stringify({api_version:'1.0',event})}),conf);
 const retained=read(`public.native_store_sandbox_journal_v1(${sqlJson(intake)})`),rawId=retained.receiptId,protocol=randomUUID();
 q(`insert into sandbox_commerce_v1.${store==='APP_STORE'?'native_store_settlement_protocols(id,revision,sample_qualification_id,sample_qualification_revision':'native_store_play_settlement_protocols(id,revision,sample_setup_id,sample_setup_revision'},sample_claim_id,sample_raw_receipt_id,pair_evidence_sha256,lifecycle_evidence_sha256,policy)
 values('${protocol}',1,'${qualification}',1,'${claim.id.slice(12)}','${rawId}',repeat('c',64),repeat('d',64),'exact_native_usd_consumable_v1');`);
 const work=read(`public.native_store_sandbox_effect_candidate_v1('${rawId}')`).work;
 const args=w=>`'${w.rawReceiptId}','${w.claimId}','${w.protocolId}',${w.protocolRevision}`;
 const result=await shared('native-store-effect-worker-v1.ts').processNativeStoreEffectV1(work,{
  readContext:async w=>read(`public.native_store_sandbox_effect_context_v1(${args(w)})`),
  readOriginalJournal:async id=>read(`public.native_store_sandbox_journal_read_v1('${id}')`),
  resolveOriginalConnection:async()=>conf,
  applyEffect:async(w,projection)=>read(`public.native_store_sandbox_effect_v1(${args(w)},${sqlJson(projection)})`),
 });
 assert.equal(result.status,'processed',JSON.stringify(result));assert.equal(result.nativeConsumerEffect.effectKind,'positive_applied');
 const grant=result.nativeConsumerEffect.grantId.slice(11),resource=upload.resourceId.slice(14);
 const accessSql=`public.native_store_paid_video_access_v1('${BUYER}','${BUYER_SESSION}','${resource}','${grant}')`;
 const access=read(accessSql);assert.equal(access.protocol,'nssv1-current-access-gateway-r2-v1');assert.equal(access.allocationId,result.nativeConsumerEffect.allocationId);
 assert.deepEqual(access.object.identity,identity);assert.equal('customerId' in access,false);assert.equal('objectVersion' in access.object,false);
 const token=JSON.parse(read(`public.native_paid_video_r2_admit_v1('range','${BUYER}','${BUYER_SESSION}',null,'${randomUUID()}','8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0',${sqlJson({start:0,end:0})},'${grant}')`).raw);
 assert.equal(token.grantId,grant);
 const phase=p=>`select public.native_paid_video_r2_gateway_v1(${sqlJson(token)},'${p}',null);`;
 const before=JSON.parse(q(gateway+phase('before'))),after=JSON.parse(q(gateway+phase('after')));assert.equal(before.authorityDigest,after.authorityDigest);
 for(const change of [
  `update sandbox_commerce_v1.r2_profiles set enabled=false where id='${profile}';`,
  `update sandbox_commerce_v1.paid_video_workers set active=false where id='${worker}';`,
  `update sandbox_commerce_v1.paid_video_routes set active=false where id='${route}';`,
  `update sandbox_commerce_v1.resource_grants set revoked_at=clock_timestamp() where id='${grant}';`,
  `update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='${BUYER_SESSION}';`,
  `update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='${BUYER}';`,
  `update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='${SELLER}';`,
  `insert into sandbox_commerce_v1.${store==='APP_STORE'?'native_store_protocol_revocations':'native_store_play_setup_revocations'} values('${qualification}',1,'synthetic revoke',clock_timestamp());`,
  `insert into sandbox_commerce_v1.${store==='APP_STORE'?'native_store_settlement_revocations':'native_store_play_settlement_revocations'} values('${protocol}',1,'synthetic revoke',clock_timestamp());`,
  ...(store==='PLAY_STORE'?[`insert into sandbox_commerce_v1.native_store_play_enrollment_revocations values('${enrollment}',1,'synthetic revoke',clock_timestamp());`]:[]),
  `insert into native_store_sandbox_v1.revocations values('${conn}',1,'synthetic revoke',clock_timestamp());`,
 ]){
  h.rejects('begin;'+change+service+'select '+accessSql+';rollback;',/native_video_|native_store_|sandbox_|paid_video_/u);
  h.rejects('begin;'+change+gateway+phase('after')+'rollback;',/native_video_|native_store_|sandbox_|paid_video_/u);
 }
 h.rejects(service+`select public.native_store_paid_video_access_v1('${SELLER}','${BUYER_SESSION}','${resource}','${grant}');`,/sandbox_|query returned no rows/u);
 h.rejects(gateway+`select public.native_paid_video_r2_gateway_v1(${sqlJson({...token,grantId:randomUUID()})},'before',null);`,/current_binding_required/u);
 return `${store}: real native quote → qualified dispatch → encrypted original journal → settlement → current allocation → typed private range passes; account, creator, grant, route, worker, mapping, protocol/enrollment and original connection revocations fail before/after; exact grant rebinding rejects.`;
}
