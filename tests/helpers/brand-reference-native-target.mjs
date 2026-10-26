import assert from 'node:assert/strict';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Native recovery tests require a deliberately named, newly created fixture.
// Historical reports must never cause an implicit connection to the retained
// October 25 benchmark or to another task's running database.
export function brandReferenceNativeContainer(recordedContainer) {
  const container = process.env.BRAND_REFERENCE_TEST_CONTAINER;
  assert.match(container ?? '', /^brand-ref-(?:perf|normalized)-recovery-[a-z0-9-]+$/,
    'BRAND_REFERENCE_TEST_CONTAINER must name a new Brand recovery fixture');
  if (recordedContainer !== undefined) assert.equal(recordedContainer, container,
    'the evidence manifest must belong to the explicitly selected recovery container');
  return container;
}

function localFixture() {
  const manifest = process.env.BRAND_REFERENCE_LOCAL_PG;
  if (!manifest) return null;
  const task = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));
  const insideTask = value => {
    const resolved = realpathSync(value);
    assert.ok(resolved.startsWith(task + path.sep), 'local PostgreSQL files must belong to this task');
    return resolved;
  };
  const fixture = JSON.parse(readFileSync(insideTask(manifest), 'utf8'));
  assert.equal(fixture.kind, 'brand-reference-local-postgres');
  assert.equal(fixture.syntheticOnly, true);
  brandReferenceNativeContainer(fixture.name);
  fixture.bin = insideTask(fixture.bin);
  fixture.dataDirectory = insideTask(fixture.dataDirectory);
  const socket = realpathSync(fixture.socketDirectory);
  assert.match(path.basename(socket), /^brand-ref-(?:perf|normalized)-recovery-[a-z0-9-]+$/);
  assert.equal(statSync(socket).uid, process.getuid());
  assert.equal(statSync(socket).mode & 0o777, 0o700, 'socket directory must be private to this user');
  fixture.socketDirectory = socket;
  assert.ok(Number.isInteger(fixture.port) && fixture.port > 1024 && fixture.port < 65536);
  return fixture;
}

function command(args) {
  const fixture = localFixture();
  if (!fixture) return {binary: 'docker', args};
  const argv = [...args];
  assert.equal(argv.shift(), 'exec', 'local transport only accepts explicit PostgreSQL tool execution');
  if (argv[0] === '-i') argv.shift();
  assert.equal(argv.shift(), fixture.name);
  const tool = argv.shift();
  assert.ok(['psql', 'createdb', 'dropdb'].includes(tool), 'only database test tools are supported');
  const host = argv.indexOf('-h');
  assert.ok(host >= 0 && argv[host + 1] === '/tmp', 'a fixed Unix socket placeholder is required');
  argv[host + 1] = fixture.socketDirectory;
  argv.unshift('-p', String(fixture.port));
  const env = {...process.env};
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  return {binary: path.join(fixture.bin, tool), args: argv, env};
}

export function brandNativeSpawnSync(args, options = {}) {
  const target = command(args);
  return spawnSync(target.binary, target.args, {...options, ...(target.env ? {env: target.env} : {})});
}

export function brandNativeSpawn(args, options = {}) {
  const target = command(args);
  return spawn(target.binary, target.args, {...options, ...(target.env ? {env: target.env} : {})});
}

export function brandNativePreflight(container) {
  brandReferenceNativeContainer(container);
  const fixture = localFixture();
  if (fixture) {
    const sql = "select json_build_object('version',version(),'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses'),'port',current_setting('port'),'systemIdentifier',(pg_control_system()).system_identifier::text)::text;";
    const result = brandNativeSpawnSync(['exec','-i',container,'psql','-X','-q','-A','-t','-h','/tmp','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
      {input: "set statement_timeout='5s';" + sql, encoding: 'utf8', timeout: 10000});
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    const server = JSON.parse(result.stdout.trim());
    assert.equal(realpathSync(server.dataDirectory), fixture.dataDirectory);
    assert.equal(server.listenAddresses, '', 'new test server must not listen on TCP');
    assert.equal(Number(server.port), fixture.port);
    assert.equal(server.systemIdentifier, fixture.systemIdentifier, 'must be the freshly created test cluster');
    return {transport: 'task-local-postgres', network: 'unix-socket-only', ...server,
      source: fixture.source, qualification: 'Native macOS PostgreSQL; not the retained Docker image or a managed Supabase deployment.'};
  }
  if (process.env.DOCKER_HOST) assert.match(process.env.DOCKER_HOST, /^(unix|npipe):\/\//);
  const context = spawnSync('docker', ['context','inspect','--format','{{.Endpoints.docker.Host}}'], {encoding: 'utf8', timeout: 10000});
  assert.equal(context.status, 0, context.stderr || context.error?.message);
  assert.match(context.stdout.trim(), /^(unix|npipe):\/\//);
  const result = spawnSync('docker', ['inspect', container], {encoding: 'utf8', timeout: 10000});
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const state = JSON.parse(result.stdout)[0];
  assert.equal(state.HostConfig.NetworkMode, 'none');
  assert.deepEqual(state.Mounts, []);
  assert.equal(state.State.Running, true);
  assert.equal(state.Config.Labels?.['com.supabase.cli.project'], undefined);
  return {transport: 'docker', network: 'none', mounts: [], image: state.Image};
}
