// Required native proof of the current wrappers, not a legacy-only substitute.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../../tests/helpers/database-runtime-authority-fixture.mjs';
import {commonGateSignatures,migrationName,sources} from '../../scripts/automatic-eligibility-forward.mjs';

const bin=process.env.CUTOVER_PG_BINDIR,port=process.env.CUTOVER_PG_PORT;
assert.ok(path.isAbsolute(bin??''));assert.match(port??'',/^\d{4,5}$/u);
assert.equal(process.argv.length,2,'only the owned native runner supplies connection context');
const psql=path.join(bin,'psql'),base=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','postgres'];
const migration=fs.readFileSync(`supabase/migrations/${migrationName}`,'utf8');
const literal=value=>`'${value.replaceAll("'","''")}'`;
const run=(sql,database)=>spawnSync(psql,[...base,'-d',database],{input:sql,encoding:'utf8',timeout:600000,maxBuffer:32*1024*1024});
const query=(sql,database)=>{const r=run(sql,database);assert.equal(r.status,0,`${r.error?.message??''}\n${r.stderr?.slice(-5000)??''}`);return r.stdout.trim();};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sessions=[];
function session(database,sql){
 const name=`forward_${randomUUID()}`;
 const child=spawn(psql,[...base,'-d',database],{stdio:['pipe','pipe','pipe']});let output='',error='';
 child.stdout.on('data',value=>{output+=value;});child.stderr.on('data',value=>{error+=value;});
 let finished=false;
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{finished=true;resolve({code,output,error});});});
 const s={name,child,done,output:()=>output,finished:()=>finished,error:()=>error};sessions.push(s);
 child.stdin.write(`set application_name=${literal(name)};${sql}\n`);return s;
}
async function until(predicate,label){const deadline=Date.now()+600000;while(Date.now()<deadline){if(predicate())return;await delay(20);}throw Error(label);}
const results=[];
const ancestry=process.env.CUTOVER_CURRENT_ANCESTRY;
assert.ok(['missing','canonical'].includes(ancestry));
{
 const database=`forward_${ancestry}_${randomUUID().replaceAll('-','')}`;let created=false;
 try{
  query(`create database ${database};`,'postgres');created=true;
  const statements=[];
  const fixture=await createDatabase({implicitApiGrants:false,
   excludeMigrations:[migrationName,...ancestry==='missing'?sources.map(([file])=>file):[]],
   databaseFactory:async()=>({async exec(sql){statements.push(sql);},async close(){}})});
  query(statements.join('\n'),database);
  const before=query(`select jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,p.prosrc) order by p.oid)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')`,database);
  const late=run(migration.replace(/\ncommit;\n$/u,'\nselect 1/0;\ncommit;\n'),database);
  assert.notEqual(late.status,0);assert.match(late.stderr,/division by zero/u);
  assert.equal(query(`select jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,p.prosrc) order by p.oid)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')`,database),before,'late failure atomically restores every function');
  query(migration,database);
  for(const signature of commonGateSignatures){
   const holder=session(database,"begin isolation level read committed;select private.lock_ordinary_commerce_authority_gate();select 'HOLDER_READY';");
   await until(()=>holder.output().includes('HOLDER_READY'),'holder must own actual commerce gate');
   const functionName=signature.slice(0,signature.indexOf('('));
   const types=signature.slice(signature.indexOf('(')+1,-1).split(',').map(value=>value.trim());
   const waiter=session(database,`begin isolation level read committed;set local request.jwt.claims='{"role":"service_role"}';set local request.jwt.claim.role='service_role';select ${functionName}(${types.map(type=>`null::${type}`).join(',')});rollback;`);
   waiter.child.stdin.end();
   await until(()=>{assert.equal(waiter.finished(),false,`${signature} exited before lock observation: ${waiter.error()}`);return query(`select exists(select 1 from pg_stat_activity a join pg_locks l on l.pid=a.pid
    where a.application_name=${literal(waiter.name)} and l.locktype='advisory' and l.classid=176214
     and l.objid=32 and l.objsubid=2 and not l.granted)`,database)==='t';},`${signature} must wait at canonical gate before native authority`);
   assert.equal(query(`select exists(select 1 from pg_stat_activity a join pg_locks l on l.pid=a.pid
    where a.application_name=${literal(waiter.name)} and l.locktype='advisory' and l.granted)`,database),'f','waiter holds no advisory lock before canonical gate');
   holder.child.stdin.write("select 'NATIVE_AVAILABLE='||pg_try_advisory_xact_lock(hashtextextended('native-production-checkout-authority',0));\n");
   await until(()=>holder.output().includes('NATIVE_AVAILABLE=true'),'commerce holder can acquire native authority without inversion');
   holder.child.stdin.end('rollback;\n');assert.equal((await holder.done).code,0);
   const result=await waiter.done;assert.ok([0,3].includes(result.code),result.error);
  }
  results.push({ancestry,sourceFiles:fixture.replayReport.files.length,entrySchedules:commonGateSignatures.length,lateRollback:true});
 }finally{
  for(const s of sessions)if(!s.child.stdin.destroyed)s.child.stdin.end('rollback;\n');
  await Promise.allSettled(sessions.map(s=>s.done));
  if(created)query(`drop database ${database};`,'postgres');
 }
}
console.log(JSON.stringify({status:'passed',native:true,actualSourceTopology:true,providerCalls:0,results}));
