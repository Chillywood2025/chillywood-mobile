#!/usr/bin/env node
// One bounded real serialization-overflow attempt in its own empty container.
// No benchmark container/database is contacted, copied, mounted or modified.
// Run only after an explicitly coordinated quiet window and tool approval.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

assert.equal(process.argv.length,2,'one fixed isolated test; no runtime overrides');
const root=fileURLToPath(new URL('../',import.meta.url));
const evidence=fileURLToPath(new URL('../../',import.meta.url));
const output=evidence+'brand-reference-normalized-overflow-native.json';
assert.ok(!existsSync(output),'preserve an earlier attempt; no automatic reruns');
const image='public.ecr.aws/supabase/postgres@sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f';
const container=`brand-ref-overflow-recovery-${process.pid}-${randomUUID().slice(0,8)}`;
const dataDirectory='/tmp/brand-reference-overflow-data';
const memoryBytes=3072*1024*1024;
const minimumAvailableKB=4096*1024;
const rawBytes=180000000;
const migration='supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql';
const source=readFileSync(root+migration,'utf8');
const helper=source.match(/create function private\.platform_brand_index_jsonb_bytes_v1\([\s\S]*?\$\$;/)?.[0];
assert.ok(helper,'exact source size helper');
assert.match(helper,/if sqlstate<>'54000' then raise; end if;/);
const helperBody=helper.match(/as \$\$([\s\S]*?)\$\$;/)[1];
const sha=value=>createHash('sha256').update(value).digest('hex');
const docker=(args,input,timeout=15000)=>spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:2*1024*1024,timeout});
const resultRecord=result=>({status:result.status,signal:result.signal,error:result.error?.message??null,stdout:result.stdout??'',stderr:result.stderr??''});
const success=(result,label)=>{assert.equal(result.status,0,`${label}: ${result.stderr||result.error?.message}`);return result.stdout.trim();};
const report={status:'running',startedAt:new Date().toISOString(),container,image,syntheticOnly:true,sourceSHA256:sha(source),helperBodySHA256:sha(helperBody),harnessSHA256:sha(readFileSync(new URL(import.meta.url))),
 resourcePlan:{memoryBytes,memorySwapBytes:memoryBytes,maximumPids:64,minimumAvailableKB,rawBytes,expectedEscapedBytes:rawBytes*6+9,
  expectedPeakEstimateGiB:[1.5,3],qualification:'The3GiB cgroup bound covers the estimated range but may still cause a legitimate OOM instead of the intended54000. That is an incomplete test, never a pass.',
  parentQuietWindowRequired:true},
 limitations:['One synthetic overflow case; no full-schema, whole-row write, benchmark or production performance evidence.',
  'No retries. Failed container state is retained; only the owned client receives TERM if its outer deadline expires.',
  'A cgroup memory limit bounds this container but cannot prove zero host impact; the preallocation VM headroom gate is required.']};
const checkpoint=phase=>{report.phase=phase;report.updatedAt=new Date().toISOString();writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(`${report.updatedAt} ${phase}`);};
let created=false,healthyPass=false;
const inspect=()=>docker(['inspect','--format','{"state":{{json .State}},"network":{{json .HostConfig.NetworkMode}},"mounts":{{json .Mounts}},"image":{{json .Image}},"memory":{{json .HostConfig.Memory}},"memorySwap":{{json .HostConfig.MemorySwap}},"pids":{{json .HostConfig.PidsLimit}},"user":{{json .Config.User}}}',container]);
const args=['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','/tmp','-U','postgres','-d','postgres'];
const resources=()=>docker(['exec',container,'/bin/sh','-c',
 'for name in memory.max memory.swap.max memory.current memory.peak memory.events; do if [ -r "/sys/fs/cgroup/$name" ]; then printf "%s\\n" "[$name]"; cat "/sys/fs/cgroup/$name"; fi; done; cat /proc/meminfo']);
const psql=sql=>docker(args,"set statement_timeout='30s';\n"+sql,45000);

