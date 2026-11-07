#!/usr/bin/env node
// Native portability/transaction barriers in a generated clone of LOCAL CLI DB.
// No production transport, remote Docker, or mutation of the source database.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
import {loadBundle,readbackSql,buildApplySql,classifyState,MIGRATIONS,FUNCTIONS,TRIGGERS} from './social-engagement-exact-deploy.mjs';
assert.equal(process.argv.length,2,'no target arguments');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/mu)?.[1];assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER??`supabase_db_${project}`;assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_social`;
const restore=createBrandGuardCloneRestorer({container}),bundle=loadBundle();
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const docker=(args,input,encoding='utf8')=>spawnSync('docker',args,{encoding,input,maxBuffer:256*1024*1024,timeout:120000});
const success=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message??r.stderr??''}`);return r.stdout;};
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const query=(sql,db)=>success(docker(args(db),`set statement_timeout='30s';${sql}`),'clone SQL').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','social-fixture-admin',...a],input,encoding);
const context={currentPostgres:false,currentReadOnly:true,sessionPostgres:false,sessionReadOnly:true,sessionAdmin:false,transactionReadOnly:true};
const read=()=>({...JSON.parse(query(readbackSql(bundle)).trim().split('\n').at(-1)),context});
const fail=(sql,pattern)=>{const result=docker(args(),sql);assert.notEqual(result.status,0);assert.match(result.stderr,pattern);};
const sessions=new Set();let cloned=false;
function start(sql){
 const name=`social-${randomUUID()}`,child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{sessions.delete(child);resolve({code,stdout,stderr});});});
 sessions.add(child);child.stdin.write(`set application_name=${lit(name)};set statement_timeout='20s';${sql}\n`);
 return {name,child,done,output:()=>stdout};
}
async function until(fn,label){const deadline=Date.now()+15000;while(Date.now()<deadline){if(fn())return;await delay(25);}throw Error(label);}
const blocked=(h,w)=>query(`select exists(select 1 from pg_stat_activity h,pg_stat_activity w where h.datname=current_database() and w.datname=current_database() and h.application_name=${lit(h.name)} and w.application_name=${lit(w.name)} and h.pid=any(pg_blocking_pids(w.pid)));`)==='t';
try{
 if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^unix:\/\//u);
 assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local context').trim(),/^unix:\/\//u);
 assert.ok(success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').trim().split('\n').includes(container));
 success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create owned clone');cloned=true;
 query('create schema vault;create extension supabase_vault with schema vault;');
 const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql','--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
 success(dump,'source readonly export');success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'owned clone restore');
 // Remove ONLY the new additive feature from the disposable clone. Never sent
 // to a real target; baseline production source code has no reverse operation.
 query(`do $$ declare f record;t record;begin
 for t in select tgrelid::regclass rel,tgname from pg_trigger where not tgisinternal and tgname in (${TRIGGERS.map(lit).join(',')}) loop execute format('drop trigger %I on %s',t.tgname,t.rel);end loop;
 for f in select oid::regprocedure identity from pg_proc where pronamespace='public'::regnamespace and proname in (${FUNCTIONS.map(lit).join(',')}) loop execute 'drop function '||f.identity;end loop;
 end $$;
 drop schema video_engagement_private cascade;drop schema comment_likes_private cascade;
 delete from supabase_migrations.schema_migrations where version in (${MIGRATIONS.map(x=>lit(x.version)).join(',')});`);
 const before=read();assert.equal(classifyState(bundle,before),'ready');const sql=buildApplySql(bundle,before);
 const holder=start("begin;select pg_advisory_xact_lock(176214,683);select 'HOLDING';");
 await until(()=>holder.output().includes('HOLDING'),'cutover holder ready');
 fail(sql,/social_operation_in_progress/u);fail(readbackSql(bundle),/social_operation_in_progress/u);
 holder.child.stdin.end('rollback;\n');assert.equal((await holder.done).code,0);
 assert.equal(read().absent,true);
 // A real independent backend holds history lock and commits a new receipt.
 // Waiting apply must re-read it AFTER the lock, and reject its stale plan.
 const history=start("begin;lock table supabase_migrations.schema_migrations in share row exclusive mode;insert into supabase_migrations.schema_migrations(version,name,statements) values('20261107000000','concurrent_fixture',array['local test']);select 'HOLDING';");
 await until(()=>history.output().includes('HOLDING'),'history holder ready');
 const application=start(sql);application.child.stdin.end();
 await until(()=>blocked(history,application),'actual history lock wait');
 history.child.stdin.end('commit;\n');assert.equal((await history.done).code,0);
 const result=await application.done;assert.notEqual(result.code,0);assert.match(result.stderr,/social_baseline_changed/u);
 query("delete from supabase_migrations.schema_migrations where version='20261107000000'");
 assert.equal(read().absent,true);
 fail(buildApplySql({...bundle,manifest:{...bundle.manifest,targetCatalogSha256:'0'.repeat(64)}},before),/social_postcheck_failed/u);
 assert.equal(read().absent,true);
 query(sql);const after=read();assert.equal(classifyState(bundle,after),'applied');
 for(const k of ['priorHistorySha256','catalogSha256','controlsSha256'])assert.equal(after[k],before[k]);
 fail(sql,/social_baseline_changed/u);assert.equal(classifyState(bundle,read()),'applied');
 console.log('PASS: native social exact transaction, catalog portability, exclusive cutover/readback barrier, post-lock stale history, atomic rollback, exact history and idempotency. Local clone only.');
}finally{
 for(const child of sessions)child.kill('SIGTERM');
 if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--force',database]),'drop owned clone');
}
