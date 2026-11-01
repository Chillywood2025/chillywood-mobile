import { Buffer } from 'node:buffer';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {externalReferenceFixture} from './helpers/deleted-content-external-reference-fixture.mjs';
import {splitSQL,createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {writeSecondaryMediaObject,reconcileSecondaryMediaObject,persistSecondaryMediaInventory} from '../scripts/lib/secondary-media-producer.mjs';

const migration='20261101141441_secondary_media_producer_registry.sql';
const owner='10000000-0000-4000-8000-000000000001';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=Buffer.from('actual exact generated media bytes');
const inventory=(prefix)=>({inventorySha256:'a'.repeat(64),objectCount:1,objects:[{
 objectKey:prefix+'export.mp4',kind:'render',sha256:sha(bytes),sizeBytes:bytes.length,dependencies:[],
}]});
const receipt=(o,extra={})=>({protocol:'secondary-media-create-only-v1',provider:o.provider,bucket:o.bucket,
 objectKey:o.object_key,sha256:o.sha256,sizeBytes:Number(o.size_bytes),etag:'"exact-etag"',versionId:null,
 createOnly:true,fullReadback:true,writeCompleted:true,...extra});

test('durable producer intent, source incarnation, shared binding and fixed retention lifecycle', {timeout:120000},async t=>{
 const db=await externalReferenceFixture();
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
 try {
  // Exact established lock body, not a test substitute. This focused fixture
  // retains actual original-retention, reference and source guards.
  const lock=splitSQL(readFileSync('supabase/migrations/20261025033057_platform_brand_global_retention_integration.sql','utf8'))
   .find(sql=>sql.includes('create or replace function private.platform_brand_retention_lock()'));
  await db.exec(lock);await db.exec(readFileSync('supabase/migrations/'+migration,'utf8'));
  const immutable=splitSQL(readFileSync('supabase/migrations/20261021134043_platform_brand_exact_retention_lifecycle.sql','utf8'))
   .find(sql=>sql.includes('create function private.platform_brand_retention_immutable()'));
  await db.exec(immutable);
  await db.exec(readFileSync('supabase/migrations/20261101142934_secondary_media_dormant_expiry.sql','utf8'));
  await db.exec("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;set request.jwt.claim.role='service_role';");
  await db.exec(`insert into auth.users values('${owner}');`);
  const source=async(key='original.mp4')=>{
   const id=randomUUID();await q(`insert into videos(id,owner_id,created_at,storage_provider,storage_bucket,storage_object_key)
    values($1,$2,'2026-01-01','cloudflare_r2','chillywood-media-origin',$3)`,[id,owner,key]);return id;
  };
  const binding=async id=>(await q("select private.secondary_media_read_source('creator_video',$1) b",[id])).b;
  const begin=async(id,producer=randomUUID(),provider='cloudflare_r2')=>{
   const prefix=`renders/${producer}/`;
   const r=(await q("select begin_secondary_media_producer('creator_video',$1,$2,$3,$4,'chillywood-media-origin',$5) r",[id,producer,await binding(id),provider,prefix])).r;
   return {...r,prefix,sourceId:id};
  };
  const reserve=async p=>q('select reserve_secondary_media_objects($1,$2,$3) r',[p.producerId,p.claimToken,inventory(p.prefix)]);
  const dispatch=async p=>(await q('select begin_secondary_media_object_write($1,$2,$3) r',[p.producerId,p.claimToken,p.prefix+'export.mp4'])).r;
  const row=async p=>q('select * from private.secondary_media_objects where producer_id=$1',[p.producerId]);
  const record=async(p,i,patch={})=>q('select record_secondary_media_object_receipt($1,$2,$3,$4,$5) r',[p.producerId,p.claimToken,p.prefix+'export.mp4',i.writeToken,receipt(await row(p),patch)]);
  const seal=async p=>q('select seal_secondary_media_producer($1,$2) r',[p.producerId,p.claimToken]);
  await t.test('private tables/worker-only RPCs and original switches remain safe',async()=>{
   await db.exec("set request.jwt.claim.role='authenticated'");
   await assert.rejects(q('select read_secondary_media_retention_readiness()'),/service_role_required/);
   await db.exec("set request.jwt.claim.role='service_role'");
   for(const table of ['secondary_media_registry_gate','secondary_media_sources','secondary_media_producers','secondary_media_objects','secondary_media_bindings']){
    assert.deepEqual(await q('select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass',['private.'+table]),{relrowsecurity:true,relforcerowsecurity:true});
    for(const role of ['anon','authenticated','service_role'])assert.equal((await q('select has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE\') allowed',[role,'private.'+table])).allowed,false);
   }
   for(const role of ['anon','authenticated'])assert.equal((await q("select has_function_privilege($1,'public.begin_secondary_media_producer(text,uuid,uuid,jsonb,text,text,text)','EXECUTE') allowed",[role])).allowed,false);
   assert.equal((await q('select capture_enabled from private.deleted_content_retention_settings')).capture_enabled,false);
  });
  const id=await source(),p=await begin(id);
  await t.test('exact retry, source and inventory conflict rejection',async()=>{
   assert.equal((await begin(id,p.producerId)).claimToken,p.claimToken);
   await reserve(p);await reserve(p);
   const changed=inventory(p.prefix);changed.objects[0].sha256='b'.repeat(64);
   await assert.rejects(q('select reserve_secondary_media_objects($1,$2,$3)',[p.producerId,p.claimToken,changed]),/inventory_conflict/);
   const missing=inventory(p.prefix);delete missing.inventorySha256;
   await assert.rejects(q('select reserve_secondary_media_objects($1,$2,$3)',[p.producerId,p.claimToken,missing]),/inventory_invalid/);
   await assert.rejects(seal(p),/writer_not_drained/);
  });
  const i=await dispatch(p);
  await t.test('dispatch is permanent and cannot be retried or mistaken for drain',async()=>{
   await assert.rejects(dispatch(p),/already_dispatched/);
   await assert.rejects(seal(p),/writer_not_drained/);
   assert.equal((await q('select read_secondary_media_retention_readiness() r')).r.unresolvedWrites,1);
   for(const bad of [{sha256:'b'.repeat(64)},{createOnly:false},{fullReadback:false},{writeCompleted:false},{sizeBytes:null},{bucket:'other'}])await assert.rejects(record(p,i,bad),/receipt_invalid/);
   await record(p,i);await record(p,i);await seal(p);await seal(p);
   await assert.rejects(record(p,i,{etag:'other'}),/receipt_conflict/);
   await assert.rejects(dispatch(p),/producer_closed/);
  });
  const output=await source(p.prefix+'export.mp4');
  await t.test('sealed bytes bind to output source atomically and remain shared',async()=>{
   const b=await binding(output);
   await q("select private.attach_secondary_media_output($1,$2,'creator_video',$3,$4)",[p.producerId,p.prefix+'export.mp4',output,b]);
   await q("select private.attach_secondary_media_output($1,$2,'creator_video',$3,$4)",[p.producerId,p.prefix+'export.mp4',output,b]);
   assert.equal((await q('select count(*)::int n from private.secondary_media_bindings')).n,2);
   await assert.rejects(q("select private.attach_secondary_media_output($1,$2,'creator_video',$3,$4)",[p.producerId,p.prefix+'export.mp4',id,await binding(id)]),/target_mismatch/);
  });
  await t.test('real deletion terminalizes once, original expiry fixed and shared output remains live',async()=>{
   await q('delete from videos where id=$1',[id]);
   const s=await q("select *,extract(epoch from expires_at-deleted_at)::int elapsed from private.secondary_media_sources where source_id=$1",[id]);
   assert.equal(s.elapsed,720*3600);
   assert.equal((await q('select state from private.secondary_media_producers where id=$1',[p.producerId])).state,'invalidated');
   assert.equal((await q('select read_secondary_media_retention_readiness() r')).r.expiredObjectsWithoutLiveBindings,0);
   await assert.rejects(q('update private.secondary_media_sources set deleted_at=clock_timestamp(),expires_at=clock_timestamp()+interval \'720 hours\' where id=$1',[s.id]),/source_immutable/);
   await q("insert into videos(id,owner_id,created_at,storage_provider,storage_bucket,storage_object_key) values($1,$2,'2026-01-01','cloudflare_r2','chillywood-media-origin','original.mp4')",[id,owner]);
   const replacement=await begin(id);assert.notEqual(replacement.sourceIncarnation,p.sourceIncarnation);
   await assert.rejects(seal(p),/producer_closed/);
  });
  await t.test('delete during provider write allows receipt settlement but never publication',async()=>{
   const x=await begin(await source());await reserve(x);const write=await dispatch(x);
   await q('delete from videos where id=$1',[x.sourceId]);
   assert.equal((await record(x,write)).r.publishable,false);
   await assert.rejects(seal(x),/producer_closed/);
  });
  await t.test('ordinary edit does not start deletion; locator replacement invalidates pending generation',async()=>{
   const x=await begin(await source());await reserve(x);
   await q("update videos set title='new title' where id=$1",[x.sourceId]);assert.equal((await dispatch(x)).objectKey,x.prefix+'export.mp4');
   await q("update videos set storage_object_key='replacement.mp4' where id=$1",[x.sourceId]);
   assert.equal((await q('select deleted_at from private.secondary_media_sources where id=$1',[x.sourceIncarnation])).deleted_at,null);
   await assert.rejects(seal(x),/producer_closed/);
   await assert.rejects(db.exec('truncate videos'),/explicit_delete_required/);
  });
  await t.test('Hetzner requires a genuine immutable provider version, not ETag alone',async()=>{
   const x=await begin(await source(),randomUUID(),'hetzner_s3');await reserve(x);const write=await dispatch(x);
   await assert.rejects(record(x,write),/receipt_invalid/);
   await assert.rejects(record(x,write,{versionId:'null'}),/receipt_invalid/);
   await record(x,write,{versionId:'provider-version-1'});await seal(x);
  });
  await t.test('dormant consumer claims only expired unshared unheld exact bytes and permanently fences reuse',async()=>{
   const x=await begin(await source());await reserve(x);const write=await dispatch(x);await record(x,write);await seal(x);
   const object=await row(x),claim=async()=>(await q('select claim_secondary_media_expiry($1) r',[object.id])).r;
   assert.equal((await claim()).status,'disabled');
   await db.exec('update private.secondary_media_expiry_settings set enabled=true');
   assert.equal((await claim()).status,'transport_unqualified');
   await db.exec("insert into private.secondary_media_transport_qualification values('cloudflare_r2','chillywood-media-origin',true,repeat('c',64),repeat('d',64),'permanent_key_retirement',clock_timestamp()+interval '1 day')");
   assert.equal((await claim()).status,'live_or_retained_binding');
   await q('delete from videos where id=$1',[x.sourceId]);
   assert.equal((await claim()).status,'live_or_retained_binding');
   // Disposable test-only clock aging; permanent guards restored before any claim.
   await db.exec('alter table private.secondary_media_sources disable trigger secondary_media_identity');
   await q("update private.secondary_media_sources set deleted_at=t.d,expires_at=t.d+interval '720 hours' from (select clock_timestamp()-interval '721 hours' d) t where id=$1",[x.sourceIncarnation]);
   await db.exec('alter table private.secondary_media_sources enable trigger secondary_media_identity');
   await q("insert into legal_holds(target_type,target_id,status) values('creator_video',$1,'active')",[x.sourceId]);
   assert.equal((await claim()).status,'legal_hold');
   await q("update legal_holds set status='released' where target_id=$1",[x.sourceId]);
   await q("insert into json_consumers(metadata) values($1)",[{nested:{url:'https://host.invalid/'+object.object_key}}]);
   assert.equal((await claim()).status,'live_reference');
   await db.exec('delete from json_consumers');
   await q("insert into platform_role_memberships values($1,'owner')",[owner]);
   assert.equal((await claim()).status,'owner_protected');
   await db.exec('delete from platform_role_memberships');
   const c=await claim();assert.equal(c.status,'claimed');assert.deepEqual(await claim(),c);
   const read=(await q('select read_secondary_media_expiry_claim($1) r',[c.claimId])).r;
   assert.equal(read.status,'authorized');assert.equal(read.objectKey,object.object_key);assert.equal(read.permanentlyAbsent,false);
   assert.equal(read.writerFenceSha256,'d'.repeat(64));assert.equal(read.deletionMode,'permanent_key_retirement');
   await db.exec("update private.secondary_media_transport_qualification set writer_fence_sha256=repeat('e',64)");
   assert.equal((await q('select read_secondary_media_expiry_claim($1) r',[c.claimId])).r.status,'transport_unqualified');
   await db.exec("update private.secondary_media_transport_qualification set writer_fence_sha256=repeat('d',64)");
   assert.equal((await q('select read_secondary_media_expiry_claim($1) r',[c.claimId])).r.status,'authorized');
   await assert.rejects(q("update private.secondary_media_expiry_claims set writer_fence_sha256=repeat('e',64) where id=$1",[c.claimId]),/brand_retention_identity_permanent/);
   await assert.rejects(q('insert into json_consumers(metadata) values($1)',[{url:object.object_key}]),/permanently_retired/);
   await assert.rejects(q("insert into legal_holds(target_type,target_id,status) values('creator_video',$1,'active')",[x.sourceId]),/deletion_already_claimed/);
   await assert.rejects(q("insert into platform_role_memberships values($1,'owner')",[owner]),/owner_preservation_unavailable/);
   assert.equal((await q("select check_deleted_media_retirement('cloudflare_r2','chillywood-media-origin',$1,'upload') r",[object.object_key])).r.allowed,false);
   await q("select record_secondary_media_expiry_result($1,'observed_absent')",[c.claimId]);
   await assert.rejects(db.exec('delete from private.secondary_media_expiry_claims'),/brand_retention_identity_permanent/);
   await db.exec('update private.secondary_media_expiry_settings set enabled=false');
   assert.equal((await q('select read_secondary_media_expiry_claim($1) r',[c.claimId])).r.status,'disabled');
   await assert.rejects(q('insert into json_consumers(metadata) values($1)',[{url:object.object_key}]),/permanently_retired/);
  });
 }finally{await db.close();}
});

test('actual full-stack migration replay retains guarded defaults', {timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true});
 try{
  await db.exec("set request.jwt.claim.role='service_role';set request.jwt.claims='{\"role\":\"service_role\"}'");
  assert.equal((await db.query('select enabled from private.secondary_media_registry_gate')).rows[0].enabled,false);
  assert.equal((await db.query('select public.read_secondary_media_retention_readiness() r')).rows[0].r.physicalDeletionAllowed,false);
 }finally{await db.close();}
});

