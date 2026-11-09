import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript'), api = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../../supabase/functions/_shared/native-store-runtime-config-v1.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(api);
const id = 'a0000000-0000-4000-8000-000000000001';
const entry = (revision = 1) => ({ connectionId: id, connectionRevision: revision, projectId: 'synthetic-project', appId: 'synthetic-app',
  store: 'APP_STORE', environment: 'SANDBOX', authentication: { method: 'shared_secret', keyVersion: `synthetic-auth-${revision}`, secret: 'synthetic-not-real-secret-'.repeat(2) },
  encryption: { keyId: `synthetic-key-${revision}`, keyBase64: Buffer.alloc(32, revision).toString('base64') } });
const parse = entries => api.parseNativeStoreRuntimeConnectionsV1(JSON.stringify({ connections: entries }));
const registry = (revision = 1) => ({ id, revision, project_id: 'synthetic-project', app_id: 'synthetic-app', store: 'APP_STORE', environment: 'SANDBOX',
  auth_key_version: `synthetic-auth-${revision}`, storage_key_id: `synthetic-key-${revision}` });
test('original immutable revision/key resolve across rotation, with detached key bytes', () => {
  const entries = parse([entry(), entry(2)]), original = api.resolveNativeStoreOriginalConnectionV1(entries, registry());
  assert.equal(original.connectionRevision, 1); assert.equal(original.encryption.key[0], 1);
  original.encryption.key.fill(99); assert.equal(entries[0].encryption.key[0], 1);
  assert.equal(api.resolveNativeStoreOriginalConnectionV1(entries, registry(2)).encryption.key[0], 2);
  assert.throws(() => api.resolveNativeStoreOriginalConnectionV1(parse([entry(2)]), registry()), /configuration_unavailable/u);
});
test('missing/duplicate revisions, malformed keys, unknown configuration and production fail closed', () => {
  for (const mutate of [c => { c.environment = 'PRODUCTION'; }, c => { c.encryption.keyBase64 = 'x'.repeat(44); },
    c => { c.authentication.secret = 'short'; }, c => { c.connectionRevision = '1'; }, c => { c.extra = true; },
    c => { c.authentication.extra = true; }, c => { c.projectId = ' trailing '; }]) {
    const c = entry(); mutate(c); assert.throws(() => parse([c]), /configuration_unavailable/u);
  }
  assert.throws(() => parse([entry(), entry()]), /configuration_unavailable/u);
  for (const value of [undefined, '', '{}', '{', ' '.repeat(131073), JSON.stringify({ connections: [] })])
    assert.throws(() => api.parseNativeStoreRuntimeConnectionsV1(value), /configuration_unavailable/u);
});
test('every registry scope and key selector is checked without latest fallback or secret leakage', () => {
  const entries = parse([entry(), entry(2)]);
  for (const field of ['id', 'revision', 'project_id', 'app_id', 'store', 'environment', 'auth_key_version', 'storage_key_id']) {
    const r = registry(); r[field] = 'wrong';
    assert.throws(() => api.resolveNativeStoreOriginalConnectionV1(entries, r), error => error.message === 'native_store_runtime_configuration_unavailable');
  }
});
