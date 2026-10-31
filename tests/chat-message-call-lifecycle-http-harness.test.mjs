import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const script = new URL('scripts/test-chat-message-call-lifecycle-http.mjs', root);

test('local HTTP harness loads the complete current production dependency graph without contacting a backend', () => {
  const env = {...process.env};
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [script.pathname, '--check-source'], {
    cwd: root, encoding: 'utf8', env, timeout: 30_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /module wiring: PASS; backend integration NOT RUN/);
});

test('HTTP source loader still rejects every undeclared runtime dependency', () => {
  const source = fs.readFileSync(script, 'utf8');
  const ast = ts.createSourceFile(script.pathname, source, ts.ScriptTarget.Latest, true);
  const loader = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'loadSource');
  assert.ok(loader);
  const loadSource = vm.runInNewContext(`(${loader.getText(ast)})`, {
    ts, vm, fs, assert, crypto, console, setTimeout, clearTimeout,
  });
  const sentinel = {};
  assert.equal(loadSource('probe.ts', {'allowed': {sentinel}}, 'export {sentinel} from "allowed";').sentinel, sentinel);
  for (const name of ['node:fs', '@supabase/supabase-js', './unknown']) {
    assert.throws(() => loadSource('probe.ts', {}, `import * as dependency from ${JSON.stringify(name)}; export const value = dependency;`),
      error => error.message.includes(`unexpected dependency ${name}`));
  }
});

test('HTTP lifecycle retains completed-call credit and unanswered-budget negative control', () => {
  const source=fs.readFileSync(script,'utf8');
  const start=source.indexOf('phase("completed call permits another original-direction invite")');
  const end=source.indexOf('phase("reverse-direction same-thread replacement');
  assert.ok(start>=0&&end>start);
  const boundary=source.slice(start,end);
  assert.match(boundary,/await begin\("completed-credit"\)/);
  assert.match(boundary,/await transition\(creditedRetry, caller, "canceled"\)/);
  assert.match(boundary,/await assertTerminal\(creditedRetry, "canceled"\)/);
  assert.match(boundary,/await assert\.rejects\(callerApi\.calls\.beginChillyChatCall/);
  assert.match(boundary,/error\?\.code === "P0001" && error\?\.message === "rate_limited"/);
  assert.match(boundary,/blockedInvites\.length === 0/);
  assert.match(source,/inviteRows\.length === 7 && \[\[caller,4\],\[callee,3\]\]/);
  assert.match(source,/row\.status==='ended'&&row\.accepted_at\)\.length===1/);
  assert.match(source,/row\.status==='canceled'&&!row\.accepted_at\)\.length===2/);
  assert.match(source,/row\.status==='declined'&&!row\.accepted_at\)\.length===1/);
});
