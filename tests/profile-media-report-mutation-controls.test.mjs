// Mutate the actual SQL loaded by the regression in isolated child processes.
// No production file edits, database URLs, provider or device access.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const cases = [
  ['delivery', /profile_media_moderation_blocked/u],
  ['role', /Missing expected rejection: even staff cannot bypass/u],
  ['finalAuthority', /Missing expected rejection: session loss at commit boundary/u],
];
for (const [mutation, expectedFailure] of cases) {
  test(`actual SQL regression kills ${mutation} mutation`, {timeout:240_000}, () => {
    const env = {...process.env,PROFILE_MEDIA_REPORT_MUTATION:mutation};
    // A child runner must not inherit the parent's internal test-worker mode,
    // which can return success without discovering/executing the target file.
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath,
      ['--test', fileURLToPath(new URL('./profile-media-report-enforcement.test.mjs', import.meta.url))],
      {encoding:'utf8', timeout:230_000, maxBuffer:4*1024*1024,
        env});
    assert.ifError(result.error);
    assert.equal(result.signal, null, 'control must reach a real assertion');
    assert.equal(result.status, 1, 'weakened production SQL must fail the behavioral suite');
    assert.match(result.stdout + result.stderr, /profile-media report action preserves authority/u,
      'the actual production-SQL regression was discovered and executed');
    assert.match(result.stdout + result.stderr, expectedFailure, 'control fails for its intended behavior');
  });
}
