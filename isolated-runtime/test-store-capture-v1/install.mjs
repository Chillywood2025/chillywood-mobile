#!/usr/bin/env node
// Offline emitter only. Never accepts a URL, credentials, psql path or execution flag.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

export const packageRoot = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(packageRoot, '../..');
export const captureMigrationPath = 'supabase/migrations/20261107233954_isolated_test_store_capture_v1.sql';
const hash = value => createHash('sha256').update(value).digest('hex');
export function reviewedCaptureInstall() {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'source-manifest.json'), 'utf8'));
  assert.equal(manifest.protocol, 'rcq-source-manifest-v1');
  assert.equal(manifest.defaultEnabled, false);
  for (const required of ['isolated-runtime/test-store-capture-v1/capture.sql',
    'isolated-runtime/test-store-capture-v1/install.mjs', 'isolated-runtime/test-store-capture-v1/function-config.toml',
    'supabase/functions/isolated-test-store-capture-v1/index.ts',
    'supabase/functions/_shared/revenuecat-router-envelope.ts', 'supabase/functions/_shared/isolated-test-store-qualification.ts', captureMigrationPath])
    assert.ok(Object.hasOwn(manifest.files, required), 'Missing required capture source: ' + required);
  for (const [name, digest] of Object.entries(manifest.files)) {
    assert.ok(!path.isAbsolute(name) && !name.split('/').includes('..'));
    assert.match(digest, /^[a-f0-9]{64}$/u);
    const file = path.join(repoRoot, name);
    assert.equal(fs.realpathSync(file), file, 'Symlinked source is not a reviewed install input');
    assert.equal(hash(fs.readFileSync(file)), digest, `Source changed: ${name}`);
  }
  const sql = "begin;set local lock_timeout='250ms';set local statement_timeout='5s';set local transaction_timeout='5s';\n"
    + fs.readFileSync(path.join(packageRoot, 'capture.sql'), 'utf8') + '\ncommit;\n';
  return { sql, sqlSha256: hash(sql), sourceHashes: manifest.files, defaultEnabled: false,
    publicRpc: 'public.isolated_test_store_capture_ingest_v1(uuid,integer,jsonb,jsonb)',
    schema: 'rc_qualification_capture_v1', replacementAllowed: false, productionAuthority: false };
}
export function reviewedCaptureMigration() {
  const source = reviewedCaptureInstall();
  const bytes = fs.readFileSync(path.join(repoRoot, captureMigrationPath));
  assert.equal(bytes.equals(Buffer.from(source.sql, 'utf8')), true, 'Migration differs from exact qualified capture transaction');
  return { ...source, sql: bytes.toString('utf8'), migrationPath: captureMigrationPath };
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), proof = reviewedCaptureInstall();
  if (args.length === 1 && args[0] === '--plan') {
    const { sql, ...plan } = proof; process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
  } else {
    assert.equal(args.length, 3, 'Use --plan or --emit-sql --expected-digest <reviewed SQL SHA256>');
    assert.equal(args[0], '--emit-sql'); assert.equal(args[1], '--expected-digest');
    assert.equal(args[2], proof.sqlSha256, 'Exact reviewed install digest required');
    process.stdout.write(proof.sql);
  }
}
