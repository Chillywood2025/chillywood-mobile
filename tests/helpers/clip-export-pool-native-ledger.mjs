import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createPostgresClipScaleLedger} from '../../scripts/lib/clip-export-scale-ledger.mjs';
import {runClipScaleControllerTick} from '../../scripts/lib/clip-export-scale-controller.mjs';
import {syntheticClipHealthEvidence} from './clip-export-health-fixture.mjs';

const literal=value=>value===null?'null':`'${String(value).replaceAll("'","''")}'`;
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

// Test-only persistent psql transport. The caller already verified this local
// CLI container and generated clone. Do not accept a host, URI or credential.
function psqlFactory({container,database,afterQuery}){
 assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
 assert.match(database,/^runtime_authority_\d+_[a-f0-9]{12}_clip_pool$/u);
 const sessions=new Set(),identities=[];
 async function connect(){
  const ordinal=identities.length,name=`clip-scale-ledger-${randomUUID()}`;
  const identity={name,ordinal};identities.push(identity);
  const child=spawn('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d',database],{stdio:['pipe','pipe','pipe']});
  let pending='',stderr='',active,closed=false;
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdin.on('error',()=>{});
  child.stderr.on('data',part=>{stderr+=part;});
  child.stdout.on('data',part=>{
   pending+=part;const lines=pending.split('\n');pending=lines.pop();
   for(const line of lines){
    if(!active)continue;
    if(line===active.marker){
     const operation=active;active=undefined;clearTimeout(operation.timer);
     try{operation.resolve({rows:operation.lines.filter(Boolean).map(value=>JSON.parse(value))});}
     catch{operation.reject(new Error('clip_scale_psql_result_invalid'));}
    }else active.lines.push(line);
   }
  });
  const exited=new Promise(resolve=>{
   const finish=()=>{
    closed=true;
    if(active){clearTimeout(active.timer);active.reject(new Error(`clip_scale_psql_query_failed:${/ERROR:\s+([A-Z0-9]{5})/u.exec(stderr)?.[1]??'unknown'}`));active=undefined;}
    resolve();
   };
   child.on('error',finish);child.on('close',finish);
  });
  const client={
   async query(sql,parameters=[]){
    if(closed||active)throw new Error('clip_scale_psql_session_unavailable');
    const expanded=sql.replace(/\$(\d+)/gu,(_,index)=>literal(parameters[Number(index)-1]));
    const statement=expanded.trim().replace(/;\s*$/u,'');
    const wrapped=/^select\b/iu.test(statement)?`select row_to_json(result) from (${statement}) result;`:`${statement};`;
    const result=await new Promise((resolve,reject)=>{
     const marker=`CLIP_SCALE_DONE_${randomUUID().replaceAll('-','')}`;
     active={resolve,reject,marker,lines:[],timer:setTimeout(()=>child.kill('SIGTERM'),20000)};
     child.stdin.write(`${wrapped}\n\\echo ${marker}\n`);
    });
    await afterQuery?.({ordinal,sql,identity,result});return result;
   },
   async release(){
    if(!closed){child.stdin.end('\\q\n');const timer=setTimeout(()=>child.kill('SIGTERM'),2000);await exited;clearTimeout(timer);}
    sessions.delete(client);
   },
  };
  sessions.add(client);
  await client.query(`set application_name=${literal(name)}`);
  identity.pid=(await client.query('select pg_backend_pid() as pid')).rows[0].pid;
  return client;
 }
 return {connect,identities,close:()=>Promise.all([...sessions].map(client=>client.release()))};
}

/** Executes the actual durable ledger and actual controller against independent
 * native backends. Synthetic provider methods only count calls; no network.
 * The barrier pauses after the first real reservation UPDATE, before COMMIT.
 * It does not inject an advisory/row lock or substitute a test-only ledger. */
