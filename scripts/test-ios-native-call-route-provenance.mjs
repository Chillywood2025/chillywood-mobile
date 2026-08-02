import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

import {
  clearNativeCallTransitionClaims,
  consumeTrustedIosCallKitNativeEventClaim,
  createNativeCallTransitionProvenanceRegistry,
  registerTrustedIosCallKitNativeEvent,
  sanitizeExternalIosNativeCallPath,
} from "../_lib/nativeCallTransitionProvenance.mjs";
import {doesNativeCallActionOwnTransition} from "../_lib/communicationCallMediaPolicy.mjs";

const THREAD = "11111111-1111-4111-8111-111111111111";
const INVITE = "22222222-2222-4222-8222-222222222222";
const CALL = "33333333-3333-4333-8333-333333333333";
const OTHER_THREAD = "44444444-4444-4444-8444-444444444444";
const OTHER_INVITE = "55555555-5555-4555-8555-555555555555";
const OTHER_CALL = "66666666-6666-4666-8666-666666666666";
const CLAIM_ID = "a".repeat(64);

let monotonicNow = 100;
let claimSerial = 9;
const createRegistry = (overrides = {}) => createNativeCallTransitionProvenanceRegistry({
  claimIdFactory: () => (claimSerial++).toString(16).padStart(64, "0"),
  now: () => monotonicNow,
  ...overrides,
});
const iosEvent = (overrides = {}) => ({
  action: "answer",
  inviteId: INVITE,
  nativeEventGeneration: 7,
  nativeIdentity: CALL,
  platform: "ios",
  source: "ios_callkit_native_event",
  threadId: THREAD,
  ...overrides,
});
const consumeInput = (claimId, overrides = {}) => ({
  claimId,
  inviteId: INVITE,
  nativeIdentity: CALL,
  platform: "ios",
  source: "ios_callkit_native_event",
  threadId: THREAD,
  ...overrides,
});

