import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// Deliberately damage the imported production implementation, not a parallel
// reference model, and require its behavioral regression to detect the defect.
for (const [mutation, pattern] of [
  ['revision', 'remote read started before a removal'],
  ['completion', 'remote completion suppresses old local progress'],
  ['persistence', 'local persistence failure rejects'],
  ['unknown', 'unknown committed write blocks a conflicting successor'],
  ['stickyconflict', 'cross-device conflict stays blocked'],
]) {
  test(`negative control: removing ${mutation} protection is detected`, () => {
    const env = { ...process.env, USER_COLLECTION_MUTATION: mutation };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      '--test', `--test-name-pattern=${pattern}`, 'tests/user-collection-sync.test.mjs',
    ], {
      encoding: 'utf8', env,
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /AssertionError|ERR_ASSERTION/);
    assert.doesNotMatch(result.stdout + result.stderr, /SyntaxError|ERR_MODULE_NOT_FOUND/);
  });
}
