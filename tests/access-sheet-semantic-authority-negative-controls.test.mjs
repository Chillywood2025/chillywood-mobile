import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('components/monetization/access-sheet.tsx', root), 'utf8');
const controls = [
  {
    name: 'raw authority identity restarts focus ownership',
    before: '[currentPresentation, ownerKey, scope]);', after: '[authority, currentPresentation, ownerKey, scope]);',
    pattern: 'equivalent authority republication',
    failures: ['purchase provider', 'restore provider', 'continue callback'].map(action => `equivalent authority republication preserves held ${action} ownership`),
  },
  {
    name: 'authority listener retires equivalent cloned bindings',
    before: 'if (!sameAccountSessionAuthority(scope.authority, next)) {', after: 'if (scope.authority !== next) {',
    pattern: 'equivalent authority republication',
    failures: ['purchase provider', 'restore provider', 'continue callback'].map(action => `equivalent authority republication preserves held ${action} ownership`),
  },
  {
    name: 'real authority revocation no longer retires held actions',
    before: 'if (!sameAccountSessionAuthority(scope.authority, next)) {', after: 'if (false) {',
    pattern: 'actual authority revocation',
    failures: ['purchase', 'restore', 'continue'].map(action => `actual authority revocation retires held ${action} without rerender, transient=true`),
  },
];

for (const control of controls) test(`AccessSheet semantic authority rejects ${control.name}`, () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'access-sheet-semantic-control-'));
  try {
    assert.equal(source.split(control.before).length, 2, 'mutation anchor must be unique');
    const filename = path.join(directory, 'access-sheet.tsx');
    writeFileSync(filename, source.replace(control.before, control.after));
    const env = { ...process.env, ACCESS_SHEET_SOURCE: filename };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=${control.pattern}`, 'tests/access-sheet-lifecycle-mounted.test.mjs'], {
      cwd: root, env, encoding: 'utf8', timeout: 30_000,
    });
    const output = `${run.stdout}\n${run.stderr}`;
    assert.equal(run.error, undefined, output); assert.equal(run.status, 1, output);
    for (const failure of control.failures) assert.ok(output.split('\n').some(line => /^not ok \d+ - /.test(line) && line.endsWith(failure)), output);
    assert.match(output, /failureType: 'testCodeFailure'/); assert.match(output, /code: 'ERR_ASSERTION'/);
    assert.doesNotMatch(output, /SyntaxError|ReferenceError|TypeError|Cannot find module|unmodeled import|cancelledByParent|testTimeoutFailure/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
