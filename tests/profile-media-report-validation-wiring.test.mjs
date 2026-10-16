import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {computeValidationPlan} from '../scripts/ci/required-validation.mjs';

const migrationName = '20261016113149_profile_media_report_enforcement_repair.sql';
const root = new URL('../', import.meta.url);
const receipt = JSON.parse(fs.readFileSync(new URL('docs/PROFILE_MEDIA_REPORT_ENFORCEMENT_DEPLOYMENT_2026_10_16.json', root), 'utf8'));
const directory = new URL('supabase/migrations/', root);
const names = fs.readdirSync(directory);
const source = fs.readFileSync(new URL(migrationName, directory), 'utf8');
const payload = fs.readFileSync(new URL(receipt.payloadFile, root), 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');

function verify(files, sql, deployed, record) {
  assert.deepEqual(files.filter(name => name.endsWith('_profile_media_report_enforcement_repair.sql')),
    [migrationName], 'keep exactly one repair at its deployed timestamp');
  assert.equal(record.version, '20261016113149');
  assert.equal(record.name, 'profile_media_report_enforcement_repair');
  assert.equal(record.sourceFilename, migrationName);
  assert.equal(record.originalSourceVersion, '20261016002724');
  assert.equal(record.sourceSha256, 'c09ea883cba407349465ab0f8b6ec6ee33855aa10d1703e8f1c36ee216729088');
  assert.equal(sha(sql), record.sourceSha256, 'the deployed source body is immutable');
  assert.equal(record.payloadSha256, 'cd6488ff21f63320f8f0c4d37c820cd4ee89ec13f2cd2e5399e6766c0d6f0907');
  assert.equal(sha(deployed), record.payloadSha256, 'preserve the exact stored deployment statement');
  const embedded = deployed.split('$profile_media_exact_source$');
  assert.equal(embedded.length, 3, 'deployment wrapper embeds the source exactly once');
  assert.equal(embedded[1], `\n${sql}`, 'replayable source is byte-for-byte unchanged inside the wrapper');
  assert.equal(record.payloadFile, 'docs/deployments/20261016113149_profile_media_report_enforcement_repair.payload.sql');
  assert.equal(record.payloadReplayable, false, 'production history guards stay outside migration replay');
  assert.ok(!sql.includes('$profile_media_deploy$'), 'migration replay must not include the rollout wrapper');
}

test('profile media repair keeps the deployed version, source and separate exact payload', () => {
  verify(names, source, payload, receipt);
});

test('profile media alignment rejects stale, duplicate, changed-body and wrapper replay controls', () => {
  const oldName = '20261016002724_profile_media_report_enforcement_repair.sql';
  const controls = [
    [names.map(name => name === migrationName ? oldName : name), source, payload, receipt],
    [[...names, oldName], source, payload, receipt],
    [names, `${source}\n`, payload, receipt],
    [names, source, `${payload}\n`, receipt],
    [names, payload, payload, receipt],
    [names, source, payload, {...receipt, version: '20261016002724'}],
    [names, source, payload, {...receipt, payloadReplayable: true}],
    [names, source, payload, {...receipt, payloadFile: `supabase/migrations/${migrationName}`}],
  ];
  for (const control of controls) assert.throws(() => verify(...control), assert.AssertionError);
});

test('profile moderation behavior, mutations, pgTAP and native queues are on required CI paths', () => {
  const paths = [
    `supabase/migrations/${migrationName}`,
    'supabase/tests/moderation_notification_activity_test.sql',
    'tests/profile-media-report-enforcement.test.mjs',
    'tests/profile-media-report-mutation-controls.test.mjs',
    'scripts/test-database-runtime-authority-concurrency.mjs',
    'scripts/profile-media-report-concurrency-cases.mjs',
  ];
  const plan = computeValidationPlan(paths);
  assert.equal(plan.categories.product, true);
  assert.equal(plan.categories.database, true);
  assert.equal(plan.categories.sensitive, true);
  const workflow = fs.readFileSync(new URL('../.github/workflows/required-validation.yml', import.meta.url), 'utf8');
  assert.match(workflow, /node --test tests\/\*\.test\.mjs/u);
  assert.match(workflow, /supabase test db/u);
  assert.match(workflow, /node scripts\/test-database-runtime-authority-concurrency\.mjs/u);
  const runner = fs.readFileSync(new URL('../scripts/test-database-runtime-authority-concurrency.mjs', import.meta.url), 'utf8');
  assert.match(runner, /import \{runProfileMediaReportConcurrency\} from '\.\/profile-media-report-concurrency-cases\.mjs'/u);
  assert.match(runner, /await runProfileMediaReportConcurrency\(\{/u);
});
