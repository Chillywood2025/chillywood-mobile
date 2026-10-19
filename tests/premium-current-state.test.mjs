import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePremiumPurchaseReadiness } from '../_lib/premiumPurchaseReadiness.mjs';
import { deferred, owner, premiumRuntime } from './helpers/premium-runtime-harness.mjs';

for (const platform of ['android', 'ios']) test(`${platform}: provider-active/backend-expired blocks another purchase without granting access`, async () => {
  const h = premiumRuntime(platform), snapshot = await h.read();
  assert.equal(snapshot.targets.premium_subscription.hasEntitlement, false);
  const result = await h.monetary.purchaseMonetizationTarget('premium_subscription', { userId: h.state.authority.userId, purchaseMode: 'internal_tester_sandbox' });
  assert.equal(h.state.purchases, 0);
  assert.equal(result.ok, false);
  assert.match(result.message, /verif|confirm/i);
  assert.equal(result.snapshot.targets.premium_subscription.hasEntitlement, false);
  assert.equal(h.state.reconciles, 0, 'no new server/provider reconciliation policy');
});

test('older expired read cannot overwrite newer authoritative active cache', async () => {
  const h = premiumRuntime(); h.state.held = deferred(); h.state.entered = deferred();
  const old = h.read(); await h.state.entered.promise; h.state.active = true;
  const fresh = await h.read(); assert.equal(h.monetary.getCachedMonetizationSnapshot().targets.premium_subscription.hasEntitlement, true);
  h.state.held.resolve(); const oldResult = await old;
  assert.equal(oldResult, fresh, 'an awaiting consumer receives the newest completed snapshot, never an obsolete inactive result');
  assert.equal(h.monetary.getCachedMonetizationSnapshot().targets.premium_subscription.hasEntitlement, true);
});

test('late old active read cannot overwrite a newer expired decision', async () => {
  const h = premiumRuntime(); h.state.active = true; h.state.held = deferred(); h.state.entered = deferred();
  const old = h.read(); await h.state.entered.promise; h.state.active = false;
  await h.read(); h.state.held.resolve(); await old;
  assert.equal(h.monetary.getCachedMonetizationSnapshot().targets.premium_subscription.hasEntitlement, false);
});

test('provider inactive and backend expired still permits the legitimate normal purchase', async () => {
  const h = premiumRuntime(); h.state.providerActive = false;
  const result = await h.monetary.purchaseMonetizationTarget('premium_subscription', { userId: h.state.authority.userId, purchaseMode: 'internal_tester_sandbox' });
  assert.equal(h.state.purchases, 1); assert.equal(result.ok, true);
});

test('Restore remains available while backend confirmation is pending', async () => {
  const h = premiumRuntime(); await h.read();
  const result = await h.monetary.restoreMonetizationAccess({ userId: h.state.authority.userId, purchaseMode: 'internal_tester_sandbox' });
  assert.equal(h.state.restores, 1); assert.equal(h.state.purchases, 0); assert.equal(result.snapshot.targets.premium_subscription.hasEntitlement, true);
});

for (const replacement of [owner('replacement'), owner('session-b', 'other-user'), null]) test(`held read retires across ${replacement?.userId ?? 'logout'}/${replacement?.sessionGeneration ?? ''}`, async () => {
  const h = premiumRuntime(); h.state.active = true; h.state.held = deferred(); h.state.entered = deferred();
  const old = h.read(); await h.state.entered.promise; h.replace(replacement); h.state.held.resolve(); await old;
  assert.equal(h.monetary.getCachedMonetizationSnapshot().targets.premium_subscription.hasEntitlement, false);
});

test('pending readiness explains verification and preserves backend authority', () => {
  const input = { isSignedIn: true, hasPremium: false, storePremiumActive: true, customerInfoLoaded: true, purchaseShellAvailable: true, purchaseMode: 'public', revenueCatConfigured: true, canMakePayments: true, offeringAvailable: true, packageCount: 1, storeName: 'Google Play' };
  const result = resolvePremiumPurchaseReadiness(input);
  assert.equal(result.ready, false); assert.equal(result.code, 'premium_verification_pending');
  assert.equal(resolvePremiumPurchaseReadiness({ ...input, storePremiumActive: false }).ready, true);
});

