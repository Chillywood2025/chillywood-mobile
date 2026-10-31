import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import React from "react";
import { createRoot } from "react-dom/client";
import * as singleFlight from "../../_lib/actionSingleFlight.mjs";
import { noop, container, deferred, textOf, load, wallet, purchase, page, mount } from "./purchases-mounted-fixture.mjs";

test("mounted wallet shows immutable price/terms and exact event destination, with cold-link recovery", async t => {
  const h = await mount(t);
  assert.match(h.text(), /\$2\.99/); assert.match(h.text(), /America\/New_York/); assert.match(h.text(), /Premium is separate/);
  assert.equal(h.ticketPolicies().length, 1); assert.equal(h.ticketPolicies()[0].eventId, "exact-event");
  assert.equal(h.ticketPolicies()[0].purchaseId, "one"); assert.equal(h.ticketPolicies()[0].initiallyExpanded, undefined);
  await h.press("purchase-open-one"); assert.equal(h.routes[0].pathname, "/event/[eventId]"); assert.equal(h.routes[0].params.eventId, "exact-event");
  await h.press("purchases-back"); assert.equal(h.routes[1], "/(tabs)/my-list");
});

test("mounted Stripe refund receipts show cumulative amount separately and preserve dispute precedence", async t => {
  const id = "55555555-5555-4555-8555-555555555555", creator = "66666666-6666-4666-8666-666666666666";
  let tip = purchase(id, "completed", { purchaseIntentId: null, sourceType: "creator_tip", sourceId: creator, creatorId: creator,
    productType: "creator_tip", productKey: null, title: "Tip", provider: "stripe_connect", destination: { kind: "creator_channel", id: creator },
    startsAt: null, amountMinor: 500, terms: {}, termsAvailable: false, refund: { state: "none", amountMinor: 0 } });
  const reader = async () => {
    const parsed = wallet.parseCreatorPurchasePage({ userId: "buyer", fetchedAt: "2026-10-27T03:00:00Z", items: [tip], nextCursor: null }, "buyer");
    return parsed ? { ...parsed, status: "resolved", subjectSessionGeneration: "one" }
      : page([], { status: "unavailable" });
  };
  const h = await mount(t, { reader });
  assert.match(textOf(h.node(`purchase-refund-${id}`)), /None.*\$0\.00 of \$5\.00/);
  for (const [status, refund, label, extent] of [
    ["completed", { state: "partial", amountMinor: 125 }, "Partially refunded", /Partial.*\$1\.25 of \$5\.00/],
    ["refunded", { state: "full", amountMinor: 500 }, "Fully refunded", /Full.*\$5\.00 of \$5\.00/],
    ["disputed", { state: "full", amountMinor: 500 }, "Disputed", /Full.*\$5\.00 of \$5\.00/],
  ]) {
    tip = { ...tip, status, refund }; await h.press("purchases-refresh");
    assert.ok(h.text().includes(label)); assert.match(textOf(h.node(`purchase-refund-${id}`)), extent);
    assert.match(h.text(), /Purchase price:\s+\$5\.00/); assert.match(h.text(), /No video, ticket, VIP, membership or other access/);
    if (status === "disputed") { assert.doesNotMatch(h.text(), /Fully refunded/); assert.equal(h.node(`purchase-open-${id}`), undefined); }
  }
  tip = { ...tip, status: "refunded" }; delete tip.refund;
  await h.press("purchases-refresh");
  assert.match(h.text(), /Refund reported/); assert.match(textOf(h.node(`purchase-refund-${id}`)), /amount unavailable/);
  assert.doesNotMatch(h.text(), /Fully refunded|Partially refunded/);
  tip = { ...tip, refund: { state: "full", amountMinor: 900 } }; await h.press("purchases-refresh");
  assert.ok(h.node("purchases-error")); assert.equal(h.node(`purchase-${id}`), undefined, "malformed RPC refund cannot leave a trusted receipt visible");
});

