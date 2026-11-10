import {materializeHistoricalProofPackage} from './helpers/historical-revenuecat-closure.mjs';
import {Buffer} from 'node:buffer';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const historicalProof=materializeHistoricalProofPackage();
const {sql}=await import(new URL('qualifier.mjs',historicalProof));
const {assertPinned,verifyInputs}=await import(new URL('verify-inputs.mjs',historicalProof));
const sha=s=>createHash('sha256').update(s).digest('hex');
test('portable package pins reviewed statement; materialization is the sole query change',()=>{
 const lock=verifyInputs();assert.equal(sha(sql),lock.qualifierSha256);
 const original=sql.replace('observed as materialized (','observed as (').replaceAll(' as materialized (',' as(');
 assert.equal(sha(original),lock.priorQualifierSha256);
 assert.equal((sql.match(/ as materialized \(/g)||[]).length,10);
 assert.match(sql,/set local statement_timeout='30s'/);
 assert.match(sql,/'edgeQualified',false,'deploymentQualified',false/);
});
test('arbitrary delta, type mapping, source bytes and unknown inputs fail locked provenance',()=>{
 for(const name of ['scripts/google-refund-tax-observer-proof/inverse-catalog-delta.json','scripts/google-refund-tax-observer-proof/refund-native-types.json','ops/automatic-commerce-cutover/catalog.mjs','supabase/config.toml','tests/helpers/client-api-grant-consumers.mjs','tests/fixtures/explicit-api-nondata-properties.json']){
  const bytes=fs.readFileSync(new URL('../../'+name,historicalProof));
  assert.doesNotThrow(()=>assertPinned(name,bytes));
  assert.throws(()=>assertPinned(name,Buffer.concat([bytes,Buffer.from(' ')])),/PROOF_SOURCE_DRIFT/);
 }
 assert.throws(()=>assertPinned('arbitrary.json','{}'),/PROOF_SOURCE_DRIFT/);
});

test('executable emitter is offline-only, emits staged packet and never retired combined packet',async()=>{
 const {spawnSync}=await import('node:child_process');
 const command=new URL('generate.mjs',historicalProof).pathname;
 const denied=spawnSync(process.execPath,[command],{encoding:'utf8'});
 assert.notEqual(denied.status,0);assert.equal(denied.stdout,'');assert.match(denied.stderr,/OFFLINE_FLAG_REQUIRED/);
 const allowed=spawnSync(process.execPath,[command,'--offline'],{encoding:'utf8'});
 assert.equal(allowed.status,0);const lock=verifyInputs();assert.equal(sha(allowed.stdout),lock.stagedQualifierSha256);
 assert.notEqual(sha(allowed.stdout),lock.qualifierSha256);
 const metadata=JSON.parse(allowed.stderr);for(const k of ['databaseBaselineQualified','targetExecutionAuthorized','targetMemoryHeadroomAccepted','edgeQualified','deploymentQualified'])assert.equal(metadata[k],false);
 assert.equal(metadata.offlineOnly,true);
});
test('staged native evidence meets local budgets without claiming target memory acceptance',()=>{
 const base=new URL('../scripts/google-refund-tax-observer-proof/',import.meta.url);
 const report=JSON.parse(fs.readFileSync(new URL('staged-native-benchmark.json',base)));
 const evidence=JSON.parse(fs.readFileSync(new URL('staged-evidence.json',base)));
 assert.equal(report.nativeVersion,'17.6');assert.equal(report.role,'supabase_read_only_user');assert.equal(report.stages.length,5);
 for(const stage of report.stages){assert.ok(stage.nodes<=evidence.localBudgets.maxStagePlanNodes);assert.ok(stage.totalCost<=evidence.localBudgets.maxStageTotalCost);assert.ok(stage.wallSeconds<=evidence.localBudgets.maxStageWallSeconds);}
 assert.ok(report.wholeWallSeconds<=evidence.localBudgets.maxWholeWallSeconds);assert.ok(report.wholePeakRSSKB>0);
 assert.equal(evidence.targetMemoryHeadroomAccepted,false);assert.equal(evidence.targetExecutionAuthorized,false);assert.equal(report.final.databaseBaselineQualified,false);
});
