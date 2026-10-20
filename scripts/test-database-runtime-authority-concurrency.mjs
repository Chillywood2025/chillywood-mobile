#!/usr/bin/env node
// Real PostgreSQL backends, observed blocking and independently committed
// authority changes. Only a disposable clone of LOCAL Supabase is writable.
// No remote URL, provider call, mocked authority predicate or trigger bypass.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {runProfileMediaReportConcurrency} from './profile-media-report-concurrency-cases.mjs';
import {runExactSubjectAuthorityHttpQualification} from './lib/exact-subject-authority-http.mjs';
import {runOwnerSecurityGrantConcurrency} from './test-owner-security-grant-concurrency.mjs';

if(process.argv.includes('--help')){
  console.log('Run after local Supabase reset: node scripts/test-database-runtime-authority-concurrency.mjs. Optional SUPABASE_DB_CONTAINER must name a local supabase_db_* CLI container. Creates and drops only its generated disposable clone; remote endpoints are rejected.');
  process.exit(0);
}
assert.equal(process.argv.length,2,'no database URL or positional arguments accepted');
const root=process.cwd();
const projectId=readFileSync(path.join(root,'supabase/config.toml'),'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"\s*(?:#.*)?$/mu)?.[1];
assert.ok(projectId,'safe local Supabase project_id required');
const container=process.env.SUPABASE_DB_CONTAINER||`supabase_db_${projectId}`;
assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}`;
assert.match(database,/^runtime_authority_[0-9]+_[a-f0-9]{12}$/u);
const literal=x=>`'${String(x).replaceAll("'","''")}'`;
const psqlArgs=(target=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',target];
const docker=(args,input,encoding='utf8')=>spawnSync('docker',args,{cwd:root,encoding,input,maxBuffer:256*1024*1024,timeout:120_000});
const success=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message||String(r.stderr||'').replaceAll(/[A-Za-z0-9_-]{40,}/gu,'<redacted>')}`);return r.stdout};
const query=(sql,target=database)=>success(docker(psqlArgs(target),`set statement_timeout='15s';set timezone='UTC';${sql}`),'local PostgreSQL query').trim();
const admin=(args,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','runtime-authority-admin',...args],input,encoding);
function openSession(name,sql){
  const child=spawn('docker',psqlArgs(),{cwd:root,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',x=>{stdout+=x});child.stderr.on('data',x=>{stderr+=x});
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}))});
  child.stdin.write(`set application_name=${literal(name)};set timezone='UTC';${sql}\n`);
  return {child,done,output:()=>stdout};
}
async function waitUntil(predicate,label){
  const deadline=Date.now()+15_000;
  while(Date.now()<deadline){if(predicate())return;await delay(25)}
  throw new Error(`native authority queue timeout: ${label}`);
}
async function terminate(name,session){
  if(!session||session.child.exitCode!==null)return;
  query(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${literal(name)} and pid<>pg_backend_pid();`);
  session.child.kill('SIGTERM');await Promise.race([session.done,delay(1000)]);
}
const claimSql=person=>`set local role authenticated;
  select set_config('request.jwt.claim.role','authenticated',true);
  select set_config('request.jwt.claims',${literal(JSON.stringify({role:'authenticated',sub:person.user,session_id:person.session,email:person.email}))},true);`;
const callSql=(person,target,key)=>`select public.admin_grant_platform_role_by_email(${literal(target.email)},'moderator','Native runtime authority queue',${literal(key)})::text;`;
function seedPerson(){
  const person={user:randomUUID(),session:randomUUID()};person.email=`runtime-${person.user}@example.test`;
  query(`insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values(${literal(person.user)},${literal(person.email)},now(),false,false);
    insert into auth.sessions(id,user_id,not_after) values(${literal(person.session)},${literal(person.user)},now()+interval '1 day');
    insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
      select ${literal(person.user)}::uuid,public.wave1_sha256(${literal(person.user)}),d.document_key,d.version,d.market,'member',d.capability,${literal(person.session)},'service_reconciliation'
      from public.wave1_legal_document_versions d where d.active and d.market='UNITED_STATES' and d.capability='account';`);
  return person;
}
function seedRole(person,role){query(`insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
  values(${literal(role)},${literal(person.user)},${literal(person.email)},'active','Native queue fixture','test');`)}