test("mounted receipt keeps purchased inclusions/schedule separate from reschedule and reads finite replay expiry", async t => {
  const originalStart = "2026-11-01T20:00:00Z", originalEnd = "2026-11-01T22:00:00Z";
  const currentStart = "2026-11-02T20:00:00Z", currentEnd = "2026-11-02T23:00:00Z", replayExpiry = "2026-11-08T22:00:00Z";
  const h = await mount(t, { items: [purchase("one", "upcoming", { startsAt: currentStart, endsAt: currentEnd, terms: {
    includeText: "Original concert and audience Q&A", description: "Mutable replacement text must not appear",
    startsAt: originalStart, endsAt: originalEnd, timeZone: "America/New_York", replayPolicy: "until_expiration",
    replayAvailableAt: originalEnd, replayExpiresAt: replayExpiry,
  } })] });
  const date = value => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  assert.match(h.text(), /Original concert and audience Q&A/); assert.doesNotMatch(h.text(), /Mutable replacement text/);
  assert.ok(textOf(h.node("purchase-original-start-one")).includes(date(originalStart)));
  assert.ok(textOf(h.node("purchase-original-end-one")).includes(date(originalEnd)));
  assert.ok(textOf(h.node("purchase-current-start-one")).includes(date(currentStart)));
  assert.ok(textOf(h.node("purchase-current-end-one")).includes(date(currentEnd)));
  assert.match(textOf(h.node("purchase-current-start-one")), /changed since purchase/);
  const replay = textOf(h.node("purchase-replay-terms-one"));
  assert.ok(replay.includes(date(replayExpiry))); assert.ok(replay.includes(date(originalEnd)));
  assert.match(replay, /Replay included from .* until .*purchase terms/); assert.doesNotMatch(replay, /until_expiration/);
});

test("receipt never fills in missing historical inclusion, schedule or replay expiry", async t => {
  const h = await mount(t, { items: [purchase("unknown", "active", { termsAvailable: false, terms: { includeText: "Unverified inclusion" } }),
    purchase("limited", "active", { terms: { startsAt: "2026-11-01T20:00:00Z", replayPolicy: "until_expiration" } })] });
  assert.match(h.text(), /Original detailed terms are unavailable/); assert.doesNotMatch(h.text(), /Unverified inclusion/);
  assert.match(textOf(h.node("purchase-replay-terms-limited")), /original expiry is unavailable/);
  assert.doesNotMatch(textOf(h.node("purchase-replay-terms-limited")), /Replay included until/);
  assert.equal(h.node("purchase-current-start-limited"), undefined, "identical current time is not falsely called a reschedule");
  assert.match(h.text(), /Original inclusion details are unavailable/);
});

test("mounted pending, unfulfilled and review purchases cannot navigate into another checkout", async t => {
  const h = await mount(t, { items: [purchase("pending", "pending"), purchase("paid", "paid_unfulfilled"), purchase("review", "reconciliation_required"), purchase("dispute", "disputed")] });
  for (const id of ["pending", "paid", "review", "dispute"]) { assert.equal(h.node(`purchase-open-${id}`), undefined); assert.ok(h.node(`purchase-support-${id}`)); }
  assert.match(h.text(), /Do not purchase this item again/);
  await h.press("purchase-support-paid"); assert.equal(h.routes[0], "/support");
});

test("mounted filters and pagination preserve exact historical rows and show empty/retry states", async t => {
  const first = page([purchase()], { nextCursor: { createdAt: "2026-10-26T16:30:00Z", id: "one" } });
  const h = await mount(t, { reader: async cursor => cursor ? page([purchase("tip", "completed", { sourceType: "creator_tip", title: null, destination: null })]) : first });
  await h.press("purchases-filter-Tips"); assert.ok(h.node("purchases-empty"));
  await h.press("purchases-load-more"); assert.ok(h.node("purchase-tip")); assert.equal(h.node("purchase-one"), undefined);
  h.setReader(async () => ({ ...page(), status: "unavailable", items: [] }));
  await h.press("purchases-refresh"); assert.ok(h.node("purchases-error")); assert.equal(h.node("purchase-tip"), undefined);
  h.setReader(async () => page([])); await h.press("purchases-refresh"); assert.ok(h.node("purchases-empty"));
});

test("mounted account-generation switch rejects late previous-session history and restore notice", async t => {
  const d = deferred(), restored = deferred(); let reads = 0;
  const h = await mount(t, { reader: async () => ++reads === 1 ? page() : d.promise, restore: () => restored.promise });
  await h.press("purchases-restore"); await h.press("purchases-refresh");
  await h.account(async () => page([], { subjectSessionGeneration: "two" }));
  await h.resolve(d, page([purchase("old", "active", { title: "Private old receipt" })]));
  await h.resolve(restored, { ok: true, message: "Previous session restored" });
  assert.doesNotMatch(h.text(), /Private old receipt|Previous session restored/); assert.equal(h.node("purchase-old"), undefined);
});

test("negative control proves pending-navigation protection is exercised", async t => {
  const source = fs.readFileSync("app/purchases.tsx", "utf8");
  const mutated = source.replace("!status.pending && item.destination", "item.destination"); assert.notEqual(source, mutated);
  const h = await mount(t, { source: mutated, items: [purchase("pending", "pending")] });
  assert.ok(h.node("purchase-open-pending"), "mutant reintroduces a route toward pending checkout");
});

