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
  const input = { isSignedIn: true, hasPremium: false, storePremiumActive: true, purchaseShellAvailable: true, purchaseMode: 'public', revenueCatConfigured: true, canMakePayments: true, offeringAvailable: true, packageCount: 1, storeName: 'Google Play' };
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
