import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedPreparedClipExport} from './helpers/clip-export-authority-fixture.mjs';
test('native Clip fixture uses real queue/producer/seal and atomic draft completion',{timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true});
 try{
  const f=await seedPreparedClipExport(db);
  const done=(await db.query('select finish_creator_clip_export($1,$2,$3,$4) r',[f.job.id,f.job.lease,f.key,JSON.stringify(f.result)])).rows[0].r;
  assert.equal(done.status,'ready');assert.equal(done.outputVideoId,f.job.output_video_id);
  const output=(await db.query('select visibility,scan_status,owner_id::text from videos where id=$1',[done.outputVideoId])).rows[0];
  assert.deepEqual(output,{visibility:'draft',scan_status:'pending_scan',owner_id:f.owner});
  assert.equal((await db.query('select count(*)::int n from private.secondary_media_bindings where object_id=$1',[f.identity.objectId])).rows[0].n,2);
  const changed=await seedPreparedClipExport(db);
  await db.exec('set role service_role');
  await db.query('update videos set storage_object_key=$2,storage_path=$2 where id=$1',[changed.video,`${changed.owner}/${changed.video}/replacement.mp4`]);
  await assert.rejects(db.query('select finish_creator_clip_export($1,$2,$3,$4)',[changed.job.id,changed.job.lease,changed.key,JSON.stringify(changed.result)]),/clip_export_source_changed/);
  await db.query("select fail_creator_clip_export($1,$2,'source_changed')",[changed.job.id,changed.job.lease]);await db.exec('reset role');
  const canceled=await seedPreparedClipExport(db);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:canceled.owner,session_id:canceled.session})]);await db.exec('set role authenticated');
  assert.equal((await db.query('select cancel_creator_clip_export($1) r',[canceled.job.id])).rows[0].r.status,'canceled');await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");await db.exec('set role service_role');
  await assert.rejects(db.query('select finish_creator_clip_export($1,$2,$3,$4)',[canceled.job.id,canceled.job.lease,canceled.key,JSON.stringify(canceled.result)]),/clip_export_stale_lease/);await db.exec('reset role');
 }finally{await db.close();}
});