async function mountTip(t, options = {}) {
  const nodes = new Map(), purchases = [], routes = [], external = [], listeners = new Set(), receiptReads = [], selections = [];
  let catalogReads = 0;
  let session = { user: { id: "buyer" }, authority: { sessionGeneration: "one" } };
  const host = name => function NativeHost(props) {
    const id = React.useId(); nodes.set(id, { type: name, props });
    React.useEffect(() => () => nodes.delete(id), [id]);
    return React.createElement(React.Fragment, null, ...React.Children.toArray(props.children).filter(child => typeof child === "object"));
  };
  const native = { Platform: { OS: options.platform ?? "android" }, Linking: { openURL: async url => external.push(url) },
    AppState: { addEventListener: (_event,listener) => { listeners.add(listener);return {remove:()=>listeners.delete(listener)}; } },
    Alert: { alert: noop }, StyleSheet: { create: x => x } };
  const iosCatalog = load("_lib/iosAppStoreCommerce.ts", {});
  const tipApi = load("_lib/creatorTips.ts", {
    "react-native": native, "./creatorSupportedPrices": {}, "./creatorMoneyStoreQuote": {}, "./supabase": {},
    "./creatorMoneyPurchaseAuthority": {}, "./revenuecat": {}, "./iosAppStoreCommerce": iosCatalog,
    "./paymentRailPolicy": {}, "./runtimeConfig": {}, "./entitlementAuthority": {},
    "./accountBoundSupabaseMutation": {}, "./accountSessionAuthority": {}, "./creatorTipCheckoutAttempt": {},
    "./creatorTipCustomQuote": {},
    "./iosExternalAdmission": {admitIosExternalCheckout:async()=>"11111111-1111-4111-8111-111111111111"},
 "./googlePlayExternalAdmission": {},
  });
  for (const name of ["ActivityIndicator", "KeyboardAvoidingView", "Modal", "Pressable", "ScrollView", "Text", "TextInput", "TouchableOpacity", "View"]) native[name] = host(name);
  const Screen = load("components/monetization/tip-sheet.tsx", {
    react: React, "react-native": native, "expo-router": { useRouter: () => ({ push: route => routes.push(route) }) },
    "../../_lib/session": { useSession: () => session }, "../../_lib/analytics": { trackEvent: noop },
    "../../_lib/actionSingleFlight.mjs": singleFlight,
    "../../_lib/iosExternalAdmission": {isIosExternalCheckoutSupported:()=>options.iosSupported===true},
    "../../_lib/openCreatorExternalCheckout": {openCreatorExternalCheckout:async(url,current)=>{if(current())await native.Linking.openURL(url);}},
    "../../_lib/google-play-external-content-links": {
      isGooglePlayExternalContentLinkSupported: () => options.nativeSupported === true,
      withGooglePlayExternalContentLink: async callback => {
        external.push({nativePrepare:true});
        try {
          if (options.nativePrepare) await options.nativePrepare();
          if (options.nativeDenied) throw new Error("Play denied");
          const checkout = await callback({google_play_external_transaction_token:"native-token",google_play_external_link_api_version:1});
          external.push({nativeLaunch:checkout.url});
        } finally { external.push({nativeCancel:true}); }
      },
    },
    "../../_lib/boundedVisibleReadGate": load("_lib/boundedVisibleReadGate.ts", {}),
    "../../_lib/iosAppStoreCommerce": iosCatalog,
    "../../_lib/revenuecat": { readRevenueCatNonSubscriptionProducts: async () => [] },
    "../../_lib/creatorSupportedPrices": { readCreatorSupportedPrices: async () => {
      catalogReads++;
      return options.reader ? options.reader() : options.unavailable
        ? { status: "unavailable", prices: [] } : { status: "resolved", subjectUserId: options.catalogBuyer ?? "buyer", prices: options.prices ?? [tipPrice()] };
    } },
    "../../_lib/creatorTips": { ...tipApi, readMyTipTransactionStatus: async id => {receiptReads.push(id);return {status:options.receiptStatus ?? 'pending'};}, createCreatorTipCheckout: async input => { external.push(input); return options.externalCheckout?options.externalCheckout(input):{checkoutCreated:true,tipId:'tip-synthetic',url:'https://checkout.stripe.com/c/pay/test'}; }, purchaseCreatorTipWithStore: async input => { purchases.push(input); return options.purchase ? options.purchase(input) : { ok: false, message: "Payment pending" }; } },
    "../../_lib/creatorMonetization": { formatMonetizationCurrency: amount => `$${(amount / 100).toFixed(2)}` },
    "../../_lib/creatorTipAmount": load("_lib/creatorTipAmount.ts", {}),
    "../../_lib/creatorTipCustomQuote": {
      readCreatorTipCustomQuote: async (creatorId,amountCents,capabilityId) => options.customQuote ? options.customQuote(creatorId,amountCents,capabilityId) : null,
      readCreatorTipCustomAvailability: async (creatorId,amountCents) => options.customAvailability ? options.customAvailability(creatorId,amountCents)
        : { quote: options.customQuote ? await options.customQuote(creatorId,amountCents) : null, message: "" },
    },
    "../../_lib/readCreatorTipRouteCosts": { readCreatorTipRouteCosts: async (...args) => options.routeCosts ? options.routeCosts(...args) : ({ status: "unavailable", message: "Provider fee comparison is not available yet." }) },
    "../../_lib/creatorTipPaymentAction": { selectLowestCostCreatorTipAction: async input => {
      selections.push(input); return options.selectLowest ? options.selectLowest(input) : { actionId: "selected-action", provider: "google_play", purchaseBindingId: "native-binding" };
    } },
    "./MoneyScopeInfoButton": { MoneyScopeInfoButton: host("MoneyScopeInfoButton") },
    "./money-ui": Object.fromEntries(["CreatorMoneyHeader", "MoneyScopeStrip", "MoneyStatusChip", "MoneySuccessReceipt"].map(name => [name, host(name)])),
    "../ui/chillywood-visual-system": { CHILLYWOOD_VISUAL: {}, ChillywoodPrimaryActionFill: host("Fill") },
  }).TipSheet;
  const props = { visible: true, creatorId: "creator", creatorName: "Artist", sourceSurface: "test", onClose: noop, tipStatus: { creatorId: "creator", canTip: true, currency: "usd", minAmountCents: 99, maxAmountCents: 999, suggestedAmountsCents: [100, 300], ...options.tipStatus } };
  const root = createRoot(container()); await React.act(async () => root.render(React.createElement(Screen, props)));
  t.after(() => React.act(async () => root.unmount()));
  return { purchases, routes, external, receiptReads, selections, nodes, node: id => [...nodes.values()].find(node => node.props.testID === id),
    async foreground() { await React.act(async()=>{for(const listener of listeners)listener('active');}); },
    catalogReads: () => catalogReads,
    async render(changes = {}) { Object.assign(props, changes); await React.act(async () => root.render(React.createElement(Screen, { ...props }))); },
    async refreshCatalog() { const node = [...nodes.values()].find(node => node.props.accessibilityLabel === "Refresh supported tip amounts"); assert.ok(node); await React.act(async () => node.props.onPress()); },
    async press(id) { const node = [...nodes.values()].find(node => node.props.testID === id); assert.ok(node && !node.props.disabled); await React.act(async () => { void node.props.onPress(); }); },
    async switchSession() { session = { ...session, authority: { sessionGeneration: "two" } }; await React.act(async () => root.render(React.createElement(Screen, props))); },
    async typeAmount(value) { const node = [...nodes.values()].find(node => node.props.testID === "tip-custom-amount"); await React.act(async () => node.props.onChangeText(value)); },
    async resolve(d, value) { await React.act(async () => d.resolve(value)); },
  };
}

