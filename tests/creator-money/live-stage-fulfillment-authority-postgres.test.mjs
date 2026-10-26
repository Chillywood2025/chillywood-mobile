import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('actual Live Stage SQL rejects stale authority and preserves terminal/reconciliation paths', { timeout: 120_000 }, () => {
  const result = spawnSync(process.execPath, ['scripts/test-live-stage-fulfillment-authority-postgres.mjs'], {
    encoding: 'utf8', timeout: 110_000,
  });
  assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /"baselineReproduced":true/);
  assert.match(result.stdout, /authority repair: .* controls passed/);
});
