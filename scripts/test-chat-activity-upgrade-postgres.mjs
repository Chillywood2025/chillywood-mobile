#!/usr/bin/env node
// Local-only populated predecessor -> pending migration -> rollback regression.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chatActivityUpgradeSQL, chatActivityMigration, chatActivityPredecessor} from '../tests/helpers/chat-activity-upgrade-fixture.mjs';

if (process.argv.includes('--help')) {
  console.log('Run after local Supabase reset --version 20261031204321. Native PostgreSQL 17 only; synthetic fixtures and migration roll back. --fixture-preflight is PGlite SQL validation only. No remote URL accepted.');
  process.exit(0);
}
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--fixture-preflight'), 'no remote URL or positional arguments accepted');
if (process.argv[2] === '--fixture-preflight') {
  const {createDatabase} = await import('../tests/helpers/database-runtime-authority-fixture.mjs');
  const {db} = await createDatabase({includeHeldStudio:true, applyRepair:true, repairInMigrationOrder:true,
    implicitApiGrants:false, excludeMigrations:[chatActivityMigration]});
  try {
    await db.exec(chatActivityUpgradeSQL());
    console.log('Populated upgrade SQL preflight PASS; native PostgreSQL 17 NOT RUN.');
  } finally { await db.close(); }
  process.exit(0);
}
const container = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_chillywood-mobile';
assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const socket = 'unix:///var/run/docker.sock';
assert.ok(!process.env.DOCKER_CONTEXT, 'Docker context overrides are not accepted');
assert.equal(process.env.DOCKER_HOST ?? socket, socket, 'remote Docker hosts are not accepted');
const run = sql => {
  // Explicit --host also overrides a remote currentContext in Docker config.
  const result = spawnSync('docker', ['--host',socket,'exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],
    {input:sql, encoding:'utf8', timeout:180000, maxBuffer:16*1024*1024});
  assert.equal(result.status,0,result.error?.message ?? result.stderr);
  return result.stdout.trim();
};
const preflight = JSON.parse(run(`set default_transaction_read_only=on;
  select json_build_object('version',current_setting('server_version_num')::integer,
    'head',(select max(version) from supabase_migrations.schema_migrations));`));
assert.ok(preflight.version >= 170000 && preflight.version < 180000, 'real PostgreSQL 17 required');
assert.equal(preflight.head,chatActivityPredecessor,'reset to exact predecessor first');
assert.match(run(chatActivityUpgradeSQL()), /CHAT_ACTIVITY_POPULATED_UPGRADE_PASS$/u);
assert.equal(run('select max(version) from supabase_migrations.schema_migrations'),chatActivityPredecessor,'test must not register a migration');
console.log('Native PostgreSQL 17 populated upgrade PASS: negative control, exact state, armed guards, future head, cleanup and rollback.');
