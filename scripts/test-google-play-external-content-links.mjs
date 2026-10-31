import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../_lib/google-play-external-content-link-flow.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports, URL, Error });
const { createGooglePlayExternalLinkFlow: create, googlePlayExternalLinkSupported: supported } = exports;
let backendCalls = 0;
for (const platform of ['android', 'ios', 'web']) {
  await assert.rejects(() => create(platform, () => null)(async () => { backendCalls++; }), error => error.code === 'ECL_UPDATE_REQUIRED');
}
assert.equal(backendCalls, 0, 'Installed V17 without bridge must fail before backend checkout');
let prepares = 0, launches = 0, cancels = 0;
const native = {
  capabilities: () => ({ apiVersion: 1, program: 'external_content_link', billingLibraryVersion: '8.2.1' }),
  prepare: async () => ({ flowId: `flow-${++prepares}`, externalTransactionToken: `fresh-${prepares}` }),
  launch: async () => { launches++; return { launched: true }; },
  cancel: async () => { cancels++; },
};
assert.equal(supported('android', native), true);
assert.equal(supported('ios', native), false);
assert.equal(supported('android', { ...native, capabilities: () => ({ apiVersion: 2 }) }), false);
assert.equal(supported('android', { ...native, capabilities: () => { throw Error('unavailable'); } }), false);
const run = create('android', () => native);
const checkout = async input => {
  assert.equal(input.google_play_external_transaction_token, `fresh-${prepares}`);
  assert.equal(input.google_play_external_link_api_version, 1);
  return { url: 'https://checkout.stripe.com/c/pay/test-fixture' };
};
await run(checkout); await run(checkout);
assert.equal(prepares, 2); assert.equal(launches, 2); assert.equal(cancels, 2);
for (const url of ['http://checkout.stripe.com/c/pay/test', 'https://checkout.stripe.com.evil.example/c/pay/test',
  'https://user@checkout.stripe.com/c/pay/test', 'https://checkout.stripe.com/invalid', 'not-a-url']) {
  await assert.rejects(() => run(async () => ({ url })));
}
assert.equal(launches, 2, 'Invalid URLs never reach Google or any browser');
await assert.rejects(() => run(async () => { throw Error('account changed'); }));
assert.equal(launches, 2, 'Failed authenticated quote binding never opens checkout');

let release;
const pending = run(() => new Promise(resolve => { release = resolve; }));
await new Promise(resolve => setImmediate(resolve));
await assert.rejects(() => run(checkout), error => error.code === 'ECL_BUSY');
release(await checkout({ google_play_external_transaction_token: `fresh-${prepares}`, google_play_external_link_api_version: 1 }));
await pending;
for (const code of ['ECL_CANCELLED', 'ECL_PLAY_3', 'ECL_SERVICE_DISCONNECTED', 'ECL_FLOW_EXPIRED']) {
  native.launch = async () => { throw Object.assign(Error('safe failure'), { code }); };
  await assert.rejects(() => run(checkout), error => error.code === code);
}
native.prepare = async () => ({ flowId: 'invalid-token', externalTransactionToken: '' });
await assert.rejects(() => run(checkout), error => error.code === 'ECL_TOKEN_UNAVAILABLE');
assert.equal(cancels, prepares + 1, 'Every prepared flow is cancelled/closed even on failures');
assert(!source.includes('openBrowser') && !source.includes('Linking.openURL'), 'No plain-browser fallback');
const eligibility = exports.createGooglePlayExternalEligibilityFlow('android', () => native);
let eligibilityToken=0;
native.prepare=async()=>({flowId:'bid-'+(++eligibilityToken),externalTransactionToken:'bid-token-'+eligibilityToken});
native.launch=()=>assert.fail('Bid eligibility must never launch a checkout');
const beforeEligibilityCancel=cancels;
assert.equal(await eligibility(async input=>{assert.equal(input.google_play_external_transaction_token,'bid-token-1');return 'eligible';}),'eligible');
await assert.rejects(()=>eligibility(async()=>{throw Error('bid account changed');}));
assert.equal(cancels,beforeEligibilityCancel+2);
await assert.rejects(()=>exports.createGooglePlayExternalEligibilityFlow('android',()=>null)(async()=>assert.fail('old build cannot admit bids')),error=>error.code==='ECL_UPDATE_REQUIRED');
console.log('Google Play external-content-link adapter: capability, fresh token, duplicate, URL, backend, cancellation and cleanup tests passed');