function tipPrice(overrides = {}) {
  return { amountMinor: 99, providerProductId: "cw_creator_tip_sandbox_099", productKey: "creator_tip_sandbox_099",
    provider: "revenuecat_google_play", platform: "android", environment: "sandbox", currency: "usd", status: "sandbox", ...overrides };
}

test("tip cost comparison is read-only and discards stale amount/session responses", async t => {
  const old=deferred(), calls=[];
  const h=await mountTip(t,{routeCosts:async(...args)=>{calls.push(args);return calls.length===1?old.promise:{message:'Current comparison unavailable'};}});
  assert.equal(h.purchases.length,0);assert.equal(h.external.length,0);
  await h.typeAmount('2.37');
  await h.resolve(old,{status:'compared',message:'STALE lowest fee'});
  assert.doesNotMatch(textOf(h.node('tip-route-cost-status')),/STALE/);
  assert.equal(calls.at(-1)[1],237);assert.deepEqual(calls.at(-1)[2],[]);
  await h.switchSession();
  assert.equal(h.purchases.length,0);assert.equal(h.external.length,0);
});

test("tip fee comparison expires without dispatching or switching rails", async t => {
  const h=await mountTip(t,{routeCosts:async()=>({status:'compared',message:'Verified synthetic comparison',expiresAt:new Date(Date.now()+30).toISOString()})});
  await React.act(async()=>new Promise(resolve=>setTimeout(resolve,60)));
  assert.match(textOf(h.node('tip-route-cost-status')),/expired/);
  assert.equal(h.purchases.length,0);assert.equal(h.external.length,0);
});

