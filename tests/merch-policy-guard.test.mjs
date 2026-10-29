import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const guard = fs.readFileSync('scripts/guard-creator-monetization-policy.mjs', 'utf8').replace(/^import .*;$/gm, '');
function run(mutate = (_file, source) => source) {
  const errors = [], processStub = { cwd: () => process.cwd(), exitCode: 0, exit: () => {} };
  vm.runInNewContext(guard, { readFileSync: (file) => mutate(path.relative(process.cwd(), file), fs.readFileSync(file, 'utf8')), path, process: processStub, console: { error: message => errors.push(message), log: () => {} } });
  return { code: processStub.exitCode, errors };
}
test('monetization guard follows real Shop rather than obsolete checkout placeholder', () => {
  assert.equal(run().code, 0);
  for (const [file, needle] of [['app/channel/[userId].tsx', '/merch/[creatorId]'], ['components/merch/merch-screens.tsx', 'selected.checkoutAvailable'], ['components/merch/merch-screens.tsx', 'Checkout unavailable:'], ['_lib/creatorMerch.ts', 'list_creator_merch_products']]) {
    const result = run((name, source) => name === file ? source.replaceAll(needle, 'REMOVED_NEGATIVE_CONTROL') : source);
    assert.equal(result.code, 1, `${needle} removal must fail the real guard`);
  }
  assert.equal(run((file, source) => file === 'app/channel/[userId].tsx' ? `${source}\n// Checkout pending` : source).code, 1);
});
