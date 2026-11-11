import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {databaseFactory as nativeDatabaseFactory} from '../helpers/native-deployment-database.mjs';
import {seedCashoutExecutionFixture} from '../helpers/cashout-execution-fixture.mjs';
import {seedCommerceBuyer,seedQualifiedCommerceCreator} from '../helpers/automatic-commerce-fixture.mjs';

// Synthetic qualifications belong only to this owned disposable fixture. They
// are not account interoperability, immutable-origin or live admission proof.
test('prospective native source/report plumbing stays held and cannot bypass current cashout domains',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false,
  databaseFactory:process.env.NATIVE_DEPLOYMENT_PG_BIN?()=>nativeDatabaseFactory({transport:process.env.NATIVE_PRODUCTION_PG_LOOPBACK==='1'?'loopback':'unix'}):null});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const owner=()=>db.exec('reset role');
 const claims=(role,user,session)=>db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role',$2,false)",
  [JSON.stringify({role,sub:user,session_id:session}),role]);
 const service=async()=>{await owner();await claims('service_role');await db.exec('set role service_role');};
 const transaction=async fn=>{await owner();await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}};
 const buyer=randomUUID(),creator=randomUUID(),session=randomUUID(),video=randomUUID();
 try{
  const initialEarnings=await one('select count(*)::int from public.creator_earnings_ledger');
  const switches=await one('select jsonb_object_agg(key,state) from public.platform_money_kill_switches');
  for(const table of ['source_proofs','scope_qualifications','purchase_correlations','earning_sources'])
   assert.equal(await one(`select count(*)::int from private.native_production_${table}`),0,'no proof or earnings seeded by migration');
  await db.query('insert into auth.users(id,is_sso_user,is_anonymous) values($1,false,false),($2,false,false)',[buyer,creator]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,buyer]);
  await db.query(`insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes,vip_access_required)
   values($1::uuid,$2::uuid,'Synthetic production source','public','clean','cloudflare_r2','chillywood-media-origin',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4','video/mp4',1024,false)`,[video,creator]);
  await db.query("update public.videos set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=clock_timestamp() where id=$1",[video]);
  const version=await one('select id from private.native_production_video_versions where source_id=$1 order by revision desc limit 1',[video]);
  const sourceVersions=await one('select count(*)::int from private.native_production_video_versions where source_id=$1',[video]);
  assert.ok(version,'ordinary video insertion prospectively captures a revision');
  await db.query("update public.videos set title='Synthetic renamed title' where id=$1",[video]);
  assert.equal(await one('select count(*)::int from private.native_production_video_versions where source_id=$1',[video]),sourceVersions,'non-source title edit does not fabricate a new byte identity');
  await claims('authenticated',buyer,session);
  assert.equal((await one("select private.prepare_native_production_video_admission($1,'revenuecat_google_play','synthetic-product','synthetic-video',199)",[video])).reason,'production_source_or_scope_unqualified');
  await db.query(`insert into public.monetization_products(product_key,product_type,display_name,provider,provider_product_id,environment,status,is_android_digital,metadata)
   values('synthetic-product','paid_content_access','SYNTHETIC production video','revenuecat_google_play','synthetic-video','production','active',true,
   '{"provider_proof":true,"live_money_enabled_at_activation":true,"fixture":"SYNTHETIC ONLY, NOT PROVIDER VERIFICATION"}')`);
  const proof=await one(`insert into private.native_production_source_proofs(version_id,origin_provider,origin_bucket,origin_object,origin_generation,asset_sha256,byte_length,scan_receipt_sha256,adapter_version,evidence_sha256,verified_at,expires_at)
   values($1,'cloudflare_r2','chillywood-media-origin',$2,'synthetic-generation',repeat('a',64),1024,repeat('b',64),'synthetic-only',repeat('c',64),clock_timestamp(),clock_timestamp()+interval '1 hour') returning id`,[version,`${creator}/${video}/source.mp4`]);
  await db.exec("update public.wave1_legal_document_versions set active=false where document_key='money_terms' and capability='creator_money';insert into public.wave1_legal_document_versions(document_key,version,market,capability,active,effective_at) values('money_terms','synthetic-native-only','UNITED_STATES','creator_money',true,clock_timestamp()-interval '1 hour')");
  await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
   values($1,repeat('a',64),'money_terms','synthetic-native-only','UNITED_STATES','member','creator_money',$2,'service_reconciliation')`,[creator,session]);
  const qualification=await one(`insert into private.native_production_scope_qualifications(provider,project_id,app_id,store_account_id,provider_product_id,currency,report_schema,legal_document_key,legal_document_version,terms_sha256,platform_share_bps,evidence_sha256,verified_at,expires_at)
   values('revenuecat_google_play','synthetic-project','synthetic-app','synthetic-store','synthetic-video','usd','synthetic-report-v1','money_terms','synthetic-native-only',repeat('d',64),2000,repeat('e',64),clock_timestamp(),clock_timestamp()+interval '1 hour') returning id`);
  const admission=await one("select private.prepare_native_production_video_admission($1,'revenuecat_google_play','synthetic-product','synthetic-video',199)",[video]);
  assert.equal(admission.status,'HELD');assert.equal(admission.dispatchAllowed,false);assert.ok(admission.admissionId);
  assert.deepEqual(await one("select private.prepare_native_production_video_admission($1,'revenuecat_google_play','synthetic-product','synthetic-video',199)",[video]),admission,'same unexpired preparation is reused');
  await db.exec("set time zone 'America/New_York'");
  assert.equal(await one('select private.native_production_source_current($1,$2)',[version,proof]),true,'source digest is time-zone independent');
  await db.exec("set time zone 'UTC'");
  const facts={providerEventId:'synthetic-second-slice',rawPayloadHash:'f'.repeat(64),provider:'revenuecat_google_play',environment:'production',eventType:'NON_RENEWING_PURCHASE',
   reportedAppId:'synthetic-app',configuredProjectId:'synthetic-project',reportedProductId:'synthetic-video',originalTransactionId:'synthetic-original',transactionId:'synthetic-transaction',userId:buyer};
  await service();await one('select public.reserve_revenuecat_webhook_ingress_event($1,$2)',[facts.providerEventId,facts.rawPayloadHash]);await owner();
  facts.canonicalReceiptId=await one(`insert into public.provider_events(provider_event_id,provider,product_id,product_key,user_id,app_user_id,environment,event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata)
   select $1,'revenuecat_google_play',id,product_key,$2::uuid,$2,'production','NON_RENEWING_PURCHASE','ignored',clock_timestamp(),$1,$3,
    '{"provider_product_id":"synthetic-video","original_transaction_id":"synthetic-original"}' from public.monetization_products where product_key='synthetic-product' returning id`,[facts.providerEventId,buyer,facts.rawPayloadHash]);
  const receipt=facts.canonicalReceiptId;
  await service();await one('select public.record_native_production_ingress_observation($1)',[facts]);await owner();
  assert.equal(await one('select adapter_status from private.native_production_report_jobs where canonical_receipt_id=$1',[receipt]),'unqualified','normal authenticated receipt creates actual-report read obligation');
  const correlate=async patch=>one(`insert into private.native_production_purchase_correlations(canonical_receipt_id,admission_id,transaction_id,original_transaction_id,purchased_at,actual_gross_minor,quantity,evidence_sha256,adapter_version)
   values($1,$2,$3,$4,(select observed_at from private.native_production_paid_video_observations where canonical_receipt_id=$1),$5,1,repeat('f',64),'synthetic-only') returning canonical_receipt_id`,
   [receipt,admission.admissionId,patch?.transactionId??facts.transactionId,patch?.originalTransactionId??facts.originalTransactionId,patch?.gross??199]);
  for(const patch of [{transactionId:'other'},{originalTransactionId:'other'},{gross:198}])await assert.rejects(()=>correlate(patch),/purchase_binding_mismatch/);
  await correlate();
  assert.equal(await one('select count(*)::int from private.native_production_sale_bindings'),1);
  assert.equal(await one('select count(*)::int from private.native_production_economic_snapshots'),1,'correlation completion projects held missing costs atomically');
  const project=()=>one('select private.evaluate_native_production_economics($1)',[receipt]);
  const append=o=>one('select private.append_native_production_report($1,$2)',[receipt,o]);
  const observedAt=new Date().toISOString();
  const base={provider:facts.provider,environment:'production',projectId:'synthetic-project',appId:'synthetic-app',storeAccountId:'synthetic-store',productId:'synthetic-video',currency:'usd',buyerId:buyer,
   transactionId:facts.transactionId,originalTransactionId:facts.originalTransactionId,evidenceSha256:'a'.repeat(64),observedAt};
  const components=['store_fee','fee_tax','sales_tax','developer_proceeds'].map((category,i)=>({...base,id:category,kind:'component',componentId:category,category,amountMinor:['30','3','10','156'][i],reportSchema:'synthetic-report-v1',qualificationId:qualification,attribution:'transaction'}));
  const coverage={...base,id:'coverage',kind:'coverage',revision:1,componentIds:components.map(c=>c.componentId),reportSchema:'synthetic-report-v1',qualificationId:qualification,through:observedAt};
  const complete=async()=>{for(const o of [coverage,...components].reverse())await append(o);};
  const held=(r,reason)=>{assert.equal(r.status,'HELD');assert.equal(r.payable,false);assert.equal(r.financialAuthority,false);assert.equal(r.dispatchAllowed,false);
   if(reason){assert.ok(r.reasons.includes(reason),JSON.stringify(r));assert.equal(r.economicCoverageComplete,false);assert.equal(r.creatorCandidateMinor,null);}};
  held(await project(),'coverage_missing');
  for(const patch of [{environment:'sandbox'},{provider:'revenuecat_app_store'},{projectId:'other'},{appId:'other'},{storeAccountId:'other'},{productId:'other'},{currency:'eur'},{buyerId:creator},{transactionId:'other'},{originalTransactionId:'other'}])
   await assert.rejects(()=>append({...components[0],...patch}),/identity_mismatch/);
  for(const patch of [{amountMinor:30},{amountMinor:'9223372036854775808'},{amountMinor:'-1'},{category:null},{attribution:null},{payable:true},{observedAt:'infinity'},{qualificationId:randomUUID()}])
   await assert.rejects(()=>append({...components[0],...patch}),/report_/);
  await transaction(async()=>{await append({...coverage,componentIds:[]});held(await project(),'coverage_incomplete');});
  for(const missing of components)await transaction(async()=>{
   for(const c of components)await append(c===missing?{...c,amountMinor:null}:c);await append(coverage);held(await project(),`${missing.category}_unknown`);
  });
  await complete();let r=await project();held(r);assert.equal(r.economicCoverageComplete,true);assert.equal(r.creatorCandidateMinor,'125');assert.equal(r.platformCandidateMinor,'31');
  const count=await one('select count(*)::int from private.native_production_report_observations');
  await append(components[0]);assert.equal(await one('select count(*)::int from private.native_production_report_observations'),count);
  await assert.rejects(()=>append({...components[0],amountMinor:'31'}),/observation_conflict/);
  await append({...components[0],id:'overlap',evidenceSha256:'b'.repeat(64)});assert.deepEqual(await project(),r,'stable component is counted once');
  await transaction(async()=>{await append({...components[0],id:'conflict',amountMinor:'31'});held(await project(),'component_conflict');});
  await transaction(async()=>{await append({...coverage,id:'coverage-conflict',componentIds:[]});held(await project(),'coverage_conflict');});
  for(const kind of ['refund','revocation','chargeback'])await transaction(async()=>{
   await append({...base,id:kind,kind,negativeId:`synthetic-${kind}`,effectiveAt:observedAt,amountMinor:null});
   await append({...coverage,id:'coverage-newer',revision:2});held(await project(),'negative_lifecycle_hold');
  });
  await transaction(async()=>{await db.query('insert into private.native_production_scope_revocations(qualification_id) values($1)',[qualification]);held(await project(),'scope_qualification_unavailable');});
  await transaction(async()=>{
   const expired=await one(`insert into private.native_production_scope_qualifications(provider,project_id,app_id,store_account_id,provider_product_id,currency,report_schema,legal_document_key,legal_document_version,terms_sha256,platform_share_bps,evidence_sha256,verified_at,expires_at)
    select provider,project_id,app_id,store_account_id,provider_product_id,currency,report_schema,legal_document_key,legal_document_version,terms_sha256,platform_share_bps,evidence_sha256,clock_timestamp(),clock_timestamp()+interval '30 milliseconds'
    from private.native_production_scope_qualifications where id=$1 returning id`,[qualification]);
   assert.equal(await one("with delayed as materialized(select pg_sleep(0.06)) select private.native_production_scope_current($1) from delayed",[expired]),false,'expiry is rechecked after a same-statement wait');
   held(await project(),'scope_qualification_unavailable');
  });
  await transaction(async()=>{await db.query('insert into private.native_production_source_revocations(proof_id) values($1)',[proof]);held(await project(),'source_incarnation_or_proof_unavailable');});
  await transaction(async()=>{await db.query("update public.videos set playback_url='https://example.test/different-source' where id=$1",[video]);
   assert.equal(await one('select count(*)::int from private.native_production_video_versions where source_id=$1',[video]),sourceVersions+1);held(await project(),'source_incarnation_or_proof_unavailable');});
  await transaction(async()=>{await db.query('update public.videos set owner_id=$2 where id=$1',[video,buyer]);held(await project(),'source_incarnation_or_proof_unavailable');});
  await service();const current=await one('select public.get_native_production_paid_video_hold($1)',[receipt]);assert.deepEqual(current.prospectiveEconomics,r);await owner();
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),initialEarnings,'held report path never issues an actual earning');
  assert.deepEqual(await one('select jsonb_object_agg(key,state) from public.platform_money_kill_switches'),switches);
  // Actual authenticated held-only return path, through the unchanged ordinary
  // creator/buyer/session/legal/Premium/source precharge checks. This fixture
  // provisions independent synthetic production evidence, not promoted sandbox.
  const publicBuyer={id:randomUUID(),session:randomUUID()},publicCreator={id:creator,session:randomUUID()};
  await claims('service_role');
  await db.query('update auth.users set email_confirmed_at=clock_timestamp() where id=$1',[creator]);
  await seedCommerceBuyer(db,publicBuyer);
  await seedQualifiedCommerceCreator(db,publicCreator,{environment:'production'});
  await db.query(`insert into public.creator_content_prices(creator_id,content_type,content_id,is_paid,price_cents,currency,status,provider,provider_product_key,provider_product_id)
   values($1,'creator_video',$2,true,199,'usd','active','revenuecat_google_play','synthetic-product','synthetic-video')`,[creator,video]);
  const publicPrepare=amount=>one("select public.prepare_native_production_paid_video($1,'revenuecat_google_play','synthetic-product','synthetic-video',$2)",[video,amount]);
  await claims('authenticated',publicBuyer.id,randomUUID());await db.exec('set role authenticated');
  await assert.rejects(()=>publicPrepare(199),/current_session_required|buyer_session_authority_required/);await owner();
  await claims('authenticated',publicBuyer.id,publicBuyer.session);await db.exec('set role authenticated');
  await assert.rejects(()=>publicPrepare(198),/paid_video_source_offer_not_available/);
  const publicResult=await publicPrepare(199);assert.equal(publicResult.alreadyPurchased,false);
  assert.equal(publicResult.nativeProductionPreparation.status,'HELD');assert.equal(publicResult.nativeProductionPreparation.dispatchAllowed,false);
  assert.notEqual(publicResult.nativeProductionPreparation.admissionId,admission.admissionId);
  assert.deepEqual(await publicPrepare(199),publicResult,'authenticated retry does not create a new unexpired preparation');await owner();
  assert.equal(await one('select count(*)::int from private.native_production_video_admissions where id=$1 and buyer_id=$2',
   [publicResult.nativeProductionPreparation.admissionId,publicBuyer.id]),1,'normal public return committed its held preparation');
  assert.equal(await one("select count(*)::int from public.money_purchase_intents where user_id=$1 and environment='production'",[publicBuyer.id]),0);
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),initialEarnings);
  const appleMapping=await one(`insert into public.monetization_product_store_mappings(product_id,concept,platform,store,provider,provider_product_id,store_product_type,tier,reference_price_minor,reference_currency,environment,status,unlocks_digital_access,metadata)
   select id,'paid_video','ios','app_store','revenuecat_app_store','synthetic-apple-video','consumable','synthetic-only',199,'usd','production','active',true,
   '{"provider_proof":true,"owner_release_approved":true,"live_money_enabled_at_activation":true,"fixture":"SYNTHETIC ONLY"}' from public.monetization_products where product_key='paid_video_store_catalog' returning id`);
  const appleQualification=await one(`insert into private.native_production_scope_qualifications(provider,project_id,app_id,store_account_id,provider_product_id,currency,report_schema,legal_document_key,legal_document_version,terms_sha256,platform_share_bps,evidence_sha256,verified_at,expires_at)
   select 'revenuecat_app_store',project_id,'synthetic-apple-app','synthetic-apple-account','synthetic-apple-video',currency,report_schema,legal_document_key,legal_document_version,terms_sha256,platform_share_bps,evidence_sha256,verified_at,expires_at
   from private.native_production_scope_qualifications where id=$1 returning id`,[qualification]);
  await claims('authenticated',publicBuyer.id,publicBuyer.session);await db.exec('set role authenticated');
  const applePrepare=()=>one("select public.prepare_native_production_paid_video($1,'revenuecat_app_store','paid_video_store_catalog','synthetic-apple-video',199)",[video]);
  const apple=await applePrepare();assert.ok(apple.nativeProductionPreparation.admissionId);await owner();
  assert.equal(await one('select store_mapping_id from private.native_production_video_admissions where id=$1',[apple.nativeProductionPreparation.admissionId]),appleMapping);
  assert.equal(await one('select environment from public.monetization_products where product_key=\'paid_video_store_catalog\''),'setup','Apple conceptual catalog is not promoted');
  const appleFacts={...facts,providerEventId:'synthetic-apple-second-slice',provider:'revenuecat_app_store',reportedAppId:'synthetic-apple-app',reportedProductId:'synthetic-apple-video',
   originalTransactionId:'synthetic-apple-original',transactionId:'synthetic-apple-transaction',userId:publicBuyer.id};
  await service();await one('select public.reserve_revenuecat_webhook_ingress_event($1,$2)',[appleFacts.providerEventId,appleFacts.rawPayloadHash]);await owner();
  appleFacts.canonicalReceiptId=await one(`insert into public.provider_events(provider_event_id,provider,product_id,product_key,user_id,app_user_id,environment,event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata)
   select $1,'revenuecat_app_store',id,product_key,$2::uuid,$2,'production','NON_RENEWING_PURCHASE','ignored',clock_timestamp(),$1,$3,
    '{"provider_product_id":"synthetic-apple-video","original_transaction_id":"synthetic-apple-original"}' from public.monetization_products where product_key='paid_video_store_catalog' returning id`,[appleFacts.providerEventId,publicBuyer.id,appleFacts.rawPayloadHash]);
  await service();await one('select public.record_native_production_ingress_observation($1)',[appleFacts]);await owner();
  await db.query(`insert into private.native_production_purchase_correlations(canonical_receipt_id,admission_id,transaction_id,original_transaction_id,purchased_at,actual_gross_minor,quantity,evidence_sha256,adapter_version)
   values($1,$2,'synthetic-apple-transaction','synthetic-apple-original',(select observed_at from private.native_production_paid_video_observations where canonical_receipt_id=$1),199,1,repeat('a',64),'synthetic-only')`,
   [appleFacts.canonicalReceiptId,apple.nativeProductionPreparation.admissionId]);
  const appleObserved=new Date().toISOString();
  for(const row of [...components,coverage])await one('select private.append_native_production_report($1,$2)',[appleFacts.canonicalReceiptId,{...row,provider:'revenuecat_app_store',appId:'synthetic-apple-app',
   storeAccountId:'synthetic-apple-account',productId:'synthetic-apple-video',buyerId:publicBuyer.id,transactionId:appleFacts.transactionId,originalTransactionId:appleFacts.originalTransactionId,
   qualificationId:appleQualification,observedAt:appleObserved,...(row.kind==='coverage'?{through:appleObserved}:{})}]);
  const appleProject=()=>one('select private.evaluate_native_production_economics($1)',[appleFacts.canonicalReceiptId]);
  held(await appleProject());assert.equal((await appleProject()).economicCoverageComplete,true,'Apple conceptual-product mapping reaches complete held arithmetic');
  const sandboxMap=await one(`insert into public.monetization_product_store_mappings(product_id,concept,platform,store,provider,provider_product_id,store_product_type,tier,reference_price_minor,reference_currency,environment,status,unlocks_digital_access)
   select id,'paid_video','ios','app_store','revenuecat_app_store','synthetic-sandbox-apple-video','consumable','synthetic-only',199,'usd','sandbox','sandbox',true
   from public.monetization_products where product_key='paid_video_store_catalog' returning id`);
  await claims('authenticated',publicBuyer.id,publicBuyer.session);await db.exec('set role authenticated');
  await assert.rejects(()=>one("select public.prepare_native_production_paid_video($1,'revenuecat_app_store','paid_video_store_catalog','synthetic-sandbox-apple-video',199)",[video]),/paid_video_source_offer_not_available/);
  await owner();assert.equal(await one('select environment from public.monetization_product_store_mappings where id=$1',[sandboxMap]),'sandbox');
  for(const update of ["status='disabled'","status='sandbox',environment='sandbox'"])await transaction(async()=>{
   await db.query(`update public.monetization_product_store_mappings set ${update} where id=$1`,[appleMapping]);
   held(await appleProject(),'production_catalog_unavailable');
   await claims('authenticated',publicBuyer.id,publicBuyer.session);await db.exec('set role authenticated');await assert.rejects(applePrepare,/paid_video_source_offer_not_available/);});
  // Missing optional money/source links do not exempt canonical native earnings.
  const earning=await one(`insert into public.creator_earnings_ledger(creator_id,source_type,provider_event_id,gross_amount_cents,net_creator_amount_cents,ledger_status)
   values($1,'paid_content',$2,199,125,'held') returning id`,[creator,receipt]);
  assert.equal(await one('select private.native_production_earning_in_domain($1)',[earning]),true);
  assert.equal(await one('select private.commerce_current_earning_domain_ready($1)',[earning]),false);
  assert.equal(await one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[earning]),0);
  const missing=await one(`insert into public.creator_earnings_ledger(creator_id,source_type,gross_amount_cents,net_creator_amount_cents,ledger_status)
   values($1,'paid_content',199,125,'held') returning id`,[creator]);
  assert.equal(await one('select private.commerce_current_earning_domain_ready($1)',[missing]),false,'unresolved paid-content provenance is not non-native readiness');
  await transaction(async()=>{await db.query('update public.provider_events set product_id=null where id=$1',[receipt]);assert.equal(await one('select private.native_production_earning_in_domain($1)',[earning]),true,'catalog drift cannot erase retained native observation');});
  const tables=(await db.query("select oid,relname from pg_class where relnamespace='private'::regnamespace and relname like 'native_production_%' and relkind='r'")).rows;
  for(const role of ['anon','authenticated','service_role']){
   await owner();await db.exec(`set role ${role}`);
   for(const {oid,relname} of tables){assert.equal(await one("select has_table_privilege(current_user,$1::oid,'INSERT,UPDATE,DELETE,TRUNCATE')",[oid]),false);await assert.rejects(()=>db.query(`select * from private.${relname}`),/permission denied/);}
   await assert.rejects(()=>append(components[0]),/permission denied/);
  }
  await owner();for(const {oid} of tables)assert.equal(await one('select relrowsecurity and relforcerowsecurity from pg_class where oid=$1',[oid]),true);
  await assert.rejects(()=>db.query('delete from private.native_production_report_observations'),/append_only/);
  // A pre-existing independently eligible domain keeps its exact behavior. Only
  // changing its canonical synthetic receipt into native paid-video evidence
  // closes withdrawability and the existing funded-undispatched payout branch.
  const f=await seedCashoutExecutionFixture(db);const context=await f.rpc('select public.get_creator_cashout_execution_context($1)',[f.request.id]);
  const claim=stage=>f.rpc('select public.claim_creator_cashout_dispatch($1,$2)',[f.request.id,stage]);
  assert.equal(await one('select private.commerce_current_earning_domain_ready($1)',[f.earning]),true);
  assert.equal((await claim('funding')).claimed,true);
  await f.rpc('select public.record_creator_cashout_observation($1,null,$2)',[f.request.id,{kind:'transfer',objectId:'tr_nativeGuard',amountMinor:9800,reversedMinor:0,fullyReversed:false,accountId:context.accountId,environment:'live'}]);
  const relabel=()=>db.query(`update public.provider_events set provider='revenuecat_google_play',product_id=(select product_id from public.provider_events where id=$2)
   where id=(select provider_event_id from public.creator_earnings_ledger where id=$1)`,[f.earning,receipt]);
  await transaction(async()=>{await relabel();assert.equal(await one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[f.earning]),0);
   const stopped=await claim('payout');assert.equal(stopped.claimed,false);assert.equal(stopped.status,'funding_return_pending');});
  await transaction(async()=>{assert.equal((await claim('payout')).claimed,true);await relabel();assert.equal((await claim('payout')).claimed,false);
   assert.equal(await one('select phase from private.creator_cashout_executions where request_id=$1',[f.request.id]),'payout_unknown','uncertain bank payout cannot be relabeled as never dispatched');});
  await relabel();assert.equal((await claim('payout')).status,'funding_return_pending');
  await assert.rejects(()=>claim('funding_return'),/funding_return_qualification_required/,'native hold never grants corrective payment authority');
  assert.equal((await f.rpc('select public.get_creator_cashout_execution_context($1)',[f.request.id])).phase,'funding_return_pending','GET reconciliation remains available');
 }finally{await db.close();}
});
