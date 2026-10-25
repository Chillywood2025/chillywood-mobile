#!/usr/bin/env node
// Two real PostgreSQL backends. Only a generated disposable LOCAL clone changes.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
if(process.argv.includes('--help')){console.log('Run after local Supabase reset. Uses a disposable clone of local supabase_db_* only; no remote URLs.');process.exit(0);}
const negative=process.argv.includes('--negative-control');
assert.ok(process.argv.length===(negative?3:2));
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/m)?.[1];
assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER || `supabase_db_${project}`;
assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/);
const database=`brand_dispatch_queue_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}`;
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const docker=(args,input,encoding='utf8')=>spawnSync('docker',args,{input,encoding,maxBuffer:256*1024*1024,timeout:120000});
const ok=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message || String(r.stderr).replaceAll(/[A-Za-z0-9_-]{40,}/g,'<redacted>')}`);return r.stdout;};
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const query=(sql,db=database)=>ok(docker(args(db),`${db==='postgres'?'set default_transaction_read_only=on;':`set request.jwt.claims='${JSON.stringify({role:'service_role'})}';set request.jwt.claim.role='service_role';`}set statement_timeout='15s';${sql}`),'local query').trim();
const admin=(command,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','retention-admin',...command],input,encoding);
const fingerprintTables=['auth.users','storage.objects','public.platform_brand_assets','public.media_scan_jobs',
 'private.platform_brand_expiry_claims','private.platform_brand_expiry_dispatch_intents',
 'private.platform_brand_expiry_transport_results','private.platform_brand_retention_settings'];
const fingerprint=`select jsonb_build_object(${fingerprintTables.map(table=>`${lit(table)},(select md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by md5(to_jsonb(x)::text)),'')) from ${table} x)`).join(',')})::text`;
let cloned=false,before,checks=0;
function session(name,sql,finish=false,isolation='read committed'){
 const child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
 const done=new Promise(resolve=>{child.on('error',e=>resolve({code:-1,stderr:e.message,stdout}));child.on('close',code=>resolve({code,stderr,stdout}));});
 child.stdin.on('error',()=>{});
 // Each supplied batch must be complete before COMMIT or a later stdin write.
 // Callers intentionally need not provide a final statement separator.
 child.stdin.write(`set request.jwt.claims='${JSON.stringify({role:'service_role'})}';set request.jwt.claim.role='service_role';set application_name=${lit(name)};begin isolation level ${isolation};set local statement_timeout='35s';set local idle_in_transaction_session_timeout='45s';${sql};\n`);
 if(finish)child.stdin.end('commit;\n\\q\n');
 return{child,done,output:()=>stdout,status:()=>({code:child.exitCode,stdout,stderr})};
}
async function until(fn,label,sessions=[]){
 const end=Date.now()+20000;
 while(Date.now()<end){
  if(fn())return;
  for(const s of sessions){
   const result=s.status();
   if(result.code!==null){
    const diagnostic=result.stderr.replaceAll(/[A-Za-z0-9_-]{40,}/g,'<redacted>')
     .replaceAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,'<synthetic-id>').slice(-2000);
    throw Error(`${label}: backend exited (${result.code}) before the required state: ${diagnostic}`);
   }
  }
  await delay(25);
 }
 throw Error(`timeout ${label}`);
}
async function terminate(name,s){if(!s || s.child.exitCode!==null)return;query(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${lit(name)} and pid<>pg_backend_pid();`);s.child.kill('SIGTERM');await Promise.race([s.done,delay(1000)]);}
async function ordered(first,second,verify,{rollback=false,afterQueue=''}={}){
 const hn=`retention-holder-${checks}-${process.pid}`,wn=`retention-waiter-${checks}-${process.pid}`;let h,w;
 try{
  h=session(hn,`${first};select 'HOLDER_READY';`);await until(()=>h.output().includes('HOLDER_READY'),'holder ready',[h]);
  w=session(wn,second,true);
  await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(hn)} where w.datname=current_database() and w.application_name=${lit(wn)} and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`)==='1','observed independent backend lock queue',[h,w]);
  h.child.stdin.end(`${afterQueue};${rollback?'rollback':'commit'};\n\\q\n`);const [a,b]=await Promise.all([h.done,w.done]);assert.equal(a.code,0,a.stderr);verify(a,b);checks++;
 }finally{await terminate(hn,h);await terminate(wn,w);}
}
try{
 if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//);
 assert.match(ok(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker required').trim(),/^(unix|npipe):\/\//);
 assert.ok(ok(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'local CLI discovery').split('\n').includes(container));
 const applied=new Set(query('select version from supabase_migrations.schema_migrations','postgres').split('\n'));
 for(const file of readdirSync('supabase/migrations').filter(name=>/^\d+_.+\.sql$/.test(name)))assert.ok(applied.has(file.split('_')[0]),`full local reset missing ${file}`);
 before=query(fingerprint,'postgres');
 ok(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create generated clone');cloned=true;
 ok(docker(args(),'create schema vault;create extension supabase_vault with schema vault;'),'initialize clone');
 const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql','--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
 ok(dump,'read-only dump');ok(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],dump.stdout,null),'restore clone');

 assert.equal(query('select not expiry_enabled from private.platform_brand_retention_settings'),'t');
 assert.equal(query("select to_regclass('private.platform_brand_expiry_dispatch_intents') is not null"),'t','full reset must include dispatch migration');
 const owner='brand_retention_disposable_owner';
 const proofSql=f=>`select public.record_platform_brand_retention_proof(${lit(f.id)},${lit(JSON.stringify(f.binding))}::jsonb,${lit(JSON.stringify(f.proof))}::jsonb)`;
 function fixture({reference=false}={}) {
   const id=randomUUID(),key=`${owner}/logo/${id}.png`;
   query(`insert into storage.objects(id,bucket_id,name,version,metadata) values(gen_random_uuid(),'platform-brand-assets',${lit(key)},${lit(randomUUID())},'{"size":23}');
   insert into platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes)
   values(${lit(id)},${lit(owner)},'logo',${lit(key)},${lit(key)},'image/png',23);`);
   const job=query(`select id from media_scan_jobs where target_table='platform_brand_assets' and target_id=${lit(id)} order by created_at desc limit 1`);
   assert.match(job,/^[0-9a-f-]{36}$/);
   query(`update media_scan_jobs set priority=-2147483648 where id=${lit(job)};select * from public.claim_media_scan_jobs(1,'brand-native-fixture');`);
   assert.equal(query(`select status from media_scan_jobs where id=${lit(job)}`),'scanning');
   const attempt=Number(query(`select attempt_count from media_scan_jobs where id=${lit(job)}`));
   const observation=query(`select public.begin_media_scan_byte_observation(${lit(job)},'brand-native-fixture',${attempt})`);
   const completed=JSON.parse(query(`select public.complete_media_scan_job(${lit(job)},'clean','clamav','ClamAV fixture','daily/fixture',null,null,1)`));
   assert.equal(completed.targetPropagationComplete,true);
   const receipt=query(`select public.record_media_scan_byte_receipt(${lit(observation)},${lit(job)},'brand-native-fixture',repeat('a',64),23)`);
   const binding=JSON.parse(query(`select public.read_platform_brand_retention_binding(${lit(id)})`));
   if(reference) query(`insert into public.brand_retention_native_consumer(media_url) values(${lit('https://example.invalid/'+key)})`);
   return {id,key,job,binding,proof:{originSha256:'a'.repeat(64),originSizeBytes:23,scanReceiptId:receipt}};
 }
 query(`create table public.brand_retention_native_consumer(id uuid primary key default gen_random_uuid(),media_url text);
 create trigger zzz_platform_brand_retention_reference before insert or update on public.brand_retention_native_consumer for each row execute function private.guard_platform_brand_retention_references();`);
 const due=f=>query(`${proofSql(f)};
 update platform_brand_assets set deleted_at=clock_timestamp() where id=${lit(f.id)};
 alter table private.platform_brand_object_incarnations disable trigger brand_retention_immutable;
 update private.platform_brand_object_incarnations set removed_at=statement_timestamp()-interval '721 hours',retain_until=statement_timestamp()-interval '1 hour' where asset_id=${lit(f.id)};
 alter table private.platform_brand_object_incarnations enable trigger brand_retention_immutable;`);
 query(`update private.platform_brand_retention_settings set expiry_enabled=true,writer_drain_evidence_sha256=repeat('e',64),reference_review_evidence_sha256=repeat('f',64),version_delete_verified=true,provider_origin='https://fixture.supabase.test',provider_contract_sha256=repeat('c',64);`);

 const f=fixture();due(f);
 const claim=JSON.parse(query(`select public.begin_platform_brand_retention_transport(${lit(f.id)})`));
 assert.equal(claim.status,'claimed');
 assert.equal(JSON.parse(query(`select public.prepare_platform_brand_retention_batch_dispatch(${lit(f.id)},${lit(claim.claimToken)})`)).status,'batch_disabled_or_unqualified','batch final authorization retains independent gates');
 assert.equal(query(`select count(*) from private.platform_brand_expiry_dispatch_intents where claim_token=${lit(claim.claimToken)}`),'0','blocked batch cannot create intent');
 const prepare=`select public.prepare_platform_brand_retention_dispatch(${lit(f.id)},${lit(claim.claimToken)})`;
 if(negative) {
  // Deliberately unsafe clone-only variant: ignoring an existing intent must be
  // caught by the exact same two-backend oracle, not a synthetic boolean check.
  query(`create or replace function public.prepare_platform_brand_retention_dispatch(p_asset_id uuid,p_claim_token uuid)
   returns jsonb language plpgsql security definer set search_path='' as $$
   declare checked jsonb; begin
    perform private.platform_brand_retention_lock();
    checked:=public.read_platform_brand_retention_expiry_claim(p_asset_id,p_claim_token);
    if checked->>'status'<>'authorized' then return checked; end if;
    insert into private.platform_brand_expiry_dispatch_intents(claim_token,asset_id,reason)
     values(p_claim_token,p_asset_id,'dispatch_intent') on conflict do nothing;
    return checked||jsonb_build_object('status','dispatch_authorized');
   end $$;`);
 }
 let rejected=false;
 try {
  await ordered(prepare,prepare,(a,b)=>{
   assert.equal(b.code,0,b.stderr);
   const authorizations=(a.stdout.match(/"status": "dispatch_authorized"/g)||[]).length+(b.stdout.match(/"status": "dispatch_authorized"/g)||[]).length;
   assert.equal(authorizations,1,'marker_replay_allowed');
   assert.match(b.stdout,/"status": "observe_only"/);
  });
 } catch(error) {
  if(!negative||error.code!=='ERR_ASSERTION'||!error.message.includes('marker_replay_allowed'))throw error;
  rejected=true;
 }
 if(negative)assert.equal(rejected,true,'unsafe duplicate-dispatch variant must be rejected');
 else {
  assert.equal(JSON.parse(query(prepare)).status,'observe_only','crash after confirmed intent is read-only');
  query(`begin;select public.record_platform_brand_retention_transport_result(${lit(f.id)},${lit(claim.claimToken)},'delete_acknowledged');rollback;`);
  assert.equal(JSON.parse(query(prepare)).status,'observe_only','ack persistence rollback cannot reauthorize');
  query(`select public.record_platform_brand_retention_transport_result(${lit(f.id)},${lit(claim.claimToken)},'delete_acknowledged')`);
  assert.equal(JSON.parse(query(prepare)).status,'observe_only','acknowledged claim cannot reauthorize');
  assert.equal(query(`select count(*) from private.platform_brand_expiry_dispatch_intents where claim_token=${lit(claim.claimToken)}`),'1');
  // Native Storage protects direct SQL deletion even inside this disposable
  // clone. Assert that guard rather than disable it to manufacture absence.
  // Missing-metadata recovery is separately covered by migrated SQL fixtures.
  const deletion=docker(args(),`begin;${claimsForDelete()}delete from storage.objects where name=${lit(f.key)};rollback;`);
  assert.notEqual(deletion.status,0,'direct SQL deletion must remain forbidden');
  assert.match(String(deletion.stderr),/storage\.protect_delete/);
  assert.equal(JSON.parse(query(prepare)).status,'observe_only','present bytes never reauthorize acknowledged deletion');
  assert.equal(query("select has_function_privilege('authenticated','public.prepare_platform_brand_retention_dispatch(uuid,uuid)','EXECUTE')"),'f');
  assert.equal(query("select has_table_privilege('service_role','private.platform_brand_expiry_dispatch_intents','INSERT')"),'f');
  checks+=6;
 }
 console.log(`Brand dispatch native PostgreSQL: ${negative?'unsafe replay variant rejected':`${checks} controls passed with independent lock queue and direct-SQL deletion denial`}; no provider calls; native metadata disappearance not exercised.`);
} finally {
 if(cloned)ok(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop generated clone');
 if(before!==undefined)assert.equal(query(fingerprint,'postgres'),before,'local source unchanged');
}

function claimsForDelete(){return `set request.jwt.claims='{"role":"service_role"}';set request.jwt.claim.role='service_role';`;}
