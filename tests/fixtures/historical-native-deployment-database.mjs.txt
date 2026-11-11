// Explicit opt-in, owned native PostgreSQL 17 fixture. Never connects to a
// caller-supplied server: every invocation creates and destroys its own cluster.
import assert from 'node:assert/strict';
import {randomInt} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, realpath, rm} from 'node:fs/promises';
import {dirname, isAbsolute, join} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function databaseFactory() {
  const binaryPath = process.env.NATIVE_DEPLOYMENT_PG_BIN;
  const driverPath = process.env.NATIVE_PG_DRIVER;
  assert.ok(binaryPath && isAbsolute(binaryPath), 'NATIVE_DEPLOYMENT_PG_BIN must name local PostgreSQL 17 binaries');
  assert.ok(driverPath && isAbsolute(driverPath), 'NATIVE_PG_DRIVER must name an absolute local pg/lib/index.js');
  const bin = await realpath(binaryPath), driver = await realpath(driverPath);
  const metadata = JSON.parse(await readFile(join(dirname(driver), '..', 'package.json'), 'utf8'));
  assert.equal(metadata.name, 'pg'); assert.equal(metadata.version, '8.16.3');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && key !== 'DATABASE_URL'));
  env.LC_ALL = 'C';
  const run = (name, args) => execFileSync(join(bin, name), args, {env, encoding:'utf8', timeout:60_000, stdio:['ignore','pipe','pipe']});
  const version = run('postgres', ['--version']).trim();
  assert.match(version, /^postgres \(PostgreSQL\) 17\./u, 'native replay requires PostgreSQL 17');
  const {default: pg} = await import(pathToFileURL(driver).href);
  const types = new pg.TypeOverrides();
  types.setTypeParser(1184, value => value); types.setTypeParser(1114, value => value);
  // A short, unique socket path also works with macOS Unix socket length limits.
  const root = await mkdtemp('/tmp/chilly-native-deploy-');
  const data = join(root, 'data'), socket = join(root, 'socket'), port = randomInt(49152, 65536);
  let client, started = false, closed = false;
  const extraClients = new Set();
  async function close() {
    if (closed) return; closed = true;
    let clientError;
    try { for (const extra of extraClients) await extra.end(); if (client) await client.end(); } catch (error) { clientError = error; }
    // Stop only this owned data directory; never use global process matching.
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    await rm(root, {recursive:true, force:true});
    if (clientError) throw clientError;
  }
  try {
    await mkdir(socket, {mode:0o700});
    run('initdb', ['-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    started = true;
    run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-c listen_addresses='' -c unix_socket_directories=${socket} -p ${port} -c max_connections=10 -c shared_buffers=32MB`, '-w', 'start']);
    const options = {host:socket, port, user:'postgres', database:'postgres', types, ssl:false,
      connectionTimeoutMillis:10_000, application_name:'owned-native-deployment-replay',
      password:() => { throw Error('owned native fixture refuses password authentication'); }};
    client = new pg.Client(options);
    await client.connect();
    const result = await client.query("select current_database() db, current_setting('server_version_num') version, current_setting('data_directory') directory, current_setting('listen_addresses') listeners");
    assert.equal(result.rows[0].db, 'postgres');
    assert.ok(Number(result.rows[0].version) >= 170000 && Number(result.rows[0].version) < 180000);
    assert.equal(await realpath(result.rows[0].directory), await realpath(data));
    assert.equal(result.rows[0].listeners, '');
    return {nativeVersion:version, backendPid:Number((await client.query('select pg_backend_pid() pid')).rows[0].pid),
      async withConnection(operation) {
        assert.equal(closed, false);
        const extra = new pg.Client(options); extraClients.add(extra);
        try { await extra.connect(); return await operation(extra); }
        finally { await extra.end(); extraClients.delete(extra); }
      },
      async exec(sql) { const value = await client.query(sql); return Array.isArray(value) ? value : [value]; },
      async query(sql, params = []) { return client.query(sql, params); }, close};
  } catch (error) {
    try { await close(); } catch (cleanupError) { throw new AggregateError([error,cleanupError], 'native replay and cleanup failed'); }
    throw error;
  }
}