test('late provider error cannot erase a newer cache result', async () => {
  const h = premiumRuntime(); h.state.held = deferred(); h.state.entered = deferred();
  const old = h.read(); await h.state.entered.promise; h.state.active = true; await h.read();
  h.state.held.reject(Error('old provider failure')); await old;
  assert.equal(h.monetary.getCachedMonetizationSnapshot().targets.premium_subscription.hasEntitlement, true);
});

test('same-owner authority publication does not retire the current read', async () => {
  const h = premiumRuntime(); h.state.active = true; h.state.held = deferred(); h.state.entered = deferred();
  const read = h.read(); await h.state.entered.promise; h.replace({ ...h.state.authority }); h.state.held.resolve();
  assert.equal((await read).targets.premium_subscription.hasEntitlement, true);
});

test('provider pending signal never treats a foreign, anonymous or unrelated product as the current subscription', async () => {
  const h = premiumRuntime(), snapshot = await h.read();
  assert.equal(h.monetary.hasCurrentStorePremiumSubscription(snapshot), true);
  for (const changed of [{ revenueCatAppUserId: 'other' }, { isAnonymousCustomer: true }, { customerInfoLoaded: false }, { activeProductIds: ['unrelated'] }]) {
    assert.equal(h.monetary.hasCurrentStorePremiumSubscription({ ...snapshot, ...changed }), false);
  }
});

for (const platform of ['ios', 'android']) test(`${platform}: the other platform's product cannot authorize store management`, async () => {
  const h = premiumRuntime(platform), snapshot = await h.read();
  assert.equal(h.monetary.hasCurrentStorePremiumSubscription({ ...snapshot, activeProductIds: [platform === 'ios' ? 'premium_subscription' : 'com.chillywood.premium.monthly'] }), false);
});

test('actual access-sheet orchestration offers Recheck and Restore for pending Premium', async () => {
  const h = premiumRuntime();
  const sheet = await h.monetary.readMonetizationAccessSheetState({ userId: h.state.authority.userId, purchaseMode: 'internal_tester_sandbox',
    gate: { reason: 'premium_required', monetization: { primaryTargetId: 'premium_subscription', purchaseTargetId: 'premium_subscription' } } });
  assert.equal(sheet.primaryAction, 'retry'); assert.equal(sheet.canRestore, true);
  assert.match(sheet.helperBody, /do not purchase again/); assert.equal(sheet.snapshot.targets.premium_subscription.hasEntitlement, false);
});

test('pending store Premium does not replace an independent paid-title access-sheet decision', async () => {
  const h = premiumRuntime();
  const sheet = await h.monetary.readMonetizationAccessSheetState({ userId: h.state.authority.userId, purchaseMode: 'internal_tester_sandbox',
    gate: { reason: 'party_pass_required', monetization: { primaryTargetId: 'paid_title_access', purchaseTargetId: 'paid_title_access' } } });
  assert.notEqual(sheet.helperKicker, 'VERIFICATION PENDING');
  assert.doesNotMatch(sheet.helperBody, /do not purchase again/);
  assert.equal(sheet.snapshot.targets.paid_title_access.hasEntitlement, false);
});

test('read generation is reserved before the first held authority lookup', async () => {
  const h = premiumRuntime(), held = deferred(); let reads = 0;
  h.state.authorityReader = () => ++reads === 1 ? held.promise : h.state.authority;
  const older = h.read(); await h.read(); h.state.active = true; held.resolve(h.state.authority); await older;
  assert.equal(h.monetary.getCachedMonetizationSnapshot().targets.premium_subscription.hasEntitlement, false);
});

test('A to B to A authority changes retire the original pending read', async () => {
  const h = premiumRuntime(); h.state.active = true; h.state.held = deferred(); h.state.entered = deferred();
  const old = h.read(); await h.state.entered.promise;
  h.replace(owner('other')); h.replace(owner()); h.state.held.resolve(); const result = await old;
  assert.equal(result.targets.premium_subscription.hasEntitlement, false);
  assert.equal(h.monetary.getCachedMonetizationSnapshot().targets.premium_subscription.hasEntitlement, false);
});

