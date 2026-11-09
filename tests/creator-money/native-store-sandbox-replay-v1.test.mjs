import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto, createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
globalThis.crypto ??= webcrypto;
const ts = createRequire(import.meta.url)('typescript');
const root = new URL('../../supabase/functions/_shared/', import.meta.url), cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const result = {}; cache.set(name, result);
  const compiled = ts.transpileModule(readFileSync(new URL(name, root), 'utf8'), {
    reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  assert.deepEqual(compiled.diagnostics, []);
  new Function('exports', 'require', compiled.outputText)(result, specifier => load(specifier.replace(/^\.\//u, '')));
  return result;
}
const { prepareNativeStoreSandboxIntakeV1: prepare } = load('native-store-sandbox-bridge-v1.ts');
const { replayNativeStoreSandboxReceiptV1: replay } = load('native-store-sandbox-replay-v1.ts');
const config = () => ({ bridgeProtocol: 'native-store-sandbox-v1',
  connectionId: '11111111-1111-4111-8111-111111111111', connectionRevision: 1,
  projectId: 'synthetic-project', appId: 'synthetic-app', store: 'APP_STORE', environment: 'SANDBOX',
  authentication: { method: 'shared_secret', keyVersion: 'v1', secret: 'synthetic-secret-not-real-'.repeat(2) },
  encryption: { keyId: 'synthetic-key', key: new Uint8Array(32).fill(17) } });
const payload = (patch = {}) => JSON.stringify({ api_version: '1.0', event: {
  id: 'synthetic-event', type: 'NON_RENEWING_PURCHASE', app_id: 'synthetic-app', store: 'APP_STORE', environment: 'SANDBOX',
  event_timestamp_ms: 1794139200000, app_user_id: 'synthetic-buyer', original_app_user_id: 'synthetic-buyer',
  product_id: 'synthetic-product', transaction_id: 'synthetic-tx', original_transaction_id: 'synthetic-chain', ...patch } });
async function fixture(raw = payload(), connection = config()) {
  const intake = await prepare(new Request('https://local.invalid', { method: 'POST', body: raw,
    headers: { authorization: connection.authentication.secret } }), connection);
  return { row: { id: '22222222-2222-4222-8222-222222222222', project_id: connection.projectId,
    raw_sha256: intake.envelope.rawSha256, raw_byte_length: intake.envelope.rawByteLength,
    connection_id: connection.connectionId, connection_revision: connection.connectionRevision, envelope: intake.envelope }, connection };
}
const closed = result => {
  assert.equal(result.replayVerified, true); assert.equal(result.correlation, 'unsupported');
  for (const key of ['acknowledgementAllowed', 'dispatchAllowed', 'grantsAccess', 'financialAuthority']) assert.equal(result[key], false);
  assert.ok(result.reasons.includes('native_store_correlation_unsupported'));
};
const unavailable = error => error.code === 'native_store_replay_unavailable';
test('historical replay proves bytes, never a purchase, and returns no ciphertext/raw/config secrets', async () => {
  const { row, connection } = await fixture();
  const result = await replay(row, connection, false); closed(result);
  assert.equal(result.receiptId, row.id); assert.equal(result.originalRevisionRevoked, false);
  assert.equal(result.observation.userId, 'synthetic-buyer');
  for (const secret of [connection.authentication.secret, row.envelope.encryption.ciphertext, row.envelope.originalObservationBase64])
    assert.equal(JSON.stringify(result).includes(secret), false);
  assert.ok(Object.isFrozen(result.observation)); assert.ok(Object.isFrozen(result.observation.aliases));
});
test('rotation retains raw parent original revision; revoked history remains replayable without authority', async () => {
  const { row, connection } = await fixture();
  const latest = structuredClone(connection); latest.connectionRevision = 2; latest.encryption.keyId = 'new-key'; latest.encryption.key.fill(19);
  await assert.rejects(replay(row, latest, false), unavailable);
  const result = await replay(row, connection, true); closed(result);
  assert.equal(result.connectionRevision, 1); assert.equal(result.originalRevisionRevoked, true);
  assert.ok(result.reasons.includes('native_store_original_revision_revoked'));
});
test('raw parent metadata must bind original immutable connection and envelope exactly', async () => {
  const { row, connection } = await fixture();
  for (const patch of [{ connection_id: '33333333-3333-4333-8333-333333333333' }, { connection_revision: 2 },
    { project_id: 'other-project' }, { raw_sha256: 'b'.repeat(64) }, { raw_byte_length: row.raw_byte_length + 1 },
    { id: 'not-a-receipt' }]) await assert.rejects(replay({ ...row, ...patch }, connection, false), unavailable);
  for (const patch of [{ environment: 'PRODUCTION' }, { store: 'TEST_STORE' }, { bridgeProtocol: 'other' }])
    await assert.rejects(replay(row, { ...connection, ...patch }, false), unavailable);
});
test('missing and wrong original keys block replay with no fallback', async () => {
  const { row, connection } = await fixture();
  for (const encryption of [null, { ...connection.encryption, key: undefined },
    { ...connection.encryption, key: new Uint8Array(32).fill(99) }, { ...connection.encryption, keyId: 'wrong-key' }])
    await assert.rejects(replay(row, { ...connection, encryption }, false), unavailable);
});
test('ciphertext, nonce, raw hash and both observation forms cannot be substituted', async () => {
  const { row, connection } = await fixture();
  for (const tamper of [r => { r.envelope.encryption.ciphertext = 'A'.repeat(r.envelope.encryption.ciphertext.length); },
    r => { r.envelope.encryption.nonce = 'A'.repeat(16); },
    r => { r.raw_sha256 = r.envelope.rawSha256 = 'c'.repeat(64); },
    r => { r.envelope.observation.userId = 'forged'; },
    r => { const observation = { ...r.envelope.observation, userId: 'forged' }; const bytes = Buffer.from(JSON.stringify(observation));
      r.envelope.observation = observation; r.envelope.originalObservationBase64 = bytes.toString('base64');
      r.envelope.originalObservationSha256 = createHash('sha256').update(bytes).digest('hex'); }]) {
    const altered = structuredClone(row); tamper(altered); await assert.rejects(replay(altered, connection, false), unavailable);
  }
});
test('malformed, transfer, production and mismatched scope evidence remains read-only reconciliation', async () => {
  for (const raw of ['not json', payload({ app_user_id: '\ud800' }), payload({ environment: 'PRODUCTION' }),
    payload({ app_id: 'other-app' }), payload({ store: 'PLAY_STORE' }),
    payload({ type: 'TRANSFER', app_user_id: null, transferred_from: ['old'], transferred_to: ['new'] })]) {
    const { row, connection } = await fixture(raw);
    const result = await replay(row, connection, true); closed(result);
    if (raw.includes('TRANSFER')) assert.deepEqual(new Set(result.reconciliationSubjects), new Set(['synthetic-buyer', 'old', 'new']));
    if (raw.includes('PRODUCTION')) assert.ok(result.reasons.includes('native_store_sandbox_required'));
    if (raw.includes('other-app')) assert.ok(result.reasons.includes('native_store_app_mismatch'));
  }
});
test('metadata, key and registry scope detach before asynchronous decryption', async () => {
  const { row, connection } = await fixture();
  const pending = replay(row, connection, false);
  row.project_id = 'changed'; row.envelope.observation.userId = 'changed';
  connection.appId = 'changed'; connection.encryption.key.fill(99);
  const result = await pending; closed(result);
  assert.equal(result.projectId, 'synthetic-project'); assert.equal(result.observation.userId, 'synthetic-buyer');
  assert.equal(JSON.parse(result.scopeKey)[3], 'synthetic-app');
});
test('shared-backed configuration keys detach before asynchronous decryption', async () => {
  const { row, connection } = await fixture();
  connection.encryption.key = new Uint8Array(new SharedArrayBuffer(32));
  connection.encryption.key.fill(17);
  const pending = replay(row, connection, false);
  connection.encryption.key.fill(99);
  const result = await pending; closed(result);
  assert.equal(result.observation.userId, 'synthetic-buyer');
});
