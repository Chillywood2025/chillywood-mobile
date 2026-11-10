// Actual-scale, local-only forward-deployment proof. No target connection API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {localFullCatalogFixture} from './deployment-scale-fixture.mjs';
import {catalogItemsSQL as baseCatalogItemsSQL} from '../../scripts/native-store-install-prepare.mjs';
import {extraCatalogSQL,scope} from './deployment-catalog-support.mjs';
import {IDENTITY,allowlist,catalogCapacity,readSettings,snapshotReadSQL,snapshotSelectSQL,validateObservation,verifySource,sha} from './deployment.mjs';
import {buildLocalFixtureDeploymentEnvelope,classifyLocalFixtureDeploymentOutcome,classifyDeploymentOutcome,fixedDeploymentBody,verifyFixedArtifact} from './deployment-envelope.mjs';
import {playPrivateStateReadSQL,validatePlayPrivateState} from './private-state-readback.mjs';

const rawCountSQL=baseCatalogItemsSQL.replaceAll("('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1')",scope)+' union all '+extraCatalogSQL;
// Independently count the full underlying catalog, not the bounded count or a
// substituted observation. Keep the OID projection identical to the observer.
const oidProjection=snapshotSelectSQL().match(new RegExp(',oids as materialized\\(([\\s\\S]+?) limit '+(catalogCapacity.oidRows+1)+'\\),history as materialized\\('))?.[1];
assert.ok(oidProjection,'The independent full OID counter must match the observer projection');
const fullCountSQL=`begin isolation level repeatable read read only;${readSettings}
 select jsonb_build_object('rawRows',(select count(*) from (${rawCountSQL}) raw_full),
 'oidRows',(select count(*) from (${oidProjection}) oid_full));rollback;`;
const preservedFields=['catalogCount','catalogSha256','retainedCount','retainedSha256','retainedOidSha256','allOidSha256','historyCount','historyMaximum','historySha256','moneyControlsSha256'];

function readers(f){
 const observe=()=>JSON.parse(f.q(snapshotReadSQL(),'supabase_read_only_user'));
 const count=()=>JSON.parse(f.q(fullCountSQL,'supabase_read_only_user'));
 const build=baseline=>buildLocalFixtureDeploymentEnvelope({baseline,fixtureToken:f.fixtureToken});
 return {observe,count,build};
}
function assertUnchanged(before,after){
 validateObservation(after,{before:true});
 for(const field of preservedFields)assert.deepEqual(after[field],before[field],field);
 assert.deepEqual(after.historyReceipts,before.historyReceipts);
 assert.equal(after.addedPresent,0);assert.equal(after.beforeChangedExact,true);
}