test('a superseded read does not return the cache from before a still-pending newer read', async () => {
  const h = premiumRuntime(); h.state.active = true; await h.read(); h.state.active = false;
  const oldProvider = deferred(), newProvider = deferred(), oldEntered = deferred(), newEntered = deferred(); let reads = 0;
  h.state.providerReader = () => { if (++reads === 1) { oldEntered.resolve(); return oldProvider.promise; } newEntered.resolve(); return newProvider.promise; };
  const old = h.read(); await oldEntered.promise; const newer = h.read(); await newEntered.promise;
  oldProvider.resolve({ activeSubscriptions: [], entitlements: { active: {} } });
  assert.equal((await old).targets.premium_subscription.hasEntitlement, false);
  newProvider.resolve({ activeSubscriptions: [], entitlements: { active: {} } }); await newer;
  assert.equal(h.monetary.getCachedMonetizationSnapshot().targets.premium_subscription.hasEntitlement, false);
});

const purchaseOptions = h => ({ userId: h.state.authority.userId, purchaseMode: 'internal_tester_sandbox' });
const purchaseReadiness = (h, snapshot) => resolvePremiumPurchaseReadiness({
  isSignedIn: true, hasPremium: snapshot.targets.premium_subscription.hasEntitlement,
  storePremiumActive: h.monetary.hasCurrentStorePremiumSubscription(snapshot),
  customerInfoLoaded: snapshot.customerInfoLoaded, purchaseShellAvailable: true,
  purchaseMode: 'internal_tester_sandbox', revenueCatConfigured: true,
  storeName: 'Store', storePurchaseRailReadbackComplete: true, storePurchaseRailState: 'sandbox_only',
  canMakePayments: snapshot.canMakePayments,
  offeringAvailable: snapshot.targets.premium_subscription.offeringAvailable,
  packageCount: snapshot.targets.premium_subscription.packageCount,
});

for (const platform of ['android', 'ios']) {
  test(`${platform}: unavailable customer info after pending Restore blocks another Premium purchase`, async () => {
    const h = premiumRuntime(platform, { independentProjection: true, immediatePolls: true });
    assert.equal(h.monetary.hasCurrentStorePremiumSubscription(await h.read()), true);
    h.state.restore = async () => {
      const customer = h.customer();
      h.state.providerReader = async () => null; // SDK wrapper returns null for failed/timed-out reads.
      return customer;
    };
    const restored = await h.monetary.restoreMonetizationAccess(purchaseOptions(h));
    assert.equal(h.state.restores, 1);
    assert.equal(restored.ok, false);
    assert.match(restored.message, /still reconciling/);
    assert.equal(restored.snapshot.customerInfoLoaded, false);
    assert.equal(restored.snapshot.targets.premium_subscription.hasEntitlement, false);
    const readiness = purchaseReadiness(h, restored.snapshot);
    assert.equal(readiness.ready, false);
    assert.equal(readiness.code, 'provider_status_unavailable');
    assert.match(readiness.message, /Recheck status or restore purchases/);
    const attempted = await h.monetary.purchaseMonetizationTarget('premium_subscription', purchaseOptions(h));
    assert.equal(h.state.purchases, 0);
    assert.equal(attempted.ok, false);
    assert.match(attempted.message, /subscription status could not be checked/);
    assert.equal(attempted.snapshot.targets.premium_subscription.hasEntitlement, false);

    // A genuine subsequent known-inactive read allows the normal purchase path again.
    h.state.providerReader = null;
    h.state.providerActive = false;
    assert.equal(purchaseReadiness(h, await h.read()).ready, true);
    await h.monetary.purchaseMonetizationTarget('premium_subscription', purchaseOptions(h));
    assert.equal(h.state.purchases, 1);
    assert.equal(h.monetary.getCachedMonetizationSnapshot().targets.premium_subscription.hasEntitlement, false);
  });

  for (const state of ['EXPIRED', 'REVOKED', 'UNKNOWN']) {
    for (const failure of ['null', 'query_error', 'identity_mismatch']) {
      test(`${platform}: ${failure} customer info with ${state} authority cannot start Premium`, async () => {
        const h = premiumRuntime(platform, { independentProjection: true, immediatePolls: true });
        h.state.entitlementReader = async keys => keys.map(entitlementKey => ({
          entitlementKey, state, authoritative: state !== 'UNKNOWN', isActive: false, grantsProtectedAccess: false,
        }));
        if (failure === 'identity_mismatch') h.state.providerIdentity = false;
        else h.state.providerReader = async () => {
          if (failure === 'query_error') throw Error('modeled unavailable customer info');
          return null;
        };
        const result = await h.monetary.purchaseMonetizationTarget('premium_subscription', purchaseOptions(h));
        assert.equal(h.state.purchases, 0);
        assert.equal(result.ok, false);
        assert.equal(result.snapshot.customerInfoLoaded, false);
        assert.equal(result.snapshot.targets.premium_subscription.hasEntitlement, false);
        assert.equal(purchaseReadiness(h, result.snapshot).ready, false);
      });
    }
  }

  test(`${platform}: unknown customer info does not revoke independently active Premium`, async () => {
    const h = premiumRuntime(platform);
    h.state.active = true;
    h.state.providerReader = async () => null;
    const result = await h.monetary.purchaseMonetizationTarget('premium_subscription', purchaseOptions(h));
    assert.equal(result.ok, true);
    assert.equal(h.state.purchases, 0);
    assert.equal(result.snapshot.targets.premium_subscription.hasEntitlement, true);
    assert.equal(purchaseReadiness(h, result.snapshot).code, 'premium_already_active');
  });
}

