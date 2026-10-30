import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import * as singleFlight from "../_lib/actionSingleFlight.mjs";
import { eventContract } from "./fixtures/event-purchase-contract.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const textOf = node => Array.isArray(node) ? node.map(textOf).join(" ") : node == null || typeof node === "boolean" ? "" : typeof node !== "object" ? String(node) : textOf(node.props?.children);
const load = (file, imports = {}, source = fs.readFileSync(file, "utf8")) => {
  const context = { exports: {}, Date, Intl, Promise, require: name => { assert.ok(name in imports, `unexpected import ${name}`); return imports[name]; } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, context);
  return context.exports;
};
const presentation = load("_lib/customerExperiencePresentation.ts");
const schedule = load("_lib/eventSchedule.ts");
const eventId = "33333333-3333-4333-8333-333333333333";
const offer = { title: "Sunday show", priceCents: 99, currency: "usd", status: "sandbox", ...eventContract(eventId,eventId) };
const locked = { allowed: false, requiresPurchase: true, reason: "event_pass_required", offer };
const owned = { allowed: true, requiresPurchase: false, reason: "event_pass_confirmed", passId: "pass-old", offer };

async function mount(t, options = {}) {
  const nodes = new Map(), routes = [];
  let access = options.access ?? locked, purchase = options.purchase ?? (async () => ({ ok: false, access: locked, message: "Pending" })), authCallback;
  const host = name => function NativeHost(props) {
    const id = React.useId(); nodes.set(id, { type: name, props });
    React.useEffect(() => () => nodes.delete(id), [id]);
    return React.createElement(React.Fragment, null, ...React.Children.toArray(props.children).filter(child => typeof child === "object"));
  };
  const native = { Platform: { OS: options.platform ?? "android" }, Alert: { alert: noop }, AppState: { addEventListener: () => ({ remove: noop }) }, StyleSheet: { create: x => x } };
  for (const name of ["ActivityIndicator", "Pressable", "RefreshControl", "ScrollView", "Text", "View"]) native[name] = host(name);
  const event = { id: eventId, event_title: "Sunday show", status: "scheduled", starts_at: "2026-11-02T01:00:00Z", visibility: "public", ...options.event };
  const supabase = { auth: { onAuthStateChange: callback => { authCallback = callback; return { data: { subscription: { unsubscribe: noop } } }; } }, from: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: event, error: null }) }; return query;
  } };
  const entryApi = load("_lib/creatorEventJourney.ts", {
    "./supabase": { supabase: { rpc: async () => ({ data: options.entry ?? {allowed:false,reason:'waiting_for_host'},error:null }) } },
    "./entitlementAuthority": {withAuthorityReadDeadline: async p=>p}, "./accountBoundSupabaseMutation": {}, "./liveEvents": {},
  });
  const Screen = load("app/event/[eventId].tsx", {
    react: React, "react-native": native, "react-native-safe-area-context": { SafeAreaView: host("SafeAreaView") },
    "expo-router": { useLocalSearchParams: () => ({ eventId }), useRouter: () => ({ canGoBack: () => false, back: () => routes.push("back"), replace: x => routes.push(x), push: x => routes.push(x) }) },
    "../../_lib/paidCreatorEvents": { resolvePaidCreatorEventPassAccess: async () => access, purchasePaidCreatorEventPass: input => purchase(input), formatPaidCreatorEventPrice: () => "$0.99" },
    "../../_lib/moderation": {}, "../../_lib/actionSingleFlight.mjs": singleFlight,
    "../../_lib/creatorEventJourney": entryApi,
    "../../_lib/entitlementAuthority": {withAuthorityReadDeadline: async p=>p},
    "../../_lib/creatorPurchases": {readMyCreatorPurchases:async()=>({status:'resolved',items:options.purchases??[]})},
    "../../_lib/notifications": {
      readEventReminderEnrollment:async()=>options.reminder??null,
      setEventReminderEnrollment:async(...args)=>options.setReminder?.(...args)??{status:'completed',message:'Reminder saved'},
    },
    "../../_lib/customerExperiencePresentation": presentation, "../../_lib/eventSchedule": schedule,
    "../../_lib/supabase": { supabase }, "../../components/monetization/MoneyScopeInfoButton": { MoneyScopeInfoButton: host("MoneyScopeInfoButton") },
    "../../components/monetization/money-ui": Object.fromEntries(["MoneyOfferCard", "MoneyScopeStrip", "MoneyStatusChip", "MoneySuccessReceipt"].map(name => [name, host(name)])),
    "../../components/safety/report-sheet": { ReportSheet: () => null },
    "../../components/monetization/event-ticket-policy": { EventTicketPolicy: host("EventTicketPolicy") },
    "../../components/monetization/event-auction-panel": { EventAuctionPanel: host("EventAuctionPanel") },
  }, options.source).default;
  const root = createRoot(container()); await React.act(async () => root.render(React.createElement(Screen)));
  t.after(() => React.act(async () => root.unmount()));
  return { routes, ticketPolicies: () => [...nodes.values()].filter(node => node.type === "EventTicketPolicy").map(node => node.props), node: id => [...nodes.values()].find(node => node.props.testID === id),
    text: () => [...nodes.values()].map(textOf).join(" "),
    async press(id) { const node = [...nodes.values()].find(node => node.props.testID === id); assert.ok(node, id); await React.act(async () => { void node.props.onPress(); }); },
    async account(next) { access = next; await React.act(async () => authCallback()); },
    async resolve(d, value) { await React.act(async () => d.resolve(value)); },
  };
}

