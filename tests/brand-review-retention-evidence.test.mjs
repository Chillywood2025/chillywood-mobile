import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {installBrandReviewRetentionFixture} from './helpers/brand-review-retention-fixture.mjs';

test('actual reviewer archive commits audit evidence without creating a delivery-reference exemption',async()=>{
 const db=new PGlite();const q=async(sql,args=[]) =>(await db.query(sql,args)).rows[0];
 try {
  const f=await installBrandReviewRetentionFixture(db),a=await f.asset();
  assert.equal((await q("select has_platform_role(array['operator']) yes")).yes,true);
  await db.query('insert into platform_brand_profiles(owner_user_id,hero_image_asset_id) values($1,$2)',[f.owner,a.id]);
  await db.query('insert into platform_brand_publications(owner_user_id,hero_image_asset_id,published_at) values($1,$2,now())',[f.owner,a.id]);
  assert.equal((await q('select platform_brand_publication_asset_safe_internal($1,$2) safe',[a.id,f.owner])).safe,true);
  await db.query("select review_platform_brand_asset($1,'archive','safety reason')",[a.id]);
  const source=await q('select to_jsonb(a) row from platform_brand_assets a where id=$1',[a.id]);
  assert.ok(source.row.deleted_at);assert.equal(source.row.asset_state,'archived');assert.equal(source.row.moderated_by,f.reviewer);
  assert.equal((await q('select platform_brand_publication_asset_safe_internal($1,$2) safe',[a.id,f.owner])).safe,false);
  assert.equal((await q('select count(*)::int n from storage.objects where name=$1',[a.key])).n,1);
  const review=(await q("select to_jsonb(e) row from platform_brand_asset_review_events e where asset_id=$1 and action='archive'",[a.id])).row;
  const audit=(await q("select to_jsonb(e) row from platform_admin_audit_logs e where target_id=$1 and action='platform_brand_asset_archive'",[a.id])).row;
  assert.ok(review);assert.ok(audit);assert.equal(audit.metadata.review_event_id,review.id);
  const matches=async(table,row,id=a.id)=>(await q('select private.platform_brand_review_evidence_matches($1::regclass::oid,$2,$3) yes',[table,row,id])).yes;
  assert.equal(await matches('platform_brand_asset_review_events',review),true);
  assert.equal(await matches('platform_admin_audit_logs',audit),true);
  const history=(await db.query('select to_jsonb(e) row from platform_brand_asset_review_events e where asset_id=$1',[a.id])).rows;
  for(const row of history)assert.equal(await matches('platform_brand_asset_review_events',row.row),true,'exact historical approval/archive is evidence only');
  assert.equal((await q('select private.platform_brand_retention_references_clear($1) yes',[a.id])).yes,false,'live design references still block');
  await db.query('update platform_brand_profiles set hero_image_asset_id=null where owner_user_id=$1',[f.owner]);
  await db.query('update platform_brand_publications set hero_image_asset_id=null where owner_user_id=$1',[f.owner]);
  assert.equal((await q('select private.platform_brand_retention_references_clear($1) yes',[a.id])).yes,true,'exact historical evidence and actual qualified scan do not independently block accounting');
  for(const [label,table,row] of [
   ['unknown snapshot key','platform_brand_asset_review_events',{...review,after_state:{...review.after_state,unknown_key:a.key}}],
   ['missing base snapshot key','platform_brand_asset_review_events',{...review,after_state:Object.fromEntries(Object.entries(review.after_state).filter(([k])=>k!=='mime_type'))}],
   ['changed recorded reason','platform_brand_asset_review_events',{...review,reason:'different reason'}],
   ['changed source generation','platform_brand_asset_review_events',{...review,after_state:{...review.after_state,created_at:'2000-01-01T00:00:00Z'}}],
   ['different object','platform_brand_asset_review_events',{...review,after_state:{...review.after_state,storage_object_key:'other/object'}}],
   ['different source','platform_brand_asset_review_events',{...review,asset_id:'20000000-0000-4000-8000-000000000099'}],
   ['different owner','platform_brand_asset_review_events',{...review,owner_user_id:'different-owner'}],
   ['unknown row key','platform_brand_asset_review_events',{...review,unexpected:a.key}],
   ['altered action','platform_brand_asset_review_events',{...review,action:'approve'}],
   ['null action category','platform_admin_audit_logs',{...audit,action_category:null}],
   ['missing action category','platform_admin_audit_logs',Object.fromEntries(Object.entries(audit).filter(([k])=>k!=='action_category'))],
   ['null target type','platform_admin_audit_logs',{...audit,target_type:null}],
   ['missing target type','platform_admin_audit_logs',Object.fromEntries(Object.entries(audit).filter(([k])=>k!=='target_type'))],
   ['unknown metadata','platform_admin_audit_logs',{...audit,metadata:{...audit.metadata,delivery_url:a.key}}],
   ['wrong linked review','platform_admin_audit_logs',{...audit,metadata:{...audit.metadata,review_event_id:'20000000-0000-4000-8000-000000000099'}}],
   ['cross-source snapshot','platform_admin_audit_logs',{...audit,before_state:{...audit.before_state,id:'20000000-0000-4000-8000-000000000099'}}],
  ]){
   assert.equal(await matches(table,row),false,label);
   if(label!=='unknown row key'){
    const id=(await q('select gen_random_uuid() id')).id;
    await assert.rejects(db.query(`insert into ${table} select (jsonb_populate_record(null::${table},$1)).*`,[{...row,id}]),/brand_retained_reference_forbidden/,`${label} cannot be inserted as review evidence`);
   }
  }
  const definition=(await q("select pg_get_functiondef('private.platform_brand_review_evidence_matches(oid,jsonb,uuid)'::regprocedure) body")).body;
  for(const [field,value] of [['action_category','moderation'],['target_type','platform_brand_asset']]){
   const malformed={...audit,[field]:null};
   assert.equal(await matches('platform_admin_audit_logs',malformed),false,`${field} NULL denied by actual function`);
   const predicate=`p_row->>'${field}' is distinct from '${value}'`;
   assert.ok(definition.includes(predicate));
   for(const replacement of [`p_row->>'${field}'<>'${value}'`,'false']){
    await db.exec('begin');
    await db.exec(definition.replace(predicate,replacement));
    assert.equal(await matches('platform_admin_audit_logs',malformed),true,`${field} removed/null-unsafe guard mutant admits exact negative control`);
    await db.exec('rollback');
    assert.equal(await matches('platform_admin_audit_logs',malformed),false,`${field} rollback restores rejection`);
   }
  }
  assert.equal(await matches('platform_brand_assets',review),false,'unknown table is not review evidence');
  assert.equal((await q('select private.platform_brand_review_evidence_matches(null,$1,$2) yes',[review,a.id])).yes,false);
  assert.equal(await matches('platform_brand_asset_review_events',[]),false,'nonobject row denied');
  await assert.rejects(db.query(`insert into platform_admin_audit_logs(actor_user_id,action,action_category,target_id,before_state,after_state,metadata)
    values($1,'platform_brand_asset_archive','moderation',$2,$3,$4,$5)`,[f.reviewer,a.id,audit.before_state,audit.after_state,{...audit.metadata,delivery_url:a.key}]),/brand_retained_reference_forbidden/);
  const copiedInsert=async(after=review.after_state)=>{
   const id=(await q('select gen_random_uuid() id')).id;
   return db.query('insert into platform_brand_asset_review_events select (jsonb_populate_record(null::platform_brand_asset_review_events,$1)).*',[{...review,id,after_state:after}]);
  };
  for(const boundary of ['missing-reviewer','expired-reviewer','actorless-service','mismatched-current-after']){
   await db.exec('begin');
   await db.exec("select set_config('app.platform_brand_review_context','review_platform_brand_asset',false)");
   if(boundary==='missing-reviewer')await db.query("update platform_role_memberships set status='revoked' where user_id=$1",[f.reviewer]);
   if(boundary==='expired-reviewer')await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[f.session]);
   if(boundary==='actorless-service')await db.exec("select set_config('test.user','',false),set_config('request.jwt.claim.role','service_role',false)");
   const after=boundary==='mismatched-current-after'?{...review.after_state,updated_at:'2000-01-01T00:00:00Z'}:review.after_state;
   await assert.rejects(copiedInsert(after),/brand_retained_reference_forbidden/,boundary);
   await db.exec('rollback');
  }
  await db.exec("select set_config('app.platform_brand_review_context','',false)");
  await assert.rejects(db.query(`insert into platform_brand_asset_review_events(asset_id,owner_user_id,actor_user_id,actor_role,action,reason,before_state,after_state)
   values($1,$2,$3,'operator','archive','safety reason',$4,$5)`,[a.id,f.owner,f.reviewer,review.before_state,review.after_state]),/brand_retained_reference_forbidden/,'matching copied snapshot is not fresh writer authority');
 } finally {await db.close();}
});

