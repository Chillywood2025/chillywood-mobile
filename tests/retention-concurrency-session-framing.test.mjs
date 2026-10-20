import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';

const runner = readFileSync(new URL('../scripts/test-deleted-content-retention-concurrency.mjs', import.meta.url), 'utf8');
// Execute the actual runner functions, replacing only Docker's process transport.
// PostgreSQL below still parses and executes the bytes sent to psql.
const functions = runner.slice(runner.indexOf('function session('), runner.indexOf('async function terminate('));
function harness() {
  let input = '';
  const child = new EventEmitter();
  child.exitCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdout.setEncoding = child.stderr.setEncoding = () => {};
  child.stdin = new EventEmitter();
  child.stdin.write = value => { input += value; };
  child.stdin.end = value => { input += value; };
  const { session, until } = runInNewContext(`${functions};({session,until})`, {
    spawn: () => child, args: () => [], lit: value => `'${value.replaceAll("'", "''")}'`,
    delay: () => Promise.resolve(),
  });
  return { child, session, until, input: () => input.replace(/^\\q$/gm, '') };
}

for (const isolation of ['read committed', 'repeatable read', 'serializable']) {
  for (const terminator of ['', ';']) {
    test(`actual session commits unterminated/terminated SQL at ${isolation}: ${JSON.stringify(terminator)}`, async () => {
      const h = harness();
      h.session('synthetic-retention-regression', `insert into fixture values (1)${terminator}`, true, isolation);
      const db = new PGlite();
      try {
        await db.exec('create table fixture(id integer)');
        await db.exec(h.input());
        assert.equal((await db.query('select count(*)::int n from fixture')).rows[0].n, 1);
      } finally { await db.close(); }
    });
  }
}

test('former framing fails PostgreSQL parsing rather than observing any lock queue', async () => {
  const h = harness();
  h.session('synthetic-former-source', 'insert into fixture values (1)', true);
  const former = h.input().replace('values (1);\ncommit;', 'values (1)\ncommit;');
  assert.notEqual(former, h.input());
  const db = new PGlite();
  try {
    await db.exec('create table fixture(id integer)');
    await assert.rejects(db.exec(former), /syntax error at or near "commit"/);
  } finally { await db.close(); }
});

test('open session also terminates its initial SQL before a deferred stdin batch', async () => {
  const h = harness();
  const s = h.session('synthetic-open-holder', 'insert into fixture values (1)');
  s.child.stdin.end('insert into fixture values (2);commit;\n\\q\n');
  const db = new PGlite();
  try {
    await db.exec('create table fixture(id integer)');
    await db.exec(h.input());
    assert.deepEqual((await db.query('select id from fixture order by id')).rows, [{ id: 1 }, { id: 2 }]);
  } finally { await db.close(); }
});

test('lock observation surfaces early backend failure instead of a misleading timeout', async () => {
  const h = harness();
  const s = h.session('synthetic-failed-waiter', 'select 1', true);
  h.child.stderr.emit('data', 'ERROR: synthetic SQL framing failure');
  h.child.exitCode = 3;
  await assert.rejects(h.until(() => false, 'lock queue', [s]), /backend exited \(3\).*synthetic SQL framing failure/);
});

test('a completed waiter without a lock is not accepted as concurrency proof', async () => {
  const h = harness();
  const s = h.session('synthetic-unblocked-waiter', 'select 1', true);
  h.child.exitCode = 0;
  await assert.rejects(h.until(() => false, 'lock queue', [s]), /backend exited \(0\) before the required state/);
});

test('early-exit diagnostics redact long tokens and generated identities', async () => {
  const h = harness();
  const s = h.session('synthetic-redaction', 'select 1', true);
  const token = 'x'.repeat(48);
  const id = '10000000-0000-4000-8000-000000000001';
  h.child.stderr.emit('data', `ERROR: ${token} ${id}`);
  h.child.exitCode = 3;
  await assert.rejects(h.until(() => false, 'lock queue', [s]), error => {
    assert.ok(error.message.includes('<redacted> <synthetic-id>'));
    assert.ok(!error.message.includes(token));
    assert.ok(!error.message.includes(id));
    return true;
  });
});
