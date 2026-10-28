import assert from 'node:assert/strict';
import test from 'node:test';
import {createNativeDatabase, localNativeOptions} from './helpers/native-profile-database.mjs';

const env = {PGHOST: '127.0.0.1', PGPORT: '55433', PGUSER: 'postgres'};

test('native adapter accepts only explicit local disposable connection options', () => {
  const options = localNativeOptions(env);
  assert.equal(options.host, '127.0.0.1');
  assert.equal(options.port, 55433);
  assert.equal(options.database, 'postgres');
  assert.equal(options.ssl, false);
  assert.throws(options.password, /refuses password/);
  for (const mutation of [{PGHOST: 'localhost'}, {PGHOST: 'db.example.com'}, {PGHOST: '/tmp'},
    {PGPORT: '0'}, {PGPORT: '65536'}, {PGPORT: ''}, {PGUSER: 'service_role'}, {PGDATABASE: 'live'},
    ...['PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSWORD', 'PGPASSFILE', 'PGOPTIONS',
      'PGSSLMODE', 'PGSSLCERT', 'PGSSLKEY', 'DATABASE_URL'].map(key => ({[key]: 'override'}))]) {
    assert.throws(() => localNativeOptions({...env, ...mutation}));
  }
});

function fixture(failClientConnect = false) {
  const queries = [], clients = [], parsers = new Map();
  return {queries, clients, parsers, pg: {
    types: {setTypeParser(oid, parser) { parsers.set(oid, parser); }},
    Client: class {
      constructor(options) { this.options = options; this.ended = 0; clients.push(this); }
      async connect() { if (failClientConnect && clients.indexOf(this) === 1) throw new Error('fixture connect failure'); }
      async query(sql, params) { queries.push({sql, params, database: this.options.database}); return {rows: []}; }
      async end() { this.ended++; }
    },
  }};
}

test('native adapter preserves precision and cleans only its generated database once', async () => {
  const f = fixture();
  const db = await createNativeDatabase(f.pg, env);
  const name = f.clients[1].options.database;
  assert.match(name, /^profile_replay_[0-9a-f]{32}$/u);
  for (const oid of [1114, 1184]) assert.equal(f.parsers.get(oid)('2026-10-27 01:02:03.123456+00'), '2026-10-27 01:02:03.123456+00');
  assert.deepEqual(await db.exec('select 1'), [{rows: []}]);
  await db.query('select $1', [42]);
  await db.close();
  await db.close();
  assert.deepEqual(f.queries.map(q => q.sql), [`create database ${name}`, 'select 1', 'select $1', `drop database ${name} with (force)`]);
  assert.deepEqual(f.queries[2].params, [42]);
  assert.deepEqual(f.clients.map(c => c.ended), [1, 1]);
});

test('native adapter cleans its created database after a client connection failure', async () => {
  const f = fixture(true);
  await assert.rejects(() => createNativeDatabase(f.pg, env), /fixture connect failure/);
  assert.equal(f.queries.length, 2);
  assert.equal(f.queries[1].sql, f.queries[0].sql.replace('create database', 'drop database') + ' with (force)');
  assert.deepEqual(f.clients.map(c => c.ended), [1, 1]);
});
