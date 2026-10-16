import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = fs.readFileSync(path.join(root, '_lib/platformBranding.ts'), 'utf8');

// Deliberately break production code, then require the existing behavior test
// to fail for the intended assertion. A syntax/import/timeout failure is not proof.
function rejectsMutation(t, mutate, pattern, expectedFailure) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-negative-control-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, '_lib'));
  fs.copyFileSync(path.join(root, '_lib/accountSessionAuthority.ts'), path.join(directory, '_lib/accountSessionAuthority.ts'));
  const changed = mutate(source);
  assert.notEqual(changed, source, 'Mutation must alter the production implementation');
  fs.writeFileSync(path.join(directory, '_lib/platformBranding.ts'), changed);
  const env = { ...process.env, STUDIO_SOURCE_ROOT: directory };
  delete env.NODE_TEST_CONTEXT; // Child must run its own test runner, not inherit parent context.
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap',
    `--test-name-pattern=${pattern}`, 'tests/platform-studio-helper-regression.test.mjs'], {
    cwd: root, env,
    encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(run.error, undefined, 'Control process must execute without infrastructure failure');
  assert.equal(run.signal, null, 'Control must not terminate by signal');
  assert.equal(run.status, 1, 'Broken production implementation must fail its behavior test');
  const output = `${run.stdout}\n${run.stderr}`;
  assert.match(output, /^not ok \d+ - Brand draft /m);
  assert.match(output, /# pass 0\b/);
  assert.match(output, /# fail 1\b/);
  assert.match(output, /code: 'ERR_ASSERTION'/);
  assert.match(output, expectedFailure);
  assert.doesNotMatch(output, /SyntaxError|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|ReferenceError/);
  return output;
}

test('Studio negative control catches bypassed draft capability rejection', t => {
  rejectsMutation(t, value => value.replace(
    /if \(capabilityError \|\| !Array\.isArray\(identity\) \|\| identity\.length !== 1\s*\|\| toText\(identity\[0\]\?\.user_id\) !== normalizedOwnerId\)/,
    'if (false)',
  ), 'Brand draft compatibility rejects unavailable', /Missing expected rejection/);
});

test('Studio negative control catches loss of the frozen initiating request token', t => {
  const output = rejectsMutation(t, value => value.replace(
    '    .setHeader("Authorization", `Bearer ${subject.accessToken}`)\n', '',
  ), 'Brand draft production helper freezes', /Expected values to be strictly equal/);
  assert.match(output, /actual: 'Bearer replacement-fixture-token'/);
  assert.match(output, /expected: 'Bearer initiating-fixture-token'/);
});
