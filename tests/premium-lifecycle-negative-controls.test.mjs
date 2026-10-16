import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const base = '934db4003e604e9ac42aa6feb9d4511e1c80a97b';
const root = new URL('../', import.meta.url);
const current = file => readFileSync(new URL(file, root), 'utf8');
const replaceOnce = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `mutation target must occur exactly once: ${before}`);
  return source.replace(before, after);
};
const controls = [
  ['old Settings', 'PREMIUM_SETTINGS_SOURCE', 'premium-settings-mounted',
    () => execFileSync('git', ['show', `${base}:app/settings.tsx`], { cwd: root, encoding: 'utf8' })],
  ['old AccessSheet', 'ACCESS_SHEET_SOURCE', 'access-sheet-lifecycle-mounted',
    () => execFileSync('git', ['show', `${base}:components/monetization/access-sheet.tsx`], { cwd: root, encoding: 'utf8' })],
  ['removed sheet single-flight', 'ACCESS_SHEET_SOURCE', 'access-sheet-lifecycle-mounted',
    () => replaceOnce(current('components/monetization/access-sheet.tsx'),
      'if (actionRef.current?.scope === scope && actionRef.current.epoch === scope.epoch) return null;', '')],
  ['removed callback retirement', 'ACCESS_SHEET_SOURCE', 'access-sheet-lifecycle-mounted',
    () => replaceOnce(current('components/monetization/access-sheet.tsx'),
      'current: () => currentSheet() && action.epoch === scope.epoch && actionRef.current === action,', 'current: () => true,')],
  ['restored stale foreground cache', 'ACCESS_SHEET_SOURCE', 'access-sheet-lifecycle-mounted',
    () => replaceOnce(replaceOnce(current('components/monetization/access-sheet.tsx'),
      '&& scope.focused && !scope.closed && AppState.currentState === "active"',
      '&& scope.focused && !scope.closed && foregroundRef.current && AppState.currentState === "active"'),
      '    foregroundRef.current = AppState.currentState === "active";', '')],
  ['removed Player lifetime check', 'PLAYER_ACTION_SOURCE', 'player-watch-party-actions-mounted',
    () => replaceOnce(current('_lib/usePlayerWatchPartyActions.ts'),
      'ownerRef.current === ownerKey && lifetimeRef.current === lifetime', 'ownerRef.current === ownerKey')],
  ['removed Player authority subscription retirement', 'PLAYER_ACTION_SOURCE', 'player-watch-party-actions-mounted',
    () => replaceOnce(current('_lib/usePlayerWatchPartyActions.ts'),
      'if (!sameAccountSessionAuthority(sessionAuthority, next)) lifetimeRef.current += 1;', '')],
  ['removed Player Start single-flight', 'PLAYER_ACTION_SOURCE', 'player-watch-party-actions-mounted',
    () => replaceOnce(current('_lib/usePlayerWatchPartyActions.ts'),
      'if (!isCurrent() || startRef.current || acceptedNavigationRef.current) return;', 'if (!isCurrent() || acceptedNavigationRef.current) return;')],
  ['removed Player held creation retention', 'PLAYER_ACTION_SOURCE', 'player-watch-party-actions-mounted',
    () => replaceOnce(current('_lib/usePlayerWatchPartyActions.ts'),
      'heldCreations.set(creationKey, held);', '')],
];
const namedFailures = {
  'old Settings': /not ok \d+ - Settings shows checking for an unfinished authority read/,
  'old AccessSheet': /not ok \d+ - actual active Continue calls the parent once/,
  'removed sheet single-flight': /not ok \d+ - actual active Continue calls the parent once/,
  'removed callback retirement': /not ok \d+ - late Continue feedback cannot overwrite a replacement sheet after focus/,
  'restored stale foreground cache': /not ok \d+ - a sheet hidden in the background refreshes, rechecks and closes/,
  'removed Player lifetime check': /not ok \d+ - Start's pending Premium read cannot create after background/,
  'removed Player authority subscription retirement': /not ok \d+ - Start retires snapshot revocation without hook rerender, transient=true/,
  'removed Player Start single-flight': /not ok \d+ - same-turn Start presses dispatch a single creation/,
  'removed Player held creation retention': /not ok \d+ - unconfirmed create \(error\) never falls through/,
};

for (const [name, variable, suite, source] of controls) test(`negative control rejects ${name}`, () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'premium-lifecycle-control-'));
  try {
    const filename = path.join(directory, 'source.tsx');
    writeFileSync(filename, source());
    const env = { ...process.env, [variable]: filename };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `tests/${suite}.test.mjs`], {
      cwd: root, env, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /failureType: 'testCodeFailure'/);
    assert.match(result.stdout, /ERR_ASSERTION/);
    assert.match(result.stdout, namedFailures[name]);
    assert.doesNotMatch(result.stdout + result.stderr, /SyntaxError|ReferenceError|TypeError|Cannot find module|unmodeled import/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
