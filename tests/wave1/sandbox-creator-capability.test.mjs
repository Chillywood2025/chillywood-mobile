import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const load = (path, mocks = {}) => {
  const module = { exports: {} };
  new Function('exports', 'module', 'require', ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(module.exports, module, name => { assert.ok(name in mocks, name); return mocks[name]; });
  return module.exports;
};
const eligibility = load('_lib/creatorEligibility.ts');
const { parseCreatorEligibilityReadback: parse, canUseCreatorSandboxTools: sandbox, canCreateCreatorMoneyExposure: live } = eligibility;
const owner = { userId: 'creator', accountId: 'creator', sessionGeneration: 'session', state: 'ACTIVE', restoreOnly: false };
const row = () => ({ ...owner, state: 'PENDING_VERIFICATION', authoritative: true, authoritySource: 'automatic_eligibility',
  accountStatus: 'ACTIVE', moderationState: 'CLEAR', age18Plus: true, market: 'UNITED_STATES', creatorRole: true,
  legalAccepted: true, platformCapability: true, rolloutEligible: true, taxComplete: null, sanctionsClear: null,
  providerEligible: null, payoutEligible: null, kycComplete: null, canCreateMoneyExposure: false,
  canProcessHistoricalObligations: true, version: 1, evaluatedAt: '2026-11-06T00:00:00Z', minimumAge: 18,
  rollout: 'AUTOMATIC_PREMIUM_UNITED_STATES', sandboxCapability: { environment: 'sandbox', financialAuthority: false, canUseCreatorTools: true } });
test('pending canonical capability grants only sandbox tools, with exact expected subject and brand', () => {
  const decision = parse(row(), owner);
  assert.equal(sandbox(decision), true); assert.equal(live(decision), false);
  assert.equal(decision.state, 'PENDING_VERIFICATION'); assert.equal(decision.inputs.taxComplete, null);
  assert.equal(sandbox({ ...decision }), false);
  const denied = parse(null, owner); denied.canUseSandboxCreatorTools = true; assert.equal(sandbox(denied), false);
  assert.equal(sandbox(parse(row())), false);
  for (const patch of [{ authoritative: false }, { userId: 'other' }, { accountId: 'other' }, { sessionGeneration: 'old' },
    { authoritySource: 'client' }, { restoreOnly: true }, { version: 0 }, { evaluatedAt: 'bad' }, { taxComplete: false },
    { state: 'SUSPENDED' }, { moderationState: 'PENDING' }, { platformCapability: false }, { canUseSandboxCreatorTools: true, sandboxCapability: null },
    ...[{ environment: 'production' }, { financialAuthority: true }, { canUseCreatorTools: 'true' }].map(p => ({ sandboxCapability: { ...row().sandboxCapability, ...p } }))]) {
    assert.equal(sandbox(parse({ ...row(), ...patch }, owner)), false, JSON.stringify(patch));
  }
});
function setupClient() {
  const state = { authority: owner, row: row(), calls: [], configPatch: {} };
  const same = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
  const api = load('_lib/creatorMonetizationSetup.ts', {
    'react-native': { Linking: {}, Platform: { OS: 'android' } }, './revenuecat': {},
    './creatorMoneyPurchaseAuthority': { prepareCreatorMoneyPurchaseSubject: async () => ({ userId: owner.userId, authority: state.authority }) },
    './iosAppStoreCommerce': {}, './paymentRailPolicy': {},
    './supabase': { SUPABASE_URL: 'https://example.invalid', supabase: { rpc: async () => ({ data: state.row }) } },
    './creatorEligibility': eligibility,
    './accountSessionAuthority': { getCurrentAccountSessionAuthoritySnapshot: () => state.authority,
      readCurrentAccountSessionAuthority: async () => state.authority, sameAccountSessionAuthority: same },
    './entitlementAuthority': { withAuthorityReadDeadline: async value => value },
    './accountBoundSupabaseMutation': {
      captureAccountBoundSupabaseMutationSubject: async () => ({ authority: state.authority }),
      invokeAccountBoundSupabaseMutationRpc: async (_s, name) => { state.calls.push(name); return { data: {
        id: 'config', sourceType: 'paid_content', sourceId: 'source', productKey: 'paid_content_access_sandbox_099',
        environment: 'sandbox', payableState: 'not_payable', productionEnabled: false, payoutEnabled: false,
        ...state.configPatch,
      } }; },
    },
  });
  return { api, state };
}
test('sandbox setup saves pending creator with bound authority; live assertion and wrong subject stay denied', async () => {
  const { api, state } = setupClient();
  const input = { productKey: 'paid_content_access_sandbox_099', sourceType: 'paid_content', sourceId: '11111111-1111-4111-8111-111111111111' };
  await api.saveCreatorSandboxMonetizationConfig(input);
  assert.deepEqual(state.calls, ['save_creator_sandbox_monetization_config']);
  await assert.rejects(api.assertCreatorMoneyExposureAllowed(owner), /verification/);
  state.row = { ...row(), sessionGeneration: 'other' };
  await assert.rejects(api.saveCreatorSandboxMonetizationConfig(input), /eligibility/);
  state.row = row();
  for (const patch of [{ environment: 'production' }, { productionEnabled: true }, { payoutEnabled: true }, { payableState: 'payable' }]) {
    await assert.rejects(api.launchCreatorSandboxDigitalPurchase({ userId: owner.userId, config: {
      environment: 'sandbox', payableState: 'not_payable', productionEnabled: false, payoutEnabled: false, ...patch,
    } }), /isolated non-payable/);
  }
  assert.equal(state.calls.length, 1);
});
test('server config normalization never relabels production or payable responses as sandbox', async () => {
  const { api, state } = setupClient();
  for (const patch of [{ environment: 'production' }, { productionEnabled: true }, { payoutEnabled: true }, { payableState: 'payable' }]) {
    state.configPatch = patch;
    await assert.rejects(api.saveCreatorSandboxMonetizationConfig({ productKey: 'paid_content_access_sandbox_099', sourceType: 'paid_content',
      sourceId: '11111111-1111-4111-8111-111111111111' }), /config was not returned/);
  }
});
