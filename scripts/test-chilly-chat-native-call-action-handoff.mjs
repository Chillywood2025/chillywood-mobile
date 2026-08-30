#!/usr/bin/env node

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, webcrypto } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";

import {
  consumeMountedAndroidNativeCallRoute,
  consumeMountedIosNativeCallRoute,
  registerTrustedAndroidNativeActionStorePayload,
  subscribeToTrustedAndroidNativeActionRoutes,
} from "../_lib/nativeCallTransitionProvenance.mjs";
import {
  resolveAuthoritativeNativeCallDecline,
  resolveChillyChatNativeCallActionPayload,
  resolveChillyChatNativeCallRoute,
} from "../_lib/chillyChatNativeCallRoutes.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const require = createRequire(import.meta.url);
const notificationPlugin = require("../plugins/withChillyChatNativeCallNotifications.js");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const threadId = "11111111-1111-4111-8111-111111111111";
const inviteId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const requestKey = createHash("sha256").update(`${threadId}:${inviteId}:answer`).digest("hex");
const read = (path) => fs.readFileSync(path, "utf8");

const payload = Object.freeze({
  callInviteId: inviteId,
  captureGeneration: 7,
  createdAt: 1_722_000_000_000,
  nativeCallAction: "answer",
  requestKey,
  schemaVersion: 2,
  threadId,
});

assert.deepEqual(resolveChillyChatNativeCallActionPayload(payload), payload);
for (const invalid of [
  {...payload, captureGeneration: 0},
  {...payload, captureGeneration: payload.createdAt},
  {...payload, nativeCallAction: "end"},
  {...payload, requestKey: "not-a-request-key"},
  {...payload, schemaVersion: 1},
  {...payload, threadId: "malformed"},
]) {
  assert.equal(resolveChillyChatNativeCallActionPayload(invalid), null);
}

const navigationOnly = resolveChillyChatNativeCallRoute(
  `chillywoodmobile://chat/${threadId}?callInviteId=${inviteId}&nativeCallAction=answer&nativeCallClaim=${"a".repeat(64)}`,
);
assert.equal(navigationOnly?.destination, `/chat/${threadId}`);
assert.equal(navigationOnly?.threadId, threadId);
assert.doesNotMatch(navigationOnly?.destination ?? "", /nativeCall|callInviteId/u);

const declinedInvite = Object.freeze({
  calleeUserId: userId,
  callerUserId: "44444444-4444-4444-8444-444444444444",
  id: inviteId,
  status: "declined",
  threadId,
});
assert.equal(resolveAuthoritativeNativeCallDecline({currentUserId: userId, expectedInviteId: inviteId, expectedThreadId: threadId, invite: declinedInvite}), declinedInvite);
for (const denied of [null, {...declinedInvite, status: "accepted"}, {...declinedInvite, status: "ringing"}, {...declinedInvite, threadId: "55555555-5555-4555-8555-555555555555"}]) {
  assert.equal(resolveAuthoritativeNativeCallDecline({currentUserId: userId, expectedInviteId: inviteId, expectedThreadId: threadId, invite: denied}), null);
}

const created = registerTrustedAndroidNativeActionStorePayload({
  ...payload,
  authenticated: true,
  authenticatedUserId: userId,
});
assert.equal(created.status, "created");
assert.match(created.claimId ?? "", /^[0-9a-f]{64}$/u);
assert.equal(created.action, "answer");
assert.doesNotMatch(created.destination ?? "", /nativeCallAction/u);
const consumed = consumeMountedAndroidNativeCallRoute({
  authenticatedUserId: userId,
  authLoading: false,
  claimId: created.claimId,
  inviteId,
  isSignedIn: true,
  platform: "android",
  requestKey,
  threadId,
});
assert.equal(consumed?.authenticatedUserId, userId);
assert.equal(consumed?.nativeEventGeneration, 7);
assert.equal(consumed?.nativePayloadSchemaVersion, 2);
assert.equal(consumed?.source, "android_native_action_store");
assert.equal(consumed?.consumed, true);
assert.equal(consumeMountedAndroidNativeCallRoute({
  authenticatedUserId: userId,
  authLoading: false,
  claimId: created.claimId,
  inviteId,
  isSignedIn: true,
  platform: "android",
  requestKey,
  threadId,
}), null, "a trusted Android claim must be one-time");
assert.equal(registerTrustedAndroidNativeActionStorePayload({
  ...payload,
  authenticated: true,
  authenticatedUserId: userId,
}).status, "duplicate", "duplicate native delivery must not extend authority");
assert.equal(consumeMountedIosNativeCallRoute({
  action: "answer",
  authenticatedUserId: userId,
  authLoading: false,
  callUuid: requestKey,
  claimId: created.claimId,
  inviteId,
  isSignedIn: true,
  platform: "ios",
  threadId,
}), null, "Android evidence cannot satisfy iOS provenance");