const identity={objectId:randomUUID(),writeToken:randomUUID(),provider:'cloudflare_r2',bucket:'private-origin',objectKey:'render/export.mp4',sha256:sha(bytes),sizeBytes:bytes.length};
const response=(body=bytes,extra={})=>new Response(body,{status:200,headers:{etag:'"v1"','x-amz-meta-chillywood-write-id':identity.writeToken,...extra}});
test('create-only full-byte transport binds upload metadata and never silently retries',async()=>{
 const requests=[];const targetURL=async(method,id,{versionId})=>'https://origin.example.invalid/'+id.objectKey+(versionId?'?versionId='+versionId:'');
 const fetcher=async(url,options)=>{requests.push({url:String(url),...options});return response(options.method==='PUT'?null:bytes);};
 const r=await writeSecondaryMediaObject({identity,bytes},{targetURL,fetcher});
 assert.equal(r.fullReadback,true);assert.equal(requests.length,2);
 assert.equal(requests[0].headers['If-None-Match'],'*');assert.equal(requests[1].headers['If-Match'],'"v1"');
 assert.equal(requests[0].redirect,'error');
 for(const providerResponse of [new Response(null,{status:412}),new Response(null,{status:500})]){
  let calls=0;await assert.rejects(writeSecondaryMediaObject({identity,bytes},{targetURL,fetcher:async()=>{calls++;return providerResponse;}}),/write_conflict|outcome_unknown/);assert.equal(calls,1);
 }
 let calls=0;await assert.rejects(writeSecondaryMediaObject({identity,bytes},{targetURL,fetcher:async()=>{calls++;throw Error('lost response');}}),/outcome_unknown/);assert.equal(calls,1);
});
test('transport rejects local mutation, replaced generation, partial/encoded reads and wrong bytes',async()=>{
 const targetURL=async()=> 'https://origin.example.invalid/object';
 await assert.rejects(writeSecondaryMediaObject({identity,bytes:Buffer.from('different')},{targetURL}),/local_bytes_changed/);
 for(const make of [()=>response(bytes,{'etag':'"new"'}),()=>response(bytes,{'content-range':'bytes 0-31/100'}),
  ()=>response(bytes,{'content-encoding':'gzip'}),()=>response(Buffer.alloc(bytes.length)),()=>response(bytes.subarray(1)),
  ()=>response(bytes,{'x-amz-meta-chillywood-write-id':'different'})]){
  await assert.rejects(writeSecondaryMediaObject({identity,bytes},{targetURL,fetcher:async(_url,o)=>o.method==='PUT'?response(null):make()}),/readback_/);
 }
 await assert.rejects(writeSecondaryMediaObject({identity:{...identity,provider:'hetzner_s3'},bytes},{targetURL,fetcher:async()=>response(null)}),/immutable_version_required/);
});
test('orchestrator records intent before upload and refuses seal after deleted source',async()=>{
 const producerId=randomUUID(),claimToken=randomUUID(),calls=[];
 const inv={objectCount:1,objects:[{objectKey:identity.objectKey,sha256:identity.sha256,sizeBytes:identity.sizeBytes}]};
 const rpc=async(name)=>{calls.push(name);if(name==='reserve_secondary_media_objects')return{reserved:true,objectCount:1};
  if(name==='begin_secondary_media_object_write')return identity;
  if(name==='read_secondary_media_object_write')return{status:'unwritten'};
  if(name==='record_secondary_media_object_receipt')return{recorded:true,objectId:identity.objectId,publishable:false};
  throw Error('must not seal');};
 await assert.rejects(persistSecondaryMediaInventory({producerId,claimToken,inventory:inv},{rpc,readLocalBytes:async()=>bytes,
  targetURL:async()=> 'https://origin.example.invalid/object',fetcher:async(_url,o)=>{calls.push(o.method);return response(o.method==='PUT'?null:bytes);}}),/source_changed_after_write/);
 assert.deepEqual(calls,['reserve_secondary_media_objects','read_secondary_media_object_write','begin_secondary_media_object_write','PUT','GET','record_secondary_media_object_receipt']);
});