const qualifiedCosts=async()=>({status:'compared',message:'Synthetic qualified comparison',expiresAt:new Date(Date.now()+30000).toISOString()});
test("explicit lowest-fee action dispatches only the selected exact native route and never falls back",async t=>{
  const h=await mountTip(t,{prices:[tipPrice({priceKey:'native-binding'})],routeCosts:qualifiedCosts});
  await h.press('tip-lowest-cost-checkout');
  assert.equal(h.selections.length,1);assert.equal(h.selections[0].amountCents,99);
  assert.equal(h.purchases.length,1);assert.equal(h.purchases[0].selectedActionId,'selected-action');assert.equal(h.purchases[0].amountCents,99);
  assert.equal(h.external.length,0);
});
test("selected Stripe route preserves exact amount and action binding with no native retry",async t=>{
  const h=await mountTip(t,{nativeSupported:true,routeCosts:qualifiedCosts,
    selectLowest:async()=>({actionId:'selected-action',provider:'stripe_connect',purchaseBindingId:'capability'})});
  await h.typeAmount('2.37');await h.press('tip-lowest-cost-checkout');
  const checkout=h.external.find(x=>x?.amountCents);
  assert.equal(checkout.amountCents,237);assert.equal(checkout.selectedActionId,'selected-action');assert.equal(checkout.capabilityId,'capability');
  assert.equal(h.purchases.length,0);
});
test('web lowest-cost action quotes the older selected capability rather than reselecting newest',async t=>{
 const reads=[];
 const h=await mountTip(t,{platform:'web',routeCosts:qualifiedCosts,
  customQuote:async(creatorId,amountCents,capabilityId)=>{reads.push(capabilityId);return {creatorId,amountCents,capabilityId:capabilityId??'newer-expensive'};},
  selectLowest:async()=>({actionId:'selected-action',provider:'stripe_connect',purchaseBindingId:'older-cheaper'})});
 await h.typeAmount('2.37');await h.press('tip-lowest-cost-checkout');
 const checkout=h.external.find(x=>x?.amountCents);
 assert.equal(checkout.capabilityId,'older-cheaper');assert.equal(checkout.selectedActionId,'selected-action');
 assert.equal(reads.at(-1),'older-cheaper');assert.equal(h.purchases.length,0);
});
test("selection uncertainty and close/reopen suppress dispatch; repeated taps remain single flight",async t=>{
  const pending=deferred();
  const h=await mountTip(t,{prices:[tipPrice({priceKey:'native-binding'})],routeCosts:qualifiedCosts,selectLowest:()=>pending.promise});
  const button=h.node('tip-lowest-cost-checkout');
  await React.act(async()=>{void button.props.onPress();void button.props.onPress();});
  assert.equal(h.selections.length,1);
  await h.render({visible:false});await h.render({visible:true});
  await h.resolve(pending,{actionId:'selected-action',provider:'google_play',purchaseBindingId:'native-binding'});
  assert.equal(h.purchases.length,0);assert.equal(h.external.length,0);
  const denied=await mountTip(t,{routeCosts:qualifiedCosts,selectLowest:async()=>{throw new Error('unknown transport');}});
  await denied.press('tip-lowest-cost-checkout');assert.equal(denied.purchases.length,0);assert.equal(denied.external.length,0);
});

test("Android custom tip preserves buyer cents and uses native eligibility/disclosure with no browser fallback", async t => {
  const h=await mountTip(t,{nativeSupported:true});
  await h.typeAmount("2.37");await h.press("tip-custom-stripe-checkout");
  const input=h.external.find(x=>x?.amountCents);
  assert.equal(input.amountCents,237);assert.equal(input.googlePlay.google_play_external_transaction_token,"native-token");
  assert.equal(h.external.filter(x=>x?.nativeLaunch).length,1);
  assert.equal(h.external.filter(x=>typeof x==="string").length,0);
  assert.equal(h.purchases.length,0);
  const denied=await mountTip(t,{nativeSupported:true,nativeDenied:true});
  await denied.typeAmount("0.51");await denied.press("tip-custom-stripe-checkout");
  assert.equal(denied.external.filter(x=>x?.amountCents||x?.nativeLaunch||typeof x==="string").length,0);
  const old=await mountTip(t);await old.typeAmount("2.37");
  assert.equal(old.node("tip-custom-stripe-checkout"),undefined);
});

