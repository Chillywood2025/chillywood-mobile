import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const failures = [];
const requireText = (source, marker, message) => {
  if (!source.includes(marker)) failures.push(message);
};
const rejectText = (source, marker, message) => {
  if (source.includes(marker)) failures.push(message);
};
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const trackedProductionPaths = execFileSync("git", ["ls-files", "-z"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).split("\0").filter((path) => (
  /^(?:_lib|app|components|hooks|modules|plugins)\//u.test(path)
  && /\.(?:cjs|js|jsx|mjs|ts|tsx)$/u.test(path)
  && !path.endsWith(".d.ts")
  && !/(?:^|\/)(?:__tests__|fixtures?|test|tests)(?:\/|$)|\.(?:spec|test)\.[^.]+$/u.test(path)
));
const trackedProductionSources = Object.fromEntries(trackedProductionPaths.map((path) => [
  path,
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
]));
const PROVENANCE_CREATOR_POLICIES = Object.freeze({
  registerTrustedAndroidNativeActionStorePayload: Object.freeze({
    "_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1}),
    "_lib/chillyChatNativeCallRouteBuffer.ts": Object.freeze({calls: 1, references: 2, specifier: "./nativeCallTransitionProvenance.mjs"}),
  }),
  consumeTrustedAndroidNativeActionStoreClaim: Object.freeze({
    "_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 2}),
    "app/_layout.tsx": Object.freeze({calls: 2, references: 3, specifier: "../_lib/nativeCallTransitionProvenance.mjs"}),
  }),
  consumeMountedAndroidNativeCallRoute: Object.freeze({
    "_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1}),
    "app/chat/[threadId].tsx": Object.freeze({calls: 2, references: 3, specifier: "../../_lib/nativeCallTransitionProvenance.mjs"}),
  }),
  subscribeToTrustedAndroidNativeActionRoutes: Object.freeze({
    "_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1}),
    "app/chat/[threadId].tsx": Object.freeze({calls: 1, references: 2, specifier: "../../_lib/nativeCallTransitionProvenance.mjs"}),
  }),
  consumeNativeCallTransitionClaim: Object.freeze({
    "_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1}),
  }),
  createNativeCallTransitionProvenanceRegistry: Object.freeze({
    "_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 2}),
  }),
  createForegroundAuthenticatedUiCallIntentRegistry: Object.freeze({
    "_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 2}),
  }),
  consumeTrustedIosCallKitNativeEventClaim: Object.freeze({
    "_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 2}),
  }),
  consumeMountedIosNativeCallRoute: Object.freeze({
    "_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1}),
    "app/chat/[threadId].tsx": Object.freeze({references: 3, specifier: "../../_lib/nativeCallTransitionProvenance.mjs"}),
  }),
  consumeMountedForegroundAuthenticatedUiCallRoute: Object.freeze({
    "_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1}),
    "app/chat/[threadId].tsx": Object.freeze({references: 3, specifier: "../../_lib/nativeCallTransitionProvenance.mjs"}),
  }),
  createForegroundAuthenticatedUiCallIntent: Object.freeze({
    "_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1}),
    "app/_layout.tsx": Object.freeze({references: 2, specifier: "../_lib/nativeCallTransitionProvenance.mjs"}),
    "app/chat/index.tsx": Object.freeze({references: 2, specifier: "../../_lib/nativeCallTransitionProvenance.mjs"}),
    "app/profile/[userId].tsx": Object.freeze({references: 2, specifier: "../../_lib/nativeCallTransitionProvenance.mjs"}),
  }),
  createIosCallKitAnswerRouteHandler: Object.freeze({
    "_lib/nativeCallTransitionProvenance.mjs": Object.freeze({references: 1}),
    "app/_layout.tsx": Object.freeze({references: 2, specifier: "../_lib/nativeCallTransitionProvenance.mjs"}),
  }),
});
const stripComments = (source) => String(source)
  .replace(/\/\*[\s\S]*?\*\//gu, "")
  .replace(/(^|[^:])\/\/.*$/gmu, "$1");
const countSymbolReferences = (source, symbol) => (
  stripComments(source).match(new RegExp(`\\b${symbol}\\b`, "gu")) ?? []
).length;
const containsComputedSymbolReference = (source, symbol) => {
  const uncommented = stripComments(source);
  const withoutDirectReferences = uncommented.split(symbol).join("");
  return withoutDirectReferences.replace(/[^A-Za-z0-9_$]/gu, "").includes(symbol);
};
const hasExactCreatorImport = (source, symbol, specifier) => (
  (stripComments(source).match(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/gu) ?? [])
    .filter((declaration) => {
      const importedFrom = declaration.match(/from\s*["']([^"']+)["']/u)?.[1] ?? "";
      const bindings = declaration.match(/\{([\s\S]*?)\}/u)?.[1]
        ?.split(",").map((binding) => binding.trim()).filter(Boolean) ?? [];
      return importedFrom === specifier && bindings.includes(symbol);
    }).length === 1
);
const provenanceCreatorAllowlistPasses = (productionSources) => Object.entries(PROVENANCE_CREATOR_POLICIES)
  .every(([symbol, expectedByPath]) => {
    if (Object.entries(expectedByPath).some(([path, expected]) => (
      countSymbolReferences(productionSources[path] ?? "", symbol) !== expected.references
      || (!!expected.specifier && !hasExactCreatorImport(productionSources[path] ?? "", symbol, expected.specifier))
    ))) return false;
    return Object.entries(productionSources).every(([path, source]) => {
      if (Object.hasOwn(expectedByPath, path)) {
        if (containsComputedSymbolReference(source, symbol)) return false;
        if (path !== "_lib/nativeCallTransitionProvenance.mjs") {
          const directCalls = stripComments(source).match(new RegExp(`\\b${symbol}\\s*\\(`, "gu")) ?? [];
          return directCalls.length === (expectedByPath[path].calls ?? 1);
        }
        return true;
      }
      return countSymbolReferences(source, symbol) === 0
        && !containsComputedSymbolReference(source, symbol);
    });
  });

const plugin = read("plugins/withChillyChatIosNativeCalls.js");
const appConfig = read("app.config.ts");
const coordinator = read("modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift");
const moduleSource = read("modules/chillywood-native-calls/ios/ChillywoodNativeCallsModule.swift");
const facade = read("_lib/iosNativeCalls.ts");
const rootLayout = read("app/_layout.tsx");
const chatThread = read("app/chat/[threadId].tsx");
const communicationSession = read("hooks/use-communication-room-session.ts");
const nativeMediaPolicy = read("_lib/communicationCallMediaPolicy.mjs");
const provenance = read("_lib/nativeCallTransitionProvenance.mjs");
const nativeIntent = read("app/+native-intent.tsx");
const settings = read("app/settings.tsx");
const callInvites = read("_lib/chillyChatCalls.ts");
const easConfig = JSON.parse(read("eas.json"));
const migration = read("supabase/migrations/20260715150522_ios_voip_push_token_foundation.sql");
const sessionAuthorityMigration = read("supabase/migrations/202608250003_ios_voip_session_authority_closure.sql");
const tokenFunction = read("supabase/functions/ios-voip-push-tokens/index.ts");
const dispatchFunction = read("supabase/functions/ios-voip-call-dispatch/index.ts");
const notifications = read("_lib/notifications.ts");
const retryFunction = read("supabase/functions/chilly-chat-call-transition-retry/index.ts");
const retryMigration = read("supabase/migrations/20260718113000_durable_call_delivery_retry_and_storefront_prices.sql");
const voipPolicy = read("supabase/functions/_shared/ios-voip-policy.mjs");
const config = read("supabase/config.toml");
const androidPlugin = read("plugins/withChillyChatNativeCallNotifications.js");
const internalV2Publisher = read("scripts/publish-internal-v2-ota.mjs");
const internalV2Proof = read("scripts/proof-internal-v2-ota-config.mjs");

requireText(plugin, "IOS_NATIVE_CALLS_ENABLED", "iOS native-call capabilities must require the build-time flag.");
requireText(plugin, "ChillywoodNativeCallsBuildEnabled", "The native module must receive the fail-closed build flag.");
requireText(plugin, "ChillywoodNativeCallsRuntimeDefaultEnabled", "The native module must receive the fail-closed runtime default.");
requireText(plugin, "if (enabled)", "VoIP background modes must be conditional.");
for (const mode of ["audio", "remote-notification", "voip"]) {
  requireText(plugin, `\"${mode}\"`, `The conditional iOS plugin must declare ${mode} readiness.`);
}

for (const framework of ["CallKit", "PushKit", "AVFAudio"]) {
  requireText(coordinator, `import ${framework}`, `The native bridge must use ${framework}.`);
}
for (const event of ["answerRequested", "answered", "declined", "timeout", "providerReset", "audioSessionActivated", "audioInterruptionBegan"]) {
  requireText(coordinator, `\"${event}\"`, `The native bridge must expose ${event} lifecycle state.`);
}
requireText(coordinator, "existing = activeCalls.values.first", "Duplicate incoming invites must reuse the active CallKit call.");
requireText(coordinator, "reportNewIncomingCall", "PushKit delivery must immediately report an incoming CallKit call.");
requireText(coordinator, "startVoipRegistrationOnMain()", "PushKit registration must be prepared from application launch for terminated delivery.");
requireText(coordinator, "terminalInvitesDefaultsKey", "Caller-cancel ordering must persist a bounded native tombstone across cold launch.");
requireText(coordinator, "reportInvalidVoipPushOnMain", "Every received VoIP push path must satisfy Apple's CallKit reporting contract.");
requireText(coordinator, "pendingAnswerActions", "CallKit answer actions must remain pending until media connection acknowledgement.");
requireText(coordinator, "activeCallsDefaultsKey", "Non-secret active call descriptors must support bounded process recovery.");
requireText(coordinator, "pendingEventsDefaultsKey", "Sanitized native call events must survive cold-start bridge hydration.");
requireText(coordinator, "NativeVoipAuthority", "Terminated PushKit delivery must retain only an exact account/session/install binding.");
requireText(coordinator, "voipPayloadMatchesPersistedAuthority", "Native CallKit presentation must reject a provider payload for another account/session/install.");
requireText(coordinator, "resetAccountContextOnMain", "Logout and account switch must end stale CallKit state and clear persisted descriptors.");
requireText(coordinator, "completion?(error)", "PushKit completion must wait for CallKit reporting.");
requireText(coordinator, "#if DEBUG", "The local CallKit trigger must compile only in debug builds.");
rejectText(coordinator, "AVCapture", "The native incoming-call bridge must not activate a camera before answer.");
requireText(moduleSource, "stopVoipRegistrationAsync", "The native bridge must support logout/account-transition teardown.");
requireText(moduleSource, "completeAnswerAsync", "The native bridge must acknowledge CallKit answer only after media connection.");
requireText(moduleSource, "reportRemoteEndAsync", "Realtime terminal state must end CallKit without synthesizing a local decline.");

requireText(facade, "EXPO_PUBLIC_IOS_NATIVE_CALLS_ENABLED", "The JS facade must require an explicit runtime flag.");
requireText(facade, "communication.iosNativeCallsEnabled", "The canonical communication.iosNativeCallsEnabled runtime key must be supported.");
requireText(facade, "configuredRuntimeValue === undefined", "The canonical manifest value must take precedence over a conflicting export environment value.");
requireText(appConfig, "iosNativeCallsEnabled: iosQaRuntimeVersion", "The isolated ios-qa runtime must preserve its native-call manifest gate.");
requireText(appConfig, 'internalV2OtaPlatform === "ios"', "The explicit iOS internal-v2 OTA target must preserve the compiled native-call capability.");
requireText(appConfig, "CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM must be android or ios", "Unknown internal-v2 OTA targets must fail closed.");
requireText(appConfig, "? true", "The explicit ios-qa runtime must enable only the already-compiled native-call bridge.");
for (const marker of [
  'git", ["status", "--porcelain"]',
  'git", ["ls-remote", "origin", "refs/heads/main"]',
  '"--environment",',
  '"production",',
  '`${platform}-internal-v2`',
  "CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM",
]) {
  requireText(internalV2Publisher, marker, `The internal-v2 publisher must enforce ${marker}.`);
}
requireText(internalV2Proof, 'readConfig("ios")', "The internal-v2 proof must execute the iOS publication configuration.");
requireText(internalV2Proof, 'readConfig("android")', "The internal-v2 proof must execute the Android publication configuration.");
requireText(internalV2Proof, 'readConfig("production-v2")', "The internal-v2 proof must reject an unknown publication target.");
requireText(facade, "if (!readiness.available", "PushKit registration must fail closed when build/runtime readiness is absent.");
requireText(facade, "revokeIosVoipRegistration", "The JS facade must revoke on logout/account transition.");
requireText(facade, "dispatchIosVoipIncomingCall", "The JS facade must expose incoming-only PushKit dispatch.");
requireText(facade, "const { token: _token", "Native events exposed to application listeners must omit raw tokens.");
requireText(facade, "subscribeToIosNativeCallEvents", "CallKit media consumers must receive sanitized audio-session and application-state events.");
requireText(facade, "nativeEventGeneration", "Native and cold-start events must bind the current JavaScript readiness generation.");
requireText(facade, 'clearNativeCallTransitionClaims("ios")', "Account and readiness lifecycle changes must clear only iOS in-memory native claims.");
requireText(facade, "isCurrentAccountSessionAuthority", "PushKit token registration must recheck the exact current server session generation.");
requireText(facade, "getNotificationRevocationCredential", "PushKit must reuse the device-held notification revocation credential.");
rejectText(facade, "console.", "The native-call facade must never log PushKit tokens or provider responses.");
requireText(rootLayout, "startIosNativeCallsReadiness", "Authenticated runtime must wire the native-call bridge.");
requireText(rootLayout, "createIosCallKitAnswerRouteHandler", "CallKit Answer must create a bounded claim through the canonical bridge handler.");
requireText(rootLayout, "{hideDebugOverlay ? null : <DevDebugOverlay />}", "Opaque native and foreground claim handles must never mount the debug snapshot/clipboard overlay.");
requireText(rootLayout, '"#"', "Expo Router fragment values must be treated as sensitive route material.");
requireText(rootLayout, 'normalizedValue.includes("#")', "Fragment-bearing values must be excluded from route analytics.");
requireText(rootLayout, 'pathname.split("#", 1)', "Authentication redirects must remove route fragments.");
requireText(provenance, "nativeCallClaim: created.claimId", "The canonical CallKit bridge handler must carry only the opaque one-time handle.");
requireText(provenance, "seenEventKeys", "Native event replay tombstones must survive claim expiry for the bounded process lifetime.");
requireText(provenance, "attestedNativeClaims", "Consumed native claims must carry module-private attestation.");
requireText(provenance, "attestationCapability === INTERNAL_NATIVE_CLAIM_ATTESTATION", "Only the canonical internal registry may attest consumed native claims.");
requireText(provenance, "attestationCapability === INTERNAL_FOREGROUND_INTENT_ATTESTATION", "Only the canonical internal foreground registry may attest consumed UI intents.");
requireText(provenance, "const expectedAction = normalizeText(expected.action);", "Native claim consumption must normalize a caller-supplied expected action.");
requireText(provenance, "expectedAction !== claim.action", "Native claim consumption must atomically bind the expected action with the other identities.");
requireText(provenance, "nativeCallTransitionRegistry.consume({", "Router failure must discard its exact native claim before failing CallKit Answer.");
if ((provenance.match(/nativeCallTransitionRegistry\.create\(\{/gu) ?? []).length !== 2) failures.push("Exactly one private producer per reviewed iOS and Android native source must create canonical claims.");
requireText(provenance, 'source: "ios_callkit_native_event"', "The private CallKit bridge must remain the sole iOS native claim source.");
requireText(provenance, 'source: "android_native_action_store"', "The private Android store bridge must remain the sole Android native claim source.");
rejectText(rootLayout, 'nativeCallAction: "answer"', "CallKit navigation must not carry authoritative action text.");
requireText(rootLayout, 'settleNativeTerminalAction(event, "declined")', "CallKit Decline must use a direct server-authoritative transition.");
requireText(rootLayout, 'settleNativeTerminalAction(event, "ended")', "CallKit End must use a direct server-authoritative transition.");
requireText(rootLayout, "router.replace(destination", "CallKit Answer must replace the current route for deterministic cold-start recovery.");
requireText(rootLayout, "subscribeToChillyChatCallInvite", "Caller cancel and invite terminal states must stop active CallKit UI.");
requireText(rootLayout, "reportIosNativeCallRemoteEnd", "Realtime invite terminal states must report a distinct remote CallKit end.");
requireText(rootLayout, 'event.type === "remoteEnded"', "Remote terminal VoIP actions must clear the JavaScript invite subscription.");
requireText(chatThread, "subscribeToIosNativeCallEvents", "The chat call screen must reconcile media after native audio-session activation.");
requireText(chatThread, 'event.type === "audioSessionActivated"', "The chat call screen must react to CallKit AVAudioSession activation.");
requireText(chatThread, 'event.type === "applicationActive"', "The chat call screen must restore foreground video after a native answer.");
requireText(chatThread, 'requestedNativeCallAction === "answer"', "Background audio permission must be scoped to a native Answer action.");
requireText(chatThread, "consumeMountedIosNativeCallRoute", "The mounted thread must atomically consume the exact native claim after auth readiness.");
requireText(chatThread, 'action: "answer"', "The mounted CallKit Answer consumer must supply its exact expected action.");
for (const marker of ["completeIosAcceptedNativeAnswer", "settleIosAcceptedCallKitMediaFailure", 'accepted?.status === "accepted"', "descriptor.roomId === activeCallRoomId"]) requireText(chatThread, marker, `Accepted CallKit media failure settlement requires ${marker}.`);
for (const marker of ["iosAcceptedMediaDescriptorStates", "terminateIosAcceptedNativeAnswer", "operations.readInvite", "settleIosAcceptedCallKitMediaFailure"]) requireText(nativeMediaPolicy, marker, `Accepted CallKit media policy requires ${marker}.`);
if (/callChannelState\s*===\s*["']live["'][\s\S]{0,240}completeIosNativeCallAnswer/u.test(chatThread)) failures.push("An unrelated live media channel must never complete a newly routed CallKit claim.");
requireText(chatThread, 'authority: trustedNativeCallClaim ? "trusted_native_claim" : "none"', "Route values without a consumed claim must have no authority.");
rejectText(chatThread, "requestedOpenCall", "openCall route text must not open or join call media.");
rejectText(chatThread, "requestedCallMode", "startCall route text must not create a call.");
rejectText(chatThread, "nativeCallAction: nativeCallActionParam", "The thread must not read route action text as native authority.");
requireText(nativeIntent, "sanitizeExternalIosNativeCallPath(path)", "iOS system paths must strip native action, UUID, claim, openCall, and startCall parameters.");
requireText(provenance, "fragmentParameters", "External iOS paths must remove only native-call authority from fragments.");
requireText(provenance, "safeFragment", "Authentication and recovery fragment fields must survive native-call sanitization.");
requireText(provenance, "containsSensitiveNativeCallClaimRouteParams", "Debug surfaces must fail closed while an opaque claim handle is routed.");
requireText(nativeMediaPolicy, "isAttestedForegroundAuthenticatedUiCallIntent", "Foreground route shortcuts must require a module-attested one-time intent.");
requireText(nativeMediaPolicy, "intent.inviteId === activeInviteId", "App-wide foreground open-call intent must bind the exact accepted invite.");
requireText(nativeMediaPolicy, "intent.roomId === activeRoomId", "App-wide foreground open-call intent must bind the exact active room.");
for (const marker of ["memory_only", "ttlMs", "maxActive", "maxConsumed"]) {
  requireText(read("config/assurance/native-call-transition-provenance-v1.json"), marker, `The provenance contract must bind ${marker}.`);
}
for (const forbidden of ["AsyncStorage", "UserDefaults", "SecureStore", "Math.random", "console."]) {
  rejectText(provenance, forbidden, `The in-memory claim registry must not contain ${forbidden}.`);
}
if (!provenanceCreatorAllowlistPasses(trackedProductionSources)) {
  failures.push("Production provenance creator symbols must have only their exact direct allowlisted definitions, imports, and calls.");
}
if (provenanceCreatorAllowlistPasses({
  ...trackedProductionSources,
  "components/UnsafeNativeClaimCreator.tsx": "import { createIosCallKitAnswerRouteHandler as unsafe } from '../_lib/nativeCallTransitionProvenance.mjs';\nunsafe({});\n",
})) {
  failures.push("The tracked-production creator guard did not reject an aliased iOS claim creator.");
}
if (provenanceCreatorAllowlistPasses({
  ...trackedProductionSources,
  "components/UnsafeNamespaceCreator.tsx": "import * as provenance from '../_lib/nativeCallTransitionProvenance.mjs';\nprovenance.createIosCallKitAnswerRouteHandler({});\n",
})) {
  failures.push("The tracked-production creator guard did not reject a namespace iOS claim creator.");
}
if (provenanceCreatorAllowlistPasses({
  ...trackedProductionSources,
  "components/UnsafeComputedCreator.tsx": "import * as provenance from '../_lib/nativeCallTransitionProvenance.mjs';\nprovenance['createIosCallKit' + 'AnswerRouteHandler']({});\n",
})) {
  failures.push("The tracked-production creator guard did not reject a computed iOS claim creator.");
}
requireText(communicationSession, "shouldPreserveNativeCallBackgroundAudio", "CallKit background audio must survive transient inactive/background AppState changes.");
requireText(communicationSession, 'channelStateRef.current = "live"', "An existing subscribed call channel must recover to live after foregrounding.");
requireText(communicationSession, "restoreLocalMediaAfterForeground", "Foreground recovery must restore the requested microphone and camera tracks.");
requireText(nativeMediaPolicy, "canAttemptNativeCallBackgroundAudio", "Native background-audio behavior must have an executable policy fixture.");
requireText(settings, "revokeIosVoipRegistration", "Authenticated sign-out paths must revoke VoIP registration before logout.");
requireText(callInvites, 'supabase.functions.invoke("chilly-chat-call-dispatch"', "Call creation and terminal state transitions must use the server dispatch orchestrator.");
requireText(callInvites, "action:", "Unified call-dispatch actions must be passed to the orchestrator.");
for (const profile of ["development", "preview", "production"]) {
  if (easConfig.build?.[profile]?.environment !== profile) {
    failures.push(`The ${profile} EAS build must load its matching protected environment.`);
  }
}
for (const flag of ["IOS_NATIVE_CALLS_ENABLED", "EXPO_PUBLIC_IOS_NATIVE_CALLS_ENABLED"]) {
  if (easConfig.build?.["ios-qa"]?.env?.[flag] !== "true") {
    failures.push(`The ios-qa profile must explicitly enable ${flag}.`);
  }
}
if (easConfig.build?.["ios-qa"]?.channel !== "ios-qa"
  || easConfig.build?.["ios-qa"]?.env?.IOS_QA_RUNTIME_VERSION !== "1.0.0-iosqa1") {
  failures.push("The all-flags iOS QA binary must have an isolated channel and runtime.");
}

for (const table of ["user_voip_push_tokens", "voip_push_delivery_attempts"]) {
  requireText(migration, `alter table public.\"${table}\" enable row level security`, `${table} must have RLS enabled.`);
  requireText(migration, `revoke all on table public.\"${table}\" from public, anon, authenticated`, `${table} must deny direct client access.`);
  requireText(migration, `grant all on table public.\"${table}\" to postgres, service_role`, `${table} must remain server-owned.`);
}
requireText(migration, "user_voip_push_tokens_environment_hash_unique", "VoIP token rotation must deduplicate environment/token hashes.");
requireText(migration, "voip_push_delivery_attempts_dispatch_unique", "APNs VoIP delivery must be idempotent.");
requireText(migration, "provider_status_code", "Sanitized APNs HTTP status evidence must be recorded.");
requireText(migration, "attempt_count", "Transient APNs attempts must have a bounded retry counter.");
rejectText(migration, "grant select", "Raw VoIP token tables must not gain direct client SELECT grants.");

for (const marker of [
  'add column if not exists "account_id"',
  'add column if not exists "session_generation"',
  'add column if not exists "ownership_state"',
  "whole_app_register_ios_voip_push_token",
  "whole_app_revoke_ios_voip_push_ownership",
  "whole_app_read_deliverable_ios_voip_tokens",
  "whole_app_revoke_ios_voip_on_session_delete",
  "whole_app_revoke_ios_voip_on_account_deletion",
  "whole_app_revoke_ios_voip_on_auth_restriction",
]) {
  requireText(sessionAuthorityMigration, marker, `iOS VoIP session authority closure requires ${marker}.`);
}
requireText(sessionAuthorityMigration, '"ownership_state" = \'INVALID\'', "Legacy active PushKit rows must be quarantined.");
requireText(sessionAuthorityMigration, "from auth.sessions session_row", "Deliverability must require a live exact auth session generation.");
requireText(sessionAuthorityMigration, "to service_role", "Raw deliverability readback must remain service-only.");
rejectText(sessionAuthorityMigration, 'whole_app_read_deliverable_ios_voip_tokens"(uuid)\n+  to authenticated', "Authenticated clients must never read raw PushKit delivery tokens.");

for (const source of [tokenFunction, dispatchFunction]) {
  requireText(source, ".auth.getUser()", "Every iOS VoIP Edge Function must authenticate the user JWT.");
  requireText(source, "SUPABASE_SERVICE_ROLE_KEY", "Server-owned VoIP tables must be accessed only after authentication through the backend.");
  rejectText(source, "console.", "VoIP Edge Functions must not log tokens, JWTs, provider keys, or private payloads.");
}
requireText(tokenFunction, "enforce_abuse_rate_limit", "PushKit token lifecycle writes must be rate limited.");
requireText(tokenFunction, "tokenFingerprint", "PushKit token responses must use only a non-secret fingerprint.");
requireText(tokenFunction, "whole_app_register_ios_voip_push_token", "PushKit registration must use the exact session-bound RPC.");
requireText(tokenFunction, "whole_app_revoke_ios_voip_push_ownership", "PushKit revocation must use the exact old-session credential RPC.");
rejectText(tokenFunction, '.from("user_voip_push_tokens")', "The lifecycle Edge Function must not bypass exact VoIP ownership RPCs.");
requireText(notifications, "invokePendingIosVoipRevocation", "The durable notification revocation ledger must also revoke iOS VoIP ownership.");
requireText(dispatchFunction, "runtime_disabled_pending_physical_proof", "APNs VoIP dispatch must default to a runtime-disabled result.");
requireText(voipPolicy, "IOS_VOIP_PUSH_DISPATCH_ENABLED", "APNs VoIP dispatch must require its explicit server flag.");
requireText(dispatchFunction, "IOS_VOIP_DISPATCH_ENABLED_ENV", "APNs VoIP dispatch must consume the shared explicit server flag.");
requireText(dispatchFunction, "non_incoming_uses_authoritative_state", "VoIP dispatch must reject non-incoming lifecycle actions before provider access.");
requireText(dispatchFunction, "const expiration = 0", "Incoming VoIP pushes must not be stored for stale delivery.");
requireText(dispatchFunction, "AbortSignal.timeout", "APNs transport must have a bounded timeout.");
requireText(dispatchFunction, "attempt_count", "Failed or stale APNs attempts must use bounded compare-and-swap retries.");
requireText(voipPolicy, "non_incoming_voip_payload_denied", "VoIP payload policy must deny terminal lifecycle payloads.");
for (const eligibility of [
  "thread_membership_required",
  "audience_block",
  "account_access_restricted",
  "call_preference_disabled",
  "invite_not_ringing",
  "invite_expired",
  "rate_limited",
]) {
  requireText(dispatchFunction, eligibility, `APNs VoIP dispatch must enforce ${eligibility}.`);
}
for (const header of ["apns-push-type", "apns-topic", "apns-expiration", "apns-collapse-id"]) {
  requireText(dispatchFunction, `\"${header}\"`, `APNs requests must include ${header}.`);
}
requireText(dispatchFunction, "api.sandbox.push.apple.com", "Development PushKit tokens must use Apple's APNs sandbox endpoint.");
requireText(dispatchFunction, "api.push.apple.com", "Production PushKit tokens must use Apple's APNs production endpoint.");
requireText(dispatchFunction, "isApnsInvalidVoipTokenReason", "Invalid APNs tokens must be revoked.");
requireText(dispatchFunction, "whole_app_read_deliverable_ios_voip_tokens", "APNs dispatch must read only exact current-session tokens.");
requireText(dispatchFunction, "recipientSessionGeneration", "APNs payloads must carry the exact recipient session generation for native rejection.");
requireText(dispatchFunction, "provider_status_code", "APNs delivery attempts must record the provider HTTP status without response secrets.");
requireText(dispatchFunction, "if (!await readCallPreference", "incoming VoIP presentation must honor the new-call preference");
rejectText(dispatchFunction, "authorize_chilly_chat_call_transition_retry", "terminal retry work must never enter the incoming-only VoIP dispatcher");

for (const marker of [
  "authorize_chilly_chat_call_transition_retry",
  "claim_chilly_chat_call_transition_delivery_batch",
  "complete_chilly_chat_call_transition_delivery",
  "AbortSignal.timeout",
]) {
  requireText(retryFunction, marker, `terminal retry worker must include ${marker}`);
}
rejectText(retryFunction, "console.", "terminal retry worker must not log tokens, credentials, or provider payloads.");
for (const marker of [
  "for update skip locked",
  "make_interval(secs => least(300",
  '"attempt_count" < 10',
  "chat_call_transition_delivery_failures",
  'vault."create_secret"',
  'cron."schedule"',
]) {
  requireText(retryMigration, marker, `terminal retry migration must include ${marker}`);
}
requireText(config, "[functions.chilly-chat-call-transition-retry]", "Supabase config must declare the custom-auth retry worker.");

requireText(config, "[functions.ios-voip-push-tokens]", "Supabase config must declare the authenticated token lifecycle function.");
requireText(config, "[functions.ios-voip-call-dispatch]", "Supabase config must declare the authenticated VoIP dispatch function.");
requireText(androidPlugin, "android.permission.USE_FULL_SCREEN_INTENT", "Existing Android native-call behavior must remain intact.");
requireText(androidPlugin, "ChillyChatCallNotifications", "Existing Android native-call module must remain intact.");

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}

console.log("iOS native-call policy guard passed (source/backend ready; dispatch remains controlled by the server rollout switch)." );