let warmClaim = null;
const unsubscribeWarm = subscribeToTrustedAndroidNativeActionRoutes((route) => {
  warmClaim = consumeMountedAndroidNativeCallRoute({
    authenticatedUserId: userId,
    authLoading: false,
    claimId: route.claimId,
    inviteId: route.inviteId,
    isSignedIn: true,
    platform: "android",
    requestKey: route.nativeIdentity,
    threadId,
  });
  return !!warmClaim;
});
const warmCreated = registerTrustedAndroidNativeActionStorePayload({
  ...payload,
  authenticated: true,
  authenticatedUserId: userId,
  captureGeneration: 8,
});
unsubscribeWarm();
assert.equal(warmCreated.status, "created");
assert.equal(warmCreated.mountedConsumed, true);
assert.equal(warmCreated.destination, undefined, "same-thread consumption must not replace/remount the route");
assert.equal(warmClaim?.nativeEventGeneration, 8);

const legacy = notificationPlugin.__test.composeLegacyBackupRules({});
const modern = notificationPlugin.__test.composeModernBackupRules({});
const existingLegacyInclude = {$: {domain: "file", path: "durable-control.json"}};
const existingLegacyExclude = {$: {domain: "database", path: "durable.db"}};
const composedLegacy = notificationPlugin.__test.composeLegacyBackupRules({
  "full-backup-content": {
    include: [existingLegacyInclude],
    exclude: [existingLegacyExclude],
  },
});
const existingModernInclude = {$: {domain: "file", path: "durable-control.json"}};
const existingModernExclude = {$: {domain: "database", path: "durable.db"}};
const composedModern = notificationPlugin.__test.composeModernBackupRules({
  "data-extraction-rules": {
    "cloud-backup": [{include: [existingModernInclude], exclude: [existingModernExclude]}],
    "device-transfer": [{include: [existingModernInclude], exclude: [existingModernExclude]}],
  },
});
const exactExclusion = (section) => section?.exclude?.filter((entry) => (
  entry?.$?.domain === "sharedpref"
  && entry?.$?.path === "chilly_chat_native_call_action_v1.xml"
)) ?? [];
assert.equal(exactExclusion(legacy["full-backup-content"]).length, 1);
assert.equal(exactExclusion(modern["data-extraction-rules"]["cloud-backup"][0]).length, 1);
assert.equal(exactExclusion(modern["data-extraction-rules"]["device-transfer"][0]).length, 1);
assert.equal(exactExclusion(modern["data-extraction-rules"]["cross-platform-transfer"][0]).length, 1);
assert.equal(modern["data-extraction-rules"]["cross-platform-transfer"][0].$.platform, "ios");
assert.deepEqual(composedLegacy["full-backup-content"].include, [existingLegacyInclude]);
assert.ok(composedLegacy["full-backup-content"].exclude.some((entry) => entry.$.path === "durable.db"));
for (const sectionName of ["cloud-backup", "device-transfer"]) {
  const section = composedModern["data-extraction-rules"][sectionName][0];
  assert.deepEqual(section.include, [existingModernInclude]);
  assert.ok(section.exclude.some((entry) => entry.$.path === "durable.db"));
}
assert.deepEqual(notificationPlugin.__test.composeLegacyBackupRules(legacy), legacy);
assert.deepEqual(notificationPlugin.__test.composeModernBackupRules(modern), modern);
for (const compose of [
  () => notificationPlugin.__test.composeLegacyBackupRules({"full-backup-content": {exclude: {}}}),
  () => notificationPlugin.__test.composeLegacyBackupRules({"full-backup-content": {include: {}}}),
  () => notificationPlugin.__test.composeModernBackupRules({"data-extraction-rules": {"cloud-backup": [{exclude: {}}]}}),
  () => notificationPlugin.__test.composeModernBackupRules({"data-extraction-rules": {"device-transfer": [{include: {}}]}}),
]) {
  assert.throws(compose, (error) => error?.code === "ANDROID_BACKUP_RULE_COMPOSITION_CONFLICT");
}
assert.throws(
  () => notificationPlugin.__test.composeModernBackupRules({
    "data-extraction-rules": {"unsupported-backup-domain": [{}]},
  }),
  (error) => error?.code === "ANDROID_BACKUP_RULE_COMPOSITION_CONFLICT",
);

