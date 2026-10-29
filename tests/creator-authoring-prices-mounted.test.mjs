import assert from 'node:assert/strict';
import test from 'node:test';
import { mount, productionFunctions, deferred, React, video } from './platform-studio-mounted-harness.mjs';

// Production screen + hook + picker + authoring helper. Native rendering and
// the remote catalog/RPC boundary are controlled; this is not store/device QA.
const price = amount => ({ priceKey: `catalog-${amount}`, productKey: `product-${amount}`, amountMinor: amount, currency: 'usd', label: `$${(amount / 100).toFixed(2)}`, provider: 'revenuecat_app_store', providerProductId: `store-${amount}`, platform: 'ios', environment: 'sandbox', status: 'sandbox', providerVerified: false, availablePlatforms: amount === 99 ? ['ios', 'android'] : ['ios'], availabilityLabel: amount === 99 ? 'iOS and Android' : 'iOS only' });
const catalog = async () => ({ status: 'resolved', subjectUserId: 'owner', prices: [price(99), price(299), price(499), price(999)] });
const node = (h, id) => h.find(n => n.props.testID === id);

test('mounted video price choice survives rejection, requires exact readback, and never resets to 99', async t => {
  let result = 'reject', saved = false; const writes = [];
  const helper = productionFunctions('_lib/creatorPaidVideos.ts', ['toText', 'savePaidVideoOffer'], {
    runCurrentAccountBoundSupabaseMutationRpc: async (name, payload) => {
      writes.push({ name, payload });
      if (result === 'reject') return { data: null, error: Error('synthetic failure') };
      saved = true; return { data: { status: 'saved', id: 'offer-B' }, error: null };
    },
  });
  const h = await mount(t, { route: { tab: 'monetization', manage: 'paid_videos' }, overrides: {
    readCreatorAuthoringPrices: catalog, savePaidVideoOffer: helper.savePaidVideoOffer,
    listMyPaidVideoOffers: async () => saved ? [{ id: 'offer-B', videoId: 'B', creatorId: 'owner', isPaid: true, priceCents: result === 'wrong' ? 99 : 299, currency: 'usd', status: 'sandbox' }] : [],
    saveCreatorSandboxMonetizationConfig: () => assert.fail('fixed-tier bookkeeping cannot overwrite chosen price'),
  } });
  await h.press(h.button('Manage paid unlock for Title B')); await h.press(h.button('Paid'));
  assert.equal(h.button('Save video access').props.disabled, true);
  await h.press(node(h, 'paid-video-price-catalog-299'));
  assert.match(h.text(), /iOS only/);
  await h.press(h.button('Save video access'));
  assert.equal(node(h, 'paid-video-price-catalog-299').props.accessibilityState.checked, true);
  assert.doesNotMatch(h.text(), /setup saved at/);
  result = 'wrong'; await h.press(h.button('Save video access'));
  assert.match(h.text(), /could not be confirmed/);
  assert.equal(node(h, 'paid-video-price-catalog-299').props.accessibilityState.checked, true);
  result = 'valid'; await h.press(h.button('Save video access'));
  assert.match(h.text(), /setup saved at \$2\.99/);
  assert.equal(writes.length, 3);
  for (const write of writes) { assert.equal(write.name, 'set_creator_content_price'); assert.equal(write.payload.p_price_cents, 299); assert.equal(write.payload.p_content_id, 'B'); }
});

