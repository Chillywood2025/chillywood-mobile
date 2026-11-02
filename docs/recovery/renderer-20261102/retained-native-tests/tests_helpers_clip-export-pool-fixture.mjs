import {randomUUID} from 'node:crypto';

// Only synthetic identities in an owned test database. This prepares a real
// clean source/edit; admission and claims still go through the production RPCs.
export async function seedClipPoolSource(db, existingActor = null) {
 const owner=existingActor?.owner??randomUUID(),session=existingActor?.session??randomUUID(),video=randomUUID(),request=randomUUID();
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
 if(!existingActor){
  await db.query("insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,$2,now(),false,false)",[owner,`${owner}@clip-pool-fixture.invalid`]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,owner]);
  await db.query("insert into platform_role_memberships(role,user_id,email,status,notes,granted_by) values('owner',$1,$2,'active','Synthetic pool fixture','fixture')",[owner,`${owner}@clip-pool-fixture.invalid`]);
  await db.query("insert into wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source) select $1::uuid,wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation' from wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account'",[owner,session]);
 }
 await db.query("insert into videos(id,owner_id,title,visibility,moderation_status,scan_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes) values($1,$2,'Synthetic pool clip','draft','clean','clean','cloudflare_r2','chillywood-media-origin',$3,$3,'video/mp4',123)",[video,owner,`${owner}/${video}/source.mp4`]);
 await db.query("update videos set scan_status='clean',scan_provider='synthetic-fixture',scan_result='clean',scanned_at=now() where id=$1",[video]);
 await db.query("insert into creator_clip_edits(video_id,owner_user_id,clip_format,fit_mode) values($1,$2,'square_1_1','fill')",[video,owner]);
 return {owner,session,video,request,edit:{clip_format:'square_1_1',fit_mode:'fill',trim_start_ms:null,trim_end_ms:null,brand_mark_enabled:false,brand_asset_id:null}};
}
