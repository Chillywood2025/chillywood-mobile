#!/usr/bin/env node
// Independent native connections in an owned local CLI clone. No provider
// operations, artificial row locks, production overrides or trigger disabling.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
import {seedPreparedClipExport} from '../tests/helpers/clip-export-authority-fixture.mjs';
if(process.argv.includes('--help')){console.log('After local reset, prove real Clip finish/cancel/source-update/worker-gate contention in an owned disposable clone. No provider calls.');process.exit(0);}
assert.equal(process.argv.length,2,'no arbitrary target arguments');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/mu)?.[1];assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER??`supabase_db_${project}`;assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_clip_export`,restore=createBrandGuardCloneRestorer({container});
const lit=x=>x===null?'null':`'${String(x).replaceAll("'","''")}'`;
const args=(db=database,user='postgres')=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',user,'-d',db];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{encoding,input,maxBuffer:256*1024*1024,timeout:120000});
const success=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message??r.stderr??''}`);return r.stdout;};
const query=(sql,db)=>success(docker(args(db),`set statement_timeout='20s';${sql}`),'local clone SQL').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','clip-fixture-admin',...a],input,encoding);
const auth=(f,role='service_role')=>`set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:f.owner,session_id:f.session}))};`;
const parse=text=>{const value=text.trim().split('\n').at(-1);if(value==='t')return true;if(value==='f')return false;try{return JSON.parse(value);}catch{return value;}};
const sessions=[];let cloned=false;
function start(sql){const name=`clip-${randomUUID()}`,child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
 child.stdin.write(`set application_name=${lit(name)};set statement_timeout='25s';${sql}\n`);
 const s={name,child,done,output:()=>stdout};sessions.push(s);return s;}
async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(fn())return;await delay(25);}throw Error(label);}
const blocked=(h,w)=>query(`select exists(select 1 from pg_stat_activity h,pg_stat_activity w where h.datname=current_database() and w.datname=current_database() and h.application_name=${lit(h.name)} and w.application_name=${lit(w.name)} and h.pid=any(pg_blocking_pids(w.pid)));`)==='t';
const finish=f=>`select finish_creator_clip_export(${lit(f.job.id)},${lit(f.job.lease)},${lit(f.key)},${lit(JSON.stringify(f.result))}::jsonb);`;
const cancel=f=>`select cancel_creator_clip_export(${lit(f.job.id)});`;
const replaceSource=f=>`update videos set storage_object_key=${lit(`${f.owner}/${f.video}/replacement.mp4`)},storage_path=${lit(`${f.owner}/${f.video}/replacement.mp4`)} where id=${lit(f.video)};`;
const gateOff='update private.creator_clip_export_worker set enabled=false where singleton;';
try{
 if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u);
 assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//u);
 assert.ok(success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').trim().split('\n').includes(container));
 assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261101141646');",'postgres'),'t');
 success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create owned clone');cloned=true;
 query('create schema vault;create extension supabase_vault with schema vault;');
 const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql','--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
 success(dump,'read-only source export');success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore owned clone');
 let prefix='';const remember=sql=>{for(const statement of sql.split(';'))if(/^\s*(?:set role|reset role|select set_config\()/iu.test(statement))prefix+=`${statement};`;};
 const db={exec:async sql=>{query(`${prefix}${sql};`);remember(sql);},query:async(sql,values=[])=>{
  const expanded=sql.replace(/\$(\d+)/gu,(_,i)=>lit(values[Number(i)-1]));const output=query(`${prefix}${expanded};`);remember(expanded);
  return {rows:output?[{value:parse(output)}]:[]};}};
 let checks=0;
 async function schedule({name,holderAction,holderRole='service_role',holderIsAdmin=false,waiterAction=finish,waiterRole='service_role',commit=true,error=null,ready=false}){
  prefix='';const f=await seedPreparedClipExport(db);
  // Holder executes the real mutation first and retains exactly its natural
  // locks. No SELECT FOR UPDATE or substitute advisory lock is injected.
  const h=start(`begin;${holderIsAdmin?'':auth(f,holderRole)}${holderAction(f)}select 'HOLDING';`);
  await until(()=>h.output().includes('HOLDING'),`${name}: holder did not reach real API result`);
  const w=start(`begin;${auth(f,waiterRole)}${waiterAction(f)}commit;`);w.child.stdin.end();
  await until(()=>blocked(h,w),`${name}: no actual pg_blocking_pids edge`);
  h.child.stdin.end(`${commit?'commit':'rollback'};\n`);assert.equal((await h.done).code,0,`${name}: holder failed`);
  const result=await w.done;
  if(error){assert.notEqual(result.code,0,name);assert.match(result.stderr,error,name);}else assert.equal(result.code,0,`${name}: ${result.stderr}`);
  const output=parse(query(`select jsonb_build_object('count',count(*),'private',coalesce(bool_and(visibility='draft' and scan_status='pending_scan' and owner_id::text=${lit(f.owner)}),true)) from videos where id=${lit(f.job.output_video_id)};`));
  assert.equal(output.count,ready?1:0,`${name}: atomic output count`);assert.equal(output.private,true,`${name}: scan/private/owner gate`);
  const bindings=Number(query(`select count(*) from private.secondary_media_bindings where object_id=${lit(f.identity.objectId)};`));
  assert.equal(bindings,ready?2:1,`${name}: no orphan or double binding`);
  if(ready)assert.equal(query(`select status from private.creator_clip_export_jobs where id=${lit(f.job.id)};`),'ready',name);
  // Finish/cancel failures leave no draft; terminalize only via the real API so
  // the next independent fixture is not blocked by an intentionally held lease.
  query(`begin;${auth(f)}select fail_creator_clip_export(${lit(f.job.id)},${lit(f.job.lease)},'source_changed');commit;`);
  checks++;console.log(`PASS ${name}`);
 }
 await schedule({name:'cancel commit fences waiting finish',holderAction:cancel,holderRole:'authenticated',error:/clip_export_stale_lease/});
 await schedule({name:'cancel rollback permits waiting finish',holderAction:cancel,holderRole:'authenticated',commit:false,ready:true});
 await schedule({name:'finish commit makes waiting cancel read same ready draft',holderAction:finish,waiterAction:cancel,waiterRole:'authenticated',ready:true});
 await schedule({name:'finish rollback lets waiting cancel win without draft',holderAction:finish,waiterAction:cancel,waiterRole:'authenticated',commit:false});
 await schedule({name:'source replacement commit fences waiting finish',holderAction:replaceSource,error:/clip_export_source_changed/});
 await schedule({name:'source replacement rollback preserves waiting finish',holderAction:replaceSource,commit:false,ready:true});
 await schedule({name:'worker disable commit fences waiting finish',holderAction:()=>gateOff,holderIsAdmin:true,error:/clip_export_stale_lease/});
 await schedule({name:'worker disable rollback permits waiting finish',holderAction:()=>gateOff,holderIsAdmin:true,commit:false,ready:true});
 assert.equal(checks,8);console.log('PASS all eight actual native Clip contention schedules.');
}finally{
 for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end();s.child.kill('SIGTERM');}
 await Promise.allSettled(sessions.map(s=>s.done));
 if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--force',database]),'drop owned clone');
}
