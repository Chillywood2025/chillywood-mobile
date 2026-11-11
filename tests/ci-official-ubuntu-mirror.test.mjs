import test from 'node:test';
import assert from 'node:assert/strict';
import {preferOfficialUbuntuMirror} from '../scripts/ci/prefer-official-ubuntu-mirror.mjs';

const original = 'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\n'
  + 'https://archive.ubuntu.com/ubuntu/\tpriority:2\n'
  + 'https://security.ubuntu.com/ubuntu/\tpriority:3\n';

test('prefers the existing official HTTPS archive without changing the mirror set', () => {
  const result = preferOfficialUbuntuMirror(original);
  assert.equal(result, original.replace('priority:1', 'priority:2').replace(
    'https://archive.ubuntu.com/ubuntu/\tpriority:2',
    'https://archive.ubuntu.com/ubuntu/\tpriority:1'));
  assert.deepEqual(result.split('\n').map(line => line.split('\t')[0]),
    original.split('\n').map(line => line.split('\t')[0]));
  assert.equal(preferOfficialUbuntuMirror(result), result);
});

test('unknown, malformed, duplicated or weakened mirror lists fail closed', () => {
  for (const input of ['', original.trimEnd(), original.replace(/\n/g, '\r\n'),
    original + original, original + '# unknown\n', original.replace('priority:2', 'priority:1'),
    original.replace('https://archive.', 'http://archive.'),
    original.replace('azure.archive.', 'unknown.archive.'),
    original.replace('\tpriority:3', '\tpriority:3 trusted=yes')]) {
    assert.throws(() => preferOfficialUbuntuMirror(input), /Unrecognized Ubuntu mirror list/);
  }
});
