import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

// Source/CLI checks only. These do NOT establish native PostgreSQL correctness.
const path='scripts/test-auction-transfer-concurrency-postgres.mjs';
const source=readFileSync(path,'utf8');
test('native transfer runner help and remote-argument rejection need no database',()=>{
  const help=spawnSync(process.execPath,[path,'--help'],{encoding:'utf8'});
  assert.equal(help.status,0);assert.match(help.stdout,/disposable clone/);
  const remote=spawnSync(process.execPath,[path,'postgres://remote.invalid/forbidden'],{encoding:'utf8'});
  assert.notEqual(remote.status,0);assert.match(remote.stderr,/no remote URL or positional arguments accepted/);
});
test('canonical Database job preserves existing runner and adds transfer races',()=>{
  const workflow=readFileSync('.github/workflows/required-validation.yml','utf8');
  assert.match(workflow,/SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts\/test-auction-transfer-concurrency-postgres\.mjs/);
  assert.match(workflow,/node scripts\/test-room-seat-auction-concurrency-postgres\.mjs/);
});
test('native runner asserts real backend barriers, both refund orderings, bounded reversals and clone cleanup',()=>{
  for(const marker of ['pg_blocking_pids','wait_event_type',"refund commits first",'dispatch commits first','eligibility loss commits first',
    'release evidence revocation wins','new verified cost allocation','concurrent reversals cannot over-reserve',
    'double reversal confirmation','restore.assertSourceUnchanged()',"'--force',database",'assert.equal(checks,14)']) assert.ok(source.includes(marker),marker);
  assert.doesNotMatch(source,/disable trigger|session_replication_role|create or replace function|fetch\(/iu);
});