async function fullAtomicProof({bin,output,onProgress}){
 const f=await localFullCatalogFixture({bin,output,onProgress});
 try{
  const {observe,count,build}=readers(f),before=observe(),beforeCounts=count();
  validateObservation(before,{before:true});assert.equal(before.historyCount,631);
  assert.equal(beforeCounts.rawRows,before.catalogCount);
  assert.ok(beforeCounts.rawRows>45000&&beforeCounts.oidRows>26000,'Must exercise the actual full legacy/native catalog');
  assert.equal(before.addedPresent,0);assert.equal(before.beforeChangedExact,true);assert.equal(allowlist.added.length,418);
  const packet=build(before);
  assert.equal(packet.sql.match(/set local transaction_timeout='25s'/gu).length,1);
  assert.equal(packet.sql.match(/set local statement_timeout='20s'/gu).length,1);
  assert.equal(packet.sql.match(/insert into supabase_migrations\.schema_migrations/gu).length,1);
  assert.equal(packet.localFixtureOnly,true);assert.equal(packet.binding,null);
  assert.equal(classifyDeploymentOutcome({before,after:before,packet}).status,'outcome_unknown');
  const marker='drop table play_forward_before;';assert.equal(packet.sql.split(marker).length,2);
  // Inject only after all four real catalog observations, source DDL, history
  // insertion and final assertions. The fixed body itself remains unchanged.
  const rejectedSQL=packet.sql.replace(marker,"do $$begin raise exception 'fixture_scale_forced_late_failure';end$$;\n"+marker);
  const rollbackStart=performance.now(),rejected=f.run('psql',f.args('postgres'),rejectedSQL);
  const rollbackWallMs=Math.round(performance.now()-rollbackStart);
  assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/fixture_scale_forced_late_failure/u);
  assert.ok(rollbackWallMs<25000,'Full late-failure envelope must complete within the original transaction budget');
  const rolledBack=observe();assertUnchanged(before,rolledBack);
  assert.deepEqual(count(),beforeCounts);
  assert.equal(classifyLocalFixtureDeploymentOutcome({before,after:rolledBack,packet}).status,'unchanged_observed');
  onProgress({phase:'full-envelope-late-rollback',...beforeCounts,historyRows:before.historyCount,wallMs:rollbackWallMs,originalGuardsPreserved:true});
  const successStart=performance.now(),applied=f.run('psql',f.args('postgres'),packet.sql);
  const successWallMs=Math.round(performance.now()-successStart);
  assert.equal(applied.status,0,applied.stderr||applied.error?.message);
  assert.ok(successWallMs<25000,'Full successful envelope must complete within the original transaction budget');
  // Separate new genuine-reader sessions, never the writer's result payload.
  const after=observe(),afterCounts=count();validateObservation(after);
  assert.equal(after.catalogCount-before.catalogCount,418);assert.equal(afterCounts.rawRows-beforeCounts.rawRows,418);
  assert.equal(after.addedPresent,418);assert.equal(after.addedExact,true);assert.equal(after.afterChangedExact,true);
  for(const field of ['retainedCount','retainedSha256','retainedOidSha256','moneyControlsSha256'])assert.equal(after[field],before[field],field);
  assert.equal(after.historyCount,before.historyCount+1);
  assert.deepEqual(after.historyReceipts.filter(receipt=>receipt.version!==IDENTITY.version),before.historyReceipts);
  assert.equal(classifyLocalFixtureDeploymentOutcome({before,after,packet}).status,'exact_source_receipt_observed_committed_install_state_only');
  const privateState=validatePlayPrivateState(JSON.parse(f.q(playPrivateStateReadSQL,'supabase_read_only_user')));
  assert.equal(privateState.defaultOffAndEmptyObserved,true);
  assert.equal(after.ownerPrivilegesRestored,true);assert.equal(after.moneyHeld,true);
  const result={setup:f.setup,before:beforeCounts,after:afterCounts,historyBefore:before.historyCount,historyAfter:after.historyCount,
   exactAdded:418,oldCatalogAndOidsPreserved:true,allPriorHistoryPreserved:true,defaultOffNineEmptyObserved:true,
   statementTimeoutMs:20000,transactionTimeoutMs:25000,lateRollbackWallMs:rollbackWallMs,successWallMs};
  onProgress({phase:'full-envelope-success',...result});return result;
 }finally{f.stop();}
}

