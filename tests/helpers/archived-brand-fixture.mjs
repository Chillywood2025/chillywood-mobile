import {randomUUID} from 'node:crypto';
import {createDatabase} from './database-runtime-authority-fixture.mjs';

export const archivedMigration='20261025111122_platform_brand_archived_byte_verification.sql';
export const archivedTables=['platform_brand_archived_requests','platform_brand_archived_attempts',
 'platform_brand_archived_results','platform_brand_archived_receipts'];
export const archivedPublicFunctions=[
 'public.request_platform_brand_archived_verification(uuid,jsonb)',
 'public.claim_platform_brand_archived_verification(uuid[],text)',
 'public.read_platform_brand_archived_verification_attempt(uuid,uuid,text)',
 'public.record_platform_brand_archived_verification_result(uuid,uuid,text,jsonb)',
 'public.seal_platform_brand_archived_verification(uuid,uuid,text,uuid)',
];
export const cleanResult=()=>({status:'clean',sha256:'a'.repeat(64),sizeBytes:23,scannerProvider:'clamav',
 scannerVersion:'ClamAV synthetic SQL fixture',signatureVersion:'synthetic-signatures/1',exitCode:0,durationMs:1,
 findingName:null,errorCode:null,fullReadback:true});

// Local PGlite composition only. Scanner results here are explicit SQL fixtures,
// not actual malware execution or production evidence. The real runner/engine
// and native PostgreSQL concurrency are separately mandatory validation paths.
export async function archivedDatabase(options={}) {
 const {db,replayReport}=await createDatabase({includeHeldStudio:true,...options});
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
 const rpc=async(name,args=[],casts=[])=> (await q(`select public.${name}(${args.map((_,i)=>'$'+(i+1)+(casts[i]?'::'+casts[i]:'')).join(',')}) r`,args)).r;
 const fixture=async({normalJob=false,archived=true,legacy=false,sourceSize=23,storageSize=23}={})=>{
  const id=randomUUID(),objectId=randomUUID(),key=`platform_rachi_official/archived/${id}.png`;
  // Historical no-job fixture: disable ONLY the two enqueue triggers while
  // seeding a disposable asset. All identity/retention/reference guards remain
  // active, and both enqueue triggers are restored before any protocol test.
  if(!normalJob)await db.exec('alter table platform_brand_assets disable trigger queue_platform_brand_asset_scan_before; alter table platform_brand_assets disable trigger enqueue_platform_brand_asset_scan_after');
  try {
   await db.query("insert into storage.objects(id,bucket_id,name,version,metadata) values($1,'platform-brand-assets',$2,'fixture-v1',$3)",[objectId,key,{size:storageSize}]);
   await db.query("insert into platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes,scan_status) values($1,'platform_rachi_official','logo',$2,$2,'image/png',$3,'manual_review')",[id,key,sourceSize]);
  } finally {if(!normalJob)await db.exec('alter table platform_brand_assets enable trigger queue_platform_brand_asset_scan_before; alter table platform_brand_assets enable trigger enqueue_platform_brand_asset_scan_after');}
  if(archived)await db.query("update platform_brand_assets set deleted_at=clock_timestamp(),asset_state='archived' where id=$1",[id]);
  if(legacy){
   await db.exec('alter table private.platform_brand_object_incarnations disable trigger brand_retention_immutable');
   try {await db.query("update private.platform_brand_object_incarnations set removed_at=removed_at+interval '1 day',retain_until=retain_until+interval '1 day',removal_clock='legacy_unknown_conservative_observation' where asset_id=$1",[id]);}
   finally {await db.exec('alter table private.platform_brand_object_incarnations enable trigger brand_retention_immutable');}
  }
  const binding=await rpc('read_platform_brand_retention_binding',[id]);
  return {id,objectId,key,binding};
 };
 const enable=()=>db.exec('update private.platform_brand_retention_settings set archived_verification_enabled=true');
 const request=f=>rpc('request_platform_brand_archived_verification',[f.id,f.binding]);
 const claim=(ids,worker='archived-sql-fixture')=>rpc('claim_platform_brand_archived_verification',[ids,worker],['uuid[]']);
 const read=a=>rpc('read_platform_brand_archived_verification_attempt',[a.attemptId,a.claimToken,a.workerId]);
 const record=(a,result=cleanResult())=>rpc('record_platform_brand_archived_verification_result',[a.attemptId,a.claimToken,a.workerId,result]);
 const seal=(a,resultId)=>rpc('seal_platform_brand_archived_verification',[a.attemptId,a.claimToken,a.workerId,resultId]);
 const snapshot=f=>q(`select (select to_jsonb(a) from platform_brand_assets a where id=$1) asset,
  (select to_jsonb(i) from private.platform_brand_object_incarnations i where asset_id=$1) incarnation,
  (select coalesce(jsonb_agg(j),'[]') from media_scan_jobs j where target_table='platform_brand_assets' and target_id=$1::text) jobs,
  (select count(*)::int from private.platform_brand_expiry_claims where asset_id=$1) expiry_claims`,[f.id]);
 return {db,q,rpc,fixture,enable,request,claim,read,record,seal,snapshot,replayReport};
}
