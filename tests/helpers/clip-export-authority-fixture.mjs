import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
// Extracted from the real Clip SQL test. Only owned disposable databases;
// synthetic provider receipts do not claim physical scanner/provider proof.
export async function seedPreparedClipExport(db){
 const owner=randomUUID(),session=randomUUID(),video=randomUUID();
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const service=()=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
 await service();
 await db.query("insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,$2,now(),false,false)",[owner,`${owner}@clip-fixture.invalid`]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,owner]);
 await db.query("insert into platform_role_memberships(role,user_id,email,status,notes,granted_by) values('owner',$1,$2,'active','Synthetic fixture','fixture')",[owner,`${owner}@clip-fixture.invalid`]);
 await db.query("insert into wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source) select $1::uuid,wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation' from wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account'",[owner,session]);
 await db.query("insert into videos(id,owner_id,title,visibility,moderation_status,scan_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes) values($1,$2,'Synthetic clip','draft','clean','clean','cloudflare_r2','chillywood-media-origin',$3,$3,'video/mp4',123)",[video,owner,`${owner}/${video}/source.mp4`]);
 await db.query("update videos set scan_status='clean',scan_provider='synthetic-fixture',scan_result='clean',scanned_at=now() where id=$1",[video]);
 await db.query("insert into creator_clip_edits(video_id,owner_user_id,clip_format,fit_mode) values($1,$2,'square_1_1','fill')",[video,owner]);
 const edit={clip_format:'square_1_1',fit_mode:'fill',trim_start_ms:null,trim_end_ms:null,brand_mark_enabled:false,brand_asset_id:null};
 await db.exec("update private.creator_clip_export_worker set enabled=true,last_heartbeat_at=clock_timestamp()");
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:owner,session_id:session})]);
 await db.exec('set role authenticated');
 const requested=await scalar('select request_creator_clip_export($1,$2,$3)',[video,randomUUID(),JSON.stringify(edit)]);
 await db.exec('reset role');await service();
 const job=await scalar('select claim_creator_clip_export()');assert.equal(job.id,requested.id);
 const prefix=`${owner}/${job.output_video_id}/${job.lease}/`,key=`${prefix}export.mp4`;
 const producer=await scalar("select begin_secondary_media_producer('creator_video',$1,$2,$3,'cloudflare_r2','chillywood-media-origin',$4)",[video,job.lease,JSON.stringify(job.source_snapshot.sourceBinding),prefix]);
 const digest='a'.repeat(64),inventory={inventorySha256:'b'.repeat(64),objectCount:1,objects:[{objectKey:key,kind:'render',sizeBytes:100,sha256:digest,dependencies:[]}]};
 await db.query('select reserve_secondary_media_objects($1,$2,$3)',[job.lease,producer.claimToken,JSON.stringify(inventory)]);
 const identity=await scalar('select begin_secondary_media_object_write($1,$2,$3)',[job.lease,producer.claimToken,key]);
 const receipt={protocol:'secondary-media-create-only-v1',provider:'cloudflare_r2',bucket:'chillywood-media-origin',objectKey:key,sha256:digest,sizeBytes:100,etag:'"synthetic-generation"',versionId:null,createOnly:true,fullReadback:true,writeCompleted:true};
 await db.query('select record_secondary_media_object_receipt($1,$2,$3,$4,$5)',[job.lease,producer.claimToken,key,identity.writeToken,JSON.stringify(receipt)]);
 await db.query('select seal_secondary_media_producer($1,$2)',[job.lease,producer.claimToken]);
 const result={sha256:digest,sizeBytes:100,width:180,height:180,durationMs:1000,workerVersion:'clip-render-v1',mimeType:'video/mp4'};
 return {owner,session,video,job,key,result,identity};
}
