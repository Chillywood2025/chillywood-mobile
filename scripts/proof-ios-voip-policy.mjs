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

const presentationAckToken = "A".repeat(43);
const presentationAckUrl = "https://example.supabase.co/functions/v1/ios-voip-call-dispatch";
const presentationAttemptId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const payload = buildIosVoipApnsPayload({
  callInviteId: "11111111-2222-4333-8444-555555555555",
  callerName: "Bounded Test Caller",
  callType: "video",
  expiresAt: "2026-07-15T16:30:00.000Z",
  presentationAckToken,
  presentationAckUrl,
  presentationAttemptId,
  recipientAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  recipientInstallId: "install-authority-1",
  recipientSessionGeneration: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  recipientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  threadId: "thread with spaces",
});
assert.deepEqual(payload.aps, { "content-available": 1 });
assert.equal(payload.action, "incoming");
assert.equal(payload.callType, "video");
assert.equal(payload.callUuid, payload.callInviteId);
assert.equal(payload.recipientAccountId, payload.recipientUserId);
assert.equal(payload.recipientInstallId, "install-authority-1");
assert.equal(payload.recipientSessionGeneration, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
assert.equal(payload.presentationAckToken, presentationAckToken);
assert.equal(payload.presentationAckUrl, presentationAckUrl);
assert.equal(payload.presentationAttemptId, presentationAttemptId);
assert.match(payload.path, /^\/chat\/thread%20with%20spaces\?callInviteId=/u);
assert.equal("token" in payload, false, "APNs payload must never contain the raw destination token");
assert.equal("camera" in payload, false, "incoming-call payload must never activate a camera");
for (const action of ["cancel", "declined", "end", "missed", "timeout"]) {
  assert.throws(
    () => buildIosVoipApnsPayload({
      action,
      callInviteId: payload.callInviteId,
      callType: "video",
      presentationAckToken,
      presentationAckUrl,
      presentationAttemptId,
      recipientAccountId: payload.recipientAccountId,
      recipientInstallId: payload.recipientInstallId,
      recipientSessionGeneration: payload.recipientSessionGeneration,
      recipientUserId: payload.recipientUserId,
      threadId: "thread with spaces",
    }),
    /non_incoming_voip_payload_denied/u,
    `${action}: terminal lifecycle must never synthesize a second iOS VoIP call`,
  );
}
assert.throws(() => buildIosVoipApnsPayload({ callInviteId: "", threadId: "" }), /invalid_voip_payload_scope/u);
assert.throws(() => buildIosVoipApnsPayload({
  callInviteId: payload.callInviteId,
  recipientAccountId: "wrong-account",
  recipientInstallId: payload.recipientInstallId,
  recipientSessionGeneration: payload.recipientSessionGeneration,
  recipientUserId: payload.recipientUserId,
  threadId: payload.threadId,
}), /invalid_voip_payload_scope/u, "provider payload identity must require an exact account/user binding");
for (const invalidAckScope of [
  { presentationAckToken: "short" },
  { presentationAttemptId: "not-a-uuid" },
  { presentationAckUrl: "http://example.test/functions/v1/ios-voip-call-dispatch" },
  { presentationAckUrl: "https://user@example.test/functions/v1/ios-voip-call-dispatch" },
  { presentationAckUrl: "https://example.test/functions/v1/ios-voip-call-dispatch?secret=1" },
  { presentationAckUrl: "https://example.test/functions/v1/not-the-dispatcher" },
]) {
  assert.throws(
    () => buildIosVoipApnsPayload({
      ...payload,
      ...invalidAckScope,
      action: "incoming",
    }),
    /invalid_voip_presentation_ack_scope/u,
    "CallKit presentation acknowledgement scope must fail closed",
  );
}

for (const reason of ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"]) {
  assert.equal(isApnsInvalidVoipTokenReason(reason), true, `${reason} must revoke a token`);
}
assert.equal(isApnsInvalidVoipTokenReason("TooManyRequests"), false);
assert.equal(sanitizeApnsProviderReason("Bad Device Token!"), "Bad_Device_Token_");

console.log("iOS VoIP policy proof passed (runtime disabled by default, exact presentation acknowledgement, session-bound incoming-only payload, invalid-token revocation)." );
