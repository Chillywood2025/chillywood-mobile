#!/usr/bin/env node
// Qualification only: every database/row/container is newly generated here.
// No production configuration, existing container or deployment is accepted.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,createWriteStream,readdirSync,mkdirSync,lstatSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {assertBrandNativeCleanShutdown} from './helpers/brand-reference-native-shutdown.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const evidence=fileURLToPath(new URL('../../',import.meta.url));
const imageRepository='ghcr.io/supabase/postgres';
const imageDigest='sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f';
const imageReference=imageRepository+'@'+imageDigest;
// Docker's local image/config ID is distinct from the registry manifest digest.
// Pull only the immutable manifest; never fall back to the historical tag.
function collectEvidence(){
 const destination=root+'brand-native-evidence/';mkdirSync(destination,{recursive:true});
 const files=[];
 for(const name of readdirSync(evidence).filter(name=>/^brand-(?:reference-.+\.json|native-ci-.+\.(?:json|log))$/.test(name)).sort()){
  if(!lstatSync(evidence+name).isFile())continue;
  copyFileSync(evidence+name,destination+name);
  files.push({name,sha256:createHash('sha256').update(readFileSync(evidence+name)).digest('hex')});
 }
 writeFileSync(destination+'manifest.json',JSON.stringify({collectedAt:new Date().toISOString(),files},null,2)+'\n');
 console.log(`Collected ${files.length} Brand attempt files in brand-native-evidence.`);
}
if(process.argv[2]==='--collect-evidence'){assert.equal(process.argv.length,3);collectEvidence();process.exit(0);}
const stages=[
 ['source-guards','tests/brand-reference-guards-native.mjs',['--keep-fixture'],12*60],
 ['semantics','tests/brand-reference-normalized-semantics-native.mjs',[],4*60],
 ['ddl','tests/brand-reference-normalized-ddl-native.mjs',['--native'],4*60],
 ['index-races','tests/brand-reference-index-guards-native.mjs',[],5*60],
 ['concurrent-installer','tests/brand-reference-index-installer-native.mjs',[],5*60],
 ['writers','tests/brand-reference-normalized-writers-native.mjs',[],5*60],
 ['failure-tail','tests/brand-reference-normalized-writers-native.mjs',['--failure-tail'],2*60],
 ['pilots','tests/brand-reference-normalized-pilot-native.mjs',[],8*60],
 ['full-setup','tests/brand-reference-index-performance-native.mjs',['--setup'],15*60],
 ['full-measure','tests/brand-reference-index-performance-native.mjs',['--measure'],5*60],
];
if(process.argv[2]==='--plan'){
 assert.equal(process.argv.length,3);
 console.log(JSON.stringify({imageReference,imageDigest,mainMemoryBytes:4*1024**3,network:'none',hostMounts:[],stages,
  finalStage:'Stop the main fixture, then run actual overflow in a separate bounded container.'},null,2));process.exit(0);
}
assert.equal(process.argv.length,2);
assert.equal(process.env.GITHUB_ACTIONS,'true','this creates resources only on an explicitly invoked GitHub Actions runner');
assert.match(process.env.GITHUB_RUN_ID??'',/^\d+$/);
assert.equal(process.env.BRAND_REFERENCE_LOCAL_PG,undefined,'CI never adopts an existing local cluster');
const container=`brand-ref-perf-recovery-${process.env.GITHUB_RUN_ID}-${randomUUID().slice(0,8)}`;
const dataDirectory='/tmp/brand-reference-recovery-data';
const manifest=evidence+'brand-reference-normalized-small-source.json';
const summaryPath=evidence+'brand-native-ci-summary.json';
assert.ok(!existsSync(summaryPath),'one qualification attempt per fresh runner workspace');
const env={...process.env,BRAND_REFERENCE_TEST_CONTAINER:container,BRAND_REFERENCE_NORMALIZED_FIXTURE:manifest};
for(const key of Object.keys(env))if(key.startsWith('PG')||key.startsWith('SUPABASE')||key==='DATABASE_URL')delete env[key];
const sha=value=>createHash('sha256').update(value).digest('hex');
const summary={status:'running',startedAt:new Date().toISOString(),syntheticOnly:true,container,imageReference,imageDigest,
 sourceHead:process.env.GITHUB_SHA,runner:{os:process.platform,architecture:process.arch},stages:[],
 sourceHashes:Object.fromEntries(['tests/brand-reference-native-ci.mjs','supabase/migrations/20261025121430_platform_brand_reference_scan_performance.sql','supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql'].map(file=>[file,sha(readFileSync(root+file))])),
 limitations:['Native source replay uses explicit managed-service doubles; canonical managed Supabase validation remains separate.',
  'Synthetic runner latency does not establish production latency. No deployment is performed.']};
