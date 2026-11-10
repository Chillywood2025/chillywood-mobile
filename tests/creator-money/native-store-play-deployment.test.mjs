import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HERE,IDENTITY,manifest,allowlist,verifySource,snapshotReadSQL,validateObservation} from '../../isolated-runtime/native-store-play-handoff-v1/deployment.mjs';
import {fixedDeploymentBody,verifyFixedArtifact,buildDeploymentEnvelope,classifyDeploymentOutcome} from '../../isolated-runtime/native-store-play-handoff-v1/deployment-envelope.mjs';
test('fixed forward source artifact pins CLI identity and all three exact modules',()=>{
 const a=verifyFixedArtifact();assert.deepEqual(IDENTITY,{version:'20261110021650',name:'native_store_play_handoff_settlement_v1'});
 assert.equal(a.sourceSlices.length,3);assert.equal(a.changedCount,9);assert.equal(a.addedCount,418);
 assert.equal(a.deploymentAllowed,false);assert.equal(a.retryAllowed,false);
 const body=fixedDeploymentBody();for(const s of verifySource())assert.ok(body.includes(s.data.toString('utf8')));
 assert.equal(body.includes('create role sbx_v1_core_owner'),false);assert.equal(body.includes('insert into supabase_migrations.schema_migrations'),false);
 assert.equal(allowlist.changed.filter(x=>!x.oidMustBeRetained).length,1);
 assert.equal(manifest.baseSourceDigest,'e07d2e3266789b1d5e5c9665e03245f6edf1abb43643e16b06d718ef4c77e33d');
});
test('observation is bounded genuine read-only metadata SQL without private grants',()=>{
 const sql=snapshotReadSQL();assert.match(sql,/begin isolation level repeatable read read only;/u);assert.match(sql,/rollback;\s*$/u);
 for(const unexpected of [/\bcreate\s+(?:temp|function|table)/iu,/\bgrant\b/iu,/\bset\s+(?:local\s+)?role\b/iu,/\bdo\s+\$/iu,/select public\.native_store/iu])assert.doesNotMatch(sql.replace(/^--.*$/gmu,''),unexpected);
 for(const cap of ['limit 25001','limit 2501','cardinality(statements) between 1 and 256','octet_length(s)<=8388608','<=16777216'])assert.ok(sql.includes(cap),cap);
 assert.equal(sql.match(/transaction_timeout='25s'/gu).length,1);assert.match(sql,/pg_postmaster_start_time/u);
 assert.doesNotMatch(sql,/string_agg\(item::text/u);assert.doesNotMatch(sql,/jsonb_agg\(item /u);
});
test('builder requires a complete fresh baseline and never exposes transport',()=>{
 assert.throws(()=>buildDeploymentEnvelope({baseline:null}));assert.throws(()=>validateObservation({}));
 const code=fs.readFileSync(HERE+'/deployment-envelope.mjs','utf8');
 assert.doesNotMatch(code,/fetch\(|https\.request|apply_migration\(/u);
 for(const marker of ['play_target_baseline_changed','play_exact_history_receipt_mismatch','set constraints all immediate','drop table play_forward_before;'])assert.ok(code.includes(marker));
});
test('uncertain partial malformed recovery never reports success or allows retry',()=>{
 for(const value of [null,{}, {protocol:'play-forward-observation-v1'}]){
  const r=classifyDeploymentOutcome({before:value,after:value,packet:value});
  assert.equal(r.status,'outcome_unknown');assert.equal(r.retryAllowed,false);assert.equal(r.currentPrivateRuntimeState,'UNQUALIFIED');
 }
});