function seedScope(person){query(`insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason,granted_by)
  values(${literal(person.user)},${literal(person.email)},'manage_moderators','active','Native queue fixture','test');`)}
function effects(person,target){return JSON.parse(query(`select jsonb_build_object(
  'roles',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.platform_role_memberships r where r.user_id=${literal(target.user)} and r.role='moderator'),'[]'::jsonb),
  'audits',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.platform_staff_role_audit a where a.actor_user_id=${literal(person.user)}),'[]'::jsonb),
  'adminAudits',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.platform_admin_audit_logs a where a.actor_user_id=${literal(person.user)}),'[]'::jsonb),
  'receipts',coalesce((select jsonb_agg(to_jsonb(r) order by r.operation_key) from public.privileged_mutation_operation_receipts r where r.actor_user_id=${literal(person.user)}),'[]'::jsonb))::text;`))}
let checks=0;
async function queueCase({label,boundary='advisory',change='none',replay=false,operator=false,self=false,allow=false}){
  const person=seedPerson(),target=self?person:seedPerson();
  seedRole(person,operator?'operator':'owner');if(operator||self){if(self)seedRole(person,'operator');seedScope(person)}
  const key=`staff-role-grant:${randomUUID().replaceAll('-','')}`;
  const call=callSql(person,target,key);
  if(replay){
    const result=query(`begin;${claimSql(person)}${call}commit;`);
    assert.match(result,/"idempotent": false/u,'valid prior receipt setup');
  }
  const before=effects(person,target);
  const holderName=`runtime-holder-${checks}-${process.pid}`,waiterName=`runtime-waiter-${checks}-${process.pid}`;
  let holder,waiter;
  const holderSql=boundary==='advisory'
    ? `select pg_advisory_xact_lock(hashtextextended(${literal(`staff-role-grant:${person.user}:${key}`)},0));`
    : `lock table public.${boundary==='audit'?'platform_staff_role_audit':'privileged_mutation_operation_receipts'} in share mode;`;
  const isBlocked=()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${literal(holderName)}
    where w.datname=current_database() and h.datname=current_database() and w.application_name=${literal(waiterName)}
      and w.pid<>h.pid and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`)==='1';
  try{
    holder=openSession(holderName,`begin;set local statement_timeout='35s';${holderSql}select 'HOLDER_READY';`);
    await waitUntil(()=>holder.output().includes('HOLDER_READY'),`${label}: holder ready`);
    waiter=openSession(waiterName,`begin;set local statement_timeout='35s';${claimSql(person)}${call}commit;\n\\q`);
    waiter.child.stdin.end();await waitUntil(isBlocked,`${label}: exact real blocker`);
    assert.equal(query(`select count(distinct pid) from pg_stat_activity where datname=current_database() and application_name in (${literal(holderName)},${literal(waiterName)});`),'2','two distinct backend sessions');
    if(change==='session-delete')assert.equal(query(`delete from auth.sessions where id=${literal(person.session)} returning id;`),person.session,'exact session deletion committed');
    else if(change==='account-delete')assert.equal(query(`update auth.users set deleted_at=clock_timestamp() where id=${literal(person.user)} returning id;`),person.user,'exact account soft deletion committed');
    else if(change==='legal-invalidate')assert.ok(Number(query(`update public.wave1_legal_acceptances set invalidated_at=clock_timestamp() where user_id=${literal(person.user)};
      select count(*) from public.wave1_legal_acceptances where user_id=${literal(person.user)} and invalidated_at is not null;`))>0,'actual caller legal acceptance invalidated');
    else if(change==='role-revoke')assert.equal(query(`update public.platform_role_memberships set status='revoked' where user_id=${literal(person.user)} and role=${literal(operator?'operator':'owner')} returning status;`),'revoked','exact role revocation committed');
    else if(change==='scope-revoke')assert.equal(query(`update public.platform_staff_permission_grants set status='revoked' where target_user_id=${literal(person.user)} and permission_key='manage_moderators' returning status;`),'revoked','exact scope revocation committed');
    else if(change.endsWith('-expiry')){
      const descriptor=change==='session-expiry'
        ? {table:'auth.sessions',column:'not_after',where:`id=${literal(person.session)}`}
        : change==='scope-expiry'
          ? {table:'public.platform_staff_permission_grants',column:'expires_at',where:`target_user_id=${literal(person.user)} and permission_key='manage_moderators'`}
          : {table:'public.platform_role_memberships',column:'expires_at',where:`user_id=${literal(person.user)} and role=${literal(operator?'operator':'owner')}`};
      // Valid finite grants go through real triggers. Waiter began before cutoff;
      // observe wall-clock expiry while its actual lock wait remains in place.
      query(`update ${descriptor.table} set ${descriptor.column}=clock_timestamp()+interval '500 milliseconds' where ${descriptor.where};`);
      assert.equal(query(`select w.xact_start<t.${descriptor.column} from pg_stat_activity w cross join ${descriptor.table} t
        where w.datname=current_database() and w.application_name=${literal(waiterName)} and ${descriptor.where};`),'t','waiter transaction began before authority cutoff');
      await waitUntil(()=>query(`select clock_timestamp()>=${descriptor.column} from ${descriptor.table} where ${descriptor.where};`)==='t',`${label}: observed cutoff`);
    }
    assert.equal(isBlocked(),true,`${label}: still blocked after authority change`);
    holder.child.stdin.end('commit;\n\\q\n');
    const [held,result]=await Promise.all([holder.done,waiter.done]);assert.equal(held.code,0,held.stderr);
    if(allow){
      assert.equal(result.code,0,result.stderr);assert.match(result.stdout,new RegExp(`"idempotent": ${replay?'true':'false'}`,'u'));
      const after=effects(person,target);
      if(replay)assert.deepEqual(after,before,'receipt replay creates no mutation');
      else{
        assert.equal(after.roles.length,before.roles.length+1,'one exact target role');assert.equal(after.audits.length,before.audits.length+1,'one audit');assert.equal(after.adminAudits.length,before.adminAudits.length+1,'one admin audit');assert.equal(after.receipts.length,before.receipts.length+1,'one receipt');
        const role=after.roles.at(-1),audit=after.audits.find(x=>!before.audits.some(y=>y.id===x.id)),receipt=after.receipts.find(x=>x.operation_key===key);
        assert.deepEqual({user_id:role.user_id,email:role.email,role:role.role,status:role.status,granted_by:role.granted_by},
          {user_id:target.user,email:target.email,role:'moderator',status:'active',granted_by:person.user},'role binds exact actor and target');
        assert.deepEqual({actor_user_id:audit.actor_user_id,target_email:audit.target_email,action:audit.action,role:audit.role},
          {actor_user_id:person.user,target_email:target.email,action:'grant',role:'moderator'},'audit binds same exact grant');
        if(!label.startsWith('captured-live'))assert.equal(audit.metadata.target_user_id,target.user,'audit immutable target binding');
        assert.equal(receipt.actor_user_id,person.user);assert.equal(receipt.operation_family,'staff_role_grant');
        assert.deepEqual(receipt.request_fingerprint,{target_email:target.email,target_role:'moderator',reason:'Native runtime authority queue'},'receipt exact request');
        assert.equal(receipt.result_payload.userId,target.user);assert.equal(receipt.result_payload.role,'moderator');assert.equal(receipt.result_payload.status,'active');
        assert.equal(String(receipt.result_payload.id),String(role.id));assert.equal(receipt.result_target_id,String(role.id),'receipt exact role result');
        if(change==='none'){
          assert.match(query(`begin;${claimSql(person)}${call}commit;`),/"idempotent": true/u,'valid retry retained');
          assert.deepEqual(effects(person,target),after,'valid retry no duplicate effects');
        }
      }
    }else{
      assert.notEqual(result.code,0,`${label}: unauthorized queued operation succeeded`);
      const expectedError=change.startsWith('session-')||['account-delete','legal-invalidate'].includes(change)?'platform_staff_auth_required':'platform_staff_permission_denied';
      assert.match(result.stderr,new RegExp(`ERROR:\\s+${expectedError}(?:\\r?\\n|$)`,'u'),'exact intended authority denial, not infrastructure error');
      assert.deepEqual(effects(person,target),before,'queued denial rolls back target role, audit and receipt');
    }
    checks++;console.log(`PASS ${label}: observed ${boundary} lock, ${change}, ${allow?'allowed exact contract':'all mutation effects rolled back'}`);
  }finally{await terminate(holderName,holder);await terminate(waiterName,waiter)}
}
const sourceFingerprintSql=`select jsonb_build_object('users',(select count(*) from auth.users),'sessions',(select count(*) from auth.sessions),
  'roles',(select count(*) from public.platform_role_memberships),'audits',(select count(*) from public.platform_staff_role_audit),
  'receipts',(select count(*) from public.privileged_mutation_operation_receipts),
  'wrapper',md5(pg_get_functiondef('public.admin_grant_platform_role_by_email(text,text,text,text)'::regprocedure)))::text;`;
const repairPath=path.join(root,'supabase/migrations/20261015220128_runtime_authority_forward_repair.sql');
const repairSql=readFileSync(repairPath,'utf8');
let cloned=false,sourceFingerprint;
try{
  if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u,'remote Docker forbidden');
  assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker required').trim(),/^(unix|npipe):\/\//u,'remote Docker context forbidden');
  const containers=success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'local Supabase discovery').trim().split('\n');
  assert.ok(containers.includes(container),'selected local CLI database is not running');
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261015220128');",'postgres'),'t','local source must have reset through repair');
  sourceFingerprint=query(sourceFingerprintSql,'postgres');
  success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create generated disposable clone');cloned=true;
  success(docker(psqlArgs(),'create schema vault;create extension supabase_vault with schema vault;'),'initialize clone extension');
  const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql',
    '--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
  success(dump,'read-only local source export');success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],dump.stdout,null),'restore disposable clone');
  // Captured-live negative controls run only inside the disposable clone.
  // The 4-argument wrapper was unchanged in the captured17-function overlay;
  // recover its exact pre-repair body from the immutable source migration too.
  query(readFileSync(path.join(root,'tests/fixtures/database-runtime-production-20261015.sql'),'utf8'));
  const prior=readFileSync(path.join(root,'supabase/migrations/20260912235910_preproduction_adversarial_product_integrity_closure.sql'),'utf8');
  const start=prior.indexOf('create or replace function public."admin_grant_platform_role_by_email"(');
  assert.ok(start>=0);const end=prior.indexOf('$$;',start);assert.ok(end>start);query(prior.slice(start,end+3));
  await queueCase({label:'captured-live new grant outlives session',change:'session-expiry',allow:true});
  await queueCase({label:'captured-live receipt outlives session',change:'session-expiry',replay:true,allow:true});
  await queueCase({label:'captured-live final receipt outlives owner',boundary:'receipt',change:'role-expiry',allow:true});
  await queueCase({label:'captured-live final receipt outlives scope',boundary:'receipt',change:'scope-expiry',operator:true,allow:true});
  query(repairSql);
  for(const boundary of ['advisory','receipt']){
    await queueCase({label:`repaired valid ${boundary} queued grant`,boundary,allow:true});
    for(const change of ['session-expiry','session-delete','account-delete','legal-invalidate'])await queueCase({label:`repaired ${boundary} ${change}`,boundary,change});
  }
  for(const change of ['session-expiry','session-delete'])await queueCase({label:`repaired queued receipt ${change}`,change,replay:true});
  for(const change of ['role-expiry','role-revoke'])await queueCase({label:`repaired final receipt ${change}`,boundary:'receipt',change});
  for(const change of ['scope-expiry','scope-revoke'])await queueCase({label:`repaired final receipt ${change}`,boundary:'receipt',change,operator:true});
  for(const boundary of ['audit','receipt'])await queueCase({label:`repaired ${boundary} owner-to-operator self fallback`,boundary,change:'role-expiry',self:true});
  await queueCase({label:'repaired valid scoped operator queue',boundary:'receipt',operator:true,allow:true});
  await queueCase({label:'repaired valid historical receipt queue',replay:true,allow:true});
  await queueCase({label:'actor-bound prior receipt survives role-only expiry',change:'role-expiry',replay:true,allow:true});
  assert.equal(checks,25,'all declared old-control, denial and positive queue cases executed');
  await runProfileMediaReportConcurrency({query,literal,claimSql,seedPerson,seedRole,openSession,waitUntil,terminate});
  await runExactSubjectAuthorityHttpQualification({container,database});
  await runOwnerSecurityGrantConcurrency({container,database,query,literal,openSession,waitUntil,terminate});
  console.log(`Runtime authority native PostgreSQL: ${checks} deterministic queue cases passed; SQL SHA256 ${createHash('sha256').update(repairSql).digest('hex')}`);
}finally{
  if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop only generated disposable clone');
  if(sourceFingerprint!==undefined)assert.equal(query(sourceFingerprintSql,'postgres'),sourceFingerprint,'local source database changed');
}
