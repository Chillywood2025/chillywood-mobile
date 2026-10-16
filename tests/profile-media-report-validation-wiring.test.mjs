import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {computeValidationPlan} from '../scripts/ci/required-validation.mjs';

test('profile moderation behavior, mutations, pgTAP and native queues are on required CI paths', () => {
  const paths = [
    'supabase/migrations/20261016002724_profile_media_report_enforcement_repair.sql',
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