const baseSources = Object.freeze({
  buffer: read("_lib/chillyChatNativeCallRouteBuffer.ts"),
  layout: read("app/_layout.tsx"),
  nativeIntent: read("app/+native-intent.tsx"),
  plugin: read("plugins/withChillyChatNativeCallNotifications.js"),
  policy: read("_lib/communicationCallMediaPolicy.mjs"),
  provenance: read("_lib/nativeCallTransitionProvenance.mjs"),
  routes: read("_lib/chillyChatNativeCallRoutes.mjs"),
  thread: read("app/chat/[threadId].tsx"),
});
const cloneSources = () => ({...baseSources});
const count = (value, pattern) => [...value.matchAll(pattern)].length;

const validateD2BSource = (source) => {
  const failures = [];
  const requireSource = (condition, code) => { if (!condition) failures.push(code); };
  const trustedLaunch = source.plugin.match(/fun launchAfterTrustedAction[\s\S]*?context\.startActivity\(intent\)/u)?.[0] ?? "";
  const activityIntentHandler = source.plugin.match(/override fun onNewIntent\(intent: Intent\) \{[\s\S]*?\n  \}/u)?.[0] ?? "";
  const provenanceConsume = source.provenance.match(/consume\(expected\) \{[\s\S]*?\n    \},\n    inspectCounts/u)?.[0] ?? "";
  requireSource(source.plugin.includes("function composeLegacyBackupRules") && source.plugin.includes('android:fullBackupContent'), "ANDROID_NATIVE_ACTION_LEGACY_BACKUP_EXCLUSION_MISSING");
  requireSource(source.plugin.includes('ensureModernBackupSection(root, "cloud-backup")'), "ANDROID_NATIVE_ACTION_CLOUD_BACKUP_EXCLUSION_MISSING");
  requireSource(source.plugin.includes('ensureModernBackupSection(root, "device-transfer")'), "ANDROID_NATIVE_ACTION_DEVICE_TRANSFER_EXCLUSION_MISSING");
  requireSource(source.plugin.includes('ensureModernBackupSection(root, "cross-platform-transfer")'), "ANDROID_NATIVE_ACTION_CROSS_PLATFORM_TRANSFER_EXCLUSION_MISSING");
  requireSource(source.plugin.includes("val answerIntent = buildActionPendingIntent(context, data, ACTION_ANSWER, 1)") && !source.plugin.includes("buildActivityPendingIntent(context, data, \"answer\""), "ANDROID_NATIVE_ANSWER_ACTIVITY_ORIGIN_UNSAFE");
  requireSource(source.plugin.includes('"android:exported": "false",\n      "android:name": ".ChillyChatCallNotificationActionReceiver"'), "ANDROID_NATIVE_ACTION_RECEIVER_EXPORTED");
  requireSource(source.plugin.includes("PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE") && !source.plugin.includes("PendingIntent.FLAG_MUTABLE"), "ANDROID_NATIVE_ACTION_PENDING_INTENT_MUTABLE");
  requireSource(!source.plugin.includes("captureForActivity") && !activityIntentHandler.includes("captureTrustedNotificationAction"), "ANDROID_NATIVE_ACTION_ACTIVITY_ORIGIN_ACCEPTED");
  const productionProvenance = `${source.provenance}\n${source.buffer}\n${source.layout}\n${source.routes}\n${source.nativeIntent}`;
  requireSource(count(productionProvenance, /registerTrustedAndroidNativeActionStorePayload/gu) === 3 && !source.layout.includes("registerTrustedAndroidNativeActionStorePayload") && !source.buffer.includes("Linking.addEventListener"), "ANDROID_NATIVE_ACTION_LINKING_ORIGIN_ACCEPTED");
  requireSource(source.policy.includes('if (input?.authority !== "trusted_native_claim") return false;\n  const claim = input?.trustedNativeClaim;\n  if (!claim || claim.consumed !== true) return false;') && source.policy.includes("isAttestedNativeCallTransitionClaim"), "ANDROID_NATIVE_ACTION_ROUTE_PROVENANCE_MISSING");
  requireSource(
    source.provenance.includes("nativePayloadSchemaVersion: input?.schemaVersion")
      && source.provenance.includes("nativePayloadSchemaVersion !== sourcePolicy.nativePayloadSchemaVersion")
      && source.policy.includes("isAttestedNativeCallTransitionClaim(claim)"),
    "ANDROID_NATIVE_ACTION_SCHEMA_BINDING_MISSING",
  );
  requireSource(count(provenanceConsume, /activeClaims\.delete\(claimId\)/gu) === 1 && provenanceConsume.indexOf("activeClaims.delete(claimId)") < provenanceConsume.indexOf("return consumedClaim"), "ANDROID_NATIVE_ACTION_PROVENANCE_REPLAY");
  requireSource(!/AsyncStorage|SecureStore|UserDefaults|localStorage/u.test(source.provenance), "ANDROID_NATIVE_ACTION_PROVENANCE_PERSISTENCE_INVALID");
  requireSource(trustedLaunch.indexOf("captureTrustedNotificationAction(") >= 0 && trustedLaunch.indexOf("captureTrustedNotificationAction(") < trustedLaunch.search(/context\.startActivity\(/u), "ANDROID_ACTION_PERSISTENCE_ORDER_INVALID");
  requireSource(source.plugin.includes("storedSchemaVersion != SCHEMA_VERSION") && source.plugin.includes("preferences.edit().clear().commit()") && source.plugin.includes("KEY_CAPTURE_GENERATION_COUNTER"), "ANDROID_RESTORED_NATIVE_ACTION_ACCEPTED");
  requireSource(!/updateChillyChatCallInviteStatus|acceptChillyChat|transition[_-]chilly|chilly-chat-call-transition/u.test(source.plugin), "ANDROID_NATIVE_SERVER_AUTHORITY_VIOLATION");
  requireSource(!/getCommunicationRoomToken|livekit-token|setMicrophoneEnabled|startAudioSession|startMedia|MODE_IN_COMMUNICATION/u.test(source.plugin), "ANDROID_PREACCEPT_MEDIA_AUTHORITY_VIOLATION");
  requireSource(/android_native_action_store: Object\.freeze\(\{[\s\S]{0,160}platform: "android"/u.test(source.provenance) && /ios_callkit_native_event: Object\.freeze\(\{[\s\S]{0,160}platform: "ios"/u.test(source.provenance) && source.policy.includes("claim.platform === platform") && source.policy.includes("claim.source === expectedSource") && source.policy.includes('claim.platform === "ios"'), "PLATFORM_PROOF_SCOPE_MISMATCH");
  requireSource(source.routes.includes('invite.status !== "declined"') && source.thread.includes("requestAuthoritativeIncomingCallDecline") && source.thread.includes("resolveAuthoritativeNativeCallDecline") && !source.thread.includes("declinedInvite ?? invite"), "ANDROID_NATIVE_DECLINE_SERVER_AUTHORITY_ACK_MISSING");
  requireSource(source.provenance.includes("mountedConsumed") && source.thread.includes("return true;") && source.layout.includes("nativeCallRoute?.destination"), "ANDROID_NATIVE_ACTION_WARM_ROUTE_REPLACED");
  requireSource(source.thread.includes('useFocusEffect(\n    useCallback(() => {\n      if (Platform.OS !== "android")'), "ANDROID_NATIVE_ACTION_HIDDEN_SCREEN_CONSUMER");
  requireSource(
    source.plugin.includes("ActivityEventListener")
      && source.plugin.includes("internal fun shouldEmitPendingAction(intent: Intent, status: String): Boolean")
      && source.plugin.includes("intent.action == Intent.ACTION_MAIN")
      && source.plugin.includes("intent.data == null")
      && source.plugin.includes('status == "present"')
      && source.plugin.includes("if (!shouldEmitPendingAction(intent, ChillyChatNativeCallActionStore.readStatus(reactContext))) return")
      && source.plugin.includes('.emit(EVENT_PENDING_ACTION_AVAILABLE, null)')
      && source.buffer.includes('DeviceEventEmitter.addListener(\n    "pendingNativeCallActionAvailable"')
      && source.layout.includes('subscribeToPendingAndroidNativeCallActionAvailability(\n        () => {\n          if (AppState.currentState === "active")'),
    "ANDROID_NATIVE_ACTION_WARM_WAKE_MISSING",
  );
  requireSource(
    source.plugin.includes("intent.action == Intent.ACTION_MAIN")
      && source.plugin.includes("intent.data == null")
      && source.plugin.includes('status == "present"'),
    "ANDROID_NATIVE_ACTION_WARM_WAKE_PREDICATE_UNSAFE",
  );
  requireSource(source.layout.includes('throw new Error("Android native call route unavailable.")') && !source.layout.includes("throw routeError"), "ANDROID_NATIVE_ACTION_CLAIM_DISCLOSURE");
  return failures;
};

assert.deepEqual(validateD2BSource(baseSources), []);
const provenanceModuleUrl = new URL("../_lib/nativeCallTransitionProvenance.mjs", import.meta.url).href;
const roomIdentifierModuleUrl = new URL("../_lib/communicationRoomIdentifier.mjs", import.meta.url).href;
const importMutatedModule = async (source, tag) => import(
  `data:text/javascript;base64,${Buffer.from(source.replace(
    'from "./communicationRoomIdentifier.mjs";',
    `from "${roomIdentifierModuleUrl}";`,
  )).toString("base64")}#${tag}`
);
const policyForMutation = baseSources.policy.replace(
  'from "./nativeCallTransitionProvenance.mjs";',
  `from "${provenanceModuleUrl}";`,
).replace(
  'from "./communicationRoomIdentifier.mjs";',
  `from "${roomIdentifierModuleUrl}";`,
);
const routeOnlyPolicy = await importMutatedModule(policyForMutation.replace(
  'if (input?.authority !== "trusted_native_claim") return false;\n  const claim = input?.trustedNativeClaim;\n  if (!claim || claim.consumed !== true) return false;',
  'if (input?.authority !== "trusted_native_claim") return Boolean(input?.callInviteId && input?.nativeCallAction);\n  const claim = input?.trustedNativeClaim;\n  if (!claim || claim.consumed !== true) return false;',
), "route-only");
assert.equal(routeOnlyPolicy.doesNativeCallActionOwnTransition({authority: "none", callInviteId: inviteId, nativeCallAction: "answer"}), true);
const crossPlatformPolicy = await importMutatedModule(policyForMutation.replace(
  "    && claim.platform === platform\n    && claim.source === expectedSource\n",
  "",
), "cross-platform");
assert.equal(crossPlatformPolicy.doesNativeCallActionOwnTransition({
  authority: "trusted_native_claim",
  callInviteId: inviteId,
  currentUserId: userId,
  monotonicNowMs: consumed.consumedAtMonotonicMs + 1,
  nativeCallAction: "answer",
  nativeIdentity: requestKey,
  platform: "ios",
  threadId,
  trustedNativeClaim: consumed,
}), true, "removing platform/source binding must demonstrably reuse Android proof as iOS authority");
const replayProvenance = await importMutatedModule(baseSources.provenance.replace(
  "activeClaims.delete(claimId);\n      activeEventKeys.delete(claim.eventKey);\n      const consumedClaim",
  "const consumedClaim",
), "replay");
let replayNow = 100;
const replayRegistry = replayProvenance.createNativeCallTransitionProvenanceRegistry({claimIdFactory: () => "e".repeat(64), now: () => replayNow});
const replayCreated = replayRegistry.create({action: "answer", authenticatedUserId: userId, inviteId, nativeEventGeneration: 1, nativeIdentity: "f".repeat(64), nativePayloadSchemaVersion: 2, platform: "android", source: "android_native_action_store", threadId});
const replayExpected = {action: "answer", authenticatedUserId: userId, claimId: replayCreated.claimId, inviteId, nativeIdentity: "f".repeat(64), platform: "android", source: "android_native_action_store", threadId};
assert.ok(replayRegistry.consume(replayExpected));
replayNow += 1;
assert.ok(replayRegistry.consume(replayExpected), "removing atomic deletion must demonstrably allow a second consumption");
const externalLink = new URL(`chillywoodmobile://chat/${"66666666-6666-4666-8666-666666666666"}?authenticatedUserId=${userId}&callInviteId=${"77777777-7777-4777-8777-777777777777"}&captureGeneration=91&nativeCallAction=answer&requestKey=${"9".repeat(64)}&schemaVersion=2`);
const linkingAuthority = registerTrustedAndroidNativeActionStorePayload({
  authenticated: true,
  authenticatedUserId: externalLink.searchParams.get("authenticatedUserId"),
  callInviteId: externalLink.searchParams.get("callInviteId"),
  captureGeneration: Number(externalLink.searchParams.get("captureGeneration")),
  nativeCallAction: externalLink.searchParams.get("nativeCallAction"),
  requestKey: externalLink.searchParams.get("requestKey"),
  schemaVersion: Number(externalLink.searchParams.get("schemaVersion")),
  threadId: externalLink.pathname.slice(1),
});
assert.equal(linkingAuthority.status, "created", "a privileged Linking callsite would demonstrably manufacture authority from an external URL");
const receiverAuthorityModel = (operation) => {
  const effects = {accepted: false, mediaStarted: false, tokenRequested: false};
  operation(effects);
  return effects;
};
assert.equal(receiverAuthorityModel((effects) => { effects.accepted = true; }).accepted, true);
assert.deepEqual(receiverAuthorityModel((effects) => { effects.tokenRequested = true; effects.mediaStarted = true; }), {accepted: false, mediaStarted: true, tokenRequested: true});
const executableMutantCodes = [
  "ANDROID_NATIVE_ACTION_LINKING_ORIGIN_ACCEPTED",
  "ANDROID_NATIVE_ACTION_ROUTE_PROVENANCE_MISSING",
  "ANDROID_NATIVE_ACTION_PROVENANCE_REPLAY",
  "ANDROID_NATIVE_SERVER_AUTHORITY_VIOLATION",
  "ANDROID_PREACCEPT_MEDIA_AUTHORITY_VIOLATION",
  "PLATFORM_PROOF_SCOPE_MISMATCH",
];
const mutants = [
  ["ANDROID_NATIVE_ACTION_LEGACY_BACKUP_EXCLUSION_MISSING", "plugin", "composeLegacyBackupRules", "composeRemovedLegacyRules"],
  ["ANDROID_NATIVE_ACTION_CLOUD_BACKUP_EXCLUSION_MISSING", "plugin", 'ensureModernBackupSection(root, "cloud-backup")', "void 0"],
  ["ANDROID_NATIVE_ACTION_DEVICE_TRANSFER_EXCLUSION_MISSING", "plugin", 'ensureModernBackupSection(root, "device-transfer")', "void 0"],
  ["ANDROID_NATIVE_ANSWER_ACTIVITY_ORIGIN_UNSAFE", "plugin", "val answerIntent = buildActionPendingIntent(context, data, ACTION_ANSWER, 1)", 'val answerIntent = buildActivityPendingIntent(context, data, "answer", 1)'],
  ["ANDROID_NATIVE_ACTION_RECEIVER_EXPORTED", "plugin", '"android:exported": "false",\n      "android:name": ".ChillyChatCallNotificationActionReceiver"', '"android:exported": "true",\n      "android:name": ".ChillyChatCallNotificationActionReceiver"'],
  ["ANDROID_NATIVE_ACTION_PENDING_INTENT_MUTABLE", "plugin", "PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE", "PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE"],
  ["ANDROID_NATIVE_ACTION_ACTIVITY_ORIGIN_ACCEPTED", "plugin", "override fun onNewIntent(intent: Intent) {\n    if (!shouldEmitPendingAction", "override fun onNewIntent(intent: Intent) {\n    ChillyChatNativeCallActionStore.captureTrustedNotificationAction(reactContext, intent.data?.getQueryParameter(\"threadId\"), intent.data?.getQueryParameter(\"callInviteId\"), intent.data?.getQueryParameter(\"nativeCallAction\"))\n    if (!shouldEmitPendingAction"],
  ["ANDROID_NATIVE_ACTION_LINKING_ORIGIN_ACCEPTED", "buffer", 'import { DeviceEventEmitter, NativeModules, Platform } from "react-native";', 'import { DeviceEventEmitter, Linking, NativeModules, Platform } from "react-native";\nLinking.addEventListener("url", ({url}) => { const parsed = new URL(url); registerTrustedAndroidNativeActionStorePayload({authenticated: true, authenticatedUserId: parsed.searchParams.get("authenticatedUserId"), callInviteId: parsed.searchParams.get("callInviteId"), captureGeneration: Number(parsed.searchParams.get("captureGeneration")), nativeCallAction: parsed.searchParams.get("nativeCallAction"), requestKey: parsed.searchParams.get("requestKey"), schemaVersion: Number(parsed.searchParams.get("schemaVersion")), threadId: parsed.pathname.slice(1)}); });'],
  ["ANDROID_NATIVE_ACTION_ROUTE_PROVENANCE_MISSING", "policy", 'if (input?.authority !== "trusted_native_claim") return false;\n  const claim = input?.trustedNativeClaim;\n  if (!claim || claim.consumed !== true) return false;', 'if (input?.authority !== "trusted_native_claim") return Boolean(input?.callInviteId && input?.nativeCallAction);\n  const claim = input?.trustedNativeClaim;\n  if (!claim || claim.consumed !== true) return false;'],
  ["ANDROID_NATIVE_ACTION_PROVENANCE_REPLAY", "provenance", "activeClaims.delete(claimId);\n      activeEventKeys.delete(claim.eventKey);\n      const consumedClaim", "const consumedClaim"],
  ["ANDROID_NATIVE_ACTION_PROVENANCE_PERSISTENCE_INVALID", "provenance", "const nativeCallTransitionRegistry", "AsyncStorage.setItem(\"native-call-claim\", \"unsafe\");\nconst nativeCallTransitionRegistry"],
  ["ANDROID_ACTION_PERSISTENCE_ORDER_INVALID", "plugin", "if (!ChillyChatNativeCallActionStore.captureTrustedNotificationAction(", "context.startActivity(Intent())\n    if (!ChillyChatNativeCallActionStore.captureTrustedNotificationAction("],
  ["ANDROID_RESTORED_NATIVE_ACTION_ACCEPTED", "plugin", "storedSchemaVersion != SCHEMA_VERSION", "storedSchemaVersion == SCHEMA_VERSION"],
  ["ANDROID_NATIVE_SERVER_AUTHORITY_VIOLATION", "plugin", "ChillyChatCallNotifications.launchAfterTrustedAction(context, inviteId, threadId, nativeAction)", "java.net.URL(\"https://invalid.local/chilly-chat-call-transition\").readText()\n    ChillyChatCallNotifications.launchAfterTrustedAction(context, inviteId, threadId, nativeAction)"],
  ["ANDROID_PREACCEPT_MEDIA_AUTHORITY_VIOLATION", "plugin", "ChillyChatCallNotifications.launchAfterTrustedAction(context, inviteId, threadId, nativeAction)", "java.net.URL(\"https://invalid.local/livekit-token\").readText()\n    (context.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager).mode = android.media.AudioManager.MODE_IN_COMMUNICATION\n    ChillyChatCallNotifications.launchAfterTrustedAction(context, inviteId, threadId, nativeAction)"],
  ["PLATFORM_PROOF_SCOPE_MISMATCH", "policy", "    && claim.platform === platform\n    && claim.source === expectedSource\n", ""],
  ["ANDROID_NATIVE_DECLINE_SERVER_AUTHORITY_ACK_MISSING", "routes", 'invite.status !== "declined"', 'false'],
  ["ANDROID_NATIVE_ACTION_SCHEMA_BINDING_MISSING", "provenance", "nativePayloadSchemaVersion !== sourcePolicy.nativePayloadSchemaVersion", "false"],
  ["ANDROID_NATIVE_ACTION_WARM_ROUTE_REPLACED", "layout", "nativeCallRoute?.destination", "nativeCallRoute"],
  ["ANDROID_NATIVE_ACTION_HIDDEN_SCREEN_CONSUMER", "thread", 'useFocusEffect(\n    useCallback(() => {\n      if (Platform.OS !== "android")', 'useEffect(() => {\n      if (Platform.OS !== "android")'],
  ["ANDROID_NATIVE_ACTION_WARM_WAKE_MISSING", "layout", 'subscribeToPendingAndroidNativeCallActionAvailability(\n        () => {\n          if (AppState.currentState === "active")', 'void (\n        () => {\n          if (AppState.currentState === "active")'],
  ["ANDROID_NATIVE_ACTION_WARM_WAKE_PREDICATE_UNSAFE", "plugin", 'status == "present"', "true"],
  ["ANDROID_NATIVE_ACTION_CLAIM_DISCLOSURE", "layout", 'throw new Error("Android native call route unavailable.")', "throw routeError"],
];

for (const [code, file, before, after] of mutants) {
  const source = cloneSources();
  assert.ok(source[file].includes(before), `${code} mutant anchor must exist`);
  source[file] = source[file].replace(before, after);
  assert.ok(validateD2BSource(source).includes(code), `${code} mutant must fail closed`);
}

const mandatoryNegativeControls = [
  "ANDROID_NATIVE_ACTION_LEGACY_BACKUP_EXCLUSION_MISSING",
  "ANDROID_NATIVE_ACTION_CLOUD_BACKUP_EXCLUSION_MISSING",
  "ANDROID_NATIVE_ACTION_DEVICE_TRANSFER_EXCLUSION_MISSING",
  "ANDROID_NATIVE_ANSWER_ACTIVITY_ORIGIN_UNSAFE",
  "ANDROID_NATIVE_ACTION_RECEIVER_EXPORTED",
  "ANDROID_NATIVE_ACTION_PENDING_INTENT_MUTABLE",
  "ANDROID_NATIVE_ACTION_ACTIVITY_ORIGIN_ACCEPTED",
  "ANDROID_NATIVE_ACTION_LINKING_ORIGIN_ACCEPTED",
  "ANDROID_NATIVE_ACTION_ROUTE_PROVENANCE_MISSING",
  "ANDROID_NATIVE_ACTION_PROVENANCE_REPLAY",
  "ANDROID_NATIVE_ACTION_PROVENANCE_PERSISTENCE_INVALID",
  "ANDROID_ACTION_PERSISTENCE_ORDER_INVALID",
  "ANDROID_RESTORED_NATIVE_ACTION_ACCEPTED",
  "ANDROID_NATIVE_SERVER_AUTHORITY_VIOLATION",
  "ANDROID_PREACCEPT_MEDIA_AUTHORITY_VIOLATION",
  "PLATFORM_PROOF_SCOPE_MISMATCH",
];
const executedControlCodes = mutants.map(([code]) => code).sort();
assert.deepEqual(mandatoryNegativeControls.filter((code) => !executedControlCodes.includes(code)), []);
assert.deepEqual(executableMutantCodes.filter((code) => !executedControlCodes.includes(code)), []);

assert.doesNotMatch(baseSources.plugin, /putString\([^\n]*(?:access_token|refresh_token|livekit_token|credential)/iu);
assert.doesNotMatch(baseSources.provenance, /console\.|AsyncStorage|SecureStore|UserDefaults/iu);
assert.doesNotMatch(baseSources.routes, /console\.|access_token|refresh_token/iu);
assert.ok(UUID_PATTERN.test(userId));
console.log(`Chi'lly Chat Android native action origin, backup, and negative controls passed (${mutants.length}/${mutants.length}; required ${mandatoryNegativeControls.length}/${mandatoryNegativeControls.length}).`);
console.log(`D2B_NEGATIVE_CONTROL_RESULT ${JSON.stringify({executedControlCodes, passed: mutants.length, requiredControlCodes: mandatoryNegativeControls, total: mutants.length})}`);
console.log(`D2B_EXECUTABLE_MUTANT_RESULT ${JSON.stringify({codes: executableMutantCodes, passed: executableMutantCodes.length, total: executableMutantCodes.length})}`);
