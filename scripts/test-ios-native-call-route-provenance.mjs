import assert from "node:assert/strict";
import {Buffer} from "node:buffer";
import {execFileSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

import {clearNativeCallTransitionClaims, containsSensitiveNativeCallClaimRouteParams, consumeMountedForegroundAuthenticatedUiCallRoute, consumeMountedIosNativeCallRoute, createForegroundAuthenticatedUiCallIntent, createForegroundAuthenticatedUiCallIntentRegistry, createIosCallKitAnswerRouteHandler, createNativeCallTransitionProvenanceRegistry, sanitizeExternalIosNativeCallPath} from "../_lib/nativeCallTransitionProvenance.mjs";
import {completeIosAcceptedNativeAnswer, doesForegroundAuthenticatedUiCallIntentOwnAction, doesNativeCallActionOwnTransition, settleIosAcceptedCallKitMediaFailure, terminateIosAcceptedNativeAnswer} from "../_lib/communicationCallMediaPolicy.mjs";

const THREAD = "11111111-1111-4111-8111-111111111111";
const INVITE = "22222222-2222-4222-8222-222222222222";
const CALL = "33333333-3333-4333-8333-333333333333";
const OTHER_THREAD = "44444444-4444-4444-8444-444444444444";
const OTHER_INVITE = "55555555-5555-4555-8555-555555555555";
const OTHER_CALL = "66666666-6666-4666-8666-666666666666";
const CLAIM_ID = "a".repeat(64);
const USER = "77777777-7777-4777-8777-777777777777";
const ROOM = "88888888-8888-4888-8888-888888888888";

let monotonicNow = 100;
let claimSerial = 9;
const createRegistry = (overrides = {}) => createNativeCallTransitionProvenanceRegistry({
  claimIdFactory: () => (claimSerial++).toString(16).padStart(64, "0"),
  now: () => monotonicNow,
  ...overrides,
});
const iosEvent = (overrides = {}) => ({action: "answer", authenticatedUserId: USER, inviteId: INVITE, roomId: ROOM, nativeEventGeneration: 7, nativeIdentity: CALL, platform: "ios", source: "ios_callkit_native_event", threadId: THREAD, ...overrides});
const consumeInput = (claimId, overrides = {}) => ({action: "answer", authenticatedUserId: USER, claimId, inviteId: INVITE, nativeIdentity: CALL, platform: "ios", source: "ios_callkit_native_event", threadId: THREAD, ...overrides});

const sources = Object.fromEntries(await Promise.all(["_lib/nativeCallTransitionProvenance.mjs", "_lib/iosNativeCalls.ts", "_lib/communicationCallMediaPolicy.mjs", "app/+native-intent.tsx", "app/_layout.tsx", "app/chat/[threadId].tsx", "app/chat/index.tsx", "app/communication/[roomId].tsx", "app/profile/[userId].tsx", "app.json"].map(async (path) => [path, await readFile(new URL(`../${path}`, import.meta.url), "utf8")])));
const provenanceDeclarations = await readFile(new URL("../_lib/nativeCallTransitionProvenance.d.ts", import.meta.url), "utf8");

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const trackedProductionPaths = execFileSync("git", ["ls-files", "-z"], {cwd: repositoryRoot, encoding: "utf8"}).split("\0").filter((path) => (
  /^(?:_lib|app|components|hooks|modules|plugins)\//u.test(path)
  && /\.(?:cjs|js|jsx|mjs|ts|tsx)$/u.test(path)
  && !path.endsWith(".d.ts")
));
const trackedProductionSources = Object.fromEntries(await Promise.all(trackedProductionPaths.map(async (path) => [path, await readFile(new URL(`../${path}`, import.meta.url), "utf8")])));
const PROVENANCE_CREATOR_POLICIES = Object.freeze({
  registerTrustedAndroidNativeActionStorePayload: Object.freeze({"_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1}), "_lib/chillyChatNativeCallRouteBuffer.ts": Object.freeze({calls: 1, references: 2, specifier: "./nativeCallTransitionProvenance.mjs"})}),
  consumeTrustedAndroidNativeActionStoreClaim: Object.freeze({"_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 2}), "app/_layout.tsx": Object.freeze({calls: 2, references: 3, specifier: "../_lib/nativeCallTransitionProvenance.mjs"})}),
  consumeMountedAndroidNativeCallRoute: Object.freeze({"_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1}), "app/chat/[threadId].tsx": Object.freeze({calls: 2, references: 3, specifier: "../../_lib/nativeCallTransitionProvenance.mjs"})}),
  subscribeToTrustedAndroidNativeActionRoutes: Object.freeze({"_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1}), "app/chat/[threadId].tsx": Object.freeze({calls: 1, references: 2, specifier: "../../_lib/nativeCallTransitionProvenance.mjs"})}),
  consumeNativeCallTransitionClaim: Object.freeze({"_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1})}),
  createNativeCallTransitionProvenanceRegistry: Object.freeze({"_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 2})}),
  createForegroundAuthenticatedUiCallIntentRegistry: Object.freeze({"_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 2})}),
  consumeTrustedIosCallKitNativeEventClaim: Object.freeze({"_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 2})}),
  consumeMountedIosNativeCallRoute: Object.freeze({"_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1}), "app/chat/[threadId].tsx": Object.freeze({references: 3, specifier: "../../_lib/nativeCallTransitionProvenance.mjs"})}),
  consumeMountedForegroundAuthenticatedUiCallRoute: Object.freeze({"_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1}), "app/chat/[threadId].tsx": Object.freeze({references: 3, specifier: "../../_lib/nativeCallTransitionProvenance.mjs"})}),
  createForegroundAuthenticatedUiCallIntent: Object.freeze({
    "_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1}),
    "app/_layout.tsx": Object.freeze({references: 2, specifier: "../_lib/nativeCallTransitionProvenance.mjs"}),
    "app/chat/index.tsx": Object.freeze({references: 2, specifier: "../../_lib/nativeCallTransitionProvenance.mjs"}),
    "app/profile/[userId].tsx": Object.freeze({references: 2, specifier: "../../_lib/nativeCallTransitionProvenance.mjs"}),
  }),
  createIosCallKitAnswerRouteHandler: Object.freeze({"_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1}), "app/_layout.tsx": Object.freeze({references: 2, specifier: "../_lib/nativeCallTransitionProvenance.mjs"})}),
});
const stripComments = (source) => String(source).replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:])\/\/.*$/gmu, "$1");
const countSymbolReferences = (source, symbol) => (
  stripComments(source).match(new RegExp(`\\b${symbol}\\b`, "gu")) ?? []
).length;
const containsComputedSymbolReference = (source, symbol) => (
  stripComments(source).split(symbol).join("").replace(/[^A-Za-z0-9_$]/gu, "").includes(symbol)
);
const hasExactCreatorImport = (source, symbol, specifier) => (
  (stripComments(source).match(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/gu) ?? [])
    .filter((declaration) => {
      const importedFrom = declaration.match(/from\s*["']([^"']+)["']/u)?.[1] ?? "";
      const bindings = declaration.match(/\{([\s\S]*?)\}/u)?.[1]
        ?.split(",").map((binding) => binding.trim()).filter(Boolean) ?? [];
      return importedFrom === specifier && bindings.includes(symbol);
    }).length === 1
);
const productionCreatorPolicyPasses = (overrides = {}) => {
  const productionSources = {...trackedProductionSources, ...overrides};
  return Object.entries(PROVENANCE_CREATOR_POLICIES).every(([symbol, expectedByPath]) => {
    if (Object.entries(expectedByPath).some(([path, expected]) => (
      countSymbolReferences(productionSources[path] ?? "", symbol) !== expected.references
      || (!!expected.specifier && !hasExactCreatorImport(productionSources[path] ?? "", symbol, expected.specifier))
    ))) return false;
    return Object.entries(productionSources).every(([path, source]) => {
      if (Object.hasOwn(expectedByPath, path)) {
        if (containsComputedSymbolReference(source, symbol)) return false;
        if (path === "_lib/nativeCallTransitionProvenance.mjs") return true;
        return (stripComments(source).match(new RegExp(`\\b${symbol}\\s*\\(`, "gu")) ?? []).length === (expectedByPath[path].calls ?? 1);
      }
      return countSymbolReferences(source, symbol) === 0
        && !containsComputedSymbolReference(source, symbol);
    });
  });
};
assert.equal(productionCreatorPolicyPasses(), true, "production provenance creators must have exact direct allowlisted definitions, imports, and calls");

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
  currentUserId: USER,
  nativeCallAction: "answer",
  monotonicNowMs: consumed.consumedAtMonotonicMs,
  nativeIdentity: CALL,
  platform: "ios",
  threadId: THREAD,
  trustedNativeClaim: consumed,
}) === false, "a test-created registry claim cannot manufacture production attestation");
monotonicNow = consumed.expiresAtMonotonicMs;
pass(doesNativeCallActionOwnTransition({
  authority: "trusted_native_claim",
  callInviteId: INVITE,
  currentUserId: USER,
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
pass(bindingRegistry.consume(consumeInput(bindingCreated.claimId, {authenticatedUserId: OTHER_CALL})) === null, "wrong account cannot consume");
pass(bindingRegistry.consume(consumeInput(bindingCreated.claimId, {inviteId: OTHER_INVITE})) === null, "wrong invite cannot consume");
pass(bindingRegistry.consume(consumeInput(bindingCreated.claimId, {nativeIdentity: OTHER_CALL})) === null, "wrong UUID cannot consume");
pass(bindingRegistry.consume(consumeInput(bindingCreated.claimId, {action: "decline"})) === null, "wrong expected action cannot consume");
pass(bindingRegistry.consume(consumeInput(bindingCreated.claimId))?.action === "answer", "exact binding remains consumable after denied mismatches");
pass(doesNativeCallActionOwnTransition({
  authority: "trusted_native_claim", callInviteId: INVITE, currentUserId: USER,
  monotonicNowMs: consumed.consumedAtMonotonicMs, nativeCallAction: "decline", nativeIdentity: CALL, platform: "ios",
  threadId: THREAD, trustedNativeClaim: consumed,
}) === false, "a consumed Answer claim cannot own another action");
pass(doesNativeCallActionOwnTransition({
  authority: "trusted_native_claim", callInviteId: INVITE, currentUserId: USER,
  monotonicNowMs: consumed.consumedAtMonotonicMs, nativeCallAction: "answer", nativeIdentity: CALL,
  platform: "ios", threadId: THREAD, trustedNativeClaim: Object.freeze({...consumed}),
}) === false, "a frozen structural copy cannot forge native provenance");

const duplicateRegistry = createRegistry();
const duplicateCreated = duplicateRegistry.create(iosEvent());
monotonicNow += 10_000;
pass(duplicateRegistry.create(iosEvent()).status === "duplicate", "duplicate native event is denied");
monotonicNow += 20_000;
pass(duplicateRegistry.consume(consumeInput(duplicateCreated.claimId)) === null, "duplicate delivery does not extend TTL");
pass(duplicateRegistry.create(iosEvent()).status === "duplicate", "the process-lifetime seen-event tombstone rejects post-expiry replay");

monotonicNow = 500;
const coldStartRegistry = createRegistry();
const coldCreated = coldStartRegistry.create(iosEvent({nativeEventGeneration: 8}));
pass(coldCreated.status === "created", "a cold-start bridge generation creates fresh in-memory authority");
pass(coldStartRegistry.consume(consumeInput(coldCreated.claimId))?.nativeEventGeneration === 8, "cold-start generation is retained in the claim result");
pass(doesNativeCallActionOwnTransition({authority: "foreground_authenticated_ui"}) === false, "foreground UI is distinct from native route ownership");
pass(sources["app/_layout.tsx"].includes("await updateChillyChatCallInviteStatus") && !sources["app/_layout.tsx"].includes('nativeCallAction: "answer"'), "foreground Answer remains direct and route-independent");
const resumeBlock = sources["app/chat/[threadId].tsx"].slice(sources["app/chat/[threadId].tsx"].indexOf("const resumeAcceptedIncomingInvite"), sources["app/chat/[threadId].tsx"].indexOf("const acceptIncomingInvite"));
pass(resumeBlock.includes('latestInvite?.status === "accepted"') && !resumeBlock.includes("updateChillyChatCallInviteStatus"), "already-accepted recovery requires authoritative readback and performs no second server transition");
pass(sources["app/_layout.tsx"].includes('settleNativeTerminalAction(event, "declined")'), "native Decline remains direct");

clearNativeCallTransitionClaims("ios");

let foregroundNow = 1_000;
const foregroundRegistry = createForegroundAuthenticatedUiCallIntentRegistry({claimIdFactory: () => "c".repeat(64), now: () => foregroundNow});
const foregroundCreated = foregroundRegistry.create({action: "start_voice", authenticated: true, authenticatedUserId: USER, threadId: THREAD});
pass(foregroundCreated.status === "created", "a deliberate authenticated foreground control creates one UI intent");
pass(foregroundRegistry.consume({authenticatedUserId: OTHER_CALL, claimId: foregroundCreated.claimId, threadId: THREAD}) === null, "another authenticated user cannot consume the UI intent");
const consumedForeground = foregroundRegistry.consume({authenticatedUserId: USER, claimId: foregroundCreated.claimId, threadId: THREAD});
pass(doesForegroundAuthenticatedUiCallIntentOwnAction({action: "start_voice", authority: "foreground_authenticated_ui", currentUserId: USER, foregroundUiIntent: consumedForeground, monotonicNowMs: foregroundNow, threadId: THREAD}) === false, "a test-created foreground registry intent cannot manufacture production attestation");
pass(foregroundRegistry.consume({authenticatedUserId: USER, claimId: foregroundCreated.claimId, threadId: THREAD}) === null, "the foreground UI intent is one-time");
foregroundNow = consumedForeground.expiresAtMonotonicMs;
pass(doesForegroundAuthenticatedUiCallIntentOwnAction({action: "start_voice", authority: "foreground_authenticated_ui", currentUserId: USER, foregroundUiIntent: consumedForeground, monotonicNowMs: foregroundNow, threadId: THREAD}) === false, "a consumed foreground UI intent expires before delayed call work");
pass(doesForegroundAuthenticatedUiCallIntentOwnAction({action: "start_voice", authority: "foreground_authenticated_ui", currentUserId: USER, foregroundUiIntent: Object.freeze({...consumedForeground}), monotonicNowMs: consumedForeground.consumedAtMonotonicMs, threadId: THREAD}) === false, "a frozen structural copy cannot forge foreground UI authority");

const productionForegroundIntent = createForegroundAuthenticatedUiCallIntent({action: "open_call", authenticated: true, authenticatedUserId: USER, inviteId: INVITE, roomId: ROOM, threadId: THREAD});
const mountedForegroundIntent = consumeMountedForegroundAuthenticatedUiCallRoute({authenticatedUserId: USER, authLoading: false, claimId: productionForegroundIntent.claimId, isSignedIn: true, threadId: THREAD});
pass(mountedForegroundIntent?.action === "open_call", "the production foreground creator and mounted consumer preserve explicit UI authority");
const mountedForegroundInput = {action: "open_call", activeInviteId: INVITE, activeRoomId: ROOM, authority: "foreground_authenticated_ui", currentUserId: USER, foregroundUiIntent: mountedForegroundIntent, monotonicNowMs: mountedForegroundIntent?.consumedAtMonotonicMs, threadId: THREAD};
pass(doesForegroundAuthenticatedUiCallIntentOwnAction(mountedForegroundInput), "the exact active invite and room bind app-wide open-call intent");
pass(!doesForegroundAuthenticatedUiCallIntentOwnAction({...mountedForegroundInput, activeInviteId: OTHER_INVITE}), "another invite cannot consume app-wide intent");
pass(!doesForegroundAuthenticatedUiCallIntentOwnAction({...mountedForegroundInput, activeRoomId: OTHER_CALL}), "another room cannot consume app-wide intent");
pass(consumeMountedForegroundAuthenticatedUiCallRoute({authenticatedUserId: USER, authLoading: false, claimId: productionForegroundIntent.claimId, isSignedIn: true, threadId: THREAD}) === null, "a copied foreground route handle cannot be consumed twice");
const validProducerEvent = {callInviteId: INVITE, callType: "voice", callUuid: CALL, nativeEventGeneration: 9, platform: "ios", threadId: THREAD, type: "answerRequested"};
const producerDenials = [
  {...validProducerEvent, callInviteId: ""},
  {...validProducerEvent, callInviteId: "malformed"},
  {...validProducerEvent, callType: "screen"},
  {...validProducerEvent, callUuid: "malformed"},
  {...validProducerEvent, nativeEventGeneration: 0},
  {...validProducerEvent, platform: "android"},
  {...validProducerEvent, threadId: "malformed"},
  {...validProducerEvent, type: "ended"},
];
for (const deniedEvent of producerDenials) {
  let deniedRoute = "";
  const deniedHandler = createIosCallKitAnswerRouteHandler({completeAnswerFailure: () => undefined, getAuthenticatedUserId: () => USER, isActive: () => true, replace: (destination) => { deniedRoute = destination; }});
  assert.equal(await deniedHandler(deniedEvent), "denied", "malformed or untrusted native events cannot create claims");
  assert.equal(deniedRoute, "", "denied bridge events cannot route");
}
let trustedBridgeListener = null;
let trustedInternalDestination = "";
const productionBridgeHandler = createIosCallKitAnswerRouteHandler({completeAnswerFailure: () => undefined, getAuthenticatedUserId: () => USER, isActive: () => true, replace: (destination) => { trustedInternalDestination = destination; }});
const subscribeSyntheticNativeBridge = (listener) => {
  trustedBridgeListener = listener;
  return () => { trustedBridgeListener = null; };
};
const unsubscribeSyntheticBridge = subscribeSyntheticNativeBridge(productionBridgeHandler);
assert.equal(await trustedBridgeListener(validProducerEvent), "routed", "the actual production bridge handler routes one trusted event");
const trustedInternalRoute = new URL(trustedInternalDestination, `https://${configuredUniversalLinkHost}`);
const producerConsumed = consumeMountedIosNativeCallRoute({
  action: "answer",
  authenticatedUserId: USER,
  authLoading: false,
  callUuid: trustedInternalRoute.searchParams.get("nativeCallUuid"),
  claimId: trustedInternalRoute.searchParams.get("nativeCallClaim"),
  inviteId: trustedInternalRoute.searchParams.get("callInviteId"),
  isSignedIn: true,
  platform: "ios",
  threadId: trustedInternalRoute.pathname.split("/").filter(Boolean)[1],
});
unsubscribeSyntheticBridge();
pass(producerConsumed?.authenticatedUserId === USER, "the exact bridge binds authenticated readiness to the mounted-thread claim");
pass(producerConsumed?.source === "ios_callkit_native_event", "the platform wrapper returns stored source and action");
pass(doesNativeCallActionOwnTransition({authority: "trusted_native_claim", callInviteId: producerConsumed?.inviteId, currentUserId: USER, monotonicNowMs: producerConsumed?.consumedAtMonotonicMs, nativeCallAction: producerConsumed?.action, nativeIdentity: producerConsumed?.nativeIdentity, platform: "ios", threadId: producerConsumed?.threadId, trustedNativeClaim: producerConsumed}), "the real producer, route handle, consumer, and ownership policy form one bounded production chain");
pass(consumeMountedIosNativeCallRoute({action: "answer", authenticatedUserId: USER, authLoading: false, callUuid: CALL, claimId: trustedInternalRoute.searchParams.get("nativeCallClaim"), inviteId: INVITE, isSignedIn: true, platform: "ios", threadId: THREAD}) === null, "the real production chain cannot consume the route handle twice");
let signedOutRoute = "";
const signedOutBridgeHandler = createIosCallKitAnswerRouteHandler({completeAnswerFailure: () => undefined, getAuthenticatedUserId: () => "", isActive: () => true, replace: (destination) => { signedOutRoute = destination; }});
pass(await signedOutBridgeHandler({...validProducerEvent, nativeEventGeneration: 10}) === "denied", "the actual bridge handler denies an event before authenticated readiness");
pass(signedOutRoute === "", "auth-not-ready bridge delivery cannot reach the router");
let failedRouteDestination = "";
let failedRouteCompletion = 0;
const failingRouterHandler = createIosCallKitAnswerRouteHandler({
  completeAnswerFailure: () => { failedRouteCompletion += 1; },
  getAuthenticatedUserId: () => USER,
  isActive: () => true,
  replace: (destination) => { failedRouteDestination = destination; throw new Error("synthetic router failure"); },
});
pass(await failingRouterHandler({...validProducerEvent, nativeEventGeneration: 11}) === "denied", "router failure fails the native answer closed");
const failedRoute = new URL(failedRouteDestination, `https://${configuredUniversalLinkHost}`);
pass(failedRouteCompletion === 1 && consumeMountedIosNativeCallRoute({
  action: "answer", authenticatedUserId: USER, authLoading: false, callUuid: failedRoute.searchParams.get("nativeCallUuid"),
  claimId: failedRoute.searchParams.get("nativeCallClaim"), inviteId: INVITE, isSignedIn: true,
  platform: "ios", threadId: THREAD,
}) === null, "router failure consumes its exact claim before settling CallKit false");
const externalSystemRoute = sanitizeExternalIosNativeCallPath(
  `chillywoodmobile://chat/${THREAD}?callInviteId=${INVITE}&nativeCallAction=answer&nativeCallUuid=${CALL}&nativeCallClaim=${CLAIM_ID}`,
);
const externallyMountedRoute = new URL(externalSystemRoute, `https://${configuredUniversalLinkHost}`);
pass(consumeMountedIosNativeCallRoute({
  action: "answer",
  authenticatedUserId: USER,
  authLoading: false,
  callUuid: externallyMountedRoute.searchParams.get("nativeCallUuid"),
  claimId: externallyMountedRoute.searchParams.get("nativeCallClaim"),
  inviteId: externallyMountedRoute.searchParams.get("callInviteId"),
  isSignedIn: true,
  platform: "ios",
  threadId: THREAD,
}) === null, "external system URL entry reaches mounted-thread navigation without transition authority");
clearNativeCallTransitionClaims("ios");

monotonicNow = 750;
let scopedClaimSerial = 100;
const platformScopedRegistry = createRegistry({
  claimIdFactory: () => (scopedClaimSerial++).toString(16).padStart(64, "0"),
});
const scopedIos = platformScopedRegistry.create(iosEvent({nativeEventGeneration: 11}));
const androidRequestKey = "b".repeat(64);
const scopedAndroid = platformScopedRegistry.create({action: "answer", authenticatedUserId: USER, inviteId: OTHER_INVITE, nativeEventGeneration: 12, nativeIdentity: androidRequestKey, nativePayloadSchemaVersion: 2, platform: "android", source: "android_native_action_store", threadId: OTHER_THREAD});
pass(scopedIos.status === "created" && scopedAndroid.status === "created", "both platform namespaces can coexist in the shared registry");
pass(platformScopedRegistry.clear() === false, "an absent platform scope cannot clear either namespace");
pass(platformScopedRegistry.inspectCounts().active === 2, "a denied unscoped clear preserves all active claims");
pass(platformScopedRegistry.clear("ios") === true, "iOS lifecycle clearing is explicitly platform-scoped");
pass(platformScopedRegistry.consume(consumeInput(scopedIos.claimId)) === null, "iOS lifecycle clearing removes iOS authority");
pass(platformScopedRegistry.consume({action: "answer", authenticatedUserId: USER, claimId: scopedAndroid.claimId, inviteId: OTHER_INVITE, nativeIdentity: androidRequestKey, platform: "android", source: "android_native_action_store", threadId: OTHER_THREAD})?.platform === "android", "iOS lifecycle clearing preserves future Android authority");

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
  assert.equal(doesNativeCallActionOwnTransition({authority: "none", callInviteId: INVITE, nativeCallAction: name.includes("decline") ? "decline" : name.includes("end") ? "end" : name.includes("mute") ? "mute" : "answer", nativeIdentity: CALL, platform: "ios", threadId: THREAD}), false, `${name} cannot own a transition without a consumed claim`);
  routeDenials += 1;
}

for (const unsafePath of [
  `/chat/${THREAD}?callInviteId=${INVITE}&nativeCallAction=answer&openCall=1`,
  `chillywoodmobile://chat/${THREAD}?callInviteId=${INVITE}&nativeCallAction=decline&nativeCallUuid=${CALL}&nativeCallClaim=${CLAIM_ID}&startCall=video`,
  `https://${configuredUniversalLinkHost}/chat/${THREAD}?nativeCallAction=end&nativeCallUuid=${CALL}&openCall=1`,
  `https://${configuredUniversalLinkHost}/chat/${THREAD}?foregroundCallClaim=${CLAIM_ID}#nativeCallClaim=${CLAIM_ID}&nativeCallAction=answer&foregroundCallClaim=${CLAIM_ID}`,
]) {
  const sanitized = sanitizeExternalIosNativeCallPath(unsafePath);
  for (const key of ["foregroundCallClaim", "nativeCallAction", "nativeCallUuid", "nativeCallClaim", "openCall", "startCall"]) {
    assert.ok(!sanitized.includes(key), `external path must strip ${key}`);
  }
}

const copiedForeground = createForegroundAuthenticatedUiCallIntent({
  action: "start_voice", authenticated: true, authenticatedUserId: USER, threadId: THREAD,
});
const copiedForegroundUrl = new URL(sanitizeExternalIosNativeCallPath(
  `chillywoodmobile://chat/${THREAD}?foregroundCallClaim=${copiedForeground.claimId}#foregroundCallClaim=${copiedForeground.claimId}`,
));
assert.equal(consumeMountedForegroundAuthenticatedUiCallRoute({
  authenticatedUserId: USER, authLoading: false,
  claimId: copiedForegroundUrl.searchParams.get("foregroundCallClaim"), isSignedIn: true, threadId: THREAD,
}), null, "a copied live foreground handle is stripped before the mounted thread");
assert.equal(containsSensitiveNativeCallClaimRouteParams({foregroundCallClaim: CLAIM_ID}), true);
assert.equal(containsSensitiveNativeCallClaimRouteParams({nativeCallClaim: CLAIM_ID}), true);
assert.equal(containsSensitiveNativeCallClaimRouteParams({callInviteId: INVITE}), false);

for (const authRecoveryFixture of [
  `chillywoodmobile://auth-callback#type=recovery&code=synthetic-code&nativeCallAction=answer&nativeCallClaim=${CLAIM_ID}`,
  `https://${configuredUniversalLinkHost}/reset-password#access_token=synthetic-access&refresh_token=synthetic-refresh&nativeCallUuid=${CALL}`,
]) {
  const sanitized = sanitizeExternalIosNativeCallPath(authRecoveryFixture);
  assert.ok(sanitized.includes("#"), "auth and recovery fragments must survive external native-call sanitization");
  assert.ok(/type=recovery|access_token=synthetic-access/u.test(sanitized), "non-native auth fragment fields must be preserved");
  assert.ok(!/nativeCallAction|nativeCallClaim|nativeCallUuid/u.test(sanitized), "native-call authority fields must be stripped from auth fragments");
}

for (const sensitiveName of ["#", "nativecallaction", "nativecallclaim", "nativecalluuid", "opencall", "startcall"]) {
  assert.ok(sources["app/_layout.tsx"].includes(`"${sensitiveName}"`), `${sensitiveName} is excluded from analytics and auth redirects`);
}
assert.ok(sources["app/_layout.tsx"].includes('normalizedValue.includes("#")'), "fragment-bearing route values are excluded from analytics");
assert.ok(sources["app/_layout.tsx"].includes('pathname.split("#", 1)'), "auth redirects cannot retain a route fragment");
assert.ok(sources["app/_layout.tsx"].includes("sanitizeExternalIosNativeCallPath(path)"), "ordinary notification responses are sanitized");
assert.ok(sources["app/+native-intent.tsx"].includes("sanitizeExternalIosNativeCallPath(path)"), "iOS system paths are sanitized");
assert.ok(sources["app/chat/[threadId].tsx"].includes("consumeMountedIosNativeCallRoute"), "the mounted thread consumes the shared native claim after auth readiness");
assert.ok(sources["app/chat/[threadId].tsx"].includes("consumeMountedForegroundAuthenticatedUiCallRoute"), "the mounted thread consumes one-time foreground UI intent");
assert.ok(sources["app/chat/index.tsx"].includes("createForegroundAuthenticatedUiCallIntent"), "chat-inbox Voice and Video controls create a foreground UI intent");
assert.ok(sources["app/profile/[userId].tsx"].includes("createForegroundAuthenticatedUiCallIntent"), "profile Voice and Video controls create a foreground UI intent");
const compatibilitySource = sources["app/communication/[roomId].tsx"];
assert.ok(!compatibilitySource.includes("createForegroundAuthenticatedUiCallIntent"), "direct compatibility-route resolution cannot mint UI authority");
assert.ok(!compatibilitySource.includes("openCall"), "the compatibility route is navigation-only and requires the mounted thread's explicit call control");
assert.ok(!/requestedOpenCall|autoOpenCallRef/u.test(sources["app/chat/[threadId].tsx"]), "openCall cannot open or join call media");
assert.ok(!/requestedCallMode|autoStartCallRef/u.test(sources["app/chat/[threadId].tsx"]), "startCall cannot create a call");
assert.ok(!sources["app/chat/[threadId].tsx"].includes("nativeCallAction: nativeCallActionParam"), "route action text is not read as authority");
assert.ok(!sources["_lib/nativeCallTransitionProvenance.mjs"].match(/AsyncStorage|UserDefaults|SecureStore|console\.|Math\.random|trackEvent|Crashlytics/u), "claims are memory-only, crypto-only, and undisclosed");
assert.ok(!sources["_lib/nativeCallTransitionProvenance.mjs"].match(/livekit|token|camera|microphone|media/i), "claim creation has no token or media authority");
assert.ok(sources["_lib/nativeCallTransitionProvenance.mjs"].includes("expectedAction !== claim.action"), "registry consumption atomically binds the expected action");
assert.ok(provenanceDeclarations.includes("action: NativeCallTransitionAction;"), "the registry declaration requires an expected action");
assert.equal((sources["_lib/iosNativeCalls.ts"].match(/clearNativeCallTransitionClaims\("ios"\)/gu) ?? []).length, 2, "readiness/account lifecycle clears only iOS claims");

let mutantImportSerial = 0;
const provenanceModuleHref = new URL("../_lib/nativeCallTransitionProvenance.mjs", import.meta.url).href;
const importSourceModule = async (source, label) => {
  const executableSource = source.replace(
    '"./nativeCallTransitionProvenance.mjs"',
    JSON.stringify(provenanceModuleHref),
  );
  return import(`data:text/javascript;base64,${Buffer.from(executableSource, "utf8").toString("base64")}#${label}-${mutantImportSerial++}`);
};
const replaceRequired = (source, search, replacement, label) => {
  assert.ok(source.includes(search), `${label} must replace an exact current production-source fragment`);
  return source.replace(search, replacement);
};
let policyFixtureSerial = 100;
const consumedClaimFixture = async () => {
  let destination = "";
  const handler = createIosCallKitAnswerRouteHandler({
    getAuthenticatedUserId: () => USER,
    isActive: () => true,
    replace: (value) => { destination = value; },
  });
  await handler({...validProducerEvent, nativeEventGeneration: policyFixtureSerial++});
  const route = new URL(destination, `https://${configuredUniversalLinkHost}`);
  const claim = consumeMountedIosNativeCallRoute({action: "answer", authenticatedUserId: USER, authLoading: false, callUuid: CALL, claimId: route.searchParams.get("nativeCallClaim"), inviteId: INVITE, isSignedIn: true, platform: "ios", threadId: THREAD});
  assert.ok(claim, "policy fixtures must traverse the canonical producer and consumer");
  return claim;
};
const policyInputFixture = async (overrides = {}) => {
  const claim = Object.hasOwn(overrides, "trustedNativeClaim") ? overrides.trustedNativeClaim : await consumedClaimFixture();
  return {authority: "trusted_native_claim", callInviteId: INVITE, currentUserId: USER, monotonicNowMs: claim?.consumedAtMonotonicMs ?? 0, nativeCallAction: "answer", nativeIdentity: CALL, platform: "ios", threadId: THREAD, trustedNativeClaim: claim, ...overrides};
};
const consumedForegroundFixture = () => {
  const createdIntent = createForegroundAuthenticatedUiCallIntent({action: "open_call", authenticated: true, authenticatedUserId: USER, inviteId: INVITE, roomId: ROOM, threadId: THREAD});
  return consumeMountedForegroundAuthenticatedUiCallRoute({authenticatedUserId: USER, authLoading: false, claimId: createdIntent.claimId, isSignedIn: true, threadId: THREAD});
};
const mediaFailureInput = (descriptor, overrides = {}) => ({authenticatedUserId: USER, callUuid: CALL, channelState: "error", descriptor, inviteId: INVITE, inviteStatus: "accepted", mediaProvider: descriptor?.mediaProvider, platform: "ios", roomId: ROOM, threadId: THREAD, ...overrides});
const acceptedInvite = (mediaProvider = "livekit", overrides = {}) => ({calleeUserId: USER, callerUserId: OTHER_CALL, communicationRoomId: ROOM, id: INVITE, mediaProvider, status: "accepted", threadId: THREAD, ...overrides});
const terminalClaim = await consumedClaimFixture(); let terminalServer = acceptedInvite(); let terminalUpdates = 0; let terminalReads = 0; let terminalDelays = 0; let terminalEnds = 0;
const transientTerminal = await terminateIosAcceptedNativeAnswer({authenticatedUserId: USER, callUuid: CALL, invite: terminalServer, reason: "synthetic", threadId: THREAD, trustedNativeClaim: terminalClaim}, {delay: () => { terminalDelays += 1; }, endNative: () => { terminalEnds += 1; return true; }, readInvite: () => { terminalReads += 1; return terminalServer; }, updateInvite: () => { terminalUpdates += 1; if (terminalUpdates === 3) terminalServer = acceptedInvite("livekit", {status: "ended"}); return terminalServer; }});
pass(transientTerminal && terminalUpdates === 3 && terminalReads === 3 && terminalDelays === 2 && terminalEnds === 1, "accepted native Answer retries twice and requires exact authoritative terminal readback");
let failedTerminalEffects = 0;
const failedTerminal = await terminateIosAcceptedNativeAnswer({authenticatedUserId: USER, callUuid: CALL, invite: acceptedInvite(), reason: "synthetic", threadId: THREAD, trustedNativeClaim: await consumedClaimFixture()}, {delay: () => {}, endNative: () => { failedTerminalEffects += 1; }, readInvite: () => acceptedInvite(), updateInvite: () => { failedTerminalEffects += 1; return acceptedInvite("livekit", {status: "ended"}); }});
pass(!failedTerminal && failedTerminalEffects === 6, "three failed terminal attempts remain fail-closed without false confirmation");
let nativeEndServer = acceptedInvite("livekit", {status: "ended"}); let nativeEndAttempts = 0; const nativeEndClaim = await consumedClaimFixture(); const nativeEndDenied = await terminateIosAcceptedNativeAnswer({authenticatedUserId: USER, callUuid: CALL, invite: acceptedInvite(), reason: "synthetic", threadId: THREAD, trustedNativeClaim: nativeEndClaim}, {delay: () => {}, endNative: () => { nativeEndAttempts += 1; return false; }, readInvite: () => nativeEndServer, updateInvite: () => nativeEndServer});
pass(!nativeEndDenied && nativeEndAttempts === 3, "server terminal readback cannot substitute for bounded native CallKit end confirmation");
const terminalReadClaim = await consumedClaimFixture(); pass(await terminateIosAcceptedNativeAnswer({authenticatedUserId: USER, callUuid: CALL, invite: acceptedInvite(), reason: "synthetic", threadId: THREAD, trustedNativeClaim: terminalReadClaim}, {delay: () => {}, endNative: () => true, readInvite: () => acceptedInvite("livekit", {status: "ended"}), updateInvite: () => null}), "an exact authoritative already-terminal readback settles idempotently");
let mismatchEffects = 0; const mismatchClaim = await consumedClaimFixture(); const mismatchCompletion = await completeIosAcceptedNativeAnswer({authenticatedUserId: OTHER_CALL, callUuid: CALL, invite: acceptedInvite(), serverAccepted: true, threadId: THREAD, trustedNativeClaim: mismatchClaim}, {completeNative: () => { mismatchEffects += 1; return true; }, monotonicNow: () => mismatchClaim.consumedAtMonotonicMs, terminal: {}});
pass(mismatchCompletion.status === "denied" && mismatchEffects === 0, "mismatched completion identity performs no native or server side effect");
let completionFailureServer = acceptedInvite(); const completionFailureClaim = await consumedClaimFixture();
const completionFailure = await completeIosAcceptedNativeAnswer({authenticatedUserId: USER, callUuid: CALL, invite: completionFailureServer, serverAccepted: true, threadId: THREAD, trustedNativeClaim: completionFailureClaim}, {completeNative: () => false, monotonicNow: () => completionFailureClaim.consumedAtMonotonicMs, terminal: {delay: () => {}, endNative: () => true, readInvite: () => completionFailureServer, updateInvite: () => { completionFailureServer = acceptedInvite("livekit", {status: "ended"}); }}});
pass(completionFailure.status === "terminal_confirmed", "native completion failure executes bounded exact server terminal cleanup");
let descriptorFailureServer = acceptedInvite(); const descriptorFailureClaim = await consumedClaimFixture();
const descriptorFailure = await completeIosAcceptedNativeAnswer({authenticatedUserId: USER, callUuid: CALL, invite: descriptorFailureServer, serverAccepted: true, threadId: THREAD, trustedNativeClaim: descriptorFailureClaim}, {completeNative: () => true, monotonicNow: () => descriptorFailureClaim.expiresAtMonotonicMs, terminal: {delay: () => {}, endNative: () => true, readInvite: () => descriptorFailureServer, updateInvite: () => { descriptorFailureServer = acceptedInvite("livekit", {status: "ended"}); }}});
pass(descriptorFailure.status === "terminal_confirmed", "descriptor denial after queued native completion executes bounded exact server terminal cleanup");
for (const mediaProvider of ["livekit", "legacy_webrtc"]) {
  const claim = await consumedClaimFixture();
  const completion = await completeIosAcceptedNativeAnswer({authenticatedUserId: USER, callUuid: CALL, invite: acceptedInvite(mediaProvider), serverAccepted: true, threadId: THREAD, trustedNativeClaim: claim}, {completeNative: () => true, monotonicNow: () => claim.consumedAtMonotonicMs, terminal: {delay: () => {}, endNative: () => true, readInvite: () => null, updateInvite: () => null}}); const descriptor = completion.descriptor;
  pass(descriptor?.mediaProvider === mediaProvider, `${mediaProvider} records exact accepted CallKit media identity`);
  let duplicateCompletionCalls = 0; const duplicateCompletion = await completeIosAcceptedNativeAnswer({authenticatedUserId: USER, callUuid: CALL, invite: acceptedInvite(mediaProvider), serverAccepted: true, threadId: THREAD, trustedNativeClaim: claim}, {completeNative: () => { duplicateCompletionCalls += 1; return true; }, monotonicNow: () => claim.consumedAtMonotonicMs, terminal: {}});
  pass(duplicateCompletion.status === "denied" && duplicateCompletionCalls === 0, `${mediaProvider} consumed claim can mint only one accepted-media descriptor`);
  for (const mismatch of [{channelState: "live"}, {authenticatedUserId: OTHER_CALL}, {threadId: OTHER_THREAD}, {inviteId: OTHER_INVITE}, {roomId: OTHER_CALL}, {callUuid: OTHER_CALL}, {inviteStatus: "ended"}, {mediaProvider: mediaProvider === "livekit" ? "legacy_webrtc" : "livekit"}]) assert.equal((await settleIosAcceptedCallKitMediaFailure(mediaFailureInput(descriptor, mismatch), {clearLocal: () => true, leaveRoom: () => true, terminateAccepted: () => true})).status, "denied", `${mediaProvider} mismatch cannot settle`);
  let leaveCount = 0; let clearCount = 0; let settlementTerminalCount = 0;
  const retryable = await settleIosAcceptedCallKitMediaFailure(mediaFailureInput(descriptor), {clearLocal: () => { clearCount += 1; return true; }, leaveRoom: () => { leaveCount += 1; return true; }, terminateAccepted: () => false});
  pass(retryable.status === "retryable" && leaveCount === 0 && clearCount === 0, `${mediaProvider} failed terminal settlement retains authority and does not leave or clear`);
  const roomRace = await settleIosAcceptedCallKitMediaFailure(mediaFailureInput(descriptor), {clearLocal: () => { clearCount += 1; return true; }, leaveRoom: () => false, terminateAccepted: () => { settlementTerminalCount += 1; return true; }});
  pass(roomRace.status === "settled_cleanup_pending" && clearCount === 0, `${mediaProvider} exact-room leave denial retains terminal phase without clearing`);
  const clearRace = await settleIosAcceptedCallKitMediaFailure(mediaFailureInput(descriptor), {clearLocal: () => { clearCount += 1; return false; }, leaveRoom: () => { leaveCount += 1; return true; }, terminateAccepted: () => { settlementTerminalCount += 1; return true; }});
  pass(clearRace.status === "settled_cleanup_pending" && leaveCount === 1 && clearCount === 1, `${mediaProvider} local-clear denial retains room-left phase`);
  const settled = await settleIosAcceptedCallKitMediaFailure(mediaFailureInput(descriptor), {clearLocal: () => { clearCount += 1; return true; }, leaveRoom: () => { leaveCount += 1; return true; }, terminateAccepted: () => { settlementTerminalCount += 1; return true; }});
  pass(settled.status === "settled" && leaveCount === 1 && clearCount === 2 && settlementTerminalCount === 1, `${mediaProvider} phase retry neither reterminates nor releaves before exact local clear`);
  pass((await settleIosAcceptedCallKitMediaFailure(mediaFailureInput(descriptor), {clearLocal: () => true, leaveRoom: () => true, terminateAccepted: () => true})).status === "denied", `${mediaProvider} product settlement cannot replay`);
}
const concurrentClaim = await consumedClaimFixture(); const concurrentReady = await completeIosAcceptedNativeAnswer({authenticatedUserId: USER, callUuid: CALL, invite: acceptedInvite(), serverAccepted: true, threadId: THREAD, trustedNativeClaim: concurrentClaim}, {completeNative: () => true, monotonicNow: () => concurrentClaim.consumedAtMonotonicMs, terminal: {delay: () => {}, endNative: () => true, readInvite: () => null, updateInvite: () => null}}); let releaseTerminal; const terminalPending = new Promise((resolve) => { releaseTerminal = resolve; });
const firstConcurrent = settleIosAcceptedCallKitMediaFailure(mediaFailureInput(concurrentReady.descriptor), {clearLocal: () => true, leaveRoom: () => true, terminateAccepted: () => terminalPending}); await Promise.resolve(); const secondConcurrent = await settleIosAcceptedCallKitMediaFailure(mediaFailureInput(concurrentReady.descriptor), {clearLocal: () => true, leaveRoom: () => true, terminateAccepted: () => true}); releaseTerminal(true);
pass(secondConcurrent.status === "denied" && (await firstConcurrent).status === "settled", "parallel media settlement admits one exact winner only");
const mediaSettlementSource = sources["app/chat/[threadId].tsx"].slice(sources["app/chat/[threadId].tsx"].indexOf("const candidate = acceptedIosNativeMediaDescriptorRef.current"), sources["app/chat/[threadId].tsx"].indexOf("const handleToggleCallMic"));
pass(["settleIosAcceptedCallKitMediaFailure", "readChillyChatCallInvite", "terminateAcceptedIosNativeAnswer", "leaveRoom", "clearLocal", "setActiveCallInvite(null)"].every((token) => mediaSettlementSource.includes(token)), "media failure invokes the executable terminal/consume/leave/clear orchestrator adapters");
pass(mediaSettlementSource.includes('accepted?.status === "accepted"') && mediaSettlementSource.includes("terminateAcceptedIosNativeAnswer"), "stale and already-terminal effects fail closed before local clearing");
const acceptedTerminationSource = sources["_lib/communicationCallMediaPolicy.mjs"].slice(sources["_lib/communicationCallMediaPolicy.mjs"].indexOf("export async function terminateIosAcceptedNativeAnswer"), sources["_lib/communicationCallMediaPolicy.mjs"].indexOf("export async function settleIosAcceptedCallKitMediaFailure"));
pass(["endNative", "attempt < 3", "updateInvite", "readInvite", "IOS_TERMINAL_CALL_STATUSES.has"].every((token) => acceptedTerminationSource.includes(token)) && sources["_lib/communicationCallMediaPolicy.mjs"].includes('completed ? createIosAcceptedCallKitMediaDescriptor') && sources["app/chat/[threadId].tsx"].includes("completeIosAcceptedNativeAnswer"), "CallKit completion or descriptor denial uses executable bounded exact native/server terminal settlement");
const creatorCallsiteFinding = (productionSources) => (
  productionCreatorPolicyPasses(productionSources) ? null : true
);
const assertParseableModuleSource = (source, label) => {
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ["--input-type=module", "--check"], {
      encoding: "utf8",
      input: source,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }, `${label} must be a real parseable ESM source mutant`);
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
  const rootSource = productionSources["app/_layout.tsx"];
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
    "IOS_NATIVE_CLAIM_STRUCTURAL_FORGERY_ACCEPTED",
    "PLATFORM_PROOF_SCOPE_MISMATCH",
  ].includes(code)) {
    const policy = await importSourceModule(policySource, code);
    if (code === "IOS_CALL_UUID_WITHOUT_PROVENANCE_ACCEPTED") {
      report(policy.doesNativeCallActionOwnTransition(await policyInputFixture({trustedNativeClaim: null})) === true);
    } else if (code === "IOS_NATIVE_CLAIM_EXPIRY_MISSING") {
      const fixture = await policyInputFixture();
      report(policy.doesNativeCallActionOwnTransition({...fixture, monotonicNowMs: fixture.trustedNativeClaim.expiresAtMonotonicMs}) === true);
    } else if (code === "IOS_NATIVE_CLAIM_BINDING_MISMATCH_ACCEPTED") {
      report(policy.doesNativeCallActionOwnTransition(await policyInputFixture({threadId: OTHER_THREAD})) === true);
    } else if (code === "IOS_NATIVE_CLAIM_STRUCTURAL_FORGERY_ACCEPTED") {
      const forged = Object.freeze({...await consumedClaimFixture()});
      report(policy.doesNativeCallActionOwnTransition(await policyInputFixture({trustedNativeClaim: forged})) === true);
    } else if (code === "PLATFORM_PROOF_SCOPE_MISMATCH") {
      report(policy.doesNativeCallActionOwnTransition(await policyInputFixture({platform: "android"})) === true);
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
    "IOS_NATIVE_CLAIM_CREATOR_ALIAS_IMPORT",
    "IOS_NATIVE_CLAIM_CREATOR_NAMESPACE_ACCESS",
    "IOS_NATIVE_CLAIM_CREATOR_COMPUTED_ACCESS",
    "IOS_NATIVE_CLAIM_CREATOR_CANONICAL_IMPORT_SUBSTITUTED",
    "IOS_FOREGROUND_CREATOR_CANONICAL_IMPORT_SUBSTITUTED",
    "IOS_NATIVE_CLAIM_FACTORY_ALIAS_IMPORT",
    "IOS_NATIVE_CLAIM_GENERIC_CONSUMER_ALIAS_IMPORT",
    "IOS_NATIVE_CLAIM_TRUSTED_CONSUMER_NAMESPACE_ACCESS",
    "IOS_NATIVE_CLAIM_MOUNTED_CONSUMER_COMPUTED_ACCESS",
    "IOS_NATIVE_CLAIM_MOUNTED_CONSUMER_CANONICAL_IMPORT_SUBSTITUTED",
  ].includes(code)) {
    report(creatorCallsiteFinding(productionSources));
  } else if (code === "IOS_FOREGROUND_UI_INTENT_STRUCTURAL_FORGERY_ACCEPTED" || code === "IOS_FOREGROUND_UI_OPEN_CALL_BINDING_MISMATCH_ACCEPTED") {
    const policy = await importSourceModule(policySource, code);
    const intent = consumedForegroundFixture();
    const candidate = code.includes("STRUCTURAL") ? Object.freeze({...intent}) : intent;
    report(policy.doesForegroundAuthenticatedUiCallIntentOwnAction({
      action: "open_call", activeInviteId: INVITE, activeRoomId: code.includes("MISMATCH") ? OTHER_CALL : ROOM,
      authority: "foreground_authenticated_ui", currentUserId: USER, foregroundUiIntent: candidate,
      monotonicNowMs: intent.consumedAtMonotonicMs, threadId: THREAD,
    }) === true);
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
  } else if (code === "IOS_NATIVE_CLAIM_ACTION_BINDING_MISMATCH_ACCEPTED") {
    const mutated = await importSourceModule(registrySource, code);
    const actionRegistry = mutated.createNativeCallTransitionProvenanceRegistry({
      claimIdFactory: () => CLAIM_ID,
      now: () => 100,
    });
    const createdClaim = actionRegistry.create(iosEvent());
    report(actionRegistry.consume(consumeInput(createdClaim.claimId, {action: "decline"})) !== null);
  } else if (code === "IOS_NATIVE_CLAIM_FACTORY_ATTESTATION_EXPOSED") {
    const mutated = await importSourceModule(registrySource, code);
    const externalRegistry = mutated.createNativeCallTransitionProvenanceRegistry({claimIdFactory: () => CLAIM_ID, now: () => 100});
    const createdClaim = externalRegistry.create(iosEvent());
    const consumedClaim = externalRegistry.consume(consumeInput(createdClaim.claimId));
    report(mutated.isAttestedNativeCallTransitionClaim(consumedClaim));
  } else if (code === "IOS_FOREGROUND_UI_FACTORY_ATTESTATION_EXPOSED") {
    const mutated = await importSourceModule(registrySource, code);
    const externalRegistry = mutated.createForegroundAuthenticatedUiCallIntentRegistry({claimIdFactory: () => CLAIM_ID, now: () => 100});
    const createdIntent = externalRegistry.create({action: "open_call", authenticated: true, authenticatedUserId: USER, inviteId: INVITE, roomId: ROOM, threadId: THREAD});
    report(mutated.isAttestedForegroundAuthenticatedUiCallIntent(externalRegistry.consume({authenticatedUserId: USER, claimId: createdIntent.claimId, threadId: THREAD})));
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
    const completionIndexes = [block.indexOf("completeIosNativeCallAnswer"), block.indexOf("completeTrustedIosNativeAnswer")].filter((index) => index >= 0);
    report(Math.min(...completionIndexes) < block.indexOf("updateChillyChatCallInviteStatus"));
  } else if (code === "IOS_CALLKIT_COMPLETION_FAILURE_ORPHANS_ACCEPTED_INVITE") {
    const policy = await importSourceModule(policySource, code); const claim = await consumedClaimFixture(); let effects = 0;
    await policy.completeIosAcceptedNativeAnswer({authenticatedUserId: USER, callUuid: CALL, invite: acceptedInvite(), serverAccepted: true, threadId: THREAD, trustedNativeClaim: claim}, {completeNative: () => false, monotonicNow: () => claim.consumedAtMonotonicMs, terminal: {delay: () => {}, endNative: () => { effects += 1; }, readInvite: () => acceptedInvite(), updateInvite: () => { effects += 1; }}}); report(effects === 0);
  } else if (code === "IOS_NATIVE_CLAIM_MEDIA_AUTHORITY_VIOLATION") {
    report(/requestLiveKitParticipantToken|startMedia|activateMedia/u.test(registrySource));
  } else if (code === "IOS_NATIVE_CLAIM_DISCLOSURE") {
    report(/console\.|trackEvent|Crashlytics/u.test(registrySource));
  } else if (code === "IOS_FOREGROUND_UI_CLAIM_EXTERNAL_DISCLOSURE") {
    const mutated = await importSourceModule(registrySource, code);
    report(mutated.sanitizeExternalIosNativeCallPath(`chillywoodmobile://chat/${THREAD}?foregroundCallClaim=${CLAIM_ID}`).includes("foregroundCallClaim"));
  } else if (code === "IOS_NATIVE_CLAIM_DEBUG_DISCLOSURE") {
    report(!rootSource.includes("{hideDebugOverlay ? null : <DevDebugOverlay />}"));
  } else if (code === "IOS_CALLKIT_COMPLETION_FROM_UNRELATED_CHANNEL") {
    report(/callChannelState\s*===\s*["']live["'][\s\S]{0,240}completeIosNativeCallAnswer/u.test(threadSource));
  } else if (code === "IOS_CALLKIT_CLAIM_DESCRIPTOR_REPLAY" || code === "IOS_CALLKIT_NATIVE_END_UNCONFIRMED") {
    const policy = await importSourceModule(policySource, code); const claim = await consumedClaimFixture();
    if (code.endsWith("REPLAY")) { const input = {authenticatedUserId: USER, callUuid: CALL, invite: acceptedInvite(), serverAccepted: true, threadId: THREAD, trustedNativeClaim: claim}; const ops = {completeNative: () => true, monotonicNow: () => claim.consumedAtMonotonicMs, terminal: {delay: () => {}, endNative: () => true, readInvite: () => null, updateInvite: () => null}}; report((await policy.completeIosAcceptedNativeAnswer(input, ops)).status === "ready" && (await policy.completeIosAcceptedNativeAnswer(input, ops)).status === "ready"); }
    else report(await policy.terminateIosAcceptedNativeAnswer({authenticatedUserId: USER, callUuid: CALL, invite: acceptedInvite(), reason: "synthetic", threadId: THREAD, trustedNativeClaim: claim}, {delay: () => {}, endNative: () => false, readInvite: () => acceptedInvite("livekit", {status: "ended"}), updateInvite: () => null}));
  } else if (code.startsWith("IOS_ACCEPTED_CALLKIT_MEDIA_")) {
    const policy = await importSourceModule(policySource, code); const claim = await consumedClaimFixture();
    const ready = await policy.completeIosAcceptedNativeAnswer({authenticatedUserId: USER, callUuid: CALL, invite: acceptedInvite(), serverAccepted: true, threadId: THREAD, trustedNativeClaim: claim}, {completeNative: () => true, monotonicNow: () => claim.consumedAtMonotonicMs, terminal: {delay: () => {}, endNative: () => true, readInvite: () => null, updateInvite: () => null}}); let clears = 0;
    const selected = mediaFailureInput(ready.descriptor, code.endsWith("NONERROR_SETTLEMENT") ? {channelState: "live"} : code.endsWith("PROVIDER_MISMATCH") ? {mediaProvider: "legacy_webrtc"} : {}); const ops = {clearLocal: () => { clears += 1; return true; }, leaveRoom: () => true, terminateAccepted: () => !code.endsWith("FAILED_TERMINAL_SETTLEMENT") && !code.endsWith("LOCAL_CLEAR_BEFORE_CONFIRMATION") && !code.endsWith("CONSUMED_BEFORE_TERMINAL_CONFIRMATION")};
    const first = await policy.settleIosAcceptedCallKitMediaFailure(selected, ops); const clearsAfterFirst = clears; const second = await policy.settleIosAcceptedCallKitMediaFailure(mediaFailureInput(ready.descriptor), {...ops, terminateAccepted: () => true});
    report(code.endsWith("NONERROR_SETTLEMENT") || code.endsWith("PROVIDER_MISMATCH") || code.endsWith("REPLAY") ? first.status === "settled" && (code.endsWith("REPLAY") ? second.status === "settled" : true) : code.endsWith("LOCAL_CLEAR_BEFORE_CONFIRMATION") ? clearsAfterFirst > 0 : code.endsWith("FAILED_TERMINAL_SETTLEMENT") ? first.status === "settled" : second.status === "denied");
  } else if (code === "IOS_NATIVE_CLAIM_ROUTER_FAILURE_REPLAY") {
    const mutated = await importSourceModule(registrySource, code);
    let destination = "";
    const handler = mutated.createIosCallKitAnswerRouteHandler({getAuthenticatedUserId: () => USER, isActive: () => true, replace: (value) => { destination = value; throw new Error("synthetic"); }});
    await handler({...validProducerEvent, nativeEventGeneration: 99});
    const route = new URL(destination, `https://${configuredUniversalLinkHost}`);
    report(mutated.consumeTrustedIosCallKitNativeEventClaim({action: "answer", authenticatedUserId: USER, callUuid: CALL, claimId: route.searchParams.get("nativeCallClaim"), inviteId: INVITE, threadId: THREAD}) !== null);
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
const control = (code, path, source) => ({code, overrides: {[path]: source}});
const replaceControl = (code, path, search, replacement, label) => control(
  code, path, replaceRequired(sources[path], search, replacement, label),
);
const negativeControls = [
  control("IOS_ROUTE_ONLY_TRANSITION_AUTHORITY", "_lib/communicationCallMediaPolicy.mjs", routeOnlyMutation("answer")),
  replaceControl("IOS_CALL_UUID_WITHOUT_PROVENANCE_ACCEPTED", "_lib/communicationCallMediaPolicy.mjs", "if (!claim || claim.consumed !== true) return false;", 'if (!claim || claim.consumed !== true) return String(input?.nativeIdentity ?? "").trim().length > 0;', "UUID without provenance"),
  control("IOS_EXTERNAL_URL_CREATES_NATIVE_CLAIM", "components/UnsafeExternalUrlCreator.mjs", "import {createIosCallKitAnswerRouteHandler as createFromExternalUrl} from '../_lib/nativeCallTransitionProvenance.mjs';\ncreateFromExternalUrl({});\n"),
  replaceControl("IOS_INITIAL_URL_CREATES_NATIVE_CLAIM", "app/_layout.tsx", "Linking.getInitialURL()\n        .then", "createIosCallKitAnswerRouteHandler({});\n      Linking.getInitialURL()\n        .then", "initial URL creator"),
  replaceControl("IOS_LINKING_EVENT_CREATES_NATIVE_CLAIM", "app/_layout.tsx", 'const subscription = Linking.addEventListener("url", ({ url }) => {', 'createIosCallKitAnswerRouteHandler({});\n    const subscription = Linking.addEventListener("url", ({ url }) => {', "live Linking creator"),
  control("IOS_QUERY_ONLY_ANSWER_ACCEPTED", "_lib/communicationCallMediaPolicy.mjs", routeOnlyMutation("answer")),
  control("IOS_QUERY_ONLY_DECLINE_ACCEPTED", "_lib/communicationCallMediaPolicy.mjs", routeOnlyMutation("decline")),
  control("IOS_QUERY_ONLY_NATIVE_CONTROL_ACCEPTED", "_lib/communicationCallMediaPolicy.mjs", routeOnlyMutation("mute")),
  control("IOS_OPEN_CALL_AUTO_ACCEPTED", "app/chat/[threadId].tsx", `${sources["app/chat/[threadId].tsx"]}\nconst requestedOpenCall = true; const autoOpenCallRef = {current:false};\n`),
  replaceControl("IOS_NATIVE_CLAIM_EXPIRY_MISSING", "_lib/communicationCallMediaPolicy.mjs", "    && Number.isFinite(claim.expiresAtMonotonicMs)\n    && monotonicNowMs >= claim.consumedAtMonotonicMs\n    && monotonicNowMs < claim.expiresAtMonotonicMs\n", "    && monotonicNowMs >= claim.consumedAtMonotonicMs\n", "claim expiry"),
  replaceControl("IOS_NATIVE_CLAIM_REPLAY_ACCEPTED", "_lib/nativeCallTransitionProvenance.mjs", "      activeClaims.delete(claimId);\n      activeEventKeys.delete(claim.eventKey);\n", "      // MUTANT: authority remains active.\n", "one-time registry consumption"),
  replaceControl("IOS_NATIVE_CLAIM_ACTION_BINDING_MISMATCH_ACCEPTED", "_lib/nativeCallTransitionProvenance.mjs", "        expectedAction !== claim.action\n        || expectedPlatform !== claim.platform\n", "        expectedPlatform !== claim.platform\n", "atomic expected-action binding"),
  replaceControl("IOS_NATIVE_CLAIM_FACTORY_ATTESTATION_EXPOSED", "_lib/nativeCallTransitionProvenance.mjs", "      if (attestationCapability === INTERNAL_NATIVE_CLAIM_ATTESTATION) {\n        attestedNativeClaims.add(consumedClaim);\n      }\n", "      attestedNativeClaims.add(consumedClaim);\n", "internal-only attestation capability"),
  replaceControl("IOS_FOREGROUND_UI_FACTORY_ATTESTATION_EXPOSED", "_lib/nativeCallTransitionProvenance.mjs", "      if (attestationCapability === INTERNAL_FOREGROUND_INTENT_ATTESTATION) {\n        attestedForegroundIntents.add(consumedIntent);\n      }\n", "      attestedForegroundIntents.add(consumedIntent);\n", "internal-only foreground attestation capability"),
  control("IOS_NATIVE_CLAIM_PERSISTENCE_INVALID", "_lib/nativeCallTransitionProvenance.mjs", `${sources["_lib/nativeCallTransitionProvenance.mjs"]}\nvoid AsyncStorage;\n`),
  replaceControl("IOS_NATIVE_EVENT_DUPLICATE_EXTENDS_AUTHORITY", "_lib/nativeCallTransitionProvenance.mjs", "      if (activeEventKeys.has(eventKey) || seenEventKeys.has(eventKey)) {\n        return Object.freeze({status: \"duplicate\"});\n      }", "      if (false) return Object.freeze({status: \"duplicate\"});", "duplicate event tombstone"),
  replaceControl("IOS_NATIVE_CLAIM_BINDING_MISMATCH_ACCEPTED", "_lib/communicationCallMediaPolicy.mjs", "    && claim.threadId === threadId\n", "", "thread claim binding"),
  replaceControl("IOS_CALLKIT_COMPLETION_BEFORE_SERVER_AUTHORITY", "app/chat/[threadId].tsx", "      const acceptedInvite = await updateChillyChatCallInviteStatus({", "      await completeIosNativeCallAnswer(requestedNativeCallUuid, true);\n      const acceptedInvite = await updateChillyChatCallInviteStatus({", "CallKit completion ordering"),
  replaceControl("IOS_CALLKIT_COMPLETION_FAILURE_ORPHANS_ACCEPTED_INVITE", "_lib/communicationCallMediaPolicy.mjs", '  const terminal = await terminateIosAcceptedNativeAnswer({...input, reason: completed ? "accepted_media_descriptor_denied" : "callkit_answer_completion_failed"}, operations.terminal);', "  const terminal = false;", "completion failure settlement"),
  control("IOS_NATIVE_CLAIM_MEDIA_AUTHORITY_VIOLATION", "_lib/nativeCallTransitionProvenance.mjs", `${sources["_lib/nativeCallTransitionProvenance.mjs"]}\nrequestLiveKitParticipantToken();\n`),
  replaceControl("PLATFORM_PROOF_SCOPE_MISMATCH", "_lib/communicationCallMediaPolicy.mjs", "    && claim.platform === platform\n    && claim.source === expectedSource\n", "", "platform claim binding"),
  control("IOS_NATIVE_CLAIM_DISCLOSURE", "_lib/nativeCallTransitionProvenance.mjs", `${sources["_lib/nativeCallTransitionProvenance.mjs"]}\nconsole.log(nativeCallTransitionRegistry);\n`),
  replaceControl("IOS_NATIVE_CLAIM_STRUCTURAL_FORGERY_ACCEPTED", "_lib/communicationCallMediaPolicy.mjs", "    && isAttestedNativeCallTransitionClaim(claim)\n", "", "native attestation"),
  replaceControl("IOS_FOREGROUND_UI_INTENT_STRUCTURAL_FORGERY_ACCEPTED", "_lib/communicationCallMediaPolicy.mjs", "    && isAttestedForegroundAuthenticatedUiCallIntent(intent)\n", "", "foreground attestation"),
  replaceControl("IOS_FOREGROUND_UI_OPEN_CALL_BINDING_MISMATCH_ACCEPTED", "_lib/communicationCallMediaPolicy.mjs", "    && (action !== \"open_call\" || (\n      !!activeInviteId\n      && !!activeRoomId\n      && intent.inviteId === activeInviteId\n      && intent.roomId === activeRoomId\n    ))\n", "", "foreground invite and room binding"),
  replaceControl("IOS_FOREGROUND_UI_CLAIM_EXTERNAL_DISCLOSURE", "_lib/nativeCallTransitionProvenance.mjs", '  "foregroundCallClaim",\n', "", "foreground external stripping"),
  replaceControl("IOS_NATIVE_CLAIM_DEBUG_DISCLOSURE", "app/_layout.tsx", "{hideDebugOverlay ? null : <DevDebugOverlay />}", "<DevDebugOverlay />", "debug overlay gating"),
  control("IOS_CALLKIT_COMPLETION_FROM_UNRELATED_CHANNEL", "app/chat/[threadId].tsx", `${sources["app/chat/[threadId].tsx"]}\nfunction unsafe(callChannelState){if(callChannelState === "live") completeIosNativeCallAnswer("unsafe", true);}\n`),
  replaceControl("IOS_CALLKIT_CLAIM_DESCRIPTOR_REPLAY", "_lib/communicationCallMediaPolicy.mjs", "iosAcceptedMediaClaimStates.has(input.trustedNativeClaim)", "false", "claim descriptor uniqueness"),
  replaceControl("IOS_CALLKIT_NATIVE_END_UNCONFIRMED", "_lib/communicationCallMediaPolicy.mjs", "return nativeEnded && exactIosAcceptedInvite(latest, expected)", "return exactIosAcceptedInvite(latest, expected)", "native end queue acknowledgement"),
  replaceControl("IOS_NATIVE_CLAIM_ROUTER_FAILURE_REPLAY", "_lib/nativeCallTransitionProvenance.mjs", "    nativeCallTransitionRegistry.consume({\n      action: \"answer\",\n      authenticatedUserId,\n      claimId: routed.claimId,\n      inviteId: routed.inviteId,\n      nativeIdentity: routed.callUuid,\n      platform: \"ios\",\n      source: \"ios_callkit_native_event\",\n      threadId: routed.threadId,\n    });\n", "", "router failure discard"),
  control("IOS_NATIVE_CLAIM_CREATOR_CALLSITE_UNEXPECTED", "components/UnsafeNativeClaimCreator.mjs", "import {createIosCallKitAnswerRouteHandler} from '../_lib/nativeCallTransitionProvenance.mjs';\ncreateIosCallKitAnswerRouteHandler({});\n"),
  control("IOS_NATIVE_CLAIM_CREATOR_ALIAS_IMPORT", "components/UnsafeAliasCreator.mjs", "import {createIosCallKitAnswerRouteHandler as aliasCreator} from '../_lib/nativeCallTransitionProvenance.mjs';\naliasCreator({});\n"),
  control("IOS_NATIVE_CLAIM_CREATOR_NAMESPACE_ACCESS", "components/UnsafeNamespaceCreator.mjs", "import * as provenance from '../_lib/nativeCallTransitionProvenance.mjs';\nprovenance.createIosCallKitAnswerRouteHandler({});\n"),
  control("IOS_NATIVE_CLAIM_CREATOR_COMPUTED_ACCESS", "components/UnsafeComputedCreator.mjs", "import * as provenance from '../_lib/nativeCallTransitionProvenance.mjs';\nprovenance['createIosCallKit'+'AnswerRouteHandler']({});\n"),
  control("IOS_NATIVE_CLAIM_CREATOR_CANONICAL_IMPORT_SUBSTITUTED", "app/_layout.tsx", `import {unsafeFactory as createIosCallKitAnswerRouteHandler} from '../_lib/unsafe.mjs';\n${replaceRequired(sources["app/_layout.tsx"], "  createIosCallKitAnswerRouteHandler,\n", "", "iOS creator canonical import")}`),
  control("IOS_FOREGROUND_CREATOR_CANONICAL_IMPORT_SUBSTITUTED", "app/chat/index.tsx", `import {unsafeFactory as createForegroundAuthenticatedUiCallIntent} from '../../_lib/unsafe.mjs';\n${replaceRequired(sources["app/chat/index.tsx"], "import { createForegroundAuthenticatedUiCallIntent } from \"../../_lib/nativeCallTransitionProvenance.mjs\";\n", "", "foreground creator canonical import")}`),
  control("IOS_NATIVE_CLAIM_FACTORY_ALIAS_IMPORT", "components/UnsafeFactory.mjs", "import {createNativeCallTransitionProvenanceRegistry as unsafe} from '../_lib/nativeCallTransitionProvenance.mjs';\nunsafe();\n"),
  control("IOS_NATIVE_CLAIM_GENERIC_CONSUMER_ALIAS_IMPORT", "components/UnsafeGenericConsumer.mjs", "import {consumeNativeCallTransitionClaim as unsafe} from '../_lib/nativeCallTransitionProvenance.mjs';\nunsafe({});\n"),
  control("IOS_NATIVE_CLAIM_TRUSTED_CONSUMER_NAMESPACE_ACCESS", "components/UnsafeConsumer.mjs", "import * as provenance from '../_lib/nativeCallTransitionProvenance.mjs';\nprovenance.consumeTrustedIosCallKitNativeEventClaim({});\n"),
  control("IOS_NATIVE_CLAIM_MOUNTED_CONSUMER_COMPUTED_ACCESS", "components/UnsafeMountedConsumer.mjs", "import * as provenance from '../_lib/nativeCallTransitionProvenance.mjs';\nprovenance['consumeMountedIos'+'NativeCallRoute']({});\n"),
  control("IOS_NATIVE_CLAIM_MOUNTED_CONSUMER_CANONICAL_IMPORT_SUBSTITUTED", "app/chat/[threadId].tsx", `import {unsafeConsume as consumeMountedIosNativeCallRoute} from '../../_lib/unsafe.mjs';\n${replaceRequired(sources["app/chat/[threadId].tsx"], "  consumeMountedIosNativeCallRoute,\n", "", "mounted consumer canonical import")}`),
  replaceControl("IOS_ACCEPTED_CALLKIT_MEDIA_NONERROR_SETTLEMENT", "_lib/communicationCallMediaPolicy.mjs", 'input?.channelState === "error"', "true", "non-error settlement"),
  replaceControl("IOS_ACCEPTED_CALLKIT_MEDIA_PROVIDER_MISMATCH", "_lib/communicationCallMediaPolicy.mjs", 'value === [descriptor?.authenticatedUserId, descriptor?.threadId, descriptor?.inviteId, descriptor?.roomId, descriptor?.callUuid, descriptor?.mediaProvider][index]', 'index === 5 || value === [descriptor?.authenticatedUserId, descriptor?.threadId, descriptor?.inviteId, descriptor?.roomId, descriptor?.callUuid, descriptor?.mediaProvider][index]', "provider binding"),
  replaceControl("IOS_ACCEPTED_CALLKIT_MEDIA_REPLAY", "_lib/communicationCallMediaPolicy.mjs", '  iosAcceptedMediaDescriptorStates.delete(descriptor); return {descriptor, status: "settled"};', '  iosAcceptedMediaDescriptorStates.set(descriptor, "active"); return {descriptor, status: "settled"};', "one-time media settlement"),
  replaceControl("IOS_ACCEPTED_CALLKIT_MEDIA_FAILED_TERMINAL_SETTLEMENT", "_lib/communicationCallMediaPolicy.mjs", 'if (!await Promise.resolve(operations.terminateAccepted(descriptor, "accepted_media_failed")).catch(() => false))', "if (false)", "terminal settlement gate"),
  replaceControl("IOS_ACCEPTED_CALLKIT_MEDIA_LOCAL_CLEAR_BEFORE_CONFIRMATION", "_lib/communicationCallMediaPolicy.mjs", 'if (!await Promise.resolve(operations.terminateAccepted(descriptor, "accepted_media_failed")).catch(() => false))', 'await operations.clearLocal(descriptor); if (!await Promise.resolve(operations.terminateAccepted(descriptor, "accepted_media_failed")).catch(() => false))', "confirmed local clearing"),
  replaceControl("IOS_ACCEPTED_CALLKIT_MEDIA_CONSUMED_BEFORE_TERMINAL_CONFIRMATION", "_lib/communicationCallMediaPolicy.mjs", 'iosAcceptedMediaDescriptorStates.set(descriptor, "active"); return {status: "retryable"}', 'iosAcceptedMediaDescriptorStates.delete(descriptor); return {status: "retryable"}', "retry-safe settlement consumption"),
];

for (const {code, overrides} of negativeControls.filter(({overrides}) => Object.keys(overrides)[0].endsWith(".mjs"))) {
  const source = Object.values(overrides)[0];
  assertParseableModuleSource(source, code);
}

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