async function boundaryProof({bin,output,onProgress}){
 const f=await localFullCatalogFixture({bin,output,onProgress});
 try{
  const {observe,count,build}=readers(f),before=observe(),initial=count(),packet=build(before),results=[];
  let functionIndex=0;const functions=[],tables=[];
  const addFunctions=number=>{
   assert.ok(Number.isSafeInteger(number)&&number>=0&&number<=catalogCapacity.oidRows);
   if(!number)return;
   const first=functionIndex+1,last=functionIndex+number;
   f.q(`do $padding$ begin for i in ${first}..${last} loop
    execute format('create function public.play_scale_padding_function_%s() returns integer language sql immutable as %L',i,'select 1');
    end loop;end $padding$;`);
   for(let i=first;i<=last;i++)functions.push('public.play_scale_padding_function_'+i+'()');functionIndex=last;
  };
  const cleanup=()=>{
   if(functions.length)f.q('drop function '+functions.join(',')+';');functions.length=0;
   if(tables.length)f.q('drop table '+tables.join(',')+';');tables.length=0;
   assert.deepEqual(count(),initial);assertUnchanged(before,observe());
  };
  const prove=(dimension,expected,accepted)=>{
   const measured=count(),observation=observe();assert.equal(measured[dimension],expected);
   assert.equal(observation.catalogCount,Math.min(measured.rawRows,catalogCapacity.rawRows+1));
   assert.equal(observation.withinBounds,accepted);
   assert.equal(observation.duplicateKeys,0);assert.equal(observation.ambiguousACLs,0);
   if(accepted){validateObservation(observation,{before:true});assert.equal(build(observation).localFixtureOnly,true);}
   else{
    assert.throws(()=>validateObservation(observation,{before:true}),/observation_controls_invalid/u);
    assert.throws(()=>build(observation),/observation_controls_invalid/u);
    const outcome=classifyLocalFixtureDeploymentOutcome({before,after:observation,packet});
    assert.equal(outcome.status,'outcome_unknown');assert.equal(outcome.retryAllowed,false);
    assert.equal(observation.addedPresent,0);assert.equal(observation.historyCount,before.historyCount);
   }
   const result={dimension,expected,...measured,observationCatalogRows:observation.catalogCount,observationAccepted:accepted,overflowRefusedBeforeEnvelope:!accepted};
   // A complete at-ceiling baseline is observable, but it has no capacity for
   // the genuine forward additions. Apply must fail closed and roll back, not
   // turn observation completeness into deployment qualification.
   if(accepted&&expected===catalogCapacity[dimension]){
    const boundedPacket=build(observation),start=performance.now();
    const rejected=f.run('psql',f.args('postgres'),boundedPacket.sql);
    result.applyOverflowWallMs=Math.round(performance.now()-start);
    assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/play_exact_catalog_mismatch/u);
    assert.ok(result.applyOverflowWallMs<25000);
    assertUnchanged(observation,observe());assert.deepEqual(count(),measured);
    result.applyOverflowRolledBack=true;
   }
   results.push(result);onProgress({phase:'catalog-boundary',...result});
  };
  // Each plain integer column contributes two real catalog rows but no OID
  // row. Each wide table contributes one relation and two real implicit types.
  let remaining=catalogCapacity.rawRows-1-initial.rawRows;assert.ok(remaining>0);
  while(remaining>=5){
   const columns=Math.min(800,Math.floor((remaining-3)/2)),name='public.play_scale_padding_table_'+tables.length;
   f.q(`create table ${name}(${Array.from({length:columns},(_,i)=>'column_'+i+' integer').join(',')});`);
   tables.push(name);remaining-=3+2*columns;
  }
  addFunctions(remaining);
  assert.ok(count().oidRows<catalogCapacity.oidRows,'Raw boundary must not hit the OID boundary');
  prove('rawRows',catalogCapacity.rawRows-1,true);addFunctions(1);
  prove('rawRows',catalogCapacity.rawRows,true);addFunctions(1);
  prove('rawRows',catalogCapacity.rawRows+1,false);cleanup();
  // Real, simple pg_proc entries add one raw and one OID row apiece. No fake
  // counts, edited observations, ceiling substitutions or observer stubs.
  addFunctions(catalogCapacity.oidRows-1-initial.oidRows);
  assert.ok(count().rawRows<catalogCapacity.rawRows,'OID boundary must not hit the raw boundary');
  prove('oidRows',catalogCapacity.oidRows-1,true);addFunctions(1);
  prove('oidRows',catalogCapacity.oidRows,true);addFunctions(1);
  prove('oidRows',catalogCapacity.oidRows+1,false);cleanup();
  return results;
 }finally{f.stop();}
}

export async function runPlayDeploymentScaleNativeCases({bin,onProgress=()=>{}}){
 assert.deepEqual(catalogCapacity,{rawRows:60000,oidRows:35000});verifySource();verifyFixedArtifact();
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'play-full-deployment-proof-')),start=performance.now();
 try{
  const atomic=await fullAtomicProof({bin,output,onProgress});
  const boundaries=await boundaryProof({bin,output,onProgress});
  return {protocol:'native-store-play-deployment-actual-scale-proof-v1',localOnly:true,sourceBodySha256:sha(fixedDeploymentBody()),
   cases:8,atomic,boundaries,wallMs:Math.round(performance.now()-start),deploymentAllowed:false,activationAllowed:false,retryAllowed:false};
 }finally{fs.rmSync(output,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--local-bin');
 console.log(JSON.stringify(await runPlayDeploymentScaleNativeCases({bin:process.argv[3],onProgress:value=>console.log(JSON.stringify(value))})));
}
