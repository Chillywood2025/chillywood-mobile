import assert from "node:assert/strict";

import {
  buildIosVoipApnsPayload,
  buildIosVoipTopic,
  isApnsInvalidVoipTokenReason,
  isIosVoipDispatchExplicitlyEnabled,
  normalizeApnsEnvironment,
  sanitizeApnsProviderReason,
} from "../supabase/functions/_shared/ios-voip-policy.mjs";

for (const value of [undefined, null, "", "0", "false", "disabled", "TRUE-ish"]) {
  assert.equal(isIosVoipDispatchExplicitlyEnabled(value), false, `dispatch must fail closed for ${String(value)}`);
}
for (const value of ["1", "true", "TRUE", "yes", "on"]) {
  assert.equal(isIosVoipDispatchExplicitlyEnabled(value), true, `dispatch should accept explicit enabled value ${value}`);
}

assert.equal(normalizeApnsEnvironment("production"), "production");
assert.equal(normalizeApnsEnvironment("development"), "development");
assert.equal(normalizeApnsEnvironment("unexpected"), "development");
assert.equal(buildIosVoipTopic("com.chillywood.mobile"), "com.chillywood.mobile.voip");
assert.equal(buildIosVoipTopic(""), "");

const payload = buildIosVoipApnsPayload({
  callInviteId: "11111111-2222-4333-8444-555555555555",
  callerName: "Bounded Test Caller",
  callType: "video",
  expiresAt: "2026-07-15T16:30:00.000Z",
  threadId: "thread with spaces",
});
assert.deepEqual(payload.aps, { "content-available": 1 });
assert.equal(payload.action, "incoming");
assert.equal(payload.callType, "video");
assert.equal(payload.callUuid, payload.callInviteId);
assert.match(payload.path, /^\/chat\/thread%20with%20spaces\?callInviteId=/u);
assert.equal("token" in payload, false, "APNs payload must never contain the raw destination token");
assert.equal("camera" in payload, false, "incoming-call payload must never activate a camera");
assert.throws(() => buildIosVoipApnsPayload({
  action: "cancel",
  callInviteId: payload.callInviteId,
  callType: "video",
  threadId: "thread with spaces",
}), /terminal_voip_payload_forbidden/u, "terminal state must never use a second VoIP push");
assert.throws(() => buildIosVoipApnsPayload({ callInviteId: "", threadId: "" }), /invalid_voip_payload_scope/u);

for (const reason of ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"]) {
  assert.equal(isApnsInvalidVoipTokenReason(reason), true, `${reason} must revoke a token`);
}
assert.equal(isApnsInvalidVoipTokenReason("TooManyRequests"), false);
assert.equal(sanitizeApnsProviderReason("Bad Device Token!"), "Bad_Device_Token_");

console.log("iOS VoIP policy proof passed (runtime disabled by default, scoped APNs payload, invalid-token revocation)." );
