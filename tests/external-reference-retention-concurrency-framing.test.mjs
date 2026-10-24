// Transport framing only. This test does not simulate or prove concurrency;
// Required Validation runs the actual Docker-backed PostgreSQL queue tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';

const runner = readFileSync(new URL('../scripts/test-external-reference-retention-concurrency.mjs', import.meta.url), 'utf8');
const functions = runner.slice(runner.indexOf('function session('), runner.indexOf('async function terminate('));
function harness() {
  let input = '';
  const child = new EventEmitter();
  child.exitCode = null;
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdout.setEncoding = child.stderr.setEncoding = () => {};
  child.stdin = new EventEmitter();
  child.stdin.write = value => { input += value; };
  child.stdin.end = value => { input += value; };
  const {session, until} = runInNewContext(`${functions};({session,until})`, {
    spawn: () => child, args: () => [], lit: value => `'${value.replaceAll("'", "''")}'`,
    delay: () => Promise.resolve(), redact: value => String(value),
  });
  return {child, session, until, input: () => input.replace(/^\\q$/gm, '')};
}

for (const isolation of ['read committed', 'repeatable read', 'serializable']) {
  for (const terminator of ['', ';']) {
    test(`external runner completes SQL before COMMIT: ${isolation}, ${JSON.stringify(terminator)}`, async () => {
      const h = harness();
      h.session('synthetic-external-framing', `insert into fixture values (1)${terminator}`, true, isolation);
      const db = new PGlite();
      try {
        await db.exec('create table fixture(id integer)');
        await db.exec(h.input());
        assert.equal((await db.query('select count(*)::int n from fixture')).rows[0].n, 1);
      } finally { await db.close(); }
    });
  }
}

test('external runner terminates holder SQL before a deferred COMMIT', async () => {
  const h = harness(), db = new PGlite();
  const s = h.session('synthetic-external-holder', 'insert into fixture values (1)');
  s.child.stdin.end('insert into fixture values (2);commit;\n\\q\n');
  try {
    await db.exec('create table fixture(id integer)');
    await db.exec(h.input());
    assert.deepEqual((await db.query('select id from fixture order by id')).rows, [{id: 1}, {id: 2}]);
  } finally { await db.close(); }
});

for (const code of [0, 3]) {
  test(`external runner rejects a waiter exiting ${code} without a lock queue`, async () => {
    const h = harness(), s = h.session('synthetic-external-unblocked', 'select 1', true);
    h.child.stderr.emit('data', 'synthetic SQL error');
    h.child.exitCode = code;
    await assert.rejects(h.until(() => false, 'observed queue', [s]), new RegExp(`backend exited \\(${code}\\) before the required state`));
  });
}

test('external native runner remains local-only and wired into the database gate', () => {
  const workflow = readFileSync(new URL('../.github/workflows/required-validation.yml', import.meta.url), 'utf8');
  assert.match(workflow, /SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts\/test-external-reference-retention-concurrency\.mjs/);
  assert.match(runner, /set default_transaction_read_only=on/);
  assert.match(runner, /pg_blocking_pids\(w\.pid\)/);
  assert.match(runner, /local source unchanged/);
  assert.ok(!/process\.env\.(?:DATABASE_URL|PGPASSWORD|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)/.test(runner));
});
