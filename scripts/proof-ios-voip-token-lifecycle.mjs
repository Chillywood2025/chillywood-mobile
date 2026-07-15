import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const facade = read("_lib/iosNativeCalls.ts");
const backend = read("supabase/functions/ios-voip-push-tokens/index.ts");

assert.match(facade, /let voipLifecycleGeneration = 0;/u);
assert.match(facade, /let voipTokenLifecycleQueue: Promise<void> = Promise\.resolve\(\);/u);
assert.match(facade, /enqueueVoipTokenRegistration\(event\.token \?\? "", generation\);/u);
assert.doesNotMatch(
  facade,
  /tokenRegistrationInFlight/u,
  "a single in-flight gate would drop PushKit token rotations",
);

const revokeStart = facade.indexOf("export async function revokeIosVoipRegistration");
const revokeEnd = facade.indexOf("\nexport async function ", revokeStart + 1);
const revokeSource = facade.slice(revokeStart, revokeEnd);
assert.match(revokeSource, /\+\+voipLifecycleGeneration;/u);
assert.match(revokeSource, /voipRegistrationActive = false;/u);
assert.ok(
  revokeSource.indexOf("await waitForVoipTokenLifecycle()")
    < revokeSource.indexOf("return revokeBackendVoipRegistration()"),
  "logout must drain already-issued registration requests before the final revoke",
);

assert.match(
  facade,
  /\(event\) => handleNativeEvent\(event, generation\)/u,
  "native token events must remain bound to the lifecycle that created the listener",
);
assert.doesNotMatch(facade, /console\./u);
assert.doesNotMatch(
  facade,
  /AsyncStorage\.setItem\([^\n]*(?:token|Token)/u,
  "raw PushKit tokens must never be persisted in client storage",
);

const statusBranch = backend.indexOf('if (action === "status")');
const revokeBranch = backend.indexOf('if (action === "revoke")');
const restrictionCheck = backend.indexOf('"is_account_access_restricted"');
const rateLimitCall = backend.indexOf("if (!await enforceTokenRateLimit", restrictionCheck);
const tokenValidation = backend.indexOf("const token = toText(body.token)", rateLimitCall);

assert.ok(statusBranch > 0 && revokeBranch > statusBranch);
assert.ok(
  restrictionCheck > revokeBranch,
  "authenticated restricted accounts must still be able to read status and revoke",
);
assert.ok(
  rateLimitCall > restrictionCheck && tokenValidation > rateLimitCall,
  "account restrictions and rate limits must still precede register/rotate writes",
);
assert.match(backend, /eq\("user_id", userId\)/u);
assert.match(backend, /eq\("install_id", installId\)/u);
assert.match(backend, /revokedCount: data\?\.length \?\? 0, status: "revoked"/u);
assert.doesNotMatch(backend, /console\./u);

console.log(
  "iOS VoIP token lifecycle proof passed (ordered rotations, logout drain, restricted-account revoke/status).",
);
