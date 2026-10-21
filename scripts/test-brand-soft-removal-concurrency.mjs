#!/usr/bin/env node
// Only a generated disposable clone of LOCAL Supabase is mutated. No providers.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
if(process.argv.includes('--help')){console.log('After local Supabase reset, prove real claim/removal orderings in a disposable local clone. No remote URLs.');process.exit(0);}
assert.equal(process.argv.length,2);
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/m)?.[1];assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER||`supabase_db_${project}`;assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/);
const database=`brand_remove_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}`;
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const claims=`set request.jwt.claims='{"role":"service_role"}';set request.jwt.claim.role='service_role';`;
const docker=(args,input,encoding='utf8')=>spawnSync('docker',args,{input,encoding,maxBuffer:256*1024*1024,timeout:120000});
const ok=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message||String(r.stderr).replaceAll(/[A-Za-z0-9_-]{40,}/g,'<redacted>')}`);return r.stdout;};
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const query=(sql,db=database)=>ok(docker(args(db),`${db==='postgres'?'set default_transaction_read_only=on;':claims}set statement_timeout='15s';${sql}`),'local query').trim();
const admin=(command,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','brand-remove-admin',...command],input,encoding);
const fingerprint="select jsonb_build_object('assets',(select count(*) from platform_brand_assets),'jobs',(select count(*) from media_scan_jobs),'enqueue',md5(pg_get_functiondef('public.enqueue_platform_brand_asset_scan()'::regprocedure)))::text";
let cloned=false,before,checks=0;
function session(name,sql,finish=false){
 const child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);child.stdin.on('error',()=>{});
 const done=new Promise(resolve=>{child.on('error',e=>resolve({code:-1,stdout,stderr:e.message}));child.on('close',code=>resolve({code,stdout,stderr}));});
 child.stdin.write(`${claims}set application_name=${lit(name)};begin;set local statement_timeout='20s';set local idle_in_transaction_session_timeout='30s';${sql};\n`);
 if(finish)child.stdin.end('commit;\n\\q\n');return {child,done,output:()=>stdout};
}
async function until(fn,sessions){const end=Date.now()+15000;while(!fn()){for(const s of sessions)assert.equal(s.child.exitCode,null,'backend exited before required ordering');assert.ok(Date.now()<end,'ordering timeout');await delay(25);}}
async function terminate(name,s){if(!s||s.child.exitCode!==null)return;query(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${lit(name)} and pid<>pg_backend_pid()`);s.child.kill('SIGTERM');await Promise.race([s.done,delay(1000)]);}
async function ordered(first,second,verify){
 const hn=`brand-remove-holder-${process.pid}-${checks}`,wn=`brand-remove-waiter-${process.pid}-${checks}`;let h,w;
 try{
  h=session(hn,`${first};select 'HOLDER_READY'`);await until(()=>h.output().includes('HOLDER_READY'),[h]);
  w=session(wn,second,true);
  await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(hn)} where w.datname=current_database() and h.datname=current_database() and w.application_name=${lit(wn)} and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid))`)==='1',[h,w]);
  h.child.stdin.end('commit;\n\\q\n');const [a,b]=await Promise.all([h.done,w.done]);assert.equal(a.code,0,a.stderr);verify(a,b);checks++;
 }finally{await terminate(wn,w);await terminate(hn,h);}
}
try{
 if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//);
 assert.match(ok(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker required').trim(),/^(unix|npipe):\/\//);
 assert.ok(ok(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'local CLI discovery').split('\n').includes(container));
 before=query(fingerprint,'postgres');
 ok(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create clone');cloned=true;
 ok(docker(args(),'create schema vault;create extension supabase_vault with schema vault;'),'initialize clone');
 const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql','--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
 ok(dump,'read-only source dump');ok(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],dump.stdout,null),'restore clone');
 const fixture=()=>{
  const id=randomUUID(),key=`brand_remove_fixture/logo/${id}.png`;
  query(`insert into storage.objects(bucket_id,name,version) values('platform-brand-assets',${lit(key)},${lit(randomUUID())});
   insert into platform_brand_assets(id,owner_user_id,asset_type,asset_state,storage_object_key,storage_path,mime_type) values(${lit(id)},'brand_remove_fixture','logo','published',${lit(key)},${lit(key)},'image/png')`);
  const job=query(`select id from media_scan_jobs where target_table='platform_brand_assets' and target_id=${lit(id)}`);assert.match(job,/^[0-9a-f-]{36}$/);
  query(`update media_scan_jobs set priority=-2147483648,metadata=metadata||'{"preserve":"native-fixture"}' where id=${lit(job)}`);
  return{id,job};
 };
 const remove=f=>`update platform_brand_assets set deleted_at=clock_timestamp() where id=${lit(f.id)}`;
 const claim="select id from claim_media_scan_jobs(1,'brand-removal-native')";
 const state=f=>JSON.parse(query(`select to_jsonb(j)::text from media_scan_jobs j where id=${lit(f.job)}`));
 const tombstone=f=>JSON.parse(query(`select jsonb_build_object('deletedAt',deleted_at,'state',asset_state)::text from platform_brand_assets where id=${lit(f.id)}`));
 // Real claim wins, then removal must not rewrite a single claimed job field.
 {
  const f=fixture();let claimed;
  await ordered(`${claim};select 'JOB_STATE:'||to_jsonb(j)::text from media_scan_jobs j where id=${lit(f.job)}`,remove(f),(holder,waiter)=>{
   assert.equal(waiter.code,0,waiter.stderr);const line=holder.stdout.split('\n').find(x=>x.startsWith('JOB_STATE:'));assert.ok(line);claimed=JSON.parse(line.slice(10));assert.equal(claimed.status,'scanning');
  });
  assert.deepEqual(state(f),claimed);const removed=tombstone(f);assert.ok(removed.deletedAt);assert.equal(removed.state,'archived');
  const completed=JSON.parse(query(`select complete_media_scan_job(${lit(f.job)},'clean','clamav','fixture','daily/fixture',null,null,1)`));
  assert.equal(completed.targetPropagationComplete,true);assert.equal(state(f).status,'clean');assert.deepEqual(tombstone(f),removed);
  const restore=docker(args(),`update platform_brand_assets set deleted_at=null where id=${lit(f.id)}`);assert.notEqual(restore.status,0);assert.match(restore.stderr,/tombstone_permanent/);
 }
 // Real removal wins, then existing claim eligibility remains unchanged.
 // The holder proves removal itself did not reset any pending job fields.
 {
  const f=fixture(),pending=state(f);
  await ordered(`${remove(f)};select 'JOB_STATE:'||to_jsonb(j)::text from media_scan_jobs j where id=${lit(f.job)}`,claim,(holder,waiter)=>{
   assert.equal(waiter.code,0,waiter.stderr);assert.equal(waiter.stdout.trim(),f.job);
   const line=holder.stdout.split('\n').find(x=>x.startsWith('JOB_STATE:'));assert.ok(line);assert.deepEqual(JSON.parse(line.slice(10)),pending);
  });
  assert.equal(state(f).status,'scanning');assert.equal(state(f).attempt_count,pending.attempt_count+1);
  const removed=tombstone(f);assert.ok(removed.deletedAt);assert.equal(removed.state,'archived');
  assert.equal(JSON.parse(query(`select complete_media_scan_job(${lit(f.job)},'clean','clamav','fixture','daily/fixture',null,null,1)`)).targetPropagationComplete,true);
  assert.deepEqual(tombstone(f),removed);
 }
 console.log(`Brand soft removal: ${checks} real claim/removal orderings passed; scanner state unchanged by removal, no providers contacted.`);
}finally{
 if(cloned)ok(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop clone');
 if(before!==undefined)assert.equal(query(fingerprint,'postgres'),before,'local source unchanged');
}
