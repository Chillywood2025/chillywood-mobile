import {
  hasExactChatCallTelemetryIdentity,
  resolveChatCallTelemetryBinding,
} from "./chat-call-telemetry-authority.ts";

const CALL_INVITE_ID = "11111111-1111-4111-8111-111111111111";
const THREAD_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_USER_ID = "44444444-4444-4444-8444-444444444444";
const ROOM_ID = "CHILLY-CALL-ROOM-123";

const acceptedInvite = {
  accepted_at: "2026-07-29T20:00:00.000Z",
  callee_user_id: OTHER_USER_ID,
  caller_user_id: USER_ID,
  chat_call_media_provider: "livekit",
  communication_room_id: ROOM_ID,
  thread_id: THREAD_ID,
};

Deno.test("derives the authoritative room when privacy strips an internal room id", () => {
  const result = resolveChatCallTelemetryBinding({
    appUserId: USER_ID,
    callInviteId: CALL_INVITE_ID,
    clientCommunicationRoomId: "",
    invite: acceptedInvite,
    threadId: THREAD_ID,
  });

  if (!result.corroborated) {
    throw new Error("expected exact binding corroboration");
  }
  if (result.authoritativeCommunicationRoomId !== ROOM_ID) {
    throw new Error("expected the authoritative invite room");
  }
});

Deno.test("accepts a matching bounded client room hint", () => {
  const result = resolveChatCallTelemetryBinding({
    appUserId: OTHER_USER_ID,
    callInviteId: CALL_INVITE_ID.toUpperCase(),
    clientCommunicationRoomId: ROOM_ID.toLowerCase(),
    invite: acceptedInvite,
    threadId: THREAD_ID.toUpperCase(),
  });

  if (!result.corroborated) {
    throw new Error("expected the matching room hint to pass");
  }
  if (result.callInviteId !== CALL_INVITE_ID || result.threadId !== THREAD_ID) {
    throw new Error("expected canonical UUID bindings");
  }
});

Deno.test("rejects a conflicting client room hint", () => {
  const result = resolveChatCallTelemetryBinding({
    appUserId: USER_ID,
    callInviteId: CALL_INVITE_ID,
    clientCommunicationRoomId: "DIFFERENT-ROOM",
    invite: acceptedInvite,
    threadId: THREAD_ID,
  });

  if (result.corroborated) {
    throw new Error("conflicting room binding must fail closed");
  }
});

Deno.test("rejects nonparticipants, authority gaps, and invalid identities", () => {
  const fixtures = [
    {
      appUserId: "55555555-5555-4555-8555-555555555555",
      callInviteId: CALL_INVITE_ID,
      invite: acceptedInvite,
      threadId: THREAD_ID,
    },
    {
      appUserId: USER_ID,
      callInviteId: CALL_INVITE_ID,
      invite: { ...acceptedInvite, accepted_at: null },
      threadId: THREAD_ID,
    },
    {
      appUserId: USER_ID,
      callInviteId: "not-an-invite",
      invite: acceptedInvite,
      threadId: THREAD_ID,
    },
    {
      appUserId: USER_ID,
      callInviteId: CALL_INVITE_ID,
      invite: { ...acceptedInvite, chat_call_media_provider: "legacy_webrtc" },
      threadId: THREAD_ID,
    },
  ];

  for (const fixture of fixtures) {
    const result = resolveChatCallTelemetryBinding({
      ...fixture,
      clientCommunicationRoomId: "",
    });
    if (result.corroborated) {
      throw new Error("invalid authority fixture must fail closed");
    }
  }

  if (hasExactChatCallTelemetryIdentity("not-an-invite", THREAD_ID)) {
    throw new Error("invalid invite identity must be rejected before lookup");
  }
});
