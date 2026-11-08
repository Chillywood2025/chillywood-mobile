import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { Buffer } from 'node:buffer';
globalThis.crypto ??= webcrypto;
const require = createRequire(import.meta.url), ts = require('typescript');
export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const sharedPaths = ['revenuecat-router-envelope.ts','isolated-test-store-qualification.ts']
  .map(name => path.join(repo, 'supabase/functions/_shared', name));
export const edgePath = path.join(repo, 'supabase/functions/isolated-test-store-capture-v1/index.ts');
export function loadCapture(env = {}, fetcher = () => { throw Error('Unexpected network'); }) {
  const allowed = new Set([...sharedPaths, edgePath]), cache = new Map();
  const load = file => {
    assert.ok(allowed.has(file), 'Unreviewed import: ' + file);
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const result = ts.transpileModule(fs.readFileSync(file,'utf8').replaceAll('import.meta.main','false'), {
      reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    assert.deepEqual(result.diagnostics, []);
    new Function('exports','require','Deno','fetch',result.outputText)(exports,
      specifier => load(path.resolve(path.dirname(file),specifier)), { env: { get: key => env[key] } }, fetcher);
    return exports;
  };
  return { edge: load(edgePath), qualification: load(sharedPaths[1]), transport: load(sharedPaths[0]) };
}
export const connection = () => ({ connectionId: '11111111-1111-4111-8111-111111111111', connectionRevision: 1,
  projectId: 'synthetic-capture-project', appId: 'synthetic-capture-app',
  authentication: { method: 'shared_secret', keyVersion: 'synthetic-capture-auth', secret: 'Bearer ' + 'c'.repeat(40) },
  encryption: { keyId: 'synthetic-capture-storage', key: new Uint8Array(32).fill(37) } });
export const environment = () => {
  const c=connection(); return { RCQ_CAPTURE_V1_ENABLED:'true', RCQ_CAPTURE_V1_CONNECTION_ID:c.connectionId,
    RCQ_CAPTURE_V1_CONNECTION_REVISION:'1', RCQ_CAPTURE_V1_PROJECT_ID:c.projectId, RCQ_CAPTURE_V1_APP_ID:c.appId,
    RCQ_CAPTURE_V1_AUTH_KEY_VERSION:c.authentication.keyVersion, RCQ_CAPTURE_V1_AUTHORIZATION_VALUE:c.authentication.secret,
    RCQ_CAPTURE_V1_STORAGE_KEY_ID:c.encryption.keyId, RCQ_CAPTURE_V1_STORAGE_KEY_BASE64:Buffer.from(c.encryption.key).toString('base64'),
    SUPABASE_URL:'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-credential' };
};
export const event = patch => ({ api_version:'1.0', event:{ id:'synthetic-event', type:'NON_RENEWING_PURCHASE',
  app_id:connection().appId, store:'TEST_STORE', environment:'SANDBOX', event_timestamp_ms:1794052801000,
  app_user_id:'synthetic-customer', original_app_user_id:'synthetic-customer', aliases:[], product_id:'synthetic-product',
  original_transaction_id:'synthetic-original', transaction_id:'synthetic-transaction', ...patch } });
export const request = (raw=JSON.stringify(event()), authorization=connection().authentication.secret) =>
  new Request('https://synthetic.invalid/provider',{method:'POST',headers:{authorization},body:raw});
export const text = value => "'" + String(value).replaceAll("'","''") + "'";
export const json = value => text(JSON.stringify(value)) + '::jsonb';