test('Premium readiness requires explicit customer-info readback', () => {
  const input = { isSignedIn: true, hasPremium: false, storePremiumActive: false,
    purchaseShellAvailable: true, purchaseMode: 'public', revenueCatConfigured: true,
    canMakePayments: true, offeringAvailable: true, packageCount: 1, storeName: 'Store' };
  for (const customerInfoLoaded of [undefined, null, false]) {
    assert.equal(resolvePremiumPurchaseReadiness({ ...input, customerInfoLoaded }).code, 'provider_status_unavailable');
  }
  assert.equal(resolvePremiumPurchaseReadiness({ ...input, customerInfoLoaded: true }).ready, true);
});

const recoveryAction = (h, action) => {
  h.state.providerActive = action === 'restore';
  if (action === 'already_owned') h.state.purchase = async () => {
    h.state.providerActive = true;
    throw { code: 6, message: 'modeled already purchased' };
  };
  return () => action === 'restore'
    ? h.monetary.restoreMonetizationAccess(purchaseOptions(h))
    : h.monetary.purchaseMonetizationTarget('premium_subscription', purchaseOptions(h));
};
const inactiveDecisions = (keys, active = false) => keys.map(entitlementKey => ({
  entitlementKey, authoritative: true, state: active && entitlementKey === 'premium' ? 'ACTIVE' : 'EXPIRED',
  isActive: active && entitlementKey === 'premium', grantsProtectedAccess: active && entitlementKey === 'premium',
}));
const successfulReconciliation = (status = 'reconciled') => ({
  data: { status, entitlementActive: status !== 'inactive' }, error: null,
});

