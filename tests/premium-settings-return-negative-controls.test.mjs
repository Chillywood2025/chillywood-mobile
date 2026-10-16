import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const assertControlFailure = (run, scenario) => {
  const output = `${run.stdout}\n${run.stderr}`;
  assert.equal(run.error, undefined, output);
  assert.equal(run.status, 1, output);
  // Node 20 retains the original ordinal when filtering; Node 24 renumbers it.
  // Bind the assertion diagnostics to the exact scenario, not another failure.
  const failure = output.match(new RegExp(`^not ok [0-9]+ - ${escapeRegExp(scenario)}\\r?\\n((?:[ \\t]+[^\\r\\n]*(?:\\r?\\n|$))*)`, 'm'));
  assert.ok(failure, output);
  assert.match(failure[1], /^  failureType: 'testCodeFailure'\r?$/m);
  assert.match(failure[1], /^  code: 'ERR_ASSERTION'\r?$/m);
  assert.doesNotMatch(output, /SyntaxError|ReferenceError|TypeError|Cannot find module|unmodeled import|cancelledByParent|testTimeoutFailure/);
};

const matcherScenario = 'iOS Restore (owned) [cache] + $receipt?';
const assertionTap = (ordinal, scenario = matcherScenario) => `not ok ${ordinal} - ${scenario}
  ---
  failureType: 'testCodeFailure'
  code: 'ERR_ASSERTION'
  ...
`;
const validRun = stdout => ({ error: undefined, status: 1, stdout, stderr: '' });
for (const ordinal of [1, 24]) test(`return control matcher accepts exact assertion at TAP ordinal ${ordinal}`, () => {
  const skipped = ordinal === 24 ? 'ok 1 - unrelated earlier scenario # SKIP test name does not match pattern\n' : '';
  assertControlFailure(validRun(`TAP version 13\n${skipped}${assertionTap(ordinal)}`), matcherScenario);
});
test('return control matcher accepts CRLF diagnostics', () => {
  assertControlFailure(validRun(assertionTap(24).replaceAll('\n', '\r\n')), matcherScenario);
});
const invalidRuns = [
  ['successful exit', { ...validRun(assertionTap(24)), status: 0 }],
  ['unexpected exit', { ...validRun(assertionTap(24)), status: 2 }],
  ['signal termination', { ...validRun(assertionTap(24)), status: null }],
  ['spawn error', { ...validRun(assertionTap(24)), error: new Error('spawn failed') }],
  ['empty test run', validRun('TAP version 13\n1..0\n')],
  ['passing target', validRun(assertionTap(24).replace('not ok', 'ok'))],
  ['unrelated scenario assertion', validRun(assertionTap(24, 'unrelated scenario'))],
  ['prefixed scenario name', validRun(assertionTap(24, `other ${matcherScenario}`))],
  ['suffixed scenario name', validRun(assertionTap(24, `${matcherScenario} extra`))],
  ['unescaped regex-like scenario name', validRun(assertionTap(24, 'iOS Restore owned c  receipt'))],
  ['nonnumeric ordinal', validRun(assertionTap('twenty-four'))],
  ['diagnostic text imitating a result', validRun(assertionTap(24).replace('not ok', '# not ok'))],
  ['missing failure type', validRun(assertionTap(24).replace("  failureType: 'testCodeFailure'\n", ''))],
  ['missing assertion code', validRun(assertionTap(24).replace("  code: 'ERR_ASSERTION'\n", ''))],
  ['unrelated assertion after target failure', validRun(
    assertionTap(24).replace("code: 'ERR_ASSERTION'", "code: 'ERR_TEST_FAILURE'") + assertionTap(25, 'unrelated scenario'))],
  ['unrelated failure type after target failure', validRun(
    assertionTap(24).replace("failureType: 'testCodeFailure'", "failureType: 'hookFailed'") + assertionTap(25, 'unrelated scenario'))],
];
for (const [name, run] of invalidRuns) test(`return control matcher rejects ${name}`, () => {
  assert.throws(() => assertControlFailure(run, matcherScenario), { code: 'ERR_ASSERTION' });
});
for (const crash of ['SyntaxError', 'ReferenceError', 'TypeError', 'Cannot find module', 'unmodeled import', 'cancelledByParent', 'testTimeoutFailure']) {
  test(`return control matcher rejects ${crash} despite a matching assertion`, () => {
    assert.throws(() => assertControlFailure({ ...validRun(assertionTap(24)), stderr: crash }, matcherScenario), { code: 'ERR_ASSERTION' });
  });
}

