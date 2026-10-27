// Optional native backend for canonical profile SQL tests. Never a remote DB runner.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile, realpath} from 'node:fs/promises';
import {dirname, isAbsolute, join} from 'node:path';
import {pathToFileURL} from 'node:url';

export function localNativeOptions(env = process.env) {
  assert.equal(env.PGHOST, '127.0.0.1', 'explicit IPv4 loopback is required');
  assert.match(env.PGPORT || '', /^[1-9]\d{0,4}$/u, 'explicit local port is required');
  assert.ok(Number(env.PGPORT) <= 65535, 'invalid local port');
  assert.equal(env.PGUSER, 'postgres', 'disposable local administrator is required');
  assert.ok(!env.PGDATABASE || env.PGDATABASE === 'postgres', 'admin database must be postgres');
  for (const key of ['PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSWORD', 'PGPASSFILE',
    'PGOPTIONS', 'PGSSLMODE', 'PGSSLCERT', 'PGSSLKEY', 'DATABASE_URL']) {
    assert.ok(!env[key], `${key} overrides are forbidden`);
  }
  return {host: '127.0.0.1', port: Number(env.PGPORT), user: 'postgres', database: 'postgres',
    ssl: false, connectionTimeoutMillis: 10_000, application_name: 'profile-native-disposable-test',
    // Never consult a saved password file or send credentials, even if the wrong
    // local service is listening. The explicitly disposable cluster must use trust.
    password: () => { throw new Error('native fixture refuses password authentication'); }};
}

export async function createNativeDatabase(pg, env = process.env) {
  const options = localNativeOptions(env);
  // Preserve wire precision: Date truncation would invalidate keyset cursor proof.
  pg.types.setTypeParser(1184, value => value);
  pg.types.setTypeParser(1114, value => value);
  const name = `profile_replay_${randomUUID().replaceAll('-', '')}`;
  assert.match(name, /^profile_replay_[0-9a-f]{32}$/u);
  const admin = new pg.Client(options);
  let client;
  let created = false;
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    try {
      if (client) await client.end();
    } finally {
      try {
        if (created) await admin.query(`drop database ${name} with (force)`);
      } finally {
        await admin.end();
      }
    }
  }
  try {
    await admin.connect();
    await admin.query(`create database ${name}`);
    created = true;
    client = new pg.Client({...options, database: name});
    await client.connect();
    return {
      async exec(sql) {
        const result = await client.query(sql);
        return Array.isArray(result) ? result : [result];
      },
      async query(sql, params = []) { return client.query(sql, params); },
      close,
    };
  } catch (error) {
    try { await close(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'native fixture setup and cleanup failed');
    }
    throw error;
  }
}

export async function databaseFactory() {
  localNativeOptions(); // Reject unsafe connection configuration before importing a driver.
  const path = process.env.NATIVE_PG_DRIVER;
  assert.ok(path && isAbsolute(path), 'NATIVE_PG_DRIVER must be an absolute local pg/lib/index.js path');
  const resolved = await realpath(path);
  const packagePath = join(dirname(resolved), '..', 'package.json');
  const metadata = JSON.parse(await readFile(packagePath, 'utf8'));
  assert.equal(metadata.name, 'pg', 'expected node-postgres driver');
  assert.equal(metadata.version, '8.16.3', 'use the exact qualified driver version');
  const {default: pg} = await import(pathToFileURL(resolved).href);
  return createNativeDatabase(pg);
}
