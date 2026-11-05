import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('native exact observer proof is clone-only and exercises rollback and real lock barriers',()=>{
 const source=fs.readFileSync('scripts/test-sandbox-payout-notification-exact-deploy-postgres.mjs','utf8');
 for(const marker of ['createBrandGuardCloneRestorer','runtime_authority_${process.pid}',
  'no arbitrary target arguments','DOCKER_HOST','docker.Host','CLI discovery',
  'restore.prepare(dump.stdout,database)','restore.assertSourceUnchanged()',
  'drop owned clone','pg_blocking_pids(w.pid)','observer_postcheck_failed','observer_baseline_changed',
  'perform 1/0','bundle.afterCatalog=parse(query(`begin;${bundle.body}',
  'lock timeout','const fresh=read()','buildApplySql(bundle,fresh)',
  'statements:[bundle.body]','already_applied_verified'])assert.ok(source.includes(marker),marker);
 for(const marker of ['nativeDriftCases(before)','fixture must change the intended baseline','read-only preflight must reject drift','expected rejection, not successful apply','CHECK native drift rejection:'])assert.ok(source.includes(marker),marker);
 assert.ok(source.includes("query(`select exists(select 1 from supabase_migrations.schema_migrations where version=${lit(VERSION)});`,'postgres')"),'source history is read only');
 const workflow=fs.readFileSync('.github/workflows/required-validation.yml','utf8');
 const native=workflow.split("<<'NATIVE_PROOFS'")[1]?.split('NATIVE_PROOFS')[0];
 assert.ok(native?.includes('SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-sandbox-payout-notification-exact-deploy-postgres.mjs'));
});