test("mounted event shows sold-out state and cold deep-link Back recovers to home", async t => {
  const h = await mount(t, { access: { allowed: false, requiresPurchase: false, reason: "sold_out", offer: null } });
  assert.match(h.text(), /Event Passes are sold out/);
  assert.equal(h.node("event-pass-purchase-button"), undefined);
  await h.press("event-back-button");
  assert.deepEqual(h.routes, ["/(tabs)"]);
});

test("rescheduled sold-out events remain sold out rather than promising access confirmation", async t => {
  const h=await mount(t,{event:{status:'rescheduled'},access:{allowed:false,requiresPurchase:false,reason:'sold_out',offer:null}});
  assert.match(h.text(),/Event Passes are sold out/);
  assert.doesNotMatch(h.text(),/This Event is free/);
  assert.equal(h.node('event-pass-purchase-button'),undefined);
});

test("Sunday 8 PM presale on both platforms shows timezone and never offers early entry", async t => {
  for (const platform of ['android','ios']) {
    const startsAt='2099-01-05T01:00:00Z';
    const h=await mount(t,{platform,event:{starts_at:startsAt,time_zone:'America/New_York'},
      access:{...locked,offer:{...offer,terms:{...offer.terms,startsAt}}}});
    assert.ok(h.node('event-pass-purchase-button'));
    assert.match(h.node('event-pass-lock-card').props.body,/Entry opens when the Event goes live/);
    assert.match(h.text(),/device’s time zone/);assert.match(h.text(),/America\/New_York/);
    assert.equal(h.node('event-open-live-button'),undefined);
    assert.equal(h.node('event-open-replay-button'),undefined);
  }
});

test("pending checkout removes purchase action and points to My Tickets without granting entry",async t=>{
  const h=await mount(t,{purchase:async()=>({ok:false,message:'Purchase received. Waiting for verification.',access:{...locked,requiresPurchase:false,reason:'reconciliation_required'}})});
  await h.press('event-pass-purchase-button');
  assert.equal(h.node('event-pass-purchase-button'),undefined);
  assert.equal(h.node('event-pass-success-receipt'),undefined);
  assert.equal(h.node('event-open-live-button'),undefined);
  assert.match(h.text(),/purchase is still being checked/);
  await h.press('event-my-tickets-button');assert.deepEqual(h.routes,['/purchases']);
});

test("mounted event suppresses a previous account's late purchase receipt and access", async t => {
  const d = deferred(); const h = await mount(t, { purchase: () => d.promise });
  await h.press("event-pass-purchase-button");
  await h.account({ allowed: false, requiresPurchase: false, reason: "access_check_failed", offer: null });
  await h.resolve(d, { ok: false, access: owned, message: "Old account receipt" });
  assert.equal(h.node("event-pass-success-receipt"), undefined);
  assert.doesNotMatch(h.text(), /Old account receipt/);
  assert.match(h.text(), /could not be verified/);
});

test("negative control detects removing late purchase account isolation", async t => {
  const source = fs.readFileSync("app/event/[eventId].tsx", "utf8");
  const changed = source.replace("if (context !== purchaseContextRef.current) return;", "");
  assert.notEqual(changed, source);
  const d = deferred(); const h = await mount(t, { source: changed, purchase: () => d.promise });
  await h.press("event-pass-purchase-button");
  await h.account({ allowed: false, requiresPurchase: false, reason: "access_check_failed", offer: null });
  await h.resolve(d, { ok: false, access: owned, message: "Old account receipt" });
  assert.ok(h.node("event-pass-success-receipt"), "mutant reproduces stale account receipt");
});

test("mounted paid live and replay entry use the exact protected event route", async t => {
  for (const [kind,status] of [['live','live_now'],['replay','replay_available']]) {
    const h=await mount(t,{access:owned,event:{status},entry:{allowed:true,reason:'verified',creatorEventId:eventId,itemId:eventId,kind}});
    await h.press(`event-open-${kind}-button`);
    assert.deepEqual(h.routes,[`/event-watch/${eventId}`]);
  }
});

test("exact resolver rejects another event destination and no feed fallback grants entry", async t => {
  const h=await mount(t,{access:owned,event:{status:'live_now'},entry:{allowed:true,reason:'verified',creatorEventId:eventId,itemId:'44444444-4444-4444-8444-444444444444',kind:'live'}});
  assert.equal(h.node('event-open-live-button'),undefined);assert.deepEqual(h.routes,[]);
});

