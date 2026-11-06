#!/usr/bin/env node
// Reproducible, source-only native qualification. Uses either an installed local
// PostgreSQL or the existing local Supabase container's official binaries, but
// ALWAYS creates a separate empty cluster with no production credentials/data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../../tests/helpers/database-runtime-authority-fixture.mjs';
import {contract} from './prepare.mjs';
import {literal,sha256} from './bridge.mjs';

const [mode,argument]=process.argv.slice(2);
assert.ok(process.argv.length===4&&['--local-bin','--docker'].includes(mode),'Usage: run-native.mjs --local-bin /absolute/official/pg/bin OR --docker supabase_db_NAME');
const nonce=randomUUID().replaceAll('-',''),directory=fs.mkdtempSync(path.join(os.tmpdir(),'automatic-cutover-native-'));
const internal=`/tmp/automatic-cutover-native-${nonce}`,port='55441',database='automatic_deployment_ci';
const psqlArguments=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','postgres'];
const shellLiteral=x=>`'${x.replaceAll("'","'\\''")}'`;
const invoke=(command,args,input,timeout=180000)=>{const r=spawnSync(command,args,{input,encoding:'utf8',timeout,maxBuffer:32*1024*1024});assert.equal(r.status,0,`${command}: ${r.error?.message??r.stderr?.slice(-10000)}`);return r.stdout;};
let server=false,bindir,data,admin,cleanup;
const start=Date.now();
try {
 if(mode==='--local-bin'){
  assert.ok(path.isAbsolute(argument));bindir=argument;data=path.join(directory,'data');
  admin=(tool,args)=>invoke(path.join(bindir,tool),args);
  admin('initdb',['-D',data,'-U','postgres','--encoding=UTF8','--no-locale','--auth=trust']);
  cleanup=()=>{};
 }else{
  assert.match(argument,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
  if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u);
  assert.match(invoke('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}']).trim(),/^(unix|npipe):\/\//u);
  assert.ok(invoke('docker',['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']).trim().split('\n').includes(argument),'Only the discovered local CLI container may supply native binaries');
  const nativeBin=invoke('docker',['exec','--user','postgres',argument,'pg_config','--bindir']).trim();assert.match(nativeBin,/^\/[A-Za-z0-9_./-]+$/u);
  data=internal+'/data';admin=(tool,args)=>invoke('docker',['exec','--user','postgres',argument,path.posix.join(nativeBin,tool),...args]);
  invoke('docker',['exec','--user','postgres',argument,'mkdir','-p',internal]);
  admin('initdb',['-D',data,'-U','postgres','--encoding=UTF8','--no-locale','--auth=trust']);
  bindir=path.join(directory,'bin');fs.mkdirSync(bindir);
  fs.writeFileSync(path.join(bindir,'psql'),`#!/bin/sh\nexec docker exec -i --user postgres ${shellLiteral(argument)} ${shellLiteral(path.posix.join(nativeBin,'psql'))} "$@"\n`,{mode:0o700});
  cleanup=()=>invoke('docker',['exec','--user','postgres',argument,'rm','-rf','--',internal]);
 }
 // Only this generated cluster has controlled autovacuum scheduling. Production
 // settings and the existing Supabase cluster remain completely untouched.
 admin('pg_ctl',['-D',data,'-l',mode==='--docker'?internal+'/server.log':path.join(directory,'server.log'),'-o',`-c unix_socket_directories='' -c listen_addresses='127.0.0.1' -p ${port} -c max_prepared_transactions=0 -c autovacuum=off`,'start']);server=true;
 const query=(sql,db='postgres')=>invoke(path.join(bindir,'psql'),[...psqlArguments,'-d',db],sql);
 query(`create database ${database};`);
 const heldVersions=['20261102093836','20261102094308','20261104120922','20261105010859'];
 const files=fs.readdirSync('supabase/migrations'),held=heldVersions.map(v=>{const found=files.filter(f=>f.startsWith(v+'_'));assert.equal(found.length,1);return found[0];});
 const sql=[];
 // The adapter only accumulates source SQL. No PGlite instance is constructed;
 // every statement below is executed by the real PostgreSQL server.
 const {replayReport}=await createDatabase({excludeMigrations:[...contract.migrations.map(m=>path.basename(m.path)),...held],databaseFactory:async()=>({async exec(statement){sql.push(statement);},async close(){}})});
 query(sql.join('\n'),database);
 const expected=contract.functions.map(f=>({signature:f.signature,expected:f.originalSha256}));
 const capture=query(`set search_path=pg_catalog,public;select jsonb_agg(jsonb_build_object('signature',f.signature,'definition',pg_get_functiondef(p.oid),
 'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'expectedSha256',f.expected,
 'matches',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=f.expected) order by f.signature)
 from jsonb_to_recordset(${literal(JSON.stringify(expected))}::jsonb) f(signature text,expected text) left join pg_proc p on p.oid=to_regprocedure(f.signature);`,database).trim();
 const captured=JSON.parse(capture);assert.equal(captured.length,contract.functions.length);assert.ok(captured.every(f=>f.matches===true),'Source-reconstructed native definitions must match frozen deployed hashes');
 const capturePath=path.join(directory,'source-derived-definitions.json');fs.writeFileSync(capturePath,capture);
 const env={...process.env,CUTOVER_PG_BINDIR:bindir,CUTOVER_PG_PORT:port,CUTOVER_TEMPLATE_DATABASE:database,CUTOVER_BASELINE_CAPTURE:capturePath};
 const reports=[];
 for(const file of ['test-native.mjs','test-full-native.mjs']){
  const r=spawnSync(process.execPath,[`ops/automatic-commerce-cutover/${file}`],{env,encoding:'utf8',timeout:240000,maxBuffer:24*1024*1024});
  assert.equal(r.status,0,`${file}: ${r.error?.message??r.stderr}`);reports.push(JSON.parse(r.stdout));
 }
 console.log(JSON.stringify({schema:1,status:'passed',native:true,elapsedMs:Date.now()-start,sourceFiles:replayReport.files.length,
  statements:replayReport.statements,heldMigrations:held,sourceReplaySha256:sha256(sql.join('\n')),managedServices:'repository fixture doubles; no provider network',reports},null,2));
} finally {
 if(server)admin('pg_ctl',['-D',data,'-m','fast','stop']);
 if(cleanup)cleanup();fs.rmSync(directory,{recursive:true,force:true});
}
