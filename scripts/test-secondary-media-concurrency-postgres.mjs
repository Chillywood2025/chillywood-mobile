#!/usr/bin/env node
// Real independent PostgreSQL sessions, disposable LOCAL full-schema clone.
// No remote URLs, provider requests, credentials or production operations.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
if(process.argv.includes('--help')){console.log('Run after local Supabase reset; synthetic objects in a generated local clone only.');process.exit(0);}
assert.equal(process.argv.length,2);
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/m)?.[1];assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER||`supabase_db_${project}`;assert.match(container,/^supabase_db_[A-Za-z0-9_.-]+$/);
const db=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_secondary`;
const restore=createBrandGuardCloneRestorer({container}),lit=x=>`'${String(x).replaceAll("'","''")}'`,json=x=>lit(JSON.stringify(x))+'::jsonb';
const args=(database=db,user='postgres')=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',user,'-d',database];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{input,encoding,maxBuffer:256*1024*1024,timeout:120000});
const ok=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message||r.stderr||''}`);return r.stdout;};
const auth="set request.jwt.claim.role='service_role';set request.jwt.claims='{\"role\":\"service_role\"}';";
const query=(sql,database=db)=>ok(docker(args(database),`${auth}set statement_timeout='20s';set time zone 'UTC';${sql}`),'query').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','secondary-fixture',...a],input,encoding);
const sessions=[];let count=0,cloned=false;
function session(sql){
 const name='secondary-native-'+randomUUID();const child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
 child.stdin.write(`${auth}set application_name=${lit(name)};set statement_timeout='30s';begin isolation level read committed;${sql};\n`);
 const s={child,name,done,output:()=>stdout};sessions.push(s);return s;
}
async function until(fn){const end=Date.now()+20000;while(Date.now()<end){if(fn())return;await delay(25);}throw Error('actual backend queue not observed');}
async function race(label,first,second,{error,after}={}){
 const a=session(`${first};select 'HOLDER_READY'`);await until(()=>a.output().includes('HOLDER_READY'));
 const b=session(`${second};commit;`);b.child.stdin.end();
 await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(a.name)}
  where w.datname=current_database() and h.datname=current_database() and w.application_name=${lit(b.name)} and h.pid=any(pg_blocking_pids(w.pid));`)==='1');
 const evidence=JSON.parse(query(`select jsonb_build_object('holderPid',h.pid,'waiterPid',w.pid,'blockers',pg_blocking_pids(w.pid))
  from pg_stat_activity w cross join pg_stat_activity h where w.datname=current_database() and h.datname=current_database()
  and w.application_name=${lit(b.name)} and h.application_name=${lit(a.name)}`));
 assert.notEqual(evidence.holderPid,evidence.waiterPid);assert.ok(evidence.blockers.includes(evidence.holderPid));
 a.child.stdin.end('commit;\n');const ar=await a.done;assert.equal(ar.code,0,ar.stderr);
 const br=await b.done;assert.doesNotMatch(br.stderr,/deadlock detected|statement timeout|lock timeout/i);
 if(error){assert.notEqual(br.code,0);assert.match(br.stderr,error);}else assert.equal(br.code,0,br.stderr);
 after?.(br);count++;console.log(JSON.stringify({schedule:label,...evidence}));
}
try{
 if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//);
 assert.match(ok(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//);
 assert.ok(ok(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').split('\n').includes(container));
 assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261101142934')",'postgres'),'t');
 ok(docker(['exec',container,'createdb','-U','postgres','-T','template0',db]),'create clone');cloned=true;
 query('create schema vault;create extension supabase_vault with schema vault;');
 const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql',
  '--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
 ok(dump,'local read-only dump');ok(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',db],restore.prepare(dump.stdout,db),null),'restore clone');
 query(readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
 const owner=query("select user_id from event_reservation_fixture.actors where kind='creator'");
 query(`create table public.secondary_native_reference(id uuid primary key default gen_random_uuid(),media_url text);
  create trigger reference_guard before insert or update on public.secondary_native_reference for each row execute function private.guard_deleted_media_references();
  create trigger secondary_guard before insert or update on public.secondary_native_reference for each row execute function private.secondary_media_retired_reference_guard();`);
 const source=(sourceOwner=owner)=>{const id=randomUUID();query(`insert into videos(id,owner_id,title,created_at,storage_provider,storage_bucket,storage_object_key,storage_path)
  values(${lit(id)},${lit(sourceOwner)},'Synthetic retention',now(),'cloudflare_r2','chillywood-media-origin',${lit(sourceOwner+'/'+id+'/source.mp4')},${lit(sourceOwner+'/'+id+'/source.mp4')});`);return id;};
 const beginSQL=(id,producer)=>`select begin_secondary_media_producer('creator_video',${lit(id)},${lit(producer)},private.secondary_media_read_source('creator_video',${lit(id)}),'cloudflare_r2','chillywood-media-origin',${lit('renders/'+producer+'/')})`;
 const remove=id=>`delete from videos where id=${lit(id)}`;
 {
  assert.equal(query('select enabled from private.secondary_media_registry_gate'),'f');
  const id=source(),producer=randomUUID();await race('admission before source removal',beginSQL(id,producer),remove(id));
  assert.equal(query(`select state from private.secondary_media_producers where id=${lit(producer)}`),'invalidated');
 }
 {
  const id=source(),producer=randomUUID();await race('source removal before producer admission',remove(id),beginSQL(id,producer),{error:/source_unavailable/});
 }
 function fixture({withDispatch=true,sourceOwner=owner}={}){
  const id=source(sourceOwner),producer=randomUUID(),p=JSON.parse(query(beginSQL(id,producer))),key='renders/'+producer+'/export.mp4';
  const inv={inventorySha256:'a'.repeat(64),objectCount:1,objects:[{objectKey:key,kind:'render',sha256:'b'.repeat(64),sizeBytes:23,dependencies:[]}]};
  query(`select reserve_secondary_media_objects(${lit(producer)},${lit(p.claimToken)},${json(inv)})`);
  const dispatch=`select begin_secondary_media_object_write(${lit(producer)},${lit(p.claimToken)},${lit(key)})`;
  const write=withDispatch?JSON.parse(query(dispatch)):null;
  const receipt={protocol:'secondary-media-create-only-v1',provider:'cloudflare_r2',bucket:'chillywood-media-origin',objectKey:key,sha256:'b'.repeat(64),sizeBytes:23,etag:'"synthetic"',versionId:null,createOnly:true,fullReadback:true,writeCompleted:true};
  const record=`select record_secondary_media_object_receipt(${lit(producer)},${lit(p.claimToken)},${lit(key)},${lit(write?.writeToken)},${json(receipt)})`;
  const seal=`select seal_secondary_media_producer(${lit(producer)},${lit(p.claimToken)})`;
  return{id,producer,p,key,write,record,seal,dispatch};
 }
 {
  const f=fixture();await race('delete before late write receipt',remove(f.id),f.record,{after:r=>assert.match(r.stdout,/"publishable": false/)});
  assert.equal(query(`select state from private.secondary_media_producers where id=${lit(f.producer)}`),'invalidated');
 }
 {
  const f=fixture();query(f.record);await race('seal before delete',f.seal,remove(f.id));
  assert.equal(query(`select state from private.secondary_media_producers where id=${lit(f.producer)}`),'invalidated');
 }
 {
  const f=fixture({withDispatch:false});await race('competing write dispatch is exactly once',f.dispatch,f.dispatch,{error:/already_dispatched/});
  assert.equal(query(`select count(*) from private.secondary_media_objects where producer_id=${lit(f.producer)} and write_token is not null`),'1');
 }
 {
  const f=fixture({withDispatch:false});await race('source deletion before write dispatch',remove(f.id),f.dispatch,{error:/producer_closed/});
 }
 {
  const f=fixture({withDispatch:false});await race('write dispatch before source deletion',f.dispatch,remove(f.id));
  assert.equal(query(`select count(*) from private.secondary_media_objects where producer_id=${lit(f.producer)} and receipt is null and write_token is not null`),'1');
 }
 await race('expiry activation drains prior reference writer',"insert into public.secondary_native_reference(media_url) values('synthetic-no-object')",
  'update private.secondary_media_expiry_settings set enabled=true');
 query("insert into private.secondary_media_transport_qualification values('cloudflare_r2','chillywood-media-origin',true,repeat('c',64),repeat('d',64),'permanent_key_retirement',clock_timestamp()+interval '1 day')");
 const age=f=>query(`${remove(f.id)};
  alter table private.secondary_media_sources disable trigger secondary_media_identity;
  update private.secondary_media_sources set deleted_at=t.d,expires_at=t.d+interval '720 hours'
   from (select clock_timestamp()-interval '721 hours' d) t where id=${lit(f.p.sourceIncarnation)};
  alter table private.secondary_media_sources enable trigger secondary_media_identity;`);
 const aged=(options)=>{const f=fixture(options);query(`${f.record};${f.seal}`);age(f);return f;};
 const claim=f=>`select claim_secondary_media_expiry(${lit(f.write.objectId)})`;
 const hold=f=>`insert into legal_holds(target_type,target_id,reason,status) values('creator_video',${lit(f.id)},'Synthetic retention hold','active')`;
 {
  const f=aged();await race('legal hold before expiry claim',hold(f),claim(f),{after:r=>assert.match(r.stdout,/legal_hold/)});
 }
 {
  const f=aged();await race('expiry claim before legal hold',claim(f),hold(f),{error:/deletion_already_claimed/});
 }
 {
  const f=aged();await race('new reference before expiry claim',`insert into secondary_native_reference(media_url) values(${lit(f.key)})`,claim(f),{after:r=>assert.match(r.stdout,/live_reference/)});
 }
 {
  const f=aged();await race('expiry claim before new reference',claim(f),`insert into secondary_native_reference(media_url) values(${lit(f.key)})`,{error:/permanently_retired/});
 }
 {
  const f=fixture();age(f);await race('last write receipt before expiry claim',f.record,claim(f),{after:r=>assert.match(r.stdout,/claimed/)});
 }
 {
  const f=fixture();age(f);await race('expiry inspection before last write receipt',claim(f),f.record);
  assert.equal(query(`select count(*) from private.secondary_media_expiry_claims where object_id=${lit(f.write.objectId)}`),'0');
  assert.match(query(claim(f)),/claimed/);
 }
 for(const [actor,ownerFirst] of [['buyer1',true],['buyer2',false]]){
  const roleOwner=query(`select user_id from event_reservation_fixture.actors where kind=${lit(actor)}`),f=aged({sourceOwner:roleOwner});
  const grant=`insert into platform_role_memberships(user_id,role,status) values(${lit(roleOwner)},'owner','active')`;
  if(ownerFirst)await race('owner grant before expiry claim',grant,claim(f),{after:r=>assert.match(r.stdout,/owner_protected/)});
  else await race('expiry claim before owner grant',claim(f),grant,{error:/owner_preservation_unavailable/});
 }
 assert.equal(count,16);console.log('PASS native: sixteen secondary-media ordering schedules with actual independent backend blocking edges. No provider/deletion operation.');
}finally{
 for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end('rollback;\n');s.child.kill('SIGTERM');}
 try{if(cloned)ok(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',db]),'drop owned clone');}finally{restore.assertSourceUnchanged();}
}