test("ended event can open a purchased replay only from exact replay authority",async t=>{
  const h=await mount(t,{access:{allowed:false,requiresPurchase:false,reason:'ended',offer:null},event:{status:'ended'},
    purchases:[{status:'active',termsAvailable:false,terms:{},amountMinor:199,currency:'usd'}],
    entry:{allowed:true,creatorEventId:eventId,itemId:eventId,kind:'replay',reason:'verified'}});
  await h.press('event-open-replay-button');assert.deepEqual(h.routes,[`/event-watch/${eventId}`]);assert.doesNotMatch(h.text(),/This Event is free/);
});

test("mounted event checkout binds displayed terms revision and provides purchase library recovery",async t=>{
  let input;const h=await mount(t,{purchase:async value=>{input=value;return{ok:false,access:locked,message:'Purchase pending verification'};}});
  await h.press('event-pass-purchase-button');assert.equal(input.expectedTermsRevisionId,offer.termsRevisionId);
  await h.press('event-my-tickets-button');assert.deepEqual(h.routes,['/purchases']);
});

test("before purchase the event shows exact replay availability and expiry in the ticket timezone",async t=>{
  const terms={...offer.terms,replayPolicy:'until_expiration',timeZone:'America/Los_Angeles',
    replayAvailableAt:'2026-11-03T04:00:00Z',replayExpiresAt:'2026-11-05T04:00:00Z'};
  const h=await mount(t,{access:{...locked,offer:{...offer,terms}},event:{time_zone:'Asia/Tokyo',starts_at:'2026-11-01T10:00:00Z'}});
  const replay=textOf(h.node('event-ticket-replay-terms'));
  assert.match(replay,/Replay included from/);assert.match(replay,/Nov 2, 2026/);assert.match(replay,/Nov 4, 2026/);
  assert.equal((replay.match(/America\/Los_Angeles/g)??[]).length,2);assert.doesNotMatch(replay,/Asia\/Tokyo/);
  assert.match(h.text(),/Replay arriving later does not remove that eligibility/);assert.match(h.text(),/not a guaranteed or completed refund/);
  assert.ok(h.node('event-pass-purchase-button'),'terms visible before checkout');
});

test("missing original terms do not substitute the current listing and unverified new terms cannot buy",async t=>{
  const h=await mount(t,{access:{...locked,offer:{...offer,terms:null}},purchases:[{status:'upcoming',termsAvailable:false,terms:{},amountMinor:99,currency:'usd'}]});
  assert.equal(h.node('event-pass-purchase-button'),undefined);assert.match(h.text(),/Original terms are unavailable/);
});

test("recorded purchase shows agreed schedule and provider-review eligibility separately from changed listing",async t=>{
  const h=await mount(t,{access:owned,purchases:[{id:'exact-purchase-record',status:'upcoming',amountMinor:199,currency:'usd',termsAvailable:true,
    terms:{title:'Purchased Sunday show',startsAt:'2026-11-02T01:00:00Z',timeZone:'America/New_York',includeText:'Original agreed admission'},
    refundEligibility:{reasons:['material_schedule_change']}}]});
  assert.match(h.text(),/Purchased Sunday show/);assert.match(h.text(),/Original agreed admission/);
  assert.match(h.text(),/not confirmation of a refund/);assert.equal(h.node('event-purchase-terms'),undefined);
  assert.equal(h.ticketPolicies().length,1);assert.equal(h.ticketPolicies()[0].eventId,eventId);
  assert.equal(h.ticketPolicies()[0].purchaseId,'exact-purchase-record');assert.equal(h.ticketPolicies()[0].initiallyExpanded,true);
});

test("event reminder action binds explicit viewer and event without claiming push delivery",async t=>{
  let args;const h=await mount(t,{reminder:{eventId,viewerUserId:'buyer-one',state:'not_enrolled',canEnroll:true},setReminder:async(...value)=>{args=value;return{status:'completed',message:'Reminder saved'};}});
  await h.press('event-reminder-toggle');assert.deepEqual(args,[eventId,true,'buyer-one']);assert.match(h.text(),/Reminder saved/);
});

test("late reminder result is suppressed after an account change",async t=>{
  const d=deferred();const h=await mount(t,{reminder:{eventId,viewerUserId:'buyer-one',state:'not_enrolled',canEnroll:true},setReminder:()=>d.promise});
  await h.press('event-reminder-toggle');await h.account({allowed:false,requiresPurchase:false,reason:'access_check_failed',offer:null});
  await h.resolve(d,{status:'completed',message:'Old account reminder saved'});assert.doesNotMatch(h.text(),/Old account reminder saved/);
  assert.equal(h.node('event-reminder-toggle').props.disabled,false);
});