test('GET-only recovery confirms exact committed write but absence never permits repeat PUT',async()=>{
 const requests=[];const targetURL=async()=> 'https://origin.example.invalid/object';
 const r=await reconcileSecondaryMediaObject(identity,{targetURL,fetcher:async(_url,o)=>{requests.push(o.method);return response();}});
 assert.equal(r.sha256,identity.sha256);assert.deepEqual(requests,['GET']);
 await assert.rejects(reconcileSecondaryMediaObject(identity,{targetURL,fetcher:async(_url,o)=>{requests.push(o.method);return new Response(null,{status:404});}}),/readback_identity_changed/);
 assert.deepEqual(requests,['GET','GET']);
});
test('aggregate timeout bounds unresolved upload and nonresponsive readback body',async()=>{
 const targetURL=async()=> 'https://origin.example.invalid/object';
 const started=Date.now();
 await assert.rejects(writeSecondaryMediaObject({identity,bytes},{targetURL,timeoutMs:25,fetcher:async()=>new Promise(()=>{})}),/outcome_unknown/);
 assert.ok(Date.now()-started<1000);
 await assert.rejects(reconcileSecondaryMediaObject(identity,{targetURL,timeoutMs:25,fetcher:async()=>new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){return new Promise(()=>{});}}),
  {headers:{etag:'"v1"','x-amz-meta-chillywood-write-id':identity.writeToken}})}),/transport_deadline/);
 assert.ok(Date.now()-started<1000);
});
