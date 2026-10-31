import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
const buyer = "11111111-1111-4111-8111-111111111111", creator = "22222222-2222-4222-8222-222222222222", tipId = "33333333-3333-4333-8333-333333333333";
const input = { buyerId: buyer, creatorId: creator, amountCents: 300, currency: "usd" };
const compiled = ts.transpileModule(fs.readFileSync("_lib/creatorTipCheckoutAttempt.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function storage() {
  const rows = new Map(); return { rows, getItem: async key => rows.get(key) ?? null, setItem: async (key, value) => { rows.set(key, value); }, removeItem: async key => { rows.delete(key); } };
}
function load(store) {
  const module = { exports: {} }; new Function("exports", "module", "require", compiled)(module.exports, module, name => {
    if (name === "@react-native-async-storage/async-storage") return { default: store };
    if (name === "react-native-get-random-values") return {};
    throw new Error(name);
  }); return module.exports;
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test("unknown Stripe attempt persists before transport and survives module remount with same quote and UUID", async () => {
  const store = storage(), api = load(store); let original;
  await assert.rejects(api.withCreatorTipCheckoutAttempt(input, async attempt => {
    original = attempt; assert.equal(store.rows.size, 1); throw new Error("transport lost");
  }), /transport lost/);
  const remounted = load(store);
  await remounted.withCreatorTipCheckoutAttempt(input, async attempt => { assert.equal(attempt.requestId, original.requestId); assert.equal(attempt.amountCents, 300); });
  let calls = 0;
  await assert.rejects(remounted.withCreatorTipCheckoutAttempt({ ...input, amountCents: 500 }, async () => { calls += 1; }), /unresolved/);
  assert.equal(calls, 0);
});

test("concurrent client invocations serialize and never create competing request IDs", async () => {
  const api = load(storage()), d = deferred(), attempts = [];
  const first = api.withCreatorTipCheckoutAttempt(input, async attempt => { attempts.push(attempt); await d.promise; });
  const second = api.withCreatorTipCheckoutAttempt(input, async attempt => { attempts.push(attempt); });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(attempts.length, 1);
  d.resolve(); await Promise.all([first, second]); assert.equal(attempts[0].requestId, attempts[1].requestId);
});

test("only an independently confirmed matching terminal receipt retires an attempt", async () => {
  const store = storage(), api = load(store); let original;
  await api.withCreatorTipCheckoutAttempt(input, async attempt => { original = attempt; await api.rememberCreatorTipCheckoutReceipt(attempt, tipId); });
  for (const status of ["pending", "checkout_started", "failed", "disputed", "unknown"]) {
    await api.retireConfirmedCreatorTipCheckoutAttempt({ buyerId: buyer, creatorId: creator, tipId, status }); assert.equal(store.rows.size, 1);
  }
  await api.retireConfirmedCreatorTipCheckoutAttempt({ buyerId: buyer, creatorId: creator, tipId: buyer, status: "paid" }); assert.equal(store.rows.size, 1);
  await api.retireConfirmedCreatorTipCheckoutAttempt({ buyerId: buyer, creatorId: creator, tipId, status: "paid" }); assert.equal(store.rows.size, 0);
  await api.withCreatorTipCheckoutAttempt(input, async next => { assert.notEqual(next.requestId, original.requestId); });
});

test("storage loss/corruption, wrong owner and invalid minor units fail before checkout", async () => {
  let calls = 0; const store = storage(), api = load(store);
  store.setItem = async () => { throw new Error("storage unavailable"); };
  await assert.rejects(api.withCreatorTipCheckoutAttempt(input, async () => { calls += 1; }), /storage unavailable/); assert.equal(calls, 0);
  const malformed = storage(); malformed.rows.set(`@chillywood/stripe-tip-attempt:v1:${buyer}:${creator}`, "");
  await assert.rejects(load(malformed).withCreatorTipCheckoutAttempt(input, async () => { calls += 1; }));
  for (const changes of [{ amountCents: 300.5 }, { buyerId: creator }, { currency: "eur" }]) {
    await assert.rejects(api.withCreatorTipCheckoutAttempt({ ...input, ...changes }, async () => { calls += 1; }));
  }
  assert.equal(calls, 0);
});

const compiledTips = ts.transpileModule(fs.readFileSync("_lib/creatorTips.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const customQuotes={exports:{}};
new Function('exports','module','require',ts.transpileModule(fs.readFileSync('_lib/creatorTipCustomQuote.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText)(customQuotes.exports,customQuotes,()=>({}));
const capabilityId='ef000000-0000-4000-8000-000000000001';
const checkoutInput = { creatorId: creator, amountCents: 300, currency: "usd", returnUrl: "chillywood://tip-status", cancelUrl: "chillywood://tip-status" };
function tipClient(store, options = {}) {
  let authority = { userId: buyer, sessionGeneration: "one", restoreOnly: false };
  const calls = [], admissions = [], quoteCalls = []; let reply = options.reply;
  const successful = body => ({ requestId: body.request_id, buyerId: buyer, creatorId: creator, amountCents: 300, currency: "usd", tipId,
    status: "checkout_created", provider: "stripe", providerKey: "stripe_connect", mode: "test", checkoutCreated: true,
    liveMoneyAction: false, noAccessGranted: true, pureContributionOnly: true, url: "https://checkout.stripe.com/c/pay/cs_test_synthetic",
    ...(options.platform==='android'?{routeKind:'android_external_content_link',launchStrategy:'google_play_external_content_link',platform:'android',storefrontCountry:'US'}:{}) });
  const mocks = {
    "./creatorSupportedPrices": { readCreatorSupportedPrices: async () => { throw new Error("Stripe tips must not call the store catalog"); } },
    "react-native": { Platform: { OS: options.platform ?? "web" } }, "./creatorMoneyStoreQuote": {}, "./creatorMoneyPurchaseAuthority": {},
    "./revenuecat": { purchaseRevenueCatStoreProduct: () => assert.fail('external checkout must not call a native store SDK'),
      readRevenueCatNonSubscriptionProducts: () => assert.fail('external checkout must not substitute a store SKU') },
    "./iosAppStoreCommerce": {}, "./paymentRailPolicy": {}, "./runtimeConfig": {}, "./entitlementAuthority": {},
    "./creatorTipCheckoutAttempt": load(store),
    "./creatorTipCustomQuote": customQuotes.exports,
    "./iosExternalAdmission": {admitIosExternalCheckout:async(_subject,input)=>{admissions.push(input);if(options.admissionDenied)throw Error("storefront denied");return options.admissionCapability ?? capabilityId;}},
 "./googlePlayExternalAdmission": {admitGooglePlayExternalCheckout:async(_subject,input,native)=>{
      if(options.admissionDenied)throw new Error("admission denied");
      admissions.push(input);
      assert.match(input.sourceId,/^[a-f0-9-]{36}$/);
      assert.equal(input.amountMinor,300);assert.equal(native.google_play_external_transaction_token,"native-token");
      return options.admissionCapability ?? capabilityId;
    }},
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => authority, sameAccountSessionAuthority: (a, b) => a?.userId === b?.userId && a?.sessionGeneration === b?.sessionGeneration },
    "./accountBoundSupabaseMutation": { captureAccountBoundSupabaseMutationSubject: async () => ({ authority, accessToken: "frozen-token" }),
      invokeAccountBoundSupabaseMutationRpc: async (_subject,name,args) => name==='get_creator_tip_amount_quote' ? (quoteCalls.push(args), {data:{
        available:true,feature:'creator_tip',provider:'stripe_connect',buyerId:buyer,sessionId:'one',creatorId:creator,
        amountCents:300,currency:'usd',platform:options.platform==='android'?'android':'ios',routeKind:options.platform==='android'?'android_external_content_link':'external_browser_checkout',storefrontCountry:'US',
        environment:'test',paymentMethod:'card',capabilityId,minAmountMinor:50,maxAmountMinor:100000,
        expiresAt:'2099-01-01T00:00:00Z',eligibilityExpiresAt:'2099-01-01T00:00:00Z',noAccessGranted:true,liveMoneyAction:false,
        ...options.quote,
      },error:null}) : ({ data: { id: tipId, creatorId: creator, senderId: options.wrongSender ? creator : buyer,
        status: options.status ?? "paid", amountCents: 300, currency: "usd", accessGranted: false, pureContributionOnly: true }, error: null }) },
    "./supabase": { supabase: { functions: { invoke: async (name, input) => {
      calls.push({ name, input }); if (options.switchAccount) authority = { ...authority, sessionGeneration: "two" };
      return reply ? reply(input.body, successful(input.body)) : { data: successful(input.body), error: null };
    } } } },
  };
  const module = { exports: {} }; new Function("exports", "module", "require", compiledTips)(module.exports, module, name => {
    assert.ok(name in mocks, `Unexpected import ${name}`); return mocks[name];
  });
  return { api: module.exports, calls, admissions, quoteCalls, reply: next => { reply = next; } };
}

test("Android custom tip binds native observation to durable request and never stores its token",async()=>{
 const googlePlay={google_play_external_transaction_token:"native-token",google_play_external_link_api_version:1};
 const store=storage(),h=tipClient(store,{platform:"android"});
 const result=await h.api.createCreatorTipCheckout({...checkoutInput,googlePlay});
 assert.equal(result.checkoutCreated,true);
 assert.equal(h.admissions[0].sourceId,h.calls[0].input.body.request_id);
 assert.equal(h.calls[0].input.body.google_play_external_transaction_token,"native-token");
 assert.equal(h.calls[0].input.body.capability_id,capabilityId);
 assert.equal([...store.rows.values()].some(value=>value.includes("native-token")),false);
 for(const options of [{admissionDenied:true},{quote:{available:false}},{quote:{routeKind:"external_browser_checkout"}}]){
  const store=storage(),blocked=tipClient(store,{platform:"android",...options});
  await assert.rejects(blocked.api.createCreatorTipCheckout({...checkoutInput,googlePlay}));
  assert.equal(blocked.calls.length,0);assert.equal(store.rows.size,0,"failed eligibility does not poison a new tip amount");
 }
 const wrong=tipClient(storage(),{platform:"android",reply:(_body,row)=>({error:null,data:{...row,launchStrategy:"system_browser"}})});
 await assert.rejects(wrong.api.createCreatorTipCheckout({...checkoutInput,googlePlay}));
});

test("production Stripe helper freezes account and reuses persisted request after unknown transport and remount", async () => {
  const store = storage(), first = tipClient(store, { reply: () => ({ data: null, error: new Error("network") }) });
  await assert.rejects(first.api.createCreatorTipCheckout(checkoutInput), /unknown/);
  const originalId = first.calls[0].input.body.request_id;
  const remounted = tipClient(store); const result = await remounted.api.createCreatorTipCheckout(checkoutInput);
  assert.equal(remounted.calls[0].input.body.request_id, originalId); assert.equal(remounted.calls[0].input.headers.Authorization, "Bearer frozen-token");
  assert.equal(result.tipId, tipId); assert.equal(result.noAccessGranted, true);
  await remounted.api.readMyTipTransactionStatus(tipId); assert.equal(store.rows.size, 0);
});

test("production Stripe helper rejects wrong quote, account, request, unsafe URL and changed session without a new attempt", async () => {
  for (const changes of [{ requestId: creator }, { buyerId: creator }, { creatorId: buyer }, { amountCents: 99 }, { currency: "eur" },
    { url: "https://foreign.test/pay/a" }, { mode: "live" }, { noAccessGranted: false }, { status: "paid" }, { status: "" }]) {
    const store = storage(), h = tipClient(store, { reply: (_body, response) => ({ data: { ...response, ...changes }, error: null }) });
    await assert.rejects(h.api.createCreatorTipCheckout(checkoutInput)); assert.equal(h.calls.length, 1); assert.equal(store.rows.size, 1);
  }
  const switched = tipClient(storage(), { switchAccount: true }); await assert.rejects(switched.api.createCreatorTipCheckout(checkoutInput), /unknown/);
  const denied = tipClient(storage(), { platform: "ios" }); assert.equal((await denied.api.createCreatorTipCheckout(checkoutInput)).checkoutCreated, false); assert.equal(denied.calls.length, 0);
});

test("a creator or other buyer receipt cannot retire this buyer's unresolved Stripe attempt", async () => {
  const store = storage(), h = tipClient(store, { wrongSender: true }); await h.api.createCreatorTipCheckout(checkoutInput);
  await assert.rejects(h.api.readMyTipTransactionStatus(tipId), /exact tip receipt/); assert.equal(store.rows.size, 1);
  const pending = tipClient(store, { status: "checkout_started" }); await pending.api.readMyTipTransactionStatus(tipId); assert.equal(store.rows.size, 1);
});

test('iOS explicit US external tip requires fresh exact server capability; legacy and unsupported routes stay blocked',async()=>{
  const input={...checkoutInput,capabilityId,returnUrl:'chillywoodmobile://tip-status',cancelUrl:'chillywoodmobile://tip-status'};
  const valid=tipClient(storage(),{platform:'ios'});const result=await valid.api.createCreatorTipCheckout(input);
  assert.equal(result.checkoutCreated,true);assert.equal(valid.calls.length,1);
  assert.equal(valid.calls[0].input.body.capability_id,capabilityId);
  assert.equal(valid.calls[0].input.body.return_url,'chillywoodmobile://tip-status');
  assert.equal(valid.calls[0].input.headers['x-chillywood-platform'],'ios');
  for(const quote of [{available:false},{storefrontCountry:'CA'},{storefrontCountry:undefined},{routeKind:'android_external_content_link'},
    {routeKind:undefined},{platform:'android'},{buyerId:creator},{sessionId:'old'},{creatorId:buyer},{amountCents:299},
    {capabilityId:creator},{expiresAt:'2000-01-01T00:00:00Z'},{eligibilityExpiresAt:'2000-01-01T00:00:00Z'}]) {
    const store=storage(),h=tipClient(store,{platform:'ios',quote});
    await assert.rejects(h.api.createCreatorTipCheckout(input),/approved US external-browser/);
    assert.equal(h.calls.length,0);assert.equal(store.rows.size,0,'unqualified route cannot create an attempt');
  }
  const android=tipClient(storage(),{platform:'android'});
  await assert.rejects(android.api.createCreatorTipCheckout(input),/native external-link integration/);
  assert.equal(android.calls.length,0);
});

test('iOS explicit custom tip freshly admits the exact durable request before quote and denies ineligible storefront without dispatch',async()=>{
 const store=storage(),h=tipClient(store,{platform:'ios'});await h.api.createCreatorTipCheckout({...checkoutInput,iosExternal:true});
 assert.equal(h.admissions[0].feature,'creator_tip');assert.equal(h.admissions[0].amountMinor,300);assert.match(h.admissions[0].sourceId,/^[a-f0-9-]{36}$/);
 const denied=tipClient(storage(),{platform:'ios',admissionDenied:true});await assert.rejects(denied.api.createCreatorTipCheckout({...checkoutInput,iosExternal:true}),/storefront denied/);assert.equal(denied.calls.length,0);
});

test("selected cross-rail action ID is used exactly and cannot replace an unresolved historical attempt", async () => {
  const store=storage(),api=load(store),action="44444444-4444-4444-8444-444444444444";
  await api.withCreatorTipCheckoutAttempt({...input,selectedActionId:action},async attempt=>assert.equal(attempt.requestId,action));
  await assert.rejects(()=>api.withCreatorTipCheckoutAttempt({...input,selectedActionId:tipId},async()=>assert.fail('no dispatch')),/unresolved/);
});

test('production tip client carries exact older selected capability through admission, quote and transport without fallback',async()=>{
 for(const platform of ['ios','android']) {
  const selectedActionId='44444444-4444-4444-8444-444444444444';
  const input={...checkoutInput,selectedActionId,capabilityId,...(platform==='ios'?{iosExternal:true}:{googlePlay:{google_play_external_transaction_token:'native-token',google_play_external_link_api_version:1}})};
  const h=tipClient(storage(),{platform});await h.api.createCreatorTipCheckout(input);
  assert.equal(h.admissions[0].capabilityId,capabilityId);
  assert.equal(h.quoteCalls[0].p_capability_id,capabilityId);
  assert.equal(h.calls[0].input.body.capability_id,capabilityId);
  assert.equal(h.calls[0].input.body.request_id,selectedActionId);
  for(const options of [{admissionCapability:creator},{quote:{capabilityId:creator}},{quote:{available:false}}]) {
   const denied=tipClient(storage(),{platform,...options});await assert.rejects(()=>denied.api.createCreatorTipCheckout(input));assert.equal(denied.calls.length,0);
  }
  const absent=tipClient(storage(),{platform});await assert.rejects(()=>absent.api.createCreatorTipCheckout({...input,capabilityId:undefined}));assert.equal(absent.admissions.length,0);
 }
});
test("lost tipId response can retire only by exact terminal action reconciliation or exact no-dispatch tombstone", async () => {
  const store=storage(),api=load(store);let action;
  await api.withCreatorTipCheckoutAttempt(input,async attempt=>{action=attempt.requestId;});
  const receipt={buyerId:buyer,actionId:action,provider:'stripe_connect',providerReferenceId:tipId,paymentStatus:'paid',terminal:true};
  await api.retireReconciledCreatorTipCheckoutAttempt(buyer,creator,{...receipt,actionId:creator});assert.equal(store.rows.size,1);
  await api.retireReconciledCreatorTipCheckoutAttempt(buyer,creator,{...receipt,paymentStatus:'failed'});assert.equal(store.rows.size,1);
  await api.retireReconciledCreatorTipCheckoutAttempt(buyer,creator,receipt);assert.equal(store.rows.size,0);
  await api.withCreatorTipCheckoutAttempt(input,async attempt=>{action=attempt.requestId;});
  await api.retireAbandonedCreatorTipCheckoutAttempt(buyer,creator,{buyerId:buyer,actionId:action,dispatched:true,abandoned:true});assert.equal(store.rows.size,1);
  await api.retireAbandonedCreatorTipCheckoutAttempt(buyer,creator,{buyerId:buyer,actionId:action,dispatched:false,abandoned:true});assert.equal(store.rows.size,0);
});
