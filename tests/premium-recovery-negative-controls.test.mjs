import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('app/subscribe.tsx', root), 'utf8');
const controls = [
  ['sticky screen read error',
    'scope.snapshotRevision += 1;\n        setSnapshotReadFailed(false);',
    'scope.snapshotRevision += 1;',
    'successful current Restore clears an earlier screen refresh failure'],
  ['stale success after a shared snapshot',
    'const currentSnapshot = snapshotRevision === scope.snapshotRevision ? nextSnapshot : scope.snapshot;',
    'const currentSnapshot = nextSnapshot;',
    'a held active read cannot overwrite a newer shared EXPIRED snapshot'],
  ['stale failure after a shared snapshot',
    'if (current() && snapshotRevision === scope.snapshotRevision) {',
    'if (current()) {',
    'a held read failure cannot invalidate a newer shared active snapshot'],
  ['wrong-account read acceptance',
    'if (currentSnapshot.userId !== authority?.userId) throw new Error("Premium status belongs to a different account.");',
    '',
    'a wrong-account read cannot clear the current account failure or return a success notice'],
];

for (const [name, before, after, failingTest] of controls) test(`negative control rejects ${name}`, () => {
  assert.equal(source.split(before).length, 2, 'mutation target must occur exactly once');
  const directory = mkdtempSync(path.join(tmpdir(), 'premium-recovery-control-'));
  try {
    const filename = path.join(directory, 'subscribe.tsx');
    writeFileSync(filename, source.replace(before, after));
    const env = { ...process.env, PREMIUM_SUBSCRIBE_SOURCE: filename };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap',
      `--test-name-pattern=^${failingTest}$`, 'tests/premium-subscribe-mounted.test.mjs'], {
      cwd: root, env, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const failedTests = [...result.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]);
    assert.deepEqual(failedTests, [failingTest], result.stdout);
    assert.match(result.stdout, /^# fail 1$/m);
    assert.match(result.stdout, /^# cancelled 0$/m);
    assert.match(result.stdout, /failureType: 'testCodeFailure'/);
    assert.match(result.stdout, /code: 'ERR_ASSERTION'/);
    assert.doesNotMatch(result.stdout + result.stderr,
      /SyntaxError|ReferenceError|TypeError|Cannot find module|unmodeled import|ETIMEDOUT|testTimeoutFailure|cancelledByParent|hookFailed|timed out/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