test("closing and reopening tip sheet or switching account suppresses late native checkout launch",async t=>{
 for(const action of ["close","switch"]) {
  const d=deferred(),h=await mountTip(t,{nativeSupported:true,externalCheckout:()=>d.promise});
  await h.typeAmount("2.37");await h.press("tip-custom-stripe-checkout");
  if(action==="close"){await h.render({visible:false});await h.render({visible:true});}else await h.switchSession();
  await h.resolve(d,{checkoutCreated:true,tipId:"tip-synthetic",url:"https://checkout.stripe.com/c/pay/test"});
  assert.equal(h.external.filter(x=>x?.nativeLaunch||typeof x==="string").length,0,action);
  assert.equal(h.external.filter(x=>x?.nativeCancel).length,1,action);
 }
});

test("mounted tip catalog reads are bounded across rerenders and reopen, with explicit retry and stale-result cleanup", async t => {
  const h = await mountTip(t);
  assert.equal(h.catalogReads(), 1);
  for (let i = 0; i < 25; i++) await h.render({ creatorName: `Artist ${i}` });
  assert.equal(h.catalogReads(), 1, "presentation rerenders must not repeat catalog reads");
  await h.press("tip-confirm-button");
  assert.equal(h.catalogReads(), 1, "checkout status rerenders must not repeat catalog reads");
  await h.render({ visible: false });
  assert.equal(h.catalogReads(), 1, "closing must not read a catalog");
  await h.render({ visible: true });
  assert.equal(h.catalogReads(), 2, "reopening refreshes the catalog once");
  await h.switchSession();
  assert.equal(h.catalogReads(), 3, "a replacement session gets its own catalog read");

  const pending = deferred(); let calls = 0;
  const delayed = await mountTip(t, { reader: () => ++calls === 1 ? pending.promise : { status: "resolved", subjectUserId: "buyer", prices: [] } });
  await delayed.render({ visible: false });
  await delayed.render({ visible: true });
  await delayed.resolve(pending, { status: "resolved", subjectUserId: "buyer", prices: [tipPrice()] });
  assert.equal(delayed.node("tip-amount-option"), undefined, "closed opening's late catalog cannot overwrite the new empty catalog");
  assert.equal(delayed.catalogReads(), 2);
  await delayed.refreshCatalog();
  assert.equal(delayed.catalogReads(), 3, "explicit retry performs one new catalog read");
});

test("mounted tip chooser exposes supported store amount and rejects unavailable catalog", async t => {
  const h = await mountTip(t);
  const amountNodes = [...h.nodes.values()].filter(node => node.props.testID === "tip-amount-option");
  assert.equal(amountNodes.length, 1); assert.match(amountNodes[0].props.accessibilityLabel, /0\.99/);
  assert.equal(amountNodes[0].props.accessibilityState.selected, true);
  assert.equal(h.node("tip-custom-amount").props.accessibilityLabel, "Custom tip amount in USD");
  assert.ok(![...h.nodes.values()].some(node => node.props.accessibilityLabel === "Private note for creator"), "unsupported store note must not silently discard buyer text");
  await h.press("tip-confirm-button"); assert.equal(h.purchases[0].amountCents, 99);
  const denied = await mountTip(t, { unavailable: true }); assert.equal(denied.node("tip-confirm-button").props.disabled, true); assert.equal(denied.purchases.length, 0);
});

test("iOS tip catalog excluding default99 visibly and accessibly selects actual299 option", async t => {
  const h = await mountTip(t, { platform: "ios", prices: [tipPrice({ amountMinor: 299, providerProductId: "com.chillywood.tip.tier2", platform: "ios", provider: "revenuecat_app_store" })] });
  assert.equal(h.node("tip-amount-option").props.accessibilityState.selected, true);
  assert.match(h.node("tip-amount-option").props.accessibilityLabel, /2\.99/);
  await h.press("tip-confirm-button"); assert.equal(h.purchases[0].amountCents, 299); assert.equal(h.purchases[0].iosStoreProductKey, "tip_tier_2");
});