const mutate = (file, before, after) => () => {
  const source = readFileSync(new URL(file, root), 'utf8');
  assert.equal(source.split(before).length, 2, `mutation anchor must occur exactly once: ${before}`);
  return source.replace(before, after);
};
const controls = [
  {
    name: 'failed Restore falsely reports success from active cache', variable: 'PREMIUM_RETURN_SUBSCRIBE_SOURCE',
    scenario: 'iOS failed Restore preserves active Settings truth without claiming the restore succeeded',
    source: mutate('app/subscribe.tsx',
      'setNotice(result.ok && currentSnapshot.targets.premium_subscription.hasEntitlement',
      'setNotice(currentSnapshot.targets.premium_subscription.hasEntitlement'),
  },
  {
    name: 'Settings skips its return focus refresh', variable: 'PREMIUM_RETURN_SETTINGS_SOURCE',
    scenario: 'iOS purchase returns to Settings with independently verified active truth',
    source: mutate('app/settings.tsx',
      'monetizationScope.focused = true;\n    void refreshMonetizationStatus(true);',
      'monetizationScope.focused = true;\n    if (monetizationScope.generation === 0) void refreshMonetizationStatus(true);'),
  },
  {
    name: 'shared cache stops notifying focused Settings', variable: 'PREMIUM_RETURN_MONETIZATION_SOURCE',
    scenario: 'iOS purchase finishing after Back updates the focused Settings shared cache',
    source: mutate('_lib/monetization.ts',
      'cachedMonetizationAuthority = authority;\n  notifyMonetizationSnapshotListeners();',
      'cachedMonetizationAuthority = authority;'),
  },
  {
    name: 'older shared cache read overwrites the completed purchase', variable: 'PREMIUM_RETURN_MONETIZATION_SOURCE',
    scenario: 'iOS purchase retires a held pre-navigation inactive Settings read',
    source: mutate('_lib/monetization.ts',
      'if (readGeneration !== undefined && readGeneration !== monetizationReadGeneration) {',
      'if (false) {'),
  },
  {
    name: 'Settings mistakes the store signal for verified account access', variable: 'PREMIUM_RETURN_SETTINGS_SOURCE',
    scenario: 'iOS purchase failed reconciliation stays inactive on Settings return',
    source: mutate('app/settings.tsx',
      'const hasPremium = premiumAuthorityKnown && !!premiumTarget?.hasEntitlement;',
      'const hasPremium = premiumAuthorityKnown && (!!premiumTarget?.hasEntitlement || monetizationSnapshot.activeProductIds.includes("com.chillywood.premium.monthly"));'),
  },
  {
    name: 'Subscribe purchase button bypasses the genuine purchase helper', variable: 'PREMIUM_RETURN_SUBSCRIBE_SOURCE',
    scenario: 'iOS already-owned purchase restores once and returns verified Settings truth',
    source: mutate('app/subscribe.tsx',
      'const result = await purchaseMonetizationTarget("premium_subscription", {',
      'const result = await (async () => ({ message: "Modeled bypass" }))("premium_subscription", {'),
  },
  {
    name: 'Subscribe Restore button bypasses the genuine Restore helper', variable: 'PREMIUM_RETURN_SUBSCRIBE_SOURCE',
    scenario: 'iOS empty Restore returns settled inactive truth without a success receipt',
    source: mutate('app/subscribe.tsx',
      'const result = await restoreMonetizationAccess({',
      'const result = await (async () => ({ ok: true, message: "Modeled bypass" }))({'),
  },
  {
    name: 'retired Settings return clears successor loading', variable: 'PREMIUM_RETURN_SETTINGS_SOURCE',
    scenario: 'iOS held return read preserves successor loading and settled truth for owned-user',
    source: mutate('app/settings.tsx',
      'if (current()) {\n        monetizationScope.pending = false;',
      'if (true) {\n        monetizationScope.pending = false;'),
  },
];

for (const control of controls) test(`composed iOS return control rejects ${control.name}`, () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'premium-settings-return-control-'));
  try {
    const filename = path.join(directory, 'source.tsx');
    writeFileSync(filename, control.source());
    const env = { ...process.env };
    for (const variable of ['NODE_TEST_CONTEXT', 'PREMIUM_RETURN_SETTINGS_SOURCE', 'PREMIUM_RETURN_SUBSCRIBE_SOURCE', 'PREMIUM_RETURN_MONETIZATION_SOURCE']) delete env[variable];
    env[control.variable] = filename;
    const pattern = `^${escapeRegExp(control.scenario)}$`;
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=${pattern}`, 'tests/premium-settings-return-mounted.test.mjs'], {
      cwd: root, env, encoding: 'utf8', timeout: 30_000,
    });
    assertControlFailure(run, control.scenario);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
