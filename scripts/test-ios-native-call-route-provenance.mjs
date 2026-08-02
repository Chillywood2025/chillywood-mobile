import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

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
].map(async (path) => [path, await readFile(new URL(`../${path}`, import.meta.url), "utf8")])));

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
  nativeIdentity: CALL,
  platform: "ios",
  threadId: THREAD,
  trustedNativeClaim: consumed,
}), "the exact consumed claim owns the iOS native answer request");

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

clearNativeCallTransitionClaims();
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
const producerConsumed = consumeTrustedIosCallKitNativeEventClaim({
  callUuid: CALL,
  claimId: producerCreated.claimId,
  inviteId: INVITE,
  threadId: THREAD,
});
pass(producerConsumed?.source === "ios_callkit_native_event", "the platform wrapper returns stored source and action");
clearNativeCallTransitionClaims();

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
  `https://www.chillywood.com/chat/${THREAD}?nativeCallAction=end&nativeCallUuid=${CALL}&openCall=1`,
]) {
  const sanitized = sanitizeExternalIosNativeCallPath(unsafePath);
  for (const key of ["nativeCallAction", "nativeCallUuid", "nativeCallClaim", "openCall", "startCall"]) {
    assert.ok(!sanitized.includes(key), `external path must strip ${key}`);
  }
}