test("buyer-entered amounts stay exact: no rounding, wrong SKU or alternate provider fallback", async t => {
  const h = await mountTip(t);
  for (const text of ["2.37", "0.999", "1e2", "", "-0.99", "90071992547409.92"]) {
    await h.typeAmount(text);
    assert.equal(h.node("tip-custom-amount").props.value, text);
    assert.equal(h.node("tip-confirm-button").props.disabled, true);
    assert.ok(h.node("tip-custom-amount-unavailable"));
  }
  assert.equal(h.purchases.length, 0);
  await h.typeAmount("0.99");
  assert.equal(h.node("tip-confirm-button").props.disabled, false);
  await h.press("tip-confirm-button");
  assert.equal(h.purchases[0].amountCents, 99);
  await h.typeAmount("2.37");
  await h.press("tip-amount-option");
  assert.equal(h.node("tip-custom-amount").props.value, "0.99");
  assert.equal(h.node("tip-custom-amount-unavailable"), undefined);
});

test("typed iOS exact amount selects its own SKU and does not retain the preset SKU", async t => {
  const h = await mountTip(t, { platform: "ios", prices: [99, 299].map((amountMinor, i) => tipPrice({
    amountMinor, providerProductId: `com.chillywood.tip.tier${i + 1}`, platform: "ios", provider: "revenuecat_app_store",
  })) });
  await h.typeAmount("2.99"); await h.press("tip-confirm-button");
  assert.equal(h.purchases[0].amountCents, 299);
  assert.equal(h.purchases[0].iosStoreProductKey, "tip_tier_2");
  await h.typeAmount("2.98");
  assert.equal(h.node("tip-confirm-button").props.disabled, true);
  await h.switchSession();
  assert.notEqual(h.node("tip-custom-amount").props.value, "2.98");
});

test("eligible custom amount requires explicit Stripe action and fresh exact capability; never substitutes a SKU", async t => {
  let available=true;
  const h=await mountTip(t,{platform:'ios',iosSupported:true,externalCheckout:async()=>{if(!available)throw Error('route retired');return {checkoutCreated:true,tipId:'tip-synthetic',url:'https://checkout.stripe.com/c/pay/test'};},tipStatus:{minAmountCents:100},customQuote:async(creatorId,amountCents)=>available?{
    creatorId,amountCents,capabilityId:'ef000000-0000-4000-8000-000000000001',platform:'ios',currency:'usd',environment:'test',minAmountMinor:50,maxAmountMinor:100000,
  }:null});
  await h.typeAmount('0.51');
  assert.equal(h.node('tip-confirm-button').props.disabled,true,'store SKU must not be used for arbitrary amount');
  assert.ok(h.node('tip-custom-stripe-checkout'));assert.equal(h.external.length,0);
  await h.press('tip-custom-stripe-checkout');
  assert.equal(h.purchases.length,0);assert.equal(h.external[0].amountCents,51);
  assert.equal(h.external[0].iosExternal,true,'client helper must freshly admit the storefront before quoting');
  assert.equal(h.external[1],'https://checkout.stripe.com/c/pay/test');
  await h.foreground();assert.deepEqual(h.receiptReads,['tip-synthetic']);
  assert.match(h.node('tip-success-receipt').props.body,/not confirmed yet/,'browser return is not payment confirmation');
  available=false;await h.press('tip-custom-stripe-checkout');
  assert.equal(h.external.filter(value=>typeof value==='string').length,1,'retired route cannot open another checkout');
  await h.switchSession();await h.foreground();assert.equal(h.receiptReads.length,1,'old-session receipt is not refreshed in a replacement session');
});

test("verified provider minimum is visible without changing the buyer-entered amount", async t => {
  const h=await mountTip(t,{customAvailability:async()=>({quote:null,message:'Minimum for this verified payment route: $0.50 USD. Your amount has not been changed.'})});
  await h.typeAmount('0.49');
  assert.equal(h.node('tip-custom-amount').props.value,'0.49');
  assert.match(h.node('tip-custom-amount-unavailable').props.children,/\$0\.50 USD/);
  assert.equal(h.node('tip-confirm-button').props.disabled,true);
  assert.equal(h.node('tip-custom-stripe-checkout'),undefined);
  assert.equal(h.purchases.length,0);assert.equal(h.external.length,0);
});

test("mounted tip chooser does not advertise unmapped amounts or another buyer's catalog", async t => {
  for (const prices of [[tipPrice({ amountMinor: 0 })], [tipPrice({ providerProductId: "" })], [tipPrice({ environment: "production" })]]) {
    const h = await mountTip(t, { prices });
    assert.equal(h.node("tip-amount-option"), undefined);
    assert.equal(h.node("tip-confirm-button").props.disabled, true);
  }
  const h = await mountTip(t, { catalogBuyer: "previous-buyer" });
  assert.equal(h.node("tip-confirm-button").props.disabled, true);
  const bounds = await mountTip(t, { tipStatus: { minAmountCents: 100 } });
  assert.equal(bounds.node("tip-amount-option"), undefined, "Android99 must not appear selectable below creator minimum");
  assert.equal(bounds.node("tip-confirm-button").props.disabled, true);
  const staleCreator = await mountTip(t, { tipStatus: { creatorId: "old-creator" } });
  assert.equal(staleCreator.node("tip-confirm-button").props.disabled, true);
});

