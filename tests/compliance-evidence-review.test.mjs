import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRegister, summarizeCompliance, jurisdictions, run } from '../scripts/compliance-evidence-review.mjs';
const today = '2026-11-14';
const reviewed = () => ({ status: 'reviewed', reviewer: 'reviewer_one', evidenceRef: 'evidence_one', reviewedOn: '2026-11-01', reviewBy: '2027-01-01' });
test('template includes all 50 states plus DC, separately tracks reporting, and never grants clearance', () => {
  assert.equal(new Set(jurisdictions).size, 51);
  const summary = summarizeCompliance(createRegister(), today);
  assert.equal(summary.counts.unreviewed, 106);
  assert.equal(summary.activationAuthority, false);
  assert.equal(summary.legalClearance, false);
});
test('recorded review remains inventory, does not echo private references', () => {
  const input = createRegister(); input.jurisdictions[0].sales_tax = reviewed();
  const summary = summarizeCompliance(input, today);
  assert.equal(summary.counts.review_recorded, 1);
  assert.equal(summary.activationAuthority, false);
  assert.ok(!JSON.stringify(summary).includes('reviewer_one'));
  assert.ok(!JSON.stringify(summary).includes('evidence_one'));
});
test('expired, same-day and approaching review deadlines need action', () => {
  for (const [deadline, status] of [['2026-11-13', 'review_due'], ['2026-11-14', 'review_due'], ['2026-12-14', 'review_due_soon']]) {
    const input = createRegister(); input.jurisdictions[0].sales_tax = { ...reviewed(), reviewBy: deadline };
    assert.equal(summarizeCompliance(input, today).counts[status], 1);
  }
});
test('missing, duplicate, unknown jurisdiction and unexpected fields rejected', () => {
  for (const mutate of [r => r.jurisdictions.pop(), r => r.jurisdictions[0].state = 'AK', r => r.jurisdictions[0].state = 'PR', r => r.secret = 'do-not-echo', r => r.jurisdictions[0].sales_tax.status = 'approved']) {
    const input = createRegister(); mutate(input); assert.throws(() => summarizeCompliance(input, today));
  }
});
test('review evidence and valid nonfuture dates are mandatory', () => {
  for (const change of [{ evidenceRef: null }, { reviewer: 'https://private.example' }, { reviewedOn: '2026-12-01' }, { reviewedOn: '2026-02-30' }, { reviewBy: '2026-10-01' }]) {
    const input = createRegister(); input.jurisdictions[0].sales_tax = { ...reviewed(), ...change };
    assert.throws(() => summarizeCompliance(input, today));
  }
});
test('even all recorded reviews cannot establish legal or activation authority', () => {
  const input = createRegister();
  for (const key of Object.keys(input.facts)) input.facts[key] = reviewed();
  for (const row of input.jurisdictions) { row.sales_tax = reviewed(); row.creator_reporting = reviewed(); }
  const summary = summarizeCompliance(input, today);
  assert.equal(summary.counts.review_recorded, 106); assert.equal(summary.actions.length, 0);
  assert.equal(summary.activationAuthority, false); assert.equal(summary.legalClearance, false);
});
test('CLI accepts private template and rejects oversized input and directories', () => {
  const dir = mkdtempSync(join(tmpdir(), 'compliance-test-'));
  try {
    const file = join(dir, 'review.json');
    writeFileSync(file, JSON.stringify(createRegister()));
    assert.equal(run(['--input', file, '--as-of', today]).counts.unreviewed, 106);
    assert.throws(() => run(['--input', dir, '--as-of', today]));
    writeFileSync(file, ' '.repeat(128 * 1024 + 1));
    assert.throws(() => run(['--input', file, '--as-of', today]));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('CLI failure never prints invalid input or private path', () => {
  const result = spawnSync(process.execPath, ['scripts/compliance-evidence-review.mjs', '--input', '/private-missing-secret-name', '--as-of', today], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.ok(!result.stderr.includes('private-missing-secret-name'));
  assert.match(result.stderr, /No readiness conclusion/);
});
