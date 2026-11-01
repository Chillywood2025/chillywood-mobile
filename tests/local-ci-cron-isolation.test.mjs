import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isolateLocalCron} from '../scripts/lib/local-ci-cron-isolation.mjs';

function fixture({original='on', failRun=false, failRestart=false, unchangedPostmaster=false, drift=false, admin=true}={}) {
  let setting=original, started='before', restarted=false, runs=0;
  const statements=[];
  const query=sql=> {
    statements.push(sql);
    if(sql.includes('rolsuper')) return admin?'t':'f';
    if(sql.includes('pg_postmaster_start_time')) return started;
    if(sql.includes('select setting') || sql.startsWith('show ')) return setting;
    if(sql.startsWith('alter system')) {setting=sql.includes("='off'")?'off':'on';return '';}
    if(sql.includes('jsonb_agg')) return drift && statements.some(s=>s.includes('pg_reload_conf'))?'changed':'all-job-metadata';
    return 't';
  };
  return {statements,get setting(){return setting;},get runs(){return runs;},
    options:{query,restart:()=>{if(failRestart)throw Error('restart failed');restarted=true;if(!unchangedPostmaster)started='after';},
      waitReady:()=>{},run:()=>{runs++;assert.ok(restarted);assert.equal(setting,'off');if(failRun)throw Error('proof failed');return 7;}}};
}
test('restart before proofs, preserve metadata and restore exact original on/off',async()=>{
  for(const original of ['on','off']){const f=fixture({original});assert.equal(await isolateLocalCron(f.options),7);assert.equal(f.setting,original);assert.equal(f.runs,1);assert.ok(!f.statements.some(s=>/update|delete|truncate/i.test(s)));}
});
test('proof failure restores launcher without changing original failure',async()=>{
  const f=fixture({failRun:true});await assert.rejects(isolateLocalCron(f.options),/proof failed/);assert.equal(f.setting,'on');
});
test('restart failure and unchanged postmaster refuse proof then restore',async()=>{
  for(const options of [{failRestart:true},{unchangedPostmaster:true}]){const f=fixture(options);await assert.rejects(isolateLocalCron(f.options));assert.equal(f.runs,0);assert.equal(f.setting,'on');}
});
test('metadata drift during restoration fails closed',async()=>{
  const f=fixture({drift:true});await assert.rejects(isolateLocalCron(f.options),/all cron metadata preserved/);
});
test('non-superuser refuses before configuration change or restart',async()=>{
  const f=fixture({admin:false});await assert.rejects(isolateLocalCron(f.options),/verified local Supabase superuser/);
  assert.equal(f.runs,0);assert.equal(f.setting,'on');assert.ok(!f.statements.some(s=>s.includes('alter system')));
});
test('all sequential database proofs enclosed; source fingerprint comparisons unmodified',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/required-validation.yml',import.meta.url),'utf8');
  const wrapped=workflow.split("node scripts/with-local-ci-cron-paused.mjs <<'NATIVE_PROOFS'")[1].split('\n          NATIVE_PROOFS')[0];
  assert.ok(workflow.indexOf('supabase migration up --local')<workflow.indexOf("node scripts/with-local-ci-cron-paused.mjs <<'NATIVE_PROOFS'"));
  assert.ok(!wrapped.includes('supabase db reset'));
  for(const name of ['supabase test db','test-archived-brand-verification-concurrency.mjs','test-brand-global-retention-concurrency.mjs','test:cognitive-runtime-login-integration'])assert.ok(wrapped.includes(name));
  const entry=readFileSync(new URL('../scripts/with-local-ci-cron-paused.mjs',import.meta.url),'utf8');
  for(const guard of ['GITHUB_ACTIONS','GITHUB_REPOSITORY','DOCKER_HOST','DOCKER_CONTEXT','com.supabase.cli.project','local Unix Docker daemon'])assert.ok(entry.includes(guard));
  assert.ok(entry.includes("'-U', 'supabase_admin'"));assert.ok(entry.includes('PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"'));
  for(const file of ['test-archived-brand-verification-concurrency.mjs','test-brand-global-retention-concurrency.mjs']){
    const source=readFileSync(new URL('../scripts/'+file,import.meta.url),'utf8');assert.match(source,/complete source (?:table )?row fingerprints unchanged/);
  }
});