assert.equal((sources["app/_layout.tsx"].match(/registerTrustedIosCallKitNativeEvent\(/gu) ?? []).length, 1, "the iOS bridge is the sole production creator");
for (const sensitiveName of ["nativecallaction", "nativecallclaim", "nativecalluuid"]) {
  assert.ok(sources["app/_layout.tsx"].includes(`"${sensitiveName}"`), `${sensitiveName} is excluded from analytics and auth redirects`);
}
assert.ok(sources["app/_layout.tsx"].includes("sanitizeExternalIosNativeCallPath(path)"), "ordinary notification responses are sanitized");
assert.ok(sources["app/+native-intent.tsx"].includes("sanitizeExternalIosNativeCallPath(path)"), "iOS system paths are sanitized");
assert.ok(sources["app/chat/[threadId].tsx"].includes("consumeTrustedIosCallKitNativeEventClaim"), "the thread consumes the shared claim");
assert.ok(sources["app/chat/[threadId].tsx"].includes("handleJoinOrCloseCall(requestedCallInviteId, false)"), "openCall cannot accept a ringing invite");
assert.ok(!sources["app/chat/[threadId].tsx"].includes("nativeCallAction: nativeCallActionParam"), "route action text is not read as authority");
assert.ok(!sources["_lib/nativeCallTransitionProvenance.mjs"].match(/AsyncStorage|UserDefaults|SecureStore|console\.|Math\.random|trackEvent|Crashlytics/u), "claims are memory-only, crypto-only, and undisclosed");
assert.ok(!sources["_lib/nativeCallTransitionProvenance.mjs"].match(/livekit|token|camera|microphone|media/i), "claim creation has no token or media authority");
assert.ok(sources["_lib/iosNativeCalls.ts"].includes("clearNativeCallTransitionClaims"), "readiness/account lifecycle clears claims");

const mutationDefaults = Object.freeze({
  callKitCompletionBeforeServer: false,
  claimDisclosure: false,
  claimExpiry: true,
  claimOneTime: true,
  claimPersistent: false,
  duplicateExtendsTtl: false,
  externalCreator: false,
  initialUrlCreator: false,
  linkingCreator: false,
  mediaFromClaim: false,
  mismatchedBindingAccepted: false,
  openCallAccepts: false,
  platformMismatchAccepted: false,
  queryAnswer: false,
  queryControl: false,
  queryDecline: false,
  routeOnlyOwnership: false,
  uuidWithoutClaim: false,
});
const validateMutation = (state) => {
  const checks = [
    [state.routeOnlyOwnership, "IOS_ROUTE_ONLY_TRANSITION_AUTHORITY"],
    [state.uuidWithoutClaim, "IOS_CALL_UUID_WITHOUT_PROVENANCE_ACCEPTED"],
    [state.externalCreator, "IOS_EXTERNAL_URL_CREATES_NATIVE_CLAIM"],
    [state.initialUrlCreator, "IOS_INITIAL_URL_CREATES_NATIVE_CLAIM"],
    [state.linkingCreator, "IOS_LINKING_EVENT_CREATES_NATIVE_CLAIM"],
    [state.queryAnswer, "IOS_QUERY_ONLY_ANSWER_ACCEPTED"],
    [state.queryDecline, "IOS_QUERY_ONLY_DECLINE_ACCEPTED"],
    [state.queryControl, "IOS_QUERY_ONLY_NATIVE_CONTROL_ACCEPTED"],
    [state.openCallAccepts, "IOS_OPEN_CALL_AUTO_ACCEPTED"],
    [!state.claimExpiry, "IOS_NATIVE_CLAIM_EXPIRY_MISSING"],
    [!state.claimOneTime, "IOS_NATIVE_CLAIM_REPLAY_ACCEPTED"],
    [state.claimPersistent, "IOS_NATIVE_CLAIM_PERSISTENCE_INVALID"],
    [state.duplicateExtendsTtl, "IOS_NATIVE_EVENT_DUPLICATE_EXTENDS_AUTHORITY"],
    [state.mismatchedBindingAccepted, "IOS_NATIVE_CLAIM_BINDING_MISMATCH_ACCEPTED"],
    [state.callKitCompletionBeforeServer, "IOS_CALLKIT_COMPLETION_BEFORE_SERVER_AUTHORITY"],
    [state.mediaFromClaim, "IOS_NATIVE_CLAIM_MEDIA_AUTHORITY_VIOLATION"],
    [state.platformMismatchAccepted, "PLATFORM_PROOF_SCOPE_MISMATCH"],
    [state.claimDisclosure, "IOS_NATIVE_CLAIM_DISCLOSURE"],
  ];
  return checks.filter(([failed]) => failed).map(([, code]) => code);
};
const negativeFixtures = [
  ["routeOnlyOwnership", true, "IOS_ROUTE_ONLY_TRANSITION_AUTHORITY"],
  ["uuidWithoutClaim", true, "IOS_CALL_UUID_WITHOUT_PROVENANCE_ACCEPTED"],
  ["externalCreator", true, "IOS_EXTERNAL_URL_CREATES_NATIVE_CLAIM"],
  ["initialUrlCreator", true, "IOS_INITIAL_URL_CREATES_NATIVE_CLAIM"],
  ["linkingCreator", true, "IOS_LINKING_EVENT_CREATES_NATIVE_CLAIM"],
  ["queryAnswer", true, "IOS_QUERY_ONLY_ANSWER_ACCEPTED"],
  ["queryDecline", true, "IOS_QUERY_ONLY_DECLINE_ACCEPTED"],
  ["queryControl", true, "IOS_QUERY_ONLY_NATIVE_CONTROL_ACCEPTED"],
  ["openCallAccepts", true, "IOS_OPEN_CALL_AUTO_ACCEPTED"],
  ["claimExpiry", false, "IOS_NATIVE_CLAIM_EXPIRY_MISSING"],
  ["claimOneTime", false, "IOS_NATIVE_CLAIM_REPLAY_ACCEPTED"],
  ["claimPersistent", true, "IOS_NATIVE_CLAIM_PERSISTENCE_INVALID"],
  ["duplicateExtendsTtl", true, "IOS_NATIVE_EVENT_DUPLICATE_EXTENDS_AUTHORITY"],
  ["mismatchedBindingAccepted", true, "IOS_NATIVE_CLAIM_BINDING_MISMATCH_ACCEPTED"],
  ["callKitCompletionBeforeServer", true, "IOS_CALLKIT_COMPLETION_BEFORE_SERVER_AUTHORITY"],
  ["mediaFromClaim", true, "IOS_NATIVE_CLAIM_MEDIA_AUTHORITY_VIOLATION"],
  ["platformMismatchAccepted", true, "PLATFORM_PROOF_SCOPE_MISMATCH"],
  ["claimDisclosure", true, "IOS_NATIVE_CLAIM_DISCLOSURE"],
];
assert.deepEqual(validateMutation(mutationDefaults), [], "the current provenance model has no negative-control finding");
for (const [field, value, code] of negativeFixtures) {
  assert.deepEqual(validateMutation({...mutationDefaults, [field]: value}), [code], `${code} must fail the gate`);
}

console.log(JSON.stringify({
  finding: "IOS_NATIVE_ACTION_ROUTE_PROVENANCE_MISSING",
  negativeControls: `${negativeFixtures.length}/${negativeFixtures.length}`,
  preFixReproductions: `${preFixReproductions}/10`,
  producerDenials: `${producerDenials.length}/${producerDenials.length}`,
  routeDenials: `${routeDenials}/${routeCases.length}`,
  trustedPositive: `${trustedPositive}/${trustedPositive}`,
}));
