#!/usr/bin/env node
// Offline evidence utility. Never connects to or changes a database.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'manifest.json'), 'utf8'));
const archive = fs.readFileSync(path.join(here, 'statements.json.gz'));
assert.equal(sha256(archive), manifest.archiveSha256, 'archive bytes changed');
const rows = JSON.parse(gunzipSync(archive).toString('utf8'));
assert.equal(rows.length, manifest.deployed.length);
assert.equal(rows.length, 408);
assert.equal(new Set(rows.map((row) => row.version)).size, rows.length);
let statementCount = 0;
for (let i = 0; i < rows.length; i += 1) {
  const row = rows[i];
  const expected = manifest.deployed[i];
  assert.match(row.version, /^\d+$/u);
  assert.match(row.name, /^[a-zA-Z0-9_]+$/u);
  assert.equal(row.version, expected.version);
  assert.equal(row.name, expected.name);
  assert.ok(Array.isArray(row.statements) && row.statements.every((s) => typeof s === 'string'));
  assert.equal(row.statements.length, expected.statementCount);
  assert.deepEqual(row.statements.map(sha256), expected.statementSha256, `${row.version}: ordered statement bytes`);
  const joined = row.statements.join('\n');
  assert.equal(sha256(joined), expected.joinedSha256);
  assert.equal(Buffer.byteLength(joined), expected.statementBytes);
  assert.equal(sha256(fs.readFileSync(path.join(root, expected.sourcePath))), expected.sourceSha256,
    `${row.version}: canonical historical source changed; reconcile explicitly`);
  statementCount += row.statements.length;
}
assert.equal(statementCount, 9529);
const pending = manifest.pending.map((entry) => {
  assert.match(entry.version, /^\d+$/u);
  assert.match(entry.name, /^[a-zA-Z0-9_]+$/u);
  assert.equal(entry.sourcePath, `supabase/migrations/${entry.version}_${entry.name}.sql`);
  const bytes = fs.readFileSync(path.join(root, entry.sourcePath));
  assert.equal(sha256(bytes), entry.sha256, `${entry.version}: pending source changed`);
  assert.ok(!rows.some((row) => row.version === entry.version));
  return { ...entry, bytes };
});
assert.deepEqual(pending.map((entry) => entry.version), ['20260928164743', '20260929004448']);

const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--materialize'),
  'usage: node verify-and-materialize.mjs [--materialize NEW_DIRECTORY]');
if (args.length) {
  const destination = path.resolve(args[1]);
  assert.ok(destination !== root && !destination.startsWith(`${root}${path.sep}`),
    'deployment directory must be outside the source checkout');
  assert.ok(!fs.existsSync(destination), 'refusing to overwrite an existing destination');
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  const migrationDirectory = path.join(destination, 'supabase', 'migrations');
  fs.mkdirSync(migrationDirectory, { recursive: true });
  for (const row of rows) {
    // CLI-compatible reconstruction, not a claim to recover original SQL file bytes.
    // These versions MUST already be applied and MUST NOT appear in the dry run.
    fs.writeFileSync(path.join(migrationDirectory, `${row.version}_${row.name}.sql`),
      `${row.statements.join(';\n')};\n`, { flag: 'wx' });
  }
  for (const row of pending) {
    fs.writeFileSync(path.join(migrationDirectory, `${row.version}_${row.name}.sql`), row.bytes, { flag: 'wx' });
  }
  fs.writeFileSync(path.join(destination, 'supabase', 'config.toml'),
    'project_id = "chillywood-chat-scoped-deployment"\n\n[db]\nmajor_version = 17\n\n[db.seed]\nenabled = false\n', { flag: 'wx' });
  fs.writeFileSync(path.join(destination, 'DEPLOYMENT_NOT_AUTHORIZED.txt'),
    'Offline staging only. Read the source README, obtain action-specific approval, refresh remote history/body parity, and require a pinned CLI dry run listing exactly the two pending migrations. Never replay historical rows.\n', { flag: 'wx' });
  assert.equal(fs.readdirSync(migrationDirectory).length, 410);
  console.log(JSON.stringify({ materializedDirectory: destination, files: 410, pendingVersions: pending.map((row) => row.version) }));
}
console.log(JSON.stringify({ archiveVerified: true, deployedRows: rows.length, orderedStatements: statementCount,
  pendingFilesVerified: pending.length, databaseAccess: false }));