for (const action of ['purchase', 'restore', 'already_owned']) {
  for (const failure of ['blocked409', 'blocked429', 'unavailable503', 'network', 'malformed', 'inconsistent']) {
    test(`${action}: failed ${failure} verification remains failure after authoritative polling`, async () => {
      const h = premiumRuntime('android', { independentProjection: true, immediatePolls: true });
      const run = recoveryAction(h, action);
      h.state.reconcile = async () => {
        if (failure === 'network') throw Error('private-provider-message');
        if (failure === 'malformed') return { data: { entitlementActive: true }, error: null };
        if (failure === 'inconsistent') return { data: { status: 'reconciled', entitlementActive: false, liveMoneyAction: false }, error: null };
        return { data: { status: failure.startsWith('blocked') ? 'blocked' : 'unavailable', entitlementActive: false,
          liveMoneyAction: false, message: 'private-provider-message' },
          error: { context: { status: Number(failure.match(/\d+/)[0]) }, message: 'private-provider-message' } };
      };
      const result = await run();
      assert.equal(result.ok, false);
      assert.equal(result.snapshot.targets.premium_subscription.hasEntitlement, false);
      assert.match(result.message, /Premium verification failed/);
      assert.match(result.message, /Recheck status or restore purchases; do not purchase again/);
      assert.doesNotMatch(result.message, /private-provider-message|still reconciling|Waiting for verified access/);
      assert.equal(h.state.reconciles, 1);
      assert.equal(h.state.reads, 14, 'one preflight, twelve polls and the existing final read; no extra read');
      const purchases = h.state.purchases;
      await h.monetary.purchaseMonetizationTarget('premium_subscription', purchaseOptions(h));
      assert.equal(h.state.purchases, purchases, 'known active store continues to block a duplicate purchase');
      assert.equal(h.state.reconciles, 1, 'duplicate prevention does not add a reconciliation call');
    });
  }

  for (const status of ['reconciled', 'already_reconciled', 'inactive']) {
    test(`${action}: successful ${status} response without projection stays pending`, async () => {
      const h = premiumRuntime('ios', { independentProjection: true, immediatePolls: true });
      const run = recoveryAction(h, action);
      h.state.reconcile = async () => successfulReconciliation(status);
      const result = await run();
      assert.equal(result.ok, false);
      assert.equal(result.snapshot.targets.premium_subscription.hasEntitlement, false);
      assert.match(result.message, /still reconciling|Waiting for verified access/);
      assert.doesNotMatch(result.message, /verification failed/);
      assert.equal(h.state.reconciles, 1);
    });
  }

  for (const activeRead of [3, 13]) {
    test(`${action}: authoritative active read ${activeRead} wins after blocked409 verification`, async () => {
      const h = premiumRuntime('android', { independentProjection: true, immediatePolls: true });
      const run = recoveryAction(h, action);
      let subsequentReads = 0;
      h.state.reconcile = async () => {
        h.state.entitlementReader = async keys => inactiveDecisions(keys, ++subsequentReads >= activeRead);
        return { data: null, error: { context: { status: 409 }, message: 'modeled blocked verification' } };
      };
      const result = await run();
      assert.equal(result.ok, true);
      assert.equal(result.snapshot.targets.premium_subscription.hasEntitlement, true);
      assert.doesNotMatch(result.message, /failed|still reconciling|Waiting for verified access/);
      assert.equal(subsequentReads, activeRead, 'the thirteenth read is the existing final fallback, not a new poll');
      assert.equal(h.state.reconciles, 1);
    });
  }

  test(`${action}: stale reconciliation result cannot report verified access for a replacement account`, async () => {
    const h = premiumRuntime('ios', { independentProjection: true, immediatePolls: true });
    const run = recoveryAction(h, action), held = deferred(), entered = deferred();
    h.state.reconcile = async () => { entered.resolve(); return held.promise; };
    const pending = run(); await entered.promise;
    h.replace(owner('replacement', 'other-user'));
    h.state.active = true;
    held.resolve(successfulReconciliation());
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.customerInfo, null);
    assert.match(result.message, /Account changed/);
    assert.doesNotMatch(result.message, /Premium is active|still reconciling|purchase completed/);
    assert.equal(h.state.reconciles, 1);
  });
}

test('non-Premium existing-purchase recovery retains its prior message on reconciliation failure', async () => {
  const h = premiumRuntime('android', { independentProjection: true, immediatePolls: true });
  recoveryAction(h, 'already_owned');
  const pkg = { identifier: 'title-unlock', product: { identifier: 'modeled-title-product' } };
  const offering = { identifier: 'paid-content', availablePackages: [pkg] };
  h.state.offeringsReader = async () => ({ current: offering, all: { 'paid-content': offering } });
  h.state.reconcile = async () => ({ data: null, error: { message: 'modeled reconciliation failure' } });
  const result = await h.monetary.purchaseMonetizationTarget('paid_title_access', purchaseOptions(h));
  assert.equal(h.state.purchases, 1);
  assert.equal(h.state.restores, 1);
  assert.equal(result.ok, false);
  assert.equal(result.snapshot.targets.paid_title_access.hasEntitlement, false);
  assert.match(result.message, /The store restored Premium, but verified app access is still reconciling/);
  assert.doesNotMatch(result.message, /Premium verification failed/);
});