const save=phase=>{summary.phase=phase;summary.updatedAt=new Date().toISOString();writeFileSync(summaryPath,JSON.stringify(summary,null,2)+'\n');console.log(summary.updatedAt+' '+phase);};
const docker=(args,input,timeout=15000)=>spawnSync('docker',args,{input,encoding:'utf8',timeout,maxBuffer:4*1024*1024,env});
const checked=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.stderr||r.error?.message}`);return r.stdout.trim();};
const inspect=()=>JSON.parse(checked(docker(['inspect',container]),'inspect own fixture'))[0];
let created=false,stopped=false;
async function command(label,binary,args,seconds){
 save(label);const entry={label,args,startedAt:new Date().toISOString(),timeoutSeconds:seconds};summary.stages.push(entry);
 const log=createWriteStream(evidence+'brand-native-ci-'+label+'.log',{flags:'wx'});
 const child=spawn(binary,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{log.write(chunk);process.stdout.write(chunk);});
 const result=await new Promise(resolve=>{
  const timer=setTimeout(()=>{entry.processTimeout=true;child.kill('SIGTERM');},seconds*1000);
  child.on('error',error=>{clearTimeout(timer);resolve({code:-1,error:error.message});});
  child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal});});
 });
 await new Promise(resolve=>log.end(resolve));Object.assign(entry,result,{completedAt:new Date().toISOString()});save(label+' completed');
 assert.equal(result.code,0,result.error||`${label} exited ${result.code}/${result.signal}`);
 assert.notEqual(entry.processTimeout,true,label+' exceeded its process budget');
}
function stopMain(){
 if(!created||stopped)return;
 assert.equal(inspect().State.Running,true,'own server must be running before the shutdown request');
 const record=r=>({status:r.status,signal:r.signal,error:r.error?.message??null,stdout:r.stdout??'',stderr:r.stderr??''});
 const shutdown={requestedAt:new Date().toISOString()};summary.shutdown=shutdown;
 shutdown.command=record(docker(['exec',container,'pg_ctl','-D',dataDirectory,'-m','smart','-w','-t','15','stop'],undefined,20000));
 shutdown.inspection=record(docker(['inspect',container]));
 if(shutdown.inspection.status===0)shutdown.inspection.stdout=JSON.stringify(JSON.parse(shutdown.inspection.stdout)[0]);
 shutdown.logs=record(docker(['logs','--timestamps','--since',shutdown.requestedAt,container]));
 summary.terminalState=assertBrandNativeCleanShutdown(shutdown);stopped=true;summary.mainStopped=true;
}
try{
 save('verify local runner engine and download exact historical image');
 assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');
 if(env.DOCKER_HOST)assert.match(env.DOCKER_HOST,/^unix:\/\//);
 assert.match(checked(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker context'),/^unix:\/\//);
 await command('pull-image','docker',['pull','--platform','linux/amd64',imageReference],300);
 const image=JSON.parse(checked(docker(['image','inspect',imageReference]),'verify image identity'))[0];
 assert.ok(image.RepoDigests?.includes(imageReference),'the exact immutable manifest must be present');
 assert.match(image.Id,/^sha256:[0-9a-f]{64}$/);const imageID=image.Id;
 assert.equal(image.Architecture,'amd64');assert.equal(image.Os,'linux');
 summary.image={id:image.Id,repoDigests:image.RepoDigests,architecture:image.Architecture,os:image.Os};
 const init=`initdb -D ${dataDirectory} --auth-local=trust --auth-host=reject --encoding=UTF8 --locale=C && exec postgres -D ${dataDirectory} -c listen_addresses='' -c unix_socket_directories=/tmp`;
 save('create new bounded container with no network, host mounts or published ports');
 checked(docker(['create','--name',container,'--network','none','--memory','4g','--memory-swap','4g','--pids-limit','256',
  '--label','brand.reference.recovery='+process.env.GITHUB_RUN_ID,'--restart','no','--user','postgres','--entrypoint','/bin/sh',imageReference,'-c',init]),'create own fixture');created=true;
 const initial=inspect();assert.equal(initial.HostConfig.NetworkMode,'none');assert.deepEqual(initial.Mounts,[]);
 assert.equal(initial.HostConfig.Memory,4*1024**3);assert.equal(initial.HostConfig.MemorySwap,4*1024**3);
 assert.equal(initial.Image,imageID);assert.deepEqual(initial.HostConfig.PortBindings??{},{});
 checked(docker(['start',container]),'start own fixture');
 const deadline=Date.now()+60000;let ready=false;
 while(Date.now()<deadline){
  const state=inspect();assert.equal(state.State.Running,true,'own fixture stopped during startup');
  if(docker(['exec',container,'pg_isready','-h','/tmp','-U','postgres','-d','postgres']).status===0){ready=true;break;}
  await delay(1000);
 }
 assert.equal(ready,true,'bounded readiness');
 const identity=JSON.parse(checked(docker(['exec','-i',container,'psql','-X','-q','-A','-t','-h','/tmp','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
  "set statement_timeout='5s';select json_build_object('version',current_setting('server_version_num'),'listen',current_setting('listen_addresses'),'data',current_setting('data_directory'),'maintenanceWorkMem',current_setting('maintenance_work_mem'),'workMem',current_setting('work_mem'),'fuzzy',current_setting('gin_fuzzy_search_limit'))::text;"),'server identity'));
 assert.equal(identity.version,'170006');assert.equal(identity.listen,'');assert.equal(identity.data,dataDirectory);assert.equal(identity.fuzzy,'0');summary.server=identity;
 for(const [label,file,args,seconds] of stages){
  await command(label,process.execPath,[file,...args],seconds);
  if(label==='source-guards'){
   const fixture=JSON.parse(readFileSync(evidence+'brand-reference-index-native-guards.json','utf8'));
   assert.equal(fixture.status,'passed');assert.equal(fixture.container,container);
   writeFileSync(manifest,JSON.stringify({...fixture,kind:'brand-normalized-small-source',syntheticOnly:true},null,2)+'\n',{flag:'wx'});
  }
 }
 save('release main fixture memory before the separate actual-overflow attempt');stopMain();
 await command('overflow',process.execPath,['tests/brand-reference-normalized-overflow-native.mjs'],180);
 const overflow=JSON.parse(readFileSync(evidence+'brand-reference-normalized-overflow-native.json','utf8'));
 assert.equal(overflow.status,'passed');assert.equal(overflow.result.originalSQLSTATE,'54000');
 summary.status='passed';save('native qualification gates passed; no deployment or managed-runtime claim');
}catch(error){summary.status='failed';summary.error=String(error.message);console.error(summary.error);save('native qualification stopped at the first failed gate');process.exitCode=1;}
finally{
 if(created){
  const logs=docker(['logs','--timestamps',container]);writeFileSync(evidence+'brand-native-ci-postgres.log',(logs.stdout??'')+(logs.stderr??''));
  try{summary.terminalBeforeStop=inspect().State;stopMain();summary.terminalState=inspect().State;}
  catch(error){summary.cleanupError=String(error.message);summary.status='failed';process.exitCode=1;}
 }
 summary.runnerSHA256=sha(readFileSync(new URL(import.meta.url)));summary.completedAt=new Date().toISOString();save('qualification evidence saved');collectEvidence();
}
