import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('event offer lifecycle executes production PostgreSQL with pre-fix negative controls', () => {
  execFileSync(process.execPath, ['scripts/test-event-offer-lifecycle-postgres.mjs'], {
    encoding: 'utf8',
    timeout: 120_000,
    stdio: 'pipe',
  });
});
