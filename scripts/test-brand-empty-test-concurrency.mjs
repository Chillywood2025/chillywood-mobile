#!/usr/bin/env node
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
// Additive empty-evidence controls using two real PostgreSQL backends.
// Only a generated disposable LOCAL clone changes. No provider or origin calls.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
if(process.argv.includes('--help')){console.log('Run empty-evidence contention after local Supabase reset; --negative-control requires unsafe dispatch rejection. Uses a generated disposable clone of local supabase_db_* only; no remote URLs or providers.');process.exit(0);}
const negative=process.argv.includes('--negative-control');
assert.ok(process.argv.length===(negative?3:2));
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/m)?.[1];
assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER || `supabase_db_${project}`;
assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/);
const cloneGuardRestore = createBrandGuardCloneRestorer({container});
const database=`brand_empty_queue_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}`;
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const docker=(args,input,encoding='utf8')=>spawnSync('docker',args,{input,encoding,maxBuffer:256*1024*1024,timeout:120000});
const ok=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message || String(r.stderr).replaceAll(/[A-Za-z0-9_-]{40,}/g,'<redacted>')}`);return r.stdout;};
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const query=(sql,db=database)=>ok(docker(args(db),`${db==='postgres'?'set default_transaction_read_only=on;':`set request.jwt.claims='${JSON.stringify({role:'service_role'})}';set request.jwt.claim.role='service_role';`}set statement_timeout='15s';${sql}`),'local query').trim();
const admin=(command,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','retention-admin',...command],input,encoding);
const fingerprintTables=['auth.users','auth.sessions','storage.objects','public.platform_brand_assets','public.media_scan_jobs',
 'public.platform_role_memberships','public.wave1_legal_acceptances','public.legal_holds',
 'private.platform_brand_object_incarnations','private.platform_brand_object_proofs','private.media_scan_byte_receipts',
 'private.platform_brand_empty_authorizations','private.platform_brand_empty_owner_removals','private.platform_brand_empty_observations',
 'private.platform_brand_empty_dispositions','private.platform_brand_empty_claim_evidence',
 'private.deleted_content_records','private.deleted_content_brand_delegations','private.deleted_content_retention_settings',
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
 const hn=`brand-empty-holder-${checks}-${process.pid}`,wn=`brand-empty-waiter-${checks}-${process.pid}`;let h,w;
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
 assert.deepEqual([...applied].sort(),readdirSync('supabase/migrations').filter(name=>/^\d+_.+\.sql$/.test(name)).map(file=>file.split('_')[0]).sort(),'complete reset checkout schema required');
 before=query(fingerprint,'postgres');
 ok(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create generated clone');cloned=true;
 ok(docker(args(),'create schema vault;create extension supabase_vault with schema vault;'),'initialize clone');
 const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql','--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
 ok(dump,'read-only dump');ok(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database], cloneGuardRestore.prepare(dump.stdout, database), null),'restore clone');

 assert.equal(query('select not expiry_enabled from private.platform_brand_retention_settings'),'t');
 assert.equal(query("select to_regclass('private.platform_brand_empty_claim_evidence') is not null"),'t','full reset includes empty-evidence migration');
 const globalFlagsOff='select not (activation_ready or capture_enabled or media_staging_enabled or text_expiry_enabled or media_expiry_enabled or legacy_object_deletes_blocked) from private.deleted_content_retention_settings';
 assert.equal(query(globalFlagsOff),'t','all global flags are off before bootstrap');
 const owner=randomUUID(),ownerSession=randomUUID();
 query(`insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
  values(${lit(owner)},${lit('empty-native-'+owner+'@example.invalid')},now(),false,false);
  insert into auth.sessions(id,user_id,not_after) values(${lit(ownerSession)},${lit(owner)},now()+interval '1 day');
  insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
  values('owner',${lit(owner)},${lit('empty-native-'+owner+'@example.invalid')},'active','Synthetic native empty fixture','fixture');
  insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
  select ${lit(owner)}::uuid,public.wave1_sha256(${lit(owner)}),document_key,version,market,'member',capability,${lit(ownerSession)},'service_reconciliation'
  from public.wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account';`);
 const ownerClaims=JSON.stringify({role:'authenticated',sub:owner,session_id:ownerSession});
 const claimSql=f=>`select public.claim_platform_brand_retention_expiry(${lit(f.id)})`;
 const rows=(table,id)=>query(`select count(*) from ${table} where asset_id=${lit(id)}`);
 const typedClaim=f=>{
  assert.equal(rows('private.platform_brand_expiry_claims',f.id),'1','exactly one permanent claim');
  assert.equal(rows('private.platform_brand_empty_claim_evidence',f.id),'1','claim and typed evidence sidecar are atomic');
  assert.equal(query(`select count(*) from private.platform_brand_empty_claim_evidence e
   join private.platform_brand_expiry_claims c on c.claim_token=e.claim_token and c.asset_id=e.asset_id
   join private.platform_brand_empty_dispositions d on d.id=e.disposition_id and d.asset_id=e.asset_id and d.evidence_sha256=e.evidence_sha256
   join private.platform_brand_empty_authorizations a on a.asset_id=e.asset_id and a.snapshot->'binding'=e.binding
   join private.platform_brand_empty_owner_removals r on r.asset_id=e.asset_id and r.authorization_id=a.id
   where e.asset_id=${lit(f.id)} and e.evidence_kind='archived_empty_test'`),'1','sidecar binds exact disposition digest and original generation');
 };
 const parsedOutput=result=>JSON.parse(result.stdout.split('\n').find(line=>line.startsWith('{')));
 const immutable=f=>query(`select jsonb_build_object('source',(select to_jsonb(a) from public.platform_brand_assets a where a.id=${lit(f.id)}),
  'incarnation',(select to_jsonb(r) from private.platform_brand_object_incarnations r where r.asset_id=${lit(f.id)}),
  'job',(select to_jsonb(j) from public.media_scan_jobs j where j.id=${lit(f.job)}),
  'authorization',(select to_jsonb(x) from private.platform_brand_empty_authorizations x where x.asset_id=${lit(f.id)}),
  'ownerRemoval',(select to_jsonb(x) from private.platform_brand_empty_owner_removals x where x.asset_id=${lit(f.id)}),
  'disposition',(select to_jsonb(d) from private.platform_brand_empty_dispositions d where d.asset_id=${lit(f.id)}))::text`);
 function fixture({mature=true,recorded=true,removed=true}={}) {
  const id=randomUUID(),objectId=randomUUID(),key=`${owner}/logo/${id}.png`;
  query(`insert into storage.objects(id,bucket_id,name,version,metadata)
    values(${lit(objectId)},'platform-brand-assets',${lit(key)},'empty-native-v1','{"size":0}');
    insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes)
    values(${lit(id)},${lit(owner)},'logo',${lit(key)},${lit(key)},'image/png',23);`);
  const job=query(`select id from public.media_scan_jobs where target_table='platform_brand_assets' and target_id=${lit(id)}`);
  assert.match(job,/^[0-9a-f-]{36}$/);
  query(`update public.media_scan_jobs set priority=-2147483648 where id=${lit(job)};
    select * from public.claim_media_scan_jobs(1,'empty-native-historical-worker');`);
  assert.equal(query(`select status from public.media_scan_jobs where id=${lit(job)}`),'scanning');
  const completed=JSON.parse(query(`select public.complete_media_scan_job(${lit(job)},'clean','clamav','Synthetic historical result','daily/fixture',null,null,1)`));
  assert.equal(completed.targetPropagationComplete,true);
  if(mature){
   // Synthetic mature source/history is established BEFORE immutable intent.
   query(`begin;
    alter table private.platform_brand_object_incarnations disable trigger brand_retention_immutable;
    alter table public.platform_brand_assets disable trigger aaa_platform_brand_retention;
    alter table public.media_scan_jobs disable trigger zzz_platform_brand_retention_reference;
    update private.platform_brand_object_incarnations set source_created_at=source_created_at-interval '722 hours' where asset_id=${lit(id)};
    update public.platform_brand_assets a set created_at=r.source_created_at
      from private.platform_brand_object_incarnations r where a.id=r.asset_id and a.id=${lit(id)};
    update public.media_scan_jobs set created_at=created_at-interval '722 hours',completed_at=completed_at-interval '722 hours' where id=${lit(job)};
    alter table private.platform_brand_object_incarnations enable trigger brand_retention_immutable;
    alter table public.platform_brand_assets enable trigger aaa_platform_brand_retention;
    alter table public.media_scan_jobs enable trigger zzz_platform_brand_retention_reference;
    commit;`);
  }
  query(`insert into private.platform_brand_empty_authorizations(asset_id,owner_decision_sha256,snapshot)
   values(${lit(id)},repeat('a',64),private.platform_brand_empty_intent_snapshot(${lit(id)}))`);
  // Real canonical Owner/session/Premium/path checks, never a service-role
  // removal shortcut. The authenticated session exists only in this clone.
  const remove=`set local request.jwt.claims=${lit(ownerClaims)};set local request.jwt.claim.role='authenticated';
    set local role authenticated;select public.remove_platform_brand_empty_test_asset(${lit(id)});reset role`;
  if(!removed)return{id,objectId,key,job,remove};
  const removal=JSON.parse(query(`begin;${remove};commit;`));
  assert.equal(removal.ownerRemovalReceiptRecorded,true);assert.equal(removal.globalCaptureRecorded,false);
  assert.equal(query(`select a.asset_state='archived' and a.deleted_at=r.removed_at
    and r.removal_clock='server_observed_removal' and r.retain_until=r.removed_at+interval '720 hours'
    from public.platform_brand_assets a join private.platform_brand_object_incarnations r on r.asset_id=a.id where a.id=${lit(id)}`),'t');
  if(mature) {
   // EXPLICIT DISPOSABLE-SQL TIME WARP, not actual elapsed 720-hour evidence.
   // Only synthetic receipt clocks/snapshot move, before byte observation.
   // Production immutable guards remain unchanged; fresh-not-due is separate.
   query(`begin;
    alter table private.platform_brand_object_incarnations disable trigger brand_retention_immutable;
    alter table public.platform_brand_assets disable trigger aaa_platform_brand_retention;
    alter table private.platform_brand_empty_authorizations disable trigger empty_evidence_immutable;
    alter table private.platform_brand_empty_owner_removals disable trigger empty_evidence_immutable;
    update private.platform_brand_object_incarnations set removed_at=removed_at-interval '721 hours',
      retain_until=retain_until-interval '721 hours' where asset_id=${lit(id)};
    update public.platform_brand_assets a set deleted_at=r.removed_at
      from private.platform_brand_object_incarnations r where a.id=r.asset_id and a.id=${lit(id)};
    update private.platform_brand_empty_authorizations set authorized_at=authorized_at-interval '721 hours' where asset_id=${lit(id)};
    update private.platform_brand_empty_owner_removals set operation_started_at=operation_started_at-interval '721 hours',
      recorded_at=recorded_at-interval '721 hours',snapshot=private.platform_brand_empty_snapshot(${lit(id)}) where asset_id=${lit(id)};
    alter table private.platform_brand_object_incarnations enable trigger brand_retention_immutable;
    alter table public.platform_brand_assets enable trigger aaa_platform_brand_retention;
    alter table private.platform_brand_empty_authorizations enable trigger empty_evidence_immutable;
    alter table private.platform_brand_empty_owner_removals enable trigger empty_evidence_immutable;
    commit;`);
  }
  assert.equal(query(`select private.platform_brand_empty_owner_receipt_matches(${lit(id)})`),'t','exact intent and genuine receipt remain bound');
  assert.equal(query(globalFlagsOff),'t');
  assert.equal(query("select (select count(*) from private.deleted_content_records where target_type='platform_brand_asset')+(select count(*) from private.deleted_content_brand_delegations)+(select count(*) from private.deleted_content_retention_events where operation='capture' and target_type='platform_brand_asset')"),'0','no invented global capture, delegation or capture audit');
  const observation=JSON.parse(query(`select public.begin_platform_brand_empty_observation(${lit(id)})`));
  const result={protocol:'brand-empty-test-origin-v1',sha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
   sizeBytes:0,httpStatus:200,fullReadback:true,encoding:'identity',
   completedAt:query("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')")};
  const record=`select public.record_platform_brand_empty_disposition(${lit(observation.observationId)},${lit(observation.observationToken)},${lit(JSON.stringify(result))}::jsonb)`;
  if(recorded)assert.equal(JSON.parse(query(record)).recorded,true);
  return{id,objectId,key,job,observation,result,record};
 }
 query(`update private.platform_brand_retention_settings set expiry_enabled=true,writer_drain_evidence_sha256=repeat('e',64),
  reference_review_evidence_sha256=repeat('f',64),version_delete_verified=true,
  provider_origin='https://fixture.supabase.test',provider_contract_sha256=repeat('c',64);`);

 if(!negative) {
  for(const rollback of [false,true]) {
   const target=fixture({mature:false,removed:false});
   await ordered(target.remove,target.remove,(a,b)=>{
    assert.equal(b.code,0,b.stderr);
    const first=parsedOutput(a),second=parsedOutput(b);
    assert.equal(first.ownerRemovalReceiptRecorded,true);assert.equal(second.ownerRemovalReceiptRecorded,true);
    assert.equal(first.globalCaptureRecorded,false);assert.equal(second.globalCaptureRecorded,false);
    if(rollback)assert.notEqual(first.deletedAt,second.deletedAt,'rolled-back Owner removal clock cannot survive');
    else assert.deepEqual(first,second,'competing genuine Owner retries reuse the original removal clock');
   },{rollback});
   assert.equal(rows('private.platform_brand_empty_owner_removals',target.id),'1','one receipt survives commit or rollback contention');
   assert.equal(query(`select private.platform_brand_empty_owner_receipt_matches(${lit(target.id)})`),'t');
  }
  const fresh=fixture({mature:false});
  assert.equal(JSON.parse(query(claimSql(fresh))).status,'not_due','full 720-hour retention remains mandatory');
  assert.equal(rows('private.platform_brand_expiry_claims',fresh.id),'0');
  assert.equal(rows('private.platform_brand_empty_claim_evidence',fresh.id),'0');
  const readiness=JSON.parse(query('select public.deleted_content_expiry_readiness()'));
  assert.ok(readiness.platformBrandSupportedEmptyTestCount>=1,'capture-off bootstrap reaches truthful Brand evidence');
  assert.equal(readiness.ready,false,'unrelated global and worker blockers remain independent');
  assert.ok(readiness.blockers.includes('platform_brand_batch_not_enabled'));
  assert.ok(readiness.blockers.includes('legacy_object_delete_gate_open'));
  assert.ok(readiness.blockers.includes('consumer_rollout_not_qualified'));
  assert.equal(query(globalFlagsOff),'t');
  const f=fixture({recorded:false});
  await ordered(f.record,f.record,(a,b)=>{
   assert.equal(b.code,0,b.stderr);assert.deepEqual(parsedOutput(a),parsedOutput(b),'exact disposition retry is idempotent');
  });
  assert.equal(rows('private.platform_brand_empty_dispositions',f.id),'1');
  for(const rollback of [false,true]) {
   const target=fixture(),original=immutable(target);
   await ordered(claimSql(target),claimSql(target),(a,b)=>{
    assert.equal(b.code,0,b.stderr);
    const first=parsedOutput(a),second=parsedOutput(b);
    for(const c of [first,second]){assert.equal(c.status,'claimed');assert.equal(c.evidenceKind,'archived_empty_test');}
    if(rollback)assert.notEqual(first.claimToken,second.claimToken,'rolled-back claim and sidecar cannot survive');
    else assert.equal(first.claimToken,second.claimToken,'competitors converge on one exact typed claim');
   },{rollback});
   typedClaim(target);
   assert.equal(immutable(target),original,'claim must not rewrite source, scan history or disposition');
  }
  // Hold wins before the irreversible claim: the claim and sidecar must both
  // remain absent. If claim wins, the later hold is explicitly rejected, never
  // falsely reported as preserved after an irreversible claim.
  for(const holdFirst of [true,false]) {
   const f=fixture();
   const hold=`insert into public.legal_holds(target_type,target_id,reason,status)
    values('platform_brand_asset',${lit(f.id)},'Disposable native empty evidence ordering','active')`;
   await ordered(holdFirst?hold:claimSql(f),holdFirst?claimSql(f):hold,(_a,b)=>{
    if(holdFirst){assert.equal(b.code,0,b.stderr);assert.equal(parsedOutput(b).status,'held');}
    else{assert.notEqual(b.code,0);assert.match(b.stderr,/preservation_unavailable/);assert.doesNotMatch(b.stderr,/deadlock detected|statement timeout/i);}
   });
   assert.equal(rows('private.platform_brand_expiry_claims',f.id),holdFirst?'0':'1');
   assert.equal(rows('private.platform_brand_empty_claim_evidence',f.id),holdFirst?'0':'1');
  }
  // An attempted history change in an independent backend must queue behind
  // the claim and then fail at the immutable audit fence, not silently requeue.
  {
   const f=fixture(),original=immutable(f);
   await ordered(claimSql(f),`update public.media_scan_jobs set attempt_count=attempt_count+1 where id=${lit(f.job)}`,(_a,b)=>{
    assert.notEqual(b.code,0);assert.match(b.stderr,/brand_empty_history_permanent/);
    assert.doesNotMatch(b.stderr,/deadlock detected|statement timeout/i);
   });
   typedClaim(f);assert.equal(immutable(f),original);
  }
 }

 const f=fixture(),original=immutable(f);
 const claim=JSON.parse(query(claimSql(f)));assert.equal(claim.status,'claimed');typedClaim(f);
 const prepare=`select public.prepare_platform_brand_retention_dispatch(${lit(f.id)},${lit(claim.claimToken)})`;
 const signature='public.prepare_platform_brand_retention_dispatch(uuid,uuid)';
 const originalDispatch=query(`select pg_get_functiondef(${lit(signature)}::regprocedure)`);
 if(negative) {
  // Deliberately unsafe CLONE-ONLY mutant. Reusing an existing intent must be
  // caught by the SAME independent-backend contention oracle as the real code.
  assert.equal(cloned,true);
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
   assert.equal(authorizations,1,'empty_marker_replay_allowed');
   assert.equal(parsedOutput(b).status,'observe_only');
  });
 }catch(error){
  if(!negative||error.code!=='ERR_ASSERTION'||!error.message.includes('empty_marker_replay_allowed'))throw error;
  rejected=true;
 }finally{
  if(negative){query(originalDispatch);assert.equal(query(`select pg_get_functiondef(${lit(signature)}::regprocedure)`),originalDispatch);}
 }
 if(negative)assert.equal(rejected,true,'unsafe empty-evidence duplicate dispatch must be rejected');
 else {
  assert.equal(JSON.parse(query(prepare)).status,'observe_only','uncertain dispatch cannot replay');
  query(`begin;select public.record_platform_brand_retention_transport_result(${lit(f.id)},${lit(claim.claimToken)},'delete_acknowledged');rollback;`);
  assert.equal(JSON.parse(query(prepare)).status,'observe_only','rolled-back acknowledgment cannot reauthorize');
  assert.equal(query(`select count(*) from private.platform_brand_expiry_dispatch_intents where claim_token=${lit(claim.claimToken)}`),'1');
  assert.equal(immutable(f),original,'dispatch does not relabel or overwrite historical evidence');
  assert.equal(rows('private.platform_brand_object_proofs',f.id),'0','empty evidence never becomes clean proof');
  assert.equal(query(`select count(*) from private.media_scan_byte_receipts r join private.media_scan_byte_observations o on o.id=r.observation_id where o.job_id=${lit(f.job)}`),'0','no fabricated clean receipt');
 }
 assert.equal(query(globalFlagsOff),'t','claims and dispatch never enable global flags');
 console.log(`Brand empty evidence native PostgreSQL: ${negative?'unsafe replay mutant rejected':checks+' independent-backend controls passed'}; no provider or origin calls; synthetic disposition only, not live empty-byte evidence.`);
} finally {
  try {
 if(cloned)ok(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop generated clone');
 if(before!==undefined)assert.equal(query(fingerprint,'postgres'),before,'local source unchanged');
  } finally { cloneGuardRestore.assertSourceUnchanged(); }
}
