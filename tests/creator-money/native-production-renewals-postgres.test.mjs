import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {databaseFactory as nativeDatabaseFactory} from '../helpers/native-deployment-database.mjs';
import {seedMatureNativeSale} from '../helpers/native-production-mature-fixture.mjs';

test('native current renewals preserve historical proof and fence new latest-row phantoms',{timeout:600000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false,
  databaseFactory:process.env.NATIVE_DEPLOYMENT_PG_BIN?()=>nativeDatabaseFactory({transport:process.env.NATIVE_PRODUCTION_PG_LOOPBACK==='1'?'loopback':'unix'}):null});
 try{
  const f=await seedMatureNativeSale(db,{proofLifetime:'3 seconds',admitUnderRenewal:true}),one=f.scalar;
  const scopeSql=`insert into private.native_production_scope_qualifications(provider,project_id,app_id,store_account_id,provider_product_id,currency,report_schema,
   legal_document_key,legal_document_version,terms_sha256,platform_share_bps,evidence_sha256,verified_at,expires_at,renewal_root_scope_id)
   select coalesce($2::jsonb->>'provider',provider),coalesce($2::jsonb->>'projectId',project_id),coalesce($2::jsonb->>'appId',app_id),
    coalesce($2::jsonb->>'storeAccountId',store_account_id),coalesce($2::jsonb->>'productId',provider_product_id),currency,
    coalesce($2::jsonb->>'reportSchema',report_schema),legal_document_key,coalesce($2::jsonb->>'legalVersion',legal_document_version),
    coalesce($2::jsonb->>'termsSha256',terms_sha256),coalesce(($2::jsonb->>'shareBps')::integer,platform_share_bps),repeat('9',64),
    coalesce(($2::jsonb->>'verifiedAt')::timestamptz,clock_timestamp()),coalesce(($2::jsonb->>'expiresAt')::timestamptz,clock_timestamp()+interval '1 hour'),
    case when $2::jsonb->'unlinked'='true'::jsonb then null else id end
   from private.native_production_scope_qualifications where id=$1 returning id`;
  const sourceSql=`insert into private.native_production_source_proofs(version_id,origin_provider,origin_bucket,origin_object,origin_generation,asset_sha256,byte_length,
   scan_receipt_sha256,adapter_version,evidence_sha256,verified_at,expires_at,renewal_root_proof_id)
   select version_id,origin_provider,origin_bucket,origin_object,coalesce($2::jsonb->>'generation',origin_generation),coalesce($2::jsonb->>'assetSha256',asset_sha256),
    byte_length,repeat('8',64),coalesce($2::jsonb->>'adapter',adapter_version),repeat('9',64),
    coalesce(($2::jsonb->>'verifiedAt')::timestamptz,clock_timestamp()),coalesce(($2::jsonb->>'expiresAt')::timestamptz,clock_timestamp()+interval '1 hour'),
    case when $2::jsonb->'unlinked'='true'::jsonb then null else id end from private.native_production_source_proofs where id=$1 returning id`;
  const renewScope=patch=>one(scopeSql,[f.scopeQualification,patch??{}]);
  const renewSource=patch=>one(sourceSql,[f.proof,patch??{}]);
  const tx=async fn=>{await db.exec('reset role;begin');try{await fn();}finally{await db.exec('rollback;reset role');}};
  await db.exec('update private.native_production_earning_controls set materialize_held=true');
  const held=await f.reconcile(),earning=held.earningsLedgerId;assert.ok(earning);
  const snapshot=await one('select snapshot_id from private.native_production_earning_sources where earnings_ledger_id=$1',[earning]);
  await f.seedFunding(snapshot);await db.exec('update private.native_production_earning_controls set release_earnings=true');
  assert.equal((await f.reconcile()).status,'available');
  const scope=await renewScope(),proof=await renewSource();
  assert.equal(await one('select private.native_production_scope_equivalent($1,$2)',[scope,f.scopeQualification]),true,'renewal-admitted sale may retain root-issued historical reports');
  assert.equal(await one('select private.native_production_report_qualification_valid($1,$2,$3)',[scope,f.components[0],f.components[0].observedAt]),true);
  const withdraw=()=>one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[earning]);
  assert.equal(Number(await withdraw()),12480,'explicit equivalent renewal does not invalidate original admission');
  await db.exec('select pg_sleep(3.1)');
  assert.equal(Number(await withdraw()),12480,'original proof expiry does not erase valid historical evidence with current exact renewal');
  assert.deepEqual((await db.query('select source_proof_id,scope_id from private.native_production_video_admissions where id=$1',[f.admission])).rows[0],
   {source_proof_id:f.proof,scope_id:f.admissionScope},'renewal never rewrites admission proof IDs');
  const observedAt=new Date().toISOString();
  for(const row of f.components)await f.append({...row,id:`renewed-${row.id}`,qualificationId:scope,observedAt});
  await f.append({...f.coverage,id:'renewed-coverage',revision:2,qualificationId:scope,observedAt,through:observedAt});
  assert.equal(Number(await withdraw()),12480,'new observed reports use their own valid renewed issuer without double counting');
  for(const patch of [{projectId:'changed-project'},{appId:'changed-app'},{storeAccountId:'changed-account'},{productId:'changed-product'},
   {reportSchema:'unknown-schema'},{legalVersion:'changed-terms'},{termsSha256:'a'.repeat(64)},{shareBps:3000},{unlinked:true},
   {expiresAt:new Date(Date.now()-10).toISOString(),verifiedAt:new Date(Date.now()-20).toISOString()}])await tx(async()=>{
    await renewScope(patch);assert.equal(Number(await withdraw()),0,JSON.stringify(patch));
   });
  for(const patch of [{assetSha256:'f'.repeat(64)},{generation:'changed-generation'},{adapter:'unknown-adapter'},{unlinked:true}])await tx(async()=>{
   await renewSource(patch);assert.equal(Number(await withdraw()),0,JSON.stringify(patch));
  });
  await tx(async()=>{const newest=await renewScope();await db.query('insert into private.native_production_scope_revocations values($1)',[newest]);assert.equal(Number(await withdraw()),0);});
  await tx(async()=>{const newest=await renewSource();await db.query('insert into private.native_production_source_revocations values($1)',[newest]);assert.equal(Number(await withdraw()),0);});
  await tx(async()=>{const stamp=new Date().toISOString();await renewScope({verifiedAt:stamp});await renewScope({verifiedAt:stamp});assert.equal(Number(await withdraw()),0,'latest timestamp tie is ambiguous, not UUID election');});
  await tx(async()=>{const stamp=new Date().toISOString();await renewSource({verifiedAt:stamp});await renewSource({verifiedAt:stamp});assert.equal(Number(await withdraw()),0);});
  await f.claims('authenticated');await db.exec('set role authenticated');
  const request=await one("select public.request_qualified_creator_cashout(10000,'instant',$1,$2,200,0,9800)",[f.qualification,randomUUID()]);await db.exec('reset role');
  const claim=()=>f.rpc("select public.claim_creator_cashout_dispatch($1,'funding')",[request.requestId]);
  if(db.withConnection){
   for(const commit of [false,true])await db.withConnection(async holder=>{
    await holder.query('begin');const inserted=(await holder.query(scopeSql,[f.scopeQualification,{}])).rows[0].id;
    await assert.rejects(claim(),error=>error.code==='55P03','new latest qualification INSERT cannot race final current recheck');
    await holder.query(commit?'commit':'rollback');
    await tx(async()=>{assert.equal((await claim()).claimed,true,`fresh current recheck succeeds after equivalent ${commit?'commit':'rollback'}`);});
    if(commit)await db.withConnection(async revoker=>{
     await revoker.query('begin');await revoker.query('insert into private.native_production_scope_revocations values($1)',[inserted]);
     await assert.rejects(claim(),error=>error.code==='55P03');await revoker.query('rollback');
    });
   });
   await db.withConnection(async holder=>{
    await holder.query('begin');await holder.query('insert into private.native_production_source_revocations values($1)',[proof]);
    await assert.rejects(claim(),error=>error.code==='55P03');await holder.query('commit');
   });
   assert.equal(Number(await withdraw()),0,'committed original current-proof revocation fails closed even with source unchanged');
   await assert.rejects(claim(),/cashout_reserved_earnings_reduced/);
  }
 }finally{await db.close();}
});
