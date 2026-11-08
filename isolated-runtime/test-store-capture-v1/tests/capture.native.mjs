#!/usr/bin/env node
// Actual disposable PostgreSQL 17.6, synthetic provider bytes and credentials.
// No hosted API, real provider, production metadata or full commerce installation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { reviewedCaptureMigration, repoRoot } from '../install.mjs';
import { createCaptureCluster } from './cluster.mjs';
import { loadCapture, environment, connection, request, event, text, json } from './source-loader.mjs';

assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--local-bin');
const install=reviewedCaptureMigration(), h=createCaptureCluster(process.argv[3]), q=h.q;
const manifestPath='isolated-runtime/test-store-capture-v1/source-manifest.json';
install.sourceHashes[manifestPath]=createHash('sha256').update(fs.readFileSync(path.join(repoRoot,manifestPath))).digest('hex');
const s='rc_qualification_capture_v1', c=connection(), cases=[];
const managed=sql=>q('set session authorization postgres;'+sql);
const operator=sql=>q('set role rcq_v1_operator;'+sql);
const registrar=sql=>q('set role fixture_economic_registrar;'+sql);
const configureSql=`select ${s}.configure_capture('${c.connectionId}',1,${text(c.projectId)},${text(c.appId)},${text(c.authentication.keyVersion)},${text(c.encryption.keyId)});`;
const configure=()=>JSON.parse(operator(configureSql));
const transition=(phase,entries=32,deliveries=64,bytes=1048576)=>JSON.parse(operator(`select ${s}.test_store_qualification_transition(`
  +(phase==='capturing'?`${text(phase)},'${c.connectionId}',1,${entries},${deliveries},${bytes}`:text(phase))+');'));
const reserveSql=(project,binding='synthetic-consumer')=>`select ${s}.reserve_economic_project(${text(project)},${text(binding)});`;
const admission=(project=c.projectId,binding='synthetic-consumer')=>JSON.parse(q(`begin;set local transaction_timeout='4500ms';set local role rcq_v1_consumer;select ${s}.commerce_admission(${text(project)},${text(binding)});commit;`));
const gate=(raw=null,id=null,original=null,transaction=null,customer=null,project=c.projectId)=>q(`begin;set local transaction_timeout='4500ms';set local role rcq_v1_consumer;select ${s}.history_gate(`
  +[project,raw,id,original,transaction,customer].map(v=>v===null?'null':text(v)).join(',')+');commit;');
