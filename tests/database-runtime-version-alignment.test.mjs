import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const receipt = JSON.parse(read('docs/DATABASE_RUNTIME_AUTHORITY_DEPLOYMENT_2026_10_15.json'));
const expectedName = '20261015220128_runtime_authority_forward_repair.sql';
const sourceHash = 'ca0cc25dc6feae53cb6c865cfd9c9c775ddab6b2af075f57b5c1f64ccc143b8f';
const payloadHash = 'b09d4921a3efff3e1bb3eb7d26fba30c069ee060d20513a8a510b22f9461a0c3';
const sha = source => createHash('sha256').update(source).digest('hex');
const names = fs.readdirSync(new URL('supabase/migrations/', root));
const source = read(`supabase/migrations/${expectedName}`);

function verify(files, sql, record) {
  assert.deepEqual(files.filter(name => name.endsWith('_runtime_authority_forward_repair.sql')), [expectedName]);
  assert.equal(record.version, '20261015220128');
  assert.equal(record.name, 'runtime_authority_forward_repair');
  assert.equal(record.sourceFilename, expectedName);
  assert.equal(record.originalSourceVersion, '20261015150707');
  assert.equal(record.sourceSha256, sourceHash);
  assert.equal(sha(sql), sourceHash, 'renaming must preserve reviewed SQL bytes');
  assert.equal(record.insertAfterFirstBegin, "\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '120s';");
  const payload = sql.replace('begin;', `begin;${record.insertAfterFirstBegin}`);
  assert.notEqual(payload, sql, 'execution envelope is distinct from source');
  assert.equal(record.payloadSha256, payloadHash);
  assert.equal(sha(payload), payloadHash, 'exact timeout envelope matches stored deployment payload');
}

test('deployed repair version is unique and preserves source and execution-envelope hashes', () => {
  verify(names, source, receipt);
  assert.equal(receipt.historyCount, 426);
  assert.equal(receipt.priorHistoryCount, 425);
  assert.equal(receipt.priorHistoryPreserved, true);
  assert.equal(receipt.studioApplied, false);
  assert.equal(receipt.productionBehavioralTests, false);
  assert.equal(receipt.physicalQualification, false);
});

test('alignment guard rejects old, duplicate, changed-source and false-payload controls', () => {
  const oldName = '20261015150707_runtime_authority_forward_repair.sql';
  const controls = [
    [names.map(name => name === expectedName ? oldName : name), source, receipt],
    [[...names, oldName], source, receipt],
    [names, `${source}\n`, receipt],
    [names, source, {...receipt, version: '20261015150707'}],
    [names, source, {...receipt, sourceSha256: payloadHash}],
    [names, source, {...receipt, payloadSha256: sourceHash}],
    [names, source, {...receipt, insertAfterFirstBegin: ''}],
  ];
  for (const control of controls) assert.throws(() => verify(...control), assert.AssertionError);
});

test('native ledger and paid replay consume the deployed source version', () => {
  const native = read('scripts/test-database-runtime-authority-concurrency.mjs');
  const paid = read('tests/helpers/database-runtime-paid-fixture.mjs');
  assert.ok(native.includes(`supabase/migrations/${expectedName}`));
  assert.ok(native.includes("where version='20261015220128'"));
  assert.ok(paid.includes(`supabase/migrations/${expectedName}`));
  for (const text of [native, paid]) assert.ok(!text.includes('20261015150707'));
});
