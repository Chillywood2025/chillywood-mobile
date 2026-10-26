#!/usr/bin/env node
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
// Independent PostgreSQL sessions, only generated LOCAL Supabase clones.
// Cluster SIGKILL tests use a separate owned no-network container, never the
// shared Supabase cluster. This is not hardware power-loss/anti-rollback proof.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {loadQualificationModule,fixtureNow,assertProposalUnchanged,qualificationMigrationSource,
  fixtureAdmissionClockSQL,qualificationCatalogFingerprintSQL,assertClockOnlyCatalogChange,
  existingDatabaseFingerprintSQL} from '../tests/helpers/r2-qualification-fixture.mjs';
import {createSyntheticQualificationR2,assertRestoredQualificationFence} from '../tests/helpers/r2-qualification-r2-fixture.mjs';
const {initialState,runQualification}=loadQualificationModule('r2-disposable-qualification.ts');
const {createQualificationRunStore}=loadQualificationModule('r2-disposable-qualification-store.ts');
const {RUN_ID,OBJECTS,MUTATION_RECEIPTS,manifestHash,sha256}=loadQualificationModule('r2-disposable-qualification-manifest.ts');
if(process.argv.includes('--help')){
  console.log('Run after local Supabase reset and pgTAP. Generated disposable local clones only; no remote database URL or provider transport.');process.exit(0);
}
assert.equal(process.argv.length,2);
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/m)?.[1];
assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER||`supabase_db_${project}`;
assert.equal(container,`supabase_db_${project}`,'exact local checkout container');
const cloneGuardRestore = createBrandGuardCloneRestorer({container});
const prefix=`r2_qual_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}`;
const baseline=`${prefix}_base`,marker=`r2-qualification-disposable:${randomUUID()}`;
const created=new Set(),sessions=new Set();let serial=0,checks=0,sourceBefore,sourceQualificationBefore,crashContainer;
const hash=await manifestHash(),initial=await initialState();
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const json=x=>`${lit(JSON.stringify(x))}::jsonb`;
const checked=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message||String(r.stderr).replaceAll(/[A-Za-z0-9_-]{40,}/g,'<redacted>').slice(-2000)}`);return r.stdout;};
const docker=(args,input,encoding='utf8')=>spawnSync('docker',args,{input,encoding,maxBuffer:256*1024*1024,timeout:120000});
const allowed=db=>{assert.ok(created.has(db),'mutation only in database created by this invocation');return db;};
const args=db=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const query=(db,sql)=>checked(docker(args(db=== 'postgres'?db:allowed(db)),
  `${db==='postgres'?'set default_transaction_read_only=on;':''}set statement_timeout='20s';set timezone='UTC';${sql}`),'local SQL').trim();
const admin=(command,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc',
  'PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','r2-qualification-admin',...command],input,encoding);
const dump=db=>checked(admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault',
  '--exclude-extension=pg_graphql','--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime',
  '--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public',db],undefined,null),'read-only local dump');
function create(template,{empty=false}={}) {
  const db=template||empty?`${prefix}_${++serial}`:baseline;
  assert.match(db,/^r2_qual_[0-9]+_[0-9a-f]{12}_(base|[0-9]+)$/);
  if(template)allowed(template);
  checked(docker(['exec',container,'createdb','-U','postgres','-T',template||'template0',db]),'create generated disposable database');
  created.add(db);query(db,`comment on database ${db} is ${lit(marker)};`);return db;
}
function createRestored(bytes) {
  const db=`${prefix}_${++serial}`;
  checked(docker(['exec',container,'createdb','-U','postgres','-T','template0',db]),'create fresh restore database');
  created.add(db);query(db,`comment on database ${db} is ${lit(marker)};create schema vault;create extension supabase_vault with schema vault;`);
  checked(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',allowed(db)],cloneGuardRestore.prepare(bytes, allowed(db)),null),'restore generated database');
  return db;
}
const seed=db=>query(db,`insert into r2_qualification_test_private.run(state,setup_approval_ref) values(${json(initial)},'approved:offline-native-setup');`);
const read=db=>JSON.parse(query(db,`set role service_role;select public.read_r2_qualification_test_run(${lit(RUN_ID)},${lit(hash)});`));
const cas=(revision,state)=>`select public.cas_r2_qualification_test_run(${lit(RUN_ID)},${lit(hash)},${revision},${json(state)})`;
function session(db,sql,{finish=false}={}) {
  allowed(db);const name=`${prefix}_session_${++serial}`;
  const child=spawn('docker',args(db),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
  child.stdin.on('error',()=>{});
  const done=new Promise(resolve=>{child.on('error',e=>resolve({code:-1,stdout,stderr:e.message}));child.on('close',code=>resolve({code,stdout,stderr}));});
  const result={db,name,child,done,output:()=>stdout};sessions.add(result);
  child.stdin.write(`set application_name=${lit(name)};begin;set local statement_timeout='25s';set local idle_in_transaction_session_timeout='30s';set local role service_role;${sql};\n`);
  if(finish)child.stdin.end('commit;\n\\q\n');return result;
}
async function until(fn,label,watch=[]) {
  const end=Date.now()+15000;
  while(Date.now()<end){
    if(fn())return;
    assert.ok(watch.every(s=>s.child.exitCode===null),`${label}: session ended before required state`);
    await delay(25);
  }
  throw Error(`timeout: ${label}`);
}
async function terminate(s) {
  if(!s||s.child.exitCode!==null)return;
  allowed(s.db);
  query(s.db,`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database()
    and application_name=${lit(s.name)} and pid<>pg_backend_pid();`);
  await Promise.race([s.done,delay(2000)]);
  if(s.child.exitCode===null){s.child.kill('SIGTERM');await Promise.race([s.done,delay(1000)]);}
}
async function race(db,mode) {
  const next={...initial,revision:1,pending:'put_control',requestBudgetReserved:2};let h,w;
  try {
    h=session(db,`${cas(0,next)};select 'HOLDER_READY'`);
    await until(()=>h.output().includes('HOLDER_READY'),'holder owns intent row',[h]);
    w=session(db,cas(0,next),{finish:true});
    await until(()=>query(db,`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(h.name)}
      where w.datname=current_database() and h.datname=current_database() and w.application_name=${lit(w.name)}
      and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`)==='1','actual independent backend lock edge',[h,w]);
    if(mode==='terminate')await terminate(h);
    else {h.child.stdin.end(`${mode};\n\\q\n`);assert.equal((await h.done).code,0);}
    const result=await w.done;assert.equal(result.code,0,result.stderr);
    assert.equal(result.stdout.trim(),mode==='commit'?'f':'t');
    assert.equal(read(db).revision,1);assert.equal(read(db).pending,'put_control');checks++;
  } finally {await terminate(h);await terminate(w);}
}
function fixture(db,execute=query) {
  const calls=[],objects=new Map();
  const rpc=async(name,params)=>{
    assert.ok(['read_r2_qualification_test_run','cas_r2_qualification_test_run'].includes(name));
    const sql=name.startsWith('read_')?`select public.${name}(${lit(params.p_run_id)},${lit(params.p_manifest_hash)})`:
      `select public.${name}(${lit(params.p_run_id)},${lit(params.p_manifest_hash)},${params.p_expected_revision},${json(params.p_next_state)})`;
    const output=execute(db,`set role service_role;${sql};`);
    return {data:name.startsWith('read_')?(output?JSON.parse(output):null):output==='t',error:null};
  };
  const store=createQualificationRunStore(rpc),origin=async op=>{
    calls.push(op);const name=op.endsWith('_control')?'control':'target',observedAt=fixtureNow;
    if(op.startsWith('get_')){const payload=objects.get(name);return payload===undefined?{status:404,observedAt}:
      {status:200,observedAt,byteCount:payload.length,sha256:await sha256(new TextEncoder().encode(payload))};}
    if(op.startsWith('delete_')){objects.delete(name);return {status:204,observedAt};}
    if(objects.has(name))return {status:412,observedAt};objects.set(name,OBJECTS[name].payload);return {status:200,observedAt};
  };
  const deps={store,origin,now:()=>Date.parse(fixtureNow),cleanupApproved:false};
  return {calls,store,deps,rpc,run:action=>runQualification(action,deps)};
}
async function fencedRestoreProof() {
  // Actual SQL/adapter and pg_dump/restore, but a synthetic external R2 store.
  // Never restore/recreate that store alongside the database it is fencing.
  const db=create(baseline);seed(db);const p=createSyntheticQualificationR2(),f=fixture(db);
  const approval=target=>query(target,'select cleanup_approval_ref is not null from r2_qualification_test_private.run;')==='t';
  const snapshot=()=>({bytes:dump(db),state:read(db),cleanupApproved:approval(db)});
  const snapshots=[snapshot()];f.deps.origin=p.origin;
  f.deps.store=createQualificationRunStore(async(name,args)=>{
    const result=await f.rpc(name,args);
    if(name.startsWith('cas_')&&result.data===true)snapshots.push(snapshot());
    return result;
  });
  for(const action of ['prepare','read','conflict'])await f.run(action);
  query(db,"update r2_qualification_test_private.run set cleanup_approval_ref='approved:offline-native-fenced-cleanup';");
  snapshots.push(snapshot());f.deps.cleanupApproved=true;await f.run('cleanup');
  assert.equal(read(db).phase,'cleaned');assert.equal(p.protectedMutations.length,5);
  for(const saved of snapshots){
    const restoredDB=createRestored(saved.bytes),restored=fixture(restoredDB);
    restored.deps.origin=p.newOrigin();restored.deps.cleanupApproved=true;
    assert.deepEqual(await restored.store.read(),saved.state,'exact restored SQL state, not a broken adapter');
    assert.equal(approval(restoredDB),saved.cleanupApproved,'exact restored cleanup authority');
    await assertRestoredQualificationFence({provider:p,state:saved.state,run:restored.run,cleanupApproved:saved.cleanupApproved});
    assert.equal(p.protectedMutations.length,5,'no protected mutation is redispatched after any valid prefix restore');
    for(const o of Object.values(OBJECTS))assert.equal(p.objects.has(o.key),false);
    for(const r of Object.values(MUTATION_RECEIPTS))assert.equal(p.objects.get(r.key),r.payload);
    checks++;
  }
  assert.equal(snapshots.length,17,'initial, every committed CAS prefix, and cleanup approval snapshot');

  // Two independently restored databases cannot coordinate through their own
  // row locks. Their concrete signed origins must contend on the external model.
  const aDB=create(baseline),bDB=create(baseline);seed(aDB);seed(bDB);
  const shared=createSyntheticQualificationR2(),a=fixture(aDB),b=fixture(bDB);
  a.deps.origin=shared.origin;b.deps.origin=shared.newOrigin();
  let release,entered,first=true;
  const barrier=new Promise(resolve=>release=resolve),seen=new Promise(resolve=>entered=resolve);
  shared.before=async r=>{if(r.receipt&&first){first=false;entered();await barrier;}};
  const delayed=a.run('prepare');await seen;await b.run('prepare');release();
  await assert.rejects(delayed,/qualification_fence_not_acquired/);
  assert.equal(shared.protectedMutations.filter(r=>r.op==='put_control').length,1);
  assert.equal(shared.protectedMutations.filter(r=>r.op==='put_target').length,1);checks++;
  return {fencedPrefixRestores:snapshots.length,divergentDatabaseRaces:1,
    externalPreservationModel:true,liveReceiptProtectionQualified:false};
}
function clusterQuery(_db,sql) {
  assert.ok(crashContainer?.verified,'only our verified disposable cluster');
  return checked(docker(['exec','-i',crashContainer.id,'psql','-h','/tmp','-X','-q','-A','-t',
    '-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],`set statement_timeout='15s';${sql}`),'isolated crash cluster SQL').trim();
}
async function clusterReady() {
  await until(()=>docker(['exec',crashContainer.id,'pg_isready','-h','/tmp','-U','postgres']).status===0,'owned crash cluster ready');
}
async function crashAndRestart() {
  assert.equal(checked(docker(['inspect','--format','{{index .Config.Labels "r2-qualification-owner"}}',crashContainer.id]),'verify owned crash container').trim(),marker);
  // Exactly this owned, network-isolated container. Never stop/restart Supabase.
  checked(docker(['kill','--signal=KILL',crashContainer.id]),'crash only owned postmaster');
  checked(docker(['start',crashContainer.id]),'restart only owned postmaster');await clusterReady();
}
async function clusterCrashProof() {
  const image=checked(docker(['inspect','--format','{{.Image}}',container]),'existing local PostgreSQL image').trim();
  assert.match(image,/^sha256:[0-9a-f]{64}$/);
  const name=`${prefix}_crash`;
  const startup='set -eu; bin="$(pg_config --bindir)"; data=/tmp/r2-qualification-pgdata; '+
    'if [ ! -f "$data/PG_VERSION" ]; then "$bin/initdb" -D "$data" --auth-local=trust --auth-host=reject --no-locale --encoding=UTF8; fi; '+
    'exec "$bin/postgres" -D "$data" -c listen_addresses= -c unix_socket_directories=/tmp -c fsync=on -c synchronous_commit=on -c full_page_writes=on';
  // No image pull, inherited runtime environment, published port, host mount,
  // external network, live credentials or managed Supabase startup scripts.
  crashContainer={id:name,verified:false};
  const result=docker(['create','--pull=never','--name',name,'--label',`r2-qualification-owner=${marker}`,
    '--network','none','--user','postgres','--cap-drop=ALL','--security-opt=no-new-privileges',
    '--entrypoint','sh',image,'-lc',startup]);
  checked(result,'create owned isolated PostgreSQL container');
  assert.equal(checked(docker(['inspect','--format','{{index .Config.Labels "r2-qualification-owner"}}',name]),'verify container ownership').trim(),marker);
  const isolation=JSON.parse(checked(docker(['inspect','--format','{{json .HostConfig}}',name]),'verify cluster isolation'));
  assert.equal(isolation.NetworkMode,'none');assert.equal(isolation.Privileged,false);
  for(const field of ['Binds','Mounts','VolumesFrom'])assert.ok(!isolation[field]||isolation[field].length===0,'no host mounts or inherited volumes');
  assert.equal(Object.keys(isolation.PortBindings||{}).length,0,'no published ports');
  crashContainer.verified=true;
  checked(docker(['start',name]),'start owned cluster');await clusterReady();
  clusterQuery(null,'create role anon;create role authenticated;create role service_role;');
  clusterQuery(null,qualificationMigrationSource);
  assert.equal(clusterQuery(null,'select count(*) from r2_qualification_test_private.run;'),'0');
  clusterQuery(null,fixtureAdmissionClockSQL);
  assert.equal(clusterQuery(null,"select current_setting('fsync')||','||current_setting('synchronous_commit')||','||current_setting('full_page_writes');"),'on,on,on');
  clusterQuery(null,`insert into r2_qualification_test_private.run(state,setup_approval_ref) values(${json(initial)},'approved:offline-crash-setup');`);
  const pending={...initial,revision:1,pending:'put_control',requestBudgetReserved:2};
  clusterQuery(null,`set role service_role;${cas(0,pending)};`);
  await crashAndRestart();
  const pendingFixture=fixture(null,clusterQuery);
  assert.equal((await pendingFixture.run('prepare')).status,'pending_reconcile_required');
  assert.equal(pendingFixture.calls.length,0);checks++;
  // Do NOT reset that permanent row. A second fresh synthetic database tests the
  // terminal case on the same isolated cluster, with the same SQL and adapter.
  checked(docker(['exec',name,'createdb','-h','/tmp','-U','postgres','-T','template0','terminal_fixture']),'create owned terminal fixture');
  const terminalQuery=(_db,sql)=>{
    assert.ok(crashContainer.verified);
    return checked(docker(['exec','-i',name,'psql','-h','/tmp','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','terminal_fixture'],
      `set statement_timeout='15s';${sql}`),'isolated terminal SQL').trim();
  };
  terminalQuery(null,qualificationMigrationSource);
  assert.equal(terminalQuery(null,'select count(*) from r2_qualification_test_private.run;'),'0');
  terminalQuery(null,fixtureAdmissionClockSQL);
  terminalQuery(null,`insert into r2_qualification_test_private.run(state,setup_approval_ref) values(${json(initial)},'approved:offline-crash-setup');`);
  const terminal=fixture(null,terminalQuery);
  for(const action of ['prepare','read','conflict'])await terminal.run(action);
  terminalQuery(null,"update r2_qualification_test_private.run set cleanup_approval_ref='approved:offline-crash-cleanup';");
  terminal.deps.cleanupApproved=true;await terminal.run('cleanup');
  await crashAndRestart();
  const after=fixture(null,terminalQuery);assert.equal((await after.run('prepare')).status,'cleaned');
  assert.equal(after.calls.length,0);checks++;
}
try {
  if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//);
  assert.match(checked(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker required').trim(),/^(unix|npipe):\/\//);
  assert.ok(checked(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'local CLI discovery').split('\n').includes(container));
  sourceBefore=query('postgres',existingDatabaseFingerprintSQL);
  sourceQualificationBefore=query('postgres',qualificationCatalogFingerprintSQL);
  create();query(baseline,'create schema vault;create extension supabase_vault with schema vault;');
  checked(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',baseline],cloneGuardRestore.prepare(dump('postgres'), baseline),null),'restore full migrated baseline');
  const before=query(baseline,existingDatabaseFingerprintSQL);
  // Full local reset already applied the migration. Compare the restored ledger
  // to a pristine canonical install; never reapply CREATEs or drop its schema.
  const canonicalDB=create(undefined,{empty:true});
  query(canonicalDB,qualificationMigrationSource);
  assert.equal(query(canonicalDB,'select count(*) from r2_qualification_test_private.run;'),'0');
  assert.equal(query(baseline,qualificationCatalogFingerprintSQL),query(canonicalDB,qualificationCatalogFingerprintSQL),
    'full-reset clone contains exact canonical definitions, grants, RLS and no approval/run rows');checks++;
  // Only the generated clone receives the one admission-clock replacement.
  // Original Supabase remains unmodified and retains its real deadline clock.
  const canonicalCatalog=query(baseline,qualificationCatalogFingerprintSQL);
  query(baseline,fixtureAdmissionClockSQL);
  assertClockOnlyCatalogChange(canonicalCatalog,query(baseline,qualificationCatalogFingerprintSQL));
  assert.equal(query(baseline,existingDatabaseFingerprintSQL),before);checks++;
  const tap=query(baseline,readFileSync('tests/fixtures/r2-qualification-ledger.pgtap.sql','utf8'));
  assert.match(tap,/(^|\n)1\.\.12(\n|$)/);assert.doesNotMatch(tap,/(^|\n)not ok|Looks like you failed/);
  assert.equal(tap.split('\n').filter(s=>/^ok [0-9]+/.test(s)).length,12);checks+=12;
  for(const mode of ['commit','rollback','terminate']){const db=create(baseline);seed(db);await race(db,mode);}

  // Commit an intent, terminate its client, then reconnect through the real
  // adapter. No subsequent caller may recreate or infer a completed provider PUT.
  const pendingDB=create(baseline);seed(pendingDB);
  const pending={...initial,revision:1,pending:'put_control',requestBudgetReserved:2};
  const client=session(pendingDB,`${cas(0,pending)};commit;select 'INTENT_COMMITTED'`);
  await until(()=>client.output().includes('INTENT_COMMITTED'),'committed intent',[client]);await terminate(client);
  const pendingFixture=fixture(pendingDB);
  assert.equal((await pendingFixture.run('prepare')).status,'pending_reconcile_required');assert.equal(pendingFixture.calls.length,0);checks++;
  const restoredPending=createRestored(dump(pendingDB)),restoredPendingFixture=fixture(restoredPending);
  assert.equal((await restoredPendingFixture.run('prepare')).status,'pending_reconcile_required');assert.equal(restoredPendingFixture.calls.length,0);checks++;

  // Real committed SQL with a deliberately lost client acknowledgment.
  const lostDB=create(baseline);seed(lostDB);const lost=fixture(lostDB);let writes=0;
  lost.deps.store=createQualificationRunStore(async(name,args)=>{const result=await lost.rpc(name,args);
    if(name.startsWith('cas_')&&++writes===2)throw Error('synthetic lost committed completion acknowledgment');return result;});
  await assert.rejects(lost.run('prepare'),/qualification_store_unconfirmed/);
  lost.deps.store=lost.store;await lost.run('prepare');
  assert.equal(lost.calls.filter(op=>op==='put_control').length,1);checks++;

  const terminalDB=create(baseline);seed(terminalDB);const staleSnapshot=dump(terminalDB),terminal=fixture(terminalDB);
  for(const action of ['prepare','read','conflict'])await terminal.run(action);
  query(terminalDB,"update r2_qualification_test_private.run set cleanup_approval_ref='approved:offline-native-cleanup';");
  terminal.deps.cleanupApproved=true;await terminal.run('cleanup');
  const closed=session(terminalDB,"commit;select 'TERMINAL_RECONNECTED'");
  await until(()=>closed.output().includes('TERMINAL_RECONNECTED'),'terminal reconnect',[closed]);await terminate(closed);
  assert.equal(read(terminalDB).phase,'cleaned');checks++;
  const restoredTerminal=createRestored(dump(terminalDB)),current=fixture(restoredTerminal);
  assert.equal((await current.run('prepare')).status,'cleaned');assert.equal(current.calls.length,0);checks++;

  // NEGATIVE restore control: an old snapshot loses all subsequent intent and
  // tombstone history. Demonstrate the hazard instead of claiming anti-rollback.
  const restoredStale=createRestored(staleSnapshot),stale=fixture(restoredStale);
  assert.equal(read(restoredStale).phase,'new');await stale.run('prepare');
  assert.deepEqual(stale.calls,['put_control','put_target']);checks++;
  const fenced=await fencedRestoreProof();
  await clusterCrashProof();
  assertProposalUnchanged();
  console.log(JSON.stringify({status:'passed',checks,independentBackends:true,observedLockEdges:3,
    terminatedSessionCases:3,clusterCrashTest:true,clusterCrashCases:2,powerLossTest:false,syntheticClock:true,
    currentSnapshotPreserved:true,staleSnapshotReopensDemonstrated:true,restoreSafeNonreuse:false,...fenced,
    providerRequests:0,liveDatabaseWrites:0}));
} finally {
  try {
  if(crashContainer){
    const owner=docker(['inspect','--format','{{index .Config.Labels "r2-qualification-owner"}}',crashContainer.id]);
    if(owner.status===0){assert.equal(owner.stdout.trim(),marker,'never remove unowned container');
      checked(docker(['rm','--force','--volumes',crashContainer.id]),'remove only own synthetic crash container and its anonymous image volumes');}
    else assert.ok(/No such (object|container)/i.test(owner.stderr),'owned container cleanup outcome unconfirmed');
  }
  for(const s of sessions)await terminate(s);
  for(const db of [...created].reverse()){
    assert.equal(query(db,"select shobj_description(oid,'pg_database') from pg_database where datname=current_database();"),marker,'drop only own generated database');
    checked(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',db]),'drop own disposable database');created.delete(db);
  }
  if(sourceBefore!==undefined)assert.equal(query('postgres',existingDatabaseFingerprintSQL),sourceBefore,'original local source unchanged');
  if(sourceQualificationBefore!==undefined)assert.equal(query('postgres',qualificationCatalogFingerprintSQL),sourceQualificationBefore,'original local qualification schema, clock and rows unchanged');
  assertProposalUnchanged();
  } finally { cloneGuardRestore.assertSourceUnchanged(); }
}