for (const mode of [
  { source: 'vip_pass', manage: 'vip_passes', file: '_lib/creatorVipPasses.ts', save: 'saveCreatorVipPassOffer', list: 'listMyCreatorVipPassOffers', prefix: 'vip-pass-price', button: 'money-manager-vip-pass-enable-button', pause: 'money-manager-vip-pass-pause-button', rpc: 'set_creator_vip_pass_offer_at_price' },
  { source: 'channel_subscription', manage: 'channel_subscriptions', file: '_lib/channelSubscriptions.ts', save: 'saveChannelSubscriptionOffer', list: 'listMyChannelSubscriptionOffers', prefix: 'channel-subscription-price', button: 'money-manager-channel-subscription-enable-button', pause: 'money-manager-channel-subscription-pause-button', rpc: 'set_creator_channel_subscription_offer_at_price' },
]) test(`mounted ${mode.source} uses selected catalog UUID, rejects mismatches, pauses without catalog`, async t => {
  let available = true, mismatched = true; const writes = [];
  const helper = productionFunctions(mode.file, ['toText', 'toCents', 'normalizeOfferStatus', 'parseOffer', mode.save], {
    resolveRevenueCatProvider: () => 'revenuecat_app_store',
    runCurrentAccountBoundSupabaseMutationRpc: async (name, payload) => {
      writes.push({ name, payload });
      return { data: { id: 'membership-offer', creatorId: 'owner', priceCents: mismatched ? 99 : 999, currency: 'usd', status: name === 'pause_creator_offer' ? 'paused' : 'sandbox', title: 'Membership' }, error: null };
    },
  });
  const h = await mount(t, { route: { tab: 'monetization', manage: mode.manage }, overrides: {
    readCreatorAuthoringPrices: async () => available ? catalog() : ({ status: 'unavailable', subjectUserId: 'owner', prices: [] }),
    [mode.save]: helper[mode.save], [mode.list]: async () => [],
    saveCreatorSandboxMonetizationConfig: () => assert.fail('no fixed-tier setup write'),
  } });
  assert.equal(node(h, mode.button).props.disabled, true);
  await h.press(node(h, `${mode.prefix}-catalog-999`)); await h.press(node(h, mode.button));
  assert.doesNotMatch(h.text(), /saved at \$9\.99/);
  assert.equal(node(h, `${mode.prefix}-catalog-999`).props.accessibilityState.checked, true);
  mismatched = false; await h.press(node(h, mode.button));
  assert.match(h.text(), /saved at \$9\.99/);
  for (const write of writes) { assert.equal(write.name, mode.rpc); assert.equal(write.payload.p_price_id, 'catalog-999'); }
  available = false; await h.press(node(h, `${mode.prefix}-refresh`));
  assert.equal(node(h, mode.button).props.disabled, true);
  await h.press(node(h, mode.pause));
  assert.equal(writes.at(-1).name, 'pause_creator_offer');
  assert.equal(writes.at(-1).payload.p_source_type, mode.source); assert.equal(writes.at(-1).payload.p_offer_id, 'membership-offer');
  assert.match(h.text(), /paused/);
});

test('mounted creator price catalog rejects retired account results and old save callbacks', async t => {
  const pending = deferred(); let reads = 0, writes = 0;
  const h = await mount(t, { route: { tab: 'monetization', manage: 'vip_passes' }, overrides: {
    readCreatorAuthoringPrices: async () => ++reads === 1 ? catalog() : pending.promise,
    saveCreatorVipPassOffer: async () => { writes++; return {}; },
  } });
  await h.press(node(h, 'vip-pass-price-catalog-499'));
  const oldSave = node(h, 'money-manager-vip-pass-enable-button').props.onPress;
  await h.account({ user: { id: 'next' }, isSignedIn: true, isLoading: false, authority: { userId: 'next', accountId: 'next', sessionGeneration: 'replacement', state: 'ACTIVE', restoreOnly: false }, authorityStatus: 'active' });
  await React.act(async () => { oldSave(); });
  assert.equal(writes, 0);
  await h.resolve(pending, { status: 'resolved', subjectUserId: 'owner', prices: [price(499)] });
  assert.equal(node(h, 'money-manager-vip-pass-enable-button').props.disabled, true);
  assert.equal(node(h, 'vip-pass-price-catalog-499'), undefined);
});

for (const configured of [false, true]) test(`sandbox setup preserves chosen prices and never manufactures paid offers, configured=${configured}`, async () => {
  let state; const notices = []; const existing = configured ? [{ status: 'sandbox', priceCents: 999, videoId: 'A', isPaid: true, partyId: 'room-A' }] : [];
  const forbidden = () => assert.fail('bulk setup must never write a creator price or offer');
  const api = productionFunctions('app/channel-settings.tsx', ['handleSetupSandboxTesterExperience'], {
    useCallback: f => f, user: { id: 'owner' }, sandboxSetupBusy: false, creatorTipSettings: null,
    creatorVideos: [video('A')], creatorPaidVideoOffers: existing, creatorPaidWatchPartyOffers: existing,
    creatorPaidEventOffers: existing, creatorChannelSubscriptionOffers: existing, creatorVipPassOffers: existing,
    hasPlayableCreatorVideoSource: () => true, storeProviderName: 'Platform',
    saveCreatorTipSandboxSetupConfig: async () => {}, saveMyCreatorTipSettings: async () => ({}), refreshSandboxTesterExperience: async () => {},
    savePaidVideoOffer: forbidden, savePaidWatchPartyOffer: forbidden, savePaidCreatorEventOffer: forbidden,
    saveCreatorVipPassOffer: forbidden, saveChannelSubscriptionOffer: forbidden, saveCreatorSandboxMonetizationConfig: forbidden,
    setSandboxSetupBusy: () => {}, setSandboxSetupState: value => { state = value; }, setSandboxSetupNotice: value => notices.push(value),
    setTimeout: () => 1, clearTimeout: () => {}, SANDBOX_SETUP_TIMEOUT_ERROR: 'timeout', SANDBOX_SETUP_TIMEOUT_MS: 1000,
  });
  await api.handleSetupSandboxTesterExperience();
  assert.equal(state, configured ? 'complete' : 'partial');
  assert.match(notices.at(-1), configured ? /offers are ready/ : /Choose an available price/);
  if (configured) assert.equal(existing[0].priceCents, 999);
});
