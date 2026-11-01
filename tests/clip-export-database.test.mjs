import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './helpers/database-runtime-authority-fixture.mjs';

test('clip export queue uses full migration chain, exact owner/session, fenced worker and private drafts', {timeout:240000}, async()=>{
 const {db}=await createDatabase({includeHeldStudio:true});
 const owner=randomUUID(),session=randomUUID(),other=randomUUID(),video=randomUUID();
 const q=async(sql,args=[])=> (await db.query(sql,args)).rows[0];
 const service=()=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
 const call=async(sql,args=[])=>{
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:owner,session_id:session})]);
  await db.exec('set role authenticated');
  try{return await q(sql,args);}finally{await db.exec('reset role');await service();}
 };
 try {
  await service();
  await db.query("insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,'clip-fixture@example.invalid',now(),false,false)",[owner]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,owner]);
  await db.query("insert into platform_role_memberships(role,user_id,email,status,notes,granted_by) values('owner',$1,'clip-fixture@example.invalid','active','Synthetic fixture','fixture')",[owner]);
  await db.query("insert into wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source) select $1::uuid,wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation' from wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account'",[owner,session]);
  await db.query("insert into videos(id,owner_id,title,visibility,moderation_status,scan_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes) values($1,$2,'Synthetic clip','draft','clean','clean','cloudflare_r2','chillywood-media-origin',$3,$3,'video/mp4',123)",[video,owner,`${owner}/${video}/source.mp4`]);
  // SQL authorization fixture only, not a claim of provider byte/scanner proof.
  await db.query("update videos set scan_status='clean',scan_provider='synthetic-fixture',scan_result='clean',scanned_at=now() where id=$1",[video]);
  await db.query("insert into creator_clip_edits(video_id,owner_user_id,clip_format,fit_mode) values($1,$2,'square_1_1','fill')",[video,owner]);
  const edit={clip_format:'square_1_1',fit_mode:'fill',trim_start_ms:null,trim_end_ms:null,brand_mark_enabled:false,brand_asset_id:null};
  const request=randomUUID();
  await assert.rejects(call('select request_creator_clip_export($1,$2,$3) r',[video,request,edit]),/worker_unavailable/);
  await db.exec("update private.creator_clip_export_worker set enabled=true,last_heartbeat_at=clock_timestamp()");
  for (const role of ['anon','authenticated','service_role']) {
    assert.equal((await q("select has_table_privilege($1,'private.creator_clip_export_jobs','INSERT') ok",[role])).ok,false);
  }
  const first=(await call('select request_creator_clip_export($1,$2,$3) r',[video,request,edit])).r;
  assert.equal(first.status,'queued');assert.equal(first.outputVideoId,null);
  assert.deepEqual((await call('select request_creator_clip_export($1,$2,$3) r',[video,request,edit])).r,first);
  await assert.rejects(call('select request_creator_clip_export($1,$2,$3) r',[video,request,{...edit,fit_mode:'fit'}]),/request_mismatch/);
  assert.equal((await call('select read_creator_clip_export($1) r',[other])).r,null);
  await assert.rejects(call('select claim_creator_clip_export()'),/permission denied/);
  const claimed=(await q('select claim_creator_clip_export() r')).r;
  assert.equal(claimed.id,first.id);assert.equal(claimed.attempts,1);assert.ok(claimed.lease);
  assert.equal((await q('select heartbeat_creator_clip_export($1,$2) ok',[claimed.id,randomUUID()])).ok,false);
  assert.equal((await q('select heartbeat_creator_clip_export($1,$2) ok',[claimed.id,claimed.lease])).ok,true);
  await assert.rejects(q("select finish_creator_clip_export($1,$2,'bad', '{}'::jsonb)",[claimed.id,claimed.lease]),/output_not_verified/);
  assert.equal((await call('select cancel_creator_clip_export($1) r',[claimed.id])).r.status,'canceled');
  assert.equal((await q('select heartbeat_creator_clip_export($1,$2) ok',[claimed.id,claimed.lease])).ok,false);
  await assert.rejects(q("select finish_creator_clip_export($1,$2,'bad', '{}'::jsonb)",[claimed.id,claimed.lease]),/stale_lease/);
  assert.equal((await q('select count(*)::int n from videos where owner_id::text=$1',[owner])).n,1,'failed and canceled exports never create output');
  const second=(await call('select request_creator_clip_export($1,$2,$3) r',[video,randomUUID(),edit])).r;
  const next=(await q('select claim_creator_clip_export() r')).r;
  assert.equal(next.id,second.id);
  const prefix=`${owner}/${next.output_video_id}/${next.lease}/`,key=`${prefix}export.mp4`;
  const producer=(await q("select begin_secondary_media_producer('creator_video',$1,$2,$3,'cloudflare_r2','chillywood-media-origin',$4) r",[video,next.lease,next.source_snapshot.sourceBinding,prefix])).r;
  const digest='a'.repeat(64),inventory={inventorySha256:'b'.repeat(64),objectCount:1,objects:[{objectKey:key,kind:'render',sizeBytes:100,sha256:digest,dependencies:[]}]};
  await q('select reserve_secondary_media_objects($1,$2,$3)',[next.lease,producer.claimToken,inventory]);
  const identity=(await q('select begin_secondary_media_object_write($1,$2,$3) r',[next.lease,producer.claimToken,key])).r;
  // Explicit synthetic provider receipt for SQL state-machine tests; transport
  // tests independently exercise actual streamed bytes and response binding.
  const receipt={protocol:'secondary-media-create-only-v1',provider:'cloudflare_r2',bucket:'chillywood-media-origin',objectKey:key,
    sha256:digest,sizeBytes:100,etag:'"synthetic-generation"',versionId:null,createOnly:true,fullReadback:true,writeCompleted:true};
  await q('select record_secondary_media_object_receipt($1,$2,$3,$4,$5)',[next.lease,producer.claimToken,key,identity.writeToken,receipt]);
  await q('select seal_secondary_media_producer($1,$2)',[next.lease,producer.claimToken]);
  const result={sha256:digest,sizeBytes:100,width:180,height:180,durationMs:1000,workerVersion:'clip-render-v1',mimeType:'video/mp4'};
  const done=(await q('select finish_creator_clip_export($1,$2,$3,$4) r',[next.id,next.lease,key,result])).r;
  assert.equal(done.status,'ready');assert.equal(done.outputVideoId,next.output_video_id);
  assert.deepEqual((await q('select finish_creator_clip_export($1,$2,$3,$4) r',[next.id,next.lease,key,result])).r,done,'completion retry returns same draft');
  const output=await q('select visibility,scan_status,storage_object_key from videos where id=$1',[done.outputVideoId]);
  assert.equal(output.visibility,'draft');assert.equal(output.scan_status,'pending_scan');assert.equal(output.storage_object_key,key);
  assert.equal((await q('select count(*)::int n from private.secondary_media_bindings where object_id=$1',[identity.objectId])).n,2,'original and exported draft both protect output');
  assert.equal((await q('select fail_creator_clip_export($1,$2,$3) r',[next.id,next.lease,'worker_failed'])).r,false,'lost completion response cannot mark committed output failed');
  await db.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[session]);
  await assert.rejects(call('select request_creator_clip_export($1,$2,$3)',[video,randomUUID(),edit]),/current_session_required/);
  assert.equal((await q('select count(*)::int n from videos where owner_id::text=$1',[owner])).n,2);
 } finally {await db.close();}
});
