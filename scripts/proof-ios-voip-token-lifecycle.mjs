import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const facade = read("_lib/iosNativeCalls.ts");
const notifications = read("_lib/notifications.ts");
const backend = read("supabase/functions/ios-voip-push-tokens/index.ts");
const dispatch = read("supabase/functions/ios-voip-call-dispatch/index.ts");
const coordinator = read("modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift");
const migration = read("supabase/migrations/202608250003_ios_voip_session_authority_closure.sql");

assert.match(facade, /let voipLifecycleGeneration = 0;/u);
assert.match(facade, /let voipTokenLifecycleQueue: Promise<void> = Promise\.resolve\(\);/u);
assert.match(facade, /enqueueVoipTokenRegistration\(event\.token \?\? "", generation, context\);/u);
assert.match(facade, /isCurrentAccountSessionAuthority\(context\.authority\)/u);
assert.match(facade, /authority\.restoreOnly/u);
assert.match(facade, /context\.authority\.sessionGeneration/u);
assert.match(facade, /context\.authority\.accountId/u);
assert.match(facade, /getNotificationInstallId\(\)/u);
assert.match(facade, /getNotificationRevocationCredential\(\)/u);
assert.doesNotMatch(facade, /tokenRegistrationInFlight/u, "a single in-flight gate would drop PushKit token rotations");
assert.doesNotMatch(facade, /console\./u);
assert.doesNotMatch(
  facade,
  /AsyncStorage\.setItem\([^\n]*(?:token|Token)/u,
  "raw PushKit tokens must never be persisted in client storage",
);

const revokeStart = facade.indexOf("export async function revokeIosVoipRegistration");
const revokeEnd = facade.indexOf("\nexport async function ", revokeStart + 1);
const revokeSource = facade.slice(revokeStart, revokeEnd);
assert.match(revokeSource, /\+\+voipLifecycleGeneration;/u);
assert.match(revokeSource, /voipAuthorityContext = null;/u);
assert.ok(
  revokeSource.indexOf("await waitForVoipTokenLifecycle()")
    < revokeSource.indexOf('revokeBackendVoipRegistration(context, "auth_loss")'),
  "logout must drain already-issued registrations before its exact old-session revoke",
);

assert.match(
  facade,
  /startVoipRegistrationAsync\([\s\S]*context\.authority\.userId,[\s\S]*context\.authority\.accountId,[\s\S]*context\.authority\.sessionGeneration,[\s\S]*context\.installId/u,
  "native PushKit readiness must persist the exact account/session/install authority",
);

assert.match(notifications, /export const getNotificationInstallId/u);
assert.match(notifications, /export const getNotificationRevocationCredential/u);
assert.match(notifications, /invokePendingIosVoipRevocation/u);
assert.match(notifications, /entry\.platform === "ios"/u);
assert.match(notifications, /apnsEnvironment: "all"/u);

const revokeBranch = backend.indexOf('if (action === "revoke")');
const authBranch = backend.indexOf("const auth = await readAuthenticatedContext(req)");
assert.ok(revokeBranch > 0 && authBranch > revokeBranch, "exact credential revocation must survive JWT teardown");
assert.match(backend, /whole_app_revoke_ios_voip_push_ownership/u);
assert.match(backend, /whole_app_register_ios_voip_push_token/u);
assert.match(backend, /whole_app_ios_voip_push_readback/u);
assert.match(backend, /p_expected_account_id: binding\.accountId/u);
assert.match(backend, /p_session_generation: binding\.sessionGeneration/u);
assert.match(backend, /p_revocation_credential_hash: await sha256Hex\(binding\.revocationCredential\)/u);
assert.doesNotMatch(backend, /\.from\("user_voip_push_tokens"\)/u, "the lifecycle edge must not bypass exact RPC authority");
assert.doesNotMatch(backend, /console\./u);

assert.match(dispatch, /wave1_session_authority_readback/u);
assert.match(dispatch, /whole_app_read_deliverable_ios_voip_tokens/u);
assert.match(dispatch, /recipientSessionGeneration: tokenRow\.session_generation/u);
assert.match(dispatch, /recipientInstallId: tokenRow\.install_id/u);
assert.doesNotMatch(
  dispatch,
  /\.from\("user_voip_push_tokens"\)[\s\S]{0,240}\.select/u,
  "dispatch must not select raw tokens without the exact deliverability RPC",
);

for (const marker of [
  'add column if not exists "account_id"',
  'add column if not exists "session_generation"',
  'add column if not exists "ownership_state"',
  "legacy rows are quarantined",
  '"ownership_state" = \'INVALID\'',
  "whole_app_revoke_ios_voip_on_session_delete",
  "whole_app_revoke_ios_voip_on_account_deletion",
  "whole_app_revoke_ios_voip_on_auth_restriction",
]) {
  assert.match(migration, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
}
assert.match(migration, /and exists \([\s\S]*from auth\.sessions session_row[\s\S]*session_row\.id = token_row\."session_generation"/u);
assert.match(migration, /grant execute on function public\."whole_app_read_deliverable_ios_voip_tokens"\(uuid\)[\s\S]*to service_role/u);
assert.doesNotMatch(migration, /grant execute on function public\."whole_app_read_deliverable_ios_voip_tokens"\(uuid\)[\s\S]{0,80}authenticated/u);

assert.match(coordinator, /NativeVoipAuthority: Codable, Equatable/u);
assert.match(coordinator, /persistedVoipAuthority\(\)/u);
assert.match(coordinator, /voipPayloadMatchesPersistedAuthority/u);
assert.match(coordinator, /resetAccountContextOnMain\(\)/u);
assert.match(coordinator, /UserDefaults\.standard\.removeObject\(forKey: self\.voipAuthorityDefaultsKey\)/u);
assert.match(coordinator, /recipientSessionGeneration/u);
assert.match(coordinator, /recipientInstallId/u);

console.log(
  "iOS VoIP session-authority proof passed (exact registration, durable revoke, deliverability filtering, native account reset).",
);
