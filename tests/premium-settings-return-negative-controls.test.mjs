import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
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
    const pattern = `^${control.scenario.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=${pattern}`, 'tests/premium-settings-return-mounted.test.mjs'], {
      cwd: root, env, encoding: 'utf8', timeout: 30_000,
    });
    const output = `${run.stdout}\n${run.stderr}`;
    assert.equal(run.error, undefined, output);
    assert.equal(run.status, 1, output);
    assert.ok(output.includes(`not ok 1 - ${control.scenario}`), output);
    assert.match(output, /failureType: 'testCodeFailure'/);
    assert.match(output, /code: 'ERR_ASSERTION'/);
    assert.doesNotMatch(output, /SyntaxError|ReferenceError|TypeError|Cannot find module|unmodeled import|cancelledByParent|testTimeoutFailure/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