try{
 checkpoint('read-only engine/image preflight before creating isolated overflow container');
 if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//);
 report.context=success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker engine');
 assert.match(report.context,/^(unix|npipe):\/\//);
 const imageState=JSON.parse(success(docker(['image','inspect',image]),'existing immutable image'))[0];
 assert.ok(imageState.RepoDigests?.includes(image),'exact registry manifest required');
 assert.match(imageState.Id,/^sha256:[0-9a-f]{64}$/);report.imageIdentity=imageState.Id;report.repoDigests=imageState.RepoDigests;
 const init=`initdb -D ${dataDirectory} --auth-local=trust --auth-host=reject --encoding=UTF8 --locale=C && exec postgres -D ${dataDirectory} -c listen_addresses='' -c unix_socket_directories=/tmp`;
 const createArgs=['create','--name',container,'--network','none','--memory','3072m','--memory-swap','3072m','--pids-limit','64','--restart','no','--user','postgres','--entrypoint','/bin/sh',image,'-c',init];
 report.creationCommand=['docker',...createArgs];report.creationOutcome='not_started';checkpoint('create isolated container with hard memory/no-swap bound; no host mounts');
 report.creationOutcome='unconfirmed';
 const creation=docker(createArgs);report.creation=resultRecord(creation);
 if(creation.status!==0){
  // Resolve a possibly completed CREATE by one read, never another CREATE.
  report.creationReadback=resultRecord(inspect());
  if(report.creationReadback.status===0){created=true;report.creationOutcome='created';}
  else if(/No such (?:object|container)/i.test(report.creationReadback.stderr))report.creationOutcome='not_created';
  else report.creationOutcome='uncertain';
 }
 success(creation,'isolated container creation');created=true;report.creationOutcome='created';
 report.initialProperties=JSON.parse(success(inspect(),'verify created container'));assert.equal(report.initialProperties.network,'none');assert.deepEqual(report.initialProperties.mounts,[]);assert.equal(report.initialProperties.image,report.imageIdentity);
 assert.equal(report.initialProperties.memory,memoryBytes);assert.equal(report.initialProperties.memorySwap,memoryBytes);assert.equal(report.initialProperties.pids,64);assert.equal(report.initialProperties.user,'postgres');
 report.start=resultRecord(docker(['start',container]));assert.equal(report.start.status,0,report.start.stderr);checkpoint('initialize independent empty PostgreSQL cluster');
 const readinessDeadline=Date.now()+45000;
 let ready=false;
 while(Date.now()<readinessDeadline){
  const current=JSON.parse(success(inspect(),'startup state'));
  if(!current.state.Running)throw Error(`isolated server stopped during initialization: ${JSON.stringify(current.state)}`);
  const probe=docker(['exec',container,'pg_isready','-h','/tmp','-U','postgres','-d','postgres']);
  if(probe.status===0){ready=true;break;}
  await delay(1000);
 }
 assert.ok(ready,'isolated database readiness bounded to45s');
 report.server=JSON.parse(success(psql("select json_build_object('version',version(),'server_version_num',current_setting('server_version_num'),'encoding',current_setting('server_encoding'),'listen',current_setting('listen_addresses'),'timeout',current_setting('statement_timeout'),'track_functions',current_setting('track_functions'))::text;"),'isolated server identity'));
 assert.equal(report.server.server_version_num,'170006');assert.equal(report.server.listen,'');assert.equal(report.server.timeout,'30s');
 success(psql(`create schema private;${helper}`),'install exact source size helper');
 const installed=JSON.parse(success(psql("select to_json(prosrc)::text from pg_proc where oid='private.platform_brand_index_jsonb_bytes_v1(jsonb)'::regprocedure;"),'installed helper identity'));
 assert.equal(installed,helperBody);report.installedHelperBodySHA256=sha(installed);
 report.resourcesBefore=resultRecord(resources());assert.equal(report.resourcesBefore.status,0,report.resourcesBefore.stderr);
 const available=report.resourcesBefore.stdout.match(/^MemAvailable:\s+(\d+) kB$/m);assert.ok(available,'VM available-memory observation required');
 report.availableBeforeKB=Number(available[1]);assert.ok(report.availableBeforeKB>=minimumAvailableKB,`memory headroom gate: ${report.availableBeforeKB}KiB available < ${minimumAvailableKB}KiB required; no huge allocation performed`);
 assert.match(report.resourcesBefore.stdout,new RegExp(`\\[memory.max\\]\\n${memoryBytes}\\n`));
 assert.match(report.resourcesBefore.stdout,/\[memory.swap.max\]\n0\n/,'cgroup swap must be disabled');
 const sql=`set statement_timeout='30s';
 create temp table overflow_result(value jsonb);
 do $test$
 declare j jsonb; raw_state text; raw_message text; actual bigint; start_time timestamptz; raw_ms numeric; helper_ms numeric;
 begin
  raise notice 'OVERFLOW_STAGE construct180MB';
  j:=jsonb_build_object('v',repeat(chr(1),${rawBytes}));
  raise notice 'OVERFLOW_STAGE raw_serialization';
  start_time:=clock_timestamp();
  begin
   perform octet_length(j::text);
   raise exception 'expected_serialization_limit_not_raised';
  exception when sqlstate '54000' then
   if sqlstate<>'54000' then raise; end if;
   raw_state:=sqlstate;raw_message:=sqlerrm;
  end;
  raw_ms:=extract(epoch from(clock_timestamp()-start_time))*1000;
  raise notice 'OVERFLOW_STAGE raw_error %',raw_state;
  start_time:=clock_timestamp();
  actual:=private.platform_brand_index_jsonb_bytes_v1(j);
  helper_ms:=extract(epoch from(clock_timestamp()-start_time))*1000;
  if actual<>1048577 then raise exception 'unexpected_size_helper_result: %',actual;end if;
  insert into overflow_result values(jsonb_build_object('originalSQLSTATE',raw_state,'originalMessage',raw_message,
   'helperResult',actual,'rawBytes',${rawBytes},'rawSerializationMS',raw_ms,'helperMS',helper_ms,'statementTimeout',current_setting('statement_timeout')));
  raise notice 'OVERFLOW_STAGE verified';
 end $test$;
 select value::text from overflow_result;`;
 report.query=sql;report.querySHA256=sha(sql);checkpoint('one bounded actual serialization and helper overflow attempt');
 const start=Date.now();const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stdout.on('data',value=>stdout+=value);child.stderr.on('data',value=>{stderr+=value;report.testStderr=stderr;checkpoint('native overflow backend progress: '+value.trim().slice(-240));});
 child.stdin.on('error',()=>{});
 let processTimedOut=false;
 const completed=new Promise(resolve=>{
  const timer=setTimeout(()=>{processTimedOut=true;child.kill('SIGTERM');},45000);
  child.on('error',error=>{clearTimeout(timer);resolve({status:null,error:error.message});});
  child.on('close',(status,signal)=>{clearTimeout(timer);resolve({status,signal});});
 });
 child.stdin.end(sql);
 const result=await completed;report.attempt={...result,stdout,stderr,processTimedOut,wallMS:Date.now()-start};
 assert.equal(processTimedOut,false,'outer client deadline is incomplete proof');
 assert.equal(result.status,0,stderr||result.error);report.result=JSON.parse(stdout.trim());
 assert.equal(report.result.originalSQLSTATE,'54000');assert.equal(report.result.helperResult,1048577);assert.equal(report.result.statementTimeout,'30s');
 report.resourcesAfter=resultRecord(resources());assert.equal(report.resourcesAfter.status,0,report.resourcesAfter.stderr);
 const oomLines=report.resourcesAfter.stdout.match(/^oom(?:_kill|_group_kill)?\s+(\d+)$/gm)??[];for(const line of oomLines)assert.equal(Number(line.split(/\s+/)[1]),0,'no cgroup OOM can count as a complete proof');
 report.verifiedProperties=JSON.parse(success(inspect(),'post-test own container state'));assert.equal(report.verifiedProperties.state.Running,true);assert.equal(report.verifiedProperties.state.OOMKilled,false);
 const finalBody=JSON.parse(success(psql("select to_json(prosrc)::text from pg_proc where oid='private.platform_brand_index_jsonb_bytes_v1(jsonb)'::regprocedure;"),'helper identity after actual overflow'));
 assert.equal(finalBody,helperBody);report.installedHelperBodySHA256After=sha(finalBody);
 healthyPass=true;report.status='passed';report.completedAt=new Date().toISOString();checkpoint('exact54000 and helper1048577 proved with source identity and no OOM');
}catch(error){report.status='failed';report.error=String(error.message);checkpoint('overflow proof incomplete; preserve failed state and do not retry');
}finally{
 if(created){
  report.terminalResources=resultRecord(resources());
  const state=inspect();report.terminalInspect=resultRecord(state);if(state.status===0)report.terminalProperties=JSON.parse(state.stdout);
  report.serverLogs=resultRecord(docker(['logs','--timestamps',container]));
  if(healthyPass){
   // Graceful shutdown of only this newly created server; no forced fallback.
   report.shutdown=resultRecord(docker(['exec',container,'pg_ctl','-D',dataDirectory,'-m','smart','-w','-t','10','stop']));
   report.stateAfterShutdown=resultRecord(inspect());
   try{
    assert.equal(report.shutdown.status,0,report.shutdown.stderr||report.shutdown.error);
    assert.equal(report.stateAfterShutdown.status,0,report.stateAfterShutdown.stderr||report.stateAfterShutdown.error);
    assert.equal(JSON.parse(report.stateAfterShutdown.stdout).state.Running,false,'own overflow server must be stopped');
   }catch(error){report.status='failed';report.cleanupError=String(error.message);}
  }
 }
 report.fixture={container,created:report.creationOutcome==='uncertain'?null:created,retained:created,dataDirectory};checkpoint('terminal overflow evidence saved; no automatic retry/removal');
}
if(report.status!=='passed')process.exitCode=1;
