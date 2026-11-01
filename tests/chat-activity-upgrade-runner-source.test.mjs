import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {parse} from 'yaml';
import {assertDatabaseUpgradeCI, databaseUpgradeCommands, databaseCronBoundary} from './helpers/assert-database-upgrade-ci.mjs';
import {chatActivityUpgradeSQL, chatActivityMigration} from './helpers/chat-activity-upgrade-fixture.mjs';

const runner = 'scripts/test-chat-activity-upgrade-postgres.mjs';
test('upgrade runner refuses remote arguments and documents native versus preflight proof', () => {
  const help = spawnSync(process.execPath,[runner,'--help'],{encoding:'utf8'});
  assert.equal(help.status,0);
  assert.match(help.stdout,/PostgreSQL 17 only/);
  const remote = spawnSync(process.execPath,[runner,'postgres://remote.invalid/forbidden'],{encoding:'utf8'});
  assert.notEqual(remote.status,0);
  assert.match(remote.stderr,/no remote URL/);
  for (const [key,value] of [['DOCKER_HOST','tcp://remote.invalid:2375'],['DOCKER_CONTEXT','remote']]) {
    const env = {...process.env, [key]:value};
    const rejected = spawnSync(process.execPath,[runner],{encoding:'utf8',env});
    assert.notEqual(rejected.status,0);
    assert.match(rejected.stderr,/remote Docker hosts|Docker context overrides/);
  }
});
test('populated regression applies actual migration bytes inside rollback boundary', () => {
  const sql = chatActivityUpgradeSQL();
  assert.ok(sql.includes(readFileSync(`supabase/migrations/${chatActivityMigration}`,'utf8')));
  for (const marker of ['account_access_restricted','banned_until','scheduled','123456','654321',
    'all original public.chat_threads fields unchanged','restriction functions, ACLs and triggers unchanged',
    'next admission above deleted legacy head','rollback restores predecessor schema','temporary helper removed']) {
    assert.ok(sql.includes(marker),marker);
  }
  assert.ok(sql.indexOf('savepoint before_upgrade;') < sql.indexOf('-- Meaningful conversation activity'));
  assert.ok(sql.indexOf('rollback to savepoint before_upgrade;') > sql.indexOf('-- Meaningful conversation activity'));
  assert.doesNotMatch(sql,/disable trigger|session_replication_role|alter role/iu);
});
test('canonical CI uses one predecessor reset, real upgrade test, official migration up, then full suite', () => {
  const workflow = readFileSync('.github/workflows/required-validation.yml','utf8');
  assert.equal((workflow.match(/supabase db reset --local --version 20261031204321/gu) ?? []).length,1);
  const step=parse(workflow).jobs.database.steps.find(s=>s.run?.split('\n').includes(databaseUpgradeCommands[2]));
  assertDatabaseUpgradeCI(step.run);
  assert.match(workflow,/node scripts\/test-chat-call-retry-concurrency-postgres\.mjs/u);
  const source = readFileSync(runner,'utf8');
  assert.match(source,/preflight.version >= 170000 && preflight.version < 180000/u);
  assert.match(source,/timeout:180000/u);
  assert.match(source,/\['--host',socket,'exec'/u);
});

test('upgrade CI sequence rejects missing, reordered, duplicated, skipped or swallowed prerequisites', () => {
  const workflow = parse(readFileSync('.github/workflows/required-validation.yml','utf8'));
  const commands = databaseUpgradeCommands;
  const check = candidate => {
    const job = candidate.jobs.database;
    assert.equal(job.if,"needs.plan.outputs.database == 'true'");
    assert.equal(job['continue-on-error'],undefined);
    const steps = job.steps.filter(step => step.run?.split('\n').includes(commands[2]));
    assert.equal(steps.length,1);
    const step = steps[0];
    assert.equal(step.if,undefined);
    assert.equal(step['continue-on-error'],undefined);
    assertDatabaseUpgradeCI(step.run);
  };
  check(workflow);
  for (const command of commands) for (const mode of ['omit','duplicate','swallow','reorder','skip']) {
    const candidate = structuredClone(workflow);
    const step = candidate.jobs.database.steps.find(s => s.run?.includes(commands[2]));
    if (mode === 'omit') step.run = step.run.replace(command,'');
    if (mode === 'duplicate') step.run += `\n${command}`;
    if (mode === 'swallow') step.run = step.run.replace(command,`${command} || true`);
    if (mode === 'reorder') step.run = step.run.replace(command,'') + `\n${command}\n# moved`;
    if (mode === 'skip') step.if = 'false';
    // Moving the final command to the end is still correctly ordered.
    if (mode === 'reorder' && command === commands.at(-1)) step.run = `${command}\n${step.run.replace(command,'')}`;
    assert.throws(() => check(candidate),assert.AssertionError,`${mode}: ${command}`);
  }
  for(const mutate of [
    run=>run.replace(databaseCronBoundary,''),
    run=>run.replace(databaseCronBoundary,databaseCronBoundary+' || true'),
    run=>run.replace(databaseCronBoundary,databaseCronBoundary.replace("'NATIVE_PROOFS'",'NATIVE_PROOFS')),
    run=>run.replace(databaseCronBoundary,'echo ignored\n'+databaseCronBoundary),
    run=>run.replace(databaseCronBoundary,databaseCronBoundary+'\n'+databaseCronBoundary),
    run=>run.replace('\nNATIVE_PROOFS',''),
    run=>run.replace('\nNATIVE_PROOFS','')+'\nNATIVE_PROOFS\ntrue',
    run=>run.replace('supabase test db','NATIVE_PROOFS\nsupabase test db').replace(/\nNATIVE_PROOFS\n?$/u,''),
  ]) {
    const candidate=structuredClone(workflow);
    const step=candidate.jobs.database.steps.find(s=>s.run?.includes(commands[2]));step.run=mutate(step.run);
    assert.throws(()=>check(candidate),assert.AssertionError,'invalid isolation boundary must fail');
  }
});