export async function proveNativeClipScaleLedger({container,database,query,until}){
 const releaseHolder=deferred();let held=false;
 const transport=psqlFactory({container,database,afterQuery:async({ordinal,sql})=>{
  if(ordinal===0&&!held&&sql.startsWith('update private.creator_clip_scale_ledger')){
   held=true;await releaseHolder.promise;
  }
 }});
 const ledger=createPostgresClipScaleLedger({connect:transport.connect});
 let now=Date.now(),createCalls=0,reconcileCalls=0;
 const poolId=`fixture_${randomUUID().replaceAll('-','')}`;
 const profile={approvalId:'SYNTHETIC NO PROVIDER AUTHORITY',poolId,profileId:'synthetic-profile',provider:'synthetic',region:'fixture-local',machineType:'fixture-local',currency:'USD',
  purpose:'clip-render',managedEphemeral:true,ownershipNamespace:'fixture-owned-ephemeral',
  minWorkers:0,maxWorkers:2,slotsPerWorker:1,globalSlotLimit:2,maxHourlyMicros:1000000,maxWorkerHourlyMicros:600000,expiresAtMs:now+3600000,startupProbeApproved:true};
 const executor={
  capabilities:async()=>({...profile,qualified:true,checkedAtMs:now,expiresAtMs:now+60000,workerHourlyMicros:600000,inventoryComplete:true,untrackedResourceCount:0,
   idempotentCreate:true,reconcileCreate:true,reconcileDelete:true,conditionalDrainedDelete:true}),
  create:async()=>{createCalls++;return {outcome:'unknown',settled:false};},
  reconcileCreate:async()=>{reconcileCalls++;return {outcome:'unknown',settled:false};},
 };
 const tick=()=>runClipScaleControllerTick({enabled:true,executionEnabled:true,profile,ledger,executor,clock:()=>now,
  plan:({observation})=>observation.activeWorkers===0?{action:'recommend-startup-probe',desiredWorkers:1}:{action:'hold'},
  telemetry:{healthEvidence:syntheticClipHealthEvidence(now,{workerIds:[]})}});
 let first,second,secondError;
 try{
  assert.equal(query(`select count(*) from private.creator_clip_scale_ledger where pool_id=${literal(poolId)};`),'0');
  let firstDone=false,firstError;
  first=tick().then(result=>{firstDone=true;return result;},error=>{firstDone=true;firstError=error;return {fixtureError:true};});
  await until(()=>{
   if(firstDone&&!held)throw firstError??new Error('actual controller returned before reserving native ledger state');
   return held;
  },'actual controller did not persist its initial reservation');
  second=tick().catch(error=>{secondError=error;return {fixtureError:true};});
  await until(()=>{
   if(secondError)throw secondError;
   return transport.identities[1]?.pid&&query(`select exists(select 1 from pg_stat_activity w
    where w.pid=${transport.identities[1].pid} and w.datname=current_database() and w.wait_event_type='Lock'
    and ${transport.identities[0].pid}=any(pg_blocking_pids(w.pid)));`)==='t';
  },'actual controller ledger first-insert backend contention');
  releaseHolder.resolve();
  const results=await Promise.all([first,second]);
  assert.equal(results[0].status,'unknown_create');assert.equal(results[1].action,'hold');assert.equal(results[1].reason,'operation_in_flight');
  assert.equal(createCalls,1,'two real controllers reserve before dispatch and cannot double-create');
  const read=()=>JSON.parse(query(`select state from private.creator_clip_scale_ledger where pool_id=${literal(poolId)};`));
  const reserved=read();assert.equal(reserved.resources.length,1);assert.equal(reserved.resources[0].status,'unknown_create');
  assert.equal(reserved.resources.reduce((sum,row)=>sum+row.hourlyMicros,0),600000,'unknown result retains approved cost exposure');
  assert.ok(reserved.resources.length<=profile.maxWorkers);
  now+=61000;await tick();assert.equal(createCalls,1);assert.equal(reconcileCalls,1,'restart reconciles unknown create rather than repeating it');
  const reconciled=read();assert.equal(reconciled.resources.length,1);assert.equal(reconciled.resources[0].hourlyMicros,600000);assert.equal(reconciled.resources[0].status,'unknown_create');
  assert.equal(reconciled.resources.reduce((sum,row)=>sum+row.hourlyMicros,0)<=profile.maxHourlyMicros,true);
 }finally{
  releaseHolder.resolve();await Promise.allSettled([first,second].filter(Boolean));await transport.close();
 }
}
