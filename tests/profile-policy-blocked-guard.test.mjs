import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const script = fs.readFileSync('scripts/guard-profile-production-policy.mjs', 'utf8')
  .replace('import { readFileSync } from "node:fs";', '')
  .replace('import path from "node:path";', '');
function run(transform) {
  const errors = [];
  const processStub = { cwd: () => process.cwd(), exitCode: 0, exit() {} };
  vm.runInNewContext(script, {
    path, process: processStub,
    console: { error: message => errors.push(message), log() {} },
    readFileSync(file, encoding) {
      const source = fs.readFileSync(file, encoding);
      return file.endsWith('app/channel/[userId].tsx') ? transform(source) : source;
    },
  });
  return { errors, exitCode: processStub.exitCode };
}
test('production policy accepts both equivalent guarded property syntaxes', () => {
  for (const condition of ['nextAudienceState.isViewerBlocked', 'nextAudienceState?.isViewerBlocked']) {
    const result = run(source => source.replace(/nextAudienceState\??\.isViewerBlocked/g, condition));
    assert.equal(result.exitCode, 0, result.errors.join('\n'));
  }
});
test('negative control: removed blocked-viewer condition fails production policy', () => {
  const result = run(source => source.replace(/nextAudienceState\??\.isViewerBlocked/g, 'false'));
  assert.equal(result.exitCode, 1);
  assert.ok(result.errors.some(message => message.includes('blocked-viewer guard')));
});
