import assert from 'node:assert/strict';
import {installBrandSoftRemovalFixture,readMigration} from './brand-soft-removal-fixture.mjs';
// Reuses explicitly synthetic auth.uid/jwt, Premium and account-restriction
// boundaries from the scanner fixture. Native pgTAP covers real Auth/Wave1/RLS.
// The membership rows, exact role/session functions, review writer, schemas,
// scanner completion/receipt, source guard and locator guards below are real SQL.
export function migratedFunction(file,name) {
 const sql=readMigration(file),match=new RegExp(`create(?: or replace)? function (?:public|private)\\.\"?${name}\"?\\(`).exec(sql);
 assert.ok(match,`actual migrated function ${name}`);return sql.slice(match.index,sql.indexOf('$$;',match.index)+3);
}
export async function installBrandReviewRetentionFixture(db) {
 await installBrandSoftRemovalFixture(db);
 for(const file of ['202605240002_platform_brand_studio_review_workflow.sql','202605080006_immutable_admin_audit_log_foundation.sql']){
  const sql=readMigration(file);await db.exec(sql.slice(0,sql.indexOf(';')+1));
 }
 const baseline=readMigration('202604190004_baseline_current_schema_truth.sql'),start=baseline.indexOf('create table public."platform_role_memberships"');
 await db.exec(baseline.slice(start,baseline.indexOf(';',start)+1));
 await db.exec(`alter table platform_role_memberships add column expires_at timestamptz;
 alter table auth.users add column email_confirmed_at timestamptz;
 -- Explicit fixture boundary, not a replacement for native Wave1 authority tests.
 create function public.wave1_session_authority_readback() returns jsonb language sql as $$
 select jsonb_build_object('authoritative',true,'state','ACTIVE','restoreOnly',false,'userId',auth.uid()::text,'sessionGeneration',auth.jwt()->>'session_id')$$;
 -- Scoped permission grants intentionally denied; this fixture tests operator
 -- membership authority, not content_moderation/reports_review grants.
 create function public.has_platform_permission(text) returns boolean language sql as $$select false$$;`);
 for(const name of ['platform_exact_current_session_authority_internal','platform_subject_has_role_internal','has_platform_role'])await db.exec(migratedFunction('202608250004_platform_role_exact_subject_closure.sql',name));
 await db.exec(migratedFunction('202605140008_platform_staff_role_management.sql','platform_staff_actor_role'));
 await db.exec(migratedFunction('202605240007_platform_brand_review_rpc_trigger_context.sql','guard_platform_brand_asset_client_update'));
 await db.exec(migratedFunction('20260603033000_platform_brand_owner_publish_review_repair.sql','review_platform_brand_asset'));
 await db.exec(migratedFunction('20261015073423_platform_studio_publication_and_audience_authority.sql','platform_brand_publication_asset_safe_internal'));
 // These tables were introduced after the reusable fixture applies retention.
 // Install the identical migration's generic guard, with no disabled triggers.
 for(const table of ['platform_brand_asset_review_events','platform_admin_audit_logs','platform_role_memberships']){
  await db.exec(`create trigger zzz_platform_brand_retention_reference before insert or update on public.${table} for each row execute function private.guard_platform_brand_retention_references()`);
 }
 const owner='10000000-0000-4000-8000-000000000001',reviewer='10000000-0000-4000-8000-000000000005',session='30000000-0000-4000-8000-000000000005';
 await db.query('insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())',[owner,reviewer]);
 await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day')",[session,reviewer]);
 await db.query("insert into platform_role_memberships(role,user_id,status) values('operator',$1,'active')",[reviewer]);
 const login=async()=>db.query("select set_config('test.user',$1,false),set_config('test.session',$2,false),set_config('request.jwt.claim.role','authenticated',false)",[reviewer,session]);
 const service=async()=>db.exec("select set_config('request.jwt.claim.role','service_role',false)");
 const asset=async()=>{
  await service();const id=(await db.query('select gen_random_uuid() id')).rows[0].id,key=owner+'/review/'+id+'.png';
  await db.query("insert into storage.objects(bucket_id,name,version) values('platform-brand-assets',$1,'v1')",[key]);
  await db.query("insert into platform_brand_assets(id,owner_user_id,asset_type,asset_state,storage_object_key,storage_path,mime_type) values($1,$2,'hero_image','draft',$3,$3,'image/png')",[id,owner,key]);
  // Historical review evidence predates actual scanner completion. No rescan,
  // lease reset, fake scan result or transfer to a new generation is used.
  await login();
  await db.query("select review_platform_brand_asset($1,'approve','initial review')",[id]);
  await db.query("select review_platform_brand_asset($1,'reject','hide pending review')",[id]);
  await db.query("select review_platform_brand_asset($1,'approve','review restored')",[id]);
  await service();
  const job=(await db.query('select id from media_scan_jobs where target_id=$1',[id])).rows[0].id;
  await db.query("select * from claim_media_scan_jobs(25,'review-fixture')");
  const observation=(await db.query("select begin_media_scan_byte_observation($1,'review-fixture',1) id",[job])).rows[0].id;
  const completed=(await db.query("select complete_media_scan_job($1,'clean','clamav','ClamAV fixture','daily/fixture',null,null,1) r",[job])).rows[0].r;
  assert.equal(completed.targetPropagationComplete,true);
  const receipt=(await db.query("select record_media_scan_byte_receipt($1,$2,'review-fixture',$3,23) id",[observation,job,'a'.repeat(64)])).rows[0].id;
  const binding=(await db.query('select read_platform_brand_retention_binding($1) b',[id])).rows[0].b;
  await db.query('select record_platform_brand_retention_proof($1,$2,$3)',[id,binding,{originSha256:'a'.repeat(64),originSizeBytes:23,scanReceiptId:receipt}]);
  await db.query("update platform_brand_assets set asset_state='published' where id=$1",[id]);
  await login();await db.query("select review_platform_brand_asset($1,'approve','safe fixture')",[id]);
  return {id,key,job};
 };
 return {owner,reviewer,session,asset,login,service};
}
