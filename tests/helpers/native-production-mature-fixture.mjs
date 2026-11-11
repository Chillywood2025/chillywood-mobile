// Owned disposable database ONLY. Synthetic, independently seeded historical
// initial state exercises maturity without changing clocks, policies or guards.
// This is not proof that today's prospective producer ran forty days ago, or
// that any real provider exposes transaction-level fees/funding/delivery facts.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {seedCashoutExecutionFixture} from './cashout-execution-fixture.mjs';

export async function seedMatureNativeSale(db,{sharedLegalVersion=null,proofLifetime='1 day',admitUnderRenewal=false,purchaseAge='40 days'}={}){
 const creator=randomUUID(),session=randomUUID(),buyer=randomUUID(),buyerSession=randomUUID(),video=randomUUID();
 const suffix=creator.replaceAll('-','');const account=`acct_native${suffix}`;
 const f=await seedCashoutExecutionFixture(db,{creatorId:creator,sessionId:session,recipientAccountId:account,reserveInitialRequest:false});
 const one=f.scalar;await db.exec('reset role');
 await db.query('insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values($1,false,false,clock_timestamp())',[buyer]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[buyerSession,buyer]);
 await db.query(`insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes,vip_access_required)
  values($1::uuid,$2::uuid,'SYNTHETIC matured native video','public','clean','cloudflare_r2','chillywood-media-origin',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4','video/mp4',1024,false)`,[video,creator]);
 await db.query("update public.videos set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=clock_timestamp()-$2::interval-interval '2 days' where id=$1",[video,purchaseAge]);
 // Seed a privileged synthetic historical incarnation. Do not disable the
 // ordinary prospective trigger or bypass any append-only/RLS product guard.
 const version=await one(`insert into private.native_production_video_versions(source_id,creator_id,revision,source_facts_sha256,operation,created_at)
  select id,owner_id,(select max(revision)+1 from private.native_production_video_versions where source_id=$1),
   encode(extensions.digest(convert_to(private.native_production_video_facts(v)::text,'UTF8'),'sha256'),'hex'),'present',clock_timestamp()-$2::interval-interval '1 day'
  from public.videos v where id=$1 returning id`,[video,purchaseAge]);
 const proof=await one(`insert into private.native_production_source_proofs(version_id,origin_provider,origin_bucket,origin_object,origin_generation,asset_sha256,byte_length,scan_receipt_sha256,adapter_version,evidence_sha256,verified_at,expires_at)
  values($1,'cloudflare_r2','chillywood-media-origin',$2,'SYNTHETIC-immutable-generation',repeat('a',64),1024,repeat('b',64),'SYNTHETIC-only',repeat('c',64),clock_timestamp()-$4::interval-interval '1 hour',clock_timestamp()+$3::interval) returning id`,[version,`${creator}/${video}/source.mp4`,proofLifetime,purchaseAge]);
 const productKey=`synthetic-native-${suffix}`,providerProduct=`synthetic-native-product-${suffix}`;
 const product=await one(`insert into public.monetization_products(product_key,product_type,display_name,provider,provider_product_id,environment,status,is_android_digital,metadata)
  values($1,'paid_content_access','SYNTHETIC historical native sale','revenuecat_google_play',$2,'production','active',true,
   '{"provider_proof":true,"live_money_enabled_at_activation":true,"fixture":"SYNTHETIC ONLY"}') returning id`,[productKey,providerProduct]);
 const legalVersion=sharedLegalVersion??`synthetic-native-${suffix}`;
 await db.query("update public.wave1_legal_document_versions set active=false where document_key='money_terms' and capability='creator_money' and version<>$1",[legalVersion]);
 await db.query(`insert into public.wave1_legal_document_versions(document_key,version,market,capability,effective_at)
  values('money_terms',$1,'UNITED_STATES','creator_money',clock_timestamp()-$2::interval-interval '5 days') on conflict do nothing`,[legalVersion,purchaseAge]);
 // A second creator seeded against a shared current document already has its
 // present-session acceptance. The historical sale retains a distinct past
 // session acceptance, never rewrites today's acceptance or disables a guard.
 const historicSession=await one("select exists(select 1 from public.wave1_legal_acceptances where user_id=$1 and document_key='money_terms' and document_version=$2 and session_generation=$3)",[creator,legalVersion,session])?randomUUID():session;
 const accepted=await one(`with stamp as materialized(select clock_timestamp()-$4::interval-interval '2 days' as anchor_at)
  insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source,accepted_at,created_at,retention_expires_at)
  select $1,repeat('a',64),'money_terms',$2,'UNITED_STATES','member','creator_money',$3,'service_reconciliation',
   anchor_at,anchor_at,anchor_at+interval '7 years' from stamp returning id`,[creator,legalVersion,historicSession,purchaseAge]);
 const qualification=await one(`insert into private.native_production_scope_qualifications(provider,project_id,app_id,store_account_id,provider_product_id,currency,report_schema,legal_document_key,legal_document_version,terms_sha256,platform_share_bps,evidence_sha256,verified_at,expires_at)
  values('revenuecat_google_play',$1,$2,$3,$4,'usd','synthetic-report-v1','money_terms',$5,repeat('d',64),2000,repeat('e',64),clock_timestamp()-$7::interval-interval '3 days',clock_timestamp()+$6::interval) returning id`,
  [`project-${suffix}`,`app-${suffix}`,`store-${suffix}`,providerProduct,legalVersion,proofLifetime,purchaseAge]);
 const admissionScope=admitUnderRenewal?await one(`insert into private.native_production_scope_qualifications(provider,project_id,app_id,store_account_id,provider_product_id,currency,report_schema,
  legal_document_key,legal_document_version,terms_sha256,platform_share_bps,evidence_sha256,verified_at,expires_at,renewal_root_scope_id)
  select provider,project_id,app_id,store_account_id,provider_product_id,currency,report_schema,legal_document_key,legal_document_version,terms_sha256,platform_share_bps,
   evidence_sha256,verified_at+interval '1 day',expires_at,id from private.native_production_scope_qualifications where id=$1 returning id`,[qualification]):qualification;
 const admission=await one(`insert into private.native_production_video_admissions(buyer_id,session_id,creator_id,source_version_id,source_proof_id,scope_id,catalog_product_id,product_key,gross_minor,currency,quantity,
  terms_acceptance_id,terms_role_key,quote_sha256,created_at,expires_at)
  values($1,$2,$3,$4,$5,$6,$7,$8,19900,'usd',1,$9,'member',repeat('f',64),clock_timestamp()-$10::interval,clock_timestamp()-$10::interval+interval '5 minutes') returning id`,
  [buyer,buyerSession,creator,version,proof,admissionScope,product,productKey,accepted,purchaseAge]);
 const facts={providerEventId:`native-historical-${suffix}`,rawPayloadHash:'a'.repeat(64),provider:'revenuecat_google_play',environment:'production',eventType:'NON_RENEWING_PURCHASE',
  configuredProjectId:`project-${suffix}`,reportedAppId:`app-${suffix}`,reportedProductId:providerProduct,userId:buyer,transactionId:`transaction-${suffix}`,originalTransactionId:`original-${suffix}`};
 await f.rpc('select public.reserve_revenuecat_webhook_ingress_event($1,$2)',[facts.providerEventId,facts.rawPayloadHash]);
 const receipt=await one(`insert into public.provider_events(provider_event_id,provider,product_id,product_key,user_id,app_user_id,environment,event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata)
  values($1,'revenuecat_google_play',$2,$3,$4::uuid,$4,'production','NON_RENEWING_PURCHASE','ignored',clock_timestamp()-$7::interval+interval '30 seconds',$1,$5,$6) returning id`,
  [facts.providerEventId,product,productKey,buyer,facts.rawPayloadHash,{provider_product_id:providerProduct,original_transaction_id:facts.originalTransactionId},purchaseAge]);
 facts.canonicalReceiptId=receipt;await f.rpc('select public.record_native_production_ingress_observation($1)',[facts]);
 await db.query(`insert into private.native_production_purchase_correlations(canonical_receipt_id,admission_id,transaction_id,original_transaction_id,purchased_at,actual_gross_minor,quantity,evidence_sha256,adapter_version)
  values($1,$2,$3,$4,(select created_at+interval '30 seconds' from private.native_production_video_admissions where id=$2),19900,1,repeat('b',64),'SYNTHETIC-only')`,[receipt,admission,facts.transactionId,facts.originalTransactionId]);
 const observedAt=new Date().toISOString();
 const base={provider:'revenuecat_google_play',environment:'production',projectId:facts.configuredProjectId,appId:facts.reportedAppId,storeAccountId:`store-${suffix}`,productId:providerProduct,
  currency:'usd',buyerId:buyer,transactionId:facts.transactionId,originalTransactionId:facts.originalTransactionId,evidenceSha256:'c'.repeat(64),observedAt};
 const components=['store_fee','fee_tax','sales_tax','developer_proceeds'].map((category,index)=>({...base,id:category,kind:'component',componentId:category,category,
  amountMinor:['3000','300','1000','15600'][index],reportSchema:'synthetic-report-v1',qualificationId:qualification,attribution:'transaction'}));
 const coverage={...base,id:'coverage',kind:'coverage',revision:1,componentIds:components.map(c=>c.componentId),reportSchema:'synthetic-report-v1',qualificationId:qualification,through:observedAt};
 const append=row=>one('select private.append_native_production_report($1,$2)',[receipt,row]);
 for(const row of [...components,coverage])await append(row);
 assert.equal((await one('select private.evaluate_native_production_economics($1)',[receipt])).economicCoverageComplete,true);
 const reconcile=()=>f.rpc('select public.reconcile_native_production_earning($1)',[receipt]);
 const seedFunding=async snapshot=>one(`insert into private.native_production_funding_proofs(canonical_receipt_id,snapshot_id,platform_account_id,recipient_account_id,available_proceeds_minor,currency,
  funds_available_at,verified_at,expires_at,basis,evidence_sha256,delivery_receipt_sha256,recovery_acceptance_id)
  select $1,$2,'acct_cashoutPlatform',$3,15600,'usd',clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour',
   'authenticated_transaction_available_proceeds_and_delivery_v1',repeat('d',64),repeat('e',64),id
   from private.commerce_creator_fee_acceptances where creator_id=$4 order by accepted_at desc limit 1 returning id`,[receipt,snapshot,account,creator]);
 return {...f,creator,buyer,video,version,proof,scopeQualification:qualification,admissionScope,admission,receipt,facts,base,components,coverage,append,reconcile,seedFunding};
}
