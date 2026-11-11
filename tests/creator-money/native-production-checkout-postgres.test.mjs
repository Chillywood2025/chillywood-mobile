import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {databaseFactory as nativeDatabaseFactory} from '../helpers/native-deployment-database.mjs';
import {seedCommerceBuyer,seedQualifiedCommerceCreator} from '../helpers/automatic-commerce-fixture.mjs';

// Synthetic OFF-contract proof only. This test cannot contact a provider or a
// target database, and no synthetic qualification is deployment evidence.
test('normal production checkout requires exact qualified preparation, one launch and independent receipt before playback',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false,
  databaseFactory:process.env.NATIVE_DEPLOYMENT_PG_BIN?()=>nativeDatabaseFactory({transport:'loopback'}):null});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const owner=()=>db.exec('reset role');
 const claims=(role,user,session)=>db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role',$2,false)",
  [JSON.stringify({role,sub:user,session_id:session}),role]);
 const service=async()=>{await owner();await claims('service_role');await db.exec('set role service_role');};
 const buyer={id:randomUUID(),session:randomUUID()},creator={id:randomUUID(),session:randomUUID()},video=randomUUID();
 const buyerRole=async(session=buyer.session)=>{await owner();await claims('authenticated',buyer.id,session);await db.exec('set role authenticated');};
 const transaction=async fn=>{await owner();await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}};
 try{
  assert.deepEqual(await one('select to_jsonb(c) from private.native_production_checkout_controls c'),
   {singleton:true,checkout_enabled:false,access_enabled:false});
  for(const suffix of ['qualifications','verifier_keys','dispatches','receipt_proofs','access_bindings'])
   assert.equal(await one(`select count(*)::int from private.native_production_checkout_${suffix}`),0);
  await claims('service_role');await seedCommerceBuyer(db,buyer);await seedQualifiedCommerceCreator(db,creator,{environment:'production'});
  await db.query(`insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes,vip_access_required)
   values($1::uuid,$2::uuid,'Synthetic production checkout','public','clean','cloudflare_r2','chillywood-media-origin',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4','video/mp4',1024,false)`,[video,creator.id]);
  await db.query("update public.videos set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=clock_timestamp() where id=$1",[video]);
  const version=await one('select id from private.native_production_video_versions where source_id=$1 order by revision desc limit 1',[video]);
  await db.exec(`insert into public.monetization_products(product_key,product_type,display_name,provider,provider_product_id,environment,status,is_android_digital,metadata)
   values('synthetic_checkout_199','paid_content_access','SYNTHETIC production checkout','revenuecat_google_play','synthetic-checkout-video','production','active',true,
    '{"price_tier":199,"provider_proof":true,"owner_release_approved":true,"physical_device_proof":true,"live_money_enabled_at_activation":true,"fixture":"SYNTHETIC ONLY"}')`);
  const proof=await one(`insert into private.native_production_source_proofs(version_id,origin_provider,origin_bucket,origin_object,origin_generation,asset_sha256,byte_length,scan_receipt_sha256,adapter_version,evidence_sha256,verified_at,expires_at)
   values($1,'cloudflare_r2','chillywood-media-origin',$2,'"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',repeat('a',64),1024,repeat('b',64),'synthetic-only',repeat('c',64),clock_timestamp(),clock_timestamp()+interval '1 hour') returning id`,[version,`${creator.id}/${video}/source.mp4`]);
  const scope=await one(`insert into private.native_production_scope_qualifications(provider,project_id,app_id,store_account_id,provider_product_id,currency,report_schema,legal_document_key,legal_document_version,terms_sha256,platform_share_bps,evidence_sha256,verified_at,expires_at)
   select 'revenuecat_google_play','synthetic-project','synthetic-app','synthetic-store','synthetic-checkout-video','usd','synthetic-report-v1',document_key,version,repeat('d',64),2000,repeat('e',64),clock_timestamp(),clock_timestamp()+interval '1 hour'
   from public.wave1_legal_document_versions where active and market='UNITED_STATES' and capability='creator_money' and document_key='money_terms' limit 1 returning id`);
  await db.query(`insert into public.creator_content_prices(creator_id,content_type,content_id,is_paid,price_cents,currency,status,provider,provider_product_key,provider_product_id)
   values($1,'creator_video',$2,true,199,'usd','active','revenuecat_google_play','synthetic_checkout_199','synthetic-checkout-video')`,[creator.id,video]);
  const capability=()=>one("select public.get_native_production_paid_video_capability('revenuecat_google_play','synthetic-checkout-video',repeat('f',64))");
  const prepare=()=>one("select public.prepare_native_production_paid_video($1,'revenuecat_google_play','synthetic_checkout_199','synthetic-checkout-video',199)",[video]);
  await buyerRole();assert.equal((await capability()).enabled,false);
  const prepared=await prepare();assert.equal(prepared.nativeProductionPreparation.dispatchAllowed,false);
  const admission=prepared.nativeProductionPreparation.admissionId;assert.ok(admission);
  const create=(digest='f'.repeat(64))=>one('select public.create_native_production_paid_video_intent($1,$2)',[admission,digest]);
  await assert.rejects(()=>create(),/checkout_unqualified/);await owner();
  const qualification=await one(`insert into private.native_production_checkout_qualifications(scope_id,configuration_sha256,application_id,native_build,sdk_version,delivery_adapter,receipt_adapter,evidence_sha256,verified_at,expires_at)
   values($1,repeat('f',64),'synthetic.app','synthetic-build','synthetic-sdk','native-production-etag-range-v1','native-attested-store-v1',repeat('e',64),clock_timestamp(),clock_timestamp()+interval '1 hour') returning id`,[scope]);
  const key='synthetic-only-not-a-real-provider-key-000000000';
  await db.query(`insert into private.native_production_witness_configurations(qualification_id,google_certificate_sha256,google_account_binding,evidence_sha256)
   values($1,'synthetic-certificate','sha256-stable-revenuecat-user',repeat('a',64))`,[qualification]);
  const keyId=await one(`insert into private.native_production_checkout_verifier_keys(qualification_id,verification_key,verified_at,expires_at)
   values($1,convert_to($2,'UTF8'),clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour') returning id`,[qualification,key]);
  await buyerRole();assert.equal((await capability()).enabled,false);await assert.rejects(()=>create(),/checkout_unqualified/);
  await owner();await claims('service_role');await db.exec("update private.native_production_checkout_controls set checkout_enabled=true,access_enabled=true");
  await db.exec("update public.platform_money_kill_switches set state='on' where key in ('live_money_enabled','provider_webhooks_enabled','digital_sales_enabled','paid_content_enabled','creator_monetization_enabled','revenuecat_google_play_enabled')");
  await buyerRole(randomUUID());await assert.rejects(()=>create(),/current_session_required/);
  await buyerRole();assert.equal((await capability()).enabled,true);await assert.rejects(()=>create('a'.repeat(64)),/checkout_unqualified/);
  await assert.rejects(()=>create(),/intent_unqualified/);
  await service();await one(`select public.record_native_production_checkout_preflight($1,$2,$3,repeat('f',64),'"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',1024,'video/mp4')`,[admission,buyer.id,buyer.session]);
  await buyerRole();
  const intent=await create();assert.equal(intent.environment,'production');assert.equal(intent.dispatchAllowed,false);assert.ok(intent.nativeProductionDispatchId);
  assert.equal((await create()).id,intent.id,'retry reuses exact intent without dispatch');
  for(const hasNativeHandle of [false,true])await transaction(async()=>{
   const oldPreparation=randomUUID();
   if(hasNativeHandle){await service();await one('select public.accept_native_production_launch_ready($1,$2,$3,repeat(\'a\',64),$4,null,null,null)',
    [intent.nativeProductionDispatchId,buyer.id,buyer.session,oldPreparation]);}
   await buyerRole();const retried=await prepare();
   assert.notEqual(retried.nativeProductionPreparation.admissionId,admission,'unclaimed native preparation retires under the authoritative fence');
   await db.exec('savepoint retired_old');
   await assert.rejects(create,/admission_unavailable/);await db.exec('rollback to retired_old');
   await service();await db.exec('savepoint old_handle');
   await assert.rejects(()=>one('select public.authorize_native_production_sdk_entry($1,$2,$3,$4)',
    [intent.nativeProductionDispatchId,buyer.id,buyer.session,oldPreparation]),/native_witness_held/);
   await db.exec('rollback to old_handle');
   const replacement=retried.nativeProductionPreparation.admissionId;
   await one(`select public.record_native_production_checkout_preflight($1,$2,$3,repeat('f',64),'"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',1024,'video/mp4')`,[replacement,buyer.id,buyer.session]);
   await buyerRole();const resumed=await one('select public.create_native_production_paid_video_intent($1,repeat(\'f\',64))',[replacement]);
   assert.notEqual(resumed.id,intent.id,'retired unclaimed SKU no longer bricks the buyer');
  });
  await buyerRole();
  const claim=attempt=>one('select public.claim_native_production_paid_video_checkout($1,$2,$3)',[intent.id,attempt,'f'.repeat(64)]);
  await assert.rejects(()=>claim(randomUUID()),/checkout_unqualified/);
  await owner();await db.query(`insert into private.native_production_native_launch_ready(dispatch_id,preparation_id,prepared_sha256,elapsed_limit_ms)
   values($1,$2,repeat('a',64),10000)`,[intent.nativeProductionDispatchId,randomUUID()]);await buyerRole();
  const attempt=randomUUID();const dispatch=await claim(attempt);assert.equal(dispatch.startAuthorized,true);assert.equal(dispatch.dispatchAllowed,true);
  assert.equal((await claim(attempt)).dispatchAllowed,false);assert.equal((await claim(randomUUID())).dispatchAllowed,false);
  assert.equal((await prepare()).nativeProductionPending,true,'lost successful claim response remains uncertain, never retired');
  await transaction(async()=>{
   await assert.rejects(()=>db.query('insert into private.native_production_unlaunched_retirements(dispatch_id) values($1)',[intent.nativeProductionDispatchId]),/cannot_retire/);
  });await buyerRole();
  assert.equal((await one("select public.resolve_creator_content_access('creator_video',$1)",[video])).allowed,false,'dispatch is not access');
  await transaction(async()=>{
   await db.query('delete from public.videos where id=$1',[video]);
   await buyerRole();assert.equal((await prepare()).nativeProductionPending,true,'deleted source retains unknown dispatch without inviting another charge');
   await owner();assert.equal(await one('select count(*)::int from private.native_production_checkout_dispatches where id=$1',[intent.nativeProductionDispatchId]),1);
  });
  await owner();const earnings=await one('select count(*)::int from public.creator_earnings_ledger');
  for(const [paid,tax,inclusive,adjustment,points,webhookFirst] of [
   [215,16,false,0,false,false],[199,16,true,0,false,true],[149,0,false,50,false,false],[0,0,false,199,true,true]]){
   await transaction(async()=>{
    const other={id:randomUUID(),session:randomUUID()};await claims('service_role');await seedCommerceBuyer(db,other);
    const otherRole=async()=>{await owner();await claims('authenticated',other.id,other.session);await db.exec('set role authenticated');};
    await otherRole();const prep=await prepare(),admit=prep.nativeProductionPreparation.admissionId;
    await service();await one(`select public.record_native_production_checkout_preflight($1,$2,$3,repeat('f',64),'"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',1024,'video/mp4')`,[admit,other.id,other.session]);
    await otherRole();const buy=await one('select public.create_native_production_paid_video_intent($1,repeat(\'f\',64))',[admit]);
    const preparation=randomUUID(),tx=randomUUID(),chain=randomUUID(),event=randomUUID();
    await service();await one('select public.accept_native_production_launch_ready($1,$2,$3,repeat(\'8\',64),$4,null,null,null)',[buy.nativeProductionDispatchId,other.id,other.session,preparation]);
    await otherRole();assert.equal((await one('select public.claim_native_production_paid_video_checkout($1,$2,repeat(\'f\',64))',[buy.id,randomUUID()])).dispatchAllowed,true);
    const purchased=await one('select clock_timestamp()::text');let canonicalId;
    const ingress=async()=>{
     await service();const canonical=await one(`select public.process_revenuecat_google_play_event_atomic($1,'NON_RENEWING_PURCHASE',$2::uuid,'synthetic-checkout-video',
      'production',clock_timestamp(),null,199,'usd',repeat('8',64),$3,null,$4::timestamptz)`,[event,other.id,chain,purchased]);
     canonicalId=canonical.providerEventId;
     await one('select public.record_native_production_ingress_observation($1)',[{providerEventId:event,canonicalReceiptId:canonicalId,rawPayloadHash:'8'.repeat(64),
      provider:'revenuecat_google_play',environment:'production',eventType:'NON_RENEWING_PURCHASE',reportedAppId:'synthetic-app',configuredProjectId:'synthetic-project',
      reportedProductId:'synthetic-checkout-video',originalTransactionId:chain,transactionId:tx,userId:other.id}]);
    };
    if(webhookFirst)await ingress();
    await service();await one('select public.accept_native_production_verified_witness($1,$2,$3,repeat(\'9\',64),$4,null,null,null,$5,500)',
     [buy.nativeProductionDispatchId,other.id,other.session,tx,preparation]);
    const envelope={dispatchId:buy.nativeProductionDispatchId,canonicalReceiptId:null,provider:'revenuecat_google_play',environment:'production',
     projectId:'synthetic-project',appId:'synthetic-app',storeAccountId:'synthetic-store',productId:'synthetic-checkout-video',buyerId:other.id,
     transactionId:tx,originalTransactionId:chain,grossMinor:paid,currency:'usd',quantity:1,purchasedAt:purchased,adapterVersion:'native-attested-store-v1',
     evidenceSha256:'9'.repeat(64),verifiedAt:await one('select clock_timestamp()::text'),pricing:{protocol:'google-orders-usd-v1',listingMinor:199,
      paidTotalMinor:paid,taxMinor:tax,taxInclusive:inclusive,adjustmentMinor:adjustment,pointsPresent:points,pointsCouponMinor:points?199:null,allocation:'unknown'}};
    const submit=()=>{const assertion=JSON.stringify(envelope);return one('select public.accept_native_production_verified_store_facts($1,$2,$3)',
     [keyId,assertion,createHmac('sha256',key).update(assertion).digest('hex')]);};
    assert.equal((await submit()).accessGranted,webhookFirst);
    if(!webhookFirst){await ingress();assert.equal((await one('select public.reconcile_native_production_paid_video_access($1)',[canonicalId])).accessGranted,true,'later webhook finalizes retained Store facts without another device call');}
    assert.equal((await submit()).accessGranted,true,'lost acceptance response and duplicate facts are idempotent');
    assert.equal((await one('select public.reconcile_native_production_dispatch($1,$2,$3)',[buy.nativeProductionDispatchId,other.id,other.session])).accessGranted,true);
    await owner();assert.equal(await one('select actual_gross_minor::int from private.native_production_purchase_correlations where canonical_receipt_id=$1',[canonicalId]),paid);
    assert.equal(await one('select gross_minor from private.native_production_video_admissions where id=$1',[admit]),199);
    assert.equal(await one('select private.native_production_receipt_amount_binding_current($1)',[canonicalId]),true);
    assert.equal(await one('select count(*)::int from private.native_production_checkout_access_bindings where dispatch_id=$1',[buy.nativeProductionDispatchId]),1);
    assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),earnings,'different paid totals do not manufacture economic allocation');
    // Combined-source synthetic issuer proof. No Store/report transport, no
    // clock backdating and no invented allocation from listing/points values.
    await db.exec('update private.native_production_earning_controls set materialize_held=true');
    const evaluate=()=>one('select private.evaluate_native_production_economics($1)',[canonicalId]);
    const reconcile=async()=>{await service();const result=await one('select public.reconcile_native_production_earning($1)',[canonicalId]);await owner();return result;};
    assert.equal((await evaluate()).economicCoverageComplete,false,'access does not supply absent fee/proceeds facts');
    assert.equal((await reconcile()).status,'HELD');
    assert.equal(await one('select count(*)::int from public.creator_earnings_ledger where provider_event_id=$1',[canonicalId]),0);
    if(paid===0){
     assert.equal(await one('select count(*)::int from private.native_production_funding_proofs where canonical_receipt_id=$1',[canonicalId]),0);
     assert.equal(await one('select count(*)::int from private.native_production_checkout_access_bindings where dispatch_id=$1',[buy.nativeProductionDispatchId]),1);
     return;
    }
    const reportTime=()=>one(`select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`);
    const observedAt=await reportTime();
    const reportBase={provider:envelope.provider,environment:'production',projectId:envelope.projectId,appId:envelope.appId,
     storeAccountId:envelope.storeAccountId,productId:envelope.productId,currency:'usd',buyerId:other.id,
     transactionId:tx,originalTransactionId:chain,evidenceSha256:'c'.repeat(64),observedAt,
     reportSchema:'synthetic-report-v1',qualificationId:scope};
    const fee=20,feeTax=0,proceeds=paid-tax-fee-feeTax;
    const components=['store_fee','fee_tax','sales_tax','developer_proceeds'].map((category,i)=>({...reportBase,
     id:category,kind:'component',componentId:category,category,amountMinor:String([fee,feeTax,tax,proceeds][i]),attribution:'transaction'}));
    const coverage={...reportBase,id:'coverage',kind:'coverage',revision:1,componentIds:components.map(c=>c.componentId),through:observedAt};
    const append=row=>one('select private.append_native_production_report($1,$2)',[canonicalId,row]);
    await db.exec('savepoint rejected_identity');
    await assert.rejects(()=>append({...components[0],transactionId:'different-transaction'}),/native_production_report_identity_mismatch/);
    await db.exec('rollback to rejected_identity');
    assert.equal((await evaluate()).economicCoverageComplete,false);
    assert.equal((await reconcile()).status,'HELD');
    assert.equal(await one('select count(*)::int from private.native_production_report_observations where canonical_receipt_id=$1',[canonicalId]),0);
    for(const mutation of ['tax','excess_proceeds']){
     await db.exec('savepoint invalid_economics');
     const rows=structuredClone(components);
     if(mutation==='tax'){rows[2].amountMinor=String(tax+1);rows[3].amountMinor=String(proceeds-1);}
     if(mutation==='excess_proceeds')rows[3].amountMinor=String(paid+1);
     for(const row of [...rows,coverage])await append(row);
     assert.equal((await evaluate()).economicCoverageComplete,false,mutation+' cannot qualify independent economics');
     assert.equal((await reconcile()).status,'HELD');
     assert.equal(await one('select count(*)::int from public.creator_earnings_ledger where provider_event_id=$1',[canonicalId]),0);
     await db.exec('rollback to invalid_economics');
    }
    for(const row of components)await append(row);
    assert.equal((await evaluate()).economicCoverageComplete,false,'explicit components without complete coverage still hold');
    await append(coverage);assert.equal((await evaluate()).economicCoverageComplete,true);
    const result=await reconcile();assert.equal(result.status,'HELD');assert.equal(result.reason,'native_release_disabled');
    const earning=(await db.query('select * from public.creator_earnings_ledger where id=$1',[result.earningsLedgerId])).rows[0];
    assert.equal(earning.gross_amount_cents,paid);assert.equal(earning.tax_cents,tax);assert.equal(earning.provider_fee_cents,fee+feeTax);
    assert.equal(earning.net_creator_amount_cents+earning.platform_fee_cents,proceeds);assert.equal(earning.ledger_status,'held');
    assert.equal(await one('select amount_minor from public.money_access_ledger_events where id=$1',[earning.money_ledger_event_id]),paid);
    assert.equal(await one('select settlement_started_at=(select purchased_at from private.native_production_purchase_correlations where canonical_receipt_id=$2) and normal_eligible_at>clock_timestamp() from public.creator_earnings_ledger where id=$1',[earning.id,canonicalId]),true);
    const snapshot=await one('select snapshot_id from private.native_production_earning_sources where earnings_ledger_id=$1',[earning.id]);
    assert.equal(await one('select private.native_production_funding_current($1,$2)',[canonicalId,snapshot]),null);
    await claims('authenticated',creator.id,creator.session);await db.exec('set role authenticated');
    const policy=await one('select public.get_creator_fee_policy_status()');await one('select public.accept_creator_fee_policy($1,$2)',[policy.version,policy.termsSha256]);await owner();
    const funding=await one(`insert into private.native_production_funding_proofs(canonical_receipt_id,snapshot_id,platform_account_id,recipient_account_id,
     available_proceeds_minor,currency,funds_available_at,verified_at,expires_at,basis,evidence_sha256,delivery_receipt_sha256,recovery_acceptance_id)
     select $1,$2,'acct_syntheticPlatform',account.provider_account_id,$3,'usd',clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour',
      'authenticated_transaction_available_proceeds_and_delivery_v1',repeat('d',64),repeat('e',64),acceptance.id
     from public.creator_payout_accounts account cross join private.commerce_creator_fee_acceptances acceptance
     where account.creator_user_id=$4::text and account.provider_environment='live' and acceptance.creator_id=$4::uuid
     order by acceptance.accepted_at desc limit 1 returning id`,[canonicalId,snapshot,proceeds,creator.id]);
    assert.equal(await one('select private.native_production_funding_current($1,$2)',[canonicalId,snapshot]),funding);
    assert.equal(Number(await one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[earning.id])),0,'qualified funding cannot override prospective maturity or release OFF');
    await db.exec('savepoint newer_incomplete');
    await append({...coverage,id:'coverage-newer',revision:2,observedAt:await reportTime(),componentIds:['store_fee']});
    assert.equal((await evaluate()).economicCoverageComplete,false,'newer incomplete coverage cannot fall back');
    assert.equal((await reconcile()).status,'HELD');
    await db.exec('rollback to newer_incomplete');
    assert.equal((await reconcile()).earningsLedgerId,earning.id,'replay keeps one exact earning');
   });
  }
  await owner();
  const purchasedAt=await one('select clock_timestamp()::text');
  const eventId='synthetic-checkout-purchase',hash='a'.repeat(64),original='synthetic-checkout-original',transactionId='synthetic-checkout-transaction';
  await service();
  const canonical=await one(`select public.process_revenuecat_google_play_event_atomic($1,'NON_RENEWING_PURCHASE',$2::uuid,'synthetic-checkout-video',
   'production',clock_timestamp(),null,199,'usd',$3,$4,null,$5::timestamptz)`,[eventId,buyer.id,hash,original,purchasedAt]);
  assert.equal(canonical.status,'ignored');assert.equal(canonical.accessGrantId,null);assert.equal(canonical.purchaseIntentId,null);
  const facts={providerEventId:eventId,canonicalReceiptId:canonical.providerEventId,rawPayloadHash:hash,provider:'revenuecat_google_play',environment:'production',
   eventType:'NON_RENEWING_PURCHASE',reportedAppId:'synthetic-app',configuredProjectId:'synthetic-project',reportedProductId:'synthetic-checkout-video',
   originalTransactionId:original,transactionId,userId:buyer.id};
  await one('select public.record_native_production_ingress_observation($1)',[facts]);
  assert.equal((await one('select public.reconcile_native_production_paid_video_access($1)',[facts.canonicalReceiptId])).status,'HELD');
  await owner();
  const signed={dispatchId:intent.nativeProductionDispatchId,canonicalReceiptId:facts.canonicalReceiptId,provider:'revenuecat_google_play',environment:'production',
   projectId:'synthetic-project',appId:'synthetic-app',storeAccountId:'synthetic-store',productId:'synthetic-checkout-video',buyerId:buyer.id,
   transactionId,originalTransactionId:original,grossMinor:199,currency:'usd',quantity:1,purchasedAt,adapterVersion:'native-attested-store-v1',
   evidenceSha256:'b'.repeat(64),verifiedAt:await one('select clock_timestamp()::text')};
  const accept=async(patch={},badSignature=false)=>{
   const assertion=JSON.stringify({...signed,...patch});const signature=badSignature?'0'.repeat(64):createHmac('sha256',key).update(assertion).digest('hex');
   return one('select public.accept_native_production_paid_video_receipt($1,$2,$3)',[keyId,assertion,signature]);
  };
  await service();await assert.rejects(()=>accept({},true),/signed_receipt_invalid/);
  await assert.rejects(()=>accept(),/attested_completion_required/);
  await owner();
  await db.query(`insert into private.native_production_verified_witnesses(dispatch_id,witness_sha256,transaction_id,launched_at,completed_at)
   select $1,repeat('b',64),$2,checkout_started_at,clock_timestamp() from public.money_purchase_intents where id=$3`,
   [intent.nativeProductionDispatchId,transactionId,intent.id]);
  await service();
  for(const patch of [{environment:'sandbox'},{buyerId:creator.id},{transactionId:'wrong'},{grossMinor:198},{storeAccountId:'wrong'},{projectId:'wrong'},{adapterVersion:'wrong'}])
   await assert.rejects(()=>accept(patch),/receipt_mismatch|check constraint|attested_completion_required/);
  const accepted=await accept();assert.equal(accepted.accessGranted,true);assert.equal(accepted.payable,false);assert.equal(accepted.financialAuthority,false);
  assert.deepEqual(await accept(),accepted,'exact verified replay is idempotent');
  await owner();assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),earnings,'access does not issue earnings');
  assert.equal(await one('select dispatch_allowed from private.native_production_video_admissions where id=$1',[admission]),false);
  await buyerRole();assert.equal((await one("select public.resolve_creator_content_access('creator_video',$1)",[video])).allowed,true);
  await transaction(async()=>{
   const expired=await one(`insert into private.native_production_checkout_qualifications(scope_id,configuration_sha256,application_id,native_build,sdk_version,
    delivery_adapter,receipt_adapter,evidence_sha256,verified_at,expires_at,delivery_renewal_root_id)
    select scope_id,repeat('8',64),application_id,'old-app-build','old-sdk',delivery_adapter,receipt_adapter,evidence_sha256,
     verified_at,verified_at+interval '1 microsecond',id from private.native_production_checkout_qualifications where id=$1 returning id`,[qualification]);
   const renewal=await one(`insert into private.native_production_checkout_qualifications(scope_id,configuration_sha256,application_id,native_build,sdk_version,
    delivery_adapter,receipt_adapter,evidence_sha256,verified_at,expires_at,delivery_renewal_root_id)
    select scope_id,repeat('9',64),application_id,'new-app-build','new-sdk',delivery_adapter,receipt_adapter,evidence_sha256,
     clock_timestamp(),clock_timestamp()+interval '1 hour',id from private.native_production_checkout_qualifications where id=$1 returning id`,[qualification]);
   assert.equal(await one('select private.native_production_current_delivery_qualification($1)',[expired]),renewal,'expired purchase qualification uses explicit compatible current delivery');
   await buyerRole();const access=await one("select public.resolve_creator_content_access('creator_video',$1)",[video]);
   assert.equal(access.allowed,true);assert.equal(access.nativeProductionDeliveryOnly,true);
   const playback=await one('select public.get_native_production_paid_video_playback($1)',[video]);assert.equal(playback.status,'READY');
   await service();assert.ok(await one('select public.resolve_native_production_paid_video_origin($1,$2,$3,$4)',[video,playback.grantId,buyer.id,buyer.session]));
   await owner();
   await db.query(`insert into private.native_production_checkout_qualifications(scope_id,configuration_sha256,application_id,native_build,sdk_version,
    delivery_adapter,receipt_adapter,evidence_sha256,verified_at,expires_at,delivery_renewal_root_id)
    select scope_id,configuration_sha256,application_id,native_build,sdk_version,delivery_adapter,receipt_adapter,evidence_sha256,
     verified_at,expires_at,delivery_renewal_root_id from private.native_production_checkout_qualifications where id=$1`,[renewal]);
   assert.equal(await one('select private.native_production_current_delivery_qualification($1)',[qualification]),null,'tied compatible records are held, not UUID elected');
  });
  await transaction(async()=>{
   await db.query(`insert into private.native_production_checkout_qualifications(scope_id,configuration_sha256,application_id,native_build,sdk_version,
    delivery_adapter,receipt_adapter,evidence_sha256,verified_at,expires_at,delivery_renewal_root_id)
    select scope_id,repeat('9',64),application_id,'new-build',sdk_version,'changed-delivery',receipt_adapter,evidence_sha256,
     clock_timestamp(),clock_timestamp()+interval '1 hour',id from private.native_production_checkout_qualifications where id=$1`,[qualification]);
   assert.equal(await one('select private.native_production_current_delivery_qualification($1)',[qualification]),null,'changed adapter cannot silently restore old paid access');
  });
  await transaction(async()=>{
   const replacementSession=randomUUID();await claims('service_role');await seedCommerceBuyer(db,{id:buyer.id,session:replacementSession});
   await db.query('delete from auth.sessions where id=$1',[buyer.session]);
   await buyerRole(replacementSession);
   assert.equal((await one("select public.resolve_creator_content_access('creator_video',$1)",[video])).allowed,true,'paid ownership survives logout and a new session');
   const playback=await one('select public.get_native_production_paid_video_playback($1)',[video]);assert.equal(playback.status,'READY');
   await service();assert.ok(await one('select public.resolve_native_production_paid_video_origin($1,$2,$3,$4)',[video,playback.grantId,buyer.id,replacementSession]));
   assert.equal(await one('select public.resolve_native_production_paid_video_origin($1,$2,$3,$4)',[video,playback.grantId,buyer.id,buyer.session]),null);
   await owner();
  });
  await transaction(async()=>{
   await db.query('insert into private.native_production_checkout_revocations(qualification_id) values($1)',[qualification]);
   await buyerRole();assert.equal((await one("select public.resolve_creator_content_access('creator_video',$1)",[video])).allowed,false);
   assert.equal((await prepare()).alreadyPurchased,true,'temporary qualification hold never suggests another charge');await owner();
  });
  await transaction(async()=>{
   // Shorter synthetic admission tests settlement after launch expiry without
   // changing the real five-minute policy or sleeping a full purchase window.
   const lateBuyer={id:randomUUID(),session:randomUUID()};await claims('service_role');await seedCommerceBuyer(db,lateBuyer);
   const lateRole=async()=>{await owner();await claims('authenticated',lateBuyer.id,lateBuyer.session);await db.exec('set role authenticated');};
   await lateRole();const originalPreparation=await prepare();await owner();
   const delayedQualification=await one(`insert into private.native_production_delayed_settlement_qualifications(checkout_qualification_id,adapter,evidence_sha256,verified_at,expires_at)
    values($1,'native-monotonic-ack-v1',repeat('6',64),clock_timestamp(),clock_timestamp()+interval '1 hour') returning id`,[qualification]);
   const short=await one(`with t as materialized(select clock_timestamp() as created), facts as materialized(
    select a.*,t.created as fixture_created,t.created+interval '2 seconds' as fixture_expires,q.terms_sha256,q.platform_share_bps
    from private.native_production_video_admissions a join private.native_production_scope_qualifications q on q.id=a.scope_id cross join t where a.id=$1)
    insert into private.native_production_video_admissions(buyer_id,session_id,creator_id,source_version_id,source_proof_id,scope_id,catalog_product_id,store_mapping_id,
     product_key,gross_minor,currency,quantity,terms_acceptance_id,terms_role_key,quote_sha256,created_at,expires_at)
    select buyer_id,session_id,creator_id,source_version_id,source_proof_id,scope_id,catalog_product_id,store_mapping_id,product_key,gross_minor,currency,quantity,
     terms_acceptance_id,terms_role_key,encode(extensions.digest(convert_to(jsonb_build_object('buyer',buyer_id,'session',session_id::text,'version',source_version_id,
      'proof',source_proof_id,'scope',scope_id,'catalog',catalog_product_id,'mapping',store_mapping_id,'productKey',product_key,'gross',gross_minor,'currency',currency,
      'quantity',quantity,'terms',terms_sha256,'acceptance',terms_acceptance_id,'shareBps',platform_share_bps,'createdAt',fixture_created,'expiresAt',fixture_expires)::text,'UTF8'),'sha256'),'hex'),
     fixture_created,fixture_expires from facts returning id`,[originalPreparation.nativeProductionPreparation.admissionId]);
   await service();await one(`select public.record_native_production_checkout_preflight($1,$2,$3,repeat('f',64),'"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',1024,'video/mp4')`,[short,lateBuyer.id,lateBuyer.session]);
   await lateRole();const lateIntent=await one('select public.create_native_production_paid_video_intent($1,repeat(\'f\',64))',[short]);
   await service();const preparationId=randomUUID();
   await one('select public.accept_native_production_launch_ready($1,$2,$3,repeat(\'5\',64),$4,null,null,null)',[lateIntent.nativeProductionDispatchId,lateBuyer.id,lateBuyer.session,preparationId]);
   await lateRole();const lateClaim=await one('select public.claim_native_production_paid_video_checkout($1,$2,repeat(\'f\',64))',[lateIntent.id,randomUUID()]);assert.equal(lateClaim.dispatchAllowed,true);
   await owner();await db.exec('select pg_sleep(2.05)');const latePurchasedAt=await one('select clock_timestamp()::text');
   await service();const lateEvent='synthetic-delayed-event',lateTx='synthetic-delayed-tx',lateOriginal='synthetic-delayed-original';
   const lateCanonical=await one(`select public.process_revenuecat_google_play_event_atomic($1,'NON_RENEWING_PURCHASE',$2::uuid,'synthetic-checkout-video',
    'production',clock_timestamp(),null,199,'usd',repeat('7',64),$3,null,$4::timestamptz)`,[lateEvent,lateBuyer.id,lateOriginal,latePurchasedAt]);
   await one('select public.record_native_production_ingress_observation($1)',[{...facts,providerEventId:lateEvent,canonicalReceiptId:lateCanonical.providerEventId,
    rawPayloadHash:'7'.repeat(64),transactionId:lateTx,originalTransactionId:lateOriginal,userId:lateBuyer.id}]);
   await one('select public.accept_native_production_verified_witness($1,$2,$3,repeat(\'7\',64),$4,null,null,null,$5,500)',
    [lateIntent.nativeProductionDispatchId,lateBuyer.id,lateBuyer.session,lateTx,preparationId]);
   const lateSigned={...signed,dispatchId:lateIntent.nativeProductionDispatchId,canonicalReceiptId:lateCanonical.providerEventId,buyerId:lateBuyer.id,
    transactionId:lateTx,originalTransactionId:lateOriginal,purchasedAt:latePurchasedAt,evidenceSha256:'7'.repeat(64),verifiedAt:await one('select clock_timestamp()::text')};
   const lateAssertion=JSON.stringify(lateSigned),lateSignature=createHmac('sha256',key).update(lateAssertion).digest('hex');
   const acceptLate=()=>one('select public.accept_native_production_paid_video_receipt($1,$2,$3)',[keyId,lateAssertion,lateSignature]);
   await owner();await db.exec('savepoint revoked_delayed');
   await db.query('insert into private.native_production_delayed_settlement_revocations(qualification_id) values($1)',[delayedQualification]);
   await service();await assert.rejects(acceptLate,/native_delayed_settlement_held/);await db.exec('rollback to revoked_delayed');
   await owner();await db.exec('savepoint invalid_historical_launch');
   await db.query(`insert into private.native_production_delayed_settlement_qualifications(checkout_qualification_id,adapter,evidence_sha256,verified_at,expires_at)
    select $1,'native-monotonic-ack-v1',repeat('4',64),server_received_at-interval '1 microsecond',server_received_at
    from private.native_production_native_launch_ready where dispatch_id=$2`,[qualification,lateIntent.nativeProductionDispatchId]);
   await db.query(`insert into private.native_production_delayed_settlement_qualifications(checkout_qualification_id,adapter,evidence_sha256,verified_at,expires_at)
    values($1,'native-monotonic-ack-v1',repeat('3',64),clock_timestamp(),clock_timestamp()+interval '1 hour')`,[qualification]);
   await service();await assert.rejects(acceptLate,/native_delayed_settlement_held/,'current renewal cannot hide newer invalid launch-time qualification');
   await db.exec('rollback to invalid_historical_launch');
   await owner();await db.exec('savepoint tied_historical_launch');
   await db.query(`insert into private.native_production_delayed_settlement_qualifications(checkout_qualification_id,adapter,evidence_sha256,verified_at,expires_at)
    select $1,'native-monotonic-ack-v1',repeat('4',64),ready.server_received_at,clock_timestamp()+interval '1 hour'
    from private.native_production_native_launch_ready ready cross join generate_series(1,2) where ready.dispatch_id=$2`,[qualification,lateIntent.nativeProductionDispatchId]);
   await db.query(`insert into private.native_production_delayed_settlement_qualifications(checkout_qualification_id,adapter,evidence_sha256,verified_at,expires_at)
    values($1,'native-monotonic-ack-v1',repeat('3',64),clock_timestamp(),clock_timestamp()+interval '1 hour')`,[qualification]);
   await service();await assert.rejects(acceptLate,/native_delayed_settlement_held/,'current renewal cannot hide ambiguous launch-time authority');
   await db.exec('rollback to tied_historical_launch');
   await service();assert.equal((await acceptLate()).accessGranted,true,'trusted original dispatch can settle after launch admission expires');
   await owner();assert.equal(await one('select count(*)::int from private.native_production_delayed_settlement_proofs'),1);
   assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),earnings,'late access remains independent of held economics');
   await lateRole();assert.equal((await prepare()).alreadyPurchased,true,'late paid receipt never reopens a charge');await owner();
  });
  await transaction(async()=>{
   await db.query("update public.videos set storage_object_key=storage_object_key||'.replacement' where id=$1",[video]);
   await buyerRole();assert.equal((await one("select public.resolve_creator_content_access('creator_video',$1)",[video])).allowed,false);
   assert.equal((await prepare()).alreadyPurchased,true);await owner();
  });
  await transaction(async()=>{
   await db.query('delete from public.videos where id=$1',[video]);
   await buyerRole();assert.equal((await one('select public.get_native_production_paid_video_playback($1)',[video])).status,'HELD');
   assert.equal((await prepare()).alreadyPurchased,true,'deleted source retains paid ownership without a recharge');
   await owner();assert.equal(await one('select count(*)::int from private.native_production_checkout_access_bindings where dispatch_id=$1',[intent.nativeProductionDispatchId]),1);
  });
  await transaction(async()=>{
   await db.query('insert into private.native_production_source_revocations(proof_id) values($1)',[proof]);
   await buyerRole();assert.equal((await one("select public.resolve_creator_content_access('creator_video',$1)",[video])).allowed,false);await owner();
  });
  await transaction(async()=>{
   await db.query('insert into private.native_production_checkout_verifier_revocations(key_id) values($1)',[keyId]);
   await buyerRole();assert.equal((await one("select public.resolve_creator_content_access('creator_video',$1)",[video])).allowed,false);await owner();
  });
  await service();
  const negative=await one(`select public.process_revenuecat_terminal_event_atomic('revenuecat_google_play','synthetic-checkout-refund','REFUND',$1::uuid,
   null,null,'production','revoked',null,null,clock_timestamp(),repeat('c',64),null,'PLAY_STORE','android',$2)`,[buyer.id,original]);
  assert.equal(negative.domain,'creator_money');
  await one('select public.record_native_production_ingress_observation($1)',[{...facts,providerEventId:'synthetic-checkout-refund',canonicalReceiptId:negative.providerEventId,
   rawPayloadHash:'c'.repeat(64),eventType:'REFUND',reportedProductId:null}]);
  await buyerRole();assert.equal((await one("select public.resolve_creator_content_access('creator_video',$1)",[video])).allowed,false);
  await owner();assert.equal(await one('select count(*)::int from private.native_production_checkout_access_bindings'),1,'negative holds retain immutable history');
  for(const role of ['anon','authenticated','service_role']){
   await owner();await claims(role,buyer.id,buyer.session);await db.exec(`set role ${role}`);
   await assert.rejects(()=>db.query('select * from private.native_production_checkout_verifier_keys'),/permission denied/);
   await assert.rejects(()=>db.query('insert into private.native_production_checkout_receipt_proofs default values'),/permission denied/);
   await assert.rejects(()=>one('select private.bind_native_production_checkout_receipt($1)',[randomUUID()]),/permission denied/);
  }
 }finally{await db.close();}
});
