import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
export const owner = (sessionGeneration = 'session-a', userId = 'owned-user') => ({ userId, accountId: userId, sessionGeneration, restoreOnly: false, state: 'ACTIVE' });
export const same = (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly;
export const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const noop = () => {};
const load = (path, mocks = {}, overrides = {}) => {
  const scope = { exports: {}, __DEV__: false, Date, Promise, setTimeout, clearTimeout, ...overrides.globals, require(id) {
    assert.ok(id in mocks, `unmodeled imported boundary: ${id}`); return mocks[id];
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(overrides.source || new URL(`../../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, scope);
  return scope.exports;
};

// Full actual monetization module, actual entitlement policy and purchase closure.
// Only account, database and provider boundaries are modeled; no real purchase occurs.
export function premiumRuntime(platform = 'android', { independentProjection = false, immediatePolls = false } = {}) {
  const product = platform === 'ios' ? 'com.chillywood.premium.monthly' : 'premium_subscription';
  const pkg = { identifier: 'monthly', product: { identifier: product } };
  const offering = { identifier: 'premium', availablePackages: [pkg], monthly: pkg };
  const state = { authority: owner(), active: false, providerActive: true, providerIdentity: true, reads: 0, providerReads: 0,
    purchases: 0, restores: 0, reconciles: 0, held: null, entered: null, authorityReader: null, providerError: false,
    pollDelays: [], railState: 'sandbox_only', railReadbackComplete: true, purchaseRequests: [], restoreRequests: [], reconcileRequests: [] };
  const listeners = new Set();
  const subscribeAuthority = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const customer = () => ({ entitlements: { active: state.providerActive ? { premium: {} } : {} }, activeSubscriptions: state.providerActive ? [product] : [] });
  const monetary = load('_lib/monetization.ts', {
    '@react-native-async-storage/async-storage': {}, 'react-native': { Platform: { OS: platform } },
    './analytics': { trackEvent: noop }, './logger': { debugLog: noop, reportRuntimeError: noop },
    './accountSessionAuthority': { readCurrentAccountSessionAuthority: async () => state.authorityReader ? state.authorityReader() : state.authority,
      getCurrentAccountSessionAuthoritySnapshot: () => state.authority, sameAccountSessionAuthority: same,
      subscribeToAccountSessionAuthority: subscribeAuthority },
    './featureFlags': { FEATURE_FLAGS: { monetization: { subscriptions: true } }, getAppMonetizationRuntimeFeatures: () => ({ premiumEnabled: true, liveMoneyEnabled: false, payoutsEnabled: false, cashoutEnabled: false }) },
    './moneyFeatureFlags': { readMoneyFeatureFlagSummaryWithStatus: async () => ({ rows: [], readbackComplete: state.railReadbackComplete }),
      getMoneyFeatureFlag: () => ({ state: state.railState }) },
    './moderation': { readMyPlatformRoleMemberships: async () => [], hasPlatformRoleMembership: () => false },
    './runtimeConfig': { getRuntimeConfig: () => ({ revenueCat: { appStorePurchasesEnabled: true } }), isBetaOperatorIdentity: () => false },
    './revenuecat': { configureRevenueCatOnce: () => ({ shouldConfigure: true, mode: platform === 'ios' ? 'ios-release' : 'android-release', apiKey: 'nonsecret-model' }),
      syncRevenueCatCustomerIdentity: async userId => ({ matchesSourceUser: state.providerIdentity, appUserId: userId, isAnonymous: false }),
      canMakeRevenueCatPurchases: async () => true,
      readRevenueCatCustomerInfo: async () => { state.providerReads++; if (state.providerReader) return state.providerReader();
        if (state.providerReads === 1 && state.held) { state.entered.resolve(); await state.held.promise; }
        if (state.providerError) throw Error('provider read unavailable'); return customer(); },
      readRevenueCatOfferings: async () => state.offeringsReader ? state.offeringsReader() : ({ current: offering, all: { premium: offering } }),
      purchaseRevenueCatPackage: async (...args) => { state.purchases++; state.purchaseRequests.push(args); if (state.purchase) return state.purchase(...args);
        if (!independentProjection) state.active = true; state.providerActive = true; return { customerInfo: customer(), productIdentifier: product }; },
      restoreRevenueCatPurchases: async (...args) => { state.restores++; state.restoreRequests.push(args); if (state.restore) return state.restore(...args);
        if (!independentProjection) state.active = true; return customer(); },
    },
    './premiumEntitlements': { readCurrentUserEntitlements: async (keys, options) => { state.reads++;
      if (state.entitlementReader) return state.entitlementReader(keys, options); const active = state.active;
      return keys.map(key => ({ entitlementKey: key, authoritative: true, state: active && key === 'premium' ? 'ACTIVE' : 'EXPIRED', isActive: active && key === 'premium', grantsProtectedAccess: active && key === 'premium' })); } },
    './entitlementAuthority': load('_lib/entitlementAuthority.ts'),
    './revenuecatPurchaseClosure': load('_lib/revenuecatPurchaseClosure.ts', {}, immediatePolls ? { globals: {
      setTimeout: (callback, delay) => { state.pollDelays.push(delay); return setTimeout(callback, 0); },
    } } : {}),
    './supabase': { supabase: { functions: { invoke: async (...args) => { state.reconciles++; state.reconcileRequests.push(args);
      return state.reconcile ? state.reconcile(...args) : { data: { status: 'inactive', entitlementActive: false, liveMoneyAction: false }, error: null }; } } } },
  }, { source: process.env.PREMIUM_RETURN_MONETIZATION_SOURCE });
  return { state, monetary, customer, product, subscribeAuthority, read: () => monetary.readMonetizationSnapshot({ forceRefresh: true, purchaseMode: 'internal_tester_sandbox', userId: state.authority?.userId }),
    replace(authority) { state.authority = authority; for (const listener of listeners) listener(authority); } };
}
