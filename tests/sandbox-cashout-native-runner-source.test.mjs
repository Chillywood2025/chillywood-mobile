import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

// Registration/transport checks only, never a substitute for PostgreSQL runs.
const path='scripts/test-sandbox-cashout-concurrency-postgres.mjs';
const source=readFileSync(path,'utf8');
test('sandbox native runner is local-clone-only and has offline help',()=>{
 const help=spawnSync(process.execPath,[path,'--help'],{encoding:'utf8'});
 assert.equal(help.status,0);assert.match(help.stdout,/disposable clone/);
 const remote=spawnSync(process.execPath,[path,'postgres://remote.invalid/forbidden'],{encoding:'utf8'});
 assert.notEqual(remote.status,0);assert.match(remote.stderr,/no arbitrary target arguments/);
});
test('sandbox contention executes in mandatory Database native proofs without replacing live tests',()=>{
 const workflow=readFileSync('.github/workflows/required-validation.yml','utf8');
 const native=workflow.split("node scripts/with-local-ci-cron-paused.mjs <<'NATIVE_PROOFS'")[1]?.split('\n          NATIVE_PROOFS')[0];
 assert.ok(native);
 for(const name of ['cashout-execution','sandbox-cashout'])assert.ok(native.includes(`SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-${name}-concurrency-postgres.mjs`));
});
test('native runner retains real blocking and disposable-source boundaries',()=>{
 for(const marker of ['pg_blocking_pids',"['refund','revocation']","['session','tester','control']","['commit','rollback']",'sameOperation',"['cancel','payout']",'2:9175:25','9274','sandbox_terminal_observation_conflict','production(),a.production','restore.assertSourceUnchanged()',"'--force',database"])
  assert.ok(source.includes(marker),marker);
 assert.doesNotMatch(source,/disable trigger|session_replication_role|create or replace function|fetch\(/iu);
});
