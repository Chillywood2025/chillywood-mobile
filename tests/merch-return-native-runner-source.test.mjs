import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
// Source/CLI checks only, not native PostgreSQL execution evidence.
const path='scripts/test-merch-return-cases-concurrency-postgres.mjs';
const source=readFileSync(path,'utf8');
test('return race runner help and remote rejection require no local server',()=>{
 const help=spawnSync(process.execPath,[path,'--help'],{encoding:'utf8'});assert.equal(help.status,0);assert.match(help.stdout,/generated local clone/);
 const remote=spawnSync(process.execPath,[path,'postgres://remote.invalid/forbidden'],{encoding:'utf8'});assert.notEqual(remote.status,0);assert.match(remote.stderr,/no remote URL or positional arguments accepted/);
});
test('canonical Database job registers return contention and retains carrier races',()=>{
 const workflow=readFileSync('.github/workflows/required-validation.yml','utf8');
 for(const runner of ['merch-return-cases','merch-tracking'])assert.ok(workflow.includes('SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-'+runner+'-concurrency-postgres.mjs'));
});
test('native return races assert real locking edges, aggregate holds and both carrier/closure orderings',()=>{
 for(const marker of ['pg_blocking_pids','wait_event_type','simultaneous case opens retain both unresolved claims','case closes while carrier evidence arrives after return deadline','same creator response retry remains exactly once','carrier evidence commits before last closure without clearing provider dispute','unresolvedReturnCaseCount,2','unresolvedReturnCaseCount,1','unresolvedReturnCaseCount,0','merch_dispute_unresolved','restore.assertSourceUnchanged()',"'--force',database",'assert.equal(checks,4)'])assert.ok(source.includes(marker),marker);
 assert.doesNotMatch(source,/disable trigger|session_replication_role|create or replace function|fetch\(/iu);
});
test('registered native runner includes exact checkout dispatch/cancellation blocking schedules',()=>{
 assert.match(source,/await runMerchCheckoutDispatchRaces/);assert.match(source,/assert.equal\(checks,10\)/);
 const checkout=readFileSync('scripts/lib/merch-checkout-dispatch-races.mjs','utf8');
 assert.doesNotMatch(checkout.match(/insert into public\.beta_access_memberships[^;]+;/)?.[0]??'',/on conflict/i);
 for(const marker of ['checkout duplicate reservations serialize to one hold','proven no-dispatch abort wins before dispatch',
  'durable dispatch wins before cleanup','duplicate no-dispatch cancellation cannot double-restock',
  'retained webhook global latch precedes new cancellation product lock','retained reservation global latch precedes new reservation buyer lock'])assert.ok(checkout.includes(marker),marker);
 assert.match(source,/holder.child.stdin.end\(afterBlocked\+'commit/);
 assert.doesNotMatch(checkout,/disable trigger|session_replication_role|create or replace function|fetch\(/iu);
});
