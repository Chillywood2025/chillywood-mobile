#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {isolateLocalCron} from './lib/local-ci-cron-isolation.mjs';

// Deliberately no URL, host, container override or arbitrary command arguments.
assert.deepEqual(process.argv.slice(2), []);
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'owned Actions runner only');
assert.match(process.env.GITHUB_RUN_ID ?? '', /^\d+$/);
assert.equal(process.env.GITHUB_REPOSITORY, 'Chillywood2025/chillywood-mobile');
assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT, 'no remote Docker override');
const project = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/m)?.[1];
assert.equal(project, 'chillywood-mobile');
const container = `supabase_db_${project}`;
const exec = (args, input) => {
  const result = spawnSync('docker', args, {input, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024});
  assert.equal(result.status, 0, `local Docker operation failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
};
const context = JSON.parse(exec(['context', 'inspect']))[0];
assert.match(context.Endpoints.docker.Host, /^unix:\/\//, 'local Unix Docker daemon required');
const inspected = JSON.parse(exec(['inspect', container]))[0];
assert.equal(inspected.Name, `/${container}`);
assert.equal(inspected.Config.Labels['com.supabase.cli.project'], project);
// Same local admin transport as the native clone restorers. Expand the existing
// password only inside the verified container; never read/print it in the runner.
const query = sql => exec(['exec', '-i', container, 'sh', '-lc',
  'PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"', 'local-ci-cron-admin',
  'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'], sql+';');
const waitReady = async expected => {
  const deadline = Date.now()+60000;
  while (Date.now()<deadline) {
    try { if (!expected ? query('select 1')==='1' : query('show cron.launch_active_jobs')===expected) return; } catch { /* startup/reload only */ }
    await delay(250);
  }
  throw Error('local PostgreSQL startup/restore deadline');
};
// Workflow supplies a fixed script through stdin, not a remote executor payload.
const script = readFileSync(0, 'utf8');
assert.ok(script.trim());
const status = await isolateLocalCron({query, restart:()=>exec(['restart', container]), waitReady,
  run:()=> {
    const result=spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {stdio:'inherit'});
    if (result.error) throw result.error;
    return result.status ?? 1;
  }});
process.exitCode=status;
