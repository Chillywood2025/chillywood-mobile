import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const failures = [];
const requireText = (source, marker, message) => {
  if (!source.includes(marker)) failures.push(message);
};
const rejectText = (source, marker, message) => {
  if (source.includes(marker)) failures.push(message);
};

const plugin = read("plugins/withChillyChatIosNativeCalls.js");
const coordinator = read("modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift");
const moduleSource = read("modules/chillywood-native-calls/ios/ChillywoodNativeCallsModule.swift");
const facade = read("_lib/iosNativeCalls.ts");
const rootLayout = read("app/_layout.tsx");
const settings = read("app/settings.tsx");
const callInvites = read("_lib/chillyChatCalls.ts");
const easConfig = JSON.parse(read("eas.json"));
const migration = read("supabase/migrations/20260715150522_ios_voip_push_token_foundation.sql");
const tokenFunction = read("supabase/functions/ios-voip-push-tokens/index.ts");
const dispatchFunction = read("supabase/functions/ios-voip-call-dispatch/index.ts");
const voipPolicy = read("supabase/functions/_shared/ios-voip-policy.mjs");
const config = read("supabase/config.toml");
const androidPlugin = read("plugins/withChillyChatNativeCallNotifications.js");

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
requireText(coordinator, "completion?(error)", "PushKit completion must wait for CallKit reporting.");
requireText(coordinator, "#if DEBUG", "The local CallKit trigger must compile only in debug builds.");
rejectText(coordinator, "AVCapture", "The native incoming-call bridge must not activate a camera before answer.");
requireText(moduleSource, "stopVoipRegistrationAsync", "The native bridge must support logout/account-transition teardown.");
requireText(moduleSource, "completeAnswerAsync", "The native bridge must acknowledge CallKit answer only after media connection.");
requireText(moduleSource, "reportRemoteEndAsync", "Realtime terminal state must end CallKit without synthesizing a local decline.");

requireText(facade, "EXPO_PUBLIC_IOS_NATIVE_CALLS_ENABLED", "The JS facade must require an explicit runtime flag.");
requireText(facade, "communication.iosNativeCallsEnabled", "The canonical communication.iosNativeCallsEnabled runtime key must be supported.");
requireText(facade, "if (!readiness.available", "PushKit registration must fail closed when build/runtime readiness is absent.");
requireText(facade, "revokeIosVoipRegistration", "The JS facade must revoke on logout/account transition.");
requireText(facade, "dispatchIosVoipIncomingCall", "The JS facade must expose incoming-only PushKit dispatch.");
requireText(facade, "const { token: _token", "Native events exposed to application listeners must omit raw tokens.");
rejectText(facade, "console.", "The native-call facade must never log PushKit tokens or provider responses.");
requireText(rootLayout, "startIosNativeCallsReadiness", "Authenticated runtime must wire the native-call bridge.");
requireText(rootLayout, "nativeCallAction: action", "Sanitized CallKit answer and decline events must use the existing authorized chat route.");
requireText(rootLayout, "subscribeToChillyChatCallInvite", "Caller cancel and invite terminal states must stop active CallKit UI.");
requireText(rootLayout, "reportIosNativeCallRemoteEnd", "Realtime invite terminal states must report a distinct remote CallKit end.");
requireText(rootLayout, 'event.type === "remoteEnded"', "Remote terminal VoIP actions must clear the JavaScript invite subscription.");
requireText(settings, "revokeIosVoipRegistration", "Authenticated sign-out paths must revoke VoIP registration before logout.");
requireText(callInvites, 'supabase.functions.invoke("ios-voip-call-dispatch"', "Authorized call creation must reach the fail-closed VoIP dispatch backend from every caller platform.");
requireText(callInvites, "body: { inviteId: normalizedInviteId }", "VoIP dispatch must remain incoming-only.");
rejectText(callInvites, 'body: { action, inviteId', "Terminal call state must never use a second VoIP push.");
for (const profile of ["development", "preview", "production"]) {
  if (easConfig.build?.[profile]?.environment !== profile) {
    failures.push(`The ${profile} EAS build must load its matching protected environment.`);
  }
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

for (const source of [tokenFunction, dispatchFunction]) {
  requireText(source, ".auth.getUser()", "Every iOS VoIP Edge Function must authenticate the user JWT.");
  requireText(source, "SUPABASE_SERVICE_ROLE_KEY", "Server-owned VoIP tables must be accessed only after authentication through the backend.");
  rejectText(source, "console.", "VoIP Edge Functions must not log tokens, JWTs, provider keys, or private payloads.");
}
requireText(tokenFunction, "enforce_abuse_rate_limit", "PushKit token lifecycle writes must be rate limited.");
requireText(tokenFunction, "token_fingerprint", "PushKit token responses must use only a non-secret fingerprint.");
requireText(dispatchFunction, "runtime_disabled_pending_physical_proof", "APNs VoIP dispatch must default to a runtime-disabled result.");
requireText(voipPolicy, "IOS_VOIP_PUSH_DISPATCH_ENABLED", "APNs VoIP dispatch must require its explicit server flag.");
requireText(dispatchFunction, "IOS_VOIP_DISPATCH_ENABLED_ENV", "APNs VoIP dispatch must consume the shared explicit server flag.");
rejectText(dispatchFunction, "normalizeIosVoipAction", "VoIP dispatch must not accept terminal actions.");
requireText(dispatchFunction, "const expiration = 0", "Incoming VoIP pushes must not be stored for stale delivery.");
requireText(dispatchFunction, "AbortSignal.timeout", "APNs transport must have a bounded timeout.");
requireText(dispatchFunction, "attempt_count", "Failed or stale APNs attempts must use bounded compare-and-swap retries.");
rejectText(voipPolicy, "normalizeIosVoipAction", "VoIP payload policy must be incoming-only.");
requireText(voipPolicy, "terminal_voip_payload_forbidden", "VoIP payload policy must reject cancel/end/timeout actions.");
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
requireText(dispatchFunction, "provider_status_code", "APNs delivery attempts must record the provider HTTP status without response secrets.");

requireText(config, "[functions.ios-voip-push-tokens]", "Supabase config must declare the authenticated token lifecycle function.");
requireText(config, "[functions.ios-voip-call-dispatch]", "Supabase config must declare the authenticated VoIP dispatch function.");
requireText(androidPlugin, "android.permission.USE_FULL_SCREEN_INTENT", "Existing Android native-call behavior must remain intact.");
requireText(androidPlugin, "ChillyChatCallNotifications", "Existing Android native-call module must remain intact.");

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}

console.log("iOS native-call policy guard passed (source/backend ready; runtime dispatch remains disabled)." );
