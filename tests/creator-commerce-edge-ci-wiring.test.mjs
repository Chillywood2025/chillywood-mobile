import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function assertCommerceEdgeChecks(workflow) {
  const sensitive = workflow.split('\n  sensitive:')[1]?.split('\n  database:')[0];
  assert.ok(sensitive, 'canonical Sensitive job remains present');
  const step = sensitive.split('      - name: Typecheck creator commerce and reporting Edge boundaries')[1]?.split('      - name:')[0];
  assert.ok(step, 'canonical commerce typecheck step remains present');
  assert.doesNotMatch(step, /^\s*(?:if|continue-on-error):/mu, 'the check cannot be skipped or suppress failures');
  const command = step.split('\n').find(line => line.includes('run: DENO_NO_PACKAGE_JSON=1 deno check'));
  assert.ok(command, 'real Deno check command remains in the required job');
  const tokens = command.trim().split(/\s+/u);
  assert.deepEqual(tokens.slice(0, 6), ['run:', 'DENO_NO_PACKAGE_JSON=1', 'deno', 'check', '--node-modules-dir=none', '--no-lock']);
  for (const path of tokens.slice(6)) assert.match(path, /^supabase\/functions\/[a-z0-9-]+\/index\.ts$/u, 'no hidden shell command or ignored-check flag');
  for (const endpoint of [
    'create-creator-tip-checkout', 'stripe-tip-webhook',
    'stripe-event-auction-checkout', 'stripe-event-auction-webhook',
    'stripe-room-auction-checkout', 'stripe-room-auction-webhook',
    'google-play-external-reporter', 'stripe-merch-checkout', 'stripe-merch-webhook',
    'stripe-merch-cost-reconcile', 'merch-tracking-webhook', 'merch-tracking-reconcile',
    'creator-event-broadcast', 'stripe-auction-cost-reconcile', 'stripe-auction-test-transfer',
    'merch-reconciliation-driver', 'auction-observation-driver',
  ]) {
    const path = `supabase/functions/${endpoint}/index.ts`;
    assert.ok(tokens.includes(path), `missing executable Edge check: ${endpoint}`);
    assert.ok(fs.existsSync(path), `registered Edge endpoint exists: ${endpoint}`);
  }
  assert.doesNotMatch(command, /\|\|\s*true|--no-check|--check=none/u, 'check failures cannot be ignored');
}

test('canonical Sensitive validation typechecks every changed commerce Edge boundary', () => {
  assertCommerceEdgeChecks(fs.readFileSync('.github/workflows/required-validation.yml', 'utf8'));
});

test('commerce Edge wiring rejects missing checks and skipped or suppressed execution', () => {
  const workflow = fs.readFileSync('.github/workflows/required-validation.yml', 'utf8');
  for (const endpoint of ['stripe-merch-checkout', 'stripe-merch-webhook', 'merch-tracking-webhook', 'merch-tracking-reconcile', 'creator-event-broadcast', 'merch-reconciliation-driver', 'auction-observation-driver']) {
    assert.throws(() => assertCommerceEdgeChecks(workflow.replace(` supabase/functions/${endpoint}/index.ts`, '')));
  }
  const name = '      - name: Typecheck creator commerce and reporting Edge boundaries';
  for (const field of ['        if: false', '        continue-on-error: true']) {
    assert.throws(() => assertCommerceEdgeChecks(workflow.replace(name, `${name}\n${field}`)));
  }
  assert.throws(() => assertCommerceEdgeChecks(workflow.replace('supabase/functions/stripe-auction-test-transfer/index.ts', 'supabase/functions/stripe-auction-test-transfer/index.ts || true')));
});

function assertRealDenoGuard(workflow) {
  const sensitive = workflow.split('\n  sensitive:')[1]?.split('\n  database:')[0];
  assert.ok(sensitive, 'canonical Sensitive job remains present');
  const setup = sensitive.indexOf('uses: denoland/setup-deno@');
  const stepStart = sensitive.indexOf('      - name: Run auth, entitlement, money, moderation and call authority regressions');
  assert.ok(setup >= 0 && setup < stepStart, 'real Deno is installed before the guard');
  const step = sensitive.slice(stepStart).split('\n      - name:')[0];
  assert.doesNotMatch(step, /^\s*(?:if|continue-on-error):/mu);
  assert.match(step, /\n          deno --version\n          node --test tests\/local-security-probe-graph\.test\.mjs\n/u, 'Deno availability is mandatory before executing the real-runtime isolation tests');
}

test('Sensitive executes the real Deno isolation guards without optional-runtime skips', () => {
  const workflow = fs.readFileSync('.github/workflows/required-validation.yml', 'utf8');
  assertRealDenoGuard(workflow);
  for (const command of ['          deno --version\n', '          node --test tests/local-security-probe-graph.test.mjs\n']) {
    assert.throws(() => assertRealDenoGuard(workflow.replace(command, '')));
    assert.throws(() => assertRealDenoGuard(workflow.replace(command, command.trimEnd() + ' || true\n')));
  }
  assert.throws(() => assertRealDenoGuard(workflow.replace('uses: denoland/setup-deno@', 'uses: disabled/setup-deno@')));
});
