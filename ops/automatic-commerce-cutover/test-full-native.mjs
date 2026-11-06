#!/usr/bin/env node
// Full native rehearsal in a generated physical-template clone. Synthetic
// migration history/control fingerprints are local fixtures, never live proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {loadBundle,contract,buildBridgeSql,buildFinalizeSql,buildRestoreSql,readbackSql,seedReadbackSql,functionConstants,functionStateSQL,exactFinalHistorySQL,expectedConstants,sqlText,MAX_PAYLOAD_BYTES,MAX_PHYSICAL_LINE_BYTES} from './prepare.mjs';
import {catalogHashSQL} from './catalog.mjs';
import {sha256,literal,BRIDGE_FUNCTION,BRIDGE_TRIGGER} from './bridge.mjs';
import {expandedFunctionStateSQL,expandedFinalHistorySQL} from './expanded-verification.test-helper.mjs';
const bin=process.env.CUTOVER_PG_BINDIR,port=process.env.CUTOVER_PG_PORT??'55440';
const source=process.env.CUTOVER_TEMPLATE_DATABASE,capture=process.env.CUTOVER_BASELINE_CAPTURE;
assert.ok(path.isAbsolute(bin??''));assert.match(port,/^\d{4,5}$/u);
assert.match(source??'',/^automatic_deployment_[a-z_]+$/u);assert.ok(path.isAbsolute(capture??''));
assert.equal(process.argv.length,2,'No arbitrary target arguments');
const db=`cutover_full_${process.pid}_${randomUUID().replaceAll('-','').slice(0,8)}`;
const run=(sql,database=db)=>spawnSync(path.join(bin,'psql'),['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','postgres','-d',database],{input:sql,encoding:'utf8',maxBuffer:24*1024*1024,timeout:120000});
const query=(sql,database)=>{const r=run(sql,database);assert.equal(r.status,0,r.stderr?.slice(-12000));return r.stdout.trim();};
const json=sql=>JSON.parse(query(sql).split('\n').at(-1));
const reject=(sql,pattern)=>{const r=run(sql);assert.notEqual(r.status,0,'injected write unexpectedly succeeded');assert.match(r.stderr,pattern);};
let created=false;
const phaseTimings=[];
const timedQuery=(phase,sql)=>{const started=performance.now();query(sql);phaseTimings.push({phase,wallMs:Math.round(performance.now()-started)});};
try {
 assert.match(query('select version();','postgres'),/PostgreSQL 17\./u);
 query(`create database ${db} template ${source};`,'postgres');created=true;
 // Preserve the two observed legacy comments exactly. Chronological source
 // replay and historical alias deployment assigned these comments differently;
 // their definitions and all authorization attributes are identical. This
 // normalization is local-fixture-only; production tooling never comments them.
 for(const c of contract.catalog.preservedComments)query(`comment on function ${c.signature} is ${literal(c.comment)};`);
 query(`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text,rollback text[]);
 insert into supabase_migrations.schema_migrations(version,name,statements)
 select case when n=586 then '20261104032615' else (20240101000000::bigint+n)::text end,'synthetic_fixture_'||n,array['-- Synthetic history fixture only '||n] from generate_series(1,586) n;`);
 const plan=structuredClone(contract),fixtureHash=sha256(fs.readFileSync(new URL('./test-full-native.mjs',import.meta.url)));
 // This in-memory test plan cannot be saved or supplied to the production CLI.
 plan.qualification={status:'qualified',...Object.fromEntries(['nativeSemantics','fullNativeReplay','independentReview','closure'].map(k=>[k,{status:'passed',artifactSha256:fixtureHash,fixtureOnly:true}]))};
 plan.history.sha256=query("select encode(sha256(convert_to(jsonb_agg(jsonb_build_array(version,name,statements) order by version)::text,'UTF8')),'hex') from supabase_migrations.schema_migrations;");
 for(const [field,table,order] of [['moneySwitchesSha256','public.platform_money_kill_switches','key'],['sandboxCashoutControlSha256','private.sandbox_cashout_control','singleton'],['monetizationSettingsSha256','public.monetization_system_settings','id']])plan.controls[field]=query(`select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by ${order})::text,'[]'),'UTF8')),'hex') from ${table} t;`);
 const temp=[`function:${BRIDGE_FUNCTION}`,...plan.authorityRelations.map(t=>`trigger:${t}.${BRIDGE_TRIGGER}`)];
 plan.catalog.untouchedSha256=query(`set search_path=pg_catalog,public;select ${catalogHashSQL({exclude:[...plan.catalog.affectedKeys,...temp]})};`);
 const bundle=loadBundle(file=>fs.readFileSync(file,'utf8'),JSON.parse(fs.readFileSync(capture)),plan);
 const functions=functionConstants(bundle),constants=expectedConstants(bundle);
 const compactFunctionCheck=(data,phase='original')=>json(`set search_path=pg_catalog,public;with inputs as(select ${literal(JSON.stringify(data))}::jsonb cutover_functions) select to_jsonb((${functionStateSQL(bundle,phase)})) from inputs;`);
 const gateEquivalence=state=>{
  const observed=json(`set search_path=pg_catalog,public;with inputs as(select ${literal(constants.functions)}::jsonb cutover_functions,
   array(select jsonb_array_elements_text(${literal(constants.keys)}::jsonb->'affected')) cutover_affected_keys,
   array(select jsonb_array_elements_text(${literal(constants.keys)}::jsonb->'affected'))||array(select jsonb_array_elements_text(${literal(constants.keys)}::jsonb->'temporary')) cutover_ignored_keys)
  select jsonb_build_array((${functionStateSQL(bundle,'original')}),(${expandedFunctionStateSQL(bundle,'original')}),
   (${functionStateSQL(bundle,'bridge')}),(${expandedFunctionStateSQL(bundle,'bridge')}),(${expandedFinalHistorySQL(bundle)}),
   ${catalogHashSQL({include:plan.catalog.affectedKeys})}=${catalogHashSQL({includeReference:'cutover_affected_keys'})},
   ${catalogHashSQL({exclude:[...plan.catalog.affectedKeys,...temp]})}=${catalogHashSQL({excludeReference:'cutover_ignored_keys'})}) from inputs;`);
  assert.deepEqual(observed,[state.originalFunctions,state.originalFunctions,state.bridgeFunctions,state.bridgeFunctions,state.finalHistory,true,true]);
 };
 const changeConstant=(sql,key,edit)=>sql.replace(sqlText(constants[key]),()=>sqlText(JSON.stringify(edit(JSON.parse(constants[key])))));
 const holdOperation=async(phase,sql,outcome)=>{
  const marker=`held_${randomUUID()}`,started=performance.now();let stdout='',stderr='',exitCode;
  const child=spawn(path.join(bin,'psql'),['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','postgres','-d',db],{stdio:['pipe','pipe','pipe']});
  child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
  const closed=new Promise(resolve=>child.once('close',code=>{exitCode=code;resolve(code);}));
  try {
   assert.ok(sql.endsWith('commit;\n'));
   child.stdin.write(sql.slice(0,-8)+`select ${literal(marker)};\n`);
   while(!stdout.includes(marker)){
    assert.equal(exitCode,undefined,stderr);assert.ok(performance.now()-started<60000,'operation did not reach the pre-COMMIT hold');
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   const beforeCommitMs=Math.round(performance.now()-started);
   reject(readbackSql(bundle),/cutover_operation_in_progress/u);
   child.stdin.end(`${outcome};\n`);assert.equal(await closed,0,stderr);
   phaseTimings.push({phase:`${phase}-uncertain-${outcome}`,beforeCommitMs,wallMs:Math.round(performance.now()-started),includesPausedReadbackProbe:true});
  }finally{
   if(exitCode===undefined){child.stdin.end('rollback;\n');await closed;}
  }
 };
 const original=json(readbackSql(bundle));
 assert.equal(original.constants,true);assert.equal(original.operationGateHeld,true);gateEquivalence(original);
 reject(readbackSql(bundle).replace('begin isolation level read committed read only;','begin isolation level repeatable read read only;'),/cutover_readback_context_invalid/u);
 reject(readbackSql(bundle).replace('begin isolation level read committed read only;','begin isolation level read committed read write;'),/cutover_readback_context_invalid/u);
 for(const value of ['',"quotes'' \\\\ CRLF\r\n",'😺漢字e\u0301'.repeat(500),"'$automatic_cutover$ $function$ $$ $cutover_readback_gate$'",'x'.repeat(1799)+"'😺"+'y'.repeat(1801)])
  query(`set standard_conforming_strings=on;do $automatic_cutover$ declare value text:=${sqlText(value)};begin
   if octet_length(value)<>${Buffer.byteLength(value)} or encode(sha256(convert_to(value,'UTF8')),'hex')<>${literal(sha256(value))}
   then raise exception 'chunk_bytes_changed';end if;end $automatic_cutover$;`);
 assert.equal(original.originalFunctions,true,'all 407 function metadata/definitions must match');
 assert.equal(original.controls,true,'all preserved controls must match');assert.equal(original.baselineHistory,true);
 assert.equal(original.affectedCatalogSha256,plan.catalog.originalSha256,'same-source baseline affected catalog');
 const bridge=buildBridgeSql(bundle),restore=buildRestoreSql(bundle),final=buildFinalizeSql(bundle);
 for(const sql of [bridge,restore,final,readbackSql(bundle)]){
  assert.ok(Buffer.byteLength(sql)<=MAX_PAYLOAD_BYTES,'payload must retain SQL Editor size margin');
  assert.ok(sql.split(/\r\n|\r|\n/u).every(line=>Buffer.byteLength(line)<=MAX_PHYSICAL_LINE_BYTES),'all physical lines must be bounded');
 }
 for(const data of [[],functions.slice(1),[functions[0],...functions.slice(0,-1)],functions.map((f,i)=>i===0?null:f),
  functions.map((f,i)=>i===0?{...f,metadata:null}:f),functions.map((f,i)=>i===0?{...f,metadata:{...f.metadata,acl:null}}:f),
  functions.map((f,i)=>i===0?{...f,signature:'public.cutover_missing_function()'}:f)])assert.equal(compactFunctionCheck(data),false,'NULL, missing, duplicate and changed expected functions reject');
 for(const edit of [()=>[],x=>x.slice(1),x=>[x[0],...x.slice(0,-1)],x=>x.map((f,i)=>i===0?{...f,metadata:null}:f)])
  reject(changeConstant(bridge,'functions',edit),/cutover_expected_constants_changed/u);
 for(const edit of [x=>({...x,affected:[]}),x=>({...x,affected:x.affected.slice(1)}),x=>({...x,affected:[x.affected[0],...x.affected.slice(0,-1)]})])
  reject(changeConstant(bridge,'keys',edit),/cutover_expected_constants_changed/u);
 assert.deepEqual(json(readbackSql(bundle)),original,'malformed constants cannot install a partial bridge');
 reject(bridge.replace("statement_timeout='50s'","statement_timeout='50ms'").replace('untouched_before:=','perform pg_sleep(0.2);untouched_before:='),/statement timeout/u);
 assert.deepEqual(json(readbackSql(bundle)),original,'server timeout preserves original state');
 reject(bridge.replace('execute result;','execute result;perform 1/0;'),/division by zero/u);
 assert.deepEqual(json(readbackSql(bundle)),original,'failed bridge is completely atomic');
 await holdOperation('bridge',bridge,'rollback');assert.deepEqual(json(readbackSql(bundle)),original,'in-flight bridge rollback gives fresh original state');
 timedQuery('bridge',bridge);const bridged=json(readbackSql(bundle));gateEquivalence(bridged);assert.equal(bridged.bridgeFunctions,true);assert.equal(bridged.bridgePresent,true);assert.equal(bridged.controls,true);assert.equal(bridged.historyCount,586);
 timedQuery('restore',restore);const restored=json(readbackSql(bundle));gateEquivalence(restored);assert.deepEqual(restored,original,'exact recovery preserves all source/catalog/control/history');
 await holdOperation('bridge',bridge,'commit');assert.deepEqual(json(readbackSql(bundle)),bridged,'in-flight bridge commit gives fresh bridged state');
 for(const edit of [()=>[],x=>x.slice(1),x=>[x[0],...x.slice(0,-1)],x=>x.map((m,i)=>i===0?{...m,source:m.source+'-- changed\n'}:m),x=>x.map((m,i)=>i===0?{...m,name:'changed_identity'}:m)])
  reject(changeConstant(final,'migrations',edit),/cutover_expected_constants_changed/u);
 const changedBody=JSON.parse(constants.migrations);changedBody[0].body_sha256='0'.repeat(64);const changedText=JSON.stringify(changedBody);
 reject(final.replace(sqlText(constants.migrations),()=>sqlText(changedText)).replace(literal(sha256(constants.migrations)),()=>literal(sha256(changedText))),/cutover_migration_constant_changed/u);
 reject(final.replace("statement_timeout='50s'","statement_timeout='50ms'").replace('untouched_before:=','perform pg_sleep(0.2);untouched_before:='),/statement timeout/u);
 assert.deepEqual(json(readbackSql(bundle)),bridged,'constant/body rejection and server timeout preserve exact bridge');
 reject(final.replace('insert into supabase_migrations.schema_migrations','perform 1/0;insert into supabase_migrations.schema_migrations'),/division by zero/u);
 assert.deepEqual(json(readbackSql(bundle)),bridged,'mid-migration failure leaves exact bridge, no partial migration/history');
 reject(final.replace('untouched_before:=','execute \'create table private.cutover_unrelated_marker(id integer)\';untouched_before:='),/cutover_original_catalog_not_restored|cutover_final_postcheck_failed|cutover_bridge_changed/u);
 assert.deepEqual(json(readbackSql(bundle)),bridged,'unexpected catalog mutation cannot commit');
 await holdOperation('finalize',final,'rollback');assert.deepEqual(json(readbackSql(bundle)),bridged,'in-flight final rollback gives fresh bridged state');
 await holdOperation('finalize',final,'commit');const after=json(readbackSql(bundle));gateEquivalence(after);
 assert.equal(after.finalHistory,true);assert.equal(after.historyCount,599);assert.equal(after.bridgeAbsent,true);assert.equal(after.controls,true);
 assert.equal(after.affectedCatalogSha256,plan.catalog.finalSha256);assert.equal(after.untouchedCatalogSha256,original.untouchedCatalogSha256);
 for(const value of ["statements||array['unexpected extra element']",'array[]::text[]','array[null]::text[]']){
  const mutated=json(`begin;update supabase_migrations.schema_migrations set statements=${value} where version=${literal(bundle.migrations.at(-1).version)};
   with inputs as(select ${sqlText(constants.migrations)}::jsonb cutover_migrations)
   select jsonb_build_array((${exactFinalHistorySQL(bundle)}),(${expandedFinalHistorySQL(bundle)})) from inputs;rollback;`);
  assert.deepEqual(mutated,[false,false],'missing, NULL and extra history elements must reject in both implementations');
 }
 assert.deepEqual(json(readbackSql(bundle)),after,'history mutation tests roll back completely');
 assert.deepEqual(json(seedReadbackSql),{observerDisabled:true,observationJobs:0,declarations:0});
 console.log(JSON.stringify({schema:1,status:'passed',native:true,fixtureOnly:true,baseline:'full chronological source replay with managed-service stubs and synthetic history/control fingerprints',functions:bundle.functions.length,migrations:bundle.migrations.length,
  bridgeBytes:Buffer.byteLength(bridge),finalBytes:Buffer.byteLength(final),restoreBytes:Buffer.byteLength(restore),
  readbackBytes:Buffer.byteLength(readbackSql(bundle)),phaseTimings,
  fixturePayloadSha256:Object.fromEntries(Object.entries({bridge,finalize:final,restore,readback:readbackSql(bundle)}).map(([key,value])=>[key,sha256(value)])),
  maxPhysicalLineBytes:Object.fromEntries(Object.entries({bridge,finalize:final,restore,readback:readbackSql(bundle)}).map(([key,value])=>[key,Math.max(...value.split(/\r\n|\r|\n/u).map(line=>Buffer.byteLength(line)))])),
  payloadBinding:'These hashes bind prepared synthetic history/control fixture payloads. Uncertain-operation cases add only a pre-COMMIT observation marker and hold, then commit or roll back. Target payloads are separately source-bound.',
  generatorSourceSha256:sha256(fs.readFileSync(new URL('./prepare.mjs',import.meta.url))),
  catalogSourceSha256:sha256(fs.readFileSync(new URL('./catalog.mjs',import.meta.url))),
  budgets:{statementMs:50000,lockMs:3000,idleTransactionMs:15000,scope:'Per server statement; all mutations are in one outer DO. Not an HTTP or downtime guarantee.'},
  originalAffectedSha256:original.affectedCatalogSha256,finalAffectedSha256:after.affectedCatalogSha256,
  tests:['407 complete metadata/definition checks','expanded/compact function, history and catalog predicates agree at all four phase boundaries','NULL, missing, empty, duplicated and changed function/key/migration constants reject','all payloads below 900000 bytes and physical lines below 2048 bytes','flat chunks reconstruct exact Unicode, quote, dollar, newline and boundary bytes in native PostgreSQL','server statement timeouts preserve original/bridge states','actual emitted bridge/final pre-COMMIT holds reject concurrent readback; commit and rollback yield fresh committed states','atomic bridge failure','complete bridge and exact recovery','atomic mid-migration rollback','unexpected catalog mutation rejected','all 13 original history identities and statement bytes; NULL, missing and extra history elements rejected','exact final affected catalog and unchanged remainder','dormant observer and empty initial declarations'],
  sourceSha256:fixtureHash},null,2));
} finally {if(created)query(`drop database ${db};`,'postgres');}
