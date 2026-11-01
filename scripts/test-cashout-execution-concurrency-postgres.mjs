#!/usr/bin/env node
// Real PostgreSQL lock proof. Only an owned clone of a local Supabase CLI DB;
// synthetic evidence, no provider traffic or changes to the source database.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
import {seedCashoutExecutionFixture,creator,session as actorSession} from '../tests/helpers/cashout-execution-fixture.mjs';
if(process.argv.includes('--help')){console.log('After local Supabase reset, test actual cashout locks in a generated disposable clone. No remote URLs or provider calls.');process.exit(0);}
assert.equal(process.argv.length,2,'no arbitrary target arguments');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/mu)?.[1];assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER??`supabase_db_${project}`;assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_cashout_execution`,restore=createBrandGuardCloneRestorer({container});
const lit=x=>x===null?'null':`'${String(x).replaceAll("'","''")}'`;
const args=(db=database,user='postgres')=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',user,'-d',db];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{encoding,input,maxBuffer:256*1024*1024,timeout:120000});
const success=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message??r.stderr??''}`);return r.stdout;};
const query=(sql,db)=>success(docker(args(db),`set statement_timeout='20s';${sql}`),'local clone SQL').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','cashout-fixture-admin',...a],input,encoding);
const auth=role=>`set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:creator,session_id:actorSession}))};`;
const parse=text=>{const value=text.trim().split('\n').at(-1);if(value==='t')return true;if(value==='f')return false;try{return JSON.parse(value);}catch{return value;}};
const sessions=[];let cloned=false;
function start(sql){const name=`cashout-${randomUUID()}`,child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
 child.stdin.write(`set application_name=${lit(name)};set statement_timeout='25s';${sql}\n`);
 const s={name,child,done,output:()=>stdout};sessions.push(s);return s;}
async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(fn())return;await delay(25);}throw Error(label);}
const blocked=(holder,waiter)=>query(`select exists(select 1 from pg_stat_activity h,pg_stat_activity w where h.datname=current_database() and w.datname=current_database() and h.application_name=${lit(holder.name)} and w.application_name=${lit(waiter.name)} and h.pid=any(pg_blocking_pids(w.pid)));`)==='t';
try{
 if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u);
 assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//u);
 assert.ok(success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').trim().split('\n').includes(container));
 assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261101141656');",'postgres'),'t');
 success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create owned clone');cloned=true;
 query('create schema vault;create extension supabase_vault with schema vault;');
 const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql','--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
 success(dump,'read-only source export');success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore disposable clone');
 // Fixture uses connection-scoped roles/claims. One persistent psql batch is
 // assembled before each data query to preserve that explicit identity.
 let prefix='';const remember=sql=>{for(const statement of sql.split(';'))if(/^\s*(?:set role|reset role|select set_config\()/iu.test(statement))prefix+=`${statement};`;};
 const db={exec:async sql=>{query(`${prefix}${sql};`);remember(sql);},query:async(sql,values=[])=>{
  const expanded=sql.replace(/\$(\d+)/gu,(_,i)=>lit(values[Number(i)-1]));
  const output=query(`${prefix}${expanded};`);remember(expanded);return {rows:output?[{value:parse(output)}]:[]};}};
 const fixture=await seedCashoutExecutionFixture(db);
 query(`begin;${auth('service_role')}select public.get_creator_cashout_execution_context(${lit(fixture.request.id)});commit;`);
 const claim=id=>`select public.claim_creator_cashout_dispatch(${lit(id)},'funding');`;
 const cancel=id=>`select public.cancel_undispatched_creator_cashout(${lit(id)});`;
 const holder=start(`begin;${auth('service_role')}${claim(fixture.request.id)}select 'HOLDING';`);
 await until(()=>holder.output().includes('HOLDING'),'first dispatch claim missing');
 const waiter=start(`begin;${auth('authenticated')}${cancel(fixture.request.id)}commit;`);waiter.child.stdin.end();
 await until(()=>blocked(holder,waiter),'cancel did not block on real creator authority lock');
 holder.child.stdin.end('rollback;\n');assert.equal((await holder.done).code,0);
 const canceled=await waiter.done;assert.equal(canceled.code,0,canceled.stderr);assert.match(canceled.stdout,/"status": "canceled"/u);
 assert.equal(query(`select count(*) from public.creator_payout_allocations where payout_request_id=${lit(fixture.request.id)} and state='released';`),'1');
 const second=parse(query(`begin;${auth('authenticated')}select public.request_qualified_creator_cashout(10000,'instant',${lit(fixture.qualification)},${lit(randomUUID())},200,0,9800);commit;`));
 const winner=start(`begin;${auth('service_role')}${claim(second.requestId)}select 'HOLDING';`);
 await until(()=>winner.output().includes('HOLDING'),'second dispatch claim missing');
 const loser=start(`begin;${auth('service_role')}${claim(second.requestId)}commit;`);loser.child.stdin.end();
 await until(()=>blocked(winner,loser),'second dispatch did not block on real creator authority lock');
 winner.child.stdin.end('commit;\n');assert.equal((await winner.done).code,0);
 const duplicate=await loser.done;assert.equal(duplicate.code,0,duplicate.stderr);assert.match(duplicate.stdout,/"claimed": false/u);
 const denied=docker(args(),`begin;${auth('authenticated')}${cancel(second.requestId)}commit;`);
 assert.notEqual(denied.status,0);assert.match(denied.stderr,/cashout_dispatch_already_started/u);
 assert.equal(query(`select phase from private.creator_cashout_executions where request_id=${lit(second.requestId)};`),'funding_unknown');
 console.log('PASS native cashout: real blocking, rollback permits cancellation, one durable dispatch winner, no post-dispatch release.');
}finally{
 for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end();s.child.kill('SIGTERM');}
 await Promise.allSettled(sessions.map(s=>s.done));
 if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--force',database]),'drop owned clone');
}