test('preexisting noncanonical review evidence remains a real reference-accounting blocker',async()=>{
 const db=new PGlite();const q=async(sql,args=[]) =>(await db.query(sql,args)).rows[0];
 try {
  const f=await installBrandReviewRetentionFixture(db),a=await f.asset();
  const review=(await q("select to_jsonb(e) row from platform_brand_asset_review_events e where asset_id=$1 and action='approve' and reason='safe fixture'",[a.id])).row;
  const audit=(await q("select to_jsonb(e) row from platform_admin_audit_logs e where target_id=$1 and action='platform_brand_asset_approve' and reason='safe fixture'",[a.id])).row;
  for(const [label,table,row] of [
   ['unrecognized snapshot key','platform_brand_asset_review_events',{...review,after_state:{...review.after_state,delivery_locator:a.key}}],
   ['altered source identity','platform_brand_asset_review_events',{...review,before_state:{...review.before_state,created_at:'2000-01-01T00:00:00Z'}}],
   // target_type is nullable in the real table; these preexisting rows must
   // remain expiry blockers. action_category is NOT NULL, tested above as JSON.
   ['null persisted target type','platform_admin_audit_logs',{...audit,target_type:null}],
   ['missing persisted target type','platform_admin_audit_logs',Object.fromEntries(Object.entries(audit).filter(([k])=>k!=='target_type'))],
   ['unrecognized audit metadata','platform_admin_audit_logs',{...audit,metadata:{...audit.metadata,delivery_locator:a.key}}],
   ['unlinked audit evidence','platform_admin_audit_logs',{...audit,metadata:{...audit.metadata,review_event_id:'20000000-0000-4000-8000-000000000099'}}],
  ]){
   await db.exec('begin');
   const id=(await q('select gen_random_uuid() id')).id;
   await db.query(`insert into ${table} select (jsonb_populate_record(null::${table},$1)).*`,[{...row,id}]);
   await db.query("select review_platform_brand_asset($1,'archive','safety reason')",[a.id]);
   assert.equal((await q('select private.platform_brand_retention_references_clear($1) yes',[a.id])).yes,false,label);
   await db.exec('rollback');
  }
  await db.exec('begin');
  const linkedId=(await q('select gen_random_uuid() id')).id;
  const invalidLinked={...review,id:linkedId,after_state:{...review.after_state,unknown_locator:a.key}};
  await db.query('insert into platform_brand_asset_review_events select (jsonb_populate_record(null::platform_brand_asset_review_events,$1)).*',[invalidLinked]);
  const auditId=(await q('select gen_random_uuid() id')).id;
  const linkedAudit={...audit,id:auditId,after_state:invalidLinked.after_state,metadata:{...audit.metadata,review_event_id:linkedId}};
  await db.query('insert into platform_admin_audit_logs select (jsonb_populate_record(null::platform_admin_audit_logs,$1)).*',[linkedAudit]);
  await db.query("select review_platform_brand_asset($1,'archive','safety reason')",[a.id]);
  assert.equal((await q("select private.platform_brand_review_evidence_matches('platform_admin_audit_logs'::regclass,$1,$2) yes",[linkedAudit,a.id])).yes,false,'linked row with unknown snapshot data invalidates otherwise matching audit');
  assert.equal((await q('select private.platform_brand_retention_references_clear($1) yes',[a.id])).yes,false,'existing unknown linked review remains blocking');
  await db.exec('rollback');
  await db.query("select review_platform_brand_asset($1,'archive','safety reason')",[a.id]);
  assert.equal((await q('select private.platform_brand_retention_references_clear($1) yes',[a.id])).yes,true,'without unknown evidence canonical audit does not block');
 }finally{await db.close();}
});

