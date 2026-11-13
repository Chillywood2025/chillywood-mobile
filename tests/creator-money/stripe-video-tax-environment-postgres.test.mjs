import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('paid-video test tax qualification binds without admitting live environments', {timeout:1200000}, async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try {
  await db.exec(`set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}'`);
  const order=randomUUID();
  await db.query(`insert into private.stripe_paid_video_orders(id,buyer_id,session_id,video_id,creator_id,price_id,price_revision,amount_minor,currency,stripe_account_id,stripe_product_id,request_id,status,expires_at)
   values($1,$2,$3,$4,$5,$6,1,1000,'usd','acct_test','prod_video',$7,'prepared',now()+interval '1 hour')`,[order,...Array.from({length:6},()=>randomUUID())]);
  const bind=()=>one("select public.bind_stripe_video_tax_checkout_policy('paid_video',$1,'prod_video','acct_test','test','worldwide')",[order]);
  assert.equal((await bind()).reason,'tax_qualification_required');
  const qualify=(environment)=>one(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
   professional_basis_reference,coverage_evidence_reference,full_permitted_scope_reviewed,collection_mode,liability_type,tax_code,tax_behavior,
   registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,provider_verified_at,provider_expires_at,expires_at,enabled)
   values('paid_video','prod_video','acct_test',$1,'worldwide','all_supported_platforms','synthetic only','synthetic only',true,'automatic','self','txcd_10000000','inclusive',
   'synthetic only','synthetic only','synthetic only',now(),now()+interval '1 hour',now()+interval '1 hour',true) returning id`,[environment]);
  for(const environment of ['live','production','sandbox']) await assert.rejects(()=>qualify(environment),/commerce_tax_qualifications_environment_check/);
  const policy=await qualify('test');
  const result=await bind();assert.equal(result.ready,true);assert.equal(result.policyId,policy);
  assert.equal((await bind()).policyId,policy);
  await db.query('update private.commerce_tax_qualifications set revoked_at=now() where id=$1',[policy]);
  assert.equal((await bind()).reason,'tax_qualification_expired');
  assert.equal(await one('select count(*)::int from private.commerce_tax_checkout_bindings where identity_id=$1',[order]),1);
 } finally {await db.close();}
});