const sources = Object.fromEntries(await Promise.all([
  "_lib/nativeCallTransitionProvenance.mjs",
  "_lib/iosNativeCalls.ts",
  "_lib/communicationCallMediaPolicy.mjs",
  "app/+native-intent.tsx",
  "app/_layout.tsx",
  "app/chat/[threadId].tsx",
  "app.json",
].map(async (path) => [path, await readFile(new URL(`../${path}`, import.meta.url), "utf8")])));

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const trackedProductionPaths = execFileSync("git", ["ls-files", "-z"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).split("\0").filter((path) => (
  /^(?:_lib|app|components|hooks|modules|plugins)\//u.test(path)
  && /\.(?:cjs|js|jsx|mjs|ts|tsx)$/u.test(path)
  && !path.endsWith(".d.ts")
));
const trackedProductionSources = Object.fromEntries(await Promise.all(
  trackedProductionPaths.map(async (path) => [
    path,
    await readFile(new URL(`../${path}`, import.meta.url), "utf8"),
  ]),
));
const IOS_CLAIM_CREATOR_ALLOWLIST = new Set(["app/_layout.tsx"]);
const findProductionIosClaimCreatorCallsites = (overrides = {}) => {
  const callsites = [];
  Object.entries({...trackedProductionSources, ...overrides}).forEach(([path, source]) => {
    const lines = String(source).split("\n");
    lines.forEach((line, index) => {
      const matches = line.match(/\bregisterTrustedIosCallKitNativeEvent\s*\(/gu) ?? [];
      matches.forEach(() => callsites.push({line: index + 1, path}));
    });
  });
  return callsites;
};
const productionCreatorCallsites = findProductionIosClaimCreatorCallsites();
assert.deepEqual(
  [...new Set(productionCreatorCallsites.map(({path}) => path))],
  [...IOS_CLAIM_CREATOR_ALLOWLIST],
  "the repository-wide tracked production scan must find only the intended iOS claim creator file",
);
assert.equal(productionCreatorCallsites.length, 1, "the intended iOS bridge must contain exactly one claim creator callsite");

const configuredUniversalLinkHost = JSON.parse(sources["app.json"]).expo.ios.associatedDomains
  .find((entry) => String(entry).startsWith("applinks:"))
  ?.slice("applinks:".length);
assert.equal(configuredUniversalLinkHost, "chillywoodstream.com", "the URL fixture must use the configured iOS associated-link host");

// Preserve deterministic evidence of the escaped source defect without using
// the corrected production function as the fixture.
const legacyRouteOnlyOwnership = ({callInviteId, nativeCallAction}) => (
  String(callInviteId ?? "").trim().length > 0
  && ["answer", "decline", "end", "mute", "unmute"].includes(String(nativeCallAction ?? "").trim().toLowerCase())
);
let preFixReproductions = 0;
for (const action of ["answer", "decline", "end", "mute", "unmute"]) {
  assert.equal(legacyRouteOnlyOwnership({callInviteId: INVITE, nativeCallAction: action}), true);
  preFixReproductions += 1;
}
for (const fixture of [
  {callInviteId: INVITE, nativeCallAction: "answer"},
  {callInviteId: INVITE, nativeCallAction: "answer", nativeCallUuid: CALL},
  {callInviteId: INVITE, nativeCallAction: "answer", source: "custom_scheme"},
  {callInviteId: INVITE, nativeCallAction: "answer", source: "direct_router"},
  {callInviteId: INVITE, nativeCallAction: "answer", openCall: "1"},
]) {
  assert.equal(legacyRouteOnlyOwnership(fixture), true);
  preFixReproductions += 1;
}

let trustedPositive = 0;
const pass = (condition, message) => {
  assert.ok(condition, message);
  trustedPositive += 1;
};
const registry = createRegistry({claimIdFactory: () => CLAIM_ID});
const created = registry.create(iosEvent());
pass(created.status === "created", "a validated native event creates one claim");
pass(created.claimId === CLAIM_ID, "the internal route receives an opaque claim handle");
pass(created.threadId === THREAD && created.inviteId === INVITE, "the claim binds exact route identities");
pass(created.nativeIdentity === CALL, "the claim binds the CallKit UUID");
const consumed = registry.consume(consumeInput(CLAIM_ID));
pass(consumed?.threadId === THREAD, "the exact thread consumes the claim");
pass(consumed?.consumed === true, "authority is deleted before the consumed result returns");
pass(registry.inspectCounts().active === 0, "consumption removes the active claim");
pass(registry.consume(consumeInput(CLAIM_ID)) === null, "second consumption fails");
pass(doesNativeCallActionOwnTransition({
  authority: "trusted_native_claim",
  callInviteId: INVITE,
  nativeCallAction: "answer",
  monotonicNowMs: consumed.consumedAtMonotonicMs,
  nativeIdentity: CALL,
  platform: "ios",
  threadId: THREAD,
  trustedNativeClaim: consumed,
}), "the exact consumed claim owns the iOS native answer request");
monotonicNow = consumed.expiresAtMonotonicMs;
pass(doesNativeCallActionOwnTransition({
  authority: "trusted_native_claim",
  callInviteId: INVITE,
  nativeCallAction: "answer",
  monotonicNowMs: monotonicNow,
  nativeIdentity: CALL,
  platform: "ios",
  threadId: THREAD,
  trustedNativeClaim: consumed,
}) === false, "a consumed claim cannot own a delayed transition at or after its original expiry");

const bindingRegistry = createRegistry();
const bindingCreated = bindingRegistry.create(iosEvent());
pass(bindingRegistry.consume(consumeInput(bindingCreated.claimId, {threadId: OTHER_THREAD})) === null, "wrong thread cannot consume");
pass(bindingRegistry.consume(consumeInput(bindingCreated.claimId, {inviteId: OTHER_INVITE})) === null, "wrong invite cannot consume");
pass(bindingRegistry.consume(consumeInput(bindingCreated.claimId, {nativeIdentity: OTHER_CALL})) === null, "wrong UUID cannot consume");
pass(bindingRegistry.consume(consumeInput(bindingCreated.claimId))?.action === "answer", "exact binding remains consumable after denied mismatches");

const duplicateRegistry = createRegistry();
const duplicateCreated = duplicateRegistry.create(iosEvent());
monotonicNow += 10_000;
pass(duplicateRegistry.create(iosEvent()).status === "duplicate", "duplicate native event is denied");
monotonicNow += 20_000;
pass(duplicateRegistry.consume(consumeInput(duplicateCreated.claimId)) === null, "duplicate delivery does not extend TTL");

monotonicNow = 500;
const coldStartRegistry = createRegistry();
const coldCreated = coldStartRegistry.create(iosEvent({nativeEventGeneration: 8}));
pass(coldCreated.status === "created", "a cold-start bridge generation creates fresh in-memory authority");
pass(coldStartRegistry.consume(consumeInput(coldCreated.claimId))?.nativeEventGeneration === 8, "cold-start generation is retained in the claim result");
pass(doesNativeCallActionOwnTransition({authority: "foreground_authenticated_ui"}) === false, "foreground UI is distinct from native route ownership");
pass(sources["app/_layout.tsx"].includes("await updateChillyChatCallInviteStatus") && !sources["app/_layout.tsx"].includes('nativeCallAction: "answer"'), "foreground Answer remains direct and route-independent");
pass(sources["app/_layout.tsx"].includes('settleNativeTerminalAction(event, "declined")'), "native Decline remains direct");

clearNativeCallTransitionClaims("ios");
const validProducerEvent = {
  authenticated: true,
  callInviteId: INVITE,
  callType: "voice",
  callUuid: CALL,
  nativeEventGeneration: 9,
  platform: "ios",
  threadId: THREAD,
  type: "answerRequested",
};
const producerDenials = [
  {...validProducerEvent, authenticated: false},
  {...validProducerEvent, callInviteId: "malformed"},
  {...validProducerEvent, callType: "screen"},
  {...validProducerEvent, callUuid: "malformed"},
  {...validProducerEvent, nativeEventGeneration: 0},
  {...validProducerEvent, platform: "android"},
  {...validProducerEvent, threadId: "malformed"},
  {...validProducerEvent, type: "ended"},
];
for (const deniedEvent of producerDenials) {
  assert.equal(registerTrustedIosCallKitNativeEvent(deniedEvent).status, "denied", "malformed or untrusted native events cannot create claims");
}
const producerCreated = registerTrustedIosCallKitNativeEvent(validProducerEvent);
pass(producerCreated.status === "created", "the exact CallKit producer creates a claim");
const trustedInternalRoute = new URL(`/chat/${THREAD}?${new URLSearchParams({
  callInviteId: INVITE,
  nativeCallClaim: producerCreated.claimId,
  nativeCallUuid: CALL,
}).toString()}`, `https://${configuredUniversalLinkHost}`);
const producerConsumed = consumeTrustedIosCallKitNativeEventClaim({
  callUuid: trustedInternalRoute.searchParams.get("nativeCallUuid"),
  claimId: trustedInternalRoute.searchParams.get("nativeCallClaim"),
  inviteId: trustedInternalRoute.searchParams.get("callInviteId"),
  threadId: trustedInternalRoute.pathname.split("/").filter(Boolean)[1],
});
pass(producerConsumed?.source === "ios_callkit_native_event", "the platform wrapper returns stored source and action");
pass(doesNativeCallActionOwnTransition({
  authority: "trusted_native_claim",
  callInviteId: producerConsumed?.inviteId,
  monotonicNowMs: producerConsumed?.consumedAtMonotonicMs,
  nativeCallAction: producerConsumed?.action,
  nativeIdentity: producerConsumed?.nativeIdentity,
  platform: "ios",
  threadId: producerConsumed?.threadId,
  trustedNativeClaim: producerConsumed,
}), "the real producer, route handle, consumer, and ownership policy form one bounded production chain");
pass(consumeTrustedIosCallKitNativeEventClaim({
  callUuid: CALL,
  claimId: producerCreated.claimId,
  inviteId: INVITE,
  threadId: THREAD,
}) === null, "the real production chain cannot consume the route handle twice");
clearNativeCallTransitionClaims("ios");

monotonicNow = 750;
let scopedClaimSerial = 100;
const platformScopedRegistry = createRegistry({
  claimIdFactory: () => (scopedClaimSerial++).toString(16).padStart(64, "0"),
});
const scopedIos = platformScopedRegistry.create(iosEvent({nativeEventGeneration: 11}));
const androidRequestKey = "b".repeat(64);
const scopedAndroid = platformScopedRegistry.create({
  action: "answer",
  inviteId: OTHER_INVITE,
  nativeEventGeneration: 12,
  nativeIdentity: androidRequestKey,
  platform: "android",
  source: "android_native_action_store",
  threadId: OTHER_THREAD,
});
pass(scopedIos.status === "created" && scopedAndroid.status === "created", "both platform namespaces can coexist in the shared registry");
pass(platformScopedRegistry.clear() === false, "an absent platform scope cannot clear either namespace");
pass(platformScopedRegistry.inspectCounts().active === 2, "a denied unscoped clear preserves all active claims");
pass(platformScopedRegistry.clear("ios") === true, "iOS lifecycle clearing is explicitly platform-scoped");
pass(platformScopedRegistry.consume(consumeInput(scopedIos.claimId)) === null, "iOS lifecycle clearing removes iOS authority");
pass(platformScopedRegistry.consume({
  claimId: scopedAndroid.claimId,
  inviteId: OTHER_INVITE,
  nativeIdentity: androidRequestKey,
  platform: "android",
  source: "android_native_action_store",
  threadId: OTHER_THREAD,
})?.platform === "android", "iOS lifecycle clearing preserves future Android authority");

const routeCases = [
  "custom_scheme_answer", "custom_scheme_invite", "custom_scheme_uuid", "copied_url", "universal_link",
  "direct_router", "initial_url", "live_linking", "native_intent", "ordinary_notification",
  "foreground_banner_route", "open_call", "invite_only", "uuid_only", "action_only",
  "answer", "decline", "end", "mute", "unmute",
  "wrong_thread", "wrong_invite", "wrong_uuid", "expired_claim", "consumed_claim",
  "android_claim_on_ios", "fabricated_claim", "empty_claim", "oversized_claim", "copied_claim",
];
let routeDenials = 0;
for (const name of routeCases) {
  assert.equal(doesNativeCallActionOwnTransition({
    authority: "none",
    callInviteId: INVITE,
    nativeCallAction: name.includes("decline") ? "decline" : name.includes("end") ? "end" : name.includes("mute") ? "mute" : "answer",
    nativeIdentity: CALL,
    platform: "ios",
    threadId: THREAD,
  }), false, `${name} cannot own a transition without a consumed claim`);
  routeDenials += 1;
}

for (const unsafePath of [
  `/chat/${THREAD}?callInviteId=${INVITE}&nativeCallAction=answer&openCall=1`,
  `chillywoodmobile://chat/${THREAD}?callInviteId=${INVITE}&nativeCallAction=decline&nativeCallUuid=${CALL}&nativeCallClaim=${CLAIM_ID}&startCall=video`,
  `https://${configuredUniversalLinkHost}/chat/${THREAD}?nativeCallAction=end&nativeCallUuid=${CALL}&openCall=1`,
  `https://${configuredUniversalLinkHost}/chat/${THREAD}?callInviteId=${INVITE}#nativeCallClaim=${CLAIM_ID}&nativeCallAction=answer`,
]) {
  const sanitized = sanitizeExternalIosNativeCallPath(unsafePath);
  for (const key of ["nativeCallAction", "nativeCallUuid", "nativeCallClaim", "openCall", "startCall"]) {
    assert.ok(!sanitized.includes(key), `external path must strip ${key}`);
  }
  assert.ok(!sanitized.includes("#"), "external paths must remove the complete fragment before routing");
}

for (const sensitiveName of ["#", "nativecallaction", "nativecallclaim", "nativecalluuid", "opencall", "startcall"]) {
  assert.ok(sources["app/_layout.tsx"].includes(`"${sensitiveName}"`), `${sensitiveName} is excluded from analytics and auth redirects`);
}
assert.ok(sources["app/_layout.tsx"].includes('normalizedValue.includes("#")'), "fragment-bearing route values are excluded from analytics");
assert.ok(sources["app/_layout.tsx"].includes('pathname.split("#", 1)'), "auth redirects cannot retain a route fragment");
assert.ok(sources["app/_layout.tsx"].includes("sanitizeExternalIosNativeCallPath(path)"), "ordinary notification responses are sanitized");
assert.ok(sources["app/+native-intent.tsx"].includes("sanitizeExternalIosNativeCallPath(path)"), "iOS system paths are sanitized");
assert.ok(sources["app/chat/[threadId].tsx"].includes("consumeTrustedIosCallKitNativeEventClaim"), "the thread consumes the shared claim");
assert.ok(!/requestedOpenCall|autoOpenCallRef/u.test(sources["app/chat/[threadId].tsx"]), "openCall cannot open or join call media");
assert.ok(!/requestedCallMode|autoStartCallRef/u.test(sources["app/chat/[threadId].tsx"]), "startCall cannot create a call");
assert.ok(!sources["app/chat/[threadId].tsx"].includes("nativeCallAction: nativeCallActionParam"), "route action text is not read as authority");
assert.ok(!sources["_lib/nativeCallTransitionProvenance.mjs"].match(/AsyncStorage|UserDefaults|SecureStore|console\.|Math\.random|trackEvent|Crashlytics/u), "claims are memory-only, crypto-only, and undisclosed");
assert.ok(!sources["_lib/nativeCallTransitionProvenance.mjs"].match(/livekit|token|camera|microphone|media/i), "claim creation has no token or media authority");
assert.equal((sources["_lib/iosNativeCalls.ts"].match(/clearNativeCallTransitionClaims\("ios"\)/gu) ?? []).length, 2, "readiness/account lifecycle clears only iOS claims");

let mutantImportSerial = 0;
const importSourceModule = async (source, label) => import(
  `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}#${label}-${mutantImportSerial++}`
);
const replaceRequired = (source, search, replacement, label) => {
  assert.ok(source.includes(search), `${label} must replace an exact current production-source fragment`);
  return source.replace(search, replacement);
};
const consumedClaimFixture = (overrides = {}) => Object.freeze({
  action: "answer",
  consumed: true,
  consumedAtMonotonicMs: 100,
  createdAtMonotonicMs: 90,
  expiresAtMonotonicMs: 30_090,
  inviteId: INVITE,
  nativeEventGeneration: 7,
  nativeIdentity: CALL,
  platform: "ios",
  source: "ios_callkit_native_event",
  threadId: THREAD,
  ...overrides,
});
const policyInputFixture = (overrides = {}) => ({
  authority: "trusted_native_claim",
  callInviteId: INVITE,
  monotonicNowMs: 100,
  nativeCallAction: "answer",
  nativeIdentity: CALL,
  platform: "ios",
  threadId: THREAD,
  trustedNativeClaim: consumedClaimFixture(),
  ...overrides,
});
const creatorCallsiteFinding = (productionSources) => {
  const callsites = findProductionIosClaimCreatorCallsites(productionSources);
  const uniquePaths = [...new Set(callsites.map(({path}) => path))];
  return callsites.length === 1
    && uniquePaths.length === 1
    && IOS_CLAIM_CREATOR_ALLOWLIST.has(uniquePaths[0])
    ? null
    : true;
};
const acceptIncomingInviteBlock = (source) => {
  const start = source.indexOf("const acceptIncomingInvite = useCallback");
  const end = source.indexOf("const handleAcceptIncomingCall", start);
  assert.ok(start >= 0 && end > start, "the server-authoritative Answer block must be present");
  return source.slice(start, end);
};
const validateProductionGate = async ({code, productionSources}) => {
  const policySource = productionSources["_lib/communicationCallMediaPolicy.mjs"];
  const registrySource = productionSources["_lib/nativeCallTransitionProvenance.mjs"];
  const threadSource = productionSources["app/chat/[threadId].tsx"];
  const findings = [];
  const report = (failed) => {
    if (failed) findings.push(code);
  };

  if ([
    "IOS_ROUTE_ONLY_TRANSITION_AUTHORITY",
    "IOS_CALL_UUID_WITHOUT_PROVENANCE_ACCEPTED",
    "IOS_QUERY_ONLY_ANSWER_ACCEPTED",
    "IOS_QUERY_ONLY_DECLINE_ACCEPTED",
    "IOS_QUERY_ONLY_NATIVE_CONTROL_ACCEPTED",
    "IOS_NATIVE_CLAIM_EXPIRY_MISSING",
    "IOS_NATIVE_CLAIM_BINDING_MISMATCH_ACCEPTED",
    "PLATFORM_PROOF_SCOPE_MISMATCH",
  ].includes(code)) {
    const policy = await importSourceModule(policySource, code);
    if (code === "IOS_CALL_UUID_WITHOUT_PROVENANCE_ACCEPTED") {
      report(policy.doesNativeCallActionOwnTransition(policyInputFixture({trustedNativeClaim: null})) === true);
    } else if (code === "IOS_NATIVE_CLAIM_EXPIRY_MISSING") {
      report(policy.doesNativeCallActionOwnTransition(policyInputFixture({monotonicNowMs: 30_090})) === true);
    } else if (code === "IOS_NATIVE_CLAIM_BINDING_MISMATCH_ACCEPTED") {
      report(policy.doesNativeCallActionOwnTransition(policyInputFixture({threadId: OTHER_THREAD})) === true);
    } else if (code === "PLATFORM_PROOF_SCOPE_MISMATCH") {
      report(policy.doesNativeCallActionOwnTransition(policyInputFixture({
        nativeIdentity: "b".repeat(64),
        trustedNativeClaim: consumedClaimFixture({
          nativeIdentity: "b".repeat(64),
          platform: "android",
          source: "android_native_action_store",
        }),
      })) === true);
    } else {
      const action = code.includes("DECLINE") ? "decline" : code.includes("CONTROL") ? "mute" : "answer";
      report(policy.doesNativeCallActionOwnTransition({
        authority: "none",
        callInviteId: INVITE,
        nativeCallAction: action,
        nativeIdentity: CALL,
        platform: "ios",
        threadId: THREAD,
      }) === true);
    }
  } else if ([
    "IOS_EXTERNAL_URL_CREATES_NATIVE_CLAIM",
    "IOS_INITIAL_URL_CREATES_NATIVE_CLAIM",
    "IOS_LINKING_EVENT_CREATES_NATIVE_CLAIM",
    "IOS_NATIVE_CLAIM_CREATOR_CALLSITE_UNEXPECTED",
  ].includes(code)) {
    report(creatorCallsiteFinding(productionSources));
  } else if (code === "IOS_OPEN_CALL_AUTO_ACCEPTED") {
    report(/requestedOpenCall|autoOpenCallRef|requestedCallMode|autoStartCallRef/u.test(threadSource));
  } else if (code === "IOS_NATIVE_CLAIM_REPLAY_ACCEPTED") {
    const mutated = await importSourceModule(registrySource, code);
    let now = 100;
    const replayRegistry = mutated.createNativeCallTransitionProvenanceRegistry({
      claimIdFactory: () => CLAIM_ID,
      now: () => now,
    });
    const createdClaim = replayRegistry.create(iosEvent());
    const first = replayRegistry.consume(consumeInput(createdClaim.claimId));
    now += 1;
    const second = replayRegistry.consume(consumeInput(createdClaim.claimId));
    report(first !== null && second !== null);
  } else if (code === "IOS_NATIVE_CLAIM_PERSISTENCE_INVALID") {
    report(/AsyncStorage|UserDefaults|SecureStore/u.test(registrySource));
  } else if (code === "IOS_NATIVE_EVENT_DUPLICATE_EXTENDS_AUTHORITY") {
    const mutated = await importSourceModule(registrySource, code);
    let now = 100;
    let serial = 1;
    const duplicateGateRegistry = mutated.createNativeCallTransitionProvenanceRegistry({
      claimIdFactory: () => (serial++).toString(16).padStart(64, "0"),
      now: () => now,
    });
    duplicateGateRegistry.create(iosEvent());
    now += 10_000;
    report(duplicateGateRegistry.create(iosEvent()).status === "created");
  } else if (code === "IOS_CALLKIT_COMPLETION_BEFORE_SERVER_AUTHORITY") {
    const block = acceptIncomingInviteBlock(threadSource);
    report(block.indexOf("completeIosNativeCallAnswer") < block.indexOf("updateChillyChatCallInviteStatus"));
  } else if (code === "IOS_NATIVE_CLAIM_MEDIA_AUTHORITY_VIOLATION") {
    report(/requestLiveKitParticipantToken|startMedia|activateMedia/u.test(registrySource));
  } else if (code === "IOS_NATIVE_CLAIM_DISCLOSURE") {
    report(/console\.|trackEvent|Crashlytics/u.test(registrySource));
  } else {
    throw new Error(`Unknown production provenance gate: ${code}`);
  }
  return findings;
};

const routeOnlyMutation = (action) => replaceRequired(
  sources["_lib/communicationCallMediaPolicy.mjs"],
  'if (input?.authority !== "trusted_native_claim") return false;',
  `if (input?.authority !== "trusted_native_claim") {\n    return String(input?.callInviteId ?? "").trim().length > 0\n      && String(input?.nativeCallAction ?? "").trim().toLowerCase() === "${action}";\n  }`,
  `route-only ${action}`,
);
const negativeControls = [
  {
    code: "IOS_ROUTE_ONLY_TRANSITION_AUTHORITY",
    overrides: {"_lib/communicationCallMediaPolicy.mjs": routeOnlyMutation("answer")},
  },
  {
    code: "IOS_CALL_UUID_WITHOUT_PROVENANCE_ACCEPTED",
    overrides: {"_lib/communicationCallMediaPolicy.mjs": replaceRequired(
      sources["_lib/communicationCallMediaPolicy.mjs"],
      "if (!claim || claim.consumed !== true) return false;",
      'if (!claim || claim.consumed !== true) return String(input?.nativeIdentity ?? "").trim().length > 0;',
      "UUID without provenance",
    )},
  },
  {
    code: "IOS_EXTERNAL_URL_CREATES_NATIVE_CLAIM",
    overrides: {"app/+native-intent.tsx": `${sources["app/+native-intent.tsx"]}\nregisterTrustedIosCallKitNativeEvent({ source: "external_url" });\n`},
  },
  {
    code: "IOS_INITIAL_URL_CREATES_NATIVE_CLAIM",
    overrides: {"app/_layout.tsx": replaceRequired(
      sources["app/_layout.tsx"],
      "void Linking.getInitialURL()",
      "registerTrustedIosCallKitNativeEvent({ source: \"initial_url\" });\n    void Linking.getInitialURL()",
      "initial URL creator",
    )},
  },
  {
    code: "IOS_LINKING_EVENT_CREATES_NATIVE_CLAIM",
    overrides: {"app/_layout.tsx": replaceRequired(
      sources["app/_layout.tsx"],
      'const subscription = Linking.addEventListener("url", ({ url }) => {',
      'registerTrustedIosCallKitNativeEvent({ source: "linking_event" });\n    const subscription = Linking.addEventListener("url", ({ url }) => {',
      "live Linking creator",
    )},
  },
  {
    code: "IOS_QUERY_ONLY_ANSWER_ACCEPTED",
    overrides: {"_lib/communicationCallMediaPolicy.mjs": routeOnlyMutation("answer")},
  },
  {
    code: "IOS_QUERY_ONLY_DECLINE_ACCEPTED",
    overrides: {"_lib/communicationCallMediaPolicy.mjs": routeOnlyMutation("decline")},
  },
  {
    code: "IOS_QUERY_ONLY_NATIVE_CONTROL_ACCEPTED",
    overrides: {"_lib/communicationCallMediaPolicy.mjs": routeOnlyMutation("mute")},
  },
  {
    code: "IOS_OPEN_CALL_AUTO_ACCEPTED",
    overrides: {"app/chat/[threadId].tsx": `${sources["app/chat/[threadId].tsx"]}\nconst requestedOpenCall = true;\nconst autoOpenCallRef = { current: false };\n`},
  },
  {
    code: "IOS_NATIVE_CLAIM_EXPIRY_MISSING",
    overrides: {"_lib/communicationCallMediaPolicy.mjs": replaceRequired(
      sources["_lib/communicationCallMediaPolicy.mjs"],
      "    && Number.isFinite(claim.expiresAtMonotonicMs)\n    && monotonicNowMs >= claim.consumedAtMonotonicMs\n    && monotonicNowMs < claim.expiresAtMonotonicMs\n",
      "    && monotonicNowMs >= claim.consumedAtMonotonicMs\n",
      "claim expiry",
    )},
  },
  {
    code: "IOS_NATIVE_CLAIM_REPLAY_ACCEPTED",
    overrides: {"_lib/nativeCallTransitionProvenance.mjs": replaceRequired(
      sources["_lib/nativeCallTransitionProvenance.mjs"],
      "      activeClaims.delete(claimId);\n      activeEventKeys.delete(claim.eventKey);\n",
      "      // MUTANT: authority remains active after consumption.\n",
      "one-time registry consumption",
    )},
  },
  {
    code: "IOS_NATIVE_CLAIM_PERSISTENCE_INVALID",
    overrides: {"_lib/nativeCallTransitionProvenance.mjs": `${sources["_lib/nativeCallTransitionProvenance.mjs"]}\nvoid AsyncStorage;\n`},
  },
  {
    code: "IOS_NATIVE_EVENT_DUPLICATE_EXTENDS_AUTHORITY",
    overrides: {"_lib/nativeCallTransitionProvenance.mjs": replaceRequired(
      sources["_lib/nativeCallTransitionProvenance.mjs"],
      "      if (activeEventKeys.has(eventKey) || consumedEventKeys.has(eventKey)) {\n        return Object.freeze({status: \"duplicate\"});\n      }",
      "      if (false && (activeEventKeys.has(eventKey) || consumedEventKeys.has(eventKey))) {\n        return Object.freeze({status: \"duplicate\"});\n      }",
      "duplicate event TTL",
    )},
  },
  {
    code: "IOS_NATIVE_CLAIM_BINDING_MISMATCH_ACCEPTED",
    overrides: {"_lib/communicationCallMediaPolicy.mjs": replaceRequired(
      sources["_lib/communicationCallMediaPolicy.mjs"],
      "    && claim.threadId === threadId\n",
      "",
      "thread claim binding",
    )},
  },
  {
    code: "IOS_CALLKIT_COMPLETION_BEFORE_SERVER_AUTHORITY",
    overrides: {"app/chat/[threadId].tsx": replaceRequired(
      sources["app/chat/[threadId].tsx"],
      "      const acceptedInvite = await updateChillyChatCallInviteStatus({",
      "      await completeIosNativeCallAnswer(requestedNativeCallUuid, true);\n      const acceptedInvite = await updateChillyChatCallInviteStatus({",
      "CallKit completion ordering",
    )},
  },
  {
    code: "IOS_NATIVE_CLAIM_MEDIA_AUTHORITY_VIOLATION",
    overrides: {"_lib/nativeCallTransitionProvenance.mjs": `${sources["_lib/nativeCallTransitionProvenance.mjs"]}\nrequestLiveKitParticipantToken();\n`},
  },
  {
    code: "PLATFORM_PROOF_SCOPE_MISMATCH",
    overrides: {"_lib/communicationCallMediaPolicy.mjs": replaceRequired(
      sources["_lib/communicationCallMediaPolicy.mjs"],
      "    && claim.platform === platform\n    && claim.source === expectedSource\n",
      "",
      "platform and source claim binding",
    )},
  },
  {
    code: "IOS_NATIVE_CLAIM_DISCLOSURE",
    overrides: {"_lib/nativeCallTransitionProvenance.mjs": `${sources["_lib/nativeCallTransitionProvenance.mjs"]}\nconsole.log(nativeCallTransitionRegistry);\n`},
  },
  {
    code: "IOS_NATIVE_CLAIM_CREATOR_CALLSITE_UNEXPECTED",
    overrides: {"components/UnsafeNativeClaimCreator.tsx": "registerTrustedIosCallKitNativeEvent({ source: 'unexpected_component' });\n"},
  },
];

for (const {code} of negativeControls) {
  assert.deepEqual(
    await validateProductionGate({code, productionSources: sources}),
    [],
    `${code} baseline production gate must be clear`,
  );
}
for (const {code, overrides} of negativeControls) {
  assert.deepEqual(
    await validateProductionGate({code, productionSources: {...sources, ...overrides}}),
    [code],
    `${code} executable production-source mutant must fail its exact gate`,
  );
}

console.log(JSON.stringify({
  finding: "IOS_NATIVE_ACTION_ROUTE_PROVENANCE_MISSING",
  negativeControls: `${negativeControls.length}/${negativeControls.length}`,
  preFixReproductions: `${preFixReproductions}/10`,
  producerDenials: `${producerDenials.length}/${producerDenials.length}`,
  routeDenials: `${routeDenials}/${routeCases.length}`,
  trustedPositive: `${trustedPositive}/${trustedPositive}`,
}));
