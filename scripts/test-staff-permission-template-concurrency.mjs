#!/usr/bin/env node
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
// Real PostgreSQL sessions and observed lock queues, never mocked authority.
// Only a generated disposable clone of a local Supabase CLI database is writable.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {randomUUID, createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

if (process.argv.includes('--help')) {
  console.log('After local Supabase reset, run node scripts/test-staff-permission-template-concurrency.mjs. Optional SUPABASE_DB_CONTAINER selects a local supabase_db_* CLI container. No remote URLs accepted; only a generated disposable clone is changed and dropped.');
  process.exit(0);
}
assert.equal(process.argv.length, 2, 'no database URLs or positional arguments accepted');
const root = process.cwd();
const project = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"\s*(?:#.*)?$/mu)?.[1];
assert.ok(project, 'safe local Supabase project_id required');
const container = process.env.SUPABASE_DB_CONTAINER || `supabase_db_${project}`;
assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const cloneGuardRestore = createBrandGuardCloneRestorer({container});
const database = `template_queue_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
assert.match(database, /^template_queue_[0-9]+_[a-f0-9]{12}$/u);
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const psqlArgs = (target = database) => ['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', target];
const docker = (args, input, encoding = 'utf8') => spawnSync('docker', args, {cwd: root, input, encoding, maxBuffer: 256 * 1024 * 1024, timeout: 120_000});
const success = (result, label) => {
  assert.equal(result.status, 0, `${label}: ${result.error?.message || String(result.stderr || '').replaceAll(/[A-Za-z0-9_-]{40,}/gu, '<redacted>')}`);
  return result.stdout;
};
const query = (sql, target = database) => success(docker(psqlArgs(target), `${target === 'postgres' ? 'set default_transaction_read_only=on;' : ''}set statement_timeout='15s';set timezone='UTC';${sql}`), 'local PostgreSQL query').trim();
const admin = (args, input, encoding = 'utf8') => docker(['exec', ...(input === undefined ? [] : ['-i']), container, 'sh', '-lc', 'PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"', 'template-queue-admin', ...args], input, encoding);
const claims = person => `set local role authenticated;set local request.jwt.claim.role='authenticated';set local request.jwt.claims=${literal(JSON.stringify({role: 'authenticated', sub: person.user, session_id: person.session, email: person.email}))};`;
let checks = 0;
function openSession(name, sql, finish = false) {
  const child = spawn('docker', psqlArgs(), {cwd: root, stdio: ['pipe', 'pipe', 'pipe']});
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', value => { stdout += value; });
  child.stderr.on('data', value => { stderr += value; });
  const done = new Promise(resolve => {
    child.on('error', error => resolve({code: -1, stdout, stderr: error.message}));
    child.on('close', code => resolve({code, stdout, stderr}));
  });
  // Do not leave an idle transaction forever if an assertion or runner fails.
  child.stdin.on('error', () => {});
  child.stdin.write(`set application_name=${literal(name)};set timezone='UTC';begin;set local statement_timeout='40s';set local idle_in_transaction_session_timeout='60s';${sql}\n`);
  if (finish) child.stdin.end('commit;\n\\q\n');
  return {child, done, output: () => stdout};
}
async function waitUntil(predicate, label) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) { if (predicate()) return; await delay(25); }
  throw new Error(`template queue timeout: ${label}`);
}
async function terminate(name, session) {
  if (!session || session.child.exitCode !== null) return;
  query(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${literal(name)} and pid<>pg_backend_pid();`);
  session.child.kill('SIGTERM');
  await Promise.race([session.done, delay(1000)]);
}
function blocked(holder, waiter) {
  return query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${literal(holder)}
    where w.datname=current_database() and h.datname=current_database() and w.application_name=${literal(waiter)}
    and w.pid<>h.pid and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`) === '1';
}
function seedPerson(role) {
  const person = {user: randomUUID(), session: randomUUID(), role};
  person.email = `template-${person.user}@example.test`;
  query(`insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values(${literal(person.user)},${literal(person.email)},now(),false,false);
    insert into auth.sessions(id,user_id,not_after) values(${literal(person.session)},${literal(person.user)},now()+interval '1 day');
    insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
    select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,
      coalesce(nullif(lower(trim(p.channel_role)),''),'member'),d.capability,s.id::text,'service_reconciliation'
    from auth.sessions s left join public.user_profiles p on p.user_id=s.user_id::text
    cross join public.wave1_legal_document_versions d where s.id=${literal(person.session)}
      and d.active and d.market='UNITED_STATES' and d.capability='account';
    ${role ? `insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
      values(${literal(role)},${literal(person.user)},${literal(person.email)},'active','Synthetic template fixture','test');` : ''}`);
  return person;
}

const reason='Synthetic permission template concurrency';
function seedFixture() {
  const actor=seedPerson('operator'),target=seedPerson('moderator');
  query(`insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason)
    values(${literal(actor.user)},${literal(actor.email)},'staff_permission_templates','active',${literal(reason)}),
      (${literal(target.user)},${literal(target.email)},'evidence_export','active',${literal(reason)});`);
  return {actor,target};
}
const call=(fixture,operation='apply')=>`select public.admin_mutate_staff_permission_template(${literal(operation)},
  ${literal(fixture.target.email)},${literal(fixture.target.user)},'moderator',${literal(reason)})::text;`;
const snapshot=fixture=>JSON.parse(query(`select jsonb_build_object(
  'grants',(select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]') from public.platform_staff_permission_grants g where target_user_id=${literal(fixture.target.user)}),
  'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.platform_admin_audit_logs a where target_user_id=${literal(fixture.target.user)}))::text;`));
const deny=result=>{
  assert.notEqual(result.code,0,'queued call denied');
  assert.match(result.stderr,/ERROR:\s+(staff_permission_template_auth_required|staff_permission_templates_required|target_admin_required|platform_exact_confirmed_subject_required|staff_permission_template_subject_changed|staff_permission_template_authority_changed)/u);
  assert.ok(!result.stdout.includes('"ok": true'),'denied operation emits no success');
};

async function orderingCase(firstOperation,secondOperation) {
  const fixture=seedFixture();
  const secondActor=seedPerson('operator');
  query(`insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason)
    values(${literal(secondActor.user)},${literal(secondActor.email)},'staff_permission_templates','active',${literal(reason)});`);
  const holderName=`template-order-holder-${checks}-${process.pid}`,waiterName=`template-order-waiter-${checks}-${process.pid}`;
  let holder,waiter;
  try {
    holder=openSession(holderName,`${claims(fixture.actor)}${call(fixture,firstOperation)}select 'HOLDER_READY';`);
    await waitUntil(()=>holder.output().includes('HOLDER_READY'),'first actual RPC uncommitted');
    waiter=openSession(waiterName,`${claims(secondActor)}${call(fixture,secondOperation)}`,true);
    await waitUntil(()=>blocked(holderName,waiterName),'second actual RPC queued on first transaction');
    holder.child.stdin.end('commit;\n\\q\n');
    const results=await Promise.all([holder.done,waiter.done]);
    for(const result of results) {assert.equal(result.code,0,result.stderr);assert.ok(result.stdout.includes('"ok": true'));}
    const final=snapshot(fixture);
    const selected=final.grants.filter(g=>g.permission_key!=='evidence_export'&&g.status==='active');
    assert.equal(selected.length,secondOperation==='apply'?5:0,'final state follows committed serialization order');
    assert.equal(new Set(selected.map(g=>g.permission_key)).size,selected.length,'no duplicate active template grants');
    assert.equal(final.grants.find(g=>g.permission_key==='evidence_export').status,'active','unrelated grant survives');
    assert.equal(final.audit.length,2,'one audit per committed template operation');
    checks++;console.log(`PASS actual ${firstOperation} then ${secondOperation} serialize`);
  } finally {await terminate(holderName,holder);await terminate(waiterName,waiter);}
}

async function queueCase(change,auditBoundary=false) {
  const fixture=seedFixture(),before=snapshot(fixture);
  const holderName=`template-holder-${checks}-${process.pid}`,waiterName=`template-waiter-${checks}-${process.pid}`;
  let holder,waiter,expiry;
  const descriptor=()=>{
    if(change==='session-expiry')return {table:'auth.sessions',column:'not_after',where:`id=${literal(fixture.actor.session)}`};
    if(change==='manager-expiry')return {table:'public.platform_staff_permission_grants',column:'expires_at',where:`target_user_id=${literal(fixture.actor.user)} and permission_key='staff_permission_templates' and status='active'`};
    const subject=change==='target-expiry'?fixture.target:fixture.actor;
    return {table:'public.platform_role_memberships',column:'expires_at',where:`user_id=${literal(subject.user)} and status='active'`};
  };
  const setExpiry=seconds=>{
    expiry=descriptor();
    query(`update ${expiry.table} set ${expiry.column}=clock_timestamp()+interval '${seconds} seconds' where ${expiry.where};`);
  };
  try {
    holder=openSession(holderName,`${auditBoundary?'lock table public.platform_admin_audit_logs in share mode;':
      `select pg_advisory_xact_lock(hashtextextended('platform-staff-permission:'||${literal(fixture.target.user)},0));`}select 'HOLDER_READY';`);
    await waitUntil(()=>holder.output().includes('HOLDER_READY'),'lock holder ready');
    if(auditBoundary)setExpiry(5);
    waiter=openSession(waiterName,`${claims(fixture.actor)}${call(fixture)}`,true);
    await waitUntil(()=>blocked(holderName,waiterName),'actual RPC blocked by independent holder PID');
    if(change==='session-revoke')query(`delete from auth.sessions where id=${literal(fixture.actor.session)};`);
    else if(change==='manager-revoke')query(`update public.platform_staff_permission_grants set status='revoked' where target_user_id=${literal(fixture.actor.user)};`);
    else if(change==='actor-revoke'||change==='target-revoke')query(`update public.platform_role_memberships set status='revoked' where user_id=${literal((change==='actor-revoke'?fixture.actor:fixture.target).user)};`);
    else if(change==='target-email')query(`update auth.users set email='changed-${fixture.target.user}@example.test' where id=${literal(fixture.target.user)};`);
    else if(change.endsWith('-expiry')) {
      if(!auditBoundary)setExpiry(0.5);
      assert.equal(query(`select w.xact_start<t.${expiry.column} from pg_stat_activity w cross join ${expiry.table} t
        where w.datname=current_database() and w.application_name=${literal(waiterName)} and ${expiry.where};`),'t','transaction began before wall-clock expiry');
      await waitUntil(()=>query(`select clock_timestamp()>=${expiry.column} from ${expiry.table} where ${expiry.where};`)==='t','authority expired while still queued');
    }
    assert.equal(blocked(holderName,waiterName),true,'RPC still queued after authority change');
    holder.child.stdin.end('commit;\n\\q\n');
    const [held,result]=await Promise.all([holder.done,waiter.done]);assert.equal(held.code,0,held.stderr);
    if(change==='none') {assert.equal(result.code,0,result.stderr);assert.equal(snapshot(fixture).audit.length,1);}
    else {deny(result);assert.deepEqual(snapshot(fixture),before,'failed queued operation leaves no grant or audit changes');}
    checks++;console.log(`PASS ${auditBoundary?'audit':'target advisory'} wait ${change}`);
  } finally {await terminate(holderName,holder);await terminate(waiterName,waiter);}
}

const migration=readFileSync(path.join(root,'supabase/migrations/20261020141826_transactional_staff_permission_templates.sql'),'utf8');
const fingerprintSql=`select jsonb_build_object('users',(select count(*) from auth.users),'sessions',(select count(*) from auth.sessions),
 'roles',(select count(*) from public.platform_role_memberships),'grants',(select count(*) from public.platform_staff_permission_grants),
 'audits',(select count(*) from public.platform_admin_audit_logs),
 'rpc',md5(pg_get_functiondef('public.admin_mutate_staff_permission_template(text,text,uuid,text,text,timestamptz,uuid)'::regprocedure)))::text;`;
let cloned=false,sourceFingerprint;
try {
  if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u,'remote Docker forbidden');
  assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker required').trim(),/^(unix|npipe):\/\//u,'remote Docker context forbidden');
  const containers=success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'local CLI discovery').trim().split('\n');
  assert.ok(containers.includes(container),'selected local Supabase CLI database must be running');
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261020141826');",'postgres'),'t','reset local source through template migration first');
  sourceFingerprint=query(fingerprintSql,'postgres');
  success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create only generated disposable clone');cloned=true;
  success(docker(psqlArgs(),'create schema vault;create extension supabase_vault with schema vault;'),'initialize clone extension');
  const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql',
    '--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
  success(dump,'read-only local source export');
  success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database], cloneGuardRestore.prepare(dump.stdout, database), null),'restore disposable clone');
  for(const pair of [['apply','apply'],['apply','revoke'],['revoke','apply']])await orderingCase(...pair);
  for(const change of ['none','session-revoke','manager-revoke','actor-revoke','target-revoke','target-email',
    'session-expiry','manager-expiry','actor-expiry','target-expiry'])await queueCase(change);
  for(const change of ['session-expiry','manager-expiry','actor-expiry','target-expiry'])await queueCase(change,true);
  assert.equal(checks,17,'all declared two-backend queue cases executed');
  console.log(`Template native PostgreSQL: ${checks} deterministic cases passed; migration SHA256 ${createHash('sha256').update(migration).digest('hex')}`);
} finally {
  try {
  if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop only generated disposable clone');
  if(sourceFingerprint!==undefined)assert.equal(query(fingerprintSql,'postgres'),sourceFingerprint,'local source database changed');
  } finally { cloneGuardRestore.assertSourceUnchanged(); }
}
