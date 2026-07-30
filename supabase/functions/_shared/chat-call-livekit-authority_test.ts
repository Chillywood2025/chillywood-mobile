import {
  resolveChatCallLiveKitAuthority,
  type ChatCallLiveKitAuthorityInput,
} from "./chat-call-livekit-authority.ts";

const CALLER = "11111111-1111-4111-8111-111111111111";
const CALLEE = "22222222-2222-4222-8222-222222222222";
const THIRD = "33333333-3333-4333-8333-333333333333";

const baseInput = (): ChatCallLiveKitAuthorityInput => ({
  activeMemberships: [
    { role: "host", userId: CALLER },
    { role: "participant", userId: CALLEE },
  ],
  invite: {
    acceptedAt: "2026-07-28T12:00:00.000Z",
    callType: "video",
    calleeUserId: CALLEE,
    callerUserId: CALLER,
    communicationRoomId: "CHATLK1",
    endedAt: "",
    mediaProvider: "livekit",
    status: "accepted",
    threadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  },
  requestedCallType: "video",
  requestedMediaProvider: "livekit",
  requestedThreadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  roomActiveRoomId: "CHATLK1",
  roomCallType: "video",
  roomName: "CHATLK1",
  roomThreadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  threadMemberIds: [CALLER, CALLEE],
  userId: CALLER,
});

const assertEquals = (actual: unknown, expected: unknown, label: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

const deny = (
  label: string,
  mutate: (input: ChatCallLiveKitAuthorityInput) => void,
  expectedError: string,
) => {
  Deno.test(label, () => {
    const input = baseInput();
    mutate(input);
    const result = resolveChatCallLiveKitAuthority(input);
    assertEquals(result.ok, false, label);
    assertEquals(result.ok ? null : result.error, expectedError, label);
  });
};

for (const status of ["ringing", "declined", "canceled", "missed", "busy", "ended"]) {
  deny(
    `chat-call token is denied for ${status} invite`,
    (input) => {
      input.invite.status = status;
      input.invite.acceptedAt = "";
    },
    "chat_call_authority_mismatch",
  );
}

deny(
  "chat-call token is denied after end timestamp",
  (input) => {
    input.invite.endedAt = "2026-07-28T12:01:00.000Z";
  },
  "chat_call_authority_mismatch",
);

deny(
  "chat-call token is denied to non-participant",
  (input) => {
    input.userId = THIRD;
  },
  "chat_call_authority_mismatch",
);

deny(
  "chat-call token is denied for unrelated thread",
  (input) => {
    input.requestedThreadId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  },
  "chat_call_authority_mismatch",
);

deny(
  "chat-call token is denied for unrelated active room",
  (input) => {
    input.roomActiveRoomId = "OTHER1";
  },
  "chat_call_authority_mismatch",
);

deny(
  "chat-call token is denied when call type differs",
  (input) => {
    input.requestedCallType = "voice";
  },
  "chat_call_authority_mismatch",
);

deny(
  "chat-call token is denied to legacy provider call",
  (input) => {
    input.invite.mediaProvider = "legacy_webrtc";
  },
  "chat_call_authority_mismatch",
);

deny(
  "chat-call token is denied without fresh active membership",
  (input) => {
    input.activeMemberships = input.activeMemberships.filter(
      (membership) => membership.userId !== CALLER,
    );
  },
  "insufficient_role",
);

deny(
  "chat-call token is denied when direct-thread membership differs",
  (input) => {
    input.threadMemberIds = [CALLER, THIRD];
  },
  "chat_call_exact_membership_required",
);

deny(
  "chat-call token is denied when a third active room participant exists",
  (input) => {
    input.activeMemberships.push({ role: "participant", userId: THIRD });
  },
  "chat_call_third_participant_denied",
);

Deno.test("accepted exact caller receives publish, subscribe, and data grants", () => {
  const result = resolveChatCallLiveKitAuthority(baseInput());
  assertEquals(result.ok, true, "accepted caller");
  if (!result.ok) return;
  assertEquals(result.participantRole, "speaker", "accepted caller role");
  assertEquals(result.grants, {
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
    roomJoin: true,
  }, "accepted caller grants");
});

Deno.test("accepted exact callee receives the same authority", () => {
  const input = baseInput();
  input.userId = CALLEE;
  const result = resolveChatCallLiveKitAuthority(input);
  assertEquals(result.ok, true, "accepted callee");
  assertEquals(result.ok ? result.participantRole : null, "speaker", "accepted callee role");
});