const history=project=>gate(null,null,null,null,null,project);
const expression=body=>`public.isolated_test_store_capture_ingest_v1(${text(body.p_connection_id)},${body.p_connection_revision},${json(body.p_envelope)},${json(body.p_observation)})`;
const ingest=body=>JSON.parse(q(`set role service_role;set request.jwt.claims='{"role":"service_role"}';select ${expression(body)};`));
let lastBody=null, uncertain=false;
const api=loadCapture(environment(),async(url,options)=>{
  assert.equal(String(url),'https://synthetic.invalid/rest/v1/rpc/isolated_test_store_capture_ingest_v1');
  lastBody=JSON.parse(options.body);const result=ingest(lastBody);
  if(uncertain)throw Error('synthetic committed but response lost');return Response.json(result);
});
const capture=async(raw=JSON.stringify(event()))=>{const response=await api.edge.handler(request(raw));return {status:response.status,result:await response.json()};};
const noEconomics=()=>{
  assert.equal(q("select to_regnamespace('sandbox_commerce_v1') is null and to_regnamespace('auth') is null;"),'t');
  assert.equal(q('select value from public.fixture_untouched;'),'unchanged');
};
const noInstalled=()=>{
  assert.equal(q(`select to_regnamespace('${s}') is null;`),'t');
  assert.equal(q("select count(*) from pg_roles where rolname in('rcq_v1_owner','rcq_v1_operator','rcq_v1_consumer');"),'0');
};
const record=async(name,fn)=>{h.freshDatabase();await fn();noEconomics();cases.push({name,passed:true});};
let engine, failure,cleanupFailure;
try {
  engine=h.start(`create role postgres login nosuperuser createrole noinherit nobypassrls;
    create role anon nologin;create role authenticated nologin;create role service_role nologin;`);
  // The local fixture administrator gives modeled postgres only its own DB/schema
  // installer capabilities. No Auth or commerce relation exists.
  q(`do $$begin execute format('grant create on database %I to postgres',current_database());end$$;
    alter schema public owner to postgres;
    create table public.fixture_untouched(value text);insert into public.fixture_untouched values('unchanged');
    alter default privileges for role postgres grant execute on functions to authenticated;`);
  for(const collision of [
    ['create role rcq_v1_operator nologin;','drop role rcq_v1_operator;'],
    [`create schema ${s};`,`drop schema ${s};`],
    ['create function public.isolated_test_store_capture_ingest_v1(uuid,integer,jsonb,jsonb) returns jsonb language sql as $$select null::jsonb$$;',
     'drop function public.isolated_test_store_capture_ingest_v1(uuid,integer,jsonb,jsonb);'],
  ]) {
    q(collision[0]);h.rejects('set session authorization postgres;'+install.sql,/already exists/u);q(collision[1]);noInstalled();
  }
  h.rejects('set session authorization postgres;'+install.sql.replace(/commit;\n$/u,"do $$begin raise exception 'late_capture_install_failure';end$$;commit;\n"),/late_capture_install_failure/u);noInstalled();
  cases.push({name:'Fresh role/schema/RPC collisions and late install failure roll back all new objects',passed:true});
  managed(install.sql);
  assert.equal(q("select rolsuper,rolcreaterole,rolbypassrls,rolinherit from pg_roles where rolname='postgres';"),'f|t|f|f');
  assert.equal(q(`select phase,max_entries,max_deliveries,max_total_bytes from ${s}.test_store_qualification_controls;`),'disabled|0|0|0');
  assert.equal(q(`select count(*) from ${s}.project_reservations;`),'0');
  h.rejects('set session authorization postgres;set role rcq_v1_owner;',/permission denied to set role/u);
  h.rejects('set session authorization postgres;set role rcq_v1_operator;',/permission denied to set role/u);
  assert.equal(q("select has_schema_privilege('rcq_v1_owner','public','CREATE');"),'f');
  cases.push({name:'Exact standalone source installs disabled as modeled NOSUPERUSER/NOBYPASSRLS postgres and removes installer SET authority',passed:true});

  h.rejects('set role rcq_v1_operator;'+reserveSql('ungranted-project'),/permission denied/u);
  // Explicit synthetic future composition privilege, absent from actual installer.
  q(`create role fixture_economic_registrar nologin;
    grant usage on schema ${s} to fixture_economic_registrar;
    grant execute on function ${s}.reserve_economic_project(text,text) to fixture_economic_registrar;`);
  await record('Private forced-RLS history and exact function grants reject caller-supplied service claims',async()=>{
    const tables=['project_reservations',...['connections','controls','entries','deliveries','exclusions','conflicts'].map(x=>'test_store_qualification_'+x)];
    for(const table of tables){
      assert.equal(q(`select relrowsecurity and relforcerowsecurity from pg_class where oid='${s}.${table}'::regclass;`),'t');
      for(const role of ['anon','authenticated','service_role','rcq_v1_operator','rcq_v1_consumer'])
        assert.equal(q(`select has_table_privilege('${role}','${s}.${table}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');`),'f');
    }
    for(const role of ['anon','authenticated','rcq_v1_operator','rcq_v1_consumer'])
      h.rejects(`set role ${role};set request.jwt.claims='{"role":"service_role"}';select public.isolated_test_store_capture_ingest_v1(null,null,null,null);`,/permission denied/u);
    h.rejects("set role service_role;set request.jwt.claims='{}';select public.isolated_test_store_capture_ingest_v1(null,null,null,null);",/capture_service_required/u);
    for(const role of ['anon','authenticated','service_role','rcq_v1_consumer'])
      h.rejects(`set role ${role};${configureSql}`,/permission denied/u);
  });
  await record('Unconfigured and disabled intake cannot acknowledge and capture FK prevents a missing reservation',async()=>{
    assert.equal((await capture()).status,503);configure();assert.equal((await capture()).status,503);
    assert.equal(admission().reason,'capture_reserved');
    h.rejects(`begin;alter table ${s}.project_reservations disable trigger immutable;delete from ${s}.project_reservations;commit;`,/foreign key constraint/u);
    assert.equal(q(`select count(*) from ${s}.project_reservations;`),'1');
    assert.equal((await capture()).status,503);
  });
  await record('Capture and future economics reserve one project exclusively in either sequential order',async()=>{
    registrar(reserveSql(c.projectId));assert.equal(admission().status,'not_capture');
    h.rejects('set role rcq_v1_operator;'+configureSql,/duplicate key/u);
    assert.equal(q(`select count(*) from ${s}.test_store_qualification_connections;`),'0');
    assert.equal(admission(c.projectId,'wrong').reason,'consumer_binding_mismatch');
    assert.equal(admission('unregistered-project').reason,'project_unreserved');
  });
  await record('Capture reservation survives clean seal and cannot be promoted by economic registration',async()=>{
    configure();h.rejects('set role fixture_economic_registrar;'+reserveSql(c.projectId),/duplicate key/u);
    transition('capturing');await capture();transition('sealed');
    assert.equal(admission().reason,'capture_reserved');
    h.rejects('set role fixture_economic_registrar;'+reserveSql(c.projectId),/duplicate key/u);
    for(const action of [`update ${s}.project_reservations set purpose='economic'`,`delete from ${s}.project_reservations`,`truncate ${s}.project_reservations cascade`])
      h.rejects(action+';',/capture_evidence_immutable/u);
    assert.throws(()=>transition('capturing'),/qualification_transition_forbidden/u);
  });
  await record('Actual entry crypto and committed PostgreSQL preserve exact bytes and all economic exclusion keys',async()=>{
    configure();transition('capturing');const raw='  '+JSON.stringify(event())+'\n', first=await capture(raw);
    assert.equal(first.status,200);assert.equal(first.result.authorityGranted,false);assert.equal(first.result.economicProjectionAllowed,false);
    const stored=JSON.parse(q(`select envelope from ${s}.test_store_qualification_entries where id=${text(first.result.entryId)};`));
    assert.equal(new TextDecoder().decode(await api.qualification.decryptQualificationEnvelope(stored,c)),raw);
    assert.equal((await capture(raw)).result.status,'duplicate');
    assert.equal(q(`select count(*) from ${s}.test_store_qualification_entries;`),'1');
    assert.equal(q(`select count(*) from ${s}.test_store_qualification_deliveries;`),'2');
    assert.equal(q(`select count(*) from ${s}.test_store_qualification_exclusions;`),'5');
    transition('sealed');assert.equal(gate(stored.rawSha256),'qualification_replay');assert.equal(gate(null,'synthetic-event'),'qualification_event_conflict');
    assert.equal(gate(null,null,'synthetic-original'),'qualification_economic_history');
    assert.equal(gate(null,null,null,'synthetic-transaction'),'qualification_economic_history');
    assert.equal(gate(null,null,null,null,'synthetic-customer'),'qualification_economic_history');
    assert.equal(admission().reason,'capture_reserved');
  });
  await record('Authenticated malformed Unicode and productless transfer retain independent subjects and project hold',async()=>{
    configure();transition('capturing');
    const raw='{"api_version":"1.0","event":{"id":"bad-unicode","type":"TRANSFER","app_user_id":"\\ud800","aliases":["valid-sibling","\\udc00"],"transferred_to":["valid-target"]}}';
    const result=await capture(raw);assert.equal(result.status,200);
    const row=JSON.parse(q(`select to_jsonb(e) from ${s}.test_store_qualification_entries e;`));
    assert.equal(row.lineage_unknown,true);assert.deepEqual(row.observation.customerIds,['valid-sibling','valid-target']);
    assert.equal(new TextDecoder().decode(await api.qualification.decryptQualificationEnvelope(row.envelope,c)),raw);
    transition('sealed');assert.equal(gate(),'qualification_unresolved');assert.equal(admission().reason,'capture_reserved');
  });
  await record('Uncertain committed acknowledgement reconciles through unchanged raw identity without retrying mutations',async()=>{
    configure();transition('capturing');uncertain=true;
    try{assert.equal((await capture()).status,503);}finally{uncertain=false;}
    assert.equal(q(`select count(*) from ${s}.test_store_qualification_entries;`),'1');
    assert.equal((await capture()).result.status,'duplicate');
    assert.equal(q(`select count(*) from ${s}.test_store_qualification_entries;`),'1');
  });
  await record('Capacity and immutable seal retain existing retries without fresh evidence or reopening',async()=>{
    configure();transition('capturing',1,1);assert.equal((await capture()).status,200);
    assert.equal((await capture()).status,503);const seal=transition('sealed');assert.match(seal.sealSha256,/^[a-f0-9]{64}$/u);
    assert.equal((await capture()).result.status,'sealed_duplicate');assert.equal((await capture(JSON.stringify(event({id:'new'})))).status,503);
    assert.equal(q(`select count(*) from ${s}.test_store_qualification_deliveries;`),'1');
    for(const table of ['entries','deliveries','exclusions','conflicts'])h.rejects(`truncate ${s}.test_store_qualification_${table} cascade;`,/capture_evidence_immutable/u);
  });
  await record('Independent database normalization refuses forged observations before acknowledgement',async()=>{
    configure();transition('capturing');await capture();const altered=structuredClone(lastBody);altered.p_observation.authorityGranted=true;
    assert.throws(()=>ingest(altered),/qualification_normalization_mismatch/u);
    const changed=structuredClone(lastBody);changed.p_envelope.originalObservationSha256='0'.repeat(64);
    assert.throws(()=>ingest(changed),/qualification_original_observation_invalid/u);
    assert.equal(q(`select count(*) from ${s}.test_store_qualification_deliveries;`),'1');
  });
  await record('Conflicting authenticated event bytes seal as unresolved retained evidence',async()=>{
    configure();transition('capturing');await capture();assert.equal((await capture(JSON.stringify(event({extra:'changed'})))).result.status,'conflict');
    transition('sealed');assert.equal(gate(),'qualification_unresolved');assert.equal(admission().reason,'capture_reserved');
    assert.equal(q(`select count(*) from ${s}.test_store_qualification_conflicts;`),'1');
  });
  await record('Concurrent capture reservation and economic reservation fail without waiting in either order',async()=>{
    for(const firstCapture of [true,false]){
      const first=await h.held('begin;set local role '+(firstCapture?'rcq_v1_operator':'fixture_economic_registrar')+';'+(firstCapture?configureSql:reserveSql(c.projectId)));
      try{const start=Date.now();h.rejects('set role '+(firstCapture?'fixture_economic_registrar':'rcq_v1_operator')+';'+(firstCapture?reserveSql(c.projectId):configureSql),/could not obtain lock/u);assert.ok(Date.now()-start<2000);}
      finally{await first.finish('rollback');}
      assert.equal(q(`select count(*) from ${s}.project_reservations;`),'0');
    }
  });
  await record('Capture control contention refuses capture ingress without obstructing a committed economic project',async()=>{
    configure();registrar(reserveSql('economic-project'));transition('capturing');
    const holder=await h.held(`begin;select singleton from ${s}.test_store_qualification_controls for update;`);
    try{
      assert.equal((await capture()).status,503);assert.equal(admission().reason,'capture_reserved');
      assert.equal(admission('economic-project').status,'not_capture');assert.equal(history('economic-project'),'not_qualification');
      assert.throws(()=>gate(),/could not obtain lock/u);
      q('begin;lock table public.fixture_untouched in access exclusive mode nowait;rollback;');
    }finally{await holder.finish('rollback');}
    assert.equal(q(`select count(*) from ${s}.test_store_qualification_entries;`),'0');
  });
  await record('Bounded consumer context rejects uncertainty while immutable project exclusion survives missing capture controls',async()=>{
    h.rejects(`set role rcq_v1_consumer;select ${s}.commerce_admission('p','b');`,/capture_consumer_context_invalid/u);
    h.rejects(`begin isolation level repeatable read;set local transaction_timeout='4500ms';set local role rcq_v1_consumer;select ${s}.commerce_admission('p','b');`,/capture_consumer_context_invalid/u);
    h.rejects('begin;set local transaction_timeout=8000;set local role rcq_v1_operator;'+configureSql,/capture_timeout_context_invalid/u);
    configure();registrar(reserveSql('economic-project'));
    q(`alter table ${s}.test_store_qualification_controls disable trigger monotonic;delete from ${s}.test_store_qualification_controls;`);
    assert.equal(admission().reason,'capture_reserved');assert.throws(()=>gate(),/query returned no rows/u);
    assert.equal(admission('unregistered').reason,'project_unreserved');assert.equal(history('unregistered'),'project_unreserved');
    assert.equal(admission('economic-project').status,'not_capture');assert.equal(history('economic-project'),'not_qualification');
  });
  await record('Actual admission holds only its committed project row while unrelated capture configuration proceeds',async()=>{
    registrar(reserveSql('economic-project'));
    const hold=()=>h.held(`begin;set local transaction_timeout='4500ms';set local role rcq_v1_consumer;select ${s}.commerce_admission('economic-project','synthetic-consumer');`);
    const holder=await hold();
    try{
      configure();registrar(reserveSql('other-project'));transition('capturing');transition('sealed');
      h.rejects(`begin;select project_id from ${s}.project_reservations where project_id='economic-project' for update nowait;`,/could not obtain lock/u);
      h.rejects('set role fixture_economic_registrar;'+reserveSql('economic-project'),/duplicate key/u);
      q('begin;lock table public.fixture_untouched in access exclusive mode nowait;rollback;');
    }finally{await holder.finish('rollback');}
    assert.equal(admission('economic-project').status,'not_capture');assert.equal(admission().reason,'capture_reserved');
  });
  await record('Actual start and seal transactions cannot obstruct another project or permit capture admission',async()=>{
    configure();registrar(reserveSql('economic-project'));
    for(const phase of ['capturing','sealed']){
      const call=`select ${s}.test_store_qualification_transition(`+(phase==='capturing'?`'capturing','${c.connectionId}',1,32,64,1048576`:`'sealed'`)+');';
      const holder=await h.held('begin;set local role rcq_v1_operator;'+call);
      try{
        assert.equal(admission('economic-project').status,'not_capture');assert.equal(history('economic-project'),'not_qualification');
        assert.equal(admission().reason,'capture_reserved');assert.throws(()=>gate(),/could not obtain lock/u);
      }finally{await holder.finish('commit');}
      assert.equal(admission('economic-project').status,'not_capture');assert.equal(admission().reason,'capture_reserved');
    }
  });
  await record('Declarative FK forbids capture connections to economic, unreserved or mismatched capture identities',async()=>{
    registrar(reserveSql('economic-project'));
    const insert=(project,id=c.connectionId,purpose='capture')=>`insert into ${s}.test_store_qualification_connections(id,revision,project_id,app_id,auth_key_version,storage_key_id,reservation_purpose) values(${text(id)},1,${text(project)},'app','auth','storage',${text(purpose)});`;
    h.rejects(insert('economic-project'),/foreign key constraint/u);h.rejects(insert('unreserved-project'),/foreign key constraint/u);
    h.rejects(insert('economic-project',c.connectionId,'economic'),/check constraint/u);
    q(`insert into ${s}.project_reservations(project_id,purpose,binding) values('synthetic-reserved','capture','22222222-2222-4222-8222-222222222222');`);
    h.rejects(insert('synthetic-reserved'),/foreign key constraint/u);
    assert.equal(q(`select count(*) from ${s}.test_store_qualification_connections;`),'0');
    assert.equal(admission('economic-project').status,'not_capture');
  });
  await record('Uncommitted capture or economic reservations remain unavailable and cannot be inferred from absent rows',async()=>{
    for(const captureFirst of [true,false]){
      const holder=await h.held('begin;set local role '+(captureFirst?'rcq_v1_operator':'fixture_economic_registrar')+';'+(captureFirst?configureSql:reserveSql(c.projectId)));
      try{assert.equal(admission().reason,'project_unreserved');assert.equal(history(c.projectId),'project_unreserved');}
      finally{await holder.finish('rollback');}
      assert.equal(admission().reason,'project_unreserved');
    }
  });
  await record('Exact project row contention fails closed without fencing a different committed economic project',async()=>{
    registrar(reserveSql('first-economic'));registrar(reserveSql('second-economic'));
    const holder=await h.held(`begin;select project_id from ${s}.project_reservations where project_id='first-economic' for update;`);
    try{
      assert.throws(()=>admission('first-economic'),/could not obtain lock/u);assert.throws(()=>history('first-economic'),/could not obtain lock/u);
      assert.equal(admission('second-economic').status,'not_capture');assert.equal(history('second-economic'),'not_qualification');
    }finally{await holder.finish('rollback');}
  });
  await record('Operator transaction timer survives RPC return and releases its reservation lock after expiry',async()=>{
    const start=Date.now(), holder=await h.held('begin;set local role rcq_v1_operator;'+configureSql);
    h.rejects('set role fixture_economic_registrar;'+reserveSql('different-project'),/could not obtain lock/u);
    // psql waits on its stdin pipe even after the server terminates the session.
    // A bounded follow-up makes it consume the server's real timeout response.
    await new Promise(resolve=>setTimeout(resolve,5500));holder.child.stdin.end('select 1;\n');
    const closed=await holder.done;assert.notEqual(closed.code,0);assert.match(closed.stderr,/transaction timeout/u);
    assert.ok(Date.now()-start>=4000 && Date.now()-start<10000);
    registrar(reserveSql(c.projectId));assert.equal(admission().status,'not_capture');
  });
  for(const [file,digest] of Object.entries(install.sourceHashes))
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(repoRoot,file))).digest('hex'),digest,'Source changed during proof: '+file);
} catch(error){failure=error;h.captureFailure();}finally{try{await h.close();}catch(error){cleanupFailure=error;}}
process.stdout.write(JSON.stringify({protocol:'rcq-native-proof-v1',engine,passed:!failure&&!cleanupFailure,
  syntheticProviderEvidence:true,providerOrProductionCalls:false,actualProviderAuthenticationProven:false,actualDeviceBehaviorProven:false,
  cases,sourceHashes:install.sourceHashes,installSqlSha256:install.sqlSha256,cleanup:h.cleanup,
  executedMigration:install.migrationPath,
  fixture:'NOSUPERUSER/NOBYPASSRLS modeled installer; no Auth/commerce SQL; synthetic provider bytes only',
  diagnostics:failure||cleanupFailure?h.diagnostics(failure,cleanupFailure):null},null,2)+'\n');
if(failure||cleanupFailure)process.exitCode=1;