test('canonical review history supports exact due claim and metadata-crash recovery without physical-absence proof',async()=>{
 const db=new PGlite();const q=async(sql,args=[]) =>(await db.query(sql,args)).rows[0];
 try {
  const f=await installBrandReviewRetentionFixture(db);
  const {applyBrandMigrationStatements}=await import('./helpers/apply-brand-migration-statements.mjs');
  const {readMigration}=await import('./helpers/brand-soft-removal-fixture.mjs');
  await applyBrandMigrationStatements(db,readMigration('20261021134104_platform_brand_exact_expiry_transport.sql'));
  const a=await f.asset();await db.query("select review_platform_brand_asset($1,'archive','safety reason')",[a.id]);
  await f.service();
  await db.exec("update private.platform_brand_retention_settings set expiry_enabled=true,writer_drain_evidence_sha256=repeat('e',64),reference_review_evidence_sha256=repeat('f',64),provider_origin='https://fixture.supabase.co',provider_contract_sha256=repeat('c',64),version_delete_verified=true");
  const begin=async()=>(await q('select begin_platform_brand_retention_transport($1) r',[a.id])).r;
  assert.equal((await begin()).status,'not_due','real fixed 720-hour gate blocks ordinary fresh tombstone');
  // DISPOSABLE CLOCK ADVANCEMENT ONLY. Unlike physical qualification, no time
  // passes here. Coherently move the removal timestamps in this synthetic DB;
  // never alter source incarnation, scan receipt/proof, functions or claim code.
  // Restore every affected guard before invoking any actual transport RPC.
  const guards=[['private.platform_brand_object_incarnations','brand_retention_immutable'],['public.platform_brand_assets','aaa_platform_brand_retention'],['public.platform_brand_asset_review_events','zzz_platform_brand_retention_reference'],['public.platform_admin_audit_logs','zzz_platform_brand_retention_reference']];
  await db.exec('begin');
  for(const [table,guard] of guards)await db.exec(`alter table ${table} disable trigger ${guard}`);
  const age=(await q("select clock_timestamp()-interval '721 hours' t")).t;
  await db.query("update private.platform_brand_object_incarnations set removed_at=$2,retain_until=$2::timestamptz+interval '720 hours' where asset_id=$1",[a.id,age]);
  await db.query('update platform_brand_assets set deleted_at=$2 where id=$1',[a.id,age]);
  await db.query("update platform_brand_asset_review_events set after_state=jsonb_set(after_state,'{deleted_at}',to_jsonb($2::timestamptz)) where asset_id=$1 and action='archive'",[a.id,age]);
  await db.query("update platform_admin_audit_logs set after_state=jsonb_set(after_state,'{deleted_at}',to_jsonb($2::timestamptz)) where target_id=$1 and action='platform_brand_asset_archive'",[a.id,age]);
  for(const [table,guard] of guards)await db.exec(`alter table ${table} enable trigger ${guard}`);
  await db.exec('commit');
  for(const [table,guard] of guards)assert.equal((await q('select tgenabled from pg_trigger where tgrelid=$1::regclass and tgname=$2',[table,guard])).tgenabled,'O');
  assert.equal((await q('select private.platform_brand_retention_references_clear($1) yes',[a.id])).yes,true,'coherent exact audit history remains evidence-only');
  const claimed=await begin();assert.equal(claimed.status,'claimed');assert.ok(claimed.claimToken);
  const read=async token=>(await q('select read_platform_brand_retention_expiry_claim($1,$2) r',[a.id,token])).r;
  assert.equal((await read('20000000-0000-4000-8000-000000000099')).status,'claim_unavailable');
  const initial=await read(claimed.claimToken);assert.equal(initial.status,'authorized');assert.equal(initial.metadataPresent,true);assert.equal(initial.permanentlyAbsent,false);
  await assert.rejects(db.query("update storage.objects set version='replaced' where name=$1",[a.key]),/brand_storage_attached_incarnation_fenced/);
  // Actual guarded metadata deletion models a transport crash boundary only.
  // No provider bytes are read/deleted and metadata absence is not physical proof.
  await db.query('delete from storage.objects where name=$1',[a.key]);
  const recovered=await begin();assert.ok(['claimed','authorized'].includes(recovered.status));assert.equal(recovered.claimToken,claimed.claimToken);
  const after=await read(claimed.claimToken);assert.equal(after.status,'authorized');assert.equal(after.metadataPresent,false);assert.equal(after.permanentlyAbsent,false);
  assert.equal((await q('select private.platform_brand_retention_references_clear($1) yes',[a.id])).yes,true,'exact history survives metadata crash only with durable claim');
  await db.exec('update private.platform_brand_retention_settings set expiry_enabled=false');
  assert.equal((await read(claimed.claimToken)).status,'disabled');
 }finally{await db.close();}
});
