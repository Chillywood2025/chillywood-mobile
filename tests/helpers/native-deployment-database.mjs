// Explicit opt-in, owned native PostgreSQL 17 fixture. Never connects to a
// caller-supplied server: every invocation creates and destroys its own cluster.
import assert from 'node:assert/strict';
import {randomInt} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, realpath, rm, stat} from 'node:fs/promises';
import {dirname, isAbsolute, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:net';

export async function databaseFactory({transport='unix'}={}) {
  assert.ok(['unix','loopback'].includes(transport),'only owned Unix or explicit IPv4 loopback fixtures are supported');
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
  const port = transport==='unix' ? randomInt(49152,65536) : await new Promise((resolve,reject)=>{
    const server=createServer();server.once('error',reject);
    server.listen({host:'127.0.0.1',port:0,exclusive:true},()=>{
      const address=server.address();server.close(error=>error?reject(error):resolve(address.port));
    });
  });
  // Allocate the port first: a bind failure must not strand an empty directory.
  // A short, unique socket path also works with macOS Unix socket length limits.
  const root = await mkdtemp('/tmp/chilly-native-deploy-');
  const data = join(root, 'data'), socket = join(root, 'socket');
  let client, started = false, closed = false;
  const extraClients = new Set();
  async function close() {
    if (closed) return; closed = true;
    let clientError;
    try { for (const extra of extraClients) await extra.end(); if (client) await client.end(); } catch (error) { clientError = error; }
    // Stop only this owned data directory; never use global process matching.
    if (started) {
      try {run('pg_ctl',['-D',data,'status']);run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);}
      catch(error){if(error.status!==3)throw error;} // 3 means this owned cluster is not running.
      try {run('pg_ctl',['-D',data,'status']);throw Error('owned fixture is still running');}
      catch(error){if(error.status!==3)throw error;}
    }
    await rm(root, {recursive:true, force:true});
    if (clientError) throw clientError;
  }
  try {
    await mkdir(socket, {mode:0o700});
    run('initdb', ['-D', data, '-U', 'postgres', '--auth-local=trust', `--auth-host=${transport==='unix'?'reject':'trust'}`, '--no-locale', '--encoding=UTF8']);
    started = true;
    const listeners=transport==='unix'?"''":'127.0.0.1', sockets=transport==='unix'?socket:"''";
    run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-c listen_addresses=${listeners} -c unix_socket_directories=${sockets} -p ${port} -c max_connections=10 -c shared_buffers=32MB`, '-w', 'start']);
    // Before any connection, bind the endpoint to the process just started in
    // this user's fresh private directory, not an existing listener at that port.
    const pidFile=(await readFile(join(data,'postmaster.pid'),'utf8')).split('\n');
    assert.match(pidFile[0],/^[1-9][0-9]*$/u);
    assert.equal(await realpath(pidFile[1]),await realpath(data));
    assert.equal(Number(pidFile[3]),port);
    assert.equal(pidFile[4],transport==='unix'?socket:'');
    assert.equal(pidFile[5],transport==='unix'?'': '127.0.0.1');
    assert.equal((await stat(data)).uid,process.getuid());
    assert.equal((await stat(root)).mode&0o777,0o700);
    assert.equal(Number(run('pg_ctl',['-D',data,'status']).match(/PID:\s*(\d+)/u)?.[1]),Number(pidFile[0]));
    process.kill(Number(pidFile[0]),0);
    const options = {host:transport==='unix'?socket:'127.0.0.1', port, user:'postgres', database:'postgres', types, ssl:false,
      connectionTimeoutMillis:10_000, application_name:'owned-native-deployment-replay',
      password:() => { throw Error('owned native fixture refuses password authentication'); }};
    client = new pg.Client(options);
    await client.connect();
    const result = await client.query("select current_database() db, current_setting('server_version_num') version, current_setting('data_directory') directory, current_setting('listen_addresses') listeners, current_setting('unix_socket_directories') sockets, current_setting('port') port");
    assert.equal(result.rows[0].db, 'postgres');
    assert.ok(Number(result.rows[0].version) >= 170000 && Number(result.rows[0].version) < 180000);
    assert.equal(await realpath(result.rows[0].directory), await realpath(data));
    assert.equal(result.rows[0].listeners, transport==='unix'?'':'127.0.0.1');
    assert.equal(result.rows[0].sockets,transport==='unix'?socket:'');
    assert.equal(Number(result.rows[0].port),port);
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