test("mounted native tip chooser exposes a fresh qualified additional Android amount without forcing99",async t=>{
 const h=await mountTip(t,{prices:[tipPrice({amountMinor:237,providerProductId:'qualified_tip_237',productKey:'qualified_tip_237'})]});
 assert.equal(h.node('tip-confirm-button').props.disabled,false);await h.press('tip-confirm-button');assert.equal(h.purchases[0].amountCents,237);assert.equal(h.external.length,0);
});

test("mounted tip result cannot display on a replaced account session", async t => {
  const d = deferred(); const h = await mountTip(t, { purchase: () => d.promise });
  await h.press("tip-confirm-button"); await h.switchSession();
  await h.resolve(d, { ok: true, message: "Old private tip receipt" });
  assert.equal(h.node("tip-success-receipt"), undefined);
});

test("mounted tip checkout fallback requires verified status and never promises access or creator credit", async t => {
  const h = await mountTip(t, { purchase: async () => ({ ok: true }) });
  await h.press("tip-confirm-button");
  const receipt = h.node("tip-success-receipt");
  assert.equal(receipt.props.title, "Tip status");
  assert.match(receipt.props.body, /Store checkout returned/u);
  assert.match(receipt.props.body, /Check Purchases & My Tickets for verified tip status/u);
  assert.match(receipt.props.body, /No access is included/u);
  assert.doesNotMatch(receipt.props.body, /tip sent|payment confirmed|creator credited|access unlocked/iu);
  assert.equal(h.purchases.length, 1);
  assert.deepEqual(h.routes, []);
});

test("mounted Stripe tip receipt remounts on session replacement and exposes refund/dispute states", async t => {
  const nodes = new Map(), events = [], old = deferred(), current = deferred(); let reads = 0;
  let session = { user: { id: "buyer" }, authority: { sessionGeneration: "one" } };
  const host = name => function Host(props) {
    const id = React.useId(); nodes.set(id, { type: name, props }); React.useEffect(() => () => nodes.delete(id), [id]);
    return React.createElement(React.Fragment, null, ...React.Children.toArray(props.children).filter(child => typeof child === "object"));
  };
  const native = { StyleSheet: { create: value => value } };
  for (const name of ["ActivityIndicator", "Text", "TouchableOpacity", "View"]) native[name] = host(name);
  const Screen = load("app/tip-status.tsx", {
    react: React, "react-native": native, "expo-router": { useLocalSearchParams: () => ({ tip_id: "receipt" }), useRouter: () => ({ canGoBack: () => false, back: noop, replace: noop, push: noop }) },
    "../_lib/session": { useSession: () => session }, "../_lib/analytics": { trackEvent: (...args) => events.push(args) },
    "../_lib/creatorMonetization": { formatMonetizationCurrency: amount => `$${(amount / 100).toFixed(2)}` },
    "../_lib/creatorTips": { readMyTipTransactionStatus: async () => ++reads === 1 ? old.promise : reads === 2 ? current.promise : { status: "disputed", amountCents: 300 } },
    "../components/ui/chillywood-visual-system": { CHILLYWOOD_VISUAL: {}, ChillywoodPrimaryActionFill: host("Fill") },
  }).default;
  const root = createRoot(container()); await React.act(async () => root.render(React.createElement(Screen)));
  t.after(() => React.act(async () => root.unmount()));
  session = { ...session, authority: { sessionGeneration: "two" } }; await React.act(async () => root.render(React.createElement(Screen)));
  await React.act(async () => old.resolve({ status: "paid", creatorId: "old", amountCents: 999 }));
  assert.equal(events.length, 0); assert.doesNotMatch([...nodes.values()].map(textOf).join(" "), /9\.99/);
  await React.act(async () => current.resolve({ status: "refunded", creatorId: "current", amountCents: 300 }));
  assert.match([...nodes.values()].map(textOf).join(" "), /Tip refunded/);
  session = { ...session, authority: { sessionGeneration: "three" } }; await React.act(async () => root.render(React.createElement(Screen)));
  assert.match([...nodes.values()].map(textOf).join(" "), /Tip under review/);
});
